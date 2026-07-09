# SCREEN-INVENTORY-AND-IA-v1_0.md — AiMindShare Screens & Information Architecture
### Doc 8 of 14 · **Version 1.0 · 2026-07-02**
**Every screen in the product, its file, its archetype, and where it lives in the navigation.**

> **How to use this file:** before building any UI session, find the module's rows in §6, note
> each screen's **archetype** (§4), and compose it from AIMINDSHARE-DESIGN (doc 7) components.
> If a screen isn't in this inventory, it doesn't exist yet — add it here first (docs-first law).

---

## 1. CONVENTIONS

**Vanilla static front end (D-001) — one HTML file per screen, no client router.**

| Convention | Rule |
|---|---|
| File naming | kebab-case, one screen = one file: `/app/contacts.html` |
| Entity screens | query param: `/app/contact.html?id=<uuid>`. JS reads `id`, loads via Supabase, renders honest not-found state if missing |
| Sub-resources | tabs within the entity screen, `#hash` for deep-linking a tab: `contact.html?id=…#tasks` |
| Active workspace | held in session state (localStorage + Supabase session), **not** in the URL — PublishlyAI pattern. Switching workspace reloads the current screen |
| Surfaces (§2) | each surface is a folder: `/auth/`, `/app/`, `/agency/`, `/portal/`, `/p/` (public), `/ops/` (admin) |
| Overlays ≠ screens | drawers, modals, wizards, the ⌘K palette, Copilot and Jobs panels are **components on a host screen**, not files. They're listed in §5 |
| Auth gating | every `/app`, `/agency`, `/portal`, `/ops` page runs the standard auth preamble before render; `/p/*` pages are tokenized/public and never load the app shell |
| Hosting note | folder/deep-link behavior is compatible with both D-009 candidates; nothing here blocks that OPEN call |

---

## 2. SURFACES — six distinct shells

| # | Surface | Path | Shell | Who |
|---|---|---|---|---|
| S1 | **Auth** | `/auth/` | Centered card (max-width 420px), radial-wash background, logo top — no rail | Everyone, logged out |
| S2 | **App** | `/app/` | Full shell (doc 7 §7): rail + topbar + atmosphere | Workspace users (Owner→Staff) |
| S3 | **Agency** | `/agency/` | Same shell, agency-scoped rail (§3.2), eyebrow badge reads `AGENCY` | Agency Owner/Admin |
| S4 | **Client Portal** (M37) | `/portal/` | Own slim shell: workspace-branded topbar + simple left nav, **no** AiMindShare atmosphere, white-label ready | Client role only — strict isolation |
| S5 | **Public** | `/p/` | No shell. Calm page: `--bg` + radial washes only. Booking, forms, signing, paying, unsubscribing | Anonymous / tokenized |
| S6 | **Ops** (M44) | `/ops/` | App shell, danger-tinted eyebrow `PLATFORM OPS`, super-admin only | Platform staff |

Sites/funnels/courses *built by* customers (M19/M20/M31 output) are rendered products, not
AiMindShare screens — they carry the customer's branding and are out of this inventory except
for their editors.

---

## 3. NAVIGATION

### 3.1 App rail (S2) — groups and items, top to bottom

Mirrors the mockup's `.nav-group` pattern. Items appear only when the module's phase has shipped;
the group ships when its first item does.

