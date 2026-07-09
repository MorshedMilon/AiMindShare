# BUILD-SEQUENCE-v1_0.md
### AiMindShare.com — Build Sequence
**Version 1.0 · 2026-07-02 · The Module List's 8 phases, re-cut into one-module-per-session
Claude Code sessions for the vanilla + Supabase stack.**

> One session = one module (or one clearly bounded slice of a big module), built vertically to
> Definition-of-Done. Never start a module before its dependencies are Done. Every session's
> attach list is: **Constitution + DECISIONS + the schema slice + the module's PRD + this doc's
> session entry + TASKS.md.** The per-session rows below list only what's *additional* to that.

**Standing note:** PRD §32's Master System Prompt is superseded — the Constitution replaces it
(the §32 prompt hardcodes the dead Next.js/Prisma/BullMQ stack). PRD *module specs* remain the
functional source.

---

## Session 0 — Supabase project setup *(blocks everything)*

**Goal:** a live Supabase project with the foundation in place before any module code exists.

- Create project; configure Auth (email/password, Google OAuth, magic links; 2FA on).
- Run migrations `0000–0003`: extensions + helpers (`set_updated_at`, `is_member`, `has_role`),
  enum registry, tenancy (`profiles`, `workspaces`, `memberships`), `jobs`, meters/plans tables.
- Attach the standard RLS template to every table created; verify with a first manual leak probe.
- Create Storage buckets (`media`, `brand`, `portal`, `public`) with path-scoped policies.
- Register the first `pg_cron` entries: claim sweep + stale-lease reclaim.
- Set up Vault; store the first placeholder secret and prove an Edge Function can read it.
- Scaffold the repo: `frontend/` (plain html/css/js), `supabase/` (migrations, functions),
  `workers/`, `docs/`; commit the six foundation docs + this one + DoD + TASKS.md.
- **Accept when:** leak probe green on tenancy tables · a test `queued` job is claimed and marked
  `done` by a stub worker · a stub Edge Function reads Vault and returns the standard envelope ·
  DoD Gate-8 greps run clean on the empty scaffold.

---

## Phase 1 — Foundation + Core CRM (Sessions 1–15)

| # | Module / slice | Extra attach | Accept when (beyond full DoD) |
|---|---|---|---|
| 1 | **M00 Auth & Identity** | PRD_M00 | Sign-up/in (email, Google, magic link), 2FA, reset, session mgmt via Supabase Auth; `profiles` row auto-created on signup |
| 2 | **M01 Workspaces & Multi-Tenancy** | PRD_M01 | Create agency + sub-account, switch workspaces, provisioning creates owner membership; agency reach = explicit membership (RLS doc §1) |
| 3 | **M02 Roles & Permissions** | PRD_M02 | Invitation flow (email → accept → membership), role change UI, `permissions` overrides read by a test Edge Fn; matrix verified per DoD Gate 2 |
| 4 | **M03 Billing & Usage Metering (platform)** | PRD_M03, USAGE-METERING doc **(write it before this session)** | Stripe subscription checkout via Edge Fn + verified webhook; plan gates enforced; `usage_meters` upsert path proven with a synthetic event |
| 5 | **M41 Credential Vault (slice only)** | PRD_M41 | `integrations` table + Vault write/read via Edge Fn; connection health ping; *public API deferred to Phase 7* |
| 6 | **M04 Notifications Center** | PRD_M04 | In-app feed (Realtime), prefs, digest schedule as `pg_cron` → `jobs`; email channel stubbed until D-011 (provider) is decided |
| 7 | **M05 Compliance basics** | PRD_M05 | Consent records write path, opt-in capture, A2P registration workflow screens (Twilio wiring can stub), GDPR request intake → `gdpr.export/erase` jobs |
| 8 | **M09 CRM** | PRD_M09 | Contacts/companies CRUD, tags, custom fields, smart lists (AND/OR), notes, tasks, timeline, CSV import (as a job), dup detection (pg_trgm), bulk actions |
| 9 | **M11 Pipeline** | PRD_M11 | Multi-pipeline kanban (SortableJS), deal drawer, win/loss + reasons, weighted forecast, stage-move triggers write `activity_log`; list view + bulk moves |
| 10 | **M12 Inbox — email + SMS** | PRD_M12 | Threads via Realtime, Twilio inbound webhook (signature-verified) + outbound send (meter++), internal notes, canned `/` responses, assignment; *WhatsApp/FB/IG defer to their provider weeks* |
| 11 | **M13 Automations** | PRD_M13 | Drawflow canvas → `nodes/edges` jsonb; ≥5 trigger + ≥8 action node types; executions run as `jobs` with step logs; enable/disable; IF/ELSE + wait |
| 12 | **M14 Calendar & Booking** | PRD_M14 | Public booking page (no-auth read via Edge Fn), availability rules, Google two-way sync (OAuth token → Vault), reminders as cron-enqueued jobs, reschedule/cancel links |
| 13 | **M28 Payments & Invoicing** | PRD_M28 | Invoices CRUD + send, Stripe checkout links, estimate→invoice, subscriptions, Stripe webhook idempotent by event id; revenue rollups |
| 14 | **M44 Admin basics** | PRD_M44 | Super-admin gate (JWT claim), workspace/user list, jobs monitor (reads `public.jobs`), feature flags, audited impersonation |
| 15 | **M08 Dashboard (no Copilot)** | PRD_M08 | KPI strip (Chart.js), activity feed, quick actions, needs-panel — using the reference mockup components; *Copilot deferred to Phase 8* |

