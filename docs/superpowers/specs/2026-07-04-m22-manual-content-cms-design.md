# M22-manual — Content / CMS (Manual) — Design Spec

**Session 22 · Phase 3 (SEO & Content) · built 2026-07-04**
**Module:** M22 (manual slice) · **Migration:** `0025_m22_content.sql` · **DECISIONS:** D-120…D-127
**Stack:** vanilla HTML/CSS/JS + Supabase (Postgres · RLS · Edge Functions · Storage · pg_cron). No Next/Prisma/BullMQ/TipTap-React.

---

## 1. Purpose & Scope

The manual CMS half of M22: an article library (drafts → review → scheduled → published), autosave
revisions, categories + authors, an editorial/review queue, live readability + on-page SEO scoring,
and publishing onto M19 site blog routes (`/blog`, `/blog/[slug]`, category pages, RSS).

**In scope (BUILD-SEQUENCE S22 accept-when):** Blog manager · revisions · categories/authors ·
editorial queue · readability/SEO scoring · publish to M19 sites.

**Out of scope → Session 23 (auto-blog):** the 11-step AI pipeline (SerpApi SERP · GPT-4o brief +
article · DALL·E image · embedding internal-linker · quality gate · `blog.generate` worker job ·
`content_queue`/`content_schedules` keyword pipeline · scheduler top-up cron · one-click distribution
to M23/M24/M16). These are left as **documented, labeled scaffolds**, not built.

**Dependency status at build time:** M19 Sites ✅ (S18) · M06 Media ✅ (S20) are the only deps the
manual slice touches, both Done. M21 SEO Engine ❌ and M35 Creative Studio ❌ are unbuilt but are
consumed **only** by the auto-blog pipeline (S23) — their seams are scaffolded (user-approved).

---

## 2. Data model — `0025_m22_content.sql`

Four new tenant tables, every one `workspace_id not null` + index + RLS-enabled **in this file**
(DoD Gate-8 Law 2). Enums guarded (`duplicate_object → no-op`); PGlite-safe (probe strips
`create extension`).

### 2.1 `article_status` enum
`draft · in_review · scheduled · published · archived`

### 2.2 `blog_articles` (canonical DATA-SCHEMA §9 + logged extensions)
| column | type | note |
|---|---|---|
| id | uuid pk | |
| workspace_id | uuid not null → workspaces | tenant scope |
| site_id | uuid not null → sites (M19) | publish target |
| category_id | uuid → article_categories (set null) | single category (PRD `categoryId`) |
| author_id | uuid → article_authors (set null) | PRD `authorId` |
| keyword | text | primary target keyword (scoring + S23 pipeline) |
| title | text not null | |
| slug | text not null | `unique(site_id, slug)` |
| excerpt | text | list + meta fallback |
| content_html | text | editor output (sanitized) |
| meta_title | text | |
| meta_desc | text | |
| featured_image_url | text | from M06 AssetPicker |
| tags | text[] not null default '{}' | D-123: tags as array, not a join table |
| schema | jsonb not null default '{}' | Article/FAQ JSON-LD, built at publish |
| seo_score | int | 0–100 on-page rubric, client-computed, stored on save |
| readability_score | int | Flesch reading-ease, client-computed |
| word_count | int not null default 0 | |
| status | article_status not null default 'draft' | |
| scheduled_at | timestamptz | when status='scheduled' |
| reject_feedback | text | last editorial rejection note (fed to S23 regen) |
| embedding | vector(1536) | **D-124 scaffold** — nullable, no ivfflat index until S23 populates |
| published_at | timestamptz | |
| created_at / updated_at | timestamptz | `set_updated_at` trigger |

### 2.3 `article_revisions` (append-only autosave snapshots)
`id · workspace_id · article_id → blog_articles(cascade) · version_no · title · content_html ·
meta jsonb · saved_at · saved_by(uuid)` — `unique(article_id, version_no)`. Written only by
`save_article_revision()`; pruned to the last 20. No client insert/update/delete.

### 2.4 `article_categories`
`id · workspace_id · site_id → sites(cascade) · name · slug · created_at` — `unique(site_id, slug)`.

### 2.5 `article_authors`
`id · workspace_id · user_id(uuid, nullable → profiles) · name not null · bio · avatar_url ·
created_at`. `user_id` null = pen name; set = a workspace user's byline.

---

## 3. RLS & role matrix (mirrors M19 D-105 — coarse tiers, no new fine grants)

| table | select | insert | update | delete |
|---|---|---|---|---|
| blog_articles | staff+ | staff+ | staff+ | **manager+** |
| article_categories | staff+ | staff+ | staff+ | manager+ |
| article_authors | staff+ | staff+ | staff+ | manager+ |
| article_revisions | staff+ | — (definer only) | — | — |

