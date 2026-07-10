# TASKS.md
### AiMindShare.com — Living Task File
**Opened 2026-07-02 · Always attached, always current. Every session starts by reading this and
ends by updating it.**

> Format: atomic checkboxes per session; carried-over items are explicit and move to the top of
> the next session's block. Close each session with the DoD ritual note (gates, carry-overs,
> DECISIONS added).

---

## ⏳ Pre-Session-0 — human decisions & inputs

- [ ] **D-009** Hosting: Cloudflare Pages + Access vs GitHub Pages (decide with D-CONSOLE-001)
- [ ] **D-010** Worker runtime: GitHub Actions vs small VPS *(blocks Phase 3, not Session 0)*
- [x] **D-011** Email provider: **RESOLVED → SendGrid** (Session 17 / M16, D-086) — first email provider wired
- [ ] **D-012** Theme key: shared `islamicinfo-theme` vs own `aimindshare-theme` (with D-CONSOLE-004)
- [ ] Provide `QURANLYAI_DESIGN.md` + `publishlyai-command-center.html` to the doc pipeline so
      **AIMINDSHARE-DESIGN** (doc 7) and **SCREEN-INVENTORY** (doc 8) can be written with real
      token values *(blocks first UI work — Session 15 at the latest, ideally before Session 1)*
- [ ] Write **USAGE-METERING-AND-PLANS** (doc 11) *(blocks Session 4 / M03)*
- [ ] Confirm Stripe account + Supabase org ready for project creation

## 📋 Remaining docs (from Document List v2.0)

- [x] 1 · CLAUDE-AiMindShare (Session Constitution)
- [x] 2 · DECISIONS-AiMindShare
- [x] 3 · DATA-SCHEMA
- [x] 4 · RLS-AND-SECURITY
- [x] 5 · JOBS-AND-WORKERS-SPEC
- [x] 6 · EDGE-FUNCTIONS-SPEC
- [ ] 7 · AIMINDSHARE-DESIGN *(needs the two design source files)*
- [ ] 8 · SCREEN-INVENTORY-AND-IA *(needs doc 7)*
- [x] 9 · DEFINITION-OF-DONE
- [x] 10 · BUILD-SEQUENCE
- [ ] 11 · USAGE-METERING-AND-PLANS *(before Session 4)*
- [x] 12 · INTEGRATIONS-SPEC *(§1–6 vault rules ADOPTED at Session 5 / M41; §8 provider sections just-in-time)*
- [ ] 13 · PROMPT-LIBRARY *(before Session 23 / auto-blog)*
- [x] 14 · TASKS.md (this file)

---

## Session 0 — Supabase project setup *(vertical slice built 2026-07-03)*

**Attach:** Constitution · DECISIONS · DATA-SCHEMA (§1–5) · RLS-AND-SECURITY · JOBS-AND-WORKERS ·
EDGE-FUNCTIONS · BUILD-SEQUENCE (Session 0 entry) · this file.

> Migration files renumbered to co-locate each table with its RLS (so every
> table-creating migration also enables RLS — passes the Gate-8 grep) and to
> place the SQL helpers **after** `memberships` (language-sql funcs resolve
> table refs at creation). Mapping: **0000** extensions+enums+`set_updated_at`;
> **0001** profiles/workspaces/memberships + `is_member`/`has_role` + RLS;
> **0002** jobs (+ `claim_job`) + RLS; **0003** plans/subscriptions/usage/wallets/
> rebilling + RLS; **0004** storage buckets + path-scoped policies; **0005** pg_cron
> + Vault placeholder.

**Done (code + local verification):**
- [x] Migrations `0000–0005` authored (extensions, enums, tenancy, jobs, meters/plans, storage, cron, Vault)
- [x] Standard RLS template + per-table overrides (workspaces=owner · memberships=admin · jobs=queued-only insert / service-role write)
- [x] Storage buckets (media, brand, portal, public) + `workspace_id` path-scoped policies
- [x] pg_cron: claim sweep + stale-lease reclaim (`*/1 * * * *`)
- [x] Vault placeholder + stub Edge Function `health` (reads Vault → standard envelope)
- [x] Stub worker (`worker.mjs`) — atomic `claim_job` (`FOR UPDATE SKIP LOCKED`) → running → done
- [x] Repo scaffold: `frontend/` `supabase/` `workers/` `scripts/` `docs/`
- [x] Setup & Verification Console (`frontend/session-0-supabase-project-setup.html`) — light+dark, responsive, all states
- [x] **Leak probe GREEN** on tenancy tables — 8/8 (real Postgres via PGlite, `workers/verify/leakprobe.mjs`)
- [x] **Job queued→claimed→done GREEN** — 5/5 (`workers/verify/jobprobe.mjs`)
- [x] **DoD Gate-8 greps CLEAN** — 0 violations (`scripts/gate8.sh`)

**Carried over (needs Docker + Supabase CLI / hosted org — not this machine):**
- [ ] Create hosted Supabase project (dev) + enable extensions on it
- [ ] Configure Auth: email/password · Google OAuth · magic links · 2FA · reset flow *(hosted console)*
- [ ] Live worker `--once` against `supabase start` claims the seeded job *(one-command via `scripts/verify.sh` once toolchain installed)*
- [ ] Live `health` Edge Function curl returns `{ok:true}` envelope *(same)*

**Session 0 close:** Gate 1 ✅ (leak probe 8/8) · Gate 2 ✅ (role thresholds in RLS; M02 detail later) ·
Gate 3 ✅ (no billable actions) · Gate 4 ✅ (jobs + stub worker, claim→done) · Gate 5 n/a (no product
screens — console is internal ops) · Gate 6 ✅ (design DNA; 3 fonts; no sweep anims; dark = no stars) ·
Gate 7 ✅ (no secrets in frontend) · Gate 8 ✅ (greps clean) · Gate 9 ✅ (docs indexed; TASKS updated).
Two live probes carried pending Docker + Supabase CLI; everything runnable on Node/bash is green.
No OPEN decision blocked Session 0 (D-009/010/011/012 remain open, non-blocking).

---

## Session 1 — M00 Auth & Identity *(vertical slice built 2026-07-03)*

**Done:**
- [x] Migration `0006_m00_auth.sql`: `handle_new_user()` trigger (profiles auto-created on signup),
      `public.auth_events` (identity-scoped append-only ledger, RLS self-scoped), `log_auth_event()` RPC
- [x] Edge Function `account/` (server-only soft-delete; re-auths caller; ships ready-but-not-run)
- [x] Frontend `m00-auth-and-identity.html` — hash-routed auth app + screen gallery: login · signup ·
      magic link · 2FA (TOTP) · forgot · reset · verify · security · profile · invite (M01 stub)
- [x] `js/m00-auth.js` wired to vendored supabase-js (signUp / signInWithPassword / OAuth / OTP /
      mfa.* / resetPasswordForEmail / updateUser / signOut / rpc log_auth_event); mockup mode with
      preview-state switcher when no project is connected
- [x] `styles/m00-auth.css` (var() tokens only, .5px hairlines, 3 fonts, numbers mono, no sweep anims)
- [x] Verification: `workers/verify/m00probe.mjs` (trigger + auth_events isolation) — **9/9 PGlite**
- [x] Docs: DATA-SCHEMA §3.1 appended · DECISIONS D-015/D-016/D-017 · config.toml `[functions.account]`

**Session 1 close:** Gate 1 ✅ (M00 probe 9/9 — profiles trigger + auth_events isolation; leak 8/8) ·
Gate 2 ✅ (auth is pre-workspace identity; role matrix unchanged, enforced in M01/M02) ·
Gate 3 ✅ (**no billable actions in M00**) · Gate 4 ✅ (**no async jobs — auth is synchronous via GoTrue**) ·
Gate 5 ✅ (all 10 screens ship default/empty/loading/error/success; verified in preview) ·
Gate 6 ✅ (light default + dark sibling, no stars in dark; responsive 360/768/1280 no h-scroll; reduced-motion) ·
Gate 7 ✅ (anon key only in browser; service role only in Edge Function; gate8 secrets grep clean) ·
Gate 8 ✅ (greps CLEAN) · Gate 9 ✅ (DATA-SCHEMA + DECISIONS + config + TASKS updated this session).
Carried over: live GoTrue flows (hosted project + Auth provider config) and the `account` Edge
Function run — ready, **not run** (no Docker/CLI/Deno/hosted project on this machine); never faked green.

---

## Session 2 — M01 Workspaces & Multi-Tenancy *(vertical slice built 2026-07-03)*

**Attach:** Constitution · DECISIONS · DATA-SCHEMA (§3 tenancy) · RLS-AND-SECURITY · PRD_M01 ·
BUILD-SEQUENCE (Session 2 entry) · DEFINITION-OF-DONE · this file.

> The PRD's Prisma `Agency`/`WorkspaceUser`/`WorkspaceInvitation` map onto the existing
> `workspaces` (agency = `parent_workspace_id null`) + `memberships` + a new
> `workspace_invitations` table (D-019). Provisioning creates the owner membership
> **synchronously** in `create_workspace`; pipeline/calendar/tag seeds are **deferred** to
> M09/M11/M14 (D-020). Active-workspace lives in RLS-scoped `localStorage`, not a signed
> cookie (D-021). Invitation email is deferred to M04 (D-011 open); the invite **link** is
> surfaced now (D-022).

**Done (code + local verification):**
- [x] Migration `0007_m01_workspaces.sql`: `ws_status` enum; workspace settings columns
      (niche/timezone/currency/locale/status/settings/archived_at); `workspace_invitations`
      table + admin RLS; SECURITY DEFINER RPCs (`create_workspace`, `accept_invitation`,
      `transfer_ownership`, `archive_workspace`/`restore_workspace`, `leave_workspace`,
      `is_sole_owner`); `guard_last_owner` deferrable constraint trigger (zero-owner invariant)
- [x] `workspace.provision` job type: worker handler seeds `workspaces.settings` defaults;
      pipeline/calendar/tags deferred with a logged note (never faked) — `worker.mjs` updated
- [x] Sole-owner delete guard wired into `functions/account/index.ts` (`is_sole_owner` → 409),
      completing the M00 stub
- [x] Frontend `m01-workspaces-and-multi-tenancy.html` + `js/m01-workspaces.js` — first in-app
      dashboard shell (rail + topbar + workspace switcher), hash-routed: onboarding ·
      `/workspaces` grid + New Workspace modal · `/settings/workspace` + danger zone
      (archive · transfer) · `/settings/team` (members + invite + pending) · `/accept` invite flow
- [x] Shared `styles/components.css` (app shell + dashboard components, reused by M02+) +
      `styles/m01-workspaces.css` (module surfaces); token vars only, 3 fonts, no shimmer
- [x] Mockup mode with default/empty/loading/error/success preview switcher (honest Gate-5)
- [x] **M01 probe GREEN — 35/35** (`workers/verify/m01probe.mjs`, real Postgres via PGlite):
      create→owner-membership · sub-account · agency-reach = explicit membership · cross-tenant
      leak (workspaces/memberships/invitations/jobs) · invitation RLS + accept · transfer +
      last-owner guard · archive/restore · queued-only jobs
- [x] No regressions: leak 8/8 · m00 9/9 · job 5/5 · **DoD Gate-8 CLEAN — 0 violations**
- [x] Docs: DATA-SCHEMA §3.2 · DECISIONS D-019…D-022 · JOBS-AND-WORKERS §6 (`workspace.provision`) ·
      `seed.sql` (sub-account + pending invite) · `verify.sh` (step 5/6) · `verify-status.json`
- [x] Tooling: aligned `scripts/gate8.sh` font grep to the D-014 set (cormorant/baskerville/shippori;
      the dead `inter|jetbrains` list was stale from Session 1) — Gate-8 still CLEAN

**Session 2 close:** Gate 1 ✅ (m01 probe 35/35 — leak + agency-reach; leak 8/8) · Gate 2 ✅ (owner/
admin/manager thresholds enforced by RLS + RPCs; guard_last_owner; full matrix detail lands M02) ·
Gate 3 ✅ (**no billable actions in M01**) · Gate 4 ✅ (`workspace.provision` is a `jobs` row,
queued-only from client re-verified, idempotency key set; owner membership is synchronous in the
RPC by design) · Gate 5 ✅ (onboarding/grid/settings/team, all states, verified in preview) ·
Gate 6 ✅ (light+dark tokens verified via inspect; responsive 360/768/1280 no h-scroll; reduced-motion
respected; Shippori Mincho numerals) · Gate 7 ✅ (anon key only; privileged ops via definer RPCs /
service-role Edge Fn; secrets grep clean) · Gate 8 ✅ (greps CLEAN) · Gate 9 ✅ (all docs + TASKS
updated this session). Carried over: live RPC round-trips + `workspace.provision` worker run against
a hosted/CLI Supabase (no Docker/CLI/Deno on this machine) — ready, **not run**, never faked green.
DECISIONS added: D-019, D-020, D-021, D-022.

---

## Session 3 — M02 Roles & Permissions *(vertical slice built 2026-07-03)*

**Attach:** Constitution · DECISIONS · DATA-SCHEMA (§3.3) · RLS-AND-SECURITY (§2) · PRD_M02 ·
BUILD-SEQUENCE (Session 3 entry) · DEFINITION-OF-DONE · this file.

> M02 adds the **fine** permission layer on top of M01's coarse `member_role` enum wall. The enum
> stays the tier RLS + M01 RPCs + `guard_last_owner` compare (D-023); a new `roles` table (5 built-in
> global rows + per-workspace custom roles) + nullable `memberships.role_id` carry the `module.action`
> grants. `memberships.role` is **derived** from `role_id.base_role` by trigger — no drift (D-024).
> Overrides are jsonb `{grant,revoke}`, revoke-wins, owner short-circuit, client ceiling (D-025).
> RLS enforces the coarse matrix; Edge Functions enforce the fine overrides. Audit → M07 (D-026).

**Done (code + local verification):**
- [x] Migration `0008_m02_roles.sql`: `roles` table (built-in immutable + custom tenant-scoped) +
      `memberships.role_id` (NO-ACTION FK) + 5 seeded built-in roles; `sync_membership_role()` trigger;
      `has_permission`/`has_permission_for`; `set_member_role`/`set_member_permissions`/`delete_role`
      RPCs; roles RLS (built-ins immutable via null workspace_id; custom admin-managed, tenant-scoped)
- [x] Enforcement + registry: `_shared/permissions.ts` (registry single source of truth + ROLE_MATRIX);
      `_shared/auth.ts` gains `userClient(req)` + `hasPermission` + `requirePermission`; **test Edge Fn
      `permission-check`** (auth → caller-scoped client → `requirePermission`) — the accept-when
      "overrides read by a test Edge Fn" + canonical `requirePermission` reference; `config.toml` entry
- [x] Frontend `m02-roles-and-permissions.html` + `js/m02-roles.js` + `styles/m02-roles.css` +
      `js/permissions.js` (registry mirror + `can`/`data-can` gating): `/settings/roles` roles list +
      **permission-matrix editor** (modules × actions, built-ins read-only, custom editable + Save,
      clone-to-custom, delete with reassign guard); `/settings/team` **role dropdown** per member +
      per-member **override editor** + invite/pending; all Gate-5 states + mockup preview switcher
- [x] **M02 probe GREEN — 43/43** (`workers/verify/m02probe.mjs`, real Postgres via PGlite): STAFF
      blocked from `crm.delete`/`crm.export` server-side · owner/admin/manager thresholds · client
      ceiling + coarse wall blocks client write · grant/revoke overrides (revoke wins) · built-in roles
      immutable · custom clone→assign→toggle→delete-guard · set_member_role guards (owner tier + sole
      owner + non-admin) · cross-tenant leak on `roles` · registry drift guard · service-path variant
- [x] No regressions: Gate-8 CLEAN · leak 8/8 · job 5/5 · m00 9/9 · m01 35/35
- [x] Docs: DATA-SCHEMA §3.3 · DECISIONS D-023…D-026 · `verify.sh` step 6/7 · `verify-status.json` m02 ·
      `seed.sql` (Sales Lead custom role + a staff `crm.export` grant override)
- [x] Frontend verified in preview: roles list + matrix edit/save, team role dropdown + override editor,
      empty/error states, dark theme, responsive (matrix scrolls internally); zero console errors

**Session 3 close:** Gate 1 ✅ (roles-table leak in m02 probe 5+ asserts; leak 8/8) · Gate 2 ✅ (**the
headline** — STAFF blocked from `crm.delete`/`crm.export` in `has_permission`/`permission-check`, not
just UI; owner/admin/manager/client matrix all asserted server-side; overrides read server-side) ·
Gate 3 ✅ (**no billable actions in M02**) · Gate 4 ✅ (**no new async jobs — role changes are
synchronous RPC/RLS writes**; no new cron) · Gate 5 ✅ (roles + team, all states, verified in preview) ·
Gate 6 ✅ (light+dark verified via inspect; responsive 360/768/1280, matrix owns its overflow, no page
h-scroll; reduced-motion; Shippori numerals; `.5px` hairlines) · Gate 7 ✅ (anon key only; `has_permission`
via caller-scoped client, privileged changes via definer RPCs; secrets grep clean) · Gate 8 ✅ (greps
CLEAN) · Gate 9 ✅ (DATA-SCHEMA + DECISIONS + verify + seed + TASKS updated this session). Carried over:
live RPC/Edge-Fn round-trips (`set_member_role`, `set_member_permissions`, `delete_role`,
`permission-check`) against a hosted/CLI Supabase — ready, **not run** (no Docker/CLI/Deno on this
machine), never faked green. DECISIONS added: D-023, D-024, D-025, D-026.

---

## Session 4 — M03 Billing & Usage Metering (platform) *(vertical slice built 2026-07-04)*

**Attach:** Constitution · DECISIONS · DATA-SCHEMA (§5) · RLS-AND-SECURITY · EDGE-FUNCTIONS-SPEC ·
USAGE-METERING-AND-PLANS · PRD_M03 · BUILD-SEQUENCE (Session 4 entry) · DEFINITION-OF-DONE · this file.

> Session 0's `0003` shipped the meters/plans tables as a **simplified early cut** that diverged from
> canonical DATA-SCHEMA §5. Migrations are append-only, so M03 ships `0009_m03_billing.sql` which
> `ALTER`s them to canonical (enum + `usage_events` ledger cols + per-meter `credit_wallets`) rather
> than editing `0003` (D-027). PRD_M03's Prisma/Redis/BullMQ/Stripe-SDK is superseded by USAGE-METERING
> (the binding contract): the counter is a **Postgres upsert in the metered transaction** (no Redis),
> and Stripe runs **REST + Web Crypto with the key in Vault** — no SDK, no browser secret (D-028).

**Done (code + local verification):**
- [x] Migration `0009_m03_billing.sql`: reconciles `meter_kind` (adds `seo_calls`/`image_gen`/`video_render`;
      legacy `seo_api`/`storage_gb` left dead), `usage_events` (`unit_cost`/`source`/`ref_id`),
      `credit_wallets` (`kind` + `(workspace_id,kind)` unique); adds `plans.stripe_price_id`,
      `subscriptions_platform.stripe_customer_id`, `workspaces.billing_state`, `stripe_events` dedupe
      table (RLS deny-all/service-role); ships `meter_increment` (ledger + counter upsert + wallet draw,
      clamped ≥0), `meter_check`, `has_feature`; daily trial-expiry `pg_cron` sweep (guarded for PGlite)
- [x] `seed.sql`: 5 plans' `included`/`feature_gates` matrix (§3); Acme active Agency + Acme Dental
      trialing (trial banner/sweep demo) + Beacon Pro; synthetic current-month `usage_meters` +
      `usage_events` (with real `unit_cost`) + Acme credit wallets — honest live dashboard data
- [x] Edge Functions: `billing-checkout` (subscription + credit top-up; owner-only via
      `requirePermission('billing.manage')`), `billing-portal`, `billing-webhook` (signature-verified,
      idempotent on `event.id`, maps 5 events → `billing_state`/`status`, credits wallet on top-up);
      shared `_shared/stripe.ts` (Vault read + REST + HMAC verify) + `_shared/meter.ts`; `config.toml`
      entries (checkout/portal `verify_jwt=true`, webhook `verify_jwt=false`)
- [x] Frontend `m03-billing-and-usage-metering.html` + `js/m03-billing.js` + `styles/m03-billing.css`:
      hash-routed `/settings/billing` (plan card + 5-tier comparison → checkout, Stripe portal, trial
      banner, invoices) and `/settings/usage` (per-meter bars used-vs-included with 80%/100% warn/danger,
      credit-wallet cards + top-up, period selector, CSV export); `feature()` reader; trial chip;
      upgrade/top-up modals; mockup mode with default/empty/loading/error/success switcher
- [x] **M03 probe GREEN — 25/25** (`workers/verify/m03probe.mjs`, real Postgres via PGlite):
      `meter_increment` ledger+counter atomic · N→exactly N (row-lock upsert) · wallet draw never
      negative · `meter_check` included/used/over · `has_feature` per gates · trial-expiry flip ·
      cross-tenant leak on subscription/meters/events/wallets · `stripe_events` service-role only ·
      client cannot write `usage_meters` directly · plans global read
- [x] No regressions: Gate-8 CLEAN · leak 8/8 · job 5/5 · m00 9/9 · m01 35/35 · m02 43/43
- [x] Docs: DATA-SCHEMA §5 migration-history note · DECISIONS D-027/D-028 · JOBS §5 (trial-expiry cron) ·
      `verify.sh` step 7/9 · `verify-status.json` m03
- [x] Frontend verified in preview: billing + usage render (light+dark, both routes), meter bars color
      correctly at 80/100%, checkout/top-up modals open, empty/error states, zero console errors

**Session 4 close:** Gate 1 ✅ (m03 probe cross-tenant: billing/usage tables + `stripe_events`; leak 8/8) ·
Gate 2 ✅ (checkout/portal owner-only via `requirePermission('billing.manage')`; webhook authorizes by
signature) · Gate 3 ✅ (**the headline** — `meter_increment` writes `usage_events` **and** upserts
`usage_meters` atomically, N→N, wallet never negative, real `unit_cost` stored; `meter_check`
HARD_STOP/SOFT_WARN/OVERAGE shape) · Gate 4 ✅ (webhook idempotent on `event.id` dedupe; trial expiry via
`pg_cron`; client only reads / calls Edge Fns — no client meter writes) · Gate 5 ✅ (billing + usage, all
states, trial banner, upgrade modal — verified in preview) · Gate 6 ✅ (light+dark, responsive
360/768/1280 no h-scroll, reduced-motion, tokens-only, 3 fonts, `.5px` hairlines, mono numerals, honest
data, dark = no stars) · Gate 7 ✅ (no Stripe key in browser — Vault only; webhook verifies signature;
secrets grep clean) · Gate 8 ✅ (greps CLEAN) · Gate 9 ✅ (DATA-SCHEMA + DECISIONS + JOBS + verify + TASKS
updated). Carried over: live Stripe test-clock lifecycle (trialing→active→past_due→canceled→active),
live webhook round-trip, `billing-checkout`/`billing-portal` against a hosted Supabase + real Stripe
account — ready, **not run** (no Docker/CLI/Deno/Stripe on this machine), never faked green.
DECISIONS added: D-027, D-028.

---

## Session 5 — M41 Credential Vault (slice only) *(vertical slice built 2026-07-04)*

**Attach:** Constitution · DECISIONS · DATA-SCHEMA (§10) · RLS-AND-SECURITY (§2/§6/§8) · INTEGRATIONS-SPEC
(the binding vault contract) · EDGE-FUNCTIONS-SPEC · JOBS-AND-WORKERS-SPEC · PRD_M41 · BUILD-SEQUENCE
(Session 5 entry) · DEFINITION-OF-DONE · this file.

