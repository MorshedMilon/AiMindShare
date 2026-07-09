# M19 Agency Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Dashboard's existing "Attention needed" panel in `frontend/js/m19-sites.js` to cover four new signal groups (domain expiry, pending client review, lead/booking captures, AI suggestions) plus content-freshness, add filter chips so the longer list stays scannable, and let AI-suggestion rows be dismissed for the session.

**Architecture:** Everything lives in the existing `attentionItems()` (pure function, computes a flat list from `state`) → `attentionPanel()` (renders it) → `bindDashboard()` (wires clicks) pipeline already used for this panel. No new files, no new routes, no backend calls — new mock data goes in the existing `MOCK` object, new derived state fields load the same way `healthBySite`/`domainsBySite` already do.

**Tech Stack:** Plain IIFE JavaScript (`frontend/js/m19-sites.js`), no bundler, no module system, no test runner exists in this repo (confirmed: no `package.json` anywhere in the project). Verification is manual, via the Preview browser tool (`preview_eval` for logic/state checks, `preview_snapshot`/`preview_screenshot` for visual/DOM checks) — there is no automated test suite to run instead.

**Reference spec:** `docs/superpowers/specs/2026-07-08-m19-agency-command-center-design.md`

---

### Task 1: Mock data — domain expiry, leads, AI suggestions

**Files:**
- Modify: `frontend/js/m19-sites.js:104` (MOCK.domains)
- Modify: `frontend/js/m19-sites.js:169` (MOCK return statement)
- Modify: `frontend/js/m19-sites.js:174-181` (state object)
- Modify: `frontend/js/m19-sites.js:234-237` (state hydration from MOCK)

- [ ] **Step 1: Add `expires_at` to the existing domain mock records**

Find this line (currently `m19-sites.js:104`):

```js
const domains = { s1: [{ id: "d1", domain: "northstaragency.com", status: "active", ssl_status: "pending", is_primary: true, verification_token: "ams7f3a9c2b1e" }], s3: [{ id: "d3", domain: "zenithcoaching.io", status: "active", ssl_status: "pending", is_primary: true, verification_token: "ams1a2b3c4d5e" }] };
```

Replace it with:

```js
const domains = { s1: [{ id: "d1", domain: "northstaragency.com", status: "active", ssl_status: "pending", is_primary: true, verification_token: "ams7f3a9c2b1e", expires_at: "2026-08-02T00:00:00Z" }], s3: [{ id: "d3", domain: "zenithcoaching.io", status: "active", ssl_status: "pending", is_primary: true, verification_token: "ams1a2b3c4d5e", expires_at: "2026-07-11T00:00:00Z" }] };
```

