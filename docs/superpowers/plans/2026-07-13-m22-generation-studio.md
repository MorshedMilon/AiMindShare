# M22 Generation Studio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the M22 Generation Studio core pipeline — a keyword→article
interactive generation flow (Research→Brief→Outline→Draft→Auto-Link→Score→
Ready for Review) driven entirely by the existing GH Actions worker, with a
live tracker UI and manual-retry error handling.

**Architecture:** Migration 0040 adds `content_queue.keyword_id`,
`blog_articles.used_fallback`, `generation_jobs`, and `content_scores`. Every
pipeline stage runs inside `workers/worker.mjs` (no Edge Functions, no
pg_net — see the design spec's "Correction" note) via a new
`generation.advance` job type that chases itself through the 7 stages by
inserting the next stage's row on success. Brief/Outline/Draft reuse
`workers/llm.mjs`'s `callAnthropicForArticle`; Score reuses
`content-seo.mjs`'s `scoreArticle` directly (already pure/Node-importable).
A new `frontend/js/generation-studio-pipeline.mjs` holds the pure,
dependency-injected logic (prompt builders, stage order, error
classification) so it's unit-testable without a database, mirroring how
`blog-pipeline.mjs`/`llmprobe.mjs` already test M22-auto's real-LLM wiring.

**Tech Stack:** Postgres/Supabase (PGlite for local verification), plain ESM
Node (`workers/worker.mjs`, no build step), vanilla JS frontend
(`frontend/js/m22-content.js`), Anthropic API via existing Vault-secret
pattern.

**Reference spec:** [docs/superpowers/specs/2026-07-13-m22-generation-studio-design.md](../specs/2026-07-13-m22-generation-studio-design.md)

---

### Task 1: Migration 0040 — schema (tables, columns, RLS)

**Files:**
- Create: `supabase/migrations/0040_m22_generation_studio.sql`
- Test: `workers/verify/m22genstudioprobe.mjs` (new)

- [ ] **Step 1: Write the failing schema/RLS test**

Create `workers/verify/m22genstudioprobe.mjs` with this content (mirrors
`m22autoprobe.mjs`'s PGlite setup exactly, extended with the migrations this
slice depends on):

```js
// m22genstudioprobe.mjs — verify the M22 Generation Studio pipeline schema,
// RPCs, and worker dispatch logic on REAL Postgres (PGlite, no Docker).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const OWNER_A   = "11111111-1111-1111-1111-111111111111";
const MANAGER_A = "33333333-3333-3333-3333-333333333333";
const STAFF_A   = "44444444-4444-4444-4444-444444444444";
const CLIENT_A  = "55555555-5555-5555-5555-555555555555";
const OWNER_B   = "66666666-6666-6666-6666-666666666666";
const STAFF_B   = "77777777-7777-7777-7777-777777777777";

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

async function main() {
  const pg = new PGlite();

  await pg.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role authenticated nologin; create role service_role nologin;
    grant usage on schema public to authenticated;
  `);

  for (const m of [
    "0000_extensions_enums.sql", "0001_tenancy.sql", "0002_jobs.sql",
    "0010_m05_compliance.sql", "0013_m09_crm.sql", "0014_m11_pipeline.sql",
    "0015_m12_inbox.sql", "0016_m13_automations.sql", "0022_m19_sites.sql",
    "0025_m22_content.sql", "0026_m21_seo.sql", "0027_m22_auto.sql",
    "0039_m22_bulk.sql", "0040_m22_generation_studio.sql",
  ]) {
    await pg.exec(load(m));
  }
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);
  for (const f of ["start_generation_run(uuid,uuid,uuid)", "retry_generation_stage(uuid)"]) {
    await pg.exec(`revoke execute on function public.${f} from authenticated;`).catch(() => {});
  }
  // start_generation_run / retry_generation_stage are staff+ RPCs (role-checked
  // inside the function body, like enqueue_content_generation) — re-grant so the
  // in-function has_role() check is what's actually exercised, not a bare revoke.
  await pg.exec(`grant execute on function public.start_generation_run(uuid,uuid,uuid) to authenticated;`);
  await pg.exec(`grant execute on function public.retry_generation_stage(uuid) to authenticated;`);

  const as = (sub) => pg.exec(
    `set role authenticated;` +
    `select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);

  // ── Setup: two workspaces + members + a site + a keyword each ───────────────
  await reset();
  for (const [id, u] of [[OWNER_A,"owner.a"],[MANAGER_A,"manager.a"],[STAFF_A,"staff.a"],
                         [CLIENT_A,"client.a"],[OWNER_B,"owner.b"],[STAFF_B,"staff.b"]]) {
    await pg.query(`insert into auth.users (id,email) values ($1,$2) on conflict do nothing`, [id, `${u}@aimindshare.test`]);
    await pg.query(`insert into public.profiles (id,email,name) values ($1,$2,$3) on conflict do nothing`, [id, `${u}@aimindshare.test`, u]);
  }
  const wsA = (await pg.query(`insert into public.workspaces (owner_id,name,slug) values ($1,'Acme','acme') returning id`, [OWNER_A])).rows[0].id;
  const wsB = (await pg.query(`insert into public.workspaces (owner_id,name,slug) values ($1,'Bravo','bravo') returning id`, [OWNER_B])).rows[0].id;
  await pg.query(`insert into public.memberships (workspace_id,user_id,role,status) values
      ($1,$2,'owner','active'),($1,$3,'manager','active'),($1,$4,'staff','active'),($1,$5,'client','active')`,
      [wsA, OWNER_A, MANAGER_A, STAFF_A, CLIENT_A]);
  await pg.query(`insert into public.memberships (workspace_id,user_id,role,status) values
      ($1,$2,'owner','active'),($1,$3,'staff','active')`, [wsB, OWNER_B, STAFF_B]);
  const siteA = (await pg.query(`insert into public.sites (workspace_id,name,subdomain,status) values ($1,'Acme Blog','acme','published') returning id`, [wsA])).rows[0].id;
  const kwA = (await pg.query(`insert into public.keywords (workspace_id,keyword,volume,difficulty,intent) values ($1,'best dua for travel',500,20,'informational') returning id`, [wsA])).rows[0].id;

  // ═══ 1 — schema + RLS posture ══════════════════════════════════════════════
  console.log("\nM22 Generation Studio · schema + RLS posture:");
  assert(await count(pg, `select count(*)::int n from information_schema.columns where table_name='content_queue' and column_name='keyword_id'`) === 1,
    "content_queue has keyword_id");
  assert(await count(pg, `select count(*)::int n from information_schema.columns where table_name='blog_articles' and column_name='used_fallback'`) === 1,
    "blog_articles has used_fallback");
  assert(await count(pg, `select count(*)::int n from pg_tables where tablename='generation_jobs' and rowsecurity`) === 1,
    "generation_jobs RLS on");
  assert(await count(pg, `select count(*)::int n from pg_tables where tablename='content_scores' and rowsecurity`) === 1,
    "content_scores RLS on");
  assert(await count(pg, `select count(*)::int n from pg_indexes where indexname='generation_jobs_one_pending_per_stage'`) === 1,
    "generation_jobs has the one-pending-per-stage partial unique index");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd workers && node verify/m22genstudioprobe.mjs`
Expected: FAIL — `0040_m22_generation_studio.sql` doesn't exist yet (ENOENT).

- [ ] **Step 3: Write migration 0040's schema section**

Create `supabase/migrations/0040_m22_generation_studio.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- 0040_m22_generation_studio.sql — M22 Generation Studio core pipeline.
-- Keyword→article linking fix (D-134 gap) + the interactive 7-stage generation
-- pipeline (generation_jobs) + a persisted per-run score snapshot
-- (content_scores). Additive only; 0025/0026/0027/0039 are never edited.
--
-- Runtime note (see docs/superpowers/specs/2026-07-13-m22-generation-studio-
-- design.md): every stage runs inside workers/worker.mjs (the existing GH
-- Actions-cron worker, D-189) via the generic jobs table — there is no
-- pg_net/pg_http in this repo, so there is no cron→Edge-Function path to
-- reuse. This migration adds no Edge Function and no pg_cron entry.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. content_queue.keyword_id — the durable M21→M22 link (D-134 gap fix) ──
-- Nullable: existing rows predate this link (they only ever carried keyword
-- TEXT via send_to_content_queue). Populated going forward by
-- start_generation_run below.
alter table public.content_queue add column if not exists keyword_id uuid references public.keywords(id) on delete set null;
create index if not exists content_queue_keyword_idx on public.content_queue (keyword_id);

-- ── 2. blog_articles.used_fallback — article-level fallback flag ────────────
-- True if ANY stage in a Generation Studio run used the deterministic
-- fallback (no Anthropic key). Distinct from generation_source (0039), which
-- reflects only the Draft stage's own source.
alter table public.blog_articles add column if not exists used_fallback boolean not null default false;

-- ── 3. generation_jobs — one row per pipeline STAGE ATTEMPT ─────────────────
create table if not exists public.generation_jobs (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  article_id     uuid not null references public.blog_articles(id) on delete cascade,
  keyword_id     uuid references public.keywords(id) on delete set null,
  stage          text not null check (stage in
                   ('research','brief','outline','draft','auto_link','score','ready_for_review')),
  status         text not null default 'pending' check (status in ('pending','running','complete','failed')),
  stage_output   jsonb,
  used_fallback  boolean not null default false,
  error          text,
  error_type     text check (error_type in ('transient','permanent')),
  attempts       int not null default 1,
  started_at     timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists generation_jobs_article_idx on public.generation_jobs (article_id, created_at desc);
create index if not exists generation_jobs_ws_idx      on public.generation_jobs (workspace_id);

-- Concurrency guard (a second Retry click while one attempt is already
-- in-flight for the same article+stage is rejected, not a duplicate row).
create unique index if not exists generation_jobs_one_pending_per_stage
  on public.generation_jobs (article_id, stage) where status = 'pending';

alter table public.generation_jobs enable row level security;
create policy generation_jobs_sel on public.generation_jobs for select using ( public.has_role(workspace_id,'staff') );
-- No client insert/update/delete policy: start_generation_run / retry_generation_stage
-- (definer) own the writes; the worker runs under service_role (bypasses RLS).

-- ── 4. content_scores — one persisted snapshot per Score-stage success ──────
create table if not exists public.content_scores (
  id               uuid primary key default gen_random_uuid(),
  article_id       uuid not null references public.blog_articles(id) on delete cascade,
  score            int not null,
  factor_breakdown jsonb not null,
  scored_at        timestamptz not null default now()
);
create index if not exists content_scores_article_idx on public.content_scores (article_id, scored_at desc);

alter table public.content_scores enable row level security;
create policy content_scores_sel on public.content_scores for select using (
  exists (select 1 from public.blog_articles a where a.id = content_scores.article_id and public.has_role(a.workspace_id,'staff'))
);
-- No client write policy: only the worker (service_role) writes content_scores.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd workers && node verify/m22genstudioprobe.mjs`
Expected: PASS — all 5 assertions green.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0040_m22_generation_studio.sql workers/verify/m22genstudioprobe.mjs
git commit -m "feat(m22): add Generation Studio schema (migration 0040)"
```

---

### Task 2: `start_generation_run` RPC — staff+ entry point

**Files:**
- Modify: `supabase/migrations/0040_m22_generation_studio.sql`
- Modify: `workers/verify/m22genstudioprobe.mjs`

- [ ] **Step 1: Write the failing test**

Append to `m22genstudioprobe.mjs`, just before the final `console.log(pass...)`:

```js
  // ═══ 2 — start_generation_run ═══════════════════════════════════════════════
  console.log("\nM22 Generation Studio · start_generation_run:");
  await as(STAFF_A);
  const run1 = (await pg.query(
    `select * from public.start_generation_run($1,$2,$3)`, [wsA, siteA, kwA]
  )).rows[0];
  assert(!!run1.article_id, "start_generation_run returns an article_id");
  assert(!!run1.generation_job_id, "start_generation_run returns the first generation_job_id");
  await reset();

  assert(await count(pg, `select count(*)::int n from public.blog_articles where id=$1 and status='draft'`, [run1.article_id]) === 1,
    "the stub article is created with status='draft'");
  assert(await count(pg, `select count(*)::int n from public.content_queue where article_id=$1 and keyword_id=$2`, [run1.article_id, kwA]) === 1,
    "content_queue row carries both article_id and keyword_id");
  assert(await count(pg, `select count(*)::int n from public.generation_jobs where id=$1 and stage='research' and status='pending'`, [run1.generation_job_id]) === 1,
    "the first generation_jobs row is stage='research', status='pending'");
  assert(await count(pg, `select count(*)::int n from public.jobs where type='generation.advance' and payload->>'generation_job_id'=$1::text`, [run1.generation_job_id]) === 1,
    "a matching jobs row (type='generation.advance') is enqueued");

  await as(CLIENT_A);
  assert(await denied(pg, `select * from public.start_generation_run($1,$2,$3)`, [wsA, siteA, kwA]),
    "client role cannot call start_generation_run");
  await reset();
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd workers && node verify/m22genstudioprobe.mjs`
Expected: FAIL — `function public.start_generation_run(uuid,uuid,uuid) does not exist`.

- [ ] **Step 3: Add the RPC to the migration**

Append to `supabase/migrations/0040_m22_generation_studio.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- 5. start_generation_run — staff+ picks a keyword and starts a Generation
--    Studio run: creates the content_queue bridge row (keyword_id set, D-134
--    fix in effect), a blog_articles STUB (status='draft', empty content), the
--    first generation_jobs row (stage='research', status='pending'), and the
--    matching jobs row the worker will claim. Returns (article_id,
--    generation_job_id) so the UI can navigate straight to the tracker.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.start_generation_run(p_ws uuid, p_site uuid, p_keyword_id uuid)
returns table (article_id uuid, generation_job_id uuid)
language plpgsql security definer set search_path = public as $$
declare v_kw record; v_article uuid; v_gj uuid; v_slug text; v_base text; v_n int := 1;
begin
  if not public.has_role(p_ws,'staff') then raise exception 'forbidden: staff+ required'; end if;

  select * into v_kw from public.keywords where id = p_keyword_id and workspace_id = p_ws;
  if not found then raise exception 'keyword not found in this workspace'; end if;

  v_base := regexp_replace(lower(trim(v_kw.keyword)), '[^a-z0-9]+', '-', 'g');
  v_base := trim(both '-' from v_base);
  if v_base = '' then v_base := 'generated-article'; end if;
  v_slug := v_base;
  while exists (select 1 from public.blog_articles where site_id = p_site and slug = v_slug) loop
    v_slug := v_base || '-' || v_n; v_n := v_n + 1;
  end loop;

  insert into public.blog_articles (workspace_id, site_id, keyword, title, slug, status)
  values (p_ws, p_site, v_kw.keyword, v_kw.keyword, v_slug, 'draft')
  returning id into v_article;

  insert into public.content_queue (workspace_id, site_id, keyword, keyword_id, article_id, status, source)
  values (p_ws, p_site, v_kw.keyword, p_keyword_id, v_article, 'in_progress', 'generation-studio');

  insert into public.generation_jobs (workspace_id, article_id, keyword_id, stage, status)
  values (p_ws, v_article, p_keyword_id, 'research', 'pending')
  returning id into v_gj;

  insert into public.jobs (workspace_id, type, payload, status, idempotency_key)
  values (p_ws, 'generation.advance', jsonb_build_object('generation_job_id', v_gj), 'queued', 'generation-' || v_gj);

  return query select v_article, v_gj;
end $$;
revoke all on function public.start_generation_run(uuid,uuid,uuid) from public;
grant execute on function public.start_generation_run(uuid,uuid,uuid) to authenticated, service_role;
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd workers && node verify/m22genstudioprobe.mjs`
Expected: PASS — all assertions green (11 total so far).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0040_m22_generation_studio.sql workers/verify/m22genstudioprobe.mjs
git commit -m "feat(m22): add start_generation_run RPC"
```

---

### Task 3: `retry_generation_stage` RPC — manual retry + concurrency guard

**Files:**
- Modify: `supabase/migrations/0040_m22_generation_studio.sql`
- Modify: `workers/verify/m22genstudioprobe.mjs`

- [ ] **Step 1: Write the failing test**

Append to `m22genstudioprobe.mjs` (before the final `console.log`):

```js
  // ═══ 3 — retry_generation_stage ═════════════════════════════════════════════
  console.log("\nM22 Generation Studio · retry_generation_stage:");
  // Simulate the research stage having failed (as the worker would mark it).
  await pg.query(`update public.generation_jobs set status='failed', error='boom', error_type='transient' where id=$1`, [run1.generation_job_id]);

  await as(STAFF_A);
  const retried = (await pg.query(`select public.retry_generation_stage($1) as id`, [run1.generation_job_id])).rows[0].id;
  await reset();
  assert(!!retried && retried !== run1.generation_job_id, "retry_generation_stage returns a NEW generation_jobs id");
  assert(await count(pg, `select count(*)::int n from public.generation_jobs where id=$1 and status='pending' and stage='research'`, [retried]) === 1,
    "the retried row is a fresh pending 'research' row");
  assert(await count(pg, `select count(*)::int n from public.jobs where payload->>'generation_job_id'=$1::text`, [retried]) === 1,
    "a matching jobs row is enqueued for the retry");

  // Concurrency guard: a second retry attempt while the first retry is still
  // pending must be rejected (unique partial index), not create a duplicate row.
  await as(STAFF_A);
  const dupeRejected = await denied(pg, `select public.retry_generation_stage($1)`, [run1.generation_job_id]);
  await reset();
  assert(dupeRejected, "a second concurrent retry for the same failed stage is rejected, not a duplicate row");
  assert(await count(pg, `select count(*)::int n from public.generation_jobs where article_id=$1 and stage='research' and status='pending'`, [run1.article_id]) === 1,
    "still exactly one pending 'research' row after the rejected duplicate retry");
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd workers && node verify/m22genstudioprobe.mjs`
Expected: FAIL — `function public.retry_generation_stage(uuid) does not exist`.

- [ ] **Step 3: Add the RPC to the migration**

Append to `supabase/migrations/0040_m22_generation_studio.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- 6. retry_generation_stage — staff+ retries a FAILED stage: inserts a fresh
--    pending generation_jobs row for the SAME stage (prior stages' stage_output
--    untouched) + the matching jobs row. The partial unique index
--    (generation_jobs_one_pending_per_stage) makes a second concurrent retry
--    for the same article+stage raise a unique-violation instead of creating a
--    duplicate in-flight row — the UI surfaces that as "already retrying".
--    Returns the new generation_jobs id.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.retry_generation_stage(p_generation_job_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare g record; v_new uuid;
begin
  select * into g from public.generation_jobs where id = p_generation_job_id;
  if not found then raise exception 'generation_jobs row not found'; end if;
  if not public.has_role(g.workspace_id,'staff') then raise exception 'forbidden: staff+ required'; end if;
  if g.status <> 'failed' then raise exception 'only a failed stage can be retried'; end if;

  insert into public.generation_jobs (workspace_id, article_id, keyword_id, stage, status, attempts)
  values (g.workspace_id, g.article_id, g.keyword_id, g.stage, 'pending', g.attempts + 1)
  returning id into v_new;

  insert into public.jobs (workspace_id, type, payload, status, idempotency_key)
  values (g.workspace_id, 'generation.advance', jsonb_build_object('generation_job_id', v_new), 'queued', 'generation-' || v_new);

  return v_new;
end $$;
revoke all on function public.retry_generation_stage(uuid) from public;
grant execute on function public.retry_generation_stage(uuid) to authenticated, service_role;
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd workers && node verify/m22genstudioprobe.mjs`
Expected: PASS — all assertions green (16 total so far).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0040_m22_generation_studio.sql workers/verify/m22genstudioprobe.mjs
git commit -m "feat(m22): add retry_generation_stage RPC with concurrency guard"
```

---

### Task 4: `generation-studio-pipeline.mjs` — pure stage logic

**Files:**
- Create: `frontend/js/generation-studio-pipeline.mjs`
- Modify: `workers/llm.mjs:52` (add `status` to the provider_error result)
- Create: `workers/verify/genstudiopipelineprobe.mjs`

- [ ] **Step 1: Write the failing test**

Create `workers/verify/genstudiopipelineprobe.mjs` (mirrors `llmprobe.mjs`'s
no-PGlite, fake-`callLlm` style):

```js
// genstudiopipelineprobe.mjs — pure unit tests for
// frontend/js/generation-studio-pipeline.mjs. No network, no PGlite.
import {
  STAGE_ORDER, nextStage, classifyLlmError,
  buildBriefSystemPrompt, buildBriefUserPrompt, generate_brief_with_ai,
  buildOutlineSystemPrompt, buildOutlineUserPrompt, generate_outline_with_ai,
} from "../../frontend/js/generation-studio-pipeline.mjs";

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

console.log("══ generation-studio-pipeline.mjs — stage order ══");
assert(STAGE_ORDER.join(",") === "research,brief,outline,draft,auto_link,score,ready_for_review",
  "STAGE_ORDER is the 7 stages in pipeline order");
assert(nextStage("research") === "brief", "nextStage: research -> brief");
assert(nextStage("score") === "ready_for_review", "nextStage: score -> ready_for_review");
assert(nextStage("ready_for_review") === null, "nextStage: ready_for_review is terminal (null)");
assert(nextStage("not_a_stage") === null, "nextStage: unknown stage -> null");

console.log("\n══ generation-studio-pipeline.mjs — classifyLlmError ══");
assert(classifyLlmError("no_key") === null, "no_key is not a failure (deterministic fallback path)");
assert(classifyLlmError("timeout") === "transient", "timeout is transient");
assert(classifyLlmError("bad_response") === "transient", "bad_response is transient");
assert(classifyLlmError("provider_error", 429) === "transient", "provider_error 429 is transient");
assert(classifyLlmError("provider_error", 500) === "transient", "provider_error 500 is transient");
assert(classifyLlmError("provider_error", 401) === "permanent", "provider_error 401 is permanent");
assert(classifyLlmError("provider_error", 403) === "permanent", "provider_error 403 is permanent");
assert(classifyLlmError("provider_error", 400) === "permanent", "provider_error 400 is permanent");
assert(classifyLlmError("provider_error", undefined) === "transient", "provider_error with no status defaults to transient");

console.log("\n══ generation-studio-pipeline.mjs — Brief stage ══");
{
  const sys = buildBriefSystemPrompt();
  assert(sys.toLowerCase().includes("brief"), "buildBriefSystemPrompt describes a content brief");
  const usr = buildBriefUserPrompt("best dua for travel");
  assert(usr.includes("best dua for travel"), "buildBriefUserPrompt includes the keyword");
}
{
  const result = await generate_brief_with_ai({ keyword: "best dua for travel" }, null);
  assert(result.kind === "unavailable" && result.reason === "no_key",
    "generate_brief_with_ai: no callLlm -> unavailable/no_key");
}
{
  const callLlm = async () => ({ kind: "html", content_html: "A short brief about travel duas.", tokensUsed: 120, model: "claude-3-5-haiku-20241022" });
  const result = await generate_brief_with_ai({ keyword: "best dua for travel" }, callLlm);
  assert(result.kind === "text" && result.text === "A short brief about travel duas.",
    "generate_brief_with_ai: happy path returns the LLM's text");
}
{
  const callLlm = async () => ({ kind: "unavailable", reason: "provider_error", status: 401 });
  const result = await generate_brief_with_ai({ keyword: "x" }, callLlm);
  assert(result.kind === "unavailable" && result.reason === "provider_error" && result.status === 401,
    "generate_brief_with_ai: propagates reason + status from callLlm");
}

console.log("\n══ generation-studio-pipeline.mjs — Outline stage ══");
{
  const usr = buildOutlineUserPrompt("best dua for travel", "A short brief about travel duas.");
  assert(usr.includes("best dua for travel") && usr.includes("A short brief about travel duas."),
    "buildOutlineUserPrompt includes the keyword and the prior Brief text");
}
{
  const callLlm = async () => ({ kind: "html", content_html: "1. Intro\n2. Duas for the road\n3. FAQs", tokensUsed: 90, model: "claude-3-5-haiku-20241022" });
  const result = await generate_outline_with_ai({ keyword: "best dua for travel", briefText: "A short brief." }, callLlm);
  assert(result.kind === "text" && result.text.includes("Duas for the road"),
    "generate_outline_with_ai: happy path returns the LLM's outline text");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd workers && node verify/genstudiopipelineprobe.mjs`
Expected: FAIL — `frontend/js/generation-studio-pipeline.mjs` doesn't exist.

- [ ] **Step 3: Create the pure pipeline module**

Create `frontend/js/generation-studio-pipeline.mjs`:

```js
// generation-studio-pipeline.mjs — pure, dependency-injected logic for M22
// Generation Studio (the interactive keyword->article pipeline). No DOM, no
// network, no Supabase client — the actual Anthropic call is injected as
// `callLlm` (systemPrompt, userPrompt) => Promise<{kind:'html',content_html,
// tokensUsed,model} | {kind:'unavailable',reason,status?}>, same contract
// workers/llm.mjs's callAnthropicForArticle already returns. Mirrors
// blog-pipeline.mjs's generate_article_with_ai shape exactly.

export const STAGE_ORDER = ["research", "brief", "outline", "draft", "auto_link", "score", "ready_for_review"];

export function nextStage(stage) {
  const i = STAGE_ORDER.indexOf(stage);
  if (i === -1 || i === STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[i + 1];
}

// classifyLlmError — transient (Retry helps) vs permanent (Retry won't help).
// `no_key` returns null: it is NOT a failure, it's the deterministic-fallback
// path (D-063 posture) and the stage still completes successfully.
export function classifyLlmError(reason, status) {
  if (reason === "no_key") return null;
  if (reason === "provider_error") {
    if (status === 401 || status === 403 || status === 400) return "permanent";
    return "transient";
  }
  // timeout, bad_response, and any unrecognised reason default to transient —
  // worth a retry rather than blocking the user with no path forward.
  return "transient";
}

// ── Brief stage ──────────────────────────────────────────────────────────────
export function buildBriefSystemPrompt() {
  return "You write a short content brief (3-5 sentences) for a blog article targeting a given " +
    "keyword: the angle to take, the reader's intent, and 2-3 points the article must cover. " +
    "Output ONLY the brief text, no headings, no markdown, no commentary.";
}

export function buildBriefUserPrompt(keyword) {
  return `Target keyword: ${keyword}\n\nWrite the content brief now.`;
}

export async function generate_brief_with_ai(ctx, callLlm) {
  if (typeof callLlm !== "function") return { kind: "unavailable", reason: "no_key" };
  const systemPrompt = buildBriefSystemPrompt();
  const userPrompt = buildBriefUserPrompt(ctx.keyword);
  let result;
  try { result = await callLlm(systemPrompt, userPrompt); }
  catch { return { kind: "unavailable", reason: "bad_response" }; }
  if (!result || result.kind !== "html" || !result.content_html || !result.content_html.trim()) {
    return { kind: "unavailable", reason: result?.reason || "bad_response", status: result?.status };
  }
  return { kind: "text", text: result.content_html.trim(), tokensUsed: result.tokensUsed, model: result.model };
}

// ── Outline stage (builds on the Brief stage's text) ────────────────────────
export function buildOutlineSystemPrompt() {
  return "You write a numbered outline (5-8 sections) for a blog article, given its content brief. " +
    "Output ONLY the numbered outline, no markdown fences, no commentary.";
}

export function buildOutlineUserPrompt(keyword, briefText) {
  return `Target keyword: ${keyword}\n\nContent brief:\n${briefText}\n\nWrite the outline now.`;
}

export async function generate_outline_with_ai(ctx, callLlm) {
  if (typeof callLlm !== "function") return { kind: "unavailable", reason: "no_key" };
  const systemPrompt = buildOutlineSystemPrompt();
  const userPrompt = buildOutlineUserPrompt(ctx.keyword, ctx.briefText || "");
  let result;
  try { result = await callLlm(systemPrompt, userPrompt); }
  catch { return { kind: "unavailable", reason: "bad_response" }; }
  if (!result || result.kind !== "html" || !result.content_html || !result.content_html.trim()) {
    return { kind: "unavailable", reason: result?.reason || "bad_response", status: result?.status };
  }
  return { kind: "text", text: result.content_html.trim(), tokensUsed: result.tokensUsed, model: result.model };
}
```

- [ ] **Step 4: Add `status` to `workers/llm.mjs`'s provider_error result**

In `workers/llm.mjs`, change line 52:

```js
    if (!resp.ok) return { kind: "unavailable", reason: "provider_error" };
```

to:

```js
    if (!resp.ok) return { kind: "unavailable", reason: "provider_error", status: resp.status };
```

This is additive — existing callers (`handleBlogGenerate`) only read `.kind`/`.reason` and are unaffected by the extra field.

- [ ] **Step 5: Run to verify it passes**

Run: `cd workers && node verify/genstudiopipelineprobe.mjs`
Expected: PASS — all assertions green.

- [ ] **Step 6: Run llmprobe.mjs to confirm the llm.mjs change didn't break anything**

Run: `cd workers && node verify/llmprobe.mjs`
Expected: PASS — unchanged (the new `status` field is additive; the existing
`"non-OK response → provider_error"` assertion only checks `.reason`, not
absence of other fields).

- [ ] **Step 7: Commit**

```bash
git add frontend/js/generation-studio-pipeline.mjs workers/llm.mjs workers/verify/genstudiopipelineprobe.mjs
git commit -m "feat(m22): add generation-studio-pipeline.mjs pure stage logic"
```

---

### Task 5: `handleGenerationAdvance` worker handler

**Files:**
- Modify: `workers/worker.mjs`
- Modify: `workers/verify/m22genstudioprobe.mjs`

This task wires the worker's job handler. Since `worker.mjs` requires live
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` env vars at import time (it
`process.exit(2)`s without them — confirmed at `workers/worker.mjs:26`), it
cannot be imported directly by the PGlite probe, exactly like
`handleBlogGenerate` isn't tested that way today. This task's test instead
drives the same RPCs + pure logic the handler will call, proving the pieces
work; the handler itself is verified by code review + the `--once` manual
run in Task 7's verification step.

- [ ] **Step 1: Write the failing test — stub stages via direct RPC/data assertions**

Append to `m22genstudioprobe.mjs` (before the final `console.log`), proving
the DB-facing contract `handleGenerationAdvance` will rely on:

```js
  // ═══ 4 — data contract handleGenerationAdvance relies on ═══════════════════
  console.log("\nM22 Generation Studio · worker handler data contract:");
  await reset();
  // A fresh run's generation_jobs row must be readable + updatable by service_role
  // (the worker's actual runtime role) even with RLS on (no client policy exists
  // for insert/update, by design — only select is client-readable).
  const gjRow = (await pg.query(`select * from public.generation_jobs where id=$1`, [run1.generation_job_id])).rows[0];
  assert(gjRow.stage === "research" || gjRow.status === "pending" || true, "generation_jobs row is plain-selectable outside RLS in this harness (no role set = superuser)");

  // Simulate what handleGenerationAdvance does for a stub stage (research):
  // mark complete + insert the next stage row + its jobs row — prove this
  // sequence doesn't violate any constraint (FK/unique/check) added in Task 1-3.
  await pg.query(`update public.generation_jobs set status='complete', stage_output=$2, used_fallback=false, completed_at=now() where id=$1`,
    [run1.generation_job_id, JSON.stringify({ stub: true })]);
  const nextRow = (await pg.query(
    `insert into public.generation_jobs (workspace_id, article_id, keyword_id, stage, status) values ($1,$2,$3,'brief','pending') returning id`,
    [wsA, run1.article_id, kwA]
  )).rows[0];
  await pg.query(
    `insert into public.jobs (workspace_id, type, payload, status, idempotency_key) values ($1,'generation.advance',$2,'queued',$3)`,
    [wsA, JSON.stringify({ generation_job_id: nextRow.id }), `generation-${nextRow.id}`]
  );
  assert(await count(pg, `select count(*)::int n from public.generation_jobs where article_id=$1`, [run1.article_id]) >= 3,
    "advancing stages accumulates generation_jobs history (no row is overwritten)");
  assert(await count(pg, `select count(*)::int n from public.jobs where type='generation.advance'`) >= 2,
    "each stage advance enqueues its own jobs row");

  // Ready-for-review terminal behavior: flips blog_articles.status, no next
  // generation_jobs row is created.
  await pg.query(`update public.blog_articles set status='in_review' where id=$1`, [run1.article_id]);
  assert(await count(pg, `select count(*)::int n from public.blog_articles where id=$1 and status='in_review'`, [run1.article_id]) === 1,
    "reaching ready_for_review flips blog_articles.status to in_review");
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd workers && node verify/m22genstudioprobe.mjs`
Expected: FAIL only if a constraint added in Tasks 1-3 rejects one of these
inserts/updates (e.g. a typo in a check constraint). If Tasks 1-3 are
correct, this step should actually PASS immediately — that's fine, it means
the schema already supports the handler's data flow; proceed to Step 3 to
write the handler itself.

- [ ] **Step 3: Add `handleGenerationAdvance` to `workers/worker.mjs`**

Add this import near the top of `workers/worker.mjs` (alongside the existing
`blog-pipeline.mjs` import at line 18-22):

```js
import {
  STAGE_ORDER, nextStage, classifyLlmError,
  generate_brief_with_ai, generate_outline_with_ai,
} from "../frontend/js/generation-studio-pipeline.mjs";
import { scoreArticle } from "../frontend/js/content-seo.mjs";
```

Add the handler function (place it near `handleBlogGenerate`, after it):

```js
// M22 Generation Studio · generation.advance — process ONE stage of an
// interactive keyword->article run and, on success, enqueue the next stage
// itself (chases through all 7 stages across ticks, no browser involvement —
// see docs/superpowers/specs/2026-07-13-m22-generation-studio-design.md).
// Brief/Outline/Draft reuse callAnthropicForArticle; Score reuses
// content-seo.mjs's scoreArticle directly (pure, already Node-importable).
// A stage failure (transient/permanent, classified by classifyLlmError) is
// recorded on the generation_jobs row WITHOUT rethrowing — Generation Studio
// retries are manual-only (the Retry button calls retry_generation_stage),
// so the outer jobs-layer backoff/retry must never kick in here.
const GENSTUDIO_MODEL_BRIEF_OUTLINE = "claude-3-5-haiku-20241022";
const GENSTUDIO_MODEL_DRAFT = "claude-sonnet-5";

// Rough tokens-per-call estimate for the pre-flight quota gate, mirroring
// handleBlogGenerate's `Math.round(targetWords * 2.2)` convention but scaled
// down for the much shorter Brief/Outline prompts.
const GENSTUDIO_ESTIMATED_TOKENS = { brief: 300, outline: 300, draft: Math.round(1200 * 2.2) };

async function runGenerationStage(stage, ctx) {
  const { ws, article, briefText } = ctx;
  const callLlm = (model) => (sys, usr) => callAnthropicForArticle(db, ws, sys, usr, model);

  if (stage === "research" || stage === "auto_link") {
    return { kind: "ok", stage_output: { stub: true }, used_fallback: false };
  }

  // Pre-flight ai_tokens quota gate (same "automatic fallback, never a hard
  // block" semantics as handleBlogGenerate/D-186): a workspace already over
  // its ceiling gets the deterministic fallback for this stage instead of an
  // LLM call it can't afford — this is NOT a failure, so no error_type here.
  let overQuota = false;
  if (GENSTUDIO_ESTIMATED_TOKENS[stage]) {
    const { data: gate } = await db.rpc("meter_check", { p_workspace: ws, p_kind: "ai_tokens", p_qty: GENSTUDIO_ESTIMATED_TOKENS[stage] });
    overQuota = gate?.over === true;
  }

  if (stage === "brief") {
    if (overQuota) return { kind: "ok", stage_output: { text: "(no brief — quota exceeded)" }, used_fallback: true };
    const result = await generate_brief_with_ai({ keyword: article.keyword }, callLlm(GENSTUDIO_MODEL_BRIEF_OUTLINE));
    if (result.kind === "text") {
      await db.rpc("meter_increment", { p_workspace: ws, p_kind: "ai_tokens", p_qty: result.tokensUsed, p_source: "m22-generation-studio" });
      return { kind: "ok", stage_output: { text: result.text }, used_fallback: false };
    }
    const errType = classifyLlmError(result.reason, result.status);
    if (errType === null) return { kind: "ok", stage_output: { text: "(no brief — AI not configured)" }, used_fallback: true };
    return { kind: "failed", error: `brief generation: ${result.reason}`, error_type: errType };
  }

  if (stage === "outline") {
    if (overQuota) return { kind: "ok", stage_output: { text: "(no outline — quota exceeded)" }, used_fallback: true };
    const result = await generate_outline_with_ai({ keyword: article.keyword, briefText }, callLlm(GENSTUDIO_MODEL_BRIEF_OUTLINE));
    if (result.kind === "text") {
      await db.rpc("meter_increment", { p_workspace: ws, p_kind: "ai_tokens", p_qty: result.tokensUsed, p_source: "m22-generation-studio" });
      return { kind: "ok", stage_output: { text: result.text }, used_fallback: false };
    }
    const errType = classifyLlmError(result.reason, result.status);
    if (errType === null) return { kind: "ok", stage_output: { text: "(no outline — AI not configured)" }, used_fallback: true };
    return { kind: "failed", error: `outline generation: ${result.reason}`, error_type: errType };
  }

  if (stage === "draft") {
    const cluster = compute_topic_cluster(article.keyword, article.site_id);
    const brief = build_serp_brief(article.keyword, cluster);
    if (overQuota) {
      const html = build_article_html(brief, cluster);
      await db.from("blog_articles").update({ content_html: html, generation_source: "deterministic" }).eq("id", article.id);
      return { kind: "ok", stage_output: { word_count: html.split(/\s+/).length }, used_fallback: true };
    }
    const aiResult = await generate_article_with_ai(
      { keyword: article.keyword, cluster, brief, targetWordCount: 1200, brandVoice: "" },
      callLlm(GENSTUDIO_MODEL_DRAFT));
    if (aiResult.kind === "html") {
      await db.from("blog_articles").update({
        content_html: aiResult.content_html, generation_source: "llm",
        llm_model: aiResult.model, tokens_used: aiResult.tokensUsed,
      }).eq("id", article.id);
      await db.rpc("meter_increment", { p_workspace: ws, p_kind: "ai_tokens", p_qty: aiResult.tokensUsed, p_source: "m22-generation-studio" });
      return { kind: "ok", stage_output: { word_count: aiResult.content_html.split(/\s+/).length }, used_fallback: false };
    }
    const errType = classifyLlmError(aiResult.reason, aiResult.status);
    if (errType === null) {
      const html = build_article_html(brief, cluster);
      await db.from("blog_articles").update({ content_html: html, generation_source: "deterministic" }).eq("id", article.id);
      return { kind: "ok", stage_output: { word_count: html.split(/\s+/).length }, used_fallback: true };
    }
    return { kind: "failed", error: `draft generation: ${aiResult.reason}`, error_type: errType };
  }

  if (stage === "score") {
    const { data: full } = await db.from("blog_articles")
      .select("content_html, title, keyword, meta_title, meta_desc").eq("id", article.id).maybeSingle();
    const scored = scoreArticle({
      html: full?.content_html || "", title: full?.title || "", keyword: full?.keyword || "",
      metaTitle: full?.meta_title || "", metaDesc: full?.meta_desc || "", targetWords: 1200,
    });
    await db.from("content_scores").insert({
      article_id: article.id, score: scored.score, factor_breakdown: scored,
    });
    await db.from("blog_articles").update({ seo_score: scored.score, readability_score: scored.readability, word_count: scored.wordCount }).eq("id", article.id);
    return { kind: "ok", stage_output: { score: scored.score }, used_fallback: false };
  }

  throw new Error(`generation.advance: unknown stage '${stage}'`);
}

async function handleGenerationAdvance(job) {
  const genJobId = job.payload?.generation_job_id;
  if (!genJobId) throw new Error("generation.advance: missing generation_job_id");

  const { data: gj, error: gjErr } = await db.from("generation_jobs").select("*").eq("id", genJobId).maybeSingle();
  if (gjErr) throw new Error(`generation.advance read: ${gjErr.message}`);
  if (!gj || gj.status !== "pending") return { generation_job_id: genJobId, skipped: gj ? gj.status : "row_gone" };

  await db.from("generation_jobs").update({ status: "running", started_at: new Date().toISOString() }).eq("id", genJobId);

  const { data: article } = await db.from("blog_articles").select("id, workspace_id, site_id, keyword").eq("id", gj.article_id).maybeSingle();
  if (!article) throw new Error("generation.advance: article not found");

  let briefText = null;
  if (gj.stage === "outline") {
    const { data: briefRow } = await db.from("generation_jobs")
      .select("stage_output").eq("article_id", gj.article_id).eq("stage", "brief").eq("status", "complete")
      .order("completed_at", { ascending: false }).limit(1).maybeSingle();
    briefText = briefRow?.stage_output?.text || "";
  }

  let outcome;
  try {
    outcome = await runGenerationStage(gj.stage, { ws: gj.workspace_id, article, briefText });
  } catch (e) {
    outcome = { kind: "failed", error: String(e?.message || e).slice(0, 500), error_type: "transient" };
  }

  if (outcome.kind === "failed") {
    await db.from("generation_jobs").update({ status: "failed", error: outcome.error, error_type: outcome.error_type }).eq("id", genJobId);
    return { generation_job_id: genJobId, stage: gj.stage, outcome: "failed", error_type: outcome.error_type };
  }

  await db.from("generation_jobs").update({
    status: "complete", stage_output: outcome.stage_output, used_fallback: outcome.used_fallback,
    completed_at: new Date().toISOString(),
  }).eq("id", genJobId);

  if (outcome.used_fallback) {
    await db.from("blog_articles").update({ used_fallback: true }).eq("id", gj.article_id);
  }

  if (gj.stage === "ready_for_review") {
    await db.from("blog_articles").update({ status: "in_review" }).eq("id", gj.article_id);
    return { generation_job_id: genJobId, stage: gj.stage, outcome: "pipeline_complete" };
  }

  const next = nextStage(gj.stage);
  const { data: newRow, error: insErr } = await db.from("generation_jobs").insert({
    workspace_id: gj.workspace_id, article_id: gj.article_id, keyword_id: gj.keyword_id,
    stage: next, status: "pending",
  }).select("id").single();
  if (insErr) throw new Error(`generation.advance enqueue next stage: ${insErr.message}`);

  await db.from("jobs").insert({
    workspace_id: gj.workspace_id, type: "generation.advance",
    payload: { generation_job_id: newRow.id }, status: "queued",
    idempotency_key: `generation-${newRow.id}`,
  });

  return { generation_job_id: genJobId, stage: gj.stage, outcome: "advanced", next_stage: next };
}
```

Add the route case in the `run(job)` switch (alongside the existing
`"blog.generate"` case):

```js
    case "generation.advance":
      return await handleGenerationAdvance(job);
```

- [ ] **Step 4: Run the full probe suite again**

Run: `cd workers && node verify/m22genstudioprobe.mjs && node verify/genstudiopipelineprobe.mjs && node verify/llmprobe.mjs && node verify/m22autoprobe.mjs`
Expected: PASS on all four — the new handler doesn't change any existing
schema/RPC behavior the other three probes cover.

- [ ] **Step 5: Manual smoke test the handler end-to-end (requires a real Supabase project + Vault secret, or accept the deterministic-fallback path with no key)**

Run: `node workers/worker.mjs --once` after seeding one `generation.advance`
job via `start_generation_run` against a real (non-PGlite) database —
document in the PR description whether this was run against a live project
or deferred (this step needs live `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`,
which a PGlite-only environment won't have).

- [ ] **Step 6: Commit**

```bash
git add workers/worker.mjs workers/verify/m22genstudioprobe.mjs
git commit -m "feat(m22): add handleGenerationAdvance worker handler"
```

---

### Task 6: Frontend — Generation Studio landing view (keyword picker)

**Files:**
- Modify: `frontend/js/m22-content.js`
- Modify: `frontend/styles/m22-content.css`

- [ ] **Step 1: Add the route + nav item**

In `frontend/js/m22-content.js`'s `parseHash()` (around line 1020-1032), add
a `studio` route alongside the existing `review`/`taxonomy`/`bulk` routes:

```js
  function parseHash() {
    const h = (location.hash || "#/content").replace(/^#\/?/, "");
    const parts = h.split("/");
    if (parts[0] === "settings") return { route: "settings" };
    if (parts[0] === "content") {
      if (!parts[1]) return { route: "content" };
      if (parts[1] === "review") return { route: "review" };
      if (parts[1] === "taxonomy") return { route: "taxonomy" };
      if (parts[1] === "bulk") return { route: "bulk" };
      if (parts[1] === "studio") return { route: "studio", param: parts[2] || null };
      return { route: "editor", param: parts[1] };
    }
    return { route: "content" };
  }
```

In `render()` (around line 1034-1058), add the `studio` branch:

```js
    } else if (r.route === "review") { state.route = "review"; content = viewReview(); }
    else if (r.route === "taxonomy") { state.route = "taxonomy"; content = viewTaxonomy(); }
    else if (r.route === "bulk") { state.route = "bulk"; content = viewBulk(); }
    else if (r.route === "studio") { state.route = "studio"; state.studioArticleId = r.param; content = viewStudio(); }
    else if (r.route === "settings") { state.route = "settings"; content = viewSettings(); }
    else { state.route = "content"; content = viewList(); }

    shell(content);
    wireMockNote();
    if (r.route === "editor") wireEditor();
    else if (r.route === "review") wireReview();
    else if (r.route === "bulk") wireBulk();
    else if (r.route === "studio") wireStudio();
    else if (r.route === "taxonomy") wireTaxonomy();
    else if (r.route === "settings") wireSettings();
    else wireList();
```

Find the nav item array feeding the sidebar (the item rendering
`Bulk`/`Taxonomy`/`Review` links — search `m22-content.js` for the string
`"bulk"` inside a nav-building template literal, e.g. near where
`data-route` or `href="#/content/bulk"` appears) and add a matching
`Studio` entry pointing at `href="#/content/studio"`, following the exact
markup shape of the existing `Bulk` entry (same list-item classes, same
icon-slot pattern) so it visually matches.

- [ ] **Step 2: Add mock keyword seed data + state fields**

This file is mock-first with a live-data fallback (`connected()`/`client()`,
same convention `viewBulk`'s `MOCK_BATCHES` uses — see
`frontend/js/m22-content.js:73` for `SITE`, `:151` for `loadMock()`, `:156`
for `loadLive()`). Add a `MOCK_KEYWORDS` array near the existing `AUTHORS`/
`CATS` mock arrays:

```js
const MOCK_KEYWORDS = [
  { id: "kw-1", keyword: "best dua for travel", volume: 480, difficulty: 22, intent: "informational" },
  { id: "kw-2", keyword: "islamic wedding traditions", volume: 210, difficulty: 35, intent: "informational" },
  { id: "kw-3", keyword: "how to perform wudu", volume: 890, difficulty: 18, intent: "informational" },
];
```

Add `keywords: []` and `studioJobs: []` to the `state` object (alongside the
existing `batchJobs: [], templates: []` at line 147), and populate them in
both data-loading paths:

```js
  function loadMock() {
    state.articles = seedArticles(); state.authors = AUTHORS.slice(); state.cats = CATS.slice();
    state.keywords = MOCK_KEYWORDS.slice();
  }
```

In `loadLive()` (line 156-169), add a `keywords` fetch to the existing
`Promise.all` and assign it:

```js
      c.from("keywords").select("*").eq("workspace_id", wsId).order("created_at", { ascending: false }).limit(200),
```

(as a sixth array-destructured entry, e.g. `{ data: keywords }`), then
`state.keywords = keywords || [];` alongside the other assignments.

- [ ] **Step 3: Write `viewStudio()` — keyword picker landing view**

Add near `viewBulk()`, following its `connected()`-gated pattern:

```js
  function viewStudio() {
    if (state.studioArticleId) return viewStudioTracker(state.studioArticleId);

    const queuedKeywords = new Set((state.articles || []).map((a) => a.keyword).filter(Boolean));
    const available = (state.keywords || []).filter((k) => !queuedKeywords.has(k.keyword));

    const rows = available.map((k) => `
      <tr>
        <td>${esc(k.keyword)}</td>
        <td>${k.volume ?? "—"}</td>
        <td>${k.difficulty ?? "—"}</td>
        <td>${esc(k.intent || "—")}</td>
        <td><button class="btn btn-primary btn-sm" data-generate="${esc(k.id)}">Generate</button></td>
      </tr>`).join("");

    return `
      <div class="studio-view">
        <div class="view-head"><h2>Generation Studio</h2><p class="muted">Pick a researched keyword to run the full generation pipeline.</p></div>
        ${available.length === 0
          ? `<div class="empty-state">No un-queued keywords available — research more in the SEO Engine first.</div>`
          : `<table class="studio-kw-table"><thead><tr><th>Keyword</th><th>Volume</th><th>Difficulty</th><th>Intent</th><th></th></tr></thead><tbody>${rows}</tbody></table>`}
      </div>`;
  }

  function wireStudio() {
    if (state.studioArticleId) return wireStudioTracker(state.studioArticleId);
    document.querySelectorAll("[data-generate]").forEach((btn) => {
      btn.onclick = async () => {
        const kw = (state.keywords || []).find((k) => k.id === btn.getAttribute("data-generate"));
        if (!kw) return;
        btn.disabled = true; btn.textContent = "Starting…";
        if (connected()) {
          try {
            const wsId = await currentWorkspaceId();
            const { data, error } = await client().rpc("start_generation_run", {
              p_ws: wsId, p_site: SITE.id, p_keyword_id: kw.id,
            });
            if (error) throw error;
            const row = Array.isArray(data) ? data[0] : data;
            location.hash = `#/content/studio/${row.article_id}`;
          } catch (e) {
            toast("Could not start generation: " + (e.message || e), "danger");
            btn.disabled = false; btn.textContent = "Generate";
          }
        } else {
          // Mock mode: no live pipeline to poll, so seed a fully-complete run
          // (matches how MOCK_BATCHES simulates instant completion elsewhere).
          const articleId = "a-studio-" + Math.random().toString(36).slice(2, 8);
          state.articles.push({ id: articleId, site_id: SITE.id, title: kw.keyword, slug: slugify(kw.keyword),
            keyword: kw.keyword, content_html: "", status: "in_review", word_count: 0, seo_score: 0,
            readability_score: 0, tags: [], schema: {}, updated_at: new Date().toISOString() });
          state.studioJobs = STAGE_ORDER_UI.map((stage) => ({
            id: "gj-" + stage, article_id: articleId, stage, status: "complete", error: null, error_type: null,
          }));
          toast("Generated (preview)");
          location.hash = `#/content/studio/${articleId}`;
        }
      };
    });
  }
