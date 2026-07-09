// m19probe.mjs — verify the M19 Sites SQL layer on REAL Postgres (PGlite).
// Proves the DoD gates checkable without a live stack:
//   Gate-1 tenancy — B cannot select/insert/update A's sites/pages/domains/etc.
//   Gate-2 roles   — sites/pages: staff+ read+edit, manager+ publish+delete;
//                    site_domains: admin+ write; page_versions/visitor_sessions
//                    system-written (no client INSERT — Gate-4); client CEILING.
//   Publish        — publish_page snapshots a page_versions row, flips status +
//                    published_at, publishes the site, prunes to the last 10;
//                    revert_page restores a version; duplicate_page copies (staff+).
//   Renderer       — the published-resolution query returns only status='published'
//                    pages (a draft slug is invisible to the public renderer).
//   Tracking       — visitor_sessions is service-role-write only; record_page_visit
//                    for an identified contact writes the M09 timeline + fires the
//                    M13 bus emit_trigger('page.visited') (enrols a workflow).
//   Templates      — global (workspace_id null) site_templates are readable by any
//                    authed user; a tenant cannot write a global template.
//
//   node workers/verify/m19probe.mjs
//
// Exit 0 = all passed; 1 = a failure/leak. Depends on M05/M09/M11/M12/M13 migrations.
// extensions/pg_trgm stripped like m14probe. cron/realtime guarded in the migration.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const OWNER_A = "11111111-1111-1111-1111-111111111111";
const MANAGER_A = "55555555-5555-5555-5555-555555555555";
const STAFF_A = "66666666-6666-6666-6666-666666666666";
const ADMIN_A = "22222222-2222-2222-2222-222222222222";
const CLIENT_A = "77777777-7777-7777-7777-777777777777";
const OWNER_B = "33333333-3333-3333-3333-333333333333";
const STAFF_B = "44444444-4444-4444-4444-444444444444";

const WSA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WSB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CONTACT_A = "d1111111-1111-1111-1111-111111111111";

const SITE_A = "51000000-0000-0000-0000-000000000001";
const SITE_B = "51000000-0000-0000-0000-000000000002";
const PAGE_A = "52000000-0000-0000-0000-000000000001";  // published home
const PAGE_DRAFT = "52000000-0000-0000-0000-000000000002";  // draft

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

const load = (n) => readFileSync(join(MIG, n), "utf8").split("\n")
  .filter((l) => !/^\s*create\s+extension/i.test(l))
  .filter((l) => !/gin_trgm_ops/i.test(l))
  .join("\n");

const count = async (pg, sql, params) => Number((await pg.query(sql, params)).rows[0].n);
async function denied(pg, sql, params) { try { await pg.query(sql, params); return false; } catch { return true; } }

