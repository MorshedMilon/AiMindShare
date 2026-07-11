# M21 SEO Engine — Sidebar Nav + Routing Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand M21 SEO Engine's flat 3-item sidebar into the full 9-section nested nav tree from the design spec, with a matching hash-router skeleton (real pages kept working, new leaves stubbed as placeholders), inside the existing vanilla HTML/CSS/JS stack — no new frameworks.

**Architecture:** `NAV` becomes a nested array (parent + optional `children`). `parseRoute()` parses `{section, sub, id}` from the hash. `render()` dispatches to the three existing view functions only for their real default paths, and to a new shared `viewPlaceholder()` for every other leaf. `shell()` renders the nested nav (expand/collapse + active-state + badges) reusing the `.nav-parent`/`.nav-children` CSS pattern already shipped for M19 Studio, copied into `m21-seo.css` (module-owned, matching how each module already owns its own rail/nav CSS).

**Tech Stack:** Vanilla JS (IIFE, no build step), hash-based routing, plain CSS with design tokens. No test runner exists for the frontend in this repo — verification is manual, via the Browser preview tool (navigate hash routes, inspect rendered DOM/console), matching how every other module in this repo is verified.

**Reference:** [docs/superpowers/specs/2026-07-11-m21-seo-sidebar-nav-shell-design.md](../specs/2026-07-11-m21-seo-sidebar-nav-shell-design.md)

---

### Task 1: Nested `NAV` data + route parsing

**Files:**
- Modify: `frontend/js/m21-seo.js:224-228` (NAV array)
- Modify: `frontend/js/m21-seo.js:189-193` (`parseRoute`)

- [ ] **Step 1: Replace the flat `NAV` array with the nested tree**

Replace lines 224-228:
```js
  const NAV = [
    { key: "keywords", label: "Keyword research", ico: "search", hash: "#/seo/keywords" },
    { key: "rankings", label: "Rank tracker", ico: "trend", hash: "#/seo/rankings" },
    { key: "audit", label: "Site audit", ico: "gauge", hash: "#/seo/audit" },
  ];
```
with:
```js
  const NAV = [
    { key: "dashboard", label: "Dashboard", ico: "bolt", hash: "#/seo" },
    { key: "keywords", label: "Keyword Research", ico: "search", hash: "#/seo/keywords", children: [
      { key: "explorer", label: "Keyword Explorer", hash: "#/seo/keywords/explorer" },
      { key: "opportunity", label: "Opportunity Score", hash: "#/seo/keywords/opportunity" },
      { key: "related", label: "Related Keywords", hash: "#/seo/keywords/related" },
      { key: "questions", label: "Question Finder", hash: "#/seo/keywords/questions" },
      { key: "long-tail", label: "Long-Tail Generator", hash: "#/seo/keywords/long-tail" },
      { key: "ai-search", label: "AI-Search Query Variants", hash: "#/seo/keywords/ai-search" },
      { key: "settings", label: "Country/Language Selector", hash: "#/seo/keywords/settings" },
    ] },
    { key: "clusters", label: "Clusters", ico: "target", hash: "#/seo/clusters", children: [
      { key: "builder", label: "Cluster Builder", hash: "#/seo/clusters/builder" },
    ] },
    { key: "serp", label: "SERP Analysis", ico: "globe", hash: "#/seo/serp", children: [
      { key: "snapshot", label: "SERP Snapshot", hash: "#/seo/serp/snapshot" },
      { key: "weakness", label: "SERP Weakness Indicator", hash: "#/seo/serp/weakness" },
    ] },
    { key: "competitors", label: "Competitors", ico: "swords", hash: "#/seo/competitors", children: [
      { key: "overview", label: "Domain Overview", hash: "#/seo/competitors/overview" },
      { key: "gap", label: "Keyword Gap", hash: "#/seo/competitors/gap" },
      { key: "gap-actions", label: "Gap Action Layer", hash: "#/seo/competitors/gap-actions" },
      { key: "send-to-queue", label: "Send-to-Queue", hash: "#/seo/competitors/send-to-queue" },
    ] },
    { key: "lists", label: "Keyword Lists", ico: "list", hash: "#/seo/lists", children: [
      { key: "bulk", label: "Bulk Actions", hash: "#/seo/lists/bulk" },
    ] },
    { key: "rankings", label: "Rank Tracking", ico: "trend", hash: "#/seo/rankings", children: [
      { key: "overlay", label: "Competitor Overlay", hash: "#/seo/rankings/overlay" },
      { key: "summary", label: "Weekly Summary", hash: "#/seo/rankings/summary" },
    ] },
    { key: "audit", label: "Technical Audit", ico: "gauge", hash: "#/seo/audit", children: [
      { key: "crawler", label: "Site Crawler", hash: "#/seo/audit/crawler" },
      { key: "cwv", label: "Core Web Vitals", hash: "#/seo/audit/cwv" },
      { key: "schema", label: "Schema Validator", hash: "#/seo/audit/schema" },
      { key: "ssl", label: "SSL Check", hash: "#/seo/audit/ssl" },
    ] },
    { key: "settings", label: "Settings", ico: "settings", hash: "#/seo/settings", children: [
      { key: "connections", label: "API Connections", hash: "#/seo/settings/connections" },
      { key: "cache", label: "Cache Settings", hash: "#/seo/settings/cache" },
      { key: "scoring", label: "Scoring Weights", hash: "#/seo/settings/scoring" },
    ] },
  ];
```
Note: "Cluster List", "Named Collections", and "Position History"/"Cluster Detail"/"Audit Score & Issues" are intentionally NOT sidebar entries — the first two are default views at their parent's own hash (handled in Task 5), the rest are dynamic detail routes reachable only from within a page (handled by `id` parsing below), not from the sidebar.