(`s1` now expires in ~25 days from the app's reference "today" of 2026-07-08 → will trigger the new `warn` domain-expiry check in Task 2; `s3` expires in ~3 days → will trigger `crit`.)

- [ ] **Step 2: Add `MOCK.leads` and `MOCK.suggestions`, right after the `health` mock block**

Find this line (currently `m19-sites.js:169`):

```js
    return { user: { id: "u1", email: "aisha@northstar.agency", name: "Aisha Rahman" }, workspace: { id: "ws", name: "Northstar Agency" }, role: "owner", sites, pages, domains, templates, versions, publishLog, analytics, profiles, health };
```

Replace it with:

```js
    const leads = {
      s1: [
        { id: "ld1", type: "form", label: "Contact form", created_at: "2026-07-07T09:20:00Z" },
        { id: "ld2", type: "booking", label: "Discovery call", created_at: "2026-07-06T16:05:00Z" },
      ],
      s3: [
        { id: "ld3", type: "booking", label: "Coaching consult", created_at: "2026-07-07T11:00:00Z" },
      ],
    };
    const suggestions = {
      s1: [
        { id: "sg1", title: "Homepage CTA has a low click-through", detail: "Try a stronger, benefit-led headline above the fold." },
      ],
      s2: [
        { id: "sg2", title: "Brand colors drift on the Contact page", detail: "Contact page buttons don't match your Brand Kit primary color." },
        { id: "sg3", title: "Pricing page could convert better", detail: "Add a comparison table — sites with one see higher signup rates." },
      ],
    };
    return { user: { id: "u1", email: "aisha@northstar.agency", name: "Aisha Rahman" }, workspace: { id: "ws", name: "Northstar Agency" }, role: "owner", sites, pages, domains, templates, versions, publishLog, analytics, profiles, health, leads, suggestions };
```

- [ ] **Step 3: Add the new state fields**

Find this line (currently `m19-sites.js:179`):

```js
    activity: [], sessions7: null, domainsActive: null, reviewBySite: {},
```

Replace it with:

```js
    activity: [], sessions7: null, domainsActive: null, reviewBySite: {},
    leadsBySite: {}, suggestionsBySite: {}, dismissedSuggestions: {},
```

- [ ] **Step 4: Hydrate the new state fields from MOCK in the disconnected branch**

Find this line (currently `m19-sites.js:236`):

```js
      state.profilesBySite = MOCK.profiles; state.healthBySite = MOCK.health;
```

Replace it with:

```js
      state.profilesBySite = MOCK.profiles; state.healthBySite = MOCK.health;
      state.leadsBySite = MOCK.leads; state.suggestionsBySite = MOCK.suggestions;
```

- [ ] **Step 5: Verify with the preview tool**

Ensure a dev server is running for the `frontend/` static site (use `preview_start` if not already running), then run:

```js
preview_eval: JSON.stringify({ s1expiry: window.__m19debug ? null : "no debug hook — checking via network tab instead" })
```

Since `m19-sites.js` is an IIFE with no exposed globals, the real check is deferred to Task 2's verification (once `attentionItems()` consumes this data, its output is observable). For this step, just confirm the page still loads with **zero console errors** after the edit:

- `preview_eval`: `location.reload()`
- `preview_console_logs` with `level: "error"` — expect empty output.

- [ ] **Step 6: Commit is not applicable**

This project is not a git repository (confirmed: `git status` is unavailable / no `.git` directory). Skip the commit step for every task in this plan — there is nothing to commit to. Move directly to the next task after each verification step passes.

---

### Task 2: Extend `attentionItems()` with the four new signal groups + `opp` severity tier

**Files:**
- Modify: `frontend/js/m19-sites.js:1389-1423` (the whole `attentionItems` function)

- [ ] **Step 1: Replace the full `attentionItems` function**

Find the current function (starts at `m19-sites.js:1389`, ends at line 1423 with the closing `return items; }`):

```js
  function attentionItems(sites) {
    const items = [], byId = {}; sites.forEach((s) => byId[s.id] = s);
    const health = state.healthBySite || {}, doms = state.domainsBySite || {};
    const catTitle = { seo: "SEO", schema: "Schema", a11y: "Accessibility", perf: "Performance", links: "Broken links", fields: "Required fields" };
    const catIco = { seo: "search", schema: "search", a11y: "eye", perf: "gauge", links: "link", fields: "check" };
    // Custom-domain SSL not yet issued.
    Object.entries(doms).forEach(([sid, ds]) => (ds || []).forEach((d) => {
      const s = byId[sid]; if (!s) return;
      if (d.ssl_status && d.ssl_status !== "active")
        items.push({ group: "domain", sev: "warn", ico: "link", site: s, title: `SSL pending · ${d.domain}`, detail: "Certificate not yet issued — finish DNS verification to secure the domain.", actLabel: "Domains", nav: "domains" });
    }));
    // Latest DNS verification per domain — surface only if the most recent check failed.
    const src = (state.activity && state.activity.length) ? state.activity : (!connected() ? MOCK.publishLog : []);
    const latestVerify = {};
    src.forEach((l) => { if (l.kind === "domain.verify" && l.detail?.domain && !latestVerify[l.detail.domain]) latestVerify[l.detail.domain] = l; });
    Object.values(latestVerify).forEach((l) => {
      if (l.status === "error") { const s = sites.find((x) => x.primary_domain === l.detail.domain) || null;
        items.push({ group: "domain", sev: "crit", ico: "link", site: s, title: `DNS not found · ${l.detail.domain}`, detail: "Add the CNAME → sites.aimindshare.com plus the TXT record, then re-verify.", actLabel: "Domains", nav: "domains" }); }
    });
    // Per-page health categories that aren't passing (SEO, schema, a11y, perf, links, fields).
    Object.entries(health).forEach(([sid, h]) => { const s = byId[sid]; if (!s || !h) return;
      (h.categories || []).forEach((c) => { if (c.status === "pass") return;
        items.push({ group: "seo", sev: c.status === "fail" ? "crit" : "warn", ico: catIco[c.key] || "search", site: s, title: `${catTitle[c.key] || c.key} · ${s.name}`, detail: c.detail || "Needs review.", actLabel: "Fix", gohealth: s.id }); });
    });
    // Publish backlog: unpublished edits on a live site, or a draft never shipped.
    sites.forEach((s) => {
      if (s.status === "published" && s.last_published && new Date(s.updated_at) > new Date(s.last_published))
        items.push({ group: "publish", sev: "warn", ico: "rocket", site: s, title: `Unpublished changes · ${s.name}`, detail: `Edited ${relTime(s.updated_at)} — the live version is older.`, actLabel: "Publish", editsite: s.id });
      else if (s.status !== "published" && !s.last_published)
        items.push({ group: "publish", sev: "info", ico: "doc", site: s, title: `${s.name} is still a draft`, detail: "Never published — review and ship it when ready.", actLabel: "Open", open: s.id });
    });
    const rank = { crit: 0, warn: 1, info: 2 };
    items.sort((a, b) => rank[a.sev] - rank[b.sev]);
    return items;
  }
```

Replace it with:

```js
  function attentionItems(sites) {
    const items = [], byId = {}; sites.forEach((s) => byId[s.id] = s);
    const health = state.healthBySite || {}, doms = state.domainsBySite || {};
    const catTitle = { seo: "SEO", schema: "Schema", a11y: "Accessibility", perf: "Performance", links: "Broken links", fields: "Required fields" };
    const catIco = { seo: "search", schema: "search", a11y: "eye", perf: "gauge", links: "link", fields: "check" };
    // Custom-domain SSL not yet issued.
    Object.entries(doms).forEach(([sid, ds]) => (ds || []).forEach((d) => {
      const s = byId[sid]; if (!s) return;
      if (d.ssl_status && d.ssl_status !== "active")
        items.push({ group: "domain", sev: "warn", ico: "link", site: s, title: `SSL pending · ${d.domain}`, detail: "Certificate not yet issued — finish DNS verification to secure the domain.", actLabel: "Domains", nav: "domains" });
    }));
    // Latest DNS verification per domain — surface only if the most recent check failed.
    const src = (state.activity && state.activity.length) ? state.activity : (!connected() ? MOCK.publishLog : []);
    const latestVerify = {};
    src.forEach((l) => { if (l.kind === "domain.verify" && l.detail?.domain && !latestVerify[l.detail.domain]) latestVerify[l.detail.domain] = l; });
    const flaggedDomains = new Set();
    Object.values(latestVerify).forEach((l) => {
      if (l.status === "error") { const s = sites.find((x) => x.primary_domain === l.detail.domain) || null;
        items.push({ group: "domain", sev: "crit", ico: "link", site: s, title: `DNS not found · ${l.detail.domain}`, detail: "Add the CNAME → sites.aimindshare.com plus the TXT record, then re-verify.", actLabel: "Domains", nav: "domains" });
        flaggedDomains.add(l.detail.domain); }
    });
    // Domain expiring soon — skip only if that same domain already has a DNS-failure row above
    // (a real failure makes an expiry warning redundant). Do NOT dedupe against the routine
    // SSL-pending check above — SSL-pending and about-to-lapse are unrelated facts about a
    // domain, and suppressing expiry on that basis would hide real risk.
    Object.entries(doms).forEach(([sid, ds]) => (ds || []).forEach((d) => {
      const s = byId[sid]; if (!s || !d.expires_at || flaggedDomains.has(d.domain)) return;
      const daysLeft = Math.ceil((new Date(d.expires_at).getTime() - Date.now()) / 864e5);
      if (daysLeft > 30) return;
      items.push({ group: "domain", sev: daysLeft <= 7 ? "crit" : "warn", ico: "link", site: s, title: `Domain expires in ${daysLeft}d · ${d.domain}`, detail: "Renew before it lapses to avoid downtime.", actLabel: "Domains", nav: "domains" });
    }));
    // Per-page health categories that aren't passing (SEO, schema, a11y, perf, links, fields).
    Object.entries(health).forEach(([sid, h]) => { const s = byId[sid]; if (!s || !h) return;
      (h.categories || []).forEach((c) => { if (c.status === "pass") return;
        items.push({ group: "seo", sev: c.status === "fail" ? "crit" : "warn", ico: catIco[c.key] || "search", site: s, title: `${catTitle[c.key] || c.key} · ${s.name}`, detail: c.detail || "Needs review.", actLabel: "Fix", gohealth: s.id }); });
    });
    // Pending client review — sent for review, not yet approved or published.
    sites.forEach((s) => {
      if ((state.reviewBySite || {})[s.id] === "review")
        items.push({ group: "review", sev: "info", ico: "check", site: s, title: `Awaiting client review · ${s.name}`, detail: "Sent for review — waiting on client approval before it can go live.", actLabel: "Publish", publish: s.id });
    });
    // Publish backlog: unpublished edits on a live site, a draft never shipped, or stale published content.
    sites.forEach((s) => {
      if (s.status === "published" && s.last_published && new Date(s.updated_at) > new Date(s.last_published))
        items.push({ group: "publish", sev: "warn", ico: "rocket", site: s, title: `Unpublished changes · ${s.name}`, detail: `Edited ${relTime(s.updated_at)} — the live version is older.`, actLabel: "Publish", editsite: s.id });
      else if (s.status !== "published" && !s.last_published)
        items.push({ group: "publish", sev: "info", ico: "doc", site: s, title: `${s.name} is still a draft`, detail: "Never published — review and ship it when ready.", actLabel: "Open", open: s.id });
      else if (s.status === "published") {
        const staleDays = Math.floor((Date.now() - new Date(s.updated_at).getTime()) / 864e5);
        if (staleDays > 90) items.push({ group: "publish", sev: "info", ico: "doc", site: s, title: `Content hasn't changed in ${staleDays}d · ${s.name}`, detail: "No edits in a while — review for freshness.", actLabel: "Review", open: s.id });
      }
    });
    // Leads & bookings captured in the last 48h — one rolled-up row per site, not per lead.
    const leadTypeLabel = { form: "form submission", booking: "booking" };
    Object.entries(state.leadsBySite || {}).forEach(([sid, leadList]) => {
      const s = byId[sid]; if (!s) return;
      const cutoff = Date.now() - 48 * 36e5;
      const recent = (leadList || []).filter((l) => new Date(l.created_at).getTime() >= cutoff);
      if (!recent.length) return;
      const counts = {}; recent.forEach((l) => { counts[l.type] = (counts[l.type] || 0) + 1; });
      const parts = Object.entries(counts).map(([type, n]) => `${n} ${leadTypeLabel[type] || type}${n > 1 ? "s" : ""}`);
      items.push({ group: "leads", sev: "info", ico: "users", site: s, title: `${recent.length} new lead${recent.length > 1 ? "s" : ""} · ${s.name}`, detail: parts.join(", "), actLabel: "Review", goanalytics: s.id });
    });
    // AI suggestions — synthetic, lowest-priority tier; dismissed ones are filtered out before ranking.
    const dismissed = state.dismissedSuggestions || {};
    Object.entries(state.suggestionsBySite || {}).forEach(([sid, suggList]) => {
      const s = byId[sid]; if (!s) return;
      (suggList || []).forEach((sg) => {
        if (dismissed[sg.id]) return;
        items.push({ group: "ai", sev: "opp", ico: "spark", site: s, title: sg.title, detail: sg.detail, actLabel: "Open", open: s.id, suggId: sg.id });
      });
    });
    // Rank controls sort order only — no cross-item suppression. A site can and will
    // produce multiple rows across multiple groups (e.g. a crit SSL issue AND an opp
    // AI suggestion both show).
    const rank = { crit: 0, warn: 1, info: 2, opp: 3 };
    items.sort((a, b) => rank[a.sev] - rank[b.sev]);
    return items;
  }
