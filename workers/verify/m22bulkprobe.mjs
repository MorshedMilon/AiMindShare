// m22bulkprobe.mjs — M22-auto real-LLM columns + Bulk Content Creation schema/RLS
// (D-190/D-191/D-192). PGlite, no network. Loads the same curated migration chain
// m22autoprobe.mjs uses (dependency order, not the full 0000-0039 range — several
// migrations in between reference Supabase-managed schemas like storage/vault/cron
// that don't exist in PGlite), PLUS 0028_m19_sites_v2.sql (needed for
// sites.style_preset, used by the IslamicInfo review-lock trigger test below) and
// 0039 itself once it exists.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

const load = (n) => readFileSync(join(MIG, n), "utf8")
  .split("\n")
  .filter((l) => !/^\s*create\s+extension/i.test(l))
  .filter((l) => !/gin_trgm_ops/i.test(l))
  .filter((l) => !/vector\(1536\)/i.test(l))
  .join("\n");

const count = async (pg, sql, params) => Number((await pg.query(sql, params)).rows[0].n);
async function denied(pg, sql, params) { try { await pg.query(sql, params); return false; } catch { return true; } }

async function main() {
  console.log("══ M22-auto bulk pipeline: schema + RLS + RPCs (PGlite) ══");
  const pg = new PGlite();

  await pg.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role authenticated nologin; create role service_role nologin;
    grant usage on schema public to authenticated;
  `);

  for (const m of [
    "0000_extensions_enums.sql", "0001_tenancy.sql", "0002_jobs.sql",
    "0010_m05_compliance.sql", "0013_m09_crm.sql", "0014_m11_pipeline.sql",
    "0015_m12_inbox.sql", "0016_m13_automations.sql", "0022_m19_sites.sql",
    "0025_m22_content.sql", "0026_m21_seo.sql", "0027_m22_auto.sql",
    "0028_m19_sites_v2.sql", "0039_m22_bulk.sql",
  ]) {
    await pg.exec(load(m));
  }
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);

  // ═══ 1 — new columns exist ═══
  assert(
    (await pg.query(`select column_name from information_schema.columns
       where table_name='blog_articles' and column_name in ('generation_source','llm_model','tokens_used')`))
      .rows.length === 3,
    "blog_articles has generation_source/llm_model/tokens_used"
  );
  assert(
    (await pg.query(`select column_name from information_schema.columns
       where table_name='content_schedules' and column_name='model'`)).rows.length === 1,
    "content_schedules has a model column"
  );

  // ═══ 2 — generation_source check constraint rejects garbage ═══
  await pg.exec(`insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-000000000001','owner@aimindshare.test')
    on conflict do nothing`);
  await pg.exec(`insert into public.workspaces (id, owner_id, name, slug, plan) values
    ('a0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','T','t','free')
    on conflict do nothing`);
  await pg.exec(`insert into public.sites (id, workspace_id, name) values
    ('a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','S')
    on conflict do nothing`);
  assert(
    await denied(pg, `insert into public.blog_articles (workspace_id, site_id, title, slug, generation_source)
      values ('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','t','t','not-a-real-value')`),
    "generation_source check constraint rejects an invalid value"
  );
  assert(
    !(await denied(pg, `insert into public.blog_articles (workspace_id, site_id, title, slug, generation_source)
      values ('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','t2','t2','llm')`)),
    "generation_source check constraint accepts 'llm'"
  );

  // ═══ 3 — create_generated_article persists generation_source/llm_model/tokens_used ═══
  await pg.exec(`insert into public.memberships (workspace_id, user_id, role, status) values
    ('a0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','owner','active')
    on conflict do nothing`);
  const genRow = await pg.query(
    `select public.create_generated_article($1,$2,null,$3) as id`,
    ['a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
     JSON.stringify({ keyword: "k", title: "T", slug: "gen-article-test",
       generation_source: "llm", llm_model: "claude-sonnet-5", tokens_used: 842 })]
  );
  const genId = genRow.rows[0].id;
  assert(!!genId, "create_generated_article returns a new article id");
  const genArt = (await pg.query(
    `select generation_source, llm_model, tokens_used from public.blog_articles where id=$1`, [genId]
  )).rows[0];
  assert(genArt.generation_source === "llm", "create_generated_article persists generation_source");
  assert(genArt.llm_model === "claude-sonnet-5", "create_generated_article persists llm_model");
  assert(Number(genArt.tokens_used) === 842, "create_generated_article persists tokens_used");

  // ═══ 4 — site_brand_voice table + RLS + the IslamicInfo review-lock trigger ═══
  await pg.exec(`update public.sites set style_preset='islamic' where id='a0000000-0000-0000-0000-000000000002'`);
  await pg.exec(`insert into public.site_brand_voice (site_id, workspace_id, tone_prompt, review_required)
    values ('a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','warm and respectful', true)`);
  assert(
    (await pg.query(`select review_required from public.site_brand_voice where site_id='a0000000-0000-0000-0000-000000000002'`))
      .rows[0].review_required === true,
    "site_brand_voice row inserted with review_required=true"
  );
  assert(
    await denied(pg, `update public.site_brand_voice set review_required=false
      where site_id='a0000000-0000-0000-0000-000000000002'`),
    "enforce_review_lock trigger REJECTS disabling review_required on an 'islamic'-preset site"
  );
  await pg.exec(`insert into public.sites (id, workspace_id, name, style_preset) values
    ('a0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','Not Islamic','bold')
    on conflict do nothing`);
  await pg.exec(`insert into public.site_brand_voice (site_id, workspace_id, tone_prompt, review_required)
    values ('a0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','upbeat', true)`);
  assert(
    !(await denied(pg, `update public.site_brand_voice set review_required=false
      where site_id='a0000000-0000-0000-0000-000000000003'`)),
    "enforce_review_lock trigger ALLOWS disabling review_required on a non-'islamic'-preset site"
  );

  // ═══ 4b — regression: re-pointing site_id to escape the islamic-preset lock ═══
  // Uses a FRESH non-islamic site (004), not the '003' site already inserted above —
  // '003' already has its own site_brand_voice row, so re-pointing '002' onto it
  // would be blocked by the site_id primary key regardless of the immutability
  // check, which would make this test pass for the wrong reason.
  await pg.exec(`insert into public.sites (id, workspace_id, name, style_preset) values
    ('a0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','Also Not Islamic','minimal')
    on conflict do nothing`);
  assert(
    await denied(pg, `update public.site_brand_voice set site_id='a0000000-0000-0000-0000-000000000004', review_required=false
      where site_id='a0000000-0000-0000-0000-000000000002'`),
    "enforce_review_lock trigger REJECTS re-pointing site_id to escape the islamic-preset lock"
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main();