- [ ] **Step 2: Rewrite `parseRoute()` to produce `{section, sub, id}`**

Replace lines 189-193:
```js
  function parseRoute() {
    const h = (location.hash || "#/seo/keywords").replace(/^#/, "");
    const parts = h.split("/").filter(Boolean); // ["seo","keywords"]
    state.route = { name: parts[1] || "keywords" };
  }
```
with:
```js
  function parseRoute() {
    const h = (location.hash || "#/seo").replace(/^#/, "");
    const parts = h.split("/").filter(Boolean); // e.g. ["seo","keywords","explorer"]
    const section = parts[1] || "dashboard";
    const rest = parts.slice(2);
    const sec = NAV.find((n) => n.key === section);
    const childKeys = (sec?.children || []).map((c) => c.key);
    let sub = null, id = null;
    if (rest.length) {
      if (childKeys.includes(rest[0])) sub = rest[0];
      else if (section === "rankings" && rest.length === 2 && rest[1] === "history") { id = rest[0]; sub = "history"; }
      else id = rest[0];
    }
    state.route = { section, sub, id };
  }
```
Note: the old `state.route.name` field is dropped here, not aliased — Task 2 updates `loadRoute()`'s checks and Task 6 updates `render()`'s checks to read `.section`/`.sub` directly in the same pass, so no code reads `.name` after this task lands (verified by the `grep` in Task 6 Step 2 below finding no leftover `shell("` calls, and by inspection — nothing in this file reads `.route.name` once Tasks 2 and 6 are applied).

- [ ] **Step 3: Verify in the browser**

