# M22 — Content / CMS (manual slice) · Design Spec
**Session 22 (built out of order under Session 23's prompt) · Phase 3 (SEO & Content) · 2026-07-05**
**Status:** approved (design review passed 2026-07-05)

> Attach list: Constitution (CLAUDE-AiMindShare) · DECISIONS · DATA-SCHEMA (§9 Blog/CMS slice) ·
> RLS-AND-SECURITY · PRD_M22 · BUILD-SEQUENCE (rows 22 + 23) · DEFINITION-OF-DONE · TASKS.md ·
> AIMINDSHARE-DESIGN. Stack is locked: vanilla HTML/CSS/JS + Supabase (Postgres + RLS + Edge Functions +
> Vault + Storage + Realtime + pg_cron + jobs). No Next.js / Prisma / BullMQ / Redis / React / TipTap-npm.

---

## 0. Dependency & blocker check (done before design)

**Why this is Session 22, not 23.** The Session 23 prompt asked for **M22-auto** (the auto-blog pipeline).
That slice writes generated articles into the CMS substrate — `blog_articles`, revisions, review queue,
publish-to-M19 — which **did not exist** (no migration, no `blog_articles` table, no frontend). Per the
prompt's own "stop and flag if dependencies aren't Done" rule, M22-auto is blocked. User chose to build the
**manual CMS substrate first** (BUILD-SEQUENCE row 22). This spec is that substrate.

**Ready (deps Done in TASKS.md):**
- **M19 Sites** (`0022_m19_sites.sql`): `sites`, `site_domains`, published-page model, the pure
  `frontend/js/site-render.mjs` + `site-render` Edge Fn (D-100: host→site→published→full HTML w/ SEO meta +
  JSON-LD + brand vars + cookie banner + tracking; draft slugs 404, D-105). Blog rendering reuses these pure
  helpers; **`site-render` itself is not edited** (surgical — a Done module stays untouched).
- **M06 Media Library** (`0021_m06_media.sql`): `media_assets` + private Storage bucket + signed URLs. The
  editor's image-insert and featured-image picker read from here (asset id → signed URL).
- **M03 Billing** (`0009_m03_billing.sql`): `meter_increment` / `meter_check` / `has_feature`. **This slice
  has no billable action** (no AI, no provider call) — metering wires in the M22-auto slice
  (`ai.tokens` / `ai.image`).
- **jobs + pg_cron** (`0002_jobs.sql`, `0005_cron_and_vault.sql`): the control-plane pattern for the
  scheduled-publish cron below.

**Deferred deps (honest scaffold, NOT built here):**
- **M21 SEO Engine** — keyword research / SERP / send-to-queue. The `content_queue` it feeds is a **M22-auto**
  table; not created here.
- **M35 Creative Studio** — DALL·E featured images. Manual featured image = pick an existing M06 asset or paste
  a URL; generation is auto-slice.

**Blocking OPEN decisions (not resolved in a build session — scoped around, not through):**
- **D-010 · heavy-job worker runtime · OPEN** — "Blocks Phase 3 auto-blog *at scale*." Manual CMS does no
  heavy jobs, so it is unaffected; the note stands for M22-auto.
- **LLM provider · OPEN** (DECISIONS ~L743, same posture as D-063 M13-AI). Manual CMS calls no LLM. SEO /
  readability scoring is **deterministic client-side**, so it ships fully today with no provider.
- **D-009 · hosting · OPEN** — public route mounting under a site host is a scaffold, exactly as M19's
  domain/SSL scaffold. The `public-blog` function is built to full contract, path-routing pends D-009.

**Environment:** no Docker / Supabase CLI / Deno / hosted project on this machine. Migration + Edge Fn are
built to full contract and verified **"ready, not run"** via a PGlite leak-probe + code review — identical to
every prior session. Next free migration on disk is **`0025`** (highest is `0024_m16_campaigns`); re-checked at
write time for parallel-build churn.

---

## 1. Scope slice (full-DoD vs honest scaffold)

BUILD-SEQUENCE row 22: *"Blog manager, revisions, categories/authors, editorial queue, readability/SEO
scoring, publish to M19 sites."* Plus public rendering (user-approved) to close the publish loop.

**Full DoD this slice:**
- **Article manager** — table (title, status, SEO score, words, category, author, updated/published);
  filters (status / category / search); bulk archive / delete / publish.
- **Editor** — contenteditable body + toolbar (H2/H3, bold/italic, link, lists, quote, code, image-from-M06),
  `/` slash menu, internal-link search popup; **live SEO sidebar** (deterministic score, keyword checklist,
  density, meta fields w/ char counters, featured-image picker, Flesch–Kincaid readability, schema/FAQ preview).
- **Revisions** — debounced autosave → `article_revisions` snapshot; history drawer with restore.
- **Categories + authors** — CRUD; authors = pen names or linked workspace users.
- **Editorial / review queue** — `status=in_review` cards w/ scores; **approve→publish** or
  **send-back-to-draft with a note** (the note is stored on the article for the auto-slice regen prompt).
- **Scheduled publishing** — `status=scheduled` + `scheduled_for`; `pg_cron` flips to `published`.
- **Public rendering** — `public-blog` Edge Fn: `/blog`, `/blog/[slug]`, `/blog/category/[slug]`, `/rss.xml`;
  Article + FAQ JSON-LD; published rows only; drafts/scheduled 404.

**Honest scaffold / deferred (flagged, never faked):**
- `content_queue`, `content_schedules`, `blog.generate` worker chain, generation cron, bulk CSV, DALL·E images,
  SERP calls, metering → **M22-auto (Session 23)**.
- **Reject→regenerate** is auto-only; manual review offers **approve** / **send-back-with-note** only.
- **Client-portal approval** (RLS §4 lists `blog_articles` as a portal-approval table) → **deferred to M37**,
  exactly as M19 sites / M20 funnels deferred portal (D-089/D-109).
- Per-site auto settings (frequency, brand voice, target words) belong to `content_schedules` → auto-slice.
  Manual settings = default category / default author / blog base path.

---

## 2. Data model — migration `0025_m22_content_cms.sql`

All tables carry `workspace_id uuid not null`, `id uuid pk default gen_random_uuid()`, timestamps.

- **`article_categories`** (workspace_id, site_id → sites, name, slug, description) · `unique(site_id, slug)`.
- **`article_authors`** (workspace_id, name, slug, bio, avatar_url, `user_id uuid null` → auth.users for a
  real member; null = pen name) · `unique(workspace_id, slug)`.
- **`blog_articles`** (workspace_id, `site_id` → sites, `category_id` → article_categories null,
  `author_id` → article_authors null, keyword, title, slug, excerpt, content_html, meta_title, meta_desc,
  featured_image_url, `tags text[]`, `faqs jsonb` `[{q,a}]`, `schema jsonb`, `seo_score int`,
  `readability_score numeric`, `word_count int`, `status` `article_status`, `scheduled_for timestamptz null`,
  `published_at timestamptz null`, `review_note text null`, `created_by uuid`) · `unique(site_id, slug)`.
- **`article_revisions`** (workspace_id, `article_id` → blog_articles on delete cascade, `version_no int`,
  title, content_html, `saved_by uuid`, saved_at) · append-only snapshot; `unique(article_id, version_no)`.

`create type article_status as enum ('draft','in_review','scheduled','published','archived');`

**Deferred (NOT in this migration):** `content_queue`, `content_schedules` → M22-auto.

**RLS — operator-ceiling** (mirrors M19 D-089 / M20 D-109; content is an operator surface published to sites):
```
SELECT = has_role(workspace_id,'staff')      -- a future client role reads nothing here (M37 narrows later)
INSERT = has_role(workspace_id,'staff')
UPDATE = has_role(workspace_id,'staff')
DELETE = has_role(workspace_id,'manager')
```
`article_revisions`: SELECT/INSERT = staff+, **no UPDATE**, DELETE = manager (cascades with article). Every
`create table` is paired with `enable row level security` + the policies (Gate-8 migration grep).

**Publish helper (SECURITY DEFINER, staff-guarded):** `publish_article(article_id)` sets `status='published'`,
`published_at=now()`, builds `schema` JSON-LD server-side (Article + FAQ from `faqs`) so the browser can't
forge structured data. `schedule_article(article_id, when)` sets `scheduled`+`scheduled_for`.

---

## 3. Editor + SEO scoring

Single page view (`#/content/:id`) in `m22-content-cms.html`, two-pane:
- **Left — contenteditable** (`frontend/js/content-editor.mjs`): toolbar + `/` slash menu + link/image popups.
  Image insert opens an M06 asset picker (returns asset id → signed URL). Internal-link popup queries this
  site's `status='published'` articles by title. Output is **clean semantic HTML** (allowlist sanitize on the
  block set — h2/h3/p/ul/ol/li/blockquote/pre/a/img/strong/em) → `content_html`. No raw script/style.
