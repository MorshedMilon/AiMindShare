-- ═══════════════════════════════════════════════════════════════════════════
-- 0011_m04_notifications.sql — M04 Notifications Center (Session 6)
-- (Filed as 0011: 0009/0010 were taken by M03/M05/M41 built in parallel; M04 has
--  no cross-module deps, so apply-order among them is irrelevant — see DECISIONS.)
-- One notification pipeline for the whole platform. Every module emits typed
-- events through a single entry point — notify() — and users control what they
-- receive and how. This session ships the IN-APP feed (Supabase Realtime, D-005)
-- + the preference system + the digest SCHEDULE (pg_cron → jobs). The EMAIL
-- channel is STUBBED: preferences persist and digest jobs are enqueued, but no
-- mail is sent until the provider decision D-011 (Resend vs SendGrid) is made.
-- DoD Gate-3: M04 has no billable actions (email metering lands with D-011).
--
-- Ground truth reconciled against the codebase (not the PRD's Prisma sketch):
--   · notif_channel enum did NOT exist (0000 only has member/plan/job/meter enums)
--     → it is created HERE, guarded so a re-run is a no-op.
--   · notifications / notification_prefs did NOT exist (DATA-SCHEMA §6 labelled
--     them "Migration 0004", but 0004 is storage buckets) → created HERE, VERBATIM
--     to the locked §6 shape: notifications(user_id nullable, data jsonb, channels
--     notif_channel[], read_at) and notification_prefs(prefs jsonb, digest text,
--     unique(workspace_id,user_id)). Deep links live inside data->>'link'.
--   · workspace_settings (per-workspace timezone) is an M07 table, not built yet →
--     the digest cron reads workspaces.branding->>'timezone' as an interim source
--     and defaults to UTC (DECISIONS D-030); M07 refines the 8am-local resolution.
--
-- PGlite-safety: the acceptance probes load raw .sql and only strip
-- `create extension` lines. So the two statements PGlite can't run — the Realtime
-- publication add and cron.schedule() — are wrapped in guarded DO blocks that
-- swallow the error, exactly like the enum guard. The migration still loads clean
-- under PGlite while doing the real thing on hosted Supabase.
--
-- Order inside this file: enum → tables → indexes → RLS/policies → notify() RPC →
-- Realtime publication → digest cron. Every new tenant table enables RLS in THIS
-- file (DoD Gate-8).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. notif_channel enum (guarded — duplicate is a no-op on re-run) ──────────
do $$ begin
  create type public.notif_channel as enum ('in_app','email','push');
exception when duplicate_object then null; end $$;

-- ── 1. notifications — the append-only feed (locked DATA-SCHEMA §6 shape) ─────
-- One row per (user, event). user_id NULL = a workspace-wide broadcast every
-- member sees. `data` carries type-specific context incl. the deep link
-- (data->>'link'). `channels` records which transports this row is intended for
-- (in_app is the feed itself; email is delivered later once D-011 lands; push in
-- M43). Rows are written ONLY by notify() (SECURITY DEFINER) — never by a client.
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete cascade,   -- null = workspace-wide
  type         text not null,
  title        text,
  body         text,
  data         jsonb default '{}',
  channels     public.notif_channel[] not null default '{in_app}',
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
-- §6 index: the feed query is "my unread/unread-anything in this workspace".
create index if not exists notifications_ws_user_read_idx
  on public.notifications (workspace_id, user_id, read_at);
-- dedupe + digest scan by recency.
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- ── 2. notification_prefs — one row per (user, workspace) ─────────────────────
-- `prefs` is a jsonb map keyed by notification type:
--   { "contact.assigned": {"in_app":true,"email":false,"push":false}, … ,
--     "mute_all": <bool>, "quiet_hours": {"start":"22:00","end":"07:00"} }
-- Absent keys fall back to the server defaults in notify() (in_app on, email on,
-- push off). `digest` is off|daily|weekly. mute_all silences delivery entirely;
-- quiet_hours is an email-only rule stored now, enforced when email goes live.
create table if not exists public.notification_prefs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  prefs        jsonb not null default '{}',
  digest       text not null default 'off',   -- off|daily|weekly
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,
  unique (workspace_id, user_id),
  constraint notification_prefs_digest_chk check (digest in ('off','daily','weekly'))
);
create index if not exists notification_prefs_ws_user_idx
  on public.notification_prefs (workspace_id, user_id);

