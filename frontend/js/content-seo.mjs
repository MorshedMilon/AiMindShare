// content-seo.mjs — the PURE, DETERMINISTIC on-page SEO + readability scorer (M22,
// D-125). No DOM / no provider / no network → shared verbatim by the editor's live
// SEO sidebar (browser) and the Node m22seoprobe. Same input ⇒ same score, always.
// Nothing here bills or calls out; the AI generation that WOULD meter is the S23
// auto-blog slice. Scores are stored on the article at save time (seo_score,
// readability_score, word_count).

// ── plain text + tokenisation (regex only, no DOM so it runs in Node) ──────────
export function plainText(html) {
  return String(html == null ? "" : html)
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ").trim();
}
const words = (t) => (t.match(/[A-Za-z0-9']+/g) || []);
const sentences = (t) => (t.match(/[^.!?]+[.!?]+/g) || (t.trim() ? [t] : []));

// Syllable estimate (vowel-group heuristic; deterministic, good enough for Flesch).
function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  let s = (w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
            .replace(/^y/, "").match(/[aeiouy]{1,2}/g) || []).length;
  return Math.max(1, s);
}

// Flesch Reading Ease (0–100; higher = easier). Clamped.
export function readingEase(text) {
  const w = words(text), s = sentences(text);
  if (!w.length || !s.length) return 0;
  const syl = w.reduce((n, x) => n + syllables(x), 0);
  const score = 206.835 - 1.015 * (w.length / s.length) - 84.6 * (syl / w.length);
  return Math.round(Math.max(0, Math.min(100, score)));
}

// ── the on-page rubric ────────────────────────────────────────────────────────
// A check is {label, state:'pass'|'warn'|'fail', hint, weight}. `score` is the
// weighted % of achieved points (a warn is worth half).
export function scoreArticle({ html = "", title = "", keyword = "", metaTitle = "",
  metaDesc = "", targetWords = 800 } = {}) {
  const text = plainText(html);
  const w = words(text);
  const wordCount = w.length;
  const readability = readingEase(text);
  const kw = keyword.trim().toLowerCase();
  const lc = (s) => String(s || "").toLowerCase();
  const bodyLc = lc(text), titleLc = lc(title);
  const first100 = w.slice(0, 100).join(" ").toLowerCase();

  // keyword density (occurrences of the whole phrase / wordCount)
  let density = 0;
  if (kw && wordCount) {
    const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    density = ((bodyLc.match(re) || []).length * (kw.split(/\s+/).length)) / wordCount * 100;
  }

  const links = (html.match(/<a\s[^>]*href=/gi) || []).length;
  const internalLinks = (html.match(/<a\s[^>]*href=["'](\/blog\/|\/(?!\/)|#)[^"']*["']/gi) || []).length;
  const imgs = (html.match(/<img\b[^>]*>/gi) || []);
  const imgsWithAlt = imgs.filter((t) => /\balt=["'][^"']+["']/i.test(t)).length;

  const has = (hay, needle) => needle && hay.includes(needle);
  const checks = [];
  const add = (label, state, hint, weight = 1) => checks.push({ label, state, hint, weight });

  // keyword placement
  add("Keyword in title", kw ? (has(titleLc, kw) ? "pass" : "fail") : "warn",
    "Put the target keyword in the H1/title.", 2);
  add("Keyword in meta title", kw ? (has(lc(metaTitle), kw) ? "pass" : "warn") : "warn",
    "Include the keyword in the SEO meta title.");
  add("Keyword in meta description", kw ? (has(lc(metaDesc), kw) ? "pass" : "warn") : "warn",
    "Include the keyword in the meta description.");
  add("Keyword in first paragraph", kw ? (has(first100, kw) ? "pass" : "warn") : "warn",
    "Use the keyword within the first 100 words.");
  add("Keyword in a subheading", kw ? (new RegExp(`<h[23][^>]*>[^<]*${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(html) ? "pass" : "warn") : "warn",
    "Add the keyword to at least one H2/H3.");
  // density band
  add("Keyword density", !kw ? "warn" : (density >= 0.5 && density <= 2.5 ? "pass" : (density < 0.5 ? "warn" : "fail")),
    `Aim for 0.5–2.5% (now ${density.toFixed(1)}%).`);
  // meta lengths
  const mt = metaTitle.length, md = metaDesc.length;
  add("Meta title length", mt === 0 ? "fail" : (mt >= 30 && mt <= 60 ? "pass" : "warn"),
    `30–60 chars (now ${mt}).`);
  add("Meta description length", md === 0 ? "fail" : (md >= 70 && md <= 160 ? "pass" : "warn"),
    `70–160 chars (now ${md}).`);
  // length
  add("Article length", wordCount >= targetWords ? "pass" : (wordCount >= targetWords * 0.6 ? "warn" : "fail"),
    `Target ${targetWords} words (now ${wordCount}).`, 2);
  // links + images
  add("Internal links", internalLinks >= 1 ? "pass" : "warn", "Link to at least one related article.");
  add("Outbound/any links", links >= 1 ? "pass" : "warn", "Add at least one supporting link.");
  add("Image alt coverage", imgs.length === 0 ? "warn" : (imgsWithAlt / imgs.length >= 0.8 ? "pass" : "warn"),
    imgs.length ? `${imgsWithAlt}/${imgs.length} images have alt text.` : "Add a featured/inline image.");
  // readability
  add("Readability (Flesch)", readability >= 60 ? "pass" : (readability >= 40 ? "warn" : "fail"),
    `Reading ease ${readability} (aim ≥ 60).`, 2);

  const totW = checks.reduce((n, c) => n + c.weight, 0);
  const got = checks.reduce((n, c) => n + c.weight * (c.state === "pass" ? 1 : c.state === "warn" ? 0.5 : 0), 0);
  const score = Math.round((got / totW) * 100);

  return { score, wordCount, readability, density: Math.round(density * 10) / 10, checklist: checks };
}

// ── PieceBlockerRecommendation ──────────────────────────────────────────────
// Turns a scoreArticle() result into actionable "blockers" — no recomputation,
// just reading the checklist/readability/density it already produced. `type`
// is a superset that includes "originality_flag" for future use; nothing here
// computes originality today, so that type is never emitted.
const BLOCKER_RULES = {
  "Readability (Flesch)": "readability",
  "Keyword density": "keyword_density",
  "Keyword in a subheading": "structure",
  "Meta title length": "meta",
  "Meta description length": "meta",
};

function blockerMessage(type, check, { readability, density } = {}) {
  switch (type) {
    case "readability":
      return `Readability is too low for most readers (Flesch ease ${readability}).`;
    case "keyword_density":
      return density > 2.5
        ? `Keyword density is too high at ${density}% — reads as keyword stuffing.`
        : `Keyword density is too low at ${density}% to register with search engines.`;
    case "structure":
      return "No H2/H3 subheading includes the target keyword.";
    case "meta":
      return `${check.label.replace(" length", "")} is missing or outside the recommended length.`;
    default:
      return check.label;
  }
}

// weight mirrors the importance the score engine already assigned each check;
// fail on a weight-2 check is "high", everything else scales down from there.
function blockerSeverity(state, weight) {
  if (state === "fail") return weight >= 2 ? "high" : "medium";
  return weight >= 2 ? "medium" : "low";
}

export function getBlockerRecommendations(contentScoreResult) {
  const { checklist = [], readability, density } = contentScoreResult || {};
  const blockers = [];
  for (const check of checklist) {
    const type = BLOCKER_RULES[check.label];
    if (!type || check.state === "pass") continue;
    blockers.push({
      type,
      severity: blockerSeverity(check.state, check.weight),
      message: blockerMessage(type, check, { readability, density }),
      fixSuggestion: check.hint,
    });
  }
  return blockers;
}

const SEVERITY_RANK = { high: 3, medium: 2, low: 1 };

export function topPriorityFix(blockers) {
  if (!Array.isArray(blockers) || !blockers.length) return null;
  return blockers.reduce((top, b) =>
    !top || SEVERITY_RANK[b.severity] > SEVERITY_RANK[top.severity] ? b : top, null);
}
