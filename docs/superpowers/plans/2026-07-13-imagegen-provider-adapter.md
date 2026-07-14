# imageGen Provider Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `workers/providers/imageGen.js`, the first real adapter for the `imageGen` capability — a hybrid stock-photo + AI-generation strategy (Pexels → Unsplash → optional self-hosted SDXL → honest placeholder) capable of sourcing images for 100+ blog posts/day.

**Architecture:** Mirrors the sibling `providers/seoAudit.js` adapter already in this worktree: harness-injectable (`fetchImpl`/`sleep`/`logUsage`/`limiter`) for zero-network testing, a local `fetchWithBackoff` (429-only retry, exponential), and `resolveProvider`/`logProviderUsage`/`RateLimiter` from `../config/providers.js`. `PROVIDER_CONFIG.imageGen.free` moves from `pollinations` to `pexels` (the real primary); Unsplash and SDXL are adapter-internal fallbacks (their own env vars, not in `PROVIDER_CONFIG`); DALL-E/Midjourney/Stability are registered as not-yet-implemented paid stubs.

**Tech Stack:** Node.js (ESM, `workers/` package), no new dependencies — uses the global `fetch`.

**Spec:** `docs/superpowers/specs/2026-07-13-imagegen-provider-adapter-design.md`

---

### Task 1: Reconcile `PROVIDER_CONFIG.imageGen` with the new adapter

**Files:**
- Modify: `workers/verify/providersprobe.mjs`
- Modify: `workers/config/providers.js`

- [ ] **Step 1: Update the failing-first test in `providersprobe.mjs`**

In `workers/verify/providersprobe.mjs`, change line 17 from:
```js
const CAPABILITIES_WITH_REGISTERED_PAID = ["seoAudit"]; // BYOK providers registered but not implemented — see providers/seoAudit.js
```
to:
```js
const CAPABILITIES_WITH_REGISTERED_PAID = ["seoAudit", "imageGen"]; // BYOK providers registered but not implemented — see providers/seoAudit.js, providers/imageGen.js
```

Then change the imageGen assertion block (lines 48-52) from:
```js
{
  const result = resolveProvider("imageGen", {});
  assert(result.tier === "free" && result.provider.name === "pollinations",
    "resolveProvider('imageGen', {}) resolves to the pollinations free default");
}
```
to:
```js
{
  const result = resolveProvider("imageGen", {});
  assert(result.tier === "free" && result.provider.name === "pexels",
    "resolveProvider('imageGen', {}) resolves to the pexels free default");
}
{
  const paidNames = PROVIDER_CONFIG.imageGen.paid.map((p) => p.name);
  assert(paidNames.includes("dalle") && paidNames.includes("midjourney") && paidNames.includes("stability"),
    "PROVIDER_CONFIG.imageGen.paid registers dalle, midjourney, stability (not implemented, registration only)");
}
```

- [ ] **Step 2: Run the probe and confirm it fails**

Run: `cd workers && node verify/providersprobe.mjs`
Expected: FAIL — the `imageGen.paid` starts-empty assertion and the `pexels` free-default assertion both fail, since `providers.js` still has `pollinations`/`paid: []`.

- [ ] **Step 3: Update `PROVIDER_CONFIG.imageGen` in `providers.js`**

In `workers/config/providers.js`, replace (lines 51-58):
```js
  imageGen: {
    free: {
      name: "pollinations",
      envVar: null,
      description: "Pollinations.ai — free, keyless image generation.",
    },
    paid: [],
  },
```
with:
```js
  imageGen: {
    free: {
      name: "pexels",
      envVar: "PEXELS_API_KEY",
      description: "Pexels API — free tier (200 req/hour, 20,000/month), commercial-safe stock photos. Unsplash (UNSPLASH_ACCESS_KEY) is an automatic fallback if Pexels has no good match or is rate-limited; an optional self-hosted SDXL endpoint (SDXL_ENDPOINT_URL) generates unique AI hero images for high-priority posts. See providers/imageGen.js.",
    },
    paid: [
      { name: "dalle", envVar: "DALLE_API_KEY", description: "OpenAI DALL-E API — BYOK, not implemented yet." },
      { name: "midjourney", envVar: "MIDJOURNEY_API_KEY", description: "Midjourney API — BYOK, not implemented yet." },
      { name: "stability", envVar: "STABILITY_API_KEY", description: "Stability AI API — BYOK, not implemented yet." },
    ],
  },
```

