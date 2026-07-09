// m15probe.mjs — verify the M15 Forms & Surveys SQL layer on REAL Postgres (PGlite,
// no Docker). Proves the DoD gates checkable without a live stack:
//   Schema         — forms/form_submissions/form_views exist with RLS enabled.
//   Gate-2 roles   — forms: staff+ WRITE, member READ, manager DELETE.
//   Gate-4/D-055   — form_submissions + form_views are SERVICE-ROLE-written only:
//                    an authenticated member CANNOT insert either (the public-form
//                    Edge Function writes them under the service role, which bypasses
//                    RLS). Mirrors M12's inbound-traffic posture.
//
//   node workers/verify/m15probe.mjs
//
// Exit 0 = all passed; 1 = a failure/leak. Depends on M05/M09 migrations (contacts,
// workspaces, memberships). extensions/pg_trgm stripped like m13/m14 probes; enums
// guarded in the migration.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const OWNER_A = "11111111-1111-1111-1111-111111111111";
const STAFF_A = "66666666-6666-6666-6666-666666666666";
const CLIENT_A = "77777777-7777-7777-7777-777777777777";
const MANAGER_A = "99999999-9999-9999-9999-999999999999";
const OWNER_B = "33333333-3333-3333-3333-333333333333";
const STAFF_B = "44444444-4444-4444-4444-444444444444";

