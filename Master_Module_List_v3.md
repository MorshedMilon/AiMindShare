# Master Module List v3 — AI-Powered All-in-One CRM & Growth Platform
**Version:** 3.0 | **Date:** July 2, 2026 | **Status:** Claude Code Ready
**Combines:** Original PRD (23 modules) + Futuristic Additions (12 modules) + Layered Architecture (Perplexity v2)

---

## How to Use This Document with Claude Code

1. Build **strictly in layer order**: Foundation → Core Ops → Growth → Commerce → AI → Platform.
2. Feed Claude Code **one module at a time**, pasting the module block + the Master System Prompt from PRD Section 32.
3. Every module assumes multi-tenancy: **all queries filtered by `workspace_id`**.
4. Modules marked ⭐ are new futuristic differentiators not found in GoHighLevel/LeadStack.
5. Priority key: **P0** = MVP-critical, **P1** = launch, **P2** = growth, **P3** = scale/differentiation.

---

# LAYER 0 — FOUNDATION
*Everything else depends on this layer. Build first, build carefully.*

### M00 — Auth & Identity
**Purpose:** Secure login, sessions, and identity for all users across all workspaces.
**Submodules:** Email/password auth · OAuth (Google) · Magic links · 2FA · Session management · Password reset
**Depends on:** — | **Priority:** P0 | **Phase:** 1

### M01 — Workspaces & Multi-Tenancy
**Purpose:** Agency → Sub-account → User hierarchy with complete data isolation.
**Submodules:** Agency accounts · Sub-account workspaces · Workspace switching · Data isolation middleware · Workspace provisioning
**Depends on:** M00 | **Priority:** P0 | **Phase:** 1

### M02 — Roles & Permissions
**Purpose:** Role-based access control at agency, workspace, and module levels.
**Submodules:** Role definitions (Owner/Admin/Manager/Staff/Client) · Per-module permissions · Permission middleware · Invitation system
**Depends on:** M00, M01 | **Priority:** P0 | **Phase:** 1

### M03 — Billing, Plans & Usage Metering
**Purpose:** Platform subscription billing plus usage-based rebilling (SMS, email, AI tokens, SEO API calls) with configurable markup.
**Submodules:** Stripe subscriptions · Plan tiers & feature gating · Usage meters (per-workspace counters) · Rebilling markup engine · Overage alerts · Credit wallets
**Depends on:** M01 | **Priority:** P0 | **Phase:** 1

### M04 — Notifications Center
**Purpose:** Unified in-app, email, and push notification system used by every module.
**Submodules:** In-app notification feed · Email notifications · Push (mobile) · Notification preferences · Digest scheduling
**Depends on:** M01 | **Priority:** P0 | **Phase:** 1

### M05 — Compliance & Consent Center ⭐
**Purpose:** Keep every workspace legally safe — the unglamorous module that unblocks everything SMS/email-related.
**Submodules:** A2P 10DLC registration workflow (Twilio) · GDPR/CCPA data request handling · Cookie consent manager for built sites · SMS/email opt-in records · Right-to-be-forgotten automation · Audit-ready consent logs
**Depends on:** M01 | **Priority:** P0 | **Phase:** 1
**Why it matters:** Agencies get blocked on A2P registration constantly. Building this early prevents the #1 support headache in white-label CRM platforms.

### M06 — Media Library & Asset Manager ⭐
**Purpose:** Central file/image/video store shared by Sites, Content, Creative, Social, Portal, and Agents.
**Submodules:** Folder organization · Image/video/PDF upload (R2) · AI auto-tagging of assets · Usage tracking (which asset used where) · Brand asset collections · CDN delivery
**Depends on:** M01 | **Priority:** P1 | **Phase:** 1

### M07 — Audit Logs & Platform Settings
**Purpose:** Who did what, when — plus global workspace configuration.
**Submodules:** Action audit trail · Login history · Settings pages (timezone, currency, locale, branding basics) · Data export tools
**Depends on:** M01, M02 | **Priority:** P1 | **Phase:** 1

---

# LAYER 1 — CORE OPS
*The daily-driver CRM engine. This is what users live in.*

