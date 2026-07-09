-- ═══════════════════════════════════════════════════════════════════════════
-- 0007_m01_workspaces.sql — M01 Workspaces & Multi-Tenancy (Session 2)
-- Foundation tenancy (workspaces, memberships, is_member/has_role) already exists
-- from 0001. M01 adds the *product* layer on top of that wall:
--   1) workspace settings columns (niche/tz/currency/locale/status/settings)
--   2) workspace_invitations table (+ standard admin RLS)
--   3) SECURITY DEFINER RPCs that solve the RLS chicken-and-egg of first-member
--      creation and encode the platform's ownership invariants:
--        create_workspace · accept_invitation · transfer_ownership ·
--        archive_workspace / restore_workspace · leave_workspace · is_sole_owner
--   4) guard_last_owner — a DEFERRABLE constraint trigger: a workspace may never
--      be left with zero active owners (protects remove/demote/transfer paths)
--
-- Agency = top-level workspace (parent_workspace_id is null); sub-account = child
-- (parent set). There is NO separate Agency table — the PRD's Prisma Agency /
-- WorkspaceUser models map onto workspaces + memberships (DECISIONS D-019).
-- Agency reach into a sub-account is NOT automatic: it requires an explicit
-- membership, created at provisioning (RLS-AND-SECURITY §1).
--
-- Order inside this file: enum → columns → invitations table+RLS → helpers/RPCs →
-- guard trigger. Every new tenant table enables RLS in THIS file (DoD Gate-8).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Enum ──────────────────────────────────────────────────────────────────
do $$ begin
  create type public.ws_status as enum ('active','archived');
exception when duplicate_object then null; end $$;

-- ── 2. Extend workspaces with the M01 settings surface ───────────────────────
-- ADD COLUMN IF NOT EXISTS keeps this idempotent and never rewrites 0001.
alter table public.workspaces add column if not exists niche       text;
alter table public.workspaces add column if not exists timezone    text not null default 'America/Toronto';
alter table public.workspaces add column if not exists currency     char(3) not null default 'USD';
alter table public.workspaces add column if not exists locale       text not null default 'en';
alter table public.workspaces add column if not exists status       public.ws_status not null default 'active';
alter table public.workspaces add column if not exists settings     jsonb not null default '{}';
alter table public.workspaces add column if not exists archived_at  timestamptz;
-- (branding jsonb + deleted_at already exist from 0001; deleted_at is reserved
--  for M44 hard-delete. Archive is the soft, restorable, 90-day-retention state.)
create index if not exists workspaces_parent_idx on public.workspaces (parent_workspace_id);
create index if not exists workspaces_status_idx  on public.workspaces (status);

-- ── 3. workspace_invitations — pending email invites (tenant table) ──────────
-- Stores only sha256(token) — the raw token lives in the invite link, never the
-- DB. RLS mirrors memberships: admin+ manages; the invited user never selects the
-- row directly — they redeem it through accept_invitation() (definer) below.
create table if not exists public.workspace_invitations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email        text not null,
  role         public.member_role not null default 'staff',
  token_hash   text not null unique,                 -- sha256 hex of the raw token
  status       text not null default 'pending',      -- pending | accepted | revoked | expired
  invited_by   uuid references auth.users(id),
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists workspace_invitations_workspace_idx on public.workspace_invitations (workspace_id);
create index if not exists workspace_invitations_email_idx     on public.workspace_invitations (lower(email));

alter table public.workspace_invitations enable row level security;
create policy workspace_invitations_sel on public.workspace_invitations for select
  using ( public.has_role(workspace_id, 'admin') );
create policy workspace_invitations_ins on public.workspace_invitations for insert
  with check ( public.has_role(workspace_id, 'admin') );
create policy workspace_invitations_upd on public.workspace_invitations for update
  using ( public.has_role(workspace_id, 'admin') ) with check ( public.has_role(workspace_id, 'admin') );
create policy workspace_invitations_del on public.workspace_invitations for delete
  using ( public.has_role(workspace_id, 'admin') );

-- ── 4. Provisioning + ownership RPCs (SECURITY DEFINER) ──────────────────────
-- These bypass RLS on purpose (definer) so they can create the FIRST membership
-- of a workspace — the exact case RLS can't allow (has_role needs a membership
-- that doesn't exist yet). Each one binds identity to auth.uid() and re-checks
-- authorization itself, exactly like log_auth_event() (0006). This is the
-- controlled seam in the wall, not a hole in it.

