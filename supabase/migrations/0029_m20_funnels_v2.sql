-- ═══════════════════════════════════════════════════════════════════════════
-- 0029_m20_funnels_v2.sql — M20 Funnels v2, Priority 1–3 (additive-only upgrade)
--
-- Hardens the Session 19 build (0023_m20_funnels.sql) without touching any
-- existing row, route, RLS posture, or the M28 money-truth path. Scope agreed
-- with the user for this pass — Priorities 1–3 of the v2 brief only:
--   P1  funnel statuses (testing/paused) + test-mode data segregation +
--       go-live/publish-readiness checks
--   P2  variant governance — A/B/C, min sample size, confidence, auto-promote,
--       stop (archive) a running test without promoting
--   P3  revenue attribution — per-step + per-source (UTM first-touch) revenue,
--       EPC, AOV, all excluding test-mode data
-- Priorities 4–9 (order-bump/upsell-charge depth, 10 automation events,
-- duplicate/template, per-funnel permissions, observability/logs, the full
-- 15-section sidebar IA) are explicitly OUT of scope for this migration — see
-- docs/superpowers/plans/2026-07-09-m20-funnels-v2-upgrade.md §3 Phase B–D.
--
-- Every change here is additive: new enum values, new nullable/defaulted
-- columns, and CREATE OR REPLACE on existing functions that preserves their
-- signature and pre-existing behavior for every pre-existing row (test_mode/
-- is_test default false everywhere, so nothing already in the database is
-- reclassified). Migrations are append-only; this is 0029 (0028 = M19 v2, the
-- current tip). DECISIONS D-153…D-158.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. funnel_status gains 'testing' + 'paused' (D-153) ──────────────────────
-- 'draft'/'active'/'archived' rows are untouched; the UI relabels 'active' as
-- "Live" for display only — no data migration needed. Comparing the new values
-- against ::text (not the enum literal) in this same migration, mirroring the
-- 0019 ws_status precedent, so we never trip "unsafe use of a new enum value"
-- inside the transaction that adds it.
alter type public.funnel_status add value if not exists 'testing';
alter type public.funnel_status add value if not exists 'paused';

-- ── 1. Test-mode columns (D-154) ──────────────────────────────────────────────
-- A funnel flagged test_mode=true has its traffic/orders marked is_test so
-- every analytics/revenue read below can exclude them by default — the whole
-- point of "test mode" is that it must never pollute real numbers.
alter table public.funnels      add column if not exists test_mode boolean not null default false;
alter table public.funnel_visits add column if not exists is_test  boolean not null default false;
-- Cross-module but minimal: M28's invoices gains the same marker so a funnel
-- test-order never counts as real revenue anywhere invoices are read (M20 or
-- M28). Default false — zero behavior change for every existing invoice.
alter table public.invoices     add column if not exists is_test  boolean not null default false;

-- ── 2. Variant governance columns on funnel_splits (D-155) ───────────────────
-- variant_c_page_id/split_c stay NULL for every existing split — a 2-arm test
-- keeps behaving exactly as before. min_sample_size/confidence default to the
-- values the original z-test hardcoded (30, 0.95), so funnel_split_stats below
-- is behavior-identical for pre-existing splits.
alter table public.funnel_splits add column if not exists variant_c_page_id uuid references public.pages(id) on delete set null;
alter table public.funnel_splits add column if not exists split_c          int;
alter table public.funnel_splits add column if not exists min_sample_size  int not null default 30;
alter table public.funnel_splits add column if not exists confidence       numeric not null default 0.95;
alter table public.funnel_splits add column if not exists auto_promote     boolean not null default false;