- **Right — SEO sidebar** (`frontend/js/content-seo.mjs`, **pure + unit-testable, deterministic, no provider**):
  keyword in title / H1 / first paragraph / meta_title / meta_desc; keyword density band (0.5–2.5%); meta_title
  ≤60 / meta_desc ≤160 char counters; word-count vs target; internal + external link counts; image count + alt
  coverage; **Flesch–Kincaid** readability. Weighted 0–100 score + a pass/warn/fail checklist. Recomputed
  debounced on edit; `seo_score` / `readability_score` / `word_count` persisted on save.

**No billable action** → Gate 3 satisfied by explicit "no billable action" close note.

---

## 4. Revisions & scheduled publish

- **Autosave:** debounced (≈2s idle) PATCH of the article + a throttled `article_revisions` snapshot (new
  `version_no = max+1`) when content changed since the last snapshot. History drawer lists versions
  (saved_at / saved_by); **restore** copies a version's title+html back into the editor (which then autosaves a
  new forward version — never mutates history).
- **Scheduled publish:** `pg_cron` **`m22-publish-scheduled`** (`*/5 * * * *`) runs
  `publish_scheduled_articles()` — an **inline set-based flip** (`update blog_articles set status='published',
  published_at=now() where status='scheduled' and scheduled_for<=now()`), no job enqueued (light, like M28's
  `sweep_overdue_invoices` D-074 / M20's abandoned sweep D-112). Registered in **JOBS-AND-WORKERS-SPEC §5**.
  Satisfies Gate 4 (recurring work = pg_cron registry, never a client timer). PGlite-guarded like prior crons.

---

## 5. Public rendering — `public-blog` Edge Function

`verify_jwt=false`, service-role, **GET-only**. Pure module `frontend/js/blog-render.mjs` (unit-testable HTML
templating) imports host→site resolution + brand-vars + `<head>` meta builder from `site-render.mjs`
(reuse, no edit). Behaviour:
- **`/blog`** — paginated published-article index for the resolved site (title, excerpt, featured image, date).
- **`/blog/[slug]`** — full article; injects **Article + FAQ JSON-LD** (from stored `schema`), canonical, OG.
- **`/blog/category/[slug]`** — category-filtered index.
- **`/rss.xml`** — per-site RSS 2.0 of published articles.
- Reads **`status='published'` only**; draft/scheduled/archived → **404** (D-105 parity). No auth surface, no
  write path, no secret in output.

Host-path mounting under the live site domain pends **OPEN D-009**; built to full contract, "ready, not run"
(same honest scaffold as M19's SSL/domain).

---

## 6. Screens (single-file SPA `frontend/m22-content-cms.html`, M19/M20 pattern)

1. **Articles list** — filters + bulk actions; **empty** (first-run illustration + "Write your first article"),
   **loading** (calm token skeleton, **no shimmer**), **error** (envelope code → human message + retry).
2. **Editor** — two-pane (§3) + revision drawer; unsaved/saved/scheduled/published status pill.
3. **Categories & authors** — drawer/modal CRUD.
4. **Review queue** — `in_review` cards w/ SEO + readability scores; approve→publish / send-back-with-note.
5. **Blog settings** — default category / author / base path (minimal; auto settings deferred).

All: light (default) + dark (`[data-theme="dark"]`), responsive **360 / 768 / 1280** (no h-scroll; table →
stacked cards on mobile), `prefers-reduced-motion` honored, **tokens-only** (no raw hex outside tokens.css;
three fonts only — D-014), 0.5px hairlines, eyebrow labels at locked tracking. No stars/dots in dark bg.

---

## 7. Security & gate mapping

- **Gate 1 (tenancy):** PGlite leak-probe — B's staff cannot select/insert/update/delete A's `blog_articles`,
  `article_categories`, `article_authors`, `article_revisions`; `public-blog` returns only published rows and
  never another workspace's data; anon key alone grants nothing.
- **Gate 2 (roles):** staff writes, manager deletes, client reads nothing (operator-ceiling); publish/schedule
  go through SECURITY DEFINER helpers that re-assert `has_role(staff)`.
- **Gate 3 (metering):** no billable action — stated in close note.
- **Gate 4 (async):** scheduled publish = pg_cron registry entry; no client timer; no heavy inline work.
- **Gate 5 (states):** every screen has default/empty/loading(no-shimmer)/error.
- **Gate 6 (design):** both themes, 360/768/1280, reduced-motion, tokens-only.
- **Gate 7 (secrets):** none client-side; `public-blog` holds service role server-side only; no provider key.
- **Gate 8 (greps):** no dead-stack imports, no `sk-`/`service_role`/`whsec_` in frontend, no `shimmer`, no raw
  brand hex, no fourth font.
- **Gate 9 (docs):** DATA-SCHEMA §9 Blog/CMS updated to the built columns; DECISIONS D-113…D-118; JOBS §5 cron;
  EDGE-FUNCTIONS-SPEC §11 (or a new §) adds `public-blog`; TASKS.md session close.

---

## 8. Decisions to log (claim **D-113…D-118**, re-checked for parallel churn)

- **D-113** — Custom contenteditable editor instead of TipTap-npm (no-build vanilla stack; ~1 self-contained
  module; PRD's "TipTap" is satisfied in spirit by an equivalent semantic-HTML rich editor).
- **D-114** — `blog_articles`/`article_categories`/`article_authors`/`article_revisions` use **operator-ceiling
  RLS** (staff read, manager delete), mirroring D-089/D-109; client-portal approval narrowing deferred to M37.
- **D-115** — SEO score + Flesch–Kincaid readability computed **deterministically client-side**, no provider,
  no meter (auto-slice is where AI generation meters).
- **D-116** — Scheduled publish = **inline pg_cron set-based flip** (`m22-publish-scheduled`), not a job (light,
  mirrors M28/M20 sweeps).
- **D-117** — `public-blog` Edge Fn **reuses `site-render.mjs`** pure helpers (host→site, brand, meta) rather
  than editing the Done `site-render`; host-path mounting pends OPEN D-009.
- **D-118** — `content_queue` / `content_schedules` / `blog.generate` / metering **deferred to M22-auto**
  (Session 23); this slice is the CMS substrate only.

---

*M22 manual CMS substrate. The auto-blog pipeline (M22-auto, Session 23) plugs into these tables + review
queue once M21/M35 and the LLM-provider + D-010 decisions land.*