-- create_workspace: make an agency (p_parent null) or a sub-account (p_parent set,
-- caller must be admin+ of the parent). Inserts the workspace + the caller's OWNER
-- membership atomically, then enqueues the workspace.provision job for deferred
-- defaults. Returns the new workspace row. This is the accept-when criterion:
-- "provisioning creates owner membership".
create or replace function public.create_workspace(
  p_name     text,
  p_niche    text default null,
  p_timezone text default 'America/Toronto',
  p_currency char(3) default 'USD',
  p_locale   text default 'en',
  p_parent   uuid default null
) returns public.workspaces
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  ws  public.workspaces;
  base_slug text;
  final_slug text;
  n int := 0;
begin
  if uid is null then
    raise exception 'create_workspace requires an authenticated caller' using errcode = '28000';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'workspace name is required' using errcode = '22023';
  end if;
  -- Sub-accounts: the parent must exist and the caller must be admin+ of it.
  if p_parent is not null then
    if not exists (select 1 from public.workspaces w where w.id = p_parent and w.parent_workspace_id is null) then
      raise exception 'parent must be a top-level agency workspace' using errcode = '22023';
    end if;
    if not public.has_role(p_parent, 'admin') then
      raise exception 'only an agency admin may create a sub-account' using errcode = '42501';
    end if;
  end if;

  -- Slugify the name; de-dupe with a numeric suffix (slug is globally unique).
  base_slug := regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g');
  base_slug := btrim(base_slug, '-');
  if base_slug = '' then base_slug := 'workspace'; end if;
  final_slug := base_slug;
  while exists (select 1 from public.workspaces w where w.slug = final_slug) loop
    n := n + 1;
    final_slug := base_slug || '-' || n::text;
  end loop;

  insert into public.workspaces (owner_id, parent_workspace_id, name, slug, niche, timezone, currency, locale)
  values (uid, p_parent, btrim(p_name), final_slug, nullif(btrim(p_niche), ''), p_timezone, p_currency, p_locale)
  returning * into ws;

  -- The owner membership — created here (synchronously) so the creator can read
  -- their own workspace immediately and the accept-when holds even if the worker
  -- is down. invited_by = self (bootstrap).
  insert into public.memberships (workspace_id, user_id, role, status, invited_by)
  values (ws.id, uid, 'owner', 'active', uid);

  -- Deferred defaults (settings, notification prefs; pipeline/calendar/tags land
  -- with M09/M11/M14) run as an async job — browser-visible, worker-owned.
  insert into public.jobs (workspace_id, type, payload, status, idempotency_key)
  values (ws.id, 'workspace.provision',
          jsonb_build_object('workspace_id', ws.id, 'is_agency', (p_parent is null)),
          'queued', 'workspace.provision:' || ws.id::text);

  return ws;
end $$;
revoke all on function public.create_workspace(text, text, text, char, text, uuid) from public;
grant execute on function public.create_workspace(text, text, text, char, text, uuid) to authenticated;

