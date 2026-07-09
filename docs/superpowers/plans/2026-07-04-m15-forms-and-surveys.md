# M15 Forms & Surveys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship M15 Forms & Surveys (Session 16) as a vertical slice to Definition-of-Done: a drag-drop form builder (jsonb schema, all field types, conditional logic, multi-step, scored quiz), popups/embeds with a trigger engine, a no-auth public renderer, a server-authoritative submission pipeline (contact upsert + exact-text consent + source tags + routing + `form.submitted` trigger), analytics funnel, and A/B variants — everything except file-upload (M06 not built), double-opt-in email send (D-011 open), and a live Turnstile key (D-009 open), which ship as honest scaffolds.

**Architecture:** Locked stack — vanilla HTML/CSS/JS front end + Supabase (Postgres + RLS + Edge Functions + Vault + Realtime + pg_cron + jobs). The public form is no-auth, so **all writes run server-side**: `public-form` (verify_jwt=false) calls one SECURITY DEFINER `submit_form()` RPC that does spam checks, contact upsert (M09), consent (M05), routing (M11 deal), and fires M13's `emit_trigger('form.submitted')`. `form_submissions`/`form_views` are **service-role-INSERT-only** (the M12-notes / M28-ledger posture). Builder DnD reuses the vendored SortableJS (M11). Analytics compute on read.

**Tech Stack:** PostgreSQL (migration `0020`), Supabase Edge Functions (Deno/TypeScript), `public.jobs` (M13 workflows run as `automation.execute`), PGlite verification probe (Node ESM), vanilla HTML/CSS/JS with `tokens.css`/`base.css`/`components.css` + vendored `sortable.min.js`, Chart.js (D-005) for the funnel.

**Verification model (repo convention, not pytest):** DB/RLS/pipeline/logic is verified by `workers/verify/m15probe.mjs` run against real Postgres via PGlite; front end by the local preview server; Gate-8 by `scripts/gate8.sh`. "Failing test first" here = write the probe assertion, run it red, implement the SQL/logic, run it green.

**Reference the design spec:** `docs/superpowers/specs/2026-07-04-m15-forms-and-surveys-design.md`.

**Numbering (re-verify at write time — parallel sessions):** migration `0020` (max on disk is `0019_m44_admin`); DECISIONS `D-084+` (M28 body reaches D-077; M14 reserved D-064–069, M44 reserved D-078–083, not yet merged). If a number is taken on merge, bump and flag in TASKS — content is independent of the collision.

---

## File structure

**Create:**
- `supabase/migrations/0020_m15_forms.sql` — 2 enums, 3 tables, RLS, indexes, `set_updated_at` trigger, `submit_form()` pipeline RPC, `form_confirm_optin()`, `form_analytics()` rollup, `form.submitted` wiring.
- `supabase/functions/public-form/index.ts` — no-auth: definition read, view/step track, submit, opt-in confirm.
- `supabase/functions/forms-export/index.ts` — authed submissions CSV (`requirePermission`).
- `supabase/functions/_shared/formValidator.ts` — the validator + logic-eval mirror shared by the Edge Fn (and structurally mirrored in the browser renderer).
- `workers/verify/m15probe.mjs` — PGlite probe.
- `frontend/m15-forms-and-surveys.html` — authed app (list + builder + results).
- `frontend/js/m15-forms.js` — authed app logic + mockup/preview-state.
- `frontend/styles/m15-forms.css` — per-screen styles (zero raw hex, zero token redeclaration).
- `frontend/f.html` — self-contained public form renderer (`?token=`, `?embed=1`).
- `frontend/js/m15-form-render.js` — public renderer: field render + validator + logic engine + multi-step + quiz tiers (shared by `f.html` and the iframe).
- `frontend/embed.js` — the pasteable embed script (inline/iframe/popup/slide-in + trigger engine + frequency cap).

**Modify:**
- `supabase/functions/_shared/permissions.ts` — register `forms.*` permission keys (D-023 registry) + browser mirror `frontend/js/permissions.js`.
- `supabase/config.toml` — `[functions.public-form]` (verify_jwt=false), `[functions.forms-export]` (verify_jwt=true).
- `workers/worker.mjs` — extend `workspace.provision` with a starter "Contact Us" form seed (idempotent).
- `supabase/seed.sql` — sample published form + a few submissions + views (labelled sample data).
- `scripts/verify.sh` — add the m15 probe step.
- `DATA-SCHEMA-v1_0.md` — implementation note for the forms slice.
- `DECISIONS-AiMindShare-v1_0.md` — M15 decisions (D-084+, re-verified).
- `JOBS-AND-WORKERS-SPEC-v1_0.md` — note the deferred `form.submitted` source is now live (no new job type).
- `TASKS.md` — Session 16 block + close ritual.

