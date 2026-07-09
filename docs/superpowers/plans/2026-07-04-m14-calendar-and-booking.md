# M14 Calendar & Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship M14 Calendar & Booking (Session 12) as a vertical slice to Definition-of-Done: calendars + availability, a timezone/DST-correct slot engine, a no-auth public booking page, reminders as cron-enqueued jobs, reschedule/cancel signed links, Google two-way sync (to contract), and full CRM/automation wiring — everything except live paid bookings (M28 not built) and live email send (D-011 open).

**Architecture:** Locked stack — vanilla HTML/CSS/JS front end + Supabase (Postgres + RLS + Edge Functions + Vault + Realtime + pg_cron + jobs). Slot math is server-authoritative in an Edge Function backed by SQL. Reminders are `jobs` rows swept by an existing `0 * * * *` cron. Bookings publish to M13's `emit_trigger` bus and M09's `log_activity` timeline. Google tokens live in Vault via M41's `resolveCredential`.

**Tech Stack:** PostgreSQL (migration `0017`), Supabase Edge Functions (Deno/TypeScript), pg_cron + `public.jobs`, PGlite verification probe (Node ESM), vanilla HTML/CSS/JS with `tokens.css`/`base.css`/`components.css`.

**Verification model (repo convention, not pytest):** DB/RLS/slot/trigger logic is verified by `workers/verify/m14probe.mjs` run against real Postgres via PGlite; front end by the local preview server; Gate-8 by `scripts/gate8.sh`. "Failing test first" here = write the probe assertion, run it red, implement the SQL/logic, run it green.

**Reference the design spec:** `docs/superpowers/specs/2026-07-04-m14-calendar-and-booking-design.md`.

---

## File structure

**Create:**
- `supabase/migrations/0017_m14_calendar.sql` — enums, 6 tables, RLS, indexes, `set_updated_at` triggers, `compute_slots()`, `pick_round_robin_user()`, booking source-trigger helpers, `workspace.provision` calendar-seed hook.
- `supabase/functions/public-booking/index.ts` — no-auth: config, slots, book, reschedule, cancel.
- `supabase/functions/appointment-remind/index.ts` — reminder send (SMS live / email stubbed).
- `supabase/functions/google-calendar-sync/index.ts` — OAuth connect/callback + freebusy + event CRUD (to contract).
- `supabase/functions/_shared/slots.ts` — the slot algorithm shared by the Edge Fn (mirror of the SQL, single source of the grid rules).
- `workers/verify/m14probe.mjs` — PGlite probe.
- `frontend/m14-calendar-and-booking.html` — authed app (calendars list/editor + team calendar) + public booking demo gallery.
- `frontend/js/m14-calendar.js` — authed app logic + mockup/preview-state.
- `frontend/styles/m14-calendar.css` — per-screen styles (zero raw hex, zero token redeclaration).
- `frontend/book.html` — self-contained public booking page (`?slug=` , `?embed=1`).
- `frontend/js/m14-book.js` — public booking flow logic.

**Modify:**
- `supabase/functions/_shared/permissions.ts` — register `calendar.*` permission keys (D-023 registry).
- `supabase/config.toml` — `[functions.public-booking]` (verify_jwt=false), `[functions.appointment-remind]`, `[functions.google-calendar-sync]`.
- `supabase/functions/_shared/providers.ts` — add the `google` (Google Calendar) provider row.
- `workers/worker.mjs` — add `appointment.remind` job handler (invokes the Edge Fn) + extend `workspace.provision` calendar seed.
- `supabase/seed.sql` — sample calendar + availability + one sample appointment (labelled sample data).
- `scripts/verify.sh` — add the m14 probe step.
- `DATA-SCHEMA-v1_0.md` — implementation note for the calendar slice.
- `DECISIONS-AiMindShare-v1_0.md` — M14 decisions (next free ids).
- `JOBS-AND-WORKERS-SPEC-v1_0.md` — confirm `appointment.remind` handler row is accurate (already pre-listed).
- `INTEGRATIONS-SPEC-v1_0.md` — §8 Google Calendar provider section (first wired).
- `TASKS.md` — Session 12 block + close ritual.

---

