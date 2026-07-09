# AiMindShare-Document-List-v2_0.md
### AiMindShare.com — Definitive Document List · v2.0
**Supersedes v1.0** (which assumed the PRD's Next.js/Node/Prisma/Redis/BullMQ stack)

> **Locked by Milan, 2026-07-02:**
> · Frontend: **vanilla HTML / CSS / JS** — no frameworks, no build tools
> · Backend: **Supabase** — Postgres + Auth + RLS + Storage + Realtime + Edge Functions
> · Design: **inherits `QURANLYAI_DESIGN.md`** (teal `#00696E` / gold `#C5A059`, Cormorant Garamond / Inter / Amiri, 0.5px hairlines)
> · Async/pipeline work: **`jobs` table + workers** (the proven PublishlyAI control-plane pattern) + `pg_cron`
>
> This overrides PRD §3 entirely. The PRD's *functionality* stands; its *stack* does not.

---

## The 13 documents you need (+ 1 living file)

### A · Before the first Claude Code session — 6 docs

**1 · `CLAUDE-AiMindShare-v1_0.md` — Session Constitution**
The rulebook every session inherits. Locks: the stack above; multi-tenancy law (`workspace_id` + RLS on every table — no exceptions); all secrets live in Supabase Vault / Edge Functions, never in the browser; every billable action increments an M03 meter; every async action is a `jobs` row, never a browser-side loop; QuranlyAI forbidden patterns carried over (no shimmer, 3 fonts only, dark-mode as sibling `[data-theme="dark"]` block, `quranlyai.com` spelling in any ecosystem link); `str_replace`-only edits; docs-first; vertical builds.

**2 · `DECISIONS-AiMindShare-v1_0.md` — Decisions Log**
Day-one entries to record (mostly already made by the stack lock):
- **LOCKED:** vanilla + Supabase stack override of PRD §3 · design inheritance from QURANLYAI_DESIGN.md · jobs-table async pattern · RLS as the tenancy mechanism
- **LOCKED library swaps** (the PRD's React-only libraries → vanilla equivalents):
  | PRD assumed | Vanilla replacement | Used by |
  |---|---|---|
  | React Flow (automation canvas) | **Drawflow** | M13 |
  | Craft.js (site builder) | **GrapeJS** (already the PRD's own alternate — it's vanilla) | M19, M20 |
  | @hello-pangea/dnd (kanban) | **SortableJS** | M11, M18 |
  | TanStack Table | plain tables + small helpers | everywhere |
  | Zustand / React Hook Form | plain JS state + native forms | everywhere |
  | Recharts | **Chart.js** (PRD's own alternate — vanilla) | M08, M40 |
  | TipTap (rich text) | TipTap vanilla build **or** Quill | M12, M16, M22 |
  | Pusher | **Supabase Realtime** | M12 |
  | S3 | **Supabase Storage** | M06 |
  | NextAuth | **Supabase Auth** | M00 |
  | BullMQ + Redis | **`jobs` table + pg_cron + workers** | all async |
- **LOCKED by inspiration mockup (2026-07-02):** design reference = `publishlyai-command-center.html` (extended token set + dashboard component library) · **light-mode default** · ~~JetBrains Mono replaces Amiri as the third font~~ → **superseded by D-014 (2026-07-03): fonts are now Cormorant Garamond / Baskerville / Shippori Mincho**
- **OPEN (human calls):** hosting (Cloudflare Pages + Access vs GitHub Pages — same call as D-CONSOLE-001) · worker runtime for heavy jobs (GitHub Actions, like PublishlyAI, vs a small VPS) · email provider (Resend vs SendGrid) · whether AiMindShare reads/writes the shared `islamicinfo-theme` key or its own `aimindshare-theme` (same call as D-CONSOLE-004 — decide once for both dashboard products)

**3 · `DATA-SCHEMA-v1_0.md` — Canonical Supabase Schema**
The single source of truth Claude Code diffs against: every table as SQL migration, `workspace_id uuid not null` + index on every tenant table, FK map, enum registry, soft-delete policy, the standard RLS policy attached per table. Seed from PRD §29, then add tables for the 12 ⭐ modules (which have none defined anywhere). This is the most important document in the project.

**4 · `RLS-AND-SECURITY-v1_0.md` — Tenancy & Security Model**
RLS policy templates (member-of-workspace read, role-gated write), the agency → workspace → user hierarchy in `auth`/`memberships` terms, role matrix (Owner/Admin/Manager/Staff/Client), client-portal isolation (M37), Storage bucket policies (M06), Supabase Vault usage for provider credentials (M41), Edge Function auth rules, and the mandatory **cross-tenant leak test** every module must pass before Done.

**5 · `JOBS-AND-WORKERS-SPEC-v1_0.md` — Async Contract**
Your PublishlyAI pattern, formalized for this platform: `jobs` table shape (`type`, `payload`, `workspace_id`, `status`, `result`, `error`), who writes which status (browser writes only `queued`; workers own `running/done/failed`), retry/backoff, idempotency keys, `pg_cron` registry (drip steps, rank checks, social posting, digests), worker catalog (which job types run where), and the **capability table** — see the honesty box below.

**6 · `EDGE-FUNCTIONS-SPEC-v1_0.md` — Server-Side API Layer**
What must run server-side and how: incoming webhooks (Stripe, Twilio, Meta) with signature verification; all secret-bearing outbound calls (OpenAI, DataForSEO, SerpApi, provider APIs); function naming, error envelope, CORS policy, and the rule that the browser calls Edge Functions or Supabase directly — nothing else, ever.

### B · With the first UI work — 4 docs

**7 · `AIMINDSHARE-DESIGN-v1_0.md` — Design System (thin)**
Two design sources, in rank order:
1. **`QURANLYAI_DESIGN.md`** — the law: brand tokens, type scale, hairlines, motion rules, forbidden patterns.
2. **`publishlyai-command-center.html`** — the **reference implementation** of that law in dashboard form. Its `:root` block is the canonical extended token set (teal ramp 50–950, gold ramp 50–700, status set `--status-success/warning/danger/info/idle`, gradients `--grad-brand/gold/ai/spine`, radius scale `--r-sm→2xl/pill`, easings `--ease-reverent/premium`, shadow scale + `--shadow-glow`) and its component classes are the canonical dashboard library: `kpi-strip/tile` with deltas · `needs-panel` (action queue) · `pipe-mini` stage bar · `opp-card` · `data-row` · `panel/panel-head` · `pill` · `jobs-chip` · `eyebrow` labels at `--label-track:.16em` · rail sidebar with `nav-group`s · topbar with `kbd` command hint · atmosphere per QuranlyAI §6 (bg-canvas radials + drifting 48px grid + orbs + stars).
This doc extracts those into a `tokens.css` + component spec, then adds only what the mockup lacks: kanban cards (SortableJS), node-canvas styling (Drawflow), builder chrome (GrapeJS), inbox thread layout, plan/usage meters.
**Two deviations from QuranlyAI law the mockup introduces — both need DECISIONS entries, not silent adoption:**
- **Fonts:** the mockup dropped Amiri; recorded as D-008, then **revised to D-014 (2026-07-03): the three fonts are Cormorant Garamond (display) + Baskerville / Libre Baskerville (body/labels) + Shippori Mincho (numbers/data)**. Three-font ceiling unchanged.
- **Theme:** `data-theme="light"` default, and the boot script **reads the shared `islamicinfo-theme` localStorage key**. Light-default matches the Console precedent; whether AiMindShare should read (or ever write) the shared ecosystem key is the same call as D-CONSOLE-004 → decide once, apply to both products.

**8 · `SCREEN-INVENTORY-AND-IA-v1_0.md`**
Every screen with an S-prefixed ID, states per screen (default/empty/loading/error), MVP vs deferred, plus the information architecture: the 45 modules collapsed into ~10 sidebar sections, with agency / workspace / client-portal nav variants and feature-gating visibility rules.

**9 · `DEFINITION-OF-DONE-v1_0.md`**
Per-module gates: RLS leak test passes · role matrix enforced · meters increment · jobs enqueue correctly · all screen states present · both themes correct · responsive 360/768/1280 · `prefers-reduced-motion` · zero secrets client-side · bash self-review greps clean (includes the QuranlyAI forbidden-pattern greps).

**10 · `BUILD-SEQUENCE-v1_0.md`**
The Module List's 8-phase roadmap re-cut into one-module-per-session Claude Code sessions for this stack, with per-session attach lists (constitution + decisions + schema slice + relevant PRD section) and acceptance tests. Session 0 = Supabase project setup: auth config, base tables, RLS templates, `jobs` table, first cron.

### C · Just-in-time — 3 docs

**11 · `USAGE-METERING-AND-PLANS-v1_0.md`** — before M03 (early Phase 1). Meter list (SMS, email, AI tokens, enrichment credits, voice minutes, SEO calls), increment points, plan matrix × feature gates, rebilling markup math. M03 cannot be built against vibes, and retrofitting meters into 44 other modules is the worst rework in the project.

**12 · `INTEGRATIONS-SPEC-v1_0.md`** — vault rules on day one; one provider section added the week that provider is first wired (Twilio, Stripe, OpenAI, DataForSEO, SerpApi, Meta, Google, Pinterest…): auth model, rate limits, cost/call, retry policy, which meter it hits.

**13 · `PROMPT-LIBRARY-v1_0.md`** — before Phase 3 (auto-blog). Versioned runtime prompts: blog pipeline stages, AI copywriter, Copilot system prompt + RAG format, agent personas, review replies, English→workflow-JSON.

### Living file

**14 · `TASKS.md`** — atomic checkboxes per session, carried-over items explicit. Starts at Session 0.

### Explicitly NOT separate documents
- **Tech spec** → docs 3–6 *are* the tech spec, split into attachable contracts.
- **Functional docs** → your per-module PRDs are the functional docs.
- **Per-screen specs** → only for the 3–4 genuinely complex UIs (GrapeJS editor, Drawflow canvas, Copilot, inbox), written the session before each is built.
- **Testing strategy / deployment runbook** → folded into DoD (§9) and a short §deploy appendix of the Build Sequence; a static-frontend + Supabase stack doesn't need standalone ops docs at this stage.
- Compliance detail lives in the M05 PRD; business docs (positioning, niche, launch) are a separate track, not build documentation.

---

## ⚠️ Honesty box — what this stack handles vs fights

**Handles cleanly (most of the platform):** CRM, pipeline, inbox (Supabase Realtime), forms, campaigns, calendar, sites/funnels (GrapeJS is vanilla), SEO engine, auto-blogging (jobs + workers), social/Pinterest scheduling (pg_cron + workers), payments (Stripe via Edge Functions), portal, analytics, white-label, marketplace. Multi-tenancy via RLS is arguably *better* than the PRD's middleware approach — the database enforces isolation, not app code.

**Needs a real worker (not Edge Functions — they time out):** 2,000-word blog generation, 500-page site crawls, bulk pin image rendering (Sharp.js), video rendering (M25). Your GitHub Actions worker pattern covers all of these — same as PublishlyAI.

**Genuinely fights the stack (defer, don't fake):** **M34 Voice Agents** needs a persistent realtime media server (Twilio ↔ OpenAI Realtime websocket bridge) — that is a small always-on service, full stop. **M25 Video Studio** needs heavy rendering compute. Both are P2/P3 Phase 7–8 modules anyway; the right move is a DECISIONS entry deferring their infrastructure question until the core platform is proven, not bending the whole stack for them on day one.

---

## Creation order

`1 → 2 → 3 → 4 → 5 → 6` (blocks Session 0) → `7 → 8 → 9 → 10` (with first UI) → `11` before M03 → `12, 13` just-in-time → `14` always open.

---

*AiMindShare.com · Document List v2.0 · 13 docs + TASKS.md. Vanilla + Supabase, QuranlyAI design DNA, jobs-table control plane. Six documents block Session 0; everything else is staged.*