---

## Task 1: Migration `0020` — enums, tables, RLS, indexes

**Files:**
- Create: `supabase/migrations/0020_m15_forms.sql`
- Create: `workers/verify/m15probe.mjs`
- Reference for patterns: `supabase/migrations/0016_m13_automations.sql` (guarded enums, PGlite-safety), `0015_m12_inbox.sql` (service-role-insert-only posture, D-055), `0013_m09_crm.sql` (RLS template, `log_activity`, `contacts`/`contact_tags`/`custom_fields`).

- [ ] **Step 1: Write the probe skeleton that loads the migration (red).**
  In `workers/verify/m15probe.mjs`, load `0000`–`0020` into PGlite (copy the loader from `m13probe.mjs`/`m14probe.mjs`, stripping `create extension` and guarding `cron.schedule`). Assert the 3 tables exist:
  ```js
  const tables = ['forms','form_submissions','form_views'];
  for (const t of tables) {
    const { rows } = await pg.query(`select to_regclass('public.${t}') as t`);
    assert(rows[0].t, `table ${t} missing`); pass(`table ${t} exists`);
  }
  ```
- [ ] **Step 2: Run probe — expect FAIL** (`node workers/verify/m15probe.mjs`) with `0020` not found / tables missing.
- [ ] **Step 3: Write the migration head + guarded enums.**
  Header comment block (mirror `0016` style: reconciliation notes — PRD Prisma/Zod/dnd-kit dropped; migration-number note "0020; 0000–0019 taken; 0012 gap + double-0010 are pre-existing collisions, no ordering dep"; PGlite-safety note). Then:
  ```sql
  do $$ begin create type public.form_type as enum ('form','survey','quiz');
  exception when duplicate_object then null; end $$;
  do $$ begin create type public.form_status as enum ('draft','published','archived');
  exception when duplicate_object then null; end $$;
  ```
- [ ] **Step 4: Create the 3 tables** (exact columns per spec §3). Key points:
  ```sql
  create table public.forms (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    name text not null,
    type public.form_type not null default 'form',
    status public.form_status not null default 'draft',
    fields_json jsonb not null default '[]'::jsonb,
    logic_json jsonb not null default '[]'::jsonb,
    settings_json jsonb not null default '{}'::jsonb,
    routing_json jsonb not null default '{}'::jsonb,
    variant_of_id uuid references public.forms(id) on delete set null,
    ab_split int not null default 50,
    public_token uuid not null default gen_random_uuid(),
    published_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.form_submissions (
    id uuid primary key default gen_random_uuid(),
    form_id uuid not null references public.forms(id) on delete cascade,
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    contact_id uuid references public.contacts(id) on delete set null,
    answers_json jsonb not null default '{}'::jsonb,
    score int, result_tier text,
    utm_json jsonb not null default '{}'::jsonb,
    ip_hash text, variant text,
    status text not null default 'complete',   -- complete | pending_confirmation
    confirm_token uuid,
    created_at timestamptz not null default now()
  );
  create table public.form_views (
    id uuid primary key default gen_random_uuid(),
    form_id uuid not null references public.forms(id) on delete cascade,
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    visitor_id text not null, variant text, step int,
    event text not null default 'view',        -- view | start | complete
    created_at timestamptz not null default now()
  );
  ```
- [ ] **Step 5: Enable RLS + policies on all 3 tables** (Gate 2/Gate 8).
  ```sql
  alter table public.forms enable row level security;
  create policy forms_sel on public.forms for select using ( public.is_member(workspace_id) );
  create policy forms_ins on public.forms for insert with check ( public.has_role(workspace_id,'staff') );
  create policy forms_upd on public.forms for update using ( public.has_role(workspace_id,'staff') );
  create policy forms_del on public.forms for delete using ( public.has_role(workspace_id,'manager') );

  alter table public.form_submissions enable row level security;
  create policy fsub_sel on public.form_submissions for select using ( public.is_member(workspace_id) );
  -- NO insert/update/delete policy for authenticated: submissions are written by public-form under the
  -- service role only (service_role bypasses RLS). Mirrors M12 messages/notes posture (D-055).

  alter table public.form_views enable row level security;
  create policy fview_sel on public.form_views for select using ( public.is_member(workspace_id) );
  -- likewise service-role INSERT only.
  ```
