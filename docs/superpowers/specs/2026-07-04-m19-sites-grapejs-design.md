# M19 — Sites (GrapeJS AI Website Builder) · Design Spec

**Session 18 · Phase 2 (Acquisition & Sites) · 2026-07-04**
**Status:** approved (design review passed 2026-07-04)

> Attach list for this session: Constitution (CLAUDE-AiMindShare) · DECISIONS · DATA-SCHEMA (§12 sites) ·
> RLS-AND-SECURITY · PRD_M19 · BUILD-SEQUENCE (Session 18) · DEFINITION-OF-DONE · TASKS.md ·
> AIMINDSHARE-DESIGN (design system). Stack is locked: vanilla HTML/CSS/JS + Supabase (Postgres + RLS +
> Edge Functions + Vault + Storage + Realtime + pg_cron + jobs). No Next.js / Prisma / BullMQ / React.
> This doc also **is** the "GrapeJS per-screen spec written the session before" that BUILD-SEQUENCE rule 4
> requires (it was not written in Session 17, so it is written here as a session deliverable).

---

## 0. Dependency & blocker check (done before design)

**Ready (real contracts):**
- **M14 Calendar** (`0017_m14_calendar.sql`): `public-booking` Edge Fn + `book.html?embed=1` — the **real**
  contract `CalendarEmbed` wires to. A published page's calendar widget iframes the M14 embed by calendar slug.
- **M12 Inbox** (`0015_m12_inbox.sql`): SMS live; the **webchat widget is itself a scaffold** (D-059). `ChatWidget`
  therefore embeds a labeled placeholder + the future `channels` webchat script hook.
- **M41 Vault** (`0010_m41_integrations.sql`): `resolveCredential()` + deterministic Vault naming — used by the
  SSL-provider hook + any DNS-API credential when D-009 lands.
- **M05 Compliance** (`0010_m05_compliance.sql`): the cookie customizer exists and **explicitly deferred per-site
  banner persistence + injected script to M19** (TASKS S7 carry-over). M19 **owns** the cookie-banner injection.
- **M09 CRM** (`0013_m09_crm.sql`): `log_activity()` = `timeline.add()` (D-048) + `contacts`. The tracking pixel's
  identified-visitor path calls it.
