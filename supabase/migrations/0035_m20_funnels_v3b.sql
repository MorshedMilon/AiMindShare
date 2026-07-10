-- ═══════════════════════════════════════════════════════════════════════════
-- 0035_m20_funnels_v3b.sql — M20 Funnels v3, Phase C (Operations Workspace
-- depth) + Phase D (AI Optimization advisory layer). Everything here extends
-- an EXISTING function signature (CREATE OR REPLACE, same params, additive
-- new jsonb fields only) or adds a brand-new read-only function/table. No
-- existing field is removed, no existing behavior changes for a caller that
-- ignores the new fields.
--
-- DECISIONS D-175…D-180.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. funnel_visits.event widened for order_failed (D-175) ─────────────────
alter table public.funnel_visits drop constraint if exists funnel_visits_event_chk;
alter table public.funnel_visits add constraint funnel_visits_event_chk check (event in
  ('view','optin','purchase','abandoned','upsell_accepted','upsell_declined',
   'downsell_accepted','downsell_declined','order_failed'));

-- record_funnel_event: accept 'order_failed' + emit 'order.failed' via the same
-- replace(p_event,'_','.') pattern already used for upsell/downsell responses.
-- Everything else in this function is byte-identical to 0030's version.
create or replace function public.record_funnel_event(
  p_ws uuid, p_funnel uuid, p_step uuid, p_visitor text, p_event text,
  p_variant text default null, p_contact uuid default null,
  p_email text default null, p_name text default null, p_utm jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_contact uuid := p_contact; v_first text; v_last text; v_email text;
  v_tag uuid; v_tag_name text; v_visit uuid; v_test_mode boolean;
  v_step_order int; v_first_view boolean := false;
begin
  if p_event not in ('view','optin','purchase','abandoned',
                      'upsell_accepted','upsell_declined','downsell_accepted','downsell_declined','order_failed') then
    raise exception 'bad event %', p_event using errcode = '22023';
  end if;

  select test_mode into v_test_mode from public.funnels where id = p_funnel;
  v_test_mode := coalesce(v_test_mode, false);

  if p_event = 'view' and p_step is not null then
    select step_order into v_step_order from public.funnel_steps where id = p_step;
    v_first_view := not exists (
      select 1 from public.funnel_visits
      where funnel_id = p_funnel and visitor_id = coalesce(p_visitor,'anon') and event = 'view'
    );
  end if;

  if p_event = 'optin' and v_contact is null and p_email is not null then
    v_email := lower(nullif(btrim(p_email), ''));
    if v_email is not null then
      select id into v_contact from public.contacts
        where workspace_id = p_ws and lower(email) = v_email and deleted_at is null
        order by created_at limit 1;
      if v_contact is null then
        v_first := split_part(coalesce(btrim(p_name),''), ' ', 1);
        v_last  := nullif(btrim(substr(coalesce(btrim(p_name),''),
                     length(split_part(coalesce(btrim(p_name),''),' ',1)) + 1)), '');
        insert into public.contacts (workspace_id, first_name, last_name, email, source,
                                     utm_source, utm_medium, utm_campaign)
        values (p_ws, nullif(v_first,''), v_last, v_email, 'funnel:' || p_funnel::text,
                nullif(p_utm->>'utm_source',''), nullif(p_utm->>'utm_medium',''), nullif(p_utm->>'utm_campaign',''))
        returning id into v_contact;
      end if;
    end if;
  end if;

  if v_contact is not null and p_event = 'optin' then
    v_tag_name := 'Funnel opt-in';
    insert into public.tags (workspace_id, name) values (p_ws, v_tag_name)
      on conflict (workspace_id, name) do nothing;
    select id into v_tag from public.tags where workspace_id = p_ws and name = v_tag_name;
    if v_tag is not null then
      insert into public.contact_tags (workspace_id, contact_id, tag_id)
        values (p_ws, v_contact, v_tag) on conflict (contact_id, tag_id) do nothing;
    end if;
  end if;

  insert into public.funnel_visits (workspace_id, funnel_id, step_id, visitor_id, contact_id, variant, event, utm, is_test)
  values (p_ws, p_funnel, p_step, coalesce(p_visitor,'anon'), v_contact, p_variant, p_event, coalesce(p_utm,'{}'::jsonb), v_test_mode)
  returning id into v_visit;

  if p_event = 'view' and p_step is not null then
    begin
      if v_first_view and coalesce(v_step_order,0) = 0 then
        perform public.emit_trigger(p_ws, 'funnel.entered', jsonb_build_object('funnel_id', p_funnel, 'step_id', p_step, 'contact_id', v_contact));
      elsif coalesce(v_step_order,0) > 0 then
        perform public.emit_trigger(p_ws, 'step.completed', jsonb_build_object('funnel_id', p_funnel, 'step_id', p_step, 'contact_id', v_contact));
      end if;
    exception when undefined_function then null; when others then null; end;
  end if;

  if p_event = 'optin' then
    begin
      perform public.emit_trigger(p_ws, 'form.submitted',
        jsonb_build_object('funnel_id', p_funnel, 'step_id', p_step, 'contact_id', v_contact));
    exception when undefined_function then null; when others then null; end;
  end if;

  if p_event = 'purchase' then
    begin
      perform public.emit_trigger(p_ws, 'payment.received',
        jsonb_build_object('funnel_id', p_funnel, 'step_id', p_step, 'contact_id', v_contact));
    exception when undefined_function then null; when others then null; end;
  end if;

  if p_event in ('upsell_accepted','upsell_declined','downsell_accepted','downsell_declined','order_failed') then
    begin
      perform public.emit_trigger(p_ws, replace(p_event, '_', '.'),
        jsonb_build_object('funnel_id', p_funnel, 'step_id', p_step, 'contact_id', v_contact));
    exception when undefined_function then null; when others then null; end;
  end if;

  return v_visit;
end $$;
revoke all on function public.record_funnel_event(uuid, uuid, uuid, text, text, text, uuid, text, text, jsonb) from public;
grant execute on function public.record_funnel_event(uuid, uuid, uuid, text, text, text, uuid, text, text, jsonb) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. funnel_map — adds revenue per step, an order-bump marker, and a
--    "no page linked" warning flag (D-176). Signature unchanged; every
--    existing field (visitors/conversions/rate/has_split/...) is untouched.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.funnel_map(p_funnel uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_ws uuid; v jsonb;
begin
  select workspace_id into v_ws from public.funnels where id = p_funnel;
  if v_ws is null then raise exception 'funnel not found' using errcode = 'P0002'; end if;
  if not public.is_member(v_ws) then
    raise exception 'not a member of workspace %', v_ws using errcode = '42501';
  end if;
  if auth.uid() is not null and public.funnel_analytics_denied(p_funnel) then
    raise exception 'analytics access to this funnel has been restricted for your account' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.step_order), '[]'::jsonb) into v
  from (
    select st.id, st.step_order, st.step_type::text as step_type, st.name, st.page_id,
           coalesce(vc.visitors, 0)    as visitors,
           coalesce(vc.conversions, 0) as conversions,
           case when coalesce(vc.visitors,0) > 0
                then round(coalesce(vc.conversions,0)::numeric / vc.visitors * 100, 1)
                else 0 end as rate,
           (select count(*) from public.funnel_splits sp where sp.step_id = st.id and sp.status = 'running') > 0 as has_split,
           coalesce(rv.revenue, 0) as revenue,
           (coalesce(st.config->'bumps','[]'::jsonb) <> '[]'::jsonb or (st.config->'bump') is not null) as has_bump,
           (st.page_id is null) as warning_no_page
    from public.funnel_steps st
    left join (
      select step_id,
             count(distinct visitor_id) filter (where event = 'view') as visitors,
             count(distinct visitor_id) filter (where event in ('optin','purchase')) as conversions
      from public.funnel_visits
      where funnel_id = p_funnel
      group by step_id
    ) vc on vc.step_id = st.id
    left join (
      select source_id, sum(amount_paid) as revenue
      from public.invoices
      where source_type = 'order' and amount_paid > 0 and coalesce(is_test,false) = false
      group by source_id
    ) rv on rv.source_id = st.id
    where st.funnel_id = p_funnel
  ) s;
  return v;
