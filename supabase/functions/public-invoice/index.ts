// functions/public-invoice/index.ts — M28. The NO-AUTH hosted pay page backend.
// verify_jwt = false: a client opening a pay link has no session. Authorization is
// the unguessable public_token in the body — the service role returns ONLY that one
// invoice's safe fields (never a workspace scan, never contact PII beyond a display
// name). Three actions: view the invoice, accept an estimate, or create a
// PaymentIntent for the (possibly partial) balance. No cross-tenant surface: a token
// resolves to exactly one row.
//
// Contract:  POST /functions/v1/public-invoice
//   { "token":"<public_token>", "action":"view" }            → invoice + brand
//   { "token":"<public_token>", "action":"accept" }          → estimate → invoice
//   { "token":"<public_token>", "action":"intent", "amount":<minor>? } → { client_secret }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { serviceClient } from "../_shared/auth.ts";
import { getVaultSecret, stripePost, StripeError, STRIPE_KEY_SECRET } from "../_shared/stripe.ts";

// Only these invoice fields ever reach the public page (no internal notes, no
// contact PII, no stripe ids beyond what the Payment Element needs).
const SAFE = "id, workspace_id, contact_id, kind, number, currency, line_items, discount, discount_total, subtotal, tax, tax_rate, total, amount_paid, status, due_date, notes, public_token";

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    const { token, action = "view", amount } = (await req.json().catch(() => ({}))) ?? {};
    if (!token) return err(400, "bad_request", "token is required");

    const svc = serviceClient();
    const { data: inv } = await svc.from("invoices").select(SAFE).eq("public_token", token).maybeSingle();
    if (!inv) return err(404, "not_found", "This link is invalid or has expired");

    // Workspace display name + contact first name for the branded header (no PII beyond that).
    const { data: ws } = await svc.from("workspaces").select("name, settings").eq("id", inv.workspace_id).maybeSingle();
    let payerName: string | null = null;
    if (inv.contact_id) {
      const { data: c } = await svc.from("contacts").select("first_name").eq("id", inv.contact_id).maybeSingle();
      payerName = c?.first_name ?? null;
    }
    const brand = { name: ws?.name ?? "Invoice", logo_url: ws?.settings?.branding?.logo_url ?? null };
    const safeInvoice = { ...inv, workspace_id: undefined, contact_id: undefined }; // strip ids from the wire

    if (action === "view") {
      return ok({ invoice: safeInvoice, brand, payer_name: payerName });
    }

    if (action === "accept") {
      if (inv.kind !== "estimate") return err(409, "not_an_estimate", "This is not an estimate");
      const { data: row, error } = await svc.rpc("accept_estimate", { p_ws: inv.workspace_id, p_invoice: inv.id });
      if (error) return err(500, "accept_failed", error.message);
      return ok({ accepted: true, number: row?.number ?? null });
    }

    if (action === "intent") {
      if (inv.status === "void") return err(409, "invoice_void", "This invoice is void");
      const balance = Math.max(0, (inv.total ?? 0) - (inv.amount_paid ?? 0));
      const want = Number.isFinite(amount) && amount > 0 ? Math.min(Math.round(amount), balance) : balance;
      if (want <= 0) return err(409, "already_paid", "This invoice is already paid in full");

      const key = await getVaultSecret(svc, STRIPE_KEY_SECRET);
      if (!key) return err(409, "stripe_unconfigured", "Online payment is not enabled for this invoice yet");

      const { data: integ } = await svc.from("integrations")
        .select("config").eq("provider", "stripe").eq("workspace_id", inv.workspace_id).maybeSingle();
      const account: string | undefined = integ?.config?.account_id ?? undefined;
      const appFee = Number(integ?.config?.application_fee_amount ?? 0) || 0;

      const pi = await stripePost(key, "/payment_intents", {
        amount: want,
        currency: String(inv.currency || "usd").toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata: { workspace_id: inv.workspace_id, invoice_id: inv.id, kind: "invoice_payment" },
        ...(appFee > 0 ? { application_fee_amount: appFee } : {}),
      }, { account, idempotencyKey: `pi_${inv.id}_${want}` });

      return ok({ client_secret: pi.client_secret, amount: want, currency: inv.currency });
    }

    return err(400, "bad_action", "Unknown action");
  } catch (e) {
    if (e instanceof StripeError) return err(502, "stripe_error", e.message);
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
