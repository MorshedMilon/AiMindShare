-- ═══════════════════════════════════════════════════════════════════════════
-- 0036_m20_funnels_v3c.sql — M20 Funnels v3, Phase F: AI Funnel Studio
-- Instant mode + affiliate/product offer-source branch (D-181).
--
-- Additive only: widens the existing nullable `funnel_type` CHECK constraint
-- with 3 affiliate funnel types, and extends `recommend_funnel_blueprint`
-- (created in 0034) with an `offer_source` branch. No new tables — the
-- wizard's `answers`/`blueprint` jsonb columns already carry whatever extra
-- fields the affiliate path needs. `convert_blueprint_to_funnel` (0034) is
-- untouched: it already reads `blueprint->>'funnel_type'` generically, it
-- only needed the CHECK constraint below widened to accept the new values.
--
-- No product/course/offer catalog exists anywhere in this repo (checked M28
-- payments, M03 billing, M09 CRM) — building one is out of scope here. The
-- "product/offer" creation path is instead the same wizard with an
-- offer-source toggle, not a catalog integration.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. widen funnels.funnel_type CHECK (D-181) ───────────────────────────────
alter table public.funnels drop constraint if exists funnels_funnel_type_chk;
alter table public.funnels add constraint funnels_funnel_type_chk check (funnel_type is null or funnel_type in (
  'lead_magnet','webinar','booking','application','vsl','direct_checkout',
  'tripwire','low_ticket','course_membership','product_launch','quiz','challenge',
  'affiliate_bridge','affiliate_review','affiliate_comparison'
));

-- ── 1. recommend_funnel_blueprint — affiliate offer_source branch (D-181) ────
-- Same deterministic-today posture as 0034 (D-063). The affiliate branch is
-- checked FIRST — an affiliate offer determines funnel structure regardless
-- of the objective/offer_type answers, since there is no owned checkout to
-- route to (the sale happens on the vendor's site).
create or replace function public.recommend_funnel_blueprint(p_answers jsonb)
returns jsonb language plpgsql immutable as $$
declare
  v_objective text := p_answers->>'objective';
  v_offer_type text := p_answers->>'offer_type';
  v_offer_source text := p_answers->>'offer_source';
  v_price numeric := coalesce((p_answers->>'offer_price')::numeric, 0);
  v_has_lead_magnet boolean := coalesce((p_answers->>'has_lead_magnet')::boolean, false);
  v_checkout_required boolean := coalesce((p_answers->>'checkout_required')::boolean, v_price > 0);
  v_traffic text := p_answers->>'traffic_source';
  v_awareness text := p_answers->>'audience_awareness';
  v_disclosure boolean := coalesce((p_answers->>'disclosure_required')::boolean, true);
  v_type text;
  v_reasoning text;
  v_steps jsonb;
  v_bump boolean; v_upsell boolean; v_downsell boolean;
  v_tests jsonb; v_checklist jsonb;
begin
  -- ── funnel type decision (priority-ordered, first match wins) ──
  v_type := case
    when v_offer_source = 'affiliate' and (v_traffic = 'cold_paid' or v_awareness in ('unaware','problem_aware')) then 'affiliate_bridge'
    when v_offer_source = 'affiliate' and v_awareness = 'solution_aware' then 'affiliate_comparison'
    when v_offer_source = 'affiliate' then 'affiliate_review'
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
    when 'affiliate_bridge' then 'Cold or not-yet-aware traffic converts better on a pre-sell bridge page that builds context before sending them to the vendor''s offer.'
    when 'affiliate_review' then 'Warmer, more product-aware traffic responds well to an in-depth review that reinforces a decision they''re already leaning toward.'
    when 'affiliate_comparison' then 'Your audience knows solutions exist but is still comparing, so a comparison page that positions your pick clearly converts best.'
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
    when 'affiliate_bridge' then jsonb_build_array(
      jsonb_build_object('step_type','optin','role_label','Bridge opt-in','cta_direction','Get the free breakdown first','purpose','Capture the lead before sending them to the vendor, so you can follow up if they don''t buy.'),
      jsonb_build_object('step_type','sales','role_label','Bridge page','cta_direction','See the full breakdown &amp; get access','purpose','Warm the visitor up and set context before the external offer.'),
      jsonb_build_object('step_type','thankyou','role_label','Continue to offer','cta_direction','Continue to the offer','purpose','Hand off to the vendor''s page via your affiliate link (external).'))
    when 'affiliate_review' then jsonb_build_array(
      jsonb_build_object('step_type','sales','role_label','Review page','cta_direction','Read the full review','purpose','Give an in-depth, trust-building review of the offer.'),
      jsonb_build_object('step_type','thankyou','role_label','Continue to offer','cta_direction','Get it now','purpose','Hand off to the vendor''s page via your affiliate link (external).'))
    when 'affiliate_comparison' then jsonb_build_array(
      jsonb_build_object('step_type','sales','role_label','Comparison page','cta_direction','See the comparison','purpose','Compare this offer against alternatives and position your recommended pick.'),
      jsonb_build_object('step_type','thankyou','role_label','Continue to offer','cta_direction','Choose this option','purpose','Hand off to the vendor''s page via your affiliate link (external).'))
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
    when v_type in ('affiliate_bridge','affiliate_review','affiliate_comparison') then jsonb_build_array(
      'Test the bridge/review headline against a curiosity-led alternative.',
      'Test disclosure placement (top vs. bottom of page) for compliance and trust.',
      'Test the outbound CTA copy driving to the vendor offer.')
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
    case when v_type in ('affiliate_bridge','affiliate_review','affiliate_comparison') then 'No payment wiring needed — the sale/checkout happens on the vendor''s site.'
         when v_checkout_required then 'Confirm your M28 payment wiring is connected before going live.'
         else 'No payment wiring needed for this funnel type.' end,
    'Make sure every step has a published page linked before launch.',
    'Review the Launch Readiness checks in Operations before switching this funnel to Live.'
  );
  if v_bump then
    v_checklist := v_checklist || jsonb_build_array('Decide on your order bump offer and price before launch.');
  end if;
  if v_type in ('affiliate_bridge','affiliate_review','affiliate_comparison') and v_disclosure then
    v_checklist := v_checklist || jsonb_build_array('Add an affiliate disclosure per FTC guidelines before publishing — do not imply you own this product.');
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
