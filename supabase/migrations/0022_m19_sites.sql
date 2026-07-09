-- ═══════════════════════════════════════════════════════════════════════════
-- 0020_m19_sites.sql — M19 Sites (AI Website Builder · GrapeJS) (Session 18)
-- A text-to-website builder + full GrapeJS editor + publishing wired into the
-- CRM (M09), the automation bus (M13), compliance cookie-banner (M05), Calendar
-- (M14) and Inbox (M12) embeds. Built VERTICALLY on the locked stack — vanilla
-- HTML/CSS/JS + Supabase — NOT the PRD's Craft.js/Prisma/Next sketch (D-005:
-- Craft.js → GrapeJS). Reconciled in DECISIONS this session:
--   · page_json  → GrapeJS project data (the editable source of truth, canonical
--     (D-101)      DATA-SCHEMA §12 "GrapeJS writes page_json") PLUS snapshotted
--                  render_html/render_css served by the public renderer, kept in
--                  lockstep by publish_page(). The renderer never runs GrapeJS.
--   · Renderer   → a Supabase Edge Function (site-render), not Node SSR / static
--     (D-100)      export; static publish deferred behind OPEN D-009 (hosting).
--   · Domains    → a separate site_domains table (multi-domain + verification);
--     (D-104)      sites.subdomain is the always-on staging URL; live SSL
--                  provisioning is a "ready, not run" scaffold pending D-009.
--   · Embeds     → Form/Calendar/Chat export as data-* placeholders hydrated at
--     (D-102)      view time; CalendarEmbed → real M14, FormEmbed → planned M15
--                  (scaffold), ChatWidget → M12 webchat (scaffold).
--   · Tracking   → M19 owns the M05 cookie-banner injection + a first-party pixel
--     (D-106)      (site-track → visitor_sessions → log_activity/emit_trigger
--                  'page.visited' for identified contacts).
--   · Perms      → coarse RLS tiers, no new sites.* fine grants (M11 D-049): site
--     (D-105)      + page read/edit = staff+, publish + delete = manager+, domains
--                  = admin+, client CEILING. Published pages are NOT anon-readable
--                  on the table — the renderer reads service-role, status filter.
--
-- Migration numbered 0020 (0000–0019 taken; the missing 0012 + the two 0010s are
-- pre-existing parallel-build collisions — M19 has no ordering dep on them).
--
-- PGlite-safety: the probe strips `create extension` lines and runs the raw SQL.
-- Enums are guarded (duplicate_object → no-op). Every new tenant table enables RLS
-- in THIS file (DoD Gate-8 Law 2).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. Enums (guarded — a duplicate is a no-op on re-run) ─────────────────────
do $$ begin
  create type public.site_status as enum ('draft','published','archived');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.page_status as enum ('draft','published');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.domain_status as enum ('pending','verifying','active','failed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.ssl_status as enum ('none','pending','active','failed');
exception when duplicate_object then null; end $$;

-- ── 1. sites — one row per website; brand + nav + SEO defaults live here ───────
create table if not exists public.sites (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  subdomain     text unique,                            -- always-on staging URL host part
  status        public.site_status not null default 'draft',
  favicon_url   text,
  brand         jsonb not null default '{}',            -- {colors:{}, fonts:{}} applied site-wide
  nav           jsonb not null default '{"items":[]}',  -- nav menu builder items
  seo_defaults  jsonb not null default '{}',            -- {title,description,og_image,robots}
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);
create index if not exists sites_ws_idx on public.sites (workspace_id);

-- ── 2. pages — multi-page; page_json = GrapeJS project data; render_* = served ─
create table if not exists public.pages (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  site_id       uuid not null references public.sites(id) on delete cascade,
  title         text not null,
  slug          text not null,
  is_home       boolean not null default false,
  status        public.page_status not null default 'draft',
  meta          jsonb not null default '{}',            -- {title,description,og_image,canonical,robots,schema_type,schema_json}
  page_json     jsonb not null default '{}',            -- GrapeJS getProjectData() — editable truth
  render_html   text,                                   -- GrapeJS getHtml() — served snapshot
  render_css    text,                                   -- GrapeJS getCss()  — served snapshot
  published_at  timestamptz,
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  unique (site_id, slug)
);
create index if not exists pages_ws_idx on public.pages (workspace_id);
create index if not exists pages_site_idx on public.pages (site_id, sort);

-- ── 3. page_versions — publish snapshots; restore last 10 (append-only) ────────
create table if not exists public.page_versions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  page_id       uuid not null references public.pages(id) on delete cascade,
  version_no    int  not null,
  page_json     jsonb not null default '{}',
  render_html   text,
  render_css    text,
  meta          jsonb not null default '{}',
  published_at  timestamptz not null default now(),
  published_by  uuid,
  unique (page_id, version_no)
);
create index if not exists page_versions_page_idx on public.page_versions (page_id, version_no desc);

