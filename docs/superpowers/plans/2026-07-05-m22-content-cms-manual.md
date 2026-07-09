# M22 Content/CMS (manual slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the manual Content/CMS substrate (Session 22) to Definition-of-Done: a blog article manager, contenteditable rich editor with a deterministic client-side SEO/readability sidebar, autosave revisions, categories/authors, an editorial review queue, scheduled publishing via pg_cron, and a public `public-blog` renderer (/blog, /blog/[slug], /blog/category/[slug], /rss.xml) — so the M22-auto pipeline (Session 23) has tables + a review queue to write into.

**Architecture:** Locked stack — vanilla HTML/CSS/JS front end + Supabase (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron + `public.jobs`). Four tenant tables (`blog_articles`, `article_categories`, `article_authors`, `article_revisions`) on operator-ceiling RLS (staff read, manager delete — mirrors M19 D-089/M20 D-109). Publish/schedule go through SECURITY DEFINER helpers that build JSON-LD server-side. Scheduled publish is an inline pg_cron set-based flip (no job). Public rendering is a GET-only, `verify_jwt=false` Edge Fn reusing M19's `site-render.mjs` conventions via a new pure `blog-render.mjs`. No AI, no provider, no metering in this slice.

**Tech Stack:** PostgreSQL (migration `0025`), Supabase Edge Functions (Deno/TypeScript), pg_cron, vanilla HTML/CSS/JS with `tokens.css`/`app.css`/`components.css`, PGlite verification probes (Node ESM).

**Verification model (repo convention, not pytest):** DB/RLS logic → `workers/verify/m22probe.mjs` against real Postgres via PGlite. Pure JS modules (`content-seo.mjs`, `blog-render.mjs`) → `workers/verify/m22renderprobe.mjs` in Node, no DB. Front end → local preview server. Gate-8 → `scripts/gate8.sh`. "Failing test first" = write the probe assertion, run it red, implement, run it green. **This workspace is not a git repo** — treat every "Commit" step as optional: run only if git is initialised, else skip and record progress in TASKS.md.

**Reference the design spec:** `docs/superpowers/specs/2026-07-05-m22-content-cms-manual-design.md`.

**Pre-flight (do first, before Task 1):** re-confirm the migration number is free — `ls supabase/migrations/ | sort | tail -3`. Plan assumes `0025`; if a parallel session took it, use the next free number and update every reference below. Re-confirm DECISIONS block D-113…D-118 is free — `grep -c 'D-11[3-8]' DECISIONS-AiMindShare-v1_0.md` (expect 0); if taken, claim the next free block and update §8 refs.

---

## File structure

**Create:**
- `supabase/migrations/0025_m22_content_cms.sql` — 1 enum (`article_status`), 4 tables, RLS + policies, indexes, `set_updated_at` trigger, `publish_article()` / `schedule_article()` / `save_article_revision()` / `publish_scheduled_articles()` helpers, `m22-publish-scheduled` cron (PGlite-guarded), Realtime add.
- `frontend/js/content-seo.mjs` — pure, deterministic: `scoreArticle({html,title,keyword,metaTitle,metaDesc,targetWords})` → `{score, wordCount, readability, checklist[]}`; Flesch–Kincaid; keyword/density/meta/link/alt checks.
- `frontend/js/blog-render.mjs` — pure templating: `renderBlogIndex()`, `renderArticle()` (Article+FAQ JSON-LD), `renderCategory()`, `buildRss()`, `renderBlogNotFound()`.
- `frontend/js/content-editor.mjs` — contenteditable controller: toolbar exec, `/` slash menu, link popup, image insert (via `asset-picker.js`), internal-link popup, HTML sanitize/allowlist, `getHtml()`/`setHtml()`.
- `supabase/functions/public-blog/index.ts` — GET-only, service-role: host→site resolution, route dispatch to `blog-render.mjs` output, published-only reads.
- `workers/verify/m22probe.mjs` — PGlite DB/RLS/cross-tenant probe.
- `workers/verify/m22renderprobe.mjs` — Node pure-module probe (`content-seo` + `blog-render`).
- `frontend/m22-content-cms.html` — authed app shell.
- `frontend/js/m22-content-cms.js` — app logic + preview/mockup state.
- `frontend/styles/m22-content-cms.css` — per-screen styles (zero raw hex, zero token redeclaration).