- **M13 Automations** (`0016_m13_automations.sql`): `emit_trigger(ws, type, payload)` bus. M19 registers/fires
  **`page.visited`** for identified visitors (forms-source trigger `form.submitted` stays M15's).

**Flags (surfaced, decisions taken — see §2):**
1. **M15 Forms is NOT built** (Session 16; only a spec/plan doc exists — no migration, no frontend). `FormEmbed`
   depends on M15's public-form-by-id contract. **Decision: scaffold `FormEmbed` against the planned contract** —
   a `form_id` trait, a labeled placeholder on canvas, and a graceful fetch-by-id on the published page that
   degrades cleanly until M15 ships. No mock in the live path (Law 9; D-052/D-077 precedent).
2. **M06 Media Library is NOT built** (Session 20, *after* this). The image element + OG images depend on it.
   **Decision: scaffold the picker** — image element takes a URL input + a labeled "Media Library — M06" button
   that is disabled/placeholder; OG image is a URL field. Wire the real AssetPicker when M06 lands.
3. **D-009 (hosting) OPEN.** Governs the *live* custom-domain + auto-SSL path. **Decision: build the renderer +
   DNS-verification live; SSL provisioning is a labeled "ready, not run" scaffold** (`site.ssl_provision` job type +
   hook exist; nothing provisions). Flag D-009, do not resolve.
4. **No LLM provider decided** (like D-011 email / D-063 M13-AI). **Decision: `builder-ai-generate` ships a
   deterministic niche-template engine** returning valid `page_json` (Zod-validate + one auto-repair), meters
   nothing; when a provider is chosen only the function body changes (call model + `meter_increment('ai_tokens')`).
5. **Environment:** no Docker/CLI/Deno/hosted Supabase on this machine. All Edge Functions + live SSL/DNS are built
   to full contract and **"ready, not run,"** verified via a PGlite probe + preview + code review — same as every
   prior session. Migration is **`0020`** (the `0012` gap + double-`0010` are pre-existing collisions, not touched).

**Scope decision:** the Session-18 accept-when built full — AI generate → `page_json`, GrapeJS editor, publish path +
versioning + public renderer + sitemap/robots, custom domain + SSL flow, per-page SEO/schema, CRM widget embeds,
cookie-banner + tracking-pixel injection, visitor sessions + CRM timeline/trigger wiring. **Labeled scaffolds
(honest, never faked):** live SSL provisioning (D-009), LLM for AI-generate (D-063 posture), URL-clone + voice
prompt, image-from-M06, FormEmbed→M15, ChatWidget→M12-webchat, the 20+ template gallery (seed a real subset).

---

## 1. Architecture overview

New artifacts:
- **1 migration** `0020_m19_sites.sql` — 6 tables + 4 enums + RLS + publish/revert/duplicate RPCs + tracking
  wiring + `page.visited` trigger registration + `site.ssl_provision` scaffold hook + daily version-prune note.
- **Edge Functions:**
  - `builder-ai-generate` (authed staff+): description/niche → deterministic `page_json` (Zod-validate + repair);
    clone-URL + voice = scaffold branches.
  - `site-render` (public, verify_jwt=false, service-role): `host + path → published page → HTML` with SEO meta +
    JSON-LD + cookie banner + pixel injected; also `/sitemap.xml` + `/robots.txt` per site by path.
  - `domain-verify` (authed admin+): DNS TXT/CNAME check → flip `site_domains.status`; SSL provision = scaffold.
  - `site-track` (public, verify_jwt=false, service-role): pixel events → `visitor_sessions`; identified contact →
    `log_activity('page_visit')` + `emit_trigger('page.visited')`.
- **RPCs (SECURITY DEFINER):** `publish_page`, `revert_page`, `duplicate_page`.
- **Jobs/cron:** `site.ssl_provision` job type (scaffold, no cron scheduled — nothing provisions yet).
- **Front end:** `frontend/m19-sites-grapejs.html` (authed app: sites list · site detail · editor),
  `frontend/js/m19-sites.js`, `frontend/js/m19-editor.js` (GrapeJS init + custom blocks),
  `frontend/js/site-render.mjs` (**pure** `page_json`→HTML, reused by the Edge Fn + editor preview + published-page
  hydration), `frontend/styles/m19-sites.css`, vendored `frontend/vendor/grapes.min.{js,css}`.
  Tokens/base/components only; zero raw hex; three fonts; dark = no stars.

---

## 2. Design choices (with rejected alternatives)

**a) page_json = GrapeJS project data + snapshotted render (CHOSEN) vs. re-run GrapeJS server-side.**
`pages.page_json` stores GrapeJS **project data** (`editor.getProjectData()`) — the editable source of truth
(canonical §12: "GrapeJS writes page_json"). On save/publish we **also** snapshot `render_html` + `render_css`
(`editor.getHtml()` / `editor.getCss()`). The public renderer serves the snapshot; it never loads GrapeJS
(no headless browser on Edge). Rejected: reimplementing GrapeJS's component→HTML pass in Deno (fragile, duplicative).
Trade-off: two representations per page; publish keeps them in lockstep (one RPC).

**b) Platform embeds = placeholder markup + `data-*` hydration (CHOSEN) vs. inline live render at export.**
FormEmbed / CalendarEmbed / ChatWidget export as `<div data-embed="calendar" data-slug="…">` placeholders. A tiny
published-page script (`site-render.mjs`'s hydration half) mounts them at view time: CalendarEmbed → iframe the real
M14 `book.html?embed=1&slug=`; FormEmbed → fetch the planned M15 public form by id (degrade to a labeled notice
until M15); ChatWidget → load the M12 webchat script (scaffold). Rejected: baking a live widget into `render_html`
(couples the snapshot to sibling modules' current state; breaks the "publish is immutable" guarantee).

**c) Public renderer = Supabase Edge Function (CHOSEN) vs. static publish to a CDN.**
`site-render` resolves `host → site_domains/subdomain → site → page(slug, status=published)` **service-role** and
returns HTML. Rejected (for now): static export to Cloudflare Pages / GitHub Pages — that's blocked by OPEN D-009
and needs a build/deploy pipeline the stack doesn't have yet. The Edge Fn works today and the static path can be
added later without schema change.

**d) AI generate = deterministic niche-template engine (CHOSEN) vs. wait for an LLM provider.**
`builder-ai-generate` composes a valid `page_json` from niche section templates (hero/features/testimonials/
pricing/FAQ/CTA/footer) with real seed copy, Zod-validated with one auto-repair. Meets the ≥95%-deserializable AC
deterministically and meters nothing (no provider call). Rejected: blocking the whole module on D-063. When a
provider is chosen, the function body swaps to a model call + `meter_increment('ai_tokens')` — the Zod schema,
repair pass, and editor-load path are unchanged.

