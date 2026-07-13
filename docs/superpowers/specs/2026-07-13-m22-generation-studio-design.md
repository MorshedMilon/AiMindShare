# M22 Generation Studio — Design Spec

**Date:** 2026-07-13
**Status:** Approved by user, pending spec-file review
**Migration:** 0040 (next free after 0039_m22_bulk.sql)
**Decisions:** D-193+ (next free after D-192)

## Background

The user requested a large extension to M22 Content/CMS covering six subsystems:
Generation Studio, Content Score Engine extensions, Auto-Rewrite Loop,
Sitemap-Aware Internal Linking, Deep Research/Citation Layer, and Media
Auto-Attach. During brainstorming we identified this as six largely-independent
subsystems and decomposed it — see "Deferred subsystems" below. **This spec
covers only the Generation Studio core**: the keyword→article linking fix and
the interactive generation pipeline.

Two conflicts with prior locked decisions were surfaced and resolved during
brainstorming:

- **D-134 gap**: M21's `content_queue` (the keyword→M22 bridge) carries only
  keyword *text*, not a durable link back to `keywords.id` — so volume/
  difficulty/intent don't travel forward today. This spec adds that link.
- **D-152**: Media Auto-Attach (image generation) was explicitly deferred to
  M35 Creative Studio. This spec does not touch it; it stays deferred.

## Deferred subsystems (separate future specs)

1. Content Score Engine extensions (keyword density range, heading compliance,
   competitor word-count, freshness/citation recency) — extends the existing
   `content-seo.mjs` engine, not built here.
2. Auto-Rewrite Loop — needs a plagiarism/AI-detection provider decision first.
3. Sitemap-Aware Internal Linking — needs a `site_pages` crawler + embeddings.
4. Deep Research/Citation Layer — needs a web-search provider decision.
5. Media Auto-Attach — stays deferred to M35 (D-152) unless formally reopened.

## Data model (migration 0040_m22_generation_studio.sql)

```sql
alter table content_queue
  add column if not exists keyword_id uuid references keywords(id);
-- nullable: existing rows predate this link; populated going forward when
-- Studio queues a keyword by id instead of by raw text.

create table generation_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  article_id uuid not null references blog_articles(id),
  keyword_id uuid references keywords(id),
  stage text not null check (stage in
    ('research','brief','outline','draft','auto_link','score','ready_for_review')),
  status text not null default 'pending' check (status in
    ('pending','running','complete','failed')),
  stage_output jsonb,
  used_fallback boolean not null default false,
  error text,
  error_type text check (error_type in ('transient','permanent')),
  attempts int not null default 1,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- concurrency guard: a second Retry while one attempt is already in-flight
-- for the same article+stage is rejected/no-op, not a duplicate row.
create unique index generation_jobs_one_pending_per_stage
  on generation_jobs(article_id, stage) where status = 'pending';

create table content_scores (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references blog_articles(id),
  score int not null,
  factor_breakdown jsonb not null,
  scored_at timestamptz not null default now()
);
```

One `generation_jobs` row per stage *attempt* — retry inserts a fresh row for
that stage rather than mutating the failed one, so the tracker UI can show
full history. Prior stages' `stage_output` is left untouched by a retry.

**Fallback propagation:** any stage that ran using the deterministic fallback
(no Anthropic key configured for the workspace) sets `used_fallback: true` on
its own `generation_jobs` row. `blog_articles` must also end up flagged if
*any* stage in the run used fallback — not just Draft — since Reports (SEO
Score Trends, Decay Report) must not silently mix fallback content with real
LLM output. Exact mechanism (new boolean vs. extending the existing
`blog_articles.generation_source` column from migration 0039) is an
implementation-time decision: inspect `generation_source`'s current value set
first; only add a new column if it can't represent "mixed/fallback" cleanly.

**Error classification:** stage failures set `error_type`:
- `transient` — timeouts, 5xx, rate limits. UI shows a **Retry** button.
- `permanent` — invalid API key format, auth rejection, malformed payload. UI
  shows "Check API key configuration" instead of Retry (Retry would not help).

## Pipeline architecture

**Dispatcher:** a new cron tick (`m22-generation-studio`, every 1 minute —
tighter than the existing 15-min content-scheduler since this is an
interactive, user-watched flow) scans `generation_jobs` for `pending` rows and
either invokes the matching Edge Function directly, or — for `draft` — leaves
the row for the existing GH Actions worker to claim (same
`claim_content_item`-style claim pattern, applied to `generation_jobs`
instead of `content_queue`).

