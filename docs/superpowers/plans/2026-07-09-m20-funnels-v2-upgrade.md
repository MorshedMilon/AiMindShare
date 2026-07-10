# M20 Funnels v2 Upgrade — Audit, Gap Analysis & Phased Plan

> Status: **DRAFT — awaiting scope approval before any schema/code changes** (per repo CLAUDE.md: schema/migrations and large multi-file changes require an approved plan first).
> This document covers Steps 1–3 of the M20 v2 master prompt. Step 4 (implementation) starts only after the user picks which gaps to build now.

---

## 1. Current module audit

**On disk:** `supabase/migrations/0023_m20_funnels.sql` · `supabase/functions/public-funnel/index.ts` · `frontend/m20-funnels.html` + `js/m20-funnels.js` (786 lines) + `styles/m20-funnels.css` · `workers/verify/m20probe.mjs` (probe, 43/43 passing) · DECISIONS D-107…D-112 · TASKS.md Session 19 close note.

### What exists

**Schema (4 tables, all RLS-enabled, operator-ceiling posture D-109):**
- `funnels` — workspace_id, site_id, name, status (`draft|active|archived`), `settings` jsonb (pipeline/stage mapping, abandon_hours, currency), archived_at.
- `funnel_steps` — ordered step = an M19 `page_id` + `step_type` (`optin|sales|order|upsell|downsell|thankyou`) + `config` jsonb (ad hoc: products array, bump, coupon, routing).
- `funnel_splits` — one A/B test per step: `variant_page_id` (B), `split` %, `goal` (`progression|purchase`), `status` (`running|promoted|stopped`), `winner`, `promoted_at`. **No variant C.**
- `funnel_visits` — per-step event stream, `event` ∈ `view|optin|purchase|abandoned` only, `variant`, `visitor_id`, `contact_id`, `utm` jsonb. **Service-role write only** (Gate-4) — the only writer is the Edge Fn.

**Server-truth functions (SECURITY DEFINER):**
- `funnel_map(funnel_id)` → per-step visitors/conversions/rate for the step map.
- `funnel_split_stats(step_id)` → per-variant stats + fixed-horizon two-proportion z-test (95% sig, 30-visitor floor per arm).
- `promote_split_winner(step_id, variant)` (manager+) → swaps the step's live page, marks split promoted.
- `create_funnel_order(...)` (service-role) → inserts an **M28 `invoices`** row (`source_type='order'`) — money truth stays in M28's trigger, no separate orders table (D-110).
- `record_funnel_event(...)` (service-role) → appends `funnel_visits`; on `optin` upserts an M09 contact + tag; on `purchase` best-effort `emit_trigger('payment.received')`.
- `sweep_abandoned_funnels()` → hourly `pg_cron` (`m20-abandoned-sweep`) → unpaid order-invoices past `abandon_hours` → `emit_trigger('cart.abandoned')`. Idempotent via an `abandoned` marker row.

