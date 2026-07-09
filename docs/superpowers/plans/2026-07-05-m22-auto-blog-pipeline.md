# M22-auto — Auto-Blog Pipeline (scaffold) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Ship the Session-23 Auto-Blog Pipeline (M22-auto) to Definition-of-Done as an **honest "ready-not-run" scaffold**: a content-queue pipeline board, per-site auto-blog schedules, bulk-CSV keyword import, and a real `blog.generate` **worker job-chain** + scheduler cron that turns a keyword into a scored, internally-linked, JSON-LD blog_articles draft (→ review queue or auto-publish) — with the GPT brief/article and DALL·E image steps as **deterministic, labelled stubs that meter nothing**, switching to real generation once an LLM provider is chosen and M35 lands.

**Why a scaffold (not real generation):** the content-gen LLM provider is an **OPEN human-call decision** (same posture as D-063 M13-AI / D-092 M16-AI) and **M35 Creative Studio** (DALL·E featured images) is unbuilt. This slice builds every seam to full contract and flags the two provider gaps — exactly how M13/M16 shipped their AI features. **No metering** until a provider is wired (Gate 3 = "no billable action").

**Architecture:** Locked stack — vanilla HTML/CSS/JS + Supabase (Postgres + RLS + Edge Functions + `public.jobs` + pg_cron). Generation is a **worker** job (`blog.generate`, D-010 heavy-work posture), never inline in an Edge Fn. The pipeline logic is a **pure module** `frontend/js/blog-pipeline.mjs` (deterministic, Node-testable) reused by the worker + the probe + the frontend "preview". It builds on: M21 `content_queue` (0026), M22-manual `blog_articles` + `publish_article`/`_m22_publish` + `content-seo.mjs` scorer (0025), and the shared shell/tokens.

**Tech Stack:** PostgreSQL (migration `0027`), Node worker (`workers/worker.mjs`), pg_cron, vanilla HTML/CSS/JS, PGlite probes.

**Verification model (repo convention):** DB/RLS/pipeline → `workers/verify/m22autoprobe.mjs` (PGlite). Pure pipeline module → `workers/verify/m22pipelineprobe.mjs` (Node). Front end → preview server. Gate-8 → `scripts/gate8.sh`. Not a git repo → commits optional.

**References:** design constraints per PRD_M22 §2 (AI Auto-Blog Pipeline, 11 steps) + BUILD-SEQUENCE row 23; scaffold posture D-063/D-092; cron/inline-sweep D-127/D-112; worker chain M16 `campaign.send`→`sequence.step`.

**Pre-flight:** re-confirm `0027` free (`ls supabase/migrations | tail`), DECISIONS `D-147+` free (`grep -oE 'D-[0-9]+' DECISIONS-AiMindShare-v1_0.md | sort -n | tail`), and that no parallel session started `m22-auto*`/`content_schedules`/`blog.generate` — adopt any existing contract, don't clobber.

---

## File structure

**Create:**
- `supabase/migrations/0027_m22_auto.sql` — `content_schedules` table; ALTER `content_queue` (+`site_id`,`schedule_id`,`article_id`,`fail_reason`,`attempts`,`step`; widen status check); SECURITY DEFINER RPCs (`upsert_content_schedule`, `enqueue_content_generation`, `claim_content_item`, `complete_content_item`, `fail_content_item`, `advance_content_pipeline`); `m22-content-scheduler` cron (PGlite-guarded); Realtime add on `content_queue`.
- `frontend/js/blog-pipeline.mjs` — pure deterministic stub: `generateBrief()`, `generateArticle()`, `suggestInternalLinks()`, `buildArticleSchema()` (+ reuses `content-seo.mjs`). Clearly-labelled placeholder prose; no provider.
- `workers/verify/m22autoprobe.mjs` — PGlite DB/RLS/pipeline/leak probe.
- `workers/verify/m22pipelineprobe.mjs` — Node pure-module probe.
- `frontend/m22-auto-content-cms.html` + `frontend/js/m22-auto-content.js` + `frontend/styles/m22-auto-content.css` — the auto-blog app.
- `doc/PROMPT-LIBRARY.md` — the named Session-23 input: the per-step prompt templates (brief/article/regen/SEO), documented so a real provider drops in later. (Task 13 on TASKS.md.)