- [ ] **Step 6: Indexes + `set_updated_at` trigger.** `unique (public_token)`, `forms(workspace_id,status)`, `form_submissions(form_id,created_at)`, `form_views(form_id,created_at)`, `form_views(form_id,event)`. Add `before update` `set_updated_at()` trigger on `forms`.
- [ ] **Step 7: Run probe — expect PASS** on table-existence + an RLS assertion:
  ```js
  const { rows } = await pg.query(`select relname from pg_class where relname = any($1) and relrowsecurity`, [tables]);
  assert(rows.length === tables.length, 'all M15 tables have RLS'); pass('RLS enabled on 3 tables');
  ```
- [ ] **Step 8: Add the service-role-insert-only assertion (red→green).** As an authenticated non-service member, attempt `insert into form_submissions` / `form_views` → expect 0 rows / RLS error; as service_role → succeeds. (Copy the role-switch helper from `m12probe.mjs`.)
- [ ] **Step 9: Commit** (repo not git-initialised on this machine; if `git rev-parse` fails, skip the commit and note it in TASKS):
  ```bash
  git add supabase/migrations/0020_m15_forms.sql workers/verify/m15probe.mjs
  git commit -m "feat(m15): forms schema + RLS + service-role-insert posture (migration 0020)"
  ```

---

## Task 2: Submission pipeline — `submit_form()` RPC

**Files:**
- Modify: `supabase/migrations/0020_m15_forms.sql` (append functions)
- Modify: `workers/verify/m15probe.mjs`
- Reference: `0013_m09_crm.sql` (`log_activity`, contacts upsert-by-email shape, `contact_tags`/`tags`, `custom_fields`/`contact_custom_values`), `0010_m05_compliance.sql` (`consent_records` columns + `evidence`), `0016_m13_automations.sql` (`emit_trigger`), `0014_m11_pipeline.sql` (`deals` insert shape), `0011_m04_notifications.sql` (`notify`).

- [ ] **Step 1: Failing probe for the happy-path pipeline.** Seed a published `form` with a name field (`map_to:'name'`), an email field (`map_to:'email'`), and a consent field (`consent_text:'I agree to be contacted.'`). Call the RPC and assert a contact was upserted, a consent row with exact text written, a source tag added, and a submission row created:
  ```js
  const { rows } = await pg.query(
    `select public.submit_form($1,$2,$3,$4,$5,$6) as r`,
    [token, JSON.stringify({name:'Sam Lee',email:'sam@ex.com',consent:true}), '{}', 'vis-1', null, '{}']);
  const r = rows[0].r;                     // jsonb result
  assert(r.status === 'complete', 'submission complete');
  const c = await pg.query(`select id from public.contacts where email='sam@ex.com' and workspace_id=$1`,[ws]);
  assert(c.rows.length===1,'contact upserted');
  const cr = await pg.query(`select evidence from public.consent_records where contact_id=$1`,[c.rows[0].id]);
  assert(cr.rows[0].evidence->>'text'==='I agree to be contacted.','exact consent text stored');
  pass('pipeline: contact + consent + submission');
  ```
