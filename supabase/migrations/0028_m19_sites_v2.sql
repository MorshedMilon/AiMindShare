-- ═══════════════════════════════════════════════════════════════════════════
-- 0028_m19_sites_v2.sql — M19 Sites v2 hardening (Session 24)
-- ADDITIVE-ONLY upgrade of 0022_m19_sites.sql — no column, policy, or function
-- signature is removed or narrowed; every existing row keeps its behavior.
--   · Versioning   → page_versions gains kind ('publish'|'save') + label; a new
--     (D-147)        save_page_version() staff+ RPC creates named save points;
--                    publish_page() prunes per-kind (last 10 publishes + last 10
--                    saves) so manual save points never evict publish history.
--   · Observability→ site_publish_log: append-only, system-written (definer RPCs
--     (D-148)        + service-role Edge Fns), staff+ read. Publish / revert /
--                    save / domain-verify all leave a row.
--   · Staging      → sites.preview_token (per-site secret query param ?pt=) lets
--     (D-149)        the public renderer serve DRAFT pages + bypass maintenance
--                    mode without auth — the staging/production split on this
--                    stack. sites.maintenance_mode + sites.not_found_html give
--                    per-site maintenance + custom 404.
--   · Theming      → sites.style_preset ('minimal'|'bold'|'elegant'|'islamic')
--     (D-150)        maps to token overrides in the PURE site-render.mjs; brand
--                    jsonb still wins over the preset (additive cascade).
--   · Templates    → site_templates gains description/language/conversion_type/
--     (D-151)        render_html/render_css; the gallery is now DATA-DRIVEN.
--                    Global generator seeds store page_json={"generator":"niche",
--                    "niche":…}; a workspace "save as template" row stores the
--                    real page_json + render snapshot (manager+ insert via the
--                    0022 RLS policy — no new policy needed).
--   · i18n         → sites.language + pages.language ('en' default) drive the
--                    published <html lang> — content variants stay deferred.
--
-- Migration numbered 0028 (0027_m22_auto.sql is taken; 0022 = M19 v1).
-- PGlite-safe: no new enums (text + CHECK), no create extension, RLS enabled in
-- THIS file for the one new table (DoD Gate-8 Law 2).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. sites — staging/maintenance/404/theme/i18n columns (all defaulted) ──────
alter table public.sites add column if not exists style_preset     text
  check (style_preset is null or style_preset in ('minimal','bold','elegant','islamic'));
alter table public.sites add column if not exists maintenance_mode boolean not null default false;
alter table public.sites add column if not exists not_found_html   text;
alter table public.sites add column if not exists preview_token    text not null
  default replace(gen_random_uuid()::text,'-','');
alter table public.sites add column if not exists language         text not null default 'en';

-- ── 2. pages — per-page language (content variants deferred) ───────────────────
alter table public.pages add column if not exists language text not null default 'en';

-- ── 3. page_versions — save points: kind + label (existing rows = 'publish') ───
alter table public.page_versions add column if not exists kind  text not null default 'publish'
  check (kind in ('publish','save'));
alter table public.page_versions add column if not exists label text;

-- ── 4. site_templates — gallery metadata + full-content templates ──────────────
alter table public.site_templates add column if not exists description     text;
alter table public.site_templates add column if not exists language        text not null default 'en';
alter table public.site_templates add column if not exists conversion_type text;
alter table public.site_templates add column if not exists render_html     text;
alter table public.site_templates add column if not exists render_css      text;

-- ── 5. site_publish_log — append-only operational history (system-written) ─────
create table if not exists public.site_publish_log (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  site_id       uuid not null references public.sites(id) on delete cascade,
  page_id       uuid references public.pages(id) on delete set null,
  kind          text not null check (kind in ('page.publish','page.revert','page.save','domain.verify','ssl.provision')),
  status        text not null default 'ok' check (status in ('ok','error')),
  detail        jsonb not null default '{}',
  actor_id      uuid,
  created_at    timestamptz not null default now()
);
create index if not exists site_publish_log_site_idx on public.site_publish_log (site_id, created_at desc);
create index if not exists site_publish_log_ws_idx   on public.site_publish_log (workspace_id);

alter table public.site_publish_log enable row level security;
create policy site_publish_log_sel on public.site_publish_log for select
  using ( public.has_role(workspace_id,'staff') );
