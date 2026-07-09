# PRD — M07: Audit Logs & Platform Settings
**Layer:** L0 Foundation | **Priority:** P1 | **Phase:** 1 (Session 8)
**Depends On:** M00–M02 | **Blocks:** — (consumed by all)

## 1. Purpose
Immutable who-did-what trail across the platform, plus the shared workspace settings shell that other modules hang their settings pages on.

## 2. Core Features
### Audit Log
- **Emit API:** `audit(workspaceId, userId, action, entityType, entityId, before?, after?)` — called by all modules on create/update/delete of significant entities.
- **Action taxonomy:** `{module}.{entity}.{verb}` e.g. `crm.contact.deleted`, `automations.workflow.updated`, `billing.plan.changed`, `team.member.role_changed`, `auth.login_failed` (ingested from M00 auth_events).
- **Viewer:** filterable table (user, module, action, entity, date range), diff view (before/after JSON pretty-diff), export CSV; retention 12 months (configurable per plan).
- **Immutability:** append-only; no update/delete endpoints; admin hard-purge only via M44 with its own audit entry.

### Settings Shell
- **Settings layout:** left-nav settings area (`/settings/*`) with sections registered by modules (registry pattern like permissions).
- **Core pages owned here:** Workspace general (proxy to M01), Localization (timezone/currency/locale/date format), Data export (full workspace export request → BullMQ ZIP job), API of record for `workspace.settingsJson` reads/writes with Zod-validated namespaced keys (`settings.get(ws, 'inbox.autoReply')`).

## 3. Database Schema (Prisma)
```prisma
model AuditLog {
  id String @id @default(uuid())
  workspaceId String
  userId String?
  action String
  entityType String; entityId String?
  before Json?; after Json?
  ipAddress String?
  createdAt DateTime @default(now())
  @@index([workspaceId, createdAt])
  @@index([workspaceId, entityType, entityId])
}
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/audit | Filtered, paginated log |
| GET | /api/audit/export | CSV export |
| GET | /api/audit/entity/:type/:id | History for one record |
| POST | /api/settings/export-data | Request full workspace export ZIP |
| GET/PATCH | /api/settings/:namespace | Namespaced settings read/write |

## 5. UI
- /settings/audit-log: table + filters + diff modal
- /settings/localization
- /settings/data: export request + download history
- Settings left-nav shell component consumed by all modules

## 6. Acceptance Criteria
- [ ] audit() helper exported; append-only enforced (no mutation routes)
- [ ] Diff view renders before/after cleanly
- [ ] Entity history reachable from record pages (link pattern documented)
- [ ] Full-workspace export ZIP job produces all module data (extensible manifest)
- [ ] Settings registry pattern documented

## 7. Claude Code Prompt — M07
```
Build Module M07 (Audit Logs & Settings). M00–M02 exist.
1. Prisma AuditLog model; lib/audit.ts emit helper (async, non-blocking).
2. /settings shell layout: left nav from a settingsSections.ts registry.
3. Audit viewer page with filters, pagination, JSON diff modal
   (use a diff lib), CSV export.
4. lib/settings.ts: namespaced get/set on workspace.settingsJson with
   Zod schemas per namespace.
5. Data export BullMQ job: walk registered exporters (start with users,
   workspace, audit), ZIP to R2, notify via M04.
6. Wire M00 auth_events → nightly ingest into AuditLog.
```

*Next: M41 — Integrations Hub & Open API (built early: credential vault)*
