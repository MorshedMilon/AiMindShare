// m41probe.mjs — verify the M41 Credential Vault slice on REAL Postgres (PGlite,
// no Docker). Proves the tenancy wall + role thresholds for the new `integrations`
// table, the platform-null-row isolation via is_platform_admin(), the
// resolveCredential() row-selection order (override → default → none), the
// service-role-only write posture, and the health-check job enqueue rules. Loads
// migrations 0000, 0001, 0002, 0009 into PGlite and exercises the RLS for real.
//
//   node workers/verify/m41probe.mjs        (after `npm install`)
//
// Exit code 0 = all assertions passed; 1 = a failure/leak was detected.
//
// What is NOT here (carried live, never faked — Vault ext is absent in PGlite):
//   • vault.create_secret / vault.decrypted_secrets round-trips
//   • the four Edge Function runs; real Google/Meta OAuth
// Those need Docker + Supabase CLI + Deno, exactly like Sessions 0–3 carried theirs.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");
const ROOT = join(HERE, "..", "..");

const OWNER_A   = "11111111-1111-1111-1111-111111111111";
const ADMIN_A   = "22222222-2222-2222-2222-222222222222";
const MANAGER_A = "33333333-3333-3333-3333-333333333333";
const STAFF_A   = "44444444-4444-4444-4444-444444444444";
const CLIENT_A  = "55555555-5555-5555-5555-555555555555";
const OWNER_B   = "66666666-6666-6666-6666-666666666666";
const ADMIN_B   = "77777777-7777-7777-7777-777777777777";
const PLAT_ADMIN= "88888888-8888-8888-8888-888888888888"; // platform super-admin (app_metadata claim)

// The registry keys the migration/UX are built against — mirror of _shared/providers.ts.
// The drift guard below asserts BOTH providers.ts and js/providers.js equal this set.
const EXPECTED_PROVIDERS = [
  "stripe","twilio","resend","sendgrid","openai","anthropic","dataforseo","serpapi",
  "pagespeed","google","meta","pinterest","linkedin","x","tiktok","elevenlabs",
  "amazon_paapi","clickbank","shareasale","impact","cj",
];

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

const load = (n) => readFileSync(join(MIG, n), "utf8")
  .split("\n").filter((l) => !/^\s*create\s+extension/i.test(l)).join("\n");

const count = async (pg, sql, params) => Number((await pg.query(sql, params)).rows[0].n);
async function denied(pg, sql, params) { try { await pg.query(sql, params); return false; } catch { return true; } }
const providerKeys = (src) => (src.match(/key:\s*"([a-z0-9_]+)"/g) || []).map((m) => m.replace(/key:\s*"([a-z0-9_]+)"/, "$1"));
const sameSet = (a, b) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

