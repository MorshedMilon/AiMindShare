# Web Search adapter + Deep Research/Citation Layer — design

**Date:** 2026-07-13
**Status:** approved, not yet implemented

## Problem

The provider-abstraction layer (`workers/config/providers.js`, D-186…D-193 era work,
`docs/superpowers/specs/2026-07-13-provider-abstraction-layer-design.md`) ships a `webSearch`
capability with a free-tier default (Brave Search) but no real adapter — `workers/providers/`
is still empty. Separately, D-193 explicitly deferred "Deep Research/Citations" out of the M22
Generation Studio pipeline as future work needing "a web-search provider decision first." This
spec is that decision and the resulting build: a real `searchWeb` adapter, and a
`deepResearch` orchestration layer on top of it that produces a cited draft.

## Scope

**In scope:**
- `workers/providers/webSearch.js` — `searchWeb(query, numResults, config)`, routed through
  `resolveProvider("webSearch", config)`. Brave Search as the free default; SearXNG public
  instance as a reactive fallback on Brave HTTP 429.
- `workers/deepResearch.mjs` — `deepResearch(topic, maxSources, config)`: sub-query generation
  → multi-query search → dedupe → full-text fetch → cited synthesis.
- Registering Perplexity, Exa, and Firecrawl as `webSearch.paid[]` entries in
  `PROVIDER_CONFIG` (routing metadata only — no adapter code).
- A new DECISIONS entry (D-194) recording the citation format as the documented contract,
  since none existed anywhere in the repo before this (confirmed by a full-repo search).
- `.env.example` at repo root documenting the two new env vars this introduces.

**Explicitly out of scope (this session):**
- Any real adapter for Perplexity/Exa/Firecrawl — `paid: []` entries are metadata only, exactly
  like the base provider-abstraction layer's existing empty `paid[]` pattern for other
  capabilities.
- Wiring `deepResearch`'s output into the M22 Generation Studio pipeline, `content-seo.mjs`, or
  any UI. This session builds the standalone capability only; a future session integrates it as
  a pipeline stage (mirrors how D-193 deferred it).
- Vault/DB-backed key resolution. Both Brave and Anthropic keys come from plain environment
  variables — this keeps the new module as standalone and unit-testable as the
  provider-abstraction layer it sits on, with no `db`/`workspaceId` coupling.
- Rate-limit-aware proactive backoff. The existing `RateLimiter` class is not wired in here;
  fallback is purely reactive to an actual HTTP 429 from Brave, per the literal requirement.

## File layout

```
workers/
  providers/
    webSearch.js            # searchWeb() — Brave primary, SearXNG fallback on 429
  deepResearch.mjs           # deepResearch() — orchestrates searchWeb + Claude + cheerio
  config/
    providers.js              # MODIFY — webSearch.paid[] gains 3 registered-not-implemented entries
  verify/
    webSearchProbe.mjs         # unit tests, fetchImpl injection, no real network
    deepResearchProbe.mjs      # unit tests, fetchImpl + fake Claude calls injected
    providersprobe.mjs         # MODIFY — webSearch's paid[].length assertion changes 0 → 3
  package.json                 # MODIFY — add cheerio dependency
.env.example                   # NEW (repo root) — BRAVE_SEARCH_API_KEY, ANTHROPIC_API_KEY
DECISIONS-AiMindShare-v1_0.md  # MODIFY — new D-194 entry
```

`deepResearch.mjs` lives at the `workers/` top level (sibling to `llm.mjs`, `worker.mjs`), not
inside `providers/` — it's an orchestration layer that *consumes* `providers/webSearch.js`, not
a vendor adapter itself. `providers/` stays reserved for one-file-per-vendor adapters per the
base layer's README convention.

## `searchWeb(query, numResults = 5, config = {})`

