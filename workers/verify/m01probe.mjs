// m01probe.mjs — verify the M01 Workspaces & Multi-Tenancy slice on REAL Postgres
// (PGlite, no Docker). Proves the Session 2 "Accept when" criteria and the tenancy
// wall for every table/RPC M01 introduces. Loads migrations 0000, 0001, 0002, 0007
// into PGlite and exercises the create/provision/invite/transfer/archive RPCs plus
// their RLS for real.
//
//   node workers/verify/m01probe.mjs        (after `npm install`)
//
// Exit code 0 = all assertions passed; 1 = a failure/leak was detected.
//
// Harness stubs (probe-only, same spirit as m00probe stubbing auth.uid()):
//   · auth.users / auth.uid()  — Supabase surface the migrations expect.
//   · public.digest(text,text) — this PGlite build doesn't bundle pgcrypto, so we
//     shim digest() (md5-backed, deterministic) purely so accept_invitation() can
//     hash a token. Production Supabase installs pgcrypto in 0000 and uses real
//     sha256; the shim tests the invitation LOGIC, not the crypto strength.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const OWNER_A  = "11111111-1111-1111-1111-111111111111"; // agency A owner
const ADMIN_A2 = "22222222-2222-2222-2222-222222222222"; // a second admin in agency A
const OWNER_B  = "33333333-3333-3333-3333-333333333333"; // agency B owner (the attacker)
const INVITEE  = "44444444-4444-4444-4444-444444444444"; // accepts an invitation

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

// Strip Supabase-only extension lines; tables/RLS/functions are pure Postgres.
const load = (n) => readFileSync(join(MIG, n), "utf8")
  .split("\n").filter((l) => !/^\s*create\s+extension/i.test(l)).join("\n");

const count = async (pg, sql, params) => Number((await pg.query(sql, params)).rows[0].n);
// Did an operation raise? (RLS insert violations + RPC raises throw in PGlite.)
async function denied(pg, sql, params) {
  try { await pg.query(sql, params); return false; } catch { return true; }
}