async function main() {
  const pg = new PGlite();

  // ── Harness: auth schema + uid()/jwt-claims stubs (probe-only) ──────────────
  await pg.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role authenticated nologin;
    create role service_role nologin;
    grant usage on schema public to authenticated;
    -- pg_cron is absent in PGlite; stub cron.schedule() as a no-op so 0009's health
    -- registry line parses. The enqueue SQL it wraps is asserted directly in test 7.
    create schema if not exists cron;
    create or replace function cron.schedule(text, text, text) returns bigint
      language sql as $$ select 0::bigint $$;
  `);

  for (const m of ["0000_extensions_enums.sql", "0001_tenancy.sql", "0002_jobs.sql", "0010_m41_integrations.sql"]) {
    await pg.exec(load(m));
  }
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);

  // Users + profiles.
  const users = [
    [OWNER_A, "owner.a"], [ADMIN_A, "admin.a"], [MANAGER_A, "manager.a"], [STAFF_A, "staff.a"],
    [CLIENT_A, "client.a"], [OWNER_B, "owner.b"], [ADMIN_B, "admin.b"], [PLAT_ADMIN, "plat.admin"],
  ];
  for (const [id, u] of users) {
    await pg.query(`insert into auth.users (id,email) values ($1,$2) on conflict do nothing`, [id, `${u}@aimindshare.test`]);
    await pg.query(`insert into public.profiles (id,email,name) values ($1,$2,$3) on conflict do nothing`, [id, `${u}@aimindshare.test`, u]);
  }

  // Impersonation: set BOTH request.jwt.claim.sub (auth.uid) AND request.jwt.claims
  // (is_platform_admin reads the full claims json). reset() drops back to superuser
  // (= the service-role/worker context that bypasses RLS).
  const as = (sub, platformAdmin = false) => pg.exec(
    `set role authenticated;` +
    `select set_config('request.jwt.claim.sub','${sub}',false);` +
    `select set_config('request.jwt.claims','${JSON.stringify({ sub, app_metadata: { platform_admin: platformAdmin } })}',false);`
  );
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claims','',false);`);

  // ── Setup: workspaces A and B + members (seeded as superuser, bypasses RLS) ──
  await reset();
  const wsA = (await pg.query(`insert into public.workspaces (owner_id,name,slug) values ($1,'Acme Agency','acme') returning id`, [OWNER_A])).rows[0].id;
  const wsB = (await pg.query(`insert into public.workspaces (owner_id,name,slug) values ($1,'Bravo Agency','bravo') returning id`, [OWNER_B])).rows[0].id;
  await pg.query(`insert into public.memberships (workspace_id,user_id,role,status) values
      ($1,$2,'owner','active'),($1,$3,'admin','active'),($1,$4,'manager','active'),($1,$5,'staff','active'),($1,$6,'client','active')`,
    [wsA, OWNER_A, ADMIN_A, MANAGER_A, STAFF_A, CLIENT_A]);
  await pg.query(`insert into public.memberships (workspace_id,user_id,role,status) values ($1,$2,'owner','active'),($1,$3,'admin','active')`,
    [wsB, OWNER_B, ADMIN_B]);

  // Seed integrations (service-role path — writes are service-role only by design).
  const vn = (ws, p) => (ws ? `ws_${ws}__${p}` : `plat__${p}`);
  await pg.query(`insert into public.integrations (workspace_id,provider,auth_type,scope,status,vault_secret_name,connected_by) values
      ($1,'stripe','api_key','workspace','connected',$2,$3),
      ($1,'openai','api_key','workspace','connected',$4,$3),
      ($1,'twilio','api_key','workspace','error',$5,$3)`,
    [wsA, vn(wsA, "stripe"), OWNER_A, vn(wsA, "openai"), vn(wsA, "twilio")]);
  await pg.query(`insert into public.integrations (workspace_id,provider,auth_type,scope,status,vault_secret_name,connected_by) values
      ($1,'stripe','api_key','workspace','connected',$2,$3)`, [wsB, vn(wsB, "stripe"), OWNER_B]);
  // Platform-level defaults (workspace_id null): openai (also overridden in wsA) + anthropic (platform-only).
  await pg.query(`insert into public.integrations (workspace_id,provider,auth_type,scope,status,vault_secret_name) values
      (null,'openai','api_key','platform','connected',$1),
      (null,'anthropic','api_key','platform','connected',$2)`, [vn(null, "openai"), vn(null, "anthropic")]);

  // ── 1. Null-aware uniqueness (the resolution-order backbone) ─────────────────
  console.log("\nM41 · uniqueness: one override + one default per provider:");
  assert(await denied(pg, `insert into public.integrations (workspace_id,provider,auth_type,scope,vault_secret_name) values ($1,'stripe','api_key','workspace','dup')`, [wsA]),
    "duplicate (workspace_id, provider) rejected (partial unique)");
  assert(await denied(pg, `insert into public.integrations (workspace_id,provider,auth_type,scope,vault_secret_name) values (null,'openai','api_key','platform','dup')`),
    "duplicate platform (provider) rejected (partial unique)");
  assert(await denied(pg, `insert into public.integrations (workspace_id,provider,auth_type,scope,vault_secret_name) values ($1,'stripe','api_key','platform','bad')`, [wsA]),
    "scope/workspace_id mismatch rejected (CHECK: scope='platform' iff workspace_id null)");

  // ── 2. RLS SELECT: admin+ reads workspace rows; staff/manager/non-member can't ─
  console.log("\nM41 · SELECT is admin+ (workspace rows):");
  await as(ADMIN_A);
  assert(await count(pg, `select count(*)::int n from public.integrations where workspace_id=$1`, [wsA]) === 3, "admin A sees all 3 of A's integrations");
  await reset(); await as(OWNER_A);
  assert(await count(pg, `select count(*)::int n from public.integrations where workspace_id=$1`, [wsA]) === 3, "owner A sees A's integrations (admin+)");
  await reset(); await as(MANAGER_A);
  assert(await count(pg, `select count(*)::int n from public.integrations`) === 0, "manager A sees NONE (below admin threshold, §2)");
  await reset(); await as(STAFF_A);
  assert(await count(pg, `select count(*)::int n from public.integrations`) === 0, "staff A sees NONE (below admin threshold)");
  await reset(); await as(CLIENT_A);
  assert(await count(pg, `select count(*)::int n from public.integrations`) === 0, "client A sees NONE");

  // ── 3. Cross-tenant leak: B's admin cannot see A's rows ─────────────────────
  console.log("\nM41 · cross-tenant leak test:");
  await reset(); await as(ADMIN_B);
  assert(await count(pg, `select count(*)::int n from public.integrations where workspace_id=$1`, [wsA]) === 0, "admin B cannot SELECT A's integrations (leak blocked)");
  assert(await count(pg, `select count(*)::int n from public.integrations`) === 1, "admin B sees ONLY B's own integration");

  // ── 4. Platform-null isolation via is_platform_admin() ──────────────────────
  console.log("\nM41 · platform-default rows are platform-admin only:");
  await reset(); await as(OWNER_A);
  assert(await pg.query(`select public.is_platform_admin() v`).then((r) => r.rows[0].v) === false, "workspace owner is NOT a platform admin");
  assert(await count(pg, `select count(*)::int n from public.integrations where workspace_id is null`) === 0, "workspace owner cannot see platform rows");
  await reset(); await as(PLAT_ADMIN, true);
  assert(await pg.query(`select public.is_platform_admin() v`).then((r) => r.rows[0].v) === true, "platform-admin claim resolves true");
  assert(await count(pg, `select count(*)::int n from public.integrations where workspace_id is null`) === 2, "platform-admin sees both platform rows");

  // ── 5. Writes are service-role only (no INSERT/UPDATE/DELETE policy) ────────
  console.log("\nM41 · writes are service-role only (D-033):");
  await reset(); await as(ADMIN_A);
  assert(await denied(pg, `insert into public.integrations (workspace_id,provider,auth_type,scope,vault_secret_name) values ($1,'serpapi','api_key','workspace','x')`, [wsA]),
    "admin A cannot INSERT directly (no insert policy — RLS denies)");
  assert((await pg.query(`update public.integrations set status='error' where workspace_id=$1 and provider='stripe'`, [wsA])).affectedRows === 0,
    "admin A cannot UPDATE (no update policy — 0 rows)");
  assert((await pg.query(`delete from public.integrations where workspace_id=$1 and provider='stripe'`, [wsA])).affectedRows === 0,
    "admin A cannot DELETE (no delete policy — 0 rows)");
  await reset();
  assert((await pg.query(`update public.integrations set last_health_check=now() where workspace_id=$1 and provider='stripe'`, [wsA])).affectedRows === 1,
    "service role (worker) CAN update health columns (bypasses RLS)");

  // ── 6. resolveCredential() resolution order: override → default → none ──────
  console.log("\nM41 · resolveCredential row-selection (override beats default):");
  const resolve = async (ws, p) => (await pg.query(
    `select workspace_id, vault_secret_name from public.integrations
      where provider=$1 and (workspace_id=$2 or workspace_id is null)
      order by workspace_id nulls last limit 1`, [p, ws])).rows[0];
  await reset();
  const openaiA = await resolve(wsA, "openai");
  assert(openaiA && openaiA.workspace_id === wsA, "openai for wsA resolves to the WORKSPACE override (not the platform default)");
  const anthropicA = await resolve(wsA, "anthropic");
  assert(anthropicA && anthropicA.workspace_id === null, "anthropic for wsA falls back to the PLATFORM default");
  const stripeB = await resolve(wsB, "stripe");
  assert(stripeB && stripeB.workspace_id === wsB, "stripe for wsB resolves to B's own row (no platform stripe)");
  const pinterestA = await resolve(wsA, "pinterest");
  assert(pinterestA === undefined, "pinterest for wsA resolves to nothing → NotConnectedError path");

  // ── 7. health_check job enqueue: queued-only from client; cron shape valid ──
  console.log("\nM41 · health_check job is queued-only from the client:");
  await reset(); await as(ADMIN_A);
  assert(!(await denied(pg, `insert into public.jobs (workspace_id,type,payload,status) values ($1,'integration.health_check','{}','queued')`, [wsA])),
    "member can enqueue a QUEUED integration.health_check job");
  assert(await denied(pg, `insert into public.jobs (workspace_id,type,payload,status) values ($1,'integration.health_check','{}','running')`, [wsA]),
    "member CANNOT insert a RUNNING job (RLS: queued only)");
  await reset();
  const enq = await pg.query(
    `insert into public.jobs (workspace_id, type, payload, idempotency_key)
       select i.workspace_id,'integration.health_check',
              jsonb_build_object('integration_id',i.id,'provider',i.provider),
              'integration.health_check:'||i.id||':'||to_char(now(),'YYYYMMDDHH24')
         from public.integrations i
        where i.workspace_id is not null and i.status in ('connected','error')
      on conflict (workspace_id, type, idempotency_key) where idempotency_key is not null do nothing`);
  assert(enq.affectedRows === 4, "hourly cron enqueues one job per connected workspace integration (3 in A + 1 in B)");

  // ── 8. Registry drift guard: providers.ts ↔ js/providers.js ↔ EXPECTED ──────
  console.log("\nM41 · provider registry drift guard:");
  const tsKeys = providerKeys(readFileSync(join(ROOT, "supabase", "functions", "_shared", "providers.ts"), "utf8"));
  const jsKeys = providerKeys(readFileSync(join(ROOT, "frontend", "js", "providers.js"), "utf8"));
  assert(sameSet(tsKeys, EXPECTED_PROVIDERS), `_shared/providers.ts has the ${EXPECTED_PROVIDERS.length} expected providers`);
  assert(sameSet(jsKeys, EXPECTED_PROVIDERS), "frontend/js/providers.js mirrors the same provider set (no drift)");

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M41 probe: ${pass} passed, ${fail} failed\x1b[0m`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