Open `frontend/m21-seo-engine.html` in the Browser preview (no dev server needed — file loads directly; `previewStart({url: "file:///C:/Users/User/Documents/AiMindShare/frontend/m21-seo-engine.html"})`). The page will look unchanged (nav rendering isn't updated until Task 3), but open the browser console and run:
```js
location.hash = "#/seo/keywords/related"; parseRouteDebug = null;
```
This step is just a sanity check that the file still parses/loads with no console errors — full route-parsing verification happens in Task 6 once `render()` dispatches on the new fields.

- [ ] **Step 4: Commit**

```bash
git add frontend/js/m21-seo.js
git commit -m "M21: expand NAV to nested 9-section tree, parse section/sub/id from hash"
```

---

### Task 2: Gate `loadRoute()` to the real (non-placeholder) pages only

**Files:**
- Modify: `frontend/js/m21-seo.js:195-217`

- [ ] **Step 1: Update the three route checks**

Replace lines 198, 201, 209 (the `if`/`else if` conditions only — body unchanged):
```js
    if (state.route.name === "keywords") {
```
```js
    } else if (state.route.name === "rankings") {
```
```js
    } else if (state.route.name === "audit") {
```
with:
```js
    if (state.route.section === "keywords" && (!state.route.sub || state.route.sub === "explorer")) {
```
```js
    } else if (state.route.section === "rankings" && !state.route.sub) {
```
```js
    } else if (state.route.section === "audit" && !state.route.sub) {
```
This ensures live-data fetches only run for the pages that actually render real content; every placeholder leaf skips data loading entirely.

- [ ] **Step 2: Verify**

Read the edited function back and confirm the three conditions read `state.route.section`/`state.route.sub` (no remaining `state.route.name ===` comparisons in this function).

- [ ] **Step 3: Commit**

```bash
git add frontend/js/m21-seo.js
git commit -m "M21: gate loadRoute() to real pages, skip fetch for placeholder leaves"
```

---

### Task 3: Nested sidebar rendering — `shell()`, badges, expand/collapse

**Files:**
- Modify: `frontend/js/m21-seo.js:229-250` (`shell`)
- Modify: `frontend/js/m21-seo.js:156-162` (`state` — add `navOpen`)

- [ ] **Step 1: Add `navOpen` to state**

In the `state` object (around line 156-162), change:
```js
  const state = {
    user: null, workspaceId: null, workspaceName: null, role: "owner",
    loaded: false, previewState: "default", modalOpen: false,
    route: { name: "keywords" },
    research: null, activeTab: "related", selected: new Set(),
    lists: [], trackers: [], audit: null, gap: null,
  };
```
to:
```js
  const state = {
    user: null, workspaceId: null, workspaceName: null, role: "owner",
    loaded: false, previewState: "default", modalOpen: false,
    route: { section: "dashboard", sub: null, id: null },
    research: null, activeTab: "related", selected: new Set(),
    lists: [], trackers: [], audit: null, gap: null, navOpen: new Set(),
  };
```

- [ ] **Step 2: Replace `shell()` with a version that renders nested nav, badges, and no longer takes an `activeKey` param**

Replace lines 229-250:
```js
  function shell(activeKey, content) {
    const nav = NAV.map((n) => `<div class="nav-item ${n.key === activeKey ? "active" : ""}" data-hash="${n.hash}"><span class="ni-ico">${svg(n.ico)}</span><span>${n.label}</span></div>`).join("");
    return `
      <aside class="rail" id="rail">
        <div class="brand"><span class="mark">✦</span><span><b>AiMind</b><em>Share</em></span></div>
        <div class="nav-group"><div class="nav-group-label">SEO &amp; Content</div>${nav}</div>
        <div class="rail-foot">M21 · SEO Engine</div>
      </aside>
      <header class="tbar">
        <button class="icon-btn rail-burger" id="railBurger" aria-label="Menu">☰</button>
        <div class="ws-trigger" style="cursor:default">
          <span class="ws-badge">${esc(initials(state.workspaceName || "AiMindShare"))}</span>
          <span class="ws-meta"><span class="ws-name">${esc(state.workspaceName || "Workspace")}</span><span class="ws-kind">SEO Engine</span></span>
        </div>
        <div class="spacer"></div>
        <span class="pill plain" id="connPill" hidden></span>
        <button class="btn btn-ghost btn-sm" id="openConnect2">Connect</button>
        <button class="icon-btn" id="themeToggle" title="Toggle theme" aria-label="Toggle theme"><span id="themeIco">☾</span></button>
        <span class="avatar" title="${esc(state.user?.email || "")}">${esc(initials(state.user?.name || state.user?.email))}</span>
      </header>
      <main class="content"><div class="content-inner">${content}</div></main>`;
  }
```
with:
```js
  function getSeoNavCounts() {
    // Vanilla stand-in for the PRD's useSeoNavCounts() hook — static mock counts.
    return { audit: 2, competitors: 1 };
  }
  function renderNavItem(n) {
    const counts = getSeoNavCounts();
    const badge = counts[n.key] ? `<span class="nav-badge">${counts[n.key]}</span>` : "";
    if (!n.children || !n.children.length) {
      const active = state.route.section === n.key;
      return `<div class="nav-item ${active ? "active" : ""}" data-hash="${n.hash}">
        <span class="ni-ico">${svg(n.ico)}</span><span>${n.label}</span>${badge}</div>`;
    }
    const selfOrChildActive = state.route.section === n.key;
    const open = state.navOpen.has(n.key) || selfOrChildActive;
    const childRows = n.children.map((c) => {
      const cActive = state.route.section === n.key && state.route.sub === c.key;
      return `<div class="nav-item nav-child ${cActive ? "active" : ""}" data-hash="${c.hash}"><span>${c.label}</span></div>`;
    }).join("");
    return `<div class="nav-item nav-parent ${selfOrChildActive ? "active" : ""}" data-hash="${n.hash}">
        <span class="ni-ico">${svg(n.ico)}</span><span>${n.label}</span>${badge}
        <button class="nav-chevron ${open ? "open" : ""}" data-navtoggle="${n.key}" title="${open ? "Collapse" : "Expand"}">${svg("chev", 12)}</button>
      </div>
      <div class="nav-children ${open ? "open" : ""}">${childRows}</div>`;
  }
  function shell(content) {
    const nav = NAV.map(renderNavItem).join("");
    return `
      <aside class="rail" id="rail">
        <div class="brand"><span class="mark">✦</span><span><b>AiMind</b><em>Share</em></span></div>
        <div class="nav-group"><div class="nav-group-label">SEO &amp; Content</div>${nav}</div>
        <div class="rail-foot">M21 · SEO Engine</div>
      </aside>
      <header class="tbar">
        <button class="icon-btn rail-burger" id="railBurger" aria-label="Menu">☰</button>
        <div class="ws-trigger" style="cursor:default">
          <span class="ws-badge">${esc(initials(state.workspaceName || "AiMindShare"))}</span>
          <span class="ws-meta"><span class="ws-name">${esc(state.workspaceName || "Workspace")}</span><span class="ws-kind">SEO Engine</span></span>
        </div>
        <div class="spacer"></div>
        <span class="pill plain" id="connPill" hidden></span>
        <button class="btn btn-ghost btn-sm" id="openConnect2">Connect</button>
        <button class="icon-btn" id="themeToggle" title="Toggle theme" aria-label="Toggle theme"><span id="themeIco">☾</span></button>
        <span class="avatar" title="${esc(state.user?.email || "")}">${esc(initials(state.user?.name || state.user?.email))}</span>
      </header>
      <main class="content"><div class="content-inner">${content}</div></main>`;
  }
```
Note: `selfOrChildActive` is keyed only on `section` (not `section+!sub`) — this deliberately keeps the parent row's "active" highlight and its `nav-children` expanded for every sub-page under it, which is the intended nested-nav behavior (e.g. being on `#/seo/keywords/opportunity` should keep "Keyword Research" visibly active and expanded).

- [ ] **Step 3: Wire the chevron toggle in `wireCommon()`**

In `wireCommon()` (around line 487-494), after the existing `$$("[data-hash]")` line, add:
```js
    $$("[data-navtoggle]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = b.dataset.navtoggle;
      state.navOpen.has(key) ? state.navOpen.delete(key) : state.navOpen.add(key);
      render();
    }));
```
`e.stopPropagation()` is required because the chevron `<button>` sits inside the `.nav-parent` div, which itself has a `data-hash` click handler — without it, clicking the chevron would also navigate.

- [ ] **Step 4: Verify — this task alone will not yet compile/render correctly**

`shell()`'s new signature (`shell(content)`, no `activeKey`) breaks every existing call site (`viewKeywords`, `viewRankings`, `viewAudit`, and the sign-in-required branch in `render()`) until Task 4 updates them. Do not attempt to load the page in a browser between Task 3 and Task 4 — proceed straight to Task 4, which must land in the same sitting.

- [ ] **Step 5: Commit**

```bash
git add frontend/js/m21-seo.js
git commit -m "M21: nested nav rendering (expand/collapse, active-state, badge stub)"
```

---

### Task 4: Update every `shell()` call site to the new one-argument signature

**Files:**
- Modify: `frontend/js/m21-seo.js:265,266,303` (`viewKeywords`)
- Modify: `frontend/js/m21-seo.js:372,373,393` (`viewRankings`)
- Modify: `frontend/js/m21-seo.js:421,422,431,458` (`viewAudit`)
- Modify: `frontend/js/m21-seo.js:475` (sign-in-required branch)

- [ ] **Step 1: `viewKeywords`**

```js
    if (st("loading")) return shell("keywords", loadingBlock());
    if (st("error")) return shell("keywords", errorBlock());
```
→
```js
    if (st("loading")) return shell(loadingBlock());
    if (st("error")) return shell(errorBlock());
```
and
```js
    return shell("keywords", previewStrip() + head("search", "SEO &amp; Content · M21", `Keyword <em>research</em>`, "Volume, difficulty and intent for any term — with related keywords, questions and the live SERP.", "")
      + `<div class="kw-layout"><div class="kw-main">${form}${showEmpty && !research ? "" : ""}${body}${gap}</div>${sidebar}</div>`);
```
→
```js
    return shell(previewStrip() + head("search", "SEO &amp; Content · M21", `Keyword <em>research</em>`, "Volume, difficulty and intent for any term — with related keywords, questions and the live SERP.", "")
      + `<div class="kw-layout"><div class="kw-main">${form}${showEmpty && !research ? "" : ""}${body}${gap}</div>${sidebar}</div>`);
```

- [ ] **Step 2: `viewRankings`**

```js
    if (st("loading")) return shell("rankings", loadingBlock());
    if (st("error")) return shell("rankings", errorBlock());
```
→
```js
    if (st("loading")) return shell(loadingBlock());
    if (st("error")) return shell(errorBlock());
```
and
```js
    return shell("rankings", previewStrip() + head("trend", "SEO &amp; Content · M21", `Rank <em>tracker</em>`, "Daily Google positions for your domain and competitors, with 90-day history and major-move alerts.", cta) + body);
```
→
```js
    return shell(previewStrip() + head("trend", "SEO &amp; Content · M21", `Rank <em>tracker</em>`, "Daily Google positions for your domain and competitors, with 90-day history and major-move alerts.", cta) + body);
```

- [ ] **Step 3: `viewAudit`**

```js
    if (st("loading")) return shell("audit", loadingBlock());
    if (st("error")) return shell("audit", errorBlock());
```
→
```js
    if (st("loading")) return shell(loadingBlock());
    if (st("error")) return shell(errorBlock());
```
and
```js
      return shell("audit", previewStrip() + head("gauge", "SEO &amp; Content · M21", `Site <em>audit</em>`, "Crawl your site for broken links, on-page SEO gaps and Core Web Vitals.", "")
```
→
```js
      return shell(previewStrip() + head("gauge", "SEO &amp; Content · M21", `Site <em>audit</em>`, "Crawl your site for broken links, on-page SEO gaps and Core Web Vitals.", "")
```
and
```js
    return shell("audit", previewStrip() + head("gauge", "SEO &amp; Content · M21", `Site <em>audit</em>`, `Last crawl of <b>${esc(a.domain)}</b> — ${fmtInt(a.pages_crawled)} pages.`, canWrite() ? `<button class="btn btn-ghost" id="runAudit2">${svg("gauge", 14)} Re-run</button>` : "")
```
→
```js
    return shell(previewStrip() + head("gauge", "SEO &amp; Content · M21", `Site <em>audit</em>`, `Last crawl of <b>${esc(a.domain)}</b> — ${fmtInt(a.pages_crawled)} pages.`, canWrite() ? `<button class="btn btn-ghost" id="runAudit2">${svg("gauge", 14)} Re-run</button>` : "")
```

- [ ] **Step 4: sign-in-required branch in `render()`**

```js
    if (connected() && !state.user) content = shell("keywords", `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("search", 22)}</div><h3>Sign in required</h3><p>Connect a project and sign in to use the SEO Engine.</p></div></div>`);
```
→
```js
    if (connected() && !state.user) content = shell(`<div class="panel"><div class="empty-state"><div class="es-ico">${svg("search", 22)}</div><h3>Sign in required</h3><p>Connect a project and sign in to use the SEO Engine.</p></div></div>`);
```

