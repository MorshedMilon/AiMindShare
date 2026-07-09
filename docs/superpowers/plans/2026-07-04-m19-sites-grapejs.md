# M19 — Sites (GrapeJS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax. This stack has no unit-test runner; the "tests" are
> the **PGlite probe** (`workers/verify/m19probe.mjs`) for the DB/RLS layer and **preview + Gate-8** for the UI —
> the established M09–M28 rhythm. Write the probe assertion first (it fails), then the migration/RPC, then re-run.

**Goal:** Ship M19 Sites — AI-generated `page_json`, a GrapeJS editor, publish + versioning, a public Edge-Function
renderer with per-page SEO/JSON-LD/cookie-banner/pixel, custom-domain + SSL flow, and CRM widget embeds — vertical to
Definition-of-Done on the vanilla + Supabase stack.

**Architecture:** New migration `0020_m19_sites.sql` (6 tables + 4 enums + RLS + 3 SECURITY DEFINER RPCs + tracking
wiring). Four Edge Functions (`builder-ai-generate`, `site-render`, `domain-verify`, `site-track`). Front end:
`m19-sites-grapejs.html` + `js/m19-sites.js` + `js/m19-editor.js` + pure `js/site-render.mjs` + `styles/m19-sites.css`
+ vendored GrapeJS. Verified by `m19probe.mjs` + `verify.sh` + Gate-8 + preview.

**Tech Stack:** Postgres/RLS, Supabase Edge Functions (Deno), pg_cron/jobs, vanilla HTML/CSS/JS, GrapeJS (vendored),
SortableJS (already vendored), PGlite (probe).

Full design + rationale: `docs/superpowers/specs/2026-07-04-m19-sites-grapejs-design.md`.

---

### Task 1: Migration `0020_m19_sites.sql` — enums, tables, RLS

**Files:**
- Create: `supabase/migrations/0020_m19_sites.sql`
- Test: `workers/verify/m19probe.mjs` (leak + role-matrix assertions)

- [ ] **Step 1 — probe scaffold (failing):** create `m19probe.mjs` loading `0000`→`0020` into PGlite (copy the
  loader from `m14probe.mjs`), asserting: all 6 tables exist + RLS enabled; cross-tenant SELECT on
  `sites`/`pages`/`page_versions`/`site_domains`/`visitor_sessions` = 0 rows for a non-member; `site_templates`
  readable by any authed user. Run `node workers/verify/m19probe.mjs` → FAILS (migration absent).
- [ ] **Step 2 — write the migration:** 4 enums (`site_status`, `page_status`, `domain_status`, `ssl_status`,
  idempotent DO-block per `0000`); the 6 tables per spec §3 (each with `workspace_id`, `set_updated_at` trigger,
  indexes on `workspace_id` + FKs); standard RLS per table with the tier overrides — sites/pages read+ins+upd=staff+,
  del=manager+; `site_domains` ins/upd/del=admin+; `page_versions`/`visitor_sessions` no client insert (service/
  definer only); `site_templates` `workspace_id` nullable + `SELECT to authenticated using (true)`. Guard cron/
  realtime statements for PGlite (`do $$ begin … exception when others then null; end $$;`).
- [ ] **Step 3 — run probe:** `node workers/verify/m19probe.mjs` → leak + RLS assertions PASS.
- [ ] **Step 4 — Gate-8 on the file:** `bash scripts/gate8.sh` (or grep) → the migration has RLS on every new table,
  no raw hex, no dead-stack tokens. Clean.
- [ ] **Step 5 — commit:** `feat(m19): 0020 sites/pages/versions/domains/templates/visitor_sessions + RLS`.

---

### Task 2: RPCs — `publish_page`, `revert_page`, `duplicate_page`

**Files:**
- Modify: `supabase/migrations/0020_m19_sites.sql` (append the RPCs)
- Test: `workers/verify/m19probe.mjs`

- [ ] **Step 1 — probe assertions (failing):** assert `publish_page` by a **staff** caller raises (manager+ only);
  by a manager it creates a `page_versions` row `version_no=1`, sets `pages.status='published'` + `published_at`,
  and flips the site to `published`; a **second** publish → `version_no=2`; after 11 publishes only the **last 10**
  versions remain. Assert `revert_page(page,1)` restores v1's `page_json`. Assert `duplicate_page` copies within the
  site with a unique slug. Run → FAILS.
