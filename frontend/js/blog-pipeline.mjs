// blog-pipeline.mjs — the PURE, DETERMINISTIC M22-auto (Auto-Blog) pipeline
// (Session 23, D-147). SEO/cluster-aware SCAFFOLD: turns a seed keyword into a
// topic-clustered, internally-linked, JSON-LD-carrying placeholder blog article —
// WITHOUT calling any external LLM or image provider. Same input ⇒ same output,
// always; shared verbatim by the worker (blog.generate), the m22pipelineprobe, and
// the frontend "preview" (Node + browser importable, no DOM, no network).
//
// SCAFFOLD POSTURE (D-147, same as D-063 M13-AI / D-092 M16-AI): every article this
// module emits is a clearly-labelled deterministic placeholder — the drafted HTML
// opens with an explicit PLACEHOLDER comment so it can never be mistaken for real
// production content, and NOTHING here is metered. Real GPT prose + DALL·E/M35
// featured images are the two OPEN provider gaps: they live as the two throwing
// stubs at the bottom (generate_article_with_ai / generate_featured_image_with_ai),
// documented in doc/PROMPT-LIBRARY.md, and are the exact wire-in point once an LLM
// provider is chosen and M35 Creative Studio lands. Neither stub is called here.
//
// SEO scoring reuses the M22-manual on-page scorer (content-seo.mjs, D-125) so the
// auto pipeline is graded on the SAME rubric the manual editor's sidebar shows.

import { scoreArticle } from "./content-seo.mjs";

