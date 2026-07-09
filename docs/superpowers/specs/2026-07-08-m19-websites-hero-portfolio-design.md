# M19 Website Studio — Websites Page: Hero + Portfolio Fusion

**Status:** Approved for implementation
**Scope:** Frontend-only mockup (`frontend/js/m19-sites.js`, `frontend/styles/m19-studio.css`). No migration, no new routes, no sidebar/topbar changes, no backend calls.

## Background

This is the next slice of the paused "AI Website Operating System" master prompt (hero/portfolio visual overhaul), scoped down to one deliberate change: **Option A** from three IA options discussed with the user — add a hero to the existing Websites page (`#/sites`) only. The "Command center" dashboard (`#/dashboard`, KPIs/attention/table — the default landing when opening Website Studio) is explicitly **out of scope** and stays exactly as it is.

On 2026-07-07 ("Slice A: creation flow consolidation"), a hero + 6 quick-create cards were deliberately removed from this same page and folded into a single 5-tab `openCreateModal()`, specifically to stop the page from being "a dashboard, a creation hub, and a browser fused into one surface." This slice reintroduces that hero deliberately, but keeps the modal as the **only place generation actually happens** — the hero is a second entry point into the same modal, not a second generation path.

Reference: `Screenshot 2026-07-07 220637.png` (the pre-Slice-A hero mockup) — reproduce its hero + quick-create content, not its sidebar/topbar (both are outdated; today's slimmed 6-item sidebar and current topbar are unchanged and out of scope for this slice — the user will request sidebar/topbar changes separately later if needed).

## Goal

`viewSites()` becomes, top to bottom:

1. Hero (headline + AI prompt composer + suggestion chips)
2. Quick-create row (6 cards)
3. Portfolio toolbar (existing filter chips + search, demoted heading)
4. Site-card grid (existing, unchanged)

...so the page reads as one continuous flow — create, then browse/manage — instead of two disconnected sections.

## Out of scope

- `#/dashboard` (Command center) — untouched.
- Sidebar (`NAV`) and topbar — untouched. No nav items added or removed.
- Any new AI-generation code path — the hero never calls `createSiteFromAI` directly; it only opens the existing modal.
- Persisting hero draft text across reloads — session-only, lost on refresh (consistent with other ephemeral UI state in this file, e.g. `reviewBySite`).
- Changing `siteCard()` or the grid's filter/search behavior.

## 1. Extract the shared composer (`m19-sites.js:1240-1255`)

The AI-tab composer markup currently lives inline inside `openCreateModal()`. Extract it into:

```js
function composerHtml(idPrefix) {
  // returns the .st-composer block (textarea, mic button, hint, generate button)
  // + .cm-tuners (niche/style/lang selects) + .st-suggest (HERO_SUGGESTIONS chips),
  // with every id namespaced by idPrefix (e.g. "cm" → #cmPrompt, "hero" → #heroPrompt)
  // so the modal instance and the page-level hero instance never collide.
}
```

`openCreateModal()` calls `composerHtml("cm")` where its inline block is today; behavior (focus styling, mic, `Ctrl/Cmd+Enter` to submit, suggestion-chip fill) is wired the same way it already is, just parameterized by prefix instead of hardcoded ids.

## 2. Hero (`sitesHero()`, new)

Renders, matching the reference screenshot's content (not its chrome):

- Eyebrow: sparkle icon + "AI-POWERED WEBSITE BUILDER"
- `<h1>Build websites <em>with AI</em></h1>` (gradient-italic signature style, per `AIMINDSHARE-DESIGN-v1_0.md` §4)
- Subhead paragraph (as in the screenshot)
- `composerHtml("hero")`
- "Prefer a blank canvas? Start a new site" pill → `openCreateModal("blank")`

No tuners/chips duplication logic beyond what `composerHtml` already provides.

### Generate action

`openCreateModal(tab, prefill)` gains a second, optional parameter. When set, after the modal's composer is built, `$("#cmPrompt", m).value = prefill`. The hero's own `#heroGenerate` click handler reads `#heroPrompt`'s value and calls `openCreateModal("ai", text)` directly (no modal is open yet, so there's nothing to close first). If the hero textarea is empty, same inline validation as the modal today (focus + toast, no navigation) — do not open an empty modal.

## 3. Quick-create row (`sitesQuickCreate()`, new)

Six cards, same visual card idiom as the reference screenshot (icon, title, one-line description):

| Card | Action |
|---|---|
| Create with AI | `openCreateModal("ai")` |
| Start from Blank | `openCreateModal("blank")` |
| Browse Templates | `location.hash = "#/templates"` (the full library page, not the modal's 8-item mini-gallery — better for actual browsing) |
| Import a Website | `openCreateModal("import")` |
| Clone a Website | `openCreateModal("clone")` |
| Continue Recent | navigates to `#/sites/{id}` for the site with the most recent `updated_at`; **card is omitted entirely** when `state.sites` is empty (nothing to continue) |

## 4. Portfolio section (`sitesHead()` → trimmed)

Keep the existing filter/search toolbar and "New site" button. Demote the current `<h1>Your <em>portfolio</em></h1>` treatment to a section-level heading (`<h2>`, matching the weight already used for e.g. "All *websites*" on the Dashboard) so the hero remains the page's one big headline. Site-count lead text stays as-is under the smaller heading.

## 5. Empty state removed

Delete the current `if (!sites.length) {...}` early-return branch in `viewSites()` (the one showing a standalone empty-state panel with its own "Create your first site" CTA). With the hero + quick-create row always present, that CTA is now redundant. Instead:

- Hero and quick-create row render unconditionally.
- The portfolio section (toolbar + grid) renders with zero cards and the grid's existing `#sitesEmpty` inline message (already used for filtered-to-nothing results) doing double duty for a truly empty workspace, e.g. "No websites yet — create your first one above."

## 6. Styling (`m19-studio.css`)

- New classes for `sitesHero()` / `sitesQuickCreate()`, reusing existing tokens/atmosphere/glassmorphism rules from the design system doc — no new visual language.
- Quick-create cards reuse the existing card/panel hover treatment (§5 "Approved card hover" in the design system doc) rather than inventing a new one.
- Composer block styling (`.st-composer`, `.st-comp-bar`, `.st-suggest`) is unchanged/shared between hero and modal via the same classes — only the container widths differ (full-width hero vs. modal pane).

## Verification plan

Manual preview check (no automated test harness for this frontend-only module):

1. Load `#/sites` — hero renders above the quick-create row, above the (demoted) portfolio toolbar, above the grid.
2. Type a description in the hero, click "Generate website" — modal opens on the AI tab with the same text already in its textarea; generating from there works exactly as it does today via the modal.
3. Click the hero's suggestion chips — hero textarea fills, same as the modal's chips do today.
4. Click each quick-create card — correct modal tab opens (or `#/templates` navigates, or the most-recent site opens for "Continue Recent").
5. With zero sites (`Preview state: Empty`), confirm hero + quick-create still show, "Continue Recent" card is absent, and the grid area shows a plain empty message instead of a second CTA panel.
6. Confirm `#/dashboard` (Command center) is pixel-for-pixel unchanged.
7. Resize to 375px and 1200px — 0 horizontal scroll, dark mode intact, no console errors.
