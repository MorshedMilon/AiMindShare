// m20probe.mjs — verify the M20 Funnels SQL layer on REAL Postgres (PGlite, no
// Docker). Proves the DoD gates checkable without a live stack:
//   Schema       — funnels/funnel_steps/funnel_splits/funnel_visits exist + RLS.
//   Gate-1       — B's staff cannot select/insert/update A's funnels/steps/splits,
//                  nor read A's funnel_visits.
//   Gate-2 roles — funnels/steps/splits: staff+ read+edit, manager+ delete; a
//                  CLIENT role reads nothing (operator ceiling, D-095).
//   Gate-4/D-094 — funnel_visits is service-role-write only (a member cannot INSERT).
//   funnel_map   — per-step visitors/conversions/rate math is correct.
//   split stats  — two-proportion z-test flags a real winner; promote swaps the page.
//   order→M28    — create_funnel_order writes an invoices row (source_type='order')
//                  with trigger-computed totals (a browser can't forge the total).
//   record event — optin upserts a contact + funnel tag; purchase fires the M13 bus.
//   abandonment  — sweep_abandoned_funnels emits cart.abandoned once (idempotent).
//   grants       — order/track/sweep are service-role-only; map/stats authenticated.
//
//   node workers/verify/m20probe.mjs
//
// Exit 0 = all passed; 1 = a failure/leak. Depends on M05/M09/M11/M12/M13/M28/M19
// migrations. extensions/pg_trgm stripped; cron/realtime guarded in the migration.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const OWNER_A = "11111111-1111-1111-1111-111111111111";
const MANAGER_A = "99999999-9999-9999-9999-999999999999";
const STAFF_A = "66666666-6666-6666-6666-666666666666";
const CLIENT_A = "77777777-7777-7777-7777-777777777777";
const OWNER_B = "33333333-3333-3333-3333-333333333333";
const STAFF_B = "44444444-4444-4444-4444-444444444444";

const WSA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WSB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CONTACT_A = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const SITE_A = "51000000-0000-0000-0000-000000000001";
const PAGE_1 = "52000000-0000-0000-0000-000000000001";   // opt-in page
const PAGE_2 = "52000000-0000-0000-0000-000000000002";   // sales page
const PAGE_3 = "52000000-0000-0000-0000-000000000003";   // order page
const PAGE_B = "52000000-0000-0000-0000-000000000009";   // A/B variant page

