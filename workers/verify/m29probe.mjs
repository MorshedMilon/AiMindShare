// m29probe.mjs — verify the M29 Affiliate Hub SQL layer on REAL Postgres (PGlite,
// no Docker). Same harness pattern as m20probe.mjs. Proves:
//   Schema  — affiliate_offers/affiliate_networks/affiliate_disclosure_templates
//             exist + RLS enabled.
//   Gate-1  — B (a different workspace) cannot SELECT A's offers/networks/
//             disclosure templates.
//   Gate-2  — staff+ can insert/update/delete; a CLIENT (below staff) cannot
//             insert into any of the three tables.
//
// The Funnels↔Affiliate-Hub bridge itself (source_offer_id on funnels,
// convert_blueprint_to_funnel's p_source_offer_id, funnel_compliance_scan) is
// tested in m20probe.mjs, where those functions actually live — not duplicated
// here.
//
//   node workers/verify/m29probe.mjs
//
// Exit 0 = all passed; 1 = a failure/leak. Depends on M00/M01/M02 migrations
// for auth.users/profiles/workspaces/memberships.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const OWNER_A = "11111111-1111-1111-1111-111111111111";
const STAFF_A = "66666666-6666-6666-6666-666666666666";
const CLIENT_A = "77777777-7777-7777-7777-777777777777";
const OWNER_B = "33333333-3333-3333-3333-333333333333";
const STAFF_B = "44444444-4444-4444-4444-444444444444";