**Edge Fn `public-funnel`** (`verify_jwt=false`): two actions, `track` (→ `record_funnel_event`) and `order` (→ `create_funnel_order`, hands off to M28's existing hosted-pay flow via `public_token` — no duplicated Stripe code).

**Frontend** (`m20-funnels.*`): funnels list with a revenue glance (visitors/opt-in rate/orders/revenue) → funnel detail with 3 tabs (**Map** — horizontal step cards with drop-off %, **Analytics** — conversion waterfall + UTM-source bar list, **Settings** — pipeline mapping + abandon window) → step drawer with 3 tabs (**Page** link into M19, **Config** — step type + products + single order-bump toggle, **A/B Split** — create/view/promote one test). Mockup mode with full default/empty/loading/error/success preview states (Gate-5). Anon-key-only, hash-routed, matches shell conventions of every other module.

### What works (verified by m20probe: 43/43)

Cross-tenant leak probe on all 4 tables · role matrix (staff+ read/write, manager+ delete/promote, client reads nothing) · `funnel_map` math · order→invoice wiring (money recomputed server-side, can't be forged) · `funnel_visits` service-role-only enforcement · abandoned-sweep idempotency.

### What must be preserved (hard constraints for v2)

1. **Step = page** model (`funnel_steps.page_id → pages.id`); do not introduce a second content model.
2. `funnel_visits` as the *single* event stream feeding both the waterfall and A/B stats (D-108) — new analytics must read from it, not a parallel table.
3. `create_funnel_order` → M28 `invoices` (`source_type='order'`), M28's `calc_invoice_totals` trigger stays the only place a total is computed (D-110) — a browser must never be able to forge revenue.
4. Operator-ceiling RLS (`has_role(staff)` to read, `manager` to delete/promote) — a client role must continue to read nothing (D-109).
5. `funnel_visits` service-role-write-only — no new client-writable path onto that table.
6. `funnel_splits` as a dedicated table (not columns on `funnel_steps`) — a step must remain testable without forcing a test (D-107).
7. Migrations are append-only; next free number is **`0029`** (`0028_m19_sites_v2.sql` is the current tip). Next free DECISIONS block starts at **D-153** (max committed is D-152, per `session-24-m19-v2` memory + a repo-wide grep confirming it here).

### What's fragile

- **One split per step in practice**: the schema allows multiple `funnel_splits` rows per step, but every query does `order by created_at desc limit 1` — there's no unique constraint or app-level guard against two `running` splits on the same step. Adding variant governance must either enforce "one running test per step" explicitly or intentionally support concurrent tests.
- **`funnel_step.config` is untyped jsonb** — products/bump/coupon are ad hoc, duplicated per step, with no catalog. Fine for one bump, brittle for "multiple products and price points" reused across steps.
- **`funnel_status` enum has only 3 values** (`draft|active|archived`) — no `testing`/`paused`, so "operational status" as briefed doesn't exist yet.
- **One-click upsell is a scaffold only** — UI renders an upsell *step*, but there is no saved-payment-method / off-session PaymentIntent charge path. `create_funnel_order` seam exists; the actual charge does not (this was explicitly carried over from Session 19, not a regression).
- **UTM is captured but not auto-populated** — `record_funnel_event`/`public-funnel` will happily store whatever `utm` object a caller sends, but nothing on the M19-rendered page side reads `location.search` and forwards it automatically. The "funnel-context script" that would do this is explicitly deferred to M19's `site-render` maturing (Session 19 note) — this is a real cross-module dependency, not something M20 alone can close.

### What is missing (high level — full detail in §2)

Test mode / go-live validation · variant C + traffic-split/sample-size/confidence config on splits · order bumps beyond one hardcoded slot / real upsell-downsell charge flow · revenue attribution views (per-step, per-source, EPC, AOV) · automation events beyond `payment.received`/`cart.abandoned` · duplicate/template funnels · per-funnel permissions finer than the workspace role · an operations/observability surface (logs, job status, retries) · several of the briefed sidebar sections (Attribution, CRM & Revenue, Automations, Templates, Operations, Team/Permissions, Logs/Jobs are all net-new; Overview/Steps/Funnel Map/Variants/Checkout/Analytics/Settings already exist in some form).

---

## 2. Gap analysis

Ranked by **user value → engineering leverage → dependency risk → backward-compat safety**. "Exists" gaps are refinements; "Missing" gaps are net-new.

| # | Gap | vs. brief | vs. PRD | vs. S19 DoD | Value | Risk |
|---|---|---|---|---|---|---|
| 1 | Funnel statuses (`testing`,`paused`) + go-live validation | required | — | not scoped | High | Low — additive enum values + a read-only RPC |
| 2 | Variant governance: min sample size, confidence, auto-promote toggle, variant C, freeze/archive | required | partially (PRD has A/B only) | S19 shipped fixed z-test only | High | Low — additive columns on `funnel_splits`, existing z-test logic extends cleanly |
| 3 | Revenue attribution: per-step/per-source revenue, EPC, AOV, UTM breakdown by revenue not just visits | required | required (§2 Analytics) | S19 carried "UTM breakdown" as visits-only | High | Low — pure new RPCs over existing `invoices`+`funnel_visits`, no schema risk |
| 4 | Order bumps (multi), one-click upsell **charge**, one-click downsell | required | required | S19 explicitly carried this over as a scaffold | High | **Medium** — real off-session Stripe charge needs saved-PM plumbing M28 doesn't have yet; scope the charge path carefully or it becomes its own module |
| 5 | Automation hooks (10 named events) via M13 `emit_trigger` | required | not in original PRD | S19 wired 2 of 10 | Medium-High | Low — `emit_trigger` already exists and is best-effort/fire-and-forget; adding calls is additive |
| 6 | Duplicate funnel / save-as-template / create-from-template | required | not in PRD | not scoped | Medium | Low — straight INSERT…SELECT copy logic, additive `is_template`/`template_of_id` columns |
| 7 | Per-funnel permissions (editor/viewer/analyst/admin, client-safe view) | required | not in PRD | not scoped | Medium | **Medium** — workspace `member_role` is the only access control today; a finer per-funnel grant is a new concept, needs its own additive table + RLS policy, must not weaken the existing operator-ceiling default |
| 8 | Test mode flag + test-data segregation | required | not in PRD | not scoped | Medium-High (protects analytics trust) | Low-Medium — additive boolean on `funnels`/`funnel_visits`; touches `invoices` (M28-owned) if orders should also flag — needs a decision |
| 9 | Operations/observability (logs, job status, retries, audit) | required | not in PRD | not scoped | Medium | Low — mostly UI over `emit_trigger`'s existing `trigger_log`-style tables (M13) if they exist; verify before designing |
| 10 | New sidebar IA (12–15 sections) | required | UI §5 is much thinner | S19 shipped 3 tabs | High (perception of "premium") | Low — restructuring an already-shell-consistent frontend, no backend risk, but it's the single biggest *file-count* change |
| 11 | Missing UX states (test-mode banners, permission-denied, paused, archived-in-list) | required | — | Gate-5 states exist for load/empty/error only | Medium | Low |
| 12 | Product catalog (reusable products across steps) | implied ("multiple products and price points") | PRD has a `Product` model that was never built | not built in S19 | Low-Medium | Low, but **YAGNI risk** — current ad hoc jsonb already supports multiple products per step; a catalog is a nice-to-have, not required to hit the brief's acceptance bar |

**Explicitly not recommended (over-build for this pass):**
- A full saved-payment-method vault for one-click upsells — that's a M28 feature, not an M20 one; M20 should keep the seam and surface "requires saved card on file" rather than half-building Stripe SetupIntent plumbing inside a funnels migration.
- A standalone `products` catalog table — the brief's "multiple products/price points" is already satisfied by the existing `config.products[]` array; don't add a table nobody asked to reuse across funnels yet.
- Sequential/Bayesian A/B stopping — PRD and D-111 already deferred this; nothing in this brief raises its priority.

---

## 3. Phased upgrade plan

### Phase A — Safe schema/API additions (migration `0029_m20_funnels_v2.sql`, additive-only)

- `funnel_status` enum: `ALTER TYPE ... ADD VALUE 'testing'`, `ADD VALUE 'paused'` (existing `draft`/`active`/`archived` rows untouched; UI relabels `active` → "Live").
- `funnels`: add `test_mode boolean not null default false`, `is_template boolean not null default false`, `template_of_id uuid references funnels(id) on delete set null`.
- `funnel_splits`: add `variant_c_page_id uuid references pages(id)`, `split_c int` (nullable — no C = no change to existing 2-arm logic), `min_sample_size int not null default 30`, `confidence numeric not null default 0.95`, `auto_promote boolean not null default false`.
- `funnel_visits`: widen the `event` check constraint to add `upsell_accepted|upsell_declined|downsell_accepted|downsell_declined`; add `is_test boolean not null default false`.
- New table `funnel_access` (workspace_id, funnel_id, user_id, can_edit bool, can_view_analytics bool) — additive, opt-in; absence of a row = fall back to today's workspace-role behavior (nothing gets *less* restrictive by accident).
- New RPCs (no new tables needed): `funnel_publish_readiness(funnel_id)`, `funnel_revenue_by_step(funnel_id, range)`, `funnel_revenue_by_source(funnel_id, range)`, `funnel_epc(funnel_id, range)`, `duplicate_funnel(funnel_id, as_template bool)`.
- Extend `promote_split_winner` to accept `'C'`; extend `funnel_split_stats` to compute a third arm when `variant_c_page_id` is set (backward compatible — null C ⇒ identical output shape to today).
- Add `emit_trigger` calls for the 8 missing events, gated the same best-effort way as the existing 2 (`exception when undefined_function then null; when others then null;`).
- DECISIONS: log D-153…D-16x for each material extension (enum widening, `funnel_access` model, variant-C stats, test-mode semantics).

*Depends on:* nothing new — pure extension of the 0023 migration's own tables/functions. *Risk:* enum `ADD VALUE` cannot run inside the same transaction as code that immediately reads the new value on some PG versions — sequence the migration file accordingly (guard already used elsewhere in this codebase for enum adds).

### Phase B — UI/UX and funnel builder upgrades

- Rebuild the module IA around the briefed sidebar (Overview / Steps / Funnel Map / Variants / Checkout / Analytics / Attribution / Contacts-Entries / CRM & Revenue / Automations / Templates / Operations / Team-Permissions / Logs-Jobs / Settings), reusing the existing shell/rail/tab conventions — this is the biggest file-size change but zero schema risk.
- Variants tab: promote the current single-split drawer tab into a first-class page with A/B/C management, sample-size/confidence inputs, freeze/archive history.
- Checkout tab: multi-product + multi-bump editor, upsell/downsell config, explicit "no saved-PM charging yet" state instead of a dead-end toggle.
- Operations tab: status stepper (draft→testing→live→paused→archived), publish-readiness checklist (warnings vs. blockers) backed by `funnel_publish_readiness`.
- Templates tab: duplicate / save-as-template / create-from-template using `duplicate_funnel`.
- Team/Permissions tab: `funnel_access` editor (only visible to manager+, never lowers the existing operator ceiling).

*Depends on:* Phase A's new columns/RPCs. *Risk:* low — additive UI, existing routes (`#/funnels`, `#/funnels/:id/:tab`) keep working, old tabs (map/analytics/settings) become sub-views of the new sections rather than being deleted.

### Phase C — Analytics / automation / attribution / operational depth

- Wire the 8 new `emit_trigger` calls into the actual step-progression + checkout + split-promotion code paths (not just the DB function signatures from Phase A).
- Attribution + CRM & Revenue tabs consuming the new revenue RPCs; date-range filters (daily/weekly/custom) computed on read (mirrors M20's existing "compute on read" pattern, no new rollup tables).
- Logs/Jobs tab surfacing `sweep_abandoned_funnels` runs and `emit_trigger` delivery — first check whether M13 already has a delivery-log table before proposing a new one (flagged for verification, not yet confirmed in this audit).

*Depends on:* Phase A (schema) + Phase B (UI shell to host these tabs). *Risk:* low-medium — mostly read-side; the one write-path change (emitting new trigger types at new call sites) needs care to stay best-effort/non-blocking like the existing two.

### Phase D — Polish, states, validation, QA, observability

- Test-mode banner + data segregation in every analytics view (exclude `is_test` rows from real metrics by default, toggle to include).
- Permission-denied / paused / archived-in-list / no-saved-card states.
- Extend `m20probe.mjs` for every new RLS surface (`funnel_access`, variant C, new event types) and every new RPC.
- Regression pass: confirm existing funnels/steps/splits/visits/orders created before this upgrade still render and function unchanged (the whole point of "additive-only").

---

## Open questions for the user before Step 4 (implementation)

1. **Scope for this pass** — build all of Phase A now (schema) and then how much of B/C/D, or start smaller (e.g., just Priority items 1–3: statuses/test-mode/go-live validation, variant governance, revenue attribution) and ship the rest as follow-up sessions, matching how every other module in this repo has been built incrementally?
2. **One-click upsell charging** (gap #4) — since a real off-session Stripe charge needs saved-payment-method plumbing that doesn't exist in M28 yet, should this pass (a) keep it scaffolded and just improve the UI honesty about it, (b) build the M28 saved-PM piece too (cross-module, bigger), or (c) explicitly defer again with a clearer carry-over note?
3. **`funnel_access` (per-funnel permissions)** — confirm the workspace-role ceiling should remain the default and this table only ever *narrows* access for specific users, never grants beyond what their workspace role already allows (matches D-109's operator-ceiling posture) — correct?
4. **Test-mode on invoices** — flagging test orders cleanly means either (a) an additive `invoices.is_test boolean default false` column (crosses into M28's table, small and backward-compatible) or (b) keeping test orders out of `invoices` entirely and only simulating them in `funnel_visits`. Which do you want?
