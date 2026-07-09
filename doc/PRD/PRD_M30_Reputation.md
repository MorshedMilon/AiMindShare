# PRD — M30: Reputation & Reviews
**Layer:** L3 Commerce | **Priority:** P1 | **Phase:** 4
**Depends On:** M09, M12, M13, M41 (Google/FB), M19 | **Blocks:** M26 tie-ins

## 1. Purpose
Review generation, monitoring, and response — the highest-ROI feature for local service businesses and a core agency deliverable.

## 2. Core Features
- **Review requests:** email + SMS templates with direct review links (Google review URL builder from place ID, Facebook); send manually from contact, bulk to smart list, or automated (M13 action post-appointment/post-payment with delay); throttle rules (one request per contact per X days); QR code + printable card generator for in-store.
- **Review funnel (gating-compliant):** optional pre-ask sentiment page ("How was your experience?" 1–5) → 4–5 → direct to Google/FB; 1–3 → private feedback form (creates M12 conversation + notification) — configurable to comply with platform policies (option to always show public links).
- **Monitoring:** connect Google (GBP via M41) + Facebook pages → sync reviews (nightly + on-demand); unified review inbox (rating, text, reviewer, platform, replied?); `review.received` trigger (M13) + notification; negative-review instant alert (≤3 stars).
- **AI responses:** GPT-4o reply drafts matched to rating/sentiment + brand voice; one-click approve-and-post (Google reply API, FB); response templates library; auto-respond option for 5-star (with review).
- **Widgets:** embeddable review walls/carousels/badges for M19 sites (filter by min rating, platform); schema markup (AggregateRating) included.
- **Video testimonials:** request link → contact records browser video (MediaRecorder) → uploads to M06 → approval queue → embeddable testimonial widget.
- **Analytics:** rating trend, volume by platform, response rate/time, sentiment themes (AI topic extraction: "staff", "pricing", "wait time"), competitor rating tracking (public GBP data of N competitors).
- **Metering:** requests sent count under email.sent/sms.sent.

## 3. Database Schema (Prisma)
```prisma
model ReviewSource { id String @id @default(uuid()); workspaceId String; platform String; externalId String; name String; connectedAt DateTime @default(now()) }
model Review {
  id String @id @default(uuid())
  workspaceId String; sourceId String
  externalId String; rating Int; text String?
  reviewerName String?; reviewedAt DateTime
  replyText String?; repliedAt DateTime?
  sentimentJson Json?
  @@unique([sourceId, externalId])
}
model ReviewRequest {
  id String @id @default(uuid())
  workspaceId String; contactId String
  channel String; status String // sent|clicked|reviewed?
  funnelChoice Int?; sentAt DateTime @default(now())
}
model PrivateFeedback { id String @id @default(uuid()); workspaceId String; contactId String?; rating Int; text String; createdAt DateTime @default(now()) }
model Testimonial { id String @id @default(uuid()); workspaceId String; contactId String?; videoAssetId String; status String @default("pending") }
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| POST/GET | /api/reviews/sources | Connect / list |
| POST | /api/reviews/sync | On-demand sync |
| GET | /api/reviews | Unified inbox (filters) |
| POST | /api/reviews/:id/reply | Post reply (AI draft param) |
| POST | /api/review-requests (+bulk) | Send requests |
| GET | /api/public/review-funnel/:token | Funnel page |
| POST | /api/public/review-funnel/:token/choice | Route |
| CRUD | /api/review-widgets | Widget configs (+embed) |
| POST | /api/public/testimonials/:token | Video upload |
| GET | /api/reviews/analytics | Trends + themes + competitors |

## 5. UI
- /reputation: rating trend card, platform cards, review inbox (reply drawer with AI draft button), requests tab, private feedback tab
- Funnel settings: gating mode, thresholds, templates
- Widget builder with live preview + embed code
- Testimonial approval queue

## 6. Acceptance Criteria
- [ ] Google + FB reviews sync and dedupe; reply posts back to Google
- [ ] Post-appointment automation sends request with throttle respected
- [ ] Funnel routes by score; private feedback creates conversation + alert
- [ ] Widget renders with AggregateRating schema; min-rating filter works
- [ ] Negative review alert <5 min from sync; review.received trigger fires
- [ ] AI reply tone matches rating (spot-check harsh 1-star handled gracefully)

## 7. Claude Code Prompt — M30
```
Build Module M30 (Reputation). M09/M12/M13/M41/M19/M06 exist.
1. Prisma models per PRD.
2. Sync workers: GBP reviews API + FB page ratings via M41 → Review
   upsert → triggers.emit(review.received) + negative alert path.
3. Reply service: GPT-4o draft (rating+text+brand voice) endpoint +
   post-reply via platform APIs.
4. Request engine: templates with {{review_link}} builder (place-id →
   Google write-review URL), throttle check, M13 action handler
   'send_review_request'.
5. Public funnel page (token per request): star choice → redirect or
   private form → M12 conversation + PrivateFeedback.
6. Widgets: config → embed.js + Craft component, AggregateRating JSON-LD.
7. Testimonial recorder page (MediaRecorder → M06) + approval queue.
8. Analytics incl. AI theme extraction (batch job) and competitor
   rating snapshots (public GBP fetch).
```

*Next: M31 — Memberships & Courses*
