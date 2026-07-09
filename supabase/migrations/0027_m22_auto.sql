-- ═══════════════════════════════════════════════════════════════════════════
-- 0027_m22_auto.sql — M22 Auto-Blog Pipeline · SCAFFOLD slice (Session 23)
-- The AI auto-blog half of M22: per-site publishing SCHEDULES, the content_queue
-- extended into a real pipeline (site/schedule/article links, per-step tracking,
-- widened status), the worker-facing RPCs the blog.generate handler drives, and the
-- m22-content-scheduler cron that paces generation. Built VERTICALLY on the locked
-- stack (vanilla + Supabase) — NOT the PRD's Prisma/BullMQ/SerpApi/GPT-4o wiring.
--
-- SCAFFOLD POSTURE (D-147, same as D-063 M13-AI / D-092 M16-AI): real GPT prose and
-- DALL·E/M35 featured images are the two OPEN provider gaps. This slice builds every
-- seam to full contract and flags the gaps — the pipeline turns a keyword into a
-- SCORED, internally-linked, JSON-LD blog_articles DRAFT via the deterministic
-- frontend/js/blog-pipeline.mjs placeholder generator. NOTHING is metered until a
-- provider is wired (Gate 3 = no billable action).
--
-- Reconciled in DECISIONS this session:
--   · Scaffold  → no provider / no meter; every generated draft is a labelled
--     (D-147)     placeholder (blog-pipeline.mjs emits the PLACEHOLDER comment).
--   · Queue ext → content_queue is M21's base (D-134); we EXTEND it here via
--     (D-148)     `alter … add column if not exists` + a widened status check —
--                 migration 0026 is NEVER edited.
--   · Cluster   → cluster_slug / pillar_slug carried on blog_articles so internal
--     (D-149)     linking can query by cluster; clustering itself is JS (blog-
--                 pipeline.mjs compute_topic_cluster), not SQL.
--   · Scheduler → the cron ENQUEUES blog.generate jobs for existing queued
--     (D-150)     content_queue rows (up to max_posts_per_run per due schedule),
--                 idempotent per row — it paces generation, it does NOT invent
--                 keywords (those arrive via M21 send_to_content_queue / bulk CSV /
--                 manual). Kin of D-127 (cron-enqueues, worker does heavy work).
--   · Gate      → the worker quality-gates seo/readability vs the schedule
--     (D-151)     thresholds; pass+auto_publish → publish_article, otherwise the
--                 draft is routed to the M22-manual review queue (in_review).
--   · Image     → featured images defer to M35 Creative Studio (D-152); the worker
--     (D-152)     leaves featured_image_url null and never calls the image stub.
--   · Perms     → operator-ceiling RLS (mirror 0025/D-114): SELECT/INSERT/UPDATE =
--                 staff+, DELETE = manager+. Worker RPCs are SECURITY DEFINER,
--                 service-role only; enqueue/upsert are authenticated+service_role.
--
-- Migration numbered 0027 (0026=M21 is the latest; 0027 free).
--
-- PGlite-safety: the probe strips `create extension`; there is no pgvector column
-- here. Cron is guarded (PGlite lacks pg_cron). Every new tenant table enables RLS
-- in THIS file (DoD Gate-8 Law 2).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. content_schedules — per-site auto-blog cadence + quality thresholds ─────
create table if not exists public.content_schedules (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.workspaces(id) on delete cascade,
  site_id              uuid references public.sites(id) on delete cascade,
  schedule_name        text,
  frequency            text not null default 'weekly' check (frequency in ('daily','weekly','custom')),
  days_of_week         int[] not null default '{1,3,5}',   -- 0=Sun … 6=Sat (custom cadence)
  hour_of_day          int  not null default 6,
  brand_voice          text,
  niche                text,
  target_word_count    int  not null default 1200,
  auto_publish         boolean not null default false,
  min_seo_score        int  not null default 70,
  min_readability_score int not null default 50,
  max_posts_per_run    int  not null default 3,
  active               boolean not null default true,
  last_run_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz,
  unique (site_id)
);
create index if not exists content_schedules_ws_idx     on public.content_schedules (workspace_id);
create index if not exists content_schedules_active_idx on public.content_schedules (active, last_run_at);

alter table public.content_schedules enable row level security;
create policy content_schedules_sel on public.content_schedules for select using ( public.has_role(workspace_id,'staff') );
create policy content_schedules_ins on public.content_schedules for insert with check ( public.has_role(workspace_id,'staff') );
create policy content_schedules_upd on public.content_schedules for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy content_schedules_del on public.content_schedules for delete using ( public.has_role(workspace_id,'manager') );
create trigger content_schedules_set_updated_at before update on public.content_schedules for each row execute function public.set_updated_at();

