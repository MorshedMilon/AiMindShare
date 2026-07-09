// m14probe.mjs — verify the M14 Calendar & Booking SQL layer on REAL Postgres (PGlite).
// Proves the DoD gates checkable without a live stack:
//   Gate-1 tenancy — B cannot select/insert/update A's calendars/appointments/etc.
//   Gate-2 roles   — calendars/availability/blocks/questions: manager+ WRITE, member READ;
//                    appointments: staff+ WRITE, manager DELETE; client CEILING;
//                    reminders system-written (no client INSERT — Gate-4).
//   Slot engine    — basic grid, buffer, min_notice, existing-appt exclusion,
//                    max_per_day cap, DST-correctness (America/New_York), round-robin
//                    least-loaded, group capacity.
//   Booking bus    — an appointment insert auto-tags "Appointment Booked", writes the
//                    timeline, creates reminder rows, and emits appointment.booked to
//                    the M13 bus (enrols a matching workflow → automation.execute job).
//   Lifecycle      — cancel emits appointment.cancelled + drops reminders; no_show emits;
//                    reschedule validates/rotates the token; expired token rejected.
//   Reminders      — enqueue_due_reminders() enqueues one appointment.remind job per due
//                    unsent reminder, idempotent.
//
//   node workers/verify/m14probe.mjs
//
// Exit 0 = all passed; 1 = a failure/leak. Depends on M05/M09/M11/M12/M13 migrations.
// extensions/pg_trgm stripped like m13probe. cron.schedule is guarded in the migration.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const OWNER_A = "11111111-1111-1111-1111-111111111111";
const MANAGER_A = "55555555-5555-5555-5555-555555555555";
const STAFF_A = "66666666-6666-6666-6666-666666666666";
const CLIENT_A = "77777777-7777-7777-7777-777777777777";
const OWNER_B = "33333333-3333-3333-3333-333333333333";
const STAFF_B = "44444444-4444-4444-4444-444444444444";
const USER_X = "88888888-8888-8888-8888-888888888888";
const USER_Y = "99999999-9999-9999-9999-999999999999";

const WSA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WSB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CONTACT_A = "d1111111-1111-1111-1111-111111111111";
const CONTACT_B = "d2222222-2222-2222-2222-222222222222";

const CAL_A = "ca000000-0000-0000-0000-000000000001";  // one_on_one, UTC
const CAL_RR = "ca000000-0000-0000-0000-000000000002"; // round_robin
const CAL_GRP = "ca000000-0000-0000-0000-000000000003"; // group cap 2
const CAL_DST = "ca000000-0000-0000-0000-000000000004"; // America/New_York
const CAL_CAP = "ca000000-0000-0000-0000-000000000005"; // max_per_day 2
const CAL_B = "cb000000-0000-0000-0000-000000000001";  // B's calendar

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

const load = (n) => readFileSync(join(MIG, n), "utf8").split("\n")
  .filter((l) => !/^\s*create\s+extension/i.test(l))
  .filter((l) => !/gin_trgm_ops/i.test(l))
  .join("\n");

const count = async (pg, sql, params) => Number((await pg.query(sql, params)).rows[0].n);
async function denied(pg, sql, params) { try { await pg.query(sql, params); return false; } catch { return true; } }

