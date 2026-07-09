# PRD — M16: Campaigns (Email + SMS Unified)
**Layer:** L1 Core Ops | **Priority:** P0 | **Phase:** 2 (Sessions 18–19)
**Depends On:** M09, M13, M05, M03, M41 | **Blocks:** M22 distribution, M29 promos

## 1. Purpose
One campaign framework, two channels — broadcasts and drip sequences replacing Mailchimp/ActiveCampaign. Implements original PRD Section 11 fully.

## 2. Core Features
(Original PRD Section 11 scope)
- **Email builder:** drag-drop blocks (section, columns, text, image [M06], button, divider, social links, spacer, HTML); mobile preview; MJML-compiled output for client compatibility; global brand styles.
- **Broadcasts:** audience = tag / smart list / all (minus suppressed); schedule datetime (workspace tz); send-rate throttling; pre-send checklist (audience count, unsub link present, spam score).
- **Drip sequences:** ordered steps mixing email + SMS with delays (relative: X days after previous / after enrollment; or fixed weekday+time); enrollment via M13 action, form routing, or manual; exit conditions (goal met, unsubscribed, replied); per-step stats.
- **A/B subject testing:** two subjects → 10%+10% sample → winner by opens after 4h → auto-send remainder.
- **Personalization:** {{first_name}}, {{company}}, {{custom.field}}, {{unsubscribe_link}} (enforced), fallback values.
- **Deliverability:** SendGrid/Resend via M41; domain authentication wizard (SPF/DKIM records shown + verified); open pixel + click-wrapped links (per-recipient tokens) → events feed M13 triggers (email.opened/clicked) + timeline; bounce/complaint webhooks → suppression list; spam score check (SpamAssassin API) pre-send.
- **SMS campaigns:** merge tags, segment counter (160-char parts), consent-filtered audience (M05), quiet hours enforcement, replies land in M12 inbox; delivery receipts.
- **Compliance:** auto-unsubscribe footer; suppression list (bounces, complaints, unsubs) globally enforced; CAN-SPAM address footer setting.
- **Templates:** 60+ niche email templates seeded; save-as-template.
- **AI copywriter:** goal + audience + tone → subject options + body draft (meter ai.tokens).
- **Analytics:** delivered/opens/clicks/bounces/unsubs/revenue-attributed (via UTM → M09 → M11 won deals); per-link click map.
- **Metering:** every send → `email.sent` / `sms.sent` (M03 limits enforced pre-send with clear failure states).

## 3. Database Schema
`EmailCampaign, CampaignStats` from original PRD + `Sequence { id, workspaceId, name, status }`, `SequenceStep { sequenceId, order, channel, delayJson, subject?, bodyJson, stats }`, `SequenceEnrollment { sequenceId, contactId, currentStep, status, enrolledAt }`, `Suppression { workspaceId, email, reason }`, `SendEvent { campaignId?, stepId?, contactId, type, url?, createdAt }`.

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| CRUD | /api/campaigns | Broadcasts (draft/schedule/send) |
| POST | /api/campaigns/:id/test-send | Send test to self |
| POST | /api/campaigns/:id/spam-check | Score |
| CRUD | /api/sequences (+steps) | Drips |
| POST | /api/sequences/:id/enroll | Enroll contacts/list |
| GET | /api/campaigns/:id/stats \| /api/sequences/:id/stats | Analytics |
| GET | /t/o/:token (pixel) \| /t/c/:token (click) | Tracking |
| POST | /api/webhooks/sendgrid | Bounce/complaint/delivery events |
| POST | /api/campaigns/ai-write | AI copywriter |

## 5. UI
- /campaigns: list (type, status, audience, stats)
- /campaigns/new: builder — audience step, content step (email editor / SMS composer), A/B tab, review checklist, schedule
- /sequences/[id]: vertical step timeline editor with per-step stats
- /settings/sending: domain auth wizard, from identities, suppression list viewer

## 6. Acceptance Criteria
- [ ] MJML output renders correctly (Gmail/Outlook/Apple Mail spot check)
- [ ] Throttled batch sending via BullMQ; 10k-recipient broadcast completes with accurate stats
- [ ] Open/click events fire M13 triggers + timeline within seconds
- [ ] A/B winner logic verified with time-shifted test
- [ ] Suppression + consent + quota gates all block appropriately pre-send
- [ ] Sequence delays accurate; exit conditions honored

## 7. Claude Code Prompt — M16
```
Build Module M16 (Campaigns). Foundation + M09/M13/M05/M03/M41 exist.
1. Email editor: block-based (dnd-kit) producing JSON → MJML → HTML
   compile step server-side; template save/load; 10 seed templates
   (expand later).
2. Send pipeline: audience resolver (tag/smartlist minus Suppression
   minus consent-opt-outs) → meter.check → BullMQ batched sender
   (provider via M41) with per-recipient token link-wrapping + pixel →
   SendEvent writes → stats rollup.
3. Tracking endpoints /t/o /t/c → SendEvent → triggers.emit(email.opened/
   clicked) → timeline.add.
4. Provider webhooks: bounces/complaints → Suppression + stats.
5. Sequences: enrollment records + BullMQ delayed step jobs; exit checks
   before each step; SMS steps gated by consent + quiet hours.
6. A/B: sample sends, 4h winner job, remainder send.
7. AI copywriter endpoint (GPT-4o, meter tokens). Spam-check integration.
8. UI per PRD including domain-auth wizard (DNS records + verify button).
```

*Next: M17 — Proposals & Contracts*
