// functions/consent-record/index.ts — M05 manual/internal consent write. Appends
// an opt-in/opt-out row to the immutable consent_records ledger (PRD_M05
// "consent.record()"). Used by the compliance UI ("record consent" action) and
// by other modules (form submits, import attestation) to log consent with its
// source + the exact wording shown.
//
// Written on a CALLER-scoped client so the ledger RLS applies (insert = any
// member; the row is immutable afterward — no update/delete policy). The exact
// consent text + any channel metadata are stored in `evidence` (D-037).
//
// Contract:  POST /functions/v1/consent-record   Bearer <jwt>
//   body { workspace_id, contact_id?, channel, granted:boolean, source?, consent_text? }
//   200 { ok:true, data:{ id, kind, granted } }
//   400 bad_request   401 unauthorized   403 forbidden (non-member)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { authUser, userClient } from "../_shared/auth.ts";

const KIND: Record<string, string> = {
  sms: "sms_optin", email: "email_optin", whatsapp: "whatsapp_optin", voice: "voice_optin", cookie: "cookie",
};
const SOURCES = new Set(["form", "keyword", "import", "manual", "unsub_link"]);

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    const user = await authUser(req);
    if (!user) return err(401, "unauthorized", "No valid session");

    const body = await req.json().catch(() => ({}));
    const { workspace_id, contact_id, channel, granted, source, consent_text } = body ?? {};
    if (!workspace_id || !channel || typeof granted !== "boolean") {
      return err(400, "bad_request", "workspace_id, channel and granted are required");
    }
    const kind = KIND[String(channel)];
    if (!kind) return err(400, "unknown_channel", `${channel} is not a consent channel`);
    // Normalise source to the documented vocabulary (form:{id} keeps its suffix).
    const src = typeof source === "string" ? source : "manual";
    const srcHead = src.split(":")[0];
    if (!SOURCES.has(srcHead)) return err(400, "bad_source", `${src} is not a valid consent source`);

    const udb = userClient(req);
    const { data, error } = await udb
      .from("consent_records")
      .insert({
        workspace_id,
        contact_id: contact_id ?? null,
        kind,
        granted,
        source: src,
        evidence: consent_text ? { consent_text: String(consent_text) } : {},
      })
      .select("id, kind, granted")
      .single();
    // RLS denies non-members: surface as 403 rather than a raw 500.
    if (error) {
      const denied = /row-level security|violates/i.test(error.message);
      return err(denied ? 403 : 500, denied ? "forbidden" : "write_failed", error.message);
    }
    return ok(data, 201);
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
