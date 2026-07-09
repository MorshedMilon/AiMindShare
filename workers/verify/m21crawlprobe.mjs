// m21crawlprobe.mjs — unit-verify the pure M21 audit crawler (no network, no db).
// Proves: bounded batches advance the frontier · broken links + missing on-page SEO
// tags are flagged · the crawl resumes across chunks and terminates. Mirrors the
// M13 walk probe (a pure-module unit test alongside the SQL probe).
//
//   node workers/verify/m21crawlprobe.mjs
import { crawlStep } from "../seo/crawler.mjs";

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

// A tiny fake site: home (clean, links /a + /b), /a is a 404 (broken), /b misses <title>.
const pages = {
  "https://acme.com": { status: 200, html: `<title>Home</title><meta name="description" content="x"><h1>Home</h1><a href="/a">a</a><a href="/b">b</a>` },
  "https://acme.com/a": { status: 404, html: "" },
  "https://acme.com/b": { status: 200, html: `<h1>B</h1>` }, // missing <title> + missing meta
};
const fetchFn = async (u) => pages[u] ?? { status: 404, html: "" };

async function main() {
  console.log("\nM21 · crawler — bounded resumable BFS + issue detection:");
  const origin = "https://acme.com";
  let state = { frontier: [origin], visited: [], issues: [] };

  // Chunk 1 (batch 2): home + /a. /a is a broken link.
  state = await crawlStep(state, { origin, batch: 2, fetchFn });
  assert(state.visited.length === 2, `chunk 1 visits 2 pages (got ${state.visited.length})`);
  assert(state.issues.some((i) => i.type === "broken_link"), "chunk 1 flags the broken link (/a → 404)");
  assert(state.frontier.length === 1 && state.frontier[0] === "https://acme.com/b",
    "chunk 1 leaves /b on the frontier (resume state persisted)");

  // Chunk 2 (batch 2): /b → missing title; frontier drains → crawl terminates.
  state = await crawlStep(state, { origin, batch: 2, fetchFn });
  assert(state.issues.some((i) => i.type === "missing_title"), "chunk 2 flags the missing <title> on /b");
  assert(state.issues.some((i) => i.type === "missing_meta"), "chunk 2 flags the missing meta description on /b");
  assert(state.frontier.length === 0, "crawl terminates (frontier empty)");
  assert(state.visited.length === 3, `all 3 pages visited exactly once (got ${state.visited.length})`);

  // maxPages guard: a fresh crawl stops at the cap even with links remaining.
  let capped = { frontier: [origin], visited: [], issues: [] };
  capped = await crawlStep(capped, { origin, batch: 100, fetchFn, maxPages: 1 });
  assert(capped.visited.length === 1, "maxPages caps the crawl (1 page, then stops)");

  // robots disallow: a disallowed path is marked visited but never fetched/inspected.
  let robo = { frontier: ["https://acme.com/b"], visited: [], issues: [] };
  robo = await crawlStep(robo, { origin, batch: 5, fetchFn, disallow: ["/b"] });
  assert(robo.issues.length === 0 && robo.visited.includes("https://acme.com/b"),
    "robots disallow skips a path (no issues raised for /b)");

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M21 crawl probe: ${pass} passed, ${fail} failed\x1b[0m`);
  process.exitCode = fail === 0 ? 0 : 1;
}
main().catch((e) => { console.error("harness error:", e); process.exitCode = 2; });
