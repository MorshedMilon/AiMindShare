# M15 — Forms & Surveys · Design Spec
**Session 16 · Phase 2 (Acquisition & Sites) · 2026-07-04**
**Status:** draft (awaiting design review)

> Attach list for this session: Constitution (CLAUDE-AiMindShare) · DECISIONS · DATA-SCHEMA (§ forms
> slice) · RLS-AND-SECURITY · PRD_M15 · BUILD-SEQUENCE (Session 16) · DEFINITION-OF-DONE · TASKS.md ·
> AIMINDSHARE-DESIGN (design system). Stack is locked: vanilla HTML/CSS/JS + Supabase (Postgres + RLS +
> Edge Functions + Vault + Realtime + pg_cron + jobs). No Next.js / Prisma / BullMQ / React / Zod / dnd-kit.

---

## 0. Dependency & blocker check (done before design)

**Ready (all dependencies Done in TASKS.md):**
- **M09 CRM** (`0013_m09_crm.sql`): `log_activity()` = `timeline.add()` (D-048, append-only), `contacts`
  (upsert-by-email/phone spine), `contact_tags`, `custom_fields` + `contact_custom_values`,
  `contacts.owner_id` (round-robin target). The acquisition layer writes straight into this spine.
- **M13 Automations** (`0016_m13_automations.sql`): `emit_trigger(ws, type, payload)` bus is live and
  already registers **`form.submitted` as an honest stub source** (D-062, per Session 11 close). SECURITY
  DEFINER, callable by authenticated + service_role, re-entry guard + `_depth` backstop. **M15 fires it live.**
- **M05 Compliance** (`0010_m05_compliance.sql`): `consent_records` append-only ledger (insert = any member,
  no update/delete, D-041); `evidence` jsonb holds the **exact consent text** (D-037). The consent checkbox
  writes here. `consent-record` Edge Fn + `consent-check` gate exist.
- **M04 Notifications** (`0011_m04_notifications.sql`): `notify()` emit RPC — submission notification.
- **M11 Pipeline** (`0014_m11_pipeline.sql`): `deals` + `move_deal_stage`; routing "add as deal" wiring.
- **Public-page precedents:** `public-booking` (M14) + `public-invoice` (M28) — no-JWT Edge Fn + service-role
  write + `public_token` model + radial-wash-only calm page. M15's public renderer follows this exactly.
- **Vendored `SortableJS`** (`frontend/vendor/sortable.min.js`, M11 D-025) — the builder palette→canvas DnD.

**Flags (surfaced, decisions taken):**
1. **M06 Media Library is NOT built.** The `file_upload` field type is part of the builder. **Decision:
   scaffold gated-OFF** — the field renders in the palette and on the public form, but the upload control is
   disabled with an "available after M06" note and no live Storage write. Mirrors the M14 payment-scaffold
   precedent (schema/UI now, provider later). No mock in the live path.
2. **D-011 (email provider) OPEN.** **Double opt-in** (confirm email before consent is recorded) needs an
   email send. **Decision:** submission is held `pending_confirmation`, the confirm-link + token are built and
   the confirm endpoint works end-to-end, but the confirmation **email send is stubbed** (like M04 digest /
   M12 email / M14 confirmations). Single opt-in (the default) records consent immediately and is fully live.
3. **Turnstile (CAPTCHA) needs a Cloudflare account key** (D-009 hosting is OPEN). **Decision:** honeypot +
   time-trap spam checks are **fully live and server-side**; the optional Turnstile toggle is scaffolded (UI
   toggle + server verify stub keyed off a Vault secret when present). No spam gate depends on an external key.
4. **Parallel-build numbering.** Current max migration is `0019_m44_admin`; the DECISIONS *file* body reaches
   D-077 but M14 reserved D-064–069 and M44 reserved D-078–083 (not yet merged). **Decision:** claim migration
   **`0020`** and DECISIONS **D-084+**, both **re-verified at write time** (repo convention; the `0012` gap and
   any double-numbers are pre-existing, not touched here).
5. **Environment:** no Docker/CLI/Deno/hosted Supabase on this machine. Everything is built to full contract
   and verified via a **PGlite probe + code review** ("ready, not run") — same as every prior session.