```js
export async function searchWeb(query, numResults = 5, config = {}) {
  const { tier, provider } = resolveProvider("webSearch", config);

  if (tier === "paid") {
    throw new Error(`searchWeb: paid provider "${provider.name}" not implemented yet`);
  }

  const fetchImpl = config.fetchImpl ?? fetch;
  const apiKey = process.env[provider.envVar]; // BRAVE_SEARCH_API_KEY

  let results, providerUsed = "brave";
  try {
    results = await braveSearch(query, numResults, apiKey, fetchImpl);
  } catch (e) {
    if (e.status !== 429) throw e;
    providerUsed = "searxng";
    results = await searxngSearch(query, numResults, config.searxngUrl, fetchImpl);
  }

  await logProviderUsage("webSearch", providerUsed, { tier });
  return results; // [{ title, url, snippet, publishDate }]
}
```

- Brave: `GET https://api.search.brave.com/res/v1/web/search?q=…&count=…`, header
  `X-Subscription-Token: <key>`. Maps `web.results[]` → `{ title, url, snippet: description,
  publishDate: age ?? null }` (Brave's `age` is a best-effort human string like "3 days ago",
  not a strict date — `publishDate` is best-effort, not guaranteed).
- SearXNG: `GET <searxngUrl>?q=…&format=json`, default `config.searxngUrl` is
  `https://searx.be/search`. Documented in the README as best-effort: public instances change
  availability/policy over time and this fallback may need its URL swapped later. No
  instance-health-checking or rotation — out of scope.
- A non-429 error from Brave (network failure, 401, 500) propagates directly; only 429
  triggers the SearXNG fallback, per the literal requirement.
- `logProviderUsage("webSearch", providerUsed, { tier })` fires once per call, recording
  whichever provider actually served the request (so a fallback shows up as `"searxng"` in the
  usage log, not `"brave"`).

## `deepResearch(topic, maxSources = 8, config = {})`

```js
export async function deepResearch(topic, maxSources = 8, config = {}) {
  const subQueries = await generateSubQueries(topic, config);       // Claude haiku, 3–5 queries
  const raw = (await Promise.all(subQueries.map(q => searchWeb(q, 5, config)))).flat();

  const deduped = dedupeByUrl(raw).slice(0, maxSources);
  if (deduped.length === 0) throw new Error("deepResearch: no search results for this topic");

  const sourcesWithText = (await Promise.all(
    deduped.map(r => fetchFullText(r.url, config).then(text => ({ ...r, text })).catch(() => null))
  )).filter(Boolean);
  if (sourcesWithText.length === 0) throw new Error("deepResearch: no sources could be fetched");

  const draftContent = await synthesizeWithCitations(topic, sourcesWithText, config); // Claude sonnet-5
  const sources = sourcesWithText.map(({ url, title }) => ({ url, title }));
  return { draftContent, sources };
}
```

- **Sub-query generation** — one Claude call (`claude-3-5-haiku`, cheap), prompted to return
  3–5 distinct search queries covering different angles of `topic`. Parsed as a numbered/line
  list.
- **Search** — `searchWeb` runs for every sub-query (5 results each), so `raw` is roughly
  15–25 results before dedup.
- **Dedupe** — by exact `url`, first-seen order preserved, capped to `maxSources` (default 8).
- **Full-text fetch** — `fetch` + `cheerio`: strip `script`/`style`/`nav`/`footer`, take the
  remaining text content, cap to ~6000 characters per source (bounds the synthesis prompt's
  token usage). A source whose fetch fails (404, timeout, non-HTML, etc.) is **skipped, not
  fatal** — `deepResearch` only throws if *zero* sources survive.
- **Synthesis** — one Claude call (`claude-sonnet-5`), given the topic and every surviving
  source's `{ url, title, text }`, instructed to write a draft where every factual claim is
  followed by an inline `[source:n]` marker, `n` matching that source's 1-indexed position in
  the final `sources` array passed back.
- **Output**: `{ draftContent, sources: [{ url, title }] }` — `sources[n-1]` is what
  `[source:n]` in `draftContent` refers to.
