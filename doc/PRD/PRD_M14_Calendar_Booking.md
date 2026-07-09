# PRD — M14: Calendar & Booking
**Layer:** L1 Core Ops | **Priority:** P0 | **Phase:** 1 (Session 16)
**Depends On:** M09, M13, M28 (paid bookings), M41 (Google) | **Blocks:** M33/M34 booking agents

## 1. Purpose
Calendly replacement wired into CRM and automations. Implements original PRD Section 10 fully.

## 2. Core Features
(Original PRD Section 10 scope)
- **Calendars:** one-on-one, round-robin (least-loaded assignment), group (capacity per slot), class; public slug URLs; per-calendar color/duration/buffer/notice/max-per-day settings.
- **Availability:** weekly hours per day; date-specific overrides; blocks; timezone-aware slot computation (contact sees their local time, stored UTC).
- **Booking page:** responsive public page — month picker → slots → details form (+ custom pre-booking questions) → confirm; optional Stripe payment step (M28 PaymentIntent) before confirmation.
- **Google two-way sync:** OAuth via M41; Google busy events block slots (freebusy); bookings pushed to Google with meet link option; webhook/poll refresh.
- **Lifecycle:** confirmation email/SMS; reminders at 24h + 1h (configurable, respecting M05 consent); self-service reschedule/cancel via signed links; no-show marking → `appointment.no_show` trigger → rebook workflow; cancellations fire trigger.
- **CRM wiring:** booking creates/updates contact + auto-tag "Appointment Booked" + `timeline.add()` + `appointment.booked` trigger (M13).
- **Team internal calendar:** week/month view of all appointments, filter by user/calendar; manual appointment creation.
- **Embed widget:** iframe/script embed for M19 sites + external sites.

## 3. Database Schema
Original PRD Section 10 tables Prisma-ized (`Calendar, CalendarAvailability, Appointment, AppointmentReminder, CalendarBlock`) + `Calendar.roundRobinUserIds String[]`, `Appointment.rescheduleToken`, `AppointmentQuestion { calendarId, label, type, required, order }`.

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| CRUD | /api/calendars (+availability, +questions) | Setup |
| GET | /api/public/calendars/:slug | Public config |
| GET | /api/public/calendars/:slug/slots?date= | Available slots (tz param) |
| POST | /api/public/calendars/:slug/book | Book (+optional payment intent) |
| GET/POST | /api/public/appointments/:token/reschedule \| /cancel | Self-service |
| PATCH | /api/appointments/:id | Status (attended/no_show), reassign |
| GET | /api/appointments | Team calendar feed |
| GET/POST | /api/calendars/:id/google | Connect / sync status |

## 5. UI
- /calendars: list + settings editor (availability grid, questions builder, reminders config, payment toggle)
- /calendar: team week/month view (FullCalendar or custom), appointment drawer
- /book/[slug]: public booking flow (also embeddable)

## 6. Acceptance Criteria
- [ ] Slot math correct across timezones + DST; Google busy respected
- [ ] Round-robin distributes by least upcoming load
- [ ] Reminders queue on booking, cancel on reschedule/cancel, reschedule re-queues
- [ ] Paid booking only confirms after Stripe success (webhook)
- [ ] All lifecycle events emit M13 triggers + timeline entries
- [ ] Signed reschedule/cancel tokens single-purpose and expiring

## 7. Claude Code Prompt — M14
```
Build Module M14 (Calendar & Booking) per original PRD Section 10 plus:
- Slot engine: lib/slots.ts computing availability from weekly rules,
  overrides, blocks, existing appointments, Google freebusy (cached 5m),
  buffers, notice, max/day — UTC internal, tz rendered.
- Round-robin selector; group capacity handling.
- Reminder scheduler: on booking create BullMQ delayed jobs (24h,1h);
  consent.check before SMS; cancel jobs on cancel/reschedule.
- Public booking page (no auth) with payment step via M28 intent API.
- Triggers: appointment.booked/cancelled/no_show via triggers.emit;
  timeline.add + auto-tag on booking.
- Google sync via M41 creds: freebusy read + event create/update/delete.
- Embed: /book/[slug]?embed=1 minimal chrome + script snippet generator.
```

*Next: M15 — Forms & Surveys*
