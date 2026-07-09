# PRD — M08: Dashboard & AI Copilot ⭐
**Layer:** L1 Core Ops | **Priority:** P1 (dashboard) / P2 (Copilot) | **Phase:** 1 + 6
**Depends On:** M09–M16 data, pgvector | **Blocks:** —

## 1. Purpose
The home screen: at-a-glance KPIs and activity — plus, in Phase 6, a platform-wide AI Copilot that answers natural-language questions over workspace data and drafts actions.

## 2. Core Features
### Dashboard (Phase 1)
- **KPI row:** new contacts (this month vs last, sparkline), pipeline value, revenue collected, appointments upcoming, articles published, keywords on page 1, social impressions — each card deep-links to its module. Cards render only for enabled modules.
- **Widgets grid (customizable):** recent activity feed, tasks due today, pipeline snapshot (mini funnel), recent conversations, upcoming appointments, latest form submissions, usage meters mini (M03). Drag-reorder, show/hide; layout saved per user.
- **Date range selector** affecting KPI comparisons.
- **Quick actions bar:** New Contact, New Deal, Compose, Book Appointment, New Task.

### AI Copilot (Phase 6)
- **Global command bar:** ⌘K opens Copilot overlay from any page.
- **Capabilities:** answer questions over workspace data ("Which leads should I call today?" → scored+recent list with links; "Why did open rates drop this month?" → comparative campaign analysis), draft actions ("Draft a follow-up email for the Acme deal" → opens composer pre-filled), navigate ("take me to Jane Doe's deals").
- **Architecture:** function-calling agent — GPT-4o with tool schema over internal read APIs (contacts.search, deals.query, campaigns.stats, appointments.list, analytics.query) + action drafters (never auto-executes writes; always previews with user confirm). Conversation memory per session; workspace context injected.
- **Daily AI briefing (opt-in):** morning email — pipeline movement, hot leads, today's appointments, anomalies.
- **Metering:** every Copilot call → `meter.increment('ai.tokens')`.
- **Safety:** read tools scoped by requireWorkspace; Copilot cannot touch billing, team, or settings; all drafted actions require explicit user confirmation.

## 3. Database Schema (Prisma)
```prisma
model DashboardLayout {
  userId String; workspaceId String
  layoutJson Json
  @@id([userId, workspaceId])
}
model CopilotConversation {
  id String @id @default(uuid())
  workspaceId String; userId String
  messagesJson Json
  createdAt DateTime @default(now())
}
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/dashboard/kpis?range= | Aggregated KPI payload |
| GET/PATCH | /api/dashboard/layout | Widget layout |
| POST | /api/copilot/chat | Copilot message (SSE stream) |
| GET | /api/copilot/tools | (internal) tool registry |
| POST | /api/copilot/briefing/toggle | Daily briefing opt-in |

## 5. UI
- /dashboard: KPI row + widget grid (dnd-kit reorder) + quick actions
- Copilot: ⌘K overlay — chat stream, tool-call chips ("Searching deals…"), action preview cards with Confirm/Cancel

## 6. Acceptance Criteria
- [ ] KPIs accurate vs module sources; range comparison correct
- [ ] Layout persistence per user; widgets lazy-load
- [ ] Copilot answers the 3 canonical queries in PRD with linked results
- [ ] Drafted actions never execute without confirmation
- [ ] Tokens metered; briefing email renders

## 7. Claude Code Prompt — M08
```
Phase 1: Build dashboard. /api/dashboard/kpis aggregates from
contacts, deals, invoices, appointments, blog_articles,
keyword_rankings, social_posts (only query tables that exist; feature-
flag cards). Widget grid with dnd-kit, per-user layout persistence.

Phase 6: Build Copilot. Tool registry (copilotTools.ts) exposing
read-only functions wrapping internal services, each enforcing
requireWorkspace. GPT-4o function-calling loop with SSE streaming.
Action drafts return { type:'draft', module, payload } rendered as
confirm cards — POST to real endpoints only on user confirm.
Meter ai.tokens per call. ⌘K overlay component mounted in app shell.
Daily briefing BullMQ job (8am workspace tz) composing summary email.
```

*Next: M09 — CRM*
