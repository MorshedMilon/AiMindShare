-- ═══════════════════════════════════════════════════════════════════════════
-- 0009_m03_billing.sql — AiMindShare Session 4 · M03 Billing & Usage Metering
--
-- Session 0's 0003 shipped the meters/plans TABLES as a simplified early cut.
-- This migration RECONCILES them to the canonical DATA-SCHEMA §5 (append-only:
-- we never edit 0003 — DECISIONS D-027), adds the Stripe/billing columns, and
-- ships the three helper contracts the whole platform builds against
-- (USAGE-METERING-AND-PLANS §4/§5/§6, Constitution Law 4):
--   meter_increment · meter_check · has_feature
--
-- Money/quantities are numeric, never float. Meters are written server-side only
-- (Edge Functions / workers via service role) — never from the browser.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Reconcile meter_kind enum → canonical set (DATA-SCHEMA §2) ────────────
-- 0000 shipped: email,sms,ai_tokens,enrichment,voice_minutes,seo_api,storage_gb.
-- Canonical adds seo_calls,image_gen,video_render. Legacy seo_api/storage_gb are
-- retained as dead values (Postgres enums cannot drop values) — D-027. These new
-- values are NOT referenced elsewhere in this migration (an added enum value is
-- unusable until its transaction commits); seed.sql (a later step) uses them.
alter type public.meter_kind add value if not exists 'seo_calls';
alter type public.meter_kind add value if not exists 'image_gen';
alter type public.meter_kind add value if not exists 'video_render';

-- ── 2. usage_events → canonical ledger columns (rebilling math, M42 §8) ──────
-- Canonical stores the real provider unit_cost + source + a ref back to the
-- domain row, so rebilling is exact and historical. (0003's generic `context`
-- jsonb is kept — harmless, unused by the helpers.)
alter table public.usage_events add column if not exists unit_cost numeric(12,6);
alter table public.usage_events add column if not exists source    text;
alter table public.usage_events add column if not exists ref_id    uuid;

-- ── 3. credit_wallets → per-workspace × meter (canonical) ────────────────────
-- 0003 shipped one wallet per workspace (unique(workspace_id)). Canonical holds a
-- prepaid balance per meter_kind. Table is empty at migration time, so adding a
-- NOT NULL column is safe; swap the unique constraint to (workspace_id, kind).
alter table public.credit_wallets add column if not exists kind public.meter_kind;
alter table public.credit_wallets drop constraint if exists credit_wallets_workspace_id_key;
do $$ begin
  alter table public.credit_wallets
    add constraint credit_wallets_workspace_id_kind_key unique (workspace_id, kind);
exception when duplicate_table or duplicate_object then null; end $$;

-- ── 4. Stripe wiring columns ─────────────────────────────────────────────────
alter table public.plans                  add column if not exists stripe_price_id    text;
alter table public.subscriptions_platform add column if not exists stripe_customer_id text;

-- ── 5. workspaces.billing_state — the read-only gate (USAGE-METERING §7) ─────
-- values: active | trial_expired | past_due | canceled. Future modules' write
-- policies add  `and billing_state = 'active'`  for database-level read-only.
alter table public.workspaces
  add column if not exists billing_state text not null default 'active';