## Task 1: Migration `0017` — enums, tables, RLS, indexes

**Files:**
- Create: `supabase/migrations/0017_m14_calendar.sql`
- Reference for patterns: `supabase/migrations/0016_m13_automations.sql` (guarded enums, RLS, PGlite-safety), `0013_m09_crm.sql` (RLS template, `log_activity`).

- [ ] **Step 1: Write the probe skeleton that loads the migration (red).**
  In `workers/verify/m14probe.mjs`, load `0000`–`0017` into PGlite (copy the loader from `m13probe.mjs`/`m09probe.mjs`, stripping `create extension` and guarding `cron.schedule`). Assert the 6 tables exist:
  ```js
  const tables = ['calendars','calendar_availability','calendar_blocks','appointment_questions','appointments','appointment_reminders'];
  for (const t of tables) {
    const { rows } = await pg.query(`select to_regclass('public.${t}') as t`);
    assert(rows[0].t, `table ${t} missing`); pass(`table ${t} exists`);
  }
  ```
- [ ] **Step 2: Run probe — expect FAIL** (`node workers/verify/m14probe.mjs`) with `0017` not found / tables missing.
- [ ] **Step 3: Write the migration head + guarded enums.**
  Header comment block (mirror `0016` style: reconciliation notes, migration-number note "0017; 0000–0016 taken; 0012 gap + double-0010 are pre-existing collisions, no ordering dep", PGlite-safety note). Then:
  ```sql
  do $$ begin create type public.calendar_type as enum ('one_on_one','round_robin','group','class');
  exception when duplicate_object then null; end $$;
  do $$ begin create type public.appt_status as enum ('confirmed','rescheduled','cancelled','completed','no_show');
  exception when duplicate_object then null; end $$;
  ```
- [ ] **Step 4: Create the 6 tables** (exact columns per spec §3). Every FK `on delete cascade` to `workspaces(id)` / `calendars(id)`; `appointments.contact_id references contacts(id) on delete set null`; `assigned_user_id references profiles(id)`. Defaults: `status default 'confirmed'`, `requires_payment default false`, `reschedule_token default gen_random_uuid()`, `cancel_token default gen_random_uuid()`. Add `created_at timestamptz default now()`, `updated_at timestamptz default now()` on `calendars` and `appointments`.
- [ ] **Step 5: Enable RLS + standard policies on all 6 tables** (Gate 2/Gate 8). Pattern per table:
  ```sql
  alter table public.calendars enable row level security;
  create policy calendars_sel on public.calendars for select using ( public.is_member(workspace_id) );
  create policy calendars_ins on public.calendars for insert with check ( public.has_role(workspace_id,'manager') );
  create policy calendars_upd on public.calendars for update using ( public.has_role(workspace_id,'manager') );
  create policy calendars_del on public.calendars for delete using ( public.has_role(workspace_id,'manager') );
  ```
  `calendar_availability`/`calendar_blocks`/`appointment_questions` → same manager+ writes (config). `appointments` → `select` member; `insert/update` `has_role('staff')`; `delete` `has_role('manager')`. `appointment_reminders` → `select` member; **no client insert/update** (service-role/worker writes only, like M12 D-055 — comment it).
- [ ] **Step 6: Indexes + `set_updated_at` triggers** (spec §3): `appointments(workspace_id,calendar_id,starts_at)`, `appointments(reschedule_token)`, `appointments(cancel_token)`, partial `appointment_reminders(scheduled_at) where sent_at is null`, unique `calendars(workspace_id,slug)`. Add `before update` `set_updated_at()` triggers on `calendars` and `appointments`.
- [ ] **Step 7: Run probe — expect PASS** on the table-existence + a new RLS assertion:
  ```js
  // every M14 table has RLS forced
  const { rows } = await pg.query(`select relname from pg_class where relname = any($1) and relrowsecurity`, [tables]);
  assert(rows.length === tables.length, 'all M14 tables have RLS'); pass('RLS enabled on 6 tables');
  ```
- [ ] **Step 8: Commit** (repo is not git-initialised; if `git rev-parse` fails, skip — note in TASKS instead):
  ```bash
  git add supabase/migrations/0017_m14_calendar.sql workers/verify/m14probe.mjs
  git commit -m "feat(m14): calendar schema + RLS (migration 0017)"
  ```

