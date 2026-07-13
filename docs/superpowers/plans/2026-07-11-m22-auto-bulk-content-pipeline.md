# M22-auto — Real LLM Generation + Bulk Content Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve D-010 platform-wide, wire real Anthropic generation into the existing
M22-auto scaffold, seed the three real content sites with brand-voice/review gates, and
ship the Bulk Content Creation subsystem (batch builder, templates, preview, cost
estimate, spread-scheduling, status dashboard, bulk edit/reject, rollback).

**Architecture:** Almost everything reuses existing infrastructure rather than adding
new systems: the existing `jobs`/`worker.mjs` claim loop gets a real cron (GitHub
Actions) instead of a new runtime; the existing `generate_article_with_ai` stub in
`blog-pipeline.mjs` gets a real implementation via dependency injection (a new
`workers/llm.mjs` supplies the network call so `blog-pipeline.mjs` stays browser-safe);
bulk pacing extends the existing `advance_content_pipeline()` cron function rather than
adding a new quota table; bulk scheduling reuses the existing `publish_due_articles()`
cron. Net-new: two small tables (`content_templates`, `content_batch_jobs`), one
extended table (`content_queue` +3 columns), one new table for brand voice
(`site_brand_voice`), and one new frontend section.

**Tech Stack:** Postgres/Supabase (SQL migrations, PGlite-based probes), Node.js
(`workers/worker.mjs`, ESM), vanilla JS frontend (`frontend/js/m22-content.js`),
GitHub Actions (new).

**Deviations from the approved design doc** (both are engineering refinements found
necessary once the exact schema was inspected — see Task 11 and Task 12 for why):
1. Duplicate/cannibalization detection is **exact-keyword matching**, not pgvector
   cosine similarity — `blog_articles.embedding` has no writer anywhere in this
   codebase (confirmed dormant, D-124 scaffold); faking a semantic check would violate
   the codebase's established honest-scaffold posture (D-147).
2. The "separate bulk quota lane" is a **per-tick cap inside `advance_content_pipeline()`**,
   not a new `usage_events`-backed hourly counter table — cheaper and reuses a function
   that migration `0027` already established as evolvable via `create or replace`.

---

### Task 1: `worker.mjs` gains a `--max=N` batch-claim flag

**Files:**
- Modify: `workers/worker.mjs:30` (flag parsing), `workers/worker.mjs:966-977` (main loop)

- [ ] **Step 1: Read the current main-loop block to confirm line numbers before editing**

Run: `grep -n "const ONCE\|if (ONCE)" workers/worker.mjs`
Expected: matches at line 30 and around line 967 (confirms nothing has shifted since planning).

- [ ] **Step 2: Add the `--max` flag alongside the existing `--once` flag**

At `workers/worker.mjs:30`, change:
```js
const ONCE = process.argv.includes("--once");
```
to:
```js
const ONCE = process.argv.includes("--once");
const maxArg = process.argv.find((a) => a.startsWith("--max="));
const MAX = maxArg ? parseInt(maxArg.split("=")[1], 10) : null;
```

- [ ] **Step 3: Replace the main-loop block to respect `--max`**

Replace the existing block at `workers/worker.mjs:966-977`:
```js
if (ONCE) {
  const did = await processOne();
  if (!did) { console.error("no queued job to claim"); process.exit(1); }
  process.exit(0);
} else {
  console.log(`${WORKER_ID} polling for jobs…`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const did = await processOne();
    if (!did) await new Promise((r) => setTimeout(r, 1000));
  }
}
```
with:
```js
if (ONCE) {
  const did = await processOne();
  if (!did) { console.error("no queued job to claim"); process.exit(1); }
  process.exit(0);
} else if (MAX) {
  // Claim up to MAX jobs then exit cleanly — the mode a scheduled CI runner needs
  // (D-010/D-189): no infinite loop, no lingering process for the runner to kill.
  let claimedCount = 0;
  for (let i = 0; i < MAX; i++) {
    const did = await processOne();
    if (!did) break;
    claimedCount++;
  }
  console.log(`${WORKER_ID} processed ${claimedCount}/${MAX} job(s), exiting`);
  process.exit(0);
} else {
  console.log(`${WORKER_ID} polling for jobs…`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const did = await processOne();
    if (!did) await new Promise((r) => setTimeout(r, 1000));
  }
}
```

- [ ] **Step 4: Manually verify the new flag doesn't break existing modes**

Run: `node workers/worker.mjs --help 2>&1 | head -1 || true` — this repo has no `--help`
handler, so instead confirm syntax only: `node --check workers/worker.mjs`
Expected: no output (syntax valid). A live `--max=N` run against a real Supabase
project is exercised later by `scripts/verify.sh`'s existing live-stack check (Task 16) — this
codebase's convention is to NOT unit-test `worker.mjs`'s handlers directly (they're
tested via the RPCs/tables they call); follow that same convention here rather than
inventing a new mocking layer for the loop itself.

- [ ] **Step 5: Commit**

```bash
git add workers/worker.mjs
git commit -m "feat(m22): add --max=N batch-claim mode to worker.mjs for D-010"
```

---

### Task 2: GitHub Actions worker-cron workflow (resolves D-010, platform-wide)

**Files:**
- Create: `.github/workflows/worker-cron.yml`

- [ ] **Step 1: Create the workflow directory and file**

Run: `mkdir -p .github/workflows` (Bash) or `New-Item -ItemType Directory -Force .github/workflows` (PowerShell)

Create `.github/workflows/worker-cron.yml`:
```yaml
name: worker-cron

on:
  schedule:
    - cron: "*/5 * * * *"
  workflow_dispatch: {}

jobs:
  run-worker:
    runs-on: ubuntu-latest
    timeout-minutes: 4
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install worker dependencies
        working-directory: workers
        run: npm ci
      - name: Claim and process up to 10 jobs
        working-directory: workers
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: node worker.mjs --max=10
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/worker-cron.yml'))" || node -e "require('js-yaml') && console.log('use online validator')"`
Expected: no exception. If neither `python3`'s `yaml` module nor `js-yaml` is
available, visually re-check indentation instead (2-space, consistent) — this file has
no CI to validate itself until it's merged, so a syntax error would silently no-op
every 5 minutes rather than fail loudly. Double-check by eye against the block above.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/worker-cron.yml
git commit -m "feat: add GitHub Actions worker-cron workflow (resolves D-010)"
```

**Note for the user (not a plan step):** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
must be added as repository secrets (Settings → Secrets and variables → Actions)
before this workflow can run successfully — it will fail loudly (missing env var
exit code 2, per `worker.mjs`'s existing startup check) until then, which is safe.

---

### Task 3: Update DECISIONS + TASKS docs for D-010/D-189/D-190/D-191/D-192

**Files:**
- Modify: `DECISIONS-AiMindShare-v1_0.md:789-791`, `DECISIONS-AiMindShare-v1_0.md` (append after line 1473, the end of D-188)
- Modify: `TASKS.md:15`

- [ ] **Step 1: Resolve D-010 in place**

In `DECISIONS-AiMindShare-v1_0.md`, replace lines 789-791:
```
## D-010 · Heavy-job worker runtime · **OPEN**
GitHub Actions runners (PublishlyAI pattern) vs a small always-on VPS for heavy jobs (2,000-word
blog gen, 500-page crawls, bulk pin rendering). Blocks: Phase 3 auto-blog at scale, not Phase 1.
```
with:
```
## D-010 · Heavy-job worker runtime · **RESOLVED → GitHub Actions (see D-189, 2026-07-11)**
~~GitHub Actions runners (PublishlyAI pattern) vs a small always-on VPS for heavy jobs (2,000-word
blog gen, 500-page crawls, bulk pin rendering). Blocks: Phase 3 auto-blog at scale, not Phase 1.~~
Resolved at the M22-auto bulk pipeline round → **GitHub Actions**, `worker-cron.yml`. Platform-wide:
every module's dormant worker-tier job type (SEO crawls, pin rendering, weekly digests, CRM
dedupe, GDPR export/erase, automation execution, media auto-tagging, integration health checks)
becomes live the moment this workflow merges — see D-189.
```

- [ ] **Step 2: Append D-189 through D-192 after D-188 (currently ending at line 1473)**

Append to the end of `DECISIONS-AiMindShare-v1_0.md`:
```

## D-189 · Worker runtime → GitHub Actions worker-cron.yml (resolves D-010) · **LOCKED 2026-07-11**
Workflow-only, no migration: `.github/workflows/worker-cron.yml` runs `node workers/worker.mjs
--max=10` every 5 minutes against repo secrets `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`.
`worker.mjs` gains a `--max=N` flag (claim/process up to N jobs, then exit) alongside the existing
`--once`. Stale leases are already reclaimed by the core `*/1 * * * *` sweeper — no new reclaim
logic needed. Chosen over a small always-on VPS because it needs zero new infrastructure and
matches the "PublishlyAI pattern" D-010 already named.

## D-190 · M22-auto real LLM generation wiring · **LOCKED 2026-07-11**
Migration `0039_m22_bulk.sql`. `blog-pipeline.mjs`'s documented `generate_article_with_ai(ctx,
callLlm)` stub is implemented for real via dependency injection: a new `workers/llm.mjs` (mirrors
`_shared/llm.ts`'s Vault convention) supplies the actual Anthropic call, keeping
`blog-pipeline.mjs` network-free and browser-importable. Default model **claude-sonnet-5**
(long-form quality bar is higher than M20's funnel-copy use of Haiku); `claude-3-5-haiku-20241022`
selectable per schedule/batch. `ai_tokens` is metered on the LLM call itself (platform convention,
same as D-186), never on a later approval step. `blog_articles` gains
`generation_source`/`llm_model`/`tokens_used` (mirrors D-186's `funnel_blueprints` columns
exactly). No key configured → automatic fallback to the existing deterministic
`build_article_html` path, never a hard error.

## D-191 · IslamicInfo.org mandatory human review — server-side, not UI-only · **LOCKED 2026-07-11**
Migration `0039_m22_bulk.sql`. New `site_brand_voice.review_required` column, enforced two ways:
(1) a `decidePublishStep()` pure function in `blog-pipeline.mjs`, called by `worker.mjs`'s
`blog.generate` handler, forces `step='review'` whenever `review_required=true` regardless of
`content_schedules.auto_publish` or quality-gate scores; (2) a database trigger
`enforce_review_lock()` rejects any `site_brand_voice` row update that sets
`review_required=false` for a site whose `sites.style_preset='islamic'`. Neither guarantee
depends on the UI — a bulk job, a misconfigured schedule, or a direct RPC call cannot bypass
either layer.

## D-192 · Bulk Content Creation architecture — extend, don't duplicate · **LOCKED 2026-07-11**
Migration `0039_m22_bulk.sql`. Two new tables only: `content_templates` (variable-slot prompt
templates) and `content_batch_jobs` (batch metadata, topics stored inline as jsonb — no separate
staging table). `content_queue` gets three new columns (`batch_job_id`, `template_id`,
`variables`) via the same `add column if not exists` pattern D-148 established — migration `0026`
stays untouched. Bulk jobs get pacing separate from a site's day-to-day
`content_schedules.max_posts_per_run` via a second loop appended to the existing
`advance_content_pipeline()` cron function (a fixed per-tick cap, mirroring M20's D-186
hardcoded 20/hour pattern) rather than a new quota-counter table. Duplicate detection is
exact-keyword matching only, not the design doc's originally proposed pgvector cosine
similarity — `blog_articles.embedding` has no writer anywhere in the codebase yet (confirmed
dormant, D-124 scaffold), so a real semantic check isn't buildable today; faking one would
violate this codebase's established honest-scaffold posture (D-147). Semantic dedup is a
documented follow-up for whenever an embedding writer lands.
```

- [ ] **Step 3: Check off D-010 in TASKS.md**

