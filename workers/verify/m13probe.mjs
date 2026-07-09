// m13probe.mjs — verify the M13 Automations SQL layer on REAL Postgres (PGlite).
// Proves the DoD gates checkable without a live stack:
//   Gate-1 tenancy — B cannot reach A's workflows/versions/executions/steps; templates
//                    are global-readable; B can't write into A.
//   Gate-2 roles   — workflows: staff READ, manager+ WRITE, client CEILING (no read);
//                    executions/steps are system-written (no client INSERT — Gate-4).
//   Bus            — emit_trigger enrols matching active workflows; trigger_config
//                    narrows the match; re-entry (once / allow / once_per_days) +
//                    per-contact concurrency guard; each enrolment enqueues an
//                    automation.execute job (Gate-4: browser inserts 'queued' only).
//   Source triggers— contact insert → contact.created; contact_tag insert → tag.added;
//                    deal stage move → deal.stage_changed; inbound message →
//                    message.received (outbound does NOT); the walker's own move via
//                    automation_apply_move_deal does NOT re-emit (loop guard).
//   Version-pin    — editing a live workflow bumps version + snapshots it, WITHOUT
//                    changing the version a running execution is pinned to (AC-3).
//
//   node workers/verify/m13probe.mjs
//
// Exit 0 = all passed; 1 = a failure/leak. Walker (JS) is covered by m13walkprobe.mjs.
// Depends on M05/M09/M11/M12 migrations. pg_trgm/extensions stripped like m11probe.
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
const STAFF_B = "44444444-4444-4444-4444-444444444444";

