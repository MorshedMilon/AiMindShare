// m05probe.mjs — verify the M05 Compliance & Consent slice on REAL Postgres
// (PGlite, no Docker). Proves the DoD gates that can be checked without a live
// stack: Gate-1 tenancy (B cannot reach A's compliance rows), the APPEND-ONLY
// consent ledger (nobody can edit/erase a consent record), Gate-2 role matrix +
// client ceiling (staff read, admin configure A2P, client blocked), and Gate-4
// async (the browser can enqueue a gdpr.export job as 'queued' but never
// 'running'; the worker then claims it).
//
//   node workers/verify/m05probe.mjs        (after `npm install`)
//
// Exit 0 = all assertions passed; 1 = a failure/leak was detected.
//
// Harness stubs (identical spirit to m01/m02probe): auth.users + auth.uid(), the
// authenticated/service_role roles the migrations grant to, and direct membership
// seeding (no create_workspace RPC needed — M05 only leans on tenancy 0001).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const OWNER_A = "11111111-1111-1111-1111-111111111111";
const ADMIN_A = "22222222-2222-2222-2222-222222222222";
const STAFF_A = "66666666-6666-6666-6666-666666666666";
const CLIENT_A = "77777777-7777-7777-7777-777777777777";
const OWNER_B = "33333333-3333-3333-3333-333333333333";
const STAFF_B = "44444444-4444-4444-4444-444444444444"; // agency B staff (the attacker)

const WSA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WSB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

