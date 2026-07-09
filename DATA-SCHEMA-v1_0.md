# DATA-SCHEMA-v1_0.md
### AiMindShare.com — Canonical Supabase Schema
**Version 1.0 · 2026-07-02 · The single source of truth Claude Code diffs against.**

> The most important document in the project. Every table is a Supabase SQL migration. Every
> tenant table carries `workspace_id uuid not null` + an index, soft-delete where it matters, and
> the standard RLS policy (defined in `RLS-AND-SECURITY`). Seeded from **PRD §29**, upgraded to
> Supabase conventions, and extended with the foundation tables the starred modules need but that
> exist nowhere else.
>
> **This v1.0 defines the full foundation + core-ops layer as build-ready SQL, and captures every
> other domain from §29 as upgraded tables.** Later sessions add columns/tables via `str_replace`
> and a new migration, appending a `DECISIONS` note. Never edit a shipped migration; add a new one.

---

## 0 · Conventions (apply to every table)

- **PK:** `id uuid primary key default gen_random_uuid()`.
- **Tenant key:** `workspace_id uuid not null references public.workspaces(id) on delete cascade`,
  always with `create index on <t> (workspace_id);`.
- **Timestamps:** `created_at timestamptz not null default now()`, `updated_at timestamptz` (a
  trigger `set_updated_at()` bumps it — defined in migration `0000`).
- **Soft delete:** tables users can "delete" carry `deleted_at timestamptz`; queries filter
  `deleted_at is null`. Hard delete is reserved for GDPR erasure (M05) and cascades.
- **RLS:** every tenant table ends with `enable row level security` + the four standard policies
  from `RLS-AND-SECURITY` (`sel/ins/upd/del`). Shown once below, referenced thereafter as
  `-- + standard RLS (member read, role-gated write)`.
- **Money:** `numeric(12,2)`; **currency:** `char(3)` ISO-4217. **Never floats for money.**
- **JSON:** `jsonb`, never `json`.
- **Migrations** are numbered `NNNN_description.sql` and run in order. `0000` = extensions +
  helpers; `0001` = tenancy; then per domain.

---

## 1 · Migration 0000 — extensions & helpers

```sql
create extension if not exists pgcrypto;    -- gen_random_uuid()
create extension if not exists vector;       -- pgvector, agent RAG (M33)
create extension if not exists pg_cron;      -- recurring jobs
create extension if not exists pg_trgm;      -- fuzzy search / dup detection

-- updated_at trigger, attached to every table with an updated_at column
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- helper: is the calling user a member of this workspace? (used by RLS)
create or replace function public.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

-- helper: does the caller hold at least the given role in this workspace?
create or replace function public.has_role(ws uuid, min_role text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.status = 'active'
      and array_position(array['client','staff','manager','admin','owner'], m.role)
          >= array_position(array['client','staff','manager','admin','owner'], min_role)
  );
$$;
```

---

## 2 · Enum registry (single source; add here, never inline)

```sql
create type member_role     as enum ('owner','admin','manager','staff','client');
create type member_status   as enum ('active','invited','suspended');
create type plan_tier       as enum ('free','starter','pro','agency','enterprise');
create type job_status      as enum ('queued','running','done','failed','cancelled');
create type deal_status     as enum ('open','won','lost');
create type conv_channel    as enum ('email','sms','whatsapp','fb','ig','webchat','voice');
create type msg_direction   as enum ('inbound','outbound');
create type content_status  as enum ('draft','queued','generating','review','scheduled','published','failed');
create type social_platform as enum ('facebook','instagram','linkedin','x','tiktok','gbp','youtube','pinterest');
create type meter_kind      as enum ('sms','email','ai_tokens','enrichment','voice_minutes','seo_calls','video_render','image_gen');
create type consent_kind    as enum ('sms_optin','email_optin','cookie','gdpr_export','gdpr_erase');
create type notif_channel   as enum ('in_app','email','push');
```

---

## 3 · Tenancy (Migration 0001) — foundation, build first

```sql
-- users live in Supabase auth.users; this is the public profile mirror
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text, avatar_url text,
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  parent_workspace_id uuid references public.workspaces(id),  -- agency → sub-account
  name text not null, slug text unique not null,
  plan plan_tier not null default 'free',
  custom_domain text, branding jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz, deleted_at timestamptz
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'staff',
  status member_status not null default 'active',
  permissions jsonb not null default '{}',   -- per-module overrides (M02)
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index on public.memberships (workspace_id);
create index on public.memberships (user_id);
-- workspaces: RLS = member can read; owner/admin can write. memberships: see RLS doc.
```

> **The standard tenant-table RLS block, shown once:**
> ```sql
> alter table public.<t> enable row level security;
> create policy sel on public.<t> for select using (public.is_member(workspace_id));
> create policy ins on public.<t> for insert with check (public.has_role(workspace_id,'staff'));
> create policy upd on public.<t> for update using (public.has_role(workspace_id,'staff'));
> create policy del on public.<t> for delete using (public.has_role(workspace_id,'manager'));
> ```
> Every `-- + standard RLS` marker below means this exact block, with role thresholds tuned per
> table in `RLS-AND-SECURITY`.

---

## 3.1 · M00 Auth & Identity additions (Migration 0006)

> Supabase Auth (GoTrue) owns `auth.users`, OAuth identities, sessions, TOTP 2FA (`auth.mfa_*`),
> and one-time tokens (magic-link / reset / verify). Per **DECISIONS D-015** we do **not** mirror
> those into `public` — M00 adds only the profile auto-create trigger and an identity-scoped auth
> ledger.

```sql
-- Auto-create the public.profiles mirror whenever Supabase Auth inserts a user
-- (BUILD-SEQUENCE Session 1 "Accept when"). security definer; name/avatar come
-- from the signup metadata. on conflict keeps seed.sql idempotent.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name'),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Identity-scoped, append-only security ledger. NOT a tenant table (auth happens
-- before/independent of a workspace) — so no workspace_id. Distinct from M07's
-- workspace-scoped audit_log; M07 ingests these nightly (D-017). user_id nullable
-- so failed logins on an unknown email still record.
create table public.auth_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  type text not null,     -- login_success | login_failed | logout | password_changed
                          -- | twofa_enabled | twofa_disabled | session_revoked
                          -- | account_locked | email_changed | account_deleted
  ip_address text, user_agent text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.auth_events (user_id);
create index on public.auth_events (created_at);
-- RLS override: select = own rows only (user_id = auth.uid()); NO client
-- insert/update/delete. Writes go through log_auth_event() (security definer,
-- binds user_id = auth.uid()) or the service role. Append-only forever.

-- Client records its OWN success-path events; server paths (login_failed,
-- account_locked) are inserted by Edge Functions / an Auth Hook (service role).
create function public.log_auth_event(p_type text, p_metadata jsonb default '{}')
  returns uuid language plpgsql security definer set search_path = public;
```

