# PRD — M21: SEO Engine
**Layer:** L2 Growth | **Priority:** P1 | **Phase:** 3 (Sessions 24–25)
**Depends On:** M41 (DataForSEO, SerpApi, PSI) | **Blocks:** M22, M26

## 1. Purpose
Semrush-lite: keyword research, SERP analysis, competitor gap, rank tracking, and technical audits. Research/ranking only — content production lives in M22. Implements original PRD Section 13 fully.

## 2. Core Features
(Original PRD Section 13 scope)
- **Keyword research:** seed → volume, CPC, difficulty (0–100 bar), intent badge (informational/commercial/transactional/navigational); 50+ related; question finder; long-tail generator (question+modifier+location matrix); country/language selectors; results table (sortable, multi-select) with actions Save-to-list / **Send to Content Queue (M22)**.
- **SERP analysis:** top-10 cards (domain, title, snippet, est. traffic) via SerpApi; SERP feature flags (snippet, PAA, local pack).
- **Competitor gap:** two domains → keywords they rank for that you don't (DataForSEO ranked-keywords intersect); export + send-to-queue.
- **Keyword lists:** named collections, counts, bulk ops.
- **Rank tracking:** up to plan limit (meter `seo.api_call`); daily 3am BullMQ checks; position history 90-day chart; deltas with arrows; featured-snippet flag; 3 competitor domains tracked per keyword set; weekly summary email (M04); major-movement trigger `rank.change_major` (±5) for M13.
- **Technical audit:** crawler (≤500 pages, robots-aware, rate-limited) — broken links, missing/duplicate titles, missing H1/meta, large images, redirect chains; PageSpeed Insights CWV per key page; schema validator; SSL check; audit score + issue list with fix hints; re-run + compare.
- **Caching:** keyword data cached 30 days per (keyword,country) workspace-shared to cut API spend.

## 3. Database Schema
Original PRD Section 13 tables Prisma-ized (`KeywordList, Keyword, TrackedKeyword, KeywordRanking, SeoAudit`) + `Keyword.cachedAt`, `TrackedKeyword.competitorDomains String[]`, `SeoAuditIssue { auditId, type, severity, url, detail }`.

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/seo/keyword-data | Seed research (DataForSEO proxy, cached) |
| POST | /api/seo/related \| /questions \| /longtail | Expansions |
| POST | /api/seo/serp | SerpApi top-10 |
| POST | /api/seo/gap | Competitor gap |
| CRUD | /api/seo/lists (+keywords) | Collections |
| CRUD | /api/seo/tracked | Rank tracker config |
| GET | /api/seo/tracked/:id/history | Chart data |
| POST | /api/seo/audits (+GET /:id) | Run/read audit |
| POST | /api/seo/send-to-queue | Keywords → M22 content_queue |

## 5. UI
- /seo/keywords: research form + main metric card + tabbed results (Related / Questions / SERP), lists sidebar
- /seo/rankings: tracker table (keyword, position, Δ, URL, checked), row → history chart modal, competitor overlay toggle
- /seo/audit: domain input, score dial, issues table grouped by severity, CWV cards, compare-to-last

## 6. Acceptance Criteria
- [ ] All external calls server-side via M41 creds; cache hit-rate visible in logs
- [ ] Daily rank job resilient (per-keyword failure isolation, retries)
- [ ] rank.change_major trigger fires into M13
- [ ] Crawler respects robots.txt + 2 req/s cap; audit on real site completes
- [ ] Send-to-queue creates M22 content_queue rows
- [ ] seo.api_call metered per external request

## 7. Claude Code Prompt — M21
```
Build Module M21 (SEO Engine) per original PRD Section 13 Claude prompt,
plus:
- lib/seo/dataforseo.ts + serpapi.ts clients (M41 creds, meter each call,
  keyword cache table check first).
- Rank worker: daily cron fan-out → per-keyword jobs → SERP position
  parse (own domain + competitors) → KeywordRanking rows →
  major-delta trigger emit → weekly digest job Mondays.
- Audit worker: BFS crawler (cheerio) with robots + rate limits →
  SeoAuditIssue writes → PSI API for CWV on top pages → score calc.
- Send-to-queue endpoint inserting into M22 content_queue (stub table
  now if M22 not built; schema per M22 PRD).
- UI per PRD with Recharts history lines and score dial.
```

*Next: M22 — Content / CMS*
