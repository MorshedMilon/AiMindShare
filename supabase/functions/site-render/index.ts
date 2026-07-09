// functions/site-render/index.ts — M19 the PUBLIC site renderer (D-100, verify_jwt=false).
// No Node SSR on this stack, so the "public SSR renderer" is this Edge Function:
// resolve host → site (custom domain 'active' OR staging subdomain) → the published
// page for the path → renderPage() (SEO meta + JSON-LD + brand vars + cookie banner +
// tracking pixel + embed hydration, all from the PURE site-render.mjs). Runs
// service-role and ONLY ever returns status='published' pages — a draft slug is a 404
// (D-105). Also serves /sitemap.xml + /robots.txt per site by path. Static publish to
// a CDN is deferred behind OPEN D-009; this works today.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { serviceClient } from "../_shared/auth.ts";
import { renderPage, renderNotFound, renderMaintenance, buildSitemap, buildRobots } from "../../../frontend/js/site-render.mjs";

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

serve(async (req: Request) => {
  const url = new URL(req.url);
  const admin = serviceClient();

  // Host resolution: ?host= override (preview) else the Host header.
  const host = (url.searchParams.get("host") || req.headers.get("host") || "").toLowerCase().replace(/:\d+$/, "");
  // path: ?path= override (preview) else the URL path.
  let path = url.searchParams.get("path") ?? url.pathname;
  path = path.replace(/^\/+/, "");

  // 1. Resolve the site by an active custom domain, else the staging subdomain.
  let siteRow: Record<string, unknown> | null = null;
  const { data: dom } = await admin.from("site_domains")
    .select("site_id").eq("domain", host).eq("status", "active").maybeSingle();
  if (dom?.site_id) {
    const { data } = await admin.from("sites").select("*").eq("id", dom.site_id).maybeSingle();
    siteRow = data;
  } else {
    const sub = host.split(".")[0];
    const { data } = await admin.from("sites").select("*").eq("subdomain", sub).maybeSingle();
    siteRow = data;
  }
  if (!siteRow) return html(renderNotFound(), 404);
  const site = siteRow as any;

  // Staging preview (D-149): ?pt=<sites.preview_token> lets an operator see DRAFT
  // pages and bypass maintenance mode. Anything else stays published-only.
  const staging = !!site.preview_token && url.searchParams.get("pt") === site.preview_token;

  // Maintenance mode: every public path serves the maintenance shell (staging bypasses).
  if (site.maintenance_mode && !staging) return html(renderMaintenance(site), 503);

  // 2. Path routing: sitemap / robots / a page slug.
  if (path === "sitemap.xml") {
    const { data: pages } = await admin.from("pages")
      .select("slug, is_home, status").eq("site_id", site.id).eq("status", "published");
    return new Response(buildSitemap(site, pages ?? [], `https://${host}`),
      { headers: { "Content-Type": "application/xml" } });
  }
  if (path === "robots.txt") {
    return new Response(buildRobots(`https://${host}`), { headers: { "Content-Type": "text/plain" } });
  }

  // 3. The page. Empty path → the home page. Only published pages resolve —
  //    unless the staging token is present, which may also see drafts (D-149).
  let q = admin.from("pages").select("*").eq("site_id", site.id);
  if (!staging) q = q.eq("status", "published");
  const { data: page } = path === ""
    ? await q.eq("is_home", true).maybeSingle()
    : await q.eq("slug", path).maybeSingle();
  if (!page) return html(renderNotFound(site), 404);

  // Cookie-banner config comes from the workspace's M05 settings (best-effort).
  let cookie: Record<string, unknown> = {};
  try {
    const { data: ws } = await admin.from("workspaces").select("settings").eq("id", site.workspace_id).maybeSingle();
    cookie = (ws?.settings as any)?.cookie_banner ?? {};
  } catch { /* M05 settings optional */ }

  return html(renderPage({ site, page, cookie }));
});