- [ ] **Step 2 — write the RPCs** (SECURITY DEFINER, `has_role(ws,'manager')` guard line-1 for publish/revert,
  `has_role(ws,'staff')` for duplicate; version prune via `delete … where version_no <= max-10`).
- [ ] **Step 3 — run probe** → PASS.
- [ ] **Step 4 — commit:** `feat(m19): publish/revert/duplicate page RPCs + version prune`.

---

### Task 3: Tracking wiring + `page.visited` trigger + SSL scaffold

**Files:**
- Modify: `supabase/migrations/0020_m19_sites.sql` (tracking notes), `_shared` registry for `emit_trigger`
- Modify: `JOBS-AND-WORKERS-SPEC-v1_0.md` (register `site.ssl_provision`), `workers/worker.mjs` (scaffold handler)
- Test: `workers/verify/m19probe.mjs`

- [ ] **Step 1 — probe (failing):** assert a service-role insert into `visitor_sessions` succeeds and a browser-role
  insert is **denied**; assert that calling `log_activity(ws, contact, 'page_visit', …)` appends a timeline row and
  `emit_trigger(ws,'page.visited',…)` enrols a matching workflow (reuse the M13 emit assertions pattern). Run → FAILS.
- [ ] **Step 2 — implement:** register `page.visited` as a real trigger source in the M13 trigger registry
  (`_shared/triggerTypes.ts` + `frontend/js/*` mirror if present); add the `site.ssl_provision` job type to
  JOBS-AND-WORKERS-SPEC §6 + a documented scaffold handler in `worker.mjs` (logs "deferred pending D-009").
- [ ] **Step 3 — run probe** → PASS.
- [ ] **Step 4 — commit:** `feat(m19): visitor_sessions RLS + page.visited trigger + ssl_provision scaffold`.

---

### Task 4: Pure render module `js/site-render.mjs`

**Files:**
- Create: `frontend/js/site-render.mjs`
- Test: `workers/verify/m19renderprobe.mjs` (Node, imports the pure module)

- [ ] **Step 1 — probe (failing):** `renderPage({site, page})` returns an HTML string that contains: the page title
  in `<title>`, the meta description, a JSON-LD `<script type="application/ld+json">` for `schema_type='LocalBusiness'`,
  the brand CSS vars, the `render_css` in a `<style>`, the `render_html` in `<body>`, and the cookie-banner + pixel +
  hydration script markers. `buildSitemap(site, pages)` returns valid XML with only published slugs. Run → FAILS.
- [ ] **Step 2 — implement** `site-render.mjs` (pure, no DOM/Deno): `renderPage`, `buildSitemap`, `buildRobots`,
  `hydrationScript()` (returns the string that mounts `data-embed` placeholders: calendar→M14 iframe, form→M15 fetch
  scaffold, chat→M12 scaffold). ESM `export`s.
- [ ] **Step 3 — run probe** → PASS.
- [ ] **Step 4 — commit:** `feat(m19): pure site-render module (head/shell/sitemap/robots/hydration)`.

---

### Task 5: Edge Functions

**Files:**
- Create: `supabase/functions/builder-ai-generate/index.ts`, `supabase/functions/site-render/index.ts`,
  `supabase/functions/domain-verify/index.ts`, `supabase/functions/site-track/index.ts`
- Create: `supabase/functions/_shared/pageSchema.ts` (Zod-lite validator + niche templates + repair)
- Modify: `supabase/config.toml` (4 entries; `site-render`/`site-track` `verify_jwt=false`)
- Reuse: `_shared/envelope`, `_shared/auth` (`userClient`, `requirePermission`/`has_role`), `_shared/cors`

- [ ] **Step 1 — `pageSchema.ts`:** a dependency-free schema `validatePageJson(x)` (sections array shape) + one
  `repairPageJson(x)` pass + `generateFromNiche(desc, niche)` returning a valid `page_json` (hero/features/
  testimonials/pricing/FAQ/CTA/footer with real seed copy). Node-importable so the probe can test it.
- [ ] **Step 2 — probe (failing):** `m19renderprobe.mjs` also asserts `generateFromNiche` output passes
  `validatePageJson` for 5 niches, and that a deliberately-broken input is repaired to valid (≥95% AC deterministic).
  Run → FAILS, then implement Step 1 to PASS.
