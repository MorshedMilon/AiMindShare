# M20 — Funnels · design & architecture rationale

**Session 19 · Phase 2 (Acquisition & Sites) · built 2026-07-04**
Stack: vanilla HTML/CSS/JS + Supabase (Postgres · RLS · Edge Functions · pg_cron). No Next/Prisma/BullMQ.

---

## 1. What this module is

Multi-step conversion flows layered on the M19 page engine: **opt-in → sales → order → upsell → thank-you**, with per-step conversion tracking and A/B split testing. The ClickFunnels slice of the platform. A funnel is an *ordered list of M19 pages*, each tagged with a step type; a visitor cookie carries session/contact through the steps; events land in a per-step event stream that powers the conversion waterfall and the A/B stats.

## 2. Dependency reality (why this was buildable)

M20's hard deps per PRD are **M19, M28, M09, M13**. At session start M19 was flagged NOT-done; mid-analysis a **parallel session landed `0020_m19_sites.sql`** (concurrent-build — the memory's documented pattern). All deps are now real:

| Dep | Built | What M20 consumes |
|---|---|---|
| M19 Sites | `0020_m19_sites.sql` | `sites`, **`pages`** (a step = a page), `publish_page()`, page status |
| M28 Payments | `0018_m28_payments.sql` | `invoices` (`source_type='order'`), `record_invoice_payment()`, `revenue_rollup()` |
| M09 CRM | `0013_m09_crm.sql` | contact upsert on opt-in, `activity_log` timeline |
| M13 Automations | `0016_m13_automations.sql` | `emit_trigger()` for `payment.received` / `cart.abandoned` |

**M20 does NOT recreate `sites`/`pages`** — it references the M19 tables. `funnel_steps.page_id → public.pages(id)`.

### Collisions to reconcile on merge (flagged, not fixed here — append-only rule)
Migration + decision numbers churned live during the build as parallel sessions renumbered:
- **Migrations:** M19 sites moved `0020 → 0022`; M06 media took `0021`; M15/M16 collided on `0020`. **M20 landed on `0023`** — the next free slot *above* M19's `0022`, so `pages` is created before `funnel_steps` FKs it. Re-verify `0023` is free on merge.
- **Decisions:** M16 committed `D-090…D-094` and the observed max D anywhere reached `D-106`. **M20 uses `D-107…D-112`** (a clean block above the max). If a parallel session also claims these, renumber on merge (house pattern).

## 3. Data model (migration `0023_m20_funnels.sql`)

Canonical DATA-SCHEMA §9 gives `funnels(name)` + `funnel_steps(funnel_id, page_id, step_order, step_type)`. A/B and analytics tables are **logged extensions** (D-107/D-108), the same way M15 added `variant_of_id/ab_split` and M28 added its ledger.

| Table | Purpose | Write posture |
|---|---|---|
| `funnels` | container: name, status, `settings` jsonb (pipeline mapping, abandonment window) | staff+ ins/upd · manager+ del |
| `funnel_steps` | ordered step → an M19 `page_id` + `step_type` + `config` jsonb (order/product, routing) | staff+ ins/upd · manager+ del |
| `funnel_splits` | A/B on a step: `variant_page_id`, `split` %, `goal`, `status`, `winner`, `promoted_at` | staff+ ins/upd · manager+ del |
| `funnel_visits` | per-step event stream (`event`: view/optin/purchase), `variant`, `visitor_id`, `contact_id` | **service-role write only** · staff+ read |

**RLS posture = M19's, not the generic template.** Funnels are operator surfaces (like sites), so **SELECT = `has_role(staff)`** (client-role CEILING — a client cannot read the workspace's funnels; per-client portal narrowing is M37's job). `funnel_visits` mirrors `visitor_sessions`/`form_views`: no client insert policy, the public Edge Fn writes it under the service role (Gate-4). Every new table enables RLS in the same migration (Gate-8 Law 2).