## Phase 2 — Acquisition & Sites (Sessions 16–20)

| # | Module | Accept when |
|---|---|---|
| 16 | **M15 Forms & Surveys** | Builder → `schema` jsonb, embeds/popups, conditional logic, routing rules, spam guard; submission → contact + source tags + consent record |
| 17 | **M16 Campaigns** | Email builder (Quill/TipTap-vanilla), broadcasts + drips as fan-out jobs, A/B subjects, unsubscribe compliance (M05), meters++ per send; **requires D-011 (email provider) decided** |
| 18 | **M19 Sites (GrapeJS)** | AI generate → `page_json`, GrapeJS editor, publish path, custom domain + SSL flow, per-page SEO/schema, CRM widget embeds; *write the GrapeJS per-screen spec the session before* |
| 19 | **M20 Funnels** | Step builder on M19 pages, funnel map with per-step conversion, A/B split with winner detection, order forms wired to M28 |
| 20 | **M06 Media Library** | Storage-backed folders, upload, AI auto-tagging (as jobs), usage-tracking backfill (`used_in`), brand collections |

## Phase 3 — SEO & Content (Sessions 21–23) · *requires D-010 (worker runtime) decided*

| # | Module | Accept when |
|---|---|---|
| 21 | **M21 SEO Engine** | Keyword research via Edge Fn (DataForSEO, meter++), collections, rank tracker as daily cron jobs on the worker, audits as `seo.audit.crawl` worker jobs, weekly rank email |
| 22 | **M22 Content/CMS — manual** | Blog manager, revisions, categories/authors, editorial queue, readability/SEO scoring, publish to M19 sites |
| 23 | **M22 auto-blog pipeline** | Full keyword→publish pipeline as chained worker jobs (`blog.generate` on the real worker), schedules via cron, bulk CSV; **PROMPT-LIBRARY doc written before this session** |

## Phase 4 — Social & Pinterest (Sessions 24–25)

| 24 | **M23 Social Planner** — calendar, composer, best-time scheduling, approval flow, blog-to-social repurposing (jobs), posting via cron→jobs; OAuth tokens → Vault |
| 25 | **M24 Pinterest** — pin generator (`pin.render` Sharp.js worker jobs), boards, bulk pins, scheduler, UTM auto-tag, analytics |

## Phase 5 — Commerce & Ops Depth (Sessions 26–29)

| 26 | **M29 Affiliate Hub** — cloaker/redirect Edge Fn + click tracking, Amazon PA-API, network dashboards, AI review writer (jobs) |
| 27 | **M17 Proposals & Contracts** — templates, CRM auto-fill, multi-party e-sign with audit trail, accept→invoice (M28), view analytics |
| 28 | **M18 Projects & Team Ops** — projects, SortableJS task kanban, time tracking, deal-won→project automation (M13 hook) |
| 29 | **M10 Enrichment & Intent** — provider enrichment as jobs (meter: enrichment), visitor de-anon, intent scoring |

## Phase 6 — AI & Client-Facing (Sessions 30–37)