### M08 — Dashboard & AI Copilot ⭐
**Purpose:** Executive overview + an always-available AI Copilot bar across the whole platform.
**Submodules:** KPI cards (contacts, pipeline value, revenue, rankings, impressions) · Recent activity feed · Quick actions · **AI Copilot:** natural-language queries over workspace data ("Which leads should I call today?", "Why did open rates drop?", "Draft a follow-up for this deal") · Daily AI briefing email
**Depends on:** M09–M16 (reads their data), pgvector RAG | **Priority:** P1 (dashboard P0, Copilot P2) | **Phase:** 1 + 6
**Futuristic angle:** Copilot is the 2026-standard expectation — a single conversational entry point to the entire platform.

### M09 — CRM
**Purpose:** Single source of truth for every contact and company.
**Submodules:** Contacts · Companies · Tags · Custom fields · Smart lists (AND/OR builder) · Notes & @mentions · Tasks · Activity timeline · Lead scoring · Duplicate detection · CSV import/export · Bulk actions · UTM source tracking
**Depends on:** M01, M02 | **Priority:** P0 | **Phase:** 1

### M10 — Lead Enrichment & Intent Engine ⭐
**Purpose:** Turn thin form-fills into rich profiles automatically; identify anonymous website visitors.
**Submodules:** Company enrichment (size, revenue, industry, tech stack via Apollo/Clearbit-style API) · Social profile matching · Website visitor de-anonymization (company-level) · Intent scoring (pages visited × recency) · Enrichment credits metering (ties to M03)
**Depends on:** M09, M03 | **Priority:** P2 | **Phase:** 5
**Futuristic angle:** Strengthens Stage 3 (Enrich) of the master workflow — the thinnest stage in the original PRD.

### M11 — Pipeline
**Purpose:** Visual deal tracking with stage-based automation triggers.
**Submodules:** Multiple pipelines · Kanban drag-and-drop · Deal drawer (Overview/Notes/Files/Activity) · Win/Loss + reasons · Revenue forecasting (weighted) · Stage automation triggers · List view · Bulk stage moves
**Depends on:** M09 | **Priority:** P0 | **Phase:** 1

### M12 — Inbox (Omnichannel)
**Purpose:** Every conversation with every contact in one thread, regardless of channel.
**Submodules:** Email (Gmail OAuth/SMTP) · Two-way SMS (Twilio) · WhatsApp (Meta Cloud API) · Facebook/Instagram DM · Live chat widget · Missed call → auto-SMS · Internal notes · Canned responses ("/" shortcuts) · AI auto-reply mode · Assignment & status · Realtime (Pusher) · Full-text search
**Depends on:** M09, M05 (opt-in compliance) | **Priority:** P0 | **Phase:** 1

### M13 — Automations
**Purpose:** Visual no-code workflow engine — the nervous system connecting every module.
**Submodules:** React Flow canvas builder · Trigger nodes (11+ types) · Action nodes (17+ types) · IF/ELSE conditions · Wait/delay · Webhook in/out · AI workflow builder (describe in English → node JSON) · 15 pre-built templates · Execution logs · Enable/disable
**Depends on:** M09, M11, M12, BullMQ | **Priority:** P0 | **Phase:** 1

### M14 — Calendar & Booking
**Purpose:** Calendly replacement wired directly into CRM and automations.
**Submodules:** Public booking pages · Availability rules · One-on-one / round-robin / group / class types · Pre-booking questions · Google Calendar two-way sync · SMS+email reminders · Self-service reschedule/cancel · Paid bookings (Stripe) · No-show tracking → rebooking workflow · Embed widget
**Depends on:** M09, M13, M28 | **Priority:** P0 | **Phase:** 1

### M15 — Forms & Surveys
**Purpose:** The acquisition layer — every form, survey, quiz, and popup that creates contacts.
**Submodules:** Drag-and-drop form builder · Surveys · Scored quizzes (lead magnets) · Multi-step forms · Popups & embeds · Conditional logic · Lead routing rules · Spam protection · Submission → contact creation with source tags
**Depends on:** M09, M13 | **Priority:** P0 | **Phase:** 2

