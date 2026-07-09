# M08-noCopilot — Dashboard (no Copilot) — Design

**Session 15 · Phase 1 — Foundation + Core CRM · 2026-07-04**
**Module:** M08 (dashboard slice; Copilot deferred to Phase 8 / Session 47)
**Stack:** vanilla HTML/CSS/JS + Supabase (anon client, RLS), no build step.

---

## 1. Purpose & scope

The workspace home screen: at-a-glance KPIs, an "act now" needs panel, a recent-activity
feed, quick actions, and a small fixed widget grid. Read-only aggregation over tables that
already exist. **This is the accept-when slice per BUILD-SEQUENCE Session 15** — KPI strip
(Chart.js), activity feed, quick actions, needs-panel — using the reference-mockup component
DNA.

**Explicitly out of scope (carried over):**
- AI Copilot (⌘K overlay, function-calling, briefing) — Phase 8 / Session 47.
- Customizable drag-reorder / show-hide widgets + per-user `dashboard_layouts` persistence.
- Latest-form-submissions widget (M15 Forms not built yet).

**No schema changes.** No migrations, no RLS policies, no Edge Functions, no new tables.
Pure frontend read-slice over existing, already-RLS'd tables. The schema-approval gate is
therefore not triggered.

## 2. Files

| File | Role |
|---|---|
| `frontend/m08-dashboard.html` | Shell scaffold (atmosphere, `#app`, connect drawer, `#sheetRoot`, `#toasts`), loads vendored Chart.js then the module JS. Follows the `mNN-shortname` naming already used (m09-crm, m11-pipeline, m14-calendar). |
| `frontend/js/m08-dashboard.js` | Dual-mode app (live Supabase / mockup) — same skeleton as `m14-calendar.js`: config drawer, theme boot, starfield, toast, mockup preview-state switcher, hash render. |
| `frontend/styles/m08-dashboard.css` | Module layer. Builds the not-yet-extracted dashboard classes (`kpi-strip`, `kpi-tile`, `kpi-featured`, `pipe-mini`/`pipe-stage`, quick-actions bar, activity feed rows, usage-meter bars, trend-chart panel). Reuses `needs-panel`/`needs-item`/`panel`/`data-row`/`row-list`/`empty-state`/`skeleton` from `components.css`. Zero raw hex, zero token redeclaration. |
| `frontend/vendor/chart.min.js` | Vendored Chart.js UMD (no CDN, per Law 3 / no-build). Loaded before the module JS. Fallback: if the fetch is unavailable, hand-rolled inline-SVG sparklines + a DECISIONS note. |

## 3. Screen & layout

One screen, hash `#/dashboard` (also matches bare `#/`). Nav group **Overview**.
Top → bottom inside `.content-inner`:

1. **Page head** — eyebrow `MODULE · M08`, gradient-`<em>` H1 ("Your <em>workspace</em>"),
   sub (≤62ch), honest freshness line ("latest snapshot just now"), and a **date-range
   segmented control** (`This month` / `Last 30 days` / `This quarter`) that drives KPI
   comparison + sparkline/trend window.
2. **KPI strip** (`.kpi-strip`, auto-fit `minmax(190px,1fr)`) — cards render **only for tables
   that exist**:
   - New contacts — value + MoM delta + Chart.js sparkline; deep-links `m09-crm.html`.
   - Open pipeline value — `sum(deals.value where status='open')`; deep-links `m11-pipeline.html`.
   - Revenue collected — `sum(invoices.amount_paid)` in range; **the single gold
     `.kpi-featured`**; deep-links `m28-payments-and-invoicing.html`.
   - Appointments upcoming — `count(appointments where starts_at>=now and status confirmed)`;
     deep-links `m14-calendar-and-booking.html`.
   - Absent-table KPIs (articles published, keywords page-1, social impressions) simply do
     not render.
3. **Needs-panel** (`.needs-panel`, gold-heavy "act now") — honest counts + deep links:
   overdue tasks (`contact_tasks due_date<today, status='open'`), overdue invoices
   (`status='sent', due_date<today, amount_paid<total`), today's appointments. Zero-state
   collapses the panel to a calm "You're all caught up" line.
4. **Quick actions bar** — New Contact · New Deal · Compose · Book Appointment · New Task.
   M08 does not own these create flows, so each **navigates to the owning module** (honest
   wiring), e.g. New Contact → `m09-crm.html#/contacts`, Compose → `m12-inbox.html`.
5. **Widget grid** — fixed 2-column, degrades to 1 at ≤960px. Panels:
   - **Pipeline snapshot** — `.pipe-mini` funnel: stages (`pipeline_stages` by `order_index`)
     with per-stage deal counts + summed value.
   - **Recent activity feed** — `notifications` for the workspace, newest first, as
     `.data-row`s: type pill + title + relative time. Empty state honest.
   - **Tasks due today** — `contact_tasks` due today/overdue, row-list with contact + due pill.
   - **Upcoming appointments** — next N `appointments`, row-list with when (mono) + calendar.
   - **Usage meters mini** — `usage_meters` (M03) as progress bars; fill switches to
     warning/danger at 80%/95% per the design token rule.
   - **Trend panel** — one Chart.js line chart: new contacts over the selected range, with a
     previous-period comparison series (`--teal-500` primary, `--gold-500` comparison).