In `TASKS.md`, replace line 15:
```
- [ ] **D-010** Worker runtime: GitHub Actions vs small VPS *(blocks Phase 3, not Session 0)*
```
with:
```
- [x] **D-010** Worker runtime: GitHub Actions vs small VPS *(blocks Phase 3, not Session 0)* — RESOLVED 2026-07-11 → GitHub Actions, see D-189
```

- [ ] **Step 4: Commit**

```bash
git add DECISIONS-AiMindShare-v1_0.md TASKS.md
git commit -m "docs: resolve D-010, log D-189..D-192 for M22-auto bulk pipeline"
```

---

### Task 4: `workers/llm.mjs` — Node-side Anthropic adapter

**Files:**
- Create: `workers/llm.mjs`
- Test: `workers/verify/llmprobe.mjs`

- [ ] **Step 1: Write the failing test first**

Create `workers/verify/llmprobe.mjs`:
```js
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
```

- [ ] **Step 2: Run it to confirm it fails (module doesn't exist yet)**

Run: `cd workers && node verify/llmprobe.mjs`
Expected: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../workers/llm.mjs'`

- [ ] **Step 3: Write `workers/llm.mjs`**

```js
// llm.mjs — Node-side Anthropic adapter for M22-auto real article generation
// (D-190). Mirrors supabase/functions/_shared/llm.ts's Vault convention exactly
// (same secret names, same fallback order) but lives in Node since the worker
// process can't import a Deno esm.sh-style module. `fetchImpl` is injectable so
// llmprobe.mjs can test this with zero network calls.
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const REQUEST_TIMEOUT_MS = 20_000;   // longer than M20's 10s — articles are longer than blueprints

export const anthropicKeyName = (workspaceId) =>
  workspaceId ? `ws_${workspaceId}__anthropic__api_key` : `plat__anthropic__api_key`;

export async function getVaultSecret(db, name) {
  const { data, error } = await db
    .schema("vault")
    .from("decrypted_secrets")
    .select("decrypted_secret")
    .eq("name", name)
    .maybeSingle();
  if (error || !data?.decrypted_secret) return null;
  return data.decrypted_secret;
}

export async function resolveAnthropicKey(db, workspaceId) {
  return (await getVaultSecret(db, anthropicKeyName(workspaceId)))
    ?? (await getVaultSecret(db, anthropicKeyName(null)));
}

// callAnthropicForArticle — one blocking call, returns a discriminated result, never
// throws. `fetchImpl` defaults to the global fetch (Node 18+ has it built in); tests
// inject a fake.
export async function callAnthropicForArticle(db, workspaceId, systemPrompt, userPrompt, model, fetchImpl = fetch) {
  const apiKey = await resolveAnthropicKey(db, workspaceId);
  if (!apiKey) return { kind: "unavailable", reason: "no_key" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetchImpl(ANTHROPIC_API, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: 4096, system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });
    if (!resp.ok) return { kind: "unavailable", reason: "provider_error" };

    const body = await resp.json().catch(() => null);
    const text = body?.content?.[0]?.text;
    const tokensUsed = (body?.usage?.input_tokens ?? 0) + (body?.usage?.output_tokens ?? 0);
    if (!text || !text.trim()) return { kind: "unavailable", reason: "bad_response" };

    return { kind: "html", content_html: text.trim(), tokensUsed, model };
  } catch (e) {
    return { kind: "unavailable", reason: e?.name === "AbortError" ? "timeout" : "provider_error" };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run the test again to confirm it passes**

Run: `cd workers && node verify/llmprobe.mjs`
Expected: `9 passed, 0 failed` (3 key-resolution + 1 no-key + 5 call-outcome assertions),
exit code 0.

- [ ] **Step 5: Commit**

```bash
git add workers/llm.mjs workers/verify/llmprobe.mjs
git commit -m "feat(m22): add workers/llm.mjs Anthropic adapter + unit tests (D-190)"
```

---

### Task 5: `blog-pipeline.mjs` — real `generate_article_with_ai` + `decidePublishStep`

**Files:**
- Modify: `frontend/js/blog-pipeline.mjs` (replace the throwing stub at lines 228-239; add a new pure function)
- Test: `workers/verify/llmprobe.mjs` (extend from Task 4)

- [ ] **Step 1: Extend `llmprobe.mjs` with failing tests for the new pure functions**

Append to `workers/verify/llmprobe.mjs` (add this import at the top alongside the
existing one, and this block before the final `console.log`/`process.exit`):
```js
import {
  generate_article_with_ai, buildArticleSystemPrompt, buildArticleUserPrompt, decidePublishStep,
} from "../../frontend/js/blog-pipeline.mjs";
```
```js
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
```

- [ ] **Step 2: Run to confirm the new tests fail**

Run: `cd workers && node verify/llmprobe.mjs`
Expected: `SyntaxError`/import error, since `generate_article_with_ai` still throws
unconditionally and `decidePublishStep`/`buildArticleSystemPrompt`/`buildArticleUserPrompt`
don't exist yet.

- [ ] **Step 3: Replace the stub section in `blog-pipeline.mjs`**

Replace lines 228-246 (the `PROVIDER STUBS` section) of `frontend/js/blog-pipeline.mjs`:
```js
// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER STUBS — the two OPEN gaps (D-147). NEVER called by this module or the
// worker; they exist only as the documented wire-in point (see doc/PROMPT-LIBRARY.md).
// ═══════════════════════════════════════════════════════════════════════════════
// eslint-disable-next-line no-unused-vars
export async function generate_article_with_ai(ctx) {
  // TODO(provider): wire real LLM, meter ai_tokens. GPT-4o / Claude / Gemini — an
  // OPEN human-call decision (D-063 posture). Consumes the doc/PROMPT-LIBRARY.md
  // templates (brief → article → regen). Until then this throws so it can never be
  // silently mistaken for real generation.
  throw new Error("generate_article_with_ai: no LLM provider wired (scaffold mode, D-147)");
}

// eslint-disable-next-line no-unused-vars
export async function generate_featured_image_with_ai(article) {
  // TODO(M35): meter image_gen. DALL·E / M35 Creative Studio — unbuilt. Returns null
  // in scaffold mode; the worker leaves featured_image_url null and never calls this.
  return null;
}
```
with:
```js
// ═══════════════════════════════════════════════════════════════════════════════
// REAL LLM WIRE-IN (D-190) — this module stays network-free and browser-importable;
// the actual Anthropic call lives in workers/llm.mjs and is injected as `callLlm`
// (systemPrompt, userPrompt) => Promise<{kind:'html',content_html,tokensUsed,model}
// | {kind:'unavailable',reason}>. The deterministic brief/outline stays the contract
// the LLM must follow (bounds cost, keeps SEO structure under our control) — only
// the prose becomes real.
// ═══════════════════════════════════════════════════════════════════════════════
export function buildArticleSystemPrompt(brandVoice, targetWordCount) {
  const voice = brandVoice && brandVoice.trim() ? brandVoice.trim() : "clear, helpful, and factual";
  return `You are a content writer producing a blog article for a website. Write in this brand ` +
    `voice: ${voice}. Target length: approximately ${targetWordCount} words. Follow the provided ` +
    `outline (H2 sections and FAQs) exactly — do not add or remove sections. Output ONLY the ` +
    `article body as clean semantic HTML (h2/h3/p/ul/li/div tags), no markdown fences, no <html> ` +
    `or <body> wrapper, no commentary before or after the HTML.`;
}

export function buildArticleUserPrompt(keyword, brief) {
  const sections = (brief?.h2_sections || []).map((s) => `- ${s.h2}: ${(s.points || []).join("; ")}`).join("\n");
  const faqs = (brief?.faqs || []).map((f) => `- Q: ${f.q}`).join("\n");
  return `Topic keyword: ${keyword}\n\nOutline:\n${sections}\n\nFAQ questions to answer:\n${faqs}\n\n` +
    `Write the full article now.`;
}

// generate_article_with_ai — real implementation, dependency-injected. Returns the
// same {kind:'html',...} / {kind:'unavailable',reason} shape callLlm returns, after
// validating the HTML isn't blank. No `callLlm` (browser preview, or no key resolved
// upstream) → unavailable/no_key, same semantics as every other module's LLM fallback.
export async function generate_article_with_ai(ctx, callLlm) {
  if (typeof callLlm !== "function") return { kind: "unavailable", reason: "no_key" };
  const { keyword, brief, targetWordCount = 1200, brandVoice = "" } = ctx;
  const systemPrompt = buildArticleSystemPrompt(brandVoice, targetWordCount);
  const userPrompt = buildArticleUserPrompt(keyword, brief);
  const result = await callLlm(systemPrompt, userPrompt);
  if (result.kind !== "html" || !result.content_html || !result.content_html.trim()) {
    return { kind: "unavailable", reason: result.reason || "bad_response" };
  }
  return result;
}

// decidePublishStep — the ONE place that decides where a generated draft lands
// (D-191). Pure and DB-free on purpose: this is the exact function
// worker.mjs's blog.generate handler calls, so the IslamicInfo hard-gate invariant
// (reviewRequired=true → never publish, no matter what else is true) is provable
// without a live database.
export function decidePublishStep({ passes, autoPublish, reviewRequired }) {
  if (!passes) return { step: "review", fail_reason: "BELOW_THRESHOLD", publish: false };
  if (reviewRequired) return { step: "review", fail_reason: null, publish: false };
  if (autoPublish) return { step: "published", fail_reason: null, publish: true };
  return { step: "review", fail_reason: null, publish: false };
}

// eslint-disable-next-line no-unused-vars
export async function generate_featured_image_with_ai(article) {
  // TODO(M35): meter image_gen. DALL·E / M35 Creative Studio — unbuilt. Returns null
  // in scaffold mode; the worker leaves featured_image_url null and never calls this.
  return null;
}
```

- [ ] **Step 4: Run the test again to confirm it passes**

Run: `cd workers && node verify/llmprobe.mjs`
Expected: `19 passed, 0 failed` (9 from Task 4 + 10 new), exit code 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/js/blog-pipeline.mjs workers/verify/llmprobe.mjs
git commit -m "feat(m22): implement generate_article_with_ai for real + decidePublishStep (D-190/D-191)"
```

---

### Task 6: Migration 0039 part A — LLM columns on `blog_articles`/`content_schedules`

**Files:**
- Create: `supabase/migrations/0039_m22_bulk.sql`
- Test: `workers/verify/m22bulkprobe.mjs`

- [ ] **Step 1: Write the failing PGlite probe**

Create `workers/verify/m22bulkprobe.mjs` (new probe file, mirrors the header/setup
convention of `workers/verify/m22probe.mjs` — PGlite, an `assert()` helper, and a
`load()` migration loader that strips `create extension`/`vector(1536)`/`gin_trgm_ops`
lines exactly as `m22probe.mjs` already does):
```js
// m22bulkprobe.mjs — M22-auto real-LLM columns + Bulk Content Creation schema/RLS
// (D-190/D-191/D-192). PGlite, no network. Loads the ordered migration chain through
// 0039 (mirrors workers/verify/m22probe.mjs's loader — same extension/vector strip).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

const load = (n) => readFileSync(join(MIG, n), "utf8")
  .split("\n")
  .filter((l) => !/^\s*create\s+extension/i.test(l))
  .filter((l) => !/gin_trgm_ops/i.test(l))
  .filter((l) => !/vector\(1536\)/i.test(l))
  .join("\n");

const count = async (pg, sql, params) => Number((await pg.query(sql, params)).rows[0].n);
async function denied(pg, sql, params) { try { await pg.query(sql, params); return false; } catch { return true; } }

console.log("══ M22-auto bulk pipeline: schema + RLS + RPCs (PGlite) ══");
const pg = new PGlite();
// Load every migration file up to and including 0039, in filename order (same
// convention as m22probe.mjs) so all prerequisite tables/functions exist.
const files = readdirSync(MIG).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
for (const f of files) {
  if (Number(f.slice(0, 4)) > 39) continue;
  await pg.exec(load(f));
}

// ═══ 1 — new columns exist ═══
assert(
  (await pg.query(`select column_name from information_schema.columns
     where table_name='blog_articles' and column_name in ('generation_source','llm_model','tokens_used')`))
    .rows.length === 3,
  "blog_articles has generation_source/llm_model/tokens_used"
);
assert(
  (await pg.query(`select column_name from information_schema.columns
     where table_name='content_schedules' and column_name='model'`)).rows.length === 1,
  "content_schedules has a model column"
);

// ═══ 2 — generation_source check constraint rejects garbage ═══
await pg.exec(`insert into public.workspaces (id, owner_id, name, slug, plan) values
  ('a0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','T','t','free')
  on conflict do nothing`);
await pg.exec(`insert into public.sites (id, workspace_id, name) values
  ('a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','S')
  on conflict do nothing`);
assert(
  await denied(pg, `insert into public.blog_articles (workspace_id, site_id, title, slug, generation_source)
    values ('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','t','t','not-a-real-value')`),
  "generation_source check constraint rejects an invalid value"
);
assert(
  !(await denied(pg, `insert into public.blog_articles (workspace_id, site_id, title, slug, generation_source)
    values ('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','t2','t2','llm')`)),
  "generation_source check constraint accepts 'llm'"
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run to confirm it fails**

Run: `cd workers && node verify/m22bulkprobe.mjs`
Expected: fails on assertion 1 (`0 !== 3`) since `supabase/migrations/0039_m22_bulk.sql`
doesn't exist yet (the loop that loads files simply won't find it, `blog_articles`
has none of the three new columns).

- [ ] **Step 3: Create `supabase/migrations/0039_m22_bulk.sql` with the header + Part A**

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- 0039_m22_bulk.sql — M22-auto real LLM generation + Bulk Content Creation
-- (D-190, D-191, D-192). Resolves the two OPEN provider gaps D-147 flagged for
-- article prose (NOT featured images — those stay deferred to M35, D-152,
-- unchanged). Additive only; 0025/0026/0027 are never edited.
--
-- Part A — LLM columns on blog_articles/content_schedules (this section)
-- Part B — site_brand_voice + the IslamicInfo review-lock trigger (D-191)
-- Part C — content_templates + content_batch_jobs + content_queue extension (D-192)
-- Part D — batch RPCs (create/preview/estimate/commit/schedule/rollback)
-- Part E — advance_content_pipeline() extended with the bulk per-tick cap (D-192)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Part A — LLM generation columns (mirrors D-186's funnel_blueprints pattern) ─
alter table public.blog_articles add column if not exists generation_source text
  check (generation_source is null or generation_source in ('llm','deterministic'));
alter table public.blog_articles add column if not exists llm_model   text;
alter table public.blog_articles add column if not exists tokens_used integer;

alter table public.content_schedules add column if not exists model text not null default 'claude-sonnet-5';
```

- [ ] **Step 4: Run the probe again to confirm Part A passes**

Run: `cd workers && node verify/m22bulkprobe.mjs`
Expected: `4 passed, 0 failed`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0039_m22_bulk.sql workers/verify/m22bulkprobe.mjs
git commit -m "feat(m22): migration 0039 part A — LLM columns on blog_articles/content_schedules"
```

---

### Task 7: Update `create_generated_article` RPC to persist the new LLM fields

**Files:**
- Modify: `supabase/migrations/0039_m22_bulk.sql` (append)
- Test: `workers/verify/m22bulkprobe.mjs` (extend)

- [ ] **Step 1: Extend the probe with a failing test**

Append to `workers/verify/m22bulkprobe.mjs`, before the final `console.log`/`process.exit`:
```js
// ═══ 3 — create_generated_article persists generation_source/llm_model/tokens_used ═══
await pg.exec(`insert into public.memberships (workspace_id, user_id, role, status) values
  ('a0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','owner','active')
  on conflict do nothing`);
const genRow = await pg.query(
  `select public.create_generated_article($1,$2,null,$3) as id`,
  ['a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
   JSON.stringify({ keyword: "k", title: "T", slug: "gen-article-test",
     generation_source: "llm", llm_model: "claude-sonnet-5", tokens_used: 842 })]
);
const genId = genRow.rows[0].id;
assert(!!genId, "create_generated_article returns a new article id");
const genArt = (await pg.query(
  `select generation_source, llm_model, tokens_used from public.blog_articles where id=$1`, [genId]
)).rows[0];
assert(genArt.generation_source === "llm", "create_generated_article persists generation_source");
assert(genArt.llm_model === "claude-sonnet-5", "create_generated_article persists llm_model");
assert(Number(genArt.tokens_used) === 842, "create_generated_article persists tokens_used");
```

- [ ] **Step 2: Run to confirm it fails**

Run: `cd workers && node verify/m22bulkprobe.mjs`
Expected: fails — `create_generated_article` (still the version from migration `0027`)
ignores the three new payload keys, so `genArt.generation_source` is `null`, not `"llm"`.

- [ ] **Step 3: Append the replaced `create_generated_article` to migration 0039**

```sql
-- ── Part A (cont.) — create_generated_article now also persists the LLM fields ──
-- create or replace over 0027's version: same slug-dedup/insert contract, three new
-- payload keys read straight from p_payload. Safe to replace (D-148 established that
-- functions in this pipeline evolve via create-or-replace; only tables are frozen).
create or replace function public.create_generated_article(
  p_ws uuid, p_site uuid, p_schedule uuid, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_slug text; v_base text; v_n int := 1;
begin
  v_base := coalesce(nullif(p_payload->>'slug',''), 'auto-article');
  v_slug := v_base;
  while exists (select 1 from public.blog_articles where site_id = p_site and slug = v_slug) loop
    v_slug := v_base || '-' || v_n; v_n := v_n + 1;
  end loop;

  insert into public.blog_articles (
    workspace_id, site_id, keyword, title, slug, excerpt, content_html,
    meta_title, meta_desc, tags, schema, seo_score, readability_score, word_count,
    cluster_slug, pillar_slug, generation_source, llm_model, tokens_used, status)
  values (
    p_ws, p_site,
    p_payload->>'keyword',
    coalesce(nullif(p_payload->>'title',''), 'Untitled'),
    v_slug,
    p_payload->>'excerpt',
    p_payload->>'content_html',
    p_payload->>'meta_title',
    p_payload->>'meta_desc',
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_payload->'tags') x), '{}'),
    coalesce(p_payload->'schema', '{}'::jsonb),
    nullif(p_payload->>'seo_score','')::int,
    nullif(p_payload->>'readability_score','')::int,
    coalesce(nullif(p_payload->>'word_count','')::int, 0),
    p_payload->>'cluster_slug',
    p_payload->>'pillar_slug',
    nullif(p_payload->>'generation_source',''),
    nullif(p_payload->>'llm_model',''),
    nullif(p_payload->>'tokens_used','')::int,
    'draft')
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.create_generated_article(uuid,uuid,uuid,jsonb) from public;
grant execute on function public.create_generated_article(uuid,uuid,uuid,jsonb) to service_role;
```

- [ ] **Step 4: Run the probe again to confirm it passes**

Run: `cd workers && node verify/m22bulkprobe.mjs`
Expected: `8 passed, 0 failed`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0039_m22_bulk.sql workers/verify/m22bulkprobe.mjs
git commit -m "feat(m22): create_generated_article persists generation_source/llm_model/tokens_used"
```