| Group label | Items → screen |
|---|---|
| **Overview** | Dashboard → `app/index.html` (M08) |
| **CRM** | Contacts → `contacts.html` · Companies → `companies.html` · Tasks → `tasks.html` (M09) · Visitors → `visitors.html` (M10, P2) |
| **Sales** | Pipeline → `pipeline.html` (M11) · Documents → `documents.html` (M17) · Projects → `projects.html` (M18) |
| **Conversations** | Inbox → `inbox.html` (M12) · Calendar → `calendar.html` (M14) |
| **Marketing** | Campaigns → `campaigns.html` (M16) · Forms → `forms.html` (M15) · Automations → `automations.html` (M13) |
| **Web** | Sites → `sites.html` (M19) · Funnels → `funnels.html` (M20) |
| **Content & SEO** | Content → `content.html` (M22) · SEO → `seo.html` (M21) · Local SEO → `local-seo.html` (M26) · Social → `social.html` (M23) · Pinterest → `pinterest.html` (M24) · Video → `video.html` (M25, P3) |
| **Commerce** | Payments → `invoices.html` (M28) · Affiliate Hub → `affiliate.html` (M29) · Reputation → `reputation.html` (M30) · Courses → `courses.html` (M31) · Chat Commerce → `chat-commerce.html` (M32, P3) · Ads → `ads.html` (M27) |
| **AI** | Agents → `agents.html` (M33) · Voice → `voice.html` (M34, P2) · Creative Studio → `creative.html` (M35) · Insights → `insights.html` (M36, P3) |
| **Analytics** | Analytics → `analytics.html` · Report Builder → `report-builder.html` (M40) |
| **Settings** | Settings → `settings/general.html` (hub for all §6 settings screens) |

Rail order is a **usage** order (daily-driver groups high), not build order. ≤1100px it collapses
to the 64px icon rail; ≤760px it becomes a drawer.

### 3.2 Agency rail (S3)

| Group | Items |
|---|---|
| **Agency** | Overview → `agency/index.html` (M42 dashboard: sub-accounts, MRR, usage, health) · Workspaces → `agency/workspaces.html` (M01 list + provision) |
| **Revenue** | Plans & Pricing → `agency/plans.html` (M42) · Rebilling → `agency/rebilling.html` (M03 markup engine) · Referral Program → `agency/referrals.html` (M38) |
| **Brand** | White-Label → `agency/branding.html` (M42) · Marketplace → `agency/marketplace.html` + `agency/snapshots.html` (M39) |
| **Support** | Support Desk → `agency/support.html` (M42) |

Workspace switcher lives in the topbar on both S2 and S3 (avatar-adjacent dropdown; M01).

### 3.3 Topbar (all of S2/S3)

Search pill (opens ⌘K palette) · `.jobs-chip` (opens Jobs panel — D-003 queue, every screen) ·
Notifications `.iconbtn` (M04 panel) · Copilot `.iconbtn` with `--grad-ai` orb (M08 panel, P2) ·
theme toggle · avatar menu (profile, security, workspace switch, logout).

---

## 4. SCREEN ARCHETYPES — build recipes

Every screen in §6 declares one archetype. An archetype is a fixed composition of doc 7
components — reuse it, don't redesign it.

| Code | Archetype | Recipe (doc 7 components) |
|---|---|---|
| **A1** | Dashboard | page-head → kpi-strip → needs-panel (if actionable items exist) → pipe-mini (if staged data) → cc-grid of panels (data-rows / opp-cards / rec-cards) |
| **A2** | List / Table | page-head (compact) → filter bar (inputs + pills) → table or row-list → pagination (mono) → bulk-action bar on selection → "New" btn-primary opening drawer/modal |
| **A3** | Detail + Tabs | compact head (serif title, pills, actions) → tab row → tab panes (fields grid, timeline row-list, sub-tables). Timeline rows = data-row with type icon squares |
| **A4** | Kanban | page-head → board toolbar (switcher, forecast/progress bar, filters, view toggle) → horizontal-scroll columns (SortableJS) of kanban cards → detail drawer |
| **A5** | Canvas / Builder | full-bleed workspace (no content max-width): left palette panel → canvas (Drawflow / GrapeJS) → right inspector drawer → sticky save/publish bar. Glass-light or none on canvas |
| **A6** | Calendar | page-head → month/week/day toggle (tabs) → calendar grid (`--line` hairlines, event chips = pills) → event drawer |
| **A7** | Three-pane Inbox | list pane (conversation rows + channel icon chips) · thread pane (bubbles; internal notes gold-tinted) · context pane (contact summary card). Panes collapse right-to-left ≤960px |
| **A8** | Settings Form | narrow content (max 720px) → section panels of labeled inputs → sticky save bar. Destructive zone at bottom with `--status-danger` ghost buttons |
| **A9** | Wizard | modal or full-screen steps: numbered step rail → one panel per step → back/next btn row → final review step. (CSV import, A2P registration, snapshot install) |
| **A10** | Public page | S5 shell: single centered card or clean document canvas, workspace branding, one primary CTA, no AiMindShare chrome |
| **A11** | Gallery / Grid | page-head → filter pills → responsive card grid (media/template cards: image, serif title, meta, tag chips) → detail modal |
| **A12** | Doc Editor | full-height editor canvas (TipTap/Quill per D-005, no glass) → right settings drawer → top actions bar with status pill |

