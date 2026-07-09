// functions/crm-export/index.ts — M09 CRM contact export (PRD_M09, permission-gated).
// Returns a CSV of the workspace's contacts. Export is the Gate-2 headline for M09:
// STAFF must NOT be able to export (they lack crm.export) — enforced HERE on a
// caller-scoped client via requirePermission, not just hidden in the UI.
//
// Reads run under the caller's JWT (userClient) so RLS scopes rows to the caller's
// workspace — no service role needed, no cross-tenant reach. Optional filters:
//   ids: string[]         → only these contact ids
//   smart_list_id: uuid   → members of a saved smart list (via smart_list_eval)
//
// Contract:  POST /functions/v1/crm-export   Bearer <jwt>
//   body { workspace_id, ids?, smart_list_id? }
//   200 { ok:true, data:{ csv, count } }
//   400 bad_request  401 unauthorized  403 permission_denied
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { authUser, userClient, requirePermission } from "../_shared/auth.ts";

const COLS = ["first_name", "last_name", "email", "phone", "source", "lead_score", "created_at"];

function toCsv(rows: Record<string, unknown>[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = COLS.join(",");
  const body = rows.map((r) => COLS.map((c) => esc(r[c])).join(",")).join("\n");
  return body ? `${head}\n${body}` : head;
}

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    const user = await authUser(req);
    if (!user) return err(401, "unauthorized", "No valid session");

    const body = await req.json().catch(() => ({}));
    const { workspace_id, ids, smart_list_id } = body ?? {};
    if (!workspace_id) return err(400, "bad_request", "workspace_id is required");

    const udb = userClient(req);

    // Gate-2: export requires crm.export (STAFF is denied → 403).
    const denied = await requirePermission(udb, workspace_id, "crm.export");
    if (denied) return denied;

    // Resolve the id set for a smart list, if given (RLS + membership enforced by the RPC).
    let idFilter: string[] | null = Array.isArray(ids) ? ids : null;
    if (smart_list_id) {
      const { data: list } = await udb.from("smart_lists").select("definition").eq("id", smart_list_id).eq("workspace_id", workspace_id).maybeSingle();
      if (list) {
        const { data: members, error: evalErr } = await udb.rpc("smart_list_eval", { p_ws: workspace_id, p_def: list.definition });
        if (evalErr) return err(500, "eval_failed", evalErr.message);
        idFilter = (members ?? []).map((m: { smart_list_eval: string } | string) => (typeof m === "string" ? m : m.smart_list_eval));
      }
    }

    let q = udb.from("contacts").select(COLS.join(",")).eq("workspace_id", workspace_id).is("deleted_at", null).order("created_at", { ascending: false });
    if (idFilter) q = q.in("id", idFilter.length ? idFilter : ["00000000-0000-0000-0000-000000000000"]);

    const { data: rows, error: readErr } = await q;
    if (readErr) return err(500, "read_failed", readErr.message);

    const csv = toCsv((rows ?? []) as Record<string, unknown>[]);
    return ok({ csv, count: rows?.length ?? 0 });
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
