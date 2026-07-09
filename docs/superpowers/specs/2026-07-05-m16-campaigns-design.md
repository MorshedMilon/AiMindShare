# M16 — Campaigns (Email + SMS) · Design Spec
**Session 17 · Phase 2 (Acquisition & Sites) · 2026-07-05**
**Status:** approved (design review passed 2026-07-05)

> Attach list for this session: Constitution (CLAUDE-AiMindShare) · DECISIONS · DATA-SCHEMA (§9 campaigns
> slice) · RLS-AND-SECURITY · PRD_M16 · BUILD-SEQUENCE (Session 17) · DEFINITION-OF-DONE · TASKS.md ·
> AIMINDSHARE-DESIGN (design system). Stack is locked: vanilla HTML/CSS/JS + Supabase (Postgres + RLS +
> Edge Functions + Vault + Realtime + pg_cron + jobs). No Next.js / Prisma / BullMQ / Redis / React.

---

## 0. Dependency & blocker check (done before design)

**Ready (all module deps Done in TASKS.md):**
- **M09 CRM** (`0013_m09_crm.sql`): `log_activity(ws,contact,type,desc,meta)` = timeline.add (append-only, D-048),
  `contacts`, `contact_tags`, `smart_lists` + `smart_list_eval()` (AND/OR audiences). The audience resolver
  hangs off these.
- **M13 Automations** (`0016_m13_automations.sql`): `emit_trigger(ws,type,payload)` bus is live and already
  registers `email.sent / email.opened / email.clicked / email.bounced / email.unsubscribed` **as honest
  stubs** for M16 to fire — this session makes them concrete (same move M14 made for `appointment.*`).
- **M05 Compliance** (`0010_m05_compliance.sql`): the append-only `consent_records` ledger + `consent-check`
  Edge Fn (channel→kind, default-deny, most-recent-wins). The audience resolver filters on it; unsubscribe
  writes back to it.
- **M03 Billing** (`0009_m03_billing.sql`): `meter_increment(ws,kind,qty,source,unit_cost,ref)`,
  `meter_check(ws,kind,qty)→jsonb{included,used,wallet,remaining,over}`, `has_feature(ws,flag)`. The
  `meter_kind` enum already carries **`email`** and **`sms`** — M16 reuses them (no enum churn).
- **M41 Vault** (`0010_m41_integrations.sql` + `_shared/integrations.ts`): `resolveCredential()` + deterministic
  Vault naming. INTEGRATIONS-SPEC pre-reserves the email provider under M41; M16 is its first wiring.
- **JOBS-AND-WORKERS-SPEC §6** already **pre-registers `campaign.send` as a fan-out job type** ("expands to
  many `*.send` jobs") — the fan-out architecture below is on-spec, not invented.

**Blocker resolved (the one gate on this session):**
- **D-011 (email provider) was OPEN** and BUILD-SEQUENCE row 17 is the *only* row with an explicit decision
  gate ("requires D-011 decided"). Unlike M04/M12/M28/M14 — where email was a *secondary* channel safely
  stubbed — for Campaigns the *send is the module*, so this was a genuine stop-and-flag point (not the
  stub-and-defer pattern). **Resolved this session → SendGrid** (user delegated the call). Rationale:
  (1) the PRD's own webhook endpoint is named `/api/webhooks/sendgrid` (§4) and its prompt says
  "SendGrid/Resend via M41"; (2) SMS already runs on **Twilio** (M12) and SendGrid is a Twilio company —
  one vendor, one bill; (3) SendGrid's deliverability tooling (IP warmup, suppression groups mapping 1:1 to
  our `suppressions` table, rich event webhooks) fits a broadcast/drip module at scale. **D-084** records it.

**Environment:** no Docker / Supabase CLI / Deno / hosted project / SendGrid or Twilio creds on this machine.
So the SendGrid adapter, event webhook, tracking endpoints, and live sends are **built to full contract but
"ready, not run"**, verified via a PGlite probe + code review — identical to every prior session (M03 Stripe,
M12 Twilio, M14 Google). Migration is **`0020`** (highest on disk is `0019_m44_admin`). The pre-existing
`0012` gap (M05 renumber) and double-`0010` are not touched here.

**Scope decision:** full PRD_M16 *accept-when* surface to DoD; the rest honestly scaffolded (see §1).

