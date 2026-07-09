// functions/automations-trigger/index.ts — M13 trigger-bus HTTP entry.
// The platform's event entry point. Modules usually call the SQL emit_trigger()
// directly (it's SECURITY DEFINER), but this endpoint exposes the same bus over
// HTTP for the app and for external/webhook sources (PRD_M13 §4
// "/api/automations/trigger"). It re-checks the caller is a member of the target
// workspace (Law 2 — never trust a body workspace_id) then calls emit_trigger on a
// service client, which finds matching active workflows, applies re-entry rules,
// and enqueues automation.execute jobs.
//
// Contract:  POST /functions/v1/automations-trigger   Bearer <jwt>
//   body { "workspace_id":"<uuid>", "trigger_type":"contact.created|tag.added|...",
//          "payload": { "contact_id":"<uuid>", ... } }
//   200 { ok:true, data:{ enrolled: <int> } }
//   400 bad_request  401 unauthorized  403 forbidden
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { authUser, userClient, serviceClient, hasRole } from "../_shared/auth.ts";

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    const user = await authUser(req);
    if (!user) return err(401, "unauthorized", "No valid session");

    const body = await req.json().catch(() => ({}));
    const { workspace_id, trigger_type, payload } = body ?? {};
    if (!workspace_id || !trigger_type) {
      return err(400, "bad_request", "workspace_id and trigger_type are required");
    }

    // Law 2: re-check membership for THIS caller on THIS workspace.
    if (!(await hasRole(userClient(req), workspace_id, "staff"))) {
      return err(403, "forbidden", "Not a member of this workspace");
    }

    const { data, error } = await serviceClient().rpc("emit_trigger", {
      p_ws: workspace_id, p_type: String(trigger_type), p_payload: payload ?? {},
    });
    if (error) return err(500, "emit_failed", error.message);

    return ok({ enrolled: data ?? 0 });
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
