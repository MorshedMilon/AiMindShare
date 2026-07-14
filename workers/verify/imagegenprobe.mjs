// imagegenprobe.mjs — pure unit tests for workers/providers/imageGen.js. No
// network, no real timers: fetchImpl/sleep/logUsage/limiter are all injected
// fakes, dispatched by URL so Pexels/Unsplash/SDXL can be scripted
// independently within a single getBlogImage call.
import { PROVIDER_CONFIG, resolveProvider, RateLimiter } from "../config/providers.js";
import { getStockImage, getUnsplashImage, generateAiHeroImage, getBlogImage, PLACEHOLDER_IMAGE } from "../providers/imageGen.js";

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
const UNSPLASH_OK = jsonResponse(200, {
  results: [{
    urls: { regular: "https://images.unsplash.com/photo-2-regular.jpg" },
    user: { name: "John Smith", links: { html: "https://unsplash.com/@john-smith" } },
    links: { html: "https://unsplash.com/photos/2" },
  }],
});
const SDXL_OK = jsonResponse(200, { url: "https://sdxl.local/generated/3.png" });
const SERVER_ERROR = jsonResponse(500, { error: "down" });

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
