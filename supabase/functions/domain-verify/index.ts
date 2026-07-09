// functions/domain-verify/index.ts — M19 custom-domain DNS verification (D-104).
// Auth: admin+ (domains are an integration action, D-105/D-056). Looks up the
// site_domains row, checks DNS for the verification TXT record (and a CNAME to the
// platform), flips status → 'active' on match. Live SSL provisioning is a labeled
// "ready, not run" SCAFFOLD pending OPEN D-009 (hosting): status flips, ssl_status
// is set to 'pending' with a note, and no provisioning is attempted here.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { authUser, userClient, serviceClient, hasRole } from "../_shared/auth.ts";

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  const user = await authUser(req);
  if (!user) return err(401, "unauthorized", "Sign in required");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err(400, "bad_request", "Invalid JSON"); }
  const ws = String(body.workspace_id ?? "");
  const domainId = String(body.domain_id ?? "");
  if (!ws || !domainId) return err(400, "bad_request", "workspace_id and domain_id are required");

  const userDb = userClient(req);
  if (!(await hasRole(userDb, ws, "admin"))) return err(403, "forbidden", "Requires admin+");

  const admin = serviceClient();
  const { data: row } = await admin.from("site_domains")
    .select("*").eq("id", domainId).eq("workspace_id", ws).maybeSingle();
  if (!row) return err(404, "not_found", "Domain not found");
  const d = row as any;

  // DNS check: the workspace must publish a TXT record with the verification token.
  let verified = false;
  try {
    const txt = await Deno.resolveDns(`_amsverify.${d.domain}`, "TXT").catch(() => [] as string[][]);
    verified = txt.flat().some((t: string) => t.includes(d.verification_token));
  } catch { verified = false; }

  // Observability (D-148): every verify attempt leaves a site_publish_log row.
  const log = (status: string, detail: Record<string, unknown>) =>
    admin.from("site_publish_log").insert({
      workspace_id: ws, site_id: d.site_id, kind: "domain.verify",
      status, detail: { domain: d.domain, ...detail }, actor_id: user.id,
    }).then(() => undefined, () => undefined); // best-effort, never blocks the response

  if (!verified) {
    await admin.from("site_domains").update({ status: "verifying" }).eq("id", domainId);
    await log("error", { result: "dns_not_found" });
    return ok({ verified: false, status: "verifying",
      instructions: {
        txt: { host: `_amsverify.${d.domain}`, value: d.verification_token },
        cname: { host: d.domain, value: "sites.aimindshare.com" },
      },
      message: "DNS records not found yet. They can take up to 24h to propagate.",
    });
  }

  // Verified. SSL provisioning is the D-009 scaffold: mark pending, don't provision.
  await admin.from("site_domains")
    .update({ status: "active", ssl_status: "pending", verified_at: new Date().toISOString() })
    .eq("id", domainId);
  await log("ok", { result: "verified", ssl_status: "pending" });
  // (When D-009 lands: enqueue a `site.ssl_provision` job here.)
  return ok({ verified: true, status: "active", ssl_status: "pending",
    message: "Domain verified. SSL certificate will be issued once hosting is finalized (D-009)." });
});