- [ ] **Step 5: Verify — no remaining old-signature calls**

Search the file for any remaining two-argument `shell(` calls:
```bash
grep -n 'shell("' frontend/js/m21-seo.js
```
Expected: no matches (every call site now passes a single content argument).

- [ ] **Step 6: Commit**

```bash
git add frontend/js/m21-seo.js
git commit -m "M21: update all shell() call sites to the new single-argument signature"
```

---

### Task 5: Placeholder page renderer + shadow-note copy

**Files:**
- Modify: `frontend/js/m21-seo.js` (add near `viewAudit`, e.g. after line 461 `cwvCard`)

- [ ] **Step 1: Add `SHADOW_NOTE` map and `viewPlaceholder()`**

Insert after the `cwvCard` function (line 461):
```js

  /* ══════════════════════════════════════════════════════════════════════════
     Placeholder pages — routing shell only, feature logic lands in a later session
     ══════════════════════════════════════════════════════════════════════════ */
  const SHADOW_NOTE = {
    "keywords/related": "This view currently lives as the “Related” tab inside Keyword Explorer — promote to a standalone page in a later session.",
    "keywords/questions": "This view currently lives as the “Questions” tab inside Keyword Explorer — promote to a standalone page in a later session.",
    "serp/snapshot": "This view currently lives as the “SERP” tab inside Keyword Explorer — promote to a standalone page in a later session.",
  };
  function viewPlaceholder(section, sub, id) {
    const sec = NAV.find((n) => n.key === section);
    const child = sec?.children?.find((c) => c.key === sub);
    const title = child ? child.label : (sec ? sec.label : "Not found");
    const note = SHADOW_NOTE[`${section}/${sub}`];
    const idNote = id ? `<p class="muted">Requested id: <span class="mono">${esc(id)}</span></p>` : "";
    const ico = sec?.ico || "bolt";
    return shell(previewStrip() + head(ico, "SEO &amp; Content · M21", `<em>${esc(title)}</em>`,
      note ? "See note below." : "Feature logic for this page isn't built yet — this is a routing placeholder.", "")
      + `<div class="panel"><div class="empty-state"><div class="es-ico">${geoOrb(svg(ico, 24))}</div>
        <h3>Coming soon</h3><p>${note || "This page is wired into navigation and routing but doesn't have real data or logic behind it yet."}</p>${idNote}
      </div></div>`);
  }
```

