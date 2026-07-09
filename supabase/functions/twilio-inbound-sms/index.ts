// functions/twilio-inbound-sms/index.ts — inbound SMS webhook (M05 consent +
// M12 threading). Twilio POSTs inbound messages here (form-encoded). Two jobs:
//
//   1. M05 · carrier keywords → consent ledger. STOP/UNSUBSCRIBE/CANCEL/END/QUIT
//      → opt-out; START/YES/UNSTOP → opt-in; HELP/INFO → info reply. Each keyword
//      appends to the append-only consent_records ledger so consent.check() blocks
//      or permits the next send within seconds.
//   2. M12 · thread the message. ingest_inbound_message() resolves the contact by
//      phone, opens/appends the conversation, writes the message + M09 timeline,
//      and is idempotent on the Twilio MessageSid (a redelivered webhook is a no-op).
//
// SECURITY (BUILD-SEQUENCE S10 accept-when — "signature-verified"): the
// X-Twilio-Signature HMAC-SHA1 is verified against the workspace's Twilio
// auth_token from Vault BEFORE acting. Verification runs whenever a token is
// configured; a workspace that has not yet connected Twilio (D-034 dev slice) has
// no token to verify against, so it is processed unverified with a logged warning
// — in production every wired number has a token, so the gate always runs.
//
// This is a WEBHOOK (no caller JWT): it runs under the service role (bypasses RLS).
// Contract:  POST /functions/v1/twilio-inbound-sms?workspace_id=<uuid>
//   body: application/x-www-form-urlencoded  (From, To, Body, MessageSid, …)
//   200: text/xml TwiML  ·  401: invalid signature
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { preflight } from "../_shared/envelope.ts";
import { serviceClient } from "../_shared/auth.ts";

const STOP = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const START = new Set(["START", "YES", "UNSTOP"]);
const HELP = new Set(["HELP", "INFO"]);

function twiml(message: string | null, status = 200): Response {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new Response(body, { status, headers: { "Content-Type": "text/xml" } });
}

// Twilio request validation: base64( HMAC-SHA1( authToken, url + Σ sorted(key+value) ) ).
async function expectedSignature(authToken: string, url: string, params: Record<string, string>): Promise<string> {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function twilioAuthToken(db: ReturnType<typeof serviceClient>, workspace_id: string): Promise<string | null> {
  const { data: integ } = await db.from("integrations")
    .select("vault_secret_name, status").eq("provider", "twilio").eq("workspace_id", workspace_id).maybeSingle();
  if (!integ?.vault_secret_name || integ.status !== "connected") return null;
  const { data: sec } = await db.schema("vault").from("decrypted_secrets")
    .select("decrypted_secret").eq("name", `${integ.vault_secret_name}__auth_token`).maybeSingle();
  return sec?.decrypted_secret ?? null;
}

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return twiml(null);

  try {
    const url = new URL(req.url);
    const workspace_id = url.searchParams.get("workspace_id");

    const form = new URLSearchParams(await req.text());
    const params: Record<string, string> = {};
    for (const [k, v] of form) params[k] = v;

    const from = (params["From"] || "").trim();
    const bodyText = (params["Body"] || "").trim();
    const messageSid = params["MessageSid"] || null;
    const mediaUrl = params["MediaUrl0"] || null;

    const db = serviceClient();

    // ── Signature verification (runs when the workspace has a Twilio token) ─────
    if (workspace_id) {
      const token = await twilioAuthToken(db, workspace_id);
      if (token) {
        const provided = req.headers.get("X-Twilio-Signature") || "";
        const expected = await expectedSignature(token, req.url, params);
        if (provided !== expected) {
          console.warn("twilio-inbound-sms: signature mismatch — dropping");
          return twiml(null, 401);
        }
      } else {
        console.warn(`twilio-inbound-sms: no Twilio token for ws ${workspace_id} — processing unverified (pre-connect slice)`);
      }
    }

    if (!workspace_id) return twiml(null);

    // ── M12 · thread the inbound message (resolve contact + open/append thread) ─
    // Idempotent on MessageSid, so a Twilio redelivery does not double-post.
    let contactId: string | null = null;
    try {
      const { data: msgId, error: iErr } = await db.rpc("ingest_inbound_message", {
        p_ws: workspace_id, p_channel: "sms", p_from: from, p_body: bodyText,
        p_external_id: messageSid, p_media: mediaUrl,
      });
      if (iErr) console.error("ingest_inbound_message failed:", iErr.message);
      else if (msgId) {
        const { data: row } = await db.from("messages")
          .select("conversation_id, conversations(contact_id)").eq("id", msgId).maybeSingle();
        contactId = (row as any)?.conversations?.contact_id ?? null;
      }
    } catch (e) {
      console.error("threading error:", e instanceof Error ? e.message : String(e));
    }

    // ── M05 · carrier-keyword consent → append-only ledger ──────────────────────
    const keyword = bodyText.toUpperCase().replace(/[^A-Z]/g, "");
    let reply: string | null = null;
    let granted: boolean | null = null;
    if (STOP.has(keyword)) { granted = false; reply = "You have been unsubscribed and will receive no further messages. Reply START to opt back in."; }
    else if (START.has(keyword)) { granted = true; reply = "You are subscribed and will now receive messages. Reply STOP to unsubscribe, HELP for help."; }
    else if (HELP.has(keyword)) { reply = "Message & data rates may apply. Reply STOP to unsubscribe. For support contact your provider."; }

    if (granted !== null) {
      // contact_id is now resolved (M09) — the ledger row ties to the contact; the
      // phone + inbound body remain in evidence for legal proof (D-037).
      const { error } = await db.from("consent_records").insert({
        workspace_id,
        contact_id: contactId,
        kind: "sms_optin",
        granted,
        source: "keyword",
        evidence: { phone: from, message: bodyText, keyword, message_sid: messageSid },
      });
      if (error) console.error("consent_records insert failed:", error.message);
    }

    return twiml(reply);
  } catch (e) {
    console.error("twilio-inbound-sms error:", e instanceof Error ? e.message : String(e));
    return twiml(null);
  }
});
