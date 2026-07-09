// functions/consent-check/index.ts — M05 consent gate. THE mandatory pre-send
// contract every messaging module (M12 SMS, M16 campaigns, M34 voice) must call
// before delivering to a contact (PRD_M05 "consent.check(contactId, channel)").
//
// Resolves the contact's LATEST consent state for the channel from the
// append-only consent_records ledger. Default is DENY: a contact must have an
// explicit, most-recent opt-in for the channel to be messageable (a later
// opt-out — e.g. an SMS STOP reply — flips it back to blocked). Read on a
// CALLER-scoped client so the ledger RLS (staff+) applies (Law 2).
//
// Contract:  POST /functions/v1/consent-check   Bearer <jwt>
//   body { "workspace_id":"<uuid>", "contact_id":"<uuid>", "channel":"sms|email|whatsapp|voice" }
//   200 { ok:true, data:{ allowed:false, channel, status:"opted_out"|"opted_in"|"unknown", at } }
//   400 bad_request   401 unauthorized
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { authUser, userClient } from "../_shared/auth.ts";

// Channel → consent_kind (DATA-SCHEMA §2 + D-036 channel extension).
const KIND: Record<string, string> = {
  sms: "sms_optin", email: "email_optin", whatsapp: "whatsapp_optin", voice: "voice_optin",
};

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    const user = await authUser(req);
    if (!user) return err(401, "unauthorized", "No valid session");

    const body = await req.json().catch(() => ({}));
    const { workspace_id, contact_id, channel } = body ?? {};
    if (!workspace_id || !contact_id || !channel) {
      return err(400, "bad_request", "workspace_id, contact_id and channel are required");
    }
    const kind = KIND[String(channel)];
    if (!kind) return err(400, "unknown_channel", `${channel} is not a consent channel`);

    // Latest ledger row wins (RLS: staff+ of the workspace).
    const udb = userClient(req);
    const { data, error } = await udb
      .from("consent_records")
      .select("granted, created_at")
      .eq("workspace_id", workspace_id)
      .eq("contact_id", contact_id)
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return err(500, "read_failed", error.message);

    const status = data == null ? "unknown" : data.granted ? "opted_in" : "opted_out";
    // DENY by default: only an explicit, most-recent opt-in is messageable.
    return ok({ allowed: data?.granted === true, channel, status, at: data?.created_at ?? null });
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