- [ ] **Step 2: Run probe — expect FAIL** (`submit_form` undefined).
- [ ] **Step 3: Implement `submit_form(p_token uuid, p_answers jsonb, p_utm jsonb, p_visitor text, p_variant text, p_spam jsonb) returns jsonb`** SECURITY DEFINER. Steps in order (spec §4):
  1. Resolve `forms` row by `public_token`; if `status <> 'published'` → `raise exception 'form_not_published'`.
  2. **Spam:** honeypot = any answer keyed by the form's honeypot field name must be null/empty; time-trap = `(p_spam->>'elapsed_ms')::int >= coalesce((settings_json->'spam'->>'min_ms')::int, 1500)`. Fail → `return jsonb_build_object('status','spam_rejected')`.
  3. **Server re-validation + logic drop:** for each field in `fields_json`, compute visibility from `logic_json` against `p_answers`; **delete answers to hidden fields**; enforce `required`/`type` (email regex, phone digits, number). Collect errors; if any → `return jsonb_build_object('status','validation_failed','errors',...)`.
  4. **Quiz:** if `type='quiz'`, sum `settings_json.scoring` points per answer → `v_score`; resolve `v_tier` from `settings_json.tiers` band; capture tier `redirect`/`message`.
  5. **Contact upsert (M09):** if not survey-anonymous, `insert into contacts (workspace_id,email,phone,name,...) ... on conflict (workspace_id, lower(email)) do update ...` (match the exact unique index in `0013`; fall back to phone match). Map `map_to` fields → contact columns; unknown `map_to` → `contact_custom_values` upsert.
  6. **Consent (M05):** if a consent field is checked, `insert into consent_records (workspace_id, contact_id, kind, status, source, evidence) values (..., 'marketing','opt_in','form', jsonb_build_object('text', <field consent_text>, 'form_id', id))`. **Double opt-in:** if `settings_json->>'double_optin' = 'true'`, set submission `status='pending_confirmation'` + `confirm_token`, and **defer** the consent insert to `form_confirm_optin()`.
  7. **Tags:** add the form's source tag + each `p_utm` UTM value as a `contact_tags` row (create `tags` as needed, idempotent).
  8. **Routing (`routing_json`):** if `assign_owner` → set `contacts.owner_id` (round-robin: least-recently-assigned member of `routing_json.round_robin_ids`); add `routing_json.tags`; if `create_deal` → `insert into deals (...)` with `value` from the mapped field; capture `redirect`/`thank_you`.
  9. `perform public.emit_trigger(v_ws, 'form.submitted', jsonb_build_object('form_id',id,'contact_id',v_contact,'submission_id',v_sub,'answers',p_answers));`
  10. `perform public.log_activity(v_ws, v_contact, 'form.submitted', v_form_name||' submitted', jsonb_build_object('form_id',id));` + `perform public.notify(v_ws, jsonb_build_object('role','staff'), 'form.submitted', 'New form submission', v_form_name, jsonb_build_object('link','/forms/'||id||'/results'));`
  11. `insert into form_submissions (...) returning id into v_sub;` Return `jsonb_build_object('status', v_status, 'result_tier', v_tier, 'redirect', v_redirect, 'message', v_message)`.
- [ ] **Step 4: `revoke all on function public.submit_form(...) from public; grant execute ... to service_role;`** (only the Edge Fn calls it; not `authenticated`).
- [ ] **Step 5: Run probe — PASS** on happy path, then add + pass assertions for: **dedupe** (submitting the same email twice updates, not duplicates, the contact); **custom-field map** (an unknown `map_to` writes `contact_custom_values`); **quiz** score→tier (points sum to the expected tier + message); **logic-hidden drop** (an answer to a field hidden by logic is absent from the stored `answers_json`); **honeypot** (a filled honeypot → `spam_rejected`, no contact created); **time-trap** (`elapsed_ms` below threshold → `spam_rejected`); **routing** (owner set + deal created with mapped value); **trigger** (`form.submitted` enrols a matching workflow → a `workflow_executions` row + a `queued` `automation.execute` job).
- [ ] **Step 6: Commit** `feat(m15): submit_form pipeline — spam, validate, upsert, consent, routing, trigger`.

---

## Task 3: Double-opt-in confirm, analytics rollup, A/B, provision seed

**Files:**
- Modify: `supabase/migrations/0020_m15_forms.sql` (append), `workers/verify/m15probe.mjs`, `workers/worker.mjs`

- [ ] **Step 1: Failing probe for double opt-in.** With a form whose `settings_json.double_optin=true`, `submit_form` returns `status='pending_confirmation'` and **no** consent row yet; then `form_confirm_optin(confirm_token)` flips the submission to `complete` and writes the consent row:
  ```js
  const r = (await pg.query(`select public.submit_form($1,$2,'{}','v2',null,'{}') as r`,[token2, subJson])).rows[0].r;
  assert(r.status==='pending_confirmation','held for opt-in');
  const tok = (await pg.query(`select confirm_token from public.form_submissions order by created_at desc limit 1`)).rows[0].confirm_token;
  await pg.query(`select public.form_confirm_optin($1)`,[tok]);
  const cr = await pg.query(`select 1 from public.consent_records where contact_id=$1`,[contactId2]);
  assert(cr.rows.length===1,'consent written on confirm'); pass('double opt-in confirm');
  ```