**Scope decision (user-approved):** the **full PRD_M15 surface** — builder (all field types, jsonb schema,
Zod-equivalent runtime validator), all three types (standard / multi-step / survey / scored quiz), conditional
logic (fields + steps), popups & embeds (inline / iframe / popup / slide-in with trigger engine + frequency
cap), full submission pipeline, routing rules, analytics funnel (views/starts/completions + per-step drop-off),
and A/B variants — **minus** the three external-dependency scaffolds above (file upload, opt-in email, Turnstile).

---

## 1. Architecture overview

New artifacts:
- **1 migration** `0020_m15_forms.sql` — 3 tables + 2 enums + RLS + the `submit_form()` pipeline RPC +
  analytics rollup fn + `form.submitted` source-trigger wiring + `provision` starter-form seed.
- **Edge Functions:** `public-form` (no-JWT: definition read + submit + view/step track + confirm-opt-in),
  `forms-export` (authed submissions CSV, `requirePermission`).
- **Jobs/cron:** no new heavy job type required for the core (submission pipeline is synchronous inside the
  Edge Fn + definer RPC, like a booking); an optional `m15-form-analytics-rollup` daily `pg_cron` is **not**
  needed — analytics compute on read from `form_views`/`form_submissions`. (No timer in the browser.)
- **Front end:** `frontend/m15-forms-and-surveys.html` (authed app: list + builder + results), a self-contained
  **public form renderer** (`/f/[token]`, `?embed=1`) + **`embed.js`** (inline/popup/slide-in trigger engine),
  `frontend/js/m15-forms.js` (authed app), `frontend/js/m15-form-render.js` (public renderer + validator +
  logic engine, shared by standalone and embed), `frontend/styles/m15-forms.css`. Tokens/base/components only;
  zero raw hex; three fonts.

---

## 2. Design choices (with rejected alternatives)

**a) Submission authority — service-role Edge Fn + SECURITY DEFINER `submit_form()` RPC (CHOSEN) vs. browser
writes.** The public form is no-auth, so the browser must never insert `contacts` / `consent_records` /
`form_submissions`. All of it runs server-side in `public-form` → one atomic `submit_form()` definer RPC.
Spam checks, contact upsert, consent write, routing, and trigger emit happen where the anon user can't tamper.
`form_submissions` + `form_views` are **service-role INSERT only** (the M12-notes / M28-ledger posture) — the
browser never writes a row. Trade-off: one more RPC, but it's the only RLS-safe design.

**b) Builder DnD — vendored SortableJS (CHOSEN) vs. dnd-kit / new lib.** PRD says "dnd-kit"; that's React.
SortableJS is already vendored (M11 kanban) and is the repo's canonical DnD. Palette→canvas reorder + field
insert use it. No new dependency.

**c) Runtime field validation — a hand-written validator generated from `fields_json` (CHOSEN) vs. Zod.** Zod is
dead-stack (no bundler, vanilla JS). `js/m15-form-render.js` builds a validation function from the field
descriptors (required / type / pattern / min-max / email-phone) and the **server re-validates the same rules in
`submit_form()`** — client validation is UX, server validation is truth (never trust the browser).

**d) Conditional logic authority — evaluated client-side for UX, re-checked server-side (CHOSEN).** The logic
engine (show/hide fields + steps from prior answers) runs in the renderer for live UX; `submit_form()` ignores
answers to fields that logic would have hidden, so a tampered payload can't inject hidden-field values.

**e) Analytics — compute-on-read from `form_views` + `form_submissions` (CHOSEN) vs. maintained counters.**
Views/starts/completions + per-step drop-off + A/B conversion are aggregates over two append-only tables. No
denormalized counter to drift; the results page runs grouped queries (RLS-scoped). Volumes are modest per form.

**f) A/B assignment — sticky per-visitor via the `view` call (CHOSEN).** On first `view`, the Edge Fn assigns a
variant by `ab_split` and returns it; the renderer persists it in `localStorage` so the visitor always sees the
same variant, and the submission records `variant` for the conversion comparison.

---

## 3. Data model — `0020_m15_forms.sql`