---

## 5. GLOBAL OVERLAYS (components, not files)

| Overlay | Host | Module | Notes |
|---|---|---|---|
| ⌘K command palette | every S2/S3 screen | shell | glass deep; screens + actions; kbd hints mono |
| Jobs panel | every S2/S3 screen | D-003 | queue depth, running/failed jobs, retry action; failed rows link into module context |
| Notifications panel | every S2/S3 screen | M04 | feed rows + preferences link |
| AI Copilot panel | every S2/S3 screen (P2) | M08 | `--grad-ai` orb header; chat over workspace data |
| Media picker | any screen with an image field | M06 | modal version of the M06 library |
| Workspace switcher | topbar | M01 | dropdown, opaque `--card-solid` |
| Contact/deal quick-drawer | cross-module | M09/M11 | any contact/deal reference opens the drawer without leaving the screen |
| Upgrade/limit banner | any gated feature | M03 | gold-heavy needs-panel style, `.btn-gold` |

---

## 6. FULL SCREEN INVENTORY — by module

Columns: screen · file · archetype · phase · notes. Overlays from §5 aren't repeated.
⭐ = starred differentiator module.

### L0 — Foundation

**M00 · Auth & Identity** *(Phase 1, S1)*
| Screen | File | Arch | Notes |
|---|---|---|---|
| Login | `auth/login.html` | A10 | email/password, Google, magic-link toggle |
| Signup | `auth/signup.html` | A10 | strength meter, ToS |
| 2FA step | `auth/2fa.html` | A10 | 6-digit auto-advance boxes (mono), backup-code fallback |
| Verify email | `auth/verify-email.html` | A10 | success/error/resend-with-cooldown states |
| Forgot / Reset password | `auth/forgot-password.html` · `auth/reset-password.html` | A10 | always-success confirm; expired-token state |
| Accept invite | `auth/invite.html?token=` | A10 | locked email, set name+password |
| Profile · Security | `app/settings/profile.html` · `app/settings/security.html` | A8 | avatar; password card, 2FA wizard (A9 modal), active-sessions table |

**M01 · Workspaces** *(Phase 1)* — Workspaces list+provision `agency/workspaces.html` (A2, "provision from snapshot" option ties M39) · Workspace settings `app/settings/workspace.html` (A8) · switcher = overlay.

**M02 · Roles & Permissions** *(Phase 1)* — Team `app/settings/team.html` (A2: members table, role pills, invite modal, per-module permission matrix drawer).

**M03 · Billing & Usage** *(Phase 1)* — Billing & Usage `app/settings/billing.html` (A8+A1 hybrid: plan card, usage meters as progress bars w/ 80/95% warning colors, credit wallet, invoices table) · Agency rebilling `agency/rebilling.html` (A8: markup engine config). Detail spec: doc 11.

**M04 · Notifications** *(Phase 1)* — panel = overlay · Preferences `app/settings/notifications.html` (A8: per-event channel matrix, digest schedule).

**M05 · Compliance ⭐** *(Phase 1)* — Compliance Center `app/settings/compliance.html` (A2 hub: A2P 10DLC registration **wizard** (A9) with status pills, consent/opt-in log table, DSR queue with due-date pills, right-to-be-forgotten action) · Cookie-consent config for built sites lives in M19 site settings.

**M06 · Media Library ⭐** *(Phase 2)* — Media `app/media.html` (A11: folder tree rail-within-content, asset grid, AI-tag chips, usage-tracking drawer "used in 3 pins, 1 site") · picker = overlay.