---

## 1. Scope slice (full-DoD vs honest scaffold)

Accept-when (BUILD-SEQUENCE 17): *"Email builder (Quill/TipTap-vanilla), broadcasts + drips as fan-out jobs,
A/B subjects, unsubscribe compliance (M05), meters++ per send; requires D-011 decided."* Following the
M14/M28 precedent (build the accept-when full, scaffold the rest, flag it, never fake).

**Full DoD:**
- **Email builder** — block-based (section / columns / text / image[M06 asset id] / button / divider / social
  links / spacer / raw HTML), block JSON → responsive inline-CSS HTML compile, desktop/mobile preview,
  global brand styles, save-as-template. *Vanilla: reuse the already-vendored **SortableJS** for block
  reordering — no new dependency (a Quill/TipTap rich-text field is used only inside the text block).*
- **Broadcasts** — audience = tag / smart-list (`smart_list_eval`) / all, **minus `suppressions` minus
  consent-opt-outs**; schedule at a workspace-tz datetime; send-rate throttle; pre-send checklist
  (audience count, unsub-link present, spam score).
- **Drip sequences** — ordered email+SMS steps; delays relative (X days after previous / after enrollment)
  or fixed (weekday+time); enrollment via M13 action / manual / form-routing hook; exit conditions
  (goal met / unsubscribed / replied); per-step stats.
- **A/B subject testing** — two subjects → 10%+10% sample → winner by opens after 4h → auto-send remainder.
- **Personalization** — `{{first_name}}`, `{{company}}`, `{{custom.field}}`, `{{unsubscribe_link}}`
  (enforced-present) with fallbacks.
- **Compliance** — auto unsubscribe footer; one-click unsubscribe page + `List-Unsubscribe` header (RFC 8058);
  global suppression list enforced on every send; CAN-SPAM postal-address footer setting.
- **Deliverability / tracking** — open pixel + click-wrapped per-recipient tokens → `send_events` →
  `emit_trigger(email.opened/clicked)` + `log_activity` timeline; SendGrid event webhook
  (delivered/bounce/complaint/unsub) → `suppressions` + `campaign_stats`.
- **SMS campaign steps** — live via M12's Twilio contract (consent + A2P gate + `meter('sms')`), like M14
  reminders. Quiet-hours honored; replies land in M12 inbox (existing inbound path).
- **Metering** — every email send → `meter_increment('email',1)` in the success txn; every SMS send →
  `meter_increment('sms',1)`; `meter_check` gate pre-send with clear failure states (quota_exceeded / plan_gated).
- **Analytics** — delivered / opens / clicks / bounces / unsubs + per-link click map + revenue-attributed
  placeholder (UTM → M09 → M11; the join lands when those reports firm up).
- **Templates** — 10 seeded niche templates (PRD prompt: "10 seed templates, expand later") + save-as-template.

**Honest scaffold (flagged, never faked):**
- **AI copywriter** → scaffolded exactly like M13's `automations-ai-generate` (**D-063** posture): the endpoint
  returns a deterministic keyword-derived draft, **meters nothing** (no provider call = nothing billed), and
  wires to a real model when an **LLM provider is decided** — a *separate* open call from D-011. Recorded **D-091**.
- **Domain-authentication wizard** → shows the SPF / DKIM / CNAME records to add; the live SendGrid
  domain-verify API call is built to contract but **ready-not-run** (no creds here). **D-089**.
- **Spam score** → a heuristic client-side check ships now; the SpamAssassin/provider API is a ready-not-run
  hook (yet another undecided external provider). **D-090**.
- **MJML** → we compile block-JSON → responsive inline-CSS HTML **directly**; the MJML library is deferred
  (the PRD's own prompt specifies a compile *step*, not the library). **D-085** (table/compile note).
- **Revenue attribution** join → placeholder card; wires when M40 reports firm up.

---

## 2. Design choices (with rejected alternatives)

**a) Send pipeline = `jobs` fan-out (CHOSEN) vs. a single big job.**
`campaign.send` (the pre-registered fan-out type) resolves the audience, gates on `meter_check`, then enqueues
**throttled per-batch `email.deliver` jobs** with staggered `run_after` (the send-rate throttle). One recipient
failing never blocks the batch; retries ride the existing jobs backoff. Rejected: one monolithic job (no
throttle, no partial-failure isolation, blocks the worker). Rejected: client-side send loop (Law 5, Gate 4).

