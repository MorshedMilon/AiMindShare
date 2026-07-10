-- ═══════════════════════════════════════════════════════════════════════════
-- 0037_m29_affiliate_hub.sql — M29 Affiliate Hub, Phase 1a foundation + the
-- Funnels↔Affiliate-Hub bridge (D-182…).
--
-- Architecture (per the master prompt + user's own split): Funnels (M20) is
-- the EXECUTION layer (builds/generates/tests/publishes conversion paths).
-- Affiliate Hub (M29) is the BUSINESS layer (offer vault, networks, tracking
-- links, disclosures, earnings). They never merge — connected only by an
-- explicit "Create Funnel from Offer" handoff. M29 already has a full PRD
-- (doc/PRD/PRD_M29_Affiliate_Hub.md) covering link cloaking/rotation, Amazon
-- PA-API, live multi-network earnings sync, and AI content generators — all
-- of that is its own module-sized workstream and explicitly OUT of this
-- migration. This ships only the real, verifiable slice: an offer vault, a
-- manual network list (no live API — that's a stub, not faked), a disclosure
-- template library, and the one-directional bridge into M20's existing AI
-- Funnel Studio.
--
-- Same additive posture as every other migration here: new tables + one
-- nullable FK column on `funnels`. Nothing existing is renamed or removed.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. affiliate_offers (D-182) — the offer vault ────────────────────────────
create table if not exists public.affiliate_offers (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  created_by         uuid references auth.users(id) on delete set null,
  name               text not null,
  network            text,                     -- free-form: "ClickBank"/"Amazon"/"CPA"/"Custom" — no network catalog yet
  vendor_url         text,
  niche              text,
  commission_note    text,
  compliance_category text not null default 'general' check (compliance_category in ('general','health','finance','income','sensitive')),
  disclosure_text    text,
  promo_assets       jsonb not null default '[]'::jsonb,
  status             text not null default 'active' check (status in ('active','paused','archived')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists affiliate_offers_ws_idx on public.affiliate_offers (workspace_id, created_at desc);

alter table public.affiliate_offers enable row level security;
create policy affiliate_offers_sel on public.affiliate_offers for select using ( public.is_member(workspace_id) );
create policy affiliate_offers_ins on public.affiliate_offers for insert with check ( public.has_role(workspace_id,'staff') );
create policy affiliate_offers_upd on public.affiliate_offers for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy affiliate_offers_del on public.affiliate_offers for delete using ( public.has_role(workspace_id,'staff') );

create or replace function public.affiliate_offers_set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists affiliate_offers_touch on public.affiliate_offers;
create trigger affiliate_offers_touch before update on public.affiliate_offers
  for each row execute function public.affiliate_offers_set_updated_at();

-- ── 2. affiliate_networks (D-182) — manual list, no live API this pass ──────
-- `status` is a self-reported label ("connected") the user sets by hand — there
-- is no API/OAuth wiring behind it yet. Same honesty posture as every other
-- unbuilt-integration stub in this repo (D-063): a real feature, clearly
-- scoped, not a fake "connected" badge implying something that doesn't exist.
create table if not exists public.affiliate_networks (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  status       text not null default 'manual' check (status in ('manual','connected')),
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists affiliate_networks_ws_idx on public.affiliate_networks (workspace_id, created_at desc);

alter table public.affiliate_networks enable row level security;
create policy affiliate_networks_sel on public.affiliate_networks for select using ( public.is_member(workspace_id) );
create policy affiliate_networks_ins on public.affiliate_networks for insert with check ( public.has_role(workspace_id,'staff') );
create policy affiliate_networks_upd on public.affiliate_networks for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy affiliate_networks_del on public.affiliate_networks for delete using ( public.has_role(workspace_id,'staff') );

-- ── 3. affiliate_disclosure_templates (D-182) — reusable disclosure snippets ─
create table if not exists public.affiliate_disclosure_templates (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  name                text not null,
  compliance_category text not null default 'general' check (compliance_category in ('general','health','finance','income','sensitive')),
  body                text not null,
  created_at          timestamptz not null default now()
);
create index if not exists affiliate_disclosure_templates_ws_idx on public.affiliate_disclosure_templates (workspace_id, created_at desc);

alter table public.affiliate_disclosure_templates enable row level security;
create policy affiliate_disclosure_templates_sel on public.affiliate_disclosure_templates for select using ( public.is_member(workspace_id) );
create policy affiliate_disclosure_templates_ins on public.affiliate_disclosure_templates for insert with check ( public.has_role(workspace_id,'staff') );
create policy affiliate_disclosure_templates_upd on public.affiliate_disclosure_templates for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy affiliate_disclosure_templates_del on public.affiliate_disclosure_templates for delete using ( public.has_role(workspace_id,'staff') );

-- ── 4. the bridge — funnels.source_offer_id (D-182) ─────────────────────────
-- Nullable: every pre-existing funnel keeps source_offer_id = null and is
-- entirely unaffected. Set only when a funnel is generated via "Create Funnel
-- from Offer" out of an M29 offer.
alter table public.funnels add column if not exists source_offer_id uuid references public.affiliate_offers(id) on delete set null;
create index if not exists funnels_source_offer_idx on public.funnels (source_offer_id) where source_offer_id is not null;

-- convert_blueprint_to_funnel gains an optional p_source_offer_id (default null,
-- backward compatible — every existing call site keeps working unchanged).
-- The old 3-arg signature must be dropped first: adding a 4th parameter to
-- `create or replace` creates a NEW overload instead of replacing it (Postgres
-- matches by parameter type signature), which would leave both versions
-- around and make a 2-positional-arg call ambiguous.
drop function if exists public.convert_blueprint_to_funnel(uuid, text, uuid);
create or replace function public.convert_blueprint_to_funnel(p_blueprint_id uuid, p_name text, p_site_id uuid default null, p_source_offer_id uuid default null)
returns public.funnels language plpgsql security definer set search_path = public as $$
declare v_bp public.funnel_blueprints; v_f public.funnels; v_step jsonb; v_order int := 0;
begin
  select * into v_bp from public.funnel_blueprints where id = p_blueprint_id;
  if v_bp.id is null then raise exception 'blueprint not found' using errcode = 'P0002'; end if;
  if v_bp.status = 'converted' then raise exception 'blueprint already converted' using errcode = '22023'; end if;
  if auth.uid() is not null and not public.has_role(v_bp.workspace_id, 'staff') then
    raise exception 'creating a funnel requires staff+' using errcode = '42501';
  end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'funnel name is required' using errcode = '22023'; end if;
  if p_source_offer_id is not null then
    if not exists (select 1 from public.affiliate_offers where id = p_source_offer_id and workspace_id = v_bp.workspace_id) then
      raise exception 'source offer not found in this workspace' using errcode = 'P0002';
    end if;
  end if;

  insert into public.funnels (workspace_id, name, status, site_id, funnel_type, settings, source_offer_id)
  values (v_bp.workspace_id, btrim(p_name), 'draft', p_site_id, v_bp.blueprint->>'funnel_type', '{}'::jsonb, p_source_offer_id)
  returning * into v_f;

  for v_step in select * from jsonb_array_elements(coalesce(v_bp.blueprint->'steps', '[]'::jsonb))
  loop
    insert into public.funnel_steps (workspace_id, funnel_id, step_order, step_type, name, config)
    values (v_bp.workspace_id, v_f.id, v_order, (v_step->>'step_type')::public.funnel_step_type,
            v_step->>'role_label', jsonb_build_object('cta', v_step->>'cta_direction', 'purpose', v_step->>'purpose'));
    v_order := v_order + 1;
  end loop;

  update public.funnel_blueprints set status = 'converted', funnel_id = v_f.id where id = p_blueprint_id;
  return v_f;
end $$;
revoke all on function public.convert_blueprint_to_funnel(uuid, text, uuid, uuid) from public;
grant execute on function public.convert_blueprint_to_funnel(uuid, text, uuid, uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. funnel_compliance_scan(p_funnel) — Funnels' Compliance tab (D-182).
-- Deterministic keyword/pattern scanner over the funnel's OWN generated copy
-- (funnel_steps.name/config->>cta/config->>purpose) — same "deterministic
-- today" posture as recommend_funnel_blueprint (D-173) and
-- funnel_recommendations (D-179). This is a real lint-style feature (a fixed
-- rule table of risky phrase patterns per category), not NLP/LLM claim
-- understanding — this repo has no provider for that yet (D-063).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.funnel_compliance_scan(p_funnel uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ws uuid;
  v_findings jsonb := '[]'::jsonb;
  v_step record;
  v_text text;
  v_rule record;
  -- Fixed rule table: (category, pattern, severity, message, rewrite_hint).
  -- Patterns are case-insensitive substrings/regexes over the step's own copy.
  rules jsonb := '[
    {"category":"income",   "pattern":"guaranteed income|get rich quick|make \\$[0-9,]+ (a|per) (day|week)|quit your job",
     "severity":"high", "message":"Unrealistic/guaranteed income claim — high compliance risk on ad platforms.",
     "rewrite_hint":"Describe potential, not guarantees — e.g. \"designed to help you build income\" rather than \"guaranteed income\"."},
    {"category":"health",   "pattern":"cure[sd]?|miracle (cure|fix)|lose [0-9]+ ?(lbs|pounds|kg) in|melt (fat|belly fat)",
     "severity":"high", "message":"Unrealistic/medical outcome claim — high compliance risk (health category).",
     "rewrite_hint":"Avoid cure/miracle language and specific timeframes — describe the approach, not a guaranteed result."},
    {"category":"finance",  "pattern":"risk[- ]?free|no risk|100% guaranteed returns|double your money",
     "severity":"high", "message":"Unrealistic financial-outcome claim — high compliance risk (finance category).",
     "rewrite_hint":"Financial outcomes vary — avoid \"risk-free\"/\"guaranteed returns\" language."},
    {"category":"general",  "pattern":"only [0-9]+ (left|spots|seats) (in stock )?- act now|hurry,? (offer|sale) ends (today|soon)|last chance ever",
     "severity":"medium", "message":"Fake-urgency phrasing — flagged as a soft compliance/trust risk.",
     "rewrite_hint":"Use urgency only if it is real (an actual deadline/stock count) or soften to \"limited availability\"."},
    {"category":"general",  "pattern":"100% (results|success)|works for everyone|no effort required",
     "severity":"medium", "message":"Absolute outcome claim (\"100%\"/\"everyone\") — flagged as overpromising.",
     "rewrite_hint":"Qualify the claim — e.g. \"most members see...\" instead of \"100% of people\"."}
  ]'::jsonb;
begin
  select workspace_id into v_ws from public.funnels where id = p_funnel;
  if v_ws is null then raise exception 'funnel not found' using errcode = 'P0002'; end if;
  if auth.uid() is not null and not public.is_member(v_ws) then
    raise exception 'not a member of this workspace' using errcode = '42501';
  end if;

  for v_step in
    select id, name, step_order, coalesce(config->>'cta','') as cta, coalesce(config->>'purpose','') as purpose
    from public.funnel_steps where funnel_id = p_funnel order by step_order
  loop
    v_text := lower(coalesce(v_step.name,'') || ' ' || v_step.cta || ' ' || v_step.purpose);
    for v_rule in select * from jsonb_to_recordset(rules) as r(category text, pattern text, severity text, message text, rewrite_hint text)
    loop
      if v_text ~ v_rule.pattern then
        v_findings := v_findings || jsonb_build_array(jsonb_build_object(
          'step_id', v_step.id, 'step_name', v_step.name, 'category', v_rule.category,
          'severity', v_rule.severity, 'message', v_rule.message, 'rewrite_hint', v_rule.rewrite_hint
        ));
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'findings', v_findings,
    'high_count', (select count(*) from jsonb_array_elements(v_findings) f where f->>'severity' = 'high'),
    'medium_count', (select count(*) from jsonb_array_elements(v_findings) f where f->>'severity' = 'medium'),
    'clear', jsonb_array_length(v_findings) = 0
  );
end $$;
revoke all on function public.funnel_compliance_scan(uuid) from public;
grant execute on function public.funnel_compliance_scan(uuid) to authenticated, service_role;
