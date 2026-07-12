# DECISIONS-AiMindShare-v1_0.md
### AiMindShare.com — Decisions Log
**Version 1.0 · Opened 2026-07-02**

> Append-only. Every architectural decision, library swap, and deviation from the PRD lives here
> with a status (`LOCKED` / `OPEN` / `SUPERSEDED`), a date, and a one-line rationale. Claude Code
> treats `LOCKED` entries as binding. `OPEN` entries are human calls — do not resolve them in a
> build session; flag and wait.

---

## D-001 · Stack override — vanilla + Supabase · **LOCKED 2026-07-02**
The PRD's Next.js / Node / Express / Prisma / Redis / BullMQ stack (§3) is replaced entirely by
**vanilla HTML/CSS/JS front end + Supabase back end** (Postgres, Auth, RLS, Storage, Realtime,
Edge Functions). The PRD's *functionality* stands; its *stack* does not. Rationale: no build
tooling, database-enforced tenancy, one managed backend, proven on prior products.

## D-002 · Tenancy mechanism — RLS · **LOCKED 2026-07-02**
Isolation is enforced by Postgres Row-Level Security, not application middleware. Every tenant
table carries `workspace_id uuid not null` + index and the standard RLS policy set. Rationale:
the database is a wall app code cannot forget.

## D-003 · Async pattern — jobs table + pg_cron + workers · **LOCKED 2026-07-02**
The PublishlyAI control-plane pattern replaces BullMQ/Redis. Browser writes only `queued`; workers
own `running/done/failed`; recurring work is `pg_cron`. Rationale: proven, serverless-friendly,
no Redis to run.

## D-004 · Design inheritance · **LOCKED 2026-07-02**
`QURANLYAI_DESIGN.md` is the law (tokens, type scale, hairlines, motion, forbidden patterns).
`publishlyai-command-center.html` is the canonical reference implementation of that law in
dashboard form (extended token set + component library). Rationale: reuse a proven design system,
don't reinvent one.

## D-005 · Locked library swaps (PRD React libraries → vanilla) · **LOCKED 2026-07-02**

| PRD assumed | Vanilla replacement | Used by |
|---|---|---|
| React Flow (automation canvas) | **Drawflow** | M13 |
| Craft.js (site builder) | **GrapeJS** (the PRD's own alternate — already vanilla) | M19, M20 |
| @hello-pangea/dnd (kanban) | **SortableJS** | M11, M18 |
| TanStack Table | plain HTML tables + small JS helpers | everywhere |
| Zustand / React Hook Form | plain JS state + native `<form>` | everywhere |
| Recharts | **Chart.js** (the PRD's own alternate — vanilla) | M08, M40 |
| TipTap (rich text) | **TipTap vanilla build** or **Quill** | M12, M16, M22 |
| Pusher | **Supabase Realtime** | M12 |
| S3 | **Supabase Storage** | M06 |
| NextAuth | **Supabase Auth** | M00 |
| BullMQ + Redis | **`jobs` table + pg_cron + workers** | all async |

Rationale: each PRD library assumed React; these are the closest framework-free equivalents. Two
(GrapeJS, Chart.js) were already the PRD's own listed alternates.

## D-006 · Design reference mockup · **LOCKED 2026-07-02**
Design reference = `publishlyai-command-center.html`. Its `:root` block is the canonical extended
token set; its component classes are the canonical dashboard library (`kpi-strip/tile`,
`needs-panel`, `pipe-mini`, `opp-card`, `data-row`, `panel/panel-head`, `pill`, `jobs-chip`,
`eyebrow`, rail sidebar, topbar `kbd` hint, atmosphere layer). Extract into `tokens.css` + a
component spec in `AIMINDSHARE-DESIGN`.

## D-007 · Light-mode default · **LOCKED 2026-07-02**
`data-theme="light"` is the default; dark mode is the sibling `[data-theme="dark"]` block. Matches
the Console precedent and the reference mockup.

## D-008 · Font substitution for dashboard-class products · **SUPERSEDED by D-014 (2026-07-03)**
~~The three fonts are **Cormorant Garamond + Inter + JetBrains Mono** (numbers/data). JetBrains Mono
replaces Amiri, which is dropped.~~ Superseded — see D-014. Retained for history: the three-font
ceiling and the "numbers get a distinct data font" principle both carry forward unchanged.

## D-014 · Editorial font system · **LOCKED 2026-07-03**
The three fonts are now **Cormorant Garamond (display/headings) + Baskerville (body, labels, UI) +
Shippori Mincho (numbers/data)**, superseding D-008's Inter + JetBrains Mono. Details:
- **Body/labels** use `--font-sans` → `'Baskerville','Baskerville Old Face','Libre Baskerville',Georgia,serif`.
  Native Baskerville renders on macOS/iOS; **Libre Baskerville** (Google Fonts) is the loaded web
  fallback for Windows/Linux. Body base **16.5px / weight 400**; uppercase labels **14.5px / 600**.
- **Numbers/data** use `--font-mono` → `'Shippori Mincho','Cormorant Garamond',Georgia,serif`. The
  variable keeps its legacy `mono` name but no longer maps to a monospace face.
- **Light-mode body ink is near-black** (`--ink-700/500 = #0A0F0E`) for maximum readability; muted
  ink is lifted to a dark gray (`--ink-400 = #2E3B3A`, `--ink-300 = #556260`) to preserve hierarchy
  for secondary text. Headings (`--ink-900`) and all dark-mode tokens are unchanged.
Rationale: an all-serif editorial system (Cormorant + Baskerville + Shippori Mincho) reads warmer,
calmer, and more premium than the Inter/JetBrains pairing for this product. The three-font ceiling
is unchanged; Gate-8's font grep is updated to match.

---

## D-015 · M00 auth uses GoTrue natively — no hand-rolled auth tables · **LOCKED 2026-07-03**
Supabase Auth (GoTrue) already owns users (`auth.users`), OAuth identities (`auth.identities`),
sessions/refresh tokens, TOTP 2FA (`auth.mfa_factors` / `auth.mfa_challenges`), and one-time tokens
for magic-link / password-reset / email-verify (`auth.one_time_tokens`). PRD_M00 §5 specified
Prisma-era `auth_tokens` / `backup_codes` / `user_sessions` / `oauth_accounts` tables; these are
**dropped** — they duplicate GoTrue and add surface to secure and leak-probe. M00's migration
(`0006_m00_auth.sql`) adds only the `handle_new_user()` profiles trigger and the `auth_events`
ledger. Flows are driven client-side by supabase-js (`signUp`, `signInWithPassword`,
`signInWithOAuth`, `signInWithOtp`, `mfa.*`, `resetPasswordForEmail`, `updateUser`, `signOut`).
Rationale: don't fight the stack (Constitution D-001/D-005: NextAuth → Supabase Auth).

## D-016 · M00 auth emails use Supabase Auth built-in SMTP; custom notices deferred to M04 · **LOCKED 2026-07-03**
The core M00 flows (email verification, magic link, password reset) are sent by Supabase Auth's
built-in email — they do **not** depend on the OPEN D-011 (Resend vs SendGrid), so D-011 does not
block Session 1. The PRD's security-notice emails (new-login-detected, account-locked,
2FA-changed) are **deferred to M04 Notifications**; M00 still **logs** those events to `auth_events`
now, so no data is lost. When D-011 lands, M04 wires the provider and consumes the ledger.

## D-017 · `auth_events` is identity-scoped, distinct from M07 `audit_log` · **LOCKED 2026-07-03**
Auth events (signup, login_success/failed, logout, 2FA changes, password change, session revoke,
account delete) are **identity-level** and often pre-workspace (a failed login has no workspace and
no session), so `auth_events` carries **no `workspace_id`** and its RLS is self-scoped (`user_id =
auth.uid()`, select-only; writes via the `log_auth_event()` definer RPC or service role;
append-only). This is separate from M07's workspace-scoped `audit_log` (DATA-SCHEMA §5); M07 ingests
`auth_events` nightly (PRD_M07 §6). Gate-8's vendored dependency (`frontend/vendor/supabase-js.min.js`,
the UMD build, no CDN) is scanned and clean; no exclude needed.

## D-018 · Type refinement — smaller uppercase labels + KPI numbers · **LOCKED 2026-07-03**
User-directed visual balance: D-014's **14.5px** uppercase labels and the **29px** KPI numbers read
too large against the 16.5px body. **Adopted design-system-wide** (not M00-scoped): the refined sizes
are promoted into the shared base — `app.css` `.label`/`.kpi-label` → **10px** (tracking eased
.16em→.10em), `.kpi-val` → **22px** — and recorded in AIMINDSHARE-DESIGN §4 / §8.2 / §8.8. M00 adds
only auth-specific tuning in `m00-auth.css` (46px auth inputs, OTP **24→20px**, divider label 10px;
see design §8.9). This refines D-014's label-size detail; the three-font system and all other D-014
values stand. The Session 0 console inherits the new sizes from the shared base.

## D-019 · Agency = a top-level workspace; no separate `Agency` table · **LOCKED 2026-07-03**
PRD_M01 §4 models `Agency`, `Workspace`, `WorkspaceUser`, `WorkspaceInvitation` (Prisma). On this
stack the **agency is just a top-level `workspaces` row** (`parent_workspace_id is null`) and a
**sub-account is a child row** (`parent_workspace_id → agency`); `WorkspaceUser` is the existing
`memberships` table. This is already how RLS-AND-SECURITY §1 and DATA-SCHEMA §3 define the wall —
M01 formalizes it. Rationale: one table + one membership rule governs all access (agencies and
sub-accounts leak-test identically); a second parent table would duplicate tenancy and widen the
attack surface. `WorkspaceInvitation` maps to the new `public.workspace_invitations` table.

## D-020 · M01 provisioning: owner membership synchronous; pipeline/calendar/tags deferred · **LOCKED 2026-07-03**
PRD_M01 §3 says new-workspace provisioning seeds a default pipeline, calendar, and 5 starter tags.
Those tables belong to **M09 (tags/CRM), M11 (pipeline), and M14 (calendar)** — not yet built, and
Constitution Law 9 forbids building a module before its dependencies. Resolution: `create_workspace`
creates the **owner membership synchronously** (guarantees the Session-2 accept-when even if the
worker is down) and enqueues a `workspace.provision` job that seeds `workspaces.settings` defaults
(notification prefs + sender placeholder) now; the pipeline/calendar/tag seeds are **deferred** to
those modules, which extend the same `workspace.provision` handler when they land. The job type and
hook already exist, so nothing is faked — the deferral is logged by the worker. Recorded in
`JOBS-AND-WORKERS-SPEC §6`.

## D-021 · Active workspace = RLS-enforced localStorage selection, not a signed cookie · **LOCKED 2026-07-03**
PRD_M01 §3 specifies a **signed cookie** `active_workspace_id` with "cookie tamper returns 403." On
this stack there is no Node session layer to sign a cookie, and **RLS is the boundary**: every read
is `is_member(workspace_id)`-scoped, so selecting (or tampering to) a workspace the user isn't a
member of simply returns **empty results**, never another tenant's data. M01 stores the active
workspace in `localStorage` and revalidates membership on switch via the same RLS path. Rationale:
Constitution Law 2 — the database is the wall, not app-layer code that can forget or be forged. A
signed cookie would be defense theatre on top of the real (RLS) guarantee.

## D-022 · M01 invitation email deferred to M04; invite link surfaced in UI now · **LOCKED 2026-07-03**
The invitation *record* + hashed token is written directly by an admin (RLS-gated insert). The
invitation **email** needs a provider, which is the OPEN **D-011** (Resend vs SendGrid) — so email
delivery is **deferred to M04 Notifications**, exactly like the M00 security notices (D-016). Until
then the UI generates the secure invite **link** (raw token in the URL fragment, `sha256` stored)
for the admin to share by hand; `accept_invitation()` redeems it. D-011 stays non-blocking for M01.

---

## D-023 · M02 keeps the enum as the coarse RLS tier; adds `roles` + `role_id` for fine perms · **LOCKED 2026-07-03**
PRD_M02 §4 models a `Role` table and migrates `WorkspaceUser.role → roleId` FK. On this
stack that FK would rewrite the entire wall — `has_role()`, every RLS policy,
`guard_last_owner`, `is_sole_owner`, and all M01 RPCs compare the `member_role` enum. So
M02 **maps the PRD model onto the existing wall instead of replacing it** (mirrors D-019/
D-021): `memberships.role` (enum) stays the coarse tier RLS enforces; a new
`public.roles` table (built-in global rows + per-workspace custom roles) plus a nullable
`memberships.role_id` carry the `module.action` grants that Edge Functions read via
`has_permission()`. **RLS enforces the coarse matrix; Edge Functions enforce the fine
overrides** (RLS-AND-SECURITY §2). Migration `0008_m02_roles.sql`. Rationale: don't rebuild
the wall for zero security gain — fine perms are enforced above RLS regardless.

## D-024 · `memberships.role` is derived from `role_id.base_role` by trigger — never set independently · **LOCKED 2026-07-03**
To eliminate any drift between the coarse tier (RLS) and the fine role (permissions),
assigning a `role_id` **forces** `memberships.role := roles.base_role` via the
`sync_membership_role()` BEFORE trigger. RPCs take only `role_id`; the trigger derives the
enum. Custom roles may not have `base_role = 'owner'` (a CHECK + the RLS write policies), so
a custom role can never fabricate ownership — promotion to owner stays exclusively in
`transfer_ownership` (M01), keeping the last-owner invariant in one place. `set_member_role`
also refuses the owner tier and relies on `guard_last_owner` to block demoting the sole owner.

## D-025 · Fine overrides are jsonb `{grant,revoke}`; revoke wins; OWNER short-circuits; CLIENT ceiling · **LOCKED 2026-07-03**
`memberships.permissions` (reserved for M02 since 0001) holds `{"grant":[…],"revoke":[…]}`.
`has_permission(ws,perm)` resolves `(role_perms ∪ grant) − revoke`, with **revoke winning**,
**OWNER short-circuited to all-true** (checked before overrides), and a **CLIENT ceiling** so
a client-tier caller only ever holds `portal.*` (the coarse RLS wall blocks the rest anyway;
the ceiling keeps the answer honest for the UI). A flat array couldn't express per-member
narrowing (the STAFF-style delete/export block); revoke-wins is the safe default.

## D-026 · Role/permission-change auditing deferred to M07 · **LOCKED 2026-07-03**
PRD_M02 §3 sends all role/permission changes to the M07 audit log. M07's `audit_log` isn't
built yet (Constitution Law 9), so — exactly like M01 deferred invite email to M04 (D-022)
and M00 deferred security notices (D-016) — M02's role/override RPCs (`set_member_role`,
`set_member_permissions`, `delete_role`) are the **documented hook point** (each carries an
`M07 hook` comment) and write no audit today. When M07 lands it wires these RPCs; no data is
faked in the interim.

## D-027 · M03 reconciles the shipped 0003 tables to canonical DATA-SCHEMA §5 via a new migration · **LOCKED 2026-07-03**
Session 0's `0003_meters_plans.sql` shipped the meters/plans tables as a simplified early cut that
diverged from canonical `DATA-SCHEMA §5`: `meter_kind` used `seo_api`/`storage_gb` (missing
`seo_calls`/`image_gen`/`video_render`); `usage_events` had a generic `context jsonb` instead of
`unit_cost`/`source`/`ref_id`; `credit_wallets` was one-per-workspace instead of per-workspace×meter.
Migrations are append-only (`DATA-SCHEMA`: "Never edit a shipped migration; add a new one"), so
**M03 ships `0009_m03_billing.sql`** which `ALTER`s the tables toward canonical (extends the enum;
adds `unit_cost`/`source`/`ref_id`; adds `credit_wallets.kind` + swaps the unique constraint) rather
than editing 0003. Legacy `seo_api`/`storage_gb` remain as **dead enum values** (Postgres cannot drop
enum values) — unused, harmless. This is required for the canonical `meter_increment`/`meter_check`
helpers and for M42 rebilling (which needs per-event `unit_cost`). Storage metering stays OPEN
(USAGE-METERING §12): `storage_gb` exists as a dead value but no `storage` meter is wired.

## D-028 · Stripe runs via REST + Web Crypto with the key in Vault — no SDK, no browser secret · **LOCKED 2026-07-03**
The M03 PRD assumes the Stripe Node SDK; the locked stack (D-001) has no build step and forbids
secrets in the browser (Law 3). M03's Edge Functions (`billing-checkout`, `billing-portal`,
`billing-webhook`) therefore call the **Stripe REST API with `fetch`**, read the secret key +
webhook signing secret from **Supabase Vault** (the Session 0 `health` function is the read pattern),
and verify webhook signatures with **Web Crypto HMAC-SHA256** (`_shared/stripe.ts`). The browser only
ever receives a redirect URL. The full credential-vault UI is M41 (Session 5); until then the Stripe
secrets are added to Vault directly (`vault.create_secret`), exactly like the Session 0 placeholder.
Checkout/portal that hit an unconfigured Vault return a clean `503 stripe_unconfigured` — honest, never
faked. Live Stripe test-clock lifecycle is carried "ready, not run" (no Stripe account on this machine).

