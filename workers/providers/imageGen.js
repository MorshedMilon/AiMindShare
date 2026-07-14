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
const UNSPLASH_API = "https://api.unsplash.com/search/photos";
const DEFAULT_UNSPLASH_HOURLY_LIMIT = 50; // Unsplash Demo tier; raise once Production is approved

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
