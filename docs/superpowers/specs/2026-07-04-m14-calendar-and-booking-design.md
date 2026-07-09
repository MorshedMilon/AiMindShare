# M14 — Calendar & Booking · Design Spec
**Session 12 · Phase 1 (Foundation + Core CRM) · 2026-07-04**
**Status:** approved (design review passed 2026-07-04)

> Attach list for this session: Constitution (CLAUDE-AiMindShare) · DECISIONS · DATA-SCHEMA (§ calendar
> slice) · RLS-AND-SECURITY · PRD_M14 · BUILD-SEQUENCE (Session 12) · DEFINITION-OF-DONE · TASKS.md ·
> AIMINDSHARE-DESIGN (design system). Stack is locked: vanilla HTML/CSS/JS + Supabase (Postgres + RLS +
> Edge Functions + Vault + Realtime + pg_cron + jobs). No Next.js / Prisma / BullMQ / React.

---

## 0. Dependency & blocker check (done before design)

**Ready:**
- **M09 CRM** (`0013_m09_crm.sql`): `log_activity()` = `timeline.add()` (D-048, append-only), `contact_tags`,
  `contacts`. CRM wiring hooks present.
- **M13 Automations** (`0016_m13_automations.sql`): `emit_trigger(ws, type, payload)` bus is live and already
  registers `appointment.booked/cancelled/no_show` **as honest stubs** for M14 to fire (D-055). SECURITY
  DEFINER, callable by authenticated + service_role, `_depth` cascade backstop, re-entry guard.
- **M41 Vault** (`0010_m41_integrations.sql` + `_shared/integrations.ts`): `resolveCredential()`, deterministic
  Vault naming (`ws_<uuid>__<provider>[__<field>]`), OAuth refresh via jobs+cron, typed
  `NotConnectedError`/`NeedsReauthError`. INTEGRATIONS-SPEC: "live Google at M12/M14" → **M14 makes the generic
  OAuth flow concrete for Google Calendar.**
- **JOBS-AND-WORKERS-SPEC** already pre-registers M14: cron `0 * * * *` → `appointment.remind`; job type
  `appointment.remind` (Edge Fn, sms/email); `workspace.provision` calendar seed **deferred to M14** (Law 9,
  D-020).

**Flags (surfaced, decisions taken):**
1. **M28 Payments is NOT built** (it is Session 13, *after* this). Paid bookings depend on M28's PaymentIntent.
   This session's accept-when excludes paid bookings. **Decision: scaffold payment gated-OFF** — ship the
   `appointments.payment_intent_id` column + a per-calendar "requires payment" toggle disabled with an
   "available after M28" note + an inert booking-page payment step; wire live Stripe when M28 lands. Mirrors the
   M12-email precedent (schema now, provider later). No mock in the live path.
2. **M13's TASKS.md Session-11 section is missing** (built in a parallel session, not logged). The *contract*
   M14 needs (`emit_trigger`) is present and correct. **Merge-reconcile flag for the human**, not a blocker.
3. **D-011 (email provider) OPEN.** Booking confirmation/reminder **emails are enqueued but sender-stubbed**
   (like M04 digest, M12 email); **SMS reminders go live** through M12's Twilio path. Established honest pattern.
4. **Environment:** no Docker/CLI/Deno/hosted Supabase/Google creds on this machine. **Google two-way sync is
   built to full contract but "ready, not run"**, verified via a PGlite probe + code review — same as every
   prior session. Migration is **`0017`** (the `0012` gap and double-`0010` are pre-existing collisions, not
   touched here).

**Scope decision:** full PRD_M14 surface (all 4 calendar types, availability + overrides + blocks, tz-aware
slot engine, public booking page, Google two-way sync to contract, reminders, reschedule/cancel signed links,
team calendar, embed widget) **minus** live paid bookings.

---

## 1. Architecture overview

New artifacts:
- **1 migration** `0017_m14_calendar.sql` — 6 tables + 2 enums + RLS + slot-helper SQL + source-trigger/provision
  wiring.
- **Edge Functions:** `public-booking` (no-auth read + book + reschedule/cancel), `appointment-remind`
  (reminder send), `google-calendar-sync` (OAuth connect/callback + freebusy read + event push).
- **Jobs/cron:** `appointment.remind` job type; the already-registered `0 * * * *` reminder cron pass.
- **Front end:** `frontend/m14-calendar-and-booking.html` (authed app: calendars list/editor + team calendar),
  a self-contained **public booking page** (`/book/[slug]`, `?embed=1`), `frontend/js/m14-calendar.js`,
  `frontend/styles/m14-calendar.css`. Tokens/base/components only; zero raw hex; three fonts.

---

## 2. Design choices (with rejected alternatives)