-- ── 4. site_domains — custom domains + verification + SSL (SSL = scaffold) ─────
create table if not exists public.site_domains (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  site_id            uuid not null references public.sites(id) on delete cascade,
  domain             text not null unique,               -- a domain maps to one site platform-wide
  status             public.domain_status not null default 'pending',
  ssl_status         public.ssl_status not null default 'none',
  verification_token text not null default replace(gen_random_uuid()::text,'-',''),
  verified_at        timestamptz,
  is_primary         boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz
);
create index if not exists site_domains_site_idx on public.site_domains (site_id);

-- ── 5. site_templates — GLOBAL gallery (workspace_id null = platform row) ──────
create table if not exists public.site_templates (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references public.workspaces(id) on delete cascade,  -- nullable = global
  name          text not null,
  niche         text,
  thumb_url     text,
  page_json     jsonb not null default '{}',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists site_templates_niche_idx on public.site_templates (niche) where workspace_id is null;

-- ── 6. visitor_sessions — first-party analytics; service-role write only ───────
create table if not exists public.visitor_sessions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  site_id       uuid not null references public.sites(id) on delete cascade,
  visitor_id    text not null,                           -- first-party cookie id
  contact_id    uuid references public.contacts(id) on delete set null,  -- set on identify
  pages         jsonb not null default '[]',             -- [{slug, at}]
  utm           jsonb not null default '{}',
  started_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (site_id, visitor_id)
);
create index if not exists visitor_sessions_ws_idx on public.visitor_sessions (workspace_id);
create index if not exists visitor_sessions_contact_idx on public.visitor_sessions (contact_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. RLS — standard template. SELECT = staff+ (internal-ops ceiling: a client
--    role cannot read the workspace's sites — sites are OPERATOR surfaces; the
--    per-client portal narrowing lands with M37). sites/pages ins+upd = staff+,
--    del = manager+. site_domains ins/upd/del = admin+ (integration posture,
--    D-056). page_versions + visitor_sessions are SYSTEM-written (definer RPCs /
--    the service-role track fn own the writes — browser cannot forge them).
--    site_templates global rows are readable by any authenticated user.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.sites enable row level security;
create policy sites_sel on public.sites for select using ( public.has_role(workspace_id,'staff') );
create policy sites_ins on public.sites for insert with check ( public.has_role(workspace_id,'staff') );
create policy sites_upd on public.sites for update using ( public.has_role(workspace_id,'staff') );
create policy sites_del on public.sites for delete using ( public.has_role(workspace_id,'manager') );

alter table public.pages enable row level security;
create policy pages_sel on public.pages for select using ( public.has_role(workspace_id,'staff') );
create policy pages_ins on public.pages for insert with check ( public.has_role(workspace_id,'staff') );
create policy pages_upd on public.pages for update using ( public.has_role(workspace_id,'staff') );
create policy pages_del on public.pages for delete using ( public.has_role(workspace_id,'manager') );

alter table public.page_versions enable row level security;
create policy page_versions_sel on public.page_versions for select using ( public.has_role(workspace_id,'staff') );
-- no client insert/update/delete: publish_page()/revert_page() (definer) own the writes.

alter table public.site_domains enable row level security;
create policy site_domains_sel on public.site_domains for select using ( public.has_role(workspace_id,'staff') );
create policy site_domains_ins on public.site_domains for insert with check ( public.has_role(workspace_id,'admin') );
create policy site_domains_upd on public.site_domains for update using ( public.has_role(workspace_id,'admin') );
create policy site_domains_del on public.site_domains for delete using ( public.has_role(workspace_id,'admin') );

alter table public.site_templates enable row level security;
-- global gallery: any authenticated user can read active templates; a workspace's
-- own rows are readable by its members. No client write path (platform/service seeds).
create policy site_templates_sel on public.site_templates for select
  using ( workspace_id is null or public.has_role(workspace_id,'staff') );
create policy site_templates_ins on public.site_templates for insert
  with check ( workspace_id is not null and public.has_role(workspace_id,'manager') );
create policy site_templates_upd on public.site_templates for update
  using ( workspace_id is not null and public.has_role(workspace_id,'manager') );
create policy site_templates_del on public.site_templates for delete
  using ( workspace_id is not null and public.has_role(workspace_id,'manager') );

alter table public.visitor_sessions enable row level security;
create policy visitor_sessions_sel on public.visitor_sessions for select using ( public.has_role(workspace_id,'staff') );
-- no client insert/update/delete: the site-track Edge Fn (service role) owns the writes (Gate-4/D-106).

-- ── updated_at triggers ───────────────────────────────────────────────────────
create trigger sites_set_updated_at        before update on public.sites        for each row execute function public.set_updated_at();
create trigger pages_set_updated_at        before update on public.pages        for each row execute function public.set_updated_at();
create trigger site_domains_set_updated_at before update on public.site_domains for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. publish_page — snapshot the current page into page_versions, flip status,
--    prune to the last 10 versions, and publish the site if it was still a draft.
--    manager+ (publishing is a significant action, D-105). Returns the version_no.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.publish_page(p_page uuid)
returns int language plpgsql security definer set search_path = public as $$
declare pg record; v_ver int;
begin
  select * into pg from public.pages where id = p_page;
  if not found then raise exception 'page not found'; end if;
  if not public.has_role(pg.workspace_id,'manager') then
    raise exception 'forbidden: manager+ required to publish';
  end if;

  select coalesce(max(version_no),0) + 1 into v_ver
    from public.page_versions where page_id = p_page;

  insert into public.page_versions
    (workspace_id, page_id, version_no, page_json, render_html, render_css, meta, published_at, published_by)
  values
    (pg.workspace_id, p_page, v_ver, pg.page_json, pg.render_html, pg.render_css, pg.meta, now(), auth.uid());

  update public.pages set status = 'published', published_at = now() where id = p_page;
  update public.sites set status = 'published' where id = pg.site_id and status = 'draft';

  -- keep only the most recent 10 versions
  delete from public.page_versions
    where page_id = p_page
      and version_no <= ( select max(version_no) - 10 from public.page_versions where page_id = p_page );

  return v_ver;
end $$;
revoke all on function public.publish_page(uuid) from public;
grant execute on function public.publish_page(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. revert_page — restore a prior version's content onto the page as a DRAFT
--    (operator re-publishes to make it live). manager+.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.revert_page(p_page uuid, p_version int)
returns void language plpgsql security definer set search_path = public as $$
declare pg record; v record;
begin
  select * into pg from public.pages where id = p_page;
  if not found then raise exception 'page not found'; end if;
  if not public.has_role(pg.workspace_id,'manager') then
    raise exception 'forbidden: manager+ required to revert';
  end if;
  select * into v from public.page_versions where page_id = p_page and version_no = p_version;
  if not found then raise exception 'version not found'; end if;

  update public.pages
     set page_json = v.page_json, render_html = v.render_html, render_css = v.render_css,
         meta = v.meta, status = 'draft'
   where id = p_page;
end $$;
revoke all on function public.revert_page(uuid, int) from public;
grant execute on function public.revert_page(uuid, int) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. duplicate_page — deep-copy a page within its site (unique slug). staff+.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.duplicate_page(p_page uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare pg record; new_id uuid; new_slug text;
begin
  select * into pg from public.pages where id = p_page;
  if not found then raise exception 'page not found'; end if;
  if not public.has_role(pg.workspace_id,'staff') then
    raise exception 'forbidden: staff+ required';
  end if;
  new_slug := pg.slug || '-copy-' || substr(replace(gen_random_uuid()::text,'-',''),1,4);
  insert into public.pages
    (workspace_id, site_id, title, slug, is_home, status, meta, page_json, render_html, render_css, sort)
  values
    (pg.workspace_id, pg.site_id, pg.title || ' (copy)', new_slug, false, 'draft',
     pg.meta, pg.page_json, pg.render_html, pg.render_css, pg.sort + 1)
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.duplicate_page(uuid) from public;
grant execute on function public.duplicate_page(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. Tracking + page.visited — the site-track Edge Fn (service role) upserts a
--     visitor_sessions row and, for an IDENTIFIED contact, writes the M09 timeline
--     (log_activity = timeline.add, D-048) and fires the M13 bus
--     emit_trigger('page.visited', …). page.visited is registered as a real
--     trigger source in the M13 registry (_shared/triggerTypes.ts + js mirror).
--     record_page_visit() centralises the identified-visitor side-effects so the
--     Edge Fn and the probe run the same path (SECURITY DEFINER, service-role).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.record_page_visit(
  p_ws uuid, p_site uuid, p_contact uuid, p_slug text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_contact is null then return; end if;
  -- Direct timeline insert (not log_activity) — the pixel runs service-role with
  -- no auth.uid(), so the is_member guard in log_activity would reject it. Same
  -- no-auth side-effect pattern as M14's booking trigger (D-065).
  insert into public.activity_log (workspace_id, contact_id, type, description, metadata, actor_id)
    values (p_ws, p_contact, 'page_visit',
            'Visited page /' || coalesce(p_slug,''),
            jsonb_build_object('site_id', p_site, 'slug', p_slug), null);
  begin
    perform public.emit_trigger(p_ws, 'page.visited',
      jsonb_build_object('contact_id', p_contact, 'site_id', p_site, 'slug', p_slug));
  exception when others then null;   -- M13 present; tolerate absence in isolated probes
  end;
end $$;
revoke all on function public.record_page_visit(uuid, uuid, uuid, text) from public;
grant execute on function public.record_page_visit(uuid, uuid, uuid, text) to service_role;

-- ── site.ssl_provision — SCAFFOLD job type (nothing provisions until D-009). ──
-- No pg_cron scheduled here: domain-verify flips status on DNS match and leaves
-- ssl_status = 'pending' with a logged D-009 note; the worker's ssl_provision
-- handler is a documented scaffold (JOBS-AND-WORKERS-SPEC §6).
