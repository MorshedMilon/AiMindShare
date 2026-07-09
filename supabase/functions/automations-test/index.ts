// functions/automations-test/index.ts — M13 "Test with contact" (sandbox run).
// Enrols a SANDBOX execution (is_test=true) of a workflow against a chosen contact
// and enqueues the walker. The walker suppresses every real send and collapses
// waits, so the operator sees the full path + per-node step logs without any live
// side effect (PRD_M13 §2 "Testing"). Manager+ only (automations are config).
//
// Contract:  POST /functions/v1/automations-test   Bearer <jwt>
//   body { "workspace_id":"<uuid>", "workflow_id":"<uuid>", "contact_id":"<uuid?>" }
//   200 { ok:true, data:{ execution_id } }
//   400 bad_request  401 unauthorized  403 forbidden  404 not_found
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
    const { workspace_id, workflow_id, contact_id } = body ?? {};
    if (!workspace_id || !workflow_id) {
      return err(400, "bad_request", "workspace_id and workflow_id are required");
    }
    // Law 2: automations are manager+ config; re-check for THIS caller.
    if (!(await hasRole(userClient(req), workspace_id, "manager"))) {
      return err(403, "forbidden", "Requires manager+");
    }

    const svc = serviceClient();
    // Pin to the workflow's CURRENT version (same as a live enrolment).
    const { data: wf, error: wfErr } = await svc
      .from("workflows").select("id, version, workspace_id")
      .eq("id", workflow_id).eq("workspace_id", workspace_id).maybeSingle();
    if (wfErr) return err(500, "read_failed", wfErr.message);
    if (!wf) return err(404, "not_found", "Workflow not found in this workspace");

    const { data: exec, error: exErr } = await svc
      .from("workflow_executions")
      .insert({
        workspace_id, workflow_id, workflow_version: wf.version,
        contact_id: contact_id ?? null, is_test: true,
        trigger_payload: { _test: true, contact_id: contact_id ?? null },
      })
      .select("id").single();
    if (exErr) return err(500, "enrol_failed", exErr.message);

    // Enqueue the walker (queued job — the worker claims it).
    const { error: jobErr } = await svc.from("jobs").insert({
      workspace_id, type: "automation.execute",
      payload: { execution_id: exec.id, workspace_id },
      idempotency_key: `automation-exec-${exec.id}`,
    });
    if (jobErr) return err(500, "enqueue_failed", jobErr.message);

    return ok({ execution_id: exec.id });
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
