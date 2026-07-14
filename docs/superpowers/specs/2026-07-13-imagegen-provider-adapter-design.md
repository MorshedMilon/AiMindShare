# imageGen provider adapter (hybrid stock + AI) — design

**Date:** 2026-07-13
**Status:** approved, not yet implemented

## Problem

`workers/config/providers.js` routes the `imageGen` capability to a free default
(`pollinations`, keyless AI generation) but — like every capability — ships with
no real adapter (`providers/` is empty by design; see the provider-abstraction-layer
spec). A module needing blog-post images has nothing to call yet. This spec adds
the first real adapter: a hybrid stock-photo + AI-generation strategy capable of
sourcing images for 100+ blog posts/day, with automatic fallback across sources
and BYOK stubs for paid vendors to wire in later.

This follows the same shape as the sibling `seoAudit` adapter
(`providers/seoAudit.js`, in progress in this same worktree): update
`PROVIDER_CONFIG`'s free entry to the new real primary, keep secondary/tertiary
fallbacks adapter-internal (their own env vars, not in `PROVIDER_CONFIG`), and
register paid BYOK vendors in `paid[]` as stubs that throw "not implemented yet".

## Explicitly out of scope (this session)

- Wiring into `frontend/js/blog-pipeline.mjs`'s `generate_featured_image_with_ai`
  stub (currently returns `null`, deferred to M35 Creative Studio). This session
  only builds the standalone adapter; wiring it into the M22-auto pipeline (and
  formally revisiting the M35 deferral) is a separate future decision.
- Implementing the paid BYOK vendors (DALL-E, Midjourney, Stability AI).
  Registration only — each resolves to a clear "not implemented yet" throw.
- Any monthly rate-limit enforcement. `RateLimiter` (in `config/providers.js`)
  only supports hourly/daily windows and is in-memory/per-process — Pexels'
  20,000/month cap is documented in `.env.example` but not separately tracked.

## `PROVIDER_CONFIG.imageGen` change

```js
imageGen: {
  free: {
    name: 'pexels',
    envVar: 'PEXELS_API_KEY',
    description: 'Pexels API — free tier (200 req/hour, 20,000/month), commercial-safe stock photos. Unsplash (UNSPLASH_ACCESS_KEY) is an automatic fallback if Pexels has no good match or is rate-limited; an optional self-hosted SDXL endpoint (SDXL_ENDPOINT_URL) generates unique AI hero images for high-priority posts. See providers/imageGen.js.',
  },
  paid: [
    { name: 'dalle', envVar: 'DALLE_API_KEY', description: 'OpenAI DALL-E API — BYOK, not implemented yet.' },
    { name: 'midjourney', envVar: 'MIDJOURNEY_API_KEY', description: 'Midjourney API — BYOK, not implemented yet.' },
    { name: 'stability', envVar: 'STABILITY_API_KEY', description: 'Stability AI API — BYOK, not implemented yet.' },
  ],
},
```

`pollinations` is dropped from the free slot (Pexels supersedes it as the real
primary), matching how `seoAudit` dropped `pagespeed` in favor of `ranknibbler`.

## File layout

```
workers/
  providers/
    imageGen.js            # new — this spec
  verify/
    imagegenprobe.mjs        # new — unit tests, zero network
  .env.example              # + PEXELS_API_KEY, UNSPLASH_ACCESS_KEY, SDXL_ENDPOINT_URL
  config/providers.js        # imageGen entry updated (above)
  README-providers.md        # imageGen table row updated
  verify/providersprobe.mjs  # imageGen assertions updated (pollinations → pexels; added to CAPABILITIES_WITH_REGISTERED_PAID)
scripts/verify.sh            # registers imagegenprobe.mjs
```

## `providers/imageGen.js`

Same shape as `providers/seoAudit.js`: harness-injectable (`fetchImpl`, `sleep`,
`logUsage`) for zero-network testing, a local `fetchWithBackoff` (retries only on
429, exponential, matches `seoAudit.js` rather than extracting a shared helper),
and `resolveProvider`/`logProviderUsage` from `../config/providers.js`.

### Return shape

Every function that finds an image returns:
```js
{ url, photographer, attributionHtml, source }
```
`source` ∈ `'pexels' | 'unsplash' | 'sdxl' | 'placeholder'`. `photographer` and
`attributionHtml` are `null` for `sdxl`/`placeholder` (nothing to attribute).
Any function that can't find an image returns `null` — never throws (mirrors
`seoAudit.js`'s "down" handling).

