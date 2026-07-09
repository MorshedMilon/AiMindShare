# M21 — SEO Engine · design & architecture rationale

**Session 21 · Phase 3 (SEO & Content) · built 2026-07-04**
Stack: vanilla HTML/CSS/JS + Supabase (Postgres · RLS · Edge Functions · Storage · Realtime · pg_cron). No Next/Prisma/BullMQ/Recharts.

---

## 1. What this module is

Semrush-lite: **keyword research, SERP analysis, competitor gap, rank tracking, and technical audits**. Research and ranking only — content *production* lives in M22. Implements original PRD Section 13 fully. A workspace researches keywords (volume/CPC/difficulty/intent, related, questions, long-tail), saves them into named lists, tracks positions daily against its own domain + competitors, receives a weekly rank email, and crawls a site for technical SEO issues with a CWV/score report.

## 2. Dependency reality & the Phase-3 gate

M21's PRD deps are **M41** (DataForSEO, SerpApi, PSI credentials). Rank-major events feed **M13**; send-to-queue targets **M22** (not built).

| Dep | Built | What M21 consumes |
|---|---|---|
| M41 Credential Vault | `0010_m41_integrations.sql` | `resolveCredential()`, `integrations` rows; registry already carries `dataforseo` (basic) + `serpapi` (api_key), both `usedBy:["M21"]`. PSI added as a keyed provider. |
| M13 Automations | `0016_m13_automations.sql` | `emit_trigger('rank.change_major', …)` for major-movement recovery flows |
| M03 Billing | `0009_m03_billing.sql` | `meter_increment('seo_calls', …)`; the `seo_calls` meter_kind already ships (D-027) |
| M16 → SendGrid | D-086 (D-011 resolved) | weekly `rank.report` email provider |
| M22 Content/CMS | **not built** | `content_queue` — **stubbed now** to M22 §13 shape (PRD_M21 §7 directs this) |

### The D-010 gate (flagged, human-resolved to ready-not-run)
BUILD-SEQUENCE marks **Phase 3 as requiring D-010 (heavy-job worker runtime) decided**, and D-010's own text names "**500-page crawls**" — exactly M21's audit crawler. D-010 is **OPEN**; DECISIONS policy forbids resolving OPEN items in a build session. Flagged to the user; resolution: **build M21 fully to DoD in the established ready-not-run posture** (the whole project has no worker runtime on this machine — every prior session's live-worker run is *carried, never faked*). The one engineering safeguard: the crawler is **chunked and resumable** (§5) so it runs identically on a GitHub Actions runner *or* a VPS — the eventual D-010 resolution never forces a rewrite. Only the **live at-scale 500-page crawl execution** is carried. D-010 stays OPEN (a platform-wide infra call, not M21's to make).

