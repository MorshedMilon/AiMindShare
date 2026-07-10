-- ═══════════════════════════════════════════════════════════════════════════
-- 0034_m20_funnels_v3a.sql — M20 Funnels v3, Phase A (foundations for the AI
-- Funnel Studio) + Phase B (the studio's deterministic blueprint engine).
--
-- Everything here is additive: a nullable column, one new workspace-scoped
-- table, and pure functions. Nothing existing is renamed, removed, or has its
-- behavior changed. `funnel_step_type` already covers every step the studio
-- needs to generate (optin/sales/order/upsell/downsell/thankyou, from
-- 0023) — no enum change required to ship the blueprint engine.
--
-- DECISIONS D-171…D-174.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. funnels.funnel_type (D-171) ───────────────────────────────────────────
-- Nullable: every pre-existing funnel keeps funnel_type = null (manually built,
-- never ran the studio) and continues to work exactly as before.
alter table public.funnels add column if not exists funnel_type text;
alter table public.funnels drop constraint if exists funnels_funnel_type_chk;
alter table public.funnels add constraint funnels_funnel_type_chk check (funnel_type is null or funnel_type in (
  'lead_magnet','webinar','booking','application','vsl','direct_checkout',
  'tripwire','low_ticket','course_membership','product_launch','quiz','challenge'
));

-- ── 1. funnel_blueprints (D-172) — one row per AI Funnel Studio session ──────
create table if not exists public.funnel_blueprints (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by   uuid references auth.users(id) on delete set null,
  answers      jsonb not null default '{}'::jsonb,
  blueprint    jsonb,
  status       text not null default 'draft' check (status in ('draft','approved','converted')),
  funnel_id    uuid references public.funnels(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists funnel_blueprints_ws_idx on public.funnel_blueprints (workspace_id, created_at desc);
create index if not exists funnel_blueprints_funnel_idx on public.funnel_blueprints (funnel_id);

alter table public.funnel_blueprints enable row level security;
-- Same shape as every other M20 table: any member can read, staff+ can write.
create policy funnel_blueprints_sel on public.funnel_blueprints for select using ( public.is_member(workspace_id) );
create policy funnel_blueprints_ins on public.funnel_blueprints for insert with check ( public.has_role(workspace_id,'staff') );
create policy funnel_blueprints_upd on public.funnel_blueprints for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy funnel_blueprints_del on public.funnel_blueprints for delete using ( public.has_role(workspace_id,'staff') );

create or replace function public.funnel_blueprints_set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists funnel_blueprints_touch on public.funnel_blueprints;
create trigger funnel_blueprints_touch before update on public.funnel_blueprints
  for each row execute function public.funnel_blueprints_set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. recommend_funnel_blueprint(answers) — the AI Funnel Studio's recommendation
-- engine (D-173). DETERMINISTIC RULES TODAY, same posture as every other
-- "AI" feature already shipped in this codebase (D-063 M13 automation
-- builder, D-092 M16 AI copywriter, D-103 M22 content generator) — no LLM
-- provider is decided anywhere in AiMindShare yet, so this ships as a real,
-- working decision matrix over the structured answers instead of faking a
-- model call. SINGLE SEAM for the future: when a provider is chosen, only
-- this function's body changes — its signature (jsonb in, jsonb out) and
-- every caller (recommend/save/convert below) stay identical.
--
-- Pure function: no table reads, no side effects, safe to call unauthenticated
-- from the wizard before a workspace/funnel even exists yet.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.recommend_funnel_blueprint(p_answers jsonb)
returns jsonb language plpgsql immutable as $$
declare
  v_objective text := p_answers->>'objective';
  v_offer_type text := p_answers->>'offer_type';
  v_price numeric := coalesce((p_answers->>'offer_price')::numeric, 0);
  v_has_lead_magnet boolean := coalesce((p_answers->>'has_lead_magnet')::boolean, false);
  v_checkout_required boolean := coalesce((p_answers->>'checkout_required')::boolean, v_price > 0);
  v_traffic text := p_answers->>'traffic_source';
  v_awareness text := p_answers->>'audience_awareness';
  v_type text;
  v_reasoning text;
  v_steps jsonb;
  v_bump boolean; v_upsell boolean; v_downsell boolean;
  v_tests jsonb; v_checklist jsonb;
begin
  -- ── funnel type decision (priority-ordered, first match wins) ──
  v_type := case
    when v_objective = 'bookings' then 'booking'
    when v_objective = 'applications' then 'application'
    when v_objective = 'webinar_signups' then 'webinar'
    when v_objective = 'quiz_leads' then 'quiz'
    when v_objective = 'challenge_signups' then 'challenge'
    when v_objective = 'launch_waitlist' then 'product_launch'
    when v_offer_type in ('course','membership') then 'course_membership'
    when not v_checkout_required or v_price = 0 then 'lead_magnet'
    when v_price > 0 and v_price < 100 and v_has_lead_magnet then 'tripwire'
    when v_price > 0 and v_price < 500 then 'low_ticket'
    when v_traffic = 'cold_paid' and v_awareness in ('unaware','problem_aware') then 'vsl'
    when v_awareness in ('product_aware','most_aware') then 'direct_checkout'
    else 'lead_magnet'
  end;

  v_reasoning := case v_type
    when 'booking' then 'Your goal is booked calls, so the whole funnel exists to get a qualified lead onto your calendar.'
    when 'application' then 'You need to qualify people before they can buy or book, so an application step comes before any pitch.'
    when 'webinar' then 'A live or evergreen webinar builds enough trust to pitch a real offer at the end, better than a cold sales page.'
    when 'quiz' then 'A quiz lowers the barrier to opt in and lets you segment the offer by their answers.'
    when 'challenge' then 'A multi-day challenge builds momentum and trust before the pitch, which suits this kind of offer.'
    when 'product_launch' then 'A waitlist-first sequence builds anticipation before the cart opens.'
    when 'course_membership' then 'Course/membership offers convert better with a dedicated sales page than a bare checkout.'
    when 'lead_magnet' then 'No checkout is needed yet — the priority is building a list with a free resource.'
    when 'tripwire' then 'A low price under $100 with a lead magnet available works well as a tripwire: capture the lead, convert on a small first purchase.'
    when 'low_ticket' then 'This price point converts well straight off a dedicated sales page rather than a long-form video pitch.'
    when 'vsl' then 'Cold, unaware-to-problem-aware traffic needs more persuasion before being asked to buy — a video sales letter does that work.'
    when 'direct_checkout' then 'Your audience is already product-aware, so you can skip persuasion pages and go straight to checkout.'
    else 'Default recommendation based on a straightforward opt-in-first flow.'
  end;

  v_steps := case v_type
    when 'lead_magnet' then jsonb_build_array(
      jsonb_build_object('step_type','optin','role_label','Lead capture','cta_direction','Get the free '||coalesce(v_offer_type,'resource'),'purpose','Capture name + email in exchange for the lead magnet.'),
      jsonb_build_object('step_type','thankyou','role_label','Thank-you','cta_direction','Confirm delivery, suggest the next step','purpose','Deliver the resource and warm them toward your paid offer.'))
    when 'webinar' then jsonb_build_array(
      jsonb_build_object('step_type','optin','role_label','Webinar registration','cta_direction','Save my seat','purpose','Capture registrants for the live/evergreen session.'),
      jsonb_build_object('step_type','sales','role_label','Webinar / replay','cta_direction','Watch now','purpose','Deliver the training that builds the case for your offer.'),
      jsonb_build_object('step_type','order','role_label','Offer','cta_direction','Get instant access','purpose','Pitch the paid offer at the end of the training.'),
      jsonb_build_object('step_type','thankyou','role_label','Thank-you','cta_direction','What happens next','purpose','Confirm and set expectations.'))
    when 'booking' then jsonb_build_array(
      jsonb_build_object('step_type','optin','role_label','Qualify','cta_direction','Tell us about your situation','purpose','Capture contact info + qualifying details.'),
      jsonb_build_object('step_type','sales','role_label','Book a call','cta_direction','Pick a time','purpose','Embed your calendar and set expectations for the call.'),
      jsonb_build_object('step_type','thankyou','role_label','Confirmed','cta_direction','What to prepare','purpose','Reduce no-shows with clear next steps.'))
    when 'application' then jsonb_build_array(
      jsonb_build_object('step_type','optin','role_label','Application','cta_direction','Apply now','purpose','Collect qualifying answers before any pitch.'),
      jsonb_build_object('step_type','sales','role_label','What happens next','cta_direction','Learn how it works','purpose','Set expectations while the application is reviewed.'),
      jsonb_build_object('step_type','thankyou','role_label','Received','cta_direction','We will be in touch','purpose','Confirm submission and timeline.'))
    when 'vsl' then jsonb_build_array(
      jsonb_build_object('step_type','sales','role_label','Video sales letter','cta_direction','Watch to unlock the offer','purpose','Build the full case for the offer before asking for the sale.'),
      jsonb_build_object('step_type','order','role_label','Checkout','cta_direction','Get it now','purpose','Take the order.'),
      jsonb_build_object('step_type','upsell','role_label','Upsell','cta_direction','Add this for a one-time price','purpose','Increase order value immediately after purchase.'),
      jsonb_build_object('step_type','downsell','role_label','Downsell','cta_direction','A smaller offer instead','purpose','Recover value if the upsell is declined.'),
      jsonb_build_object('step_type','thankyou','role_label','Thank-you','cta_direction','Access instructions','purpose','Deliver the purchase.'))
    when 'direct_checkout' then jsonb_build_array(
      jsonb_build_object('step_type','order','role_label','Checkout','cta_direction','Buy now','purpose','Your audience already knows the offer — take the order directly.'),
      jsonb_build_object('step_type','upsell','role_label','Upsell','cta_direction','Add this for a one-time price','purpose','Increase order value immediately after purchase.'),
      jsonb_build_object('step_type','downsell','role_label','Downsell','cta_direction','A smaller offer instead','purpose','Recover value if the upsell is declined.'),
      jsonb_build_object('step_type','thankyou','role_label','Thank-you','cta_direction','Access instructions','purpose','Deliver the purchase.'))
    when 'tripwire' then jsonb_build_array(
      jsonb_build_object('step_type','optin','role_label','Lead capture','cta_direction','Get the free resource','purpose','Capture the lead with your free offer.'),
      jsonb_build_object('step_type','order','role_label','Tripwire offer','cta_direction','Add this for a small one-time price','purpose','Convert the fresh lead into a first, low-risk buyer.'),
      jsonb_build_object('step_type','upsell','role_label','Upsell','cta_direction','Add this for a one-time price','purpose','Increase order value while they are still buying.'),
      jsonb_build_object('step_type','thankyou','role_label','Thank-you','cta_direction','Access instructions','purpose','Deliver the purchase.'))
    when 'low_ticket' then jsonb_build_array(
      jsonb_build_object('step_type','sales','role_label','Sales page','cta_direction','Get it now','purpose','Make the case for the offer at this price point.'),
      jsonb_build_object('step_type','order','role_label','Checkout','cta_direction','Complete your order','purpose','Take the order.'),
      jsonb_build_object('step_type','upsell','role_label','Upsell','cta_direction','Add this for a one-time price','purpose','Increase order value immediately after purchase.'),
      jsonb_build_object('step_type','downsell','role_label','Downsell','cta_direction','A smaller offer instead','purpose','Recover value if the upsell is declined.'),
      jsonb_build_object('step_type','thankyou','role_label','Thank-you','cta_direction','Access instructions','purpose','Deliver the purchase.'))
    when 'course_membership' then jsonb_build_array(
      jsonb_build_object('step_type','sales','role_label','Sales page','cta_direction','Enroll now','purpose','Make the full case for the course/membership.'),
      jsonb_build_object('step_type','order','role_label','Checkout','cta_direction','Complete enrollment','purpose','Take the order.'),
      jsonb_build_object('step_type','upsell','role_label','Upsell','cta_direction','Add this for a one-time price','purpose','Offer a complementary upgrade at the moment of highest intent.'),
      jsonb_build_object('step_type','thankyou','role_label','Welcome','cta_direction','Get started','purpose','Deliver access and set onboarding expectations.'))
    when 'product_launch' then jsonb_build_array(
      jsonb_build_object('step_type','optin','role_label','Waitlist','cta_direction','Get early access','purpose','Build anticipation and capture interest before the cart opens.'),
      jsonb_build_object('step_type','sales','role_label','Launch reveal','cta_direction','See what''s inside','purpose','Reveal the offer to your warmed-up waitlist.'),
      jsonb_build_object('step_type','order','role_label','Checkout','cta_direction','Get it now','purpose','Take the order during the launch window.'),
      jsonb_build_object('step_type','thankyou','role_label','Thank-you','cta_direction','Access instructions','purpose','Deliver the purchase.'))
    when 'quiz' then jsonb_build_array(
      jsonb_build_object('step_type','optin','role_label','Quiz','cta_direction','Take the quiz','purpose','Lower the barrier to opt in and segment by answers.'),
      jsonb_build_object('step_type','sales','role_label','Personalized result','cta_direction','See your result + recommendation','purpose','Pitch the offer that matches their quiz answers.'),
      jsonb_build_object('step_type','order','role_label','Checkout','cta_direction','Get it now','purpose','Take the order.'),
      jsonb_build_object('step_type','thankyou','role_label','Thank-you','cta_direction','Access instructions','purpose','Deliver the purchase.'))
    when 'challenge' then jsonb_build_array(
      jsonb_build_object('step_type','optin','role_label','Challenge signup','cta_direction','Join the challenge','purpose','Capture signups for the challenge.'),
      jsonb_build_object('step_type','sales','role_label','Challenge + pitch','cta_direction','Continue your progress','purpose','Deliver value daily and build the case for the paid offer.'),
      jsonb_build_object('step_type','order','role_label','Checkout','cta_direction','Get it now','purpose','Take the order at the challenge''s close.'),
      jsonb_build_object('step_type','thankyou','role_label','Thank-you','cta_direction','Access instructions','purpose','Deliver the purchase.'))
    else jsonb_build_array(jsonb_build_object('step_type','optin','role_label','Lead capture','cta_direction','Get started','purpose','Capture the lead.'))
  end;

  v_bump := v_type in ('tripwire','low_ticket','vsl','direct_checkout');
  v_upsell := v_type in ('tripwire','low_ticket','vsl','direct_checkout','course_membership');
  v_downsell := v_type in ('low_ticket','vsl','direct_checkout');

  v_tests := case
    when v_type in ('vsl','low_ticket','direct_checkout','tripwire') then jsonb_build_array(
      'Test the headline on the sales/checkout step against a benefit-led alternative.',
      'Test adding (or removing) the order bump to see its effect on AOV.',
      'Test a shorter vs. longer sales page for this offer.')
    when v_type in ('lead_magnet','webinar','quiz','challenge') then jsonb_build_array(
      'Test the opt-in headline against a curiosity-led alternative.',
      'Test a 1-field form (email only) against your current form length.',
      'Test the CTA button copy on the opt-in step.')
    else jsonb_build_array('Test the primary CTA copy on your first step.', 'Test the headline on your first step.')
  end;

  v_checklist := jsonb_build_array(
    case when v_checkout_required then 'Confirm your M28 payment wiring is connected before going live.' else 'No payment wiring needed for this funnel type.' end,
    'Make sure every step has a published page linked before launch.',
    'Review the Launch Readiness checks in Operations before switching this funnel to Live.'
  );
  if v_bump then
    v_checklist := v_checklist || jsonb_build_array('Decide on your order bump offer and price before launch.');
  end if;

  return jsonb_build_object(
    'funnel_type', v_type,
    'reasoning', v_reasoning,
    'steps', v_steps,
    'order_bump_suggested', v_bump,
    'upsell_suggested', v_upsell,
    'downsell_suggested', v_downsell,
    'test_ideas', v_tests,
    'launch_checklist_emphasis', v_checklist
  );
end $$;
grant execute on function public.recommend_funnel_blueprint(jsonb) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. save / approve / convert (D-174) — the rest of the wizard's write path.
-- All three are SECURITY DEFINER with explicit role checks, same dual-layer
-- pattern as every other M20 write RPC (RLS above covers direct table
-- access; these cover the RPC path the wizard actually uses).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.save_funnel_blueprint(p_ws uuid, p_answers jsonb, p_blueprint jsonb, p_blueprint_id uuid default null)
returns public.funnel_blueprints language plpgsql security definer set search_path = public as $$
declare v_row public.funnel_blueprints;
begin
  if auth.uid() is not null and not public.has_role(p_ws, 'staff') then
    raise exception 'saving a blueprint requires staff+' using errcode = '42501';
  end if;
  if p_blueprint_id is not null then
    update public.funnel_blueprints set answers = p_answers, blueprint = p_blueprint
      where id = p_blueprint_id and workspace_id = p_ws and status = 'draft'
      returning * into v_row;
    if v_row.id is null then raise exception 'blueprint not found or not editable' using errcode = 'P0002'; end if;
  else
    insert into public.funnel_blueprints (workspace_id, created_by, answers, blueprint)
    values (p_ws, auth.uid(), p_answers, p_blueprint)
    returning * into v_row;
  end if;
  return v_row;
end $$;
revoke all on function public.save_funnel_blueprint(uuid, jsonb, jsonb, uuid) from public;
grant execute on function public.save_funnel_blueprint(uuid, jsonb, jsonb, uuid) to authenticated, service_role;

create or replace function public.approve_funnel_blueprint(p_blueprint_id uuid)
returns public.funnel_blueprints language plpgsql security definer set search_path = public as $$
declare v_ws uuid; v_row public.funnel_blueprints;
begin
  select workspace_id into v_ws from public.funnel_blueprints where id = p_blueprint_id;
  if v_ws is null then raise exception 'blueprint not found' using errcode = 'P0002'; end if;
  if auth.uid() is not null and not public.has_role(v_ws, 'staff') then
    raise exception 'approving a blueprint requires staff+' using errcode = '42501';
  end if;
  update public.funnel_blueprints set status = 'approved' where id = p_blueprint_id and status = 'draft' returning * into v_row;
  if v_row.id is null then raise exception 'blueprint not found or already approved/converted' using errcode = 'P0002'; end if;
  return v_row;
end $$;
revoke all on function public.approve_funnel_blueprint(uuid) from public;
grant execute on function public.approve_funnel_blueprint(uuid) to authenticated, service_role;

-- Materializes an approved blueprint into a real funnel + funnel_steps — reuses
-- the exact table shapes `duplicate_funnel` (0031) already writes into, just
-- sourced from the blueprint's generated steps instead of copying another funnel.
create or replace function public.convert_blueprint_to_funnel(p_blueprint_id uuid, p_name text, p_site_id uuid default null)
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

  insert into public.funnels (workspace_id, name, status, site_id, funnel_type, settings)
  values (v_bp.workspace_id, btrim(p_name), 'draft', p_site_id, v_bp.blueprint->>'funnel_type', '{}'::jsonb)
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
revoke all on function public.convert_blueprint_to_funnel(uuid, text, uuid) from public;
grant execute on function public.convert_blueprint_to_funnel(uuid, text, uuid) to authenticated, service_role;