-- accept_invitation: the invited user redeems a raw token. Definer so it can read
-- the invite (RLS hides it from non-admins) and insert the membership (the user is
-- not a member yet). Binds the new membership to auth.uid(); requires the caller's
-- email to match the invite (case-insensitive). Completes the M00-stubbed join.
create or replace function public.accept_invitation(p_token_raw text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  uemail text;
  inv public.workspace_invitations;
begin
  if uid is null then
    raise exception 'accept_invitation requires an authenticated caller' using errcode = '28000';
  end if;
  select email into uemail from auth.users where id = uid;

  select * into inv from public.workspace_invitations
   where token_hash = encode(digest(p_token_raw, 'sha256'), 'hex')
   for update;

  if inv.id is null then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  if inv.status <> 'pending' then
    raise exception 'invitation already %', inv.status using errcode = '22023';
  end if;
  if inv.expires_at < now() then
    update public.workspace_invitations set status = 'expired' where id = inv.id;
    raise exception 'invitation expired' using errcode = '22023';
  end if;
  if lower(inv.email) <> lower(coalesce(uemail, '')) then
    raise exception 'invitation was issued to a different email' using errcode = '42501';
  end if;

  insert into public.memberships (workspace_id, user_id, role, status, invited_by)
  values (inv.workspace_id, uid, inv.role, 'active', inv.invited_by)
  on conflict (workspace_id, user_id)
  do update set status = 'active', role = excluded.role;

  update public.workspace_invitations
     set status = 'accepted', accepted_at = now()
   where id = inv.id;

  return inv.workspace_id;
end $$;
revoke all on function public.accept_invitation(text) from public;
grant execute on function public.accept_invitation(text) to authenticated;

-- transfer_ownership: current owner hands the crown to an existing active member.
-- Promote target → owner FIRST, then demote caller → admin (so the deferred
-- guard_last_owner never sees a zero-owner intermediate state). Updates
-- workspaces.owner_id to keep the denormalized pointer honest.
create or replace function public.transfer_ownership(p_workspace uuid, p_to_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'transfer_ownership requires an authenticated caller' using errcode = '28000';
  end if;
  if not public.has_role(p_workspace, 'owner') then
    raise exception 'only the owner may transfer ownership' using errcode = '42501';
  end if;
  if p_to_user = uid then
    raise exception 'cannot transfer ownership to yourself' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.memberships
     where workspace_id = p_workspace and user_id = p_to_user and status = 'active'
  ) then
    raise exception 'target must be an active member of the workspace' using errcode = '22023';
  end if;

  update public.memberships set role = 'owner'
    where workspace_id = p_workspace and user_id = p_to_user;
  update public.memberships set role = 'admin'
    where workspace_id = p_workspace and user_id = uid;
  update public.workspaces set owner_id = p_to_user where id = p_workspace;
end $$;
revoke all on function public.transfer_ownership(uuid, uuid) from public;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;

-- archive_workspace / restore_workspace: owner-only soft state. Archived
-- workspaces are hidden from the switcher and restorable (90-day retention);
-- hard-delete is M44-only via deleted_at.
create or replace function public.archive_workspace(p_workspace uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not public.has_role(p_workspace, 'owner') then
    raise exception 'only the owner may archive a workspace' using errcode = '42501';
  end if;
  update public.workspaces set status = 'archived', archived_at = now() where id = p_workspace;
end $$;
revoke all on function public.archive_workspace(uuid) from public;
grant execute on function public.archive_workspace(uuid) to authenticated;

create or replace function public.restore_workspace(p_workspace uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not public.has_role(p_workspace, 'owner') then
    raise exception 'only the owner may restore a workspace' using errcode = '42501';
  end if;
  update public.workspaces set status = 'active', archived_at = null where id = p_workspace;
end $$;
revoke all on function public.restore_workspace(uuid) from public;
grant execute on function public.restore_workspace(uuid) to authenticated;

-- is_sole_owner: does this user hold the ONLY active owner seat of any workspace?
-- The platform-wide guard behind account-delete (0006 account Edge Fn) and
-- leave_workspace. Definer so it can count owners across memberships regardless of
-- the caller's per-row visibility.
create or replace function public.is_sole_owner(p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.memberships m
     where m.user_id = p_user and m.role = 'owner' and m.status = 'active'
       and (
         select count(*) from public.memberships o
          where o.workspace_id = m.workspace_id and o.role = 'owner' and o.status = 'active'
       ) = 1
  );
$$;
revoke all on function public.is_sole_owner(uuid) from public;
grant execute on function public.is_sole_owner(uuid) to authenticated, service_role;

-- leave_workspace: a member removes THEMSELVES. Ordinary members can't delete
-- their own membership under the admin-only memberships RLS, so this definer RPC
-- is the sanctioned exit — blocked for a sole owner (must transfer first).
create or replace function public.leave_workspace(p_workspace uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  my_role public.member_role;
  owner_count int;
begin
  if uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select role into my_role from public.memberships
   where workspace_id = p_workspace and user_id = uid and status = 'active';
  if my_role is null then
    raise exception 'you are not a member of this workspace' using errcode = 'P0002';
  end if;
  if my_role = 'owner' then
    select count(*) into owner_count from public.memberships
     where workspace_id = p_workspace and role = 'owner' and status = 'active';
    if owner_count <= 1 then
      raise exception 'transfer ownership before leaving — you are the sole owner'
        using errcode = '42501';
    end if;
  end if;
  delete from public.memberships where workspace_id = p_workspace and user_id = uid;
end $$;
revoke all on function public.leave_workspace(uuid) from public;
grant execute on function public.leave_workspace(uuid) to authenticated;

-- ── 5. guard_last_owner — the zero-owner invariant ───────────────────────────
-- A DEFERRABLE constraint trigger checked at COMMIT: after any membership
-- delete/update, every workspace touched must still have ≥1 active owner. Deferred
-- so multi-statement flows (transfer_ownership) can pass through a transient state
-- and only the final committed state is judged. This is defense-in-depth beneath
-- the RPCs above — even a direct admin DELETE via RLS can't orphan a workspace.
create or replace function public.guard_last_owner() returns trigger
language plpgsql set search_path = public as $$
declare ws uuid;
begin
  ws := coalesce(old.workspace_id, new.workspace_id);
  -- If the workspace itself is gone (cascade delete), there is nothing to guard.
  if not exists (select 1 from public.workspaces w where w.id = ws) then
    return null;
  end if;
  if not exists (
    select 1 from public.memberships m
     where m.workspace_id = ws and m.role = 'owner' and m.status = 'active'
  ) then
    raise exception 'a workspace must always have at least one active owner'
      using errcode = '23514';
  end if;
  return null;
end $$;

drop trigger if exists memberships_guard_last_owner on public.memberships;
create constraint trigger memberships_guard_last_owner
  after update or delete on public.memberships
  deferrable initially deferred
  for each row execute function public.guard_last_owner();