**e) Custom domains = separate `site_domains` table (CHOSEN) vs. inline `sites.domain`/`ssl_status`.**
Canonical §12 sketches `sites(domain, ssl_status)` inline (one domain). PRD wants multi-domain + verification +
staging. `site_domains` (site_id, domain, status, ssl_status, verification_token, is_primary) carries them; `sites`
keeps a `subdomain` for the always-on staging URL. Logged as a DECISION.

**f) Coarse RLS tiers, no new `sites.*` fine grants (CHOSEN)** — same call as M11 D-049 / M12 D-057 / M14 D-069.
RLS is the wall; the M02 registry can gain `sites.*` grants later without touching M19.

---

## 3. Database schema — `0020_m19_sites.sql`

Enums (idempotent DO-block, per the `0000` idiom):
- `site_status` = `draft | published | archived`
- `page_status` = `draft | published`
- `domain_status` = `pending | verifying | active | failed`
- `ssl_status` = `none | pending | active | failed`

Tables — all carry `id uuid pk`, `workspace_id uuid not null references workspaces`, `created_at`/`updated_at`
(shared `set_updated_at` trigger), and the **standard RLS template** unless noted:

**`sites`** — `name`, `subdomain text unique` (staging `…—.aimindshare.site`), `status site_status default 'draft'`,
`favicon_url text`, `brand jsonb` (global colors/fonts: `{colors:{}, fonts:{}}`), `nav jsonb default '{"items":[]}'`,
`seo_defaults jsonb default '{}'`, `archived_at`. RLS: read=staff+, ins/upd=staff+, **del=manager+**.

**`pages`** — `site_id references sites on delete cascade`, `title`, `slug`, `is_home bool default false`,
`status page_status default 'draft'`, `meta jsonb default '{}'` (per-page: `{title, description, og_image, canonical,
robots, schema_type, schema_json}`), `page_json jsonb` (GrapeJS project data), `render_html text`, `render_css text`,
`published_at timestamptz`, `sort int default 0`. Unique `(site_id, slug)`. RLS: read=staff+, ins/upd=staff+,
**del=manager+**. **Published pages are NOT anon-readable on the table** — the renderer reads service-role.

**`page_versions`** — `page_id references pages on delete cascade`, `version_no int`, `page_json jsonb`,
`render_html text`, `render_css text`, `meta jsonb`, `published_at`, `published_by uuid`. Append-only (no upd/del
policy; service/definer insert). Unique `(page_id, version_no)`. Read=staff+.

**`site_domains`** — `site_id references sites on delete cascade`, `domain text`, `status domain_status default
'pending'`, `ssl_status ssl_status default 'none'`, `verification_token text`, `verified_at`, `is_primary bool
default false`. Unique `(domain)` (a domain maps to one site platform-wide). RLS: read=staff+, **ins/upd/del=admin+**
(integration posture, D-056).

**`site_templates`** — **global** (`workspace_id` nullable; platform rows). `name`, `niche text`, `thumb_url text`,
`page_json jsonb`, `is_active bool`. RLS: **SELECT = authenticated** (global read, like M44 feature_flags / M13
templates); writes service-role/platform-admin only.

**`visitor_sessions`** — `site_id references sites on delete cascade`, `visitor_id text` (first-party cookie id),
`contact_id uuid references contacts` (nullable; set on identify), `pages jsonb default '[]'` (`[{slug, at}]`),
`utm jsonb default '{}'`, `started_at`, `last_seen_at`. RLS: **read=staff+, writes service-role only** (the pixel
Edge Fn) — browser never writes.

