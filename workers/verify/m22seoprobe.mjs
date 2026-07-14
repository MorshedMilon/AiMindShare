// m22seoprobe.mjs — verify the PURE M22 editor-side modules (content-seo scorer +
// content-editor sanitiser) in Node, no DB, no DOM. Proves the SEO/readability
// scoring is deterministic and bounded (D-125) and that the sanitiser strips every
// script/handler/disallowed tag (the content_html the blog-render Edge Fn injects
// raw must be clean at save time).
//   node workers/verify/m22seoprobe.mjs
import { scoreArticle, readingEase, plainText, getBlockerRecommendations, topPriorityFix } from "../../frontend/js/content-seo.mjs";
import { sanitizeHtml } from "../../frontend/js/content-editor.mjs";

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

// ── content-seo: scoreArticle ─────────────────────────────────────────────────
console.log("\nM22 · content-seo — scoreArticle:");
const good = {
  html: "<h1>Best Medjool Dates</h1><p>Buy medjool dates online — the finest medjool dates, "
      + "graded fresh.</p><h2>Why medjool dates?</h2><p>Because medjool dates are delicious. "
      + "See our <a href='/blog/date-guide'>date guide</a> and <a href='https://x.com'>more</a>. "
      + "<img src='/a.jpg' alt='dates'></p>".repeat(1) + "<p>" + "word ".repeat(600) + "</p>",
  title: "Best Medjool Dates", keyword: "medjool dates",
  metaTitle: "Best Medjool Dates | Fresh Online Shop",
  metaDesc: "Buy the finest medjool dates online, graded and shipped fresh to your door today easily.",
  targetWords: 500,
};
const r = scoreArticle(good);
assert(typeof r.score === "number" && r.score >= 0 && r.score <= 100, `score in 0..100 (got ${r.score})`);
assert(r.wordCount > 500, `word count computed (${r.wordCount})`);
assert(Array.isArray(r.checklist) && r.checklist.every((c) => ["pass", "warn", "fail"].includes(c.state)),
  "checklist states are pass/warn/fail");
assert(r.checklist.find((c) => c.label === "Keyword in title").state === "pass", "keyword-in-title passes");
assert(r.score === scoreArticle(good).score, "deterministic — same input, same score");

console.log("\nM22 · content-seo — edge cases:");
const empty = scoreArticle({ html: "", title: "", keyword: "" });
assert(empty.score >= 0 && empty.wordCount === 0, "empty article → score 0, no throw");
assert(scoreArticle({ html: "<p>hi there friend</p>", title: "x" }).checklist
  .find((c) => c.label === "Keyword in title").state === "warn", "missing keyword → warn, not throw");
assert(readingEase("The cat sat on the mat. It was a good day.") > 0, "Flesch reading ease positive for simple prose");
assert(readingEase("") === 0, "Flesch on empty → 0");
assert(plainText("<p>a<script>bad()</script>b</p>") === "a b", "plainText strips script + tags (no code leaks)");

console.log("\nM22 · content-seo — PieceBlockerRecommendation:");
const fillerSentences = "The cat sat on the mat. ".repeat(40); // 240 monosyllabic words, high Flesch

// 1. perfect score — every rule-mapped check passes → no blockers
const perfect = scoreArticle({
  html: `<h2>Best kayak trip planning</h2><p>${fillerSentences}</p>`
      + "<p>A kayak trip is fun for everyone today.</p>",
  title: "Kayak Trips", keyword: "kayak",
  metaTitle: "Best Kayak Trip Planning Guide For Beginners",
  metaDesc: "Plan the perfect kayak trip with our complete beginner friendly guide "
      + "covering gear, safety tips, and the best routes to paddle this season.",
  targetWords: 100,
});
const perfectBlockers = getBlockerRecommendations(perfect);
assert(perfectBlockers.length === 0, `perfect score → no blockers (got ${perfectBlockers.length})`);
assert(topPriorityFix(perfectBlockers) === null, "perfect score → topPriorityFix null");

// 2. missing meta — empty meta title + description → 2 "meta" blockers, medium severity
const missingMeta = scoreArticle({
  html: `<h2>Best trail routes</h2><p>${fillerSentences}</p>`
      + "<p>A trail walk is fun for everyone today.</p>",
  title: "Trail Guide", keyword: "trail", metaTitle: "", metaDesc: "", targetWords: 100,
});
const missingMetaBlockers = getBlockerRecommendations(missingMeta);
assert(missingMetaBlockers.filter((b) => b.type === "meta").length === 2,
  `missing meta → 2 meta blockers (got ${JSON.stringify(missingMetaBlockers.map((b) => b.type))})`);
