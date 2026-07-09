# PRD — M05: Compliance & Consent Center ⭐
**Layer:** L0 Foundation | **Priority:** P0 | **Phase:** 1 (Session 6)
**Depends On:** M01, M04, M41 (Twilio) | **Blocks:** M12 SMS, M16 campaigns, M34 voice

## 1. Purpose
Keep every workspace legally operational: A2P 10DLC registration (the #1 blocker for SMS in US/CA), consent record-keeping, GDPR/CCPA data-subject requests, and cookie consent for built sites. Unglamorous, but without it SMS features are dead on arrival.

## 2. Core Features
### A2P 10DLC Registration Workflow
- Guided wizard per workspace: business info → brand registration (Twilio TrustHub API) → campaign use-case registration → status tracking (pending/approved/rejected with reasons).
- Status gate: `sms.canSend(workspaceId)` — M12/M16/M34 must check before any SMS; unregistered workspaces see the wizard, not a cryptic Twilio error.
- Rejection handling: show Twilio rejection reason + fix checklist; resubmit flow.

### Consent Records
- Universal consent ledger: every opt-in/opt-out (SMS, email, WhatsApp, voice) recorded with source (form ID, keyword reply, import attestation, manual), timestamp, IP, exact consent text shown.
- STOP/START/HELP keyword auto-handling on inbound SMS (Twilio webhook → update consent → confirmation reply). Unsubscribe link handling for email (works with M16).
- `consent.check(contactId, channel)` helper — messaging modules must call before sending; hard-block on opted-out.
- CSV import attestation: importer must check "I have consent for these contacts" (logged).

### GDPR / CCPA Data-Subject Requests
- Request intake: public per-workspace form (`/privacy/{slug}/request`) + manual creation.
- Types: ACCESS (compile ZIP of all contact data across modules), DELETE (right-to-be-forgotten: anonymize contact + cascade through messages, deals, activities — keep financial records as legally required), RECTIFY.
- 30-day SLA tracking with reminders (M04); completion audit trail.

### Cookie Consent (for M19 sites)
- Injectable consent banner script for all published sites: Accept all / Necessary only / Preferences; blocks analytics/pixel scripts until consent; per-site customization (colors, text, position); consent logs per visitor (anonymized ID).

## 3. Database Schema (Prisma)
```prisma
model A2pRegistration {
  workspaceId String @id
  brandStatus String @default("not_started") // not_started|pending|approved|rejected
  campaignStatus String @default("not_started")
  twilioBrandSid String?; twilioCampaignSid String?
  rejectionReason String?
  businessInfoJson Json?
  updatedAt DateTime @updatedAt
}
model ConsentRecord {
  id String @id @default(uuid())
  workspaceId String; contactId String
  channel String // sms|email|whatsapp|voice
  status String // opted_in|opted_out
  source String // form:{id}|keyword|import|manual|unsub_link
  consentText String?
  ipAddress String?
  createdAt DateTime @default(now())
  @@index([contactId, channel])
}
model DataRequest {
  id String @id @default(uuid())
  workspaceId String; contactId String?
  email String; type String // access|delete|rectify
  status String @default("open") // open|in_progress|completed
  dueAt DateTime; completedAt DateTime?
  exportUrl String?; notes String?
  createdAt DateTime @default(now())
}
model CookieConsentLog {
  id String @id @default(uuid())
  siteId String; visitorId String
  choices Json; createdAt DateTime @default(now())
}
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| GET/POST | /api/compliance/a2p | Status / start-continue registration wizard |
| POST | /api/compliance/a2p/webhook | Twilio status callbacks |
| GET | /api/compliance/consent/:contactId | Consent state per channel |
| POST | /api/compliance/consent | Record opt-in/out (internal + manual) |
| POST | /api/compliance/sms-keywords | Twilio inbound webhook (STOP/START/HELP) |
| GET/POST | /api/compliance/data-requests | List / create requests |
| POST | /api/compliance/data-requests/:id/execute | Run access-export or deletion job |
| GET | /api/compliance/cookie-script/:siteId | Serve banner JS |

## 5. UI
- /settings/compliance: A2P wizard (stepper), consent overview stats, data requests table with SLA countdown, cookie banner customizer per site
- Contact detail (M09) gets a Consent card: per-channel status + history

## 6. Acceptance Criteria
- [ ] A2P wizard completes against Twilio TrustHub sandbox; status gate blocks SMS pre-approval
- [ ] STOP reply opts contact out within seconds; further sends blocked by consent.check()
- [ ] ACCESS request produces complete ZIP; DELETE anonymizes across all modules (cascade documented)
- [ ] Cookie banner blocks analytics scripts until acceptance
- [ ] consent.check() + sms.canSend() exported and documented as mandatory pre-send checks

## 7. Claude Code Prompt — M05
```
Build Module M05 (Compliance & Consent). M01–M04 exist. Twilio creds via M41.
1. Prisma models per PRD.
2. A2P: wizard UI (multi-step form) + Twilio TrustHub API integration
   (brand + campaign registration) + status webhook.
3. lib/consent.ts: check(contactId, channel) and record(); 
   lib/sms.ts: canSend(workspaceId) checking A2P status.
4. Twilio inbound keyword webhook: STOP/START/HELP handling with
   auto-replies and ConsentRecord writes.
5. Data request engine: BullMQ jobs for access-export (query every module's
   tables for contactId, build ZIP to R2) and deletion (anonymize cascade).
6. Cookie banner: vanilla JS script served per site, choice persistence,
   script-blocking until consent, POST logs.
7. UI: /settings/compliance per PRD.
```

*Next: M06 — Media Library & Asset Manager*
