# M19 · Slice A — One decisive creation flow (design)

**Date:** 2026-07-07
**Module:** M19 · Sites (AI Website Studio)
**Scope:** Frontend only (`m19-app.html` mockup). No DB / migration / auth / edge-function changes.
**Files touched:** `frontend/js/m19-sites.js`, `frontend/styles/m19-studio.css`

## Problem

The studio has **too many parallel entry points for creation**, so it reads as scattered tools instead of one decisive workflow:

- The topbar **"Create with AI"** button routes to a standalone `#/generate` page.
- The topbar **"+"** button starts a blank site directly.
- The **Websites page** (`#/sites`) opens with a large AI hero + 6 quick-create cards (AI / Blank / Template / Import / Clone), then *also* shows a KPI "at a glance" strip, a site grid, a template gallery and an activity feed — a dashboard, a creation hub and a browser fused into one surface.
- A small `newSiteModal()` (AI / Blank / Template only) exists but is wired to just the Websites page.

This duplicates decisions and steals attention from managing sites. The new Dashboard (built 2026-07-07) is already the operational cockpit; the Websites page should not repeat it.

## Goals

1. **One creation surface.** A single premium "New Site" modal is the only place creation starts.
2. **AI is not a separate page.** Fold the `#/generate` "AI Generate" page into the modal's AI tab.
3. **Websites = portfolio.** Turn `#/sites` into a clean visual card portfolio (browse + open + operate), complementary to the Dashboard's dense table.

Non-goals (later slices): system-wide AI copilot drawer (Slice B), per-site workspace IA (Slice C), delivery polish / review mode / version compare (Slice D), and anything needing real backend/user data (roles, leads, tasks, "last edited by").

## Design

### 1. Unified "New Site" modal — five inline paths

Rebuild `newSiteModal()` into one modal with a segmented tab bar. All five paths are **inline** (self-contained, no hops):

- **Create with AI** *(default tab)* — inline prompt composer (reuse `composerHtml`) plus the tuners currently on `#/generate`: **niche** select, **style** select, **language** select, and the suggestion chips (`HERO_SUGGESTIONS` / `HERO_SAMPLES`). "Generate website" → `createSiteFromAI(desc, niche)`. This replaces the standalone AI Generate page.
- **Blank** — site-name field → `createSite(name, "blank")`.
- **Template** — compact gallery of `studioTemplates()` mini-cards → `newSiteFromTemplate(id)` / `createSiteFromAI(name, niche)`.
- **Import** — "Site name" + "Paste HTML" → `createSiteFromHtml()` (folds in the current `openImportModal` "import" pane).
- **Clone** — "Website URL" → flagged-not-faked toast (folds in the current "clone" pane).

The modal is opened by a new `openCreateModal(tab)` entry (tab defaults to `"ai"`). The legacy `openImportModal()` is absorbed; its two panes become the Import/Clone tabs.

### 2. Routing consolidation — every entry point opens the modal

| Entry point | Before | After |
|---|---|---|
| Topbar "Create with AI" (`#tbGenerate`) | `location.hash = "#/generate"` | `openCreateModal("ai")` |
| Topbar "+" (`#tqNew`) | `studioAction("blank")` | `openCreateModal()` |
| Websites "New site" / empty-state CTA | `newSiteModal()` (3-way) | `openCreateModal()` |
| Dashboard header "New site" + quick-action `data-qa="gen"` (`studioAction("gen")`) | `#/generate` | `openCreateModal("ai")` |
| `studioAction("blank"/"templates"/"import"/"clone")` | mixed routes/modals | open corresponding modal tab |

`studioAction()` is simplified to route all create verbs into `openCreateModal(tab)`.

### 3. Websites page → visual card portfolio

`viewSites()` is reworked to:

- **Header row:** "Websites" title + site count, a filter/search bar (status chips **All / Live / Drafts / Needs action** + name search, same pattern & binder style as the Dashboard table), and a **New site** button (`openCreateModal`).
- **Centerpiece:** the rich site-card grid (`state.sites.map(siteCard)`).
- **Removed from this page:** `aiHero()`, `studioQuickActions()`, `studioGlance()` KPI strip, and the bottom `listTemplateGallery()` + `activityPanel()` band (all belong to Dashboard/Templates now).
- **Empty state:** a clean panel with a single "Create your first site" CTA opening the modal (no AI hero).

Filtering reuses a small binder (`bindSitesFilter`) mirroring `bindDashTable`: chips + search toggle `.site-card` visibility via `data-status` / `data-attn` / `data-name` attributes added to the card root.

### 4. Richer site cards (portfolio-grade)

Enhance `siteCard()` (used only by `viewSites`, so isolated):

- Add a **domain-status chip** (custom domain + SSL state, or "staging").
- Add **health-dimension dots** (SEO / Schema / Perf) next to the health ring, derived from `state.healthBySite[id].categories` (pass/warn/fail → green/amber/red).
- Add **Share preview** and **Publish** quick actions alongside the existing Preview / SEO / Analytics / Manage / Edit.
- Add filter data attributes (`data-status`, `data-attn`, `data-name`) to the card root.

Deferred (need backend/user data, not faked): "last edited by", "pending tasks", "leads count".

### 5. Removed / orphaned cleanup

- Remove `#/generate` from the `render()` switch, delete `viewGenerate()` and `bindGenerate()`.
- Remove the **"AI Generate"** item from the `NAV` "Create" group (leaving **Websites · Templates**) and its `ROUTE_LABELS` entry.
- Remove `aiHero()` (orphaned) and `studioQuickActions()` if orphaned after the `viewSites` rework.
- Keep `composerHtml`, `HERO_SUGGESTIONS`, `HERO_SAMPLES`, `studioTemplates`, `createSiteFromAI`, `createSite`, `createSiteFromHtml`, `newSiteFromTemplate` (reused by the modal).

### 6. Styling (`m19-studio.css`)

- Modal tab/segment bar (reuse `.imp-tabs`/`.imp-tab` idiom, extended to 5), inline composer inside a modal (`.create-modal`), template mini-gallery scroll area.
- Websites portfolio toolbar (reuse `.dt-toolbar` / `.dt-chip` / `.dt-search` classes from the dashboard for consistency).
- Site-card additions (domain chip, health dots, extra actions).

## Verification (preview `m19-preview` :5919, DOM/CSS inspection)

- Modal opens from all four entry points; defaults to AI tab from "Create with AI".
- All five tabs render and their primary action fires (AI generate, blank, template, import, clone).
- A mockup site is created and the editor/detail opens.
- Websites portfolio renders; status chips + search filter the card grid; "New site" opens the modal.
- Sidebar no longer shows "AI Generate"; `#/generate` no longer routes (falls back to dashboard).
- **0 page horizontal scroll** at 375 and 1200 px; modal is scrollable within itself on mobile.
- No console errors; dark mode intact.

## Risks / notes

- `git` is not initialized in this repo, so this doc is written but not committed.
- Pre-existing ~42px topbar h-scroll in the narrow 761–768px band (all routes) is out of scope here.
- Change is additive/surgical across 2 files; editor, site-detail tabs, and all other module screens are untouched.