Enums (guarded, PGlite-safe): `form_type ∈ form | survey | quiz`;
`form_status ∈ draft | published | archived`.

Every table: standard RLS template — `select using is_member(workspace_id)`, config writes gated by `has_role`
(forms: staff+ create/edit, **manager+ delete**, client write-ceiling). Each `create table` paired with
`enable row level security` + ≥1 policy (Gate 8). **`form_submissions` and `form_views` INSERT is service-role
only** (public traffic is written by `public-form` under the service role — no anon table write); staff+ SELECT.

| Table | Key columns |
|---|---|
| `forms` | `id, workspace_id, name, type form_type, status form_status default 'draft', fields_json jsonb, logic_json jsonb, settings_json jsonb (design + spam + popup triggers + double_optin + quiz tiers), routing_json jsonb, variant_of_id uuid null (A/B self-FK), ab_split int default 50, public_token uuid default gen_random_uuid() unique, published_at, created_at, updated_at`. Index `(workspace_id, status)`, unique `(public_token)`. |
| `form_submissions` | `id, form_id, workspace_id, contact_id null, answers_json jsonb, score int null, result_tier text null, utm_json jsonb, ip_hash text (sha256(ip+salt) — never raw IP, Gate 7), variant text null, status text default 'complete' (complete | pending_confirmation), confirm_token uuid null, created_at`. Index `(form_id, created_at)`. |
| `form_views` | `id, form_id, workspace_id, visitor_id text, variant text null, step int null, event text (view | start | complete), created_at`. Index `(form_id, created_at)`, `(form_id, event)`. |

`updated_at` via `set_updated_at()` trigger on `forms`. No raw IP is stored anywhere — `ip_hash` only, for
rate-limit/dedup, salted from a Vault secret (Gate 7); this is one of the D-084+ entries.

---

## 4. Submission pipeline (core correctness surface) — `submit_form()`

`submit_form(form_token, answers, utm, visitor_id, variant, spam_meta)` — SECURITY DEFINER, invoked only by the
`public-form` Edge Fn under the service role. Steps, atomic:

1. **Resolve form** by `public_token`; reject if not `published`.
2. **Spam gate (server-side):** honeypot field must be empty; time-trap = elapsed since `start` ≥ threshold;
   (Turnstile token verified if a Vault key is present — scaffold otherwise). Fail → typed `spam_rejected`.
3. **Server re-validation:** rebuild the validator from `fields_json`; **drop answers to logic-hidden fields**;
   enforce required/type/pattern. Fail → typed `validation_failed` with field errors.
4. **Quiz scoring:** if `type = quiz`, sum per-answer points → resolve `result_tier` from `settings_json.tiers`
   (tier → redirect/message).
5. **Contact upsert (M09):** match by email then phone; create-or-update; map fields → contact fields + custom
   fields per the builder's `map_to`. (Survey "anonymous mode" skips contact creation — `contact_id` null.)
6. **Consent (M05):** if a consent field is checked, write a `consent_records` row with the **exact stored
   consent text** in `evidence` (D-037). **Double opt-in:** hold submission `pending_confirmation`, set
   `confirm_token`, defer the consent write until the confirm endpoint is hit (email send stubbed, D-011).
7. **Source & UTM tags:** add the form's source tag + UTM-derived tags to the contact (`contact_tags`).
8. **Routing (`routing_json`):** assign owner (round-robin least-recently-assigned option), add configured
   tags, **create a pipeline deal (M11)** with value mapping, resolve redirect-URL / thank-you message.
9. **`emit_trigger(ws, 'form.submitted', {form_id, contact_id, submission_id, answers})`** — fires M13's
   pre-registered stub live.
10. **`log_activity()`** timeline entry (M09) + **`notify()`** (M04).
11. Insert the `form_submissions` row (service role). Return `{status, result_tier?, redirect?, message?}`.

Acceptance: create-or-update dedupe works incl. custom fields; consent writes exact text; quiz score→tier
resolves; logic-hidden answers are dropped; routing produces owner/tags/deal; `form.submitted` enrols a workflow.

---

## 5. Edge Functions