end $$;
revoke all on function public.funnel_map(uuid) from public;
grant execute on function public.funnel_map(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. funnel_publish_readiness — adds a 0–100 launch readiness score, derived
--    from the SAME blockers/warnings arrays already computed (D-177). No new
--    checks added here — "domain check"/"SSL check"/"page connection check"
--    already existed (0029); a genuine "payment provider connected" check and
--    a "form check" would need M28/M15 data this function doesn't have access
--    to today and are NOT invented here (flagged in the changelog, not faked).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.funnel_publish_readiness(p_funnel uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ws uuid; v_site uuid; v_blockers text[] := '{}'; v_warnings text[] := '{}'; r record; v_score int;
begin
  select workspace_id, site_id into v_ws, v_site from public.funnels where id = p_funnel;
  if v_ws is null then raise exception 'funnel not found' using errcode = 'P0002'; end if;
  if not public.is_member(v_ws) then
    raise exception 'not a member of workspace %', v_ws using errcode = '42501';
  end if;

  if not exists (select 1 from public.funnel_steps where funnel_id = p_funnel) then
    v_blockers := array_append(v_blockers, 'Add at least one step before publishing.');
  end if;

  for r in select name from public.funnel_steps where funnel_id = p_funnel and page_id is null order by step_order loop
    v_blockers := array_append(v_blockers, format('Step "%s" has no page linked yet.', r.name));
  end loop;

  for r in
    select name from public.funnel_steps
    where funnel_id = p_funnel and step_type in ('order','upsell','downsell')
      and not exists (
        select 1 from jsonb_array_elements(coalesce(config->'products','[]'::jsonb)) p
        where coalesce((p->>'price')::numeric, 0) > 0
      )
  loop
    v_blockers := array_append(v_blockers, format('Step "%s" needs at least one priced product.', r.name));
  end loop;

  if not exists (select 1 from public.funnel_steps where funnel_id = p_funnel and step_type in ('order','upsell','downsell')) then
    v_warnings := array_append(v_warnings, 'This funnel has no order step — it can''t take payments.');
  end if;

  if v_site is not null then
    if not exists (select 1 from public.site_publish_log where site_id = v_site and kind = 'domain.verify' and status = 'ok') then
      v_warnings := array_append(v_warnings, 'Custom domain not verified yet — reachable on the staging subdomain only.');
    end if;
    if not exists (select 1 from public.site_publish_log where site_id = v_site and kind = 'ssl.provision' and status = 'ok') then
      v_warnings := array_append(v_warnings, 'SSL has not been provisioned for a custom domain yet.');
    end if;
  end if;

  v_score := greatest(0, 100 - coalesce(array_length(v_blockers,1),0) * 40 - coalesce(array_length(v_warnings,1),0) * 10);

  return jsonb_build_object(
    'ready', array_length(v_blockers,1) is null,
    'score', v_score,
    'blockers', to_jsonb(v_blockers), 'warnings', to_jsonb(v_warnings)
  );
end $$;
revoke all on function public.funnel_publish_readiness(uuid) from public;
grant execute on function public.funnel_publish_readiness(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. funnel_revenue_summary — adds a daily revenue/orders trend (defaults to
--    the last 30 days when no p_from/p_to given), by_medium/by_campaign
--    visitor breakdowns, and a `reconciled` flag (top-level revenue vs. the
--    sum of by_step revenue — a real integrity check, not decorative: they're
--    computed from overlapping-but-not-identical WHERE clauses, see D-178).
--    by_content/by_term are NOT added — UTM content/term are captured (D-158)
--    but a third and fourth attribution dimension add real query cost for
--    marginal value; deferred, not silently dropped (changelog).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.funnel_revenue_summary(
  p_funnel uuid, p_from timestamptz default null, p_to timestamptz default null
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ws uuid; v_step_ids uuid[]; v jsonb;
  v_revenue bigint; v_orders int; v_visitors int; v_step_revenue bigint;
begin
  select workspace_id into v_ws from public.funnels where id = p_funnel;
  if v_ws is null then raise exception 'funnel not found' using errcode = 'P0002'; end if;
  if not public.is_member(v_ws) then
    raise exception 'not a member of workspace %', v_ws using errcode = '42501';
  end if;
  if auth.uid() is not null and public.funnel_analytics_denied(p_funnel) then
    raise exception 'analytics access to this funnel has been restricted for your account' using errcode = '42501';
  end if;

  select coalesce(array_agg(id), '{}') into v_step_ids from public.funnel_steps where funnel_id = p_funnel;

  select count(distinct fv.visitor_id) into v_visitors
  from public.funnel_visits fv
  join public.funnel_steps fs on fs.id = fv.step_id and fs.step_order = 0
  where fv.funnel_id = p_funnel and fv.event = 'view' and fv.is_test = false
    and (p_from is null or fv.created_at >= p_from) and (p_to is null or fv.created_at <= p_to);

  select coalesce(sum(i.amount_paid),0), count(*) filter (where i.amount_paid > 0)
    into v_revenue, v_orders
  from public.invoices i
  where i.source_type = 'order' and i.source_id = any(v_step_ids) and i.amount_paid > 0
    and coalesce(i.is_test,false) = false
    and (p_from is null or i.paid_at >= p_from) and (p_to is null or i.paid_at <= p_to);

  v := jsonb_build_object(
    'revenue', v_revenue, 'orders', v_orders,
    'aov', case when v_orders > 0 then round(v_revenue::numeric / v_orders) else 0 end,
    'visitors', v_visitors,
    'epc', case when v_visitors > 0 then round(v_revenue::numeric / v_visitors) else 0 end
  );

  v := v || jsonb_build_object('by_step', coalesce((
    select jsonb_agg(row_to_json(s)::jsonb order by s.step_order) from (
      select fs.id as step_id, fs.name, fs.step_type::text as step_type, fs.step_order,
             coalesce(sum(i.amount_paid),0) as revenue,
             count(i.id) filter (where i.amount_paid > 0) as orders
      from public.funnel_steps fs
      left join public.invoices i on i.source_type='order' and i.source_id = fs.id and i.amount_paid > 0
        and coalesce(i.is_test,false) = false
        and (p_from is null or i.paid_at >= p_from) and (p_to is null or i.paid_at <= p_to)
      where fs.funnel_id = p_funnel and fs.step_type in ('order','upsell','downsell')
      group by fs.id, fs.name, fs.step_type, fs.step_order
    ) s
  ), '[]'::jsonb));

  select coalesce(sum((s->>'revenue')::bigint), 0) into v_step_revenue
  from jsonb_array_elements(v->'by_step') s;
  v := v || jsonb_build_object('reconciled', v_revenue = v_step_revenue);

  v := v || jsonb_build_object('by_source', coalesce((
    with visits as (
      select coalesce(nullif(fv.utm->>'utm_source',''), 'direct') as source,
             count(distinct fv.visitor_id) as visitors
      from public.funnel_visits fv
      join public.funnel_steps fs on fs.id = fv.step_id and fs.step_order = 0
      where fv.funnel_id = p_funnel and fv.event = 'view' and fv.is_test = false
        and (p_from is null or fv.created_at >= p_from) and (p_to is null or fv.created_at <= p_to)
      group by 1
    ),
    first_touch as (
      select distinct on (contact_id) contact_id,
             coalesce(nullif(utm->>'utm_source',''), 'direct') as source
      from public.funnel_visits
      where funnel_id = p_funnel and contact_id is not null and utm <> '{}'::jsonb
      order by contact_id, created_at asc
    ),
    revenue as (
      select coalesce(ft.source, 'direct') as source, sum(i.amount_paid) as revenue, count(*) as orders
      from public.invoices i
      left join first_touch ft on ft.contact_id = i.contact_id
      where i.source_type = 'order' and i.source_id = any(v_step_ids) and i.amount_paid > 0
        and coalesce(i.is_test,false) = false
        and (p_from is null or i.paid_at >= p_from) and (p_to is null or i.paid_at <= p_to)
      group by 1
    )
    select jsonb_agg(row_to_json(x)::jsonb order by x.revenue desc, x.visitors desc) from (
      select coalesce(vi.source, rv.source) as source,
             coalesce(vi.visitors,0) as visitors,
             coalesce(rv.revenue,0) as revenue,
             coalesce(rv.orders,0) as orders
      from visits vi full outer join revenue rv on rv.source = vi.source
    ) x
  ), '[]'::jsonb));

  v := v || jsonb_build_object('by_medium', coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.visitors desc) from (
      select coalesce(nullif(fv.utm->>'utm_medium',''), 'none') as medium, count(distinct fv.visitor_id) as visitors
      from public.funnel_visits fv join public.funnel_steps fs on fs.id = fv.step_id and fs.step_order = 0
      where fv.funnel_id = p_funnel and fv.event = 'view' and fv.is_test = false
        and (p_from is null or fv.created_at >= p_from) and (p_to is null or fv.created_at <= p_to)
      group by 1
    ) x
  ), '[]'::jsonb));

  v := v || jsonb_build_object('by_campaign', coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.visitors desc) from (
      select coalesce(nullif(fv.utm->>'utm_campaign',''), 'none') as campaign, count(distinct fv.visitor_id) as visitors
      from public.funnel_visits fv join public.funnel_steps fs on fs.id = fv.step_id and fs.step_order = 0
      where fv.funnel_id = p_funnel and fv.event = 'view' and fv.is_test = false
        and (p_from is null or fv.created_at >= p_from) and (p_to is null or fv.created_at <= p_to)
      group by 1
    ) x
  ), '[]'::jsonb));

  v := v || jsonb_build_object('trend', coalesce((
    select jsonb_agg(row_to_json(t)::jsonb order by t.day) from (
      select date_trunc('day', i.paid_at)::date as day,
             sum(i.amount_paid) as revenue, count(*) as orders
      from public.invoices i
      where i.source_type = 'order' and i.source_id = any(v_step_ids) and i.amount_paid > 0
        and coalesce(i.is_test,false) = false
        and i.paid_at >= coalesce(p_from, now() - interval '30 days')
        and i.paid_at <= coalesce(p_to, now())
      group by 1
    ) t
  ), '[]'::jsonb));

  return v;
