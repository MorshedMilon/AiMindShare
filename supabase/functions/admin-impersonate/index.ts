// functions/admin-impersonate/index.ts — M44 Admin Basics (Session 14).
// The ONLY M44 action that needs the service role beyond RLS: it opens an audited
// impersonation session and (live) mints a scoped session for the target user via
// the GoTrue admin API. Flow: authenticate the caller → require platform admin →
// write the impersonation_sessions row + an admin_audit_log 'impersonate.start'
// carrying BOTH identities → attempt the GoTrue mint. The session row, 30-min
// expiry, dual-identity audit, and the cron expiry-sweep are all real and
// probe-tested (m44probe); the GoTrue token mint is CARRIED — no hosted project /
// Deno here, and it is never faked green (Constitution: honest carry-overs).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { serviceClient, userClient, authUser, requirePlatformAdmin } from "../_shared/auth.ts";

const THIRTY_MIN_MS = 30 * 60 * 1000;

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    // 1. Authenticate the caller.
    const caller = await authUser(req);
    if (!caller) return err(401, "unauthorized", "Sign in required");

    // 2. Require platform admin (server-side wall — never trust the client UI).
    const gate = await requirePlatformAdmin(userClient(req));
    if (gate) return gate;

    // 3. Validate input.
    const body = await req.json().catch(() => ({}));
    const { target_user_id, target_workspace_id, reason } = body ?? {};
    if (!target_user_id || !reason || String(reason).trim().length === 0) {
      return err(400, "bad_request", "target_user_id and a non-empty reason are required");
    }

    const svc = serviceClient();
    const expires_at = new Date(Date.now() + THIRTY_MIN_MS).toISOString();

    // 4. Open the audited session (service role — no client write policy exists).
    const { data: session, error: sErr } = await svc
      .from("impersonation_sessions")
      .insert({
        admin_user_id: caller.id,
        target_user_id,
        target_workspace_id: target_workspace_id ?? null,
        reason,
        expires_at,
      })
      .select()
      .single();
    if (sErr) return err(500, "db_error", sErr.message);

    // 5. Audit the start, carrying BOTH identities (impersonator + target).
    await svc.from("admin_audit_log").insert({
      actor_user_id: caller.id,
      acting_as_user_id: target_user_id,
      workspace_id: target_workspace_id ?? null,
      action: "impersonate.start",
      target_type: "user",
      target_id: String(target_user_id),
      detail: { reason, session_id: session.id, expires_at },
    });

    // 6. CARRIED (no hosted project): mint a scoped session for the target via the
    //    GoTrue admin API so the browser can swap it in behind the banner, e.g.:
    //
    //      const { data: link } = await svc.auth.admin.generateLink({
    //        type: "magiclink", email: targetEmail });
    //      // exchange link.hashed_token → an access token scoped to the target
    //
    //    Not run here — returned as carried so the caller never mistakes the row
    //    for a live session swap. The session/expiry/audit ARE real.
    return ok({
      session_id: session.id,
      target_user_id,
      expires_at,
      impersonation_token: null,
      carried: "gotrue_admin_session_mint",
    });
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