-- no client insert/update/delete: definer RPCs + service-role Edge Fns own the writes.

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. publish_page — same signature + behavior as 0022, PLUS: stamps kind =
--    'publish', prunes per-kind (saves no longer count against publish history),
--    and appends a site_publish_log row. manager+ (D-105 unchanged).
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
    (workspace_id, page_id, version_no, kind, page_json, render_html, render_css, meta, published_at, published_by)
  values
    (pg.workspace_id, p_page, v_ver, 'publish', pg.page_json, pg.render_html, pg.render_css, pg.meta, now(), auth.uid());

  update public.pages set status = 'published', published_at = now() where id = p_page;
  update public.sites set status = 'published' where id = pg.site_id and status = 'draft';

  -- keep only the most recent 10 PUBLISH versions (saves pruned by their own path)
  delete from public.page_versions
    where page_id = p_page and kind = 'publish'
      and version_no <= ( select max(version_no) - 10
                            from public.page_versions
                           where page_id = p_page and kind = 'publish' );

  insert into public.site_publish_log (workspace_id, site_id, page_id, kind, status, detail, actor_id)
    values (pg.workspace_id, pg.site_id, p_page, 'page.publish', 'ok',
            jsonb_build_object('version_no', v_ver, 'slug', pg.slug), auth.uid());

  return v_ver;
end $$;
revoke all on function public.publish_page(uuid) from public;
grant execute on function public.publish_page(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. save_page_version — a NAMED SAVE POINT without publishing. staff+ (editing
--    tier — creating a restore point is not a publish). Returns the version_no.
--    Prunes to the last 10 kind='save' rows so save points never evict publishes.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.save_page_version(p_page uuid, p_label text default null)
returns int language plpgsql security definer set search_path = public as $$
declare pg record; v_ver int;
begin
  select * into pg from public.pages where id = p_page;
  if not found then raise exception 'page not found'; end if;
  if not public.has_role(pg.workspace_id,'staff') then
    raise exception 'forbidden: staff+ required';
  end if;

  select coalesce(max(version_no),0) + 1 into v_ver
    from public.page_versions where page_id = p_page;

  insert into public.page_versions
    (workspace_id, page_id, version_no, kind, label, page_json, render_html, render_css, meta, published_at, published_by)
  values
    (pg.workspace_id, p_page, v_ver, 'save', nullif(trim(coalesce(p_label,'')),''),
     pg.page_json, pg.render_html, pg.render_css, pg.meta, now(), auth.uid());

  delete from public.page_versions
    where page_id = p_page and kind = 'save'
      and version_no <= ( select max(version_no) - 10
                            from public.page_versions
                           where page_id = p_page and kind = 'save' );

  insert into public.site_publish_log (workspace_id, site_id, page_id, kind, status, detail, actor_id)
    values (pg.workspace_id, pg.site_id, p_page, 'page.save', 'ok',
            jsonb_build_object('version_no', v_ver, 'label', p_label), auth.uid());

  return v_ver;
end $$;
revoke all on function public.save_page_version(uuid, text) from public;
grant execute on function public.save_page_version(uuid, text) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. revert_page — unchanged contract (restore → DRAFT, manager+), PLUS a log row.
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

  insert into public.site_publish_log (workspace_id, site_id, page_id, kind, status, detail, actor_id)
    values (pg.workspace_id, pg.site_id, p_page, 'page.revert', 'ok',
            jsonb_build_object('restored_version', p_version), auth.uid());
end $$;
revoke all on function public.revert_page(uuid, int) from public;
grant execute on function public.revert_page(uuid, int) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Global template gallery seeds — six niches (D-151). Generator templates:
--    page_json = {"generator":"niche","niche":…} → the editor calls the shared
--    page-builder engine (one source of truth, D-103). Fixed ids, re-run-safe.
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.site_templates (id, workspace_id, name, niche, description, language, conversion_type, page_json)
values
  ('53000000-0000-0000-0000-000000000001', null, 'Dental Practice',   'dentist',    'Appointment-first site for dental clinics — services, trust signals, booking CTA.', 'en', 'booking',  '{"generator":"niche","niche":"dentist"}'),
  ('53000000-0000-0000-0000-000000000002', null, 'Real Estate Agent', 'realestate', 'Listing-led layout for agents and brokerages — valuation CTA and social proof.',   'en', 'lead',     '{"generator":"niche","niche":"realestate"}'),
  ('53000000-0000-0000-0000-000000000003', null, 'Restaurant & Cafe', 'restaurant', 'Menu-forward site for restaurants — hours, reservations, gallery.',                 'en', 'booking',  '{"generator":"niche","niche":"restaurant"}'),
  ('53000000-0000-0000-0000-000000000004', null, 'Coaching Program',  'coach',      'Conversion page for coaches and creators — program tiers and application CTA.',    'en', 'lead',     '{"generator":"niche","niche":"coach"}'),
  ('53000000-0000-0000-0000-000000000005', null, 'SaaS Launch',       'saas',       'Product launch layout — feature grid, pricing, trial CTA.',                        'en', 'signup',   '{"generator":"niche","niche":"saas"}'),
  ('53000000-0000-0000-0000-000000000006', null, 'Storefront',        'ecom',       'E-commerce storefront layout — collection highlights and bundle pricing.',         'en', 'purchase', '{"generator":"niche","niche":"ecom"}')
on conflict (id) do nothing;