```

- [ ] **Step 2: Update `actAttr()` to emit the two new action attributes**

Find this line (currently `m19-sites.js:1425-1428`):

```js
  function actAttr(a) {
    return a.gohealth ? `data-gohealth="${esc(a.gohealth)}"` : a.editsite ? `data-editsite="${esc(a.editsite)}"`
      : a.open ? `data-open="${esc(a.open)}"` : `data-nav-to="${esc(a.nav)}"`;
  }
```

Replace it with:

```js
  function actAttr(a) {
    return a.gohealth ? `data-gohealth="${esc(a.gohealth)}"` : a.goanalytics ? `data-goanalytics="${esc(a.goanalytics)}"`
      : a.publish ? `data-publish="${esc(a.publish)}"` : a.editsite ? `data-editsite="${esc(a.editsite)}"`
      : a.open ? `data-open="${esc(a.open)}"` : `data-nav-to="${esc(a.nav)}"`;
  }
```

(No new click handlers are needed for `data-goanalytics` or `data-publish` — both already exist in `bindSiteCardActions()` at `m19-sites.js:1807` and `m19-sites.js:1809` respectively, added for other features. This step only makes `attentionItems()`'s output actually use them.)

- [ ] **Step 3: Verify via the preview tool**

1. `preview_start` (or confirm it's already running) for the `frontend/` static site, then `preview_eval: location.reload()`.
2. Open the dashboard route: `preview_eval: location.hash = "#/dashboard"`.
3. `preview_console_logs` with `level: "error"` — expect empty output (confirms no runtime errors from the new code paths).
4. `preview_snapshot` — confirm the "Attention needed" panel now renders more rows than before (at minimum: the pre-existing SSL/health/publish rows, plus the new domain-expiry, review, leads, and AI-suggestion rows for the 3 mock sites). You do not need to count rows exactly — just confirm new distinct titles appear, e.g. "Domain expires in", "Awaiting client review" (only if a site's `reviewBySite` state is `"review"` — by default no site starts in that state, so this row may not appear until Task 6/7 manual test sets it), "new lead", and the two AI suggestion titles from Task 1 Step 2.

---

### Task 3: Restructure `attentionPanel()` — filter chips, scrollable list, dismiss control

**Files:**
- Modify: `frontend/js/m19-sites.js:1462-1474` (the `attentionPanel` function and its row-rendering)

- [ ] **Step 1: Replace `attentionPanel()` and add the row-renderer + chip definitions above it**

Find the current block (currently `m19-sites.js:1462-1474`):

```js
  // Attention Needed — the section that tells the user what's wrong, not just pretty cards.
  function attentionPanel(items) {
    const rows = items.slice(0, 8).map((a) => `<div class="attn-item ai-${a.sev}">
      <span class="ai-ico">${svg(a.ico, 15)}</span>
      <div class="ai-main"><b>${esc(a.title)}</b><span>${esc(a.detail)}</span></div>
      <button class="btn btn-ghost btn-sm ai-act" ${actAttr(a)}>${esc(a.actLabel)} ${svg("chev", 12)}</button>
    </div>`).join("");
    const clear = `<div class="attn-clear"><span class="ac-ico">${svg("check", 18)}</span><div><b>All clear</b><span>No domain, SEO or publish issues need attention right now.</span></div></div>`;
    return `<section class="st-sec reveal"><div class="panel attn">
      <div class="panel-head"><span class="ph-ico ph-alert">${svg("bell", 15)}</span><h3>Attention needed</h3>${items.length ? `<span class="attn-count">${items.length}</span>` : ""}<button class="st-link" data-nav-to="publish" style="margin-left:auto">Publish center ${svg("chev", 12)}</button></div>
      <div class="attn-list">${items.length ? rows : clear}</div>
    </div></section>`;
  }