---

## Task 2: Slot engine SQL — `compute_slots()` + round-robin

**Files:**
- Modify: `supabase/migrations/0017_m14_calendar.sql` (append functions)
- Modify: `workers/verify/m14probe.mjs`

- [ ] **Step 1: Write the failing probe for basic slot math.** Seed a calendar (`duration_min=30, buffer_min=0, min_notice_min=0, max_per_day=100, timezone='UTC'`) with availability Mon 09:00–11:00. Assert `compute_slots` returns 4 slots (09:00,09:30,10:00,10:30) for a Monday date:
  ```js
  const { rows } = await pg.query(`select * from public.compute_slots($1,$2,'UTC')`, [calId, '2026-07-06']); // a Monday
  assert(rows.length === 4, `expected 4 slots got ${rows.length}`); pass('basic slot grid');
  ```
- [ ] **Step 2: Run probe — expect FAIL** (`compute_slots` undefined).
- [ ] **Step 3: Implement `compute_slots(p_calendar uuid, p_date date, p_tz text) returns table(slot_start timestamptz, slot_end timestamptz, assigned_user uuid)`** SECURITY DEFINER. Logic:
  1. Read the calendar row (duration, buffer, notice, max_per_day, capacity, type, timezone, round_robin_user_ids).
  2. `dow := extract(dow from p_date)`; for each `calendar_availability` row matching `dow`, build windows: `window_start := (p_date + start_time) at time zone p_tz` (→ timestamptz UTC), same for end. (Using the **target tz** for the local→UTC conversion is what makes DST correct.)
  3. Generate candidate starts stepping by `(duration_min + buffer_min)` minutes while `start + duration <= window_end`.
  4. Drop candidates `< now() + min_notice_min`.
  5. Exclude candidates overlapping any `calendar_blocks` row or any non-cancelled `appointments` row for this calendar (for group/class: only exclude when booked count `>= capacity`).
  6. Enforce `max_per_day` (limit remaining by already-booked count for the date).
  7. `assigned_user` = `pick_round_robin_user(p_calendar)` when `type='round_robin'`, else null (Google freebusy is applied in the Edge Fn layer, which has the token — SQL returns the raw availability; document this boundary in a comment).
- [ ] **Step 4: Implement `pick_round_robin_user(p_calendar uuid) returns uuid`** — from `round_robin_user_ids`, return the user with the fewest upcoming (`starts_at > now()`, status in confirmed/rescheduled) appointments; ties broken by array order.
- [ ] **Step 5: `revoke all ... from public; grant execute ... to authenticated, service_role;`** on both functions.
- [ ] **Step 6: Run probe — expect PASS** on basic grid; then add + pass assertions for: buffer (`buffer_min=15` → fewer slots), notice (`min_notice_min` drops near slots), existing-appointment exclusion, `max_per_day` cap, **DST** (a calendar in `America/New_York` across the 2026-03-08 spring-forward date yields correctly-shifted UTC slots), round-robin least-loaded (seed 2 users, give user A an upcoming appt, assert next slot assigns user B), group capacity (capacity=2 keeps a slot open until 2 booked).
- [ ] **Step 7: Commit** `feat(m14): timezone/DST-correct slot engine + round-robin`.

---

## Task 3: Booking write path — source triggers, timeline/tag, provision seed

**Files:**
- Modify: `supabase/migrations/0017_m14_calendar.sql` (append)
- Modify: `workers/verify/m14probe.mjs`
- Modify: `workers/worker.mjs`

- [ ] **Step 1: Failing probe for the booking RPC.** Assert `book_appointment(...)` inserts an appointment, an "Appointment Booked" tag row, an `activity_log` row, and returns the appointment id:
  ```js
  const { rows } = await pg.query(`select public.book_appointment($1,$2,$3,$4,$5,$6) as id`,
    [ws, calId, contactId, '2026-07-06T09:00:00Z', '2026-07-06T09:30:00Z', 'UTC']);
  const appt = rows[0].id; assert(appt, 'appointment created');
  const tag = await pg.query(`select 1 from public.contact_tags ct join public.tags t on t.id=ct.tag_id
    where ct.contact_id=$1 and t.name='Appointment Booked'`, [contactId]);
  assert(tag.rows.length===1,'auto-tag applied'); pass('booking creates appt + tag + timeline');
  ```
  (Confirm the exact `contact_tags`/`tags` shape against `0013_m09_crm.sql` when implementing.)
