# AIMINDSHARE.COM — FINAL BUILD-SEQUENCE CLAUDE CODE PROMPTS v3.0
### One consolidated, ready-to-paste prompt per session, 0 through 47, in build order

> Combines BUILD-SEQUENCE-v1_0.md, BUILD-SEQUENCE-PROMPTS-v2_0.md, and AiMindShare-Claude-Code-Prompts-v1.md into a single authoritative script. Attach list for every session: **Constitution + DECISIONS-AiMindShare-v1_0.md + this module's schema slice + this module's PRD + this doc's session entry + DEFINITION-OF-DONE-v1_0.md + TASKS.md.** Never start a session before its dependencies show Done in TASKS.md.

---

## Session 0 — Supabase Project Setup
*Setup*

```
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec Constitution + DECISIONS + this doc's Session 0 entry + TASKS.md, BUILD-SEQUENCE-v1_0.md's entry for Session 0, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module Supabase Project Setup for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in Constitution + DECISIONS + this doc's Session 0 entry + TASKS.md.
- Accept-when criteria for this session: Leak probe green on tenancy tables; a test queued job is claimed and marked done by a stub worker; a stub Edge Function reads Vault and returns the standard envelope; DoD Gate-8 greps run clean on the empty scaffold.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. session-0-supabase-project-setup.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 1 — M00: Auth & Identity
*Phase 1 — Foundation + Core CRM*

```
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M00, BUILD-SEQUENCE-v1_0.md's entry for Session 1, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M00 — Auth & Identity for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M00.
- Accept-when criteria for this session: Sign-up/in (email, Google, magic link), 2FA, reset, session mgmt via Supabase Auth; profiles row auto-created on signup.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m00-auth-and-identity.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 2 — M01: Workspaces & Multi-Tenancy
*Phase 1 — Foundation + Core CRM*

```
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M01, BUILD-SEQUENCE-v1_0.md's entry for Session 2, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M01 — Workspaces & Multi-Tenancy for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M01.
- Accept-when criteria for this session: Create agency + sub-account, switch workspaces, provisioning creates owner membership; agency reach = explicit membership (RLS doc §1).
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m01-workspaces-and-multi-tenancy.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 3 — M02: Roles & Permissions
*Phase 1 — Foundation + Core CRM*

```
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M02, BUILD-SEQUENCE-v1_0.md's entry for Session 3, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M02 — Roles & Permissions for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M02.
- Accept-when criteria for this session: Invitation flow (email → accept → membership), role change UI, permission overrides read by a test Edge Fn; matrix verified per DoD Gate 2.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m02-roles-and-permissions.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 4 — M03: Billing & Usage Metering (platform)
*Phase 1 — Foundation + Core CRM*

```
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M03, USAGE-METERING doc (write before this session), BUILD-SEQUENCE-v1_0.md's entry for Session 4, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M03 — Billing & Usage Metering (platform) for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M03, USAGE-METERING doc (write before this session).
- Accept-when criteria for this session: Stripe subscription checkout via Edge Fn + verified webhook; plan gates enforced; usage_meters upsert path proven with a synthetic event.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m03-billing-and-usage-metering-platform.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 5 — M41-slice: Credential Vault (slice only)
*Phase 1 — Foundation + Core CRM*

```
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M41, BUILD-SEQUENCE-v1_0.md's entry for Session 5, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M41-slice — Credential Vault (slice only) for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M41.
- Accept-when criteria for this session: integrations table + Vault write/read via Edge Fn; connection health ping; public API deferred to Phase 7.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m41-slice-credential-vault-slice-only.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 6 — M04: Notifications Center
*Phase 1 — Foundation + Core CRM*

```
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M04, BUILD-SEQUENCE-v1_0.md's entry for Session 6, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M04 — Notifications Center for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M04.
- Accept-when criteria for this session: In-app feed (Realtime), prefs, digest schedule as pg_cron → jobs; email channel stubbed until D-011 (provider) is decided.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m04-notifications-center.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 7 — M05: Compliance Basics
*Phase 1 — Foundation + Core CRM*

```
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M05, BUILD-SEQUENCE-v1_0.md's entry for Session 7, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M05 — Compliance Basics for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M05.
- Accept-when criteria for this session: Consent records write path, opt-in capture, A2P registration workflow screens (Twilio wiring can stub), GDPR request intake → gdpr.export/erase jobs.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m05-compliance-basics.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 8 — M09: CRM
*Phase 1 — Foundation + Core CRM*