- Both Claude calls use `process.env.ANTHROPIC_API_KEY` directly via a small local fetch
  helper in `deepResearch.mjs` (mirrors `llm.mjs`'s request/timeout/`fetchImpl`-injection shape
  but skips Vault/`db`/`workspaceId` entirely, per the standalone-module decision above). If the
  key is missing or Anthropic errors, the call throws — no discriminated-result/retry pattern,
  since this is a direct on-demand function, not a queued job stage.
- `numResults` per sub-query (5) and the per-source text cap (~6000 chars) are fixed constants,
  not additional parameters — not requested, and configurability here isn't needed yet (YAGNI).

## `PROVIDER_CONFIG` change

`workers/config/providers.js`'s `webSearch.paid` array gains three entries (routing metadata
only, no adapter files):

```js
webSearch: {
  free: { name: "brave", envVar: "BRAVE_SEARCH_API_KEY", description: "…" }, // unchanged
  paid: [
    { name: "perplexity", envVar: "PERPLEXITY_API_KEY", description: "Perplexity Sonar API — BYOK, not yet implemented." },
    { name: "exa",         envVar: "EXA_API_KEY",         description: "Exa Search API — BYOK, not yet implemented." },
    { name: "firecrawl",   envVar: "FIRECRAWL_API_KEY",   description: "Firecrawl API — BYOK, not yet implemented." },
  ],
},
```

Consequence: `resolveProvider("webSearch", { apiKey, provider: "exa" })` now resolves
successfully (`tier: "paid"`) instead of throwing — `resolveProvider` only returns routing
info, so this is correct per the base layer's contract. `searchWeb` is the piece that still
throws "not implemented yet" for any paid tier, since no adapter exists. Because `webSearch`
now has 3 paid entries instead of 0, `workers/verify/providersprobe.mjs`'s generic
`paid.length === 0` loop assertion needs a `webSearch` special case (asserts `=== 3` there,
`=== 0` for the other four capabilities) — a required edit, not a regression.

## `.env.example`

New file at repo root (currently none exists):

```
BRAVE_SEARCH_API_KEY=
ANTHROPIC_API_KEY=
```

With brief comments pointing at `workers/README-providers.md` for the full capability table.

## DECISIONS entry (D-194)

Records: Brave Search as the `webSearch` free default (already true from the base layer, now
exercised by a real adapter); SearXNG public-instance reactive fallback on 429; Perplexity/Exa/
Firecrawl registered as BYOK paid options, not implemented; `deepResearch`'s citation format —
`[source:n]` inline markers, `sources[n-1] = { url, title }` — as the first documented contract
for source citations anywhere in the repo (resolves the gap D-193 flagged); both Claude calls
use `ANTHROPIC_API_KEY` from the environment, not Vault, keeping this module DB-free like the
provider-abstraction layer itself.

## Testing

Two new pure-unit probes (no real network, `fetchImpl` injection — same convention as
`workers/verify/llmprobe.mjs`):

- **`webSearchProbe.mjs`**: Brave happy path (mapped result shape), Brave 429 → SearXNG
  fallback triggers and returns SearXNG's shape, a non-429 Brave error propagates without
  falling back, paid tier throws "not implemented", `logProviderUsage` records the actual
  provider used (not always `"brave"`).
- **`deepResearchProbe.mjs`**: sub-query generation parses a fake Claude response into a query
  list, dedupe collapses duplicate URLs across sub-queries, a failed source fetch is skipped
  without aborting the run, all-sources-failed throws, synthesis call receives all surviving
  source texts and the final `{ draftContent, sources }` shape is correct with `sources`
  indices matching injected `[source:n]` markers in a fake synthesis response.
- `providersprobe.mjs`'s `webSearch.paid.length` assertion updated from `=== 0` to `=== 3`
  (only capability with real paid entries now); all other capabilities keep `=== 0`.

Both new probes registered in `scripts/verify.sh` alongside the existing provider-layer probe.
