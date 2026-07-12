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

-- ── Part A (cont.) — create_generated_article now also persists the LLM fields ──
-- create or replace over 0027's version: same slug-dedup/insert contract, three new
-- payload keys read straight from p_payload. Safe to replace (D-148 established that
-- functions in this pipeline evolve via create-or-replace; only tables are frozen).
create or replace function public.create_generated_article(
  p_ws uuid, p_site uuid, p_schedule uuid, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_slug text; v_base text; v_n int := 1;
begin
  v_base := coalesce(nullif(p_payload->>'slug',''), 'auto-article');
  v_slug := v_base;
  while exists (select 1 from public.blog_articles where site_id = p_site and slug = v_slug) loop
    v_slug := v_base || '-' || v_n; v_n := v_n + 1;
  end loop;

  insert into public.blog_articles (
    workspace_id, site_id, keyword, title, slug, excerpt, content_html,
    meta_title, meta_desc, tags, schema, seo_score, readability_score, word_count,
    cluster_slug, pillar_slug, generation_source, llm_model, tokens_used, status)
  values (
    p_ws, p_site,
    p_payload->>'keyword',
    coalesce(nullif(p_payload->>'title',''), 'Untitled'),
    v_slug,
    p_payload->>'excerpt',
    p_payload->>'content_html',
    p_payload->>'meta_title',
    p_payload->>'meta_desc',
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_payload->'tags') x), '{}'),
    coalesce(p_payload->'schema', '{}'::jsonb),
    nullif(p_payload->>'seo_score','')::int,
    nullif(p_payload->>'readability_score','')::int,
    coalesce(nullif(p_payload->>'word_count','')::int, 0),
    p_payload->>'cluster_slug',
    p_payload->>'pillar_slug',
    nullif(p_payload->>'generation_source',''),
    nullif(p_payload->>'llm_model',''),
    nullif(p_payload->>'tokens_used','')::int,
    'draft')
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.create_generated_article(uuid,uuid,uuid,jsonb) from public;
grant execute on function public.create_generated_article(uuid,uuid,uuid,jsonb) to service_role;
