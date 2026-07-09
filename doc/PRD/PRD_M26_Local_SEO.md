# PRD — M26: Local SEO
**Layer:** L2 Growth | **Priority:** P2 | **Phase:** 6
**Depends On:** M21, M41 (GBP API, DataForSEO Local), M30 | **Blocks:** —

## 1. Purpose
Map-pack domination for service businesses: Google Business Profile management, citations, local rank tracking, and local schema. Implements original PRD Section 21 fully.

## 2. Core Features
(Original PRD Section 21 scope)
- **GBP connection:** OAuth via M41; multi-location support (location picker per workspace); profile health card (completeness checklist: categories, hours, photos count, Q&A, posts recency).
- **GBP management:** edit business info; upload photos (M06); Q&A monitor + answer; special offers/events/updates posting.
- **GBP post scheduler:** compose (text + image + CTA type: Learn/Book/Call/Offer) → schedule like M23 (shares calendar view, GBP adapter); recurring posts.
- **Citation builder:** NAP profile per location (canonical Name/Address/Phone/site/hours/categories) → guided submission tracker across 50+ directories (Yelp, YP, Bing Places, Apple Maps, Foursquare, TripAdvisor…) — per-directory status (not_submitted / submitted / live / inconsistent), direct submission where API exists, manual checklist with prefilled data + copy buttons otherwise.
- **Citation monitor:** weekly job re-checks live listings (scrape/API) for NAP consistency; inconsistency flags with diff (e.g. old phone number found on Yelp) + fix tracking.
- **Map-pack rank tracker:** keyword + location grid — DataForSEO Local SERP checks; local-pack position (1–3, or organic-local position); geo-grid option (positions from N points around city — 3×3 grid) rendered as heat map; history charts; competitor pack tracking.
- **Local keyword research:** M21 research filtered/modified with city/metro modifiers; "near me" variants generator.
- **Competitor local analysis:** competitor GBP snapshot — review count/rating, categories, photo count, posting frequency; side-by-side comparison table.
- **LocalBusiness schema injector:** generate + inject JSON-LD on M19 site pages from NAP profile (auto-sync on NAP change).
- **Review tie-in:** deep links to M30 review workflows; local review velocity chart.

## 3. Database Schema (Prisma)
```prisma
model GbpLocation {
  id String @id @default(uuid())
  workspaceId String; gbpLocationId String
  name String; napJson Json; healthScore Int?
  connectedAt DateTime @default(now())
}
model Citation {
  id String @id @default(uuid())
  workspaceId String; locationId String
  directory String; listingUrl String?
  status String @default("not_submitted")
  lastCheckedAt DateTime?; inconsistencyJson Json?
}
model LocalRankKeyword {
  id String @id @default(uuid())
  workspaceId String; locationId String
  keyword String; gridJson Json? // geo points
}
model LocalRankResult {
  id String @id @default(uuid())
  keywordId String; point String? // grid point or center
  packPosition Int?; organicPosition Int?
  competitorsJson Json?; checkedAt DateTime @default(now())
}
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| POST/GET | /api/local/gbp | Connect / locations + health |
| PATCH | /api/local/gbp/:id | Update info / photos |
| CRUD | /api/local/gbp/:id/posts | GBP posts (+schedule) |
| GET/POST | /api/local/gbp/:id/qa | Q&A monitor/answer |
| CRUD | /api/local/citations | Tracker + submission status |
| POST | /api/local/citations/check | Run consistency check |
| CRUD | /api/local/rank-keywords | Tracker config |
| GET | /api/local/rank-keywords/:id/results | History + grid |
| GET | /api/local/competitors?domain= | GBP snapshot compare |
| POST | /api/local/schema/sync/:siteId | Inject LocalBusiness JSON-LD |

## 5. UI
- /local: location switcher, GBP health card, quick actions
- /local/posts: GBP scheduler calendar
- /local/citations: directory table with statuses + submission drawer (prefilled NAP, copy buttons)
- /local/rankings: keyword table + geo-grid heat map modal + history charts
- /local/competitors: comparison table

## 6. Acceptance Criteria
- [ ] GBP connect/edit/post verified on test profile
- [ ] Citation checker detects a seeded inconsistency
- [ ] Geo-grid check stores per-point positions; heat map renders
- [ ] Schema injector output validates (Rich Results test structure)
- [ ] All external calls metered (seo.api_call) via M41

## 7. Claude Code Prompt — M26
```
Build Module M26 (Local SEO). M21/M41/M19/M30 exist.
1. Prisma models per PRD.
2. GBP client via M41 (Business Profile APIs): locations list, patch
   info, media upload, localPosts CRUD, questions list/answer.
3. GBP scheduler: reuse M23 adapter pattern (gbp adapter) + calendar.
4. Citation system: directories.ts registry (50 entries: name, url,
   submitUrl, checkStrategy); weekly BullMQ checker (fetch+parse or API)
   diffing NAP → inconsistencyJson; submission drawer UI.
5. Local rank worker: DataForSEO Local SERP per keyword (+optional
   3x3 grid coords around location) daily; results + heat map UI.
6. Schema sync service writing LocalBusiness JSON-LD into M19 site
   settings; re-sync on NAP change.
```

*Next: M27 — Ads & Attribution*
