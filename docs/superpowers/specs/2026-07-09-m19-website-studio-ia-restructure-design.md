# M19 Website Studio — Sidebar Information-Architecture Restructure

**Module:** `frontend/js/m19-sites.js` / `frontend/styles/m19-studio.css` (single-file IIFE, no bundler, no test runner — mockup-only, no migration).

## Goal

Split the current 6-item flat workspace rail (Dashboard / Websites / Templates / Assets / Analytics / Settings) plus the separate 5-group per-site rail into one unified structure: **Website Studio** as the persistent, always-visible top-level sidebar (workspace operations, collaboration, reporting, growth, optimization, platform settings), with **Website** as a single expandable item inside it that opens a nested sub-navigation holding every direct site-building tool.

## Product rule

> If the item is about building the website directly, place it under **Website**. If the item is about operations, collaboration, reporting, growth, optimization, or system-wide controls, keep it in the main **Website Studio** sidebar.

This rule is the test for any future addition to either list — put it in a one-line code comment above the `NAV` array.

## Sidebar structure

Flat list, no group headers (today's "Create"/"Grow"/"Configure" cluster labels go away):

```
Overview
Website        (expandable → 15-item sub-nav, see below)
Templates
AI Builder     (action, not a page — opens the existing Create modal)
Client Workspace
Build Pipeline
Publishing Center
Analytics
Growth Center
Optimization Center
Integrations
Settings
Help & Resources
```

**Website submenu** (shown nested/indented under the "Website" row when expanded):

```
Sites · Pages · Navigation · Structure · Design System · Components · Sections ·
Content · Media Library · Forms · Blog / CMS · SEO Settings · Version History ·
Preview · Publish
```

### Expand/collapse mechanic

- Clicking the "Website" row navigates to Sites (its default child) and expands the submenu.
- A small chevron on the same row toggles expand/collapse without navigating.
- `render()` auto-forces the submenu open whenever navigation lands on a Website-scoped route (Sites, a site detail page, or any of its tabs); it does not auto-close itself on every re-render, so a manual collapse sticks until the next navigation into or out of that scope.
- New state: `state.railWebsiteOpen` (boolean, starts `true`).

### Site-context resolution ("auto-select last-opened site")

New helper, `activeSiteId()`: returns `state.lastSiteId` if it still refers to a site in `state.sites`, else the first site in `state.sites`, else `null`. Every Website submenu item other than "Sites" (for the tabs that are per-site: Pages, Navigation, Design System, SEO Settings, Publish, Version History) resolves this on click:

- If `activeSiteId()` returns a site, set `state.tab` to the matching tab key and navigate to `#/sites/{id}`.
- If it returns `null` (no sites at all yet), open the Create modal instead of navigating into a dead page.

`state.lastSiteId` is written every time `render()` enters the site-detail branch (`parts[0] === "sites" && parts[1]`), so it always reflects the most recently opened site, matching how the existing per-site rail already implicitly behaves.

### "AI Builder" — action, not a route

Rendered as a normal-looking nav row but wired like the existing `data-qa="gen"` quick-action buttons already used elsewhere (`studioAction('gen')` → `openCreateModal("ai")`) rather than `data-nav`. It never navigates and is never shown "active."

## Mapping — what's real vs. placeholder

Per the agreed scope ("wire what exists, placeholder the rest"): an item only gets real content if a working page/tab already exists today to reuse. Everything else gets the existing `viewCapability()` / `CAP` placeholder pattern (hero + feature list + CTA) so the nav is complete and clickable, but honest about what's unbuilt.

### Website submodules

| Submodule | Status | Implementation |
|---|---|---|
| Sites | Real | `viewSites()` / `#/sites`, unchanged |
| Pages | Real | existing per-site `tabPages`, reached via `activeSiteId()` |
| Navigation | Real | existing per-site `tabNav` |
| Design System | Real | existing per-site `tabBusinessProfile` ("Brand & profile"), relabeled in the submenu only — tab content/heading unchanged |
| Components | Real | existing `CAP.components` (`viewCapability("components")`), opens editor |
| Sections | Real | existing `CAP.sections`, opens editor |
| SEO Settings | Real | existing per-site `tabSeo` |
| Version History | Real (new thin tab) | extracts the version list + compare/restore markup and handlers already living in `tabPublish` into their own tab body, reusing the same data (`state` version log) and the same `data-compare`/`data-restore` handlers — no new mock data, no change to what `tabPublish` itself shows |
| Publish | Real | existing per-site `tabPublish`, unchanged |
| Media Library | Real | existing `CAP.assets`, cross-link to `m06-media-library.html`, relabeled "Media Library" |
| Forms | Real | existing `CAP.forms`, cross-link to `m15-forms-and-surveys.html` |
| Blog / CMS | Real | existing `CAP.blog`, cross-link to `m22-manual-content-cms.html`, relabeled "Blog / CMS" |
| Structure | Placeholder | no existing analog |
| Content | Placeholder | ambiguous vs. Pages/Blog-CMS; no existing analog |
| Preview | Placeholder | a real one is a good, cheap follow-up (the template-preview iframe machinery in `previewTemplateModal` could be adapted to render a real site's actual pages) but out of scope for this pass |

### Top-level items

| Item | Status | Implementation |
|---|---|---|
| Overview | Real | existing `viewDashboard()` / `#/dashboard`, relabeled (see Naming below) |
| Templates | Real | existing `viewTemplates()`, unchanged |
| AI Builder | Real | action → `openCreateModal("ai")`, no page |
| Analytics | Real | existing `viewAnalyticsOverview()`, unchanged |
| Publishing Center | Real (split) | takes the "Sites & status" list + activity panel currently inside `viewPublishCenter()`, plus the domain rollup currently in `viewDomainsOverview()` (custom domains + staging subdomains) — one page covering deployment/domains/release status |
| Build Pipeline | Real (split) | takes the `PIPE` stage-track visualization (`.st-pipe`/`.pipe-track`, Brief → AI structure → Design → Content → Forms → SEO → Domain → Publish → Optimize) currently embedded inside `viewPublishCenter()`, promoted to its own page |
| Optimization Center | Real | existing `viewSeoOverview()` (KPIs + per-site SEO health + `seoTechPanel()`), relabeled "Optimization Center" |
| Settings | Real | existing `viewSettings()`, unchanged |
| Client Workspace | Placeholder | you scoped comments/file-sharing/branded review as future work; the existing per-site approval stepper + client review link (Slice D) stay exactly where they are today, inside Website → Publish — nothing moves out of it in this pass |
| Growth Center | Placeholder | previously scoped as future M09/M15/M16/M20 integration work |
| Integrations | Placeholder | workspace-level third-party connections — distinct from the existing per-site `tabIntegrations` (CRM widget embeds), which is untouched and stays reachable from the site detail view exactly as today; it's simply not one of the 15 named Website submodules, since your list didn't include it |
| Help & Resources | Placeholder | no existing analog |

Old standalone `#/domains` and `#/pages` (cross-site) top-level routes are removed from the sidebar; their content is absorbed into Publishing Center (domains) and the per-site Pages tab respectively. The routes themselves can keep resolving (harmless dead code) or be deleted — deleting is cleaner and this doc treats them as removed.

## Naming: "Dashboard" → "Overview"

Internal route key stays `dashboard` (it's referenced in 10+ places: `NAV`, `ROUTE_LABELS`, the `render()` switch, breadcrumb map, several `data-nav-to="dashboard"` buttons). Only user-visible text changes, everywhere it appears:

- Sidebar nav item label ("Dashboard" → "Overview")
- `ROUTE_LABELS.dashboard` ("Command center" → "Overview")
- Breadcrumb map at `m19-sites.js:2619` ("Dashboard" → "Overview")
- `dashHead()`'s eyebrow/heading text, if it says "Dashboard"/"Command center" anywhere
- Any other literal "Dashboard" string surfaced to the user in this file

## Out of scope for this pass

- Building real content for any item marked "Placeholder" above.
- Moving the existing client-approval stepper/review link out of Website → Publish into Client Workspace.
- A real Preview tab.
- Cross-module data pulls for Growth Center / Optimization Center beyond the existing SEO rollup.
- Renaming the `#/dashboard` URL fragment itself.

## Verification plan

Manual, via the Preview browser tool (no test runner exists in this repo):

1. Sidebar renders all 13 top-level items in the new flat order; "Website" shows a chevron and starts collapsed on cold load with `#/dashboard` active, since Overview is the default landing route.
2. Clicking "Website" navigates to `#/sites` and expands the submenu with all 15 items.
3. Clicking each per-site submodule (Pages, Navigation, Design System, SEO Settings, Publish, Version History) with an existing site jumps into that site's detail view on the matching tab.
4. With zero sites (`previewState: "empty"`), clicking those same submodule items opens the Create modal instead of navigating into a dead page.
5. Clicking "AI Builder" opens the Create modal directly, sidebar shows no "active" state change.
6. Publishing Center shows the sites/status rollup + activity panel + domains content; Build Pipeline shows the stage-track visualization; neither duplicates the other's content, and `viewPublishCenter()`'s old combined body is gone.
7. Optimization Center renders the existing SEO KPIs/rollup/tech panel under its new label.
8. Placeholder pages (Structure, Content, Preview, Client Workspace, Growth Center, Integrations, Help & Resources) each render the existing `CAP` hero+features+CTA pattern, no console errors.
9. "Overview" label appears everywhere "Dashboard"/"Command center" used to (sidebar, breadcrumb, page heading) with route `#/dashboard` unchanged.
10. `preview_console_logs` clean at every step; `preview_resize` to mobile (375px) and desktop (1200/1280px) shows no horizontal scroll on the new nested sidebar in either theme.