**Modify:**
- `supabase/config.toml` — add `[functions.public-blog] verify_jwt = false`.
- `supabase/seed.sql` — one category, one author, one published + one draft + one in_review sample article (labelled sample data).
- `scripts/verify.sh` — add the m22 probe + m22render probe steps.
- `workers/verify/verify-status.json` — m22 entry.
- `DATA-SCHEMA-v1_0.md` — §9 Blog/CMS slice implementation note (built columns; content_queue/schedules deferred).
- `DECISIONS-AiMindShare-v1_0.md` — D-113…D-118.
- `JOBS-AND-WORKERS-SPEC-v1_0.md` — §5 cron registry row `m22-publish-scheduled`.
- `EDGE-FUNCTIONS-SPEC-v1_0.md` — add `public-blog` row (new §12 or extend §11).
- `TASKS.md` — Session 22 block + close ritual; note M22-auto still carried for Session 23.

---

## Task 1: Migration `0025` — enum, 4 tables, RLS, indexes, helpers, cron

**Files:**
- Create: `supabase/migrations/0025_m22_content_cms.sql`
- Create (skeleton): `workers/verify/m22probe.mjs`
- Reference: `supabase/migrations/0022_m19_sites.sql` (operator-ceiling RLS, SECURITY DEFINER helpers, PGlite-guarded cron + Realtime add), `0018_m28_payments.sql` (inline sweep function pattern), `0023_m20_funnels.sql` (`sweep_abandoned_funnels` inline flip).

- [ ] **Step 1: Probe skeleton (red).** Copy the PGlite boot + `load()`/`one()`/`count()`/`denied()` harness from `m20probe.mjs`. Load dep migrations then `0025`. Which deps: `0000,0001` (is_member/has_role/workspaces/memberships), plus `0022_m19_sites` (for `sites` FK). If `sites` load pulls a long chain under PGlite, instead create a minimal `sites` stub table before loading `0025` (copy the stub idiom from prior probes). Assert the 4 tables exist:
  ```js
  for (const t of ['blog_articles','article_categories','article_authors','article_revisions'])
    assert((await one(pg, `select to_regclass('public.${t}') t`)).t, `table ${t} exists`);
  ```
- [ ] **Step 2: Run probe — expect FAIL** (`cd workers && node verify/m22probe.mjs`): `0025` not found / tables missing.
- [ ] **Step 3: Migration head + enum.** Header comment: reconciliation notes (D-114 operator-ceiling RLS; D-116 inline cron flip; D-118 content_queue/schedules deferred; migration-number note "0025; 0000–0024 taken; 0012 gap + double-0010 pre-existing, no ordering dep"; PGlite-safety note). Then:
  ```sql
  do $$ begin
    create type public.article_status as enum ('draft','in_review','scheduled','published','archived');
  exception when duplicate_object then null; end $$;
  ```
- [ ] **Step 4: Create the 4 tables** (exact columns per spec §2). Every table: `id uuid primary key default gen_random_uuid()`, `workspace_id uuid not null references public.workspaces(id) on delete cascade`, `created_at timestamptz not null default now()`.
  ```sql
  create table if not exists public.article_categories (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    site_id uuid not null references public.sites(id) on delete cascade,
    name text not null, slug text not null, description text,
    created_at timestamptz not null default now(),
    unique (site_id, slug));

  create table if not exists public.article_authors (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    name text not null, slug text not null, bio text, avatar_url text,
    user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    unique (workspace_id, slug));

  create table if not exists public.blog_articles (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    site_id uuid not null references public.sites(id) on delete cascade,
    category_id uuid references public.article_categories(id) on delete set null,
    author_id uuid references public.article_authors(id) on delete set null,
    keyword text, title text not null default 'Untitled', slug text not null,
    excerpt text, content_html text not null default '',
    meta_title text, meta_desc text, featured_image_url text,
    tags text[] not null default '{}', faqs jsonb not null default '[]',
    schema jsonb not null default '{}',
    seo_score int not null default 0, readability_score numeric not null default 0,
    word_count int not null default 0,
    status public.article_status not null default 'draft',
    scheduled_for timestamptz, published_at timestamptz, review_note text,
    created_by uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    unique (site_id, slug));

  create table if not exists public.article_revisions (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    article_id uuid not null references public.blog_articles(id) on delete cascade,
    version_no int not null, title text, content_html text not null default '',
    saved_by uuid references auth.users(id) on delete set null,
    saved_at timestamptz not null default now(),
    unique (article_id, version_no));
  ```