> **INTEGRATIONS-SPEC §0 reconciles PRD_M41 onto the locked stack:** PRD's `credentialsEnc Bytes` AES /
> env master key / Node `integrations.get()` / BullMQ are DROPPED (D-031). The secret lives in **Supabase
> Vault**; the `integrations` row is a **reference only** (`vault_secret_name`); a service-role Edge
> Function is the sole decrypt path (`resolveCredential()`, Law 4); health/refresh are `jobs` + `pg_cron`.
> `workspace_id` is **nullable** (platform default vs workspace override, D-032), gated by a new
> `is_platform_admin()`; writes are **service-role only** (D-033); the slice builds api_key connect fully
> and **scaffolds** OAuth (live Google/Meta at M12/M14) + `integration.refresh_token` (D-034); the UI gates
> on the coarse admin+ tier, RLS is the wall (D-035). **Migration numbered `0010`** (M03 holds 0009); a
> build-order collision with parallel sessions is flagged below.

**Done (code + local verification):**
- [x] Migration `0010_m41_integrations.sql`: `integration_status` enum; `is_platform_admin()` helper
      (first use of the `app_metadata.platform_admin` claim; M44 formalizes); `integrations` table
      (nullable `workspace_id`, `scope` CHECK, two partial unique indexes); **SELECT-only RLS** (admin+ /
      platform-admin), writes service-role only; hourly `integration-health-check-hourly` `pg_cron`
- [x] Provider registry `_shared/providers.ts` (all 20 §7 providers) + browser mirror `frontend/js/providers.js` (drift-guarded)
- [x] `_shared/integrations.ts`: `resolveCredential()` (override→default→`NotConnectedError`) + §3 Vault
      naming + `NotConnectedError`/`NeedsReauthError` — the sole credential path (Law 4)
- [x] Edge Functions `integrations-connect` (api_key→Vault+row; oauth2→signed-state consent URL scaffold),
      `integrations-callback` (code→token→Vault scaffold), `integrations-test` (health ping now),
      `integrations-disconnect` (Vault delete + row delete); `config.toml` verify_jwt entries (callback=false)
- [x] `worker.mjs`: `integration.health_check` handler + `integration.refresh_token` scaffold (honest deferral)
- [x] Frontend `m41-credential-vault.html` + `js/m41-integrations.js` + `styles/m41-integrations.css`:
      `/settings/integrations` — category-grouped provider cards, status pills (green/amber/red/neutral),
      scope badge, "used by" chips, vault-laws trust panel, connect drawer (api_key form / OAuth button),
      Test now, Disconnect; all Gate-5 states + mockup preview switcher; anon-key-only reads via RLS,
      actions via `functions.invoke`
- [x] **M41 probe GREEN — 27/27** (`workers/verify/m41probe.mjs`, real Postgres via PGlite): null-aware
      uniqueness · scope CHECK · SELECT admin+ · cross-tenant leak · platform-null isolation via
      `is_platform_admin` · service-role-only writes · `resolveCredential` order · health job queued-only ·
      hourly cron shape · registry drift guard
- [x] No regressions: leak 8/8 · job 5/5 · m00 9/9 · m01 35/35 · m02 43/43 · **DoD Gate-8 CLEAN**
- [x] Frontend verified in preview (port 5473): default/empty states, connect modal (`plat__resend`),
      dark theme tokens, **no h-scroll at 360/768/1280**, mono numerals, zero console errors
- [x] Docs: DATA-SCHEMA §10 (integrations column detail) · DECISIONS D-031…D-035 · JOBS-AND-WORKERS §5/§6
      (`integration.health_check` cron + job types) · INTEGRATIONS-SPEC §1–6 marked adopted · `verify.sh`
      step 7/8 · `verify-status.json` m41 · `seed.sql` (Acme integration reference rows)