### M16 — Campaigns (Email + SMS Unified)
**Purpose:** One campaign framework, multiple delivery channels — replaces Mailchimp/ActiveCampaign.
**Submodules:** Drag-and-drop email builder · Broadcasts · Drip sequences (mixed email+SMS steps) · A/B subject testing · 60+ niche templates · Personalization tokens · Segmentation by tag/smart list · Unsubscribe compliance · Spam score checker · AI copywriter · Campaign analytics + revenue attribution
**Depends on:** M09, M13, M05 | **Priority:** P0 | **Phase:** 2

### M17 — Proposals & Contracts ⭐
**Purpose:** Full document workflow replacing PandaDoc/DocuSign — from quote to signed contract to invoice.
**Submodules:** Proposal templates · Quote calculators · Contract/NDA templates · CRM field auto-fill · Multi-party e-signature · Signing audit trail · Accept → auto-convert to invoice (M28) · Expiry & reminder automation · Client viewing analytics (opened, time on page)
**Depends on:** M09, M28 | **Priority:** P1 | **Phase:** 5

### M18 — Projects & Team Ops ⭐
**Purpose:** Internal work management for the agency team — closes the gap between "deal won" and "delivered."
**Submodules:** Projects per client/workspace · Team Kanban tasks · Time tracking · Capacity planning · Deliverable deadlines · Templates per service type · Links to Client Portal tasks (M37) · Deal-won → auto-create project workflow
**Depends on:** M09, M11, M13 | **Priority:** P2 | **Phase:** 5

---

# LAYER 2 — GROWTH
*Traffic, content, and visibility engines.*

### M19 — Sites (AI Website Builder)
**Purpose:** Text-to-website AI generation plus a full Craft.js drag-and-drop editor.
**Submodules:** AI generation (describe → full site) · URL-to-clone · Voice prompt building · Craft.js editor (sections/rows/columns/elements) · Global styles · Mobile breakpoint editing · Custom domains + auto-SSL · Per-page SEO + schema injection · Template gallery · CRM deep integration (forms, chat, calendar widgets)
**Depends on:** M06, M15, M14, M12 | **Priority:** P0 | **Phase:** 2

### M20 — Funnels
**Purpose:** Multi-step conversion flows replacing ClickFunnels.
**Submodules:** Funnel step builder (opt-in → sales → order → upsell → thank-you) · Visual funnel map with per-step conversion rates · A/B split testing with statistical winner detection · Order forms · One-click upsells · Bump offers
**Depends on:** M19, M28 | **Priority:** P1 | **Phase:** 2

### M21 — SEO Engine
**Purpose:** Semrush-lite — research, tracking, and audits (research/ranking only; publishing lives in M22).
**Submodules:** Keyword research (volume, CPC, difficulty, intent via DataForSEO) · Related keywords + question finder · Long-tail generator · SERP analysis (SerpApi) · Competitor gap · Keyword collections · Rank tracker (500 keywords, daily) · Featured snippet tracking · Technical audits (500-page crawl) · Core Web Vitals · Weekly rank report email
**Depends on:** M41 (API credentials) | **Priority:** P1 | **Phase:** 3

### M22 — Content / CMS
**Purpose:** The article library and AI auto-blogging engine — drafting, publishing, and the full content pipeline.
**Submodules:** Blog manager (drafts, revisions, categories, tags, authors) · AI auto-blog pipeline (keyword → SERP analysis → brief → 2,000-word article → SEO score → featured image → schema → publish) · Editorial review queue · Content schedules (X articles/week) · Bulk keyword CSV generation · Internal link suggester · Readability + SEO scoring · Multilingual generation · Distribution triggers (→ M23, M24, M16)
**Depends on:** M21, M19, M06, BullMQ | **Priority:** P1 | **Phase:** 3

### M23 — Social Planner
**Purpose:** Unified scheduler for Facebook, Instagram, LinkedIn, X, TikTok, GBP, YouTube Community.
**Submodules:** Content calendar (month/week/day) · Multi-platform composer · Best-time AI scheduling · Recurring posts · Bulk CSV upload · RSS auto-post · Approval workflow · Blog-to-social AI repurposing (one article → 5 platform-native variants) · Hashtag generator · 30-day AI content series generator · Engagement analytics · Social listening
**Depends on:** M22, M06, M41 | **Priority:** P1 | **Phase:** 4

