// functions/integrations-callback/index.ts — M41 OAuth2 redirect target (§5).
//   GET /functions/v1/integrations-callback?code=…&state=…
//
// No user JWT (the provider redirects the browser here) — trust is the SIGNED STATE
// minted by integrations-connect (verify it BEFORE any side effect, mirroring the
// webhook rule in EDGE-FUNCTIONS-SPEC §4). On success: exchange the code for a token
// bundle, write the bundle to Vault under the §3 name, and upsert the `integrations`
// row with token_expires_at + status=connected (service role).
//
// SCAFFOLD (D-034): the state-verify + Vault-write + row-upsert SHAPE is here and
// correct; the live token exchange is filled the session each OAuth provider is wired
// (Google → M14, Meta → M12). `verify_jwt = false` in config.toml (signed state, no JWT).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { serviceClient } from "../_shared/auth.ts";
import { isProvider } from "../_shared/providers.ts";
import { vaultBaseName } from "../_shared/integrations.ts";

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    if (!code || !stateRaw) return err(400, "bad_request", "Missing code or state");

    const state = await verifyState(stateRaw);
    if (!state) return err(401, "bad_state", "State signature invalid or tampered"); // drop before any side effect
    const { workspace_id, provider } = state as { workspace_id: string | null; provider: string };
    if (!isProvider(provider)) return err(400, "unknown_provider", "No such provider");

    const admin = serviceClient();
    const base = vaultBaseName(workspace_id, provider);

    // LIVE (per-provider, just-in-time §8): exchange `code` at the provider token
    // endpoint → { access_token, refresh_token, expires_in }. Scaffolded here.
    const bundle = await exchangeCode(provider, code); // → carried live
    const expiresAt = bundle?.expires_in
      ? new Date(Date.now() + bundle.expires_in * 1000).toISOString()
      : null;

    await admin.schema("vault").rpc("create_secret", {
      new_secret: JSON.stringify(bundle),
      new_name: base,
      new_description: `M41 ${provider} oauth (${workspace_id ? "workspace" : "platform"})`,
    });
    const { error: upErr } = await admin.from("integrations").upsert({
      workspace_id, provider, auth_type: "oauth2",
      scope: workspace_id ? "workspace" : "platform",
      status: "connected", vault_secret_name: base, token_expires_at: expiresAt,
    }, { onConflict: workspace_id ? "workspace_id,provider" : "provider" });
    if (upErr) return err(500, "db_error", upErr.message);

    return ok({ provider, status: "connected" });
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});

async function verifyState(raw: string): Promise<Record<string, unknown> | null> {
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const secret = Deno.env.get("OAUTH_STATE_SECRET") ?? "dev-state-secret";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("HMAC", key, Uint8Array.from(atob(sig), (c) => c.charCodeAt(0)), new TextEncoder().encode(body));
  if (!ok) return null;
  try { return JSON.parse(atob(body)); } catch { return null; }
}

// Per-provider exchange filled at each provider's session (§8). Scaffold shape.
async function exchangeCode(_provider: string, _code: string): Promise<{ access_token?: string; refresh_token?: string; expires_in?: number }> {
  return { access_token: undefined, refresh_token: undefined, expires_in: undefined };
}
