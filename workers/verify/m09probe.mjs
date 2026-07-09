// m09probe.mjs — verify the M09 CRM slice on REAL Postgres (PGlite, no Docker).
// Proves the DoD gates checkable without a live stack:
//   Gate-1 tenancy   — B cannot reach A's CRM rows (every new table).
//   Gate-2 roles     — staff create/edit but NOT delete (manager+); custom fields
//                      are manager+; client ceiling. (crm.export fine-gating is
//                      enforced by M02 has_permission + the crm-export Edge Fn's
//                      requirePermission — proven server-side in the M02 probe 43/43.)
//   Gate-4 async     — CSV import is a job: browser enqueues 'queued' only; a
//                      contact_imports row can't be seeded 'running'; worker claims it.
//   Correctness      — smart_list_eval nested AND/OR + tag + custom + is_set;
//                      merge_contacts reassigns children + retains consent;
//                      dedupe_scan flags email/phone pairs (idempotent);
//                      activity_log append-only; log_activity() is_member guard;
//                      tag uniqueness.
//
//   node workers/verify/m09probe.mjs        (after `npm install`)
//
// Exit 0 = all assertions passed; 1 = a failure/leak was detected.
//
// pg_trgm is absent in PGlite, so the loader strips `create extension` AND the
// gin_trgm_ops index lines (pure perf indexes — dedupe here uses deterministic
// email/phone-exact matching, which needs no extension).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const OWNER_A = "11111111-1111-1111-1111-111111111111";
const ADMIN_A = "22222222-2222-2222-2222-222222222222";
const MANAGER_A = "55555555-5555-5555-5555-555555555555";
const STAFF_A = "66666666-6666-6666-6666-666666666666";
const CLIENT_A = "77777777-7777-7777-7777-777777777777";
const OWNER_B = "33333333-3333-3333-3333-333333333333";
const STAFF_B = "44444444-4444-4444-4444-444444444444"; // agency B staff (the attacker)

const WSA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WSB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

