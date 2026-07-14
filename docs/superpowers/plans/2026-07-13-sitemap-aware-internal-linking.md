# Sitemap-Aware Internal Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone library (`workers/seo/internal-linking.mjs` + `workers/providers/embeddings.js`) that crawls a site's sitemap, embeds each page locally, stores the index as JSON, and can suggest semantically relevant internal links for a piece of article content — fulfilling the "Sitemap-Aware Internal Linking" work D-193 named as deferred, separate future scope.

**Architecture:** `providers/embeddings.js` is a single adapter for the whole `embeddings` capability, routed through the already-merged `config/providers.js` (`resolveProvider`/`logProviderUsage`). Its free tier runs `@xenova/transformers` locally (no key, no cost); its paid tier (`openai`/`cohere`) is registered in `PROVIDER_CONFIG` but throws "not implemented" — no real adapter yet. `seo/internal-linking.mjs` layers on top: `crawlSitemap` (plain `fetch` + `cheerio`, injectable `fetchFn`) → `buildIndex` (embeds + writes gitignored `seo/sitemap-index.json`) → `findLinkCandidates` (cosine similarity ranking) → `suggestInternalLinks` (phrase-matches candidate titles against unlinked article text). A CLI (`rebuild-sitemap-index.js`) wraps `buildIndex` for on-demand rebuilds. Nothing in this plan touches `workers/worker.mjs`'s `auto_link` stage — that stays a stub (deferred follow-up, not this session).

**Tech Stack:** Node 18+ ESM (matches `workers/package.json`), `cheerio` for HTML parsing, `@xenova/transformers` for local embeddings, `node:fs/promises` for JSON storage — no new external services, no DB migration.

**Full spec:** `docs/superpowers/specs/2026-07-13-sitemap-aware-internal-linking-design.md`

**Plan-time refinement of the spec:** the spec says `crawlSitemap` "Returns `[{ url, title, snippet }]`" without saying how skipped/dead pages are reported. This plan resolves that ambiguity: `crawlSitemap` returns `{ pages, skippedUrls }` (`pages` still shaped `[{url, title, snippet}]`; `skippedUrls` is the list of sitemap URLs that failed to scrape). `buildIndex`'s returned `{ indexed, skipped }` is `pages.length` / `skippedUrls.length` from that call.

---

## File Structure

- Modify: `workers/config/providers.js` — `PROVIDER_CONFIG.embeddings.free` → `xenova-transformers`; `.paid` → `[openai, cohere]` (registered, not implemented)
- Modify: `workers/verify/providersprobe.mjs` — update embeddings assertions to match
- Create: `workers/providers/embeddings.js` — `embed(text, config, opts)` adapter
- Create: `workers/seo/internal-linking.mjs` — `crawlSitemap`, `buildIndex`, `findLinkCandidates`, `suggestInternalLinks`
- Create: `workers/verify/internallinkingprobe.mjs` — pure unit probe, no network, no real model download, covering both new modules
- Create: `workers/rebuild-sitemap-index.js` — CLI entry point
- Modify: `workers/package.json` — add `cheerio`, `@xenova/transformers` deps + `rebuild-sitemap-index` script
- Modify: `scripts/verify.sh` — register `internallinkingprobe.mjs`
- Modify: `.gitignore` (repo root) — ignore `workers/seo/sitemap-index.json`
- Modify: `DECISIONS-AiMindShare-v1_0.md` — new entry **D-194**
- Modify: `TASKS.md` — new session entry once verified

---

### Task 1: `PROVIDER_CONFIG.embeddings` — local xenova-transformers free default + registered paid options

**Files:**
- Modify: `workers/config/providers.js:31-38`
- Modify: `workers/verify/providersprobe.mjs`

- [ ] **Step 1: Write the failing test**

In `workers/verify/providersprobe.mjs`, replace the capability-loop block (lines 16-24) with:

```js
const CAPABILITIES = ["seoAudit", "plagiarism", "embeddings", "webSearch", "imageGen"];
for (const capability of CAPABILITIES) {
  assert(Object.prototype.hasOwnProperty.call(PROVIDER_CONFIG, capability),
    `PROVIDER_CONFIG has a "${capability}" entry`);
  assert(typeof PROVIDER_CONFIG[capability].free.name === "string",
    `PROVIDER_CONFIG.${capability}.free has a name`);
}
for (const capability of ["seoAudit", "plagiarism", "webSearch", "imageGen"]) {
  assert(Array.isArray(PROVIDER_CONFIG[capability].paid) && PROVIDER_CONFIG[capability].paid.length === 0,
    `PROVIDER_CONFIG.${capability}.paid starts empty`);
}
assert(PROVIDER_CONFIG.embeddings.paid.length === 2,
  "PROVIDER_CONFIG.embeddings.paid registers openai + cohere (not yet implemented)");
assert(PROVIDER_CONFIG.embeddings.paid.every((p) => typeof p.name === "string" && typeof p.envVar === "string"),
  "PROVIDER_CONFIG.embeddings.paid entries have name + envVar");
```