---

### Task 8: Wire real generation into `worker.mjs`'s `handleBlogGenerate`

**Files:**
- Modify: `workers/worker.mjs:11-18` (imports), `workers/worker.mjs:796-898` (`handleBlogGenerate`)

This task changes JS logic that calls out to a real network API — the codebase's
existing convention (confirmed in Tasks 4-5's research) is to NOT re-test `worker.mjs`
handlers directly; they're proven via the RPC/table-level assertions the handler calls
(already covered by Task 7's probe) plus the already-unit-tested pure functions
(`decidePublishStep`, `generate_article_with_ai` — Task 5). This task is therefore a
direct implementation step, verified by careful reading + the live-stack check in
Task 16, not a new failing-test-first cycle.

- [ ] **Step 1: Add the two new imports**

At `workers/worker.mjs:11-18`, change:
```js
import { createAutomationEngine } from "./automation.mjs";
import { crawlStep } from "./seo/crawler.mjs";
// M22-auto · the pure, deterministic Auto-Blog pipeline (no provider, no network,
// nothing metered — scaffold posture D-147). blog.generate drives these.
import {
  compute_topic_cluster, build_serp_brief, build_article_html,
  score_article, suggest_internal_links, build_schema,
} from "../frontend/js/blog-pipeline.mjs";
```
to:
```js
import { createAutomationEngine } from "./automation.mjs";
import { crawlStep } from "./seo/crawler.mjs";
import { callAnthropicForArticle } from "./llm.mjs";
// M22-auto · the Auto-Blog pipeline. compute_topic_cluster/build_serp_brief/
// build_article_html/score_article/suggest_internal_links/build_schema stay pure and
// deterministic (D-147 scaffold, unchanged). generate_article_with_ai and
// decidePublishStep are the D-190/D-191 real-LLM wire-in (see blog-pipeline.mjs).
import {
  compute_topic_cluster, build_serp_brief, build_article_html,
  score_article, suggest_internal_links, build_schema,
  generate_article_with_ai, decidePublishStep,
} from "../frontend/js/blog-pipeline.mjs";
```

- [ ] **Step 2: Replace `handleBlogGenerate`'s body**

Replace `workers/worker.mjs:796-898` in full:
```js
async function handleBlogGenerate(job) {
  const queueId = job.payload?.content_queue_id;
  if (!queueId) throw new Error("blog.generate: missing content_queue_id");

  // Claim the queue row (queued|in_progress → in_progress, step='brief').
  const { data: claimed, error: cErr } = await db.rpc("claim_content_item", { p_id: queueId });
  if (cErr) throw new Error(`blog.generate claim: ${cErr.message}`);
  const item = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!item || !item.id) return { content_queue_id: queueId, skipped: "not_claimable" };

  try {
    const ws = item.workspace_id;
    const siteId = item.site_id;
    const keyword = item.keyword;
    if (!keyword) throw new Error("blog.generate: queue row has no keyword");
    if (!siteId) throw new Error("blog.generate: queue row has no site_id (assign a site before generating)");

    // The per-site schedule carries the brand voice, target length, thresholds, the
    // auto_publish switch, and (D-190) the generation model. Absent → conservative
    // defaults.
    const { data: sched } = await db.from("content_schedules")
      .select("id, auto_publish, min_seo_score, min_readability_score, target_word_count, brand_voice, niche, model")
      .eq("site_id", siteId).maybeSingle();
    const minSeo = sched?.min_seo_score ?? 70;
    const minRead = sched?.min_readability_score ?? 50;
    const autoPublish = sched?.auto_publish ?? false;
    const targetWords = sched?.target_word_count ?? 1200;
    const model = sched?.model || "claude-sonnet-5";

    // D-191: the site's mandatory-review gate (IslamicInfo.org and any future
    // 'islamic'-preset site). Absent row → not locked (defaults false).
    const { data: voice } = await db.from("site_brand_voice")
      .select("tone_prompt, review_required").eq("site_id", siteId).maybeSingle();
    const reviewRequired = voice?.review_required ?? false;

    // Run the deterministic scaffold first — brief/cluster/links/schema are always
    // computed this way (D-147), regardless of whether a real LLM is available.
    const cluster = compute_topic_cluster(keyword, siteId);
    const brief = build_serp_brief(keyword, cluster);

    // D-190: attempt real generation. A rough tokens estimate (words × 2.2, input+
    // output) gates a pre-flight meter_check so a workspace at its ai_tokens ceiling
    // never starts a call it can't afford — same "automatic fallback, never a hard
    // block" semantics D-186 established for M20.
    const estimatedTokens = Math.round(targetWords * 2.2);
    const { data: gate } = await db.rpc("meter_check", { p_workspace: ws, p_kind: "ai_tokens", p_qty: estimatedTokens });
    const overQuota = gate?.over === true;

    let html, generationSource = "deterministic", llmModel = null, tokensUsed = null;
    if (!overQuota) {
      const callLlm = (sys, usr) => callAnthropicForArticle(db, ws, sys, usr, model);
      const aiResult = await generate_article_with_ai(
        { keyword, cluster, brief, targetWordCount: targetWords, brandVoice: voice?.tone_prompt || "" }, callLlm);
      if (aiResult.kind === "html") {
        html = aiResult.content_html;
        generationSource = "llm"; llmModel = aiResult.model; tokensUsed = aiResult.tokensUsed;
        await db.rpc("meter_increment", { p_workspace: ws, p_kind: "ai_tokens", p_qty: tokensUsed, p_source: "m22-blog" });
      }
    }
    if (!html) html = build_article_html(brief, cluster);   // deterministic fallback (D-147, unchanged)

    const scored = score_article(html, keyword);
    const links = suggest_internal_links(cluster);
    const schema = build_schema(keyword, { meta_title: brief.meta_title, meta_desc: brief.meta_desc, slug: brief.slug });

    // Featured image = STUB. Leave featured_image_url null; do NOT call the image stub.
    // TODO(M35): wire M35 Creative Studio → meter image_gen when it lands (D-152).

    const payload = {
      keyword,
      title: brief.title_ideas[0],
      slug: brief.slug,
      excerpt: brief.meta_desc,
      content_html: html,
      meta_title: brief.meta_title,
      meta_desc: brief.meta_desc,
      tags: [cluster.pillar_slug, cluster.cluster_slug, ...links.map((l) => l.slug)]
        .filter((v, i, a) => v && a.indexOf(v) === i),
      schema,
      seo_score: scored.seo_score,
      readability_score: scored.readability_score,
      word_count: scored.word_count,
      cluster_slug: cluster.cluster_slug,
      pillar_slug: cluster.pillar_slug,
      generation_source: generationSource,
      llm_model: llmModel,
      tokens_used: tokensUsed,
    };

    const { data: artId, error: aErr } = await db.rpc("create_generated_article", {
      p_ws: ws, p_site: siteId, p_schedule: sched?.id ?? null, p_payload: payload,
    });
    if (aErr) throw new Error(`blog.generate create: ${aErr.message}`);

    const passes = scored.seo_score >= minSeo && scored.readability_score >= minRead;
    // D-191: decidePublishStep is the ONE place that decides review vs publish — the
    // IslamicInfo hard-gate lives here, unit-tested in Task 5, not re-derived inline.
    const decision = decidePublishStep({ passes, autoPublish, reviewRequired });

    if (decision.publish) {
      // Pass + auto_publish + not review-locked → publish via the INTERNAL side-effect
      // (service-role; the manager-gated publish_article would fail with no auth.uid()).
      const { error: pErr } = await db.rpc("_m22_publish", { p_article: artId });
      if (pErr) throw new Error(`blog.generate publish: ${pErr.message}`);
      await db.rpc("complete_content_item", {
        p_id: queueId, p_article: artId, p_step: "published", p_fail_reason: null,
      });
      return { content_queue_id: queueId, article_id: artId, outcome: "published",
        generation_source: generationSource, seo_score: scored.seo_score, readability_score: scored.readability_score };
    }

    // Everything else → the review queue (in_review): below-threshold, review-locked
    // site, or auto_publish simply off.
    await db.from("blog_articles").update({ status: "in_review" }).eq("id", artId);
    await db.rpc("complete_content_item", {
      p_id: queueId, p_article: artId, p_step: decision.step, p_fail_reason: decision.fail_reason,
    });
    return { content_queue_id: queueId, article_id: artId, outcome: "review",
      reason: decision.fail_reason || (reviewRequired ? "review_required" : "auto_publish_off"),
      generation_source: generationSource, seo_score: scored.seo_score, readability_score: scored.readability_score };
  } catch (e) {
    // Record the failure on the queue row, then rethrow so the jobs-layer retry applies.
    await db.rpc("fail_content_item", { p_id: queueId, p_reason: String(e?.message || e).slice(0, 500) })
      .catch(() => {});
    throw e;
  }
}
```

- [ ] **Step 3: Syntax-check the file**

Run: `node --check workers/worker.mjs`
Expected: no output (valid syntax).

- [ ] **Step 4: Commit**

```bash
git add workers/worker.mjs
git commit -m "feat(m22): wire real LLM generation + IslamicInfo review gate into handleBlogGenerate"
```

---

### Task 9: Migration 0039 part B — `site_brand_voice` + IslamicInfo lock trigger

**Files:**
- Modify: `supabase/migrations/0039_m22_bulk.sql` (append)
- Test: `workers/verify/m22bulkprobe.mjs` (extend)

- [ ] **Step 1: Extend the probe with failing tests**

Append to `workers/verify/m22bulkprobe.mjs`:
```js
// ═══ 4 — site_brand_voice table + RLS + the IslamicInfo review-lock trigger ═══
await pg.exec(`update public.sites set style_preset='islamic' where id='a0000000-0000-0000-0000-000000000002'`);
await pg.exec(`insert into public.site_brand_voice (site_id, workspace_id, tone_prompt, review_required)
  values ('a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','warm and respectful', true)`);
assert(
  (await pg.query(`select review_required from public.site_brand_voice where site_id='a0000000-0000-0000-0000-000000000002'`))
    .rows[0].review_required === true,
  "site_brand_voice row inserted with review_required=true"
);
assert(
  await denied(pg, `update public.site_brand_voice set review_required=false
    where site_id='a0000000-0000-0000-0000-000000000002'`),
  "enforce_review_lock trigger REJECTS disabling review_required on an 'islamic'-preset site"
);
await pg.exec(`insert into public.sites (id, workspace_id, name, style_preset) values
  ('a0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','Not Islamic','bold')
  on conflict do nothing`);
await pg.exec(`insert into public.site_brand_voice (site_id, workspace_id, tone_prompt, review_required)
  values ('a0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','upbeat', true)`);
assert(
  !(await denied(pg, `update public.site_brand_voice set review_required=false
    where site_id='a0000000-0000-0000-0000-000000000003'`)),
  "enforce_review_lock trigger ALLOWS disabling review_required on a non-'islamic'-preset site"
);
```

- [ ] **Step 2: Run to confirm it fails**

Run: `cd workers && node verify/m22bulkprobe.mjs`
Expected: fails — `public.site_brand_voice` doesn't exist yet.

- [ ] **Step 3: Append Part B to the migration**

```sql
-- ── Part B — site_brand_voice + the IslamicInfo mandatory-review lock (D-191) ──
create table if not exists public.site_brand_voice (
  site_id         uuid primary key references public.sites(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  tone_prompt     text,
  review_required boolean not null default false,
  updated_at      timestamptz
);
create index if not exists site_brand_voice_ws_idx on public.site_brand_voice (workspace_id);
alter table public.site_brand_voice enable row level security;
create policy site_brand_voice_sel on public.site_brand_voice for select using ( public.has_role(workspace_id,'staff') );
create policy site_brand_voice_ins on public.site_brand_voice for insert with check ( public.has_role(workspace_id,'staff') );
create policy site_brand_voice_upd on public.site_brand_voice for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy site_brand_voice_del on public.site_brand_voice for delete using ( public.has_role(workspace_id,'manager') );
create trigger site_brand_voice_set_updated_at before update on public.site_brand_voice
  for each row execute function public.set_updated_at();

-- enforce_review_lock — a bulk job, a misconfigured schedule, or a direct RPC call
-- can never disable mandatory review for an 'islamic'-preset site (D-191). Tied to
-- sites.style_preset, not a hardcoded site id, so it protects any future site with
-- the same preset, not just IslamicInfo.org specifically.
create or replace function public.enforce_review_lock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.review_required = false and exists (
    select 1 from public.sites where id = new.site_id and style_preset = 'islamic'
  ) then
    raise exception 'review_required cannot be disabled for an islamic-preset site';
  end if;
  return new;
end $$;
create trigger site_brand_voice_lock before insert or update on public.site_brand_voice
  for each row execute function public.enforce_review_lock();
```

- [ ] **Step 4: Run the probe again to confirm it passes**

Run: `cd workers && node verify/m22bulkprobe.mjs`
Expected: `11 passed, 0 failed`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0039_m22_bulk.sql workers/verify/m22bulkprobe.mjs
git commit -m "feat(m22): site_brand_voice table + IslamicInfo review-lock trigger (D-191)"
```

---

### Task 10: Seed the three real sites + brand voices

**Files:**
- Modify: `supabase/seed.sql` (append, following the existing Acme workspace/sites pattern)

- [ ] **Step 1: Append the new workspace, sites, and brand-voice seed rows**

Append to `supabase/seed.sql`, near the existing `workspaces`/`sites` insert blocks
(same file, same style — deterministic UUIDs, `on conflict do nothing`):
```sql
-- ── M22-auto (D-190/D-191) — the real content-network sites the bulk pipeline ──
-- targets, replacing the single generic "Acme" test site for this purpose.
insert into public.workspaces (id, owner_id, parent_workspace_id, name, slug, plan, niche) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd','11111111-1111-1111-1111-111111111111', null, 'AiMindShare Content Network','content-network','scale','Content')
on conflict (id) do nothing;

insert into public.sites (id, workspace_id, name, subdomain, status, brand, nav, seo_defaults, style_preset) values
  ('19000000-0000-0000-0000-000000000002','dddddddd-dddd-dddd-dddd-dddddddddddd','IslamicInfo.org','islamicinfo','published',
   '{"colors":{"emerald":"#0F6E4A"},"fonts":{}}','{"items":[{"label":"Home","page_id":null}]}',
   '{"description":"Authentic Islamic knowledge, duas, and daily guidance.","robots":"index,follow"}','islamic'),
  ('19000000-0000-0000-0000-000000000003','dddddddd-dddd-dddd-dddd-dddddddddddd','TravellyAI.com','travellyai','published',
   '{"colors":{"sky":"#0284C7"},"fonts":{}}','{"items":[{"label":"Home","page_id":null}]}',
   '{"description":"Travel deals, destination guides, and trip-planning tips.","robots":"index,follow"}','bold'),
  ('19000000-0000-0000-0000-000000000004','dddddddd-dddd-dddd-dddd-dddddddddddd','GeniuslyAI.com','geniuslyai','published',
   '{"colors":{"violet":"#7C3AED"},"fonts":{}}','{"items":[{"label":"Home","page_id":null}]}',
   '{"description":"Practical guides on AI tools, productivity, and learning.","robots":"index,follow"}','minimal')
on conflict (id) do nothing;

insert into public.site_brand_voice (site_id, workspace_id, tone_prompt, review_required) values
  ('19000000-0000-0000-0000-000000000002','dddddddd-dddd-dddd-dddd-dddddddddddd',
   'Warm, respectful, and rooted in authentic Islamic sources. Avoid casual slang, avoid speculative religious rulings, cite the Quran/Sunnah in general terms only (never invent a specific ayah/hadith reference).',
   true),
  ('19000000-0000-0000-0000-000000000003','dddddddd-dddd-dddd-dddd-dddddddddddd',
   'Upbeat, practical, and deal-focused — write like a well-traveled friend giving advice, with concrete tips and urgency around limited-time offers.',
   false),
  ('19000000-0000-0000-0000-000000000004','dddddddd-dddd-dddd-dddd-dddddddddddd',
   'Clear, encouraging, and jargon-light — explain AI/productivity concepts to a smart beginner without condescension.',
   false)
on conflict (site_id) do nothing;
```

- [ ] **Step 2: Verify the seed file still loads cleanly under the probe's migration chain**

Run: `cd workers && node verify/m22bulkprobe.mjs`
Expected: still `11 passed, 0 failed` — `m22bulkprobe.mjs` doesn't load `seed.sql` (it
tests migrations only), so this step is a smoke check that Step 1's SQL is at least
syntactically consistent with the schema. Additionally run:
`psql --version >/dev/null 2>&1 && echo "psql available for manual seed dry-run" || echo "no local psql — seed.sql will be validated when applied to a real/PGlite-backed project"`

- [ ] **Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat(m22): seed IslamicInfo.org/TravellyAI.com/GeniuslyAI.com + brand voices"
```

---

### Task 11: Migration 0039 part C — `content_templates`, `content_batch_jobs`, extend `content_queue`

**Files:**
- Modify: `supabase/migrations/0039_m22_bulk.sql` (append)
- Test: `workers/verify/m22bulkprobe.mjs` (extend)

- [ ] **Step 1: Extend the probe with failing tests**

Append to `workers/verify/m22bulkprobe.mjs`:
```js
// ═══ 5 — content_templates / content_batch_jobs / extended content_queue ═══
assert(
  (await pg.query(`select table_name from information_schema.tables
     where table_name in ('content_templates','content_batch_jobs')`)).rows.length === 2,
  "content_templates and content_batch_jobs tables exist"
);
assert(
  (await pg.query(`select column_name from information_schema.columns
     where table_name='content_queue' and column_name in ('batch_job_id','template_id','variables')`))
    .rows.length === 3,
  "content_queue has batch_job_id/template_id/variables columns"
);
await pg.exec(`insert into public.content_batch_jobs
    (id, workspace_id, site_id, name, topic_source, model, word_count_min, word_count_max, total_items, topics)
  values
    ('a0000000-0000-0000-0000-000000000010','a0000000-0000-0000-0000-000000000001',
     'a0000000-0000-0000-0000-000000000002','Ramadan batch','manual','claude-sonnet-5',800,1600,2,
     '[{"keyword":"best dua for ramadan"},{"keyword":"ramadan fasting tips"}]'::jsonb)`);
assert(
  (await pg.query(`select status, total_items from public.content_batch_jobs where id='a0000000-0000-0000-0000-000000000010'`))
    .rows[0].status === 'draft',
  "a new content_batch_jobs row defaults to status='draft'"
);
```

- [ ] **Step 2: Run to confirm it fails**

Run: `cd workers && node verify/m22bulkprobe.mjs`
Expected: fails — neither table exists yet.

- [ ] **Step 3: Append Part C to the migration**

```sql
-- ── Part C — content_templates + content_batch_jobs + content_queue extension (D-192) ──
create table if not exists public.content_templates (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  site_id         uuid references public.sites(id) on delete cascade,
  name            text not null,
  prompt_template text not null,          -- free text with [var] slots, e.g. "[city] travel guide"
  variable_defs   jsonb not null default '[]',  -- [{name,label,sample_values:[...]}]
  category        text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);
create index if not exists content_templates_ws_idx on public.content_templates (workspace_id);
alter table public.content_templates enable row level security;
create policy content_templates_sel on public.content_templates for select using ( public.has_role(workspace_id,'staff') );
create policy content_templates_ins on public.content_templates for insert with check ( public.has_role(workspace_id,'staff') );
create policy content_templates_upd on public.content_templates for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy content_templates_del on public.content_templates for delete using ( public.has_role(workspace_id,'manager') );
create trigger content_templates_set_updated_at before update on public.content_templates
  for each row execute function public.set_updated_at();

create table if not exists public.content_batch_jobs (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces(id) on delete cascade,
  site_id               uuid not null references public.sites(id) on delete cascade,
  name                  text not null,
  topic_source          text not null default 'manual' check (topic_source in ('manual','csv','ai_seed')),
  template_id           uuid references public.content_templates(id) on delete set null,
  model                 text not null default 'claude-sonnet-5',
  word_count_min        int not null default 800,
  word_count_max        int not null default 1600,
  topics                jsonb not null default '[]',   -- [{keyword, variables:{}}] resolved at creation
  total_items           int not null default 0,
  preview_count         int not null default 0,
  status                text not null default 'draft'
    check (status in ('draft','previewing','queued','running','paused','completed','rolled_back')),
  scheduled_spread_days int,
  created_by            uuid references auth.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz
);
create index if not exists content_batch_jobs_ws_idx on public.content_batch_jobs (workspace_id, status);
alter table public.content_batch_jobs enable row level security;
create policy content_batch_jobs_sel on public.content_batch_jobs for select using ( public.has_role(workspace_id,'staff') );
create policy content_batch_jobs_ins on public.content_batch_jobs for insert with check ( public.has_role(workspace_id,'staff') );
create policy content_batch_jobs_upd on public.content_batch_jobs for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy content_batch_jobs_del on public.content_batch_jobs for delete using ( public.has_role(workspace_id,'manager') );
create trigger content_batch_jobs_set_updated_at before update on public.content_batch_jobs
  for each row execute function public.set_updated_at();

-- Extend content_queue (same add-column-if-not-exists pattern 0027 used on 0026;
-- 0026 stays untouched, D-148/D-192).
alter table public.content_queue add column if not exists batch_job_id uuid references public.content_batch_jobs(id) on delete set null;
alter table public.content_queue add column if not exists template_id  uuid references public.content_templates(id) on delete set null;
alter table public.content_queue add column if not exists variables    jsonb not null default '{}';
create index if not exists content_queue_batch_idx on public.content_queue (batch_job_id);
```

- [ ] **Step 4: Run the probe again to confirm it passes**

Run: `cd workers && node verify/m22bulkprobe.mjs`
Expected: `14 passed, 0 failed`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0039_m22_bulk.sql workers/verify/m22bulkprobe.mjs
git commit -m "feat(m22): content_templates + content_batch_jobs tables, extend content_queue"
```

---

### Task 12: Migration 0039 part D — batch RPCs (create/preview/estimate/commit/schedule/rollback)

**Files:**
- Modify: `supabase/migrations/0039_m22_bulk.sql` (append)
- Test: `workers/verify/m22bulkprobe.mjs` (extend)

- [ ] **Step 1: Extend the probe with failing tests covering the full batch lifecycle**

Append to `workers/verify/m22bulkprobe.mjs`:
```js
// ═══ 6 — batch RPCs: create → estimate → preview → commit → schedule → rollback ═══
const batchRow = await pg.query(
  `select public.create_batch_job($1,$2,$3,$4,$5,null,$6,$7,$8) as id`,
  ['a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','Dua batch','manual',
   JSON.stringify([{ keyword: "dua for travel" }, { keyword: "dua for anxiety" }, { keyword: "dua before sleep" }]),
   'claude-sonnet-5', 800, 1600]
);
const batchId = batchRow.rows[0].id;
assert(!!batchId, "create_batch_job returns a new batch id");
assert(
  (await pg.query(`select total_items from public.content_batch_jobs where id=$1`, [batchId])).rows[0].total_items === 3,
  "create_batch_job sets total_items from the topics array length"
);

const est = (await pg.query(`select public.estimate_batch_cost($1) as e`, [batchId])).rows[0].e;
assert(est.total_items === 3 && est.est_tokens > 0 && est.est_cost_usd >= 0,
  "estimate_batch_cost returns total_items/est_tokens/est_cost_usd with no provider call");

const preview = (await pg.query(`select public.generate_batch_preview($1, 1) as p`, [batchId])).rows[0].p;
assert(preview.count === 1, "generate_batch_preview(batch, 1) creates exactly 1 content_queue row");
assert(
  (await pg.query(`select status, preview_count from public.content_batch_jobs where id=$1`, [batchId])).rows[0].status === 'previewing',
  "generate_batch_preview flips the batch job to status='previewing'"
);

const commit = (await pg.query(`select public.commit_batch_job($1) as c`, [batchId])).rows[0].c;
assert(commit.inserted === 2, "commit_batch_job inserts the REMAINING 2 topics (3 total - 1 preview)");
assert(
  (await pg.query(`select count(*)::int as n from public.content_queue where batch_job_id=$1`, [batchId])).rows[0].n === 3,
  "content_queue now has all 3 topics (1 preview + 2 committed) tagged with batch_job_id"
);
assert(
  await denied(pg, `select public.commit_batch_job($1)`, [batchId]),
  "commit_batch_job refuses to run twice on the same batch (status is no longer draft/previewing)"
);

// duplicate-keyword flagging (exact match, D-192's honest downgrade from pgvector)
await pg.exec(`insert into public.blog_articles (workspace_id, site_id, title, slug, keyword)
  values ('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','Existing','existing-dup','dua for travel')`);
const dupBatch = (await pg.query(
  `select public.create_batch_job($1,$2,$3,$4,$5) as id`,
  ['a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','Dup test','manual',
   JSON.stringify([{ keyword: "dua for travel" }])]
)).rows[0].id;
const dupCommit = (await pg.query(`select public.commit_batch_job($1) as c`, [dupBatch])).rows[0].c;
assert(dupCommit.duplicate_flagged === 1, "commit_batch_job flags an exact-keyword duplicate against existing blog_articles");

// schedule spread + rollback — mark the queue rows' articles in_review first (mimics
// what handleBlogGenerate would have done after generation completed).
await pg.exec(`update public.content_queue set article_id =
    (insert into public.blog_articles (workspace_id, site_id, title, slug, status)
     values ('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002',
             'Generated: ' || keyword, 'gen-' || id, 'in_review') returning id)
  where batch_job_id=$1`, [batchId]);
const scheduled = (await pg.query(
  `select public.schedule_batch_publish_spread($1, now(), 5, 2) as n`, [batchId]
)).rows[0].n;
assert(scheduled === 3, "schedule_batch_publish_spread schedules all 3 in_review articles from this batch");
assert(
  (await pg.query(`select status from public.content_batch_jobs where id=$1`, [batchId])).rows[0].status === 'completed',
  "schedule_batch_publish_spread flips the batch job to status='completed'"
);
const rolledBack = (await pg.query(`select public.rollback_batch_job($1) as n`, [batchId])).rows[0].n;
assert(rolledBack === 3, "rollback_batch_job reverts all 3 scheduled articles back to draft");
assert(
  (await pg.query(`select count(*)::int as n from public.blog_articles
     where id in (select article_id from public.content_queue where batch_job_id=$1) and status='draft'`, [batchId]))
    .rows[0].n === 3,
  "rollback_batch_job leaves the articles as drafts (no hard delete)"
);
```

- [ ] **Step 2: Run to confirm it fails**

Run: `cd workers && node verify/m22bulkprobe.mjs`
Expected: fails immediately — `public.create_batch_job` doesn't exist yet.

- [ ] **Step 3: Append Part D (the five RPCs) to the migration**

```sql
-- ── Part D — batch RPCs (D-192) ─────────────────────────────────────────────────
create or replace function public.create_batch_job(
  p_ws uuid, p_site uuid, p_name text, p_topic_source text, p_topics jsonb,
  p_template uuid default null, p_model text default 'claude-sonnet-5',
  p_word_min int default 800, p_word_max int default 1600)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_role(p_ws,'staff') then raise exception 'forbidden: staff+ required'; end if;
  if p_topic_source not in ('manual','csv','ai_seed') then raise exception 'invalid topic_source'; end if;
  insert into public.content_batch_jobs
    (workspace_id, site_id, name, topic_source, template_id, model, word_count_min, word_count_max, total_items, topics, status)
  values
    (p_ws, p_site, p_name, p_topic_source, p_template, p_model, p_word_min, p_word_max,
     coalesce(jsonb_array_length(p_topics),0), coalesce(p_topics,'[]'::jsonb), 'draft')
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.create_batch_job(uuid,uuid,text,text,jsonb,uuid,text,int,int) from public;
grant execute on function public.create_batch_job(uuid,uuid,text,text,jsonb,uuid,text,int,int) to authenticated, service_role;

-- estimate_batch_cost — pure calculation, no provider call. Blended $/1K-token rates
-- per model tier (update this case expression when pricing changes; no schema impact).
create or replace function public.estimate_batch_cost(p_batch uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare b record; v_tokens_per_item numeric; v_rate numeric; v_est_tokens numeric; v_est_cost numeric;
begin
  select * into b from public.content_batch_jobs where id = p_batch;
  if not found then raise exception 'batch job not found'; end if;
  if not public.has_role(b.workspace_id,'staff') then raise exception 'forbidden: staff+ required'; end if;

  v_tokens_per_item := ((b.word_count_min + b.word_count_max) / 2.0) * 2.2;
  v_rate := case b.model when 'claude-sonnet-5' then 0.009 else 0.0025 end;
  v_est_tokens := v_tokens_per_item * b.total_items;
  v_est_cost := round((v_est_tokens / 1000.0) * v_rate, 2);
  return jsonb_build_object('total_items', b.total_items, 'est_tokens', round(v_est_tokens),
    'est_cost_usd', v_est_cost, 'model', b.model);
end $$;
revoke all on function public.estimate_batch_cost(uuid) from public;
grant execute on function public.estimate_batch_cost(uuid) to authenticated, service_role;

-- generate_batch_preview — immediately generate the first p_n topics (bypasses the
-- per-tick pacing cap Part E adds; only a handful of items, deliberately synchronous-
-- feeling via enqueue_content_generation's existing idempotent job insert).
create or replace function public.generate_batch_preview(p_batch uuid, p_n int default 3)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b record; v_topic jsonb; v_idx int := 0; v_qid uuid; v_ids uuid[] := '{}';
begin
  select * into b from public.content_batch_jobs where id = p_batch;
  if not found then raise exception 'batch job not found'; end if;
  if not public.has_role(b.workspace_id,'staff') then raise exception 'forbidden: staff+ required'; end if;
  if b.status <> 'draft' then raise exception 'preview only allowed from draft status'; end if;

  for v_topic in
    select value from jsonb_array_elements(b.topics) with ordinality as t(value, idx) where idx <= p_n
  loop
    insert into public.content_queue
      (workspace_id, site_id, keyword, status, source, batch_job_id, template_id, variables)
    values
      (b.workspace_id, b.site_id, v_topic->>'keyword', 'queued', 'bulk-preview',
       b.id, b.template_id, coalesce(v_topic->'variables','{}'::jsonb))
    returning id into v_qid;
    v_ids := array_append(v_ids, v_qid);
    perform public.enqueue_content_generation(v_qid);
    v_idx := v_idx + 1;
  end loop;

  update public.content_batch_jobs set status = 'previewing', preview_count = v_idx where id = b.id;
  return jsonb_build_object('preview_queue_ids', v_ids, 'count', v_idx);
end $$;
revoke all on function public.generate_batch_preview(uuid,int) from public;
grant execute on function public.generate_batch_preview(uuid,int) to authenticated, service_role;

-- commit_batch_job — fan out the REMAINING topics (those past preview_count) into
-- content_queue rows tagged batch_job_id. Duplicate check is exact-keyword matching
-- against existing blog_articles/other batches for the same site (D-192 — the
-- semantic/pgvector version needs an embedding writer that doesn't exist yet);
-- flags, never blocks, so a human makes the call in the Bulk Status Dashboard.
create or replace function public.commit_batch_job(p_batch uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b record; v_topic jsonb; v_kw text; v_inserted int := 0; v_flagged int := 0;
begin
  select * into b from public.content_batch_jobs where id = p_batch;
  if not found then raise exception 'batch job not found'; end if;
  if not public.has_role(b.workspace_id,'staff') then raise exception 'forbidden: staff+ required'; end if;
  if b.status not in ('draft','previewing') then raise exception 'batch job already committed'; end if;

  for v_topic in
    select value from jsonb_array_elements(b.topics) with ordinality as t(value, idx) where idx > b.preview_count
  loop
    v_kw := lower(trim(v_topic->>'keyword'));
    insert into public.content_queue
      (workspace_id, site_id, keyword, status, source, batch_job_id, template_id, variables)
    values
      (b.workspace_id, b.site_id, v_topic->>'keyword', 'queued', 'bulk-' || b.topic_source,
       b.id, b.template_id, coalesce(v_topic->'variables','{}'::jsonb));
    v_inserted := v_inserted + 1;

    if exists (select 1 from public.blog_articles where site_id = b.site_id and lower(trim(keyword)) = v_kw)
       or exists (select 1 from public.content_queue where site_id = b.site_id and batch_job_id is distinct from b.id and lower(trim(keyword)) = v_kw)
    then
      v_flagged := v_flagged + 1;
    end if;
  end loop;

  update public.content_batch_jobs set status = 'queued' where id = b.id;
  return jsonb_build_object('inserted', v_inserted, 'duplicate_flagged', v_flagged);
end $$;
revoke all on function public.commit_batch_job(uuid) from public;
grant execute on function public.commit_batch_job(uuid) to authenticated, service_role;

-- schedule_batch_publish_spread — evenly spaces scheduled_at across
-- [p_start, p_start + spread) at p_per_day articles/day for every in_review article
-- this batch produced (reuses the existing publish_due_articles() cron — no new cron).
create or replace function public.schedule_batch_publish_spread(
  p_batch uuid, p_start timestamptz, p_spread_days int, p_per_day int default 3)
returns int language plpgsql security definer set search_path = public as $$
declare b record; a record; v_idx int := 0; v_day int; v_slot_time timestamptz; v_count int := 0;
begin
  select * into b from public.content_batch_jobs where id = p_batch;
  if not found then raise exception 'batch job not found'; end if;
  if not public.has_role(b.workspace_id,'manager') then raise exception 'forbidden: manager+ required'; end if;

  for a in
    select ba.id from public.blog_articles ba
      join public.content_queue cq on cq.article_id = ba.id
     where cq.batch_job_id = p_batch and ba.status = 'in_review'
     order by ba.created_at asc
  loop
    v_day := v_idx / greatest(p_per_day,1);
    v_slot_time := p_start + (v_day || ' days')::interval + ((v_idx % greatest(p_per_day,1)) || ' hours')::interval;
    update public.blog_articles set status = 'scheduled', scheduled_at = v_slot_time where id = a.id;
    v_idx := v_idx + 1; v_count := v_count + 1;
  end loop;

  update public.content_batch_jobs set status = 'completed' where id = b.id;
  return v_count;
end $$;
revoke all on function public.schedule_batch_publish_spread(uuid,timestamptz,int,int) from public;
grant execute on function public.schedule_batch_publish_spread(uuid,timestamptz,int,int) to authenticated, service_role;

-- rollback_batch_job — reverts every published/scheduled article this batch produced
-- back to draft (published_at/scheduled_at cleared). Never hard-deletes (platform's
-- no-hard-delete-by-default posture) — drafts stay for inspection.
create or replace function public.rollback_batch_job(p_batch uuid)
returns int language plpgsql security definer set search_path = public as $$
declare b record; v_count int;
begin
  select * into b from public.content_batch_jobs where id = p_batch;
  if not found then raise exception 'batch job not found'; end if;
  if not public.has_role(b.workspace_id,'manager') then raise exception 'forbidden: manager+ required'; end if;

  with affected as (
    select ba.id from public.blog_articles ba
      join public.content_queue cq on cq.article_id = ba.id
     where cq.batch_job_id = p_batch and ba.status in ('published','scheduled')
  )
  update public.blog_articles set status = 'draft', published_at = null, scheduled_at = null
   where id in (select id from affected);
  get diagnostics v_count = row_count;

  update public.content_batch_jobs set status = 'rolled_back' where id = b.id;
  return v_count;
end $$;
revoke all on function public.rollback_batch_job(uuid) from public;
grant execute on function public.rollback_batch_job(uuid) to authenticated, service_role;
```

- [ ] **Step 4: Run the probe again to confirm it passes**

Run: `cd workers && node verify/m22bulkprobe.mjs`
Expected: `27 passed, 0 failed`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0039_m22_bulk.sql workers/verify/m22bulkprobe.mjs
git commit -m "feat(m22): batch RPCs — create/estimate/preview/commit/schedule/rollback (D-192)"
```

---

### Task 13: Migration 0039 part E — bulk pacing in `advance_content_pipeline()`

**Files:**
- Modify: `supabase/migrations/0039_m22_bulk.sql` (append)
- Test: `workers/verify/m22bulkprobe.mjs` (extend)

- [ ] **Step 1: Extend the probe with a failing test**

Append to `workers/verify/m22bulkprobe.mjs`:
```js
// ═══ 7 — advance_content_pipeline() drains batch-sourced content_queue rows too ═══
const paceBatch = (await pg.query(
  `select public.create_batch_job($1,$2,$3,$4,$5) as id`,
  ['a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','Pace test','manual',
   JSON.stringify(Array.from({ length: 15 }, (_, i) => ({ keyword: `pace topic ${i}` })))]
)).rows[0].id;
await pg.query(`select public.commit_batch_job($1)`, [paceBatch]);
const before = (await pg.query(
  `select count(*)::int as n from public.jobs where type='blog.generate' and payload->>'content_queue_id' in
     (select id::text from public.content_queue where batch_job_id=$1)`, [paceBatch]
)).rows[0].n;
assert(before === 0, "no blog.generate jobs enqueued yet for the batch (only commit_batch_job ran)");

await pg.query(`select public.advance_content_pipeline()`);
const afterOne = (await pg.query(
  `select count(*)::int as n from public.jobs where type='blog.generate' and payload->>'content_queue_id' in
     (select id::text from public.content_queue where batch_job_id=$1)`, [paceBatch]
)).rows[0].n;
assert(afterOne > 0 && afterOne <= 10, "advance_content_pipeline enqueues UP TO the per-tick bulk cap (10), not all 15 at once");
assert(
  (await pg.query(`select status from public.content_batch_jobs where id=$1`, [paceBatch])).rows[0].status === 'running',
  "advance_content_pipeline flips the batch job to status='running' once it starts draining"
);
```

- [ ] **Step 2: Run to confirm it fails**

Run: `cd workers && node verify/m22bulkprobe.mjs`
Expected: fails on `afterOne > 0` — the current `advance_content_pipeline()` (from
migration `0027`) only looks at `content_schedules`-linked rows, never at
`batch_job_id`-tagged ones, so nothing gets enqueued.

- [ ] **Step 3: Append Part E — replace `advance_content_pipeline()`**

```sql
-- ── Part E — advance_content_pipeline() gains a bulk-pacing pass (D-192) ────────
-- create or replace over 0027's version: the existing per-schedule loop is UNCHANGED
-- (editorial content_queue rows keep pacing at max_posts_per_run per their cadence).
-- A second loop is appended that drains batch_job_id-tagged rows at a fixed per-tick
-- cap, independent of the owning site's schedule — this is the "separate lane" bulk
-- jobs need (D-192) without a new usage_events counter table.
create or replace function public.advance_content_pipeline()
returns int language plpgsql security definer set search_path = public as $$
declare s record; q record; b record; n int := 0; v_cadence interval;
  v_bulk_cap constant int := 10;   -- per-tick cap per active batch job (mirrors D-186's hardcoded 20/hour pattern)
begin
  for s in select * from public.content_schedules where active and site_id is not null loop
    v_cadence := case s.frequency
                   when 'daily'  then interval '1 day'
                   when 'weekly' then interval '7 days'
                   else interval '1 day'
                 end;
    if s.last_run_at is not null and s.last_run_at > now() - v_cadence then
      continue;
    end if;

    for q in
      select id from public.content_queue
       where site_id = s.site_id and workspace_id = s.workspace_id and status = 'queued'
         and batch_job_id is null   -- editorial-only lane; batch rows are paced below
       order by priority desc, created_at asc
       limit s.max_posts_per_run
    loop
      insert into public.jobs (workspace_id, type, payload, status, idempotency_key)
      values (s.workspace_id, 'blog.generate',
              jsonb_build_object('content_queue_id', q.id, 'workspace_id', s.workspace_id),
              'queued', 'bloggen-' || q.id)
      on conflict (workspace_id, type, idempotency_key) where idempotency_key is not null do nothing;
      if found then n := n + 1; end if;
    end loop;

    update public.content_schedules set last_run_at = now() where id = s.id;
  end loop;

  -- Bulk lane: every active batch job (queued or already running) drains up to
  -- v_bulk_cap of its own still-queued items per tick, regardless of that site's
  -- editorial max_posts_per_run.
  for b in select * from public.content_batch_jobs where status in ('queued','running') loop
    for q in
      select id from public.content_queue
       where batch_job_id = b.id and status = 'queued'
       order by created_at asc
       limit v_bulk_cap
    loop
      insert into public.jobs (workspace_id, type, payload, status, idempotency_key)
      values (b.workspace_id, 'blog.generate',
              jsonb_build_object('content_queue_id', q.id, 'workspace_id', b.workspace_id),
              'queued', 'bloggen-' || q.id)
      on conflict (workspace_id, type, idempotency_key) where idempotency_key is not null do nothing;
      if found then n := n + 1; end if;
    end loop;
    if b.status = 'queued' then
      update public.content_batch_jobs set status = 'running' where id = b.id;
    end if;
  end loop;

  return n;
end $$;
revoke all on function public.advance_content_pipeline() from public;
grant execute on function public.advance_content_pipeline() to service_role;
```

- [ ] **Step 4: Run the probe again to confirm it passes**

Run: `cd workers && node verify/m22bulkprobe.mjs`
Expected: `30 passed, 0 failed`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0039_m22_bulk.sql workers/verify/m22bulkprobe.mjs
git commit -m "feat(m22): bulk pacing lane in advance_content_pipeline (D-192)"
```

---

### Task 14: Frontend — Bulk Content Creation nav item, route, and Job Builder wizard

**Files:**
- Modify: `frontend/js/m22-content.js` (nav rail, hash router, new `viewBulk()`/`wireBulk()`)

This is a UI-only task on an existing mockup-first file (confirmed in research: this
file falls back to realistic mock data whenever no Supabase project is connected, via
the existing `rpc()`/`connected()` helpers). No new probe — verified via the browser in
Task 16, matching how `viewReview`/`viewTaxonomy` were built (no dedicated JS unit
tests for those views either; they're proven live).

- [ ] **Step 1: Add the nav rail entry**

At `frontend/js/m22-content.js:165-166`, change:
```js
        ${railItem("queue", "Review queue", "content/review", state.route === "review")}
        ${railItem("tag", "Categories &amp; authors", "content/taxonomy", state.route === "taxonomy")}
```
to:
```js
        ${railItem("queue", "Review queue", "content/review", state.route === "review")}
        ${railItem("tag", "Categories &amp; authors", "content/taxonomy", state.route === "taxonomy")}
        ${railItem("sparkle", "Bulk create", "content/bulk", state.route === "bulk")}
```

- [ ] **Step 2: Add the route to `parseHash()` and `render()`**

At `frontend/js/m22-content.js:692-699`, change:
```js
    if (parts[0] === "content") {
      if (!parts[1]) return { route: "content" };
      if (parts[1] === "review") return { route: "review" };
      if (parts[1] === "taxonomy") return { route: "taxonomy" };
      return { route: "editor", param: parts[1] };
    }
```
to:
```js
    if (parts[0] === "content") {
      if (!parts[1]) return { route: "content" };
      if (parts[1] === "review") return { route: "review" };
      if (parts[1] === "taxonomy") return { route: "taxonomy" };
      if (parts[1] === "bulk") return { route: "bulk" };
      return { route: "editor", param: parts[1] };
    }
```
At `frontend/js/m22-content.js:711-714`, change:
```js
    } else if (r.route === "review") { state.route = "review"; content = viewReview(); }
    else if (r.route === "taxonomy") { state.route = "taxonomy"; content = viewTaxonomy(); }
    else if (r.route === "settings") { state.route = "settings"; content = viewSettings(); }
    else { state.route = "content"; content = viewList(); }
```
to:
```js
    } else if (r.route === "review") { state.route = "review"; content = viewReview(); }
    else if (r.route === "taxonomy") { state.route = "taxonomy"; content = viewTaxonomy(); }
    else if (r.route === "bulk") { state.route = "bulk"; content = viewBulk(); }
    else if (r.route === "settings") { state.route = "settings"; content = viewSettings(); }
    else { state.route = "content"; content = viewList(); }
```
At `frontend/js/m22-content.js:718-719` (the `wireEditor`/`wireReview` dispatch just
below), change:
```js
    if (r.route === "editor") wireEditor();
    else if (r.route === "review") wireReview();
```
to:
```js
    if (r.route === "editor") wireEditor();
    else if (r.route === "review") wireReview();
    else if (r.route === "bulk") wireBulk();
```

- [ ] **Step 3: Add `bulkExpanded`/`bulkSelected` to app state, plus batch mock data + CSV parser**

At `frontend/js/m22-content.js:110-118`, change the `state` object:
```js
  const state = {
    route: "content", param: null,
    view: "default",            // mockup preview state: default|empty|loading|error|success
    articles: [], authors: [], cats: [],
    filters: { status: "all", cat: "all", author: "all", q: "" },
    selected: new Set(),
    editing: null,              // working copy of the open article
    revs: [],
  };
```
to:
```js
  const state = {
    route: "content", param: null,
    view: "default",            // mockup preview state: default|empty|loading|error|success
    articles: [], authors: [], cats: [],
    filters: { status: "all", cat: "all", author: "all", q: "" },
    selected: new Set(),
    editing: null,              // working copy of the open article
    revs: [],
    bulkExpanded: null,         // id of the batch job whose items panel is open, or null
    bulkSelected: new Set(),    // content_queue item ids checked in the open items panel
  };
```

Add near `MOCK_REVS` (after line 107) in `frontend/js/m22-content.js`:
```js
  // ── Bulk Content Creation mock state (mirrors seedArticles()'s honest-sample style) ─
  const MOCK_BATCHES = [
    { id: "b1", name: "Ramadan dua series", topic_source: "manual", status: "running",
      total_items: 12, model: "claude-sonnet-5", created_at: "2026-07-09T10:00:00Z" },
  ];
  const MOCK_TEMPLATES = [
    { id: "t1", name: "City travel guide", prompt_template: "A complete travel guide to [city] for [traveler_type]." },
  ];

  // Hand-rolled CSV parser, same quoting logic as frontend/js/m09-crm.js's parseCsvText —
  // kept local (not imported) since M22 and M09 are independent modules.
  function parseCsvText(text) {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.length);
    if (!lines.length) return { headers: [], rows: [] };
    const split = (line) => {
      const out = []; let cur = "", q = false;
      for (let i = 0; i < line.length; i++) { const ch = line[i];
        if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
        else { if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch; } }
      out.push(cur); return out.map((s) => s.trim());
    };
    const headers = split(lines[0]);
    const rows = lines.slice(1).map(split);
    return { headers, rows };
  }
```

- [ ] **Step 4: Add `viewBulk()` and `wireBulk()`**

Add after `viewTaxonomy()`/`wireTaxonomy()` (after line ~643, before `viewSettings()`
at line 645) in `frontend/js/m22-content.js`:
```js
  // ════════════════════════════════════════════════════════════════════════════
  //  ROUTE: /content/bulk — Bulk Content Creation (Job Builder + Status Dashboard)
  // ════════════════════════════════════════════════════════════════════════════
  const MOCK_BATCH_ITEMS = {
    b1: [
      { id: "bi1", article_id: "a-bi1", keyword: "best dua for travel", status: "in_review", duplicate: false },
      { id: "bi2", article_id: "a-bi2", keyword: "dua for anxiety", status: "in_review", duplicate: false },
      { id: "bi3", article_id: "a-bi3", keyword: "dua for travel", status: "in_review", duplicate: true },
    ],
  };

  function viewBulk() {
    const rows = MOCK_BATCHES.map((b) => {
      const items = MOCK_BATCH_ITEMS[b.id] || [];
      const dupCount = items.filter((i) => i.duplicate).length;
      return `<tr>
      <td>${esc(b.name)}</td><td><span class="pill st-${esc(b.status)}">${esc(b.status)}</span></td>
      <td>${b.total_items}</td><td>${esc(b.model)}</td>
      <td>${dupCount ? `<span class="pill st-warn">${dupCount} dup</span>` : "—"}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-sm" data-review-batch="${b.id}">Review items</button>
        <button class="btn btn-sm" data-schedule="${b.id}">Schedule spread</button>
        <button class="btn btn-sm" data-rollback="${b.id}">Rollback</button>
      </td>
    </tr>${state.bulkExpanded === b.id ? `<tr><td colspan="6">${batchItemsPanel(b, items)}</td></tr>` : ""}`;
    }).join("");
    const dashboard = MOCK_BATCHES.length
      ? `<table class="tbl"><thead><tr><th>Name</th><th>Status</th><th>Items</th><th>Model</th><th>Duplicates</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      : `<div class="card panel"><div class="empty-state"><h3>No batch jobs yet</h3><p>Build your first batch below.</p></div></div>`;

    const templateOpts = MOCK_TEMPLATES.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("");

    return pageHead("Bulk", "Bulk create", "Generate a batch of articles from a topic list, a CSV, or an AI-expanded seed keyword — preview a few before committing the rest.", "")
      + `<div class="card panel" style="margin-bottom:16px">
        <h3 style="margin-top:0">New batch</h3>
        <div class="form-field"><label>Batch name</label><input id="bName" placeholder="e.g. Ramadan dua series"></div>
        <div class="form-field"><label>Topic source</label>
          <select id="bSource"><option value="manual">Manual list</option><option value="csv">CSV upload</option><option value="ai_seed">AI-generate from seed keyword</option></select>
        </div>
        <div id="bSourceInputs">
          <div class="form-field"><label>Topics (one per line)</label><textarea id="bManualTopics" rows="4" placeholder="best dua for travel&#10;dua for anxiety"></textarea></div>
        </div>
        <div class="form-field"><label>Template (optional)</label><select id="bTemplate"><option value="">None</option>${templateOpts}</select></div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <div class="form-field"><label>Model</label><select id="bModel"><option value="claude-sonnet-5">Claude Sonnet 5 (quality)</option><option value="claude-3-5-haiku-20241022">Claude Haiku (cheap)</option></select></div>
          <div class="form-field"><label>Word count min</label><input id="bWordMin" type="number" value="800"></div>
          <div class="form-field"><label>Word count max</label><input id="bWordMax" type="number" value="1600"></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <button class="btn" id="bEstimate">Estimate cost</button>
          <button class="btn" id="bPreview">Generate 3 samples</button>
          <button class="btn btn-primary" id="bCommit">Commit batch</button>
        </div>
        <div id="bEstimateOut" class="muted" style="margin-top:8px"></div>
      </div>
      <h3>Batch status</h3>${dashboard}`;
  }

  // batchItemsPanel — the Bulk Edit/Reject drill-down: one row per content_queue item
  // this batch produced, with a checkbox + status + duplicate flag, and a toolbar that
  // applies approve/reject to every checked row via the SAME per-article RPCs the
  // Review queue already uses (approve_article/reject_article) — no new RPCs needed,
  // this is just a multi-select wrapper around the existing single-article actions.
  function batchItemsPanel(batch, items) {
    const rows = items.map((i) => `<tr>
      <td><input type="checkbox" data-bi-chk="${i.id}" ${state.bulkSelected.has(i.id) ? "checked" : ""}></td>
      <td>${esc(i.keyword)}</td><td><span class="pill st-${esc(i.status)}">${esc(i.status)}</span></td>
      <td>${i.duplicate ? `<span class="pill st-warn">possible duplicate</span>` : "—"}</td>
    </tr>`).join("");
    return `<div class="card panel" style="margin:8px 0">
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <button class="btn btn-sm" id="biApproveAll">Approve selected</button>
        <button class="btn btn-sm" id="biRejectAll">Reject selected</button>
      </div>
      <table class="tbl"><thead><tr><th></th><th>Topic</th><th>Status</th><th>Duplicate</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  }

  function wireBulk() {
    const src = $("#bSource"); if (src) src.onchange = () => {
      const inputs = $("#bSourceInputs"); if (!inputs) return;
      if (src.value === "csv") inputs.innerHTML = `<div class="form-field"><label>CSV file</label><input id="bCsvFile" type="file" accept=".csv"></div>`;
      else if (src.value === "ai_seed") inputs.innerHTML = `<div class="form-field"><label>Seed keyword / category</label><input id="bSeed" placeholder="e.g. Ramadan content"></div><div class="form-field"><label>How many topics</label><input id="bSeedCount" type="number" value="20"></div>`;
      else inputs.innerHTML = `<div class="form-field"><label>Topics (one per line)</label><textarea id="bManualTopics" rows="4" placeholder="best dua for travel&#10;dua for anxiety"></textarea></div>`;
    };

    function collectTopics() {
      const source = $("#bSource")?.value || "manual";
      if (source === "csv") {
        const file = $("#bCsvFile")?.files?.[0];
        if (!file) return [];
        return []; // resolved asynchronously via FileReader in a real commit handler; the
                   // wizard's Estimate/Preview/Commit buttons below call this synchronously
                   // for manual/ai_seed and separately await CSV parsing when a file is present.
      }
      if (source === "ai_seed") {
        const seed = $("#bSeed")?.value.trim(); if (!seed) return [];
        const n = parseInt($("#bSeedCount")?.value || "20", 10);
        return Array.from({ length: n }, (_, i) => ({ keyword: `${seed} — topic ${i + 1}` }));
      }
      const raw = $("#bManualTopics")?.value || "";
      return raw.split("\n").map((s) => s.trim()).filter(Boolean).map((keyword) => ({ keyword }));
    }

    async function withCsvTopics(cb) {
      const source = $("#bSource")?.value || "manual";
      if (source !== "csv") return cb(collectTopics());
      const file = $("#bCsvFile")?.files?.[0];
      if (!file) { toast("Choose a CSV file first", "danger"); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const { rows } = parseCsvText(String(reader.result || ""));
        cb(rows.map((r) => ({ keyword: r[0] })).filter((t) => t.keyword));
      };
      reader.readAsText(file);
    }

    function batchArgs() {
      return {
        p_ws: null, // resolved server-side by has_role() against the caller's session in live mode
        p_site: SITE.id, p_name: $("#bName")?.value.trim() || "Untitled batch",
        p_topic_source: $("#bSource")?.value || "manual",
        p_template: $("#bTemplate")?.value || null,
        p_model: $("#bModel")?.value || "claude-sonnet-5",
        p_word_min: parseInt($("#bWordMin")?.value || "800", 10),
        p_word_max: parseInt($("#bWordMax")?.value || "1600", 10),
      };
    }

    const est = $("#bEstimate"); if (est) est.onclick = () => withCsvTopics(async (topics) => {
      if (!topics.length) return toast("Add at least one topic first", "danger");
      const out = $("#bEstimateOut");
      if (connected()) {
        const { data: id } = await client().rpc("create_batch_job", { ...batchArgs(), p_topics: topics });
        const { data: est2 } = await client().rpc("estimate_batch_cost", { p_batch: id });
        if (out) out.textContent = `~${est2?.est_tokens ?? 0} tokens, ~$${est2?.est_cost_usd ?? 0} for ${topics.length} articles`;
      } else if (out) {
        const roughTokens = Math.round(((parseInt($("#bWordMin").value,10)+parseInt($("#bWordMax").value,10))/2)*2.2*topics.length);
        out.textContent = `~${roughTokens} tokens, ~$${(roughTokens/1000*0.009).toFixed(2)} for ${topics.length} articles (preview)`;
      }
    });

    const prev = $("#bPreview"); if (prev) prev.onclick = () => withCsvTopics(async (topics) => {
      if (!topics.length) return toast("Add at least one topic first", "danger");
      await rpc("generate_batch_preview", { p_n: 3 }, () => {
        MOCK_BATCHES.unshift({ id: "b" + Math.random().toString(36).slice(2, 6), name: $("#bName").value || "Untitled batch",
          topic_source: $("#bSource").value, status: "previewing", total_items: topics.length, model: $("#bModel").value, created_at: new Date().toISOString() });
      }, "Generated 3 preview samples"); render();
    });

    const commit = $("#bCommit"); if (commit) commit.onclick = () => withCsvTopics(async (topics) => {
      if (!topics.length) return toast("Add at least one topic first", "danger");
      await rpc("commit_batch_job", {}, () => {
        const existing = MOCK_BATCHES.find((b) => b.status === "previewing");
        if (existing) existing.status = "queued"; else MOCK_BATCHES.unshift({
          id: "b" + Math.random().toString(36).slice(2, 6), name: $("#bName").value || "Untitled batch",
          topic_source: $("#bSource").value, status: "queued", total_items: topics.length, model: $("#bModel").value, created_at: new Date().toISOString() });
      }, "Batch committed — generation will drain via the scheduler"); render();
    });

    document.querySelectorAll("[data-rollback]").forEach((b) => b.onclick = async () => {
      const id = b.getAttribute("data-rollback");
      await rpc("rollback_batch_job", { p_batch: id }, () => {
        const batch = MOCK_BATCHES.find((x) => x.id === id); if (batch) batch.status = "rolled_back";
      }, "Batch rolled back"); render();
    });

    document.querySelectorAll("[data-review-batch]").forEach((b) => b.onclick = () => {
      const id = b.getAttribute("data-review-batch");
      state.bulkExpanded = state.bulkExpanded === id ? null : id;
      state.bulkSelected.clear(); render();
    });

    document.querySelectorAll("[data-schedule]").forEach((b) => b.onclick = async () => {
      const id = b.getAttribute("data-schedule");
      const days = parseInt(prompt("Spread across how many days?", "7") || "0", 10);
      const perDay = parseInt(prompt("How many per day?", "3") || "0", 10);
      if (!days || !perDay) return;
      await rpc("schedule_batch_publish_spread",
        { p_batch: id, p_start: new Date().toISOString(), p_spread_days: days, p_per_day: perDay },
        () => { const batch = MOCK_BATCHES.find((x) => x.id === id); if (batch) batch.status = "completed"; },
        "Publish dates spread across the batch"); render();
    });

    document.querySelectorAll("[data-bi-chk]").forEach((n) => n.onclick = () => {
      const id = n.getAttribute("data-bi-chk");
      state.bulkSelected.has(id) ? state.bulkSelected.delete(id) : state.bulkSelected.add(id);
    });

    const approveAll = $("#biApproveAll"); if (approveAll) approveAll.onclick = async () => {
      for (const id of state.bulkSelected) {
        const item = (MOCK_BATCH_ITEMS[state.bulkExpanded] || []).find((i) => i.id === id);
        if (item) await rpc("approve_article", { p_article: item.article_id }, () => { item.status = "published"; }, `Approved ${item.keyword}`);
      }
      state.bulkSelected.clear(); render();
    };
    const rejectAll = $("#biRejectAll"); if (rejectAll) rejectAll.onclick = async () => {
      for (const id of state.bulkSelected) {
        const item = (MOCK_BATCH_ITEMS[state.bulkExpanded] || []).find((i) => i.id === id);
        if (item) await rpc("reject_article", { p_article: item.article_id, p_feedback: "Bulk-rejected — please revise." }, () => { item.status = "draft"; }, `Sent back ${item.keyword}`);
      }
      state.bulkSelected.clear(); render();
    };
  }
```

- [ ] **Step 5 (verification): Confirm the file still parses**

Run: `node --check frontend/js/m22-content.js`
Expected: no output (valid syntax). Full behavioral verification happens live in
Task 16 (preview-verify), matching how this file's other views were built and tested.

- [ ] **Step 6: Commit**

```bash
git add frontend/js/m22-content.js
git commit -m "feat(m22): Bulk Content Creation Job Builder wizard + status dashboard"
```

---

### Task 15: Update `scripts/verify.sh` to wire the two new probes

**Files:**
- Modify: `scripts/verify.sh`

- [ ] **Step 1: Add the new probe invocations**

Following the exact existing pattern (`( cd workers && node verify/<name>probe.mjs )
|| fails=$((fails+1))`), add near the existing M22 probe line in `scripts/verify.sh`:
```bash
echo; echo "══ +  M22-auto: real LLM adapter (unit, no network) ══"
( cd workers && node verify/llmprobe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M22-auto: Bulk Content Creation schema + RLS + RPCs (PGlite) ══"
( cd workers && node verify/m22bulkprobe.mjs ) || fails=$((fails+1))
```

- [ ] **Step 2: Run the full verify script**

Run: `bash scripts/verify.sh`
Expected: every existing probe still passes (no regression), plus the two new lines
show `PASS` counts with `0 failed`, and the script's final `fails -eq 0` exit is 0.
If the optional live-stack section at the end reports `SKIPPED` (no `SUPABASE_URL`
configured locally), that's expected and not a failure — same as it was before this
change.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify.sh
git commit -m "test(m22): wire llmprobe.mjs + m22bulkprobe.mjs into scripts/verify.sh"
```

---

### Task 16: Gate-8 + preview-verify pass

**Files:** none (verification only)

- [ ] **Step 1: Run Gate-8 (the repo's static lint gate)**

Run: `bash scripts/gate8.sh`
Expected: clean for every file touched in this plan (`workers/worker.mjs`,
`workers/llm.mjs`, `frontend/js/blog-pipeline.mjs`, `frontend/js/m22-content.js`,
`supabase/migrations/0039_m22_bulk.sql`, `supabase/seed.sql`). If it flags something,
fix it before proceeding — do not skip Gate-8.

- [ ] **Step 2: Run the full verify suite one more time end-to-end**

Run: `bash scripts/verify.sh`
Expected: `0` exit code, every probe green including the two new ones from Task 15.

- [ ] **Step 3: Preview-verify the Bulk Content Creation UI**

Using the project's browser preview tooling: open the M22 content module, navigate to
`#/content/bulk`, confirm: the nav rail shows "Bulk create"; the Job Builder wizard
renders with all fields; switching "Topic source" between Manual/CSV/AI-generate swaps
the input correctly; "Estimate cost" and "Generate 3 samples" produce a toast (mockup
mode, no live Supabase project needed); the Batch status table renders the mock batch
row with a working Rollback button. Resize to 375px and 1200px in both light and dark
themes — confirm 0 horizontal scroll and no console errors, matching this module's
existing verification bar.

- [ ] **Step 4: Final commit (only if Steps 1-3 required fixes)**

If any fixes were needed:
```bash
git add -A
git commit -m "fix(m22): Gate-8 + preview-verify cleanup for bulk content pipeline"
```
If no fixes were needed, this task requires no commit — the work is already committed
task-by-task.

---

## Post-implementation note (not a task)

`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` GitHub repo secrets (Task 2) and a Vault
`plat__anthropic__api_key` secret (same one-time step D-186/M20 already documented)
are both required before real generation or the GitHub Actions worker-cron produce
live effects — until then, every code path here degrades automatically to its
existing deterministic/skipped fallback, exactly as designed. Nothing in this plan
requires those secrets to exist in order to implement and verify it.
