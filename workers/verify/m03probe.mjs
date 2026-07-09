// m03probe.mjs — verify the M03 Billing & Usage Metering slice on REAL Postgres
// (PGlite, no Docker). Proves the DoD headline (Gate 3, metering): meter_increment
// writes the ledger AND upserts the month counter atomically, accumulates exactly,
// draws credit wallets without going negative; meter_check + has_feature return the
// right gates; the trial-expiry sweep flips billing_state; and the tenancy wall holds
// on every billing/usage table (Gate 1). Loads migrations 0000,0001,0002,0003,0009.
//
//   node workers/verify/m03probe.mjs        (after `npm install`)
//
// Exit code 0 = all assertions passed; 1 = a failure/leak was detected.
//
// Harness stubs (probe-only, same spirit as m00/m01/m02probe): auth.users +
// auth.uid(), the authenticated/service_role roles the migrations grant to, and a
// pg_cron-free run (0009 guards its cron.schedule in an exception block, so this
// file loads where the extension is absent). The meter_* helpers are SECURITY
// DEFINER and are meant to be called by the server (service role / Edge Function),
// so we exercise them from the reset (superuser) context — the intended caller.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const OWNER_A = "11111111-1111-1111-1111-111111111111";
const STAFF_A = "22222222-2222-2222-2222-222222222222";
const OWNER_B = "33333333-3333-3333-3333-333333333333"; // agency B owner (the attacker)
const WSA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WSB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

// Strip `create extension` lines (PGlite has no pg_cron/vector/etc.).
const load = (n) => readFileSync(join(MIG, n), "utf8")
  .split("\n").filter((l) => !/^\s*create\s+extension/i.test(l)).join("\n");