Client role = CEILING (cannot read the workspace's articles — content is an operator surface, like
M19 sites; per-client portal narrowing is M37). **Publish / approve / reject / schedule** run through
definer RPCs that re-check `has_role(ws,'manager')` server-side — Gate-2 headline is that a staff user
cannot publish or approve via the client SDK even though they can edit drafts.

---

## 4. Definer RPCs (all `security definer set search_path = public`, revoke public / grant authenticated+service_role)

- **`save_article_revision(p_article uuid) → int`** — staff+; snapshot current article into
  `article_revisions` with next `version_no`; prune to last 20; return version_no. (autosave calls this)
- **`restore_article_revision(p_article uuid, p_version int) → void`** — staff+; copy a revision's
  title/content/meta back onto the article as a draft.
- **`publish_article(p_article uuid) → timestamptz`** — **manager+**; build Article + FAQ JSON-LD into
  `schema`, set status='published', `published_at=now()`, recompute nothing (scores come from client on
  last save); fire `emit_trigger(ws,'article.published', …)` on the M13 bus (tolerate M13 absence in
  probes). Returns published_at.
- **`schedule_article(p_article uuid, p_at timestamptz) → void`** — manager+; status='scheduled',
  `scheduled_at=p_at`.
- **`submit_for_review(p_article uuid) → void`** — staff+; status='in_review'.
- **`approve_article(p_article uuid) → timestamptz`** — manager+; = publish path (delegates to publish).
- **`reject_article(p_article uuid, p_feedback text) → void`** — manager+; status='draft',
  `reject_feedback=p_feedback` (S23 regen consumes this).
- **`publish_due_articles() → int`** — service-role; publish every `scheduled` article with
  `scheduled_at <= now()` (loops the publish path); returns count. Called by cron.

---

## 5. Publish-to-M19 rendering — `blog-render` Edge Function (D-121)

A **new** Edge Function (`functions/blog-render/index.ts`, `verify_jwt=false`, service-role,
status-filtered to `published`) that serves a site's blog surface **without modifying M19's
`site-render`** (surgical — M19 is Done). Routes (by query/path): index `/blog` (paginated card list),
`/blog/[slug]` (article + JSON-LD + meta), `/blog/category/[slug]`, and `?format=rss` (RSS 2.0 per
site). Resolves site by `site_id`/subdomain, reads `blog_articles` where `status='published'`, emits
semantic HTML themed from the site `brand`. The article body is the stored `content_html`; head gets
`meta_title`/`meta_desc`/`featured_image_url` + `schema` JSON-LD. Deterministic — a Node render probe
exercises it.

Publishing does **not** copy HTML into M19 `pages`; the renderer reads `blog_articles` live (status
filter). Articles belong to a `site_id` — that is the "publish to M19 sites" seam.

---

## 6. Editor (D-120 — TipTap → hand-rolled contenteditable)

TipTap is React/ProseMirror; the stack is no-build vanilla JS (D-005 Craft.js→GrapeJS, D-085 Chart.js
vendored set precedent). So the editor is a **hand-rolled `contenteditable` rich editor**:
- **Toolbar:** bold · italic · H2 · H3 · bullet/numbered list · blockquote · link · image · divider.
- **Slash-command menu** (`/` at line start): heading, list, quote, divider, image, FAQ block.
- **Link popup** + **internal-link search** (queries published `blog_articles` in the same site by
  title, inserts `<a href="/blog/[slug]">`).
- **Image insert** via the **M06 `AssetPicker`** (`js/asset-picker.js`) → inserts `<figure><img alt>`.
- Output stored as `content_html` (light client sanitize: strip script/style/event attrs on paste).

**Scoring (client-side, stored on save):**
- **Readability:** Flesch reading-ease (0–100) from syllable/word/sentence counts.
- **SEO score (0–100 rubric):** weighted checklist — keyword in title / H1 / first paragraph / slug /
  meta; title length 40–60; meta length 120–160; word count ≥ target; ≥1 image with alt; ≥2 internal
  links; headings present; keyword density 0.5–2.5%. Live, debounced, shown as a sidebar checklist.

No provider call anywhere in the manual slice → **no metering** (Gate 3 = none; auto-blog meters
`ai.tokens`/`ai.image` in S23).

---

## 7. Frontend screens — `m22-manual-content-cms.html` + `js/m22-content.js` + `styles/m22-content.css`

Hash-routed, reuses `tokens.css`/`base.css`/`components.css`; tokens-only, 3 fonts, `.5px` hairlines,
mono numerals, dark = **no stars/dots**, glassmorphism panels, soft atmospheric gradients.

- **`/content`** — articles table: filters (status · category · author · site · search), bulk actions
  (publish/archive/delete/assign-category), columns (title · status pill · SEO score · words ·
  category · author · updated/published). Empty/loading/error/success + mockup switcher.
