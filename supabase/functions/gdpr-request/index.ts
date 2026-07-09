// functions/gdpr-request/index.ts — M05 GDPR/CCPA data-subject request intake.
// Creates a gdpr_requests row (30-day SLA) and enqueues the worker job that does
// the heavy lifting (PRD_M05; BUILD-SEQUENCE S7 "GDPR request intake →
// gdpr.export/erase jobs"). The browser never runs the export/erase itself —
// it only enqueues a 'queued' job (RLS), which a worker claims (Gate-4).
//
//   request_type: access | rectify → gdpr.export   (compile the subject's data)
//                 delete           → gdpr.erase     (anonymise cascade; admin+)
//
// Authorization: any staff+ may open access/rectify requests; DELETE (right-to-
// be-forgotten) is destructive → admin+ only, re-checked here on a CALLER-scoped
// client (Law 2). The public per-workspace intake form (/privacy/{slug}/request)
// is a separate anon path deferred to when a slug→workspace resolver exists.
//
// Contract:  POST /functions/v1/gdpr-request   Bearer <jwt>
//   body { workspace_id, request_type:"access|delete|rectify", email?, contact_id?, notes? }
//   200 { ok:true, data:{ request_id, job_id, kind, due_at } }
//   400 bad_request   401 unauthorized   403 forbidden
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { authUser, userClient, hasRole } from "../_shared/auth.ts";

const TYPE_TO_KIND: Record<string, "gdpr_export" | "gdpr_erase"> = {
  access: "gdpr_export", rectify: "gdpr_export", delete: "gdpr_erase",
};

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    const user = await authUser(req);
    if (!user) return err(401, "unauthorized", "No valid session");

    const body = await req.json().catch(() => ({}));
    const { workspace_id, request_type, email, contact_id, notes } = body ?? {};
    if (!workspace_id || !request_type) return err(400, "bad_request", "workspace_id and request_type are required");
    const kind = TYPE_TO_KIND[String(request_type)];
    if (!kind) return err(400, "bad_request", "request_type must be access, delete or rectify");

    const udb = userClient(req);

    // DELETE is destructive — admin+ only (staff can open access/rectify).
    if (kind === "gdpr_erase" && !(await hasRole(udb, workspace_id, "admin"))) {
      return err(403, "forbidden", "Deletion (right-to-be-forgotten) requires an admin");
    }

    const due_at = new Date(Date.now() + 30 * 864e5).toISOString();

    // 1. Create the request row (RLS: staff+, status must be 'pending').
    const { data: reqRow, error: reqErr } = await udb
      .from("gdpr_requests")
      .insert({
        workspace_id,
        contact_id: contact_id ?? null,
        kind,
        request_type,
        requested_email: email ?? null,
        status: "pending",
        due_at,
        notes: notes ?? null,
      })
      .select("id, due_at")
      .single();
    if (reqErr) {
      const denied = /row-level security|violates/i.test(reqErr.message);
      return err(denied ? 403 : 500, denied ? "forbidden" : "write_failed", reqErr.message);
    }

    // 2. Enqueue the worker job (RLS: member + status='queued'; idempotent).
    const { data: job, error: jobErr } = await udb
      .from("jobs")
      .insert({
        workspace_id,
        type: kind === "gdpr_export" ? "gdpr.export" : "gdpr.erase",
        payload: { request_id: reqRow.id, contact_id: contact_id ?? null },
        status: "queued",
        idempotency_key: `gdpr:${reqRow.id}:${kind === "gdpr_export" ? "export" : "erase"}`,
      })
      .select("id")
      .single();
    if (jobErr) return err(500, "enqueue_failed", jobErr.message);

    return ok({ request_id: reqRow.id, job_id: job.id, kind, due_at: reqRow.due_at }, 201);
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
