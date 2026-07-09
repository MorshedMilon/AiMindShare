# M19 — Sites v3 · Flagship AI Website Builder Upgrade Plan

**Prepared:** 2026-07-06 · **Author role:** principal product architect / senior full-stack / auditor
**Scope:** additive upgrade of the shipped M19 (v1 = `0022_m19_sites.sql` S18, v2 = `0028_m19_sites_v2.sql` S24)
**Stack (locked):** vanilla HTML/CSS/JS · Supabase (Postgres · RLS · Edge Functions · Storage · Realtime · pg_cron)
**Rule of this doc:** every recommendation is additive, backward-compatible, `workspace_id`-scoped, and reversible.
Next free migration = **`0029`**. Next free DECISION id = **D-153**. Nothing here removes or narrows an existing
column, policy, RPC signature, or render contract.

Legend for priority: **[MVP]** must-have for the upgrade · **[PREM]** premium differentiation · **[LATER]** phase-6+.

---

## 0. Execution discipline (pre-work)

### 0.1 Current inferred architecture (10 bullets)
1. **Two-representation page model** (D-101): `pages.page_json` = GrapeJS project data (editable truth) + `pages.render_html/render_css` = served snapshot, kept in lockstep by `publish_page()`. The renderer never runs GrapeJS.
2. **Pure shared engines** are the one source of truth (D-103): `frontend/js/page-builder.mjs` (deterministic generate/validate/repair/`sectionsToHtml`) and `frontend/js/site-render.mjs` (`renderPage`, `jsonLd`, `hydrationScript`, `cookieBanner`, `buildSitemap`, `buildRobots`, `renderNotFound`, `renderMaintenance`), imported verbatim by Edge Functions, the browser editor, and Node probes.
3. **Renderer = Edge Function** `site-render` (D-100), service-role read with a status filter; published pages are *not* anon-readable on the table.
4. **AI generation** = `builder-ai-generate` Edge Function wrapping the deterministic engine; an LLM swap is gated behind OPEN **D-063** (provider) — the engine stays as validator/repair/fallback.
5. **Publishing** = `publish_page()` SECURITY DEFINER RPC: snapshots into `page_versions` (v2: `kind='publish'|'save'` + `label`), prunes per-kind to 10, flips status, writes `site_publish_log`. `save_page_version()`, `revert_page()`, `duplicate_page()` complete the set.
6. **Staging/prod split** exists as `sites.preview_token` (`?pt=`) letting the renderer serve drafts + bypass `sites.maintenance_mode`; `sites.not_found_html` = custom 404 (D-149).
7. **Domains/SSL** = `site_domains` (verification token + `domain-verify` Edge Fn); live SSL is a labeled "ready-not-run" scaffold pending OPEN **D-009** (hosting).
8. **SEO/schema** = per-page `pages.meta` jsonb (title/description/og/canonical/robots/schema_type/schema_json) rendered by `site-render.mjs`; sitemap.xml + robots.txt built by the engine. A separate **M21 SEO engine** exists (`seo-keyword-lookup`, `seo-serp`, `seo-gap`, `_shared/seo.ts`).
9. **Theming** = `sites.brand` jsonb + `sites.style_preset` (minimal/bold/elegant/islamic → `STYLE_PRESETS` token overrides in `brandVars()`; brand always wins).
10. **Templates + analytics + tracking**: `site_templates` (global generator seeds + workspace "save as template", v2 gained description/language/conversion_type/render_*); `visitor_sessions` (first-party pixel via `site-track`, identifies contacts → `record_page_visit` → M09 timeline + M13 `page.visited`); `sites.language`/`pages.language` drive `<html lang>` (content variants deferred).

### 0.2 Missing inputs / unknowns (assumptions taken)
- **`DECISIONS-AiMindShare-v1_0.md`** body not fully read line-by-line here; I rely on the exhaustive decision citations embedded in the two migrations + frontend headers (D-005/009/063/100–106/147–151). *Assumption:* D-152 is the last committed id, D-153 is free. **Verify before writing DECISIONS.**
- **`DATA-SCHEMA §12`** and **`RLS-AND-SECURITY`** canonical docs not opened; the table/policy shapes are taken from the migration files themselves (authoritative on disk). *Assumption:* those docs mirror the migrations.
- **LLM provider (D-063)** and **hosting/SSL (D-009)** remain OPEN. Every v3 feature that would need them is scaffolded, not faked (repo Law 9), matching v1/v2 precedent.
- **M06 Media** is live (S20) → the OG-image/asset picker that was scaffolded in S18 can now be wired; treated as **[MVP]** integration debt, not new work.
- No dedicated **queue/jobs** table for site work was found beyond `site_publish_log`. *Assumption:* publish is synchronous today; v3 adds an optional async `site_publish_jobs` lane for expensive operations (bulk generation, health, SSL) driven by pg_cron, consistent with the platform's JOBS-AND-WORKERS pattern.

