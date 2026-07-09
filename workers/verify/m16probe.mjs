// m16probe.mjs — verify the M16 Campaigns slice on REAL Postgres (PGlite, no Docker).
// Proves the DoD gates checkable without a live SendGrid/Twilio stack:
//   Gate-1 tenancy  — B's staff cannot reach any of A's 9 campaign tables.
//   Gate-2 matrix   — staff+ create/edit campaigns, manager+ delete; sequences config
//                     manager+; client write-ceiling.
//   D-087           — send_events / suppressions / campaign_stats are service-role
//                     write only; no member (even manager) can forge a row.
//   Audience        — resolve_campaign_audience excludes suppressed + email-opted-out
//                     contacts (most-recent-wins, matching consent-check).
//   D-088 unsub     — unsubscribe_email dual-writes a suppression AND an M05 consent
//                     opt-out; a second call is idempotent on the block list.
//   Stats trigger   — every send_event rolls into campaign_stats (D-087).
//   Templates       — global builtins are world-readable; the 10 seeds exist.
//
//   node workers/verify/m16probe.mjs        (after `npm install`)
//
// Exit 0 = all assertions passed; 1 = a failure/leak was detected.
//
// Harness mirrors m28probe: auth.users + auth.uid(), authenticated/service_role
// roles, direct membership seeding. Loads the minimal dependency chain (tenancy +
// M05 consent + M09 contacts) then 0020. emit_trigger/meter_* (M13/M03) are only
// called by the worker at runtime, so they are not needed to load the migration.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const OWNER_A = "11111111-1111-1111-1111-111111111111";
const ADMIN_A = "22222222-2222-2222-2222-222222222222";
const STAFF_A = "66666666-6666-6666-6666-666666666666";
const MANAGER_A = "99999999-9999-9999-9999-999999999999";
const CLIENT_A = "77777777-7777-7777-7777-777777777777";
const OWNER_B = "33333333-3333-3333-3333-333333333333";
const STAFF_B = "44444444-4444-4444-4444-444444444444"; // agency B staff (the attacker)

const WSA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WSB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const C_PLAIN = "cccccccc-cccc-cccc-cccc-ccccccccccc1"; // eligible
const C_SUPP = "cccccccc-cccc-cccc-cccc-ccccccccccc2";  // suppressed
const C_OUT = "cccccccc-cccc-cccc-cccc-ccccccccccc3";   // email-opted-out

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

const load = (n) => readFileSync(join(MIG, n), "utf8").split("\n")
  .filter((l) => !/^\s*create\s+extension/i.test(l))
  .filter((l) => !/gin_trgm_ops/i.test(l))
  .join("\n");