assert(missingMetaBlockers.every((b) => b.type !== "meta" || b.severity === "medium"),
  "missing meta blockers are medium severity");

// 3. keyword stuffing — density far above 2.5% → "keyword_density" blocker, fail-derived
const stuffed = scoreArticle({
  html: `<h2>Best puppy puppy care</h2><p>${"puppy ".repeat(12)}`
      + "Take care of your puppy with love and attention every day for a happy life.</p>",
  title: "Puppy Care", keyword: "puppy",
  metaTitle: "Puppy Care Tips For New Owners Everywhere",
  metaDesc: "Everything a new owner needs to know about feeding, training, and "
      + "caring for a happy, healthy puppy from the very first day home.",
  targetWords: 20,
});
assert(stuffed.density > 2.5, `stuffed sample density is actually high (${stuffed.density}%)`);
const stuffedBlockers = getBlockerRecommendations(stuffed);
const densityBlocker = stuffedBlockers.find((b) => b.type === "keyword_density");
assert(!!densityBlocker && densityBlocker.severity === "medium", "keyword stuffing → keyword_density blocker, medium severity");

// 4. poor readability — one long, polysyllabic sentence → "readability" blocker, high severity
const dense = scoreArticle({
  html: "<p>Notwithstanding the extraordinarily multifaceted implications inherent within "
      + "contemporary organizational infrastructures, practitioners must continuously "
      + "reevaluate interdisciplinary methodologies, prioritizing sustainability, "
      + "interoperability, and comprehensive accountability across increasingly complex, "
      + "internationally distributed, technologically sophisticated operational environments "
      + "worldwide indefinitely.</p>",
  title: "Ops", targetWords: 20,
});
assert(dense.readability < 40, `dense sample readability is actually low (${dense.readability})`);
const denseBlockers = getBlockerRecommendations(dense);
const readabilityBlocker = denseBlockers.find((b) => b.type === "readability");
assert(!!readabilityBlocker && readabilityBlocker.severity === "high", "poor readability → readability blocker, high severity");
assert(topPriorityFix(denseBlockers).type === "readability", "topPriorityFix picks the high-severity readability blocker over warn-level ones");

// 5. missing H2 structure — keyword set, no subheading carries it → "structure" blocker, low severity
const noStructure = scoreArticle({
  html: `<p>Our guide to trail running covers everything beginners need.</p><p>${fillerSentences}</p>`,
  title: "Trail Running", keyword: "trail running",
  metaTitle: "Trail Running Guide For Complete Beginners",
  metaDesc: "A friendly, practical trail running guide covering shoes, pacing, "
      + "hydration, and safety for anyone starting out on the trails this year.",
  targetWords: 100,
});
const noStructureBlockers = getBlockerRecommendations(noStructure);
const structureBlocker = noStructureBlockers.find((b) => b.type === "structure");
assert(!!structureBlocker && structureBlocker.severity === "low", "missing H2 structure → structure blocker, low severity");

assert(getBlockerRecommendations({}).length === 0, "getBlockerRecommendations tolerates missing/empty input");
assert(topPriorityFix([]) === null, "topPriorityFix([]) is null");

// ── content-editor: sanitizeHtml ─────────────────────────────────────────────
console.log("\nM22 · content-editor — sanitizeHtml:");
assert(sanitizeHtml("<p onclick=alert(1)>hi</p>") === "<p>hi</p>", "strips inline event handler");
assert(!/script/i.test(sanitizeHtml("<p>ok</p><script>steal()</script>")), "removes <script> element");
assert(sanitizeHtml('<a href="javascript:evil()">x</a>') === "<a>x</a>", "drops javascript: href");
assert(sanitizeHtml('<a href="/blog/x" title="t">y</a>') === '<a href="/blog/x" title="t">y</a>', "keeps allowed a[href,title]");
assert(sanitizeHtml('<img src="/a.jpg" alt="d" onerror="x">') === '<img src="/a.jpg" alt="d">', "img keeps src/alt, drops onerror");
assert(sanitizeHtml("<h2>Head</h2><blockquote>q</blockquote>") === "<h2>Head</h2><blockquote>q</blockquote>", "keeps semantic blocks");
assert(sanitizeHtml("<div><span>plain</span></div>") === "plain", "unwraps disallowed tags, keeps text");

console.log(`\n\x1b[${fail ? 31 : 32}mM22 seo/editor probe: ${pass} passed, ${fail} failed\x1b[0m`);
process.exit(fail ? 1 : 0);