**b) Drip step timing = `run_after`-delayed jobs (CHOSEN) vs. a polling cron.**
Each enrollment schedules its *next* step as a `sequence.step` job with `run_after = now + delay` — the exact
**D-061** WAIT mechanism M13 uses (accuracy rides on `jobs.run_after`, no polling). A low-frequency
reconciliation cron (`m16-sequence-tick`, hourly) is a backstop that re-enqueues any enrollment whose
`next_run_at` slipped. Rejected: minute-cron scanning all enrollments (wasteful, imprecise).

**c) Metering kinds = reuse `email` / `sms` (CHOSEN) vs. add `email_sent`/`sms_sent`.**
The `meter_kind` enum already carries `email` and `sms`; M12 already meters `sms`. The PRD's prose
`email.sent` / `sms.sent` are *labels for those meters*, not new enum values. Reusing them keeps one meter per
channel across all modules (USAGE-METERING). Rejected: new enum values (fragments metering, needless churn). **D-086**.

**d) Unsubscribe = dual-write to `suppressions` + `consent_records` (CHOSEN) vs. suppression-only.**
The unsubscribe endpoint writes **both** a `suppressions` row (fast per-send block-list lookup) **and** a
`consent_records` opt-out (`email_optin`, granted=false — the legal ledger, M05). Both must agree so a later
consent check and a later send-time suppression check give the same answer. Rejected: suppression-only (M05
ledger goes stale; a consent-gated channel could disagree with the block list). **D-088**.

**e) `send_events` + `suppressions` are service-role-written (CHOSEN).**
Delivery history and the suppression list are **provider/worker truth**, so both tables ship a member/staff
SELECT policy and **no client INSERT/UPDATE/DELETE** (writes only via the worker + signature-verified webhook
under the service role) — mirrors M28's `invoice_payments` ledger (D-071). A client can neither forge open/click
history nor suppress an arbitrary address. **D-087**.

---

## 3. Data model — `0024_m16_campaigns.sql` (9 tables)

Canonical **DATA-SCHEMA §9** defines only `email_campaigns` + `campaign_stats` (column lists). The other 7 are
PRD-only → created as **logged extensions** (**D-085**), the same way every prior module extended canonical.

New enums (idempotent DO-block create; PGlite-safe): `campaign_status ∈
draft|scheduled|sending|paused|sent|failed`; `sequence_status ∈ active|paused|archived`;
`enrollment_status ∈ active|completed|exited|unsubscribed`; `send_event_type ∈
queued|sent|delivered|opened|clicked|bounced|complained|unsubscribed|failed`; `step_channel ∈ email|sms`;
`suppression_reason ∈ bounce|complaint|unsub|manual`.

| Table | Key columns |
|---|---|
| `email_campaigns` | `id, workspace_id, name, channel step_channel default 'email', subject, subject_b, preheader, body_json jsonb, from_identity_id, status campaign_status, audience jsonb ({type:tag|smartlist|all, ref}), ab_enabled bool, ab_sample_pct int default 10, ab_winner_metric text default 'opens', ab_winner char(1), throttle_per_min int, footer_address text, scheduled_at, sent_at, created_by, created_at, updated_at`. |
| `campaign_stats` | `campaign_id (unique), workspace_id, sent, delivered, opened, clicked, bounced, unsubscribed` — all int default 0, trigger-maintained. |
| `sequences` | `id, workspace_id, name, status sequence_status, exit_on jsonb ({goal,unsub,replied}), enrolled_count int, created_at, updated_at`. |
| `sequence_steps` | `id, workspace_id, sequence_id, step_order int, channel step_channel, delay jsonb ({mode:relative|fixed, days, weekday, time}), subject, body_json jsonb, sent int, opened int, clicked int`. |
| `sequence_enrollments` | `id, workspace_id, sequence_id, contact_id, current_step int default 0, status enrollment_status, next_run_at timestamptz, enrolled_at, completed_at`. Unique `(sequence_id, contact_id)`. |
| `suppressions` | `id, workspace_id, email citext, reason suppression_reason, source text, created_at`. Unique `(workspace_id, email)`. **Service-role write.** |
| `send_events` | `id, workspace_id, campaign_id, step_id, enrollment_id, contact_id, email, type send_event_type, url text, token uuid, provider_message_id text, created_at`. Append-only. **Service-role write.** |
| `email_templates` | `id, workspace_id (null = global seed), name, category, thumbnail, body_json jsonb, is_builtin bool, created_at`. |
| `sender_identities` | `id, workspace_id, from_name, from_email citext, reply_to, domain text, spf_ok bool, dkim_ok bool, verified bool, is_default bool, created_at`. Unique `(workspace_id, from_email)`. |

