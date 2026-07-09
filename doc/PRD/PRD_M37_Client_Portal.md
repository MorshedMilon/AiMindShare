# PRD — M37: Client Portal
**Layer:** L5 Platform | **Priority:** P2 | **Phase:** 5
**Depends On:** M02 (CLIENT role), M18, M22, M23, M28, M40 | **Blocks:** —

## 1. Purpose
A branded space where the agency's end-clients log in to see their results, approve content, pay invoices, and communicate — reducing "what's happening with my account?" emails to zero.

## 2. Core Features
- **Portal access:** client users = M00 accounts with M02 CLIENT role membership, permission-fenced to portal routes only; invited by workspace admins; optional custom portal URL (portal.agencydomain.com via M42 domain infra) + workspace branding (logo/colors).
- **Client dashboard:** simplified KPIs relevant to the engagement (configurable widget set per workspace): traffic, leads, appointments, reviews avg, rankings movers, published content count — powered by M40 queries with client-safe scoping.
- **Approvals center:** pending items requiring client sign-off — blog drafts (M22 review integration: read view + approve / request-changes with comments), social posts (M23 approval workflow client stage), designs/files (M06 assets shared for approval); email notifications on new items; overdue-approval reminders.
- **Deliverables & tasks:** M18 client-visible tasks list (status, due dates); deliverable files area (assets flagged shared-to-portal); client can comment + mark received.
- **Invoices & payments:** M28 invoices list (view, download PDF, pay via hosted page), payment history, saved payment methods (Stripe customer portal deep link).
- **Reports:** M40 white-label reports published to portal (monthly report archive, view inline).
- **Messaging:** portal thread ↔ M12 conversation (channel type "portal") — clients message the team without email.
- **Notifications:** portal users get scoped M04 notifications (approval requests, new reports, invoice due).
- **Strict isolation:** clients see ONLY explicitly shared/flagged entities; every portal query goes through `requirePortalAccess()` (workspace + CLIENT role + entity-shared check); no CRM, pipeline, or internal data exposure — verified by tests.

## 3. Database Schema (Prisma)
```prisma
model PortalConfig {
  workspaceId String @id
  brandingJson Json; widgetSetJson Json
  customDomain String?; enabled Boolean @default(false)
}
model ApprovalItem {
  id String @id @default(uuid())
  workspaceId String; type String // article|social_post|asset
  refId String; status String @default("pending") // pending|approved|changes_requested
  clientComment String?; decidedBy String?; decidedAt DateTime?
  createdAt DateTime @default(now())
}
model SharedEntity {
  id String @id @default(uuid())
  workspaceId String; entityType String; entityId String
  sharedBy String; createdAt DateTime @default(now())
  @@unique([workspaceId, entityType, entityId])
}
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| GET/PATCH | /api/portal/config | Setup + branding |
| POST | /api/portal/invite | Invite client user (CLIENT role) |
| GET | /api/portal/dashboard | Client-safe KPIs |
| GET | /api/portal/approvals (+POST /:id/decide) | Approval flow |
| GET | /api/portal/tasks (+comment) | M18 client-visible |
| GET | /api/portal/files | Shared assets |
| GET | /api/portal/invoices | M28 scoped list |
| GET | /api/portal/reports | Published reports |
| GET/POST | /api/portal/messages | Portal thread ↔ M12 |
| POST | /api/share | Flag entity shared (internal, from other modules' UIs) |

## 5. UI
- Portal app shell (client-facing, branded): /portal — dashboard, Approvals, Tasks & Deliverables, Files, Invoices, Reports, Messages
- Admin side: /settings/portal (branding, widgets, domain, client users), "Share to portal" buttons sprinkled into M06/M18/M40 UIs, approvals-sent tracking

## 6. Acceptance Criteria
- [ ] CLIENT-role user cannot reach any non-portal route or API (test suite)
- [ ] Article approve → M22 status change; request-changes → editor notified with comment
- [ ] Social approval stage integrates with M23 workflow when client-approval enabled
- [ ] Invoice pay end-to-end from portal
- [ ] Portal messages create/append M12 conversations, agency replies flow back
- [ ] Branding + custom domain render; widget set configurable per workspace

## 7. Claude Code Prompt — M37
```
Build Module M37 (Client Portal). M02/M18/M22/M23/M28/M40/M12 exist.
1. Prisma models per PRD.
2. lib/portal.ts: requirePortalAccess() — session + CLIENT role +
   (for entity routes) SharedEntity or module-flag check. Route group
   /portal with its own layout; middleware hard-blocks CLIENT role
   from all other authed routes.
3. Approval engine: creation hooks from M22 (send-for-client-approval)
   and M23 (client stage) → ApprovalItem; decide endpoint updates
   source module status + notifies.
4. Data surfaces: dashboard queries via M40 with client-safe metric
   allowlist; tasks (clientVisible), files (SharedEntity), invoices
   (contact-company mapping), reports (published flag).
5. Portal messaging: conversation channel 'portal' in M12.
6. Branded shell (PortalConfig branding), /settings/portal admin UI,
   Share-to-portal action components.
7. Isolation test suite: CLIENT hitting 20 internal endpoints → all 403.
```

*Next: M38 — Referral Manager*
