// m00probe.mjs — verify the M00 Auth & Identity DB slice on REAL Postgres (PGlite, no Docker).
// Proves the Session 1 "Accept when" DB criterion (profiles auto-created on signup) and the
// identity-scoped isolation of the new auth_events ledger. Loads migrations 0000, 0001, 0006
// into PGlite and exercises the handle_new_user() trigger + auth_events RLS for real.
//
//   node workers/verify/m00probe.mjs        (after `npm install`)
//
// Exit code 0 = all assertions passed; 1 = a failure/leak was detected.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const SIGNUP = "99999999-9999-9999-9999-999999999999"; // brand-new user for the trigger test

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

// Strip Supabase-only extension lines; RLS/tables/triggers are pure Postgres.
const load = (n) => readFileSync(join(MIG, n), "utf8")
  .split("\n").filter((l) => !/^\s*create\s+extension/i.test(l)).join("\n");

const count = async (pg, sql, params) => Number((await pg.query(sql, params)).rows[0].n);

async function main() {
  const pg = new PGlite();

  // ── Bootstrap the Supabase-shaped surface the migrations expect ─────────────
  // auth.users carries raw_user_meta_data so the handle_new_user() trigger has
  // the signup metadata (name/avatar) to mirror into public.profiles.
  await pg.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role authenticated nologin;
    grant usage on schema public to authenticated;
  `);

  for (const m of ["0000_extensions_enums.sql", "0001_tenancy.sql", "0006_m00_auth.sql"]) {
    await pg.exec(load(m));
  }
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);

  const impersonate = (sub) =>
    pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);

  // ── 1. profiles auto-create trigger (the "Accept when" DB criterion) ────────
  console.log("\nM00 · profiles auto-create trigger:");
  await pg.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${SIGNUP}','new.user@aimindshare.test',
       '{"name":"New User","avatar_url":"https://cdn/av.png"}'::jsonb);
  `);
  const prof = (await pg.query(
    `select email, name, avatar_url from public.profiles where id=$1`, [SIGNUP])).rows[0];
  assert(!!prof, "signup auto-creates a public.profiles row");
  assert(prof && prof.email === "new.user@aimindshare.test", "profile email mirrors auth.users");
  assert(prof && prof.name === "New User", "profile name pulled from signup metadata");
  assert(prof && prof.avatar_url === "https://cdn/av.png", "profile avatar pulled from signup metadata");

  // ── Seed two identities + one auth_event each (via the definer RPC) ─────────
  await pg.exec(`
    insert into auth.users (id,email) values
      ('${USER_A}','a@aimindshare.test'),('${USER_B}','b@aimindshare.test')
    on conflict (id) do nothing;
  `);
  await impersonate(USER_A);
  await pg.query(`select public.log_auth_event('login_success','{}'::jsonb)`);
  await reset();
  await impersonate(USER_B);
  await pg.query(`select public.log_auth_event('login_success','{}'::jsonb)`);

  // ── 2. auth_events isolation (self-scoped, append-only) ─────────────────────
  console.log("\nM00 · auth_events identity isolation (impersonating user B):");
  assert(await count(pg, `select count(*)::int n from public.auth_events where user_id=$1`, [USER_A]) === 0,
    "B cannot SELECT A's auth_events");
  assert(await count(pg, `select count(*)::int n from public.auth_events where user_id=$1`, [USER_B]) === 1,
    "B CAN SELECT its own auth_events (positive control)");

  let leaked = false;
  try { await pg.query(`insert into public.auth_events (user_id,type) values ($1,'forged')`, [USER_A]); leaked = true; }
  catch { /* denied — no client insert policy */ }
  assert(!leaked, "B cannot directly INSERT an auth_event (no client insert policy)");

  const upd = await pg.query(`update public.auth_events set type='tamper' where user_id=$1`, [USER_B]);
  assert((upd.affectedRows ?? 0) === 0, "append-only: B cannot UPDATE its own auth_events");

  // ── 3. profiles remain self-scoped ──────────────────────────────────────────
  assert(await count(pg, `select count(*)::int n from public.profiles where id=$1`, [USER_A]) === 0,
    "B cannot SELECT A's profile (self-only)");
  await reset();

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M00 probe: ${pass} passed, ${fail} failed\x1b[0m`);
  await pg.close();                     // graceful teardown (avoids a PGlite/libuv exit race on Windows)
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((e) => { console.error("harness error:", e); process.exitCode = 2; });