### M24 — Pinterest Automation
**Purpose:** Dedicated Pinterest growth machine — a genuine differentiator vs every competitor.
**Submodules:** Pin generator (URL/keyword → 5 titles + 5 descriptions + auto-designed 1000×1500 image via Sharp.js) · Board management · Bulk pin creation from keyword lists · 12 pin design templates · Pin scheduler · UTM auto-tagging · Pinterest SEO (keyword-optimized boards/titles) · Pin analytics (impressions, saves, clicks)
**Depends on:** M22, M35, M41 | **Priority:** P1 | **Phase:** 4

### M25 — AI Video Studio ⭐
**Purpose:** Blog-to-video pipeline — completes the content loop into short-form video, the biggest gap in every CRM competitor.
**Submodules:** Article → AI script generator · AI voiceover (ElevenLabs-style TTS) · Auto visuals (stock + AI-generated b-roll) · Auto-captions (word-highlight style) · Vertical (9:16) + square + landscape renders · Talking-avatar option (AI presenter) · Direct publish to Reels/TikTok/Shorts via M23 · Video templates per niche
**Depends on:** M22, M23, M06, M35 | **Priority:** P3 | **Phase:** 8
**Futuristic angle:** Nobody in the GoHighLevel-class market has native blog-to-video. This is a headline marketing feature.

### M26 — Local SEO
**Purpose:** Map-pack domination for service businesses.
**Submodules:** GBP management (posts, photos, Q&A, offers) · GBP post scheduler · Citation builder (50+ directories) · NAP consistency monitor · Map-pack rank tracking · Local keyword research · Competitor GBP analysis · LocalBusiness schema injector
**Depends on:** M21, M41 | **Priority:** P2 | **Phase:** 6

### M27 — Ads & Attribution
**Purpose:** Close the loop between ad spend, leads, and closed revenue.
**Submodules:** Meta Ads + Google Ads account connections · Unified spend dashboard · UTM-based lead attribution · Close attribution (ad → contact → won deal) · ROAS calculation · Campaign performance tables · Creative performance ranking · Budget pacing + CPL alerts · White-label PDF ad reports
**Depends on:** M09, M11, M41 | **Priority:** P2 | **Phase:** 6

---

# LAYER 3 — COMMERCE
*Money in, money tracked.*

### M28 — Payments & Invoicing
**Purpose:** FreshBooks/HoneyBook replacement — all billing between workspaces and their clients.
**Submodules:** Invoices (line items, tax, branding, reminders) · Estimates → invoice conversion · Subscriptions (Stripe) · One-time checkout links · Text-to-Pay · Tap-to-Pay · Order forms with bumps/upsells · Payment plans (2–12 installments) · Multi-currency (135+) · Revenue reports (MRR, receivables, top clients)
**Depends on:** M09, M41 (Stripe) | **Priority:** P0 | **Phase:** 1

### M29 — Affiliate Marketing Hub
**Purpose:** Full affiliate marketer command center — link management, network earnings, AI product content.
**Submodules:** Link cloaker + redirect handler + click tracking (device/country/referrer) · A/B link tests · Link health monitoring · QR codes · Amazon PA-API product search + comparison tables + price/stock alerts · Multi-network dashboard (Amazon, ClickBank, ShareASale, Impact, CJ, Digistore24) · AI review writer / listicles / comparison articles · Email promo sequences · Niche site manager · Opportunity finder
**Depends on:** M22, M41 | **Priority:** P1 | **Phase:** 5

### M30 — Reputation
**Purpose:** Automated review collection and brand monitoring.
**Submodules:** Review request automation (timed SMS/email) · Review gate (happy → Google, unhappy → private form) · Google + Facebook review monitoring · AI review replies (sentiment-matched) · Embeddable review widgets · Video testimonial collector · Sentiment trend charts · New review alerts · Competitor rating tracking
**Depends on:** M13, M12, M41 | **Priority:** P2 | **Phase:** 6

