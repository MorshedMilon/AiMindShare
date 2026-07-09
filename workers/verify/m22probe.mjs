// m22probe.mjs — verify the M22 Content/CMS MANUAL slice on REAL Postgres
// (PGlite, no Docker). Proves the DoD gates checkable without a live stack:
//   Schema       — blog_articles/article_revisions/article_categories/
//                  article_authors exist + RLS on; blog_articles has 4 policies.
//   Gate-1 leak  — B's staff cannot select/insert/update A's articles/categories,
//                  nor insert an author into A.
//   Gate-2 roles — staff+ create/edit; manager+ delete + publish + approve + reject;
//                  a CLIENT role writes nothing (operator ceiling, mirrors M19 D-105).
//   Revisions    — append-only (no client insert); save_article_revision snapshots +
//                  prunes to the last 20; restore_article_revision reverts as a draft.
//   Publish      — publish_article flips status, stamps published_at, builds Article
//                  JSON-LD, and is manager+ only.
//   Schedule     — schedule_article + publish_due_articles publishes DUE rows and
//                  skips future ones (the cron body).
//   Editorial    — submit_for_review → in_review; approve → published; reject stores
//                  feedback + returns to draft; staff cannot approve/reject.
//   Uniqueness   — (site_id, slug) is unique per site.
//
//   node workers/verify/m22probe.mjs
//
// Exit 0 = all passed; 1 = a failure/leak. Depends on M05/M09/M11/M12/M13/M19
// migrations (emit_trigger + sites). `create extension`, `gin_trgm_ops`, and the
// `vector(1536)` scaffold line are stripped for PGlite; cron is guarded in-migration.
//
// NOT here (carried live, never faked — absent in PGlite): the blog-render Edge Fn
// HTML/RSS output (covered by the Node m22renderprobe), the live pg_cron schedule
// (the publish_due_articles BODY is asserted directly here), and the M13 bus
// side-effects of article.published (emit_trigger is fired tolerantly).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "..", "supabase", "migrations");

const OWNER_A   = "11111111-1111-1111-1111-111111111111";
const ADMIN_A   = "22222222-2222-2222-2222-222222222222";
const MANAGER_A = "33333333-3333-3333-3333-333333333333";
const STAFF_A   = "44444444-4444-4444-4444-444444444444";
const CLIENT_A  = "55555555-5555-5555-5555-555555555555";
const OWNER_B   = "66666666-6666-6666-6666-666666666666";
const STAFF_B   = "77777777-7777-7777-7777-777777777777";

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