```
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M09, BUILD-SEQUENCE-v1_0.md's entry for Session 8, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M09 — CRM for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M09.
- Accept-when criteria for this session: Contacts/companies CRUD, tags, custom fields, smart lists (AND/OR), notes, tasks, timeline, CSV import (as a job), dup detection (pg_trgm), bulk actions.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m09-crm.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 9 — M11: Pipeline
*Phase 1 — Foundation + Core CRM*

```
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M11, BUILD-SEQUENCE-v1_0.md's entry for Session 9, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M11 — Pipeline for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M11.
- Accept-when criteria for this session: Multi-pipeline kanban (SortableJS), deal drawer, win/loss + reasons, weighted forecast, stage-move triggers write activity_log; list view + bulk moves.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m11-pipeline.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 10 — M12: Inbox — Email + SMS
*Phase 1 — Foundation + Core CRM*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M12, BUILD-SEQUENCE-v1_0.md's entry for Session 10, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M12 — Inbox — Email + SMS for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M12.
- Accept-when criteria for this session: Threads via Realtime, Twilio inbound webhook (signature-verified) + outbound send (meter++), internal notes, canned / responses, assignment; WhatsApp/FB/IG defer to their provider weeks.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m12-inbox---email-+-sms.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 11 — M13: Automations
*Phase 1 — Foundation + Core CRM*

