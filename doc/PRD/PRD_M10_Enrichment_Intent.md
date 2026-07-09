# PRD — M10: Lead Enrichment & Intent Engine ⭐
**Layer:** L1 Core Ops | **Priority:** P2 | **Phase:** 5
**Depends On:** M09, M03 (credits), M41 | **Blocks:** —

## 1. Purpose
Turn thin form-fills into rich profiles automatically and surface buying intent — company data appended, social profiles matched, anonymous website visitors identified at company level, and intent scores computed from behavior.

## 2. Core Features
- **Contact enrichment:** on contact create (or manual trigger / bulk), call enrichment provider (Apollo/Clearbit-style via M41) with email domain → append company name, industry, size, revenue range, tech stack, LinkedIn URLs; results stored in dedicated enrichment fields + merged into company record; confidence score shown; provider-agnostic adapter interface so vendors can swap.
- **Credits:** each enrichment = 1 credit → `meter.increment('enrichment.credit')`; HARD_STOP at 0 with top-up prompt (M03 wallet).
- **Auto-enrich rules:** settings toggle — enrich all new contacts / only business emails (skip gmail/yahoo/etc.) / manual only.
- **Visitor identification:** tracking script (extends M19 site pixel) → reverse-IP company lookup for anonymous traffic → "Companies visiting" feed (company, pages viewed, visits, first/last seen); one-click "Create company + research contacts" action.
- **Intent scoring:** per contact — weighted recency-decayed score from page visits (pricing page ×3), email engagement, form activity; per company — aggregate of its contacts + anonymous visits; hot-intent threshold triggers M13 automation event `intent.hot`.
- **Enrichment review:** diff panel on contact before applying (auto-apply optional); enrichment history log.

## 3. Database Schema (Prisma)
```prisma
model EnrichmentResult {
  id String @id @default(uuid())
  workspaceId String; contactId String?
  companyDomain String
  provider String; confidence Float
  dataJson Json // normalized: industry, size, revenue, tech[], linkedin...
  appliedAt DateTime?
  createdAt DateTime @default(now())
}
model VisitorCompany {
  id String @id @default(uuid())
  workspaceId String; companyName String; domain String?
  firstSeenAt DateTime; lastSeenAt DateTime
  visitCount Int @default(1); pagesJson Json
  linkedCompanyId String?
}
model IntentScore {
  id String @id @default(uuid())
  workspaceId String
  entityType String; entityId String // contact|company
  score Int; signalsJson Json
  updatedAt DateTime @updatedAt
  @@unique([workspaceId, entityType, entityId])
}
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/enrichment/contact/:id | Enrich now (deduct credit) |
| POST | /api/enrichment/bulk | Bulk enrich smart list |
| POST | /api/enrichment/:resultId/apply | Apply reviewed data |
| GET/PATCH | /api/enrichment/settings | Auto-enrich rules |
| GET | /api/visitors/companies | Visiting-companies feed |
| POST | /api/visitors/companies/:id/convert | Create Company record |
| GET | /api/intent/:entityType/:id | Intent score + signals |

## 5. UI
- Contact detail: Enrichment card (data, confidence, Apply/Refresh)
- /visitors: companies feed with page-view detail drawer
- /settings/enrichment: rules, provider status, credit balance
- Intent badge (flame icon tiers) on contact/company lists

## 6. Acceptance Criteria
- [ ] Adapter interface allows provider swap without touching callers
- [ ] Credits deducted atomically; zero-balance blocks with prompt
- [ ] Business-email-only rule skips free domains
- [ ] intent.hot event fires into M13 when threshold crossed
- [ ] Visitor feed populates from site pixel; convert action links records

## 7. Claude Code Prompt — M10
```
Build Module M10 (Enrichment & Intent). M09 + M03 + M41 exist.
1. lib/enrichment/adapter.ts interface + one concrete provider adapter
   (mock provider for dev; real provider behind M41 creds).
2. BullMQ enrich worker: dedupe by domain (reuse recent results),
   deduct credit via M03 wallet, write EnrichmentResult, optional
   auto-apply merging into Contact/Company with audit().
3. Visitor pipeline: extend site tracking endpoint — reverse-IP lookup
   (provider adapter), upsert VisitorCompany with page rollups.
4. Intent scorer: nightly + event-driven recalcs with recency decay;
   emit intent.hot automation event via M13 trigger bus.
5. UI per PRD. Enforce enrichment.credit HARD_STOP metering.
```

*Next: M11 — Pipeline*
