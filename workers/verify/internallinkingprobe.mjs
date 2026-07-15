// internallinkingprobe.mjs — pure unit tests for providers/embeddings.js and
// seo/internal-linking.mjs. No network, no real model download: embeddings
// are always supplied via an injected pipelineFactory/embedFn.
import { rmSync, existsSync as existsSyncForTest, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { embed } from "../providers/embeddings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

console.log("══ workers/providers/embeddings.js — embed() ══");

const fakeVector = [0.1, 0.2, 0.3];
const fakePipelineFactory = async () => async (text, opts) => ({ data: Float32Array.from(fakeVector) });

const EMBED_TEST_LOG_PATH = path.join(__dirname, "embeddings-usage-test.json");
if (existsSyncForTest(EMBED_TEST_LOG_PATH)) rmSync(EMBED_TEST_LOG_PATH);

{
  const vector = await embed("hello world", {}, { pipelineFactory: fakePipelineFactory, logPath: EMBED_TEST_LOG_PATH });
  assert(Array.isArray(vector) && vector.length === 3, "embed() free tier returns a plain array from the injected pipeline");
  assert(Math.abs(vector[0] - 0.1) < 1e-4, "embed() free tier returns the pipeline's actual values");
}
{
  const entries = JSON.parse(readFileSync(EMBED_TEST_LOG_PATH, "utf8"));
  assert(entries.length === 1 && entries[0].provider === "xenova-transformers" && entries[0].tier === "free",
    "embed() logs usage against the xenova-transformers free provider");
}
{
  let threw = false, message = "";
  try {
    await embed("hello", { apiKey: "sk-test", provider: "openai" }, { logPath: EMBED_TEST_LOG_PATH });
  } catch (e) { threw = true; message = e.message; }
  assert(threw && /openai embeddings not implemented yet/.test(message),
    "embed() throws for the registered-but-unimplemented openai paid provider");
}
{
  let threw = false, message = "";
  try {
    await embed("hello", { apiKey: "sk-test", provider: "cohere" }, { logPath: EMBED_TEST_LOG_PATH });
  } catch (e) { threw = true; message = e.message; }
  assert(threw && /cohere embeddings not implemented yet/.test(message),
    "embed() throws for the registered-but-unimplemented cohere paid provider");
}
{
  const entries = JSON.parse(readFileSync(EMBED_TEST_LOG_PATH, "utf8"));
  assert(entries.length === 3, "embed() logs usage even for the paid not-implemented throws");
}
rmSync(EMBED_TEST_LOG_PATH);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
