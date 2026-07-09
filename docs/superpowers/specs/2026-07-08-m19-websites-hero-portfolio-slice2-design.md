# M19 Website Studio — Websites Page: Slice 2 (Portfolio Enrichment)

**Status:** Approved for implementation
**Scope:** Frontend-only mockup (`frontend/js/m19-sites.js`, `frontend/styles/m19-studio.css`). No migration, no new routes, no sidebar/topbar changes, no backend calls.

## Background

This is Slice 2 of the "AI Website Operating System" master prompt (hero/portfolio visual overhaul). Slice 1 (`2026-07-08-m19-websites-hero-portfolio-design.md`, approved, not yet built) re-adds the hero + 6 quick-create cards to `viewSites()`. Slice 2 assumes Slice 1 ships first (or lands in the same pass) and layers on top of it:

1. Hero composer extras (attach/prompt-history/competitor-URL) + a 6-tile metrics strip
2. Portfolio card enrichment (`siteCard()`) — client/category, extra health signal, team, one inline AI insight, consolidated quick actions, a "full detail" drawer
3. Portfolio toolbar upgrade (filters popover, sort, grid/list, saved views, bulk actions, tags/favorites)
4. A compact "Attention needed" strip that links to the Dashboard's existing full panel (not a duplicate)

Wherever the master prompt asked for data that already exists elsewhere in this file, this slice reuses it instead of inventing a parallel source — see "New mock data" below for exactly what's genuinely new versus derived.

## Out of scope

- `#/dashboard` (Command center) — untouched. Its Attention panel stays the one full "control center"; this page only gets a summary that links to it.
- Any real AI-generation, file-parsing, or web-scraping backend. Attach-file, business-brief upload, and competitor-URL paste all show the same "runs with the AI provider — flagged, not faked" toast the Clone/Import flows already use.
- Editor (`viewSiteDetail`, page builder) — unaffected.
- Revenue/payments as a real feature — M19 has no billing/checkout model; the one new "Revenue" field in the drawer is explicitly synthetic mock data, not wired to anything.

## 1. Hero extras (on top of Slice 1's `sitesHero()` / `composerHtml()`)

**Metrics strip** — 6 `.st-kpi` tiles, all computed from existing state (nothing new stored):
| Tile | Source |
|---|---|
| Websites | `state.sites.length` |
| Published | sites where `status === "published"` |
| Drafts | sites where `status === "draft"` |
| Avg Health | mean of `healthBySite[*].score` |
| Leads 7d | `leadsBySite` entries with `created_at` in the last 7 days |
| Team Members | `MOCK.team.length` (new roster, see §5) |

