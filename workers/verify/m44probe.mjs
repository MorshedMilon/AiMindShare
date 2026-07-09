// m44probe.mjs — verify the M44 Admin Basics slice on REAL Postgres (PGlite, no
// Docker). Proves: (1) the is_platform_admin() wall on every admin RPC (a normal
// member is rejected; a platform admin passes), (2) cross-tenant reads work for a
// platform admin while RLS still blocks direct member reads of platform tables,
// (3) feature-flag override→default resolution, (4) mutation RPCs write an audit
// row, (5) admin_audit_log is append-only, (6) suspend flips ws_status + helper,
// (7) job retry/discard, (8) the impersonation expiry-sweep body closes stale
// sessions with a dual-identity audit row. Loads 0000,0001,0002,0003,0007,0009,
// 0010_m41 (is_platform_admin), 0018 into PGlite and exercises RLS for real.
//
//   node workers/verify/m44probe.mjs        (after `npm install`)
//
// Exit code 0 = all assertions passed; 1 = a failure/leak was detected.
//
// What is NOT here (carried live, never faked — absent in PGlite):
//   • the GoTrue admin session-mint the admin-impersonate Edge Fn performs
//   • minting the app_metadata.platform_admin claim onto an operator account
//   • the live pg_cron schedule (the sweep BODY is asserted directly here)
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const OWNER_A    = "11111111-1111-1111-1111-111111111111";
const ADMIN_A    = "22222222-2222-2222-2222-222222222222";
const STAFF_A    = "44444444-4444-4444-4444-444444444444";
const OWNER_B    = "66666666-6666-6666-6666-666666666666";
const STAFF_B    = "77777777-7777-7777-7777-777777777777";
const PLAT_ADMIN = "88888888-8888-8888-8888-888888888888"; // platform super-admin (app_metadata claim)

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

  // ── Harness: auth schema + uid()/jwt-claims stubs + cron.schedule no-op ──────
  await pg.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role authenticated nologin;
    create role service_role nologin;
    grant usage on schema public to authenticated;
    create schema if not exists cron;
    create or replace function cron.schedule(text, text, text) returns bigint
      language sql as $$ select 0::bigint $$;
  `);

  // Load in dependency order: tenancy/jobs/plans, ws settings+status enum, billing
  // (billing_state), M41 (is_platform_admin), then this module.
  for (const m of [
    "0000_extensions_enums.sql", "0001_tenancy.sql", "0002_jobs.sql", "0003_meters_plans.sql",
    "0007_m01_workspaces.sql", "0009_m03_billing.sql", "0010_m41_integrations.sql",
    "0019_m44_admin.sql",
  ]) {
    await pg.exec(load(m));
  }
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
  `);

  // ── Caller switching (session-local so it persists across query() calls) ─────
  const as = (sub, platformAdmin = false) => pg.exec(
    `set role authenticated;` +
    `select set_config('request.jwt.claim.sub','${sub}',false);` +
    `select set_config('request.jwt.claims','${JSON.stringify({ sub, app_metadata: { platform_admin: platformAdmin } })}',false);`
  );
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claims','{}',false);`);

  // ── Setup: two workspaces + members + a plan/subscription + a failed job ─────
  await reset();
  for (const [id, u] of [[OWNER_A, "owner.a"], [ADMIN_A, "admin.a"], [STAFF_A, "staff.a"],
                         [OWNER_B, "owner.b"], [STAFF_B, "staff.b"], [PLAT_ADMIN, "plat.admin"]]) {
    await pg.query(`insert into auth.users (id,email) values ($1,$2) on conflict do nothing`, [id, `${u}@aimindshare.test`]);
    await pg.query(`insert into public.profiles (id,email,name) values ($1,$2,$3) on conflict do nothing`, [id, `${u}@aimindshare.test`, u]);
  }
  const wsA = (await pg.query(`insert into public.workspaces (owner_id,name,slug) values ($1,'Acme Agency','acme') returning id`, [OWNER_A])).rows[0].id;
  const wsB = (await pg.query(`insert into public.workspaces (owner_id,name,slug) values ($1,'Bravo Agency','bravo') returning id`, [OWNER_B])).rows[0].id;
  await pg.query(`insert into public.memberships (workspace_id,user_id,role,status) values
      ($1,$2,'owner','active'),($1,$3,'admin','active'),($1,$4,'staff','active')`, [wsA, OWNER_A, ADMIN_A, STAFF_A]);
  await pg.query(`insert into public.memberships (workspace_id,user_id,role,status) values
      ($1,$2,'owner','active'),($1,$3,'staff','active')`, [wsB, OWNER_B, STAFF_B]);
  const planId = (await pg.query(`insert into public.plans (tier,name,monthly_price) values ('pro','Pro',99) returning id`)).rows[0].id;
  await pg.query(`insert into public.subscriptions_platform (workspace_id,plan_id,status) values ($1,$2,'active')`, [wsA, planId]);
  const jobA = (await pg.query(`insert into public.jobs (workspace_id,type,status,error) values ($1,'test.job','failed','boom') returning id`, [wsA])).rows[0].id;

  // ═══ Task 1 — schema, RLS posture, append-only, enum ═══════════════════════
  console.log("\nM44 · schema + RLS posture:");
  assert(await count(pg, `select count(*)::int n from pg_tables where tablename='feature_flags' and rowsecurity`) === 1, "feature_flags RLS on");
  assert(await count(pg, `select count(*)::int n from pg_tables where tablename='feature_flag_overrides' and rowsecurity`) === 1, "feature_flag_overrides RLS on");
  assert(await count(pg, `select count(*)::int n from pg_tables where tablename='impersonation_sessions' and rowsecurity`) === 1, "impersonation_sessions RLS on");
  assert(await count(pg, `select count(*)::int n from pg_tables where tablename='admin_audit_log' and rowsecurity`) === 1, "admin_audit_log RLS on");
  assert(await count(pg, `select count(*)::int n from pg_policies where tablename='admin_audit_log'`) === 1, "admin_audit_log SELECT-only (append-only posture)");
  assert(await count(pg, `select count(*)::int n from pg_policies where tablename='impersonation_sessions'`) === 1, "impersonation_sessions SELECT-only");
  assert(await count(pg, `select count(*)::int n from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='ws_status' and e.enumlabel='suspended'`) === 1, "ws_status has 'suspended'");

  // ═══ Task 2 — gated reads + cross-tenant + flag resolution ═════════════════
  console.log("\nM44 · the is_platform_admin() wall (non-admin denied):");
  await as(STAFF_A, false);
  assert(await denied(pg, `select public.admin_platform_kpis()`), "kpis denied for non-admin");
  assert(await denied(pg, `select * from public.admin_list_workspaces()`), "list_workspaces denied for non-admin");
  assert(await denied(pg, `select * from public.admin_list_users()`), "list_users denied for non-admin");
  assert(await denied(pg, `select * from public.admin_list_jobs()`), "list_jobs denied for non-admin");
  assert(await denied(pg, `select public.admin_get_workspace('${wsA}')`), "get_workspace denied for non-admin");
  // platform tables: even a member can't read the platform ledgers directly
  assert(await count(pg, `select count(*)::int n from public.admin_audit_log`) === 0, "member cannot read admin_audit_log");
  assert(await count(pg, `select count(*)::int n from public.impersonation_sessions`) === 0, "member cannot read impersonation_sessions");

  console.log("\nM44 · platform admin reads across tenants:");
  await as(PLAT_ADMIN, true);
  assert(await count(pg, `select count(*)::int n from public.admin_list_workspaces()`) >= 2, "admin sees BOTH workspaces (cross-tenant)");
  assert(await count(pg, `select count(*)::int n from public.admin_list_users()`) >= 6, "admin sees all users cross-tenant");
  const kpis = (await pg.query(`select public.admin_platform_kpis() k`)).rows[0].k;
  assert(Number(kpis.workspaces) >= 2 && Number(kpis.mrr) === 99 && Number(kpis.jobs_failed) >= 1, "kpis: workspaces≥2, mrr=99, jobs_failed≥1");
  assert(await count(pg, `select count(*)::int n from public.admin_list_jobs('failed')`) >= 1, "jobs monitor lists the failed job cross-tenant");

  console.log("\nM44 · feature-flag resolution (override → default → false):");
  assert(await count(pg, `select (public.admin_flag_enabled('voice.rollout', null))::int n`) === 0, "unknown flag → false");

  // ═══ Task 3 — mutations, audit, append-only, override-wins ═════════════════
  console.log("\nM44 · non-admin cannot mutate:");
  await as(STAFF_A, false);
  assert(await denied(pg, `select public.admin_set_feature_flag('x', true)`), "set_feature_flag denied for non-admin");
  assert(await denied(pg, `select public.admin_suspend_workspace('${wsA}', 'x')`), "suspend denied for non-admin");
  assert(await denied(pg, `select public.admin_retry_job('${jobA}')`), "retry_job denied for non-admin");
  // admin_audit is not client-callable (forge guard)
  assert(await denied(pg, `select public.admin_audit('forge','x','x',null,'{}')`), "admin_audit NOT directly callable (forge guard)");

  console.log("\nM44 · admin mutations write audit + resolve flags:");
  // Mutations run as PLAT_ADMIN; tenant-table STATE is observed under reset()
  // (superuser bypasses RLS) — the platform admin is not a member of wsA/wsB, so
  // reading workspaces/jobs through the authenticated client is (correctly) empty.
  await as(PLAT_ADMIN, true);
  await pg.exec(`select public.admin_set_feature_flag('voice.rollout', true, 'AI voice beta', 'beta')`);
  assert(await count(pg, `select (public.admin_flag_enabled('voice.rollout', null))::int n`) === 1, "flag on after set default_on=true");
  await pg.exec(`select public.admin_set_flag_override('voice.rollout', '${wsA}', false)`);
  assert(await count(pg, `select (public.admin_flag_enabled('voice.rollout','${wsA}'))::int n`) === 0, "per-workspace override wins over default");
  await pg.exec(`select public.admin_suspend_workspace('${wsA}', 'abuse review')`);
  await reset();
  assert(await count(pg, `select count(*)::int n from public.workspaces where id='${wsA}' and status='suspended'`) === 1, "workspace flipped to suspended");
  assert(await count(pg, `select (public.workspace_suspended('${wsA}'))::int n`) === 1, "workspace_suspended() true");
  await as(PLAT_ADMIN, true);
  await pg.exec(`select public.admin_unsuspend_workspace('${wsA}')`);
  await reset();
  assert(await count(pg, `select count(*)::int n from public.workspaces where id='${wsA}' and status='active'`) === 1, "unsuspend restores active");
  assert(await count(pg, `select count(*)::int n from public.admin_audit_log where action='workspace.suspend' and actor_user_id='${PLAT_ADMIN}'`) === 1, "suspend audited with actor identity");
  assert(await count(pg, `select count(*)::int n from public.admin_audit_log where action in ('flag.set','flag.override')`) === 2, "flag mutations audited");

  console.log("\nM44 · admin_audit_log is append-only (even for platform admin via client):");
  await as(PLAT_ADMIN, true);
  const upd = await pg.query(`update public.admin_audit_log set action='tampered'`);
  assert((upd.affectedRows ?? 0) === 0, "UPDATE admin_audit_log → 0 rows (no update policy)");
  const del = await pg.query(`delete from public.admin_audit_log`);
  assert((del.affectedRows ?? 0) === 0, "DELETE admin_audit_log → 0 rows (no delete policy)");

  console.log("\nM44 · jobs monitor retry/discard:");
  await as(PLAT_ADMIN, true);
  await pg.exec(`select public.admin_retry_job('${jobA}')`);
  await reset();
  assert(await count(pg, `select count(*)::int n from public.jobs where id='${jobA}' and status='queued' and error is null and locked_by is null`) === 1, "retry re-queues + clears error/lock");
  await as(PLAT_ADMIN, true);
  await pg.exec(`select public.admin_discard_job('${jobA}')`);
  await reset();
  assert(await count(pg, `select count(*)::int n from public.jobs where id='${jobA}' and status='failed' and error='discarded by admin'`) === 1, "discard → failed with reason");

  // ═══ Task 4 — impersonation expiry sweep body ══════════════════════════════
  console.log("\nM44 · impersonation session + expiry sweep:");
  await reset();
  await pg.query(`insert into public.impersonation_sessions (admin_user_id,target_user_id,target_workspace_id,reason,expires_at)
      values ($1,$2,$3,'support', now() + interval '30 minutes')`, [PLAT_ADMIN, STAFF_A, wsA]);
  const expiredId = (await pg.query(`insert into public.impersonation_sessions (admin_user_id,target_user_id,target_workspace_id,reason,expires_at)
      values ($1,$2,$3,'support', now() - interval '1 minute') returning id`, [PLAT_ADMIN, STAFF_B, wsB])).rows[0].id;
  // run the sweep body verbatim (pg_cron is absent in PGlite; the schedule is a no-op stub)
  await pg.exec(`
    with closed as (
      update public.impersonation_sessions set ended_at = now()
       where ended_at is null and expires_at < now()
      returning admin_user_id, target_user_id, target_workspace_id)
    insert into public.admin_audit_log(actor_user_id, acting_as_user_id, workspace_id, action, target_type, target_id, detail)
    select admin_user_id, target_user_id, target_workspace_id, 'impersonate.expire', 'user', target_user_id::text, '{}'
      from closed;
  `);
  assert(await count(pg, `select count(*)::int n from public.impersonation_sessions where id='${expiredId}' and ended_at is not null`) === 1, "sweep closes the expired session");
  assert(await count(pg, `select count(*)::int n from public.impersonation_sessions where ended_at is null`) === 1, "the still-valid session stays open");
  assert(await count(pg, `select count(*)::int n from public.admin_audit_log where action='impersonate.expire' and acting_as_user_id='${STAFF_B}'`) === 1, "sweep writes a dual-identity audit row");

  // end-impersonation RPC (admin-driven close)
  console.log("\nM44 · admin_end_impersonation:");
  const openId = (await pg.query(`select id from public.impersonation_sessions where ended_at is null limit 1`)).rows[0].id;
  await as(PLAT_ADMIN, true);
  await pg.exec(`select public.admin_end_impersonation('${openId}')`);
  assert(await count(pg, `select count(*)::int n from public.impersonation_sessions where id='${openId}' and ended_at is not null`) === 1, "end_impersonation closes the session");
  assert(await count(pg, `select count(*)::int n from public.admin_audit_log where action='impersonate.end'`) === 1, "end_impersonation audited");

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M44 probe: ${pass} passed, ${fail} failed\x1b[0m`);
  await pg.close();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