**a) Team calendar rendering — custom CSS-grid (CHOSEN) vs. FullCalendar.**
Design doc allows "FullCalendar or custom." Custom week/month grid built from the design DNA (glass-light wells,
`.pill` status, appointment drawer, drag-to-reschedule). FullCalendar is a heavy dependency with a competing
visual language; the repo vendors libs only where irreplaceable (Drawflow, Sortable). Trade-off: hand-write the
grid + drag interaction.

**b) Slot computation authority — Edge Function is source of truth (CHOSEN).**
Public booking is no-auth, so slot math runs server-side in `public-booking` (only the server can safely read
other appointments, blocks, Google freebusy). The authed availability preview calls the same function. One
algorithm, one place. No client-side slot calc (never show a slot the server would reject).

**c) Google refresh — poll-on-read + 5-min freebusy cache (CHOSEN) vs. push channels.**
Freebusy read live at slot-compute time, cached 5 min (PRD). Bookings push to Google immediately on write.
Google *watch* push-channels deferred (extra infra; "ready, not run" regardless).

---

## 3. Data model — `0017_m14_calendar.sql`

Enums (guarded, PGlite-safe): `calendar_type ∈ one_on_one | round_robin | group | class`;
`appt_status ∈ confirmed | rescheduled | cancelled | completed | no_show`.

Every table: standard RLS template — `select using is_member(workspace_id)`, writes gated by `has_role`
(calendars config = manager+; appointments = staff+; client write-ceiling). Each `create table` paired with
`enable row level security` + ≥1 policy (Gate 8). `appointments` INSERT from the browser is **staff+ only**;
public bookings are written by the `public-booking` Edge Fn under the service role (no anon table write).

| Table | Key columns |
|---|---|
| `calendars` | `id, workspace_id, name, type calendar_type, slug text, color, duration_min, buffer_min, min_notice_min, max_per_day, timezone, requires_payment bool default false, round_robin_user_ids uuid[], capacity int, settings jsonb, is_active bool, created_at, updated_at`. Unique `(workspace_id, slug)`. |
| `calendar_availability` | `id, workspace_id, calendar_id, day_of_week int (0–6), start_time time, end_time time`. |
| `calendar_blocks` | `id, workspace_id, calendar_id, starts_at timestamptz, ends_at timestamptz, reason text`. |
| `appointment_questions` | `id, workspace_id, calendar_id, label, type text, required bool, sort_order int`. |
| `appointments` | `id, workspace_id, calendar_id, contact_id, assigned_user_id, starts_at timestamptz, ends_at timestamptz, status appt_status, timezone text, answers jsonb, google_event_id text, payment_intent_id text (SCAFFOLD, unused), reschedule_token uuid, cancel_token uuid, token_expires_at timestamptz, created_at, updated_at`. |
| `appointment_reminders` | `id, workspace_id, appointment_id, channel text (sms|email), scheduled_at timestamptz, sent_at timestamptz, job_id uuid`. |

`updated_at` via `set_updated_at()` triggers. Indexes: `appointments (workspace_id, calendar_id, starts_at)`,
`appointments (reschedule_token)`, `appointments (cancel_token)`, `appointment_reminders (scheduled_at) where
sent_at is null`.

---

## 4. Slot engine (core correctness surface)

`compute_slots(calendar_id, target_date, tz)` — SECURITY DEFINER SQL fn, mirrored in the Edge Fn:
1. Expand weekly `calendar_availability` rows for `target_date` **in the target tz** → candidate windows,
   converted to UTC (per-date expansion is what makes it DST-correct).
2. Subtract `calendar_blocks`, existing non-cancelled `appointments`, and **Google freebusy** (cached 5 min).
3. Grid by `duration_min` + `buffer_min`; drop slots inside `min_notice_min`; cap the day at `max_per_day`.
4. **round_robin:** assign the `round_robin_user_ids` member with the fewest upcoming appointments (least-loaded).
   **group/class:** a slot stays open until `capacity` bookings exist.
5. Return UTC slot list; browser renders in the contact's tz. **Storage UTC, display tz-local.**

Acceptance: correct across timezones + DST; Google busy respected; round-robin distributes by least upcoming
load; group respects capacity.

---

## 5. Edge Functions

- **`public-booking`** (no JWT; standard envelope):
  - `GET ?slug=` → public calendar config (name, duration, questions, tz, requires_payment flag).
  - `GET ?slug=&date=&tz=` → available slots (via slot engine).
  - `POST book` → resolve/create contact, insert appointment (service role), enqueue reminder rows+jobs, fire
    `emit_trigger('appointment.booked')` + `log_activity()` + "Appointment Booked" tag, push to Google (if
    connected). Payment step is inert scaffold (returns `confirmed` directly; when M28 lands, gate on
    PaymentIntent success before confirming).
  - `GET/POST reschedule|cancel?token=` → single-purpose, expiring `reschedule_token`/`cancel_token`; reschedule
    re-queues reminders + updates Google event; cancel cancels reminders + fires `appointment.cancelled` +
    deletes Google event.
