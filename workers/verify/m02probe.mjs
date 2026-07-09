// m02probe.mjs — verify the M02 Roles & Permissions slice on REAL Postgres
// (PGlite, no Docker). Proves DoD Gate 2 (the role matrix is enforced SERVER-SIDE)
// and the tenancy wall for the new roles table + RPCs. Loads migrations 0000, 0001,
// 0002, 0007, 0008 into PGlite and exercises has_permission / set_member_role /
// set_member_permissions / delete_role and the roles RLS for real.
//
//   node workers/verify/m02probe.mjs        (after `npm install`)
//
// Exit code 0 = all assertions passed; 1 = a failure/leak was detected.
//
// Harness stubs (probe-only, identical spirit to m00/m01probe): auth.users +
// auth.uid(), a deterministic digest() shim (accept_invitation isn't used here but
// 0007 defines functions that reference it), and the authenticated/service_role
// roles the migrations grant to. has_permission() is SECURITY DEFINER on auth.uid(),
// so we set the JWT sub and call it directly — exactly the Edge Function path.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const OWNER_A   = "11111111-1111-1111-1111-111111111111";
const ADMIN_A   = "22222222-2222-2222-2222-222222222222";
const OWNER_B   = "33333333-3333-3333-3333-333333333333"; // agency B owner (the attacker)
const MANAGER_A = "55555555-5555-5555-5555-555555555555";
const STAFF_A   = "66666666-6666-6666-6666-666666666666";
const CLIENT_A  = "77777777-7777-7777-7777-777777777777";

// Built-in role ids (mirror migration 0008's seed).
const BUILTIN = {
  owner: "00000000-0000-0000-0000-0000000000a1",
  admin: "00000000-0000-0000-0000-0000000000a2",
  manager: "00000000-0000-0000-0000-0000000000a3",
  staff: "00000000-0000-0000-0000-0000000000a4",
  client: "00000000-0000-0000-0000-0000000000a5",
};

// The intended built-in matrix (mirror of _shared/permissions.ts ROLE_MATRIX). The
// drift guard below asserts the SEEDED arrays equal this — the single check that
// keeps SQL, the TS registry, and the JS mirror honest (you can't import TS in SQL).
const EXPECTED = {
  owner: ["crm.view","crm.create","crm.edit","crm.delete","crm.export","pipeline.view","pipeline.manage","campaigns.view","campaigns.send","forms.view","forms.manage","reports.view","automations.manage","team.manage","billing.manage","settings.manage","workspace.delete","whitelabel.manage"],
  admin: ["crm.view","crm.create","crm.edit","crm.delete","crm.export","pipeline.view","pipeline.manage","campaigns.view","campaigns.send","forms.view","forms.manage","reports.view","automations.manage","team.manage","settings.manage"],
  manager: ["crm.view","crm.create","crm.edit","crm.delete","crm.export","pipeline.view","pipeline.manage","campaigns.view","campaigns.send","forms.view","forms.manage","reports.view","automations.manage"],
  staff: ["crm.view","crm.create","crm.edit","pipeline.view","campaigns.view","reports.view","forms.view","forms.manage"],
  client: ["portal.view","portal.approve","portal.pay"],
};

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

const load = (n) => readFileSync(join(MIG, n), "utf8")
  .split("\n").filter((l) => !/^\s*create\s+extension/i.test(l)).join("\n");

const count = async (pg, sql, params) => Number((await pg.query(sql, params)).rows[0].n);
async function denied(pg, sql, params) { try { await pg.query(sql, params); return false; } catch { return true; } }
// has_permission(ws, perm) for the CURRENT jwt sub (call after as(sub)).
const perm = async (pg, ws, p) => (await pg.query(`select public.has_permission($1,$2) as v`, [ws, p])).rows[0].v === true;
const sameSet = (a, b) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

