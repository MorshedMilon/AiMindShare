# USAGE-METERING-AND-PLANS-v1_0.md — AiMindShare Metering & Plans
### Doc 11 of 14 · **Version 1.0 · 2026-07-02**
**The billing/metering contract every module builds against. Attach before Session 4 (M03).**

> **Why this exists:** M03 is the foundation 44 other modules depend on. The PRD writes it against
> Prisma + Redis + BullMQ; the locked stack (D-001, D-005) has none of those. This doc resolves the
> PRD into the vanilla + Supabase reality, pins every value to `DATA-SCHEMA` migration 0003, and
> defines the two helper contracts (`meter.increment` / `meter.check` and `requireFeature`) that
> every future module must call. **Retrofitting meters into 44 modules later is the single worst
> rework in the project — this doc is what prevents it.**

---

## 0. RECONCILIATION — PRD → locked stack

The M03 PRD's mechanics are replaced; its *behavior* stands. The complete diff:

| PRD (M03) says | AiMindShare reality | Why |
|---|---|---|
| Redis `INCR` + hourly BullMQ flush → Postgres | **Postgres upsert in the metered transaction** — no Redis, no buffer | D-005: BullMQ/Redis dropped. An atomic `on conflict do update` upsert *is* the counter; Postgres is fast enough and gives an exact, durable count with no flush window |
| Prisma models `Plan/Subscription/UsageRecord/UsageSummary/CreditWallet/CreditTransaction` | The SQL tables in **DATA-SCHEMA §5** (`plans`, `subscriptions_platform`, `usage_meters`, `usage_events`, `credit_wallets`, `rebilling_rules`) | Schema is the single source of truth. Names/shape below are canonical; the PRD's are superseded |
| `meterKey` free-string (`email.sent`, `sms.received`, `storage.gb`…) | **`meter_kind` enum** (8 values, §2) | Constitution: enums live once in the registry, never inline. Granularity (direction, source) moves to `usage_events.source`/`ref_id` |
| Plans Starter / Growth / Pro / Agency | **`plan_tier` enum: free / starter / pro / agency / enterprise** | Schema enum wins. "Growth" is dropped; `free` (trial lands here) and `enterprise` added. Recorded §3 |
| `/api/billing/*` Next.js routes | **Edge Functions** (`billing-checkout`, `billing-webhook`, `billing-portal`) + direct Supabase reads for dashboards | D-001/EDGE-FUNCTIONS-SPEC: browser calls Edge Functions or Supabase directly, nothing else |
| `requireFeature()` middleware + `useFeature()` hook | Postgres helper `has_feature()` (RLS-usable) + a tiny JS `feature()` reader over the loaded plan | No middleware tier exists in a static front end; gates are enforced server-side (Edge Function / RLS) and *reflected* client-side |
| Trial → "read-only mode" via middleware flag | `workspaces.billing_state` flag checked in write policies + Edge Functions | Same effect, database-enforced |

Nothing in the PRD's acceptance criteria is lost — see §11 for the mapping.

---

## 1. THE TWO LAWS THIS DOC ENFORCES (Constitution Law 4)

1. **Every billable action increments a meter** in the *same transaction* as the provider call.
   No provider call is billable-but-uncounted. If the increment can't run, the action's result
   isn't committed.
2. **Every gated feature checks a gate** server-side before it runs. Client-side gating is a
   courtesy (shows the upgrade prompt); the Edge Function/RLS is the actual wall.

If a module does a metered or gated thing and skips the helper, it fails Definition of Done.

---

## 2. METER REGISTRY — the 8 `meter_kind` values

Canonical from `DATA-SCHEMA` §2 (`create type meter_kind as enum (…)`). This table is the
authoritative registry: unit, who increments, behavior, and whether it draws a credit wallet.

