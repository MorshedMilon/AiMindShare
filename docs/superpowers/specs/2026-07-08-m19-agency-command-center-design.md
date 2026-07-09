# M19 Website Studio — Agency Command Center (Dashboard "Attention needed" upgrade)

**Status:** Approved for implementation
**Scope:** Frontend-only mockup (`frontend/js/m19-sites.js`, `frontend/styles/m19-studio.css`). No migration, no new routes, no backend calls.

## Background

This is slice 1 of a much larger "AI Website Operating System" master prompt that was
decomposed into independent sub-projects (see conversation; full prompt not persisted
as a separate doc). The master prompt's Section 4 ("Agency Command Center") asks for a
cross-site operational inbox covering ~16 alert categories. The Dashboard already has a
real version of this — `attentionItems()` / `attentionPanel()` in `m19-sites.js:1389-1474`
— covering SSL/DNS, six health categories (seo/schema/a11y/perf/links/fields), and
publish backlog, capped at 8 rows, sorted by severity, one action button per row.

This slice extends that existing panel in place rather than inventing a new page,
route, or "problems vs opportunities" split — confirmed with the user.

## Goal

Grow `attentionItems()` to cover three more real signals (pending client review, lead/
booking captures, stale content) plus one synthetic one (AI suggestions), and restructure
`attentionPanel()` with filter chips so the longer list stays scannable. Two categories
from the master prompt — "conversion opportunities" and "brand consistency" — are folded
into the AI-suggestions group as suggestion text rather than built as separate detection
logic, since neither has real underlying data to detect from in this mockup.

## Out of scope

- New nav item / route — stays on the existing Dashboard.
- A dedicated Leads/CRM tab inside a site — leads rollups link to the existing Analytics tab.
- Any backend/Supabase query changes — all new data lives in the existing `MOCK` object and
  falls back the same way `health`/`domains`/etc. already do when disconnected.
- Persisting dismissed AI suggestions across a page reload — session-only, like the rest of
  the app's mockup interaction state (`reviewBySite`, etc.).
- Changing `dashKpis()` — the KPI strip is unchanged.

## 1. Data model additions (`MOCK` object, `m19-sites.js:84`)

```js
// MOCK.domains — add expires_at to existing records
domains: {
  s1: [{ ...existing, expires_at: "2026-08-02T00:00:00Z" }],  // ~3 weeks out → warn
  s3: [{ ...existing, expires_at: "2026-07-11T00:00:00Z" }],  // ~3 days out → crit
}

// New: MOCK.leads — recent captures per site, most recent first
leads: {
  s1: [
    { id: "ld1", type: "form", label: "Contact form", created_at: "2026-07-07T09:20:00Z" },
    { id: "ld2", type: "booking", label: "Discovery call", created_at: "2026-07-06T16:05:00Z" },
  ],
  s3: [
    { id: "ld3", type: "booking", label: "Coaching consult", created_at: "2026-07-07T11:00:00Z" },
  ],
}

// New: MOCK.suggestions — short AI-suggestion strings per site
suggestions: {
  s1: [
    { id: "sg1", title: "Homepage CTA has a low click-through", detail: "Try a stronger, benefit-led headline above the fold." },
  ],
  s2: [
    { id: "sg2", title: "Brand colors drift on the Contact page", detail: "Contact page buttons don't match your Brand Kit primary color." },
    { id: "sg3", title: "Pricing page could convert better", detail: "Add a comparison table — sites with one see higher signup rates." },
  ],
}
```

`state` gains `leadsBySite: {}` and `suggestionsBySite: {}` (loaded from `MOCK` the same
way `healthBySite`/`domainsBySite` are today), plus `dismissedSuggestions: {}` (a plain
object used as a Set, keyed by suggestion id, session-only — never written to Supabase).

## 2. `attentionItems()` additions (`m19-sites.js:1389`)

Four new blocks, same shape as the existing ones (`{ group, sev, ico, site, title, detail, actLabel, ...navTarget }`):

- **Domain expiry** (extends the existing domain loop): if `d.expires_at` is within 7 days → `sev:"crit"`, title `"Domain expires in Nd · {domain}"`; within 30 days → `sev:"warn"`. Skip only if that domain already has a **DNS-verify-failure** row in the same pass (a real failure event makes an expiry warning redundant noise). Do **not** dedupe against the routine SSL-pending check — SSL-pending and about-to-lapse are unrelated facts about a domain, and a domain can sit in pending-SSL state for a long time while still being days from expiring; suppressing expiry on that basis would hide real risk.
- **Pending client review** (`group: "review"`): for each site where `state.reviewBySite[site.id] === "review"`, one item, `sev:"info"`, title `"Awaiting client review · {site}"`, action `"Publish"` → `nav:"publish"`.
- **Stale content** (extends the existing publish loop, reuses `site.updated_at` — no new field): if `status === "published"` and `updated_at` is >90 days old, `sev:"info"`, title `"Content hasn't changed in {N}d · {site}"`, action `"Review"` → `nav:"overview"`. This is mutually exclusive with the existing "unpublished changes" check (an either/or on the same site).
- **Leads & bookings** (`group: "leads"`): for each site with entries in `leadsBySite` dated within the last 48h, **one rolled-up item per site** (not one row per lead — see §3), `sev:"info"`, action `"Review"` → `nav:"analytics"`.
- **AI suggestions** (`group: "ai"`): one item per non-dismissed entry in `suggestionsBySite[site.id]`, `sev:"opp"` (new tier, see §4), action `"Open"` → `open: site.id`, plus a dismiss affordance (see §5).