-- ── 6. stripe_events — webhook idempotency (EDGE-FUNCTIONS-SPEC §4) ───────────
-- Keyed by Stripe's event id (Stripe redelivers). Service-role only: RLS enabled
-- with NO policy → denies every authenticated/anon read; the webhook writes via
-- the service key (which bypasses RLS).
create table if not exists public.stripe_events (
  id           text primary key,          -- Stripe event.id (dedupe key)
  type         text,
  workspace_id uuid references public.workspaces(id) on delete set null,
  created_at   timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
-- (intentionally no policy — service-role only)

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. THE HELPER CONTRACTS (USAGE-METERING §4/§5/§6) — SECURITY DEFINER
-- ═══════════════════════════════════════════════════════════════════════════

-- 7.1 meter_increment — atomic: append the immutable ledger row AND advance the
-- month counter in one call, then draw the credit wallet if one exists for this
-- (workspace, kind). Runs server-side, in the SAME transaction as the provider
-- result, so a billable action can never commit uncounted (Law 1). Concurrent
-- calls are correct by construction (row lock on the single usage_meters row).
create or replace function public.meter_increment(
  p_workspace uuid,
  p_kind      public.meter_kind,
  p_qty       numeric,
  p_source    text    default null,
  p_unit_cost numeric default null,
  p_ref       uuid    default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.usage_events (workspace_id, kind, quantity, unit_cost, source, ref_id)
  values (p_workspace, p_kind, p_qty, p_unit_cost, p_source, p_ref);

  insert into public.usage_meters (workspace_id, kind, period, quantity)
  values (p_workspace, p_kind, date_trunc('month', now())::date, p_qty)
  on conflict (workspace_id, kind, period)
  do update set quantity = public.usage_meters.quantity + excluded.quantity,
                updated_at = now();

  -- Draw the credit wallet if this meter draws credits (row exists). Clamp at 0
  -- so a wallet can never go negative (pre-flight meter_check is the real gate;
  -- this is defence in depth — USAGE-METERING §8).
  update public.credit_wallets
     set balance = greatest(balance - p_qty, 0), updated_at = now()
   where workspace_id = p_workspace and kind = p_kind;
end $$;

-- 7.2 meter_check — pre-flight read (no side effects): may this workspace do
-- p_qty more of p_kind right now? The caller applies the behaviour
-- (HARD_STOP / SOFT_WARN / OVERAGE) to the returned shape.
create or replace function public.meter_check(
  p_workspace uuid, p_kind public.meter_kind, p_qty numeric default 1
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_included numeric; v_used numeric; v_wallet numeric;
begin
  select (p.included ->> p_kind::text)::numeric
    into v_included
    from public.subscriptions_platform s
    join public.plans p on p.id = s.plan_id
   where s.workspace_id = p_workspace;

  select coalesce(quantity, 0) into v_used
    from public.usage_meters
   where workspace_id = p_workspace and kind = p_kind
     and period = date_trunc('month', now())::date;

  select coalesce(balance, 0) into v_wallet
    from public.credit_wallets
   where workspace_id = p_workspace and kind = p_kind;

  v_used   := coalesce(v_used, 0);
  v_wallet := coalesce(v_wallet, 0);

  -- v_included null = unlimited (enterprise/custom); 0 = not on plan.
  return jsonb_build_object(
    'included',  v_included,
    'used',      v_used,
    'wallet',    v_wallet,
    'remaining', case when v_included is null then null else v_included - v_used end,
    'over',      case when v_included is null then false
                      else (v_used + p_qty) > (v_included + v_wallet) end
  );
end $$;

-- 7.3 has_feature — server-enforced feature gate (RLS-usable). Client reflects
-- it as a courtesy (gold upgrade prompt); the Edge Function / RLS is the wall.
create or replace function public.has_feature(p_workspace uuid, p_flag text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (p.feature_gates ->> p_flag)::boolean
       from public.subscriptions_platform s
       join public.plans p on p.id = s.plan_id
      where s.workspace_id = p_workspace),
    false);
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Trial-expiry sweep (pg_cron, daily) — USAGE-METERING §7
-- Flips workspaces whose trial window lapsed to read-only. Wrapped so this file
-- still loads where pg_cron is absent (PGlite verification harness); on hosted
-- Supabase (extension present, created in 0000) it schedules normally.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
begin
  perform cron.schedule(
    'billing-trial-expiry-sweep',
    '17 3 * * *',
    $cron$
      update public.workspaces w
         set billing_state = 'trial_expired', updated_at = now()
       where w.billing_state = 'active'
         and exists (
           select 1 from public.subscriptions_platform s
            where s.workspace_id = w.id
              and s.status = 'trialing'
              and s.current_period_end < now())
    $cron$);
exception when others then
  raise notice 'pg_cron unavailable — billing-trial-expiry-sweep not scheduled (%).', sqlerrm;
end $$;
