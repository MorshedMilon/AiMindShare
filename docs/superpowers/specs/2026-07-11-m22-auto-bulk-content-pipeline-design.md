# M22-auto — Real LLM Generation + Bulk Content Creation Pipeline

Status: approved, ready for implementation planning
Date: 2026-07-11

## Context

M22-manual (CMS: Article Manager, editor, revisions, review queue) is done. M22-auto
already has a scaffold (migration `0027_m22_auto.sql`, D-147…D-152): per-site
`content_schedules`, an extended `content_queue`, worker RPCs
(`claim_content_item`/`complete_content_item`/`fail_content_item`/
`create_generated_article`), and a deterministic placeholder generator
(`frontend/js/blog-pipeline.mjs`) that turns a keyword into a scored, linked,
JSON-LD draft — clearly labelled as a placeholder. It was intentionally left
blocked on two things: **D-010** (heavy-job worker runtime, OPEN) and a real LLM
provider (D-147 scaffold posture).

Since then, M20 resolved Anthropic as a real, working provider (D-186/D-187) for
funnel copy, wired through Supabase Vault + the `ai_tokens` meter — but M22 was
never registered as a consumer.

This round closes both gaps and adds the new Bulk Content Creation capability
(spec section 11): resolve D-010, wire real LLM generation into the existing
scaffold, seed the three real sites (IslamicInfo.org, TravellyAI.com,
GeniuslyAI.com) with brand voice presets, and build the batch job builder,
template/variable system, preview/sampling, cost estimator, bulk scheduling,
status dashboard, bulk edit/reject, and rollback.

Explicitly **out of scope this round**: Decay Monitor, Internal Linking
visualization, Distribution, Reports, remaining Settings sections, and the
content-gap-report topic source — each needs its own external-integration
decision and gets its own spec later.

## Existing infrastructure this builds on (no reinvention)

- **`jobs` table + `workers/worker.mjs`** — the platform's canonical async
  contract (`JOBS-AND-WORKERS-SPEC-v1_0.md`). `worker.mjs` already has a
  `--once` flag ("claim one job, finish it, exit — probe mode") built for
  exactly the runtime this spec needs.
- **`content_schedules` + extended `content_queue`** + the worker RPCs from
  migration `0027` — unchanged, reused as-is.
- **`blog-pipeline.mjs`** — `compute_topic_cluster`, `build_serp_brief`,
  `score_article` (reuses the M22-manual on-page scorer, D-125),
  `suggest_internal_links`, `build_schema` all stay exactly as they are. Only
  `generate_article_with_ai(ctx)` — a stub that currently throws on purpose —
  gets a real implementation.
- **`_shared/llm.ts`'s Vault convention** — `ws_<workspace_id>__anthropic__api_key`
  → `plat__anthropic__api_key` fallback, read via
  `db.schema("vault").from("decrypted_secrets")`. Mirrored in a new Node-side
  adapter (the Deno edge function can't be imported directly into the Node
  worker process).
- **`ai_tokens` meter** (`meter_check`/`meter_increment`) — already tier-quota-
  aware platform-wide. No new meter kind.
- **`publish_due_articles()`** scheduled-publish cron (D-127, every 15 min) —
  reused as the mechanism behind bulk publish-date spreading.
- **`public.sites`** (migrations `0022`/`0028`) — extended with three real
  site rows instead of a new table.

## Phase 1 — D-010: GitHub Actions worker runtime (platform-wide)

Add `.github/workflows/worker-cron.yml`, scheduled every 5 minutes, running
`node workers/worker.mjs` against repo secrets `SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY`. `worker.mjs` gains one small addition: a
`--max=N` flag (default 10) so a single invocation claims and processes up to
N jobs before exiting, rather than shelling out to `--once` N separate times.
Stale-lease reclaim is already handled by the existing `*/1 * * * *` core
sweeper cron.

This is a **platform-wide** decision, not M22-specific — every other module's
"worker"-tier job type that's been sitting built-but-dormant (SEO crawls, bulk
pin rendering, weekly digests, CRM dedupe, GDPR export/erase, automation
execution, media auto-tagging, integration health checks) starts running for
real the moment this workflow merges. No per-module changes needed for those;
they already enqueue correctly, they just had nothing claiming their jobs.

