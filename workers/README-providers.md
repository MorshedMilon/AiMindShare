# Provider abstraction layer

`config/providers.js` routes each *capability* (an external-API-shaped need,
not a specific vendor) to a free-tier default today, with a path to Bring
Your Own Key (BYOK) for a paid provider later. Module code calls
`resolveProvider(capability, userConfig)` instead of hardcoding a vendor.

**This is unrelated to `supabase/functions/_shared/providers.ts`** (the M41
Credential Vault registry of third-party integration connections — Stripe,
OpenAI, SerpApi, etc., with Vault-backed secrets and a frontend mirror). That
registry is about connecting a workspace's own accounts to those vendors for
existing modules. This layer is about picking which vendor answers a given
capability, with no Vault/DB/workspace-scoping involved — `userConfig` is
just a plain object the caller passes in.

## Capabilities and free defaults

| Capability | Free default | Env var | Notes |
|---|---|---|---|
| `seoAudit` | Google PageSpeed Insights API | `PAGESPEED_API_KEY` | free tier, ~25,000 requests/day |
| `plagiarism` | Local TF-IDF cosine-similarity + burstiness/vocabulary-richness heuristic | — | no external API, no key; compares against a caller-supplied `corpus` if given, otherwise falls back to detecting internal near-duplicate sentences. 4 BYOK slots pre-registered (Copyleaks, Originality.ai, GPTZero, Winston AI) — no adapters implemented yet. |
| `embeddings` | HuggingFace Inference API | `HUGGINGFACE_API_KEY` | free tier, rate-limited |
| `webSearch` | Brave Search API | `BRAVE_SEARCH_API_KEY` | free tier, 2,000 queries/month |
| `imageGen` | Pollinations.ai | — | free, keyless, no signup |

## Usage

```js
import { resolveProvider, logProviderUsage, RateLimiter } from "./config/providers.js";

const { tier, provider } = resolveProvider("seoAudit", userConfig);
// provider.envVar tells you which env var holds the key (if any)

const limiter = new RateLimiter();
if (limiter.isLimited(provider.name, { hourly: 100 })) {
  // back off / switch providers before hitting a real 429
}
limiter.recordCall(provider.name);

// ... make the actual API call in providers/<provider.name>.js ...

await logProviderUsage("seoAudit", provider.name, { tier });
```

## Plagiarism check: what "local" means

`providers/plagiarism.js`'s `checkOriginality(text, config)` free tier never
calls out to the network. It can only compare `text` against:

- `config.corpus` (an array of `{ id, text }` reference documents you supply
  — e.g. previously-published articles), if given; or
- itself, falling back to internal near-duplicate sentence detection when no
  corpus is given.

It cannot detect matches against arbitrary content on the web. For that,
configure a paid BYOK provider (see below) once one is implemented.

`autoRewriteLoop(text, maxAttempts, config)` in
`plagiarism-rewrite-loop.mjs` wraps `checkOriginality` with a Claude-powered
rewrite step (reusing `llm.mjs`'s existing Vault-backed Anthropic caller) and
logs each run's before/after scores to `config/plagiarism-rewrite-report.json`.

## Adding a paid BYOK provider later

1. In `config/providers.js`, add an entry to the relevant capability's `paid`
   array: `{ name: "<vendor>", envVar: "<VENDOR>_API_KEY", description: "..." }`.
2. Create `providers/<vendor>.js` implementing the actual API call for that
   vendor. There's no fixed interface yet — the first paid adapter for a
   capability sets the pattern the next one follows.
3. Callers already work unchanged: once a workspace passes
   `{ apiKey, provider: "<vendor>" }` into `resolveProvider`, it routes there
   instead of the free default.

## Usage log

Every `logProviderUsage` call appends a `{ timestamp, capability, provider,
...meta }` entry to `config/provider-usage.json` (gitignored, created on
first write). Intended for future usage analytics/billing — nothing reads
it yet.
