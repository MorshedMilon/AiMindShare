# PRD — M27: Ads & Attribution
**Layer:** L2 Growth | **Priority:** P2 | **Phase:** 6
**Depends On:** M41 (Meta/Google Ads), M09, M11, M20 | **Blocks:** M40 full-funnel reporting

## 1. Purpose
Close the loop between ad spend and revenue: connect Meta + Google Ads accounts, pull spend/performance, attribute leads and won deals back to campaigns, and prove ROAS per client — the report agencies get fired over.

## 2. Core Features
- **Ad account connections:** Meta Ads + Google Ads OAuth via M41; account/campaign picker per workspace; nightly sync of campaign → adset/adgroup → ad hierarchy with spend, impressions, clicks, CPC, CTR, platform-reported conversions.
- **Spend dashboard:** cross-platform rollup (spend, clicks, platform conversions, CPL) with date compare; per-campaign table with trend sparklines; budget pacing (monthly budget setting vs actual spend projection).
- **Lead attribution:** UTM capture already flowing from M15 forms / M19 pixel / M20 funnels → attribution resolver maps utm_source/medium/campaign/content to synced ad entities (exact ID match via utm_content={{ad.id}} convention + fuzzy name match fallback); each contact gets first-touch + last-touch ad attribution fields.
- **Revenue attribution:** contact → M11 deals (won value) + M20/M28 orders joined to attributed campaigns → true CPL, cost-per-won-deal, ROAS per campaign/adset/ad; attribution model toggle (first/last touch).
- **Offline conversion upload:** push won-deal conversions back to Meta CAPI + Google offline conversions (improves platform optimization) — opt-in per workspace, hashed identifiers.
- **Alerts:** budget threshold (80/100%), CPL spike (>X% vs 7-day avg), campaign disapproved — via M04 + optional M13 triggers (`ads.cpl_spike`).
- **Client reporting:** ad performance section auto-included in M40 white-label reports; per-campaign notes field for account managers.

## 3. Database Schema (Prisma)
```prisma
model AdAccount {
  id String @id @default(uuid())
  workspaceId String; platform String // meta|google
  externalId String; name String
  currency String; syncEnabled Boolean @default(true)
  lastSyncAt DateTime?
}
model AdEntity {
  id String @id @default(uuid())
  accountId String; workspaceId String
  level String // campaign|adset|ad
  externalId String; parentExternalId String?
  name String; status String
  @@unique([accountId, level, externalId])
}
model AdMetricDaily {
  id String @id @default(uuid())
  entityId String; date DateTime
  spend Float; impressions Int; clicks Int; conversions Float
  @@unique([entityId, date])
}
model ContactAttribution {
  contactId String @id
  workspaceId String
  firstTouchJson Json?; lastTouchJson Json? // {platform, campaignId, adId, utm}
  updatedAt DateTime @updatedAt
}
model AdBudget { entityId String @id; monthlyBudget Float; alertAt Int @default(80) }
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| POST/GET | /api/ads/accounts | Connect / list |
| POST | /api/ads/sync | Manual sync trigger |
| GET | /api/ads/dashboard?range= | Cross-platform rollup |
| GET | /api/ads/entities/:id/metrics | Drill-down |
| GET | /api/ads/attribution?range= | Campaign→leads→revenue table |
| PATCH | /api/ads/budgets/:entityId | Budget + alert config |
| POST | /api/ads/offline-conversions/toggle | CAPI/offline push opt-in |

## 5. UI
- /ads: KPI row (spend, leads, CPL, ROAS), platform tabs, campaign table (spend, clicks, leads, won revenue, ROAS) with expandable adset/ad rows
- /ads/attribution: model toggle, source/medium/campaign breakdown, contact drill-through list
- /settings/ads: connections, budgets, offline conversion opt-in

## 6. Acceptance Criteria
- [ ] Nightly sync populates 30-day metrics for connected accounts
- [ ] UTM→ad entity resolution works via id convention and name fallback
- [ ] ROAS = attributed won revenue / spend, verified against fixture data
- [ ] Budget 80% alert fires; CPL spike detection vs 7-day baseline
- [ ] Offline conversion push sends hashed email/phone correctly (test mode)

## 7. Claude Code Prompt — M27
```
Build Module M27 (Ads & Attribution). M41/M09/M11/M15/M19/M20 exist.
1. Prisma models per PRD.
2. Sync workers: meta insights API + google ads API clients (M41 creds)
   → upsert AdEntity hierarchy + AdMetricDaily (nightly cron + manual).
3. Attribution resolver: on contact create/update with UTM, resolve to
   AdEntity (utm_content ad-id convention → exact; else fuzzy campaign
   name match); write first/last touch. Backfill job for existing.
4. Revenue join queries: attributed contacts → deals(won)+orders →
   per-entity rollups (materialized nightly for report speed).
5. Alert jobs: budget pacing + CPL spike → notify + triggers.emit.
6. Offline conversions: Meta CAPI + Google offline upload services
   on deal.won (hashed identifiers, opt-in gate).
7. UI per PRD with expandable hierarchy table.
```

*Next: M28 — Payments & Invoicing*
