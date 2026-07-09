# PRD — M02: Roles & Permissions
**Layer:** L0 Foundation | **Priority:** P0 | **Phase:** 1 (Session 3)
**Depends On:** M00, M01 | **Blocks:** All modules with restricted actions

## 1. Purpose
Role-based access control (RBAC) at workspace level with per-module permission granularity. Defines who can view/create/edit/delete in each module, enforced in one shared middleware layer.

## 2. Goals & Non-Goals
**Goals:** 5 built-in roles; per-module permission matrix; custom roles; permission middleware `requirePermission()`; UI gating helper; invitation role assignment.
**Non-Goals:** Client portal roles (M37 defines CLIENT role using this system), plan-based feature gating (M03), record-level ownership rules (each module defines "assigned to me" filters itself).

## 3. Core Features
- **Built-in roles:** OWNER (everything, immutable), ADMIN (everything except billing + workspace deletion), MANAGER (full module access, no settings/team), STAFF (assigned-records focus, no delete/export), CLIENT (portal-only, defined here, used by M37).
- **Permission model:** `module.action` strings — e.g. `crm.view`, `crm.create`, `crm.edit`, `crm.delete`, `crm.export`, `pipeline.view`, `campaigns.send`, `billing.manage`, `team.manage`, `settings.manage`, `automations.manage`, `reports.view` ... (~60 permissions across all modules; registry file `permissions.ts` is the single source of truth, modules append to it as they're built).
- **Custom roles:** clone a built-in role → toggle permissions via checkbox matrix → save as named workspace role.
- **Enforcement:** `requirePermission(perm)` wraps `requireWorkspace()`; returns 403 with `{ error: "permission_denied", required: perm }`.
- **Frontend gating:** `useCan(perm)` hook + `<Can perm="crm.delete">` component to hide/disable UI.
- **Role change auditing:** all role/permission changes → M07 audit log.

## 4. Database Schema (Prisma)
```prisma
model Role {
  id          String  @id @default(uuid())
  workspaceId String? // null = built-in global role
  name        String
  isBuiltIn   Boolean @default(false)
  permissions String[] // ["crm.view","crm.create",...]
  createdAt   DateTime @default(now())
}
// WorkspaceUser.role (M01) becomes roleId FK in migration
```

## 5. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/roles | List built-in + workspace custom roles |
| POST | /api/roles | Create custom role |
| PATCH | /api/roles/:id | Update permissions (custom only) |
| DELETE | /api/roles/:id | Delete custom role (reassign members first) |
| PATCH | /api/members/:userId/role | Change a member's role |
| GET | /api/permissions | Full permission registry (for matrix UI) |

## 6. UI
| Route | Page |
|---|---|
| /settings/roles | Roles list; permission matrix editor (modules as rows, actions as columns, checkboxes) |
| /settings/team | Role dropdown per member (extends M01 page) |

## 7. Acceptance Criteria
- [ ] 5 built-in roles seeded globally; OWNER/ADMIN not editable
- [ ] `requirePermission()` + `useCan()` + `<Can>` exported and documented
- [ ] Custom role create/edit/delete works; deleting requires member reassignment
- [ ] STAFF user verified blocked from delete/export endpoints (test)
- [ ] Permission registry pattern documented so future modules self-register

## 8. Claude Code Prompt — M02
```
Build Module M02 (Roles & Permissions). M00 + M01 exist.
1. permissions.ts registry: export const PERMISSIONS grouped by module.
   Seed with crm.*, pipeline.*, inbox.*, automations.*, calendar.*,
   forms.*, campaigns.*, billing.*, team.*, settings.*, reports.*.
2. Prisma Role model; migrate WorkspaceUser.role → roleId FK.
   Seed 5 built-in roles with correct permission arrays.
3. lib/permissions.ts: requirePermission(perm) building on requireWorkspace().
4. React: useCan(perm) hook reading role permissions from session context;
   <Can perm=""> wrapper component.
5. API endpoints per PRD. UI: /settings/roles with checkbox matrix editor.
6. Tests: STAFF blocked from crm.delete; custom role toggling works.
```

*Next: M03 — Billing, Plans & Usage Metering*