```

Replace it with:

```js
  // Attention Needed — the section that tells the user what's wrong, not just pretty cards.
  const ATTN_CHIPS = [
    ["all", "All", (a) => true],
    ["seo", "SEO & Health", (a) => a.group === "seo"],
    ["domain", "Domains", (a) => a.group === "domain"],
    ["publish", "Publish & Reviews", (a) => a.group === "publish" || a.group === "review"],
    ["leads", "Leads & Bookings", (a) => a.group === "leads"],
    ["ai", "AI Suggestions", (a) => a.group === "ai"],
  ];
  function attentionRow(a) {
    const dismiss = a.group === "ai" ? `<button class="icon-btn sm attn-dismiss" data-dismiss-sugg="${esc(a.suggId)}" title="Dismiss suggestion">${svg("x", 12)}</button>` : "";
    return `<div class="attn-item ai-${a.sev}" data-agroup="${esc(a.group)}">
      <span class="ai-ico">${svg(a.ico, 15)}</span>
      <div class="ai-main"><b>${esc(a.title)}</b><span>${esc(a.detail)}</span></div>
      <button class="btn btn-ghost btn-sm ai-act" ${actAttr(a)}>${esc(a.actLabel)} ${svg("chev", 12)}</button>
      ${dismiss}
    </div>`;
  }
  function attentionPanel(items) {
    const chips = ATTN_CHIPS.map(([k, l, pred], i) => `<button class="dt-chip ${i === 0 ? "on" : ""}" data-achip="${k}">${l} <span class="dc-n">${items.filter(pred).length}</span></button>`).join("");
    const rows = items.map(attentionRow).join("");
    const clear = `<div class="attn-clear"><span class="ac-ico">${svg("check", 18)}</span><div><b>All clear</b><span>No domain, SEO, publish, review or leads issues need attention right now.</span></div></div>`;
    return `<section class="st-sec reveal"><div class="panel attn">
      <div class="panel-head"><span class="ph-ico ph-alert">${svg("bell", 15)}</span><h3>Attention needed</h3>${items.length ? `<span class="attn-count">${items.length}</span>` : ""}<button class="st-link" data-nav-to="publish" style="margin-left:auto">Publish center ${svg("chev", 12)}</button></div>
      ${items.length ? `<div class="dt-chips attn-chips">${chips}</div>` : ""}
      <div class="attn-list" id="attnList">${items.length ? rows : clear}</div>
    </div></section>`;
  }