- [ ] **Step 5: RLS + operator-ceiling policies on all 4 tables** (Gate 2/8). Enable RLS on each, then per table apply:
  ```sql
  -- operator-ceiling (D-114): staff read/write, manager delete. mirrors M19 D-089.
  alter table public.blog_articles enable row level security;
  create policy sel on public.blog_articles for select using ( public.has_role(workspace_id,'staff') );
  create policy ins on public.blog_articles for insert with check ( public.has_role(workspace_id,'staff') );
  create policy upd on public.blog_articles for update using ( public.has_role(workspace_id,'staff') )
    with check ( public.has_role(workspace_id,'staff') );
  create policy del on public.blog_articles for delete using ( public.has_role(workspace_id,'manager') );
  ```
  Repeat for `article_categories`, `article_authors`. For `article_revisions`: sel/ins = staff+, del = manager+, **no update policy** (append-only snapshots) — add comment `-- append-only snapshot; restore writes a new forward version (D-114)`.
- [ ] **Step 6: Indexes + `set_updated_at` trigger.** Indexes: `blog_articles(workspace_id,status,updated_at desc)`, `blog_articles(site_id,status)`, partial `blog_articles(scheduled_for) where status='scheduled'`, `blog_articles(category_id)`, `article_revisions(article_id,version_no desc)`. Reuse existing `public.set_updated_at()` (defined in an early migration; if the probe reports it missing under PGlite, define it guarded). `before update on blog_articles execute set_updated_at()`.
- [ ] **Step 7: `save_article_revision()` helper** (SECURITY DEFINER, staff-guarded). Inserts a snapshot with `version_no = coalesce(max,0)+1` for the article; returns the new version_no. Guard: `if not public.has_role(p_ws,'staff') then raise exception 'forbidden'; end if;`
  ```sql
  create or replace function public.save_article_revision(p_article uuid)
  returns int language plpgsql security definer set search_path=public as $$
  declare v_ws uuid; v_no int; r public.blog_articles;
  begin
    select * into r from public.blog_articles where id=p_article;
    if r.id is null then raise exception 'no such article'; end if;
    if not public.has_role(r.workspace_id,'staff') then raise exception 'forbidden'; end if;
    select coalesce(max(version_no),0)+1 into v_no from public.article_revisions where article_id=p_article;
    insert into public.article_revisions(workspace_id,article_id,version_no,title,content_html,saved_by)
      values (r.workspace_id,p_article,v_no,r.title,r.content_html,auth.uid());
    return v_no;
  end $$;
  ```
- [ ] **Step 8: `publish_article()` + `schedule_article()`** (SECURITY DEFINER, staff-guarded). `publish_article(p_article)` builds `schema` JSON-LD server-side (Article + FAQ from `faqs`) so the browser can't forge structured data, then sets `status='published'`, `published_at=now()`. `schedule_article(p_article, p_when)` sets `status='scheduled'`, `scheduled_for=p_when`.
  ```sql
  create or replace function public.publish_article(p_article uuid)
  returns void language plpgsql security definer set search_path=public as $$
  declare r public.blog_articles; v_schema jsonb;
  begin
    select * into r from public.blog_articles where id=p_article;
    if r.id is null then raise exception 'no such article'; end if;
    if not public.has_role(r.workspace_id,'staff') then raise exception 'forbidden'; end if;
    v_schema := jsonb_build_object(
      '@context','https://schema.org','@type','Article',
      'headline', r.title, 'description', coalesce(r.meta_desc,r.excerpt),
      'image', r.featured_image_url, 'datePublished', now());
    if jsonb_array_length(r.faqs) > 0 then
      v_schema := jsonb_build_object('article',v_schema,'faq',
        jsonb_build_object('@context','https://schema.org','@type','FAQPage','mainEntity', r.faqs));
    end if;
    update public.blog_articles set status='published', published_at=now(), schema=v_schema
      where id=p_article;
  end $$;
  ```
  Add `schedule_article(p_article uuid, p_when timestamptz)` similarly guarded.
