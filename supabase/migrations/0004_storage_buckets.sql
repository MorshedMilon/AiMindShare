-- ═══════════════════════════════════════════════════════════════════════════
-- 0004_storage_buckets.sql — AiMindShare Session 0
-- Four buckets; private by default. Object paths are workspace_id-scoped:
--   <bucket>/<workspace_id>/<...>   →  first folder segment == workspace_id.
-- Public delivery is via signed URLs (private buckets) or the 'public' bucket.
-- (No public.* tables here → DoD Gate-8 RLS check does not apply to this file.)
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public) values
  ('media',  'media',  false),
  ('brand',  'brand',  false),
  ('portal', 'portal', false),
  ('public', 'public', true)
on conflict (id) do nothing;

-- Helper: the workspace_id encoded as the first path segment of an object name.
create or replace function public.storage_ws(name text) returns uuid
language sql immutable as $$
  select nullif((storage.foldername(name))[1], '')::uuid;
$$;

-- Private buckets: read/write/delete only for members of the path's workspace,
-- role-gated the same way as tenant tables.
create policy "media member read"   on storage.objects for select
  using ( bucket_id = 'media'  and public.is_member(public.storage_ws(name)) );
create policy "media staff write"   on storage.objects for insert
  with check ( bucket_id = 'media'  and public.has_role(public.storage_ws(name), 'staff') );
create policy "media manager delete" on storage.objects for delete
  using ( bucket_id = 'media'  and public.has_role(public.storage_ws(name), 'manager') );

create policy "brand member read"    on storage.objects for select
  using ( bucket_id = 'brand'  and public.is_member(public.storage_ws(name)) );
create policy "brand admin write"    on storage.objects for insert
  with check ( bucket_id = 'brand'  and public.has_role(public.storage_ws(name), 'admin') );
create policy "brand admin delete"   on storage.objects for delete
  using ( bucket_id = 'brand'  and public.has_role(public.storage_ws(name), 'admin') );

create policy "portal member read"   on storage.objects for select
  using ( bucket_id = 'portal' and public.is_member(public.storage_ws(name)) );
create policy "portal staff write"   on storage.objects for insert
  with check ( bucket_id = 'portal' and public.has_role(public.storage_ws(name), 'staff') );
create policy "portal manager delete" on storage.objects for delete
  using ( bucket_id = 'portal' and public.has_role(public.storage_ws(name), 'manager') );

-- Public bucket: world-readable; writes still member-scoped.
create policy "public read"          on storage.objects for select
  using ( bucket_id = 'public' );
create policy "public staff write"   on storage.objects for insert
  with check ( bucket_id = 'public' and public.has_role(public.storage_ws(name), 'staff') );
create policy "public manager delete" on storage.objects for delete
  using ( bucket_id = 'public' and public.has_role(public.storage_ws(name), 'manager') );
