# PRD — M28: Payments & Invoicing
**Layer:** L3 Commerce | **Priority:** P0 | **Phase:** 1 (Session 17b) — invoicing core early; advanced later
**Depends On:** M09, M41 (Stripe), M05 (Text-to-Pay consent) | **Blocks:** M14 paid bookings, M17, M20, M31, M32, M37

## 1. Purpose
Client-facing money: invoices, estimates, subscriptions, checkout links, and Text-to-Pay — the workspace's revenue engine (distinct from M03, which is how the platform bills agencies).

## 2. Core Features
- **Invoices:** line items (products from M20 catalog or ad-hoc), qty, unit price, tax rates (per-workspace tax settings), discounts (fixed/%), notes/terms; statuses draft/sent/viewed/partial/paid/overdue/void; PDF generation (branded, logo from workspace branding); send via email + SMS link; public hosted pay page (Stripe Payment Element: card, ACH where available, Apple/Google Pay); partial payments option; auto-receipts.
- **Recurring invoices & subscriptions:** client subscriptions on connected Stripe account — plans/frequency, auto-charge saved method or auto-send invoice; dunning (retry schedule + `payment.failed` trigger → M13 chase sequence).
- **Estimates/quotes:** same builder, accept button → converts to invoice (and can originate from M17 pricing tables).
- **Payment links & checkout pages:** standalone product/amount links (one-time or subscription) for social/DMs; QR code generation.
- **Text-to-Pay:** send invoice/pay-link via SMS (M12 send path, consent-gated) — killer feature for service businesses.
- **Payment plans:** split total into N scheduled installments (2–12) with auto-charge + reminder before each.
- **Overdue handling:** aging buckets (1–15/16–30/31+), auto-reminder schedule (3d before due, on due, +3d, +7d — configurable), `invoice.overdue` trigger, late fee option.
- **Multi-currency:** invoice currency per client (135+ via Stripe); workspace default; FX display note.
- **Stripe Connect:** each workspace connects its own Stripe account (Standard Connect via M41 OAuth) — platform never touches client funds; optional platform application fee hook (used by M42).
- **Revenue reporting:** collected/outstanding/overdue cards, revenue over time, by product/client; feeds M40 + M08 KPIs; every payment → `payment.received` trigger + timeline + notification.

## 3. Database Schema (Prisma)
```prisma
model Invoice {
  id String @id @default(uuid())
  workspaceId String; contactId String
  number String; currency String @default("USD")
  itemsJson Json; subtotal Int; taxJson Json?; discountJson Json?
  total Int; amountPaid Int @default(0)
  status String @default("draft")
  dueDate DateTime?; sentAt DateTime?; paidAt DateTime?
  stripeInvoiceId String?; publicToken String @unique
  sourceType String? // manual|document|booking|order|time
  sourceId String?
  createdAt DateTime @default(now())
}
model InvoicePayment {
  id String @id @default(uuid())
  invoiceId String; amount Int; method String
  stripePaymentIntentId String?
  paidAt DateTime @default(now())
}
model ClientSubscription {
  id String @id @default(uuid())
  workspaceId String; contactId String
  planName String; amount Int; interval String
  stripeSubId String?; status String
  nextChargeAt DateTime?
}
model PaymentLink {
  id String @id @default(uuid())
  workspaceId String; name String; amount Int?; productId String?
  recurringJson Json?; slug String @unique; active Boolean @default(true)
}
model PaymentPlan {
  id String @id @default(uuid())
  invoiceId String; installmentsJson Json // [{amount, dueAt, status, piId?}]
}
model TaxRate { id String @id @default(uuid()); workspaceId String; name String; rate Float }
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| CRUD | /api/invoices (+send, +void, +pdf) | Invoice lifecycle |
| GET | /api/public/pay/:token | Hosted pay page data |
| POST | /api/public/pay/:token/intent | Create PaymentIntent (partial ok) |
| CRUD | /api/estimates (+accept) | Quotes |
| CRUD | /api/client-subscriptions | Subs |
| CRUD | /api/payment-links | Links + QR |
| POST | /api/invoices/:id/text-to-pay | SMS send (consent-gated) |
| POST | /api/invoices/:id/payment-plan | Configure installments |
| POST | /api/payments/webhook | Stripe Connect webhooks |
| GET | /api/payments/reports?range= | Revenue rollups |
| POST | /api/payments/connect | Stripe Connect onboarding |

## 5. UI
- /payments: revenue cards + tabs Invoices / Subscriptions / Links / Transactions
- Invoice editor: line-item table, tax/discount controls, preview pane, send modal (email/SMS)
- Public pay page: branded, itemized, Payment Element, receipt state
- /settings/payments: Stripe Connect status, tax rates, reminder schedule, numbering format

## 6. Acceptance Criteria
- [ ] Invoice → send → public page → pay → webhook → paid status + receipt + `payment.received` trigger + timeline, end-to-end
- [ ] Partial payments accumulate correctly; overdue job flips status + fires trigger + reminders per schedule
- [ ] Payment plan charges installments on schedule with pre-reminders
- [ ] Text-to-Pay blocked without SMS consent (M05)
- [ ] Connect: funds land in workspace's Stripe account; platform fee hook present but zero by default
- [ ] PDF renders branded and correct totals incl. tax/discount

## 7. Claude Code Prompt — M28
```
Build Module M28 (Payments & Invoicing). M09/M41/M05/M12 exist.
1. Stripe Connect (Standard) onboarding via M41; all client charges on
   connected account (stripeAccount header); application_fee_amount
   parameterized (default 0, consumed later by M42).
2. Prisma models per PRD; invoice numbering per workspace (prefix+seq).
3. Invoice service: totals calc (items, tax, discount) shared by UI
   preview + server; PDF via puppeteer template → M06.
4. Public pay page (no auth): Payment Element, partial amount support,
   3DS handling; webhook (payment_intent.succeeded on connected accts)
   → InvoicePayment + status + triggers.emit(payment.received) +
   timeline + notify.
5. Recurring: ClientSubscription ↔ Stripe subs on connected account;
   dunning events → payment.failed trigger.
6. Payment plans: installment scheduler jobs (charge saved PM or send
   pay link) + reminders. Overdue cron + reminder schedule engine.
7. Text-to-Pay via M12 SMS send path with consent.check.
8. UI per PRD. Register M13 action 'create_invoice' handler.
```

*Next: M29 — Affiliate Marketing Hub*