// Strip pg-only bits absent in PGlite: extensions, trigram index ops, and the
// pgvector scaffold column (D-124) — the embedding line is on its own line so it
// removes cleanly, exactly like the gin_trgm_ops perf-index lines.
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

  // ── Harness: auth schema + uid() stub + roles ────────────────────────────────
  await pg.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role authenticated nologin; create role service_role nologin;
    grant usage on schema public to authenticated;
  `);

  // Dependency order: tenancy/jobs, M05 (consent FK for M09), M09/M11/M12 (M13's
  // source triggers wire to them), M13 (emit_trigger), M19 (sites), then this module.
  for (const m of [
    "0000_extensions_enums.sql", "0001_tenancy.sql", "0002_jobs.sql",
    "0010_m05_compliance.sql", "0013_m09_crm.sql", "0014_m11_pipeline.sql",
    "0015_m12_inbox.sql", "0016_m13_automations.sql", "0022_m19_sites.sql",
    "0025_m22_content.sql",
  ]) {
    await pg.exec(load(m));
  }
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);
  // Faithful grant posture: publish_due_articles is service-role-only.
  await pg.exec(`revoke execute on function public.publish_due_articles() from authenticated;`);

  const as = (sub) => pg.exec(
    `set role authenticated;` +
    `select set_config('request.jwt.claim.sub','${sub}',false);`);
  const reset = () => pg.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);

  // ── Setup: two workspaces + members at every role + a site in each ───────────
  await reset();
  for (const [id, u] of [[OWNER_A,"owner.a"],[ADMIN_A,"admin.a"],[MANAGER_A,"manager.a"],
                         [STAFF_A,"staff.a"],[CLIENT_A,"client.a"],[OWNER_B,"owner.b"],[STAFF_B,"staff.b"]]) {
    await pg.query(`insert into auth.users (id,email) values ($1,$2) on conflict do nothing`, [id, `${u}@aimindshare.test`]);
    await pg.query(`insert into public.profiles (id,email,name) values ($1,$2,$3) on conflict do nothing`, [id, `${u}@aimindshare.test`, u]);
  }
  const wsA = (await pg.query(`insert into public.workspaces (owner_id,name,slug) values ($1,'Acme Agency','acme') returning id`, [OWNER_A])).rows[0].id;
  const wsB = (await pg.query(`insert into public.workspaces (owner_id,name,slug) values ($1,'Bravo Agency','bravo') returning id`, [OWNER_B])).rows[0].id;
  await pg.query(`insert into public.memberships (workspace_id,user_id,role,status) values
      ($1,$2,'owner','active'),($1,$3,'admin','active'),($1,$4,'manager','active'),($1,$5,'staff','active'),($1,$6,'client','active')`,
      [wsA, OWNER_A, ADMIN_A, MANAGER_A, STAFF_A, CLIENT_A]);
  await pg.query(`insert into public.memberships (workspace_id,user_id,role,status) values
      ($1,$2,'owner','active'),($1,$3,'staff','active')`, [wsB, OWNER_B, STAFF_B]);
  const siteA = (await pg.query(`insert into public.sites (workspace_id,name,subdomain,status) values ($1,'Acme Blog','acme','published') returning id`, [wsA])).rows[0].id;
  const siteB = (await pg.query(`insert into public.sites (workspace_id,name,subdomain,status) values ($1,'Bravo Blog','bravo','published') returning id`, [wsB])).rows[0].id;

  // helper: insert an article as superuser (bypass RLS) for setup
  const mkArticle = async (ws, site, slug, status = "draft") =>
    (await pg.query(`insert into public.blog_articles (workspace_id,site_id,title,slug,content_html,status)
      values ($1,$2,$3,$4,'<p>Body</p>',$5) returning id`, [ws, site, `Article ${slug}`, slug, status])).rows[0].id;

  // ═══ 1 — schema + RLS posture ══════════════════════════════════════════════
  console.log("\nM22 · schema + RLS posture:");
  for (const t of ["blog_articles","article_revisions","article_categories","article_authors"]) {
    assert(await count(pg, `select count(*)::int n from pg_tables where tablename=$1 and rowsecurity`, [t]) === 1, `${t} RLS on`);
  }
  assert(await count(pg, `select count(*)::int n from pg_policies where tablename='blog_articles'`) === 4, "blog_articles has 4 policies (sel/ins/upd/del)");
  assert(await count(pg, `select count(*)::int n from pg_policies where tablename='article_revisions'`) === 1, "article_revisions is SELECT-only (1 policy)");
  for (const f of ["save_article_revision","restore_article_revision","publish_article","schedule_article","submit_for_review","approve_article","reject_article","publish_due_articles"]) {
    assert(await count(pg, `select count(*)::int n from pg_proc where proname=$1`, [f]) === 1, `${f}() present`);
  }

  // ═══ 2 — cross-tenant leak (B cannot touch A) ══════════════════════════════
  console.log("\nM22 · cross-tenant leak:");
  const aArt = await mkArticle(wsA, siteA, "leak-target");
  await as(STAFF_B);
  assert(await count(pg, `select count(*)::int n from public.blog_articles where workspace_id='${wsA}'`) === 0, "B cannot SELECT A's articles");
  assert(await denied(pg, `insert into public.article_categories (workspace_id,site_id,name,slug) values ('${wsA}','${siteA}','HIJACK','hijack')`), "B cannot INSERT a category into A");
  assert(await denied(pg, `insert into public.article_authors (workspace_id,name) values ('${wsA}','HIJACK')`), "B cannot INSERT an author into A");
  assert((await pg.query(`update public.blog_articles set title='HIJACK' where workspace_id='${wsA}'`)).affectedRows === 0, "B cannot UPDATE A's article");
  assert((await pg.query(`delete from public.blog_articles where workspace_id='${wsA}'`)).affectedRows === 0, "B cannot DELETE A's article");

  // ═══ 3 — role matrix ═══════════════════════════════════════════════════════
  console.log("\nM22 · role matrix:");
  await as(STAFF_A);
  const author = (await pg.query(`insert into public.article_authors (workspace_id,name,bio) values ('${wsA}','Amina Rahman','Editor') returning id`)).rows[0].id;
  const cat = (await pg.query(`insert into public.article_categories (workspace_id,site_id,name,slug) values ('${wsA}','${siteA}','Guides','guides') returning id`)).rows[0].id;
  const sArt = (await pg.query(`insert into public.blog_articles (workspace_id,site_id,category_id,author_id,title,slug,content_html) values ('${wsA}','${siteA}','${cat}','${author}','How to X','how-to-x','<p>hi</p>') returning id`)).rows[0].id;
  assert(!!sArt, "staff CAN create an article (+ author + category)");
  await as(CLIENT_A);
  assert(await denied(pg, `insert into public.blog_articles (workspace_id,site_id,title,slug) values ('${wsA}','${siteA}','C','c')`), "client CANNOT create an article (write ceiling)");
  assert(await count(pg, `select count(*)::int n from public.blog_articles where workspace_id='${wsA}'`) === 0, "client CANNOT read the workspace's articles (operator ceiling)");
  await as(STAFF_A);
  assert((await pg.query(`delete from public.blog_articles where id='${aArt}'`)).affectedRows === 0, "staff CANNOT delete an article (manager+)");
  await as(MANAGER_A);
  assert((await pg.query(`delete from public.blog_articles where id='${aArt}'`)).affectedRows === 1, "manager CAN delete an article");
  await as(STAFF_A);
  assert(await denied(pg, `select public.publish_article('${sArt}')`), "staff CANNOT publish (manager+)");

  // ═══ 4 — revisions: append-only + snapshot + prune-to-20 + restore ═════════
  console.log("\nM22 · revisions:");
  await as(CLIENT_A);
  assert(await denied(pg, `insert into public.article_revisions (workspace_id,article_id,version_no) values ('${wsA}','${sArt}',1)`), "client CANNOT insert a revision directly (definer-only)");
  await as(STAFF_A);
  const v1 = Number((await pg.query(`select public.save_article_revision('${sArt}') v`)).rows[0].v);
  assert(v1 === 1, "save_article_revision → version 1");
  await pg.exec(`update public.blog_articles set title='How to X (v2)' where id='${sArt}'`);
  const v2 = Number((await pg.query(`select public.save_article_revision('${sArt}') v`)).rows[0].v);
  assert(v2 === 2, "second save → version 2");
  assert(await count(pg, `select count(*)::int n from public.article_revisions where article_id='${sArt}'`) === 2, "two revisions recorded (append-only)");
  // prune: push to 24 total, expect only the last 20 kept (versions 5..24)
  for (let i = 0; i < 22; i++) await pg.exec(`select public.save_article_revision('${sArt}')`);
  assert(await count(pg, `select count(*)::int n from public.article_revisions where article_id='${sArt}'`) === 20, "prune keeps only the last 20 revisions");
  assert(await count(pg, `select min(version_no)::int n from public.article_revisions where article_id='${sArt}'`) === 5, "oldest kept revision is version 5 (1..4 pruned)");
  // restore v5 (title was 'How to X (v2)' from version 2 onward) — restore reverts + drafts
  await pg.exec(`update public.blog_articles set title='EDITED LIVE', status='in_review' where id='${sArt}'`);
  await pg.exec(`select public.restore_article_revision('${sArt}',5)`);
  assert(await count(pg, `select count(*)::int n from public.blog_articles where id='${sArt}' and title='How to X (v2)' and status='draft'`) === 1, "restore reverts content + sets status='draft'");

  // ═══ 5 — publish flips + JSON-LD + trigger (manager+) ══════════════════════
  console.log("\nM22 · publish:");
  await as(MANAGER_A);
  const pubAt = (await pg.query(`select public.publish_article('${sArt}') at`)).rows[0].at;
  assert(!!pubAt, "publish_article returns published_at");
  assert(await count(pg, `select count(*)::int n from public.blog_articles where id='${sArt}' and status='published' and published_at is not null`) === 1, "article flipped to published");
  assert(await count(pg, `select count(*)::int n from public.blog_articles where id='${sArt}' and schema->>'@type'='Article' and schema->>'headline'='How to X (v2)'`) === 1, "Article JSON-LD built into schema (headline from title)");

  // ═══ 6 — schedule → publish_due_articles (the cron body) ═══════════════════
  console.log("\nM22 · schedule + due-publish:");
  const dueArt = await mkArticle(wsA, siteA, "due-soon");
  const futArt = await mkArticle(wsA, siteA, "future");
  await as(MANAGER_A);
  await pg.exec(`select public.schedule_article('${dueArt}', now() - interval '1 minute')`);
  await pg.exec(`select public.schedule_article('${futArt}', now() + interval '1 day')`);
  assert(await count(pg, `select count(*)::int n from public.blog_articles where id='${dueArt}' and status='scheduled'`) === 1, "schedule_article sets status='scheduled'");
  await reset();  // cron runs service-role/system
  const nPub = Number((await pg.query(`select public.publish_due_articles() n`)).rows[0].n);
  assert(nPub === 1, "publish_due_articles publishes exactly the 1 DUE article");
  assert(await count(pg, `select count(*)::int n from public.blog_articles where id='${dueArt}' and status='published'`) === 1, "the due article is now published");
  assert(await count(pg, `select count(*)::int n from public.blog_articles where id='${futArt}' and status='scheduled'`) === 1, "the future article stays scheduled (not published early)");

  // ═══ 7 — editorial workflow: submit / approve / reject ═════════════════════
  console.log("\nM22 · editorial workflow:");
  const revArt = await mkArticle(wsA, siteA, "review-me");
  const rejArt = await mkArticle(wsA, siteA, "reject-me");
  await as(STAFF_A);
  await pg.exec(`select public.submit_for_review('${revArt}')`);
  assert(await count(pg, `select count(*)::int n from public.blog_articles where id='${revArt}' and status='in_review'`) === 1, "submit_for_review → in_review");
  assert(await denied(pg, `select public.approve_article('${revArt}')`), "staff CANNOT approve (manager+)");
  assert(await denied(pg, `select public.reject_article('${revArt}','no')`), "staff CANNOT reject (manager+)");
  await as(MANAGER_A);
  await pg.exec(`select public.approve_article('${revArt}')`);
  assert(await count(pg, `select count(*)::int n from public.blog_articles where id='${revArt}' and status='published'`) === 1, "manager approve → published");
  await pg.exec(`select public.submit_for_review('${rejArt}')`);   // manager can also submit (staff+)
  await pg.exec(`select public.reject_article('${rejArt}','Needs more sources')`);
  assert(await count(pg, `select count(*)::int n from public.blog_articles where id='${rejArt}' and status='draft' and reject_feedback='Needs more sources'`) === 1, "reject → draft + feedback stored");

  // ═══ 8 — slug uniqueness per site ══════════════════════════════════════════
  console.log("\nM22 · slug uniqueness:");
  await reset();
  assert(await denied(pg, `insert into public.blog_articles (workspace_id,site_id,title,slug) values ('${wsA}','${siteA}','Dup','how-to-x')`), "duplicate (site_id, slug) rejected");
  const dupOk = await pg.query(`insert into public.blog_articles (workspace_id,site_id,title,slug) values ('${wsB}','${siteB}','Same slug OK','how-to-x') returning id`);
  assert(!!dupOk.rows[0].id, "same slug on a DIFFERENT site is allowed");

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}M22 probe: ${pass} passed, ${fail} failed\x1b[0m`);
  await pg.close();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