## Phase 2 — Real LLM generation for M22

- New `workers/llm.mjs` (sibling to `worker.mjs`/`automation.mjs`): mirrors
  `_shared/llm.ts`'s Vault convention and
  fetch pattern, adapted for long-form article generation instead of funnel
  blueprints. Model configurable (see below), 20s timeout (longer than M20's
  10s — articles are longer than funnel blueprints).
- `generate_article_with_ai(ctx)` in `blog-pipeline.mjs` implemented for real:
  `ctx = { keyword, cluster, brief, targetWordCount, brandVoice, model }`.
  Prompts the LLM to write full article HTML following the brief's existing
  H2 outline and FAQs (kept deterministic — this bounds cost and keeps
  structure/SEO scaffolding under our control) in the site's brand voice, at
  the target word count. Returns `{ content_html, word_count, tokensUsed,
  model }`, or a `{ kind: 'unavailable' }` sentinel on no-key/timeout/error —
  never a thrown error the worker has to special-case.
- `worker.mjs`'s `blog.generate` handler tries `generate_article_with_ai`
  first; on `unavailable` it falls back to the existing deterministic
  `build_article_html` path, exactly like M20's fallback semantics.
- `meter_check('ai_tokens', …)` before calling, `meter_increment('ai_tokens',
  tokensUsed, 'm22-blog')` only after a successful real generation. Fallback
  path meters nothing (Gate-3: no billable action without a real provider
  call).
- `blog_articles` gains `generation_source text check (in ('llm',
  'deterministic'))`, `llm_model text`, `tokens_used integer` — mirrors the
  exact pattern migration `0038` used for `funnel_blueprints`.
- Model selection: `content_schedules` gains a `model` column, default
  `'claude-sonnet-5'` (your call: long-form quality matters more here than
  for funnel snippets), selectable down to a cheaper Haiku model per schedule
  or per batch job.

## Phase 3 — Site seeding + brand voice

- `public.sites` gains three real rows: IslamicInfo.org, TravellyAI.com,
  GeniuslyAI.com (seed.sql), each under their owning workspace.
- New `site_brand_voice` table: `site_id` (PK/FK), `tone_prompt`,
  `review_required boolean`, `updated_at`. Seeded: IslamicInfo.org →
  `review_required = true`; TravellyAI/GeniuslyAI → `false` (editable by
  managers via Settings, like the rest of `content_schedules`).
- `generate_article_with_ai` reads `tone_prompt` into its system prompt as
  the brand-voice instruction.
- **Server-side enforcement, not just UI**: the `blog.generate` handler
  checks `site_brand_voice.review_required` and forces `step = 'review'`
  regardless of `content_schedules.auto_publish` or quality-gate scores when
  true. A bulk job, a misconfigured schedule, or a future UI bug cannot make
  IslamicInfo.org content auto-publish — the gate lives in the code path that
  actually flips status, not in a toggle a form could skip.

## Phase 4 — Bulk Content Creation (new tables, extended `content_queue`)

**New tables**
- `content_templates` — `id, site_id, name, prompt_template (text with [var]
  slots), variable_defs (jsonb: [{name, label, sample_values[]}]), category,
  created_at`.
- `content_batch_jobs` — `id, workspace_id, site_id, name, topic_source
  ('manual'|'csv'|'ai_seed'), template_id (nullable), model, word_count_min,
  word_count_max, total_items, status ('draft'|'estimating'|'previewing'|
  'queued'|'running'|'paused'|'completed'|'rolled_back'),
  scheduled_spread_days, created_by, created_at, updated_at`.

**Extended (not duplicated) `content_queue`** — same `add column if not
exists` pattern migration `0027` already used on top of `0026`: `batch_job_id`,
`template_id`, `variables (jsonb)`.

**New RPCs**
- `create_batch_job(...)` — staff+, inserts a `draft` batch job.
- `generate_batch_preview(batch_job_id, n=3)` — generates a handful of sample
  items immediately for review before committing the rest.
- `estimate_batch_cost(batch_job_id)` — pure calculation (avg tokens per
  word-count target × item count × model rate), no provider call.
