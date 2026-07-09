# PRD — M18: Projects & Team Ops ⭐
**Layer:** L1 Core Ops | **Priority:** P2 | **Phase:** 5
**Depends On:** M09, M11, M13, M37 (task sync) | **Blocks:** —

## 1. Purpose
Internal work management for the agency team — projects, tasks, time tracking, capacity — closing the gap between "deal won" and "delivered." Replaces Trello/ClickUp for agency users.

## 2. Core Features
- **Projects:** linked to contact/company/deal; status (planning/active/on-hold/done); start/due dates; description; project templates per service type (SEO retainer, website build, ad management) with pre-loaded task lists + relative due offsets.
- **Tasks:** board (Kanban by status: Backlog/To Do/In Progress/Review/Done) + list + calendar views; assignee, due date, priority, labels, checklists, attachments (M06), comments with @mentions (M04), subtasks; recurring tasks.
- **Deal→project automation:** M13 action "Create project from template" — deal won → project spun up with tasks assigned.
- **Time tracking:** start/stop timer or manual entry per task; billable flag + rate; timesheet view (per user, per project, date range); export CSV; optional pass-through to M28 invoice line items ("bill unbilled time").
- **Capacity view:** per-user week grid of assigned task hours vs capacity setting; overload highlighting; drag tasks between users.
- **Client-visible tasks:** flag tasks as client-visible → they appear in M37 portal task list; client completion/comments sync back.
- **My Work:** cross-project personal view (due today/this week/overdue).
- **Notifications:** assignment, due-soon (24h), overdue, comment mentions.

## 3. Database Schema (Prisma)
```prisma
model Project {
  id String @id @default(uuid())
  workspaceId String; name String
  contactId String?; companyId String?; dealId String?
  status String @default("planning")
  startDate DateTime?; dueDate DateTime?
  templateId String?; createdAt DateTime @default(now())
}
model ProjectTask {
  id String @id @default(uuid())
  workspaceId String; projectId String
  title String; description String?
  status String @default("todo"); priority String @default("normal")
  assigneeId String?; dueDate DateTime?
  labels String[]; parentTaskId String?
  clientVisible Boolean @default(false)
  estimateHours Float?
  orderIndex Int; createdAt DateTime @default(now())
}
model TaskComment { id String @id @default(uuid()); taskId String; userId String; content String; createdAt DateTime @default(now()) }
model TimeEntry {
  id String @id @default(uuid())
  workspaceId String; taskId String; userId String
  startedAt DateTime; endedAt DateTime?; durationMin Int?
  billable Boolean @default(true); rate Int?
  invoicedInvoiceId String?
  note String?
}
model ProjectTemplate { id String @id @default(uuid()); workspaceId String?; name String; tasksJson Json }
model UserCapacity { userId String; workspaceId String; weeklyHours Int @default(40); @@id([userId, workspaceId]) }
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| CRUD | /api/projects (+templates) | Manage |
| POST | /api/projects/from-template | Instantiate (also M13 action handler) |
| CRUD | /api/projects/:id/tasks (+comments) | Tasks |
| PATCH | /api/tasks/:id/move | Status/order (board dnd) |
| POST | /api/tasks/:id/timer/start \| /stop | Timer |
| CRUD | /api/time-entries | Manual entries |
| GET | /api/timesheets?user=&range= | Timesheet + CSV |
| POST | /api/projects/:id/bill-time | Unbilled time → M28 invoice draft |
| GET | /api/capacity?week= | Team capacity grid |

## 5. UI
- /projects: list with progress bars (done/total tasks)
- /projects/[id]: board/list/calendar tabs, task drawer (details, checklist, comments, timer, time log)
- /my-work: personal queue
- /timesheets, /capacity: management views
- /settings/project-templates: template task editor

## 6. Acceptance Criteria
- [ ] Template instantiation sets relative due dates from project start
- [ ] Deal-won automation creates assigned project (M13 handler registered)
- [ ] Timer prevents concurrent running timers per user
- [ ] Bill-time creates accurate M28 draft and marks entries invoiced
- [ ] Client-visible tasks appear in portal; client actions sync (interface stubbed until M37)
- [ ] Capacity math = Σ estimateHours of open tasks in week

## 7. Claude Code Prompt — M18
```
Build Module M18 (Projects & Team Ops). M09/M11/M13/M28/M06 exist.
1. Prisma models per PRD.
2. Board UI: @hello-pangea/dnd columns by status, task drawer with
   comments (@mention → notify), checklist, attachments (AssetPicker),
   timer widget.
3. Template engine: tasksJson [{title, offsetDays, estimate, role}] →
   instantiate with assignee resolution (role → member mapping prompt).
4. Register M13 action handler 'create_project_from_template'.
5. Time tracking: single-active-timer enforcement; timesheet
   aggregation queries; bill-time service composing M28 invoice lines
   (task title × hours × rate).
6. Capacity grid: week columns × user rows, drag-to-reassign.
7. Due-soon/overdue notification jobs.
```

*Next: M19 — Sites (AI Website Builder)*
