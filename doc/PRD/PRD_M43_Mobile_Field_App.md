# PRD — M43: Mobile Field App ⭐
**Layer:** L5 Platform | **Priority:** P3 | **Phase:** 8
**Depends On:** M09, M11, M12, M14, M28 | **Blocks:** —

## 1. Purpose
A field-optimized mobile app (Capacitor wrapper + mobile-first PWA) for service businesses on the move — capture leads at the door, scan business cards, take payments on-site, and log everything offline-first.

## 2. Core Features
- **Mobile shell:** Capacitor app (iOS/Android) wrapping mobile-optimized routes; push notifications (M04 push channel finally wired: FCM/APNs); biometric unlock; white-label build config (M42 branding → app name/icon per agency, delivered as PWA-install first, store builds later).
- **Field lead capture:** quick-add contact (minimal form, voice dictation), **business card scanner** (camera → GPT-4o vision → parsed name/company/phone/email → confirm → M09 contact with photo attached), geolocation stamp on capture, instant tag/assign/follow-up-task.
- **Offline-first:** local queue (IndexedDB) for contacts, notes, photos, check-ins created offline → background sync with conflict handling (server wins on edit conflicts, queued creates always apply); offline indicator + pending-sync count.
- **Day view:** today's appointments (M14) with map links + one-tap navigate, call, SMS; check-in/check-out per appointment (timestamps + geostamp → timeline); **route planner** (order today's stops optimally — simple nearest-neighbor + maps deep-link).
- **On-site tools:** photo capture to deal/contact (M06, auto-compressed, annotate-lite), **voice notes** (record → Whisper transcription → contact note), quote-on-the-spot (simple M17-lite: pick template, fill amounts, send for signature), **Tap to Pay** (Stripe Terminal SDK — iPhone/Android tap-to-pay for M28 invoices/payment links).
- **Mobile inbox (lite):** M12 conversations — read/reply SMS + chat, push on new inbound.
- **Pipeline (lite):** swipeable deal cards by stage; quick stage move.

## 3. Database Schema (Prisma)
```prisma
model MobileDevice {
  id String @id @default(uuid())
  userId String; workspaceId String
  platform String; pushToken String?
  lastSeenAt DateTime?; appVersion String?
}
model FieldCheckin {
  id String @id @default(uuid())
  workspaceId String; userId String
  appointmentId String?; contactId String?
  type String // checkin|checkout
  lat Float?; lng Float?
  createdAt DateTime @default(now())
}
model SyncQueueLog { id String @id @default(uuid()); deviceId String; batchJson Json; status String; processedAt DateTime? }
```
(Card scans, photos, voice notes reuse M09/M06 models.)

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/mobile/devices/register | Push token + device |
| POST | /api/mobile/sync | Offline batch upsert (idempotency keys) |
| POST | /api/mobile/card-scan | Image → parsed contact fields (GPT-4o vision) |
| POST | /api/mobile/voice-note | Audio → Whisper → note |
| GET | /api/mobile/day | Today bundle (appointments, tasks, route) |
| POST | /api/mobile/checkin | Check-in/out with geo |
| POST | /api/mobile/route | Stop ordering |
| POST | /api/mobile/tap-to-pay/intent | Stripe Terminal payment intent |

## 5. UI (mobile routes /m/*)
- /m/home: day view (appointments timeline, route button, pending sync badge)
- /m/capture: quick-add + card scan camera flow + voice note
- /m/inbox, /m/pipeline: lite views
- /m/contact/[id]: profile + timeline + actions (call/SMS/photo/quote/pay)
- Capacitor config + push handlers + biometric gate

## 6. Acceptance Criteria
- [ ] Card scan parses standard business cards ≥90% field accuracy; confirm-edit step always shown
- [ ] Airplane-mode test: create 3 contacts + 2 notes + photos offline → all sync on reconnect, no dupes (idempotency keys)
- [ ] Push notification received on new inbox message (device test)
- [ ] Tap to Pay completes a live test payment (Stripe Terminal test mode)
- [ ] Check-in geostamps appear on contact timeline
- [ ] White-label branding applies from M42 config

## 7. Claude Code Prompt — M43
```
Build Module M43 (Mobile Field App). Core modules exist.
1. Mobile route group /m/* with mobile-first layouts (large touch
   targets, bottom nav). Capacitor project config (iOS/Android),
   push (FCM/APNs) wired to M04 push channel, biometric plugin gate.
2. Offline layer: IndexedDB queue (idb) with idempotencyKey per op;
   sync endpoint applying batches transactionally; conflict policy
   (server-wins edits, always-apply creates); UI sync indicator.
3. Card scanner: camera capture → /card-scan (GPT-4o vision prompt →
   structured fields JSON) → confirm screen → contact create with
   photo (M06). Voice notes via MediaRecorder → Whisper → note.
4. Day view + route planner (nearest-neighbor ordering, maps deep
   links) + check-in/out with geolocation → timeline.
5. Tap to Pay: Stripe Terminal SDK integration on M28 connected
   account; fallback QR/payment-link flow.
6. Lite inbox + pipeline views on existing APIs.
```

*Next: M44 — Admin & Platform Ops*
