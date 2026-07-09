// _shared/auth.ts — standard auth preamble for user-facing Edge Functions.
// Never trust a workspace_id from the body without re-checking membership/role/
// permission for THIS user (EDGE-FUNCTIONS-SPEC §3, Constitution Law 2).
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { err } from "./envelope.ts";

// Service-role client (server-side only — bypasses RLS; never shipped to browser).
// NOTE: the service role has NO auth.uid(), so DB helpers that read auth.uid()
// (is_member / has_role / has_permission) return false on this client. Use it only
// for privileged writes or the *_for(p_user,…) explicit-user helpers.
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// Caller-scoped client (anon key + the caller's JWT). RLS applies and auth.uid()
// resolves to the caller, so has_role() / has_permission() work correctly. This is
// the right client for authorization checks on the request path (M02, D-023).
export function userClient(req: Request): SupabaseClient {
  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } },
  );
}

// Resolve the caller from the Authorization: Bearer <jwt> header.
export async function authUser(req: Request) {
  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!jwt) return null;
  const { data } = await serviceClient().auth.getUser(jwt);
  return data.user ?? null;
}

// Membership/role check for a specific workspace, via the DB helper has_role().
export async function hasRole(
  db: SupabaseClient,
  workspace_id: string,
  min_role: "client" | "staff" | "manager" | "admin" | "owner",
): Promise<boolean> {
  const { data, error } = await db.rpc("has_role", { ws: workspace_id, min_role });
  return !error && data === true;
}

// Fine-grained permission check for a specific workspace, via has_permission().
// Pass a CALLER-scoped client (userClient) so auth.uid() = the caller (M02, D-023).
export async function hasPermission(
  db: SupabaseClient,
  workspace_id: string,
  perm: string,
): Promise<boolean> {
  const { data, error } = await db.rpc("has_permission", { ws: workspace_id, perm });
  return !error && data === true;
}

// requirePermission — the canonical guard every M02+ Edge Function calls after
// authUser() + reading a workspace_id from the body. Returns a 403 envelope
// Response to short-circuit on deny, or null to continue. `userDb` MUST be a
// caller-scoped client (userClient(req)); see PRD_M02 §3 / RLS-AND-SECURITY §2.
export async function requirePermission(
  userDb: SupabaseClient,
  workspace_id: string,
  perm: string,
): Promise<Response | null> {
  if (await hasPermission(userDb, workspace_id, perm)) return null;
  return err(403, "permission_denied", `Requires ${perm}`);
}

// requirePlatformAdmin — the guard every /admin Edge Function calls after
// authUser(). is_platform_admin() (M41, 0010) reads the JWT claims GUC directly,
// so a CALLER-scoped client (userClient(req)) resolves the platform_admin claim.
// Returns a 403 envelope Response on deny, or null to continue (M44, D-078).
export async function requirePlatformAdmin(userDb: SupabaseClient): Promise<Response | null> {
  const { data, error } = await userDb.rpc("is_platform_admin");
  if (!error && data === true) return null;
  return err(403, "not_platform_admin", "Platform admin required");
}
