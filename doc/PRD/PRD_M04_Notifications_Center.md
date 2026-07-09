# PRD — M04: Notifications Center
**Layer:** L0 Foundation | **Priority:** P0 | **Phase:** 1 (Session 5)
**Depends On:** M00–M02 | **Blocks:** Any module that alerts users

## 1. Purpose
One notification pipeline for the whole platform: in-app feed, email, and (later) mobile push. Modules emit typed events; users control what they receive and how.

## 2. Core Features
- **Emit API:** `notify(workspaceId, userIds|role, type, payload)` — single entry point for all modules.
- **Channels:** in-app (bell feed, realtime via Pusher), email (batched or instant per type), push (stub now, wired in M43).
- **Notification types registry:** `notificationTypes.ts` — each type declares default channels, title/body template, deep link. Seed types: `contact.assigned`, `deal.stage_changed`, `deal.won`, `inbox.new_message`, `appointment.booked`, `appointment.cancelled`, `form.submitted`, `campaign.finished`, `automation.failed`, `review.new`, `payment.received`, `payment.failed`, `usage.limit_warning`, `rank.change_major`, `article.awaiting_review`, `mention` (@mentions in notes).
- **Preferences:** per-user, per-type channel toggles; workspace-level defaults; mute all (per workspace); daily digest option (BullMQ 8am local-time job groups un-read items).
- **In-app feed:** bell icon with unread badge; dropdown showing latest 20; full page with filters (type, read/unread); mark read/all read; click → deep link.
- **Delivery rules:** dedupe identical notifications within 5 minutes; respect quiet hours (user setting); email batching for high-volume types (e.g. inbox messages batch every 15 min if unread).

## 3. Database Schema (Prisma)
```prisma
model Notification {
  id String @id @default(uuid())
  workspaceId String
  userId String
  type String
  title String
  body String?
  deepLink String?
  payload Json?
  readAt DateTime?
  emailedAt DateTime?
  createdAt DateTime @default(now())
  @@index([userId, readAt])
}
model NotificationPreference {
  id String @id @default(uuid())
  userId String; workspaceId String
  type String
  inApp Boolean @default(true)
  email Boolean @default(true)
  push Boolean @default(false)
  @@unique([userId, workspaceId, type])
}
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/notifications | Paginated feed (filters: unread, type) |
| PATCH | /api/notifications/:id/read | Mark read |
| POST | /api/notifications/read-all | Mark all read |
| GET/PATCH | /api/notifications/preferences | Get/update per-type prefs |
| (internal) | lib/notify.ts | notify() used by all modules |

## 5. UI
- Bell icon in top nav (unread count badge, Pusher live update)
- Dropdown: latest 20, grouped Today/Earlier
- /notifications full page with filters
- /settings/notifications: type × channel toggle matrix, quiet hours, digest toggle

## 6. Acceptance Criteria
- [ ] notify() helper handles user list or role targets; respects preferences
- [ ] Realtime bell update via Pusher within 1s
- [ ] Email batching + dedupe verified
- [ ] Digest job groups and sends at workspace-local 8am
- [ ] Type registry documented for future modules to append

## 7. Claude Code Prompt — M04
```
Build Module M04 (Notifications). M00–M03 exist. Pusher + Resend available.
1. notificationTypes.ts registry (16 seed types per PRD).
2. Prisma models. lib/notify.ts: resolves targets (userIds or role→members),
   checks NotificationPreference, writes Notification rows, triggers Pusher
   event `ws-{workspaceId}-user-{userId}`, queues email (instant or batched
   per type config) via BullMQ.
3. Batching worker (15-min) + daily digest worker (8am workspace tz).
4. UI: nav bell + dropdown, /notifications page, /settings/notifications matrix.
5. Dedupe: skip identical (userId+type+deepLink) within 5 min.
```

*Next: M05 — Compliance & Consent Center*
