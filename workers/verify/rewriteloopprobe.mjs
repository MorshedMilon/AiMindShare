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
  assert(typeof result.finalScore === "number", "autoRewriteLoop's finalScore is a number, not a raw checkOriginality result");

  const report = JSON.parse(readFileSync(TEST_REPORT_PATH, "utf8"));
  assert(report.length === 1, "autoRewriteLoop appends exactly one run record to the report file");
  assert(report[0].passed === true && Array.isArray(report[0].attempts),
    "the report record has passed + attempts");
  assert(typeof report[0].finalScore === "number", "the persisted report record's finalScore is also a number");

  rmSync(TEST_REPORT_PATH);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
