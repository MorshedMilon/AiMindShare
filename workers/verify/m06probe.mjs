// m06probe.mjs — verify the M06 Media Library slice on REAL Postgres (PGlite, no
// Docker). Proves: (1) media_folders/media_assets RLS-on + cross-tenant leak,
// (2) the role matrix mirrors the 0004 bucket posture (media=staff write/manager
// delete, brand=admin, client ceiling), (3) register_media_asset() records the
// index row + enqueues exactly one media.autotag job for images (skipped for
// non-images) + rejects a foreign-workspace path, (4) used_in register/dedup/
// unregister, (5) backfill_asset_usage() populates used_in from deal_files
// (idempotent), (6) recompute_storage_meter() is a GAUGE (re-run overwrites,
// not adds), (7) soft-delete hides an asset from the browse policy.
//
// Loads 0000,0001,0002,0003,0010_m05,0013_m09,0014_m11 (for real deal_files),
// then 0021_m06 into PGlite and exercises RLS for real.
//
//   node workers/verify/m06probe.mjs        (after `npm install`)
//
// Exit 0 = all assertions passed; 1 = a failure/leak was detected.
//
// NOT here (carried live, never faked — absent in PGlite): the real Storage
// upload/signed-URL/transform round-trip, the media-autotag Edge Fn vision call
// (provider-deferred scaffold), and the live pg_cron nightly schedule (the
// recompute BODY is asserted directly here).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const OWNER_A   = "11111111-1111-1111-1111-111111111111";
const ADMIN_A   = "22222222-2222-2222-2222-222222222222";
const MANAGER_A = "33333333-3333-3333-3333-333333333333";
const STAFF_A   = "44444444-4444-4444-4444-444444444444";
const CLIENT_A  = "55555555-5555-5555-5555-555555555555";
const OWNER_B   = "66666666-6666-6666-6666-666666666666";
const STAFF_B   = "77777777-7777-7777-7777-777777777777";

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

// pg_trgm is absent in PGlite; strip `create extension` AND the gin_trgm_ops
// index lines from dependency migrations (pure perf indexes — same as m09/m11).
const load = (n) => readFileSync(join(MIG, n), "utf8")
  .split("\n")
  .filter((l) => !/^\s*create\s+extension/i.test(l))
  .filter((l) => !/gin_trgm_ops/i.test(l))
  .join("\n");

const count = async (pg, sql, params) => Number((await pg.query(sql, params)).rows[0].n);
async function denied(pg, sql, params) { try { await pg.query(sql, params); return false; } catch { return true; } }

