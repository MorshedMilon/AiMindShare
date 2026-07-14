# Web Search adapter + Deep Research/Citation Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `searchWeb()` (Brave Search primary, SearXNG fallback on 429) and `deepResearch()` (sub-query generation → multi-query search → dedupe → full-text fetch → cited synthesis) on top of the existing `resolveProvider()` capability router, with Perplexity/Exa/Firecrawl registered as future BYOK options.

**Architecture:** `workers/providers/webSearch.js` is the real adapter for the `webSearch` capability (routed through `workers/config/providers.js`'s `resolveProvider`). `workers/deepResearch.mjs` is a standalone orchestration layer, sibling to `llm.mjs`/`worker.mjs`, that composes `searchWeb` with two direct Claude calls (env-var key, no Vault/DB) and `cheerio`-based full-text extraction.

**Tech Stack:** Node 18+ ESM (this repo runs Node 24; `fetch`/`Response` are global), `cheerio` (new dependency) for HTML text extraction, no Vault/PGlite involvement — everything is pure-unit testable via `fetchImpl` injection.

**Full spec:** `docs/superpowers/specs/2026-07-13-web-search-deep-research-citation-layer-design.md`

---

## File Structure

- Modify: `workers/config/providers.js` — register Perplexity/Exa/Firecrawl in `webSearch.paid[]`
- Modify: `workers/verify/providersprobe.mjs` — `webSearch.paid.length` assertion 0 → 3
- Modify: `workers/package.json` — add `cheerio` dependency
- Create: `workers/providers/webSearch.js` — `searchWeb(query, numResults, config)`
- Create: `workers/verify/webSearchProbe.mjs` — pure unit test, no network
- Create: `workers/deepResearch.mjs` — `deepResearch(topic, maxSources, config)`
- Create: `workers/verify/deepResearchProbe.mjs` — pure unit test, no network
- Modify: `workers/README-providers.md` — document the real webSearch adapter + deepResearch
- Create: `.env.example` (repo root) — `BRAVE_SEARCH_API_KEY`, `ANTHROPIC_API_KEY`
- Modify: `DECISIONS-AiMindShare-v1_0.md` — add D-194
- Modify: `scripts/verify.sh` — register both new probes

---

### Task 1: Register Perplexity/Exa/Firecrawl as `webSearch` paid options

**Files:**
- Modify: `workers/config/providers.js`
- Modify: `workers/verify/providersprobe.mjs`

- [ ] **Step 1: Write the failing test**

In `workers/verify/providersprobe.mjs`, replace the `CAPABILITIES` loop (lines 16–24) with:

```js
const CAPABILITIES = ["seoAudit", "plagiarism", "embeddings", "webSearch", "imageGen"];
const EXPECTED_PAID_COUNT = { webSearch: 3 };
for (const capability of CAPABILITIES) {
  assert(Object.prototype.hasOwnProperty.call(PROVIDER_CONFIG, capability),
    `PROVIDER_CONFIG has a "${capability}" entry`);
  const expectedPaidCount = EXPECTED_PAID_COUNT[capability] ?? 0;
  assert(Array.isArray(PROVIDER_CONFIG[capability].paid) && PROVIDER_CONFIG[capability].paid.length === expectedPaidCount,
    `PROVIDER_CONFIG.${capability}.paid has ${expectedPaidCount} entr${expectedPaidCount === 1 ? "y" : "ies"}`);
  assert(typeof PROVIDER_CONFIG[capability].free.name === "string",
    `PROVIDER_CONFIG.${capability}.free has a name`);
}
```

Also add, right after that loop (before the `resolveProvider("seoAudit", {})` block that follows it):

```js
{
  const names = PROVIDER_CONFIG.webSearch.paid.map((p) => p.name).sort();
  assert(names.join(",") === "exa,firecrawl,perplexity",
    "PROVIDER_CONFIG.webSearch.paid lists perplexity, exa, and firecrawl");
  assert(PROVIDER_CONFIG.webSearch.paid.every((p) => typeof p.envVar === "string" && p.envVar.endsWith("_API_KEY")),
    "every webSearch paid provider declares an *_API_KEY envVar");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers && node verify/providersprobe.mjs`
Expected: FAIL — `PROVIDER_CONFIG.webSearch.paid has 3 entries` fails (currently 0), and the `names.join(",")` assertion fails (currently empty).

- [ ] **Step 3: Write the implementation**

In `workers/config/providers.js`, change the `webSearch` entry in `PROVIDER_CONFIG` from:

```js
  webSearch: {
    free: {
      name: "brave",
      envVar: "BRAVE_SEARCH_API_KEY",
      description: "Brave Search API — free tier (2,000 queries/month).",
    },
    paid: [],
  },
```

to:

```js
  webSearch: {
    free: {
      name: "brave",
      envVar: "BRAVE_SEARCH_API_KEY",
      description: "Brave Search API — free tier (2,000 queries/month).",
    },
    paid: [
      { name: "perplexity", envVar: "PERPLEXITY_API_KEY", description: "Perplexity Sonar API — BYOK, not yet implemented." },
      { name: "exa", envVar: "EXA_API_KEY", description: "Exa Search API — BYOK, not yet implemented." },
      { name: "firecrawl", envVar: "FIRECRAWL_API_KEY", description: "Firecrawl API — BYOK, not yet implemented." },
    ],
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers && node verify/providersprobe.mjs`
Expected: all assertions pass, ending in `N passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add workers/config/providers.js workers/verify/providersprobe.mjs
git commit -m "feat(providers): register perplexity/exa/firecrawl as webSearch paid options"
```

---

### Task 2: Add the `cheerio` dependency

**Files:**
- Modify: `workers/package.json`

- [ ] **Step 1: Install**

Run: `cd workers && npm install cheerio`
Expected: `workers/package.json`'s `dependencies` gains `"cheerio": "^1.0.0"` (or whatever the installed major-1 version resolves to), `workers/package-lock.json` updates, `workers/node_modules/cheerio` exists.

- [ ] **Step 2: Verify it loads**

Run: `cd workers && node -e "import('cheerio').then(c => console.log(typeof c.load))"`
Expected: prints `function`.

- [ ] **Step 3: Commit**

```bash
git add workers/package.json workers/package-lock.json
git commit -m "chore(workers): add cheerio dependency for full-text extraction"
```

---

### Task 3: `searchWeb()` — Brave happy path

**Files:**
- Create: `workers/providers/webSearch.js`
- Create: `workers/verify/webSearchProbe.mjs`

- [ ] **Step 1: Write the failing test**

Create `workers/verify/webSearchProbe.mjs`:

```js
// webSearchProbe.mjs — pure unit tests for workers/providers/webSearch.js. No
// real network: fetchImpl is always a fake injected via config.fetchImpl, and
// logProviderUsage writes to a throwaway config.usageLogPath.
import { rmSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchWeb } from "../providers/webSearch.js";

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_LOG_PATH = path.join(__dirname, "websearch-usage-test.json");
if (existsSync(TEST_LOG_PATH)) rmSync(TEST_LOG_PATH);

console.log("══ workers/providers/webSearch.js — searchWeb (Brave happy path) ══");

{
  const braveBody = {
    web: {
      results: [
        { title: "Result One", url: "https://example.com/one", description: "First snippet", age: "3 days ago" },
        { title: "Result Two", url: "https://example.com/two", description: "Second snippet" },
      ],
    },
  };
  const fetchImpl = async (url) => {
    assert(url.startsWith("https://api.search.brave.com/res/v1/web/search"), "requests the Brave Search endpoint");
    assert(url.includes("q=hello"), "the query is URL-encoded into the request");
    return new Response(JSON.stringify(braveBody), { status: 200 });
  };

  const results = await searchWeb("hello", 5, { fetchImpl, usageLogPath: TEST_LOG_PATH });
  assert(Array.isArray(results) && results.length === 2, "returns both mapped results");
  assert(results[0].title === "Result One" && results[0].url === "https://example.com/one",
    "maps title/url through unchanged");
  assert(results[0].snippet === "First snippet", "maps description -> snippet");
  assert(results[0].publishDate === "3 days ago", "maps age -> publishDate when present");
  assert(results[1].publishDate === null, "publishDate is null when Brave doesn't provide age");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (existsSync(TEST_LOG_PATH)) rmSync(TEST_LOG_PATH);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers && node verify/webSearchProbe.mjs`
Expected: FAIL — `Cannot find module '../providers/webSearch.js'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `workers/providers/webSearch.js`:

```js
// webSearch.js — searchWeb(): Brave Search free default (routed through
// resolveProvider), reactive SearXNG public-instance fallback on Brave HTTP
// 429. See ../README-providers.md and
// ../../docs/superpowers/specs/2026-07-13-web-search-deep-research-citation-layer-design.md.
import { resolveProvider, logProviderUsage } from "../config/providers.js";

const BRAVE_SEARCH_API = "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_SEARXNG_URL = "https://searx.be/search";
const REQUEST_TIMEOUT_MS = 10_000;

class BraveError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function fetchWithTimeout(fetchImpl, url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function braveSearch(query, numResults, apiKey, fetchImpl) {
  const url = `${BRAVE_SEARCH_API}?q=${encodeURIComponent(query)}&count=${numResults}`;
  const resp = await fetchWithTimeout(fetchImpl, url, {
    headers: { Accept: "application/json", "X-Subscription-Token": apiKey ?? "" },
  });
  if (!resp.ok) {
    throw new BraveError(resp.status, `Brave Search request failed with status ${resp.status}`);
  }
  const body = await resp.json();
  const results = body?.web?.results ?? [];
  return results.slice(0, numResults).map((r) => ({
    title: r.title ?? "",
    url: r.url,
    snippet: r.description ?? "",
    publishDate: r.age ?? null,
  }));
}

export async function searchWeb(query, numResults = 5, config = {}) {
  const { tier, provider } = resolveProvider("webSearch", config);
  const fetchImpl = config.fetchImpl ?? fetch;
  const apiKey = provider.envVar ? process.env[provider.envVar] : undefined;

  const results = await braveSearch(query, numResults, apiKey, fetchImpl);
  await logProviderUsage("webSearch", provider.name, { tier }, config.usageLogPath);
  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers && node verify/webSearchProbe.mjs`
Expected: all assertions pass, ending in `N passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add workers/providers/webSearch.js workers/verify/webSearchProbe.mjs
git commit -m "feat(providers): add searchWeb Brave adapter (happy path)"
```

---

### Task 4: `searchWeb()` — SearXNG fallback on 429, non-429 propagation

**Files:**
- Modify: `workers/providers/webSearch.js`
- Modify: `workers/verify/webSearchProbe.mjs`

- [ ] **Step 1: Write the failing test**

Add to `workers/verify/webSearchProbe.mjs`, after the happy-path block and before the final `console.log(pass/fail)` + cleanup (move those two lines — plus the `if (existsSync...) rmSync(...)` cleanup line — to the very end of the file, after this new section):

```js
console.log("\n══ workers/providers/webSearch.js — SearXNG fallback on 429 ══");

{
  const searxBody = {
    results: [
      { title: "Fallback Result", url: "https://example.org/fallback", content: "Fallback snippet", publishedDate: "2026-01-01" },
    ],
  };
  let braveCalled = false, searxCalled = false;
  const fetchImpl = async (url) => {
    if (url.startsWith("https://api.search.brave.com")) {
      braveCalled = true;
      return new Response("rate limited", { status: 429 });
    }
    searxCalled = true;
    assert(url.startsWith("https://searx.be/search"), "falls back to the default SearXNG URL");
    assert(url.includes("format=json"), "requests SearXNG's JSON format");
    return new Response(JSON.stringify(searxBody), { status: 200 });
  };

  const results = await searchWeb("hello", 5, { fetchImpl, usageLogPath: TEST_LOG_PATH });
  assert(braveCalled && searxCalled, "Brave is tried first, then SearXNG on 429");
  assert(results.length === 1 && results[0].url === "https://example.org/fallback",
    "returns SearXNG's mapped results");
  assert(results[0].snippet === "Fallback snippet" && results[0].publishDate === "2026-01-01",
    "maps content -> snippet and publishedDate -> publishDate");
}

console.log("\n══ workers/providers/webSearch.js — non-429 errors propagate, no fallback ══");

{
  let searxCalled = false;
  const fetchImpl = async (url) => {
    if (url.startsWith("https://api.search.brave.com")) return new Response("server error", { status: 500 });
    searxCalled = true;
    return new Response("{}", { status: 200 });
  };

  let threw = false;
  try {
    await searchWeb("hello", 5, { fetchImpl, usageLogPath: TEST_LOG_PATH });
  } catch (e) {
    threw = true;
    assert(/status 500/.test(e.message), "the propagated error mentions the real status code");
  }
  assert(threw, "a non-429 Brave error is thrown, not swallowed");
  assert(!searxCalled, "SearXNG is never called for a non-429 error");
}

console.log("\n══ workers/providers/webSearch.js — custom searxngUrl override ══");

{
  const fetchImpl = async (url) => {
    if (url.startsWith("https://api.search.brave.com")) return new Response("rate limited", { status: 429 });
    assert(url.startsWith("https://custom-instance.example/search"), "uses config.searxngUrl when provided");
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  };
  await searchWeb("hello", 5, { fetchImpl, searxngUrl: "https://custom-instance.example/search", usageLogPath: TEST_LOG_PATH });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers && node verify/webSearchProbe.mjs`
Expected: FAIL — the fallback assertions fail because `searchWeb` currently throws the 429 `BraveError` directly instead of falling back (`braveCalled && searxCalled` is false since `searxCalled` never becomes true; the non-429 propagation assertions may pass already since that behavior is incidental today, but the fallback and override sections fail).

- [ ] **Step 3: Write the implementation**

In `workers/providers/webSearch.js`, add a `searxngSearch` function after `braveSearch`:

```js
async function searxngSearch(query, numResults, searxngUrl, fetchImpl) {
  const base = searxngUrl ?? DEFAULT_SEARXNG_URL;
  const url = `${base}?q=${encodeURIComponent(query)}&format=json`;
  const resp = await fetchWithTimeout(fetchImpl, url, { headers: { Accept: "application/json" } });
  if (!resp.ok) {
    throw new Error(`SearXNG fallback request failed with status ${resp.status}`);
  }
  const body = await resp.json();
  const results = body?.results ?? [];
  return results.slice(0, numResults).map((r) => ({
    title: r.title ?? "",
    url: r.url,
    snippet: r.content ?? "",
    publishDate: r.publishedDate ?? null,
  }));
}
```

Then replace `searchWeb`'s body with:

```js
export async function searchWeb(query, numResults = 5, config = {}) {
  const { tier, provider } = resolveProvider("webSearch", config);
  const fetchImpl = config.fetchImpl ?? fetch;
  const apiKey = provider.envVar ? process.env[provider.envVar] : undefined;

  let results;
  let providerUsed = provider.name;
  try {
    results = await braveSearch(query, numResults, apiKey, fetchImpl);
  } catch (e) {
    if (!(e instanceof BraveError) || e.status !== 429) throw e;
    providerUsed = "searxng";
    results = await searxngSearch(query, numResults, config.searxngUrl, fetchImpl);
  }

  await logProviderUsage("webSearch", providerUsed, { tier }, config.usageLogPath);
  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers && node verify/webSearchProbe.mjs`
Expected: all assertions pass, ending in `N passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add workers/providers/webSearch.js workers/verify/webSearchProbe.mjs
git commit -m "feat(providers): fall back to SearXNG on a Brave 429"
```

---

### Task 5: `searchWeb()` — paid tier throws, usage logging records the real provider

**Files:**
- Modify: `workers/verify/webSearchProbe.mjs` (no implementation change needed — this task verifies existing behavior from `resolveProvider` + Task 4's `providerUsed` tracking)

- [ ] **Step 1: Write the test**

Add to `workers/verify/webSearchProbe.mjs`, before the final `console.log(pass/fail)` + cleanup:

```js
console.log("\n══ workers/providers/webSearch.js — paid tier is not implemented ══");

{
  let threw = false;
  try {
    await searchWeb("hello", 5, { apiKey: "sk-test", provider: "exa", usageLogPath: TEST_LOG_PATH });
  } catch (e) {
    threw = true;
    assert(/exa.*not implemented yet/.test(e.message), "the error names the paid provider and says 'not implemented yet'");
  }
  assert(threw, "searchWeb throws when routed to a paid (unimplemented) provider");
}

console.log("\n══ workers/providers/webSearch.js — logProviderUsage records the provider actually used ══");

{
  if (existsSync(TEST_LOG_PATH)) rmSync(TEST_LOG_PATH);

  const fetchImpl = async (url) =>
    url.startsWith("https://api.search.brave.com")
      ? new Response("rate limited", { status: 429 })
      : new Response(JSON.stringify({ results: [] }), { status: 200 });

  await searchWeb("hello", 5, { fetchImpl, usageLogPath: TEST_LOG_PATH });
  const entries = JSON.parse(readFileSync(TEST_LOG_PATH, "utf8"));
  assert(entries.length === 1 && entries[0].provider === "searxng" && entries[0].tier === "free",
    "a fallback call logs 'searxng', not 'brave', as the provider");
}
```

- [ ] **Step 2: Run test to verify it fails first, then implement if needed**

Run: `cd workers && node verify/webSearchProbe.mjs`
Expected: this should already PASS given Task 4's implementation (`resolveProvider` already throws for an unresolvable/unimplemented paid tier via `searchWeb`'s paid-tier path — wait, check: `searchWeb` as written in Task 4 doesn't special-case `tier === "paid"` yet, it always calls `braveSearch` regardless of tier). If it FAILS because `searchWeb` tries to call Brave with a paid tier instead of throwing, proceed to Step 3.

- [ ] **Step 3: Write the implementation**

In `workers/providers/webSearch.js`, add a paid-tier guard at the top of `searchWeb`, right after `resolveProvider` resolves:

```js
export async function searchWeb(query, numResults = 5, config = {}) {
  const { tier, provider } = resolveProvider("webSearch", config);

  if (tier === "paid") {
    throw new Error(`searchWeb: paid provider "${provider.name}" not implemented yet`);
  }

  const fetchImpl = config.fetchImpl ?? fetch;
  const apiKey = provider.envVar ? process.env[provider.envVar] : undefined;

  let results;
  let providerUsed = provider.name;
  try {
    results = await braveSearch(query, numResults, apiKey, fetchImpl);
  } catch (e) {
    if (!(e instanceof BraveError) || e.status !== 429) throw e;
    providerUsed = "searxng";
    results = await searxngSearch(query, numResults, config.searxngUrl, fetchImpl);
  }

  await logProviderUsage("webSearch", providerUsed, { tier }, config.usageLogPath);
  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers && node verify/webSearchProbe.mjs`
Expected: all assertions pass, ending in `N passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add workers/providers/webSearch.js workers/verify/webSearchProbe.mjs
git commit -m "feat(providers): searchWeb throws clearly for unimplemented paid providers"
```

---

### Task 6: `deepResearch()` — sub-query generation + multi-query search + dedupe

**Files:**
- Create: `workers/deepResearch.mjs`
- Create: `workers/verify/deepResearchProbe.mjs`

- [ ] **Step 1: Write the failing test**

Create `workers/verify/deepResearchProbe.mjs`:

```js
// deepResearchProbe.mjs — pure unit tests for workers/deepResearch.mjs. No
// real network: every fetch (Claude, search, source pages) goes through a
// fake fetchImpl keyed off the request URL. usageLogPath is always a
// throwaway file so searchWeb's internal logProviderUsage call never touches
// the real workers/config/provider-usage.json.
import { rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deepResearch } from "../deepResearch.mjs";

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_LOG_PATH = path.join(__dirname, "deepresearch-usage-test.json");
if (existsSync(TEST_LOG_PATH)) rmSync(TEST_LOG_PATH);

const claudeResponse = (text) => new Response(JSON.stringify({ content: [{ text }] }), { status: 200 });

const braveResultsFor = (query) => ({
  web: {
    results: [
      { title: `${query} result A`, url: `https://example.com/${encodeURIComponent(query)}-a`, description: "snippet A" },
      { title: `${query} result B`, url: `https://example.com/${encodeURIComponent(query)}-b`, description: "snippet B" },
    ],
  },
});

console.log("══ workers/deepResearch.mjs — sub-query generation + search + dedupe ══");

{
  const seenQueries = [];
  const fetchImpl = async (url, options) => {
    if (url === "https://api.anthropic.com/v1/messages") {
      const body = JSON.parse(options.body);
      if (body.model === "claude-3-5-haiku-20241022") {
        return claudeResponse("query one\nquery two\nquery one"); // deliberate duplicate query
      }
      return claudeResponse("Draft placeholder [source:1] [source:2]");
    }
    if (url.startsWith("https://api.search.brave.com")) {
      const query = new URL(url).searchParams.get("q");
      seenQueries.push(query);
      return new Response(JSON.stringify(braveResultsFor(query)), { status: 200 });
    }
    // full-text fetch of a source page
    return new Response("<html><body><script>bad()</script><p>Body text.</p></body></html>", { status: 200 });
  };

  const result = await deepResearch("test topic", 8, { fetchImpl, anthropicApiKey: "sk-ant-test", usageLogPath: TEST_LOG_PATH });

  assert(seenQueries.includes("query one") && seenQueries.includes("query two"),
    "both distinct sub-queries generated by Claude are searched");
  assert(seenQueries.filter((q) => q === "query one").length === 1,
    "a duplicate sub-query from Claude's response is only searched once (parseSubQueries dedupes lines)");

  const urls = result.sources.map((s) => s.url);
  assert(new Set(urls).size === urls.length, "deepResearch's own dedupe never returns a duplicate URL");
  assert(result.sources.length <= 8, "sources are capped at maxSources");
  assert(typeof result.draftContent === "string" && result.draftContent.length > 0, "returns a non-empty draftContent");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (existsSync(TEST_LOG_PATH)) rmSync(TEST_LOG_PATH);
process.exit(fail ? 1 : 0);
```

(Tasks 7 and 8 add more sections below the sub-query/dedupe block above and *before* this
`console.log(pass/fail)` + cleanup — move those two lines down each time, same convention as
`providersprobe.mjs`.)

Note: `parseSubQueries` dedupes identical lines as a side effect of how sub-queries feed into search — actually, dedup here happens naturally because `dedupeByUrl` only dedupes by URL, and two identical sub-queries would each hit `searchWeb` and return identical URLs which then collapse. Re-read the assertion above: `seenQueries.filter(q => q === "query one").length === 1` requires the *sub-query list itself* to be deduped before searching, not just the resulting URLs. Implement sub-query dedup explicitly in Step 3 below (a plain `Set` over the parsed lines).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers && node verify/deepResearchProbe.mjs`
Expected: FAIL — `Cannot find module '../deepResearch.mjs'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `workers/deepResearch.mjs`:

```js
// deepResearch.mjs — deepResearch(): orchestrates providers/webSearch.js +
// direct Claude calls (env-var key, no Vault/db/workspaceId) + cheerio into a
// cited draft. See
// docs/superpowers/specs/2026-07-13-web-search-deep-research-citation-layer-design.md.
import { searchWeb } from "./providers/webSearch.js";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const REQUEST_TIMEOUT_MS = 20_000;
const SUBQUERY_MODEL = "claude-3-5-haiku-20241022";

async function callClaude(systemPrompt, userPrompt, model, config) {
  const fetchImpl = config.fetchImpl ?? fetch;
  const apiKey = config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("deepResearch: ANTHROPIC_API_KEY is not set");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetchImpl(ANTHROPIC_API, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: 4096, system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`deepResearch: Claude request failed with status ${resp.status}`);
    const body = await resp.json();
    const text = body?.content?.[0]?.text;
    if (!text || !text.trim()) throw new Error("deepResearch: Claude returned an empty response");
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}

function parseSubQueries(text) {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/^[\s\d.\-)]+/, "").trim())
    .filter(Boolean);
  return Array.from(new Set(lines));
}

async function generateSubQueries(topic, config) {
  const system = "You generate web search queries. Reply with 3 to 5 distinct search queries, one per line, no numbering, no commentary, covering different angles of the topic.";
  const text = await callClaude(system, `Topic: ${topic}`, SUBQUERY_MODEL, config);
  const queries = parseSubQueries(text);
  return queries.length ? queries.slice(0, 5) : [topic];
}

function dedupeByUrl(results) {
  const seen = new Set();
  const out = [];
  for (const r of results) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    out.push(r);
  }
  return out;
}

export async function deepResearch(topic, maxSources = 8, config = {}) {
  const subQueries = await generateSubQueries(topic, config);
  const raw = (await Promise.all(subQueries.map((q) => searchWeb(q, 5, config)))).flat();

  const deduped = dedupeByUrl(raw).slice(0, maxSources);
  if (deduped.length === 0) throw new Error("deepResearch: no search results for this topic");

  // Task 7 fills in full-text fetch here; Task 8 fills in synthesis.
  return { draftContent: "", sources: deduped.map(({ url, title }) => ({ url, title })) };
}
```

This intermediate version returns an empty `draftContent` — Task 7 and Task 8 complete the pipeline. The probe's `draftContent.length > 0` assertion will fail until Task 8; that's expected for this step (the probe's pass/fail summary won't hit `0 failed` until the end of Task 8 — check the individual PASS/FAIL lines for this task's own assertions, not the final tally).

- [ ] **Step 4: Run test to verify the sub-query/dedupe logic works**

Run: `cd workers && node verify/deepResearchProbe.mjs`
Expected: the `seenQueries` and `urls`/`sources.length` assertions PASS; the final `draftContent` assertion FAILS (empty string) — expected at this point in the plan, resolved by Task 8.

- [ ] **Step 5: Commit**

```bash
git add workers/deepResearch.mjs workers/verify/deepResearchProbe.mjs
git commit -m "feat(research): add deepResearch sub-query generation + search + dedupe"
```

---

### Task 7: `deepResearch()` — full-text fetch via cheerio

**Files:**
- Modify: `workers/deepResearch.mjs`
- Modify: `workers/verify/deepResearchProbe.mjs`

- [ ] **Step 1: Write the failing test**

Add to `workers/verify/deepResearchProbe.mjs`, before the final `console.log(pass/fail)` + `process.exit`:

```js
console.log("\n══ workers/deepResearch.mjs — full-text fetch skips failed sources ══");

{
  const fetchImpl = async (url, options) => {
    if (url === "https://api.anthropic.com/v1/messages") {
      const body = JSON.parse(options.body);
      if (body.model === "claude-3-5-haiku-20241022") return claudeResponse("solo query");
      return claudeResponse("Draft citing [source:1]");
    }
    if (url.startsWith("https://api.search.brave.com")) {
      return new Response(JSON.stringify({
        web: {
          results: [
            { title: "Good Source", url: "https://good.example/page", description: "ok" },
            { title: "Bad Source", url: "https://bad.example/page", description: "ok" },
          ],
        },
      }), { status: 200 });
    }
    if (url === "https://good.example/page") {
      return new Response("<html><body><script>ignored()</script><nav>skip</nav><p>Real content here.</p></body></html>", { status: 200 });
    }
    if (url === "https://bad.example/page") {
      return new Response("not found", { status: 404 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const result = await deepResearch("solo topic", 8, { fetchImpl, anthropicApiKey: "sk-ant-test", usageLogPath: TEST_LOG_PATH });
  assert(result.sources.length === 1 && result.sources[0].url === "https://good.example/page",
    "a source whose page fetch 404s is dropped, not fatal");
}

console.log("\n══ workers/deepResearch.mjs — all sources failing is fatal ══");

{
  const fetchImpl = async (url, options) => {
    if (url === "https://api.anthropic.com/v1/messages") {
      const body = JSON.parse(options.body);
      if (body.model === "claude-3-5-haiku-20241022") return claudeResponse("solo query");
      return claudeResponse("unused");
    }
    if (url.startsWith("https://api.search.brave.com")) {
      return new Response(JSON.stringify({
        web: { results: [{ title: "Dead", url: "https://dead.example/page", description: "ok" }] },
      }), { status: 200 });
    }
    return new Response("gone", { status: 404 });
  };

  let threw = false;
  try {
    await deepResearch("dead topic", 8, { fetchImpl, anthropicApiKey: "sk-ant-test", usageLogPath: TEST_LOG_PATH });
  } catch (e) {
    threw = true;
    assert(/no sources could be fetched/.test(e.message), "the error explains every source failed to fetch");
  }
  assert(threw, "deepResearch throws when zero sources survive full-text fetch");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers && node verify/deepResearchProbe.mjs`
Expected: FAIL — `deepResearch` doesn't fetch full text yet, so `result.sources` still includes both good and bad URLs (no drop happens), and the all-failed case never throws.

- [ ] **Step 3: Write the implementation**

Add `cheerio` to the imports at the top of `workers/deepResearch.mjs`:

```js
import * as cheerio from "cheerio";
import { searchWeb } from "./providers/webSearch.js";
```

Add a `SOURCE_TEXT_CAP` constant next to `SUBQUERY_MODEL`:

```js
const SOURCE_TEXT_CAP = 6000;
```

Add a `fetchFullText` function after `dedupeByUrl`:

```js
async function fetchFullText(url, config) {
  const fetchImpl = config.fetchImpl ?? fetch;
  const resp = await fetchImpl(url);
  if (!resp.ok) throw new Error(`fetchFullText: ${url} responded with status ${resp.status}`);
  const html = await resp.text();
  const $ = cheerio.load(html);
  $("script, style, nav, footer").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return text.slice(0, SOURCE_TEXT_CAP);
}
```

Replace `deepResearch`'s body with:

```js
export async function deepResearch(topic, maxSources = 8, config = {}) {
  const subQueries = await generateSubQueries(topic, config);
  const raw = (await Promise.all(subQueries.map((q) => searchWeb(q, 5, config)))).flat();

  const deduped = dedupeByUrl(raw).slice(0, maxSources);
  if (deduped.length === 0) throw new Error("deepResearch: no search results for this topic");

  const sourcesWithText = (
    await Promise.all(
      deduped.map((r) =>
        fetchFullText(r.url, config)
          .then((text) => ({ url: r.url, title: r.title, text }))
          .catch(() => null)
      )
    )
  ).filter(Boolean);
  if (sourcesWithText.length === 0) throw new Error("deepResearch: no sources could be fetched");

  // Task 8 fills in synthesis here.
  return { draftContent: "", sources: sourcesWithText.map(({ url, title }) => ({ url, title })) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers && node verify/deepResearchProbe.mjs`
Expected: the two new sections PASS; the Task 6 `draftContent.length > 0` assertion still FAILS — expected, resolved by Task 8.

- [ ] **Step 5: Commit**

```bash
git add workers/deepResearch.mjs workers/verify/deepResearchProbe.mjs
git commit -m "feat(research): fetch full source text via cheerio, skip failed sources"
```

---

### Task 8: `deepResearch()` — cited synthesis (final assembly)

**Files:**
- Modify: `workers/deepResearch.mjs`
- Modify: `workers/verify/deepResearchProbe.mjs`

- [ ] **Step 1: Write the failing test**

Add to `workers/verify/deepResearchProbe.mjs`, before the final `console.log(pass/fail)` + `process.exit`:

```js
console.log("\n══ workers/deepResearch.mjs — synthesis produces [source:n] citations ══");

{
  let synthesisPrompt = null;
  const fetchImpl = async (url, options) => {
    if (url === "https://api.anthropic.com/v1/messages") {
      const body = JSON.parse(options.body);
      if (body.model === "claude-3-5-haiku-20241022") return claudeResponse("cite query");
      synthesisPrompt = body.messages[0].content;
      return claudeResponse("Cited draft. [source:1] More text. [source:2]");
    }
    if (url.startsWith("https://api.search.brave.com")) {
      return new Response(JSON.stringify({
        web: {
          results: [
            { title: "First", url: "https://one.example/page", description: "ok" },
            { title: "Second", url: "https://two.example/page", description: "ok" },
          ],
        },
      }), { status: 200 });
    }
    return new Response("<html><body><p>Some source text.</p></body></html>", { status: 200 });
  };

  const result = await deepResearch("cite topic", 8, { fetchImpl, anthropicApiKey: "sk-ant-test", usageLogPath: TEST_LOG_PATH });
  assert(result.draftContent === "Cited draft. [source:1] More text. [source:2]",
    "draftContent is exactly Claude's synthesis output");
  assert(result.sources.length === 2 &&
    result.sources[0].url === "https://one.example/page" &&
    result.sources[1].url === "https://two.example/page",
    "sources array order matches the [source:n] numbering used in the prompt");
  assert(synthesisPrompt.includes("[source:1]") && synthesisPrompt.includes("[source:2]") && synthesisPrompt.includes("cite topic"),
    "the synthesis prompt includes numbered source markers and the topic");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers && node verify/deepResearchProbe.mjs`
Expected: FAIL — `result.draftContent` is still `""`.

- [ ] **Step 3: Write the implementation**

In `workers/deepResearch.mjs`, add `SYNTHESIS_MODEL` next to `SUBQUERY_MODEL`:

```js
const SYNTHESIS_MODEL = "claude-sonnet-5";
```

Add a `synthesizeWithCitations` function after `generateSubQueries`:

```js
async function synthesizeWithCitations(topic, sources, config) {
  const system = "You are a research writer. Using ONLY the provided sources, write a draft on the topic. Every factual claim must be followed by a citation marker like [source:1] referencing the source list below, using the source's number. Do not invent sources.";
  const sourceBlock = sources
    .map((s, i) => `[source:${i + 1}] ${s.title} (${s.url})\n${s.text}`)
    .join("\n\n");
  const user = `Topic: ${topic}\n\nSources:\n${sourceBlock}`;
  return callClaude(system, user, SYNTHESIS_MODEL, config);
}
```

Replace the last two lines of `deepResearch` (the `// Task 8 fills in...` comment and its `return`) with:

```js
  const draftContent = await synthesizeWithCitations(topic, sourcesWithText, config);
  const sources = sourcesWithText.map(({ url, title }) => ({ url, title }));
  return { draftContent, sources };
```

- [ ] **Step 4: Run the full probe to verify everything passes**

Run: `cd workers && node verify/deepResearchProbe.mjs`
Expected: all assertions from Tasks 6, 7, and 8 pass, ending in `N passed, 0 failed`.

Also re-run Task 3–5's probe to confirm no regression:

Run: `cd workers && node verify/webSearchProbe.mjs`
Expected: `N passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add workers/deepResearch.mjs workers/verify/deepResearchProbe.mjs
git commit -m "feat(research): synthesize cited draft with Claude, complete deepResearch()"
```

---

### Task 9: `.env.example` + `README-providers.md` updates

**Files:**
- Create: `.env.example` (repo root)
- Modify: `workers/README-providers.md`

- [ ] **Step 1: Create `.env.example`**

Create `.env.example` at the repo root:

```
# Web search + deep research (workers/providers/webSearch.js, workers/deepResearch.mjs)
BRAVE_SEARCH_API_KEY=
ANTHROPIC_API_KEY=

# See workers/README-providers.md for the full capability/provider table.
```

- [ ] **Step 2: Update `workers/README-providers.md`**

Replace the `webSearch` row in the "Capabilities and free defaults" table:

```
| `webSearch` | Brave Search API | `BRAVE_SEARCH_API_KEY` | free tier, 2,000 queries/month; real adapter in `providers/webSearch.js`, reactive SearXNG fallback on a 429 |
```

Add a new section after "## Usage log" (end of file). Use a 4-backtick fence when applying this edit, since the content itself contains 3-backtick ```js fences:

`````markdown

## `webSearch` and `deepResearch` — real adapter + orchestration layer

`providers/webSearch.js` is the first real (non-empty) adapter in this folder:

```js
import { searchWeb } from "./providers/webSearch.js";

const results = await searchWeb("query text", 5);
// [{ title, url, snippet, publishDate }]
```

Falls back from Brave to a public SearXNG instance (`https://searx.be/search` by default,
override with `config.searxngUrl`) only on an actual Brave HTTP 429 — public instances can
change availability over time, so that default may need swapping later. `webSearch.paid` lists
Perplexity, Exa, and Firecrawl as registered-but-not-implemented BYOK options; `searchWeb`
throws a clear error if routed to one.

`deepResearch.mjs` composes `searchWeb` with two direct Claude calls
(`process.env.ANTHROPIC_API_KEY`, no Vault/db/workspaceId) and `cheerio`-based full-text
extraction into a cited draft:

```js
import { deepResearch } from "./deepResearch.mjs";

const { draftContent, sources } = await deepResearch("topic", 8);
// draftContent has inline [source:n] markers
// sources[n - 1] === { url, title }
```

Not wired into the M22 Generation Studio pipeline or any UI yet — standalone capability only.
See `docs/superpowers/specs/2026-07-13-web-search-deep-research-citation-layer-design.md` and
DECISIONS D-194.
`````

- [ ] **Step 3: Commit**

```bash
git add .env.example workers/README-providers.md
git commit -m "docs(providers): document the real webSearch adapter + deepResearch"
```

---

### Task 10: DECISIONS D-194

**Files:**
- Modify: `DECISIONS-AiMindShare-v1_0.md`

- [ ] **Step 1: Insert the new entry**

In `DECISIONS-AiMindShare-v1_0.md`, insert this new section immediately before the `---` that follows the D-193 section (i.e. right after the line ending "...separate future specs (see the design doc)." and its blank line, before the `---`):

```markdown
## D-194 · Web Search adapter + Deep Research/Citation Layer — Brave primary, SearXNG fallback, env-var Anthropic key · **LOCKED 2026-07-13**
No migration (pure Node module, `workers/providers/webSearch.js` + `workers/deepResearch.mjs`).
`searchWeb(query, numResults, config)` exercises the `webSearch` capability from the
provider-abstraction layer (D-186…D-193 era, `workers/config/providers.js`) for real: Brave
Search API is the free default (already routed there since the base layer shipped), with a
reactive fallback to a public SearXNG instance only on an actual Brave HTTP 429 — no proactive
`RateLimiter` wiring. Perplexity, Exa, and Firecrawl are registered in `webSearch.paid[]`
(routing metadata only, per the base layer's existing empty-`paid[]` pattern) but have no
adapter code — `searchWeb` throws "not implemented yet" if a caller opts into one.
`deepResearch(topic, maxSources, config)` generates 3-5 sub-queries via Claude
(`claude-3-5-haiku-20241022`), fans out `searchWeb`, dedupes by URL, fetches full text via
`fetch` + `cheerio` (skipping sources that fail to fetch rather than aborting), and synthesizes
a cited draft via Claude (`claude-sonnet-5`). Both Claude calls read `ANTHROPIC_API_KEY`
directly from the environment — no Vault/`db`/`workspaceId` — keeping this module as standalone
as the provider-abstraction layer it sits on. This also establishes, for the first time
anywhere in the repo, the citation format D-193 deferred: inline `[source:n]` markers in
`draftContent`, `n` matching the 1-indexed position in the returned `sources: [{ url, title }]`
array. Deep Research is NOT wired into the M22 Generation Studio pipeline or any UI in this
pass — standalone capability only, integration is separate future work.
```

- [ ] **Step 2: Update the master index sentence**

In the closing summary paragraph at the end of the file, change:

```
then D-193 (M22 Generation Studio core pipeline, migration 0040_m22_generation_studio.sql),
5 OPEN. Append-only.
```

to:

```
then D-193 (M22 Generation Studio core pipeline, migration 0040_m22_generation_studio.sql) then
D-194 (Web Search adapter + Deep Research/Citation Layer: Brave + SearXNG fallback, deepResearch()
citation format, no migration),
5 OPEN. Append-only.
```

- [ ] **Step 3: Commit**

```bash
git add DECISIONS-AiMindShare-v1_0.md
git commit -m "docs: record D-194 (web search adapter + deep research/citation layer)"
```

---

### Task 11: Register both probes in `scripts/verify.sh` + full sanity pass

**Files:**
- Modify: `scripts/verify.sh`

- [ ] **Step 1: Register the probes**

In `scripts/verify.sh`, immediately after the existing block:

```bash
echo; echo "══ +  Provider abstraction layer: PROVIDER_CONFIG + resolveProvider + logProviderUsage + RateLimiter (unit, no network) ══"
( cd workers && node verify/providersprobe.mjs ) || fails=$((fails+1))
```

add:

```bash
echo; echo "══ +  webSearch adapter: Brave + SearXNG fallback (unit, no network) ══"
( cd workers && node verify/webSearchProbe.mjs ) || fails=$((fails+1))

echo; echo "══ +  deepResearch: sub-queries + search + dedupe + full-text + cited synthesis (unit, no network) ══"
( cd workers && node verify/deepResearchProbe.mjs ) || fails=$((fails+1))
```

- [ ] **Step 2: Run the full verify suite**

Run: `bash scripts/verify.sh`
Expected: the two new sections print `N passed, 0 failed`; overall script output ends with `✔ verify.sh: all runnable probes passed` (pre-existing unrelated failures, if any were already present before this change, are not this task's concern — only confirm the new sections are clean and no previously-passing probe regressed).

- [ ] **Step 3: Confirm no stray files**

Run: `git status --short`
Expected: clean (everything from this plan already committed); no untracked `workers/config/provider-usage.json`, `workers/verify/websearch-usage-test.json`, or `workers/verify/deepresearch-usage-test.json` (all are throwaway/gitignored paths only ever used via injected `usageLogPath` in the probes, which clean up after themselves).

- [ ] **Step 4: Commit**

```bash
git add scripts/verify.sh
git commit -m "test(research): register webSearchProbe + deepResearchProbe in verify.sh"
```

---

## Self-Review Notes

- **Spec coverage:** `searchWeb` Brave happy path (Task 3), 429→SearXNG fallback + non-429 propagation (Task 4), paid-tier throw + usage logging with the real provider name (Task 5), `PROVIDER_CONFIG.webSearch.paid` registration (Task 1), `deepResearch` sub-query generation + dedupe (Task 6), full-text fetch with skip-on-failure (Task 7), cited synthesis + final `{ draftContent, sources }` shape (Task 8), `.env.example` + README (Task 9), D-194 (Task 10), `cheerio` dependency (Task 2), probes registered in `verify.sh` (Task 11) — every spec section has a task.
- **Type/signature consistency:** `searchWeb(query, numResults, config)` and `deepResearch(topic, maxSources, config)` signatures match the spec and are used identically across every task. `logProviderUsage`'s 4th positional arg (`logPath`) is reused via `config.usageLogPath` — matches the existing `providers.js` signature from the base layer, no new export needed. `[source:n]` / `sources[n-1]` indexing is consistent between Task 8's implementation and its test.
- **No Vault/DB coupling** — confirmed neither `webSearch.js` nor `deepResearch.mjs` imports anything from `supabase/functions/_shared` or takes a `db`/`workspaceId` param, matching the D-194 decision and the base layer's own scope boundary.
- **Test isolation** — every new probe injects `fetchImpl` (no real network) and `usageLogPath` (no writes to the real `provider-usage.json`), matching `llmprobe.mjs`/`providersprobe.mjs`'s existing conventions.
