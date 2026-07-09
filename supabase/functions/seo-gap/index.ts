// functions/seo-gap/index.ts — M21 competitor keyword gap (DataForSEO Labs).
// { your_domain, rival_domain } → keywords the rival ranks for that you don't, with
// volume + rival position. Meters 2 seo_calls (two ranked-keyword pulls). staff+ only.
// The gap table's rows feed Save-to-list / Send-to-Content-Queue on the client.
//
// Ready-not-run: no DataForSEO cred → 503 not_connected.
//
// Contract:  POST /functions/v1/seo-gap   Bearer <jwt>
//   body { workspace_id, your_domain, rival_domain, country? }
//   200 { ok:true, data:{ gap:[{keyword,volume,rival_position}] } }
//   400 · 401 · 403 · 502 · 503
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { authUser, userClient, hasRole, serviceClient } from "../_shared/auth.ts";
import { dataForSeoGap } from "../_shared/seo.ts";
import { NotConnectedError, NeedsReauthError } from "../_shared/integrations.ts";

serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  if (req.method !== "POST") return err(405, "method_not_allowed");

  const user = await authUser(req);
  if (!user) return err(401, "unauthorized");

  let body: any;
  try { body = await req.json(); } catch { return err(400, "bad_request", "invalid JSON"); }
  const { workspace_id, your_domain, rival_domain, country = "us" } = body ?? {};
  if (!workspace_id || !your_domain?.trim() || !rival_domain?.trim())
    return err(400, "bad_request", "workspace_id, your_domain and rival_domain required");

  if (!(await hasRole(userClient(req), workspace_id, "staff"))) return err(403, "forbidden");

  try {
    const data = await dataForSeoGap(serviceClient(), workspace_id, your_domain.trim(), rival_domain.trim(), country);
    return ok(data);
  } catch (e) {
    if (e instanceof NotConnectedError) return err(503, "not_connected", "Connect DataForSEO in Integrations");
    if (e instanceof NeedsReauthError) return err(503, "needs_reauth", "Reconnect DataForSEO");
    return err(502, "provider_error", String((e as Error).message));
  }
});
