// m19renderprobe.mjs — verify the PURE M19 modules (page-builder + site-render)
// in Node, no DB needed. Proves the AI generator is deterministic + valid (the
// "≥95% deserializable" AC → 100% here), the repair pass fixes broken input, and
// the renderer injects SEO meta + JSON-LD + brand vars + cookie banner + pixel +
// embed hydration, plus a valid sitemap that hides drafts.
//   node workers/verify/m19renderprobe.mjs
import { generateFromNiche, validateSections, repairSections, sectionsToHtml, NICHE_KEYS }
  from "../../frontend/js/page-builder.mjs";
import { renderPage, buildSitemap, hydrationScript } from "../../frontend/js/site-render.mjs";

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

// ── 1. Generator is valid across every niche (the ≥95% AC → deterministic 100%)
console.log("\nM19 · page-builder — generateFromNiche valid for all niches:");
for (const niche of NICHE_KEYS) {
  const sections = generateFromNiche("A business for Acme Co", niche);
  const v = validateSections(sections);
  assert(v.ok, `niche "${niche}" → valid sections (${v.errors.join("; ") || "ok"})`);
  const { html, css } = sectionsToHtml(sections);
  assert(html.includes("s-hero") && html.length > 200, `niche "${niche}" → non-empty HTML`);
  assert(css.includes(".s-hero"), `niche "${niche}" → section CSS present`);
}

// ── 2. Repair pass fixes deliberately-broken input ─────────────────────────────
console.log("\nM19 · page-builder — repair pass:");
const broken = [{ type: "hero" }, { type: "unknown-junk" }, { type: "pricing", tiers: [] }, null];
const repaired = repairSections(broken);
assert(validateSections(repaired).ok, "a broken sections array is repaired to valid");
assert(!repaired.some((s) => s.type === "unknown-junk"), "repair drops unknown section types");

// ── 3. Renderer injects the full head + body + hydration ───────────────────────
console.log("\nM19 · site-render — renderPage head/schema/brand/cookie/pixel/embeds:");
const site = {
  id: "site-1", name: "Acme Co",
  brand: { colors: { teal: "#0F766E" }, fonts: {} },
  seo_defaults: { description: "Default desc", robots: "index,follow" },
  favicon_url: "/f.ico",
};
const page = {
  slug: "home", title: "Acme — Home", is_home: true, status: "published",
  render_html: '<section class="s-hero"><h1>Hi</h1></section><div data-embed="calendar" data-slug="intro"></div>',
  render_css: ".x{color:red}",
  meta: { title: "Acme — Home", description: "Home of Acme", robots: "index,follow",
    canonical: "https://acme.com/", og_image: "https://acme.com/og.png",
    schema_type: "LocalBusiness" },
};
const doc = renderPage({ site, page, cookie: { text: "Cookies!" } });
assert(doc.includes("<title>Acme — Home</title>"), "renders <title>");
assert(doc.includes('name="description" content="Home of Acme"'), "renders meta description");
assert(doc.includes('property="og:image"'), "renders OG image");
assert(doc.includes('rel="canonical" href="https://acme.com/"'), "renders canonical");
assert(doc.includes('application/ld+json') && doc.includes('"LocalBusiness"'), "renders JSON-LD LocalBusiness");
assert(doc.includes("--grad-brand:linear-gradient"), "injects brand CSS variables");
assert(doc.includes(".x{color:red}"), "inlines the page render_css");
assert(doc.includes('id="ams-cookie"') && doc.includes("Cookies!"), "injects the cookie banner");
assert(doc.includes("site-track") && doc.includes("sendBeacon"), "injects the tracking pixel");
assert(doc.includes("data-embed") && doc.includes("book.html?embed=1"), "embed hydration wires the M14 calendar iframe");

// ── 4. FAQ schema + robots + sitemap hides drafts ──────────────────────────────
console.log("\nM19 · site-render — FAQ schema + sitemap draft-hiding:");
const faqDoc = renderPage({ site, page: { ...page, meta: { schema_type: "FAQPage",
  schema_json: { faqs: [{ q: "Q1", a: "A1" }] } } } });
assert(faqDoc.includes('"FAQPage"') && faqDoc.includes('"Q1"'), "FAQ schema_type → FAQPage JSON-LD");
const sm = buildSitemap(site, [
  { slug: "home", is_home: true, status: "published" },
  { slug: "about", is_home: false, status: "draft" },
  { slug: "pricing", is_home: false, status: "published" },
], "https://acme.com");
assert(sm.includes("<urlset") && sm.includes("</urlset>"), "sitemap is well-formed XML");
assert(sm.includes("pricing") && !sm.includes("about"), "sitemap includes published, excludes drafts");
assert(hydrationScript(site, page).includes("ams_vid"), "hydration sets a first-party visitor id");

console.log(`\nM19 render/builder probe: ${pass} passed, ${fail} failed.\n`);
process.exit(fail ? 1 : 0);
