// leakprobe.mjs — AiMindShare cross-tenant leak probe on REAL Postgres, no Docker.
// Runs the tenancy migrations (0000–0002) inside PGlite (Postgres compiled to
// WASM), seeds two workspaces, then impersonates workspace B's staff via
// `SET ROLE authenticated` + a JWT-sub GUC and asserts every cross-tenant
// operation is denied. This is the same RLS the hosted Supabase enforces.
//
//   node workers/verify/leakprobe.mjs        (after `npm install`)
//
// Exit code 0 = all assertions passed; 1 = a leak/failure was detected.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const U = {
  ownerA: "11111111-1111-1111-1111-111111111111",
  staffA: "22222222-2222-2222-2222-222222222222",
  ownerB: "33333333-3333-3333-3333-333333333333",
  staffB: "44444444-4444-4444-4444-444444444444",
};
const WSA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WSB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { pass++; console.log(`  \x1b[32mPASS\x1b[0m  ${label}`); }
  else { fail++; console.log(`  \x1b[31mFAIL\x1b[0m  ${label}`); }
}

// Strip statements PGlite can't run (Supabase-only extensions); RLS/enums/tables
// are all pure Postgres and load unchanged.
function loadMigration(name) {
  const raw = readFileSync(join(MIG, name), "utf8");
  return raw
    .split("\n")
    .filter((l) => !/^\s*create\s+extension/i.test(l))
    .join("\n");
}

async function count(pg, sql, params) {
  const { rows } = await pg.query(sql, params);
  return Number(rows[0].n);
}

async function main() {
  const pg = new PGlite();

  // ── Bootstrap the Supabase-shaped surface the migrations expect ─────────────
  await pg.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key, email text);
    create or replace function auth.uid() returns uuid
      language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
    create role authenticated nologin;
    grant usage on schema public to authenticated;
  `);

  // ── Apply tenancy migrations ────────────────────────────────────────────────
  for (const m of ["0000_extensions_enums.sql", "0001_tenancy.sql", "0002_jobs.sql"]) {
    await pg.exec(loadMigration(m));
  }

  // Grant table/function privileges to the authenticated role (RLS applies on top)
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);

  // ── Seed as superuser (RLS bypassed for bootstrap) ──────────────────────────
  await pg.exec(`
    insert into auth.users (id,email) values
      ('${U.ownerA}','owner.a@t'),('${U.staffA}','staff.a@t'),
      ('${U.ownerB}','owner.b@t'),('${U.staffB}','staff.b@t');
    insert into public.profiles (id,email,name) values
      ('${U.ownerA}','owner.a@t','Owner A'),('${U.staffA}','staff.a@t','Staff A'),
      ('${U.ownerB}','owner.b@t','Owner B'),('${U.staffB}','staff.b@t','Staff B');
    insert into public.workspaces (id,owner_id,name,slug,plan) values
      ('${WSA}','${U.ownerA}','Acme','acme','agency'),
      ('${WSB}','${U.ownerB}','Beacon','beacon','pro');
    insert into public.memberships (workspace_id,user_id,role,status) values
      ('${WSA}','${U.ownerA}','owner','active'),('${WSA}','${U.staffA}','staff','active'),
      ('${WSB}','${U.ownerB}','owner','active'),('${WSB}','${U.staffB}','staff','active');
    insert into public.jobs (workspace_id,type,status) values ('${WSA}','session0.probe','queued');
  `);

  const impersonate = (sub) =>
    pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);

  console.log("\nCross-tenant leak probe (impersonating workspace B staff):");

  // ── Negative: B must not see or touch A ─────────────────────────────────────
  await impersonate(U.staffB);
  assert(await count(pg, `select count(*)::int n from public.workspaces where id=$1`, [WSA]) === 0,
    "B cannot SELECT workspace A");
  assert(await count(pg, `select count(*)::int n from public.memberships where workspace_id=$1`, [WSA]) === 0,
    "B cannot SELECT A's memberships");
  assert(await count(pg, `select count(*)::int n from public.jobs where workspace_id=$1`, [WSA]) === 0,
    "B cannot SELECT A's jobs");

  const upd = await pg.query(`update public.workspaces set name='HIJACK' where id=$1`, [WSA]);
  assert((upd.affectedRows ?? 0) === 0, "B cannot UPDATE workspace A");

  let leaked = false;
  try { await pg.query(`insert into public.jobs (workspace_id,type) values ($1,'x.y')`, [WSA]); leaked = true; }
  catch { /* denied as expected */ }
  assert(!leaked, "B cannot INSERT a job into workspace A");

  leaked = false;
  try { await pg.query(`insert into public.jobs (workspace_id,type,status) values ($1,'x.y','running')`, [WSB]); leaked = true; }
  catch { /* denied as expected */ }
  assert(!leaked, "B cannot INSERT a non-queued job (queued-only enforced)");

  // ── Positive controls: RLS is not blanket-deny ──────────────────────────────
  assert(await count(pg, `select count(*)::int n from public.workspaces where id=$1`, [WSB]) === 1,
    "B CAN SELECT its own workspace B");
  await reset();

  await impersonate(U.staffA);
  let okInsert = false;
  try { await pg.query(`insert into public.jobs (workspace_id,type) values ($1,'session0.probe')`, [WSA]); okInsert = true; }
  catch (e) { console.log("    (unexpected) A staff insert failed:", e.message); }
  assert(okInsert, "A staff CAN INSERT a queued job into workspace A");
  await reset();

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}Leak probe: ${pass} passed, ${fail} failed\x1b[0m`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("harness error:", e); process.exit(2); });