- **`appointment-remind`** (worker-invoked per `appointment.remind` job): send **SMS live via M12 Twilio path
  (meter `sms` in the success txn, `consent.check` before send — Gate 3)**; **email enqueued-but-stubbed until
  D-011**. Mark `appointment_reminders.sent_at`.
- **`google-calendar-sync`**: OAuth connect (scopes `calendar.events` + `calendar.readonly`) + callback →
  tokens to **Vault** via existing naming/`resolveCredential`; freebusy read; event create/update/delete.
  **Built to contract, "ready, not run."**

---

## 6. Jobs & lifecycle (Gate 4)

- On booking: insert `appointment_reminders` (24h + 1h, configurable) + enqueue `appointment.remind` jobs
  (idempotency key per reminder id).
- Existing `0 * * * *` cron sweeps due reminders (enqueue only; cron never does the work).
- **Reschedule** cancels pending reminder jobs/rows + re-queues at new times. **Cancel** cancels them.
- **No-show** marking → `emit_trigger('appointment.no_show')` (rebook workflow). **Cancel** →
  `emit_trigger('appointment.cancelled')`.
- Browser inserts `queued` only; heavy/async work never blocks page JS.

---

## 7. CRM, triggers & provision wiring

- Booking success path calls `log_activity()` (timeline), inserts the **"Appointment Booked"** `contact_tags`
  row, and `emit_trigger(ws, 'appointment.booked', {contact_id, appointment_id, calendar_id})` — activating
  M13's pre-registered stubs. Same for `cancelled` / `no_show`.
- Extend the deferred **`workspace.provision`** worker handler (D-020) to seed one default calendar per new
  workspace (idempotent).

---

## 8. Front-end screens (Gate 5 states + Gate 6 themes/responsive/motion)

All screens ship default / empty / loading (pulse, **no shimmer**) / error (envelope codes → human copy) /
success. Light default + dark sibling. Responsive 360 / 768 / 1280 (no page h-scroll; grids own their
overflow). `prefers-reduced-motion` respected. Tokens only; three fonts; `.5px` hairlines; mono numerals.
**No stars/dots in the dark-mode background** (per session instruction) — app pages keep grid + orbs + radial
washes; the public page uses radial washes only (calm/fast).

- **/calendars** — list + settings editor: weekly availability grid, date overrides/blocks, question builder,
  reminder config, Google connect card, **payment toggle disabled ("Available after M28")**, embed-snippet
  generator.
- **/calendar** — team week/month view, filters (user/calendar), appointment drawer, manual create,
  drag-to-reschedule.
- **/book/[slug]** — public flow: month picker → slots → details + custom questions → confirm → success
  (add-to-calendar + reschedule/cancel links). **Inert payment step (scaffold).** `?embed=1` = minimal chrome.

Offline/no-backend: honest mockup/preview-state pattern with a `.mock-note` switcher (never fabricated live
numbers; sample data labelled).

---

## 9. Honest deferrals (flagged, never faked)

- **Paid bookings** → schema column + gated-off UI; live Stripe when **M28** lands.
- **Email** confirmations/reminders → enqueued, sender stubbed until **D-011**; **SMS live**.
- **Google sync** → full contract, PGlite-probed + code-reviewed, **not run** (no creds/Docker/Deno).
- **Migration `0017`**; M13 missing TASKS section noted for human merge-reconcile.

---

## 10. Verification (DoD)

`workers/verify/m14probe.mjs` (real Postgres via PGlite): cross-tenant leak on all 6 tables; RLS write-role
matrix; slot math (tz/DST/buffer/notice/max-per-day); round-robin least-loaded; group capacity; reminder
queue→cancel→re-queue; reschedule/cancel token single-purpose + expiry; booking fires trigger + timeline +
"Appointment Booked" tag. Wired into `scripts/verify.sh`. Gate-8 greps clean. Front end verified in the local
preview server (both themes, 3 breakpoints, zero console errors).

**DECISIONS to add this session:** the M14 reconciliations (calendar-render = custom; slot authority = Edge Fn;
Google poll-on-read; payment scaffold-gated; email stubbed/SMS live; reschedule/cancel token model; provision
calendar seed). Numbered continuing from the last used id, checked for parallel-session overlap.

---

## 11. New provider registry / integrations note

Add a **Google Calendar** provider section to INTEGRATIONS-SPEC §8 (first wired this session): OAuth2, scopes,
Vault field layout (`access_token` / `refresh_token` / `token_expires_at`), freebusy + events API surface,
health ping. Per Gate 9 (INTEGRATIONS-SPEC updated the week a provider is first wired).
