
# Master Product Requirements Document (PRD)
# AI-Powered All-in-One CRM & Growth Platform
**Version:** 1.0  
**Date:** June 29, 2026  
**Author:** Morshed Milon  
**Platform Name:** [Your Brand].com  
**Built With:** Claude AI (Code Generation Assistant)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Platform Vision & Goals](#2-platform-vision--goals)
3. [Tech Stack](#3-tech-stack)
4. [Architecture Overview](#4-architecture-overview)
5. [Master Workflow / Pipeline](#5-master-workflow--pipeline)
6. [Module 1 — CRM & Contact Management](#6-module-1--crm--contact-management)
7. [Module 2 — Sales Pipeline Kanban](#7-module-2--sales-pipeline-kanban)
8. [Module 3 — Conversations Unified Inbox](#8-module-3--conversations-unified-inbox)
9. [Module 4 — Workflow Automation Builder](#9-module-4--workflow-automation-builder)
10. [Module 5 — Calendar & Appointment Booking](#10-module-5--calendar--appointment-booking)
11. [Module 6 — Email & SMS Campaigns](#11-module-6--email--sms-campaigns)
12. [Module 7 — AI Website & Funnel Builder](#12-module-7--ai-website--funnel-builder)
13. [Module 8 — SEO & Keyword Research Engine](#13-module-8--seo--keyword-research-engine)
14. [Module 9 — AI Auto-Blogging System](#14-module-9--ai-auto-blogging-system)
15. [Module 10 — Social Media & Pinterest Auto-Poster](#15-module-10--social-media--pinterest-auto-poster)
16. [Module 11 — Affiliate Marketing Hub](#16-module-11--affiliate-marketing-hub)
17. [Module 12 — Payments & Invoicing](#17-module-12--payments--invoicing)
18. [Module 13 — Reputation Management](#18-module-13--reputation-management)
19. [Module 14 — Memberships & Online Courses](#19-module-14--memberships--online-courses)
20. [Module 15 — AI Agent Studio](#20-module-15--ai-agent-studio)
21. [Module 16 — Local SEO Tools](#21-module-16--local-seo-tools)
22. [Module 17 — Ad Reporting Layer](#22-module-17--ad-reporting-layer)
23. [Module 18 — Creative Studio](#23-module-18--creative-studio)
24. [Module 19 — Client Portal](#24-module-19--client-portal)
25. [Module 20 — Affiliate/Referral Manager (Own Program)](#25-module-20--affiliatereferral-manager-own-program)
26. [Module 21 — Marketplace](#26-module-21--marketplace)
27. [Module 22 — Analytics & Reporting Dashboard](#27-module-22--analytics--reporting-dashboard)
28. [Module 23 — White-Label SaaS Mode](#28-module-23--white-label-saas-mode)
29. [Database Schema Overview](#29-database-schema-overview)
30. [API Integrations Master List](#30-api-integrations-master-list)
31. [Build Phases & Roadmap](#31-build-phases--roadmap)
32. [Claude AI Prompt Templates](#32-claude-ai-prompt-templates)

---

## 1. Executive Summary

This document defines the complete product requirements for an AI-powered all-in-one CRM and business growth platform. The platform combines contact management, sales pipelines, multi-channel communication, marketing automation, AI website building, SEO content automation, auto-blogging, social media scheduling, Pinterest automation, affiliate marketing management, payments, reputation management, memberships, AI agents, local SEO, ad reporting, creative tools, client portals, a marketplace, and white-label SaaS mode — all in a single unified platform.

The platform is inspired by GoHighLevel and LeadStack.dev but goes significantly further by incorporating:
- A built-in AI auto-blogging and SEO engine
- A Pinterest and social media content automation system
- A full affiliate marketing hub (Amazon, ClickBank, ShareASale, CJ, etc.)
- An AI agent studio for niche-specific chat/voice agents
- A creative studio for generating visual assets with AI
- A white-label marketplace for templates, snapshots, and niche packs

The target users are digital agencies, SaaS founders, affiliate marketers, coaches, consultants, and service businesses who want to replace 10-15 separate tools with one platform they fully own and can white-label for clients.

**Tools This Platform Replaces:**

| Tool Replaced | Module in This Platform |
|---|---|
| GoHighLevel / LeadStack | CRM + Pipeline + Inbox + Automation |
| Semrush / Ahrefs | SEO Engine + Rank Tracker |
| Surfer SEO / Frase | AI Auto-Blog System |
| Mailchimp / ActiveCampaign | Email & SMS Campaigns |
| ClickFunnels | Funnel Builder |
| Wix / Webflow | AI Website Builder |
| Calendly | Calendar & Booking |
| Buffer / Hootsuite | Social Media Planner |
| Canva | Creative Studio |
| Kajabi / Teachable | Memberships & Courses |
| Tapfiliate / Rewardful | Affiliate/Referral Manager |
| FreshBooks / HoneyBook | Payments & Invoicing |
| Reputation.com | Reputation Management |
| Intercom / ManyChat | AI Agent Studio |

---

## 2. Platform Vision & Goals

### Vision
Build a self-hosted, white-label, AI-powered business operating system that lets any agency or business acquire leads, nurture them, close sales, publish content, rank on Google, automate social media, earn affiliate income, and manage clients — all from one dashboard.

### Core Goals
- Replace GoHighLevel, Semrush, Mailchimp, Calendly, Clickfunnels, Canva, Buffer, WordPress + plugins, Tapfiliate, Kajabi, and Freshbooks
- Enable white-label resale: each agency client gets their own branded workspace
- AI-first: every module has an AI layer (generation, suggestion, automation)
- Self-hostable: runs on VPS or Docker with Postgres + Node.js backend
- Multi-language: full i18n support (English, Arabic, French, Bangla, etc.)

### Key Metrics to Track
- Monthly Recurring Revenue (MRR) per workspace
- Leads captured per sub-account
- Articles published and ranking keywords
- Social posts scheduled and engagement
- Affiliate commissions earned per workspace
- Client NPS and churn rate

---

## 3. Tech Stack

### Frontend
- **Framework:** Next.js 15 (App Router)
- **UI Library:** shadcn/ui + Tailwind CSS v4
- **Drag & Drop (Pipeline):** @hello-pangea/dnd
- **Drag & Drop (Page Builder):** Craft.js or GrapeJS
- **Drag & Drop (Workflow):** React Flow
- **Charts:** Recharts or Chart.js
- **State Management:** Zustand
- **Forms:** React Hook Form + Zod validation
- **Rich Text Editor:** TipTap or Lexical
- **Tables:** TanStack Table v8

### Backend
- **Runtime:** Node.js 22 with Express or Fastify
- **ORM:** Prisma
- **Database:** PostgreSQL 16
- **Cache:** Redis
- **Queue:** BullMQ (job queues for auto-posting, blogging, rank checks)
- **Auth:** NextAuth.js v5 or Supabase Auth
- **File Storage:** AWS S3 or Cloudflare R2
- **Realtime:** Pusher or Supabase Realtime
- **Email Service:** SendGrid or Resend
- **SMS/Voice:** Twilio
- **Payments:** Stripe

### AI & Content
- **LLM:** OpenAI GPT-4o (primary), Claude 3.5 Sonnet (secondary)
- **Image Generation:** OpenAI DALL-E 3 or Stability AI
- **SEO Data:** DataForSEO API
- **SERP Analysis:** SerpApi
- **Embeddings/Vector Search:** pgvector (for AI agent memory/RAG)

### DevOps
- **Frontend Hosting:** Vercel
- **Backend Hosting:** Railway, Render, or VPS (Docker)
- **DNS/CDN:** Cloudflare
- **Container:** Docker + Docker Compose
- **CI/CD:** GitHub Actions
- **Monitoring:** Sentry + PostHog analytics

---

## 4. Architecture Overview

```
FRONTEND (Next.js 15)
  Dashboard | CRM | Pipeline | Inbox | Builder | SEO | Blog
  Social | Affiliate | Payments | Agents | Analytics | Portal
          |
          | REST API / WebSocket
          |
BACKEND (Node.js + Express)
  Auth | CRM API | Automation Engine | Content Engine
  SEO Engine | Social Engine | Affiliate Engine | Billing
          |
  Postgres | Redis | BullMQ | S3 | Stripe | Twilio | OpenAI
          |
EXTERNAL APIs
  DataForSEO | SerpApi | Amazon PA-API | ClickBank
  Meta Marketing API | Google Ads API | Pinterest API
  Google Business Profile | Twitter/X | LinkedIn | TikTok
```

### Multi-Tenancy Model
- **Agency Account** = top-level platform owner account
- **Sub-Account / Workspace** = one per client (complete data isolation)
- **Users** = staff members within a workspace (role-based permissions)
- All data scoped via workspace_id foreign key on every table
- Row-level security enforced at API middleware layer

---

## 5. Master Workflow / Pipeline

The entire platform revolves around ONE core loop. Every module feeds the same contact record:

```
STAGE 1 — ACQUIRE
  SEO articles rank on Google → visitor lands on blog
  Social posts drive traffic → visitor clicks link
  Pinterest pins → visitor clicks pin to landing page
  Paid ads (Meta/Google) → visitor lands on funnel
  Referral/affiliate links → visitor arrives via partner

STAGE 2 — CAPTURE
  Visitor fills form / quiz / survey on website
  Visitor books appointment via calendar embed
  Visitor chats with AI agent on site
  Visitor purchases product → becomes contact
  CRM auto-creates and enriches contact record

STAGE 3 — ENRICH
  Tag applied (source, intent, niche, keyword that brought them)
  Lead score calculated from behavior
  Company data appended
  Page visit history recorded on contact timeline
  Which article or form created them — tracked

STAGE 4 — NURTURE
  Automation workflow triggered on capture
  Email sequence starts (5-7 email drip)
  SMS follow-up sent via Twilio
  AI chat agent responds to messages 24/7
  Retargeting audience synced to Meta/Google Ads

STAGE 5 — CONVERT
  Contact moves through pipeline Kanban stages
  Proposal or estimate sent and signed
  Invoice created and paid via Stripe
  Appointment confirmed and reminder sent
  Deal marked Won — revenue recorded

STAGE 6 — DELIVER
  Onboarding automation triggers immediately
  Course/membership access granted
  Tasks created for team members
  Client portal access sent via email

STAGE 7 — AMPLIFY
  Review request sent automatically 7 days post-delivery
  Case study or testimonial collected
  Blog post written about the result (auto-blog)
  Social posts repurposed from blog content
  Pinterest pins created from blog images

STAGE 8 — RETAIN & GROW
  Renewal reminder sequence 30 days before expiry
  Upsell automation triggered at right moment
  Referral program invitation sent to happy clients
  Reactivation campaign for dormant contacts (90+ days)
```

---

## 6. Module 1 — CRM & Contact Management

### Purpose
Central contact database — the single source of truth for every lead, prospect, and client interaction.

### Core Features
- **Contact profiles:** first name, last name, email, phone, address, company, website, social handles, birthday
- **Custom fields:** unlimited workspace-specific fields (text, dropdown, date, checkbox, number, file upload, URL)
- **Tags system:** multi-tag contacts, color-coded tags, filter and bulk-tag
- **Smart lists:** saved filter views with AND/OR logic (e.g., "All hot leads from Facebook ads, last 30 days, score > 50")
- **Activity timeline:** every interaction logged — emails sent, calls, forms submitted, pages visited, notes, deals
- **Notes and tasks:** internal notes with @mentions, follow-up tasks with due dates and assignees
- **Contact scoring:** configurable rules — email opened = 5pts, form submitted = 20pts, page visited = 2pts; auto-calculated
- **Duplicate detection:** auto-detect duplicates by email/phone, merge or flag
- **Bulk actions:** tag, assign, delete, add to campaign, export selected contacts
- **Import/export:** CSV import with column mapping wizard, export filtered list to CSV
- **Company records:** link multiple contacts to a company, shared activity view
- **Contact source tracking:** UTM source, medium, campaign recorded on every new contact

### Database Tables
```sql
contacts (id, workspace_id, first_name, last_name, email, phone,
          company_id, source, utm_source, utm_medium, utm_campaign,
          lead_score, created_at, updated_at)
contact_tags (contact_id, tag_id)
tags (id, workspace_id, name, color)
custom_fields (id, workspace_id, field_name, field_type, options_json)
contact_custom_values (contact_id, field_id, value)
contact_notes (id, contact_id, user_id, content, created_at)
contact_tasks (id, contact_id, assigned_to, title, due_date, status)
activity_log (id, workspace_id, contact_id, type, description, metadata_json, created_at)
companies (id, workspace_id, name, website, industry, employee_count)
```

### Claude Prompt — Contact Management
```
Build a full-stack CRM contact management system using Next.js 15,
Prisma ORM, and PostgreSQL. Include:

1. Contacts list page with:
   - TanStack Table with server-side pagination (50 per page)
   - Search bar (searches name, email, phone)
   - Filter panel: filter by tags (multi-select), lead score range,
     source, date created range, assigned user
   - Column selector: show/hide columns
   - Bulk action bar (appears when rows selected): Add Tag, Assign,
     Export, Delete
   - "New Contact" button opening a slide-over drawer form

2. Contact detail page (/contacts/[id]) with:
   - Header: avatar (initials), name, email, phone, lead score badge,
     tags (editable), assigned user dropdown
   - Tabbed layout: Overview | Activity | Notes | Tasks | Emails | Deals
   - Overview tab: all fields in editable card sections
   - Activity tab: chronological timeline with icons per event type
     (email, sms, form, page visit, note, deal change)

3. Custom fields system:
   - Settings page to create/edit/delete workspace custom fields
   - Fields appear on contact form and detail page automatically
   - Field types: text, textarea, number, date, dropdown, checkbox,
     multi-select, url

4. Smart list builder:
   - UI with AND/OR condition groups
   - Condition: [field/tag] [operator] [value]
   - Save named list, show in sidebar under "Lists"
   - Smart lists auto-update when contacts match/unmatch criteria

5. CSV import wizard (3-step):
   - Step 1: Upload CSV file
   - Step 2: Map CSV columns to contact fields (dropdown per column)
   - Step 3: Preview first 5 rows, confirm, import (show progress bar)

6. Lead scoring engine:
   - Settings page: define scoring rules
   - Background job recalculates scores when activities occur
   - Score displayed as colored badge (0-30 cold, 31-60 warm, 61+ hot)

All API routes under /api/contacts/. Scope all queries with
workspace_id from NextAuth session. Use shadcn/ui components.
```

---

## 7. Module 2 — Sales Pipeline (Kanban)

### Purpose
Visual deal tracking from first contact to closed sale with stage-based automation triggers.

### Core Features
- **Multiple pipelines:** unlimited pipelines per workspace (Sales, Onboarding, Support, Renewal)
- **Drag-and-drop Kanban:** move deals between stages with smooth animation
- **Deal cards show:** contact name + avatar, deal value (formatted currency), assigned user, days in stage (red badge if overdue), next task due
- **Stage automation trigger:** fires workflow when deal enters/exits any stage
- **Filters:** by assigned user, value range, contact tags, date range
- **List view:** tabular alternative with sort on any column
- **Win/Loss tracking:** mark Won or Lost, required reason on loss, log revenue date
- **Revenue forecasting:** sum deal values by stage × configurable close probability
- **Deal drawer:** click card → right-side drawer with Overview, Notes, Files, Activity tabs
- **Bulk stage move:** select multiple deals, move to any stage
- **Deal value history:** track if value changes during pipeline

### Database Tables
```sql
pipelines (id, workspace_id, name, created_at)
pipeline_stages (id, pipeline_id, name, order_index, close_probability, color)
deals (id, workspace_id, pipeline_id, stage_id, contact_id, title,
       value, currency, assigned_to, expected_close_date,
       status, lost_reason, won_at, created_at, updated_at)
deal_notes (id, deal_id, user_id, content, created_at)
deal_files (id, deal_id, file_url, filename, file_size, uploaded_by)
```

### Claude Prompt — Pipeline Kanban
```
Build a drag-and-drop Kanban pipeline using React and @hello-pangea/dnd.

1. Pipeline switcher: dropdown in header to select active pipeline,
   "New Pipeline" option opens creation modal

2. Kanban board:
   - Each column = pipeline stage, horizontal scroll if many columns
   - Column header: stage name, deal count badge, total value sum
   - "Add Deal" button at bottom of each column
   - Drag cards between columns, optimistic UI update, PATCH API on drop

3. Deal card component:
   - Contact avatar (initials colored by name hash), full name
   - Deal title and value (formatted: $1,234)
   - Assigned user avatar (small, bottom right)
   - Days in stage badge (gray <3d, yellow 3-7d, red >7d)
   - Paperclip icon if files attached, bell icon if task overdue

4. Deal drawer (shadcn Sheet component, slides from right):
   - Header: deal title (editable inline), stage badge, Won/Lost buttons
   - Tabs: Overview | Notes | Files | Activity
   - Overview: editable fields (value, expected close, assigned user,
     contact link, custom fields)
   - Notes: textarea to add note, list of existing notes with timestamps
   - Files: file upload dropzone, list of uploaded files with download links
   - Activity: timeline of stage changes, notes added, tasks completed

5. Add Deal modal: contact search (typeahead), deal title, value,
   expected close date, assigned user, initial stage selector

6. Stage automation: on successful PATCH (stage change), POST to
   /api/automations/trigger with {type: "deal_stage_changed",
   deal_id, new_stage_id, contact_id, workspace_id}

7. Revenue forecast bar at top of board: progress bar showing
   total weighted pipeline value vs monthly target

Use shadcn/ui for Sheet, Dialog, Select components.
```

---

## 8. Module 3 — Conversations (Unified Inbox)

### Purpose
All customer communication in one place — email, SMS, WhatsApp, Facebook DM, Instagram DM, live chat.

### Core Features
- **Three-panel layout:** conversation list (left), message thread (center), contact info (right)
- **Channel indicators:** icon per message showing source channel
- **Thread unification:** all messages with same contact in one thread regardless of channel
- **Assign to team member:** dropdown on any conversation
- **Status management:** Open, In Progress, Resolved, Spam
- **Internal notes:** @mention colleagues, purple-tinted, invisible to contact
- **Canned responses:** type "/" to search shortcuts, insert template text
- **AI auto-reply mode:** toggle per conversation — GPT-4o replies automatically using agent context
- **Missed call → SMS:** Twilio webhook → auto-send "We missed your call, how can we help?"
- **Two-way SMS:** full send/receive via Twilio
- **WhatsApp Business:** via Meta Cloud API
- **Facebook + Instagram DM:** via Meta Graph API webhooks
- **Live chat widget:** embeddable JS snippet for any website
- **Email integration:** connect Gmail OAuth or SMTP
- **Full-text search:** search all conversations by keyword
- **Realtime updates:** Pusher — new messages appear instantly for all team members

### Database Tables
```sql
conversations (id, workspace_id, contact_id, channel, status,
               assigned_to, last_message_at, created_at)
messages (id, conversation_id, direction, channel, content, media_url,
          sender_id, is_internal_note, created_at)
channels (id, workspace_id, type, display_name, credentials_json, is_active)
canned_responses (id, workspace_id, shortcut, title, content)
```

---

## 9. Module 4 — Workflow Automation Builder

### Purpose
Visual no-code automation engine using drag-and-drop node builder — replaces Zapier for internal platform tasks.

### Trigger Nodes
- Contact created / updated
- Tag added or removed
- Form submitted (specific form)
- Deal stage changed (from/to specific stages)
- Appointment booked / cancelled / no-show
- Email opened / link clicked
- SMS received
- Payment received / failed
- Date/time trigger (scheduled — e.g., 3 days after contact created)
- Webhook received (from external system)
- Page visited (specific page on client site)

### Action Nodes
- Send email (pick template, personalize tokens)
- Send SMS via Twilio
- Send WhatsApp message
- Add tag / Remove tag
- Move deal to stage
- Create deal
- Create task (assign to user, set due date)
- Assign contact to user
- Update custom field value
- Add to email campaign (drip sequence)
- Wait / Delay (X minutes / hours / days)
- Webhook POST (to external URL with custom payload)
- Create invoice
- Grant membership/course access
- Post to social media (schedule a post)
- Publish blog article
- Send internal team notification (Slack/email)

### Condition Nodes
- IF/ELSE branch based on: contact field value, tag exists, deal value, lead score, form answer

### Additional Features
- **AI workflow builder:** describe workflow in English → GPT-4o generates node JSON
- **Workflow templates:** 15 pre-built (lead nurture 7-day, appointment reminder, post-sale review request, cart abandonment, birthday message, re-engagement, onboarding)
- **Execution log:** per-contact step-by-step execution history
- **Enable/disable toggle:** pause without deleting

### Database Tables
```sql
workflows (id, workspace_id, name, trigger_type, trigger_config_json,
           nodes_json, edges_json, is_active, created_at)
workflow_executions (id, workflow_id, contact_id, started_at,
                     completed_at, status, current_node_id)
workflow_execution_steps (id, execution_id, node_id, executed_at,
                          result_json, error_message)
```

### Claude Prompt — Automation Builder
```
Build a visual workflow automation builder using React Flow (@xyflow/react).

1. Canvas layout: React Flow canvas takes full screen, minimap bottom-right,
   controls bottom-left, node panel slides from left

2. Node types:
   TRIGGER nodes (green border):
   - "Contact Created" — no config
   - "Tag Added" — config: select which tag
   - "Form Submitted" — config: select which form
   - "Deal Stage Changed" — config: from stage, to stage

   ACTION nodes (blue border):
   - "Send Email" — config: email template picker, delay before send
   - "Send SMS" — config: message textarea with {{tokens}}, delay
   - "Add Tag" — config: tag selector (multi-select)
   - "Create Task" — config: title, assign to, due date offset
   - "Wait" — config: duration (number + unit: hours/days)
   - "Webhook POST" — config: URL textarea, headers, body template

   CONDITION nodes (orange, diamond shape):
   - "IF/ELSE" — config: field selector, operator, value
   - Two outputs: YES edge (green) and NO edge (red)

3. Node panel (left sidebar):
   - Search nodes by name
   - Drag nodes onto canvas from panel
   - Categories: Triggers, Actions, Conditions, Delays

4. Node config panel (right sidebar):
   - Appears when any node is selected
   - Shows config fields specific to that node type
   - All fields use shadcn/ui form components

5. Save workflow:
   - Serialize React Flow state to {nodes: [], edges: []}
   - POST to /api/workflows with name + nodes_json + trigger info

6. Backend execution engine (Node.js worker):
   - BullMQ worker: processWorkflowExecution(job)
   - Load workflow JSON, find trigger node, walk edges
   - For each action node, execute corresponding handler
   - For condition nodes, evaluate and follow correct edge
   - Wait nodes: delay job re-queue by specified duration
   - Log each step to workflow_execution_steps

7. Execution log page:
   - Table: contact name | started | status | steps completed
   - Click row: timeline showing each node with green/red status
```

---

## 10. Module 5 — Calendar & Appointment Booking

### Purpose
Replace Calendly — smart booking system with reminders, team support, and CRM integration.

### Core Features
- **Booking page:** public URL, responsive design, contact picks available slot
- **Availability rules:** working hours per day, buffer time between bookings, minimum notice period, max bookings per day
- **Calendar types:** one-on-one, round-robin (auto-assign across team), group session (multiple bookings per slot), class
- **Pre-booking questions:** custom form before confirming booking
- **Google Calendar sync:** two-way (Google events block availability, bookings appear in Google)
- **Automated reminders:** configurable SMS + email at 24h and 1h before
- **Self-service reschedule/cancel:** contact gets link to manage their booking
- **Paid bookings:** Stripe payment required at booking time
- **No-show tracking:** mark no-shows, trigger re-booking workflow automatically
- **Embed widget:** calendar widget embeds on any website page
- **CRM trigger:** booking created → auto-trigger workflow, auto-tag contact "Appointment Booked"

### Database Tables
```sql
calendars (id, workspace_id, name, type, slug, color, settings_json,
           google_calendar_id, created_at)
calendar_availability (id, calendar_id, day_of_week, start_time, end_time, is_available)
appointments (id, calendar_id, contact_id, assigned_user_id,
              start_time, end_time, status, meeting_link,
              pre_booking_answers_json, payment_intent_id, created_at)
appointment_reminders (id, appointment_id, type, channel, scheduled_at, sent_at)
calendar_blocks (id, calendar_id, start_time, end_time, reason)
```

---

## 11. Module 6 — Email & SMS Campaigns

### Purpose
Broadcast and automated drip campaigns replacing Mailchimp and ActiveCampaign.

### Core Features
- **Drag-and-drop email builder:** sections, columns, text, images, buttons, dividers, social links, spacers
- **Broadcast campaigns:** one-time send to smart list or tag group, schedule for specific date/time
- **Drip sequences:** multi-step automated series with configurable delays (Day 1 email → Day 3 SMS → Day 7 email)
- **Campaign analytics:** open rate, click rate, bounce, unsubscribe, revenue attributed
- **A/B testing:** two subject line variants, auto-send winner to remaining list after 4 hours
- **SMS campaigns:** mass SMS with merge tags, delivery tracking, replies captured in inbox
- **Email template library:** 60+ niche templates (real estate, dental, coaching, e-commerce, restaurant)
- **Personalization tokens:** {{first_name}}, {{company}}, {{custom_field_name}}, {{unsubscribe_link}}
- **List segmentation:** target specific tag or smart list per campaign
- **Unsubscribe compliance:** automatic CAN-SPAM/GDPR compliance, unsubscribe link auto-added
- **Spam score checker:** analyze email before send (SpamAssassin scoring)
- **AI copywriter:** describe campaign goal → GPT-4o writes subject line + full email body

---

## 12. Module 7 — AI Website & Funnel Builder

### Purpose
AI-powered website and funnel builder replacing Wix + ClickFunnels, with CRM deep integration.

### AI Generation Layer
- **Text-to-website:** describe business → AI generates full website with hero, features, testimonials, CTA, footer — complete with copy, layout, and image prompts
- **URL-to-clone:** paste competitor URL → AI analyzes and recreates structure
- **Voice prompt:** speak description → AI builds site
- **Niche template generation:** "Generate a 5-page dental clinic website" → instant themed site
- **Section AI rewrite:** select any section → "Rewrite for [niche/tone]"

### Drag-and-Drop Editor (Craft.js)
- **Structure:** Page → Sections → Rows → Columns → Elements
- **Elements:** Heading, Text block, Image, Video embed, Button, Form, Calendar widget, Google Map, Countdown timer, Testimonial card, Pricing table, FAQ accordion, Social icons, HTML embed block, Spacer/divider
- **Global styles:** brand colors and fonts applied site-wide with one click
- **Mobile editor:** toggle to 375px preview, overrides apply only to mobile breakpoint
- **Undo/redo:** 50-step history

### Funnel Builder
- **Multi-step funnel:** Opt-in → Sales page → Order form → Upsell → Thank you
- **Visual funnel map:** see all steps connected with conversion rates per step
- **A/B split testing:** two page variants, automatic winner detection at statistical significance
- **Order forms:** Stripe integration, one-click upsell logic, bump offers

### Publishing System
- **Custom domain:** connect any domain with guided DNS instructions
- **Auto-SSL:** Let's Encrypt certificates provisioned automatically
- **SEO per page:** meta title, description, OG image, canonical URL, robots tag
- **Schema markup injection:** Article, LocalBusiness, FAQ, HowTo, Product schema auto-added
- **Sub-account sites:** each workspace has its own domains, sites, and pages

### CRM Integration
- Every form submission → CRM contact created with source tags
- Every page visit → logged on contact timeline (if contact is identified)
- Calendar widget → pulls from Calendar module availability
- Chat widget → messages appear in Conversations inbox
- Purchase → creates deal in pipeline, triggers onboarding workflow

### Database Tables
```sql
sites (id, workspace_id, name, domain, ssl_status, created_at)
pages (id, site_id, title, slug, meta_json, page_json, status, published_at)
site_templates (id, name, category, niche, preview_image_url, page_json, is_global)
funnels (id, workspace_id, name, created_at)
funnel_steps (id, funnel_id, page_id, step_order, step_type, conversion_rate)
ab_tests (id, page_id, variant_a_json, variant_b_json, winner, started_at, ended_at)
```

### Claude Prompt — AI Website Builder
```
Build an AI website builder using Craft.js. Full implementation:

1. Editor page layout:
   - Left sidebar (240px): Elements panel tabbed: Elements | Layers | Templates
   - Center: Craft.js Editor canvas (responsive, 1200px default)
   - Right sidebar (280px): Properties panel (shows selected element settings)
   - Top toolbar: device toggle (desktop/tablet/mobile), undo/redo, preview, save, publish

2. Elements panel — draggable components:
   - Layout: Section, Container, Column (2-col, 3-col)
   - Text: Heading (H1-H4), Paragraph, Rich Text
   - Media: Image, Video (YouTube/Vimeo embed)
   - Interactive: Button, Form, Calendar Widget, Chat Widget
   - Content: Testimonial, Pricing Card, FAQ Accordion, Feature Card
   - Misc: Spacer, Divider, HTML Embed, Icon

3. Properties panel — updates for selected element:
   - Text: font family, size (tokens), weight, color, alignment, line height
   - Spacing: padding (top/right/bottom/left), margin
   - Background: color picker, image upload, gradient
   - Border: width, style, color, border-radius
   - For sections: full-width toggle, max-width, background options

4. AI Generate flow:
   - "Generate with AI" button in toolbar
   - Modal: textarea "Describe your business and what you need"
   - On submit: POST /api/builder/ai-generate with {description, workspace_id}
   - Backend: call GPT-4o with system prompt instructing it to return
     valid Craft.js JSON for a complete website
   - On response: call craft.js editor.deserialize(json) to load generated page
   - Show loading state with progress animation during generation

5. Save/Publish:
   - Save: POST /api/pages with serialized Craft.js JSON
   - Publish: PATCH /api/pages/:id/publish → set status=published, published_at=now
   - Preview: open /preview/:page_id in new tab rendering page outside editor

6. Template gallery:
   - Right panel "Templates" tab: grid of template previews by category
   - Click template: loads template JSON into editor
   - Templates stored in site_templates table, seeded with 20+ examples
```

---

## 13. Module 8 — SEO & Keyword Research Engine

### Purpose
Built-in Semrush-lite — keyword research, SERP analysis, competitor gap analysis, rank tracking, and technical audit.

### Core Features

#### Keyword Research
- Seed keyword → volume, CPC, keyword difficulty (0-100), search intent badge
- Related keywords: 50+ variations per seed
- Questions finder: PAA-style question keywords
- Long-tail generator: question + modifier + location variants
- SERP preview: top 10 results with domain, title, snippet, estimated traffic
- Competitor gap: enter two domains → keywords competitor ranks for that you don't
- Keyword collections: save to named lists, add to content queue from list

#### Rank Tracking
- Track up to 500 keywords per workspace (base plan)
- Daily automated rank checks via DataForSEO SERP API
- Position history chart per keyword (90-day line chart)
- Rank change indicators: up/down arrows with delta
- Featured snippet tracking (position 0)
- Competitor rank comparison (track 3 competitor domains for same keywords)
- Weekly rank summary email report

#### Technical SEO Audit
- Crawl up to 500 pages: find broken links (4xx), missing meta titles, duplicate page titles, missing H1, large images
- Core Web Vitals check via Google PageSpeed Insights API (free)
- Schema markup validator
- Mobile-friendliness check
- SSL certificate status

### APIs Used
- DataForSEO REST API: keyword search volume, difficulty, SERP data, rank checking
- SerpApi: real-time Google SERP results for content briefs
- Google PageSpeed Insights API: Core Web Vitals (free, no cost)

### Database Tables
```sql
keyword_lists (id, workspace_id, name, created_at)
keywords (id, workspace_id, list_id, keyword, volume, cpc,
          difficulty, intent, created_at)
tracked_keywords (id, workspace_id, keyword, domain, country, created_at)
keyword_rankings (id, tracked_keyword_id, position, url, date)
seo_audits (id, workspace_id, domain, crawl_results_json,
            audit_score, created_at)
```

### Claude Prompt — Keyword Research
```
Build a keyword research dashboard using Next.js API routes and DataForSEO.

1. Research page (/seo/keywords):
   - Search form: keyword input, country selector, language selector
   - On submit: call POST /api/seo/keyword-data which proxies to:
     DataForSEO POST https://api.dataforseo.com/v3/keywords_data/
     google_ads/search_volume/live
     Body: [{keyword: input, location_code: 2840, language_code: "en"}]
   - Auth: Basic auth header with base64(login:password)

2. Results display:
   - Main keyword card: volume, CPC, difficulty color-coded bar,
     intent badge (informational=blue, commercial=green,
     transactional=orange, navigational=gray)
   - Related keywords table: TanStack Table, sortable columns,
     checkbox select, "Save to list" button, "Generate article" button
   - Questions tab: filter results for question-format keywords
     (who/what/when/where/why/how prefix)
   - SERP tab: call SerpApi, show top 10 results as cards

3. Keyword lists sidebar:
   - Show all saved keyword lists with count
   - Click list: filter main table to show only that list's keywords
   - Create new list button

4. Rank tracker page (/seo/rankings):
   - "Track keyword" button: input keyword + domain + country → save to tracked_keywords
   - Rankings table: keyword | current position | change (vs yesterday) | URL | last checked
   - Position change: green up arrow, red down arrow, dash for no change
   - Click keyword row: opens modal with Recharts line chart of position history
   - BullMQ cron job (daily 3am): for all tracked keywords in all workspaces,
     call DataForSEO SERP to get current position, save to keyword_rankings

5. All API calls server-side only. DataForSEO credentials stored in
   workspace settings, never exposed to frontend.
```

---

## 14. Module 9 — AI Auto-Blogging System

### Purpose
Fully automated SEO content pipeline from keyword to published, optimized article — with optional human review gate.

### Full Content Pipeline
```
Step 1: Keyword input (from keyword list or manual entry)
Step 2: SerpApi → fetch top 10 SERP results for keyword
Step 3: GPT-4o → analyze SERP → generate content brief (H1, H2s, H3s, FAQs)
Step 4: GPT-4o → write full 2,000-word article following brief
Step 5: SEO optimizer → check keyword placement, meta, structure
Step 6: Internal link suggester → find existing articles to link to/from
Step 7: DALL-E 3 → generate featured image from article topic
Step 8: Schema generator → Article JSON-LD + FAQ JSON-LD
Step 9: Quality gate → readability score, SEO score, AI detection check
Step 10: Publish to site (auto or after human approval)
Step 11: Distribution trigger → social post, email, Pinterest pin
```

### Auto-Blog Settings Per Workspace/Site
- Publishing frequency: X articles per week, on specific days/times
- Brand voice: formal / casual / conversational / educational / authoritative
- Target niche: set once, used as context for all generation
- Target word count: 800 / 1500 / 2500 / 3000+ words
- Auto-publish or require human approval (review queue)
- Language selection: supports multilingual article generation
- Default internal link count: minimum links to include per article

### Content Quality Controls
- SEO score (0-100): keyword in H1, first 100 words, at least 2 H2s, meta filled, word count adequate
- Readability: Flesch-Kincaid formula applied
- Minimum publish threshold: configurable (e.g., block auto-publish if SEO score < 65)
- AI detection: optional Originality.ai API check

### Bulk Generation
- CSV import: keyword column + optional custom title column
- Queue all keywords, process with BullMQ workers (3 concurrent max)
- Progress tracker: shows queue status per article (pending/generating/review/published)

### Database Tables
```sql
blog_articles (id, workspace_id, site_id, keyword, title, slug, content_html,
               excerpt, meta_title, meta_desc, featured_image_url,
               schema_json, seo_score, readability_score, word_count,
               status, published_at, created_at)
content_schedules (id, workspace_id, site_id, articles_per_week,
                   publish_days_json, auto_publish, brand_voice,
                   target_niche, default_word_count, language)
content_queue (id, workspace_id, site_id, keyword, custom_title,
               priority, status, article_id, created_at)
```

### Claude Prompt — Auto-Blogging Pipeline
```
Build an AI auto-blogging pipeline in Node.js with BullMQ.

POST /api/blog/generate endpoint:
Input: { keyword, site_id, workspace_id, word_count, brand_voice }

Step 1 — SERP Analysis:
  const serpResults = await fetch(
    `https://serpapi.com/search.json?q=${keyword}&num=10&api_key=${SERP_API_KEY}`
  )
  Extract: titles, snippets, URLs of top 10 results

Step 2 — Content Brief:
  Call GPT-4o with prompt:
  "You are an SEO content strategist. Based on these top 10 SERP results
  for the keyword '{keyword}': {serpResults}
  Create a detailed content brief as JSON:
  {
    h1_title: string,
    meta_title: string (under 60 chars),
    meta_description: string (under 160 chars),
    sections: [{h2: string, h3s: string[], key_points: string[]}],
    faqs: [{question: string, answer: string}],
    search_intent: string,
    target_word_count: number
  }"

Step 3 — Article Generation:
  Call GPT-4o with prompt:
  "Write a {word_count}-word SEO article using this brief: {brief}
  Requirements:
  - Include keyword '{keyword}' in H1, first 100 words, and 2-3 H2s naturally
  - Write in {brand_voice} tone
  - Format as clean HTML with h1, h2, h3, p, ul, ol tags
  - Include a compelling introduction and clear conclusion
  - Do not use the phrase 'In conclusion' or 'In summary'
  - Make every section genuinely useful and specific"

Step 4 — SEO Scoring:
  Calculate score (0-100):
  - Keyword in H1: +20pts
  - Keyword in first 100 words: +15pts
  - Keyword in at least one H2: +10pts
  - Meta title filled and under 60 chars: +10pts
  - Meta description filled and under 160 chars: +10pts
  - Word count >= target: +15pts
  - Has at least 2 internal link placeholders: +10pts
  - Has FAQ section: +10pts

Step 5 — Featured Image:
  Call DALL-E 3:
  prompt: "Professional blog header image for article about {keyword}.
  Clean, modern, minimalist style. No text in image."
  Upload to S3, get URL

Step 6 — Schema Generation:
  Build Article JSON-LD + FAQPage JSON-LD from article data

Step 7 — Save:
  INSERT into blog_articles with all generated fields
  status = auto_publish ? 'published' : 'draft'

Return: { article_id, title, seo_score, featured_image_url, status }

BullMQ Job Worker:
  Queue: 'blog-generation'
  Process: 3 concurrent workers
  On failure: retry 2 times with exponential backoff, mark status='failed'

Content Schedule Cron (daily 6am):
  For each active content_schedule:
  - Check if today is a publish day
  - Count articles published this week
  - If below articles_per_week target: pick next keyword from queue
  - Add job to 'blog-generation' queue
```

---

## 15. Module 10 — Social Media & Pinterest Auto-Poster

### Purpose
Schedule, auto-generate, and publish across all social platforms and Pinterest from one unified content calendar.

### Supported Platforms
- Facebook (Pages + Groups via Graph API)
- Instagram (Feed posts, Reels, Stories via Graph API)
- LinkedIn (Personal profiles + Company pages)
- X / Twitter (via API v2)
- TikTok (caption + video upload)
- Google Business Profile (posts, updates, offers)
- **Pinterest (Pins, Idea Pins, Board management via Pinterest API v5)**
- YouTube Community posts

### Social Planner Features
- **Content calendar:** month/week/day views, click slot to create post
- **Multi-platform composer:** write once, customize per platform (character limits enforced)
- **Schedule or Best Time:** manual schedule or AI suggests optimal posting time per platform
- **Recurring posts:** auto-repeat any post on weekly/monthly cycle
- **Bulk CSV upload:** post text + image URLs + dates in CSV → bulk schedule
- **RSS auto-post:** connect RSS feed (blog, YouTube) → auto-post new entries with AI-generated captions
- **Content approval workflow:** team submits → manager approves → auto-publishes on schedule
- **Engagement analytics:** reach, impressions, likes, comments, shares, link clicks per post
- **Social listening:** monitor brand mentions and hashtags

### AI Social Content Features
- **Blog-to-social:** paste article URL or pick published blog post → AI generates captions for ALL platforms simultaneously (different tone/format per platform)
- **One-click repurpose:** expand a blog into 5 social variations (LinkedIn insight, Instagram quote, X thread, Facebook story, Pinterest pin description)
- **Hashtag generator:** AI suggests trending and niche-specific hashtags per platform
- **Content series generator:** AI creates full 30-day content calendar for any niche with varied content types

### Pinterest Automation Module
- **Pin generator:**
  - Input: blog URL or product URL or keyword
  - AI generates: 5 title options + 5 description options (keyword-rich, 150-300 chars)
  - Auto-creates 1000×1500 vertical pin image using Sharp.js:
    - Background: brand color gradient or uploaded background
    - Top 65%: source image (auto-cropped to fit)
    - Bottom 35%: dark gradient overlay with title text (white, bold)
    - Bottom strip: domain + small logo watermark
  - CTA text overlay: "Read More", "Shop Now", "Learn How"
- **Board management:** create, name, describe boards from dashboard
- **Bulk pin creation:** import keyword list → auto-generate 20 pins with spread schedule
- **Pin templates:** 12 niche-specific vertical pin design templates (text-only, image-heavy, minimal, quote-style)
- **UTM auto-tagging:** all pins get UTM parameters for Google Analytics tracking
- **Pinterest Analytics:** impressions, saves, link clicks per pin and per board
- **Pinterest SEO:** AI generates keyword-optimized board names, pin titles, and descriptions

### Database Tables
```sql
social_accounts (id, workspace_id, platform, account_name, account_id,
                 access_token, refresh_token, token_expires_at, created_at)
social_posts (id, workspace_id, platform, social_account_id, content,
              media_urls_json, scheduled_at, published_at, status,
              platform_post_id, analytics_json, created_at)
pinterest_pins (id, workspace_id, board_id, title, description,
                destination_url, image_url, scheduled_at, published_at,
                pinterest_pin_id, impressions, saves, clicks)
pinterest_boards (id, workspace_id, pinterest_board_id, name, description, pin_count)
```

### Claude Prompt — Pinterest Pin Generator
```
Build a Pinterest pin generator using Node.js and Sharp.js.

POST /api/pinterest/generate-pins:
Input: { url, workspace_id }

Step 1 — Content Extraction:
  Use Cheerio to scrape URL:
  - Extract: <title>, meta description, og:image, h1 text
  - If og:image exists: download to temp file with axios

Step 2 — AI Title & Description Generation:
  Call GPT-4o:
  "Generate 5 Pinterest pin titles (max 100 chars each) and
   5 pin descriptions (150-300 chars each, keyword-rich, end with CTA)
   for this content: Title: {title}, Description: {description}
   Return as JSON: {titles: [], descriptions: []}"

Step 3 — Pin Image Creation (Sharp.js):
  const pinImage = await sharp({
    create: { width: 1000, height: 1500, channels: 4,
               background: { r: 20, g: 20, b: 20, alpha: 1 } }
  })

  // Load source image, resize to 1000x900, composite at top
  const sourceImg = await sharp(tempImagePath)
    .resize(1000, 900, { fit: 'cover' })
    .toBuffer()

  // Create gradient overlay for bottom text area
  const overlay = await sharp({
    create: { width: 1000, height: 600, channels: 4,
               background: { r: 15, g: 15, b: 15, alpha: 200 } }
  }).toBuffer()

  // Composite: source image top + overlay bottom
  const finalImage = await sharp({ create: { width: 1000, height: 1500... }})
    .composite([
      { input: sourceImg, top: 0, left: 0 },
      { input: overlay, top: 900, left: 0 }
    ])
    .jpeg({ quality: 90 })
    .toBuffer()

  // Add text overlay using sharp + SVG text layer
  const textSvg = `<svg width="1000" height="600">
    <text x="50" y="100" font-size="52" font-weight="bold"
      fill="white" font-family="Arial">${titles[0]}</text>
    <text x="50" y="550" font-size="28" fill="#cccccc"
      font-family="Arial">{domain}</text>
  </svg>`
  // Composite SVG text over final image

Step 4 — Upload to S3:
  Upload finalImage buffer to Cloudflare R2
  Return public URL

Step 5 — Save to DB:
  Save 5 pin variations to pinterest_pins table (status=draft)

Return: { pins: [{title, description, image_url, pin_id}] }

POST /api/pinterest/schedule-pin:
  Input: { pin_id, board_id, scheduled_at }
  Add BullMQ job with delay until scheduled_at
  Job handler: call Pinterest API v5 POST /v5/pins
```

---

## 16. Module 11 — Affiliate Marketing Hub

### Purpose
Full affiliate marketer command center — manage all affiliate networks, cloak and track links, generate AI product content, and monitor earnings.

### Sub-Module A: Affiliate Link Manager
- Paste any affiliate URL → system generates branded short URL (yourdomain.com/go/product-slug)
- Click tracking: total, unique, device type (mobile/desktop/tablet), country, referrer URL
- A/B link test: two destination URLs for same product — track which converts better
- Link health monitor: daily check on destination URL — alert if 404 or product unavailable
- UTM auto-injection on all links
- Category/niche tagging for links
- QR code generation for any cloaked link (PNG download)
- Link expiration: set auto-expiry date on time-limited promotions

### Sub-Module B: Amazon Associates Integration
- Connect via Amazon PA-API 5.0 (Access Key + Secret Key + Associate Tag)
- Product search inside CRM: search Amazon, browse results with images, prices, star ratings, review count
- One-click cloaked affiliate link generation per product
- Auto comparison table builder: select 3-5 products → AI writes HTML comparison table for blog post insertion
- Daily price monitoring: alert when promoted product price changes by >10%
- Out-of-stock alert: daily ASIN status check, notify + suggest replacement product

### Sub-Module C: Multi-Network Unified Dashboard
Connect and view earnings across all networks in one view:
- Amazon Associates
- ClickBank (via API)
- ShareASale (via API v2.8)
- Impact.com (via API)
- CJ Affiliate (via REST API)
- Digistore24 (webhook-based)
- Custom network (manual CSV import or webhook)

Dashboard shows: total earnings (today / 7d / 30d / all time / by month), per-network breakdown (clicks, conversions, EPC, pending/approved/paid commissions), top performing links by revenue, top performing links by EPC, earnings heatmap calendar, next payout dates per network.

### Sub-Module D: AI Affiliate Content Generator
- **Product review writer:** enter ASIN → 2,000-word SEO review with star rating, pros, cons, verdict, buy button with affiliate link pre-inserted
- **Comparison articles:** "Product A vs Product B" — AI writes comparison optimized for commercial keywords
- **Best-of listicles:** "Best [Category] for [Use Case] — Year" — pulls Amazon products, inserts affiliate links, writes intros and summaries per product
- **Email promo sequences:** 5-email product launch sequence written by AI for any product
- **Social captions:** Instagram, Facebook, Pinterest pin captions for product promotion
- **YouTube review scripts:** structured video review script outline with key talking points

### Sub-Module E: Niche Site Manager
- Add multiple affiliate sites/domains
- Per-site dashboard: total revenue, top articles, keyword rankings, backlink count
- Content calendar per site with SEO + affiliate content schedule
- Cross-site internal link recommendations
- Site health check: broken affiliate links, missing redirects, 404 monitoring

### Sub-Module F: Affiliate Opportunity Finder
- Enter niche/keyword → AI finds top affiliate programs (commission %, EPC, cookie duration, network)
- Amazon vs ClickBank vs direct program comparison for same product category
- New program alerts: notify when high-EPC programs launch in your tracked niches

### Database Tables
```sql
affiliate_links (id, workspace_id, original_url, short_slug, title,
                 network, product_name, asin, category, is_active,
                 destination_check_status, created_at)
link_clicks (id, link_id, ip_hash, country, device_type,
             referrer_url, user_agent, clicked_at)
link_ab_tests (id, link_a_id, link_b_id, name, started_at, winner_id)
affiliate_networks (id, workspace_id, network_name, credentials_json,
                    is_connected, last_sync_at)
affiliate_earnings (id, workspace_id, network_id, report_date, clicks,
                    conversions, commission_amount, currency, status)
affiliate_sites (id, workspace_id, domain, name, niche, created_at)
```

### Claude Prompt — Link Cloaker + Tracker
```
Build an affiliate link cloaking and tracking system.

1. POST /api/affiliate/links — create cloaked link:
   - Validate original_url is a real URL
   - Generate unique 6-character alphanumeric slug (check uniqueness in DB)
   - If title not provided, fetch URL og:title with Cheerio
   - INSERT to affiliate_links: {workspace_id, original_url, short_slug, title, network, product_name}
   - Return: {cloaked_url: "https://{workspace_domain}/go/{slug}"}

2. GET /go/:slug — redirect handler (Express route, NOT Next.js):
   - SELECT original_url FROM affiliate_links WHERE short_slug = slug
   - If not found: 404
   - Extract tracking data:
     const country = req.headers['cf-ipcountry'] || geoip.lookup(ip)?.country
     const device = /Mobile|Android|iPhone/.test(userAgent) ? 'mobile' : 'desktop'
     const referrer = req.headers['referer'] || 'direct'
   - INSERT to link_clicks (non-blocking, fire and forget)
   - Return res.redirect(301, original_url)

3. GET /api/affiliate/links/:id/analytics — return stats:
   {
     total_clicks: count(*),
     unique_clicks: count(DISTINCT ip_hash),
     clicks_by_day: group by date(clicked_at) last 30 days,
     clicks_by_country: group by country order by count desc limit 10,
     clicks_by_device: group by device_type
   }

4. Amazon PA-API integration:
   POST /api/affiliate/amazon/search:
   - Build AWS Signature Version 4 signed request to:
     https://webservices.amazon.com/paapi5/searchitems
   - Params: {Keywords: q, SearchIndex: "All", Resources: ["Images.Primary.Large",
     "ItemInfo.Title", "Offers.Listings.Price", "CustomerReviews.StarRating"]}
   - Return normalized product array

5. Link health checker (BullMQ cron, daily):
   - For each active affiliate_link in all workspaces
   - HEAD request to original_url
   - If 404 or redirect to homepage: update destination_check_status='broken'
   - Send notification to workspace owner
```

---

## 17. Module 12 — Payments & Invoicing

### Purpose
Handle all billing, proposals, invoices, and subscriptions — replacing FreshBooks and HoneyBook.

### Core Features
- **Invoices:** create with line items, taxes, discounts, custom branding; send via email; track paid/unpaid/overdue status; automatic payment reminders
- **Estimates/proposals:** send quote with service list, client accepts with digital click → auto-converts to invoice
- **E-signature:** client signs proposal using built-in signature widget
- **Subscriptions:** create recurring billing plans via Stripe subscriptions (weekly/monthly/annual)
- **One-time Stripe Checkout:** generate payment link for any amount
- **Text-to-Pay:** send SMS with Stripe payment link, contact pays on phone
- **Tap-to-Pay:** for in-person payments via Stripe Reader
- **Order forms:** embeddable multi-product checkout with bump offers and upsell modals
- **Payment plans:** split large invoice into 2-12 installments, auto-charge on schedule
- **Multi-currency:** charge in 135+ currencies via Stripe
- **Revenue reports:** MRR, total collected by month, outstanding receivables, top-paying clients

---

## 18. Module 13 — Reputation Management

### Purpose
Automate review collection, monitor brand reputation, and respond with AI — replacing Reputation.com.

### Core Features
- **Review request automation:** trigger SMS or email asking for Google or Facebook review (configurable timing after sale/appointment)
- **Review gate:** happy customers (responded positively) → sent to Google; unhappy → sent to private feedback form (prevents bad public reviews)
- **Review monitoring:** pull reviews from Google Business Profile API and Facebook Graph API
- **AI review reply:** one-click GPT-4o generated reply for any review — tone matched to review sentiment
- **Review widget:** embed star rating display on client website (pulls live Google rating)
- **Video testimonial collector:** send request via email/SMS → contact records video in browser and submits
- **Sentiment trend chart:** average star rating over time, review volume per week
- **New review alerts:** instant notification when review posted (push + email)
- **Competitive review monitoring:** track competitor Google ratings alongside yours

---

## 19. Module 14 — Memberships & Online Courses

### Purpose
Host and sell digital courses, memberships, and downloads — replacing Kajabi and Teachable.

### Core Features
- **Course builder:** sections → lessons (video, text, audio, quiz, file download)
- **Membership tiers:** free/basic/pro — different tiers access different courses/content
- **Drip content:** release lessons on configurable schedule after enrollment date
- **Student progress:** completion percentage per lesson and course, last accessed timestamp
- **Completion certificates:** auto-generate branded PDF certificate (jsPDF + workspace branding)
- **Community forums:** Q&A board per course, threaded discussions
- **Assignments:** student uploads work, instructor reviews and grades
- **Live sessions:** Zoom/Google Meet link added to lesson
- **Stripe integration:** one-time or subscription access, bulk cohort pricing
- **Affiliate selling:** enable affiliate program per course, track course-specific referrals

---

## 20. Module 15 — AI Agent Studio

### Purpose
Build, train, and deploy niche-specific AI assistants for chat, customer intake, support, and sales — replacing Intercom and ManyChat.

### Core Features
- **Agent builder:** name, avatar, personality, role (Support Bot / Sales Bot / Intake Form / FAQ Bot / Appointment Booker)
- **Knowledge base:** upload PDFs, paste text, add URLs → AI chunks and indexes into pgvector
- **Conversation flows:** define scripted paths for common questions, AI handles everything else
- **Deployment channels:** live chat widget (website), SMS (Twilio), WhatsApp, Facebook Messenger
- **Lead capture mode:** agent collects name + email + phone before answering → auto-creates CRM contact
- **Appointment booking mode:** agent checks calendar availability and books via API
- **Human handoff:** when agent confidence drops below threshold or user asks for human, escalate to team inbox
- **Agent analytics:** conversations handled, leads captured, questions answered, handoff rate
- **Niche packs:** pre-built trained agents for dental, real estate, restaurant, e-commerce, coaching, legal

### Database Tables
```sql
ai_agents (id, workspace_id, name, avatar_url, role, system_prompt,
           personality_json, handoff_threshold, is_active, created_at)
agent_knowledge (id, agent_id, source_type, source_url, content_chunk,
                 embedding vector(1536), token_count, created_at)
agent_conversations (id, agent_id, contact_id, channel, session_id,
                     messages_json, lead_captured, handed_off, created_at)
agent_deployments (id, agent_id, channel, config_json,
                   widget_embed_code, created_at)
```

### Claude Prompt — AI Agent with RAG
```
Build an AI agent system with RAG (Retrieval Augmented Generation)
using pgvector.

1. Knowledge base ingestion API:
   POST /api/agents/:id/knowledge:
   - Accept: PDF file upload or URL or plain text
   - PDF: extract text with pdf-parse npm package
   - URL: scrape text content with Cheerio (strip HTML tags)
   - Split text into chunks: ~500 tokens each, 50-token overlap
   - For each chunk: call OpenAI embeddings API:
     POST https://api.openai.com/v1/embeddings
     { model: "text-embedding-3-small", input: chunk }
   - Store: INSERT INTO agent_knowledge (agent_id, content_chunk, embedding)
     VALUES ($1, $2, $3::vector)

2. Chat endpoint: POST /api/agents/:id/chat
   Input: { message, session_id, contact_id? }

   Step 1: Generate embedding for incoming message
   Step 2: Find relevant knowledge:
     SELECT content_chunk FROM agent_knowledge
     WHERE agent_id = $1
     ORDER BY embedding <-> $2::vector
     LIMIT 5
   Step 3: Retrieve last 10 messages for session from agent_conversations
   Step 4: Build OpenAI messages array:
     [
       { role: "system", content: agent.system_prompt + "

Relevant knowledge:
" + chunks.join("
") },
       ...conversation_history,
       { role: "user", content: message }
     ]
   Step 5: Call GPT-4o, get response
   Step 6: Check handoff conditions (low confidence patterns, user requests human)
   Step 7: Save message pair to agent_conversations
   Step 8: If email/phone detected in message, create/update CRM contact

3. Chat widget embed:
   GET /api/agents/:id/widget → return JavaScript snippet:
   <script>
     window.AgentConfig = { agentId: "{id}", position: "bottom-right" };
   </script>
   <script src="https://yourplatform.com/widget.js" async></script>

   widget.js: creates iframe overlay, handles open/close animation,
   posts messages to parent via postMessage API

4. Appointment booking flow:
   When agent detects booking intent (keyword matching):
   - Call GET /api/calendars/{workspace_id}/availability?date=today+7days
   - Show available slots in chat as clickable buttons
   - On slot selection: POST /api/appointments → create booking
   - Confirm booking details in chat response
```

---

## 21. Module 16 — Local SEO Tools

### Purpose
Dominate local search for service businesses — Google Business Profile management, citation building, map-pack tracking.

### Core Features
- **GBP management:** post updates, photos, Q&A, special offers, events directly from dashboard via Google Business Profile API
- **GBP post scheduler:** schedule GBP posts same as social media (text + image + CTA type)
- **Citation builder:** submit consistent NAP (Name, Address, Phone) to 50+ directories: Yelp, Yellow Pages, Bing Places, Apple Maps, TripAdvisor, Foursquare, etc.
- **Citation monitor:** weekly NAP consistency check across all submitted directories, flag inconsistencies
- **Map-pack rank tracker:** track keyword + "near [city]" search positions in local pack (DataForSEO Local SERP)
- **Local keyword research:** filter keyword tool results by city/metro area
- **Competitor local analysis:** scrape competitor GBP details (review count, categories, photos, posting frequency)
- **LocalBusiness schema injector:** auto-inject correct JSON-LD schema on client website pages
- **Review workflows:** Google-specific review request automations with review gate pre-screening

---

## 22. Module 17 — Ad Reporting Layer

### Purpose
Unified paid advertising performance dashboard — close the loop between ad spend, leads generated, and revenue closed.

### Core Features
- **Meta Ads integration:** connect Facebook/Instagram ad accounts via Meta Marketing API v20
- **Google Ads integration:** connect via Google Ads API
- **Unified spend dashboard:** total spend across Meta + Google (today / 7d / 30d / 90d)
- **Lead attribution:** which ad campaign/ad set/ad creative generated which CRM contacts (via UTM matching)
- **Close attribution:** which leads from ads became Won deals (close the revenue loop)
- **ROAS calculation:** Revenue from Won deals attributed to ads ÷ Ad spend
- **Campaign performance table:** campaign | spend | leads generated | CPL | deals closed | revenue | ROAS
- **Ad creative performance:** image/copy combinations ranked by CPL and conversion rate
- **Budget pacing alerts:** notify when monthly budget is 80% spent before month end
- **CPL threshold alert:** notify when CPL exceeds target for any campaign
- **White-label client report:** branded PDF report with spend, leads, ROAS for client delivery

---

## 23. Module 18 — Creative Studio

### Purpose
AI-powered visual asset generator — replacing Canva for all platform content needs.

### Core Features
- **AI image generator:** text prompt → photorealistic or illustrated image via DALL-E 3 or Stability AI SDXL
- **Blog featured image generator:** auto-generate from article title/keyword, consistent brand style
- **Pinterest pin designer:** 1000×1500 template editor with AI background fill, title text overlay, logo placement
- **Social post graphics:** square (1080×1080), portrait (1080×1350), landscape (1200×630) templates per platform
- **Ad creative generator:** Facebook/Instagram ad image (1200×628) with headline + subtext + CTA button overlay
- **YouTube thumbnail:** 1280×720 with title text, face photo background, colored accent strip
- **Logo generator:** simple AI-generated logo mark/wordmark from brand name and niche
- **Brand kit:** store primary color, secondary color, accent, logo URL, font choice — applied across all generated assets
- **Template library:** 200+ Canva-style templates by format and niche (fitness, food, tech, fashion, real estate, healthcare)
- **Bulk generation:** upload list of 10 article titles → generate 10 matching blog images automatically
- **Export formats:** PNG, JPG, WebP; direct publish to Social Planner queue

### Database Tables
```sql
brand_kits (id, workspace_id, primary_color, secondary_color,
            accent_color, logo_url, font_family, created_at)
creative_assets (id, workspace_id, type, title, image_url,
                 prompt_used, template_id, dimensions, created_at)
creative_templates (id, category, format, dimensions, name,
                    preview_url, template_json, is_global, niche)
```

---

## 24. Module 19 — Client Portal

### Purpose
Dedicated white-labeled workspace for each client — reduces agency email volume and increases perceived value.

### Core Features
- **Custom URL:** portal.clientdomain.com (or subdomain on agency domain)
- **Dashboard overview:** traffic, new leads, pipeline value, campaigns active, blog posts published, keyword rankings summary
- **Content approval:** review and approve/reject/comment on blog posts and social posts before they publish — email notification on new items awaiting review
- **Invoice history:** view all invoices, pay outstanding balance directly via Stripe embed
- **Task list:** view tasks assigned to them, upload deliverables, mark items complete, comment
- **Analytics reports:** traffic by source, leads by channel, ranking improvements, social performance — all in branded charts
- **Content calendar view:** see scheduled social posts, blog articles, campaigns planned for their account
- **Brand asset library:** upload/download logos, guidelines, images, videos organized by category
- **Direct messaging:** chat thread with agency team directly in portal
- **Access control:** strict data isolation — client sees only their workspace data, no other client data ever exposed

---

## 25. Module 20 — Affiliate/Referral Manager (Your Own Program)

### Purpose
Grow the platform virally — let users promote it and earn commissions, with each agency sub-account able to run their own affiliate program.

### Core Features
- **Auto-generated referral link:** every account gets a unique referral link on first login
- **Commission models:** flat fee per signup, % of first payment, recurring % of monthly MRR (most powerful for SaaS retention of affiliates)
- **Two-tier commissions:** Tier 1 earns from direct signups, Tier 2 earns a smaller % from those signups' referrals
- **Affiliate dashboard:** clicks, signups, active paying customers, total earned, pending payout, paid history
- **Promotional asset library:** pre-written email templates, social post captions, banner images in multiple sizes, video scripts — downloadable by affiliates
- **Leaderboard:** public or private top-10 affiliate ranking by revenue (gamification and motivation)
- **Fraud detection:** block same IP self-referrals, flag accounts with suspicious referral patterns
- **Payout processing:** Stripe Connect or PayPal mass payout, automatic monthly processing, minimum threshold ($50 default)
- **Sub-account affiliate programs:** each workspace can create their own affiliate program for their products/services with separate commission structures

---

## 26. Module 21 — Marketplace

### Purpose
Template and automation store — buy/sell/share pre-built configurations to accelerate client onboarding.

### Core Features
- **Snapshots:** complete workspace configuration packages — all workflows, funnels, email templates, pipeline stages, tags, and automation sequences for a specific niche (dental clinic, real estate agent, restaurant, fitness coach, e-commerce store, law firm, etc.)
- **Workflow templates:** single automation sequences (7-day lead nurture, review collection, appointment reminder series, re-engagement, birthday sequence)
- **Site themes:** full website templates for the AI Website Builder module, organized by niche
- **Email template packs:** 20-30 email templates per niche (subject lines, full HTML bodies)
- **Prompt packs:** curated GPT-4o prompts for specific industries — blog writing, social captions, ad copy, review replies — for non-technical users
- **Niche starter packs:** bundled all-in-one kits (snapshot + prompts + templates + setup video guide)
- **Seller program:** agencies and power users can submit their own templates for review, set price, earn revenue share (70% seller / 30% platform)
- **Freemium model:** free listings for community building + paid premium listings (one-time purchase)
- **One-click install:** purchase/claim a snapshot → single button installs all components into current workspace
- **Community ratings:** star ratings and written reviews on all marketplace items

---

## 27. Module 22 — Analytics & Reporting Dashboard

### Purpose
Master command center showing real-time and historical performance across every platform module.

### Core Features
- **Business overview KPIs (top row):** new contacts this month, pipeline value, revenue collected, articles published, keywords ranking page 1, social impressions
- **Traffic analytics:** website visitors by page, traffic source breakdown (organic/social/paid/email/direct), top landing pages, device breakdown, country heatmap
- **Lead attribution report:** which channel/campaign/keyword generates the most contacts, cost per lead if ads connected
- **Pipeline analytics:** deals by stage, average deal value, average time in each stage, win rate %, won revenue by month (bar chart)
- **Content analytics:** top articles by traffic, average time on page, bounce rate, articles by ranking position, top keywords driving traffic
- **Campaign analytics:** email open rates, click rates, unsubscribes, revenue attributed; SMS delivery rate, reply rate; A/B test results
- **Social analytics:** reach/impressions per platform, engagement rate, top performing posts, follower growth
- **Affiliate analytics:** clicks per network, EPC, total commissions by month, top performing links by revenue
- **White-label client reports:** one-click generate branded PDF/HTML report showing chosen date range, KPIs, and module performance for any sub-account
- **Custom date range selector:** compare any two periods side-by-side
- **Export:** CSV data export and PDF report export for any analytics section

---

## 28. Module 23 — White-Label SaaS Mode

### Purpose
Run the entire platform under your own brand and sell it to agency clients as your own SaaS product.

### Core Features
- **Custom domain:** platform runs entirely on your domain (yourplatform.com), never reveals underlying software
- **Full branding:** upload logo, set colors, platform name, custom favicon — applied throughout UI, emails, and documents
- **Sub-account system:** unlimited client workspaces with complete data isolation, each client has their own login, modules, and data
- **Custom pricing plans:** create your own plan tiers (Starter/Growth/Pro) with your own prices using Stripe; clients pay you directly
- **Rebilling markup:** mark up SMS, email, AI token, and SEO API costs with any margin; charge clients usage-based fees automatically
- **White-label emails:** all system emails (account created, invoice sent, automation notifications) sent from your domain with your branding
- **White-label mobile app:** optional Capacitor wrapper to package as native iOS/Android app with custom name, icon, and App Store listing
- **Stripe Connect:** collect payments from clients directly into your Stripe account, no payment processing exposure to end clients
- **Support desk:** built-in ticket/helpdesk system for your clients, under your brand
- **Usage limits per plan:** restrict modules (enable/disable per plan), contact limits, email sends, AI generation credits, team user seats
- **Agency dashboard:** see all sub-accounts, their plan, MRR, usage, last active, health status at a glance

---

## 29. Database Schema Overview

### Complete Tables Reference
```sql
-- ============ MULTI-TENANCY ============
workspaces (id UUID PK, owner_id UUID, name, slug, plan,
            custom_domain, branding_json, created_at)
workspace_users (id, workspace_id FK, user_id FK, role, permissions_json)
users (id UUID PK, email UNIQUE, name, avatar_url, created_at)

-- ============ CRM ============
contacts (id, workspace_id, first_name, last_name, email, phone,
          company_id, source, utm_source, utm_medium, utm_campaign,
          lead_score, assigned_to, created_at, updated_at)
companies (id, workspace_id, name, website, industry, size)
contact_tags (contact_id, tag_id)
tags (id, workspace_id, name, color)
custom_fields (id, workspace_id, field_name, field_type, options_json)
contact_custom_values (contact_id, field_id, value)
activity_log (id, workspace_id, contact_id, type, description,
              metadata_json, created_at)
contact_notes (id, contact_id, user_id, content, created_at)
contact_tasks (id, contact_id, assigned_to, title, due_date, status)

-- ============ PIPELINE ============
pipelines (id, workspace_id, name, created_at)
pipeline_stages (id, pipeline_id, name, order_index,
                 close_probability, color)
deals (id, workspace_id, pipeline_id, stage_id, contact_id, title,
       value, currency, assigned_to, expected_close_date, status,
       lost_reason, won_at, created_at)

-- ============ CONVERSATIONS ============
conversations (id, workspace_id, contact_id, channel, status,
               assigned_to, last_message_at)
messages (id, conversation_id, direction, channel, content,
          media_url, sender_id, is_internal_note, created_at)
channels (id, workspace_id, type, credentials_json, is_active)
canned_responses (id, workspace_id, shortcut, title, content)

-- ============ AUTOMATION ============
workflows (id, workspace_id, name, trigger_type, trigger_config_json,
           nodes_json, edges_json, is_active, created_at)
workflow_executions (id, workflow_id, contact_id, status,
                     started_at, completed_at)
workflow_execution_steps (id, execution_id, node_id,
                          executed_at, result_json, error_message)

-- ============ CALENDAR ============
calendars (id, workspace_id, name, type, slug, settings_json)
calendar_availability (id, calendar_id, day_of_week,
                       start_time, end_time)
appointments (id, calendar_id, contact_id, assigned_user_id,
              start_time, end_time, status, payment_intent_id)
appointment_reminders (id, appointment_id, channel, scheduled_at, sent_at)

-- ============ CAMPAIGNS ============
email_campaigns (id, workspace_id, name, type, subject, body_html,
                 from_name, from_email, status, scheduled_at, sent_at)
campaign_stats (id, campaign_id, sent, delivered, opened,
                clicked, bounced, unsubscribed)

-- ============ WEBSITE BUILDER ============
sites (id, workspace_id, name, domain, ssl_status, created_at)
pages (id, site_id, title, slug, meta_json, page_json,
       status, published_at)
funnels (id, workspace_id, name)
funnel_steps (id, funnel_id, page_id, step_order, step_type)
site_templates (id, name, category, niche, preview_image_url, page_json)

-- ============ SEO ============
keyword_lists (id, workspace_id, name)
keywords (id, workspace_id, list_id, keyword, volume, cpc,
          difficulty, intent)
tracked_keywords (id, workspace_id, keyword, domain, country)
keyword_rankings (id, tracked_keyword_id, position, url, date)
seo_audits (id, workspace_id, domain, results_json, score, created_at)

-- ============ BLOG ============
blog_articles (id, workspace_id, site_id, keyword, title, slug,
               content_html, meta_title, meta_desc, featured_image_url,
               schema_json, seo_score, readability_score, word_count,
               status, published_at, created_at)
content_schedules (id, workspace_id, site_id, articles_per_week,
                   publish_days_json, auto_publish, brand_voice,
                   target_niche, word_count, language)
content_queue (id, workspace_id, site_id, keyword, priority,
               status, article_id)

-- ============ SOCIAL ============
social_accounts (id, workspace_id, platform, account_name,
                 access_token, refresh_token, token_expires_at)
social_posts (id, workspace_id, platform, social_account_id,
              content, media_urls_json, scheduled_at,
              published_at, status, analytics_json)
pinterest_pins (id, workspace_id, board_id, title, description,
                destination_url, image_url, scheduled_at,
                published_at, pinterest_pin_id)
pinterest_boards (id, workspace_id, pinterest_board_id, name, description)

-- ============ AFFILIATE ============
affiliate_links (id, workspace_id, original_url, short_slug,
                 title, network, product_name, asin, is_active)
link_clicks (id, link_id, ip_hash, country, device_type,
             referrer_url, clicked_at)
affiliate_networks (id, workspace_id, network_name,
                    credentials_json, is_connected)
affiliate_earnings (id, workspace_id, network_id, report_date,
                    clicks, conversions, commission_amount, status)
affiliate_sites (id, workspace_id, domain, name, niche)

-- ============ PAYMENTS ============
invoices (id, workspace_id, contact_id, number, line_items_json,
          subtotal, tax, total, currency, status, due_date,
          paid_at, stripe_payment_intent_id)
subscriptions (id, workspace_id, contact_id, stripe_sub_id,
               plan_name, amount, currency, status, next_billing_date)

-- ============ AI AGENTS ============
ai_agents (id, workspace_id, name, avatar_url, role,
           system_prompt, personality_json, is_active)
agent_knowledge (id, agent_id, source_type, content_chunk,
                 embedding vector(1536), created_at)
agent_conversations (id, agent_id, contact_id, channel,
                     messages_json, lead_captured, created_at)

-- ============ CREATIVE ============
brand_kits (id, workspace_id, primary_color, secondary_color,
            logo_url, font_family)
creative_assets (id, workspace_id, type, title, image_url,
                 prompt_used, template_id, created_at)

-- ============ MARKETPLACE ============
marketplace_items (id, seller_workspace_id, type, name, description,
                   preview_url, price, category, niche,
                   install_count, rating_avg, status)
marketplace_purchases (id, buyer_workspace_id, item_id,
                       amount_paid, installed_at)
marketplace_reviews (id, item_id, workspace_id, rating, review, created_at)
```

---

## 30. API Integrations Master List

| Category | Service | Purpose | Cost Model |
|---|---|---|---|
| SMS/Voice | Twilio | SMS send/receive, calls, voicemail drops | Pay-per-use ~$0.0079/SMS |
| Email | SendGrid | Transactional + marketing email | $19.95/mo (50K emails) |
| Payments | Stripe | Invoices, subscriptions, Connect | 2.9% + $0.30/transaction |
| AI LLM | OpenAI GPT-4o | Article generation, agents, copy | ~$5/M input tokens |
| AI Images | OpenAI DALL-E 3 | Blog images, pin graphics | $0.04/image (1024x1024) |
| SEO Data | DataForSEO | Keyword volume, difficulty, SERP | Pay-per-call ~$0.001/request |
| SERP | SerpApi | Live Google results for briefs | $50/mo (5K searches) |
| Social | Meta Graph API | Facebook + Instagram | Free (standard access) |
| Social | LinkedIn API | LinkedIn posts | Free (limited rate) |
| Social | Pinterest API v5 | Pin creation, board management | Free |
| Social | Twitter/X API v2 | Tweets | $100/mo (Basic) |
| Social | TikTok API | Posts | Free (applied access) |
| Affiliate | Amazon PA-API 5.0 | Product search + links | Free (requires Associate) |
| Affiliate | ClickBank API | Sales tracking | Free |
| Affiliate | ShareASale API | Commission data | Free |
| Local SEO | Google Business Profile API | GBP posts and reviews | Free |
| Ads | Meta Marketing API | Campaign reporting | Free |
| Ads | Google Ads API | Campaign reporting | Free |
| Calendar | Google Calendar API | Two-way sync | Free |
| WhatsApp | Meta Cloud API | WhatsApp messaging | $0.005/conversation |
| AI Memory | pgvector | Agent embeddings | Postgres extension (free) |
| Realtime | Pusher | Live inbox updates | $49/mo (500K messages) |
| Storage | Cloudflare R2 | Images, files, videos | $0.015/GB stored |
| AI Detection | Originality.ai API | Blog quality check | $0.01/200 words |
| Analytics | PostHog | Product analytics | Free up to 1M events |
| Monitoring | Sentry | Error tracking | Free up to 5K errors |

---

## 31. Build Phases & Roadmap

### Phase 1 — Core CRM Foundation (Weeks 1–3)
- [ ] Project setup: Next.js 15, Prisma, PostgreSQL, NextAuth
- [ ] Multi-tenant workspace system with sub-accounts
- [ ] User authentication, roles, permissions
- [ ] Contact management (full CRUD, custom fields, tags, smart lists)
- [ ] Sales pipeline (Kanban + deal management)
- [ ] Unified inbox (email + Twilio SMS)
- [ ] Basic workflow automation (5 trigger types, 8 action types)
- [ ] Calendar + appointment booking
- [ ] Stripe invoicing + basic payments

### Phase 2 — Website & Content Foundation (Weeks 4–6)
- [ ] AI Website builder (Craft.js + GPT-4o generation endpoint)
- [ ] Funnel builder (multi-step page flows)
- [ ] Blog/CMS module with manual publishing
- [ ] Form builder (drag-drop + embed code)
- [ ] Email campaign builder (drag-drop editor + send)
- [ ] SMS campaigns

### Phase 3 — SEO & Auto-Blog Engine (Weeks 7–9)
- [ ] Keyword research dashboard (DataForSEO API)
- [ ] Rank tracker (BullMQ daily check job)
- [ ] AI auto-blog pipeline (SerpApi → GPT-4o → DALL-E → publish)
- [ ] SEO score calculator
- [ ] Schema markup injection
- [ ] Content calendar + scheduling UI

### Phase 4 — Social & Pinterest Automation (Weeks 10–11)
- [ ] Meta, LinkedIn, X social account connections
- [ ] Social content calendar + post scheduler
- [ ] Blog-to-social AI repurposing feature
- [ ] Pinterest API connection + pin generator (Sharp.js)
- [ ] Pinterest board management + bulk pin scheduler

### Phase 5 — Affiliate Marketing Hub (Weeks 12–13)
- [ ] Affiliate link cloaker + redirect handler + click tracker
- [ ] Amazon PA-API product search + link generator
- [ ] Multi-network earnings dashboard
- [ ] AI product review writer (integrates with blog module)
- [ ] Niche site manager UI

### Phase 6 — AI Agents & Advanced Modules (Weeks 14–16)
- [ ] AI agent builder with pgvector RAG
- [ ] Chat widget embed code generation
- [ ] Creative studio (DALL-E + Sharp.js templates)
- [ ] Client portal (isolated client login + approvals)
- [ ] Ad reporting (Meta + Google Ads API)
- [ ] Local SEO tools (GBP API + citation manager)
- [ ] Reputation management (review requests + monitoring)
- [ ] Memberships & courses module

### Phase 7 — Marketplace & White-Label (Weeks 17–18)
- [ ] Marketplace frontend (browse, purchase, install)
- [ ] Snapshot system (export/import workspace config)
- [ ] White-label domain + branding settings
- [ ] Sub-account billing, plan limits, usage tracking
- [ ] Platform affiliate/referral program
- [ ] Mobile app wrapper (Capacitor for iOS/Android)

---

## 32. Claude AI Prompt Templates

### Master System Prompt (Paste at Start of Every New Claude Conversation)
```
You are a senior full-stack developer building [PLATFORM_NAME], an
AI-powered all-in-one CRM and business growth platform.

TECH STACK:
- Frontend: Next.js 15 (App Router), shadcn/ui, Tailwind CSS v4
- Backend: Node.js 22 with Express, Prisma ORM, PostgreSQL 16
- Queue jobs: BullMQ with Redis
- AI: OpenAI GPT-4o API (sk-...)
- Payments: Stripe API
- SMS/Voice: Twilio
- File Storage: Cloudflare R2 (S3-compatible)
- Realtime: Pusher
- Auth: NextAuth.js v5
- Drag and Drop: @hello-pangea/dnd (pipeline), React Flow (automation), Craft.js (page builder)

CRITICAL ARCHITECTURE RULES:
1. ALL database queries MUST include workspace_id filter (multi-tenant)
2. Use Prisma for all DB operations
3. API response format: { success: boolean, data: any, error?: string }
4. Use BullMQ for all async jobs (never block HTTP response)
5. Validate all inputs with Zod schemas before processing
6. Get workspace_id from NextAuth session on every protected route
7. Never expose API keys to frontend — all external API calls go through backend

I am currently building: [CURRENT MODULE NAME]
Here is the exact spec for what I need you to build:
[PASTE MODULE SPEC FROM THIS PRD]
```

### Per-Module Prompt Wrapper
```
MODULE: [Module Name from PRD]
PRIORITY: [High/Medium/Low]

WHAT I NEED BUILT NOW:
[Specific feature from module — be precise, one feature at a time]

DATABASE CHANGES NEEDED:
[Relevant Prisma schema from PRD]

API ENDPOINTS:
[List endpoints from PRD module spec]

UI TO BUILD:
[Specific pages/components needed]

DEPENDENCIES/INTEGRATIONS:
[Any external APIs or other modules this connects to]

ADDITIONAL CONTEXT:
- This is part of a larger CRM platform
- All data is workspace-scoped (always filter by workspace_id)
- Use shadcn/ui components (Button, Input, Select, Dialog, Sheet, Table, Card, Badge, Tabs)
- All pages are protected routes (redirect to login if no session)

DELIVER:
1. Prisma schema additions (add to schema.prisma)
2. API route files (Next.js API routes or Express routes)
3. React page/component code
4. BullMQ job workers (if async processing needed)
5. Any webhook handlers (Twilio, Stripe, Meta, etc.)
```

### Quick Reference: Module Build Order for Claude
```
Session 1:  Project setup, auth, workspace system
Session 2:  Contact management (list, detail, custom fields, import)
Session 3:  Sales pipeline (Kanban, deals, deal drawer)
Session 4:  Conversations inbox (Twilio SMS + email integration)
Session 5:  Workflow automation builder (React Flow canvas)
Session 6:  Calendar and appointment booking
Session 7:  Email campaign builder + send system
Session 8:  AI Website builder (Craft.js + GPT-4o generation)
Session 9:  SEO keyword research dashboard (DataForSEO)
Session 10: AI auto-blog pipeline (full Node.js pipeline)
Session 11: Rank tracker (BullMQ cron jobs + charts)
Session 12: Social media planner + scheduler
Session 13: Pinterest pin generator (Sharp.js)
Session 14: Affiliate link cloaker + Amazon integration
Session 15: Multi-network affiliate earnings dashboard
Session 16: AI agent builder with pgvector RAG
Session 17: Creative studio (AI image templates)
Session 18: Client portal (isolated login + approvals)
Session 19: Payments + invoicing (Stripe full integration)
Session 20: White-label SaaS mode + marketplace
```

---

*Document End*
*Total Modules: 23 | APIs Integrated: 25+ | Database Tables: 60+ | Estimated Build: 18 Weeks*
*Built with Claude AI — Feed Module Specs One at a Time for Best Results*
