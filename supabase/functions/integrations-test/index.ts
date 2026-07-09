// functions/integrations-test/index.ts — M41 "Test now" health ping (§5, the
// slice's connection-health accept-when).
//   POST { workspace_id | null, provider }   Bearer <jwt>
//
// Re-auth (admin+ / platform-admin) → resolveCredential() (the sole credential path)
// → the provider's cheap status call → update last_health_check / status / last_error
// on the row (service role). The same check the hourly `integration.health_check` job
// runs; this is the on-demand version the connections UI triggers.
//
// The per-provider ping map is just-in-time (§8) — un-wired providers report a generic
// reachable result and stamp last_health_check; a revoked key flips status to 'error'.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { serviceClient, userClient, authUser, hasRole } from "../_shared/auth.ts";
import { isProvider } from "../_shared/providers.ts";
import { resolveCredential, NotConnectedError, NeedsReauthError } from "../_shared/integrations.ts";

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    const user = await authUser(req);
    if (!user) return err(401, "unauthorized", "No valid session");

    const body = await req.json().catch(() => ({}));
    const workspaceId: string | null = body?.workspace_id ?? null;
    const provider: string = body?.provider ?? "";
    if (!isProvider(provider)) return err(400, "unknown_provider", "No such provider");

    if (workspaceId) {
      if (!(await hasRole(userClient(req), workspaceId, "admin"))) return err(403, "forbidden", "Requires admin");
    } else if (user.app_metadata?.platform_admin !== true) {
      return err(403, "forbidden", "Platform-default connections require a platform admin");
    }

    const admin = serviceClient();
    // resolveCredential throws NotConnected/NeedsReauth → mapped to the envelope below.
    const { secret, integrationId } = await resolveCredential(admin, workspaceId ?? "", provider);

    // Provider cheap status call (per-provider map §8). Scaffold: reachable if a secret
    // resolved. A real ping that 401s would set ok=false → status 'error' + last_error.
    const { healthy, message } = await pingProvider(provider, secret);

    const patch = {
      status: healthy ? "connected" : "error",
      last_health_check: new Date().toISOString(),
      last_error: healthy ? null : message,
    };
    const { error: upErr } = await admin.from("integrations").update(patch).eq("id", integrationId);
    if (upErr) return err(500, "db_error", upErr.message);

    return ok({ provider, status: patch.status, last_health_check: patch.last_health_check });
  } catch (e) {
    if (e instanceof NotConnectedError) return err(404, "not_connected", `${e.provider} is not connected`);
    if (e instanceof NeedsReauthError) return err(409, "needs_reauth", `${e.provider} needs re-authentication`);
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});

// Per-provider health map filled at each provider's session (§8). Scaffold: a resolved
// secret means the connection is wired; real providers replace this with a status call.
async function pingProvider(_provider: string, secret: string): Promise<{ healthy: boolean; message?: string }> {
  return { healthy: !!secret, message: secret ? undefined : "no_credential" };
}