- [ ] **Step 2: Run — FAIL.** Implement `form_confirm_optin(p_token uuid) returns jsonb` SECURITY DEFINER (service_role): find submission by `confirm_token` + `status='pending_confirmation'`, write the deferred `consent_records` row (exact text from the form), run the deferred tags/routing/trigger tail, set `status='complete'`, null the token. Idempotent (already-complete → no-op). Run — PASS.
- [ ] **Step 3: Failing probe for analytics rollup.** Seed `form_views` (`view`×10, `start`×6, `complete`×4) and 4 submissions; assert `form_analytics(form_id)` returns `{views:10, starts:6, completions:4, submissions:4, conversion:0.4}` and per-step drop-off for a multi-step form:
  ```js
  const a = (await pg.query(`select public.form_analytics($1) as a`,[formId])).rows[0].a;
  assert(a.views===10 && a.starts===6 && a.completions===4, 'funnel counts'); pass('analytics rollup');
  ```
- [ ] **Step 4: Run — FAIL.** Implement `form_analytics(p_form uuid) returns jsonb` (STABLE, `is_member` guard): grouped counts over `form_views.event` + `form_submissions`, `conversion = completions::numeric/nullif(views,0)`, per-step object `{step: count}` from `form_views` where `event='start'` grouped by `step`, and A/B `{variant: {views,submissions}}`. Run — PASS.
- [ ] **Step 5: A/B assignment probe.** Assert an `assign_form_variant(p_form, p_visitor)` (or inline in the Edge Fn) returns a stable variant respecting `ab_split` for a form with a `variant_of_id` sibling; same visitor → same variant. Implement + PASS. (If kept in the Edge Fn instead of SQL, assert the split math in a small Node unit instead and note it.)
- [ ] **Step 6: Provision starter-form seed.** In `workers/worker.mjs` `workspace.provision` handler, after the calendar seed, insert one **published** starter "Contact Us" form (name/email/message fields + a marketing consent field) **only when the workspace has none** (idempotent). Mirror the D-052 pipeline-seed guard.
- [ ] **Step 7: Commit** `feat(m15): opt-in confirm, analytics rollup, A/B split, provision starter form`.

---

## Task 4: Shared validator + `public-form` Edge Function

**Files:**
- Create: `supabase/functions/_shared/formValidator.ts`, `supabase/functions/public-form/index.ts`
- Modify: `supabase/config.toml`
- Reference: `supabase/functions/public-booking/index.ts` + `public-invoice/index.ts` (no-JWT public pattern, service-role client, public-safe field selection), `_shared/envelope.ts`/`_shared/auth.ts`.

- [ ] **Step 1: `_shared/formValidator.ts`** — export `validate(fields, answers)` (required/type/pattern → `{ok, errors}`) and `visibleFields(fields, logic, answers)` (returns the field set after applying show/hide logic). This is the TS mirror of the SQL rules; the browser renderer (`m15-form-render.js`) mirrors it structurally for UX. Keep the SQL `submit_form` authoritative.
- [ ] **Step 2: `public-form/index.ts`** with `verify_jwt=false` (add `[functions.public-form]\nverify_jwt = false` to `config.toml`). Service-role client. Routes on method + `?action=`:
  - `GET ?token=` → resolve `forms` by `public_token` where `status='published'`; return **public-safe** fields only: `type`, `fields_json`, `logic_json`, `settings_json.design`/`steps`/`spam`(only `min_ms` + honeypot field name), `name`. **Never** return `routing_json` or field `map_to` targets (Gate 7). Assign + return A/B `variant`.
  - `POST ?action=view` body `{token, visitor, variant, event, step}` → `insert into form_views` (service role).
  - `POST ?action=submit` body `{token, answers, utm, visitor, variant, spam:{elapsed_ms, turnstile?}}` → if a Turnstile secret exists in Vault, verify `turnstile` (scaffold: skip when absent); call `submit_form`; return `{status, result_tier?, redirect?, message?, errors?}`.
  - `GET ?action=confirm&token=` → call `form_confirm_optin`; return a small HTML confirmation page (or JSON for embed).