// ── slugify — small local helper (content-seo.mjs deliberately exports no slugify) ─
export function slugify(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// English stop-words dropped when picking the "significant noun" for the pillar.
const STOP = new Set([
  "how", "to", "the", "a", "an", "of", "for", "and", "or", "in", "on", "at", "is",
  "are", "with", "your", "you", "my", "best", "top", "guide", "what", "why", "when",
  "where", "which", "do", "does", "can", "vs", "buy", "price", "cheap", "review",
  "reviews", "near", "me", "cost", "deal", "deals",
]);

const words = (s) => String(s || "").toLowerCase().match(/[a-z0-9]+/g) || [];

// Intent from keyword patterns (deterministic, naive rules — mirrors M21 keyword
// intent buckets: informational/commercial/transactional/navigational).
function deriveIntent(kw) {
  const t = ` ${String(kw || "").toLowerCase()} `;
  if (/\b(buy|order|price|cost|coupon|discount|deal|deals|for sale|cheap)\b/.test(t)) return "transactional";
  if (/\b(best|top|review|reviews|vs|compare|comparison|alternative)\b/.test(t)) return "commercial";
  if (/\b(how|what|why|when|guide|tutorial|tips|ideas|examples|meaning)\b/.test(t)) return "informational";
  if (/\b(login|sign in|near me|hours|contact|official)\b/.test(t)) return "navigational";
  return "informational";
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1 · compute_topic_cluster(keyword, siteId) — deterministic keyword clustering.
//     pillar = the first significant (non-stop-word) token → the broad hub topic;
//     cluster = the full keyword slug → the specific sub-topic under that pillar.
//     Lets the rest of the system treat clusters/pillars as real, stable objects
//     even before any article is published (siteId reserved for future per-site
//     namespacing; kept in the signature per the prompt contract).
// ═══════════════════════════════════════════════════════════════════════════════
export function compute_topic_cluster(keyword, siteId) {   // eslint-disable-line no-unused-vars
  const toks = words(keyword);
  const significant = toks.filter((w) => !STOP.has(w));
  const pillarToken = significant[0] || toks[0] || "topic";
  const clusterSlug = slugify(keyword) || pillarToken;
  const pillarSlug = slugify(pillarToken) || "topic";
  const label = (significant.length ? significant : toks)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ") || "General";
  return {
    cluster_slug: clusterSlug,
    pillar_slug: pillarSlug,
    cluster_label: label,
    intent: deriveIntent(keyword),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2 · build_serp_brief(keyword, cluster) — a structured, deterministic SERP-style
//     content brief (search intent, title ideas, H2 outline, FAQs, internal-link
//     targets, meta). Static templates keyed off the keyword + cluster; no provider.
// ═══════════════════════════════════════════════════════════════════════════════
export function build_serp_brief(keyword, cluster) {
  const kw = String(keyword || "").trim();
  const cap = kw.replace(/\b\w/g, (c) => c.toUpperCase()) || "This Topic";
  const label = cluster?.cluster_label || cap || "This Topic";

  const title_ideas = [
    `${cap}: A Complete Guide`,
    `${cap} — Everything You Need to Know`,
    `The Ultimate ${cap} Playbook`,
  ];
  const h2_sections = [
    { h2: `What Is ${cap}?`, points: [`Define ${kw || "the topic"}`, "Why it matters", "Common misconceptions"] },
    { h2: `How ${cap} Works`, points: ["Step-by-step overview", "Key factors", "Practical example"] },
    { h2: `Best Practices for ${cap}`, points: ["Actionable tips", "Pitfalls to avoid", "Tools that help"] },
    { h2: `${cap} FAQs`, points: ["Answer common questions", "Address objections"] },
  ];
  const faqs = [
    { q: `What is ${kw || "this topic"}?`, a: `${cap} refers to the core concept covered in this ${label} guide.` },
    { q: `Why does ${kw || "it"} matter?`, a: `Understanding ${kw || "this topic"} helps you make better, more informed decisions.` },
    { q: `How do I get started with ${kw || "this"}?`, a: `Begin with the fundamentals outlined above, then apply the best-practice checklist.` },
  ];
  const internal_link_targets = suggest_internal_links(cluster).map((l) => l.slug);

  return {
    search_intent: cluster?.intent || deriveIntent(keyword),
    title_ideas,
    h2_sections,
    faqs,
    internal_link_targets,
    meta_title: `${cap} | ${label} Guide`.slice(0, 60),
    meta_desc: `Learn ${kw || "this topic"} in this ${label} guide: what it is, how it works, and the best practices to apply today.`.slice(0, 160),
    slug: slugify(kw),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3 · build_article_html(brief, cluster) — deterministic placeholder article HTML.
//     Opens with the mandatory PLACEHOLDER comment, then <h1>, intro <p>, one
//     <h2>+<p>(+<h3>) per brief section, a FAQ block, and an internal-links section.
//     Clearly labelled so it can never be mistaken for real production content.
// ═══════════════════════════════════════════════════════════════════════════════
export function build_article_html(brief, cluster) {
  const kw = (brief?.title_ideas?.[0] || cluster?.cluster_label || "This Topic");
  const kwPhrase = (cluster?.cluster_label || "this topic");
  const links = suggest_internal_links(cluster);

  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const sections = (brief?.h2_sections || []).map((sec) => {
    const pts = (sec.points || []).map((p) => `<li>${esc(p)}</li>`).join("");
    return `<h2>${esc(sec.h2)}</h2>\n`
      + `<p>This section covers ${esc(kwPhrase)}. `
      + `The following points are scaffolded placeholders and will be replaced by real, provider-generated prose once an LLM provider is wired:</p>\n`
      + (pts ? `<h3>Key points</h3>\n<ul>${pts}</ul>\n` : "");
  }).join("");

  const faqItems = (brief?.faqs || []).map((f) =>
    `<div class="faq-item"><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></div>`).join("\n");

  const linkItems = links.map((l) =>
    `<li><a href="/blog/${esc(l.slug)}">${esc(l.label)}</a></li>`).join("\n");

  return `<!-- PLACEHOLDER: auto-generated scaffold, not real AI content. Safe for testing only. -->
<article class="auto-blog-placeholder">
<h1>${esc(kw)}</h1>
<p>This is a deterministic placeholder introduction about ${esc(kwPhrase)}. `
    + `It exists so the SEO, clustering, and internal-linking pipeline can be tested end-to-end without any real AI generation. `
    + `Nothing here is billed, and no provider was called.</p>
${sections}<section class="faq">
<h2>Frequently Asked Questions</h2>
${faqItems}
</section>
<section class="related-links">
<h2>Related Articles</h2>
<ul>
${linkItems}
</ul>
</section>
</article>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4 · score_article(html, keyword) — reuse the M22-manual on-page scorer (D-125)
//     and map its shape onto the auto-pipeline fields the worker persists.
// ═══════════════════════════════════════════════════════════════════════════════
export function score_article(html, keyword) {
  const kw = String(keyword || "");
  const cap = kw.replace(/\b\w/g, (c) => c.toUpperCase());
  const r = scoreArticle({
    html,
    title: (String(html || "").match(/<h1[^>]*>([^<]*)<\/h1>/i) || [])[1] || cap,
    keyword: kw,
    metaTitle: cap ? `${cap} Guide` : "",
    metaDesc: kw ? `Learn ${kw} in this complete guide with best practices and FAQs.` : "",
    targetWords: 1200,
  });
  return {
    seo_score: r.score,
    readability_score: r.readability,
    word_count: r.wordCount,
    checklist: r.checklist,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5 · suggest_internal_links(cluster) — pillar/cluster link candidates with STABLE
//     slugs (usable even if the target article is not yet published). Deterministic.
// ═══════════════════════════════════════════════════════════════════════════════
export function suggest_internal_links(cluster) {
  const pillar = cluster?.pillar_slug || "topic";
  const clusterSlug = cluster?.cluster_slug || pillar;
  const label = cluster?.cluster_label || "Topic";
  const pillarLabel = pillar.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const out = [
    { slug: pillar, label: `${pillarLabel} — Pillar Guide` },
    { slug: `${pillar}-basics`, label: `${pillarLabel} Basics` },
  ];
  if (clusterSlug !== pillar) out.push({ slug: clusterSlug, label });
  // de-dupe by slug, keep order
  const seen = new Set();
  return out.filter((l) => (seen.has(l.slug) ? false : (seen.add(l.slug), true)));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6 · build_schema(keyword, htmlMeta) — schema.org BlogPosting JSON-LD (helps
//     Google rich results). Author is a placeholder Person until a real byline is
//     wired. Deterministic date is derived from nothing external here — callers may
//     override datePublished when persisting; the scaffold stamps a stable value.
// ═══════════════════════════════════════════════════════════════════════════════
export function build_schema(keyword, htmlMeta = {}) {
  const kw = String(keyword || "");
  const cap = kw.replace(/\b\w/g, (c) => c.toUpperCase());
  const headline = htmlMeta.meta_title || (cap ? `${cap} Guide` : "Blog Post");
  const slug = htmlMeta.slug || slugify(kw);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline,
    description: htmlMeta.meta_desc || `A guide to ${kw || "this topic"}.`,
    author: { "@type": "Person", name: "AiMindShare" },
    datePublished: htmlMeta.datePublished || "1970-01-01",
    mainEntityOfPage: { "@type": "WebPage", "@id": `/blog/${slug}` },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REAL LLM WIRE-IN (D-190) — this module stays network-free and browser-importable;
// the actual Anthropic call lives in workers/llm.mjs and is injected as `callLlm`
// (systemPrompt, userPrompt) => Promise<{kind:'html',content_html,tokensUsed,model}
// | {kind:'unavailable',reason}>. The deterministic brief/outline stays the contract
// the LLM must follow (bounds cost, keeps SEO structure under our control) — only
// the prose becomes real.
// ═══════════════════════════════════════════════════════════════════════════════
export function buildArticleSystemPrompt(brandVoice, targetWordCount) {
  const voice = brandVoice && brandVoice.trim() ? brandVoice.trim() : "clear, helpful, and factual";
  return `You are a content writer producing a blog article for a website. Write in this brand ` +
    `voice: ${voice}. Target length: approximately ${targetWordCount} words. Follow the provided ` +
    `outline (H2 sections and FAQs) exactly — do not add or remove sections. Output ONLY the ` +
    `article body as clean semantic HTML (h2/h3/p/ul/li/div tags), no markdown fences, no <html> ` +
    `or <body> wrapper, no commentary before or after the HTML.`;
}

export function buildArticleUserPrompt(keyword, brief) {
  const sections = (brief?.h2_sections || []).map((s) => `- ${s.h2}: ${(s.points || []).join("; ")}`).join("\n");
  const faqs = (brief?.faqs || []).map((f) => `- Q: ${f.q}`).join("\n");
  return `Topic keyword: ${keyword}\n\nOutline:\n${sections}\n\nFAQ questions to answer:\n${faqs}\n\n` +
    `Write the full article now.`;
}

// generate_article_with_ai — real implementation, dependency-injected. Returns the
// same {kind:'html',...} / {kind:'unavailable',reason} shape callLlm returns, after
// validating the HTML isn't blank. No `callLlm` (browser preview, or no key resolved
// upstream) → unavailable/no_key, same semantics as every other module's LLM fallback.
export async function generate_article_with_ai(ctx, callLlm) {
  if (typeof callLlm !== "function") return { kind: "unavailable", reason: "no_key" };
  const { keyword, brief, targetWordCount = 1200, brandVoice = "" } = ctx;
  const systemPrompt = buildArticleSystemPrompt(brandVoice, targetWordCount);
  const userPrompt = buildArticleUserPrompt(keyword, brief);
  let result;
  try {
    result = await callLlm(systemPrompt, userPrompt);
  } catch {
    return { kind: "unavailable", reason: "bad_response" };
  }
  if (!result || result.kind !== "html" || !result.content_html || !result.content_html.trim()) {
    return { kind: "unavailable", reason: result?.reason || "bad_response" };
  }
  return result;
}

// decidePublishStep — the ONE place that decides where a generated draft lands
// (D-191). Pure and DB-free on purpose: this is the exact function
// worker.mjs's blog.generate handler calls, so the IslamicInfo hard-gate invariant
// (reviewRequired=true → never publish, no matter what else is true) is provable
// without a live database.
export function decidePublishStep({ passes, autoPublish, reviewRequired }) {
  if (!passes) return { step: "review", fail_reason: "BELOW_THRESHOLD", publish: false };
  if (reviewRequired) return { step: "review", fail_reason: null, publish: false };
  if (autoPublish) return { step: "published", fail_reason: null, publish: true };
  return { step: "review", fail_reason: null, publish: false };
}

// eslint-disable-next-line no-unused-vars
export async function generate_featured_image_with_ai(article) {
  // TODO(M35): meter image_gen. DALL·E / M35 Creative Studio — unbuilt. Returns null
  // in scaffold mode; the worker leaves featured_image_url null and never calls this.
  return null;
}
