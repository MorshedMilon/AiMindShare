-- ═══════════════════════════════════════════════════════════════════════════
-- 0006_m00_auth.sql — M00 Auth & Identity (Session 1)
-- Supabase Auth (GoTrue) owns users, OAuth identities, sessions, TOTP 2FA, and
-- one-time tokens (magic-link / reset / verify) — see DECISIONS D-015. This
-- migration adds only what GoTrue does NOT provide:
--   1) handle_new_user()  — auto-create the public.profiles mirror on signup
--                           (BUILD-SEQUENCE Session 1 "Accept when" criterion)
--   2) public.auth_events — identity-scoped, append-only security ledger
--                           (distinct from M07's workspace-scoped audit_log; D-017)
--   3) log_auth_event()   — security-definer RPC so a signed-in client records
--                           its own success-path events (user_id = auth.uid())
-- Order inside this file: table → helpers/triggers → RLS + policies.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. profiles auto-create trigger ──────────────────────────────────────────
-- Fires after Supabase Auth inserts an auth.users row (any provider: password,
-- Google, magic link). Pulls display name + avatar from the signup metadata.
-- security definer so it can write public.profiles regardless of the caller;
-- on conflict do nothing keeps seed.sql's manual profiles insert idempotent.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2. auth_events — identity-scoped append-only ledger ──────────────────────
-- One row per security-relevant auth action. user_id is nullable so failed
-- logins against an unknown email still record (email captured, user_id null).
-- Consumed later by M07 (audit ingest) and M36 (login signals). NOT a tenant
-- table: auth happens before/independent of a workspace, so no workspace_id.
create table if not exists public.auth_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,  -- null = failed login on unknown email
  email       text,
  type        text not null,   -- login_success | login_failed | logout | password_changed
                               -- | twofa_enabled | twofa_disabled | session_revoked
                               -- | account_locked | email_changed | account_deleted
  ip_address  text,
  user_agent  text,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists auth_events_user_id_idx    on public.auth_events (user_id);
create index if not exists auth_events_created_at_idx on public.auth_events (created_at);

-- ── 3. log_auth_event() — client records its OWN success-path events ──────────
-- security definer: bypasses the "no client insert" RLS below, but hard-binds
-- user_id to auth.uid() so a caller can only write its own events. Server paths
-- (login_failed, account_locked) are inserted by Edge Functions / an Auth Hook
-- with the service role.
create or replace function public.log_auth_event(p_type text, p_metadata jsonb default '{}')
returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'log_auth_event requires an authenticated caller';
  end if;
  insert into public.auth_events (user_id, email, type, metadata)
  values (auth.uid(), (select email from auth.users where id = auth.uid()), p_type, coalesce(p_metadata, '{}'))
  returning id into new_id;
  return new_id;
end $$;

-- ── 4. RLS ───────────────────────────────────────────────────────────────────
-- auth_events override (RLS-AND-SECURITY §3 append-only pattern, self-scoped):
-- select = own rows only; NO client insert/update/delete. Writes go through
-- log_auth_event() (definer) or the service role. Append-only forever.
alter table public.auth_events enable row level security;
create policy auth_events_sel on public.auth_events for select
  using ( user_id = auth.uid() );
-- (no insert/update/delete policies → denied for every client role)
