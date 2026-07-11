# M21 SEO Engine — Sidebar Navigation & Page Routing Shell

Date: 2026-07-11

## Context

M21 SEO Engine already exists and is fully built ([frontend/m21-seo-engine.html](../../../frontend/m21-seo-engine.html), [frontend/js/m21-seo.js](../../../frontend/js/m21-seo.js)) as a vanilla HTML/CSS/JS hash-routed app — the same pattern used by every module in this repo. Its current sidebar is 3 flat items (Keyword research, Rank tracker, Site audit).

A PRD was provided describing a much deeper 9-section sidebar with nested submenus (Dashboard, Keyword Research, Clusters, SERP Analysis, Competitors, Keyword Lists, Rank Tracking, Technical Audit, Settings — ~30 leaf routes total, plus a few dynamic detail routes). The PRD was written assuming a Next.js/React/shadcn stack; this repo has none of that. This spec adapts the requested nav structure to the existing vanilla stack instead of introducing new frameworks.

**Scope: navigation shell + routing skeleton only.** Feature logic for each new page is out of scope and will be built in later sessions, except where it already exists (see "Existing content" below).

## Full nav tree

```
Dashboard                          #/seo                        (new placeholder)
Keyword Research                   #/seo/keywords
  - Keyword Explorer                 #/seo/keywords/explorer    (existing page, becomes default)
  - Opportunity Score                #/seo/keywords/opportunity (placeholder)
  - Related Keywords                 #/seo/keywords/related     (placeholder, shadow-note)
  - Question Finder                  #/seo/keywords/questions   (placeholder, shadow-note)
  - Long-Tail Generator              #/seo/keywords/long-tail   (placeholder)
  - AI-Search Query Variants         #/seo/keywords/ai-search   (placeholder)
  - Country/Language Selector        #/seo/keywords/settings    (placeholder)
Clusters                           #/seo/clusters                (default = Cluster List, placeholder)
  - Cluster Builder                   #/seo/clusters/builder    (placeholder)
  - Cluster Detail                    #/seo/clusters/:id        (dynamic, placeholder, not in sidebar)
SERP Analysis                      #/seo/serp                    (new, placeholder)
  - SERP Snapshot                     #/seo/serp/snapshot       (placeholder, shadow-note)
  - SERP Weakness Indicator           #/seo/serp/weakness       (placeholder)
Competitors                        #/seo/competitors              (new, placeholder)
  - Domain Overview                   #/seo/competitors/overview (placeholder)
  - Keyword Gap                       #/seo/competitors/gap      (placeholder)
  - Gap Action Layer                  #/seo/competitors/gap-actions (placeholder)
  - Send-to-Queue                     #/seo/competitors/send-to-queue (placeholder)
Keyword Lists                      #/seo/lists                    (default = Named Collections, placeholder)
  - Bulk Actions                      #/seo/lists/bulk           (placeholder)
Rank Tracking                      #/seo/rankings                 (existing page = default "Tracked Keywords")
  - Position History                  #/seo/rankings/:id/history (dynamic, placeholder)
  - Competitor Overlay                 #/seo/rankings/overlay    (placeholder)
  - Weekly Summary                     #/seo/rankings/summary    (placeholder)
Technical Audit                    #/seo/audit                    (existing page = default)
  - Site Crawler                       #/seo/audit/crawler       (placeholder)
  - Core Web Vitals                    #/seo/audit/cwv           (placeholder)
  - Schema Validator                   #/seo/audit/schema        (placeholder)
  - SSL Check                          #/seo/audit/ssl           (placeholder)
  - Audit Score & Issues                #/seo/audit/:id           (dynamic, placeholder)
Settings                           #/seo/settings                  (new, placeholder)
  - API Connections                    #/seo/settings/connections (placeholder)
  - Cache Settings                     #/seo/settings/cache      (placeholder)
  - Scoring Weights                    #/seo/settings/scoring    (placeholder)
```

## A. Data model & routing

`NAV` (currently a flat array of 3 items in `m21-seo.js`) becomes an array of section objects, each with an optional `children` array:

```js
{ key: "keywords", label: "Keyword Research", ico: "search", hash: "#/seo/keywords",
  children: [
    { key: "explorer", label: "Keyword Explorer", hash: "#/seo/keywords/explorer" },
    { key: "opportunity", label: "Opportunity Score", hash: "#/seo/keywords/opportunity" },
    ...
  ] }
```

