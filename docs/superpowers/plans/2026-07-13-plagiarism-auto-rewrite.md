# Plagiarism Check + Auto-Rewrite Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a free, dependency-free local plagiarism/AI-detection checker (`checkOriginality`) as the first real `plagiarism` capability adapter on the provider abstraction layer, plus a Claude-powered `autoRewriteLoop` that rewrites flagged content until it passes a threshold or attempts run out.

**Architecture:** `workers/providers/plagiarism.js` is a pure adapter (TF-IDF cosine similarity + a burstiness/vocabulary-richness heuristic, routed through the existing `resolveProvider`/`logProviderUsage`). `workers/plagiarism-rewrite-loop.mjs` is a thin orchestrator on top of it that reuses `callAnthropicForArticle` from `workers/llm.mjs` unchanged and writes a JSON audit trail.

**Tech Stack:** Plain Node.js ESM (`workers/` package, `"type": "module"`), no new npm dependencies. Follows this repo's existing no-framework probe convention (`workers/verify/*.mjs`).

---

## Task 1: Update `PROVIDER_CONFIG.plagiarism` to a real free adapter + BYOK slots

**Files:**
- Modify: `workers/config/providers.js:23-30`
- Modify: `workers/verify/providersprobe.mjs:31-35`

- [ ] **Step 1: Update the failing assertion first (TDD — this test currently pins the old stub)**

In `workers/verify/providersprobe.mjs`, replace lines 31-35:

```js
{
  const result = resolveProvider("plagiarism", {});
  assert(result.tier === "free" && result.provider.name === "local-tfidf",
    "resolveProvider('plagiarism', {}) resolves to the local-tfidf free default");
}
```

- [ ] **Step 2: Run the probe to verify it now fails**

Run: `cd workers && node verify/providersprobe.mjs`
Expected: FAIL on `resolveProvider('plagiarism', {}) resolves to the local-tfidf free default` (still returns `name: "none"`).

- [ ] **Step 3: Update `PROVIDER_CONFIG.plagiarism`**

In `workers/config/providers.js`, replace lines 23-30:

```js
  plagiarism: {
    free: {
      name: "local-tfidf",
      envVar: null,
      description: "Local TF-IDF cosine-similarity + burstiness/vocabulary-richness heuristic — no external API, no key.",
    },
    paid: [
      { name: "copyleaks", envVar: "COPYLEAKS_API_KEY", description: "Copyleaks plagiarism/AI-detection API (BYOK, adapter not yet implemented)." },
      { name: "originality", envVar: "ORIGINALITY_API_KEY", description: "Originality.ai plagiarism/AI-detection API (BYOK, adapter not yet implemented)." },
      { name: "gptzero", envVar: "GPTZERO_API_KEY", description: "GPTZero AI-detection API (BYOK, adapter not yet implemented)." },
      { name: "winston", envVar: "WINSTON_API_KEY", description: "Winston AI plagiarism/AI-detection API (BYOK, adapter not yet implemented)." },
    ],
  },
```

- [ ] **Step 4: Run the probe — it will now fail on the CAPABILITIES loop**

Run: `cd workers && node verify/providersprobe.mjs`
Expected: `33 passed, 1 failed` — `plagiarism.paid` now has 4 entries instead of 0, so the probe's blanket `paid.length === 0` loop assertion (line 20-21) fails for `"plagiarism"`. Fix it next: that per-capability loop assertion needs `plagiarism` excluded, since it's the one capability that intentionally ships pre-registered paid slots.

Update the loop in `workers/verify/providersprobe.mjs` (around line 16-24):