async function main() {
  const pg = new PGlite();

  // ── Bootstrap the Supabase-shaped surface the migrations expect ─────────────
  await pg.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    -- pgcrypto shim (see header): deterministic digest so accept_invitation works.
    create or replace function public.digest(text, text) returns bytea
      language sql immutable as $$ select decode(md5($1), 'hex') $$;
    create role authenticated nologin;
    create role service_role nologin;   -- real in Supabase; 0007 grants is_sole_owner to it
    grant usage on schema public to authenticated;
  `);

  for (const m of ["0000_extensions_enums.sql", "0001_tenancy.sql", "0002_jobs.sql", "0007_m01_workspaces.sql"]) {
    await pg.exec(load(m));
  }
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);

  // Four identities. INVITEE's email must match the invitation we issue below.
  await pg.exec(`
    insert into auth.users (id,email) values
      ('${OWNER_A}','owner.a@aimindshare.test'),
      ('${ADMIN_A2}','admin.a2@aimindshare.test'),
      ('${OWNER_B}','owner.b@aimindshare.test'),
      ('${INVITEE}','invitee@aimindshare.test')
    on conflict (id) do nothing;
    insert into public.profiles (id,email,name) values
      ('${OWNER_A}','owner.a@aimindshare.test','Owner A'),
      ('${ADMIN_A2}','admin.a2@aimindshare.test','Admin A2'),
      ('${OWNER_B}','owner.b@aimindshare.test','Owner B'),
      ('${INVITEE}','invitee@aimindshare.test','Invitee')
    on conflict (id) do nothing;
  `);

  const as = (sub) =>
    pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);

  // ── 1. create_workspace: agency + owner membership (THE accept-when) ─────────
  console.log("\nM01 · create_workspace provisions an agency + owner membership:");
  await as(OWNER_A);
  const agencyA = (await pg.query(
    `select id, parent_workspace_id, status, slug from public.create_workspace('Acme Agency')`)).rows[0];
  assert(!!agencyA?.id, "create_workspace returns the new agency row");
  assert(agencyA.parent_workspace_id === null, "agency is top-level (parent_workspace_id is null)");
  assert(agencyA.status === "active", "new workspace defaults to status=active");
  assert(await count(pg, `select count(*)::int n from public.memberships
           where workspace_id=$1 and user_id=$2 and role='owner' and status='active'`,
           [agencyA.id, OWNER_A]) === 1,
    "provisioning created the caller's OWNER membership");
  assert(await count(pg, `select count(*)::int n from public.jobs
           where workspace_id=$1 and type='workspace.provision' and status='queued'`,
           [agencyA.id]) === 1,
    "provisioning enqueued a queued workspace.provision job (defaults deferred to worker)");

  // ── 2. Sub-account + agency reach = explicit membership only ─────────────────
  console.log("\nM01 · sub-account hierarchy + agency reach:");
  const subA = (await pg.query(
    `select id, parent_workspace_id from public.create_workspace(
        'Client One', 'Dental', 'America/Toronto', 'USD', 'en', $1)`, [agencyA.id])).rows[0];
  assert(subA.parent_workspace_id === agencyA.id, "sub-account's parent is the agency");
  assert(await count(pg, `select count(*)::int n from public.memberships
           where workspace_id=$1 and user_id=$2 and role='owner'`, [subA.id, OWNER_A]) === 1,
    "sub-account creator gets an owner membership in the sub-account");

  // Add ADMIN_A2 as an admin of the AGENCY only (not the sub-account).
  await pg.query(`insert into public.memberships (workspace_id,user_id,role,status,invited_by)
                  values ($1,$2,'admin','active',$3)`, [agencyA.id, ADMIN_A2, OWNER_A]);
  await reset();
  await as(ADMIN_A2);
  assert(await count(pg, `select count(*)::int n from public.workspaces where id=$1`, [agencyA.id]) === 1,
    "agency admin can read the agency (positive control)");
  assert(await count(pg, `select count(*)::int n from public.workspaces where id=$1`, [subA.id]) === 0,
    "agency admin canNOT read a sub-account without an explicit membership (RLS §1)");

  // ── 3. Cross-tenant leak: agency B's owner cannot touch agency A ─────────────
  console.log("\nM01 · cross-tenant isolation (impersonating agency B's owner):");
  await reset();
  await as(OWNER_B);
  const agencyB = (await pg.query(`select id from public.create_workspace('Beacon Media')`)).rows[0];
  assert(!!agencyB?.id, "B can create its own agency (positive control)");
  assert(await count(pg, `select count(*)::int n from public.workspaces where id=$1`, [agencyA.id]) === 0,
    "B cannot SELECT A's workspace");
  assert((await pg.query(`update public.workspaces set name='pwned' where id=$1`, [agencyA.id])).affectedRows === 0,
    "B cannot UPDATE A's workspace (0 rows)");
  assert(await count(pg, `select count(*)::int n from public.memberships where workspace_id=$1`, [agencyA.id]) === 0,
    "B cannot SELECT A's memberships");
  assert(await denied(pg, `insert into public.memberships (workspace_id,user_id,role,status)
                           values ($1,$2,'admin','active')`, [agencyA.id, OWNER_B]),
    "B cannot INSERT a membership into A (RLS with_check)");
  assert(await denied(pg, `insert into public.jobs (workspace_id,type,status) values ($1,'x.y','queued')`, [agencyA.id]),
    "B cannot enqueue a job in A (not a member)");

  // ── 4. Invitations: RLS + accept flow ───────────────────────────────────────
  console.log("\nM01 · workspace_invitations RLS + accept:");
  assert(await denied(pg, `insert into public.workspace_invitations (workspace_id,email,role,token_hash,invited_by)
                           values ($1,'x@y.z','staff','hb',$2)`, [agencyA.id, OWNER_B]),
    "B (non-admin) cannot create an invitation in A");
  await reset();
  await as(OWNER_A);
  await pg.query(`insert into public.workspace_invitations (workspace_id,email,role,token_hash,invited_by)
                  values ($1,'invitee@aimindshare.test','manager', encode(digest('rawtoken-abc','sha256'),'hex'), $2)`,
                  [agencyA.id, OWNER_A]);
  assert(await count(pg, `select count(*)::int n from public.workspace_invitations where workspace_id=$1 and status='pending'`,
           [agencyA.id]) === 1, "agency admin created a pending invitation");
  await reset();
  await as(OWNER_B);
  assert(await count(pg, `select count(*)::int n from public.workspace_invitations where workspace_id=$1`, [agencyA.id]) === 0,
    "B cannot SELECT A's invitations");
  // INVITEE redeems the raw token.
  await reset();
  await as(INVITEE);
  const accepted = (await pg.query(`select public.accept_invitation('rawtoken-abc') as ws`)).rows[0];
  assert(accepted.ws === agencyA.id, "accept_invitation returns the workspace id");
  assert(await count(pg, `select count(*)::int n from public.memberships
           where workspace_id=$1 and user_id=$2 and role='manager' and status='active'`, [agencyA.id, INVITEE]) === 1,
    "accepting the invite created the membership with the invited role");
  const badTok = await denied(pg, `select public.accept_invitation('rawtoken-abc')`);
  assert(badTok, "a used invitation cannot be accepted twice");
  const wrongEmail = await denied(pg, `select public.accept_invitation('nope')`);
  assert(wrongEmail, "an unknown token is rejected");

  // ── 5. transfer_ownership + last-owner guard + is_sole_owner ─────────────────
  console.log("\nM01 · ownership transfer + zero-owner invariant:");
  await reset();
  await as(OWNER_A);
  await pg.query(`select public.transfer_ownership($1,$2)`, [agencyA.id, ADMIN_A2]);
  assert(await count(pg, `select count(*)::int n from public.memberships
           where workspace_id=$1 and user_id=$2 and role='owner'`, [agencyA.id, ADMIN_A2]) === 1,
    "transfer promoted the target to owner");
  assert(await count(pg, `select count(*)::int n from public.memberships
           where workspace_id=$1 and user_id=$2 and role='admin'`, [agencyA.id, OWNER_A]) === 1,
    "transfer demoted the former owner to admin");
  assert(await count(pg, `select count(*)::int n from public.workspaces where id=$1 and owner_id=$2`,
           [agencyA.id, ADMIN_A2]) === 1, "transfer updated workspaces.owner_id");
  assert((await pg.query(`select public.is_sole_owner($1) as s`, [ADMIN_A2])).rows[0].s === true,
    "is_sole_owner(new agency owner) is true");
  // OWNER_A is now only an admin of the agency, but still the SOLE owner of subA →
  // the guard must still see them as a sole owner somewhere (correct: true).
  assert((await pg.query(`select public.is_sole_owner($1) as s`, [OWNER_A])).rows[0].s === true,
    "is_sole_owner(former agency owner, still sole owner of the sub-account) is true");
  // INVITEE is a manager of the agency and owns nothing → the clean negative control.
  assert((await pg.query(`select public.is_sole_owner($1) as s`, [INVITEE])).rows[0].s === false,
    "is_sole_owner(a member who owns no workspace) is false");
  // The former owner is now an admin and could try to delete the sole owner's row.
  const orphan = await denied(pg, `delete from public.memberships where workspace_id=$1 and user_id=$2`,
                             [agencyA.id, ADMIN_A2]);
  assert(orphan, "guard_last_owner blocks deleting a workspace's sole owner");
  // The sole owner cannot leave without transferring first.
  await reset();
  await as(ADMIN_A2);
  const leaveBlocked = await denied(pg, `select public.leave_workspace($1)`, [agencyA.id]);
  assert(leaveBlocked, "leave_workspace blocks the sole owner");

  // ── 6. archive / restore (owner-only) ───────────────────────────────────────
  console.log("\nM01 · archive / restore:");
  await pg.query(`select public.archive_workspace($1)`, [agencyA.id]);   // ADMIN_A2 is owner now
  assert((await pg.query(`select status from public.workspaces where id=$1`, [agencyA.id])).rows[0].status === "archived",
    "owner can archive (status=archived, archived_at set)");
  await pg.query(`select public.restore_workspace($1)`, [agencyA.id]);
  assert((await pg.query(`select status from public.workspaces where id=$1`, [agencyA.id])).rows[0].status === "active",
    "owner can restore (status=active)");
  await reset();
  await as(INVITEE); // a manager, not owner
  assert(await denied(pg, `select public.archive_workspace($1)`, [agencyA.id]),
    "a non-owner cannot archive the workspace");

  // ── 7. Browser may insert only status='queued' jobs (re-affirm) ─────────────
  console.log("\nM01 · jobs stay queued-only from the client:");
  await reset();
  await as(ADMIN_A2); // an owner/member of agency A
  assert(await denied(pg, `insert into public.jobs (workspace_id,type,status) values ($1,'workspace.provision','running')`,
           [agencyA.id]), "member cannot insert a 'running' job (RLS)");
  assert((await pg.query(`insert into public.jobs (workspace_id,type,status) values ($1,'workspace.provision','queued')`,
           [agencyA.id])).affectedRows === 1, "member CAN insert a 'queued' job (positive control)");
  await reset();

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M01 probe: ${pass} passed, ${fail} failed\x1b[0m`);
  await pg.close();
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((e) => { console.error("harness error:", e); process.exitCode = 2; });