const load = (n) => readFileSync(join(MIG, n), "utf8")
  .split("\n").filter((l) => !/^\s*create\s+extension/i.test(l)).join("\n");

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

  for (const m of ["0000_extensions_enums.sql", "0001_tenancy.sql", "0002_jobs.sql", "0010_m05_compliance.sql"]) {
    await pg.exec(load(m));
  }
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);

  // ── Seed two agencies + members (superuser context bypasses RLS) ────────────
  await pg.exec(`
    insert into auth.users (id,email) values
      ('${OWNER_A}','owner.a@aimindshare.test'),('${ADMIN_A}','admin.a@aimindshare.test'),
      ('${STAFF_A}','staff.a@aimindshare.test'),('${CLIENT_A}','client.a@aimindshare.test'),
      ('${OWNER_B}','owner.b@aimindshare.test'),('${STAFF_B}','staff.b@aimindshare.test')
    on conflict (id) do nothing;
    insert into public.profiles (id,email,name) values
      ('${OWNER_A}','owner.a@aimindshare.test','Owner A'),('${ADMIN_A}','admin.a@aimindshare.test','Admin A'),
      ('${STAFF_A}','staff.a@aimindshare.test','Staff A'),('${CLIENT_A}','client.a@aimindshare.test','Client A'),
      ('${OWNER_B}','owner.b@aimindshare.test','Owner B'),('${STAFF_B}','staff.b@aimindshare.test','Staff B')
    on conflict (id) do nothing;
    insert into public.workspaces (id,owner_id,name,slug) values
      ('${WSA}','${OWNER_A}','Acme Agency','acme'),('${WSB}','${OWNER_B}','Beacon Media','beacon');
    insert into public.memberships (workspace_id,user_id,role,status) values
      ('${WSA}','${OWNER_A}','owner','active'),('${WSA}','${ADMIN_A}','admin','active'),
      ('${WSA}','${STAFF_A}','staff','active'),('${WSA}','${CLIENT_A}','client','active'),
      ('${WSB}','${OWNER_B}','owner','active'),('${WSB}','${STAFF_B}','staff','active');

    -- Seed one row of each compliance table in BOTH workspaces (targets to reach).
    insert into public.consent_records (workspace_id,kind,granted,source) values
      ('${WSA}','sms_optin',true,'manual'),('${WSB}','sms_optin',true,'manual');
    insert into public.a2p_registrations (workspace_id,brand_status,campaign_status) values
      ('${WSA}','pending','not_started'),('${WSB}','pending','not_started');
    insert into public.gdpr_requests (workspace_id,kind,request_type,status,due_at) values
      ('${WSA}','gdpr_export','access','pending', now()+interval '30 days'),
      ('${WSB}','gdpr_export','access','pending', now()+interval '30 days');
  `);

  const as = (sub) => pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);

  // ── 1. Cross-tenant isolation — B's staff cannot reach A (Gate-1) ───────────
  console.log("\nM05 · cross-tenant isolation (agency B staff attacking agency A):");
  await as(STAFF_B);
  assert(await count(pg, `select count(*)::int n from public.consent_records where workspace_id=$1`, [WSA]) === 0,
    "B cannot SELECT A's consent_records");
  assert(await count(pg, `select count(*)::int n from public.a2p_registrations where workspace_id=$1`, [WSA]) === 0,
    "B cannot SELECT A's a2p_registrations");
  assert(await count(pg, `select count(*)::int n from public.gdpr_requests where workspace_id=$1`, [WSA]) === 0,
    "B cannot SELECT A's gdpr_requests");
  assert(await denied(pg, `insert into public.consent_records (workspace_id,kind,granted) values ($1,'sms_optin',false)`, [WSA]),
    "B cannot INSERT a consent record into A");
  assert(await denied(pg, `insert into public.a2p_registrations (workspace_id) values ($1)`, [WSA]),
    "B cannot INSERT an a2p registration into A");
  assert((await pg.query(`update public.a2p_registrations set brand_status='HIJACK' where workspace_id=$1`, [WSA])).affectedRows === 0,
    "B cannot UPDATE A's a2p registration (0 rows)");
  assert(await count(pg, `select count(*)::int n from public.consent_records where workspace_id=$1`, [WSB]) === 1,
    "B CAN SELECT its own consent_records (positive control)");

  // ── 2. Append-only consent ledger — immutable once written ──────────────────
  console.log("\nM05 · consent_records is an append-only ledger (immutable):");
  await reset(); await as(STAFF_A);
  const cid = (await pg.query(
    `insert into public.consent_records (workspace_id,kind,granted,source) values ($1,'email_optin',true,'manual') returning id`, [WSA])).rows[0].id;
  assert(!!cid, "staff CAN INSERT a consent record (write path works)");
  assert((await pg.query(`update public.consent_records set granted=false where id=$1`, [cid])).affectedRows === 0,
    "nobody can UPDATE a consent record (0 rows — no update policy)");
  assert((await pg.query(`delete from public.consent_records where id=$1`, [cid])).affectedRows === 0,
    "nobody can DELETE a consent record (0 rows — no delete policy)");

  // ── 3. Role matrix + client ceiling (Gate-2) ────────────────────────────────
  console.log("\nM05 · role matrix — A2P config is admin+, client is walled off:");
  await reset(); await as(STAFF_A);
  assert((await pg.query(`update public.a2p_registrations set brand_status='approved' where workspace_id=$1`, [WSA])).affectedRows === 0,
    "staff CANNOT configure A2P (update 0 rows — admin+ only)");
  assert(await denied(pg, `insert into public.a2p_registrations (workspace_id) values ($1)`, [WSA]),
    "staff CANNOT create a second A2P registration (admin+ only)");
  await reset(); await as(ADMIN_A);
  assert((await pg.query(`update public.a2p_registrations set brand_status='approved', campaign_status='approved' where workspace_id=$1`, [WSA])).affectedRows === 1,
    "admin CAN configure A2P (update 1 row)");
  await reset(); await as(CLIENT_A);
  assert(await count(pg, `select count(*)::int n from public.consent_records where workspace_id=$1`, [WSA]) === 0,
    "client CANNOT read the consent ledger (ceiling — select is staff+)");
  assert(await count(pg, `select count(*)::int n from public.gdpr_requests where workspace_id=$1`, [WSA]) === 0,
    "client CANNOT read data-subject requests (ceiling)");
  assert(await denied(pg, `insert into public.gdpr_requests (workspace_id,kind,request_type,status) values ($1,'gdpr_export','access','pending')`, [WSA]),
    "client CANNOT create a GDPR request (staff+ only)");

  // ── 4. Async — GDPR intake enqueues a queued job; running is blocked (Gate-4) ─
  console.log("\nM05 · GDPR intake → queued job; browser can't seed 'running':");
  await reset(); await as(STAFF_A);
  const rid = (await pg.query(
    `insert into public.gdpr_requests (workspace_id,kind,request_type,status,due_at)
     values ($1,'gdpr_export','access','pending', now()+interval '30 days') returning id`, [WSA])).rows[0].id;
  assert(!!rid, "staff CAN create a GDPR request (status pending)");
  assert(await denied(pg, `insert into public.gdpr_requests (workspace_id,kind,request_type,status) values ($1,'gdpr_export','access','completed')`, [WSA]),
    "browser CANNOT seed a non-pending GDPR request (pending-only check)");
  const jid = (await pg.query(
    `insert into public.jobs (workspace_id,type,payload,status) values ($1,'gdpr.export',$2::jsonb,'queued') returning id`,
    [WSA, JSON.stringify({ request_id: rid })])).rows[0].id;
  assert(!!jid, "staff CAN enqueue a gdpr.export job (status queued)");
  assert(await denied(pg, `insert into public.jobs (workspace_id,type,status) values ($1,'gdpr.export','running')`, [WSA]),
    "browser CANNOT enqueue a 'running' job (queued-only enforced)");

  // Worker claims it (service-role path, no auth.uid()).
  await reset();
  const claimed = (await pg.query(`select * from public.claim_job('worker-m05')`)).rows[0];
  assert(claimed && claimed.status === "running" && claimed.type === "gdpr.export",
    "worker claim_job flips the gdpr.export job queued → running");

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M05 probe: ${pass} passed, ${fail} failed\x1b[0m`);
  await pg.close();
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((e) => { console.error("harness error:", e); process.exitCode = 2; });