- [ ] **Step 4: Run the probe and confirm it passes**

Run: `cd workers && node verify/providersprobe.mjs`
Expected: PASS — `X passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add workers/config/providers.js workers/verify/providersprobe.mjs
git commit -m "feat(providers): reconcile PROVIDER_CONFIG.imageGen with pexels adapter"
```

---

### Task 2: `getStockImage` (Pexels adapter) + probe scaffold

**Files:**
- Create: `workers/providers/imageGen.js`
- Create: `workers/verify/imagegenprobe.mjs`

- [ ] **Step 1: Create `imageGen.js` with only `getStockImage`**

```js
// imageGen.js — hybrid stock-photo + AI-generation adapter (capability:
// "imageGen", see ../config/providers.js). Pexels is the free, key-required
// primary (200 req/hour, 20,000/month); Unsplash is an automatic fallback
// (its own env var, not registered in PROVIDER_CONFIG — same pattern as
// seoAudit.js's RapidAPI fallback); an optional self-hosted SDXL endpoint
// generates unique AI hero images for high-priority posts only. When every
// source is unavailable, getBlogImage returns an honest "unavailable"
// placeholder rather than faking an image.
//
// BYOK paid providers (dalle, midjourney, stability) are registered in
// PROVIDER_CONFIG.imageGen.paid but have no adapter here yet — resolving to
// one throws a clear "not implemented" error rather than pretending to work.
import { resolveProvider, logProviderUsage, RateLimiter } from "../config/providers.js";

const PEXELS_API = "https://api.pexels.com/v1/search";

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_PEXELS_HOURLY_LIMIT = 200;

const sharedLimiter = new RateLimiter();

// Retries only on 429 (rate-limited) — other failures (5xx, network errors)
// are treated as "down" and handed back to the caller immediately so it can
// fall back rather than burn retries on an outage backoff won't fix.
async function fetchWithBackoff(fetchImpl, url, options, { sleep, maxRetries, baseDelayMs }) {
  let response;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    response = await fetchImpl(url, options);
    if (response.status !== 429) return response;
    if (attempt < maxRetries) await sleep(baseDelayMs * 2 ** attempt);
  }
  return response;
}

export async function getStockImage(query, harness = {}) {
  const fetchImpl = harness.fetchImpl ?? fetch;
  const sleep = harness.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const logUsage = harness.logUsage ?? ((providerName) => logProviderUsage("imageGen", providerName));
  const limiter = harness.limiter ?? sharedLimiter;
  const maxRetries = harness.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = harness.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const apiKey = harness.pexelsApiKey ?? process.env.PEXELS_API_KEY;
  const hourlyLimit = harness.pexelsHourlyLimit ?? DEFAULT_PEXELS_HOURLY_LIMIT;

  if (!apiKey) return null;
  if (limiter.isLimited("pexels", { hourly: hourlyLimit })) return null;

  let response;
  try {
    response = await fetchWithBackoff(fetchImpl, `${PEXELS_API}?query=${encodeURIComponent(query)}&per_page=1`, {
      headers: { Authorization: apiKey },
    }, { sleep, maxRetries, baseDelayMs });
  } catch {
    limiter.recordCall("pexels");
    await logUsage("pexels");
    return null;
  }
  limiter.recordCall("pexels");
  await logUsage("pexels");
  if (!response.ok) return null;

  const body = await response.json().catch(() => null);
  const photo = body?.photos?.[0];
  if (!photo) return null;

  return {
    url: photo.src?.large ?? photo.src?.original ?? null,
    photographer: photo.photographer ?? null,
    attributionHtml: `Photo by <a href="${photo.photographer_url ?? "#"}">${photo.photographer ?? "Unknown"}</a> on <a href="${photo.url ?? "https://www.pexels.com"}">Pexels</a>`,
    source: "pexels",
  };
}
```

- [ ] **Step 2: Create `imagegenprobe.mjs` with the probe scaffold + `getStockImage` tests**

```js
// imagegenprobe.mjs — pure unit tests for workers/providers/imageGen.js. No
// network, no real timers: fetchImpl/sleep/logUsage/limiter are all injected
// fakes, dispatched by URL so Pexels/Unsplash/SDXL can be scripted
// independently within a single getBlogImage call.
import { PROVIDER_CONFIG, resolveProvider, RateLimiter } from "../config/providers.js";
import { getStockImage } from "../providers/imageGen.js";

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function makeFetch({ pexels = [], unsplash = [], sdxl = [] } = {}) {
  const queues = { pexels: [...pexels], unsplash: [...unsplash], sdxl: [...sdxl] };
  const next = (key) => {
    const q = queues[key];
    const entry = q.length > 1 ? q.shift() : q[0];
    if (!entry) throw new Error(`makeFetch: no response queued for ${key}`);
    if (entry.networkError) throw new Error(`simulated network error (${key})`);
    return entry;
  };
  return async (url) => {
    if (url.includes("api.pexels.com")) return next("pexels");
    if (url.includes("api.unsplash.com")) return next("unsplash");
    if (url.includes("sdxl.local")) return next("sdxl");
    throw new Error(`makeFetch: unexpected url ${url}`);
  };
}