### 0.3 Top 5 technical risks
1. **`render_html` snapshot drift.** New capabilities (locale variants, section re-use, programmatic pages) multiply the number of snapshots that must stay in lockstep with `page_json`. A generator that writes HTML without re-validating through `sectionsToHtml` breaks the ">=95% deserializable" invariant. **Mitigation:** all new generation routes through the pure engine; add a `page_json → render_html` reconciliation probe.
2. **Bulk generation as an RLS/DoS footgun.** Service×location fan-out can insert hundreds of `pages` rows in one action. **Mitigation:** cap per call, run through a SECURITY DEFINER RPC with a `has_role(...,'manager')` check + a per-workspace rate guard; prefer the async `site_publish_jobs` lane for large batches.
3. **Preview-token leakage.** `?pt=` bypasses auth, drafts, and maintenance. Widening its powers (per-environment content) raises the blast radius if a token leaks. **Mitigation:** keep tokens per-site + rotatable, never log them in `site_publish_log.detail`, add a "rotate preview token" action.
4. **Health/quality checks that lie.** A green score on a broken page erodes trust more than no score. **Mitigation:** checks run against the *rendered* snapshot (the served artifact), are conservative (warn > false-pass), and record the exact rule id + evidence.
5. **Multi-tenant joins on new tables.** Every new table repeats the `workspace_id` column + RLS + index; a forgotten `workspace_id` predicate on a join (e.g. section library reuse across sites) is a cross-tenant leak. **Mitigation:** carry `workspace_id` on every v3 table, mirror the existing `_ws_idx` + `has_role` policy template verbatim, extend the leak probe (`leak_probe.sql`) to the new tables.

---

## 1. Executive Verdict

**The foundation is strong enough — this is an additive upgrade, not a rebuild.** M19 already has the three hard things most one-click builders lack: (a) a clean two-representation page model with a pure, testable render/generation core; (b) a real publish/version/log/staging spine; and (c) genuine CRM-native tracking. v2 already shipped save points, publish logs, staging tokens, maintenance/404, style presets, and a data-driven template gallery.

**The strategic gap is not generation — it is _structure and trust_.** Today generation is a freeform prompt → niche → deterministic sections. There is no persistent, structured **Business Profile** to reuse, so every page starts cold; SEO/schema is per-page manual; there is no **quality gate** before real client sites go live; there is no **site-level health**; theming is a flat jsonb rather than a **brand kit of tokens**; and there is no primitive for **reusable sections** or **programmatic service/location pages** — the exact features that let an agency stamp out 50 branded, technically-correct sites. Closing that gap (Business Profile → schema-first generation → programmatic pages → publish-time quality pipeline → site health) is what turns "a working editor + publish path" into a flagship, GEO-ready, agency-grade product.

**Verdict: proceed. One new migration (`0029`), ~7 new tables, ~4 new Edge Functions, all additive. No existing site, page, domain, SSL flow, or RLS tier changes.**

---

## 2. Current-State Audit

For each area: **Now / Weak / Why it matters.**

**Editor (`m19-editor.js` + GrapeJS, `m19-sites.js` chrome).**
- *Now:* full GrapeJS editor (blocks/layers/templates/styles/traits/page-meta/versions panes; device breakpoints; undo/redo; AI generate; preview; save/publish; save-as-template; workspace + global template gallery).
- *Weak:* no reusable **section** primitive (only whole-page templates); no brand-kit token surface; no per-page SEO scoring; block library is generic, not niche/service-aware.
- *Why:* section reuse + brand tokens are the multiplier for agencies managing many pages/sites.

**Page data model (`pages`, `page_versions`).**
- *Now:* `page_json` + `render_html/css` + `meta`; versions with `kind`/`label`; per-page `language`.
- *Weak:* no locale **variant** rows (one page = one language); `meta.schema_json` is free-form (no per-type validation surface); no link between a page and the structured business facts it was generated from.
- *Why:* variants + schema-first are prerequisites for i18n and GEO.

**AI generation (`builder-ai-generate` + `page-builder.mjs`).**
- *Now:* deterministic niche libraries → validated `sections` → HTML; LLM swap gated on D-063.
- *Weak:* input is a freeform sentence + niche enum; no structured facts (services, areas, proof, exclusions); no page-type primitives (service page, location page, FAQ cluster); no schema emitted at generation time.
- *Why:* structured input is the difference between generic copy and a real, differentiated, schema-bearing site.

**Publish flow (`publish_page`, `site_publish_log`).**
- *Now:* snapshot → version → flip → prune → log; manager+.
- *Weak:* **no pre-publish quality gate**; publish is synchronous only (no lane for expensive batch work); no "deploy status" beyond the log.
- *Why:* publishing real client sites demands a checked, observable, recoverable pipeline.

**Domains / SSL (`site_domains`, `domain-verify`).**
- *Now:* add domain → DNS TXT/CNAME verify → status; SSL scaffolded behind D-009.
- *Weak:* SSL not live (external blocker); no per-domain publish/health surfacing.
- *Why:* unchanged by v3 — must be preserved exactly; v3 only *reads* domain state for health.

**SEO / schema (`site-render.mjs`, `sites.seo_defaults`, `pages.meta`).**
- *Now:* title/desc/robots/canonical/OG + JSON-LD (LocalBusiness/Article/FAQPage/Product/Event) + sitemap.xml + robots.txt.
- *Weak:* no **llms.txt**; no automated **internal linking**; no OG-image auto-gen; schema is hand-selected per page, not derived from the business profile; no Twitter-card tags; M21 SEO engine is not wired into the builder.
- *Why:* technical-SEO automation + GEO readiness is the headline differentiator vs visual-only builders.

**Widget integrations (`hydrationScript` in `site-render.mjs`).**
- *Now:* `data-embed` placeholders hydrated at view time — calendar→M14 iframe (real), form→M15 iframe (real now that M15 shipped), chat→M12 scaffold; plus first-party pixel.
- *Weak:* embeds are string placeholders, not managed **widget instances** (no per-embed config table, no analytics per widget, no blog/news embed, no reusable CRM blocks).
- *Why:* a managed widget model makes embeds configurable, trackable, and cross-module.