end $$;
revoke all on function public.funnel_revenue_summary(uuid, timestamptz, timestamptz) from public;
grant execute on function public.funnel_revenue_summary(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. funnel_recommendations — the AI Optimization advisory layer (D-179,
--    Phase D). Deterministic rules over data `funnel_map`/`funnel_revenue_
--    summary`/`funnel_split_stats` already compute — no new tracking, no new
--    tables, advisory only (never mutates anything). Same D-063 posture as
--    the blueprint engine: a real, working rules layer today; a future LLM
--    pass (if one is ever wired) would read the same inputs and could REPLACE
--    this function's body without touching any caller.
--
--    Deliberately NOT attempted here (would require data this system does
--    not track, and faking it would violate the module's own "detect the
--    limitation, don't fake it" checkout rule): traffic-source/funnel-type
--    mismatch (traffic_source isn't persisted past the wizard session),
--    "no proof block" / "weak CTA" / "too many form fields" (would require
--    parsing M19 page content, a cross-module capability that doesn't exist).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.funnel_recommendations(p_funnel uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ws uuid; v_map jsonb; v_rev jsonb; v_out jsonb := '[]'::jsonb; r record; v_stats jsonb;
begin
  select workspace_id into v_ws from public.funnels where id = p_funnel;
  if v_ws is null then raise exception 'funnel not found' using errcode = 'P0002'; end if;
  if not public.is_member(v_ws) then
    raise exception 'not a member of workspace %', v_ws using errcode = '42501';
  end if;
  if auth.uid() is not null and public.funnel_analytics_denied(p_funnel) then
    raise exception 'analytics access to this funnel has been restricted for your account' using errcode = '42501';
  end if;

  v_map := public.funnel_map(p_funnel);
  v_rev := public.funnel_revenue_summary(p_funnel);

  -- 1. high drop-off between consecutive steps (>60% drop, with enough traffic to matter).
  for r in
    select s.name, s.visitors, lag(s.visitors) over (order by s.step_order) as prev_visitors
    from jsonb_to_recordset(v_map) as s(step_order int, name text, visitors int)
  loop
    if r.prev_visitors is not null and r.prev_visitors > 10 and r.visitors::numeric / r.prev_visitors < 0.4 then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'type', 'high_dropoff', 'severity', 'warning',
        'message', format('%s%% drop-off into "%s" — consider strengthening the headline, CTA, or trust signals on that step.',
          round((1 - r.visitors::numeric / r.prev_visitors) * 100), r.name)));
    end if;
  end loop;

  -- 2. low checkout completion on the order step.
  r := null;
  select s.name, s.rate into r
  from jsonb_to_recordset(v_map) as s(step_type text, name text, rate numeric)
  where s.step_type = 'order' limit 1;
  if r.name is not null and r.rate < 15 then
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'type', 'low_checkout_completion', 'severity', 'warning',
      'message', format('Checkout completion on "%s" is %s%% — well under a typical 15–30%% benchmark. Check for friction, missing trust signals, or too many form fields.', r.name, r.rate)));
  end if;

  -- 3. low EPC despite meaningful traffic.
  if coalesce((v_rev->>'visitors')::int, 0) > 20 and coalesce((v_rev->>'epc')::numeric, 0) < 50 then
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'type', 'low_epc', 'severity', 'info',
      'message', 'EPC is low relative to your traffic volume — consider testing the offer, price point, or adding an order bump.'));
  end if;

  -- 4. missing order bump on an order step.
  for r in
    select s.name from jsonb_to_recordset(v_map) as s(step_type text, name text, has_bump boolean)
    where s.step_type = 'order' and coalesce(s.has_bump, false) = false
  loop
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'type', 'missing_order_bump', 'severity', 'info',
      'message', format('"%s" has no order bump configured — a well-matched bump typically lifts AOV with minimal extra friction.', r.name)));
  end loop;

  -- 5. a running A/B/C test has a statistically significant, non-control leader.
  for r in
    select fs.id as step_id, fs.name from public.funnel_steps fs
    join public.funnel_splits sp on sp.step_id = fs.id and sp.status = 'running'
    where fs.funnel_id = p_funnel
  loop
    v_stats := public.funnel_split_stats(r.step_id);
    if coalesce((v_stats->>'significant')::boolean, false) and v_stats->>'leader' <> 'A' then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'type', 'variant_winner_ready', 'severity', 'info',
        'message', format('The test on "%s" has a statistically significant leader (variant %s) — review it in Variants.', r.name, v_stats->>'leader')));
    end if;
  end loop;

  return v_out;
