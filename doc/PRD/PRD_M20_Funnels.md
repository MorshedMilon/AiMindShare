# PRD — M20: Funnels
**Layer:** L2 Growth | **Priority:** P1 | **Phase:** 2 (Session 23)
**Depends On:** M19, M28, M09 | **Blocks:** —

## 1. Purpose
Multi-step conversion flows on top of the M19 page engine — opt-in → sales → order → upsell → thank-you — with split testing and per-step conversion tracking. ClickFunnels replacement.

## 2. Core Features
- **Funnel builder:** ordered steps, each step = an M19 page with a step type (optin | sales | order | upsell | downsell | thankyou); visual funnel map showing steps connected with visitors → conversions → rate per step; step reorder; funnel templates (lead magnet, webinar, product launch, booking funnel).
- **Flow logic:** step progression rules (form submit → next; purchase → upsell; upsell decline → downsell); funnel-scoped visitor state cookie carrying contact/session through steps; direct-entry handling (mid-funnel arrivals tracked).
- **Order forms:** M19 order element bound to products (name, price, recurring option via M28); Stripe Payment Element inline; **bump offers** (checkbox add-on pre-purchase); coupon field.
- **One-click upsells:** post-purchase steps charge saved payment method (Stripe off-session PaymentIntent) on single click — no re-entry of card; decline → downsell or thank-you.
- **A/B split testing:** per step, two page variants, weighted traffic split, conversion goal = step progression or purchase; sequential significance check; auto-promote winner (configurable).
- **Analytics:** funnel report — visitors, opt-ins, purchases, revenue, AOV, per-step drop-off waterfall; UTM source breakdown; date compare.
- **CRM wiring:** opt-in → contact + tags; purchase → contact + M11 deal (configurable pipeline/stage) + `payment.received` trigger + timeline; abandoned order (form started, no purchase, 1h) → `cart.abandoned` trigger for M13 recovery sequences.

## 3. Database Schema
`Funnel, FunnelStep` from original PRD + `FunnelStep.typeConfigJson`, `Product { id, workspaceId, name, price, currency, recurringJson?, stripePriceId }`, `Order { id, workspaceId, funnelId?, contactId, itemsJson, subtotal, total, status, stripePaymentIntentId, createdAt }`, `FunnelVisit { funnelId, visitorId, contactId?, stepId, event, createdAt }`, `SplitTest { stepId, variantAPageId, variantBPageId, split, goal, status, winner? }`.

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| CRUD | /api/funnels (+steps) | Manage |
| GET | /api/funnels/:id/map | Steps + conversion stats |
| CRUD | /api/products | Catalog |
| POST | /api/public/funnels/order | Create order + PaymentIntent |
| POST | /api/public/funnels/upsell | One-click charge |
| POST | /api/public/funnels/track | Step events |
| CRUD | /api/split-tests | A/B config + results |

## 5. UI
- /funnels: list with revenue glance
- /funnels/[id]: horizontal step map (cards with mini stats), step drawer (page link/edit, type config, split test tab), analytics tab (waterfall chart), settings (pipeline mapping, abandonment)
- Public: steps render via M19 with funnel context script

## 6. Acceptance Criteria
- [ ] Full flow test: opt-in → order (with bump) → one-click upsell accept → thank-you; contact, deal, order, timeline all correct
- [ ] Upsell charges off-session without card re-entry
- [ ] Split test assigns sticky variants; stats separate; winner promotion works
- [ ] Waterfall math consistent with FunnelVisit events
- [ ] cart.abandoned fires at 1h for started-not-purchased

## 7. Claude Code Prompt — M20
```
Build Module M20 (Funnels). M19/M28/M09/M13 exist.
1. Prisma models per PRD.
2. Funnel context: signed cookie {funnelId, visitorId, contactId?,
   stepPath[]}; injected script on funnel pages posting step events.
3. Order flow: /order endpoint → Order + Stripe PaymentIntent
   (setup_future_usage=off_session) → webhook confirm → contact/deal/
   timeline/triggers; bump = extra line item toggle.
4. Upsell: /upsell one-click off-session PaymentIntent on stored PM;
   decline routing per step config.
5. Split test middleware in public renderer: sticky assignment cookie,
   variant page serve, conversion attribution.
6. Abandonment job: hourly scan of orders status=started >1h →
   triggers.emit(cart.abandoned).
7. UI: step map, drawers, waterfall analytics (Recharts).
```

*Next: M21 — SEO Engine*