**Modify:**
- `workers/worker.mjs` — add the `blog.generate` handler + router case (claims a `content_queue` row → runs `blog-pipeline.mjs` → `create_generated_article` RPC → review/auto-publish → mark item done; retry ×2; per-step `content_queue.step` updates).
- `supabase/seed.sql` — one `content_schedules` row + 2 queued `content_queue` keywords (labelled sample).
- `scripts/verify.sh` + `workers/verify/verify-status.json` (if present) — add the two probes.
- `DATA-SCHEMA-v1_0.md` — §9 Blog/CMS: add `content_schedules` + the `content_queue` extension (note M21 owns the base table, D-134).
- `DECISIONS-AiMindShare-v1_0.md` — `D-147…D-15x` (scaffold posture; content_queue extension; scheduler = cron-enqueues-jobs; auto_publish gate).
- `JOBS-AND-WORKERS-SPEC-v1_0.md` — flesh out the reserved `blog.generate` handler row + the `m22-content-scheduler` cron (replaces/【refines the row-104 `content.pipeline.advance` placeholder).
- `TASKS.md` — Session 23 close; check task 13 (PROMPT-LIBRARY).

---

## Task 1: Migration `0027` — content_schedules + content_queue extension + RPCs + cron

**Files:** Create `supabase/migrations/0027_m22_auto.sql`, skeleton `workers/verify/m22autoprobe.mjs`. Reference `0025_m22_content.sql` (operator-ceiling RLS, definer helpers), `0026_m21_seo.sql` (content_queue base), `0023_m20_funnels.sql` (guarded cron).

