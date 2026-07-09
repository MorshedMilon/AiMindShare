// m12probe.mjs — verify the M12 Inbox (Email + SMS) slice on REAL Postgres
// (PGlite, no Docker). Proves the DoD gates checkable without a live stack:
//   Gate-1 tenancy  — B's staff cannot reach A's conversations/messages/channels/
//                     canned_responses (select/insert/update/delete all fail).
//   D-055           — the BROWSER may insert internal NOTES only; a client-side
//                     channel message (is_internal_note=false) is rejected by RLS,
//                     so inbound/outbound traffic can only be written server-side.
//   Ingest + trigger— ingest_inbound_message resolves a contact by phone, opens/
//                     appends the thread, bumps last_message_at + unread_count, and
//                     writes the M09 timeline; it is idempotent on the provider id.
//   Gate-2 matrix   — channels are admin+, day-to-day is staff+, delete is manager+,
//                     the client write-ceiling holds.
//   Search + @mention — search_inbox finds a message; a note @mention fans out to
//                     notify() (stubbed here — the real notify() ships in 0011/M04).
//
//   node workers/verify/m12probe.mjs        (after `npm install`)
//
// Exit 0 = all assertions passed; 1 = a failure/leak was detected.
//
// Harness (identical spirit to m11probe): auth.users + auth.uid(), the
// authenticated/service_role roles, direct membership seeding. Loads the minimal
// dependency chain (tenancy + M05 for M09's retro-consent FK + M09 contacts/
// activity_log) and stubs public.notify() so the @mention trigger path is
// exercised without pulling the whole M04 chain. Depends on M09's 0013.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const OWNER_A = "11111111-1111-1111-1111-111111111111";
const ADMIN_A = "22222222-2222-2222-2222-222222222222";
const STAFF_A = "66666666-6666-6666-6666-666666666666";
const STAFF_A2 = "88888888-8888-8888-8888-888888888888"; // mention target
const MANAGER_A = "99999999-9999-9999-9999-999999999999";
const CLIENT_A = "77777777-7777-7777-7777-777777777777";
const OWNER_B = "33333333-3333-3333-3333-333333333333";
const STAFF_B = "44444444-4444-4444-4444-444444444444"; // agency B staff (the attacker)

