# PRD — M15: Forms & Surveys
**Layer:** L1 Core Ops | **Priority:** P0 | **Phase:** 2 (Session 17)
**Depends On:** M09, M13, M05 | **Blocks:** M19 form elements, M16 audiences

## 1. Purpose
The acquisition layer: every form, survey, quiz, and popup that turns visitors into contacts — with conditional logic, routing, and consent capture built in.

## 2. Core Features
- **Builder:** drag-drop field list — text, email, phone, textarea, number, date, dropdown, radio, checkbox, multi-select, file upload (M06), rating, hidden (UTM capture), heading/paragraph, consent checkbox (wired to M05 with stored consent text); required flags, placeholder, validation (Zod generated); map fields → contact fields/custom fields.
- **Types:** standard form; multi-step (progress bar, per-step validation); survey (no contact requirement option, anonymous mode); scored quiz (points per answer → result tiers with per-tier redirect/message — lead-magnet pattern).
- **Conditional logic:** show/hide fields and steps based on prior answers.
- **Popups & embeds:** inline embed script, iframe, popup (trigger: delay / scroll % / exit intent), slide-in; frequency capping per visitor.
- **Submission handling:** create-or-update contact (email/phone match) + source/UTM tags + `form.submitted` trigger (M13) + `timeline.add()` + notification (M04); spam protection (honeypot + time-trap + optional Turnstile); double opt-in option (confirm email before consent recorded).
- **Routing rules:** per-form — assign owner (round-robin option), add tags, add to pipeline as deal (value field mapping), redirect URL / thank-you message.
- **Analytics:** views, starts, completions, completion rate, per-field drop-off (multi-step), submissions over time.
- **A/B forms:** two variants, traffic split, conversion comparison.

## 3. Database Schema (Prisma)
```prisma
model Form {
  id String @id @default(uuid())
  workspaceId String; name String; type String // form|survey|quiz
  fieldsJson Json; logicJson Json?; settingsJson Json
  routingJson Json?; status String @default("draft")
  variantOfId String? // A/B
  createdAt DateTime @default(now())
}
model FormSubmission {
  id String @id @default(uuid())
  formId String; workspaceId String; contactId String?
  answersJson Json; score Int?; resultTier String?
  utmJson Json?; ipAddress String?
  createdAt DateTime @default(now())
  @@index([formId, createdAt])
}
model FormView { id String @id @default(uuid()); formId String; visitorId String; step Int?; createdAt DateTime @default(now()) }
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| CRUD | /api/forms | Manage |
| GET | /api/public/forms/:id | Public definition |
| POST | /api/public/forms/:id/submit | Submit (spam checks) |
| POST | /api/public/forms/:id/view | View/step tracking |
| GET | /api/forms/:id/submissions | List + CSV export |
| GET | /api/forms/:id/analytics | Funnel stats |
| GET | /api/forms/:id/embed | Script/iframe snippets |

## 5. UI
- /forms: list with conversion stats
- /forms/[id]/edit: builder (left palette, center canvas, right field settings), logic tab, routing tab, design tab (colors, button text)
- /forms/[id]/results: submissions table + analytics charts
- Public render: /f/[id] standalone + embed modes

## 6. Acceptance Criteria
- [ ] Field→contact mapping incl. custom fields; create-or-update dedupe works
- [ ] Quiz scoring + tier routing verified
- [ ] Conditional logic on fields and steps
- [ ] Consent checkbox writes ConsentRecord with exact text (M05)
- [ ] Popup triggers + frequency cap function on test site
- [ ] form.submitted trigger fires with full answer payload

## 7. Claude Code Prompt — M15
```
Build Module M15 (Forms). M09, M13, M05 exist.
1. Prisma models per PRD. Zod runtime validator generated from fieldsJson.
2. Builder UI: dnd-kit palette→canvas, field settings panel, logic
   editor (condition rows), routing tab, multi-step organizer.
3. Public renderer: /f/[id] SSR + embed.js (inline/popup/slide-in with
   trigger engine + localStorage frequency cap).
4. Submit pipeline: spam checks → contact upsert (email/phone) →
   consent.record if checkbox → tags/UTM → routing (assign/deal/redirect)
   → triggers.emit('form.submitted') → timeline.add → notify.
5. Analytics: views/starts/completions rollups + per-step drop-off.
6. A/B: variant assignment cookie + comparison view.
```

*Next: M16 — Campaigns*