- [ ] **Step 1: Probe skeleton (red)** — PGlite boot from `m22probe.mjs`; load `0000,0001,0022_m19_sites,0025_m22_content,0026_m21_seo,0027`. Assert `content_schedules` exists + `content_queue` has new columns (`to_regclass` + `information_schema.columns`).
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: `content_schedules` table.** Columns: `workspace_id`, `site_id → sites`, `frequency_per_week int default 3`, `publish_days int[] default '{1,3,5}'`, `publish_hour int default 6`, `brand_voice text`, `niche_context text`, `target_words int default 1200`, `auto_publish bool default false`, `language text default 'en'`, `min_internal_links int default 2`, `seo_threshold int default 70`, `readability_threshold int default 50`, `active bool default true`, `last_run_at timestamptz`, timestamps. `unique(site_id)`. Operator-ceiling RLS (staff read/write, manager delete — mirror D-114). `set_updated_at` trigger.
- [ ] **Step 4: Extend `content_queue` (M21's base, D-134) — new migration, never edit 0026.**
  ```sql
  alter table public.content_queue add column if not exists site_id uuid references public.sites(id) on delete cascade;
  alter table public.content_queue add column if not exists schedule_id uuid references public.content_schedules(id) on delete set null;
  alter table public.content_queue add column if not exists article_id uuid references public.blog_articles(id) on delete set null;
  alter table public.content_queue add column if not exists fail_reason text;
  alter table public.content_queue add column if not exists attempts int not null default 0;
  alter table public.content_queue add column if not exists step text;   -- serp|brief|article|seo|links|image|schema|gate|publish
  -- widen the status check to the pipeline states (keep M21's originals)
  alter table public.content_queue drop constraint if exists content_queue_status_check;
  alter table public.content_queue add constraint content_queue_status_check
    check (status in ('queued','in_progress','generating','review','published','done','skipped','failed'));
  ```
- [ ] **Step 5: Worker-facing RPCs (SECURITY DEFINER, service_role).** `claim_content_item(p_id)` → `status='generating', attempts=attempts+1, step='brief'`; `complete_content_item(p_id, p_article uuid, p_status text)` → link `article_id`, set status (`review`|`published`), `step='publish'`; `fail_content_item(p_id, p_reason)` → `status='failed', fail_reason=p_reason`; `create_generated_article(p_ws,p_site,p_schedule,p_payload jsonb) returns uuid` → inserts a `blog_articles` draft (title/slug/content_html/meta/tags/faqs/seo_score/readability_score/word_count/keyword) from the pipeline payload, returns id. Grants: worker RPCs → `service_role` only.
- [ ] **Step 6: Authed RPCs.** `upsert_content_schedule(...)` (staff+) → content_schedules upsert; `enqueue_content_generation(p_queue_id)` (staff+) → inserts a `queued` `jobs` row `type='blog.generate'` `payload={content_queue_id,workspace_id}` (idempotency_key `bloggen-<queue_id>`), sets item `status='queued'`. Browser calls this instead of writing `jobs` directly.
- [ ] **Step 7: `advance_content_pipeline()` (service_role, cron body).** For each `active` schedule whose `last_run_at` is null or older than its per-`frequency_per_week` cadence AND has `queued` `content_queue` rows for its site, enqueue up to (frequency) `blog.generate` jobs (idempotent per queue row); stamp `last_run_at=now()`. Returns count enqueued. (Keywords arrive from M21 send-to-queue / bulk CSV / manual — the schedule paces generation, it doesn't invent keywords.)
- [ ] **Step 8: Cron + Realtime (PGlite-guarded).** `cron.schedule('m22-content-scheduler','0 6 * * *','select public.advance_content_pipeline();')`; `alter publication supabase_realtime add table public.content_queue`.
- [ ] **Step 9: Run probe — PASS** table/columns/enum-widen + RLS-on assertions.
- [ ] **Step 10: Commit (optional).**

## Task 2: Cross-tenant + role + pipeline-routing probe (Gate 1/2)
- [ ] Seed WS A/B. Assert B's staff cannot select/insert/update/delete A's `content_schedules`/`content_queue`; staff can write, manager deletes; worker RPCs reject non-service callers; `enqueue_content_generation` enqueues exactly one idempotent job. Run → PASS.

## Task 3: Pure pipeline stub — `blog-pipeline.mjs`
**Files:** Create `frontend/js/blog-pipeline.mjs`, `workers/verify/m22pipelineprobe.mjs`. Reference `content-seo.mjs` (reuse `scoreArticle`), `blog-render.mjs` (schema shape).
- [ ] **Step 1 (red):** import `generateBrief/generateArticle/suggestInternalLinks/buildArticleSchema`; assert `generateArticle(generateBrief({keyword:'medjool dates',targetWords:1000}),{brandVoice:'warm'})` returns `{title, content_html (has <h2>), excerpt, tags[]}`; `suggestInternalLinks(html, [{title,slug}])` inserts ≥1 `<a href="/blog/…">`; `scoreArticle` on the output ≥ 0; deterministic (same input→same output).
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement**, deterministic, no provider, ~150 lines. `generateBrief` → `{h1, meta_title, meta_desc, sections:[{h2,points[]}], faqs:[{q,a}], intent, word_count}` derived from keyword + niche. `generateArticle` → templated semantic HTML (intro, one `<h2>`+`<p>` per section, an FAQ block), **prefixed with an HTML comment `<!-- AiMindShare placeholder draft — real GPT generation pending an LLM provider (D-063 posture) -->`** so it's never mistaken for real content. `suggestInternalLinks` → text-match titles, insert up to N links. `buildArticleSchema` → Article + FAQ JSON-LD.
- [ ] **Step 4: PASS** + edge (empty keyword → no throw). Commit.

## Task 4: `blog.generate` worker handler
**Files:** Modify `workers/worker.mjs`. Reference the `campaign.send`/`sequence.step` handlers (claim → work → enqueue/complete).
- [ ] **Step 1:** Add `case 'blog.generate'` → `handleBlogGenerate(job)`: read `content_queue_id`; `claim_content_item`; load the queue row + its `content_schedules` settings + the site's published articles (for links); run `blog-pipeline.mjs` (brief→article→`scoreArticle`→`suggestInternalLinks`→**image step = flagged stub (no M35): leave `featured_image_url` null + note**→`buildArticleSchema`); `create_generated_article`; **quality gate**: if `seo_score >= seo_threshold && readability >= readability_threshold && auto_publish` → `publish_article` (published) else `complete_content_item(..., 'review')`. Meter **nothing** (stub) — add a `// TODO(provider): meter ai_tokens+image_gen here when a provider is wired (JOBS §6)`. On error → `fail_content_item` + rethrow so the worker's retry (×2) applies.
- [ ] **Step 2:** `m22autoprobe.mjs` drives the handler logic in-process (or asserts the RPC sequence): a queued item → generating → a `blog_articles` draft exists with `seo_score`/`schema`/≥1 internal link; `auto_publish=true`+passing gate → `published`; failing gate → `review`. Run → PASS. Commit.

## Task 5: Front end — pipeline board + schedules + bulk CSV
**Files:** Create `frontend/m22-auto-content-cms.html`, `js/m22-auto-content.js`, `styles/m22-auto-content.css`. Reference `m22-manual-content-cms.html` (shell/boot/mockup), `m11-pipeline.*` (kanban), `content-seo.mjs`, `blog-pipeline.mjs` (preview).
- [ ] **Pipeline board** — columns Queued / Generating / In review / Published from `content_queue`(+`blog_articles`), per-row `step` progress, retry-failed. Realtime refresh.
- [ ] **Schedules** — per-site `content_schedules` form (frequency, days, hour, brand voice, niche, target words, auto-publish vs review, language, min links, thresholds) via `upsert_content_schedule`.
- [ ] **Bulk CSV** — drag CSV → client parse → preview → batch-insert `queued` `content_queue` rows (staff RLS) → `enqueue_content_generation` each.
- [ ] **Add keyword + "Generate now"** → insert queue row + enqueue.
- [ ] **Review handoff** — generated `in_review` drafts link to the M22-manual review queue (`m22-manual-content-cms.html#/review`).
- [ ] **Ready-not-run banner** — a prominent labelled notice: "GPT article generation + DALL·E images are ready-not-run — pending an LLM provider (D-063) and M35 Creative Studio; drafts are placeholder content, nothing is billed."
- [ ] **States** default/empty/loading(no-shimmer)/error; both themes; responsive 360/768/1280 (verify **0 h-scroll** — watch the shared `.tbar`/kanban, per the M22-manual fix); mockup mode with labelled sample pipeline. Verify via preview; commit.

## Task 6: PROMPT-LIBRARY doc
- [ ] Create `doc/PROMPT-LIBRARY.md`: the per-step prompt templates (SERP-brief, article-from-brief, regen-with-feedback, SEO-rubric, internal-link) with input/output JSON contracts, so a chosen provider drops straight in. Mark it the realized Session-23 prerequisite. Check task 13 on TASKS.md.

## Task 7: Seed, verify wiring, docs, Gate-8, close
- [ ] Seed: one `content_schedules` + 2 queued keywords (labelled). 
- [ ] `verify.sh` + status: add `m22autoprobe` + `m22pipelineprobe`.
- [ ] DATA-SCHEMA §9: `content_schedules` + `content_queue` extension note.
- [ ] DECISIONS `D-147…D-15x`: scaffold posture (no provider/meter), content_queue extension (M21 base D-134), scheduler = cron-enqueues-jobs (D-127 kin), auto_publish quality gate, image step deferred to M35.
- [ ] JOBS §5/§6: refine the reserved `blog.generate` + `m22-content-scheduler` rows to the built contract.
- [ ] TASKS Session 23 close (Gate 3 = no billable action until provider; carry-overs = real GPT/DALL·E on provider+M35; distribution to M23/M24 stubbed). Check task 13.
- [ ] `bash scripts/verify.sh` all green; `bash scripts/gate8.sh` clean (justify any external hit). Commit.

---

## Self-review
- **Spec coverage:** queue board/schedules/CSV/worker-chain/cron/scaffold-flags all mapped to Tasks 1–7. Real GPT/DALL·E/Originality/distribution honestly deferred + flagged (not faked).
- **No metering** anywhere (stub) — Gate 3 satisfied by explicit note; `// TODO(provider)` marks the exact wire-in point.
- **Builds on, doesn't duplicate:** reuses M21 `content_queue`, M22-manual `blog_articles`/`publish_article`/`content-seo.mjs`; extends the shared `content_queue` via ALTER (never edits 0026).
- **Types consistent:** RPCs `upsert_content_schedule`/`enqueue_content_generation`/`claim_content_item`/`complete_content_item`/`fail_content_item`/`create_generated_article`/`advance_content_pipeline`; module exports `generateBrief`/`generateArticle`/`suggestInternalLinks`/`buildArticleSchema`.