| `meter_kind` | Unit | Incremented by (module · surface) | Default limit behavior | Credit-drawable | Typical `source` |
|---|---|---|---|---|---|
| `sms` | 1 / message | M12 inbox send, M16 SMS steps, M14/M30 reminders, M34 disclosures | **OVERAGE** | yes | `twilio` |
| `email` | 1 / email | M04 notifications, M16 campaigns, M00 auth mails, M17 sends | **SOFT_WARN** | no | `resend`/`sendgrid` (D-011) |
| `ai_tokens` | 1 / token | M08 Copilot, M13 AI-builder, M16 copywriter, M22 blog pipeline, M33 agents, M30 replies | **OVERAGE** | yes | `openai` |
| `image_gen` | 1 / image | M35 Creative Studio, M24 pin render, M19 AI-site images | **HARD_STOP** | yes | `openai`/`sdxl` |
| `enrichment` | 1 / credit | M10 enrichment & intent | **HARD_STOP** | yes | `apollo`/`clearbit` |
| `seo_calls` | 1 / API call | M21 keyword/rank/audit, M26 local SEO | **OVERAGE** | yes | `dataforseo`/`serpapi` |
| `voice_minutes` | minutes (numeric) | M34 voice agents (per-minute) | **HARD_STOP** | yes | `twilio`/`openai_realtime` |
| `video_render` | 1 / render | M25 video studio | **HARD_STOP** | yes | worker (D-010/D-013) |

Notes and deliberately-deferred edges (do not silently invent):
- **Direction & sub-type** (SMS inbound vs outbound, ai prompt vs completion tokens) are **not**
  new enum values — they go in `usage_events.source` / `metadata`. Reporting splits on those.
- **Storage** (`storage.gb` in the PRD) has **no `meter_kind`** yet. M06 tracks bytes in its own
  table; storage isn't a per-action meter. If storage ever needs plan limits, add `storage_gb`
  to the enum via a new migration + DECISIONS entry — **flagged OPEN**, not assumed here.
- Behavior column is the **default**; a plan may override per-meter (see `plans.included`).

---

## 3. PLAN MATRIX — `plan_tier` × gates × included quotas

Five tiers (`plans` table, global, no `workspace_id`). `feature_gates jsonb` and `included jsonb`
are the two knobs. Seed values below are the **starting matrix** — editable in M44, never hardcoded
in feature code.

| | **free** (trial lands here) | **starter** | **pro** | **agency** | **enterprise** |
|---|---|---|---|---|---|
| `monthly_price` | 0 | 49 | 149 | 399 | custom |
| `seats` | 1 | 3 | 10 | unlimited | unlimited |
| `workspaces` (sub-accounts) | 1 | 1 | 3 | unlimited | unlimited |
| **Included quotas** (`included`) | | | | | |
| `email` / mo | 500 | 5k | 25k | 100k | custom |
| `sms` / mo | 0 | 500 | 2.5k | 10k | custom |
| `ai_tokens` / mo | 50k | 500k | 3M | 15M | custom |
| `image_gen` / mo | 10 | 100 | 500 | 2k | custom |
| `seo_calls` / mo | 0 | 1k | 10k | 50k | custom |
| `enrichment` / mo | 0 | 100 | 1k | 5k | custom |
| `voice_minutes` / mo | 0 | 0 | 200 | 1k | custom |
| `video_render` / mo | 0 | 0 | 20 | 100 | custom |
| `tracked_keywords` (M21) | 0 | 100 | 500 | 2.5k | custom |
| **Feature gates** (`feature_gates`) | | | | | |
| Core CRM/pipeline/inbox/forms | ✓ | ✓ | ✓ | ✓ | ✓ |
| `m16_campaigns` | — | ✓ | ✓ | ✓ | ✓ |
| `m21_seo` / `m22_content` | — | ✓ | ✓ | ✓ | ✓ |
| `m33_agents` | — | — | ✓ | ✓ | ✓ |
| `m34_voice` | — | — | — | ✓ | ✓ |
| `m25_video` | — | — | — | ✓ | ✓ |
| `m42_whitelabel` / `agency_console` | — | — | — | ✓ | ✓ |
| `m39_marketplace_sell` | — | — | — | ✓ | ✓ |
| `public_api` (M41) | — | — | ✓ | ✓ | ✓ |

`included` shape: `{ "email": 5000, "sms": 500, "ai_tokens": 500000, "tracked_keywords": 100, ... }`
— keys are `meter_kind` values plus non-metered numeric limits (`seats`, `workspaces`,
`tracked_keywords`). `feature_gates` shape: `{ "m34_voice": false, "public_api": true, ... }`.
A `null`/absent quota = **unlimited** (enterprise/custom); `0` = **not available on this tier**.

---

## 4. THE INCREMENT CONTRACT — `meter.increment` (Supabase-native, no Redis)

The counter is a Postgres upsert. It runs **server-side only** (Edge Function or worker), in the
**same transaction** that records the provider result, so a billable action can never commit
uncounted (Law 1). It never blocks the user because it happens after the provider call, alongside
result-writing — not on the request's critical path to the browser.