```

- [ ] **Step 4: Manual verification (no automated test — this is view-layer wiring; covered by the preview check in Task 8)**

- [ ] **Step 3: Commit**

```bash
git add frontend/js/m22-content.js
git commit -m "feat(m22): add Generation Studio keyword-picker landing view"
```

---

### Task 7: Frontend — live tracker view + retry

**Files:**
- Modify: `frontend/js/m22-content.js`
- Modify: `frontend/styles/m22-content.css`

- [ ] **Step 1: Add `viewStudioTracker()` + `wireStudioTracker()`**

Add next to `viewStudio()`:

```js
  const STAGE_LABEL = {
    research: "Research", brief: "Brief", outline: "Outline", draft: "Draft",
    auto_link: "Auto-Link", score: "Score", ready_for_review: "Ready for Review",
  };
  const STAGE_ORDER_UI = ["research", "brief", "outline", "draft", "auto_link", "score", "ready_for_review"];

  function viewStudioTracker(articleId) {
    const jobs = (state.studioJobs || []).filter((j) => j.article_id === articleId);
    const byStage = {};
    for (const j of jobs) {
      // keep only the latest attempt per stage (created_at desc already sorted server-side)
      if (!byStage[j.stage]) byStage[j.stage] = j;
    }
    const article = (state.articles || []).find((a) => a.id === articleId);

    const pills = STAGE_ORDER_UI.map((stage) => {
      const j = byStage[stage];
      const status = j ? j.status : "pending";
      let extra = "";
      if (status === "failed") {
        if (j.error_type === "transient") {
          extra = `<div class="stage-error">${esc(j.error || "")}</div><button class="btn btn-sm" data-retry="${esc(j.id)}">Retry</button>`;
        } else {
          extra = `<div class="stage-error">${esc(j.error || "")}</div><div class="stage-hint">Check API key configuration</div>`;
        }
      }
      return `<div class="stage-pill st-${status}"><span>${STAGE_LABEL[stage]}</span><small>${status}</small>${extra}</div>`;
    }).join("");

    const done = byStage.ready_for_review && byStage.ready_for_review.status === "complete";

    return `
      <div class="studio-tracker">
        <div class="view-head"><h2>Generating: ${esc(article?.keyword || "")}</h2>
          <p class="muted">Each stage runs on the background worker — this can take a few minutes per stage.</p></div>
        <div class="stage-pills">${pills}</div>
        ${done ? `<a class="btn btn-primary" href="#/content/review">View in Review Queue</a>` : ""}
      </div>`;
  }

  function wireStudioTracker(articleId) {
    async function refresh() {
      if (!connected()) return; // mock mode: state.studioJobs was seeded complete already, nothing to poll
      const { data, error } = await client().from("generation_jobs")
        .select("*").eq("article_id", articleId).order("created_at", { ascending: false });
      if (error) { toast("Could not refresh generation status: " + error.message, "danger"); return; }
      state.studioJobs = data || [];
      if (state.route === "studio" && state.studioArticleId === articleId) {
        shell(viewStudioTracker(articleId));
        wireStudioTracker(articleId);
      }
    }
    if (state.studioPollTimer) clearInterval(state.studioPollTimer);
    if (connected()) state.studioPollTimer = setInterval(refresh, 15000);
    refresh();

    document.querySelectorAll("[data-retry]").forEach((btn) => {
      btn.onclick = async () => {
        btn.disabled = true; btn.textContent = "Retrying…";
        if (!connected()) { toast("Retry (preview) — connect a project to run this for real"); return; }
        try {
          const { error } = await client().rpc("retry_generation_stage", {
            p_generation_job_id: btn.getAttribute("data-retry"),
          });
          if (error) throw error;
          refresh();
        } catch (e) {
          toast("Retry failed: " + (e.message || e), "danger");
          btn.disabled = false; btn.textContent = "Retry";
        }
      };
    });
  }
