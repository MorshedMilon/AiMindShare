# M19 Website Studio — Sidebar IA Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current 6-item flat workspace rail + separate 5-group per-site rail in `frontend/js/m19-sites.js` with one persistent, flat, 13-item "Website Studio" sidebar whose "Website" row expands in place into a 15-item nested sub-navigation covering every direct site-building tool, per `docs/superpowers/specs/2026-07-09-m19-website-studio-ia-restructure-design.md`.

**Architecture:** The `NAV` array becomes a single tree: 13 top-level entries, one of which (`sites`, labeled "Website") carries a `children` array of 15 submodule entries. `siteRail()`/`SITE_NAV` (the old full-rail-swap-on-site-detail mechanism) are deleted — `shell()` now always calls the same `railNav()`, which renders the site-identity header and highlights the active per-site tab *inside* the already-expanded "Website" children list instead of replacing the whole rail. A new `activeSiteId()` helper resolves "which site" for the 6 per-site submodule items (Pages, Navigation, Design System, SEO Settings, Version History, Publish) when clicked from outside a site detail view. Deleting the old rail removes the only reachable path to the per-site Domains and Integrations tabs, so this plan restores that reachability via two new quick-links on the site Overview tab (mirroring the existing SEO/Health/Analytics quick-link pattern) rather than reintroducing them into the new nav lists, which must stay exactly as specified.

**Tech Stack:** Plain IIFE JavaScript (`frontend/js/m19-sites.js`), no bundler, no module system, no test runner exists in this repo. Verification is manual, via the Preview browser tool (`preview_eval` for logic/state checks, `preview_snapshot`/`preview_screenshot`/`preview_inspect` for visual/DOM checks).

**Reference:** `docs/superpowers/specs/2026-07-09-m19-website-studio-ia-restructure-design.md`

---

### Task 1: State fields + `activeSiteId()` helper + `lastSiteId` tracking

**Files:**
- Modify: `frontend/js/m19-sites.js:218-228` (`state`)
- Modify: `frontend/js/m19-sites.js:666` (`detailCache` declaration — add `lastRailSection` next to it)
- Modify: `frontend/js/m19-sites.js:2331-2362` (`render()`)

- [ ] **Step 1: Add `railWebsiteOpen`/`lastSiteId` to `state`**

Find (`m19-sites.js:218-228`):

```js
  const state = {
    loaded: false, loading: false, error: null, previewState: "default",
    user: null, workspaceId: null, workspaceName: "", role: "staff",
    sites: [], pagesBySite: {}, domainsBySite: {}, templates: [],
    profilesBySite: {}, healthBySite: {},
    activity: [], sessions7: null, domainsActive: null, reviewBySite: {},
    leadsBySite: {}, suggestionsBySite: {}, dismissedSuggestions: {}, attnChip: "all",
    team: [], teamBySite: {}, metricsBySite: {},
    sitesToolbar: { chip: "all", q: "", niche: "", needsAttn: false, tag: "", sort: "name", view: "grid" },
    tab: "overview", editor: null,
  };
```

Replace with:

```js
  const state = {
    loaded: false, loading: false, error: null, previewState: "default",
    user: null, workspaceId: null, workspaceName: "", role: "staff",
    sites: [], pagesBySite: {}, domainsBySite: {}, templates: [],
    profilesBySite: {}, healthBySite: {},
    activity: [], sessions7: null, domainsActive: null, reviewBySite: {},
    leadsBySite: {}, suggestionsBySite: {}, dismissedSuggestions: {}, attnChip: "all",
    team: [], teamBySite: {}, metricsBySite: {},
    sitesToolbar: { chip: "all", q: "", niche: "", needsAttn: false, tag: "", sort: "name", view: "grid" },
    tab: "overview", editor: null,
    // Website Studio sidebar (IA restructure) — the "Website" row's expand state,
    // and the last site opened this session, used to resolve which site the
    // per-site Website submodules (Pages, Navigation, ...) should jump into.
    railWebsiteOpen: true, lastSiteId: null,
  };
  // Resolves "which site" for Website submodule items clicked from outside a site
  // detail view: last-opened site if it still exists, else the first site, else null.
  function activeSiteId() {
    const sites = state.sites || [];
    if (state.lastSiteId && sites.some((s) => s.id === state.lastSiteId)) return state.lastSiteId;
    return sites[0] ? sites[0].id : null;
  }
```

- [ ] **Step 2: Add `lastRailSection` next to `detailCache`**

Find (`m19-sites.js:666`):

```js
  let detailCache = null;
```

Replace with:

```js
  let detailCache = null;
  // Tracks which top-level rail section was active on the PREVIOUS render, so the
  // "Website" submenu auto-opens only when navigation transitions INTO its scope
  // (not on every in-place re-render while already inside it, which would fight a
  // manual collapse). See WEBSITE_PAGE_KEYS + the render() edit in Task 1 Step 3.
  let lastRailSection = null;
  const WEBSITE_PAGE_KEYS = new Set(["structure", "components", "sections", "content", "assets", "forms", "blog", "preview"]);
```

- [ ] **Step 3: Track `lastSiteId` + auto-open "Website" on section entry in `render()`**

Find (`m19-sites.js:2331-2346`):

```js
  async function render() {
    const app = $("#app");
    const parts = parseHash();
    if (parts[0] === "sites" && parts[2] === "edit") { // editor (full-bleed)
      app.innerHTML = shell(viewEditor(parts[1], parts[3]), { bare: true });
      bindGlobal(); await mountEditor(parts[1], parts[3]); return;
    }
    if (parts[0] === "sites" && parts[1]) { // site detail — contextual per-site rail
      if (detailCache && detailCache.site?.id !== parts[1]) detailCache = null;
      const body = await viewSiteDetail(parts[1]);
      app.innerHTML = shell(body, { siteCtx: { site: detailCache && detailCache.site, tab: state.tab } });
      bindGlobal(); bindDetail(parts[1]); reveal(); return;
    }
    detailCache = null;
    const r0 = parts[0] || "dashboard";
    let html, binder, active = r0;
```

Replace with:

```js
  async function render() {
    const app = $("#app");
    const parts = parseHash();
    const websiteScoped = parts[0] === "sites" || WEBSITE_PAGE_KEYS.has(parts[0]);
    const section = websiteScoped ? "website" : (parts[0] || "dashboard");
    if (section === "website" && lastRailSection !== "website") state.railWebsiteOpen = true;
    lastRailSection = section;
    if (parts[0] === "sites" && parts[2] === "edit") { // editor (full-bleed)
      app.innerHTML = shell(viewEditor(parts[1], parts[3]), { bare: true });
      bindGlobal(); await mountEditor(parts[1], parts[3]); return;
    }
    if (parts[0] === "sites" && parts[1]) { // site detail — Website submenu shows this site's tabs
      if (detailCache && detailCache.site?.id !== parts[1]) detailCache = null;
      const body = await viewSiteDetail(parts[1]);
      state.lastSiteId = parts[1];
      app.innerHTML = shell(body, { active: "sites", siteCtx: { site: detailCache && detailCache.site, tab: state.tab } });
      bindGlobal(); bindDetail(parts[1]); reveal(); return;
    }
    detailCache = null;
    const r0 = parts[0] || "dashboard";
    let html, binder, active = r0;
```

- [ ] **Step 4: Verify via the preview tool**

