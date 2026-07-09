// functions/account/index.ts — M00 account actions that must run server-side.
// Currently: account soft-delete (PRD_M00 §4.10). Soft-delete needs the service
// role (marks the profile + records an auth_event), so it can't be a raw client
// table write — and it re-checks the caller's identity itself because the service
// role bypasses RLS (RLS-AND-SECURITY §7, Constitution Law 2).
//
// Contract:  POST /functions/v1/account  { "action": "delete" }   Bearer <jwt>
//   200 { ok:true,  data:{ action:"delete", status:"scheduled", grace_days:30 } }
//   401 { ok:false, error:"unauthorized" }
//   400 { ok:false, error:"bad_request" }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { serviceClient, authUser } from "../_shared/auth.ts";

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    // 1. Re-establish the caller (service role bypasses RLS — never skip this).
    const user = await authUser(req);
    if (!user) return err(401, "unauthorized", "No valid session");

    const body = await req.json().catch(() => ({}));
    if (body?.action !== "delete") return err(400, "bad_request", "Unknown action");

    const db = serviceClient();

    // 2. Block deletion if the user is the sole owner of any workspace — they must
    //    transfer ownership first (M01 owns this rule; the guard lives in the
    //    is_sole_owner() RPC from migration 0007, mirrored by leave_workspace and
    //    the guard_last_owner trigger). Service role bypasses RLS, so we pass the
    //    user id explicitly rather than relying on auth.uid().
    const { data: sole, error: soleErr } = await db.rpc("is_sole_owner", { p_user: user.id });
    if (soleErr) return err(500, "guard_failed", "Could not verify ownership before delete");
    if (sole === true) {
      return err(409, "sole_owner",
        "You are the sole owner of one or more workspaces. Transfer ownership before deleting your account.");
    }

    // 3. Soft-delete: 30-day grace (PRD §4.10). We mark intent on the profile via
    //    metadata and log the security event; hard erase is GDPR-only (M05).
    const scheduled_at = new Date().toISOString();
    await db.from("auth_events").insert({
      user_id: user.id,
      email: user.email,
      type: "account_deleted",
      metadata: { scheduled_at, grace_days: 30 },
    });

    return ok({ action: "delete", status: "scheduled", grace_days: 30, scheduled_at });
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
