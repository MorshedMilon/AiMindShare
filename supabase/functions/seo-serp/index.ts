// functions/seo-serp/index.ts — M21 SERP analysis (SerpApi).
// keyword → top-10 organic + SERP-feature flags (featured snippet / PAA / local pack).
// No cache (SERP is volatile — always fresh); meters seo_calls per call. staff+ only.
//
// Ready-not-run: no SerpApi cred → 503 not_connected (honest connect prompt).
//
// Contract:  POST /functions/v1/seo-serp   Bearer <jwt>
//   body { workspace_id, keyword, country? }
//   200 { ok:true, data:{ results[], features } }
//   400 · 401 · 403 · 502 · 503
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { authUser, userClient, hasRole, serviceClient } from "../_shared/auth.ts";
import { serpApiTop10 } from "../_shared/seo.ts";
import { NotConnectedError, NeedsReauthError } from "../_shared/integrations.ts";

serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  if (req.method !== "POST") return err(405, "method_not_allowed");

  const user = await authUser(req);
  if (!user) return err(401, "unauthorized");

  let body: any;
  try { body = await req.json(); } catch { return err(400, "bad_request", "invalid JSON"); }
  const { workspace_id, keyword, country = "us" } = body ?? {};
  if (!workspace_id || !keyword?.trim()) return err(400, "bad_request", "workspace_id and keyword required");

  if (!(await hasRole(userClient(req), workspace_id, "staff"))) return err(403, "forbidden");

  try {
    const data = await serpApiTop10(serviceClient(), workspace_id, keyword.trim(), country);
    return ok(data);
  } catch (e) {
    if (e instanceof NotConnectedError) return err(503, "not_connected", "Connect SerpApi in Integrations");
    if (e instanceof NeedsReauthError) return err(503, "needs_reauth", "Reconnect SerpApi");
    return err(502, "provider_error", String((e as Error).message));
  }
});