- [ ] **Step 3: CORS + envelope.** Reuse `_shared/envelope.ts` `ok()/fail()`; allow public origin (forms are embeddable). Map `spam_rejected`/`validation_failed` to non-leaky messages.
- [ ] **Step 4: Verify (code-review + probe-adjacent).** No live Deno here → note "ready, not run" in TASKS. Add a probe assertion that `submit_form`/`form_confirm_optin`/`form_analytics` are `execute`-granted to `service_role` and **not** to `authenticated`.
- [ ] **Step 5: Commit** `feat(m15): public-form edge function (no-auth definition/view/submit/confirm) + validator`.

---

## Task 5: `forms-export` Edge Function

**Files:**
- Create: `supabase/functions/forms-export/index.ts`
- Modify: `supabase/config.toml`
- Reference: `supabase/functions/crm-export/index.ts` (permission gate + CSV shape).

- [ ] **Step 1: `forms-export/index.ts`** `verify_jwt=true` — auth → caller-scoped client → `requirePermission('crm.export')` (submissions are contact data; reuse the M09 export grant). Query `form_submissions` for the form (RLS-scoped), flatten `answers_json` to columns, stream CSV. STAFF without the grant → 403.
- [ ] **Step 2: config.toml** `[functions.forms-export]`.
- [ ] **Step 3: Probe assertion** — a STAFF role is blocked from `crm.export` (reuse the m09/m02 permission assertion shape); a manager with the grant passes. Run — PASS.
- [ ] **Step 4: Commit** `feat(m15): forms-export edge function (permission-gated submissions CSV)`.

---

## Task 6: Authed front end — `m15-forms-and-surveys.html` (list + builder + results)

**Files:**
- Create: `frontend/m15-forms-and-surveys.html`, `frontend/js/m15-forms.js`, `frontend/styles/m15-forms.css`
- Reference: `frontend/m13-automations.html` (canvas/palette + SortableJS/Drawflow patterns, tabs), `frontend/m11-pipeline.html` (SortableJS, drawer), `frontend/m28-payments-and-invoicing.html` (editor with live preview, results tables + charts); AIMINDSHARE-DESIGN §5–§14.

- [ ] **Step 1: Page skeleton** — `<html lang="en" data-theme="light">`, theme-boot inline (THEME_KEY const), 3-font import + preconnects, link `tokens.css`/`base.css`/`components.css`/`m15-forms.css`, vendored `supabase-js.min.js` + `vendor/sortable.min.js`, `icons.js`/`theme.js`/`atmosphere.js`/`reveal.js`. App shell grid (rail nav groups + topbar search/jobs-chip/theme/avatar). **Atmosphere: grid + orbs + radial washes; no `#starField` (no stars/dots in dark per session instruction).**
- [ ] **Step 2: /forms list** — `.page-head` (eyebrow `MODULE · M15`), KPI strip (total forms, submissions 30d, avg conversion — mono), `.data-row` list per form (serif title, `type`/`status` `.pill`s, views/subs/rate in mono, quick actions edit/results/duplicate/archive). Empty state honest ("No forms yet — create your first form"). New-form modal (name + type). All Gate-5 states.
- [ ] **Step 3: /forms/[id]/edit builder** — three-column layout: left **palette** (field-type buttons incl. **file-upload disabled with "after M06" tag**), center **canvas** (SortableJS reorder + a multi-step organizer that groups fields under step headers), right **field-settings** panel (label, placeholder, required, validation, `map_to` select of contact/custom fields, consent-text textarea for the consent field). Top tabs **Build · Logic · Routing · Design**:
  - **Logic** = condition rows (`if <field> <op> <value> then show/hide <field|step>`), add/remove rows.
  - **Routing** = owner select + round-robin toggle, add-tags input, add-as-deal toggle + value-field map + pipeline/stage select, redirect-URL / thank-you-message.
  - **Design** = form type, colors chosen from **token swatches only**, button text, double-opt-in toggle, spam toggles (honeypot on by default, time-trap ms, Turnstile toggle **disabled "needs key"**), A/B "create variant B" + split slider.
  Save writes `fields_json`/`logic_json`/`routing_json`/`settings_json` via supabase-js. Publish sets `status='published'` + surfaces the embed snippet + `/f/<token>` link.