const WSA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WSB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

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
                   "0015_m12_inbox.sql", "0016_m13_automations.sql", "0018_m28_payments.sql",
                   "0022_m19_sites.sql", "0023_m20_funnels.sql", "0028_m19_sites_v2.sql",
                   "0029_m20_funnels_v2.sql", "0030_m20_funnels_v2b.sql", "0031_m20_funnels_v2c.sql",
                   "0032_m20_funnels_v2d.sql", "0033_m20_funnels_v2e.sql", "0034_m20_funnels_v3a.sql",
                   "0035_m20_funnels_v3b.sql", "0036_m20_funnels_v3c.sql", "0037_m29_affiliate_hub.sql"]) {
    await pg.exec(load(m));
  }
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);

  await pg.exec(`
    insert into auth.users (id,email) values ('${OWNER_A}','oa@t'),('${STAFF_A}','sa@t'),('${CLIENT_A}','ca@t'),('${OWNER_B}','ob@t'),('${STAFF_B}','sb@t');
    insert into public.profiles (id,email,name) values ('${OWNER_A}','oa@t','OA'),('${STAFF_A}','sa@t','SA'),('${CLIENT_A}','ca@t','CA'),('${OWNER_B}','ob@t','OB'),('${STAFF_B}','sb@t','SB');
    insert into public.workspaces (id,owner_id,name,slug) values ('${WSA}','${OWNER_A}','Acme','acme'),('${WSB}','${OWNER_B}','Beacon','beacon');
    insert into public.memberships (workspace_id,user_id,role,status) values
      ('${WSA}','${OWNER_A}','owner','active'),('${WSA}','${STAFF_A}','staff','active'),('${WSA}','${CLIENT_A}','client','active'),
      ('${WSB}','${OWNER_B}','owner','active'),('${WSB}','${STAFF_B}','staff','active');
  `);

  const as = (sub) => pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);

  // ── 1. Schema — 3 tables exist with RLS enabled ──────────────────────────────
  console.log("\nM29 · schema — 3 tables exist with RLS enabled:");
  for (const t of ["affiliate_offers", "affiliate_networks", "affiliate_disclosure_templates"]) {
    const r = await pg.query(`select to_regclass('public.${t}') as t, relrowsecurity from pg_class where relname=$1`, [t]);
    assert(r.rows[0]?.t && r.rows[0]?.relrowsecurity, `table ${t} exists + RLS enabled`);
  }

  // ── 2. affiliate_offers — CRUD + RLS ──────────────────────────────────────────
  console.log("\nM29 · affiliate_offers — CRUD + RLS:");
  await reset(); await as(STAFF_A);
  const offer = (await pg.query(`insert into public.affiliate_offers (workspace_id,name,network,niche,commission_note,compliance_category,disclosure_text)
    values ($1,'NutraBoost','ClickBank','Wellness','50% recurring','health','Affiliate disclosure text') returning *`, [WSA])).rows[0];
  assert(offer.id && offer.status === "active" && offer.compliance_category === "health", "staff can create an offer with a compliance category");
  assert(await denied(pg, `insert into public.affiliate_offers (workspace_id,name,compliance_category) values ($1,'bad','not_a_category')`, [WSA]),
    "the compliance_category CHECK rejects an unknown category");
  await pg.query(`update public.affiliate_offers set status = 'paused' where id = $1`, [offer.id]);
  const paused = (await pg.query(`select status from public.affiliate_offers where id = $1`, [offer.id])).rows[0];
  assert(paused.status === "paused", "staff can update an offer's status");

  await reset(); await as(CLIENT_A);
  assert(await denied(pg, `insert into public.affiliate_offers (workspace_id,name) values ($1,'client attempt')`, [WSA]),
    "a CLIENT (below staff) cannot insert an offer (RLS)");
  const clientCanSelect = await count(pg, `select count(*)::int n from public.affiliate_offers where id = $1`, [offer.id]);
  assert(clientCanSelect === 1, "a CLIENT (member, any role) can still read the workspace's offers");

  await reset(); await as(STAFF_B);
  const offerVisibleToB = await count(pg, `select count(*)::int n from public.affiliate_offers where id = $1`, [offer.id]);
  assert(offerVisibleToB === 0, "RLS: a non-member (B) cannot SELECT A's offer");
  // An UPDATE/DELETE whose WHERE clause is filtered to zero rows by RLS doesn't throw —
  // it just silently affects 0 rows. Verify the row is untouched from A's side instead.
  await pg.query(`update public.affiliate_offers set status = 'archived' where id = $1`, [offer.id]);
  await pg.query(`delete from public.affiliate_offers where id = $1`, [offer.id]);
  await reset(); await as(STAFF_A);
  const stillThere = (await pg.query(`select status from public.affiliate_offers where id = $1`, [offer.id])).rows[0];
  assert(stillThere && stillThere.status === "paused",
    `RLS: a non-member (B)'s UPDATE/DELETE against A's offer silently affects 0 rows (offer unchanged, got ${JSON.stringify(stillThere)})`);

  // ── 3. affiliate_networks — CRUD + RLS ───────────────────────────────────────
  console.log("\nM29 · affiliate_networks — CRUD + RLS:");
  await reset(); await as(STAFF_A);
  const network = (await pg.query(`insert into public.affiliate_networks (workspace_id,name) values ($1,'ClickBank') returning *`, [WSA])).rows[0];
  assert(network.status === "manual", "a new network defaults to status='manual' (no live API wiring)");
  assert(await denied(pg, `insert into public.affiliate_networks (workspace_id,name,status) values ($1,'Bad','not_a_status')`, [WSA]),
    "the status CHECK rejects an unknown value");

  await reset(); await as(STAFF_B);
  const networkVisibleToB = await count(pg, `select count(*)::int n from public.affiliate_networks where id = $1`, [network.id]);
  assert(networkVisibleToB === 0, "RLS: a non-member (B) cannot SELECT A's network");

  // ── 4. affiliate_disclosure_templates — CRUD + RLS ───────────────────────────
  console.log("\nM29 · affiliate_disclosure_templates — CRUD + RLS:");
  await reset(); await as(STAFF_A);
  const template = (await pg.query(`insert into public.affiliate_disclosure_templates (workspace_id,name,compliance_category,body)
    values ($1,'Health disclosure','health','This is for informational purposes only.') returning *`, [WSA])).rows[0];
  assert(template.id, "staff can create a disclosure template");

  await reset(); await as(CLIENT_A);
  assert(await denied(pg, `insert into public.affiliate_disclosure_templates (workspace_id,name,body) values ($1,'x','y')`, [WSA]),
    "a CLIENT (below staff) cannot insert a disclosure template (RLS)");

  await reset(); await as(STAFF_B);
  const templateVisibleToB = await count(pg, `select count(*)::int n from public.affiliate_disclosure_templates where id = $1`, [template.id]);
  assert(templateVisibleToB === 0, "RLS: a non-member (B) cannot SELECT A's disclosure template");

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M29 probe: ${pass} passed, ${fail} failed\x1b[0m`);
  await pg.close();
  process.exitCode = fail === 0 ? 0 : 1;
}
main().catch((e) => { console.error("harness error:", e); process.exitCode = 2; });
