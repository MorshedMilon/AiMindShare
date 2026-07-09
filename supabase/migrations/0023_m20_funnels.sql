-- ═══════════════════════════════════════════════════════════════════════════
-- 0023_m20_funnels.sql — M20 Funnels (Session 19)
-- Multi-step conversion flows on top of the M19 page engine: opt-in → sales →
-- order → upsell → thank-you, with per-step conversion tracking and A/B split
-- testing. The ClickFunnels slice. Built VERTICALLY on the locked stack —
-- vanilla HTML/CSS/JS + Supabase — NOT the PRD's Prisma/Recharts/Next sketch.
--
-- A funnel is an ORDERED LIST of M19 pages (funnel_steps.page_id → pages.id),
-- each tagged with a step_type. funnel_visits is the per-step event stream that
-- powers both the conversion waterfall and the A/B stats. Orders wire to M28 by
-- creating an invoices row (source_type='order') — NO separate orders table
-- (D-110); M28's calc_invoice_totals trigger stays the money truth so a browser
-- can never forge an order total.
--
-- Depends on: 0000 (gen_random_uuid, set_updated_at), 0001 tenancy (is_member/
-- has_role), 0013 M09 (contacts, activity_log), 0016 M13 (emit_trigger — best-
-- effort), 0018 M28 (invoices, source_type/source_id, calc trigger), and the
-- M19 site engine (0022_m19_sites.sql — sites/pages). funnel_steps.page_id FKs
-- public.pages, so the M19 sites migration MUST load before this one — hence
-- M20's number is deliberately HIGHER than M19's.
--
-- Migration numbered 0023. ⚠ These numbers are being actively reconciled by
-- several PARALLEL build sessions (memory: modules built concurrently, files
-- change live). Observed churn this session: M19 sites moved 0020→0022; M06 media
-- claimed 0021; M15/M16 collided on 0020. M20 took 0023 (the next free slot ABOVE
-- M19's 0022, preserving the pages-before-funnels apply order). Re-verify 0023 is
-- free on merge — numbering collisions are a human reconcile; this file has no
-- ordering dep on M06/M15/M16. Migrations are append-only.
--
-- Logged extensions / deviations from canonical DATA-SCHEMA §9 (Law 8 → DECISIONS):
--   • D-107  A/B lives in a dedicated funnel_splits table (a variant = an alternate
--            page_id), not columns on funnel_steps — a step can exist without a test.
--   • D-108  funnel_visits per-step event stream (view/optin/purchase/abandoned) is
--            the single source for the waterfall AND the A/B stats; service-role-
--            written only (Gate-4), mirroring form_views / visitor_sessions.
--   • D-109  funnels use the M19 OPERATOR-CEILING RLS (staff+ SELECT; a client role
--            cannot read the workspace's funnels), not the generic member-read
--            template — funnels are operator surfaces like sites (mirrors D-089).
--   • D-110  funnel orders wire to M28 by inserting an invoices row with
--            source_type='order' — no separate orders table; reuses M28 money truth.
--   • D-111  winner detection = fixed-horizon two-proportion z-test, server-side
--            (funnel_split_stats). Sequential/Bayesian stopping deferred (scaffold).
--   • D-112  m20-abandoned-sweep hourly pg_cron → cart.abandoned; one-click off-
--            session Stripe upsell deferred (UI + create_funnel_order seam present).
--
-- PGlite-safety: the probe strips `create extension`. Enums are guarded. cron +
-- realtime are guarded (unavailable under PGlite → a NOTICE, not a failure). Every
-- new tenant table enables RLS in THIS file (DoD Gate-8 Law 2).
--
-- Order: enums → tables → RLS + policies → triggers → functions → grants → cron
-- → realtime.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. Enums (guarded — a duplicate is a no-op on re-run) ─────────────────────
do $$ begin
  create type public.funnel_status as enum ('draft','active','archived');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.funnel_step_type as enum
    ('optin','sales','order','upsell','downsell','thankyou');
exception when duplicate_object then null; end $$;

-- ── 1. funnels — one row per funnel. settings jsonb carries the pipeline/stage
-- mapping for purchases and the abandonment window (hours). status gates it.
create table if not exists public.funnels (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  site_id       uuid references public.sites(id) on delete set null,   -- the M19 site the pages live under
  name          text not null,
  description   text,
  status        public.funnel_status not null default 'draft',
  settings      jsonb not null default '{}',   -- {pipeline_id, stage_id, abandon_hours, currency}
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  archived_at   timestamptz
);
create index if not exists funnels_ws_idx on public.funnels (workspace_id, status);

-- ── 2. funnel_steps — an ordered step = an M19 page + a step_type. config jsonb
-- carries the order-step product(s), bump offer, coupon and step-progression
-- routing (on submit → next; on purchase → upsell; on decline → downsell).
create table if not exists public.funnel_steps (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  funnel_id     uuid not null references public.funnels(id) on delete cascade,
  page_id       uuid references public.pages(id) on delete set null,   -- the live M19 page for this step
  step_order    int  not null default 0,
  step_type     public.funnel_step_type not null default 'sales',
  name          text not null default 'Step',
  config        jsonb not null default '{}',   -- {products:[{name,price,recurring}], bump:{...}, coupon, next_step_id, ...}
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);
create index if not exists funnel_steps_ws_idx     on public.funnel_steps (workspace_id);
create index if not exists funnel_steps_funnel_idx on public.funnel_steps (funnel_id, step_order);

-- ── 3. funnel_splits — an A/B test on one step. variant A = the step's live
-- page_id; variant B = variant_page_id. split = % of traffic to B. goal decides
-- what counts as a conversion. winner/promoted_at set by promote_split_winner.
create table if not exists public.funnel_splits (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  step_id         uuid not null references public.funnel_steps(id) on delete cascade,
  variant_page_id uuid references public.pages(id) on delete set null,   -- variant B page
  split           int  not null default 50,                              -- % of traffic to B
  goal            text not null default 'progression',                   -- progression | purchase
  status          text not null default 'running',                      -- running | promoted | stopped
  winner          text,                                                  -- 'A' | 'B'
  promoted_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  constraint funnel_splits_split_chk  check (split between 0 and 100),
  constraint funnel_splits_goal_chk   check (goal in ('progression','purchase')),
  constraint funnel_splits_status_chk check (status in ('running','promoted','stopped')),
  constraint funnel_splits_winner_chk check (winner is null or winner in ('A','B'))
);
create index if not exists funnel_splits_step_idx on public.funnel_splits (step_id);

-- ── 4. funnel_visits — the per-step event stream (D-108). One row per event.
-- Written ONLY by the public-funnel Edge Fn under the service role (a public
-- visitor has no session). variant ('A'/'B') powers the split stats; visitor_id
-- is a first-party cookie id; contact_id is set once the visitor opts in.
create table if not exists public.funnel_visits (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  funnel_id     uuid not null references public.funnels(id) on delete cascade,
  step_id       uuid references public.funnel_steps(id) on delete set null,
  visitor_id    text not null,
  contact_id    uuid references public.contacts(id) on delete set null,
  variant       text,                                     -- 'A' | 'B' | null
  event         text not null default 'view',             -- view | optin | purchase | abandoned
  utm           jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  constraint funnel_visits_event_chk check (event in ('view','optin','purchase','abandoned'))
);
create index if not exists funnel_visits_funnel_idx on public.funnel_visits (funnel_id, created_at);
create index if not exists funnel_visits_step_idx   on public.funnel_visits (step_id, event);
create index if not exists funnel_visits_ws_idx     on public.funnel_visits (workspace_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. RLS — M19 operator-ceiling posture (D-109). funnels/steps/splits:
--    staff+ SELECT+INSERT+UPDATE · manager+ DELETE (a client role reads nothing —
--    funnels are operator surfaces). funnel_visits: staff+ SELECT · NO client
--    write (the public-funnel Edge Fn writes under the service role, Gate-4).
--    Every table below enables RLS in THIS file.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.funnels enable row level security;
create policy funnels_sel on public.funnels for select using ( public.has_role(workspace_id,'staff') );
create policy funnels_ins on public.funnels for insert with check ( public.has_role(workspace_id,'staff') );
create policy funnels_upd on public.funnels for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy funnels_del on public.funnels for delete using ( public.has_role(workspace_id,'manager') );

alter table public.funnel_steps enable row level security;
create policy funnel_steps_sel on public.funnel_steps for select using ( public.has_role(workspace_id,'staff') );
create policy funnel_steps_ins on public.funnel_steps for insert with check ( public.has_role(workspace_id,'staff') );
create policy funnel_steps_upd on public.funnel_steps for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy funnel_steps_del on public.funnel_steps for delete using ( public.has_role(workspace_id,'manager') );

alter table public.funnel_splits enable row level security;
create policy funnel_splits_sel on public.funnel_splits for select using ( public.has_role(workspace_id,'staff') );
create policy funnel_splits_ins on public.funnel_splits for insert with check ( public.has_role(workspace_id,'staff') );
create policy funnel_splits_upd on public.funnel_splits for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy funnel_splits_del on public.funnel_splits for delete using ( public.has_role(workspace_id,'manager') );

alter table public.funnel_visits enable row level security;
create policy funnel_visits_sel on public.funnel_visits for select using ( public.has_role(workspace_id,'staff') );
-- no client insert/update/delete: the public-funnel Edge Fn (service role) owns the writes (Gate-4/D-108).

-- ── 6. updated_at maintenance ─────────────────────────────────────────────────
create trigger funnels_set_updated_at       before update on public.funnels       for each row execute function public.set_updated_at();
create trigger funnel_steps_set_updated_at  before update on public.funnel_steps  for each row execute function public.set_updated_at();
create trigger funnel_splits_set_updated_at before update on public.funnel_splits for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. funnel_map — steps + per-step conversion stats for the step map + waterfall.
--    Per step: visitors = distinct visitor_id with event='view'; conversions =
--    distinct visitor_id with event in ('optin','purchase'); rate = conv/visitors.
--    STABLE + definer with a member guard (the browser reads this via rpc).
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. funnel_split_stats — per-variant A/B stats + a fixed-horizon two-proportion
--    z-test (D-111). Returns visitors/conversions/rate per variant, the z score,
--    significance (|z| > 1.96 = 95%) once both arms clear a 30-visitor floor, and
--    the leading variant. Deterministic + server-side so the UI and probe agree.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.funnel_split_stats(p_step uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ws uuid; v_split_id uuid; v_goal text; v_status text; v_winner text;
  na int; nb int; ca int; cb int;
  pa numeric; pb numeric; pp numeric; se numeric; z numeric := 0;
  v_sig boolean := false; v_leader text; v_conv text;
begin
  select sp.id, sp.workspace_id, sp.goal, sp.status, sp.winner
    into v_split_id, v_ws, v_goal, v_status, v_winner
  from public.funnel_steps fs
  join public.funnel_splits sp on sp.step_id = fs.id
  where fs.id = p_step
  order by sp.created_at desc limit 1;
  if v_split_id is null then raise exception 'no split for step' using errcode = 'P0002'; end if;
  if not public.is_member(v_ws) then
    raise exception 'not a member of workspace %', v_ws using errcode = '42501';
  end if;

  -- 'purchase' goal counts only purchases; 'progression' counts optin OR purchase.
  v_conv := case when v_goal = 'purchase' then 'purchase' else 'progression' end;

  select
    count(distinct visitor_id) filter (where variant = 'A' and event = 'view'),
    count(distinct visitor_id) filter (where variant = 'B' and event = 'view'),
    count(distinct visitor_id) filter (where variant = 'A' and (event = 'purchase' or (v_conv='progression' and event='optin'))),
    count(distinct visitor_id) filter (where variant = 'B' and (event = 'purchase' or (v_conv='progression' and event='optin')))
  into na, nb, ca, cb
  from public.funnel_visits where step_id = p_step;

  na := coalesce(na,0); nb := coalesce(nb,0); ca := coalesce(ca,0); cb := coalesce(cb,0);
  pa := case when na > 0 then ca::numeric / na else 0 end;
  pb := case when nb > 0 then cb::numeric / nb else 0 end;

  if na > 0 and nb > 0 then
    pp := (ca + cb)::numeric / (na + nb);
    se := sqrt( nullif(pp * (1 - pp) * (1.0/na + 1.0/nb), 0) );
    if se is not null and se > 0 then z := (pa - pb) / se; end if;
    v_sig := (abs(z) > 1.96) and na >= 30 and nb >= 30;
  end if;
  v_leader := case when pa >= pb then 'A' else 'B' end;

  return jsonb_build_object(
    'a', jsonb_build_object('visitors', na, 'conversions', ca, 'rate', round(pa*100,1)),
    'b', jsonb_build_object('visitors', nb, 'conversions', cb, 'rate', round(pb*100,1)),
    'z', round(z, 3), 'significant', v_sig, 'leader', v_leader,
    'goal', v_goal, 'status', v_status, 'winner', v_winner
  );
end $$;
revoke all on function public.funnel_split_stats(uuid) from public;
grant execute on function public.funnel_split_stats(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. promote_split_winner — declare a variant the winner (manager+). If B wins,
--    swap the winning page in as the step's live page_id. Marks the split
--    promoted. Definer with an explicit manager guard (a real caller only).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.promote_split_winner(p_step uuid, p_variant text)
returns public.funnel_splits language plpgsql security definer set search_path = public as $$
declare v_ws uuid; v_split_id uuid; v_variant_page uuid; v_split public.funnel_splits;
begin
  if p_variant not in ('A','B') then raise exception 'variant must be A or B' using errcode = '22023'; end if;
  select sp.id, sp.workspace_id, sp.variant_page_id
    into v_split_id, v_ws, v_variant_page
  from public.funnel_steps fs
  join public.funnel_splits sp on sp.step_id = fs.id
  where fs.id = p_step
  order by sp.created_at desc limit 1;
  if v_split_id is null then raise exception 'no split for step' using errcode = 'P0002'; end if;
  if auth.uid() is not null and not public.has_role(v_ws, 'manager') then
    raise exception 'promoting a winner requires manager+' using errcode = '42501';
  end if;

  -- B wins → make its page the live step page.
  if p_variant = 'B' and v_variant_page is not null then
    update public.funnel_steps set page_id = v_variant_page where id = p_step;
  end if;

  update public.funnel_splits
     set status = 'promoted', winner = p_variant, promoted_at = now()
   where id = v_split_id
   returning * into v_split;
  return v_split;
end $$;
revoke all on function public.promote_split_winner(uuid, text) from public;
grant execute on function public.promote_split_winner(uuid, text) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. create_funnel_order — the "order forms wired to M28" seam (D-110). Builds
--     an M28 invoices row (kind='invoice', source_type='order', source_id=step)
--     from the order step's items (+ optional bump line). M28's invoices_before_write
--     trigger recomputes totals + assigns the number, so the browser can NEVER
--     forge the total. Returns the invoice. Service-role only (the public Edge Fn).
--     items = [{description, qty, unit_price(minor)}]; bump = one extra line or null.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.create_funnel_order(
  p_ws uuid, p_funnel uuid, p_step uuid, p_contact uuid,
  p_items jsonb, p_currency text default 'USD', p_bump jsonb default null
) returns public.invoices
language plpgsql security definer set search_path = public as $$
declare v_items jsonb; v_inv public.invoices;
begin
  v_items := coalesce(p_items, '[]'::jsonb);
  if p_bump is not null and p_bump <> 'null'::jsonb then
    v_items := v_items || jsonb_build_array(p_bump);
  end if;
  if jsonb_array_length(v_items) = 0 then
    raise exception 'order has no line items' using errcode = '22023';
  end if;

  insert into public.invoices
    (workspace_id, contact_id, kind, currency, line_items, status, source_type, source_id)
  values
    (p_ws, p_contact, 'invoice', coalesce(p_currency,'USD'), v_items, 'sent', 'order', p_step)
  returning * into v_inv;

  -- Link the order into the funnel event stream (purchase is recorded later, on the
  -- payment webhook). This 'view' marks the order step reached for this contact.
  insert into public.funnel_visits (workspace_id, funnel_id, step_id, visitor_id, contact_id, event)
  values (p_ws, p_funnel, p_step, 'order:' || v_inv.id::text, p_contact, 'view');

  return v_inv;
end $$;
revoke all on function public.create_funnel_order(uuid, uuid, uuid, uuid, jsonb, text, jsonb) from public;
grant execute on function public.create_funnel_order(uuid, uuid, uuid, uuid, jsonb, text, jsonb) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. record_funnel_event — the public tracker beacon body. Appends a funnel_visits
--     row; on 'optin' upserts the CRM contact (M09) + a source tag and links it;
--     on 'purchase' best-effort fires the M13 bus. Service-role only.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.record_funnel_event(
  p_ws uuid, p_funnel uuid, p_step uuid, p_visitor text, p_event text,
  p_variant text default null, p_contact uuid default null,
  p_email text default null, p_name text default null, p_utm jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_contact uuid := p_contact; v_first text; v_last text; v_email text;
  v_tag uuid; v_tag_name text; v_visit uuid;
begin
  if p_event not in ('view','optin','purchase','abandoned') then
    raise exception 'bad event %', p_event using errcode = '22023';
  end if;

  -- opt-in: resolve/insert the contact (M09), then attach the funnel source tag.
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

  insert into public.funnel_visits (workspace_id, funnel_id, step_id, visitor_id, contact_id, variant, event, utm)
  values (p_ws, p_funnel, p_step, coalesce(p_visitor,'anon'), v_contact, p_variant, p_event, coalesce(p_utm,'{}'::jsonb))
  returning id into v_visit;

  if p_event = 'purchase' then
    begin
      perform public.emit_trigger(p_ws, 'payment.received',
        jsonb_build_object('funnel_id', p_funnel, 'step_id', p_step, 'contact_id', v_contact));
    exception when undefined_function then null; when others then null; end;
  end if;

  return v_visit;
end $$;
revoke all on function public.record_funnel_event(uuid, uuid, uuid, text, text, text, uuid, text, text, jsonb) from public;
grant execute on function public.record_funnel_event(uuid, uuid, uuid, text, text, text, uuid, text, text, jsonb) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. sweep_abandoned_funnels — order started (invoice source_type='order') and
--     unpaid > abandon window (default 1h) → emit cart.abandoned (M13) for the
--     recovery sequence (D-112). Idempotent: an 'abandoned' funnel_visits marker
--     (visitor_id 'order:<invoice>') gates a second emit. SQL-in-a-function so the
--     worker cron and the PGlite probe run identical logic (M28 sweep pattern).
--     Service-role (system job). Returns the number of orders flagged.
-- ═══════════════════════════════════════════════════════════════════════════
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
      and (p_ws is null or i.workspace_id = p_ws)
  loop
    select fs.funnel_id, coalesce((f.settings->>'abandon_hours')::int, 1)
      into v_funnel, v_hours
    from public.funnel_steps fs join public.funnels f on f.id = fs.funnel_id
    where fs.id = r.step_id;
    if v_funnel is null then continue; end if;
    if r.created_at > now() - make_interval(hours => coalesce(v_hours,1)) then continue; end if;

    -- idempotency: skip if we already marked this order abandoned.
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
  return v_count;
end $$;
revoke all on function public.sweep_abandoned_funnels(uuid) from public;
grant execute on function public.sweep_abandoned_funnels(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. pg_cron — hourly abandoned-order sweep (D-112). Registered in
--     JOBS-AND-WORKERS-SPEC §5. Guarded for PGlite (no pg_cron there).
-- ═══════════════════════════════════════════════════════════════════════════
do $$ begin
  perform cron.schedule('m20-abandoned-sweep', '20 * * * *',
    $cron$ select public.sweep_abandoned_funnels(); $cron$);
exception when others then
  raise notice 'pg_cron unavailable — m20-abandoned-sweep not scheduled (%).', sqlerrm;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. Realtime — funnels + funnel_visits in the publication so the step map and
--     the revenue glance live-update. Guarded for PGlite.
-- ═══════════════════════════════════════════════════════════════════════════
do $$ begin
  alter publication supabase_realtime add table public.funnels;
exception when others then
  raise notice 'supabase_realtime unavailable — funnels not added (%).', sqlerrm;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.funnel_visits;
exception when others then
  raise notice 'supabase_realtime unavailable — funnel_visits not added (%).', sqlerrm;
end $$;