### M31 — Memberships & Courses
**Purpose:** Kajabi/Teachable replacement for digital products.
**Submodules:** Course builder (sections → video/text/audio/quiz/file lessons) · Membership tiers · Drip content · Student progress tracking · Auto-generated PDF certificates · Community Q&A forums · Assignments & grading · Live session links · Stripe access control · Per-course affiliate programs
**Depends on:** M28, M06 | **Priority:** P2 | **Phase:** 6

### M32 — Conversational Commerce ⭐
**Purpose:** Sell inside chat — product catalog + AI agent + checkout links in WhatsApp and Instagram DM.
**Submodules:** Product catalog (synced to WhatsApp Business + IG Shopping) · AI product Q&A in chat · Cart building in conversation · Checkout link generation (Stripe) · Order status queries via chat · Abandoned-chat-cart recovery automation
**Depends on:** M12, M33, M28, M41 | **Priority:** P3 | **Phase:** 8
**Futuristic angle:** Huge for international/multi-language markets (Arabic, Bangla regions are WhatsApp-first) — aligns directly with the platform's i18n goal.

---

# LAYER 4 — AI
*The intelligence layer that makes everything else feel magical.*

### M33 — AI Agent Studio (Chat)
**Purpose:** Build, train, deploy niche AI assistants — Intercom/ManyChat replacement.
**Submodules:** Agent builder (name, avatar, personality, role) · Knowledge base ingestion (PDF/URL/text → pgvector RAG) · Conversation flows · Deployment (web widget, SMS, WhatsApp, Messenger) · Lead capture mode · Appointment booking mode · Human handoff thresholds · Agent analytics · Niche packs (dental, real estate, restaurant, legal, coaching, e-commerce)
**Depends on:** M12, M14, M09, pgvector | **Priority:** P1 | **Phase:** 6

### M34 — AI Voice Agents & Call Center ⭐
**Purpose:** AI that answers, calls, qualifies, and books — by phone. The single biggest differentiator available in 2026.
**Submodules:** Inbound AI receptionist (answers missed/after-hours calls) · Outbound qualification calls · Verbal appointment booking (reads M14 availability) · Real-time voice via Twilio + OpenAI Realtime API (or ElevenLabs) · Call transcripts + sentiment → contact timeline · Voicemail drops · Call recordings · Compliance disclosures (ties to M05) · Per-minute usage metering (ties to M03)
**Depends on:** M33, M14, M12, M05, M03 | **Priority:** P2 | **Phase:** 7
**Futuristic angle:** Voice AI converts the "missed call → SMS" feature into "missed call → AI conversation → booked appointment."

### M35 — Creative Studio
**Purpose:** Canva replacement — AI visual asset generation for every module.
**Submodules:** AI image generation (DALL-E 3 / SDXL) · Blog featured images · Pinterest pin designer · Social graphics (all sizes) · Ad creatives · YouTube thumbnails · Logo generator · Brand kit (colors, fonts, logo applied everywhere) · 200+ templates by niche · Bulk generation · Direct publish to Social Planner
**Depends on:** M06, M41 | **Priority:** P1 | **Phase:** 6

### M36 — AI Insights & Churn Prediction ⭐
**Purpose:** Predictive intelligence for the agency owner — protect MRR before it leaves.
**Submodules:** Sub-account health scoring (logins, usage, results) · Churn risk prediction · Auto-triggered retention workflows · Anomaly detection ("open rates dropped 40% this week") · Opportunity surfacing ("this workspace hit its contact limit — upsell moment") · Weekly AI insights digest
**Depends on:** M40, M13, M03 | **Priority:** P3 | **Phase:** 8
**Futuristic angle:** Directly protects the #1 metric from PRD Section 2 (MRR per workspace).

---

# LAYER 5 — PLATFORM
*Resale, extensibility, and operations.*

### M37 — Client Portal
**Purpose:** White-labeled client workspace — reduces agency email volume, increases perceived value.
**Submodules:** Custom portal URL · Client dashboard (traffic, leads, pipeline, rankings) · Content approval (blog + social) · Invoice history + pay online · Task list + deliverable uploads · Branded analytics reports · Content calendar view · Brand asset library · Direct messaging with agency · Strict data isolation
**Depends on:** M02, M22, M23, M28, M40 | **Priority:** P1 | **Phase:** 6

