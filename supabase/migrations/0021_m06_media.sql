-- ═══════════════════════════════════════════════════════════════════════════
-- 0021_m06_media.sql — AiMindShare Session 20 · M06 Media Library & Asset Manager
--
-- Ships canonical DATA-SCHEMA §6 (media_assets/media_folders) VERBATIM + the
-- minimal logged extensions the PRD UI needs (D-113/D-114). The DB row is an
-- INDEX over a Supabase Storage object: (bucket, storage_path). Bytes live in
-- the `media`/`brand` buckets created in 0004 (path = <workspace_id>/<...>);
-- delivery is a signed URL and image variants are transform URLs (D-116) — no
-- stored `url`, no Sharp/BullMQ worker (PRD's Prisma/R2/S3/Sharp is dead stack).
--
-- Upload is direct-to-Storage (0004 RLS is the wall) + register_media_asset()
-- for the row + autotag job enqueue — no presign Edge Fn (D-115). AI tagging is
-- a `media.autotag` job with a provider-deferred vision scaffold (D-117). Usage
-- tracking is the canonical `used_in` jsonb + register/backfill RPCs (D-118).
-- Storage metering revives the dormant `storage_gb` meter via a nightly gauge
-- recompute (D-119). All tables RLS-on IN THIS FILE (DoD Gate-8 Law 2).
--
-- Migration 0021: highest present is 0020_m15_forms; M08/M16/M19/M20 sessions
-- run in parallel — a merge-collision flag is added at session close (TASKS).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── mime → coarse kind (immutable helper, reused by the RPC + app) ───────────
create or replace function public.media_kind_of(p_mime text)
returns text language sql immutable as $$
  select case
    when p_mime like 'image/%'        then 'image'
    when p_mime like 'video/%'        then 'video'
    when p_mime like 'audio/%'        then 'audio'
    when p_mime = 'application/pdf'   then 'pdf'
    else 'doc'
  end;
$$;

-- ── 1. media_folders (canonical §6 + bucket/kind/pinned for brand collections) ─
create table if not exists public.media_folders (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_id    uuid references public.media_folders(id) on delete cascade,   -- nested tree
  name         text not null,
  bucket       text not null default 'media',                                -- D-113: media | brand
  kind         text not null default 'folder' check (kind in ('folder','collection')),
  pinned       boolean not null default false,                               -- surfaced first in the picker
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);
create index if not exists media_folders_ws_idx     on public.media_folders (workspace_id);
create index if not exists media_folders_parent_idx on public.media_folders (parent_id);

create trigger media_folders_set_updated_at before update on public.media_folders
  for each row execute function public.set_updated_at();

-- ── 2. media_assets (canonical §6 VERBATIM + logged extensions, D-114) ───────
create table if not exists public.media_assets (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  folder_id    uuid references public.media_folders(id) on delete set null,
  bucket       text not null default 'media',
  storage_path text not null,                       -- object key: <workspace_id>/<...>
  kind         text,                                -- image | video | audio | pdf | doc
  mime         text,
  bytes        bigint,
  width        int,
  height       int,
  ai_tags      text[] not null default '{}',        -- filled by the media.autotag job
  used_in      jsonb  not null default '[]',        -- [{module, ref_id}] (D-118)
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,                         -- soft delete
  -- ── logged extensions (D-114) ──
  filename     text not null default '',            -- human name (search / rename)
  title        text,                                -- optional display title
  alt_text     text,                                -- SEO alt, reused by M19/M22
  duration_sec int,                                 -- audio / video length
  is_favorite  boolean not null default false,
  tag_status   text not null default 'pending'
    check (tag_status in ('pending','done','skipped','failed'))
);
create index if not exists media_assets_ws_idx        on public.media_assets (workspace_id);
create index if not exists media_assets_ws_folder_idx on public.media_assets (workspace_id, folder_id);
create index if not exists media_assets_tags_gin      on public.media_assets using gin (ai_tags);
create index if not exists media_assets_filename_idx  on public.media_assets (workspace_id, filename);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RLS — mirrors the 0004 Storage bucket posture exactly:
--      media bucket → staff write / manager delete · brand bucket → admin both
--    (so the table index and the object it points at share one access rule).
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.media_folders enable row level security;
alter table public.media_assets  enable row level security;

-- folders
create policy media_folders_sel on public.media_folders for select
  using ( public.is_member(workspace_id) );
create policy media_folders_ins on public.media_folders for insert
  with check ( public.is_member(workspace_id) and (
    (bucket = 'brand' and public.has_role(workspace_id,'admin'))
    or (bucket <> 'brand' and public.has_role(workspace_id,'staff')) ) );
create policy media_folders_upd on public.media_folders for update
  using ( public.is_member(workspace_id) and (
    (bucket = 'brand' and public.has_role(workspace_id,'admin'))
    or (bucket <> 'brand' and public.has_role(workspace_id,'staff')) ) )
  with check ( public.is_member(workspace_id) and (
    (bucket = 'brand' and public.has_role(workspace_id,'admin'))
    or (bucket <> 'brand' and public.has_role(workspace_id,'staff')) ) );
create policy media_folders_del on public.media_folders for delete
  using ( public.is_member(workspace_id) and (
    (bucket = 'brand' and public.has_role(workspace_id,'admin'))
    or (bucket <> 'brand' and public.has_role(workspace_id,'manager')) ) );

-- assets — browse policy hides soft-deleted rows
create policy media_assets_sel on public.media_assets for select
  using ( public.is_member(workspace_id) and deleted_at is null );
create policy media_assets_ins on public.media_assets for insert
  with check ( public.is_member(workspace_id) and (
    (bucket = 'brand' and public.has_role(workspace_id,'admin'))
    or (bucket <> 'brand' and public.has_role(workspace_id,'staff')) ) );
create policy media_assets_upd on public.media_assets for update
  using ( public.is_member(workspace_id) and (
    (bucket = 'brand' and public.has_role(workspace_id,'admin'))
    or (bucket <> 'brand' and public.has_role(workspace_id,'staff')) ) )
  with check ( public.is_member(workspace_id) and (
    (bucket = 'brand' and public.has_role(workspace_id,'admin'))
    or (bucket <> 'brand' and public.has_role(workspace_id,'staff')) ) );
create policy media_assets_del on public.media_assets for delete
  using ( public.is_member(workspace_id) and (
    (bucket = 'brand' and public.has_role(workspace_id,'admin'))
    or (bucket <> 'brand' and public.has_role(workspace_id,'manager')) ) );

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RPCs (SECURITY DEFINER, role-gated) — the /complete + usage + maintenance
-- ═══════════════════════════════════════════════════════════════════════════

-- 4.1 register_media_asset — the upload /complete step. The browser has already
-- PUT the object to Storage under <workspace_id>/<...> (0004 RLS gated it); this
-- records the index row and, for images, enqueues one media.autotag job atomically.
-- Workspace is derived from path segment 1 (pure SQL; no storage.* dependency so
-- the PGlite probe can exercise it) and re-gated by the caller's role.
create or replace function public.register_media_asset(
  p_bucket text, p_path text, p_folder uuid,
  p_filename text, p_mime text, p_bytes bigint,
  p_kind text default null, p_width int default null,
  p_height int default null, p_duration int default null
) returns public.media_assets
language plpgsql security definer set search_path = public as $$
declare
  v_ws       uuid;
  v_asset    public.media_assets;
  v_is_image boolean;
begin
  v_ws := nullif(split_part(p_path, '/', 1), '')::uuid;   -- path = <workspace_id>/<...>
  if v_ws is null then
    raise exception 'bad_path' using errcode = '22023';
  end if;
  -- role gate matching the bucket write policy
  if p_bucket = 'brand' then
    if not public.has_role(v_ws, 'admin') then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
  else
    if not public.has_role(v_ws, 'staff') then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
  end if;

  v_is_image := coalesce(p_kind,'') = 'image' or coalesce(p_mime,'') like 'image/%';

  insert into public.media_assets
    (workspace_id, folder_id, bucket, storage_path, filename, mime, bytes, kind,
     width, height, duration_sec, created_by, tag_status)
  values
    (v_ws, p_folder, p_bucket, p_path, coalesce(p_filename,''), p_mime, p_bytes,
     coalesce(p_kind, public.media_kind_of(p_mime)), p_width, p_height, p_duration,
     auth.uid(), case when v_is_image then 'pending' else 'skipped' end)
  returning * into v_asset;

  if v_is_image then
    insert into public.jobs (workspace_id, type, payload, status, idempotency_key)
    values (v_ws, 'media.autotag', jsonb_build_object('asset_id', v_asset.id), 'queued',
            'media:autotag:' || v_asset.id::text)
    on conflict (workspace_id, type, idempotency_key) where idempotency_key is not null
      do nothing;
  end if;

  return v_asset;
end $$;

-- 4.2 register_asset_usage — a consumer module (or the app) records that an asset
-- is used somewhere. Appends {module, ref_id} to used_in, deduped. Member-gated.
create or replace function public.register_asset_usage(p_asset uuid, p_module text, p_ref_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_ws uuid; v_entry jsonb;
begin
  select workspace_id into v_ws from public.media_assets where id = p_asset;
  if v_ws is null then raise exception 'asset_not_found' using errcode = 'P0002'; end if;
  if not public.is_member(v_ws) then raise exception 'not_authorized' using errcode = '42501'; end if;
  v_entry := jsonb_build_object('module', p_module, 'ref_id', p_ref_id);
  update public.media_assets
     set used_in = used_in || v_entry
   where id = p_asset and not (used_in @> jsonb_build_array(v_entry));
end $$;

-- 4.3 unregister_asset_usage — remove a usage entry (consumer detached the asset).
create or replace function public.unregister_asset_usage(p_asset uuid, p_module text, p_ref_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_ws uuid; v_entry jsonb;
begin
  select workspace_id into v_ws from public.media_assets where id = p_asset;
  if v_ws is null then raise exception 'asset_not_found' using errcode = 'P0002'; end if;
  if not public.is_member(v_ws) then raise exception 'not_authorized' using errcode = '42501'; end if;
  v_entry := jsonb_build_object('module', p_module, 'ref_id', p_ref_id);
  update public.media_assets a
     set used_in = coalesce(
       (select jsonb_agg(e) from jsonb_array_elements(a.used_in) e where e <> v_entry), '[]'::jsonb)
   where a.id = p_asset;
end $$;

-- 4.4 backfill_asset_usage — one-time (idempotent) backfill of used_in from the
-- one existing consumer, deal_files.asset_id (M11, D-052). Existence-guarded so
-- it is safe whether or not M11 has landed. Returns rows updated.
create or replace function public.backfill_asset_usage()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int := 0;
begin
  if to_regclass('public.deal_files') is null then return 0; end if;
  update public.media_assets a
     set used_in = a.used_in || jsonb_build_object('module','pipeline','ref_id', df.deal_id::text)
    from public.deal_files df
   where df.asset_id = a.id
     and df.asset_id is not null
     and not (a.used_in @> jsonb_build_array(
              jsonb_build_object('module','pipeline','ref_id', df.deal_id::text)));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- 4.5 recompute_storage_meter — nightly GAUGE recompute (set, not add). Sums live
-- asset bytes → GB → the current-period usage_meters row for the dormant
-- storage_gb meter kind (D-119). Storage is a gauge, so this SETs the value.
create or replace function public.recompute_storage_meter(p_workspace uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_gb numeric;
begin
  select coalesce(sum(bytes),0)::numeric / (1024*1024*1024)
    into v_gb
    from public.media_assets
   where workspace_id = p_workspace and deleted_at is null;
  insert into public.usage_meters (workspace_id, kind, period, quantity)
  values (p_workspace, 'storage_gb', date_trunc('month', now())::date, v_gb)
  on conflict (workspace_id, kind, period)
  do update set quantity = excluded.quantity, updated_at = now();
  return v_gb;
end $$;

-- 4.6 soft_delete_asset — mark an asset deleted (manager+ media / admin brand).
-- A definer RPC, NOT a bare RLS UPDATE: flipping deleted_at removes the row from
-- the browse SELECT policy, which Postgres treats as a WITH CHECK failure on a
-- plain update. The app reads used_in first to warn when the asset is in use.
create or replace function public.soft_delete_asset(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ws uuid; v_bucket text;
begin
  select workspace_id, bucket into v_ws, v_bucket
    from public.media_assets where id = p_id and deleted_at is null;
  if v_ws is null then raise exception 'asset_not_found' using errcode = 'P0002'; end if;
  if v_bucket = 'brand' then
    if not public.has_role(v_ws,'admin') then raise exception 'not_authorized' using errcode = '42501'; end if;
  else
    if not public.has_role(v_ws,'manager') then raise exception 'not_authorized' using errcode = '42501'; end if;
  end if;
  update public.media_assets set deleted_at = now() where id = p_id;
end $$;

-- ── Grants: the app calls register_media_asset / (un)register_asset_usage /
--    soft_delete_asset; backfill + storage recompute are maintenance (cron) ──
grant execute on function public.register_media_asset(text,text,uuid,text,text,bigint,text,int,int,int) to authenticated;
grant execute on function public.register_asset_usage(uuid,text,text)   to authenticated;
grant execute on function public.unregister_asset_usage(uuid,text,text) to authenticated;
grant execute on function public.soft_delete_asset(uuid)                to authenticated;
revoke all on function public.backfill_asset_usage()          from public;
revoke all on function public.recompute_storage_meter(uuid)   from public;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Nightly storage meter (pg_cron). Guarded so this file still loads where
--    pg_cron is absent (PGlite). On hosted Supabase it schedules normally.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
begin
  perform cron.schedule(
    'm06-storage-meter-nightly',
    '0 3 * * *',
    $cron$ select public.recompute_storage_meter(w.id) from public.workspaces w $cron$);
exception when others then
  raise notice 'pg_cron unavailable — m06-storage-meter-nightly not scheduled (%).', sqlerrm;
end $$;

-- ── One-time used_in backfill from deal_files (idempotent; guarded) ──────────
do $$
begin
  perform public.backfill_asset_usage();
exception when others then
  raise notice 'backfill_asset_usage skipped (%).', sqlerrm;
end $$;
