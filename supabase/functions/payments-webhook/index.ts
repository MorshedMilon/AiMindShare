// functions/payments-webhook/index.ts — M28. Stripe (Connect) → invoice state.
// verify_jwt = false (Stripe signs the body, not a user JWT). The ONLY trust here is
// the signature (EDGE-FUNCTIONS-SPEC §4): verify FIRST, then dedupe on event.id, then
// act. An unverified webhook is dropped silently (200, no action). All writes use the
// service role via the definer record_invoice_payment RPC (which is itself idempotent
// on the payment-intent id — double protection against redelivery). Reuses M03's
// stripe_events dedupe table (same shape) so we do not re-invent idempotency.
//
// Handles: checkout.session.completed / payment_intent.succeeded (invoice payments),
// invoice.paid / invoice.payment_failed / customer.subscription.* (client subscriptions),
// payment_intent.payment_failed (M20 funnel-order decline → funnel.order_failed, D-175).
//
// M20 note (D-175): funnel checkout only ever creates a PaymentIntent (public-invoice's
// "intent" action), never a Checkout Session, so recordFunnelPurchaseIfOrder() is only
// called from payment_intent.succeeded — calling it from checkout.session.completed too
// would double-record the same purchase for a session/PI pair that both fire for one
// buy. It's additionally guarded by an existence check against funnel_visits, so even a
// redelivered/duplicate event can't double-count a conversion.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok } from "../_shared/envelope.ts";
import { serviceClient } from "../_shared/auth.ts";
import { getVaultSecret, verifyStripeSig, unixToIso, STRIPE_WHSEC_SECRET } from "../_shared/stripe.ts";

const ack = (received: boolean) => ok({ received });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return ok({});
  if (req.method !== "POST") return ack(false);

  const svc = serviceClient();

  // 1. Verify the signature against the Vault signing secret — BEFORE trusting the body.
  const raw = await req.text();
  const whsec = await getVaultSecret(svc, STRIPE_WHSEC_SECRET);
  if (!whsec) { console.error("payments-webhook: no signing secret in Vault; dropping"); return ack(false); }
  if (!(await verifyStripeSig(raw, req.headers.get("Stripe-Signature"), whsec))) {
    console.error("payments-webhook: signature mismatch; dropping"); return ack(false);
  }

  let event: any;
  try { event = JSON.parse(raw); } catch { return ack(false); }
  const obj = event?.data?.object ?? {};
  const workspace_id: string | null =
    obj?.metadata?.workspace_id ??
    obj?.payment_intent_data?.metadata?.workspace_id ??
    obj?.client_reference_id ??
    await resolveWorkspaceBySub(svc, obj?.subscription ?? obj?.id) ??
    null;

  // 2. Idempotency on the Stripe event id (reuses M03's stripe_events). First writer
  //    wins; a redelivery hits the unique key and we ack without re-acting.
  const { error: dedupeErr } = await svc.from("stripe_events")
    .insert({ id: event.id, type: event.type, workspace_id });
  if (dedupeErr) {
    if ((dedupeErr as any).code === "23505") return ack(true);   // already processed
    console.error("payments-webhook: dedupe insert failed", dedupeErr.message);
    return ack(false);
  }

  // 3. Act.
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        if (obj.mode === "payment" && obj.metadata?.invoice_id) {
          await recordPayment(svc, workspace_id, obj.metadata.invoice_id,
            obj.amount_total, obj.payment_intent);
        }
        break;
      }
      case "payment_intent.succeeded": {
        if (obj.metadata?.invoice_id) {
          await recordPayment(svc, workspace_id, obj.metadata.invoice_id,
            obj.amount_received ?? obj.amount, obj.id);
          await recordFunnelPurchaseIfOrder(svc, workspace_id, obj.metadata.invoice_id);
        }
        break;
      }
      case "payment_intent.payment_failed": {
        if (obj.metadata?.invoice_id) {
          await recordFunnelOrderFailed(svc, workspace_id, obj.metadata.invoice_id);
        }
        break;
      }
      case "invoice.paid": {
        // A client-subscription cycle succeeded → keep the sub active + advance date.
        await patchClientSub(svc, obj.subscription, {
          status: "active",
          next_charge_at: unixToIso(obj.lines?.data?.[0]?.period?.end ?? obj.period_end),
        });
        break;
      }
      case "invoice.payment_failed": {
        await patchClientSub(svc, obj.subscription, { status: "past_due" });
        // Dunning → M13 payment.failed trigger (best-effort; parallel module, D-077).
        if (workspace_id) await emit(svc, workspace_id, "payment.failed",
          { stripe_sub_id: obj.subscription });
        break;
      }
      case "customer.subscription.updated": {
        await patchClientSub(svc, obj.id, {
          status: obj.status,
          next_charge_at: unixToIso(obj.current_period_end),
        });
        break;
      }
      case "customer.subscription.deleted": {
        await patchClientSub(svc, obj.id, { status: "canceled" });
        break;
      }
      default:
        break; // unhandled types are acked and ignored
    }
  } catch (e) {
    console.error("payments-webhook: handler error", e instanceof Error ? e.message : String(e));
    // Still ack — the event is recorded in stripe_events; a reconcile job can retry.
  }

  return ack(true);
});

