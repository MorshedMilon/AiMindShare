-- ═══════════════════════════════════════════════════════════════════════════
-- 0018_m28_payments.sql — AiMindShare Session 13 · M28 Payments & Invoicing
--
-- Client-facing money: invoices, estimates, client subscriptions, tax rates, and
-- gap-free per-workspace numbering. Ships DATA-SCHEMA §9 (invoices, subscriptions)
-- verbatim onto the locked stack, plus the small additions PRD_M28 §3 calls for
-- (the InvoicePayment ledger, TaxRate, per-workspace numbering, a public pay token).
-- PRD_M28's Prisma / puppeteer / Stripe-SDK is superseded: Stripe runs REST + Web
-- Crypto with the key in Vault (D-028 pattern, reusing _shared/stripe.ts), webhook
-- idempotency reuses M03's stripe_events table, and PDF (needs M06) stays a labelled
-- scaffold. This module is distinct from M03 (M03 = how the PLATFORM bills agencies;
-- M28 = how a workspace bills ITS OWN clients).
--
-- SCOPE (BUILD-SEQUENCE S13 accept-when): Invoices CRUD + send, Stripe checkout
-- links, estimate→invoice, subscriptions, Stripe webhook idempotent by event id,
-- revenue rollups. Everything else in the PRD is honestly scaffolded/deferred and
-- flagged on TASKS.md — Stripe Connect Standard onboarding (platform-account
-- checkout now; connect scaffolded), Text-to-Pay (M12 send path exists, full flow
-- scaffolded), payment plans/installments, dunning→M13, PDF (M06), multi-currency
-- FX display, QR, late fees. Never faked green.
--
-- Migration number 0018. M13=0016 and a PARALLEL M14 session already claimed
-- 0017_m14_calendar.sql on disk, so M28 (independent of M14) took 0018 to avoid the
-- collision — mechanical only, content unchanged. The `0012` gap is the still-
-- unresolved M05 renumber Session 5 flagged for a human. ⚠ Re-verify 0018 is free on
-- merge (migrations are append-only).
--
-- Depends on: 0000 (set_updated_at, pgcrypto), 0001 tenancy (is_member/has_role),
-- 0009 M03 (stripe_events dedupe table — reused for webhook idempotency),
-- 0011 M04 (notify() — payment notifications), 0013 M09 (contacts + activity_log —
-- the timeline). Best-effort M13 emit_trigger (0016) for payment.received — tolerated
-- absent so M28 does not hard-couple to an unclosed parallel session.
--
-- Logged extensions / deviations from canonical §9 (Law 8 → DECISIONS):
--   • D-070  invoices gains kind ('invoice'|'estimate' — one builder, one table),
--            amount_paid (partial-payment accumulation), discount jsonb + tax_rate
--            (reproducible totals — calc_invoice_totals is the server truth shared
--            with the UI preview), notes/terms, public_token (the no-auth hosted pay
--            page key), sent_at, stripe_checkout_id, source_type/source_id.
--   • D-071  invoice_payments ledger (PRD InvoicePayment) — append-only; the BROWSER
--            can never insert one. Every payment is written by the service role
--            (webhook / record_invoice_payment). Manual "mark as paid" also flows
--            through the service-role RPC, so amount_paid can only move server-side.
--   • D-072  money is integer MINOR UNITS everywhere (matches M03) — never floats.
--            tax_rate is a numeric percent (e.g. 8.5); calc_invoice_totals rounds to
--            minor units so UI preview and server agree to the cent.
--   • D-073  matrix: staff+ create/edit invoices/estimates/subscriptions, MANAGER+
--            delete AND void (money is sensitive — the void guard lives in the
--            invoices trigger, RLS covers delete). tax_rates + numbering = manager+.
--   • D-074  overdue is a pg_cron sweep (sweep_overdue_invoices()) flipping
--            sent/viewed/partial → overdue past due_date; the reminder SCHEDULE
--            engine + late fees defer (scaffold). Revenue rollups need the overdue
--            state, so the flip ships; the SQL lives in a function so the worker and
--            the PGlite probe run identical logic (dedupe_scan pattern).
--
-- Order: tables → indexes → RPCs (calc/number) → triggers → RLS + policies →
-- money RPCs (accept/record/rollup/sweep) → grants → cron → realtime.
-- Every table created here enables RLS in THIS file (Gate-8).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Tables (DATA-SCHEMA §9 verbatim + logged extensions D-070/D-071) ───────