**Composer additions** (inside `composerHtml()`, gated by `idPrefix === "hero"` only — the modal's composer stays as Slice 1 left it):
- Attach-file button (`accept=".pdf,.doc,.docx,image/*"`) — on file select, `toast("Business brief / competitor analysis runs with the AI provider — flagged, not faked.", "info")`. No file is read or uploaded.
- "Paste a competitor URL instead" toggle link under the hint text — reveals a plain URL input; submitting shows the same flagged toast (mirrors `cmCloneGo` at `m19-sites.js:1307`).
- Prompt history: on each successful hero Generate click, unshift the prompt text into `localStorage["aimindshare-hero-prompts"]` (JSON array, capped at 5, dedup by exact text) — same pattern as `favTemplates()`. Render as a small "Recent" chip row under the suggestion chips; clicking a chip fills the textarea. Nothing server-side.

## 2. Portfolio card enrichment (`siteCard()`)

### Always visible (front of card)

- **Client + category row**: `s.client_name` (new field, falls back to `s.name` if unset) + a category chip from `s.niche` (new field, labelled via the existing `NICHE_OPTS` list — no new taxonomy).
- **Status pill**: existing statuses plus **Review** (already computable today from `state.reviewBySite[s.id] === "review"`, just not surfaced on the card yet) and **Archived** (new `s.archived` boolean; archived sites are excluded from the default "All" filter, visible only under a new "Archived" toolbar filter).
- **Health dots**: existing SEO + Performance dots, plus **Accessibility** (the `a11y` category already exists in `MOCK.health[*].categories`, just not rendered on the card today — this is a rendering change, not a new field).
- **Team avatar cluster**: 3 stacked avatars + "+N" overflow, from `MOCK.teamBySite[s.id]` (array of member ids) resolved against `MOCK.team` (new roster, §5).
- **"Last edited by"**: appended to the existing publish-meta line, using `MOCK.teamBySite[s.id][0]` as the convention for "last touched by" (no new per-site field beyond the team assignment itself).
- **One inline AI-insight line**: the single top-ranked result of `attentionItems([s])` (the existing Dashboard-attention function, called with a one-site array) — e.g. "⚡ Missing FAQ schema". Zero new data; this is the same engine the Dashboard panel and the compact strip (§4) both use.
- **Quick actions**: keep Preview / Manage / Edit / Publish visible as icon buttons (as today). SEO, Analytics, Share, Clone, Version History, and Settings move into a new **"⋯ More"** menu (see §3, new small dropdown primitive — the only genuinely new interaction component in this slice, reused by the toolbar's Filters/Saved-views too).

### Behind the new "Details" drawer

A right-side slide-in panel (new, modeled on the existing Copilot/Connect slide-in pattern — its own scrim + panel, not the singleton `#drawer` used by Connect), opened via a "Details" action on the card. Contains:

- Full health breakdown: all existing categories (SEO, Schema, Accessibility, Performance, Broken links, Required fields) **plus 3 new categories** — Security, Conversion, Content (added to each site's `categories` array in `MOCK.health`, same shape as the existing six: `{key, label, status, detail}`).
- Business metrics: Leads / Forms submitted / Bookings (all derived by filtering `leadsBySite[s.id]` by `type`), Conversion rate (`leads / sessions_7d`, shown as "—" when `sessions_7d` is 0), Unique visitors (`Math.round(sessions_7d * 0.7)`, a labelled approximation — sessions is the only real traffic number in this app). **Revenue** and **Bounce rate** and **Core Web Vitals (LCP/CLS/INP)** are new synthetic per-site fields with no real computation behind them — added to a new `MOCK.metricsBySite`, clearly mock.
- Full AI insights list: every `attentionItems([s])` result for this site, not just the top one.
- Activity timeline: reuse `MOCK.publishLog` filtered to this site, plus `state.reviewBySite` status, already-existing "pending approval" concept from the Publish tab's approval stepper.
- Progress bars (Content/SEO/Design/Accessibility/QA/Publishing + overall %): derived from health category statuses (`pass` → 100, `warn` → 60, `fail`/`na` → 20) rather than a separately invented progress number — keeps one source of truth.
- SSL status (already exists via `domainsBySite[*].ssl_status`), Environment (derived: `published` → Production, `draft` → Development, else Staging — no new field), Build number (derived as `(last_version || 0) * 10`, avoiding a second, meaningless invented counter alongside version).

## 3. Toolbar upgrade

- **Filters** button opens the new dropdown/popover primitive (§2's "⋯ More" menu component, reused): status (now includes Review/Archived), category (`niche`), "needs attention" toggle, tags.
- **Sort** dropdown: Name, Last edited, Health score, Traffic.
- **Grid / List** toggle: Grid defaults to **2 columns** (richer cards need the width); List is a compact single-line row reusing the same card data at lower fidelity.
- **Saved views**: name + persist the current search/filter/sort combination to `localStorage["aimindshare-sites-views"]`, same pattern as `favTemplates()`. A dropdown lists saved views; selecting one re-applies its filters.
- **Bulk actions**: a checkbox appears on card hover; selecting any card shows a floating action bar (Publish selected, Archive selected, Tag selected) at the bottom of the viewport.
- **Tags & Favorites**: a star toggle per card (favorite) and a small tag-chip editor, both persisted to `localStorage` (`aimindshare-sites-favs`, `aimindshare-sites-tags`) — no schema change.
- Command palette (⌘K) — already exists in the top bar; nothing to add.

## 4. Attention strip (compact, page-level)

A single slim bar between the hero and the toolbar: `attentionItems(state.sites)`, top 2–3 items by severity, formatted as "N sites need attention — \<title\>, \<title\>, …" with a "View all →" link to `#/dashboard`. Same data/ranking the Dashboard panel already uses — this is a summary view onto it, not a second control center.

## 5. New mock data (additive only, no migration)

| Addition | Shape | Used by |
|---|---|---|
| `MOCK.team` | `[{id, name, role, initials, color}]` — roster of ~6 people (Owner, Designer, Developer, SEO, Content writer, Client) | Hero "Team Members" tile, card avatar cluster |
| `MOCK.teamBySite` | `{siteId: [memberId, …]}` | Card avatar cluster, "last edited by" |
| `s.client_name` (per site in `MOCK.sites`) | string, optional | Card identity row |
| `s.niche` (per site) | string, one of `NICHE_OPTS` keys | Card category chip, toolbar category filter |
| `s.archived` (per site) | boolean, default false | Status pill, Archived filter |
| 3 new `MOCK.health[*].categories` entries | `{key: "security"\|"conversion"\|"content", label, status, detail}` | Drawer's full health breakdown |
| `MOCK.metricsBySite` | `{siteId: {revenue, bounce_rate, cwv: {lcp, cls, inp}}}` | Drawer's business metrics (explicitly synthetic) |

Everything else (Leads/Forms/Bookings, SSL, AI insights, activity log, review status) is derived from data that already exists in this file today.

## Verification plan

Manual preview check (no automated test harness for this frontend-only module):

1. Hero: 6 metric tiles render with correct counts against the mockup dataset; attach button and competitor-URL toggle both show the flagged toast without navigating anywhere; typing + generating adds to prompt history, reopening the hero shows the recent chip.
2. Cards: client/category row, Review and Archived states, 3 health dots (incl. Accessibility), team avatar cluster + "last edited by", one AI-insight line, and the "⋯ More" menu all render; clicking "Details" opens the drawer with the full breakdown, closes on scrim click / Esc.
3. Toolbar: Filters popover applies status/category/tag filters; Sort reorders the grid; Grid/List toggle switches layout (2-col grid default); a Saved View can be created, persists across reload, and re-applies; selecting cards shows the bulk-action bar and it actually acts on the selection (mockup toast is fine, no backend).
4. Attention strip shows top items and its "View all" link lands on `#/dashboard` with the existing panel unchanged.
5. Confirm `#/dashboard` (Command center) is pixel-for-pixel unchanged.
6. Resize to 375px and 1200px — 0 horizontal scroll, dark mode intact, no console errors, including with the drawer open.
