// llmprobe.mjs — pure unit tests for workers/llm.mjs. No network, no PGlite: a fake
// `db` stub and a fake `fetchImpl` are injected so this runs anywhere, instantly.
import { resolveAnthropicKey, callAnthropicForArticle } from "../llm.mjs";
import {
  generate_article_with_ai, buildArticleSystemPrompt, buildArticleUserPrompt, decidePublishStep,
} from "../../frontend/js/blog-pipeline.mjs";

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

console.log("══ workers/llm.mjs — Vault key resolution + Anthropic call ══");

{
  const db = fakeDb({ "ws_11111111-1111-1111-1111-111111111111__anthropic__api_key": "ws-key" });
  const key = await resolveAnthropicKey(db, "11111111-1111-1111-1111-111111111111");
  assert(key === "ws-key", "resolveAnthropicKey prefers the workspace override");
}
{
  const db = fakeDb({ "plat__anthropic__api_key": "plat-key" });
  const key = await resolveAnthropicKey(db, "22222222-2222-2222-2222-222222222222");
  assert(key === "plat-key", "resolveAnthropicKey falls back to the platform default");
}
{
  const db = fakeDb({});
  const key = await resolveAnthropicKey(db, "33333333-3333-3333-3333-333333333333");
  assert(key === null, "resolveAnthropicKey returns null when neither secret exists");
}

{
  const db = fakeDb({});
  const result = await callAnthropicForArticle(db, "no-key-ws", "sys", "usr", "claude-sonnet-5");
  assert(result.kind === "unavailable" && result.reason === "no_key",
    "callAnthropicForArticle: no key → { kind: 'unavailable', reason: 'no_key' }");
}
{
  const db = fakeDb({ "plat__anthropic__api_key": "plat-key" });
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({ content: [{ text: "<h1>Real Article</h1><p>Body.</p>" }],
      usage: { input_tokens: 100, output_tokens: 400 } }),
  });
  const result = await callAnthropicForArticle(db, "ws", "sys", "usr", "claude-sonnet-5", fakeFetch);
  assert(result.kind === "html", "callAnthropicForArticle: happy path returns kind:'html'");
  assert(result.content_html === "<h1>Real Article</h1><p>Body.</p>", "happy path returns the exact HTML text");
  assert(result.tokensUsed === 500, "happy path sums input+output tokens");
  assert(result.model === "claude-sonnet-5", "happy path echoes the requested model");
}
{
  const db = fakeDb({ "plat__anthropic__api_key": "plat-key" });
  const fakeFetch = async () => ({ ok: false });
  const result = await callAnthropicForArticle(db, "ws", "sys", "usr", "claude-sonnet-5", fakeFetch);
  assert(result.kind === "unavailable" && result.reason === "provider_error",
    "callAnthropicForArticle: non-OK response → provider_error");
}
{
  const db = fakeDb({ "plat__anthropic__api_key": "plat-key" });
  const fakeFetch = async () => ({ ok: true, json: async () => ({ content: [{ text: "" }] }) });
  const result = await callAnthropicForArticle(db, "ws", "sys", "usr", "claude-sonnet-5", fakeFetch);
  assert(result.kind === "unavailable" && result.reason === "bad_response",
    "callAnthropicForArticle: empty text → bad_response");
}

console.log("\n══ blog-pipeline.mjs — generate_article_with_ai + decidePublishStep ══");

{
  const result = await generate_article_with_ai({ keyword: "best dua for anxiety" }, null);
  assert(result.kind === "unavailable" && result.reason === "no_key",
    "generate_article_with_ai: no callLlm function → unavailable/no_key");
}
{
  const callLlm = async () => ({ kind: "html", content_html: "<h1>Real</h1><p>Body</p>", tokensUsed: 300, model: "claude-sonnet-5" });
  const result = await generate_article_with_ai(
    { keyword: "best dua for anxiety", brief: { h2_sections: [], faqs: [] }, targetWordCount: 1200, brandVoice: "warm" },
    callLlm);
  assert(result.kind === "html" && result.content_html === "<h1>Real</h1><p>Body</p>",
    "generate_article_with_ai: happy path passes the LLM's HTML through unchanged");
}
{
  const callLlm = async () => ({ kind: "unavailable", reason: "timeout" });
  const result = await generate_article_with_ai({ keyword: "x" }, callLlm);
  assert(result.kind === "unavailable" && result.reason === "timeout",
    "generate_article_with_ai: propagates the callLlm's unavailable reason");
}
{
  const callLlm = async () => ({ kind: "html", content_html: "   " });
  const result = await generate_article_with_ai({ keyword: "x" }, callLlm);
  assert(result.kind === "unavailable" && result.reason === "bad_response",
    "generate_article_with_ai: blank HTML from the LLM is treated as bad_response");
}

const sys = buildArticleSystemPrompt("warm and respectful", 1200);
assert(sys.includes("warm and respectful") && sys.includes("1200"),
  "buildArticleSystemPrompt embeds the brand voice and target word count");
const usr = buildArticleUserPrompt("best dua for anxiety",
  { h2_sections: [{ h2: "What is dua?", points: ["define it"] }], faqs: [{ q: "Is dua required?" }] });
assert(usr.includes("best dua for anxiety") && usr.includes("What is dua?") && usr.includes("Is dua required?"),
  "buildArticleUserPrompt includes the keyword, outline, and FAQ questions");

// decidePublishStep — the IslamicInfo hard-gate invariant (D-191), unit-tested without a DB.
assert(decidePublishStep({ passes: false, autoPublish: true, reviewRequired: false }).step === "review",
  "decidePublishStep: below-threshold always routes to review, even with auto_publish on");
assert(decidePublishStep({ passes: true, autoPublish: true, reviewRequired: true }).step === "review",
  "decidePublishStep: reviewRequired forces review EVEN WHEN passes+autoPublish are both true");
assert(decidePublishStep({ passes: true, autoPublish: true, reviewRequired: true }).publish === false,
  "decidePublishStep: reviewRequired forces publish=false regardless of autoPublish");
assert(decidePublishStep({ passes: true, autoPublish: true, reviewRequired: false }).publish === true,
  "decidePublishStep: passes + autoPublish + no review-lock → publish=true");
assert(decidePublishStep({ passes: true, autoPublish: false, reviewRequired: false }).step === "review",
  "decidePublishStep: passes but autoPublish=false → review (existing M22-manual behaviour)");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