`updated_at` via `set_updated_at()` triggers. Indexes: `email_campaigns (workspace_id,status,created_at desc)`,
`sequence_enrollments (next_run_at) where status='active'`, `send_events (workspace_id,campaign_id,type)`,
`send_events (token)`, `suppressions (workspace_id,email)`.

**RLS (every table, in-file, Gate 8):** standard template — `select is_member` · `insert/update has_role
'staff'` · `delete has_role 'manager'`; **sequences/steps config write = manager+**; **`send_events` +
`suppressions`** = member SELECT + **no client write** (service-role only, D-087); `email_templates` global rows
(`workspace_id is null`) are world-readable, workspace rows scoped. **No `meter_kind` change.**

**Trigger:** `send_events_after_insert` rolls the event into `campaign_stats`/step counters (service-role path),
so stats can't drift from events.

---

## 4. Send pipeline & jobs (Gate 4 headline)

Job types (all `queued`-only from any client; idempotency keys): **`campaign.send`** (fan-out), **`email.deliver`**
(per-batch), **`sms.deliver`** (per-batch), **`sequence.step`** (one step for one enrollment, `run_after`-delayed),
**`campaign.ab_winner`** (4h-delayed). Cron: **`m16-broadcast-dispatch`** (minutely — fire `scheduled` broadcasts
whose `scheduled_at <= now`) and **`m16-sequence-tick`** (hourly reconciliation backstop). Both PGlite-guarded.

1. **Send-now / scheduled** → enqueue `campaign.send` (idem key = campaign id + attempt).
2. **`campaign.send` worker**: resolve audience (`smart_list_eval` / tag join / all) → subtract `suppressions`
   + consent-opt-outs → `meter_check('email', n)`; if `over` and no wallet → mark campaign `failed` with a
   clear reason (Gate 3 failure state), meter nothing. Else write per-recipient `send_events` (type `queued`)
   and enqueue throttled `email.deliver` batches (`run_after` staggered by `throttle_per_min`). A/B: send the
   two sample slices, enqueue `campaign.ab_winner` at `now + 4h`.
3. **`email.deliver` worker**: `_shared/email.ts` → SendGrid REST per recipient with per-recipient link-wrap +
   pixel token + `List-Unsubscribe` header → on success `meter_increment('email',1,'m16',...)` **in the same
   step** + update the recipient `send_events` row to `sent`/`delivered`; a failed provider call bills nothing
   and rides jobs backoff.
4. **`campaign.ab_winner` worker**: compare sample opens → set `ab_winner` → send remainder with the winning subject.
5. **`sequence.step` worker**: load enrollment + step; check exit conditions (goal / unsubscribed / replied) →
   if exit, mark enrollment; else send (email via `_shared/email.ts` + meter `email`; **SMS** via the M12 Twilio
   contract + `consent-check` + A2P + meter `sms`), write `send_events`, advance `current_step`, schedule the
   next `sequence.step` at `run_after = now + next delay`.

---

## 5. Edge Functions

- **`campaigns`** (authed, staff+; standard envelope): `test-send` (to self), `spam-check` (heuristic now /
  provider-hook ready-not-run), `send-now` (authorize → enqueue `campaign.send`).
- **`campaigns-ai-write`** (authed, manager+; **scaffold**, D-063): deterministic subject+body draft, meters
  nothing; body swaps to a real LLM call when a provider is decided.
- **`sendgrid-webhook`** (verify_jwt=false; **Web Crypto ECDSA signature-verified** — SendGrid's Signed Event
  Webhook uses an ECDSA public key over `timestamp + rawBody`, verified against the Vault-stored verification
  key *before* trusting the body; same verify-before-act discipline as the Stripe/Twilio HMAC path):
  delivered/open/click/bounce/complaint/unsub events →
  `send_events` (service role) → `suppressions` on bounce/complaint/unsub → stats via the trigger →
  `emit_trigger(email.*)`. Idempotent on the provider `sg_message_id` + event type.