const num = async (pg, sql, params) => Number((await pg.query(sql, params)).rows[0].n);
const one = async (pg, sql, params) => (await pg.query(sql, params)).rows[0];
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

  // Enum ADD VALUE must commit before any row uses the new values; run 0009 in its
  // own exec so the added enum values are usable in the seed that follows.
  for (const m of ["0000_extensions_enums.sql", "0001_tenancy.sql", "0002_jobs.sql", "0003_meters_plans.sql", "0009_m03_billing.sql"]) {
    await pg.exec(load(m));
  }
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);

  // ── Seed: two isolated agencies + a plan each ───────────────────────────────
  await pg.exec(`
    insert into auth.users (id,email) values
      ('${OWNER_A}','owner.a@t'),('${STAFF_A}','staff.a@t'),('${OWNER_B}','owner.b@t');
    insert into public.profiles (id,email,name) values
      ('${OWNER_A}','owner.a@t','Owner A'),('${STAFF_A}','staff.a@t','Staff A'),('${OWNER_B}','owner.b@t','Owner B');
    insert into public.workspaces (id,owner_id,name,slug,plan) values
      ('${WSA}','${OWNER_A}','Acme','acme','agency'),
      ('${WSB}','${OWNER_B}','Beacon','beacon','free');
    insert into public.memberships (workspace_id,user_id,role,status) values
      ('${WSA}','${OWNER_A}','owner','active'),('${WSA}','${STAFF_A}','staff','active'),
      ('${WSB}','${OWNER_B}','owner','active');

    -- Two plans: A on agency (voice ON), B on free (voice OFF).
    insert into public.plans (id,tier,name,monthly_price,included,feature_gates) values
      ('90000000-0000-0000-0000-0000000000a1','agency','Agency',399,
        '{"email":100000,"sms":10000,"ai_tokens":15000000,"image_gen":2000,"seo_calls":50000,"enrichment":5000,"voice_minutes":1000}',
        '{"m34_voice":true,"m16_campaigns":true}'),
      ('90000000-0000-0000-0000-0000000000f1','free','Free',0,
        '{"email":500,"sms":0,"ai_tokens":50000,"image_gen":10}',
        '{"m34_voice":false,"m16_campaigns":false}');

    -- A is active on Agency; B is mid-trial (window already lapsed) on Free.
    insert into public.subscriptions_platform (workspace_id,plan_id,status,current_period_end) values
      ('${WSA}','90000000-0000-0000-0000-0000000000a1','active',   now() + interval '20 days'),
      ('${WSB}','90000000-0000-0000-0000-0000000000f1','trialing', now() - interval '1 day');

    -- A prepaid wallet for A (ai_tokens) to prove the credit draw + never-negative.
    insert into public.credit_wallets (workspace_id,kind,balance) values ('${WSA}','ai_tokens',1000);
  `);

  const as = (sub) => pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);
  const period = `date_trunc('month', now())::date`;

  // ═══ 1. meter_increment — ledger + counter, atomically ════════════════════
  console.log("\nM03 · meter_increment writes the ledger AND upserts the counter:");
  await reset();  // service-role / Edge Function path
  await pg.query(`select public.meter_increment($1,'email',100,'resend',0.0001,null)`, [WSA]);
  assert(await num(pg, `select count(*)::int n from public.usage_events where workspace_id=$1 and kind='email'`, [WSA]) === 1,
    "one usage_events ledger row appended");
  assert(await num(pg, `select coalesce(quantity,0)::int n from public.usage_meters where workspace_id=$1 and kind='email' and period=${period}`, [WSA]) === 100,
    "usage_meters counter = 100 for the current period");
  assert((await one(pg, `select unit_cost from public.usage_events where workspace_id=$1 and kind='email' limit 1`, [WSA])).unit_cost != null,
    "ledger row stored a real unit_cost (rebilling data — §8)");

  // ═══ 2. Accumulation — N increments sum to exactly N (upsert correctness) ══
  console.log("\nM03 · N increments accumulate to exactly N (row-lock upsert):");
  for (let i = 0; i < 5; i++) await pg.query(`select public.meter_increment($1,'sms',1,'twilio',0.0079,null)`, [WSA]);
  assert(await num(pg, `select coalesce(quantity,0)::int n from public.usage_meters where workspace_id=$1 and kind='sms' and period=${period}`, [WSA]) === 5,
    "5 sms increments → counter exactly 5 (no lost updates)");
  assert(await num(pg, `select count(*)::int n from public.usage_events where workspace_id=$1 and kind='sms'`, [WSA]) === 5,
    "5 immutable ledger rows (one per increment)");

  // ═══ 3. Credit wallet draw + never negative ═══════════════════════════════
  console.log("\nM03 · credit wallet is drawn and never goes negative:");
  await pg.query(`select public.meter_increment($1,'ai_tokens',300,'openai',0.000002,null)`, [WSA]);
  assert(await num(pg, `select balance::int n from public.credit_wallets where workspace_id=$1 and kind='ai_tokens'`, [WSA]) === 700,
    "wallet drawn 1000 → 700 after a 300 increment");
  await pg.query(`select public.meter_increment($1,'ai_tokens',5000,'openai',0.000002,null)`, [WSA]);
  assert(await num(pg, `select balance::int n from public.credit_wallets where workspace_id=$1 and kind='ai_tokens'`, [WSA]) === 0,
    "wallet clamps at 0 (never negative) when drawn past balance");

  // ═══ 4. meter_check — included/used/remaining/over ════════════════════════
  console.log("\nM03 · meter_check reflects plan quota, usage and wallet:");
  const chkUnder = await one(pg, `select public.meter_check($1,'email',50) j`, [WSA]);
  assert(chkUnder.j.included === 100000 && chkUnder.j.used === 100 && chkUnder.j.over === false,
    "under quota → included=100000, used=100, over=false");
  const chkOver = await one(pg, `select public.meter_check($1,'email',200000) j`, [WSA]);
  assert(chkOver.j.over === true, "requesting more than remaining quota → over=true");
  // image_gen: included 2000, no wallet → asking 2500 is over; a wallet would extend it.
  const chkHard = await one(pg, `select public.meter_check($1,'image_gen',2500) j`, [WSA]);
  assert(chkHard.j.over === true, "HARD_STOP meter over quota with no wallet → over=true");

  // ═══ 5. has_feature — server-side gate ════════════════════════════════════
  console.log("\nM03 · has_feature reads the plan's feature_gates:");
  assert((await one(pg, `select public.has_feature($1,'m34_voice') v`, [WSA])).v === true,
    "Agency workspace HAS m34_voice");
  assert((await one(pg, `select public.has_feature($1,'m34_voice') v`, [WSB])).v === false,
    "Free workspace does NOT have m34_voice");
  assert((await one(pg, `select public.has_feature($1,'nonexistent_flag') v`, [WSA])).v === false,
    "unknown flag → false (coalesced)");

  // ═══ 6. Trial-expiry sweep flips billing_state ════════════════════════════
  console.log("\nM03 · trial-expiry sweep flips a lapsed trial to read-only:");
  assert((await one(pg, `select billing_state b from public.workspaces where id=$1`, [WSB])).b === "active",
    "B starts active (default)");
  // The pg_cron body (0009) run inline — the sweep the daily job performs.
  await pg.exec(`
    update public.workspaces w set billing_state='trial_expired', updated_at=now()
     where w.billing_state='active'
       and exists (select 1 from public.subscriptions_platform s
                    where s.workspace_id=w.id and s.status='trialing' and s.current_period_end < now());`);
  assert((await one(pg, `select billing_state b from public.workspaces where id=$1`, [WSB])).b === "trial_expired",
    "B's lapsed trial flips to trial_expired");
  assert((await one(pg, `select billing_state b from public.workspaces where id=$1`, [WSA])).b === "active",
    "A (active, not trialing) is untouched by the sweep");

  // ═══ 7. Tenancy wall — B cannot read A's billing/usage (Gate 1) ═══════════
  console.log("\nM03 · cross-tenant isolation (impersonating agency B's owner):");
  // Seed a stripe_events row (service-role write) to prove it's unreadable to anyone.
  await pg.query(`insert into public.stripe_events (id,type,workspace_id) values ('evt_test','invoice.paid',$1)`, [WSA]);
  await reset(); await as(OWNER_B);
  assert(await num(pg, `select count(*)::int n from public.subscriptions_platform where workspace_id=$1`, [WSA]) === 0,
    "B cannot SELECT A's subscription");
  assert(await num(pg, `select count(*)::int n from public.usage_meters where workspace_id=$1`, [WSA]) === 0,
    "B cannot SELECT A's usage_meters");
  assert(await num(pg, `select count(*)::int n from public.usage_events where workspace_id=$1`, [WSA]) === 0,
    "B cannot SELECT A's usage_events");
  assert(await num(pg, `select count(*)::int n from public.credit_wallets where workspace_id=$1`, [WSA]) === 0,
    "B cannot SELECT A's credit_wallets");
  assert(await num(pg, `select count(*)::int n from public.stripe_events`) === 0,
    "stripe_events is invisible to authenticated (service-role only)");
  assert((await pg.query(`update public.usage_meters set quantity=0 where workspace_id=$1`, [WSA])).affectedRows === 0,
    "B cannot UPDATE A's usage_meters (no write policy — service role only)");
  assert(await denied(pg, `insert into public.usage_meters (workspace_id,kind,period,quantity) values ($1,'email',${period},1)`, [WSA]),
    "B cannot INSERT usage_meters directly (writes go through meter_increment server-side)");
  // Positive control: B CAN read its own subscription.
  assert(await num(pg, `select count(*)::int n from public.subscriptions_platform where workspace_id=$1`, [WSB]) === 1,
    "B CAN SELECT its own subscription (positive control)");
  // Plans are a global catalog (any authenticated user reads them).
  assert(await num(pg, `select count(*)::int n from public.plans`) === 2,
    "B CAN read the global plans catalog (positive control)");

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M03 probe: ${pass} passed, ${fail} failed\x1b[0m`);
  await pg.close();
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