- [ ] **Step 9: `publish_scheduled_articles()` inline sweep + cron** (D-116, mirrors M28 `sweep_overdue_invoices`). Function is a set-based flip (calls `publish_article` per due row so JSON-LD is built, or inline-builds schema for the set):
  ```sql
  create or replace function public.publish_scheduled_articles()
  returns int language plpgsql security definer set search_path=public as $$
  declare r record; n int := 0;
  begin
    for r in select id from public.blog_articles
             where status='scheduled' and scheduled_for is not null and scheduled_for <= now()
    loop perform public._publish_article_internal(r.id); n := n+1; end loop;
    return n;
  end $$;
  ```
  Extract the JSON-LD-build + flip from Step 8 into `_publish_article_internal(uuid)` (no role check — only called by the definer sweep / by `publish_article` after its check). Grants: `revoke all on function public.publish_scheduled_articles() from public; grant execute to service_role;`. Cron (PGlite-guarded):
  ```sql
  do $$ begin perform cron.schedule('m22-publish-scheduled','*/5 * * * *',
    'select public.publish_scheduled_articles();');
  exception when others then raise notice 'cron skip (no pg_cron): %', sqlerrm; end $$;
  ```
  Realtime: `do $$ begin alter publication supabase_realtime add table public.blog_articles; exception when others then raise notice '%', sqlerrm; end $$;`
- [ ] **Step 10: Grants for the authed helpers.** `grant execute on function public.save_article_revision(uuid), public.publish_article(uuid), public.schedule_article(uuid,timestamptz) to authenticated, service_role;` (the app calls these via RPC; each re-checks `has_role` internally).
- [ ] **Step 11: Run probe — expect PASS** on: 4 tables exist; all 4 `relrowsecurity=true`; `article_revisions` has no `update` policy (query `pg_policies`); `article_status` enum has 5 labels.
- [ ] **Step 12: Commit (skip if not git):** `feat(m22): content/CMS schema — 4 tables, operator-ceiling RLS, publish/schedule helpers, cron (migration 0025)`.

---

## Task 2: Cross-tenant leak assertions (Gate 1) in the probe

**Files:**
- Modify: `workers/verify/m22probe.mjs`
- Reference: `m20probe.mjs` leak block (two workspaces A/B, staff users, `set_config('request.jwt.claims',…)` role switching).

- [ ] **Step 1: Failing leak assertions.** Seed WS A + WS B each with an owner + staff. Insert a `sites` row + a `blog_articles` row in A. As B's staff (switch JWT claims like `m20probe`), assert all four fail:
  ```js
  assert(await denied(pgB, `select * from blog_articles where id=$1`, [aArticle]) , 'B cannot SELECT A article');
  assert(await denied(pgB, `insert into blog_articles(workspace_id,site_id,slug) values($1,$2,'x')`, [WSA,aSite]), 'B cannot INSERT into A');
  assert(await denied(pgB, `update blog_articles set title='x' where id=$1`, [aArticle]), 'B cannot UPDATE A');
  assert(await denied(pgB, `delete from blog_articles where id=$1`, [aArticle]), 'B cannot DELETE A');
  ```
  (`denied` = returns 0 rows OR throws — copy the helper from `m20probe.mjs`.) Repeat SELECT-denied for `article_categories`, `article_authors`, `article_revisions`.
- [ ] **Step 2: Run — expect FAIL** only if a policy is wrong; if Task 1 RLS is correct these pass immediately. Treat a *pass here without the policies* as a probe bug (RLS not enforced under your PGlite role switch) — verify the claims-switch actually flips `has_role`.
- [ ] **Step 3: Role-threshold assertions.** As A's **staff**: can insert/update, **cannot delete** (delete = manager+). As A's **manager**: can delete. As A's **client** (if the probe seeds one): cannot select (operator-ceiling). Assert each.
- [ ] **Step 4: Helper auth assertions.** As B's staff, `select publish_article($1)` for A's article → throws `forbidden`. As A's staff, `publish_article` flips status to `published` and populates `schema` (non-empty).
- [ ] **Step 5: Run probe — PASS all.** Commit (skip if not git): `test(m22): cross-tenant leak + role-threshold + helper-auth probe green`.

---

## Task 3: Deterministic SEO/readability — `content-seo.mjs`

**Files:**
- Create: `frontend/js/content-seo.mjs`
- Create (skeleton): `workers/verify/m22renderprobe.mjs`
- Reference: `frontend/js/page-builder.mjs` (pure ESM module + export style).

