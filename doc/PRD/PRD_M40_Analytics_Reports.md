# PRD — M40: Analytics & Report Builder
**Layer:** L5 Platform | **Priority:** P1 | **Phase:** 5 (core) / 6 (builder)
**Depends On:** All data modules | **Blocks:** M36, M37 reports, M42 agency reporting

## 1. Purpose
The single analytics layer: cross-module KPIs, a metrics warehouse pattern, drag-drop custom report builder, and white-label client reports — the deliverable agencies send to justify retainers.

## 2. Core Features
- **Metrics layer:** `metrics.ts` registry — every module registers metrics (key, label, unit, dimensionality, query resolver): contacts.created, deals.won_value, appointments.held, emails.open_rate, sms.replies, forms.conversion_rate, site.sessions, blog.published, keywords.page1, social.impressions, pins.clicks, reviews.avg_rating, revenue.collected, ads.spend, ads.roas…; nightly rollup jobs materialize daily aggregates per workspace (`MetricDaily`) for fast querying; date-range + compare-period resolver shared by all consumers (M08 KPIs, M36, M37, this module).
- **Overview dashboards:** /analytics — funnel view (sessions → leads → appointments → customers → revenue) with stage conversion rates; per-module tabs (Marketing / Sales / Content & SEO / Social / Reputation / Revenue) with curated chart sets; date range + compare toggles; drill-through links to module pages.
- **Attribution report:** source/medium/campaign performance (first/last-touch toggle, consuming M27 + UTM data): leads, customers, revenue, by channel over time.
- **Custom report builder:** drag-drop canvas — components: metric card, line/bar/area chart (metric × time), pie (metric × dimension), table (metrics × dimension), funnel, text block, image/logo; per-component config (metrics picker from registry, dimension, date behavior); saved reports; personal + shared dashboards.
- **White-label client reports:** report template (built with same builder) + branding (agency logo/colors via M42 or workspace branding) → scheduled generation (monthly/weekly) → PDF (puppeteer) + hosted web version → delivery: email to client and/or publish to M37 portal; per-section commentary fields (account manager notes); report archive.
- **Exports:** any table/chart → CSV; scheduled data exports.
- **Benchmarks (later flag):** anonymized cross-workspace percentile comparisons per niche (opt-in).

## 3. Database Schema (Prisma)
```prisma
model MetricDaily {
  id String @id @default(uuid())
  workspaceId String; metricKey String; date DateTime
  dimensionKey String?; dimensionValue String?
  value Float
  @@unique([workspaceId, metricKey, date, dimensionKey, dimensionValue])
  @@index([workspaceId, metricKey, date])
}
model Report {
  id String @id @default(uuid())
  workspaceId String; name String; type String // dashboard|client_report
  layoutJson Json; brandingJson Json?
  scheduleJson Json?; recipientsJson Json?
  createdBy String; createdAt DateTime @default(now())
}
model ReportRun {
  id String @id @default(uuid())
  reportId String; periodJson Json
  pdfAssetId String?; webToken String @unique
  commentaryJson Json?; sentAt DateTime?
  createdAt DateTime @default(now())
}
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/analytics/metrics | Registry (for builder pickers) |
| POST | /api/analytics/query | { metrics[], range, compare?, dimension? } → series (the one query API) |
| GET | /api/analytics/funnel | Overview funnel |
| GET | /api/analytics/attribution | Source performance |
| CRUD | /api/reports | Builder persistence |
| POST | /api/reports/:id/run | Generate now (PDF + web) |
| GET | /api/public/reports/:webToken | Hosted client view |
| POST | /api/reports/:id/schedule | Cadence + recipients |
| GET | /api/analytics/export | CSV |

## 5. UI
- /analytics: overview funnel + module tabs (Recharts), range/compare picker
- /analytics/attribution: model toggle + channel table/chart
- /reports: list; /reports/[id]/edit: builder (component palette, grid canvas [dnd-kit], config side panel, live preview with real data); run history; schedule modal
- Client report view: clean branded web page + PDF parity

## 6. Acceptance Criteria
- [ ] metrics registry + /query API power M08 KPIs (refactor M08 to consume it)
- [ ] Nightly rollups idempotent; backfill command for history
- [ ] Builder round-trips layoutJson; all component types render with real data
- [ ] Scheduled monthly client report: generated, branded, emailed, archived, portal-published
- [ ] PDF visually matches web version; commentary sections included
- [ ] Query API p95 <500ms on 12-month ranges (rollup-backed)

## 7. Claude Code Prompt — M40
```
Build Module M40 (Analytics & Reports). All Phase 1–4 modules exist.
1. lib/metrics/registry.ts: metric definitions with resolver functions;
   nightly rollup worker materializing MetricDaily (+ backfill CLI).
2. /api/analytics/query: validates against registry, reads MetricDaily
   (falls back to live resolver for today), compare-period support,
   optional dimension grouping.
3. Overview + attribution pages (Recharts) on the query API.
4. Report builder: component schema (Zod), dnd-kit grid canvas,
   config panels bound to registry, save/load layoutJson.
5. Report runner: resolve layout with period data → React template →
   puppeteer PDF → M06; web view route by token; commentary editor;
   schedule cron → email (M04/M16 send) + M37 publish hook.
6. Refactor M08 KPI endpoint to consume the metrics layer.
7. CSV export endpoints.
```

*Next: M42 — White-Label SaaS Mode*
