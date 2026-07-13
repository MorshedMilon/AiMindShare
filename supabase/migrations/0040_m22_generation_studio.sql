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
