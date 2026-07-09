// functions/inbox-send/index.ts — M12 outbound SMS send. THE only write path for a
// channel message from the app: the browser can insert internal notes (RLS) but
// never a channel message (0015 D-055), so every real send comes through here.
//
// The mandatory pre-send contract (PRD_M12 §7): sms.canSend() [A2P 10DLC] +
// consent.check() [M05 opt-in] BEFORE the provider call; on success, write the
// outbound message + meter `sms` (M03) in the SAME path, and let the 0015 trigger
// bump the thread + M09 timeline. A FAILED provider call bills nothing (DoD Gate 3).
//
// Twilio credentials live in Vault, read here under the service role and NEVER
// returned to the browser (Law 3). No Twilio number is connected in this slice
// (D-034) → the function returns a clean 409 `not_connected` the UI turns into a
// "Connect a number" prompt; the REST call itself is the live path, unchanged.
//
// Contract:  POST /functions/v1/inbox-send   Bearer <jwt>
//   body { workspace_id, conversation_id, content, idempotency_key? }
//   200 { ok:true, data:{ message_id, external_id, status:'sent' } }
//   400 bad_request · 401 unauthorized · 403 forbidden|a2p_not_registered|consent_blocked
//   409 not_connected · 429 quota_exceeded · 502 provider_error
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { authUser, userClient, serviceClient, hasRole } from "../_shared/auth.ts";
import { incrementMeter, checkMeter } from "../_shared/meter.ts";

