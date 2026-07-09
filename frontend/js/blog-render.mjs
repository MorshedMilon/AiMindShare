// blog-render.mjs — the PURE public blog renderer (M22, D-121). No DOM / no Deno
// APIs → shared verbatim by the `blog-render` Edge Function (Deno), the editor
// "Preview", and the Node probe. Turns published blog_articles rows into full HTML
// documents for a site's blog surface — index (`/blog`), a single article
// (`/blog/[slug]`), a category page (`/blog/category/[slug]`) — plus an RSS 2.0
// feed. It NEVER touches M19's site-render; it only reads status='published' rows
// (the Edge Fn enforces the filter). Head SEO meta + the article's stored Article/
// FAQ JSON-LD are injected here.

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Strip tags → a plain-text excerpt / RSS description fallback.
const stripHtml = (s) => String(s == null ? "" : s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const summary = (a) => a.excerpt || stripHtml(a.content_html).slice(0, 160);

// Brand → CSS custom properties (mirrors M19 site-render for visual parity).
function brandVars(brand = {}) {
  const c = brand.colors || {}, f = brand.fonts || {};
  const decls = [];
  if (c.teal) decls.push(`--grad-brand:linear-gradient(135deg,${esc(c.teal)},${esc(c.teal2 || c.teal)})`);
  if (c.ink) decls.push(`--ink-900:${esc(c.ink)}`);
  if (f.serif) decls.push(`--font-serif:${esc(f.serif)}`);
  return decls.length ? `:root{${decls.join(";")}}` : "";
}

const fmtDate = (d) => {
  if (!d) return "";
  try { return new Date(d).toISOString().slice(0, 10); } catch { return String(d); }
};

// Shared <head> + brand + blog CSS. `origin` is the public base (https://host).
function head({ site, title, desc, ogImage, canonical, robots = "index,follow", jsonLd = "" }) {
  const favicon = site.favicon_url ? `<link rel="icon" href="${esc(site.favicon_url)}">` : "";
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="${esc(robots)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ""}
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ""}${favicon}
<link rel="stylesheet" href="/assets/css/tokens.css">
<link rel="alternate" type="application/rss+xml" title="${esc(site.name)} — Blog" href="/blog/rss.xml">
<style>${brandVars(site.brand)}
body{margin:0;background:var(--bg);color:var(--ink-700);font-family:var(--font-sans);line-height:1.65}
.blog-wrap{max-width:760px;margin:0 auto;padding:48px 20px 96px}
.blog-head{max-width:960px;margin:0 auto;padding:40px 20px 8px}
.blog-eyebrow{font-family:var(--font-mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--teal-600)}
.blog-title{font-family:var(--font-serif);font-size:clamp(30px,5vw,46px);line-height:1.1;margin:.2em 0 .3em;color:var(--ink-900)}
.blog-grid{max-width:960px;margin:0 auto;padding:24px 20px 96px;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:22px}
.acard{display:flex;flex-direction:column;background:var(--card-solid);border:.5px solid var(--line);border-radius:var(--r-lg);overflow:hidden;text-decoration:none;color:inherit;box-shadow:var(--shadow-sm);transition:transform .3s var(--ease-premium,ease),box-shadow .3s}
.acard:hover{transform:translateY(-3px);box-shadow:var(--shadow-lg)}
.acard-img{aspect-ratio:16/9;background:var(--grad-brand);background-size:cover;background-position:center}
.acard-body{padding:16px 18px 20px;display:flex;flex-direction:column;gap:8px;flex:1}
.acard-cat{font-family:var(--font-mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--teal-600)}
.acard-title{font-family:var(--font-serif);font-size:20px;line-height:1.25;color:var(--ink-900)}
.acard-excerpt{font-size:14px;color:var(--ink-500);flex:1}
.acard-meta{font-family:var(--font-mono);font-size:12px;color:var(--ink-400)}
.article-hero{max-width:960px;margin:0 auto;padding:44px 20px 0}
.article-cat{font-family:var(--font-mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--teal-600)}
.article-title{font-family:var(--font-serif);font-size:clamp(30px,5.5vw,52px);line-height:1.08;margin:.25em 0 .35em;color:var(--ink-900)}
.article-byline{font-family:var(--font-mono);font-size:13px;color:var(--ink-400);display:flex;gap:12px;align-items:center}
.article-feat{max-width:960px;margin:24px auto 0;padding:0 20px}
.article-feat img{width:100%;border-radius:var(--r-lg);display:block}
.article-body{font-size:17px;color:var(--ink-700)}
.article-body h2{font-family:var(--font-serif);font-size:28px;color:var(--ink-900);margin:1.4em 0 .5em}
.article-body h3{font-family:var(--font-serif);font-size:22px;color:var(--ink-900);margin:1.2em 0 .4em}
.article-body a{color:var(--teal-600)}
.article-body img{max-width:100%;height:auto;border-radius:var(--r-md)}
.article-body figure{margin:1.4em 0}
.article-body blockquote{margin:1.4em 0;padding:.4em 1.2em;border-left:3px solid var(--teal-500);color:var(--ink-500);font-style:italic}
.blog-empty{max-width:560px;margin:80px auto;text-align:center;color:var(--ink-400)}
.blog-empty h1{font-family:var(--font-serif);color:var(--ink-700)}
.back-link{display:inline-block;margin:40px auto 0;font-family:var(--font-mono);font-size:13px;color:var(--teal-600);text-decoration:none}
</style>
${jsonLd}
</head><body>`;
}

// A single article card (used by index + category pages).
function card(site, a) {
  const img = a.featured_image_url
    ? `style="background-image:url('${esc(a.featured_image_url)}')"` : "";
  return `<a class="acard" href="/blog/${esc(a.slug)}">
  <div class="acard-img" ${img}></div>
  <div class="acard-body">
    ${a.category_name ? `<span class="acard-cat">${esc(a.category_name)}</span>` : ""}
    <span class="acard-title">${esc(a.title)}</span>
    <span class="acard-excerpt">${esc(summary(a))}</span>
    <span class="acard-meta">${esc(fmtDate(a.published_at))}${a.word_count ? ` · ${a.word_count} words` : ""}</span>
  </div>
</a>`;
}

// renderBlogIndex — the /blog list (or a category page when `category` is set).
export function renderBlogIndex({ site, articles = [], category = null, origin = "" }) {
  const label = category ? category.name : "Blog";
  const title = `${label} — ${site.name}`;
  const desc = category ? `${category.name} articles from ${site.name}` : (site.seo_defaults?.description || `The ${site.name} blog`);
  const canonical = origin ? `${origin}/blog${category ? `/category/${category.slug}` : ""}` : "";
  let body;
  if (!articles.length) {
    body = `<div class="blog-empty"><h1>Nothing published yet</h1><p>New articles will appear here soon.</p></div>`;
  } else {
    body = `<header class="blog-head"><span class="blog-eyebrow">${esc(category ? "Category" : "Latest")}</span>
    <h1 class="blog-title">${esc(label)}</h1></header>
    <main class="blog-grid">${articles.map((a) => card(site, a)).join("\n")}</main>`;
  }
  return head({ site, title, desc, ogImage: site.seo_defaults?.og_image, canonical }) + body + `\n</body></html>`;
}

// renderArticle — a single /blog/[slug] document with the stored JSON-LD.
export function renderArticle({ site, article: a, origin = "" }) {
  const title = a.meta_title || a.title;
  const desc = a.meta_desc || summary(a);
  const canonical = origin ? `${origin}/blog/${a.slug}` : "";
  // The article's schema jsonb was built at publish time (_m22_publish). Fall back
  // to a minimal Article node if it is empty (e.g. legacy row).
  const schemaObj = (a.schema && Object.keys(a.schema).length)
    ? a.schema
    : { "@context": "https://schema.org", "@type": "Article", headline: a.title, description: desc };
  const jsonLd = `<script type="application/ld+json">${JSON.stringify(schemaObj)}</script>`;
  const feat = a.featured_image_url
    ? `<div class="article-feat"><img src="${esc(a.featured_image_url)}" alt="${esc(a.title)}"></div>` : "";
  const byline = [a.author_name ? `By ${esc(a.author_name)}` : "", fmtDate(a.published_at)]
    .filter(Boolean).join(" · ");
  return head({ site, title, desc, ogImage: a.featured_image_url || site.seo_defaults?.og_image, canonical, jsonLd })
    + `<article>
  <header class="article-hero">
    ${a.category_name ? `<div class="article-cat">${esc(a.category_name)}</div>` : ""}
    <h1 class="article-title">${esc(a.title)}</h1>
    <div class="article-byline">${byline}</div>
  </header>
  ${feat}
  <div class="blog-wrap article-body">${a.content_html || ""}</div>
  <div style="text-align:center"><a class="back-link" href="/blog">← All articles</a></div>
</article>
</body></html>`;
}

// renderNotFound — 404 shell for an unknown/unpublished article.
export function renderBlogNotFound(site = {}) {
  return head({ site, title: "Not found", desc: "", robots: "noindex" })
    + `<div class="blog-empty"><h1>404</h1><p>This article hasn't been published.</p>
    <a class="back-link" href="/blog">← Back to the blog</a></div></body></html>`;
}

// buildRss — RSS 2.0 feed of published articles.
export function buildRss({ site, articles = [], origin = "" }) {
  const items = articles.map((a) => `  <item>
    <title>${esc(a.title)}</title>
    <link>${esc(origin)}/blog/${esc(a.slug)}</link>
    <guid isPermaLink="true">${esc(origin)}/blog/${esc(a.slug)}</guid>
    <description>${esc(summary(a))}</description>
    <pubDate>${a.published_at ? new Date(a.published_at).toUTCString() : ""}</pubDate>
    ${a.category_name ? `<category>${esc(a.category_name)}</category>` : ""}
  </item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${esc(site.name)} — Blog</title>
  <link>${esc(origin)}/blog</link>
  <description>${esc(site.seo_defaults?.description || `The ${site.name} blog`)}</description>
${items}
</channel></rss>`;
}
