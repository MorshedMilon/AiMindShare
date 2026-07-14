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

const DEFAULT_SENTENCE_THRESHOLD = 0.5;

function scorePlagiarism(sentences, corpus, sentenceThreshold) {
  const flagged = [];
  sentences.forEach((sentence, index) => {
    let bestScore = 0;
    let bestSource = null;

    if (corpus && corpus.length > 0) {
      for (const doc of corpus) {
        for (const corpusSentence of splitSentences(doc.text)) {
          const score = cosineSimilarity(sentence, corpusSentence);
          if (score > bestScore) { bestScore = score; bestSource = doc.id; }
        }
      }
    } else {
      sentences.forEach((other, otherIndex) => {
        if (otherIndex === index) return;
        const score = cosineSimilarity(sentence, other);
        if (score > bestScore) { bestScore = score; bestSource = "internal-duplicate"; }
      });
    }

    if (bestScore >= sentenceThreshold) {
      flagged.push({ sentence, score: bestScore, matchedSource: bestSource });
    }
  });

  const totalWords = sentences.reduce((sum, s) => sum + tokenize(s).length, 0);
  const flaggedWords = flagged.reduce((sum, f) => sum + tokenize(f.sentence).length, 0);
  const plagiarismScore = totalWords === 0 ? 0 : Math.round((100 * flaggedWords) / totalWords);

  return { plagiarismScore, flaggedSentences: flagged };
}

export async function checkOriginality(text, config = {}) {
  const { tier, provider } = resolveProvider("plagiarism", config);

  if (tier === "paid") {
    await logProviderUsage("plagiarism", provider.name, { tier, unavailable: true });
    return {
      plagiarismScore: null, aiLikelihoodScore: null, flaggedSentences: [],
      provider: provider.name, unavailable: true, reason: "adapter_not_implemented",
    };
  }

  const sentences = splitSentences(text);
  const sentenceThreshold = config.sentenceThreshold ?? DEFAULT_SENTENCE_THRESHOLD;
  const { plagiarismScore, flaggedSentences } = scorePlagiarism(sentences, config.corpus, sentenceThreshold);

  await logProviderUsage("plagiarism", provider.name, { tier, plagiarismScore });

  return { plagiarismScore, aiLikelihoodScore: 0, flaggedSentences, provider: provider.name };
}