- **`email-track`** (verify_jwt=false): `?o=<token>` → record open `send_event` + return a 1×1 transparent GIF;
  `?c=<token>&u=<url>` → record click `send_event` + 302 to the original URL. Both fire `emit_trigger` +
  `log_activity`.
- **`email-unsubscribe`** (verify_jwt=false, public): `GET ?token=` → branded confirm page; `POST` → **dual-write**
  `suppressions` (reason `unsub`) + `consent_records` (`email_optin`, granted=false) + an `unsubscribed`
  `send_event`. Also honors one-click `List-Unsubscribe-Post`.

Secrets (SendGrid API key + webhook verification key) live in **Vault** via the M41 naming; tables hold
references only (Gate 7). `config.toml` entries: the three public functions `verify_jwt=false`, `campaigns*`
`verify_jwt=true`.

---

## 6. CRM / triggers / metering wiring

- Every send/open/click/bounce/unsub → `log_activity(ws, contact_id, 'email_'||type, …)` (M09 timeline) +
  `emit_trigger(ws, 'email.'||type, {campaign_id, contact_id, url?})` — **activating M13's pre-registered
  `email.*` trigger stubs** (the M14-for-`appointment.*` move).
- Meter `email`/`sms` in each provider-success step (Gate 3); gate every send with `meter_check` and feature
  gates with `has_feature('campaigns')`.
