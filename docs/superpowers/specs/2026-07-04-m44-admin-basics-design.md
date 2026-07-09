# M44 — Admin Basics (Platform Ops) · Design Spec

**Session 14 · Phase 1 · 2026-07-04**
Attach set: Constitution · DECISIONS · DATA-SCHEMA (§3/§5/§10) · RLS-AND-SECURITY · JOBS-AND-WORKERS ·
EDGE-FUNCTIONS-SPEC · PRD_M44 · BUILD-SEQUENCE (row 14) · DEFINITION-OF-DONE · AIMINDSHARE-DESIGN · TASKS.

---

## 1. Scope (approved)

Build the **BUILD-SEQUENCE row-14 accept-when to full DoD**, defer the rest of PRD_M44 as honest,
labelled scaffolds:

**In scope (to DoD):**
1. **Super-admin gate** — `is_platform_admin()` JWT claim, formalized as the wall for a `/admin` surface.
2. **Directory** — cross-tenant workspace/agency + user list with detail drawer.
3. **Jobs monitor** — reads `public.jobs` across all workspaces; retry / discard failed jobs.
4. **Feature flags** — global registry + per-workspace overrides + `admin_flag_enabled()` resolver.
5. **Audited impersonation** — session row, dual-identity audit, 30-min expiry via cron sweep, UI banner.
6. **Directory action: suspend / unsuspend** — audited `ws_status` flip (enforcement retrofit deferred, §9).

**Deferred (outside accept-when — scaffold + DECISIONS, never faked):** plan/pricing editor & coupons;
add-credits / extend-trial / plan-change (need live Stripe, M03 carried); full suspension→read-only RLS
retrofit; cost/margin dashboards & MeterCost; marketplace moderation (M39); GDPR/A2P/abuse rollups
(M05/M36); announcements + maintenance mode; support tooling (GoTrue admin: resend/unlock/2FA-reset).

**Superseded by the locked stack (D-073):** PRD's "infra monitor = BullMQ / Bull Board / Redis / Sentry"
→ on the vanilla + Supabase stack the infra surface is `public.jobs` monitor + `pg_cron` health + the
M41 integration-health rollup. No React/BullMQ/Redis/Sentry (dead stack, Gate-8).

---

## 2. Central architectural fact

Every tenant table is RLS-scoped to `is_member(workspace_id)`. A platform admin therefore **cannot**
read across workspaces with the client SDK. So:

> **Every cross-tenant admin read/write goes through an `is_platform_admin()`-gated `SECURITY DEFINER`
> RPC (or a service-role Edge Function). The gate is line 1 of every such function.**

This is M44's **Gate-2 headline**. `is_platform_admin()` (shipped in `0010_m41_integrations.sql`) reads
`request.jwt.claims -> app_metadata ->> 'platform_admin'` directly (not `auth.uid()`), so it also
resolves under PGlite probes and under a caller-scoped client.

---

## 3. Data model — `supabase/migrations/0018_m44_admin.sql`

Migration number **0018** (0016=M13, 0017=M14 **and** M28 collided in parallel; 0012 is the reserved
M05-renumber gap). Human-reconcile flag added at session close. All tables RLS-on **in-file** (Gate-8 Law 2).

### 3.1 `feature_flags` (global registry)
| col | type | notes |
|---|---|---|
| `key` | text PK | dotted, e.g. `voice.rollout` |
| `default_on` | bool not null default false | |
| `description` | text | |
| `category` | text | grouping for the UI |
| `created_at` / `updated_at` | timestamptz | `set_updated_at` trigger |

RLS: **SELECT = authenticated** (flags are not secrets; the app evaluates them). INSERT/UPDATE/DELETE =
**platform-admin only** (`is_platform_admin()`).

### 3.2 `feature_flag_overrides` (per-workspace)
| col | type | notes |
|---|---|---|
| `flag_key` | text FK → feature_flags(key) on delete cascade | |
| `workspace_id` | uuid FK → workspaces(id) on delete cascade | |
| `enabled` | bool not null | |
| PK | `(flag_key, workspace_id)` | |