Replace the embeddings `resolveProvider` assertion block (lines 36-40) with:

```js
{
  const result = resolveProvider("embeddings", {});
  assert(result.tier === "free" && result.provider.name === "xenova-transformers",
    "resolveProvider('embeddings', {}) resolves to the local xenova-transformers free default");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers && node verify/providersprobe.mjs`
Expected: FAIL — the embeddings free-default assertion fails (`huggingface` !== `xenova-transformers`) and the `PROVIDER_CONFIG.embeddings.paid.length === 2` assertion fails (still `0`).

- [ ] **Step 3: Write the implementation**

In `workers/config/providers.js`, replace the `embeddings` block (lines 31-38):

```js
  embeddings: {
    free: {
      name: "xenova-transformers",
      envVar: null,
      description: "Local @xenova/transformers embedding model (Xenova/all-MiniLM-L6-v2) — runs in-process, no API key, no cost.",
    },
    paid: [
      { name: "openai", envVar: "OPENAI_API_KEY", description: "OpenAI Embeddings API — not yet implemented, config only." },
      { name: "cohere", envVar: "COHERE_API_KEY", description: "Cohere Embed API — not yet implemented, config only." },
    ],
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers && node verify/providersprobe.mjs`
Expected: all assertions pass, ending in `N passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add workers/config/providers.js workers/verify/providersprobe.mjs
git commit -m "feat(providers): switch embeddings free default to local xenova-transformers"
```

---

### Task 2: `providers/embeddings.js` — the embeddings adapter

**Files:**
- Create: `workers/providers/embeddings.js`
- Create: `workers/verify/internallinkingprobe.mjs`

- [ ] **Step 1: Write the failing test**

Create `workers/verify/internallinkingprobe.mjs`:

```js
// internallinkingprobe.mjs — pure unit tests for providers/embeddings.js and
// seo/internal-linking.mjs. No network, no real model download: embeddings
// are always supplied via an injected pipelineFactory/embedFn.
import { rmSync, existsSync as existsSyncForTest, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { embed } from "../providers/embeddings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

console.log("══ workers/providers/embeddings.js — embed() ══");

const fakeVector = [0.1, 0.2, 0.3];
const fakePipelineFactory = async () => async (text, opts) => ({ data: Float32Array.from(fakeVector) });

const EMBED_TEST_LOG_PATH = path.join(__dirname, "embeddings-usage-test.json");
if (existsSyncForTest(EMBED_TEST_LOG_PATH)) rmSync(EMBED_TEST_LOG_PATH);

{
  const vector = await embed("hello world", {}, { pipelineFactory: fakePipelineFactory, logPath: EMBED_TEST_LOG_PATH });
  assert(Array.isArray(vector) && vector.length === 3, "embed() free tier returns a plain array from the injected pipeline");
  assert(vector[0] === 0.1, "embed() free tier returns the pipeline's actual values");
}
{
  const entries = JSON.parse(readFileSync(EMBED_TEST_LOG_PATH, "utf8"));
  assert(entries.length === 1 && entries[0].provider === "xenova-transformers" && entries[0].tier === "free",
    "embed() logs usage against the xenova-transformers free provider");
}
{
  let threw = false, message = "";
  try {
    await embed("hello", { apiKey: "sk-test", provider: "openai" }, { logPath: EMBED_TEST_LOG_PATH });
  } catch (e) { threw = true; message = e.message; }
  assert(threw && /openai embeddings not implemented yet/.test(message),
    "embed() throws for the registered-but-unimplemented openai paid provider");
}
{
  let threw = false, message = "";
  try {
    await embed("hello", { apiKey: "sk-test", provider: "cohere" }, { logPath: EMBED_TEST_LOG_PATH });
  } catch (e) { threw = true; message = e.message; }
  assert(threw && /cohere embeddings not implemented yet/.test(message),
    "embed() throws for the registered-but-unimplemented cohere paid provider");
}
{
  const entries = JSON.parse(readFileSync(EMBED_TEST_LOG_PATH, "utf8"));
  assert(entries.length === 3, "embed() logs usage even for the paid not-implemented throws");
}
rmSync(EMBED_TEST_LOG_PATH);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers && node verify/internallinkingprobe.mjs`
Expected: FAIL — `Cannot find module '../providers/embeddings.js'`.

