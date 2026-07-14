# Provider abstraction layer (capability router) — design

**Date:** 2026-07-13
**Status:** approved, not yet implemented

## Problem

Several future modules will need to call an external API for a given *capability*
(auditing a page's SEO, checking text for plagiarism, generating embeddings,
searching the web, generating an image). Right now each module would have to
pick a specific vendor and hardcode it. This spec adds a thin routing layer so:

- every capability ships with a **free-tier default** that works out of the box
  (module authors don't have to make a vendor choice or wait on a paid decision)
- a workspace can later **Bring Your Own Key** to route the same capability to a
  paid provider, without touching the calling code
- usage is logged locally for future analytics/billing
- adapters can proactively back off before a 429 using a shared rate-limit tracker

## Explicitly out of scope (this session)

- Any real adapter implementation (`providers/` ships empty). Only the *routing*
  layer is built now; each capability's real adapter is a future module's job.
- Any DB/Vault/RLS wiring. `resolveProvider` takes a plain `userConfig` object
  passed in by the caller — no relationship to Supabase Vault or workspace scoping.
- Any relation to the existing M41 Credential Vault registry
  (`supabase/functions/_shared/providers.ts` + `frontend/js/providers.js`). That
  registry is a different, pre-existing concept (third-party integration
  connections — Stripe/OpenAI/SerpApi/etc. — with Vault-backed secrets and a
  frontend mirror + drift-guard probe). This new layer is unrelated: standalone,
  no shared code, no shared keys. Documented explicitly in the README so future
  sessions don't conflate the two.

## File layout

All under `workers/` — the only live Node/ESM runtime in this repo today (has
`package.json`, is where `llm.mjs` and the verify probes already live). Repo
root has no package.json and nothing executes bare JS there.

```
workers/
  config/
    providers.js          # PROVIDER_CONFIG, resolveProvider, logProviderUsage, RateLimiter
    provider-usage.json    # local JSON log, created on first write, gitignored
  providers/
    .gitkeep                # empty — future modules add adapter files here
  README-providers.md
```

## `PROVIDER_CONFIG`

```js
export const PROVIDER_CONFIG = {
  seoAudit:    { free: { name: 'pagespeed',    envVar: 'PAGESPEED_API_KEY',     description: '...' }, paid: [] },
  plagiarism:  { free: { name: 'none',         envVar: null,                    description: 'no reliable free plagiarism API exists; honest unavailable stub (D-063 posture)' }, paid: [] },
  embeddings:  { free: { name: 'huggingface',  envVar: 'HUGGINGFACE_API_KEY',   description: '...' }, paid: [] },
  webSearch:   { free: { name: 'brave',        envVar: 'BRAVE_SEARCH_API_KEY',  description: '...' }, paid: [] },
  imageGen:    { free: { name: 'pollinations', envVar: null,                    description: 'free, keyless image generation' }, paid: [] },
};
```

Free defaults, chosen for a genuine free tier (key-allowed, not keyless-only):

| Capability | Free default | Key needed? |
|---|---|---|
| seoAudit | Google PageSpeed Insights API | yes |
| plagiarism | none (honest stub) | n/a |
| embeddings | HuggingFace Inference API | yes |
| webSearch | Brave Search API | yes |
| imageGen | Pollinations.ai | no |

`paid` arrays start empty for every capability. They stay empty until a later
session wires a real BYOK adapter — this session only builds the shape.

## `resolveProvider(capability, userConfig)`

- Unknown `capability` → throws (typo guard).
- No `userConfig.apiKey` → returns the free entry:
  `{ capability, tier: 'free', provider: {...free config} }`.
- `userConfig.apiKey` present → looks in `paid[]` for a match
  (by `userConfig.provider` name if given, or the sole entry if `paid.length === 1`).
  Since every `paid[]` is empty today, this path always throws a clear
  "no paid provider configured for `<capability>` yet" error. That's expected —
  it's the contract a future BYOK-wiring session will satisfy.

## `logProviderUsage(capability, providerName, meta)`

Appends `{ timestamp, capability, provider, tier, ...meta }` to
`workers/config/provider-usage.json` — read-modify-write a JSON array (fine at
this volume; no concurrent-writer story needed yet).

## `RateLimiter`

In-memory, per-provider hourly/daily counters, lazy time-window resets (no
timers — reset-on-read, so it works fine in short-lived GH Actions runs):

```js
const limiter = new RateLimiter();
limiter.recordCall('pagespeed');
limiter.isLimited('pagespeed', { hourly: 100, daily: 1000 }); // → bool
```

## `README-providers.md`

Per capability: the free default + why, the exact env var to set, and the
2-step process to add a paid provider later:
1. add an entry to `paid: []` in `providers.js` with `{ name, envVar }`
2. create `providers/<name>.js` implementing the call

Also states explicitly, up front, that this is unrelated to the M41 registry.

## Testing

A small probe (`workers/verify/providersprobe.mjs`, following this repo's
existing probe convention) covering: `resolveProvider` free-path for all 5
capabilities, unknown-capability throw, paid-path throw (empty array today),
`logProviderUsage` appends correctly, `RateLimiter` window/reset behavior.
Registered in `scripts/verify.sh` alongside the other probes.