end $$;
revoke all on function public.funnel_recommendations(uuid) from public;
grant execute on function public.funnel_recommendations(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. funnel_job_runs — job-run visibility for the two hourly sweeps (D-180).
--    Read-only observability, no PII: job name + how many rows it touched +
--    when. Inserted from inside the (already SECURITY DEFINER) sweep
--    functions, so no extra grant is needed for the insert itself.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.funnel_job_runs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  job_name     text not null,
  rows_affected int not null default 0,
  ran_at       timestamptz not null default now()
);
create index if not exists funnel_job_runs_idx on public.funnel_job_runs (job_name, ran_at desc);
alter table public.funnel_job_runs enable row level security;
create policy funnel_job_runs_sel on public.funnel_job_runs for select
  using (workspace_id is null or public.is_member(workspace_id));

create or replace function public.sweep_abandoned_funnels(p_ws uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_count int := 0; v_funnel uuid; v_hours int;
begin
  for r in
    select i.id, i.workspace_id, i.contact_id, i.source_id as step_id, i.created_at
    from public.invoices i
    where i.source_type = 'order'
      and i.status in ('draft','sent','viewed','overdue')
      and coalesce(i.amount_paid,0) = 0
      and coalesce(i.is_test,false) = false
      and (p_ws is null or i.workspace_id = p_ws)
  loop
    select fs.funnel_id, coalesce((f.settings->>'abandon_hours')::int, 1)
      into v_funnel, v_hours
    from public.funnel_steps fs join public.funnels f on f.id = fs.funnel_id
    where fs.id = r.step_id;
    if v_funnel is null then continue; end if;
    if r.created_at > now() - make_interval(hours => coalesce(v_hours,1)) then continue; end if;

    if exists (select 1 from public.funnel_visits
                where step_id = r.step_id and visitor_id = 'order:' || r.id::text and event = 'abandoned') then
      continue;
    end if;

    insert into public.funnel_visits (workspace_id, funnel_id, step_id, visitor_id, contact_id, event)
      values (r.workspace_id, v_funnel, r.step_id, 'order:' || r.id::text, r.contact_id, 'abandoned');
    begin
      perform public.emit_trigger(r.workspace_id, 'cart.abandoned',
        jsonb_build_object('invoice_id', r.id, 'funnel_id', v_funnel, 'step_id', r.step_id, 'contact_id', r.contact_id));
    exception when undefined_function then null; when others then null; end;
    v_count := v_count + 1;
  end loop;
  insert into public.funnel_job_runs (workspace_id, job_name, rows_affected) values (p_ws, 'sweep_abandoned_funnels', v_count);
  return v_count;
end $$;
revoke all on function public.sweep_abandoned_funnels(uuid) from public;
grant execute on function public.sweep_abandoned_funnels(uuid) to service_role;

create or replace function public.auto_promote_split_winners(p_ws uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_stats jsonb; v_count int := 0;
begin
  for r in
    select sp.step_id
    from public.funnel_splits sp
    where sp.status = 'running' and sp.auto_promote = true
      and (p_ws is null or sp.workspace_id = p_ws)
  loop
    v_stats := public.funnel_split_stats(r.step_id);
    if coalesce((v_stats->>'significant')::boolean, false) then
      perform public.promote_split_winner(r.step_id, v_stats->>'leader');
      v_count := v_count + 1;
    end if;
  end loop;
  insert into public.funnel_job_runs (workspace_id, job_name, rows_affected) values (p_ws, 'auto_promote_split_winners', v_count);
  return v_count;
end $$;
revoke all on function public.auto_promote_split_winners(uuid) from public;
grant execute on function public.auto_promote_split_winners(uuid) to service_role;