## 3. Lead rollup behavor

One item per site, not per lead, to avoid flooding the list. For a site with N leads in
the last 48h:

- `title`: `"{N} new lead{s} · {site.name}"` (e.g. "3 new leads · Crescent Dental").
- `detail`: a short type breakdown built from the rolled-up entries, e.g. `"2 form submissions, 1 booking"`.
- Sites with zero leads in the window produce no item — there is no "all clear" row per
  site; the panel's single overall "All clear" state (shown when `items.length === 0`)
  is unchanged.

## 4. Severity ordering

Extend the existing `rank` map (`m19-sites.js:1420`) with one new tier below `info`:

```js
const rank = { crit: 0, warn: 1, info: 2, opp: 3 };
```

- `crit` / `warn` / `info` keep their current meaning and are used exactly as today for
  domain, health, publish, review, and leads items — these are all "something needs
  attention" signals.
- `opp` ("opportunity") is new and used **only** for AI-suggestion items. It sorts last
  within the "All" view so synthetic suggestions never outrank a real SSL failure or
  failed SEO check, but still surface once genuine issues are cleared.
- Sort remains a single `items.sort((a,b) => rank[a.sev] - rank[b.sev])` — no secondary
  sort key needed since ties are rare and current order (loop-insertion order) is stable
  and acceptable, matching today's behavior.
- **No cross-item suppression.** Rank controls sort order only. A single site can and
  will produce multiple rows across multiple groups at once — e.g. a site with a `crit`
  SSL failure and an `opp` AI suggestion shows **both** rows, not just the higher-severity
  one. There is no one-row-per-site cap and no logic that hides a lower-priority item
  because a higher-priority one exists for the same site. This is intentional: the
  command center is meant to surface real issues and lower-priority opportunities
  simultaneously, not collapse a site down to its single worst signal.

## 5. Panel structure (`attentionPanel()`, `m19-sites.js:1463`)

- Filter chips above the list, styled like the existing `dt-chip` filters in
  `sitesTable()` (`m19-sites.js:1499`): **All / SEO & Health / Domains / Publish & Reviews
  / Leads & Bookings / AI Suggestions**, each showing a live count derived from the
  post-dismissal item list (see below). Default active chip: `All`.
- Chip → group mapping: `seo` chip matches `group:"seo"`; `domains` matches `group:"domain"`;
  `publish` chip matches `group:"publish"` OR `group:"review"`; `leads` matches
  `group:"leads"`; `ai` matches `group:"ai"`.
- Remove the `items.slice(0, 8)` cap. The list becomes a scrollable container (`max-height`
  + `overflow-y:auto` in CSS, consistent with other scrollable panels in `m19-studio.css`)
  showing every item for the active chip, severity-sorted.
- Row rendering is unchanged for every group except `ai`: an AI-suggestion row gets a
  small trailing "✕" dismiss button (`icon-btn sm`) next to its action button, instead of
  only an action button.

## 6. Dismiss behavior and chip counts

- Clicking dismiss on an `ai` row sets `state.dismissedSuggestions[suggestionId] = true`
  and calls `render()` — no toast needed (it's a low-stakes, reversible-by-reload action,
  consistent with how ephemeral UI state is handled elsewhere in this file).
- `attentionItems()` filters out any suggestion whose id is in `state.dismissedSuggestions`
  **before** the list is returned — so dismissal removes the row and updates **every**
  chip count that includes it (`AI Suggestions` and `All`) for the rest of the session.
  There is no separate "hidden" bookkeeping — a dismissed suggestion simply stops being
  generated.
- Reloading the page resets `dismissedSuggestions` to `{}` (it is plain in-memory state,
  not persisted to `localStorage` or Supabase), so dismissed suggestions reappear after a
  refresh — acceptable for a mockup and consistent with `reviewBySite`'s existing lifetime.

## Verification plan

Manual preview check (no automated test harness for this frontend-only module):

1. Load `#/dashboard` in the preview — confirm the panel renders with 6 chips, correct
   per-chip counts, and no console errors.
2. Click through each chip — confirm the list filters correctly and severity order holds
   within a chip.
3. Dismiss an AI suggestion — confirm the row disappears and both the `AI Suggestions`
   and `All` chip counts decrement immediately, no reload needed.
4. Resize to mobile (375px) and check for horizontal scroll regressions in the panel
   (matches the project's existing h-scroll verification bar for M19 work).
5. Confirm existing rows (SSL/DNS, health categories, publish backlog) are visually and
   behaviorally unchanged.