- [ ] **Step 3 — `builder-ai-generate/index.ts`:** auth staff+ → `generateFromNiche` → validate+repair → return
  `{page_json}`; clone-URL/voice branches return a labeled `scaffold` envelope; **no meter call** (documented).
- [ ] **Step 4 — `site-render/index.ts`:** service-role; resolve host→site (domain active / subdomain); path route
  `/sitemap.xml`,`/robots.txt`, else the published page; import `site-render.mjs` `renderPage`; 404 shell otherwise.
- [ ] **Step 5 — `domain-verify/index.ts`:** auth admin+; look up `site_domains`; do a DNS TXT/CNAME check (Deno
  `Deno.resolveDns`), flip `status`, set `ssl_status='pending'` with a logged D-009 scaffold note.
- [ ] **Step 6 — `site-track/index.ts`:** service-role; upsert `visitor_sessions` by `(site_id, visitor_id)`, append
  the view; if `contact_id`/`?ce=` present, `log_activity` + `emit_trigger('page.visited')`; return a 1×1 gif.
- [ ] **Step 7 — `config.toml`** entries. Gate-8 secrets grep clean (no keys in code). Commit:
  `feat(m19): edge functions (ai-generate, render, domain-verify, track) + page schema`.

---

### Task 6: Vendor GrapeJS + editor `js/m19-editor.js`

**Files:**
- Create: `frontend/vendor/grapes.min.js`, `frontend/vendor/grapes.min.css`
- Create: `frontend/js/m19-editor.js`

- [ ] **Step 1 — vendor GrapeJS** (UMD build, no CDN at runtime). If any `monospace`/raw-hex in the vendored CSS trips
  Gate-8, retokenise in-file to `var(--font-mono)`/nearest token (Drawflow precedent, D-060). Document the version.
- [ ] **Step 2 — `m19-editor.js`:** `initEditor(el, {pageJson, brand, onSave, canPublish})` → GrapeJS with **no
  preset**; configure DeviceManager (Desktop/Tablet768/Mobile375), BlockManager (the spec §5.4 block set incl. the 3
  custom `data-embed` components with traits), StyleManager sectors (Typography/Spacing/Background/Border/Layout with
  token defaults), LayerManager, TraitManager, UndoManager (50). `exportPage()` → `{page_json, render_html,
  render_css}`. Wire the toolbar (device/undo/redo/AI/preview/save/publish).
- [ ] **Step 3 — preview mount smoke test** later in Task 8; commit now:
  `feat(m19): vendor GrapeJS + editor init with custom embed blocks`.

---

### Task 7: App shell + `/sites` + `/sites/:id` — `m19-sites-grapejs.html` + `js/m19-sites.js` + `styles/m19-sites.css`

**Files:**
- Create: `frontend/m19-sites-grapejs.html`, `frontend/js/m19-sites.js`, `frontend/styles/m19-sites.css`

- [ ] **Step 1 — HTML shell:** copy the head/boot/theme/rail/topbar pattern from `m14-calendar-and-booking.html`
  (tokens.css → app.css → components.css → m19-sites.css; `THEME_KEY` const; supabase-js vendored; mockup-mode
  preview switcher). Hash routes `#/sites`, `#/sites/:id`, `#/sites/:id/edit/:pageId`.
- [ ] **Step 2 — `/sites`** list: site cards (favicon/name/status pill/page count/domain+copy/last-published mono/
  actions), New-Site modal (AI/Blank/Template), empty/loading(skeleton)/error/success states.
- [ ] **Step 3 — `/sites/:id`** detail: tabs Pages / Navigation (SortableJS reorder) / Domains (connect wizard +
  CNAME/TXT copy + Verify + SSL scaffold pill) / SEO defaults / Settings (brand + danger zone). All states.
- [ ] **Step 4 — data layer:** anon-client reads via RLS; writes via RPC/Edge-Fn (`functions.invoke`); honest offline
  sample data behind the preview switcher (labeled), no mock in the live path.
- [ ] **Step 5 — commit:** `feat(m19): sites list + site detail (pages/nav/domains/seo/settings)`.

---

### Task 8: Editor screen `/sites/:id/edit/:pageId` + AI panel + preview

**Files:**
- Modify: `frontend/m19-sites-grapejs.html`, `frontend/js/m19-sites.js`, `frontend/styles/m19-sites.css`