// Contacts in A
const C1 = "d1111111-1111-1111-1111-111111111111"; // Yusuf (VIP tag, custom, referral, score 75)
const C2 = "d2222222-2222-2222-2222-222222222222"; // Aisha (import, score 20)  → merged into C1
const C3 = "d3333333-3333-3333-3333-333333333333"; // Omar  (referral, score 60, email @other)
const DUPE_EMAIL_1 = "e1111111-1111-1111-1111-111111111111"; // same email as DUPE_EMAIL_2
const DUPE_EMAIL_2 = "e2222222-2222-2222-2222-222222222222";
const DUPE_PHONE_1 = "f1111111-1111-1111-1111-111111111111"; // same phone as DUPE_PHONE_2
const DUPE_PHONE_2 = "f2222222-2222-2222-2222-222222222222";
const TAG_VIP = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const FIELD_TIER = "aaaaaaa1-0000-0000-0000-000000000001";
const CB1 = "b1111111-1111-1111-1111-111111111111"; // a contact in B

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
    create role authenticated nologin;
    create role service_role nologin;
    grant usage on schema public to authenticated;
  `);

  for (const m of ["0000_extensions_enums.sql", "0001_tenancy.sql", "0002_jobs.sql", "0010_m05_compliance.sql", "0013_m09_crm.sql"]) {
    await pg.exec(load(m));
  }
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);

  // ── Seed two agencies + members + CRM rows (superuser bypasses RLS) ──────────
  await pg.exec(`
    insert into auth.users (id,email) values
      ('${OWNER_A}','owner.a@t'),('${ADMIN_A}','admin.a@t'),('${MANAGER_A}','mgr.a@t'),
      ('${STAFF_A}','staff.a@t'),('${CLIENT_A}','client.a@t'),
      ('${OWNER_B}','owner.b@t'),('${STAFF_B}','staff.b@t');
    insert into public.profiles (id,email,name) values
      ('${OWNER_A}','owner.a@t','Owner A'),('${ADMIN_A}','admin.a@t','Admin A'),('${MANAGER_A}','mgr.a@t','Mgr A'),
      ('${STAFF_A}','staff.a@t','Staff A'),('${CLIENT_A}','client.a@t','Client A'),
      ('${OWNER_B}','owner.b@t','Owner B'),('${STAFF_B}','staff.b@t','Staff B');
    insert into public.workspaces (id,owner_id,name,slug) values
      ('${WSA}','${OWNER_A}','Acme Agency','acme'),('${WSB}','${OWNER_B}','Beacon Media','beacon');
    insert into public.memberships (workspace_id,user_id,role,status) values
      ('${WSA}','${OWNER_A}','owner','active'),('${WSA}','${ADMIN_A}','admin','active'),
      ('${WSA}','${MANAGER_A}','manager','active'),('${WSA}','${STAFF_A}','staff','active'),
      ('${WSA}','${CLIENT_A}','client','active'),
      ('${WSB}','${OWNER_B}','owner','active'),('${WSB}','${STAFF_B}','staff','active');

    insert into public.tags (id,workspace_id,name,color) values ('${TAG_VIP}','${WSA}','VIP','gold');
    insert into public.custom_fields (id,workspace_id,field_name,field_type) values ('${FIELD_TIER}','${WSA}','tier','text');

    insert into public.contacts (id,workspace_id,first_name,last_name,email,phone,source,lead_score) values
      ('${C1}','${WSA}','Yusuf','Karim','yusuf@ex.com','+1 555 0001','referral',75),
      ('${C2}','${WSA}','Aisha','Rahman','aisha@ex.com','+1 555 0002','import',20),
      ('${C3}','${WSA}','Omar','Farouk','omar@other.com','+1 555 0003','referral',60),
      ('${DUPE_EMAIL_1}','${WSA}','Bilal','Ahmed','dupe@ex.com','+1 555 1111','manual',0),
      ('${DUPE_EMAIL_2}','${WSA}','Bilal','A.','DUPE@ex.com','+1 555 2222','manual',0),
      ('${DUPE_PHONE_1}','${WSA}','Sara','Q','sara.a@ex.com','(555) 900-1234','manual',0),
      ('${DUPE_PHONE_2}','${WSA}','Sara','Quereshi','sara.b@ex.com','555.900.1234','manual',0),
      ('${CB1}','${WSB}','Beacon','Contact','bc@ex.com','+1 555 7777','manual',0);

    -- children on the DUP (C2) — must all move to C1 on merge
    insert into public.contact_tags (workspace_id,contact_id,tag_id) values ('${WSA}','${C2}','${TAG_VIP}');
    insert into public.contact_custom_values (workspace_id,contact_id,field_id,value) values ('${WSA}','${C2}','${FIELD_TIER}','silver');
    insert into public.contact_notes (workspace_id,contact_id,content) values ('${WSA}','${C2}','note on dup');
    insert into public.contact_tasks (workspace_id,contact_id,title,status) values ('${WSA}','${C2}','call dup','open');
    insert into public.activity_log (workspace_id,contact_id,type,description) values ('${WSA}','${C2}','call','logged on dup');
    insert into public.consent_records (workspace_id,contact_id,kind,granted,source) values ('${WSA}','${C2}','email_optin',true,'manual');

    -- a saved smart list + a duplicate row target in both workspaces (for leak tests)
    insert into public.smart_lists (id,workspace_id,name,definition) values
      ('aaaaaaa2-0000-0000-0000-000000000002','${WSA}','Hot referrals','{"match":"and","rules":[{"field":"source","op":"eq","value":"referral"},{"field":"lead_score","op":"gte","value":"60"}]}');
    insert into public.contact_imports (workspace_id,status,total_rows) values ('${WSA}','pending',3),('${WSB}','pending',1);
  `);

  const as = (sub) => pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);

  // ── 1. Cross-tenant isolation — B's staff cannot reach A (Gate-1) ────────────
  console.log("\nM09 · cross-tenant isolation (agency B staff attacking agency A):");
  await as(STAFF_B);
  for (const t of ["contacts", "companies", "tags", "contact_tags", "custom_fields", "contact_custom_values",
                   "activity_log", "contact_notes", "contact_tasks", "smart_lists", "contact_imports", "contact_duplicates"]) {
    assert(await count(pg, `select count(*)::int n from public.${t} where workspace_id=$1`, [WSA]) === 0,
      `B cannot SELECT A's ${t}`);
  }
  assert(await denied(pg, `insert into public.contacts (workspace_id,first_name) values ($1,'HIJACK')`, [WSA]),
    "B cannot INSERT a contact into A");
  assert((await pg.query(`update public.contacts set first_name='HIJACK' where workspace_id=$1`, [WSA])).affectedRows === 0,
    "B cannot UPDATE A's contacts (0 rows)");
  assert((await pg.query(`delete from public.contacts where workspace_id=$1`, [WSA])).affectedRows === 0,
    "B cannot DELETE A's contacts (0 rows)");
  assert(await denied(pg, `select * from public.smart_list_eval($1,'{"match":"and","rules":[]}'::jsonb)`, [WSA]),
    "B cannot smart_list_eval A's workspace (is_member guard)");
  assert(await denied(pg, `select public.log_activity($1,$2,'note','x','{}'::jsonb)`, [WSA, C1]),
    "B cannot log_activity into A (is_member guard)");
  assert(await count(pg, `select count(*)::int n from public.contacts where workspace_id=$1`, [WSB]) === 1,
    "B CAN SELECT its own contacts (positive control)");

  // ── 2. Role matrix (Gate-2) ─────────────────────────────────────────────────
  console.log("\nM09 · role matrix — staff create/edit, manager+ delete, custom fields manager+:");
  await reset(); await as(STAFF_A);
  const newC = (await pg.query(`insert into public.contacts (workspace_id,first_name,source) values ($1,'Temp','manual') returning id`, [WSA])).rows[0].id;
  assert(!!newC, "staff CAN create a contact");
  assert((await pg.query(`update public.contacts set first_name='Temp2' where id=$1`, [newC])).affectedRows === 1,
    "staff CAN edit a contact");
  assert((await pg.query(`delete from public.contacts where id=$1`, [newC])).affectedRows === 0,
    "staff CANNOT delete a contact (0 rows — manager+ only)");
  assert(await denied(pg, `insert into public.custom_fields (workspace_id,field_name,field_type) values ($1,'x','text')`, [WSA]),
    "staff CANNOT create a custom field (manager+ only)");
  await reset(); await as(MANAGER_A);
  assert((await pg.query(`delete from public.contacts where id=$1`, [newC])).affectedRows === 1 ||
         (await count(pg, `select count(*)::int n from public.contacts where id=$1`, [newC])) === 0,
    "manager CAN delete a contact");
  const cf = (await pg.query(`insert into public.custom_fields (workspace_id,field_name,field_type) values ($1,'plan','text') returning id`, [WSA])).rows[0].id;
  assert(!!cf, "manager CAN create a custom field");
  await reset(); await as(CLIENT_A);
  assert((await pg.query(`update public.contacts set first_name='ceiling' where id=$1`, [C1])).affectedRows === 0,
    "client CANNOT edit a contact (ceiling — staff+ write)");

  // ── 3. activity_log append-only + log_activity RPC ──────────────────────────
  console.log("\nM09 · activity_log is append-only; log_activity() works for members:");
  await reset(); await as(STAFF_A);
  const aid = (await pg.query(`insert into public.activity_log (workspace_id,contact_id,type,description) values ($1,$2,'note','hi') returning id`, [WSA, C1])).rows[0].id;
  assert(!!aid, "staff CAN append an activity");
  assert((await pg.query(`update public.activity_log set description='edit' where id=$1`, [aid])).affectedRows === 0,
    "nobody can UPDATE an activity (0 rows — append-only)");
  assert((await pg.query(`delete from public.activity_log where id=$1`, [aid])).affectedRows === 0,
    "nobody can DELETE an activity (0 rows — append-only)");
  const logged = (await pg.query(`select public.log_activity($1,$2,'call','via rpc','{}'::jsonb) id`, [WSA, C1])).rows[0].id;
  assert(!!logged, "log_activity() RPC appends for a member");

  // ── 4. smart_list_eval correctness (nested AND/OR + tag + custom + is_set) ───
  console.log("\nM09 · smart_list_eval — nested AND/OR, tag, custom, is_set:");
  await reset(); await as(STAFF_A);
  // tag VIP is on C2 (before merge). Add it to C1 too for a stable positive.
  const ev = async (def) => (await pg.query(`select array_agg(x::text) a from public.smart_list_eval($1,$2::jsonb) x`, [WSA, JSON.stringify(def)])).rows[0].a || [];
  let r = await ev({ match: "and", rules: [{ field: "source", op: "eq", value: "referral" }, { field: "lead_score", op: "gte", value: "60" }] });
  assert(r.includes(C1) && r.includes(C3) && !r.includes(C2), "AND: referral & score≥60 → C1 + C3, not C2");
  r = await ev({ match: "or", rules: [{ field: "email", op: "contains", value: "other" }, { field: "lead_score", op: "gte", value: "70" }] });
  assert(r.includes(C1) && r.includes(C3), "OR: email~other OR score≥70 → C1 + C3");
  r = await ev({ match: "and", rules: [{ field: "tag", op: "has", value: TAG_VIP }] });
  assert(r.includes(C2) && !r.includes(C1), "tag has VIP → C2 only");
  r = await ev({ match: "and", rules: [{ field: "custom", op: "eq", value: "silver", field_id: FIELD_TIER }] });
  assert(r.length === 1 && r[0] === C2, "custom tier=silver → C2 only");
  r = await ev({ match: "and", rules: [{ field: "email", op: "not_set" }] });
  assert(r.length === 0, "email not_set → none (all seeded contacts have email)");

  // ── 5. merge_contacts — manager+ only, reassigns children, retains consent ───
  console.log("\nM09 · merge_contacts — manager+, children reassigned, dup soft-deleted:");
  await reset(); await as(STAFF_A);
  assert(await denied(pg, `select public.merge_contacts($1,$2,$3)`, [WSA, C1, C2]),
    "staff CANNOT merge (manager+ only)");
  await reset(); await as(MANAGER_A);
  await pg.query(`select public.merge_contacts($1,$2,$3)`, [WSA, C1, C2]);
  assert(await count(pg, `select count(*)::int n from public.contacts where id=$1 and deleted_at is not null`, [C2]) === 1,
    "dup (C2) is soft-deleted after merge");
  assert(await count(pg, `select count(*)::int n from public.contact_notes where contact_id=$1`, [C1]) >= 1,
    "dup's note reassigned to primary (C1)");
  assert(await count(pg, `select count(*)::int n from public.contact_tasks where contact_id=$1`, [C1]) >= 1,
    "dup's task reassigned to primary (C1)");
  assert(await count(pg, `select count(*)::int n from public.contact_tags where contact_id=$1 and tag_id=$2`, [C1, TAG_VIP]) === 1,
    "dup's VIP tag reassigned to primary (C1)");
  assert(await count(pg, `select count(*)::int n from public.consent_records where contact_id=$1`, [C1]) >= 1,
    "dup's consent record retained + reassigned to primary (C1)");

  // ── 6. dedupe_scan — email/phone exact pairs, idempotent (service path) ──────
  console.log("\nM09 · dedupe_scan — flags email/phone-exact pairs, idempotent:");
  await reset(); // service/superuser path (the worker calls this via service role)
  const openPairs = Number((await pg.query(`select public.dedupe_scan($1) n`, [WSA])).rows[0].n);
  assert(await count(pg, `select count(*)::int n from public.contact_duplicates where workspace_id=$1 and reason='email_exact'`, [WSA]) === 1,
    "email-exact pair flagged (dupe@ex.com)");
  assert(await count(pg, `select count(*)::int n from public.contact_duplicates where workspace_id=$1 and reason='phone_exact'`, [WSA]) === 1,
    "phone-exact pair flagged (5559001234)");
  const rerun = Number((await pg.query(`select public.dedupe_scan($1) n`, [WSA])).rows[0].n);
  assert(rerun === openPairs, `dedupe_scan idempotent (${openPairs} pairs on rerun, no duplicates)`);

  // ── 7. Async import (Gate-4) — queued-only + pending-only + worker claim ─────
  console.log("\nM09 · CSV import is async — browser enqueues 'queued' only:");
  await as(STAFF_A);
  const impId = (await pg.query(`insert into public.contact_imports (workspace_id,status,total_rows) values ($1,'pending',5) returning id`, [WSA])).rows[0].id;
  assert(!!impId, "staff CAN create a contact_imports row (pending)");
  assert(await denied(pg, `insert into public.contact_imports (workspace_id,status,total_rows) values ($1,'running',5)`, [WSA]),
    "browser CANNOT seed a 'running' import (pending-only check)");
  const jid = (await pg.query(`insert into public.jobs (workspace_id,type,payload,status,idempotency_key) values ($1,'contact.import',$2::jsonb,'queued',$3) returning id`,
    [WSA, JSON.stringify({ import_id: impId }), `contact.import:${impId}`])).rows[0].id;
  assert(!!jid, "staff CAN enqueue a contact.import job (queued)");
  assert(await denied(pg, `insert into public.jobs (workspace_id,type,status) values ($1,'contact.import','running')`, [WSA]),
    "browser CANNOT enqueue a 'running' job (queued-only)");
  await reset();
  const claimed = (await pg.query(`select * from public.claim_job('worker-m09')`)).rows[0];
  assert(claimed && claimed.status === "running" && claimed.type === "contact.import",
    "worker claim_job flips the contact.import job queued → running");

  // ── 8. Tag uniqueness ───────────────────────────────────────────────────────
  console.log("\nM09 · tag name is unique per workspace:");
  await as(STAFF_A);
  assert(await denied(pg, `insert into public.tags (workspace_id,name) values ($1,'VIP')`, [WSA]),
    "duplicate tag name in a workspace is rejected (unique constraint)");

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M09 probe: ${pass} passed, ${fail} failed\x1b[0m`);
  await pg.close();
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((e) => { console.error("harness error:", e); process.exitCode = 2; });