- [ ] **Step 2: Verify with a quick Node syntax check**

```bash
node --check frontend/js/m21-seo.js
```
Expected: no output (exit code 0 — valid syntax).

- [ ] **Step 3: Commit**

```bash
git add frontend/js/m21-seo.js
git commit -m "M21: add shared placeholder page renderer with shadow-note copy"
```

---

### Task 6: Wire the dispatch table in `render()`

**Files:**
- Modify: `frontend/js/m21-seo.js:472-484` (`render`)

- [ ] **Step 1: Replace the render dispatch**

Replace lines 472-484:
```js
  function render() {
    const app = $("#app");
    let content;
    if (connected() && !state.user) content = shell(`<div class="panel"><div class="empty-state"><div class="es-ico">${svg("search", 22)}</div><h3>Sign in required</h3><p>Connect a project and sign in to use the SEO Engine.</p></div></div>`);
    else if (state.route.name === "rankings") content = viewRankings();
    else if (state.route.name === "audit") content = viewAudit();
    else content = viewKeywords();
    app.innerHTML = content;
    renderConn(); wireCommon();
    if (state.route.name === "keywords") wireKeywords();
    if (state.route.name === "rankings") wireRankings();
    if (state.route.name === "audit") { wireAudit(); drawScoreDial(); }
  }
```
with:
```js
  function render() {
    const app = $("#app");
    const { section, sub, id } = state.route;
    const isKeywordsHome = section === "keywords" && (!sub || sub === "explorer");
    const isRankingsHome = section === "rankings" && !sub;
    const isAuditHome = section === "audit" && !sub;
    let content;
    if (connected() && !state.user) content = shell(`<div class="panel"><div class="empty-state"><div class="es-ico">${svg("search", 22)}</div><h3>Sign in required</h3><p>Connect a project and sign in to use the SEO Engine.</p></div></div>`);
    else if (isRankingsHome) content = viewRankings();
    else if (isAuditHome) content = viewAudit();
    else if (isKeywordsHome) content = viewKeywords();
    else content = viewPlaceholder(section, sub, id);
    app.innerHTML = content;
    renderConn(); wireCommon();
    if (isKeywordsHome) wireKeywords();
    if (isRankingsHome) wireRankings();
    if (isAuditHome) { wireAudit(); drawScoreDial(); }
  }
```

