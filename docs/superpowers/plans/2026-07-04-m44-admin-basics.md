# M44 Admin Basics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Session-14 accept-when for M44 (super-admin gate, cross-tenant directory, `public.jobs` monitor, feature flags, audited impersonation) to full Definition-of-Done on the vanilla-HTML + Supabase stack.

**Architecture:** Every tenant table is RLS-scoped to `is_member(workspace_id)`, so all cross-tenant admin reads/writes go through `is_platform_admin()`-gated `SECURITY DEFINER` RPCs (gate on line 1). Only impersonation needs a service-role Edge Function (GoTrue admin mint, carried live). A `pg_cron` sweep enforces 30-min impersonation expiry. The frontend is a hash-routed `/admin` app reusing `tokens.css` + `components.css`.

**Tech Stack:** PostgreSQL + RLS + `SECURITY DEFINER` RPCs, Supabase Edge Functions (Deno), `pg_cron`, vanilla HTML/CSS/JS, PGlite for verification (`workers/verify/m44probe.mjs`).

---

## Repo conventions (read before starting)

- **This is not a git repo.** Replace every "commit" with a **Checkpoint** (re-run the probe suite; note state in TASKS at close). Do not run `git`.
- **The test harness is a PGlite probe**, not pytest/jest. The probe loads migrations into an in-memory Postgres, stubs `auth.uid()` + `request.jwt.claims`, and asserts RLS/RPC behavior. Run: `node workers/verify/m44probe.mjs` (after `npm install` in repo root). Exit 0 = green.
- **Migration is append-only.** New file `supabase/migrations/0018_m44_admin.sql`. Never edit an existing migration.
- **RLS in-file:** every `create table` must be followed by `enable row level security` + ≥1 `create policy` (Gate-8 Law 2).
- **Design law:** `tokens.css` vars only (no raw hex), 3 fonts (Cormorant/Baskerville/Shippori), `.5px` hairlines, numbers in `--font-mono`, no shimmer, dark theme = no stars, `prefers-reduced-motion` respected.
- **Probe idioms** (from `workers/verify/m41probe.mjs`): `load(n)` reads a migration and strips `create extension` lines; set the caller via `set_config('request.jwt.claims', '<json>', true)` where the JSON has `{"sub":"<uuid>","app_metadata":{"platform_admin":true}}`; `assert(cond,label)`, `count(pg,sql,params)`, `denied(pg,sql,params)` helpers.

---

## File structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `supabase/migrations/0018_m44_admin.sql` | Create | 4 tables + RLS, `ws_status` `'suspended'`, `workspace_suspended()`, all gated RPCs, cron sweep |
| `supabase/functions/_shared/auth.ts` | Modify | add `requirePlatformAdmin()` |
| `supabase/functions/admin-impersonate/index.ts` | Create | audited impersonation start (service-role; GoTrue mint carried) |
| `supabase/config.toml` | Modify | `[functions.admin-impersonate]` entry |
| `workers/verify/m44probe.mjs` | Create | PGlite acceptance probe |
| `scripts/verify.sh` | Modify | add m44 step |
| `frontend/m44-admin-platform-ops.html` | Create | `/admin` app shell + screen gallery |
| `frontend/styles/m44-admin.css` | Create | module surfaces (tokens only) |
| `frontend/js/m44-admin.js` | Create | router, RPC calls, gate, impersonation banner, mockup switcher |
| `supabase/seed.sql` | Modify | 2–3 flags, platform-admin profile, sample audit/impersonation rows |
| `supabase/leak_probe.sql` | Modify | M44 read/write cross-tenant guards |
| DATA-SCHEMA / DECISIONS / JOBS-AND-WORKERS / TASKS | Modify | Gate-9 docs |

---

## Task 1: Migration — tables, RLS, enum, helper

**Files:** Create `supabase/migrations/0018_m44_admin.sql`; Create `workers/verify/m44probe.mjs`.

