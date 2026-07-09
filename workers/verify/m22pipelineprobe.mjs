// m22pipelineprobe.mjs — verify the PURE M22-auto pipeline module (blog-pipeline.mjs)
// in Node, no DB, no DOM, no provider, no network. Proves the SEO/cluster-aware
// scaffold is fully DETERMINISTIC (same input → same output) and shaped to contract:
//   compute_topic_cluster → {cluster_slug, pillar_slug, cluster_label, intent}
//   build_serp_brief      → {search_intent, title_ideas[], h2_sections[], faqs[], …}
//   build_article_html    → PLACEHOLDER comment first + <h1>/<h2>/FAQ/internal-links
//   score_article         → {seo_score, readability_score, word_count, checklist}
//   suggest_internal_links→ non-empty {slug,label}[] (stable even if unpublished)
//   build_schema          → schema.org BlogPosting JSON-LD
// The two AI stubs (generate_article_with_ai / generate_featured_image_with_ai) must
// never be called by this module; nothing here meters or reaches the network.
//   node workers/verify/m22pipelineprobe.mjs
import {
  compute_topic_cluster, build_serp_brief, build_article_html,
  score_article, suggest_internal_links, build_schema, slugify,
} from "../../frontend/js/blog-pipeline.mjs";

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

const KW = "how to grow medjool dates";
const SITE = "11111111-1111-1111-1111-111111111111";

// ── slugify ───────────────────────────────────────────────────────────────────
console.log("\nM22-auto · slugify:");
assert(slugify("How To Grow  Medjool Dates!") === "how-to-grow-medjool-dates", "slugify lowercases/hyphenates/strips punctuation");
assert(slugify("") === "", "slugify('') → '' (no throw)");

// ── compute_topic_cluster ───────────────────────────────────────────────────────
console.log("\nM22-auto · compute_topic_cluster:");
const cl = compute_topic_cluster(KW, SITE);
assert(["cluster_slug", "pillar_slug", "cluster_label", "intent"].every((k) => k in cl),
  "returns the 4 contract fields (cluster_slug/pillar_slug/cluster_label/intent)");
assert(typeof cl.cluster_slug === "string" && cl.cluster_slug.length > 0, "cluster_slug non-empty");
assert(typeof cl.pillar_slug === "string" && cl.pillar_slug.length > 0, "pillar_slug non-empty");
assert(cl.intent === "informational", "'how to …' → informational intent");
assert(compute_topic_cluster("best date grinder", SITE).intent === "commercial", "'best …' → commercial intent");
assert(compute_topic_cluster("buy medjool dates online", SITE).intent === "transactional", "'buy …' → transactional intent");
assert(JSON.stringify(compute_topic_cluster(KW, SITE)) === JSON.stringify(cl), "deterministic — same input, same cluster");

// ── build_serp_brief ────────────────────────────────────────────────────────────
console.log("\nM22-auto · build_serp_brief:");
const brief = build_serp_brief(KW, cl);
assert(brief.search_intent === cl.intent, "brief.search_intent mirrors the cluster intent");
assert(Array.isArray(brief.title_ideas) && brief.title_ideas.length > 0, "title_ideas non-empty");
assert(Array.isArray(brief.h2_sections) && brief.h2_sections.length > 0, "h2_sections non-empty");
assert(Array.isArray(brief.faqs) && brief.faqs.every((f) => f.q && f.a), "faqs are {q,a}");
assert(Array.isArray(brief.internal_link_targets) && brief.internal_link_targets.length > 0, "internal_link_targets non-empty");
assert(typeof brief.meta_title === "string" && brief.meta_title.toLowerCase().includes("medjool"), "meta_title includes the keyword");
assert(typeof brief.slug === "string" && brief.slug === slugify(KW), "slug is the slugified keyword");
assert(JSON.stringify(build_serp_brief(KW, cl)) === JSON.stringify(brief), "deterministic — same input, same brief");

// ── build_article_html ──────────────────────────────────────────────────────────
console.log("\nM22-auto · build_article_html:");
const html = build_article_html(brief, cl);
assert(html.startsWith("<!-- PLACEHOLDER: auto-generated scaffold, not real AI content. Safe for testing only. -->"),
  "HTML starts with the PLACEHOLDER comment");
assert(/<h1[\s>]/i.test(html), "has an <h1>");
assert(/<h2[\s>]/i.test(html), "has at least one <h2>");
assert(/faq/i.test(html), "has a FAQ block");
assert(/<a\s[^>]*href=["']\/blog\//i.test(html), "has ≥1 internal /blog/ link");
assert(build_article_html(brief, cl) === html, "deterministic — same input, same HTML");

// ── score_article ───────────────────────────────────────────────────────────────
console.log("\nM22-auto · score_article:");
const sc = score_article(html, KW);
assert(typeof sc.seo_score === "number" && sc.seo_score >= 0 && sc.seo_score <= 100, `seo_score in 0..100 (${sc.seo_score})`);
assert(typeof sc.readability_score === "number", `readability_score numeric (${sc.readability_score})`);
assert(typeof sc.word_count === "number" && sc.word_count > 0, `word_count > 0 (${sc.word_count})`);
assert(Array.isArray(sc.checklist), "checklist present");
assert(score_article(html, KW).seo_score === sc.seo_score, "deterministic — same input, same score");

// ── suggest_internal_links ──────────────────────────────────────────────────────
console.log("\nM22-auto · suggest_internal_links:");
const links = suggest_internal_links(cl);
assert(Array.isArray(links) && links.length >= 1, "returns ≥1 link candidate");
assert(links.every((l) => l.slug && l.label), "each candidate is {slug,label}");
assert(links.some((l) => l.slug === cl.pillar_slug), "the pillar slug is among the candidates (stable even if unpublished)");

// ── build_schema ────────────────────────────────────────────────────────────────
console.log("\nM22-auto · build_schema:");
const schema = build_schema(KW, { meta_title: brief.meta_title, meta_desc: brief.meta_desc, slug: brief.slug });
assert(schema["@context"] === "https://schema.org", "@context is schema.org");
assert(schema["@type"] === "BlogPosting", "@type is BlogPosting");
assert(typeof schema.headline === "string" && schema.headline.length > 0, "headline present");
assert(schema.author && schema.author["@type"] === "Person", "author is a Person node");
assert(!!schema.mainEntityOfPage, "mainEntityOfPage present");

// ── edge case: empty keyword must not throw ──────────────────────────────────────
console.log("\nM22-auto · edge cases:");
let threw = false;
try {
  const c0 = compute_topic_cluster("", SITE);
  const b0 = build_serp_brief("", c0);
  const h0 = build_article_html(b0, c0);
  score_article(h0, "");
} catch { threw = true; }
assert(!threw, "empty keyword flows through the whole pipeline without throwing");

console.log(`\n\x1b[${fail ? 31 : 32}mM22-auto pipeline probe: ${pass} passed, ${fail} failed\x1b[0m`);
process.exit(fail ? 1 : 0);
