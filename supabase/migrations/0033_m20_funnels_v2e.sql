-- ═══════════════════════════════════════════════════════════════════════════
-- 0033_m20_funnels_v2e.sql — M20 Funnels v2, Priority 9 Step 2 (Contacts/Entries)
--
-- The last item on the v2 upgrade brief. Everything else in this upgrade
-- reused already-loaded data; this is the one section that needed a genuinely
-- new read: a paginated, one-row-per-visitor entrant list (source, furthest
-- step reached, variant assignment, order status) aggregated from the
-- existing `funnel_visits` event stream — no new tables, no new writes.
--
-- `visitor_id LIKE 'order:%'` rows are create_funnel_order's own bookkeeping
-- marker (D-110/D-112's idempotency marker for the abandonment sweep) — not a
-- real visitor, so they're excluded from the entrant list the same way they're
-- excluded from `funnel_map`'s visitor counts.
--
-- Unlike the revenue/analytics RPCs, test-mode entrants are NOT excluded here
-- (D-154 is specifically about keeping test data out of REVENUE math) — an
-- operator testing their own funnel needs to see themselves in this list to
-- confirm tracking works. Each row carries `is_test` so the UI can badge it.
--
-- DECISIONS D-169.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.funnel_entrants(
  p_funnel uuid, p_limit int default 50, p_offset int default 0
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_ws uuid; v jsonb; v_total int; v_step_ids uuid[];
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

  select count(*) into v_total from (
    select distinct visitor_id from public.funnel_visits
    where funnel_id = p_funnel and visitor_id not like 'order:%'
  ) t;

  with entrants as (
    select
      fv.visitor_id,
      min(fv.created_at) as first_seen,
      max(fv.created_at) as last_seen,
      (array_agg(fv.contact_id order by fv.created_at) filter (where fv.contact_id is not null))[1] as contact_id,
      bool_or(fv.is_test) as is_test,
      (array_agg(fv.variant order by fv.created_at) filter (where fv.variant is not null))[1] as variant,
      (array_agg(fv.utm order by fv.created_at) filter (where fv.utm <> '{}'::jsonb))[1] as utm,
      max(fs.step_order) as furthest_step_order,
      bool_or(fv.event = 'purchase') as purchased
    from public.funnel_visits fv
    left join public.funnel_steps fs on fs.id = fv.step_id
    where fv.funnel_id = p_funnel and fv.visitor_id not like 'order:%'
    group by fv.visitor_id
  ),
  latest_order as (
    select distinct on (i.contact_id) i.contact_id, i.status, i.amount_paid
    from public.invoices i
    where i.source_type = 'order' and i.source_id = any(v_step_ids) and i.contact_id is not null
    order by i.contact_id, i.created_at desc
  )
  select coalesce(jsonb_agg(row_to_json(z)::jsonb order by z.last_seen desc), '[]'::jsonb) into v
  from (
    select
      e.visitor_id, e.first_seen, e.last_seen, e.contact_id, e.is_test,
      e.variant, coalesce(nullif(e.utm->>'utm_source',''), 'direct') as source,
      fs.name as furthest_step_name, e.furthest_step_order, e.purchased,
      c.first_name, c.last_name, c.email,
      lo.status as order_status, lo.amount_paid as order_amount_paid
    from entrants e
    left join public.funnel_steps fs on fs.funnel_id = p_funnel and fs.step_order = e.furthest_step_order
    left join public.contacts c on c.id = e.contact_id
    left join latest_order lo on lo.contact_id = e.contact_id
    order by e.last_seen desc
    limit p_limit offset p_offset
  ) z;

  return jsonb_build_object('entrants', v, 'total', v_total);
end $$;
revoke all on function public.funnel_entrants(uuid, int, int) from public;
grant execute on function public.funnel_entrants(uuid, int, int) to authenticated, service_role;