### 4.1 The SQL primitive (migration 0003, ships with M03)

```sql
-- Atomic: append the immutable ledger row AND advance the month counter in one call.
create or replace function public.meter_increment(
  p_workspace uuid,
  p_kind      meter_kind,
  p_qty       numeric,
  p_source    text default null,
  p_unit_cost numeric default null,
  p_ref       uuid default null
) returns void
language plpgsql
security definer set search_path = public as $$
begin
  insert into public.usage_events (workspace_id, kind, quantity, unit_cost, source, ref_id)
  values (p_workspace, p_kind, p_qty, p_unit_cost, p_source, p_ref);

  insert into public.usage_meters (workspace_id, kind, period, quantity)
  values (p_workspace, p_kind, date_trunc('month', now())::date, p_qty)
  on conflict (workspace_id, kind, period)
  do update set quantity = public.usage_meters.quantity + excluded.quantity;

  -- draw the credit wallet if this meter is credit-drawable and the wallet exists
  update public.credit_wallets
     set balance = balance - p_qty
   where workspace_id = p_workspace and kind = p_kind;
end $$;
```

`usage_events` is the append-only ledger (audit, per-source breakdown, rebilling math).
`usage_meters` is the fast month counter dashboards read. Both advance atomically — no flush
window, no drift, no Redis. The `on conflict … do update` makes concurrent increments correct by
construction (row lock on the one meter row).

### 4.2 How a module calls it

Inside the metered Edge Function/worker, **in the same transaction as writing the result**:

```
1. (pre-flight) meter_check(ws, kind, qty)   → allowed? (§5)  — skip only for pure-overage meters
2. call the provider (Twilio/OpenAI/DataForSEO/…)
3. begin;
     insert the domain result (message row, article, pin, …)
     select public.meter_increment(ws, kind, actual_qty, source, unit_cost, ref_id);
   commit;
```

`actual_qty` uses the **real** quantity from the provider response (tokens billed, minutes used),
not an estimate. `unit_cost` is the provider's cost-per-unit at call time (feeds rebilling §8).
`ref_id` links the meter event back to the domain row (the message, the render) for audit.

**Never** increment from the browser. The browser only ever enqueues a `jobs` row (`queued`) or
calls an Edge Function; the server side owns every increment.

---

## 5. THE CHECK CONTRACT — `meter.check` + limit behaviors

`meter_check` is a **pre-flight read** (no side effects) that answers: may this workspace do
`qty` more of `kind` right now? Behavior depends on the meter's mode for the workspace's plan.

```sql
create or replace function public.meter_check(
  p_workspace uuid, p_kind meter_kind, p_qty numeric default 1
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_included numeric; v_used numeric; v_wallet numeric; v_behavior text;
begin
  select (p.included ->> p_kind::text)::numeric
    into v_included
    from public.subscriptions_platform s join public.plans p on p.id = s.plan_id
   where s.workspace_id = p_workspace;

  select coalesce(quantity,0) into v_used
    from public.usage_meters
   where workspace_id = p_workspace and kind = p_kind
     and period = date_trunc('month', now())::date;

  select coalesce(balance,0) into v_wallet
    from public.credit_wallets where workspace_id = p_workspace and kind = p_kind;

  v_used := coalesce(v_used,0);
  -- v_included null = unlimited; 0 = not on plan (unless wallet covers it)
  return jsonb_build_object(
    'included', v_included, 'used', v_used, 'wallet', v_wallet,
    'remaining', case when v_included is null then null else v_included - v_used end,
    'over', case when v_included is null then false else (v_used + p_qty) > v_included end
  );
end $$;
```

The caller applies the **behavior** (from §2, plan-overridable) to `meter_check`'s result:

| Behavior | On `over = true` |
|---|---|
| **HARD_STOP** | Block the action. Return the upgrade/top-up prompt (doc 7 gold needs-panel). Used where each unit has real marginal cost and no graceful degradation: `image_gen`, `enrichment`, `voice_minutes`, `video_render` |
| **SOFT_WARN** | Allow. Fire an M04 notification at 80% and 100% of `included`. Used for `email` (cutting email mid-campaign is worse than a small overage) |
| **OVERAGE** | Allow past `included`; every over-unit is billable at the plan's overage rate and shows on the usage dashboard + next invoice. Used for `sms`, `ai_tokens`, `seo_calls` |