**M07 · Audit & Settings** *(Phase 1)* — General `app/settings/general.html` (A8 hub: timezone/currency/locale/branding basics + links to every settings screen) · Audit log `app/settings/audit.html` (A2: filterable event table, login history tab, export).

### L1 — Core Ops

**M08 · Dashboard & Copilot ⭐** *(Phase 1 + 6)* — **Dashboard `app/index.html` (A1)** — the direct AiMindShare analog of the reference mockup: KPI strip (contacts, pipeline value, revenue 30d, bookings, jobs running, +1 gold featured), needs-panel (approvals, failed jobs, expiring documents), pipe-mini (primary pipeline), panels: recent activity rows, today's tasks, AI recommendations (rec-cards) · Copilot = overlay (P2).

**M09 · CRM** *(Phase 1)*
| Screen | File | Arch | Notes |
|---|---|---|---|
| Contacts | `app/contacts.html` | A2 | search, filter panel, saved smart-list rail, bulk bar, column chooser; New Contact drawer |
| Contact detail | `app/contact.html?id=` | A3 | header (avatar, score pill, tags, assignee) · tabs Overview/Activity/Notes/Tasks/Emails/Deals |
| Companies / Company | `app/companies.html` · `app/company.html?id=` | A2 / A3 | linked contacts table |
| Tasks | `app/tasks.html` | A2 | my-tasks across contacts, due-date pills |
| Fields · Tags · Scoring | `app/settings/fields.html` · `tags.html` · `scoring.html` | A8 | custom-field builder; scoring rules table |
| Smart-list builder | drawer on contacts | — | AND/OR condition groups |
| CSV import | wizard (A9) on contacts | — | upload → map columns → preview/progress; row-level error report |

**M10 · Enrichment & Intent ⭐** *(Phase 5)* — Visitors `app/visitors.html` (A2: de-anonymized companies, intent-score opp-cards) · enrichment tab inside contact detail · credits meter ties to M03 billing screen.

**M11 · Pipeline** *(Phase 1)* — **Pipeline `app/pipeline.html` (A4)**: switcher, weighted forecast bar vs monthly target, Kanban (SortableJS) / list toggle, filters, Add Deal modal, deal drawer (Overview/Notes/Files/Activity; Won/Lost with required reason) · Pipeline editor `app/settings/pipelines.html` (A8: stage drag-reorder, probability sliders).

**M12 · Inbox** *(Phase 1)* — **Inbox `app/inbox.html` (A7)**: channel chips (email/SMS/WA/FB/IG/chat), status pills, assignment, gold internal notes, "/" canned responses, AI auto-reply toggle (grad-ai orb), realtime via Supabase Realtime (D-005).

**M13 · Automations** *(Phase 1)* — Automations `app/automations.html` (A2: list w/ enable toggles, run stats mono, template gallery A11 modal) · Automation editor `app/automation.html?id=` (A5: **Drawflow** canvas per D-005, trigger/action/condition node palette, right inspector, execution-log tab with per-node status pills, AI-builder prompt box).

**M14 · Calendar & Booking** *(Phase 1)* — Calendar `app/calendar.html` (A6) · Calendar types & availability `app/settings/calendars.html` (A8: 1:1/round-robin/group/class, questions, reminders, paid-booking toggle) · **Public booking `p/book.html?c=<slug>` (A10)**: slot picker, questions, Stripe pay step, confirm/reschedule/cancel states.

**M15 · Forms & Surveys** *(Phase 2)* — Forms `app/forms.html` (A2 + submissions count) · Form builder `app/form.html?id=` (A5: field palette, conditional logic, multi-step, routing rules; embed/popup snippet modal) · Submissions tab in builder (A2) · Public form `p/form.html?f=` (A10) + embed script.

**M16 · Campaigns** *(Phase 2)* — Campaigns `app/campaigns.html` (A2: broadcasts + sequences, status pills, revenue column mono) · Campaign editor `app/campaign.html?id=` (A12/A5: email builder, mixed email+SMS sequence steps as pipe-mini-style rail, A/B setup, spam-score meter, AI copywriter panel) · Template gallery (A11 modal, 60+ niche) · Campaign analytics tab (Chart.js) · Public `p/unsubscribe.html?t=` (A10).

