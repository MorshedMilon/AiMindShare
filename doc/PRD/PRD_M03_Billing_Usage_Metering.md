# PRD — M03: Billing, Plans & Usage Metering
**Layer:** L0 Foundation | **Priority:** P0 | **Phase:** 1 (Session 4)
**Depends On:** M00–M02, M41 (Stripe credentials) | **Blocks:** M42 rebilling, all metered features

## 1. Purpose
Two-sided billing engine: (1) the platform bills agencies via Stripe subscriptions with plan tiers and feature gates; (2) a universal usage-metering system counts every billable action (SMS, email, AI tokens, SEO API calls, voice minutes, enrichment credits, video renders) per workspace — the foundation for M42's rebilling-with-markup.

## 2. Goals & Non-Goals
**Goals:** Plan tiers; Stripe subscription lifecycle; feature gating; usage meters with atomic increments; limits + overage behavior; credit wallets; usage dashboards; invoices from Stripe.
**Non-Goals:** Client-facing invoicing (M28), agency reselling/markup UI (M42 — but the metering data model here must support it), payouts (M38).

## 3. Core Features
- **Plans:** Starter / Growth / Pro / Agency (seeded; editable in M44). Each plan = `{ price, interval, featureFlags: string[], limits: { contacts, emails_mo, sms_mo, ai_tokens_mo, workspaces, users, tracked_keywords, ... } }`.
- **Stripe subscriptions:** checkout session for plan purchase; upgrade/downgrade with proration; cancel at period end; dunning (Stripe Smart Retries + email via M04); webhook handler (`checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated/deleted`).
- **Feature gating:** `requireFeature(flag)` middleware + `useFeature(flag)` hook; gated UI shows upgrade prompt, not a hidden 403.
- **Usage metering:** `meter.increment(workspaceId, meterKey, qty, metadata)` — atomic (Redis INCR + hourly flush to Postgres), never blocks the metered action. Meter keys: `email.sent`, `sms.sent`, `sms.received`, `ai.tokens`, `ai.image`, `seo.api_call`, `voice.minutes`, `enrichment.credit`, `video.render`, `storage.gb`.
- **Limits engine:** `meter.check(workspaceId, meterKey)` before metered actions; behaviors per meter: HARD_STOP (block + upgrade prompt), SOFT_WARN (allow, notify at 80/100%), OVERAGE (allow, bill per-unit).
- **Credit wallet:** prepaid credits per workspace (for AI/SEO/voice); top-up via Stripe; auto-deduct; low-balance alerts.
- **Usage dashboard:** per-workspace current-period consumption bars vs limits; agency-level rollup; CSV export.
- **Trial:** 14-day trial on signup, card-optional; trial expiry → read-only mode until subscribed.

## 4. Database Schema (Prisma)
```prisma
model Plan {
  id String @id @default(uuid())
  name String; stripePriceId String
  price Int; interval String // month|year
  featureFlags String[]
  limitsJson Json
  isActive Boolean @default(true)
}
model Subscription {
  id String @id @default(uuid())
  agencyId String @unique
  planId String
  stripeCustomerId String
  stripeSubId String?
  status String // trialing|active|past_due|canceled
  trialEndsAt DateTime?
  currentPeriodEnd DateTime?
}
model UsageRecord {
  id String @id @default(uuid())
  workspaceId String
  meterKey String
  quantity Int
  periodMonth String // "2026-07"
  metadata Json?
  recordedAt DateTime @default(now())
  @@index([workspaceId, meterKey, periodMonth])
}
model UsageSummary { // materialized hourly
  workspaceId String; meterKey String; periodMonth String
  total Int
  @@id([workspaceId, meterKey, periodMonth])
}
model CreditWallet {
  workspaceId String @id
  balance Int @default(0) // cents-equivalent credits
  lowBalanceThreshold Int @default(500)
}
model CreditTransaction {
  id String @id @default(uuid())
  workspaceId String; amount Int; type String // topup|deduct|refund
  meterKey String?; stripePaymentId String?
  createdAt DateTime @default(now())
}
```

## 5. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/billing/plans | List plans |
| POST | /api/billing/checkout | Create Stripe checkout session |
| POST | /api/billing/portal | Stripe customer portal session |
| POST | /api/billing/webhook | Stripe webhook handler |
| GET | /api/billing/subscription | Current sub + trial status |
| GET | /api/usage | Usage summary (period, per meter) |
| GET | /api/usage/export | CSV export |
| POST | /api/credits/topup | Buy credits |
| GET | /api/credits | Wallet balance + transactions |

## 6. UI
| Route | Page |
|---|---|
| /settings/billing | Plan card, upgrade/downgrade, payment method (Stripe portal link), invoices list |
| /settings/usage | Meter bars vs limits, credit wallet card, top-up modal |
| (global) | Trial banner countdown; limit-reached upgrade modals |

## 7. Acceptance Criteria
- [ ] Full Stripe lifecycle verified with test clock (trial → active → past_due → canceled)
- [ ] Webhook idempotency (event ID dedupe)
- [ ] `meter.increment/check` helpers exported; Redis-buffered; hourly flush job
- [ ] HARD_STOP meter blocks action with upgrade prompt; SOFT_WARN notifies at 80%
- [ ] Credit deduction atomic; never negative
- [ ] Trial expiry flips workspace to read-only (middleware flag)

## 8. Claude Code Prompt — M03
```
Build Module M03 (Billing & Usage Metering). M00–M02 exist.
Stack additions: Stripe SDK, Redis, BullMQ.
1. Prisma models per PRD. Seed 4 plans with Stripe test price IDs.
2. lib/meter.ts: increment() (Redis INCRBY, fire-and-forget) and
   check() (reads UsageSummary + Redis delta vs plan limit).
   BullMQ hourly job flushes Redis counters → UsageRecord + UsageSummary.
3. lib/features.ts: requireFeature(flag) + useFeature(flag).
4. Stripe: checkout, portal, webhook (idempotent, all 5 events).
5. Trial logic in requireWorkspace(): status=trial_expired → read-only.
6. UI: /settings/billing, /settings/usage with Recharts meter bars.
7. Tests: meter increments under concurrency; hard-stop blocking.
EVERY FUTURE METERED ACTION MUST CALL meter.increment() — document this.
```

*Next: M04 — Notifications Center*