-- ── 2. Extend content_queue (M21's base, D-134) — NEVER edit 0026 ──────────────
alter table public.content_queue add column if not exists site_id     uuid references public.sites(id) on delete cascade;
alter table public.content_queue add column if not exists schedule_id uuid references public.content_schedules(id) on delete set null;
alter table public.content_queue add column if not exists article_id  uuid references public.blog_articles(id) on delete set null;
alter table public.content_queue add column if not exists fail_reason text;
alter table public.content_queue add column if not exists attempts    int not null default 0;
alter table public.content_queue add column if not exists step        text;  -- brief|draft|seo_scored|internal_links|review|published (free text, NOT status)
-- Widen the status check to the pipeline states (keep M21's originals). status ∈
-- queued/in_progress/done/failed/skipped; the STEP tracks the pipeline stage.
alter table public.content_queue drop constraint if exists content_queue_status_check;
alter table public.content_queue add constraint content_queue_status_check
  check (status in ('queued','in_progress','done','failed','skipped'));
create index if not exists content_queue_site_idx  on public.content_queue (site_id, status);

-- ── 3. blog_articles cluster columns (query internal links by cluster, D-149) ──
alter table public.blog_articles add column if not exists cluster_slug text;
alter table public.blog_articles add column if not exists pillar_slug  text;
create index if not exists blog_articles_cluster_idx on public.blog_articles (site_id, cluster_slug);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. upsert_content_schedule — staff+ create/update a per-site schedule. Returns
--    the schedule id. One schedule per site (unique(site_id)) → upsert on conflict.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.upsert_content_schedule(
  p_ws uuid, p_site uuid, p_name text default null,
  p_frequency text default 'weekly', p_days int[] default '{1,3,5}', p_hour int default 6,
  p_brand_voice text default null, p_niche text default null, p_target_words int default 1200,
  p_auto_publish boolean default false, p_min_seo int default 70, p_min_read int default 50,
  p_max_posts int default 3, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_role(p_ws,'staff') then raise exception 'forbidden: staff+ required'; end if;
  insert into public.content_schedules
    (workspace_id, site_id, schedule_name, frequency, days_of_week, hour_of_day, brand_voice,
     niche, target_word_count, auto_publish, min_seo_score, min_readability_score, max_posts_per_run, active)
  values
    (p_ws, p_site, p_name, p_frequency, coalesce(p_days,'{1,3,5}'), p_hour, p_brand_voice,
     p_niche, p_target_words, p_auto_publish, p_min_seo, p_min_read, p_max_posts, p_active)
  on conflict (site_id) do update set
    schedule_name = excluded.schedule_name, frequency = excluded.frequency,
    days_of_week = excluded.days_of_week, hour_of_day = excluded.hour_of_day,
    brand_voice = excluded.brand_voice, niche = excluded.niche,
    target_word_count = excluded.target_word_count, auto_publish = excluded.auto_publish,
    min_seo_score = excluded.min_seo_score, min_readability_score = excluded.min_readability_score,
    max_posts_per_run = excluded.max_posts_per_run, active = excluded.active
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.upsert_content_schedule(uuid,uuid,text,text,int[],int,text,text,int,boolean,int,int,int,boolean) from public;
grant execute on function public.upsert_content_schedule(uuid,uuid,text,text,int[],int,text,text,int,boolean,int,int,int,boolean) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. enqueue_content_generation — staff+ enqueue ONE blog.generate job for a
--    queued content_queue row. Idempotent (idempotency_key 'bloggen-<queue_id>').
--    The browser calls THIS instead of writing public.jobs directly. Returns the
--    job id (or the existing one on idempotent re-call).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.enqueue_content_generation(p_queue_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare q record; v_job uuid;
begin
  select id, workspace_id, status into q from public.content_queue where id = p_queue_id;
  if not found then raise exception 'content_queue row not found'; end if;
  if not public.has_role(q.workspace_id,'staff') then raise exception 'forbidden: staff+ required'; end if;

  insert into public.jobs (workspace_id, type, payload, status, idempotency_key)
  values (q.workspace_id, 'blog.generate',
          jsonb_build_object('content_queue_id', q.id, 'workspace_id', q.workspace_id),
          'queued', 'bloggen-' || q.id)
  on conflict (workspace_id, type, idempotency_key) where idempotency_key is not null
  do nothing
  returning id into v_job;

  if v_job is null then
    select id into v_job from public.jobs
     where workspace_id = q.workspace_id and type = 'blog.generate'
       and idempotency_key = 'bloggen-' || q.id;
  end if;
  return v_job;
end $$;
revoke all on function public.enqueue_content_generation(uuid) from public;
grant execute on function public.enqueue_content_generation(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Worker-facing RPCs (SECURITY DEFINER, service_role only — the worker runs
--    under the service-role key, no auth context → no role check inside).
-- ═══════════════════════════════════════════════════════════════════════════

-- claim_content_item — atomically claim a queued row → in_progress, step='brief'.
-- Returns the row (or NULL if already claimed / gone) so the worker can proceed.
create or replace function public.claim_content_item(p_id uuid)
returns public.content_queue language plpgsql security definer set search_path = public as $$
declare r public.content_queue;
begin
  update public.content_queue
     set status = 'in_progress', step = 'brief', attempts = attempts + 1
   where id = p_id and status in ('queued','in_progress')
   returning * into r;
  return r;   -- NULL row if not claimable
end $$;
revoke all on function public.claim_content_item(uuid) from public;
grant execute on function public.claim_content_item(uuid) to service_role;

-- complete_content_item — link the article + set the terminal step/status. The
-- pipeline only ever COMPLETES with status='done'; the step distinguishes the
-- outcome ('published' vs 'review'). fail_reason carries BELOW_THRESHOLD when a
-- passing-quality gate could not be met.
create or replace function public.complete_content_item(
  p_id uuid, p_article uuid, p_step text default 'review', p_fail_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.content_queue
     set status = 'done', step = p_step, article_id = p_article, fail_reason = p_fail_reason
   where id = p_id;
end $$;
revoke all on function public.complete_content_item(uuid,uuid,text,text) from public;
grant execute on function public.complete_content_item(uuid,uuid,text,text) to service_role;

-- fail_content_item — mark the row failed with a reason (worker retry still applies
-- at the jobs layer; this records the last failure for observability).
create or replace function public.fail_content_item(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.content_queue set status = 'failed', fail_reason = p_reason where id = p_id;
end $$;
revoke all on function public.fail_content_item(uuid,text) from public;
grant execute on function public.fail_content_item(uuid,text) to service_role;

-- create_generated_article — insert the blog_articles DRAFT the pipeline produced
-- (title/slug/content_html/excerpt/meta/tags/schema/seo_score/readability/word_count
-- + cluster_slug/pillar_slug). p_payload is the pipeline output JSON. Returns the
-- new article id. Slug is de-duplicated per site (append -<n> on collision).
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
    cluster_slug, pillar_slug, status)
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
    'draft')
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.create_generated_article(uuid,uuid,uuid,jsonb) from public;
grant execute on function public.create_generated_article(uuid,uuid,uuid,jsonb) to service_role;

-- The auto-publish path runs under the worker's service role (no auth.uid() → the
-- manager-gated publish_article would fail). Grant the M22-manual INTERNAL publish
-- side-effect (_m22_publish, no role check — the same fn publish_due_articles uses)
-- to service_role so the worker can publish a passing auto_publish=true draft. The
-- role gate stays on publish_article for browser callers (D-151).
grant execute on function public._m22_publish(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. advance_content_pipeline — the m22-content-scheduler cron body (service-role;
--    no auth context → no role check; a system sweep like M20/M28). For each ACTIVE
--    schedule that is DUE (last_run_at null, or older than its cadence), enqueue up
--    to max_posts_per_run blog.generate jobs for that site's QUEUED content_queue
--    rows — idempotent per row (idempotency_key 'bloggen-<queue_id>') — and stamp
--    last_run_at = now(). Keyword SEEDING is NOT done here (that is M21
--    send_to_content_queue / bulk CSV / manual). Returns the count enqueued.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.advance_content_pipeline()
returns int language plpgsql security definer set search_path = public as $$
declare s record; q record; n int := 0; v_cadence interval;
begin
  for s in select * from public.content_schedules where active and site_id is not null loop
    v_cadence := case s.frequency
                   when 'daily'  then interval '1 day'
                   when 'weekly' then interval '7 days'
                   else interval '1 day'   -- 'custom' → paced daily; day-of-week gating is UI-side
                 end;
    if s.last_run_at is not null and s.last_run_at > now() - v_cadence then
      continue;   -- not due yet
    end if;

    for q in
      select id from public.content_queue
       where site_id = s.site_id and workspace_id = s.workspace_id and status = 'queued'
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
  return n;
end $$;
revoke all on function public.advance_content_pipeline() from public;
grant execute on function public.advance_content_pipeline() to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. pg_cron — m22-content-scheduler daily at 06:00 (D-150). Registered in
--    JOBS-AND-WORKERS-SPEC §5. Guarded for PGlite (no pg_cron there).
-- ═══════════════════════════════════════════════════════════════════════════
do $$ begin
  perform cron.schedule('m22-content-scheduler', '0 6 * * *',
    $cron$ select public.advance_content_pipeline(); $cron$);
exception when others then
  raise notice 'pg_cron unavailable — m22-content-scheduler not scheduled (%).', sqlerrm;
end $$;

-- ── Realtime: the pipeline board watches content_queue live (guarded for PGlite) ─
do $$ begin
  alter publication supabase_realtime add table public.content_queue;
exception when others then null; end $$;
