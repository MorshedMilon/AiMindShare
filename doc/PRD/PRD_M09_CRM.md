# PRD — M09: CRM
**Layer:** L1 Core Ops | **Priority:** P0 | **Phase:** 1 (Session 10)
**Depends On:** M01, M02, M04, M07 | **Blocks:** M10–M18, most of platform

## 1. Purpose
The single source of truth: contacts, companies, tags, custom fields, smart lists, notes, tasks, scoring, and the activity timeline every other module writes to.

## 2. Core Features
- **Contacts:** full profile (name, email, phone, address, company, website, socials, birthday, avatar); source + UTM capture on creation; assigned user; lead score badge.
- **Companies:** entity with linked contacts, shared timeline, industry/size fields.
- **Tags:** color-coded, multi-tag, inline create, bulk tag/untag, tag manager page.
- **Custom fields:** unlimited per workspace — text, textarea, number, date, dropdown, checkbox, multi-select, URL, file; render automatically on forms + detail page; Zod validation generated from field defs.
- **Smart lists:** visual AND/OR group builder over fields/tags/score/dates/source; saved named lists in sidebar; auto-updating membership; usable as audience anywhere (M13, M16).
- **Activity timeline:** unified event stream — `timeline.add(contactId, type, description, metadata)` public helper; event types: email, sms, call, form, page_visit, note, task, deal_change, appointment, payment, review, custom. Icons per type, infinite scroll, filter by type.
- **Notes & tasks:** notes with @mentions (→ M04 `mention` notification); tasks with assignee, due date, status; My Tasks view.
- **Lead scoring:** rules engine in settings (event type → points, optional decay); background recalculation on activity; cold/warm/hot bands (0–30/31–60/61+).
- **Duplicate detection:** exact + fuzzy match on email/phone; merge wizard (field-level pick, relations reassigned); flag queue.
- **Import/export:** 3-step CSV wizard (upload → column map → preview/import with progress + error report); consent attestation checkbox (M05); filtered export CSV (permission `crm.export`).
- **Bulk actions:** tag, assign, add-to-campaign, delete (with confirm), export on multi-select.
- **List page:** TanStack Table, server pagination (50/pg), search (name/email/phone), filter panel, column chooser, saved views.

## 3. Database Schema
Uses original PRD Section 6 tables, Prisma-ized: `Contact, Company, Tag, ContactTag, CustomField, ContactCustomValue, ContactNote, ContactTask, ActivityLog` — all with `workspaceId`, indexed on `(workspaceId, email)`, `(workspaceId, updatedAt)`. Add: `SmartList { id, workspaceId, name, conditionsJson, createdAt }`, `ScoringRule { id, workspaceId, eventType, points, isActive }`.

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| CRUD | /api/contacts | List (filters/search/pagination), create, get, update, delete |
| POST | /api/contacts/bulk | Bulk actions |
| POST | /api/contacts/import | CSV import (job) + /import/:jobId status |
| GET | /api/contacts/export | CSV (permission-gated) |
| POST | /api/contacts/:id/merge | Merge duplicates |
| GET | /api/contacts/duplicates | Flagged duplicate pairs |
| CRUD | /api/companies, /api/tags, /api/custom-fields, /api/smart-lists | Entities |
| GET | /api/smart-lists/:id/members | Evaluated membership |
| CRUD | /api/contacts/:id/notes, /api/contacts/:id/tasks | Notes/tasks |
| GET | /api/contacts/:id/timeline | Paginated timeline |
| CRUD | /api/scoring-rules | Scoring config |

## 5. UI
| Route | Page |
|---|---|
| /contacts | List (table, filters, bulk bar, New Contact drawer) |
| /contacts/[id] | Detail: header (avatar/score/tags/assignee) + tabs Overview / Activity / Notes / Tasks / Emails / Deals |
| /companies, /companies/[id] | Company list + detail with linked contacts |
| /tasks | My Tasks across contacts |
| /settings/fields, /settings/tags, /settings/scoring | Config pages |

## 6. Acceptance Criteria
- [ ] timeline.add() exported — the platform-wide activity API
- [ ] Smart list conditions evaluate correctly incl. nested AND/OR + custom fields
- [ ] Import handles 10k rows with progress + row-level error report
- [ ] Merge reassigns all relations (notes, tasks, deals, conversations, timeline)
- [ ] Score recalculates on new activity within 1 min (BullMQ)
- [ ] All queries workspace-scoped; STAFF cannot delete/export (M02 test)

## 7. Claude Code Prompt — M09
```
Build Module M09 (CRM) exactly per the original PRD Section 6 spec plus
this PRD's additions (smart lists, scoring engine, merge wizard,
timeline.add helper). Foundation M00–M07 + M41 exist.
Key deliverables beyond CRUD:
- lib/timeline.ts: add() writing ActivityLog + Pusher event
- Smart list evaluator: conditionsJson → Prisma where builder (recursive
  AND/OR groups), covering custom field values
- CSV import BullMQ job with chunked processing + error report file
- Scoring worker triggered by ActivityLog inserts
- Merge transaction reassigning all FK relations
- Duplicate detector job (email exact, phone normalized)
UI per PRD Section 6 Claude prompt (list, detail tabs, field settings,
smart list builder, import wizard).
```

*Next: M10 — Lead Enrichment & Intent Engine*