- [ ] **Step 4: /forms/[id]/results** — submissions table (`.data-row`, paginated, CSV export button → `forms-export`), **analytics** (funnel: views→starts→completions + rate; per-step drop-off bars for multi-step; submissions-over-time line via Chart.js) reading `form_analytics`, and **A/B comparison** (variant A vs B conversion cards). Empty state ("No submissions yet — share your form").
- [ ] **Step 5: `m15-forms.js`** — supabase-js wiring (forms CRUD, publish, analytics read, submissions list); the builder state model (fields array ↔ canvas ↔ settings panel); **mockup/preview-state pattern** with `.mock-note` switcher when no backend (sample forms/submissions clearly labelled; no fabricated live numbers). Reveal system + reduced-motion.
- [ ] **Step 6: Verify in preview** — add a `m15-preview` entry to `.claude/launch.json` if needed; `preview_start`, load the page, `preview_console_logs` (zero errors), `preview_snapshot` (structure), exercise the builder DnD + tab switches + results charts, `preview_resize` 360/768/1280 + dark. Screenshot for proof.
- [ ] **Step 7: Commit** `feat(m15): authed forms app — list + drag-drop builder + results analytics`.

---

## Task 7: Public renderer `f.html` + `m15-form-render.js` + `embed.js`

**Files:**
- Create: `frontend/f.html`, `frontend/js/m15-form-render.js`, `frontend/embed.js`
- Reference: `frontend/book.html` (public page = radial-wash only, no grid/orbs/stars), AIMINDSHARE-DESIGN §6/§8.

- [ ] **Step 1: `f.html` skeleton** — self-contained public page, theme-boot, 3 fonts, tokens/base/components + inline minimal form CSS. **Atmosphere: `--bg` + radial `::before` washes only** (no grid/orbs; no stars in dark). Reads `?token=` and `?embed=1` (embed = minimal chrome). Loads the anon client (no service role in browser — Gate 7).
- [ ] **Step 2: `m15-form-render.js`** — fetch the definition from `public-form`; render every field type from `fields_json` into a native `<form>`; the **runtime validator** (mirror of `_shared/formValidator.ts`) for inline errors; the **conditional-logic engine** (show/hide fields+steps live from answers); **multi-step** progress bar + per-step validation + posts `view` (`start`/`step`/`complete`); **quiz** result-tier screen. On submit: post `?action=submit` with `spam.elapsed_ms` (time since load) + honeypot; handle `redirect`/`message`/`validation_failed`/`spam_rejected`/`pending_confirmation` (show "check your email to confirm"). File-upload field renders **disabled** with the "after M06" note.
- [ ] **Step 3: `embed.js`** — the single pasteable script. Reads `data-form="<token>"` + `data-mode="inline|popup|slidein|iframe"` from its `<script>` tag. **inline** mounts the renderer into a target div; **iframe** injects `f.html?token=&embed=1`; **popup/slidein** build a container + a **trigger engine** (`data-trigger="delay:5000|scroll:50|exit"`) and a **frequency cap** via `localStorage` (`aims_form_<token>_seen`, respect `data-frequency-days`). Posts `view` on show. Self-contained, no framework, zero raw hex.
- [ ] **Step 4: Verify in preview** — load `f.html?token=<seed token>`, snapshot the flow (multi-step + a quiz), console zero-errors, resize 360/768/1280 + dark, `?embed=1` minimal chrome; load a tiny host page that includes `embed.js` in popup mode and confirm the trigger + frequency cap fire. Screenshot.
- [ ] **Step 5: Commit** `feat(m15): public form renderer + embed.js (inline/popup/slide-in trigger engine)`.

---

## Task 8: Wiring, seed, permissions, docs, and DoD close

**Files:**
- Modify: `supabase/functions/_shared/permissions.ts` + `frontend/js/permissions.js`, `supabase/seed.sql`, `scripts/verify.sh`, `DATA-SCHEMA-v1_0.md`, `DECISIONS-AiMindShare-v1_0.md`, `JOBS-AND-WORKERS-SPEC-v1_0.md`, `TASKS.md`