- No `workspace.provision` seed needed (campaigns aren't provisioned per-workspace); one **global** template
  seed ships in the migration.

---

## 7. Front end (Gate 5 states + Gate 6 themes/responsive/motion)

`frontend/m16-campaigns.html` + `frontend/js/m16-campaigns.js` + `frontend/styles/m16-campaigns.css`. Reuses the
shared shell/component vocabulary (`.shell/.rail/.tbar/.nav-item/.panel/.panel-head/.kpi/.data-row/.table/
.form-grid/.form-field/.modal-scrim/.pop/.pill/.eyebrow/.empty-state/.toast/.mock-note`). CSS load order
tokens → app → components → module. Tokens only (zero raw hex), three fonts (Cormorant / Baskerville /
Shippori Mincho), `.5px` hairlines, mono numerals. **Dark mode = grid + orbs only, NO stars/dots.** Hash router,
mockup/preview-state switcher, anon-key reads via RLS, actions via `functions.invoke`. Routes:

- **`/campaigns`** — list (type / status / audience / stats) + KPI strip (sent / open-rate / click-rate /
  unsub-rate), new-campaign CTA, empty/loading(no-shimmer)/error states.
- **`/campaigns/new` · `/campaigns/:id`** — builder wizard: **audience** (tag / smart-list picker with live
  count minus suppressed/opted-out) → **content** (block email editor with live desktop/mobile preview, or SMS
  composer with segment counter) → **A/B** tab (two subjects, sample %) → **review checklist** (audience count,
  unsub-link present ✓, spam score, from-identity) → **schedule** (now / datetime, tz).
- **`/sequences/:id`** — vertical step-timeline editor (add email/SMS step, delay config, drag reorder via
  SortableJS) with per-step stats + enrollment count + exit-condition config.
- **`/settings/sending`** — domain-auth wizard (SPF/DKIM/CNAME records + verify button [ready-not-run]),
  from-identities CRUD, suppression-list viewer (search + manual add/remove).

Responsive 360 / 768 / 1280 (panels/tables own their overflow; no page h-scroll). `prefers-reduced-motion`
respected. Offline/no-backend: honest mockup preview-state pattern; sample data labelled, never faked-live.

---

## 8. Verification (DoD) — `workers/verify/m16probe.mjs` (real Postgres via PGlite)

Boot: PGlite + auth stub + roles; load `0000,0001,0002,0009,0010(m05),0013,0016` then `0020`; stub
`emit_trigger`/`notify`/`meter_*` recorders where a dep isn't loaded. Assertions:
- Cross-tenant leak on all **9** tables (B cannot select/insert/update/delete A's rows; positive control).
- Role matrix + client ceiling (client can't create campaigns; staff can't delete; manager can; sequences
  config manager+).
- `send_events` + `suppressions` **service-role-only** (client insert/update/delete = 0 rows / denied).
- Audience resolver **excludes suppressed + consent-opted-out** contacts (seed one of each; count is correct).
- Fan-out: `campaign.send` enqueues per-recipient work; browser inserts `queued` only.
- Meter gate: over-quota `meter_check` blocks the send / marks failed (bills nothing).
- A/B winner logic with a time-shifted sample (more opens on B → `ab_winner='B'`).
- Sequence: delay math + exit condition (unsubscribed enrollment doesn't advance).
- Unsubscribe **dual-write** (suppression row + consent opt-out both present).
- Tracking: open/click writes a `send_event` + rolls `campaign_stats` via the trigger; append-only `send_events`.

Wired into `scripts/verify.sh` (new M16 step) + `verify-status.json`. Gate-8 greps clean (dead-stack / secrets /
shimmer / raw-hex / fonts / RLS). Front end verified in the local preview server (both themes, 3 breakpoints,
zero console errors). No-Docker/Deno lives (SendGrid send + webhook + tracking + Twilio SMS) are **ready, not
run** — code-reviewed + PGlite-probed, never faked green.

---

## 9. Honest deferrals (flagged, never faked)

- **AI copywriter** → deterministic scaffold, meters nothing; real LLM when a provider is decided (D-091,
  separate open call from D-011).
- **Domain-auth verify / spam-score API / MJML library** → ready-not-run hooks / direct-compile (D-089/090/085).
- **SendGrid send + event webhook + tracking endpoints + SMS steps** → full contract, PGlite-probed +
  code-reviewed, **not run** (no Deno/creds).
- **Revenue attribution** join → placeholder until M40 reports.
- **Migration `0020`**; the pre-existing `0012` gap + double-`0010` are noted for the human merge, not touched.

---

## 10. New DECISIONS (this session)

- **D-084** D-011 resolved → **SendGrid** (PRD endpoint naming + Twilio consolidation + deliverability).
- **D-085** 7 PRD-only tables (`sequences`, `sequence_steps`, `sequence_enrollments`, `suppressions`,
  `send_events`, `email_templates`, `sender_identities`) ship as logged extensions to canonical §9; MJML
  library deferred — block-JSON compiled to responsive inline-CSS HTML directly.
- **D-086** metering reuses the existing `email` / `sms` `meter_kind` values (no enum churn); PRD `email.sent`/
  `sms.sent` are labels for those meters.
- **D-087** `send_events` + `suppressions` are service-role-written (member SELECT, no client write) — delivery
  history / block-list can't be forged (mirrors M28 `invoice_payments`, D-071).
- **D-088** unsubscribe dual-writes `suppressions` + `consent_records` opt-out so the block list and the M05
  ledger agree.
- **D-089** domain-auth verify (SendGrid) built to contract, ready-not-run.
- **D-090** spam-score = heuristic now + provider-API hook ready-not-run.
- **D-091** AI copywriter scaffolded (D-063 posture); LLM provider undecided, meters nothing.
- **D-092** send pipeline = `campaign.send` fan-out → throttled `email.deliver`/`sms.deliver` batches; drips via
  `run_after`-delayed `sequence.step` jobs (D-061 pattern) + hourly reconciliation cron; SMS steps via the M12
  Twilio contract (consent + A2P + meter `sms`).

*Numbered continuing from M44's D-083; flag parallel-session overlap on merge (house custom).*

---

## 11. Integrations note (Gate 9)

Add a **SendGrid** provider section to INTEGRATIONS-SPEC §8 (first wired this session): API-key auth, Vault field
layout (`api_key`, `webhook_verification_key`), the Mail Send REST surface, the Event Webhook (signed) + the
event→`send_events`/`suppressions` mapping, and the domain-authentication API. D-011 flipped LOCKED in DECISIONS
+ TASKS. This is the first email provider wired platform-wide, so the deferred **M04 digest sender**, **M04
security-notice / M01 invitation emails**, **M12 email channel**, **M14 email reminders**, and **M28 invoice
email** all become wireable follow-ups (each carried on TASKS.md) — but this session wires **only** M16.