- [ ] **Step 1 — editor chrome:** left(Blocks/Layers/Templates) · canvas · right(Styles/Settings/Page-meta) · top
  toolbar; mount `initEditor` with the page's `page_json`. Mobile → read-only outline + "edit on desktop".
- [ ] **Step 2 — Save/Publish:** Save → `exportPage()` → update `pages` (draft); Publish → `publish_page` RPC
  (disabled+tooltip for staff). Autosave indicator.
- [ ] **Step 3 — AI panel:** Describe → `builder-ai-generate` → load `page_json`; Clone/Voice labeled scaffolds;
  per-section "Rewrite" scaffold. Calm generating state.
- [ ] **Step 4 — Page-meta tab:** SEO title/description/OG(URL scaffold)/canonical/robots + schema type + JSON-LD.
- [ ] **Step 5 — Preview:** use `site-render.mjs` `renderPage` in-browser to open a rendered preview tab.
- [ ] **Step 6 — commit:** `feat(m19): GrapeJS editor screen + AI generate + page meta + preview`.

---

### Task 9: Seeds + docs + verify wiring

**Files:**
- Modify: `supabase/seed.sql`, `DATA-SCHEMA-v1_0.md`, `DECISIONS-AiMindShare-v1_0.md`,
  `JOBS-AND-WORKERS-SPEC-v1_0.md`, `EDGE-FUNCTIONS-SPEC-v1_0.md`, `scripts/verify.sh`, `workers/verify/leak_probe.sql`,
  `verify-status.json`, `TASKS.md`

- [ ] **Step 1 — seed:** Acme sample site + home page (published, real `page_json`/render) + a custom domain (pending)
  + ~6 real `site_templates` (by niche) + a visitor session. Labeled sample.
- [ ] **Step 2 — docs:** DATA-SCHEMA §12 implementation note; DECISIONS **D-084…D-090**; JOBS §6 (`site.ssl_provision`);
  EDGE-FUNCTIONS-SPEC (4 new fns); `leak_probe.sql` M19 read/write guards.
- [ ] **Step 3 — verify wiring:** add the M19 step to `scripts/verify.sh`; `verify-status.json` m19 entry.
- [ ] **Step 4 — commit:** `docs(m19): schema/decisions/jobs/edge/seed/verify wiring`.

---

### Task 10: Full verification + DoD close

- [ ] **Step 1 — probes:** `node workers/verify/m19probe.mjs` (target ~40+ asserts green) +
  `node workers/verify/m19renderprobe.mjs` green.
- [ ] **Step 2 — no-regression:** `bash scripts/verify.sh` — all prior probes still green.
- [ ] **Step 3 — Gate-8:** `bash scripts/gate8.sh` → CLEAN for M19 files (dead-stack/secrets/shimmer/hex/fonts/RLS).
- [ ] **Step 4 — preview:** launch the frontend; verify `/sites`, `/sites/:id`, the editor (GrapeJS mounts, blocks
  drag, AI generate loads a page, save/publish, page-meta), and a rendered published page — light+dark (dark=no
  stars), responsive 360/768/1280 (no page h-scroll), zero console errors. Screenshot proof.
- [ ] **Step 5 — DoD ritual in TASKS.md:** Gates 1–9 with evidence; carry-overs (live Edge Fn/DNS/SSL/LLM "ready,
  not run"); DECISIONS added; parallel-session/number-collision flags. Commit: `chore(m19): DoD close — TASKS + gates`.

---

## Self-review

- **Spec coverage:** §3 schema→T1/T2/T3; §4 RLS→T1/T2 probe; §5 GrapeJS editor→T6/T8; §6 renderer→T4/T5; AI→T5/T8;
  domains/SSL→T5/T7; SEO/schema→T4/T8; cookie+pixel→T4/T5; embeds→T4/T6; verification §8→T10; DECISIONS §9→T9. All
  covered.
- **Placeholders:** none — each task names exact files + concrete behavior. (Code bodies are large SQL/JS written at
  execution against the real shared files, per repo TDD-via-probe rhythm.)
- **Type consistency:** `exportPage()`/`initEditor()`/`renderPage()`/`generateFromNiche()`/`validatePageJson()`/
  `publish_page`/`revert_page`/`duplicate_page` used consistently across tasks.
