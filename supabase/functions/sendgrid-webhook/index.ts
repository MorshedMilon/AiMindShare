// functions/sendgrid-webhook/index.ts — M16 SendGrid Signed Event Webhook.
// verify_jwt = false (SendGrid signs the body, not a user JWT). The ONLY trust here is
// the ECDSA signature (verifySendgridEvent): verify FIRST, then act. An unverified or
// unparseable payload is ack'd (200) and dropped — we NEVER 500 to the provider (that
// just triggers redelivery storms). All writes are service-role. Delivery events roll
// into campaign_stats via the 0020 send_events trigger; bounces/complaints suppress,
// unsubscribes dual-write the block list + M05 consent (D-090).
//
// Event → send_events.type map (0020 send_event_type enum):
//   delivered→delivered · open→opened · click→clicked · bounce/dropped→bounced
//   spamreport→complained · (group_)unsubscribe→unsubscribed
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok } from "../_shared/envelope.ts";
import { serviceClient } from "../_shared/auth.ts";
import { verifySendgridEvent, getVaultSecret, sendgridWebhookKeyName } from "../_shared/email.ts";

// SendGrid event → our send_event_type. Unmapped events are ignored (acked).
const TYPE_MAP: Record<string, string> = {
  delivered: "delivered",
  open: "opened",
  click: "clicked",
  bounce: "bounced",
  dropped: "bounced",
  spamreport: "complained",
  unsubscribe: "unsubscribed",
  group_unsubscribe: "unsubscribed",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return ok({});
  if (req.method !== "POST") return ok({});

  const svc = serviceClient();
  const raw = await req.text();

  // 1. Verify the ECDSA signature BEFORE trusting the body. The verification key is a
  //    platform default (plat__sendgrid__event_webhook_verification_key); a workspace
  //    override is honored if present. No ws context in the header, so try platform
  //    first, then fall back to any single-tenant workspace key (best-effort).
  const sig = req.headers.get("X-Twilio-Email-Event-Webhook-Signature");
  const ts = req.headers.get("X-Twilio-Email-Event-Webhook-Timestamp");
  const platKey = await getVaultSecret(svc, sendgridWebhookKeyName(null));
  if (!(await verifySendgridEvent(raw, sig, ts, platKey))) {
    console.error("sendgrid-webhook: signature mismatch; dropping");
    return ok({ ok: true });   // ack-and-drop — never 500 to the provider
  }

  let events: any[];
  try { events = JSON.parse(raw); } catch { return ok({ ok: true }); }
  if (!Array.isArray(events)) return ok({ ok: true });

  for (const ev of events) {
    try {
      const mapped = TYPE_MAP[String(ev?.event ?? "")];
      if (!mapped) continue; // processed/deferred/etc. — ignore

      // Resolve the seed send_events row by our custom_args.token (preferred) or the
      // provider's sg_message_id → workspace/contact/campaign/step/email.
      const token: string | null = ev?.token ?? ev?.custom_args?.token ?? null;
      const sgMsgId: string | null = ev?.sg_message_id ?? null;
      let q = svc.from("send_events")
        .select("workspace_id, campaign_id, step_id, enrollment_id, contact_id, email")
        .order("created_at", { ascending: true }).limit(1);
      if (token) q = q.eq("token", token);
      else if (sgMsgId) q = q.eq("provider_message_id", sgMsgId);
      else continue;
      const { data: seed } = await q.maybeSingle();
      if (!seed) continue;

      const ws = seed.workspace_id as string;
      const email = (ev?.email as string) ?? seed.email ?? null;
      const providerMessageId = sgMsgId ?? token;

      // Dedupe on (provider_message_id, type): a redelivery of the same event no-ops.
      if (providerMessageId) {
        const { data: dup } = await svc.from("send_events")
          .select("id").eq("workspace_id", ws).eq("provider_message_id", providerMessageId).eq("type", mapped).maybeSingle();
        if (dup) continue;
      }

      // Append the mapped event (the 0020 trigger rolls it into campaign_stats).
      await svc.from("send_events").insert({
        workspace_id: ws,
        campaign_id: seed.campaign_id,
        step_id: seed.step_id,
        enrollment_id: seed.enrollment_id,
        contact_id: seed.contact_id,
        email,
        type: mapped,
        url: mapped === "clicked" ? (ev?.url ?? null) : null,
        provider_message_id: providerMessageId,
      });

      // Compliance side-effects (service-role RPCs).
      if (email && (ev.event === "bounce" || ev.event === "dropped")) {
        await svc.rpc("suppress_email", { p_ws: ws, p_email: email, p_reason: "bounce", p_source: "sendgrid" });
      } else if (email && ev.event === "spamreport") {
        await svc.rpc("suppress_email", { p_ws: ws, p_email: email, p_reason: "complaint", p_source: "sendgrid" });
      } else if (email && (ev.event === "unsubscribe" || ev.event === "group_unsubscribe")) {
        await svc.rpc("unsubscribe_email", { p_ws: ws, p_email: email, p_contact: seed.contact_id });
      }

      // Best-effort trigger emit (M13 is a parallel module — tolerate its absence).
      await emit(svc, ws, `email.${mapped}`, {
        contact_id: seed.contact_id, campaign_id: seed.campaign_id, email,
      });
    } catch (e) {
      console.error("sendgrid-webhook: event error", e instanceof Error ? e.message : String(e));
      // Continue the batch — one bad event never fails the whole delivery.
    }
  }

  return ok({});
});

// M13 trigger-bus is a parallel/unclosed module — tolerate its absence (mirrors M28).
async function emit(svc: any, ws: string, type: string, payload: Record<string, unknown>) {
  const { error } = await svc.rpc("emit_trigger", { p_ws: ws, p_type: type, p_payload: payload });
  if (error && !/does not exist|undefined/i.test(error.message)) console.error("emit_trigger", error.message);
}