- [ ] **Step 2: Verify — full manual route sweep in the browser**

Open the Browser preview at `file:///C:/Users/User/Documents/AiMindShare/frontend/m21-seo-engine.html` (no dev server needed for this static file). For each hash below, `navigate` to it and use `read_page` (or `get_page_text`) to confirm the expected page renders with no console errors (`read_console_messages`):

| Hash | Expected |
|---|---|
| `#/seo` | Dashboard placeholder, "Coming soon" |
| `#/seo/keywords` | Existing Keyword Explorer page (search form + tabs) |
| `#/seo/keywords/explorer` | Same Keyword Explorer page |
| `#/seo/keywords/opportunity` | Placeholder, generic copy |
| `#/seo/keywords/related` | Placeholder, shadow-note about the Related tab |
| `#/seo/keywords/questions` | Placeholder, shadow-note about the Questions tab |
| `#/seo/clusters` | Placeholder ("Clusters" title) |
| `#/seo/clusters/builder` | Placeholder ("Cluster Builder" title) |
| `#/seo/clusters/abc123` | Placeholder, shows "Requested id: abc123" |
| `#/seo/serp/snapshot` | Placeholder, shadow-note about the SERP tab |
| `#/seo/serp/weakness` | Placeholder, generic copy |
| `#/seo/rankings` | Existing Rank tracker page (unchanged) |
| `#/seo/rankings/overlay` | Placeholder |
| `#/seo/rankings/t1/history` | Placeholder, shows "Requested id: t1" |
| `#/seo/audit` | Existing Site audit page (unchanged) |
| `#/seo/audit/crawler` | Placeholder |
| `#/seo/audit/xyz` | Placeholder, shows "Requested id: xyz" |
| `#/seo/settings/scoring` | Placeholder |