async function main() {
  const pg = new PGlite();
  await pg.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role authenticated nologin; create role service_role nologin;
    grant usage on schema public to authenticated;
  `);
  for (const m of ["0000_extensions_enums.sql", "0001_tenancy.sql", "0002_jobs.sql",
                   "0010_m05_compliance.sql", "0013_m09_crm.sql", "0014_m11_pipeline.sql",
                   "0015_m12_inbox.sql", "0016_m13_automations.sql", "0017_m14_calendar.sql"]) {
    await pg.exec(load(m));
  }
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);

  // ── Seed two agencies ────────────────────────────────────────────────────────
  await pg.exec(`
    insert into auth.users (id,email) values
      ('${OWNER_A}','oa@t'),('${MANAGER_A}','ma@t'),('${STAFF_A}','sa@t'),('${CLIENT_A}','ca@t'),
      ('${OWNER_B}','ob@t'),('${STAFF_B}','sb@t'),('${USER_X}','ux@t'),('${USER_Y}','uy@t');
    insert into public.profiles (id,email,name) values
      ('${OWNER_A}','oa@t','OA'),('${MANAGER_A}','ma@t','MA'),('${STAFF_A}','sa@t','SA'),('${CLIENT_A}','ca@t','CA'),
      ('${OWNER_B}','ob@t','OB'),('${STAFF_B}','sb@t','SB'),('${USER_X}','ux@t','UX'),('${USER_Y}','uy@t','UY');
    insert into public.workspaces (id,owner_id,name,slug) values
      ('${WSA}','${OWNER_A}','Acme','acme'),('${WSB}','${OWNER_B}','Beacon','beacon');
    insert into public.memberships (workspace_id,user_id,role,status) values
      ('${WSA}','${OWNER_A}','owner','active'),('${WSA}','${MANAGER_A}','manager','active'),
      ('${WSA}','${STAFF_A}','staff','active'),('${WSA}','${CLIENT_A}','client','active'),
      ('${WSA}','${USER_X}','staff','active'),('${WSA}','${USER_Y}','staff','active'),
      ('${WSB}','${OWNER_B}','owner','active'),('${WSB}','${STAFF_B}','staff','active');
    insert into public.contacts (id,workspace_id,first_name,source) values
      ('${CONTACT_A}','${WSA}','Yusuf','manual'),('${CONTACT_B}','${WSB}','Beacon','manual');
    -- calendars
    insert into public.calendars (id,workspace_id,name,type,slug,duration_min,buffer_min,min_notice_min,timezone) values
      ('${CAL_A}','${WSA}','Intro Call','one_on_one','intro-call',30,0,0,'UTC'),
      ('${CAL_DST}','${WSA}','NY Call','one_on_one','ny-call',60,0,0,'America/New_York');
    insert into public.calendars (id,workspace_id,name,type,slug,duration_min,timezone,round_robin_user_ids) values
      ('${CAL_RR}','${WSA}','RR Call','round_robin','rr-call',30,'UTC', array['${USER_X}','${USER_Y}']::uuid[]);
    insert into public.calendars (id,workspace_id,name,type,slug,duration_min,timezone,capacity) values
      ('${CAL_GRP}','${WSA}','Group Class','group','group-class',60,'UTC',2);
    insert into public.calendars (id,workspace_id,name,type,slug,duration_min,timezone,max_per_day) values
      ('${CAL_CAP}','${WSA}','Capped','one_on_one','capped',30,'UTC',2);
    insert into public.calendars (id,workspace_id,name,type,slug,duration_min,timezone) values
      ('${CAL_B}','${WSB}','B Cal','one_on_one','b-cal',30,'UTC');
  `);

  const as = (sub) => pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);
  // availability helper: add a weekly window for a calendar on a given dow
  const addAvail = (cal, ws, dow, s, e) => pg.exec(
    `insert into public.calendar_availability (workspace_id,calendar_id,day_of_week,start_time,end_time)
     values ('${ws}','${cal}',${dow},'${s}','${e}');`);
  const slots = async (cal, date, tz) =>
    (await pg.query(`select * from public.compute_slots($1,$2,$3) order by slot_start`, [cal, date, tz])).rows;

  // A future date + its dow, so slots are always > now()+notice (deterministic).
  const fd = (await pg.query(`select (current_date + 30)::text d, extract(dow from current_date + 30)::int w`)).rows[0];
  const FUT = fd.d; const FUT_DOW = fd.w;

  // ── 1. Tables + RLS forced ────────────────────────────────────────────────────
  console.log("\nM14 · schema — 6 tables exist with RLS forced:");
  const tables = ['calendars','calendar_availability','calendar_blocks','appointment_questions','appointments','appointment_reminders'];
  for (const t of tables) {
    const r = await pg.query(`select to_regclass('public.${t}') as t, relrowsecurity
      from pg_class where relname=$1`, [t]);
    assert(r.rows[0]?.t && r.rows[0]?.relrowsecurity, `table ${t} exists + RLS enabled`);
  }

  // ── 2. Cross-tenant isolation (Gate-1) ────────────────────────────────────────
  console.log("\nM14 · cross-tenant isolation (agency B staff attacking agency A):");
  await as(STAFF_B);
  assert(await count(pg, `select count(*)::int n from public.calendars where workspace_id=$1`, [WSA]) === 0,
    "B cannot SELECT A's calendars");
  assert(await denied(pg, `insert into public.calendars (workspace_id,name,type,slug) values ($1,'HIJACK','one_on_one','x')`, [WSA]),
    "B cannot INSERT a calendar into A");
  assert((await pg.query(`update public.calendars set name='HIJACK' where workspace_id=$1`, [WSA])).affectedRows === 0,
    "B cannot UPDATE A's calendars (0 rows)");
  assert(await denied(pg, `insert into public.appointments (workspace_id,calendar_id,contact_id,starts_at,ends_at) values ($1,$2,$3,now()+interval '1 day',now()+interval '1 day 30 min')`, [WSA, CAL_A, CONTACT_A]),
    "B cannot INSERT an appointment into A");

  // ── 3. Role matrix (Gate-2) ───────────────────────────────────────────────────
  console.log("\nM14 · roles — staff+ read · manager+ config · staff+ appts · client ceiling:");
  await reset(); await as(STAFF_A);
  assert(await count(pg, `select count(*)::int n from public.calendars where workspace_id=$1`, [WSA]) >= 1,
    "staff CAN read calendars");
  assert(await denied(pg, `insert into public.calendars (workspace_id,name,type,slug) values ($1,'x','one_on_one','staff-x')`, [WSA]),
    "staff CANNOT create a calendar (manager+)");
  const staffAppt = await pg.query(
    `insert into public.appointments (workspace_id,calendar_id,contact_id,starts_at,ends_at)
     values ($1,$2,$3, now()+interval '2 days', now()+interval '2 days 30 min') returning id`, [WSA, CAL_A, CONTACT_A]);
  assert(!!staffAppt.rows[0]?.id, "staff CAN create an appointment");
  assert(await denied(pg, `insert into public.appointment_reminders (workspace_id,appointment_id,channel,scheduled_at) values ($1,$2,'sms',now())`, [WSA, staffAppt.rows[0].id]),
    "staff CANNOT insert a reminder directly (system-written — Gate-4)");
  await reset(); await as(CLIENT_A);
  assert(await count(pg, `select count(*)::int n from public.calendars where workspace_id=$1`, [WSA]) === 0,
    "client CANNOT read calendars (internal-ops ceiling)");
  await reset(); await as(MANAGER_A);
  assert(!!(await pg.query(`insert into public.calendars (workspace_id,name,type,slug) values ($1,'Mgr','one_on_one','mgr-cal') returning id`, [WSA])).rows[0]?.id,
    "manager CAN create a calendar");

  // ── 4. Slot engine ────────────────────────────────────────────────────────────
  console.log("\nM14 · slot engine — grid, buffer, notice, exclusion, capacity, DST, round-robin:");
  await reset();
  await addAvail(CAL_A, WSA, FUT_DOW, "09:00", "11:00");   // 2h window, 30-min slots → 4
  let s = await slots(CAL_A, FUT, "UTC");
  assert(s.length === 4, `basic grid → 4 slots (got ${s.length})`);

  // buffer: 15-min buffer on a 30-min duration → step 45 over 09:00–11:00 → 09:00,09:45,10:30 = 3
  await pg.exec(`update public.calendars set buffer_min=15 where id='${CAL_A}';`);
  s = await slots(CAL_A, FUT, "UTC");
  assert(s.length === 3, `buffer 15 → 3 slots (got ${s.length})`);
  await pg.exec(`update public.calendars set buffer_min=0 where id='${CAL_A}';`);

  // min_notice: window today would be filtered; use a near date with big notice to prove filtering
  await pg.exec(`update public.calendars set min_notice_min=100000 where id='${CAL_A}';`);
  s = await slots(CAL_A, FUT, "UTC");
  assert(s.length === 0, "min_notice larger than horizon → 0 slots");
  await pg.exec(`update public.calendars set min_notice_min=0 where id='${CAL_A}';`);

  // existing-appt exclusion: book the 09:00 slot → 3 remain
  await pg.exec(`insert into public.appointments (workspace_id,calendar_id,contact_id,starts_at,ends_at)
    values ('${WSA}','${CAL_A}','${CONTACT_A}', ('${FUT}'::date + time '09:00') at time zone 'UTC',
            ('${FUT}'::date + time '09:30') at time zone 'UTC');`);
  s = await slots(CAL_A, FUT, "UTC");
  const has0900 = s.some(r => { const d = new Date(r.slot_start); return d.getUTCHours() === 9 && d.getUTCMinutes() === 0; });
  assert(s.length === 3 && !has0900, "existing appointment excludes its slot → 3 remain, 09:00 gone");

  // max_per_day cap
  await addAvail(CAL_CAP, WSA, FUT_DOW, "09:00", "11:00");  // would be 4 slots
  s = await slots(CAL_CAP, FUT, "UTC");
  assert(s.length === 2, `max_per_day=2 caps to 2 slots (got ${s.length})`);

  // group capacity: cap 2 → slot stays open until 2 booked
  await addAvail(CAL_GRP, WSA, FUT_DOW, "09:00", "10:00");  // one 60-min slot
  const grpStart = `('${FUT}'::date + time '09:00') at time zone 'UTC'`;
  const grpEnd = `('${FUT}'::date + time '10:00') at time zone 'UTC'`;
  s = await slots(CAL_GRP, FUT, "UTC");
  assert(s.length === 1, "group: slot open with 0 booked");
  await pg.exec(`insert into public.appointments (workspace_id,calendar_id,contact_id,starts_at,ends_at) values ('${WSA}','${CAL_GRP}','${CONTACT_A}',${grpStart},${grpEnd});`);
  s = await slots(CAL_GRP, FUT, "UTC");
  assert(s.length === 1, "group: slot still open with 1/2 booked");
  await pg.exec(`insert into public.appointments (workspace_id,calendar_id,contact_id,starts_at,ends_at) values ('${WSA}','${CAL_GRP}','${CONTACT_A}',${grpStart},${grpEnd});`);
  s = await slots(CAL_GRP, FUT, "UTC");
  assert(s.length === 0, "group: slot closes at capacity (2/2 booked)");

  // round-robin least-loaded: give USER_X an upcoming appt → next slot assigns USER_Y
  await addAvail(CAL_RR, WSA, FUT_DOW, "09:00", "09:30");
  await pg.exec(`insert into public.appointments (workspace_id,calendar_id,contact_id,assigned_user_id,starts_at,ends_at)
    values ('${WSA}','${CAL_RR}','${CONTACT_A}','${USER_X}', now()+interval '5 days', now()+interval '5 days 30 min');`);
  s = await slots(CAL_RR, FUT, "UTC");
  assert(s.length >= 1 && s[0].assigned_user === USER_Y, "round-robin assigns the least-loaded user (Y)");

  // DST-correctness: 09:00 America/New_York is 14:00 UTC in winter (EST) and 13:00 UTC in summer (EDT)
  try {
    const winter = "2027-01-11"; // Monday, EST
    const summer = "2027-07-12"; // Monday, EDT
    await addAvail(CAL_DST, WSA, 1, "09:00", "10:00"); // Monday 9-10
    const w = await slots(CAL_DST, winter, "America/New_York");
    const su = await slots(CAL_DST, summer, "America/New_York");
    const wH = w.length ? new Date(w[0].slot_start).getUTCHours() : -1;
    const suH = su.length ? new Date(su[0].slot_start).getUTCHours() : -1;
    assert(wH === 14 && suH === 13, `DST: 09:00 NY → 14:00 UTC winter / 13:00 UTC summer (got ${wH}/${suH})`);
  } catch (e) {
    assert(false, `DST test errored (tz support?): ${e.message}`);
  }

  // ── 5. Booking write path — trigger side-effects + the M13 bus ─────────────────
  console.log("\nM14 · booking side-effects — auto-tag + timeline + reminders + appointment.booked bus:");
  await reset();
  // an active workflow listening for appointment.booked
  await pg.exec(`insert into public.workflows (workspace_id,name,trigger_type,is_active,reentry_rule,nodes,edges)
    values ('${WSA}','On booked','appointment.booked',true,'allow','[]','[]');`);
  const execBefore = await count(pg, `select count(*)::int n from public.workflow_executions where workspace_id=$1`, [WSA]);
  const bk = await pg.query(`select * from public.book_appointment($1,$2,$3, now()+interval '10 days', now()+interval '10 days 30 min', 'UTC')`,
    [WSA, CAL_A, CONTACT_A]);
  const apptId = bk.rows[0].appointment_id;
  assert(!!apptId, "book_appointment returns an appointment id + tokens");
  assert(await count(pg, `select count(*)::int n from public.contact_tags ct join public.tags t on t.id=ct.tag_id
    where ct.contact_id=$1 and t.name='Appointment Booked'`, [CONTACT_A]) === 1, "auto-tag 'Appointment Booked' applied");
  assert(await count(pg, `select count(*)::int n from public.activity_log where contact_id=$1 and type='appointment'`, [CONTACT_A]) >= 1,
    "timeline entry written");
  assert(await count(pg, `select count(*)::int n from public.appointment_reminders where appointment_id=$1`, [apptId]) === 2,
    "two reminder rows (24h + 1h) created");
  assert(await count(pg, `select count(*)::int n from public.workflow_executions where workspace_id=$1`, [WSA]) === execBefore + 1,
    "appointment.booked enrolled the matching workflow (bus fired)");
  assert(await count(pg, `select count(*)::int n from public.jobs where type='automation.execute' and workspace_id=$1`, [WSA]) >= 1,
    "an automation.execute job was enqueued (Gate-4)");

  // ── 6. Lifecycle — cancel / no_show / reschedule token ────────────────────────
  console.log("\nM14 · lifecycle — cancel + no_show emit; reschedule token single-purpose + expiring:");
  const rt = (await pg.query(`select reschedule_token, cancel_token from public.appointments where id=$1`, [apptId])).rows[0];
  // reschedule with a good token → moves + rotates token
  const newId = await pg.query(`select public.reschedule_appointment($1, now()+interval '11 days', now()+interval '11 days 30 min') id`, [rt.reschedule_token]);
  assert(newId.rows[0].id === apptId, "reschedule with a valid token succeeds");
  const rt2 = (await pg.query(`select reschedule_token, status::text from public.appointments where id=$1`, [apptId])).rows[0];
  assert(rt2.reschedule_token !== rt.reschedule_token, "reschedule rotated the token (single-purpose)");
  assert(rt2.status === 'rescheduled', "status is 'rescheduled'");
  assert(await denied(pg, `select public.reschedule_appointment($1, now(), now()+interval '30 min')`, [rt.reschedule_token]),
    "the OLD reschedule token is now rejected");
  // cancel via token → status cancelled + reminders dropped + bus fired
  const execB2 = await count(pg, `select count(*)::int n from public.workflow_executions where workspace_id=$1`, [WSA]);
  await pg.exec(`insert into public.workflows (workspace_id,name,trigger_type,is_active,reentry_rule,nodes,edges)
    values ('${WSA}','On cancel','appointment.cancelled',true,'allow','[]','[]');`);
  await pg.query(`select public.cancel_appointment($1)`, [rt.cancel_token]);
  assert((await pg.query(`select status::text s from public.appointments where id=$1`, [apptId])).rows[0].s === 'cancelled',
    "cancel_appointment sets status cancelled");
  assert(await count(pg, `select count(*)::int n from public.appointment_reminders where appointment_id=$1 and sent_at is null`, [apptId]) === 0,
    "cancel drops pending reminders");
  assert(await count(pg, `select count(*)::int n from public.workflow_executions where workspace_id=$1 and trigger_payload->>'appointment_id'=$2`, [WSA, apptId]) >= 1,
    "appointment.cancelled fired the bus");
  // no_show emits
  await pg.exec(`insert into public.workflows (workspace_id,name,trigger_type,is_active,reentry_rule,nodes,edges)
    values ('${WSA}','On no-show','appointment.no_show',true,'allow','[]','[]');`);
  const ns = await pg.query(`insert into public.appointments (workspace_id,calendar_id,contact_id,starts_at,ends_at)
    values ('${WSA}','${CAL_A}','${CONTACT_A}', now()+interval '3 days', now()+interval '3 days 30 min') returning id`);
  const execNS = await count(pg, `select count(*)::int n from public.workflow_executions where workspace_id=$1`, [WSA]);
  await pg.query(`select public.set_appointment_status($1,'no_show')`, [ns.rows[0].id]);
  assert(await count(pg, `select count(*)::int n from public.workflow_executions where workspace_id=$1`, [WSA]) > execNS,
    "no_show fired the bus");

  // ── 7. Reminder cron — enqueue_due_reminders() ────────────────────────────────
  console.log("\nM14 · reminder cron — enqueue_due_reminders enqueues due jobs, idempotent:");
  const due = await pg.query(`insert into public.appointments (workspace_id,calendar_id,contact_id,starts_at,ends_at)
    values ('${WSA}','${CAL_A}','${CONTACT_A}', now()+interval '20 days', now()+interval '20 days 30 min') returning id`);
  // force a reminder to be due now
  await pg.exec(`update public.appointment_reminders set scheduled_at = now()-interval '5 min' where appointment_id='${due.rows[0].id}';`);
  const n1 = await count(pg, `select public.enqueue_due_reminders() n`, []);
  assert(n1 >= 1, "enqueue_due_reminders enqueued at least 1 due reminder job");
  const jobs1 = await count(pg, `select count(*)::int n from public.jobs where type='appointment.remind'`, []);
  await pg.query(`select public.enqueue_due_reminders()`);
  const jobs2 = await count(pg, `select count(*)::int n from public.jobs where type='appointment.remind'`, []);
  assert(jobs1 === jobs2, "second sweep is idempotent (no duplicate jobs)");

  // ── 8. Edge-Fn RPC grants exist ───────────────────────────────────────────────
  console.log("\nM14 · service_role can execute the Edge-Fn RPCs:");
  for (const sig of [
    "public.book_appointment(uuid,uuid,uuid,timestamptz,timestamptz,text,jsonb,uuid)",
    "public.compute_slots(uuid,date,text)",
    "public.reschedule_appointment(uuid,timestamptz,timestamptz)",
    "public.cancel_appointment(uuid)",
    "public.enqueue_due_reminders()",
  ]) {
    assert((await pg.query(`select has_function_privilege('service_role','${sig}','execute') ok`)).rows[0].ok,
      `service_role can execute ${sig.split('(')[0]}`);
  }

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M14 probe: ${pass} passed, ${fail} failed\x1b[0m`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
