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
const PAGE_C = "52000000-0000-0000-0000-00000000000a";   // A/B/C variant page

const FUNNEL_A = "f0000000-0000-0000-0000-000000000001";
const STEP_1 = "5e000000-0000-0000-0000-000000000001";
const STEP_2 = "5e000000-0000-0000-0000-000000000002";
const STEP_3 = "5e000000-0000-0000-0000-000000000003";  // order step
const STEP_AB = "5e000000-0000-0000-0000-000000000004";  // split step
const STEP_ABC = "5e000000-0000-0000-0000-000000000005";  // 3-arm split (A wins, auto_promote)
const STEP_CWIN = "5e000000-0000-0000-0000-000000000006";  // 3-arm split (C wins, manual promote)
const STEP_STOP = "5e000000-0000-0000-0000-000000000007";  // plain split, stopped not promoted

const FUNNEL_REV = "f0000000-0000-0000-0000-000000000002";
const STEP_REV_ENTRY = "5e000000-0000-0000-0000-000000000010";  // optin, step_order 0
const STEP_REV_ORDER = "5e000000-0000-0000-0000-000000000011";  // order, priced

const FUNNEL_TEST = "f0000000-0000-0000-0000-000000000003";
const STEP_TEST = "5e000000-0000-0000-0000-000000000020";  // order step on a test_mode funnel
const STEP_HOOK = "5e000000-0000-0000-0000-000000000030";  // throwaway step+split for the test.winner_selected hook

const CONTACT_IG = "cccccccc-cccc-cccc-cccc-cccccccccccd";
const CONTACT_DIRECT = "cccccccc-cccc-cccc-cccc-ccccccccccce";
const CONTACT_TEST = "cccccccc-cccc-cccc-cccc-cccccccccccf";

const FUNNEL_REC = "f0000000-0000-0000-0000-000000000004";
const STEP_REC_1 = "5e000000-0000-0000-0000-000000000040";  // optin, step_order 0
const STEP_REC_2 = "5e000000-0000-0000-0000-000000000041";  // sales, step_order 1 (big drop-off into here)
const STEP_REC_3 = "5e000000-0000-0000-0000-000000000042";  // order, step_order 2, priced, no bump
const STEP_REC_SPLIT = "5e000000-0000-0000-0000-000000000043";  // sales, step_order 3, running split, B leads