- [ ] **Step 2: Run probe — expect FAIL.**
- [ ] **Step 3: Implement `book_appointment(p_ws, p_calendar, p_contact, p_start, p_end, p_tz, p_answers jsonb default '{}', p_assigned uuid default null) returns uuid`** SECURITY DEFINER: insert appointment; upsert the "Appointment Booked" tag + `contact_tags` (create tag if absent, idempotent); `perform public.log_activity(p_ws,p_contact,'appointment.booked','Booked '||..., jsonb_build_object('appointment_id',appt))`; `perform public.emit_trigger(p_ws,'appointment.booked', jsonb_build_object('contact_id',p_contact,'appointment_id',appt,'calendar_id',p_calendar))`; insert the two `appointment_reminders` rows (24h,1h before start) **only if in the future**; return id. (Reminder *job* enqueue happens in the Edge Fn / a companion `enqueue_appointment_reminders(appt)` so the browser never inserts `running`; here insert reminder rows + queued jobs via `public.jobs`.)
- [ ] **Step 4: Implement `set_appointment_status(p_appt uuid, p_status appt_status)`** — updates status; on `cancelled` → cancel pending reminder jobs (`update jobs set status='failed'... where type='appointment.remind' and payload->>'appointment_id'=...` guarded) + `emit_trigger('appointment.cancelled')`; on `no_show` → `emit_trigger('appointment.no_show')`.
- [ ] **Step 5: Implement `reschedule_appointment(p_token uuid, p_start, p_end)`** — validates `reschedule_token` matches + `token_expires_at > now()`; updates times; cancels + re-queues reminders; sets status `rescheduled`; rotates the token (single-purpose).
- [ ] **Step 6: Extend `workspace.provision` calendar seed.** In `workers/worker.mjs`, in the `workspace.provision` handler, after the pipeline seed, insert one default calendar (`type='one_on_one', slug='intro-call', duration_min=30`) + Mon–Fri 09:00–17:00 availability **only when the workspace has none** (idempotent). Mirror the D-052 pipeline-seed guard.
- [ ] **Step 7: Run probe — PASS** on booking + add assertions: cancel fires `appointment.cancelled` (assert a `workflow_executions`/`jobs` side-effect or a spy), reschedule with a bad/expired token is rejected, reschedule rotates the token.
- [ ] **Step 8: Commit** `feat(m14): booking write path — triggers, timeline, auto-tag, provision seed`.

---

## Task 4: Shared slot lib + `public-booking` Edge Function

**Files:**
- Create: `supabase/functions/_shared/slots.ts`
- Create: `supabase/functions/public-booking/index.ts`
- Modify: `supabase/config.toml`
- Reference: `supabase/functions/inbox-send/index.ts` + `_shared/envelope.ts` + `_shared/auth.ts` for the envelope/error/cors pattern; `_shared/integrations.ts` for freebusy read.

- [ ] **Step 1: `_shared/slots.ts`** — export `applyFreebusy(slots, busyIntervals)` and `gridWindows(availability, date, tz, duration, buffer, notice)` mirroring the SQL grid so the Edge Fn can subtract Google freebusy the SQL can't see. Keep the SQL `compute_slots` authoritative for DB-visible constraints; the Edge Fn calls the RPC then subtracts freebusy via this helper.
- [ ] **Step 2: `public-booking/index.ts`** with `verify_jwt=false` (add `[functions.public-booking]\nverify_jwt = false` to `config.toml`). Routes on method + query:
  - `GET ?slug=` → service-role client resolves calendar by slug (only `is_active`), returns public-safe config (name, duration, questions, tz, requires_payment) via the standard envelope.
  - `GET ?slug=&date=&tz=` → call `compute_slots` RPC; if the calendar's workspace has a connected `google` integration, `resolveCredential` → read freebusy → `applyFreebusy`; return slots.
  - `POST` body `{slug, start, end, tz, contact:{name,email,phone}, answers}` → resolve/create contact (reuse M09 upsert-by-email within the workspace), call `book_appointment`; **payment scaffold:** if `requires_payment` is true return `{error:'plan_gated', message:'Paid bookings arrive with M28'}` (the toggle is disabled in UI so this is defensive); push to Google if connected; return `{appointment_id, reschedule_url, cancel_url}`.
  - `GET/POST ?action=reschedule|cancel&token=` → call `reschedule_appointment`/`set_appointment_status`.
