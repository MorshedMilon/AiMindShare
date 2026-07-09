// functions/sms-can-send/index.ts — M05 A2P gate. THE mandatory pre-send contract
// for SMS (PRD_M05 "sms.canSend(workspaceId)"). M12/M16/M34 call this before any
// SMS send: an unregistered workspace is blocked here with a clear reason (→ the
// A2P wizard), never a cryptic Twilio 10DLC error downstream.
//
// A workspace may send SMS only when BOTH its 10DLC brand AND campaign are
// 'approved' in a2p_registrations. Read on a CALLER-scoped client (RLS: staff+).
//
// Contract:  POST /functions/v1/sms-can-send   Bearer <jwt>
//   body { "workspace_id":"<uuid>" }
//   200 { ok:true, data:{ allowed:false, brand_status, campaign_status, reason } }
//   400 bad_request   401 unauthorized
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { authUser, userClient } from "../_shared/auth.ts";

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    const user = await authUser(req);
    if (!user) return err(401, "unauthorized", "No valid session");

    const body = await req.json().catch(() => ({}));
    const workspace_id = body?.workspace_id;
    if (!workspace_id) return err(400, "bad_request", "workspace_id is required");

    const udb = userClient(req);
    const { data, error } = await udb
      .from("a2p_registrations")
      .select("brand_status, campaign_status")
      .eq("workspace_id", workspace_id)
      .maybeSingle();
    if (error) return err(500, "read_failed", error.message);

    const brand = data?.brand_status ?? "not_started";
    const campaign = data?.campaign_status ?? "not_started";
    const allowed = brand === "approved" && campaign === "approved";
    const reason = allowed
      ? "10DLC brand and campaign approved"
      : "Complete A2P 10DLC registration before sending SMS";
    return ok({ allowed, brand_status: brand, campaign_status: campaign, reason });
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