### Functions

- **`getStockImage(query, harness = {})`** — Pexels search. Returns `null` if
  `PEXELS_API_KEY` is unset (skip the guaranteed-401 network call), the rate
  limiter says Pexels is over its hourly budget, there are no results, or the
  request errors/exhausts retries.
- **`getUnsplashImage(query, harness = {})`** — same contract via Unsplash
  (`UNSPLASH_ACCESS_KEY`).
- **`generateAiHeroImage(prompt, harness = {})`** — POSTs to `SDXL_ENDPOINT_URL`.
  Returns `null` if the endpoint isn't configured or the call fails.
- **`getBlogImage(query, config = {}, harness = {})`** — orchestrator:
  1. `getStockImage(query)` (Pexels)
  2. if `null`, `getUnsplashImage(query)`
  3. if `null` and `config.highPriority` and `SDXL_ENDPOINT_URL` is set,
     `generateAiHeroImage(query)`
  4. if still `null`, the placeholder: `{ url: null, photographer: null, attributionHtml: null, source: 'placeholder' }`
     — an honest "unavailable" result, matching the `plagiarism` capability's
     existing "none" stub rather than silently faking an image.
  5. `resolveProvider('imageGen', config.userConfig ?? {})` is checked first —
     if `tier === 'paid'`, throws `` `getBlogImage: paid provider "<name>" is registered but not implemented yet` `` (same contract as `runSeoAudit`).

### Rate limiting

A per-call-site `RateLimiter` (passed via `harness.limiter`, defaulting to a
shared module-level instance) is checked with `isLimited(name, { hourly })`
**before** each Pexels/Unsplash call — routing to the next source proactively
rather than waiting for a real 429. Defaults: Pexels 200/hr, Unsplash 50/hr
(Unsplash's Demo-tier default; override via `config.unsplashHourlyLimit` once a
Production key is approved). `recordCall(name)` fires after every real attempt,
success or failure.

### Usage logging

`logProviderUsage('imageGen', providerName)` fires after every real HTTP
attempt (Pexels, Unsplash, or SDXL) — not for skipped-due-to-missing-key or
skipped-due-to-rate-limit cases, since no call was actually made.

## `.env.example` additions

```
# Pexels API — free tier (200 req/hour, 20,000/month), commercial-safe stock
# photos. Primary source for getBlogImage().
# Setup: https://www.pexels.com/api/ -> sign up -> copy API key.
PEXELS_API_KEY=

# Unsplash API — free tier (Demo: 50 req/hour; apply for Production access for
# 5,000 req/hour), commercial-safe stock photos. Automatic fallback when Pexels
# has no good match or is rate-limited.
# Setup: https://unsplash.com/developers -> create an app -> copy Access Key.
UNSPLASH_ACCESS_KEY=

# Optional — self-hosted Stable Diffusion/SDXL endpoint for unique AI-generated
# hero images on high-priority posts only (requires GPU access). Leave blank to
# skip this tier entirely.
SDXL_ENDPOINT_URL=
```
At least one of these should be set for `getBlogImage` to ever return a real image.

## Testing

`workers/verify/imagegenprobe.mjs`, following `seoauditprobe.mjs`'s convention
(fake `fetchImpl`/`sleep`/`logUsage`, queue-per-endpoint dispatch by URL, no
real network/timers):

- `PROVIDER_CONFIG.imageGen` reconciled (free is now `pexels`, paid registers
  dalle/midjourney/stability).
- `getStockImage` happy path (returns `{url, photographer, attributionHtml, source: 'pexels'}`).
- `getStockImage` returns `null` when `PEXELS_API_KEY` is unset (no fetch attempted).
- Pexels rate-limited (via the `RateLimiter`) → `getBlogImage` skips straight to Unsplash, no 429 round-trip.
- Pexels 429 (real) → retried with backoff → falls back to Unsplash.
- Unsplash down + `config.highPriority` + `SDXL_ENDPOINT_URL` set → falls to `generateAiHeroImage`.
- All sources down/unconfigured → placeholder (`url: null`, `source: 'placeholder'`).
- `logUsage` called for each real attempt, not for skipped sources.
- Paid tier (`userConfig.apiKey` + `provider: 'dalle'`) throws "not implemented yet".

Registered in `scripts/verify.sh` immediately after `seoauditprobe.mjs`.
