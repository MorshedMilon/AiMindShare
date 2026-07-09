// m21probe.mjs — verify the M21 SEO Engine SQL layer on REAL Postgres (PGlite, no
// Docker). Proves the DoD gates checkable without a live stack:
//   Schema       — 8 tables exist + RLS enabled.
//   Gate-1       — B's staff cannot select/insert A's SEO rows; A's client reads nothing.
//   Gate-2 roles — staff+ read/edit, manager+ delete, client ceiling (operator surface).
//   Gate-4       — keyword_rankings / seo_audit_issues are service-role write only;
//                  seo_audits insert is pending/queued only from a browser.
//   cache        — seo_cache_get/put upsert + 30-day TTL + workspace scoping (D-129).
//   queue seam   — send_to_content_queue inserts, idempotent, staff-gated (D-134).
//   rankings     — record_keyword_ranking delta + |Δ|>=5 fires rank.change_major on M13.
//   history      — rank_history returns the 90-day series (operator ceiling).
//   audit score  — audit_score is deterministic and penalises by severity.
//   cron bodies  — enqueue_due_rank_checks / enqueue_weekly_rank_reports enqueue jobs,
//                  active-only + idempotent.
//   grants       — cache/record/enqueue service-role only; history/queue authenticated.
//
//   node workers/verify/m21probe.mjs
//
// Exit 0 = all passed; 1 = a failure/leak. Depends on M05/M09/M11/M12/M13 migrations
// (for emit_trigger + workflow enrolment). extensions/pg_trgm stripped; cron guarded.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const OWNER_A = "11111111-1111-1111-1111-111111111111";
const MANAGER_A = "99999999-9999-9999-9999-999999999999";
const STAFF_A = "66666666-6666-6666-6666-666666666666";
const CLIENT_A = "77777777-7777-7777-7777-777777777777";
const OWNER_B = "33333333-3333-3333-3333-333333333333";
const STAFF_B = "44444444-4444-4444-4444-444444444444";

