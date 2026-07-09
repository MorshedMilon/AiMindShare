-- ═══════════════════════════════════════════════════════════════════════════
-- 0003_meters_plans.sql — AiMindShare Session 0
-- M03 billing/metering foundation (tables only; full wiring is Session 4).
-- Constitution Law 4: every billable action increments a meter server-side —
-- so usage_meters/usage_events are written by workers/Edge Functions (service
-- role), never by the browser. Money is numeric, never float.
-- ═══════════════════════════════════════════════════════════════════════════

-- Platform plan catalog (no workspace_id — global reference data)
create table if not exists public.plans (
  id            uuid primary key default gen_random_uuid(),
  tier          public.plan_tier not null,
  name          text not null,
  monthly_price numeric(12,2) not null default 0,
  currency      char(3) not null default 'USD',
  feature_gates jsonb not null default '{}',
  included      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
alter table public.plans enable row level security;
-- catalog is readable by any authenticated user; writes = service-role only
create policy plans_sel on public.plans for select using ( auth.uid() is not null );

create table if not exists public.subscriptions_platform (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null references public.workspaces(id) on delete cascade,
  plan_id                uuid references public.plans(id),
  stripe_subscription_id text,
  status                 text not null default 'active',
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz
);
create index if not exists subscriptions_platform_ws_idx on public.subscriptions_platform (workspace_id);
alter table public.subscriptions_platform enable row level security;
create policy subs_sel on public.subscriptions_platform for select using ( public.is_member(workspace_id) );
-- insert/update/delete: service-role only (Stripe webhooks)
create trigger subs_set_updated_at before update on public.subscriptions_platform
  for each row execute function public.set_updated_at();

create table if not exists public.usage_meters (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind         public.meter_kind not null,
  period       date not null,                    -- month bucket (first of month)
  quantity     numeric(14,4) not null default 0,
  updated_at   timestamptz,
  unique (workspace_id, kind, period)
);
create index if not exists usage_meters_ws_idx on public.usage_meters (workspace_id);
alter table public.usage_meters enable row level security;
create policy meters_sel on public.usage_meters for select using ( public.is_member(workspace_id) );
-- insert/update: service-role only (metered inside the same txn as the action)
create trigger usage_meters_set_updated_at before update on public.usage_meters
  for each row execute function public.set_updated_at();

create table if not exists public.usage_events (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind         public.meter_kind not null,
  quantity     numeric(14,4) not null,
  context      jsonb not null default '{}',
  created_at   timestamptz not null default now()
);
create index if not exists usage_events_ws_idx on public.usage_events (workspace_id);
alter table public.usage_events enable row level security;
create policy events_sel on public.usage_events for select using ( public.is_member(workspace_id) );
-- insert: service-role only (append-only ledger written server-side)

create table if not exists public.credit_wallets (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  balance      numeric(14,4) not null default 0,
  currency     char(3) not null default 'USD',
  updated_at   timestamptz,
  unique (workspace_id)
);
alter table public.credit_wallets enable row level security;
create policy wallets_sel on public.credit_wallets for select using ( public.is_member(workspace_id) );
-- insert/update: service-role only
create trigger credit_wallets_set_updated_at before update on public.credit_wallets
  for each row execute function public.set_updated_at();

create table if not exists public.rebilling_rules (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind         public.meter_kind not null,
  markup_pct   numeric(6,2) not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);
create index if not exists rebilling_rules_ws_idx on public.rebilling_rules (workspace_id);
alter table public.rebilling_rules enable row level security;
create policy rebilling_sel on public.rebilling_rules for select using ( public.is_member(workspace_id) );
create policy rebilling_ins on public.rebilling_rules for insert with check ( public.has_role(workspace_id, 'admin') );
create policy rebilling_upd on public.rebilling_rules for update
  using ( public.has_role(workspace_id, 'admin') ) with check ( public.has_role(workspace_id, 'admin') );
create policy rebilling_del on public.rebilling_rules for delete using ( public.has_role(workspace_id, 'admin') );
create trigger rebilling_rules_set_updated_at before update on public.rebilling_rules
  for each row execute function public.set_updated_at();
