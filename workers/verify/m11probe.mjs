// m11probe.mjs — verify the M11 Pipeline slice on REAL Postgres (PGlite, no Docker).
// Proves the DoD gates checkable without a live stack:
//   Gate-1 tenancy   — B cannot reach A's pipeline rows (every new table).
//   Gate-2 roles     — staff work deals but can't delete (manager+) or reconfigure
//                      pipelines/stages/targets (manager+, D-049); client write ceiling.
//   Correctness      — move_deal_stage()/bulk_move_stage() write exactly one
//                      'deal_change' activity per real move with the M13 payload
//                      (D-050); same-stage move is a no-op; cross-pipeline move
//                      rejected; close_deal enforces lost⇒reason + stamps won_at
//                      (and the table CHECK backstops it); deal_value_history trigger
//                      appends on value change + is append-only (D-051); the weighted
//                      forecast math = Σ(value×prob/100) and the target join.
//
//   node workers/verify/m11probe.mjs        (after `npm install`)
//
// Exit 0 = all assertions passed; 1 = a failure/leak was detected.
//
// Depends on M09's 0013 (contacts + activity_log + log_activity). pg_trgm is absent
// in PGlite, so the loader strips `create extension` AND gin_trgm_ops index lines —
// identical to m09probe. There is NO async work in M11 (no jobs/cron): Gate-4 n/a.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const OWNER_A = "11111111-1111-1111-1111-111111111111";
const MANAGER_A = "55555555-5555-5555-5555-555555555555";
const STAFF_A = "66666666-6666-6666-6666-666666666666";
const CLIENT_A = "77777777-7777-7777-7777-777777777777";
const OWNER_B = "33333333-3333-3333-3333-333333333333";
const STAFF_B = "44444444-4444-4444-4444-444444444444"; // agency B staff (the attacker)

const WSA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WSB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

// Contacts
const CONTACT_A = "d1111111-1111-1111-1111-111111111111";
const CONTACT_B = "d2222222-2222-2222-2222-222222222222";

// Pipelines: PIPE_A (main tests), PIPE_A2 (cross-pipeline reject), PIPE_F (forecast), PIPE_B (B's).
const PIPE_A = "a1111111-0000-0000-0000-000000000001";
const PIPE_A2 = "a1111111-0000-0000-0000-000000000002";
const PIPE_F = "a1111111-0000-0000-0000-00000000000f";
const PIPE_B = "b1111111-0000-0000-0000-000000000001";

// Stages
const S1 = "50000000-0000-0000-0000-000000000001"; // PIPE_A, prob 30
const S2 = "50000000-0000-0000-0000-000000000002"; // PIPE_A, prob 60
const S3 = "50000000-0000-0000-0000-000000000003"; // PIPE_A2 (other pipeline)
const SF1 = "5f000000-0000-0000-0000-000000000001"; // PIPE_F, prob 30
const SF2 = "5f000000-0000-0000-0000-000000000002"; // PIPE_F, prob 60
const SB1 = "5b000000-0000-0000-0000-000000000001"; // PIPE_B