-- invoices — one row per invoice OR estimate (kind). §9 verbatim + D-070.
create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  contact_id     uuid references public.contacts(id) on delete set null,  -- retained on gdpr erase (financial record)
  kind           text not null default 'invoice',            -- D-070: 'invoice' | 'estimate'
  number         text,                                        -- assigned by trigger (invoices) / on accept (estimates)
  currency       text not null default 'USD',
  line_items     jsonb not null default '[]',                 -- [{description, qty, unit_price(minor), product_id?}]
  discount       jsonb,                                       -- D-070: {type:'fixed'|'percent', value}
  tax_rate       numeric(6,4) not null default 0,             -- D-072: percent (e.g. 8.5); amount derived
  subtotal       int not null default 0,                      -- minor units — recomputed by trigger
  discount_total int not null default 0,                      -- minor units — recomputed by trigger
  tax            int not null default 0,                      -- minor units — recomputed by trigger
  total          int not null default 0,                      -- minor units — recomputed by trigger
  amount_paid    int not null default 0,                      -- D-070: accumulates via record_invoice_payment (server only)
  status         text not null default 'draft',
  due_date       date,
  notes          text,                                        -- D-070: terms / memo
  public_token   text not null unique default gen_random_uuid()::text,  -- D-070: no-auth hosted pay page key
  sent_at        timestamptz,
  paid_at        timestamptz,
  stripe_payment_intent_id text,                              -- §9
  stripe_checkout_id       text,                              -- D-070: Checkout Session id
  source_type    text,                                        -- manual | document | booking | order | time
  source_id      uuid,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz,
  constraint invoices_kind_chk   check (kind in ('invoice','estimate')),
  -- superset of the invoice + estimate lifecycles (kind decides which apply).
  constraint invoices_status_chk check (status in
    ('draft','sent','viewed','partial','paid','overdue','void',      -- invoice lifecycle
     'accepted','declined','expired')),                              -- estimate lifecycle
  constraint invoices_paid_chk   check (amount_paid >= 0)
);
create index if not exists invoices_ws_status_idx  on public.invoices (workspace_id, status);
create index if not exists invoices_ws_kind_idx    on public.invoices (workspace_id, kind, created_at desc);
create index if not exists invoices_contact_idx    on public.invoices (contact_id);
create index if not exists invoices_due_idx        on public.invoices (workspace_id, due_date) where status in ('sent','viewed','partial');
create index if not exists invoices_pi_idx         on public.invoices (workspace_id, stripe_payment_intent_id);

-- invoice_payments — the partial-payment ledger (PRD InvoicePayment). D-071.
-- Append-only; browser never inserts (no insert policy → service-role only).
create table if not exists public.invoice_payments (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  invoice_id    uuid not null references public.invoices(id) on delete cascade,
  amount        int not null,                                 -- minor units
  method        text not null default 'card',                 -- card | ach | cash | manual | …
  status        text not null default 'succeeded',
  stripe_payment_intent_id text,
  paid_at       timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists invoice_payments_ws_idx  on public.invoice_payments (workspace_id, paid_at desc);
create index if not exists invoice_payments_inv_idx on public.invoice_payments (invoice_id);

-- client_subscriptions — a workspace's client on a recurring Stripe plan (PRD
-- ClientSubscription). Distinct from subscriptions_platform (M03 = agency↔platform).
create table if not exists public.client_subscriptions (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  contact_id     uuid references public.contacts(id) on delete set null,
  plan_name      text not null,
  amount         int not null default 0,                      -- minor units per interval
  currency       text not null default 'USD',
  interval       text not null default 'month',
  stripe_sub_id  text,
  status         text not null default 'active',
  next_charge_at timestamptz,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz,
  constraint client_subs_interval_chk check (interval in ('day','week','month','year')),
  constraint client_subs_status_chk   check (status in ('active','trialing','past_due','canceled','incomplete','paused'))
);
create index if not exists client_subs_ws_idx      on public.client_subscriptions (workspace_id, status);
create index if not exists client_subs_contact_idx on public.client_subscriptions (contact_id);
create index if not exists client_subs_stripe_idx  on public.client_subscriptions (workspace_id, stripe_sub_id);

