// jobprobe.mjs — verify the job-queue contract on REAL Postgres (PGlite, no Docker).
// Proves the Session 0 accept criterion "a test queued job is claimed and marked
// done": exercises the atomic claim_job() RPC (queued → running) then the worker's
// completion update (running → done), and that a drained queue claims nothing.
//
//   node workers/verify/jobprobe.mjs        (after `npm install`)
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");
const WSA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OWNER = "11111111-1111-1111-1111-111111111111";

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

const load = (n) => readFileSync(join(MIG, n), "utf8")
  .split("\n").filter((l) => !/^\s*create\s+extension/i.test(l)).join("\n");

async function main() {
  const pg = new PGlite();
  await pg.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key, email text);
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
  `);
  for (const m of ["0000_extensions_enums.sql", "0001_tenancy.sql", "0002_jobs.sql"]) await pg.exec(load(m));

  await pg.exec(`
    insert into auth.users (id,email) values ('${OWNER}','o@t');
    insert into public.profiles (id,email) values ('${OWNER}','o@t');
    insert into public.workspaces (id,owner_id,name,slug) values ('${WSA}','${OWNER}','Acme','acme');
    insert into public.jobs (workspace_id,type,status) values ('${WSA}','session0.probe','queued');
  `);

  console.log("\nJob-queue contract probe (worker service-role path):");

  // 1) claim_job flips exactly one queued job to running with a lease
  const claimed = (await pg.query(`select * from public.claim_job('worker-test')`)).rows[0];
  assert(claimed && claimed.status === "running", "claim_job: queued → running");
  assert(claimed && claimed.locked_by === "worker-test" && claimed.locked_at != null, "claim sets lease (locked_by/locked_at)");
  assert(claimed && claimed.attempts === 1, "claim increments attempts");

  // 2) worker marks it done with a result
  await pg.query(
    `update public.jobs set status='done', result=$1, done_at=now(), updated_at=now() where id=$2`,
    [JSON.stringify({ ok: true, worker: "worker-test" }), claimed.id],
  );
  const done = (await pg.query(`select status, result, done_at from public.jobs where id=$1`, [claimed.id])).rows[0];
  assert(done.status === "done" && done.done_at != null, "worker: running → done (with done_at)");

  // 3) draining the queue claims nothing (returns a null row)
  const empty = (await pg.query(`select id from public.claim_job('worker-test')`)).rows[0];
  assert(!empty.id, "claim_job on empty queue returns nothing");

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}Job probe: ${pass} passed, ${fail} failed\x1b[0m`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error("harness error:", e); process.exit(2); });