---

## 3.2 · M01 Workspaces & Multi-Tenancy additions (Migration 0007)

> M01 adds the *product* layer on top of the 0001 tenancy wall. **Agency = a
> top-level `workspaces` row** (`parent_workspace_id is null`); a **sub-account =**
> a child row. There is **no separate `Agency` table** — the PRD's Prisma
> `Agency` / `WorkspaceUser` models map onto `workspaces` + `memberships`
> (DECISIONS **D-019**). Agency reach into a sub-account requires an **explicit
> membership**, created at provisioning (RLS-AND-SECURITY §1).

```sql
-- workspaces gains the settings surface (ADD COLUMN — 0001 is never rewritten):
alter table public.workspaces
  add niche text,
  add timezone text not null default 'America/Toronto',
  add currency char(3) not null default 'USD',
  add locale text not null default 'en',
  add status ws_status not null default 'active',   -- enum: active | archived
  add settings jsonb not null default '{}',
  add archived_at timestamptz;                       -- archive = soft, 90-day restore
-- (branding jsonb + deleted_at already exist from 0001; deleted_at reserved for M44.)

-- workspace_invitations — pending email invites (tenant table; stores only a hash).
create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role member_role not null default 'staff',
  token_hash text not null unique,        -- sha256(raw token); raw token lives only in the invite link
  status text not null default 'pending', -- pending | accepted | revoked | expired
  invited_by uuid references auth.users(id),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
-- RLS: select/insert/update/delete = has_role(workspace_id,'admin') (mirrors memberships).
-- The invited user never selects the row — they redeem it via accept_invitation().

-- SECURITY DEFINER RPCs (the controlled seam that creates a workspace's FIRST
-- membership — the one case RLS can't allow; each binds identity to auth.uid()):
--   create_workspace(name,niche,tz,currency,locale,parent) → workspaces  -- +owner membership +provision job
--   accept_invitation(token_raw) → uuid            -- redeem an invite, create membership
--   transfer_ownership(workspace, to_user)         -- owner → admin, target → owner
--   archive_workspace(ws) / restore_workspace(ws)  -- owner-only soft state
--   leave_workspace(ws)                            -- self-remove; blocked for a sole owner
--   is_sole_owner(user) → bool                     -- guard for account-delete + leave

-- guard_last_owner — DEFERRABLE constraint trigger on memberships: a workspace may
-- never be left with zero active owners (protects remove/demote/transfer at commit).
```

