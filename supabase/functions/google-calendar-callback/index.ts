// functions/google-calendar-callback/index.ts — M14 Google OAuth redirect target.
//   GET /functions/v1/google-calendar-callback?code=…&state=…
//
// No user JWT (Google redirects the browser here) — trust is the SIGNED STATE minted
// by google-calendar-sync (verified BEFORE any side effect, like integrations-callback
// / the webhook rule in EDGE-FUNCTIONS-SPEC §4). On success: exchange the code for a
// token bundle, write the bundle to Vault under the §3 base name (ONE JSON secret —
// the shape _shared/google.ts reads), and upsert the `integrations` row with
// token_expires_at + status=connected (service role). Then redirect back to the app.
//
// LIVE PATH, "ready, not run": needs a real Google OAuth client + toolchain.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { err, preflight } from "../_shared/envelope.ts";
import { serviceClient } from "../_shared/auth.ts";
import { vaultBaseName } from "../_shared/integrations.ts";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const APP_ORIGIN = () => Deno.env.get("APP_ORIGIN") ?? "http://localhost:5173";

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
    const { workspace_id, provider } = state as { workspace_id: string; provider: string };
    if (provider !== "google" || !workspace_id) return err(400, "bad_state", "Unexpected state");

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) return err(409, "not_configured", "Google OAuth client is not configured");

    const redirect = new URL(req.url);
    redirect.search = ""; // redirect_uri must match the connect request exactly

    // Exchange the authorization code for tokens.
    const resp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirect.toString(), grant_type: "authorization_code",
      }).toString(),
    });
    if (!resp.ok) return err(502, "oauth_exchange_failed", `Google rejected the code (${resp.status})`);
    const tok = await resp.json();
    const bundle = {
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_in: tok.expires_in ?? 3600,
    };
    const expiresAt = new Date(Date.now() + bundle.expires_in * 1000).toISOString();

    const admin = serviceClient();
    const base = vaultBaseName(workspace_id, "google");
    await admin.schema("vault").rpc("create_secret", {
      new_secret: JSON.stringify(bundle),
      new_name: base,
      new_description: `M14 google calendar oauth (workspace ${workspace_id})`,
    });
    const { error: upErr } = await admin.from("integrations").upsert({
      workspace_id, provider: "google", auth_type: "oauth2", scope: "workspace",
      status: "connected", vault_secret_name: base, token_expires_at: expiresAt,
    }, { onConflict: "workspace_id,provider" });
    if (upErr) return err(500, "db_error", upErr.message);

    // Back to the calendar settings with a success flag.
    return new Response(null, { status: 302, headers: { Location: `${APP_ORIGIN()}/m14-calendar-and-booking.html?google=connected` } });
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});

async function verifyState(raw: string): Promise<Record<string, unknown> | null> {
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const secret = Deno.env.get("OAUTH_STATE_SECRET") ?? "dev-state-secret";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("HMAC", key, Uint8Array.from(atob(sig), (c) => c.charCodeAt(0)), new TextEncoder().encode(body));
  if (!valid) return null;
  try { return JSON.parse(atob(body)); } catch { return null; }
}