async function main() {
  const pg = new PGlite();

  // ── Harness: auth schema + uid() stub + roles + cron.schedule no-op ──────────
  await pg.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role authenticated nologin;
    create role service_role nologin;
    grant usage on schema public to authenticated;
    create schema if not exists cron;
    create or replace function cron.schedule(text, text, text) returns bigint
      language sql as $$ select 0::bigint $$;
  `);

  // Dependency order: tenancy/jobs/meters, M05 (consent FK for M09), M09, M11
  // (real deal_files for the backfill), then this module.
  for (const m of [
    "0000_extensions_enums.sql", "0001_tenancy.sql", "0002_jobs.sql", "0003_meters_plans.sql",
    "0010_m05_compliance.sql", "0013_m09_crm.sql", "0014_m11_pipeline.sql",
    "0021_m06_media.sql",
  ]) {
    await pg.exec(load(m));
  }
  await pg.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;`);

  // ── Caller switching (session-local) ─────────────────────────────────────────
  const as = (sub) => pg.exec(
    `set role authenticated;` +
    `select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);

  // ── Setup: two workspaces + members at every role ────────────────────────────
  await reset();
  for (const [id, u] of [[OWNER_A,"owner.a"],[ADMIN_A,"admin.a"],[MANAGER_A,"manager.a"],
                         [STAFF_A,"staff.a"],[CLIENT_A,"client.a"],[OWNER_B,"owner.b"],[STAFF_B,"staff.b"]]) {
    await pg.query(`insert into auth.users (id,email) values ($1,$2) on conflict do nothing`, [id, `${u}@aimindshare.test`]);
    await pg.query(`insert into public.profiles (id,email,name) values ($1,$2,$3) on conflict do nothing`, [id, `${u}@aimindshare.test`, u]);
  }
  const wsA = (await pg.query(`insert into public.workspaces (owner_id,name,slug) values ($1,'Acme Agency','acme') returning id`, [OWNER_A])).rows[0].id;
  const wsB = (await pg.query(`insert into public.workspaces (owner_id,name,slug) values ($1,'Bravo Agency','bravo') returning id`, [OWNER_B])).rows[0].id;
  await pg.query(`insert into public.memberships (workspace_id,user_id,role,status) values
      ($1,$2,'owner','active'),($1,$3,'admin','active'),($1,$4,'manager','active'),($1,$5,'staff','active'),($1,$6,'client','active')`,
      [wsA, OWNER_A, ADMIN_A, MANAGER_A, STAFF_A, CLIENT_A]);
  await pg.query(`insert into public.memberships (workspace_id,user_id,role,status) values
      ($1,$2,'owner','active'),($1,$3,'staff','active')`, [wsB, OWNER_B, STAFF_B]);

  // ═══ 1 — schema + RLS posture ══════════════════════════════════════════════
  console.log("\nM06 · schema + RLS posture:");
  assert(await count(pg, `select count(*)::int n from pg_tables where tablename='media_folders' and rowsecurity`) === 1, "media_folders RLS on");
  assert(await count(pg, `select count(*)::int n from pg_tables where tablename='media_assets' and rowsecurity`) === 1, "media_assets RLS on");
  assert(await count(pg, `select count(*)::int n from pg_policies where tablename='media_assets'`) === 4, "media_assets has 4 policies (sel/ins/upd/del)");
  assert(await count(pg, `select count(*)::int n from pg_proc where proname='register_media_asset'`) === 1, "register_media_asset() present");

  // ═══ 2 — cross-tenant leak ═════════════════════════════════════════════════
  console.log("\nM06 · cross-tenant leak (B cannot touch A):");
  // seed one visible asset in A (as superuser, bypass RLS)
  await reset();
  const aAsset = (await pg.query(
    `insert into public.media_assets (workspace_id,bucket,storage_path,filename,mime,kind,bytes)
     values ('${wsA}','media','${wsA}/logo.png','logo.png','image/png','image',2048) returning id`)).rows[0].id;
  await as(STAFF_B);
  assert(await count(pg, `select count(*)::int n from public.media_assets where workspace_id='${wsA}'`) === 0, "B cannot SELECT A's assets");
  assert(await denied(pg, `insert into public.media_folders (workspace_id,name) values ('${wsA}','HIJACK')`), "B cannot INSERT a folder into A");
  assert((await pg.query(`update public.media_assets set filename='HIJACK' where workspace_id='${wsA}'`)).affectedRows === 0, "B cannot UPDATE A's asset");

  // ═══ 3 — role matrix (mirrors 0004 bucket posture) ═════════════════════════
  console.log("\nM06 · role matrix:");
  await as(STAFF_A);
  const sFolder = (await pg.query(`insert into public.media_folders (workspace_id,name) values ('${wsA}','Uploads') returning id`)).rows[0].id;
  assert(!!sFolder, "staff CAN create a media folder");
  assert(await denied(pg, `insert into public.media_folders (workspace_id,name,bucket) values ('${wsA}','Brand','brand')`), "staff CANNOT create a brand folder (admin only)");
  assert(await denied(pg, `insert into public.media_assets (workspace_id,bucket,storage_path,filename) values ('${wsA}','brand','${wsA}/b.png','b.png')`), "staff CANNOT write a brand asset (admin only)");
  await as(ADMIN_A);
  assert(!!(await pg.query(`insert into public.media_folders (workspace_id,name,bucket,kind,pinned) values ('${wsA}','Logos','brand','collection',true) returning id`)).rows[0].id, "admin CAN create a brand collection");
  await as(CLIENT_A);
  assert(await denied(pg, `insert into public.media_assets (workspace_id,bucket,storage_path,filename) values ('${wsA}','media','${wsA}/c.png','c.png')`), "client CANNOT write an asset (write ceiling)");
  // media delete = manager+
  await as(STAFF_A);
  assert((await pg.query(`delete from public.media_assets where id='${aAsset}'`)).affectedRows === 0, "staff CANNOT delete a media asset (manager+)");
  await as(MANAGER_A);
  assert((await pg.query(`delete from public.media_assets where id='${aAsset}'`)).affectedRows === 1, "manager CAN delete a media asset");

  // ═══ 4 — register_media_asset (the /complete step) ═════════════════════════
  console.log("\nM06 · register_media_asset:");
  await as(STAFF_A);
  const img = (await pg.query(`select (public.register_media_asset('media','${wsA}/u/pic.png',null,'pic.png','image/png',5000,null,800,600,null)).id as id`)).rows[0].id;
  assert(!!img, "staff registers an image asset");
  assert(await count(pg, `select count(*)::int n from public.media_assets where id='${img}' and tag_status='pending' and kind='image'`) === 1, "image → tag_status='pending', kind derived");
  assert(await count(pg, `select count(*)::int n from public.jobs where type='media.autotag' and payload->>'asset_id'='${img}' and status='queued'`) === 1, "image → exactly one queued media.autotag job");
  const doc = (await pg.query(`select (public.register_media_asset('media','${wsA}/u/spec.pdf',null,'spec.pdf','application/pdf',9000,null,null,null,null)).id as id`)).rows[0].id;
  assert(await count(pg, `select count(*)::int n from public.media_assets where id='${doc}' and tag_status='skipped' and kind='pdf'`) === 1, "non-image → tag_status='skipped'");
  assert(await count(pg, `select count(*)::int n from public.jobs where type='media.autotag' and payload->>'asset_id'='${doc}'`) === 0, "non-image → no autotag job");
  assert(await denied(pg, `select public.register_media_asset('media','${wsB}/u/x.png',null,'x.png','image/png',10,null,null,null,null)`), "foreign-workspace path rejected (not a member of B)");
  assert(await denied(pg, `select public.register_media_asset('brand','${wsA}/u/x.png',null,'x.png','image/png',10,null,null,null,null)`), "staff cannot register into the brand bucket (admin only)");

  // ═══ 5 — used_in register / dedup / unregister ═════════════════════════════
  console.log("\nM06 · used_in tracking:");
  await as(STAFF_A);
  await pg.exec(`select public.register_asset_usage('${img}','sites','page-123')`);
  await pg.exec(`select public.register_asset_usage('${img}','sites','page-123')`);   // dedup
  assert(await count(pg, `select jsonb_array_length(used_in)::int n from public.media_assets where id='${img}'`) === 1, "register_asset_usage appends + dedups (1 entry)");
  await pg.exec(`select public.register_asset_usage('${img}','content','post-9')`);
  assert(await count(pg, `select jsonb_array_length(used_in)::int n from public.media_assets where id='${img}'`) === 2, "second distinct usage appended (2 entries)");
  await pg.exec(`select public.unregister_asset_usage('${img}','sites','page-123')`);
  assert(await count(pg, `select jsonb_array_length(used_in)::int n from public.media_assets where id='${img}'`) === 1, "unregister removes the entry (1 left)");

  // ═══ 6 — backfill_asset_usage from deal_files ══════════════════════════════
  console.log("\nM06 · backfill from deal_files:");
  await reset();
  const pipe = (await pg.query(`insert into public.pipelines (workspace_id,name) values ($1,'Sales') returning id`, [wsA])).rows[0].id;
  const deal = (await pg.query(`insert into public.deals (workspace_id,pipeline_id,title,value,status) values ($1,$2,'Big deal',1000,'open') returning id`, [wsA, pipe])).rows[0].id;
  const bfAsset = (await pg.query(`insert into public.media_assets (workspace_id,bucket,storage_path,filename,mime,kind,bytes) values ('${wsA}','media','${wsA}/contract.pdf','contract.pdf','application/pdf','pdf',3000) returning id`)).rows[0].id;
  await pg.query(`insert into public.deal_files (workspace_id,deal_id,asset_id,file_name) values ($1,$2,$3,'contract.pdf')`, [wsA, deal, bfAsset]);
  const n1 = Number((await pg.query(`select public.backfill_asset_usage() n`)).rows[0].n);
  assert(n1 === 1, "backfill updates the linked asset (1 row)");
  assert(await count(pg, `select count(*)::int n from public.media_assets where id='${bfAsset}' and used_in @> jsonb_build_array(jsonb_build_object('module','pipeline','ref_id','${deal}'))`) === 1, "used_in now carries {pipeline, deal_id}");
  const n2 = Number((await pg.query(`select public.backfill_asset_usage() n`)).rows[0].n);
  assert(n2 === 0, "backfill is idempotent (0 rows on re-run)");

  // ═══ 7 — recompute_storage_meter is a GAUGE ════════════════════════════════
  console.log("\nM06 · storage meter (gauge, not counter):");
  await reset();
  // add a multi-GB asset so the GB value clears usage_meters' numeric(14,4) scale
  await pg.exec(`insert into public.media_assets (workspace_id,bucket,storage_path,filename,bytes) values ('${wsA}','media','${wsA}/big.zip','big.zip',5368709120)`); // 5 GiB
  const g1 = Number((await pg.query(`select public.recompute_storage_meter('${wsA}') g`)).rows[0].g);
  const q1 = Number((await pg.query(`select quantity n from public.usage_meters where workspace_id='${wsA}' and kind='storage_gb' and period=date_trunc('month',now())::date`)).rows[0].n);
  assert(q1 > 4.9 && Math.abs(g1 - q1) < 0.001, "recompute writes storage_gb = Σbytes/GB (gauge value)");
  await pg.exec(`select public.recompute_storage_meter('${wsA}')`);
  const stored = Number((await pg.query(`select quantity n from public.usage_meters where workspace_id='${wsA}' and kind='storage_gb' and period=date_trunc('month',now())::date`)).rows[0].n);
  assert(Math.abs(stored - q1) < 1e-9, "re-run OVERWRITES (gauge) — not doubled");

  // ═══ 8 — soft delete (manager+, via RPC) hides from the browse policy ══════
  console.log("\nM06 · soft delete:");
  await as(STAFF_A);
  assert(await denied(pg, `select public.soft_delete_asset('${doc}')`), "staff CANNOT soft-delete (manager+)");
  await as(MANAGER_A);
  await pg.exec(`select public.soft_delete_asset('${doc}')`);
  assert(await count(pg, `select count(*)::int n from public.media_assets where id='${doc}'`) === 0, "soft-deleted asset disappears from the browse SELECT");
  await reset();
  assert(await count(pg, `select count(*)::int n from public.media_assets where id='${doc}' and deleted_at is not null`) === 1, "row still exists (soft delete, recoverable)");

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M06 probe: ${pass} passed, ${fail} failed\x1b[0m`);
  await pg.close();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