function fakeHarness(fetchQueues, overrides = {}) {
  const sleeps = [];
  const usageLog = [];
  return {
    fetchImpl: makeFetch(fetchQueues),
    sleep: async (ms) => { sleeps.push(ms); },
    logUsage: async (providerName) => { usageLog.push(providerName); },
    limiter: overrides.limiter ?? new RateLimiter({ now: () => 1_700_000_000_000 }),
    pexelsApiKey: overrides.pexelsApiKey ?? "pexels-test-key",
    unsplashAccessKey: overrides.unsplashAccessKey ?? "unsplash-test-key",
    sdxlEndpointUrl: overrides.sdxlEndpointUrl ?? "https://sdxl.local/generate",
    pexelsHourlyLimit: overrides.pexelsHourlyLimit,
    unsplashHourlyLimit: overrides.unsplashHourlyLimit,
    sleeps,
    usageLog,
  };
}

const PEXELS_OK = jsonResponse(200, {
  photos: [{
    src: { large: "https://images.pexels.com/photo-1-large.jpg" },
    photographer: "Jane Doe",
    photographer_url: "https://www.pexels.com/@jane-doe",
    url: "https://www.pexels.com/photo/1",
  }],
});
const PEXELS_EMPTY = jsonResponse(200, { photos: [] });
const RATE_LIMITED = jsonResponse(429, { error: "rate limited" });

console.log("══ workers/config/providers.js — imageGen config reconciled with the new adapter ══");

assert(PROVIDER_CONFIG.imageGen.free.name === "pexels",
  "PROVIDER_CONFIG.imageGen.free is now pexels (was pollinations)");
assert(PROVIDER_CONFIG.imageGen.free.envVar === "PEXELS_API_KEY",
  "pexels free default reads PEXELS_API_KEY");
assert(resolveProvider("imageGen", {}).provider.name === "pexels",
  "resolveProvider('imageGen', {}) resolves to pexels");
{
  const paidNames = PROVIDER_CONFIG.imageGen.paid.map((p) => p.name);
  assert(paidNames.includes("dalle") && paidNames.includes("midjourney") && paidNames.includes("stability"),
    "PROVIDER_CONFIG.imageGen.paid registers dalle, midjourney, stability (not implemented, registration only)");
}

console.log("\n══ workers/providers/imageGen.js — getStockImage (Pexels) ══");