- [ ] **Step 3: CORS + envelope.** Reuse `_shared/envelope.ts` `ok()/fail()`; allow public origin for GET/POST (booking is embeddable). Never return service-role data beyond the public-safe fields (Gate 7).
- [ ] **Step 4: Verify (code-review + probe-adjacent).** No live Deno here → add a note in TASKS "ready, not run". Add a probe assertion that the RPCs the Edge Fn calls exist and are `execute`-granted to `service_role`.
- [ ] **Step 5: Commit** `feat(m14): public-booking edge function (no-auth read/book/reschedule/cancel)`.

---

## Task 5: `appointment-remind` Edge Function + worker handler

**Files:**
- Create: `supabase/functions/appointment-remind/index.ts`
- Modify: `supabase/config.toml`, `workers/worker.mjs`
- Reference: `supabase/functions/inbox-send/index.ts` (Twilio send + `meter` increment + `consent.check`).

- [ ] **Step 1: `appointment-remind/index.ts`** — input `{appointment_id, reminder_id, channel}` (service-role). Load appointment + contact. **SMS:** reuse the M12 Twilio send path — `consent.check` first, send, `meter_increment('sms')` **in the success txn** (Gate 3), set `appointment_reminders.sent_at`. **Email:** build the message but **do not send** — mark a stubbed outcome and log "email sender stubbed until D-011" (mirror M04). A failed provider call bills nothing.
- [ ] **Step 2: Worker handler.** In `workers/worker.mjs`, add `case 'appointment.remind':` → invoke the Edge Fn (or inline the same logic in Node for the local harness), mark job done/failed with backoff.
- [ ] **Step 3: config.toml** `[functions.appointment-remind]`.
- [ ] **Step 4: Probe assertion** — booking a future appointment inserts 2 `appointment_reminders` rows + 2 `queued` `appointment.remind` jobs; cancelling removes/fails them; rescheduling re-queues. Run — PASS.
- [ ] **Step 5: Commit** `feat(m14): appointment reminders — cron-enqueued jobs, SMS live / email stubbed`.

---

## Task 6: `google-calendar-sync` Edge Function (to contract)

**Files:**
- Create: `supabase/functions/google-calendar-sync/index.ts`
- Modify: `supabase/config.toml`, `supabase/functions/_shared/providers.ts`
- Reference: `_shared/integrations.ts` (vault naming, `resolveCredential`, `expiringSoon`), `integrations-callback/index.ts`.

- [ ] **Step 1: Add the `google` provider** to `_shared/providers.ts` (auth `oauth2`, scopes `https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly`, token URL, authorize URL).
- [ ] **Step 2: `google-calendar-sync/index.ts`** — actions: `connect` (build Google consent URL, state = workspace+calendar), `callback` (exchange code → tokens → write to Vault under `ws_<uuid>__google[__access_token|__refresh_token|__token_expires_at]`, upsert `integrations` row status `connected`), `freebusy` (POST times → busy intervals), `push` (create/update/delete an event for an appointment, store `google_event_id`). Use `resolveCredential` for reads; refresh via the existing `integration.refresh_token` path when `expiringSoon`.
- [ ] **Step 3: config.toml** `[functions.google-calendar-sync]`.
- [ ] **Step 4:** Mark "ready, not run" in TASKS (no Google creds/Deno here). Code-review against INTEGRATIONS-SPEC Five Vault Laws (no secret to browser; ref-only in table).
- [ ] **Step 5: Commit** `feat(m14): google calendar two-way sync (oauth→vault, freebusy, event push) — to contract`.

