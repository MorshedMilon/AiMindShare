-- ═══════════════════════════════════════════════════════════════════════════
-- 0008_m02_roles.sql — M02 Roles & Permissions (Session 3)
-- The coarse 5-tier enum wall (member_role) from 0000/0001 STANDS unchanged:
-- ALL RLS + M01 RPCs + guard_last_owner keep comparing memberships.role. M02 adds
-- the *fine* layer ON TOP (DECISIONS D-023):
--   1) roles table — built-in global rows (immutable) + per-workspace custom roles;
--      each carries a permissions text[] of module.action grants + a base_role tier
--   2) memberships.role_id → roles(id); memberships.role stays the DERIVED coarse
--      tier (a trigger forces role := base_role, so the two never drift — D-024)
--   3) has_permission(ws,perm) — (role_perms ∪ grant) − revoke; OWNER short-circuits;
--      CLIENT ceiling to portal.* ; overrides in memberships.permissions jsonb (D-025)
--   4) set_member_role / set_member_permissions / delete_role RPCs (admin+, definer)
--   5) RLS: built-ins immutable (null workspace_id → no write policy matches),
--      custom roles admin-managed & tenant-scoped
--
-- Why not migrate memberships.role → a roleId FK (PRD_M02 §4)? Because the entire
-- wall — has_role(), every RLS policy, all M01 RPCs, guard_last_owner, is_sole_owner
-- — compares the enum. RLS enforces the COARSE matrix; Edge Functions enforce the
-- FINE overrides (RLS-AND-SECURITY §2). Mapping the PRD model onto the existing wall
-- (not rebuilding it) mirrors D-019/D-021.
--
-- Audit of role/permission changes is DEFERRED to M07 (D-026), exactly like M01
-- deferred invite email to M04 (D-022): audit_log isn't built yet, so the RPCs below
-- carry a documented `M07 hook` comment and emit nothing today.
--
-- Order inside this file: table → seed → derive-trigger → helpers/RPCs → RLS.
-- Every new tenant table enables RLS in THIS file (DoD Gate-8).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. roles ─────────────────────────────────────────────────────────────────
-- workspace_id NULL  = built-in global role (immutable; shared by every tenant).
-- workspace_id SET   = custom role owned by that workspace.
-- base_role          = the coarse member_role tier this role maps to (drives RLS).
-- permissions text[] = the module.action grants (the registry vocabulary; the
--                      single source of truth is _shared/permissions.ts — the probe
--                      asserts the seeded arrays stay in sync).
create table if not exists public.roles (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,   -- NULL = built-in
  name         text not null,
  base_role    public.member_role not null,
  is_built_in  boolean not null default false,
  permissions  text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,
  -- a custom role may never fabricate ownership (that belongs to transfer_ownership)
  constraint roles_custom_not_owner check ( is_built_in or base_role <> 'owner' ),
  -- built-ins are global (no workspace); custom roles are tenant-scoped
  constraint roles_builtin_global   check ( is_built_in = (workspace_id is null) ),
  -- name unique per scope (built-ins globally; custom per workspace)
  unique (workspace_id, name)
);
create index if not exists roles_workspace_idx on public.roles (workspace_id);

-- memberships.role_id: NULL = "use the built-in role matching the coarse role enum".
-- NO `on delete` clause → default NO ACTION (RESTRICT-equivalent): a role still
-- referenced by a membership cannot be deleted. This is the real wall behind
-- delete_role() below; the RPC only supplies a friendlier error first.
alter table public.memberships
  add column if not exists role_id uuid references public.roles(id);

