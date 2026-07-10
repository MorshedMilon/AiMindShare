-- ═══════════════════════════════════════════════════════════════════════════
-- 0031_m20_funnels_v2c.sql — M20 Funnels v2, Priorities 6–7 (templates + permissions)
--
-- Continues 0029/0030's additive-only v2 upgrade.
--
-- Priority 6 — duplicate_funnel(): one function serves "duplicate", "save as
-- template", and "create from template" (a template is just a funnel row with
-- is_template=true and no site_id). Copies funnel_steps only — never splits
-- or visits, so a duplicate/template starts with a clean analytics slate
-- (D-163).
--
-- Priority 7 — funnel_access: a NARROW-ONLY per-user override (D-165). Its
-- absence for a given (funnel, user) means "use the workspace role, unchanged"
-- — it can only ever take something AWAY from a staff+ member on one funnel,
-- never grant a client (or anyone) more than D-109's operator ceiling already
-- allows. `can_view_analytics` is enforced SERVER-SIDE in this migration
-- (funnel_map / funnel_split_stats / funnel_revenue_summary all check it).
-- `can_edit` is deliberately UI-ONLY in this pass — enforcing it would mean
-- retrofitting the funnels/funnel_steps UPDATE/INSERT RLS policies, which is
-- exactly the kind of access-control change that needs its own dedicated
-- review, not a drive-by inside a templates+permissions migration. Flagged
-- honestly rather than silently left as a security gap (D-166).
--
-- DECISIONS D-163…D-166.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. funnels: template lineage (D-163) ─────────────────────────────────────
alter table public.funnels add column if not exists is_template   boolean not null default false;
alter table public.funnels add column if not exists template_of_id uuid references public.funnels(id) on delete set null;
create index if not exists funnels_template_idx on public.funnels (workspace_id, is_template);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. duplicate_funnel (D-163/D-164) — staff+. Copies the funnel row (new id,
--    status='draft', test_mode=false always) + every funnel_step (remapping
--    in-funnel `next_step_id`/`decline_step_id` references so routing survives
--    the copy). Never copies funnel_splits/funnel_visits.
--      p_as_template=true  → site_id/page_id stripped (a template isn't tied
--                             to one site until it's instantiated).
--      p_as_template=false → site_id defaults to the source's (a plain
--                             duplicate); pass p_site_id to instantiate a
--                             template into a specific site.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.duplicate_funnel(
  p_funnel uuid, p_as_template boolean default false, p_name text default null, p_site_id uuid default null
) returns public.funnels
language plpgsql security definer set search_path = public as $$
declare
  v_src public.funnels; v_new public.funnels; v_site uuid; v_name text;
  r record; v_new_step_id uuid; v_map jsonb := '{}'::jsonb;
begin
  select * into v_src from public.funnels where id = p_funnel;
  if v_src.id is null then raise exception 'funnel not found' using errcode = 'P0002'; end if;
  if auth.uid() is not null and not public.has_role(v_src.workspace_id, 'staff') then
    raise exception 'duplicating a funnel requires staff+' using errcode = '42501';
  end if;

  v_site := case when p_as_template then null else coalesce(p_site_id, v_src.site_id) end;
  v_name := coalesce(p_name, v_src.name || case when p_as_template then ' (Template)' else ' (Copy)' end);

  insert into public.funnels (workspace_id, site_id, name, status, settings, test_mode, is_template, template_of_id)
  values (v_src.workspace_id, v_site, v_name, 'draft', v_src.settings, false, p_as_template, p_funnel)
  returning * into v_new;

  for r in select * from public.funnel_steps where funnel_id = p_funnel order by step_order loop
    insert into public.funnel_steps (workspace_id, funnel_id, page_id, step_order, step_type, name, config)
    values (v_src.workspace_id, v_new.id, case when p_as_template then null else r.page_id end,
            r.step_order, r.step_type, r.name, r.config)
    returning id into v_new_step_id;
    v_map := v_map || jsonb_build_object(r.id::text, v_new_step_id::text);
  end loop;

  -- remap next_step_id/decline_step_id to the copied steps; drop either key
  -- if it pointed somewhere that (unexpectedly) didn't get copied.
  update public.funnel_steps
     set config = (config - 'next_step_id' - 'decline_step_id')
       || (case when v_map ? (config->>'next_step_id')
                then jsonb_build_object('next_step_id', v_map->>(config->>'next_step_id')) else '{}'::jsonb end)
       || (case when v_map ? (config->>'decline_step_id')
                then jsonb_build_object('decline_step_id', v_map->>(config->>'decline_step_id')) else '{}'::jsonb end)
   where funnel_id = v_new.id and (config ? 'next_step_id' or config ? 'decline_step_id');

  return v_new;
