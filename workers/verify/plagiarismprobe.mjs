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

console.log(`\n${pass} passed, ${fail} failed`);