**M17 · Proposals & Contracts ⭐** *(Phase 5)* — Documents `app/documents.html` (A2: status pills draft→sent→viewed→signed, analytics glance) · Document builder `app/document-edit.html?id=` (A12: TipTap blocks — pricing table, signature blocks, tokens; signer manager drawer) · Document detail `app/document.html?id=` (A3: status timeline, per-signer state, per-section view-time analytics, event log) · **Public signing `p/sign.html?t=` (A10)**: clean doc render, live-total pricing options, signature modal, decline-with-reason.

**M18 · Projects & Team Ops ⭐** *(Phase 5)* — Projects `app/projects.html` (A2 + capacity bars) · Project detail `app/project.html?id=` (A4: team Kanban, time tracking mono timers, deliverable deadlines, template picker) · links into M37 portal tasks.

### L2 — Growth

**M19 · Sites** *(Phase 2)* — Sites `app/sites.html` (A11: site cards w/ domain + SSL pills) · **Site editor `app/site-editor.html?id=` (A5: GrapeJS** per D-005, AI-generate wizard A9, global styles drawer, mobile breakpoint toggle, per-page SEO drawer) · Site settings `app/site.html?id=` (A8: domains, SSL, cookie consent M05, script injection).

**M20 · Funnels** *(Phase 2)* — Funnels `app/funnels.html` (A2) · Funnel map `app/funnel.html?id=` (A4-variant: step cards in flow order w/ per-step conversion mono %, pipe-mini summary, A/B winner pills; step edit → GrapeJS A5; order-form/upsell/bump config drawers).

**M21 · SEO Engine** *(Phase 3)* — Keyword research `app/seo.html` (A2: volume/CPC/difficulty/intent columns all mono, question finder tab, collections rail) · Rank tracker `app/rank-tracker.html` (A2 + Chart.js trend, featured-snippet pills, 500-kw meter) · Site audits `app/audits.html` (A2 crawl list) + Audit report `app/audit.html?id=` (A3: issues by severity pills, Core Web Vitals mono gauges).

**M22 · Content / CMS** *(Phase 3)* — Content `app/content.html` (A2: article table, content_status pills, pipe-mini of pipeline stages keyword→brief→draft→review→published) · Article editor `app/article.html?id=` (A12: TipTap, SEO+readability score panel, internal-link suggester, featured image via M35, schema tab) · Review queue `app/content-review.html` (A2, approve/reject) · Schedules & bulk CSV `app/content-settings.html` (A8/A9).

**M23 · Social Planner** *(Phase 4)* — Social `app/social.html` (A6: month/week/day calendar, platform chips) · Composer drawer (multi-platform variants, best-time AI, hashtag generator) · Approvals tab (A2) · Analytics tab (Chart.js) · blog-to-social repurposing action from M22.

**M24 · Pinterest** *(Phase 4)* — Pinterest `app/pinterest.html` (A3 hub: Pin generator tab — keyword/URL → 5 titles+descriptions+rendered 1000×1500 previews grid; Boards A11; Scheduler A6-lite; Analytics mono tables; 12 design templates gallery).

**M25 · Video Studio ⭐** *(Phase 8, D-013 infra OPEN)* — Video `app/video.html` (A2 renders queue + A5 studio: script panel, voiceover picker, scene strip, caption style, 9:16/1:1/16:9 toggles).

**M26 · Local SEO** *(Phase 6)* — Local SEO `app/local-seo.html` (A3 hub: GBP posts/photos/Q&A tabs, post scheduler, citation builder table w/ NAP-consistency pills, map-pack rank tracker, competitor GBP compare).

**M27 · Ads & Attribution** *(Phase 6)* — Ads `app/ads.html` (A1+A2: unified spend KPI strip, ROAS mono, campaign tables, creative ranking cards, budget-pacing alerts as needs-items, white-label PDF export action).

### L3 — Commerce

