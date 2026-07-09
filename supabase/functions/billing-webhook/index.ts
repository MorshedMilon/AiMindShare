// functions/billing-webhook/index.ts — M03. Stripe → billing state.
// verify_jwt = false (Stripe signs the body, not a user JWT). The ONLY trust here
// is the signature (EDGE-FUNCTIONS-SPEC §4): verify FIRST, then dedupe on event.id,
// then act. An unverified webhook is dropped silently (200, no action). All writes
// use the service role (bypasses RLS; stripe_events is service-role only).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, preflight } from "../_shared/envelope.ts";
import { serviceClient } from "../_shared/auth.ts";
import { getVaultSecret, verifyStripeSig, unixToIso, STRIPE_WHSEC_SECRET } from "../_shared/stripe.ts";

// Always ack the provider with 200 so Stripe stops retrying (we never leak detail
// to the caller). Real failures are logged server-side.
const ack = (received: boolean) => ok({ received });

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return ack(false);

  const svc = serviceClient();

  // 1. Verify the signature against the Vault-held signing secret — BEFORE trusting
  //    the body. Missing secret or bad signature → drop silently (200, no action).
  const raw = await req.text();
  const whsec = await getVaultSecret(svc, STRIPE_WHSEC_SECRET);
  if (!whsec) { console.error("billing-webhook: no signing secret in Vault; dropping"); return ack(false); }
  const valid = await verifyStripeSig(raw, req.headers.get("Stripe-Signature"), whsec);
  if (!valid) { console.error("billing-webhook: signature mismatch; dropping"); return ack(false); }

  let event: any;
  try { event = JSON.parse(raw); } catch { return ack(false); }

  const obj = event?.data?.object ?? {};
  const workspace_id: string | null =
    obj?.metadata?.workspace_id ??
    obj?.subscription_details?.metadata?.workspace_id ??
    obj?.client_reference_id ??
    await resolveWorkspaceByCustomer(svc, obj?.customer) ??
    null;

  // 2. Idempotency: dedupe on Stripe's event id. First writer wins; a redelivery
  //    hits the unique key and we ack without re-acting (Stripe redelivers).
  const { error: dedupeErr } = await svc.from("stripe_events")
    .insert({ id: event.id, type: event.type, workspace_id });
  if (dedupeErr) {
    // 23505 = unique_violation → already processed. Any other error → don't act.
    if ((dedupeErr as any).code === "23505") return ack(true);
    console.error("billing-webhook: dedupe insert failed", dedupeErr.message);
    return ack(false);
  }

  // 3. Act on the 5 events we handle (USAGE-METERING §7).
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        if (obj.mode === "payment") {
          await creditWallet(svc, workspace_id, obj.metadata);          // top-up
        } else {
          await upsertSubscription(svc, workspace_id, {
            stripe_subscription_id: obj.subscription,
            stripe_customer_id: obj.customer,
            plan_id: obj.metadata?.plan_id,
            status: "active",
          });
          await setBillingState(svc, workspace_id, "active");
        }
        break;
      }
      case "invoice.paid": {
        await setBillingState(svc, workspace_id, "active");
        await patchSubscription(svc, workspace_id, {
          status: "active",
          current_period_end: unixToIso(obj.lines?.data?.[0]?.period?.end ?? obj.period_end),
        });
        if (obj.metadata?.topup_kind) await creditWallet(svc, workspace_id, obj.metadata);
        break;
      }
      case "invoice.payment_failed": {
        await setBillingState(svc, workspace_id, "past_due");
        await patchSubscription(svc, workspace_id, { status: "past_due" });
        break;
      }
      case "customer.subscription.updated": {
        const plan_id = await planIdForPrice(svc, obj.items?.data?.[0]?.price?.id);
        await patchSubscription(svc, workspace_id, {
          stripe_subscription_id: obj.id,
          status: obj.status,
          current_period_end: unixToIso(obj.current_period_end),
          ...(plan_id ? { plan_id } : {}),
        });
        if (obj.status === "active") await setBillingState(svc, workspace_id, "active");
        break;
      }
      case "customer.subscription.deleted": {
        await patchSubscription(svc, workspace_id, { status: "canceled" });
        await setBillingState(svc, workspace_id, "canceled");
        break;
      }
      default:
        break; // unhandled event types are acked and ignored
    }
  } catch (e) {
    console.error("billing-webhook: handler error", e instanceof Error ? e.message : String(e));
    // Still ack — the event is recorded in stripe_events; a reconcile job can retry.
  }

  return ack(true);
});

// ── helpers (service-role writes) ────────────────────────────────────────────

async function resolveWorkspaceByCustomer(svc: any, customer?: string): Promise<string | null> {
  if (!customer) return null;
  const { data } = await svc.from("subscriptions_platform")
    .select("workspace_id").eq("stripe_customer_id", customer).maybeSingle();
  return data?.workspace_id ?? null;
}

async function planIdForPrice(svc: any, priceId?: string): Promise<string | null> {
  if (!priceId) return null;
  const { data } = await svc.from("plans").select("id").eq("stripe_price_id", priceId).maybeSingle();
  return data?.id ?? null;
}

async function setBillingState(svc: any, workspace_id: string | null, state: string) {
  if (!workspace_id) return;
  await svc.from("workspaces").update({ billing_state: state }).eq("id", workspace_id);
}

// Upsert the platform subscription row for a workspace (there is one per workspace).
async function upsertSubscription(svc: any, workspace_id: string | null, patch: Record<string, unknown>) {
  if (!workspace_id) return;
  const { data: existing } = await svc.from("subscriptions_platform")
    .select("id").eq("workspace_id", workspace_id).maybeSingle();
  if (existing) {
    await svc.from("subscriptions_platform").update(patch).eq("id", existing.id);
  } else {
    await svc.from("subscriptions_platform").insert({ workspace_id, ...patch });
  }
}

async function patchSubscription(svc: any, workspace_id: string | null, patch: Record<string, unknown>) {
  if (!workspace_id) return;
  await svc.from("subscriptions_platform").update(patch).eq("workspace_id", workspace_id);
}

// Credit a prepaid wallet from a top-up payment's metadata (USAGE-METERING §8).
async function creditWallet(svc: any, workspace_id: string | null, metadata: any) {
  const kind = metadata?.topup_kind;
  const credits = Number(metadata?.topup_credits);
  if (!workspace_id || !kind || !Number.isFinite(credits) || credits <= 0) return;
  const { data: wallet } = await svc.from("credit_wallets")
    .select("id, balance").eq("workspace_id", workspace_id).eq("kind", kind).maybeSingle();
  if (wallet) {
    await svc.from("credit_wallets").update({ balance: Number(wallet.balance) + credits }).eq("id", wallet.id);
  } else {
    await svc.from("credit_wallets").insert({ workspace_id, kind, balance: credits });
  }
  // Keep the ledger honest: a topup is auditable in usage_events (negative-cost row).
  await svc.from("usage_events").insert({
    workspace_id, kind, quantity: credits, source: "stripe_topup",
  });
}
