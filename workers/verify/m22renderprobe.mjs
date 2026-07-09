// m22renderprobe.mjs — verify the PURE M22 blog renderer in Node, no DB needed.
// Proves the blog-render Edge Fn's output contract: the index lists only what it's
// given (the Edge Fn filters to published), a single article emits the stored
// Article JSON-LD + SEO meta + canonical, the category page labels + lists, RSS 2.0
// is well-formed, and the not-found shell is noindex. Mirrors m19renderprobe.
//   node workers/verify/m22renderprobe.mjs
import { renderBlogIndex, renderArticle, renderBlogNotFound, buildRss }
  from "../../frontend/js/blog-render.mjs";

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

const site = {
  id: "site-1", name: "Acme Co",
  brand: { colors: { teal: "#0F766E" }, fonts: {} },
  seo_defaults: { description: "The Acme blog", og_image: "https://acme.com/og.png" },
  favicon_url: "/f.ico",
};
const articles = [
  { slug: "first-post", title: "First Post", excerpt: "An intro to Acme.", content_html: "<p>Hello world</p>",
    featured_image_url: "https://acme.com/1.png", published_at: "2026-07-01T10:00:00Z", word_count: 850,
    category_name: "Guides", category_slug: "guides", author_name: "Amina Rahman" },
  { slug: "second-post", title: "Second Post", excerpt: "", content_html: "<p>More <b>content</b> here.</p>",
    published_at: "2026-07-02T10:00:00Z", word_count: 420, category_name: null, author_name: null },
];

// ── 1. Index lists the given articles as cards ─────────────────────────────────
console.log("\nM22 · blog index:");
const idx = renderBlogIndex({ site, articles, origin: "https://acme.com" });
assert(idx.startsWith("<!doctype html>"), "index is a full HTML document");
assert(idx.includes("First Post") && idx.includes("Second Post"), "index lists every article");
assert(idx.includes('href="/blog/first-post"'), "cards link to /blog/[slug]");
assert(idx.includes("Guides"), "card shows the category label");
assert(idx.includes('rel="canonical" href="https://acme.com/blog"'), "index sets a canonical");
assert(idx.includes('type="application/rss+xml"'), "index advertises the RSS feed");
assert(idx.includes("--grad-brand:linear-gradient"), "index injects brand CSS variables");

// ── 2. Empty index → designed empty state (not a blank div) ────────────────────
console.log("\nM22 · blog index (empty):");
const empty = renderBlogIndex({ site, articles: [], origin: "https://acme.com" });
assert(empty.includes("Nothing published yet"), "empty index renders a designed empty state");

// ── 3. Single article: JSON-LD (stored schema) + meta + canonical + body ───────
console.log("\nM22 · single article:");
const stored = {
  ...articles[0],
  meta_title: "First Post — SEO Title", meta_desc: "The SEO description for the first post.",
  schema: { "@context": "https://schema.org", "@type": "Article", headline: "First Post",
    description: "The SEO description for the first post.", author: { "@type": "Person", name: "Amina Rahman" } },
};
const doc = renderArticle({ site, article: stored, origin: "https://acme.com" });
assert(doc.includes("<title>First Post — SEO Title</title>"), "uses meta_title for <title>");
assert(doc.includes('name="description" content="The SEO description for the first post."'), "renders meta description");
assert(doc.includes('application/ld+json') && doc.includes('"Article"') && doc.includes('"Amina Rahman"'), "injects the STORED Article JSON-LD");
assert(doc.includes('rel="canonical" href="https://acme.com/blog/first-post"'), "renders canonical to the article URL");
assert(doc.includes('property="og:image" content="https://acme.com/1.png"'), "OG image = featured image");
assert(doc.includes("Hello world"), "renders the article content_html body");
assert(doc.includes("By Amina Rahman"), "renders the byline");

// ── 4. Article with empty schema → falls back to a minimal Article node ─────────
console.log("\nM22 · article schema fallback:");
const noSchema = renderArticle({ site, article: { ...articles[1], schema: {} }, origin: "https://acme.com" });
assert(noSchema.includes('"@type":"Article"') && noSchema.includes("Second Post"), "empty schema falls back to a minimal Article node");

// ── 5. Category page labels + lists ────────────────────────────────────────────
console.log("\nM22 · category page:");
const cat = renderBlogIndex({ site, articles: [articles[0]], category: { name: "Guides", slug: "guides" }, origin: "https://acme.com" });
assert(cat.includes("Category") && cat.includes("Guides"), "category page labels the category");
assert(cat.includes('href="https://acme.com/blog/category/guides"'), "category canonical is the category URL");

// ── 6. RSS 2.0 well-formed + published items ───────────────────────────────────
console.log("\nM22 · RSS feed:");
const rss = buildRss({ site, articles, origin: "https://acme.com" });
assert(rss.startsWith('<?xml version="1.0"') && rss.includes('<rss version="2.0">') && rss.includes("</rss>"), "RSS is well-formed 2.0");
assert(rss.includes("<item>") && rss.includes("First Post") && rss.includes("https://acme.com/blog/first-post"), "RSS lists article items with links");
assert((rss.match(/<item>/g) || []).length === 2, "RSS has one item per article");

// ── 7. Not-found shell is noindex ──────────────────────────────────────────────
console.log("\nM22 · not-found:");
const nf = renderBlogNotFound(site);
assert(nf.includes("404") && nf.includes('content="noindex"'), "not-found shell is 404 + noindex");

console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M22 render probe: ${pass} passed, ${fail} failed\x1b[0m`);
process.exit(fail ? 1 : 0);
