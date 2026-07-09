// functions/permission-check/index.ts — M02 fine-grained permission gate.
// TWO jobs:
//   1) The Gate-2 acceptance proof — "permission overrides read by a test Edge Fn":
//      it resolves the caller's EFFECTIVE permission (built-in/custom role grant,
//      plus per-member grant/revoke overrides in memberships.permissions) entirely
//      server-side, so a STAFF user is denied crm.delete even if the UI is spoofed.
//   2) The canonical requirePermission() reference every future module copies:
//      authUser → caller-scoped client → requirePermission → act.
//
// The service role bypasses RLS AND has no auth.uid(), so authorization runs on a
// CALLER-scoped client (userClient) where has_permission() sees the real caller
// (RLS-AND-SECURITY §7, Constitution Law 2, DECISIONS D-023).
//
// Contract:  POST /functions/v1/permission-check   Bearer <jwt>
//   body { "workspace_id": "<uuid>", "permission": "crm.delete" }
//   200 { ok:true,  data:{ allowed:true, workspace_id, permission } }
//   403 { ok:false, error:"permission_denied", message:"Requires crm.delete", required:"crm.delete" }
//   400 { ok:false, error:"bad_request" }   401 { ok:false, error:"unauthorized" }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight, cors } from "../_shared/envelope.ts";
import { authUser, userClient, hasPermission } from "../_shared/auth.ts";
import { isPermission } from "../_shared/permissions.ts";

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    // 1. Re-establish the caller (service role bypasses RLS — never skip this).
    const user = await authUser(req);
    if (!user) return err(401, "unauthorized", "No valid session");

    const body = await req.json().catch(() => ({}));
    const workspace_id = body?.workspace_id;
    const permission = body?.permission;
    if (!workspace_id || !permission) {
      return err(400, "bad_request", "workspace_id and permission are required");
    }
    if (!isPermission(permission)) {
      return err(400, "unknown_permission", `${permission} is not in the registry`);
    }

    // 2. Resolve on a CALLER-scoped client so has_permission() reads auth.uid() =
    //    the caller (role grant ∪ member grant − member revoke, owner short-circuit).
    const udb = userClient(req);
    const allowed = await hasPermission(udb, workspace_id, permission);

    if (!allowed) {
      // Richer 403 than the shared helper (PRD_M02 §3 wants `required`), same shape.
      return new Response(
        JSON.stringify({
          ok: false,
          error: "permission_denied",
          message: `Requires ${permission}`,
          required: permission,
        }),
        { status: 403, headers: { "Content-Type": "application/json", ...cors } },
      );
    }
    return ok({ allowed: true, workspace_id, permission });
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