RPCs (SECURITY DEFINER, `is_member`/`has_role` guards inside):
- `publish_page(p_page_id)` → snapshots current `page_json`/render/meta into `page_versions` (next `version_no`),
  sets `pages.status='published'` + `published_at=now()`, **prunes to last 10 versions**, sets the site
  `status='published'` if draft. **manager+**.
- `revert_page(p_page_id, p_version_no)` → copies a version's `page_json`/render/meta back onto the page (as a new
  draft state). **manager+**.
- `duplicate_page(p_page_id)` → deep-copies a page within its site (`slug`+'-copy'). **staff+**.

Tracking wiring: `site-track` (service role) upserts a `visitor_sessions` row per `(site_id, visitor_id)`, appends
the page view, and — when `contact_id` is present (identified via a form-submit linkage or `?ce=` param) — calls
`log_activity(ws, contact, 'page_visit', …)` and `emit_trigger(ws, 'page.visited', {contact_id, site_id, slug})`.
`page.visited` is registered in the trigger registry (M13) as a real source.

SSL scaffold: `site.ssl_provision` job type documented in JOBS-AND-WORKERS-SPEC; **no cron scheduled** (nothing to
provision until D-009). `domain-verify` enqueues nothing live — it flips `status` on DNS match and leaves
`ssl_status='pending'` with a logged note.

---

## 4. RLS & security posture (leak-probe targets)

- Cross-tenant leak on all 6 workspace tables = 0 (probe).
- Role matrix: staff can create/edit sites+pages but **cannot publish or delete** (manager+); domains are **admin+**;
  client tier is **ceilinged** (no site access — sites are operator surfaces).
- `page_versions` + `visitor_sessions` are **append-only / service-role-write**; browser cannot forge them.
- **The public renderer only ever returns `status='published'` pages** — a draft page is not reachable by URL
  (probe: request a draft slug → 404-equivalent). The renderer runs service-role but filters `status='published'`.
- `site_templates` global read; no tenant can write a global template.
- No secret in the browser: DNS-API / SSL-provider creds (when D-009 lands) live in Vault; the renderer + track +
  verify functions hold no keys the browser sees.

---

## 5. GrapeJS per-screen spec (the deliverable)

**Vendored:** `frontend/vendor/grapes.min.js` + `grapes.min.css` (UMD, no CDN, no build — like Drawflow/Sortable).
One in-file token pass on the vendored CSS if any `monospace`/raw-hex trips Gate-8 (retokenise to `var(--font-mono)`
/ nearest token, as done for Drawflow, D-060). GrapeJS is initialized with **no default preset**; our block manager,
style manager sectors, and device manager are configured to the design system.

### 5.1 `/sites` — sites list
Rail + topbar shell (shared `components.css`). Header: "Sites" + "New Site" (opens the create modal → name → choose
"Start with AI" / "Blank" / "Template"). Body: **site cards grid** — each card: favicon + name, status pill
(draft/published/archived), page count, primary domain (or staging subdomain) with a copy button, "last published"
(mono), Edit / Open / ⋯ (duplicate/archive/delete — delete manager+). Empty state: illustration + "Create your first
site". Loading: calm skeleton cards (no shimmer). Error: envelope + retry.

### 5.2 `/sites/:id` — site detail
Left sub-nav (Pages · Navigation · Domains · SEO defaults · Settings) or tabs. 
- **Pages:** list (title, slug, status pill, is_home star, updated) + "New Page" + row actions (Edit / Duplicate /
  Set as home / Delete). 
- **Navigation:** nav menu builder — ordered list of `{label, page_id|url}` items, drag-reorder (SortableJS, already
  vendored), add/remove; writes `sites.nav`. 
- **Domains:** primary staging subdomain (read-only) + "Connect custom domain" wizard: enter domain → show
  **CNAME/A + TXT** instructions with copy buttons → "Verify" (calls `domain-verify`) → status pill (pending/
  verifying/active/failed) + SSL pill ("provisioning — available after hosting is finalized", the D-009 scaffold). 
- **SEO defaults:** site-wide default meta title pattern, description, OG image URL (M06 scaffold), robots,
  favicon. 
