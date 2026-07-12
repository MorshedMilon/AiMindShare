-- ═══════════════════════════════════════════════════════════════════════════
-- 0039_m22_bulk.sql — M22-auto real LLM generation + Bulk Content Creation
-- (D-190, D-191, D-192). Resolves the two OPEN provider gaps D-147 flagged for
-- article prose (NOT featured images — those stay deferred to M35, D-152,
-- unchanged). Additive only; 0025/0026/0027 are never edited.
--
-- Part A — LLM columns on blog_articles/content_schedules (this section)
-- Part B — site_brand_voice + the IslamicInfo review-lock trigger (D-191)
-- Part C — content_templates + content_batch_jobs + content_queue extension (D-192)
-- Part D — batch RPCs (create/preview/estimate/commit/schedule/rollback)
-- Part E — advance_content_pipeline() extended with the bulk per-tick cap (D-192)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Part A — LLM generation columns (mirrors D-186's funnel_blueprints pattern) ─
alter table public.blog_articles add column if not exists generation_source text
  check (generation_source is null or generation_source in ('llm','deterministic'));
alter table public.blog_articles add column if not exists llm_model   text;
alter table public.blog_articles add column if not exists tokens_used integer;

alter table public.content_schedules add column if not exists model text not null default 'claude-sonnet-5';