Also click the sidebar's "Keyword Research" row (not the chevron) and confirm it navigates to `#/seo/keywords/explorer` and expands its children; then click the chevron on "Technical Audit" and confirm it toggles open/closed without navigating away from the current page.

- [ ] **Step 3: Commit**

```bash
git add frontend/js/m21-seo.js
git commit -m "M21: dispatch render() across the full nav tree, placeholder fallback"
```

---

### Task 7: CSS — nested nav pattern, badges, icon-only-rail override

**Files:**
- Modify: `frontend/styles/m21-seo.css`

- [ ] **Step 1: Append the nested-nav CSS block**

Add to the end of `frontend/styles/m21-seo.css`:
```css

/* ── Nested sidebar nav (9-section tree) — pattern reused from m19-studio.css ── */
.nav-parent{cursor:pointer}
.nav-parent .nav-chevron{margin-left:auto;display:flex;align-items:center;justify-content:center;
  width:20px;height:20px;border:none;background:transparent;color:inherit;opacity:.6;
  border-radius:var(--r-sm);transition:transform .15s ease}
.nav-parent .nav-chevron:hover{opacity:1;background:rgba(0,105,110,.1)}
.nav-parent .nav-chevron.open{transform:rotate(90deg)}
.nav-children{display:none;padding-left:10px;margin:2px 0 4px;border-left:1px solid var(--line)}
.nav-children.open{display:block}
.nav-children .nav-child{padding:7px 12px;font-size:12.5px}
.nav-badge{margin-left:auto;padding:1px 7px;border-radius:var(--r-pill);font:600 10.5px/1.6 var(--font-sans);
  background:var(--teal-100);color:var(--teal-700)}

/* Icon-only rail (≤1100px, shared breakpoint from components.css): no room for a
   flyout submenu, so collapse children entirely instead of showing orphaned text. */
@media(max-width:1100px){
  .nav-children,.nav-children.open{display:none}
  .nav-parent .nav-chevron{display:none}
}
```

