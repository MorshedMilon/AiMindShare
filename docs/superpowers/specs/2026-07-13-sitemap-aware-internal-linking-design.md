# Sitemap-Aware Internal Linking — design

**Date:** 2026-07-13
**Status:** approved, not yet implemented

## Problem

M22's Generation Studio pipeline (migration `0040_m22_generation_studio.sql`, D-193) has an
`auto_link` stage that is currently a stub (`{ stub: true }`). D-193 explicitly named
"Sitemap-Aware Internal Linking" as out of scope, deferred to a separate future spec. This is
that spec: a standalone library that crawls a site's sitemap, embeds each page's content, and
can suggest semantically relevant internal links for a piece of article text. Wiring it into the
`auto_link` stage itself is explicitly **not** part of this session (see Scope below).

## Scope

**In scope:** the crawler, the embeddings adapter, local storage, `findLinkCandidates`,
`suggestInternalLinks`, and a CLI to rebuild the index.

**Explicitly out of scope (this session):**
- Wiring into `workers/worker.mjs`'s `auto_link` pipeline stage — that stage stays a stub.
  Follow-up work, once this library is in place and reviewed.
- Any DB storage/migration — index is a local JSON file, per the requester's own spec
  ("no external vector DB needed at this scale").
- Real implementations of the OpenAI/Cohere paid embedding adapters — registered in
  `PROVIDER_CONFIG` only, per the existing provider-abstraction-layer contract
  (`docs/superpowers/specs/2026-07-13-provider-abstraction-layer-design.md`).

## Dependency on the provider abstraction layer

`workers/config/providers.js` (merged to `main` this session from the
`worktree-provider-abstraction-layer` branch) already ships a `PROVIDER_CONFIG.embeddings`
entry defaulting to `huggingface` (API-key-based). This spec **changes that default**:

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
}
```

Rationale: a locally-run model has a genuine zero-cost, zero-key free tier — a strictly better
default than an API that needs a key and has a rate limit, for a capability (embeddings) that
will be called once per crawled page and potentially once per generated article. `resolveProvider`
and `logProviderUsage` are otherwise used unchanged.

`workers/verify/providersprobe.mjs`'s embeddings assertions (which currently expect
`huggingface`/`paid.length === 0`) are updated to match.

## File layout

```
workers/
  config/
    providers.js              # MODIFY: embeddings.free -> xenova-transformers, embeddings.paid -> [openai, cohere]
  providers/
    embeddings.js              # NEW: embed(text, config, opts) adapter
  seo/
    internal-linking.mjs       # NEW: crawlSitemap, buildIndex, findLinkCandidates, suggestInternalLinks
    sitemap-index.json         # generated, gitignored — local storage
  rebuild-sitemap-index.js     # NEW: CLI entry point
  verify/
    internallinkingprobe.mjs   # NEW: pure unit probe, no network, no real model download
    providersprobe.mjs         # MODIFY: embeddings assertions updated for new free/paid config
  package.json                 # MODIFY: add cheerio, @xenova/transformers deps + rebuild-sitemap-index script
