# PRD — M36: AI Insights & Churn Prediction ⭐
**Layer:** L4 AI | **Priority:** P3 | **Phase:** 8
**Depends On:** M40 (metrics), M03, M13, M08 | **Blocks:** —

## 1. Purpose
Proactive intelligence for agencies: which sub-accounts (clients) are healthy, which are about to churn, what anomalies need attention, and where the opportunities are — turning platform data into retention.

## 2. Core Features
- **Workspace health score (0–100):** composite per sub-account from weighted signals — login frequency (owner + team), feature breadth (modules touched /30d), outcome metrics (leads created, appointments, revenue collected trend), engagement trend slope, support/notification friction (failed automations, disconnected integrations); recalculated nightly; grade bands Healthy / Watch / At-Risk; score history chart with signal breakdown ("logins ↓60% MoM").
- **Churn prediction:** risk model — v1 heuristic weighted-signal scoring with clearly documented weights, upgrade path to trained model (logistic regression on historical churn labels once ≥6mo data); risk % + top-3 contributing factors in plain language; agency-level risk list sorted by MRR at risk.
- **Retention automation:** `workspace.at_risk` trigger (M13, agency-scope workflows) — e.g. at-risk → task for account manager + check-in email sequence; win-back templates; risk-change notifications (M04) to agency owner.
- **Anomaly detection:** per-workspace metric streams (leads/day, email opens, bookings, revenue, automation failures) — rolling-window z-score detection → anomaly feed ("Form submissions dropped 78% — form X may be broken since site publish Tue"), with probable-cause heuristics (correlate with recent config events from M07 audit).
- **Opportunity surfacing:** rule-driven suggestions — "23 hot-intent leads (M10) untouched 7+ days", "Workspace X's review rating up 0.6 — good case-study candidate", "Email list grew 40% but no campaign sent 30d"; each with one-click action deep link.
- **Weekly digest:** agency-level email — health movers, risks, anomalies, opportunities (opt-in via M04).
- **Copilot integration:** insights exposed as M08 Copilot tools ("which clients are at risk?").

## 3. Database Schema (Prisma)
```prisma
model HealthScore {
  id String @id @default(uuid())
  workspaceId String; date DateTime
  score Int; signalsJson Json; band String
  @@unique([workspaceId, date])
}
model ChurnRisk {
  workspaceId String @id
  riskPct Float; factorsJson Json
  modelVersion String; updatedAt DateTime @updatedAt
}
model Anomaly {
  id String @id @default(uuid())
  workspaceId String; metric String
  observed Float; expected Float; severity String
  probableCause String?; status String @default("open")
  detectedAt DateTime @default(now())
}
model Opportunity {
  id String @id @default(uuid())
  workspaceId String; type String
  title String; detailJson Json; actionLink String
  status String @default("open"); createdAt DateTime @default(now())
}
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/insights/health (+/:workspaceId/history) | Scores (agency rollup + detail) |
| GET | /api/insights/churn | Risk list (agency view) |
| GET | /api/insights/anomalies (+PATCH /:id) | Feed + dismiss/resolve |
| GET | /api/insights/opportunities (+PATCH /:id) | Suggestions |
| POST | /api/insights/recalculate | Manual recompute |

## 5. UI
- /insights (agency-level): health grid (workspace cards colored by band, sortable by risk/MRR), risk table with factors, anomaly feed, opportunity cards with action buttons
- Workspace detail: score history chart + signal breakdown panel
- Digest settings

## 6. Acceptance Criteria
- [ ] Nightly scoring runs across all workspaces <10 min for 1k workspaces
- [ ] Signal breakdown explains every score delta in plain language
- [ ] Seeded at-risk fixture triggers workspace.at_risk + workflow
- [ ] Anomaly detector catches injected 5σ drop; correlates a same-day audit event as probable cause
- [ ] Opportunities dedupe (no repeat open cards for same condition)
- [ ] Copilot tool answers "clients at risk" with linked list

## 7. Claude Code Prompt — M36
```
Build Module M36 (AI Insights). M40/M03/M13/M08/M07 exist.
1. Prisma models per PRD.
2. Nightly scoring worker: signal collectors (logins from auth_events,
   module breadth from audit actions, outcomes from M40 metric tables,
   integration health from M41, automation failures from M13) →
   weighted score (weights in insightsConfig.ts) → HealthScore + band
   transitions → triggers.emit(workspace.at_risk) on downgrade.
3. Churn v1: documented heuristic over score trend + signals →
   ChurnRisk with top factors (template sentences per factor).
4. Anomaly worker: per-metric rolling mean/σ (28d) vs today; severity
   by z; probable cause = same-window M07 audit event correlation.
5. Opportunity rules engine (rules.ts, 8 seed rules) with dedupe keys.
6. Weekly digest job. Copilot tools: insights.health, insights.risks.
7. /insights UI per PRD (agency scope guard: owner/admin only).
```

*Next: M37 — Client Portal*
