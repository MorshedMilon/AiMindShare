// llmprobe.mjs — pure unit tests for workers/llm.mjs. No network, no PGlite: a fake
// `db` stub and a fake `fetchImpl` are injected so this runs anywhere, instantly.
import { resolveAnthropicKey, callAnthropicForArticle } from "../llm.mjs";

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