async function main() {
  const pg = new PGlite();
  await pg.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role authenticated nologin; create role service_role nologin;
    grant usage on schema public to authenticated;
  `);
  for (const m of ["0000_extensions_enums.sql", "0001_tenancy.sql", "0002_jobs.sql",
                   "0010_m05_compliance.sql", "0013_m09_crm.sql", "0014_m11_pipeline.sql",
                   "0015_m12_inbox.sql", "0016_m13_automations.sql", "0022_m19_sites.sql"]) {
    await pg.exec(load(m));
  }
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);

  // ── Seed two agencies ────────────────────────────────────────────────────────
  await pg.exec(`
    insert into auth.users (id,email) values
      ('${OWNER_A}','oa@t'),('${MANAGER_A}','ma@t'),('${STAFF_A}','sa@t'),('${ADMIN_A}','ada@t'),('${CLIENT_A}','ca@t'),
      ('${OWNER_B}','ob@t'),('${STAFF_B}','sb@t');
    insert into public.profiles (id,email,name) values
      ('${OWNER_A}','oa@t','OA'),('${MANAGER_A}','ma@t','MA'),('${STAFF_A}','sa@t','SA'),('${ADMIN_A}','ada@t','AD'),('${CLIENT_A}','ca@t','CA'),
      ('${OWNER_B}','ob@t','OB'),('${STAFF_B}','sb@t','SB');
    insert into public.workspaces (id,owner_id,name,slug) values
      ('${WSA}','${OWNER_A}','Acme','acme'),('${WSB}','${OWNER_B}','Beacon','beacon');
    insert into public.memberships (workspace_id,user_id,role,status) values
      ('${WSA}','${OWNER_A}','owner','active'),('${WSA}','${MANAGER_A}','manager','active'),
      ('${WSA}','${STAFF_A}','staff','active'),('${WSA}','${ADMIN_A}','admin','active'),('${WSA}','${CLIENT_A}','client','active'),
      ('${WSB}','${OWNER_B}','owner','active'),('${WSB}','${STAFF_B}','staff','active');
    insert into public.contacts (id,workspace_id,first_name,source) values
      ('${CONTACT_A}','${WSA}','Yusuf','manual');
    -- sites + pages (service-role / superuser context)
    insert into public.sites (id,workspace_id,name,subdomain,status) values
      ('${SITE_A}','${WSA}','Acme Site','acme','draft'),
      ('${SITE_B}','${WSB}','Beacon Site','beacon','draft');
    insert into public.pages (id,workspace_id,site_id,title,slug,is_home,status,render_html) values
      ('${PAGE_A}','${WSA}','${SITE_A}','Home','home',true,'published','<h1>Home</h1>'),
      ('${PAGE_DRAFT}','${WSA}','${SITE_A}','About','about',false,'draft','<h1>About</h1>');
    -- one global template + one active workflow listening for page.visited
    insert into public.site_templates (workspace_id,name,niche,page_json) values
      (null,'Agency Starter','agency','{}');
    insert into public.workflows (workspace_id,name,trigger_type,is_active,reentry_rule,nodes,edges)
      values ('${WSA}','On visit','page.visited',true,'allow','[]','[]');
  `);

  const as = (sub) => pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);

  // ── 1. Tables + RLS forced ────────────────────────────────────────────────────
  console.log("\nM19 · schema — 6 tables exist with RLS forced:");
  const tables = ['sites','pages','page_versions','site_domains','site_templates','visitor_sessions'];
  for (const t of tables) {
    const r = await pg.query(`select to_regclass('public.${t}') as t, relrowsecurity
      from pg_class where relname=$1`, [t]);
    assert(r.rows[0]?.t && r.rows[0]?.relrowsecurity, `table ${t} exists + RLS enabled`);
  }

  // ── 2. Cross-tenant isolation (Gate-1) ────────────────────────────────────────
  console.log("\nM19 · cross-tenant isolation (agency B staff attacking agency A):");
  await as(STAFF_B);
  assert(await count(pg, `select count(*)::int n from public.sites where workspace_id=$1`, [WSA]) === 0,
    "B cannot SELECT A's sites");
  assert(await count(pg, `select count(*)::int n from public.pages where workspace_id=$1`, [WSA]) === 0,
    "B cannot SELECT A's pages");
  assert(await denied(pg, `insert into public.sites (workspace_id,name) values ($1,'HIJACK')`, [WSA]),
    "B cannot INSERT a site into A");
  assert(await denied(pg, `insert into public.pages (workspace_id,site_id,title,slug) values ($1,$2,'x','x')`, [WSA, SITE_A]),
    "B cannot INSERT a page into A");
  assert((await pg.query(`update public.sites set name='HIJACK' where workspace_id=$1`, [WSA])).affectedRows === 0,
    "B cannot UPDATE A's sites (0 rows)");
  assert(await count(pg, `select count(*)::int n from public.visitor_sessions where workspace_id=$1`, [WSA]) === 0,
    "B cannot SELECT A's visitor_sessions");

  // ── 3. Role matrix (Gate-2) ───────────────────────────────────────────────────
  console.log("\nM19 · roles — staff+ edit · manager+ publish/delete · admin+ domains · client ceiling:");
  await reset(); await as(STAFF_A);
  assert(await count(pg, `select count(*)::int n from public.sites where workspace_id=$1`, [WSA]) >= 1,
    "staff CAN read sites");
  const staffSite = await pg.query(`insert into public.sites (workspace_id,name) values ($1,'Staff Site') returning id`, [WSA]);
  assert(!!staffSite.rows[0]?.id, "staff CAN create a site");
  const staffPage = await pg.query(`insert into public.pages (workspace_id,site_id,title,slug) values ($1,$2,'P','p') returning id`, [WSA, SITE_A]);
  assert(!!staffPage.rows[0]?.id, "staff CAN create a page");
  assert(await denied(pg, `select public.publish_page($1)`, [PAGE_A]),
    "staff CANNOT publish_page (manager+)");
  assert((await pg.query(`delete from public.pages where id=$1`, [staffPage.rows[0].id])).affectedRows === 0
      || await denied(pg, `delete from public.pages where id=$1`, [staffPage.rows[0].id]),
    "staff CANNOT delete a page (manager+)");
  assert(await denied(pg, `insert into public.site_domains (workspace_id,site_id,domain) values ($1,$2,'x.com')`, [WSA, SITE_A]),
    "staff CANNOT add a custom domain (admin+)");
  assert(await denied(pg, `insert into public.page_versions (workspace_id,page_id,version_no) values ($1,$2,99)`, [WSA, PAGE_A]),
    "staff CANNOT insert a page_version directly (system-written — Gate-4)");
  assert(await denied(pg, `insert into public.visitor_sessions (workspace_id,site_id,visitor_id) values ($1,$2,'v1')`, [WSA, SITE_A]),
    "staff CANNOT insert a visitor_session (service-role only — Gate-4)");

  await reset(); await as(CLIENT_A);
  assert(await count(pg, `select count(*)::int n from public.sites where workspace_id=$1`, [WSA]) === 0,
    "client CANNOT read sites (operator ceiling)");

  await reset(); await as(ADMIN_A);
  const dom = await pg.query(`insert into public.site_domains (workspace_id,site_id,domain) values ($1,$2,'acme.com') returning id, verification_token`, [WSA, SITE_A]);
  assert(!!dom.rows[0]?.id && !!dom.rows[0]?.verification_token, "admin CAN add a custom domain (+ verification token generated)");

  // ── 4. publish_page / revert_page / duplicate_page ────────────────────────────
  console.log("\nM19 · publish — snapshot + status flip + prune-to-10 + revert + duplicate:");
  await reset(); await as(MANAGER_A);
  const v1 = Number((await pg.query(`select public.publish_page($1) as v`, [PAGE_A])).rows[0].v);
  assert(v1 === 1, "manager publish → version_no 1");
  const pubRow = (await pg.query(`select status, published_at from public.pages where id=$1`, [PAGE_A])).rows[0];
  assert(pubRow.status === 'published' && !!pubRow.published_at, "page flipped to published + published_at set");
  assert((await pg.query(`select status from public.sites where id=$1`, [SITE_A])).rows[0].status === 'published',
    "site flipped draft → published on first publish");
  const v2 = Number((await pg.query(`select public.publish_page($1) as v`, [PAGE_A])).rows[0].v);
  assert(v2 === 2, "second publish → version_no 2");
  // publish 9 more (total 11 versions) → prune keeps the last 10
  for (let i = 0; i < 9; i++) await pg.query(`select public.publish_page($1)`, [PAGE_A]);
  const vers = (await pg.query(`select version_no from public.page_versions where page_id=$1 order by version_no`, [PAGE_A])).rows.map(r => Number(r.version_no));
  assert(vers.length === 10, `pruned to the last 10 versions (got ${vers.length})`);
  assert(vers[0] === 2 && vers[9] === 11, `oldest kept = v2, newest = v11 (got ${vers[0]}..${vers[9]})`);
  // revert to v2 → page content becomes a draft again
  await pg.query(`select public.revert_page($1,$2)`, [PAGE_A, 2]);
  assert((await pg.query(`select status from public.pages where id=$1`, [PAGE_A])).rows[0].status === 'draft',
    "revert_page restores a version as a draft");
  // duplicate (staff+) — manager qualifies
  const dup = await pg.query(`select public.duplicate_page($1) as id`, [PAGE_A]);
  assert(!!dup.rows[0]?.id, "duplicate_page returns a new page id");
  assert(await count(pg, `select count(*)::int n from public.pages where site_id=$1 and slug like 'home-copy-%'`, [SITE_A]) === 1,
    "duplicate_page copies within the site with a unique slug");

  // ── 5. Public renderer contract — only published pages resolve ────────────────
  console.log("\nM19 · renderer — the published-resolution query hides drafts:");
  await reset();  // service-role context (the renderer)
  const published = await count(pg, `select count(*)::int n from public.pages where site_id=$1 and slug='about' and status='published'`, [SITE_A]);
  assert(published === 0, "a DRAFT slug ('about') is NOT returned by the published query");
  // re-publish home (it was reverted to draft) then check it resolves
  await pg.query(`update public.pages set status='published' where id=$1`, [PAGE_A]);
  const home = await count(pg, `select count(*)::int n from public.pages where site_id=$1 and slug='home' and status='published'`, [SITE_A]);
  assert(home === 1, "a PUBLISHED slug ('home') IS returned by the published query");

  // ── 6. Tracking — service-role write + identified-visitor CRM wiring ──────────
  console.log("\nM19 · tracking — visitor_sessions service-role write + page.visited bus:");
  await reset();
  await pg.exec(`insert into public.visitor_sessions (workspace_id,site_id,visitor_id,contact_id)
    values ('${WSA}','${SITE_A}','vis-1','${CONTACT_A}');`);
  assert(await count(pg, `select count(*)::int n from public.visitor_sessions where site_id=$1`, [SITE_A]) === 1,
    "service-role CAN write a visitor_session");
  const actBefore = await count(pg, `select count(*)::int n from public.activity_log where contact_id=$1 and type='page_visit'`, [CONTACT_A]);
  const execBefore = await count(pg, `select count(*)::int n from public.workflow_executions where workspace_id=$1`, [WSA]);
  await pg.query(`select public.record_page_visit($1,$2,$3,$4)`, [WSA, SITE_A, CONTACT_A, 'home']);
  assert(await count(pg, `select count(*)::int n from public.activity_log where contact_id=$1 and type='page_visit'`, [CONTACT_A]) === actBefore + 1,
    "record_page_visit writes the M09 timeline (page_visit)");
  assert(await count(pg, `select count(*)::int n from public.workflow_executions where workspace_id=$1`, [WSA]) === execBefore + 1,
    "record_page_visit fires the M13 bus (page.visited enrols the workflow)");

  // ── 7. Templates — global read + no tenant global write ───────────────────────
  console.log("\nM19 · templates — global gallery read + no tenant global write:");
  await reset(); await as(STAFF_B);
  assert(await count(pg, `select count(*)::int n from public.site_templates where workspace_id is null`, []) >= 1,
    "any authed user can read GLOBAL site_templates");
  assert(await denied(pg, `insert into public.site_templates (workspace_id,name) values (null,'Rogue Global')`, []),
    "a tenant CANNOT write a global (workspace_id null) template");

  console.log(`\nM19 probe: ${pass} passed, ${fail} failed.\n`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