### M38 — Referral Manager (Own Program)
**Purpose:** Viral growth engine — platform-level and per-workspace affiliate programs.
**Submodules:** Auto-generated referral links · Commission models (flat/first-payment %/recurring MRR %) · Two-tier commissions · Affiliate dashboards · Promo asset library · Leaderboards · Fraud detection (IP self-referral blocking) · Stripe Connect / PayPal mass payouts · Sub-account programs
**Depends on:** M03, M28 | **Priority:** P2 | **Phase:** 7

### M39 — Marketplace
**Purpose:** Template economy — snapshots, themes, prompt packs, niche kits.
**Submodules:** Snapshots (full workspace config export/import) · Workflow templates · Site themes · Email packs · Prompt packs · Niche starter bundles · Seller program (70/30 revenue share) · Freemium listings · One-click install · Community ratings & reviews
**Depends on:** M13, M19, M16, M28 | **Priority:** P2 | **Phase:** 7

### M40 — Analytics & Report Builder
**Purpose:** Master command center + self-serve custom reporting.
**Submodules:** Business KPI overview · Traffic analytics · Lead attribution · Pipeline analytics · Content/campaign/social/affiliate analytics · **Custom report builder** (drag-and-drop: any metric × dimension × chart type) · Saved dashboards · Scheduled email delivery · Period comparison · White-label client PDF/HTML reports · CSV export
**Depends on:** All data modules | **Priority:** P1 | **Phase:** 6

### M41 — Integrations Hub & Open API ⭐
**Purpose:** First-class management of every external connection, plus a public API so the platform plays well with everything.
**Submodules:** Credential vault (Twilio, Stripe, OpenAI, DataForSEO, SerpApi, Meta, Google, Pinterest, Amazon, LinkedIn, X, TikTok) · Connection health monitoring · OAuth flow management · Token refresh automation · Incoming/outgoing webhooks · **Public REST API + API keys** · Rate limiting · Native Zapier/Make connectors · Integration marketplace directory
**Depends on:** M01, M02 | **Priority:** P0 (credential vault) / P2 (public API) | **Phase:** 1 + 7
**Why it matters:** The platform depends on 25+ external APIs — treating them as an afterthought makes everything fragile. Resellers will demand the public API before committing to white-label.

### M42 — White-Label SaaS Mode
**Purpose:** Run the entire platform under any brand and resell it.
**Submodules:** Custom platform domain · Full branding (logo, colors, name, favicon) · Custom pricing plans (Stripe Connect) · Rebilling markup (uses M03 metering) · White-label emails · Feature gating per plan · Agency dashboard (all sub-accounts, MRR, usage, health) · Built-in support desk · White-label mobile wrapper
**Depends on:** M01, M02, M03, M41 | **Priority:** P1 | **Phase:** 7

### M43 — Mobile Field App ⭐
**Purpose:** Purpose-built mobile experience for field sales, home services, and real estate — beyond a simple wrapper.
**Submodules:** Offline-capable lead capture · Business card scanner (photo → AI extracts contact → CRM) · Tap-to-Pay on phone · On-site photo uploads to deals · Route planning for appointments · Push notifications · Voice notes → AI transcription → contact timeline
**Depends on:** M09, M11, M14, M28, Capacitor | **Priority:** P3 | **Phase:** 8

### M44 — Admin & Platform Ops
**Purpose:** Super-admin tooling to run the platform itself.
**Submodules:** User & workspace management · Plan enforcement · BullMQ queue monitoring · Cron job dashboard · Error reporting (Sentry integration) · System logs · Impersonation (with audit) · Support tools · Feature flags · Database health
**Depends on:** All | **Priority:** P1 | **Phase:** 1 (basic) + ongoing

---

## Module Count Summary

