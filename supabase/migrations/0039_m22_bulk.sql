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

-- enforce_review_lock (revised) — the review_required check alone was bypassable: a
-- staff-tier UPDATE could change site_id to point at a different, non-islamic site
-- WHILE ALSO setting review_required=false in the same statement, since the check
-- reads NEW.site_id (post-change). That left the islamic site's row missing entirely,
-- and worker.mjs treats a missing row as reviewRequired=false — silently unlocking
-- auto-publish for exactly the sites D-191 exists to protect. Fix: site_id is made
-- immutable on this table (checked independently of the review_required check).
create or replace function public.enforce_review_lock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'UPDATE' and OLD.site_id is distinct from NEW.site_id then
    raise exception 'site_id is immutable on site_brand_voice';
  end if;
  if new.review_required = false and exists (
    select 1 from public.sites where id = new.site_id and style_preset = 'islamic'
  ) then
    raise exception 'review_required cannot be disabled for an islamic-preset site';
  end if;
  return new;
end $$;

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
alter table public.content_queue add column if not exists is_duplicate boolean not null default false;
create index if not exists content_queue_batch_idx on public.content_queue (batch_job_id, status);

-- ── Part D — batch RPCs (D-192) ─────────────────────────────────────────────────
-- Supports the per-topic duplicate-keyword lookup commit_batch_job does below
-- (filtered scan on site_id + lower(trim(keyword)) without these would be a seq scan).
create index if not exists blog_articles_site_keyword_idx on public.blog_articles (site_id, lower(trim(keyword)));
create index if not exists content_queue_site_keyword_idx on public.content_queue (site_id, lower(trim(keyword)));

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

create or replace function public.generate_batch_preview(p_batch uuid, p_n int default 3)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b record; v_topic jsonb; v_idx int := 0; v_qid uuid; v_ids uuid[] := '{}';
begin
  select * into b from public.content_batch_jobs where id = p_batch for update;
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

create or replace function public.commit_batch_job(p_batch uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b record; v_topic jsonb; v_kw text; v_qid uuid; v_inserted int := 0; v_flagged int := 0; v_is_dup boolean;
begin
  select * into b from public.content_batch_jobs where id = p_batch for update;
  if not found then raise exception 'batch job not found'; end if;
  if not public.has_role(b.workspace_id,'staff') then raise exception 'forbidden: staff+ required'; end if;
  if b.status not in ('draft','previewing') then raise exception 'batch job already committed'; end if;

  for v_topic in
    select value from jsonb_array_elements(b.topics) with ordinality as t(value, idx) where idx > b.preview_count
  loop
    v_kw := lower(trim(v_topic->>'keyword'));

    -- Duplicate check runs BEFORE the insert below, so the row being committed can
    -- never match itself — no id<>self exclusion needed. It still covers ALL other
    -- content_queue rows for the site regardless of batch (including earlier rows
    -- from THIS batch, fixing the same-batch dedup gap), because each iteration's
    -- insert has already landed by the time the next iteration's check runs.
    v_is_dup :=
      exists (select 1 from public.blog_articles where site_id = b.site_id and lower(trim(keyword)) = v_kw)
      or exists (select 1 from public.content_queue where site_id = b.site_id and lower(trim(keyword)) = v_kw);

    insert into public.content_queue
      (workspace_id, site_id, keyword, status, source, batch_job_id, template_id, variables, is_duplicate)
    values
      (b.workspace_id, b.site_id, v_topic->>'keyword', 'queued', 'bulk-' || b.topic_source,
       b.id, b.template_id, coalesce(v_topic->'variables','{}'::jsonb), v_is_dup)
    returning id into v_qid;
    v_inserted := v_inserted + 1;

    if v_is_dup then
      v_flagged := v_flagged + 1;
    end if;
  end loop;

  update public.content_batch_jobs set status = 'queued' where id = b.id;
  return jsonb_build_object('inserted', v_inserted, 'duplicate_flagged', v_flagged);
end $$;
revoke all on function public.commit_batch_job(uuid) from public;
grant execute on function public.commit_batch_job(uuid) to authenticated, service_role;

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
    v_slot_time := p_start + (v_day || ' days')::interval
      + (((v_idx % greatest(p_per_day,1)) * (24.0 / greatest(p_per_day,1))) || ' hours')::interval;
    update public.blog_articles set status = 'scheduled', scheduled_at = v_slot_time where id = a.id;
    v_idx := v_idx + 1; v_count := v_count + 1;
  end loop;

  -- Fix (code review, D-192): only finalize the batch once every content_queue row
  -- has left the 'queued' state. A large batch drip-feeds through the bulk lane over
  -- many ticks, so scheduling the currently in_review wave must not strand whatever
  -- is still queued behind it — that content_batch_jobs row has to stay 'running'/
  -- 'queued' so advance_content_pipeline() keeps draining it, and a manager can call
  -- this again later for the next wave.
  if not exists (
    select 1 from public.content_queue where batch_job_id = p_batch and status = 'queued'
  ) then
    update public.content_batch_jobs set status = 'completed' where id = b.id;
  end if;
  return v_count;
end $$;
revoke all on function public.schedule_batch_publish_spread(uuid,timestamptz,int,int) from public;
grant execute on function public.schedule_batch_publish_spread(uuid,timestamptz,int,int) to authenticated, service_role;

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
    elsif not exists (
      select 1 from public.content_queue where batch_job_id = b.id and status = 'queued'
    ) then
      -- Companion fix (code review, D-192): a batch that was already 'running' and has
      -- now drained to zero queued items auto-completes here, even if a manager never
      -- calls schedule_batch_publish_spread (e.g. all items end up rejected/failed
      -- rather than scheduled). The `elsif` guards this from firing on the SAME tick a
      -- batch just flipped to 'running' above.
      update public.content_batch_jobs set status = 'completed' where id = b.id;
    end if;
  end loop;

  return n;
end $$;
revoke all on function public.advance_content_pipeline() from public;
grant execute on function public.advance_content_pipeline() to service_role;
