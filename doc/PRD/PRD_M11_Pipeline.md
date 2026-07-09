# PRD — M11: Pipeline
**Layer:** L1 Core Ops | **Priority:** P0 | **Phase:** 1 (Session 11)
**Depends On:** M09 | **Blocks:** M13 deal triggers, M27 attribution, M40

## 1. Purpose
Visual deal tracking — Kanban pipelines with stage automations, forecasting, and win/loss analytics. Implements original PRD Section 7 fully.

## 2. Core Features
(Complete original PRD Section 7 scope)
- Multiple pipelines; stage editor (name, order, color, close probability)
- Kanban with @hello-pangea/dnd; optimistic drag; column totals + counts
- Deal cards: contact avatar, title, value, assignee, days-in-stage badge (gray <3d / yellow 3–7d / red >7d), file + overdue-task icons
- Deal drawer (Sheet): Overview (inline-editable fields + custom fields) / Notes / Files (M06 picker) / Activity
- Add Deal modal with contact typeahead
- Win/Lost: required lost reason; wonAt revenue logging → timeline + M40
- List view (sortable table) toggle; filters (assignee, value range, tags, dates); bulk stage move
- Revenue forecast bar: Σ(value × stage probability) vs monthly target (setting)
- Deal value history log
- **Stage-change event bus:** every stage move emits `deal.stage_changed` → M13 trigger + `timeline.add()` on contact + audit()

## 3. Database Schema
Original PRD Section 7 tables Prisma-ized (`Pipeline, PipelineStage, Deal, DealNote, DealFile`) + `DealValueHistory { id, dealId, oldValue, newValue, changedBy, createdAt }` + `PipelineTarget { pipelineId, monthlyTarget }`. All workspace-scoped, `Deal` indexed on `(workspaceId, stageId)`.

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| CRUD | /api/pipelines, /api/pipelines/:id/stages | Pipeline + stage mgmt |
| CRUD | /api/deals | Create/get/update/delete |
| PATCH | /api/deals/:id/stage | Move (emits event) |
| POST | /api/deals/:id/won \| /lost | Close with reason |
| POST | /api/deals/bulk/stage | Bulk move |
| GET | /api/pipelines/:id/board | Board payload (columns+cards, filtered) |
| GET | /api/pipelines/:id/forecast | Weighted forecast |
| CRUD | /api/deals/:id/notes, /files | Sub-resources |

## 5. UI
- /pipeline: switcher header, forecast bar, Kanban board (horizontal scroll), list-view toggle, filter bar, Add Deal modal, deal drawer
- /settings/pipelines: pipeline + stage editor with drag-reorder and probability sliders

## 6. Acceptance Criteria
- [ ] Drag persists via PATCH with optimistic UI + rollback on failure
- [ ] Stage change fires M13 trigger payload {deal_id,new_stage_id,contact_id,workspace_id} and writes timeline
- [ ] Lost requires reason; Won logs revenue and date
- [ ] Forecast math = Σ value×probability, verified
- [ ] Board performant at 500 deals (virtualized columns)

## 7. Claude Code Prompt — M11
```
Build Module M11 (Pipeline) per original PRD Section 7 Claude prompt,
with these platform wirings:
- Stage change handler: PATCH /api/deals/:id/stage → prisma update →
  emit to M13 trigger bus → timeline.add(contact) → audit()
- Files tab uses <AssetPicker> from M06 (deal_files stores assetId)
- Forecast endpoint + header progress bar vs PipelineTarget
- DealValueHistory written on value edits
- Permission gates: pipeline.view/create/edit/delete via M02
Include list view, bulk stage move, and stage editor settings page.
```

*Next: M12 — Inbox (Omnichannel)*
