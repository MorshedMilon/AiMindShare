# PRD — M41: Integrations Hub & Open API ⭐
**Layer:** L5 Platform | **Priority:** P0 (vault) / P2 (public API) | **Phase:** 1 (Session 9) + 7
**Depends On:** M01, M02 | **Blocks:** Every module using an external API (25+)

## 1. Purpose
First-class management of all external connections — one encrypted credential vault, one OAuth flow manager, one health monitor — plus (Phase 7) a public REST API with keys and webhooks so the platform is extensible. Built early because hardcoded per-module credentials make everything fragile.

## 2. Core Features
### Phase 1 — Credential Vault & Connections
- **Provider registry:** `providers.ts` — each provider declares auth type (api_key | oauth2 | basic), required fields, scopes, token refresh config. Seed: Twilio, Stripe, OpenAI, Anthropic, Resend/SendGrid, DataForSEO, SerpApi, Meta (FB/IG/WhatsApp/Ads), Google (Calendar/GBP/Ads/PSI), Pinterest, LinkedIn, X, TikTok, Amazon PA-API, ClickBank, ShareASale, Impact, CJ, ElevenLabs.
- **Encrypted storage:** credentials AES-256-GCM encrypted at rest (env master key); scoping: platform-level (agency-wide defaults) and workspace-level overrides.
- **OAuth manager:** generic OAuth2 flow (`/api/integrations/:provider/connect` → consent → callback → token store); automatic refresh worker (BullMQ, refreshes tokens expiring <24h); refresh failure → connection marked `needs_reauth` + M04 notification.
- **Access helper:** `integrations.get(workspaceId, provider)` → returns decrypted, refreshed credentials; the ONLY way modules access external creds. Throws typed `NotConnectedError` → UI shows connect prompt.
- **Health monitor:** hourly ping per connected provider (cheap status call); connections page shows green/yellow/red + last error; failure alerting.
- **Connections UI:** /settings/integrations — provider cards grouped by category, connect/disconnect, status, "used by" module list.

### Phase 7 — Public API & Webhooks
- **API keys:** per-workspace keys (prefix `sk_live_`), scoped permissions (reuse M02 registry), rotate/revoke, last-used tracking.
- **Public REST API v1:** `/v1/contacts`, `/v1/deals`, `/v1/appointments`, `/v1/forms/submissions`, `/v1/invoices` (read/write per scope); rate limit 120 req/min/key; OpenAPI spec auto-generated; docs page.
- **Outgoing webhooks:** subscribe URLs to events (`contact.created`, `deal.won`, `appointment.booked`, `invoice.paid`, `form.submitted`...); HMAC-SHA256 signatures; retries with backoff (5 attempts); delivery log with replay.
- **Incoming webhooks:** per-workspace catch URLs usable as M13 automation triggers.
- **Zapier/Make:** connector definitions built on the public API (triggers: new contact/deal won/form submitted; actions: create contact/add tag/create deal).

## 3. Database Schema (Prisma)
```prisma
model Integration {
  id String @id @default(uuid())
  workspaceId String? // null = platform-level
  provider String
  credentialsEnc Bytes // AES-256-GCM
  status String @default("connected") // connected|needs_reauth|error
  lastHealthCheck DateTime?; lastError String?
  tokenExpiresAt DateTime?
  connectedBy String; createdAt DateTime @default(now())
  @@unique([workspaceId, provider])
}
model ApiKey {
  id String @id @default(uuid())
  workspaceId String; name String
  keyHash String @unique; prefix String
  scopes String[]
  lastUsedAt DateTime?; revokedAt DateTime?
  createdAt DateTime @default(now())
}
model WebhookSubscription {
  id String @id @default(uuid())
  workspaceId String; url String; events String[]
  secret String; isActive Boolean @default(true)
}
model WebhookDelivery {
  id String @id @default(uuid())
  subscriptionId String; event String; payload Json
  status String; attempts Int @default(0)
  responseCode Int?; deliveredAt DateTime?
  createdAt DateTime @default(now())
}
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/integrations | List providers + connection status |
| POST | /api/integrations/:provider/connect | Start (api_key form or OAuth redirect) |
| GET | /api/integrations/:provider/callback | OAuth callback |
| DELETE | /api/integrations/:provider | Disconnect |
| POST | /api/integrations/:provider/test | Health check now |
| CRUD | /api/api-keys | Key management (Phase 7) |
| CRUD | /api/webhooks | Subscriptions + delivery log + replay (Phase 7) |
| * | /v1/* | Public API (Phase 7) |

## 5. Acceptance Criteria
- [ ] integrations.get() is the sole credential access path; decryption never leaves server
- [ ] OAuth connect/refresh verified for Google + Meta; needs_reauth flow works
- [ ] Health monitor flags a revoked key within an hour
- [ ] (P7) API key auth + scopes enforced; HMAC webhook signature verified; retry/replay works
- [ ] Provider registry documented for adding new providers in <30 lines

## 6. Claude Code Prompt — M41 (Phase 1 scope)
```
Build Module M41 Phase 1 (Credential Vault). M01–M02 exist.
1. providers.ts registry (20 providers per PRD, auth type + fields + scopes).
2. Prisma Integration model; lib/crypto.ts AES-256-GCM helpers (env key).
3. lib/integrations.ts: get(workspaceId, provider) — workspace override →
   platform fallback → decrypt → auto-refresh OAuth if expiring → return.
   Typed NotConnectedError.
4. Generic OAuth2 connect/callback routes; BullMQ token-refresh worker.
5. Hourly health-check worker (per-provider cheap ping map).
6. /settings/integrations UI: category-grouped provider cards.
Phase 7 (later session): API keys, /v1 public API, webhooks in/out.
```

*Next: M08 — Dashboard & AI Copilot*
