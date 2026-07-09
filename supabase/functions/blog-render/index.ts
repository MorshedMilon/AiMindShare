// functions/blog-render/index.ts — M22 the PUBLIC blog renderer (D-121, verify_jwt=false).
// The manual-slice companion to M19's site-render: it serves a site's BLOG surface
// (`/blog`, `/blog/[slug]`, `/blog/category/[slug]`, `/blog/rss.xml`) WITHOUT touching
// M19's site-render. Runs service-role and ONLY ever returns status='published'
// articles — an unpublished slug is a 404. All HTML/XML comes from the PURE
// blog-render.mjs module (also exercised by the Node m22renderprobe).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { serviceClient } from "../_shared/auth.ts";
import { renderBlogIndex, renderArticle, renderBlogNotFound, buildRss }
  from "../../../frontend/js/blog-render.mjs";

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

// Flatten Supabase's nested join result into the flat fields the pure module wants.
const flat = (a: any) => ({
  ...a,
  category_name: a.article_categories?.name ?? null,
  category_slug: a.article_categories?.slug ?? null,
  author_name: a.article_authors?.name ?? null,
});
const SELECT = "*, article_categories(name,slug), article_authors(name)";

serve(async (req: Request) => {
  const url = new URL(req.url);
  const admin = serviceClient();

  const host = (url.searchParams.get("host") || req.headers.get("host") || "").toLowerCase().replace(/:\d+$/, "");
  const origin = `https://${host}`;

  // 1. Resolve the site: active custom domain → staging subdomain → ?site_id preview.
  let site: any = null;
  const { data: dom } = await admin.from("site_domains")
    .select("site_id").eq("domain", host).eq("status", "active").maybeSingle();
  if (dom?.site_id) {
    site = (await admin.from("sites").select("*").eq("id", dom.site_id).maybeSingle()).data;
  } else {
    const previewId = url.searchParams.get("site_id");
    if (previewId) {
      site = (await admin.from("sites").select("*").eq("id", previewId).maybeSingle()).data;
    } else {
      const sub = host.split(".")[0];
      site = (await admin.from("sites").select("*").eq("subdomain", sub).maybeSingle()).data;
    }
  }
  if (!site) return html(renderBlogNotFound(), 404);

  // 2. Parse the blog path. `?path=` override (preview) else the URL path.
  let path = (url.searchParams.get("path") ?? url.pathname).replace(/^\/+/, "").replace(/\/+$/, "");
  path = path.replace(/^blog\/?/, "");   // drop the /blog prefix
  const wantRss = url.searchParams.get("format") === "rss" || path === "rss.xml";

  // Base article query — published only, newest first.
  const base = () => admin.from("blog_articles").select(SELECT)
    .eq("site_id", site.id).eq("status", "published").order("published_at", { ascending: false });

  // 3a. RSS feed.
  if (wantRss) {
    const { data } = await base().limit(50);
    return new Response(buildRss({ site, articles: (data ?? []).map(flat), origin }),
      { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
  }

  // 3b. Category page: /category/[slug].
  const catMatch = path.match(/^category\/(.+)$/);
  if (catMatch) {
    const slug = catMatch[1];
    const { data: cat } = await admin.from("article_categories")
      .select("id,name,slug").eq("site_id", site.id).eq("slug", slug).maybeSingle();
    if (!cat) return html(renderBlogNotFound(site), 404);
    const { data } = await base().eq("category_id", cat.id);
    return html(renderBlogIndex({ site, articles: (data ?? []).map(flat), category: cat, origin }));
  }

  // 3c. Index: empty path.
  if (path === "") {
    const { data } = await base().limit(50);
    return html(renderBlogIndex({ site, articles: (data ?? []).map(flat), origin }));
  }

  // 3d. A single article by slug (published only → a draft slug 404s).
  const { data: art } = await admin.from("blog_articles").select(SELECT)
    .eq("site_id", site.id).eq("slug", path).eq("status", "published").maybeSingle();
  if (!art) return html(renderBlogNotFound(site), 404);
  return html(renderArticle({ site, article: flat(art), origin }));
});