// Read a single Vault field secret by its deterministic name (INTEGRATIONS-SPEC §3).
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
    const user = await authUser(req);
    if (!user) return err(401, "unauthorized", "No valid session");

    const body = await req.json().catch(() => ({}));
    const { workspace_id, conversation_id, content, idempotency_key } = body ?? {};
    if (!workspace_id || !conversation_id || !content || !String(content).trim()) {
      return err(400, "bad_request", "workspace_id, conversation_id and content are required");
    }

    // ── Authorization: sending is staff+ (coarse tier, 0015 D-057) ──────────────
    const udb = userClient(req);
    if (!(await hasRole(udb, workspace_id, "staff"))) {
      return err(403, "forbidden", "Sending a message requires staff access or higher");
    }

    const admin = serviceClient();

    // ── Load the thread + its contact (service role; RLS already cleared above) ──
    const { data: conv, error: cErr } = await admin.from("conversations")
      .select("id, workspace_id, contact_id, channel")
      .eq("id", conversation_id).eq("workspace_id", workspace_id).maybeSingle();
    if (cErr) return err(500, "read_failed", cErr.message);
    if (!conv) return err(404, "not_found", "Conversation not found in this workspace");
    if (conv.channel !== "sms") {
      // Email/WhatsApp/etc. defer with their provider weeks (D-011 email; Meta week).
      return err(409, "channel_unavailable", `Sending on ${conv.channel} is not available yet`);
    }
    if (!conv.contact_id) return err(400, "no_contact", "This conversation has no contact to message");

    const { data: contact } = await admin.from("contacts")
      .select("id, phone").eq("id", conv.contact_id).eq("workspace_id", workspace_id).maybeSingle();
    const to = contact?.phone ? String(contact.phone).trim() : null;
    if (!to) return err(400, "no_phone", "The contact has no phone number on file");

    // ── Idempotency: a double-clicked / retried send returns the first result ───
    if (idempotency_key) {
      const { data: prior } = await admin.from("messages")
        .select("id, external_id, status")
        .eq("workspace_id", workspace_id).eq("external_id", `ik:${idempotency_key}`).maybeSingle();
      if (prior) return ok({ message_id: prior.id, external_id: prior.external_id, status: prior.status });
    }

    // ── Gate 1 · A2P 10DLC (mirrors sms-can-send) ───────────────────────────────
    const { data: a2p } = await udb.from("a2p_registrations")
      .select("brand_status, campaign_status").eq("workspace_id", workspace_id).maybeSingle();
    if (!(a2p?.brand_status === "approved" && a2p?.campaign_status === "approved")) {
      return err(403, "a2p_not_registered", "Complete A2P 10DLC registration before sending SMS");
    }

    // ── Gate 2 · consent (mirrors consent-check; DENY unless latest opt-in) ──────
    const { data: consent } = await udb.from("consent_records")
      .select("granted").eq("workspace_id", workspace_id).eq("contact_id", conv.contact_id)
      .eq("kind", "sms_optin").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (consent?.granted !== true) {
      return err(403, "consent_blocked", "This contact has not opted in to SMS (or has opted out)");
    }

    // ── Gate 3 · plan quota (M03) — HARD_STOP when over the SMS meter ───────────
    const meter = await checkMeter(admin, workspace_id, "sms", 1);
    if (meter?.over === true && (meter.remaining ?? 0) <= 0) {
      return err(429, "quota_exceeded", "Your SMS quota for this period is used up — upgrade or add credits");
    }

    // ── The "From" number: an active SMS channel for this workspace ─────────────
    const { data: chan } = await admin.from("channels")
      .select("external_ref").eq("workspace_id", workspace_id).eq("type", "sms").eq("is_active", true)
      .not("external_ref", "is", null).order("created_at").limit(1).maybeSingle();
    const from = chan?.external_ref ?? null;
    if (!from) return err(409, "not_connected", "Connect a Twilio number in Settings → Channels before sending SMS");

    // ── Credentials (Vault, service role only) ──────────────────────────────────
    // Twilio is api_key/workspace with fields account_sid + auth_token (providers.ts).
    // Resolve the workspace's twilio integration, then read the two field secrets.
    const { data: integ } = await admin.from("integrations")
      .select("vault_secret_name, status").eq("provider", "twilio").eq("workspace_id", workspace_id)
      .maybeSingle();
    if (!integ || integ.status !== "connected" || !integ.vault_secret_name) {
      return err(409, "not_connected", "Connect a Twilio number in Settings → Channels before sending SMS");
    }
    const accountSid = await vaultField(admin, integ.vault_secret_name, "account_sid");
    const authToken = await vaultField(admin, integ.vault_secret_name, "auth_token");
    if (!accountSid || !authToken) return err(409, "not_connected", "Twilio credentials are missing — reconnect the channel");

    // ── Provider call (LIVE path; no creds are connected in this slice, D-034) ──
    let externalId = idempotency_key ? `ik:${idempotency_key}` : null;
    let sendStatus = "sent";
    const tw = new URLSearchParams({ To: to, From: from, Body: String(content) });
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tw.toString(),
    });
    if (!resp.ok) {
      // Provider failed → bill nothing, write nothing (Gate 3).
      const detail = await resp.text().catch(() => "");
      return err(502, "provider_error", `Twilio rejected the message (${resp.status}) ${detail.slice(0, 160)}`);
    }
    const twBody = await resp.json().catch(() => ({} as any));
    externalId = twBody.sid ?? externalId;
    sendStatus = twBody.status === "failed" ? "failed" : "sent";

    // ── Success: write the outbound message + meter in one path (Gate 3) ────────
    const { data: msg, error: mErr } = await admin.from("messages").insert({
      workspace_id, conversation_id, direction: "outbound", channel: "sms",
      content: String(content), sender_id: user.id, external_id: externalId, status: sendStatus,
    }).select("id").single();
    if (mErr) return err(500, "write_failed", mErr.message);

    // Meter the send in the same success path (a failed provider call never reaches here).
    const met = await incrementMeter(admin, workspace_id, "sms", 1, "inbox", null, msg.id);
    if (!met.ok) console.error("meter_increment failed (message sent):", met.error);

    return ok({ message_id: msg.id, external_id: externalId, status: sendStatus });
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
