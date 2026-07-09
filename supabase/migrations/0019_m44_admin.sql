-- ═══════════════════════════════════════════════════════════════════════════
-- 0019_m44_admin.sql — M44 Admin Basics (Session 14)
-- The super-admin console foundation. Every tenant table is RLS-scoped to
-- is_member(workspace_id), so a platform admin CANNOT read across workspaces via
-- the client SDK. Therefore every cross-tenant admin read/write goes through an
-- is_platform_admin()-gated SECURITY DEFINER RPC — the gate is line 1 of each.
-- Ships M44's own append-only admin_audit_log (D-079, distinct from M00
-- auth_events / future M07 audit_log), feature flags (D-082), audited
-- impersonation (D-080), a public.jobs monitor surface (D-081), and a suspend
-- action (D-083; full read-only enforcement retrofit deferred).
--
-- Migration number 0019 (0017=M14, 0018=M28 — both landed in parallel; 0012 is
-- the reserved M05-renumber gap). Reconcile flags noted in TASKS at session close.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ws_status gains 'suspended' (D-083) ──────────────────────────────────────
-- Audited flip only; the cross-module write-policy retrofit (`and not
-- workspace_suspended(workspace_id)`) + app-shell read-only banner are deferred.
alter type public.ws_status add value if not exists 'suspended';

create or replace function public.workspace_suspended(ws uuid)
returns boolean language sql stable set search_path = public as $$
  -- status::text avoids eager enum resolution of the just-added 'suspended' value
  -- at function-creation time (same-migration ALTER TYPE ADD VALUE safety).
  select exists (select 1 from public.workspaces where id = ws and status::text = 'suspended')
$$;

-- ── 1. feature_flags (global registry) ───────────────────────────────────────
create table if not exists public.feature_flags (
  key         text primary key,
  default_on  boolean not null default false,
  description text,
  category    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);
create trigger feature_flags_set_updated_at before update on public.feature_flags
  for each row execute function public.set_updated_at();
alter table public.feature_flags enable row level security;
-- flags are not secret: any authed user may READ (to evaluate gates); writes admin-only
create policy feature_flags_sel on public.feature_flags for select
  using ( auth.uid() is not null );
create policy feature_flags_ins on public.feature_flags for insert
  with check ( public.is_platform_admin() );
create policy feature_flags_upd on public.feature_flags for update
  using ( public.is_platform_admin() ) with check ( public.is_platform_admin() );
create policy feature_flags_del on public.feature_flags for delete
  using ( public.is_platform_admin() );

-- ── 2. feature_flag_overrides (per-workspace) ────────────────────────────────
create table if not exists public.feature_flag_overrides (
  flag_key     text not null references public.feature_flags(key) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  enabled      boolean not null,
  created_at   timestamptz not null default now(),
  primary key (flag_key, workspace_id)
);
alter table public.feature_flag_overrides enable row level security;
create policy ffo_sel on public.feature_flag_overrides for select
  using ( public.is_member(workspace_id) or public.is_platform_admin() );
create policy ffo_ins on public.feature_flag_overrides for insert
  with check ( public.is_platform_admin() );
create policy ffo_upd on public.feature_flag_overrides for update
  using ( public.is_platform_admin() ) with check ( public.is_platform_admin() );
create policy ffo_del on public.feature_flag_overrides for delete
  using ( public.is_platform_admin() );

-- ── 3. impersonation_sessions ────────────────────────────────────────────────
create table if not exists public.impersonation_sessions (
  id                  uuid primary key default gen_random_uuid(),
  admin_user_id       uuid not null,
  target_user_id      uuid not null,
  target_workspace_id uuid,
  reason              text not null,
  started_at          timestamptz not null default now(),
  expires_at          timestamptz not null,
  ended_at            timestamptz
);
create index if not exists impersonation_active_idx
  on public.impersonation_sessions (expires_at) where ended_at is null;
