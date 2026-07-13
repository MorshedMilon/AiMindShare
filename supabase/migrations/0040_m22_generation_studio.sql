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