- [ ] **Step 2: Verify — resize + inspect in the browser**

With the same preview open at `#/seo/keywords`, use `resize_window` to set width 900 (icon-only rail range) and confirm via `read_page`/screenshot that no nav item labels or `.nav-children` text are visible (icons only), then resize to 375 (mobile) and confirm the rail is the existing full overlay drawer (hidden until the burger button is clicked), matching the pre-existing M21 mobile behavior. Also check `read_console_messages` for errors at both sizes.

- [ ] **Step 3: Commit**

```bash
git add frontend/styles/m21-seo.css
git commit -m "M21: nested-nav CSS (expand/collapse, badge, icon-only-rail override)"
```

---

### Task 8: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Re-verify the three preserved real pages are fully unchanged**

In the browser preview, exercise each of the three existing pages exactly as before this change and confirm no regression:
- `#/seo/keywords/explorer`: type a seed keyword, click "Research", confirm the Related/Questions/SERP tabs still switch and the metric card renders (mockup data).
- `#/seo/rankings`: confirm the tracker table and "Track keyword" modal still open and submit.
- `#/seo/audit`: confirm "Run audit" still works and the score dial/CWV cards/issues list render.

- [ ] **Step 2: Check both themes and 0 horizontal scroll**

Toggle the theme button (`#themeToggle`) and confirm the nested nav renders correctly in dark mode too (badge/chevron colors use tokens, not hardcoded hex, so this should be automatic). At widths 375, 760, 1100, and 1280, confirm no horizontal scrollbar appears (`document.documentElement.scrollWidth <= document.documentElement.clientWidth` via `javascript_tool`).

- [ ] **Step 3: Final commit (if any fixups were needed)**

```bash
git add -A
git commit -m "M21: nav shell regression fixes"
```
(Skip this commit if Steps 1-2 found nothing to fix.)

---

## Self-review notes

- **Spec coverage:** All 9 sections/~30 leaves from the design doc are represented in `NAV` (Task 1) and reachable via the dispatch table (Task 6); the C-section remapping (Explorer/Rankings/Audit preserved, Dashboard new, Related/Questions/SERP-snapshot shadow-noted) is implemented in Tasks 5-6; mobile/icon-only handling is Task 7; no new files/deps/migrations, matching the spec's "out of scope" list.
- **Type consistency:** `state.route` fields (`section`/`sub`/`id`) are introduced once in Task 1 and used identically in Tasks 2, 3, 5, 6 — no renaming drift.
- **No placeholders left in this plan:** every step has literal code; the only "TBD"-shaped content is the *product-facing* "Coming soon" copy, which is the intended deliverable, not a plan gap.
