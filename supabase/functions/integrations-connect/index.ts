// functions/integrations-connect/index.ts — M41 connect a provider (§5).
//   POST { workspace_id | null, provider, credentials? }   Bearer <jwt>
//
//   api_key / basic → the secret is received ONCE over this authenticated call,
//     written straight to Vault under the §3 name, an `integrations` reference row
//     is inserted (service role), and only the STATUS is returned. The key is never
//     echoed back and never touches a table (Laws 1–3).
//   oauth2 → returns the provider consent URL (state = signed {workspace_id,
//     provider, nonce}); no row until the callback exchanges the code. LIVE OAuth is
//     scaffolded this slice — verified at each provider's own session (M12/M14, D-034).
//
// Role: admin+ for a workspace connection; platform super-admin for a platform
// (workspace_id null) default. Writes run under the service role (they must touch
// Vault atomically) after the caller is re-authorized (RLS-AND-SECURITY §7).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { serviceClient, userClient, authUser, hasRole } from "../_shared/auth.ts";
import { PROVIDER_BY_KEY, isProvider } from "../_shared/providers.ts";
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
    if (!isProvider(provider)) return err(400, "unknown_provider", "No such provider in the registry");

    // Authorize: workspace connection → admin+ of that workspace; platform default →
    // platform super-admin only (never trust workspace_id from the body — §7/§3).
    if (workspaceId) {
      if (!(await hasRole(userClient(req), workspaceId, "admin"))) return err(403, "forbidden", "Requires admin");
    } else if (user.app_metadata?.platform_admin !== true) {
      return err(403, "forbidden", "Platform-default connections require a platform admin");
    }

    const def = PROVIDER_BY_KEY[provider];
    const admin = serviceClient();
    const base = vaultBaseName(workspaceId, provider);
    const scope = workspaceId ? "workspace" : "platform";

    if (def.auth === "api_key" || def.auth === "basic") {
      const creds = body?.credentials ?? {};
      // Every declared field must be present (the browser collected them from the registry).
      for (const f of def.fields ?? []) {
        if (!creds[f]) return err(400, "missing_field", `Missing credential field: ${f}`);
      }
      // Store the whole bundle as ONE JSON secret under the base name (§3). LIVE:
      // vault.create_secret writes to Vault; nothing here is echoed back.
      await admin.schema("vault").rpc("create_secret", {
        new_secret: JSON.stringify(creds),
        new_name: base,
        new_description: `M41 ${provider} (${scope})`,
      });
      // Reference row (service role — writes are service-role only, D-033).
      const { error: insErr } = await admin.from("integrations").upsert({
        workspace_id: workspaceId, provider, auth_type: def.auth, scope,
        status: "connected", vault_secret_name: base, connected_by: user.id,
        config: body?.config ?? {},
      }, { onConflict: workspaceId ? "workspace_id,provider" : "provider" });
      if (insErr) return err(500, "db_error", insErr.message);

      return ok({ provider, scope, status: "connected" }); // status only — never the secret
    }

    // oauth2 — return the consent URL; the row is created by the callback (SCAFFOLD).
    const state = await signState({ workspace_id: workspaceId, provider, nonce: crypto.randomUUID() });
    const consentUrl = buildConsentUrl(provider, def.scopes ?? [], state, req);
    return ok({ provider, scope, status: "pending_oauth", consent_url: consentUrl });
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});

// Signed OAuth state so the callback can trust {workspace_id, provider} without a JWT.
// Scaffold: HMAC-SHA256 over a Vault/env state secret; the callback verifies it (§5).
async function signState(payload: Record<string, unknown>): Promise<string> {
  const body = btoa(JSON.stringify(payload));
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;
}
async function hmacKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("OAUTH_STATE_SECRET") ?? "dev-state-secret";
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
// Per-provider authorize endpoints are filled the session the provider is wired
// (INTEGRATIONS-SPEC §8, just-in-time). Scaffold returns a deterministic placeholder.
function buildConsentUrl(provider: string, scopes: string[], state: string, req: Request): string {
  const redirect = new URL(req.url); redirect.pathname = "/functions/v1/integrations-callback"; redirect.search = "";
  const q = new URLSearchParams({ provider, scope: scopes.join(" "), state, redirect_uri: redirect.toString() });
  return `https://oauth.${provider}.example/authorize?${q.toString()}`;
}
