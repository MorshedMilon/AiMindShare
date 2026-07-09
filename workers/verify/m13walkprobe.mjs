// m13walkprobe.mjs — run the REAL automation walker (workers/automation.mjs) against
// REAL Postgres (PGlite) through a minimal supabase-js-shaped adapter. Proves the
// execution engine end-to-end (accept-when: "executions run as jobs with step logs;
// IF/ELSE + wait"):
//   · add_tag writes a real contact_tags row (creating the tag)
//   · IF/ELSE evaluates the operator against live contact context + follows the edge
//   · internal_notification calls the real notify() RPC
//   · WAIT sets status 'waiting', pins the resume node, enqueues a delayed
//     automation.execute job (run_after in the future)
//   · resuming the job walks from the pinned node → GOAL met → 'completed'
//   · every node logged a workflow_execution_steps row (green/red timeline)
//   · a terminal execution is idempotent; a test run suppresses sends
//
//   node workers/verify/m13walkprobe.mjs
//
// Exit 0 = all passed. The adapter implements only the calls the walker makes.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createAutomationEngine } from "../automation.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");
const load = (n) => readFileSync(join(MIG, n), "utf8").split("\n")
  .filter((l) => !/^\s*create\s+extension/i.test(l)).filter((l) => !/gin_trgm_ops/i.test(l)).join("\n");

let pass = 0, fail = 0;
const assert = (c, l) => c ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
                            : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

