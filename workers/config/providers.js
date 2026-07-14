// providers.js — capability router: free-tier defaults now, BYOK for paid
// providers later. Standalone from supabase/functions/_shared/providers.ts
// (the M41 Credential Vault registry) — no shared code, no shared keys, no
// Vault/DB involvement. See ../README-providers.md.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_USAGE_LOG_PATH = path.join(__dirname, "provider-usage.json");

export const PROVIDER_CONFIG = {
  seoAudit: {
    free: {
      name: "ranknibbler",
      envVar: null,
      description: "RankNibbler API — free, keyless on-page SEO audit (title, meta, links, redirects, structured data, AI-readiness). Core Web Vitals come from a separate PageSpeed Insights call (PAGESPEED_API_KEY); RapidAPI's Website SEO Audit API (RAPIDAPI_KEY) is an automatic fallback if RankNibbler is down or rate-limited. See providers/seoAudit.js.",
    },
    paid: [
      { name: "ahrefs", envVar: "AHREFS_API_KEY", description: "Ahrefs API — BYOK, not implemented yet." },
      { name: "semrush", envVar: "SEMRUSH_API_KEY", description: "SEMrush API — BYOK, not implemented yet." },
      { name: "seranking", envVar: "SERANKING_API_KEY", description: "SE Ranking API — BYOK, not implemented yet." },
    ],
  },
  plagiarism: {
    free: {
      name: "none",
      envVar: null,
      description: "No reliable free plagiarism-detection API exists; reports unavailable until a paid provider is configured.",
    },
    paid: [],
  },
  embeddings: {
    free: {
      name: "huggingface",
      envVar: "HUGGINGFACE_API_KEY",
      description: "HuggingFace Inference API — free tier, rate-limited.",
    },
    paid: [],
  },
  webSearch: {
    free: {
      name: "brave",
      envVar: "BRAVE_SEARCH_API_KEY",
      description: "Brave Search API — free tier (2,000 queries/month).",
    },
    paid: [],
  },
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
};

export function resolveProvider(capability, userConfig = {}) {
  const config = PROVIDER_CONFIG[capability];
  if (!config) {
    throw new Error(`resolveProvider: unknown capability "${capability}"`);
  }

  if (!userConfig.apiKey) {
    return { capability, tier: "free", provider: config.free };
  }

  if (userConfig.provider) {
    const paidProvider = config.paid.find((p) => p.name === userConfig.provider);
    if (!paidProvider) {
      throw new Error(`resolveProvider: no paid provider named "${userConfig.provider}" configured for "${capability}"`);
    }
    return { capability, tier: "paid", provider: paidProvider };
  }

  if (config.paid.length === 0) {
    throw new Error(`resolveProvider: no paid provider configured for "${capability}" yet`);
  }
  if (config.paid.length > 1) {
    throw new Error(`resolveProvider: ambiguous — "${capability}" has ${config.paid.length} paid providers configured; pass { provider: "<name>" } to pick one`);
  }

  return { capability, tier: "paid", provider: config.paid[0] };
}

export async function logProviderUsage(capability, providerName, meta = {}, logPath = DEFAULT_USAGE_LOG_PATH) {
  let entries = [];
  if (existsSync(logPath)) {
    try {
      entries = JSON.parse(await readFile(logPath, "utf8"));
    } catch {
      entries = [];
    }
  }
  entries.push({
    timestamp: new Date().toISOString(),
    capability,
    provider: providerName,
    ...meta,
  });
  await mkdir(path.dirname(logPath), { recursive: true });
  await writeFile(logPath, JSON.stringify(entries, null, 2));
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export class RateLimiter {
  constructor({ now = () => Date.now() } = {}) {
    this.counters = new Map();
    this._now = now;
  }

  _windows(providerName) {
    if (!this.counters.has(providerName)) {
      const now = this._now();
      this.counters.set(providerName, {
        hourly: { count: 0, windowStart: now },
        daily: { count: 0, windowStart: now },
      });
    }
    return this.counters.get(providerName);
  }

  recordCall(providerName) {
    const windows = this._windows(providerName);
    const now = this._now();
    if (now - windows.hourly.windowStart >= HOUR_MS) windows.hourly = { count: 0, windowStart: now };
    if (now - windows.daily.windowStart >= DAY_MS) windows.daily = { count: 0, windowStart: now };
    windows.hourly.count += 1;
    windows.daily.count += 1;
  }

  isLimited(providerName, { hourly, daily } = {}) {
    const windows = this._windows(providerName);
    const now = this._now();
    const hourlyCount = now - windows.hourly.windowStart >= HOUR_MS ? 0 : windows.hourly.count;
    const dailyCount = now - windows.daily.windowStart >= DAY_MS ? 0 : windows.daily.count;
    if (hourly != null && hourlyCount >= hourly) return true;
    if (daily != null && dailyCount >= daily) return true;
    return false;
  }
}