.gitignore                     # MODIFY: add workers/seo/sitemap-index.json
```

## `providers/embeddings.js`

```js
export async function embed(text, config = {}, { pipelineFactory } = {})
```

- Calls `resolveProvider("embeddings", config)`.
- `tier === "free"`: lazily creates (and caches at module scope) a `@xenova/transformers`
  `feature-extraction` pipeline for `Xenova/all-MiniLM-L6-v2` (384-dim, small/fast — the
  standard low-footprint sentence-embedding model for this library). Runs it on `text`, mean-pools
  + normalizes, returns a plain `number[]`.
- `tier === "paid"`: throws `` `${provider.name} embeddings not implemented yet` `` — both
  registered paid providers have no adapter code, per scope.
- Calls `await logProviderUsage("embeddings", provider.name, { tier })` on every call
  (success and the not-implemented throw both count as an attempted call to that provider).
- `pipelineFactory` param (defaults to a real `@xenova/transformers` loader) exists purely so
  the probe can inject a fake pipeline and avoid downloading real model weights or doing any
  inference in CI.

This is a single file for the whole `embeddings` capability, not one file per vendor (deviating
from `README-providers.md`'s "one file per vendor" guidance) — the free tier isn't a vendor API
call at all, so there's nothing to split out yet. If/when a paid embeddings adapter is actually
implemented later, it can become its own `providers/<vendor>-embeddings.js` that this file
dispatches to.

## `seo/internal-linking.mjs`

### `crawlSitemap(sitemapUrl, { fetchFn = fetch } = {})`

1. Fetch `sitemapUrl` via `fetchFn` (real `fetch` by default, injectable for tests — same
   pattern as `workers/seo/crawler.mjs`'s `fetchFn` injection).
2. Parse `<loc>` entries. If the root element is `<sitemapindex>`, treat each `<loc>` as a child
   sitemap URL and fetch+parse one level deep (no further recursion — real sitemap indexes are
   effectively always exactly one level).
3. For every page URL: fetch the page HTML, parse with `cheerio`, extract `<title>` text and the
   first 200 words of visible body text (script/style/nav/footer tags excluded from the text
   walk, matching typical "readable content" extraction).
4. Returns `[{ url, title, snippet }]`. Pages that fail to fetch (network error or non-2xx) are
   skipped, not thrown — a single dead page shouldn't abort the whole crawl.

### `buildIndex(sitemapUrl, config = {}, { fetchFn, embedFn } = {})`

Orchestrator used by the CLI: `crawlSitemap` → for each `{url, title, snippet}`, compute
`embedFn ?? embed` on `` `${title}\n${snippet}` `` → write `{url, title, snippet, embedding,
crawledAt}` to `sitemap-index.json` (object keyed by `url`, so re-running the crawl updates
existing entries in place instead of duplicating). Returns `{ indexed: number, skipped: number }`.

### `findLinkCandidates(currentPageText, topN = 5, config = {})`

Embeds `currentPageText`, loads the stored index, computes cosine similarity against every
stored embedding, excludes `config.currentUrl` if given, sorts descending, returns the top
`topN` as `[{ url, title, snippet, score }]`.

### `suggestInternalLinks(articleHtml, config = {})`

1. Parses `articleHtml` with `cheerio`, extracts plain text, and calls `findLinkCandidates` on
   that text (using `config.currentUrl` / `config.topN` if provided) to get candidate pages.
2. For each candidate, derives a short keyword phrase from its title (stripped of stopwords) and
   searches the article's plain-text nodes — skipping anything already inside an `<a>` — for a
   case-insensitive match of that phrase.
3. For each match found, returns `{ url, anchorText, context, candidateTitle }` where
   `anchorText` is the matched phrase as it appears in the article and `context` is a short
   surrounding snippet (for a human reviewer to see where the link would land). Candidates with
   no textual match in the article are simply omitted — this function suggests, it doesn't force
   an insertion for every candidate.

Every `embed()` call inside this module — via `buildIndex` or `findLinkCandidates` — flows
through `providers/embeddings.js`, so `logProviderUsage("embeddings", ...)` fires automatically;
no separate logging call needed in `internal-linking.mjs` itself.

## `rebuild-sitemap-index.js` (CLI)

```
node rebuild-sitemap-index.js <sitemapUrl>
```

Calls `buildIndex(sitemapUrl)`, prints a one-line summary (`Indexed N pages, skipped M`), exits
0 on success / 1 on a top-level failure (e.g. sitemap unreachable). Registered as
`npm run rebuild-sitemap-index -- <sitemapUrl>` in `workers/package.json`.

## Testing

`workers/verify/internallinkingprobe.mjs`, following the existing pure-probe convention
(`crawler.mjs`'s injectable `fetchFn`, `llmprobe.mjs`'s no-network style):

- `crawlSitemap` against a fake `fetchFn` returning canned sitemap/page XML+HTML — covers a flat
  `<urlset>`, a `<sitemapindex>` with two children, and a page that fails to fetch (skipped, not
  thrown).
- `providers/embeddings.js`'s `embed()` against an injected `pipelineFactory` returning a fixed
  vector — covers the free-tier path and the "paid provider not implemented" throw for both
  `openai` and `cohere`, plus confirms `logProviderUsage` fires (via an injected `logPath` if
  the signature needs one — matches the existing `logProviderUsage(..., logPath)` test-override
  pattern already used in `providersprobe.mjs`).
- `findLinkCandidates` against a hand-built in-memory index (bypassing the real JSON file via an
  injectable storage path) — covers top-N ranking, `currentUrl` self-exclusion, and `topN`
  truncation.
- `suggestInternalLinks` against a small article HTML fixture and a fake candidate list — covers
  a phrase match found, a phrase already inside an existing `<a>` (correctly skipped), and a
  candidate with no textual match (correctly omitted from the result).

Registered in `scripts/verify.sh` after the provider abstraction layer's block.

## Docs

- `DECISIONS-AiMindShare-v1_0.md`: new entry **D-194** recording the embeddings free-tier
  default change (xenova-transformers over huggingface) and the standalone-library scope
  (auto_link wiring deferred). Number reconfirmed against the log immediately before writing,
  per this repo's parallel-session renumbering convention.
- `TASKS.md`: new session entry once implemented and verified.