## D-029 · M04 in-app feed uses Supabase Realtime `postgres_changes`; `notif_channel` enum + tables ship in `0011_m04_notifications.sql` · **LOCKED 2026-07-04**
The M04 PRD assumed **Pusher** with a `ws-{workspaceId}-user-{userId}` broadcast channel; D-005 already
swapped realtime to **Supabase Realtime**. M04 implements the bell/feed as a `postgres_changes`
subscription on `public.notifications` filtered to `user_id=eq.{uid}` (INSERT) — RLS-enforced, so a
client can only ever receive its own rows, and no server broadcast plumbing is needed. The migration
also had to **create the `notif_channel` enum** (DATA-SCHEMA §6 referenced `notif_channel[]` but `0000`
never defined it) and both tables (`notifications`, `notification_prefs`) VERBATIM to the locked §6
shape — the PRD's Prisma sketch (`deepLink`/`emailedAt` columns, per-type preference rows) is **not**
followed; deep links live in `data->>'link'` and preferences are one jsonb row per (user, workspace).
Filed as **`0011_m04_notifications.sql`**: `0009`/`0010` were taken by M03/M05/M41 built in parallel;
M04 depends only on M00–M02 tables (≤0008), so apply-order among the parallel modules is irrelevant.

## D-030 · M04 digest fires at 8am **UTC by default** until M07 provides per-workspace timezone · **LOCKED 2026-07-04**
The digest must send at "8am workspace-local" (PRD_M04, DoD Gate 4), but the timezone column lives in
`workspace_settings`, which is an **M07** table (DATA-SCHEMA §6 "M07 Audit & Settings") not yet built.
M04 depends only on M00–M02, so it does **not** pull that table forward. Instead the `m04-digest-enqueue`
`pg_cron` job runs **hourly** with a timezone-aware query that reads `workspaces.branding->>'timezone'`
as an interim source and **defaults to `UTC`**; it enqueues one `notification.digest` job per workspace
whose local hour = 8 and which has ≥1 active member on a daily/weekly digest (idempotent via the
`jobs (workspace_id,type,idempotency_key)` unique index). When M07 lands `workspace_settings.timezone`,
the query switches its tz source to that column — a one-line change, no schema churn. The digest job's
**sender is stubbed** (email delivery blocked by D-011): the schedule enqueues jobs now; nothing mails.

---

## D-031 · M41 stores a Vault reference, not app-managed crypto · **LOCKED 2026-07-04**
PRD_M41 §3 models `Integration.credentialsEnc Bytes` — AES-256-GCM ciphertext in a Postgres column with
an env master key. That is **dropped** (INTEGRATIONS-SPEC §0/§1, Constitution secrets law): the secret
lives in **Supabase Vault**; the `integrations` row stores a **reference only** (`vault_secret_name`, the
§3 deterministic name `plat__<p>` / `ws_<uuid>__<p>`) plus non-secret config and health. No ciphertext,
no plaintext, no browser-reachable endpoint returns a credential. The single access path is
`resolveCredential()` in `_shared/integrations.ts`, service-role, Edge-Function-internal (Vault Law 4).

## D-032 · `integrations.workspace_id` is NULLABLE (platform default vs workspace override); gated by a new `is_platform_admin()` · **LOCKED 2026-07-04**
A documented exception to Law 2's "`workspace_id not null`": `null` = a **platform-level default**, a set
value = a **per-workspace override**. `resolveCredential()` resolves override → default → typed
`NotConnectedError` via `order by workspace_id nulls last limit 1` (two partial unique indexes guarantee
at most one of each per provider). Platform (`null`) rows are RLS-restricted to platform super-admins via
a new `public.is_platform_admin()` helper (reads the `app_metadata.platform_admin` JWT claim). No UI mints
that claim yet — **M44 Admin** builds that surface and reuses the helper; M41 is its first use.

## D-033 · `integrations` writes are service-role only; browser gets an admin+ RLS SELECT · **LOCKED 2026-07-04**
Connect/disconnect must write Vault and the row **atomically**, so they run only inside Edge Functions
under the service role. The table therefore ships an RLS **SELECT** policy only — admin+ for workspace
rows, platform-admin for platform rows ("Integrations & API keys = Owner/Admin", RLS-AND-SECURITY §2) —
and **no INSERT/UPDATE/DELETE policy** (all non-service writes denied, mirroring the `jobs` override).
This blocks a client from inserting an orphan reference to a non-existent Vault secret. The health worker
updates status via the service role (bypasses RLS). Cross-tenant + platform-null isolation proven in
`m41probe.mjs` (27/27).

## D-034 · Session-5 slice cut: api_key connect built; OAuth scaffolded; health fully async; refresh scaffolded · **LOCKED 2026-07-04**
The BUILD-SEQUENCE Session-5 accept-when is "integrations table + Vault write/read via Edge Fn + connection
health ping"; the full-module OAuth (Google+Meta) DoD is verified at each provider's own wiring session.
So this slice: (a) **api_key/basic connect** is built end-to-end (`integrations-connect` → Vault →
reference row); (b) the **generic OAuth2** `integrations-connect` (signed-state consent URL) +
`integrations-callback` (code→token→Vault) are **scaffolded** so adding a provider stays <30 lines, but
**live Google/Meta verification is deferred to M12/M14** (never a faked-green OAuth probe — Law 9);
(c) **health is the full async mechanism** — `integrations-test` (on-demand) + the `integration.health_check`
job type + worker handler + hourly `pg_cron` enqueue (per-provider ping map just-in-time, §8);
(d) `integration.refresh_token` handler is a documented **scaffold** (no oauth2 provider connected this
slice → nothing to refresh; no refresh cron scheduled). Platform-row health is deferred (`jobs.workspace_id`
is NOT NULL, so the hourly sweep filters `workspace_id is not null`; a system-jobs lane lands with M44).

## D-035 · M41 fine perms deferred; the UI gates on `settings.manage`, RLS admin+ is the wall · **LOCKED 2026-07-04**
Rather than re-seed the shipped `0008` built-in role arrays with new `integrations.*` permissions (a later
migration + registry change), M41's connections UI gates its manage actions on the existing coarse admin+
tier (RLS-AND-SECURITY §2); the RLS SELECT-admin+/service-role-write posture (D-033) is the real wall, so
the UI gate is cosmetic. Dedicated `integrations.*` fine grants can be added to the M02 registry later
without touching M41. Mirrors D-023's "RLS enforces coarse, don't rebuild the wall for zero security gain."