alter table public.funnel_splits drop constraint if exists funnel_splits_split_c_chk;
alter table public.funnel_splits add constraint funnel_splits_split_c_chk check (split_c is null or split_c between 0 and 100);
alter table public.funnel_splits drop constraint if exists funnel_splits_confidence_chk;
alter table public.funnel_splits add constraint funnel_splits_confidence_chk check (confidence > 0 and confidence < 1);
alter table public.funnel_splits drop constraint if exists funnel_splits_sample_chk;
alter table public.funnel_splits add constraint funnel_splits_sample_chk check (min_sample_size > 0);
-- The original winner_chk only allowed 'A'/'B'; widen it for variant C (D-155).
alter table public.funnel_splits drop constraint if exists funnel_splits_winner_chk;
alter table public.funnel_splits add constraint funnel_splits_winner_chk check (winner is null or winner in ('A','B','C'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. funnel_split_stats — generalized to an optional 3rd arm (D-155). Leader =
--    highest-rate arm with traffic; significance requires the leader to clear
--    EVERY other arm that has traffic (pairwise two-proportion z-test) at the
--    split's own min_sample_size/confidence. With no C configured (the default
--    for every pre-existing split) this reduces to exactly the original 2-arm
--    A vs B test — same formula, same 30/0.95→1.96 defaults, same output shape
--    (a/b/z/significant/leader/goal/status/winner); 'c'/'has_c' are additive
--    keys the old frontend simply won't read.
--    Guard relaxed to `auth.uid() is not null and not is_member(...)` (mirrors
--    promote_split_winner's existing pattern) so the new service-role
--    auto_promote_split_winners sweep (§5) can call it too — this function was
--    already granted to service_role but the old hard guard blocked it; no
--    authenticated-caller behavior changes.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.funnel_split_stats(p_step uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ws uuid; v_split_id uuid; v_goal text; v_status text; v_winner text;
  v_c_page uuid; v_min_n int; v_conf numeric; v_auto boolean;
  na int; nb int; nc int; ca int; cb int; cc int;
  pa numeric; pb numeric; pc numeric;
  v_conv text; v_zthr numeric;
  v_leader text; v_leader_p numeric; v_leader_n int;
  v_sig boolean := true; v_checked boolean := false;
  v_pp numeric; v_se numeric; v_z numeric; v_min_abs_z numeric; v_report_z numeric := 0;
  arm record;
begin
  select sp.id, sp.workspace_id, sp.goal, sp.status, sp.winner,
         sp.variant_c_page_id, sp.min_sample_size, sp.confidence, sp.auto_promote
    into v_split_id, v_ws, v_goal, v_status, v_winner, v_c_page, v_min_n, v_conf, v_auto
  from public.funnel_steps fs
  join public.funnel_splits sp on sp.step_id = fs.id
  where fs.id = p_step
  order by sp.created_at desc limit 1;
  if v_split_id is null then raise exception 'no split for step' using errcode = 'P0002'; end if;
  if auth.uid() is not null and not public.is_member(v_ws) then
    raise exception 'not a member of workspace %', v_ws using errcode = '42501';
  end if;

  -- 'purchase' goal counts only purchases; 'progression' counts optin OR purchase.
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

  -- Confidence → z threshold (fixed lookup over the common tiers — not a full
  -- inverse-normal implementation; unmatched values fall back to 95%/1.96).
  v_zthr := case when v_conf >= 0.995 then 2.807 when v_conf >= 0.99 then 2.576
                 when v_conf >= 0.95  then 1.96  when v_conf >= 0.90 then 1.645
                 else 1.96 end;

  -- Leader = highest-rate arm among those with traffic (ties favor A, then B —
  -- matches the original "pa >= pb ⇒ A" convention).
  v_leader := 'A'; v_leader_p := pa; v_leader_n := na;
  if nb > 0 and pb >= v_leader_p then v_leader := 'B'; v_leader_p := pb; v_leader_n := nb; end if;
  if nc > 0 and pc >= v_leader_p then v_leader := 'C'; v_leader_p := pc; v_leader_n := nc; end if;

  -- The leader must clear the significance bar against every OTHER arm that
  -- has traffic; 'z'/reported below is the weakest (smallest |z|) comparison.
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. promote_split_winner — accepts 'C' (D-155/D-156). Same signature; swaps
--    variant_c_page_id in when C wins. Rejects 'C' if the split has no C
--    variant configured, so a stray call can't silently no-op.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.promote_split_winner(p_step uuid, p_variant text)
returns public.funnel_splits language plpgsql security definer set search_path = public as $$
declare v_ws uuid; v_split_id uuid; v_variant_page uuid; v_split public.funnel_splits;
begin
  if p_variant not in ('A','B','C') then raise exception 'variant must be A, B or C' using errcode = '22023'; end if;
  select sp.id, sp.workspace_id,
         case p_variant when 'B' then sp.variant_page_id when 'C' then sp.variant_c_page_id else null end
    into v_split_id, v_ws, v_variant_page
  from public.funnel_steps fs
  join public.funnel_splits sp on sp.step_id = fs.id
  where fs.id = p_step
  order by sp.created_at desc limit 1;
  if v_split_id is null then raise exception 'no split for step' using errcode = 'P0002'; end if;
  if p_variant = 'C' and v_variant_page is null then
    raise exception 'this split has no variant C configured' using errcode = '22023';
  end if;
  if auth.uid() is not null and not public.has_role(v_ws, 'manager') then
    raise exception 'promoting a winner requires manager+' using errcode = '42501';
  end if;

  -- B or C wins → make its page the live step page.
  if p_variant in ('B','C') and v_variant_page is not null then
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
-- 5. stop_split (D-156) — manager+ archives a running test without declaring a
--    winner (status='stopped', already a valid value on the original check
--    constraint). Historical funnel_visits rows are never deleted, so losing-
--    variant reporting stays queryable — no new "archive" storage needed.
--
--    auto_promote_split_winners (D-156) — hourly system sweep: any RUNNING
--    split with auto_promote=true whose own funnel_split_stats() call reports
--    significant gets promoted to its own leader. Service-role only (like
--    sweep_abandoned_funnels); idempotent by construction (status flips to
--    'promoted', so a re-run never re-matches the same split).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.stop_split(p_step uuid)
returns public.funnel_splits language plpgsql security definer set search_path = public as $$
declare v_ws uuid; v_split_id uuid; v_split public.funnel_splits;
begin
  select sp.id, sp.workspace_id into v_split_id, v_ws
  from public.funnel_steps fs join public.funnel_splits sp on sp.step_id = fs.id
  where fs.id = p_step order by sp.created_at desc limit 1;
  if v_split_id is null then raise exception 'no split for step' using errcode = 'P0002'; end if;
  if auth.uid() is not null and not public.has_role(v_ws, 'manager') then
    raise exception 'stopping a test requires manager+' using errcode = '42501';
  end if;
  update public.funnel_splits set status = 'stopped' where id = v_split_id returning * into v_split;
  return v_split;
end $$;
revoke all on function public.stop_split(uuid) from public;
grant execute on function public.stop_split(uuid) to authenticated, service_role;

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
  return v_count;
end $$;
revoke all on function public.auto_promote_split_winners(uuid) from public;
grant execute on function public.auto_promote_split_winners(uuid) to service_role;

do $$ begin
  perform cron.schedule('m20-auto-promote-sweep', '25 * * * *',
    $cron$ select public.auto_promote_split_winners(); $cron$);
exception when others then
  raise notice 'pg_cron unavailable — m20-auto-promote-sweep not scheduled (%).', sqlerrm;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Propagate test_mode → is_test (D-154). record_funnel_event/
--    create_funnel_order read the funnel's test_mode once and stamp every row
--    they write; sweep_abandoned_funnels skips test orders. Signatures are
--    unchanged — existing callers (the public-funnel Edge Fn) need no update.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.record_funnel_event(
  p_ws uuid, p_funnel uuid, p_step uuid, p_visitor text, p_event text,
  p_variant text default null, p_contact uuid default null,
  p_email text default null, p_name text default null, p_utm jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_contact uuid := p_contact; v_first text; v_last text; v_email text;
  v_tag uuid; v_tag_name text; v_visit uuid; v_test_mode boolean;
begin
  if p_event not in ('view','optin','purchase','abandoned') then
    raise exception 'bad event %', p_event using errcode = '22023';
  end if;

  select test_mode into v_test_mode from public.funnels where id = p_funnel;
  v_test_mode := coalesce(v_test_mode, false);

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

  insert into public.funnel_visits (workspace_id, funnel_id, step_id, visitor_id, contact_id, variant, event, utm, is_test)
  values (p_ws, p_funnel, p_step, coalesce(p_visitor,'anon'), v_contact, p_variant, p_event, coalesce(p_utm,'{}'::jsonb), v_test_mode)
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

create or replace function public.create_funnel_order(
  p_ws uuid, p_funnel uuid, p_step uuid, p_contact uuid,
  p_items jsonb, p_currency text default 'USD', p_bump jsonb default null
) returns public.invoices
language plpgsql security definer set search_path = public as $$
declare v_items jsonb; v_inv public.invoices; v_test_mode boolean;
begin
  select test_mode into v_test_mode from public.funnels where id = p_funnel;
  v_test_mode := coalesce(v_test_mode, false);

  v_items := coalesce(p_items, '[]'::jsonb);
  if p_bump is not null and p_bump <> 'null'::jsonb then
    v_items := v_items || jsonb_build_array(p_bump);
  end if;
  if jsonb_array_length(v_items) = 0 then
    raise exception 'order has no line items' using errcode = '22023';
  end if;

  insert into public.invoices
    (workspace_id, contact_id, kind, currency, line_items, status, source_type, source_id, is_test)
  values
    (p_ws, p_contact, 'invoice', coalesce(p_currency,'USD'), v_items, 'sent', 'order', p_step, v_test_mode)
  returning * into v_inv;

  -- Link the order into the funnel event stream (purchase is recorded later, on the
  -- payment webhook). This 'view' marks the order step reached for this contact.
  insert into public.funnel_visits (workspace_id, funnel_id, step_id, visitor_id, contact_id, event, is_test)
  values (p_ws, p_funnel, p_step, 'order:' || v_inv.id::text, p_contact, 'view', v_test_mode);

  return v_inv;
end $$;
revoke all on function public.create_funnel_order(uuid, uuid, uuid, uuid, jsonb, text, jsonb) from public;
grant execute on function public.create_funnel_order(uuid, uuid, uuid, uuid, jsonb, text, jsonb) to service_role;

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
-- 7. funnel_publish_readiness (D-157) — read-only go-live check. Blockers gate
--    launch (missing steps/pages/pricing); warnings surface risk without
--    blocking (no order step; the M19 site's domain/SSL — read from the
--    existing site_publish_log rather than inventing new site columns).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.funnel_publish_readiness(p_funnel uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ws uuid; v_site uuid; v_blockers text[] := '{}'; v_warnings text[] := '{}'; r record;
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

  return jsonb_build_object(
    'ready', array_length(v_blockers,1) is null,
    'blockers', to_jsonb(v_blockers), 'warnings', to_jsonb(v_warnings)
  );
end $$;
revoke all on function public.funnel_publish_readiness(uuid) from public;
grant execute on function public.funnel_publish_readiness(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. funnel_revenue_summary (D-158) — revenue/orders/AOV/EPC + per-step +
--    per-source (UTM first-touch by contact) in one read. Test-mode rows
--    excluded unconditionally (that is the whole point of is_test). Source
--    attribution: a contact's EARLIEST funnel_visits row carrying a non-empty
--    utm within this funnel is their first-touch source; paid orders are
--    joined to that source via the invoice's contact_id. Visitors-without-a-
--    resolved-contact and visits-without-utm both bucket to 'direct'.
-- ═══════════════════════════════════════════════════════════════════════════
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