const WSA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WSB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CONTACT_A = "cccccccc-cccc-cccc-cccc-cccccccccccc"; // WSA contact with a known phone

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

  // Stub public.notify() (the real one ships in 0011/M04) so the @mention branch of
  // the messages trigger runs here. Records each call into probe_notify_log.
  await pg.exec(`
    create table public.probe_notify_log (id serial primary key, workspace_id uuid, target text, type text, title text);
    create or replace function public.notify(p_workspace uuid, p_targets text[], p_type text,
      p_title text, p_body text default null, p_data jsonb default '{}'::jsonb)
    returns integer language plpgsql security definer set search_path = public as $$
    declare t text; n int := 0;
    begin
      foreach t in array coalesce(p_targets,'{}') loop
        insert into public.probe_notify_log(workspace_id,target,type,title) values (p_workspace,t,p_type,p_title);
        n := n + 1;
      end loop;
      return n;
    end $$;
  `);

  await pg.exec(load("0015_m12_inbox.sql"));

  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);

  // ── Seed two agencies + members + a WSA contact with a known phone ──────────
  await pg.exec(`
    insert into auth.users (id,email) values
      ('${OWNER_A}','owner.a@x.test'),('${ADMIN_A}','admin.a@x.test'),('${STAFF_A}','staff.a@x.test'),
      ('${STAFF_A2}','staff2.a@x.test'),('${MANAGER_A}','mgr.a@x.test'),('${CLIENT_A}','client.a@x.test'),
      ('${OWNER_B}','owner.b@x.test'),('${STAFF_B}','staff.b@x.test')
    on conflict (id) do nothing;
    insert into public.profiles (id,email,name) values
      ('${OWNER_A}','owner.a@x.test','Owner A'),('${ADMIN_A}','admin.a@x.test','Admin A'),
      ('${STAFF_A}','staff.a@x.test','Staff A'),('${STAFF_A2}','staff2.a@x.test','Staff A2'),
      ('${MANAGER_A}','mgr.a@x.test','Manager A'),('${CLIENT_A}','client.a@x.test','Client A'),
      ('${OWNER_B}','owner.b@x.test','Owner B'),('${STAFF_B}','staff.b@x.test','Staff B')
    on conflict (id) do nothing;
    insert into public.workspaces (id,owner_id,name,slug) values
      ('${WSA}','${OWNER_A}','Acme Agency','acme'),('${WSB}','${OWNER_B}','Beacon Media','beacon');
    insert into public.memberships (workspace_id,user_id,role,status) values
      ('${WSA}','${OWNER_A}','owner','active'),('${WSA}','${ADMIN_A}','admin','active'),
      ('${WSA}','${STAFF_A}','staff','active'),('${WSA}','${STAFF_A2}','staff','active'),
      ('${WSA}','${MANAGER_A}','manager','active'),('${WSA}','${CLIENT_A}','client','active'),
      ('${WSB}','${OWNER_B}','owner','active'),('${WSB}','${STAFF_B}','staff','active');
    insert into public.contacts (id,workspace_id,first_name,last_name,email,phone,source) values
      ('${CONTACT_A}','${WSA}','Aisha','Rahman','aisha@x.test','+1 (415) 555-0142','referral');

    -- One conversation + message in EACH workspace (targets to reach / positive controls).
    insert into public.conversations (id,workspace_id,contact_id,channel,status) values
      ('dddddddd-dddd-dddd-dddd-dddddddddddd','${WSA}','${CONTACT_A}','sms','open'),
      ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','${WSB}',null,'sms','open');
    insert into public.messages (workspace_id,conversation_id,direction,channel,content) values
      ('${WSA}','dddddddd-dddd-dddd-dddd-dddddddddddd','inbound','sms','Salaam, is the studio available in Ramadan?'),
      ('${WSB}','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','inbound','sms','Hello from Beacon');
    insert into public.channels (workspace_id,type,label,external_ref) values
      ('${WSA}','sms','Main line','+14155550100'),('${WSB}','sms','B line','+13125550100');
    insert into public.canned_responses (workspace_id,shortcut,title,content) values
      ('${WSA}','greeting','Greeting','Assalamu alaikum {{first_name}} — thanks for reaching out!'),
      ('${WSB}','greeting','Greeting','Hi {{first_name}}');
  `);

  const as = (sub) => pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);
  const CONV_A = "dddddddd-dddd-dddd-dddd-dddddddddddd";

  // ── 1. Cross-tenant isolation — B's staff cannot reach A (Gate-1) ───────────
  console.log("\nM12 · cross-tenant isolation (agency B staff attacking agency A):");
  await as(STAFF_B);
  for (const t of ["conversations", "messages", "channels", "canned_responses"]) {
    assert(await count(pg, `select count(*)::int n from public.${t} where workspace_id=$1`, [WSA]) === 0,
      `B cannot SELECT A's ${t}`);
  }
  assert(await denied(pg, `insert into public.conversations (workspace_id,channel) values ($1,'sms')`, [WSA]),
    "B cannot INSERT a conversation into A");
  assert(await denied(pg, `insert into public.messages (workspace_id,conversation_id,direction,channel,is_internal_note,content) values ($1,$2,'outbound','sms',true,'x')`, [WSA, CONV_A]),
    "B cannot INSERT a note into A's thread");
  assert((await pg.query(`update public.conversations set status='spam' where workspace_id=$1`, [WSA])).affectedRows === 0,
    "B cannot UPDATE A's conversation (0 rows)");
  assert((await pg.query(`delete from public.conversations where workspace_id=$1`, [WSA])).affectedRows === 0,
    "B cannot DELETE A's conversation (0 rows)");
  assert(await count(pg, `select count(*)::int n from public.conversations where workspace_id=$1`, [WSB]) === 1,
    "B CAN SELECT its own conversations (positive control)");

  // ── 2. D-055 — the browser can insert internal NOTES only ───────────────────
  console.log("\nM12 · messages insert is notes-only for the browser (D-055):");
  await reset(); await as(STAFF_A);
  const noteId = (await one(pg,
    `insert into public.messages (workspace_id,conversation_id,direction,channel,is_internal_note,content,mentions)
     values ($1,$2,'outbound','sms',true,'flagging @staff2 to follow up', array['${STAFF_A2}']::uuid[]) returning id`,
    [WSA, CONV_A])).id;
  assert(!!noteId, "staff CAN insert an internal note (is_internal_note=true)");
  assert(await denied(pg,
    `insert into public.messages (workspace_id,conversation_id,direction,channel,is_internal_note,content) values ($1,$2,'outbound','sms',false,'forged send')`,
    [WSA, CONV_A]),
    "staff CANNOT insert a channel message from the browser (is_internal_note=false rejected)");
  assert(await count(pg, `select count(*)::int n from public.probe_notify_log where target=$1 and type='mention'`, [STAFF_A2]) === 1,
    "the note @mention fanned out to notify() for the mentioned user");

  // ── 3. Gate-2 role matrix — channels admin+, delete manager+, client ceiling ─
  console.log("\nM12 · role matrix (channels admin+, delete manager+, client ceiling):");
  await reset(); await as(STAFF_A);
  assert(await denied(pg, `insert into public.channels (workspace_id,type,label) values ($1,'sms','Rogue')`, [WSA]),
    "staff CANNOT connect a channel (admin+ only)");
  assert((await pg.query(`delete from public.conversations where id=$1`, [CONV_A])).affectedRows === 0,
    "staff CANNOT delete a conversation (manager+ only, 0 rows)");
  await reset(); await as(ADMIN_A);
  assert(!!(await one(pg, `insert into public.channels (workspace_id,type,label,external_ref) values ($1,'sms','Support line','+14155550111') returning id`, [WSA])).id,
    "admin CAN connect a channel");
  await reset(); await as(CLIENT_A);
  assert(await denied(pg, `insert into public.messages (workspace_id,conversation_id,direction,channel,is_internal_note,content) values ($1,$2,'outbound','sms',true,'client note')`, [WSA, CONV_A]),
    "client CANNOT post (write-ceiling: staff+)");
  assert(await denied(pg, `insert into public.conversations (workspace_id,channel) values ($1,'sms')`, [WSA]),
    "client CANNOT open a conversation (write-ceiling: staff+)");

  // ── 4. Inbound ingest + the message trigger (server-side path) ──────────────
  console.log("\nM12 · ingest_inbound_message: contact resolve + thread + unread + idempotency:");
  await reset(); // service-role / superuser context (auth.uid() null)
  const beforeContacts = await count(pg, `select count(*)::int n from public.contacts where workspace_id=$1`, [WSA]);
  const m1 = (await one(pg, `select public.ingest_inbound_message($1,'sms','+1-415-555-0142','Following up on my booking',$2) id`, [WSA, "SM_dup_1"])).id;
  assert(!!m1, "ingest returns a message id");
  const conv = await one(pg, `select id, contact_id, unread_count, last_channel, last_message_at from public.conversations where workspace_id=$1 and contact_id=$2 order by last_message_at desc nulls last limit 1`, [WSA, CONTACT_A]);
  assert(conv && conv.contact_id === CONTACT_A, "inbound SMS resolved to the existing contact by phone (last-10-digit match)");
  assert(conv && Number(conv.unread_count) >= 1, "trigger incremented unread_count on the inbound message");
  assert(conv && conv.last_channel === "sms" && conv.last_message_at, "trigger set last_channel + last_message_at");
  assert(await count(pg, `select count(*)::int n from public.contacts where workspace_id=$1`, [WSA]) === beforeContacts,
    "no duplicate contact created (matched existing)");
  assert(await count(pg, `select count(*)::int n from public.activity_log where workspace_id=$1 and contact_id=$2 and type='sms'`, [WSA, CONTACT_A]) >= 1,
    "inbound message wrote the M09 timeline (activity_log type='sms')");

  // idempotency: same provider id → same message, no dup
  const m1b = (await one(pg, `select public.ingest_inbound_message($1,'sms','+1-415-555-0142','Following up on my booking',$2) id`, [WSA, "SM_dup_1"])).id;
  assert(m1 === m1b, "re-delivered webhook (same external_id) returns the same message (idempotent)");

  // new phone → new contact + new conversation
  const m2 = (await one(pg, `select public.ingest_inbound_message($1,'sms','+1-206-555-9999','New lead here',$2) id`, [WSA, "SM_new_1"])).id;
  assert(!!m2 && await count(pg, `select count(*)::int n from public.contacts where workspace_id=$1`, [WSA]) === beforeContacts + 1,
    "inbound from an unknown number created a new contact");

  // mark read resets unread (as staff)
  await as(STAFF_A);
  await pg.query(`select public.clear_unread($1,$2)`, [WSA, conv.id]);
  assert(await count(pg, `select unread_count::int n from public.conversations where id=$1`, [conv.id]) === 0,
    "clear_unread resets unread_count to 0");

  // ── 5. Full-text search ─────────────────────────────────────────────────────
  console.log("\nM12 · full-text search over the workspace's messages:");
  assert((await pg.query(`select * from public.search_inbox($1,$2)`, [WSA, "booking"])).rows.length >= 1,
    "search_inbox finds the 'booking' message in workspace A");
  await reset(); await as(STAFF_B);
  assert((await pg.query(`select * from public.search_inbox($1,$2)`, [WSA, "booking"]).catch(() => ({ rows: [] }))).rows.length === 0,
    "B cannot search inside A's workspace (member gate on search_inbox)");

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M12 probe: ${pass} passed, ${fail} failed\x1b[0m`);
  await pg.close();
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((e) => { console.error("harness error:", e); process.exitCode = 2; });