drop trigger if exists notification_prefs_set_updated_at on public.notification_prefs;
create trigger notification_prefs_set_updated_at before update on public.notification_prefs
  for each row execute function public.set_updated_at();

-- ── 3. RLS — notifications (append-only ledger + self-owned; RLS-AND-SECURITY §3) ─
-- Like auth_events / jobs, this is a ledger: the browser never INSERTs (only the
-- SECURITY DEFINER notify() writes) and never DELETEs. It reads its OWN rows (plus
-- workspace-wide broadcasts) and may only UPDATE to mark them read. Four write
-- vectors are therefore covered: SELECT (self/broadcast), UPDATE (self, mark-read),
-- no INSERT policy + no DELETE policy = both impossible for anon/authenticated.
alter table public.notifications enable row level security;

create policy notifications_sel on public.notifications for select
  using ( user_id = auth.uid()
          or (user_id is null and public.is_member(workspace_id)) );

-- UPDATE own rows only (the app touches read_at exclusively; a member can't reach
-- another user's or another tenant's rows). WITH CHECK pins the row to the caller.
create policy notifications_upd on public.notifications for update
  using      ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );

-- ── 4. RLS — notification_prefs (a user owns their own row, per workspace) ────
alter table public.notification_prefs enable row level security;

create policy notification_prefs_sel on public.notification_prefs for select
  using ( user_id = auth.uid() );

create policy notification_prefs_ins on public.notification_prefs for insert
  with check ( user_id = auth.uid() and public.is_member(workspace_id) );

create policy notification_prefs_upd on public.notification_prefs for update
  using      ( user_id = auth.uid() )
  with check ( user_id = auth.uid() and public.is_member(workspace_id) );

create policy notification_prefs_del on public.notification_prefs for delete
  using ( user_id = auth.uid() );