### Collisions to reconcile on merge (append-only rule — flagged, not fixed)
- **Migrations:** 0000–0024 exist (with the known **0012 gap** — Session 5's M05-duplicate-0010 still awaits the human renumber → 0012). M21 lands on **`0026_m21_seo.sql`** — next free above the observed max 0024. Re-verify `0025` is free on merge.
- **Decisions:** observed max is **D-119** (M06). M21 claims **`D-128…D-135`** (clean block above the max). If a parallel session also claims these, renumber on merge (house pattern).

## 3. Data model (migration `0026_m21_seo.sql`)

Canonical DATA-SCHEMA §13 gives `keyword_lists`, `keywords(list_id, keyword, volume, cpc, difficulty, intent)`, `tracked_keywords(keyword, domain, country)`, `keyword_rankings(tracked_keyword_id, position, url, date)`, `seo_audits(domain, results jsonb, score)`. The rest are **logged extensions** (same pattern as M15/M20/M28).

| Table | Purpose | Write posture |
|---|---|---|
| `keyword_lists` | named collection: name, description, counts | staff+ ins/upd · manager+ del |
| `keywords` | list_id, keyword, volume, cpc, difficulty (0–100), intent, serp_features jsonb | staff+ ins/upd · manager+ del |
| `seo_keyword_cache` | (workspace_id, keyword, country, data jsonb, cached_at) · **unique(ws,keyword,country)** · 30-day TTL | member read · **service-role write** |
| `tracked_keywords` | keyword, domain, country, **`competitor_domains text[]`**, list_id?, is_active | staff+ ins/upd · manager+ del |
| `keyword_rankings` | tracked_keyword_id, position, url, checked_on date, **is_featured_snippet**, competitor_positions jsonb | staff+ read · **service-role/worker write only** |
| `seo_audits` | domain, status, results jsonb (CWV, SSL, schema), score, pages_crawled, cursor jsonb (resume) | staff+ ins/upd (queued/pending only) · manager+ del · worker advances |
| `seo_audit_issues` | audit_id, type, severity, url, detail (PRD §3 explicit) | staff+ read · **service-role/worker write only** |
| `content_queue` | **M22 stub** (keyword, priority, status, article_id) — M22 §13 shape | member ins (queued) · staff+ read · manager+ del |

**RLS posture = operator ceiling (M19/M20 precedent, D-089/D-109), NOT the generic member-read template.** SEO is operator data with no client surface, so **SELECT = `has_role(staff)`** (client-role CEILING — a client reads nothing; per-client narrowing is M37's job). Worker-written tables (`keyword_rankings`, `seo_audit_issues`) have **no client insert policy** — the worker writes under the service role (Gate-4), mirroring `funnel_visits`/`form_views`. `seo_keyword_cache` is **workspace-scoped** (Law 2 clean) — *not* a cross-tenant shared cache; keyword data doesn't justify an M41-style platform exception's attack surface (D-129). Every new table enables RLS in the same migration (Gate-8 Law 2).

### Server-truth functions (SECURITY DEFINER)
- **`seo_cache_get(ws, keyword, country)`** / **`seo_cache_put(...)`** (service-role) — 30-day cache read/write, the Edge Fn checks cache before spending an API call.
- **`send_to_content_queue(ws, keywords[])`** (staff+ definer) — inserts `content_queue` rows (the "Send to M22" seam); no secret, so no Edge Fn. Idempotent per (ws, keyword, queued).
- **`record_keyword_ranking(...)`** (service-role) — append a `keyword_rankings` row; compute delta vs last; if |Δ| ≥ 5 best-effort `emit_trigger('rank.change_major', …)` (D-133, M13 built → real, exception-guarded).
- **`rank_history(tracked_keyword_id, days)`** (staff+) — 90-day series for the Chart.js modal, server-computed so UI and stored data never drift.
- **`audit_score(audit_id)`** — deterministic 0–100 from issue counts × severity weights + CWV; SQL-in-a-function so worker and PGlite probe compute identically.
- **`enqueue_due_rank_checks()`** / **`enqueue_weekly_rank_reports()`** — the cron bodies; one idempotent `rank.check` job per active tracked keyword (daily), one `rank.report` per workspace with trackers (Mondays). SQL-in-a-function (M28 `sweep_overdue` / M14 `enqueue_due_reminders` pattern) so cron and probe run identical logic.

## 4. Edge Functions & jobs

**Edge Functions (secret-bearing only — Law 3/4; EDGE-FUNCTIONS-SPEC):**
- `seo-keyword-lookup` — seed → data (volume/CPC/difficulty/intent) + related + questions + long-tail; checks `seo_cache_get` first; on miss calls DataForSEO via `resolveCredential()` and `meter_increment('seo_calls')` **in the success txn** (failed call bills nothing), then `seo_cache_put`.
- `seo-serp` — SerpApi top-10 + SERP-feature flags; meter per call.
- `seo-gap` — two domains → DataForSEO ranked-keywords intersect (keywords they rank for that you don't); meter per call; export + send-to-queue seam.
- `config.toml` entries (all `verify_jwt=true`).

**Worker handlers (`worker.mjs`, injectable `db` — runs against service-role client in prod + PGlite adapter in probe):**
- `rank.check` — per tracked keyword, batched SERP parse (own domain + competitors) → `record_keyword_ranking` rows → major-delta emit; `meter_increment('seo_calls')`; per-keyword failure isolation + retry (Gate-4 resilience AC).
- `rank.report` — Monday weekly digest: aggregate the week's deltas → SendGrid email (composed live; **send carried** — no Deno/creds here).
- `seo.audit.crawl` — **chunked/resumable BFS crawler** (D-131): robots.txt-aware, ≤500 pages, **2 req/s cap**, dedup frontier; each run processes a bounded page batch, writes `seo_audit_issues`, persists the frontier/visited **cursor** into `seo_audits.cursor`, and **re-enqueues itself** with `run_after` until done (the M13 WAIT-node re-queue mechanism) — so it fits *any* runtime budget (D-010-agnostic). On completion: PSI CWV on top pages, SSL check, schema validate, `audit_score`. `seo_calls` metered per external call.

**pg_cron (JOBS-AND-WORKERS-SPEC §5 — already registered):**
- `seo-rank-check-daily` — `0 3 * * *` → `enqueue_due_rank_checks()`.
- `seo-rank-report-weekly` — `0 6 * * 1` → `enqueue_weekly_rank_reports()`.
Both guarded for PGlite (the harness has no `pg_cron`), same as every prior module.

> **Job-name reconcile (D-128):** JOBS-AND-WORKERS-SPEC §5/§6 canonically names `rank.check`, `rank.report`, `seo.audit.crawl`. PRD_M21 §7's `seo.rank.check` wording is **superseded by the spec** (the spec is the binding contract). M21 uses the spec names.

## 5. Frontend (`m21-seo-engine.html` + `js/m21-seo.js` + `styles/m21-seo.css`)

Same shell as every module: `tokens → app → components → m21` CSS order, hash-router IIFE, anon-key-only Supabase client, **mockup mode** with realistic seed data + a default/empty/loading/error/success preview switcher (Gate-5). Chart.js (D-005 — *not* Recharts) for the rank-history lines and the audit score dial. Screens (PRD §5):

1. **`/seo/keywords`** — research form (seed + country/language selectors) → **main metric card** (volume · CPC · difficulty bar · intent badge) → **tabbed results** (Related / Questions / SERP), sortable + multi-select table with **Save-to-list** / **Send to Content Queue (M22)** actions; **competitor-gap** tool (two domains → gap table); **lists sidebar** (named collections + counts + bulk ops). Empty = "Research your first keyword".
2. **`/seo/rankings`** — tracker table (keyword, position, **Δ arrows**, URL, featured-snippet flag, checked-on); row → **history chart modal** (Chart.js 90-day line, competitor overlay toggle); add-tracker drawer (keyword + domain + up to 3 competitor domains). Empty = "Track your first keyword".
3. **`/seo/audit`** — domain input → **score dial** (Chart.js doughnut) + issues table **grouped by severity** (broken links, missing/dup titles, missing H1/meta, redirect chains, large images) + **CWV cards** (LCP/INP/CLS per key page) + **compare-to-last**; re-run button. Empty = "Run your first audit".

Design law (Gate-6): light default + dark sibling (**no stars/dots in dark bg**), responsive 360/768/1280 (tables own their overflow, no page h-scroll), `prefers-reduced-motion` respected, tokens-only (no raw hex), 3 fonts (Cormorant/Baskerville/Shippori), `.5px` hairlines, Shippori numerals, no shimmer. Glassmorphism panels, soft atmospheric gradients, meaningful Islamic-geometry accents on the score dial / empty states.

## 6. Verification (`workers/verify/m21probe.mjs` — real Postgres via PGlite)

Cross-tenant leak on **all 8 new tables** · operator-ceiling role matrix (staff+ read/write, manager+ del, **client reads nothing**) · `seo_keyword_cache` unique(ws,keyword,country) + service-role write · `keyword_rankings`/`seo_audit_issues` client-insert denied · `rank.check`/`seo.audit.crawl` **queued-only from browser** + worker claim · `record_keyword_ranking` delta + **major-delta `emit_trigger`** fired at |Δ|≥5 · resumable crawl cursor advance · `send_to_content_queue` insert (idempotent) · `seo_calls` **meter on success / nothing on forced failure** (Gate-3) · weekly `rank.report` enqueue. Plus a **no-regression** run of the existing suite (leak 8/8 · job 5/5 · m00…m20) + **Gate-8 greps CLEAN**.

## 7. DECISIONS to claim (D-128…D-135)

- **D-128** · Job names reconciled to JOBS-spec (`rank.check`/`rank.report`/`seo.audit.crawl`); crawler chunked/resumable → runtime-agnostic under OPEN D-010 (ready-not-run, live at-scale crawl carried).
- **D-129** · Keyword cache is **workspace-scoped** (Law 2), not a cross-tenant shared cache.
- **D-130** · SEO tables use the **operator-ceiling RLS** (staff+ read), matching M19/M20 — not member-read.
- **D-131** · Crawler contract: BFS + robots.txt + 2 req/s + `seo_audits.cursor` resume via self-re-enqueue (M13 WAIT pattern); ≤500 pages.
- **D-132** · `seo_calls` metering points: per external API call in the Edge-Fn/worker success txn; forced failure bills nothing.
- **D-133** · `rank.change_major` (±5) → M13 `emit_trigger`, best-effort exception-guarded (M13 built).
- **D-134** · `content_queue` **stubbed now** to M22 §13 shape (RLS-on) so M22 adopts it; `send_to_content_queue` definer RPC.
- **D-135** · PSI CWV / SSL check / schema validator + weekly SendGrid email are **ready-not-run** (no Deno/creds/hosted here); composed, live-send/live-call carried, never faked green.

## 8. Out of scope (carried on TASKS.md — never faked green)

Live provider round-trips (DataForSEO/SerpApi/PSI/SendGrid) · live at-scale 500-page crawl execution (D-010 production runtime) · the M22 content pipeline that consumes `content_queue` (Session 22–23). All ship as ready-not-run scaffolds verified against PGlite, per the house pattern.