const count = async (pg, sql, params) => Number((await pg.query(sql, params)).rows[0].n);
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

  for (const m of ["0000_extensions_enums.sql", "0001_tenancy.sql", "0002_jobs.sql",
                   "0010_m05_compliance.sql", "0013_m09_crm.sql"]) {
    await pg.exec(load(m));
  }
  await pg.exec(load("0024_m16_campaigns.sql"));

  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);

  const TABLES = ["email_campaigns", "campaign_stats", "sequences", "sequence_steps",
    "sequence_enrollments", "suppressions", "send_events", "email_templates", "sender_identities"];

  // ── 0. Schema — 9 tables, RLS forced, service-role ledgers have no write policy ─
  console.log("\nM16 · schema (9 tables, RLS, service-role ledgers):");
  for (const t of TABLES) assert(!!(await one(pg, `select to_regclass('public.${t}') t`)).t, `table ${t} exists`);
  assert(await count(pg, `select count(*)::int n from pg_class where relname = any($1) and relrowsecurity`, [TABLES]) === TABLES.length,
    "RLS enabled on all 9 tables");
  for (const t of ["send_events", "suppressions", "campaign_stats"]) {
    const cmds = (await pg.query(`select distinct cmd from pg_policies where tablename=$1`, [t])).rows.map((r) => r.cmd);
    assert(cmds.length === 1 && /select/i.test(cmds[0]), `${t} has SELECT-only policy (service-role write, D-087)`);
  }
  assert(await count(pg, `select count(*)::int n from public.email_templates where is_builtin=true`) === 10,
    "10 global builtin templates seeded");

  // ── Seed two agencies + members + WSA contacts ──────────────────────────────
  await pg.exec(`
    insert into auth.users (id,email) values
      ('${OWNER_A}','owner.a@x.test'),('${ADMIN_A}','admin.a@x.test'),('${STAFF_A}','staff.a@x.test'),
      ('${MANAGER_A}','mgr.a@x.test'),('${CLIENT_A}','client.a@x.test'),
      ('${OWNER_B}','owner.b@x.test'),('${STAFF_B}','staff.b@x.test')
    on conflict (id) do nothing;
    insert into public.profiles (id,email,name) values
      ('${OWNER_A}','owner.a@x.test','Owner A'),('${ADMIN_A}','admin.a@x.test','Admin A'),
      ('${STAFF_A}','staff.a@x.test','Staff A'),('${MANAGER_A}','mgr.a@x.test','Manager A'),
      ('${CLIENT_A}','client.a@x.test','Client A'),
      ('${OWNER_B}','owner.b@x.test','Owner B'),('${STAFF_B}','staff.b@x.test','Staff B')
    on conflict (id) do nothing;
    insert into public.workspaces (id,owner_id,name,slug) values
      ('${WSA}','${OWNER_A}','Acme Agency','acme'),('${WSB}','${OWNER_B}','Beacon Media','beacon');
    insert into public.memberships (workspace_id,user_id,role,status) values
      ('${WSA}','${OWNER_A}','owner','active'),('${WSA}','${ADMIN_A}','admin','active'),
      ('${WSA}','${STAFF_A}','staff','active'),('${WSA}','${MANAGER_A}','manager','active'),
      ('${WSA}','${CLIENT_A}','client','active'),
      ('${WSB}','${OWNER_B}','owner','active'),('${WSB}','${STAFF_B}','staff','active');
    insert into public.contacts (id,workspace_id,first_name,last_name,email,source) values
      ('${C_PLAIN}','${WSA}','Aisha','Rahman','aisha@x.test','referral'),
      ('${C_SUPP}','${WSA}','Bilal','Khan','bilal@x.test','referral'),
      ('${C_OUT}','${WSA}','Sara','Ali','sara@x.test','referral');
    -- A WSB campaign (B's positive control + A's leak target).
    insert into public.email_campaigns (workspace_id,name) values ('${WSB}','Beacon Broadcast');
  `);

  const as = (sub) => pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);

  // ── 1. Cross-tenant isolation — B's staff cannot reach A (Gate-1) ────────────
  console.log("\nM16 · cross-tenant isolation (agency B staff attacking agency A):");
  await as(STAFF_A);
  const campA = (await one(pg,
    `insert into public.email_campaigns (workspace_id,name,subject) values ($1,'Acme Promo','Hi {{first_name}}') returning id`, [WSA]));

  await reset(); await as(STAFF_B);
  for (const t of TABLES) {
    assert(await count(pg, `select count(*)::int n from public.${t} where workspace_id=$1`, [WSA]) === 0,
      `B cannot SELECT A's ${t}`);
  }
  assert(await denied(pg, `insert into public.email_campaigns (workspace_id,name) values ($1,'x')`, [WSA]),
    "B cannot INSERT a campaign into A");
  assert((await pg.query(`update public.email_campaigns set name='hacked' where workspace_id=$1`, [WSA])).affectedRows === 0,
    "B cannot UPDATE A's campaign (0 rows)");
  assert((await pg.query(`delete from public.email_campaigns where workspace_id=$1`, [WSA])).affectedRows === 0,
    "B cannot DELETE A's campaign (0 rows)");
  assert(await count(pg, `select count(*)::int n from public.email_campaigns where workspace_id=$1`, [WSB]) === 1,
    "B CAN SELECT its own campaigns (positive control)");

  // ── 2. Role matrix (Gate-2) ─────────────────────────────────────────────────
  console.log("\nM16 · role matrix (staff+ campaign · manager+ delete/sequence-config · client ceiling):");
  await reset(); await as(CLIENT_A);
  assert(await denied(pg, `insert into public.email_campaigns (workspace_id,name) values ($1,'x')`, [WSA]),
    "client CANNOT create a campaign (write-ceiling: staff+)");
  await reset(); await as(STAFF_A);
  assert((await pg.query(`delete from public.email_campaigns where id=$1`, [campA.id])).affectedRows === 0,
    "staff CANNOT delete a campaign (manager+ only, 0 rows)");
  assert(await denied(pg, `insert into public.sequences (workspace_id,name) values ($1,'x')`, [WSA]),
    "staff CANNOT create a sequence (config = manager+)");
  await reset(); await as(MANAGER_A);
  assert(!(await denied(pg, `update public.email_campaigns set name='Acme Promo v2' where id=$1`, [campA.id])),
    "manager CAN edit a campaign");
  assert(!!(await one(pg, `insert into public.sequences (workspace_id,name) values ($1,'Nurture') returning id`, [WSA])).id,
    "manager CAN create a sequence");

  // ── 3. D-087 — send_events / suppressions are service-role only ─────────────
  console.log("\nM16 · delivery ledger + block list are service-role only (D-087):");
  await reset(); await as(MANAGER_A); // even a manager cannot forge these
  assert(await denied(pg, `insert into public.send_events (workspace_id,campaign_id,type) values ($1,$2,'opened')`, [WSA, campA.id]),
    "no member (even manager) can INSERT a send_event — delivery history is server-written");
  assert(await denied(pg, `insert into public.suppressions (workspace_id,email,reason) values ($1,'x@x.test','manual')`, [WSA]),
    "no member (even manager) can INSERT a suppression directly");

  // ── 4. Audience resolver excludes suppressed + opted-out (accept-when) ───────
  console.log("\nM16 · audience resolver excludes suppressed + consent-opted-out:");
  await reset(); // service role
  await pg.query(`select public.suppress_email($1,$2,'bounce','test')`, [WSA, "bilal@x.test"]);
  await pg.query(`insert into public.consent_records (workspace_id,contact_id,kind,granted,source)
                  values ($1,$2,'email_optin',false,'manual')`, [WSA, C_OUT]);
  await as(STAFF_A);
  assert(await count(pg, `select count(*)::int n from public.resolve_campaign_audience($1,'{"type":"all"}')`, [WSA]) === 1,
    "audience 'all' returns only the 1 eligible contact (suppressed + opted-out excluded)");

  // opting back IN (a newer opt-in) re-includes the contact (most-recent-wins).
  await reset();
  await pg.query(`insert into public.consent_records (workspace_id,contact_id,kind,granted,source)
                  values ($1,$2,'email_optin',true,'form')`, [WSA, C_OUT]);
  await as(STAFF_A);
  assert(await count(pg, `select count(*)::int n from public.resolve_campaign_audience($1,'{"type":"all"}')`, [WSA]) === 2,
    "a newer opt-in re-includes the contact (most-recent-wins); suppressed stays out");

  // ── 5. D-088 — unsubscribe dual-writes suppression + consent opt-out ─────────
  console.log("\nM16 · unsubscribe dual-writes suppression + M05 consent opt-out (D-088):");
  await reset();
  await pg.query(`select public.unsubscribe_email($1,$2,$3)`, [WSA, "aisha@x.test", C_PLAIN]);
  assert(await count(pg, `select count(*)::int n from public.suppressions where workspace_id=$1 and lower(email)='aisha@x.test'`, [WSA]) === 1,
    "unsubscribe wrote a suppression row");
  assert(await count(pg, `select count(*)::int n from public.consent_records where workspace_id=$1 and contact_id=$2 and kind='email_optin' and granted=false and source='unsub_link'`, [WSA, C_PLAIN]) === 1,
    "unsubscribe wrote an M05 consent opt-out row");
  await pg.query(`select public.unsubscribe_email($1,$2,$3)`, [WSA, "aisha@x.test", C_PLAIN]);
  assert(await count(pg, `select count(*)::int n from public.suppressions where workspace_id=$1 and lower(email)='aisha@x.test'`, [WSA]) === 1,
    "a second unsubscribe is idempotent on the block list (still 1 suppression)");
  // and now aisha is excluded from the audience too.
  await as(STAFF_A);
  assert(await count(pg, `select count(*)::int n from public.resolve_campaign_audience($1,'{"type":"all"}')`, [WSA]) === 1,
    "the unsubscribed contact drops out of the audience");

  // ── 6. Stats trigger — send_events roll into campaign_stats (D-087) ──────────
  console.log("\nM16 · send_events roll into campaign_stats:");
  await reset(); // service role writes the ledger
  for (const ty of ["sent", "delivered", "opened", "clicked", "bounced"]) {
    await pg.query(`insert into public.send_events (workspace_id,campaign_id,contact_id,email,type) values ($1,$2,$3,'aisha@x.test',$4)`,
      [WSA, campA.id, C_PLAIN, ty]);
  }
  const stats = await one(pg, `select sent,delivered,opened,clicked,bounced from public.campaign_stats where campaign_id=$1`, [campA.id]);
  assert(Number(stats.sent) === 1 && Number(stats.delivered) === 1 && Number(stats.opened) === 1
      && Number(stats.clicked) === 1 && Number(stats.bounced) === 1,
    "campaign_stats reflects one of each send_event type");

  // ── 6b. Audience resolver is member-gated for authenticated callers ─────────
  console.log("\nM16 · audience resolver member gate:");
  await reset(); await as(STAFF_B);
  assert(await denied(pg, `select public.resolve_campaign_audience($1,'{"type":"all"}')`, [WSA]),
    "a non-member (B staff) CANNOT resolve A's audience");

  // ── 7. Fan-out enqueuers — the two cron bodies enqueue queued jobs (Gate-4) ──
  console.log("\nM16 · dispatch/tick enqueuers (cron → jobs, never send):");
  await reset(); // service role
  // A due scheduled broadcast → dispatch flips it to 'sending' + enqueues campaign.send.
  const schedCamp = (await one(pg,
    `insert into public.email_campaigns (workspace_id,name,status,scheduled_at)
     values ($1,'Scheduled Blast','scheduled', now() - interval '1 minute') returning id`, [WSA]));
  const dispN = Number((await one(pg, `select public.dispatch_scheduled_broadcasts() n`)).n);
  assert(dispN >= 1, `dispatch flipped ${dispN} due broadcast(s)`);
  assert((await one(pg, `select status from public.email_campaigns where id=$1`, [schedCamp.id])).status === "sending",
    "due scheduled broadcast flipped to 'sending'");
  assert(await count(pg, `select count(*)::int n from public.jobs where type='campaign.send' and status='queued' and payload->>'campaign_id'=$1`, [schedCamp.id]) === 1,
    "dispatch enqueued exactly one queued campaign.send job");
  // A due active enrollment → tick enqueues a sequence.step job.
  const seqRow = (await one(pg, `insert into public.sequences (workspace_id,name) values ($1,'Drip') returning id`, [WSA]));
  const enr = (await one(pg,
    `insert into public.sequence_enrollments (workspace_id,sequence_id,contact_id,status,next_run_at)
     values ($1,$2,$3,'active', now() - interval '1 minute') returning id`, [WSA, seqRow.id, C_SUPP]));
  const tickN = Number((await one(pg, `select public.tick_due_enrollments() n`)).n);
  assert(tickN >= 1, `tick enqueued ${tickN} due enrollment step(s)`);
  assert(await count(pg, `select count(*)::int n from public.jobs where type='sequence.step' and status='queued' and payload->>'enrollment_id'=$1`, [enr.id]) === 1,
    "tick enqueued exactly one queued sequence.step job");

  // ── 8. Template global read (any member sees the 10 builtins) ───────────────
  console.log("\nM16 · global builtin templates are readable by any member:");
  await as(STAFF_B);
  assert(await count(pg, `select count(*)::int n from public.email_templates where is_builtin=true`) === 10,
    "agency B staff can read the 10 global templates (workspace_id null)");

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M16 probe: ${pass} passed, ${fail} failed\x1b[0m`);
  await pg.close();
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((e) => { console.error("harness error:", e); process.exitCode = 2; });
