// functions/integrations-disconnect/index.ts — M41 disconnect a provider.
//   POST { workspace_id | null, provider }   Bearer <jwt>
//
// Re-auth (admin+ / platform-admin) → delete the Vault secret(s) → delete the
// `integrations` reference row (service role — writes are service-role only, D-033).
// Returns status only; nothing sensitive is read or returned.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { serviceClient, userClient, authUser, hasRole } from "../_shared/auth.ts";
import { isProvider } from "../_shared/providers.ts";
import { vaultBaseName } from "../_shared/integrations.ts";

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
    const base = vaultBaseName(workspaceId, provider);

    // LIVE: remove the Vault secret so no orphaned credential lingers. vault schema
    // exposes delete via the secrets table under the service role.
    await admin.schema("vault").from("secrets").delete().eq("name", base);

    // Remove the reference row (scoped by workspace_id null-ness).
    const q = admin.from("integrations").delete().eq("provider", provider);
    const { error: delErr } = workspaceId ? await q.eq("workspace_id", workspaceId) : await q.is("workspace_id", null);
    if (delErr) return err(500, "db_error", delErr.message);

    return ok({ provider, status: "disconnected" });
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