{
  const h = fakeHarness({ pexels: [PEXELS_OK] });
  const result = await getStockImage("mountain sunrise", h);
  assert(result.source === "pexels", "happy path: source is pexels");
  assert(result.url === "https://images.pexels.com/photo-1-large.jpg", "happy path: url from photo.src.large");
  assert(result.photographer === "Jane Doe", "happy path: photographer populated");
  assert(result.attributionHtml.includes("Jane Doe") && result.attributionHtml.includes("Pexels"),
    "happy path: attributionHtml mentions photographer and Pexels");
  assert(h.usageLog.includes("pexels"), "happy path: logUsage called with pexels");
}
{
  const h = fakeHarness({}, { pexelsApiKey: "" });
  const result = await getStockImage("mountain sunrise", h);
  assert(result === null, "missing PEXELS_API_KEY: returns null without attempting a fetch");
  assert(h.usageLog.length === 0, "missing PEXELS_API_KEY: logUsage not called (no call attempted)");
}
{
  const limiter = new RateLimiter({ now: () => 1_700_000_000_000 });
  limiter.recordCall("pexels");
  const h = fakeHarness({}, { limiter, pexelsHourlyLimit: 1 });
  const result = await getStockImage("mountain sunrise", h);
  assert(result === null, "pexels over its hourly limit: returns null without attempting a fetch");
  assert(h.usageLog.length === 0, "rate-limited: logUsage not called (no call attempted)");
}
{
  const h = fakeHarness({ pexels: [RATE_LIMITED] });
  const result = await getStockImage("mountain sunrise", h);
  assert(h.sleeps.length === 2 && h.sleeps[0] === 500 && h.sleeps[1] === 1000,
    "pexels 429: retried with exponential backoff (500ms, 1000ms)");
  assert(result === null, "pexels still 429 after retries: returns null");
}
{
  const h = fakeHarness({ pexels: [PEXELS_EMPTY] });
  const result = await getStockImage("an extremely obscure query", h);
  assert(result === null, "pexels returns zero results: returns null");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 3: Run the probe and confirm it passes**

Run: `cd workers && node verify/imagegenprobe.mjs`
Expected: PASS — `16 passed, 0 failed`.

- [ ] **Step 4: Commit**

```bash
git add workers/providers/imageGen.js workers/verify/imagegenprobe.mjs
git commit -m "feat(providers): add getStockImage (Pexels) to imageGen adapter"
```

---

### Task 3: `getUnsplashImage`

**Files:**
- Modify: `workers/providers/imageGen.js`
- Modify: `workers/verify/imagegenprobe.mjs`

- [ ] **Step 1: Add the failing tests to `imagegenprobe.mjs`**

Add the `UNSPLASH_OK` fixture near the other fixtures:
```js
const UNSPLASH_OK = jsonResponse(200, {
  results: [{
    urls: { regular: "https://images.unsplash.com/photo-2-regular.jpg" },
    user: { name: "John Smith", links: { html: "https://unsplash.com/@john-smith" } },
    links: { html: "https://unsplash.com/photos/2" },
  }],
});
```

Update the import line to add `getUnsplashImage`:
```js
import { getStockImage, getUnsplashImage } from "../providers/imageGen.js";
```

Add this section right after the `getStockImage` section (before the final `console.log(`\n${pass} passed...`)` line):
```js
console.log("\n══ workers/providers/imageGen.js — getUnsplashImage ══");

{
  const h = fakeHarness({ unsplash: [UNSPLASH_OK] });
  const result = await getUnsplashImage("mountain sunrise", h);
  assert(result.source === "unsplash", "happy path: source is unsplash");
  assert(result.url === "https://images.unsplash.com/photo-2-regular.jpg", "happy path: url from urls.regular");
  assert(result.photographer === "John Smith", "happy path: photographer populated");
  assert(result.attributionHtml.includes("John Smith") && result.attributionHtml.includes("Unsplash"),
    "happy path: attributionHtml mentions photographer and Unsplash");
  assert(h.usageLog.includes("unsplash"), "happy path: logUsage called with unsplash");
}
{
  const h = fakeHarness({}, { unsplashAccessKey: "" });
  const result = await getUnsplashImage("mountain sunrise", h);
  assert(result === null, "missing UNSPLASH_ACCESS_KEY: returns null without attempting a fetch");
}
```

- [ ] **Step 2: Run the probe and confirm it fails**

Run: `cd workers && node verify/imagegenprobe.mjs`
Expected: FAIL with `getUnsplashImage is not a function` (or a thrown TypeError), since `imageGen.js` doesn't export it yet.

- [ ] **Step 3: Add `getUnsplashImage` to `imageGen.js`**

Add this constant next to `PEXELS_API`:
```js
const UNSPLASH_API = "https://api.unsplash.com/search/photos";
const DEFAULT_UNSPLASH_HOURLY_LIMIT = 50; // Unsplash Demo tier; raise once Production is approved
```

Add this function after `getStockImage`:
```js
export async function getUnsplashImage(query, harness = {}) {
  const fetchImpl = harness.fetchImpl ?? fetch;
  const sleep = harness.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const logUsage = harness.logUsage ?? ((providerName) => logProviderUsage("imageGen", providerName));
  const limiter = harness.limiter ?? sharedLimiter;
  const maxRetries = harness.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = harness.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const accessKey = harness.unsplashAccessKey ?? process.env.UNSPLASH_ACCESS_KEY;
  const hourlyLimit = harness.unsplashHourlyLimit ?? DEFAULT_UNSPLASH_HOURLY_LIMIT;

  if (!accessKey) return null;
  if (limiter.isLimited("unsplash", { hourly: hourlyLimit })) return null;

  let response;
  try {
    response = await fetchWithBackoff(fetchImpl, `${UNSPLASH_API}?query=${encodeURIComponent(query)}&per_page=1`, {
      headers: { Authorization: `Client-ID ${accessKey}` },
    }, { sleep, maxRetries, baseDelayMs });
  } catch {
    limiter.recordCall("unsplash");
    await logUsage("unsplash");
    return null;
  }
  limiter.recordCall("unsplash");
  await logUsage("unsplash");
  if (!response.ok) return null;

  const body = await response.json().catch(() => null);
  const photo = body?.results?.[0];
  if (!photo) return null;

  return {
    url: photo.urls?.regular ?? photo.urls?.full ?? null,
    photographer: photo.user?.name ?? null,
    attributionHtml: `Photo by <a href="${photo.user?.links?.html ?? "#"}">${photo.user?.name ?? "Unknown"}</a> on <a href="${photo.links?.html ?? "https://unsplash.com"}">Unsplash</a>`,
    source: "unsplash",
  };
}
```

- [ ] **Step 4: Run the probe and confirm it passes**

Run: `cd workers && node verify/imagegenprobe.mjs`
Expected: PASS — `22 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add workers/providers/imageGen.js workers/verify/imagegenprobe.mjs
git commit -m "feat(providers): add getUnsplashImage fallback to imageGen adapter"
```

---

### Task 4: `generateAiHeroImage` (SDXL)

**Files:**
- Modify: `workers/providers/imageGen.js`
- Modify: `workers/verify/imagegenprobe.mjs`

- [ ] **Step 1: Add the failing tests to `imagegenprobe.mjs`**

Add the `SDXL_OK` fixture near the other fixtures:
```js
const SDXL_OK = jsonResponse(200, { url: "https://sdxl.local/generated/3.png" });
```

Update the import line to add `generateAiHeroImage`:
```js
import { getStockImage, getUnsplashImage, generateAiHeroImage } from "../providers/imageGen.js";
```

Add this section right after the `getUnsplashImage` section:
```js
console.log("\n══ workers/providers/imageGen.js — generateAiHeroImage (SDXL) ══");

