// embeddings.js — providers/embeddings adapter: resolves the "embeddings"
// capability via config/providers.js and runs the free tier locally with
// @xenova/transformers. Paid tiers (openai, cohere) are registered in
// PROVIDER_CONFIG but not implemented — see ../README-providers.md and
// docs/superpowers/specs/2026-07-13-sitemap-aware-internal-linking-design.md.

import { resolveProvider, logProviderUsage } from "../config/providers.js";

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

let cachedPipelinePromise = null;

async function defaultPipelineFactory() {
  const { pipeline } = await import("@xenova/transformers");
  return pipeline("feature-extraction", MODEL_NAME);
}

async function getPipeline(pipelineFactory) {
  if (!cachedPipelinePromise) {
    cachedPipelinePromise = (pipelineFactory ?? defaultPipelineFactory)();
  }
  return cachedPipelinePromise;
}

export async function embed(text, config = {}, { pipelineFactory, logPath } = {}) {
  const { tier, provider } = resolveProvider("embeddings", config);

  if (tier === "paid") {
    await logProviderUsage("embeddings", provider.name, { tier }, logPath);
    throw new Error(`${provider.name} embeddings not implemented yet`);
  }

  const pipe = await getPipeline(pipelineFactory);
  const output = await pipe(text, { pooling: "mean", normalize: true });
  await logProviderUsage("embeddings", provider.name, { tier }, logPath);
  return Array.from(output.data);
}