- [ ] **Step 3: Write the implementation**

Create `workers/providers/embeddings.js`:

```js
// embeddings.js — providers/embeddings adapter: resolves the "embeddings"
// capability via config/providers.js and runs the free tier locally with
// @xenova/transformers. Paid tiers (openai, cohere) are registered in
// PROVIDER_CONFIG but not implemented — see ../README-providers.md and
// docs/superpowers/specs/2026-07-13-sitemap-aware-internal-linking-design.md.

import { resolveProvider, logProviderUsage } from "../config/providers.js";

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

let cachedPipelinePromise = null;

async function defaultPipelineFactory() {
  const { pipeline } = await import("@xenova/transformers");
  return pipeline("feature-extraction", MODEL_NAME);
}

async function getPipeline(pipelineFactory) {
  if (!cachedPipelinePromise) {
    cachedPipelinePromise = (pipelineFactory ?? defaultPipelineFactory)();
  }
  return cachedPipelinePromise;
}

export async function embed(text, config = {}, { pipelineFactory, logPath } = {}) {
  const { tier, provider } = resolveProvider("embeddings", config);

  if (tier === "paid") {
    await logProviderUsage("embeddings", provider.name, { tier }, logPath);
    throw new Error(`${provider.name} embeddings not implemented yet`);
  }

  const pipe = await getPipeline(pipelineFactory);
  const output = await pipe(text, { pooling: "mean", normalize: true });
  await logProviderUsage("embeddings", provider.name, { tier }, logPath);
  return Array.from(output.data);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers && node verify/internallinkingprobe.mjs`
Expected: `5 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add workers/providers/embeddings.js workers/verify/internallinkingprobe.mjs
git commit -m "feat(providers): add embeddings adapter (local xenova-transformers free tier)"
```

---

### Task 3: `seo/internal-linking.mjs` — `crawlSitemap`

**Files:**
- Create: `workers/seo/internal-linking.mjs`
- Modify: `workers/verify/internallinkingprobe.mjs`

- [ ] **Step 1: Write the failing test**

In `workers/verify/internallinkingprobe.mjs`, add `crawlSitemap` to the top import from `../seo/internal-linking.mjs` (new import line, placed after the `embed` import):

```js
import { crawlSitemap } from "../seo/internal-linking.mjs";
```

Add this section before the final `console.log(pass/fail)` + `process.exit` lines (move those two lines to stay at the very end of the file after this new section):

```js
console.log("\n══ workers/seo/internal-linking.mjs — crawlSitemap() ══");

function fakeFetch(responses) {
  return async (url) => {
    const entry = responses[url];
    if (!entry) return { ok: false, status: 404, text: async () => "" };
    return { ok: entry.status < 400, status: entry.status, text: async () => entry.body };
  };
}

const kayakHtml = `<html><head><title>Best Kayak Trip Planning</title></head><body><nav>NAVMARKER</nav><h1>Kayak Trips</h1><p>${"paddle ".repeat(210)}</p><footer>FOOTERMARKER</footer></body></html>`;
const hikeHtml = `<html><head><title>Trail Hiking Guide</title></head><body><p>${"trail ".repeat(50)}</p></body></html>`;

const flatSitemapXml = `<?xml version="1.0"?><urlset><url><loc>https://example.com/kayaking</loc></url><url><loc>https://example.com/hiking</loc></url><url><loc>https://example.com/dead</loc></url></urlset>`;

const flatResponses = {
  "https://example.com/sitemap.xml": { status: 200, body: flatSitemapXml },
  "https://example.com/kayaking": { status: 200, body: kayakHtml },
  "https://example.com/hiking": { status: 200, body: hikeHtml },
  "https://example.com/dead": { status: 404, body: "" },
};

{
  const { pages, skippedUrls } = await crawlSitemap("https://example.com/sitemap.xml", { fetchFn: fakeFetch(flatResponses) });
  assert(pages.length === 2, `crawlSitemap indexes the 2 live pages (got ${pages.length})`);
  assert(skippedUrls.length === 1 && skippedUrls[0] === "https://example.com/dead",
    "crawlSitemap skips the dead page instead of throwing");
  const kayak = pages.find((p) => p.url === "https://example.com/kayaking");
  assert(kayak.title === "Best Kayak Trip Planning", "crawlSitemap extracts the page <title>");
  assert(kayak.snippet.split(" ").length === 200, `crawlSitemap's snippet is capped at 200 words (got ${kayak.snippet.split(" ").length})`);
  assert(!kayak.snippet.includes("NAVMARKER") && !kayak.snippet.includes("FOOTERMARKER"),
    "crawlSitemap's snippet excludes nav/footer text");
}

