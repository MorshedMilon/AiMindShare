# PRD — M38: Referral & Affiliate Program Manager
**Layer:** L5 Platform | **Priority:** P2 | **Phase:** 6
**Depends On:** M09, M28, M20, M41 (payout rails) | **Blocks:** M31 course affiliates

## 1. Purpose
Let workspaces RUN their own referral/affiliate programs (inverse of M29): recruit promoters, track referred sales, calculate commissions, and pay out — turning customers into a salesforce.

## 2. Core Features
- **Programs:** per workspace, multiple programs (e.g. "Customer referrals" + "Influencer program"); commission models: flat per signup, % of first payment, recurring % of MRR (duration-capped or lifetime), tiered volume bonuses; cookie window (e.g. 30/60/90d, last-click); optional two-tier (sub-affiliate override %).
- **Affiliate accounts:** signup page per program (public, branded) → affiliate records (can link to M09 contact); approval mode (auto/manual); affiliate portal (separate lightweight login — magic link): unique links (+ per-campaign sublinks), stats (clicks, signups, conversions, pending/approved/paid commissions), payout history, marketing assets area (M06 shared collection: banners, swipe copy).
- **Tracking:** referral links (`?ref=CODE`) → first/last-click cookie via site/funnel scripts (M19/M20) → conversion attribution on M28/M20 payment events; cross-device fallback via coupon codes assigned per affiliate; self-referral + same-IP fraud flags (review queue).
- **Commission engine:** on `payment.received` with attribution → commission record (pending) → approval window (e.g. 30d refund period) → approved; refund → clawback; recurring model: commission per renewal invoice while active; ledger per affiliate.
- **Payouts:** batch payout runs (monthly/threshold-based) → methods: PayPal Payouts API, Stripe Connect transfers (affiliate onboarded), or manual-mark-paid with reference; payout statements (PDF); tax info collection field (W-9/W-8 upload to M06, gated before first payout).
- **Promotion tools:** leaderboards (opt-in, gamification), announcement emails to affiliates (mini-broadcast via M16 infra), contest periods (bonus multipliers).
- **Analytics:** program ROI (commission paid vs referred revenue), top affiliates, conversion rate per affiliate, cohort quality (refund rate of referred customers).

## 3. Database Schema (Prisma)
```prisma
model ReferralProgram {
  id String @id @default(uuid())
  workspaceId String; name String
  commissionJson Json; cookieDays Int @default(30)
  twoTierJson Json?; approvalMode String @default("auto")
  status String @default("active")
}
model Affiliate {
  id String @id @default(uuid())
  programId String; workspaceId String
  contactId String?; email String; name String
  code String @unique; parentAffiliateId String?
  status String @default("active")
  payoutMethodJson Json?; taxDocAssetId String?
  createdAt DateTime @default(now())
}
model ReferralClick { id String @id @default(uuid()); affiliateId String; url String; ipHash String; createdAt DateTime @default(now()) }
model Referral {
  id String @id @default(uuid())
  affiliateId String; contactId String
  source String // cookie|coupon
  convertedAt DateTime?; fraudFlag String?
  createdAt DateTime @default(now())
}
model Commission {
  id String @id @default(uuid())
  affiliateId String; referralId String
  invoiceId String?; amountCents Int
  tier Int @default(1)
  status String @default("pending") // pending|approved|reversed|paid
  approvableAt DateTime; payoutId String?
  createdAt DateTime @default(now())
}
model Payout { id String @id @default(uuid()); workspaceId String; affiliateId String; amountCents Int; method String; reference String?; status String; paidAt DateTime?; statementAssetId String? }
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| CRUD | /api/referrals/programs | Programs |
| POST | /api/public/referrals/:programId/join | Affiliate signup |
| GET/POST | /api/affiliate-portal/* | Portal (stats, links, assets, payout info) |
| POST | /api/public/r/track | Click tracking (script) |
| GET | /api/referrals/affiliates (+approve, +fraud queue) | Management |
| GET | /api/referrals/commissions (+approve/reverse) | Ledger |
| POST | /api/referrals/payouts/run | Batch payout |
| GET | /api/referrals/analytics | Program ROI |

## 5. UI
- /referrals: program cards + ROI stats; affiliates table (status, clicks, conversions, owed); commissions ledger with approval queue; fraud review tab; payout runs page
- Affiliate portal (branded, standalone): dashboard, links generator, assets, payouts, leaderboard
- Public join page per program

## 6. Acceptance Criteria
- [ ] Click → cookie → purchase attribution within window; coupon fallback works
- [ ] Recurring commissions accrue on renewal invoices; refund claws back
- [ ] Two-tier override calculates on sub-affiliate conversions
- [ ] Payout run: PayPal sandbox batch + Stripe transfer + manual all function; statement PDF generated
- [ ] Tax doc gate blocks first payout until uploaded
- [ ] Self-referral (same email/IP) lands in fraud queue, not auto-approved

## 7. Claude Code Prompt — M38
```
Build Module M38 (Referral Manager). M09/M28/M20/M19/M41 exist.
1. Prisma models per PRD.
2. Tracking: r/track script (included by M19/M20 page scripts) setting
   ref cookie (program window); attribution resolver hooked into M28
   payment.received + M20 order flow (cookie or coupon-code match) →
   Referral + Commission (pending, approvableAt = +refund window).
3. Commission engine: approval cron (pending→approved past window),
   refund webhook → reversed, recurring accrual on renewal invoices,
   two-tier fan-out.
4. Fraud checks: self-email match, ipHash affiliate==referral, velocity.
5. Payout service: batch builder → PayPal Payouts / Stripe transfer
   adapters (M41) / manual; statement PDF (puppeteer) → M06.
6. Affiliate portal: magic-link auth (separate from platform users),
   dashboard + link builder (+sublinks) + assets (shared M06 collection).
7. Admin UI per PRD; leaderboard + contest multiplier support.
```

*Next: M39 — Marketplace (Snapshots & Templates)*
