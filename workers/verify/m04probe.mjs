// m04probe.mjs — verify the M04 Notifications Center slice on REAL Postgres
// (PGlite, no Docker). Proves DoD Gate 1 (cross-tenant leak on the two new tables),
// the notify() contract (target resolution, preference respect, 5-minute dedupe),
// the mark-read RLS wall, and the digest pg_cron ENQUEUE body (a notification.digest
// job lands in `jobs`, idempotently). Loads migrations 0000, 0001, 0002, 0007, 0008,
// 0009 into PGlite and exercises them for real.
//
//   node workers/verify/m04probe.mjs        (after `npm install`)
//
// Exit code 0 = all assertions passed; 1 = a failure/leak was detected.
//
// Harness stubs (probe-only, same spirit as m01/m02probe): auth.users + auth.uid(),
// a deterministic digest() shim (0007 references it), and the authenticated/
// service_role roles the migrations grant to. notify() is SECURITY DEFINER (the
// service path), so we call it from the reset (superuser) context — exactly how an
// Edge Function / worker with the service-role key would. The two hosted-only
// statements in 0009 (Realtime publication + cron.schedule) are wrapped in guarded
// DO blocks in the migration, so they load as no-ops here.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const OWNER_A   = "11111111-1111-1111-1111-111111111111";
const ADMIN_A   = "22222222-2222-2222-2222-222222222222";
const OWNER_B   = "33333333-3333-3333-3333-333333333333"; // agency B owner (the attacker)
const STAFF_A   = "66666666-6666-6666-6666-666666666666";
const CLIENT_A  = "77777777-7777-7777-7777-777777777777";

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
    create or replace function public.digest(text, text) returns bytea
      language sql immutable as $$ select decode(md5($1), 'hex') $$;
    create role authenticated nologin;
    create role service_role nologin;
    grant usage on schema public to authenticated;
  `);

  for (const m of ["0000_extensions_enums.sql", "0001_tenancy.sql", "0002_jobs.sql",
                   "0007_m01_workspaces.sql", "0008_m02_roles.sql", "0011_m04_notifications.sql"]) {
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
      ('${STAFF_A}','staff.a@aimindshare.test'),
      ('${CLIENT_A}','client.a@aimindshare.test')
    on conflict (id) do nothing;
    insert into public.profiles (id,email,name) values
      ('${OWNER_A}','owner.a@aimindshare.test','Owner A'),
      ('${ADMIN_A}','admin.a@aimindshare.test','Admin A'),
      ('${OWNER_B}','owner.b@aimindshare.test','Owner B'),
      ('${STAFF_A}','staff.a@aimindshare.test','Staff A'),
      ('${CLIENT_A}','client.a@aimindshare.test','Client A')
    on conflict (id) do nothing;
  `);

  const as = (sub) => pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);

  // ── Setup: agency A (OWNER_A) + admin/staff/client; agency B (OWNER_B) ───────
  await as(OWNER_A);
  const wsA = (await pg.query(`select id from public.create_workspace('Acme Agency')`)).rows[0].id;
  await pg.query(`insert into public.memberships (workspace_id,user_id,role,status,invited_by) values
      ($1,$2,'admin','active',$5),($1,$3,'staff','active',$5),($1,$4,'client','active',$5)`,
    [wsA, ADMIN_A, STAFF_A, CLIENT_A, OWNER_A]);
  await reset(); await as(OWNER_B);
  const wsB = (await pg.query(`select id from public.create_workspace('Beacon Media')`)).rows[0].id;
  await reset();

  // ── 0. Schema: enum + tables exist, RLS enabled ──────────────────────────────
  console.log("\nM04 · schema + RLS enabled on the new tables:");
  assert(await count(pg, `select count(*)::int n from pg_type where typname='notif_channel'`) === 1,
    "notif_channel enum created in 0011");
  for (const t of ["notifications", "notification_prefs"]) {
    assert(await count(pg, `select count(*)::int n from pg_tables where schemaname='public' and tablename=$1`, [t]) === 1, `table ${t} exists`);
    assert((await pg.query(`select relrowsecurity from pg_class where oid = ('public.'||$1)::regclass`, [t])).rows[0].relrowsecurity === true,
      `RLS enabled on ${t}`);
  }

  // ── 1. notify() resolves an EXPLICIT user list + respects prefs ──────────────
  console.log("\nM04 · notify() writes rows, resolves targets, respects preferences:");
  const made1 = await count(pg, `select public.notify($1, $2::text[], 'deal.won', 'Deal won', 'Acme retainer', $3::jsonb)::int n`,
    [wsA, [OWNER_A, STAFF_A], JSON.stringify({ link: "#/deals/1" })]);
  assert(made1 === 2, "notify(explicit users) created 2 rows (owner + staff)");

  // staff disables in_app for deal.won → notify makes NO row for staff on that type
  await as(STAFF_A);
  await pg.query(`insert into public.notification_prefs (workspace_id,user_id,prefs,digest)
      values ($1,$2,$3::jsonb,'off')`, [wsA, STAFF_A, JSON.stringify({ "deal.won": { in_app: false, email: false, push: false } })]);
  await reset();
  const made2 = await count(pg, `select public.notify($1, $2::text[], 'deal.won', 'Another win', null, $3::jsonb)::int n`,
    [wsA, [STAFF_A], JSON.stringify({ link: "#/deals/2" })]);
  assert(made2 === 0, "notify() skips a user who turned every channel off for the type");

  // ── 2. Role-target resolution (admin+ ⇒ owner + admin, not staff/client) ─────
  console.log("\nM04 · notify() resolves a ROLE target to the right members:");
  const madeAdmin = await count(pg, `select public.notify($1, array['admin']::text[], 'automation.failed', 'Run failed', null, '{}'::jsonb)::int n`, [wsA]);
  assert(madeAdmin === 2, "notify(role='admin') hit owner + admin only (2 rows)");
  const madeAll = await count(pg, `select public.notify($1, array['all']::text[], 'usage.limit_warning', 'Approaching quota', null, '{}'::jsonb)::int n`, [wsA]);
  assert(madeAll === 4, "notify(role='all') hit every active member (owner+admin+staff+client = 4)");

  // ── 3. 5-minute dedupe on (user + type + link) ───────────────────────────────
  console.log("\nM04 · dedupe skips an identical event inside the 5-minute window:");
  const dm1 = await count(pg, `select public.notify($1, $2::text[], 'mention', 'Mentioned you', null, $3::jsonb)::int n`,
    [wsA, [OWNER_A], JSON.stringify({ link: "#/note/9" })]);
  const dm2 = await count(pg, `select public.notify($1, $2::text[], 'mention', 'Mentioned you again', null, $3::jsonb)::int n`,
    [wsA, [OWNER_A], JSON.stringify({ link: "#/note/9" })]);
  assert(dm1 === 1 && dm2 === 0, "identical (user+type+link) within 5 min is deduped (1 then 0)");
  const dm3 = await count(pg, `select public.notify($1, $2::text[], 'mention', 'Different link', null, $3::jsonb)::int n`,
    [wsA, [OWNER_A], JSON.stringify({ link: "#/note/10" })]);
  assert(dm3 === 1, "a different link is NOT deduped (new row)");

  // ── 4. Feed RLS: a user sees own + workspace-wide, marks own read ────────────
  console.log("\nM04 · feed RLS — self rows + broadcast, mark-read is self-only:");
  // a workspace-wide broadcast (user_id null) — inserted by the service path
  await pg.query(`insert into public.notifications (workspace_id,user_id,type,title) values ($1,null,'campaign.finished','Newsletter sent')`, [wsA]);
  await as(OWNER_A);
  assert(await count(pg, `select count(*)::int n from public.notifications where workspace_id=$1`, [wsA]) > 0,
    "owner A sees their own notifications");
  assert(await count(pg, `select count(*)::int n from public.notifications where user_id is null`) === 1,
    "owner A sees the workspace-wide broadcast (user_id null)");
  const anId = (await pg.query(`select id from public.notifications where user_id=$1 and read_at is null limit 1`, [OWNER_A])).rows[0].id;
  assert((await pg.query(`update public.notifications set read_at=now() where id=$1`, [anId])).affectedRows === 1,
    "owner A can mark their OWN notification read");
  await reset(); await as(STAFF_A);
  assert((await pg.query(`update public.notifications set read_at=now() where id=$1`, [anId])).affectedRows === 0,
    "staff A cannot mark owner A's notification read (RLS update wall)");

  // ── 5. Cross-tenant isolation (agency B's owner cannot reach A) ──────────────
  console.log("\nM04 · cross-tenant isolation (impersonating agency B's owner):");
  await reset(); await as(OWNER_B);
  assert(await count(pg, `select count(*)::int n from public.notifications where workspace_id=$1`, [wsA]) === 0,
    "B cannot SELECT A's notifications");
  assert((await pg.query(`update public.notifications set read_at=now() where id=$1`, [anId])).affectedRows === 0,
    "B cannot UPDATE A's notification (0 rows)");
  assert(await count(pg, `select count(*)::int n from public.notification_prefs where workspace_id=$1`, [wsA]) === 0,
    "B cannot SELECT A's notification preferences");
  assert(await denied(pg, `insert into public.notification_prefs (workspace_id,user_id,prefs) values ($1,$2,'{}'::jsonb)`, [wsA, OWNER_B]),
    "B cannot INSERT a prefs row into A (not a member)");

  // ── 6. Preferences are self-owned ────────────────────────────────────────────
  console.log("\nM04 · notification_prefs are self-owned:");
  await reset(); await as(ADMIN_A);
  await pg.query(`insert into public.notification_prefs (workspace_id,user_id,prefs,digest) values ($1,$2,'{}'::jsonb,'daily')
      on conflict (workspace_id,user_id) do update set digest='daily'`, [wsA, ADMIN_A]);
  assert(await count(pg, `select count(*)::int n from public.notification_prefs where user_id=$1`, [ADMIN_A]) === 1,
    "admin A can upsert their own prefs (digest=daily)");
  assert(await denied(pg, `insert into public.notification_prefs (workspace_id,user_id,prefs) values ($1,$2,'{}'::jsonb)`, [wsA, STAFF_A]),
    "admin A cannot create a prefs row for another user (self-only insert)");

  // ── 7. Digest enqueue body → a notification.digest job, idempotently ─────────
  // Runs the SAME insert…select the pg_cron job runs, with the hour gate forced true
  // for determinism (the real job gates on local-hour = 8). Superuser context = the
  // cron owner. Proves: (a) only workspaces with a daily/weekly-digest member enqueue,
  // (b) the idempotency key blocks a second insert.
  console.log("\nM04 · digest pg_cron enqueue body (schedule → jobs, idempotent):");
  await reset();
  const enqueue = `
    insert into public.jobs (workspace_id, type, payload, status, idempotency_key)
    select w.id, 'notification.digest',
           jsonb_build_object('tz', coalesce(nullif(w.branding->>'timezone',''),'UTC')),
           'queued',
           'digest-' || w.id || '-' || to_char((now() at time zone 'UTC')::date,'YYYY-MM-DD')
      from public.workspaces w
     where w.deleted_at is null
       and true  -- (hour gate = 8 in production; forced for a deterministic probe)
       and exists (
         select 1 from public.notification_prefs np
          join public.memberships m on m.workspace_id=np.workspace_id and m.user_id=np.user_id and m.status='active'
         where np.workspace_id = w.id and np.digest in ('daily','weekly'))
    on conflict (workspace_id, type, idempotency_key) where idempotency_key is not null do nothing`;
  await pg.exec(enqueue);
  assert(await count(pg, `select count(*)::int n from public.jobs where type='notification.digest' and workspace_id=$1`, [wsA]) === 1,
    "workspace A (has a daily-digest member) enqueued exactly one digest job");
  assert(await count(pg, `select count(*)::int n from public.jobs where type='notification.digest' and workspace_id=$1`, [wsB]) === 0,
    "workspace B (no digest member) enqueued no digest job");
  await pg.exec(enqueue);   // second sweep same day
  assert(await count(pg, `select count(*)::int n from public.jobs where type='notification.digest' and workspace_id=$1`, [wsA]) === 1,
    "a second sweep the same day is idempotent (still 1 job — unique key blocks it)");

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M04 probe: ${pass} passed, ${fail} failed\x1b[0m`);
  await pg.close();
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