- [ ] **Step 1: Failing probe.** In `m22renderprobe.mjs` import `scoreArticle` and assert deterministic outputs:
  ```js
  import { scoreArticle } from '../../frontend/js/content-seo.mjs';
  const r = scoreArticle({ html:'<h1>Best Dates</h1><p>Buy medjool dates online.</p>'.repeat(1),
    title:'Best Medjool Dates', keyword:'medjool dates', metaTitle:'Best Medjool Dates | Shop',
    metaDesc:'Buy the finest medjool dates online, graded and fresh.', targetWords:800 });
  assert(typeof r.score==='number' && r.score>=0 && r.score<=100, 'score in 0..100');
  assert(r.wordCount>0, 'word count computed');
  assert(Array.isArray(r.checklist) && r.checklist.every(c=>['pass','warn','fail'].includes(c.state)), 'checklist states');
  // determinism: same input → same score
  assert(scoreArticle(SAME).score === scoreArticle(SAME).score, 'deterministic');
  ```
- [ ] **Step 2: Run — FAIL** (`node workers/verify/m22renderprobe.mjs`): module/export missing.
- [ ] **Step 3: Implement `scoreArticle(opts)`.** Pure, no DOM (parse with a tiny regex-based text extractor so it runs in Node): strip tags → text; `wordCount = words.length`; sentences/syllables → Flesch–Kincaid reading ease. Checklist items (each `{label,state,hint}`): keyword in title / meta_title / meta_desc / first 100 words / an `<h2>`; keyword density in 0.5–2.5%; meta_title 30–60 chars; meta_desc 70–160 chars; wordCount ≥ 0.6×targetWords; ≥1 internal link (`<a href` to a relative/blog URL) and image alt coverage ≥ 80%. Weighted sum → `score` (round). Return `{score, wordCount, readability, checklist}`. Keep it ~120 lines, no dependency.
- [ ] **Step 4: Run — PASS.** Add edge assertions: empty html → score 0, no throw; missing keyword → keyword checks `fail` not throw.
- [ ] **Step 5: Commit (skip if not git):** `feat(m22): deterministic client-side SEO + Flesch-Kincaid scoring`.

---

## Task 4: Public blog templating — `blog-render.mjs`

**Files:**
- Create: `frontend/js/blog-render.mjs`
- Modify: `workers/verify/m22renderprobe.mjs`
- Reference: `frontend/js/site-render.mjs` (`renderPage`, `renderNotFound`, head/meta conventions, brand vars), `m19renderprobe.mjs` (assertion style).

- [ ] **Step 1: Failing probe.** Import and assert:
  ```js
  import { renderArticle, renderBlogIndex, buildRss, renderBlogNotFound } from '../../frontend/js/blog-render.mjs';
  const site = { id:'s1', name:'Acme', brand:{ primary:'#00696e' }, origin:'https://acme.com' };
  const art = { title:'Best Dates', slug:'best-dates', content_html:'<p>Hi</p>', excerpt:'x',
    meta_title:'Best Dates', meta_desc:'d', featured_image_url:null, published_at:'2026-07-05T00:00:00Z',
    schema:{ '@type':'Article','headline':'Best Dates' }, faqs:[{q:'Q?',a:'A.'}] };
  const html = renderArticle({ site, article: art });
  assert(html.includes('<h1') && html.includes('Best Dates'), 'article renders title');
  assert(html.includes('application/ld+json') && html.includes('"Article"'), 'Article JSON-LD injected');
  assert(html.includes('FAQPage'), 'FAQ JSON-LD injected from faqs');
  const rss = buildRss({ site, articles:[art] });
  assert(rss.startsWith('<?xml') && rss.includes('<rss') && rss.includes('best-dates'), 'valid RSS item');
  assert(renderBlogNotFound().includes('404') || renderBlogNotFound().length>0, '404 body');
  ```
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement the four functions.** `renderArticle` → full HTML doc: `<head>` with title/meta/canonical/OG (reuse the meta pattern from `site-render.mjs`; import a shared head helper if `site-render.mjs` exports one, else inline the same shape), brand CSS vars, body with `<article>` (h1, byline, featured image, `content_html` injected as-is since it was sanitized on save), and one `<script type="application/ld+json">` per schema block (Article; FAQPage when `faqs.length`). `renderBlogIndex({site,articles,page,pageCount,category})` → list of cards + prev/next. `buildRss({site,articles})` → RSS 2.0 string (escape XML). `renderBlogNotFound()` → minimal 404 doc. All pure, no DB, no secrets.
- [ ] **Step 4: Run — PASS.** Add: index with 0 articles → renders an empty-state message, no throw; XML escaping in RSS for a title with `&`.
- [ ] **Step 5: Commit (skip if not git):** `feat(m22): pure blog templating (article/index/category/RSS) reusing M19 head conventions`.