// ── Minimal supabase-js adapter over PGlite (service-role → superuser, bypasses RLS) ─
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);
const jcols = new Set(["result", "payload", "trigger_payload", "stats"]); // jsonb columns the walker writes
function makeAdapter(pg) {
  function builder(table) {
    const st = { table, op: "select", cols: "*", filters: [], data: null, ret: null, onConflict: null, limit: null };
    const api = {
      select(c) { if (st.op === "select") st.cols = c; else st.ret = c; return api; },
      eq(c, v) { st.filters.push([c, v]); return api; },
      ilike(c, v) { st.filters.push([c, v, "ilike"]); return api; },
      limit(n) { st.limit = n; return api; },
      insert(d) { st.op = "insert"; st.data = d; return api; },
      update(d) { st.op = "update"; st.data = d; return api; },
      upsert(d, o) { st.op = "upsert"; st.data = d; st.onConflict = o?.onConflict || null; return api; },
      delete() { st.op = "delete"; return api; },
      async single() { const r = await exec(); return { data: r.rows[0] ?? null, error: null }; },
      async maybeSingle() { const r = await exec(); return { data: r.rows[0] ?? null, error: null }; },
      then(res, rej) { return exec().then((r) => res({ data: r.rows, error: null }), rej); },
    };
    const params = [];
    const ph = (v) => { params.push(v); return `$${params.length}`; };
    const val = (k, v) => (jcols.has(k) && (isObj(v) || Array.isArray(v))) ? `${ph(JSON.stringify(v))}::jsonb` : ph(v);
    const where = () => st.filters.length
      ? " where " + st.filters.map(([c, v, o]) => o === "ilike" ? `${c} ilike ${ph(v)}` : `${c}=${ph(v)}`).join(" and ") : "";
    async function exec() {
      let sql;
      if (st.table === "contact_tags" && st.op === "select" && /tags\s*\(/.test(st.cols)) {
        // special join: select("tag_id, tags(name)")
        sql = `select ct.tag_id, t.name as tagname from public.contact_tags ct join public.tags t on t.id=ct.tag_id${
          st.filters.length ? " where " + st.filters.map(([c, v]) => `ct.${c}=${ph(v)}`).join(" and ") : ""}`;
        const r = await pg.query(sql, params);
        return { rows: r.rows.map((x) => ({ tag_id: x.tag_id, tags: { name: x.tagname } })) };
      }
      if (st.op === "select") sql = `select ${st.cols} from public.${st.table}${where()}${st.limit ? ` limit ${st.limit}` : ""}`;
      else if (st.op === "insert") {
        const ks = Object.keys(st.data);
        sql = `insert into public.${st.table} (${ks.join(",")}) values (${ks.map((k) => val(k, st.data[k])).join(",")})${st.ret ? ` returning ${st.ret}` : ""}`;
      } else if (st.op === "upsert") {
        const ks = Object.keys(st.data);
        const conflict = st.onConflict ? `(${st.onConflict})` : "";
        const upd = ks.filter((k) => !String(st.onConflict || "").split(",").includes(k)).map((k) => `${k}=excluded.${k}`).join(",");
        sql = `insert into public.${st.table} (${ks.join(",")}) values (${ks.map((k) => val(k, st.data[k])).join(",")}) on conflict ${conflict} do ${upd ? `update set ${upd}` : "nothing"}`;
      } else if (st.op === "update") {
        const ks = Object.keys(st.data);
        sql = `update public.${st.table} set ${ks.map((k) => `${k}=${val(k, st.data[k])}`).join(",")}${where()}${st.ret ? ` returning ${st.ret}` : ""}`;
      } else if (st.op === "delete") sql = `delete from public.${st.table}${where()}`;
      return pg.query(sql, params);
    }
    return api;
  }
  async function rpc(name, p) {
    if (name === "notify") {
      const arr = "{" + (p.p_targets || []).join(",") + "}";
      const r = await pg.query(`select public.notify($1,$2::text[],$3,$4,$5,$6::jsonb) as data`,
        [p.p_workspace, arr, p.p_type, p.p_title, p.p_body, JSON.stringify(p.p_data || {})]);
      return { data: r.rows[0].data, error: null };
    }
    if (name === "automation_apply_move_deal") {
      await pg.query(`select public.automation_apply_move_deal($1,$2,$3)`, [p.p_ws, p.p_deal, p.p_stage]);
      return { data: null, error: null };
    }
    throw new Error(`adapter: unhandled rpc ${name}`);
  }
  return { from: builder, rpc };
}

const WSA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OWNER_A = "11111111-1111-1111-1111-111111111111";
const CONTACT = "d1111111-1111-1111-1111-111111111111";

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
                   "0011_m04_notifications.sql", "0010_m05_compliance.sql", "0013_m09_crm.sql",
                   "0014_m11_pipeline.sql", "0015_m12_inbox.sql", "0016_m13_automations.sql"]) {
    await pg.exec(load(m));
  }
  await pg.exec(`
    insert into auth.users (id,email) values ('${OWNER_A}','o@t');
    insert into public.profiles (id,email,name) values ('${OWNER_A}','o@t','O');
    insert into public.workspaces (id,owner_id,name,slug) values ('${WSA}','${OWNER_A}','Acme','acme');
    insert into public.memberships (workspace_id,user_id,role,status) values ('${WSA}','${OWNER_A}','owner','active');
    insert into public.contacts (id,workspace_id,first_name,email,lead_score,source)
      values ('${CONTACT}','${WSA}','Yusuf','y@ex.com',50,'manual');
  `);

  // A rich graph: trigger → add_tag → if_else(lead_score>0) --true--> notify → wait(2d) → goal(email set)
  //                                                           --false--> send_email
  const nodes = [
    { id: "t", type: "trigger" },
    { id: "a", type: "add_tag", config: { tag_name: "VIP" } },
    { id: "c", type: "if_else", config: { field: "lead_score", operator: "greater_than", value: 0 } },
    { id: "n", type: "internal_notification", config: { targets: ["all"], title: "Hot lead", body: "score>0" } },
    { id: "w", type: "wait", config: { amount: 2, unit: "days" } },
    { id: "g", type: "goal", config: { field: "email", operator: "is_set" } },
    { id: "e", type: "send_email", config: { subject: "Hi" } },
  ];
  const edges = [
    { source: "t", target: "a" }, { source: "a", target: "c" },
    { source: "c", target: "n", sourceHandle: "true" }, { source: "c", target: "e", sourceHandle: "false" },
    { source: "n", target: "w" }, { source: "w", target: "g" },
  ];
  await pg.query(`insert into public.workflows (id,workspace_id,name,trigger_type,is_active,reentry_rule,nodes,edges)
    values ('f0000000-0000-0000-0000-000000000001','${WSA}','Walk','contact.created',true,'allow',$1::jsonb,$2::jsonb)`,
    [JSON.stringify(nodes), JSON.stringify(edges)]);
  // enrol an execution via emit_trigger (uses the pinned version + real job)
  await pg.query(`select public.emit_trigger('${WSA}','contact.created', jsonb_build_object('contact_id','${CONTACT}'))`);
  const execId = (await pg.query(`select id from public.workflow_executions limit 1`)).rows[0].id;

  const db = makeAdapter(pg);
  const { automationExecute } = createAutomationEngine(db);

  console.log("\nM13 walker · first pass (trigger → add_tag → if_else[true] → notify → wait):");
  const r1 = await automationExecute({ payload: { execution_id: execId, workspace_id: WSA } });
  assert(r1.paused_until != null, "walker paused at the WAIT node");
  assert(await one(pg, `select count(*)::int n from public.contact_tags where contact_id='${CONTACT}'`) === 1,
    "add_tag wrote a real contact_tags row");
  assert(await one(pg, `select count(*)::int n from public.tags where workspace_id='${WSA}' and name='VIP'`) === 1,
    "the VIP tag was created on demand");
  assert(await one(pg, `select count(*)::int n from public.workflow_execution_steps where execution_id='${execId}' and node_id='c' and result->>'branch'='true'`) === 1,
    "IF/ELSE evaluated lead_score>0 → TRUE branch logged");
  assert(await one(pg, `select count(*)::int n from public.notifications where workspace_id='${WSA}' and type='automation.alert'`) === 1,
    "internal_notification called the real notify() RPC (1 feed row)");
  assert(await one(pg, `select count(*)::int n from public.workflow_executions where id='${execId}' and status='waiting'`) === 1,
    "execution is now 'waiting'");
  assert(await one(pg, `select count(*)::int n from public.jobs where type='automation.execute' and run_after > now()`) === 1,
    "a delayed resume job was enqueued (run_after in the future — the wait delay)");
  const resumeNode = (await pg.query(`select current_node_id from public.workflow_executions where id='${execId}'`)).rows[0].current_node_id;
  assert(resumeNode === "g", "resume is pinned to the wait's successor (goal 'g')");

  console.log("\nM13 walker · resume pass (wait elapsed → goal met → completed):");
  const r2 = await automationExecute({ payload: { execution_id: execId, workspace_id: WSA } });
  assert(r2.completed === "goal_met" || r2.status === "completed", "resume walked to GOAL and completed");
  assert(await one(pg, `select count(*)::int n from public.workflow_executions where id='${execId}' and status='completed'`) === 1,
    "execution status is 'completed'");
  assert(await one(pg, `select count(*)::int n from public.workflow_execution_steps where execution_id='${execId}'`) >= 5,
    "≥5 step rows logged across the two passes (green/red timeline)");

  console.log("\nM13 walker · idempotency + test-mode send suppression:");
  const r3 = await automationExecute({ payload: { execution_id: execId, workspace_id: WSA } });
  assert(r3.idempotent === true, "re-running a completed execution is idempotent (no double side effects)");
  // a second contact with lead_score 0 → if_else FALSE → send_email (stub, suppressed)
  await pg.query(`insert into public.contacts (id,workspace_id,first_name,lead_score,source) values ('d2222222-2222-2222-2222-222222222222','${WSA}','Zero',0,'manual')`);
  await pg.query(`select public.emit_trigger('${WSA}','contact.created', jsonb_build_object('contact_id','d2222222-2222-2222-2222-222222222222'))`);
  const ex2 = (await pg.query(`select id from public.workflow_executions where contact_id='d2222222-2222-2222-2222-222222222222'`)).rows[0].id;
  await pg.query(`update public.workflow_executions set is_test=true where id='${ex2}'`);
  await automationExecute({ payload: { execution_id: ex2, workspace_id: WSA } });
  assert(await one(pg, `select count(*)::int n from public.workflow_execution_steps where execution_id='${ex2}' and node_id='c' and result->>'branch'='false'`) === 1,
    "second contact (lead_score 0) took the FALSE branch");
  assert(await one(pg, `select count(*)::int n from public.workflow_execution_steps where execution_id='${ex2}' and node_type='send_email' and result->>'suppressed'='true'`) === 1,
    "send_email was suppressed (test-mode + provider-pending stub) — Gate-3: nothing metered");

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M13 walker probe: ${pass} passed, ${fail} failed\x1b[0m`);
  await pg.close();
  process.exitCode = fail === 0 ? 0 : 1;
}
const one = async (pg, sql) => Number((await pg.query(sql)).rows[0].n);
main().catch((e) => { console.error("harness error:", e); process.exitCode = 2; });
