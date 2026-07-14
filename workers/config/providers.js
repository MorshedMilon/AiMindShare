// providers.js — capability router: free-tier defaults now, BYOK for paid
// providers later. Standalone from supabase/functions/_shared/providers.ts
// (the M41 Credential Vault registry) — no shared code, no shared keys, no
// Vault/DB involvement. See ../README-providers.md.

export const PROVIDER_CONFIG = {
  seoAudit: {
    free: {
      name: "pagespeed",
      envVar: "PAGESPEED_API_KEY",
      description: "Google PageSpeed Insights API — free tier (~25,000 requests/day).",
    },
    paid: [],
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
      name: "pollinations",
      envVar: null,
      description: "Pollinations.ai — free, keyless image generation.",
    },
    paid: [],
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

  const paidProvider = userConfig.provider
    ? config.paid.find((p) => p.name === userConfig.provider)
    : config.paid.length === 1
      ? config.paid[0]
      : undefined;

  if (!paidProvider) {
    throw new Error(`resolveProvider: no paid provider configured for "${capability}" yet`);
  }

  return { capability, tier: "paid", provider: paidProvider };
}
