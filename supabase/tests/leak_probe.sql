-- ═══════════════════════════════════════════════════════════════════════════
-- leak_probe.sql — AiMindShare cross-tenant leak probe (psql, against real DB)
-- Run AFTER migrations + seed on a local/remote Supabase:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/leak_probe.sql
-- Every assertion must hold. One leaked row = FAIL (raises exception).
--
-- Impersonation model matches Supabase: SET ROLE authenticated + set the JWT
-- 'sub' claim; RLS then evaluates auth.uid() as that user.
-- ═══════════════════════════════════════════════════════════════════════════
\set QUIET on
\set ON_ERROR_STOP on

create or replace function pg_temp.assert(cond boolean, label text) returns void
language plpgsql as $$
begin
  if cond then raise notice '  PASS  %', label;
  else raise exception 'LEAK/FAIL: %', label; end if;
end $$;

do $$
declare n int;
begin
  -- ── Impersonate workspace B's staff ────────────────────────────────────────
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);

  -- Cross-tenant READS of workspace A must all be empty
  select count(*) into n from public.workspaces  where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  perform pg_temp.assert(n = 0, 'B cannot SELECT workspace A');

  select count(*) into n from public.memberships where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  perform pg_temp.assert(n = 0, 'B cannot SELECT A''s memberships');

  select count(*) into n from public.jobs        where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  perform pg_temp.assert(n = 0, 'B cannot SELECT A''s jobs');

  -- M05 compliance tables must be invisible to a foreign workspace's staff
  select count(*) into n from public.consent_records   where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  perform pg_temp.assert(n = 0, 'B cannot SELECT A''s consent_records');
  select count(*) into n from public.a2p_registrations where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  perform pg_temp.assert(n = 0, 'B cannot SELECT A''s a2p_registrations');
  select count(*) into n from public.gdpr_requests     where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  perform pg_temp.assert(n = 0, 'B cannot SELECT A''s gdpr_requests');

  -- M09 CRM tables must be invisible to a foreign workspace's staff
  select count(*) into n from public.contacts     where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  perform pg_temp.assert(n = 0, 'B cannot SELECT A''s contacts');
  select count(*) into n from public.companies    where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  perform pg_temp.assert(n = 0, 'B cannot SELECT A''s companies');
  select count(*) into n from public.activity_log where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  perform pg_temp.assert(n = 0, 'B cannot SELECT A''s activity_log');

  -- M06 Media Library tables must be invisible to a foreign workspace's staff
  select count(*) into n from public.media_folders where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  perform pg_temp.assert(n = 0, 'B cannot SELECT A''s media_folders');
  select count(*) into n from public.media_assets  where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  perform pg_temp.assert(n = 0, 'B cannot SELECT A''s media_assets');

  -- Cross-tenant WRITE of A must affect zero rows
  update public.workspaces set name = 'HIJACK' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  get diagnostics n = row_count;
  perform pg_temp.assert(n = 0, 'B cannot UPDATE workspace A');

  -- Positive control: B CAN see its own workspace (RLS is not blanket-deny)
  select count(*) into n from public.workspaces where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  perform pg_temp.assert(n = 1, 'B CAN SELECT its own workspace B');

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- ── Insert guards (separate blocks so RLS violations are caught cleanly) ─────
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
  begin
    insert into public.jobs (workspace_id, type) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','x.y');
    raise exception 'LEAK/FAIL: B inserted a job into workspace A';
  exception when insufficient_privilege or check_violation then
    raise notice '  PASS  B cannot INSERT a job into workspace A';
  end;
  reset role;
end $$;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
  begin
    insert into public.jobs (workspace_id, type, status) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','x.y','running');
    raise exception 'LEAK/FAIL: B inserted a non-queued job (status=running)';
  exception when insufficient_privilege or check_violation then
    raise notice '  PASS  B cannot INSERT a non-queued job (queued-only enforced)';
  end;
  reset role;
end $$;