// ── helpers (service-role) ────────────────────────────────────────────────────

async function recordPayment(svc: any, ws: string | null, invoice_id: string, amount: number, pi?: string) {
  if (!ws || !invoice_id || !amount) return;
  const { error } = await svc.rpc("record_invoice_payment", {
    p_ws: ws, p_invoice: invoice_id, p_amount: Math.round(amount), p_method: "card", p_pi: pi ?? null,
  });
  if (error) console.error("record_invoice_payment", error.message);
}

// D-175: a funnel order's invoice never had its own success signal reach M20's event
// stream — record_invoice_payment above credits the invoice, but nothing told
// funnel_visits a purchase happened, so Funnel Map's order-step "conversions" showed 0
// even for real, paid orders. Fixed here, at the one place a real payment success is
// confirmed. Idempotent by construction: guarded by an existence check, and this is the
// only caller (checkout.session.completed never fires for M20 orders — see file header).
async function recordFunnelPurchaseIfOrder(svc: any, ws: string | null, invoice_id: string) {
  if (!ws || !invoice_id) return;
  const { data: inv } = await svc.from("invoices")
    .select("source_type,source_id,contact_id").eq("id", invoice_id).maybeSingle();
  if (!inv || inv.source_type !== "order") return;
  const marker = "order:" + invoice_id;
  const { data: existing } = await svc.from("funnel_visits")
    .select("id").eq("visitor_id", marker).eq("event", "purchase").maybeSingle();
  if (existing) return;
  const { data: step } = await svc.from("funnel_steps").select("funnel_id").eq("id", inv.source_id).maybeSingle();
  if (!step) return;
  const { error } = await svc.rpc("record_funnel_event", {
    p_ws: ws, p_funnel: step.funnel_id, p_step: inv.source_id, p_visitor: marker,
    p_event: "purchase", p_contact: inv.contact_id ?? null,
  });
  if (error) console.error("record_funnel_event(purchase)", error.message);
}

// D-175: the counterpart for a declined/failed charge on a funnel order. Unlike the
// purchase case, every failed attempt is its own event (a customer can retry and fail
// more than once) — no existence guard here by design.
async function recordFunnelOrderFailed(svc: any, ws: string | null, invoice_id: string) {
  if (!ws || !invoice_id) return;
  const { data: inv } = await svc.from("invoices")
    .select("source_type,source_id,contact_id").eq("id", invoice_id).maybeSingle();
  if (!inv || inv.source_type !== "order") return;
  const { data: step } = await svc.from("funnel_steps").select("funnel_id").eq("id", inv.source_id).maybeSingle();
  if (!step) return;
  const { error } = await svc.rpc("record_funnel_event", {
    p_ws: ws, p_funnel: step.funnel_id, p_step: inv.source_id, p_visitor: "order:" + invoice_id,
    p_event: "order_failed", p_contact: inv.contact_id ?? null,
  });
  if (error) console.error("record_funnel_event(order_failed)", error.message);
}

async function patchClientSub(svc: any, stripe_sub_id: string | undefined, patch: Record<string, unknown>) {
  if (!stripe_sub_id) return;
  await svc.from("client_subscriptions").update(patch).eq("stripe_sub_id", stripe_sub_id);
}

async function resolveWorkspaceBySub(svc: any, stripe_sub_id?: string): Promise<string | null> {
  if (!stripe_sub_id) return null;
  const { data } = await svc.from("client_subscriptions")
    .select("workspace_id").eq("stripe_sub_id", stripe_sub_id).maybeSingle();
  return data?.workspace_id ?? null;
}

async function emit(svc: any, ws: string, type: string, payload: Record<string, unknown>) {
  // M13 trigger-bus is a parallel/unclosed module — tolerate its absence (D-077).
  const { error } = await svc.rpc("emit_trigger", { p_ws: ws, p_type: type, p_payload: payload });
  if (error && !/does not exist|undefined/i.test(error.message)) console.error("emit_trigger", error.message);
}
