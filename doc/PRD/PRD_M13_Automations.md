# PRD — M13: Automations
**Layer:** L1 Core Ops | **Priority:** P0 | **Phase:** 1 (Sessions 14–15)
**Depends On:** M09, M11, M12, M04 | **Blocks:** Nearly everything (nervous system)

## 1. Purpose
Visual no-code workflow engine (React Flow) with a central trigger bus every module publishes to. Implements original PRD Section 9 fully, plus the AI workflow builder.

## 2. Core Features
- **Trigger bus:** `triggers.emit(workspaceId, type, payload)` — the platform-wide event entry point. Registered trigger types (extensible registry): contact.created/updated, tag.added/removed, form.submitted, deal.stage_changed, appointment.booked/cancelled/no_show, email.opened/clicked, sms.received, payment.received/failed, date.scheduled, webhook.received, page.visited, review.received, intent.hot, invoice.overdue.
- **Canvas builder:** React Flow — node panel (search + categories), config side panel per node, minimap, validation (unconnected nodes, missing config) before save/activate.
- **Nodes:** per original PRD Section 9 — trigger (green), 17 actions (blue: send email/SMS/WhatsApp, add/remove tag, move deal, create deal/task, assign, update field, add-to-campaign, wait, webhook POST, create invoice, grant course access, schedule social post, publish article, internal notification), IF/ELSE condition (orange diamond, field/tag/score/deal-value/form-answer operators), goal node (exit when condition met).
- **Execution engine:** BullMQ worker walks nodes_json/edges_json; wait nodes = delayed re-queue; per-step logging; retries (2, exponential); failure → `automation.failed` notification; per-contact concurrency guard (one active execution per workflow per contact unless allowed).
- **Re-entry rules:** per workflow — allow re-entry / once ever / once per X days.
- **AI builder:** "Describe your automation" → GPT-4o with node-schema system prompt → valid nodes/edges JSON → loaded on canvas for review (never auto-activated); meter ai.tokens.
- **Templates:** 15 seeded (7-day nurture, appointment reminders, review request, cart abandonment, birthday, re-engagement, onboarding, no-show rebook, invoice chase, hot-intent alert...). One-click install → editable copy.
- **Execution log:** table (contact, started, status, steps) → timeline detail with per-node green/red status, payload snapshots, retry button on failed step.
- **Testing:** "Test with contact" runs a sandbox execution (sends suppressed, logged as simulated).

## 3. Database Schema
Original PRD Section 9 tables (`Workflow, WorkflowExecution, WorkflowExecutionStep`) + `Workflow.reentryRule`, `Workflow.version` (config snapshots on edit so running executions finish on their version), `WorkflowTemplate` seed table.

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| CRUD | /api/workflows | Manage (save serialized canvas) |
| POST | /api/workflows/:id/activate \| /deactivate | Toggle |
| POST | /api/workflows/ai-generate | NL → nodes JSON |
| POST | /api/workflows/:id/test | Sandbox run with contact |
| GET | /api/workflows/:id/executions (+/:execId) | Logs |
| POST | /api/automations/trigger | Internal bus HTTP entry (modules may also call lib directly) |
| GET | /api/workflow-templates (+/:id/install) | Templates |

## 5. UI
- /automations: list (name, trigger, active toggle, runs 7d, last run)
- /automations/[id]: full-screen canvas per original PRD Section 9 prompt
- Execution log pages; template gallery modal

## 6. Acceptance Criteria
- [ ] triggers.emit() registry documented; all Phase-1 modules wired
- [ ] Wait node accuracy ±1 min over 24h delay
- [ ] Version snapshot: editing live workflow doesn't corrupt running executions
- [ ] IF/ELSE evaluates all operator types incl. custom fields
- [ ] AI builder outputs schema-valid JSON (Zod-validated, rejected gracefully)
- [ ] Failed step visible with error + retryable

## 7. Claude Code Prompt — M13
```
Build Module M13 (Automations) per original PRD Section 9 Claude prompt,
plus platform requirements:
1. lib/triggers.ts: registry + emit() → finds active workflows matching
   (workspaceId, triggerType, triggerConfig) → enqueue executions.
2. Execution worker: node walker with typed handlers map
   (actions call real module services: M12 send, M09 tags/tasks,
   M11 deal moves, M28 invoice, later modules register handlers).
   Wait = delayed job; steps logged; version-pinned config.
3. Zod schema for nodes/edges JSON (shared by save + AI builder).
4. AI builder endpoint: GPT-4o system prompt embedding node schema +
   examples; validate output; return for canvas review.
5. Seed 15 templates. Sandbox test mode flag suppressing real sends.
6. Canvas UI: React Flow, node panel, config panel, validation banner.
```

*Next: M14 — Calendar & Booking*