```js
const CAPABILITIES = ["seoAudit", "plagiarism", "embeddings", "webSearch", "imageGen"];
for (const capability of CAPABILITIES) {
  assert(Object.prototype.hasOwnProperty.call(PROVIDER_CONFIG, capability),
    `PROVIDER_CONFIG has a "${capability}" entry`);
  if (capability === "plagiarism") {
    assert(PROVIDER_CONFIG.plagiarism.paid.length === 4,
      `PROVIDER_CONFIG.plagiarism.paid has its 4 registered BYOK slots`);
  } else {
    assert(Array.isArray(PROVIDER_CONFIG[capability].paid) && PROVIDER_CONFIG[capability].paid.length === 0,
      `PROVIDER_CONFIG.${capability}.paid starts empty`);
  }
  assert(typeof PROVIDER_CONFIG[capability].free.name === "string",
    `PROVIDER_CONFIG.${capability}.free has a name`);
}
```

Also add one more assertion after the `resolveProvider("plagiarism", {})` block (after the new Step 1 code) to confirm the ambiguous-selection path is real for plagiarism now (not just simulated for seoAudit like the existing test at line 61-81):

```js
{
  let ambiguousMessage = "";
  try { resolveProvider("plagiarism", { apiKey: "sk-test" }); } catch (e) { ambiguousMessage = e.message; }
  assert(/ambiguous/i.test(ambiguousMessage),
    "resolveProvider('plagiarism', {apiKey}) is ambiguous across 4 registered BYOK slots without a provider name");

  const result = resolveProvider("plagiarism", { apiKey: "sk-test", provider: "gptzero" });
  assert(result.tier === "paid" && result.provider.name === "gptzero",
    "resolveProvider('plagiarism', {apiKey, provider: 'gptzero'}) resolves to the named paid slot");
}
```

Run: `cd workers && node verify/providersprobe.mjs`
Expected: `36 passed, 0 failed` (34 original + the 2 new ambiguous/named-paid assertions above; the loop-assertion count is unchanged since it swaps one condition for another rather than adding a new assertion).

- [ ] **Step 5: Commit**

```bash
git add workers/config/providers.js workers/verify/providersprobe.mjs
git commit -m "feat(providers): register local-tfidf as the plagiarism free default + 4 BYOK slots"
```

---

## Task 2: TF-IDF cosine-similarity core + sentence splitting

**Files:**
- Create: `workers/providers/plagiarism.js`
- Create: `workers/verify/plagiarismprobe.mjs`

- [ ] **Step 1: Write the failing test for sentence splitting and cosine similarity**

