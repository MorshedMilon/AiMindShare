// functions/billing-checkout/index.ts — M03. Create a Stripe Checkout Session for
// a plan subscription (or a credit-wallet top-up). Owner-only (billing.manage).
// The secret key lives in Vault; the browser only ever gets back a redirect URL.
//
// Body:
//   { workspace_id, plan_id }                     → subscription checkout
//   { workspace_id, mode:"topup", kind, amount_cents, credits }  → wallet top-up
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { authUser, userClient, serviceClient, requirePermission } from "../_shared/auth.ts";
import { getVaultSecret, stripePost, StripeError, STRIPE_KEY_SECRET } from "../_shared/stripe.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:5173";

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    const user = await authUser(req);
    if (!user) return err(401, "unauthorized", "No valid session");

    const body = await req.json().catch(() => ({}));
    const workspace_id = body?.workspace_id as string | undefined;
    if (!workspace_id) return err(400, "bad_request", "workspace_id is required");

    // Owner-only: billing.manage is on the owner tier in the registry (ROLE_MATRIX).
    // Re-check on a caller-scoped client (auth.uid() = the caller) — never trust the body.
    const gate = await requirePermission(userClient(req), workspace_id, "billing.manage");
    if (gate) return gate;

    const svc = serviceClient();
    const stripeKey = await getVaultSecret(svc, STRIPE_KEY_SECRET);
    if (!stripeKey) return err(503, "stripe_unconfigured", "Stripe key is not configured in Vault");

    const mode = body?.mode === "topup" ? "topup" : "subscription";
    let session: any;

    if (mode === "subscription") {
      const plan_id = body?.plan_id as string | undefined;
      if (!plan_id) return err(400, "bad_request", "plan_id is required for a subscription");

      const { data: plan } = await svc
        .from("plans").select("id, name, tier, stripe_price_id").eq("id", plan_id).maybeSingle();
      if (!plan) return err(404, "plan_not_found", "No such plan");
      if (!plan.stripe_price_id) {
        return err(503, "plan_price_unconfigured", `Plan ${plan.name} has no Stripe price id`);
      }

      // Reuse the workspace's Stripe customer if we already have one (upgrade/downgrade).
      const { data: sub } = await svc
        .from("subscriptions_platform")
        .select("stripe_customer_id").eq("workspace_id", workspace_id).maybeSingle();

      session = await stripePost(stripeKey, "/checkout/sessions", {
        mode: "subscription",
        line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
        success_url: `${APP_URL}/m03-billing-and-usage-metering.html#/settings/billing?checkout=success`,
        cancel_url: `${APP_URL}/m03-billing-and-usage-metering.html#/settings/billing?checkout=cancel`,
        client_reference_id: workspace_id,
        ...(sub?.stripe_customer_id ? { customer: sub.stripe_customer_id } : {}),
        subscription_data: { metadata: { workspace_id } },
        metadata: { workspace_id, plan_id },
      });
    } else {
      // Credit-wallet top-up: a one-time payment. The webhook credits the wallet on
      // invoice.paid / checkout.session.completed using this metadata (USAGE-METERING §8).
      const kind = body?.kind as string | undefined;
      const amount_cents = Number(body?.amount_cents);
      const credits = Number(body?.credits);
      if (!kind || !Number.isFinite(amount_cents) || amount_cents <= 0 || !Number.isFinite(credits)) {
        return err(400, "bad_request", "kind, amount_cents (>0) and credits are required for a top-up");
      }
      session = await stripePost(stripeKey, "/checkout/sessions", {
        mode: "payment",
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(amount_cents),
            product_data: { name: `AiMindShare credits — ${kind}` },
          },
        }],
        success_url: `${APP_URL}/m03-billing-and-usage-metering.html#/settings/usage?topup=success`,
        cancel_url: `${APP_URL}/m03-billing-and-usage-metering.html#/settings/usage?topup=cancel`,
        client_reference_id: workspace_id,
        payment_intent_data: { metadata: { workspace_id, topup_kind: kind, topup_credits: credits } },
        metadata: { workspace_id, topup_kind: kind, topup_credits: credits },
      });
    }

    return ok({ id: session.id, url: session.url });
  } catch (e) {
    if (e instanceof StripeError) return err(502, "stripe_error", e.message);
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