Precedence for a credit-drawable meter: **plan `included` is consumed first, then the credit
wallet, then behavior applies.** A workspace with wallet balance never HARD_STOPs until both the
monthly quota and the wallet are exhausted.

`included = 0` (feature not on tier) → treated as HARD_STOP **unless** the wallet covers it,
*and* the feature gate (§6) must also pass — a `free` workspace can't buy SMS credits to route
around a gated feature; the gate is checked first.

---

## 6. FEATURE GATING — `has_feature`

Server-enforced, client-reflected.

```sql
create or replace function public.has_feature(p_workspace uuid, p_flag text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (p.feature_gates ->> p_flag)::boolean
       from public.subscriptions_platform s join public.plans p on p.id = s.plan_id
      where s.workspace_id = p_workspace), false);
$$;
```

- **Edge Functions** for gated modules call `has_feature(ws, 'm34_voice')` first and 403 if false.
- **RLS** on a gated module's tables may add `and public.has_feature(workspace_id,'m33_agents')`
  to write policies for defense in depth.
- **Client** loads the active plan once (a `plan` view over `subscriptions_platform ⋈ plans`) and
  a tiny `feature('m34_voice')` reader hides/disables UI and shows the upgrade prompt. This is a
  courtesy layer only — never the wall.

Gated UI rule (doc 7): show the **gold upgrade prompt**, never a bare 403 or a hidden control.

---

## 7. TRIAL, BILLING STATE & READ-ONLY

- **Trial:** signup provisions the workspace on `free` tier, `subscriptions_platform.status =
  'trialing'`, `current_period_end = now() + 14 days`, card-optional.
- **billing_state flag:** add `billing_state text not null default 'active'` to `workspaces`
  (values `active | trial_expired | past_due | canceled`) via M03's migration; a `pg_cron` daily
  job flips trialing workspaces whose window lapsed to `trial_expired`.
- **Read-only enforcement (database-level):** the standard write policies gain
  `and (select billing_state from public.workspaces w where w.id = workspace_id) = 'active'`.
  A non-active workspace can read everything and delete nothing new — no middleware needed. Auth,
  billing, and settings screens stay reachable so the owner can pay and restore `active`.
- **Stripe → state:** `billing-webhook` maps `invoice.payment_failed → past_due`,
  `customer.subscription.deleted → canceled`, `invoice.paid / checkout.session.completed →
  active`. Idempotent on Stripe event id (dedupe table), per EDGE-FUNCTIONS-SPEC.

---

## 8. CREDIT WALLETS & REBILLING (M42 consumes this)

- **Wallets** (`credit_wallets`, per workspace × meter) hold prepaid balance for credit-drawable
  meters (§2). Top-up = a Stripe checkout via `billing-checkout` → on `invoice.paid` the webhook
  credits the wallet (a `usage_events`-style ledger row of type topup keeps it auditable). Balance
  is `numeric`, drawn in `meter_increment` (§4.1), and **can never go negative** — HARD_STOP meters
  check the wallet in pre-flight; OVERAGE meters bill the shortfall rather than driving it negative.
- **Rebilling math (for M42, defined here so meters carry the data):** an agency sets
  `rebilling_rules.markup_pct` per sub-workspace × meter. Rebillable amount for a period =
  `Σ over usage_events (quantity × unit_cost) × (1 + markup_pct/100)`. Because every event stored
  its `unit_cost` at call time, rebilling is exact and historical — M42 never has to re-derive
  provider prices. This is why §4.2 insists on real `unit_cost`, not estimates.

---

## 9. INCREMENT-POINT MAP — where every module must call the helper

The retrofit-prevention table. When a module is built, it wires exactly these calls. A module in
the left column that ships without its increment/check is a DoD failure.

