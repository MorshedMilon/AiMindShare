-- ═══════════════════════════════════════════════════════════════════════════
-- 0010_m41_integrations.sql — M41 Credential Vault (slice only) · Session 5
-- (Numbered 0010: Session 4/M03 holds 0009. NOTE: parallel sessions also placed
--  0009_m04_notifications.sql + 0010_m05_compliance.sql — a build-order collision to
--  reconcile; M41 is dependency-independent of M03/M04/M05 and safe in any order > 0008.)
-- The single place external-provider credentials are referenced. Reconciles
-- PRD_M41's dead Node/Prisma/AES mechanics onto the locked stack per
-- INTEGRATIONS-SPEC §0 (binding):
--   • The SECRET lives in Supabase Vault; the `integrations` row stores a
--     REFERENCE ONLY (`vault_secret_name`) — never ciphertext, never plaintext
--     (D-031, Law 2). PRD's `credentialsEnc Bytes` + env master key are DROPPED.
--   • `workspace_id` is NULLABLE: null = platform-level default, set = per-
--     workspace override (D-032). Platform (null) rows are RLS-restricted to
--     platform super-admins via the new `is_platform_admin()` helper.
--   • WRITES are SERVICE-ROLE ONLY (no insert/update/delete policy — like `jobs`).
--     Connect/disconnect must atomically touch Vault, so they run only inside
--     Edge Functions under the service role; the browser's one direct power is a
--     RLS SELECT of the non-secret columns (D-033). Role threshold = admin+
--     ("Integrations & API keys (M41) = Owner/Admin" — RLS-AND-SECURITY §2).
--   • Health is a system job: hourly `pg_cron` enqueues `integration.health_check`
--     jobs (§5); the browser never enqueues it. `integration.refresh_token` is
--     scaffolded (no oauth2 provider connected this slice — D-034).
--
-- Public API / webhooks_in / webhooks_out / api_keys / api_rate_limits are
-- DEFERRED to Phase 7 (Session 42) — this slice is the vault + connections only.
--
-- Order inside this file: enum → helper → table → indexes → RLS → cron.
-- Every table created here enables RLS in THIS file (DoD Gate-8).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Status enum (append to the DATA-SCHEMA §2 registry) ───────────────────
do $$ begin
  create type public.integration_status as enum ('connected','needs_reauth','error','disconnected');
exception when duplicate_object then null; end $$;

-- ── 2. Platform-admin gate (first use: M41 platform-default integration rows) ─
-- A platform super-admin is a JWT app_metadata claim (RLS-AND-SECURITY §3 global
-- tables). No UI mints it yet — M44 Admin builds that surface (D-032); this helper
-- is the wall the module needs today. Pure claim read (stable, not definer); reads
-- the `request.jwt.claims` GUC directly so it also resolves under PGlite probes.
create or replace function public.is_platform_admin() returns boolean
language sql stable set search_path = public as $$
  select coalesce(
    (current_setting('request.jwt.claims', true)::jsonb
       -> 'app_metadata' ->> 'platform_admin')::boolean,
    false)
$$;
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated, service_role;

-- ── 3. integrations (PRD fields → Vault-reference reality) ───────────────────
-- workspace_id NULL  = platform-level default (shared fallback; platform-admin only).
-- workspace_id SET   = per-workspace override (admin+ of that workspace).
-- vault_secret_name  = the §3 base reference (plat__<provider> / ws_<uuid>__<provider>);
--                      the helper derives field/whsec suffixes. NEVER a secret value.
-- auth_type / scope  = denormalized registry mirror so the browser renders pills/
--                      badges from a plain RLS read without ever touching Vault; the
--                      CHECK keeps `scope` honest against workspace_id null-ness.
create table if not exists public.integrations (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid references public.workspaces(id) on delete cascade,   -- NULLABLE (D-032)
  provider          text not null,                                             -- registry key (§7)
  auth_type         text not null,                                             -- 'api_key' | 'oauth2' | 'basic'
  scope             text not null default 'workspace',                         -- 'workspace' | 'platform'
  status            public.integration_status not null default 'connected',
  vault_secret_name text,                                                      -- Vault REFERENCE only (Law 2)
  config            jsonb not null default '{}',                               -- NON-secret config (label, from-email, scopes)
  token_expires_at  timestamptz,                                               -- oauth2 only
  last_health_check timestamptz,
  last_error        text,
  connected_by      uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,
  constraint integrations_scope_matches_ws
    check ( (scope = 'platform') = (workspace_id is null) )
);

create trigger integrations_set_updated_at before update on public.integrations
  for each row execute function public.set_updated_at();

-- ── 4. Indexes + null-aware uniqueness ───────────────────────────────────────
create index if not exists integrations_workspace_idx on public.integrations (workspace_id);
create index if not exists integrations_provider_idx  on public.integrations (provider, workspace_id);

-- One integration per (workspace, provider) AND one platform default per provider.
-- Plain UNIQUE treats NULLs as distinct (would allow many platform rows), so the two
-- scopes are covered by two partial unique indexes. This is the resolution-order
-- backbone: at most one override + one default per provider, so
-- `order by workspace_id nulls last limit 1` deterministically picks override→default.
create unique index if not exists integrations_ws_provider_uidx
  on public.integrations (workspace_id, provider) where workspace_id is not null;
create unique index if not exists integrations_platform_provider_uidx
  on public.integrations (provider) where workspace_id is null;

-- ── 5. RLS — SELECT only; writes are service-role only (D-033, like `jobs`) ──
-- SELECT: admin+ of the workspace (workspace rows) OR platform-admin (platform rows).
--         Reading a raw platform row is confined to platform-admins so the mere
--         existence of platform providers isn't leaked to every tenant; a workspace
--         resolves the EFFECTIVE credential through resolveCredential() (Edge Fn).
-- INSERT/UPDATE/DELETE: NO policy → denied to anon/authenticated → service-role only.
--         Connect/disconnect run in Edge Functions (they must write Vault atomically);
--         the health worker updates status via the service role, which bypasses RLS.
alter table public.integrations enable row level security;

create policy integrations_sel on public.integrations for select using (
  (workspace_id is not null and public.has_role(workspace_id, 'admin'))
  or (workspace_id is null and public.is_platform_admin())
);

-- ── 6. Hourly health-check enqueue (system-initiated; the browser never enqueues) ─
-- pg_cron inserts one `integration.health_check` job per connected WORKSPACE
-- integration (§5). The worker runs the provider's cheap status call and updates
-- health columns. Hour-bucket idempotency key → at most one enqueue per row per hour
-- (survives overlapping sweeps). Platform (null) rows are skipped: jobs.workspace_id
-- is NOT NULL + FK to workspaces, so a platform-integration health lane is deferred to
-- a system-jobs path with M44 (D-034). No refresh cron is scheduled — no oauth2
-- provider is connected this slice, so there is nothing to refresh (D-034).
select cron.schedule(
  'integration-health-check-hourly',
  '0 * * * *',
  $$ insert into public.jobs (workspace_id, type, payload, idempotency_key)
       select i.workspace_id,
              'integration.health_check',
              jsonb_build_object('integration_id', i.id, 'provider', i.provider),
              'integration.health_check:' || i.id || ':' || to_char(now(), 'YYYYMMDDHH24')
         from public.integrations i
        where i.workspace_id is not null
          and i.status in ('connected', 'error')
      on conflict (workspace_id, type, idempotency_key)
        where idempotency_key is not null do nothing $$
);