---

## Task 5: `public-blog` Edge Function

**Files:**
- Create: `supabase/functions/public-blog/index.ts`
- Modify: `supabase/config.toml`
- Reference: `supabase/functions/site-render/index.ts` (host→site resolution, service-role client, GET dispatch, 404 for drafts D-105), `supabase/functions/public-funnel/index.ts` (verify_jwt=false shape).

- [ ] **Step 1: Add config.** In `supabase/config.toml`: `[functions.public-blog]\nverify_jwt = false`.
- [ ] **Step 2: Implement the function.** Service-role client. Parse host (from `Host`/`x-forwarded-host`) → resolve `sites` row exactly as `site-render` does (active custom domain / staging subdomain). Parse path: `/rss.xml` → `buildRss`; `/blog` or `/blog/` → index (query published articles for the site, newest first, paginate `?page=`); `/blog/category/:slug` → `renderCategory`; `/blog/:slug` → single article (must be `status='published'`, else `renderBlogNotFound()` 404). **Only `status='published'` rows are ever selected.** Import `blog-render.mjs` (Deno can import the `.mjs` via a relative path or a copied `_shared` twin — follow whatever `site-render/index.ts` does to import `site-render.mjs`; if it copies to `_shared`, do the same). Return `text/html` (or `application/rss+xml` for RSS) with the standard cache headers site-render uses. Never emit a secret or another workspace's data.
- [ ] **Step 3: Probe (light, in `m22probe.mjs`).** Since Edge Fns need Deno (not present), assert the *contract* at the SQL layer: a query mirroring the function's article fetch (`where site_id=$1 and status='published'`) excludes a `draft`/`scheduled` row seeded alongside a published one. This proves "drafts never render" at the data layer (the D-105 parity claim) without Deno.
- [ ] **Step 4: Run `m22probe.mjs` — PASS** the published-only assertion.
- [ ] **Step 5: Commit (skip if not git):** `feat(m22): public-blog Edge Fn (/blog, /blog/[slug], /category, /rss.xml) — published-only, GET-only`.

---

## Task 6: Contenteditable editor controller — `content-editor.mjs`

**Files:**
- Create: `frontend/js/content-editor.mjs`
- Reference: `frontend/js/asset-picker.js` (M06 image picker API), `frontend/js/m19-editor.js` (toolbar/popup UI idioms, token classes).

- [ ] **Step 1: Implement the controller (no separate unit probe — verified live in Task 7 preview).** Export `createEditor(rootEl, { onChange, siteId, openAssetPicker, searchArticles })`. Provide: a toolbar (buttons call `document.execCommand` for bold/italic/lists/quote or a small custom h2/h3/link wrapper), a `/` slash menu (keydown at line start opens a token-styled menu: Heading 2/3, Quote, Bullet/Numbered list, Divider, Image, Internal link), image insert (`openAssetPicker()` → returns `{url,alt}` → inserts `<img>`), internal-link popup (`searchArticles(q)` → published titles → inserts `<a href="/blog/:slug">`). `getHtml()` returns **sanitized** HTML: allowlist tags `h2,h3,p,ul,ol,li,blockquote,pre,code,a,img,strong,em,br,hr`; strip `script/style/on*` attributes; `a[href]` must be relative or http(s). `setHtml(html)` loads a revision. `onChange` fires debounced.
- [ ] **Step 2: Sanity self-check in Node (optional).** If feasible, a tiny jsdom-free string test of the sanitize function (export `sanitizeHtml` separately) added to `m22renderprobe.mjs`: `sanitizeHtml('<p onclick=x>hi</p><script>bad()</script>')` → `'<p>hi</p>'`. Run → PASS.
- [ ] **Step 3: Commit (skip if not git):** `feat(m22): contenteditable editor controller with slash menu, M06 image insert, internal links, HTML sanitize`.

---

## Task 7: Front-end app — list, editor, categories/authors, review queue, settings

**Files:**
- Create: `frontend/m22-content-cms.html`, `frontend/js/m22-content-cms.js`, `frontend/styles/m22-content-cms.css`
- Reference: `frontend/m16-campaigns.html` + `js/m16-campaigns.js` (app shell, Supabase boot, auth gate, preview/mockup state, hash routing), `m19-sites.html` (list+editor split), `styles/m20-funnels.css` (per-screen styling within tokens).