```

please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M13, BUILD-SEQUENCE-v1_0.md's entry for Session 11, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M13 — Automations for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M13.
- Accept-when criteria for this session: Drawflow canvas → nodes/edges jsonb; ≥5 trigger + ≥8 action node types; executions run as jobs with step logs; enable/disable; IF/ELSE + wait.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m13-automations.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 12 — M14: Calendar & Booking
*Phase 1 — Foundation + Core CRM*

```
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M14, BUILD-SEQUENCE-v1_0.md's entry for Session 12, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M14 — Calendar & Booking for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M14.
- Accept-when criteria for this session: Public booking page (no-auth read via Edge Fn), availability rules, Google two-way sync (OAuth token → Vault), reminders as cron-enqueued jobs, reschedule/cancel links.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m14-calendar-and-booking.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 13 — M28: Payments & Invoicing
*Phase 1 — Foundation + Core CRM*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M28, BUILD-SEQUENCE-v1_0.md's entry for Session 13, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M28 — Payments & Invoicing for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M28.
- Accept-when criteria for this session: Invoices CRUD + send, Stripe checkout links, estimate→invoice, subscriptions, Stripe webhook idempotent by event id; revenue rollups.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m28-payments-and-invoicing.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 14 — M44: Admin Basics
*Phase 1 — Foundation + Core CRM*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M44, BUILD-SEQUENCE-v1_0.md's entry for Session 14, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M44 — Admin Basics for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M44.
- Accept-when criteria for this session: Super-admin gate (JWT claim), workspace/user list, jobs monitor (reads public.jobs), feature flags, audited impersonation.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m44-admin-basics.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 15 — M08-noCopilot: Dashboard (no Copilot)
*Phase 1 — Foundation + Core CRM*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M08, BUILD-SEQUENCE-v1_0.md's entry for Session 15, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M08-noCopilot — Dashboard (no Copilot) for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M08.
- Accept-when criteria for this session: KPI strip (Chart.js), activity feed, quick actions, needs-panel — using the reference mockup components; Copilot deferred to Phase 8.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m08-nocopilot-dashboard-no-copilot.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 16 — M15: Forms & Surveys
*Phase 2 — Acquisition & Sites*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M15, BUILD-SEQUENCE-v1_0.md's entry for Session 16, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M15 — Forms & Surveys for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M15.
- Accept-when criteria for this session: Builder → schema jsonb, embeds/popups, conditional logic, routing rules, spam guard; submission → contact + source tags + consent record.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m15-forms-and-surveys.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 17 — M16: Campaigns
*Phase 2 — Acquisition & Sites*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M16, BUILD-SEQUENCE-v1_0.md's entry for Session 17, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M16 — Campaigns for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M16.
- Accept-when criteria for this session: Email builder (Quill/TipTap-vanilla), broadcasts + drips as fan-out jobs, A/B subjects, unsubscribe compliance (M05), meters++ per send; requires D-011 (email provider) decided.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m16-campaigns.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 18 — M19: Sites (GrapeJS)
*Phase 2 — Acquisition & Sites*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M19, BUILD-SEQUENCE-v1_0.md's entry for Session 18, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M19 — Sites (GrapeJS) for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M19.
- Accept-when criteria for this session: AI generate → page_json, GrapeJS editor, publish path, custom domain + SSL flow, per-page SEO/schema, CRM widget embeds; write the GrapeJS per-screen spec the session before.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m19-sites-grapejs.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 19 — M20: Funnels
*Phase 2 — Acquisition & Sites*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M20, BUILD-SEQUENCE-v1_0.md's entry for Session 19, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M20 — Funnels for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M20.
- Accept-when criteria for this session: Step builder on M19 pages, funnel map with per-step conversion, A/B split with winner detection, order forms wired to M28.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m20-funnels.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 20 — M06: Media Library
*Phase 2 — Acquisition & Sites*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M06, BUILD-SEQUENCE-v1_0.md's entry for Session 20, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M06 — Media Library for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M06.
- Accept-when criteria for this session: Storage-backed folders, upload, AI auto-tagging (as jobs), usage-tracking backfill (used_in), brand collections.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m06-media-library.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 21 — M21: SEO Engine
*Phase 3 — SEO & Content*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M21, BUILD-SEQUENCE-v1_0.md's entry for Session 21, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M21 — SEO Engine for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M21.
- Accept-when criteria for this session: Keyword research via Edge Fn (DataForSEO, meter++), collections, rank tracker as daily cron jobs on the worker, audits as seo.audit.crawl worker jobs, weekly rank email.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m21-seo-engine.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 22 — M22-manual: Content/CMS — Manual
*Phase 3 — SEO & Content*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M22, BUILD-SEQUENCE-v1_0.md's entry for Session 22, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M22-manual — Content/CMS — Manual for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M22.
- Accept-when criteria for this session: Blog manager, revisions, categories/authors, editorial queue, readability/SEO scoring, publish to M19 sites.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m22-manual-content-cms---manual.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 23 — M22-auto: Content/CMS — Auto-Blog Pipeline
*Phase 3 — SEO & Content*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M22, PROMPT-LIBRARY doc (written before this session), BUILD-SEQUENCE-v1_0.md's entry for Session 23, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M22-auto — Content/CMS — Auto-Blog Pipeline for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M22, PROMPT-LIBRARY doc (written before this session).
- Accept-when criteria for this session: Full keyword→publish pipeline as chained worker jobs (blog.generate on the real worker), schedules via cron, bulk CSV.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m22-auto-content-cms---auto-blog-pipeline.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 24 — M23: Social Planner
*Phase 4 — Social & Pinterest*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M23, BUILD-SEQUENCE-v1_0.md's entry for Session 24, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M23 — Social Planner for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M23.
- Accept-when criteria for this session: Calendar, composer, best-time scheduling, approval flow, blog-to-social repurposing (jobs), posting via cron→jobs; OAuth tokens → Vault.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m23-social-planner.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 25 — M24: Pinterest
*Phase 4 — Social & Pinterest*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M24, BUILD-SEQUENCE-v1_0.md's entry for Session 25, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M24 — Pinterest for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M24.
- Accept-when criteria for this session: Pin generator (pin.render Sharp.js worker jobs), boards, bulk pins, scheduler, UTM auto-tag, analytics.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m24-pinterest.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 26 — M29: Affiliate Hub
*Phase 5 — Commerce & Ops Depth*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M29, BUILD-SEQUENCE-v1_0.md's entry for Session 26, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M29 — Affiliate Hub for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M29.
- Accept-when criteria for this session: Cloaker/redirect Edge Fn + click tracking, Amazon PA-API, network dashboards, AI review writer (jobs).
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m29-affiliate-hub.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 27 — M17: Proposals & Contracts
*Phase 5 — Commerce & Ops Depth*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M17, BUILD-SEQUENCE-v1_0.md's entry for Session 27, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M17 — Proposals & Contracts for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M17.
- Accept-when criteria for this session: Templates, CRM auto-fill, multi-party e-sign with audit trail, accept→invoice (M28), view analytics.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m17-proposals-and-contracts.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 28 — M18: Projects & Team Ops
*Phase 5 — Commerce & Ops Depth*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M18, BUILD-SEQUENCE-v1_0.md's entry for Session 28, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M18 — Projects & Team Ops for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M18.
- Accept-when criteria for this session: Projects, SortableJS task kanban, time tracking, deal-won→project automation (M13 hook).
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m18-projects-and-team-ops.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 29 — M10: Enrichment & Intent
*Phase 5 — Commerce & Ops Depth*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M10, BUILD-SEQUENCE-v1_0.md's entry for Session 29, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M10 — Enrichment & Intent for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M10.
- Accept-when criteria for this session: Provider enrichment as jobs (meter: enrichment), visitor de-anon, intent scoring.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m10-enrichment-and-intent.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 30 — M33: AI Agent Studio
*Phase 6 — AI & Client-Facing*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M33, BUILD-SEQUENCE-v1_0.md's entry for Session 30, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M33 — AI Agent Studio for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M33.
- Accept-when criteria for this session: Agent builder, knowledge ingestion → pgvector (ivfflat), web-widget deploy, handoff thresholds; Copilot-adjacent per-screen spec first.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m33-ai-agent-studio.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 31 — M35: Creative Studio
*Phase 6 — AI & Client-Facing*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M35, BUILD-SEQUENCE-v1_0.md's entry for Session 31, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M35 — Creative Studio for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M35.
- Accept-when criteria for this session: Image gen via Edge Fn (meter: image_gen), brand kit, templates, publish to M23.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m35-creative-studio.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 32 — M37: Client Portal
*Phase 6 — AI & Client-Facing*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M37, BUILD-SEQUENCE-v1_0.md's entry for Session 32, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M37 — Client Portal for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M37.
- Accept-when criteria for this session: Portal login (portal_access), narrowed sel_client policies live, approvals + pay-online; portal leak test is the headline gate.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m37-client-portal.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 33 — M40: Analytics & Report Builder
*Phase 6 — AI & Client-Facing*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M40, BUILD-SEQUENCE-v1_0.md's entry for Session 33, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M40 — Analytics & Report Builder for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M40.
- Accept-when criteria for this session: KPI overview, custom report builder (Chart.js), saved dashboards, scheduled delivery (cron jobs), white-label PDF.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m40-analytics-and-report-builder.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 34 — M26: Local SEO
*Phase 6 — AI & Client-Facing*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M26, BUILD-SEQUENCE-v1_0.md's entry for Session 34, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M26 — Local SEO for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M26.
- Accept-when criteria for this session: GBP mgmt + post scheduler (cron), citations, NAP monitor, map-pack tracking.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m26-local-seo.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 35 — M27: Ads & Attribution
*Phase 6 — AI & Client-Facing*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M27, BUILD-SEQUENCE-v1_0.md's entry for Session 35, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M27 — Ads & Attribution for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M27.
- Accept-when criteria for this session: Meta/Google connections (Vault), spend dashboard, UTM→contact→deal close attribution, ROAS.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m27-ads-and-attribution.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 36 — M30: Reputation
*Phase 6 — AI & Client-Facing*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M30, BUILD-SEQUENCE-v1_0.md's entry for Session 36, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M30 — Reputation for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M30.
- Accept-when criteria for this session: Review request automations, review gate, monitoring, AI replies (jobs), widgets.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m30-reputation.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 37 — M31: Memberships & Courses
*Phase 6 — AI & Client-Facing*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M31, BUILD-SEQUENCE-v1_0.md's entry for Session 37, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M31 — Memberships & Courses for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M31.
- Accept-when criteria for this session: Course builder, drip, progress, certificates (PDF jobs), Stripe access control.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m31-memberships-and-courses.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 38 — M42: White-Label
*Phase 7 — Platform & Resale*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M42, BUILD-SEQUENCE-v1_0.md's entry for Session 38, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M42 — White-Label for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M42.
- Accept-when criteria for this session: Custom domains, branding, Stripe Connect plans, rebilling markup (M03), agency dashboard.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m42-white-label.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 39 — M39: Marketplace
*Phase 7 — Platform & Resale*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M39, BUILD-SEQUENCE-v1_0.md's entry for Session 39, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M39 — Marketplace for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M39.
- Accept-when criteria for this session: Snapshots (workspace config export/import as jobs), listings, 70/30 seller program, one-click install.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m39-marketplace.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 40 — M38: Referral Manager
*Phase 7 — Platform & Resale*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M38, BUILD-SEQUENCE-v1_0.md's entry for Session 40, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M38 — Referral Manager for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M38.
- Accept-when criteria for this session: Links, commission models, two-tier, fraud checks, Connect/PayPal payouts.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m38-referral-manager.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 41 — M34: Voice Agents
*Phase 7 — Platform & Resale*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M34, BUILD-SEQUENCE-v1_0.md's entry for Session 41, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M34 — Voice Agents for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M34.
- Accept-when criteria for this session: Requires the persistent media service decision (D-013) resolved; inbound receptionist, booking against M14, transcripts→timeline, voice_minutes meter.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m34-voice-agents.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 42 — M41-api: Public API
*Phase 7 — Platform & Resale*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M41, BUILD-SEQUENCE-v1_0.md's entry for Session 42, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M41-api — Public API for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M41.
- Accept-when criteria for this session: API keys (hashed), rate limits, REST surface over RLS-safe queries, webhooks out.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m41-api-public-api.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 43 — M25: Video Studio
*Phase 8 — Differentiators*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M25, BUILD-SEQUENCE-v1_0.md's entry for Session 43, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M25 — Video Studio for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M25.
- Accept-when criteria for this session: Requires render infra (D-013); script→TTS→visuals→captions pipeline as heavy worker jobs.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m25-video-studio.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 44 — M32: Conversational Commerce
*Phase 8 — Differentiators*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M32, BUILD-SEQUENCE-v1_0.md's entry for Session 44, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M32 — Conversational Commerce for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M32.
- Accept-when criteria for this session: Catalog sync, chat cart, checkout links, abandoned-chat recovery.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m32-conversational-commerce.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 45 — M36: AI Insights & Churn
*Phase 8 — Differentiators*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M36, BUILD-SEQUENCE-v1_0.md's entry for Session 45, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M36 — AI Insights & Churn for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M36.
- Accept-when criteria for this session: Health scoring + churn prediction as scheduled jobs, retention automations, weekly digest.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m36-ai-insights-and-churn.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 46 — M43: Mobile Field App
*Phase 8 — Differentiators*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M43, BUILD-SEQUENCE-v1_0.md's entry for Session 46, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M43 — Mobile Field App for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M43.
- Accept-when criteria for this session: Capacitor wrapper decision, offline capture queue, card scanner, voice notes.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m43-mobile-field-app.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```

## Session 47 — M08-copilot: Copilot (full)
*Phase 8 — Differentiators*

```
please  make sure use Superpowers plugins and Andrej-karpathy-skills
Based on the Constitution, DECISIONS-AiMindShare-v1_0.md, the schema slice for this module, PRD
module spec PRD_M08, BUILD-SEQUENCE-v1_0.md's entry for Session 47, DEFINITION-OF-DONE-v1_0.md,
and TASKS.md, using AIMINDSHARE-DESIGN-v1_0.md as the design system and reference visuals/mockups,
preserve the AiMindShare-inspired look: dark mode and light mode background, glassmorphism panels,
atmospheric soft gradients, typography hierarchy, border treatment, and spacing rhythm — but no
stars or dots in the dark-mode background.