**M28 · Payments & Invoicing** *(Phase 1)* — Invoices `app/invoices.html` (A2: status pills, receivables KPI mini-strip) · Invoice editor `app/invoice-edit.html?id=` (A12: line items, tax, branding preview) · Subscriptions `app/subscriptions.html` (A2) · Checkout links & order forms `app/checkout-links.html` (A2 + bump/upsell config drawer) · Revenue reports tab (Chart.js, MRR mono) · **Public pay `p/pay.html?t=` / estimate view `p/estimate.html?t=` (A10)** — Stripe elements, multi-currency.

**M29 · Affiliate Hub** *(Phase 5)* — Affiliate `app/affiliate.html` (A1 command center: earnings-by-network KPI strip, link table w/ click sparklines, health pills) · Links `app/affiliate-links.html` (A2: cloaker, A/B tests, QR) · Amazon tools `app/affiliate-amazon.html` (A2: PA-API search, comparison-table builder, price/stock alert pills) · Opportunity finder tab (opp-cards).

**M30 · Reputation** *(Phase 6)* — Reputation `app/reputation.html` (A3 hub: review stream w/ sentiment pills + AI-reply grad-ai action, request automation config A8, review-gate setup, widgets gallery A11, sentiment trend Chart.js, competitor tracking).

**M31 · Memberships & Courses** *(Phase 6)* — Courses `app/courses.html` (A11) · Course builder `app/course-builder.html?id=` (A5: section/lesson tree, drip rules, quiz builder, certificate template) · Students `app/students.html` (A2: progress bars, grading queue) · **Learner surface `p/learn/*` (A10 shell of its own, workspace-branded): catalog, course player, community Q&A** — access-controlled via Stripe entitlements.

**M32 · Conversational Commerce ⭐** *(Phase 8)* — Chat Commerce `app/chat-commerce.html` (A3 hub: product catalog A11 synced to WA/IG, carts-in-progress table, orders, abandoned-chat recovery automation link).

### L4 — AI

**M33 · AI Agent Studio** *(Phase 6)* — Agents `app/agents.html` (A11: agent cards with grad-ai orbs) · Agent builder `app/agent.html?id=` (A3: Personality/Knowledge (pgvector ingestion table w/ processing pills)/Flows/Deploy (widget/SMS/WA/Messenger snippets)/Analytics tabs, niche-pack gallery, human-handoff threshold) · test-chat drawer.

**M34 · Voice Agents ⭐** *(Phase 7, D-013 infra OPEN)* — Voice `app/voice.html` (A3 hub: numbers, inbound/outbound agent configs, call log w/ transcripts + sentiment pills, recordings, compliance disclosures M05, per-minute meter M03).