| Layer | Modules | New ⭐ | Focus |
|---|---|---|---|
| L0 Foundation | M00–M07 (8) | 2 | Auth, tenancy, billing, compliance, media |
| L1 Core Ops | M08–M18 (11) | 4 | CRM, pipeline, inbox, automations, forms, campaigns |
| L2 Growth | M19–M27 (9) | 1 | Sites, SEO, content, social, Pinterest, video, ads |
| L3 Commerce | M28–M32 (5) | 1 | Payments, affiliate, reputation, courses, chat commerce |
| L4 AI | M33–M36 (4) | 2 | Chat agents, voice agents, creative, predictive insights |
| L5 Platform | M37–M44 (8) | 2 | Portal, referrals, marketplace, analytics, API, white-label |
| **Total** | **45 modules** | **12** | |

---

## Updated Build Roadmap (Claude Code Session Order)

**Phase 1 — Foundation + Core CRM (Weeks 1–4)**
M00 Auth → M01 Workspaces → M02 Roles → M03 Billing/Metering → M41 Credential Vault → M04 Notifications → M05 Compliance basics → M09 CRM → M11 Pipeline → M12 Inbox → M13 Automations → M14 Calendar → M28 Payments → M44 Admin basics → M08 Dashboard

**Phase 2 — Acquisition & Sites (Weeks 5–7)**
M15 Forms → M16 Campaigns → M19 Sites → M20 Funnels → M06 Media Library

**Phase 3 — SEO & Content Engine (Weeks 8–10)**
M21 SEO → M22 Content/CMS (auto-blog pipeline)

**Phase 4 — Social & Pinterest (Weeks 11–12)**
M23 Social Planner → M24 Pinterest

**Phase 5 — Commerce & Ops Depth (Weeks 13–14)**
M29 Affiliate Hub → M17 Proposals & Contracts → M18 Projects & Team Ops → M10 Lead Enrichment

**Phase 6 — AI & Client-Facing (Weeks 15–17)**
M33 AI Agents → M35 Creative Studio → M37 Client Portal → M40 Analytics + Report Builder → M26 Local SEO → M27 Ads → M30 Reputation → M31 Memberships

**Phase 7 — Platform & Resale (Weeks 18–19)**
M42 White-Label → M39 Marketplace → M38 Referrals → M34 Voice Agents → M41 Public API

**Phase 8 — Futuristic Differentiators (Weeks 20–22)**
M25 AI Video Studio → M32 Conversational Commerce → M36 AI Insights & Churn → M43 Mobile Field App → M08 Copilot (full)

---

## The 12 Futuristic Differentiators at a Glance

| # | Module | Kills Which Competitor Gap |
|---|---|---|
| M05 | Compliance & Consent Center | Every CRM's #1 support headache (A2P blocks) |
| M06 | Media Library & Asset Manager | Scattered assets across modules |
| M08 | AI Copilot | Table stakes for 2026 SaaS |
| M10 | Lead Enrichment & Intent | Thin contact records; Clearbit/Apollo subscriptions |
| M17 | Proposals & Contracts | PandaDoc / DocuSign |
| M18 | Projects & Team Ops | Trello / ClickUp for agencies |
| M25 | AI Video Studio | No competitor has native blog-to-video |
| M32 | Conversational Commerce | WhatsApp-first international markets |
| M34 | AI Voice Agents | The single biggest CRM differentiator in 2026 |
| M36 | AI Insights & Churn Prediction | Reactive-only analytics everywhere else |
| M41 | Integrations Hub & Open API | Fragile hardcoded integrations; reseller dealbreaker |
| M43 | Mobile Field App | Weak mobile in all GoHighLevel-class tools |

---

## Claude Code Prompting Rules for This Module List

1. **One module per session.** Paste: Master System Prompt (PRD §32) + this module's block + the relevant PRD section detail.
2. **Respect the dependency column.** Never build a module before its dependencies exist.
3. **Every table gets `workspace_id`.** No exceptions.
4. **All external API calls go through M41's credential vault** — never hardcode keys per module.
5. **All async work goes through BullMQ** — blog generation, rank checks, social posting, voice calls, video rendering.
6. **Usage-metered actions** (SMS, email, AI tokens, enrichment credits, voice minutes, video renders) **must increment M03 meters** so rebilling works from day one.

---

*Document End — Master Module List v3*
*45 Modules | 6 Layers | 12 Futuristic Differentiators | 8 Build Phases*