```

- [ ] **Step 2: Verify via the preview tool**

1. `preview_eval: location.reload()`, then `location.hash = "#/dashboard"`.
2. `preview_console_logs` with `level: "error"` — expect empty output.
3. `preview_snapshot` — confirm 6 chips render above the attention list: All, SEO & Health, Domains, Publish & Reviews, Leads & Bookings, AI Suggestions, each with a count badge.
4. `preview_inspect` on `.attn-item[data-agroup="ai"]` — confirm a small dismiss (✕) button is present on AI-suggestion rows and absent on every other row (spot-check one non-AI row, e.g. `.attn-item[data-agroup="domain"]`).

---

### Task 4: CSS — dismiss button, scrollable list, opp-tier color, chip spacing

**Files:**
- Modify: `frontend/styles/m19-studio.css:334-347` (attn-list / attn-item block)

- [ ] **Step 1: Add the new rules**

Find this line (currently `m19-studio.css:341`):

```css
.attn-item.ai-info .ai-ico{background:rgba(0,105,110,.10);color:var(--teal-700)}
```

Replace it with:

```css
.attn-item.ai-info .ai-ico,.attn-item.ai-opp .ai-ico{background:rgba(0,105,110,.10);color:var(--teal-700)}
```

(AI-suggestion rows reuse the existing teal "info" treatment — they're already visually distinct via the spark icon, the dismiss button, and the "AI Suggestions" chip, so no new color token is introduced for a single mockup feature.)

Then find this line (currently `m19-studio.css:334`):

```css
.attn-list{display:flex;flex-direction:column;margin-top:2px}
```

Replace it with:

```css
.attn-list{display:flex;flex-direction:column;margin-top:2px;max-height:460px;overflow-y:auto}
.attn-chips{margin:2px 0 6px}
.attn-item .attn-dismiss{margin-left:6px}
```

- [ ] **Step 2: Verify via the preview tool**

1. `preview_eval: location.reload()`, then `location.hash = "#/dashboard"`.
2. `preview_inspect` on `.attn-list` with `styles: ["max-height", "overflow-y"]` — confirm `max-height: 460px` and `overflow-y: auto` are applied.
3. `preview_screenshot` — visually confirm the panel looks consistent with the rest of the dashboard (no broken spacing, dismiss buttons aligned).
4. `preview_resize` to `mobile` (375px) — confirm no new horizontal scroll is introduced by the chips row (this project's established h-scroll regression check for M19 work).

---

### Task 5: Wire up chip filtering and suggestion dismissal

**Files:**
- Modify: `frontend/js/m19-sites.js:1833` (`bindDashboard`)
- Modify: `frontend/js/m19-sites.js` — add two new bind functions near `bindDashTable` (around line 1817)

- [ ] **Step 1: Add `bindAttentionChips` and `bindAttentionDismiss`, right before `bindDashTable`**

Find this line (currently `m19-sites.js:1817`, the start of `bindDashTable`):

```js
  function bindDashTable() {
```

Insert immediately before it:

```js
  function bindAttentionChips() {
    const list = $("#attnList"); if (!list) return;
    const rows = $$(".attn-item", list);
    const preds = {}; ATTN_CHIPS.forEach(([k, l, pred]) => preds[k] = pred);
    $$("[data-achip]").forEach((b) => b.addEventListener("click", () => {
      $$("[data-achip]").forEach((x) => x.classList.remove("on")); b.classList.add("on");
      const pred = preds[b.dataset.achip] || (() => true);
      rows.forEach((r) => { r.style.display = pred({ group: r.dataset.agroup }) ? "" : "none"; });
    }));
  }
  function bindAttentionDismiss() {
    $$("[data-dismiss-sugg]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      (state.dismissedSuggestions ||= {})[b.dataset.dismissSugg] = true;
      render();
    }));
  }
  function bindDashTable() {
```

- [ ] **Step 2: Hook both into `bindDashboard`**

Find this line (currently `m19-sites.js:1833`):

```js
  function bindDashboard() { bindNavTo(); bindSiteCardActions(); bindDashTable(); }
```

Replace it with:

```js
  function bindDashboard() { bindNavTo(); bindSiteCardActions(); bindDashTable(); bindAttentionChips(); bindAttentionDismiss(); }
```

- [ ] **Step 3: Verify chip filtering via the preview tool**

1. `preview_eval: location.reload()`, then `location.hash = "#/dashboard"`.
2. `preview_click` on the chip with text "AI Suggestions" (use `preview_snapshot` first to get its exact selector/uid, e.g. `[data-achip="ai"]`).
3. `preview_snapshot` — confirm only rows with the spark icon (AI-suggestion rows) remain visible; every other row is hidden.
4. `preview_click` on `[data-achip="all"]` — confirm all rows reappear.

- [ ] **Step 4: Verify dismiss + live chip-count update via the preview tool**

1. `preview_snapshot` — note the current count on the "AI Suggestions" chip and the "All" chip (should be 3 total suggestions across s1/s2 per Task 1's mock data, and whatever the "All" total was after Task 2).
2. `preview_click` on the dismiss (✕) button of one AI-suggestion row.
3. `preview_snapshot` — confirm: (a) that row is gone, (b) the "AI Suggestions" chip count decreased by 1, (c) the "All" chip count decreased by 1, (d) no page reload occurred (this is a `render()` call, not a navigation — confirm via `preview_network` that no new document request fired).
4. `preview_eval: location.reload()` then re-check the panel — confirm the dismissed suggestion **reappears** (dismissal is session-only, per spec §6).

---

### Task 6: End-to-end manual verification pass

**Files:** None (verification only — no code changes).

- [ ] **Step 1: Exercise the "pending client review" row**

The default mock data has no site in `reviewBySite === "review"` state, so this row won't appear until a user actually sends a site for review through the existing Publish tab flow. Confirm this works end-to-end:

1. `preview_eval: location.hash = "#/sites/s2"` (Crescent Dental, currently a draft).
2. Navigate to that site's Publish tab (`preview_click` on the Publish nav item, or `preview_eval: (window.location.hash += "")` after setting `state.tab` isn't directly reachable from outside the closure — instead, click the "Publish" per-site nav link in the snapshot).
3. Click whatever control sends the site for review (per existing `data-review="review"` handler at `m19-sites.js:1942`).
4. `preview_eval: location.hash = "#/dashboard"`.
5. `preview_snapshot` — confirm a new "Awaiting client review · Crescent Dental" row now appears under the "Publish & Reviews" chip.

- [ ] **Step 2: Full regression check on the Dashboard**

1. `preview_console_logs` with `level: "all"`, last 50 lines — confirm no new errors or warnings versus a pre-change baseline.
2. `preview_network` with `filter: "failed"` — confirm no failed requests.
3. `preview_resize` to `mobile` (375px), `tablet` (768px), and `desktop` (1280px) — confirm no horizontal scroll at any breakpoint (existing project convention: 0 h-scroll at 375/1200, per memory of prior M19 sessions).
4. `preview_screenshot` at desktop width — final visual confirmation for the user.

- [ ] **Step 3: Report completion**

Summarize to the user: which rows now appear that didn't before (with a screenshot), confirm chip filtering and dismiss behavior work as specified, and confirm no regressions in the existing SSL/health/publish rows or the sites table below the panel.