| Module | Metered action → `meter_kind` | Gate to check first |
|---|---|---|
| M04 Notifications | email send → `email` | — |
| M08 Copilot | query → `ai_tokens` | — |
| M10 Enrichment | enrich → `enrichment` (HARD_STOP) | — |
| M12 Inbox | SMS out → `sms`; AI auto-reply → `ai_tokens` | — |
| M13 Automations | AI-builder → `ai_tokens`; action steps that send → the sent meter | per-action module gate |
| M16 Campaigns | email step → `email`; SMS step → `sms`; AI copy → `ai_tokens` | `m16_campaigns` |
| M14 Calendar / M30 Reputation | reminder/request SMS+email → `sms`/`email` | — |
| M21 SEO / M26 Local | keyword/rank/audit/GBP call → `seo_calls` | `m21_seo` |
| M22 Content | blog pipeline tokens → `ai_tokens`; featured image → `image_gen` | `m22_content` |
| M24 Pinterest / M35 Creative / M19 Sites | image render/gen → `image_gen` | — |
| M25 Video | render → `video_render` (HARD_STOP) | `m25_video` |
| M33 Agents | agent turn → `ai_tokens` | `m33_agents` |
| M34 Voice | call → `voice_minutes` (HARD_STOP) | `m34_voice` |
| M17 Proposals | send email → `email` | — |
| M41 Public API | (optional) request → future `api_call` meter | `public_api` |

---

## 10. UI (per SCREEN-INVENTORY doc 8)

| Screen | Content |
|---|---|
| `app/settings/billing.html` (A8) | Plan card (current tier, price, seats/workspaces used), upgrade/downgrade → `billing-checkout`, Stripe portal link → `billing-portal`, platform invoices list, trial-countdown banner |
| `app/settings/usage.html` (A8+A1) | Per-meter progress bars (used vs included; fill turns `--status-warning` at 80%, `--status-danger` at 100% — doc 7 progress-bar spec), credit-wallet cards + top-up modal, period selector, CSV export (direct Supabase read) |
| `agency/rebilling.html` (A8) | Per-sub-workspace × meter markup_pct editor; projected rebill preview (uses §8 math) — M42 surface, data owned here |
| Global overlays | Trial-countdown chip in topbar; HARD_STOP → upgrade modal; SOFT_WARN → M04 notification; gated control → gold upgrade prompt |

All meter numbers render in `--font-mono` (doc 7 §3). Usage bars never show fabricated data — a
workspace with zero usage shows honest zeros.

---

## 11. DEFINITION OF DONE — M03 (maps every PRD §7 criterion)

- [ ] `plans` seeded with 5 tiers (§3) + Stripe price IDs; editable in M44, never hardcoded in gate logic
- [ ] Full Stripe lifecycle via **test clock**: trialing → active → past_due → canceled → active
- [ ] `billing-webhook` idempotent (Stripe event-id dedupe table); maps all 5 events to `billing_state`/`status`
- [ ] `meter_increment` + `meter_check` shipped in migration 0003; increment is atomic under concurrency (parallel-call test: N increments → count exactly N)
- [ ] HARD_STOP blocks + returns upgrade prompt; SOFT_WARN fires M04 at 80/100%; OVERAGE allows + records billable over-units
- [ ] Credit deduction atomic; balance never negative; top-up via Stripe credits wallet on `invoice.paid`
- [ ] Trial expiry flips `billing_state = trial_expired`; write policies enforce read-only; auth/billing/settings stay reachable
- [ ] `has_feature` enforced in every gated Edge Function; gated UI shows gold prompt, not 403
- [ ] Every `usage_events` row stores real `unit_cost` (rebilling correctness — §8)
- [ ] RLS: `usage_*`, `credit_wallets`, `rebilling_rules`, `subscriptions_platform` workspace-scoped; `plans` global/admin-only; cross-tenant leak test passes
- [ ] Both themes, 360/768/1280, `prefers-reduced-motion`, zero secrets client-side (Stripe keys in Vault, webhook verifies signature)

---

## 12. OPEN ITEMS (flag, don't resolve in a build session)

- **Storage metering:** no `meter_kind` for storage; M06 tracks bytes separately. If plan-limited
  storage is wanted, add `storage_gb` to the enum (new migration + DECISIONS). **OPEN.**
- **Email provider** (D-011, Resend vs SendGrid) sets the `email` meter's `source` and unit cost —
  doesn't change this contract, only the value written. Wire at M16/M04 time.
- **Overage pricing table:** per-meter overage $/unit isn't seeded above; add to `plans` (e.g.
  `overage jsonb`) when overage billing is first turned on (Phase 7, with M42). Not needed to build
  M03's metering core.
- **`api_call` meter** for M41 public API is Phase 7 — add to the enum then, not now.

---

*USAGE-METERING-AND-PLANS v1.0 · Doc 11 of 14 · Pinned to DATA-SCHEMA §5 (migration 0003) ·
Resolves PRD M03 into the vanilla + Supabase stack · Bound by DECISIONS D-001, D-005; Constitution
Law 4. Blocks Session 4.*
