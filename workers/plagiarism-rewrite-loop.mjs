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

  const lastAttempt = attempts[attempts.length - 1];
  const lastCheck = lastAttempt.after ?? lastAttempt.before;
  const finalScore = Math.max(lastCheck.plagiarismScore ?? 100, lastCheck.aiLikelihoodScore ?? 100);

  await appendReport(reportPath, {
    timestamp: new Date().toISOString(),
    attempts, finalScore, passed,
  });

  return { finalText: currentText, finalScore, attempts, passed };
}