-- ── 2. Seed the 5 built-in roles (workspace_id NULL, immutable, fixed UUIDs) ──
-- These arrays MUST equal supabase/functions/_shared/permissions.ts ROLE_MATRIX;
-- m02probe guards the drift. Foundation vocabulary only — modules append perms to
-- the registry as they land, and a later migration extends the built-in arrays.
insert into public.roles (id, workspace_id, name, base_role, is_built_in, permissions) values
  ('00000000-0000-0000-0000-0000000000a1', null, 'Owner',   'owner',   true, array[
     'crm.view','crm.create','crm.edit','crm.delete','crm.export',
     'pipeline.view','pipeline.manage','campaigns.view','campaigns.send',
     'forms.view','forms.manage',
     'reports.view','automations.manage',
     'team.manage','billing.manage','settings.manage','workspace.delete','whitelabel.manage'
   ]),
  ('00000000-0000-0000-0000-0000000000a2', null, 'Admin',   'admin',   true, array[
     'crm.view','crm.create','crm.edit','crm.delete','crm.export',
     'pipeline.view','pipeline.manage','campaigns.view','campaigns.send',
     'forms.view','forms.manage',
     'reports.view','automations.manage',
     'team.manage','settings.manage'
     -- NO billing.manage, NO workspace.delete, NO whitelabel.manage (matrix §2)
   ]),
  ('00000000-0000-0000-0000-0000000000a3', null, 'Manager', 'manager', true, array[
     'crm.view','crm.create','crm.edit','crm.delete','crm.export',
     'pipeline.view','pipeline.manage','campaigns.view','campaigns.send',
     'forms.view','forms.manage',
     'reports.view','automations.manage'
     -- full module access; NO team/settings/billing
   ]),
  ('00000000-0000-0000-0000-0000000000a4', null, 'Staff',   'staff',   true, array[
     'crm.view','crm.create','crm.edit',
     'pipeline.view','campaigns.view','reports.view',
     'forms.view','forms.manage'
     -- assigned-records focus; forms staff+ (D-146); explicitly NO crm.delete, NO crm.export (Gate-2 test)
   ]),
  ('00000000-0000-0000-0000-0000000000a5', null, 'Client',  'client',  true, array[
     'portal.view','portal.approve','portal.pay'
     -- portal-only; coarse RLS (has_role staff) already blocks all workspace writes
   ])
on conflict (id) do nothing;

-- ── 3. Keep memberships.role in lock-step with role_id (no drift, ever — D-024) ──
-- If role_id is set, role is FORCED to that role's base_role, so the RLS coarse tier
-- always matches the assigned role. If role_id is NULL, role keeps whatever the enum
-- path set (M01 behaviour, untouched). This is why set_member_role never writes both
-- columns — the trigger derives one from the other.
create or replace function public.sync_membership_role() returns trigger
language plpgsql set search_path = public as $$
declare br public.member_role;
begin
  if new.role_id is not null then
    select base_role into br from public.roles where id = new.role_id;
    if br is null then
      raise exception 'role_id % does not exist', new.role_id using errcode = '23503';
    end if;
    new.role := br;
  end if;
  return new;
end $$;

drop trigger if exists memberships_sync_role on public.memberships;
create trigger memberships_sync_role
  before insert or update of role_id on public.memberships
  for each row execute function public.sync_membership_role();