### Server-truth functions (SECURITY DEFINER)
- **`funnel_map(p_funnel)`** → steps joined to their per-step `visitors / conversions / rate` (from `funnel_visits`), ready for the step map + waterfall. One query, server-computed so UI and analytics never drift.
- **`funnel_split_stats(p_step)`** → per-variant visitors/conversions + a **two-proportion z-test** significance and the leading variant. Winner detection is deterministic and lives server-side so the probe and UI agree.
- **`promote_split_winner(p_step, p_variant)`** (manager+) → points the step at the winning page, marks the split `promoted`.
- **`create_funnel_order(...)`** (service-role) → builds an **M28 invoice** (`kind='invoice'`, `source_type='order'`, `source_id=step`) from the order step's product config (+ bump line item), returns it. This is the "order forms wired to M28" seam; the Stripe PaymentIntent reuses M28's proven `public-invoice`/`payments-checkout` path.
- **`record_funnel_event(...)`** (service-role) → append a `funnel_visits` row; on `optin` upsert contact + source tag (M09); on `purchase` best-effort `emit_trigger('payment.received')`.
- **`sweep_abandoned_funnels(p_ws?)`** → orders started >1h with no purchase → `emit_trigger('cart.abandoned')`. Runs from a `pg_cron` entry (`m20-abandoned-sweep`), SQL-in-a-function so worker and PGlite probe run identical logic (M28's `sweep_overdue` pattern).

## 4. Frontend (`m20-funnels.html` + `js/m20-funnels.js` + `styles/m20-funnels.css`)

Same shell as every module: `tokens → app → components → m20` CSS order, hash-router IIFE, anon-key-only Supabase client, **mockup mode** with realistic seed data + a default/empty/loading/error/success preview switcher (Gate-5). Screens:

1. **Funnels list** — glass cards with a revenue glance (visitors, opt-in rate, orders, revenue) + status pill; empty state = "Build your first funnel".
2. **Funnel detail — step map** — horizontal connected step cards, each showing type icon + `visitors → conversions → rate`; drop-off shading between steps; reorder; add-step from the workspace's M19 pages.
3. **Step drawer** — page link/edit (into M19), step-type config (order step → product/price/bump/coupon), **A/B split tab** (two page variants, weighted split, goal, live significance + winner banner + promote).
4. **Analytics tab** — conversion **waterfall** (per-step counts + drop-off), UTM source glance, date compare.
5. **Settings** — pipeline/stage mapping for purchases, abandonment toggle/window.

All numerals in `--font-mono`; 0.5px hairlines; both themes; responsive 360/768/1280; `prefers-reduced-motion` respected; no shimmer.

## 5. Scope: accept-when to DoD, rest scaffolded (the established session pattern)

**Built to DoD (BUILD-SEQUENCE S19 accept-when):** step builder on M19 pages · funnel map with per-step conversion · A/B split with winner detection · order forms wired to M28. Plus leak-probe, role matrix, `funnel_map` math, order→invoice, `funnel_visits` service-role-only, abandoned sweep — all in `m20probe.mjs`.

**Honestly scaffolded + flagged (carry-over):**
- **One-click off-session upsells** — UI + `create_funnel_order` seam present; the Stripe off-session PaymentIntent on a stored PM defers (needs saved-payment-method plumbing beyond M28's current cut).
- **Public funnel renderer** — the funnel-context script that injects into M19-rendered pages defers to the M19 `site-render` Edge Fn maturing; `record_funnel_event` + `public-funnel` track/order endpoints ship now.
- **Sequential significance** — ships as a two-proportion z-test (fixed-horizon); true sequential/Bayesian stopping is a later refinement.

## 6. Security & correctness checklist

- Every new table: `workspace_id` + RLS + policies in the same migration; `funnel_visits` service-role-write-only.
- No secret client-side; the public Edge Fn holds the service role; Stripe key stays in Vault (reused from M28).
- `create_funnel_order` re-derives money server-side via M28's `calc_invoice_totals` trigger — the browser cannot forge an order total.
- Leak probe: B's staff cannot read/write A's funnels/steps/splits/visits; client role cannot read funnels at all.

## 7. Decisions logged (D-107…)

- **D-107** funnel A/B lives in a dedicated `funnel_splits` table (variant = an alternate `page_id`), not columns on `funnel_steps` — a step can exist without a test.
- **D-108** `funnel_visits` per-step event stream (view/optin/purchase) is the single source for both the waterfall and A/B stats; service-role-written (Gate-4), mirrors `form_views`.
- **D-109** funnels use the M19 operator-ceiling RLS (staff+ SELECT, client cannot read), not the generic member-read template.
- **D-110** funnel orders wire to M28 by creating an `invoices` row with `source_type='order'` — no separate orders table; reuses M28 money truth + Stripe path.
- **D-111** winner detection = fixed-horizon two-proportion z-test server-side; sequential/Bayesian deferred.
- **D-112** `m20-abandoned-sweep` hourly `pg_cron` → `cart.abandoned`; one-click off-session upsell deferred (scaffold).