| 30 | **M33 AI Agent Studio** — agent builder, knowledge ingestion → pgvector (ivfflat), web-widget deploy, handoff thresholds; *Copilot-adjacent per-screen spec first* |
| 31 | **M35 Creative Studio** — image gen via Edge Fn (meter: image_gen), brand kit, templates, publish to M23 |
| 32 | **M37 Client Portal** — portal login (`portal_access`), narrowed `sel_client` policies live, approvals + pay-online; **portal leak test is the headline gate** |
| 33 | **M40 Analytics & Report Builder** — KPI overview, custom report builder (Chart.js), saved dashboards, scheduled delivery (cron jobs), white-label PDF |
| 34 | **M26 Local SEO** — GBP mgmt + post scheduler (cron), citations, NAP monitor, map-pack tracking |
| 35 | **M27 Ads & Attribution** — Meta/Google connections (Vault), spend dashboard, UTM→contact→deal close attribution, ROAS |
| 36 | **M30 Reputation** — review request automations, review gate, monitoring, AI replies (jobs), widgets |
| 37 | **M31 Memberships & Courses** — course builder, drip, progress, certificates (PDF jobs), Stripe access control |

## Phase 7 — Platform & Resale (Sessions 38–42) · *revisit D-013 before 41*

| 38 | **M42 White-Label** — custom domains, branding, Stripe Connect plans, rebilling markup (M03), agency dashboard |
| 39 | **M39 Marketplace** — snapshots (workspace config export/import as jobs), listings, 70/30 seller program, one-click install |
| 40 | **M38 Referral Manager** — links, commission models, two-tier, fraud checks, Connect/PayPal payouts |
| 41 | **M34 Voice Agents** — **requires the persistent media service decision (D-013) resolved**; inbound receptionist, booking against M14, transcripts→timeline, voice_minutes meter |
| 42 | **M41 Public API** — API keys (hashed), rate limits, REST surface over RLS-safe queries, webhooks out |

## Phase 8 — Differentiators (Sessions 43–47)

| 43 | **M25 Video Studio** — requires render infra (D-013); script→TTS→visuals→captions pipeline as heavy worker jobs |
| 44 | **M32 Conversational Commerce** — catalog sync, chat cart, checkout links, abandoned-chat recovery |
| 45 | **M36 AI Insights & Churn** — health scoring + churn prediction as scheduled jobs, retention automations, weekly digest |
| 46 | **M43 Mobile Field App** — Capacitor wrapper decision, offline capture queue, card scanner, voice notes |
| 47 | **M08 Copilot (full)** — NL queries over workspace data via pgvector RAG, daily briefing; **Copilot per-screen spec + PROMPT-LIBRARY entries first** |

---

## §deploy appendix (the short ops note — no standalone runbook needed)

- **Frontend:** static deploy per D-009 (Cloudflare Pages + Access vs GitHub Pages — decide before
  first production deploy). Until then, local + Supabase dev project.
- **Migrations:** applied via Supabase CLI in order; never edit a shipped migration.
- **Edge Functions:** deployed via CLI per function; secrets only ever set in Vault.
- **Workers:** per D-010 — GitHub Actions scheduled runners (PublishlyAI pattern) until/unless a
  VPS is chosen; the worker claims from `jobs` exactly per the async contract.
- **Environments:** dev project + prod project in Supabase; no shared databases; leak test runs in
  both before a phase closes.

---

## Rules of the sequence

1. **Dependencies are hard gates** — the table order already respects the Module List's graph.
2. **Sliced modules** (M41, M22, M08) list their slices explicitly; a slice reaches full DoD too.
3. **Open decisions block their sessions, not the project** — D-011 blocks Session 17, D-010
   blocks Phase 3, D-013 blocks Sessions 41/43. Flag, don't improvise.
4. **Per-screen specs** are written the session *before* the four complex UIs: GrapeJS editor
   (→ S.18), Drawflow canvas (→ S.11), Copilot (→ S.47), inbox thread (→ S.10).
5. A session that can't reach DoD splits: close what's green, carry the rest on `TASKS.md`.

---

*AiMindShare.com · Build Sequence v1.0. Session 0 + 47 module sessions across 8 phases. One
module per session, vertical to Done, dependencies as hard gates, open decisions flagged where
they block.*
