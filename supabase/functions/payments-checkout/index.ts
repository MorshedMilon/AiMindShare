// functions/payments-checkout/index.ts — M28. Create a Stripe Checkout Session /
// payment link for an invoice (the "pay now" button + shareable link). verify_jwt =
// true: a signed-in staff+ member of the invoice's workspace. The Stripe secret key
// lives in Vault (Law 3, D-028) — never the browser; we read it server-side and call
// the REST API. Charges run on the workspace's CONNECTED account when one exists
// (Standard Connect, D-075) so funds never touch the platform; application_fee_amount
// is parameterized and DEFAULT 0 (the M42 hook, present-but-zero per the accept
// criteria). Idempotency-Key guards the double-click.
//
// Contract:  POST /functions/v1/payments-checkout   Bearer <jwt>
//   body { "workspace_id":"<uuid>", "invoice_id":"<uuid>", "return_url":"<abs url>"? }
//   200 { ok:true, data:{ url, checkout_id } }
//   400 bad_request · 401 unauthorized · 403 forbidden · 404 not_found ·
//   409 stripe_unconfigured · 502 stripe_error
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { authUser, userClient, serviceClient, hasRole } from "../_shared/auth.ts";
import { getVaultSecret, stripePost, StripeError, STRIPE_KEY_SECRET } from "../_shared/stripe.ts";

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    const user = await authUser(req);
    if (!user) return err(401, "unauthorized", "No valid session");

    const { workspace_id, invoice_id, return_url } = (await req.json().catch(() => ({}))) ?? {};
    if (!workspace_id || !invoice_id) return err(400, "bad_request", "workspace_id and invoice_id are required");

    // Law 2: re-check membership for THIS caller on THIS workspace (staff+).
    if (!(await hasRole(userClient(req), workspace_id, "staff"))) {
      return err(403, "forbidden", "Not a member of this workspace");
    }

    const svc = serviceClient();
    const { data: inv } = await svc.from("invoices")
      .select("id, workspace_id, number, currency, total, amount_paid, status, public_token")
      .eq("id", invoice_id).eq("workspace_id", workspace_id).maybeSingle();
    if (!inv) return err(404, "not_found", "Invoice not found");
    if (inv.status === "void") return err(409, "invoice_void", "This invoice is void");

    const due = Math.max(0, (inv.total ?? 0) - (inv.amount_paid ?? 0));
    if (due <= 0) return err(409, "already_paid", "This invoice is already paid in full");

    const key = await getVaultSecret(svc, STRIPE_KEY_SECRET);
    if (!key) return err(409, "stripe_unconfigured", "Stripe is not connected for this workspace yet");

    // Standard Connect: charge on the workspace's connected account when present
    // (D-075). Scaffold — the connected acct id is read from the M41 integrations
    // row (provider='stripe', config.account_id). Absent → platform account.
    const { data: integ } = await svc.from("integrations")
      .select("config").eq("provider", "stripe").eq("workspace_id", workspace_id).maybeSingle();
    const account: string | undefined = integ?.config?.account_id ?? undefined;
    const appFee = Number(integ?.config?.application_fee_amount ?? 0) || 0; // M42 hook, default 0

    const base = String(return_url || req.headers.get("origin") || "").replace(/\/$/, "");
    const payPage = `${base}/pay/${inv.public_token}`;

    const session = await stripePost(key, "/checkout/sessions", {
      mode: "payment",
      success_url: `${payPage}?paid=1`,
      cancel_url: payPage,
      client_reference_id: workspace_id,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: String(inv.currency || "usd").toLowerCase(),
          unit_amount: due,
          product_data: { name: `Invoice ${inv.number ?? ""}`.trim() },
        },
      }],
      // metadata rides through to the webhook → record_invoice_payment (D-070).
      metadata: { workspace_id, invoice_id, kind: "invoice_payment" },
      payment_intent_data: {
        metadata: { workspace_id, invoice_id, kind: "invoice_payment" },
        ...(appFee > 0 ? { application_fee_amount: appFee } : {}),
      },
    }, { account, idempotencyKey: `checkout_${invoice_id}_${due}` });

    // Record the session + mark the invoice sent (idempotent-ish; the webhook is the
    // source of truth for 'paid').
    await svc.from("invoices").update({
      stripe_checkout_id: session.id,
      status: inv.status === "draft" ? "sent" : inv.status,
      sent_at: new Date().toISOString(),
    }).eq("id", invoice_id);

    return ok({ url: session.url, checkout_id: session.id });
  } catch (e) {
    if (e instanceof StripeError) return err(502, "stripe_error", e.message);
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