`parseRoute()` currently only reads `parts[1]` (`state.route = { name: parts[1] }`). It becomes:
- `section = parts[1]`
- `sub = parts[2]` if it matches a known child key for that section; otherwise, for sections that declare dynamic detail routes (`clusters`, `rankings`, `audit`), `parts[2]` (or `parts[3]` for `rankings/:id/history`) is treated as a dynamic `id`.
- `state.route = { section, sub, id }`

Render dispatch (currently an `if/else` in `loadRoute`/the render path keyed on `state.route.name`) becomes a lookup table keyed by `"section"` or `"section/sub"`, falling back to a shared placeholder renderer for any key not in the table.

## B. Sidebar UI

Reuses the expandable-group pattern already shipped for M19 Studio (`.nav-parent` / `.nav-chevron` / `.nav-children` classes, defined in `components.css` / `m19-studio.css`) instead of new CSS. Difference from M19: M19 has one expandable group (in/out of a site); M21 needs each of the 9 sections to expand/collapse independently. Expand/collapse state lives in a `Set` on `state` (e.g. `state.navOpen`), and whichever section contains the currently active route auto-expands on load. A parent row gets the existing `active` class convention when any descendant route is active (mirrors `parentActive` in `m19-sites.js`).

Badges: a plain `getSeoNavCounts()` function (vanilla stand-in for the PRD's React `useSeoNavCounts()` hook) returns a static mock object. Populated for two items as illustrative examples: **Technical Audit** (critical issue count) and **Competitors** (new gap count). All other items resolve to `0` and show no badge.

## C. Existing content vs. placeholders

Preserves all real, working functionality; only genuinely new leaves get stubbed.

- **Keyword Explorer** (`#/seo/keywords/explorer`, and default for bare `#/seo/keywords`) — the current Keyword Research page (search form + Related/Questions/SERP tabs) moves here unchanged.
- **Rank Tracking** (`#/seo/rankings`) — current Rank tracker page stays, now serving as the parent's default child ("Tracked Keywords").
- **Technical Audit** (`#/seo/audit`) — current Site audit page stays as the parent's default view.
- **Dashboard** (`#/seo`) — genuinely new, placeholder.
- **Related Keywords** (`#/seo/keywords/related`), **Question Finder** (`#/seo/keywords/questions`), **SERP Snapshot** (`#/seo/serp/snapshot`) — these overlap with tabs that already work inside Explorer (`state.activeTab` tabs: related/questions/serp). Get a placeholder, but with explicit copy noting the feature currently lives as a tab inside Keyword Explorer and should be promoted to a standalone page in a later session — not a generic "Coming soon," so nothing reads as silently duplicated or broken.
- **Everything else** (Opportunity Score, Long-Tail Generator, AI-Search Query Variants, Country/Language Selector, Cluster Builder/List/Detail, SERP Weakness Indicator, all 4 Competitors leaves, both Keyword Lists leaves, Rank Tracking's 3 new sub-views, Audit's 4 new sub-views, all 3 Settings leaves) — shared generic "Coming soon" placeholder component, wired into the router so URL/nav/active-state all work with no real data/logic behind them.

## D. Mobile & files touched

Icon-only rail (≤1100px) and full overlay drawer (≤760px) already exist in `components.css` and need no new breakpoints. One small addition: `.nav-children` isn't currently hidden in icon-only rail mode (only `.nav-item` labels are) — add a rule to hide it there too, since a flyout submenu is out of scope.

Files touched:
- [frontend/js/m21-seo.js](../../../frontend/js/m21-seo.js) — NAV data, router (`parseRoute`/`loadRoute`), shell/nav rendering, dispatch table, placeholder page renderer.
- [frontend/styles/m21-seo.css](../../../frontend/styles/m21-seo.css) — reuse existing `.nav-parent`/`.nav-children` classes (defined elsewhere), add the icon-only-mode override for `.nav-children`.

No new files, no migration, no new dependencies, no changes to `DECISIONS`/`TASKS` (pure frontend nav scaffold, no schema or feature behavior change).

## Out of scope

- Real feature logic for any placeholder page (separate future sessions, one per section/feature as needed).
- Any change to Dashboard, SERP Analysis, Competitors, Keyword Lists, or Settings beyond routable placeholder shells.
- Promoting Related/Questions/SERP tab content out of Explorer into their own standalone implementations (only flagged via placeholder copy, not built).