-- M05 · B cannot write compliance rows into A (append-only ledger + A2P + GDPR)
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
  begin
    insert into public.consent_records (workspace_id, kind, granted)
      values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','sms_optin',false);
    raise exception 'LEAK/FAIL: B inserted a consent record into workspace A';
  exception when insufficient_privilege or check_violation then
    raise notice '  PASS  B cannot INSERT a consent record into workspace A';
  end;
  reset role;
end $$;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
  begin
    insert into public.gdpr_requests (workspace_id, kind, request_type, status)
      values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','gdpr_export','access','pending');
    raise exception 'LEAK/FAIL: B inserted a GDPR request into workspace A';
  exception when insufficient_privilege or check_violation then
    raise notice '  PASS  B cannot INSERT a GDPR request into workspace A';
  end;
  reset role;
end $$;

-- M09 · B cannot write CRM rows into A (contacts)
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
  begin
    insert into public.contacts (workspace_id, first_name)
      values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','HIJACK');
    raise exception 'LEAK/FAIL: B inserted a contact into workspace A';
  exception when insufficient_privilege or check_violation then
    raise notice '  PASS  B cannot INSERT a contact into workspace A';
  end;
  reset role;
end $$;

-- M19 · B cannot write site / visitor rows into A (sites are operator surfaces)
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
  begin
    insert into public.sites (workspace_id, name)
      values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','HIJACK');
    raise exception 'LEAK/FAIL: B inserted a site into workspace A';
  exception when insufficient_privilege or check_violation then
    raise notice '  PASS  B cannot INSERT a site into workspace A';
  end;
  begin
    insert into public.visitor_sessions (workspace_id, site_id, visitor_id)
      values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','19000000-0000-0000-0000-000000000001','hijack');
    raise exception 'LEAK/FAIL: B wrote a visitor_session into workspace A';
  exception when insufficient_privilege or check_violation or foreign_key_violation then
    raise notice '  PASS  B cannot INSERT a visitor_session (service-role only)';
  end;
  reset role;
end $$;

-- M06 · B cannot write media folders / assets into A
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
  begin
    insert into public.media_folders (workspace_id, name)
      values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','HIJACK');
    raise exception 'LEAK/FAIL: B inserted a media_folder into workspace A';
  exception when insufficient_privilege or check_violation then
    raise notice '  PASS  B cannot INSERT a media_folder into workspace A';
  end;
  begin
    insert into public.media_assets (workspace_id, bucket, storage_path)
      values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','media','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/media/hijack.png');
    raise exception 'LEAK/FAIL: B inserted a media_asset into workspace A';
  exception when insufficient_privilege or check_violation then
    raise notice '  PASS  B cannot INSERT a media_asset into workspace A';
  end;
  reset role;
end $$;

-- M22 · B cannot write articles / categories / authors into A
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
  begin
    insert into public.blog_articles (workspace_id, site_id, title, slug)
      values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','19000000-0000-0000-0000-000000000001','HIJACK','hijack');
    raise exception 'LEAK/FAIL: B inserted a blog_article into workspace A';
  exception when insufficient_privilege or check_violation then
    raise notice '  PASS  B cannot INSERT a blog_article into workspace A';
  end;
  begin
    insert into public.article_categories (workspace_id, site_id, name, slug)
      values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','19000000-0000-0000-0000-000000000001','HIJACK','hijack');
    raise exception 'LEAK/FAIL: B inserted an article_category into workspace A';
  exception when insufficient_privilege or check_violation then
    raise notice '  PASS  B cannot INSERT an article_category into workspace A';
  end;
  begin
    insert into public.article_authors (workspace_id, name)
      values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','HIJACK');
    raise exception 'LEAK/FAIL: B inserted an article_author into workspace A';
  exception when insufficient_privilege or check_violation then
    raise notice '  PASS  B cannot INSERT an article_author into workspace A';
  end;
  reset role;
end $$;

do $$ begin raise notice 'LEAK PROBE: ALL ASSERTIONS PASSED'; end $$;