**Versioning (`page_versions`).**
- *Now:* publish + named save points; restore→draft; last-10 per kind.
- *Weak:* no **diff** visibility; versions are per-page only (no site-level release); no "compare" surface.
- *Why:* rollback confidence needs to *see* what changed.

**Site-management UX (`m19-sites.js`).**
- *Now:* list (AI hero, KPI strip, rich cards, gallery, activity), detail tabs (pages/nav/domains/seo/analytics/settings), full editor.
- *Weak (pre-v3):* no Business Profile surface, no health surface, no programmatic-page tool, no brand-kit. **(These are added by the mockup in this session — see §7/§11.)**
- *Why:* the operator surface is where "flagship" is felt.

---

## 3. Gap Analysis

| Area | Current State | Target State | Gap Severity | Notes |
|---|---|---|---|---|
| Business context | Freeform prompt + niche enum | Persistent structured **Business Profile** per site, reused by all generation | **Critical** | Centerpiece; unlocks schema-first + programmatic |
| Generation primitives | Whole-home generation | Service / location / service×location / FAQ-cluster generators | **High** | Agency scale multiplier |
| SEO automation | Per-page manual meta + sitemap/robots | + llms.txt, internal linking, OG auto-gen, schema-from-profile, Twitter cards | **High** | GEO + technical-SEO edge |
| Schema | Hand-selected type per page | Derived from profile; validated per type; multi-block | **Medium** | Correctness + rich results |
| Publish quality | None | Pre-publish **quality gate** (SEO/schema/a11y/perf/links/fields) | **High** | Trust for real client sites |
| Site health | None | Site-level **health score** + report, surfaced on cards/dashboard | **High** | Agency visibility |
| Theming | `brand` jsonb + `style_preset` | **Brand kit** tokens (type/color/radius/shadow/spacing) as a first-class object | **Medium** | Re-theme whole site in one edit |
| Sections | Whole-page templates only | Reusable **section library** (global + workspace) | **Medium** | Composition + consistency |
| Versioning | List + restore | + diff/compare + optional site-level release | **Low/Med** | Rollback confidence |
| Staging/prod | `preview_token` + maintenance/404 | + rotate token, publish-job status, failure recovery | **Medium** | Operational robustness |
| Widgets | String `data-embed` placeholders | Managed **widget instances** (config + analytics + blog embed) | **Medium** | Cross-module, trackable |
| Multilingual | `language` column, one page = one lang | **Locale variants** + slug strategy + hreflang + fallback | **Medium** | i18n without duplication |
| Ops visibility | `site_publish_log` | + deploy status, health trend, quality history | **Low/Med** | Builds on existing log |

---

## 4. Target Architecture (additive)

All new objects live in **`0029_m19_sites_v3.sql`**, follow the v2 additive discipline (no enum churn — `text` + `CHECK`; RLS enabled in-file; `_ws_idx` per table), and reuse `has_role(workspace_id, tier)`.

### 4.1 Data-model changes (summary; full detail §5)
- **New tables:** `site_business_profiles`, `site_sections`, `site_health_reports`, `site_locale_variants`, `site_widget_instances`, `site_publish_jobs`. **Extend (additive columns):** `site_templates` (+`scope`, +`section_json`), `sites` (+`brand_kit` jsonb, +`llms_txt` text, +`profile_id` fk is unnecessary — profile FKs to site instead), `pages` (+`generated_from` jsonb: `{profile_id, page_type, service, location}`).
- **New RPCs (SECURITY DEFINER, workspace-guarded):** `upsert_business_profile`, `generate_programmatic_pages`, `snapshot_site_release` (optional), `rotate_preview_token`.
- **New Edge Functions:** `builder-generate-pages` (programmatic + schema-first, wraps engine), `site-health-check` (runs quality rules on the rendered snapshot), `site-llms-txt` (or fold into `site-render`), and an extension of `site-render` for locale routing + `llms.txt` + internal-link injection.

### 4.2 Module / service boundaries
- **Business Profile is the hub.** `page-builder.mjs` gains a `generateFromProfile(profile, {pageType, service, location})` that returns `sections` **plus** a `schema` block — a pure function, so Edge Fn + editor + probe share it (D-103 preserved).
- **Generation pipeline:** `builder-ai-generate` (single page, existing) + new `builder-generate-pages` (batch). Both: profile → `generateFromProfile` → `validateSections`/`repairSections` → `sectionsToHtml` → insert `pages` (+ `generated_from`, + `meta.schema_json`).
- **SEO/schema pipeline:** at publish, `site-render` derives `<title>/description/OG/Twitter/canonical`, injects JSON-LD from `meta` **and** profile-derived LocalBusiness/Service, auto-cross-links service↔location↔home, and (new) serves `/llms.txt`. `buildSitemap`/`buildRobots` unchanged; add `buildLlmsTxt(site, profile, pages)`.
- **Publish pipeline:** `publish_page` unchanged in contract; the editor calls `site-health-check` (advisory) **before** invoking it (the quality gate — non-blocking by default, records a `site_health_reports` row). Large batch publishes route through `site_publish_jobs` (pg_cron worker).
- **Versioning model:** `page_versions` unchanged; add a client-side/Edge diff of `render_html` between two versions (no schema change needed for MVP; optional `snapshot_site_release` for site-level rollback is **[LATER]**).
- **Template/theme model:** `site_templates.scope ∈ {site,page,section}`; `site_sections` = reusable section blocks; `sites.brand_kit` = structured tokens layered *above* `style_preset` and *below*/merged-with existing `brand` (cascade: preset → brand_kit → brand, brand still wins to preserve behavior).
- **Widget/embed model:** `site_widget_instances` gives every embed a row (type, config, workspace) so `hydrationScript` can render richer, tracked widgets; string `data-embed` placeholders keep working (back-compat).
- **Staging/production flow:** unchanged spine; add `rotate_preview_token` + surface `site_publish_jobs.status` as deploy status; publish-failure recovery = re-run job / restore last publish version.

