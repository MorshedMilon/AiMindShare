// functions/contacts-import/index.ts — M09 CSV import intake (PRD_M09; Law 5 async).
// The browser parses the CSV and posts the rows + column mapping; this function
// records a contact_imports tracking row (status 'pending') and enqueues a
// `contact.import` job. A worker does the chunked insert/update + row-level error
// report — the browser NEVER processes rows itself (Gate-4). The wizard polls the
// contact_imports row for progress + the final error_report.
//
// consent_attested mirrors the M05 attestation checkbox: the operator affirms they
// have lawful basis to contact these people (the worker may write consent_records).
//
// Authorization: staff+ may import (crm.create; RLS on contact_imports is staff+ &
// pending-only). Rows are validated for shape only here; per-row errors surface from
// the worker so a 10k-row file doesn't block the request.
//
// Contract:  POST /functions/v1/contacts-import   Bearer <jwt>
//   body { workspace_id, mapping:{csvCol:contactField}, rows:string[][]|object[], consent_attested?, file_path? }
//   200 { ok:true, data:{ import_id, job_id, total_rows } }
//   400 bad_request  401 unauthorized  403 permission_denied
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { authUser, userClient, requirePermission } from "../_shared/auth.ts";

const MAX_ROWS = 10_000;

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    const user = await authUser(req);
    if (!user) return err(401, "unauthorized", "No valid session");

    const body = await req.json().catch(() => ({}));
    const { workspace_id, mapping, rows, consent_attested, file_path } = body ?? {};
    if (!workspace_id || !mapping || !Array.isArray(rows)) {
      return err(400, "bad_request", "workspace_id, mapping and rows[] are required");
    }
    if (rows.length === 0) return err(400, "bad_request", "no rows to import");
    if (rows.length > MAX_ROWS) return err(400, "too_large", `import is capped at ${MAX_ROWS} rows`);

    const udb = userClient(req);

    // staff+ may create contacts (crm.create). RLS on contact_imports also gates this.
    const denied = await requirePermission(udb, workspace_id, "crm.create");
    if (denied) return denied;

    // 1. Tracking row (RLS: staff+, status must be 'pending').
    const { data: imp, error: impErr } = await udb
      .from("contact_imports")
      .insert({
        workspace_id,
        file_path: file_path ?? null,
        mapping,
        status: "pending",
        total_rows: rows.length,
        consent_attested: !!consent_attested,
        created_by: user.id,
      })
      .select("id, total_rows")
      .single();
    if (impErr) {
      const rls = /row-level security|violates/i.test(impErr.message);
      return err(rls ? 403 : 500, rls ? "permission_denied" : "write_failed", impErr.message);
    }

    // 2. Enqueue the worker job (RLS: member + status='queued'; idempotent on import id).
    const { data: job, error: jobErr } = await udb
      .from("jobs")
      .insert({
        workspace_id,
        type: "contact.import",
        payload: { import_id: imp.id, mapping, rows, consent_attested: !!consent_attested },
        status: "queued",
        idempotency_key: `contact.import:${imp.id}`,
      })
      .select("id")
      .single();
    if (jobErr) return err(500, "enqueue_failed", jobErr.message);

    return ok({ import_id: imp.id, job_id: job.id, total_rows: imp.total_rows }, 201);
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
