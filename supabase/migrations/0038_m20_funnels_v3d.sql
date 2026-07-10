-- ═══════════════════════════════════════════════════════════════════════════
-- 0038_m20_funnels_v3d.sql — M20 AI Funnel Studio, Phase 1 (LLM provider layer).
--
-- Everything here is additive: three nullable columns on funnel_blueprints, one
-- new workspace-scoped observability/rate-limit table, and a widened
-- save_funnel_blueprint (same drop+recreate pattern 0037 used for
-- convert_blueprint_to_funnel — appending trailing default params). ai_tokens
-- billing itself still goes through M03's existing meter_check/meter_increment
-- RPCs, called from the funnel-ai-generate Edge Function at runtime — this
-- migration does not touch M03 at all.
--
-- funnel_ai_generation_log is M20-owned (mirrors funnel_operations_log, 0032):
-- one row per funnel-ai-generate call (LLM blueprint, LLM clarify-round, or
-- deterministic fallback), giving the detailed per-generation usage log
-- (workspace/user/model/tokens/source) and the source of truth for the
-- per-workspace hourly rate limit on real LLM calls. DECISIONS D-186.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. funnel_blueprints — track how each blueprint was generated ───────────
alter table public.funnel_blueprints add column if not exists generation_source text check (generation_source in ('llm','deterministic'));
alter table public.funnel_blueprints add column if not exists llm_model text;
alter table public.funnel_blueprints add column if not exists tokens_used integer;

-- ── 2. funnel_ai_generation_log — per-call usage log + rate-limit source ────
create table if not exists public.funnel_ai_generation_log (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  user_id           uuid references auth.users(id) on delete set null,
  generation_source text not null check (generation_source in ('llm','llm_clarify','deterministic')),
  model             text,
  tokens_used       integer,
  prompt_length     integer,
  created_at        timestamptz not null default now()
);
create index if not exists funnel_ai_generation_log_ws_idx on public.funnel_ai_generation_log (workspace_id, created_at desc);

alter table public.funnel_ai_generation_log enable row level security;
-- Write side matches funnel_visits (D-094): no insert policy exists for
-- `authenticated` at all, so only the service role (the Edge Function's admin
-- client, which bypasses RLS) can write — even staff cannot insert directly.
-- Read side is broader than funnel_visits: any member can read this usage
-- log (is_member), not just staff+, since it's informational, not sensitive.
create policy funnel_ai_generation_log_sel on public.funnel_ai_generation_log for select using ( public.is_member(workspace_id) );

-- ── 3. funnel_ai_rate_limited — 20 real LLM calls / workspace / rolling hour ─
-- Only counts llm/llm_clarify rows — deterministic fallback calls are free (a
-- plain SQL RPC) and never need limiting, however many a workspace makes.
create or replace function public.funnel_ai_rate_limited(p_workspace uuid)
returns boolean language sql stable as $$
  select count(*) >= 20
  from public.funnel_ai_generation_log
  where workspace_id = p_workspace
    and generation_source in ('llm','llm_clarify')
    and created_at > now() - interval '1 hour';
$$;
grant execute on function public.funnel_ai_rate_limited(uuid) to authenticated, service_role;

-- ── 4. save_funnel_blueprint — widen with generation-tracking params ────────
-- Same drop+recreate-with-trailing-defaults pattern 0037 used for
-- convert_blueprint_to_funnel; every existing 3-4-arg caller keeps working
-- unchanged (the new params default to null).
drop function if exists public.save_funnel_blueprint(uuid, jsonb, jsonb, uuid);
create or replace function public.save_funnel_blueprint(
  p_ws uuid, p_answers jsonb, p_blueprint jsonb, p_blueprint_id uuid default null,
  p_generation_source text default null, p_llm_model text default null, p_tokens_used integer default null
)
returns public.funnel_blueprints language plpgsql security definer set search_path = public as $$
declare v_row public.funnel_blueprints;
begin
  if auth.uid() is not null and not public.has_role(p_ws, 'staff') then
    raise exception 'saving a blueprint requires staff+' using errcode = '42501';
  end if;
  if p_blueprint_id is not null then
    update public.funnel_blueprints set answers = p_answers, blueprint = p_blueprint,
      generation_source = p_generation_source, llm_model = p_llm_model, tokens_used = p_tokens_used
      where id = p_blueprint_id and workspace_id = p_ws and status = 'draft'
      returning * into v_row;
    if v_row.id is null then raise exception 'blueprint not found or not editable' using errcode = 'P0002'; end if;
  else
    insert into public.funnel_blueprints (workspace_id, created_by, answers, blueprint, generation_source, llm_model, tokens_used)
    values (p_ws, auth.uid(), p_answers, p_blueprint, p_generation_source, p_llm_model, p_tokens_used)
    returning * into v_row;
  end if;
  return v_row;
end $$;
revoke all on function public.save_funnel_blueprint(uuid, jsonb, jsonb, uuid, text, text, integer) from public;
grant execute on function public.save_funnel_blueprint(uuid, jsonb, jsonb, uuid, text, text, integer) to authenticated, service_role;
