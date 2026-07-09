# M22-manual — Content/CMS (Manual) Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. Build order is layered:
> schema → RLS → RPCs → PGlite probe (TDD gate) → Edge Fn + render probe → frontend →
> full verify.sh → preview → docs. Each layer has a verify checkpoint before the next.

**Goal:** Ship the M22 manual CMS (articles, revisions, categories/authors, editorial queue,
client-side readability/SEO scoring, publish to M19 blog routes) to full Definition-of-Done.

**Architecture:** 4 RLS-scoped tables + definer RPCs in `0025_m22_content.sql`; a `blog-render`
Edge Function serving M19 site blog routes + RSS; a hand-rolled contenteditable editor in vanilla JS;
a `m22-scheduled-publish` pg_cron flip. Verified by a PGlite SQL probe + a Node render probe.

**Tech Stack:** Supabase Postgres/RLS/Edge Functions/pg_cron, PGlite probes, vanilla HTML/CSS/JS,
reuse of M06 `AssetPicker` + M13 `emit_trigger` + M19 `sites`/`pages`.

Reference: spec `docs/superpowers/specs/2026-07-04-m22-manual-content-cms-design.md`.

---

### Task 1: Migration — tables, enum, indexes, RLS

**Files:** Create `supabase/migrations/0025_m22_content.sql`

- [ ] Enum `article_status`; `blog_articles`, `article_revisions`, `article_categories`,
      `article_authors` per spec §2 (all `workspace_id not null` + index; guarded enum; `vector(1536)`
      embedding nullable scaffold).
- [ ] `enable row level security` + policies per spec §3 on all four tables (staff+ CRUD, manager+
      delete; revisions select-only). `set_updated_at` triggers on articles/categories.
- [ ] Verify: `grep -L 'enable row level security' 0025*.sql` returns nothing; every `create table`
      paired with a policy (Gate-8 Law 2).

### Task 2: Migration — definer RPCs + cron

**Files:** Modify `supabase/migrations/0025_m22_content.sql`

- [ ] RPCs per spec §4: `save_article_revision`, `restore_article_revision`, `publish_article`
      (build JSON-LD + `emit_trigger('article.published')` tolerant), `schedule_article`,
      `submit_for_review`, `approve_article`, `reject_article`, `publish_due_articles`.
      Each `revoke all from public; grant execute to authenticated[,service_role]` with role re-checks.
- [ ] `m22-scheduled-publish` pg_cron (`*/15 * * * *`) → `publish_due_articles()`, guarded for PGlite.

### Task 3: PGlite probe — the TDD gate (write, run, must pass)

**Files:** Create `workers/verify/m22probe.mjs` (mirror `m06probe.mjs`/`m19probe.mjs`)

- [ ] Assertions per spec §9: cross-tenant leak ×4 · role matrix (staff edit / manager
      publish+delete+approve / client ceiling) · append-only revisions · snapshot+prune-20+restore ·
      publish flips+schema+trigger · schedule→due→publish, skip-future · editorial transitions +
      feedback persist · slug uniqueness · category/author scoping.
- [ ] Run `node workers/verify/m22probe.mjs`; iterate migration until **all green**.

### Task 4: Blog-render Edge Function + render probe

**Files:** Create `supabase/functions/blog-render/index.ts`; modify `supabase/config.toml`;
create `workers/verify/m22renderprobe.mjs`

- [ ] `blog-render` (verify_jwt=false, service-role, status='published' filter): index list,
      `/blog/[slug]` (article + JSON-LD + meta), category page, `?format=rss` RSS 2.0. Theme from
      site `brand`. Reuse `_shared/envelope` where applicable.
- [ ] `config.toml` `[functions.blog-render] verify_jwt = false`.
- [ ] Render probe (Node): only-published in index, slug page has JSON-LD + meta, RSS well-formed,
      unpublished → 404. Run until green.

### Task 5: Frontend — shell, articles table, taxonomy

**Files:** Create `frontend/m22-manual-content-cms.html`, `frontend/js/m22-content.js`,
`frontend/styles/m22-content.css`; modify `.claude/launch.json`

- [ ] Hash-routed shell (rail + topbar, reuse components.css); `/content` articles table (filters +
      bulk + all Gate-5 states + mockup switcher); `/content/taxonomy` categories + authors managers.
- [ ] `m22-preview` launch config. Tokens-only, 3 fonts, dark = no stars.

### Task 6: Frontend — editor + SEO sidebar + revisions

**Files:** Modify `frontend/js/m22-content.js`, `frontend/styles/m22-content.css`

- [ ] `/content/[id]`: contenteditable editor (toolbar + slash menu + link popup + internal-link
      search + M06 AssetPicker image insert) + live readability (Flesch) + SEO rubric sidebar
      (score ring, checklist, density, meta length meters, featured image, category/author) + revisions
      panel (autosave list + restore). Save/Submit/Schedule/Publish actions (role-gated).

### Task 7: Frontend — review queue + settings

**Files:** Modify `frontend/js/m22-content.js`, `frontend/styles/m22-content.css`

- [ ] `/content/review` editorial cards (SEO+readability scores, approve→publish / reject→feedback
      modal). `/settings/content` per-site defaults + labeled S23 auto-blog scaffold section.

### Task 8: Seed, leak-probe, verify.sh wiring

**Files:** Modify `supabase/seed.sql`, `supabase/tests/leak_probe.sql`, `scripts/verify.sh`,
`workers/verify/verify-status.json`

- [ ] Seed Acme site articles across every status + categories + authors + a few revisions (honest
      dashboard data). Extend `leak_probe.sql` (B can't read/write A's M22 rows). Add m22 + m22render
      steps to `verify.sh`; add m22 to `verify-status.json`.
- [ ] Run full `bash scripts/verify.sh` (or per-probe on Windows) — no regressions.

### Task 9: Gate-8 greps + preview verification

- [ ] Run the 5 Gate-8 greps; clean for M22 files (rework any own false positives).
- [ ] `preview_start m22-preview`; verify all 5 screens both themes, 0 h-scroll @ 360/768/1280,
      Gate-5 states, editor + scoring live, zero console errors. Screenshot proof.

### Task 10: Docs + TASKS close

**Files:** Modify `DATA-SCHEMA-v1_0.md`, `TASKS.md`, `JOBS-AND-WORKERS-SPEC` (§5), M13 trigger
registry (`_shared/triggerTypes.ts` + js mirror)

- [ ] DATA-SCHEMA §9 implementation note; DECISIONS D-120…D-127; JOBS §5 cron; register
      `article.published` trigger; TASKS Session 22 close note with all 9 gates + carry-overs +
      DECISIONS + renumber-on-merge flag.

---

## Self-review

Spec coverage: §2→T1, §3→T1, §4→T2, §5→T4, §6→T6, §7→T5/6/7, §8→T2/T8, §9→T3/T4/T8/T9, §10→T10 — all
covered. No placeholders (probe assertion code lives in T3's file, written at build time from spec §9).
Type consistency: RPC names match spec §4 verbatim. Gate mapping: G1→T3/T8, G2→T3, G3 none, G4→T2,
G5→T5-7, G6→T9, G7→T4, G8→T9, G9→T10.
