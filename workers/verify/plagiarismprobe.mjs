// plagiarismprobe.mjs — pure unit tests for workers/providers/plagiarism.js. No
// network: the free tier is entirely local computation.
import { splitSentences, cosineSimilarity, checkOriginality } from "../providers/plagiarism.js";
import { rmSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

console.log("══ workers/providers/plagiarism.js — splitSentences + cosineSimilarity ══");

{
  const sentences = splitSentences("This is one. Is this two? Yes, this is three!");
  assert(sentences.length === 3, "splitSentences splits on . ! ? boundaries");
  assert(sentences[0] === "This is one.", "splitSentences keeps the original sentence text including punctuation");
}
{
  const a = cosineSimilarity("the quick brown fox jumps", "the quick brown fox jumps");
  assert(Math.abs(a - 1) < 0.001, "cosineSimilarity of identical text is ~1");
}
{
  const b = cosineSimilarity("the quick brown fox", "purple elephants dance quietly");
  assert(b < 0.1, "cosineSimilarity of unrelated text is ~0");
}

console.log("\n══ workers/providers/plagiarism.js — checkOriginality: plagiarismScore ══");

{
  const corpus = [{ id: "prior-article-1", text: "The quick brown fox jumps over the lazy dog every single morning." }];
  const result = await checkOriginality(
    "The quick brown fox jumps over the lazy dog every single morning. This second sentence is completely original content.",
    { corpus });
  assert(result.plagiarismScore > 0, "checkOriginality with a matching corpus sentence reports plagiarismScore > 0");
  assert(result.flaggedSentences.length === 1, "checkOriginality flags exactly the matching sentence");
  assert(result.flaggedSentences[0].matchedSource === "prior-article-1",
    "flagged sentence's matchedSource is the corpus entry's id");
}
{
  const result = await checkOriginality("Only one unique sentence here with no match.", { corpus: [{ id: "x", text: "Nothing like this at all." }] });
  assert(result.plagiarismScore === 0, "checkOriginality with a corpus but no match reports plagiarismScore === 0");
  assert(result.flaggedSentences.length === 0, "no corpus match means no flagged sentences");
}
{
  const result = await checkOriginality(
    "This sentence repeats verbatim in this text. Something else entirely different here. This sentence repeats verbatim in this text.");
  assert(result.plagiarismScore > 0, "checkOriginality with no corpus falls back to internal near-duplicate detection");
  assert(result.flaggedSentences.some((f) => f.matchedSource === "internal-duplicate"),
    "internal-duplicate detection tags matchedSource as 'internal-duplicate'");
}
{
  const result = await checkOriginality("Every sentence here is totally unrelated to every other one. Purple elephants dance in the moonlight. Quantum spreadsheets calculate joy.");
  assert(result.plagiarismScore === 0, "checkOriginality with no corpus and no internal repetition reports plagiarismScore === 0");
}
{
  const result = await checkOriginality("Anything.", { apiKey: "sk-test", provider: "copyleaks" });
  assert(result.unavailable === true && result.reason === "adapter_not_implemented",
    "checkOriginality with a selected-but-unimplemented paid provider returns an honest unavailable result, never a throw");
  assert(result.provider === "copyleaks" && result.plagiarismScore === null && result.aiLikelihoodScore === null,
    "the unavailable result names the selected provider and reports null scores rather than fake numbers");
}

console.log("\n══ workers/providers/plagiarism.js — checkOriginality: aiLikelihoodScore ══");

{
  const uniform = "This is text. This is text. This is text. This is text. This is text.";
  const varied = "Why did the fox run? Because dogs, cats, and thunderstorms all terrify it equally, especially past midnight when the neighborhood goes eerily silent except for one distant, half-broken wind chime.";
  const uniformResult = await checkOriginality(uniform);
  const variedResult = await checkOriginality(varied);
  assert(uniformResult.aiLikelihoodScore > variedResult.aiLikelihoodScore,
    "uniform sentence length + narrow vocabulary scores a higher aiLikelihoodScore than varied human-like text");
}
{
  const result = await checkOriginality("Just one sentence.");
  assert(result.aiLikelihoodScore >= 0 && result.aiLikelihoodScore <= 100,
    "aiLikelihoodScore stays within 0-100 even for a single-sentence input");
}

console.log(`\n${pass} passed, ${fail} failed`);
