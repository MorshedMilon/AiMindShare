# PRD — M01: Workspaces & Multi-Tenancy
**Layer:** L0 Foundation | **Priority:** P0 | **Phase:** 1 (Session 2)
**Depends On:** M00 | **Blocks:** Every data module (all tables carry workspace_id)

## 1. Purpose
Implement the Agency → Sub-Account (Workspace) → User hierarchy with absolute data isolation. This module defines the `workspace_id` scoping pattern that every other module copies. Get this wrong and the entire platform leaks data between clients.

## 2. Goals & Non-Goals
**Goals:** Agency accounts; unlimited workspaces per agency; workspace membership; workspace switching; provisioning defaults; isolation middleware; ownership transfer; workspace soft-delete/archive.
**Non-Goals:** Roles/permissions detail (M02), plan limits enforcement (M03), white-label branding (M42), client portal access (M37).

## 3. Core Features
- **Agency account:** created automatically on first signup; owner = signing-up user. Agency holds billing (M03) and all workspaces.
- **Workspace CRUD:** create (name, niche, timezone, currency, locale), rename, archive (soft delete, 90-day retention), restore, hard-delete (M44 admin only).
- **Provisioning:** new workspace auto-seeds: default pipeline ("Sales" with 5 stages), default calendar, 5 starter tags, default email sender identity placeholder, notification prefs.
- **Membership:** users belong to N workspaces via `workspace_users`; invitation flow (email → M00 accept → membership row); remove member; leave workspace (blocked for sole owner).
- **Workspace switcher:** dropdown in top nav; active workspace stored in a signed cookie `active_workspace_id`; switching revalidates membership server-side.
- **Isolation middleware:** `requireWorkspace()` helper — resolves session (M00) + active workspace + verifies membership; injects `{ userId, workspaceId, role }` into every handler. **Every Prisma query in every module must filter by this workspaceId.**
- **Ownership transfer:** owner can transfer to another member (confirmation + email notice).
- **Workspace settings page:** general info, timezone/currency/locale, danger zone (archive/transfer).
- **Agency dashboard stub:** list of all workspaces with member count, created date (expanded by M42).

## 4. Database Schema (Prisma)
```prisma
model Agency {
  id        String   @id @default(uuid())
  name      String
  ownerId   String   // User.id
  createdAt DateTime @default(now())
  workspaces Workspace[]
}
model Workspace {
  id        String   @id @default(uuid())
  agencyId  String
  name      String
  slug      String   @unique
  niche     String?
  timezone  String   @default("America/Toronto")
  currency  String   @default("USD")
  locale    String   @default("en")
  status    WsStatus @default(ACTIVE) // ACTIVE | ARCHIVED
  settingsJson Json  @default("{}")
  createdAt DateTime @default(now())
  archivedAt DateTime?
  agency    Agency   @relation(fields: [agencyId], references: [id])
  members   WorkspaceUser[]
}
model WorkspaceUser {
  id          String   @id @default(uuid())
  workspaceId String
  userId      String
  role        String   // consumed/enforced by M02: OWNER|ADMIN|MANAGER|STAFF
  invitedBy   String?
  joinedAt    DateTime @default(now())
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  @@unique([workspaceId, userId])
}
model WorkspaceInvitation {
  id          String   @id @default(uuid())
  workspaceId String
  email       String
  role        String
  tokenHash   String   @unique
  invitedBy   String
  expiresAt   DateTime // 7 days
  acceptedAt  DateTime?
  createdAt   DateTime @default(now())
}
enum WsStatus { ACTIVE ARCHIVED }
```

## 5. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/workspaces | Create workspace (+ provisioning job) |
| GET | /api/workspaces | List my workspaces |
| GET | /api/workspaces/:id | Workspace detail (member check) |
| PATCH | /api/workspaces/:id | Update settings |
| POST | /api/workspaces/:id/archive | Archive |
| POST | /api/workspaces/:id/restore | Restore |
| POST | /api/workspaces/:id/switch | Set active workspace cookie |
| POST | /api/workspaces/:id/invitations | Invite member (email + role) |
| GET | /api/workspaces/:id/members | List members |
| DELETE | /api/workspaces/:id/members/:userId | Remove member |
| POST | /api/workspaces/:id/transfer | Transfer ownership |
| POST | /api/invitations/:token/accept | Accept (via M00 flow) |

## 6. UI
| Route | Page |
|---|---|
| /workspaces | Workspace list grid (agency view) + "New Workspace" modal |
| /settings/workspace | General settings + danger zone |
| /settings/team | Members table, invite modal, pending invitations list |
| (top nav) | Workspace switcher dropdown with search |

## 7. Acceptance Criteria
- [ ] `requireWorkspace()` exported; returns 403 on non-membership; documented for all future modules
- [ ] New workspace provisions defaults via BullMQ job
- [ ] Invitation flow works for both existing and new users (via M00)
- [ ] Switching workspaces re-scopes all data instantly; cookie tamper returns 403
- [ ] Sole owner cannot leave/delete without transfer
- [ ] Archived workspaces hidden from switcher, restorable for 90 days
- [ ] Cross-workspace access attempt (manipulated IDs) always 403 — integration test required

## 8. Claude Code Prompt — M01
```
Build Module M01 (Workspaces & Multi-Tenancy). M00 auth exists with requireUser().
Stack: Next.js 15, Prisma, PostgreSQL, BullMQ, shadcn/ui.

1. Prisma models: Agency, Workspace, WorkspaceUser, WorkspaceInvitation (per PRD). Migrate.
2. lib/workspace.ts: requireWorkspace(req) → verifies session via requireUser(),
   reads active_workspace_id signed cookie, verifies WorkspaceUser membership,
   returns { userId, workspaceId, role }. Throws 403 otherwise.
   THIS HELPER IS THE ISOLATION BOUNDARY FOR THE ENTIRE PLATFORM.
3. All 12 API endpoints per PRD, Zod-validated, { success, data, error } format.
4. Provisioning BullMQ job: seeds default pipeline+stages, calendar, 5 tags.
5. UI: /workspaces grid, /settings/workspace, /settings/team, nav switcher.
6. Integration tests: cross-workspace access attempts must 403.
Auto-create Agency + first Workspace on first login after signup.
```

*Next: M02 — Roles & Permissions*
