// m22seoprobe.mjs — verify the PURE M22 editor-side modules (content-seo scorer +
// content-editor sanitiser) in Node, no DB, no DOM. Proves the SEO/readability
// scoring is deterministic and bounded (D-125) and that the sanitiser strips every
// script/handler/disallowed tag (the content_html the blog-render Edge Fn injects
// raw must be clean at save time).
//   node workers/verify/m22seoprobe.mjs
import { scoreArticle, readingEase, plainText } from "../../frontend/js/content-seo.mjs";
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