- **Settings:** brand global styles (colors/fonts → `sites.brand`), archive/delete danger zone.

### 5.3 `/sites/:id/edit/:pageId` — the GrapeJS editor
Full-bleed editor chrome (rail collapses). Regions:
- **Top toolbar:** device toggle (Desktop / Tablet 768 / Mobile 375) · Undo · Redo (**50-step**, GrapeJS built-in
  UndoManager) · **AI generate** (opens the AI panel) · Preview (toggles GrapeJS preview / opens a new-tab render) ·
  **Save** (writes `page_json` + render snapshot, draft) · **Publish** (calls `publish_page`, manager+; disabled with
  a tooltip for staff). Autosave indicator (mono "saved 12:04").
- **Left panel** (tabbed): **Blocks** (block manager — see 5.4) · **Layers** (GrapeJS LayerManager) · **Templates**
  (insert a section template / swap the whole page from the gallery).
- **Canvas:** the GrapeJS frame; device-responsive; a 375px toggle drives **mobile breakpoint overrides** (GrapeJS
  device-scoped styles). Selected-component badge + toolbar (move/clone/delete).
- **Right panel** (tabbed): **Styles** (StyleManager sectors: Typography, Spacing, Background, Border, Layout — all
  fed design-system token defaults) · **Settings** (TraitManager: per-component traits, e.g. FormEmbed `form_id`,
  CalendarEmbed `slug`, button `href`/`label`, image `src`/`alt`) · **Page** (page meta: SEO title/description/OG/
  canonical/robots + schema type + JSON-LD editor).
- **Global styles:** a "Brand" control (top toolbar) opens brand colors/fonts applied site-wide via CSS variables the
  render shell defines from `sites.brand`.

### 5.4 Block set (custom GrapeJS components)
Layout: Section · Row · Column (1/2/3/4) · Spacer · Divider.
Content: Heading · Text · Image (URL + "Media Library — M06" scaffold) · Button · Video embed · Map · Countdown ·
Testimonial · Pricing table · FAQ accordion · Social icons · HTML embed.
**Platform embeds:** 
- **FormEmbed** — trait `form_id`; canvas shows a labeled placeholder ("Form — connect after M15"); export
  `<div data-embed="form" data-form-id="…">`; published-page hydration fetches the planned M15 public form by id and
  degrades to a notice if unavailable. 
- **CalendarEmbed** — trait `calendar_slug`; canvas shows a mini calendar preview; export
  `<div data-embed="calendar" data-slug="…">`; hydration **iframes the real M14** `book.html?embed=1&slug=`. 
- **ChatWidget** — trait `channel`; canvas shows a labeled bubble; export `<div data-embed="chat" …>`; hydration
  loads the M12 webchat script (scaffold until M12 webchat ships).

### 5.5 AI generate panel
Tabs: **Describe** (textarea: "Describe your business" + niche select → `builder-ai-generate` → loads the returned
`page_json` into the editor, replacing/whole-page) · **Clone URL** (input, labeled scaffold — "coming soon") · **Voice**
(mic button using browser SpeechRecognition → fills the Describe box; feature-detected, labeled scaffold where
unsupported). Per-section "Rewrite with AI" is a right-panel action on a selected section (scaffold → deterministic
tone variant). All AI actions show a calm generating state; none meter until a provider lands.

---

## 6. Public renderer + published page

`site-render` (Edge Fn) request flow:
1. Resolve `host` → `site_domains.domain` (status='active') **or** `subdomain` → `site` (service role).
2. Path routing: `/sitemap.xml` → generate from published pages; `/robots.txt` → generate; `/…slug` → the page.
3. Load the page where `status='published'` (draft → 404 shell). 
4. Compose the HTML shell: `<head>` with per-page SEO meta (title/description/canonical/robots/OG from `meta` merged
   over `sites.seo_defaults`), **JSON-LD** `<script type="application/ld+json">` (LocalBusiness/Article/FAQ by
   `meta.schema_type`), the brand CSS variables from `sites.brand`, `render_css`; `<body>` with `render_html`, the
   **cookie-banner** (M05 config) + **tracking pixel** (`site-track` beacon) + the **embed-hydration** script.
5. Cache-control headers; honest 404 shell for unknown host/slug.