-- ── 5. notify() — the single entry point every module calls (SECURITY DEFINER) ─
-- p_targets is EITHER a list of user-id strings OR a single-element role token:
--   {'all'}                          → every active member of the workspace
--   {'owner'|'admin'|'manager'|'staff'|'client'} → active members at/above that tier
--   {'<uuid>', '<uuid>', …}          → those explicit users
-- For each resolved user it consults notification_prefs (server defaults: in_app
-- on, email on, push off), skips muted users, dedupes identical (user+type+link)
-- events inside a 5-minute window, and inserts a feed row whose `channels` array is
-- the set of enabled transports. Returns the number of rows created. Callers are
-- server-side (Edge Functions / workers with the service-role key); the browser
-- never calls this — it only reads the resulting rows via RLS + Realtime.
create or replace function public.notify(
  p_workspace uuid,
  p_targets   text[],
  p_type      text,
  p_title     text,
  p_body      text  default null,
  p_data      jsonb default '{}'::jsonb
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  target_ids uuid[];
  uid        uuid;
  pr         jsonb;
  in_app_on  boolean;
  email_on   boolean;
  push_on    boolean;
  chans      public.notif_channel[];
  link       text := coalesce(p_data->>'link','');
  made       integer := 0;
begin
  -- Resolve the target list.
  if p_targets is null or array_length(p_targets,1) is null then
    return 0;
  elsif p_targets[1] = 'all' then
    select array_agg(user_id) into target_ids
      from public.memberships
     where workspace_id = p_workspace and status = 'active';
  elsif p_targets[1] in ('owner','admin','manager','staff','client')
        and array_length(p_targets,1) = 1 then
    select array_agg(m.user_id) into target_ids
      from public.memberships m
     where m.workspace_id = p_workspace and m.status = 'active'
       and array_position(array['client','staff','manager','admin','owner'], m.role::text)
           >= array_position(array['client','staff','manager','admin','owner'], p_targets[1]);
  else
    -- explicit user ids (ignore anything that isn't a uuid)
    select array_agg(t::uuid) into target_ids
      from unnest(p_targets) t
     where t ~ '^[0-9a-fA-F-]{36}$';
  end if;

  if target_ids is null then return 0; end if;

  foreach uid in array target_ids loop
    -- per-user preferences (row may be absent → all defaults)
    select prefs into pr from public.notification_prefs
      where workspace_id = p_workspace and user_id = uid;
    pr := coalesce(pr, '{}'::jsonb);

    -- mute-all silences every channel for this user in this workspace
    if coalesce((pr->>'mute_all')::boolean, false) then
      continue;
    end if;

    -- server defaults: in_app on, email on, push off; per-type override wins
    in_app_on := coalesce((pr->p_type->>'in_app')::boolean, true);
    email_on  := coalesce((pr->p_type->>'email')::boolean,  true);
    push_on   := coalesce((pr->p_type->>'push')::boolean,   false);

    chans := array[]::public.notif_channel[];
    if in_app_on then chans := chans || 'in_app'::public.notif_channel; end if;
    if email_on  then chans := chans || 'email'::public.notif_channel;  end if;
    if push_on   then chans := chans || 'push'::public.notif_channel;   end if;

    -- nothing enabled → skip (respects a user who turned this type fully off)
    if array_length(chans,1) is null then continue; end if;

    -- dedupe: identical (user + type + link) within the last 5 minutes
    if exists (
      select 1 from public.notifications
       where user_id = uid and type = p_type
         and coalesce(data->>'link','') = link
         and created_at > now() - interval '5 minutes'
    ) then
      continue;
    end if;

    insert into public.notifications (workspace_id, user_id, type, title, body, data, channels)
    values (p_workspace, uid, p_type, p_title, p_body, coalesce(p_data,'{}'::jsonb), chans);
    made := made + 1;
    -- Email dispatch (instant/batched) is deferred until D-011; the row's `channels`
    -- already records the intent for the future sender + the digest grouping.
  end loop;

  return made;
end $$;
revoke all on function public.notify(uuid, text[], text, text, text, jsonb) from public;
grant execute on function public.notify(uuid, text[], text, text, text, jsonb) to service_role;

-- ── 6. Realtime — publish notifications for postgres_changes (RLS still applies) ─
-- The in-app bell subscribes to INSERTs filtered by user_id (D-005: Supabase
-- Realtime replaces the PRD's Pusher). Guarded: PGlite has no supabase_realtime
-- publication, so the probe loads this as a no-op.
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when others then null; end $$;

-- ── 7. Digest schedule — pg_cron enqueues jobs; the sender is stubbed (D-011) ──
-- Hourly sweep. For each workspace whose LOCAL hour is 8 (tz from
-- workspaces.branding->>'timezone', default UTC — D-030) and which has ≥1 active
-- member on a daily digest (or weekly, on Mondays), enqueue ONE notification.digest
-- job. The idempotency_key (workspace + local date) uses the existing
-- jobs (workspace_id,type,idempotency_key) unique index so an hour-boundary double
-- fire can't create two. No worker handler ships this session — enqueue + schedule
-- IS the Session-6 accept-when; delivery arrives with the email provider. Guarded
-- for PGlite (no pg_cron); the enqueue SQL is exercised directly by m04probe.
do $$ begin
  perform cron.schedule(
    'm04-digest-enqueue',
    '0 * * * *',
    $cron$
      insert into public.jobs (workspace_id, type, payload, status, idempotency_key)
      select w.id,
             'notification.digest',
             jsonb_build_object(
               'local_date', (now() at time zone coalesce(nullif(w.branding->>'timezone',''),'UTC'))::date,
               'tz',         coalesce(nullif(w.branding->>'timezone',''),'UTC')),
             'queued',
             'digest-' || w.id || '-' ||
               to_char((now() at time zone coalesce(nullif(w.branding->>'timezone',''),'UTC'))::date,'YYYY-MM-DD')
        from public.workspaces w
       where w.deleted_at is null
         and extract(hour from (now() at time zone coalesce(nullif(w.branding->>'timezone',''),'UTC'))) = 8
         and exists (
           select 1 from public.notification_prefs np
            join public.memberships m
              on m.workspace_id = np.workspace_id and m.user_id = np.user_id and m.status = 'active'
           where np.workspace_id = w.id
             and ( np.digest = 'daily'
                or (np.digest = 'weekly'
                    and extract(dow from (now() at time zone coalesce(nullif(w.branding->>'timezone',''),'UTC'))) = 1) )
         )
      on conflict (workspace_id, type, idempotency_key) where idempotency_key is not null
      do nothing;
    $cron$
  );
exception when others then null; end $$;