- [ ] **Step 1: HTML shell.** Copy the `<head>` asset block from `m16-campaigns.html` (tokens.css, app.css, components.css, then `m22-content-cms.css`; the theme boot script; the atmosphere orbs **without stars/dots**; `vendor/supabase-js.min.js`; `config.js`; then `js/m22-content-cms.js`). Body = an app frame with a left nav (Articles · Review queue · Categories & authors · Settings) and a `<main id="view">` that hash-routes: `#/`, `#/content/:id`, `#/review`, `#/taxonomy`, `#/settings`.
- [ ] **Step 2: Articles list view.** Table columns: title, status pill, SEO score chip, words, category, author, updated/published. Filters (status select, category select, search box) + bulk actions (archive / delete[manager] / publish). **States:** default (real query), **empty** (first-run illustration + "Write your first article" CTA), **loading** (token skeleton rows, **no shimmer**), **error** (envelope code → message + retry). "New article" inserts a draft via the client SDK and routes to the editor.
- [ ] **Step 3: Editor view (`#/content/:id`).** Two-pane: left = `createEditor(...)` mounted on a contenteditable; title input; slug (auto from title, editable); category/author selects; featured-image picker (asset-picker). Right = SEO sidebar rendering `scoreArticle(...)` live (debounced): score dial, checklist (pass/warn/fail rows), keyword field, meta_title/meta_desc inputs with char counters, readability badge, FAQ editor (repeatable q/a → `faqs`), schema preview (read-only JSON from a dry-run build). Autosave: on `onChange` debounce → PATCH article fields + call `save_article_revision` RPC when content changed. Revision drawer: list versions (`article_revisions`), "Restore" → `setHtml` + autosave forward. Header actions: Save draft · Submit for review (`status=in_review`) · Schedule (datetime → `schedule_article` RPC) · Publish (`publish_article` RPC). Role-gate: staff can edit/publish; client sees nothing (route guarded + server-enforced).
- [ ] **Step 4: Review queue view (`#/review`).** Cards for `status='in_review'` with SEO + readability scores, excerpt, author; actions: **Approve → publish** (`publish_article`), **Send back** (prompt for a note → PATCH `status='draft'`, `review_note=note`). Empty/loading/error states.
- [ ] **Step 5: Categories & authors view (`#/taxonomy`).** Two lists with inline create/edit/delete (categories: name/slug/description/site; authors: name/slug/bio/avatar/optional linked member). Empty/loading/error states. Delete is manager-gated (button hidden for staff; server enforces).
- [ ] **Step 6: Settings view (`#/settings`).** Minimal: default category, default author, blog base path (stored per-site; if no settings table this slice, keep as localStorage-per-site scaffold **clearly labelled** "auto-schedule settings arrive with M22-auto"). No fake controls for frequency/brand-voice.
- [ ] **Step 7: Mockup/preview state.** Following the m16 pattern, when no Supabase creds are configured the app renders a **labelled sample dataset** (2–3 articles across statuses, 1 category, 1 author) so the screens are demoable offline — never written to a real table, never left in the authed path.
- [ ] **Step 8: CSS.** `m22-content-cms.css` — per-screen layout only, **tokens-only** (no raw hex, no token redeclaration, three fonts only). Light + dark both correct. Responsive 360/768/1280: table → stacked cards on mobile; editor two-pane → stacked with a sticky SEO summary bar on mobile. `prefers-reduced-motion` disables non-essential transitions.
- [ ] **Step 9: Verify live (preview server).** `preview_start` the frontend; load `m22-content-cms.html`; check console clean, snapshot each view, toggle dark, resize 360/768/1280 → **no horizontal scroll**, no clipped controls. Screenshot the list + editor for the close note.
- [ ] **Step 10: Commit (skip if not git):** `feat(m22): content/CMS front end — list, editor+SEO sidebar, review queue, taxonomy, settings (both themes, responsive)`.

---

## Task 8: Seed, verify wiring, docs, Gate-8, close

**Files:**
- Modify: `supabase/seed.sql`, `scripts/verify.sh`, `workers/verify/verify-status.json`, `DATA-SCHEMA-v1_0.md`, `DECISIONS-AiMindShare-v1_0.md`, `JOBS-AND-WORKERS-SPEC-v1_0.md`, `EDGE-FUNCTIONS-SPEC-v1_0.md`, `TASKS.md`
- Reference: the M16/M20 close blocks in `TASKS.md`.

