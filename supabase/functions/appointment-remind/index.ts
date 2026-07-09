// functions/appointment-remind/index.ts — M14 reminder send. Invoked by the worker
// for an `appointment.remind` job (enqueued by the pg_cron `enqueue_due_reminders()`
// sweep). NOT a browser path (verify_jwt=false; the worker calls it service-side).
//
// Contract (PRD_M14 §2 lifecycle): send the 24h/1h reminder, respecting M05 consent
// for SMS, metering `sms` (M03) in the SAME success path (a failed provider call
// bills nothing — DoD Gate 3), then mark appointment_reminders.sent_at.
//
//   POST { appointment_id, reminder_id, channel }
//   200 { ok:true, data:{ status:'sent'|'stubbed'|'skipped' } }
//
// SMS is the LIVE path (reuses M12's Twilio contract + Vault creds). EMAIL is
// STUBBED until D-011 (email provider) is decided — the job runs and returns
// 'stubbed' without sending, exactly like M04's digest sender. Reminders default to
// the 'sms' channel in 0017, so email is only reachable once a calendar opts into it.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { serviceClient } from "../_shared/auth.ts";
import { incrementMeter, checkMeter } from "../_shared/meter.ts";

async function vaultField(admin: any, base: string, field: string): Promise<string | null> {
  const { data } = await admin.schema("vault").from("decrypted_secrets")
    .select("decrypted_secret").eq("name", `${base}__${field}`).maybeSingle();
  return data?.decrypted_secret ?? null;
}

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    const { appointment_id, reminder_id, channel } = await req.json().catch(() => ({}));
    if (!appointment_id || !reminder_id) return err(400, "bad_request", "appointment_id and reminder_id are required");

    const admin = serviceClient();

    // Load the appointment + its contact + calendar name (service role).
    const { data: appt } = await admin.from("appointments")
      .select("id, workspace_id, contact_id, calendar_id, starts_at, status")
      .eq("id", appointment_id).maybeSingle();
    if (!appt) return err(404, "not_found", "Appointment not found");
    if (!["confirmed", "rescheduled"].includes(appt.status)) {
      return ok({ status: "skipped", reason: `appointment is ${appt.status}` });
    }

    const ch = channel ?? "sms";

    // ── EMAIL: stubbed until D-011 (like M04 digest) ────────────────────────────
    if (ch === "email") {
      // The message is composed but NOT sent; no meter (email isn't metered).
      // sent_at is left null so it is honestly "not delivered" until a provider lands.
      return ok({ status: "stubbed", reason: "email sender stubbed until D-011" });
    }

    // ── SMS: the LIVE path (M12 Twilio contract) ────────────────────────────────
    const { data: contact } = await admin.from("contacts")
      .select("id, phone").eq("id", appt.contact_id).maybeSingle();
    const to = contact?.phone ? String(contact.phone).trim() : null;
    if (!to) return ok({ status: "skipped", reason: "contact has no phone" });

    // Consent (M05): reminders are service messages but still respect opt-in/opt-out.
    const { data: consent } = await admin.from("consent_records")
      .select("granted").eq("workspace_id", appt.workspace_id).eq("contact_id", appt.contact_id)
      .eq("kind", "sms_optin").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (consent?.granted !== true) return ok({ status: "skipped", reason: "no SMS consent" });

    // Plan quota (M03) — a hard stop when over the SMS meter.
    const meter = await checkMeter(admin, appt.workspace_id, "sms", 1);
    if (meter?.over === true && (meter.remaining ?? 0) <= 0) {
      return err(429, "quota_exceeded", "SMS quota exhausted");
    }

    // From-number + Twilio creds (Vault, service role only).
    const { data: chan } = await admin.from("channels")
      .select("external_ref").eq("workspace_id", appt.workspace_id).eq("type", "sms").eq("is_active", true)
      .not("external_ref", "is", null).order("created_at").limit(1).maybeSingle();
    const from = chan?.external_ref ?? null;
    const { data: integ } = await admin.from("integrations")
      .select("vault_secret_name, status").eq("provider", "twilio").eq("workspace_id", appt.workspace_id).maybeSingle();
    if (!from || !integ || integ.status !== "connected" || !integ.vault_secret_name) {
      return ok({ status: "skipped", reason: "no connected Twilio number" });
    }
    const accountSid = await vaultField(admin, integ.vault_secret_name, "account_sid");
    const authToken = await vaultField(admin, integ.vault_secret_name, "auth_token");
    if (!accountSid || !authToken) return ok({ status: "skipped", reason: "twilio creds missing" });

    const { data: cal } = await admin.from("calendars").select("name, timezone").eq("id", appt.calendar_id).maybeSingle();
    const when = new Date(appt.starts_at).toLocaleString("en-US", { timeZone: cal?.timezone ?? "UTC" });
    const bodyText = `Reminder: your ${cal?.name ?? "appointment"} is on ${when}. Reply to reschedule.`;

    // Provider call (LIVE). A failure bills nothing (Gate 3).
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: bodyText }).toString(),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return err(502, "provider_error", `Twilio rejected the reminder (${resp.status}) ${detail.slice(0, 120)}`);
    }

    // Success: mark sent + meter in the same path.
    await admin.from("appointment_reminders").update({ sent_at: new Date().toISOString() }).eq("id", reminder_id);
    const met = await incrementMeter(admin, appt.workspace_id, "sms", 1, "calendar", null, appointment_id);
    if (!met.ok) console.error("meter_increment failed (reminder sent):", met.error);

    return ok({ status: "sent" });
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