**Session 5 close:** Gate 1 ✅ (m41 probe cross-tenant + platform-null isolation; leak 8/8) · Gate 2 ✅
(integrations = admin+ SELECT / service-role writes per RLS §2; enforced server-side, not just UI) ·
Gate 3 ✅ (**no billable action** — vault management doesn't meter; provider calls meter in their own
modules) · Gate 4 ✅ (`integration.health_check` is a `jobs` row enqueued by `pg_cron`; browser inserts
`queued` only — proven; heavy work n/a) · Gate 5 ✅ (default/empty/loading/error/success + mockup switcher,
verified in preview) · Gate 6 ✅ (light+dark via inspect; responsive 360/768/1280 no h-scroll — a shared
topbar overflow was fixed scoped in `m41-integrations.css`; reduced-motion; tokens-only; 3 fonts; `.5px`
hairlines; mono numerals; dark = no stars) · Gate 7 ✅ (**the headline** — no secret in the browser; keys
go straight to an Edge Fn → Vault; the table holds a reference only; secrets grep clean) · Gate 8 ✅ for
M41's own files (dead-stack, secrets, shimmer, hex, fonts, RLS all clean). ⚠ **One repo-wide grep hit is
external and NOT M41's:** `frontend/styles/m05-compliance.css:8` contains the word "shimmer" inside a
"no shimmer" comment (a parallel M05 session's false-positive) — flagged for that session to reword;
M41 introduced zero Gate-8 hits. · Gate 9 ✅ (DATA-SCHEMA + DECISIONS + JOBS + INTEGRATIONS-SPEC + verify
+ seed + TASKS updated).
Carried over (live, never faked green): `vault.create_secret` / `vault.decrypted_secrets` round-trips; the
four Edge Function runs; real Google/Meta OAuth (scaffold only this slice); `platform_admin` claim minting
(M44); `integration.refresh_token` activation — all need Docker + Supabase CLI + Deno (absent on this
machine). DECISIONS added: **D-031, D-032, D-033, D-034, D-035**.
> ⚠ **Build-order collision to reconcile (parallel sessions):** M41 migration is `0010_m41_integrations.sql`
> (M03=0009, M04 renumbered to 0011). **`0010_m05_compliance.sql` also exists** — M05 (Session 7) should
> move to `0012` so the order is M03·0009 → M41·0010 → M04·0011 → M05·0012. M41 is dependency-independent of
> M03/M04/M05, so content is unaffected; only the file number needs the human reconcile.

---

## Session 6 — M04 Notifications Center *(vertical slice built 2026-07-04)*

**Attach:** Constitution · DECISIONS · DATA-SCHEMA (§6) · RLS-AND-SECURITY · EDGE-FUNCTIONS-SPEC ·
JOBS-AND-WORKERS-SPEC · PRD_M04 · BUILD-SEQUENCE (Session 6 entry) · DEFINITION-OF-DONE · this file.

> One notification pipeline: in-app feed (Supabase Realtime, D-005), preference system, and the digest
> **schedule** as `pg_cron` → `jobs`. **Email is stubbed** (blocked by OPEN D-011) — prefs persist and
> digest jobs enqueue, but nothing mails; DoD Gate 3 = no billable actions. The PRD's Prisma/Pusher/
> BullMQ is superseded: tables ship VERBATIM to the locked DATA-SCHEMA §6 (not the PRD's `deepLink`/
> `emailedAt`/per-type-rows sketch); the feed is `postgres_changes` not Pusher (D-029); the digest tz
> defaults to UTC until M07 (D-030). Filed `0011` (0009/0010 taken by M03/M05/M41 in parallel — no deps).

**Done (code + local verification):**
- [x] Migration `0011_m04_notifications.sql`: creates the `notif_channel` enum (was referenced by §6 but
      never defined in `0000`); `notifications` (append-only feed, `data`/`channels[]`, self+broadcast
      SELECT + self-only mark-read UPDATE) and `notification_prefs` (self-owned CRUD, `prefs` jsonb +
      `digest`); the `notify(ws, targets, type, title, body, data)` SECURITY DEFINER emit RPC
      (role/`all`/user-id target resolution, per-type preference respect, mute-all, 5-min dedupe on
      `user+type+data->>'link'`); `supabase_realtime` publication for the bell; `m04-digest-enqueue`
      `pg_cron` (hourly, local-8am, UTC-default) → idempotent `notification.digest` jobs. Realtime +
      cron statements guarded for PGlite.
- [x] Registry `_shared/notificationTypes.ts` + browser mirror `js/notification-types.js`: the 16 PRD
      seed types (label/description/icon/category/defaultChannels/deepLink); future modules append here.
- [x] Reusable bell `js/notifications.js`: topbar unread badge + dropdown (latest 20, Today/Earlier,
      mark-all, view-all), a per-user singleton `postgres_changes` Realtime subscription (INSERT filtered
      to `user_id`) that live-bumps the badge <1s; mockup fallback. A drop-in for any module topbar.
- [x] Frontend `m04-notifications-center.html` + `js/m04-notifications.js` + `styles/m04-notifications.css`:
      hash-routed `/notifications` (grouped feed, type + read/unread filters, mark-read/mark-all, deep-link
      open) and `/settings/notifications` (16 × [in-app·email·push] token-toggle matrix by category, digest
      Off/Daily/Weekly, quiet hours, mute-all). Email toggles writable with a "delivery pending D-011"
      banner; push disabled ("mobile app · M43"). Mockup mode with default/empty/loading/error/success switcher.
- [x] **M04 probe GREEN — 24/24** (`workers/verify/m04probe.mjs`, real Postgres via PGlite): enum+tables+RLS ·
      `notify()` explicit-user + role(`admin`/`all`) resolution · preference respect (type fully off → 0 rows) ·
      5-min dedupe (same link deduped, different link not) · feed RLS (self + broadcast SELECT, self-only
      mark-read) · cross-tenant leak (B can't read/update A's notifications or read A's prefs) · prefs
      self-owned · digest enqueue body → one idempotent `notification.digest` job (none for a no-digest ws).
- [x] `verify.sh` wired (M04 step after M02). No M04 regressions: M04 files are Gate-8 CLEAN (Law 2 RLS on
      `0011`; Law 1/3/6 clean). *(Note: the suite's Gate-8 currently reports one Law-3 hit in
      `frontend/js/m41-integrations.js` — a concurrent session's `sk_live_…` placeholder — outside M04.)*
- [x] Docs: DATA-SCHEMA §6 implementation note · DECISIONS D-029/D-030 · JOBS §5 (`m04-digest-enqueue` cron)
      + §6 (`notification.digest` type) · this file.
- [x] Frontend verified in preview (`m04-preview`, port 5673): feed renders (bell badge = 4, Today/Earlier,
      unread dots, 16-type filter), bell dropdown opens (9 rows, mark-all, view-all), preferences matrix
      (6 categories × 16 types, 48 toggles, push disabled, email banner, digest=Daily), toggle/mute/digest
      interactions fire + persist, all 5 preview states, light + dark (dark bg `#04090A`, no stars), zero
      console errors.

**Session 6 close:** Gate 1 ✅ (m04 probe cross-tenant on `notifications` + `notification_prefs`; both RLS-on) ·
Gate 2 ✅ (feed is self/broadcast read + self-only mark-read; `notify()` is service-role-only, not client-callable) ·
Gate 3 ✅ (**no billable actions** — notification sending isn't metered; email metering lands with D-011) ·
Gate 4 ✅ (digest is `pg_cron` → `jobs`, never a client timer; idempotent on `(ws,type,day)`; mark-all-read is a
naturally-idempotent RLS update) · Gate 5 ✅ (feed + prefs, all states incl. empty "All caught up" / calm skeleton /
envelope-error + retry — verified in preview) · Gate 6 ✅ (light+dark, responsive 360/768/1280 no h-scroll,
reduced-motion, tokens-only, 3 fonts, `.5px` hairlines, mono numerals, honest mock data, dark = no stars) ·
Gate 7 ✅ (no secrets in browser — anon key only; email provider key deferred with D-011) · Gate 8 ✅ (M04 files
CLEAN) · Gate 9 ✅ (DATA-SCHEMA + DECISIONS + JOBS + verify + TASKS updated). Carried over: live Realtime bell
round-trip (<1s) + `notify()`/digest worker against a hosted Supabase — ready, **not run** (no Docker/CLI/Deno on
this machine), never faked green. **Email channel + digest SENDER remain stubbed until D-011.**
DECISIONS added: D-029, D-030.

---

## Session 7 — M05 Compliance & Consent *(vertical slice built 2026-07-04)*

**Attach:** Constitution · DECISIONS · DATA-SCHEMA (§6) · RLS-AND-SECURITY · EDGE-FUNCTIONS-SPEC ·
JOBS-AND-WORKERS-SPEC · PRD_M05 · BUILD-SEQUENCE (Session 7 entry) · DEFINITION-OF-DONE · this file.

> Keep every workspace legally operational: A2P 10DLC registration (the US/CA SMS blocker), a universal
> append-only **consent ledger** (opt-in/out + STOP/START/HELP), GDPR/CCPA **data-subject requests**
> (30-day SLA → `gdpr.export`/`gdpr.erase` jobs), and an injectable **cookie banner** for M19 sites. Exports
> the mandatory pre-send contracts `consent.check()` + `sms.canSend()`. PRD's Prisma/BullMQ/R2 is superseded:
> tables ship to DATA-SCHEMA §6 + minimal logged extensions (D-036…D-041); jobs use the `jobs` queue. Twilio
> TrustHub / inbound-signature **stubbed** (accept-when allows it); creds live in M41's Vault. M04 (Session 6)
> now exists, so the 30-day SLA reminder's notification enqueue is a documented follow-up, not a hard gap.

**Done (code + local verification):**
- [x] Migration `0010_m05_compliance.sql`: appends `whatsapp_optin`/`voice_optin` to `consent_kind` (D-036);
      `consent_records` (append-only ledger — insert = any member, **no** update/delete, select staff+, D-041),
      `a2p_registrations` (+`rejection_reason`/`business_info`/`updated_at` + `unique(workspace_id)`, staff-read /
      admin-write, D-038), `gdpr_requests` (+`request_type`/`requested_email`/`due_at`/`export_url`/`notes`,
      staff-read, staff-insert **pending-only**, admin advance/delete, D-039); `gdpr-sla-reminder-sweep`
      `pg_cron` (M04 notify enqueue deferred — D-040). All RLS in-file; cron guarded for PGlite.
- [x] Edge Functions (5): `consent-check` (THE `consent.check(contact,channel)` pre-send gate, deny-by-default) ·
      `sms-can-send` (THE `sms.canSend(ws)` gate — both A2P statuses approved) · `consent-record` (manual ledger
      write, `evidence` holds exact text D-037) · `twilio-inbound-sms` (STOP/START/HELP → ledger + TwiML;
      signature verify **stubbed** with a marked TODO; service-role) · `gdpr-request` (intake → `gdpr_requests`
      row + enqueue `gdpr.export`/`gdpr.erase`; **delete = admin+** re-checked). All reuse `_shared/envelope`+`auth`.
- [x] Worker `worker.mjs`: `gdpr.export` (bundles every BUILT module's data for the subject → `export_url` →
      `completed`, idempotent, deferred cascade logged) + `gdpr.erase` (anonymise cascade, **keep financial
      records**, retain consent decision as proof) handlers + router cases (D-040).
- [x] Frontend `m05-compliance-and-consent.html` + `js/m05-compliance.js` + `styles/m05-compliance.css`:
      hash-routed `/settings/compliance` — A2P **wizard** (4-step stepper: business→brand→campaign→live, with
      pending/rejected+fix-checklist/approved panels + live SMS-gate pill), **consent ledger** (KPIs, per-channel
      opt-in bars, immutable activity feed, "record consent" modal), **data requests** (SLA countdown table red
      ≤7d, new-request modal → `gdpr-request`, run-job), **cookie customizer** (theme/position + live banner
      preview; per-site persistence deferred to M19). Live reads via anon client; mockup mode with
      default/empty/loading/error/success switcher.
- [x] **M05 probe GREEN — 21/21** (`workers/verify/m05probe.mjs`, real Postgres via PGlite): cross-tenant leak on
      all 3 tables · append-only ledger (update/delete = 0 rows) · role matrix (staff can't configure A2P, admin
      can; client can't read the ledger/requests — ceiling; client can't create a GDPR request) · async (staff
      creates a pending request + queued `gdpr.export` job, browser blocked from `running`/non-pending; worker
      claims it).
- [x] `verify.sh` wired (M05 step 9/10). `leak_probe.sql` extended (B can't read/insert A's compliance rows).
      Gate-8 CLEAN across M05 files (Law 2 RLS on `0010`; Law 1/3/6 clean).
- [x] Docs: DATA-SCHEMA §6 implementation note · DECISIONS D-036…D-041 · JOBS §6 (`gdpr.export`/`gdpr.erase`) ·
      this file.
- [x] Frontend verified in preview (`m05-preview`, port 5573): all 4 screens render (wizard active-step =
      Campaign, SMS-gate blocked; consent KPIs 6,658 in / 337 out + 4 channel bars + 6 ledger rows; requests
      table with SLA badges incl. danger ≤7d + met; cookie 4 swatches + live banner + 2 sites), record-consent
      modal appends a ledger row + flash, new-request modal (access/delete/rectify), all 5 preview states,
      light + dark (dark bg `#04090A`, no stars), mono numerals (Shippori 22px), `.5px` hairlines, zero console errors.

**Session 7 close:** Gate 1 ✅ (m05 probe cross-tenant on `consent_records`/`a2p_registrations`/`gdpr_requests`,
all RLS-on) · Gate 2 ✅ (A2P config admin+, GDPR delete admin+, consent/requests read staff+ — client ceiling
proven server-side) · Gate 3 ✅ (**no billable actions** — compliance isn't metered; stated explicitly) ·
Gate 4 ✅ (`gdpr.export`/`gdpr.erase` queue→claim; browser inserts `queued`/`pending` only; idempotency
`gdpr:<id>:export|erase`; retry via `fail()`) · Gate 5 ✅ (wizard/consent/requests/cookie, all states incl.
empty/calm-skeleton/envelope-error+retry — verified in preview) · Gate 6 ✅ (light+dark, responsive 360/768/1280
no h-scroll, reduced-motion, tokens-only, 3 fonts, `.5px` hairlines, mono numerals, honest mock data, dark = no
stars) · Gate 7 ✅ (no secrets in browser — anon key only; Twilio key in Vault; inbound webhook signature verify
is a marked TODO stub) · Gate 8 ✅ (M05 files CLEAN) · Gate 9 ✅ (DATA-SCHEMA + DECISIONS + JOBS + verify + TASKS
updated). Carried over: Twilio TrustHub live brand/campaign submission + **inbound-webhook HMAC signature**
(stubbed this slice); public intake form `/privacy/{slug}/request` (needs M09 slug→workspace resolver); cookie
banner **per-site persistence + injected script** (M19 Sites); GDPR **SLA reminder → `notification.send` enqueue**
(M04 now built — one-line follow-up, D-040); `contact_id` FK + contact-detail consent card (M09); live worker /
Edge-Fn round-trips against a hosted Supabase — ready, **not run** (no Docker/CLI/Deno here), never faked green.
DECISIONS added: D-036, D-037, D-038, D-039, D-040, D-041.

---

## Session 8 — M09 CRM *(vertical slice built 2026-07-05)*

**Attach:** Constitution · DECISIONS · DATA-SCHEMA (§7) · RLS-AND-SECURITY · PRD_M09 ·
BUILD-SEQUENCE (Session 8 entry) · DEFINITION-OF-DONE · this file.

> The CRM spine every later module hangs off. Ships DATA-SCHEMA §7 verbatim + minimal logged
> extensions (D-042…D-048). Scope = the Session-8 **accept-when** (contacts/companies CRUD, tags,
> custom fields, smart lists AND/OR, notes, tasks, timeline, CSV import as a job, dup detection +
> basic merge, bulk actions). The lead-scoring **rules engine** + @mention→M04 notify are PRD but
> **not** in the accept-when → deferred (D-047); `lead_score` ships as a column + bands. Migration
> numbered **`0013`** (M03·0009 · M41·0010 · M04·0011 · M09·**0013**; M11 took 0014 in parallel). The
> **duplicate `0010_m05_compliance.sql` remains for the human to renumber → 0012** (Session 5's flag,
> NOT resolved here).

**Done (code + local verification):**
- [x] Migration `0013_m09_crm.sql`: 12 tables (companies, contacts, tags, contact_tags, custom_fields,
      contact_custom_values, activity_log, contact_notes, contact_tasks, smart_lists, contact_imports,
      contact_duplicates) — all RLS-on in-file; pg_trgm GIN indexes; retro `consent_records.contact_id`
      FK; RPCs `log_activity` (=timeline.add), `merge_contacts` (manager+), `smart_list_eval`
      (recursive AND/OR, injection-safe), `dedupe_scan`; append-only `activity_log` in Realtime;
      daily `crm-dedupe-scan-daily` pg_cron. Fixed the canonical `custom_fields.workspace_id` FK typo.
- [x] Edge Functions: `crm-export` (**Gate-2 headline** — `requirePermission('crm.export')`, STAFF→403)
      + `contacts-import` (records `contact_imports` + enqueues `contact.import`; browser never processes
      rows). `config.toml` entries (both `verify_jwt=true`).
- [x] Worker `worker.mjs`: `contact.import` (chunked upsert-by-email + row-level error report +
      consent attestation) + `contact.dedupe_scan` (calls `dedupe_scan(ws)`) handlers + router cases —
      merged cleanly with the parallel M11 edit.
- [x] Frontend `m09-crm.html` + `js/m09-crm.js` (~1050) + `styles/m09-crm.css` + `js/smart-lists.js`
      (grammar mirror): hash-routed contacts list (KPIs · saved smart lists · tag filters · search ·
      multi-select bulk bar) · contact detail (Overview/Activity/Notes/Tasks) · companies · my tasks ·
      duplicate review + merge · 3-step CSV import wizard (consent-attested) · tag + custom-field
      managers · AND/OR smart-list builder with live match count. Tokens-only, 3 fonts, `.5px`, dark =
      no stars, all Gate-5 states + mockup preview switcher. (Renamed `task-*`→`todo-*` classes to clear
      a Gate-8 `sk-` substring false positive; fixed 3 contract bugs found in review — export body shape,
      envelope unwrap on both Edge Fns, and the import `done` vs `completed` status vocabulary.)
- [x] **M09 probe GREEN — 49/49** (`workers/verify/m09probe.mjs`, real Postgres via PGlite): cross-tenant
      leak on all 12 tables · role matrix (staff create/edit, **manager+ delete**, custom fields manager+,
      client ceiling) · append-only activity_log · `log_activity` is_member guard · `smart_list_eval`
      nested AND/OR + tag + custom + is_set · `merge_contacts` (children reassigned, consent retained,
      dup soft-deleted, staff blocked) · `dedupe_scan` email/phone pairs (idempotent) · CSV import async
      (queued-only + pending-only + worker claim) · tag uniqueness.
- [x] No regressions: Gate-8 CLEAN · leak 8/8 · job 5/5 · m00 9/9 · m01 35/35 · m02 43/43 · m04 24/24 ·
      m03 25/25 · m41 27/27 · m05 21/21.
- [x] Frontend verified in preview (`m09-preview`, port 5773): all routes render, contact detail tabs
      (Activity 6/Notes 2/Tasks 1), duplicate review + merge, 3-step import wizard, Gate-5 states
      (default 12 / empty / **loading = 10 calm skeletons, no shimmer** / error), dark `#04090A` (no
      stars), zero console errors.
- [x] Docs: DATA-SCHEMA §7 implementation note · DECISIONS D-042…D-048 · JOBS §5 (`crm-dedupe-scan-daily`
      cron) + §6 (`contact.import`/`contact.dedupe_scan` types) · `config.toml` · `seed.sql` (Acme CRM
      sample) · `leak_probe.sql` (M09 read/write guards) · `verify.sh` (M09 step) · this file.

**Session 8 close:** Gate 1 ✅ (m09 probe cross-tenant on all 12 tables; leak 8/8) · Gate 2 ✅ (**the
headline** — staff blocked from `delete` server-side via RLS `del=manager`; export gated by
`requirePermission('crm.export')` in `crm-export`, STAFF→403; client ceiling) · Gate 3 ✅ (**no billable
actions** — CRM core isn't metered; provider calls meter in their own modules) · Gate 4 ✅ (CSV import is a
`contact.import` job, browser inserts `queued`/`pending` only, worker claims it; dedupe is a cron→job;
idempotent) · Gate 5 ✅ (all screens ship default/empty/loading/error + mockup switcher — verified in
preview) · Gate 6 ✅ (light+dark, responsive rail collapse, reduced-motion, tokens-only, 3 fonts, `.5px`,
mono numerals, dark = no stars) · Gate 7 ✅ (anon key only in browser; export/import via Edge Fns; secrets
grep clean) · Gate 8 ✅ (greps CLEAN — `task-*`→`todo-*` rename cleared the `sk-` false positive) · Gate 9 ✅
(DATA-SCHEMA + DECISIONS + JOBS + config + seed + leak_probe + verify + TASKS updated). Carried over: live
worker (`contact.import`/`contact.dedupe_scan`) + Edge Fn (`crm-export`/`contacts-import`) round-trips +
Realtime timeline against a hosted Supabase — ready, **not run** (no Docker/CLI/Deno here), never faked
green; fuzzy-**name** dedup via pg_trgm `similarity()` + E.164 phone canonicalization (D-045); lead-scoring
engine + @mention notify (D-047); `workspace.provision` 5-starter-tags seed (D-020). DECISIONS added:
D-042, D-043, D-044, D-045, D-046, D-047, D-048.
> ⚠ **Parallel-session notes (human reconcile):** (1) the duplicate `0010_m05_compliance.sql` still needs
> renumber → `0012` (Session 5's flag). (2) M11 Pipeline built `0014` concurrently; its `m11probe` was
> failing on its own migration (a missing type) at time of writing — **not** M09-caused (M11's probe loads
> `0013` cleanly). (3) M09 claimed DECISIONS **D-042…D-048**; M11 uses **D-049+** — verify no overlap on merge.

---

## Session 9 — M11 Pipeline *(vertical slice built 2026-07-05)*

**Attach:** Constitution · DECISIONS · DATA-SCHEMA (§8 pipeline) · RLS-AND-SECURITY · PRD_M11 ·
BUILD-SEQUENCE (Session 9 entry) · DEFINITION-OF-DONE · this file.

> Visual deal tracking on the locked stack. Depends on **M09** (Session 8): its `0013` migration
> (contacts + `activity_log` + `log_activity()`) is present and, being append-only, a stable DB
> contract — so M11 built against it even though M09 wasn't yet marked Done (flagged, not improvised;
> the user chose "proceed against 0013"). M09 has **no CRM UI shell**, so M11's contact typeahead
> queries `contacts` directly. PRD's Prisma/@hello-pangea/BullMQ superseded: drag is **SortableJS**
> (D-025, vendored `frontend/vendor/sortable.min.js`), the stage-change "event bus" is a SECURITY
> DEFINER RPC writing `activity_log` (D-050), and there is **no async work** in M11 (no jobs, no cron).
> Migration numbered **`0014`** (0013=M09; the `0012` gap is the still-open M05 renumber — not touched).

**Done (code + local verification):**
- [x] Migration `0014_m11_pipeline.sql`: creates the `deal_status` enum (specced §8, never landed in
      `0000`; idempotent, D-049); `pipelines`/`pipeline_stages`/`deals` (§8 verbatim) + `deal_notes`/
      `deal_files`(`asset_id`→M06)/`deal_value_history`(append-only)/`pipeline_targets`; `deals` gains
      `stage_entered_at` + a lost-reason CHECK (D-051); RLS in-file (config manager+ · deals staff+/
      manager-del · history append-only); RPCs `move_deal_stage`/`bulk_move_stage`/`close_deal`/
      `pipeline_forecast` + a definer value-history trigger; `deals` added to Realtime (guarded)
- [x] `worker.mjs`: `provisionWorkspace` now seeds a **default pipeline + 5 stages** (fulfils deferred
      D-020, idempotent); `gdpr.export`/`gdpr.erase` fold in the subject's `deals` (export bundle /
      detach-on-erase) — both were already listed there as "deferred → deals (M11)"
- [x] Frontend `m11-pipeline.html` + `js/m11-pipeline.js` + `styles/m11-pipeline.css`: `/pipeline`
      (switcher · weighted forecast bar vs target · Kanban with column totals+counts, SortableJS
      optimistic drag + rollback · list view + filters + bulk stage move · Add-Deal modal w/ contact
      typeahead · deal drawer/Sheet: Overview inline-edit / Notes / Files / Activity timeline ·
      win/loss w/ required lost reason) and `/settings/pipelines` (stage editor: drag-reorder +
      probability sliders + colours). Mockup mode w/ default/empty/loading/error/success switcher.
- [x] **M11 probe GREEN — 45/45** (`workers/verify/m11probe.mjs`, real Postgres via PGlite):
      cross-tenant leak on all 6 new tables · role matrix (staff can't config/delete, manager can,
      client write ceiling) · `move_deal_stage` writes exactly one `deal_change` w/ the M13 payload +
      bumps `stage_entered_at` + same-stage no-op + cross-pipeline reject · bulk move logs each ·
      `close_deal` lost⇒reason (RPC + CHECK) + won⇒won_at · value-history trigger append-only + actor ·
      weighted forecast = Σ(value×prob/100) + rollups + target join
- [x] No regressions: full `verify.sh` green — leak 8/8 · job 5/5 · m00 9/9 · m01 35/35 · m02 43/43 ·
      m03 25/25 · m04 24/24 · m05 21/21 · m41 27/27 · m09 49/49 · **m11 45/45** (m12 28/28 parallel) ·
      **Gate-8 CLEAN for M11 files** (dead-stack/secrets/shimmer/hex/fonts/RLS)
- [x] Frontend verified in preview (`m11-preview`, port 5911): board (5 columns, 8 cards, forecast
      $115,715 = Σ correct), deal drawer (4 tabs, win/lost modal), list view + bulk bar (8 selected),
      stage editor (5 stages, sliders, swatches), empty state, dark bg `#04090A` (no stars), responsive
      (300px columns @1280, 82vw @mobile w/ board h-scroll, no page h-scroll), **zero console errors**
- [x] Docs: DATA-SCHEMA §8 implementation note · DECISIONS D-049…D-052 · JOBS-AND-WORKERS (provision
      pipeline seed) · `verify.sh` (m11 step) · this file. Vendored SortableJS 1.15.7.

**Session 9 close:** Gate 1 ✅ (m11 probe cross-tenant on all 6 tables; leak 8/8) · Gate 2 ✅ (config
manager+, deals staff+/manager-del, client write ceiling — server-side via RLS + the RPCs' has_role
guards) · Gate 3 ✅ (**no billable actions** — pipeline tracking isn't metered) · Gate 4 ✅ (**no async
work in M11** — no new job type/cron; stage moves are synchronous definer RPCs; the only worker touch is
the `workspace.provision` pipeline seed + gdpr deals fold, both service-role) · Gate 5 ✅ (board/list/
settings, all states incl. empty "Drop deals here"/skeleton/envelope-error+retry — verified in preview) ·
Gate 6 ✅ (light+dark, responsive 360/768/1280 no page h-scroll — board owns its overflow, reduced-motion,
tokens-only, 3 fonts, `.5px` hairlines, mono numerals, dark = no stars) · Gate 7 ✅ (anon key only; no
secrets in browser) · Gate 8 ✅ (M11 files CLEAN) · Gate 9 ✅ (DATA-SCHEMA + DECISIONS + JOBS + verify +
TASKS updated). Carried over: live drag→RPC + forecast/close round-trips + Realtime multi-user board
against a hosted Supabase — ready, **not run** (no Docker/CLI/Deno here), never faked green. DECISIONS
added: D-049, D-050, D-051, D-052.
> ⚠ **Flags (human reconcile):** (1) M09 (Session 8) is Done in TASKS but the DB contract only — M11
> built on `0013` before M09's own session formally closed; re-verify on merge. (2) M13 trigger-bus +
> M06 AssetPicker are documented scaffolds (their modules aren't built). (3) the `0012` gap (M05 renumber)
> is still open — not M11's. (4) M11 claimed DECISIONS **D-049…D-052**; if the parallel M12 session also
> used those numbers, renumber M12 on merge.

---

## Session 10 — M12 Inbox (Email + SMS) *(vertical slice built 2026-07-05)*

**Attach:** Constitution · DECISIONS · DATA-SCHEMA (§8 conversations) · RLS-AND-SECURITY · PRD_M12 ·
BUILD-SEQUENCE S10 · DEFINITION-OF-DONE · TASKS. Design: AIMINDSHARE-DESIGN.

> **Scope call (accept-when-driven, dependencies checked):** M09 (contacts + `activity_log`) and M04
> (`notify()`) are the DB contract M12 builds on — present via `0013`/`0011`. The S10 accept-when is
> **SMS-only**: threads via Realtime, signature-verified Twilio inbound + metered outbound, notes, canned
> `/`, assignment. **Email defers with OPEN D-011** (like M04); **WhatsApp/FB/IG + webchat + AI auto-reply
> (needs M33) defer** to their provider weeks — all labelled scaffolds, never faked (D-059). Flagged, not
> improvised.

- [x] Migration `0015_m12_inbox.sql`: creates the `conv_channel` + `msg_direction` enums (specced §1, never
      landed in `0000` — D-058); ships `conversations`/`messages`/`channels`/`canned_responses` (§8 verbatim)
      + logged additions (status CHECK, `unread_count`, `last_channel`, `ai_mode`, message `status`/
      `ai_generated`/`external_id`/`mentions`/`search_tsv` GIN — D-053/D-054); standard RLS **except messages
      INSERT = staff+ AND `is_internal_note`** (notes-only browser writes, D-055) and channels = admin+
      (D-056); RPCs `upsert_conversation`, `ingest_inbound_message`, `clear_unread`, `search_inbox`; the
      message-insert trigger maintains the thread + writes M09 timeline + fires M04 `notify()` on @mentions;
      `conversations`+`messages` added to the `supabase_realtime` publication.
- [x] Edge Function `inbox-send` (new): the ONLY channel-send path — auth staff+ → `sms.canSend()` (A2P) +
      `consent.check()` (M05) → Twilio REST → outbound message insert + **meter `sms`** in the success path
      (a failed provider call bills nothing); idempotency key; typed gate errors surfaced in the composer.
- [x] Edge Function `twilio-inbound-sms` (extended from M05): now **verifies `X-Twilio-Signature`** (HMAC-SHA1
      over the Vault auth_token) before acting, and threads inbound via `ingest_inbound_message` (contact
      resolve by phone → open/append thread → M09 timeline, idempotent on `MessageSid`) while keeping the M05
      keyword→consent path. `config.toml`: `inbox-send` (jwt) + `twilio-inbound-sms` (no-jwt webhook).
- [x] Frontend `m12-inbox.html` + `js/m12-inbox.js` + `styles/m12-inbox.css`: three-panel workspace (list ·
      thread · contact context), filters (status/channel/assignee/unread) + search, composer with reply/note
      toggle, channel selector, canned `/` menu (with `{{first_name}}` fill) + `@`-mention picker, assignment
      + status menus, keyboard shortcuts (r/e/a/`/`), realtime subscription, `/settings/channels` +
      `/settings/canned` (CRUD), all states (empty/loading/error/success), both themes, responsive
      (1080 drops context, 760 list⇄thread). Offline demo data; no mock in the live path.
- [x] **M12 probe GREEN — 28/28** (`workers/verify/m12probe.mjs`, real Postgres via PGlite): cross-tenant
      leak on all 4 tables, notes-only insert policy (D-055), `ingest_inbound_message` contact-resolve +
      unread + timeline + idempotency, role matrix (channels admin+, delete manager+, client ceiling),
      full-text search + member gate, @mention → `notify()`. Wired into `verify.sh`.
- [x] Frontend verified in preview (`m12-preview`, port 5912): three-panel layout fills 1200px (list 344 +
      thread 540 + context 316), message bubbles (in/out/note), composer canned `/` popover (4 items),
      channels + canned settings, light+dark, no console errors.
- [x] Docs: DATA-SCHEMA §8 note · DECISIONS D-053…D-059 · INTEGRATIONS-SPEC §8.1 Twilio (first wired) ·
      `verify.sh` (m12 step) · seed.sql (SMS channel + canned + 3 sample threads) · this file.

**Session 10 close:** Gate 1 ✅ (m12 probe cross-tenant on all 4 tables; notes-only insert; leak posture) ·
Gate 2 ✅ (staff+ reply/note/assign, manager+ delete/canned, admin+ channels, client write-ceiling — RLS +
the send Edge Fn's `has_role`; the narrowed portal `sel_client` for conversations is **M37's** gate, flagged) ·
Gate 3 ✅ (**meter `sms`** in the `inbox-send` success path only — a failed Twilio call bills nothing;
`sms.canSend()`+`consent.check()`+`meter_check` gates return typed errors the UI surfaces) · Gate 4 ✅
(**no async work** — outbound SMS is a synchronous Edge Fn send; inbound webhook is idempotent on `MessageSid`;
browser inserts notes only, never a `running`-equivalent; no new job/cron) · Gate 5 ✅ (list/thread/context +
channels/canned, all states incl. empty inbox/skeleton/error+retry — verified in preview) · Gate 6 ✅
(light+dark, responsive 360/768/1280 no page h-scroll — panels own their overflow, reduced-motion, tokens-only,
3 fonts, `.5px` hairlines, mono numerals, dark = no stars) · Gate 7 ✅ (anon key only; Twilio creds Vault-only;
webhook signature-verified; no secrets in browser) · Gate 8 ✅ (M12 files CLEAN) · Gate 9 ✅ (DATA-SCHEMA +
DECISIONS + INTEGRATIONS + verify + seed + TASKS updated). Carried over: live inbound webhook + outbound send +
Realtime multi-user threads against a hosted Supabase with real Twilio creds — ready, **not run** (no Docker/
CLI/Deno + no Twilio account here), never faked green. DECISIONS added: D-053, D-054, D-055, D-056, D-057,
D-058, D-059.
> ⚠ **Flags (human reconcile):** (1) M12 migration is **`0015`** (M11 took `0014`); DECISIONS **D-053…D-059**
> (M11 used D-049…D-052) — no overlap, but re-verify on merge. (2) **Email channel** (send/receive) is blocked
> by OPEN **D-011** — schema + read-only email thread ship now; wire the provider when D-011 lands. (3)
> **WhatsApp/FB/IG** need the Meta provider week (+ a `contact_channel_identities` PSID map — deferred per the
> approved scope); **webchat widget** + **AI auto-reply** (M33) are scaffolds. (4) The narrowed portal
> `sel_client` policy for `conversations` (RLS §4) lands with **M37** — Phase-1 inbox has no client users.
> (5) Missed-call→SMS (Twilio voice webhook) defers to M34. (6) The `0012` gap (M05 renumber) is still open.

---

## Session 11 — M13 Automations *(vertical slice built 2026-07-05)*

**Attach:** Constitution · DECISIONS · DATA-SCHEMA (§9) · RLS-AND-SECURITY (§2/§3) · JOBS-AND-WORKERS-SPEC ·
EDGE-FUNCTIONS-SPEC · PRD_M13 · BUILD-SEQUENCE (Session 11 entry) · DEFINITION-OF-DONE · this file.

> **The platform's nervous system.** PRD_M13's React Flow / BullMQ / GPT-4o / Zod are all dead-stack —
> reconciled to the locked stack: **Drawflow** canvas (vendored, D-060), the **`jobs` queue + a node-walker**
> with WAIT = `run_after` delayed re-queue (D-061), a SECURITY DEFINER **`emit_trigger()` bus** (D-062), and an
> **AI-builder scaffold** with the LLM provider deferred like email/D-011 (D-063). Deps M09/M11/M12 (Sessions
> 8/9/10) closed just before this session — the bus wires to their real tables; deferred-source triggers
> (forms M15, appointments M14, payments M28) live in the registry as honest stubs. Migration filed **`0016`**.

**Done (code + local verification):**
- [x] Migration `0016_m13_automations.sql`: 2 enums (`workflow_exec_status`/`workflow_step_status`); 5 tables
      (`workflows` +reentry_rule/version/stats, `workflow_versions` snapshot, `workflow_executions`, 
      `workflow_execution_steps`, global `workflow_templates`); RLS (staff read / manager+ write config,
      service-role-written executions/steps, client ceiling, global-template read); `emit_trigger()` bus
      (re-entry rule + per-contact concurrency + `trigger_config` narrowing + `_depth` backstop); version
      snapshot triggers; AFTER-triggers on `contacts`/`contact_tags`/`deals`/`messages`; loop-guarded
      `automation_apply_move_deal`; `m13-date-trigger-sweep` cron; **15 global templates seeded**
- [x] Execution engine `workers/automation.mjs` (injectable `db`, wired into `worker.mjs`): version-pinned
      node-walker; 12 real action handlers (add/remove_tag, create_task/deal, move_deal_stage, update_field,
      assign_owner, internal_notification→`notify()`, webhook_post) + honest send stubs (email/SMS/campaign);
      IF/ELSE operator eval, WAIT→`run_after` re-queue, GOAL exit; per-step logging; idempotent; test-mode suppress
- [x] Edge Functions: `automations-trigger` (bus HTTP, staff+), `automations-test` (sandbox run, manager+),
      `automations-ai-generate` (scaffold, manager+); `config.toml` entries (all `verify_jwt=true`)
- [x] Frontend `m13-automations.html` + `js/m13-automations.js` + `styles/m13-automations.css` + vendored
      `drawflow.min.{js,css}`: list (cards, trigger chips, active toggle, runs-7d sparkline) · **Drawflow canvas**
      (node palette + drag-drop + config panel + validation banner + activate/test/save) · template gallery (15) ·
      AI draft builder · execution log + per-node timeline drawer (green/red, payload snapshots, retry) · mobile
      canvas → read-only flow summary; all Gate-5 states + mockup preview switcher
- [x] **M13 SQL probe GREEN — 36/36** (`workers/verify/m13probe.mjs`, PGlite): tenancy ×5 tables · role matrix +
      client ceiling · queued-only executions/steps · emit_trigger enrol + trigger_config narrowing · re-entry
      (once/allow/once_per_days) · source triggers (contact/tag/deal/message) + loop guard · **version pinning (AC-3)** ·
      templates global read
- [x] **M13 walker probe GREEN — 14/14** (`workers/verify/m13walkprobe.mjs`, real `automation.mjs` via a PGlite
      adapter): add_tag→`contact_tags` · IF/ELSE both branches · WAIT→delayed job + pinned resume → GOAL → completed ·
      internal_notification→real `notify()` · idempotency · test-mode send suppression (Gate-3)
- [x] No regressions: **369 assertions green** (leak 8 · job 5 · m00 9 · m01 35 · m02 43 · m03 25 · m04 24 · m05 21 ·
      m09 49 · m11 45 · m12 28 · m41 27 · m13 36 · m13walk 14) · **DoD Gate-8 CLEAN — 0 violations**
- [x] Frontend verified in preview (port 5913): list KPIs + 3 cards, canvas mounts (5 nodes/4 conns/15 palette),
      trigger node shows real trigger type, validation "Ready to activate", node-select→config, dark bg `#04090A`
      no stars, executions + timeline, template gallery (15), mobile canvas → read-only (no h-scroll), zero console errors
- [x] Docs: DATA-SCHEMA §9 implementation note · DECISIONS D-060…D-063 · JOBS-AND-WORKERS §5 (`m13-date-trigger-sweep`
      cron) + §6 (`automation.execute`/`automation.date_sweep`) · `verify.sh` (M13 steps) · `verify-status.json` (m13/m13walk)

**Session 11 close:** Gate 1 ✅ (m13 probe cross-tenant on all 5 tables, all RLS-on; leak 8/8) · Gate 2 ✅ (staff read /
manager+ write config; client cannot read automations; executions/steps service-role-written — enforced server-side) ·
Gate 3 ✅ (**no billable action fires yet** — email/SMS sends are provider-stubbed (D-011/M05), so no successful
provider call = nothing metered; the `meter_increment(ai_tokens)` + send-meter call sites are wired for when providers
land) · Gate 4 ✅ (**the headline** — executions run as `automation.execute` `jobs`; WAIT = `run_after` delayed re-queue;
browser inserts `queued` only, cannot write executions/steps; idempotent per `(execution,node)`; `m13-date-trigger-sweep`
cron) · Gate 5 ✅ (list/canvas/executions + empty/loading/error/success, verified in preview) · Gate 6 ✅ (light+dark,
responsive 360/768/1280 no h-scroll, canvas degrades to read-only on mobile, reduced-motion, tokens-only, 3 fonts,
`.5px` hairlines, mono numerals, dark = no stars) · Gate 7 ✅ (anon key only in browser; AI/provider keys deferred to
Vault when wired; secrets grep clean) · Gate 8 ✅ (greps CLEAN — vendored Drawflow's one `monospace` retokenised to
`var(--font-mono)`) · Gate 9 ✅ (DATA-SCHEMA + DECISIONS + JOBS + verify + TASKS updated this session).
Carried over: live worker walk + the 3 Edge Functions against a hosted/CLI Supabase (no Docker/CLI/Deno here) — ready,
**not run**, never faked green; **real email/SMS sends** wire when D-011 / Twilio land; **AI-builder LLM provider** (D-063)
and deferred-source triggers (forms M15 / appointments M14 / payments M28) activate as those modules ship.
DECISIONS added: **D-060, D-061, D-062, D-063**.

---

## Session 12 — M14 Calendar & Booking *(vertical slice built 2026-07-04)*

**Attach:** Constitution · DECISIONS · DATA-SCHEMA (§ calendar slice) · RLS-AND-SECURITY · PRD_M14 ·
BUILD-SEQUENCE S12 · DEFINITION-OF-DONE · TASKS. Design: AIMINDSHARE-DESIGN. Spec+plan:
`docs/superpowers/specs/2026-07-04-m14-calendar-and-booking-design.md` · `docs/superpowers/plans/2026-07-04-m14-calendar-and-booking.md`.

> **Dependency check (done before build):** M09 (`log_activity`/tags), M13 (`emit_trigger` bus — already
> registers `appointment.*` as stubs), M41 (`resolveCredential`/Vault OAuth) are present. **M28 is NOT built**
> (Session 13, after this) → **paid bookings scaffolded gated-OFF** (accept-when excludes them). **D-011 open**
> → confirmation/reminder **email stubbed, SMS live** (M12 Twilio). No Docker/Deno/Google creds here → Google
> two-way sync **built to contract, ready-not-run**. Migration **`0017`** (0018 taken by parallel M44). Scope:
> full PRD_M14 surface minus live paid bookings (user-approved).

**Done (code + local verification):**
- [x] Migration `0017_m14_calendar.sql`: enums `calendar_type`/`appt_status`; 6 tables (`calendars`,
      `calendar_availability`, `calendar_blocks`, `appointment_questions`, `appointments`,
      `appointment_reminders`) + standard RLS (staff+ read · manager+ config · staff+ appts / manager+ delete ·
      reminders system-written); `compute_slots()` (tz/DST-correct, buffer/notice/max-day/group-capacity) +
      `pick_round_robin_user` (least-loaded); AFTER INSERT trigger (auto-tag + timeline + reminders +
      `appointment.booked` bus); `book_appointment` + `set_appointment_status`/`reschedule_appointment`/
      `cancel_appointment` (single-purpose rotating expiring tokens); cron `enqueue_due_reminders()` (`0 * * * *`).
- [x] Edge Functions: `public-booking` (no-auth: config/slots/book/reschedule/cancel; freebusy-subtracted slots;
      contact upsert; paid-calendar 409 scaffold), `appointment-remind` (SMS live via M12 Twilio + consent +
      meter `sms`; email stubbed), `google-calendar-sync` + `google-calendar-callback` (OAuth→Vault, freebusy,
      event push — `_shared/google.ts`/`_shared/slots.ts`). `config.toml` entries added.
- [x] Worker: `appointment.remind` handler (invokes the Edge Fn) + `workspace.provision` **default-calendar seed**
      (D-020 calendar deferral now fulfilled; Mon–Fri 9–5, idempotent).
- [x] Frontend `m14-calendar-and-booking.html` + `js/m14-calendar.js` + `styles/m14-calendar.css` — authed app:
      **/calendars** (cards + editor sheet: availability grid, question builder, reminders, Google connect,
      **payment toggle disabled "Available after M28"**, embed snippet) and **/calendar** (custom week/month grid,
      appointment drawer with attended/no-show/cancel, filters). Public `book.html` + `js/m14-book.js` — month
      picker → slots (visitor tz) → details + questions → confirm → success (reschedule/cancel links); `?embed=1`
      minimal chrome; radial-wash-only atmosphere. Mockup/preview-state pattern; sample data labelled.
- [x] **M14 probe GREEN — 47/47** (`workers/verify/m14probe.mjs`, real Postgres via PGlite): cross-tenant leak on
      all 6 tables, role matrix + client ceiling, reminders system-written; slot engine (basic grid, buffer,
      min-notice, existing-appt exclusion, **max/day**, **group capacity**, **round-robin least-loaded**,
      **DST** 09:00 NY = 14:00 UTC winter / 13:00 summer); booking → auto-tag + timeline + 2 reminder rows +
      `appointment.booked` enrols a workflow + `automation.execute` job; cancel/no_show emit + drop reminders;
      reschedule token rotate + expiry reject; `enqueue_due_reminders` idempotent; RPC grants. Wired into `verify.sh`.
- [x] Frontend verified in preview (`m14-preview`, port 5914): calendars list (3 cards), team week (84 cells/6
      appts) + month (42 cells), appt drawer (status actions), editor sheet (7-day grid/2 questions/reminders/
      Google/embed/payment-disabled), full public booking flow → "You're booked", embed mode, dark (no stars,
      `#04090A`), no h-scroll @375. **Zero console errors.**
- [x] Docs: DATA-SCHEMA calendar implementation note · DECISIONS **D-064…D-069** · JOBS-AND-WORKERS
      (`appointment.remind` marked built) · INTEGRATIONS-SPEC **§8.2 Google Calendar** (first OAuth provider) ·
      seed.sql (sample calendar + availability + 2 questions + 2 appointments) · `verify.sh` (m14 step) · this file.

**Session 12 close:** Gate 1 ✅ (m14 probe cross-tenant on all 6 tables; leak posture) · Gate 2 ✅ (staff+ read,
manager+ config, staff+ appts / manager+ delete, client ceiling — RLS + Edge-Fn `has_role`; the client portal
narrowing for appointments is **M37**'s gate, flagged) · Gate 3 ✅ (**meter `sms`** only in the reminder success
path — a failed/stubbed send bills nothing; calendar sync is unmetered; consent gated) · Gate 4 ✅ (reminders are
`appointment_reminders` rows → cron `enqueue_due_reminders()` → idempotent `appointment.remind` jobs; browser never
inserts a reminder; heavy send is the Edge Fn) · Gate 5 ✅ (calendars/editor/team-calendar/public-booking, all
states incl. empty/skeleton/error+retry/success — verified in preview) · Gate 6 ✅ (light+dark, responsive
360/768/1280 no page h-scroll — grids own overflow, reduced-motion, tokens-only, 3 fonts, `.5px` hairlines, mono
numerals, **dark = no stars**; public page = radial-wash only) · Gate 7 ✅ (anon key only; Google/Twilio creds
Vault-only; OAuth callback signed-state; no secrets in browser) · Gate 8 ✅ (M14 files CLEAN) · Gate 9 ✅
(DATA-SCHEMA + DECISIONS + JOBS + INTEGRATIONS + seed + verify + TASKS updated). Carried over: **live paid bookings**
wire when **M28** lands (schema+UI scaffold present, gated off); **email** confirmations/reminders wire when
**D-011** decides (SMS live now); **live Google two-way sync** + **live SMS reminders** against a hosted Supabase
with real Google/Twilio creds — ready, **not run** (no Docker/CLI/Deno/creds here), never faked green. DECISIONS
added: **D-064, D-065, D-066, D-067, D-068, D-069**.
> ⚠ **Flags (human reconcile):** (1) M14 migration is **`0017`**; parallel **M44** took `0018` + M28 `0018`?—verify
> on merge (M28's note says it took 0018; if both M28 and M44 claim 0018, renumber one). (2) M14 claimed DECISIONS
> **D-064…D-069** exactly as M28's D-077 numbering note reserved — no overlap expected; re-verify on merge. (3)
> Google Calendar uses **dedicated** M14 functions (not the generic M41 connect scaffold) — D-068. (4) The `0012`
> gap (M05 renumber) is still open — not M14's.

---

## Session 13 — M28 Payments & Invoicing *(vertical slice built 2026-07-05)*

**Attach:** Constitution · DECISIONS · DATA-SCHEMA (§9 payments) · RLS-AND-SECURITY · EDGE-FUNCTIONS-SPEC ·
JOBS-AND-WORKERS-SPEC · PRD_M28 · BUILD-SEQUENCE (Session 13 entry) · DEFINITION-OF-DONE · this file.

> Client-facing money (distinct from M03 = platform↔agency). **Dependencies all Done:** M09 (S8),
> M41 (S5), M05 (S7), M12 (S10). **No OPEN decision blocks the core** — email *send* degrades behind
> D-011 (same non-blocking deferral as M04/M12; link + SMS-via-M12 live). BUILD-SEQUENCE row 13 = M28
> (the PRD header's "Session 17b" is stale). **Scope call (accept-when to DoD, rest scaffolded):**
> invoices CRUD + send, Stripe checkout links, estimate→invoice, subscriptions, idempotent webhook,
> revenue rollups — built full; Stripe Connect onboarding, Text-to-Pay full flow, payment plans,
> dunning→M13, PDF (M06), QR, late fees, multi-currency FX — honest labelled scaffolds. Stripe reuses
> the D-028 pattern (REST + Web Crypto, key in Vault) and **M03's `stripe_events`** for webhook
> idempotency. Migration is **0018** (a parallel M14 session took `0017_m14_calendar.sql`; M28 is
> independent of M14 → 0018, flagged). DECISIONS **D-070…D-077** (M13 took D-060…D-063; D-064…D-069
> left for parallel M14 — flagged).

**Done (code + local verification):**
- [x] Migration `0018_m28_payments.sql`: `invoices` (§9 + D-070 extensions: `kind`, `amount_paid`,
      `discount`/`tax_rate`, `notes`, `public_token`, `sent_at`, `stripe_checkout_id`, `source_*`),
      `invoice_payments` (append-only ledger, **service-role write only**, D-071), `client_subscriptions`,
      `tax_rates`, `invoice_counters` (gap-free numbering); RLS in-file (staff+ ins/upd, **manager+ del +
      void guard** D-073); RPCs `calc_invoice_totals` (server-truth totals), `next_invoice_number`,
      `accept_estimate`, `record_invoice_payment` (idempotent on PI + timeline + notify + best-effort M13
      emit), `revenue_rollup`, `sweep_overdue_invoices`; BEFORE-write trigger recomputes money + numbers +
      guards void; daily `m28-overdue-sweep` `pg_cron`; invoices/payments added to Realtime. PGlite-guarded.
- [x] Edge Functions (4): `payments-checkout` (Checkout Session on the connected account, app-fee default 0,
      D-075) · `payments-webhook` (verify_jwt=false; signature-verified; **idempotent on `event.id` via
      `stripe_events`**; maps checkout/PI/subscription events → `record_invoice_payment` / sub status) ·
      `public-invoice` (**no-auth** hosted pay page by `public_token`: view / accept-estimate / create
      PaymentIntent) · `invoice-send` (link live / SMS via M12 inbox-send / email deferred D-011, D-076).
      Extended `_shared/stripe.ts` with an **additive** optional `{account, idempotencyKey}` arg (M03's
      3-arg calls unaffected). `config.toml` entries added.
- [x] Frontend `m28-payments-and-invoicing.html` + `js/m28-payments.js` + `styles/m28-payments.css`:
      `/payments` (revenue cards collected/outstanding/overdue + tabs Invoices/Estimates/Subscriptions/
      Links/Transactions), invoice/estimate **editor with live-preview totals** (JS mirror of
      `calc_invoice_totals`), send modal (link/SMS/email), **standalone branded public pay page** `/pay/:token`,
      `/settings/payments` (Stripe Connect status, tax-rate CRUD, numbering prefix, overdue/reminder note).
      All Gate-5 states + mockup preview switcher; tokens-only, 3 fonts, `.5px`, dark = no stars.
- [x] **M28 probe GREEN — 43/43** (`workers/verify/m28probe.mjs`, real Postgres via PGlite): cross-tenant
      leak on all 5 tables · server-computed totals (forged subtotal overwritten; 8.5% tax to the cent) ·
      gap-free numbering · role matrix (client ceiling, staff can't void/delete, manager can; tax manager+) ·
      `invoice_payments` service-role only · `record_invoice_payment` partial→paid + **idempotent on PI** +
      timeline + notify · `accept_estimate` convert · overdue sweep flip · `revenue_rollup` math + member gate.
- [x] No regressions: full `verify.sh` — leak 8/8 · job 5/5 · m00 9/9 · m01 35/35 · m02 43/43 · m03 25/25 ·
      m04 24/24 · m05 21/21 · m41 27/27 · m09 49/49 · m11 45/45 · m12 28/28 · m13 36/36 + walker 14/14 ·
      **m28 43/43**. **Gate-8 CLEAN for M28 files** (dead-stack/secrets/shimmer/hex/fonts; 5 tables / 5 RLS).
- [x] Frontend verified in preview (`m28-preview`, port 5928): all routes render; invoice editor live total
      `$3,613.05` = Σ correct; public pay page branded + standalone (rail hidden); **responsive 360/768/1280 —
      no page h-scroll** (fixed a shared-topbar overflow at ≤480 scoped to this page); both themes (dark
      `#04090A`, **no stars**); all 5 preview states; **zero console errors**.
- [x] Docs: DATA-SCHEMA §9 migration-history note · DECISIONS D-070…D-077 · JOBS §5 (`m28-overdue-sweep`) ·
      `config.toml` (4 fns) · `seed.sql` (Acme invoices/estimate/subs/tax/ledger) · `verify.sh` (m28 step) · this file.

**Session 13 close:** Gate 1 ✅ (m28 probe cross-tenant on all 5 tables; leak 8/8) · Gate 2 ✅ (staff+ create/edit,
**manager+ delete + void** server-side via RLS + the trigger void guard; client ceiling — all proven) · Gate 3 ✅
(**no billable action in M28** — invoicing isn't metered; the one provider send, Text-to-Pay SMS, meters in **M12**'s
`inbox-send` success path, so no double-meter) · Gate 4 ✅ (webhook **idempotent on `event.id`** via `stripe_events`
**and** on the PI in `record_invoice_payment`; overdue is `pg_cron` inline flip; browser never writes payments) ·
Gate 5 ✅ (payments/editor/pay-page/settings, all states incl. empty/skeleton/error+retry — verified in preview) ·
Gate 6 ✅ (light+dark, responsive 360/768/1280 no page h-scroll, reduced-motion, tokens-only, 3 fonts, `.5px`,
mono numerals, dark = no stars) · Gate 7 ✅ (**the headline** — no Stripe key in the browser; key + signing secret in
Vault; webhook signature-verified; the public pay page returns one invoice's safe fields by unguessable token) ·
Gate 8 ✅ (M28 files CLEAN — one repo-wide grep hit is **external**: `frontend/styles/m14-calendar.css` a parallel
M14 session's "no shimmer" comment false-positive, flagged for that session; M28 introduced zero hits) · Gate 9 ✅
(DATA-SCHEMA + DECISIONS + JOBS + config + seed + verify + TASKS updated).
Carried over (live, never faked green): real Stripe test-mode checkout + webhook round-trip + Payment Element mount on
the public pay page + Connect Standard onboarding (needs a Stripe account + Docker/CLI/Deno — absent here); Text-to-Pay
end-to-end via M12 (needs Twilio); email send when **D-011** lands; standalone `payment_links` table + QR; payment
plans/installments + the reminder-schedule engine + late fees; PDF via **M06**; `gdpr.export`/`erase` fold-in of
invoices (financial records **retained** — the worker's deferred note already lists it). DECISIONS added: **D-070…D-077**.
> ⚠ **Parallel-session flags (human reconcile):** (1) migration `0018` — a parallel **M14** session holds
> `0017_m14_calendar.sql`; re-verify 0018 is free on merge. (2) DECISIONS — M28 claimed **D-070…D-077**, skipping
> D-064…D-069 for M14 (M13 took D-060…D-063); renumber if M14 landed there. (3) The `0012` gap (M05 renumber) is still
> open — not M28's. (4) Gate-8's lone repo hit is M14's `m14-calendar.css` "no shimmer" comment, not M28.

---

## Session 14 — M44 Admin Basics (Platform Ops) *(vertical slice built 2026-07-04)*

**Attach:** Constitution · DECISIONS · DATA-SCHEMA (§10 admin) · RLS-AND-SECURITY · EDGE-FUNCTIONS-SPEC ·
JOBS-AND-WORKERS-SPEC · PRD_M44 · BUILD-SEQUENCE (Phase 1, row 14) · DEFINITION-OF-DONE · AIMINDSHARE-DESIGN · this file.

> The super-admin console. Every tenant table is RLS-scoped to `is_member()`, so the platform admin reads/
> writes ACROSS workspaces only through `is_platform_admin()`-gated `SECURITY DEFINER` RPCs — the gate is
> line 1 of each (D-078). M44 precedes M07, so it ships its **own** append-only `admin_audit_log` (D-079,
> distinct from M00 `auth_events`). PRD's BullMQ/Bull Board/Redis/Sentry infra monitor is superseded by a
> `public.jobs` monitor + `pg_cron` + M41 health rollup (D-081). Scope = the row-14 accept-when to full DoD;
> plan editor / credits / margin / marketplace / announcements / support tooling deferred (D-083). Migration
> **`0019`** (0017=M14, 0018=M28 landed in parallel; 0012 gap = M05 renumber).

**Done (code + local verification):**
- [x] Migration `0019_m44_admin.sql`: `feature_flags` + `feature_flag_overrides` + `impersonation_sessions`
      + append-only `admin_audit_log` (all RLS in-file); `ws_status`+'suspended' + `workspace_suspended()`;
      `is_platform_admin()`-gated read RPCs (`admin_platform_kpis`/`admin_list_workspaces`/`_users`/`_jobs`/
      `admin_get_workspace`/`admin_flag_enabled`) + mutation RPCs (`admin_set_feature_flag`/`_set_flag_override`/
      `_suspend_workspace`/`_unsuspend_workspace`/`_retry_job`/`_discard_job`/`_end_impersonation`), each
      writing `admin_audit`; the `admin_audit` writer is **revoked from public** (forge guard);
      `m44-impersonation-expiry-sweep` pg_cron (30-min guarantee, PGlite-guarded).
- [x] `_shared/auth.ts` `requirePlatformAdmin()`; Edge Fn `admin-impersonate` (auth → platform-admin gate →
      audited session row + `impersonate.start` → **GoTrue admin mint CARRIED**); `config.toml` entry (jwt).
- [x] Frontend `m44-admin-platform-ops.html` + `styles/m44-admin.css` + `js/m44-admin.js`: hash-routed
      `/admin` — Overview (7 KPI tiles + audit feed), Directory (workspaces/users tables + manage drawer:
      suspend/unsuspend, per-workspace flag overrides, impersonate launcher w/ required reason), Jobs monitor
      (`public.jobs` cross-tenant + status filter chips + retry/discard), Feature flags (registry + toggles +
      add). Impersonation banner; client-side 403 Restricted (RPCs are the real wall); mockup preview switcher.
- [x] **M44 probe GREEN — 39/39** (`workers/verify/m44probe.mjs`, real Postgres via PGlite): gate rejects
      non-admin on every RPC · platform-admin cross-tenant reads (both workspaces / all users) · member can't
      read `admin_audit_log`/`impersonation_sessions` · flag override→default resolution · mutations audited +
      **append-only** (update/delete → 0 rows) · suspend flips `ws_status` + helper · jobs retry/discard ·
      impersonation 30-min expiry sweep + dual-identity audit · `admin_audit` forge-guarded.
- [x] No regressions: full `bash scripts/verify.sh` GREEN — leak 8/8 · job 5/5 · m00 9/9 · m01 35/35 ·
      m02 43/43 · m04 24/24 · m03 25/25 · m41 27/27 · m05 21/21 · m09 49/49 · m11 45/45 · m12 28/28 · m13 +
      walk · m28 · m14 47/47 · **m44 39/39** · **Gate-8 CLEAN — 0 violations**.
- [x] Frontend verified in preview (`m44-preview`, port 5944): all 4 routes render (Overview 7 KPIs + audit
      feed; Directory 4 workspaces + users tab + manage drawer; Jobs 4 rows + 5 filter chips + retry on the
      failed job; Flags 4 switches); impersonation flow (drawer → launcher w/ reason → banner → "Return to
      admin" clears it); all 5 preview states; **zero console errors**; **0 page h-scroll at 375/768/desktop**
      (fixed a shell grid-track blowout with `minmax(0,1fr)` + topbar trim on mobile); dark bg `#04090A` (no
      stars); numbers in Shippori Mincho; `.5px` hairlines; tokens-only.
- [x] Docs: DATA-SCHEMA §10 M44 migration-history note · DECISIONS **D-078…D-083** · JOBS-AND-WORKERS §5
      (`m44-impersonation-expiry-sweep` cron) · `config.toml` (admin-impersonate) · `seed.sql` (3 flags +
      override + audit/impersonation samples) · `verify.sh` (m44 step) · `.claude/launch.json` (m44-preview) · this file.

**Session 14 close:** Gate 1 ✅ (m44 probe cross-tenant on all 4 tables + gate rejects non-admin) · Gate 2 ✅
(**the headline** — `is_platform_admin()` wall is line 1 of every admin RPC, non-admin→raise verified
server-side; `admin_audit` forge-guarded; client 403 is cosmetic) · Gate 3 ✅ (**no billable actions** — admin
ops aren't metered) · Gate 4 ✅ (impersonation expiry is a `pg_cron` direct flip, not a client timer; jobs
retry/discard via definer RPC, browser never writes `running`; no new job type) · Gate 5 ✅ (Overview/Directory/
Jobs/Flags, all states + mockup switcher — verified in preview) · Gate 6 ✅ (light+dark, responsive
360/768/1280 **0 h-scroll**, reduced-motion, tokens-only, 3 fonts, `.5px`, mono numerals, dark = no stars) ·
Gate 7 ✅ (anon key only; impersonation mint + service-role in the Edge Fn; secrets grep clean) · Gate 8 ✅
(greps CLEAN) · Gate 9 ✅ (DATA-SCHEMA + DECISIONS + JOBS + config + seed + verify + TASKS updated). Carried
over (live, never faked green): the GoTrue admin **session-mint** for impersonation + minting the
`platform_admin` claim onto an operator account + the live `pg_cron` sweep + Realtime jobs refresh — all need
a hosted Supabase + Deno/CLI (absent here). Deferred (accept-when scope, D-083): full suspension read-only
enforcement, plan/pricing editor + coupons, credits/trial/plan-change (M03 live Stripe), cost/margin +
MeterCost, marketplace moderation (M39), GDPR/A2P/abuse rollups (M05/M36), announcements + maintenance mode,
support tooling. DECISIONS added: **D-078, D-079, D-080, D-081, D-082, D-083**.
> ⚠ **Parallel-session flags (human reconcile):** (1) migration **`0019`** — M14=`0017`, M28=`0018` landed in
> parallel; re-verify `0019` is free on merge. (2) DECISIONS — M44 claimed **D-078…D-083** (max was D-077);
> renumber if a parallel session also took them. (3) The `0012` gap (M05 renumber) is still open — not M44's.

---

## Session 15 — M08 Dashboard (no Copilot) *(vertical slice built 2026-07-04)*

**Attach:** Constitution · DECISIONS · DATA-SCHEMA (M09/M11/M14/M28/M03 slices) · RLS-AND-SECURITY ·
PRD_M08 · BUILD-SEQUENCE (Session 15 entry) · DEFINITION-OF-DONE · AIMINDSHARE-DESIGN · this file.

> The workspace home screen. **Read-only aggregation** over tables that already exist — no new
> tables, no migration, no Edge Function, no metered action. BUILD-SEQUENCE row 15 accept-when =
> KPI strip (Chart.js) · activity feed · quick actions · needs-panel. **Dependencies Done:** M09 (S8),
> M11 (S9), M12 (S10), M14 (S12), M28 (S13), M03/M04 platform. **Scope call (accept-when to DoD):**
> KPI strip + needs-panel + activity feed + quick-actions + a **fixed** widget grid (pipeline snapshot,
> tasks due, upcoming appointments, usage meters, contacts trend) — built full; the customizable
> **drag-reorder + per-user `dashboard_layouts` persistence** and the **AI Copilot** are deferred (D-084).
> KPI cards **feature-flag by table presence** — `blog_articles`/`keyword_rankings`/`social_posts`
> (M21–23, not built) simply don't render (D-084). Spec: `docs/superpowers/specs/2026-07-04-m08-nocopilot-dashboard-design.md`.

**Done (code + local verification):**
- [x] Frontend `m08-dashboard.html` + `js/m08-dashboard.js` + `styles/m08-dashboard.css`: hash-routed
      `/dashboard` — page-head with a **date-range segment** (This month / 30 days / Quarter, equal-length
      previous windows so it's MTD-vs-same-elapsed, not partial-vs-full); **KPI strip** (new contacts +
      Chart.js sparkline, open pipeline, revenue collected = the single gold `.kpi-featured`, appointments —
      each deep-links its module, each guarded by table presence); **needs-panel** (overdue tasks/invoices +
      today's appointments, or an honest "all caught up"); **quick-actions** bar (route to the owning module);
      **widget grid** (pipeline mini-funnel, activity feed from `notifications`, tasks due, upcoming
      appointments, usage-meter bars vs plan `included`, contacts **trend chart** current-vs-previous). All 5
      Gate-5 states + mockup preview switcher; reuses the shared base (`.kpi`/`.needs-panel`/`.panel`/
      `.data-row`), tokens-only, 3 fonts, `.5px`, dark = no stars.
- [x] **Chart.js v4.4.4 vendored** → `frontend/vendor/chart.min.js` (UMD `window.Chart`, no CDN/build — Law 3;
      D-085); KPI sparklines + the trend chart read their colours from `tokens.css` at runtime and re-theme on
      toggle. Graceful: if the lib is absent, charts simply don't mount (the rest of the dashboard is intact).
- [x] Every read is `.eq('workspace_id', …)` under the anon client (RLS is the wall); each table load is
      guarded (`Promise.allSettled`) so a missing/denied table hides only its own card — never a fabricated number.
- [x] No regressions: full `bash scripts/verify.sh` — all runnable PGlite probes GREEN (leak/job/m00/m01/m02/
      m03/m04/m05/m41/m09/m11/m12/m13+walk/m28/m14 47/47 · m44 39/39); live Supabase probes skipped (no Docker).
      **Gate-8 CLEAN — 0 violations** (M08 added no tables → no RLS delta; vendored Chart.js trips no secret grep).
- [x] Frontend verified in preview (`m08-preview`, port 5908): default renders KPI strip + needs (7 items) +
      quick-actions + 6 widget panels + **3 chart canvases**; all 5 preview states (empty → "all caught up" +
      honest zero widgets; loading → skeletons; error → retry); both themes (dark bg `rgb(4,9,10)`, **no stars**,
      dark-teal token applied, charts redraw on toggle); **responsive 360/768/1280 — 0 page h-scroll** (fixed the
      shared-shell grid-track blowout with `min-width:0` on the grid panels + `.pipe-mini`, and a page-scoped
      mobile topbar trim; the same ~104px shared-topbar overflow exists in M14/others and is **not** M08's to fix
      repo-wide); numbers in Shippori Mincho; **zero console errors**.
- [x] Docs: DECISIONS **D-084, D-085** · design spec written + self-reviewed · `.claude/launch.json`
      (`m08-preview`) · this file. DATA-SCHEMA / INTEGRATIONS / JOBS **unchanged** (no table, provider, or job).

**Session 15 close:** Gate 1 ✅ (no new tables; every query `.eq('workspace_id')` under the anon client;
per-table load guarded) · Gate 2 ✅ (read-only aggregate visible to any member; RLS is the wall; no forbidden
action introduced) · Gate 3 ✅ (**no billable action** — the dashboard only reads/aggregates; nothing metered) ·
Gate 4 ✅ (**no jobs** — no client loops, no heavy awaits, no new job type or cron) · Gate 5 ✅ (default/empty/
loading/error all present + mockup switcher — verified in preview) · Gate 6 ✅ (light+dark, responsive
360/768/1280 0 h-scroll, reduced-motion, tokens-only, 3 fonts, `.5px`, mono numerals, dark = no stars, Chart.js
themed from tokens) · Gate 7 ✅ (anon key only; Chart.js carries no secrets; secrets grep clean) · Gate 8 ✅
(greps CLEAN) · Gate 9 ✅ (DECISIONS + spec + launch.json + TASKS updated; schema/integrations/jobs untouched).
Carried over (deferred, never faked green): **AI Copilot** (⌘K overlay, function-calling agent, daily briefing —
Phase 8 / Session 47); **customizable drag-reorder + show/hide widgets with per-user `dashboard_layouts`
persistence**; **latest-form-submissions widget** (needs M15 Forms); live KPIs against a hosted Supabase with real
tenant data (mockup mode covers the offline path). DECISIONS added: **D-084, D-085**.
> ⚠ **Parallel-session flags (human reconcile):** (1) DECISIONS — M08 claimed **D-084, D-085** (max was D-083
> from M44); renumber if a parallel session also took them. (2) M08 added **no migration** (pure frontend
> read-slice) — no migration-number contention. (3) When M21–23 land, their KPI cards light up automatically
> (feature-flag by table presence) — no M08 change needed.

---

## Session 16 — M15 Forms & Surveys *(vertical slice built 2026-07-04)*

**Attach:** Constitution · DECISIONS · DATA-SCHEMA (§ forms slice) · RLS-AND-SECURITY · EDGE-FUNCTIONS-SPEC ·
JOBS-AND-WORKERS-SPEC · PRD_M15 · BUILD-SEQUENCE (Session 16) · DEFINITION-OF-DONE · AIMINDSHARE-DESIGN · this file.

> The acquisition layer's lead-capture spine. **PRD's Prisma/Zod/dnd-kit are superseded** onto the locked stack
> (Law 8): vanilla builder + `SortableJS` DnD (M11 D-025), a hand-written validator with **server re-validation**
> in `submit_form()`, and plain jsonb `*_json` columns (D-138). **Dependencies all Done:** M09 CRM (contacts
> upsert spine), M13 Automations (`emit_trigger` bus already registered `form.submitted` as a stub — M15 fires it
> live, D-062→live), M05 Compliance (`consent_records` exact-text ledger), M04 notify, M11 deals routing. **No OPEN
> decision blocks the core** — double-opt-in email *send* degrades behind D-011 (now RESOLVED → SendGrid, a
> fast-follow, D-143); Turnstile behind D-009; `file_upload` behind M06 (**now landed, 0021 — wireable follow-up**,
> D-142). **logic_json builder-fix:** the builder authors step-level targets and expands them to per-field rules at
> save so the engine evaluates one dialect (D-139). Migration **`0020`** (M16 also drafted 0020 then moved to 0024;
> M19=0022, M20=0023, M06=0021 in parallel — 0020 confirmed unique to M15). DECISIONS **D-136…D-146**.

**Done (code + local verification):**
- [x] Migration `0020_m15_forms.sql`: `forms` (builder `*_json`, `public_token`, `variant_of_id`+`ab_split` A/B,
      `status` gate) + `form_submissions` (contact link, quiz `score`/`result_tier`, `ip_hash`, `confirm_token`) +
      `form_views` (view→start→complete event stream); RLS in-file (member read, **staff+ ins/upd, manager+ del**;
      `form_submissions`/`form_views` **service-role-INSERT-only**, D-137). RPCs: `submit_form()` (SECURITY DEFINER
      pipeline — honeypot/time-trap → contact upsert-dedupe by email then phone → **exact-text consent** → quiz
      score→tier → **logic-hidden answers dropped** (tamper guard) → routing owner/tags/deal →
      `emit_trigger('form.submitted')`), `form_confirm_optin()` (double-opt-in complete), `assign_form_variant()`
      (deterministic sticky A/B hash, D-141), `form_analytics()` (compute-on-read funnel, D-140). PGlite-guarded.
- [x] Edge Functions (2): `public-form` (**no-JWT**; service-role; authorized by `public_token`; GET renders safe
      fields — no `routing_json`; POST → `submit_form`; tracks views; confirm endpoint) · `forms-export` (JWT;
      `requirePermission('crm.export')` — **reuses the M09 export key**, submissions are contact data; STAFF without
      the grant → 403). `config.toml` entries added for both.
- [x] Worker: `workspace.provision` now seeds a published **"Contact Us"** starter form (name/email/message +
      marketing-consent field with exact wording; `settings_json.source_tag`) — idempotent, only when the workspace
      has no forms (same guard as the M11 default-pipeline seed, D-052).
- [x] Front end: `m15-forms-and-surveys.html` + `js/m15-forms.js` (authed app: list, builder with palette/design/
      logic/routing/A-B/results tabs, all Gate-5 states + mockup switcher) + `styles/m15-forms.css`; `f.html` +
      `js/m15-form-render.js` (standalone public renderer + shared validator + logic engine) + `embed.js` (the
      hydrating embed snippet). Tokens-only, 3 fonts, `.5px`, dark = no stars.
- [x] **M15 probe GREEN — 72/72** (`workers/verify/m15probe.mjs`, real Postgres via PGlite): cross-tenant leak on
      all 3 tables · RLS write matrix (staff create/edit, manager+ delete, client ceiling) · `form_submissions`/
      `form_views` service-role-insert-only · `submit_form` dedupe (email then phone + custom-field map) · exact
      consent text · quiz score→tier · **logic-hidden answers dropped** · routing owner/tags/deal ·
      `form.submitted` enrols a workflow → `automation.execute` job · honeypot + time-trap reject · double-opt-in
      pending→confirm · A/B sticky assignment · analytics funnel math · **`forms-export` `crm.export` gate is real**
      (has_permission staff=false, manager/owner=true, grant-override=true).
- [x] Permissions registry: added **`forms.view` + `forms.manage`** (staff+) to `_shared/permissions.ts`, mirrored
      into `frontend/js/permissions.js`, the `0008` seed arrays, and `m02probe` `EXPECTED` — **drift guard still
      green (m02probe 43/43)**. Export gate kept as `crm.export` (no `forms.export` minted, D-146).
- [x] No regressions: `m15probe` **72/72**, `m02probe` **43/43** re-run green after the registry edits; `verify.sh`
      m15 step added after the m14 step (full suite is "probe-green on Node/PGlite; the live 10/10 worker+Edge-Fn
      step needs Supabase CLI/Deno, absent here"). **Gate-8 CLEAN for M15 files** (renamed one `m15-forms.css`
      header comment `no shimmer sweep`→`no skeleton sweep` to clear the substring grep, mirroring M09 `task-`→
      `todo-` / M14's flagged comment).
- [x] Docs: DATA-SCHEMA (§ acquisition M15 note) · DECISIONS **D-136…D-146** · JOBS-AND-WORKERS-SPEC (§5/§6 M15:
      `form.submitted` now live + provision starter-form seed; no new job/cron) · `config.toml` (2 fns) · `seed.sql`
      (Acme published form + 4 submissions incl. a dedupe row against seeded contact `c9300000…0001` + 10 views) ·
      `verify.sh` (m15 step) · this file.

**Session 16 close:** Gate 1 ✅ (m15 probe cross-tenant on all 3 tables; `form_submissions`/`form_views` service-
role-insert-only leak posture) · Gate 2 ✅ (staff+ create/edit, **manager+ delete**, client ceiling — all server-
side via RLS `has_role`; public read exposes safe fields only, no `routing_json`; export gates on `crm.export`) ·
Gate 3 ✅ (**no billable action in M15 core** — forms aren't metered; a form that *sends* email via M13 meters in
that module's path, no double-meter) · Gate 4 ✅ (**submission is synchronous** — `public-form` Edge Fn +
`submit_form` definer RPC do the work inline like a booking; the browser **never writes** submissions/views;
`form.submitted` enrols M13 workflows that run as existing `automation.execute` jobs; no client timer) · Gate 5 ✅
(list/builder/renderer, all states incl. empty/loading/error+retry/success + preview switcher — verified in
preview) · Gate 6 ✅ (light+dark, responsive 360/768/1280 **no page h-scroll**, reduced-motion, tokens-only, 3
fonts, `.5px`, mono numerals, **dark = no stars**; public page = radial-wash only) · Gate 7 ✅ (anon key only in the
browser; submissions via the service-role Edge Fn; **no raw IP — `ip_hash` sha256**, D-145; any Turnstile/salt
secret in Vault) · Gate 8 ✅ (M15 files CLEAN after the `shimmer`→`skeleton` comment rename; the remaining repo-wide
grep hits are **external** parallel-session false-positives — `m16-campaigns.js` + `m22-content-cms.js` `no shimmer`
comments and their `state.error` lines — flagged for those sessions; M15 introduced zero real hits) · Gate 9 ✅
(DATA-SCHEMA + DECISIONS + JOBS + config + seed + verify + TASKS updated).
Carried over (live, never faked green): **file_upload live wire → M06** (now landed, 0021 — direct-to-Storage +
`register_media_asset`, D-142); **double-opt-in confirmation email send → M16 SendGrid** (D-011 now RESOLVED, fast-
follow, D-143); **Turnstile verify key → D-009** hosting (Vault scaffold ready); the live worker + Edge-Fn/Deno
round-trip (submit/confirm/export end-to-end) is **ready, not run** (needs Supabase CLI/Deno — absent here).
DECISIONS added: **D-136…D-146**.
> ⚠ **Parallel-session flags (human reconcile):** (1) migration `0020` — confirmed **unique to M15** (M16 drafted
> 0020 then moved to `0024`; M19=0022, M20=0023, M06=0021 landed in parallel; re-verify 0020 is still solely M15 on
> merge). (2) DECISIONS — M15 claimed **D-136…D-146**, **above the observed repo max D-135** (a parallel **M21 SEO**
> session reserved D-128…D-135 in its migration/spec/plan but had **not** yet written formal `## D-1xx` headers in
> the DECISIONS file, whose last formal entry is D-127/M22); renumber on merge if M21's block or another session
> collides. (3) The registry edit touched the shared `0008_m02_roles.sql` seed + `m02probe` `EXPECTED` (required to
> keep the four-place drift guard green when adding `forms.*`) — re-run `m02probe` after any parallel role change.
> (4) **M06 (migration `0021`) landed in parallel — `file_upload` is now wireable** as the D-142 fast-follow.

---

## Session 17 — M16 Campaigns (Email + SMS) *(vertical slice built 2026-07-05)*

**Attach:** Constitution · DECISIONS · DATA-SCHEMA (§9 campaigns) · RLS-AND-SECURITY · PRD_M16 ·
BUILD-SEQUENCE (Session 17) · DEFINITION-OF-DONE · TASKS. Design/plan:
`docs/superpowers/specs/2026-07-05-m16-campaigns-design.md` · `docs/superpowers/plans/2026-07-05-m16-campaigns.md`.

> **The one gate on this session was OPEN D-011** (BUILD-SEQUENCE row 17 is the only session explicitly gated on
> it — for Campaigns the *send is the module*). Flagged and **resolved → SendGrid (D-086)** with the user, then
> built. PRD-only tables ship as logged extensions (D-087); metering reuses `email`/`sms` (D-088); send_events/
> suppressions/campaign_stats are service-role ledgers (D-089); unsubscribe dual-writes suppression + M05
> consent (D-090); AI copywriter / domain-auth / spam-score / MJML are honest scaffolds (D-091/D-092); send
> pipeline is `campaign.send` fan-out + `run_after` drips (D-094); SMS steps on the M12 Twilio contract (D-093).
> **Migration `0024`** (M15=0020 · M06=0021 · M19=0022 · M20=0023 landed in parallel; M16 is independent of all
> four → next free 0024). DECISIONS **D-086…D-094** (M08 took D-084/D-085 — flagged for merge).

**Done (code + local verification):**
- [x] Migration `0024_m16_campaigns.sql`: 6 enums; **9 tables** (`email_campaigns`, `campaign_stats`,
      `sequences`, `sequence_steps`, `sequence_enrollments`, `suppressions`, `send_events`, `email_templates`,
      `sender_identities`) — all RLS-on in-file (standard template · sequences config manager+ · send_events/
      suppressions/campaign_stats service-role-write, D-089); `resolve_campaign_audience` (minus suppressions
      minus opt-outs, most-recent-wins), `suppress_email`, `unsubscribe_email` (dual-write D-090),
      `roll_send_event()` stats trigger, `dispatch_scheduled_broadcasts`/`tick_due_enrollments` enqueuers;
      10 global template seeds; `m16-broadcast-dispatch` (minutely) + `m16-sequence-tick` (hourly) cron
      (PGlite-guarded); email_campaigns/campaign_stats in Realtime.
- [x] `_shared/email.ts` — SendGrid adapter: Vault key (ws→plat), `sendEmail` (Mail Send REST + List-Unsubscribe),
      `compileEmail` (block-JSON → responsive inline-CSS HTML, merge tags, click-wrap + open pixel, auto CAN-SPAM
      footer), `verifySendgridEvent` (ECDSA-P256 signed event webhook). Ready-not-run.
- [x] Edge Functions: `campaigns` (test-send/spam-check/send-now → enqueues fan-out), `campaigns-ai-write`
      (scaffold, meters nothing — D-092), `sendgrid-webhook` (ECDSA verify → send_events + suppress/unsubscribe
      + emit_trigger), `email-track` (open pixel + click redirect), `email-unsubscribe` (public token page →
      dual-write). `config.toml` entries (3 public verify_jwt=false, 2 authed true); `sendgrid` provider row
      (+ mirror in `frontend/js/providers.js`).
- [x] Worker `worker.mjs`: `campaign.send` (fan-out: audience → meter_check gate → per-recipient send_events →
      throttled deliver batches + A/B sample + ab_winner at +4h), `email.deliver` (SendGrid + meter `email` on
      success; honest `sendgrid_unconfigured` guard), `sms.deliver` (via M12 inbox-send contract + meter `sms`),
      `sequence.step` (exit checks → send → schedule next `run_after` step), `campaign.ab_winner` + router cases.
- [x] Frontend `m16-campaigns.html` + `js/m16-campaigns.js` + `styles/m16-campaigns.css`: `/campaigns` list
      (KPI strip + rows), 5-step **builder** (audience w/ live count · 9-block email editor w/ SortableJS +
      live preview / SMS composer w/ segment counter · A/B · review checklist · schedule), `/sequences/:id`
      step-timeline editor, `/settings/sending` (domain-auth wizard · from-identities · suppression viewer).
      All Gate-5 states + mockup preview switcher; tokens-only, 3 fonts, `.5px`, dark = no stars.
- [x] **M16 probe GREEN — 48/48** (`workers/verify/m16probe.mjs`, real Postgres via PGlite): 9-table existence +
      RLS + service-role-ledger policies; cross-tenant leak on all 9 tables; role matrix (staff+ campaign,
      manager+ delete, sequences config manager+, client ceiling); send_events/suppressions service-role-only;
      audience excludes suppressed + opted-out + re-includes on newer opt-in; unsubscribe dual-write + idempotent;
      stats trigger rollup; dispatch/tick enqueue queued jobs; audience member-gate; 10 templates global-readable.
- [x] No regressions: full `verify.sh` — leak 8 · job 5 · m00 9 · m01 35 · m02 43 · m03 25 · m04 24 · m05 21 ·
      m09 49 · m11 45 · m12 28 · m13 36 + walk 14 · m14 47 · m28 43 · m41 27 · m44 39 · **m16 48** (571 total, 0 failed).
      Gate-8 CLEAN for M16 files. `verify.sh` + spec/plan wired.
- [x] Docs: DATA-SCHEMA §9 note · DECISIONS **D-086…D-094** + D-011 flipped RESOLVED · JOBS-AND-WORKERS
      (`campaign.send`/`email.deliver`/`sms.deliver`/`sequence.step`/`campaign.ab_winner` + 2 crons) ·
      INTEGRATIONS-SPEC §8 SendGrid (first email provider) · seed.sql · this file.

**Session 17 close:** Gate 1 ✅ (m16 probe cross-tenant on all 9 tables; leak 8/8) · Gate 2 ✅ (staff+ campaign /
manager+ delete / sequences config manager+ / client ceiling — RLS + the send Edge Fn `has_role`) · Gate 3 ✅
(**the headline** — every email send meters `email`, every SMS meters `sms`, in the provider-success step; a
failed/unconfigured send bills nothing; `meter_check` gates pre-send with a clean `quota_exceeded` failure) ·
Gate 4 ✅ (broadcasts = `campaign.send` fan-out → throttled `email.deliver`/`sms.deliver`; drips = `run_after`
`sequence.step`; browser inserts `queued` only; idempotency keys; 2 crons) · Gate 5 ✅ (list/builder/sequences/
sending, all states + preview switcher — verified in preview) · Gate 6 ✅ (light+dark, responsive 360/768/1280 no
h-scroll, reduced-motion, tokens-only, 3 fonts, `.5px`, mono numerals, dark = no stars) · Gate 7 ✅ (SendGrid key
in Vault; webhook ECDSA-verified; tables hold references only; anon key only in browser) · Gate 8 ✅ (M16 files
CLEAN — one repo-wide grep hit is **external**: M19's vendored `frontend/vendor/grapes.min.js`, not M16) · Gate 9 ✅
(DATA-SCHEMA + DECISIONS + JOBS + INTEGRATIONS + seed + verify + TASKS updated).
Carried over (live, never faked green): **live SendGrid** Mail Send + signed Event Webhook + open/click tracking +
domain-auth verify; **live Twilio SMS** steps; run against a hosted Supabase + real SendGrid/Twilio creds — ready,
**not run** (no Docker/CLI/Deno/creds here). AI copywriter LLM provider (D-092); spam-score provider API (D-091);
MJML lib (D-087, block-compile ships); revenue-attribution join → M40; the newly-unblocked M04/M12/M14/M28 email
sends (D-086) are follow-ups. SMS-mock-body note: the builder's SMS mock seeds copy from `subject`; the live path
reads `email_campaigns.sms_body` — confirm the live save writes `sms_body` for SMS campaigns on wiring.
DECISIONS added: **D-086, D-087, D-088, D-089, D-090, D-091, D-092, D-093, D-094**.
> ⚠ **Parallel-session flags (human reconcile):** (1) migration `0024` — M15/M06/M19/M20 hold 0020–0023; re-verify
> 0024 free on merge. (2) DECISIONS **D-086…D-094** — M08 took D-084/D-085; renumber if a parallel session also
> claimed D-086+. (3) `config.toml` + `_shared/providers.ts` + `frontend/js/providers.js` are shared files edited
> concurrently by M19/M20 — M16's appends are additive; re-verify no clobber on merge. (4) The `0012` gap (M05
> renumber) + double-`0010` remain pre-existing, not M16's.

---

## Session 18 — M19 Sites (GrapeJS) *(vertical slice built 2026-07-04)*

**Attach:** Constitution · DECISIONS · DATA-SCHEMA (§12 sites) · RLS-AND-SECURITY · PRD_M19 ·
BUILD-SEQUENCE (Session 18) · DEFINITION-OF-DONE · TASKS. Design: AIMINDSHARE-DESIGN. Spec+plan:
`docs/superpowers/specs/2026-07-04-m19-sites-grapejs-design.md` · `docs/superpowers/plans/2026-07-04-m19-sites-grapejs.md`.

> **Dependency check (done before build):** M12 (S10), M14 (S12), M41 (S5), M05 (S7), M09 (S8), M13 (S11)
> present. **M15 Forms NOT built** (S16 — only a spec/plan) → **FormEmbed scaffolded** against the planned
> contract; **M06 Media NOT built** (S20, *after* this) → **image picker scaffolded** (URL + labeled M06
> button) — Law 9 · D-052/D-077 precedent. **CalendarEmbed → the REAL M14** (`book.html?embed=1`).
> **ChatWidget → M12 web-chat** (itself a scaffold, D-059). D-005 locks **GrapeJS** (Craft.js → GrapeJS).
> **OPEN D-009 (hosting)** → public renderer + DNS verify built live, **live SSL provisioning scaffolded
> "ready, not run"**. **No LLM provider** (like D-063) → **AI-generate is a deterministic niche-template
> engine** (meets ≥95% AC, meters nothing). Migration **`0022`** (0020 taken by parallel M15/M16, 0021 by
> M06/M20 — no ordering dep). DECISIONS **D-100…D-106** (chosen above the live parallel contention).

**Done (code + local verification):**
- [x] Migration `0022_m19_sites.sql`: 4 enums (`site_status`/`page_status`/`domain_status`/`ssl_status`);
      6 tables (`sites`, `pages`, `page_versions`, `site_domains`, `site_templates` global, `visitor_sessions`)
      all RLS-on in-file (staff+ read/edit · **manager+ publish+delete** · **admin+ domains** · page_versions +
      visitor_sessions system-written · templates global read · client ceiling); SECURITY DEFINER RPCs
      `publish_page` (snapshot → version, flip status, **prune to 10**, publish site), `revert_page`,
      `duplicate_page`; `record_page_visit` (direct timeline insert — no `auth.uid()` in the pixel context,
      D-065 pattern — + `emit_trigger('page.visited')`); `site.ssl_provision` scaffold hook (no cron, D-009).
- [x] Pure modules `frontend/js/page-builder.mjs` (deterministic AI: 5 niches · `validateSections`/`repairSections`
      · `sectionsToHtml`) + `frontend/js/site-render.mjs` (`renderPage` head/SEO/JSON-LD/brand/cookie/pixel/embed
      hydration · `buildSitemap`/`buildRobots`) — **one source of truth**, imported by the Edge Functions (Deno)
      AND the browser editor (dynamic import, proven live in preview).
- [x] Edge Functions (4): `builder-ai-generate` (staff+, deterministic engine, meters nothing) · `site-render`
      (public, service-role, host→published page→HTML + sitemap/robots by path) · `domain-verify` (admin+, DNS
      TXT check, SSL scaffold) · `site-track` (public pixel → `visitor_sessions` → `record_page_visit`). `config.toml`
      entries (render/track `verify_jwt=false`).
- [x] Vendored GrapeJS (`frontend/vendor/grapes.min.{js,css}`, no CDN); one in-file retokenise of the vendored
      CSS `font-family:Helvetica/monospace` → `var(--font-sans)`/`var(--font-mono)` (Gate-8, Drawflow D-060 precedent).
- [x] Frontend `m19-sites-grapejs.html` + `js/m19-sites.js` + `js/m19-editor.js` + `styles/m19-sites.css`:
      **/sites** (site cards) · **/sites/:id** (Pages · Nav builder · Domains + connect wizard/DNS/SSL scaffold ·
      SEO defaults · Settings/brand/danger) · **/sites/:id/edit/:pageId** (GrapeJS editor: blocks/layers/templates ·
      canvas · styles/settings/page-meta · device/undo-redo-50/AI/preview/save/publish; 16 custom blocks incl. the
      3 `data-embed` components). AI panel (Describe live/offline · Clone+Voice scaffolds). All Gate-5 states +
      mockup preview switcher; tokens-only, 3 fonts, `.5px`, dark = **no stars**.
- [x] **M19 SQL probe GREEN — 38/38** (`workers/verify/m19probe.mjs`, PGlite): cross-tenant leak ×6 tables · role
      matrix (staff can't publish/delete, manager can; domains admin+; client ceiling) · publish snapshot +
      status flip + **prune-to-10** + second-publish increments · revert · duplicate unique-slug · **renderer
      hides drafts** · visitor_sessions service-role-only · `record_page_visit` → timeline + `page.visited` bus ·
      templates global read + no tenant global write.
- [x] **M19 render/builder probe GREEN — 31/31** (`workers/verify/m19renderprobe.mjs`, Node): deterministic
      generator valid for all 5 niches · repair fixes broken input · renderPage injects title/desc/OG/canonical/
      JSON-LD (LocalBusiness+FAQPage)/brand vars/render_css/cookie/pixel/embed hydration · sitemap hides drafts.
- [x] No regressions: full `verify.sh` — leak 8/8 · job 5/5 · m00 9 · m01 35 · m02 43 · m03 25 · m04 24 · m05 21 ·
      m41 27 · m09 49 · m11 45 · m12 28 · m13 36 + walker 14 · m28 43 · m14 47 · m44 39 · m06 32 · m16 48 · m20 43 ·
      **m19 38 + m19render 31**. **Gate-8 CLEAN for M19 files** (the tighter `sk-` grep cleared the vendored GrapeJS
      `mask-`→`sk-` false positive; fonts retokenised; RLS on all 6 tables; no secrets/shimmer/hex).
- [x] Frontend verified in preview (`m19-preview`, port 5919): sites list (3 cards, hairline `.44px` + glass token
      `rgba(230,243,243,.68)` + mono date), site detail (5 tabs, 4 page rows, domains + SSL scaffold pill + hint),
      **GrapeJS editor mounts** (16 blocks, canvas loads page content, toolbar), AI-generate + Preview via the pure
      `.mjs` modules (valid page + JSON-LD render), dark `#04090A` **no stars**, **zero console errors**.
- [x] Docs: DATA-SCHEMA §12 note · DECISIONS **D-100…D-106** · JOBS §6 (`site.ssl_provision` scaffold) ·
      EDGE-FUNCTIONS-SPEC (4 fns) · `seed.sql` (Acme site + page + version + domain + 6 global templates + visitor) ·
      `leak_probe.sql` (M19 guards) · `verify.sh` (m19 + m19render steps) · `serve.mjs` (+`.mjs` MIME) · this file.

**Session 18 close:** Gate 1 ✅ (m19 probe cross-tenant on all 6 tables; leak 8/8) · Gate 2 ✅ (staff+ edit,
**manager+ publish+delete**, admin+ domains, client ceiling — RLS + the RPC `has_role` guards; published pages
not anon-readable, renderer service-role + status filter) · Gate 3 ✅ (**no billable action** — AI-generate meters
nothing until an LLM provider lands, D-103/D-063 posture; the `meter_increment('ai_tokens')` call-site is wired
for when it does) · Gate 4 ✅ (publish/revert/duplicate are synchronous definer RPCs; the pixel writes are
service-role; the one async hook, `site.ssl_provision`, is a documented scaffold — no cron, nothing provisions,
D-009) · Gate 5 ✅ (sites/detail/editor, all states incl. empty/skeleton/error+retry + mockup switcher — verified
in preview) · Gate 6 ✅ (light+dark, responsive 360/768/1280 no page h-scroll — editor panels/canvas own overflow,
mobile editor degrades to an outline; reduced-motion; tokens-only; 3 fonts; `.5px`; mono numerals; **dark = no
stars**) · Gate 7 ✅ (anon key only in browser; DNS/SSL/LLM creds Vault-only when D-009 lands; renderer/track/verify
hold no browser-visible secret; secrets grep clean) · Gate 8 ✅ (M19 files CLEAN — vendored GrapeJS retokenised +
the `sk-` grep tightened; the only repo-wide Gate-8 hits are **external** in `frontend/js/m16-campaigns.js`
(`rk_`→"netwo**rk_**error" + a "no shimmer" comment) — flagged for that parallel session, M19 introduced zero
hits) · Gate 9 ✅ (DATA-SCHEMA + DECISIONS + JOBS + EDGE-FUNCTIONS + seed + leak_probe + verify + TASKS updated).
Carried over (live, never faked green): the 4 Edge Functions + the public renderer + DNS verification against a
hosted Supabase; **live SSL issuance** when **D-009** lands; **real LLM** for AI-generate when a provider is
decided (D-103); **FormEmbed → M15** + **image picker → M06** when those ship; **ChatWidget → M12 web-chat**
(deferred, D-059) — all need Docker/CLI/Deno/creds absent here. DECISIONS added: **D-100…D-106**.
> ⚠ **Parallel-session flags (human reconcile):** (1) migration `0022` — parallel **M15/M16 hold `0020`**, **M06/M20
> `0021`**; the `0012` gap + double-`0010` remain pre-existing. (2) DECISIONS **D-100…D-106** chosen above the live
> contention (M08 D-084/D-085 · M15/M16 D-085…D-092 · M06/M20 D-084…D-098) — renumber if any also claimed D-100+.
> (3) shared files edited additively (`config.toml`, `scripts/verify.sh`, `scripts/serve.mjs` +`.mjs` MIME,
> `.claude/launch.json`, `supabase/tests/leak_probe.sql`) — re-verify no clobber on merge. `page.visited` fires
> via `emit_trigger` by string match (probe-proven); surfacing it in the M13 trigger palette is a follow-up. (4) Gate-8's 2
> repo-wide hits are **M16's** `m16-campaigns.js`, not M19 (the `rk_` grep should be tightened like the `sk-` one).

---

## Session 24 — M19 Sites **v2 hardening** *(additive upgrade built 2026-07-06)*

**Attach:** Constitution · DECISIONS · 0022 (v1) · PRD_M19 / Master PRD Module 7 · this audit.
**Scope:** competitive-gap pass on the S18 slice — audit first, additive-only, zero breaking changes.
**Audit verdict:** v1 publish/versions/domains/SEO/tracking preserved verbatim; v1 gaps closed: the template
gallery was cosmetic (ignored `site_templates` rows), versions had no UI or save points, no publish/ops log, no
analytics surface, no staging/maintenance/404 controls, form embed still a scaffold despite M15 shipping (S16).

- [x] Migration `0028_m19_sites_v2.sql` (0027 taken by M22-auto): additive columns —
      `sites.style_preset/maintenance_mode/not_found_html/preview_token/language`, `pages.language`,
      `page_versions.kind+label`, `site_templates.description/language/conversion_type/render_html/render_css`;
      new **`site_publish_log`** (RLS staff+ SELECT, system-written); `publish_page()` same contract + kind stamp +
      per-kind prune + log; new **`save_page_version()`** (staff+); `revert_page()` + log; **6 global niche template
      seeds** (dentist/realestate/restaurant/coach/saas/ecom, generator rows per D-103/D-151).
- [x] Pure modules: `page-builder.mjs` +3 niches; `site-render.mjs` — `STYLE_PRESETS` (minimal/bold/elegant/
      **islamic**), Product/Event JSON-LD, `<html lang>` per page, `renderMaintenance()`, custom-404 body,
      **form embed hydrates the live M15 iframe** (`/f.html?embed=1&token=` + postMessage auto-height, D-152).
- [x] Edge Fns: `site-render` — `?pt=` staging token serves drafts + bypasses maintenance (D-149), maintenance 503,
      site-branded 404; `domain-verify` — logs every attempt to `site_publish_log` (D-148).
- [x] Frontend: site detail gains an **Analytics** tab (compute-on-read sessions/top-pages + publish & domain
      history) and **Publish controls** (staging-link copy, maintenance toggle, custom 404); editor gains a
      **Versions** right-rail pane (save points, labels, restore→draft), **Save as template** (manager+), a
      **data-driven template gallery** (your library + global, niche/conversion badges), Hero/Pricing/Gallery
      blocks, page-language + Product/Event schema in the SEO panel. Mockup mode mirrors all of it.
- [x] **M19 v2 probe GREEN — 47/47** (`workers/verify/m19v2probe.mjs`, PGlite+Node): schema/seeds ·
      per-kind prune ·  save-point roles · publish-log tenancy + system-write · save-as-template roles ·
      staging query shapes · presets/i18n/maintenance/404/JSON-LD/embed/niches. **Full `verify.sh` GREEN**
      (m19 38/38 + m19render 40/40 regressions untouched); Gate-8 clean.
- [x] DECISIONS **D-147…D-152** appended (see log). Deferred honestly: per-section AI rewrite + clone-URL
      (LLM provider OPEN, D-063 posture) · live SSL provisioning (OPEN D-009) · per-language content variants
      (only the `language` property ships) · version diff view (restore + preview ship; textual diff later) ·
      chat embed (M12 web-chat not built).
> ⚠ **Parallel-session flags:** migration `0028` + D-147…D-152 claimed 2026-07-06 — renumber on merge if a
> parallel session took either. Shared files touched additively: `scripts/verify.sh` (one new step), the two
> pure `.mjs` modules (exports only added).

**Session 24 close: ✅ GO (human-approved 2026-07-06).** The executed v2 upgrade is the **canonical release
path** — additive schema evolution over rewrite, preserved signatures/policies/publish behavior, phased
schema→UI→ops→QA rollout, probe+regression+RLS+responsive evidence, observability via `site_publish_log`.
Rewrite / narrower release / big-bang cleanup explicitly rejected. D-147…D-152 stand as LOCKED.

---

## Session 21 — M21 SEO Engine *(vertical slice built 2026-07-04)*

**Attach:** Constitution · DECISIONS · DATA-SCHEMA (§13 SEO) · RLS-AND-SECURITY · JOBS-AND-WORKERS ·
EDGE-FUNCTIONS-SPEC · INTEGRATIONS-SPEC · PRD_M21 · BUILD-SEQUENCE (Session 21 entry) · DEFINITION-OF-DONE ·
AIMINDSHARE-DESIGN · this file. Spec `docs/superpowers/specs/2026-07-04-m21-seo-engine-design.md` + plan
`docs/superpowers/plans/2026-07-04-m21-seo-engine.md`.

> The SEO half of Phase 3 (BUILD-SEQUENCE S21 accept-when): keyword research via Edge Fn (DataForSEO,
> cached, meter++) · collections · rank tracker as a daily cron job on the worker · audits as
> `seo.audit.crawl` worker jobs · weekly rank email. **Research + ranking only** — content *production* is
> M22/S23. Deps: M41 Vault ✅, M13 bus ✅, M03 `seo_calls` meter ✅ — all real. **D-010 (heavy-job worker
> runtime) is OPEN**; the audit crawler is built **chunked + resumable** so it's runtime-agnostic and needs
> no rewrite when D-010 lands — only the live at-scale crawl execution is carried (D-131/D-135).

**Done:**
- [x] **Migration `0026_m21_seo.sql`** — 8 RLS tables (operator-ceiling, D-130): `keyword_lists`, `keywords`,
      `seo_keyword_cache` (workspace-scoped 30-day cache, D-129), `tracked_keywords` (+`competitor_domains[]`),
      `keyword_rankings` (worker-write), `seo_audits` (+resumable `cursor`), `seo_audit_issues` (worker-write),
      `content_queue` (M22/S23 forward-stub, D-134). SECURITY DEFINER RPCs: `seo_cache_get/put`,
      `send_to_content_queue`, `record_keyword_ranking` (delta + `rank.change_major` at |Δ|≥5, D-133),
      `rank_history`, `audit_score`, `enqueue_due_rank_checks`, `enqueue_weekly_rank_reports`. 2 guarded
      `pg_cron` entries. Grants: privileged writes service-role-only; reads/seam authenticated.
- [x] **M21 probe GREEN — 54/54** (`workers/verify/m21probe.mjs`, real Postgres via PGlite): 8-table
      cross-tenant leak · operator-ceiling role matrix (client reads nothing) · worker-write posture ·
      audits pending-only · cache upsert/TTL/workspace-scope · send-to-queue idempotent + staff-gated ·
      rank delta + major-move M13 emit (fires |Δ|=12, not |Δ|=2) · rank_history ceiling · audit_score
      determinism · daily/weekly cron enqueue (active-only + idempotent) · grants.
- [x] **M21 crawler probe GREEN — 9/9** (`workers/verify/m21crawlprobe.mjs`, Node): pure resumable BFS
      (`workers/seo/crawler.mjs`) — bounded batches · broken-link/missing-title/missing-meta detection ·
      maxPages cap · robots disallow.
- [x] **Edge Functions** `seo-keyword-lookup` (cache→DataForSEO→meter), `seo-serp` (SerpApi), `seo-gap`
      (DataForSEO Labs) + `_shared/seo.ts` (Vault via `resolveCredential`, `incrementMeter('seo_calls')` in
      the success path). `config.toml` × 3 (`verify_jwt=true`). `pagespeed` provider added (ts↔js mirror;
      m41probe EXPECTED at 21 → 27/27).
- [x] **Worker handlers** `rank.check` · `rank.report` (SendGrid send carried) · `seo.audit.crawl`
      (chunked + self-re-enqueue) wired into `worker.mjs` (syntax-clean).
- [x] **Frontend** `m21-seo-engine.html` + `js/m21-seo.js` + `styles/m21-seo.css` — 3 screens (Keyword
      research / Rank tracker / Site audit), Chart.js score-dial + 90-day history line, mockup mode with
      default/empty/loading/error/success (Gate-5). **Preview-verified**: 3 routes render, 0 console errors,
      dark mode (0 stars/dots in dark), Chart.js dial+line render, audit hscroll 0. Tables scroll inside
      `.table-wrap` (the shell column resolves to 360px with M21 content).
- [x] `scripts/verify.sh` (m21 + m21crawl steps) · `supabase/seed.sql` M21 block (**PGlite-validated**:
      2 lists · 5 keywords · 4 trackers · 9 rankings · 1 audit · 7 issues · 2 queue) · `.claude/launch.json`
      (`m21-preview`) · DATA-SCHEMA §13 · DECISIONS **D-128…D-135** · JOBS-SPEC §5/§6 · INTEGRATIONS-SPEC.

**Session 21 close:** Gate 1 ✅ (m21 probe cross-tenant on all 8 tables; client ceiling) · Gate 2 ✅
(staff read/write · manager delete · client reads nothing; `send_to_content_queue` re-checks `has_role`) ·
Gate 3 ✅ (`seo_calls` metered in the provider-success path; not-connected/failed calls bill nothing, D-132) ·
Gate 4 ✅ (`rank.check`/`rank.report`/`seo.audit.crawl` are `jobs`; browser inserts audits pending-only;
crawler resumable + idempotent; 2 crons registered) · Gate 5 ✅ (3 screens × 5 states) · Gate 6 ✅ (light+dark,
no stars in dark, responsive; M21 content 0 hscroll) · Gate 7 ✅ (provider keys only in Vault via Edge Fns;
nothing secret in the browser) · Gate 8 ✅ **for M21 files** (RLS Law-2 on `0026`; secrets/shimmer/hex/font
greps clean — the 2 repo-wide Gate-8 hits are pre-existing **M16/M22** `network_error`↔`rk_` + m16 shimmer
comment, no M21 file) · Gate 9 ✅ (DATA-SCHEMA/DECISIONS/JOBS/INTEGRATIONS/TASKS updated).

**Carried (ready-not-run, never faked green):** live DataForSEO/SerpApi/PageSpeed round-trips (no cred → 503
not_connected) · the live at-scale 500-page crawl (D-010 production runtime, OPEN) · the weekly `rank.report`
SendGrid send (composed, not sent — no Deno/creds here) · the M22/S23 content pipeline that consumes
`content_queue`.

⚠ **Parallel-session flags (human reconcile on merge):** (1) **Migration `0026`** landed above M22's
`0025_m22_content.sql` (0025 taken); re-verify `0026` free on merge (the `0012` M05 renumber is still open,
not mine). (2) **DECISIONS D-128…D-135** were reserved for M21 in M15's close note; now written as formal
headers — if another session contends them, renumber (house pattern). (3) **`content_queue`** is created by
M21 (M22 deferred it to S23, D-122/D-134) — S23 adopts it as-is + adds `content_schedules`. (4) Shared files
edited additively (`worker.mjs`, `_shared/providers.ts`+`js/providers.js`, `config.toml`, `verify.sh`,
`seed.sql`, `launch.json`) — re-verify no clobber on merge. (5) A **pre-existing shared-shell** topbar
min-content (~429px) clips ~54–69px at ≤375px in every module (m20 identical); `body{overflow-x:hidden}`
means no visible scrollbar — flagged, not fixed here (touches the shared shell, out of M21 scope).

---

## Session 22 — M22-manual Content/CMS *(vertical slice built 2026-07-04)*

**Attach:** Constitution · DECISIONS · DATA-SCHEMA (§9 content) · RLS-AND-SECURITY · JOBS-AND-WORKERS ·
EDGE-FUNCTIONS-SPEC · PRD_M22 · BUILD-SEQUENCE (Session 22 entry) · DEFINITION-OF-DONE · AIMINDSHARE-DESIGN ·
this file. Spec `docs/superpowers/specs/2026-07-04-m22-manual-content-cms-design.md` + plan
`…/plans/2026-07-04-m22-manual-content-cms.md`.

> The **manual** half of M22 (BUILD-SEQUENCE S22 accept-when): blog manager · revisions · categories/authors ·
> editorial review queue · readability/SEO scoring · publish to M19 sites. The **AI auto-blog pipeline**
> (SerpApi/GPT-4o/DALL·E/embedding linker/quality-gate/`blog.generate` worker/`content_queue`+`content_schedules`/
> scheduler top-up/distribution) is the **separate Session-23 slice** and is a labelled scaffold here (D-122/D-124/
> D-126). Deps: M19 Sites ✅ (S18) + M06 Media ✅ (S20) are the only ones the manual slice touches. M21 SEO +
> M35 Creative are unbuilt but consumed only by the S23 pipeline — user-approved to scaffold those seams.

**Done (code + local verification):**
- [x] Migration `0025_m22_content.sql`: `article_status` enum; `blog_articles` (canonical §9 + `site_id`→M19,
      `category_id`/`author_id`, `tags text[]`, `schema jsonb`, `seo_score`/`readability_score`/`word_count`,
      `embedding vector(1536)` **nullable scaffold** D-124, `reject_feedback`), `article_revisions` (append-only,
      prune-to-20), `article_categories`, `article_authors` (workspace user **or** pen name) — all RLS in-file
      (staff+ CRUD, manager+ delete; revisions SELECT-only, client CEILING mirroring M19 D-105). Definer RPCs
      `save_article_revision`/`restore_article_revision`/`publish_article`/`schedule_article`/`submit_for_review`/
      `approve_article`/`reject_article`/`publish_due_articles` (+ internal `_m22_publish` builds Article JSON-LD +
      fires `emit_trigger('article.published')` tolerantly, D-126); `m22-scheduled-publish` `pg_cron` (`*/15`, D-127).
- [x] Edge Fn `functions/blog-render/index.ts` (**public**, `verify_jwt=false`, service-role, `status='published'`
      filter) serving `/blog`, `/blog/[slug]`, `/blog/category/[slug]`, `/blog/rss.xml` — mirrors M19 `site-render`
      **without modifying it** (D-121). HTML/RSS from the PURE `frontend/js/blog-render.mjs` (shared with the probe).
      `config.toml` `[functions.blog-render]` entry.
- [x] Frontend `m22-manual-content-cms.html` + `js/m22-content.js` + `styles/m22-content.css`: hash-routed
      `/content` (articles table — status/category/author/search filters, bulk actions, all Gate-5 states +
      mockup switcher) · `/content/[id]` (hand-rolled contenteditable editor D-120 — toolbar, slash menu, link +
      internal-link search, **M06 AssetPicker** image insert; live **Flesch readability + on-page SEO rubric**
      sidebar D-125 with score ring/checklist/meta-length meters/schema preview; autosave **revisions** panel) ·
      `/content/review` (editorial cards → approve-publish / reject-with-feedback) · `/content/taxonomy`
      (categories + authors managers) · `/settings/content` (per-site defaults + **labelled disabled S23 auto-blog
      scaffold**). Tokens-only, 3 fonts, `.5px`, dark = no stars, glassmorphism panels.
- [x] **M22 SQL probe GREEN — 46/46** (`workers/verify/m22probe.mjs`, real Postgres via PGlite): cross-tenant leak
      ×4 tables · role matrix (staff edit / manager publish+delete+approve+reject / client ceiling) · append-only
      revisions + snapshot + **prune-to-20** + restore-as-draft · publish flips status + builds Article JSON-LD +
      manager-only · `schedule_article`→`publish_due_articles` publishes DUE / skips future · editorial
      submit/approve/reject-feedback · `(site_id,slug)` uniqueness.
- [x] **M22 render probe GREEN — 22/22** (`workers/verify/m22renderprobe.mjs`, Node): index lists only given
      (published) rows · designed empty state · single article emits **stored** Article JSON-LD + meta + canonical +
      body + byline · empty-schema fallback · category page labels/canonical · RSS 2.0 well-formed one-item-per-article ·
      not-found shell is noindex.
- [x] `scripts/verify.sh` (m22 + m22render steps) · `supabase/tests/leak_probe.sql` (M22 read/write guards) ·
      `workers/verify/verify-status.json` (m22) · `supabase/seed.sql` M22 block · `.claude/launch.json` (`m22-preview`).
- [x] Frontend verified in preview (`m22-preview`, port 5922): all 5 routes render, editor scores live (SEO ring +
      12-check rubric + Flesch), both themes, **0 h-scroll @ 375/768/1280** (the `.seg` filter now scrolls internally),
      zero console errors.

**Accept-when (BUILD-SEQUENCE S22):** ✅ Blog manager · ✅ revisions (autosave + restore, prune-20) ·
✅ categories/authors · ✅ editorial review queue (approve/reject-with-feedback) · ✅ readability/SEO scoring
(client-side Flesch + on-page rubric) · ✅ publish to M19 sites (`site_id` + `blog-render` on `/blog` routes + RSS).

**Session 22 close:** Gate 1 ✅ (m22 probe cross-tenant on all 4 tables; client ceiling) · Gate 2 ✅ (staff edit /
**manager+ publish/approve/reject/delete** enforced server-side via RLS + definer RPCs — a staff user can edit a
draft but cannot publish or approve via the SDK) · Gate 3 ✅ (**no billable action** — scoring is client-side, no
provider call; the S23 pipeline meters `ai.tokens`/`ai.image`) · Gate 4 ✅ (scheduled publish is `m22-scheduled-publish`
`pg_cron` → inline `publish_due_articles()`, never a client timer; browser can't write `published`/`scheduled`
directly — definer RPCs own those; `blog.generate` heavy job is S23) · Gate 5 ✅ (default/empty/loading/error/success +
mockup switcher) · Gate 6 ✅ (light+dark, responsive 375/768/1280 no h-scroll, reduced-motion, tokens-only, 3 fonts,
`.5px`, mono numerals, dark = no stars) · Gate 7 ✅ (anon key only in browser; `blog-render` runs service-role in the
Edge Fn; no provider secret) · Gate 8 ✅ for M22 files (RLS Law-2 on `0025`; secrets/shimmer/hex/font greps clean) ·
Gate 9 ✅ (DATA-SCHEMA §9 + DECISIONS **D-120…D-127** + JOBS §5 `m22-scheduled-publish` + this close note).
Carried over (live, never faked green): `blog-render` HTML/RSS over a hosted project + real Storage image URLs;
the live `m22-scheduled-publish` cron; wiring `article.published` into the M13 trigger **palette** (it fires by
string match now — probe-tolerant); the entire **S23 auto-blog pipeline** (SerpApi/GPT-4o/DALL·E/embedding
internal-linker/quality-gate/`content_queue`+`content_schedules`/distribution to M23/M24/M16) — scaffolded seams only.
DECISIONS added: **D-120…D-127**.
⚠ **Parallel-session flags (human reconcile):** (1) **Two M22 frontends were built concurrently** — **RESOLVED
2026-07-05:** the duplicate `m22-content-cms.*` was removed; canonical app is
`frontend/{m22-manual-content-cms.html, js/m22-content.js, styles/m22-content.css}` (loads `js/m22-content.js`
against the shared pure `js/content-seo.mjs` + `js/content-editor.mjs`). While reconciling, a Gate-6 mobile
h-scroll was found + fixed in `m22-content.css`: on the ≤760 single-column shell the top-bar workspace name/kind
(bare `<span>`, so the shared `.ws-meta` hide missed it) forced the shared grid column to ~445px; added a ≤760
rule to hide that text (keep the badge) + `.content{min-width:0}`. Re-verified 0 h-scroll at 360/768 on all
routes + editor, both themes. (2) Migration `0025` + DECISIONS **D-120…D-127** may contend with parallel M21/M22
work (M21 expected `0026`); renumber on merge (house pattern). (3) Shared files edited additively (`config.toml`,
`scripts/verify.sh`, `.claude/launch.json`, `leak_probe.sql`, `verify-status.json`, `seed.sql`) — re-verify no
clobber on merge. The `0012` gap + double-`0010` remain pre-existing.

---

## Carried over

- Hosted Supabase project creation + Auth provider config — Google OAuth, magic links, TOTP 2FA,
  built-in SMTP templates *(needs Supabase org; unblocks live M00 auth flows)*
- Live worker + Edge Function acceptance probes (`health`, `account`, `create_workspace`,
  `accept_invitation`, `workspace.provision`, **`permission-check`**) *(needs Docker Desktop +
  Supabase CLI + Deno; run `bash scripts/verify.sh` once installed)*
- M04 wires custom security-notice emails from `auth_events` (D-016) **and M01 invitation emails**
  (D-022) once D-011 is decided
- **M07 wires role/permission-change auditing** — `set_member_role`/`set_member_permissions`/`delete_role`
  are the documented hook points; `audit_log` lands with M07 (D-026)
- Modules append their `module.action` permissions to `_shared/permissions.ts` + extend the built-in
  role arrays (a later migration) as they're built — the registry is the single source of truth (D-023)
- M09/M11/M14 extend the `workspace.provision` handler with the deferred pipeline/calendar/tag seeds (D-020)
- **M03 live Stripe**: add `stripe_secret_key` + `stripe_webhook_secret` to Vault, set each plan's
  `stripe_price_id`, then run the full test-clock lifecycle + webhook signature round-trip against a
  hosted Supabase project — the Edge Functions (`billing-checkout`/`billing-portal`/`billing-webhook`)
  are ready, **not run** (no Stripe account/toolchain here) (D-028)
- **M12 live Twilio**: add per-workspace `twilio__account_sid` + `twilio__auth_token` to Vault + an
  `integrations` row (`provider='twilio'`, status connected) + an active SMS `channels` row (the number),
  then run the inbound webhook (real `X-Twilio-Signature`) + `inbox-send` outbound + Realtime multi-user
  threads against a hosted Supabase — ready, **not run** (no Twilio account/toolchain here) (D-055/§8.1)
- **M12 email channel** — blocked by OPEN **D-011**: the `conv_channel` schema + read-only email threads
  ship now; wire Gmail-OAuth/SMTP send-receive + Message-ID threading when D-011 lands (mirrors M04)
- **M12 WhatsApp / FB / IG** — the Meta provider week: add the unified Meta webhook router + a
  `contact_channel_identities {contact_id, channel, external_id}` PSID map (deferred per approved scope,
  phone-only resolution now); **webchat widget** + **AI auto-reply** (needs **M33** agent) are scaffolds;
  **missed-call→SMS** (Twilio voice webhook) defers to **M34** (D-059)
- **M12 portal narrowing** — the `sel_client` policy for `conversations` (a client sees only their own
  thread with the agency, RLS §4) lands with **M37**; Phase-1 inbox has no client users yet
- **Every metered module (M04, M08, M10, M12, M13, M16, M21, M22, M24, M25, M33, M34, …) MUST call
  `meter_increment` in the success transaction of its provider call and gate with `has_feature` /
  `meter_check`** — the retrofit-prevention contract (USAGE-METERING §9); a module that skips it fails DoD Gate 3
- **M04 email channel + digest SENDER** — blocked by OPEN **D-011** (Resend vs SendGrid). Prefs/channels/
  schedule land now; when D-011 decides, wire the provider + the `notification.digest` worker handler, and
  consume the deferred **security-notice emails (D-016)** + **M01 invitation emails (D-022)** through it
- **M04 per-workspace-local 8am digest** — the `m04-digest-enqueue` cron defaults to **UTC** until **M07**
  ships `workspace_settings.timezone`; switching the tz source is then a one-line change (D-030)
- **M04 reusable bell** (`js/notifications.js` + `js/notification-types.js`) is a drop-in — later module
  pages embed it in their topbar; the Done M00–M02 pages were **not** retrofitted this session (by design)
- **M04 push channel** — stubbed (toggles disabled); wired in **M43** Mobile Field App

---

## Session 19 — M20 Funnels *(vertical slice built 2026-07-04)*

**Built:** `funnels` + `funnel_steps` (a step = an M19 `page_id`) + `funnel_splits` (A/B) + `funnel_visits`
(per-step event stream) in `0023_m20_funnels.sql`; server-truth fns `funnel_map` (per-step conversion),
`funnel_split_stats` (fixed-horizon two-proportion z-test winner), `promote_split_winner` (manager+),
`create_funnel_order` (→ M28 `invoices` `source_type='order'`; M28 trigger owns the total),
`record_funnel_event` (optin→CRM upsert+tag / purchase→`payment.received`), `sweep_abandoned_funnels`
(`m20-abandoned-sweep` hourly → `cart.abandoned`). `public-funnel` Edge Fn (track + order, `verify_jwt=false`).
Frontend `m20-funnels.html/.js/.css`: funnels list (revenue glance) · funnel step map (per-step conversion) ·
step drawer (page link + type config + A/B split) · analytics waterfall · settings (pipeline map + abandonment);
mockup mode + all Gate-5 states, both themes, responsive.

**Accept-when (BUILD-SEQUENCE S19):** ✅ step builder on M19 pages · ✅ funnel map w/ per-step conversion ·
✅ A/B split w/ winner detection · ✅ order forms wired to M28.

**Session 19 close:** Gate 1 ✅ (m20 probe cross-tenant on `funnels`/`funnel_steps`/`funnel_splits`/`funnel_visits`;
client-role read ceiling) · Gate 2 ✅ (staff+ read/edit, manager+ promote-winner/delete, service-role-only
visits/order/sweep) · Gate 3 ✅ (no new billable action — the order creates an M28 invoice; M28 owns metering) ·
Gate 4 ✅ (`funnel_visits` service-role write only; `m20-abandoned-sweep` `pg_cron`; idempotent sweep marker) ·
Gate 5 ✅ (empty/loading/error/success + mockup switcher) · Gate 6 ✅ (both themes, 360/768/1280, no shimmer,
mono numerals) · Gate 7 ✅ (no client secret; Stripe key in Vault, reused from M28) · Gate 8 ✅ **for M20 files**
(`m20-funnels.*` clean — global `gate8.sh` fails ONLY on pre-existing `m06`/`m16` false-positives: `rk_` inside
"netwo**rk_**…" + literal "no shimmer" comments — NOT M20; flagged to those sessions) · Gate 9 ✅ (DATA-SCHEMA §9
+ DECISIONS D-107…D-112 + JOBS §5 `m20-abandoned-sweep` already updated by this build; this close note).
**m20probe: 43/43.**
Carried over: one-click off-session Stripe upsell (UI + `create_funnel_order` seam present); public funnel
renderer (depends on M19 `site-render` maturing); sequential/Bayesian significance (ships fixed-horizon z-test).
DECISIONS added: **D-107…D-112**.
⚠ **Numbering churn (parallel builds):** migration `0023_m20_funnels.sql` (M19 moved →`0022`, M06 took `0021`);
D-107…D-112 (max D observed elsewhere = D-113) — re-verify slot / renumber on merge.

### M20 v2 upgrade, Priorities 1–3 *(additive pass, 2026-07-09)*

Audit + gap analysis + phased plan: `docs/superpowers/plans/2026-07-09-m20-funnels-v2-upgrade.md`. Scope was the
user-approved slice of the v2 brief — statuses/test-mode/go-live validation, variant governance, revenue
attribution — nothing else. Additive-only migration `0029_m20_funnels_v2.sql`; zero existing rows, routes, or RLS
posture changed.

**Built:** `funnel_status` gains `testing`/`paused` · `funnels.test_mode` / `funnel_visits.is_test` /
`invoices.is_test` (test-mode data segregation) · `funnel_splits` gains variant C + `min_sample_size`/`confidence`/
`auto_promote` (governance) · `funnel_split_stats` generalized to an optional 3rd arm (2-arm math unchanged at
defaults) · `promote_split_winner` accepts `'C'` · new `stop_split` (manager+) and `auto_promote_split_winners`
(`m20-auto-promote-sweep` hourly `pg_cron`) · new `funnel_publish_readiness` (blockers vs. warnings, reads M19's
`site_publish_log` for domain/SSL) · new `funnel_revenue_summary` (revenue/orders/AOV/EPC + by_step + by_source
UTM first-touch attribution, test-rows excluded). Frontend: Settings tab gained an Operations panel (status
stepper, test-mode toggle, publish-readiness list); the A/B Split drawer tab gained variant-C fields, min-sample/
confidence/auto-promote inputs, and a Stop-test action; Analytics tab gained a Revenue panel (EPC/AOV/by-step) and
the "Traffic by source" list now shows real per-source revenue (previously mock-only in the connected/live path —
a pre-existing gap this pass closed as a side effect of D-158).

**Verification:** `m20probe.mjs` extended 43→71 assertions, all green; full `scripts/verify.sh` re-run clean (no
regression from the cross-module `invoices.is_test` column). Preview-verified in mockup mode (status stepper,
test-mode toggle, publish-readiness, 3-arm split drawer incl. promote-C, revenue panel) — no console errors, no
h-scroll introduced.

**Explicitly deferred (Priorities 6–9 of the v2 brief — see the plan doc for the full phased breakdown):**
duplicate/save-as-template funnels, per-funnel permissions finer than the workspace role, an operations/
observability (logs/jobs) surface, and the full 15-section sidebar IA rebuild.
DECISIONS added: **D-153…D-158**.

### M20 v2 upgrade, Priorities 4–5 *(additive pass, migration 0030, same day)*

Continued the same additive-only workflow into Priority 4 (order-bump/upsell UI honesty + step routing —
**frontend-only, no schema change**, `funnel_steps.config` is already jsonb) and Priority 5 (automation hooks).

**Built:** `funnel_visits.event` widened for `upsell_accepted|upsell_declined|downsell_accepted|downsell_declined`
(D-159) · `record_funnel_event`/`create_funnel_order`/`promote_split_winner` now emit `funnel.entered`,
`step.completed`, `form.submitted`, `checkout.started`, `upsell.accepted/declined`, `downsell.accepted/declined`,
`test.winner_selected` via M13's existing `emit_trigger` (D-160, best-effort, same pattern as `payment.received`)
· new `set_funnel_status` RPC emits `funnel.published` only on the real draft/paused/testing→active transition
(D-161) — the frontend's status pills now route through it. Frontend: step Config tab reworked — order bumps are
now `config.bumps[]` (old singular `config.bump` read back-compat, normalized on save), added "on purchase/accept
→ step" and "if declined → step" routing pickers, and the upsell/downsell tab states plainly that one-click
saved-card charging isn't wired yet instead of a dead toggle (D-162).

**Verification:** `m20probe.mjs` 71→85 assertions (every new emit_trigger call site + `set_funnel_status`), all
green; full `scripts/verify.sh` re-run clean. Preview-verified: multi-bump back-compat (old `Guided Journal` bump
reads correctly as a 1-row bumps list), routing selects correct per step type (order = purchase-only, upsell/
downsell = purchase+decline), honest upsell copy renders, save round-trips with no console errors.

**Still deferred (at that point, Priorities 6–9):** duplicate/templates, permissions, observability, sidebar IA
rebuild. DECISIONS added: **D-159…D-162**.

### M20 v2 upgrade, Priorities 6–7 *(additive pass, migration 0031, same day)*

Continued into Priority 6 (duplicate/save-as-template/create-from-template) and Priority 7 (per-funnel
permissions), per the user's choice to do "just duplicate/templates + permissions" over the full remaining scope
(observability + the 15-section sidebar IA rebuild stayed deferred, deliberately not started).

**Built:** `funnels.is_template`/`template_of_id` + one `duplicate_funnel(p_funnel, p_as_template, p_name,
p_site_id)` RPC serving all three flows — copies steps (remapping `next_step_id`/`decline_step_id` to the copied
steps, D-164), never copies splits/visits (clean analytics slate), strips site/page for a template (D-163) ·
new `funnel_access` table — a NARROW-ONLY per-user override (absence = default workspace-role behavior, unchanged
for everyone today); `can_view_analytics=false` is enforced **server-side** inside `funnel_map`/`funnel_split_stats`/
`funnel_revenue_summary` via a new `funnel_analytics_denied()` check (D-165); `can_edit` is stored/toggle-able but
explicitly UI-only this pass — flagged, not silently gapped (D-166). `set_funnel_access`/`remove_funnel_access`
(manager+).

Frontend: funnel-list cards gained a "⋯" menu (Duplicate, Save as template); templates are filtered out of the
main list and only surface as picks in the "New funnel" modal ("Or start from a template"); Settings tab gained a
Team & Permissions panel (restrict a specific staff member's edit/analytics access, remove a restriction) that's
explicit in its own copy about which half is server-enforced.

**Verification:** `m20probe.mjs` 85→103 assertions — including a real end-to-end proof that a restricted staff
member is denied by the RPC itself, not just hidden in the UI — full `scripts/verify.sh` clean. Preview-verified:
duplicate/save-as-template/create-from-template round-trip in mockup mode, Team panel add/remove restriction,
template correctly excluded from the operational list, 0 console errors, 0 h-scroll at 375px.

**Still deferred (at that point, Priorities 8–9):** an operations/observability (logs/jobs) surface, and the full
15-section sidebar IA rebuild. DECISIONS added: **D-163…D-166**.

### M20 v2 upgrade, Priority 8 *(additive pass, migration 0032, same day)*

Continued into Priority 8 (observability) on "keep going" after the Priority 6-7 report. New `funnel_operations_log`
RPC — a read-only derive over EXISTING data, no new tables: automation delivery log (M13's `workflow_executions`
filtered by `trigger_payload->>'funnel_id'`, joined to `workflows.trigger_type`) + abandoned-order/promoted-split
counts (from `funnel_visits`/`funnel_splits`). Same "compute on read" convention as `funnel_map`/
`funnel_revenue_summary`; respects the same `funnel_analytics_denied()` narrowing (D-165).

Frontend: Settings tab gained an "Activity & automation logs" panel (2 KPI tiles + a delivery log list with
status/error/timestamp per row).

**Verification:** `m20probe.mjs` 103→107 assertions, full `scripts/verify.sh` clean, preview-verified (mockup
data renders including a failed-delivery row with its error message), 0 console errors, 0 h-scroll at 375px.

**Still deferred at that point — Priority 9 (the full 15-section sidebar IA rebuild)** was scoped as its own plan
before touching it, per CLAUDE.md's large-refactor rule. DECISIONS added: **D-167**.

### M20 v2 upgrade, Priority 9 Step 1 *(IA rebuild — nav shell, same day, frontend-only)*

Rebuilt funnel-detail navigation from a 3-tab horizontal bar into a 13-item left rail that swaps in per-funnel —
mirrors M19's existing per-site rail swap, not a new UI pattern. No migration, no new RPCs: every relocated panel
(Operations/Team/Logs out of the old stacked Settings tab; Attribution split out of Analytics; CRM & Revenue
split out of Settings) is the exact same code addressed by its own route instead of stacked in one tab.

**New (Variants, Checkout):** thin list views over already-loaded step data; row actions delegate to the existing
step drawer (`openStep(id, tab)` generalized to accept a target tab) instead of duplicating drawer logic.
**New (Automations):** derives a trigger-status list from the same `funnel_operations_log` data Logs already
fetches — no second query. **New (Templates):** filters the already-loaded `state.funnels` (which includes
templates) by `template_of_id` for "templates saved from this funnel" — no new query. **New (Overview):** a
landing composition of readiness + revenue glance + recent activity, all from data already fetched.

Routing: `#/funnels/:id/map|analytics|settings` → 13 keys, defaulting to `overview`. `saveSettings()` made
null-safe across its two new homes (CRM & Revenue vs. Settings) so saving from either doesn't clobber fields that
live on the other page.

**Verification:** syntax-checked, then every one of the 13 sections navigated and content-checked in mockup mode
(Variants→Manage opens the drawer's Split tab, Checkout→Edit opens Config, CRM/Settings saves round-trip without
clobbering the other's fields, status-pill change from Operations still works, funnels list unaffected) — 0
console errors, 0 h-scroll at 375px, rail's existing `overflow-y:auto` (shared components.css) handles the taller
nav with no CSS change needed.

**Deferred to Step 2:** Contacts/Entries — the one section needing genuinely new backend (an entrant-list RPC
over `funnel_visits`+`contacts`), scoped as its own small additive migration next.
DECISIONS added: **D-168**.

### M20 v2 upgrade, Priority 9 Step 2 *(migration 0033, same day — closes the v2 brief)*

New `funnel_entrants(p_funnel, p_limit, p_offset)` RPC: one row per real `visitor_id` aggregated from
`funnel_visits` (first/last seen, contact link, variant, first-touch UTM source, furthest step reached, latest
order status via the linked contact's invoices) — `visitor_id LIKE 'order:%'` bookkeeping-marker rows excluded,
same as `funnel_map`. Test-mode entrants are shown (tagged `is_test`), NOT excluded like the revenue RPCs —
seeing your own test run in this list is the point. Paginated, returns `{entrants, total}`.

Frontend: 14th rail section, "Contacts / Entries" — a table of visitor identity/source/furthest step/variant/
order status/last-seen, with a name→email→visitor_id fallback chain and a stacked mobile layout.

**Verification:** `m20probe.mjs` 107→116 assertions (order-marker exclusion, furthest-step/variant/order-status
aggregation correctness, pagination total vs. page size, membership + analytics-restriction guards), full
`scripts/verify.sh` clean, preview-verified across all 14 sections with 0 console errors and 0 h-scroll at 375px.
DECISIONS added: **D-169**.

**M20 v2 upgrade brief: ALL 9 PRIORITIES SHIPPED.** Migrations 0029–0033; DECISIONS D-153…D-169; `m20probe.mjs`
grew 43→116 assertions across 6 passes, `scripts/verify.sh` green after every one. Full audit/gap-analysis/
phased plan: `docs/superpowers/plans/2026-07-09-m20-funnels-v2-upgrade.md`.

### M20 landing-page vs. per-funnel-workspace IA split *(same day, requested separately after the v2 brief closed)*

The v2 brief's Priority 9 rebuild (D-168/D-169) had put ALL 14 deep sections one level too shallow — reachable
straight off the module's landing screen instead of being scoped to one funnel's workspace. This pass separates
the two contexts cleanly:

- **Module landing** (`#/funnels`, `#/funnels/<section>`) — 7 items: Overview, Funnels, Templates, Analytics,
  Attribution, Automations, Settings. Overview carries the KPI strip (moved off the old Funnels grid) plus a
  client-derived "attention needed" panel (live+test-mode funnels, running A/B tests, stale drafts — zero new
  queries). Templates is now a real gallery page with Use/Delete actions. Analytics/Attribution/Automations are
  index pages (workspace KPIs + a per-funnel table linking into that funnel's own full-depth tab) rather than a
  new cross-funnel aggregation RPC. Settings is genuinely new: new-funnel defaults (currency, test-mode-on-create)
  persisted to `localStorage`, applied by `newFunnelModal()`.
- **Per-funnel workspace** (`#/funnels/<id>/<tab>`) — still 14 items, but **Steps** is now split out from
  **Funnel Map** (Steps = pure structure list for building, no numbers; Funnel Map = the visual node-map with
  live conversion/drop-off, unchanged) and **Templates** is removed (duplicate/save-as-template actions relocated
  into a new "Duplication & templates" panel inside Operations — templates themselves are workspace-wide, not a
  per-funnel concept).
- `parseRoute()` disambiguates the shared `#/funnels/...` prefix via a `MODULE_SECTIONS` reserved-word list.
- **"Acquisition" sidebar label was NOT renamed** — confirmed via grep that M15/M16/M19/M20 all share it, and
  `Master_Module_List_v3.md` Phase 2 is titled "Acquisition & Sites" grouping exactly these four modules.

Frontend-only, no migration, no CSS additions (100% reuse of existing panel/list/grid classes). Preview-verified
across all 7 landing + 14 workspace sections, 0 console errors, 0 h-scroll at 375px. DECISIONS added: **D-170**.

## M20 v3 — AI Funnel Studio + premium Operations Workspace *(2026-07-10, migrations 0034-0035)*

Full master-prompt process followed: audit → gap analysis → phased plan (A-E) → implement Phase A+B, checkpoint,
then Phase C+D on explicit "follow the master prompt fully, point by point" instruction. Phase E (full
viewer/analyst/editor/admin RBAC enforcement) deliberately NOT attempted — flagged below, not faked.

**1. CURRENT MODULE AUDIT (summary):** M20 v2 (all 9 priorities, D-153…D-170) was fully shipped going into this
pass — builder/map/A-B-C testing/checkout/revenue/automations/templates/permissions/observability/entrants/IA all
real and verified. Fragile spots found: `funnel_access.can_edit` UI-only (D-166, pre-existing); list-card stats
read `f.steps` which live mode never populates (pre-existing, not touched); **a genuinely new finding** —
`payment_intent.succeeded` never called `record_funnel_event(purchase)`, so Funnel Map's order-step conversions
showed 0 even for funnels with real paid revenue (revenue/AOV/EPC were fine, they read `invoices` directly).
No LLM provider is wired anywhere in AiMindShare (verified directly) — every "AI" feature in this repo ships as a
deterministic scaffold with the provider deferred (D-063/D-092/D-103 posture).

**2. GAP ANALYSIS (highest-value, ranked):** no AI-guided creation path at all (Layer A didn't exist) → built.
No `order_failed`/checkout-failure visibility anywhere → built (and found the bigger purchase-wiring gap while
there). Launch readiness was boolean, no score → added. Revenue had no date-range UI, no trend, no UTM
medium/campaign breakdown → added. No advisory/optimization layer → built (5 grounded rules). No job-run
visibility for the two hourly sweeps → added. Real one-click upsell/downsell charging → **confirmed out of scope**,
needs new M28 saved-payment-method plumbing that doesn't exist; building it here would be exactly the faked
capability the module's own checkout-honesty rule forbids.

**3-4. UPGRADE PLAN + IMPLEMENTATION:**
- **Phase A** (migration `0034_m20_funnels_v3a.sql`, D-171/172): `funnels.funnel_type` (nullable), `funnel_blueprints`
  table (wizard sessions).
- **Phase B** (same migration, D-173/174): `recommend_funnel_blueprint(answers)` — the Studio's decision matrix,
  deterministic (D-063 posture, no LLM dependency); `save_funnel_blueprint`/`approve_funnel_blueprint`/
  `convert_blueprint_to_funnel` — the write path, convert materializes real `funnel_steps` rows. Frontend: new
  "AI Funnel Studio" nav item, a 4-stage wizard (Goal → Offer → Audience → Blueprint review), `localRecommendBlueprint()`
  JS-mirrors the SQL matrix for mockup mode.
- **D-175** (payments-webhook fix, found mid-pass): `payment_intent.succeeded` now also records the funnel
  purchase (idempotency-guarded); `payment_intent.payment_failed` now records `order_failed`. Edge Fn change is
  ready-not-run (no Deno locally) — reviewed line by line instead.
- **Phase C+D** (migration `0035_m20_funnels_v3b.sql`, D-176…D-180): `funnel_map` gains per-step revenue/bump-marker/
  no-page-warning; `funnel_publish_readiness` gains a 0-100 score; `funnel_revenue_summary` gains a daily trend +
  UTM medium/campaign breakdowns + a real revenue-reconciliation flag; new `funnel_recommendations()` — the AI
  Optimization advisory layer (drop-off, checkout completion, EPC, missing bump, ready-to-promote variant — all
  derived from data already computed, zero new tracking); `funnel_job_runs` + both sweep functions now log every
  run. Frontend: readiness score + recommendations panel (Overview), date-range picker + trend + medium/campaign
  (Analytics/Attribution), reconciliation warning (CRM & Revenue), job-run history (Logs), a coupon field
  (Checkout, jsonb-only), a Viewer/Analyst/Editor/Full-access preset selector (Team — explicitly a relabel of the
  same two existing booleans, not new enforcement).

**5. QA CHECKLIST:** `m20probe.mjs` 116→135→150 assertions across both migrations; `scripts/verify.sh` green after
each; RLS/tenant checks on every new table+function (funnel_blueprints, funnel_job_runs, funnel_recommendations);
payment/checkout untouched except the additive webhook fix; preview-verified all 14 workspace sections + 7 landing
sections + the full wizard flow (mockup-generated funnel materialized real steps), 0 console errors, 0 h-scroll at
375px on every screen touched.

**6. CHANGELOG — deferred, not forgotten:** real one-click upsell/downsell charging (needs new M28 plumbing, own
workstream); full viewer/analyst/editor/admin RBAC *enforcement* (Team's preset selector is UI-only over the
existing two booleans, same gap as D-166); traffic-mismatch/proof-block/form-field AI advisories (would need data
this system doesn't track — page-content inspection is a different module's job); `by_content`/`by_term` UTM
dimensions (real cost, marginal value over `by_source`); a genuine M28 "payment provider connected" / M15 "form"
readiness check (data these functions don't have access to). DECISIONS added: **D-171…D-180**.

**Phase F — Instant mode + product/affiliate offer-source branch** *(2026-07-10, migration 0036, D-181)*: a second
master prompt asked for the same "AI Funnel Studio" vision; auditing first (as required) found the above v3 pass
already covered most of it. Closed the two genuine remaining gaps only. **Instant Funnel mode**: a one-screen
condensed path (niche/objective/offer type/price/traffic) added to the wizard alongside the existing 4-stage
"Smart Brief" — both now sit behind a mode-picker at Studio entry, reusing the same `recommend_funnel_blueprint`
engine with sensible defaults filled in for the fields Instant mode skips (audience awareness inferred from
traffic source, no lead-magnet/checkout questions asked). **Product/Affiliate offer-source branch**: no
product/course/offer catalog exists anywhere in this repo (checked M28 payments, M03 billing, M09 CRM), so rather
than building one, the wizard's Offer stage (and Instant mode) gained an offer-source toggle (own product vs.
affiliate) storing vendor/URL/commission/disclosure fields into the existing `answers` jsonb — no new tables.
`recommend_funnel_blueprint` gained 3 new funnel types (`affiliate_bridge`/`affiliate_review`/`affiliate_comparison`,
widened into the `funnel_type` CHECK constraint), each generating an optin/sales/thankyou flow with no order/
upsell/downsell steps (the sale happens on the vendor's site) and an FTC-disclosure checklist reminder. Frontend:
mode-picker cards + an "Affiliate Funnel" shortcut on the Studio landing, a "Generate with AI" entry button on the
Funnels list. `m20probe.mjs` +7 assertions (offer_source branch decision matrix, no-bump/upsell/downsell invariant,
disclosure checklist, and an end-to-end convert-to-funnel proving the widened CHECK). **Explicitly not attempted,
same honesty posture as the v3 pass**: an async job queue for blueprint generation (it's a deterministic,
sub-second SQL call, not an LLM call — building fake progress/retry UI around it would be the faked capability
this module's own rule forbids); a real product/course/offer catalog (its own module-sized workstream); one-click
upsell/downsell charging and full RBAC enforcement (unchanged, already correctly deferred above). DECISIONS added:
**D-181**.

## M20 AI Funnel Studio — Phase 1: real LLM provider layer *(2026-07-10, migration 0038, D-186)*

Wired a real Anthropic provider behind the existing ai_tokens meter/Vault-secret
infrastructure: new `funnel-ai-generate` Edge Function (auth+role gate → rate
limit → ai_tokens quota gate → LLM call → deterministic
`recommend_funnel_blueprint` fallback on any failure/unavailability), new
`_shared/llm.ts` provider adapter, new `funnel_ai_generation_log` table +
`funnel_ai_rate_limited()` (20 calls/workspace/hour, LLM calls only), widened
`save_funnel_blueprint` to persist `generation_source`/`llm_model`/
`tokens_used`. Ships with no Anthropic key configured — every call runs on the
deterministic fallback until the one-time Vault secret is set (documented in
the design spec's Operational note). Probe: 166 → 174 assertions.

Deferred (per the approved spec): BYOK UI, credit purchases, non-Anthropic
providers, other modules consuming `_shared/llm.ts`.

## M29 — Affiliate Hub, Phase 1a foundation + Funnels bridge *(2026-07-10, migration 0037, D-182…D-185)*

A third master prompt asked for the same "AI Funnel Studio" vision plus a clean architectural split: **Funnels**
builds/generates/optimizes conversion paths; **Affiliate Hub** owns affiliate business data (offers, links,
networks, disclosures, earnings), bridged only by explicit handoff actions, never merged. Auditing first found
"Affiliate Hub" is already reserved in this repo as **M29** (`doc/PRD/PRD_M29_Affiliate_Hub.md`,
`Master_Module_List_v3.md`) — a full PRD (link cloaker/rotation, Amazon PA-API via M41, live multi-network earnings
sync, AI content generators tied to M22) with **zero implementation**. That full scope is its own module-sized
workstream; this pass ships only **Phase 1a**: a real (not stubbed) offer vault + a one-directional bridge into
M20's existing AI Funnel Studio, plus the two matching additions inside Funnels itself (an Offers tab and a
Compliance tab). The user confirmed the target split and asked for a plan before implementation — plan mode was
used, scoping this explicitly smaller than the full request (Phase 1b/2 named below, not attempted).

**M29 foundation (D-182):** migration `0037_m29_affiliate_hub.sql` — `affiliate_offers` (name, network, vendor URL,
niche, commission note, `compliance_category` check `general|health|finance|income|sensitive`, disclosure text,
promo assets jsonb, status), `affiliate_networks` (manual list, `status` defaults `'manual'` — no live API wiring,
same D-063 honesty posture as every other unbuilt-integration stub), `affiliate_disclosure_templates` (reusable
snippets by category). All three: member-read, staff-write RLS, same shape as every other M-module table. New
frontend module `frontend/js/m29-affiliate-hub.js` + `frontend/m29-affiliate-hub.html` +
`frontend/styles/m29-affiliate-hub.css`, built on the exact same shell/moduleHead/svg/toast/modal conventions as
every other module. Nav (Overview/Offers/Networks/Campaigns/Creatives/Tracking Links/Disclosures & Compliance/
Earnings/Analytics/Library/Settings) is the user's full target IA from day one (safe — brand-new module, no
existing routes to break); only Overview/Offers/Networks/Disclosures & Compliance/Settings are real in Phase 1a —
Campaigns/Creatives/Tracking Links/Earnings/Analytics/Library render an honest "not built yet" empty state, never
fabricated data.

**The bridge (D-183):** additive `funnels.source_offer_id` (nullable FK → `affiliate_offers`, every existing funnel
unaffected) + `convert_blueprint_to_funnel` gains an optional `p_source_offer_id` param (had to `drop function`
the old 3-arg signature first — adding a 4th param to `create or replace` creates a new overload instead of
replacing it, which made a 2-arg call ambiguous; caught by actually running the probe, not just reading the SQL).
One direction only: M29's Offers list → "Create Funnel from Offer" writes a one-time `localStorage` prefill key,
navigates to M20's Studio, which consumes-and-clears it, pre-fills the affiliate wizard (niche/vendor/URL/
commission/disclosure), and on approve tags the new funnel with `source_offer_id`. Reverse direction (Earnings
rollup, "Open in Affiliate Hub" round-trip beyond the one-way link already in M20's new Offers tab) is Phase 1b.

**Compliance scan (D-184):** `funnel_compliance_scan(p_funnel)` — deterministic phrase-pattern rule table (5 rules:
guaranteed-income/miracle-health/risk-free-finance claims at `high` severity, fake-urgency/100%-absolute claims at
`medium`) over the funnel's own step copy (name/CTA/purpose) — same posture as `recommend_funnel_blueprint`
(D-173) and `funnel_recommendations` (D-179): a real lint-style feature, not NLP claim understanding. Frontend
gates the draft→active publish transition with a warn-not-block confirm (not a DB-level block, to avoid touching
`set_funnel_status`'s tested behavior) when high/medium findings exist.

**M20 IA additions (D-185, frontend-only, no schema):** landing nav reordered/relabeled to Overview/Funnels/AI
Funnel Studio/Templates/**Pages**/Automations/Analytics/Settings (Attribution's route is unchanged, just no longer
top-level — folds conceptually into Analytics); new **Pages** landing view (read-only cross-funnel page-reuse
index from `funnel_steps.page_id`, no new schema). Per-funnel workspace nav gains **Offers** (shows the source M29
offer + "Open in Affiliate Hub") and **Compliance** (the scan above); the existing 5-rule recommendations panel
**moved** (not duplicated) off Overview into its own **Optimization** tab; `tabMap`'s label renamed "Funnel Map" →
"Flow Map" (cosmetic). The remaining 7 tabs (Checkout/Attribution/Contacts/CRM & Revenue/Automations/Operations/
Team/Logs/Settings) are deliberately **not** collapsed/renamed into the user's fuller proposed 13-tab IA — this
repo already treats nav restructuring as its own dedicated task sequence (see "IA restructure Task 9/10/11" in
git history), and collapsing seven working tabs in the same pass as a feature build was judged too risky to bundle.

**QA:** new `m29probe.mjs` (16 assertions: schema/RLS for all 3 new tables, CHECK constraints, staff-write/
client-denied, cross-tenant SELECT/UPDATE/DELETE all correctly return zero rows or are rejected). `m20probe.mjs`
+8 assertions (150→158→166: the bridge setting `source_offer_id`, cross-tenant offer rejection, compliance scan
flagging a deliberately risky funnel + clearing a clean one, RLS on the scan and on `affiliate_offers`). Both
registered in `scripts/verify.sh`; full suite green, no regressions. Preview-verified end to end in both
`m20-funnels.html` and `m29-affiliate-hub.html`: create offer → "Create Funnel from Offer" → Studio opens
pre-filled (prefill key consumed exactly once) → generate → approve → new funnel's Offers tab shows the source
offer + working "Open in Affiliate Hub" link → Compliance tab scans clear on real generated copy; 0 console
errors; the only h-scroll at 375px is the pre-existing `.tbar` overflow already present on unmodified pages
(confirmed by measuring the same baseline on both), not a regression from this pass.

**Deferred, not forgotten — Phase 1b (next):** Tracking Links (real pretty-link CRUD + `/go/:slug` edge-function
redirect + click logging), Networks moving from manual stub to CSV import, Earnings rollup, the reverse bridge
round-trip. **Phase 2 (later):** Campaigns, Creatives (+ "Send Hook to Funnel"), Library, angle generation (3–5
angles per blueprint), quiz funnel branching (via M15's existing scoring/tiers/conditional-logic engine), email/SMS
sequence generation (via M16's existing sequence data model), the fuller 13-tab per-funnel IA collapse, Amazon
PA-API / live network integrations (needs M41, matches the PRD's own later phase). DECISIONS added: **D-182…D-185**.

## Session 20 — M06 Media Library *(vertical slice built 2026-07-05)*

**Attach:** Constitution · DECISIONS · DATA-SCHEMA (§6 media) · RLS-AND-SECURITY · JOBS-AND-WORKERS ·
EDGE-FUNCTIONS-SPEC · PRD_M06 · BUILD-SEQUENCE (Session 20 entry) · DEFINITION-OF-DONE · AIMINDSHARE-DESIGN ·
this file. Spec `docs/superpowers/specs/2026-07-05-m06-media-library-design.md` + plan `…/plans/2026-07-05-m06-media-library.md`.

> The central workspace asset store. Ships canonical DATA-SCHEMA §6 (`media_assets`/`media_folders`) + minimal
> logged extensions (D-113/D-114) — an asset is `(bucket, storage_path)` indexing a Storage object, **not** the
> PRD's Prisma model with a stored `url` + `AssetUsage` table. Usage tracking is the canonical `used_in` jsonb
> (D-118) with a one-time `backfill_asset_usage()` from `deal_files` (M11, the sole existing consumer). Upload is
> direct-to-Storage + `register_media_asset()` (no presign Edge Fn — D-115); variants are Storage transform URLs
> (D-116); auto-tagging is a `media.autotag` job with a provider-deferred vision scaffold (D-117, like M13 D-063);
> storage metering revives the dormant `storage_gb` meter via a nightly gauge-recompute (D-119). Migration `0021`.

**Done (code + local verification):**
- [x] Migration `0021_m06_media.sql`: `media_folders` (+`bucket`/`kind`/`pinned` for brand collections) +
      `media_assets` (canonical §6 + `filename`/`title`/`alt_text`/`duration_sec`/`is_favorite`/`tag_status`),
      all RLS in-file (media = staff write / manager delete · brand = admin, mirroring `0004`; browse SELECT hides
      soft-deleted); RPCs `register_media_asset` (row + `media.autotag` enqueue, atomic), `register_asset_usage`/
      `unregister_asset_usage`, `backfill_asset_usage()` (from `deal_files`, idempotent), `recompute_storage_meter`
      (gauge-set), `soft_delete_asset` (manager+), `media_kind_of`; nightly `m06-storage-meter-nightly` `pg_cron`.
- [x] Edge Fn `functions/media-autotag/index.ts` (service-side vision **scaffold**, `verify_jwt=false`) +
      worker `media.autotag` handler + `config.toml` entry. No billable call fires until a provider lands (Gate 3).
- [x] Frontend `m06-media-library.html` + `styles/m06-media.css` + `js/m06-media.js` + **`js/asset-picker.js`**
      (the reusable `AssetPicker` export, exercised by a test-consumer button — AC-3): two-pane folder tree + asset
      grid/list, drag-drop upload with progress, search (name+tag)/type/favorites filters, bulk toolbar, detail
      Sheet (preview · transform-variant links · editable alt/title/tags · **Where-used** · delete-warns-if-used),
      brand-collections manager. Tokens-only, 3 fonts, `.5px`, dark = no stars, all Gate-5 states + mockup switcher.
- [x] **M06 probe GREEN — 32/32** (`workers/verify/m06probe.mjs`, real Postgres via PGlite): cross-tenant leak on
      both tables · role matrix (staff media / admin brand / manager delete / client ceiling) · `register_media_asset`
      (image → one queued idempotent `media.autotag` job; non-image → `skipped`, no job; path/ws mismatch rejected) ·
      `used_in` append/dedup/unregister · backfill from `deal_files` (idempotent) · storage meter gauge (re-run
      overwrites) · soft-delete hides from browse + staff cannot soft-delete.
- [x] No regressions: full `verify.sh` suite green; **Gate-8 CLEAN for M06 files** (reworded two own false positives
      — `"connection_lost"` cleared the `rk_`-in-`network_` secret grep; "no sweep/sheen anims" cleared the literal
      "shimmer" comment). The only remaining repo-wide `gate8.sh` hits are **external** in `frontend/js/m16-campaigns.js`
      (`network_error` + "no shimmer" comment) — flagged for M16, not introduced here.
- [x] Frontend verified in preview (`m06-preview`, port 5906): all routes + Gate-5 states render, AssetPicker
      open→select→return contract works, detail Sheet + where-used, dark `#04090A` (no stars), **0 h-scroll @
      375/768/1280**, zero console errors.
- [x] Docs: DATA-SCHEMA §6 implementation note · DECISIONS **D-113…D-119** · JOBS §5 (`m06-storage-meter-nightly`
      cron) + §6 (`media.autotag` type) · `config.toml` (`media-autotag`) · `seed.sql` (Acme `media`/`brand` folder
      tree + 3 brand collections + 9 assets spanning every `tag_status` + a `used_in` entry) · `leak_probe.sql`
      (M06 read/write guards) · `.claude/launch.json` (`m06-preview`) · `verify-status.json` (m06) · this file.

**Accept-when (BUILD-SEQUENCE S20):** ✅ Storage-backed folders · ✅ upload (direct-to-Storage + register RPC) ·
✅ AI auto-tagging as jobs (`media.autotag`, provider scaffold) · ✅ usage-tracking backfill (`used_in` from
`deal_files`) · ✅ brand collections (pinned `brand`-bucket folders, surfaced first in the picker).

**Session 20 close:** Gate 1 ✅ (m06 probe cross-tenant on both tables; leak_probe extended) · Gate 2 ✅ (media =
staff write / manager delete, brand = admin, client ceiling — all server-side via RLS) · Gate 3 ✅ (**no billable
action** — storage is a gauge, autotag meters `ai_tokens` only on a real provider call which is scaffolded off) ·
Gate 4 ✅ (`media.autotag` is a `jobs` row, browser inserts `queued` only via the definer RPC; idempotent
`media:autotag:<asset>`; storage meter is an inline nightly cron recompute) · Gate 5 ✅ (default/empty/loading/error/
success + mockup switcher — verified in preview) · Gate 6 ✅ (light+dark, responsive 360/768/1280 no h-scroll,
reduced-motion, tokens-only, 3 fonts, `.5px`, mono numerals, dark = no stars) · Gate 7 ✅ (anon key only in browser;
direct-to-Storage is RLS-gated; no service-role/provider secret in frontend; secrets grep clean) · Gate 8 ✅ (M06
files CLEAN) · Gate 9 ✅ (DATA-SCHEMA + DECISIONS + JOBS + config + seed + leak_probe + launch + verify-status +
TASKS updated). **m06probe: 32/32.**
Carried over (live, never faked green): real Storage round-trips (upload → object → signed URL → transform variant)
+ the nightly storage-meter cron + Realtime grid refresh against a hosted project; **live vision auto-tagging**
(provider undecided — scaffold + job pipeline + meter call-site + `tag_status` lifecycle all built); Storage
image-transform add-on / imgproxy at deploy; virus-scan (ClamAV, out of accept-when); M35 brand-kit binding;
restore-from-trash UI; the `seed.sql` M06 block is **validated on PGlite** (loads on the full migration stack —
5 folders / 9 assets / 1 `used_in` / `tag_status` done=6·pending=1·skipped=2), with the live seed into a hosted
project carried (no Docker/CLI here). DECISIONS added: **D-113…D-119**.
⚠ **Numbering reconcile (parallel builds):** the design spec drafted M06 at **D-107…D-113**, but M20 (Session 19)
had committed **D-107…D-112** — so at close the M06 block was **shifted +6 → D-113…D-119** across every M06
code/doc reference (migration, `media-autotag`, `config.toml`, `js`, spec, plan). Migration `0021_m06_media.sql` is
unique (M15/M16 = `0020` collision — not M06 · M19 = `0022` · M20 = `0023`). The still-open `0012` M05 renumber
(Session 5's flag) remains for the human. If a later merge re-contends D-113…D-119, renumber on merge (house pattern).

## DECISIONS added this cycle

- D-001…D-008 LOCKED, D-009…D-013 OPEN *(day-one entries, 2026-07-02)*
- **D-015** GoTrue-native (drop PRD's hand-rolled auth tables) · **D-016** built-in SMTP for M00,
  security notices deferred to M04 · **D-017** `auth_events` identity-scoped, distinct from M07
  `audit_log` *(2026-07-03, Session 1)*
- **D-019** agency = top-level workspace (no separate `Agency` table) · **D-020** provisioning:
  owner membership synchronous, pipeline/calendar/tags deferred to M09/M11/M14 · **D-021**
  active-workspace via RLS-scoped `localStorage`, not a signed cookie · **D-022** M01 invitation
  email deferred to M04 (D-011), invite link surfaced now *(2026-07-03, Session 2)*
- **D-023** M02 keeps the enum as the coarse RLS tier; adds `roles` + `role_id` for fine perms ·
  **D-024** `memberships.role` derived from `role_id.base_role` by trigger (no drift; custom roles
  can't be owner) · **D-025** overrides jsonb `{grant,revoke}`, revoke wins, owner short-circuit,
  client ceiling · **D-026** role/permission-change auditing deferred to M07 *(2026-07-03, Session 3)*
- **D-027** M03 reconciles the shipped `0003` tables to canonical DATA-SCHEMA §5 via a new append-only
  migration `0009` (never edit `0003`; legacy enum values left dead) · **D-028** Stripe via REST +
  Web Crypto with the key in Vault — no SDK, no browser secret *(2026-07-04, Session 4)*
- **D-029** M04 in-app feed uses Supabase Realtime `postgres_changes` (not Pusher); `notif_channel` enum
  + `notifications`/`notification_prefs` + `notify()` ship in `0011_m04_notifications.sql` (0009/0010
  taken by M03/M05/M41 in parallel) · **D-030** M04 digest fires 8am **UTC by default** until M07 supplies
  per-workspace timezone; sender stubbed until D-011 *(2026-07-04, Session 6)*
- **D-053** M12 `conversations` +status CHECK/`unread_count`/`last_channel`/`ai_mode` · **D-054** `messages`
  +status/`ai_generated`/`external_id`/`mentions`/`search_tsv` GIN · **D-055** browser inserts NOTES only,
  channel traffic is a service-role write · **D-056** channels write = admin+ · **D-057** coarse RLS tiers,
  no new `inbox.*` grants · **D-058** M12 creates the `conv_channel`/`msg_direction` enums (deferred from
  0000) · **D-059** email defers (D-011), WhatsApp/FB/IG + webchat + AI auto-reply defer, SMS-only live
  *(2026-07-05, Session 10 — migration `0015`, no conflict with M11's `0014`/D-049…D-052)*
- **D-070** M28 `invoices` = one table both `kind`s + server-computed totals (trigger, client can't forge) ·
  **D-071** `invoice_payments` append-only, service-role write only · **D-072** money = integer minor units,
  `tax_rate` numeric percent · **D-073** staff+ create/edit, **manager+ delete AND void** · **D-074** overdue =
  daily `pg_cron` flip, reminders/late-fees defer · **D-075** charges on the workspace's connected Stripe account,
  app-fee default 0 (M42 hook) · **D-076** send: link live / SMS via M12 / email deferred (D-011) · **D-077**
  webhook idempotent via M03's `stripe_events`; dunning→M13 best-effort, PDF/plans/QR/Text-to-Pay defer
  *(2026-07-05, Session 13 — migration `0018`; D-064…D-069 skipped for parallel M14; renumber on merge)*
- **D-078…D-083** M44 admin: platform-admin-gated definer RPCs · own append-only `admin_audit_log` ·
  jobs-monitor over `public.jobs` (infra monitor reconciled) · feature flags + overrides · impersonation
  shape · slice scope + `ws_status='suspended'` *(2026-07-04, Session 14 — migration `0019`)*
- **D-084** M08 dashboard slice = read-only KPI/needs/feed/quick-actions/fixed-grid; KPI cards feature-flag
  by table presence; drag-reorder + `dashboard_layouts` + Copilot deferred · **D-085** Chart.js v4.4.4
  vendored to `frontend/vendor/chart.min.js` (no CDN/build; colours from tokens) *(2026-07-04, Session 15 —
  no migration; renumber D-084…D-085 if a parallel session also claimed them)*
- **D-113** M06 ships canonical §6 (`media_assets`/`media_folders`, not PRD Prisma) · **D-114** minimal logged
  extensions (`filename`/`title`/`alt_text`/`duration_sec`/`is_favorite`/`tag_status`; no `search_tsv`) ·
  **D-115** direct-to-Storage upload + `register_media_asset` definer RPC (no presign Edge Fn) · **D-116** image
  variants = Storage transform URLs (Sharp/BullMQ dropped) · **D-117** `media.autotag` job + Edge-Fn scaffold,
  vision provider deferred (like M13 D-063) · **D-118** usage = canonical `used_in` jsonb + `backfill_asset_usage`
  from `deal_files` (no `asset_usages` table) · **D-119** storage metering = nightly `pg_cron` gauge-recompute of
  the dormant `storage_gb` kind *(2026-07-05, Session 20 — migration `0021`; shifted +6 from the spec's draft
  D-107…D-113 to clear M20's committed D-107…D-112)*

---

*Living file. Update every session. If it isn't on this list, it isn't happening this session.*