const indexXml = `<?xml version="1.0"?><sitemapindex><sitemap><loc>https://example.com/sitemap-a.xml</loc></sitemap><sitemap><loc>https://example.com/sitemap-b.xml</loc></sitemap></sitemapindex>`;
const sitemapAXml = `<urlset><url><loc>https://example.com/kayaking</loc></url></urlset>`;
const sitemapBXml = `<urlset><url><loc>https://example.com/hiking</loc></url></urlset>`;
const indexResponses = {
  "https://example.com/sitemap-index.xml": { status: 200, body: indexXml },
  "https://example.com/sitemap-a.xml": { status: 200, body: sitemapAXml },
  "https://example.com/sitemap-b.xml": { status: 200, body: sitemapBXml },
  "https://example.com/kayaking": { status: 200, body: kayakHtml },
  "https://example.com/hiking": { status: 200, body: hikeHtml },
};
{
  const { pages } = await crawlSitemap("https://example.com/sitemap-index.xml", { fetchFn: fakeFetch(indexResponses) });
  assert(pages.length === 2, "crawlSitemap follows one level of <sitemapindex> nesting and merges child pages");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers && node verify/internallinkingprobe.mjs`
Expected: FAIL — `Cannot find module '../seo/internal-linking.mjs'`.

- [ ] **Step 3: Write the implementation**

Create `workers/seo/internal-linking.mjs`:

```js
// internal-linking.mjs — Sitemap-Aware Internal Linking: crawls a sitemap,
// embeds each page (via providers/embeddings.js), stores a local JSON index,
// and suggests semantically relevant internal links for a piece of content.
// See docs/superpowers/specs/2026-07-13-sitemap-aware-internal-linking-design.md.
// NOT wired into workers/worker.mjs's auto_link stage — that remains a stub
// (deferred, see the design doc's Scope section).

import * as cheerio from "cheerio";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { embed } from "../providers/embeddings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_INDEX_PATH = path.join(__dirname, "sitemap-index.json");

function locsFrom(xml) {
  const out = [];
  const re = /<loc>\s*([^<\s][^<]*?)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1].trim());
  return out;
}

function firstNWords(text, n) {
  return text.trim().split(/\s+/).filter(Boolean).slice(0, n).join(" ");
}

async function scrapePage(url, fetchFn) {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, footer, header").remove();
  const title = $("title").first().text().trim();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  return { url, title, snippet: firstNWords(bodyText, 200) };
}