### 4.3 Example: profile-driven generation payload
```json
{
  "profile": {
    "business_name": "Crescent Dental",
    "services": ["General dentistry", "Cosmetic dentistry", "Braces & aligners"],
    "service_areas": ["Dhanmondi", "Mohammadpur"],
    "differentiators": ["Same-week appointments", "Anxiety-free sedation"],
    "proof_points": ["10,000+ patients", "Insurance handled for you"],
    "exclusions": ["No under-18 orthodontics without guardian"],
    "address": "House 12, Road 7, Dhanmondi, Dhaka 1205",
    "phone": "+880 1811 222333"
  },
  "page_type": "service_location",
  "service": "Braces & aligners",
  "location": "Dhanmondi"
}
```
→ returns `{ sections, render_html, render_css, meta: { title, description, schema_type:"Service", schema_json:{...}, canonical }, internal_links:[...] }`.

---

## 5. Data Model Proposal

> Convention for every table below: `id uuid pk default gen_random_uuid()`, `workspace_id uuid not null references workspaces(id) on delete cascade`, `created_at timestamptz not null default now()`, `<table>_ws_idx on (workspace_id)`, RLS enabled in-file with the standard `has_role` template. Only the distinctive fields are listed.

### `sites` (extend — additive columns)
- **Purpose:** carry the brand kit + GEO artifact without a join.
- **Add:** `brand_kit jsonb not null default '{}'` (`{type_scale, palette[], radius, shadow, spacing}`), `llms_txt text` (cached generated artifact), `default_locale text not null default 'en'`.
- **Back-compat:** all defaulted; `brand` + `style_preset` untouched; `brandVars()` reads `brand_kit` *under* `brand`.

### `pages` (extend — additive)
- **Add:** `generated_from jsonb not null default '{}'` (`{profile_id, page_type, service, location}`) so a page knows its provenance (enables regenerate + programmatic dedupe). Unique `(site_id, slug)` unchanged.

### `site_business_profiles`  **[MVP]**
- **Purpose:** the single structured source of truth for generation, SEO, schema, and programmatic pages.
- **Fields:** `site_id uuid not null unique references sites(id) on delete cascade`, `business_name text`, `phone text`, `email text`, `address text`, `hours text`, `service_areas text[]`, `services text[]`, `differentiators text[]`, `exclusions text[]`, `proof_points text[]`, `testimonials jsonb default '[]'` (`[{quote,author}]`), `brand_settings jsonb default '{}'`, `updated_at`.
- **Relationships:** 1:1 with `sites` (unique `site_id`). Referenced by `pages.generated_from.profile_id`.
- **Back-compat:** new table; absence = pre-v3 DB → editor degrades to freeform prompt (already handled by best-effort read).

### `site_sections`  **[PREM]**
- **Purpose:** reusable section/block library (global seeds + workspace "save section").
- **Fields:** `workspace_id uuid` *(nullable = global, mirrors `site_templates`)*, `name text`, `category text` (hero/features/faq/testimonial/gallery/contact/pricing/cta/service/location), `section_json jsonb`, `render_html text`, `render_css text`, `is_active boolean default true`.
- **Relationships:** none hard; consumed by the editor left-pane + generators.
- **Back-compat:** new; RLS = `workspace_id is null or has_role(workspace_id,'staff')` (read), manager+ write for own rows — identical to `site_templates`.

### `site_health_reports`  **[MVP]**
- **Purpose:** persist each quality run for the site score + history/trend.
- **Fields:** `site_id uuid not null references sites(id) on delete cascade`, `page_id uuid references pages(id) on delete set null` (null = site-level), `score int not null`, `categories jsonb not null` (`[{key,label,status,detail}]`), `source text default 'publish'` (publish/manual/cron), `created_at`.
- **Relationships:** many per site; latest = current score. Card score can be denormalized to `sites.health_score int` (optional, additive) or read latest.
- **Back-compat:** new; system-written (definer RPC / `site-health-check` service role); staff+ read.

### `site_locale_variants`  **[PREM]**
- **Purpose:** per-locale content variant of a page without duplicating the page row/slug tree.
- **Fields:** `page_id uuid not null references pages(id) on delete cascade`, `locale text not null`, `title text`, `slug_suffix text` (or full localized slug strategy — see §7), `meta jsonb default '{}'`, `page_json jsonb default '{}'`, `render_html text`, `render_css text`, `status text default 'draft'`, `published_at timestamptz`, `unique (page_id, locale)`.
- **Relationships:** N locales per page; the default locale stays on `pages` (no migration of existing content).
- **Back-compat:** new; a page with zero variants renders exactly as today.

### `site_widget_instances`  **[PREM]**
- **Purpose:** managed, configurable, trackable embeds (form/calendar/chat/blog/CRM).
- **Fields:** `site_id uuid not null`, `page_id uuid references pages(id) on delete set null`, `type text not null` (form/calendar/chat/blog/list/cta), `config jsonb not null default '{}'` (e.g. `{form_token}`, `{calendar_slug}`, `{blog_category}`), `placement text`, `is_active boolean default true`.
- **Relationships:** referenced by `data-embed` blocks via `data-widget-id`; `hydrationScript` resolves config from here (falling back to the legacy inline `data-*` attrs).
- **Back-compat:** existing string placeholders keep hydrating unchanged.