-- tax_rates — per-workspace tax settings (PRD TaxRate). D-073 manager+ write.
create table if not exists public.tax_rates (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  rate         numeric(6,4) not null default 0,               -- percent
  is_default   boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists tax_rates_ws_idx on public.tax_rates (workspace_id);

-- invoice_counters — gap-free per-workspace numbering (prefix + sequence). D-073.
-- One row per workspace; next_invoice_number() bumps next_seq under a row lock.
create table if not exists public.invoice_counters (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  prefix       text not null default 'INV-',
  next_seq     int  not null default 1
);

-- ── 2. Pure helpers — totals + numbering (server truth, shared with the UI) ───

-- calc_invoice_totals — THE money math (D-072). Pure/immutable so the UI mirror and
-- the invoices trigger produce identical minor-unit results. Discount applies to the
-- subtotal; tax applies to (subtotal − discount). Everything rounds to minor units.
create or replace function public.calc_invoice_totals(
  p_items jsonb, p_discount jsonb, p_tax_rate numeric
) returns jsonb
language plpgsql immutable as $$
declare
  v_subtotal   bigint := 0;
  v_discount   bigint := 0;
  v_taxable    bigint := 0;
  v_tax        bigint := 0;
  it           jsonb;
  v_dtype      text;
  v_dval       numeric;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_subtotal := v_subtotal + round(
      coalesce((it->>'qty')::numeric, 0) * coalesce((it->>'unit_price')::numeric, 0)
    );
  end loop;

  if p_discount is not null then
    v_dtype := p_discount->>'type';
    v_dval  := coalesce((p_discount->>'value')::numeric, 0);
    if v_dtype = 'percent' then
      v_discount := round(v_subtotal * v_dval / 100.0);
    elsif v_dtype = 'fixed' then
      v_discount := least(round(v_dval), v_subtotal);   -- fixed value is given in minor units
    end if;
  end if;
  if v_discount < 0 then v_discount := 0; end if;

  v_taxable := v_subtotal - v_discount;
  v_tax     := round(v_taxable * coalesce(p_tax_rate, 0) / 100.0);

  return jsonb_build_object(
    'subtotal', v_subtotal, 'discount_total', v_discount,
    'tax', v_tax, 'total', v_taxable + v_tax
  );
end $$;

-- next_invoice_number — atomic per-workspace sequence. Definer so it can upsert the
-- counter regardless of the caller (row-locked bump = gap-free even under concurrency).
create or replace function public.next_invoice_number(p_ws uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare v_prefix text; v_seq int;
begin
  if auth.uid() is not null and not public.is_member(p_ws) then
    raise exception 'not a member of workspace %', p_ws using errcode = '42501';
  end if;
  insert into public.invoice_counters (workspace_id) values (p_ws)
    on conflict (workspace_id) do nothing;
  update public.invoice_counters
     set next_seq = next_seq + 1
   where workspace_id = p_ws
   returning prefix, next_seq - 1 into v_prefix, v_seq;
  return v_prefix || lpad(v_seq::text, 4, '0');
end $$;

-- ── 3. Trigger — recompute money + assign number + guard void (D-072/D-073) ───
-- The one place invoice money is derived. Runs for every browser insert/update so a
-- client can NEVER forge subtotal/tax/total (they're overwritten from line_items).
-- amount_paid is NOT touched here (only record_invoice_payment moves it, server-side).
create or replace function public.invoices_before_write()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_totals jsonb;
begin
  -- Server-authoritative totals.
  v_totals := public.calc_invoice_totals(new.line_items, new.discount, new.tax_rate);
  new.subtotal       := (v_totals->>'subtotal')::int;
  new.discount_total := (v_totals->>'discount_total')::int;
  new.tax            := (v_totals->>'tax')::int;
  new.total          := (v_totals->>'total')::int;

  -- Assign a human number the first time a real invoice needs one (estimates get
  -- theirs on accept). Draft estimates stay numberless until converted.
  if new.number is null and new.kind = 'invoice' then
    new.number := public.next_invoice_number(new.workspace_id);
  end if;

  if tg_op = 'UPDATE' then
    -- Void is a manager+ action (D-073). Enforce only for a real caller; the service
    -- role (record_invoice_payment / webhook) has no auth.uid() and is already trusted.
    if new.status = 'void' and old.status <> 'void'
       and auth.uid() is not null and not public.has_role(new.workspace_id, 'manager') then
      raise exception 'voiding an invoice requires manager+' using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger invoices_before_write_trg
  before insert or update on public.invoices
  for each row execute function public.invoices_before_write();

create trigger client_subs_set_updated_at before update on public.client_subscriptions
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RLS + policies (RLS-AND-SECURITY §3 standard template + D-073)
--    invoices:            member read · staff+ ins/upd · manager+ del (+ void guard)
--    invoice_payments:    member read · NO browser write (service-role only, D-071)
--    client_subscriptions:member read · staff+ ins/upd · manager+ del
--    tax_rates:           member read · manager+ write
--    invoice_counters:    member read · manager+ upd (prefix); seq via definer
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.invoices enable row level security;
create policy invoices_sel on public.invoices for select using ( public.is_member(workspace_id) );
create policy invoices_ins on public.invoices for insert with check ( public.has_role(workspace_id,'staff') );
create policy invoices_upd on public.invoices for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy invoices_del on public.invoices for delete using ( public.has_role(workspace_id,'manager') );

-- invoice_payments — the browser may READ the ledger but NEVER write it. Payments
-- are service-role writes only (webhook + record_invoice_payment); no ins/upd/del
-- policy exists, so RLS denies every client mutation (D-071).
alter table public.invoice_payments enable row level security;
create policy invoice_payments_sel on public.invoice_payments for select using ( public.is_member(workspace_id) );

alter table public.client_subscriptions enable row level security;
create policy client_subs_sel on public.client_subscriptions for select using ( public.is_member(workspace_id) );
create policy client_subs_ins on public.client_subscriptions for insert with check ( public.has_role(workspace_id,'staff') );
create policy client_subs_upd on public.client_subscriptions for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy client_subs_del on public.client_subscriptions for delete using ( public.has_role(workspace_id,'manager') );

alter table public.tax_rates enable row level security;
create policy tax_rates_sel on public.tax_rates for select using ( public.is_member(workspace_id) );
create policy tax_rates_ins on public.tax_rates for insert with check ( public.has_role(workspace_id,'manager') );
create policy tax_rates_upd on public.tax_rates for update using ( public.has_role(workspace_id,'manager') ) with check ( public.has_role(workspace_id,'manager') );
create policy tax_rates_del on public.tax_rates for delete using ( public.has_role(workspace_id,'manager') );

alter table public.invoice_counters enable row level security;
create policy invoice_counters_sel on public.invoice_counters for select using ( public.is_member(workspace_id) );
create policy invoice_counters_upd on public.invoice_counters for update using ( public.has_role(workspace_id,'manager') ) with check ( public.has_role(workspace_id,'manager') );

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Money RPCs — accept estimate, record payment, rollup, overdue sweep
-- ═══════════════════════════════════════════════════════════════════════════

-- accept_estimate — convert an estimate → invoice in place (keeps the public_token so
-- an outstanding link still resolves). Assigns the invoice number + marks it sent.
-- Definer: usable BOTH by staff internally (auth.uid() member check) AND by the
-- public accept page via the service role (the contact clicked "Accept" — no JWT).
create or replace function public.accept_estimate(p_ws uuid, p_invoice uuid)
returns public.invoices
language plpgsql security definer set search_path = public as $$
declare v_row public.invoices;
begin
  if auth.uid() is not null and not public.has_role(p_ws, 'staff') then
    raise exception 'accepting an estimate requires staff+' using errcode = '42501';
  end if;

  select * into v_row from public.invoices where id = p_invoice and workspace_id = p_ws for update;
  if v_row.id is null then raise exception 'estimate not found' using errcode = 'P0002'; end if;
  if v_row.kind <> 'estimate' then raise exception 'not an estimate' using errcode = '22023'; end if;

  update public.invoices
     set kind = 'invoice',
         status = 'sent',
         sent_at = coalesce(sent_at, now()),
         number = coalesce(number, public.next_invoice_number(p_ws))
   where id = p_invoice
   returning * into v_row;

  -- Timeline: the conversion is a contact event (M09). Direct insert (definer) —
  -- log_activity()'s is_member guard would reject the service role on the public path.
  if v_row.contact_id is not null then
    insert into public.activity_log (workspace_id, contact_id, type, description, metadata, actor_id)
    values (p_ws, v_row.contact_id, 'estimate',
            'Estimate ' || coalesce(v_row.number,'') || ' accepted → invoice',
            jsonb_build_object('invoice_id', p_invoice, 'total', v_row.total), auth.uid());
  end if;
  return v_row;
end $$;

-- record_invoice_payment — THE only path that moves money into an invoice. Inserts a
-- ledger row, accumulates amount_paid, flips status (paid / partial), stamps paid_at,
-- writes the M09 timeline, fires an M04 notification, and best-effort emits the M13
-- payment.received trigger. Service-role only (the webhook + a staff "mark as paid"
-- action that itself routes through an Edge Function). Idempotent on the Stripe
-- payment-intent id: the same PI never double-credits an invoice.
create or replace function public.record_invoice_payment(
  p_ws uuid, p_invoice uuid, p_amount int, p_method text default 'card', p_pi text default null
) returns public.invoices
language plpgsql security definer set search_path = public as $$
declare v_inv public.invoices; v_new_paid int; v_status text;
begin
  select * into v_inv from public.invoices where id = p_invoice and workspace_id = p_ws for update;
  if v_inv.id is null then raise exception 'invoice not found' using errcode = 'P0002'; end if;

  -- Idempotency: a redelivered webhook (same PI) must not credit twice.
  if p_pi is not null and exists (
    select 1 from public.invoice_payments
     where invoice_id = p_invoice and stripe_payment_intent_id = p_pi
  ) then
    return v_inv;
  end if;
  if coalesce(p_amount, 0) <= 0 then return v_inv; end if;

  insert into public.invoice_payments (workspace_id, invoice_id, amount, method, stripe_payment_intent_id)
  values (p_ws, p_invoice, p_amount, coalesce(p_method,'card'), p_pi);

  v_new_paid := v_inv.amount_paid + p_amount;
  v_status   := case when v_new_paid >= v_inv.total then 'paid'
                     when v_new_paid > 0            then 'partial'
                     else v_inv.status end;

  update public.invoices
     set amount_paid = v_new_paid,
         status      = case when status = 'void' then 'void' else v_status end,
         paid_at     = case when v_new_paid >= v_inv.total then coalesce(paid_at, now()) else paid_at end,
         stripe_payment_intent_id = coalesce(p_pi, stripe_payment_intent_id)
   where id = p_invoice
   returning * into v_inv;

  -- Timeline (M09).
  if v_inv.contact_id is not null then
    insert into public.activity_log (workspace_id, contact_id, type, description, metadata, actor_id)
    values (p_ws, v_inv.contact_id, 'payment',
            'Payment received on ' || coalesce(v_inv.number, 'invoice'),
            jsonb_build_object('invoice_id', p_invoice, 'amount', p_amount, 'method', p_method), null);
  end if;

  -- Notification (M04) — best-effort so a missing/edge notify() never fails the payment.
  begin
    perform public.notify(
      p_ws, array['admin'], 'payment_received',
      'Payment received',
      coalesce(v_inv.number,'Invoice') || ' — ' || (p_amount::numeric/100)::text || ' ' || v_inv.currency,
      jsonb_build_object('link', '#/payments/invoice/' || p_invoice::text, 'invoice_id', p_invoice));
  exception when others then null; end;

  -- Automation trigger (M13) — best-effort; tolerated absent (parallel session, D-070).
  begin
    perform public.emit_trigger(p_ws, 'payment.received',
      jsonb_build_object('invoice_id', p_invoice, 'contact_id', v_inv.contact_id, 'amount', p_amount));
  exception when undefined_function then null; when others then null; end;

  return v_inv;
end $$;

-- revenue_rollup — the /payments cards + M40/M08 feed. Collected = paid to date;
-- outstanding = billed-not-yet-collected on live invoices; overdue = the past-due
-- slice of outstanding. Scoped to the caller's workspace + an optional issue window.
create or replace function public.revenue_rollup(
  p_ws uuid, p_from date default null, p_to date default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_member(p_ws) then
    raise exception 'not a member of workspace %', p_ws using errcode = '42501';
  end if;
  select jsonb_build_object(
    'collected',   coalesce(sum(amount_paid), 0),
    'outstanding', coalesce(sum(case when status in ('sent','viewed','partial','overdue') then total - amount_paid else 0 end), 0),
    'overdue',     coalesce(sum(case when status = 'overdue' then total - amount_paid else 0 end), 0),
    'draft_count', coalesce(sum(case when status = 'draft' then 1 else 0 end), 0),
    'paid_count',  coalesce(sum(case when status = 'paid' then 1 else 0 end), 0),
    'currency',    coalesce(min(currency), 'USD')
  ) into v
  from public.invoices
  where workspace_id = p_ws
    and kind = 'invoice'
    and status <> 'void'
    and (p_from is null or created_at >= p_from)
    and (p_to   is null or created_at <  (p_to + 1));
  return v;
end $$;

-- sweep_overdue_invoices — flip live invoices past their due date to 'overdue'
-- (D-074). SQL lives here so the worker/cron and the PGlite probe run identical
-- logic. Returns the number flipped. Definer + service-role (system job).
create or replace function public.sweep_overdue_invoices(p_ws uuid default null)
returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update public.invoices
     set status = 'overdue', updated_at = now()
   where kind = 'invoice'
     and status in ('sent','viewed','partial')
     and due_date is not null
     and due_date < current_date
     and (p_ws is null or workspace_id = p_ws);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ── Grants — browser (authenticated) may compute/number/accept/rollup; the
--    money-moving writes (record_invoice_payment, sweep) are service-role only.
revoke all on function public.calc_invoice_totals(jsonb, jsonb, numeric) from public;
revoke all on function public.next_invoice_number(uuid) from public;
revoke all on function public.accept_estimate(uuid, uuid) from public;
revoke all on function public.record_invoice_payment(uuid, uuid, int, text, text) from public;
revoke all on function public.revenue_rollup(uuid, date, date) from public;
revoke all on function public.sweep_overdue_invoices(uuid) from public;
grant execute on function public.calc_invoice_totals(jsonb, jsonb, numeric) to authenticated, service_role;
grant execute on function public.next_invoice_number(uuid) to authenticated, service_role;
grant execute on function public.accept_estimate(uuid, uuid) to authenticated, service_role;
grant execute on function public.record_invoice_payment(uuid, uuid, int, text, text) to service_role;
grant execute on function public.revenue_rollup(uuid, date, date) to authenticated, service_role;
grant execute on function public.sweep_overdue_invoices(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. pg_cron — daily overdue sweep (D-074). Guarded for PGlite (no pg_cron there).
--    Registered in JOBS-AND-WORKERS-SPEC §5. Runs the SQL directly (like M03's
--    trial-expiry sweep) — the reminder-schedule engine + late fees defer.
-- ═══════════════════════════════════════════════════════════════════════════
do $$ begin
  perform cron.schedule('m28-overdue-sweep', '15 6 * * *',
    $cron$ select public.sweep_overdue_invoices(); $cron$);
exception when others then
  raise notice 'pg_cron unavailable — m28-overdue-sweep not scheduled (%).', sqlerrm;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Realtime — invoices + payments in the publication so the list and a paid
--    banner live-update the moment the webhook records a payment. Guarded for PGlite.
-- ═══════════════════════════════════════════════════════════════════════════
do $$ begin
  alter publication supabase_realtime add table public.invoices;
exception when others then
  raise notice 'supabase_realtime publication unavailable — invoices not added (%).', sqlerrm;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.invoice_payments;
exception when others then
  raise notice 'supabase_realtime publication unavailable — invoice_payments not added (%).', sqlerrm;
end $$;
