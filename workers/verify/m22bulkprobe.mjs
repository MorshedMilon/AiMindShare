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

  // ═══ 5 — content_templates / content_batch_jobs / extended content_queue ═══
  assert(
    (await pg.query(`select table_name from information_schema.tables
       where table_name in ('content_templates','content_batch_jobs')`)).rows.length === 2,
    "content_templates and content_batch_jobs tables exist"
  );
  assert(
    (await pg.query(`select column_name from information_schema.columns
       where table_name='content_queue' and column_name in ('batch_job_id','template_id','variables')`))
      .rows.length === 3,
    "content_queue has batch_job_id/template_id/variables columns"
  );
  await pg.exec(`insert into public.content_batch_jobs
      (id, workspace_id, site_id, name, topic_source, model, word_count_min, word_count_max, total_items, topics)
    values
      ('a0000000-0000-0000-0000-000000000010','a0000000-0000-0000-0000-000000000001',
       'a0000000-0000-0000-0000-000000000002','Ramadan batch','manual','claude-sonnet-5',800,1600,2,
       '[{"keyword":"best dua for ramadan"},{"keyword":"ramadan fasting tips"}]'::jsonb)`);
  assert(
    (await pg.query(`select status, total_items from public.content_batch_jobs where id='a0000000-0000-0000-0000-000000000010'`))
      .rows[0].status === 'draft',
    "a new content_batch_jobs row defaults to status='draft'"
  );

  // ═══ 6 — batch RPCs: create → estimate → preview → commit → schedule → rollback ═══
  // The five RPCs below gate on public.has_role(), which resolves off auth.uid()
  // (a session GUC), not off Postgres role membership — no earlier block in this
  // file needed it because sections 1-5 only exercised CHECK constraints/triggers
  // and direct table access under the migration-owning connection (which bypasses
  // RLS as table owner). Here we set request.jwt.claim.sub to the 'owner' member
  // inserted in ═══ 3 ═══ so has_role(ws,'staff'/'manager') resolves true inside
  // these functions; we deliberately do NOT `set role authenticated`, so the direct
  // table statements below (the duplicate-keyword insert and the linking CTE) keep
  // running as the table-owning connection and are unaffected by content_queue
  // having no UPDATE policy (0026 only defined sel/ins/del for it).
  await pg.exec(`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);`);

  const batchRow = await pg.query(
    `select public.create_batch_job($1,$2,$3,$4,$5,null,$6,$7,$8) as id`,
    ['a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','Dua batch','manual',
     JSON.stringify([{ keyword: "dua for travel" }, { keyword: "dua for anxiety" }, { keyword: "dua before sleep" }]),
     'claude-sonnet-5', 800, 1600]
  );
  const batchId = batchRow.rows[0].id;
  assert(!!batchId, "create_batch_job returns a new batch id");
  assert(
    (await pg.query(`select total_items from public.content_batch_jobs where id=$1`, [batchId])).rows[0].total_items === 3,
    "create_batch_job sets total_items from the topics array length"
  );

  const est = (await pg.query(`select public.estimate_batch_cost($1) as e`, [batchId])).rows[0].e;
  assert(est.total_items === 3 && est.est_tokens > 0 && est.est_cost_usd >= 0,
    "estimate_batch_cost returns total_items/est_tokens/est_cost_usd with no provider call");

  const preview = (await pg.query(`select public.generate_batch_preview($1, 1) as p`, [batchId])).rows[0].p;
  assert(preview.count === 1, "generate_batch_preview(batch, 1) creates exactly 1 content_queue row");
  assert(
    (await pg.query(`select status, preview_count from public.content_batch_jobs where id=$1`, [batchId])).rows[0].status === 'previewing',
    "generate_batch_preview flips the batch job to status='previewing'"
  );

  const commit = (await pg.query(`select public.commit_batch_job($1) as c`, [batchId])).rows[0].c;
  assert(commit.inserted === 2, "commit_batch_job inserts the REMAINING 2 topics (3 total - 1 preview)");
  assert(
    (await pg.query(`select count(*)::int as n from public.content_queue where batch_job_id=$1`, [batchId])).rows[0].n === 3,
    "content_queue now has all 3 topics (1 preview + 2 committed) tagged with batch_job_id"
  );
  assert(
    await denied(pg, `select public.commit_batch_job($1)`, [batchId]),
    "commit_batch_job refuses to run twice on the same batch (status is no longer draft/previewing)"
  );

  // duplicate-keyword flagging (exact match, D-192's honest downgrade from pgvector)
  await pg.exec(`insert into public.blog_articles (workspace_id, site_id, title, slug, keyword)
    values ('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','Existing','existing-dup','dua for travel')`);
  const dupBatch = (await pg.query(
    `select public.create_batch_job($1,$2,$3,$4,$5) as id`,
    ['a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','Dup test','manual',
     JSON.stringify([{ keyword: "dua for travel" }])]
  )).rows[0].id;
  const dupCommit = (await pg.query(`select public.commit_batch_job($1) as c`, [dupBatch])).rows[0].c;
  assert(dupCommit.duplicate_flagged === 1, "commit_batch_job flags an exact-keyword duplicate against existing blog_articles");

  // regression (fix #2): same-batch duplicate keywords must now be flagged too. The
  // duplicate check used to exclude `batch_job_id is distinct from b.id`, which
  // skipped every row from the CURRENT batch, so two identical topics in one messy
  // CSV upload both sailed through unflagged. The fix widens the check to cover all
  // OTHER content_queue rows for the site (any batch, including this one), excluded
  // by row id rather than batch id so a row never matches itself.
  const dupBatch2 = (await pg.query(
    `select public.create_batch_job($1,$2,$3,$4,$5) as id`,
    ['a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','Same-batch dup test','manual',
     JSON.stringify([{ keyword: "dup test" }, { keyword: "dup test" }, { keyword: "DUP Test " }])]
  )).rows[0].id;
  const dupCommit2 = (await pg.query(`select public.commit_batch_job($1) as c`, [dupBatch2])).rows[0].c;
  assert(
    dupCommit2.duplicate_flagged >= 2,
    "commit_batch_job flags same-batch duplicate keywords (2nd 'dup test' + 'DUP Test ' variant against the 1st), not just cross-batch ones"
  );

  // regression (fix #1): generate_batch_preview / commit_batch_job now SELECT their
  // content_batch_jobs row FOR UPDATE, closing a race where two concurrent calls on
  // the same batch could both pass the status check and both run their full side
  // effects (double preview generation/token spend, double-committed queue rows).
  // PGlite here is a single, sequential connection with no second session to
  // actually race against, so a literal concurrency test wouldn't prove anything —
  // instead this confirms the row lock is present in the DEPLOYED function body
  // (via pg_get_functiondef, not just grepping the migration source text).
  for (const fn of ["generate_batch_preview(uuid,int)", "commit_batch_job(uuid)"]) {
    const def = (await pg.query(`select pg_get_functiondef($1::regprocedure) as d`, [fn])).rows[0].d;
    assert(
      /for update/i.test(def),
      `${fn} selects its content_batch_jobs row "for update" (row lock against concurrent double-processing)`
    );
  }

  // schedule spread + rollback — mark the queue rows' articles in_review first (mimics
  // what handleBlogGenerate would have done after generation completed). The plan's
  // literal snippet embedded a bare `insert ... returning id` as a scalar subquery in
  // an `update ... set article_id = (...)`, which is invalid Postgres (INSERT is a
  // statement, not an expression). Fixed here with a data-modifying CTE: the INSERT's
  // SELECT derives each new article's slug from the originating content_queue row's id
  // ('gen-' || cq.id), giving a reliable 1:1 join key back to that same row — so each
  // of the batch's 3 content_queue rows gets its OWN distinct new blog_articles.id,
  // never a shared id or a cross join.
  await pg.query(
    `with new_articles as (
       insert into public.blog_articles (workspace_id, site_id, title, slug, status)
       select cq.workspace_id, cq.site_id, 'Generated: ' || cq.keyword, 'gen-' || cq.id, 'in_review'
       from public.content_queue cq
       where cq.batch_job_id = $1
       returning id, slug
     )
     update public.content_queue cq
        set article_id = na.id
       from new_articles na
      where cq.batch_job_id = $1
        and na.slug = 'gen-' || cq.id`,
    [batchId]
  );

  const scheduled = (await pg.query(
    `select public.schedule_batch_publish_spread($1, now(), 5, 2) as n`, [batchId]
  )).rows[0].n;
  assert(scheduled === 3, "schedule_batch_publish_spread schedules all 3 in_review articles from this batch");
  assert(
    (await pg.query(`select status from public.content_batch_jobs where id=$1`, [batchId])).rows[0].status === 'completed',
    "schedule_batch_publish_spread flips the batch job to status='completed'"
  );
  const rolledBack = (await pg.query(`select public.rollback_batch_job($1) as n`, [batchId])).rows[0].n;
  assert(rolledBack === 3, "rollback_batch_job reverts all 3 scheduled articles back to draft");
  assert(
    (await pg.query(`select count(*)::int as n from public.blog_articles
       where id in (select article_id from public.content_queue where batch_job_id=$1) and status='draft'`, [batchId]))
      .rows[0].n === 3,
    "rollback_batch_job leaves the articles as drafts (no hard delete)"
  );

  // ═══ 7 — advance_content_pipeline() drains batch-sourced content_queue rows too ═══
  const paceBatch = (await pg.query(
    `select public.create_batch_job($1,$2,$3,$4,$5) as id`,
    ['a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','Pace test','manual',
     JSON.stringify(Array.from({ length: 15 }, (_, i) => ({ keyword: `pace topic ${i}` })))]
  )).rows[0].id;
  await pg.query(`select public.commit_batch_job($1)`, [paceBatch]);
  const before = (await pg.query(
    `select count(*)::int as n from public.jobs where type='blog.generate' and payload->>'content_queue_id' in
       (select id::text from public.content_queue where batch_job_id=$1)`, [paceBatch]
  )).rows[0].n;
  assert(before === 0, "no blog.generate jobs enqueued yet for the batch (only commit_batch_job ran)");

  await pg.query(`select public.advance_content_pipeline()`);
  const afterOne = (await pg.query(
    `select count(*)::int as n from public.jobs where type='blog.generate' and payload->>'content_queue_id' in
       (select id::text from public.content_queue where batch_job_id=$1)`, [paceBatch]
  )).rows[0].n;
  assert(afterOne > 0 && afterOne <= 10, "advance_content_pipeline enqueues UP TO the per-tick bulk cap (10), not all 15 at once");
  assert(
    (await pg.query(`select status from public.content_batch_jobs where id=$1`, [paceBatch])).rows[0].status === 'running',
    "advance_content_pipeline flips the batch job to status='running' once it starts draining"
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main();
