-- 0026_m21_seo.sql · M21 SEO Engine
-- Semrush-lite: keyword research · SERP · competitor gap · rank tracking · technical audits.
-- Operator-ceiling RLS (D-130): SEO is operator data, no client surface — SELECT = has_role(staff);
-- worker-written tables (keyword_rankings, seo_audit_issues) have no client write policy (service role).
-- Decisions D-128…D-135. Migration 0026 (next free above 0025=M22; 0012 gap is the M05 renumber).
-- Deps: 0000 (enums/pgcrypto), 0001 (tenancy: is_member/has_role/set_updated_at), 0002 (jobs),
--       0009 (M03 meter_kind 'seo_calls'), 0016 (M13 emit_trigger). Content queue: M22 deferred it to
--       S23 (their D-122) — M21 creates the forward-stub S23 adopts (D-134).
--
-- pg_cron: 2 entries (rank-check daily, rank-report weekly), guarded for PGlite (swallow).

-- ════════════════════════════════════════════════════════════════════════════════
-- 1 · keyword_lists — named collections (staff+ read/edit · manager+ delete)
-- ════════════════════════════════════════════════════════════════════════════════
create table if not exists public.keyword_lists (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  description  text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists keyword_lists_ws_idx on public.keyword_lists(workspace_id);
alter table public.keyword_lists enable row level security;
create policy sel on public.keyword_lists for select using ( public.has_role(workspace_id,'staff') );
create policy ins on public.keyword_lists for insert with check ( public.has_role(workspace_id,'staff') );
create policy upd on public.keyword_lists for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy del on public.keyword_lists for delete using ( public.has_role(workspace_id,'manager') );
create trigger set_updated_at before update on public.keyword_lists for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════════
-- 2 · keywords — researched keyword rows (belong to a list or loose)
-- ════════════════════════════════════════════════════════════════════════════════
create table if not exists public.keywords (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  list_id       uuid references public.keyword_lists(id) on delete cascade,
  keyword       text not null,
  volume        int,
  cpc           numeric(10,2),
  difficulty    int check (difficulty between 0 and 100),
  intent        text check (intent in ('informational','commercial','transactional','navigational')),
  serp_features jsonb not null default '[]',
  created_at    timestamptz not null default now()
);
create index if not exists keywords_ws_idx   on public.keywords(workspace_id);
create index if not exists keywords_list_idx on public.keywords(list_id);
alter table public.keywords enable row level security;
create policy sel on public.keywords for select using ( public.has_role(workspace_id,'staff') );
create policy ins on public.keywords for insert with check ( public.has_role(workspace_id,'staff') );
create policy upd on public.keywords for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy del on public.keywords for delete using ( public.has_role(workspace_id,'manager') );

-- ════════════════════════════════════════════════════════════════════════════════
-- 3 · seo_keyword_cache — workspace-scoped 30-day provider cache (D-129).
--     member read; service-role write only (the Vault-holding Edge Fn populates it).
-- ════════════════════════════════════════════════════════════════════════════════
create table if not exists public.seo_keyword_cache (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  keyword      text not null,
  country      text not null default 'us',
  data         jsonb not null,
  cached_at    timestamptz not null default now(),
  unique (workspace_id, keyword, country)
);
create index if not exists seo_keyword_cache_ws_idx on public.seo_keyword_cache(workspace_id);
alter table public.seo_keyword_cache enable row level security;
create policy sel on public.seo_keyword_cache for select using ( public.is_member(workspace_id) );
-- no insert/update/delete policy: service-role only.

-- ════════════════════════════════════════════════════════════════════════════════
-- 4 · tracked_keywords — daily rank tracker targets (own domain + competitors)
-- ════════════════════════════════════════════════════════════════════════════════
create table if not exists public.tracked_keywords (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  list_id            uuid references public.keyword_lists(id) on delete set null,
  keyword            text not null,
  domain             text not null,
  country            text not null default 'us',
  competitor_domains text[] not null default '{}',
  is_active          boolean not null default true,
  last_checked_at    timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists tracked_keywords_ws_idx on public.tracked_keywords(workspace_id);
alter table public.tracked_keywords enable row level security;
create policy sel on public.tracked_keywords for select using ( public.has_role(workspace_id,'staff') );
create policy ins on public.tracked_keywords for insert with check ( public.has_role(workspace_id,'staff') );
create policy upd on public.tracked_keywords for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy del on public.tracked_keywords for delete using ( public.has_role(workspace_id,'manager') );

-- ════════════════════════════════════════════════════════════════════════════════
-- 5 · keyword_rankings — daily position snapshots (service-role/worker write only)
-- ════════════════════════════════════════════════════════════════════════════════
create table if not exists public.keyword_rankings (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  tracked_keyword_id  uuid not null references public.tracked_keywords(id) on delete cascade,
  position            int,
  url                 text,
  is_featured_snippet boolean not null default false,
  competitor_positions jsonb not null default '{}',
  checked_on          date not null default current_date,
  created_at          timestamptz not null default now()
);
create index if not exists keyword_rankings_ws_idx on public.keyword_rankings(workspace_id);
create index if not exists keyword_rankings_tk_idx on public.keyword_rankings(tracked_keyword_id, checked_on);
alter table public.keyword_rankings enable row level security;
create policy sel on public.keyword_rankings for select using ( public.has_role(workspace_id,'staff') );
-- no client write policy: worker/service-role writes rankings (Gate-4).

-- ════════════════════════════════════════════════════════════════════════════════
-- 6 · seo_audits — technical audit runs (staff creates pending; worker advances)
-- ════════════════════════════════════════════════════════════════════════════════
create table if not exists public.seo_audits (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  domain        text not null,
  status        text not null default 'pending' check (status in ('pending','queued','running','done','failed')),
  results       jsonb not null default '{}',   -- {cwv, ssl, schema, summary}
  score         int check (score between 0 and 100),
  pages_crawled int not null default 0,
  cursor        jsonb not null default '{}',   -- {frontier:[], visited:[], robots} — resume state (D-131)
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists seo_audits_ws_idx on public.seo_audits(workspace_id);
alter table public.seo_audits enable row level security;
create policy sel on public.seo_audits for select using ( public.has_role(workspace_id,'staff') );
-- staff insert but pending/queued only (mirrors jobs queued-only; worker owns running/done/failed).
create policy ins on public.seo_audits for insert with check ( public.has_role(workspace_id,'staff') and status in ('pending','queued') );
create policy del on public.seo_audits for delete using ( public.has_role(workspace_id,'manager') );
-- no client UPDATE policy: the worker advances status/results/cursor under service role.
create trigger set_updated_at before update on public.seo_audits for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════════
-- 7 · seo_audit_issues — per-audit findings (service-role/worker write only)
-- ════════════════════════════════════════════════════════════════════════════════
create table if not exists public.seo_audit_issues (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  audit_id     uuid not null references public.seo_audits(id) on delete cascade,
  type         text not null,   -- broken_link|missing_title|dup_title|missing_h1|missing_meta|redirect_chain|large_image|...
  severity     text not null check (severity in ('critical','warning','notice')),
  url          text,
  detail       text,
  created_at   timestamptz not null default now()
);
create index if not exists seo_audit_issues_ws_idx    on public.seo_audit_issues(workspace_id);
create index if not exists seo_audit_issues_audit_idx on public.seo_audit_issues(audit_id);
alter table public.seo_audit_issues enable row level security;
create policy sel on public.seo_audit_issues for select using ( public.has_role(workspace_id,'staff') );
-- no client write policy: worker writes issues (Gate-4).

-- ════════════════════════════════════════════════════════════════════════════════
-- 8 · content_queue — M22 forward-stub (D-134). M22 deferred it to S23; M21 owns the
--     "Send to Content Queue" seam now. RLS-on, M22 §13 shape so S23 adopts as-is.
-- ════════════════════════════════════════════════════════════════════════════════
create table if not exists public.content_queue (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  keyword      text not null,
  priority     int not null default 3,
  status       text not null default 'queued' check (status in ('queued','in_progress','done','skipped')),
  article_id   uuid,
  source       text,
  created_at   timestamptz not null default now()
);
create index if not exists content_queue_ws_idx on public.content_queue(workspace_id);
alter table public.content_queue enable row level security;
create policy sel on public.content_queue for select using ( public.has_role(workspace_id,'staff') );
create policy ins on public.content_queue for insert with check ( public.has_role(workspace_id,'staff') and status = 'queued' );
create policy del on public.content_queue for delete using ( public.has_role(workspace_id,'manager') );

-- ════════════════════════════════════════════════════════════════════════════════
-- Server-truth functions (SECURITY DEFINER)
-- ════════════════════════════════════════════════════════════════════════════════

-- 30-day keyword cache read/write — service-role only (Edge Fn checks before spending a call).
create or replace function public.seo_cache_get(p_ws uuid, p_keyword text, p_country text default 'us')
returns jsonb language sql security definer set search_path = public as $$
  select data from public.seo_keyword_cache
   where workspace_id = p_ws and keyword = p_keyword and country = p_country
     and cached_at > now() - interval '30 days';
$$;

create or replace function public.seo_cache_put(p_ws uuid, p_keyword text, p_country text, p_data jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.seo_keyword_cache(workspace_id, keyword, country, data, cached_at)
  values (p_ws, p_keyword, p_country, p_data, now())
  on conflict (workspace_id, keyword, country) do update
    set data = excluded.data, cached_at = now();
$$;

-- Send-to-content-queue seam (staff+; no secret so no Edge Fn). Idempotent per (ws, keyword, queued).
create or replace function public.send_to_content_queue(p_ws uuid, p_keywords text[])
returns int language plpgsql security definer set search_path = public as $$
declare v_added int := 0; k text;
begin
  if not public.has_role(p_ws,'staff') then raise exception 'forbidden'; end if;
  foreach k in array coalesce(p_keywords, '{}') loop
    insert into public.content_queue(workspace_id, keyword, source, status)
    select p_ws, k, 'seo', 'queued'
    where not exists (
      select 1 from public.content_queue
       where workspace_id = p_ws and keyword = k and status = 'queued');
    if found then v_added := v_added + 1; end if;
  end loop;
  return v_added;
end $$;

-- Append a ranking snapshot; compute delta vs last; on |Δ| >= 5 best-effort M13 emit (D-133).
create or replace function public.record_keyword_ranking(
  p_ws uuid, p_tk uuid, p_position int, p_url text,
  p_featured boolean default false, p_competitors jsonb default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_prev int; v_id uuid; v_kw text;
begin
  select position into v_prev from public.keyword_rankings
    where tracked_keyword_id = p_tk order by checked_on desc, created_at desc limit 1;
  insert into public.keyword_rankings(workspace_id, tracked_keyword_id, position, url, is_featured_snippet, competitor_positions)
    values (p_ws, p_tk, p_position, p_url, p_featured, coalesce(p_competitors, '{}'))
    returning id into v_id;
  update public.tracked_keywords set last_checked_at = now() where id = p_tk;
  if v_prev is not null and abs(coalesce(p_position, 0) - v_prev) >= 5 then
    select keyword into v_kw from public.tracked_keywords where id = p_tk;
    begin
      perform public.emit_trigger(p_ws, 'rank.change_major',
        jsonb_build_object('tracked_keyword_id', p_tk, 'keyword', v_kw, 'from', v_prev, 'to', p_position));
    exception when others then null;   -- M13 optional in some contexts; never block the write.
    end;
  end if;
  return v_id;
end $$;

-- 90-day ranking series for the Chart.js modal (operator ceiling enforced in the WHERE).
create or replace function public.rank_history(p_tk uuid, p_days int default 90)
returns table(checked_on date, "position" int, is_featured_snippet boolean)
language sql security definer set search_path = public as $$
  select checked_on, position, is_featured_snippet
    from public.keyword_rankings
   where tracked_keyword_id = p_tk
     and checked_on >= current_date - (p_days || ' days')::interval
     and public.has_role((select workspace_id from public.tracked_keywords where id = p_tk), 'staff')
   order by checked_on;
$$;

-- Deterministic 0–100 audit score from issue counts × severity weights (worker folds CWV into results).
create or replace function public.audit_score(p_audit uuid)
returns int language sql security definer set search_path = public as $$
  select greatest(0, 100 - coalesce(
    sum(case severity when 'critical' then 10 when 'warning' then 4 else 1 end), 0))::int
  from public.seo_audit_issues where audit_id = p_audit;
$$;

-- Cron body: one idempotent rank.check job per active tracked keyword (daily).
create or replace function public.enqueue_due_rank_checks()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id, workspace_id from public.tracked_keywords where is_active loop
    insert into public.jobs (workspace_id, type, payload, idempotency_key)
    values (r.workspace_id, 'rank.check',
            jsonb_build_object('tracked_keyword_id', r.id),
            'rankcheck-' || r.id || '-' || current_date)
    on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Cron body: one rank.report job per workspace that has active trackers (weekly, Mondays).
create or replace function public.enqueue_weekly_rank_reports()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select distinct workspace_id from public.tracked_keywords where is_active loop
    insert into public.jobs (workspace_id, type, payload, idempotency_key)
    values (r.workspace_id, 'rank.report', '{}'::jsonb,
            'rankreport-' || r.workspace_id || '-' || to_char(current_date, 'IYYY-IW'))
    on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ── Grants: privileged writes service-role only; reads/seam authenticated ─────────
revoke all on function public.seo_cache_get(uuid,text,text)          from public;
revoke all on function public.seo_cache_put(uuid,text,text,jsonb)    from public;
revoke all on function public.record_keyword_ranking(uuid,uuid,int,text,boolean,jsonb) from public;
revoke all on function public.enqueue_due_rank_checks()              from public;
revoke all on function public.enqueue_weekly_rank_reports()          from public;
grant execute on function public.seo_cache_get(uuid,text,text)          to service_role;
grant execute on function public.seo_cache_put(uuid,text,text,jsonb)    to service_role;
grant execute on function public.record_keyword_ranking(uuid,uuid,int,text,boolean,jsonb) to service_role;
grant execute on function public.enqueue_due_rank_checks()              to service_role;
grant execute on function public.enqueue_weekly_rank_reports()          to service_role;
grant execute on function public.send_to_content_queue(uuid,text[])     to authenticated;
grant execute on function public.rank_history(uuid,int)                 to authenticated;
grant execute on function public.audit_score(uuid)                      to authenticated, service_role;

-- ── pg_cron registry (guarded — PGlite lacks cron; swallow) ───────────────────────
do $$ begin
  perform cron.schedule('seo-rank-check-daily',   '0 3 * * *', $cron$ select public.enqueue_due_rank_checks(); $cron$);
  perform cron.schedule('seo-rank-report-weekly', '0 6 * * 1', $cron$ select public.enqueue_weekly_rank_reports(); $cron$);
exception when others then null; end $$;