-- ── 4. has_permission — the fine resolver (SECURITY DEFINER) ──────────────────
-- Resolves the CALLER's effective grant for (ws, perm):
--   not a member          → false
--   owner tier            → true  (short-circuit; owner is immutable/all)
--   client tier + non-portal perm → false (ceiling; coarse RLS blocks the rest anyway,
--                           this keeps the answer honest so the UI never offers it)
--   role_perms            = role_id.permissions  OR  built-in row for the role enum
--   overrides             = (role_perms ∪ grant) − revoke     [revoke WINS]
create or replace function public.has_permission(ws uuid, perm text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  m           public.memberships;
  role_perms  text[];
  granted     text[];
  revoked     text[];
begin
  select * into m from public.memberships
   where workspace_id = ws and user_id = auth.uid() and status = 'active';
  if m.user_id is null then
    return false;                                   -- not an active member
  end if;
  if m.role = 'owner' then
    return true;                                    -- OWNER short-circuit (all perms)
  end if;
  if m.role = 'client' and perm not like 'portal.%' then
    return false;                                   -- CLIENT ceiling: portal.* only
  end if;

  -- Effective role permission set: the custom role if assigned, else the built-in
  -- row matching the coarse enum tier.
  if m.role_id is not null then
    select permissions into role_perms from public.roles where id = m.role_id;
  else
    select permissions into role_perms
      from public.roles where is_built_in and base_role = m.role;
  end if;
  role_perms := coalesce(role_perms, '{}');

  -- jsonb overrides: {"grant":["x.y"],"revoke":["a.b"]}  (revoke wins)
  granted := coalesce(
    (select array_agg(value) from jsonb_array_elements_text(m.permissions->'grant')), '{}');
  revoked := coalesce(
    (select array_agg(value) from jsonb_array_elements_text(m.permissions->'revoke')), '{}');

  if perm = any(revoked) then
    return false;                                   -- explicit per-member revoke
  end if;
  return perm = any(role_perms) or perm = any(granted);
end $$;
revoke all on function public.has_permission(uuid, text) from public;
grant execute on function public.has_permission(uuid, text) to authenticated, service_role;

-- has_permission_for — explicit-user variant for service-role / worker contexts,
-- which have no auth.uid() (mirrors is_sole_owner(p_user) in 0007, called from the
-- account Edge Fn). Edge Functions on the request path should prefer the auth.uid()
-- form via a caller-scoped client; this exists for the service path.
create or replace function public.has_permission_for(p_user uuid, ws uuid, perm text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  m           public.memberships;
  role_perms  text[];
  granted     text[];
  revoked     text[];
begin
  select * into m from public.memberships
   where workspace_id = ws and user_id = p_user and status = 'active';
  if m.user_id is null then return false; end if;
  if m.role = 'owner' then return true; end if;
  if m.role = 'client' and perm not like 'portal.%' then return false; end if;
  if m.role_id is not null then
    select permissions into role_perms from public.roles where id = m.role_id;
  else
    select permissions into role_perms
      from public.roles where is_built_in and base_role = m.role;
  end if;
  role_perms := coalesce(role_perms, '{}');
  granted := coalesce(
    (select array_agg(value) from jsonb_array_elements_text(m.permissions->'grant')), '{}');
  revoked := coalesce(
    (select array_agg(value) from jsonb_array_elements_text(m.permissions->'revoke')), '{}');
  if perm = any(revoked) then return false; end if;
  return perm = any(role_perms) or perm = any(granted);
end $$;
revoke all on function public.has_permission_for(uuid, uuid, text) from public;
grant execute on function public.has_permission_for(uuid, uuid, text) to service_role;

-- ── 5. set_member_role — admin+ changes a member's role (definer, re-checks) ──
-- Takes p_role_id (a built-in OR a custom role of THIS workspace). The trigger
-- derives memberships.role = base_role, so the RLS coarse tier follows automatically.
-- guard_last_owner (deferrable, 0007) still protects the zero-owner invariant, so
-- demoting the last owner raises at commit. Owner-tier assignment is refused here —
-- promotion to owner goes through transfer_ownership (M01) to keep that invariant in
-- one place.
create or replace function public.set_member_role(p_ws uuid, p_user uuid, p_role_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r   public.roles;
begin
  if uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not public.has_role(p_ws, 'admin') then
    raise exception 'only an admin may change member roles' using errcode = '42501';
  end if;
  select * into r from public.roles where id = p_role_id;
  if r.id is null then raise exception 'role not found' using errcode = 'P0002'; end if;
  -- role must be a built-in OR belong to THIS workspace (no cross-tenant role reuse)
  if r.workspace_id is not null and r.workspace_id <> p_ws then
    raise exception 'role belongs to another workspace' using errcode = '42501';
  end if;
  if r.base_role = 'owner' then
    raise exception 'use transfer_ownership to grant ownership' using errcode = '22023';
  end if;
  if not exists (select 1 from public.memberships
                 where workspace_id = p_ws and user_id = p_user and status = 'active') then
    raise exception 'target is not an active member' using errcode = 'P0002';
  end if;
  update public.memberships
     set role_id = p_role_id            -- trigger sets role := r.base_role
   where workspace_id = p_ws and user_id = p_user;
  -- M07 hook: write an audit_log role-change entry here when M07 lands (D-026).
end $$;
revoke all on function public.set_member_role(uuid, uuid, uuid) from public;
grant execute on function public.set_member_role(uuid, uuid, uuid) to authenticated;

-- ── 6. set_member_permissions — fine per-member overrides (admin+, definer) ───
create or replace function public.set_member_permissions(p_ws uuid, p_user uuid, p_overrides jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not public.has_role(p_ws, 'admin') then
    raise exception 'only an admin may set member permissions' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_overrides, '{}'::jsonb)) <> 'object' then
    raise exception 'overrides must be a json object {grant:[],revoke:[]}' using errcode = '22023';
  end if;
  update public.memberships set permissions = coalesce(p_overrides, '{}'::jsonb)
   where workspace_id = p_ws and user_id = p_user and status = 'active';
  -- M07 hook: audit_log override-change entry when M07 lands (D-026).
end $$;
revoke all on function public.set_member_permissions(uuid, uuid, jsonb) from public;
grant execute on function public.set_member_permissions(uuid, uuid, jsonb) to authenticated;

-- ── 7. delete_role — custom-role delete, blocked while still assigned ─────────
-- Belt (this friendly guard) + braces (the FK NO ACTION on memberships.role_id).
create or replace function public.delete_role(p_ws uuid, p_role_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not public.has_role(p_ws, 'admin') then
    raise exception 'only an admin may delete a role' using errcode = '42501';
  end if;
  if not exists (select 1 from public.roles
                 where id = p_role_id and workspace_id = p_ws and not is_built_in) then
    raise exception 'custom role not found in this workspace' using errcode = 'P0002';
  end if;
  select count(*) into n from public.memberships where role_id = p_role_id;
  if n > 0 then
    raise exception 'reassign % member(s) before deleting this role', n using errcode = '23503';
  end if;
  delete from public.roles where id = p_role_id and workspace_id = p_ws and not is_built_in;
end $$;
revoke all on function public.delete_role(uuid, uuid) from public;
grant execute on function public.delete_role(uuid, uuid) to authenticated;

-- ── 8. RLS on roles ──────────────────────────────────────────────────────────
-- SELECT: any member reads their workspace's custom roles + ALL built-ins (matrix UI).
-- INSERT/UPDATE/DELETE: admin+ AND workspace-scoped AND not a built-in AND base_role
-- <> owner. Built-in rows have workspace_id NULL, so NO write policy's check ever
-- matches them → they are immutable to every tenant. Custom-role writes are
-- workspace-scoped → no cross-tenant leak.
alter table public.roles enable row level security;

create policy roles_sel on public.roles for select
  using ( workspace_id is null or public.is_member(workspace_id) );

create policy roles_ins on public.roles for insert
  with check ( workspace_id is not null and not is_built_in
               and base_role <> 'owner' and public.has_role(workspace_id, 'admin') );

create policy roles_upd on public.roles for update
  using      ( workspace_id is not null and not is_built_in and public.has_role(workspace_id, 'admin') )
  with check ( workspace_id is not null and not is_built_in
               and base_role <> 'owner' and public.has_role(workspace_id, 'admin') );

create policy roles_del on public.roles for delete
  using ( workspace_id is not null and not is_built_in and public.has_role(workspace_id, 'admin') );

drop trigger if exists roles_set_updated_at on public.roles;
create trigger roles_set_updated_at before update on public.roles
  for each row execute function public.set_updated_at();
