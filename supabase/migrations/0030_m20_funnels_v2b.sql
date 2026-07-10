-- ═══════════════════════════════════════════════════════════════════════════
-- 0030_m20_funnels_v2b.sql — M20 Funnels v2, Priority 5 (automation hooks)
--
-- Continues 0029's additive-only v2 upgrade. Wires the funnel lifecycle into
-- M13's existing `emit_trigger` bus (no new automation engine — M13 already IS
-- this repo's workflow/trigger system): funnel.entered, step.completed,
-- form.submitted, checkout.started, upsell.accepted/declined,
-- downsell.accepted/declined, test.winner_selected, funnel.published. All
-- emits are best-effort (same `exception when undefined_function/others then
-- null` guard already used for payment.received/cart.abandoned) — a missing
-- or misbehaving workflow never blocks the funnel write it's attached to.
--
-- Priority 4 (order-bump/upsell UI honesty, multi-bump, decline routing) is
-- frontend-only (config is already jsonb) and ships alongside this migration
-- with no schema change. DECISIONS D-159…D-162.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. funnel_visits.event widened for upsell/downsell responses (D-159) ────
-- Additive: the 4 new values are only ever written by record_funnel_event
-- below; every pre-existing row keeps its original event value untouched.
alter table public.funnel_visits drop constraint if exists funnel_visits_event_chk;
alter table public.funnel_visits add constraint funnel_visits_event_chk check (event in
  ('view','optin','purchase','abandoned','upsell_accepted','upsell_declined','downsell_accepted','downsell_declined'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. record_funnel_event — adds funnel.entered / step.completed / form.submitted
--    / upsell.accepted|declined / downsell.accepted|declined emits (D-160).
--    Signature unchanged; the public-funnel Edge Fn needs no update — it
--    already forwards whatever `event` the caller sends, and the frontend
--    (Priority 4) is what will start sending the 4 new event values.
-- ═══════════════════════════════════════════════════════════════════════════
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
                      'upsell_accepted','upsell_declined','downsell_accepted','downsell_declined') then
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

  if p_event in ('upsell_accepted','upsell_declined','downsell_accepted','downsell_declined') then
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
-- 2. create_funnel_order — adds checkout.started (D-160). Signature unchanged.
-- ═══════════════════════════════════════════════════════════════════════════
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

  begin
    perform public.emit_trigger(p_ws, 'checkout.started',
      jsonb_build_object('funnel_id', p_funnel, 'step_id', p_step, 'contact_id', p_contact, 'invoice_id', v_inv.id));
  exception when undefined_function then null; when others then null; end;

  return v_inv;
end $$;
revoke all on function public.create_funnel_order(uuid, uuid, uuid, uuid, jsonb, text, jsonb) from public;
grant execute on function public.create_funnel_order(uuid, uuid, uuid, uuid, jsonb, text, jsonb) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. promote_split_winner — adds test.winner_selected (D-160). Signature
--    unchanged (still accepts 'A'/'B'/'C' from 0029).
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

  if p_variant in ('B','C') and v_variant_page is not null then
    update public.funnel_steps set page_id = v_variant_page where id = p_step;
  end if;

  update public.funnel_splits
     set status = 'promoted', winner = p_variant, promoted_at = now()
   where id = v_split_id
   returning * into v_split;

  begin
    perform public.emit_trigger(v_ws, 'test.winner_selected',
      jsonb_build_object('step_id', p_step, 'split_id', v_split_id, 'variant', p_variant));
  exception when undefined_function then null; when others then null; end;

  return v_split;
end $$;
revoke all on function public.promote_split_winner(uuid, text) from public;
grant execute on function public.promote_split_winner(uuid, text) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. set_funnel_status (D-161) — staff+ status change; emits funnel.published
--    the moment a funnel FIRST transitions into 'active' (Live). The frontend
--    routes status changes through this RPC instead of a bare table update so
--    the trigger fires reliably; a direct UPDATE (e.g. from a script) still
--    works via the existing staff+ RLS policy, it just won't emit the trigger.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.set_funnel_status(p_funnel uuid, p_status text)
returns public.funnels language plpgsql security definer set search_path = public as $$
declare v_ws uuid; v_prev text; v_f public.funnels;
begin
  if p_status not in ('draft','testing','active','paused','archived') then
    raise exception 'bad status %', p_status using errcode = '22023';
  end if;
  select workspace_id, status::text into v_ws, v_prev from public.funnels where id = p_funnel;
  if v_ws is null then raise exception 'funnel not found' using errcode = 'P0002'; end if;
  if auth.uid() is not null and not public.has_role(v_ws, 'staff') then
    raise exception 'updating status requires staff+' using errcode = '42501';
  end if;

  update public.funnels set status = p_status::public.funnel_status where id = p_funnel returning * into v_f;

  if v_prev is distinct from 'active' and p_status = 'active' then
    begin
      perform public.emit_trigger(v_ws, 'funnel.published', jsonb_build_object('funnel_id', p_funnel));
    exception when undefined_function then null; when others then null; end;
  end if;

  return v_f;
end $$;
revoke all on function public.set_funnel_status(uuid, text) from public;
grant execute on function public.set_funnel_status(uuid, text) to authenticated, service_role;
