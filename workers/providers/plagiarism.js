// plagiarism.js — capability adapter for "plagiarism": local TF-IDF
// cosine-similarity + burstiness/vocabulary-richness heuristic. Pure
// function of (text, config) — no Vault, no DB, no network. See
// ../README-providers.md and docs/superpowers/specs/2026-07-13-plagiarism-auto-rewrite-design.md.
import { resolveProvider, logProviderUsage } from "../config/providers.js";

export function splitSentences(text) {
  return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [])
    .map((s) => s.trim())
    .filter(Boolean);
}

function tokenize(sentence) {
  return sentence
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean);
}

function termFrequency(tokens) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

export function cosineSimilarity(sentenceA, sentenceB) {
  const tokensA = tokenize(sentenceA);
  const tokensB = tokenize(sentenceB);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const tfA = termFrequency(tokensA);
  const tfB = termFrequency(tokensB);
  const vocab = new Set([...tfA.keys(), ...tfB.keys()]);

  let dot = 0, magA = 0, magB = 0;
  for (const term of vocab) {
    const a = tfA.get(term) ?? 0;
    const b = tfB.get(term) ?? 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// Placeholder only: plagiarismprobe.mjs imports checkOriginality via a named
// ESM import (Task 3+ tests use it), and Node throws a hard SyntaxError at
// link time if a named import has no matching export — this isn't a lazy
// "unused import" warning, the module fails to load at all without this.
// Real implementation lands in Task 3; do not call this yet.
export function checkOriginality() {
  throw new Error("checkOriginality is not implemented yet (see Task 3)");
}