Build module M08-copilot — Copilot (full) for AiMindShare.com, vertical-slice to full Definition-of-Done, on the
vanilla HTML/CSS/JS + Supabase stack (Postgres + RLS + Edge Functions + Storage + Realtime + pg_cron;
no Next.js/Prisma/BullMQ). All tables and queries must be scoped by workspace_id per the RLS template.
This session's attach list is Constitution + DECISIONS + schema slice + this module's PRD + this
session's BUILD-SEQUENCE entry + TASKS.md.

Requirements:
- Follow the established design system, branding, color palette, typography, spacing, and visual language exactly as defined in AIMINDSHARE-DESIGN-v1_0.md.
- Use beautiful layouts, thoughtful animations (where applicable), premium card designs, meaningful Islamic-inspired visual elements, and clear conversion-focused UX.
- The UI must feel modern, elegant, trustworthy, and premium while remaining highly usable — comparable to Apple, Stripe, Linear, Notion, Headspace, and Calm.
- Implement every submodule and interaction described in PRD_M08.
- Accept-when criteria for this session: NL queries over workspace data via pgvector RAG, daily briefing; Copilot per-screen spec + PROMPT-LIBRARY entries first.
- Ensure full responsiveness across desktop, tablet, and mobile devices.
- Include all relevant sections, states (empty/loading/error/success), interactions, onboarding flows, illustrations, and CTAs necessary for an exceptional user experience.
- Use realistic seed/sample content where appropriate; no mock data left in production code paths.
- Maintain visual and component consistency with previously built AiMindShare modules.
- Prioritize accessibility, readability, and RLS/security correctness — run the leak-probe checklist for any new tables.
- Stop and flag rather than improvising if this session's dependencies aren't Done yet in TASKS.md, or if an open DECISIONS item blocks this module.

Deliverables:
- High-fidelity mockup of all screens in this module.
- Production-ready frontend file(s) (HTML/CSS/JS), e.g. m08-copilot-copilot-full.html, plus any supporting components.
- Any new Supabase migrations, RLS policies, and Edge Functions required.
- Responsive desktop, tablet, and mobile layouts.
- Modern animations and micro-interactions.
- Premium visual assets, icons, and component specifications.
- A short design/architecture rationale explaining major UX and technical decisions for this module.
- Updated TASKS.md reflecting what's Done vs carried over.

The final result should look like a flagship feature of a premium AI-powered SaaS platform — visually
impressive enough to showcase to investors, partners, and potential users.
```