Create `workers/verify/plagiarismprobe.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers && node verify/plagiarismprobe.mjs`
Expected: FAIL with a module-not-found error (`workers/providers/plagiarism.js` doesn't exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `workers/providers/plagiarism.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers && node verify/plagiarismprobe.mjs`
Expected: `4 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add workers/providers/plagiarism.js workers/verify/plagiarismprobe.mjs
git commit -m "feat(plagiarism): add sentence splitting + TF-IDF cosine similarity core"
```

---

## Task 3: `checkOriginality` — plagiarism score (corpus + internal-duplicate paths)

**Files:**
- Modify: `workers/providers/plagiarism.js`
- Modify: `workers/verify/plagiarismprobe.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `workers/verify/plagiarismprobe.mjs` (before the final `console.log(pass/fail)` line — there isn't one yet, add it in Step 4 below; for now just append these blocks after the existing three):

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers && node verify/plagiarismprobe.mjs`
Expected: FAIL — `checkOriginality` isn't exported yet.

- [ ] **Step 3: Implement `checkOriginality`'s plagiarism-score half**

Append to `workers/providers/plagiarism.js`:

```js
const DEFAULT_SENTENCE_THRESHOLD = 0.5;

function scorePlagiarism(sentences, corpus, sentenceThreshold) {
  const flagged = [];
  for (const sentence of sentences) {
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
      for (const other of sentences) {
        if (other === sentence) continue;
        const score = cosineSimilarity(sentence, other);
        if (score > bestScore) { bestScore = score; bestSource = "internal-duplicate"; }
      }
    }

    if (bestScore >= sentenceThreshold) {
      flagged.push({ sentence, score: bestScore, matchedSource: bestSource });
    }
  }

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
```

(`aiLikelihoodScore: 0` is a placeholder overwritten in Task 4 — do not leave this after Task 4 lands.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers && node verify/plagiarismprobe.mjs`
Expected: `14 passed, 0 failed` (4 from Task 2 + 10 new assertions above).

- [ ] **Step 5: Commit**

```bash
git add workers/providers/plagiarism.js workers/verify/plagiarismprobe.mjs
git commit -m "feat(plagiarism): implement checkOriginality's plagiarismScore (corpus + internal-duplicate)"
```

---

## Task 4: `checkOriginality` — AI-likelihood heuristic (burstiness + vocabulary richness)

**Files:**
- Modify: `workers/providers/plagiarism.js`
- Modify: `workers/verify/plagiarismprobe.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `workers/verify/plagiarismprobe.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers && node verify/plagiarismprobe.mjs`
Expected: FAIL on the uniform-vs-varied comparison (both currently return `0` from the Task 3 placeholder).

- [ ] **Step 3: Implement the heuristic**

In `workers/providers/plagiarism.js`, add this function (near `scorePlagiarism`):

```js
function scoreAiLikelihood(sentences) {
  if (sentences.length === 0) return 0;

  const lengths = sentences.map((s) => tokenize(s).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / lengths.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = mean === 0 ? 0 : stdDev / mean;
  const burstinessSignal = 1 - Math.min(Math.max(coefficientOfVariation, 0), 1);

  const allTokens = sentences.flatMap((s) => tokenize(s));
  const uniqueTokens = new Set(allTokens);
  const typeTokenRatio = allTokens.length === 0 ? 0 : uniqueTokens.size / allTokens.length;
  const vocabSignal = 1 - Math.min(Math.max(typeTokenRatio, 0), 1);

  return Math.round(100 * (0.5 * burstinessSignal + 0.5 * vocabSignal));
}
```

Then update `checkOriginality`'s body — replace `aiLikelihoodScore: 0` with a real computed value:

```js
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
  const aiLikelihoodScore = scoreAiLikelihood(sentences);

  await logProviderUsage("plagiarism", provider.name, { tier, plagiarismScore, aiLikelihoodScore });

  return { plagiarismScore, aiLikelihoodScore, flaggedSentences, provider: provider.name };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers && node verify/plagiarismprobe.mjs`
Expected: `16 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add workers/providers/plagiarism.js
git commit -m "feat(plagiarism): add burstiness + vocabulary-richness aiLikelihoodScore heuristic"
```

---

## Task 5: `logProviderUsage` call verification (explicit requirement)

**Files:**
- Modify: `workers/verify/plagiarismprobe.mjs`

- [ ] **Step 1: Write the failing test**

Append to `workers/verify/plagiarismprobe.mjs`:

```js
console.log("\n══ workers/providers/plagiarism.js — logProviderUsage integration ══");

{
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const TEST_LOG_PATH = path.join(__dirname, "plagiarism-usage-test.json");
  if (existsSync(TEST_LOG_PATH)) rmSync(TEST_LOG_PATH);

  // checkOriginality doesn't take a logPath override today, so this test
  // instead confirms the *default* usage log (workers/config/provider-usage.json)
  // gains one new "plagiarism" entry per call — the same convention every other
  // provider follows.
  const usageLogPath = path.join(__dirname, "..", "config", "provider-usage.json");
  const before = existsSync(usageLogPath) ? JSON.parse(readFileSync(usageLogPath, "utf8")).length : 0;
  await checkOriginality("One plain sentence for logging purposes.");
  const after = JSON.parse(readFileSync(usageLogPath, "utf8")).length;
  assert(after === before + 1, "checkOriginality appends exactly one entry to the default provider-usage.json log");

  const entries = JSON.parse(readFileSync(usageLogPath, "utf8"));
  const last = entries[entries.length - 1];
  assert(last.capability === "plagiarism" && last.provider === "local-tfidf" && last.tier === "free",
    "the logged entry has capability/provider/tier set correctly");
}
```

- [ ] **Step 2: Run test to verify it passes (this should already pass — Task 3/4 already wired `logProviderUsage` in)**

Run: `cd workers && node verify/plagiarismprobe.mjs`
Expected: `18 passed, 0 failed`. If it fails, re-check Task 3 Step 3's `logProviderUsage` call is actually present in `checkOriginality`.

- [ ] **Step 3: Commit**

```bash
git add workers/verify/plagiarismprobe.mjs
git commit -m "test(plagiarism): verify checkOriginality logs usage via logProviderUsage"
```

---

## Task 6: `autoRewriteLoop` — happy path (score improves, stops early)

**Files:**
- Create: `workers/plagiarism-rewrite-loop.mjs`
- Create: `workers/verify/rewriteloopprobe.mjs`

- [ ] **Step 1: Write the failing test**

Create `workers/verify/rewriteloopprobe.mjs`:

```js
// rewriteloopprobe.mjs — pure unit tests for workers/plagiarism-rewrite-loop.mjs.
// No network: a fake fetchImpl stands in for the Anthropic call (same seam
// callAnthropicForArticle already exposes), and a fake db stands in for Vault.
import { autoRewriteLoop } from "../plagiarism-rewrite-loop.mjs";
import { rmSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

function fakeDb(secrets) {
  return {
    schema() {
      return {
        from() {
          return {
            select() { return this; },
            eq(_col, name) { this._name = name; return this; },
            async maybeSingle() {
              const v = secrets[this._name];
              return { data: v ? { decrypted_secret: v } : null, error: null };
            },
          };
        },
      };
    },
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_REPORT_PATH = path.join(__dirname, "rewrite-report-test.json");

console.log("══ workers/plagiarism-rewrite-loop.mjs — autoRewriteLoop happy path ══");

{
  if (existsSync(TEST_REPORT_PATH)) rmSync(TEST_REPORT_PATH);
  const db = fakeDb({ "plat__anthropic__api_key": "plat-key" });

  const corpus = [{ id: "prior-1", text: "The quick brown fox jumps over the lazy dog every single morning." }];
  const text = "The quick brown fox jumps over the lazy dog every single morning. This part is fine.";

  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({
      content: [{ text: "A completely rewritten sentence about a swift auburn animal leaping past a sleepy hound." }],
      usage: { input_tokens: 50, output_tokens: 50 },
    }),
  });

  const result = await autoRewriteLoop(text, 3, {
    db, workspaceId: "ws", model: "claude-sonnet-5", corpus, threshold: 30,
    fetchImpl: fakeFetch, reportPath: TEST_REPORT_PATH,
  });

  assert(result.passed === true, "autoRewriteLoop passes once the rewrite drops the score below threshold");
  assert(result.attempts.length === 1, "autoRewriteLoop stops after 1 attempt when the rewrite already passes");
  assert(result.finalText.includes("swift auburn animal"), "autoRewriteLoop's finalText includes the rewritten sentence");
  assert(!result.finalText.includes("The quick brown fox jumps over the lazy dog"),
    "autoRewriteLoop's finalText no longer contains the original flagged sentence");

  const report = JSON.parse(readFileSync(TEST_REPORT_PATH, "utf8"));
  assert(report.length === 1, "autoRewriteLoop appends exactly one run record to the report file");
  assert(report[0].passed === true && Array.isArray(report[0].attempts),
    "the report record has passed + attempts");

  rmSync(TEST_REPORT_PATH);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers && node verify/rewriteloopprobe.mjs`
Expected: FAIL — `workers/plagiarism-rewrite-loop.mjs` doesn't exist.

- [ ] **Step 3: Write the minimal implementation**

Create `workers/plagiarism-rewrite-loop.mjs`:

```js
// plagiarism-rewrite-loop.mjs — orchestrates checkOriginality + Claude rewrites
// until the score passes a threshold or attempts run out. Reuses
// callAnthropicForArticle from llm.mjs unchanged (same Vault convention).
// `fetchImpl`/`reportPath` are injectable so rewriteloopprobe.mjs runs with
// zero network calls and a throwaway report file.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkOriginality } from "./providers/plagiarism.js";
import { callAnthropicForArticle } from "./llm.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPORT_PATH = path.join(__dirname, "config", "plagiarism-rewrite-report.json");
const DEFAULT_THRESHOLD = 30;

function buildRewriteSystemPrompt() {
  return "You rewrite flagged sentences to reduce textual similarity and AI-detectability "
    + "while preserving their original meaning. Reply with exactly one rewritten sentence per "
    + "line, in the same order as given, and nothing else — no numbering, no commentary.";
}

function buildRewriteUserPrompt(flaggedSentences) {
  return flaggedSentences.map((f) => f.sentence).join("\n");
}

async function rewriteFlaggedSentences(flaggedSentences, { db, workspaceId, model, fetchImpl }) {
  const result = await callAnthropicForArticle(
    db, workspaceId,
    buildRewriteSystemPrompt(),
    buildRewriteUserPrompt(flaggedSentences),
    model, fetchImpl);

  if (result.kind !== "html") return null;

  const lines = result.content_html.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length !== flaggedSentences.length) return null;

  return lines;
}

async function appendReport(reportPath, record) {
  let entries = [];
  if (existsSync(reportPath)) {
    try {
      entries = JSON.parse(await readFile(reportPath, "utf8"));
    } catch {
      entries = [];
    }
  }
  entries.push(record);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(entries, null, 2));
}

export async function autoRewriteLoop(text, maxAttempts = 3, config = {}) {
  const threshold = config.threshold ?? DEFAULT_THRESHOLD;
  const reportPath = config.reportPath ?? DEFAULT_REPORT_PATH;

  let currentText = text;
  const attempts = [];
  let passed = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const before = await checkOriginality(currentText, config);
    const beforeScore = Math.max(before.plagiarismScore ?? 100, before.aiLikelihoodScore ?? 100);

    if (beforeScore <= threshold) {
      attempts.push({ attempt, before, after: before, rewroteCount: 0 });
      passed = true;
      break;
    }

    if (attempt === maxAttempts) {
      attempts.push({ attempt, before, after: null, rewroteCount: 0 });
      break;
    }

    const rewrites = await rewriteFlaggedSentences(before.flaggedSentences, {
      db: config.db, workspaceId: config.workspaceId, model: config.model, fetchImpl: config.fetchImpl,
    });

    if (!rewrites) {
      attempts.push({ attempt, before, after: null, rewroteCount: 0 });
      break;
    }

    for (let i = 0; i < before.flaggedSentences.length; i++) {
      currentText = currentText.replace(before.flaggedSentences[i].sentence, rewrites[i]);
    }

    const after = await checkOriginality(currentText, config);
    attempts.push({ attempt, before, after, rewroteCount: rewrites.length });

    const afterScore = Math.max(after.plagiarismScore ?? 100, after.aiLikelihoodScore ?? 100);
    if (afterScore <= threshold) { passed = true; break; }
  }

  const finalScore = attempts[attempts.length - 1].after ?? attempts[attempts.length - 1].before;

  await appendReport(reportPath, {
    timestamp: new Date().toISOString(),
    attempts, finalScore, passed,
  });

  return { finalText: currentText, finalScore, attempts, passed };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers && node verify/rewriteloopprobe.mjs`
Expected: `6 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add workers/plagiarism-rewrite-loop.mjs workers/verify/rewriteloopprobe.mjs
git commit -m "feat(plagiarism): add autoRewriteLoop happy path (Claude-batched rewrite + report log)"
```

---

## Task 7: `autoRewriteLoop` — exhausts attempts, Claude unavailable, and mismatched rewrite count

**Files:**
- Modify: `workers/verify/rewriteloopprobe.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `workers/verify/rewriteloopprobe.mjs`:

```js
console.log("\n══ workers/plagiarism-rewrite-loop.mjs — non-happy paths ══");

{
  if (existsSync(TEST_REPORT_PATH)) rmSync(TEST_REPORT_PATH);
  const db = fakeDb({ "plat__anthropic__api_key": "plat-key" });
  const corpus = [{ id: "prior-1", text: "The quick brown fox jumps over the lazy dog every single morning." }];
  const text = "The quick brown fox jumps over the lazy dog every single morning.";

  // Every rewrite comes back identical to the original — score never improves.
  const noImprovementFetch = async () => ({
    ok: true,
    json: async () => ({
      content: [{ text: "The quick brown fox jumps over the lazy dog every single morning." }],
      usage: { input_tokens: 10, output_tokens: 10 },
    }),
  });

  const result = await autoRewriteLoop(text, 2, {
    db, workspaceId: "ws", model: "claude-sonnet-5", corpus, threshold: 30,
    fetchImpl: noImprovementFetch, reportPath: TEST_REPORT_PATH,
  });

  assert(result.passed === false, "autoRewriteLoop reports passed:false when the score never improves");
  assert(result.attempts.length === 2, "autoRewriteLoop stops at maxAttempts (2) rather than looping forever");
  rmSync(TEST_REPORT_PATH);
}
{
  if (existsSync(TEST_REPORT_PATH)) rmSync(TEST_REPORT_PATH);
  const db = fakeDb({}); // no Vault secret at all -> callAnthropicForArticle returns unavailable/no_key
  const corpus = [{ id: "prior-1", text: "The quick brown fox jumps over the lazy dog every single morning." }];
  const text = "The quick brown fox jumps over the lazy dog every single morning.";

  const result = await autoRewriteLoop(text, 3, {
    db, workspaceId: "ws", model: "claude-sonnet-5", corpus, threshold: 30,
    reportPath: TEST_REPORT_PATH,
  });

  assert(result.passed === false, "autoRewriteLoop reports passed:false when Claude is unavailable (no key)");
  assert(result.finalText === text, "autoRewriteLoop keeps the original text when no rewrite could be applied");
  assert(result.attempts.length === 1, "autoRewriteLoop aborts on the first attempt when Claude is unavailable, rather than retrying uselessly");
  rmSync(TEST_REPORT_PATH);
}
{
  if (existsSync(TEST_REPORT_PATH)) rmSync(TEST_REPORT_PATH);
  const db = fakeDb({ "plat__anthropic__api_key": "plat-key" });
  const corpus = [{ id: "prior-1", text: "The quick brown fox jumps over the lazy dog every single morning." }];
  const text = "The quick brown fox jumps over the lazy dog every single morning.";

  // Claude replies with 2 lines when only 1 sentence was flagged -> mismatched count.
  const mismatchedFetch = async () => ({
    ok: true,
    json: async () => ({
      content: [{ text: "First rewritten line.\nSecond unexpected line." }],
      usage: { input_tokens: 10, output_tokens: 10 },
    }),
  });

  const result = await autoRewriteLoop(text, 3, {
    db, workspaceId: "ws", model: "claude-sonnet-5", corpus, threshold: 30,
    fetchImpl: mismatchedFetch, reportPath: TEST_REPORT_PATH,
  });

  assert(result.passed === false, "autoRewriteLoop reports passed:false on a rewrite line-count mismatch");
  assert(result.finalText === text, "autoRewriteLoop discards a mismatched rewrite and keeps the prior text");
  rmSync(TEST_REPORT_PATH);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `cd workers && node verify/rewriteloopprobe.mjs`
Expected: Given the Task 6 implementation already handles all three cases (max-attempts exit, `rewrites === null` on unavailable/mismatch both abort the loop), this should already pass: `13 passed, 0 failed` (6 from Task 6 + 7 new assertions above). If any assertion fails, the likely gap is that `rewriteFlaggedSentences` returning `null` needs to break the loop immediately (already does, via the `if (!rewrites)` branch) — re-check that branch in `workers/plagiarism-rewrite-loop.mjs` before adding new code.

- [ ] **Step 3: Commit**

```bash
git add workers/verify/rewriteloopprobe.mjs
git commit -m "test(plagiarism-rewrite-loop): cover max-attempts, Claude-unavailable, and mismatched-rewrite paths"
```

---

## Task 8: Register probes in `scripts/verify.sh`

**Files:**
- Modify: `scripts/verify.sh:109` (after the existing providersprobe line)

- [ ] **Step 1: Add the two new probes to verify.sh**

After the existing block (around line 108-109):

```bash
echo; echo "══ +  Provider abstraction layer: PROVIDER_CONFIG + resolveProvider + logProviderUsage + RateLimiter (unit, no network) ══"
( cd workers && node verify/providersprobe.mjs ) || fails=$((fails+1))
```

Add immediately after it:

```bash
echo; echo "══ +  Plagiarism/AI-detection adapter: local TF-IDF + burstiness heuristic (unit, no network) ══"
( cd workers && node verify/plagiarismprobe.mjs ) || fails=$((fails+1))

echo; echo "══ +  Auto-Rewrite Loop: checkOriginality + Claude rewrite orchestration (unit, no network) ══"
( cd workers && node verify/rewriteloopprobe.mjs ) || fails=$((fails+1))
```

- [ ] **Step 2: Run full verify.sh to confirm no regressions**

Run: `bash scripts/verify.sh`
Expected: All probes green, including the two new ones, with the overall `fails` counter at 0. (Some pre-existing unrelated failures may show per the M06/M16 note in memory — confirm no *new* failures were introduced by this change specifically.)

- [ ] **Step 3: Commit**

```bash
git add scripts/verify.sh
git commit -m "test: register plagiarismprobe + rewriteloopprobe in verify.sh"
```

---

## Task 9: Update `.gitignore` for the new report file

**Files:**
- Modify: `.gitignore:6` (root)

- [ ] **Step 1: Add the new gitignore entry**

In `.gitignore`, right after line 6 (`workers/config/provider-usage.json`):

```
workers/config/plagiarism-rewrite-report.json
```

- [ ] **Step 2: Verify it's actually ignored**

Run: `cd workers/config && touch plagiarism-rewrite-report.json && cd ../.. && git status --short workers/config/plagiarism-rewrite-report.json`
Expected: no output (file doesn't show as untracked). Then clean up: `rm workers/config/plagiarism-rewrite-report.json`.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore the plagiarism rewrite-loop report file"
```

---

## Task 10: Update `workers/README-providers.md`

**Files:**
- Modify: `workers/README-providers.md:21` (table row) and its "Adding a paid BYOK provider later" section

- [ ] **Step 1: Update the capabilities table row**

Replace line 21:

```
| `plagiarism` | Local TF-IDF cosine-similarity + burstiness/vocabulary-richness heuristic | — | no external API, no key; compares against a caller-supplied `corpus` if given, otherwise falls back to detecting internal near-duplicate sentences. 4 BYOK slots pre-registered (Copyleaks, Originality.ai, GPTZero, Winston AI) — no adapters implemented yet. |
```

- [ ] **Step 2: Add a short subsection documenting the corpus limitation and usage**

After the "## Usage" section (after line 43), insert:

```markdown
## Plagiarism check: what "local" means

`providers/plagiarism.js`'s `checkOriginality(text, config)` free tier never
calls out to the network. It can only compare `text` against:

- `config.corpus` (an array of `{ id, text }` reference documents you supply
  — e.g. previously-published articles), if given; or
- itself, falling back to internal near-duplicate sentence detection when no
  corpus is given.

It cannot detect matches against arbitrary content on the web. For that,
configure a paid BYOK provider (see below) once one is implemented.

`autoRewriteLoop(text, maxAttempts, config)` in
`plagiarism-rewrite-loop.mjs` wraps `checkOriginality` with a Claude-powered
rewrite step (reusing `llm.mjs`'s existing Vault-backed Anthropic caller) and
logs each run's before/after scores to `config/plagiarism-rewrite-report.json`.
```

- [ ] **Step 3: Commit**

```bash
git add workers/README-providers.md
git commit -m "docs(providers): document the local-tfidf plagiarism adapter + auto-rewrite loop"
```

---

## Task 11: Record D-194 in the DECISIONS log

**Files:**
- Modify: `DECISIONS-AiMindShare-v1_0.md` (append after `D-193`, around line 1533+; and update the running footer summary near the end of the file)

- [ ] **Step 1: Add the D-194 entry**

Find the end of the `D-193` entry (starts at line 1533) and insert a new entry immediately after it, before the closing `---` / footer section:

```markdown
## D-194 · Plagiarism/AI-detection check + Auto-Rewrite Loop — local-first, BYOK deferred · **LOCKED 2026-07-13**

Builds the first real `plagiarism` capability adapter on the already-merged provider
abstraction layer (`workers/config/providers.js`, D-193's out-of-scope note). The free
default (`local-tfidf`) is a dependency-free local TF-IDF cosine-similarity check —
compared against a caller-supplied `corpus` when given, otherwise falling back to
internal near-duplicate sentence detection — plus a burstiness/vocabulary-richness
heuristic for `aiLikelihoodScore`. Neither signal calls an external API or requires a
key; both are honest heuristics, not validated detectors, and this is documented in
`workers/README-providers.md`. `PROVIDER_CONFIG.plagiarism.paid` gains 4 registered-but-
unimplemented BYOK slots (Copyleaks, Originality.ai, GPTZero, Winston AI) — selecting one
today returns `{ unavailable: true, reason: 'adapter_not_implemented' }`, never a throw,
matching this repo's "unavailable, not broken" posture (D-063). `autoRewriteLoop`
(`workers/plagiarism-rewrite-loop.mjs`) orchestrates `checkOriginality` with a single
batched Claude rewrite call per iteration, reusing `callAnthropicForArticle`
(`workers/llm.mjs`, D-190) unchanged; it never throws on an unavailable Claude call or a
malformed rewrite, and it logs one before/after record per run to
`workers/config/plagiarism-rewrite-report.json` (gitignored, same read-modify-write
convention as `provider-usage.json`).
```

- [ ] **Step 2: Update the running footer summary**

Find the line ending `...then D-193 (M22 Generation Studio core pipeline, migration 0040_m22_generation_studio.sql),` near the end of the file and change it to:

```
then D-193 (M22 Generation Studio core pipeline, migration 0040_m22_generation_studio.sql)
then D-194 (Plagiarism/AI-detection check + Auto-Rewrite Loop, no migration — local-first,
BYOK deferred),
```

(Keep the trailing `5 OPEN. Append-only.` sentence and everything after it unchanged.)

- [ ] **Step 3: Commit**

```bash
git add DECISIONS-AiMindShare-v1_0.md
git commit -m "docs: record D-194 (plagiarism/AI-detection check + auto-rewrite loop)"
```

---

## Task 12: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run every new probe individually**

Run:
```bash
cd workers
node verify/providersprobe.mjs
node verify/plagiarismprobe.mjs
node verify/rewriteloopprobe.mjs
```
Expected: all three exit 0 with `N passed, 0 failed`.

- [ ] **Step 2: Run the full verify.sh suite**

Run: `bash scripts/verify.sh` (from repo root)
Expected: no new failures beyond any pre-existing unrelated ones already known (per project memory: some external M06/M16 gate-8 false positives may exist independent of this work — confirm nothing *new* broke).

- [ ] **Step 3: Confirm git status is clean aside from intentional changes**

Run: `git status --short`
Expected: only the pre-existing unrelated modified files from before this work started (`frontend/js/content-seo.mjs`, `frontend/js/m22-content.js`, `frontend/styles/m22-content.css`, `workers/verify/m22seoprobe.mjs`) remain uncommitted — everything from Tasks 1-11 is committed.
