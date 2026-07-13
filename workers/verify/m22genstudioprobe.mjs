// m22genstudioprobe.mjs — verify the M22 Generation Studio pipeline schema,
// RPCs, and worker dispatch logic on REAL Postgres (PGlite, no Docker).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const OWNER_A   = "11111111-1111-1111-1111-111111111111";
const MANAGER_A = "33333333-3333-3333-3333-333333333333";
const STAFF_A   = "44444444-4444-4444-4444-444444444444";
const CLIENT_A  = "55555555-5555-5555-5555-555555555555";
const OWNER_B   = "66666666-6666-6666-6666-666666666666";
const STAFF_B   = "77777777-7777-7777-7777-777777777777";

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

const load = (n) => readFileSync(join(MIG, n), "utf8")
  .split("\n")
  .filter((l) => !/^\s*create\s+extension/i.test(l))
  .filter((l) => !/gin_trgm_ops/i.test(l))
  .filter((l) => !/vector\(1536\)/i.test(l))
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

  for (const m of [
    "0000_extensions_enums.sql", "0001_tenancy.sql", "0002_jobs.sql",
    "0010_m05_compliance.sql", "0013_m09_crm.sql", "0014_m11_pipeline.sql",
    "0015_m12_inbox.sql", "0016_m13_automations.sql", "0022_m19_sites.sql",
    "0025_m22_content.sql", "0026_m21_seo.sql", "0027_m22_auto.sql",
    "0039_m22_bulk.sql", "0040_m22_generation_studio.sql",
  ]) {
    await pg.exec(load(m));
  }
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);
  for (const f of ["start_generation_run(uuid,uuid,uuid)", "retry_generation_stage(uuid)"]) {
    await pg.exec(`revoke execute on function public.${f} from authenticated;`).catch(() => {});
  }
  // start_generation_run / retry_generation_stage are staff+ RPCs (role-checked
  // inside the function body, like enqueue_content_generation) — re-grant so the
  // in-function has_role() check is what's actually exercised, not a bare revoke.
  // Task 1 note: these RPCs don't exist until Tasks 2/3, so the grant would
  // throw "function ... does not exist" (42883) on a schema-only migration —
  // guarded the same way the revoke loop above is, so Task 1's probe run
  // no-ops harmlessly here and still reaches the 5 schema/RLS assertions below.
  await pg.exec(`grant execute on function public.start_generation_run(uuid,uuid,uuid) to authenticated;`).catch(() => {});
  await pg.exec(`grant execute on function public.retry_generation_stage(uuid) to authenticated;`).catch(() => {});

  const as = (sub) => pg.exec(
    `set role authenticated;` +
    `select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);

  // ── Setup: two workspaces + members + a site + a keyword each ───────────────
  await reset();
  for (const [id, u] of [[OWNER_A,"owner.a"],[MANAGER_A,"manager.a"],[STAFF_A,"staff.a"],
                         [CLIENT_A,"client.a"],[OWNER_B,"owner.b"],[STAFF_B,"staff.b"]]) {
    await pg.query(`insert into auth.users (id,email) values ($1,$2) on conflict do nothing`, [id, `${u}@aimindshare.test`]);
    await pg.query(`insert into public.profiles (id,email,name) values ($1,$2,$3) on conflict do nothing`, [id, `${u}@aimindshare.test`, u]);
  }
  const wsA = (await pg.query(`insert into public.workspaces (owner_id,name,slug) values ($1,'Acme','acme') returning id`, [OWNER_A])).rows[0].id;
  const wsB = (await pg.query(`insert into public.workspaces (owner_id,name,slug) values ($1,'Bravo','bravo') returning id`, [OWNER_B])).rows[0].id;
  await pg.query(`insert into public.memberships (workspace_id,user_id,role,status) values
      ($1,$2,'owner','active'),($1,$3,'manager','active'),($1,$4,'staff','active'),($1,$5,'client','active')`,
      [wsA, OWNER_A, MANAGER_A, STAFF_A, CLIENT_A]);
  await pg.query(`insert into public.memberships (workspace_id,user_id,role,status) values
      ($1,$2,'owner','active'),($1,$3,'staff','active')`, [wsB, OWNER_B, STAFF_B]);
  const siteA = (await pg.query(`insert into public.sites (workspace_id,name,subdomain,status) values ($1,'Acme Blog','acme','published') returning id`, [wsA])).rows[0].id;
  const kwA = (await pg.query(`insert into public.keywords (workspace_id,keyword,volume,difficulty,intent) values ($1,'best dua for travel',500,20,'informational') returning id`, [wsA])).rows[0].id;

  // ═══ 1 — schema + RLS posture ══════════════════════════════════════════════
  console.log("\nM22 Generation Studio · schema + RLS posture:");
  assert(await count(pg, `select count(*)::int n from information_schema.columns where table_name='content_queue' and column_name='keyword_id'`) === 1,
    "content_queue has keyword_id");
  assert(await count(pg, `select count(*)::int n from information_schema.columns where table_name='blog_articles' and column_name='used_fallback'`) === 1,
    "blog_articles has used_fallback");
  assert(await count(pg, `select count(*)::int n from pg_tables where tablename='generation_jobs' and rowsecurity`) === 1,
    "generation_jobs RLS on");
  assert(await count(pg, `select count(*)::int n from pg_tables where tablename='content_scores' and rowsecurity`) === 1,
    "content_scores RLS on");
  assert(await count(pg, `select count(*)::int n from pg_indexes where indexname='generation_jobs_one_pending_per_stage'`) === 1,
    "generation_jobs has the one-pending-per-stage partial unique index");

  // ═══ 2 — start_generation_run ═══════════════════════════════════════════════
  console.log("\nM22 Generation Studio · start_generation_run:");
  await as(STAFF_A);
  const run1 = (await pg.query(
    `select * from public.start_generation_run($1,$2,$3)`, [wsA, siteA, kwA]
  )).rows[0];
  assert(!!run1.article_id, "start_generation_run returns an article_id");
  assert(!!run1.generation_job_id, "start_generation_run returns the first generation_job_id");
  await reset();

  assert(await count(pg, `select count(*)::int n from public.blog_articles where id=$1 and status='draft'`, [run1.article_id]) === 1,
    "the stub article is created with status='draft'");
  assert(await count(pg, `select count(*)::int n from public.content_queue where article_id=$1 and keyword_id=$2`, [run1.article_id, kwA]) === 1,
    "content_queue row carries both article_id and keyword_id");
  assert(await count(pg, `select count(*)::int n from public.generation_jobs where id=$1 and stage='research' and status='pending'`, [run1.generation_job_id]) === 1,
    "the first generation_jobs row is stage='research', status='pending'");
  assert(await count(pg, `select count(*)::int n from public.jobs where type='generation.advance' and payload->>'generation_job_id'=$1::text`, [run1.generation_job_id]) === 1,
    "a matching jobs row (type='generation.advance') is enqueued");

  await as(CLIENT_A);
  assert(await denied(pg, `select * from public.start_generation_run($1,$2,$3)`, [wsA, siteA, kwA]),
    "client role cannot call start_generation_run");
  await reset();

  // ═══ 3 — retry_generation_stage ═════════════════════════════════════════════
  console.log("\nM22 Generation Studio · retry_generation_stage:");
  // Simulate the research stage having failed (as the worker would mark it).
  await pg.query(`update public.generation_jobs set status='failed', error='boom', error_type='transient' where id=$1`, [run1.generation_job_id]);

  await as(STAFF_A);
  const retried = (await pg.query(`select public.retry_generation_stage($1) as id`, [run1.generation_job_id])).rows[0].id;
  await reset();
  assert(!!retried && retried !== run1.generation_job_id, "retry_generation_stage returns a NEW generation_jobs id");
  assert(await count(pg, `select count(*)::int n from public.generation_jobs where id=$1 and status='pending' and stage='research'`, [retried]) === 1,
    "the retried row is a fresh pending 'research' row");
  assert(await count(pg, `select count(*)::int n from public.jobs where payload->>'generation_job_id'=$1::text`, [retried]) === 1,
    "a matching jobs row is enqueued for the retry");

  // Concurrency guard: a second retry attempt while the first retry is still
  // pending must be rejected (unique partial index), not create a duplicate row.
  await as(STAFF_A);
  const dupeRejected = await denied(pg, `select public.retry_generation_stage($1)`, [run1.generation_job_id]);
  await reset();
  assert(dupeRejected, "a second concurrent retry for the same failed stage is rejected, not a duplicate row");
  assert(await count(pg, `select count(*)::int n from public.generation_jobs where article_id=$1 and stage='research' and status='pending'`, [run1.article_id]) === 1,
    "still exactly one pending 'research' row after the rejected duplicate retry");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
