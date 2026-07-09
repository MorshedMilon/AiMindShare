// functions/forms-export/index.ts — M15 form submissions export (permission-gated).
// Returns a CSV of ONE form's submissions. Submissions are contact data, so export is
// gated on crm.export — the SAME gate M09's crm-export uses (M15 reuses the registry
// key; it does not invent a new one). STAFF lacks crm.export → 403, enforced HERE on a
// caller-scoped client via requirePermission, not just hidden in the UI (Gate-2 posture).
//
// Reads run under the caller's JWT (userClient) so RLS scopes rows to the caller's
// workspace — the fsub_sel policy (is_member) means a caller can only ever export their
// OWN workspace's submissions. No service role, no cross-tenant reach (D-055 keeps the
// service role for the public WRITE path; the authed READ path uses the caller's client).
//
// The flat CSV is: fixed base columns + one column per distinct answers_json key found
// across the form's submissions (stable, sorted) + one column per distinct utm_json key.
//
// Contract:  POST /functions/v1/forms-export   Bearer <jwt>
//   body { workspace_id, form_id }
//   200 text/csv  (Content-Disposition: attachment; filename="<form-name>-submissions.csv")
//   400 bad_request  401 unauthorized  403 permission_denied  404 not_found
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { err, preflight, cors } from "../_shared/envelope.ts";
import { authUser, userClient, requirePermission } from "../_shared/auth.ts";

// Stable base columns (always present, in this order), then dynamic answer/UTM columns.
const BASE_COLS = ["submission_id", "created_at", "contact_id", "status", "score", "result_tier", "variant"];

// crm-export's exact escape rule: quote a field containing comma/quote/newline and
// double any internal quote.
function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Sanitize the form name into a safe filename segment (fallback to "form").
function safeName(name: string): string {
  const s = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "form";
}

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    const user = await authUser(req);
    if (!user) return err(401, "unauthorized", "No valid session");

    const body = await req.json().catch(() => ({}));
    const { workspace_id, form_id } = body ?? {};
    if (!workspace_id) return err(400, "bad_request", "workspace_id is required");
    if (!form_id) return err(400, "bad_request", "form_id is required");

    const udb = userClient(req);

    // Gate-2: exporting submissions (contact data) requires crm.export (STAFF → 403).
    const denied = await requirePermission(udb, workspace_id, "crm.export");
    if (denied) return denied;

    // The form — read through the CALLER-scoped client so RLS confirms the caller's
    // workspace owns it (forms_sel = is_member). A form in another workspace, or a
    // mismatched workspace_id, resolves to no row → 404.
    const { data: form } = await udb.from("forms")
      .select("name").eq("id", form_id).eq("workspace_id", workspace_id).maybeSingle();
    if (!form) return err(404, "not_found", "Form not found");

    // Submissions — RLS-scoped read (fsub_sel = is_member). eq(workspace_id) is
    // belt-and-suspenders; RLS already fences cross-tenant rows.
    const { data: rows, error: readErr } = await udb.from("form_submissions")
      .select("id, created_at, contact_id, status, score, result_tier, variant, answers_json, utm_json")
      .eq("form_id", form_id).eq("workspace_id", workspace_id)
      .order("created_at", { ascending: false });
    if (readErr) return err(500, "read_failed", readErr.message);

    const subs = (rows ?? []) as Record<string, unknown>[];

    // Union of answer keys + UTM keys across all submissions (stable, sorted order) so
    // the header is deterministic and every row lines up under the same columns.
    const answerKeys = new Set<string>();
    const utmKeys = new Set<string>();
    for (const r of subs) {
      const a = (r.answers_json ?? {}) as Record<string, unknown>;
      const u = (r.utm_json ?? {}) as Record<string, unknown>;
      for (const k of Object.keys(a)) answerKeys.add(k);
      for (const k of Object.keys(u)) utmKeys.add(k);
    }
    const answerCols = [...answerKeys].sort();
    const utmColKeys = [...utmKeys].sort();

    const header = [...BASE_COLS, ...answerCols, ...utmColKeys.map((k) => `utm_${k}`)].map(esc).join(",");
    const lines = subs.map((r) => {
      const a = (r.answers_json ?? {}) as Record<string, unknown>;
      const u = (r.utm_json ?? {}) as Record<string, unknown>;
      const cells = [
        r.id, r.created_at, r.contact_id, r.status, r.score, r.result_tier, r.variant,
        ...answerCols.map((k) => a[k]),
        ...utmColKeys.map((k) => u[k]),
      ];
      return cells.map(esc).join(",");
    });
    const csv = lines.length ? `${header}\n${lines.join("\n")}` : header;

    const filename = `${safeName((form as { name: string }).name)}-submissions.csv`;
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        ...cors,
      },
    });
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