**M35 · Creative Studio** *(Phase 6)* — Creative `app/creative.html` (A5/A11: prompt box + purpose/size/style pickers → 4-variation grid, refine/upscale, recent gallery, "Use in…" actions) · Brand kit `app/settings/brand.html` (A8: logo, palette — customer's colors, not ours, shown as swatch data, fonts, voice) · Template editor + 200-template gallery (A11).

**M36 · AI Insights & Churn ⭐** *(Phase 8)* — Insights `app/insights.html` / agency variant (A1: health-score KPI strip, churn-risk opp-cards ranked, anomaly needs-items "open rates dropped 40%", retention-workflow triggers, weekly digest config).

### L5 — Platform

**M37 · Client Portal** *(Phase 6, S4)* — `portal/index.html` (A1 lite: traffic/leads/pipeline/ranking cards) · `portal/approvals.html` (A2: blog + social approve/reject) · `portal/invoices.html` (A2 + pay) · `portal/tasks.html` (A2 + file upload) · `portal/reports.html` (branded) · `portal/files.html` (A11 brand assets) · `portal/messages.html` (A7 single-thread). Strict RLS isolation; workspace branding from M42.

**M38 · Referral Manager** *(Phase 7)* — Program config `agency/referrals.html` (A8: commission models, two-tier, fraud rules) + leaderboard/payouts tabs (A2, Stripe Connect) · **Affiliate-facing dashboard `p/affiliate.html?token=` (A10+A1 lite: link, clicks/conversions mono, promo asset gallery, payout history)**.

**M39 · Marketplace** *(Phase 7)* — Browse `agency/marketplace.html` (A11: listings w/ ratings, category filters) · Listing `agency/listing.html?slug=` (A3: screenshots, component manifest counts mono, reviews, purchase) · My snapshots `agency/snapshots.html` (A2 + export wizard A9 component-checklist + install wizard A9 w/ dry-run & conflict preview) · Seller dashboard `agency/seller.html` (A1: sales, earnings, payouts, review responses).

**M40 · Analytics & Reports** *(Phase 6)* — Analytics `app/analytics.html` (A1 master: KPI strip + traffic/leads/pipeline/campaign/social/affiliate panel tabs, period comparison, Chart.js) · Report builder `app/report-builder.html` (A5: metric × dimension × chart-type palette onto canvas grid) · Saved reports `app/reports.html` (A2: schedules, white-label PDF/HTML export, CSV).

**M41 · Integrations Hub ⭐** *(Phase 1 vault / 7 API)* — Integrations `app/settings/integrations.html` (A2: provider cards w/ health pills, OAuth connect flows, Vault-backed credential forms — secrets never echoed) · Webhooks `app/settings/webhooks.html` (A2 in/out + delivery log) · API keys `app/settings/api-keys.html` (A2, one-time-reveal mono keys, rate-limit meters).

**M42 · White-Label SaaS** *(Phase 7)* — Agency overview `agency/index.html` (A1: sub-accounts, MRR, usage, health pills) · Branding `agency/branding.html` (A8: logo/colors/name/favicon/custom domain — themes the S2/S4 shells via CSS-variable override layer *on top of* tokens.css, never editing it) · Plans `agency/plans.html` (A8: Stripe Connect pricing, feature gating matrix) · Support desk `agency/support.html` (A7 lite).

**M43 · Mobile Field App ⭐** *(Phase 8)* — Capacitor app, not a web surface; its screens (offline capture, card scanner, tap-to-pay, route planner) reuse tokens.css + component recipes but are specced in a future mobile doc. Out of this inventory's file table.

**M44 · Admin & Platform Ops** *(Phase 1 basic, S6)* — `ops/index.html` (A1: platform KPIs, error-rate needs-panel) · `ops/users.html` · `ops/workspaces.html` (A2, plan-enforcement pills, impersonate-with-audit action) · `ops/jobs.html` (A2: jobs table live view — D-003's control plane: queued/running/failed pills, retry, `pg_cron` schedule registry tab) · `ops/errors.html` (A2) · `ops/flags.html` (A8 feature flags) · `ops/health.html` (A1 DB/storage/edge-function health).

---

## 7. COUNTS & COVERAGE

| Surface | Screens (files) |
|---|---|
| S1 Auth | 7 |
| S2 App | ~68 (incl. 16 settings screens) |
| S3 Agency | 12 |
| S4 Portal | 7 |
| S5 Public | 9 (+ learner surface) |
| S6 Ops | 7 |
| **Total** | **~110 screens** · 12 archetypes · 8 global overlays |

Every screen resolves to one archetype; every archetype resolves to doc 7 components; every
component resolves to tokens.css. That chain is the whole point — if a build session finds a
screen that doesn't fit an archetype, that's a doc 8 amendment first, code second.

---

## 8. PER-SCREEN DoD HOOKS (feeds doc 9)

- Screen file exists at the §6 path; auth preamble present for its surface
- Archetype recipe followed; doc 7 pre-build checklist passes
- Eyebrow carries the correct module ID; rail item active-state correct
- Entity screens handle: loading (skeleton pulse) → not-found → empty → populated
- Jobs-chip reflects any job this screen enqueues (browser writes `queued` only — D-003)
- Both themes verified; 1100/960/760 breakpoints verified

---

*SCREEN-INVENTORY-AND-IA v1.0 · Doc 8 of 14 · Depends on Doc 7 · Sources: Master Module List v3,
module PRDs M00–M44, publishlyai-command-center.html · Bound by DECISIONS D-001–D-008.*