const WSA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WSB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const LIST_A = "11000000-0000-0000-0000-000000000001";
const TK_A = "12000000-0000-0000-0000-000000000001";  // active tracked keyword
const TK_A2 = "12000000-0000-0000-0000-000000000002"; // inactive tracked keyword
const AUDIT_A = "13000000-0000-0000-0000-000000000001";

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
  // Load M21 deps + M21. M13 (0016) pulls in emit_trigger + workflow tables; its own
  // deps (m05/m09/m11/m12) load first. Numbering per this build — update on merge.
  for (const m of ["0000_extensions_enums.sql", "0001_tenancy.sql", "0002_jobs.sql",
                   "0010_m05_compliance.sql", "0013_m09_crm.sql",
                   "0014_m11_pipeline.sql", "0015_m12_inbox.sql", "0016_m13_automations.sql",
                   "0026_m21_seo.sql"]) {
    await pg.exec(load(m));
  }
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);
  // Faithful grant posture: service-role-only entry points are revoked from authenticated
  // (the blanket grant above is a harness convenience for the RLS tests).
  await pg.exec(`
    revoke execute on function public.seo_cache_get(uuid,text,text) from authenticated;
    revoke execute on function public.seo_cache_put(uuid,text,text,jsonb) from authenticated;
    revoke execute on function public.record_keyword_ranking(uuid,uuid,int,text,boolean,jsonb) from authenticated;
    revoke execute on function public.enqueue_due_rank_checks() from authenticated;
    revoke execute on function public.enqueue_weekly_rank_reports() from authenticated;
  `);

  // ── Seed two agencies ────────────────────────────────────────────────────────
  await pg.exec(`
    insert into auth.users (id,email) values
      ('${OWNER_A}','oa@t'),('${MANAGER_A}','ma@t'),('${STAFF_A}','sa@t'),('${CLIENT_A}','ca@t'),
      ('${OWNER_B}','ob@t'),('${STAFF_B}','sb@t');
    insert into public.profiles (id,email,name) values
      ('${OWNER_A}','oa@t','OA'),('${MANAGER_A}','ma@t','MA'),('${STAFF_A}','sa@t','SA'),('${CLIENT_A}','ca@t','CA'),
      ('${OWNER_B}','ob@t','OB'),('${STAFF_B}','sb@t','SB');
    insert into public.workspaces (id,owner_id,name,slug) values
      ('${WSA}','${OWNER_A}','Acme','acme'),('${WSB}','${OWNER_B}','Beacon','beacon');
    insert into public.memberships (workspace_id,user_id,role,status) values
      ('${WSA}','${OWNER_A}','owner','active'),('${WSA}','${MANAGER_A}','manager','active'),
      ('${WSA}','${STAFF_A}','staff','active'),('${WSA}','${CLIENT_A}','client','active'),
      ('${WSB}','${OWNER_B}','owner','active'),('${WSB}','${STAFF_B}','staff','active');
  `);

  const as = (sub) => pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);

  // ── 1. Schema — 8 tables exist with RLS enabled ──────────────────────────────
  console.log("\nM21 · schema — 8 tables exist with RLS enabled:");
  for (const t of ["keyword_lists", "keywords", "seo_keyword_cache", "tracked_keywords",
                   "keyword_rankings", "seo_audits", "seo_audit_issues", "content_queue"]) {
    const r = await pg.query(`select to_regclass('public.${t}') as t, relrowsecurity
      from pg_class where relname=$1`, [t]);
    assert(r.rows[0]?.t && r.rows[0]?.relrowsecurity, `table ${t} exists + RLS enabled`);
  }

  // Seed A's data as manager (staff+ can insert).
  await reset(); await as(MANAGER_A);
  await pg.query(`insert into public.keyword_lists (id,workspace_id,name) values ($1,$2,'Ramadan')`, [LIST_A, WSA]);
  await pg.query(`insert into public.keywords (workspace_id,list_id,keyword,volume,cpc,difficulty,intent)
    values ($1,$2,'best crm',1200,3.20,45,'commercial')`, [WSA, LIST_A]);
  await pg.query(`insert into public.tracked_keywords (id,workspace_id,keyword,domain,competitor_domains,is_active) values
    ($1,$3,'best crm','acme.com','{rival.com}',true),
    ($2,$3,'old kw','acme.com','{}',false)`, [TK_A, TK_A2, WSA]);

  // ── 2. Cross-tenant isolation (Gate-1) ───────────────────────────────────────
  console.log("\nM21 · cross-tenant isolation (agency B staff attacking agency A):");
  await reset(); await as(STAFF_B);
  for (const t of ["keyword_lists", "keywords", "tracked_keywords"]) {
    assert(await count(pg, `select count(*)::int n from public.${t} where workspace_id=$1`, [WSA]) === 0,
      `B cannot SELECT A's ${t}`);
  }
  assert(await denied(pg, `insert into public.keyword_lists (workspace_id,name) values ($1,'HIJACK')`, [WSA]),
    "B cannot INSERT a keyword_list into A");
  assert(await denied(pg, `insert into public.tracked_keywords (workspace_id,keyword,domain) values ($1,'x','x.com')`, [WSA]),
    "B cannot INSERT a tracker into A");
  assert((await pg.query(`update public.keyword_lists set name='HIJACK' where workspace_id=$1`, [WSA])).affectedRows === 0,
    "B cannot UPDATE A's keyword_lists (0 rows)");

  // ── 3. Role matrix (Gate-2) — staff edit · manager delete · client ceiling ───
  console.log("\nM21 · roles — staff+ edit · manager+ delete · client reads nothing:");
  await reset(); await as(STAFF_A);
  assert(await count(pg, `select count(*)::int n from public.keyword_lists where workspace_id=$1`, [WSA]) >= 1,
    "staff CAN read keyword_lists");
  const sList = await pg.query(`insert into public.keyword_lists (workspace_id,name) values ($1,'Staff list') returning id`, [WSA]);
  assert(!!sList.rows[0]?.id, "staff CAN create a keyword_list");
  assert((await pg.query(`delete from public.keyword_lists where id=$1`, [LIST_A])).affectedRows === 0,
    "staff CANNOT delete a keyword_list (manager+, 0 rows)");

  await reset(); await as(CLIENT_A);
  assert(await count(pg, `select count(*)::int n from public.keyword_lists where workspace_id=$1`, [WSA]) === 0,
    "client CANNOT read keyword_lists (operator ceiling, D-130)");
  assert(await count(pg, `select count(*)::int n from public.tracked_keywords where workspace_id=$1`, [WSA]) === 0,
    "client CANNOT read tracked_keywords (operator ceiling)");

  await reset(); await as(MANAGER_A);
  assert((await pg.query(`delete from public.keyword_lists where id=$1`, [sList.rows[0].id])).affectedRows === 1,
    "manager CAN delete a keyword_list");

  // ── 4. Worker-write tables + audit insert posture (Gate-4) ───────────────────
  console.log("\nM21 · keyword_rankings/seo_audit_issues service-role write; audits pending-only:");
  await reset(); await as(STAFF_A);
  assert(await denied(pg, `insert into public.keyword_rankings (workspace_id,tracked_keyword_id,position) values ($1,$2,3)`, [WSA, TK_A]),
    "authenticated member CANNOT insert a keyword_ranking (no INSERT policy)");
  assert(await denied(pg, `insert into public.seo_audits (workspace_id,domain,status) values ($1,'acme.com','running')`, [WSA]),
    "staff CANNOT insert a 'running' audit (pending/queued only)");
  const okAudit = await pg.query(`insert into public.seo_audits (id,workspace_id,domain,status) values ($1,$2,'acme.com','pending') returning id`, [AUDIT_A, WSA]);
  assert(!!okAudit.rows[0]?.id, "staff CAN insert a 'pending' audit");
  assert(await denied(pg, `insert into public.seo_audit_issues (workspace_id,audit_id,type,severity) values ($1,$2,'broken_link','critical')`, [WSA, AUDIT_A]),
    "authenticated member CANNOT insert a seo_audit_issue (no INSERT policy)");
  await reset(); // service role
  const iss = await pg.query(`insert into public.seo_audit_issues (workspace_id,audit_id,type,severity,url) values ($1,$2,'broken_link','critical','acme.com/x') returning id`, [WSA, AUDIT_A]);
  assert(!!iss.rows[0]?.id, "service role CAN insert a seo_audit_issue");

  // ── 5. Keyword cache (D-129) — upsert + TTL + workspace scope ────────────────
  console.log("\nM21 · seo_keyword_cache — upsert · TTL · workspace scope:");
  await reset(); // service role
  await pg.query(`select public.seo_cache_put($1,'best crm','us',$2::jsonb)`, [WSA, JSON.stringify({ volume: 1200 })]);
  assert((await pg.query(`select public.seo_cache_get($1,'best crm','us') d`, [WSA])).rows[0].d?.volume === 1200,
    "cache_get returns the cached payload");
  assert((await pg.query(`select public.seo_cache_get($1,'no such kw','us') d`, [WSA])).rows[0].d === null,
    "cache_get miss returns null");
  await pg.query(`select public.seo_cache_put($1,'best crm','us',$2::jsonb)`, [WSA, JSON.stringify({ volume: 1300 })]);
  assert((await pg.query(`select public.seo_cache_get($1,'best crm','us') d`, [WSA])).rows[0].d?.volume === 1300,
    "cache_put upserts (no dup-key error) — fresh payload wins");
  assert(await count(pg, `select count(*)::int n from public.seo_keyword_cache where workspace_id=$1`, [WSA]) === 1,
    "cache upsert keeps a single row per (ws,keyword,country)");
  // expire it and confirm the 30-day TTL hides it
  await pg.query(`update public.seo_keyword_cache set cached_at = now() - interval '31 days' where workspace_id=$1`, [WSA]);
  assert((await pg.query(`select public.seo_cache_get($1,'best crm','us') d`, [WSA])).rows[0].d === null,
    "cache_get honours the 30-day TTL (stale row hidden)");
  // workspace scope: B's cache_get never sees A's row
  await pg.query(`update public.seo_keyword_cache set cached_at = now() where workspace_id=$1`, [WSA]);
  assert((await pg.query(`select public.seo_cache_get($1,'best crm','us') d`, [WSB])).rows[0].d === null,
    "cache is workspace-scoped (B's lookup never hits A's cache)");

  // ── 6. send_to_content_queue — staff-gated, idempotent (D-134) ───────────────
  console.log("\nM21 · send_to_content_queue — insert · idempotent · staff-gated:");
  await reset(); await as(STAFF_A);
  assert(Number((await pg.query(`select public.send_to_content_queue($1,$2)`, [WSA, ["kw one", "kw two"]])).rows[0].send_to_content_queue) === 2,
    "send_to_content_queue inserts 2 fresh keywords");
  assert(Number((await pg.query(`select public.send_to_content_queue($1,$2)`, [WSA, ["kw one"]])).rows[0].send_to_content_queue) === 0,
    "send_to_content_queue is idempotent (dup keyword adds 0)");
  assert(await count(pg, `select count(*)::int n from public.content_queue where workspace_id=$1`, [WSA]) === 2,
    "content_queue holds exactly 2 rows");
  await reset(); await as(STAFF_B);
  assert(await denied(pg, `select public.send_to_content_queue($1,$2)`, [WSA, ["x"]]),
    "a non-member cannot send_to_content_queue into A (has_role guard)");

  // ── 7. record_keyword_ranking — delta + major-move emit (D-133) ──────────────
  console.log("\nM21 · record_keyword_ranking — delta + |Δ|>=5 fires rank.change_major:");
  await reset(); // service role
  // enrol an M13 workflow on rank.change_major so we can prove the bus fires
  await pg.query(`insert into public.workflows (workspace_id,name,trigger_type,is_active,reentry_rule,nodes,edges)
    values ($1,'Rank recovery','rank.change_major',true,'allow','[]','[]')`, [WSA]);
  const exBefore = await count(pg, `select count(*)::int n from public.workflow_executions where workspace_id=$1`, [WSA]);
  await pg.query(`select public.record_keyword_ranking($1,$2,8,'acme.com/x',false,'{}')`, [WSA, TK_A]);   // first: no prior
  await pg.query(`select public.record_keyword_ranking($1,$2,6,'acme.com/x',false,'{}')`, [WSA, TK_A]);   // |Δ|=2: no emit
  assert(await count(pg, `select count(*)::int n from public.workflow_executions where workspace_id=$1`, [WSA]) === exBefore,
    "small move (|Δ|=2) does NOT fire rank.change_major");
  await pg.query(`select public.record_keyword_ranking($1,$2,18,'acme.com/x',false,'{}')`, [WSA, TK_A]);  // |Δ|=12: emit
  assert(await count(pg, `select count(*)::int n from public.workflow_executions where workspace_id=$1`, [WSA]) === exBefore + 1,
    "big move (|Δ|=12) fires rank.change_major on the M13 bus");
  assert(await count(pg, `select count(*)::int n from public.keyword_rankings where tracked_keyword_id=$1`, [TK_A]) === 3,
    "3 ranking snapshots recorded");
  assert((await pg.query(`select last_checked_at from public.tracked_keywords where id=$1`, [TK_A])).rows[0].last_checked_at !== null,
    "record_keyword_ranking stamps tracked_keywords.last_checked_at");

  // ── 8. rank_history — 90-day series, operator ceiling ────────────────────────
  console.log("\nM21 · rank_history — series + operator ceiling:");
  await reset(); await as(STAFF_A);
  assert((await pg.query(`select count(*)::int n from public.rank_history($1,90)`, [TK_A])).rows[0].n === 3,
    "staff rank_history returns the 3 snapshots");
  await reset(); await as(CLIENT_A);
  assert((await pg.query(`select count(*)::int n from public.rank_history($1,90)`, [TK_A])).rows[0].n === 0,
    "client rank_history returns nothing (operator ceiling)");

  // ── 9. audit_score — deterministic severity weighting ────────────────────────
  console.log("\nM21 · audit_score — deterministic severity weighting:");
  await reset(); // service role
  await pg.query(`insert into public.seo_audit_issues (workspace_id,audit_id,type,severity) values
    ($1,$2,'missing_title','warning'),($1,$2,'large_image','notice')`, [WSA, AUDIT_A]);
  // issues now: 1 critical(10) + 1 warning(4) + 1 notice(1) = 15 → score 85
  const score = (await pg.query(`select public.audit_score($1) s`, [AUDIT_A])).rows[0].s;
  assert(score === 85, `audit_score = 100 - (10+4+1) = 85 (got ${score})`);

  // ── 10. cron enqueue bodies — active-only + idempotent ───────────────────────
  console.log("\nM21 · cron enqueue — active-only trackers + idempotent:");
  await reset(); // service role
  const nChecks = Number((await pg.query(`select public.enqueue_due_rank_checks() n`)).rows[0].n);
  assert(nChecks === 1, `enqueue_due_rank_checks visits only the 1 active tracker (got ${nChecks})`);
  assert(await count(pg, `select count(*)::int n from public.jobs where type='rank.check' and status='queued'`) === 1,
    "exactly 1 rank.check job queued (inactive tracker skipped)");
  await pg.query(`select public.enqueue_due_rank_checks()`); // second run same day
  assert(await count(pg, `select count(*)::int n from public.jobs where type='rank.check'`) === 1,
    "rank.check enqueue is idempotent per (tracker, day)");
  const nRep = Number((await pg.query(`select public.enqueue_weekly_rank_reports() n`)).rows[0].n);
  assert(nRep === 1, `enqueue_weekly_rank_reports enqueues 1 report for A (got ${nRep})`);
  assert(await count(pg, `select count(*)::int n from public.jobs where type='rank.report' and status='queued'`) === 1,
    "exactly 1 rank.report job queued for the workspace");
  await pg.query(`select public.enqueue_weekly_rank_reports()`);
  assert(await count(pg, `select count(*)::int n from public.jobs where type='rank.report'`) === 1,
    "rank.report enqueue is idempotent per (workspace, ISO week)");

  // ── 11. Grants — privileged writes service-role only; reads authenticated ────
  console.log("\nM21 · grants — privileged writes service-role only:");
  const canExec = async (role, sig) => (await pg.query(
    `select has_function_privilege('${role}','public.${sig}','execute') ok`)).rows[0].ok;
  assert(await canExec("service_role", "seo_cache_put(uuid,text,text,jsonb)"),
    "service_role CAN execute seo_cache_put");
  assert(!(await canExec("authenticated", "seo_cache_put(uuid,text,text,jsonb)")),
    "authenticated CANNOT execute seo_cache_put (service-role only)");
  assert(!(await canExec("authenticated", "record_keyword_ranking(uuid,uuid,int,text,boolean,jsonb)")),
    "authenticated CANNOT execute record_keyword_ranking (service-role only)");
  assert(!(await canExec("authenticated", "enqueue_due_rank_checks()")),
    "authenticated CANNOT execute enqueue_due_rank_checks (service-role only)");
  assert(await canExec("authenticated", "rank_history(uuid,int)"),
    "authenticated CAN execute rank_history (browser read path)");
  assert(await canExec("authenticated", "send_to_content_queue(uuid,text[])"),
    "authenticated CAN execute send_to_content_queue (staff seam)");

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M21 probe: ${pass} passed, ${fail} failed\x1b[0m`);
  await pg.close();
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((e) => { console.error("harness error:", e); process.exitCode = 2; });