- [ ] **Step 1: Write the migration's schema half.** Create `0018_m44_admin.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- 0018_m44_admin.sql — M44 Admin Basics (Session 14)
-- Platform-admin console foundation. Cross-tenant reads/writes are gated by
-- is_platform_admin() inside SECURITY DEFINER RPCs (RLS scopes normal reads to
-- membership). Ships M44's own append-only admin_audit_log (D-071), feature
-- flags (D-074), audited impersonation (D-072), and a jobs-monitor RPC surface.
-- Migration 0018 (0016=M13, 0017=M14+M28 collided; 0012 = reserved M05 renumber).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ws_status gains 'suspended' (D-075; enforcement retrofit deferred) ───────
alter type public.ws_status add value if not exists 'suspended';

create or replace function public.workspace_suspended(ws uuid)
returns boolean language sql stable set search_path = public as $$
  select exists (select 1 from public.workspaces where id = ws and status = 'suspended')
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
-- flags are not secret: any authed user may read (to evaluate gates); writes admin-only
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
-- read = platform admin only; no insert/update/delete policy → service-role/definer only
create policy imp_sel on public.impersonation_sessions for select
  using ( public.is_platform_admin() );

-- ── 4. admin_audit_log (append-only platform ledger — D-071) ─────────────────
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
```

- [ ] **Step 2: Scaffold the probe harness.** Create `workers/verify/m44probe.mjs` modeled on `m41probe.mjs` lines 16–72: import PGlite, define the 8 user UUIDs (reuse `OWNER_A…PLAT_ADMIN`), `assert/count/denied/load` helpers, the auth-schema stub (`auth.users`, `auth.uid()`, `authenticated`/`service_role` roles, `cron.schedule` no-op stub). Add a helper to switch caller:

```js
const asUser = (pg, sub, platformAdmin = false) => pg.exec(
  `select set_config('request.jwt.claims', '${JSON.stringify({ sub, app_metadata: { platform_admin: platformAdmin } })}', true);`
);
const asAnon = (pg) => pg.exec(`select set_config('request.jwt.claims', '', true);`);
```

Load migrations `0000, 0001, 0002, 0003, 0009, 0007, 0010_m41_integrations.sql, 0018_m44_admin.sql` in dependency order (tenancy, jobs, plans/subs, billing reconcile, ws settings/enum, is_platform_admin, this module). Seed two workspaces A/B with memberships and one platform-admin.

- [ ] **Step 3: Write Task-1 assertions (schema + RLS posture).** Append to `main()`:

```js
// tables exist + RLS on
assert(await count(pg, `select count(*)::int n from pg_tables where tablename='feature_flags' and rowsecurity`) === 1, "feature_flags RLS on");
assert(await count(pg, `select count(*)::int n from pg_tables where tablename='admin_audit_log' and rowsecurity`) === 1, "admin_audit_log RLS on");
// append-only: admin_audit_log has no update/delete policy
assert(await count(pg, `select count(*)::int n from pg_policies where tablename='admin_audit_log'`) === 1, "admin_audit_log SELECT-only (append-only)");
assert(await count(pg, `select count(*)::int n from pg_policies where tablename='impersonation_sessions'`) === 1, "impersonation_sessions SELECT-only");
// cross-tenant: B member cannot read A's override; non-admin cannot read audit/impersonation
// (seed one override for A first via service role, then switch to B)
// suspended enum value present
assert(await count(pg, `select count(*)::int n from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='ws_status' and e.enumlabel='suspended'`) === 1, "ws_status has 'suspended'");
```

- [ ] **Step 4: Run the probe.** Run: `node workers/verify/m44probe.mjs`. Expected: Task-1 assertions PASS (implement iteratively until green; the RPC assertions come in later tasks).

- [ ] **Step 5: Checkpoint.** Re-run `bash scripts/gate8.sh` — confirm `0018_m44_admin.sql` pairs every `create table` with `enable row level security` (0 Law-2 hits).

---

## Task 2: Read RPCs (gated cross-tenant queries)

**Files:** Modify `supabase/migrations/0018_m44_admin.sql`; Modify `workers/verify/m44probe.mjs`.

- [ ] **Step 1: Append the read RPCs to the migration.** All gate on line 1.

```sql
-- ── Gated read RPCs (is_platform_admin wall on line 1 of each) ────────────────
create or replace function public.admin_platform_kpis()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_platform_admin() then raise exception 'not_platform_admin' using errcode='42501'; end if;
  select jsonb_build_object(
    'workspaces',   (select count(*) from public.workspaces),
    'users',        (select count(*) from public.profiles),
    'active_subs',  (select count(*) from public.subscriptions_platform where status in ('active','trialing')),
    'mrr',          (select coalesce(sum(p.monthly_price),0) from public.subscriptions_platform s
                       join public.plans p on p.id = s.plan_id where s.status = 'active'),
    'jobs_queued',  (select count(*) from public.jobs where status='queued'),
    'jobs_running', (select count(*) from public.jobs where status='running'),
    'jobs_failed',  (select count(*) from public.jobs where status='failed')
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
  if not public.is_platform_admin() then raise exception 'not_platform_admin' using errcode='42501'; end if;
  return query
    select w.id, w.name, w.parent_workspace_id, w.status::text, w.billing_state,
           p.name, s.status, (select count(*) from public.memberships m where m.workspace_id=w.id),
           w.created_at
      from public.workspaces w
      left join public.subscriptions_platform s on s.workspace_id = w.id
      left join public.plans p on p.id = s.plan_id
     where (p_search is null or w.name ilike '%'||p_search||'%')
       and (p_status is null or w.status::text = p_status)
     order by w.created_at desc
     limit p_limit offset p_offset;
end $$;

create or replace function public.admin_list_users(
  p_search text default null, p_limit int default 50, p_offset int default 0)
returns table(id uuid, email text, name text, membership_count bigint, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_platform_admin' using errcode='42501'; end if;
  return query
    select pr.id, pr.email, pr.name,
           (select count(*) from public.memberships m where m.user_id=pr.id), pr.created_at
      from public.profiles pr
     where (p_search is null or pr.email ilike '%'||p_search||'%' or pr.name ilike '%'||p_search||'%')
     order by pr.created_at desc nulls last
     limit p_limit offset p_offset;
end $$;

create or replace function public.admin_list_jobs(
  p_status text default null, p_type text default null, p_limit int default 100)
returns table(id uuid, workspace_id uuid, workspace_name text, type text, status text,
              attempts int, run_after timestamptz, error text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_platform_admin' using errcode='42501'; end if;
  return query
    select j.id, j.workspace_id, w.name, j.type, j.status::text, j.attempts, j.run_after, j.error, j.created_at
      from public.jobs j join public.workspaces w on w.id = j.workspace_id
     where (p_status is null or j.status::text = p_status)
       and (p_type is null or j.type = p_type)
     order by j.created_at desc limit p_limit;
end $$;

create or replace function public.admin_flag_enabled(p_key text, p_workspace uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select o.enabled from public.feature_flag_overrides o
      where o.flag_key=p_key and o.workspace_id=p_workspace),
    (select f.default_on from public.feature_flags f where f.key=p_key),
    false)
$$;
-- flag resolver is safe (returns only a bool) and callable app-side
grant execute on function public.admin_flag_enabled(text, uuid) to authenticated, service_role;
```

Add `admin_get_workspace(p_id uuid)` returning a `jsonb` bundle (settings + members array + subscription + recent 10 jobs + overrides) — same gate-on-line-1 pattern.

- [ ] **Step 2: Write the gate + cross-tenant assertions.**

```js
// gate: a normal member is rejected by every read RPC
await asUser(pg, STAFF_A, false);
assert(await denied(pg, `select public.admin_list_workspaces()`), "list_workspaces denied for non-admin");
assert(await denied(pg, `select public.admin_platform_kpis()`), "kpis denied for non-admin");
assert(await denied(pg, `select public.admin_list_jobs()`), "list_jobs denied for non-admin");
// platform admin sees ACROSS tenants (A + B both present)
await asUser(pg, PLAT_ADMIN, true);
assert(await count(pg, `select count(*)::int n from public.admin_list_workspaces()`) >= 2, "admin sees all workspaces cross-tenant");
// flag resolution: default vs override
await asUser(pg, PLAT_ADMIN, true);
assert(await count(pg, `select (public.admin_flag_enabled('voice.rollout', null))::int n`) === 0, "flag off by default");
```

- [ ] **Step 3: Run the probe.** Run: `node workers/verify/m44probe.mjs`. Expected: Task-2 assertions PASS.

- [ ] **Step 4: Checkpoint.** Full read surface gated + cross-tenant proven.

---

## Task 3: Mutation RPCs + audit writes

**Files:** Modify `supabase/migrations/0018_m44_admin.sql`; Modify `workers/verify/m44probe.mjs`.

- [ ] **Step 1: Append the mutation RPCs.** Each writes an `admin_audit_log` row; each gates on line 1. Include an internal helper so audit inserts are uniform:

```sql
create or replace function public.admin_audit(
  p_action text, p_target_type text, p_target_id text, p_workspace uuid, p_detail jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.admin_audit_log(actor_user_id, workspace_id, action, target_type, target_id, detail)
  values (auth.uid(), p_workspace, p_action, p_target_type, p_target_id, coalesce(p_detail,'{}'));
end $$;

create or replace function public.admin_set_feature_flag(
  p_key text, p_default_on boolean, p_description text default null, p_category text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_platform_admin' using errcode='42501'; end if;
  insert into public.feature_flags(key, default_on, description, category)
  values (p_key, p_default_on, p_description, p_category)
  on conflict (key) do update set default_on=excluded.default_on,
    description=coalesce(excluded.description, public.feature_flags.description),
    category=coalesce(excluded.category, public.feature_flags.category), updated_at=now();
  perform public.admin_audit('flag.set','flag',p_key,null, jsonb_build_object('default_on',p_default_on));
end $$;

create or replace function public.admin_set_flag_override(p_key text, p_workspace uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_platform_admin' using errcode='42501'; end if;
  if p_enabled is null then
    delete from public.feature_flag_overrides where flag_key=p_key and workspace_id=p_workspace;
  else
    insert into public.feature_flag_overrides(flag_key, workspace_id, enabled)
    values (p_key, p_workspace, p_enabled)
    on conflict (flag_key, workspace_id) do update set enabled=excluded.enabled;
  end if;
  perform public.admin_audit('flag.override','flag',p_key,p_workspace, jsonb_build_object('enabled',p_enabled));
end $$;

create or replace function public.admin_suspend_workspace(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_platform_admin' using errcode='42501'; end if;
  update public.workspaces set status='suspended' where id=p_id;
  perform public.admin_audit('workspace.suspend','workspace',p_id::text,p_id, jsonb_build_object('reason',p_reason));
end $$;

create or replace function public.admin_unsuspend_workspace(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_platform_admin' using errcode='42501'; end if;
  update public.workspaces set status='active' where id=p_id;
  perform public.admin_audit('workspace.unsuspend','workspace',p_id::text,p_id,'{}');
end $$;

create or replace function public.admin_retry_job(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_platform_admin' using errcode='42501'; end if;
  update public.jobs set status='queued', run_after=now(), locked_by=null, locked_at=null, error=null, updated_at=now()
   where id=p_id;
  perform public.admin_audit('job.retry','job',p_id::text,null,'{}');
end $$;

create or replace function public.admin_discard_job(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_platform_admin' using errcode='42501'; end if;
  update public.jobs set status='failed', error='discarded by admin', updated_at=now() where id=p_id;
  perform public.admin_audit('job.discard','job',p_id::text,null,'{}');
end $$;

create or replace function public.admin_end_impersonation(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.impersonation_sessions;
begin
  if not public.is_platform_admin() then raise exception 'not_platform_admin' using errcode='42501'; end if;
  update public.impersonation_sessions set ended_at=now() where id=p_id and ended_at is null returning * into s;
  if found then
    perform public.admin_audit('impersonate.end','user',s.target_user_id::text,s.target_workspace_id,'{}');
  end if;
end $$;

-- revoke public/default execute on the admin-only funcs (they self-gate, but defense in depth)
revoke all on function public.admin_platform_kpis(), public.admin_set_feature_flag(text,boolean,text,text),
  public.admin_suspend_workspace(uuid,text), public.admin_retry_job(uuid) from public;
grant execute on function public.admin_platform_kpis() to authenticated, service_role;
-- (repeat grant for each admin RPC to authenticated + service_role)
```

- [ ] **Step 2: Assertions (mutation + audit + non-admin block).**

```js
// non-admin cannot mutate
await asUser(pg, STAFF_A, false);
assert(await denied(pg, `select public.admin_set_feature_flag('x', true)`), "set_flag denied for non-admin");
assert(await denied(pg, `select public.admin_suspend_workspace('${WS_A}', 'x')`), "suspend denied for non-admin");
// admin mutations + audit
await asUser(pg, PLAT_ADMIN, true);
await pg.exec(`select public.admin_set_feature_flag('voice.rollout', true, 'AI voice beta', 'beta')`);
assert(await count(pg, `select (public.admin_flag_enabled('voice.rollout', null))::int n`) === 1, "flag now on");
await pg.exec(`select public.admin_set_flag_override('voice.rollout', '${WS_A}', false)`);
assert(await count(pg, `select (public.admin_flag_enabled('voice.rollout','${WS_A}'))::int n`) === 0, "override wins over default");
await pg.exec(`select public.admin_suspend_workspace('${WS_A}', 'abuse')`);
assert(await count(pg, `select count(*)::int n from public.workspaces where id='${WS_A}' and status='suspended'`) === 1, "workspace suspended");
assert(await count(pg, `select (public.workspace_suspended('${WS_A}'))::int n`) === 1, "workspace_suspended() true");
// audit rows written, carry actor
assert(await count(pg, `select count(*)::int n from public.admin_audit_log where action='workspace.suspend' and actor_user_id='${PLAT_ADMIN}'`) === 1, "suspend audited with actor");
// append-only: update/delete affect 0 rows (no policy)
assert(await count(pg, `with u as (update public.admin_audit_log set action='x' returning 1) select count(*)::int n from u`) === 0, "audit log update = 0 rows (append-only)");
// jobs retry/discard (seed a failed job for A via service role first)
await pg.exec(`select public.admin_retry_job('${JOB_A}')`);
assert(await count(pg, `select count(*)::int n from public.jobs where id='${JOB_A}' and status='queued' and error is null`) === 1, "retry re-queues + clears error");
```

- [ ] **Step 3: Run the probe.** Run: `node workers/verify/m44probe.mjs`. Expected: Task-3 assertions PASS.

- [ ] **Step 4: Checkpoint.** All mutations gated + audited; append-only proven.

---

## Task 4: Impersonation expiry cron

**Files:** Modify `supabase/migrations/0018_m44_admin.sql`; Modify `workers/verify/m44probe.mjs`; Modify `JOBS-AND-WORKERS-SPEC-v1_0.md`.

- [ ] **Step 1: Append the sweep (PGlite-guarded).**

```sql
-- ── Impersonation expiry sweep (server-side 30-min guarantee) ─────────────────
do $$ begin
  perform cron.schedule('m44-impersonation-expiry-sweep', '*/1 * * * *', $cron$
    with closed as (
      update public.impersonation_sessions set ended_at = now()
       where ended_at is null and expires_at < now()
      returning id, admin_user_id, target_user_id, target_workspace_id)
    insert into public.admin_audit_log(actor_user_id, acting_as_user_id, workspace_id, action, target_type, target_id, detail)
    select admin_user_id, target_user_id, target_workspace_id, 'impersonate.expire', 'user', target_user_id::text, '{}'
      from closed;
  $cron$);
exception when others then
  raise notice 'pg_cron unavailable — m44-impersonation-expiry-sweep not scheduled (%).', sqlerrm;
end $$;
```

- [ ] **Step 2: Assert the sweep logic directly** (PGlite has no pg_cron; run the inner SQL). Seed an expired session via service role, then run the `with closed as (...)` body and assert:

```js
// seed an already-expired active session (service role: no RLS)
await pg.exec(`insert into public.impersonation_sessions(admin_user_id,target_user_id,reason,expires_at)
  values('${PLAT_ADMIN}','${STAFF_A}','support', now() - interval '1 minute')`);
await pg.exec(`/* the sweep body verbatim */`);
assert(await count(pg, `select count(*)::int n from public.impersonation_sessions where ended_at is not null`) >= 1, "sweep closes expired session");
assert(await count(pg, `select count(*)::int n from public.admin_audit_log where action='impersonate.expire'`) >= 1, "sweep writes dual-identity audit");
```

- [ ] **Step 3: Run the probe.** Run: `node workers/verify/m44probe.mjs`. Expected: PASS.

- [ ] **Step 4: Doc.** Add `m44-impersonation-expiry-sweep` to `JOBS-AND-WORKERS-SPEC-v1_0.md` §5 (schedule `*/1 * * * *`, purpose: enforce 30-min impersonation expiry).

- [ ] **Step 5: Checkpoint.**

---

## Task 5: Edge Function + shared auth guard

**Files:** Modify `supabase/functions/_shared/auth.ts`; Create `supabase/functions/admin-impersonate/index.ts`; Modify `supabase/config.toml`.

- [ ] **Step 1: Add `requirePlatformAdmin` to `_shared/auth.ts`** (after `requirePermission`):

```ts
// requirePlatformAdmin — the guard every /admin Edge Function calls after authUser().
// is_platform_admin() reads the JWT claims GUC, so a caller-scoped client resolves it.
export async function requirePlatformAdmin(userDb: SupabaseClient): Promise<Response | null> {
  const { data } = await userDb.rpc("is_platform_admin");
  return data === true ? null : err(403, "not_platform_admin", "Platform admin required");
}
```

- [ ] **Step 2: Create `admin-impersonate/index.ts`.** Verify caller, insert the session + audit via service role, then attempt the GoTrue admin mint (carried honestly):

```ts
import { serviceClient, userClient, authUser, requirePlatformAdmin } from "../_shared/auth.ts";
import { ok, err } from "../_shared/envelope.ts";

Deno.serve(async (req) => {
  const caller = await authUser(req);
  if (!caller) return err(401, "unauthorized", "Sign in required");
  const gate = await requirePlatformAdmin(userClient(req));
  if (gate) return gate;

  const { target_user_id, target_workspace_id, reason } = await req.json();
  if (!target_user_id || !reason) return err(400, "bad_request", "target_user_id and reason required");

  const svc = serviceClient();
  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const { data: session, error } = await svc.from("impersonation_sessions")
    .insert({ admin_user_id: caller.id, target_user_id, target_workspace_id, reason, expires_at })
    .select().single();
  if (error) return err(500, "db_error", error.message);

  await svc.from("admin_audit_log").insert({
    actor_user_id: caller.id, acting_as_user_id: target_user_id,
    workspace_id: target_workspace_id ?? null, action: "impersonate.start",
    target_type: "user", target_id: target_user_id, detail: { reason, session_id: session.id },
  });

  // CARRIED (no hosted project): mint a scoped session for the target via GoTrue admin API.
  // const { data: link } = await svc.auth.admin.generateLink({ type: "magiclink", email: targetEmail });
  // Returns an impersonation access token the browser swaps in. Not run here — never faked green.
  return ok({ session_id: session.id, expires_at, impersonation_token: null, carried: "gotrue_admin_mint" });
});
```

- [ ] **Step 3: Register in `config.toml`.** Add:

```toml
[functions.admin-impersonate]
verify_jwt = true
```

- [ ] **Step 4: Checkpoint.** (Edge Fn is not PGlite-run — the session-row + audit path it uses is already probe-tested in Task 3/4; the live mint is carried per §9.) Run `bash scripts/gate8.sh` — confirm no `service_role`/secret leaks into `frontend/` (Edge Fn is server-side, clean).

---

## Task 6: Frontend `/admin` app

**Files:** Create `frontend/m44-admin-platform-ops.html`, `frontend/styles/m44-admin.css`, `frontend/js/m44-admin.js`. Reference (match structure/patterns): `frontend/m41-credential-vault.html` + `frontend/js/m41-integrations.js` (closest platform-admin-aware module), `frontend/styles/components.css` (app shell + table/drawer/pill/KPI classes), the mockup preview switcher used in every module.

- [ ] **Step 1: HTML shell.** `m44-admin-platform-ops.html`: `<head>` loads `tokens.css`, `components.css`, `m44-admin.css` (in that order), the 3 fonts, and the `THEME_KEY` boot script (copy from `m41-credential-vault.html`). Body = app shell (rail + topbar) with an `#admin-view` mount, an impersonation-banner slot above the topbar, a 403 "Restricted" panel (hidden by default), and the mockup preview-state switcher (default/empty/loading/error/success) matching other modules. Nav rail items: Overview · Directory · Jobs · Flags.

- [ ] **Step 2: JS — gate + router + RPC layer.** `js/m44-admin.js`:
  - Boot: read the `platform_admin` claim from the session JWT (`supabase.auth.getSession()` → decode `app_metadata.platform_admin`). If false/absent → show the 403 panel, hide the app (server RPCs enforce regardless — this is cosmetic). In mockup mode, force-show as admin with sample data + visible "sample data" label.
  - Hash router: `#/admin` (Overview), `#/admin/directory`, `#/admin/jobs`, `#/admin/flags` — same pattern as `m41-integrations.js`.
  - RPC helpers: `rpc(name, args)` → `supabase.rpc(name, args)`, envelope-unwrap, map error codes (`not_platform_admin` → "Restricted", others → human copy). Each view has default/empty/loading/error states.
  - **Overview:** call `admin_platform_kpis()` → KPI tiles (numbers in `--font-mono`); recent audit feed from a `admin_audit_log` select (admin-readable).
  - **Directory:** `admin_list_workspaces({p_search,p_status})` → table (name · plan · sub status · members · created · status pill incl. suspended); row → detail drawer with `admin_get_workspace`, buttons: Suspend/Unsuspend (`admin_suspend_workspace`/`admin_unsuspend_workspace`), per-workspace flag overrides (`admin_set_flag_override`), and **Impersonate** launcher (required reason textarea → `supabase.functions.invoke('admin-impersonate', {body})`). Users tab → `admin_list_users`.
  - **Jobs:** `admin_list_jobs({p_status,p_type})` → table + status-count chips; Retry/Discard buttons on failed rows (`admin_retry_job`/`admin_discard_job`); a manual Refresh + optional `setInterval` poll (cleared on route change).
  - **Flags:** `feature_flags` select (admin-readable) → list with a default toggle (`admin_set_feature_flag`), an Add-flag form, and an overrides sub-panel per flag.
  - **Impersonation banner:** if an active (non-ended, unexpired) session is returned by the impersonate call / present in state, render the amber banner "Viewing as <user> — <reason>" + "Return to admin" (`admin_end_impersonation`).

- [ ] **Step 3: CSS.** `styles/m44-admin.css`: only module-specific surfaces (KPI grid, directory table density, drawer action panel, jobs status chips, flag rows, impersonation banner). Reuse `components.css` for shell/table/pill/drawer. Tokens only — no raw hex; `.5px` hairlines; numbers `--font-mono`; glass by zone; **no shimmer**; dark theme sibling `[data-theme="dark"]` block; `@media (prefers-reduced-motion: reduce)` disables non-essential motion.

- [ ] **Step 4: Verify in preview.** Add a `.claude/launch.json` static server if none exists (or reuse the module preview pattern). Start the preview, load `m44-admin-platform-ops.html`, and check with preview tools:
  - `preview_snapshot`: all 4 routes render; 403 panel shows when the mockup switcher simulates a non-admin.
  - `preview_console_logs`: zero errors.
  - `preview_inspect`: KPI numbers use Shippori (`--font-mono`); pills use `--status-*`; hairlines `.5px`.
  - `preview_resize` 360/768/1280: no page horizontal scroll (tables own overflow); `colorScheme: dark`: dark bg with no stars.
  - Each state via the switcher: default (sample data + label) · empty · loading (calm, no shimmer) · error (+retry).
  - `preview_screenshot` of Overview + Directory drawer (light + dark) as proof.

- [ ] **Step 5: Checkpoint.** Run `bash scripts/gate8.sh` — confirm `frontend/` greps clean (no `shimmer`, no raw brand hex outside tokens, no 4th font, no `service_role`/`sk-`).

---

## Task 7: Seed, leak-probe, verify.sh wiring, docs, close

**Files:** Modify `supabase/seed.sql`, `supabase/leak_probe.sql`, `scripts/verify.sh`, `DATA-SCHEMA-v1_0.md`, `DECISIONS-AiMindShare-v1_0.md`, `TASKS.md`.

- [ ] **Step 1: Seed.** Append to `seed.sql`: 2–3 `feature_flags` (`voice.rollout` off, `marketplace.enabled` off, `video.studio` off), a platform-admin note (the claim is minted in the hosted console — comment it, don't fake), a per-workspace override, and 2–3 `admin_audit_log` sample rows + one ended `impersonation_sessions` row for the Overview feed. Label as sample data.

- [ ] **Step 2: Leak probe.** Append to `leak_probe.sql`: B's staff user cannot read A's `feature_flag_overrides`; a non-admin cannot select `admin_audit_log` / `impersonation_sessions`; the anon session grants nothing on all four M44 tables.

- [ ] **Step 3: Wire `verify.sh`.** Add the m44 step (`node workers/verify/m44probe.mjs`) after the m28 step, matching the existing echo/emoji format.

- [ ] **Step 4: Run the full suite.** Run: `bash scripts/verify.sh`. Expected: all prior probes still green + `m44` green + leak probe green. Fix any regression before proceeding.

- [ ] **Step 5: Run Gate-8.** Run: `bash scripts/gate8.sh`. Expected: 0 violations (or each justified). Confirm `0018_m44_admin.sql` passes the Law-2 RLS grep.

- [ ] **Step 6: Docs (Gate 9).**
  - `DATA-SCHEMA-v1_0.md`: add an M44 implementation note (the 4 tables + columns; migration `0018`).
  - `DECISIONS-AiMindShare-v1_0.md`: add **D-070…D-075** exactly as worded in the spec §10. Verify no collision with parallel S11–S13 numbers before finalizing; renumber M44's range if taken.
  - `JOBS-AND-WORKERS-SPEC-v1_0.md`: already updated in Task 4.
  - `TASKS.md`: add the Session 14 block (Attach list, Done items, the Session-14 close ritual with all 9 gates, carry-overs from spec §9, and the human-reconcile flag for the `0017`/`0012` migration-number collisions + the D-070+ number check).

- [ ] **Step 7: Final checkpoint.** Confirm: probe green, Gate-8 clean, preview verified (light+dark, responsive, states), docs + TASKS updated. Session 14 = Done.

---

## Self-review (spec coverage)

- Super-admin gate → Task 1 (`is_platform_admin` foundation reused) + Task 2/3 (gate on every RPC) + Task 5 (`requirePlatformAdmin`) + Task 6 (client 403). ✅
- Directory (workspace/user list + detail) → Task 2 (`admin_list_workspaces/users/get_workspace`) + Task 6. ✅
- Jobs monitor (reads `public.jobs`, retry/discard) → Task 2 (`admin_list_jobs`) + Task 3 (`admin_retry_job`/`admin_discard_job`) + Task 6. ✅
- Feature flags (registry + overrides + resolver) → Task 1 (tables) + Task 2 (`admin_flag_enabled`) + Task 3 (`admin_set_feature_flag`/`admin_set_flag_override`) + Task 6. ✅
- Audited impersonation (session + 30-min expiry + banner + dual-identity audit) → Task 1 (tables) + Task 3 (`admin_end_impersonation`) + Task 4 (cron sweep) + Task 5 (Edge Fn start) + Task 6 (launcher + banner). ✅
- Suspend/unsuspend (audited flip; enforcement deferred) → Task 1 (enum + helper) + Task 3 (RPCs). ✅
- Gates 1–9 → Task 1/2/3 (leak + roles), Task 3 (no metering — none), Task 4 (async/cron), Task 6 (screens/design), Task 5 (secrets), Task 7 (greps + docs). ✅

Type consistency check: RPC names are identical across Tasks 2/3/6 and the probe (`admin_list_workspaces`, `admin_flag_enabled`, `admin_set_flag_override`, `admin_suspend_workspace`, `admin_retry_job`, `admin_end_impersonation`, `admin_platform_kpis`). No drift.