- [ ] **Step 1: Seed.** Append an M22 block to `supabase/seed.sql`: one `article_categories` row, one `article_authors` row, one `blog_articles` each of `published` / `draft` / `in_review` (column-matched, tied to an existing seed site + workspace), clearly commented `-- M22 sample content`. `on conflict do nothing`.
- [ ] **Step 2: verify.sh + status.** Add two steps to `scripts/verify.sh`: `( cd workers && node verify/m22probe.mjs )` and `( cd workers && node verify/m22renderprobe.mjs )`, each `|| fails=$((fails+1))`, with a labelled header echo matching the existing style. Add an `m22` entry to `workers/verify/verify-status.json`.
- [ ] **Step 3: DATA-SCHEMA.** Update the §9 Blog/CMS bullet to the **built** columns (list the 4 tables + article_status enum); explicitly note `content_queue`/`content_schedules` are **deferred to M22-auto (Session 23)**; RLS = operator-ceiling (D-114).
- [ ] **Step 4: DECISIONS.** Append D-113…D-118 exactly as spec §8 (re-check the numbers are still free; if not, claim the next block and fix cross-refs). Each entry: status LOCKED, date 2026-07-05, one-line rationale.
- [ ] **Step 5: JOBS-AND-WORKERS-SPEC §5.** Add the cron registry row: `| */5 * * * * | (inline flip, no job) | M22 | m22-publish-scheduled — flips scheduled→published where scheduled_for<=now(); set-based, mirrors M28 overdue sweep (D-116) |`.
- [ ] **Step 6: EDGE-FUNCTIONS-SPEC.** Add a `public-blog` row (verify_jwt ✗, public/service-role): "the public blog renderer — host→site (reusing site-render resolution) → /blog, /blog/[slug], /blog/category/[slug], /rss.xml; published-only, drafts 404 (D-105 parity); Article+FAQ JSON-LD; routing under the site host pends OPEN D-009 (D-117)."
- [ ] **Step 7: Run full `bash scripts/verify.sh`** — expect all present probes green (Gate-8, leak, job, all module probes incl. new m22 + m22render). Fix any regression. Live worker/Edge probes remain "skipped, not run" (no Docker) — never reported as passing.
- [ ] **Step 8: Run `bash scripts/gate8.sh`** — expect zero hits for M22 files (no React/next/prisma/bullmq; no `sk-`/`service_role`/`whsec_` in frontend; no animated-loader keyword; correct brand domain form; no raw brand hex outside tokens.css; no fourth font). Justify any external pre-existing hit in the close note (like prior sessions' M06/M16 false-positives).
- [ ] **Step 9: TASKS.md close ritual.** Add the Session 22 block with the 9-gate line (Gate 3 ✅ "no billable action"), carried-overs (M22-auto → Session 23; public route host-mounting pends D-009; client-portal approval → M37), DECISIONS added D-113…D-118. Note the migration/DECISIONS numbers actually used after the parallel-churn re-check.
- [ ] **Step 10: Final commit (skip if not git):** `chore(m22): seed, verify wiring, DATA-SCHEMA/DECISIONS/JOBS/EDGE-FUNCTIONS/TASKS docs — Session 22 close`.

---

## Self-review (done)

- **Spec coverage:** §1 scope → Tasks 1–8; editor+SEO (§3) → Tasks 3,6,7; revisions+schedule (§4) → Tasks 1(helpers/cron),7; public render (§5) → Tasks 4,5; screens (§6) → Task 7; gates (§7) → Tasks 2,7,8; decisions (§8) → Task 8. No gap.
- **Deferred correctly:** no `content_queue`/`content_schedules`/`blog.generate`/metering/M35/M21 tasks — all carried to M22-auto per D-118.
- **Type consistency:** helper names `save_article_revision`/`publish_article`/`schedule_article`/`publish_scheduled_articles`/`_publish_article_internal`; module exports `scoreArticle`, `renderArticle`/`renderBlogIndex`/`renderCategory`/`buildRss`/`renderBlogNotFound`, `createEditor`/`getHtml`/`setHtml`/`sanitizeHtml` — used consistently across tasks.
- **No placeholders:** every code step shows real SQL/JS; frontend boilerplate references exact precedent files.