async function main() {
  const pg = new PGlite();

  await pg.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create or replace function public.digest(text, text) returns bytea
      language sql immutable as $$ select decode(md5($1), 'hex') $$;
    create role authenticated nologin;
    create role service_role nologin;
    grant usage on schema public to authenticated;
  `);

  for (const m of ["0000_extensions_enums.sql", "0001_tenancy.sql", "0002_jobs.sql", "0007_m01_workspaces.sql", "0008_m02_roles.sql"]) {
    await pg.exec(load(m));
  }
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);

  await pg.exec(`
    insert into auth.users (id,email) values
      ('${OWNER_A}','owner.a@aimindshare.test'),
      ('${ADMIN_A}','admin.a@aimindshare.test'),
      ('${OWNER_B}','owner.b@aimindshare.test'),
      ('${MANAGER_A}','manager.a@aimindshare.test'),
      ('${STAFF_A}','staff.a@aimindshare.test'),
      ('${CLIENT_A}','client.a@aimindshare.test')
    on conflict (id) do nothing;
    insert into public.profiles (id,email,name) values
      ('${OWNER_A}','owner.a@aimindshare.test','Owner A'),
      ('${ADMIN_A}','admin.a@aimindshare.test','Admin A'),
      ('${OWNER_B}','owner.b@aimindshare.test','Owner B'),
      ('${MANAGER_A}','manager.a@aimindshare.test','Manager A'),
      ('${STAFF_A}','staff.a@aimindshare.test','Staff A'),
      ('${CLIENT_A}','client.a@aimindshare.test','Client A')
    on conflict (id) do nothing;
  `);

  const as = (sub) => pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);

  // ── Setup: agency A (OWNER_A) + admin/manager/staff/client members ──────────
  await as(OWNER_A);
  const wsA = (await pg.query(`select id from public.create_workspace('Acme Agency')`)).rows[0].id;
  // OWNER_A is admin+, so RLS lets them seat the other members (role enum, role_id null
  // → has_permission resolves via the built-in role matching the enum).
  await pg.query(`insert into public.memberships (workspace_id,user_id,role,status,invited_by) values
      ($1,$2,'admin','active',$6),($1,$3,'manager','active',$6),($1,$4,'staff','active',$6),($1,$5,'client','active',$6)`,
    [wsA, ADMIN_A, MANAGER_A, STAFF_A, CLIENT_A, OWNER_A]);

  // ── 0. Seeded built-in roles match the registry (drift guard) ───────────────
  console.log("\nM02 · built-in roles seeded + match the permission registry:");
  await reset();
  assert(await count(pg, `select count(*)::int n from public.roles where is_built_in and workspace_id is null`) === 5,
    "5 built-in roles seeded (workspace_id null)");
  for (const tier of ["owner","admin","manager","staff","client"]) {
    const arr = (await pg.query(`select permissions from public.roles where id=$1`, [BUILTIN[tier]])).rows[0].permissions;
    assert(sameSet(arr, EXPECTED[tier]), `built-in ${tier} permissions match the registry (no drift)`);
  }

  // ── 1. STAFF blocked from delete/export SERVER-SIDE (the headline Gate-2 test) ─
  console.log("\nM02 · STAFF is blocked from crm.delete / crm.export (server-side):");
  await as(STAFF_A);
  assert(await perm(pg, wsA, "crm.view") === true,   "staff CAN crm.view");
  assert(await perm(pg, wsA, "crm.create") === true, "staff CAN crm.create");
  assert(await perm(pg, wsA, "crm.delete") === false, "staff CANNOT crm.delete (has_permission=false)");
  assert(await perm(pg, wsA, "crm.export") === false, "staff CANNOT crm.export (has_permission=false)");

  // ── 2. OWNER short-circuit + ADMIN exclusions + MANAGER scope ───────────────
  console.log("\nM02 · owner/admin/manager thresholds:");
  await reset(); await as(OWNER_A);
  assert(await perm(pg, wsA, "crm.delete") === true,     "owner has crm.delete (short-circuit)");
  assert(await perm(pg, wsA, "billing.manage") === true, "owner has billing.manage");
  await reset(); await as(ADMIN_A);
  assert(await perm(pg, wsA, "team.manage") === true,       "admin has team.manage");
  assert(await perm(pg, wsA, "billing.manage") === false,  "admin does NOT have billing.manage (matrix §2)");
  assert(await perm(pg, wsA, "workspace.delete") === false,"admin cannot delete the workspace");
  await reset(); await as(MANAGER_A);
  assert(await perm(pg, wsA, "crm.delete") === true,   "manager has crm.delete");
  assert(await perm(pg, wsA, "team.manage") === false, "manager does NOT have team.manage");

  // ── 3. CLIENT ceiling + coarse wall blocks client writes ────────────────────
  console.log("\nM02 · client is portal-only and the coarse wall blocks writes:");
  await reset(); await as(CLIENT_A);
  assert(await perm(pg, wsA, "portal.view") === true, "client has portal.view");
  assert(await perm(pg, wsA, "crm.view") === false,   "client does NOT have crm.view (ceiling)");
  assert(await denied(pg, `insert into public.roles (workspace_id,name,base_role,is_built_in,permissions)
          values ($1,'ClientMade','staff',false,'{}')`, [wsA]),
    "client cannot INSERT a role (coarse RLS blocks the write regardless of toggles)");

  // ── 4. Per-member overrides read server-side (grant ∪ role − revoke) ────────
  console.log("\nM02 · per-member overrides (the 'read by an Edge Fn' proof):");
  await reset(); await as(ADMIN_A);
  await pg.query(`select public.set_member_permissions($1,$2,$3::jsonb)`,
    [wsA, STAFF_A, JSON.stringify({ grant: ["crm.export"], revoke: ["crm.create"] })]);
  await reset(); await as(STAFF_A);
  assert(await perm(pg, wsA, "crm.export") === true,  "grant override ADDS crm.export to staff");
  assert(await perm(pg, wsA, "crm.create") === false, "revoke override REMOVES crm.create (revoke wins)");
  assert(await perm(pg, wsA, "crm.view") === true,    "unrelated staff permission still holds");

  // ── 5. Built-in roles are immutable ─────────────────────────────────────────
  console.log("\nM02 · built-in roles are immutable (RLS):");
  await reset(); await as(OWNER_A);
  assert((await pg.query(`update public.roles set permissions='{}' where id=$1`, [BUILTIN.staff])).affectedRows === 0,
    "cannot UPDATE a built-in role (0 rows — RLS)");
  assert((await pg.query(`delete from public.roles where id=$1`, [BUILTIN.admin])).affectedRows === 0,
    "cannot DELETE a built-in role (0 rows — RLS)");
  assert(await denied(pg, `insert into public.roles (workspace_id,name,base_role,is_built_in,permissions)
          values (null,'Forged','admin',true,'{}')`),
    "cannot FORGE a built-in role (workspace_id null fails the insert check)");

  // ── 6. Custom role: create → assign → toggle → delete guard ─────────────────
  console.log("\nM02 · custom role clone + assign + delete guard:");
  await reset(); await as(ADMIN_A);
  const salesId = (await pg.query(`insert into public.roles (workspace_id,name,base_role,is_built_in,permissions)
      values ($1,'Sales Lead','manager',false, array['crm.view','crm.create','crm.edit','pipeline.view','pipeline.manage','campaigns.view','reports.view'])
      returning id`, [wsA])).rows[0].id;      // manager clone with crm.delete/export toggled OFF
  assert(!!salesId, "admin can create a custom role (RLS insert)");
  assert(await denied(pg, `insert into public.roles (workspace_id,name,base_role,is_built_in,permissions)
          values ($1,'Cannot','owner',false,'{}')`, [wsA]),
    "a custom role cannot be created on the owner tier (check + RLS)");
  await pg.query(`select public.set_member_role($1,$2,$3)`, [wsA, MANAGER_A, salesId]);
  assert((await pg.query(`select role from public.memberships where workspace_id=$1 and user_id=$2`, [wsA, MANAGER_A])).rows[0].role === "manager",
    "set_member_role derives memberships.role = base_role (sync trigger, no drift)");
  await reset(); await as(MANAGER_A);
  assert(await perm(pg, wsA, "crm.edit") === true,    "custom-role member keeps crm.edit");
  assert(await perm(pg, wsA, "crm.delete") === false, "custom-role member lost crm.delete (matrix toggle)");
  await reset(); await as(ADMIN_A);
  assert(await denied(pg, `select public.delete_role($1,$2)`, [wsA, salesId]),
    "delete_role is blocked while a member is still assigned");
  await pg.query(`select public.set_member_role($1,$2,$3)`, [wsA, MANAGER_A, BUILTIN.manager]);  // reassign
  await pg.query(`select public.delete_role($1,$2)`, [wsA, salesId]);
  assert(await count(pg, `select count(*)::int n from public.roles where id=$1`, [salesId]) === 0,
    "delete_role succeeds once no member references the role");

  // ── 7. set_member_role guards: owner tier + non-admin caller + last owner ───
  console.log("\nM02 · set_member_role guards:");
  await reset(); await as(ADMIN_A);
  assert(await denied(pg, `select public.set_member_role($1,$2,$3)`, [wsA, STAFF_A, BUILTIN.owner]),
    "set_member_role refuses the owner tier (use transfer_ownership)");
  assert(await denied(pg, `select public.set_member_role($1,$2,$3)`, [wsA, OWNER_A, BUILTIN.staff]),
    "cannot demote the sole owner (guard_last_owner holds through set_member_role)");
  await reset(); await as(STAFF_A);
  assert(await denied(pg, `select public.set_member_role($1,$2,$3)`, [wsA, MANAGER_A, BUILTIN.staff]),
    "a non-admin (staff) cannot change roles");

  // ── 8. Cross-tenant isolation on the roles table ────────────────────────────
  console.log("\nM02 · cross-tenant isolation (impersonating agency B's owner):");
  await reset(); await as(OWNER_B);
  const wsB = (await pg.query(`select id from public.create_workspace('Beacon Media')`)).rows[0].id;
  // Re-create a custom role in A (as admin) so B has something to try to reach.
  await reset(); await as(ADMIN_A);
  const secretId = (await pg.query(`insert into public.roles (workspace_id,name,base_role,is_built_in,permissions)
      values ($1,'Secret Role','staff',false,'{}') returning id`, [wsA])).rows[0].id;
  await reset(); await as(OWNER_B);
  assert(await count(pg, `select count(*)::int n from public.roles where workspace_id=$1`, [wsA]) === 0,
    "B cannot SELECT A's custom roles");
  assert(await denied(pg, `insert into public.roles (workspace_id,name,base_role,is_built_in,permissions)
          values ($1,'Intruder','admin',false,'{}')`, [wsA]),
    "B cannot INSERT a role into A");
  assert((await pg.query(`update public.roles set permissions='{}' where id=$1`, [secretId])).affectedRows === 0,
    "B cannot UPDATE A's custom role (0 rows)");
  assert(await denied(pg, `select public.set_member_role($1,$2,$3)`, [wsA, STAFF_A, BUILTIN.staff]),
    "B cannot change roles in A (RPC re-checks admin)");
  assert(await count(pg, `select count(*)::int n from public.roles where workspace_id is null and is_built_in`) === 5,
    "B CAN read the 5 built-in roles (positive control)");

  // ── 9. has_permission_for — explicit-user variant for the service path ──────
  console.log("\nM02 · has_permission_for (service/worker path, no auth.uid()):");
  await reset();   // superuser context, like a service-role Edge Function
  assert((await pg.query(`select public.has_permission_for($1,$2,'crm.delete') as v`, [STAFF_A, wsA])).rows[0].v === false,
    "has_permission_for(staff, crm.delete) = false");
  assert((await pg.query(`select public.has_permission_for($1,$2,'crm.delete') as v`, [OWNER_A, wsA])).rows[0].v === true,
    "has_permission_for(owner, crm.delete) = true");

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M02 probe: ${pass} passed, ${fail} failed\x1b[0m`);
  await pg.close();
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