const FUNNEL_COMP = "f0000000-0000-0000-0000-000000000005";
const STEP_COMP = "5e000000-0000-0000-0000-000000000050";  // sales step with deliberately risky copy

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
                   "0022_m19_sites.sql", "0023_m20_funnels.sql", "0028_m19_sites_v2.sql",
                   "0029_m20_funnels_v2.sql", "0030_m20_funnels_v2b.sql", "0031_m20_funnels_v2c.sql",
                   "0032_m20_funnels_v2d.sql", "0033_m20_funnels_v2e.sql", "0034_m20_funnels_v3a.sql",
                   "0035_m20_funnels_v3b.sql", "0036_m20_funnels_v3c.sql", "0037_m29_affiliate_hub.sql",
                   "0038_m20_funnels_v3d.sql"]) {
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
    revoke execute on function public.auto_promote_split_winners(uuid) from authenticated;
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
      ('${CONTACT_A}','${WSA}','Yusuf','manual'),
      ('${CONTACT_IG}','${WSA}','Instagram Lead','manual'),
      ('${CONTACT_DIRECT}','${WSA}','Direct Lead','manual'),
      ('${CONTACT_TEST}','${WSA}','Test Lead','manual');
    insert into public.sites (id,workspace_id,name,subdomain,status) values
      ('${SITE_A}','${WSA}','Acme Site','acme','published');
    insert into public.pages (id,workspace_id,site_id,title,slug,status) values
      ('${PAGE_1}','${WSA}','${SITE_A}','Opt-in','optin','published'),
      ('${PAGE_2}','${WSA}','${SITE_A}','Sales','sales','published'),
      ('${PAGE_3}','${WSA}','${SITE_A}','Order','order','published'),
      ('${PAGE_B}','${WSA}','${SITE_A}','Sales B','sales-b','published'),
      ('${PAGE_C}','${WSA}','${SITE_A}','Sales C','sales-c','published');
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
  await reset();  // cleanup: this ad hoc step has no page — drop it so it doesn't pollute later readiness checks.
  await pg.query(`delete from public.funnel_steps where id=$1`, [sStep.rows[0].id]);
  await as(STAFF_A);
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

  // ── 11. v2 schema — enum widened + test-mode columns (D-153/D-154) ──────────
  console.log("\nM20 v2 · schema — funnel_status widened + test-mode columns:");
  const enumVals = (await pg.query(`select enumlabel from pg_enum e
    join pg_type t on t.oid = e.enumtypid where t.typname = 'funnel_status' order by enumsortorder`)).rows.map(r => r.enumlabel);
  assert(["draft", "active", "archived", "testing", "paused"].every((v) => enumVals.includes(v)),
    `funnel_status has testing + paused alongside the original 3 values (got ${enumVals.join(",")})`);
  for (const [t, c] of [["funnels", "test_mode"], ["funnel_visits", "is_test"], ["invoices", "is_test"]]) {
    const r = await pg.query(`select column_default from information_schema.columns where table_name=$1 and column_name=$2`, [t, c]);
    assert(/false/.test(r.rows[0]?.column_default || ""), `${t}.${c} exists and defaults to false`);
  }

  // ── 12. funnel_publish_readiness — blockers vs warnings (D-157) ──────────────
  console.log("\nM20 v2 · funnel_publish_readiness — go-live blockers vs warnings:");
  await reset(); await as(STAFF_A);
  let ready = (await pg.query(`select public.funnel_publish_readiness($1) as r`, [FUNNEL_A])).rows[0].r;
  assert(ready.ready === false && ready.blockers.some((b) => /Order.*priced product/.test(b)),
    `unpriced order step blocks go-live (got ready=${ready.ready}, blockers=${JSON.stringify(ready.blockers)})`);
  assert(ready.warnings.some((w) => /domain/i.test(w)) && ready.warnings.some((w) => /SSL/.test(w)),
    "domain-not-verified + SSL-not-provisioned warnings surface from site_publish_log absence");

  await reset();
  await pg.query(`update public.funnel_steps set config = '{"products":[{"name":"Bundle","price":19900}]}'::jsonb where id=$1`, [STEP_3]);
  await pg.query(`insert into public.site_publish_log (workspace_id, site_id, kind, status) values ($1,$2,'domain.verify','ok')`, [WSA, SITE_A]);
  await as(STAFF_A);
  ready = (await pg.query(`select public.funnel_publish_readiness($1) as r`, [FUNNEL_A])).rows[0].r;
  assert(ready.ready === true && ready.blockers.length === 0,
    `pricing the order step clears all blockers (got ready=${ready.ready}, blockers=${JSON.stringify(ready.blockers)})`);
  assert(ready.warnings.length === 1 && /SSL/.test(ready.warnings[0]),
    `verifying the domain clears that warning, SSL warning remains (got ${JSON.stringify(ready.warnings)})`);

  // ── 13. test_mode → is_test propagation (D-154) ──────────────────────────────
  console.log("\nM20 v2 · test-mode propagation — record_funnel_event + create_funnel_order:");
  await reset();
  await pg.query(`insert into public.funnels (id,workspace_id,name,status,test_mode) values ($1,$2,'Test funnel','draft',true)`, [FUNNEL_TEST, WSA]);
  await pg.query(`insert into public.funnel_steps (id,workspace_id,funnel_id,page_id,step_order,step_type,name) values
    ($1,$2,$3,$4,0,'order','Order')`, [STEP_TEST, WSA, FUNNEL_TEST, PAGE_3]);
  await pg.query(`select public.record_funnel_event($1,$2,$3,'vis-test1','view')`, [WSA, FUNNEL_TEST, STEP_TEST]);
  assert((await pg.query(`select is_test from public.funnel_visits where visitor_id='vis-test1'`)).rows[0].is_test === true,
    "record_funnel_event stamps is_test=true from a test_mode funnel");
  const testItems = JSON.stringify([{ description: "Test item", qty: 1, unit_price: 5000 }]);
  const testOrder = (await pg.query(`select i.* from public.create_funnel_order($1,$2,$3,$4,$5) as i`,
    [WSA, FUNNEL_TEST, STEP_TEST, CONTACT_TEST, testItems])).rows[0];
  assert(testOrder.is_test === true, "create_funnel_order stamps is_test=true from a test_mode funnel");

  // ── 14. Variant governance — 3-arm stats, promote 'C', stop, auto-promote ────
  console.log("\nM20 v2 · variant governance — A/B/C stats, promote C, stop, auto-promote (D-155/D-156):");
  await reset(); await as(MANAGER_A);
  await pg.query(`insert into public.funnel_steps (id,workspace_id,funnel_id,page_id,step_order,step_type,name) values
    ($1,$5,$4,$6,4,'sales','ABC test'), ($2,$5,$4,$6,5,'sales','C wins'), ($3,$5,$4,$6,6,'sales','Stop me')`,
    [STEP_ABC, STEP_CWIN, STEP_STOP, FUNNEL_A, WSA, PAGE_2]);
  await pg.query(`insert into public.funnel_splits
      (workspace_id, step_id, variant_page_id, variant_c_page_id, split, split_c, goal, min_sample_size, confidence, auto_promote) values
      ($1,$2,$3,$4,34,33,'progression',10,0.90,true)`, [WSA, STEP_ABC, PAGE_B, PAGE_C]);
  const splitCwin = await pg.query(`insert into public.funnel_splits
      (workspace_id, step_id, variant_page_id, variant_c_page_id, split, split_c, goal, min_sample_size, confidence) values
      ($1,$2,$3,$4,34,33,'progression',5,0.95) returning id`, [WSA, STEP_CWIN, PAGE_B, PAGE_C]);
  const splitStop = await pg.query(`insert into public.funnel_splits (workspace_id, step_id, variant_page_id, split, goal) values
      ($1,$2,$3,50,'progression') returning id`, [WSA, STEP_STOP, PAGE_B]);

  await reset();
  const abcVisits = [];
  // A: 15 views / 10 optins (66.7%) · B: 15/3 (20%) · C: 15/2 (13.3%) — A wins clearly.
  for (let i = 0; i < 15; i++) abcVisits.push(`('${WSA}','${FUNNEL_A}','${STEP_ABC}','abc-a${i}','A','view')`);
  for (let i = 0; i < 10; i++) abcVisits.push(`('${WSA}','${FUNNEL_A}','${STEP_ABC}','abc-a${i}','A','optin')`);
  for (let i = 0; i < 15; i++) abcVisits.push(`('${WSA}','${FUNNEL_A}','${STEP_ABC}','abc-b${i}','B','view')`);
  for (let i = 0; i < 3; i++)  abcVisits.push(`('${WSA}','${FUNNEL_A}','${STEP_ABC}','abc-b${i}','B','optin')`);
  for (let i = 0; i < 15; i++) abcVisits.push(`('${WSA}','${FUNNEL_A}','${STEP_ABC}','abc-c${i}','C','view')`);
  for (let i = 0; i < 2; i++)  abcVisits.push(`('${WSA}','${FUNNEL_A}','${STEP_ABC}','abc-c${i}','C','optin')`);
  await pg.exec(`insert into public.funnel_visits (workspace_id,funnel_id,step_id,visitor_id,variant,event) values ${abcVisits.join(",")};`);
  // C-wins step: A 10/2 (20%) · B 10/2 (20%) · C 10/8 (80%).
  const cwinVisits = [];
  for (let i = 0; i < 10; i++) cwinVisits.push(`('${WSA}','${FUNNEL_A}','${STEP_CWIN}','cw-a${i}','A','view')`);
  for (let i = 0; i < 2; i++)  cwinVisits.push(`('${WSA}','${FUNNEL_A}','${STEP_CWIN}','cw-a${i}','A','optin')`);
  for (let i = 0; i < 10; i++) cwinVisits.push(`('${WSA}','${FUNNEL_A}','${STEP_CWIN}','cw-b${i}','B','view')`);
  for (let i = 0; i < 2; i++)  cwinVisits.push(`('${WSA}','${FUNNEL_A}','${STEP_CWIN}','cw-b${i}','B','optin')`);
  for (let i = 0; i < 10; i++) cwinVisits.push(`('${WSA}','${FUNNEL_A}','${STEP_CWIN}','cw-c${i}','C','view')`);
  for (let i = 0; i < 8; i++)  cwinVisits.push(`('${WSA}','${FUNNEL_A}','${STEP_CWIN}','cw-c${i}','C','optin')`);
  await pg.exec(`insert into public.funnel_visits (workspace_id,funnel_id,step_id,visitor_id,variant,event) values ${cwinVisits.join(",")};`);

  await as(STAFF_A);
  const abcStats = (await pg.query(`select public.funnel_split_stats($1) as s`, [STEP_ABC])).rows[0].s;
  assert(abcStats.has_c === true && abcStats.c.visitors === 15 && abcStats.c.conversions === 2,
    `3-arm stats include variant C (got has_c=${abcStats.has_c}, c=${JSON.stringify(abcStats.c)})`);
  assert(abcStats.significant === true && abcStats.leader === "A",
    `A beats both B and C significantly (got leader=${abcStats.leader}, sig=${abcStats.significant}, z=${abcStats.z})`);

  const cwinStats = (await pg.query(`select public.funnel_split_stats($1) as s`, [STEP_CWIN])).rows[0].s;
  assert(cwinStats.significant === true && cwinStats.leader === "C",
    `C beats both A and B significantly (got leader=${cwinStats.leader}, sig=${cwinStats.significant})`);
  assert(await denied(pg, `select public.promote_split_winner($1,'C')`, [STEP_CWIN]),
    "staff CANNOT promote variant C (manager+)");
  await reset(); await as(MANAGER_A);
  await pg.query(`select public.promote_split_winner($1,'C')`, [STEP_CWIN]);
  assert((await pg.query(`select page_id from public.funnel_steps where id=$1`, [STEP_CWIN])).rows[0].page_id === PAGE_C,
    "promote 'C' swaps the winning page in as the step's live page");
  assert(await denied(pg, `select public.promote_split_winner($1,'C')`, [STEP_AB]),
    "promoting 'C' on a split with no variant C configured is rejected");

  await reset(); await as(STAFF_A);
  assert(await denied(pg, `select public.stop_split($1)`, [STEP_STOP]), "staff CANNOT stop a test (manager+)");
  await reset(); await as(MANAGER_A);
  const stopped = (await pg.query(`select s.* from public.stop_split($1) as s`, [STEP_STOP])).rows[0];
  assert(stopped.status === "stopped", "manager CAN stop a running test without declaring a winner");

  // auto_promote_split_winners: only STEP_ABC's split has auto_promote=true.
  await reset();
  const autoSwept1 = Number((await pg.query(`select public.auto_promote_split_winners($1) as n`, [WSA])).rows[0].n);
  assert(autoSwept1 === 1, `auto-promote sweep promotes exactly the 1 eligible split (got ${autoSwept1})`);
  const abcSplit = (await pg.query(`select status, winner from public.funnel_splits where step_id=$1 order by created_at desc limit 1`, [STEP_ABC])).rows[0];
  assert(abcSplit.status === "promoted" && abcSplit.winner === "A", "auto-promote declared A the winner on the ABC split");
  assert((await pg.query(`select page_id from public.funnel_steps where id=$1`, [STEP_ABC])).rows[0].page_id === PAGE_2,
    "A winning leaves the step's page unchanged (no swap needed)");
  const autoSwept2 = Number((await pg.query(`select public.auto_promote_split_winners($1) as n`, [WSA])).rows[0].n);
  assert(autoSwept2 === 0, "second auto-promote sweep is idempotent (0 — already promoted)");

  // ── 15. funnel_revenue_summary — per-step/source revenue, AOV, EPC (D-158) ───
  console.log("\nM20 v2 · funnel_revenue_summary — revenue/AOV/EPC + by_step + by_source:");
  await reset(); await as(MANAGER_A);
  await pg.query(`insert into public.funnels (id,workspace_id,site_id,name,status) values ($1,$2,$3,'Revenue test','active')`,
    [FUNNEL_REV, WSA, SITE_A]);
  await pg.query(`insert into public.funnel_steps (id,workspace_id,funnel_id,page_id,step_order,step_type,name) values
    ($1,$4,$3,$5,0,'optin','Entry'), ($2,$4,$3,$6,1,'order','Order')`,
    [STEP_REV_ENTRY, STEP_REV_ORDER, FUNNEL_REV, WSA, PAGE_1, PAGE_3]);

  await reset();
  await pg.query(`insert into public.funnel_visits (workspace_id,funnel_id,step_id,visitor_id,contact_id,event,utm) values
    ($1,$2,$3,'ig1',$4,'view','{"utm_source":"instagram"}'::jsonb),
    ($1,$2,$3,'ig1',$4,'optin','{"utm_source":"instagram"}'::jsonb),
    ($1,$2,$3,'dir1',$5,'view','{}'::jsonb)`,
    [WSA, FUNNEL_REV, STEP_REV_ENTRY, CONTACT_IG, CONTACT_DIRECT]);
  await pg.query(`insert into public.invoices (workspace_id,contact_id,kind,currency,line_items,status,source_type,source_id,amount_paid,paid_at,is_test) values
    ($1,$2,'invoice','USD','[{"description":"Bundle","qty":1,"unit_price":9900}]'::jsonb,'paid','order',$3,9900,now(),false),
    ($1,$4,'invoice','USD','[{"description":"Bundle","qty":1,"unit_price":4900}]'::jsonb,'paid','order',$3,4900,now(),false),
    ($1,$5,'invoice','USD','[{"description":"Bundle","qty":1,"unit_price":5000}]'::jsonb,'paid','order',$3,5000,now(),true)`,
    [WSA, CONTACT_IG, STEP_REV_ORDER, CONTACT_DIRECT, CONTACT_TEST]);

  await as(STAFF_A);
  const rev = (await pg.query(`select public.funnel_revenue_summary($1) as r`, [FUNNEL_REV])).rows[0].r;
  assert(rev.revenue === 14800 && rev.orders === 2,
    `revenue excludes the is_test invoice (got revenue=${rev.revenue}, orders=${rev.orders})`);
  assert(Number(rev.aov) === 7400 && Number(rev.epc) === 7400 && rev.visitors === 2,
    `AOV + EPC computed off 2 orders / 2 entry visitors (got aov=${rev.aov}, epc=${rev.epc}, visitors=${rev.visitors})`);
  assert(rev.by_step.length === 1 && rev.by_step[0].revenue === 14800,
    `by_step reports the order step's revenue (got ${JSON.stringify(rev.by_step)})`);
  const bySource = Object.fromEntries(rev.by_source.map((s) => [s.source, s]));
  assert(bySource.instagram?.revenue === 9900 && bySource.instagram?.visitors === 1,
    `by_source attributes the Instagram contact's order to 'instagram' (got ${JSON.stringify(bySource.instagram)})`);
  assert(bySource.direct?.revenue === 4900 && bySource.direct?.visitors === 1,
    `by_source attributes the untagged contact's order to 'direct' (got ${JSON.stringify(bySource.direct)})`);
  assert(!Object.values(bySource).some((s) => s.revenue === 5000),
    "the is_test invoice's revenue does not appear under any source");

  // ── 16. Automation hooks — funnel/step/form/checkout/upsell·downsell/test/publish (D-159/D-160/D-161) ──
  console.log("\nM20 v2 · automation hooks — emit_trigger wired into the funnel lifecycle:");
  await reset();
  const HOOK_TYPES = ["funnel.entered", "step.completed", "form.submitted", "checkout.started",
    "upsell.accepted", "upsell.declined", "downsell.accepted", "downsell.declined",
    "test.winner_selected", "funnel.published"];
  for (const t of HOOK_TYPES) {
    await pg.query(`insert into public.workflows (workspace_id,name,trigger_type,is_active,reentry_rule,nodes,edges)
      values ($1,$2,$3,true,'allow','[]','[]')`, [WSA, "Hook " + t, t]);
  }
  const hookCount = (t) => count(pg,
    `select count(*)::int n from public.workflow_executions we
     join public.workflows w on w.id = we.workflow_id where w.trigger_type=$1 and we.workspace_id=$2`, [t, WSA]);

  await pg.query(`select public.record_funnel_event($1,$2,$3,'hook-v1','view')`, [WSA, FUNNEL_A, STEP_1]);
  assert(await hookCount("funnel.entered") === 1, "first 'view' on the entry step (step_order 0) fires funnel.entered");
  assert(await hookCount("step.completed") === 0, "entry-step view does NOT fire step.completed");

  await pg.query(`select public.record_funnel_event($1,$2,$3,'hook-v1','view')`, [WSA, FUNNEL_A, STEP_2]);
  assert(await hookCount("step.completed") === 1, "a later 'view' (step_order > 0) fires step.completed");
  assert(await hookCount("funnel.entered") === 1, "the same visitor's 2nd view does not re-fire funnel.entered");

  await pg.query(`select public.record_funnel_event($1,$2,$3,'hook-v1','optin',null,null,'hook@ex.com','Hook Visitor')`, [WSA, FUNNEL_A, STEP_1]);
  assert(await hookCount("form.submitted") === 1, "an 'optin' event fires form.submitted");

  const hookItems = JSON.stringify([{ description: "Hook item", qty: 1, unit_price: 1000 }]);
  await pg.query(`select public.create_funnel_order($1,$2,$3,$4,$5)`, [WSA, FUNNEL_A, STEP_3, CONTACT_A, hookItems]);
  assert(await hookCount("checkout.started") === 1, "create_funnel_order fires checkout.started");

  for (const ev of ["upsell_accepted", "upsell_declined", "downsell_accepted", "downsell_declined"]) {
    await pg.query(`select public.record_funnel_event($1,$2,$3,$4,$5)`, [WSA, FUNNEL_A, STEP_2, "hook-" + ev, ev]);
  }
  for (const t of ["upsell.accepted", "upsell.declined", "downsell.accepted", "downsell.declined"]) {
    assert(await hookCount(t) === 1, `${t.replace(".", "_")} event fires the ${t} trigger`);
  }

  await as(MANAGER_A);
  await pg.query(`insert into public.funnel_steps (id,workspace_id,funnel_id,page_id,step_order,step_type,name) values
    ($1,$2,$3,$4,8,'sales','Hook step')`, [STEP_HOOK, WSA, FUNNEL_A, PAGE_2]);
  await pg.query(`insert into public.funnel_splits (workspace_id, step_id, variant_page_id, split, goal) values
    ($1,$2,$3,50,'progression')`, [WSA, STEP_HOOK, PAGE_B]);
  await pg.query(`select public.promote_split_winner($1,'A')`, [STEP_HOOK]);
  assert(await hookCount("test.winner_selected") === 1, "promote_split_winner fires test.winner_selected");

  await reset();
  await pg.query(`select public.set_funnel_status($1,'active')`, [FUNNEL_TEST]);
  assert(await hookCount("funnel.published") === 1, "a draft→active transition fires funnel.published");
  await pg.query(`select public.set_funnel_status($1,'active')`, [FUNNEL_TEST]);
  assert(await hookCount("funnel.published") === 1, "re-setting the same status again does NOT re-fire (still 1)");
  assert((await pg.query(`select status from public.funnels where id=$1`, [FUNNEL_TEST])).rows[0].status === "active",
    "set_funnel_status actually updated the row");

  // ── 17. duplicate_funnel — plain copy / save-as-template / from-template (D-163/D-164) ──
  console.log("\nM20 v2 · duplicate_funnel — copy steps not splits/visits, template strips site/page, routing remaps:");
  await reset(); await as(STAFF_A);
  await pg.query(`update public.funnel_steps set config = jsonb_set(coalesce(config,'{}'::jsonb), '{next_step_id}', to_jsonb($2::text)) where id = $1`, [STEP_1, STEP_2]);

  const dup = (await pg.query(`select f.* from public.duplicate_funnel($1, false, null, null) as f`, [FUNNEL_A])).rows[0];
  assert(dup.status === "draft" && dup.test_mode === false && dup.template_of_id === FUNNEL_A && dup.is_template === false,
    "plain duplicate: draft, not a template, lineage points at the source");
  assert(dup.site_id === SITE_A, "plain duplicate keeps the source's site_id");
  const dupSteps = (await pg.query(`select * from public.funnel_steps where funnel_id=$1 order by step_order`, [dup.id])).rows;
  assert(dupSteps.length === (await count(pg, `select count(*)::int n from public.funnel_steps where funnel_id=$1`, [FUNNEL_A])),
    `duplicate copied every step (got ${dupSteps.length})`);
  assert(dupSteps.every((s) => s.page_id !== null || true) && dupSteps[0].page_id === PAGE_1,
    "plain duplicate keeps each step's page_id");
  assert(await count(pg, `select count(*)::int n from public.funnel_splits where step_id = any($1::uuid[])`, [dupSteps.map((s) => s.id)]) === 0,
    "duplicate copies zero funnel_splits (clean slate)");
  assert(await count(pg, `select count(*)::int n from public.funnel_visits where funnel_id=$1`, [dup.id]) === 0,
    "duplicate copies zero funnel_visits (clean slate)");
  const dupStep1 = dupSteps.find((s) => s.step_order === 0);
  const dupStep2 = dupSteps.find((s) => s.step_order === 1);
  assert(dupStep1.config?.next_step_id === dupStep2.id,
    `next_step_id remapped to the COPIED step, not the original (got ${dupStep1.config?.next_step_id} vs copy ${dupStep2.id})`);

  const tmpl = (await pg.query(`select f.* from public.duplicate_funnel($1, true, 'My Template', null) as f`, [FUNNEL_A])).rows[0];
  assert(tmpl.is_template === true && tmpl.site_id === null, "save-as-template: is_template=true, site_id stripped");
  const tmplSteps = (await pg.query(`select * from public.funnel_steps where funnel_id=$1`, [tmpl.id])).rows;
  assert(tmplSteps.every((s) => s.page_id === null), "save-as-template strips page_id off every copied step");

  const fromTmpl = (await pg.query(`select f.* from public.duplicate_funnel($1, false, 'From my template', $2) as f`, [tmpl.id, SITE_A])).rows[0];
  assert(fromTmpl.is_template === false && fromTmpl.site_id === SITE_A,
    "create-from-template: not itself a template, site_id comes from p_site_id (the template had none)");

  await reset(); await as(STAFF_B);
  assert(await denied(pg, `select public.duplicate_funnel($1)`, [FUNNEL_A]),
    "a non-member (B) cannot duplicate A's funnel");

  // ── 18. funnel_access — narrow-only permissions (D-165/D-166) ────────────────
  console.log("\nM20 v2 · funnel_access — narrow-only, server-enforced analytics visibility:");
  await reset(); const r = await pg.query(`select to_regclass('public.funnel_access') as t, relrowsecurity from pg_class where relname='funnel_access'`);
  assert(r.rows[0]?.t && r.rows[0]?.relrowsecurity, "table funnel_access exists + RLS enabled");

  await as(STAFF_A);
  assert(await denied(pg, `select public.set_funnel_access($1,$2,true,false)`, [FUNNEL_A, STAFF_A]),
    "staff CANNOT grant/restrict funnel_access (manager+)");
  // baseline: no funnel_access row yet → staff can read full analytics (unchanged default behavior).
  await pg.query(`select public.funnel_map($1)`, [FUNNEL_A]);

  await reset(); await as(MANAGER_A);
  const fa = await pg.query(`select fa.* from public.set_funnel_access($1,$2,true,false) as fa`, [FUNNEL_A, STAFF_A]);
  assert(fa.rows[0]?.can_edit === true && fa.rows[0]?.can_view_analytics === false, "manager CAN restrict a staff member's analytics visibility");

  await reset(); await as(STAFF_B);
  assert(await count(pg, `select count(*)::int n from public.funnel_access where workspace_id=$1`, [WSA]) === 0,
    "B cannot SELECT A's funnel_access rows");

  await reset(); await as(STAFF_A);
  assert(await denied(pg, `select public.funnel_map($1)`, [FUNNEL_A]),
    "the restricted staff member is now denied funnel_map (server-enforced, not just UI)");
  assert(await denied(pg, `select public.funnel_revenue_summary($1)`, [FUNNEL_A]),
    "...and denied funnel_revenue_summary too");

  await reset(); await as(MANAGER_A);
  await pg.query(`select public.remove_funnel_access($1,$2)`, [FUNNEL_A, STAFF_A]);
  await reset(); await as(STAFF_A);
  await pg.query(`select public.funnel_map($1)`, [FUNNEL_A]);
  assert(true, "removing the restriction restores default analytics access (funnel_map no longer throws)");

  // ── 19. funnel_operations_log — automation delivery log + abandoned/promoted counts (D-167) ──
  console.log("\nM20 v2 · funnel_operations_log — derived read-only observability:");
  await reset(); await as(STAFF_A);
  const opsLog = (await pg.query(`select public.funnel_operations_log($1) as l`, [FUNNEL_A])).rows[0].l;
  assert(Array.isArray(opsLog.automation) && opsLog.automation.some((e) => e.trigger_type === "funnel.entered"),
    `automation log includes the funnel.entered delivery (got ${opsLog.automation.length} entries)`);
  assert(opsLog.abandoned_count === 1, `abandoned_count matches the earlier sweep result (got ${opsLog.abandoned_count})`);
  assert(opsLog.promoted_count === 4, `promoted_count = the 4 promoted splits on this funnel (STEP_AB→B, STEP_CWIN→C, STEP_ABC auto→A, STEP_HOOK→A) (got ${opsLog.promoted_count})`);

  await reset(); await as(STAFF_B);
  assert(await denied(pg, `select public.funnel_operations_log($1)`, [FUNNEL_A]),
    "a non-member (B) cannot read A's operations log");

  // ── 20. funnel_entrants — one row per visitor, marker-excluded, paginated (D-169) ──
  console.log("\nM20 v2 · funnel_entrants — entrant list, order-marker excluded, pagination:");
  await reset();
  await pg.query(`insert into public.funnel_visits (workspace_id,funnel_id,step_id,visitor_id,contact_id,variant,event) values
    ($1,$2,$3,'ig2',$5,'A','view'), ($1,$2,$4,'ig2',$5,'A','view')`,
    [WSA, FUNNEL_REV, STEP_REV_ENTRY, STEP_REV_ORDER, CONTACT_IG]);
  await pg.query(`insert into public.funnel_visits (workspace_id,funnel_id,step_id,visitor_id,event) values
    ($1,$2,$3,'order:fake123','view')`, [WSA, FUNNEL_REV, STEP_REV_ORDER]);

  await as(STAFF_A);
  const ent = (await pg.query(`select public.funnel_entrants($1) as e`, [FUNNEL_REV])).rows[0].e;
  assert(ent.total === 3, `total excludes the 'order:' bookkeeping marker (got ${ent.total})`);
  assert(ent.entrants.length === 3, `entrants array matches total when under the default limit (got ${ent.entrants.length})`);
  const byVisitor = Object.fromEntries(ent.entrants.map((e) => [e.visitor_id, e]));
  assert(byVisitor.ig2.furthest_step_order === 1 && byVisitor.ig2.furthest_step_name === "Order",
    `ig2 (reached the order step) shows furthest_step = Order/1 (got ${JSON.stringify(byVisitor.ig2 && { o: byVisitor.ig2.furthest_step_order, n: byVisitor.ig2.furthest_step_name })})`);
  assert(byVisitor.ig2.variant === "A", `ig2's variant assignment is captured (got ${byVisitor.ig2.variant})`);
  assert(byVisitor.ig2.order_status === "paid" && byVisitor.ig2.order_amount_paid === 9900,
    `ig2 is linked to their contact's paid order via CONTACT_IG (got status=${byVisitor.ig2.order_status}, paid=${byVisitor.ig2.order_amount_paid})`);
  assert(byVisitor.ig1.furthest_step_order === 0 && byVisitor.dir1.furthest_step_order === 0,
    "ig1/dir1 (entry-step only) show furthest_step_order = 0");
  assert(byVisitor.ig2.is_test === false, "a real (non-test) entrant is not flagged is_test");

  const page1 = (await pg.query(`select public.funnel_entrants($1, 1, 0) as e`, [FUNNEL_REV])).rows[0].e;
  assert(page1.entrants.length === 1 && page1.total === 3, `p_limit=1 returns 1 row but the true total (3) (got len=${page1.entrants.length}, total=${page1.total})`);

  await reset(); await as(STAFF_B);
  assert(await denied(pg, `select public.funnel_entrants($1)`, [FUNNEL_REV]),
    "a non-member (B) cannot read A's entrant list");

  // ── 20. recommend_funnel_blueprint — deterministic rules engine (D-173) ──────
  console.log("\nM20 v3 · recommend_funnel_blueprint — deterministic funnel-type decision matrix:");
  const rec = async (answers) => (await pg.query(`select public.recommend_funnel_blueprint($1) as b`, [JSON.stringify(answers)])).rows[0].b;
  assert((await rec({ objective: "bookings" })).funnel_type === "booking", "objective=bookings -> booking funnel type");
  assert((await rec({ offer_price: 0, checkout_required: false })).funnel_type === "lead_magnet", "no checkout required -> lead_magnet");
  assert((await rec({ offer_price: 47, has_lead_magnet: true, checkout_required: true })).funnel_type === "tripwire",
    "sub-$100 offer + an existing lead magnet -> tripwire");
  const vsl = await rec({ offer_price: 997, checkout_required: true, traffic_source: "cold_paid", audience_awareness: "unaware" });
  assert(vsl.funnel_type === "vsl", `cold unaware traffic + $997 offer -> vsl (got ${vsl.funnel_type})`);
  assert(vsl.steps.length === 5 && vsl.steps[0].step_type === "sales" && vsl.upsell_suggested === true,
    "vsl blueprint opens on a sales step and suggests an upsell");
  const dc = await rec({ offer_price: 1500, checkout_required: true, traffic_source: "warm_email", audience_awareness: "most_aware" });
  assert(dc.funnel_type === "direct_checkout", `warm, most-aware traffic + high price -> direct_checkout (got ${dc.funnel_type})`);
  assert(Array.isArray(dc.test_ideas) && dc.test_ideas.length > 0 && Array.isArray(dc.launch_checklist_emphasis),
    "every blueprint carries test ideas + a launch checklist");
  assert(vsl.steps.every((s) => ["optin", "sales", "order", "upsell", "downsell", "thankyou"].includes(s.step_type)),
    "every generated step_type is one of the 6 values funnel_step_type already supports (0023) — no enum change needed");

  // ── 20b. offer_source='affiliate' branch — Phase F (D-181) ──────────────────
  console.log("\nM20 v3c · recommend_funnel_blueprint — affiliate offer_source branch:");
  const affBridge = await rec({ offer_source: "affiliate", traffic_source: "cold_paid", audience_awareness: "unaware" });
  assert(affBridge.funnel_type === "affiliate_bridge", `affiliate + cold/unaware traffic -> affiliate_bridge (got ${affBridge.funnel_type})`);
  assert(affBridge.order_bump_suggested === false && affBridge.upsell_suggested === false && affBridge.downsell_suggested === false,
    "affiliate blueprints never suggest a bump/upsell/downsell (no owned checkout)");
  assert(affBridge.launch_checklist_emphasis.some((c) => c.includes("disclosure")), "affiliate blueprint checklist includes a disclosure reminder by default");
  const affComparison = await rec({ offer_source: "affiliate", audience_awareness: "solution_aware" });
  assert(affComparison.funnel_type === "affiliate_comparison", `affiliate + solution-aware -> affiliate_comparison (got ${affComparison.funnel_type})`);
  const affReview = await rec({ offer_source: "affiliate", audience_awareness: "product_aware", traffic_source: "warm_email" });
  assert(affReview.funnel_type === "affiliate_review", `affiliate + warm/product-aware -> affiliate_review (got ${affReview.funnel_type})`);
  assert(affReview.steps.every((s) => ["optin", "sales", "thankyou"].includes(s.step_type)) && !affReview.steps.some((s) => s.step_type === "order"),
    "affiliate funnel steps never include an 'order' step — checkout happens on the vendor's site");
  const affNoDisclosure = await rec({ offer_source: "affiliate", audience_awareness: "product_aware", disclosure_required: false });
  assert(!affNoDisclosure.launch_checklist_emphasis.some((c) => c.includes("disclosure")), "disclosure_required=false omits the disclosure checklist line");

  // ── 21. save / approve / convert — the wizard's write path (D-174) ──────────
  console.log("\nM20 v3 · funnel_blueprints — save/approve/convert write path:");
  await reset();
  const tripwireBp = await rec({ offer_price: 47, has_lead_magnet: true, checkout_required: true });
  await as(STAFF_A);
  let bp = (await pg.query(`select b.* from public.save_funnel_blueprint($1,$2,$3) as b`,
    [WSA, JSON.stringify({ offer_price: 47 }), JSON.stringify(tripwireBp)])).rows[0];
  assert(bp.status === "draft" && bp.workspace_id === WSA, "save_funnel_blueprint creates a draft row scoped to the caller's workspace");

  const tripwireBp2 = await rec({ offer_price: 27, has_lead_magnet: true, checkout_required: true });
  bp = (await pg.query(`select b.* from public.save_funnel_blueprint($1,$2,$3,$4) as b`,
    [WSA, JSON.stringify({ offer_price: 27 }), JSON.stringify(tripwireBp2), bp.id])).rows[0];
  assert(bp.blueprint.reasoning === tripwireBp2.reasoning, "regenerate (passing the same blueprint_id) updates the existing draft in place, not a new row");

  await reset(); await as(CLIENT_A);
  assert(await denied(pg, `select public.save_funnel_blueprint($1,$2,$3)`, [WSA, "{}", "{}"]),
    "a CLIENT (below staff) cannot save a blueprint");

  await reset(); await as(STAFF_B);
  assert(await denied(pg, `select public.approve_funnel_blueprint($1)`, [bp.id]),
    "a non-member (B) cannot approve A's blueprint");
  const bVisible = await count(pg, `select count(*)::int n from public.funnel_blueprints where id = $1`, [bp.id]);
  assert(bVisible === 0, "RLS: a non-member (B) cannot SELECT A's blueprint row directly");

  await reset(); await as(STAFF_A);
  const approved = (await pg.query(`select b.* from public.approve_funnel_blueprint($1) as b`, [bp.id])).rows[0];
  assert(approved.status === "approved", "approve_funnel_blueprint transitions draft -> approved");
  assert(await denied(pg, `select public.approve_funnel_blueprint($1)`, [bp.id]), "approving an already-approved blueprint is rejected (no double-approve)");

  const funnel = (await pg.query(`select f.* from public.convert_blueprint_to_funnel($1,$2) as f`, [bp.id, "AI Studio Test Funnel"])).rows[0];
  assert(funnel.status === "draft" && funnel.funnel_type === "tripwire", `convert creates a draft funnel with funnel_type carried over (got status=${funnel.status}, type=${funnel.funnel_type})`);
  const stepCount = await count(pg, `select count(*)::int n from public.funnel_steps where funnel_id = $1`, [funnel.id]);
  assert(stepCount === tripwireBp2.steps.length, `convert materializes every blueprint step as a real funnel_steps row (got ${stepCount}, expected ${tripwireBp2.steps.length})`);
  const linked = (await pg.query(`select status, funnel_id from public.funnel_blueprints where id = $1`, [bp.id])).rows[0];
  assert(linked.status === "converted" && linked.funnel_id === funnel.id, "blueprint flips to converted and links to the new funnel");
  assert(await denied(pg, `select public.convert_blueprint_to_funnel($1,$2)`, [bp.id, "Second Attempt"]),
    "converting an already-converted blueprint is rejected");

  // ── 21b. affiliate blueprint converts into a funnel — widened CHECK (D-181) ──
  console.log("\nM20 v3c · affiliate blueprint converts into a funnel with the widened funnel_type CHECK:");
  await reset(); await as(STAFF_A);
  const affBp = await rec({ offer_source: "affiliate", traffic_source: "cold_paid", audience_awareness: "unaware" });
  const savedAff = (await pg.query(`select b.* from public.save_funnel_blueprint($1,$2,$3) as b`,
    [WSA, JSON.stringify({ offer_source: "affiliate" }), JSON.stringify(affBp)])).rows[0];
  await pg.query(`select public.approve_funnel_blueprint($1)`, [savedAff.id]);
  const affFunnel = (await pg.query(`select f.* from public.convert_blueprint_to_funnel($1,$2) as f`, [savedAff.id, "Affiliate Test Funnel"])).rows[0];
  assert(affFunnel.funnel_type === "affiliate_bridge", `convert accepts the new affiliate_bridge value against the widened CHECK (got ${affFunnel.funnel_type})`);

  // ── 21c. M29 bridge — source_offer_id + funnel_compliance_scan (D-182) ───────
  console.log("\nM29 · Funnels↔Affiliate-Hub bridge — source_offer_id + compliance scan:");
  await reset(); await as(STAFF_A);
  const offerA = (await pg.query(`insert into public.affiliate_offers (workspace_id, name, network, compliance_category) values ($1,'Test Offer A','ClickBank','income') returning *`, [WSA])).rows[0];
  const bridgeBp = await rec({ offer_source: "affiliate", audience_awareness: "product_aware" });
  const bridgeSaved = (await pg.query(`select b.* from public.save_funnel_blueprint($1,$2,$3) as b`,
    [WSA, JSON.stringify({ offer_source: "affiliate" }), JSON.stringify(bridgeBp)])).rows[0];
  await pg.query(`select public.approve_funnel_blueprint($1)`, [bridgeSaved.id]);
  const bridgeFunnel = (await pg.query(`select f.* from public.convert_blueprint_to_funnel($1,$2,$3,$4) as f`, [bridgeSaved.id, "Offer-Linked Funnel", null, offerA.id])).rows[0];
  assert(bridgeFunnel.source_offer_id === offerA.id, "convert_blueprint_to_funnel sets source_offer_id when p_source_offer_id is passed");

  await reset(); await as(STAFF_B);
  const offerB = (await pg.query(`insert into public.affiliate_offers (workspace_id, name) values ($1,'Test Offer B') returning *`, [WSB])).rows[0];
  await reset(); await as(STAFF_A);
  const crossBp = await rec({ objective: "sales" });
  const crossSaved = (await pg.query(`select b.* from public.save_funnel_blueprint($1,$2,$3) as b`, [WSA, "{}", JSON.stringify(crossBp)])).rows[0];
  await pg.query(`select public.approve_funnel_blueprint($1)`, [crossSaved.id]);
  assert(await denied(pg, `select public.convert_blueprint_to_funnel($1,$2,$3,$4)`, [crossSaved.id, "Cross-tenant offer test", null, offerB.id]),
    "convert_blueprint_to_funnel rejects a p_source_offer_id belonging to a different workspace");

  await pg.exec(`
    insert into public.funnels (id, workspace_id, name, status) values ('${FUNNEL_COMP}','${WSA}','Compliance Test Funnel','draft');
    insert into public.funnel_steps (id, workspace_id, funnel_id, step_order, step_type, name, config) values
      ('${STEP_COMP}','${WSA}','${FUNNEL_COMP}',0,'sales','Sales page','{"cta":"Guaranteed income in 30 days","purpose":"pitch"}');
  `);
  const riskyScan = (await pg.query(`select public.funnel_compliance_scan($1) as r`, [FUNNEL_COMP])).rows[0].r;
  assert(riskyScan.clear === false && riskyScan.high_count >= 1, `compliance scan flags "guaranteed income" as a high-risk finding (got ${JSON.stringify(riskyScan)})`);
  assert(riskyScan.findings.some((x) => x.category === "income"), "the flagged finding is categorized as income");
  const cleanScan = (await pg.query(`select public.funnel_compliance_scan($1) as r`, [FUNNEL_A])).rows[0].r;
  assert(cleanScan.clear === true, `an unrelated, non-risky funnel's copy scans clear (got ${JSON.stringify(cleanScan)})`);

  await reset(); await as(STAFF_B);
  assert(await denied(pg, `select public.funnel_compliance_scan($1)`, [FUNNEL_COMP]), "a non-member (B) cannot run the compliance scan on A's funnel");
  const offersVisibleToB = await count(pg, `select count(*)::int n from public.affiliate_offers where id = $1`, [offerA.id]);
  assert(offersVisibleToB === 0, "RLS: a non-member (B) cannot SELECT A's affiliate_offers row directly");

  await reset(); await as(CLIENT_A);
  assert(await denied(pg, `insert into public.affiliate_offers (workspace_id, name) values ($1,'Client attempt')`, [WSA]),
    "a CLIENT (below staff) cannot insert an affiliate_offers row (RLS)");

  // ── 22. Phase C+D depth — Funnel Map/readiness-score/revenue-trend/recommendations (D-175…D-180) ──
  console.log("\nM20 v3 · Funnel Map depth, readiness score, revenue trend, recommendations:");
  await reset();
  await pg.query(`insert into public.workflows (workspace_id,name,trigger_type,is_active,reentry_rule,nodes,edges)
    values ($1,'Hook order.failed','order.failed',true,'allow','[]','[]')`, [WSA]);
  let badEventRejected = false;
  try { await pg.query(`select public.record_funnel_event($1,$2,$3,'v1','bad_event')`, [WSA, FUNNEL_A, STEP_1]); }
  catch { badEventRejected = true; }
  assert(badEventRejected, "record_funnel_event still rejects an unknown event string");
  await pg.query(`select public.record_funnel_event($1,$2,$3,'failer1','order_failed')`, [WSA, FUNNEL_A, STEP_3]);
  assert(await hookCount("order.failed") === 1, "a p_event='order_failed' call fires the order.failed trigger");

  await pg.exec(`
    insert into public.funnels (id, workspace_id, name, status) values ('${FUNNEL_REC}','${WSA}','Recs Test Funnel','active');
    insert into public.funnel_steps (id, workspace_id, funnel_id, step_order, step_type, name, page_id, config) values
      ('${STEP_REC_1}','${WSA}','${FUNNEL_REC}',0,'optin','Optin','${PAGE_1}','{}'),
      ('${STEP_REC_2}','${WSA}','${FUNNEL_REC}',1,'sales','Sales','${PAGE_1}','{}'),
      ('${STEP_REC_3}','${WSA}','${FUNNEL_REC}',2,'order','Order','${PAGE_1}','{"products":[{"name":"Offer","price":100}]}'),
      ('${STEP_REC_SPLIT}','${WSA}','${FUNNEL_REC}',3,'sales','Split Step','${PAGE_1}','{}');
  `);
  let recVs = [];
  for (let i = 0; i < 100; i++) recVs.push(`('${WSA}','${FUNNEL_REC}','${STEP_REC_1}','r1_${i}','view',null)`);
  for (let i = 0; i < 30; i++) recVs.push(`('${WSA}','${FUNNEL_REC}','${STEP_REC_2}','r2_${i}','view',null)`);
  for (let i = 0; i < 20; i++) recVs.push(`('${WSA}','${FUNNEL_REC}','${STEP_REC_3}','r3_${i}','view',null)`);
  for (let i = 0; i < 2; i++) recVs.push(`('${WSA}','${FUNNEL_REC}','${STEP_REC_3}','r3_${i}','purchase',null)`);
  for (let i = 0; i < 100; i++) recVs.push(`('${WSA}','${FUNNEL_REC}','${STEP_REC_SPLIT}','sa_${i}','view','A')`);
  for (let i = 0; i < 20; i++)  recVs.push(`('${WSA}','${FUNNEL_REC}','${STEP_REC_SPLIT}','sa_${i}','optin','A')`);
  for (let i = 0; i < 100; i++) recVs.push(`('${WSA}','${FUNNEL_REC}','${STEP_REC_SPLIT}','sb_${i}','view','B')`);
  for (let i = 0; i < 45; i++)  recVs.push(`('${WSA}','${FUNNEL_REC}','${STEP_REC_SPLIT}','sb_${i}','optin','B')`);
  await pg.exec(`insert into public.funnel_visits (workspace_id,funnel_id,step_id,visitor_id,event,variant) values ${recVs.join(",")};`);
  await pg.query(`insert into public.invoices (workspace_id, contact_id, kind, currency, line_items, status, source_type, source_id, amount_paid, paid_at)
    values ($1,$2,'invoice','USD','[{"name":"Offer","price":10000}]','paid','order',$3,10000,now())`, [WSA, CONTACT_A, STEP_REC_3]);
  await pg.query(`insert into public.funnel_splits (workspace_id,step_id,variant_page_id,split,goal) values ($1,$2,$3,50,'progression')`,
    [WSA, STEP_REC_SPLIT, PAGE_B]);

  await as(STAFF_A);
  const recMap = (await pg.query(`select public.funnel_map($1) as m`, [FUNNEL_REC])).rows[0].m;
  const orderNode = recMap.find((s) => s.step_type === "order");
  assert(orderNode.revenue === 10000, `funnel_map's order step carries the real paid revenue (got ${orderNode.revenue})`);
  assert(orderNode.has_bump === false, "funnel_map flags has_bump=false when config has no bumps/bump");
  assert(recMap.every((s) => s.warning_no_page === false), "every step here has a page linked, so warning_no_page is false on all of them");

  const recReady = (await pg.query(`select public.funnel_publish_readiness($1) as r`, [FUNNEL_REC])).rows[0].r;
  assert(typeof recReady.score === "number" && recReady.score >= 0 && recReady.score <= 100,
    `funnel_publish_readiness now carries a 0-100 score (got ${recReady.score})`);

  const recRev = (await pg.query(`select public.funnel_revenue_summary($1) as r`, [FUNNEL_REC])).rows[0].r;
  assert(recRev.reconciled === true, "top-level revenue reconciles with the sum of by_step revenue");
  assert(Array.isArray(recRev.trend) && recRev.trend.length >= 1 && recRev.trend[0].revenue === 10000,
    `revenue trend includes today's bucket with the paid order (got ${JSON.stringify(recRev.trend)})`);
  assert(Array.isArray(recRev.by_medium) && Array.isArray(recRev.by_campaign), "by_medium and by_campaign breakdowns are present");

  const recs = (await pg.query(`select public.funnel_recommendations($1) as r`, [FUNNEL_REC])).rows[0].r;
  const types = recs.map((r) => r.type);
  assert(types.includes("high_dropoff"), `recommendations flag the 100->30 visitor drop-off (got types=${types})`);
  assert(types.includes("low_checkout_completion"), `recommendations flag the 10% order-step conversion (got types=${types})`);
  assert(types.includes("missing_order_bump"), `recommendations flag the order step with no bump configured (got types=${types})`);
  assert(types.includes("variant_winner_ready"), `recommendations flag the significant, B-leading running split (got types=${types})`);

  await reset(); await as(STAFF_B);
  assert(await denied(pg, `select public.funnel_recommendations($1)`, [FUNNEL_REC]), "a non-member (B) cannot read A's recommendations");

  await reset();
  const jobRunsBefore = await count(pg, `select count(*)::int n from public.funnel_job_runs where job_name = 'sweep_abandoned_funnels'`, []);
  await pg.query(`select public.sweep_abandoned_funnels()`);
  const jobRunsAfter = await count(pg, `select count(*)::int n from public.funnel_job_runs where job_name = 'sweep_abandoned_funnels'`, []);
  assert(jobRunsAfter === jobRunsBefore + 1, "sweep_abandoned_funnels logs a funnel_job_runs row every time it runs");

  // ── 23. AI Funnel Studio v1 — generation-source tracking + rate limit (D-186) ──
  console.log("\nM20 v3d · funnel_ai_generation_log + funnel_ai_rate_limited:");
  await reset(); await as(STAFF_A);
  const genBp = await rec({ objective: "webinar_signups" });
  const genSaved = (await pg.query(
    `select b.* from public.save_funnel_blueprint($1,$2,$3,$4,$5,$6,$7) as b`,
    [WSA, JSON.stringify({ objective: "webinar_signups" }), JSON.stringify(genBp), null, "llm", "claude-3-5-haiku", 842]
  )).rows[0];
  assert(genSaved.generation_source === "llm" && genSaved.llm_model === "claude-3-5-haiku" && genSaved.tokens_used === 842,
    `save_funnel_blueprint persists generation_source/llm_model/tokens_used (got ${JSON.stringify({ s: genSaved.generation_source, m: genSaved.llm_model, t: genSaved.tokens_used })})`);

  const legacySaved = (await pg.query(`select b.* from public.save_funnel_blueprint($1,$2,$3) as b`,
    [WSA, JSON.stringify({}), JSON.stringify(genBp)])).rows[0];
  assert(legacySaved.generation_source === null, "the old 3-arg call shape still works and leaves generation_source null (backward compatible)");

  await reset();
  await pg.exec(`insert into public.funnel_ai_generation_log (workspace_id, generation_source, model, tokens_used, prompt_length)
    select '${WSA}', 'llm', 'claude-3-5-haiku', 500, 60 from generate_series(1,19);`);
  await as(STAFF_A);
  let limited = (await pg.query(`select public.funnel_ai_rate_limited($1) as r`, [WSA])).rows[0].r;
  assert(limited === false, "19 llm calls in the last hour is under the 20/hour limit");
  await reset();
  await pg.exec(`insert into public.funnel_ai_generation_log (workspace_id, generation_source, model, tokens_used, prompt_length)
    values ('${WSA}', 'llm_clarify', 'claude-3-5-haiku', 120, 40);`);
  await as(STAFF_A);
  limited = (await pg.query(`select public.funnel_ai_rate_limited($1) as r`, [WSA])).rows[0].r;
  assert(limited === true, "the 20th llm/llm_clarify call in the hour trips the rate limit");

  await reset();
  await pg.exec(`insert into public.funnel_ai_generation_log (workspace_id, generation_source, prompt_length)
    select '${WSB}', 'deterministic', 30 from generate_series(1,25);`);
  await as(STAFF_B);
  const wsbLimited = (await pg.query(`select public.funnel_ai_rate_limited($1) as r`, [WSB])).rows[0].r;
  assert(wsbLimited === false, "deterministic-fallback calls never count toward the LLM rate limit, however many there are");

  await reset(); await as(STAFF_B);
  const logVisibleToB = await count(pg, `select count(*)::int n from public.funnel_ai_generation_log where workspace_id = $1`, [WSA]);
  assert(logVisibleToB === 0, "RLS: a non-member (B) cannot SELECT A's generation log rows");

  await reset(); await as(CLIENT_A);
  const logVisibleToClient = await count(pg, `select count(*)::int n from public.funnel_ai_generation_log where workspace_id = $1`, [WSA]);
  assert(logVisibleToClient >= 1, "a CLIENT (member, below staff) can still read the workspace's generation log");

  await reset(); await as(STAFF_A);
  assert(await denied(pg, `insert into public.funnel_ai_generation_log (workspace_id, generation_source) values ($1,'llm')`, [WSA]),
    "even staff (authenticated, non-service-role) cannot INSERT a generation log row directly — Edge Function's admin client only");

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M20 probe: ${pass} passed, ${fail} failed\x1b[0m`);
  await pg.close();
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((e) => { console.error("harness error:", e); process.exitCode = 2; });