### `site_publish_jobs`  **[MVP for batch]**
- **Purpose:** async lane for expensive operations (bulk generation, health, SSL provisioning when D-009 lands, sitemap warm).
- **Fields:** `site_id uuid not null`, `kind text not null` (page.generate_batch/site.health/ssl.provision/sitemap.rebuild), `status text not null default 'queued'` (queued/running/ok/error), `payload jsonb default '{}'`, `result jsonb default '{}'`, `attempts int default 0`, `run_after timestamptz default now()`, `updated_at`.
- **Relationships:** drained by a pg_cron worker (mirrors platform JOBS pattern); writes `site_publish_log` rows on completion.
- **Back-compat:** new; synchronous publish path unchanged — jobs are opt-in for batches.

### `site_templates` (extend — additive)
- **Add:** `scope text not null default 'site'` (`check in ('site','page','section')`), `section_json jsonb`. Existing rows default to `scope='site'` — unchanged behavior.

### `site_versions` (naming note)
- The spec asks for `site_versions`; the shipped table is **`page_versions`** (per-page). To preserve existing IDs/relationships, **keep `page_versions` as-is** and add site-level release grouping only if/when needed via optional `snapshot_site_release()` writing a `site_releases` table **[LATER]**. Do **not** rename `page_versions` (destructive).

---

## 6. RLS / Multi-Tenant Safety

**Every new table carries `workspace_id` and repeats the shipped policy template** (`has_role(workspace_id, tier)`), so reads/writes are workspace-scoped identically to v1/v2. Specifics:

- **Tier mapping (unchanged, D-105):** read = staff+; content edit = staff+; publish/delete = manager+; domains = admin+; client role = ceiling (no site read). New writes follow the same tiers: profile edit = staff+, programmatic generate = **manager+** (it mass-inserts pages), health read = staff+, health write = system-only (definer/service role), widget instances = staff+.
- **System-written tables** (`site_health_reports`, `site_publish_jobs`, `site_publish_log`, `visitor_sessions`, `page_versions`): **SELECT policy only** for staff+; INSERT/UPDATE/DELETE owned by SECURITY DEFINER RPCs or the service-role Edge Functions — the browser cannot forge them. Same posture as the shipped `record_page_visit`/`publish_page`.
- **Risky joins:** the **section library** and **template** reuse cross sites within a workspace, and global rows have `workspace_id IS NULL`. The read policy must be exactly `workspace_id is null or has_role(workspace_id,'staff')` (copied from `site_templates_sel`) — never a bare join without the workspace predicate. **`generate_programmatic_pages` must re-derive `workspace_id` from the target `site` row inside the definer function**, never trust a client-supplied `workspace_id` (matches `publish_page` pattern).
- **Publish-job security:** `site_publish_jobs` is enqueued by a definer RPC that checks `has_role(...,'manager')`; the pg_cron worker runs service-role and re-checks the job's `workspace_id` against its `site_id`. Results never echo secrets.
- **Preview-URL security:** `?pt=` is a per-site secret that bypasses auth/draft/maintenance. v3 adds `rotate_preview_token()` (admin+), never logs the token in `site_publish_log.detail`, and keeps it out of `llms.txt`/sitemap. Health/quality reports must not embed the token in any shareable artifact.
- **Custom-domain ownership:** unchanged — `site_domains.domain` is globally unique (one domain → one site) and admin+ to add; DNS TXT proves control. v3 only **reads** domain/SSL state for health; no new write path, so no new takeover surface.
- **Leak probe:** extend `workers/verify/leak_probe.sql` + `m19v2probe.mjs` with the six new tables (cross-tenant SELECT/INSERT denied, definer-only writes, global-row read rules).

---

## 7. Feature-by-Feature Upgrade Plan

Each: **Objective / Backend / Frontend / AI / Publish / Migration impact / Risks.**

### 7.1 Templates + Section library  **[PREM]**
- **Objective:** whole-page *and* section-level reuse; global + workspace scopes.
- **Backend:** `site_templates.scope`+`section_json`; new `site_sections`.
- **Frontend:** editor left-pane gets a **Sections** tab (categories) alongside Blocks/Layers/Templates; "Save selection as section" action; list-screen gallery already data-driven.
- **AI:** generators emit sections that can be saved to the library; `generateFromProfile` composes from section primitives.
- **Publish:** none (sections resolve to HTML at insert, same as templates).
- **Migration:** additive columns + one table; existing templates default `scope='site'`.
- **Risks:** section CSS collisions — namespace section classes (`s-*` already scoped); dedupe global vs workspace in the picker.

