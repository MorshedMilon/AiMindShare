# M20 AI Funnel Studio — Prompt-First Upgrade + LLM Provider Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gap between the existing guided-only AI Funnel Studio and the master prompt's prompt-first vision: wire a real Anthropic LLM behind the platform's existing usage-metering infrastructure, and redesign the Studio landing into a hero-led, prompt-first page with an optional funnel-type selector, while preserving every RPC/table the three prior passes (M20 v2, M20 v3, M29) already shipped.

**Architecture:** Phase 1 adds a `funnel-ai-generate` Supabase Edge Function that calls Anthropic when a key is configured, gated by the existing `ai_tokens` meter (`meter_check`/`meter_increment`, M03) and a new M20-owned rate-limit table, and falls back automatically to the existing deterministic `recommend_funnel_blueprint` RPC otherwise. Phase 2 rewrites the M20 Studio landing screen (`viewStudio()` and its helpers in `frontend/js/m20-funnels.js`) into the hero/prompt/type-cards/guided-fields/advanced/how-it-works/recent layout the spec describes, calling the new Edge Function instead of the RPC directly.

**Tech Stack:** Supabase (Postgres + Deno Edge Functions), Anthropic Messages API, vanilla hash-routed JS frontend (no framework), PGlite for SQL-layer verification (`workers/verify/m20probe.mjs`).

**Testing note (read before starting):** This repo has no Docker, no Deno test harness for Edge Functions, and no frontend test framework (confirmed by research: `Deno.test` appears nowhere under `supabase/functions/`). The only real TDD loop available is the SQL layer via `workers/verify/m20probe.mjs` against PGlite (in-memory Postgres, no Docker) — Phase 1's migration and its rate-limit function get real red/green TDD there. The Edge Function's own branching logic (auth, meter gate, LLM call, fallback) is verified by code review + a manual smoke test once a live Supabase stack is available (same posture as every other Edge Function in this repo, e.g. `inbox-send`), not by an automated test — do not invent a test harness that doesn't match repo convention. Phase 2's frontend changes are verified with the `preview_*` browser tools against a running dev server, per this repo's established UI-verification practice.

