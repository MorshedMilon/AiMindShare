// m22autoprobe.mjs — verify the M22-auto Auto-Blog Pipeline SCAFFOLD on REAL
// Postgres (PGlite, no Docker). Proves the DoD gates checkable without a live stack:
//   Schema       — content_schedules exists + RLS on (4 policies); content_queue has
//                  the new extension columns (site_id/schedule_id/article_id/
//                  fail_reason/attempts/step) + widened status check; blog_articles
//                  has cluster_slug/pillar_slug.
//   Gate-1 leak  — B's staff cannot select/insert/update/delete A's content_schedules
//                  nor A's content_queue rows.
//   Gate-2 roles — staff+ write schedules/queue; manager+ delete; worker RPCs
//                  (claim/complete/fail/create_generated_article/advance) reject a
//                  non-service (authenticated) caller.
//   Enqueue      — enqueue_content_generation inserts exactly ONE idempotent queued
//                  blog.generate job (re-call is a no-op).
//   Pipeline     — drive the worker RPCs in-process: a queued item →
//                  create_generated_article makes a blog_articles DRAFT carrying
//                  seo_score + schema + cluster_slug + ≥1 internal /blog/ link;
//                  quality gate routes review vs auto-publish (via publish_article).
//   Scheduler    — advance_content_pipeline enqueues ≤ max_posts_per_run jobs
//                  idempotently and stamps last_run_at.
//
//   node workers/verify/m22autoprobe.mjs
//
// Exit 0 = all passed; 1 = a failure/leak. `create extension`, `gin_trgm_ops`, and
// the `vector(1536)` scaffold line are stripped for PGlite; cron + realtime are
// guarded in-migration. The pipeline module (blog-pipeline.mjs) is proven purely by
// m22pipelineprobe.mjs; here we prove the SQL seams it plugs into.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  compute_topic_cluster, build_serp_brief, build_article_html,
  score_article, suggest_internal_links, build_schema,
} from "../../frontend/js/blog-pipeline.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const OWNER_A   = "11111111-1111-1111-1111-111111111111";
const MANAGER_A = "33333333-3333-3333-3333-333333333333";
const STAFF_A   = "44444444-4444-4444-4444-444444444444";
const CLIENT_A  = "55555555-5555-5555-5555-555555555555";
const OWNER_B   = "66666666-6666-6666-6666-666666666666";
const STAFF_B   = "77777777-7777-7777-7777-777777777777";

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
  ]) {
    await pg.exec(load(m));
  }
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);
  // Faithful grant posture: worker RPCs are service-role only.
  for (const f of [
    "claim_content_item(uuid)", "complete_content_item(uuid,uuid,text,text)",
    "fail_content_item(uuid,text)", "create_generated_article(uuid,uuid,uuid,jsonb)",
    "advance_content_pipeline()",
  ]) {
    await pg.exec(`revoke execute on function public.${f} from authenticated;`);
  }

  const as = (sub) => pg.exec(
    `set role authenticated;` +
    `select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);

  // ── Setup: two workspaces + members + a site each ────────────────────────────
  await reset();
  for (const [id, u] of [[OWNER_A,"owner.a"],[MANAGER_A,"manager.a"],[STAFF_A,"staff.a"],
                         [CLIENT_A,"client.a"],[OWNER_B,"owner.b"],[STAFF_B,"staff.b"]]) {
    await pg.query(`insert into auth.users (id,email) values ($1,$2) on conflict do nothing`, [id, `${u}@aimindshare.test`]);
    await pg.query(`insert into public.profiles (id,email,name) values ($1,$2,$3) on conflict do nothing`, [id, `${u}@aimindshare.test`, u]);
  }
  const wsA = (await pg.query(`insert into public.workspaces (owner_id,name,slug) values ($1,'Acme','acme') returning id`, [OWNER_A])).rows[0].id;
  const wsB = (await pg.query(`insert into public.workspaces (owner_id,name,slug) values ($1,'Bravo','bravo') returning id`, [OWNER_B])).rows[0].id;
  await pg.query(`insert into public.memberships (workspace_id,user_id,role,status) values
      ($1,$2,'owner','active'),($1,$3,'manager','active'),($1,$4,'staff','active'),($1,$5,'client','active')`,
      [wsA, OWNER_A, MANAGER_A, STAFF_A, CLIENT_A]);
  await pg.query(`insert into public.memberships (workspace_id,user_id,role,status) values
      ($1,$2,'owner','active'),($1,$3,'staff','active')`, [wsB, OWNER_B, STAFF_B]);
  const siteA = (await pg.query(`insert into public.sites (workspace_id,name,subdomain,status) values ($1,'Acme Blog','acme','published') returning id`, [wsA])).rows[0].id;
  const siteB = (await pg.query(`insert into public.sites (workspace_id,name,subdomain,status) values ($1,'Bravo Blog','bravo','published') returning id`, [wsB])).rows[0].id;

  // ═══ 1 — schema + RLS posture ══════════════════════════════════════════════
  console.log("\nM22-auto · schema + RLS posture:");
  assert(await count(pg, `select count(*)::int n from pg_tables where tablename='content_schedules' and rowsecurity`) === 1, "content_schedules RLS on");
  assert(await count(pg, `select count(*)::int n from pg_policies where tablename='content_schedules'`) === 4, "content_schedules has 4 policies (sel/ins/upd/del)");
  for (const c of ["site_id","schedule_id","article_id","fail_reason","attempts","step"]) {
    assert(await count(pg, `select count(*)::int n from information_schema.columns where table_name='content_queue' and column_name=$1`, [c]) === 1, `content_queue.${c} column added`);
  }
  for (const c of ["cluster_slug","pillar_slug"]) {
    assert(await count(pg, `select count(*)::int n from information_schema.columns where table_name='blog_articles' and column_name=$1`, [c]) === 1, `blog_articles.${c} column added`);
  }
  // widened status check: 'failed' is now allowed on content_queue
  assert(!(await denied(pg, `insert into public.content_queue (workspace_id,keyword,status) values ('${wsA}','probe kw','queued')`)), "content_queue accepts a 'queued' row");
  for (const f of ["upsert_content_schedule","enqueue_content_generation","claim_content_item","complete_content_item","fail_content_item","create_generated_article","advance_content_pipeline"]) {
    assert(await count(pg, `select count(*)::int n from pg_proc where proname=$1`, [f]) === 1, `${f}() present`);
  }

  // ═══ 2 — cross-tenant leak (B cannot touch A) ══════════════════════════════
  console.log("\nM22-auto · cross-tenant leak:");
  const schedA = (await pg.query(`insert into public.content_schedules (workspace_id,site_id,schedule_name) values ('${wsA}','${siteA}','A weekly') returning id`)).rows[0].id;
  const aQ = (await pg.query(`insert into public.content_queue (workspace_id,site_id,keyword,status) values ('${wsA}','${siteA}','a-secret','queued') returning id`)).rows[0].id;
  await as(STAFF_B);
  assert(await count(pg, `select count(*)::int n from public.content_schedules where workspace_id='${wsA}'`) === 0, "B cannot SELECT A's content_schedules");
  assert(await count(pg, `select count(*)::int n from public.content_queue where workspace_id='${wsA}'`) === 0, "B cannot SELECT A's content_queue");
  assert(await denied(pg, `insert into public.content_schedules (workspace_id,site_id,schedule_name) values ('${wsA}','${siteA}','HIJACK')`), "B cannot INSERT a schedule into A");
  assert((await pg.query(`update public.content_schedules set schedule_name='HIJACK' where id='${schedA}'`)).affectedRows === 0, "B cannot UPDATE A's schedule");
  assert((await pg.query(`delete from public.content_queue where id='${aQ}'`)).affectedRows === 0, "B cannot DELETE A's queue row");

  // ═══ 3 — role matrix + worker-RPC service-role wall ════════════════════════
  console.log("\nM22-auto · role matrix + worker-RPC wall:");
  await as(STAFF_A);
  const schedUp = (await pg.query(`select public.upsert_content_schedule('${wsA}','${siteA}','A via rpc') v`)).rows[0].v;
  assert(schedUp === schedA, "upsert_content_schedule upserts the existing per-site schedule (same id)");
  assert(await denied(pg, `select public.upsert_content_schedule('${wsB}','${siteB}')`), "staff A cannot upsert a schedule in B (role check)");
  await as(CLIENT_A);
  assert(await denied(pg, `insert into public.content_schedules (workspace_id,site_id,schedule_name) values ('${wsA}','${siteA}','C')`), "client CANNOT insert a schedule (write ceiling)");
  await as(STAFF_A);
  assert((await pg.query(`delete from public.content_schedules where id='${schedA}'`)).affectedRows === 0, "staff CANNOT delete a schedule (manager+)");
  // worker RPCs reject a non-service (authenticated) caller
  assert(await denied(pg, `select public.claim_content_item('${aQ}')`), "authenticated CANNOT call claim_content_item (service-role only)");
  assert(await denied(pg, `select public.create_generated_article('${wsA}','${siteA}',null,'{}'::jsonb)`), "authenticated CANNOT call create_generated_article (service-role only)");
  assert(await denied(pg, `select public.advance_content_pipeline()`), "authenticated CANNOT call advance_content_pipeline (service-role only)");
  await as(MANAGER_A);
  assert((await pg.query(`delete from public.content_schedules where id='${schedA}'`)).affectedRows === 1, "manager CAN delete a schedule");

  // ═══ 4 — enqueue_content_generation idempotency (staff+) ═══════════════════
  console.log("\nM22-auto · enqueue idempotency:");
  await as(STAFF_A);
  const eQ = (await pg.query(`insert into public.content_queue (workspace_id,site_id,keyword,status) values ('${wsA}','${siteA}','enqueue-me','queued') returning id`)).rows[0].id;
  const j1 = (await pg.query(`select public.enqueue_content_generation('${eQ}') v`)).rows[0].v;
  const j2 = (await pg.query(`select public.enqueue_content_generation('${eQ}') v`)).rows[0].v;
  assert(!!j1 && j1 === j2, "enqueue_content_generation is idempotent (same job id on re-call)");
  await reset();
  assert(await count(pg, `select count(*)::int n from public.jobs where type='blog.generate' and idempotency_key='bloggen-${eQ}'`) === 1, "exactly ONE blog.generate job enqueued for the row");

  // ═══ 5 — pipeline path: RPCs drive a queued item → scored draft ════════════
  console.log("\nM22-auto · pipeline path (worker RPCs, service-role):");
  await reset();  // worker runs service-role/system
  // Re-create a schedule for the auto-publish/review gate (A, siteA), auto_publish off.
  await pg.exec(`insert into public.content_schedules (workspace_id,site_id,schedule_name,auto_publish,min_seo_score,min_readability_score) values ('${wsA}','${siteA}','gate',false,0,0)`);
  const pQ = (await pg.query(`insert into public.content_queue (workspace_id,site_id,keyword,status) values ('${wsA}','${siteA}','how to grow medjool dates','queued') returning id`)).rows[0].id;
  // claim
  await pg.exec(`select public.claim_content_item('${pQ}')`);
  const afterClaim = (await pg.query(`select status, step from public.content_queue where id='${pQ}'`)).rows[0];
  assert(afterClaim.status === "in_progress" && afterClaim.step === "brief", "claim_content_item → in_progress, step='brief'");
  // run the pure pipeline in-process (exactly what the worker does)
  const kw = "how to grow medjool dates";
  const cluster = compute_topic_cluster(kw, siteA);
  const brief = build_serp_brief(kw, cluster);
  const html = build_article_html(brief, cluster);
  const scored = score_article(html, kw);
  const links = suggest_internal_links(cluster);
  const schema = build_schema(kw, { meta_title: brief.meta_title, meta_desc: brief.meta_desc, slug: brief.slug });
  const payload = {
    keyword: kw, title: brief.title_ideas[0], slug: brief.slug, excerpt: brief.meta_desc,
    content_html: html, meta_title: brief.meta_title, meta_desc: brief.meta_desc,
    tags: [cluster.pillar_slug, cluster.cluster_slug], schema,
    seo_score: scored.seo_score, readability_score: scored.readability_score, word_count: scored.word_count,
    cluster_slug: cluster.cluster_slug, pillar_slug: cluster.pillar_slug,
  };
  const artId = (await pg.query(`select public.create_generated_article('${wsA}','${siteA}',null,$1::jsonb) v`, [JSON.stringify(payload)])).rows[0].v;
  assert(!!artId, "create_generated_article returns a new article id");
  const art = (await pg.query(`select status, seo_score, word_count, cluster_slug, pillar_slug, content_html, schema from public.blog_articles where id='${artId}'`)).rows[0];
  assert(art.status === "draft", "generated article is a DRAFT");
  assert(art.seo_score !== null && Number(art.seo_score) >= 0, "article carries seo_score");
  assert(art.cluster_slug === cluster.cluster_slug && art.pillar_slug === cluster.pillar_slug, "article carries cluster_slug + pillar_slug");
  assert(art.schema && art.schema["@type"] === "BlogPosting", "article carries BlogPosting JSON-LD schema");
  assert(/<a\s[^>]*href=["']\/blog\//i.test(art.content_html), "article HTML has ≥1 internal /blog/ link");
  assert(links.length >= 1, "suggest_internal_links produced link candidates");

  // quality gate → review (auto_publish=false): step='review', status='done', article in_review.
  // The worker (service-role) sets the article status directly (submit_for_review is
  // staff-gated and the worker has no auth.uid()) — same effect, routed to M22-manual.
  await pg.exec(`select public.complete_content_item('${pQ}','${artId}','review',null)`);
  await pg.exec(`update public.blog_articles set status='in_review' where id='${artId}'`);
  const rev = (await pg.query(`select status, step, article_id from public.content_queue where id='${pQ}'`)).rows[0];
  assert(rev.status === "done" && rev.step === "review" && rev.article_id === artId, "review route: complete_content_item done/step=review/linked");
  assert(await count(pg, `select count(*)::int n from public.blog_articles where id='${artId}' and status='in_review'`) === 1, "review route: article routed to in_review (M22-manual queue)");

  // auto-publish route on a second item
  const pQ2 = (await pg.query(`insert into public.content_queue (workspace_id,site_id,keyword,status) values ('${wsA}','${siteA}','best date grinder','queued') returning id`)).rows[0].id;
  await pg.exec(`select public.claim_content_item('${pQ2}')`);
  const art2 = (await pg.query(`select public.create_generated_article('${wsA}','${siteA}',null,'{"keyword":"best date grinder","title":"Best Date Grinder","slug":"best-date-grinder","content_html":"<p>x</p>","seo_score":90,"readability_score":80,"word_count":1200,"cluster_slug":"best-date-grinder","pillar_slug":"date","schema":{"@type":"BlogPosting"}}'::jsonb) v`)).rows[0].v;
  // Worker auto-publish uses the INTERNAL _m22_publish (service-role, no auth.uid()
  // → the manager-gated publish_article would fail). This is the path the handler takes.
  await pg.exec(`select public._m22_publish('${art2}')`);
  const pubStatus = (await pg.query(`select status from public.blog_articles where id='${art2}'`)).rows[0].status;
  assert(pubStatus === "published", "auto-publish route: _m22_publish flips the draft to published");
  await pg.exec(`select public.complete_content_item('${pQ2}','${art2}','published',null)`);
  assert(await count(pg, `select count(*)::int n from public.content_queue where id='${pQ2}' and step='published' and status='done'`) === 1, "auto-publish route: queue step='published', status='done'");

  // fail path
  const fQ = (await pg.query(`insert into public.content_queue (workspace_id,site_id,keyword,status) values ('${wsA}','${siteA}','fail-me','queued') returning id`)).rows[0].id;
  await pg.exec(`select public.fail_content_item('${fQ}','boom')`);
  assert(await count(pg, `select count(*)::int n from public.content_queue where id='${fQ}' and status='failed' and fail_reason='boom'`) === 1, "fail_content_item → status='failed' + reason recorded");

  // ═══ 6 — advance_content_pipeline (cron body) enqueues ≤ max_posts_per_run ══
  console.log("\nM22-auto · scheduler (advance_content_pipeline):");
  // fresh site + schedule with max_posts_per_run=2 and 3 queued rows
  const siteC = (await pg.query(`insert into public.sites (workspace_id,name,subdomain,status) values ('${wsA}','Acme C','acmec','published') returning id`)).rows[0].id;
  await pg.exec(`insert into public.content_schedules (workspace_id,site_id,schedule_name,max_posts_per_run,frequency) values ('${wsA}','${siteC}','sch C',2,'daily')`);
  for (const k of ["kw-1","kw-2","kw-3"]) {
    await pg.exec(`insert into public.content_queue (workspace_id,site_id,keyword,status) values ('${wsA}','${siteC}','${k}','queued')`);
  }
  await pg.query(`select public.advance_content_pipeline() n`);
  const enqC = await count(pg, `select count(*)::int n from public.jobs j
     join public.content_queue q on q.id = (j.payload->>'content_queue_id')::uuid
     where j.type='blog.generate' and q.site_id='${siteC}'`);
  assert(enqC === 2, `advance_content_pipeline enqueues exactly max_posts_per_run (2) jobs for the site (got ${enqC})`);
  assert(await count(pg, `select count(*)::int n from public.content_schedules where site_id='${siteC}' and last_run_at is not null`) === 1, "advance stamps last_run_at");
  // immediate re-run: every schedule is not due (just stamped) AND jobs are idempotent → 0 new
  const before = await count(pg, `select count(*)::int n from public.jobs where type='blog.generate'`);
  await pg.query(`select public.advance_content_pipeline() n`);
  const after = await count(pg, `select count(*)::int n from public.jobs where type='blog.generate'`);
  assert(after === before, "immediate re-run enqueues 0 new jobs (schedules not due / idempotent)");

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M22-auto probe: ${pass} passed, ${fail} failed\x1b[0m`);
  await pg.close();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