### 7.2 Themes / Brand kit  **[MVP]**
- **Objective:** re-theme a whole site from structured tokens.
- **Backend:** `sites.brand_kit jsonb`.
- **Frontend:** Settings → **Brand kit** panel (palette swatches, type scale, radius, shadow depth, spacing rhythm) — *(shipped in this session's mockup)*.
- **AI:** generation reads brand_kit for consistent visual defaults.
- **Publish:** `site-render.mjs::brandVars()` extended: cascade `style_preset` → `brand_kit` → `brand` (brand still wins — behavior preserved).
- **Migration:** one additive column.
- **Risks:** token → CSS var mapping must stay in the pure renderer (shared) so editor preview == published.

### 7.3 SEO / schema + GEO  **[MVP]**
- **Objective:** technical-SEO automation + AI-search readiness.
- **Backend:** `sites.llms_txt`; profile-derived schema.
- **Frontend:** SEO tab → **Technical SEO & GEO** panel listing auto-artifacts (sitemap/robots/llms.txt/JSON-LD/internal-linking/OG) — *(shipped in this session's mockup)*; per-page SEO panel already exists.
- **AI:** `generateFromProfile` emits `meta` + `schema_json` (LocalBusiness/Service/FAQ) from the profile at generation time.
- **Publish:** `site-render` adds `<meta name="twitter:*">`, auto internal links (service↔location↔home), and serves `/llms.txt` via `buildLlmsTxt(site, profile, pages)`; OG-image auto-gen is **[LATER]** (needs an image service). Wire M21 (`seo-gap`/`seo-serp`) as advisory suggestions in the panel.
- **Migration:** one additive column; renderer functions are additive exports.
- **Risks:** llms.txt/sitemap must exclude drafts + never expose `?pt=`; internal-link injection must not double-link or create loops.

### 7.4 Versions / rollback  **[MVP for diff]**
- **Objective:** see-what-changed confidence.
- **Backend:** none (uses `page_versions`).
- **Frontend:** versions pane gains **Compare** → text/DOM diff of two `render_html` snapshots (client-side).
- **AI/Publish:** unchanged; restore→draft path preserved.
- **Migration:** none. Site-level release grouping = **[LATER]** (`site_releases` + `snapshot_site_release()`).
- **Risks:** large HTML diffs — cap + summarize.

### 7.5 Staging / production  **[MVP]**
- **Objective:** robust environment split + recovery.
- **Backend:** `rotate_preview_token()`; `site_publish_jobs` for deploy status.
- **Frontend:** Settings publish-controls (already has staging link + maintenance + 404) gains **Rotate preview link** + deploy-status readout.
- **Publish:** batch/expensive publishes enqueue a job; failure → re-run or restore last publish version.
- **Migration:** one RPC + one table.
- **Risks:** token rotation invalidates shared links — confirm-before-rotate.

### 7.6 Widgets  **[PREM]**
- **Objective:** managed, configurable, trackable embeds incl. blog/news + CRM.
- **Backend:** `site_widget_instances`.
- **Frontend:** editor embed blocks reference a `widget_id`; a Widgets manager per site.
- **AI:** generators can drop a booking/form widget appropriate to `conversion_type`.
- **Publish:** `hydrationScript` resolves config from `site_widget_instances` (fallback to legacy inline `data-*`); blog embed hits the shipped `blog-render` (M22) `/blog` routes.
- **Migration:** one table; existing placeholders unaffected.
- **Risks:** widget config must be workspace-scoped on resolve (service-role read filters by `site_id`→`workspace_id`).

### 7.7 Multilingual  **[PREM]**
- **Objective:** locale variants without duplicating pages.
- **Backend:** `site_locale_variants`; `sites.default_locale`.
- **Frontend:** page-meta pane gains a **Locale** switcher + per-locale draft/publish.
- **AI:** `generateFromProfile` can translate/localize sections.
- **Publish:** `site-render` locale routing = `default_locale` on `pages`, other locales from `site_locale_variants`; emit `<link rel="alternate" hreflang>`; fallback to default when a variant is missing. **Slug strategy:** subpath `/{locale}/{slug}` (default locale unprefixed) — additive to the existing renderer; per-domain locales **[LATER]**.
- **Migration:** one table; zero variants = today's behavior.
- **Risks:** hreflang correctness + canonical-per-locale; sitemap must include variants.

### 7.8 Site health / quality scoring  **[MVP]**
- **Objective:** trustworthy publish + agency dashboard visibility.
- **Backend:** `site_health_reports`; `site-health-check` Edge Fn; optional `sites.health_score`.
- **Frontend:** **Site Health tab** (score ring + category checks) + **health ring on each site card** + **pre-publish quality gate** modal — *(all shipped in this session's mockup)*.
- **AI/Publish:** at publish (and on demand), run checks against the **rendered snapshot**: SEO (title/desc present), schema (valid JSON-LD), a11y (alt text, contrast, headings), performance (image weight, est. LCP), broken links (internal), required fields (favicon/OG/canonical), + GEO (llms.txt/entity coverage). Store a report; surface the score. **Non-blocking** by default (warn-forward).
- **Migration:** one table (+ optional denormalized column).
- **Risks:** checks must be conservative and cite evidence; run async for big sites via `site_publish_jobs`.

---

## 8. Implementation Phases

> Each phase is independently shippable, gated by its own probe, and reversible (drop the new tables/columns; nothing existing changed).

**Phase 1 — Audit-safe foundations & integration debt [MVP].**
Scope: wire M06 asset picker into OG/image fields; extend leak probe scaffolding; add `sites.brand_kit`/`llms_txt`/`default_locale` + `pages.generated_from` (columns only, unused yet). Deps: none. Migration: additive columns. Release risk: minimal. Rollback: drop columns.

**Phase 2 — Business Profile + schema-first generation [MVP].**
Scope: `site_business_profiles` + `upsert_business_profile` RPC; `page-builder.mjs::generateFromProfile` (pure, emits sections+schema); Business Profile tab (mockup shipped). Deps: P1 columns. Migration: 1 table + 1 RPC. Risk: medium (generation core). Rollback: table drop; editor falls back to freeform.

**Phase 3 — Template / theme / section system [PREM].**
Scope: `site_sections` + `site_templates.scope/section_json`; Sections editor pane; brand-kit render cascade. Deps: P2. Migration: 1 table + 2 columns. Risk: low. Rollback: drop.

**Phase 4 — SEO/schema/publish quality [MVP].**
Scope: `site_health_reports` + `site-health-check` Edge Fn; pre-publish quality gate (mockup shipped); `buildLlmsTxt` + Twitter cards + internal-link injection in `site-render`; M21 advisory wiring. Deps: P2 (profile drives schema). Migration: 1 table. Risk: medium (renderer additions — snapshot parity probe required). Rollback: feature-flag the renderer additions; drop table.

**Phase 5 — Versioning/staging robustness [MVP].**
Scope: `site_publish_jobs` + pg_cron worker; `rotate_preview_token`; version compare/diff UI; deploy-status surface. Deps: P4. Migration: 1 table + 1 RPC. Risk: medium (async worker). Rollback: disable cron; synchronous path is untouched.

**Phase 6 — Widgets / multilingual / programmatic scale [PREM/LATER].**
Scope: `site_widget_instances` + hydration resolve; `site_locale_variants` + locale routing/hreflang; `builder-generate-pages` (service/location/combo/FAQ, mockup UI shipped). Deps: P2–P4. Migration: 2 tables + 1 Edge Fn. Risk: medium-high (fan-out, i18n). Rollback: drop tables; legacy embeds + single-locale render unaffected.

---

## 9. Detailed Task Breakdown (paste-ready for TASKS.md)

**Database (`0029_m19_sites_v3.sql`)**
- [ ] `alter sites add brand_kit jsonb default '{}', llms_txt text, default_locale text default 'en'`
- [ ] `alter pages add generated_from jsonb default '{}'`
- [ ] `alter site_templates add scope text default 'site' check(...), section_json jsonb`
- [ ] `create table site_business_profiles` (+RLS staff+ read/write, unique site_id, `_ws_idx`)
- [ ] `create table site_sections` (+RLS global-or-workspace read, manager+ write)
- [ ] `create table site_health_reports` (+RLS staff+ read, definer/system write)
- [ ] `create table site_locale_variants` (+RLS staff+, unique (page_id,locale))
- [ ] `create table site_widget_instances` (+RLS staff+)
- [ ] `create table site_publish_jobs` (+RLS staff+ read, definer enqueue, run_after index)
- [ ] RPCs: `upsert_business_profile`, `generate_programmatic_pages` (manager+, capped, re-derives workspace_id), `rotate_preview_token` (admin+), optional `snapshot_site_release`
- [ ] pg_cron: `site_publish_jobs` drain worker (service role)

**Edge Functions**
- [ ] `builder-generate-pages` (profile → batch pages, schema-first; meters under D-063 posture)
- [ ] `site-health-check` (rules over rendered snapshot → `site_health_reports`)
- [ ] extend `site-render`: `/llms.txt`, twitter cards, internal-link injection, locale routing + hreflang
- [ ] extend `builder-ai-generate` to accept `profile` (schema-first single page)

**Editor UI (`m19-editor.js`, `m19-sites.js`)**
- [ ] Sections pane (library) + "save selection as section"
- [ ] Brand-kit render binding to preview *(mockup panel done)*
- [ ] Locale switcher in page-meta pane
- [ ] Version compare/diff view
- [ ] Widget instance picker on embed blocks

**AI generation (`page-builder.mjs`)**
- [ ] `generateFromProfile(profile, opts)` pure fn (sections + schema)
- [ ] page-type primitives: `service`, `location`, `service_location`, `faq_cluster`
- [ ] profile → LocalBusiness/Service/FAQ JSON-LD builders

**Publish pipeline**
- [ ] pre-publish quality-gate call to `site-health-check` (advisory) *(mockup gate done)*
- [ ] batch publish → `site_publish_jobs`; failure recovery (re-run / restore last publish)

**Domain / SSL**
- [ ] read-only domain+SSL state into health report (no write-path change; D-009 preserved)

**SEO / schema**
- [ ] `buildLlmsTxt(site, profile, pages)` + sitemap includes locale variants
- [ ] internal-linking map builder; Technical-SEO panel wiring *(mockup panel done)*

**Widgets**
- [ ] `site_widget_instances` hydration resolve (fallback to legacy `data-*`)
- [ ] blog/news embed → M22 `/blog` routes

**QA (`workers/verify/`)**
- [ ] `m19v3probe.mjs`: schema/seeds, RLS cross-tenant on 6 new tables, definer-only writes, `generateFromProfile` determinism ≥95%, render snapshot parity, llms.txt/hreflang correctness, quality-gate scoring
- [ ] extend `leak_probe.sql` + `verify.sh` (m19v3 step) + Gate-8

**Docs**
- [ ] DECISIONS D-153…D-16x (profile, sections, health, locale variants, widget instances, publish jobs, brand kit, llms.txt/GEO)
- [ ] DATA-SCHEMA §12 append; EDGE-FUNCTIONS append; JOBS-AND-WORKERS append (site_publish_jobs); TASKS session entry

---

## 10. QA Checklist

**Legacy compatibility**
- [ ] Existing sites/pages render byte-identical when no v3 rows exist (best-effort reads degrade)
- [ ] `publish_page`/`save_page_version`/`revert_page`/`duplicate_page` signatures + behavior unchanged
- [ ] Existing `page_versions`, `site_templates`, `site_domains` rows untouched

**Migration safety**
- [ ] `0029` re-runnable (idempotent `add column if not exists`, `create table if not exists`, `on conflict do nothing` seeds)
- [ ] No enum churn (text + CHECK); RLS enabled in-file for all 6 tables; every table has `_ws_idx`
- [ ] Rollback script drops only new objects

**Page rendering**
- [ ] Editor preview == published output (brand_kit cascade, locale, schema)
- [ ] `render_html` stays in lockstep with `page_json` after generation/regenerate

**Publish behavior**
- [ ] Quality gate is advisory (never blocks) and records a report
- [ ] Batch generate caps + enqueues; sync single-page publish unchanged
- [ ] Publish failure recovers via re-run/restore

**Custom domains / SSL**
- [ ] Domain add/verify path unchanged; SSL scaffold still labeled (D-009)
- [ ] Health reads domain/SSL state without any write

**Schema output**
- [ ] JSON-LD valid per type (LocalBusiness/Service/FAQ/Product/Event); profile-derived schema matches profile
- [ ] Twitter + OG tags present

**sitemap / robots / llms**
- [ ] sitemap includes published pages + locale variants, excludes drafts + `?pt=`
- [ ] robots points to sitemap; llms.txt excludes secrets/drafts

**Version rollback**
- [ ] Restore→draft works; diff/compare renders; last-10-per-kind pruning intact

**Widget embeds**
- [ ] Legacy `data-embed` placeholders still hydrate; `site_widget_instances` resolve is workspace-scoped
- [ ] Calendar (M14) + form (M15) + blog (M22) embeds live; chat labeled scaffold

**Multilingual routing**
- [ ] `/{locale}/{slug}` resolves; missing variant falls back to default; hreflang correct; canonical per locale

**RLS / permissions**
- [ ] Cross-tenant SELECT/INSERT denied on all 6 tables (leak probe green)
- [ ] Programmatic generate = manager+; profile edit = staff+; token rotate = admin+; health write = system-only
- [ ] `generate_programmatic_pages` ignores client-supplied `workspace_id`

**Performance / accessibility**
- [ ] No Gate-6 horizontal scroll on new panels (mobile) in both themes
- [ ] New panes keyboard-navigable; health/quality badges have text equivalents
- [ ] Batch generation does not block the UI thread (async job)

---

## 11. Changelog Draft (internal release notes)

> **M19 Sites v3 — Flagship AI Website Builder (additive, migration `0029`)**
>
> **New**
> - **Business Profile** per site — one structured source (services, service areas, differentiators, exclusions, proof points, testimonials, address/phone/hours) that now powers AI generation, SEO, schema, and programmatic pages instead of a freeform prompt.
> - **Schema-first generation** — pages are drafted from the Business Profile and ship with LocalBusiness/Service/FAQ JSON-LD, meta, and canonical out of the box.
> - **Programmatic pages** — bulk-generate Service, Location, and Service×Location pages (each SEO-optimized, schema-bearing, internally linked) from the profile.
> - **Site Health & pre-publish quality gate** — every publish runs SEO, schema, accessibility, performance, broken-link, required-field, and GEO checks; each site gets a health score surfaced on its card and a Site Health tab; a publish-time checklist flags issues before a client site goes live.
> - **Brand kit** — structured design tokens (type scale, palette, radius, shadow, spacing) re-theme an entire site in one edit; layered above style presets, brand overrides always win.
> - **Technical SEO & GEO** — auto-generated `llms.txt`, Twitter cards, automatic internal linking, and sitemap coverage for locale variants — legible to AI answer engines, not just search crawlers.
> - **Section library** — reusable section/block primitives (global + workspace), plus "save selection as section."
> - **Locale variants** — per-language content variants without duplicating pages; `/{locale}/{slug}` routing, hreflang, and default-locale fallback.
> - **Managed widgets** — form/calendar/chat/blog/CRM embeds become configurable, trackable widget instances.
> - **Publish jobs & recovery** — an async lane for batch work with deploy status and failure re-run; rotatable preview links.
>
> **Preserved** — all existing sites, pages, versions, custom domains, SSL flow, publish behavior, RLS tiers, and the staging preview token work exactly as before. v3 is entirely additive; a database without `0029` renders unchanged.

---

## 12. Open Questions

1. **D-063 (LLM provider)** — which model/provider powers real generation, and how is it metered? Until answered, `generateFromProfile` ships as the deterministic engine (schema-first) and the LLM is a swap-in.
2. **D-009 (hosting/SSL)** — unblocks live custom-domain SSL and could change whether `llms.txt`/sitemap are served by `site-render` or edge-cached statically. v3 assumes Edge-Function serving.
3. **Health-score authority** — denormalize `sites.health_score` for fast card reads, or always read the latest `site_health_reports` row? (Recommend denormalized + trigger for dashboards.)
4. **Locale slug strategy** — subpath (`/{locale}/…`, recommended) vs per-domain vs query param; and whether default-locale pages ever get a prefix.
5. **Programmatic scale caps** — hard ceiling per generate call and per workspace (recommend ≤60/call, async beyond); dedupe rule when a service/location page already exists.
6. **Quality-gate blocking** — stays advisory (recommended) or can an agency mark certain checks as hard blockers per workspace?
7. **Section vs template overlap** — do we keep both `site_sections` and `site_templates.scope='section'`, or collapse into one? (Recommend `site_sections` as the primitive; templates reference sections.)
8. **DECISIONS id confirmation** — verify D-152 is the last committed id before allocating D-153…; verify `0029` is still the next free migration at merge time (parallel-build churn per repo memory).
9. **Site-level release/rollback** — is per-page versioning enough, or do agencies need an atomic "roll the whole site back to release N"? (Deferred to `site_releases` [LATER].)
10. **OG-image auto-generation** — needs an image-render service; in-scope for v3 or later?
```