// Deals in A / PIPE_A
const D1 = "de000000-0000-0000-0000-000000000001";   // move + value tests (value 1000, S1)
const D2 = "de000000-0000-0000-0000-000000000002";   // bulk move
const D3 = "de000000-0000-0000-0000-000000000003";   // bulk move
const DWIN = "de000000-0000-0000-0000-000000000004"; // close won
const DLOSE = "de000000-0000-0000-0000-000000000005"; // close lost
const DCHK = "de000000-0000-0000-0000-000000000006"; // table CHECK test
const DHIST = "de000000-0000-0000-0000-000000000007"; // seeded value-history row (leak target)
// Deals in A / PIPE_F (forecast)
const F1 = "df000000-0000-0000-0000-000000000001"; // SF1 open 1000
const F2 = "df000000-0000-0000-0000-000000000002"; // SF2 open 2000
const F3 = "df000000-0000-0000-0000-000000000003"; // won 5000
const F4 = "df000000-0000-0000-0000-000000000004"; // lost 3000
// Deal in B
const DB1 = "db000000-0000-0000-0000-000000000001";

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
    create role authenticated nologin;
    create role service_role nologin;
    grant usage on schema public to authenticated;
  `);

  for (const m of ["0000_extensions_enums.sql", "0001_tenancy.sql", "0002_jobs.sql",
                   "0010_m05_compliance.sql", "0013_m09_crm.sql", "0014_m11_pipeline.sql"]) {
    await pg.exec(load(m));
  }
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);

  // ── Seed two agencies + members + pipeline rows (superuser bypasses RLS) ──────
  await pg.exec(`
    insert into auth.users (id,email) values
      ('${OWNER_A}','owner.a@t'),('${MANAGER_A}','mgr.a@t'),('${STAFF_A}','staff.a@t'),
      ('${CLIENT_A}','client.a@t'),('${OWNER_B}','owner.b@t'),('${STAFF_B}','staff.b@t');
    insert into public.profiles (id,email,name) values
      ('${OWNER_A}','owner.a@t','Owner A'),('${MANAGER_A}','mgr.a@t','Mgr A'),('${STAFF_A}','staff.a@t','Staff A'),
      ('${CLIENT_A}','client.a@t','Client A'),('${OWNER_B}','owner.b@t','Owner B'),('${STAFF_B}','staff.b@t','Staff B');
    insert into public.workspaces (id,owner_id,name,slug) values
      ('${WSA}','${OWNER_A}','Acme Agency','acme'),('${WSB}','${OWNER_B}','Beacon Media','beacon');
    insert into public.memberships (workspace_id,user_id,role,status) values
      ('${WSA}','${OWNER_A}','owner','active'),('${WSA}','${MANAGER_A}','manager','active'),
      ('${WSA}','${STAFF_A}','staff','active'),('${WSA}','${CLIENT_A}','client','active'),
      ('${WSB}','${OWNER_B}','owner','active'),('${WSB}','${STAFF_B}','staff','active');

    insert into public.contacts (id,workspace_id,first_name,last_name,email,source) values
      ('${CONTACT_A}','${WSA}','Yusuf','Karim','yusuf@ex.com','referral'),
      ('${CONTACT_B}','${WSB}','Beacon','Contact','bc@ex.com','manual');

    insert into public.pipelines (id,workspace_id,name) values
      ('${PIPE_A}','${WSA}','Sales'),('${PIPE_A2}','${WSA}','Partnerships'),
      ('${PIPE_F}','${WSA}','Forecast'),('${PIPE_B}','${WSB}','Beacon Sales');
    insert into public.pipeline_stages (id,workspace_id,pipeline_id,name,order_index,close_probability,color) values
      ('${S1}','${WSA}','${PIPE_A}','New',0,30,'slate'),
      ('${S2}','${WSA}','${PIPE_A}','Won-ish',1,60,'gold'),
      ('${S3}','${WSA}','${PIPE_A2}','Intro',0,20,'teal'),
      ('${SF1}','${WSA}','${PIPE_F}','New',0,30,'slate'),
      ('${SF2}','${WSA}','${PIPE_F}','Late',1,60,'gold'),
      ('${SB1}','${WSB}','${PIPE_B}','New',0,25,'slate');
    insert into public.pipeline_targets (pipeline_id,workspace_id,monthly_target) values ('${PIPE_F}','${WSA}',10000);

    insert into public.deals (id,workspace_id,pipeline_id,stage_id,contact_id,title,value,status) values
      ('${D1}','${WSA}','${PIPE_A}','${S1}','${CONTACT_A}','Deal 1',1000,'open'),
      ('${D2}','${WSA}','${PIPE_A}','${S1}',null,'Deal 2',500,'open'),
      ('${D3}','${WSA}','${PIPE_A}','${S1}',null,'Deal 3',700,'open'),
      ('${DWIN}','${WSA}','${PIPE_A}','${S1}','${CONTACT_A}','Win me',4000,'open'),
      ('${DLOSE}','${WSA}','${PIPE_A}','${S1}',null,'Lose me',900,'open'),
      ('${DCHK}','${WSA}','${PIPE_A}','${S1}',null,'Check me',100,'open'),
      ('${DHIST}','${WSA}','${PIPE_A}','${S1}',null,'Hist',200,'open'),
      ('${F1}','${WSA}','${PIPE_F}','${SF1}',null,'F1',1000,'open'),
      ('${F2}','${WSA}','${PIPE_F}','${SF2}',null,'F2',2000,'open'),
      ('${F3}','${WSA}','${PIPE_F}','${SF1}',null,'F3',5000,'won'),
      ('${DB1}','${WSB}','${PIPE_B}','${SB1}','${CONTACT_B}','Beacon deal',500,'open');
    -- F4 is a lost deal → seed its reason inline to satisfy the deal_lost_reason CHECK.
    insert into public.deals (id,workspace_id,pipeline_id,stage_id,title,value,status,lost_reason) values
      ('${F4}','${WSA}','${PIPE_F}','${SF2}','F4',3000,'lost','seed');
  `);
  // A seeded value change so A owns a deal_value_history row (leak target).
  await pg.exec(`update public.deals set value=250 where id='${DHIST}';`); // fires the history trigger

  const as = (sub) => pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);
  const actCount = async (ws) => count(pg, `select count(*)::int n from public.activity_log where workspace_id=$1 and type='deal_change'`, [ws]);

  // ── 1. Cross-tenant isolation — B's staff cannot reach A (Gate-1) ────────────
  console.log("\nM11 · cross-tenant isolation (agency B staff attacking agency A):");
  await as(STAFF_B);
  for (const t of ["pipelines", "pipeline_stages", "pipeline_targets", "deals", "deal_notes", "deal_files", "deal_value_history"]) {
    assert(await count(pg, `select count(*)::int n from public.${t} where workspace_id=$1`, [WSA]) === 0,
      `B cannot SELECT A's ${t}`);
  }
  assert(await denied(pg, `insert into public.deals (workspace_id,pipeline_id,title,value) values ($1,$2,'HIJACK',1)`, [WSA, PIPE_A]),
    "B cannot INSERT a deal into A");
  assert((await pg.query(`update public.deals set title='HIJACK' where workspace_id=$1`, [WSA])).affectedRows === 0,
    "B cannot UPDATE A's deals (0 rows)");
  assert(await denied(pg, `select public.move_deal_stage($1,$2,$3)`, [WSA, D1, S2]),
    "B cannot move A's deal (has_role staff guard)");
  assert(await denied(pg, `select * from public.pipeline_forecast($1,$2)`, [WSA, PIPE_F]),
    "B cannot read A's forecast (is_member guard)");
  assert(await count(pg, `select count(*)::int n from public.deals where workspace_id=$1`, [WSB]) === 1,
    "B CAN SELECT its own deals (positive control)");

  // ── 2. Role matrix (Gate-2) — config manager+, deals staff+, client ceiling ──
  console.log("\nM11 · role matrix — pipeline config manager+, deals staff+, client ceiling:");
  await reset(); await as(STAFF_A);
  assert(await denied(pg, `insert into public.pipelines (workspace_id,name) values ($1,'x')`, [WSA]),
    "staff CANNOT create a pipeline (manager+ only)");
  assert(await denied(pg, `insert into public.pipeline_stages (workspace_id,pipeline_id,name,order_index) values ($1,$2,'x',9)`, [WSA, PIPE_A]),
    "staff CANNOT add a stage (manager+ only)");
  assert((await pg.query(`update public.pipeline_stages set name='hack' where id=$1`, [S1])).affectedRows === 0,
    "staff CANNOT rename a stage (0 rows — manager+)");
  assert(await denied(pg, `insert into public.pipeline_targets (pipeline_id,workspace_id,monthly_target) values ($1,$2,1)`, [PIPE_A, WSA]),
    "staff CANNOT set a pipeline target (manager+ only)");
  const sDeal = (await pg.query(`insert into public.deals (workspace_id,pipeline_id,stage_id,title,value) values ($1,$2,$3,'staff deal',10) returning id`, [WSA, PIPE_A, S1])).rows[0].id;
  assert(!!sDeal, "staff CAN create a deal (staff+)");
  assert((await pg.query(`update public.deals set value=20 where id=$1`, [sDeal])).affectedRows === 1,
    "staff CAN edit a deal");
  assert((await pg.query(`delete from public.deals where id=$1`, [sDeal])).affectedRows === 0,
    "staff CANNOT delete a deal (0 rows — manager+)");
  await reset(); await as(MANAGER_A);
  const mPipe = (await pg.query(`insert into public.pipelines (workspace_id,name) values ($1,'Mgr pipe') returning id`, [WSA])).rows[0].id;
  assert(!!mPipe, "manager CAN create a pipeline");
  assert((await pg.query(`delete from public.deals where id=$1`, [sDeal])).affectedRows === 1,
    "manager CAN delete a deal");
  await reset(); await as(CLIENT_A);
  assert(await denied(pg, `insert into public.deals (workspace_id,pipeline_id,title,value) values ($1,$2,'client',1)`, [WSA, PIPE_A]),
    "client CANNOT create a deal (write ceiling — staff+)");

  // ── 3. Stage-change event bus — move writes exactly one deal_change (D-050) ───
  console.log("\nM11 · move_deal_stage writes exactly one activity_log 'deal_change':");
  await reset(); await as(STAFF_A);
  let before = await actCount(WSA);
  await pg.query(`select public.move_deal_stage($1,$2,$3)`, [WSA, D1, S2]);
  assert(await count(pg, `select count(*)::int n from public.deals where id=$1 and stage_id=$2`, [D1, S2]) === 1,
    "deal D1 now sits in stage S2");
  assert((await actCount(WSA)) === before + 1, "exactly one 'deal_change' activity was written");
  const meta = (await pg.query(
    `select metadata from public.activity_log where workspace_id=$1 and type='deal_change' order by created_at desc limit 1`, [WSA])).rows[0].metadata;
  assert(meta.deal_id === D1 && meta.new_stage_id === S2 && meta.old_stage_id === S1 && meta.contact_id === CONTACT_A,
    "the event payload carries {deal_id, old/new_stage_id, contact_id} for M13");
  assert(await count(pg, `select count(*)::int n from public.deals where id=$1 and stage_entered_at > created_at`, [D1]) === 1,
    "stage_entered_at was bumped on the move (days-in-stage badge, D-051)");
  before = await actCount(WSA);
  await pg.query(`select public.move_deal_stage($1,$2,$3)`, [WSA, D1, S2]); // same stage
  assert((await actCount(WSA)) === before, "moving to the SAME stage is a no-op (no duplicate activity)");
  assert(await denied(pg, `select public.move_deal_stage($1,$2,$3)`, [WSA, D1, S3]),
    "moving to a stage in a DIFFERENT pipeline is rejected");

  // ── 4. Bulk move (list view) ─────────────────────────────────────────────────
  console.log("\nM11 · bulk_move_stage moves many + logs each:");
  before = await actCount(WSA);
  const moved = Number((await pg.query(`select public.bulk_move_stage($1,$2::uuid[],$3) n`, [WSA, `{${D2},${D3}}`, S2])).rows[0].n);
  assert(moved === 2, "bulk_move_stage reports 2 deals moved");
  assert(await count(pg, `select count(*)::int n from public.deals where id in ($1,$2) and stage_id=$3`, [D2, D3, S2]) === 2,
    "both D2 and D3 landed in S2");
  assert((await actCount(WSA)) === before + 2, "two more 'deal_change' activities written (one per moved deal)");

  // ── 5. close_deal — lost⇒reason, won⇒won_at; table CHECK backstop ────────────
  console.log("\nM11 · close_deal — lost requires a reason, won stamps won_at:");
  assert(await denied(pg, `select public.close_deal($1,$2,'lost',null)`, [WSA, DLOSE]),
    "closing lost WITHOUT a reason is rejected");
  await pg.query(`select public.close_deal($1,$2,'lost','Budget')`, [WSA, DLOSE]);
  assert(await count(pg, `select count(*)::int n from public.deals where id=$1 and status='lost' and lost_reason='Budget'`, [DLOSE]) === 1,
    "closing lost WITH a reason sets status + lost_reason");
  await pg.query(`select public.close_deal($1,$2,'won',null)`, [WSA, DWIN]);
  assert(await count(pg, `select count(*)::int n from public.deals where id=$1 and status='won' and won_at is not null`, [DWIN]) === 1,
    "closing won stamps status + won_at (revenue + date logged)");
  assert(await denied(pg, `update public.deals set status='lost' where id=$1`, [DCHK]),
    "the deals CHECK rejects a direct lost-without-reason update (backstop)");

  // ── 6. deal_value_history — trigger appends on change; append-only ───────────
  console.log("\nM11 · deal_value_history — written on value change, append-only:");
  const histBefore = await count(pg, `select count(*)::int n from public.deal_value_history where deal_id=$1`, [D1]);
  await pg.query(`update public.deals set value=1500 where id=$1`, [D1]);
  assert(await count(pg, `select count(*)::int n from public.deal_value_history where deal_id=$1`, [D1]) === histBefore + 1,
    "changing a deal's value appends a history row");
  const hist = (await pg.query(`select old_value,new_value,changed_by from public.deal_value_history where deal_id=$1 order by created_at desc limit 1`, [D1])).rows[0];
  assert(Number(hist.old_value) === 1000 && Number(hist.new_value) === 1500 && hist.changed_by === STAFF_A,
    "history row records old→new value + the actor (auth.uid)");
  const histAfter = await count(pg, `select count(*)::int n from public.deal_value_history where deal_id=$1`, [D1]);
  await pg.query(`update public.deals set value=1500 where id=$1`, [D1]); // same value
  assert(await count(pg, `select count(*)::int n from public.deal_value_history where deal_id=$1`, [D1]) === histAfter,
    "re-saving the SAME value writes no new history row");
  const anyHist = (await pg.query(`select id from public.deal_value_history where deal_id=$1 limit 1`, [D1])).rows[0].id;
  assert((await pg.query(`update public.deal_value_history set new_value=9 where id=$1`, [anyHist])).affectedRows === 0,
    "nobody can UPDATE a history row (append-only, 0 rows)");
  assert((await pg.query(`delete from public.deal_value_history where id=$1`, [anyHist])).affectedRows === 0,
    "nobody can DELETE a history row (append-only, 0 rows)");

  // ── 7. Weighted forecast math (accept-when) ──────────────────────────────────
  console.log("\nM11 · pipeline_forecast — weighted = Σ(value × prob/100) + rollups:");
  const fc = (await pg.query(`select * from public.pipeline_forecast($1,$2)`, [WSA, PIPE_F])).rows[0];
  // F1: 1000 × 30% = 300 ; F2: 2000 × 60% = 1200 ; won/lost excluded from weighted → 1500
  assert(Number(fc.weighted) === 1500, `weighted forecast = 1500 (got ${fc.weighted})`);
  assert(Number(fc.open_total) === 3000 && Number(fc.open_count) === 2, "open rollup = 3000 across 2 deals");
  assert(Number(fc.won_total) === 5000 && Number(fc.won_count) === 1, "won rollup = 5000 across 1 deal");
  assert(Number(fc.lost_count) === 1, "lost count = 1");
  assert(Number(fc.target) === 10000, "target joins the pipeline's monthly_target (10000)");

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M11 probe: ${pass} passed, ${fail} failed\x1b[0m`);
  await pg.close();
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((e) => { console.error("harness error:", e); process.exitCode = 2; });
