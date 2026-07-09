// functions/seo-keyword-lookup/index.ts — M21 keyword research (DataForSEO).
// seed → { volume, cpc, difficulty, intent, serp_features, related[], questions[],
// longtail[] }. Checks the 30-day workspace cache FIRST (seo_cache_get) and only spends
// a provider call + meter on a miss (seo_cache_put on the way out). staff+ only.
//
// Ready-not-run: with no DataForSEO cred in the Vault, resolveCredential throws
// NotConnectedError → 503 not_connected (honest; the browser shows a connect prompt).
//
// Contract:  POST /functions/v1/seo-keyword-lookup   Bearer <jwt>
//   body { workspace_id, keyword, country?, language? }
//   200 { ok:true, data:{ ...KeywordData, cached:boolean } }
//   400 bad_request · 401 unauthorized · 403 forbidden · 503 not_connected
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { authUser, userClient, hasRole, serviceClient } from "../_shared/auth.ts";
import { dataForSeoKeywordData } from "../_shared/seo.ts";
import { NotConnectedError, NeedsReauthError } from "../_shared/integrations.ts";

serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  if (req.method !== "POST") return err(405, "method_not_allowed");

  const user = await authUser(req);
  if (!user) return err(401, "unauthorized");

  let body: any;
  try { body = await req.json(); } catch { return err(400, "bad_request", "invalid JSON"); }
  const { workspace_id, keyword, country = "us", language = "en" } = body ?? {};
  if (!workspace_id || !keyword?.trim()) return err(400, "bad_request", "workspace_id and keyword required");

  // Authorization on the caller-scoped client (auth.uid() = caller).
  if (!(await hasRole(userClient(req), workspace_id, "staff"))) return err(403, "forbidden");

  const admin = serviceClient();
  const kw = keyword.trim().toLowerCase();

  // Cache first — a hit spends no provider call and no meter.
  const { data: cached } = await admin.rpc("seo_cache_get", { p_ws: workspace_id, p_keyword: kw, p_country: country });
  if (cached) return ok({ ...cached, cached: true });

  try {
    const data = await dataForSeoKeywordData(admin, workspace_id, kw, country, language);
    await admin.rpc("seo_cache_put", { p_ws: workspace_id, p_keyword: kw, p_country: country, p_data: data });
    return ok({ ...data, cached: false });
  } catch (e) {
    if (e instanceof NotConnectedError) return err(503, "not_connected", "Connect DataForSEO in Integrations");
    if (e instanceof NeedsReauthError) return err(503, "needs_reauth", "Reconnect DataForSEO");
    return err(502, "provider_error", String((e as Error).message));
  }
});