export async function crawlSitemap(sitemapUrl, { fetchFn = fetch } = {}) {
  const sitemapRes = await fetchFn(sitemapUrl);
  const xml = await sitemapRes.text();

  let pageUrls;
  if (/<sitemapindex[\s>]/i.test(xml)) {
    pageUrls = [];
    for (const childUrl of locsFrom(xml)) {
      const childRes = await fetchFn(childUrl);
      const childXml = await childRes.text();
      pageUrls.push(...locsFrom(childXml));
    }
  } else {
    pageUrls = locsFrom(xml);
  }

  const pages = [];
  const skippedUrls = [];
  for (const url of pageUrls) {
    try {
      pages.push(await scrapePage(url, fetchFn));
    } catch {
      skippedUrls.push(url);
    }
  }
  return { pages, skippedUrls };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers && node verify/internallinkingprobe.mjs`
Expected: all assertions pass, ending in `N passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add workers/seo/internal-linking.mjs workers/verify/internallinkingprobe.mjs
git commit -m "feat(seo): add crawlSitemap — sitemap-index + page scrape via fetch+cheerio"
```

---

### Task 4: `buildIndex` + `findLinkCandidates`

**Files:**
- Modify: `workers/seo/internal-linking.mjs`
- Modify: `workers/verify/internallinkingprobe.mjs`

- [ ] **Step 1: Write the failing test**

In `workers/verify/internallinkingprobe.mjs`, change the import from `../seo/internal-linking.mjs` to include the two new exports:

```js
import { crawlSitemap, buildIndex, findLinkCandidates } from "../seo/internal-linking.mjs";
```

Add this section right after the `crawlSitemap` section (still before the final pass/fail print):

```js
console.log("\n══ workers/seo/internal-linking.mjs — buildIndex() + findLinkCandidates() ══");

const INDEX_TEST_PATH = path.join(__dirname, "sitemap-index-test.json");
if (existsSyncForTest(INDEX_TEST_PATH)) rmSync(INDEX_TEST_PATH);

function fakeEmbed(text) {
  const lower = text.toLowerCase();
  if (lower.includes("kayak")) return [1, 0, 0];
  if (lower.includes("trail") || lower.includes("hik")) return [0.9, 0.1, 0];
  return [0, 1, 0];
}

const buildResult = await buildIndex("https://example.com/sitemap.xml", {}, {
  fetchFn: fakeFetch(flatResponses),
  embedFn: async (text) => fakeEmbed(text),
  indexPath: INDEX_TEST_PATH,
});
assert(buildResult.indexed === 2 && buildResult.skipped === 1,
  `buildIndex reports 2 indexed, 1 skipped (got ${JSON.stringify(buildResult)})`);

{
  const stored = JSON.parse(readFileSync(INDEX_TEST_PATH, "utf8"));
  assert(Object.keys(stored).length === 2, "buildIndex writes an entry per indexed page");
  assert(Array.isArray(stored["https://example.com/kayaking"].embedding),
    "buildIndex stores the embedding vector alongside url/title/snippet");
}

{
  const candidates = await findLinkCandidates("An article about kayak gear", 5, {}, {
    embedFn: async (text) => fakeEmbed(text),
    indexPath: INDEX_TEST_PATH,
  });
  assert(candidates[0].url === "https://example.com/kayaking",
    "findLinkCandidates ranks the most semantically similar page first");
  assert(candidates.length === 2, "findLinkCandidates returns all indexed pages when topN exceeds the index size");
}
{
  const candidates = await findLinkCandidates("An article about kayak gear", 1, {}, {
    embedFn: async (text) => fakeEmbed(text),
    indexPath: INDEX_TEST_PATH,
  });
  assert(candidates.length === 1, "findLinkCandidates truncates to topN");
}
{
  const candidates = await findLinkCandidates("An article about kayak gear", 5, { currentUrl: "https://example.com/kayaking" }, {
    embedFn: async (text) => fakeEmbed(text),
    indexPath: INDEX_TEST_PATH,
  });
  assert(!candidates.some((c) => c.url === "https://example.com/kayaking"),
    "findLinkCandidates excludes config.currentUrl from results");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers && node verify/internallinkingprobe.mjs`
Expected: FAIL — `buildIndex is not a function` / `findLinkCandidates is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `workers/seo/internal-linking.mjs` (after `crawlSitemap`):

```js
async function loadIndex(indexPath) {
  if (!existsSync(indexPath)) return {};
  try {
    return JSON.parse(await readFile(indexPath, "utf8"));
  } catch {
    return {};
  }
}

async function saveIndex(entries, indexPath) {
  await writeFile(indexPath, JSON.stringify(entries, null, 2));
}

export async function buildIndex(sitemapUrl, config = {}, opts = {}) {
  const { fetchFn, embedFn = embed, indexPath = DEFAULT_INDEX_PATH } = opts;
  const { pages, skippedUrls } = await crawlSitemap(sitemapUrl, fetchFn ? { fetchFn } : {});
  const entries = await loadIndex(indexPath);

  for (const page of pages) {
    const embedding = await embedFn(`${page.title}\n${page.snippet}`, config);
    entries[page.url] = { ...page, embedding, crawledAt: new Date().toISOString() };
  }

  await saveIndex(entries, indexPath);
  return { indexed: pages.length, skipped: skippedUrls.length };
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function findLinkCandidates(currentPageText, topN = 5, config = {}, opts = {}) {
  const { embedFn = embed, indexPath = DEFAULT_INDEX_PATH } = opts;
  const queryEmbedding = await embedFn(currentPageText, config);
  const entries = await loadIndex(indexPath);

  return Object.values(entries)
    .filter((entry) => entry.url !== config.currentUrl)
    .map((entry) => ({
      url: entry.url,
      title: entry.title,
      snippet: entry.snippet,
      score: cosineSimilarity(queryEmbedding, entry.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers && node verify/internallinkingprobe.mjs`
Expected: all assertions pass, ending in `N passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add workers/seo/internal-linking.mjs workers/verify/internallinkingprobe.mjs
git commit -m "feat(seo): add buildIndex + findLinkCandidates (JSON storage, cosine ranking)"
```

---

### Task 5: `suggestInternalLinks`

**Files:**
- Modify: `workers/seo/internal-linking.mjs`
- Modify: `workers/verify/internallinkingprobe.mjs`

- [ ] **Step 1: Write the failing test**

In `workers/verify/internallinkingprobe.mjs`, change the import from `../seo/internal-linking.mjs` to include the new export:

```js
import { crawlSitemap, buildIndex, findLinkCandidates, suggestInternalLinks } from "../seo/internal-linking.mjs";
```

Add this section right after the `buildIndex` + `findLinkCandidates` section, and move the final `console.log(pass/fail)` + `process.exit` lines to after it:

```js
console.log("\n══ workers/seo/internal-linking.mjs — suggestInternalLinks() ══");

const article = `<article><p>This guide covers everything you need for a great kayak trip planning session.</p><p>We already linked <a href="/other">kayak trip planning</a> once here.</p><p>For something different, try trail hiking guide activities too.</p></article>`;

{
  const suggestions = await suggestInternalLinks(article, {}, {
    embedFn: async (text) => fakeEmbed(text),
    indexPath: INDEX_TEST_PATH,
  });
  const kayakSuggestion = suggestions.find((s) => s.url === "https://example.com/kayaking");
  assert(!!kayakSuggestion, "suggestInternalLinks finds an unlinked mention of the kayak candidate's title phrase");
  assert(kayakSuggestion.anchorText.toLowerCase() === "kayak trip planning",
    `suggestInternalLinks' anchorText matches the phrase found in the article (got "${kayakSuggestion?.anchorText}")`);
  assert(!kayakSuggestion.context.includes("We already linked"),
    "suggestInternalLinks surfaces the plain-text occurrence's context, not the linked one");

  const trailSuggestion = suggestions.find((s) => s.url === "https://example.com/hiking");
  assert(!!trailSuggestion, "suggestInternalLinks finds the trail hiking candidate's phrase too");
}

const linkedOnlyArticle = `<article><p>Nothing special here.</p><p>We already linked <a href="/other">kayak trip planning</a> as our only mention.</p></article>`;
{
  const suggestions = await suggestInternalLinks(linkedOnlyArticle, {}, {
    embedFn: async (text) => fakeEmbed(text),
    indexPath: INDEX_TEST_PATH,
  });
  assert(!suggestions.some((s) => s.url === "https://example.com/kayaking"),
    "suggestInternalLinks omits a candidate whose only textual match is already inside an <a>");
}

rmSync(INDEX_TEST_PATH);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers && node verify/internallinkingprobe.mjs`
Expected: FAIL — `suggestInternalLinks is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `workers/seo/internal-linking.mjs` (after `findLinkCandidates`):

```js
const STOPWORDS = new Set([
  "a", "an", "the", "of", "for", "to", "in", "on", "and", "or", "best",
  "guide", "how", "why", "your",
]);

function deriveKeywordPhrase(title) {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w));
  return words.slice(0, 4).join(" ");
}

export async function suggestInternalLinks(articleHtml, config = {}, opts = {}) {
  const $ = cheerio.load(articleHtml);
  const plainText = $.text().replace(/\s+/g, " ").trim();

  const candidates = await findLinkCandidates(plainText, config.topN ?? 5, config, opts);

  const $noLinks = cheerio.load(articleHtml);
  $noLinks("a").remove();
  const searchableText = $noLinks.text().replace(/\s+/g, " ").trim();
  const searchableLower = searchableText.toLowerCase();

  const suggestions = [];
  for (const candidate of candidates) {
    const phrase = deriveKeywordPhrase(candidate.title);
    if (!phrase) continue;
    const matchIndex = searchableLower.indexOf(phrase);
    if (matchIndex === -1) continue;

    const anchorText = searchableText.slice(matchIndex, matchIndex + phrase.length);
    const contextStart = Math.max(0, matchIndex - 40);
    const contextEnd = Math.min(searchableText.length, matchIndex + phrase.length + 40);

    suggestions.push({
      url: candidate.url,
      anchorText,
      context: searchableText.slice(contextStart, contextEnd),
      candidateTitle: candidate.title,
    });
  }
  return suggestions;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers && node verify/internallinkingprobe.mjs`
Expected: all assertions pass, ending in `N passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add workers/seo/internal-linking.mjs workers/verify/internallinkingprobe.mjs
git commit -m "feat(seo): add suggestInternalLinks — phrase-match candidates against unlinked text"
```

---

### Task 6: CLI (`rebuild-sitemap-index.js`) + dependencies

**Files:**
- Create: `workers/rebuild-sitemap-index.js`
- Modify: `workers/package.json`

- [ ] **Step 1: Add dependencies + npm script**

In `workers/package.json`, change the `"scripts"` block to add one entry (after `"jobprobe"`):

```json
  "scripts": {
    "worker": "node worker.mjs",
    "worker:once": "node worker.mjs --once",
    "leakprobe": "node verify/leakprobe.mjs",
    "jobprobe": "node verify/jobprobe.mjs",
    "rebuild-sitemap-index": "node rebuild-sitemap-index.js"
  },
```

Change the `"dependencies"` block to add two entries:

```json
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "@xenova/transformers": "^2.17.2",
    "cheerio": "^1.0.0"
  },
```

- [ ] **Step 2: Install**

Run: `cd workers && npm install`
Expected: exits 0; `node_modules/@xenova/transformers` and `node_modules/cheerio` now exist; `workers/package-lock.json` is updated.

- [ ] **Step 3: Write the CLI**

Create `workers/rebuild-sitemap-index.js`:

```js
#!/usr/bin/env node
// rebuild-sitemap-index.js — CLI to (re)build workers/seo/sitemap-index.json
// from a site's sitemap.xml. Usage:
//   node rebuild-sitemap-index.js <sitemapUrl>
import { buildIndex } from "./seo/internal-linking.mjs";

const sitemapUrl = process.argv[2];
if (!sitemapUrl) {
  console.error("Usage: node rebuild-sitemap-index.js <sitemapUrl>");
  process.exit(1);
}

try {
  const { indexed, skipped } = await buildIndex(sitemapUrl);
  console.log(`Indexed ${indexed} pages, skipped ${skipped}`);
  process.exit(0);
} catch (e) {
  console.error(`rebuild-sitemap-index failed: ${e.message}`);
  process.exit(1);
}
```

- [ ] **Step 4: Manually verify the argv-guard path**

Run: `cd workers && node rebuild-sitemap-index.js`
Expected: prints `Usage: node rebuild-sitemap-index.js <sitemapUrl>` to stderr, exits 1. (The success path is already covered by `buildIndex`'s own probe coverage in Task 4 — this script is a thin wrapper with nothing else to unit-test.)

- [ ] **Step 5: Commit**

```bash
git add workers/rebuild-sitemap-index.js workers/package.json workers/package-lock.json
git commit -m "feat(seo): add rebuild-sitemap-index CLI + cheerio/@xenova/transformers deps"
```

---

### Task 7: register the probe + gitignore the index file + full verify.sh pass

**Files:**
- Modify: `scripts/verify.sh`
- Modify: `.gitignore` (repo root)

- [ ] **Step 1: Register the probe in `scripts/verify.sh`**

Add after the provider abstraction layer's block (currently lines 108-109, right after `( cd workers && node verify/providersprobe.mjs ) || fails=$((fails+1))`):

```bash
echo; echo "══ +  Sitemap-Aware Internal Linking: crawlSitemap + embeddings adapter + buildIndex + findLinkCandidates + suggestInternalLinks (unit, no network, no model download) ══"
( cd workers && node verify/internallinkingprobe.mjs ) || fails=$((fails+1))
```

- [ ] **Step 2: Add the index file to `.gitignore`**

Append this line to the repo-root `.gitignore` (after `workers/config/provider-usage.json`):

```
workers/seo/sitemap-index.json
```

- [ ] **Step 3: Run the new probe standalone once more**

Run: `cd workers && node verify/internallinkingprobe.mjs`
Expected: `N passed, 0 failed`.

- [ ] **Step 4: Run the full verify suite**

Run: `bash scripts/verify.sh`
Expected: the new "Sitemap-Aware Internal Linking" section prints `N passed, 0 failed`; the "Provider abstraction layer" section (Task 1's changes) also still prints `N passed, 0 failed`; overall script output ends with `✔ verify.sh: all runnable probes passed` (any pre-existing unrelated failures are not this task's concern — only confirm the two touched sections are clean and nothing that was passing before regressed).

- [ ] **Step 5: Confirm no stray files**

Run: `git status --short`
Expected: clean except this plan's own committed changes; no untracked `workers/seo/sitemap-index.json` or `workers/config/provider-usage.json` (both gitignored, and nothing in this session calls either outside the probes' own throwaway test paths).

- [ ] **Step 6: Commit**

```bash
git add scripts/verify.sh .gitignore
git commit -m "test(seo): register internallinkingprobe.mjs in verify.sh"
```

---

### Task 8: DECISIONS entry D-194

**Files:**
- Modify: `DECISIONS-AiMindShare-v1_0.md`

- [ ] **Step 1: Re-confirm D-194 is still free**

Run: `grep -n "^## D-19" "DECISIONS-AiMindShare-v1_0.md"`
Expected: the highest entry is still `D-193`. If a parallel session has since added `D-194` or higher, renumber this entry to the next free number and update every reference below accordingly.

- [ ] **Step 2: Add the entry**

Insert immediately after the `D-193` section (before the closing `---` summary block):

```markdown
## D-194 · Sitemap-Aware Internal Linking — local @xenova/transformers embeddings, standalone library only · **LOCKED 2026-07-13**
Fulfills the "Sitemap-Aware Internal Linking" work D-193 named as out of scope and deferred to
a separate future spec. `PROVIDER_CONFIG.embeddings.free` (added this session's earlier
provider-abstraction-layer merge) is changed from `huggingface` (API-key-based) to
`xenova-transformers` — a locally-run, keyless, zero-cost embedding model
(`Xenova/all-MiniLM-L6-v2`, 384-dim) is a strictly better free default for a capability that's
called once per crawled page and potentially once per generated article. `openai` and `cohere`
are registered in `PROVIDER_CONFIG.embeddings.paid` but have no adapter code — calling either
throws `"<name> embeddings not implemented yet"`, matching this codebase's honest-scaffold
posture (D-147). New: `workers/providers/embeddings.js` (the adapter), `workers/seo/internal-
linking.mjs` (`crawlSitemap`/`buildIndex`/`findLinkCandidates`/`suggestInternalLinks`, storage
in gitignored `workers/seo/sitemap-index.json`, no DB/migration), `workers/rebuild-sitemap-
index.js` (CLI). NOT wired into `workers/worker.mjs`'s `auto_link` pipeline stage — that stage
stays a stub; wiring this library into live Generation Studio runs is separate, un-scoped
follow-up work.
```

Also update the closing summary paragraph (the `*AiMindShare.com · Decisions Log v1.0 ...*` block at the end of the file) — change:

```
then D-193 (M22 Generation Studio core pipeline, migration 0040_m22_generation_studio.sql),
5 OPEN. Append-only.
```

to:

```
then D-193 (M22 Generation Studio core pipeline, migration 0040_m22_generation_studio.sql) then
D-194 (Sitemap-Aware Internal Linking, frontend/workers-only, no migration),
5 OPEN. Append-only.
```

- [ ] **Step 3: Commit**

```bash
git add DECISIONS-AiMindShare-v1_0.md
git commit -m "docs: record D-194 (Sitemap-Aware Internal Linking)"
```

---

### Task 9: TASKS.md session entry

**Files:**
- Modify: `TASKS.md`

- [ ] **Step 1: Add the session entry**

Add near the other M22-adjacent entries in `TASKS.md` (immediately before or after the M22 Generation Studio section is fine — this repo's `TASKS.md` is not strictly chronological, sessions get inserted near related work):

```markdown
## Sitemap-Aware Internal Linking *(2026-07-13, D-194, no migration)*

Built the standalone library D-193 deferred: `workers/providers/embeddings.js` (single adapter
for the `embeddings` capability — local `@xenova/transformers` free tier, `openai`/`cohere`
registered as paid but not implemented) and `workers/seo/internal-linking.mjs`
(`crawlSitemap`/`buildIndex`/`findLinkCandidates`/`suggestInternalLinks`). Storage is a local
gitignored JSON file (`workers/seo/sitemap-index.json`), no DB/migration. CLI:
`npm run rebuild-sitemap-index -- <sitemapUrl>`. Changed `PROVIDER_CONFIG.embeddings.free` from
`huggingface` (the provider-abstraction-layer session's original default, merged to `main` this
same session) to `xenova-transformers` — see D-194 for rationale. Probe:
`workers/verify/internallinkingprobe.mjs`, pure/no-network/no model download (injected
`pipelineFactory`/`embedFn`/`fetchFn` throughout). Not wired into `workers/worker.mjs`'s
`auto_link` stage — deliberately out of scope, stage remains a stub.
```

- [ ] **Step 2: Commit**

```bash
git add TASKS.md
git commit -m "docs: record Sitemap-Aware Internal Linking session in TASKS.md"
```

---

## Self-Review Notes

- **Spec coverage:** free-tier local embeddings (Task 1-2), BYOK paid registration without implementation (Task 1-2), `crawlSitemap` fetch+cheerio (Task 3), local JSON storage (Task 4), `findLinkCandidates` (Task 4), `suggestInternalLinks` (Task 5), CLI (Task 6), `logProviderUsage` on every embedding call (Task 2, asserted directly), probe registered in `verify.sh` (Task 7), docs (Task 8-9) — every spec section has a task.
- **Type consistency:** `embed(text, config, opts)` signature matches between Task 2's implementation, its test, and Task 4/5's `embedFn` default. `crawlSitemap` returning `{ pages, skippedUrls }` (this plan's documented refinement of the spec's ambiguous return-shape) is consistent across Task 3's implementation, Task 4's `buildIndex` consumer, and the CLI. `findLinkCandidates(currentPageText, topN, config, opts)` and `suggestInternalLinks(articleHtml, config, opts)` signatures match their spec descriptions and their own tests.
- **No DB/migration coupling** — confirmed no task touches Supabase, RLS, or a migration file, matching the spec's explicit scope boundary.
- **auto_link untouched** — confirmed no task modifies `workers/worker.mjs`; Task 8/9's docs explicitly note the stage remains a stub.