**Runtime split** (Edge Functions have a short timeout; full-article Draft
generation was already routed off Edge Functions once, for D-190, to avoid
exactly this):
- Research, Brief, Outline, Auto-Link, Score → Supabase Edge Functions.
- Draft → claimed and run by the existing GH Actions cron worker
  (`workers/llm.mjs`'s `callAnthropicForArticle`, 20s timeout,
  `claude-sonnet-5` default).

**Stage behavior:**
- **Research, Auto-Link** — honest no-op stubs. Mark `complete` immediately
  with `stage_output: {stub: true}`, `used_fallback: false`. No LLM call, no
  real work — their real implementations slot in later (Deep Research /
  Sitemap-Aware Linking specs) without changing the state machine shape.
- **Brief, Outline** — Edge Functions, reuse the `_shared/llm.ts` pattern
  (Vault-stored Anthropic key, `claude-3-5-haiku`, ~10s timeout). No key
  configured → deterministic fallback text, `used_fallback: true`, stage
  still completes (never a hard error — D-063 posture). Key configured but
  the call errors/times out → stage `failed` with `error_type` set.
- **Draft** — worker-claimed, writes to `blog_articles.content_html` with
  `status='draft'`. Same fallback/failure semantics as above.
- **Score** — Edge Function, calls the existing `content-seo.mjs` scoring
  logic (verify during implementation that it's DOM-free and can run
  server-side; extract if not) and inserts exactly one `content_scores` row
  for the article, on successful completion only.
- **Ready for Review** — terminal stage; flips `blog_articles.status` so the
  article surfaces in the existing Review Queue. No changes needed there.

**Retry:** a failed stage's Retry button (shown only when `error_type =
'transient'`) inserts a new `pending` `generation_jobs` row for that stage.
The unique partial index prevents a second concurrent Retry click from
creating a duplicate in-flight row for the same article+stage.

## Frontend / UX

- New **Generation Studio** page in the M22 nav (alongside List, Editor,
  Review, Taxonomy, Bulk).
- **Landing view**: keyword picker sourced from M21's `keywords` table
  (joined via the new `keyword_id`), filtered to keywords not already in
  `content_queue`, showing volume/difficulty/intent so the choice is
  informed.
- Selecting a keyword and clicking **Generate** creates the `content_queue`
  row (with `keyword_id` set), a `blog_articles` stub row, and the first
  `generation_jobs` row (`stage='research', status='pending'`), then
  navigates to the **live tracker view**.
- **Live tracker**: 7 stage pills (Research→Brief→Outline→Draft→Auto-Link→
  Score→Ready for Review), each pending/running/complete/failed, polling
  `generation_jobs` every few seconds — matching the existing poll style
  already used for autosave in `m22-content.js` (no new Supabase Realtime
  subscription; nothing else in M22 uses one).
- Failed pill shows the error inline; **Retry** button only if
  `error_type='transient'`, otherwise a "Check API key configuration"
  message linking to workspace LLM settings.
- Reaching **Ready for Review** shows a "View in Review Queue" link. No
  changes to the existing Review Queue UI (it already filters `blog_articles`
  by status).

## Testing

Extend the existing M22 probe suite (currently 46/46 + 22/22) with:
- `keyword_id` FK migration correctness (nullable, populated on new queue
  entries only).
- Dispatcher stage-transition logic, including the Draft handoff to the
  worker claim path.
- Retry inserts a fresh job row without mutating prior stage outputs, and a
  second concurrent Retry is rejected/no-ops (unique index enforced).
- `used_fallback` is set correctly per stage and propagates to the article
  level when any stage in the run used fallback.
- `error_type` classification: transient vs. permanent errors route to the
  correct UI treatment.
- Score writes **exactly one** `content_scores` row per article per full
  pipeline run (asserted at Ready-for-Review) — regardless of how many
  stage-level retries happened anywhere in the pipeline, including retries
  of the Score stage itself. Not one row per retry attempt.
- Ready-for-Review → Review Queue handoff.

Full `verify.sh` + Gate-8 must stay green. Preview-check the new Studio page
(0 horizontal scroll, both themes), matching prior M22 work.

## Open items to resolve during implementation planning

1. Whether `content-seo.mjs`'s scoring logic is DOM-free and can run
   server-side as-is for the Score Edge Function, or needs extraction first.
2. Exact shape of article-level fallback flagging (extend
   `blog_articles.generation_source` vs. add a new column) — depends on
   `generation_source`'s current value set.
