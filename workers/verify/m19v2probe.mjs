// m19v2probe.mjs — verify the M19 Sites v2 hardening layer (0028) on REAL
// Postgres (PGlite) + the upgraded PURE modules (Node import). Proves:
//   Schema     — additive columns landed (sites staging/maintenance/404/preset/
//                language, pages.language, page_versions.kind/label, template
//                metadata) + the 6 global gallery seeds.
//   Gate-1     — site_publish_log: B cannot read A's rows.
//   Gate-4     — site_publish_log is system-written (no client INSERT).
//   Versioning — publish_page stamps kind='publish' + logs 'page.publish';
//                save_page_version (staff+, client denied) stamps kind='save' +
//                label + logs; per-kind prune (10 publishes / 10 saves) so save
//                points never evict publish history (D-147).
//   Revert     — revert_page still restores → draft AND logs 'page.revert'.
//   Templates  — workspace manager can save a full-content template; staff
//                cannot (0022 policy unchanged); B cannot read A's template.
//   Staging    — the renderer's two query shapes: published-only hides drafts;
//                the staging shape (no status filter, D-149) sees them.
//   Renderer   — STYLE_PRESETS (4 incl. islamic), <html lang>, maintenance
//                shell (noindex), custom 404 body, Product/Event JSON-LD, the
//                M15 form-embed hydration, and the 3 new builder niches.
//
//   node workers/verify/m19v2probe.mjs
//
// Exit 0 = all passed; 1 = a failure/leak. Same harness pattern as m19probe.
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