- [ ] **Step 1: Permissions registry.** Add `forms.view/manage/export` keys to `_shared/permissions.ts` + extend built-in role arrays (D-023); mirror into `frontend/js/permissions.js` (drift-guarded). (Export reuses `crm.export`; `forms.export` optional alias — pick one and keep the probe consistent.)
- [ ] **Step 2: Seed.** In `supabase/seed.sql` add one **published** sample form for Acme (name/email/message + consent), ~4 `form_submissions` (one via a contact that already exists → dedupe demo), and ~10 `form_views` across `view/start/complete` — clearly seed data, not a live path.
- [ ] **Step 3: verify.sh.** Add `node workers/verify/m15probe.mjs` as the m15 step.
- [ ] **Step 4: Run the full probe green.** `node workers/verify/m15probe.mjs` → all assertions PASS (target parity with prior modules, ~35+ checks). Re-run the whole suite via `bash scripts/verify.sh` if the toolchain allows; otherwise note "probe green on Node/PGlite; no regressions in the modules the probe loads".
- [ ] **Step 5: Gate-8 greps.** Run `bash scripts/gate8.sh` → zero hits in M15 files (dead stack: prisma/zod/dnd-kit/bullmq; secrets; shimmer sweep; raw hex outside tokens.css; 4th font; `AIMindShare` miscasings). Watch the builder/renderer for a `sk-`/`shimmer` substring false-positive (rename like M09's `task-`→`todo-` if it trips). Fix any hit.
- [ ] **Step 6: Docs.** DATA-SCHEMA forms implementation note (the 3 tables + service-role posture); DECISIONS entries **D-084+** (submission authority = service-role Edge Fn + `submit_form` definer RPC; `form_submissions`/`form_views` service-role-insert-only; hand-written validator + server re-validation, Zod dropped; logic-hidden answers dropped server-side; analytics compute-on-read; A/B sticky-per-visitor; file-upload scaffolded/M06; double-opt-in email stubbed/D-011; Turnstile Vault-keyed scaffold; `ip_hash` not raw IP; provision starter-form seed) with next-free ids **checked against parallel sessions**; JOBS-AND-WORKERS note that the deferred `form.submitted` source is now live (no new job type); INTEGRATIONS-SPEC unchanged (no new provider — Turnstile is a scaffold).
- [ ] **Step 7: TASKS.md Session 16 block** — checked boxes, the pre-build dependency/blocker check, carry-overs (file-upload→M06; opt-in email send→D-011; Turnstile key→D-009; live Edge-Fn/Deno run "ready, not run"; parallel-numbering reconcile flag for `0020`/D-084+), DECISIONS added, and the close ritual `Gates: 1 ✅ 2 ✅ 3 ✅ 4 ✅ 5 ✅ 6 ✅ 7 ✅ 8 ✅ 9 ✅` (Gate 3 = no billable action in M15 core, stated).
- [ ] **Step 8: Commit** `chore(m15): wiring, seed, permissions, docs, Session 16 close`.

---

## Self-review (run against the spec)

**Spec coverage:** schema/enums/RLS + service-role posture (spec §3) → Task 1; submission pipeline spam/validate/logic-drop/quiz/contact/consent/tags/routing/trigger/timeline/notify (§4) → Task 2; double-opt-in + analytics rollup + A/B + provision seed (§4/§6/§7/§8) → Task 3; `public-form` Edge Fn + validator (§5/§6) → Task 4; `forms-export` (§5) → Task 5; authed app list/builder/results (§7) → Task 6; public renderer + `embed.js` trigger engine + frequency cap (§6) → Task 7; permissions/seed/verify/docs/DoD close (§10/§11) → Task 8. The three scaffolds (file-upload/M06, opt-in-email/D-011, Turnstile/D-009) appear in Task 1 (schema comment), Task 2/3 (opt-in), Task 4 (Turnstile verify skip), Task 6 (disabled toggles), Task 7 (disabled field). No spec section is unmapped.

**Placeholder scan:** no "TBD/TODO"; each step names exact files, the non-obvious SQL/TS logic (the 11-step pipeline, RLS matrix, validator/logic mirror, trigger wiring, analytics rollup), and a run/expected verification. Repetitive UI references the established component library (§8) and the three reference modules deliberately (repo convention: don't transcribe boilerplate), while all non-obvious logic is specified.

**Type/name consistency:** function names used consistently across tasks — `submit_form`, `form_confirm_optin`, `form_analytics`, `assign_form_variant`; Edge Fns `public-form`/`forms-export`; validator `_shared/formValidator.ts` with `validate()`/`visibleFields()`; renderer `m15-form-render.js`; probe `m15probe.mjs`. Table/column names match spec §3 (`forms`/`form_submissions`/`form_views`, `fields_json`/`logic_json`/`settings_json`/`routing_json`, `public_token`, `confirm_token`, `ip_hash`, `variant`, `ab_split`). Enum values match (`form_type`, `form_status`).