RLS: SELECT = own-workspace member (`is_member(workspace_id)`) **or** platform-admin. Writes = platform-admin.

### 3.3 `impersonation_sessions`
| col | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `admin_user_id` | uuid | the operator |
| `target_user_id` | uuid | impersonated identity |
| `target_workspace_id` | uuid null | context, optional |
| `reason` | text not null | required in the launcher |
| `started_at` | timestamptz default now() | |
| `expires_at` | timestamptz not null | = started_at + 30 min |
| `ended_at` | timestamptz null | set by end action or cron sweep |

RLS: SELECT = platform-admin. No client insert/update/delete policy → **service-role / definer only**.

### 3.4 `admin_audit_log` (M44's own platform ledger — D-071)
| col | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `actor_user_id` | uuid | who acted (the operator) |
| `acting_as_user_id` | uuid null | impersonated identity, when applicable |
| `workspace_id` | uuid null | null = platform scope |
| `action` | text not null | e.g. `impersonate.start`, `flag.set`, `workspace.suspend`, `job.retry` |
| `target_type` | text null | `workspace` / `user` / `flag` / `job` |
| `target_id` | text null | |
| `detail` | jsonb not null default `{}` | before/after, reason, etc. |
| `created_at` | timestamptz default now() | |

RLS: SELECT = platform-admin. **Append-only** — no UPDATE/DELETE policy; INSERT is definer/service-role only.
Distinct from M00 `auth_events` (identity-scoped, D-017) and the future M07 general `audit_log`; M07 may
later generalize/absorb it.

---

## 4. Gated RPCs (`SECURITY DEFINER`, gate on line 1)

Every function begins:
```sql
if not public.is_platform_admin() then
  raise exception 'not_platform_admin' using errcode = '42501';
end if;
```