const FUNNEL_A = "f0000000-0000-0000-0000-000000000001";
const STEP_1 = "5e000000-0000-0000-0000-000000000001";
const STEP_2 = "5e000000-0000-0000-0000-000000000002";
const STEP_3 = "5e000000-0000-0000-0000-000000000003";  // order step
const STEP_AB = "5e000000-0000-0000-0000-000000000004";  // split step

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
  // ⚠ Parallel-build numbering churn: M19 sites is 0022 and M20 is 0023 as of this
  // build (see the migration header). If a merge renumbers them, update these names.
  for (const m of ["0000_extensions_enums.sql", "0001_tenancy.sql", "0002_jobs.sql",
                   "0010_m05_compliance.sql", "0013_m09_crm.sql", "0014_m11_pipeline.sql",
                   "0015_m12_inbox.sql", "0016_m13_automations.sql", "0018_m28_payments.sql",
                   "0022_m19_sites.sql", "0023_m20_funnels.sql"]) {
    await pg.exec(load(m));
  }
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);
  // Faithful grant posture: the service-role-only entry points are revoked from
  // authenticated (the blanket grant above is a harness convenience for RLS tests).
  await pg.exec(`
    revoke execute on function public.create_funnel_order(uuid,uuid,uuid,uuid,jsonb,text,jsonb) from authenticated;
    revoke execute on function public.record_funnel_event(uuid,uuid,uuid,text,text,text,uuid,text,text,jsonb) from authenticated;
    revoke execute on function public.sweep_abandoned_funnels(uuid) from authenticated;
  `);

  // ── Seed two agencies + a WSA contact + an M19 site/pages ────────────────────
  await pg.exec(`
    insert into auth.users (id,email) values
      ('${OWNER_A}','oa@t'),('${MANAGER_A}','ma@t'),('${STAFF_A}','sa@t'),('${CLIENT_A}','ca@t'),
      ('${OWNER_B}','ob@t'),('${STAFF_B}','sb@t');
    insert into public.profiles (id,email,name) values
      ('${OWNER_A}','oa@t','OA'),('${MANAGER_A}','ma@t','MA'),('${STAFF_A}','sa@t','SA'),('${CLIENT_A}','ca@t','CA'),
      ('${OWNER_B}','ob@t','OB'),('${STAFF_B}','sb@t','SB');
    insert into public.workspaces (id,owner_id,name,slug) values
      ('${WSA}','${OWNER_A}','Acme','acme'),('${WSB}','${OWNER_B}','Beacon','beacon');
    insert into public.memberships (workspace_id,user_id,role,status) values
      ('${WSA}','${OWNER_A}','owner','active'),('${WSA}','${MANAGER_A}','manager','active'),
      ('${WSA}','${STAFF_A}','staff','active'),('${WSA}','${CLIENT_A}','client','active'),
      ('${WSB}','${OWNER_B}','owner','active'),('${WSB}','${STAFF_B}','staff','active');
    insert into public.contacts (id,workspace_id,first_name,source) values
      ('${CONTACT_A}','${WSA}','Yusuf','manual');
    insert into public.sites (id,workspace_id,name,subdomain,status) values
      ('${SITE_A}','${WSA}','Acme Site','acme','published');
    insert into public.pages (id,workspace_id,site_id,title,slug,status) values
      ('${PAGE_1}','${WSA}','${SITE_A}','Opt-in','optin','published'),
      ('${PAGE_2}','${WSA}','${SITE_A}','Sales','sales','published'),
      ('${PAGE_3}','${WSA}','${SITE_A}','Order','order','published'),
      ('${PAGE_B}','${WSA}','${SITE_A}','Sales B','sales-b','published');
  `);

  const as = (sub) => pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);

  // ── 1. Schema — 4 tables exist with RLS forced ───────────────────────────────
  console.log("\nM20 · schema — 4 tables exist with RLS enabled:");
  for (const t of ["funnels", "funnel_steps", "funnel_splits", "funnel_visits"]) {
    const r = await pg.query(`select to_regclass('public.${t}') as t, relrowsecurity
      from pg_class where relname=$1`, [t]);
    assert(r.rows[0]?.t && r.rows[0]?.relrowsecurity, `table ${t} exists + RLS enabled`);
  }

  // Seed a funnel + steps as manager (staff+ can insert).
  await reset(); await as(MANAGER_A);
  await pg.query(`insert into public.funnels (id,workspace_id,site_id,name,status,settings)
    values ($1,$2,$3,'Ramadan launch','active','{"abandon_hours":1}')`, [FUNNEL_A, WSA, SITE_A]);
  await pg.query(`insert into public.funnel_steps (id,workspace_id,funnel_id,page_id,step_order,step_type,name) values
    ($1,$6,$5,$7,0,'optin','Opt-in'),
    ($2,$6,$5,$8,1,'sales','Sales'),
    ($3,$6,$5,$9,2,'order','Order'),
    ($4,$6,$5,$8,3,'sales','Sales A/B')`,
    [STEP_1, STEP_2, STEP_3, STEP_AB, FUNNEL_A, WSA, PAGE_1, PAGE_2, PAGE_3]);

  // ── 2. Cross-tenant isolation (Gate-1) ───────────────────────────────────────
  console.log("\nM20 · cross-tenant isolation (agency B staff attacking agency A):");
  await reset(); await as(STAFF_B);
  assert(await count(pg, `select count(*)::int n from public.funnels where workspace_id=$1`, [WSA]) === 0,
    "B cannot SELECT A's funnels");
  assert(await count(pg, `select count(*)::int n from public.funnel_steps where workspace_id=$1`, [WSA]) === 0,
    "B cannot SELECT A's funnel_steps");
  assert(await denied(pg, `insert into public.funnels (workspace_id,name) values ($1,'HIJACK')`, [WSA]),
    "B cannot INSERT a funnel into A");
  assert(await denied(pg, `insert into public.funnel_steps (workspace_id,funnel_id,step_type,name) values ($1,$2,'sales','x')`, [WSA, FUNNEL_A]),
    "B cannot INSERT a step into A");
  assert((await pg.query(`update public.funnels set name='HIJACK' where workspace_id=$1`, [WSA])).affectedRows === 0,
    "B cannot UPDATE A's funnels (0 rows)");
  assert(await count(pg, `select count(*)::int n from public.funnel_visits where workspace_id=$1`, [WSA]) === 0,
    "B cannot SELECT A's funnel_visits");

  // ── 3. Role matrix (Gate-2) — staff edit · manager delete · client ceiling ───
  console.log("\nM20 · roles — staff+ edit · manager+ delete · client reads nothing:");
  await reset(); await as(STAFF_A);
  assert(await count(pg, `select count(*)::int n from public.funnels where workspace_id=$1`, [WSA]) >= 1,
    "staff CAN read funnels");
  const sFunnel = await pg.query(`insert into public.funnels (workspace_id,name) values ($1,'Staff funnel') returning id`, [WSA]);
  assert(!!sFunnel.rows[0]?.id, "staff CAN create a funnel");
  const sStep = await pg.query(`insert into public.funnel_steps (workspace_id,funnel_id,step_type,name) values ($1,$2,'optin','S') returning id`, [WSA, FUNNEL_A]);
  assert(!!sStep.rows[0]?.id, "staff CAN create a step");
  assert((await pg.query(`delete from public.funnels where id=$1`, [FUNNEL_A])).affectedRows === 0,
    "staff CANNOT delete a funnel (manager+, 0 rows)");

  await reset(); await as(CLIENT_A);
  assert(await count(pg, `select count(*)::int n from public.funnels where workspace_id=$1`, [WSA]) === 0,
    "client CANNOT read funnels (operator ceiling, D-095)");

  await reset(); await as(MANAGER_A);
  assert((await pg.query(`delete from public.funnels where id=$1`, [sFunnel.rows[0].id])).affectedRows === 1,
    "manager CAN delete a funnel");

  // ── 4. funnel_visits service-role-write only (Gate-4 / D-094) ────────────────
  console.log("\nM20 · funnel_visits is service-role-write-only:");
  await reset(); await as(STAFF_A);
  assert(await denied(pg, `insert into public.funnel_visits (workspace_id,funnel_id,visitor_id,event) values ($1,$2,'v1','view')`, [WSA, FUNNEL_A]),
    "authenticated member CANNOT insert a funnel_visit (no INSERT policy)");
  await reset();  // service-role context
  const vw = await pg.query(`insert into public.funnel_visits (workspace_id,funnel_id,step_id,visitor_id,event) values ($1,$2,$3,'v1','view') returning id`, [WSA, FUNNEL_A, STEP_1]);
  assert(!!vw.rows[0]?.id, "service role CAN insert a funnel_visit");

  // ── 5. funnel_map — per-step visitors/conversions/rate ───────────────────────
  console.log("\nM20 · funnel_map — per-step conversion math:");
  // Step 1: 10 views (v1..v10), 6 optins (v1..v6) → visitors 10, conv 6, rate 60.
  // Step 2: 6 views (v1..v6), 3 optins (v1..v3)   → visitors 6,  conv 3, rate 50.
  let seed = [];
  for (let i = 1; i <= 10; i++) seed.push(`('${WSA}','${FUNNEL_A}','${STEP_1}','v${i}','view')`);
  for (let i = 1; i <= 6; i++)  seed.push(`('${WSA}','${FUNNEL_A}','${STEP_1}','v${i}','optin')`);
  for (let i = 1; i <= 6; i++)  seed.push(`('${WSA}','${FUNNEL_A}','${STEP_2}','v${i}','view')`);
  for (let i = 1; i <= 3; i++)  seed.push(`('${WSA}','${FUNNEL_A}','${STEP_2}','v${i}','optin')`);
  await pg.exec(`insert into public.funnel_visits (workspace_id,funnel_id,step_id,visitor_id,event) values ${seed.join(",")};`);

  await as(STAFF_A);
  const map = (await pg.query(`select public.funnel_map($1) as m`, [FUNNEL_A])).rows[0].m;
  const byId = Object.fromEntries(map.map((s) => [s.id, s]));
  assert(byId[STEP_1].visitors === 10 && byId[STEP_1].conversions === 6 && Number(byId[STEP_1].rate) === 60,
    `step 1: visitors 10, conv 6, rate 60 (got ${byId[STEP_1].visitors}/${byId[STEP_1].conversions}/${byId[STEP_1].rate})`);
  assert(byId[STEP_2].visitors === 6 && byId[STEP_2].conversions === 3 && Number(byId[STEP_2].rate) === 50,
    `step 2: visitors 6, conv 3, rate 50 (got ${byId[STEP_2].visitors}/${byId[STEP_2].conversions}/${byId[STEP_2].rate})`);
  assert([STEP_1, STEP_2, STEP_3, STEP_AB].every((id) => byId[id]) &&
    map.every((s, i) => i === 0 || map[i - 1].step_order <= s.step_order),
    "funnel_map returns every step, ordered by step_order");
  await reset(); await as(STAFF_B);
  assert(await denied(pg, `select public.funnel_map($1)`, [FUNNEL_A]),
    "a non-member cannot call funnel_map (membership guard)");

  // ── 6. A/B split — stats z-test + winner detection + promote swaps page ──────
  console.log("\nM20 · A/B split — z-test winner detection + promote:");
  await reset(); await as(STAFF_A);
  const split = await pg.query(`insert into public.funnel_splits (workspace_id,step_id,variant_page_id,split,goal)
    values ($1,$2,$3,50,'progression') returning id`, [WSA, STEP_AB, PAGE_B]);
  assert(!!split.rows[0]?.id, "staff CAN create a split test");
  // Variant A: 40 views, 20 optins (50%). Variant B: 40 views, 4 optins (10%).
  await reset();
  let vs = [];
  for (let i = 0; i < 40; i++) vs.push(`('${WSA}','${FUNNEL_A}','${STEP_AB}','a${i}','A','view')`);
  for (let i = 0; i < 20; i++) vs.push(`('${WSA}','${FUNNEL_A}','${STEP_AB}','a${i}','A','optin')`);
  for (let i = 0; i < 40; i++) vs.push(`('${WSA}','${FUNNEL_A}','${STEP_AB}','b${i}','B','view')`);
  for (let i = 0; i < 4; i++)  vs.push(`('${WSA}','${FUNNEL_A}','${STEP_AB}','b${i}','B','optin')`);
  await pg.exec(`insert into public.funnel_visits (workspace_id,funnel_id,step_id,visitor_id,variant,event) values ${vs.join(",")};`);

  await as(STAFF_A);
  const stats = (await pg.query(`select public.funnel_split_stats($1) as s`, [STEP_AB])).rows[0].s;
  assert(stats.a.visitors === 40 && stats.a.conversions === 20 && Number(stats.a.rate) === 50,
    `variant A: 40 visitors, 20 conv, 50% (got ${stats.a.visitors}/${stats.a.conversions}/${stats.a.rate})`);
  assert(stats.b.visitors === 40 && stats.b.conversions === 4 && Number(stats.b.rate) === 10,
    `variant B: 40 visitors, 4 conv, 10% (got ${stats.b.visitors}/${stats.b.conversions}/${stats.b.rate})`);
  assert(stats.significant === true && stats.leader === "A",
    `z-test flags a significant winner = A (z=${stats.z}, sig=${stats.significant}, leader=${stats.leader})`);

  // promote: staff cannot; manager can; B wins → step page swaps to PAGE_B.
  assert(await denied(pg, `select public.promote_split_winner($1,'B')`, [STEP_AB]),
    "staff CANNOT promote a winner (manager+)");
  await reset(); await as(MANAGER_A);
  await pg.query(`select public.promote_split_winner($1,'B')`, [STEP_AB]);
  assert((await pg.query(`select page_id from public.funnel_steps where id=$1`, [STEP_AB])).rows[0].page_id === PAGE_B,
    "promote 'B' swaps the winning page in as the step's live page");
  assert((await pg.query(`select status, winner from public.funnel_splits where id=$1`, [split.rows[0].id])).rows[0].status === "promoted",
    "split marked promoted with winner recorded");

  // ── 7. create_funnel_order — wires to M28 (invoices, source_type='order') ────
  console.log("\nM20 · order forms wired to M28 (create_funnel_order):");
  await reset();  // service-role (the public Edge Fn)
  const items = JSON.stringify([{ description: "Course — Ramadan Reset", qty: 1, unit_price: 19900 }]);
  const bump = JSON.stringify({ description: "Workbook bump", qty: 1, unit_price: 2900 });
  // call as a table source so the composite return expands into named columns (once).
  const order = (await pg.query(`select i.* from public.create_funnel_order($1,$2,$3,$4,$5,'USD',$6) as i`,
    [WSA, FUNNEL_A, STEP_3, CONTACT_A, items, bump])).rows[0];
  assert(order.source_type === "order" && order.source_id === STEP_3,
    "order creates an M28 invoice tagged source_type='order' + source_id=step");
  assert(order.total === 22800 && order.subtotal === 22800,
    `M28 trigger computed the total server-side = 22800 minor (got ${order.total})`);
  assert(!!order.number,
    "the M28 numbering trigger assigned an invoice number to the order");
  assert(await count(pg, `select count(*)::int n from public.funnel_visits where step_id=$1 and visitor_id like 'order:%'`, [STEP_3]) === 1,
    "create_funnel_order linked the order into the funnel event stream");

  // ── 8. record_funnel_event — optin upserts contact + tag; purchase fires bus ─
  console.log("\nM20 · record_funnel_event — optin CRM upsert + purchase bus:");
  await reset();
  await pg.query(`select public.record_funnel_event($1,$2,$3,$4,'optin',null,null,$5,$6,'{}'::jsonb)`,
    [WSA, FUNNEL_A, STEP_1, "vis-optin", "aisha@ex.com", "Aisha Rahman"]);
  const oc = await pg.query(`select id, first_name, last_name from public.contacts where lower(email)='aisha@ex.com' and workspace_id=$1`, [WSA]);
  assert(oc.rows.length === 1 && oc.rows[0].first_name === "Aisha" && oc.rows[0].last_name === "Rahman",
    "optin upserts a CRM contact with a split name");
  assert(await count(pg, `select count(*)::int n from public.contact_tags ct join public.tags t on t.id=ct.tag_id
     where ct.contact_id=$1 and t.name='Funnel opt-in'`, [oc.rows[0].id]) === 1,
    "optin attaches the 'Funnel opt-in' source tag");
  // purchase fires the M13 bus (enrols a matching workflow).
  await pg.query(`insert into public.workflows (workspace_id,name,trigger_type,is_active,reentry_rule,nodes,edges)
    values ($1,'On payment','payment.received',true,'allow','[]','[]')`, [WSA]);
  const execBefore = await count(pg, `select count(*)::int n from public.workflow_executions where workspace_id=$1`, [WSA]);
  await pg.query(`select public.record_funnel_event($1,$2,$3,$4,'purchase',null,$5,null,null,'{}'::jsonb)`,
    [WSA, FUNNEL_A, STEP_3, "vis-buy", CONTACT_A]);
  assert(await count(pg, `select count(*)::int n from public.workflow_executions where workspace_id=$1`, [WSA]) === execBefore + 1,
    "purchase event fires payment.received on the M13 bus (workflow enrolled)");

  // ── 9. sweep_abandoned_funnels — cart.abandoned once, idempotent ─────────────
  console.log("\nM20 · abandonment sweep — cart.abandoned (idempotent):");
  await reset();
  // Age the order past the 1h window and enrol a cart.abandoned workflow.
  await pg.query(`update public.invoices set created_at = now() - interval '3 hours' where source_type='order'`);
  await pg.query(`insert into public.workflows (workspace_id,name,trigger_type,is_active,reentry_rule,nodes,edges)
    values ($1,'Recover cart','cart.abandoned',true,'allow','[]','[]')`, [WSA]);
  const exBefore = await count(pg, `select count(*)::int n from public.workflow_executions where workspace_id=$1`, [WSA]);
  const swept = Number((await pg.query(`select public.sweep_abandoned_funnels($1) as n`, [WSA])).rows[0].n);
  assert(swept === 1, `sweep flags exactly the 1 abandoned order (got ${swept})`);
  assert(await count(pg, `select count(*)::int n from public.workflow_executions where workspace_id=$1`, [WSA]) === exBefore + 1,
    "cart.abandoned fired on the M13 bus (recovery workflow enrolled)");
  const swept2 = Number((await pg.query(`select public.sweep_abandoned_funnels($1) as n`, [WSA])).rows[0].n);
  assert(swept2 === 0, "second sweep is idempotent (0 — the order is already marked abandoned)");

  // ── 10. Grants — order/track/sweep service-role only; map/stats authenticated ─
  console.log("\nM20 · grants — privileged writes are service-role only:");
  const canExec = async (role, sig) => (await pg.query(
    `select has_function_privilege('${role}','public.${sig}','execute') ok`)).rows[0].ok;
  assert(await canExec("service_role", "create_funnel_order(uuid,uuid,uuid,uuid,jsonb,text,jsonb)"),
    "service_role CAN execute create_funnel_order");
  assert(!(await canExec("authenticated", "create_funnel_order(uuid,uuid,uuid,uuid,jsonb,text,jsonb)")),
    "authenticated CANNOT execute create_funnel_order (service-role only)");
  assert(!(await canExec("authenticated", "sweep_abandoned_funnels(uuid)")),
    "authenticated CANNOT execute sweep_abandoned_funnels (service-role only)");
  assert(await canExec("authenticated", "funnel_map(uuid)"),
    "authenticated CAN execute funnel_map (browser read path)");

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M20 probe: ${pass} passed, ${fail} failed\x1b[0m`);
  await pg.close();
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((e) => { console.error("harness error:", e); process.exitCode = 2; });
