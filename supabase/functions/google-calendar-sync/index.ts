// functions/google-calendar-sync/index.ts — M14 Google Calendar connect + status.
// Google is the FIRST OAuth provider wired live (INTEGRATIONS-SPEC: "live Google at
// M14"). Calendar needs freebusy + event sync beyond the generic M41 connect, so it
// gets a dedicated function pair (this + google-calendar-callback) rather than filling
// the shared M41 scaffold — keeping integrations-connect/-callback untouched (D-M14).
//
//   POST { workspace_id, action:'connect' }  Bearer <jwt>  (admin+)
//     → { consent_url }  — the real Google OAuth consent URL (offline access)
//   POST { workspace_id, action:'status' }   Bearer <jwt>  (staff+)
//     → { connected, token_expires_at }
//
// Vault Law 3: no secret is ever returned. The token bundle is written by the
// callback; this function only mints the signed consent URL + reads status.
//
// LIVE PATH, "ready, not run": no Google OAuth client / Deno toolchain on the build
// machine — verified by code review + the m14 probe's RPC contract, not executed.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { serviceClient, userClient, authUser, hasRole } from "../_shared/auth.ts";
import { GOOGLE_CALENDAR_SCOPES } from "../_shared/google.ts";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    const user = await authUser(req);
    if (!user) return err(401, "unauthorized", "No valid session");

    const { workspace_id, action } = await req.json().catch(() => ({}));
    if (!workspace_id) return err(400, "bad_request", "workspace_id is required");

    if (action === "status") {
      if (!(await hasRole(userClient(req), workspace_id, "staff"))) return err(403, "forbidden", "Requires staff");
      const { data } = await serviceClient().from("integrations")
        .select("status, token_expires_at").eq("provider", "google").eq("workspace_id", workspace_id).maybeSingle();
      return ok({ connected: data?.status === "connected", status: data?.status ?? "disconnected", token_expires_at: data?.token_expires_at ?? null });
    }

    // connect — admin+ (a workspace connection touches Vault).
    if (!(await hasRole(userClient(req), workspace_id, "admin"))) return err(403, "forbidden", "Requires admin");
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    if (!clientId) return err(409, "not_configured", "Google OAuth client is not configured on this environment");

    const redirect = new URL(req.url);
    redirect.pathname = "/functions/v1/google-calendar-callback";
    redirect.search = "";
    const state = await signState({ workspace_id, provider: "google", nonce: crypto.randomUUID() });
    const q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirect.toString(),
      response_type: "code",
      scope: GOOGLE_CALENDAR_SCOPES.join(" "),
      access_type: "offline",   // get a refresh_token
      prompt: "consent",        // ensure a refresh_token is returned on reconnect
      state,
    });
    return ok({ consent_url: `${AUTH_URL}?${q.toString()}` });
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});

// Signed OAuth state — identical HMAC scheme to integrations-connect (§5), so the
// callback can trust {workspace_id, provider} without a JWT.
async function signState(payload: Record<string, unknown>): Promise<string> {
  const body = btoa(JSON.stringify(payload));
  const secret = Deno.env.get("OAUTH_STATE_SECRET") ?? "dev-state-secret";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;
}