const WSA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WSB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CONTACT_A = "d1111111-1111-1111-1111-111111111111";
const CONTACT_A2 = "d1111111-2222-2222-2222-222222222222";
const CONTACT_B = "d2222222-2222-2222-2222-222222222222";
const PIPE_A = "a1111111-0000-0000-0000-000000000001";
const S1 = "50000000-0000-0000-0000-000000000001";
const S2 = "50000000-0000-0000-0000-000000000002";
const DEAL_A = "de000000-0000-0000-0000-000000000001";
const TAG_VIP = "c1111111-0000-0000-0000-000000000001";
const CONV_A = "cc000000-0000-0000-0000-000000000001";

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
                   "0015_m12_inbox.sql", "0016_m13_automations.sql"]) {
    await pg.exec(load(m));
  }
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);

  // ── Seed two agencies ────────────────────────────────────────────────────────
  await pg.exec(`
    insert into auth.users (id,email) values
      ('${OWNER_A}','oa@t'),('${MANAGER_A}','ma@t'),('${STAFF_A}','sa@t'),
      ('${CLIENT_A}','ca@t'),('${OWNER_B}','ob@t'),('${STAFF_B}','sb@t');
    insert into public.profiles (id,email,name) values
      ('${OWNER_A}','oa@t','OA'),('${MANAGER_A}','ma@t','MA'),('${STAFF_A}','sa@t','SA'),
      ('${CLIENT_A}','ca@t','CA'),('${OWNER_B}','ob@t','OB'),('${STAFF_B}','sb@t','SB');
    insert into public.workspaces (id,owner_id,name,slug) values
      ('${WSA}','${OWNER_A}','Acme','acme'),('${WSB}','${OWNER_B}','Beacon','beacon');
    insert into public.memberships (workspace_id,user_id,role,status) values
      ('${WSA}','${OWNER_A}','owner','active'),('${WSA}','${MANAGER_A}','manager','active'),
      ('${WSA}','${STAFF_A}','staff','active'),('${WSA}','${CLIENT_A}','client','active'),
      ('${WSB}','${OWNER_B}','owner','active'),('${WSB}','${STAFF_B}','staff','active');
    insert into public.contacts (id,workspace_id,first_name,source) values
      ('${CONTACT_A}','${WSA}','Yusuf','manual'),('${CONTACT_A2}','${WSA}','Amina','manual'),
      ('${CONTACT_B}','${WSB}','Beacon','manual');
    insert into public.tags (id,workspace_id,name) values ('${TAG_VIP}','${WSA}','VIP');
    insert into public.pipelines (id,workspace_id,name) values ('${PIPE_A}','${WSA}','Sales');
    insert into public.pipeline_stages (id,workspace_id,pipeline_id,name,order_index,close_probability) values
      ('${S1}','${WSA}','${PIPE_A}','New',0,30),('${S2}','${WSA}','${PIPE_A}','Won',1,60);
    insert into public.deals (id,workspace_id,pipeline_id,stage_id,contact_id,title,value,status) values
      ('${DEAL_A}','${WSA}','${PIPE_A}','${S1}','${CONTACT_A}','Deal',1000,'open');
    insert into public.conversations (id,workspace_id,contact_id,channel,status) values
      ('${CONV_A}','${WSA}','${CONTACT_A}','sms','open');
  `);

  const as = (sub) => pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);
  const execCount = async (ws) => count(pg, `select count(*)::int n from public.workflow_executions where workspace_id=$1`, [ws]);

  // Seed a workflow as service-role (bypass RLS). A simple contact.created 'once' WF.
  await pg.exec(`
    insert into public.workflows (id,workspace_id,name,trigger_type,is_active,reentry_rule,nodes,edges)
    values ('f0000000-0000-0000-0000-000000000001','${WSA}','Welcome','contact.created',true,'once',
            '[{"id":"t","type":"trigger"},{"id":"a","type":"add_tag","config":{"tag_name":"VIP"}}]',
            '[{"source":"t","target":"a"}]');
    insert into public.workflow_templates (key,name,category,trigger_type,is_global,nodes,edges)
    values ('global-welcome','Welcome nurture','nurture','contact.created',true,'[]','[]');
  `);
  const WF = "f0000000-0000-0000-0000-000000000001";

  // ── 1. Cross-tenant isolation (Gate-1) ───────────────────────────────────────
  console.log("\nM13 · cross-tenant isolation (agency B staff attacking agency A):");
  await as(STAFF_B);
  for (const t of ["workflows", "workflow_versions", "workflow_executions", "workflow_execution_steps"]) {
    assert(await count(pg, `select count(*)::int n from public.${t} where workspace_id=$1`, [WSA]) === 0,
      `B cannot SELECT A's ${t}`);
  }
  assert(await denied(pg, `insert into public.workflows (workspace_id,name,trigger_type) values ($1,'HIJACK','manual')`, [WSA]),
    "B cannot INSERT a workflow into A");
  assert((await pg.query(`update public.workflows set name='HIJACK' where workspace_id=$1`, [WSA])).affectedRows === 0,
    "B cannot UPDATE A's workflows (0 rows)");
  assert(await count(pg, `select count(*)::int n from public.workflow_templates where is_global`, []) >= 1,
    "B CAN read GLOBAL templates (positive control)");

  // ── 2. Role matrix (Gate-2) — staff read, manager+ write, client ceiling ──────
  console.log("\nM13 · roles — staff read · manager+ write · client ceiling:");
  await reset(); await as(STAFF_A);
  assert(await count(pg, `select count(*)::int n from public.workflows where workspace_id=$1`, [WSA]) === 1,
    "staff CAN read workflows");
  assert(await denied(pg, `insert into public.workflows (workspace_id,name,trigger_type) values ($1,'x','manual')`, [WSA]),
    "staff CANNOT create a workflow (manager+)");
  assert((await pg.query(`update public.workflows set is_active=false where id=$1`, [WF])).affectedRows === 0,
    "staff CANNOT toggle a workflow (0 rows — manager+)");
  await reset(); await as(CLIENT_A);
  assert(await count(pg, `select count(*)::int n from public.workflows where workspace_id=$1`, [WSA]) === 0,
    "client CANNOT even read workflows (internal-ops ceiling)");
  await reset(); await as(MANAGER_A);
  const mWf = (await pg.query(`insert into public.workflows (workspace_id,name,trigger_type) values ($1,'Mgr WF','manual') returning id`, [WSA])).rows[0].id;
  assert(!!mWf, "manager CAN create a workflow");
  assert((await pg.query(`update public.workflows set is_active=true where id=$1`, [mWf])).affectedRows === 1,
    "manager CAN activate a workflow");

  // ── 3. Queued-only / system-written ledger (Gate-4) ──────────────────────────
  console.log("\nM13 · executions + steps are system-written (browser cannot insert):");
  await reset(); await as(MANAGER_A);
  assert(await denied(pg, `insert into public.workflow_executions (workspace_id,workflow_id,workflow_version,status) values ($1,$2,1,'running')`, [WSA, WF]),
    "even a manager CANNOT insert a workflow_execution directly (no policy)");
  assert(await denied(pg, `insert into public.workflow_execution_steps (workspace_id,execution_id,node_id,node_type,status) values ($1,gen_random_uuid(),'a','add_tag','success')`, [WSA]),
    "manager CANNOT insert a step directly (no policy)");

  // ── 4. emit_trigger enrolment + trigger_config narrowing ─────────────────────
  console.log("\nM13 · emit_trigger enrols matches + trigger_config narrows:");
  await reset();
  let before = await execCount(WSA);
  const made = await count(pg, `select public.emit_trigger($1,'contact.created', jsonb_build_object('contact_id','${CONTACT_A2}')) n`, [WSA]);
  assert(made === 1, "emit_trigger enrolled exactly 1 (the active Welcome WF)");
  assert(await execCount(WSA) === before + 1, "one workflow_execution row created");
  assert(await count(pg, `select count(*)::int n from public.jobs where type='automation.execute' and workspace_id=$1`, [WSA]) >= 1,
    "an automation.execute job was enqueued (Gate-4)");
  // add a narrowed tag.added WF (only fires for TAG_VIP)
  await pg.exec(`insert into public.workflows (workspace_id,name,trigger_type,trigger_config,is_active,reentry_rule)
    values ('${WSA}','On VIP','tag.added','{"tag_id":"${TAG_VIP}"}'::jsonb,true,'allow');`);
  const noMatch = await count(pg, `select public.emit_trigger($1,'tag.added', jsonb_build_object('contact_id','${CONTACT_A}','tag_id','00000000-0000-0000-0000-0000000000ff')) n`, [WSA]);
  assert(noMatch === 0, "trigger_config {tag_id} narrows: a different tag does NOT enrol");
  const match = await count(pg, `select public.emit_trigger($1,'tag.added', jsonb_build_object('contact_id','${CONTACT_A}','tag_id','${TAG_VIP}')) n`, [WSA]);
  assert(match === 1, "trigger_config {tag_id} matches: the VIP tag enrols");

  // ── 5. Re-entry rules + concurrency guard ────────────────────────────────────
  console.log("\nM13 · re-entry rules (once / allow / once_per_days) + concurrency guard:");
  // 'once' Welcome WF: CONTACT_A2 already enrolled in step 4 → second emit blocked
  const second = await count(pg, `select public.emit_trigger($1,'contact.created', jsonb_build_object('contact_id','${CONTACT_A2}')) n`, [WSA]);
  assert(second === 0, "'once' rule: an already-enrolled contact does NOT re-enrol");
  // 'allow' VIP WF: same contact+tag can enrol repeatedly
  const allowAgain = await count(pg, `select public.emit_trigger($1,'tag.added', jsonb_build_object('contact_id','${CONTACT_A}','tag_id','${TAG_VIP}')) n`, [WSA]);
  assert(allowAgain === 1, "'allow' rule: the same contact re-enrols");
  // once_per_days:7
  await pg.exec(`insert into public.workflows (id,workspace_id,name,trigger_type,is_active,reentry_rule)
    values ('f0000000-0000-0000-0000-0000000000dd','${WSA}','Weekly','contact.created',true,'once_per_days:7');`);
  const w1 = await count(pg, `select public.emit_trigger($1,'contact.created', jsonb_build_object('contact_id','${CONTACT_A}')) n`, [WSA]);
  // (Welcome 'once' also matches CONTACT_A first time → w1 counts both; assert the weekly one enrolled)
  assert(await count(pg, `select count(*)::int n from public.workflow_executions where workflow_id='f0000000-0000-0000-0000-0000000000dd' and contact_id='${CONTACT_A}'`, []) === 1,
    "once_per_days: first enrolment happens");
  const w2 = await count(pg, `select count(*)::int n from public.workflow_executions where workflow_id='f0000000-0000-0000-0000-0000000000dd'`, []);
  await pg.query(`select public.emit_trigger($1,'contact.created', jsonb_build_object('contact_id','${CONTACT_A}'))`, [WSA]);
  assert(await count(pg, `select count(*)::int n from public.workflow_executions where workflow_id='f0000000-0000-0000-0000-0000000000dd'`, []) === w2,
    "once_per_days:7 blocks a re-enrol inside the window");

  // ── 6. Source triggers (real inputs to the bus) ──────────────────────────────
  console.log("\nM13 · source triggers wire the bus to real tables:");
  before = await execCount(WSA);
  await pg.exec(`insert into public.contacts (workspace_id,first_name,source) values ('${WSA}','Trigger','manual');`);
  assert(await execCount(WSA) > before, "inserting a contact fires contact.created → enrols");
  // deal.stage_changed via a human move (auth.uid set) — seed an active WF first
  await pg.exec(`insert into public.workflows (workspace_id,name,trigger_type,is_active,reentry_rule) values ('${WSA}','On stage','deal.stage_changed',true,'allow');`);
  before = await execCount(WSA);
  await as(MANAGER_A);
  await pg.query(`update public.deals set stage_id=$1 where id=$2`, [S2, DEAL_A]);
  assert(await execCount(WSA) === before + 1, "moving a deal's stage fires deal.stage_changed → enrols");
  // loop guard: automation_apply_move_deal must NOT re-emit
  await reset();
  before = await execCount(WSA);
  await pg.query(`select public.automation_apply_move_deal($1,$2,$3)`, [WSA, DEAL_A, S1]);
  assert(await execCount(WSA) === before, "automation_apply_move_deal does NOT re-emit (loop guard holds)");
  assert(await count(pg, `select count(*)::int n from public.activity_log where type='deal_change' and metadata->>'via'='automation'`, []) === 1,
    "automation move logs a 'deal_change' activity tagged via=automation");
  // message.received: inbound enrols, outbound does not
  await pg.exec(`insert into public.workflows (workspace_id,name,trigger_type,is_active,reentry_rule) values ('${WSA}','On msg','message.received',true,'allow');`);
  before = await execCount(WSA);
  await pg.exec(`insert into public.messages (workspace_id,conversation_id,direction,channel,content) values ('${WSA}','${CONV_A}','outbound','sms','hi');`);
  assert(await execCount(WSA) === before, "an OUTBOUND message does NOT enrol");
  await pg.exec(`insert into public.messages (workspace_id,conversation_id,direction,channel,content) values ('${WSA}','${CONV_A}','inbound','sms','hello');`);
  assert(await execCount(WSA) === before + 1, "an INBOUND message fires message.received → enrols");

  // ── 7. Version pinning — a live edit can't corrupt a running execution ────────
  console.log("\nM13 · version pinning (edit-safe running executions, AC-3):");
  const pinnedVer = (await pg.query(`select workflow_version from public.workflow_executions where workflow_id=$1 order by started_at limit 1`, [WF])).rows[0].workflow_version;
  const v1nodes = (await pg.query(`select nodes from public.workflow_versions where workflow_id=$1 and version=$2`, [WF, pinnedVer])).rows[0].nodes;
  await pg.exec(`update public.workflows set nodes='[{"id":"t","type":"trigger"},{"id":"b","type":"send_email"}]' where id='${WF}';`);
  const newVer = (await pg.query(`select version from public.workflows where id=$1`, [WF])).rows[0].version;
  assert(newVer === pinnedVer + 1, "editing nodes bumps the workflow version");
  assert(await count(pg, `select count(*)::int n from public.workflow_versions where workflow_id=$1 and version=$2`, [WF, newVer]) === 1,
    "the new version is snapshotted into workflow_versions");
  const v1after = (await pg.query(`select nodes from public.workflow_versions where workflow_id=$1 and version=$2`, [WF, pinnedVer])).rows[0].nodes;
  assert(JSON.stringify(v1after) === JSON.stringify(v1nodes),
    "the OLD version snapshot is unchanged → a running execution still walks v" + pinnedVer);

  // ── 8. Templates — global read + own-workspace save ──────────────────────────
  console.log("\nM13 · templates — global read, own-workspace save, no fake globals:");
  await as(MANAGER_A);
  assert(await count(pg, `select count(*)::int n from public.workflow_templates where is_global`, []) >= 1, "manager reads global templates");
  const ownTpl = (await pg.query(`insert into public.workflow_templates (workspace_id,name,category,trigger_type,is_global) values ($1,'My tpl','custom','manual',false) returning id`, [WSA])).rows[0].id;
  assert(!!ownTpl, "manager CAN save an own-workspace (non-global) template");
  assert(await denied(pg, `insert into public.workflow_templates (workspace_id,name,category,trigger_type,is_global) values ($1,'Fake global','x','manual',true)`, [WSA]),
    "manager CANNOT insert a GLOBAL template (is_global forced false by policy)");

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M13 probe: ${pass} passed, ${fail} failed\x1b[0m`);
  await pg.close();
  process.exitCode = fail === 0 ? 0 : 1;
}
main().catch((e) => { console.error("harness error:", e); process.exitCode = 2; });