## 4. Data sources (all `.eq('workspace_id', ws)`, RLS-scoped anon client)

| Surface | Table(s) | Query shape |
|---|---|---|
| New-contacts KPI + sparkline + trend | `contacts` | `created_at` bucketed by day over range; count this-period vs previous. |
| Pipeline value KPI + snapshot | `deals`, `pipeline_stages` | `sum(value) where status='open'`; group deals by `stage_id`. |
| Revenue KPI | `invoices` | `sum(amount_paid)` minor units → currency, `paid_at` in range. |
| Appointments KPI + widget | `appointments` | upcoming count; next few rows. |
| Needs: overdue tasks / today | `contact_tasks` | `due_date`, `status`. |
| Needs: overdue invoices | `invoices` | `status='sent' and due_date<today and amount_paid<total`. |
| Activity feed | `notifications` | newest-first, workspace-scoped. |
| Usage meters | `usage_meters` | current period meters + limits. |

Table presence is detected by attempting the query and treating a "relation does not exist" /
permission error as "module not enabled" → the card/widget hides gracefully (never a fabricated
number). Workspace + role resolved exactly as in `m14-calendar.js` (`workspaces` →
`memberships.role`, `pickActive`).

## 5. States (Gate 5)

- **Default** — real aggregated data.
- **Empty** — fresh workspace: each widget renders its own honest empty state (designed, not a
  blank div); KPI tiles show `—` with a "no data yet" chip; needs-panel → "all caught up".
- **Loading** — opacity-pulse skeletons (KPI tiles + panels). **No shimmer sweep.**
- **Error** — envelope `error` codes mapped to human copy + a Retry path.
- **Mockup mode** — offline preview-state switcher (default/empty/loading/error/success) with a
  visible "Sample data" note, identical pattern to M14. Realistic Islamic-inspired sample names.

## 6. Design compliance (Gate 6)

- `<html lang="en" data-theme="light">`; theme boot inline before first paint; `THEME_KEY =
  'aimindshare-theme'`.
- Exact 3-font import; all numbers in `--font-mono`; enums as `.pill` variants.
- Glass by zone: KPI tiles + panels = glass-heavy; needs-panel = gold-heavy; no glass behind the
  chart canvas or long lists.
- Hover per §5 (KPI lift, rows don't levitate, no shimmer). Reveal = `js-ready`, `threshold:0`,
  sections not cards; `prefers-reduced-motion` short-circuits.
- Responsive 360 / 768 / 1280: KPI strip auto-fit; widget grid 2→1 col; quick-actions wrap; no
  horizontal scroll.
- Both themes verified. No stars/dots in dark background (atmosphere via `app.css`, already
  compliant). Only token variables; no raw hex outside SVG `<defs>`.
- Chart.js styled from tokens read off `getComputedStyle` (teal primary, gold comparison,
  hairline gridlines, mono 10px axis labels, `--card-solid` tooltip), re-themed on toggle.

## 7. Definition of Done

| Gate | Status | Note |
|---|---|---|
| 1 Tenancy | ✅ | No new tables; every read `.eq('workspace_id')`; anon client under RLS. |
| 2 Roles | ✅ | Read-only aggregate visible to any member; RLS is the wall; no forbidden action added. |
| 3 Metering | ✅ N/A | No billable action (pure reads) — stated in close note. |
| 4 Async | ✅ N/A | No jobs; no client loops beyond render; no heavy awaits. |
| 5 Screens | ✅ | default / empty / loading / error all present. |
| 6 Design | ✅ | both themes, 360/768/1280, reduced-motion, tokens only, 3 fonts. |
| 7 Secrets | ✅ | anon key only; Chart.js carries no secrets. |
| 8 Greps | ✅ | run `scripts/gate8.sh` / `scripts/verify.sh`; all clean. |
| 9 Docs | ✅ | TASKS.md Session 15 section + close note; one DECISIONS entry. |

## 8. Docs to update

- `TASKS.md` — add **Session 15 — M08 Dashboard (no Copilot)** section with checked boxes and a
  close note; record carry-overs (Copilot, layout persistence, forms widget).
- `DECISIONS-AiMindShare-v1_0.md` — one entry: M08 slice boundary (KPI/needs/feed/quick-actions
  only; reorder + `dashboard_layouts` deferred), KPI cards feature-flag by table presence, and
  Chart.js vendored to `frontend/vendor/chart.min.js`.
- `DATA-SCHEMA` — unchanged (no tables).
- `INTEGRATIONS-SPEC` / `JOBS-AND-WORKERS-SPEC` — unchanged (no provider, no job).

## 9. Verification

1. `scripts/gate8.sh` (self-review greps) returns clean.
2. `scripts/verify.sh` passes (PGlite/probe harness — no new tables, so probe count unchanged).
3. Manual: open `m08-dashboard.html` offline → all five preview states render in both themes at
   360/768/1280 with no horizontal scroll and no console errors.
