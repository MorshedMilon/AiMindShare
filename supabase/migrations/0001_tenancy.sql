-- ═══════════════════════════════════════════════════════════════════════════
-- 0001_tenancy.sql — AiMindShare Session 0
-- Foundation tenancy: profiles, workspaces, memberships.
-- Order inside this file matters:
--   1) tables  →  2) SQL helpers (need memberships to exist)  →  3) RLS + triggers
-- Every table with workspace_id gets RLS in THIS file (DoD Gate-8: a table-
-- creating migration must also enable row level security).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Tables ───────────────────────────────────────────────────────────────

-- Public mirror of auth.users (safe, non-secret profile fields)
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique not null,
  name        text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- Workspace = agency (top-level) or sub-account (parent_workspace_id set)
create table if not exists public.workspaces (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id),
  parent_workspace_id uuid references public.workspaces(id),
  name                text not null,
  slug                text unique not null,
  plan                public.plan_tier not null default 'free',
  custom_domain       text,
  branding            jsonb not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz,
  deleted_at          timestamptz
);

-- Membership: a user's role + status inside a workspace
create table if not exists public.memberships (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          public.member_role   not null default 'staff',
  status        public.member_status not null default 'active',
  permissions   jsonb not null default '{}',
  invited_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index if not exists memberships_workspace_id_idx on public.memberships (workspace_id);
create index if not exists memberships_user_id_idx      on public.memberships (user_id);

-- ── 2. Tenancy helpers (SQL, security definer → bypass RLS when checking) ─────
-- Placed AFTER the tables above so the language-sql bodies resolve at creation.

create or replace function public.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.workspace_id = ws
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.has_role(ws uuid, min_role text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.workspace_id = ws
      and m.user_id = auth.uid()
      and m.status = 'active'
      and array_position(array['client','staff','manager','admin','owner'], m.role::text)
          >= array_position(array['client','staff','manager','admin','owner'], min_role)
  );
$$;

-- ── 3. RLS + policies + triggers ─────────────────────────────────────────────

-- profiles: strictly self (a user reads/writes only their own row)
alter table public.profiles enable row level security;
create policy profiles_sel on public.profiles for select using ( id = auth.uid() );
create policy profiles_ins on public.profiles for insert with check ( id = auth.uid() );
create policy profiles_upd on public.profiles for update using ( id = auth.uid() ) with check ( id = auth.uid() );

-- workspaces: member reads; OWNER-only writes (override: stricter than staff)
alter table public.workspaces enable row level security;
create policy workspaces_sel on public.workspaces for select
  using ( public.is_member(id) );
create policy workspaces_ins on public.workspaces for insert
  with check ( owner_id = auth.uid() );
create policy workspaces_upd on public.workspaces for update
  using ( owner_id = auth.uid() ) with check ( owner_id = auth.uid() );
create policy workspaces_del on public.workspaces for delete
  using ( owner_id = auth.uid() );

create trigger workspaces_set_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();

-- memberships: read own row always OR admin sees all in workspace; ADMIN-only writes
alter table public.memberships enable row level security;
create policy memberships_sel on public.memberships for select
  using ( user_id = auth.uid() or public.has_role(workspace_id, 'admin') );
create policy memberships_ins on public.memberships for insert
  with check ( public.has_role(workspace_id, 'admin') );
create policy memberships_upd on public.memberships for update
  using ( public.has_role(workspace_id, 'admin') ) with check ( public.has_role(workspace_id, 'admin') );
create policy memberships_del on public.memberships for delete
  using ( public.has_role(workspace_id, 'admin') );