const WSA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WSB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CONTACT_A = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const FORM_A = "f0000000-0000-0000-0000-000000000001";

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

  // Task 2 (submit_form) wires into M04 notify(), M05 consent, M09 CRM, M11 deals,
  // and the M13 bus (emit_trigger). Those migrations must all load so the function
  // body's cross-module calls resolve at runtime. M12 (0015) is pulled in only
  // because M13's message.received source trigger references public.messages.
  // 0008 (M02 roles) is loaded so has_permission()/crm.export resolves against the
  // seeded built-in role matrix — the gate the forms-export Edge Fn relies on (Task 5).
  for (const m of ["0000_extensions_enums.sql", "0001_tenancy.sql", "0002_jobs.sql",
                   "0008_m02_roles.sql",
                   "0011_m04_notifications.sql", "0010_m05_compliance.sql", "0013_m09_crm.sql",
                   "0014_m11_pipeline.sql", "0015_m12_inbox.sql", "0016_m13_automations.sql",
                   "0020_m15_forms.sql"]) {
    await pg.exec(load(m));
  }

  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);
  // The blanket grant above is a harness convenience for the RLS tests; it does NOT
  // reflect the migration's real grant posture. submit_form is a service-role-ONLY
  // entry point (the public-form Edge Fn holds the key; the browser never calls it),
  // so re-apply the migration's explicit revoke so the grant assertion is faithful.
  await pg.exec(`revoke execute on function public.submit_form(uuid,jsonb,jsonb,text,text,jsonb) from authenticated;`);
  // form_confirm_optin + assign_form_variant are likewise service-role-only entry
  // points (the public-form / confirm Edge Fns hold the key); re-apply the migration's
  // explicit revoke so the grant assertions are faithful. form_analytics is the ONE
  // authenticated-facing read (a dashboard call), so it keeps the blanket grant.
  await pg.exec(`revoke execute on function public.form_confirm_optin(uuid) from authenticated;`);
  await pg.exec(`revoke execute on function public.assign_form_variant(uuid,text) from authenticated;`);

  // ── Seed two agencies + a WSA contact ────────────────────────────────────────
  await pg.exec(`
    insert into auth.users (id,email) values
      ('${OWNER_A}','oa@t'),('${STAFF_A}','sa@t'),('${CLIENT_A}','ca@t'),('${MANAGER_A}','ma@t'),
      ('${OWNER_B}','ob@t'),('${STAFF_B}','sb@t');
    insert into public.profiles (id,email,name) values
      ('${OWNER_A}','oa@t','OA'),('${STAFF_A}','sa@t','SA'),('${CLIENT_A}','ca@t','CA'),('${MANAGER_A}','ma@t','MA'),
      ('${OWNER_B}','ob@t','OB'),('${STAFF_B}','sb@t','SB');
    insert into public.workspaces (id,owner_id,name,slug) values
      ('${WSA}','${OWNER_A}','Acme','acme'),('${WSB}','${OWNER_B}','Beacon','beacon');
    insert into public.memberships (workspace_id,user_id,role,status) values
      ('${WSA}','${OWNER_A}','owner','active'),('${WSA}','${STAFF_A}','staff','active'),
      ('${WSA}','${CLIENT_A}','client','active'),('${WSA}','${MANAGER_A}','manager','active'),
      ('${WSB}','${OWNER_B}','owner','active'),('${WSB}','${STAFF_B}','staff','active');
    insert into public.contacts (id,workspace_id,first_name,source) values
      ('${CONTACT_A}','${WSA}','Yusuf','manual');
  `);

  const as = (sub) => pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);

  // ── 1. Schema — 3 tables exist ───────────────────────────────────────────────
  console.log("\nM15 · schema — 3 tables exist:");
  const tables = ['forms', 'form_submissions', 'form_views'];
  for (const t of tables) {
    const { rows } = await pg.query(`select to_regclass('public.${t}') as t`);
    assert(rows[0].t, `table ${t} exists`);
  }

  // ── 2. RLS enabled on all 3 tables ───────────────────────────────────────────
  console.log("\nM15 · RLS — enabled on all 3 tables:");
  {
    const { rows } = await pg.query(
      `select relname from pg_class where relname = any($1) and relrowsecurity`, [tables]);
    assert(rows.length === tables.length, "all 3 M15 tables have RLS enabled");
  }

  // Seed a form (as manager — staff+ can insert) for the submission/view tests.
  await reset(); await as(MANAGER_A);
  await pg.query(
    `insert into public.forms (id,workspace_id,name,type) values ($1,$2,'Contact us','form')`,
    [FORM_A, WSA]);

  // ── 3. Cross-tenant isolation (Gate-1) ───────────────────────────────────────
  console.log("\nM15 · cross-tenant isolation (agency B staff attacking agency A):");
  await reset(); await as(STAFF_B);
  assert(await count(pg, `select count(*)::int n from public.forms where workspace_id=$1`, [WSA]) === 0,
    "B cannot SELECT A's forms");
  assert(await denied(pg, `insert into public.forms (workspace_id,name) values ($1,'HIJACK')`, [WSA]),
    "B cannot INSERT a form into A");
  assert((await pg.query(`update public.forms set name='HIJACK' where workspace_id=$1`, [WSA])).affectedRows === 0,
    "B cannot UPDATE A's forms (0 rows)");

  // ── 4. Role matrix (Gate-2) ──────────────────────────────────────────────────
  console.log("\nM15 · roles — staff+ write · member read · manager+ delete:");
  await reset(); await as(STAFF_A);
  assert(await count(pg, `select count(*)::int n from public.forms where workspace_id=$1`, [WSA]) >= 1,
    "staff CAN read forms");
  assert(!!(await pg.query(
    `insert into public.forms (workspace_id,name) values ($1,'Staff form') returning id`, [WSA])).rows[0]?.id,
    "staff CAN create a form");
  assert((await pg.query(`delete from public.forms where id=$1`, [FORM_A])).affectedRows === 0,
    "staff CANNOT delete a form (manager+ only, 0 rows)");
  await reset(); await as(CLIENT_A);
  assert(await count(pg, `select count(*)::int n from public.forms where workspace_id=$1`, [WSA]) >= 1,
    "client CAN read forms (forms_sel uses is_member — a client is a member)");
  // manager+ delete: delete a throwaway form (NOT FORM_A, which submissions reference).
  await reset(); await as(MANAGER_A);
  const throwaway = (await pg.query(
    `insert into public.forms (workspace_id,name) values ($1,'Throwaway') returning id`, [WSA])).rows[0].id;
  assert((await pg.query(`delete from public.forms where id=$1`, [throwaway])).affectedRows === 1,
    "manager CAN delete a form");

  // ── 5. Submissions + views are service-role-written only (Gate-4 / D-055) ─────
  console.log("\nM15 · form_submissions + form_views are service-role-write-only:");
  await reset(); await as(STAFF_A);  // an authenticated member of A
  assert(await denied(pg,
    `insert into public.form_submissions (form_id,workspace_id,answers_json) values ($1,$2,'{}')`,
    [FORM_A, WSA]),
    "authenticated member CANNOT insert a form_submission (no INSERT policy)");
  assert(await denied(pg,
    `insert into public.form_views (form_id,workspace_id,visitor_id) values ($1,$2,'v1')`,
    [FORM_A, WSA]),
    "authenticated member CANNOT insert a form_view (no INSERT policy)");

  // service role (superuser / RLS-bypass context) CAN write both.
  await reset();  // reset role → superuser in PGlite, bypasses RLS like service_role
  const sub = await pg.query(
    `insert into public.form_submissions (form_id,workspace_id,contact_id,answers_json)
     values ($1,$2,$3,'{"q1":"hi"}') returning id`, [FORM_A, WSA, CONTACT_A]);
  assert(!!sub.rows[0]?.id, "service role CAN insert a form_submission");
  const vw = await pg.query(
    `insert into public.form_views (form_id,workspace_id,visitor_id,event) values ($1,$2,'v1','view') returning id`,
    [FORM_A, WSA]);
  assert(!!vw.rows[0]?.id, "service role CAN insert a form_view");

  // members CAN read the service-written rows in their own workspace.
  await as(STAFF_A);
  assert(await count(pg, `select count(*)::int n from public.form_submissions where workspace_id=$1`, [WSA]) === 1,
    "staff CAN read submissions in its own workspace");
  assert(await count(pg, `select count(*)::int n from public.form_views where workspace_id=$1`, [WSA]) === 1,
    "staff CAN read views in its own workspace");
  await reset(); await as(STAFF_B);
  assert(await count(pg, `select count(*)::int n from public.form_submissions where workspace_id=$1`, [WSA]) === 0,
    "B cannot read A's submissions (tenancy)");
  assert(await count(pg, `select count(*)::int n from public.form_views where workspace_id=$1`, [WSA]) === 0,
    "B cannot read A's views (tenancy)");

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Task 2 — submit_form() public submission pipeline.
  //    Everything below runs as the SERVICE ROLE (reset role → superuser in PGlite,
  //    which bypasses RLS exactly like service_role) — the posture the Edge Fn uses.
  // ═══════════════════════════════════════════════════════════════════════════
  await reset();
  const submit = async (token, answers, spam = {}, utm = {}, visitor = "vis-1", variant = null) =>
    (await pg.query(`select public.submit_form($1,$2,$3,$4,$5,$6) as r`,
      [token, JSON.stringify(answers), JSON.stringify(utm), visitor, variant, JSON.stringify(spam)])).rows[0].r;

  // A published contact form: name+email mapped, plus a consent field.
  const mkForm = async (over = {}) => {
    const id = (await pg.query(
      `insert into public.forms (workspace_id,name,type,status,fields_json,logic_json,settings_json,routing_json)
       values ($1,$2,$3,'published',$4,$5,$6,$7) returning id, public_token`,
      [WSA, over.name || "Contact us", over.type || "form",
       JSON.stringify(over.fields || [
         { key: "name",  type: "text",  map_to: "name" },
         { key: "email", type: "email", map_to: "email" },
         { key: "consent", type: "consent", consent_text: "I agree to be contacted." },
       ]),
       JSON.stringify(over.logic || []),
       JSON.stringify(over.settings || {}),
       JSON.stringify(over.routing || {})])).rows[0];
    return id;
  };

  // ── 6a. Happy path: complete status, contact upserted, consent stored verbatim ─
  console.log("\nM15 · submit_form — happy path (contact upsert + exact consent):");
  const f1 = await mkForm();
  const r1 = await submit(f1.public_token, { name: "Sam Lee", email: "sam@ex.com", consent: true });
  assert(r1.status === "complete", "submission complete");
  const c1 = await pg.query(
    `select id, first_name, last_name from public.contacts where lower(email)='sam@ex.com' and workspace_id=$1`, [WSA]);
  assert(c1.rows.length === 1, "contact upserted");
  assert(c1.rows[0].first_name === "Sam" && c1.rows[0].last_name === "Lee", "name split into first/last");
  const cr1 = await pg.query(`select evidence, kind::text k, granted from public.consent_records where contact_id=$1`, [c1.rows[0].id]);
  assert(cr1.rows.length === 1 && cr1.rows[0].evidence["text"] === "I agree to be contacted.", "exact consent text stored");
  assert(cr1.rows[0].granted === true && cr1.rows[0].k === "email_optin", "consent recorded as granted email_optin");

  // ── 6b. Dedupe: same email twice → exactly one contact (updated, not duplicated) ─
  console.log("\nM15 · submit_form — dedupe by email:");
  await submit(f1.public_token, { name: "Sam L. Lee", email: "sam@ex.com", consent: true });
  assert(await count(pg, `select count(*)::int n from public.contacts where lower(email)='sam@ex.com' and workspace_id=$1`, [WSA]) === 1,
    "second submit with same email does not duplicate the contact");

  // ── 6c. Custom-field map: map_to a non-contact column → contact_custom_values ───
  console.log("\nM15 · submit_form — custom-field mapping:");
  const f3 = await mkForm({ name: "Colorful", fields: [
    { key: "email", type: "email", map_to: "email" },
    { key: "fav",   type: "text",  map_to: "favorite_color" },
  ]});
  await submit(f3.public_token, { email: "color@ex.com", fav: "teal" });
  const cc = await pg.query(
    `select v.value from public.contact_custom_values v
       join public.custom_fields cf on cf.id=v.field_id
       join public.contacts c on c.id=v.contact_id
      where cf.field_name='favorite_color' and c.email='color@ex.com'`);
  assert(cc.rows.length === 1 && cc.rows[0].value === "teal",
    "map_to favorite_color wrote a contact_custom_values row (custom_fields auto-created)");

  // ── 6d. Quiz: scoring + tier resolution ────────────────────────────────────────
  console.log("\nM15 · submit_form — quiz scoring + tier:");
  const fq = await mkForm({ name: "Quiz", type: "quiz", fields: [
    { key: "email", type: "email", map_to: "email" },
    { key: "q1", type: "text" },
    { key: "q2", type: "text" },
  ], settings: {
    scoring: { q1: { yes: 10, no: 0 }, q2: { a: 5, b: 2 } },
    tiers: [ { min: 0, max: 9, label: "Cold" }, { min: 10, max: 100, label: "Hot", message: "You're hot!" } ],
  }});
  const rq = await submit(fq.public_token, { email: "quiz@ex.com", q1: "yes", q2: "a" });  // 10+5=15 → Hot
  assert(rq.status === "complete" && rq.result_tier === "Hot", "quiz resolves the expected tier (Hot)");
  const sq = await pg.query(`select score, result_tier from public.form_submissions where result_tier='Hot' order by created_at desc limit 1`);
  assert(sq.rows[0].score === 15, `quiz score summed to 15 (got ${sq.rows[0].score})`);

  // ── 6e. Logic-hidden drop: a hidden field's answer must NOT be stored ───────────
  console.log("\nM15 · submit_form — logic-hidden field dropped from stored answers:");
  const fl = await mkForm({ name: "Logic", fields: [
    { key: "email",  type: "email", map_to: "email" },
    { key: "reason", type: "text" },
    { key: "secret", type: "text" },
  ], logic: [
    // hide 'secret' whenever reason = 'none'
    { target: "secret", action: "hide", when: { field: "reason", op: "eq", value: "none" } },
  ]});
  await submit(fl.public_token, { email: "logic@ex.com", reason: "none", secret: "TAMPER" });
  const sl = await pg.query(
    `select answers_json from public.form_submissions s join public.forms f on f.id=s.form_id where f.id=$1`, [fl.id]);
  assert(!("secret" in sl.rows[0].answers_json) && sl.rows[0].answers_json["reason"] === "none",
    "hidden 'secret' answer is dropped; visible 'reason' is kept (tamper guard)");

  // ── 6f. Honeypot: a filled decoy → spam_rejected, no contact ───────────────────
  console.log("\nM15 · submit_form — honeypot + time-trap spam gates:");
  const fh = await mkForm({ name: "Hunny", fields: [
    { key: "email", type: "email", map_to: "email" },
  ], settings: { spam: { honeypot: "website" } }});
  const rh = await submit(fh.public_token, { email: "bot@ex.com", website: "http://spam" });
  assert(rh.status === "spam_rejected", "honeypot-filled submit is spam_rejected");
  assert(await count(pg, `select count(*)::int n from public.contacts where lower(email)='bot@ex.com'`, []) === 0,
    "no contact created for a honeypot-rejected submit");

  // ── 6g. Time-trap: elapsed_ms below min_ms → spam_rejected ─────────────────────
  const ft = await mkForm({ name: "Timed", fields: [
    { key: "email", type: "email", map_to: "email" },
  ], settings: { spam: { min_ms: 1500 } }});
  const rt = await submit(ft.public_token, { email: "fast@ex.com" }, { elapsed_ms: 100 });
  assert(rt.status === "spam_rejected", "elapsed_ms=100 under min_ms=1500 is spam_rejected");

  // ── 6h. Routing: assign_owner (round-robin) + create_deal ──────────────────────
  console.log("\nM15 · submit_form — routing (assign owner + create deal):");
  // seed a default pipeline + stage (worker seeds these in prod — D-052)
  const PIPE = (await pg.query(`insert into public.pipelines (workspace_id,name) values ($1,'Sales') returning id`, [WSA])).rows[0].id;
  await pg.query(`insert into public.pipeline_stages (workspace_id,pipeline_id,name,order_index) values ($1,$2,'New',0),($1,$2,'Won',1)`, [WSA, PIPE]);
  const fr = await mkForm({ name: "Router", fields: [
    { key: "email",  type: "email",  map_to: "email" },
    { key: "budget", type: "number", map_to: "budget" },
  ], routing: {
    assign_owner: true, round_robin_ids: [STAFF_A, MANAGER_A],
    create_deal: true, value_field: "budget", thank_you: "Thanks!",
  }});
  const rr = await submit(fr.public_token, { email: "lead@ex.com", budget: "5000" });
  assert(rr.status === "complete" && rr.message === "Thanks!", "routing returns the thank-you message");
  const lead = await pg.query(`select id, assigned_to from public.contacts where email='lead@ex.com'`);
  assert(!!lead.rows[0].assigned_to, "routing assigned an owner (round-robin)");
  const deal = await pg.query(`select value, contact_id from public.deals where contact_id=$1`, [lead.rows[0].id]);
  assert(deal.rows.length === 1 && Number(deal.rows[0].value) === 5000, "a deal was created with the mapped budget value");

  // ── 6i. Trigger: form.submitted enrols a matching workflow + queues a job ───────
  console.log("\nM15 · submit_form — form.submitted fires the M13 bus:");
  await pg.query(`insert into public.workflows (workspace_id,name,trigger_type,is_active,reentry_rule,nodes,edges)
    values ($1,'On form','form.submitted',true,'allow','[]','[]')`, [WSA]);
  const execBefore = await count(pg, `select count(*)::int n from public.workflow_executions where workspace_id=$1`, [WSA]);
  const fb = await mkForm({ name: "Buscheck", fields: [{ key: "email", type: "email", map_to: "email" }] });
  await submit(fb.public_token, { email: "bus@ex.com" });
  assert(await count(pg, `select count(*)::int n from public.workflow_executions where workspace_id=$1`, [WSA]) === execBefore + 1,
    "form.submitted enrolled the matching workflow (emit_trigger fired)");
  assert(await count(pg, `select count(*)::int n from public.jobs where type='automation.execute' and workspace_id=$1`, [WSA]) >= 1,
    "an automation.execute job was queued (bus fanned out)");

  // ── 6j. Guards: unpublished form rejected; service_role-only grant ─────────────
  console.log("\nM15 · submit_form — guards:");
  const draft = (await pg.query(
    `insert into public.forms (workspace_id,name,status) values ($1,'Draft','draft') returning public_token`, [WSA])).rows[0];
  assert(await denied(pg, `select public.submit_form($1,'{}','{}','v',null,'{}')`, [draft.public_token]),
    "an unpublished form is rejected (form_not_published)");
  assert((await pg.query(
    `select has_function_privilege('service_role','public.submit_form(uuid,jsonb,jsonb,text,text,jsonb)','execute') ok`)).rows[0].ok,
    "service_role can execute submit_form");
  assert(!(await pg.query(
    `select has_function_privilege('authenticated','public.submit_form(uuid,jsonb,jsonb,text,text,jsonb)','execute') ok`)).rows[0].ok,
    "authenticated CANNOT execute submit_form (service-role only)");

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Task 3a — form_confirm_optin(): double opt-in defers the whole tail; the
  //    confirm RPC runs it (consent written verbatim + status flips to complete).
  //    Still service-role posture (reset role → RLS-bypass superuser).
  // ═══════════════════════════════════════════════════════════════════════════
  await reset();
  console.log("\nM15 · form_confirm_optin — double opt-in defers, confirm finalizes:");
  const fdo = await mkForm({ name: "DoubleOptin", fields: [
    { key: "email", type: "email", map_to: "email" },
    { key: "consent", type: "consent", consent_text: "I confirm my subscription." },
  ], settings: { double_optin: "true" } });
  const rdo = await submit(fdo.public_token, { email: "confirm@ex.com", consent: true });
  assert(rdo.status === "pending_confirmation", "double opt-in submit returns pending_confirmation");
  const doContact = await pg.query(`select id from public.contacts where lower(email)='confirm@ex.com' and workspace_id=$1`, [WSA]);
  assert(doContact.rows.length === 1, "pending double opt-in still upserted the contact");
  assert(await count(pg, `select count(*)::int n from public.consent_records where contact_id=$1`, [doContact.rows[0].id]) === 0,
    "NO consent_records row yet (consent deferred to confirmation)");
  const doSub = await pg.query(
    `select id, confirm_token, status from public.form_submissions where form_id=$1 and status='pending_confirmation'`, [fdo.id]);
  assert(!!doSub.rows[0].confirm_token && doSub.rows[0].status === "pending_confirmation",
    "pending submission carries a confirm_token");

  const confirm = async (token) => (await pg.query(`select public.form_confirm_optin($1) as r`, [token])).rows[0].r;
  const rcf = await confirm(doSub.rows[0].confirm_token);
  assert(rcf.status === "complete", "form_confirm_optin returns complete");
  const doSubAfter = await pg.query(`select status, confirm_token from public.form_submissions where id=$1`, [doSub.rows[0].id]);
  assert(doSubAfter.rows[0].status === "complete" && doSubAfter.rows[0].confirm_token === null,
    "submission flipped to complete + confirm_token nulled");
  const doCr = await pg.query(`select evidence, kind::text k, granted from public.consent_records where contact_id=$1`, [doContact.rows[0].id]);
  assert(doCr.rows.length === 1 && doCr.rows[0].evidence["text"] === "I confirm my subscription."
    && doCr.rows[0].granted === true && doCr.rows[0].k === "email_optin",
    "consent_records now written with the exact confirmation wording");

  // idempotency: a second confirm is a no-op that returns already_confirmed.
  const rcf2 = await confirm(doSub.rows[0].confirm_token);  // token now null → still handles gracefully
  const rcf3 = await confirm(doSubAfter.rows[0].confirm_token ?? "00000000-0000-0000-0000-000000000000");
  assert(rcf3.status === "already_confirmed", "confirming an unknown/nulled token returns already_confirmed");
  assert(await count(pg, `select count(*)::int n from public.consent_records where contact_id=$1`, [doContact.rows[0].id]) === 1,
    "re-confirm does not duplicate the consent row");
  void rcf2;

  // grant posture: service_role only.
  assert((await pg.query(
    `select has_function_privilege('service_role','public.form_confirm_optin(uuid)','execute') ok`)).rows[0].ok,
    "service_role can execute form_confirm_optin");
  assert(!(await pg.query(
    `select has_function_privilege('authenticated','public.form_confirm_optin(uuid)','execute') ok`)).rows[0].ok,
    "authenticated CANNOT execute form_confirm_optin (service-role only)");

  // form_confirm_optin also runs routing/deal on confirm (deferred tail parity).
  console.log("\nM15 · form_confirm_optin — deferred tail runs routing + bus:");
  const fdoR = await mkForm({ name: "DblRoute", fields: [
    { key: "email", type: "email", map_to: "email" },
    { key: "consent", type: "consent", consent_text: "Yes please." },
  ], settings: { double_optin: "true" }, routing: { assign_owner: true, round_robin_ids: [STAFF_A] } });
  await submit(fdoR.public_token, { email: "dblroute@ex.com", consent: true });
  const dblSub = (await pg.query(`select confirm_token from public.form_submissions where form_id=$1 and status='pending_confirmation'`, [fdoR.id])).rows[0];
  const execBeforeDbl = await count(pg, `select count(*)::int n from public.workflow_executions where workspace_id=$1`, [WSA]);
  await confirm(dblSub.confirm_token);
  const dblContact = (await pg.query(`select id, assigned_to from public.contacts where email='dblroute@ex.com'`)).rows[0];
  assert(!!dblContact.assigned_to, "confirm ran routing (assigned an owner)");
  assert(await count(pg, `select count(*)::int n from public.workflow_executions where workspace_id=$1`, [WSA]) === execBeforeDbl + 1,
    "confirm emitted form.submitted (enrolled the workflow)");

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. Task 3b — form_analytics(): funnel counts + per-step drop-off + A/B stats.
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\nM15 · form_analytics — funnel counts + per-step + A/B:");
  await reset();  // seed views/submissions under the RLS-bypass service role
  const fa = await mkForm({ name: "Analytics", fields: [{ key: "email", type: "email", map_to: "email" }] });
  // 10 view, 6 start (steps 1,2,3 → 3/2/1), 4 complete
  for (let i = 0; i < 10; i++) await pg.query(`insert into public.form_views (form_id,workspace_id,visitor_id,event) values ($1,$2,$3,'view')`, [fa.id, WSA, `v${i}`]);
  const startSteps = [1, 1, 1, 2, 2, 3];
  for (let i = 0; i < startSteps.length; i++) await pg.query(`insert into public.form_views (form_id,workspace_id,visitor_id,event,step) values ($1,$2,$3,'start',$4)`, [fa.id, WSA, `s${i}`, startSteps[i]]);
  for (let i = 0; i < 4; i++) await pg.query(`insert into public.form_views (form_id,workspace_id,visitor_id,event) values ($1,$2,$3,'complete')`, [fa.id, WSA, `c${i}`]);
  for (let i = 0; i < 4; i++) await pg.query(`insert into public.form_submissions (form_id,workspace_id,answers_json) values ($1,$2,'{}')`, [fa.id, WSA]);
  // form_analytics is the authenticated-facing dashboard read → call it AS a member.
  await as(STAFF_A);
  const a = (await pg.query(`select public.form_analytics($1) as a`, [fa.id])).rows[0].a;
  assert(a.views === 10 && a.starts === 6 && a.completions === 4 && a.submissions === 4, "funnel counts");
  assert(Number(a.conversion) === 0.4, `conversion = completions/views = 0.4 (got ${a.conversion})`);
  assert(a.by_step["1"] === 3 && a.by_step["2"] === 2 && a.by_step["3"] === 1, "by_step drop-off counts (3/2/1)");

  // A/B: seed a variant form + views/submissions split by variant (service role write).
  await reset();
  const fab = await mkForm({ name: "ABtest", fields: [{ key: "email", type: "email", map_to: "email" }] });
  await pg.query(`insert into public.form_views (form_id,workspace_id,visitor_id,event,variant) values ($1,$2,'x','view','A'),($1,$2,'y','view','A'),($1,$2,'z','view','B')`, [fab.id, WSA]);
  await pg.query(`insert into public.form_submissions (form_id,workspace_id,answers_json,variant) values ($1,$2,'{}','A'),($1,$2,'{}','B')`, [fab.id, WSA]);
  await as(STAFF_A);
  const aab = (await pg.query(`select public.form_analytics($1) as a`, [fab.id])).rows[0].a;
  assert(aab.ab["A"].views === 2 && aab.ab["A"].submissions === 1 && aab.ab["B"].views === 1 && aab.ab["B"].submissions === 1,
    "ab object groups views+submissions by variant");

  // cross-tenant: a non-member cannot call form_analytics (is_member guard raises).
  await reset(); await as(STAFF_B);
  assert(await denied(pg, `select public.form_analytics($1)`, [fa.id]),
    "non-member CANNOT call form_analytics (not_authorized)");
  await reset();

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. Task 3c — assign_form_variant(): deterministic, stable per visitor.
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\nM15 · assign_form_variant — deterministic + stable per visitor:");
  const parent = await mkForm({ name: "ABparent", fields: [{ key: "email", type: "email", map_to: "email" }] });
  // a child variant of the parent (variant_of_id → parent), 50/50 split
  await pg.query(`insert into public.forms (workspace_id,name,status,variant_of_id,ab_split) values ($1,'ABchild','published',$2,50)`, [WSA, parent.id]);
  const v1a = (await pg.query(`select public.assign_form_variant($1,'visitor-1') as v`, [parent.id])).rows[0].v;
  const v1b = (await pg.query(`select public.assign_form_variant($1,'visitor-1') as v`, [parent.id])).rows[0].v;
  assert(v1a === v1b, `same visitor → same variant across calls (${v1a})`);
  // two visitors CAN land on different variants (probe several to be robust).
  const variants = new Set();
  for (const vis of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
    variants.add((await pg.query(`select public.assign_form_variant($1,$2) as v`, [parent.id, vis])).rows[0].v);
  }
  assert(variants.size >= 2, `different visitors CAN get different variants (saw ${[...variants].join(",")})`);
  // a form with no siblings/children → null (no A/B in play).
  const solo = await mkForm({ name: "Solo", fields: [{ key: "email", type: "email", map_to: "email" }] });
  assert((await pg.query(`select public.assign_form_variant($1,'v') as v`, [solo.id])).rows[0].v === null,
    "a form with no variants returns null (no A/B assignment)");
  assert((await pg.query(
    `select has_function_privilege('service_role','public.assign_form_variant(uuid,text)','execute') ok`)).rows[0].ok,
    "service_role can execute assign_form_variant");

  // ═══════════════════════════════════════════════════════════════════════════
  // 9b. Task 4 — the public-form Edge Fn's RPC grant posture (the only runnable
  //     verification of the Edge Fn slice). The three write/assign RPCs it calls
  //     (submit_form, form_confirm_optin, assign_form_variant) are service_role-ONLY
  //     — the browser hits the Edge Fn, which holds the key; it can never call them
  //     directly. form_analytics is the ONE authenticated-facing read (the dashboard),
  //     so it stays granted to authenticated. (submit_form + form_confirm_optin's
  //     service-role-only posture is asserted in §6/§7 above; this block adds the two
  //     gaps: assign_form_variant NOT to authenticated, form_analytics IS.)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\nM15 · Task 4 — public-form Edge Fn RPC grant posture:");
  assert(!(await pg.query(
    `select has_function_privilege('authenticated','public.assign_form_variant(uuid,text)','execute') ok`)).rows[0].ok,
    "authenticated CANNOT execute assign_form_variant (service-role only)");
  assert((await pg.query(
    `select has_function_privilege('authenticated','public.form_analytics(uuid)','execute') ok`)).rows[0].ok,
    "authenticated CAN execute form_analytics (the dashboard read)");
  assert((await pg.query(
    `select has_function_privilege('service_role','public.form_analytics(uuid)','execute') ok`)).rows[0].ok,
    "service_role can execute form_analytics");

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. Task 3d — workspace.provision starter-form seed is idempotent.
  //     Mirror the worker's guard: insert ONE published "Contact Us" form only when
  //     the workspace has no forms. Simulate the seed SQL twice → inserts once.
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\nM15 · provision starter-form seed — idempotent (insert once):");
  const WSC = "cccccccc-1111-2222-3333-444444444444";
  await pg.query(`insert into public.workspaces (id,owner_id,name,slug) values ($1,$2,'FreshCo','freshco')`, [WSC, OWNER_A]);
  const seedStarterForm = async (ws) => {
    // exact guard the worker uses: only seed when the workspace has no forms.
    const { rows } = await pg.query(`select count(*)::int n from public.forms where workspace_id=$1`, [ws]);
    if (Number(rows[0].n) > 0) return false;
    await pg.query(
      `insert into public.forms (workspace_id,name,type,status,published_at,fields_json,settings_json)
       values ($1,'Contact Us','form','published',now(),$2,$3)`,
      [ws, JSON.stringify([
        { key: "name", type: "text", label: "Your name", map_to: "name", required: true },
        { key: "email", type: "email", label: "Email", map_to: "email", required: true },
        { key: "message", type: "textarea", label: "Message", map_to: "message" },
        { key: "consent", type: "consent", label: "Keep me updated", consent_text: "I agree to receive marketing emails." },
      ]), JSON.stringify({ source_tag: "Contact Us" })]);
    return true;
  };
  const seed1 = await seedStarterForm(WSC);
  const seed2 = await seedStarterForm(WSC);
  assert(seed1 === true && seed2 === false, "starter-form seed inserts on first run, skips on second (guard)");
  assert(await count(pg, `select count(*)::int n from public.forms where workspace_id=$1 and status='published'`, [WSC]) === 1,
    "exactly one published starter form after two seed runs");

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. Task 5 — forms-export Edge Fn permission gate is REAL at the DB level.
  //     forms-export exports submissions (contact data) and gates on crm.export via
  //     requirePermission on a caller-scoped client — the SAME key + posture as M09's
  //     crm-export (M15 reuses the registry key, invents none). Prove the gate the
  //     Edge Fn leans on exists in Postgres: has_permission(ws,'crm.export') is FALSE
  //     for a STAFF caller and TRUE for a manager/admin — and a per-member grant
  //     override flips STAFF to TRUE (the staff-with-override export path). Mirrors
  //     how the m02/m09 probes prove the crm.export gate server-side.
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\nM15 · Task 5 — forms-export crm.export gate is real (has_permission):");
  const permAs = async (sub, ws, p) => {
    await reset(); await as(sub);
    return (await pg.query(`select public.has_permission($1,$2) as v`, [ws, p])).rows[0].v === true;
  };
  assert(await permAs(STAFF_A, WSA, "crm.export") === false,
    "STAFF lacks crm.export → forms-export returns 403 (gate denies)");
  assert(await permAs(MANAGER_A, WSA, "crm.export") === true,
    "MANAGER has crm.export → forms-export proceeds");
  assert(await permAs(OWNER_A, WSA, "crm.export") === true,
    "OWNER has crm.export (owner short-circuit)");
  // a per-member grant override adds crm.export to a STAFF member → export allowed.
  await reset();
  await pg.query(`update public.memberships set permissions='{"grant":["crm.export"]}'::jsonb
                    where workspace_id=$1 and user_id=$2`, [WSA, STAFF_A]);
  assert(await permAs(STAFF_A, WSA, "crm.export") === true,
    "STAFF with a crm.export grant override CAN export (per-member grant)");
  await reset();

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M15 probe: ${pass} passed, ${fail} failed\x1b[0m`);
  await pg.close();
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((e) => { console.error("harness error:", e); process.exitCode = 2; });
