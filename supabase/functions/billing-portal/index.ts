// functions/billing-portal/index.ts — M03. Create a Stripe Billing Portal session
// so an owner can manage payment method, invoices and plan. Owner-only
// (billing.manage). Returns only a redirect URL; the secret stays in Vault.
//
// Body: { workspace_id }
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

    const gate = await requirePermission(userClient(req), workspace_id, "billing.manage");
    if (gate) return gate;

    const svc = serviceClient();
    const { data: sub } = await svc
      .from("subscriptions_platform")
      .select("stripe_customer_id").eq("workspace_id", workspace_id).maybeSingle();
    if (!sub?.stripe_customer_id) {
      return err(409, "no_customer", "This workspace has no Stripe customer yet — subscribe first");
    }

    const stripeKey = await getVaultSecret(svc, STRIPE_KEY_SECRET);
    if (!stripeKey) return err(503, "stripe_unconfigured", "Stripe key is not configured in Vault");

    const session = await stripePost(stripeKey, "/billing_portal/sessions", {
      customer: sub.stripe_customer_id,
      return_url: `${APP_URL}/m03-billing-and-usage-metering.html#/settings/billing`,
    });

    return ok({ url: session.url });
  } catch (e) {
    if (e instanceof StripeError) return err(502, "stripe_error", e.message);
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
