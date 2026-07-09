# PRD — M42: White-Label SaaS Mode
**Layer:** L5 Platform | **Priority:** P2 | **Phase:** 7 (Sessions 33–34)
**Depends On:** M01, M03 (meters!), M28, M41 | **Blocks:** — (the agency business model)

## 1. Purpose
The GoHighLevel money move: agencies rebrand the entire platform as THEIR software and resell it to clients at their own prices — custom domain, custom plans, rebilled usage with markup. This converts users into distributors.

## 2. Core Features
- **Platform white-labeling (per agency):** custom platform domain (app.agencyname.com — CNAME + SSL via M19 domain infra pattern); full branding: logo, favicon, color theme (CSS variable theming), platform display name, custom login page; branded transactional emails (from agency domain via their sending identity, M16 domain-auth reused); remove/replace all platform-vendor mentions in UI strings (brand token system); optional custom help-center URL + support email.
- **SaaS Configurator (agency's plans):** agencies define their own plan tiers for sub-account clients — name, price, interval, included features (subset toggles of agency's own plan features), included usage quotas (emails, SMS, AI tokens, voice minutes… bounded by agency's quotas); client-facing pricing/signup page (branded, hosted) OR manual assignment.
- **Client billing via Stripe Connect:** clients pay the AGENCY (agency's connected Stripe account, M28 infra); platform continues billing agency (M03); subscription lifecycle per sub-account (trial, active, past-due → configurable suspension: read-only/locked).
- **Rebilling with markup (the killer feature):** metered usage (M03 meters per workspace) × agency-set unit markup prices (e.g. SMS cost $0.0075 → agency charges client $0.015) → monthly usage invoice lines auto-added to client subscription invoice (or separate usage invoice); markup config per meter with margin preview; agency P&L view (platform cost vs client revenue per sub-account).
- **Agency operations dashboard:** sub-accounts table (plan, MRR, usage, health via M36, status); create/suspend/cancel client subscriptions; coupon codes for their plans; churn + MRR metrics (agency-level).
- **Sub-account signup flow:** hosted branded signup (choose agency plan → pay → workspace auto-provisioned via M01, optionally from M39 snapshot) — agencies get a full self-serve SaaS without building anything.
- **Mobile app branding (later flag):** white-label PWA config (name, icon, splash) — native wrapper deferred to M43 infra.
- **Guardrails:** feature/quota grants bounded by agency's own plan (can't resell what you don't have); platform ToS pass-through acceptance; M03 hard-stops cascade correctly (agency limit reached → sub-account sends blocked with agency-facing alert, client sees agency-branded message).

## 3. Database Schema (Prisma)
```prisma
model WhiteLabelConfig {
  agencyId String @id
  platformDomain String? @unique
  brandingJson Json // logo, colors, name, favicon, emails
  status String @default("disabled")
  sslStatus String?
}
model AgencyPlan {
  id String @id @default(uuid())
  agencyId String; name String
  priceCents Int; interval String
  featureFlags String[]; quotasJson Json
  stripePriceId String? // on agency's connected account
  isPublic Boolean @default(false)
}
model SubAccountSubscription {
  id String @id @default(uuid())
  agencyId String; workspaceId String @unique
  agencyPlanId String
  stripeSubId String?; status String
  trialEndsAt DateTime?; currentPeriodEnd DateTime?
}
model MeterMarkup {
  agencyId String; meterKey String
  clientUnitPriceCents Float
  @@id([agencyId, meterKey])
}
model RebillLine {
  id String @id @default(uuid())
  workspaceId String; periodMonth String
  meterKey String; quantity Int; unitPriceCents Float; totalCents Int
  invoicedAt DateTime?
  @@unique([workspaceId, periodMonth, meterKey])
}
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| GET/PATCH | /api/whitelabel/config (+domain verify) | Branding + domain |
| CRUD | /api/whitelabel/plans | Agency plan tiers |
| GET | /api/public/wl/:domain/signup | Hosted signup config |
| POST | /api/public/wl/signup | Client signup → sub, provision |
| CRUD | /api/whitelabel/subscriptions | Manage client subs |
| GET/PATCH | /api/whitelabel/markups | Rebill pricing (+margin preview) |
| POST | /api/whitelabel/rebill/run | Monthly usage-invoice job (manual trigger) |
| GET | /api/whitelabel/pnl | Cost vs revenue per sub-account |
| GET | /api/whitelabel/dashboard | Agency SaaS metrics |

## 5. UI
- /agency/saas: setup wizard (domain → branding → plans → markups → Stripe Connect check), sub-accounts table with billing actions, P&L view, MRR/churn cards
- Hosted: branded login at platform domain, pricing/signup pages
- Theming: runtime brand provider (resolves host → WhiteLabelConfig → CSS vars + strings)

## 6. Acceptance Criteria
- [ ] Visiting agency domain renders fully rebranded app (logo, colors, name, emails) — zero platform-brand leaks (string audit test)
- [ ] Client signup on hosted page → paid sub on agency Stripe → workspace provisioned (snapshot option works)
- [ ] Monthly rebill job converts M03 UsageSummary × markups → RebillLines → Stripe invoice items on client sub; P&L math verified
- [ ] Quota grants cannot exceed agency plan (validation)
- [ ] Suspension states enforce (past-due → read-only per config)
- [ ] Agency-limit cascade: sub-account blocked action shows agency-branded messaging + agency alerted

## 7. Claude Code Prompt — M42
```
Build Module M42 (White-Label SaaS). M01/M03/M28/M41/M19-domain infra exist.
1. Prisma models per PRD.
2. Brand resolution middleware: host header → WhiteLabelConfig →
   ThemeProvider (CSS variables) + brand string context + email
   sender config. Domain connect flow reusing M19 SSL provisioning.
3. Agency plans: CRUD creating Stripe prices on agency's connected
   account; quota validation against agency plan; hosted pricing/
   signup pages (SSR by domain) → Stripe Checkout (connected acct)
   → webhook → M01 provisioning (optional snapshotId).
4. Sub-account subscription lifecycle + suspension middleware states.
5. Rebilling: monthly job reading M03 UsageSummary per workspace ×
   MeterMarkup → RebillLines → Stripe invoice items (connected acct);
   P&L endpoint joining platform meter costs vs rebill revenue.
6. Agency SaaS dashboard UI per PRD with margin preview calculator.
7. Brand-leak test: crawl authed pages for platform-vendor strings.
```

*Next: M43 — Mobile Field App*