alter table public.impersonation_sessions enable row level security;
-- read = platform admin only; NO insert/update/delete policy → service-role/definer only
create policy imp_sel on public.impersonation_sessions for select
  using ( public.is_platform_admin() );

-- ── 4. admin_audit_log (append-only platform ledger — D-079) ─────────────────
create table if not exists public.admin_audit_log (
  id                uuid primary key default gen_random_uuid(),
  actor_user_id     uuid not null,
  acting_as_user_id uuid,
  workspace_id      uuid,
  action            text not null,
  target_type       text,
  target_id         text,
  detail            jsonb not null default '{}',
  created_at        timestamptz not null default now()
);
create index if not exists admin_audit_created_idx on public.admin_audit_log (created_at desc);
alter table public.admin_audit_log enable row level security;
-- read = platform admin; NO insert/update/delete policy → append-only via definer/service-role
create policy admin_audit_sel on public.admin_audit_log for select
  using ( public.is_platform_admin() );

-- ── Internal audit writer (NOT client-callable — never granted to authenticated) ─
-- SECURITY DEFINER so the other admin RPCs can append; direct execute is revoked so
-- a plain authenticated user cannot forge audit rows.
create or replace function public.admin_audit(
  p_action text, p_target_type text, p_target_id text, p_workspace uuid, p_detail jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.admin_audit_log(actor_user_id, workspace_id, action, target_type, target_id, detail)
  values (auth.uid(), p_workspace, p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'));
end $$;
revoke all on function public.admin_audit(text, text, text, uuid, jsonb) from public;

-- ═══════════════════════════════════════════════════════════════════════════
-- Gated READ RPCs — is_platform_admin() wall on line 1 of each.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.admin_platform_kpis()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_platform_admin() then raise exception 'not_platform_admin' using errcode = '42501'; end if;
  select jsonb_build_object(
    'workspaces',   (select count(*) from public.workspaces),
    'users',        (select count(*) from public.profiles),
    'active_subs',  (select count(*) from public.subscriptions_platform where status in ('active','trialing')),
    'mrr',          (select coalesce(sum(p.monthly_price), 0) from public.subscriptions_platform s
                       join public.plans p on p.id = s.plan_id where s.status = 'active'),
    'jobs_queued',  (select count(*) from public.jobs where status = 'queued'),
    'jobs_running', (select count(*) from public.jobs where status = 'running'),
    'jobs_failed',  (select count(*) from public.jobs where status = 'failed')
  ) into r;
  return r;
end $$;

create or replace function public.admin_list_workspaces(
  p_search text default null, p_status text default null,
  p_limit int default 50, p_offset int default 0)
returns table(id uuid, name text, parent_workspace_id uuid, status text, billing_state text,
              plan_name text, sub_status text, member_count bigint, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_platform_admin' using errcode = '42501'; end if;
  return query
    select w.id, w.name, w.parent_workspace_id, w.status::text, w.billing_state,
           p.name, s.status,
           (select count(*) from public.memberships m where m.workspace_id = w.id),
           w.created_at
      from public.workspaces w
      left join public.subscriptions_platform s on s.workspace_id = w.id
      left join public.plans p on p.id = s.plan_id
     where (p_search is null or w.name ilike '%' || p_search || '%')
       and (p_status is null or w.status::text = p_status)
     order by w.created_at desc
     limit p_limit offset p_offset;
end $$;

create or replace function public.admin_list_users(
  p_search text default null, p_limit int default 50, p_offset int default 0)
returns table(id uuid, email text, name text, membership_count bigint, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_platform_admin' using errcode = '42501'; end if;
  return query
    select pr.id, pr.email, pr.name,
           (select count(*) from public.memberships m where m.user_id = pr.id),
           pr.created_at
      from public.profiles pr
     where (p_search is null or pr.email ilike '%' || p_search || '%' or pr.name ilike '%' || p_search || '%')
     order by pr.created_at desc nulls last
     limit p_limit offset p_offset;
end $$;

create or replace function public.admin_list_jobs(
  p_status text default null, p_type text default null, p_limit int default 100)
returns table(id uuid, workspace_id uuid, workspace_name text, type text, status text,
              attempts int, run_after timestamptz, error text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_platform_admin' using errcode = '42501'; end if;
  return query
    select j.id, j.workspace_id, w.name, j.type, j.status::text, j.attempts, j.run_after, j.error, j.created_at
      from public.jobs j
      join public.workspaces w on w.id = j.workspace_id
     where (p_status is null or j.status::text = p_status)
       and (p_type is null or j.type = p_type)
     order by j.created_at desc
     limit p_limit;
end $$;

create or replace function public.admin_get_workspace(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_platform_admin() then raise exception 'not_platform_admin' using errcode = '42501'; end if;
  select jsonb_build_object(
    'workspace', (select to_jsonb(w) from public.workspaces w where w.id = p_id),
    'subscription', (select to_jsonb(s) from public.subscriptions_platform s where s.workspace_id = p_id),
    'members', (select coalesce(jsonb_agg(jsonb_build_object(
                  'user_id', m.user_id, 'role', m.role, 'status', m.status,
                  'name', pr.name, 'email', pr.email)), '[]'::jsonb)
                from public.memberships m join public.profiles pr on pr.id = m.user_id
                where m.workspace_id = p_id),
    'overrides', (select coalesce(jsonb_agg(jsonb_build_object('flag_key', o.flag_key, 'enabled', o.enabled)), '[]'::jsonb)
                  from public.feature_flag_overrides o where o.workspace_id = p_id),
    'recent_jobs', (select coalesce(jsonb_agg(to_jsonb(j) order by j.created_at desc), '[]'::jsonb)
                    from (select * from public.jobs where workspace_id = p_id order by created_at desc limit 10) j)
  ) into r;
  return r;
end $$;

-- Flag resolver: override → default → false. Safe (returns only a bool); app-callable.
create or replace function public.admin_flag_enabled(p_key text, p_workspace uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select o.enabled from public.feature_flag_overrides o
      where o.flag_key = p_key and o.workspace_id = p_workspace),
    (select f.default_on from public.feature_flags f where f.key = p_key),
    false)
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Gated MUTATION RPCs — gate on line 1; each appends an admin_audit_log row.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.admin_set_feature_flag(
  p_key text, p_default_on boolean, p_description text default null, p_category text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_platform_admin' using errcode = '42501'; end if;
  insert into public.feature_flags(key, default_on, description, category)
  values (p_key, p_default_on, p_description, p_category)
  on conflict (key) do update set
    default_on  = excluded.default_on,
    description = coalesce(excluded.description, public.feature_flags.description),
    category    = coalesce(excluded.category, public.feature_flags.category),
    updated_at  = now();
  perform public.admin_audit('flag.set', 'flag', p_key, null, jsonb_build_object('default_on', p_default_on));
end $$;

create or replace function public.admin_set_flag_override(p_key text, p_workspace uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_platform_admin' using errcode = '42501'; end if;
  if p_enabled is null then
    delete from public.feature_flag_overrides where flag_key = p_key and workspace_id = p_workspace;
  else
    insert into public.feature_flag_overrides(flag_key, workspace_id, enabled)
    values (p_key, p_workspace, p_enabled)
    on conflict (flag_key, workspace_id) do update set enabled = excluded.enabled;
  end if;
  perform public.admin_audit('flag.override', 'flag', p_key, p_workspace, jsonb_build_object('enabled', p_enabled));
end $$;

create or replace function public.admin_suspend_workspace(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_platform_admin' using errcode = '42501'; end if;
  update public.workspaces set status = 'suspended' where id = p_id;
  perform public.admin_audit('workspace.suspend', 'workspace', p_id::text, p_id, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.admin_unsuspend_workspace(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_platform_admin' using errcode = '42501'; end if;
  update public.workspaces set status = 'active' where id = p_id;
  perform public.admin_audit('workspace.unsuspend', 'workspace', p_id::text, p_id, '{}');
end $$;

create or replace function public.admin_retry_job(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_platform_admin' using errcode = '42501'; end if;
  update public.jobs
     set status = 'queued', run_after = now(), locked_by = null, locked_at = null, error = null, updated_at = now()
   where id = p_id;
  perform public.admin_audit('job.retry', 'job', p_id::text, null, '{}');
end $$;

create or replace function public.admin_discard_job(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_platform_admin' using errcode = '42501'; end if;
  update public.jobs set status = 'failed', error = 'discarded by admin', updated_at = now() where id = p_id;
  perform public.admin_audit('job.discard', 'job', p_id::text, null, '{}');
end $$;

create or replace function public.admin_end_impersonation(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.impersonation_sessions;
begin
  if not public.is_platform_admin() then raise exception 'not_platform_admin' using errcode = '42501'; end if;
  update public.impersonation_sessions set ended_at = now()
    where id = p_id and ended_at is null returning * into s;
  if found then
    perform public.admin_audit('impersonate.end', 'user', s.target_user_id::text, s.target_workspace_id,
      jsonb_build_object('acting_as', s.target_user_id));
    update public.admin_audit_log set acting_as_user_id = s.target_user_id
      where id = (select id from public.admin_audit_log
                   where action = 'impersonate.end' and target_id = s.target_user_id::text
                   order by created_at desc limit 1);
  end if;
end $$;

-- ── Grants: each public-facing admin RPC self-gates, so expose to authenticated.
--    admin_audit is deliberately EXCLUDED (revoked above) so it can't be forged.
revoke all on function
  public.admin_platform_kpis(),
  public.admin_list_workspaces(text, text, int, int),
  public.admin_list_users(text, int, int),
  public.admin_list_jobs(text, text, int),
  public.admin_get_workspace(uuid),
  public.admin_set_feature_flag(text, boolean, text, text),
  public.admin_set_flag_override(text, uuid, boolean),
  public.admin_suspend_workspace(uuid, text),
  public.admin_unsuspend_workspace(uuid),
  public.admin_retry_job(uuid),
  public.admin_discard_job(uuid),
  public.admin_end_impersonation(uuid)
  from public;
grant execute on function
  public.admin_platform_kpis(),
  public.admin_list_workspaces(text, text, int, int),
  public.admin_list_users(text, int, int),
  public.admin_list_jobs(text, text, int),
  public.admin_get_workspace(uuid),
  public.admin_set_feature_flag(text, boolean, text, text),
  public.admin_set_flag_override(text, uuid, boolean),
  public.admin_suspend_workspace(uuid, text),
  public.admin_unsuspend_workspace(uuid),
  public.admin_retry_job(uuid),
  public.admin_discard_job(uuid),
  public.admin_end_impersonation(uuid),
  public.admin_flag_enabled(text, uuid),
  public.workspace_suspended(uuid)
  to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Impersonation expiry sweep — server-side 30-min guarantee (D-080).
-- pg_cron closes any session past expires_at even if the client never ends it,
-- writing a dual-identity audit row per closed session. Guarded for PGlite.
-- ═══════════════════════════════════════════════════════════════════════════
do $$ begin
  perform cron.schedule('m44-impersonation-expiry-sweep', '*/1 * * * *', $cron$
    with closed as (
      update public.impersonation_sessions set ended_at = now()
       where ended_at is null and expires_at < now()
      returning admin_user_id, target_user_id, target_workspace_id)
    insert into public.admin_audit_log(actor_user_id, acting_as_user_id, workspace_id, action, target_type, target_id, detail)
    select admin_user_id, target_user_id, target_workspace_id, 'impersonate.expire', 'user', target_user_id::text, '{}'
      from closed;
  $cron$);
exception when others then
  raise notice 'pg_cron unavailable — m44-impersonation-expiry-sweep not scheduled (%).', sqlerrm;
end $$;