- **`public-form`** (no JWT; standard envelope):
  - `GET ?token=` → public form definition (safe fields only: `fields_json`, `logic_json`, `settings_json`
    design/steps, `type`; **never** `routing_json` or internal mapping). Assigns + returns A/B `variant`.
  - `POST view` → insert `form_views` (`view|start|complete` + `step`) under service role; sticky variant.
  - `POST submit` → call `submit_form()` (the §4 pipeline); return redirect/message/tier.
  - `GET confirm?token=` → double opt-in: flip `pending_confirmation` → `complete`, write the deferred consent
    record, run the rest of the pipeline (tags/routing/trigger). (Email that delivers this link is stubbed.)
- **`forms-export`** (JWT; `requirePermission('crm.export')` — reuse the M09 export permission, submissions are
  contact data): CSV of a form's submissions. Mirrors `crm-export`; STAFF without the grant → 403.

`config.toml`: `public-form` `verify_jwt=false`; `forms-export` `verify_jwt=true`.

---

## 6. Public renderer + `embed.js` (Gate 5/6 on public pages)

- **`frontend/f.html` + `js/m15-form-render.js`** — standalone `/f/[token]` render from the definition:
  field renderer for every type, the runtime validator, the conditional-logic engine, multi-step progress +
  per-step validation + `view` step tracking, quiz result tiers. **Radial-wash atmosphere only** (no grid /
  orbs / stars) per DESIGN §6 — public pages built *by* the platform stay calm and fast. `?embed=1` = minimal
  chrome for iframe.
- **`frontend/embed.js`** — the single script a customer pastes. Modes: **inline** (mount into a target div),
  **iframe**, **popup**, **slide-in**. Trigger engine: **delay** / **scroll %** / **exit-intent**; **frequency
  cap** via `localStorage` (per form + per visitor). Loads the form via `public-form`, posts `view`/`submit`.
  No framework; ~1 self-contained file.

The design tab in the builder writes `settings_json.design` (button text, colors chosen **from tokens**, layout)
so the public render stays inside the token system (zero raw hex; three fonts).

---

## 7. Front-end authed app (Gate 5 states + Gate 6 themes/responsive/motion)

`frontend/m15-forms-and-surveys.html` + `js/m15-forms.js` + `styles/m15-forms.css`. App shell (rail + topbar +
jobs-chip), hash-routed. All screens ship default / empty / loading (opacity-pulse, **no shimmer**) / error
(envelope codes → human copy) / success + a `.mock-note` preview-state switcher. Light default + dark sibling.
Responsive 360 / 768 / 1280 (no page h-scroll; canvas/tables own overflow). `prefers-reduced-motion` respected.
Tokens only; three fonts; `.5px` hairlines; mono numerals. **No stars/dots in dark background** (session rule).

- **/forms** — list with conversion stats (KPI strip: total forms, submissions 30d, avg conversion; `.data-row`
  list per form with type pill, status pill, views/subs/rate in mono, quick actions). Empty state honest.
- **/forms/[id]/edit** — the **builder**: left **palette** (field types incl. scaffolded file-upload), center
  **canvas** (SortableJS reorder + multi-step organizer with per-step grouping), right **field settings** panel
  (label, placeholder, required, validation, map-to contact/custom field, consent text). Top tabs: **Build ·
  Logic · Routing · Design**. Logic tab = condition rows (if answer → show/hide field/step). Routing tab =
  owner/round-robin, tags, add-as-deal + value map, redirect/thank-you. Design tab = token-bound colors + button
  text + form type + double-opt-in toggle + spam toggles. A/B: "create variant B" + split slider.
- **/forms/[id]/results** — submissions table (paginated, `.data-row`, CSV export via `forms-export`) +
  **analytics** (funnel: views → starts → completions + rate; per-step drop-off bars for multi-step; submissions
  over time line chart via Chart.js D-005) + **A/B comparison** (variant A vs B conversion). Empty state honest.

Offline/no-backend: honest mockup/preview-state pattern; sample data labelled; never fabricated live numbers.

---

## 8. Triggers, provision & CRM wiring