- `commit_batch_job(batch_job_id)` — expands the topic list (manual/CSV/
  AI-seed-generated) into `content_queue` rows tagged with `batch_job_id`;
  runs the duplicate/cannibalization check per topic (pgvector cosine
  similarity against existing `blog_articles.embedding` for that site — flags,
  doesn't block) before insert.
- `schedule_batch_publish_spread(batch_job_id, start_date, per_day)` — once
  items are approved, evenly spaces `blog_articles.scheduled_at` across the
  requested window and flips status to `scheduled`. `publish_due_articles()`
  does the rest — no new cron.
- `rollback_batch_job(batch_job_id)` — unpublishes/cancels every article this
  batch produced; does **not** hard-delete (drafts stay for inspection,
  matching the platform's no-hard-delete-by-default posture).

**Bulk safeguard** (your "separate lane" call): an hourly counter on
`blog.generate` jobs tagged `source = 'm22-bulk'` (mirrors M20's own
`source = 'm20-studio'` circuit breaker, sized independently). `commit_batch_job`
enqueues what fits within the cap now; the rest stays `queued` and drains via
the existing `advance_content_pipeline()` scheduler cron on later ticks — no
separate pacing engine needed, batch items ride the same lane regular
auto-blog content already uses.

## UI (Bulk Content Creation — spec section 11)

Job Builder wizard (Source → Template (optional) → Site/word-count/model →
Review & Commit) → Batch Preview panel (sample cards with a regenerate
control) → inline Cost Estimator on the Review & Commit step → Bulk Status
Dashboard (progress bar + per-item table: status, score, duplicate-flag,
filterable) → Bulk Edit/Reject toolbar (multi-select, filtered
approve/reject/regenerate) → Batch Rollback (confirmation modal listing
affected article counts by current status).

## Error handling

- No LLM key configured → every item falls back to the deterministic
  placeholder (`generation_source = 'deterministic'`), with a banner on the
  Bulk Status Dashboard.
- `ai_tokens` quota exhausted mid-batch → remaining items stay `queued`
  (same banner), resume automatically once quota renews — no partial-batch
  corruption.
- Duplicate/cannibalization flagged → item still generates but is tagged and
  filterable, never silently dropped — a human makes the call.
- IslamicInfo.org's `review_required` gate is enforced in the RPC/worker
  layer, unconditionally.

## Testing / verification

- Extend the M22 probe: `generate_article_with_ai` happy-path + fallback-on-
  no-key path (test double, no real Anthropic key needed in CI/local verify),
  correct meter increments on the real path and their absence on fallback,
  full batch lifecycle (create → preview → commit → generate → review →
  schedule → publish → rollback), the IslamicInfo forced-review invariant
  under a bulk job specifically, duplicate-check flagging a seeded
  near-duplicate, and the hourly bulk safeguard capping enqueue with the
  remainder draining on the next scheduler tick.
- Preview-verify: Bulk Content Creation UI renders, 0 horizontal scroll at
  375/1200 in both themes, no console errors; step a small manual-list batch
  through the full wizard against the deterministic fallback (no real
  Anthropic key exists in this dev environment) to prove the wiring, not
  prose quality.

## Out of scope / deferred to later rounds

- Decay Monitor (needs a GSC/analytics integration — separate spec).
- Internal Linking silo view / orphan finder UI (the underlying data already
  flows via `cluster_slug`/`pillar_slug`; visualization deferred).
- Distribution (social/Pinterest/newsletter).
- Reports (content coverage, SEO trends, decay report, publishing velocity).
- Content-gap-report topic source (needs competitor/SERP tracking).
- Non-Anthropic model providers.
- Featured images — unchanged D-152 deferral to M35.
- BYOK UI — unchanged from the M20 posture.

## Open items carried into implementation planning

None — every product/architecture decision above (D-010 runtime choice, batch
volume, site seeding, the Islamic-content gate, topic sources, template-system
inclusion, the quota-lane approach, and model choice) was confirmed during
brainstorming.

## Operational note

Ships with no key configured — every generation runs on the deterministic
fallback until the same one-time Vault step from the M20 spec is run (or a
site-specific override key is added later). No code change needed after that.