**Enqueued job:** `create_workspace` inserts a `queued` `workspace.provision` job.
Its worker seeds `workspaces.settings` defaults (notification prefs + sender
placeholder). The PRD's default **pipeline / calendar / 5 tags** are **deferred to
M09 / M11 / M14** (their tables don't exist yet — Constitution Law 9), see
**D-020** and `JOBS-AND-WORKERS-SPEC §6`.

---

## 3.3 · M02 Roles & Permissions additions (Migration 0008)

> M02 adds the **fine-grained** layer on top of the coarse `member_role` enum wall.
> The enum stays the tier every RLS policy + M01 RPC + `guard_last_owner` compares
> (DECISIONS **D-023**); a `roles` table + nullable `memberships.role_id` carry the
> `module.action` grants that Edge Functions read via `has_permission()`. **RLS
> enforces the coarse matrix; Edge Functions enforce the fine overrides**
> (RLS-AND-SECURITY §2). PRD_M02's Prisma `Role` + `WorkspaceUser.roleId` FK map onto
> this — the wall is **not** rebuilt.

```sql
-- roles — built-in global roles (workspace_id null, immutable) + per-workspace custom roles.
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,   -- NULL = built-in
  name text not null,
  base_role member_role not null,        -- coarse tier this role maps to (drives RLS)
  is_built_in boolean not null default false,
  permissions text[] not null default '{}',   -- module.action grants (registry vocabulary)
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint roles_custom_not_owner check ( is_built_in or base_role <> 'owner' ),
  constraint roles_builtin_global   check ( is_built_in = (workspace_id is null) ),
  unique (workspace_id, name)
);
-- 5 built-in roles seeded (fixed UUIDs): owner (all) · admin (all but billing/
-- workspace.delete/whitelabel) · manager (full modules, no team/settings) ·
-- staff (view/create/edit, NO delete/export) · client (portal.* only).

-- memberships gains role_id (NULL = the built-in matching the role enum). NO `on delete`
-- clause = NO ACTION (RESTRICT-equivalent): a role in use can't be dropped.
alter table public.memberships add role_id uuid references public.roles(id);

-- sync_membership_role — BEFORE INSERT/UPDATE OF role_id trigger: forces
-- memberships.role := roles.base_role, so the coarse RLS tier never drifts (D-024).

-- has_permission(ws,perm) → bool  (SECURITY DEFINER, reads auth.uid()):
--   owner ⇒ true · client ⇒ portal.* ceiling · else (role_perms ∪ grant) − revoke,
--   revoke wins; overrides live in memberships.permissions {grant:[],revoke:[]} (D-025).
-- has_permission_for(user,ws,perm) — explicit-user variant for the service/worker path.

-- RPCs (SECURITY DEFINER, admin+): set_member_role(ws,user,role_id) [refuses owner
--   tier → transfer_ownership; guard_last_owner still holds] · set_member_permissions(
--   ws,user,overrides) · delete_role(ws,role_id) [blocked while assigned].
-- Custom-role create/update go through RLS table writes, not an RPC.

-- RLS on roles: select = workspace_id is null OR is_member(workspace_id);
--   insert/update/delete = workspace-scoped AND not built-in AND base_role<>owner AND
--   has_role(workspace_id,'admin'). Built-in rows (null workspace_id) match no write
--   policy ⇒ immutable; custom writes are tenant-scoped ⇒ no cross-tenant leak.
```

**Deferred:** role/permission-change **auditing → M07** (`audit_log` isn't built yet;
the RPCs carry a documented `M07 hook` and emit nothing today — **D-026**, mirrors
D-016/D-022). **Enforcement reference:** the `permission-check` Edge Function is the
canonical `requirePermission()` (auth → caller-scoped client → `has_permission`);
future modules copy it. The registry (`_shared/permissions.ts`) is the single source
of truth; modules append `module.action` strings as they land.

---

## 4 · Control plane — `jobs` (Migration 0002) — foundation, build first

```sql
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type text not null,                 -- 'blog.generate', 'rank.check', 'social.post', ...
  payload jsonb not null default '{}',
  status job_status not null default 'queued',
  priority int not null default 0,
  attempts int not null default 0, max_attempts int not null default 3,
  run_after timestamptz not null default now(),   -- backoff / scheduling
  idempotency_key text,               -- dedupe; unique per (workspace, type, key)
  result jsonb, error text,
  locked_by text, locked_at timestamptz,          -- worker claim
  created_at timestamptz not null default now(),
  updated_at timestamptz, done_at timestamptz
);
create index on public.jobs (workspace_id);
create index on public.jobs (status, run_after);
create unique index on public.jobs (workspace_id, type, idempotency_key)
  where idempotency_key is not null;
-- RLS: members read their own jobs; only 'queued' may be inserted client-side (see JOBS spec).
```

Contract details (who writes which status, retry/backoff, worker claim) live in
`JOBS-AND-WORKERS-SPEC`. **The browser inserts `queued` rows only.**

---

## 5 · Usage meters & billing — M03 (Migration 0003) — foundation, build first

*No schema exists for this in §29. Defined here; details in `USAGE-METERING-AND-PLANS`.*

```sql
create table public.plans (               -- platform-level plan catalog (global, no workspace_id)
  id uuid primary key default gen_random_uuid(),
  tier plan_tier not null, name text not null,
  monthly_price numeric(12,2), currency char(3) default 'USD',
  feature_gates jsonb not null default '{}',   -- { "m34_voice": false, "seats": 5, ... }
  included jsonb not null default '{}'          -- { "sms": 500, "ai_tokens": 100000, ... }
);

create table public.subscriptions_platform (   -- a workspace's subscription to the platform
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan_id uuid references public.plans(id),
  stripe_subscription_id text, status text not null default 'active',
  current_period_end timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz
);
create index on public.subscriptions_platform (workspace_id);

create table public.usage_meters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind meter_kind not null,
  period date not null,                 -- month bucket (first of month)
  quantity numeric(14,4) not null default 0,
  unique (workspace_id, kind, period)
);
create index on public.usage_meters (workspace_id);

create table public.usage_events (       -- append-only ledger; sums into usage_meters
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind meter_kind not null, quantity numeric(14,4) not null,
  unit_cost numeric(12,6), source text,     -- 'twilio','openai','dataforseo',...
  ref_id uuid, created_at timestamptz not null default now()
);
create index on public.usage_events (workspace_id, kind, created_at);

create table public.credit_wallets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind meter_kind not null, balance numeric(14,4) not null default 0,
  unique (workspace_id, kind)
);

create table public.rebilling_rules (    -- markup per meter, per workspace (agency sets)
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind meter_kind not null, markup_pct numeric(6,2) not null default 0,
  unique (workspace_id, kind)
);
-- + standard RLS on all workspace tables above; plans is global/admin-only.
```

**Increment point:** every metered Edge Function/worker writes a `usage_events` row *and* upserts
`usage_meters` in the same transaction as the provider call (Constitution Law 4).

---

## 6 · Notifications — M04 (Migration 0004) · Compliance — M05 · Media — M06 · Audit — M07

> **M04 implemented in `0011_m04_notifications.sql` (Session 6).** The two tables below ship VERBATIM
> to this shape. That migration *also* **creates the `notif_channel` enum** (`'in_app'|'email'|'push'`)
> — §6 referenced `notif_channel[]` but `0000` never defined it — plus RLS (notifications: self/broadcast
> SELECT + self-only mark-read UPDATE, append-only like a ledger; notification_prefs: self-owned CRUD),
> the `notify(workspace, targets, type, title, body, data)` SECURITY DEFINER emit RPC (role/user target
> resolution, preference respect, 5-min dedupe on `user+type+data->>'link'`), the `supabase_realtime`
> publication for the bell (D-029), and the `m04-digest-enqueue` `pg_cron` job (D-030). **Deep links live
> in `data->>'link'`; email delivery + digest sending are stubbed until D-011.** (Filed 0011, not 0009:
> 0009/0010 were taken by M03/M05/M41 in parallel; M04 has no deps on them.)

```sql
-- M04 Notifications ------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id),   -- null = workspace-wide
  type text not null, title text, body text, data jsonb default '{}',
  channels notif_channel[] not null default '{in_app}',
  read_at timestamptz, created_at timestamptz not null default now()
);
create index on public.notifications (workspace_id, user_id, read_at);

create table public.notification_prefs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  prefs jsonb not null default '{}', digest text default 'off',  -- off|daily|weekly
  unique (workspace_id, user_id)
);

-- M05 Compliance & Consent -----------------------------------------------------
-- > **Built in Session 7 — `0010_m05_compliance.sql`.** The three tables below ship
-- > verbatim, PLUS documented extensions (DECISIONS D-036…D-041): the `consent_kind`
-- > enum gains `whatsapp_optin`/`voice_optin` (D-036); `a2p_registrations` gains
-- > `rejection_reason`/`business_info`/`updated_at` + `unique(workspace_id)` (D-038);
-- > `gdpr_requests` gains `request_type`/`requested_email`/`due_at`/`export_url`/`notes`
-- > (D-039). RLS: `consent_records` is an append-only ledger (insert = any member,
-- > **no** update/delete; select staff+). `a2p_registrations` staff-read / admin-write.
-- > `gdpr_requests` staff-read, staff-insert (pending-only), admin advance/delete.
-- > `contact_id` FK still deferred to M09. `gdpr.export`/`gdpr.erase` do the work
-- > (worker). Cross-tenant + append-only + role-matrix proven in `m05probe.mjs` (21/21).
create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid,                       -- FK added after contacts exists
  kind consent_kind not null, granted boolean not null,
  source text, ip_hash text, evidence jsonb default '{}',
  created_at timestamptz not null default now()
);
create index on public.consent_records (workspace_id, contact_id);

create table public.a2p_registrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_status text, campaign_status text, provider_ref text,
  submitted_at timestamptz, approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.gdpr_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid, kind consent_kind not null,  -- gdpr_export | gdpr_erase
  status text not null default 'pending', completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- M06 Media Library (Supabase Storage; this indexes the objects) ---------------
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  folder_id uuid, bucket text not null default 'media', storage_path text not null,
  kind text, mime text, bytes bigint, width int, height int,
  ai_tags text[], used_in jsonb default '[]',   -- [{module, ref_id}]
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), deleted_at timestamptz
);
create index on public.media_assets (workspace_id);
create table public.media_folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_id uuid references public.media_folders(id), name text not null
);

-- M07 Audit Logs & Settings ----------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id), action text not null,
  entity text, entity_id uuid, metadata jsonb default '{}',
  ip_hash text, created_at timestamptz not null default now()
);
create index on public.audit_log (workspace_id, created_at);

create table public.workspace_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  timezone text default 'UTC', currency char(3) default 'USD',
  locale text default 'en', settings jsonb not null default '{}'
);
-- + standard RLS on all. audit_log: insert allowed to all members, update/delete to none.
```

---

## 7 · CRM — M09 (from §29, upgraded)

```sql
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null, website text, industry text, size text,
  enrichment jsonb default '{}',        -- M10 fills this
  created_at timestamptz not null default now(), updated_at timestamptz, deleted_at timestamptz
);
create index on public.companies (workspace_id);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  first_name text, last_name text, email text, phone text,
  source text, utm_source text, utm_medium text, utm_campaign text,
  lead_score int default 0, assigned_to uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz, deleted_at timestamptz
);
create index on public.contacts (workspace_id);
create index on public.contacts (workspace_id, email);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null, color text, unique (workspace_id, name)
);
create table public.contact_tags (
  contact_id uuid references public.contacts(id) on delete cascade,
  tag_id uuid references public.tags(id) on delete cascade,
  primary key (contact_id, tag_id)
);
create table public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  field_name text not null, field_type text not null, options jsonb default '[]'
);
create table public.contact_custom_values (
  contact_id uuid references public.contacts(id) on delete cascade,
  field_id uuid references public.custom_fields(id) on delete cascade,
  value text, primary key (contact_id, field_id)
);
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  type text not null, description text, metadata jsonb default '{}',
  created_at timestamptz not null default now()
);
create index on public.activity_log (workspace_id, contact_id, created_at);
create table public.contact_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  user_id uuid references auth.users(id), content text,
  created_at timestamptz not null default now()
);
create table public.contact_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  assigned_to uuid references auth.users(id), title text, due_date date,
  status text default 'open'
);
-- add FK now that contacts exists:
alter table public.consent_records add constraint consent_contact_fk
  foreign key (contact_id) references public.contacts(id) on delete cascade;
-- + standard RLS on all.
```

> **Implementation note (Session 8 · M09 · migration `0013_m09_crm.sql`).** Shipped as above with
> logged corrections/extensions (DECISIONS D-042…D-048): (1) `custom_fields.workspace_id` FK corrected
> to `workspaces(id)` (canonical self-reference was a typo); (2) `workspace_id not null` added to
> `contact_tags` and `contact_custom_values` for direct RLS; (3) `activity_log` is **append-only**
> (no update/delete) + gains `actor_id`, is in the `supabase_realtime` publication, and is written via
> the `log_activity()` RPC (the platform `timeline.add()`); (4) new tables `smart_lists`
> (`definition` jsonb AND/OR grammar → `smart_list_eval()`), `contact_imports` (CSV `contact.import`
> job tracking), `contact_duplicates` (dedupe pairs from `dedupe_scan()`); (5) pg_trgm GIN indexes on
> `contacts` (email/name/phone) for fuzzy search + dedup; (6) `merge_contacts()` manager+ RPC. The retro
> `consent_records.contact_id` FK is wired here as §6 anticipated. Contact `status`/`lifecycle_stage` and
> the lead-scoring engine are **not** in this slice (D-047); `lead_score` ships as a plain column.

---

## 8 · Pipeline — M11 · Conversations — M12 (from §29, upgraded)

```sql
create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null, created_at timestamptz not null default now()
);
create index on public.pipelines (workspace_id);
create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null, order_index int not null, close_probability numeric(5,2), color text
);
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pipeline_id uuid references public.pipelines(id) on delete cascade,
  stage_id uuid references public.pipeline_stages(id),
  contact_id uuid references public.contacts(id) on delete set null,
  title text, value numeric(12,2), currency char(3) default 'USD',
  assigned_to uuid references auth.users(id), expected_close_date date,
  status deal_status not null default 'open', lost_reason text, won_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz
);
create index on public.deals (workspace_id, pipeline_id, stage_id);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  channel conv_channel not null, status text default 'open',
  assigned_to uuid references auth.users(id), last_message_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.conversations (workspace_id, last_message_at desc);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction msg_direction not null, channel conv_channel not null,
  content text, media_url text, sender_id uuid, is_internal_note boolean default false,
  created_at timestamptz not null default now()
);
create index on public.messages (workspace_id, conversation_id, created_at);
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type conv_channel not null, config jsonb default '{}',  -- NON-secret; creds live in Vault
  is_active boolean default true
);
create table public.canned_responses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  shortcut text, title text, content text
);
-- Realtime: enable on messages + conversations (Supabase Realtime replaces Pusher).
-- + standard RLS on all.
```

> **Implementation note (Session 9 · M11 · migration `0014_m11_pipeline.sql`).** The Pipeline half of §8
> shipped as above (`pipelines`, `pipeline_stages`, `deals`) plus logged extensions (DECISIONS D-049…D-052):
> (1) the `deal_status` enum — specced here but never landed in `0000` — is created in `0014` (idempotent);
> (2) sub-resource tables `deal_notes`, `deal_files` (`asset_id` → M06, no FK yet), append-only
> `deal_value_history` (trigger-written, PRD DealValueHistory), and `pipeline_targets` (PRD PipelineTarget);
> (3) `deals` gains `stage_entered_at` (days-in-stage badge) + a `lost_reason` CHECK; (4) config tables
> (pipelines/stages/targets) are `manager+`, deals use the standard template; (5) stage moves go through
> `move_deal_stage()`/`bulk_move_stage()` which write `activity_log` (D-050), plus `close_deal()` and the
> weighted `pipeline_forecast()`. `deals` is in the `supabase_realtime` publication. No new job type or cron.
> Conversations/messages (M12) are a separate session. Proven in `m11probe.mjs` (45/45, PGlite).

> **Implementation note (Session 10 · M12 · migration `0015_m12_inbox.sql`).** The Conversations half of §8
> shipped as above (`conversations`, `messages`, `channels`, `canned_responses`) plus logged additions
> (DECISIONS D-053…D-059): (1) the `conv_channel` + `msg_direction` enums — specced in §1 but never landed in
> `0000` — are created in `0015` (idempotent, D-058); (2) `conversations` gains a status CHECK
> (`open|pending|resolved|spam`), `unread_count`, `last_channel`, `ai_mode` (D-053); (3) `messages` gains
> `status` (`queued|sent|delivered|failed`), `ai_generated`, `external_id` (provider MessageSid → callbacks +
> webhook idempotency), `mentions uuid[]`, and a generated `search_tsv` tsvector + GIN (D-054); (4) `channels`
> gains `label`/`external_ref`/`updated_at`, `canned_responses` gains `created_by`/`updated_at`; (5) RLS is the
> §3 template except **messages INSERT = staff+ AND `is_internal_note`** (the browser posts notes only — all
> channel traffic is a service-role write, D-055) and **channels write = admin+** (D-056). RPCs:
> `upsert_conversation`, `ingest_inbound_message` (service-role inbound pipeline: contact-resolve → thread →
> message), `clear_unread`, `search_inbox`. The message-insert trigger maintains `last_message_at`/
> `unread_count`, writes the M09 `activity_log` timeline, and fires M04 `notify()` on note @mentions.
> `conversations` + `messages` are in the `supabase_realtime` publication. **No new job type or cron** (outbound
> SMS is a synchronous Edge Function send). Only SMS is wired live — email defers with D-011, WhatsApp/FB/IG +
> webchat + AI auto-reply defer to their provider weeks (D-059). Proven in `m12probe.mjs` (28/28, PGlite).

---

## 9 · Remaining §29 domains (upgraded to Supabase conventions)

These come straight from PRD §29. When each module's session runs, add its migration using the
column list below plus the conventions in §0. **Every one gets `workspace_id uuid not null` +
index + standard RLS**, even where §29 omitted it.

- **Automation (M13):** `workflows` (name, trigger_type, trigger_config jsonb, nodes jsonb,
  edges jsonb, is_active), `workflow_executions` (workflow_id, contact_id, status, started_at,
  completed_at), `workflow_execution_steps` (execution_id, node_id, executed_at, result jsonb,
  error). *Drawflow* produces `nodes/edges` JSON. Execution runs as `jobs`.
  > **Implementation note (Session 11, `0016_m13_automations.sql`):** shipped as above **plus**
  > `workflows.reentry_rule` (`allow`/`once`/`once_per_days:N`) + `workflows.version` + `workflows.stats`,
  > a **`workflow_versions`** snapshot table (auto-written by trigger; running executions pin their
  > version so a live edit can't corrupt them — AC-3), `workflow_executions.workflow_version` +
  > `current_node_id` + `is_test` + `trigger_payload`, `workflow_execution_steps.node_type`/`status`,
  > and a **global `workflow_templates`** seed table (15 built-ins, `workspace_id null`, global read).
  > Two enums (`workflow_exec_status`, `workflow_step_status`) created here. The bus is the SECURITY
  > DEFINER `emit_trigger(ws,type,payload)` (D-062) fed by AFTER triggers on `contacts`/`contact_tags`/
  > `deals`/`messages`; `automation.execute` is the walker job; RLS = staff read / manager+ write on
  > config, service-role-written executions/steps (client ceiling). See D-060…D-063.
- **Calendar (M14):** `calendars` (name, type, slug, settings jsonb), `calendar_availability`
  (calendar_id, day_of_week, start_time, end_time), `appointments` (calendar_id, contact_id,
  assigned_user_id, start_time, end_time, status, payment_intent_id), `appointment_reminders`
  (appointment_id, channel, scheduled_at, sent_at → `jobs`+`pg_cron`).
  > **Implementation note (Session 12, `0017_m14_calendar.sql`):** shipped as above **plus** a
  > `calendar_blocks` (date-specific blackouts) and `appointment_questions` table (PRD §3), and
  > columns `calendars.{buffer_min,min_notice_min,max_per_day,capacity,timezone,requires_payment,
  > round_robin_user_ids uuid[],color,is_active}`, `appointments.{timezone,answers jsonb,
  > google_event_id,reschedule_token,cancel_token,token_expires_at}`, `appointment_reminders.job_id`.
  > Two enums (`calendar_type` = one_on_one/round_robin/group/class, `appt_status` =
  > confirmed/rescheduled/cancelled/completed/no_show) created here. Engine: SECURITY DEFINER
  > `compute_slots(cal,date,tz)` (UTC internal, tz-rendered, DST-correct) + `pick_round_robin_user`;
  > `book_appointment` thin-wrapper + an AFTER INSERT trigger that auto-tags + writes the M09 timeline
  > + queues reminder rows + fires `emit_trigger('appointment.booked')`; lifecycle RPCs
  > `set_appointment_status`/`reschedule_appointment`/`cancel_appointment` (single-purpose rotating
  > tokens); cron `enqueue_due_reminders()` → `appointment.remind` jobs. RLS = staff+ read, manager+
  > config, staff+ appts / manager+ delete, reminders system-written. `payment_intent_id` is a M28
  > scaffold (gated off). See D-064…D-069.
- **Campaigns (M16):** `email_campaigns` (name, type, subject, body_html, from_name, from_email,
  status, scheduled_at, sent_at), `campaign_stats` (campaign_id, sent, delivered, opened, clicked,
  bounced, unsubscribed). Sends run as `jobs`; each send increments `email`/`sms` meters.
- **Forms (M15):** *(no §29 table)* add `forms` (name, schema jsonb, routing jsonb, spam jsonb),
  `form_submissions` (form_id, contact_id, data jsonb, created_at). Submission → contact create.
- **Website builder (M19/M20):** `sites` (name, domain, ssl_status), `pages` (site_id, title,
  slug, meta jsonb, page_json, status, published_at), `funnels` (name), `funnel_steps` (funnel_id,
  page_id, step_order, step_type), `site_templates` (global). *GrapeJS* writes `page_json`.
  - **M19 logged extensions** (migration `0022_m19_sites.sql`): `sites` also has `subdomain`
    (always-on staging host), `status` (`site_status`), `favicon_url`, `brand`/`nav`/`seo_defaults`
    jsonb; `pages` also has `is_home`, `status` (`page_status`), `render_html`/`render_css` (the
    published snapshot served by the renderer — `page_json` stays the GrapeJS project data, **D-101**),
    `sort`. Added tables: `page_versions` (publish snapshots, restore-last-10, append-only),
    `site_domains` (domain/status/ssl_status/verification_token — multi-domain + DNS verify; live SSL
    is a scaffold pending OPEN D-009, **D-104**), `visitor_sessions` (visitor_id, contact_id, pages/utm
    jsonb — first-party pixel, service-role-written → `record_page_visit` writes the M09 timeline +
    fires `emit_trigger('page.visited')`, **D-106**). RPCs `publish_page`/`revert_page`/`duplicate_page`.
    Public renderer = the `site-render` Edge Fn, not Node SSR (**D-100**). RLS = operator-ceiling (staff+
    read/edit, manager+ publish/delete, domains admin+, published pages not anon-readable, **D-105**).
    Decisions **D-100…D-106**.
  - **M19 v2 logged extensions** (migration `0028_m19_sites_v2.sql`, Session 24, additive-only): `sites`
    also has `style_preset` (`minimal|bold|elegant|islamic` → renderer token overrides, **D-150**),
    `maintenance_mode`, `not_found_html`, `preview_token` (staging `?pt=` draft preview, **D-149**),
    `language`; `pages.language`; `page_versions` gains `kind` (`publish|save`) + `label` with per-kind
    prune-to-10 + the `save_page_version()` staff+ RPC (**D-147**); `site_templates` gains
    `description`/`language`/`conversion_type`/`render_html`/`render_css` + 6 seeded global niche rows —
    the gallery is data-driven, workspace rows are full-content "save as template" snapshots (**D-151**).
    Added table: `site_publish_log` (kind `page.publish|page.revert|page.save|domain.verify|ssl.provision`,
    status, detail jsonb, actor_id — append-only, system-written, staff+ read, **D-148**).
  - **M20 logged extensions** (migration `0023_m20_funnels.sql`): `funnels` also has `status`,
    `settings` jsonb (pipeline/stage + `abandon_hours`), `site_id`. Added tables: `funnel_splits`
    (step_id, variant_page_id, split %, goal, status, winner, promoted_at — A/B on a step, **D-107**)
    and `funnel_visits` (funnel_id, step_id, visitor_id, contact_id, variant, event
    `view|optin|purchase|abandoned` — per-step stream feeding the waterfall + A/B stats,
    service-role-written, **D-108**). Orders reuse M28 `invoices` (`source_type='order'`) — no orders
    table (**D-110**). RLS = M19 operator-ceiling (staff+ read, **D-109**).
- **SEO (M21):** `keyword_lists`, `keywords` (list_id, keyword, volume, cpc, difficulty, intent),
  `tracked_keywords` (keyword, domain, country), `keyword_rankings` (tracked_keyword_id, position,
  url, date), `seo_audits` (domain, results jsonb, score). Rank checks + crawls run as `jobs`;
  each hits the `seo_calls` meter.
  **Built (Session 21, migration `0026_m21_seo.sql`).** As-built adds three logged-extension tables +
  per-table nuance: `tracked_keywords.competitor_domains text[]` + `is_active`; `keyword_rankings`
  gains `is_featured_snippet` + `competitor_positions jsonb` + `checked_on date` (service-role/worker
  write only); `seo_audits` gains `status`, `pages_crawled`, and a `cursor jsonb` (resumable-crawl
  frontier/visited, **D-131**); **`seo_keyword_cache`** (unique(ws,keyword,country), 30-day TTL,
  workspace-scoped, **D-129**); **`seo_audit_issues`** (audit_id, type, severity, url, detail —
  worker-written); **`content_queue`** created here as the M22/S23 forward-stub (**D-134**). RLS =
  operator ceiling (staff+ read, client reads nothing, **D-130**). Server-truth RPCs: `seo_cache_get/put`,
  `send_to_content_queue`, `record_keyword_ranking` (delta + `rank.change_major` at |Δ|≥5, **D-133**),
  `rank_history`, `audit_score`, `enqueue_due_rank_checks`, `enqueue_weekly_rank_reports`. Jobs
  `rank.check`/`rank.report`/`seo.audit.crawl`; crons `seo-rank-check-daily`/`seo-rank-report-weekly`.
- **Blog/CMS (M22):** `blog_articles` (site_id, keyword, title, slug, content_html, meta_title,
  meta_desc, featured_image_url, schema jsonb, seo_score, readability_score, word_count, status,
  published_at), `content_schedules`, `content_queue` (keyword, priority, status, article_id).
  Generation runs on the **real worker**, not an Edge Function (timeout).
  - **M22 manual slice — built** (`0025_m22_content.sql`, Session 22): `article_status` enum
    (`draft|in_review|scheduled|published|archived`); `blog_articles` as above **plus logged extensions**
    `category_id`/`author_id` FKs, `tags text[]`, `scheduled_at`, `reject_feedback`, `embedding vector(1536)`
    (nullable scaffold, no ivfflat until S23 — **D-124**), `updated_at`; `article_categories`
    (site_id, name, slug — `unique(site_id, slug)`); `article_authors` (user_id byline **or** pen name,
    name, bio, avatar_url — **D-123**); `article_revisions` (article_id, version_no, content_html,
    meta jsonb — append-only, definer-written, prune-to-20). **RLS = operator-ceiling** (staff read/write,
    manager delete/publish/approve, client ceiling — mirrors M19 D-089/D-105). Publish/schedule/review are
    SECURITY DEFINER RPCs (`publish_article`, `schedule_article`, `submit_for_review`, `approve_article`,
    `reject_article`, `save/restore_article_revision`, `publish_due_articles`); `_m22_publish` builds
    Article JSON-LD server-side + fires `article.published` (**D-126**). `m22-scheduled-publish` `pg_cron`
    flips due scheduled rows inline (**D-127**). Public read is the `blog-render` Edge Fn (**D-121**).
  - **Deferred to M22-auto (Session 23):** `content_queue` + `content_schedules` (keyword rows, frequency,
    scheduler top-up), the `blog.generate` worker chain, and per-article metering (**D-122/D-125**).
- **Social (M23/M24):** `social_accounts` (platform, account_name — *tokens go to Vault, not this
  table*), `social_posts` (platform, social_account_id, content, media_urls jsonb, scheduled_at,
  published_at, status, analytics jsonb), `pinterest_pins`, `pinterest_boards`. Posting via
  `pg_cron` + `jobs`.
- **Affiliate (M29):** `affiliate_links`, `link_clicks` (link_id, ip_hash, country, device_type,
  referrer_url), `affiliate_networks` (*creds → Vault*), `affiliate_earnings`, `affiliate_sites`.
- **Payments (M28):** `invoices` (contact_id, number, line_items jsonb, subtotal, tax, total,
  currency, status, due_date, paid_at, stripe_payment_intent_id), `subscriptions` (contact_id,
  stripe_sub_id, plan_name, amount, currency, status, next_billing_date). Stripe webhooks →
  Edge Function with signature verification.
- **AI agents (M33):** `ai_agents` (name, avatar_url, role, system_prompt, personality jsonb,
  is_active), `agent_knowledge` (agent_id, source_type, content_chunk, `embedding vector(1536)`),
  `agent_conversations` (agent_id, contact_id, channel, messages jsonb, lead_captured). RAG via
  pgvector; add an ivfflat index on `embedding`.
- **Creative (M35):** `brand_kits`, `creative_assets` (type, title, image_url, prompt_used,
  template_id). Image gen increments `image_gen`.
- **Marketplace (M39):** `marketplace_items` (seller_workspace_id, type, name, description,
  preview_url, price, category, niche, install_count, rating_avg, status), `marketplace_purchases`
  (buyer_workspace_id, item_id, amount_paid, installed_at), `marketplace_reviews`.

---

## 10 · Starred-module tables with no §29 home (add at their session)

Defined here as canonical column lists so Claude Code doesn't invent them ad-hoc. Each gets
`workspace_id not null` + index + standard RLS.

- **M10 Enrichment/Intent:** `enrichment_jobs` (contact_id/company_id, provider, status → `jobs`),
  `visitor_sessions` (anon company match, pages jsonb, intent_score, last_seen).
- **M17 Proposals/Contracts:** `documents` (contact_id, type, template_id, content jsonb, status,
  expires_at, viewed_events jsonb), `document_signers` (document_id, name, email, signed_at,
  ip_hash, order_index), `document_templates`.
- **M18 Projects/Team Ops:** `projects` (client_workspace_id, name, service_type, status),
  `project_tasks` (project_id, assignee, title, status, due_date, order_index — *SortableJS*),
  `time_entries` (task_id, user_id, minutes, note, logged_at).
- **M26 Local SEO:** `gbp_locations`, `gbp_posts` (→`pg_cron`), `citations`, `nap_checks`,
  `local_rankings`.
- **M27 Ads:** `ad_accounts` (*creds → Vault*), `ad_campaigns_report`, `ad_attribution`
  (utm → contact → deal), `ad_spend_daily`.
- **M30 Reputation:** `review_requests` (→`jobs`), `reviews` (source, rating, text, sentiment),
  `review_widgets`.
- **M31 Memberships/Courses:** `courses`, `course_sections`, `lessons`, `enrollments`,
  `lesson_progress`, `certificates`, `course_communities`.
- **M32 Conversational Commerce:** `products`, `chat_carts`, `chat_orders`.
- **M34 Voice Agents:** `voice_agents`, `voice_calls` (transcript, sentiment, recording_url,
  minutes → `voice_minutes` meter). *Infra deferred — D-013.*
- **M36 Insights/Churn:** `workspace_health` (score, signals jsonb, computed_at),
  `churn_predictions`, `insight_digests`. Computed by scheduled `jobs`.
- **M37 Client Portal:** reuses tenant tables; `portal_access` (contact_id ↔ portal login),
  `portal_approvals` (entity, entity_id, status). Client role RLS is stricter — see `RLS` doc.
- **M38 Referral Manager:** `referral_programs`, `referral_links`, `referral_commissions`,
  `payouts` (Stripe Connect).
- **M41 Integrations Hub:** `integrations` (provider, status, health, `-- creds in Vault, ref only`),
  `webhooks_in`, `webhooks_out`, `api_keys` (hashed), `api_rate_limits`.
  **Built in Session 5 — `integrations` only (Migration `0010_m41_integrations.sql`).** Columns as
  shipped: `id`, `workspace_id` (**NULLABLE** — null = platform default, set = per-workspace override,
  D-032), `provider` (registry key), `auth_type` (`api_key|oauth2|basic`), `scope` (`workspace|platform`,
  CHECK `scope='platform' iff workspace_id null`), `status` (new enum `integration_status =
  connected|needs_reauth|error|disconnected`), `vault_secret_name` (**Vault reference only** — never a
  secret, D-031), `config jsonb` (non-secret), `token_expires_at`, `last_health_check`, `last_error`,
  `connected_by`, timestamps. **Two partial unique indexes** — `(workspace_id, provider) where
  workspace_id is not null` + `(provider) where workspace_id is null` — give at most one override + one
  default per provider (the `resolveCredential` order-by-nulls-last backbone). RLS: **SELECT** admin+ /
  platform-admin (new `is_platform_admin()` helper), **no write policy** (service-role only, D-033).
  Hourly `pg_cron` enqueues `integration.health_check`. `webhooks_*` / `api_keys` / `api_rate_limits`
  are **deferred to Phase 7** (Session 42).
- **M42 White-Label:** `white_label_configs` (domain, branding, plan_overrides), `agency_plans`.
- **M43 Mobile Field App:** reuses CRM/pipeline/calendar/payments; add `field_captures`
  (offline queue), `voice_notes` (transcript).
- **M44 Admin/Platform Ops:** global tables (no `workspace_id`, admin-only RLS): `feature_flags`,
  `impersonation_log`, `system_health`. Job/queue monitoring reads `public.jobs`.

---

## 11 · FK map (high level)

`auth.users` → `profiles`, `workspaces.owner_id`, `memberships.user_id`, all `assigned_to`.
`workspaces` → **everything** (`workspace_id`, cascade delete). `contacts` → deals, conversations,
consent, invoices, appointments, documents. `companies` → contacts. `pipelines` → stages → deals.
`conversations` → messages. `sites` → pages → funnel_steps. `ai_agents` → agent_knowledge →
(pgvector). `jobs` referenced logically by every async module (no hard FK — jobs are generic).

---

## 12 · What this document does NOT do

- It does not enable RLS policy *bodies* — those live in `RLS-AND-SECURITY` (attached, not
  duplicated).
- It does not define Storage bucket policies — those are in `RLS-AND-SECURITY` §Storage.
- It does not define which secrets go to Vault — that's `EDGE-FUNCTIONS-SPEC` + `INTEGRATIONS-SPEC`.
- It grows: each module session adds a numbered migration and, if columns change, a `DECISIONS`
  note. **Never edit a shipped migration.**

**Migration history — §5 (billing/metering).** Session 0's `0003_meters_plans.sql` created the
meters/plans tables as a simplified early cut. Session 4 (M03) appended `0009_m03_billing.sql`, which
reconciles them to the §5 shapes above (extends `meter_kind` with `seo_calls`/`image_gen`/`video_render`;
adds `usage_events.unit_cost`/`source`/`ref_id`; adds `credit_wallets.kind` + `(workspace_id,kind)`
uniqueness; adds `plans.stripe_price_id`, `subscriptions_platform.stripe_customer_id`,
`workspaces.billing_state`, and the `stripe_events` dedupe table), and ships the `meter_increment` /
`meter_check` / `has_feature` helpers + the trial-expiry cron. Read §5 as canonical; `0003`+`0009`
together are the on-disk truth (D-027). Legacy enum values `seo_api`/`storage_gb` remain dead/unused.

**Migration history — §9 (payments, M28).** Session 13 shipped `0018_m28_payments.sql`
(0017 was taken by a parallel M14 session, so M28 — independent of M14 — took 0018;
re-verify free on merge). Ships §9's `invoices` + `subscriptions` verbatim as
`invoices` + `client_subscriptions` (renamed to avoid colliding with M03's
`subscriptions_platform`; M28 is client-facing money, M03 is platform↔agency), plus
the PRD_M28 §3 additions: `invoice_payments` (the partial-payment ledger — **append-only,
service-role write only**, D-071), `tax_rates`, and `invoice_counters` (gap-free
per-workspace numbering). Logged column extensions on `invoices` (D-070): `kind`
(`invoice`|`estimate` — one builder/table), `amount_paid`, `discount jsonb` + `tax_rate`
(reproducible totals via `calc_invoice_totals`, the server truth the trigger enforces —
a client can't forge subtotal/tax/total), `notes`, `public_token` (the no-auth hosted
pay-page key), `sent_at`, `stripe_checkout_id`, `source_type`/`source_id`. Money is
integer **minor units** everywhere (D-072, matches M03). RLS: staff+ create/edit,
**manager+ delete AND void** (D-073); `invoice_payments` has no client write policy.
Webhook idempotency **reuses M03's `stripe_events`** table. Overdue is a daily
`m28-overdue-sweep` `pg_cron` (D-074). Read §9 as canonical; `0018` is the on-disk truth.

**Migration history — M44 (admin/platform ops).** Session 14 shipped `0019_m44_admin.sql`
(0017=M14, 0018=M28 both landed in parallel; M44 — independent — took 0019). Realizes the §10 M44
sketch as four tables: `feature_flags` (global registry; SELECT = authenticated so the app can
evaluate gates, writes platform-admin), `feature_flag_overrides` (per-workspace, PK
`(flag_key, workspace_id)`), `impersonation_sessions` (admin/target/reason/`expires_at`/`ended_at`;
platform-admin read, service-role/definer write) and `admin_audit_log` — the sketch's
`impersonation_log` generalised into an **append-only** platform ledger (no update/delete policy;
carries both `actor_user_id` and `acting_as_user_id`; D-079). The sketch's `system_health` table is
**not** shipped — infra monitoring reads `public.jobs` + `pg_cron` + the M41 health rollup instead
(D-081), no separate table. Cross-tenant admin access is via `is_platform_admin()`-gated SECURITY
DEFINER RPCs (D-078); `ws_status` gains `'suspended'` (D-083); a 30-min impersonation expiry runs on
`m44-impersonation-expiry-sweep` `pg_cron` (D-080). Read this note as canonical for M44; `0019` is the
on-disk truth.

---

*AiMindShare.com · Canonical Supabase Schema v1.0. Foundation + core-ops build-ready; all other
§29 domains upgraded; starred-module tables catalogued. Every tenant table: `workspace_id` + index
+ standard RLS. The most important document in the project — Claude Code diffs against this.*

---

### §9 implementation note — M16 Campaigns (Session 17, migration `0024_m16_campaigns.sql`)
Canonical §9 defined only `email_campaigns` + `campaign_stats`. M16 ships those plus **seven logged-extension
tables** (D-087): `sequences`, `sequence_steps`, `sequence_enrollments`, `suppressions`, `send_events`,
`email_templates`, `sender_identities`. Metering reuses the existing `email`/`sms` `meter_kind` values — **no
enum change** (D-088). `send_events` + `suppressions` + `campaign_stats` are **service-role-written** (member
SELECT only; `campaign_stats` maintained by the `roll_send_event()` AFTER-INSERT trigger) — D-089. Unsubscribe
dual-writes `suppressions` + an M05 `consent_records` opt-out (D-090). Migration numbered `0024` (M15/M06/M19/
M20 took 0020–0023 in parallel; M16 is independent → next free).

### §6 implementation note — M06 Media Library (Session 20, migration `0021_m06_media.sql`)
Canonical §6 sketched `media_assets` (index of a Storage object: `bucket`+`storage_path`, `ai_tags`, `used_in`
jsonb, soft-delete `deleted_at`) + a bare `media_folders`. M06 ships both **verbatim** + minimal logged
extensions (D-113/D-114): `media_folders` gains `bucket`/`kind` (`folder`|`collection`)/`pinned` (brand
collections are folders in the `brand` bucket — **no new table**); `media_assets` gains `filename`/`title`/
`alt_text`/`duration_sec`/`is_favorite`/`tag_status`. **No `AssetUsage` table** — usage is the canonical
`used_in` jsonb `[{module, ref_id}]`, written by `register/unregister_asset_usage` + a one-time
`backfill_asset_usage()` from `deal_files.asset_id` (D-118). **No stored `url`** — delivery is a signed URL and
variants are Storage transform URLs, both derived at read time (D-116). RLS in-file: `media` bucket = staff
write / manager delete, `brand` = admin (mirrors `0004`); browse SELECT hides `deleted_at is not null`. Upload
is direct-to-Storage + `register_media_asset()` (row + `media.autotag` enqueue, no presign Edge Fn — D-115).
Nightly `recompute_storage_meter()` revives the dormant `storage_gb` meter kind as a gauge (D-119). Migration
numbered `0021` (M15/M16 took 0020, M19=0022, M20=0023 in parallel; M06 is independent → `0021`).

### § acquisition implementation note — M15 Forms & Surveys (Session 16, migration `0020_m15_forms.sql`)
Three tables: `forms` (one row per form/survey/quiz — the vanilla builder reads/writes `fields_json`/
`logic_json`/`settings_json`/`routing_json`; `public_token` is the unguessable public URL key; `variant_of_id`+
`ab_split` back the A/B split; `status` gates public visibility), `form_submissions` (one row per completed or
`pending_confirmation` submission — `contact_id` links the upserted CRM contact, `score`/`result_tier` back quiz
scoring, `utm_json`/`ip_hash`/`variant` carry attribution, `confirm_token` backs double opt-in), and `form_views`
(the funnel event stream `view`→`start`→`complete`, one row per event; `visitor_id`+`variant`+`step` power
per-step drop-off and A/B stats). RLS in-file: `forms` = member read / **staff+ ins/upd / manager+ del** (config
the whole team uses; delete is the destructive tier). **`form_submissions` + `form_views` are service-role-INSERT-only**
— NO authenticated write policy; the `public-form` Edge Function writes them under the service role (D-137,
mirrors M12 D-055 / M19 `visitor_sessions` / M20 `funnel_visits`). The `submit_form()` SECURITY DEFINER RPC is the
whole write pipeline: honeypot + time-trap spam guard → CRM contact upsert-dedupe by email then phone (incl. the
custom-field map) → **exact-text consent row** into M05 `consent_records` → quiz score→tier → **logic-hidden
answers dropped server-side** (tamper guard) → routing (owner + tags + M11 deal) → `emit_trigger('form.submitted')`
enrols M13 workflows as `automation.execute` jobs. `assign_form_variant()` gives sticky-per-visitor A/B via a
deterministic hash; `form_analytics()` computes the funnel rollup on read. `ip_hash` is a sha256 digest, never a
raw IP (D-145). Migration numbered `0020` (M16 also drafted 0020 then moved to 0024; M19=0022, M20=0023, M06=0021
in parallel — 0020 confirmed unique to M15). See DECISIONS **D-136…D-146**.