**Reference spec:** `docs/superpowers/specs/2026-07-10-m20-ai-funnel-studio-design.md` (already approved) — this plan implements it exactly, with two small refinements made during research (both consistent with the spec's intent, noted where they occur):
1. The "usage_events"-based rate limit becomes a dedicated M20-owned table (`funnel_ai_generation_log`) instead of reusing M03's generic `usage_events`, because `m20probe.mjs`'s isolated PGlite instance doesn't load M03's migrations (0003/0009) and adding that cross-module coupling to an unrelated probe file was judged riskier than giving M20 its own small, testable table — this table doubles as the "detailed usage events" log the design asked for.
2. Selecting a funnel-type card seeds the structured `answers` bag with sensible defaults for that category (and picks which guided fields show) rather than hard-forcing one of the 15 internal `funnel_type` values — the deterministic engine / LLM still makes the final call on exactly which of the 15 types fits, same as today. This preserves the existing engine's nuance while still satisfying "selecting a type updates the guided fields below."

---

## Progress log (update this as tasks land — source of truth across sessions)

Executing via `superpowers:subagent-driven-development` (fresh implementer subagent per task, then spec-compliance review, then code-quality review, committing directly to `main` — explicit user consent given for this session).

- [x] **Task 1** — migration 0038 created, code-review comment fix applied. Commits: `3e5c4c1`, `dd3237a`.
- [x] **Task 2** — m20probe.mjs extended (migration list + §23, 8 new assertions — corrected from an earlier miscount of "11"), verified green (174 passed, 0 failed) and `bash scripts/verify.sh` full-green. Commit: `d7a9367`. Spec-compliance review: ✅ exact match, independently re-run and confirmed. Code-quality review: ✅ approved, no issues. Both two-stage reviews now complete — task fully done.
- [x] **Task 3** — `_shared/llm.ts` created verbatim. Commit: `bbd87be`. Both reviews ✅ (minor "provider-agnostic naming" nitpick noted, not blocking).
- [x] **Task 4** — `funnel-ai-generate/index.ts` created verbatim; all four `_shared/` import signatures independently verified against real files, no mismatches. Commit: `23102b8`. Both reviews ✅ (one "Important" finding — rate-limit hard-fails vs. quota-exceeded falls back — confirmed intentional, matches the approved design spec's explicit distinction, no fix needed).
- [x] **Task 5** — Anthropic `usedBy` now `["M08","M20","M33"]` in both provider registries; Operational note appended to the design spec. Commit: `2718d2f`. Both reviews ✅.
- [x] **Task 6** — Phase 1 checkpoint: `bash scripts/verify.sh` full-green (174 passed), TASKS.md + DECISIONS D-186 appended. Commit: `b4df9b5`. Spec review ✅. Code-quality review flagged a "Critical" probe-baseline-count error (claimed 158→174 instead of 166→174) — **independently verified this was wrong**: ran the actual pre-Task-2 probe file at commit `129a605` and confirmed it output exactly 166 passed, so 166→174 (+8) as documented is correct. No fix applied; the reviewer's finding was itself mistaken. **Phase 1 complete.**
- [x] **Task 7** — `TYPE_CARDS` + `parsePromptToAnswers` added verbatim. `INSTANT_AWARENESS_DEFAULT` deliberately NOT deleted (still referenced by `readStudioStage()`'s instant branch) — **Task 11 must delete it** when it removes that branch. Commit: `e2bb2c2`. Both reviews ✅.
- [x] **Task 8** — `ensureStudio()` rewritten to new state shape verbatim. Commit: `aaa19af`. Both reviews ✅ (reviewer raised the expected intermediate-inconsistency point, accepted as by-design for this same-session sequence).
- [x] **Task 9** — 5 wizard-only identifiers deleted (`STUDIO_STAGES`/`STUDIO_LABEL`/`studioModePicker`/`studioStepper`/`studioNav`), 8 new landing-helper functions added verbatim. Commit: `2aec676`. Both reviews ✅ (XSS/escaping specifically checked and confirmed correct, incl. attribute-context escaping of LLM-supplied chip values).
- [ ] Task 10 — not started
- [ ] Task 9 — not started
- [ ] Task 10 — not started
- [ ] Task 11 — not started
- [ ] Task 12 — not started
- [ ] Task 13 — not started
- [ ] Task 14 — not started (Phase 2 checkpoint)

**To resume:** re-invoke `superpowers:subagent-driven-development`, do Task 2's two-stage review, then continue sequentially from Task 3. Full task text for every task is already in this file below — no other context file is needed.

---

## Phase 1 — LLM Provider Layer

### Task 1: Migration 0038 — generation tracking + rate limit (SQL, TDD)

**Files:**
- Create: `supabase/migrations/0038_m20_funnels_v3d.sql`
- Test: `workers/verify/m20probe.mjs` (Task 2 adds the assertions; this task only creates the migration)

- [ ] **Step 1: Write the migration**

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- 0038_m20_funnels_v3d.sql — M20 AI Funnel Studio, Phase 1 (LLM provider layer).
--
-- Everything here is additive: three nullable columns on funnel_blueprints, one
-- new workspace-scoped observability/rate-limit table, and a widened
-- save_funnel_blueprint (same drop+recreate pattern 0037 used for
-- convert_blueprint_to_funnel — appending trailing default params). ai_tokens
-- billing itself still goes through M03's existing meter_check/meter_increment
-- RPCs, called from the funnel-ai-generate Edge Function at runtime — this
-- migration does not touch M03 at all.
--
-- funnel_ai_generation_log is M20-owned (mirrors funnel_operations_log, 0032):
-- one row per funnel-ai-generate call (LLM blueprint, LLM clarify-round, or
-- deterministic fallback), giving the detailed per-generation usage log
-- (workspace/user/model/tokens/source) and the source of truth for the
-- per-workspace hourly rate limit on real LLM calls. DECISIONS D-186.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. funnel_blueprints — track how each blueprint was generated ───────────
alter table public.funnel_blueprints add column if not exists generation_source text check (generation_source in ('llm','deterministic'));
alter table public.funnel_blueprints add column if not exists llm_model text;
alter table public.funnel_blueprints add column if not exists tokens_used integer;

-- ── 2. funnel_ai_generation_log — per-call usage log + rate-limit source ────
create table if not exists public.funnel_ai_generation_log (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  user_id           uuid references auth.users(id) on delete set null,
  generation_source text not null check (generation_source in ('llm','llm_clarify','deterministic')),
  model             text,
  tokens_used       integer,
  prompt_length     integer,
  created_at        timestamptz not null default now()
);
create index if not exists funnel_ai_generation_log_ws_idx on public.funnel_ai_generation_log (workspace_id, created_at desc);

alter table public.funnel_ai_generation_log enable row level security;
-- Same shape as funnel_visits (D-094): members can read, only the service role
-- (the Edge Function's admin client, which bypasses RLS) can write — no insert
-- policy exists for `authenticated` at all, so even staff cannot write directly.
create policy funnel_ai_generation_log_sel on public.funnel_ai_generation_log for select using ( public.is_member(workspace_id) );

-- ── 3. funnel_ai_rate_limited — 20 real LLM calls / workspace / rolling hour ─
-- Only counts llm/llm_clarify rows — deterministic fallback calls are free (a
-- plain SQL RPC) and never need limiting, however many a workspace makes.
create or replace function public.funnel_ai_rate_limited(p_workspace uuid)
returns boolean language sql stable as $$
  select count(*) >= 20
  from public.funnel_ai_generation_log
  where workspace_id = p_workspace
    and generation_source in ('llm','llm_clarify')
    and created_at > now() - interval '1 hour';
$$;
grant execute on function public.funnel_ai_rate_limited(uuid) to authenticated, service_role;

-- ── 4. save_funnel_blueprint — widen with generation-tracking params ────────
-- Same drop+recreate-with-trailing-defaults pattern 0037 used for
-- convert_blueprint_to_funnel; every existing 3-4-arg caller keeps working
-- unchanged (the new params default to null).
drop function if exists public.save_funnel_blueprint(uuid, jsonb, jsonb, uuid);
create or replace function public.save_funnel_blueprint(
  p_ws uuid, p_answers jsonb, p_blueprint jsonb, p_blueprint_id uuid default null,
  p_generation_source text default null, p_llm_model text default null, p_tokens_used integer default null
)
returns public.funnel_blueprints language plpgsql security definer set search_path = public as $$
declare v_row public.funnel_blueprints;
begin
  if auth.uid() is not null and not public.has_role(p_ws, 'staff') then
    raise exception 'saving a blueprint requires staff+' using errcode = '42501';
  end if;
  if p_blueprint_id is not null then
    update public.funnel_blueprints set answers = p_answers, blueprint = p_blueprint,
      generation_source = p_generation_source, llm_model = p_llm_model, tokens_used = p_tokens_used
      where id = p_blueprint_id and workspace_id = p_ws and status = 'draft'
      returning * into v_row;
    if v_row.id is null then raise exception 'blueprint not found or not editable' using errcode = 'P0002'; end if;
  else
    insert into public.funnel_blueprints (workspace_id, created_by, answers, blueprint, generation_source, llm_model, tokens_used)
    values (p_ws, auth.uid(), p_answers, p_blueprint, p_generation_source, p_llm_model, p_tokens_used)
    returning * into v_row;
  end if;
  return v_row;
end $$;
revoke all on function public.save_funnel_blueprint(uuid, jsonb, jsonb, uuid, text, text, integer) from public;
grant execute on function public.save_funnel_blueprint(uuid, jsonb, jsonb, uuid, text, text, integer) to authenticated, service_role;
```

- [ ] **Step 2: Sanity-check the file parses**

Run: `node -e "require('fs').readFileSync('supabase/migrations/0038_m20_funnels_v3d.sql','utf8')"`
Expected: no output (file exists and is readable — the real syntax check happens in Task 2 when PGlite loads it)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0038_m20_funnels_v3d.sql
git commit -m "M20 v3d: funnel_blueprints generation tracking + AI rate-limit table (migration 0038)"
```

---

### Task 2: Extend `m20probe.mjs` — load 0038, add §23 assertions (TDD)

**Files:**
- Modify: `workers/verify/m20probe.mjs:102-108` (migration list)
- Modify: `workers/verify/m20probe.mjs` (insert new §23 section right before the final summary block, currently around line 851 — search for `console.log(\`\n${fail === 0 ...` to find the exact insertion point since line numbers will have shifted)

- [ ] **Step 1: Add migration 0038 to the load list**

In the `for (const m of [...])` array (`workers/verify/m20probe.mjs:102-108`), change the last entry:

```js
                   "0035_m20_funnels_v3b.sql", "0036_m20_funnels_v3c.sql", "0037_m29_affiliate_hub.sql",
                   "0038_m20_funnels_v3d.sql"]) {
```

- [ ] **Step 2: Run the probe to confirm it still loads clean (no new assertions yet)**

Run: `node workers/verify/m20probe.mjs`
Expected: same pass/fail counts as before this change (0038 has no syntax errors, no assertions added yet) — if it errors, the migration has a syntax bug, fix Task 1 before continuing.

- [ ] **Step 3: Write the failing assertions**

Insert this new section immediately before the final `console.log(\`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M20 probe: ${pass} passed, ${fail} failed\x1b[0m\`);` block (the last section in the file, after the `sweep_abandoned_funnels` job-run assertion):

```js
  // ── 23. AI Funnel Studio v1 — generation-source tracking + rate limit (D-186) ──
  console.log("\nM20 v3d · funnel_ai_generation_log + funnel_ai_rate_limited:");
  await reset(); await as(STAFF_A);
  const genBp = await rec({ objective: "webinar_signups" });
  const genSaved = (await pg.query(
    `select b.* from public.save_funnel_blueprint($1,$2,$3,$4,$5,$6,$7) as b`,
    [WSA, JSON.stringify({ objective: "webinar_signups" }), JSON.stringify(genBp), null, "llm", "claude-3-5-haiku", 842]
  )).rows[0];
  assert(genSaved.generation_source === "llm" && genSaved.llm_model === "claude-3-5-haiku" && genSaved.tokens_used === 842,
    `save_funnel_blueprint persists generation_source/llm_model/tokens_used (got ${JSON.stringify({ s: genSaved.generation_source, m: genSaved.llm_model, t: genSaved.tokens_used })})`);

  const legacySaved = (await pg.query(`select b.* from public.save_funnel_blueprint($1,$2,$3) as b`,
    [WSA, JSON.stringify({}), JSON.stringify(genBp)])).rows[0];
  assert(legacySaved.generation_source === null, "the old 3-arg call shape still works and leaves generation_source null (backward compatible)");

  await reset();
  await pg.exec(`insert into public.funnel_ai_generation_log (workspace_id, generation_source, model, tokens_used, prompt_length)
    select '${WSA}', 'llm', 'claude-3-5-haiku', 500, 60 from generate_series(1,19);`);
  await as(STAFF_A);
  let limited = (await pg.query(`select public.funnel_ai_rate_limited($1) as r`, [WSA])).rows[0].r;
  assert(limited === false, "19 llm calls in the last hour is under the 20/hour limit");
  await reset();
  await pg.exec(`insert into public.funnel_ai_generation_log (workspace_id, generation_source, model, tokens_used, prompt_length)
    values ('${WSA}', 'llm_clarify', 'claude-3-5-haiku', 120, 40);`);
  await as(STAFF_A);
  limited = (await pg.query(`select public.funnel_ai_rate_limited($1) as r`, [WSA])).rows[0].r;
  assert(limited === true, "the 20th llm/llm_clarify call in the hour trips the rate limit");

  await reset();
  await pg.exec(`insert into public.funnel_ai_generation_log (workspace_id, generation_source, prompt_length)
    select '${WSB}', 'deterministic', 30 from generate_series(1,25);`);
  await as(STAFF_B);
  const wsbLimited = (await pg.query(`select public.funnel_ai_rate_limited($1) as r`, [WSB])).rows[0].r;
  assert(wsbLimited === false, "deterministic-fallback calls never count toward the LLM rate limit, however many there are");

  await reset(); await as(STAFF_B);
  const logVisibleToB = await count(pg, `select count(*)::int n from public.funnel_ai_generation_log where workspace_id = $1`, [WSA]);
  assert(logVisibleToB === 0, "RLS: a non-member (B) cannot SELECT A's generation log rows");

  await reset(); await as(CLIENT_A);
  const logVisibleToClient = await count(pg, `select count(*)::int n from public.funnel_ai_generation_log where workspace_id = $1`, [WSA]);
  assert(logVisibleToClient >= 1, "a CLIENT (member, below staff) can still read the workspace's generation log");

  await reset(); await as(STAFF_A);
  assert(await denied(pg, `insert into public.funnel_ai_generation_log (workspace_id, generation_source) values ($1,'llm')`, [WSA]),
    "even staff (authenticated, non-service-role) cannot INSERT a generation log row directly — Edge Function's admin client only");
```

- [ ] **Step 4: Run the probe, confirm every new assertion passes**

Run: `node workers/verify/m20probe.mjs`
Expected: `M20 probe: <N+11> passed, 0 failed` (11 new assertions, zero regressions in the pre-existing ones). If any new assertion fails, fix the migration (Task 1) or the assertion — do not weaken an assertion to force a pass.

- [ ] **Step 5: Run the full verify suite to confirm no cross-module regression**

Run: `bash scripts/verify.sh`
Expected: every probe listed prints a green summary; the M03/M29/M19/etc. probes are unaffected since this migration only touches M20-owned objects.

- [ ] **Step 6: Commit**

```bash
git add workers/verify/m20probe.mjs
git commit -m "M20 v3d probe: verify generation-source tracking + AI rate limit (0038, D-186)"
```

---

### Task 3: `_shared/llm.ts` — Anthropic provider adapter

**Files:**
- Create: `supabase/functions/_shared/llm.ts`

- [ ] **Step 1: Write the module**

```ts
// _shared/llm.ts — provider-agnostic LLM adapter for AI-generated content across
// AiMindShare modules (first consumer: M20's funnel-ai-generate). Mirrors the
// self-contained-provider-adapter shape of _shared/email.ts (its own
// getVaultSecret, not a shared import) so this module has zero dependencies on
// any other provider file.
//
// Vault secret names (M41 §3 deterministic naming), same convention as SendGrid:
//   workspace override :  ws_<uuid>__anthropic__api_key
//   platform default   :  plat__anthropic__api_key
// No key configured (neither scope) → callers get { kind: "unavailable",
// reason: "no_key" } and the caller falls back to a deterministic path. This is
// the ENTIRE seam for turning AI generation on: set the platform secret,
// nothing else changes (D-186).
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-3-5-haiku-20241022";
const REQUEST_TIMEOUT_MS = 10_000;

export const anthropicKeyName = (workspaceId: string | null): string =>
  workspaceId ? `ws_${workspaceId}__anthropic__api_key` : `plat__anthropic__api_key`;

export async function getVaultSecret(db: SupabaseClient, name: string): Promise<string | null> {
  const { data, error } = await db
    .schema("vault")
    .from("decrypted_secrets")
    .select("decrypted_secret")
    .eq("name", name)
    .maybeSingle();
  if (error || !data?.decrypted_secret) return null;
  return data.decrypted_secret as string;
}

export async function resolveAnthropicKey(db: SupabaseClient, workspaceId: string): Promise<string | null> {
  return (await getVaultSecret(db, anthropicKeyName(workspaceId)))
    ?? (await getVaultSecret(db, anthropicKeyName(null)));
}

export type ClarifyingQuestion = { question: string; chips: string[] };
export type FunnelBlueprint = {
  funnel_type: string; reasoning: string;
  steps: { step_type: string; role_label: string; cta_direction: string; purpose: string }[];
  order_bump_suggested: boolean; upsell_suggested: boolean; downsell_suggested: boolean;
  test_ideas: string[]; launch_checklist_emphasis: string[];
};
export type BlueprintGenerationResult =
  | { kind: "blueprint"; blueprint: FunnelBlueprint; tokensUsed: number; model: string }
  | { kind: "clarify"; questions: ClarifyingQuestion[]; tokensUsed: number }
  | { kind: "unavailable"; reason: "no_key" | "provider_error" | "timeout" | "bad_response" };

const VALID_STEP_TYPES = ["optin", "sales", "order", "upsell", "downsell", "thankyou"];
const VALID_FUNNEL_TYPES = [
  "lead_magnet", "webinar", "booking", "application", "vsl", "direct_checkout",
  "tripwire", "low_ticket", "course_membership", "product_launch", "quiz", "challenge",
  "affiliate_bridge", "affiliate_review", "affiliate_comparison",
];

const SYSTEM_PROMPT = `You are the funnel-planning engine inside AiMindShare's AI Funnel Studio.
Given a business description (free text) and/or structured answers, either:
(a) return a complete funnel blueprint, or
(b) if the business/offer/audience is too vague to plan confidently, ask up to 3 short
    clarifying questions instead.

If the structured answers include "funnel_type_hint", treat it as a strong steer toward
that category (lead_gen, sales, affiliate, webinar, or quiz) but still choose the exact
one of the 15 funnel_type values yourself within that family.

Respond with ONLY one JSON object, no prose, no markdown fences, matching exactly one
of these two shapes:

Blueprint:
{"kind":"blueprint","funnel_type":"<one of: ${VALID_FUNNEL_TYPES.join(", ")}>","reasoning":"<1-2 sentences>","steps":[{"step_type":"<one of: ${VALID_STEP_TYPES.join(", ")}>","role_label":"<short label>","cta_direction":"<button/CTA copy>","purpose":"<1 sentence>"}],"order_bump_suggested":<bool>,"upsell_suggested":<bool>,"downsell_suggested":<bool>,"test_ideas":["<idea>", "..."],"launch_checklist_emphasis":["<item>", "..."]}

Clarify:
{"kind":"clarify","questions":[{"question":"<short question>","chips":["<quick answer>", "<quick answer>", "<quick answer>"]}]}

Rules: at most 3 questions. Affiliate offers (mentions of "affiliate", "promote someone
else's product", "commission", or offer_source="affiliate") never get order/upsell/
downsell steps — the sale happens on the vendor's site, so order_bump_suggested,
upsell_suggested, and downsell_suggested must all be false and no step has step_type
"order". Prefer a blueprint over clarifying whenever you can make a reasonable inference
from what's given.`;

function buildUserMessage(prompt: string | null, answers: Record<string, unknown> | null): string {
  const parts: string[] = [];
  if (prompt) parts.push(`Business description: ${prompt}`);
  if (answers && Object.keys(answers).length) parts.push(`Structured answers: ${JSON.stringify(answers)}`);
  return parts.join("\n\n") || "No information given.";
}

function validateBlueprint(raw: any): FunnelBlueprint | null {
  if (!raw || typeof raw !== "object") return null;
  if (!VALID_FUNNEL_TYPES.includes(raw.funnel_type)) return null;
  if (!Array.isArray(raw.steps) || raw.steps.length === 0) return null;
  if (!raw.steps.every((s: any) => s && VALID_STEP_TYPES.includes(s.step_type) && typeof s.role_label === "string")) return null;
  const isAffiliate = String(raw.funnel_type).startsWith("affiliate_");
  if (isAffiliate && raw.steps.some((s: any) => s.step_type === "order")) return null;
  return {
    funnel_type: raw.funnel_type,
    reasoning: String(raw.reasoning ?? ""),
    steps: raw.steps.map((s: any) => ({
      step_type: s.step_type, role_label: String(s.role_label ?? ""),
      cta_direction: String(s.cta_direction ?? ""), purpose: String(s.purpose ?? ""),
    })),
    order_bump_suggested: isAffiliate ? false : !!raw.order_bump_suggested,
    upsell_suggested: isAffiliate ? false : !!raw.upsell_suggested,
    downsell_suggested: isAffiliate ? false : !!raw.downsell_suggested,
    test_ideas: Array.isArray(raw.test_ideas) ? raw.test_ideas.map(String) : [],
    launch_checklist_emphasis: Array.isArray(raw.launch_checklist_emphasis) ? raw.launch_checklist_emphasis.map(String) : [],
  };
}

function validateClarify(raw: any): ClarifyingQuestion[] | null {
  if (!raw || !Array.isArray(raw.questions) || raw.questions.length === 0 || raw.questions.length > 3) return null;
  if (!raw.questions.every((q: any) => q && typeof q.question === "string" && Array.isArray(q.chips))) return null;
  return raw.questions.map((q: any) => ({ question: q.question, chips: q.chips.map(String).slice(0, 4) }));
}

export async function generateFunnelBlueprint(
  apiKey: string | null, prompt: string | null, answers: Record<string, unknown> | null,
): Promise<BlueprintGenerationResult> {
  if (!apiKey) return { kind: "unavailable", reason: "no_key" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL, max_tokens: 1024, system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(prompt, answers) }],
      }),
      signal: controller.signal,
    });
    if (!resp.ok) return { kind: "unavailable", reason: "provider_error" };

    const body = await resp.json().catch(() => null);
    const text = body?.content?.[0]?.text;
    const tokensUsed = (body?.usage?.input_tokens ?? 0) + (body?.usage?.output_tokens ?? 0);
    if (!text) return { kind: "unavailable", reason: "bad_response" };

    let parsed: any;
    try { parsed = JSON.parse(text); } catch { return { kind: "unavailable", reason: "bad_response" }; }

    if (parsed.kind === "clarify") {
      const questions = validateClarify(parsed);
      if (!questions) return { kind: "unavailable", reason: "bad_response" };
      return { kind: "clarify", questions, tokensUsed };
    }
    const blueprint = validateBlueprint(parsed);
    if (!blueprint) return { kind: "unavailable", reason: "bad_response" };
    return { kind: "blueprint", blueprint, tokensUsed, model: ANTHROPIC_MODEL };
  } catch (e) {
    return { kind: "unavailable", reason: e instanceof Error && e.name === "AbortError" ? "timeout" : "provider_error" };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 2: Type-check with Deno (if the Deno CLI is available)**

Run: `deno check supabase/functions/_shared/llm.ts`
Expected: `Check file:///.../llm.ts` with no errors. If the Deno CLI isn't installed on this machine, skip this step — it will be checked implicitly the first time the function deploys.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/llm.ts
git commit -m "M20 AI Studio: Anthropic provider adapter (_shared/llm.ts)"
```

---

### Task 4: `funnel-ai-generate` Edge Function

**Files:**
- Create: `supabase/functions/funnel-ai-generate/index.ts`

- [ ] **Step 1: Write the function**

```ts
// functions/funnel-ai-generate/index.ts — M20 AI Funnel Studio's generation
// endpoint (D-186). Calls a real LLM (Anthropic) when a key is configured and
// the workspace is under its rate limit + ai_tokens quota; otherwise falls
// back to the existing deterministic recommend_funnel_blueprint RPC (0034/
// 0036) so generation never hard-fails just because AI isn't configured yet.
//
// Contract:  POST /functions/v1/funnel-ai-generate   Bearer <jwt>
//   body { workspace_id, prompt?, guided_answers?, funnel_type_hint? }
//     (prompt and guided_answers: at least one required)
//   200 { ok:true, data:{ kind:'blueprint', blueprint, generation_source, model, tokens_used } }
//     | { ok:true, data:{ kind:'clarify', questions, generation_source:'llm' } }
//   400 bad_request · 401 unauthorized · 403 forbidden · 429 rate_limited
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { authUser, userClient, serviceClient, hasRole } from "../_shared/auth.ts";
import { incrementMeter, checkMeter } from "../_shared/meter.ts";
import { resolveAnthropicKey, generateFunnelBlueprint } from "../_shared/llm.ts";

const ESTIMATED_TOKENS_PER_CALL = 1200;

async function logGeneration(
  admin: any, workspace_id: string, user_id: string, generation_source: "llm" | "llm_clarify" | "deterministic",
  model: string | null, tokensUsed: number | null, promptLength: number,
) {
  const { error } = await admin.from("funnel_ai_generation_log").insert({
    workspace_id, user_id, generation_source, model, tokens_used: tokensUsed, prompt_length: promptLength,
  });
  if (error) console.error("funnel_ai_generation_log insert failed:", error.message);
}

async function isRateLimited(admin: any, workspace_id: string): Promise<boolean> {
  const { data, error } = await admin.rpc("funnel_ai_rate_limited", { p_workspace: workspace_id });
  return !error && data === true;
}

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    const user = await authUser(req);
    if (!user) return err(401, "unauthorized", "No valid session");

    const body = await req.json().catch(() => ({}));
    const { workspace_id, prompt, guided_answers, funnel_type_hint } = body ?? {};
    const promptText = typeof prompt === "string" ? prompt.trim() : "";
    const answers = guided_answers && typeof guided_answers === "object" ? guided_answers : {};
    if (!workspace_id || (!promptText && Object.keys(answers).length === 0)) {
      return err(400, "bad_request", "workspace_id and (prompt or guided_answers) are required");
    }

    const udb = userClient(req);
    if (!(await hasRole(udb, workspace_id, "staff"))) {
      return err(403, "forbidden", "Generating a funnel blueprint requires staff access or higher");
    }

    const admin = serviceClient();
    const mergedAnswers = { ...answers, ...(funnel_type_hint ? { funnel_type_hint } : {}) };
    const promptLength = promptText.length;

    const apiKey = await resolveAnthropicKey(admin, workspace_id);
    let fallbackReason: string | null = apiKey ? null : "no_key";

    if (apiKey && !fallbackReason) {
      if (await isRateLimited(admin, workspace_id)) {
        return err(429, "rate_limited", "You've hit the generation rate limit — try again in a few minutes.");
      }
      const meter = await checkMeter(admin, workspace_id, "ai_tokens", ESTIMATED_TOKENS_PER_CALL);
      if (meter?.over === true && (meter.remaining ?? 0) <= 0) {
        fallbackReason = "quota_exceeded";
      }
    }

    if (apiKey && !fallbackReason) {
      const result = await generateFunnelBlueprint(apiKey, promptText || null, Object.keys(mergedAnswers).length ? mergedAnswers : null);
      if (result.kind === "clarify") {
        await logGeneration(admin, workspace_id, user.id, "llm_clarify", null, result.tokensUsed, promptLength);
        return ok({ kind: "clarify", questions: result.questions, generation_source: "llm" });
      }
      if (result.kind === "blueprint") {
        await logGeneration(admin, workspace_id, user.id, "llm", result.model, result.tokensUsed, promptLength);
        const met = await incrementMeter(admin, workspace_id, "ai_tokens", result.tokensUsed, "m20-studio", null, null);
        if (!met.ok) console.error("meter_increment failed (blueprint generated):", met.error);
        return ok({ kind: "blueprint", blueprint: result.blueprint, generation_source: "llm", model: result.model, tokens_used: result.tokensUsed });
      }
      // result.kind === "unavailable" -> fall through to the deterministic path below.
    }

    // ── Deterministic fallback (no key / over quota / provider error) ─────────
    const { data: blueprint, error: rpcErr } = await admin.rpc("recommend_funnel_blueprint", { p_answers: mergedAnswers });
    if (rpcErr) return err(500, "generation_failed", rpcErr.message);
    await logGeneration(admin, workspace_id, user.id, "deterministic", null, null, promptLength);
    return ok({ kind: "blueprint", blueprint, generation_source: "deterministic", model: null, tokens_used: null });
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
```

- [ ] **Step 2: Type-check with Deno (if available)**

Run: `deno check supabase/functions/funnel-ai-generate/index.ts`
Expected: no errors. Skip if the Deno CLI isn't installed locally (same as Task 3 Step 2).

- [ ] **Step 3: Manual review checklist (no automated test harness exists for Edge Functions in this repo — see the Testing note at the top of this plan)**

Confirm by reading the code: (a) a failed/missing LLM call never blocks the user from getting *a* blueprint — it always falls through to the deterministic RPC; (b) `ai_tokens` is only incremented on a successful `kind:'blueprint'` LLM result, never on clarify or fallback; (c) the rate-limit check only runs when a key is configured (fallback path is never rate-limited); (d) role check happens before any provider call or meter read.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/funnel-ai-generate/index.ts
git commit -m "M20 AI Studio: funnel-ai-generate Edge Function (LLM + deterministic fallback, D-186)"
```

---

### Task 5: Register the provider + document the ops step

**Files:**
- Modify: `supabase/functions/_shared/providers.ts:33`
- Modify: `frontend/js/providers.js` (the `anthropic` entry, mirroring the above)

- [ ] **Step 1: Add M20 to Anthropic's `usedBy` list**

In `supabase/functions/_shared/providers.ts:33`, change:

```ts
  { key: "anthropic",   name: "Anthropic",      category: "AI",           auth: "api_key", scope: "platform",  fields: ["api_key"],                          usedBy: ["M08", "M33"] },
```

to:

```ts
  { key: "anthropic",   name: "Anthropic",      category: "AI",           auth: "api_key", scope: "platform",  fields: ["api_key"],                          usedBy: ["M08", "M20", "M33"] },
```

- [ ] **Step 2: Mirror the same change in the frontend copy**

Find the matching `anthropic` entry in `frontend/js/providers.js` (confirmed identical to `_shared/providers.ts:33` by research) and apply the same `usedBy` addition.

- [ ] **Step 3: Verify no other file needs updating**

Run: `grep -rn "usedBy" frontend/js/providers.js supabase/functions/_shared/providers.ts`
Expected: exactly one `anthropic` line in each file, both now listing `"M20"`.

- [ ] **Step 4: Document the manual key-setup step (no connect UI is being built in this phase)**

This phase deliberately ships with **no platform-admin "connect Anthropic" UI** (per the approved spec's "Out of scope: BYOK UI" and the earlier decision to ship provider-ready-but-unconfigured). Setting the real key is a one-time manual Vault insert, run directly against the Supabase project once a key is available:

```sql
select vault.create_secret('sk-ant-…', 'plat__anthropic__api_key');
```

Add this as a note under a new "Operational setup" subsection in `docs/superpowers/specs/2026-07-10-m20-ai-funnel-studio-design.md`'s "Out of scope / deferred" section — append:

```markdown

## Operational note

Phase 1 ships with no key configured — every generation runs on the
deterministic fallback until this one-time step is run against the Supabase
project: `select vault.create_secret('sk-ant-…', 'plat__anthropic__api_key');`.
No code change is needed after that; `resolveAnthropicKey` picks it up
automatically on the next request.
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/providers.ts frontend/js/providers.js docs/superpowers/specs/2026-07-10-m20-ai-funnel-studio-design.md
git commit -m "M20 AI Studio: register M20 as an Anthropic consumer, document manual key setup"
```

---

### Task 6: Phase 1 checkpoint — full verify + docs

**Files:**
- Modify: `TASKS.md` (append a new dated section)
- Modify: `DECISIONS-AiMindShare-v1_0.md` (append D-186)

- [ ] **Step 1: Run the full verify suite one more time**

Run: `bash scripts/verify.sh`
Expected: all probes green, including the extended `m20probe.mjs`.

- [ ] **Step 2: Append a TASKS.md entry**

Add a new subsection under the existing "M20 v3 — AI Funnel Studio" area (find it via `grep -n "M20 v3" TASKS.md`), following the existing entries' format (what shipped, migration number, DECISIONS range, what's deferred):

```markdown
### M20 AI Funnel Studio — Phase 1: real LLM provider layer *(2026-07-10, migration 0038, D-186)*

Wired a real Anthropic provider behind the existing ai_tokens meter/Vault-secret
infrastructure: new `funnel-ai-generate` Edge Function (auth+role gate → rate
limit → ai_tokens quota gate → LLM call → deterministic
`recommend_funnel_blueprint` fallback on any failure/unavailability), new
`_shared/llm.ts` provider adapter, new `funnel_ai_generation_log` table +
`funnel_ai_rate_limited()` (20 calls/workspace/hour, LLM calls only), widened
`save_funnel_blueprint` to persist `generation_source`/`llm_model`/
`tokens_used`. Ships with no Anthropic key configured — every call runs on the
deterministic fallback until the one-time Vault secret is set (documented in
the design spec's Operational note). Probe: 166 → 177 assertions.

Deferred (per the approved spec): BYOK UI, credit purchases, non-Anthropic
providers, other modules consuming `_shared/llm.ts`.
```

- [ ] **Step 3: Append a DECISIONS-AiMindShare-v1_0.md entry**

Find the end of the current DECISIONS list (`grep -n "^D-185" DECISIONS-AiMindShare-v1_0.md`) and add, matching the existing terse D-NNN format used by neighboring entries:

```markdown
D-186. M20 AI Funnel Studio's `funnel-ai-generate` Edge Function calls a real
Anthropic provider (via a new `_shared/llm.ts` adapter) gated by the existing
M03 `ai_tokens` meter and a new M20-owned `funnel_ai_generation_log`/
`funnel_ai_rate_limited` (20/workspace/hour, LLM calls only) — any failure,
missing key, quota exhaustion, or timeout falls back automatically to the
existing deterministic `recommend_funnel_blueprint` RPC, never a hard error.
`ai_tokens` is metered on the LLM call itself (platform convention), not on
blueprint approval. LOCKED.
```

- [ ] **Step 4: Commit**

```bash
git add TASKS.md DECISIONS-AiMindShare-v1_0.md
git commit -m "M20 AI Studio Phase 1: docs (TASKS.md, D-186)"
```

---

## Phase 2 — M20 Studio UX redesign

All of Phase 2 modifies the single self-contained "AI Funnel Studio" block in `frontend/js/m20-funnels.js`, currently spanning from the `INSTANT_AWARENESS_DEFAULT` constant through the end of `wireStudio()` (research confirmed: `m20-funnels.js:707-1122`; nothing in this block is referenced anywhere else in the file, and nothing outside it is referenced from inside it except the module-level helpers `$`, `$$`, `esc`, `svg`, `toast`, `render`, `state`, `ensureClient`, `connected`, `shell`, `moduleHead`, `previewStrip`, `studioField` — all of which stay as-is). Exact line numbers will drift as earlier tasks land; locate the block by searching for `INSTANT_AWARENESS_DEFAULT` and `function wireStudio`.

### Task 7: Prompt keyword parser + funnel-type card config

**Files:**
- Modify: `frontend/js/m20-funnels.js` (insert near the top of the Studio block, replacing `INSTANT_AWARENESS_DEFAULT`)

- [ ] **Step 1: Replace `INSTANT_AWARENESS_DEFAULT` with the new config + parser**

`INSTANT_AWARENESS_DEFAULT` (`m20-funnels.js:707`) is only used by the old Instant-mode `readStudioStage()` branch, which Task 15 removes — delete it and add this in its place, right after `FUNNEL_TYPE_LABEL` (`m20-funnels.js:698-704`, unchanged) and before `STUDIO_STAGES`/`STUDIO_LABEL` (deleted in Task 9):

```js
  // Coarse UI categories -> engine-answer seeds + which extra guided fields to
  // show. The engine/LLM still decides the exact one of 15 funnel_type values
  // within the category picked here — selecting a card narrows the family, it
  // doesn't hard-pick the type (spec D-187 refinement).
  const TYPE_CARDS = [
    { key: "lead_gen", label: "Lead Generation", ico: "mail", desc: "Capture leads with a free resource, quiz, or webinar.",
      seed: { objective: "leads", checkout_required: false, offer_price: 0 } },
    { key: "sales", label: "Sales", ico: "cart", desc: "Sell a product, service, or offer with a real checkout.",
      seed: { objective: "sales", checkout_required: true } },
    { key: "affiliate", label: "Affiliate", ico: "link", desc: "Promote someone else's offer and earn a commission.",
      seed: { offer_source: "affiliate" } },
    { key: "webinar", label: "Webinar", ico: "users", desc: "Fill a live or evergreen training, then pitch your offer.",
      seed: { objective: "webinar_signups" } },
    { key: "quiz", label: "Quiz", ico: "target", desc: "Segment visitors with a quiz, then show a matched offer.",
      seed: { objective: "quiz_leads" } },
    { key: "auto", label: "Let AI decide", ico: "zap", desc: "Not sure? Describe your funnel and we'll infer the best fit." },
  ];

  // Very small keyword parser: fills a few structured answers from free text so
  // the deterministic fallback (and the guided fields underneath the prompt)
  // has something sensible even before/without an LLM call. Real inference for
  // ambiguous prompts is the LLM's job (funnel-ai-generate); this only
  // recognizes unambiguous, common phrasing.
  function parsePromptToAnswers(text) {
    const t = (text || "").toLowerCase();
    const a = {};
    if (/\baffiliate\b|promote (someone|another)|commission/.test(t)) a.offer_source = "affiliate";
    if (/\bwebinar\b|\btraining\b|\bmasterclass\b/.test(t)) a.objective = "webinar_signups";
    else if (/\bquiz\b/.test(t)) a.objective = "quiz_leads";
    else if (/\bbook(ing|ed)? (a )?call\b|\bconsult/.test(t)) a.objective = "bookings";
    else if (/\bapplication\b|\bapply\b/.test(t)) a.objective = "applications";
    else if (/\bchallenge\b/.test(t)) a.objective = "challenge_signups";
    else if (/\bwaitlist\b|\blaunch\b/.test(t)) a.objective = "launch_waitlist";
    else if (/\blead(s)?\b|\bfree (guide|resource|ebook|checklist)\b/.test(t)) a.objective = "leads";
    else if (/\bsell\b|\bsale\b|\bbuy\b|\bcheckout\b/.test(t)) a.objective = "sales";
    const priceMatch = t.match(/\$\s?(\d[\d,]*)/);
    if (priceMatch) { a.offer_price = Number(priceMatch[1].replace(/,/g, "")); a.checkout_required = true; }
    return a;
  }
```

- [ ] **Step 2: Sanity-check the file still parses**

Run: `node --check frontend/js/m20-funnels.js`
Expected: no output (syntax OK). This will fail until Task 9 removes the now-dangling references to `STUDIO_STAGES`/`INSTANT_AWARENESS_DEFAULT` elsewhere in the file — that's expected; re-run this check after Task 15 (the last step that touches this block) instead of after every intermediate task if it's more convenient. Note it here as the standing verification command for the rest of Phase 2.

---

### Task 8: New `state.studio` shape + `ensureStudio()` rewrite

**Files:**
- Modify: `frontend/js/m20-funnels.js` (`ensureStudio()`, currently `m20-funnels.js:872-885`)

- [ ] **Step 1: Replace `ensureStudio()`**

```js
  function ensureStudio() {
    if (!state.studio) {
      state.studio = {
        stage: "landing", prompt: "", selectedType: null, answers: {},
        clarifyQuestions: null, clarifyAnswers: [], generating: false,
        blueprint: null, blueprintId: null,
        generationSource: null, llmModel: null, tokensUsed: null,
        funnelName: "", recent: [], recentLoaded: false,
      };
      const prefill = consumeOfferPrefill();
      if (prefill) {
        state.studio.answers = { niche: prefill.niche || "", offer_source: "affiliate", affiliate_vendor: prefill.affiliate_vendor || "",
          affiliate_url: prefill.affiliate_url || "", commission_note: prefill.commission_note || "", disclosure_required: true,
          offer_id: prefill.offer_id, offer_name: prefill.offer_name };
        state.studio.selectedType = "affiliate";
        state.studio.prompt = `Build an affiliate funnel promoting ${prefill.offer_name}${prefill.affiliate_vendor ? " via " + prefill.affiliate_vendor : ""}.`;
        toast(`Pre-filled from "${prefill.offer_name}" — review and generate.`, "info");
      }
    }
    return state.studio;
  }
```

This is the only change the M29 bridge needs — `frontend/js/m29-affiliate-hub.js`'s `createFunnelFromOffer()` and `OFFER_PREFILL_KEY` already write everything this reads (`niche`, `affiliate_vendor`, `affiliate_url`, `commission_note`, `offer_id`, `offer_name`); no changes to `m29-affiliate-hub.js` are needed for Phase 2.

---

### Task 9: Hero, type cards, guided fields, advanced, how-it-works, recent — helper functions

**Files:**
- Modify: `frontend/js/m20-funnels.js` (replace `studioModePicker`, `offerSourceToggle` stays, `studioStepper`/`studioNav` are deleted, add new helpers)

- [ ] **Step 1: Delete the now-unused wizard helpers**

Delete these three, currently at `m20-funnels.js:708-709` (`STUDIO_STAGES`, `STUDIO_LABEL`) and `m20-funnels.js:886-900, 930-941` (`studioModePicker`, `studioStepper`, `studioNav`) — all are wizard-stage-only and have no callers left after Task 15.

- [ ] **Step 2: Add the new landing-screen builder functions**

Insert these where `studioModePicker` used to be (keep `offerSourceToggle`/`readOfferSource`, `studioField`, unchanged):

```js
  function studioExampleChips() {
    const examples = [
      "Create a lead generation funnel for a roofing company in Toronto",
      "Build an affiliate funnel for a keto meal offer aimed at busy moms",
      "Make a webinar funnel for a Quran learning workshop",
      "Create a quiz funnel for travel deal personalization",
    ];
    return `<div class="studio-chips">${examples.map((e) => `<button class="studio-chip" data-studiochip="${esc(e)}">${esc(e)}</button>`).join("")}</div>`;
  }
  function studioTypeCards(s) {
    return `<div class="studio-type-grid">${TYPE_CARDS.map((c) => `
      <button class="studio-type-card ${s.selectedType === c.key ? "on" : ""}" data-studiotype="${c.key}">
        <div class="stc-ico">${svg(c.ico, 17)}</div>
        <div class="stc-title">${esc(c.label)}</div>
        <div class="stc-desc">${esc(c.desc)}</div>
      </button>`).join("")}</div>`;
  }
  function studioGuidedFields(s) {
    const cat = s.selectedType && s.selectedType !== "auto" ? s.selectedType : null;
    return `<div class="studio-guided">
      ${studioField("Your niche / business", `<input id="sgNiche" placeholder="e.g. Ramadan meal-prep coaching" value="${esc(s.answers.niche || "")}">`)}
      ${cat === "sales" || cat === "affiliate" ? studioField("Price (0 if free)", `<input id="sgPrice" class="num" type="number" min="0" step="1" value="${esc(s.answers.offer_price ?? "")}" style="max-width:140px">`) : ""}
      ${cat === "webinar" ? studioField("Webinar topic", `<input id="sgWebinarTopic" placeholder="e.g. 5-day Quran reading fundamentals" value="${esc(s.answers.webinar_topic || "")}">`) : ""}
      ${cat === "quiz" ? studioField("What should the quiz segment on?", `<input id="sgQuizGoal" placeholder="e.g. travel style, budget, destination type" value="${esc(s.answers.quiz_segmentation || "")}">`) : ""}
      ${cat === "affiliate" ? offerSourceToggle({ answers: { ...s.answers, offer_source: "affiliate" } }) : ""}
    </div>`;
  }
  function studioAdvancedFields(s) {
    return `<details class="studio-advanced">
      <summary>Advanced options</summary>
      <div class="studio-advanced-body">
        ${studioField("Main traffic source", `<select id="sgTraffic">
          <option value="">Not sure yet</option>
          ${[["cold_paid", "Cold paid traffic"], ["warm_email", "Warm email list"], ["organic_social", "Organic social"], ["referral", "Referral / word of mouth"]]
            .map(([v, l]) => `<option value="${v}" ${s.answers.traffic_source === v ? "selected" : ""}>${l}</option>`).join("")}</select>`)}
        ${studioField("How aware is your audience?", `<select id="sgAwareness">
          <option value="">Not sure yet</option>
          ${[["unaware", "Unaware they have this problem"], ["problem_aware", "Aware of the problem, not the solution"],
             ["solution_aware", "Aware solutions exist"], ["product_aware", "Aware of your product specifically"], ["most_aware", "Ready to buy"]]
            .map(([v, l]) => `<option value="${v}" ${s.answers.audience_awareness === v ? "selected" : ""}>${l}</option>`).join("")}</select>`)}
        ${studioField("I already have a free lead magnet", `<input type="checkbox" id="sgLeadMagnet" ${s.answers.has_lead_magnet ? "checked" : ""}>`)}
        ${s.selectedType !== "affiliate" ? offerSourceToggle(s) : ""}
      </div>
    </details>`;
  }
  function studioClarifyBlock(s) {
    if (!s.clarifyQuestions || !s.clarifyQuestions.length) return "";
    return `<div class="studio-clarify">${s.clarifyQuestions.map((q, qi) => `
      <div class="studio-clarify-q">
        <div class="scq-text">${esc(q.question)}</div>
        <div class="scq-chips">${q.chips.map((c) => `<button class="studio-chip" data-clarifyanswer="${qi}" data-clarifyvalue="${esc(c)}">${esc(c)}</button>`).join("")}
          <input class="scq-custom" data-clarifycustom="${qi}" placeholder="Type your own…">
        </div>
      </div>`).join("")}</div>`;
  }
  function studioHowItWorks() {
    return `<div class="studio-how">
      <div class="studio-how-step"><div class="shw-n">1</div><div class="shw-title">Describe your funnel</div><div class="shw-sub">Type a sentence or pick guided fields.</div></div>
      <div class="studio-how-step"><div class="shw-n">2</div><div class="shw-title">AI generates the structure</div><div class="shw-sub">Steps, copy direction, and CTAs, mapped to your goal.</div></div>
      <div class="studio-how-step"><div class="shw-n">3</div><div class="shw-title">Review, edit, and launch</div><div class="shw-sub">Approve the blueprint, then edit it like any funnel.</div></div>
    </div>`;
  }
  function studioRecentSection(s) {
    const recentBlock = s.recent.length ? `
      <div class="panel-head"><h3>Recent generations</h3></div>
      <div class="access-list">${s.recent.map((r) => `<div class="access-row" data-studioreopen="${r.id}">
        <div class="fc-ico" style="width:28px;height:28px;font-size:12px">${svg("zap", 13)}</div>
        <div style="flex:1;min-width:0"><div style="font-size:12.5px;color:var(--ink-900)">${esc(FUNNEL_TYPE_LABEL[r.blueprint?.funnel_type] || "Draft")}</div>
          <div style="font-size:11px;color:var(--ink-400)">${esc(r.status)} · ${new Date(r.created_at).toLocaleDateString()}</div></div>
      </div>`).join("")}</div>` : "";
    return `<div class="studio-recent">
      ${recentBlock}
      <a class="link studio-templates-link" href="#/funnels/templates">${svg("layers", 13)} Browse funnel templates instead →</a>
    </div>`;
  }
  async function loadStudioRecent() {
    const s = ensureStudio();
    if (s.recentLoaded || !connected()) return;
    s.recentLoaded = true;
    const c = ensureClient();
    const { data } = await c.from("funnel_blueprints").select("id,status,blueprint,answers,generation_source,llm_model,tokens_used,created_at")
      .eq("workspace_id", state.workspaceId).order("created_at", { ascending: false }).limit(5);
    if (data) { s.recent = data; render(); }
  }
```

---

### Task 10: Rewrite `viewStudio()`

**Files:**
- Modify: `frontend/js/m20-funnels.js` (`viewStudio()`, currently `m20-funnels.js:942-1037`)

- [ ] **Step 1: Replace the whole function**

```js
  function viewStudio() {
    const s = ensureStudio();
    const head = moduleHead("AI Funnel <em>Studio</em>", "Describe your funnel in one sentence, or use guided fields — review the blueprint, then launch a working funnel.");
    let body;
    if (s.stage === "blueprint") {
      const bp = s.blueprint;
      body = bp ? `
        <div class="studio-result">
          <div class="studio-badge">${svg("zap", 13)} ${esc(FUNNEL_TYPE_LABEL[bp.funnel_type] || bp.funnel_type)}</div>
          <span class="st ${s.generationSource === "llm" ? "st-active" : "st-testing"}" style="margin-left:8px">${s.generationSource === "llm" ? "AI-generated" : "Quick-match"}</span>
          <button class="link" id="studioChangeType" style="margin-left:10px;font-size:12px">Change type</button>
          ${String(bp.funnel_type || "").indexOf("affiliate_") === 0 ? `<div class="studio-affiliate-note">${svg("info", 13)} Affiliate offer — remember to add a compliant disclosure and never imply you own this product.</div>` : ""}
          <p class="muted" style="font-size:13px;margin:10px 0 16px">${esc(bp.reasoning)}</p>
          <div class="access-list">${bp.steps.map((st, i) => `<div class="access-row">
              <div class="fc-ico" style="width:28px;height:28px;font-size:12px">${svg(TYPE_ICO[st.step_type] || "file", 13)}</div>
              <div style="flex:1;min-width:0"><div style="font-size:12.5px;color:var(--ink-900)">${i + 1}. ${esc(st.role_label)}</div>
                <div style="font-size:11px;color:var(--ink-400)">${TYPE_LABEL[st.step_type]} · CTA: "${esc(st.cta_direction)}" — ${esc(st.purpose)}</div></div>
            </div>`).join("")}</div>
          <div style="display:flex;gap:8px;margin:14px 0;flex-wrap:wrap">
            ${bp.order_bump_suggested ? `<span class="st st-testing">Order bump suggested</span>` : ""}
            ${bp.upsell_suggested ? `<span class="st st-testing">Upsell suggested</span>` : ""}
            ${bp.downsell_suggested ? `<span class="st st-testing">Downsell suggested</span>` : ""}
          </div>
          <div class="panel-head" style="margin-top:4px"><h3 style="font-size:12.5px">First test ideas</h3></div>
          <ul class="readiness-list warnings">${bp.test_ideas.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
          <div class="panel-head" style="margin-top:4px"><h3 style="font-size:12.5px">Launch checklist emphasis</h3></div>
          <ul class="readiness-list warnings">${bp.launch_checklist_emphasis.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
        </div>
        ${studioField("Name this funnel", `<input id="stFunnelName" placeholder="e.g. ${esc(s.answers.niche || "My")} Funnel" value="${esc(s.funnelName)}">`)}
        <div class="mc-foot" style="border-top:none;padding-top:14px">
          <button class="btn btn-ghost" id="studioBack">${svg("back", 14)} Back</button>
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost" id="studioRegenerate">${svg("zap", 14)} Regenerate</button>
            <button class="btn btn-primary" id="studioApprove">${svg("check", 15)} Approve &amp; generate funnel</button>
          </div>
        </div>` : `<p class="muted">Generating your blueprint…</p>`;
      return shell("studio", previewStrip() + head + `<div class="panel studio-panel-wide">${body}</div>`);
    }
    // stage === "landing"
    body = `
      <div class="studio-hero">
        <h2 class="studio-hero-title">Describe the funnel you want</h2>
        <p class="studio-hero-sub">One sentence is enough — AI Funnel Studio infers the type, structure, and copy direction. Prefer to choose everything yourself? Pick a type below.</p>
        <textarea class="studio-prompt" id="stPrompt" rows="3" placeholder="e.g. Create a lead generation funnel for a roofing company in Toronto">${esc(s.prompt || "")}</textarea>
        ${studioExampleChips()}
        ${studioClarifyBlock(s)}
        <div class="studio-hero-actions">
          <button class="btn btn-primary" id="studioGenerate" ${s.generating ? "disabled" : ""}>${svg("zap", 15)} ${s.generating ? "Generating…" : "Generate Funnel"}</button>
          <button class="btn btn-ghost" id="studioStartScratch">Start from scratch</button>
        </div>
      </div>
      <div class="panel-head" style="margin-top:24px"><h3>Or choose a funnel type</h3></div>
      ${studioTypeCards(s)}
      ${studioGuidedFields(s)}
      ${studioAdvancedFields(s)}
      ${studioHowItWorks()}
      ${studioRecentSection(s)}
    `;
    return shell("studio", previewStrip() + head + `<div class="panel studio-panel-wide">${body}</div>`);
  }
```

---

### Task 11: Rewrite answer-reading + generation + wiring

**Files:**
- Modify: `frontend/js/m20-funnels.js` (`readStudioStage`, `generateStudioBlueprint`, `approveAndGenerateFunnel` stays, `wireStudio`; currently `m20-funnels.js:1038-1122`)

- [ ] **Step 0 (added during execution):** Task 7 left `INSTANT_AWARENESS_DEFAULT` in place (deferred here since it was still referenced by `readStudioStage()`'s "instant" branch at the time). Since this task deletes `readStudioStage()` entirely, also delete the now-truly-dead `INSTANT_AWARENESS_DEFAULT` constant declaration in the same commit.

- [ ] **Step 1: Replace `readStudioStage()` with `readStudioAnswers()`**

```js
  function readStudioAnswers() {
    const s = ensureStudio();
    s.prompt = $("#stPrompt")?.value ?? s.prompt;
    if ($("#sgNiche")) s.answers.niche = $("#sgNiche").value.trim();
    if ($("#sgPrice")) { s.answers.offer_price = Number($("#sgPrice").value) || 0; s.answers.checkout_required = s.answers.offer_source === "affiliate" ? false : s.answers.offer_price > 0; }
    if ($("#sgWebinarTopic")) s.answers.webinar_topic = $("#sgWebinarTopic").value.trim();
    if ($("#sgQuizGoal")) s.answers.quiz_segmentation = $("#sgQuizGoal").value.trim();
    if ($("#sgTraffic")) s.answers.traffic_source = $("#sgTraffic").value || undefined;
    if ($("#sgAwareness")) s.answers.audience_awareness = $("#sgAwareness").value || undefined;
    if ($("#sgLeadMagnet")) s.answers.has_lead_magnet = !!$("#sgLeadMagnet").checked;
    readOfferSource();
  }
```

- [ ] **Step 2: Replace `generateStudioBlueprint()`**

```js
  async function generateStudioBlueprint() {
    const s = ensureStudio();
    readStudioAnswers();
    const seed = TYPE_CARDS.find((c) => c.key === s.selectedType)?.seed || {};
    const promptAnswers = s.prompt ? parsePromptToAnswers(s.prompt) : {};
    const mergedAnswers = { ...promptAnswers, ...seed, ...s.answers };
    s.clarifyQuestions = null;
    s.generating = true;
    render();
    let result;
    try {
      if (!connected()) {
        result = { kind: "blueprint", blueprint: localRecommendBlueprint(mergedAnswers), generation_source: "deterministic", model: null, tokens_used: null };
      } else {
        const c = ensureClient();
        const { data, error } = await c.functions.invoke("funnel-ai-generate", {
          body: { workspace_id: state.workspaceId, prompt: s.prompt || null, guided_answers: mergedAnswers, funnel_type_hint: s.selectedType && s.selectedType !== "auto" ? s.selectedType : null },
        });
        if (error) throw error;
        result = data?.data || data;
      }
    } catch (e) { s.generating = false; toast("Blueprint generation failed: " + e.message, "danger"); render(); return; }
    s.generating = false;
    if (result.kind === "clarify") { s.clarifyQuestions = result.questions; render(); return; }
    s.answers = mergedAnswers;
    s.blueprint = result.blueprint;
    s.generationSource = result.generation_source;
    s.llmModel = result.model || null;
    s.tokensUsed = result.tokens_used || null;
    s.stage = "blueprint";
    if (!s.funnelName) s.funnelName = (s.answers.niche ? s.answers.niche + " " : "") + (FUNNEL_TYPE_LABEL[result.blueprint.funnel_type] || "Funnel");
    if (connected()) {
      const c = ensureClient();
      const { data, error } = await c.rpc("save_funnel_blueprint", {
        p_ws: state.workspaceId, p_answers: s.answers, p_blueprint: s.blueprint, p_blueprint_id: s.blueprintId,
        p_generation_source: s.generationSource, p_llm_model: s.llmModel, p_tokens_used: s.tokensUsed,
      });
      if (!error && data) s.blueprintId = data.id;
    }
    render();
  }
```

`approveAndGenerateFunnel()` (`m20-funnels.js:1072-1096`) is unchanged — it already reads `s.blueprint`/`s.blueprintId`/`s.funnelName`, none of which changed shape.

- [ ] **Step 3: Replace `wireStudio()`**

```js
  function wireStudio() {
    const s = ensureStudio();
    loadStudioRecent();
    $$("[data-studiochip]").forEach((el) => el.addEventListener("click", () => { $("#stPrompt").value = el.dataset.studiochip; s.prompt = el.dataset.studiochip; }));
    $$("[data-studiotype]").forEach((el) => el.addEventListener("click", () => {
      readStudioAnswers();
      s.selectedType = s.selectedType === el.dataset.studiotype ? null : el.dataset.studiotype;
      const seed = TYPE_CARDS.find((c) => c.key === s.selectedType)?.seed || {};
      s.answers = { ...s.answers, ...seed };
      render();
    }));
    $$("input[name='stOfferSource']").forEach((el) => el.addEventListener("change", () => { readStudioAnswers(); render(); }));
    $("#studioStartScratch")?.addEventListener("click", () => { state.studio = null; newFunnelModal(); });
    $$("[data-clarifyanswer]").forEach((el) => el.addEventListener("click", () => {
      const qi = Number(el.dataset.clarifyanswer);
      s.clarifyAnswers[qi] = el.dataset.clarifyvalue;
      if (s.clarifyQuestions.every((_, i) => s.clarifyAnswers[i])) {
        s.prompt = (s.prompt || "") + " " + s.clarifyQuestions.map((q, i) => `${q.question} ${s.clarifyAnswers[i]}`).join(" ");
        s.clarifyQuestions = null; s.clarifyAnswers = [];
        generateStudioBlueprint();
      } else render();
    }));
    $$("[data-clarifycustom]").forEach((el) => el.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" || !el.value.trim()) return;
      const qi = Number(el.dataset.clarifycustom);
      s.clarifyAnswers[qi] = el.value.trim();
      if (s.clarifyQuestions.every((_, i) => s.clarifyAnswers[i])) {
        s.prompt = (s.prompt || "") + " " + s.clarifyQuestions.map((q, i) => `${q.question} ${s.clarifyAnswers[i]}`).join(" ");
        s.clarifyQuestions = null; s.clarifyAnswers = [];
        generateStudioBlueprint();
      } else render();
    }));
    $("#studioGenerate")?.addEventListener("click", generateStudioBlueprint);
    $("#studioRegenerate")?.addEventListener("click", generateStudioBlueprint);
    $("#studioApprove")?.addEventListener("click", approveAndGenerateFunnel);
    $("#studioBack")?.addEventListener("click", () => { s.stage = "landing"; render(); });
    $("#studioChangeType")?.addEventListener("click", () => { s.stage = "landing"; s.blueprint = null; render(); });
    $$("[data-studioreopen]").forEach((el) => el.addEventListener("click", () => {
      const row = s.recent.find((r) => r.id === el.dataset.studioreopen);
      if (!row) return;
      s.answers = row.answers || {}; s.blueprint = row.blueprint; s.blueprintId = row.id;
      s.generationSource = row.generation_source; s.llmModel = row.llm_model; s.tokensUsed = row.tokens_used;
      s.stage = "blueprint"; render();
    }));
  }
```

`newFunnelModal()` is the existing blank-funnel modal (confirmed present elsewhere in the file) — "Start from scratch" reuses it unchanged, matching the master prompt's first-level-choices requirement (Start from scratch / Use template / Create with AI / Import) without building a new modal.

- [ ] **Step 4: Verify the file parses end-to-end**

Run: `node --check frontend/js/m20-funnels.js`
Expected: no output. If this fails, the most likely cause is a leftover reference to a deleted identifier (`STUDIO_STAGES`, `studioStepper`, `studioNav`, `studioModePicker`, `INSTANT_AWARENESS_DEFAULT`, `readStudioStage`) — search for it and remove/replace.

- [ ] **Step 5: Commit**

```bash
git add frontend/js/m20-funnels.js
git commit -m "M20 AI Funnel Studio: prompt-first hero layout, type cards, clarification flow (Phase 2)"
```

---

### Task 12: CSS for the new Studio layout

**Files:**
- Modify: `frontend/styles/m20-funnels.css:207-229` (replace the existing Studio block)

- [ ] **Step 1: Replace the existing `.studio-*` block**

The current block (`m20-funnels.css:207-229`) styles the retired wizard (`.studio-panel`, `.studio-steps`/`.studio-step*`, `.studio-modes`/`.studio-mode-card`/`.smc-*`, `.studio-instant-head`, `.studio-affiliate-link`). Replace the whole block with:

```css
.studio-panel-wide{max-width:920px}
.studio-hero{padding:24px 4px 8px}
.studio-hero-title{font-size:20px;font-weight:650;color:var(--ink-900);margin:0 0 8px}
.studio-hero-sub{font-size:13px;color:var(--ink-400);line-height:1.5;margin:0 0 16px;max-width:640px}
.studio-prompt{width:100%;min-height:76px;padding:14px 16px;border-radius:12px;border:1px solid var(--line);
  background:var(--surface-1);color:var(--ink-900);font-size:14px;font-family:inherit;resize:vertical}
.studio-prompt:focus{outline:none;border-color:var(--gold-500)}
.studio-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.studio-chip{font-size:11.5px;color:var(--ink-500);background:rgba(109,121,122,.08);border:none;border-radius:999px;
  padding:6px 12px;cursor:pointer;text-align:left}
.studio-chip:hover{background:rgba(197,160,89,.16);color:var(--ink-900)}
.studio-hero-actions{display:flex;gap:10px;margin-top:16px}
.studio-type-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:14px 0 20px}
.studio-type-card{display:flex;flex-direction:column;align-items:flex-start;gap:6px;text-align:left;padding:14px;
  border-radius:12px;border:1px solid var(--line);background:var(--surface-1);cursor:pointer}
.studio-type-card:hover{border-color:var(--gold-500)}
.studio-type-card.on{border-color:var(--gold-500);background:rgba(197,160,89,.08)}
.stc-ico{color:var(--gold-500)}
.stc-title{font-size:13px;font-weight:600;color:var(--ink-900)}
.stc-desc{font-size:11.5px;color:var(--ink-400);line-height:1.4}
.studio-guided{margin-bottom:8px}
.studio-offersource{display:flex;gap:16px;font-size:13px;color:var(--ink-700);margin-bottom:4px}
.studio-offersource label{display:flex;align-items:center;gap:6px}
.studio-advanced{margin:8px 0 20px;border-top:.5px solid var(--line);padding-top:12px}
.studio-advanced summary{font-size:12.5px;color:var(--ink-500);cursor:pointer;font-weight:600}
.studio-advanced-body{margin-top:12px}
.studio-clarify{margin:14px 0;padding:14px;border-radius:12px;background:rgba(197,160,89,.06);border:1px solid rgba(197,160,89,.24)}
.studio-clarify-q{margin-bottom:10px}
.studio-clarify-q:last-child{margin-bottom:0}
.scq-text{font-size:12.5px;color:var(--ink-900);margin-bottom:6px;font-weight:600}
.scq-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.scq-custom{font-size:11.5px;padding:5px 10px;border-radius:999px;border:1px solid var(--line);background:var(--surface-1);
  color:var(--ink-900);min-width:120px}
.studio-how{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:24px 0;padding:18px 0;border-top:.5px solid var(--line)}
.shw-n{width:22px;height:22px;border-radius:999px;background:rgba(197,160,89,.16);color:var(--gold-500);
  display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;margin-bottom:8px}
.shw-title{font-size:12.5px;font-weight:600;color:var(--ink-900);margin-bottom:2px}
.shw-sub{font-size:11.5px;color:var(--ink-400);line-height:1.4}
.studio-recent{margin-top:8px}
.studio-templates-link{display:inline-flex;align-items:center;gap:6px;font-size:12px;margin-top:10px}
.studio-result{padding-top:2px}
.studio-badge{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--gold-500)}
.studio-affiliate-note{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--gold-500);margin-top:8px}
@media (max-width:760px){.studio-type-grid{grid-template-columns:1fr 1fr}.studio-how{grid-template-columns:1fr}}
@media (max-width:520px){.studio-type-grid{grid-template-columns:1fr}.studio-hero-actions{flex-direction:column}}
```

`.studio-badge` and `.studio-affiliate-note` are kept from the original block (still used, unchanged visuals). `.studio-offersource` is kept for `offerSourceToggle()`'s markup (unchanged). Everything else in the old block (`.studio-panel`, `.studio-steps`, `.studio-step*`, `.studio-modes`, `.studio-mode-card`, `.smc-*`, `.studio-instant-head`, `.studio-affiliate-link`) is dropped since Task 9–10 stopped emitting those classes.

- [ ] **Step 2: Commit**

```bash
git add frontend/styles/m20-funnels.css
git commit -m "M20 AI Funnel Studio: CSS for hero/type-cards/advanced/how-it-works/clarify layout"
```

---

### Task 13: Preview verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Use `preview_start` (per this session's tooling) against this repo's configured static/dev server for the `frontend/` app.

- [ ] **Step 2: Navigate to the Studio and check the mockup (unauthenticated) path**

Navigate to `m20-funnels.html#/funnels/studio`. Confirm via `preview_snapshot`: hero title + prompt textarea + 4 example chips render; the 6 type cards render (5 + "Let AI decide"); clicking a chip fills the textarea; clicking a type card toggles its `on` state and reveals that type's extra guided field (e.g. clicking "Webinar" reveals the "Webinar topic" field); the Advanced `<details>` is collapsed by default and expands on click; the how-it-works 3-step strip and (empty, since no recent drafts exist in mockup mode) recent-generations area render without errors.

- [ ] **Step 3: Generate a blueprint in mockup mode**

Type "Create a lead generation funnel for a roofing company in Toronto" into the prompt box (`preview_fill`), click "Generate Funnel" (`preview_click`). Confirm via `preview_snapshot`: the screen transitions to the blueprint review (stage `blueprint`), shows a funnel-type badge, a "Quick-match" badge (mockup mode is never `connected()`, so always deterministic), a "Change type" link, the step list, test ideas, and launch checklist. Click "Change type" — confirm it returns to the landing screen with the prompt/answers still populated.

- [ ] **Step 4: Check responsive + console**

Run `preview_resize` to 375×812 and 1280×800; confirm via `preview_snapshot`/`preview_screenshot` there is no horizontal scroll at either width and the type-card grid collapses to 1 column at 375px per the CSS media query. Run `preview_console_logs` (level `error`) — confirm zero errors on load, chip click, type-card click, and generate.

- [ ] **Step 5: Check the M29 affiliate bridge still works**

Navigate to `m29-affiliate-hub.html#/offers`, use an offer card's "Create Funnel from Offer" action (or call `createFunnelFromOffer` directly via `preview_eval` if no seeded offer exists in mockup mode), confirm it lands on `m20-funnels.html#/funnels/studio` with the Affiliate type card pre-selected (`on` class), the prompt textarea pre-filled with a generated sentence, and a toast confirming the prefill.

- [ ] **Step 6: Report results**

Summarize pass/fail for each check above in the conversation (no separate file needed) before moving to Task 14.

---

### Task 14: Phase 2 checkpoint — docs

**Files:**
- Modify: `TASKS.md` (append)
- Modify: `DECISIONS-AiMindShare-v1_0.md` (append D-187)

- [ ] **Step 1: Append a TASKS.md entry**

```markdown
### M20 AI Funnel Studio — Phase 2: prompt-first hero redesign *(2026-07-10, D-187, frontend-only)*

Rebuilt the Studio landing (`viewStudio()`) into the hero/prompt/type-cards/
guided-fields/advanced/how-it-works/recent layout the master prompt asked for,
retiring the old Instant/Smart-Brief mode-picker wizard. Free-text prompt +
optional funnel-type cards (5 categories + "Let AI decide") both feed the same
`funnel-ai-generate` call from Phase 1; selecting a card seeds sensible answer
defaults and reveals category-specific fields without hard-forcing one of the
15 internal funnel types. Inline clarification chips render beneath the prompt
box when the LLM asks up to 3 follow-ups; answering all of them auto-resubmits
on the same screen. Blueprint review gained a generation-source badge
(AI-generated vs. quick-match) and a "Change type" control. M29's affiliate
bridge required zero code changes — its existing prefill payload already
supplies everything the new hero needs. Preview-verified: 0 h-scroll at
375/1280, no console errors, mockup-mode generation works end to end.
```

- [ ] **Step 2: Append a DECISIONS entry**

```markdown
D-187. M20 AI Funnel Studio's landing screen is prompt-first: a free-text
prompt box is the primary path, with 6 funnel-type cards (5 categories +
"Let AI decide") as an optional, equally-visible alternative that seeds
guided-field defaults rather than hard-selecting one of the 15 internal
funnel_type values — the deterministic engine / LLM still makes that final
call. The old Instant/Smart-Brief wizard entry screen is retired; its field
logic is reused inline. LOCKED.
```

- [ ] **Step 3: Commit**

```bash
git add TASKS.md DECISIONS-AiMindShare-v1_0.md
git commit -m "M20 AI Studio Phase 2: docs (TASKS.md, D-187)"
```

---

## Post-plan checklist

- [ ] `bash scripts/verify.sh` green (run once more after all commits)
- [ ] `node --check frontend/js/m20-funnels.js` clean
- [ ] Preview verification (Task 13) passed
- [ ] Spec's acceptance criteria (from the original master prompt) re-checked: sidebar unaffected (no nav changes made), Generate-with-AI entry unchanged, full-page Studio opens, prompt-first works, type selection works, blueprint review gates funnel creation, workspace handoff unchanged, M29 deep-link works, no console errors, no h-scroll regressions.