**Reads**
- `admin_platform_kpis()` → jsonb: workspace count, user count, active-subscription count, MRR estimate
  (Σ active subs' plan monthly price per DATA-SCHEMA §5), jobs by status (queued/running/failed), recent
  failed-job rate.
- `admin_list_workspaces(p_search text, p_status text, p_limit int, p_offset int)` → workspace rows joined
  to agency (`parent_workspace_id`), plan + `subscriptions_platform.status`, member count, `billing_state`,
  `created_at`.
- `admin_list_users(p_search text, p_limit int, p_offset int)` → profiles + membership count + last auth event.
- `admin_get_workspace(p_id uuid)` → detail bundle (settings, members, subscription, recent jobs, overrides).
- `admin_list_jobs(p_status text, p_type text, p_limit int)` → `public.jobs` across all workspaces + workspace name.
- `admin_flag_enabled(p_key text, p_workspace uuid)` → bool. Resolution: override row → flag `default_on`.
  **Granted to `authenticated`** (app-side gating) and internally callable; still safe (returns only a bool).

**Mutations** (each writes an `admin_audit_log` row)
- `admin_set_feature_flag(p_key, p_default_on, p_description, p_category)` — upsert registry.
- `admin_set_flag_override(p_key, p_workspace, p_enabled)` — upsert override; `p_enabled null` deletes it.
- `admin_suspend_workspace(p_id, p_reason)` / `admin_unsuspend_workspace(p_id)` — flip `ws_status`
  (`'suspended'` ↔ `'active'`) + audit. **Enforcement retrofit deferred (§9).**
- `admin_retry_job(p_id)` — reset `status='queued'`, `run_after=now()`, clear `locked_by/locked_at`, `error`.
- `admin_discard_job(p_id)` — set `status='failed'`, `error='discarded by admin'`.
- `admin_end_impersonation(p_id)` — set `ended_at=now()` + audit `impersonate.end`.

`ws_status` gains `'suspended'`: `alter type public.ws_status add value if not exists 'suspended';`
(real schema change → DECISIONS D-075). A helper `workspace_suspended(ws uuid) returns boolean` ships so
future write-policies can adopt `and not workspace_suspended(workspace_id)` — the cross-module retrofit is
the deferred piece.

---

## 5. Edge Function + shared auth

Only impersonation needs service-role beyond RLS (GoTrue admin session mint).

- **`_shared/auth.ts`** gains:
  ```ts
  export async function requirePlatformAdmin(userDb: SupabaseClient): Promise<Response | null> {
    const { data } = await userDb.rpc("is_platform_admin");
    return data === true ? null : err(403, "not_platform_admin", "Platform admin required");
  }
  ```
- **`functions/admin-impersonate/index.ts`** (`verify_jwt=true`): `authUser(req)` → `requirePlatformAdmin(userClient(req))`
  → insert `impersonation_sessions` (expires_at = now + 30 min) → insert `admin_audit_log` (`impersonate.start`,
  both identities) → **mint a scoped session for the target via GoTrue admin API** (`auth.admin.generateLink` /
  `createSession`). The live mint is **carried** (no hosted project); the row/expiry/audit/banner are fully
  built and probe-tested. Returns the impersonation context envelope.

All other admin mutations are DB-only → definer RPCs (§4), no extra Edge surface. `config.toml` entry for
`admin-impersonate`.

---

## 6. Cron (JOBS-AND-WORKERS §5)

- **`m44-impersonation-expiry-sweep`** — `pg_cron`, `*/1 * * * *`: `update impersonation_sessions set
  ended_at = now() where ended_at is null and expires_at < now()` + one audit row per closed session.
  Guaranteed 30-min expiry server-side even if the client never calls end. Guarded for PGlite (try/notice).

No new job **type** (jobs monitor only reads/retries existing rows). No metered action (Gate 3 = none).

---

## 7. Frontend — `/admin` app

Files: `frontend/m44-admin-platform-ops.html` · `frontend/styles/m44-admin.css` · `frontend/js/m44-admin.js`.
Reuses `tokens.css` + `components.css` verbatim. Hash-routed like every module. Mono numerals, `.5px`
hairlines, 3 fonts, glass by zone, no shimmer, dark = no stars.

**Gate:** on load read the `platform_admin` claim; non-admins get a designed **403 "Restricted" screen**.
Server RPCs enforce regardless — the client gate is cosmetic (Gate-2 discipline).

**Routes**
- `/admin` **Overview** — KPI strip (workspaces · users · active subs · MRR est. · jobs q/r/f · error rate),
  recent admin-audit feed, quick actions.
- `/admin/directory` — searchable workspaces/agencies table (name · plan · sub status · members · created ·
  `billing_state`/suspended pill) + a users tab; row → **detail drawer** with suspend/unsuspend, per-workspace
  flag overrides, and an **Impersonate launcher** (required reason field).
- `/admin/jobs` — cross-workspace jobs monitor: status/type filters, status counts, table (type · workspace ·
  status · attempts · run_after · error), retry / discard on failed rows, manual + interval refresh.
- `/admin/flags` — registry list (key · default toggle · category · description), add-flag, per-workspace
  overrides sub-panel.
- **Impersonation banner** — global component; visible while a session is active; "Return to admin" ends it.

**States (Gate 5):** default (real/sample data) · empty (designed) · loading (calm, token-based, no shimmer) ·
error (envelope codes → human copy + retry). Mockup preview switcher with a visible "sample data" label.
**Responsive** 360/768/1280, no page h-scroll (tables own their overflow). **Both themes.** `prefers-reduced-motion`.

---

## 8. Verification — `workers/verify/m44probe.mjs` (PGlite, real Postgres)

- **Gate:** a non-platform-admin caller is rejected by *every* admin RPC (`not_platform_admin`); a
  platform-admin caller succeeds.
- **Cross-tenant:** `admin_list_workspaces/users/jobs` return rows from *all* workspaces for a platform admin;
  a normal member calling them is denied; `feature_flag_overrides` / `impersonation_sessions` /
  `admin_audit_log` cross-tenant read blocked for non-admins.
- **Flags:** `admin_flag_enabled` resolves override→default correctly (on, off, no-override).
- **Impersonation:** session row created with `expires_at = +30 min`; the sweep closes an expired session;
  audit rows carry both `actor_user_id` and `acting_as_user_id`.
- **Jobs:** `admin_retry_job` returns a row to `queued` + clears lock/error; `admin_discard_job` → `failed`.
- **Append-only:** `admin_audit_log` UPDATE/DELETE = 0 rows; INSERT only via definer/service-role.
- **No regressions:** run the full existing probe suite + Gate-8 greps clean.

---

## 9. Deferred / carried (honest, never faked green)

- **Live GoTrue impersonation mint** (the actual JWT session-swap) — needs hosted Supabase + admin API; row,
  expiry, audit, banner built and probe-tested; mint carried.
- **Minting the `platform_admin` claim** onto an operator's `app_metadata` — hosted console / admin API; the
  console formalizes the surface but claim-minting is carried (D-072).
- **Suspension read-only enforcement** — `ws_status='suspended'` flips + audits now; the cross-module
  write-policy retrofit (`and not workspace_suspended(...)`) + app-shell read-only banner are deferred (D-075).
- **Everything in §1 "Deferred"** — plan editor/coupons, credits/trial/plan-change (M03 live Stripe carried),
  margin/MeterCost, marketplace (M39), GDPR/A2P/abuse rollups (M05/M36), announcements/maintenance,
  support tooling — scaffold + DECISIONS, built in later phases.
- **Live cron sweep + Realtime jobs refresh** against a hosted project — carried (no Docker/CLI/Deno here).

---

## 10. DECISIONS to add (claim **D-070…D-075**; reconcile on merge with parallel S11–S13)

- **D-070** M44 admin console reads/writes cross-tenant via `is_platform_admin()`-gated `SECURITY DEFINER`
  RPCs (RLS scopes normal reads to membership); the gate is line 1 of every admin function.
- **D-071** M44 ships its own platform-scoped **append-only `admin_audit_log`** now; distinct from M00
  `auth_events` (D-017) and the future M07 `audit_log`, which may later generalize it.
- **D-072** Impersonation = `impersonation_sessions` row + dual-identity audit + 30-min `pg_cron` expiry +
  UI banner; the live GoTrue session-mint and `platform_admin` claim-minting are carried (no hosted project).
- **D-073** "Infra monitor" on the locked stack = `public.jobs` monitor (retry/discard/counts) + `pg_cron`
  health + M41 health rollup. PRD's BullMQ/Bull Board/Redis/Sentry references are superseded (dead stack).
- **D-074** Feature flags = `feature_flags` (global) + `feature_flag_overrides` (per-workspace) +
  `admin_flag_enabled(key, ws)` definer resolver (override→default); SELECT-registry = authenticated,
  writes = platform-admin; kill-switch = flip `default_on` false.
- **D-075** M44 slice: `ws_status` gains `'suspended'` (audited flip); full suspension read-only enforcement,
  plan editor, credits, margin, marketplace, announcements, and support tooling deferred to later phases.

---

## 11. Docs updated at close (Gate 9)

DATA-SCHEMA (M44 tables note) · DECISIONS (D-070…D-075) · JOBS-AND-WORKERS §5 (`m44-impersonation-expiry-sweep`
cron) · `config.toml` (`admin-impersonate`) · `verify.sh` (m44 step) · `seed.sql` (2–3 flags, a platform-admin
profile, sample impersonation + audit rows) · `leak_probe.sql` (M44 read/write guards) · TASKS.md (Session 14
close + carry-overs + human-reconcile flag for the `0017`/`0012` collisions).