## D-036 · M05 extends `consent_kind` with `whatsapp_optin` / `voice_optin` · **LOCKED 2026-07-04**
DATA-SCHEMA §2's `consent_kind` canonical set is `{sms_optin,email_optin,cookie,gdpr_export,gdpr_erase}`,
but PRD_M05 records consent across **four** channels (SMS, email, WhatsApp, voice). Rather than overload
`source` or add a parallel `channel` column, `0010_m05_compliance.sql` appends `whatsapp_optin` /
`voice_optin` to the enum (append-only, `add value if not exists` — Postgres enums can't drop values, D-027).
Minimal extension; `consent.check(contact, channel)` maps channel→kind. Verified in `m05probe.mjs`.

## D-037 · Consent `evidence` jsonb holds the exact consent text + channel metadata · **LOCKED 2026-07-04**
PRD_M05's Prisma `ConsentRecord.consentText` + IP + form/keyword metadata are folded into the canonical
`consent_records.evidence jsonb` (DATA-SCHEMA §6) rather than adding dedicated columns — the exact wording
shown, phone, inbound message body and Twilio `MessageSid` all live in `evidence`, keeping the ledger row
lean while preserving legal proof. `ip_hash` stays a first-class column (already canonical).

## D-038 · `a2p_registrations` gains rejection/business/updated_at columns + `unique(workspace_id)` · **LOCKED 2026-07-04**
The canonical §6 table is status-only; the A2P **wizard** needs to show a rejection reason + fix checklist
and round-trip the business-info step, and a workspace has exactly one registration. So M05 adds
`rejection_reason`, `business_info jsonb`, `updated_at` (with the shared trigger) and a `unique(workspace_id)`
so the wizard **upserts** one row. Writes are admin+ (Owner/Admin configure A2P, RLS-AND-SECURITY §2).

## D-039 · `gdpr_requests` gains request_type / SLA / export columns · **LOCKED 2026-07-04**
Canonical §6 carries `kind` (the `gdpr_export|gdpr_erase` job discriminator) + status. M05's accept-criteria
(30-day SLA, ZIP export, the PRD's access|delete|rectify taxonomy) add `request_type`, `requested_email`
(public intake), `due_at` (SLA countdown, set to `now()+30d` at intake), `export_url` (the worker writes the
compiled bundle reference) and `notes`. Browser inserts are `staff+` and **pending-only** (mirrors jobs'
queued-only guard); admin+ advances/deletes. `gdpr.export`/`gdpr.erase` jobs do the work (Gate-4).

## D-040 · GDPR 30-day SLA reminder is a scheduled sweep; notification enqueue deferred to M04 wiring · **LOCKED 2026-07-04**
`0010_m05_compliance.sql` schedules a daily `gdpr-sla-reminder-sweep` `pg_cron` job (the hook exists now),
but its body only **counts** breaching requests — the actual reminder-notification enqueue is a documented
`TODO(M04)` inside the cron body. M04 Notifications shipped in Session 6; a follow-up wires the sweep to
enqueue `notification.send`. Honest-deferral pattern (worker.mjs `provisionWorkspace`, D-022): the hook is
real, the cross-module call lights up without a schema change. Wrapped in an exception block so the file
still loads where `pg_cron` is absent (the PGlite verification harness).

## D-041 · M05 compliance tables are staff+ read (client ceiling), not bare member read · **LOCKED 2026-07-04**
The standard §3 template selects on `is_member`, but the consent ledger, A2P registration and data-subject
requests are **operator** data — a portal **client** (an external customer of the agency) must not read the
agency's full compliance surface (DoD Gate-2 "Client cannot access compliance screens"). So all three M05
tables select on `has_role(ws,'staff')`. `consent_records` **insert** stays `is_member` (RLS-AND-SECURITY §79
"insert = any member" — portal self-service / service-role webhooks contribute consent) but the write is
read-back-invisible to a client. Proven server-side in `m05probe.mjs` (client select = 0 rows).

---

## D-042 · M09 corrects the `custom_fields.workspace_id` FK typo + adds `workspace_id` to CRM join tables · **LOCKED 2026-07-05**
DATA-SCHEMA §7 defines `custom_fields.workspace_id references public.custom_fields(id)` — a self-reference
typo; it must reference `workspaces(id)`. Migration `0013` ships it correctly. The two join tables
(`contact_tags`, `contact_custom_values`) also gain a `workspace_id not null` (canonical omitted it) so RLS
scopes them directly with `is_member`/`has_role` and Law 2 ("every tenant table has workspace_id") holds
without a parent-contact subquery. Proven in `m09probe.mjs` (cross-tenant leak on both join tables = 0).

## D-043 · Smart lists store a jsonb AND/OR grammar evaluated by `smart_list_eval()` · **LOCKED 2026-07-05**
Not in canonical §7. `smart_lists(definition jsonb)` holds `{match:"and|or", rules:[rule|group]}`; a
recursive `smart_list_eval(ws, def)` SECURITY DEFINER function is the DB source of truth (whitelisted
fields/ops, `quote_literal` values → injection-safe), mirrored in `frontend/js/smart-lists.js` for instant
UI preview counts. Fields: name/email/phone/source (text), lead_score (num), created_at (date), tag, custom.
Proven in `m09probe.mjs` (nested AND/OR + tag + custom + is_set).

## D-044 · CSV import is a `jobs` row (`contact.import`), never client-side row processing · **LOCKED 2026-07-05**
PRD's BullMQ is superseded (Law 5). The browser parses the CSV, the `contacts-import` Edge Function records a
`contact_imports` tracking row (status `pending`, RLS pending-only) + enqueues a `contact.import` job; the
worker does the chunked upsert-by-email + row-level error report. The wizard polls the `contact_imports` row.
Proven in `m09probe.mjs` (browser can seed only `pending`/`queued`; worker claims it).

## D-045 · Duplicate detection: `dedupe_scan()` + `contact.dedupe_scan` job + daily pg_cron · **LOCKED 2026-07-05**
`contact_duplicates` holds flagged pairs. `dedupe_scan(ws)` (SECURITY DEFINER, service/worker-callable) does
email-exact (score 1.0) + normalized-phone-exact (0.9) matching; a daily `crm-dedupe-scan-daily` pg_cron
enqueues one `contact.dedupe_scan` job per workspace. The pg_trgm GIN indexes ship now for fuzzy *search*;
fuzzy-**name** dedup via `similarity()` and E.164 phone canonicalization are logged follow-ups (needs the
enrichment pass). Proven in `m09probe.mjs` (email + phone pairs flagged, idempotent).

## D-046 · `merge_contacts()` is a manager+ SECURITY DEFINER RPC that retains consent · **LOCKED 2026-07-05**
Merge reassigns every FK child (`contact_tags`/`contact_custom_values` with ON CONFLICT so the primary's value
wins, `contact_notes`/`contact_tasks`/`activity_log`/`consent_records`) to the primary, soft-deletes the
duplicate, marks the `contact_duplicates` pair `merged`, and logs the merge via `log_activity`. manager+ only
(staff blocked). Consent records are retained as legal proof (never dropped). Proven in `m09probe.mjs`.

## D-047 · Lead-scoring RULES ENGINE + @mention→M04 notify deferred out of the M09 slice · **LOCKED 2026-07-05**
PRD_M09 includes a configurable scoring engine (`scoring_rules` + a recalc worker + `/settings/scoring`) and
@mention notifications on notes — neither is in the Session-8 accept-when. `contacts.lead_score` ships and
renders (Cold/Warm/Hot bands 0-30/31-60/61+); the engine + `/settings/scoring` and the mention `notify()`
emit are follow-ups (Law 9 one-slice-per-session; the notes/score columns + hooks already exist).

## D-048 · `activity_log` is append-only and is the platform timeline; `log_activity()` = `timeline.add()` · **LOCKED 2026-07-05**
The unified timeline is append-only (no update/delete policy; service role bypasses for GDPR erase), in the
`supabase_realtime` publication so contact detail live-updates. `log_activity(ws,contact,type,desc,meta)` is
the SECURITY DEFINER emit RPC every future module calls (the PRD's `lib/timeline.ts` `add()` on this stack).
Proven in `m09probe.mjs` (append-only; is_member guard blocks cross-tenant emit).

## D-049 · M11 uses the registered `pipeline.view`/`pipeline.manage`; `deal_status` enum lands in `0014` · **LOCKED 2026-07-05**
PRD_M11's prompt says "pipeline.view/create/edit/delete", but the M02 registry (`0008` / `_shared/permissions.ts`)
already defines only `pipeline.view` + `pipeline.manage` — that predates the PRD wording and is the source of
truth. So M11 splits by *coarse RLS tier*: pipeline / stage / target **config** = `manager+` (the fine
`pipeline.manage`), day-to-day **deal** work = the standard template (`is_member` read · `staff+` ins/upd ·
`manager+` del). Matches ROLE_MATRIX (staff = `pipeline.view` only) with no registry change. Also: the
`deal_status` enum is specced in DATA-SCHEMA §8 but was never landed in `0000`'s registry — `0014` creates it
(idempotent, `0000`'s `do $$…duplicate_object` idiom); migrations are append-only. Client-visibility narrowing
of deals (portal `sel_client`) follows the M09 `is_member` precedent and is deferred platform-wide to M37.
Proven in `m11probe.mjs` (staff can't config, can't delete; manager can; client write ceiling).

## D-050 · The stage-change "event bus" is `move_deal_stage()`/`bulk_move_stage()` writing `activity_log` · **LOCKED 2026-07-05**
PRD's "stage change → M13 trigger bus → timeline.add() → audit()" becomes a SECURITY DEFINER RPC that
atomically updates the deal's `stage_id`/`stage_entered_at` **and** calls `log_activity()` (D-048) with a
`deal_change` row carrying `{deal_id, old_stage_id, new_stage_id, contact_id, workspace_id}` — that durable
timeline row **is** the event M13 will consume. M13 Automations isn't built (Law 9), so its live trigger-bus
subscription is a documented scaffold, never faked. The Kanban drag + list bulk-move + drawer stage-select all
route through these RPCs (staff+), so "every stage move writes the timeline" holds regardless of path; a
cross-pipeline move is rejected. Proven in `m11probe.mjs` (exactly one activity per real move; same-stage
no-op; bulk logs each; is_member/has_role guards).

## D-051 · `deals.stage_entered_at` + trigger-written `deal_value_history` + a lost-reason CHECK · **LOCKED 2026-07-05**
Three extensions to §8's `deals`: (1) `stage_entered_at` (not in §8) feeds the days-in-stage card badge
(gray <3d / yellow 3–7d / red >7d), set by the move RPCs. (2) `deal_value_history` (PRD DealValueHistory) is
written by a SECURITY DEFINER `after update of value` trigger so history can't be forgotten by any write path;
it's append-only (member read, no client I/U/D). (3) a table CHECK (`status <> 'lost' or lost_reason present`)
makes "lost requires a reason" a hard invariant, backing the `close_deal()` RPC guard. Proven in `m11probe.mjs`
(history appended on change only + append-only + actor recorded; lost-without-reason rejected at RPC and CHECK).

## D-052 · M11 fulfils the deferred default-pipeline seed (D-020) + M06 picker / GDPR-deals folds · **LOCKED 2026-07-05**
The default pipeline + 5 stages deferred from M01 provisioning (D-020) are now seeded by the
`workspace.provision` worker handler (idempotent — only when the workspace has none), completing that honest
deferral. `deal_files.asset_id` is a bare uuid (no FK) — the M06 Media Library / AssetPicker isn't built, so
the Files tab is a scaffolded state that links an asset id today. And the GDPR `gdpr.export`/`gdpr.erase`
worker handlers — which already listed "deferred → deals (M11)" — now fold the subject's `deals` into the
export bundle and detach them on erase (keeping the deal for revenue records per "keep financial records").
There is **no async work in M11 itself** (no new job type, no cron): Gate-4 is n/a for the module.

---

## D-053 · M12 conversations gains status CHECK + unread_count + last_channel + ai_mode · **LOCKED 2026-07-05**
Canonical §8 `conversations.status` is bare `text`; M12 adds a CHECK for the PRD's four statuses
(`open`/`pending`/`resolved`/`spam` = Open/In Progress/Resolved/Spam). `unread_count` (maintained by the
message trigger), `last_channel` (the reply channel defaults to the last-inbound one) and `ai_mode` (the
per-conversation AI toggle — the M33 engine is deferred, so the switch is a labelled scaffold, disabled in the
UI) are added. Proven in `m12probe.mjs` (unread increments on inbound, resets via `clear_unread`).

## D-054 · M12 messages gains status + ai_generated + external_id + mentions + a generated search_tsv · **LOCKED 2026-07-05**
PRD_M12 §3's `Message.status` (queued|sent|delivered|failed, CHECK-guarded — provider callbacks),
`Message.aiGenerated`, and the tsvector search index land as columns. `external_id` holds the provider
MessageSid — it powers both delivery callbacks and **webhook idempotency** (a redelivered inbound with the
same id is a no-op). `mentions uuid[]` carries note @mention targets. `search_tsv` is a `generated always …
stored` tsvector + GIN (Postgres full-text, PRD §2/§4). Proven in `m12probe.mjs` (search + idempotency).

## D-055 · The browser may insert internal NOTES only; all channel traffic is a service-role write · **LOCKED 2026-07-05**
`messages` INSERT policy is `has_role(ws,'staff') AND is_internal_note = true`. A client can post a note but
can **never** insert a channel message — inbound arrives through the signature-verified webhook →
`ingest_inbound_message` (service role), and outbound goes through the `inbox-send` Edge Function (service
role) which enforces the A2P + consent + meter gates. This makes the send-gate contract un-bypassable and
stops a client forging inbound history. Proven in `m12probe.mjs` (staff channel-message insert = denied).

## D-056 · M12 channels are admin+ write (integrations posture) · **LOCKED 2026-07-05**
Connecting a channel is an integration action, so `channels` insert/update/delete = `has_role(ws,'admin')`
(RLS-AND-SECURITY §2 "Integrations = Owner/Admin"), mirroring M41 D-033. The table stores non-secret config
(number/email/page id) only; the Twilio/Gmail credential lives in Vault (Law 3). Read = any member.

## D-057 · M12 uses the coarse RLS tiers, not new `inbox.*` fine grants · **LOCKED 2026-07-05**
Same call as M11 D-049 / M41 D-035: staff+ reply/note/assign, manager+ delete + manage canned, admin+
channels — enforced by RLS, no new `memberships.permissions` registry entries this session. Dedicated
`inbox.*` grants can be added to the M02 registry later without touching M12. RLS is the wall.

## D-058 · M12 creates the `conv_channel` + `msg_direction` enums (deferred from 0000) · **LOCKED 2026-07-05**
DATA-SCHEMA §1 lists both enums as canonical, but `0000` only shipped the enums the early sessions used; M12
is their first consumer, so `0015` defines them (idempotent DO-block, values verbatim from §1) — the same
append-as-needed posture as D-027. Any later channel module (M32/M33/M34) reuses them.

## D-059 · M12 email + WhatsApp/FB/IG + webchat defer; SMS is the only live channel this session · **LOCKED 2026-07-05**
The S10 accept-when is SMS-only. **Email** send/receive is blocked by OPEN **D-011** (provider) exactly like
M04 — the `conv_channel` schema is channel-agnostic and an email thread renders read-only, but nothing sends.
**WhatsApp/FB/IG** defer to their Meta provider week (connect tiles disabled). The **webchat widget** and
**AI auto-reply** (needs M33) are out of the accept-when — both are honest scaffolds (labelled, disabled),
never faked. `inbox-send` returns `channel_unavailable` for any non-SMS send. Carried on TASKS.md.

## D-060 · M13 canvas is Drawflow (vanilla), NOT React Flow · **LOCKED 2026-07-05**
PRD_M13 names React Flow, but the locked stack forbids React (Gate-8 greps `reactflow` as dead-stack) and the
BUILD-SEQUENCE accept-when mandates a **Drawflow** canvas. Drawflow (MIT, ~46 KB) is vendored into
`frontend/vendor/drawflow.min.{js,css}` — no CDN, no build step, exactly like `sortable.min.js`/`supabase-js`.
The canvas serialises to a normalised `{nodes:[{id,type,config}],edges:[{source,target,sourceHandle}]}` stored
in `workflows.nodes/edges` — portable and library-agnostic (the walker never imports Drawflow). One in-file token
tweak to the vendored CSS: `font-family:monospace` on the unused `.drawflow-delete` glyph → `var(--font-mono)`
so Gate-8's 3-font grep stays clean.

## D-061 · Execution = the `jobs` queue + a node-walker; WAIT = delayed re-queue · **LOCKED 2026-07-05**
PRD_M13's BullMQ is dead-stack. Executions run as `automation.execute` `jobs` rows; `workers/automation.mjs`
walks the version-pinned graph via a typed handler map, logging one `workflow_execution_steps` row per node. A
**WAIT** node sets the execution `waiting`, pins the resume node, and re-enqueues `automation.execute` with
`run_after = now + delay` — `jobs.run_after` IS the delay mechanism (accuracy rides on it, AC ±1 min). Retries use
the existing jobs backoff; idempotent per `(execution_id, node_id)`. The engine lives in its own module (injectable
`db`) so it runs against the service-role client in `worker.mjs` AND a PGlite adapter in `m13walkprobe.mjs`.

## D-062 · Trigger bus = the `emit_trigger()` SECURITY DEFINER function · **LOCKED 2026-07-05**
PRD_M13's `triggers.emit()` library becomes a Postgres function `emit_trigger(ws,type,payload)` — the shape of M04
`notify()` / M03 `meter_increment()`. Modules call it directly in SQL; the `automations-trigger` Edge Fn mirrors it
for HTTP. It matches active workflows on `(ws,trigger_type)` + `trigger_config` narrowing, applies the re-entry rule
(`allow`/`once`/`once_per_days:N`) + a per-contact concurrency guard, and enrols an execution + enqueues the job.
Wired to the tables that exist today via AFTER triggers on `contacts` (created), `contact_tags` (added), `deals`
(stage_changed — loop-guarded so the walker's own move via `automation_apply_move_deal` never re-emits), and
`messages` (inbound). Deferred sources (forms M15, appointments M14, payments M28) live in the registry as honest
stubs. A `_depth` backstop caps runaway cascades.

## D-063 · M13 AI builder is a scaffold; LLM provider deferred · **LOCKED 2026-07-05**
"Describe your automation" ships (UI + `automations-ai-generate` Edge Fn), but no LLM provider is chosen yet — the
same open-decision posture as email (D-011). The endpoint returns a deterministic keyword-derived starter graph the
operator reviews (never auto-activated, PRD §2) and meters **nothing** (Gate-3: no provider call bills nothing). When
a provider is decided, only the function body changes: read the key from Vault, call the model with the node-schema
system prompt, validate, and `meter_increment(ai_tokens)` in the success transaction. Flag on TASKS.md, don't resolve.

---

## D-070 · M28 invoices = one table, both `kind`s, server-computed totals · **LOCKED 2026-07-05**
`invoices` carries both invoices and estimates (`kind`); one builder, one lifecycle table. Beyond canonical §9 it gains
`amount_paid`, `discount jsonb` + `tax_rate` (the totals INPUTS), `notes`, `public_token` (the no-auth pay page key),
`sent_at`, `stripe_checkout_id`, `source_type`/`source_id`. `subtotal`/`discount_total`/`tax`/`total` are **recomputed by
a BEFORE-write trigger** from `calc_invoice_totals(line_items, discount, tax_rate)` — the client CANNOT forge them (probe:
a forged subtotal is overwritten). The DB function is the source of truth; the UI's JS mirror is preview-only.

## D-071 · The payment ledger is append-only + service-role write only · **LOCKED 2026-07-05**
`invoice_payments` (PRD InvoicePayment) has a SELECT policy for members but **no INSERT/UPDATE/DELETE policy** — money
moves ONLY through the definer `record_invoice_payment` RPC (called by the webhook, and by any future manual "mark as
paid" Edge Fn). `amount_paid` on `invoices` therefore can never be moved from the browser. `record_invoice_payment` is
idempotent on the Stripe payment-intent id (a redelivered webhook never double-credits — probe-proven).

## D-072 · Money is integer minor units; tax_rate is a numeric percent · **LOCKED 2026-07-05**
All amounts are integer minor units end-to-end (matches M03) — never floats. `tax_rate` is a `numeric` percent (e.g. 8.5);
`calc_invoice_totals` applies discount to subtotal, tax to (subtotal − discount), and rounds each to minor units so the UI
preview and the server agree to the cent.

## D-073 · Payments matrix: staff+ create/edit, manager+ delete AND void · **LOCKED 2026-07-05**
Money is sensitive, so voiding (not just deleting) is manager+ — the void guard lives in the invoices trigger (raises for a
staff caller), RLS covers hard delete. tax_rates + `invoice_counters.prefix` are manager+ (settings posture). Coarse RLS
tiers, no new `payments.*` fine grants this session (same call as M11 D-049 / M12 D-057).

## D-074 · Overdue is a daily pg_cron sweep; reminders/late-fees defer · **LOCKED 2026-07-05**
`m28-overdue-sweep` (daily) flips `sent`/`viewed`/`partial` → `overdue` past `due_date` via `sweep_overdue_invoices()` — the
revenue rollups need the overdue state, so the flip ships. The configurable reminder SCHEDULE (3d-before / on-due / +3d /
+7d) + late fees are a scaffold (a future reminder job). SQL lives in a function so worker/cron and the probe run identically.

## D-075 · Client charges run on the workspace's connected Stripe account · **LOCKED 2026-07-05**
Standard Connect (via M41): `payments-checkout` / `public-invoice` pass a `Stripe-Account` header when the workspace's
`integrations` row (provider='stripe') carries a `config.account_id`, so funds never touch the platform; `application_fee_amount`
is parameterized and **default 0** (the M42 hook, present-but-zero per the accept criteria). Full Connect ONBOARDING (the
OAuth/redirect to create the account) is scaffolded — absent an account, checkout falls back to the platform account.

## D-076 · Invoice "send": link live, SMS via M12, email deferred (D-011) · **LOCKED 2026-07-05**
`invoice-send` authorizes + marks sent, then: **link** returns the public pay URL (always); **SMS** (Text-to-Pay) returns
`sms_ready` so the browser dispatches through M12 `inbox-send` — which already gates on A2P + `consent.check` (M05) and
METERS the sms there, so M28 adds no new metered action (Gate-3) and consent stays enforced; **email** is DEFERRED behind
OPEN D-011 (marked sent, nothing delivered, UI shows a "pending" banner — same posture as M04/M12). No fake green.

## D-077 · Webhook idempotency reuses stripe_events; dunning/PDF/plans/QR defer · **LOCKED 2026-07-05**
`payments-webhook` verifies the signature, dedupes on `event.id` via **M03's `stripe_events`** table (no new dedupe store),
then acts. Dunning fires `payment.failed` → M13 `emit_trigger` **best-effort** (tolerated absent — M13 is a parallel/unclosed
module, wrapped in an exception guard, same for the `payment.received` emit). Deferred scaffolds (flagged, never faked):
standalone payment_links table + QR, payment plans/installments, Text-to-Pay full flow, PDF (needs M06), multi-currency FX.
> **Numbering note:** M28 claimed **D-070…D-077**, skipping D-064…D-069 which a PARALLEL M14 session is expected to claim
> (M13 already took D-060…D-063). Reconcile on merge if M14 landed elsewhere.

## D-064 · M14 slot engine: SQL-authoritative, UTC internal / tz rendered, DST-correct · **LOCKED 2026-07-04**
`compute_slots(calendar, date, tz)` (0017, SECURITY DEFINER) is the single authority for every DB-visible constraint —
weekly availability, date blocks, existing appointments, buffer, min-notice, max/day, and group/class capacity — expanding
each date's windows **in the target tz** then converting to UTC (so DST is correct by construction). The ONE thing SQL can't
see, the calendar owner's Google busy times, is subtracted in the `public-booking` Edge Fn (the token lives in Vault). Storage
is UTC; the browser renders the visitor's local time. Round-robin picks the least-upcoming-load member (`pick_round_robin_user`).

## D-065 · Booking side-effects via an AFTER INSERT trigger (M13-consistent) · **LOCKED 2026-07-04**
A trigger on `appointments` does the CRM wiring — auto-tag "Appointment Booked", `activity_log` timeline (direct insert; a
public booking has no `auth.uid()`), reminder rows, and `emit_trigger('appointment.booked')`. So a NO-AUTH public booking and a
staff-created appointment behave identically, and nothing double-emits. `book_appointment()` is a thin insert wrapper returning
the id + self-service tokens for the Edge Fn. Cancel/no_show/reschedule fire their bus events from the lifecycle RPCs.

## D-066 · Reminders: rows on booking, cron enqueues jobs; SMS live / email deferred · **LOCKED 2026-07-04**
Booking inserts `appointment_reminders` rows (24h + 1h, future only). The registered `0 * * * *` cron runs
`enqueue_due_reminders()` → one idempotent `appointment.remind` job per due unsent reminder (cron never sends). The
`appointment-remind` Edge Fn sends **SMS live** through M12's Twilio contract (consent + `meter('sms')` in the success txn —
Gate 3); **email is stubbed until D-011** (composed, not sent — like M04/M12). Cancel drops pending rows; reschedule re-derives.

## D-067 · Self-service tokens single-purpose + expiring; paid bookings scaffolded off · **LOCKED 2026-07-04**
Reschedule/cancel use unguessable `reschedule_token`/`cancel_token` that expire (`token_expires_at`) and **rotate on use**
(one link, one action). Paid bookings depend on M28 (Session 13, not built): the `appointments.payment_intent_id` column and a
per-calendar `requires_payment` flag ship now, the UI toggle is **disabled ("Available after M28")**, and `public-booking`
defensively 409s a paid calendar. No mock in the live path (mirrors M12's email-schema-now/provider-later posture).

## D-068 · Google Calendar via dedicated M14 functions; token bundle in Vault; ready-not-run · **LOCKED 2026-07-04**
Google is the first OAuth provider wired live ("live Google at M14"). Calendar needs freebusy + event sync beyond the generic
M41 connect, so it gets a dedicated `google-calendar-sync` (connect + status, admin+) and `google-calendar-callback` (verify_jwt
false; signed-state, like integrations-callback) — leaving the shared M41 functions untouched. Scopes `calendar.events` +
`calendar.readonly`; the token bundle is ONE JSON secret under the §3 base name (`_shared/google.ts` reads/refreshes it — the
near-expiry refresh the M41 helper left scaffolded becomes concrete here). No Google client/toolchain locally → **ready, not run**.

## D-069 · M14 enforces coarse RLS tiers; no new calendar.* grants; custom team calendar · **LOCKED 2026-07-04**
Like M12 (D-057), M14 uses the coarse 5-tier matrix, adding NO fine `calendar.*` grants to the permission registry: SELECT =
staff+ (internal-ops ceiling), config (calendars/availability/blocks/questions) = manager+ write, appointments = staff+ write /
manager+ delete, `appointment_reminders` = system-written only. The per-client portal-narrowed policy lands with **M37** (as
M12's `sel_client`). The team week/month calendar is rendered with a **custom CSS grid** (no FullCalendar dependency — matches
the bespoke design language; the repo vendors libs only where irreplaceable).

---

## D-078 · M44 cross-tenant admin via gated definer RPCs · **LOCKED**
The platform-admin console reads/writes across tenants only through `is_platform_admin()`-gated
`SECURITY DEFINER` RPCs (the gate is line 1 of each) — RLS scopes normal reads to membership, so the
browser never touches raw cross-tenant tables. `is_platform_admin()` (0010, M41) is the wall; M44
formalizes the claim surface. *(2026-07-04, Session 14 — migration `0019`.)*

## D-079 · M44 owns an append-only `admin_audit_log` · **LOCKED**
M44 ships its own platform-scoped, append-only `admin_audit_log` (no update/delete policy; definer/
service-role insert only). Distinct from M00 `auth_events` (identity-scoped, D-017) and the future
M07 general `audit_log`, which may later generalize it. Built now because M44 precedes M07 in the
build sequence, and the accept-when requires audited impersonation.

## D-080 · M44 impersonation shape · **LOCKED**
Impersonation = an `impersonation_sessions` row + dual-identity `admin_audit_log` entries + a 30-min
`pg_cron` expiry sweep (`m44-impersonation-expiry-sweep`) + a UI banner. The live GoTrue admin
session-mint and the minting of the `app_metadata.platform_admin` claim onto an operator account are
CARRIED (no hosted project / Deno here); the row, 30-min expiry, audit, and banner are real and
probe-tested — never faked green.

## D-081 · "Infra monitor" reconciled to the locked stack · **LOCKED**
PRD_M44's BullMQ / Bull Board / Redis / Sentry infra monitor is superseded: on the vanilla + Supabase
stack the infra surface is the `public.jobs` monitor (cross-tenant list + retry/discard via gated
RPCs) + `pg_cron` health + the M41 integration-health rollup. No dead-stack dependencies (Gate-8 Law 1).

## D-082 · M44 feature flags · **LOCKED**
`feature_flags` (global registry; SELECT = authenticated so the app can evaluate gates, writes =
platform-admin) + `feature_flag_overrides` (per-workspace) + `admin_flag_enabled(key, ws)` definer
resolver (override → default → false). Kill-switch = flip a flag's `default_on` to false; per-agency
rollout = an override row.

## D-083 · M44 slice scope + suspend · **LOCKED**
`ws_status` gains `'suspended'` (audited flip via `admin_suspend_workspace`; a `workspace_suspended()`
helper ships so future write-policies can adopt `and not workspace_suspended(...)`). Full suspension
read-only enforcement, plan/pricing editor, credits/trial, margin/MeterCost, marketplace,
announcements, and support tooling are deferred to later phases — the Session-14 accept-when slice is
super-admin gate + directory + `public.jobs` monitor + feature flags + audited impersonation.

## D-084 · M08 dashboard slice scope + KPI feature-flagging · **LOCKED**
Session-15 ships M08 as a **read-only** slice to the BUILD-SEQUENCE row-15 accept-when: KPI strip
(Chart.js) + needs-panel + activity feed + quick-actions + a **fixed** widget grid (pipeline snapshot,
tasks due, upcoming appointments, usage meters, contacts trend). No new tables, no migration, no Edge
Function, no metered action — it aggregates existing tenant tables under RLS, every query scoped by
`workspace_id`. KPI cards **feature-flag by table presence**: each load is guarded, and a table that
is missing/denied (e.g. `blog_articles`/`keyword_rankings`/`social_posts` from the unbuilt M21–23)
hides only its own card rather than fabricating a number. **Deferred:** the customizable drag-reorder /
show-hide widgets with a per-user `dashboard_layouts` table (Phase-1 slice keeps a fixed layout), the
latest-form-submissions widget (needs M15), and the **AI Copilot** (⌘K overlay / function-calling /
daily briefing → Phase 8 / Session 47, per BUILD-SEQUENCE row 47).

## D-085 · Chart.js vendored (M08/M40 charting) · **LOCKED**
The dashboard chart library is **Chart.js v4.4.4**, vendored to `frontend/vendor/chart.min.js` (UMD
global `window.Chart`) and loaded with a plain `<script>` — no CDN, no build step (Law 3 / D-005).
Implements D-CONSOLE / D-043's "Chart.js over Recharts" for the vanilla stack. KPI sparklines and the
trend chart read their colours from `tokens.css` at runtime (`getComputedStyle`) and re-theme on toggle,
so no chart colour is hard-coded. If the lib is absent the charts degrade to not mounting — the rest of
the dashboard is unaffected. M40 (Analytics) reuses this vendored file.

---

## D-086 · D-011 RESOLVED → SendGrid · **LOCKED 2026-07-05**
The OPEN D-011 (Resend vs SendGrid) is resolved to **SendGrid** (M16, Session 17 — BUILD-SEQUENCE row 17
is the only session explicitly gated on D-011). Rationale: (1) PRD_M16 §4 names the webhook
`/api/webhooks/sendgrid` and its prompt says "SendGrid/Resend"; (2) SMS already runs on **Twilio** (M12) and
SendGrid is a Twilio company — one vendor, one bill; (3) SendGrid's deliverability tooling (IP warmup,
suppression groups mapping 1:1 to our `suppressions` table, rich signed event webhooks) fits a broadcast/drip
module at scale. First email provider wired platform-wide → unblocks the deferred M04 digest/security-notice
emails, M01 invite email, M12 email channel, M14 email reminders, M28 invoice email as follow-ups (each on
TASKS.md). Adapter runs REST + Web Crypto with the key in Vault (the D-028 pattern, `_shared/email.ts`);
**ready-not-run** (no Deno/creds here). D-011's OPEN entry is superseded below.

## D-087 · M16's seven PRD-only tables ship as logged extensions; MJML deferred · **LOCKED 2026-07-05**
Canonical DATA-SCHEMA §9 defines only `email_campaigns` + `campaign_stats`. The seven PRD entities M16 needs
(`sequences`, `sequence_steps`, `sequence_enrollments`, `suppressions`, `send_events`, `email_templates`,
`sender_identities`) ship in `0024_m16_campaigns.sql` as logged extensions (the pattern every module used to
extend canonical). The **MJML library is deferred** — `compileEmail()` (`_shared/email.ts`) compiles the
builder's block-JSON → responsive inline-CSS table HTML directly (the PRD prompt specifies a compile *step*,
not the lib).

## D-088 · M16 metering reuses the existing `email`/`sms` meter_kind values · **LOCKED 2026-07-05**
`meter_kind` already carries `email` and `sms` (M12 already meters `sms`). The PRD's prose `email.sent`/
`sms.sent` are labels for those meters, not new enum values — reusing them keeps one meter per channel across
all modules (USAGE-METERING §9). No enum churn. Every email send → `meter_increment('email',1)`, every SMS →
`meter_increment('sms',1)`, in the provider-success transaction; `meter_check` gates pre-send.

## D-089 · `send_events` + `suppressions` + `campaign_stats` are service-role-written · **LOCKED 2026-07-05**
Delivery history, the suppression block-list, and the rolled-up stats are provider/worker truth. All three ship
a member SELECT policy and **no client INSERT/UPDATE/DELETE** (writes only via the worker + the signature-
verified SendGrid webhook under the service role) — mirrors M28's `invoice_payments` ledger (D-071). A client
can neither forge open/click history nor suppress an arbitrary address. `campaign_stats` is maintained by the
`roll_send_event()` AFTER-INSERT trigger so it can't drift from the event ledger. Proven in `m16probe.mjs`.

## D-090 · Unsubscribe dual-writes `suppressions` + an M05 consent opt-out · **LOCKED 2026-07-05**
`unsubscribe_email(ws,email,contact)` writes **both** a `suppressions` row (the fast per-send block-list lookup)
**and** a `consent_records` opt-out (`email_optin`, granted=false — the M05 legal ledger), so a later
`consent.check` and a later suppression check give the same answer. The public `email-unsubscribe` endpoint
(no JWT — the per-recipient token is the authorization) + `List-Unsubscribe-Post` one-click both route through
it. Proven in `m16probe.mjs` (both rows written; idempotent on the block list).

## D-091 · M16 domain-auth verify + spam-score API are ready-not-run hooks · **LOCKED 2026-07-05**
The domain-authentication wizard shows the SPF/DKIM/CNAME records; the live SendGrid domain-verify API call is
built to contract but **ready-not-run** (no creds). The pre-send **spam score** is a heuristic now
(`spamScore()` in `campaigns/index.ts`); a real SpamAssassin/provider API is a documented ready-not-run hook
(another undecided external provider). Both flagged on TASKS.md, never faked.

## D-092 · M16 AI copywriter is a scaffold; LLM provider undecided · **LOCKED 2026-07-05**
`campaigns-ai-write` ships (UI + Edge Fn) but returns a deterministic keyword-derived draft and **meters
nothing** (no provider call bills nothing) — the same posture as M13's AI builder (D-063). A *separate* open
call from D-011: when an LLM provider is decided, only the function body changes (read the key from Vault, call
the model, `meter_increment('ai_tokens')` in the success txn). Flag on TASKS.md, don't resolve here.

## D-093 · M16 SMS campaign steps run on the M12 Twilio contract · **LOCKED 2026-07-05**
Drip `sms` steps and SMS broadcasts send through M12's existing `inbox-send` path (A2P `sms.canSend` + `consent.check`
+ `meter('sms')`), so consent + A2P + metering are enforced identically to the inbox — no double-meter (this is
the campaign send, distinct from an inbox reply). Ready-not-run (no Twilio creds here), like M14 reminders.

## D-094 · M16 send pipeline = `campaign.send` fan-out + `run_after` drips · **LOCKED 2026-07-05**
Broadcasts run as the pre-registered `campaign.send` fan-out job (JOBS-AND-WORKERS §6): resolve audience minus
suppressions minus opt-outs → `meter_check` gate → one queued `send_events` row per recipient → throttled
`email.deliver`/`sms.deliver` batch jobs (`run_after` staggered by `throttle_per_min`). A/B = two sample slices
+ a `campaign.ab_winner` job at +4h. Drips schedule each next step as a `run_after`-delayed `sequence.step` job
(the D-061 WAIT pattern) + an hourly `m16-sequence-tick` reconciliation cron; scheduled broadcasts fire via the
minutely `m16-broadcast-dispatch` cron. Browser inserts `queued` only (Gate-4). Enqueue paths proven in `m16probe.mjs`.

> **Numbering note:** M16 claimed **D-086…D-094** (a parallel M08 session took D-084/D-085). If another
> parallel session also claimed any of D-086…D-094, renumber on merge (house custom).

---

## D-100 · M19 public renderer = a Supabase Edge Function, not Node SSR / static export · **LOCKED 2026-07-04**
The PRD's "SSR public renderer" has no home on the vanilla + Supabase stack (no Node server). M19 ships
`site-render` (Edge Function, `verify_jwt=false`, service-role): resolve host → site (active custom domain
or staging `subdomain`) → the `status='published'` page → a full HTML document (per-page SEO meta merged over
site defaults + JSON-LD schema + brand CSS vars + `render_css`/`render_html` + M05 cookie banner + tracking
pixel + embed-hydration). It also serves `/sitemap.xml` + `/robots.txt` per site by path. Static publish to a
CDN is deferred behind OPEN **D-009** (hosting) — this works today; a static path can be added later with no
schema change. Draft pages are never returned (probe-proven).

## D-101 · `page_json` = GrapeJS project data + snapshotted render; renderer never runs GrapeJS · **LOCKED 2026-07-04**
`pages.page_json` stores GrapeJS `getProjectData()` — the editable source of truth (canonical DATA-SCHEMA §12
"GrapeJS writes page_json"). On save/publish we ALSO snapshot `render_html`/`render_css` (`getHtml()`/`getCss()`),
which the public renderer serves — so no headless GrapeJS runs on the Edge. `publish_page()` keeps the two in
lockstep by snapshotting both into `page_versions`. Rejected: reimplementing GrapeJS's component→HTML pass in
Deno (fragile, duplicative). The AI generator + editor Preview reuse the same pure `page-builder.mjs` /
`site-render.mjs` modules the Edge Functions import (one source of truth; dynamic-imported in the browser).

## D-102 · Platform embeds export as `data-*` placeholders hydrated at view time · **LOCKED 2026-07-04**
`FormEmbed` / `CalendarEmbed` / `ChatWidget` are GrapeJS components that export `<div data-embed="…" data-…>`
placeholders. A tiny published-page script (in `site-render.mjs`) mounts them at view time: **CalendarEmbed →
the real, built M14** (`book.html?embed=1&slug=`); **FormEmbed → the planned M15** public-form-by-id (graceful
degrade to a labeled notice until M15 ships); **ChatWidget → M12 web-chat** (scaffold — M12's web-chat is itself
deferred, D-059). Baking a live widget into the snapshot would couple the immutable publish to sibling modules'
current state. M15 Forms + M06 Media are NOT built yet (Sessions 16/20); their embeds/pickers are honest,
labeled scaffolds (Law 9 · D-052/D-077 precedent). No mock in the live path.

## D-103 · `builder-ai-generate` is a deterministic niche-template engine; meters nothing · **LOCKED 2026-07-04**
No LLM provider is decided (OPEN, same posture as D-063 M13-AI / D-011 email). The AI-generate flow ships full
(Describe / Clone-URL scaffold / Voice via browser SpeechRecognition), but `builder-ai-generate` composes a
VALID `page_json` from niche section templates with real seed copy — Zod-equivalent `validateSections()` + one
`repairSections()` pass — meeting the "≥95% deserializable" AC deterministically (100%). It METERS NOTHING (no
provider call = no bill, Gate-3). When a provider lands, only the `describe` branch body changes: read the key
from Vault, call the model with the section-schema system prompt, validate/repair as now, and
`meter_increment('ai_tokens')` in the success txn. Clone-URL + voice are labeled scaffolds.

## D-104 · Custom domains in a separate `site_domains` table; live SSL is a "ready, not run" scaffold · **LOCKED 2026-07-04**
Canonical §12 sketches `sites(domain, ssl_status)` inline (one domain); the PRD wants multi-domain +
verification + staging. `site_domains` (site_id, domain, status, ssl_status, verification_token, is_primary)
carries them; `sites.subdomain` is the always-on staging URL. `domain-verify` (admin+) checks DNS for the TXT
token (`Deno.resolveDns`) and flips `status='active'`. **Live SSL provisioning (Caddy/Cloudflare on-demand TLS)
is a labeled scaffold pending OPEN D-009**: `ssl_status` is set to `pending` with a note, a `site.ssl_provision`
job type is registered (JOBS §6), and nothing provisions. Never faked green.

## D-105 · M19 uses coarse RLS tiers; no new `sites.*` fine grants; published pages not anon-readable · **LOCKED 2026-07-04**
Same call as M11 D-049 / M12 D-057 / M14 D-069: site + page read/edit = staff+, **publish + delete = manager+**,
domains = admin+ (integration posture, D-056), client CEILING (sites are operator surfaces; per-client portal
narrowing lands with M37). RLS is the wall; `sites.*` fine grants can be added to the M02 registry later without
touching M19. `page_versions` + `visitor_sessions` are **system-written** (definer RPCs / the service-role track
fn own the writes — browser cannot forge them). **Published pages are NOT anon-readable on the `pages` table** —
the renderer reads service-role and filters `status='published'` (a draft slug is a 404). Proven in `m19probe.mjs`.

## D-106 · M19 owns the M05 cookie-banner injection + the first-party tracking pixel · **LOCKED 2026-07-04**
M05 deferred per-site cookie-banner persistence + the injected script to M19 (TASKS S7 carry-over); M19 injects
it in the rendered page. The first-party pixel (`site-track`, service-role, `verify_jwt=false`) upserts a
`visitor_sessions` row per `(site_id, visitor_id)`, appends the page view, and — for an IDENTIFIED contact
(a `contact_id`, e.g. from a form-submit linkage or `?ce=` param) — calls `record_page_visit()` which writes the
M09 timeline (direct `activity_log` insert, no `auth.uid()` in the service context — the M14 D-065 pattern) and
fires the M13 bus `emit_trigger('page.visited')`. `page.visited` is a real registered trigger source. The browser
never writes `visitor_sessions`. Proven in `m19probe.mjs`.

> **Numbering note:** M19 claimed **D-100…D-106** — chosen ABOVE the live parallel contention (M08 took D-084/D-085,
> M15/M16 D-085…D-092, M06/M20 D-084…D-098 at time of writing) to avoid a same-number collision. Migration is
> **`0022_m19_sites.sql`** (0020 taken by parallel M15/M16, 0021 by M06/M20 — M19 has no ordering dep on them).
> If a parallel session also claimed any of D-100…D-106 or 0022, renumber on merge (house custom).

---

## OPEN — human calls (do not resolve in a build session)

## D-009 · Hosting · **OPEN**
Cloudflare Pages + Access vs GitHub Pages for the static front end. Same call as D-CONSOLE-001 —
decide once for both dashboard products. Blocks: production deploy, not local build.

## D-010 · Heavy-job worker runtime · **RESOLVED → GitHub Actions (see D-189, 2026-07-11)**
~~GitHub Actions runners (PublishlyAI pattern) vs a small always-on VPS for heavy jobs (2,000-word
blog gen, 500-page crawls, bulk pin rendering). Blocks: Phase 3 auto-blog at scale, not Phase 1.~~
Resolved at the M22-auto bulk pipeline round → **GitHub Actions**, `worker-cron.yml`. Platform-wide:
every module's dormant worker-tier job type (SEO crawls, pin rendering, weekly digests, CRM
dedupe, GDPR export/erase, automation execution, media auto-tagging, integration health checks)
becomes live the moment this workflow merges — see D-189.

## D-011 · Email provider · **RESOLVED → SendGrid (see D-086, 2026-07-05)**
~~Resend vs SendGrid. Blocks: M04 email notifications and M16 campaigns wiring, not schema.~~ Resolved at
Session 17 (M16) → **SendGrid** (D-086). First email provider wired platform-wide; the deferred M04 digest/
security-notice, M01 invite, M12 email-channel, M14 email-reminder, and M28 invoice emails are now wireable
follow-ups (each carried on TASKS.md).

## D-012 · Shared theme key · **OPEN**
Whether AiMindShare reads (and/or writes) the shared `islamicinfo-theme` localStorage key or its
own `aimindshare-theme`. Same call as D-CONSOLE-004 — decide once, apply to both dashboard
products. The reference mockup's boot script currently reads the shared key; treat that as a
proposal, not a lock, until this is decided.

## D-013 · Deferred infrastructure — M34 Voice, M25 Video · **OPEN (deferral LOCKED, infra choice OPEN)**
M34 needs a persistent realtime media server; M25 needs heavy render compute. Both are P2/P3,
Phase 7–8. **Decision: defer the infrastructure question** until the core platform is proven —
do not bend the day-one stack for them. Revisit before Phase 7.

---

## D-107 · M20 A/B lives in a dedicated `funnel_splits` table · **LOCKED 2026-07-04**
A split test on a funnel step is a row in `funnel_splits` (variant A = the step's live `page_id`;
variant B = `variant_page_id`; `split` %, `goal`, `status`, `winner`, `promoted_at`), NOT columns on
`funnel_steps`. A step can exist without a test; promoting a winner swaps the step's `page_id` and
marks the split `promoted`. Mirrors M15's variant model but as a separate table (a step can hold at
most one running test at a time).

## D-108 · M20 `funnel_visits` is the single per-step event stream · **LOCKED 2026-07-04**
One table (`funnel_visits`, events `view|optin|purchase|abandoned`, with `variant` + `visitor_id` +
`contact_id`) feeds BOTH the conversion waterfall (`funnel_map`) and the A/B stats
(`funnel_split_stats`). Service-role-written only (no client INSERT policy) — the `public-funnel`
Edge Fn holds the key; the browser can never forge an event. Mirrors `form_views`/`visitor_sessions`
(Gate-4, D-055/D-090).

## D-109 · M20 funnels use the M19 operator-ceiling RLS · **LOCKED 2026-07-04**
`funnels`/`funnel_steps`/`funnel_splits` are operator surfaces like sites, so **SELECT = `has_role
(staff)`** (a client role reads nothing), ins/upd = staff+, del = manager+ — NOT the generic
member-read template. `funnel_visits` = staff+ read, service-role write. Per-client portal narrowing
is M37's job. Mirrors D-089 (M19 sites).

## D-110 · M20 orders wire to M28 via an `invoices` row (no orders table) · **LOCKED 2026-07-04**
A funnel order creates an `invoices` row with `source_type='order'` + `source_id=step` (via
`create_funnel_order`, service-role). No separate `orders` table — M28's `calc_invoice_totals`
trigger stays the money truth so the browser cannot forge an order total, and payment reuses M28's
proven `public-invoice` hosted-pay flow. The canonical PRD `Order`/`Product` sketch is superseded by
the M28 invoice model (Law 8).

## D-111 · M20 winner detection = fixed-horizon two-proportion z-test · **LOCKED 2026-07-04**
`funnel_split_stats` computes per-variant conversion + a two-proportion z-test; a winner is declared
when `|z| > 1.96` (95%) and both arms clear a 30-visitor floor. Server-side + deterministic so the
probe and UI agree. True sequential/Bayesian stopping (the PRD's "sequential significance") is
deferred as a refinement — the fixed-horizon test ships the accept-when.

## D-112 · M20 abandonment sweep ships; one-click off-session upsell defers · **LOCKED 2026-07-04**
`sweep_abandoned_funnels` (hourly `pg_cron` `m20-abandoned-sweep`) flags order invoices unpaid past
the funnel's `abandon_hours` (default 1h) → `emit_trigger('cart.abandoned')` for M13 recovery,
idempotent via an `abandoned` `funnel_visits` marker. The one-click off-session Stripe upsell (charge
a stored PM on a post-purchase step) is scaffolded — the UI + `create_funnel_order` seam are present;
the off-session PaymentIntent on a saved payment method defers pending M28 stored-PM plumbing.

> **Numbering note:** M20 claimed **D-107…D-112**, a clean block above the observed max (D-106) at
> build time — parallel M15/M16/M06/M19 sessions had contended D-084…D-106. If another parallel
> session also claimed any of D-107…D-112, renumber on merge (house pattern). Migration `0023`,
> `public-funnel` Edge Fn, `m20-abandoned-sweep` cron all ship this session.

## D-113 · M06 ships canonical DATA-SCHEMA §6, not PRD's Prisma · **LOCKED 2026-07-05**
Media is the canonical §6 `media_assets` / `media_folders` pair — an asset is `(bucket, storage_path)`
indexing a Storage object (delivery is a signed URL computed at read time), **not** the PRD's Prisma
model with a stored public `url` and a separate `AssetUsage` table. `media_folders` gains `bucket` /
`kind` / `pinned` so brand collections are folders in the `brand` bucket (no new table). Reconciles the
PRD onto the locked stack (Law 8), same posture as every prior module.

## D-114 · `media_assets` minimal logged extensions for the PRD UI · **LOCKED 2026-07-05**
Canonical §6 ships verbatim + the columns the PRD screens need: `filename` (search/rename), `title`,
`alt_text` (SEO, reused by M19/M22), `duration_sec`, `is_favorite`, and `tag_status`
(`pending`/`done`/`skipped`/`failed`, drives the live-updating grid). **No `search_tsv`** — search is
name `ilike` + tag array/GIN, which satisfies the accept-when; full-text is deferred (YAGNI).

## D-115 · Upload is direct-to-Storage + a definer RPC; no presign Edge Fn · **LOCKED 2026-07-05**
The browser uploads straight to Supabase Storage via storage-js (the `0004` bucket RLS is the wall),
then calls `register_media_asset()` (SECURITY DEFINER) as the `/complete` step — it inserts the row and
enqueues the `media.autotag` job atomically. A presign Edge Function would add a service-role hop for
**zero** security gain (the wall already exists), so it is dropped — mirrors M12 D-055 / M41 D-035
("don't rebuild the wall"). The PRD's R2 presigned PUT + S3 SDK are superseded.

## D-116 · Image variants = Supabase Storage image-transform URLs · **LOCKED 2026-07-05**
Thumb 300 / medium 800 / WebP are the same object URL with native transform query params, derived
client-side — **not** a Sharp/BullMQ variant worker (dead stack, dropped). Whether transforms actually
render depends on deploy-time Storage config (the Pro image-transform add-on or a self-hosted imgproxy);
the URL helpers ship now and are "ready-not-run" until that config lands (carried, never faked green).

## D-117 · AI auto-tagging is a `media.autotag` job with a provider-deferred scaffold · **LOCKED 2026-07-05**
Auto-tagging runs as a `media.autotag` job (worker → `media-autotag` Edge Fn), enqueued by
`register_media_asset` for images. The **vision provider is a labelled scaffold** (deterministic tags
from filename/kind) until a provider is decided — same open-decision posture as the M13 AI builder
D-063. `tag_status` drives the "tagging…→tags" live grid update; `meter_increment('ai_tokens')` fires
**only** on a real provider call, so nothing is billed yet (DoD Gate 3 clean). The PRD's GPT-4o SDK call
is superseded by the Edge-Fn + Vault posture.

## D-118 · Usage tracking = canonical `used_in` jsonb, not an `asset_usages` table · **LOCKED 2026-07-05**
"Where used" is the canonical `used_in` jsonb `[{module, ref_id}]` on the asset (the accept-when names
`used_in`), written by `register_asset_usage` / `unregister_asset_usage` (member-gated definer RPCs,
idempotent). A one-time idempotent `backfill_asset_usage()` populates it from `deal_files.asset_id` (the
sole existing consumer, M11). The PRD's separate `AssetUsage` table is superseded — soft-delete then
reads `used_in` to warn if an asset is in use.

## D-119 · Storage metering = nightly pg_cron gauge-recompute of the dormant `storage_gb` kind · **LOCKED 2026-07-05**
Storage is a **gauge**, not a counter: a nightly `m06-storage-meter-nightly` `pg_cron` calls
`recompute_storage_meter(ws)` which **sets** (not increments) the current-period `usage_meters` row for
`storage_gb` = Σ live-asset bytes / GB. `storage_gb` already exists in `meter_kind` (0000) — the nightly
job simply revives it; no per-upload metering, no enum change.

> **Numbering note:** M06 (Session 20) claimed **D-113…D-119**, the clean block above the observed max
> (D-112, M20) at close — the design spec had originally drafted D-107…D-113, which collided with M20's
> committed D-107…D-112, so the block was shifted +6 across all M06 code/docs before close. Migration
> `0021`, `media-autotag` Edge Fn, `m06-storage-meter-nightly` cron ship this session. If a later parallel
> merge re-contends D-113…D-119, renumber on merge (house pattern).

---

## D-120 · M22 editor = hand-rolled contenteditable, not TipTap/ProseMirror · **LOCKED 2026-07-05**
The article editor is a focused `contenteditable` controller (`content-editor.mjs`: toolbar, `/` slash
menu, M06 image insert, internal-link search, allowlist sanitize) — **not** the PRD's TipTap-React. The
no-build vanilla stack has no bundler for a ProseMirror schema, and prose editing needs far less than the
GrapeJS M19 vendored (D-005) or the Chart.js M08 vendored (D-085). `getHtml()` returns sanitised semantic
HTML → `blog_articles.content_html`. Same "reconcile the PRD onto the locked stack" posture as every module.

## D-121 · A NEW `blog-render` Edge Fn serves /blog; M19 `site-render` is not modified · **LOCKED 2026-07-05**
Public blog rendering is a dedicated `verify_jwt=false`, service-role, GET-only `blog-render` Edge Fn
(`/blog`, `/blog/[slug]`, `/blog/category/[slug]`, `/blog/rss.xml`) whose HTML/XML comes from a **pure**
`blog-render.mjs` (shared verbatim by the editor Preview + the Node probe). It **reuses** M19's host→site
resolution + brand-var conventions but **does not edit** the Done `site-render` (surgical — a shipped
module stays untouched). Reads **`status='published'` only**; a draft/scheduled/archived slug is a 404
(D-105 parity). Host-path mounting under the live site domain pends OPEN **D-009** (honest scaffold, like
M19's SSL/domain).

## D-122 · The editorial/review queue is a status filter, not a separate table · **LOCKED 2026-07-05**
The review queue is `blog_articles where status='in_review'`, moved by definer RPCs
(`submit_for_review` staff+, `approve_article`/`reject_article` manager+; reject stores `reject_feedback`
for the S23 regen prompt). The auto-blog `content_queue` + `content_schedules` (keyword rows, frequency,
scheduler top-up) are the **separate Session-23 slice** and are NOT created here.

## D-123 · Taxonomy = `text[]` tags + single `category_id` FK; authors = user byline or pen name · **LOCKED 2026-07-05**
Tags are a `text[]` on the article (no join table — YAGNI); a single `category_id` FK per article to
`article_categories` (per-site). `article_authors` is a workspace user's byline (`user_id`) **or** a pen
name (`user_id` null). Reconciles the PRD's `ArticleCategory`/author-id sketch onto the minimal columns
the screens need.

## D-124 · `embedding vector(1536)` ships as a nullable scaffold; no index until S23 · **LOCKED 2026-07-05**
`blog_articles.embedding vector(1536)` is added **nullable, unpopulated**, on its own line so the PGlite
probe can strip it. No `ivfflat` index and no similarity query until the S23 auto-blog internal-linker
populates it; the manual editor's internal-link popup uses **text search** now. Ship the column so S23
adds no table churn — same "scaffold the seam" posture as prior modules.

## D-125 · SEO score + Flesch readability are computed CLIENT-side, no provider, no meter · **LOCKED 2026-07-05**
`content-seo.mjs` (pure, deterministic) computes the 0–100 on-page rubric + Flesch reading-ease in the
browser and stores `seo_score`/`readability_score`/`word_count` on save. No provider call → **no metering**
(DoD Gate 3 = "no billable action" this slice). The AI generation that WOULD meter (`ai.tokens`/`ai.image`)
is the S23 auto-blog slice. Same open-decision posture as the M13 AI builder (D-063) / M06 auto-tag (D-117).

## D-126 · Publish fires `article.published`; one-click distribute defers to S23 · **LOCKED 2026-07-05**
`_m22_publish` fires the M13 `emit_trigger('article.published', …)` bus (tolerant of M13 absence in
isolated probes — same pattern as M19 `record_page_visit` / M20 `record_funnel_event`). One-click
distribution to M23 social / M24 pins / M16 newsletter is a **labelled S23 scaffold** (M23/M24 unbuilt);
the publish hook is live now so S23 wires distribution without schema change.

## D-127 · Scheduled publish = inline `pg_cron` flip, not a heavy job · **LOCKED 2026-07-05**
`m22-scheduled-publish` (`*/15` `pg_cron`) calls `publish_due_articles()` — a service-role set-based sweep
that publishes every `scheduled` article past its `scheduled_at` (building JSON-LD per row via
`_m22_publish`). Light and set-based → no `jobs` row enqueued, mirroring M28's `sweep_overdue_invoices`
(D-074) and M20's `sweep_abandoned_funnels` (D-112). Registered in JOBS-AND-WORKERS-SPEC §5. Satisfies DoD
Gate 4 (recurring work = `pg_cron` registry, never a client timer).

> **Numbering note:** M22 manual (Session 22, built under the Session-23 prompt) claimed **D-120…D-127**,
> the clean block above the observed max (D-119, M06). The migration `0025_m22_content.sql`, the
> `blog-render` Edge Fn, and the `m22-scheduled-publish` cron ship this session; the front end +
> `content-seo.mjs`/`content-editor.mjs`/`m22seoprobe.mjs` complete it. The AI auto-blog pipeline
> (M22-auto) remains **Session 23**. If a parallel session also claimed any of D-120…D-127, renumber on
> merge (house pattern).

## D-128 · M21 job names follow JOBS-SPEC (`rank.check`/`rank.report`/`seo.audit.crawl`); PRD_M21 §7's `seo.rank.check` is superseded · **LOCKED 2026-07-04**
The binding contract is JOBS-AND-WORKERS-SPEC §5/§6, which names `rank.check` (daily cron), `rank.report`
(weekly cron) and `seo.audit.crawl` (worker). PRD_M21 §7's `seo.rank.check` wording is the informal label
for the same job — M21 uses the spec names everywhere (cron bodies `enqueue_due_rank_checks` /
`enqueue_weekly_rank_reports`, worker handlers, probe). One dotted-verb namespace, no ambiguity.

## D-129 · `seo_keyword_cache` is WORKSPACE-scoped, not a cross-tenant shared cache · **LOCKED 2026-07-04**
The 30-day provider cache is keyed `unique(workspace_id, keyword, country)` and RLS-enabled (member SELECT,
service-role write) — a clean Law-2 table, **not** an M41-style platform-shared cache. Cross-tenant keyword
sharing would trade a marginal cost saving for a tenant-inference attack surface; the volume doesn't justify
it. `seo_cache_get`/`seo_cache_put` (definer, service-role) gate every provider call so a cache hit spends no
`seo_calls`.

## D-130 · SEO tables use the OPERATOR-CEILING RLS (staff+ read), matching M19/M20 — not member-read · **LOCKED 2026-07-04**
All eight M21 tables SELECT on `has_role(workspace_id,'staff')`, so a **client reads nothing** (per-client
portal narrowing is M37's job). Same operator-surface posture as M19 sites (D-089) and M20 funnels (D-109),
not the generic member-read template. Worker-written tables (`keyword_rankings`, `seo_audit_issues`) carry
**no client write policy** — the worker writes under the service role (Gate-4), mirroring `funnel_visits`.

## D-131 · The audit crawler is CHUNKED + RESUMABLE (self-re-enqueue), so it is runtime-agnostic under OPEN D-010 · **LOCKED 2026-07-04**
`seo.audit.crawl` advances the crawl by one bounded batch (≤50 pages), persists issues + the frontier/visited
**cursor** into `seo_audits.cursor`, then **re-enqueues itself** (`run_after`) until the frontier drains or the
500-page cap is hit — the M13 WAIT-node re-queue mechanism. It therefore fits any runtime budget (a GitHub
Actions minute-limited runner OR a long-lived VPS), so the still-OPEN **D-010** (heavy-job worker runtime)
resolution never forces a rewrite. The pure crawler (`workers/seo/crawler.mjs`) is unit-tested against a fake
fetch (`m21crawlprobe.mjs`); only the live at-scale crawl execution is carried (ready-not-run).

## D-132 · `seo_calls` is metered per external provider call in the success path; a failed call bills nothing · **LOCKED 2026-07-04**
`incrementMeter(admin, ws, 'seo_calls', …)` fires **inside** the try after a real 2xx from DataForSEO / SerpApi /
PageSpeed, never before — an exception (including `NotConnectedError`) short-circuits before the meter, so a
failed or not-connected call is free (USAGE-METERING §4, DoD Gate-3). The `seo_calls` meter_kind already ships
(0000/D-027). Cache hits (D-129) also bill nothing.

## D-133 · `rank.change_major` (|Δ| ≥ 5) fires the M13 bus, best-effort exception-guarded · **LOCKED 2026-07-04**
`record_keyword_ranking` computes the delta vs the last snapshot and, on a move of five positions or more,
`emit_trigger(ws,'rank.change_major', …)` into M13 — wrapped in a `begin … exception when others then null`
so a missing M13 never blocks the ranking write (same tolerance as M20 `record_funnel_event` /
M22 `_m22_publish`). M13 is built, so the emit is real; the probe asserts both the fire (|Δ|=12) and the
non-fire (|Δ|=2).

## D-134 · M21 CREATES `content_queue` as the forward-stub M22/S23 adopts · **LOCKED 2026-07-04**
M22 (Session 22) explicitly **deferred `content_queue` + `content_schedules` to Session 23** (D-122). M21 needs
the "Send to Content Queue" seam now, so it creates `content_queue` in `0026` to the M22 §13 shape (RLS-on,
operator-ceiling) and writes it via the `send_to_content_queue(ws, keywords[])` definer RPC (staff+, idempotent
per (ws,keyword,queued)). S23 adopts this table as-is and adds `content_schedules` — no schema churn. Coordination
point flagged for the S23 merge.

## D-135 · Live provider round-trips + at-scale crawl + weekly SendGrid send are ready-not-run · **LOCKED 2026-07-04**
The three Edge Fns (`seo-keyword-lookup`/`seo-serp`/`seo-gap`) and the worker handlers are complete and real, but
this machine has no Deno runtime, no connected DataForSEO/SerpApi/PageSpeed credential, and no SendGrid key — so
every live provider call returns `503 not_connected`, and the live 500-page crawl and the weekly `rank.report`
email are **composed but carried, never faked green**. PageSpeed is added to the provider registry (`pagespeed`,
api_key, platform; `usedBy:["M21"]`, mirrored ts↔js, m41probe EXPECTED at 21). Same honest ready-not-run posture
as every prior module's live-worker/provider seam.

## D-136 · M15 submission authority = service-role `public-form` Edge Fn + `submit_form()` definer RPC · **LOCKED 2026-07-04**
Every form submission enters through the **no-JWT `public-form` Edge Function** (service role, authorized by the
unguessable `forms.public_token`), which calls the **`submit_form()` SECURITY DEFINER RPC** — the single write
pipeline (spam guard → contact upsert/dedupe → exact-text consent → quiz score → logic-drop → routing →
`form.submitted` bus). The browser never writes forms data. Mirrors the M14 `public-booking` / M28 `public-invoice`
public-page precedent (no-JWT Edge Fn + service-role write + `public_token`).

## D-137 · `form_submissions` + `form_views` are service-role-INSERT-only · **LOCKED 2026-07-04**
Neither table has an authenticated INSERT/UPDATE/DELETE policy; members can only SELECT their workspace's rows.
Writes come exclusively from `public-form` under the service role (which bypasses RLS). Same posture as M12 D-055
notes-only insert, M19 `visitor_sessions`, and M20 `funnel_visits` — anonymous/public event streams are never
written by the anon browser client. This is the DoD Gate-1/Gate-7 spine for M15.

## D-138 · Hand-written validator + server re-validation; Zod / dnd-kit dropped · **LOCKED 2026-07-04**
The PRD's Zod schema validation and dnd-kit drag-drop are **dead stack** (Law 1). Field validation is a small
hand-written validator shared by the standalone renderer and the embed (`m15-form-render.js`); the builder palette
→ canvas DnD uses the already-vendored `SortableJS` (M11 D-025). Crucially, `submit_form()` **re-validates
server-side** (required fields, types, honeypot) — the client validator is UX only, never the wall.

## D-139 · `logic_json` dialect = `{when:{field,op,value}, action, target}`, field targets only; logic-hidden answers dropped server-side · **LOCKED 2026-07-04**
Conditional logic is a list of rules `{when:{field, op, value}, action, target}` where **`target` is a field-key
string** (show/hide/require a field). The builder authors step-level targets and **expands them to per-field rules**
at save time, so the engine only ever evaluates field targets (one dialect, no step/field ambiguity). `submit_form()`
recomputes visibility server-side and **drops answers to logic-hidden fields** before persisting — a tamper guard
so a crafted POST can't smuggle values for fields the visitor never saw.

## D-140 · Analytics are compute-on-read (`form_analytics()`), no rollup table · **LOCKED 2026-07-04**
The results funnel (views/starts/completions + per-step drop-off + per-variant) is computed on demand by the
`form_analytics()` RPC over `form_views` + `form_submissions`. No materialized rollup table and no aggregation job
— the event volumes are workspace-scale and the read is cheap. Mirrors M20's on-read funnel math (D-108 stream +
compute) rather than a stored counter.

## D-141 · A/B assignment is sticky-per-visitor via a deterministic hash (`assign_form_variant()`) · **LOCKED 2026-07-04**
Which variant a visitor sees is a **deterministic hash** of `(form_id, visitor_id)` bucketed against `ab_split`
(`assign_form_variant()`, STABLE) — no server-side assignment table and no cookie write needed for stickiness: the
same visitor always resolves to the same variant. The `variant` is stamped onto every `form_view` and
`form_submission` so the funnel and win-stats split cleanly.

## D-142 · `file_upload` field is scaffolded gated-OFF; M06 now exists → wireable follow-up · **LOCKED 2026-07-04**
The builder ships a `file_upload` field type that renders in the palette and on the public form, but the upload
control is **disabled with an "available after M06" note** and performs no live Storage write (mirrors the M14
payment-scaffold precedent). **M06 Media Library has since landed (migration `0021`)**, so the live wire (direct-
to-Storage + `register_media_asset()`, D-115) is a **fast-follow**, not a blocker — recorded here so the follow-up
session knows the dependency is satisfied.

## D-143 · Double-opt-in email send is stubbed; D-011 now RESOLVED → SendGrid (M16) as a fast-follow · **LOCKED 2026-07-04**
Single opt-in (default) records consent immediately and is fully live. **Double opt-in** holds the submission
`pending_confirmation`, builds the confirm-link + `confirm_token`, and `form_confirm_optin()` completes it +
writes consent end-to-end — but the confirmation **email send is stubbed** (same non-blocking deferral posture as
M04 digest / M12 / M14). **D-011 is now RESOLVED → SendGrid (M16, D-011 close, Session 17)**, so wiring the confirm
email through M16's SendGrid path is a **fast-follow**, not a hard block.

## D-144 · Turnstile spam check is a Vault-keyed scaffold; D-009 hosting still OPEN · **LOCKED 2026-07-04**
Honeypot + time-trap spam guards are **fully live and server-side** in `submit_form()`. The optional Cloudflare
Turnstile (CAPTCHA) toggle is a **Vault-keyed scaffold** — the verify call is coded to contract but not wired,
because there is no Turnstile key on this machine and hosting (**D-009**) is OPEN. When D-009 lands, the key goes
in Vault and the verify path activates with no schema change.

## D-145 · Store `ip_hash` (sha256), never a raw IP · **LOCKED 2026-07-04**
Submissions and views persist `ip_hash` = a sha256 digest of the client IP, **never the raw IP** — enough for
rate-limit/abuse correlation without holding PII. Gate-7 (secrets/PII) posture; the GDPR erase path scrubs it like
M05's `consent_records.ip_hash`.

## D-146 · M15 registers `forms.view`/`forms.manage` (staff+) in the permission registry; export reuses `crm.export` · **LOCKED 2026-07-04**
M15 appends **`forms.view` + `forms.manage`** to the `_shared/permissions.ts` registry (staff/manager/admin/owner),
mirrored into `frontend/js/permissions.js`, the migration-0008 seed arrays, and the `m02probe` `EXPECTED` matrix so
the four-place drift guard stays green (D-023). These keys drive the fine-grained matrix UI + documentation; the
authed app's server wall is the **coarse RLS tiers** in `0020` (`has_role` staff/manager), so no RLS policy reads
`forms.*` today. The **CSV export gate deliberately reuses `crm.export`** (submissions are contact data) — the
`forms-export` Edge Fn and `m15probe` assert on `crm.export`; **no separate `forms.export` key** is minted.

# M19 Sites v2 hardening (Session 24) — D-147…D-152

## D-147 · Page versioning gains kinds + labels; prune is per-kind (10 publishes / 10 saves) · **LOCKED 2026-07-06**
`page_versions` adds `kind` (`'publish'`|`'save'`, default `'publish'` so every pre-v2 row keeps its meaning) and
`label`. A new **`save_page_version()` (staff+)** creates named save points without publishing; `publish_page()`
keeps its exact 0022 signature/return but now stamps `kind='publish'` and **prunes per-kind** — manual save points
can never evict publish history and vice-versa. `revert_page()` is unchanged (restore → draft, manager+).

## D-148 · `site_publish_log` is the M19 observability spine — append-only, system-written, staff+ read · **LOCKED 2026-07-06**
Publish / save-point / revert (definer RPCs) and domain-verify (service-role Edge Fn) each append a
`site_publish_log` row (`kind`, `status ok|error`, `detail` jsonb, `actor_id`). RLS: staff+ SELECT only — no
client write path (Gate-4, same posture as `page_versions`/`visitor_sessions`). Surfaced in the site detail
**Analytics** tab as "Publish & domain history". SSL provisioning will log `kind='ssl.provision'` when D-009 lands.

## D-149 · Staging/draft preview = per-site `preview_token` query param (`?pt=`), not auth · **LOCKED 2026-07-06**
The public renderer stays anon (D-100/D-105); the staging/production split is a per-site secret token:
`sites.preview_token` (auto-generated). `site-render?pt=<token>` may resolve **draft** pages and bypasses
**maintenance mode**; without it only `status='published'` ever renders (unchanged v1 behavior). Operators copy the
staging link from Settings → Publish controls. Rotating the token = updating the column (staff+ RLS).

## D-150 · Style presets are renderer-injected token overrides in the PURE module; brand kit always wins · **LOCKED 2026-07-06**
`sites.style_preset` (`minimal`|`bold`|`elegant`|`islamic`, nullable = default look) maps to CSS-variable override
strings in `site-render.mjs`'s exported `STYLE_PRESETS`. `brandVars()` layers preset first, `sites.brand` second —
the workspace brand kit overrides the preset, both override the token defaults. One pure module keeps the editor
preview, the Edge renderer and the probes in lockstep (D-101 posture). No per-preset tables; adding a preset is a
one-line module change.

## D-151 · The template gallery is DATA-DRIVEN from `site_templates`; generator seeds vs full-content workspace templates · **LOCKED 2026-07-06**
0028 seeds six global niche rows (dentist / realestate / restaurant / coach / saas / ecom) whose
`page_json={"generator":"niche","niche":…}` routes through the shared deterministic engine (D-103 — one source of
truth, no duplicated HTML in seed rows). "Save as template" (editor toolbar, manager+ via the unchanged 0022 RLS
insert policy) stores a **full-content** workspace row (`page_json` + `render_html`/`render_css` + description).
Template metadata (`niche`, `language`, `conversion_type`, `description`) drives the gallery UI. v1's cosmetic
niche-button gallery is superseded.

## D-152 · Form embeds hydrate to the live M15 iframe (`/f.html?embed=1&token=`); chat stays a scaffold · **LOCKED 2026-07-06**
M15 shipped (S16) with a public embed contract — the published-page hydration script now mounts a real form iframe
from the `data-form-id` trait (treated as the M15 `public_token`) with postMessage auto-height, mirroring the M14
calendar embed. The **chat embed remains an honest scaffold** until M12 web-chat lands. No editor placeholder or
trait was renamed (D-102 data-* contract unchanged) — existing published pages upgrade on next render.

## D-153 · M20 v2 — `funnel_status` widened with `testing`/`paused` (additive enum values) · **LOCKED 2026-07-09**
`draft|active|archived` rows are untouched; `active` keeps meaning "live" in storage — the UI relabels it "Live"
for display only. No data migration needed. Mirrors the D-083 (`ws_status` + `suspended`) precedent for adding an
enum value inside the same migration that also ships functions, guarded by comparing `::text` rather than the bare
new literal where relevant.

## D-154 · M20 v2 — test-mode segregation via `funnels.test_mode` → `funnel_visits.is_test` / `invoices.is_test` · **LOCKED 2026-07-09**
A funnel flagged `test_mode=true` has every row it writes (via `record_funnel_event`/`create_funnel_order`) stamped
`is_test=true`, cross-module onto M28's `invoices` (additive column, default `false`, zero behavior change for any
existing invoice). `funnel_revenue_summary` and `sweep_abandoned_funnels` exclude `is_test` rows unconditionally —
test traffic must never pollute real revenue, EPC, or the abandonment automation.

## D-155 · M20 v2 — variant governance: optional variant C + configurable sample size/confidence · **LOCKED 2026-07-09**
`funnel_splits` gains `variant_c_page_id`/`split_c` (both nullable — no C = no behavior change) and
`min_sample_size`/`confidence` (default 30/`0.95`, the values the original z-test hardcoded). `funnel_split_stats`
is generalized to an optional 3rd arm: the leader must clear every other arm with traffic via a pairwise
two-proportion z-test at the split's own thresholds; with no C configured this is bit-for-bit the original 2-arm
test. Confidence maps to a z-threshold via a fixed lookup over 90/95/99/99.5% (not a full inverse-normal
implementation) — documented as an approximation. `promote_split_winner`'s `winner` check constraint widened to
allow `'C'`.

## D-156 · M20 v2 — `stop_split` (archive without a winner) + `auto_promote_split_winners` sweep · **LOCKED 2026-07-09**
`stop_split` (manager+) sets a running split to `stopped` without declaring a winner — historical `funnel_visits`
rows are never deleted, so losing-variant reporting stays queryable with no new storage. `auto_promote_split_winners`
is an hourly service-role sweep (`m20-auto-promote-sweep` `pg_cron`) that promotes any `running` split with its own
`auto_promote=true` once `funnel_split_stats` reports significance; idempotent by construction (status flips to
`promoted`). This required relaxing `funnel_split_stats`'s membership guard to `auth.uid() is not null and not
is_member(...)` (mirrors `promote_split_winner`'s existing pattern) so a service-role caller — already granted
execute — can actually call it; no authenticated-caller behavior changes.

## D-157 · M20 v2 — `funnel_publish_readiness` reads M19's `site_publish_log`, no new site columns · **LOCKED 2026-07-09**
Go-live blockers (no steps / a step missing its page / an order-type step with no priced product) vs. warnings (no
order step; the M19 site's domain/SSL, read from `site_publish_log.kind in ('domain.verify','ssl.provision')`
rather than inventing new `sites` columns). Read-only, additive, no M19 schema touched.

## D-158 · M20 v2 — `funnel_revenue_summary` computes attribution on read, no rollup tables · **LOCKED 2026-07-09**
Per-step revenue/orders (via `invoices.source_id`) and per-source revenue (a paid order's contact is matched to that
contact's EARLIEST `funnel_visits` row carrying a non-empty `utm` within the funnel — "first touch"; no match buckets
to `direct`) are both computed on read from existing tables, mirroring M20's existing `funnel_map`/`M28
revenue_rollup` "compute on read" convention rather than adding new aggregate storage. Test-mode rows excluded
unconditionally (D-154).

> **Numbering note:** M20 v2 claimed **D-153…D-158**, the clean block directly above the observed max (D-152) at
> build time. Migration `0029_m20_funnels_v2.sql` ships this pass; scope was Priorities 1–3 of the v2 upgrade brief
> only (statuses/test-mode/go-live, variant governance, revenue attribution) — order bumps/one-click upsell
> charging, the 10-event automation-hook wiring, duplicate/template funnels, per-funnel permissions, and the full
> sidebar IA rebuild are explicitly deferred (see `docs/superpowers/plans/2026-07-09-m20-funnels-v2-upgrade.md`).

## D-159 · M20 v2 — `funnel_visits.event` widened for upsell/downsell responses · **LOCKED 2026-07-09**
Added `upsell_accepted|upsell_declined|downsell_accepted|downsell_declined` to the event check constraint (was
`view|optin|purchase|abandoned`). Additive — only `record_funnel_event` ever writes the 4 new values; every
pre-existing row keeps its original event untouched.

## D-160 · M20 v2 — automation hooks wired into the existing funnel write paths via M13 `emit_trigger` · **LOCKED 2026-07-09**
`record_funnel_event` now emits `funnel.entered` (a visitor's first `view` on the entry step, `step_order=0`),
`step.completed` (a `view` on any later step), `form.submitted` (an `optin`), and `upsell.accepted`/`upsell.declined`/
`downsell.accepted`/`downsell.declined` (the 4 new D-159 events, trigger name = the event with `_`→`.`).
`create_funnel_order` emits `checkout.started`. `promote_split_winner` emits `test.winner_selected`. All emits are
best-effort (`exception when undefined_function then null; when others then null;`), identical to the existing
`payment.received`/`cart.abandoned` pattern — no automation engine was built, M13's `emit_trigger`/`workflows`
already IS this repo's automation system. Function signatures unchanged.

## D-161 · M20 v2 — `set_funnel_status` (staff+) emits `funnel.published` on the transition INTO `active` · **LOCKED 2026-07-09**
A dedicated RPC (rather than a table trigger on every `funnels` UPDATE) so the emit only fires on a real publish
event — `status <> 'active'` → `status = 'active'` — not on every unrelated column write or a same-status no-op.
The frontend routes its status-pill clicks through this RPC; a direct `UPDATE funnels` still works via the
existing staff+ RLS policy, it just won't emit the trigger.

## D-162 · M20 v2 — order bumps become `config.bumps[]` (array); step routing added; upsell/downsell UI stays honest · **LOCKED 2026-07-09**
Frontend-only, no schema change (`funnel_steps.config` is already jsonb). The old singular `config.bump` is read
as a 1-element array for back-compat and normalized to `config.bumps` on next save — never silently dropped.
Added `config.next_step_id` (order/upsell/downsell: "on purchase/accept, go to") and `config.decline_step_id`
(upsell/downsell only: "if declined, go to") step pickers, satisfying the PRD's flow-logic bullet without a
migration. The upsell/downsell config tab states plainly that one-click charging on a saved card isn't wired yet
(per the user's explicit choice over building M28 saved-PM plumbing this pass) instead of offering a toggle that
does nothing real.

> **Numbering note:** this second M20 v2 pass claimed **D-159…D-162** and migration `0030_m20_funnels_v2b.sql`
> (`0029` was the first M20 v2 migration). Scope was Priority 4 (order-bump/upsell UI honesty + routing, frontend-
> only) and Priority 5 (automation hooks) of the v2 brief. `m20probe.mjs` 71→85 assertions, full `verify.sh` green.

## D-163 · M20 v2 — `duplicate_funnel` copies steps, never splits/visits; a template is a funnel row with no site · **LOCKED 2026-07-09**
One function (`duplicate_funnel(p_funnel, p_as_template, p_name, p_site_id)`) serves plain duplicate, save-as-
template, and create-from-template — a template is just `funnels.is_template=true` with `site_id`/every step's
`page_id` stripped (it isn't tied to a site until instantiated). `template_of_id` records lineage in all three
directions. Never copies `funnel_splits`/`funnel_visits` — a duplicate or template always starts with a clean
analytics slate; historical reporting on the source is untouched (append-only, nothing is moved).

## D-164 · M20 v2 — `duplicate_funnel` remaps in-funnel step routing to the copied steps · **LOCKED 2026-07-09**
D-162's `config.next_step_id`/`config.decline_step_id` point at a step id within the SAME funnel. A naive copy
would leave them pointing at the ORIGINAL funnel's steps. `duplicate_funnel` builds an old→new step-id map while
copying and rewrites both keys against it (dropping either key if its target somehow didn't get copied) — routing
survives a duplicate/template-instantiation correctly instead of dangling.

## D-165 · M20 v2 — `funnel_access` is narrow-only; `can_view_analytics` is enforced SERVER-SIDE · **LOCKED 2026-07-09**
A `funnel_access` row for (funnel, user) can only take something AWAY from what the user's workspace role already
grants — its absence (the entire user base today) means zero behavior change. `can_view_analytics=false` is
checked inside `funnel_map`/`funnel_split_stats`/`funnel_revenue_summary` themselves (a new `funnel_analytics_denied()`
helper), not just hidden in the UI — a restricted staff member is actually denied by the RPC, proven in
`m20probe.mjs`. staff+ can read `funnel_access` rows; only manager+ can create/update/delete them (`set_funnel_access`/
`remove_funnel_access`), matching D-109's operator-ceiling posture (this can only narrow, never grant beyond it).

## D-166 · M20 v2 — `funnel_access.can_edit` is UI-level ONLY this pass, not RLS-enforced · **LOCKED 2026-07-09**
Enforcing `can_edit` for real would mean retrofitting the `funnels`/`funnel_steps` UPDATE/INSERT RLS policies —
CLAUDE.md's access-control review bar applies to that specifically, and it wasn't the subject of its own review in
this pass. `can_edit` is stored, surfaced, and toggle-able in the Team panel, but a direct `.from('funnel_steps')
.update(...)` from a "restricted" staff member's browser still succeeds today (their workspace role still allows
it). Flagged explicitly rather than left as a silent gap — enforcing it is the natural next step before this
panel is called a complete permissions system.

> **Numbering note:** this third M20 v2 pass claimed **D-163…D-166** and migration `0031_m20_funnels_v2c.sql`.
> Scope was Priority 6 (duplicate/save-as-template/create-from-template) and Priority 7 (funnel_access, analytics-
> visibility narrowing) of the v2 brief. `m20probe.mjs` 85→103 assertions, full `verify.sh` green. Priorities 8-9
> (operations/logs surface, full 15-section sidebar IA rebuild) remain deferred.

## D-167 · M20 v2 — `funnel_operations_log` derives observability from existing data, no new tables · **LOCKED 2026-07-09**
The "Logs/Jobs" brief bullet is served by filtering M13's `workflow_executions` on `trigger_payload->>'funnel_id'`
(every 0030 `emit_trigger` call already stamps it there) joined to `workflows.trigger_type`, plus counts derived
from `funnel_visits`/`funnel_splits` (abandoned orders, promoted splits) — the same "compute on read" convention
as `funnel_map`/`funnel_revenue_summary` (D-108/D-158). Respects the same `funnel_analytics_denied()` narrowing as
the other analytics RPCs (D-165). No sweep-run log table was added — `sweep_abandoned_funnels`/
`auto_promote_split_winners` still have no execution history of their own beyond their side effects; that would be
a genuinely new capability, not a read over what already exists, and is out of scope for this pass.

> **Numbering note:** this fourth M20 v2 pass claimed **D-167** and migration `0032_m20_funnels_v2d.sql`. Scope
> was Priority 8 (observability) only — Priority 9 (the full 15-section sidebar IA rebuild) is being scoped
> separately given its size. `m20probe.mjs` 103→107 assertions, full `verify.sh` green.

## D-168 · M20 v2 — Priority 9 Step 1: per-funnel rail nav replaces the 3-tab bar, no schema change · **LOCKED 2026-07-09**
Funnel-detail navigation moved from a 3-item horizontal `.fn-tabs` bar to a 13-item left rail that swaps in when
viewing a funnel — mirrors M19's existing per-site rail swap (12-item nav inside a site), not a new pattern.
Routing widened from `#/funnels/:id/map|analytics|settings` to 13 keys (`overview/map/variants/checkout/analytics/
attribution/crm/automations/templates/operations/team/logs/settings`), defaulting to `overview` (was `map`).
"Steps" (brief bullet) stays folded into Funnel Map rather than a redundant separate list — the visual map already
supports add/reorder/edit via the existing step drawer. Every relocated panel (Operations/Team/Logs, previously
stacked inside one Settings tab; the UTM-by-source split out of Analytics into Attribution; pipeline mapping split
into CRM & Revenue) is the SAME code, just addressed by its own hash instead of being stacked — zero new RPCs,
zero schema change. **Variants** and **Checkout** are new thin list views over already-loaded step data whose
row actions delegate to the existing step drawer (`openStep(id, tab)`, generalized to accept a target tab) rather
than duplicating its logic. **Automations** derives its trigger-status list from the same `funnel_operations_log`
data Logs already fetches (grouped by trigger_type, first-seen wins) — no second query. **Templates**' "derived
from this funnel" list filters the ALREADY-loaded `state.funnels` array (which includes templates) by
`template_of_id` — no new query either. Contacts/Entries (the one section needing genuinely new backend — an
entrant-list RPC over `funnel_visits`+`contacts`) is deferred to a Step 2, scoped separately.

## D-169 · M20 v2 — `funnel_entrants` aggregates the entrant list from `funnel_visits`, order-marker excluded · **LOCKED 2026-07-09**
Priority 9 Step 2, the last item on the v2 brief. One row per real `visitor_id` (aggregated from the existing
event stream: first/last seen, contact link, variant, first-touch UTM source, furthest step reached, latest order
status) — `visitor_id LIKE 'order:%'` rows (D-110/D-112's own bookkeeping marker) are excluded, same as
`funnel_map`'s visitor counts. Deliberately does NOT exclude `is_test` entrants like the revenue/analytics RPCs
(D-154) do — an operator testing their own funnel needs to see themselves here to confirm tracking works; each
row carries `is_test` so the UI can badge it instead. Paginated (`p_limit`/`p_offset`, returns `{entrants, total}`),
respects the same `funnel_analytics_denied()` narrowing as the other analytics RPCs. Migration
`0033_m20_funnels_v2e.sql`; `m20probe.mjs` 107→116 assertions; full `verify.sh` green. Frontend: 14th rail section
("Contacts / Entries"). **This closes every item in the M20 v2 upgrade brief — Priorities 1–9 all shipped.**

## D-170 · M20 — landing-page IA split from the per-funnel workspace; "Acquisition" label kept · **LOCKED 2026-07-09**
Frontend-only navigation refactor, no schema change. Two previously-blurred nav contexts are now distinct:
**module landing** (`#/funnels`, `#/funnels/<section>`) gets a shallow 7-item rail — Overview, Funnels, Templates,
Analytics, Attribution, Automations, Settings — vs. the **per-funnel workspace** (`#/funnels/<id>/<tab>`) keeping
its full 14-item deep-operating rail from D-168/D-169, now with **Steps** split out from **Funnel Map** (Steps =
structure/build, no numbers; Funnel Map = the visual node-map with live conversion/drop-off) and **Templates**
removed (templates are workspace-wide, not a per-funnel concept — duplicate/save-as-template actions stay
reachable from inside a funnel via a "Duplication & templates" panel folded into Operations). `parseRoute()` now
disambiguates the shared `#/funnels/...` prefix via a `MODULE_SECTIONS` reserved-word list — a path segment is a
module section if it matches one of the 6 names, otherwise it's treated as a funnel id (real ids never collide
with these words). **"Acquisition" was NOT renamed** — grep confirms M15 Forms/M16 Campaigns/M19 Sites/M20 Funnels
all share it as their sidebar suite label, and `Master_Module_List_v3.md`'s Phase 2 is literally titled
"Acquisition & Sites" grouping exactly these modules; renaming it inside M20 alone would desync from every sibling
module using the same word. Overview/Analytics/Attribution/Automations are deliberately kept as light index/
launchpad pages — Overview derives its "attention needed" panel client-side from already-loaded `state.funnels`
fields only (no new query); Analytics/Attribution/Automations show the workspace KPI strip (already-fetched
`state.glance`) plus a per-funnel table linking into that funnel's own (already-built, full-depth) tab, rather
than standing up a new cross-funnel aggregation RPC — avoids inventing backend scope for what was requested as a
navigation change. Settings is genuinely new but schema-free: "new-funnel defaults" (currency, test-mode-on-create)
persisted to `localStorage` (same pattern as the theme toggle), read by `newFunnelModal()`'s `create()`. Frontend
only — `frontend/js/m20-funnels.js` + no CSS additions needed (100% reuse of existing `.panel`/`.access-row`/
`.fn-grid`/`.kpi` classes). Preview-verified: all 7 landing + 14 funnel-detail sections render, 0 console errors,
0 h-scroll at 375px, settings-save/use-template/new-funnel-defaults flows all functionally confirmed.

## D-171…D-174 · M20 v3 Phase A+B — AI Funnel Studio foundations · **LOCKED 2026-07-10**
Migration `0034_m20_funnels_v3a.sql`. **D-171**: `funnels.funnel_type` (nullable text, checked against the 12
master-PRD funnel types) — every pre-existing funnel keeps it `null`. **D-172**: `funnel_blueprints` table
(workspace-scoped wizard sessions: `answers`/`blueprint` jsonb, `status` draft→approved→converted, links to the
funnel it becomes). **D-173**: `recommend_funnel_blueprint(answers jsonb) → jsonb` — the Studio's recommendation
engine, a **deterministic decision matrix today, not a live model call**. Verified directly: no LLM provider is
wired anywhere in AiMindShare (no API-key usage, no Edge Fn that calls a model); every existing "AI" feature
(M13 automation builder D-063, M16 copywriter D-092, M22 content D-103) ships the same way — a real, working
rules engine with the provider choice explicitly deferred. This is that same posture, not a new one: the function
takes structured answers (goal/offer/price/audience/traffic) and returns a funnel type + step sequence (using only
`funnel_step_type`'s existing 6 values, no enum change) + CTA direction + bump/upsell/downsell suggestions + test
ideas + launch checklist. Single seam for a future LLM swap: only this function's body would change, not its
signature or any caller. **D-174**: `save_funnel_blueprint`/`approve_funnel_blueprint`/`convert_blueprint_to_funnel`
— the wizard's write path; convert materializes the blueprint's steps as real `funnel_steps` rows (same pattern
`duplicate_funnel` already uses). Frontend: new "AI Funnel Studio" nav item + a 4-stage wizard (Goal → Offer →
Audience → Blueprint), `localRecommendBlueprint()` is a JS port of the SQL matrix so mockup mode works identically.
`m20probe.mjs` 116→135 assertions, `scripts/verify.sh` green, preview-verified end to end (mockup wizard run
generated a real funnel with materialized steps).

## D-175 · M20 v3 — funnel.order_failed wired + a real pre-existing gap fixed in the payments webhook · **LOCKED 2026-07-10**
Investigated before wiring "order failed" tracking and found a bigger, real, pre-existing gap: `record_funnel_event
(p_event='purchase')` was **never actually called by a real Stripe payment** — `payments-webhook/index.ts`'s
`payment_intent.succeeded` handler only ever credited the invoice (`record_invoice_payment`), it never told M20's
own event stream a purchase happened. The migration-comment in `create_funnel_order` ("purchase is recorded later,
on the payment webhook") described an *intended* wiring that was never implemented. Practical effect: Funnel Map's
order-step "conversions" showed 0 even for funnels with real, paid revenue (revenue/AOV/EPC were unaffected — those
read `invoices.amount_paid` directly, not `funnel_visits`). Fixed at the source: `payment_intent.succeeded` now also
calls a new `recordFunnelPurchaseIfOrder()` helper (resolves the invoice → funnel step → funnel, calls
`record_funnel_event`), guarded by an existence check so a redelivered webhook can't double-count. Added
`payment_intent.payment_failed` → `recordFunnelOrderFailed()` the same way, emitting the new `order_failed`
`funnel_visits` event (constraint widened, no `invoices.status` change — 'failed' was deliberately NOT added to the
shared M28 status enum; the funnel event stream alone is sufficient for M20's tracking need and touching a
core M28 column for an M20-only need was judged the wrong tradeoff). `record_funnel_event` accepts `order_failed`
and emits `order.failed` via the same `replace(p_event,'_','.')` pattern as the upsell/downsell responses (D-160).
Edge Function change is **ready, not run** (no Docker/Deno locally, same posture as every other Edge Fn in this
repo) — reviewed line by line for syntax/logic instead. `m20probe.mjs` covers the SQL side (event constraint +
trigger emission); the webhook's own logic isn't independently testable here.

## D-176…D-180 · M20 v3 Phase C+D — Operations Workspace depth + AI Optimization advisories · **LOCKED 2026-07-10**
Migration `0035_m20_funnels_v3b.sql`, all backward compatible (`CREATE OR REPLACE` on existing signatures, only new
jsonb fields added). **D-176**: `funnel_map` gains per-step `revenue`, `has_bump`, `warning_no_page`. **D-177**:
`funnel_publish_readiness` gains a 0–100 `score` derived from the same blockers/warnings it already computed — no
new checks invented (a real "payment provider connected" or "form" check would need M28/M15 data this function
doesn't have; not faked). **D-178**: `funnel_revenue_summary` gains a daily `trend` (defaults to the last 30 days),
`by_medium`/`by_campaign` visitor breakdowns, and a `reconciled` flag — a genuine integrity check (top-level revenue
vs. sum of by-step revenue use overlapping-but-not-identical WHERE clauses, so a real mismatch is catchable, not
decorative). `by_content`/`by_term` deliberately deferred (real query cost, marginal value over `by_source`).
**D-179**: new `funnel_recommendations(p_funnel)` — the AI Optimization advisory layer, same deterministic-today
posture as D-173. Five grounded rules over data `funnel_map`/`funnel_revenue_summary`/`funnel_split_stats` already
compute: high step-to-step drop-off, low checkout completion, low EPC, missing order bump, a running test with a
significant non-control leader. Explicitly NOT attempted: traffic-source/funnel-type mismatch (traffic_source isn't
persisted past the wizard session), "no proof block"/"weak CTA"/"too many form fields" (would need to parse M19
page content, a capability that doesn't exist) — flagged as deferred, not faked. **D-180**: `funnel_job_runs` table
+ `sweep_abandoned_funnels`/`auto_promote_split_winners` log a row every run (job name, rows affected, timestamp) —
the two hourly sweeps had zero run-visibility before this. Frontend: readiness score + AI recommendations panel on
Overview, revenue trend + date-range picker + medium/campaign breakdown on Analytics/Attribution, reconciliation
warning on CRM & Revenue, job-run history on Logs, a coupon field on Checkout (jsonb-only, no schema), and a
Viewer/Analyst/Editor/Full-access preset selector on Team (relabels the same two existing booleans — explicitly
documented as a UX relabel, not new enforcement; full role granularity stays deferred per D-166's access-control
bar). `m20probe.mjs` 135→150 assertions, `scripts/verify.sh` green, preview-verified across all 14 workspace
sections + the wizard, 0 console errors, 0 h-scroll at 375px.

## D-181 · M20 v3 Phase F — Instant mode + product/affiliate offer-source branch · **LOCKED 2026-07-10**
Migration `0036_m20_funnels_v3c.sql`, additive only (widened CHECK constraint + `CREATE OR REPLACE` on the existing
`recommend_funnel_blueprint` signature). A second master prompt re-requested the full "AI Funnel Studio" vision;
auditing first found D-171…D-180 already covered most of it, so this closes only the two genuine gaps. Widens
`funnels_funnel_type_chk` with `affiliate_bridge`/`affiliate_review`/`affiliate_comparison` (existing nullable
column, no existing rows affected). `recommend_funnel_blueprint` gains an `offer_source` branch, checked before the
existing objective-based dispatch: `offer_source='affiliate'` + cold/unaware signals → `affiliate_bridge`;
solution-aware → `affiliate_comparison`; otherwise → `affiliate_review`. All three generate an optin/sales/thankyou
flow with no order/upsell/downsell step (the sale happens on the vendor's site, not ours) and append an FTC
affiliate-disclosure reminder to the launch checklist when `disclosure_required` is true (the default). No new
tables — the affiliate-specific fields (vendor, URL, commission note, disclosure flag) live in the wizard's
existing `answers`/`blueprint` jsonb columns, same as every other studio answer. `convert_blueprint_to_funnel`
needed no code change, only the widened CHECK. Frontend: a mode-picker ("Instant Funnel" vs. "Smart Brief") at
Studio entry plus an "Affiliate Funnel" shortcut; Instant mode is a single condensed screen reusing the same
recommendation engine with inferred defaults (audience awareness from traffic source, no lead-magnet/checkout
questions); the Offer stage (both modes) gained the offer-source toggle; a "Generate with AI" entry button added
to the Funnels list landing. Explicitly NOT attempted, same D-063 honesty posture: an async job queue for
blueprint generation (deterministic + sub-second, not an LLM call — fake progress/retry UI would be exactly the
faked capability this rule forbids); a real product/course/offer catalog (its own module-sized workstream, no
such catalog exists anywhere in this repo — checked M28/M03/M09); one-click upsell/downsell charging and full RBAC
enforcement (unchanged, already deferred by D-171…D-180). `m20probe.mjs` 150 assertions (+7: affiliate decision
matrix, no-bump/upsell/downsell invariant, disclosure checklist, end-to-end convert proving the widened CHECK).

## D-182…D-185 · M29 Affiliate Hub Phase 1a + Funnels bridge · **LOCKED 2026-07-10**
Migration `0037_m29_affiliate_hub.sql`. A third master prompt asked for the same "AI Funnel Studio" vision plus a
clean split: Funnels builds/generates/optimizes conversion paths, Affiliate Hub owns affiliate business data,
bridged only by explicit handoff, never merged. "Affiliate Hub" is already reserved in this repo as **M29**
(`doc/PRD/PRD_M29_Affiliate_Hub.md`) with a full PRD — link cloaker/rotation, Amazon PA-API, live multi-network
earnings sync, AI content generators — and zero implementation; that full scope is its own module-sized
workstream. This locks only Phase 1a, scoped down via plan mode with the user's sign-off.

**D-182** — M29 foundation: `affiliate_offers` (name/network/vendor_url/niche/commission_note/
`compliance_category` check `general|health|finance|income|sensitive`/disclosure_text/promo_assets jsonb/status),
`affiliate_networks` (manual list, `status` defaults `'manual'` — no live API, same D-063 posture as every other
unbuilt-integration stub), `affiliate_disclosure_templates` (reusable snippets by category). All three:
member-read/staff-write RLS, same shape as every other M-module table. New module `frontend/js/m29-affiliate-hub.js`
+ `frontend/m29-affiliate-hub.html` + `frontend/styles/m29-affiliate-hub.css` on the identical shell/moduleHead/
svg/toast/modal conventions as every other module. Nav is the user's full target IA (Overview/Offers/Networks/
Campaigns/Creatives/Tracking Links/Disclosures & Compliance/Earnings/Analytics/Library/Settings) from day one —
safe, since it's a brand-new module with no existing routes to break — but only Overview/Offers/Networks/
Disclosures & Compliance/Settings are real; the rest render an honest "not built yet" state, never fabricated data.

**D-183** — the bridge: additive `funnels.source_offer_id` (nullable FK → `affiliate_offers`) +
`convert_blueprint_to_funnel` gains an optional `p_source_offer_id` (had to `drop function` the old 3-arg
signature first — a 4th param under `CREATE OR REPLACE` creates a new overload instead of replacing it, making a
2-arg call ambiguous; caught by actually running the probe). One direction only, Phase 1a: M29 Offers →
"Create Funnel from Offer" writes a one-time `localStorage` prefill key, M20's Studio consumes-and-clears it,
pre-fills the affiliate wizard, and tags the generated funnel with `source_offer_id` on approve. Reverse
direction (Earnings rollup from linked funnels, "Open in Affiliate Hub" beyond the one link already added) is
Phase 1b.

**D-184** — `funnel_compliance_scan(p_funnel)`: deterministic phrase-pattern rule table (5 rules — guaranteed-
income/miracle-health/risk-free-finance claims at `high`, fake-urgency/100%-absolute claims at `medium`) over the
funnel's own step copy, same posture as `recommend_funnel_blueprint` (D-173)/`funnel_recommendations` (D-179): a
real lint-style feature, not NLP claim understanding. Frontend warn-gates (not DB-level block, to avoid touching
`set_funnel_status`'s tested behavior) the draft→active transition when findings exist.

**D-185** — M20 IA additions (frontend-only, no schema): landing nav reordered/relabeled to Overview/Funnels/
AI Funnel Studio/Templates/**Pages**/Automations/Analytics/Settings (Attribution's route unchanged, just no longer
top-level); new **Pages** landing view (cross-funnel page-reuse index from existing `funnel_steps.page_id`, no
schema change). Per-funnel nav gains **Offers** (source offer + Affiliate Hub link) and **Compliance** (the scan
above); the existing recommendations panel **moved** (not duplicated) off Overview into its own **Optimization**
tab; `tabMap`'s label renamed "Funnel Map" → "Flow Map" (cosmetic). The remaining 7 tabs are deliberately **not**
collapsed into the user's fuller proposed 13-tab IA in this pass — nav restructuring is already treated as its own
dedicated task sequence in this repo (see "IA restructure Task 9/10/11"), and bundling a 7-tab rename into a
feature build was judged too risky.

New `m29probe.mjs` (16 assertions), `m20probe.mjs` 158→166 (+8: bridge, cross-tenant offer rejection, compliance
scan on risky vs. clean copy, RLS on the scan and on `affiliate_offers`), both in `scripts/verify.sh`, full suite
green. Deferred, not forgotten: Tracking Links/redirect/click-logging, Networks CSV import, Earnings rollup, the
reverse bridge (**Phase 1b**); Campaigns, Creatives, Library, angle generation, quiz branching (M15), email
sequence generation (M16), the fuller 13-tab collapse, Amazon PA-API / live network integrations (**Phase 2**).

## D-186 · M20 AI Funnel Studio Phase 1 — real Anthropic provider layer · **LOCKED 2026-07-10**
Migration `0038_m20_funnels_v3d.sql`. M20 AI Funnel Studio's `funnel-ai-generate` Edge Function calls a real
Anthropic provider (via a new `_shared/llm.ts` adapter) gated by the existing M03 `ai_tokens` meter and a new
M20-owned `funnel_ai_generation_log`/`funnel_ai_rate_limited` (20/workspace/hour, LLM calls only) — any failure,
missing key, quota exhaustion, or timeout falls back automatically to the existing deterministic
`recommend_funnel_blueprint` RPC, never a hard error. `ai_tokens` is metered on the LLM call itself (platform
convention), not on blueprint approval.

## D-187 · M20 AI Funnel Studio Phase 2 — prompt-first hero redesign · **LOCKED 2026-07-10**
Frontend-only, no migration. M20 AI Funnel Studio's landing screen is prompt-first: a free-text prompt box is
the primary path, with 6 funnel-type cards (5 categories + "Let AI decide") as an optional, equally-visible
alternative that seeds guided-field defaults rather than hard-selecting one of the 15 internal `funnel_type`
values — the deterministic engine / LLM still makes that final call. The old Instant/Smart-Brief wizard entry
screen is retired; its field logic is reused inline.

## D-188 · Site-wide — "mockup mode" is a dev-only signal, never a visible UI element · **LOCKED 2026-07-10**
Frontend-only, no migration, applies across every module (M00…M44). Every module's `connected()`-gated
fallback-data logic stays exactly as-is — the app must keep working with realistic sample data when no
Supabase project is linked. What's removed is the *visible* tells: each module's `previewStrip()`/`stateStrip()`
(or equivalently named) banner — the "Mockup mode. Preview state: Default/Empty/Loading/Error/Success" strip
with clickable state buttons — now unconditionally returns `""`; the topbar `#connPill` is hidden entirely
whenever not connected instead of showing "mockup mode"/"not connected" text (it still shows a positive
"connected"/"live" label once a real project is linked). `state.previewState`/`PREVIEW_STATES` and their
click-handler wiring are untouched in every file — Gate 5 states (Definition of Done) still exist and are
testable, just via the browser console (`state.previewState = 'empty'; render();`) rather than a visible
button. New modules must follow this from the start — see `DEFINITION-OF-DONE-v1_0.md` Gate 5.

## D-189 · Worker runtime → GitHub Actions worker-cron.yml (resolves D-010) · **LOCKED 2026-07-11**
Workflow-only, no migration: `.github/workflows/worker-cron.yml` runs `node workers/worker.mjs
--max=10` every 5 minutes against repo secrets `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`.
`worker.mjs` gains a `--max=N` flag (claim/process up to N jobs, then exit) alongside the existing
`--once`. Stale leases are already reclaimed by the core `*/1 * * * *` sweeper — no new reclaim
logic needed. Chosen over a small always-on VPS because it needs zero new infrastructure and
matches the "PublishlyAI pattern" D-010 already named.

## D-190 · M22-auto real LLM generation wiring · **LOCKED 2026-07-11**
Migration `0039_m22_bulk.sql`. `blog-pipeline.mjs`'s documented `generate_article_with_ai(ctx,
callLlm)` stub is implemented for real via dependency injection: a new `workers/llm.mjs` (mirrors
`_shared/llm.ts`'s Vault convention) supplies the actual Anthropic call, keeping
`blog-pipeline.mjs` network-free and browser-importable. Default model **claude-sonnet-5**
(long-form quality bar is higher than M20's funnel-copy use of Haiku); `claude-3-5-haiku-20241022`
selectable per schedule/batch. `ai_tokens` is metered on the LLM call itself (platform convention,
same as D-186), never on a later approval step. `blog_articles` gains
`generation_source`/`llm_model`/`tokens_used` (mirrors D-186's `funnel_blueprints` columns
exactly). No key configured → automatic fallback to the existing deterministic
`build_article_html` path, never a hard error.

## D-191 · IslamicInfo.org mandatory human review — server-side, not UI-only · **LOCKED 2026-07-11**
Migration `0039_m22_bulk.sql`. New `site_brand_voice.review_required` column, enforced two ways:
(1) a `decidePublishStep()` pure function in `blog-pipeline.mjs`, called by `worker.mjs`'s
`blog.generate` handler, forces `step='review'` whenever `review_required=true` regardless of
`content_schedules.auto_publish` or quality-gate scores; (2) a database trigger
`enforce_review_lock()` rejects any `site_brand_voice` row update that sets
`review_required=false` for a site whose `sites.style_preset='islamic'`. Neither guarantee
depends on the UI — a bulk job, a misconfigured schedule, or a direct RPC call cannot bypass
either layer.

## D-192 · Bulk Content Creation architecture — extend, don't duplicate · **LOCKED 2026-07-11**
Migration `0039_m22_bulk.sql`. Two new tables only: `content_templates` (variable-slot prompt
templates) and `content_batch_jobs` (batch metadata, topics stored inline as jsonb — no separate
staging table). `content_queue` gets three new columns (`batch_job_id`, `template_id`,
`variables`) via the same `add column if not exists` pattern D-148 established — migration `0026`
stays untouched. Bulk jobs get pacing separate from a site's day-to-day
`content_schedules.max_posts_per_run` via a second loop appended to the existing
`advance_content_pipeline()` cron function (a fixed per-tick cap, mirroring M20's D-186
hardcoded 20/hour pattern) rather than a new quota-counter table. Duplicate detection is
exact-keyword matching only, not the design doc's originally proposed pgvector cosine
similarity — `blog_articles.embedding` has no writer anywhere in the codebase yet (confirmed
dormant, D-124 scaffold), so a real semantic check isn't buildable today; faking one would
violate this codebase's established honest-scaffold posture (D-147). Semantic dedup is a
documented follow-up for whenever an embedding writer lands.

---

*AiMindShare.com · Decisions Log v1.0 · D-001…D-085 recorded (D-008 superseded by D-014; M09 added
D-042…D-048; M11 added D-049…D-052; M12 added D-053…D-059; M13 added D-060…D-063; M28 added D-070…D-077,
skipping D-064…D-069 for a parallel M14 session; M44 added D-078…D-083; M08 added D-084…D-085; M20 added
D-107…D-112; M06 added D-113…D-119 (shifted +6 from the spec's draft D-107…D-113 to clear M20's block);
M22 manual added D-120…D-127; M15 added D-136…D-146 (claimed above the observed max D-135, which a parallel
M21 SEO session reserved at D-128…D-135 in its migration/spec); M21 SEO Engine (Session 21) now records the
formal **D-128…D-135** headers (migration `0026_m21_seo.sql`; `pagespeed` provider added) —
if a parallel session also claimed any of these numbers, renumber on merge; M19 v2 (Session 24) added
D-147…D-152 (migration `0028_m19_sites_v2.sql`); M20 v2 added D-153…D-158 (migration
`0029_m20_funnels_v2.sql`, Priorities 1–3 of the v2 upgrade brief) then D-159…D-162 (migration
`0030_m20_funnels_v2b.sql`, Priorities 4–5) then D-163…D-166 (migration `0031_m20_funnels_v2c.sql`,
Priorities 6–7) then D-167 (migration `0032_m20_funnels_v2d.sql`, Priority 8) then D-168 (frontend-only,
no migration — Priority 9 Step 1, the per-funnel rail nav) then D-169 (migration `0033_m20_funnels_v2e.sql`,
Priority 9 Step 2 — closes the M20 v2 upgrade brief) then D-170 (frontend-only, no migration — landing-page vs.
per-funnel-workspace IA split, requested separately after the v2 brief closed)) then D-171…D-180 (M20 v3: AI
Funnel Studio + Operations Workspace depth + AI Optimization advisories, migrations 0034/0035) then D-181
(M20 v3 Phase F: Instant mode + product/affiliate offer-source branch, migration `0036_m20_funnels_v3c.sql`) then
D-182…D-185 (M29 Affiliate Hub Phase 1a + the Funnels↔Affiliate-Hub bridge, migration `0037_m29_affiliate_hub.sql`)
then D-186 (M20 AI Funnel Studio Phase 1: real Anthropic provider layer, migration `0038_m20_funnels_v3d.sql`)
then D-187 (M20 AI Funnel Studio Phase 2: prompt-first hero redesign, frontend-only, no migration) then
D-188 (site-wide: "mockup mode" banner/pill hidden from view in every module, frontend-only, no migration),
5 OPEN. Append-only.
LOCKED entries bind Claude Code; OPEN entries are human calls to be flagged, not resolved, in build sessions.*
