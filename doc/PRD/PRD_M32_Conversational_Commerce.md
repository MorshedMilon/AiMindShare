# PRD — M32: Conversational Commerce ⭐
**Layer:** L3 Commerce | **Priority:** P3 | **Phase:** 8
**Depends On:** M12, M28, M20 (products), M33 | **Blocks:** —

## 1. Purpose
Sell inside the chat thread: WhatsApp/IG/SMS product browsing, AI-assisted cart building, checkout links, and order status — where GoHighLevel has nothing and commerce is heading.

## 2. Core Features
- **Chat product catalog:** products from M20 catalog exposed to conversations — WhatsApp catalog sync (Meta Commerce API) + in-thread product cards (image, name, price, [Add] button) for channels supporting interactive messages; carousel for "show me options."
- **AI shopping assistant:** M33 agent mode "commerce" — understands intents (browse, ask product questions from knowledge base, add to cart, checkout, order status); builds cart state per conversation; upsell suggestions rule ("customers also bought"); human handoff on request/confusion.
- **Cart & checkout in chat:** cart summary message (items, qty edit via quick replies, total) → checkout link (M28 payment link with cart payload) → payment → order confirmation message auto-sent; abandoned chat-cart (30 min) → `cart.abandoned` trigger (reuses M20 recovery flows).
- **Order status:** "where's my order" → lookup by contact → status reply (order record from M20/M28 + optional tracking field); proactive status-change notifications (paid, fulfilled — fulfillment status manually set or via webhook).
- **Broadcast commerce:** product drops to opted-in segments (M16 SMS/WhatsApp campaign with product cards) — consent-gated (M05), WhatsApp template message compliance (pre-approved templates manager).
- **Analytics:** conversation→cart→purchase funnel, revenue per channel, AI-assisted vs human-assisted sales split.

## 3. Database Schema (Prisma)
```prisma
model ChatCart {
  id String @id @default(uuid())
  workspaceId String; conversationId String; contactId String
  itemsJson Json; status String @default("open") // open|checkout_sent|purchased|abandoned
  checkoutLinkId String?; orderId String?
  updatedAt DateTime @updatedAt
}
model WaTemplate {
  id String @id @default(uuid())
  workspaceId String; name String; category String
  bodyJson Json; metaTemplateId String?; status String // pending|approved|rejected
}
model FulfillmentStatus { orderId String @id; status String; trackingJson Json?; updatedAt DateTime @updatedAt }
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/commerce/catalog/sync | Push products → WhatsApp catalog |
| POST | /api/commerce/carts/:conversationId/items | Add/update (agent + UI) |
| POST | /api/commerce/carts/:id/checkout | Generate M28 link + send card |
| GET | /api/commerce/orders/:contactId | Status lookup (agent tool) |
| PATCH | /api/commerce/orders/:id/fulfillment | Update status (+notify) |
| CRUD | /api/commerce/wa-templates | Template manager (+Meta submit) |
| GET | /api/commerce/analytics | Funnel + revenue |

## 5. UI
- /commerce: chat-sales funnel dashboard, carts table (open/abandoned), fulfillment board
- Inbox (M12) extension: cart side-panel on commerce conversations (view/edit cart, send checkout)
- /settings/commerce: catalog sync status, WA template manager, assistant rules (upsells, handoff)

## 6. Acceptance Criteria
- [ ] WhatsApp catalog sync + product card send verified (Meta test)
- [ ] AI assistant completes browse→cart→checkout-link flow in sandbox
- [ ] Payment webhook closes cart → confirmation message + order record
- [ ] 30-min abandoned chat-cart fires trigger; recovery message references cart items
- [ ] Template messages only send with approved templates outside 24h window
- [ ] Agent order-status tool returns correct state

## 7. Claude Code Prompt — M32
```
Build Module M32 (Conversational Commerce). M12/M28/M20/M33/M05 exist.
1. Prisma models per PRD.
2. WhatsApp Commerce: catalog sync service (product set upsert),
   interactive product/list message senders added to M12 WhatsApp
   adapter; template manager with Meta submission API + status webhook.
3. M33 commerce toolset: searchProducts, addToCart, viewCart,
   checkout (→ M28 payment link with cart metadata), orderStatus —
   registered as agent tools; cart state in ChatCart.
4. Checkout closure: M28 webhook (link metadata cartId) → cart
   purchased + Order link + confirmation send + timeline.
5. Abandonment job (30 min) → triggers.emit(cart.abandoned,
   {cartItems}) — M13 recovery template seeded.
6. Inbox cart side-panel component; fulfillment board; analytics
   funnel queries.
```

*Next: M33 — AI Agent Studio*