---

## Task 7: Authed front end — `m14-calendar-and-booking.html`

**Files:**
- Create: `frontend/m14-calendar-and-booking.html`, `frontend/js/m14-calendar.js`, `frontend/styles/m14-calendar.css`
- Reference: `frontend/m11-pipeline.html` + `frontend/m12-inbox.html` for shell/atmosphere/mockup-mode; AIMINDSHARE-DESIGN §5–§14.

- [ ] **Step 1: Page skeleton** — `<html lang="en" data-theme="light">`, theme-boot inline script (THEME_KEY const), 3-font import + preconnects, link `tokens.css`/`base.css`/`components.css`/`m14-calendar.css`, vendored `supabase-js.min.js`, `icons.js`/`theme.js`/`atmosphere.js`/`reveal.js` patterns. App shell grid (rail nav groups + topbar search/jobs-chip/theme/avatar). **Atmosphere: grid + orbs + radial washes; no `#starField` (no stars/dots in dark per session instruction).**
- [ ] **Step 2: /calendars list + editor** — `.page-head` (eyebrow `MODULE · M14`), calendar cards (glass), and a settings drawer/editor with: weekly **availability grid** (7 days × time rows), date-override/block list, **question builder** (`.data-row` add/remove), reminder config (24h/1h toggles), **Google connect card** (uses `.set-card` pattern), **payment toggle DISABLED with "Available after M28" note**, and the **embed snippet generator** (readonly `<textarea>` with the `<script>`/iframe snippet). All states: empty ("No calendars yet — create one"), loading (pulse), error (inline-msg), success.
- [ ] **Step 3: /calendar team view** — custom CSS-grid **week + month** toggle, filter by user/calendar, appointment `.pill` blocks, appointment **drawer** (detail + status actions attended/no_show + reassign), manual-create modal, **drag-to-reschedule** (pointer events → calls reschedule). Empty/loading/error/success states.
- [ ] **Step 4: `m14-calendar.js`** — supabase-js wiring (calendars CRUD, availability, questions, appointments feed, status/reschedule RPCs); **mockup/preview-state pattern** with `.mock-note` switcher when no backend connected (sample data clearly labelled; no fabricated live numbers). Reveal system + reduced-motion.
- [ ] **Step 5: Verify in preview** — add a `m14-preview` entry to `.claude/launch.json` if needed; `preview_start`, load the page, `preview_console_logs` (zero errors), `preview_snapshot` (structure), `preview_resize` 360/768/1280 + dark. Screenshot for proof.
- [ ] **Step 6: Commit** `feat(m14): authed calendar app — calendars editor + team week/month view`.

---

## Task 8: Public booking page — `book.html` + embed

**Files:**
- Create: `frontend/book.html`, `frontend/js/m14-book.js`
- Reference: AIMINDSHARE-DESIGN §6 (public pages = radial-wash only, no grid/orbs/stars), §8 components.

- [ ] **Step 1: `book.html` skeleton** — self-contained public page, theme-boot, 3 fonts, tokens/base/components + inline minimal booking CSS. **Atmosphere: `--bg` + radial `::before` washes only** (calm/fast; no grid/orbs; no stars in dark). Reads `?slug=` and `?embed=1` (embed = minimal chrome, no footer/brand bar).
- [ ] **Step 2: Booking flow** — step 1 month picker → step 2 slot list (tz-aware, shows contact-local time with a tz selector) → step 3 details form + custom questions → step 4 **inert payment step (scaffold, shown only if requires_payment; otherwise skipped)** → confirm → success screen (appointment summary + add-to-calendar links + reschedule/cancel links). All Gate-5 states incl. "No times available" empty state and a load skeleton.
- [ ] **Step 3: `m14-book.js`** — calls the `public-booking` Edge Fn (config, slots, book) with the anon client (no service role in browser — Gate 7); handles reschedule/cancel token routes (`?action=reschedule&token=`). Mockup mode with labelled sample slots when no backend.
- [ ] **Step 4: Verify in preview** — load `book.html?slug=intro-call`, snapshot the flow, console zero-errors, resize 360/768/1280 + dark, `?embed=1` renders minimal chrome. Screenshot.
- [ ] **Step 5: Commit** `feat(m14): public booking page + embeddable widget`.

