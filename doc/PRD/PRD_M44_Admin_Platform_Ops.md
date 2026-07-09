# PRD — M44: Admin & Platform Ops
**Layer:** L5 Platform | **Priority:** P1 | **Phase:** 2 (basic) → grows each phase
**Depends On:** M00–M03, M07 | **Blocks:** Safe operation of everything

## 1. Purpose
The super-admin console for the platform operators (you): manage agencies, monitor infrastructure, control plans and feature flags, moderate the marketplace, and debug production safely.

## 2. Core Features
- **Super-admin access:** separate role above agencies (`platformAdmin` flag on User, allowlisted emails + mandatory 2FA); admin routes at /admin behind dedicated middleware; every admin action → audit (M07, platform scope).
- **Agency & workspace management:** searchable directory (agencies, workspaces, users) with plan, MRR, usage, health (M36), created date; actions: change plan, extend trial, add credits, suspend/unsuspend, hard-delete (double-confirm + export first).
- **Impersonation:** "login as" any user for support — banner shown, read-write but flagged session, every action audited with impersonator identity, auto-expires 30 min.
- **Plan & pricing management:** edit M03 plans (features, limits, prices), grandfathering rules, coupon/promo codes for platform billing.
- **Feature flags:** global + per-agency flags (`flags.ts` registry + DB overrides) — gate beta modules (e.g. M34 voice rollout), kill-switches for incidents (e.g. disable AI generation platform-wide); evaluated via `flag.isEnabled(key, agencyId?)`.
- **Infrastructure monitoring:** BullMQ queues dashboard (depth, throughput, failed jobs with retry/discard, per-queue pause), cron job health (last run, next run, failures), external provider status rollup (M41 health aggregated), error feed (Sentry integration link + recent exceptions), DB stats (connections, slow queries log), Redis memory.
- **Usage & cost observability:** platform-wide meter consumption (AI tokens, SMS, SEO calls) by day + top consumers; unit-cost config (what each meter costs us) → gross margin dashboards; anomalous consumption alerts (abuse detection: 10× baseline).
- **Marketplace moderation (with M39):** seller applications queue, listing review queue (sandbox install result + manual approve/reject with notes), takedown tools, reported-content queue.
- **Compliance ops:** GDPR request oversight across workspaces (M05 SLA dashboard), A2P registration status rollup, abuse reports (spam complaints per workspace → warning/suspension workflow).
- **Announcements:** platform banner/message composer (all users or per-plan targeting, scheduled), maintenance-mode toggle with custom message.
- **Support tooling:** user lookup (by email) → account state summary (auth events, subscription, workspaces, recent errors); resend verification/reset on behalf; unlock accounts; 2FA reset (identity-verified process note).

## 3. Database Schema (Prisma)
```prisma
model FeatureFlag {
  key String @id
  defaultOn Boolean @default(false)
  description String?
}
model FeatureFlagOverride {
  flagKey String; agencyId String
  enabled Boolean
  @@id([flagKey, agencyId])
}
model ImpersonationSession {
  id String @id @default(uuid())
  adminUserId String; targetUserId String
  reason String; startedAt DateTime @default(now())
  expiresAt DateTime; endedAt DateTime?
}
model PlatformAnnouncement {
  id String @id @default(uuid())
  title String; body String; level String
  targetJson Json?; startsAt DateTime; endsAt DateTime?
}
model MeterCost { meterKey String @id; unitCostMicros Int } // platform cost basis
model AbuseReport { id String @id @default(uuid()); workspaceId String; type String; detailJson Json; status String @default("open"); createdAt DateTime @default(now()) }
```

## 4. API Endpoints (all /api/admin/*, platformAdmin-gated)
| Area | Endpoints |
|---|---|
| Directory | GET agencies/workspaces/users (+detail), PATCH plan/trial/credits/suspend |
| Impersonation | POST impersonate/:userId, POST end |
| Plans | CRUD plans, coupons |
| Flags | CRUD flags + overrides |
| Infra | GET queues (+retry/discard/pause), crons, providers, errors |
| Costs | GET usage-rollups, margin; PATCH meter-costs |
| Marketplace | GET/POST review queues (sellers, listings, reports) |
| Compliance | GET gdpr-sla, a2p-rollup, abuse (+actions) |
| Comms | CRUD announcements, POST maintenance-mode |
| Support | GET user-lookup, POST auth actions (unlock, resend, 2fa-reset) |

## 5. UI (/admin)
- Overview: platform KPIs (agencies, MRR, DAU, queue health, error rate)
- Directory / Account detail pages with action panels
- Queues & Crons monitor (live refresh)
- Flags manager; Plans editor; Costs & margin dashboard
- Marketplace review queues; Compliance dashboards
- Announcements composer; Support lookup console
- Impersonation launcher with reason field

## 6. Acceptance Criteria
- [ ] Non-platformAdmin cannot reach any /admin route/API (tests)
- [ ] Impersonation: banner, audit entries carry both identities, 30-min expiry
- [ ] Flag kill-switch disables gated feature within 60s (cache TTL)
- [ ] Failed-job retry works from queue UI; cron miss alerting fires
- [ ] Margin dashboard = meter usage × MeterCost vs plan revenue, verified with fixtures
- [ ] Suspension flow: agency suspended → all its workspaces read-only + banner

## 7. Claude Code Prompt — M44
```
Build Module M44 (Admin & Platform Ops). Foundation exists; grows
with each phase.
1. platformAdmin: User flag + requirePlatformAdmin() middleware
   (allowlist env + 2FA-enforced), /admin route group + layout.
2. Directory queries across Agency/Workspace/User with M03/M36 joins;
   action endpoints (plan change, trial extend, credits, suspend —
   suspension middleware check added to requireWorkspace()).
3. Impersonation: signed short-lived session-swap with impersonation
   claims; UI banner; audit hooks; auto-expiry.
4. flags.ts registry + DB overrides + Redis-cached isEnabled();
   admin CRUD UI. Wire 3 example gates (voice, marketplace, video).
5. Infra: Bull Board (embedded, auth-wrapped) or custom queue API;
   cron registry with heartbeat rows + missed-run alerts; M41 health
   rollup; Sentry link-outs.
6. Cost observability: MeterCost admin + daily margin rollup queries.
7. Announcements (banner component reads active targeted rows),
   maintenance mode flag, support lookup console with auth actions.
```

---

*This completes the full PRD set: M00–M44, all 45 modules.*