- **`/content/[id]`** — editor (§6) + right **SEO sidebar** (live score ring, checklist, keyword
  density, meta title/desc fields with length meters, featured-image picker, slug, category/author
  selectors, schema preview) + **revisions panel** (autosave list, restore). Save · Submit for review ·
  Schedule · Publish (role-gated).
- **`/content/review`** — editorial queue: draft/in_review cards with SEO + readability scores,
  inline preview, **Approve → publish** / **Reject → feedback modal**.
- **`/content/taxonomy`** — categories manager + authors manager (add/edit/delete; pen name or link
  workspace user).
- **`/settings/content`** — per-site defaults (default author, blog base path, RSS on/off) + a
  **labeled auto-blog schedule section scaffold** (frequency/voice/thresholds — "Session 23", disabled).

All screens: both themes, responsive 360/768/1280 (no h-scroll; table scrolls internally), reduced-motion.

---

## 8. Cron / jobs / metering / secrets

- **Cron:** `m22-scheduled-publish` (`*/15 * * * *`) → `publish_due_articles()` inline flip (no heavy
  job; mirrors M20 abandoned-sweep / M28 overdue flip). Registered in JOBS-AND-WORKERS §5. Guarded for PGlite.
- **Jobs (Gate 4):** no new heavy job type in the manual slice; scheduled publish is pg_cron, never a
  client timer; `blog.generate` worker job is S23. Browser cannot write `published`/`scheduled`
  directly — those go through definer RPCs.
- **Metering (Gate 3):** none — stated explicitly (no provider call).
- **Secrets (Gate 7):** anon key only in browser; `blog-render` runs service-role in the Edge Fn; no
  provider key. `article.published` distribution to M23/M24/M16 is a labeled scaffold (no creds).

---

## 9. Verification (DoD)

- **`workers/verify/m22probe.mjs`** (PGlite, real Postgres): cross-tenant leak ×4 tables · role matrix
  (staff edit / manager publish+delete+approve / client ceiling) · append-only `article_revisions` ·
  `save_article_revision` snapshot + prune-to-20 + `restore` · `publish_article` flips status +
  builds schema + fires trigger (tolerant) · `schedule_article` → `publish_due_articles` publishes due,
  skips future · editorial transitions (submit/approve/reject-with-feedback persists) · slug uniqueness
  per site · category/author tenant scoping.
- **`workers/verify/m22renderprobe.mjs`** (Node): `blog-render` deterministic output — index lists only
  published, `/blog/[slug]` emits JSON-LD + meta, RSS well-formed, unpublished 404.
- Wire `scripts/verify.sh` (m22 + m22render steps), extend `supabase/tests/leak_probe.sql`, add
  `supabase/seed.sql` M22 block (Acme site articles across every status + categories + authors +
  revisions), `.claude/launch.json` (`m22-preview`), `verify-status.json` (m22).
- No regressions on the full suite; **Gate-8 greps clean** for M22 files.
- Preview-verify all 5 screens (both themes, 0 h-scroll @ 360/768/1280, zero console errors).

---

## 10. Decisions (proposed, D-120…D-127 — renumber-on-merge per house pattern)

- **D-120** TipTap → hand-rolled `contenteditable` rich editor (no-build stack; ProseMirror/React dropped).
- **D-121** Blog rendering via a **new `blog-render` Edge Fn** (mirrors M19 `site-render`), not by
  modifying M19; articles carry `site_id`; renderer reads live, status-filtered.
- **D-122** Editorial/review queue = a `status` filter on `blog_articles` (no separate table);
  `content_queue` + `content_schedules` (auto-blog keyword pipeline) deferred to S23.
- **D-123** Tags as `text[]` on the article; single `category_id` FK; `article_authors` table
  (workspace user **or** pen name).
- **D-124** `embedding vector(1536)` added nullable as a scaffold column; no ivfflat index until S23
  populates it; the internal-link popup uses text search now.
- **D-125** Readability (Flesch) + SEO score (on-page rubric) computed client-side, stored on save; no
  provider call → Gate 3 none.
- **D-126** `article.published` fires the M13 `emit_trigger` bus (registered in the trigger registry);
  one-click distribute to M23/M24/M16 scaffolded (M23/M24 unbuilt).
- **D-127** Scheduled publishing via `m22-scheduled-publish` pg_cron → inline `publish_due_articles()`
  (no heavy job).

---

## 11. Migration / numbering notes

`0025_m22_content.sql` — highest existing is `0024` (M16); the missing `0012` + double-`0010` are
pre-existing parallel-build collisions, not this session's. DECISIONS start at **D-120** (max observed
= D-119, M06). If a parallel session also claimed D-120+ or `0025`, renumber on merge (house pattern).
M22 has no ordering dep on the collision numbers.
