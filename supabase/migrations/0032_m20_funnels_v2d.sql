-- ═══════════════════════════════════════════════════════════════════════════
-- 0032_m20_funnels_v2d.sql — M20 Funnels v2, Priority 8 (observability)
--
-- A read-only "what happened" surface derived entirely from data that already
-- exists — no new tables, no new writes. The automation delivery log comes
-- from M13's `workflow_executions` (every emit_trigger call in 0030 stamps
-- `funnel_id` into the trigger payload, so this is a plain filter + join to
-- `workflows.trigger_type`, nothing new to maintain). Abandoned/promoted
-- counts are derived from `funnel_visits`/`funnel_splits`, same as the rest
-- of M20's "compute on read" convention (D-108/D-158).
--
-- DECISIONS D-167.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.funnel_operations_log(p_funnel uuid, p_limit int default 25)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_ws uuid; v jsonb; v_abandoned int; v_promoted int;
begin
  select workspace_id into v_ws from public.funnels where id = p_funnel;
  if v_ws is null then raise exception 'funnel not found' using errcode = 'P0002'; end if;
  if not public.is_member(v_ws) then
    raise exception 'not a member of workspace %', v_ws using errcode = '42501';
  end if;
  if auth.uid() is not null and public.funnel_analytics_denied(p_funnel) then
    raise exception 'analytics access to this funnel has been restricted for your account' using errcode = '42501';
  end if;

  select count(*) into v_abandoned from public.funnel_visits where funnel_id = p_funnel and event = 'abandoned';
  select count(*) into v_promoted
  from public.funnel_splits sp join public.funnel_steps fs on fs.id = sp.step_id
  where fs.funnel_id = p_funnel and sp.status = 'promoted';

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.started_at desc), '[]'::jsonb) into v
  from (
    select w.trigger_type, we.status::text as status, we.error, we.started_at, we.completed_at
    from public.workflow_executions we
    join public.workflows w on w.id = we.workflow_id
    where we.workspace_id = v_ws and we.trigger_payload->>'funnel_id' = p_funnel::text
    order by we.started_at desc
    limit p_limit
  ) x;

  return jsonb_build_object('automation', v, 'abandoned_count', v_abandoned, 'promoted_count', v_promoted);
end $$;
revoke all on function public.funnel_operations_log(uuid, int) from public;
grant execute on function public.funnel_operations_log(uuid, int) to authenticated, service_role;