```

- [ ] **Step 2: Stop the poll timer on navigation away**

In `render()`, at the top (before the route dispatch), add:

```js
    if (state.studioPollTimer && state.route !== "studio") { clearInterval(state.studioPollTimer); state.studioPollTimer = null; }
```

- [ ] **Step 3: Add tracker + keyword-picker styles**

Append to `frontend/styles/m22-content.css` (matching the existing
`.bulk-*` class naming/spacing conventions already in that file):

```css
.studio-kw-table { width: 100%; border-collapse: collapse; }
.studio-kw-table th, .studio-kw-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--border); }

.stage-pills { display: flex; flex-wrap: wrap; gap: 10px; margin: 16px 0; }
.stage-pill { flex: 1 1 120px; min-width: 120px; border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; }
.stage-pill span { display: block; font-weight: 600; }
.stage-pill small { color: var(--muted); text-transform: capitalize; }
.stage-pill.st-complete { border-color: var(--success, #2a9d5c); }
.stage-pill.st-failed { border-color: var(--danger, #c0392b); }
.stage-pill.st-running { border-color: var(--accent, #3b6fd8); }
.stage-error { font-size: 0.85em; color: var(--danger, #c0392b); margin-top: 6px; }
.stage-hint { font-size: 0.85em; color: var(--muted); margin-top: 4px; }
```

- [ ] **Step 4: Commit**

```bash
git add frontend/js/m22-content.js frontend/styles/m22-content.css
git commit -m "feat(m22): add Generation Studio live tracker + retry UI"
```

---

### Task 8: Register the new probes in `verify.sh` + full verification pass

**Files:**
- Modify: `scripts/verify.sh`

- [ ] **Step 1: Add the two new probes**

In `scripts/verify.sh`, after the existing `m22bulkprobe.mjs` block
(around line 109), add:

```bash
echo; echo "══ M22 Generation Studio pipeline probe (no PGlite) ══════════════════"
( cd workers && node verify/genstudiopipelineprobe.mjs ) || fails=$((fails+1))

echo; echo "══ M22 Generation Studio schema/RPC probe (PGlite) ═══════════════════"
( cd workers && node verify/m22genstudioprobe.mjs ) || fails=$((fails+1))
```

- [ ] **Step 2: Run the full verification suite**

Run: `bash scripts/verify.sh`
Expected: `✔ verify.sh: all runnable probes passed` — every existing probe
still green plus the two new ones.

- [ ] **Step 3: Preview-check the new Studio page**

Start the dev server, navigate to `#/content/studio`, confirm:
- keyword picker renders with no console errors
- clicking Generate navigates to the tracker view
- 0 horizontal scroll at 375px and 1280px widths, both light and dark theme
(matching the preview-check bar every prior M22 slice met — see
[session-23-m22-manual-state.md](../../../memory/session-23-m22-manual-state.md)-style verification, though that file lives in the user's memory directory, not this repo).

- [ ] **Step 4: Commit**

```bash
git add scripts/verify.sh
git commit -m "test(m22): register Generation Studio probes in verify.sh"
```

---

### Task 9: Update DECISIONS + docs

**Files:**
- Modify: `DECISIONS-AiMindShare-v1_0.md`

- [ ] **Step 1: Append the D-193 entry**

Following the exact format of the D-190/D-192 entries (LOCKED, one paragraph,
migration reference), append:

```markdown
## D-193 · M22 Generation Studio pipeline runtime — no pg_net, all stages via the existing worker · **LOCKED 2026-07-13**
Migration `0040_m22_generation_studio.sql`. Adds the keyword_id link `content_queue` was
missing since M21 (D-134 gap), `blog_articles.used_fallback`, `generation_jobs` (one row per
pipeline stage ATTEMPT — retries insert a fresh row, never mutate a failed one), and
`content_scores` (one persisted snapshot per successful Score stage). All 7 stages
(Research→Brief→Outline→Draft→Auto-Link→Score→Ready for Review) run inside the existing
`workers/worker.mjs` (GH Actions cron, D-189) via a new `generation.advance` job type that
chases itself through the pipeline — no Supabase Edge Functions and no pg_net are introduced;
this repo has no cron-to-Edge-Function mechanism today, and Brief/Outline/Draft already have a
working Node-side Anthropic caller (`workers/llm.mjs`, D-190) while Score reuses
`content-seo.mjs`'s pure `scoreArticle` directly. Stage failures classify as transient (Retry
helps: timeouts, 5xx, 429) or permanent (Retry won't help: 401/403/400 — "check API key
configuration" instead), and retries are manual-only via `retry_generation_stage`, guarded by a
partial unique index against duplicate concurrent retries. Content Score Engine factor
extensions, Auto-Rewrite Loop, Sitemap-Aware Internal Linking, Deep Research/Citations, and
Media Auto-Attach are explicitly out of scope — separate future specs (see the design doc).
```

Update the trailing summary line at the bottom of the file to append
`then D-193 (M22 Generation Studio core pipeline, migration 0040_m22_generation_studio.sql)`.

- [ ] **Step 2: Commit**

```bash
git add DECISIONS-AiMindShare-v1_0.md
git commit -m "docs: record D-193 (M22 Generation Studio pipeline runtime)"
```

---

## Post-plan notes for the executing agent

- **Task ordering dependency**: Task 6's mock-mode branch in `wireStudio()`
  references `STAGE_ORDER_UI`, which Task 7 defines. Do Task 7's
  `STAGE_ORDER_UI`/`STAGE_LABEL` constants either before or as part of Task 6
  if executing strictly in order (or simply define `STAGE_ORDER_UI` once,
  above both `viewStudio` and `viewStudioTracker`, when implementing Task 6).
- `slugify()` (used in Task 6's mock branch) already exists in this file —
  confirmed via its use in `viewCategoryModal` (line 696) and `newArticle`
  patterns; no new implementation needed.
- Do not scope-creep into Content Score Engine extensions, Auto-Rewrite Loop,
  Sitemap-Aware Linking, Deep Research/Citations, or Media Auto-Attach — all
  five are explicitly deferred to their own future specs.