{
  const h = fakeHarness({ sdxl: [SDXL_OK] });
  const result = await generateAiHeroImage("a majestic mountain at sunrise, digital art", h);
  assert(result.source === "sdxl", "happy path: source is sdxl");
  assert(result.url === "https://sdxl.local/generated/3.png", "happy path: url from body.url");
  assert(result.photographer === null && result.attributionHtml === null,
    "happy path: no photographer/attribution for AI-generated images");
}
{
  const h = fakeHarness({}, { sdxlEndpointUrl: "" });
  const result = await generateAiHeroImage("a majestic mountain at sunrise, digital art", h);
  assert(result === null, "no SDXL_ENDPOINT_URL configured: returns null without attempting a fetch");
}
```

- [ ] **Step 2: Run the probe and confirm it fails**

Run: `cd workers && node verify/imagegenprobe.mjs`
Expected: FAIL with `generateAiHeroImage is not a function`.

- [ ] **Step 3: Add `generateAiHeroImage` to `imageGen.js`**

Add this function after `getUnsplashImage` (self-hosted endpoint — no retry/backoff or rate limiter, since it isn't a public rate-limited API):
```js
export async function generateAiHeroImage(prompt, harness = {}) {
  const fetchImpl = harness.fetchImpl ?? fetch;
  const logUsage = harness.logUsage ?? ((providerName) => logProviderUsage("imageGen", providerName));
  const endpointUrl = harness.sdxlEndpointUrl ?? process.env.SDXL_ENDPOINT_URL;

  if (!endpointUrl) return null;

  let response;
  try {
    response = await fetchImpl(endpointUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
  } catch {
    await logUsage("sdxl");
    return null;
  }
  await logUsage("sdxl");
  if (!response.ok) return null;

  const body = await response.json().catch(() => null);
  if (!body?.url) return null;

  return { url: body.url, photographer: null, attributionHtml: null, source: "sdxl" };
}
```

- [ ] **Step 4: Run the probe and confirm it passes**

Run: `cd workers && node verify/imagegenprobe.mjs`
Expected: PASS — `26 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add workers/providers/imageGen.js workers/verify/imagegenprobe.mjs
git commit -m "feat(providers): add generateAiHeroImage (SDXL) to imageGen adapter"
```

---

### Task 5: `getBlogImage` orchestrator (fallback chain + placeholder + BYOK throw)

**Files:**
- Modify: `workers/providers/imageGen.js`
- Modify: `workers/verify/imagegenprobe.mjs`

- [ ] **Step 1: Add the failing tests to `imagegenprobe.mjs`**

Add a server-error fixture near the others:
```js
const SERVER_ERROR = jsonResponse(500, { error: "down" });
```

Update the import line to add `getBlogImage` and `PLACEHOLDER_IMAGE`:
```js
import { getStockImage, getUnsplashImage, generateAiHeroImage, getBlogImage, PLACEHOLDER_IMAGE } from "../providers/imageGen.js";
```

Add this section right after the `generateAiHeroImage` section (before the final `console.log(`\n${pass} passed...`)` line):
```js
console.log("\n══ workers/providers/imageGen.js — getBlogImage (fallback chain) ══");

{
  const h = fakeHarness({ pexels: [PEXELS_OK] });
  const result = await getBlogImage("mountain sunrise", {}, h);
  assert(result.source === "pexels", "pexels available: getBlogImage returns the pexels result directly");
}
{
  const h = fakeHarness({ pexels: [PEXELS_EMPTY], unsplash: [UNSPLASH_OK] });
  const result = await getBlogImage("mountain sunrise", {}, h);
  assert(result.source === "unsplash", "pexels has no match: falls back to unsplash");
}
{
  const h = fakeHarness({ pexels: [PEXELS_EMPTY], unsplash: [SERVER_ERROR], sdxl: [SDXL_OK] });
  const result = await getBlogImage("mountain sunrise", { highPriority: true }, h);
  assert(result.source === "sdxl", "pexels+unsplash both fail, highPriority=true: falls to sdxl");
}
{
  const h = fakeHarness({ pexels: [PEXELS_EMPTY], unsplash: [SERVER_ERROR], sdxl: [SDXL_OK] });
  const result = await getBlogImage("mountain sunrise", { highPriority: false }, h);
  assert(result === PLACEHOLDER_IMAGE, "pexels+unsplash both fail, highPriority=false: skips sdxl, returns placeholder");
}
{
  const h = fakeHarness({ pexels: [PEXELS_EMPTY], unsplash: [SERVER_ERROR] }, { sdxlEndpointUrl: "" });
  const result = await getBlogImage("mountain sunrise", { highPriority: true }, h);
  assert(result === PLACEHOLDER_IMAGE, "all sources unavailable: returns the honest placeholder");
}
{
  let threw = null;
  try {
    await getBlogImage("mountain sunrise", { userConfig: { apiKey: "sk-live", provider: "dalle" } }, fakeHarness({}));
  } catch (e) { threw = e; }
  assert(threw && /dalle/.test(threw.message) && /not implemented/i.test(threw.message),
    "BYOK paid tier (dalle) is registered but throws a clear 'not implemented yet' error");
}
```

- [ ] **Step 2: Run the probe and confirm it fails**

Run: `cd workers && node verify/imagegenprobe.mjs`
Expected: FAIL with `getBlogImage is not a function`.

- [ ] **Step 3: Add `getBlogImage` and `PLACEHOLDER_IMAGE` to `imageGen.js`**

Add at the end of `imageGen.js`:
```js
export const PLACEHOLDER_IMAGE = { url: null, photographer: null, attributionHtml: null, source: "placeholder" };

export async function getBlogImage(query, config = {}, harness = {}) {
  const { tier, provider } = resolveProvider("imageGen", config.userConfig ?? {});
  if (tier === "paid") {
    throw new Error(`getBlogImage: paid provider "${provider.name}" is registered but not implemented yet`);
  }

  const stock = await getStockImage(query, harness);
  if (stock) return stock;

  const unsplash = await getUnsplashImage(query, harness);
  if (unsplash) return unsplash;

  if (config.highPriority) {
    const aiHero = await generateAiHeroImage(query, harness);
    if (aiHero) return aiHero;
  }

  return PLACEHOLDER_IMAGE;
}
```

- [ ] **Step 4: Run the probe and confirm it passes**

Run: `cd workers && node verify/imagegenprobe.mjs`
Expected: PASS — `32 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add workers/providers/imageGen.js workers/verify/imagegenprobe.mjs
git commit -m "feat(providers): add getBlogImage orchestrator to imageGen adapter"
```

---

### Task 6: `.env.example` entries

**Files:**
- Modify: `workers/.env.example`

- [ ] **Step 1: Append the imageGen section**

Append to the end of `workers/.env.example` (after the existing `RAPIDAPI_KEY=` line):
```

# imageGen provider (workers/providers/imageGen.js) — see ../README-providers.md

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

- [ ] **Step 2: Commit**

```bash
git add workers/.env.example
git commit -m "docs(providers): add imageGen .env.example entries"
```

---

### Task 7: `README-providers.md` update

**Files:**
- Modify: `workers/README-providers.md`

- [ ] **Step 1: Update the `imageGen` table row**

In `workers/README-providers.md`, change line 24 from:
```
| `imageGen` | Pollinations.ai | — | free, keyless, no signup |
```
to:
```
| `imageGen` | Pexels API | `PEXELS_API_KEY` | primary — commercial-safe stock photos, 200 req/hour / 20,000/month. Unsplash (`UNSPLASH_ACCESS_KEY`) is an automatic fallback if Pexels has no good match or is rate-limited. An optional self-hosted SDXL endpoint (`SDXL_ENDPOINT_URL`) generates unique AI hero images for high-priority posts only. BYOK: `dalle`/`midjourney`/`stability` registered in `paid[]`, not yet implemented. See `providers/imageGen.js`. |
```

- [ ] **Step 2: Commit**

```bash
git add workers/README-providers.md
git commit -m "docs(providers): update README-providers.md for the imageGen adapter"
```

---

### Task 8: Register the probe in `verify.sh` and run full verification

**Files:**
- Modify: `scripts/verify.sh`

- [ ] **Step 1: Register `imagegenprobe.mjs`**

In `scripts/verify.sh`, right after the `seoauditprobe.mjs` block:
```bash
echo; echo "══ +  seoAudit provider: RankNibbler + PageSpeed CWV + RapidAPI fallback (unit, no network) ══"
( cd workers && node verify/seoauditprobe.mjs ) || fails=$((fails+1))
```
insert:
```bash

echo; echo "══ +  imageGen provider: Pexels + Unsplash + SDXL hybrid fallback (unit, no network) ══"
( cd workers && node verify/imagegenprobe.mjs ) || fails=$((fails+1))
```

- [ ] **Step 2: Run the full verification suite**

Run: `bash scripts/verify.sh`
Expected: every probe passes, including the new `imageGen provider` line, with 0 total failures.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify.sh
git commit -m "test(providers): register imagegenprobe.mjs in verify.sh"
```