- Submission success path calls `log_activity()` (timeline), adds source/UTM `contact_tags`, optionally creates
  an M11 `deal`, and `emit_trigger(ws, 'form.submitted', {...})` — **activating M13's pre-registered stub**
  (the deferred M15 source from Session 11).
- Extend the **`workspace.provision`** worker handler (D-020 lineage) to seed **one starter "Contact Us" form**
  per new workspace (idempotent) — parallels the pipeline/calendar seeds.

---

## 9. Honest deferrals (flagged, never faked)

- **File-upload field** → palette + render present, upload control disabled ("available after M06"); no live
  Storage write. Wire when **M06** lands.
- **Double opt-in email** → confirm token + endpoint fully live; the email that carries the link is **stubbed**
  until **D-011**. Single opt-in is fully live.
- **Turnstile** → honeypot + time-trap live server-side; Turnstile verify is a Vault-keyed scaffold (no CAPTCHA
  key on this machine; D-009 hosting open).
- **Environment** → Edge Fns + renderer built to full contract, PGlite-probed + code-reviewed, **not run** (no
  Docker/CLI/Deno). Migration **`0020`**; DECISIONS **D-084+**; both re-verified at write time.

---

## 10. Verification (DoD)

`workers/verify/m15probe.mjs` (real Postgres via PGlite):
- cross-tenant leak on all 3 tables (B cannot read/write A's forms/submissions/views);
- RLS write-role matrix (staff create/edit, **manager+ delete**, client write-ceiling);
- **`form_submissions` + `form_views` service-role INSERT only** (browser/anon blocked);
- `submit_form()`: contact upsert dedupe by email then phone (incl. custom-field map); consent row written with
  **exact text**; quiz score→tier; **logic-hidden answers dropped** (tamper guard); routing → owner + tags +
  deal; `emit_trigger('form.submitted')` enrols a workflow → `automation.execute` job;
- honeypot + time-trap reject; double-opt-in holds `pending_confirmation` then confirm completes + writes
  consent; A/B split assignment sticky; analytics funnel rollup math (views/starts/completions + per-step).

Wired into `scripts/verify.sh` after M13/M14. No regressions (full suite green). Gate-8 greps clean (dead-stack /
secrets / shimmer / raw-hex / fonts / RLS). Front end verified in the local preview server (both themes, 3
breakpoints, zero console errors; builder DnD + logic/routing tabs + results charts).

**DECISIONS to add this session (D-084+, re-verified for parallel overlap at write time):** submission authority
= service-role Edge Fn + `submit_form()` definer RPC; `form_submissions`/`form_views` service-role-insert-only;
hand-written validator + server re-validation (Zod dropped); logic-hidden answers dropped server-side; analytics
compute-on-read; A/B sticky-per-visitor via `view`; file-upload scaffolded (M06); double-opt-in email stubbed
(D-011); Turnstile Vault-keyed scaffold; `ip_hash` not raw IP; provision starter-form seed.

---

## 11. Gate map (DoD)

- **Gate 1** (tenant isolation) — leak probe on all 3 tables; service-role-insert posture.
- **Gate 2** (authz) — staff/manager/client matrix server-side via RLS + `forms-export` permission; public
  read exposes safe fields only (no `routing_json`).
- **Gate 3** (billing) — **no billable action in M15 core** (forms aren't metered; a form that *sends* email via
  M13 meters in that module's path). Stated explicitly.
- **Gate 4** (async) — submission is a synchronous Edge-Fn + definer RPC (like a booking); browser never writes
  submissions/views; `form.submitted` enrols M13 workflows that run as `automation.execute` jobs; no browser timer.
- **Gate 5** (states) — every screen default/empty/loading/error/success + preview switcher.
- **Gate 6** (design) — light+dark, responsive 360/768/1280 no page h-scroll, reduced-motion, tokens-only, 3
  fonts, `.5px` hairlines, mono numerals, **dark = no stars**; public page = radial-wash only.
- **Gate 7** (secrets) — anon key only in browser; submissions via service-role Edge Fn; no raw IP stored; any
  Turnstile/salt secret in Vault.
- **Gate 8** (greps clean) · **Gate 9** (DATA-SCHEMA + DECISIONS + JOBS + config + seed + verify + TASKS updated).
