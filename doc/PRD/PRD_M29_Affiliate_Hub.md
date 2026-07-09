# PRD — M29: Affiliate Marketing Hub ⭐
**Layer:** L3 Commerce | **Priority:** P2 | **Phase:** 6
**Depends On:** M22, M19, M41 (Amazon PA-API, networks) | **Blocks:** —

## 1. Purpose
Tools for users who EARN as affiliates (distinct from M38, where users RUN referral programs): link management, Amazon tooling, network earnings dashboards, and AI affiliate content — pairs with M22 auto-blogging to make niche-site money machines.

## 2. Core Features
- **Link cloaker/manager:** pretty links (`site.com/go/product-name`) → 301/302 redirects to affiliate URLs; per-link click tracking (timestamp, referrer, device, country, page source); link groups/tags; broken-destination checker (weekly HEAD checks + alerts); global link auto-insertion rules for M22 articles (keyword → link, first-occurrence, caps per article); nofollow/sponsored attributes automatic.
- **Link A/B rotation:** one pretty link → rotate multiple destinations (e.g. two merchants), split %, EPC comparison.
- **QR codes** per link for offline/social.
- **Amazon toolkit:** PA-API via M41 — product search + import (title, images, price, rating, Prime badge); **product boxes** (CTA widget embeds for M22 articles / M19 pages: single box, top-3 list, bestseller grid); **comparison table builder** (products × feature rows, auto-filled attributes, editable, responsive embed); price/availability auto-refresh (respecting PA-API terms — cached ≤24h); price-drop alerts → optional auto-post to M23 ("deal alert").
- **Multi-network dashboard:** connect ClickBank, ShareASale, Impact, CJ, Digistore24 (API/report-import via M41; CSV import fallback) → unified earnings view (clicks, conversions, commissions, EPC by network/merchant/link); month compare; payout calendar.
- **AI affiliate content (with M22):** product review generator (pros/cons, verdict, FTC disclosure block enforced), "best X for Y" listicle generator pulling Amazon data into product boxes, buying guide generator; templates ensure disclosure compliance.
- **Niche site dashboard:** per-M19-site rollup — articles, traffic (site pixel), affiliate clicks, estimated earnings (network attribution by link), RPM.

## 3. Database Schema (Prisma)
```prisma
model AffLink {
  id String @id @default(uuid())
  workspaceId String; slug String; destinations Json // [{url, weight}]
  groupId String?; attrs Json? // nofollow etc
  status String @default("active"); lastCheckAt DateTime?; broken Boolean @default(false)
  @@unique([workspaceId, slug])
}
model AffClick {
  id String @id @default(uuid())
  linkId String; destinationUrl String
  referrer String?; device String?; country String?
  sourcePath String?; createdAt DateTime @default(now())
  @@index([linkId, createdAt])
}
model AmazonProduct {
  id String @id @default(uuid())
  workspaceId String; asin String
  dataJson Json; priceCents Int?; refreshedAt DateTime
  priceAlertBelow Int?
  @@unique([workspaceId, asin])
}
model ProductWidget {
  id String @id @default(uuid())
  workspaceId String; type String // box|top3|comparison
  configJson Json; embedToken String @unique
}
model NetworkConnection { id String @id @default(uuid()); workspaceId String; network String; status String }
model NetworkEarning {
  id String @id @default(uuid())
  workspaceId String; network String; date DateTime
  merchant String?; linkRef String?
  clicks Int?; conversions Int?; commissionCents Int
  @@index([workspaceId, network, date])
}
model AutoLinkRule { id String @id @default(uuid()); workspaceId String; keyword String; linkId String; maxPerArticle Int @default(1) }
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| CRUD | /api/aff/links (+groups, +rules) | Link mgmt |
| GET | /go/:slug | Public redirect (click log, rotation) |
| GET | /api/aff/links/:id/stats | Click analytics |
| POST | /api/aff/amazon/search \| /import | PA-API |
| CRUD | /api/aff/widgets | Boxes/tables (+embed JS) |
| POST/GET | /api/aff/networks (+earnings, +csv-import) | Network sync |
| POST | /api/aff/ai/review \| /listicle \| /guide | Content gen (→ M22 draft) |
| GET | /api/aff/dashboard?siteId= | Niche site rollup |

## 5. UI
- /affiliate: earnings overview (network cards, trend, top links EPC)
- /affiliate/links: table (clicks 7/30d, status, broken flag), link editor (destinations + rotation), rules tab
- /affiliate/amazon: product search/import, widget builder (live preview), price alerts
- /affiliate/networks: connections + unified earnings table
- AI content modals launching into M22 editor

## 6. Acceptance Criteria
- [ ] Redirect <50ms p95 (edge-cacheable lookup) with async click logging
- [ ] Rotation split honored ±2% over 1k clicks; EPC per destination
- [ ] Amazon data cached ≤24h; price alert fires; widgets render responsive with disclosure
- [ ] Auto-link rules insert into generated M22 articles with caps
- [ ] CSV earnings import maps to unified schema
- [ ] AI review includes FTC disclosure block (non-removable in template)

## 7. Claude Code Prompt — M29
```
Build Module M29 (Affiliate Hub). M22/M19/M41 exist.
1. Prisma models per PRD.
2. /go/:slug route (edge-friendly): weighted destination pick, 302,
   fire-and-forget AffClick insert (queue). Weekly broken-link checker.
3. Amazon PA-API client via M41 (getItems/searchItems), 24h cache,
   refresh worker, price-drop alert job.
4. Widget system: ProductWidget config → embed.js renderer (also a
   Craft.js component for M19 + TipTap node for M22).
5. Network adapters (start: CSV import + 2 API integrations) →
   NetworkEarning normalized rows; unified dashboard queries.
6. Auto-link post-processor hooked into M22 pipeline (after article
   gen, before publish): keyword scan → insert links per rules.
7. AI generators (GPT-4o) creating M22 drafts with product-box tokens
   and mandatory disclosure block.
```

*Next: M30 — Reputation & Reviews*