`site-render.mjs` is the **pure** module (no DOM, no Deno APIs) that builds the head/shell string and the hydration
script; imported by the Edge Fn (Deno) and reused in-browser for the editor's "Preview" + the local published-page
demo — the M13 `automation.mjs` injectable pattern.

---

## 7. Front-end states, responsiveness, design fidelity

Every screen ships **default / empty / loading (calm skeleton, no shimmer) / error (envelope + retry) / success**,
plus a mockup-mode preview-state switcher with a visible "sample data" label (Gate-5, design rule 10). Light default +
dark sibling (dark bg `#04090A`, **no stars/dots** per the brief). Responsive 360 / 768 / 1280 with **no page
horizontal scroll** — the editor's panels + canvas own their overflow; on mobile the editor degrades to a
**read-only page outline + "edit on desktop"** notice (like M13's canvas mobile degrade). Tokens-only, three fonts
(Cormorant / Baskerville / Shippori Mincho), `.5px` hairlines, mono numerals, glassmorphism by zone, atmospheric
radial-gradient `::after` (no animation). Reduced-motion respected.

---

## 8. Verification plan

`workers/verify/m19probe.mjs` (real Postgres via PGlite), asserting:
- Cross-tenant leak = 0 on `sites`, `pages`, `page_versions`, `site_domains`, `visitor_sessions` (+ global
  `site_templates` read).
- Role matrix: staff create/edit page; **staff cannot `publish_page`/delete**; manager can; **domains admin+**;
  client ceiling (no select).
- `publish_page`: creates a `page_versions` row with the right `version_no`, flips status + `published_at`, **prunes
  to 10**; a second publish increments the version.
- `revert_page`: restores a prior version's `page_json`.
- `duplicate_page`: copies within the site with a unique slug.
- Renderer contract: a `status='draft'` page is **not** returned by the published-resolution query; a published one
  is.
- `visitor_sessions` service-role-write only (browser insert denied); identify path calls `log_activity` +
  `emit_trigger('page.visited')`.
- `site_templates` global read; tenant cannot write a global template.

Then: full `bash scripts/verify.sh` no-regression (all prior probes green), **DoD Gate-8** greps clean for M19 files
(dead-stack / secrets / shimmer / raw-hex / fonts / RLS-on-every-table), and **preview verification** of all three
screens + the editor + a rendered published page (light+dark, responsive, zero console errors). Live Edge Fn / DNS /
SSL / real LLM are **"ready, not run"** and carried on TASKS.md — never faked green.

---

## 9. DECISIONS to record (D-084…)

- **D-084** M19 public renderer = a Supabase Edge Function (`site-render`), not Node SSR / static export; static
  publish deferred behind OPEN D-009.
- **D-085** `page_json` = GrapeJS project data (editable truth) + snapshotted `render_html`/`render_css` (served);
  publish keeps them in lockstep; renderer never runs GrapeJS.
- **D-086** Platform embeds (Form/Calendar/Chat) export as `data-*` placeholders hydrated at view time; CalendarEmbed
  → real M14, FormEmbed → planned M15 (scaffold), ChatWidget → M12 webchat (scaffold).
- **D-087** `builder-ai-generate` is a deterministic niche-template engine (Zod-validate + repair), meters nothing;
  swaps to an LLM body when a provider is decided (D-063 posture).
- **D-088** Custom domains in a separate `site_domains` table (multi-domain + verification); `sites.subdomain` is the
  staging URL; live SSL provisioning is a "ready, not run" scaffold pending D-009.
- **D-089** M19 uses coarse RLS tiers (site/page read+edit staff+, publish+delete manager+, domains admin+, client
  ceiling); no new `sites.*` fine grants (M11 D-049 precedent). Published pages are not anon-readable on the table —
  the renderer reads service-role and filters `status='published'`.
- **D-090** M19 owns the M05 cookie-banner injection + the first-party tracking pixel (`site-track` →
  `visitor_sessions` → `log_activity`/`emit_trigger('page.visited')` for identified contacts).

> Migration is **`0020`**; if a parallel session claimed 0020 or any of D-084…D-090, renumber on merge (repo ritual).
> The pre-existing `0012` gap (M05 renumber) + double-`0010` are not touched here.