1. `preview_start` for the `frontend/` static site (or confirm it's already running), then `preview_eval: location.reload()`.
2. `preview_eval: location.hash = "#/sites"`, then `preview_eval: location.hash = "#/sites/s1"` — no errors expected (nothing reads the new fields yet).
3. `preview_console_logs` with `level: "error"` — expect empty output.

---

### Task 2: Rebuild `NAV` as a tree, delete `SITE_NAV`, add 7 placeholder `CAP` entries

**Files:**
- Modify: `frontend/js/m19-sites.js:318-333` (`NAV`, `SITE_NAV`, `ROUTE_LABELS`)
- Modify: `frontend/js/m19-sites.js:2029-2040` (`CAP`)

- [ ] **Step 1: Replace `NAV`/`SITE_NAV`/`ROUTE_LABELS`**

Find (`m19-sites.js:318-333`):

```js
  const NAV = [
    ["Overview", [["dashboard", "Dashboard", "grid"]]],
    ["Create", [["sites", "Websites", "globe"], ["templates", "Templates", "layers"]]],
    ["Library", [["assets", "Assets", "image"]]],
    ["Grow", [["analytics", "Analytics", "chart"]]],
    ["Configure", [["settings", "Settings", "gear"]]],
  ];
  // Per-site workspace nav — swaps into the rail when you're inside a site.
  const SITE_NAV = [
    ["Site", [["overview", "Overview", "grid"], ["pages", "Pages", "doc"], ["__editor", "Editor", "edit"]]],
    ["Design", [["profile", "Brand & profile", "palette"], ["nav", "Navigation", "rows"]]],
    ["Optimize", [["seo", "SEO & schema", "search"], ["health", "Site Health", "gauge"], ["domains", "Domains", "link"]]],
    ["Grow", [["analytics", "Analytics", "chart"], ["publish", "Publish", "rocket"], ["integrations", "Integrations", "puzzle"]]],
    ["Configure", [["settings", "Settings", "gear"]]],
  ];
  const ROUTE_LABELS = { dashboard: "Command center", sites: "Websites", templates: "Template library", pages: "Pages", components: "Components", sections: "Sections", assets: "Assets", forms: "Forms", blog: "Blog", seo: "SEO", domains: "Domains", publish: "Publish", analytics: "Analytics", settings: "Settings" };
```

Replace with:

```js
  // Website Studio sidebar — one flat list of major destinations. "sites" is the
  // only entry with `children`: those 15 are the direct site-building tools.
  //
  // PRODUCT RULE: if the item is about building the website directly, it's a
  // `sites` child. If it's about operations, collaboration, reporting, growth,
  // optimization, or system-wide controls, it's a top-level entry instead.
  //
  // Child `kind`:
  //   "tab"  — a per-site tab. Resolves activeSiteId() and sets state.tab.
  //   "page" — a normal top-level route (workspace capability page or the bare
  //            Sites portfolio); navigates via #/<key> regardless of any open site.
  const NAV = [
    { k: "dashboard", l: "Overview", ic: "grid" },
    { k: "sites", l: "Website", ic: "globe", children: [
        { k: "sites", l: "Sites", ic: "globe", kind: "page" },
        { k: "pages", l: "Pages", ic: "doc", kind: "tab" },
        { k: "nav", l: "Navigation", ic: "rows", kind: "tab" },
        { k: "structure", l: "Structure", ic: "layers", kind: "page" },
        { k: "profile", l: "Design System", ic: "palette", kind: "tab" },
        { k: "components", l: "Components", ic: "puzzle", kind: "page" },
        { k: "sections", l: "Sections", ic: "grid", kind: "page" },
        { k: "content", l: "Content", ic: "type", kind: "page" },
        { k: "assets", l: "Media Library", ic: "image", kind: "page" },
        { k: "forms", l: "Forms", ic: "form", kind: "page" },
        { k: "blog", l: "Blog / CMS", ic: "book", kind: "page" },
        { k: "seo", l: "SEO Settings", ic: "search", kind: "tab" },
        { k: "versions", l: "Version History", ic: "clock", kind: "tab" },
        { k: "preview", l: "Preview", ic: "eye", kind: "page" },
        { k: "publish", l: "Publish", ic: "rocket", kind: "tab" },
      ] },
    { k: "templates", l: "Templates", ic: "layers" },
    { k: "ai-builder", l: "AI Builder", ic: "spark", action: true },
    { k: "clients", l: "Client Workspace", ic: "users" },
    { k: "pipeline", l: "Build Pipeline", ic: "gauge" },
    { k: "publish", l: "Publishing Center", ic: "rocket" },
    { k: "analytics", l: "Analytics", ic: "chart" },
    { k: "growth", l: "Growth Center", ic: "zap" },
    { k: "seo", l: "Optimization Center", ic: "wand" },
    { k: "integrations", l: "Integrations", ic: "puzzle" },
    { k: "settings", l: "Settings", ic: "gear" },
    { k: "help", l: "Help & Resources", ic: "book" },
  ];
  const ROUTE_LABELS = { dashboard: "Overview", sites: "Websites", templates: "Template library", components: "Components", sections: "Sections", assets: "Media Library", forms: "Forms", blog: "Blog / CMS", structure: "Structure", content: "Content", preview: "Preview", seo: "Optimization Center", publish: "Publishing Center", pipeline: "Build Pipeline", analytics: "Analytics", growth: "Growth Center", integrations: "Integrations", settings: "Settings", clients: "Client Workspace", help: "Help & Resources" };
```

- [ ] **Step 2: Add 7 new placeholder `CAP` entries**

Find (`m19-sites.js:2029-2040`, note the trailing `};` closes the object):

```js
    blog: { ico: "book", title: "Blog", lead: "Publish articles and a structured blog with AI drafting, scheduling and SEO built in — perfect for content that ranks and feeds your funnels.",
      feats: [["book", "Structured CMS", "Posts, categories and authors."], ["spark", "AI drafting", "Generate and refine posts fast."], ["clock", "Scheduling & RSS", "Queue posts and syndicate."], ["search", "SEO-ready", "Meta, schema and internal links per post."]], cta: "href", href: "m22-manual-content-cms.html", ctaLabel: "Open Content & Blog" },
  };
```

Replace with:

```js
    blog: { ico: "book", title: "Blog", lead: "Publish articles and a structured blog with AI drafting, scheduling and SEO built in — perfect for content that ranks and feeds your funnels.",
      feats: [["book", "Structured CMS", "Posts, categories and authors."], ["spark", "AI drafting", "Generate and refine posts fast."], ["clock", "Scheduling & RSS", "Queue posts and syndicate."], ["search", "SEO-ready", "Meta, schema and internal links per post."]], cta: "href", href: "m22-manual-content-cms.html", ctaLabel: "Open Content & Blog" },
    structure: { ico: "layers", title: "Structure", lead: "A bird's-eye map of every page, its parent/child relationships and internal links — reorganize your site's shape without opening each page individually.",
      feats: [["layers", "Visual sitemap", "See every page and how they connect."], ["rows", "Drag to reorder", "Restructure navigation depth in one view."], ["link", "Orphan detection", "Find pages nothing links to."], ["search", "SEO impact", "Preview how structure changes affect crawlability."]], cta: "editor", ctaLabel: "Open the visual editor" },
    content: { ico: "type", title: "Content", lead: "A single place to review and edit copy across every page and post — headlines, body text and CTAs — without hunting through the page editor.",
      feats: [["type", "Cross-page copy view", "Every headline and paragraph in one list."], ["spark", "AI rewrite", "Improve tone or length in a click."], ["search", "Find & replace", "Update a phrase across the whole site."], ["clock", "Change history", "See what copy changed and when."]], cta: "editor", ctaLabel: "Open the visual editor" },
    preview: { ico: "eye", title: "Preview", lead: "See exactly what visitors see before you publish — desktop, tablet and mobile — with a shareable staging link for quick sanity checks.",
      feats: [["eye", "Live device preview", "Desktop, tablet and mobile in one view."], ["link", "Shareable staging link", "Send a preview without publishing."], ["monitor", "Responsive check", "Catch layout issues before launch."], ["rocket", "One click to publish", "Move straight from preview to live."]], cta: "editor", ctaLabel: "Open the visual editor" },
    clients: { ico: "users", title: "Client Workspace", lead: "Branded collaboration with your clients — approvals, comments and file sharing — layered on top of the review link and approval stepper already built into every site's Publish tab.",
      feats: [["users", "Branded client portal", "A dedicated space clients recognize as yours."], ["check", "Approvals", "Clients approve directly, no email back-and-forth."], ["edit", "Inline comments", "Feedback pinned to the exact section."], ["download", "File sharing", "Share briefs and assets in one thread."]], cta: "editor", ctaLabel: "Open the visual editor" },
    growth: { ico: "zap", title: "Growth Center", lead: "Cross-workspace growth signals — CRM pipeline, campaigns, funnels and forms performance — surfaced next to your websites instead of siloed in separate modules.",
      feats: [["chart", "Funnel performance", "See where visitors drop off, site by site."], ["users", "CRM pipeline", "Leads generated per site, in one view."], ["spark", "Campaign attribution", "Which campaigns actually drive traffic."], ["form", "Form conversion", "Submission rates across every embedded form."]], cta: "editor", ctaLabel: "Open the visual editor" },
    integrations: { ico: "puzzle", title: "Integrations", lead: "Workspace-level third-party connections — analytics, payments, email and more — distinct from the CRM widgets (forms, booking, chat) you already embed per site.",
      feats: [["puzzle", "Third-party apps", "Connect the tools your workspace already uses."], ["link", "Webhooks", "Push site events to external systems."], ["gear", "API access", "Programmatic access for custom integrations."], ["check", "Connection health", "See what's connected and what needs attention."]], cta: "editor", ctaLabel: "Open the visual editor" },
    help: { ico: "book", title: "Help & Resources", lead: "Documentation, keyboard shortcuts and support — everything you need to get unstuck without leaving the studio.",
      feats: [["book", "Documentation", "Guides for every part of the studio."], ["search", "Searchable help", "Find answers without contacting support."], ["users", "Contact support", "Reach a real person when you're stuck."], ["spark", "What's new", "Release notes for recent studio updates."]], cta: "editor", ctaLabel: "Open the visual editor" },
  };
```

- [ ] **Step 3: Verify via the preview tool**

1. `preview_eval: location.reload()` — expect no console errors (NAV/CAP are data only; nothing renders them yet, `railNav()` still reads the *old* shape until Task 3).
2. `preview_console_logs` with `level: "error"` — this step is expected to show errors, since `railNav()` (Task 3) still expects the old `NAV` shape. **Do not stop here** — proceed directly to Task 3, which fixes this; Tasks 2 and 3 land together before the next real verification checkpoint.

---

### Task 3: Rewrite `railNav()`, delete `siteRail()`, make `shell()` always use `railNav()`

**Files:**
- Modify: `frontend/js/m19-sites.js:334-358` (`railNav`, `siteRail`, `shell`)

- [ ] **Step 1: Replace `railNav()` + `siteRail()` + `shell()`**

Find (`m19-sites.js:334-358`):

```js
  function railNav(active) {
    return NAV.map(([label, items]) => `<div class="nav-group"><div class="nav-group-label">${label}</div>${items.map(([k, l, ic]) =>
      `<div class="nav-item ${k === active ? "active" : ""}" data-nav="${k}"><span class="ni-ico">${svg(ic)}</span><span>${l}</span>${k === "dashboard" && (state.sites || []).some((s) => s.status === "published") ? `<span class="ni-dot" title="Live sites"></span>` : ""}</div>`).join("")}</div>`).join("");
  }
  // Contextual per-site rail — back link + site identity + the SITE_NAV groups.
  function siteRail(site, tab) {
    const dom = site.primary_domain || ((site.subdomain || "site") + ".aimindshare.site");
    const groups = SITE_NAV.map(([label, items]) => `<div class="nav-group"><div class="nav-group-label">${label}</div>${items.map(([k, l, ic]) =>
      k === "__editor"
        ? `<div class="nav-item" data-openeditor="${esc(site.id)}"><span class="ni-ico">${svg(ic)}</span><span>${l}</span><span class="ni-tag">open</span></div>`
        : `<div class="nav-item ${k === tab ? "active" : ""}" data-tab="${k}"><span class="ni-ico">${svg(ic)}</span><span>${l}</span></div>`).join("")}</div>`).join("");
    return `
      <button class="rail-back" id="backSites">${svg("back", 14)} All websites</button>
      <div class="rail-site"><span class="rs-favi ${site.style_preset ? "sc-favi-" + esc(site.style_preset) : ""}">${esc(initials(site.name))}</span>
        <span class="rs-id"><b>${esc(site.name)}</b><span class="rs-dom">${esc(dom)}</span></span></div>
      ${groups}`;
  }
  function shell(content, opts) {
    opts = opts || {};
    if (opts.bare) return `<main class="content editor-full"><div class="content-inner editor-inner">${content}</div></main>`;
    const site = opts.siteCtx && opts.siteCtx.site;
    const active = opts.active || "dashboard";
    const railBody = site ? siteRail(site, opts.siteCtx.tab)
      : `<div class="rail-mod"><span class="rm-ico">${svg("globe", 15)}</span><span class="rm-t"><b>Website Studio</b><span>Module · M19</span></span></div>${railNav(active)}`;
```

Replace with:

```js
  // Persistent Website Studio sidebar. `siteCtx` (present only on a site-detail
  // route) supplies the currently-open site + active per-site tab, used to render
  // the site-identity header and highlight the right row *inside* the already-
  // rendered "Website" children — the rail itself never swaps out.
  function railNav(active, siteCtx) {
    const site = siteCtx && siteCtx.site;
    const tab = siteCtx && siteCtx.tab;
    return NAV.map((item) => {
      if (!item.children) {
        if (item.action) return `<div class="nav-item" id="railAiBuilder"><span class="ni-ico">${svg(item.ic)}</span><span>${item.l}</span></div>`;
        return `<div class="nav-item ${item.k === active ? "active" : ""}" data-nav="${item.k}"><span class="ni-ico">${svg(item.ic)}</span><span>${item.l}</span>${item.k === "dashboard" && (state.sites || []).some((s) => s.status === "published") ? `<span class="ni-dot" title="Live sites"></span>` : ""}</div>`;
      }
      const parentActive = (active === "sites") || !!site;
      const open = !!state.railWebsiteOpen;
      const childRows = item.children.map((c) => {
        const childActive = c.k === "sites" ? (active === "sites" && !site)
          : c.kind === "tab" ? (!!site && (tab || "overview") === c.k)
          : (active === c.k);
        const attr = c.kind === "tab" ? `data-websitetab="${c.k}"` : `data-nav="${c.k}"`;
        return `<div class="nav-item nav-child ${childActive ? "active" : ""}" ${attr}><span class="ni-ico">${svg(c.ic, 15)}</span><span>${c.l}</span></div>`;
      }).join("");
      const siteHeader = site ? `
        <button class="rail-back" id="backSites">${svg("back", 14)} All websites</button>
        <div class="rail-site"><span class="rs-favi ${site.style_preset ? "sc-favi-" + esc(site.style_preset) : ""}">${esc(initials(site.name))}</span>
          <span class="rs-id"><b>${esc(site.name)}</b><span class="rs-dom">${esc(site.primary_domain || (site.subdomain || "site") + ".aimindshare.site")}</span></span></div>` : "";
      return `<div class="nav-item nav-parent ${parentActive ? "active" : ""}" data-nav="sites">
          <span class="ni-ico">${svg(item.ic)}</span><span>${item.l}</span>
          <button class="nav-chevron ${open ? "open" : ""}" data-wtoggle title="${open ? "Collapse" : "Expand"}">${svg("chev", 12)}</button>
        </div>
        <div class="nav-children ${open ? "open" : ""}">${siteHeader}${childRows}</div>`;
    }).join("");
  }
  function shell(content, opts) {
    opts = opts || {};
    if (opts.bare) return `<main class="content editor-full"><div class="content-inner editor-inner">${content}</div></main>`;
    const site = opts.siteCtx && opts.siteCtx.site;
    const active = opts.active || "dashboard";
    const railBody = `<div class="rail-mod"><span class="rm-ico">${svg("globe", 15)}</span><span class="rm-t"><b>Website Studio</b><span>Module · M19</span></span></div>${railNav(active, opts.siteCtx)}`;
```

- [ ] **Step 2: Fix the two remaining `site ? ... : ...` reads later in `shell()`**

Find (`m19-sites.js:358-360`, right after the block replaced in Step 1):

```js
    const tbLabel = site ? "Website workspace" : (ROUTE_LABELS[active] || "");
    return `
      <aside class="rail ${site ? "rail-in-site" : ""}" id="rail">
```

This block is unchanged by this task — `site` is still a valid local (derived from `opts.siteCtx`), and `rail-in-site` remains a useful CSS hook for widening the rail while a site is open. No edit needed here; this step is a confirmation, not a change. Read the surrounding 10 lines and confirm `tbLabel`/`rail-in-site` still reference the same `site` constant defined two lines above them.

- [ ] **Step 3: Verify via the preview tool**

1. `preview_eval: location.reload()`.
2. `preview_console_logs` with `level: "error"` — expect empty output (no more `SITE_NAV`/old-shape `NAV` references — `railNav()` now matches the Task 2 tree).
3. `preview_snapshot` — confirm the sidebar shows 13 rows: Overview, Website (with a chevron), Templates, AI Builder, Client Workspace, Build Pipeline, Publishing Center, Analytics, Growth Center, Optimization Center, Integrations, Settings, Help & Resources.
4. `preview_eval: location.hash = "#/sites"` — confirm "Website" row shows `.active` and its children list is visually expanded (15 rows) — `preview_eval: document.querySelector('.nav-children').classList.contains('open')` returns `true`.
5. `preview_eval: location.hash = "#/sites/s1"` — confirm the children list now shows a site-identity header ("All websites" back button + Northstar Agency avatar/name/domain) above the 15 rows, and the "Sites" child no longer shows `.active` (only the current tab, "Pages", does by default — `viewSiteDetail`'s default tab is "overview" so actually confirm NO child shows `.active` yet, since "overview" isn't one of the 15 listed submodules — this is expected, not a bug).
6. Clicking through isn't wired yet (Task 4) — this step only confirms rendering, not interactivity.

---

### Task 4: Wire new click handlers in `bindGlobal()`

**Files:**
- Modify: `frontend/js/m19-sites.js:2364-2372` (`bindGlobal`)

- [ ] **Step 1: Add AI Builder, Website-toggle, and per-site-tab click handlers**

Find (`m19-sites.js:2364-2372`):

```js
  function bindGlobal() {
    $("#themeToggle")?.addEventListener("click", () => setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"));
    $("#openConnect2")?.addEventListener("click", openDrawer);
    $("#railBurger")?.addEventListener("click", () => $("#rail")?.classList.toggle("open"));
    $("#retryBtn")?.addEventListener("click", () => { state.error = null; boot(); });
    $$("[data-preview]").forEach((b) => b.addEventListener("click", () => { state.previewState = b.dataset.preview; render(); }));
    $$("[data-copy]").forEach((b) => b.addEventListener("click", () => { try { navigator.clipboard.writeText(b.dataset.copy); toast("Copied.", "success"); } catch (e) {} }));
    // Sidebar navigation + topbar quick actions
    $$("[data-nav]").forEach((b) => b.addEventListener("click", () => { location.hash = "#/" + b.dataset.nav; $("#rail")?.classList.remove("open"); }));
```

Replace with:

```js
  function bindGlobal() {
    $("#themeToggle")?.addEventListener("click", () => setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"));
    $("#openConnect2")?.addEventListener("click", openDrawer);
    $("#railBurger")?.addEventListener("click", () => $("#rail")?.classList.toggle("open"));
    $("#retryBtn")?.addEventListener("click", () => { state.error = null; boot(); });
    $$("[data-preview]").forEach((b) => b.addEventListener("click", () => { state.previewState = b.dataset.preview; render(); }));
    $$("[data-copy]").forEach((b) => b.addEventListener("click", () => { try { navigator.clipboard.writeText(b.dataset.copy); toast("Copied.", "success"); } catch (e) {} }));
    // Sidebar navigation + topbar quick actions
    $$("[data-nav]").forEach((b) => b.addEventListener("click", () => { location.hash = "#/" + b.dataset.nav; $("#rail")?.classList.remove("open"); }));
    $("#railAiBuilder")?.addEventListener("click", () => openCreateModal("ai"));
    $("[data-wtoggle]")?.addEventListener("click", (e) => { e.stopPropagation(); state.railWebsiteOpen = !state.railWebsiteOpen; render(); });
    // Website submenu's per-site tabs (Pages, Navigation, Design System, SEO
    // Settings, Version History, Publish) — switch tab in place if a site is
    // already open, else resolve activeSiteId() and navigate into it.
    $$("[data-websitetab]").forEach((b) => b.addEventListener("click", () => {
      const key = b.dataset.websitetab;
      const cur = parseHash();
      $("#rail")?.classList.remove("open");
      if (cur[0] === "sites" && cur[1]) { state.tab = key; render(); return; }
      const sid = activeSiteId();
      if (!sid) { openCreateModal("ai"); return; }
      state.tab = key; location.hash = "#/sites/" + sid;
    }));
```

- [ ] **Step 2: Verify via the preview tool**

1. `preview_eval: location.reload()`, `preview_eval: location.hash = "#/dashboard"`.
2. `preview_click` on the "Website" row's chevron (`.nav-chevron`) — confirm `.nav-children` toggles the `open` class and `state.railWebsiteOpen` flips (`preview_eval: state` isn't reachable from outside the closure, so instead check `document.querySelector('.nav-children').classList.contains('open')` before/after the click).
3. With at least one site loaded (default mock state has 3), `preview_click` on the "Pages" child while on `#/dashboard` — confirm `location.hash` becomes `#/sites/s1/...` no — confirm it becomes `#/sites/s1` and the page renders the Pages tab (`preview_snapshot`, look for the Pages tab's page-list heading).
4. `preview_eval: location.hash = "#/sites/s2"` then `preview_click` on the "Navigation" child — confirm it switches to the Navigation tab **without changing the site** (still site `s2`, confirm via `document.querySelector('.rail-site .rs-id b')` showing "Crescent Dental").
5. `preview_click` on "AI Builder" — confirm the Create modal opens on the AI tab.
6. Switch to the "empty" preview-state (`[data-preview="empty"]` button), reload isn't needed since it re-renders in place, then `preview_click` on "Pages" child — confirm the Create modal opens instead of navigating into a dead page (since `activeSiteId()` returns `null`). Switch back to `"default"` afterward.
7. `preview_console_logs` with `level: "error"` — expect empty output.

---

### Task 5: Extract `versionRowsHtml()` + `tabVersions()`, wire the new "versions" tab

**Files:**
- Modify: `frontend/js/m19-sites.js:727-738` (`tabPublish` — version list computation)
- Modify: `frontend/js/m19-sites.js:674, 687-690` (`viewSiteDetail` — `KNOWN` + switch)
- Modify: `frontend/js/m19-sites.js:2258` (site card "⋯ More" menu — `act === "versions"`)

- [ ] **Step 1: Extract the version-row markup into a shared `versionRowsHtml()`, add `tabVersions()`**

Find (`m19-sites.js:727-738`):

```js
  function tabPublish(site, publishLog, health) {
    const cats = (health && health.categories) || [];
    const fails = cats.filter((c) => c.status === "fail").length;
    const check = cats.length
      ? cats.map((c) => `<div class="pf-row"><span class="pf-ico pf-${c.status}">${svg(c.status === "pass" ? "check" : c.status === "fail" ? "x" : "gauge", 12)}</span><div class="pf-main"><b>${esc(c.label)}</b><span>${esc(c.detail)}</span></div><span class="pill ${c.status === "pass" ? "success" : c.status === "fail" ? "danger" : "warning"}">${c.status}</span></div>`).join("")
      : `<div class="empty-inline">Publish once to generate the quality report.</div>`;
    const vsrc = !connected() ? MOCK.versions : [];
    const latest = vsrc[0];
    const vers = vsrc.length ? vsrc.map((v, i) => `<div class="ov-row"><span class="pill ${v.kind === "publish" ? "success" : "plain"}">${v.kind === "publish" ? "v" + v.version_no : "save"}</span>
      <div class="ov-main"><b>${esc(v.label || (v.kind === "publish" ? "Published v" + v.version_no : "Save point " + v.version_no))}</b><span>${fmtDate(v.published_at)}</span></div>
      <span class="ov-right">${i === 0 ? `<span class="pill plain">current</span>` : `<button class="btn btn-ghost btn-sm" data-compare="${v.version_no}">Compare</button>`}${i > 0 && canManage() ? `<button class="btn btn-ghost btn-sm" data-restore="${v.version_no}">Restore</button>` : ""}</span></div>`).join("")
      : emptyInline("No versions yet.");
```

Replace with:

```js
  // Shared by tabPublish() (inline, alongside the pre-flight quality gate) and
  // tabVersions() (its own Website submodule tab, same rows) — one source of the
  // version list so the two views can never drift apart.
  function versionRowsHtml() {
    const vsrc = !connected() ? MOCK.versions : [];
    return vsrc.length ? vsrc.map((v, i) => `<div class="ov-row"><span class="pill ${v.kind === "publish" ? "success" : "plain"}">${v.kind === "publish" ? "v" + v.version_no : "save"}</span>
      <div class="ov-main"><b>${esc(v.label || (v.kind === "publish" ? "Published v" + v.version_no : "Save point " + v.version_no))}</b><span>${fmtDate(v.published_at)}</span></div>
      <span class="ov-right">${i === 0 ? `<span class="pill plain">current</span>` : `<button class="btn btn-ghost btn-sm" data-compare="${v.version_no}">Compare</button>`}${i > 0 && canManage() ? `<button class="btn btn-ghost btn-sm" data-restore="${v.version_no}">Restore</button>` : ""}</span></div>`).join("")
      : emptyInline("No versions yet.");
  }
  function tabVersions(site) {
    return `<div class="studio"><section class="st-sec reveal"><div class="panel">
      <div class="panel-head"><span class="ph-ico">${svg("clock", 15)}</span><h3>Version history</h3></div>
      <div class="ov-list">${versionRowsHtml()}</div>
    </div></section></div>`;
  }
  function tabPublish(site, publishLog, health) {
    const cats = (health && health.categories) || [];
    const fails = cats.filter((c) => c.status === "fail").length;
    const check = cats.length
      ? cats.map((c) => `<div class="pf-row"><span class="pf-ico pf-${c.status}">${svg(c.status === "pass" ? "check" : c.status === "fail" ? "x" : "gauge", 12)}</span><div class="pf-main"><b>${esc(c.label)}</b><span>${esc(c.detail)}</span></div><span class="pill ${c.status === "pass" ? "success" : c.status === "fail" ? "danger" : "warning"}">${c.status}</span></div>`).join("")
      : `<div class="empty-inline">Publish once to generate the quality report.</div>`;
    const vers = versionRowsHtml();
```

- [ ] **Step 2: Remove the now-unused `latest` local** (only used by the deleted block above)

Find the line right after the block replaced in Step 1 (`m19-sites.js:739`, unchanged text — locate it by content):

```js
    // Client review & approval (Slice D)
```

Confirm the line immediately above it now reads `const vers = versionRowsHtml();` (from Step 1) and that no `const latest = vsrc[0];` line remains anywhere in `tabPublish` — it was deleted by the Step 1 replacement (the old code computed `latest` but `tabPublish` never actually used it; it's not referenced anywhere else in the function). No further edit needed here — this step is a confirmation.

- [ ] **Step 3: Add `"versions"` to `viewSiteDetail`'s `KNOWN` tabs + switch**

Find (`m19-sites.js:674` and `m19-sites.js:687-690`, shown together for context — this is one function body):

```js
    const KNOWN = ["overview", "pages", "profile", "nav", "domains", "seo", "health", "analytics", "publish", "integrations", "settings"];
```

Replace with:

```js
    const KNOWN = ["overview", "pages", "profile", "nav", "domains", "seo", "health", "analytics", "publish", "versions", "integrations", "settings"];
```

Then find:

```js
      case "publish": body = tabPublish(site, publishLog, health); break;
      case "integrations": body = tabIntegrations(site); break;
```

Replace with:

```js
      case "publish": body = tabPublish(site, publishLog, health); break;
      case "versions": body = tabVersions(site); break;
      case "integrations": body = tabIntegrations(site); break;
```

- [ ] **Step 4: Point the "⋯ More" menu's "versions" action at the new tab**

Find (`m19-sites.js:2258`):

```js
        else if (act === "versions") { state.tab = "publish"; location.hash = "#/sites/" + id; }
```

Replace with:

```js
        else if (act === "versions") { state.tab = "versions"; location.hash = "#/sites/" + id; }
```

- [ ] **Step 5: Verify via the preview tool**

1. `preview_eval: location.reload()`, `preview_eval: location.hash = "#/sites/s1"`.
2. `preview_click` on the "Version History" child under the expanded Website submenu — confirm it navigates to a dedicated version-history panel (same rows as before: "v3", "v2", "v1" or similar with Compare/Restore buttons).
3. `preview_click` on a "Compare" button — confirm the compare modal still opens correctly (unchanged behavior, now reachable from a new tab).
4. `preview_eval: location.hash = "#/sites/s1"` then check the Publish tab (default `data-websitetab="publish"` click or `state.tab` directly) still shows its own inline "Version history" panel too, unchanged.
5. `preview_console_logs` with `level: "error"` — expect empty output.

---

### Task 6: Fix the Domains/Integrations reachability gap left by deleting `siteRail()`

**Files:**
- Modify: `frontend/js/m19-sites.js:702-707` (`tabOverview`'s `quick` list)

- [ ] **Step 1: Add Domains + Integrations quick-links to the Overview tab**

Find (`m19-sites.js:702-707`):

```js
    const quick = [
      ["edit", "Open editor", "Design & content", `data-openeditor="${esc(site.id)}"`],
      ["doc", "Manage pages", `${site.pages} page${site.pages === 1 ? "" : "s"}`, `data-tab="pages"`],
      ["search", "SEO & schema", "Titles, meta, JSON-LD", `data-tab="seo"`],
      ["rocket", "Publish", site.last_published ? "Last " + fmtDate(site.last_published) : "Not published yet", `data-tab="publish"`],
    ].map(([ico, t, s, attr]) => `<button class="qa-line" ${attr}><span class="ql-ico">${svg(ico, 15)}</span><span class="ql-t"><b>${t}</b><span>${s}</span></span>${svg("chev", 13)}</button>`).join("");
```

Replace with:

```js
    const quick = [
      ["edit", "Open editor", "Design & content", `data-openeditor="${esc(site.id)}"`],
      ["doc", "Manage pages", `${site.pages} page${site.pages === 1 ? "" : "s"}`, `data-tab="pages"`],
      ["search", "SEO & schema", "Titles, meta, JSON-LD", `data-tab="seo"`],
      ["link", "Domains", site.primary_domain ? esc(site.primary_domain) : "Staging subdomain only", `data-tab="domains"`],
      ["puzzle", "Integrations", "CRM widgets", `data-tab="integrations"`],
      ["rocket", "Publish", site.last_published ? "Last " + fmtDate(site.last_published) : "Not published yet", `data-tab="publish"`],
    ].map(([ico, t, s, attr]) => `<button class="qa-line" ${attr}><span class="ql-ico">${svg(ico, 15)}</span><span class="ql-t"><b>${t}</b><span>${s}</span></span>${svg("chev", 13)}</button>`).join("");
```

- [ ] **Step 2: Verify via the preview tool**

1. `preview_eval: location.reload()`, `preview_eval: location.hash = "#/sites/s1"` (defaults to the Overview tab).
2. `preview_snapshot` — confirm the quick-links panel now shows 6 rows including "Domains" and "Integrations".
3. `preview_click` on the "Domains" quick-link — confirm it navigates to the Domains tab (existing `tabDomains` content, unchanged).
4. Repeat for "Integrations".
5. `preview_console_logs` with `level: "error"` — expect empty output.

---

### Task 7: Split `viewPublishCenter()` into `viewPublishingCenter()` (+ domains) and `viewBuildPipeline()`, delete `viewDomainsOverview()`

**Files:**
- Modify: `frontend/js/m19-sites.js:1954-1984` (`viewDomainsOverview`, `viewPublishCenter`)

- [ ] **Step 1: Replace both functions**

Find (`m19-sites.js:1954-1984`):

```js
  /* ── Screen: Domains (cross-site) ─────────────────────────────────────────── */
  function viewDomainsOverview() {
    const sites = state.sites || [];
    const all = Object.entries(state.domainsBySite || {}).flatMap(([sid, ds]) => (ds || []).map((d) => ({ ...d, site: sites.find((s) => s.id === sid) })));
    const domRows = all.length ? all.map((d) => `<div class="ov-row"><span class="ov-favi">${svg("link", 15)}</span>
      <div class="ov-main"><b>${esc(d.domain)}</b><span>${esc(d.site?.name || "")}${d.is_primary ? " · primary" : ""}</span></div>
      <span class="ov-right"><span class="pill ${d.status === "active" ? "success" : "warning"}">${d.status}</span><span class="pill ${d.ssl_status === "active" ? "success" : "plain"}">SSL: ${d.ssl_status}</span></span></div>`).join("")
      : emptyInline("No custom domains connected yet.");
    const subRows = sites.map((s) => `<div class="ov-row"><span class="ov-favi ${s.style_preset ? "sc-favi-" + esc(s.style_preset) : ""}">${esc(initials(s.name))}</span>
      <div class="ov-main"><b>${esc(s.name)}</b><span class="mono">${esc(s.subdomain || "site")}.aimindshare.site</span></div>
      <span class="ov-right"><button class="btn btn-ghost btn-sm" data-open="${esc(s.id)}">Connect domain</button></span></div>`).join("");
    return previewStrip() + pageHead("Domains", "Connect custom domains with automatic DNS verification and SSL. Every site also gets an always-on staging subdomain.")
      + `<div class="studio">
        <div class="panel"><div class="panel-head"><span class="ph-ico">${svg("link", 15)}</span><h3>Custom domains</h3></div><div class="ov-list">${domRows}</div>
          <div class="hint-card" style="margin:14px 0 0">${svg("globe", 15)}<div><b>How it works.</b> Add a domain on a site, point a <span class="mono">CNAME</span> → <span class="mono">sites.aimindshare.com</span> plus a <span class="mono">TXT</span> record, and we verify DNS and issue SSL automatically.</div></div></div>
        <div class="panel"><div class="panel-head"><span class="ph-ico">${svg("globe", 15)}</span><h3>Staging subdomains</h3></div><div class="ov-list">${subRows || emptyInline("No sites yet.")}</div></div>
      </div>`;
  }

  /* ── Screen: Publish center ───────────────────────────────────────────────── */
  function viewPublishCenter() {
    const sites = state.sites || [];
    const rows = sites.map((s) => `<div class="ov-row"><span class="ov-favi ${s.style_preset ? "sc-favi-" + esc(s.style_preset) : ""}">${esc(initials(s.name))}</span>
      <div class="ov-main"><b>${esc(s.name)}</b><span>${s.last_published ? "v" + (s.last_version || "?") + " · published " + fmtDate(s.last_published) : "never published"}</span></div>
      <span class="ov-right">${statusPill(s.status)}<button class="btn btn-primary btn-sm" data-editsite="${esc(s.id)}">${svg("rocket", 13)} Open</button></span></div>`).join("");
    const PIPE = [["Brief", "done"], ["AI structure", "done"], ["Design", "done"], ["Content", "active"], ["Forms", ""], ["SEO", ""], ["Domain", ""], ["Publish", ""], ["Optimize", ""]];
    const pipeIco = { Brief: "doc", "AI structure": "spark", Design: "palette", Content: "type", Forms: "form", SEO: "search", Domain: "link", Publish: "rocket", Optimize: "gauge" };
    const pipe = PIPE.map(([label, st], i) => `<div class="pipe-node ${st}"><span class="pn-dot">${svg(pipeIco[label] || "check", 16)}</span><span class="pn-label">${label}</span><span class="pn-step">0${i + 1}</span></div>`).join("");
    return previewStrip() + pageHead("Publish", "Staging previews, one-click publish, version history and rollback — every publish runs the pre-flight quality gate first.")
      + `<div class="studio"><div class="panel st-pipe"><div class="pipe-track">${pipe}</div></div>
        <div class="st-cols"><div class="panel"><div class="panel-head"><span class="ph-ico">${svg("rocket", 15)}</span><h3>Sites &amp; status</h3></div><div class="ov-list">${rows || emptyInline("No sites yet.")}</div></div>${activityPanel()}</div></div>`;
  }
```

Replace with:

```js
  /* ── Screen: Build Pipeline (cross-site) ──────────────────────────────────── */
  // The production-stage visualization that used to live inline inside the old
  // Publish center — promoted to its own top-level page (status flow, milestones,
  // production tracking). Deployment/domains/release status stays in Publishing
  // Center below; this page never shows per-site editing controls.
  function viewBuildPipeline() {
    const PIPE = [["Brief", "done"], ["AI structure", "done"], ["Design", "done"], ["Content", "active"], ["Forms", ""], ["SEO", ""], ["Domain", ""], ["Publish", ""], ["Optimize", ""]];
    const pipeIco = { Brief: "doc", "AI structure": "spark", Design: "palette", Content: "type", Forms: "form", SEO: "search", Domain: "link", Publish: "rocket", Optimize: "gauge" };
    const pipe = PIPE.map(([label, st], i) => `<div class="pipe-node ${st}"><span class="pn-dot">${svg(pipeIco[label] || "check", 16)}</span><span class="pn-label">${label}</span><span class="pn-step">0${i + 1}</span></div>`).join("");
    return previewStrip() + pageHead("Build Pipeline", "Where every site sits in the build process — brief through optimize — across your whole workspace.")
      + `<div class="studio"><div class="panel st-pipe"><div class="pipe-track">${pipe}</div></div></div>`;
  }
  /* ── Screen: Publishing Center (cross-site deployment, domains, release) ───── */
  function viewPublishingCenter() {
    const sites = state.sites || [];
    const rows = sites.map((s) => `<div class="ov-row"><span class="ov-favi ${s.style_preset ? "sc-favi-" + esc(s.style_preset) : ""}">${esc(initials(s.name))}</span>
      <div class="ov-main"><b>${esc(s.name)}</b><span>${s.last_published ? "v" + (s.last_version || "?") + " · published " + fmtDate(s.last_published) : "never published"}</span></div>
      <span class="ov-right">${statusPill(s.status)}<button class="btn btn-primary btn-sm" data-editsite="${esc(s.id)}">${svg("rocket", 13)} Open</button></span></div>`).join("");
    const domAll = Object.entries(state.domainsBySite || {}).flatMap(([sid, ds]) => (ds || []).map((d) => ({ ...d, site: sites.find((s) => s.id === sid) })));
    const domRows = domAll.length ? domAll.map((d) => `<div class="ov-row"><span class="ov-favi">${svg("link", 15)}</span>
      <div class="ov-main"><b>${esc(d.domain)}</b><span>${esc(d.site?.name || "")}${d.is_primary ? " · primary" : ""}</span></div>
      <span class="ov-right"><span class="pill ${d.status === "active" ? "success" : "warning"}">${d.status}</span><span class="pill ${d.ssl_status === "active" ? "success" : "plain"}">SSL: ${d.ssl_status}</span></span></div>`).join("")
      : emptyInline("No custom domains connected yet.");
    return previewStrip() + pageHead("Publishing Center", "Deployment, environments, domains and release status — every site's shipping state in one place.")
      + `<div class="studio">
        <div class="st-cols"><div class="panel"><div class="panel-head"><span class="ph-ico">${svg("rocket", 15)}</span><h3>Sites &amp; status</h3></div><div class="ov-list">${rows || emptyInline("No sites yet.")}</div></div>${activityPanel()}</div>
        <div class="panel"><div class="panel-head"><span class="ph-ico">${svg("link", 15)}</span><h3>Custom domains</h3></div><div class="ov-list">${domRows}</div>
          <div class="hint-card" style="margin:14px 0 0">${svg("globe", 15)}<div><b>How it works.</b> Add a domain on a site, point a <span class="mono">CNAME</span> → <span class="mono">sites.aimindshare.com</span> plus a <span class="mono">TXT</span> record, and we verify DNS and issue SSL automatically.</div></div></div>
      </div>`;
  }
```

- [ ] **Step 2: Verify via the preview tool**

1. `preview_eval: location.reload()`, `preview_eval: location.hash = "#/publish"` — confirm this renders the new "Publishing Center" heading with the sites/status rollup, activity panel, and the custom-domains list, and does NOT show the pipeline stage-track.
2. `preview_eval: location.hash = "#/pipeline"` — confirm this renders "Build Pipeline" with just the stage-track visualization, no sites list.
3. `preview_console_logs` with `level: "error"` — expect empty output (Task 8 wires the route/nav; this task only needs the two functions to exist and render without throwing when called directly — if `render()` errors on `#/pipeline` because the switch-case doesn't exist yet, that's expected and resolved by Task 8, note it and continue).

---

### Task 8: Update `render()`'s route switch — add Build Pipeline + 7 placeholders, remove Pages/Domains, rename Publish center call

**Files:**
- Modify: `frontend/js/m19-sites.js:2347-2359` (`render()` switch)
- Modify: `frontend/js/m19-sites.js:1917-1931` (delete `viewPagesOverview`)
- Modify: `frontend/js/m19-sites.js:2305` (delete `bindPagesOverview`)

- [ ] **Step 1: Replace the route switch**

Find (`m19-sites.js:2347-2359`):

```js
    switch (r0) {
      case "sites": html = viewSites(); binder = bindSites; break;
      case "templates": html = viewTemplates(); binder = bindTemplates; break;
      case "pages": html = viewPagesOverview(); binder = bindPagesOverview; break;
      case "components": case "sections": case "assets": case "forms": case "blog":
        html = viewCapability(r0); binder = bindCapability; break;
      case "seo": html = viewSeoOverview(); binder = bindOverview; break;
      case "domains": html = viewDomainsOverview(); binder = bindOverview; break;
      case "publish": html = viewPublishCenter(); binder = bindOverview; break;
      case "analytics": html = viewAnalyticsOverview(); binder = bindOverview; break;
      case "settings": html = viewSettings(); binder = bindSettings; break;
      default: html = viewDashboard(); binder = bindDashboard; active = "dashboard";
    }
```

Replace with:

```js
    switch (r0) {
      case "sites": html = viewSites(); binder = bindSites; break;
      case "templates": html = viewTemplates(); binder = bindTemplates; break;
      case "components": case "sections": case "assets": case "forms": case "blog":
      case "structure": case "content": case "preview":
      case "clients": case "growth": case "integrations": case "help":
        html = viewCapability(r0); binder = bindCapability; break;
      case "seo": html = viewSeoOverview(); binder = bindOverview; break;
      case "publish": html = viewPublishingCenter(); binder = bindOverview; break;
      case "pipeline": html = viewBuildPipeline(); binder = bindOverview; break;
      case "analytics": html = viewAnalyticsOverview(); binder = bindOverview; break;
      case "settings": html = viewSettings(); binder = bindSettings; break;
      default: html = viewDashboard(); binder = bindDashboard; active = "dashboard";
    }
```

- [ ] **Step 2: Delete `viewPagesOverview()`**

Find (`m19-sites.js:1917-1930`, including the blank line right after the closing brace so the following comment isn't left with a double blank line):

```js
  function viewPagesOverview() {
    const sites = state.sites || [];
    if (!sites.length) return previewStrip() + pageHead("Pages", "Every page across your websites.") + emptyPanel("doc", "No pages yet", "Create a website first — its pages will appear here.", "Create a website", "generate");
    const blocks = sites.map((s) => {
      const pages = (state.pagesBySite || {})[s.id] || [];
      const rows = pages.length ? pages.map((p) => `<div class="ov-row"><span class="ov-favi">${p.is_home ? svg("home", 15) : svg("doc", 15)}</span>
        <div class="ov-main"><b>${esc(p.title)}</b><span class="mono">/${esc(p.is_home ? "" : p.slug)}</span></div>
        <span class="ov-right">${statusPill(p.status)}<button class="btn btn-primary btn-sm" data-editpage="${esc(s.id)}:${esc(p.id)}">${svg("edit", 13)} Edit</button></span></div>`).join("")
        : `<div class="ov-row"><div class="ov-main"><span class="muted">${s.pages || 0} page${s.pages === 1 ? "" : "s"} — open the site to manage them.</span></div><span class="ov-right"><button class="btn btn-ghost btn-sm" data-open="${esc(s.id)}">Open site</button></span></div>`;
      return `<div class="panel"><div class="panel-head"><span class="ph-ico">${svg("globe", 15)}</span><h3>${esc(s.name)}</h3><span class="pill plain" style="margin-left:8px">${s.pages || pages.length} pages</span><button class="st-link" data-open="${esc(s.id)}" style="margin-left:auto">Manage ${svg("chev", 12)}</button></div><div class="ov-list">${rows}</div></div>`;
    }).join("");
    return previewStrip() + pageHead("Pages", "Every page across your websites — jump straight into the editor.") + `<div class="studio">${blocks}</div>`;
  }

```

Replace with nothing (delete the whole block, including the trailing blank line shown above) — leave the `/* ── Screen: SEO (cross-site) ─────────────────────────────────────────────── */` comment that immediately follows as the first line after the previous function's closing brace.

- [ ] **Step 3: Delete `bindPagesOverview()`**

Find (`m19-sites.js:2305`):

```js
  function bindPagesOverview() { bindNavTo(); bindSiteCardActions(); }
```

Delete this line entirely.

- [ ] **Step 4: Verify via the preview tool**

1. `preview_eval: location.reload()`.
2. `preview_eval: location.hash = "#/pipeline"` — confirm no console error now, and the Build Pipeline page renders.
3. `preview_eval: location.hash = "#/structure"`, `"#/content"`, `"#/preview"`, `"#/clients"`, `"#/growth"`, `"#/integrations"`, `"#/help"` — one at a time, confirm each renders its `CAP` placeholder page (hero + 4 features + CTA) with no console errors.
4. `preview_eval: location.hash = "#/pages"` — confirm this now falls through to the `default` case (renders Overview) rather than throwing, since `viewPagesOverview` no longer exists and `"pages"` is no longer a case label (harmless — nothing links to this route anymore after Task 3/4's rewrite).
5. `preview_console_logs` with `level: "error"` — expect empty output.

---

### Task 9: Relabel Optimization Center (SEO overview), verify sidebar-driven navigation end-to-end

**Files:**
- Modify: `frontend/js/m19-sites.js:1944` (`viewSeoOverview`'s `pageHead` call)

- [ ] **Step 1: Change the page heading**

Find (`m19-sites.js:1944`):

```js
    return previewStrip() + pageHead("SEO", "Search & generative-engine optimization across every site — titles, meta, JSON-LD, sitemaps and llms.txt, generated on every publish.")
```

Replace with:

```js
    return previewStrip() + pageHead("Optimization Center", "Search & generative-engine optimization across every site — titles, meta, JSON-LD, sitemaps and llms.txt, generated on every publish.")
```

- [ ] **Step 2: Verify via the preview tool — full sidebar sweep**

1. `preview_eval: location.reload()`.
2. For each top-level item, `preview_click` its `[data-nav]` row and `preview_snapshot` to confirm the right page renders with the right heading: Overview → "Overview"/dashboard content; Templates → template library; Client Workspace → "Client Workspace" placeholder; Build Pipeline → "Build Pipeline"; Publishing Center → "Publishing Center"; Analytics → "Analytics"; Growth Center → "Growth Center" placeholder; Optimization Center → "Optimization Center"; Integrations → "Integrations" placeholder; Settings → settings form; Help & Resources → "Help & Resources" placeholder.
3. `preview_console_logs` with `level: "error"` — expect empty output across the whole sweep.

---

### Task 10: Rename "Dashboard" → "Overview" everywhere else it's still hardcoded

**Files:**
- Modify: `frontend/js/m19-sites.js:2619` (breadcrumb `map`)

- [ ] **Step 1: Update the breadcrumb map**

Find (`m19-sites.js:2619`):

```js
    const map = { dashboard: "Dashboard", sites: "Websites", templates: "Templates", pages: "Pages", components: "Components", sections: "Sections", assets: "Assets", forms: "Forms", blog: "Blog", seo: "SEO", domains: "Domains", publish: "Publish", analytics: "Analytics", settings: "Settings" };
```

Replace with:

```js
    const map = { dashboard: "Overview", sites: "Websites", templates: "Templates", components: "Components", sections: "Sections", assets: "Media Library", forms: "Forms", blog: "Blog / CMS", structure: "Structure", content: "Content", preview: "Preview", seo: "Optimization Center", publish: "Publishing Center", pipeline: "Build Pipeline", analytics: "Analytics", growth: "Growth Center", integrations: "Integrations", settings: "Settings", clients: "Client Workspace", help: "Help & Resources" };
```

- [ ] **Step 2: Confirm `ROUTE_LABELS` (Task 2) already says "Overview" for `dashboard`**

No edit — Task 2 Step 1 already set `ROUTE_LABELS.dashboard: "Overview"`. This step is a confirmation only: `preview_eval: location.hash = "#/dashboard"` then check the topbar's small label (`.tb-title span`) reads "Overview", not "Command center" or "Dashboard".

- [ ] **Step 3: Verify via the preview tool**

1. `preview_eval: location.reload()`.
2. `preview_snapshot` — confirm the sidebar's first row reads "Overview" (from Task 2's `NAV` entry `l: "Overview"`).
3. `preview_inspect` on `.tb-title span` — confirm text is "Overview".
4. `preview_console_logs` with `level: "error"` — expect empty output.

---

### Task 11: CSS — nested "Website" submenu, chevron, site-identity header inside it

**Files:**
- Modify: `frontend/styles/m19-studio.css` (append near the existing `.rail-back`/`.rail-site` rules, currently around line 555-565)

- [ ] **Step 1: Add nested-nav styles**

Find (`m19-studio.css:559-565`, the last of the existing `.rail-site` rules):

```css
.rail-site .rs-dom{font-family:var(--font-mono);font-size:9.5px;color:var(--ink-400);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
```

Replace with:

```css
.rail-site .rs-dom{font-family:var(--font-mono);font-size:9.5px;color:var(--ink-400);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* Website Studio sidebar — expandable "Website" row + its 15-item nested submenu.
   PRODUCT RULE: direct site-building tools live here; operations/collaboration/
   reporting/growth/optimization/system-wide controls stay as top-level rows. */
.nav-parent{cursor:pointer}
.nav-parent .nav-chevron{margin-left:auto;display:flex;align-items:center;justify-content:center;
  width:20px;height:20px;border:none;background:transparent;color:inherit;opacity:.6;
  border-radius:var(--r-sm);transition:transform .15s ease}
.nav-parent .nav-chevron:hover{opacity:1;background:rgba(0,105,110,.1)}
.nav-parent .nav-chevron.open{transform:rotate(90deg)}
.nav-children{display:none;padding-left:10px;margin:2px 0 4px;border-left:1px solid var(--ink-100)}
.nav-children.open{display:block}
.nav-children .nav-child{padding:7px 12px;font-size:12.5px}
.nav-children .rail-back{margin:2px 8px 4px 2px}
.nav-children .rail-site{margin:0 2px 8px}
```

- [ ] **Step 2: Verify via the preview tool**

1. `preview_eval: location.reload()`, `preview_eval: location.hash = "#/sites"`.
2. `preview_screenshot` — confirm the expanded "Website" submenu is visually indented with a left border, the chevron points down/rotated when open, and the site-identity header (when a site is open) matches the old `siteRail()` look.
3. `preview_inspect` on `.nav-children` with `styles: ["padding-left", "border-left"]` — confirm values match the CSS above.
4. `preview_console_logs` with `level: "error"` — expect empty output.

---

### Task 12: Full end-to-end verification pass

**Files:** None (verification only — no code changes).

- [ ] **Step 1: Regression sweep across the whole restructure**

1. `preview_click` the "default" preview-state button to restore normal mock data, then `preview_eval: location.reload()`.
2. Walk every top-level sidebar item (per Task 9 Step 2) and every one of the 15 Website submenu items (per Task 4 Step 2) once more, back to back, confirming no console errors accumulate across the whole sweep (`preview_console_logs` with `level: "all"`, last 100 lines, at the end).
3. `preview_resize` to `mobile` (375px) — `preview_screenshot`, open the rail via the burger button, confirm the "Website" row and its expanded children render without horizontal scroll (`document.documentElement.scrollWidth === document.documentElement.clientWidth` via `preview_eval`).
4. `preview_resize` to `desktop` (1280px), toggle dark mode via `#themeToggle` — `preview_screenshot`, confirm the nested submenu's left border, chevron, and active-row highlight all render with sufficient contrast in dark mode.
5. `preview_resize` to a mid-width (`width: 900, height: 800`, inside the ≤1100px icon-only breakpoint) — `preview_screenshot`, confirm the collapsed icon-only rail doesn't visibly break (nested children collapse to icon-only rows consistently with the rest of the rail; this is expected to degrade the same way the rail always has, not a new regression). If it looks broken, note the specific issue for a follow-up fix rather than guessing a patch here.
6. Re-run the two most relevant pre-existing Website flows to confirm zero regression from this restructure: (a) `preview_eval: location.hash = "#/sites"` then create a site via "AI Builder" end-to-end (fill prompt, Generate, confirm it lands in the editor); (b) open an existing site, use the "⋯ More" card menu's "Details" action, confirm the Details drawer (built in an earlier session) still opens correctly.
7. `git status` / `git diff --stat` (via Bash, not preview) — sanity-check the diff only touches `frontend/js/m19-sites.js` and `frontend/styles/m19-studio.css`, nothing else.

- [ ] **Step 2: Report completion**

Summarize to the user: the sidebar is now a flat 13-item Website Studio list with an expandable "Website" row nesting all 15 direct site-building tools; `siteRail()`/`SITE_NAV` are gone in favor of one persistent rail; Dashboard is relabeled Overview everywhere; Publishing Center/Build Pipeline are split out of the old combined Publish center; Optimization Center reuses the existing SEO rollup; 7 new pages (Structure, Content, Preview, Client Workspace, Growth Center, Integrations, Help & Resources) are honest placeholders using the existing `CAP` pattern; and the Domains/Integrations per-site tabs — which the old rail was the only path to — are reachable again via two new Overview-tab quick-links.