end $$;
revoke all on function public.duplicate_funnel(uuid, boolean, text, uuid) from public;
grant execute on function public.duplicate_funnel(uuid, boolean, text, uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. funnel_access (D-165) — narrow-only per-user override. staff+ read (so a
--    member can see who's been restricted on a funnel they can already see);
--    manager+ write (granting/restricting is a management action).
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.funnel_access (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  funnel_id           uuid not null references public.funnels(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  can_edit            boolean not null default true,
  can_view_analytics  boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz,
  unique (funnel_id, user_id)
);
create index if not exists funnel_access_funnel_idx on public.funnel_access (funnel_id);
create index if not exists funnel_access_ws_idx     on public.funnel_access (workspace_id);

alter table public.funnel_access enable row level security;
create policy funnel_access_sel on public.funnel_access for select using ( public.has_role(workspace_id,'staff') );
create policy funnel_access_ins on public.funnel_access for insert with check ( public.has_role(workspace_id,'manager') );
create policy funnel_access_upd on public.funnel_access for update using ( public.has_role(workspace_id,'manager') ) with check ( public.has_role(workspace_id,'manager') );
create policy funnel_access_del on public.funnel_access for delete using ( public.has_role(workspace_id,'manager') );

create trigger funnel_access_set_updated_at before update on public.funnel_access
  for each row execute function public.set_updated_at();

-- ── 3. set_funnel_access / remove_funnel_access (manager+) ──────────────────
create or replace function public.set_funnel_access(
  p_funnel uuid, p_user uuid, p_can_edit boolean default true, p_can_view_analytics boolean default true
) returns public.funnel_access
language plpgsql security definer set search_path = public as $$
declare v_ws uuid; v_row public.funnel_access;
begin
  select workspace_id into v_ws from public.funnels where id = p_funnel;
  if v_ws is null then raise exception 'funnel not found' using errcode = 'P0002'; end if;
  if auth.uid() is not null and not public.has_role(v_ws, 'manager') then
    raise exception 'managing funnel access requires manager+' using errcode = '42501';
  end if;
  insert into public.funnel_access (workspace_id, funnel_id, user_id, can_edit, can_view_analytics)
  values (v_ws, p_funnel, p_user, p_can_edit, p_can_view_analytics)
  on conflict (funnel_id, user_id) do update
    set can_edit = excluded.can_edit, can_view_analytics = excluded.can_view_analytics
  returning * into v_row;
  return v_row;
end $$;
revoke all on function public.set_funnel_access(uuid, uuid, boolean, boolean) from public;
grant execute on function public.set_funnel_access(uuid, uuid, boolean, boolean) to authenticated, service_role;

create or replace function public.remove_funnel_access(p_funnel uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ws uuid;
begin
  select workspace_id into v_ws from public.funnels where id = p_funnel;
  if v_ws is null then raise exception 'funnel not found' using errcode = 'P0002'; end if;
  if auth.uid() is not null and not public.has_role(v_ws, 'manager') then
    raise exception 'managing funnel access requires manager+' using errcode = '42501';
  end if;
  delete from public.funnel_access where funnel_id = p_funnel and user_id = p_user;
end $$;
revoke all on function public.remove_funnel_access(uuid, uuid) from public;
grant execute on function public.remove_funnel_access(uuid, uuid) to authenticated, service_role;

-- ── 4. funnel_analytics_denied — the shared narrowing check (D-165) ─────────
create or replace function public.funnel_analytics_denied(p_funnel uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.funnel_access fa
    where fa.funnel_id = p_funnel and fa.user_id = auth.uid() and fa.can_view_analytics = false
  );
$$;
revoke all on function public.funnel_analytics_denied(uuid) from public;
grant execute on function public.funnel_analytics_denied(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. funnel_map / funnel_split_stats / funnel_revenue_summary — add the
--    funnel_analytics_denied() check right after the existing membership
--    guard (D-165). Signatures unchanged; a caller with no funnel_access row
--    (the entire user base today) sees no behavior change at all.
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
           (select count(*) from public.funnel_splits sp where sp.step_id = st.id and sp.status = 'running') > 0 as has_split
    from public.funnel_steps st
    left join (
      select step_id,
             count(distinct visitor_id) filter (where event = 'view') as visitors,
             count(distinct visitor_id) filter (where event in ('optin','purchase')) as conversions
      from public.funnel_visits
      where funnel_id = p_funnel
      group by step_id
    ) vc on vc.step_id = st.id
    where st.funnel_id = p_funnel
  ) s;
  return v;
end $$;
revoke all on function public.funnel_map(uuid) from public;
grant execute on function public.funnel_map(uuid) to authenticated, service_role;

create or replace function public.funnel_split_stats(p_step uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ws uuid; v_funnel uuid; v_split_id uuid; v_goal text; v_status text; v_winner text;
  v_c_page uuid; v_min_n int; v_conf numeric; v_auto boolean;
  na int; nb int; nc int; ca int; cb int; cc int;
  pa numeric; pb numeric; pc numeric;
  v_conv text; v_zthr numeric;
  v_leader text; v_leader_p numeric; v_leader_n int;
  v_sig boolean := true; v_checked boolean := false;
  v_pp numeric; v_se numeric; v_z numeric; v_min_abs_z numeric; v_report_z numeric := 0;
  arm record;
begin
  select sp.id, sp.workspace_id, fs.funnel_id, sp.goal, sp.status, sp.winner,
         sp.variant_c_page_id, sp.min_sample_size, sp.confidence, sp.auto_promote
    into v_split_id, v_ws, v_funnel, v_goal, v_status, v_winner, v_c_page, v_min_n, v_conf, v_auto
  from public.funnel_steps fs
  join public.funnel_splits sp on sp.step_id = fs.id
  where fs.id = p_step
  order by sp.created_at desc limit 1;
  if v_split_id is null then raise exception 'no split for step' using errcode = 'P0002'; end if;
  if auth.uid() is not null and not public.is_member(v_ws) then
    raise exception 'not a member of workspace %', v_ws using errcode = '42501';
  end if;
  if auth.uid() is not null and public.funnel_analytics_denied(v_funnel) then
    raise exception 'analytics access to this funnel has been restricted for your account' using errcode = '42501';
  end if;

  v_conv := case when v_goal = 'purchase' then 'purchase' else 'progression' end;

  select
    count(distinct visitor_id) filter (where variant = 'A' and event = 'view'),
    count(distinct visitor_id) filter (where variant = 'B' and event = 'view'),
    count(distinct visitor_id) filter (where variant = 'C' and event = 'view'),
    count(distinct visitor_id) filter (where variant = 'A' and (event = 'purchase' or (v_conv='progression' and event='optin'))),
    count(distinct visitor_id) filter (where variant = 'B' and (event = 'purchase' or (v_conv='progression' and event='optin'))),
    count(distinct visitor_id) filter (where variant = 'C' and (event = 'purchase' or (v_conv='progression' and event='optin')))
  into na, nb, nc, ca, cb, cc
  from public.funnel_visits where step_id = p_step;

  na := coalesce(na,0); nb := coalesce(nb,0); nc := coalesce(nc,0);
  ca := coalesce(ca,0); cb := coalesce(cb,0); cc := coalesce(cc,0);
  pa := case when na > 0 then ca::numeric / na else 0 end;
  pb := case when nb > 0 then cb::numeric / nb else 0 end;
  pc := case when nc > 0 then cc::numeric / nc else 0 end;

  v_zthr := case when v_conf >= 0.995 then 2.807 when v_conf >= 0.99 then 2.576
                 when v_conf >= 0.95  then 1.96  when v_conf >= 0.90 then 1.645
                 else 1.96 end;

  v_leader := 'A'; v_leader_p := pa; v_leader_n := na;
  if nb > 0 and pb >= v_leader_p then v_leader := 'B'; v_leader_p := pb; v_leader_n := nb; end if;
  if nc > 0 and pc >= v_leader_p then v_leader := 'C'; v_leader_p := pc; v_leader_n := nc; end if;

  for arm in
    select k, p, n from (values ('A'::text, pa, na), ('B'::text, pb, nb), ('C'::text, pc, nc)) as t(k, p, n)
    where t.k <> v_leader and t.n > 0
  loop
    v_checked := true;
    v_pp := (v_leader_p * v_leader_n + arm.p * arm.n) / (v_leader_n + arm.n);
    v_se := sqrt(nullif(v_pp * (1 - v_pp) * (1.0/v_leader_n + 1.0/arm.n), 0));
    v_z  := case when v_se is not null and v_se > 0 then (v_leader_p - arm.p) / v_se else 0 end;
    if v_min_abs_z is null or abs(v_z) < v_min_abs_z then v_min_abs_z := abs(v_z); v_report_z := v_z; end if;
    if not (abs(v_z) >= v_zthr and v_leader_n >= v_min_n and arm.n >= v_min_n) then
      v_sig := false;
    end if;
  end loop;
  if not v_checked then v_sig := false; v_report_z := 0; end if;

  return jsonb_build_object(
    'a', jsonb_build_object('visitors', na, 'conversions', ca, 'rate', round(pa*100,1)),
    'b', jsonb_build_object('visitors', nb, 'conversions', cb, 'rate', round(pb*100,1)),
    'c', case when v_c_page is not null
           then jsonb_build_object('visitors', nc, 'conversions', cc, 'rate', round(pc*100,1))
           else null end,
    'has_c', v_c_page is not null,
    'z', round(v_report_z, 3), 'significant', v_sig, 'leader', v_leader,
    'goal', v_goal, 'status', v_status, 'winner', v_winner,
    'min_sample_size', v_min_n, 'confidence', v_conf, 'auto_promote', v_auto
  );
end $$;
revoke all on function public.funnel_split_stats(uuid) from public;
grant execute on function public.funnel_split_stats(uuid) to authenticated, service_role;

create or replace function public.funnel_revenue_summary(
  p_funnel uuid, p_from timestamptz default null, p_to timestamptz default null
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ws uuid; v_step_ids uuid[]; v jsonb;
  v_revenue bigint; v_orders int; v_visitors int;
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

  return v;
end $$;
revoke all on function public.funnel_revenue_summary(uuid, timestamptz, timestamptz) from public;
grant execute on function public.funnel_revenue_summary(uuid, timestamptz, timestamptz) to authenticated, service_role;