const WSA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WSB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const SITE_A = "51000000-0000-0000-0000-000000000001";
const SITE_B = "51000000-0000-0000-0000-000000000002";
const PAGE_A = "52000000-0000-0000-0000-000000000001";
const PAGE_DRAFT = "52000000-0000-0000-0000-000000000002";

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
                   "0015_m12_inbox.sql", "0016_m13_automations.sql", "0022_m19_sites.sql",
                   "0028_m19_sites_v2.sql"]) {
    await pg.exec(load(m));
  }
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);

  await pg.exec(`
    insert into auth.users (id,email) values
      ('${OWNER_A}','oa@t'),('${MANAGER_A}','ma@t'),('${STAFF_A}','sa@t'),('${CLIENT_A}','ca@t'),('${OWNER_B}','ob@t');
    insert into public.profiles (id,email,name) values
      ('${OWNER_A}','oa@t','OA'),('${MANAGER_A}','ma@t','MA'),('${STAFF_A}','sa@t','SA'),('${CLIENT_A}','ca@t','CA'),('${OWNER_B}','ob@t','OB');
    insert into public.workspaces (id,owner_id,name,slug) values
      ('${WSA}','${OWNER_A}','Acme','acme'),('${WSB}','${OWNER_B}','Beacon','beacon');
    insert into public.memberships (workspace_id,user_id,role,status) values
      ('${WSA}','${OWNER_A}','owner','active'),('${WSA}','${MANAGER_A}','manager','active'),
      ('${WSA}','${STAFF_A}','staff','active'),('${WSA}','${CLIENT_A}','client','active'),
      ('${WSB}','${OWNER_B}','owner','active');
    insert into public.sites (id,workspace_id,name,subdomain,status) values
      ('${SITE_A}','${WSA}','Acme Site','acme','draft'),
      ('${SITE_B}','${WSB}','Beacon Site','beacon','draft');
    insert into public.pages (id,workspace_id,site_id,title,slug,is_home,status,render_html) values
      ('${PAGE_A}','${WSA}','${SITE_A}','Home','home',true,'draft','<h1>Home</h1>'),
      ('${PAGE_DRAFT}','${WSA}','${SITE_A}','About','about',false,'draft','<h1>About</h1>');
  `);

  const as = (sub) => pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);

  // ── 1. Additive schema landed ─────────────────────────────────────────────────
  console.log("\nM19v2 · schema — additive columns + log table + seeds:");
  const col = async (t, c) => (await pg.query(
    `select 1 from information_schema.columns where table_name=$1 and column_name=$2`, [t, c])).rows.length === 1;
  for (const [t, c] of [["sites", "style_preset"], ["sites", "maintenance_mode"], ["sites", "not_found_html"],
                        ["sites", "preview_token"], ["sites", "language"], ["pages", "language"],
                        ["page_versions", "kind"], ["page_versions", "label"],
                        ["site_templates", "description"], ["site_templates", "conversion_type"],
                        ["site_templates", "render_html"]]) {
    assert(await col(t, c), `${t}.${c} exists`);
  }
  const logRls = await pg.query(`select relrowsecurity from pg_class where relname='site_publish_log'`);
  assert(logRls.rows[0]?.relrowsecurity === true, "site_publish_log exists + RLS enabled");
  assert(await count(pg, `select count(*)::int n from public.site_templates where workspace_id is null`) === 6,
    "6 global gallery seeds present");
  const tok = await pg.query(`select preview_token from public.sites where id='${SITE_A}'`);
  assert((tok.rows[0]?.preview_token || "").length >= 16, "sites.preview_token auto-generated on existing rows");

  // ── 2. Versioning: publish stamps kind + logs; save points; per-kind prune ────
  console.log("\nM19v2 · versioning — publish/save kinds, labels, per-kind prune, logs:");
  await as(MANAGER_A);
  await pg.query(`select public.publish_page('${PAGE_A}')`);
  await reset();
  assert(await count(pg, `select count(*)::int n from public.page_versions where page_id='${PAGE_A}' and kind='publish'`) === 1,
    "publish_page writes a kind='publish' snapshot");
  assert(await count(pg, `select count(*)::int n from public.site_publish_log where page_id='${PAGE_A}' and kind='page.publish' and status='ok'`) === 1,
    "publish_page appends a 'page.publish' log row");

  await as(STAFF_A);
  const sv = await pg.query(`select public.save_page_version('${PAGE_A}', 'Before rework') as v`);
  await reset();
  assert(Number(sv.rows[0].v) === 2, "save_page_version returns the next version_no (staff+)");
  const svRow = await pg.query(`select kind, label from public.page_versions where page_id='${PAGE_A}' and version_no=2`);
  assert(svRow.rows[0]?.kind === "save" && svRow.rows[0]?.label === "Before rework",
    "save point stored with kind='save' + label");
  assert(await count(pg, `select count(*)::int n from public.site_publish_log where page_id='${PAGE_A}' and kind='page.save'`) === 1,
    "save_page_version appends a 'page.save' log row");

  await as(CLIENT_A);
  assert(await denied(pg, `select public.save_page_version('${PAGE_A}', 'nope')`),
    "client role cannot create a save point");
  await reset();

  // per-kind prune: 12 saves keep the last 10; the publish snapshot is untouched.
  await as(STAFF_A);
  for (let i = 0; i < 11; i++) await pg.query(`select public.save_page_version('${PAGE_A}', null)`);
  await reset();
  assert(await count(pg, `select count(*)::int n from public.page_versions where page_id='${PAGE_A}' and kind='save'`) === 10,
    "save points prune to the last 10 (kind='save')");
  assert(await count(pg, `select count(*)::int n from public.page_versions where page_id='${PAGE_A}' and kind='publish'`) === 1,
    "publish history untouched by save-point pruning");

  await as(MANAGER_A);
  for (let i = 0; i < 11; i++) await pg.query(`select public.publish_page('${PAGE_A}')`);
  await reset();
  assert(await count(pg, `select count(*)::int n from public.page_versions where page_id='${PAGE_A}' and kind='publish'`) === 10,
    "publishes prune to the last 10 (kind='publish')");
  assert(await count(pg, `select count(*)::int n from public.page_versions where page_id='${PAGE_A}' and kind='save'`) === 10,
    "save points untouched by publish pruning");

  // revert still restores → draft, and now logs.
  await as(MANAGER_A);
  const anyVer = await pg.query(`select version_no from public.page_versions where page_id='${PAGE_A}' and kind='publish' order by version_no limit 1`);
  await pg.query(`select public.revert_page('${PAGE_A}', ${anyVer.rows[0].version_no})`);
  await reset();
  const pgRow = await pg.query(`select status from public.pages where id='${PAGE_A}'`);
  assert(pgRow.rows[0]?.status === "draft", "revert_page restores the page as a draft");
  assert(await count(pg, `select count(*)::int n from public.site_publish_log where page_id='${PAGE_A}' and kind='page.revert'`) === 1,
    "revert_page appends a 'page.revert' log row");

  // ── 3. site_publish_log tenancy + system-write ────────────────────────────────
  console.log("\nM19v2 · site_publish_log — Gate-1 tenancy + Gate-4 system-write:");
  await as(STAFF_A);
  assert(await count(pg, `select count(*)::int n from public.site_publish_log where site_id='${SITE_A}'`) > 0,
    "workspace staff can read their publish log");
  await reset(); await as(OWNER_B);
  assert(await count(pg, `select count(*)::int n from public.site_publish_log where site_id='${SITE_A}'`) === 0,
    "tenant B cannot read A's publish log (leak)");
  assert(await denied(pg, `insert into public.site_publish_log (workspace_id,site_id,kind) values ('${WSB}','${SITE_B}','page.publish')`),
    "no client INSERT into site_publish_log (system-written)");
  await reset();

  // ── 4. Templates — workspace save-as-template + tenancy ──────────────────────
  console.log("\nM19v2 · templates — save-as-template (manager+), metadata, tenancy:");
  await as(MANAGER_A);
  await pg.query(`insert into public.site_templates (workspace_id,name,description,page_json,render_html,render_css)
    values ('${WSA}','June promo','Saved from Home','{"pages":[]}','<h1>Promo</h1>','.x{}')`);
  await reset();
  assert(await count(pg, `select count(*)::int n from public.site_templates where workspace_id='${WSA}' and render_html is not null`) === 1,
    "manager can save a full-content workspace template");
  await as(STAFF_A);
  assert(await denied(pg, `insert into public.site_templates (workspace_id,name) values ('${WSA}','Nope')`),
    "staff cannot write templates (manager+ policy unchanged)");
  assert(await count(pg, `select count(*)::int n from public.site_templates where workspace_id is null`) === 6,
    "staff can browse the 6 global gallery seeds");
  await reset(); await as(OWNER_B);
  assert(await count(pg, `select count(*)::int n from public.site_templates where workspace_id='${WSA}'`) === 0,
    "tenant B cannot read A's workspace templates (leak)");
  await reset();

  // ── 5. Staging query shapes (D-149) ──────────────────────────────────────────
  console.log("\nM19v2 · staging — published-only hides drafts; the staging shape sees them:");
  assert(await count(pg, `select count(*)::int n from public.pages where site_id='${SITE_A}' and slug='about' and status='published'`) === 0,
    "public shape: a draft slug is invisible");
  assert(await count(pg, `select count(*)::int n from public.pages where site_id='${SITE_A}' and slug='about'`) === 1,
    "staging shape (no status filter): the draft resolves");

  // ── 6. Pure renderer + builder modules (Node import, same files Deno uses) ───
  console.log("\nM19v2 · pure modules — presets, i18n, maintenance, 404, schema, embeds, niches:");
  const R = await import("../../frontend/js/site-render.mjs");
  const B = await import("../../frontend/js/page-builder.mjs");
  assert(["minimal", "bold", "elegant", "islamic"].every((k) => R.STYLE_PRESETS[k]),
    "STYLE_PRESETS ships minimal/bold/elegant/islamic");
  const site = { id: "s", name: "Acme", brand: {}, seo_defaults: {}, style_preset: "islamic", language: "en" };
  const page = { slug: "home", title: "Home", is_home: true, status: "published", render_html: "<h1>Hi</h1>", meta: {}, language: "ar" };
  const doc = R.renderPage({ site, page, cookie: {} });
  assert(doc.includes('<html lang="ar">'), "renderPage uses the page language for <html lang>");
  assert(doc.includes("0f5f4c"), "islamic preset tokens injected on the published page");
  const prodDoc = R.renderPage({ site, page: { ...page, meta: { schema_type: "Product", schema_json: { name: "Widget", price: 49 } } }, cookie: {} });
  assert(prodDoc.includes('"@type":"Product"') && prodDoc.includes('"price":"49"'), "Product JSON-LD with offer");
  const evDoc = R.renderPage({ site, page: { ...page, meta: { schema_type: "Event", schema_json: { start_date: "2026-08-01" } } }, cookie: {} });
  assert(evDoc.includes('"@type":"Event"') && evDoc.includes("2026-08-01"), "Event JSON-LD with startDate");
  assert(doc.includes("f.html?embed=1&token="), "form embeds hydrate to the live M15 iframe");
  const maint = R.renderMaintenance(site);
  assert(maint.includes('content="noindex"') && maint.includes("maintenance"), "maintenance shell is noindex");
  const nf = R.renderNotFound({ ...site, not_found_html: "<h1>Lost?</h1>" });
  assert(nf.includes("<h1>Lost?</h1>"), "custom 404 body served inside the safe shell");
  assert(R.renderNotFound().includes("404"), "default 404 unchanged when no custom body");
  for (const n of ["dentist", "realestate", "restaurant"]) {
    const secs = B.generateFromNiche("", n);
    const v = B.validateSections(secs);
    assert(v.ok && B.sectionsToHtml(secs).html.length > 200, `builder niche "${n}" generates a valid page`);
  }

  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}m19v2probe: ${pass} passed, ${fail} failed\x1b[0m`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("PROBE CRASH:", e); process.exit(1); });