---

## Task 9: Wiring, seed, permissions, docs, and DoD close

**Files:**
- Modify: `supabase/functions/_shared/permissions.ts`, `supabase/seed.sql`, `scripts/verify.sh`, `DATA-SCHEMA-v1_0.md`, `DECISIONS-AiMindShare-v1_0.md`, `JOBS-AND-WORKERS-SPEC-v1_0.md`, `INTEGRATIONS-SPEC-v1_0.md`, `TASKS.md`

- [ ] **Step 1: Permissions registry.** Add `calendar.view/manage/book` keys to `_shared/permissions.ts` + extend built-in role arrays (D-023).
- [ ] **Step 2: Seed.** In `supabase/seed.sql` add a sample calendar (`intro-call`, 30-min), Mon–Fri availability, 2 questions, and one sample confirmed appointment — clearly a seed, not in a live path.
- [ ] **Step 3: verify.sh.** Add `node workers/verify/m14probe.mjs` as the m14 step.
- [ ] **Step 4: Run the full probe green.** `node workers/verify/m14probe.mjs` → all assertions PASS (target parity with prior modules, e.g. ~30+ checks). Also run `bash scripts/verify.sh` if the toolchain allows; otherwise note "probe green on Node/PGlite".
- [ ] **Step 5: Gate-8 greps.** Run `bash scripts/gate8.sh` (or the DoD Gate-8 grep block) → zero hits in M14 files (dead stack, secrets, shimmer, raw hex outside tokens.css, 4th font, casings). Fix any hit.
- [ ] **Step 6: Docs.** DATA-SCHEMA calendar implementation note; DECISIONS entries (calendar-render=custom, slot authority=Edge Fn, Google poll-on-read, payment scaffold-gated, email stubbed/SMS live, reschedule/cancel token model, provision calendar seed) with next-free ids checked against parallel sessions; JOBS spec `appointment.remind` handler confirmed; INTEGRATIONS-SPEC §8 Google Calendar section; `pg_cron` registry unchanged (already lists the reminder cron).
- [ ] **Step 7: TASKS.md Session 12 block** — checked boxes, carry-overs (live Google/Deno/hosted run; paid bookings→M28; email send→D-011; M13 TASKS-section merge-reconcile flag), DECISIONS added, and the close ritual line `Gates: 1 ✅ 2 ✅ 3 ✅ 4 ✅ 5 ✅ 6 ✅ 7 ✅ 8 ✅ 9 ✅`.
- [ ] **Step 8: Commit** `chore(m14): wiring, seed, permissions, docs, Session 12 close`.

---

## Self-review (run against the spec)

**Spec coverage:** calendars/types → Task 1; availability/blocks/questions → Task 1; slot engine + tz/DST + round-robin + group capacity → Task 2; booking write path + CRM/trigger/timeline/tag + provision seed → Task 3; public booking Edge Fn (config/slots/book/reschedule/cancel) → Task 4; reminders (cron jobs, SMS live/email stubbed, consent, meter) → Task 5; Google two-way sync to contract → Task 6; authed calendars editor + team calendar → Task 7; public booking page + embed → Task 8; permissions/seed/verify/docs/DoD close → Task 9. Payment scaffold gated-off appears in Task 1 (column), Task 4 (defensive gate), Task 7 (disabled toggle), Task 8 (inert step). No spec section is unmapped.

**Placeholder scan:** no "TBD/TODO"; each step names exact files, the non-obvious SQL/TS logic, and a run/expected verification. Repetitive UI references the established component library (§8) and the two reference modules deliberately (repo convention: don't transcribe boilerplate), while all non-obvious logic (slot algorithm, RLS matrix, token model, trigger wiring) is specified.

**Type/name consistency:** function names used consistently across tasks — `compute_slots`, `pick_round_robin_user`, `book_appointment`, `set_appointment_status`, `reschedule_appointment`, `enqueue_appointment_reminders`; Edge Fns `public-booking`/`appointment-remind`/`google-calendar-sync`; probe `m14probe.mjs`. Enum values match spec (`calendar_type`, `appt_status`).
