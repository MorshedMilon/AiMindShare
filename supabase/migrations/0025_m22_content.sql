-- ═══════════════════════════════════════════════════════════════════════════
-- 0025_m22_content.sql — M22 Content / CMS · MANUAL slice (Session 22)
-- The article library + editorial workflow half of M22: draft → in_review →
-- scheduled → published, autosave revisions, categories + authors, a review
-- queue, and publishing onto M19 site blog routes. Built VERTICALLY on the
-- locked stack (vanilla + Supabase) — NOT the PRD's Prisma/TipTap-React/BullMQ.
--
-- The AI AUTO-BLOG pipeline (SerpApi/GPT-4o/DALL·E/embedding internal-linker/
-- quality-gate/blog.generate worker/content_queue/content_schedules/scheduler
-- top-up/distribution) is the SEPARATE Session-23 slice (BUILD-SEQUENCE S23) and
-- is NOT built here. M21 (SEO Engine) + M35 (Creative Studio) — consumed only by
-- that pipeline — are unbuilt; their seams are documented scaffolds (user-approved).
--
-- Reconciled in DECISIONS this session:
--   · Editor    → hand-rolled contenteditable rich editor, not TipTap/ProseMirror
--     (D-120)     (no-build vanilla stack; D-005 Craft.js→GrapeJS, D-085 Chart.js).
--   · Rendering → a NEW blog-render Edge Fn (mirrors M19 site-render) serves /blog
--     (D-121)     routes + RSS; M19's site-render is NOT modified. Articles carry
--                 site_id; the renderer reads published rows live, status-filtered.
--   · Queue     → the editorial/review queue is a status filter on blog_articles;
--     (D-122)     content_queue + content_schedules (auto-blog) defer to S23.
--   · Taxonomy  → tags = text[] on the article; single category_id FK; article_authors
--     (D-123)     table = a workspace user's byline OR a pen name.
--   · Embedding → embedding vector(1536) added as a NULLABLE scaffold column; no
--     (D-124)     ivfflat index until S23 populates it; internal-link popup uses text
--                 search now. (Its own line so the PGlite probe can strip it.)
--   · Scoring   → readability (Flesch) + on-page SEO score computed CLIENT-side,
--     (D-125)     stored on save; no provider call → no metering (Gate 3 none).
--   · Bus       → publish fires the M13 emit_trigger('article.published') (tolerant);
--     (D-126)     one-click distribute to M23/M24/M16 is a labeled S23 scaffold.
--   · Cron      → m22-scheduled-publish pg_cron → inline publish_due_articles()
--     (D-127)     (no heavy job; mirrors M20 sweep / M28 overdue flip).
--   · Perms     → coarse RLS tiers, no new content.* fine grants (M19 D-105): read +
--                 create + edit = staff+, delete + publish + approve = manager+, client
--                 CEILING. Revisions + publish are definer-owned (browser can't forge).
--
-- Migration numbered 0025 (0000–0024 taken; the missing 0012 + the two 0010s are
-- pre-existing parallel-build collisions — M22 has no ordering dep on them).
--
-- PGlite-safety: the probe strips `create extension`, `gin_trgm_ops`, and the
-- `vector(1536)` scaffold line, then runs the raw SQL. Enums guarded. Every new
-- tenant table enables RLS in THIS file (DoD Gate-8 Law 2).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. Enum (guarded — a duplicate is a no-op on re-run) ──────────────────────
do $$ begin
  create type public.article_status as enum ('draft','in_review','scheduled','published','archived');
exception when duplicate_object then null; end $$;

-- ── 1. article_authors — a workspace user's byline OR a pen name (D-123) ───────
create table if not exists public.article_authors (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid references public.profiles(id) on delete set null,  -- null = pen name
  name          text not null,
  bio           text,
  avatar_url    text,
  created_at    timestamptz not null default now()
);
create index if not exists article_authors_ws_idx on public.article_authors (workspace_id);

-- ── 2. article_categories — per-site blog taxonomy (D-123) ────────────────────
create table if not exists public.article_categories (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  site_id       uuid not null references public.sites(id) on delete cascade,
  name          text not null,
  slug          text not null,
  created_at    timestamptz not null default now(),
  unique (site_id, slug)
);
create index if not exists article_categories_site_idx on public.article_categories (site_id);

-- ── 3. blog_articles — canonical DATA-SCHEMA §9 + logged extensions ───────────
create table if not exists public.blog_articles (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  site_id            uuid not null references public.sites(id) on delete cascade,        -- publish target (M19)
  category_id        uuid references public.article_categories(id) on delete set null,
  author_id          uuid references public.article_authors(id) on delete set null,
  keyword            text,                                                               -- primary target keyword
  title              text not null,
  slug               text not null,
  excerpt            text,
  content_html       text,                                                               -- editor output (sanitized)
  meta_title         text,
  meta_desc          text,
  featured_image_url text,                                                               -- from M06 AssetPicker
  tags               text[] not null default '{}',
  schema             jsonb not null default '{}',                                        -- Article/FAQ JSON-LD (built at publish)
  seo_score          int,                                                                -- 0–100 on-page rubric (client-computed)
  readability_score  int,                                                                -- Flesch reading-ease (client-computed)
  word_count         int not null default 0,
  status             public.article_status not null default 'draft',
  scheduled_at       timestamptz,                                                        -- when status='scheduled'
  reject_feedback    text,                                                               -- last editorial rejection (S23 regen)
  embedding          vector(1536),                                                       -- D-124 scaffold (no ivfflat until S23)
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz,
  unique (site_id, slug)
);
create index if not exists blog_articles_ws_idx     on public.blog_articles (workspace_id);
create index if not exists blog_articles_site_idx   on public.blog_articles (site_id, status);
create index if not exists blog_articles_status_idx on public.blog_articles (workspace_id, status);

-- ── 4. article_revisions — append-only autosave snapshots (restore last 20) ───
create table if not exists public.article_revisions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  article_id    uuid not null references public.blog_articles(id) on delete cascade,
  version_no    int  not null,
  title         text,
  content_html  text,
  meta          jsonb not null default '{}',    -- {meta_title,meta_desc,excerpt,keyword,tags,featured_image_url,seo_score,readability_score,word_count}
  saved_at      timestamptz not null default now(),
  saved_by      uuid,
  unique (article_id, version_no)
);
create index if not exists article_revisions_article_idx on public.article_revisions (article_id, version_no desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. RLS — standard coarse tiers (M19 D-105). SELECT/INSERT/UPDATE = staff+;
--    DELETE + publish/approve = manager+; client role = CEILING (cannot read the
--    workspace's articles — content is an OPERATOR surface, per-client portal
--    narrowing lands with M37). article_revisions is SYSTEM-written (the
--    save_article_revision definer RPC owns the write) — SELECT-only for members.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.article_authors enable row level security;
create policy article_authors_sel on public.article_authors for select using ( public.has_role(workspace_id,'staff') );
create policy article_authors_ins on public.article_authors for insert with check ( public.has_role(workspace_id,'staff') );
create policy article_authors_upd on public.article_authors for update using ( public.has_role(workspace_id,'staff') );
create policy article_authors_del on public.article_authors for delete using ( public.has_role(workspace_id,'manager') );

alter table public.article_categories enable row level security;
create policy article_categories_sel on public.article_categories for select using ( public.has_role(workspace_id,'staff') );
create policy article_categories_ins on public.article_categories for insert with check ( public.has_role(workspace_id,'staff') );
create policy article_categories_upd on public.article_categories for update using ( public.has_role(workspace_id,'staff') );
create policy article_categories_del on public.article_categories for delete using ( public.has_role(workspace_id,'manager') );

alter table public.blog_articles enable row level security;
create policy blog_articles_sel on public.blog_articles for select using ( public.has_role(workspace_id,'staff') );
create policy blog_articles_ins on public.blog_articles for insert with check ( public.has_role(workspace_id,'staff') );
create policy blog_articles_upd on public.blog_articles for update using ( public.has_role(workspace_id,'staff') );
create policy blog_articles_del on public.blog_articles for delete using ( public.has_role(workspace_id,'manager') );

alter table public.article_revisions enable row level security;
create policy article_revisions_sel on public.article_revisions for select using ( public.has_role(workspace_id,'staff') );
-- no client insert/update/delete: save_article_revision() (definer) owns the writes.

-- ── updated_at trigger on the article ─────────────────────────────────────────
create trigger blog_articles_set_updated_at before update on public.blog_articles for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. save_article_revision — snapshot the article's current content into
--    article_revisions with the next version_no, prune to the last 20. staff+.
--    Returns the version_no.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.save_article_revision(p_article uuid)
returns int language plpgsql security definer set search_path = public as $$
declare a record; v_ver int;
begin
  select * into a from public.blog_articles where id = p_article;
  if not found then raise exception 'article not found'; end if;
  if not public.has_role(a.workspace_id,'staff') then
    raise exception 'forbidden: staff+ required';
  end if;

  select coalesce(max(version_no),0) + 1 into v_ver
    from public.article_revisions where article_id = p_article;

  insert into public.article_revisions
    (workspace_id, article_id, version_no, title, content_html, meta, saved_by)
  values
    (a.workspace_id, p_article, v_ver, a.title, a.content_html,
     jsonb_build_object(
       'meta_title', a.meta_title, 'meta_desc', a.meta_desc, 'excerpt', a.excerpt,
       'keyword', a.keyword, 'tags', to_jsonb(a.tags), 'featured_image_url', a.featured_image_url,
       'seo_score', a.seo_score, 'readability_score', a.readability_score, 'word_count', a.word_count),
     auth.uid());

  -- keep only the most recent 20 versions
  delete from public.article_revisions
    where article_id = p_article
      and version_no <= ( select max(version_no) - 20 from public.article_revisions where article_id = p_article );

  return v_ver;
end $$;
revoke all on function public.save_article_revision(uuid) from public;
grant execute on function public.save_article_revision(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. restore_article_revision — copy a prior version's content back onto the
--    article as a DRAFT (operator re-publishes to make it live). staff+.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.restore_article_revision(p_article uuid, p_version int)
returns void language plpgsql security definer set search_path = public as $$
declare a record; r record;
begin
  select * into a from public.blog_articles where id = p_article;
  if not found then raise exception 'article not found'; end if;
  if not public.has_role(a.workspace_id,'staff') then
    raise exception 'forbidden: staff+ required';
  end if;
  select * into r from public.article_revisions where article_id = p_article and version_no = p_version;
  if not found then raise exception 'revision not found'; end if;

  update public.blog_articles set
    title              = r.title,
    content_html       = r.content_html,
    meta_title         = r.meta->>'meta_title',
    meta_desc          = r.meta->>'meta_desc',
    excerpt            = r.meta->>'excerpt',
    keyword            = r.meta->>'keyword',
    featured_image_url = r.meta->>'featured_image_url',
    tags               = coalesce((select array_agg(x) from jsonb_array_elements_text(r.meta->'tags') x), '{}'),
    seo_score          = nullif(r.meta->>'seo_score','')::int,
    readability_score  = nullif(r.meta->>'readability_score','')::int,
    word_count         = coalesce(nullif(r.meta->>'word_count','')::int, 0),
    status             = 'draft'
  where id = p_article;
end $$;
revoke all on function public.restore_article_revision(uuid, int) from public;
grant execute on function public.restore_article_revision(uuid, int) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. _m22_publish (internal) — the authoritative publish side-effect with NO
--    role check: build Article + optional FAQ JSON-LD into `schema`, flip status
--    to 'published', stamp published_at, and fire the M13 bus (tolerant). Called
--    only by publish_article / approve_article (after a manager+ check) and by
--    publish_due_articles (service-role cron). Not granted to anyone — the
--    definer callers run as owner. Returns published_at.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public._m22_publish(p_article uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare a record; au record; v_schema jsonb; v_at timestamptz := now();
begin
  select * into a from public.blog_articles where id = p_article;
  if not found then raise exception 'article not found'; end if;

  select * into au from public.article_authors where id = a.author_id;

  -- Article JSON-LD (schema.org). FAQ blocks in the body would be layered by S23;
  -- here we emit the canonical Article node the blog-render head injects.
  v_schema := jsonb_build_object(
    '@context', 'https://schema.org',
    '@type',    'Article',
    'headline', a.title,
    'description', coalesce(a.meta_desc, a.excerpt),
    'image',    a.featured_image_url,
    'datePublished', to_char(v_at, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
    'author',   jsonb_build_object('@type','Person','name', coalesce(au.name,'Staff'))
  );

  update public.blog_articles
     set status = 'published', published_at = v_at, schema = v_schema, scheduled_at = null
   where id = p_article;

  -- Fire the M13 automation bus. Tolerate M13 absence (isolated probes) — same
  -- pattern as M19 record_page_visit / M20 record_funnel_event.
  begin
    perform public.emit_trigger(a.workspace_id, 'article.published',
      jsonb_build_object('article_id', p_article, 'site_id', a.site_id, 'slug', a.slug));
  exception when others then null;
  end;

  return v_at;
end $$;
revoke all on function public._m22_publish(uuid) from public;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. publish_article — manager+ gate → _m22_publish. Returns published_at.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.publish_article(p_article uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select workspace_id into a from public.blog_articles where id = p_article;
  if not found then raise exception 'article not found'; end if;
  if not public.has_role(a.workspace_id,'manager') then
    raise exception 'forbidden: manager+ required to publish';
  end if;
  return public._m22_publish(p_article);
end $$;
revoke all on function public.publish_article(uuid) from public;
grant execute on function public.publish_article(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. schedule_article — set a future publish time. manager+.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.schedule_article(p_article uuid, p_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select workspace_id into a from public.blog_articles where id = p_article;
  if not found then raise exception 'article not found'; end if;
  if not public.has_role(a.workspace_id,'manager') then
    raise exception 'forbidden: manager+ required to schedule';
  end if;
  update public.blog_articles set status = 'scheduled', scheduled_at = p_at where id = p_article;
end $$;
revoke all on function public.schedule_article(uuid, timestamptz) from public;
grant execute on function public.schedule_article(uuid, timestamptz) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. submit_for_review — staff pushes a draft into the editorial queue. staff+.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.submit_for_review(p_article uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select workspace_id into a from public.blog_articles where id = p_article;
  if not found then raise exception 'article not found'; end if;
  if not public.has_role(a.workspace_id,'staff') then
    raise exception 'forbidden: staff+ required';
  end if;
  update public.blog_articles set status = 'in_review' where id = p_article;
end $$;
revoke all on function public.submit_for_review(uuid) from public;
grant execute on function public.submit_for_review(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. approve_article — an editor approves a review-queue draft → publish.
--     manager+. Returns published_at.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.approve_article(p_article uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select workspace_id into a from public.blog_articles where id = p_article;
  if not found then raise exception 'article not found'; end if;
  if not public.has_role(a.workspace_id,'manager') then
    raise exception 'forbidden: manager+ required to approve';
  end if;
  return public._m22_publish(p_article);
end $$;
revoke all on function public.approve_article(uuid) from public;
grant execute on function public.approve_article(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. reject_article — send a review-queue draft back with a feedback note (S23
--     regen consumes reject_feedback). manager+.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.reject_article(p_article uuid, p_feedback text)
returns void language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select workspace_id into a from public.blog_articles where id = p_article;
  if not found then raise exception 'article not found'; end if;
  if not public.has_role(a.workspace_id,'manager') then
    raise exception 'forbidden: manager+ required to reject';
  end if;
  update public.blog_articles set status = 'draft', reject_feedback = p_feedback where id = p_article;
end $$;
revoke all on function public.reject_article(uuid, text) from public;
grant execute on function public.reject_article(uuid, text) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. publish_due_articles — the cron body: publish every 'scheduled' article
--     whose scheduled_at has passed. Service-role only (no auth context → no
--     role check; it is a system sweep, like M20 sweep_abandoned_funnels).
--     Returns the number published.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.publish_due_articles()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select id from public.blog_articles
     where status = 'scheduled' and scheduled_at is not null and scheduled_at <= now()
  loop
    perform public._m22_publish(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.publish_due_articles() from public;
grant execute on function public.publish_due_articles() to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 15. pg_cron — publish scheduled articles every 15 min (D-127). Registered in
--     JOBS-AND-WORKERS-SPEC §5. Guarded for PGlite (no pg_cron there).
-- ═══════════════════════════════════════════════════════════════════════════
do $$ begin
  perform cron.schedule('m22-scheduled-publish', '*/15 * * * *',
    $cron$ select public.publish_due_articles(); $cron$);
exception when others then
  raise notice 'pg_cron unavailable — m22-scheduled-publish not scheduled (%).', sqlerrm;
end $$;
