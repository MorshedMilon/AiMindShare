# M19 Websites — Hero + Portfolio Fusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-add a hero (AI composer + 6 quick-create cards) to the existing `#/sites` page in `frontend/js/m19-sites.js` (Slice 1), then layer on top of it the full portfolio enrichment from Slice 2 — hero metrics + composer extras, richer `siteCard()`s with a "Details" drawer, an upgraded toolbar (filters, sort, grid/list, saved views, bulk actions, tags/favorites), and a compact "Attention needed" strip — so the Websites page reads as one continuous create → browse → manage flow.

**Architecture:** Everything lives in the existing single-IIFE `frontend/js/m19-sites.js` module (no bundler, no module system). The hero's AI composer is extracted out of `openCreateModal()`'s inline markup into a shared `composerHtml(idPrefix)` + `bindComposer(idPrefix, root, onGenerate)` pair so the same composer renders both inside the modal (`"cm"`) and on the page as the hero (`"hero"`) without id collisions. New per-site mock fields (`client_name`, `niche`, `archived`, 3 new health categories, `MOCK.team`/`MOCK.teamBySite`/`MOCK.metricsBySite`) are added the same way `MOCK.leads`/`MOCK.suggestions` were added in the prior "agency command center" slice — hydrated into `state.*` inside `boot()`'s disconnected branch. The card's new "⋯ More" menu and the toolbar's Filters/Sort/Saved-views menus all reuse the **existing** shared dropdown primitive (`.pop`/`.pop-item`, DESIGN §8.8, already used by the workspace switcher in `m02-roles.js`) via one new small `openPop(anchor, html)` helper (returns the popover element so each caller wires its own item clicks), rather than inventing a new dropdown component. The new per-site "Details" drawer is built and torn down dynamically in JS (appended to `document.body`, own `.dd-scrim`/`.dd-panel` classes) rather than a persistent mounted root, since its content differs per site (unlike the always-mounted Copilot drawer).

**Tech Stack:** Plain IIFE JavaScript (`frontend/js/m19-sites.js`), no bundler, no module system, no test runner exists in this repo (confirmed: no `package.json` anywhere in the project, no `.git` directory). Verification is manual, via the Preview browser tool (`preview_eval` for logic/state checks, `preview_snapshot`/`preview_screenshot`/`preview_inspect` for visual/DOM checks) — there is no automated test suite to run instead.

**Reference specs:**
- `docs/superpowers/specs/2026-07-08-m19-websites-hero-portfolio-design.md` (Slice 1 — hero + quick-create)
- `docs/superpowers/specs/2026-07-08-m19-websites-hero-portfolio-slice2-design.md` (Slice 2 — portfolio enrichment)

---

## Slice 1 — Hero + quick-create

### Task 1: Extract the shared AI composer (`composerHtml` / `bindComposer`) and give `openCreateModal` a `prefill` param

**Files:**
- Modify: `frontend/js/m19-sites.js:1230-1308` (whole `openCreateModal` function)
- Modify: `frontend/js/m19-sites.js:1382` (insert new functions right after `micSvg`)

- [ ] **Step 1: Insert `composerHtml(idPrefix)` and `bindComposer(idPrefix, root, onGenerate)` right after `micSvg`**

Find this line (currently `m19-sites.js:1382`):

```js
  const micSvg = (s = 17) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`;
```

Replace it with:

```js
  const micSvg = (s = 17) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`;
  // Shared AI composer — renders identically inside the create modal ("cm") and as
  // the page-level Websites hero ("hero"); every id is namespaced by idPrefix so
  // both instances can exist in the DOM at once without colliding.
  function composerHtml(idPrefix) {
    const niches = NICHE_OPTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
    const chips = HERO_SUGGESTIONS.map((s) => `<button class="st-chip" data-suggest="${esc(s)}">${s}</button>`).join("");
    return `
      <div class="st-composer" data-composer id="${idPrefix}Composer">
        <textarea id="${idPrefix}Prompt" placeholder="A boutique dental clinic in Dhaka called Crescent Dental — friendly, same-week appointments, online booking…"></textarea>
        <div class="st-comp-bar">
          <button class="cb-btn" data-mic title="Speak your idea">${micSvg(17)}</button>
          <span class="cb-hint">A detailed paragraph gives the best result</span>
          <span class="spacer"></span>
          <button class="cb-send" id="${idPrefix}Generate">${svg("spark", 16)} Generate website</button>
        </div>
      </div>
      <div class="cm-tuners">
        <select class="gen-select" id="${idPrefix}Niche" title="Business type">${niches}</select>
        <select class="gen-select" id="${idPrefix}Style" title="Visual style"><option value="">Auto style</option><option value="minimal">Minimal</option><option value="bold">Bold</option><option value="elegant">Elegant</option></select>
        <select class="gen-select" id="${idPrefix}Lang" title="Language"><option value="en">English</option><option value="bn">Bengali</option><option value="ar">Arabic</option></select>
      </div>
      <div class="st-suggest" id="${idPrefix}Suggest">${chips}</div>`;
  }
  // Wires focus styling, mic, Ctrl/Cmd+Enter submit, suggestion chips and Generate
  // for one composerHtml(idPrefix) instance. onGenerate(desc, niche) runs on submit;
  // it decides what "generate" means for that instance (open+prefill vs. close+create).
  function bindComposer(idPrefix, root, onGenerate) {
    const comp = $(`#${idPrefix}Composer`, root), ta = $(`#${idPrefix}Prompt`, root);
    ta.addEventListener("focus", () => comp.classList.add("focus"));
    ta.addEventListener("blur", () => comp.classList.remove("focus"));
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $(`#${idPrefix}Generate`, root).click(); });
    $("[data-mic]", comp)?.addEventListener("click", () => micTo(ta));
    $$("[data-suggest]", root).forEach((b) => b.addEventListener("click", () => { ta.value = HERO_SAMPLES[b.dataset.suggest] || b.dataset.suggest; ta.focus(); }));
    $(`#${idPrefix}Generate`, root).onclick = () => {
      const desc = (ta.value || "").trim();
      if (!desc) { ta.focus(); toast("Describe your business first — one sentence is enough.", "info"); return; }
      onGenerate(desc, $(`#${idPrefix}Niche`, root)?.value || "agency");
    };
  }
```

- [ ] **Step 2: Replace the whole `openCreateModal` function to use `composerHtml("cm")` / `bindComposer("cm", ...)` and accept a `prefill` param**

Find this block (currently `m19-sites.js:1228-1308`):

```js
  // The single creation surface — every "create" entry point opens this. Five
  // inline paths (AI / Blank / Template / Import / Clone); no separate pages.
  function openCreateModal(tab) {
    tab = tab || "ai";
    const niches = NICHE_OPTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
    const tmpls = studioTemplates().slice(0, 8).map(miniTpl).join("");
    const chips = HERO_SUGGESTIONS.map((s) => `<button class="st-chip" data-suggest="${esc(s)}">${s}</button>`).join("");
    const TABS = [["ai", "spark", "Create with AI"], ["blank", "doc", "Blank"], ["tpl", "layers", "Template"], ["import", "download", "Import"], ["clone", "copy", "Clone URL"]];
    const tabsHtml = TABS.map(([k, ic, l]) => `<button class="imp-tab ${k === tab ? "on" : ""}" data-ct="${k}">${svg(ic, 14)} ${l}</button>`).join("");
    const m = el("div", "modal-card create-modal", `
      <div class="modal-head"><h3>${svg("spark", 18)} Create a new website</h3><button class="icon-btn" data-close>${svg("x", 16)}</button></div>
      <div class="imp-tabs cm-tabs">${tabsHtml}</div>
      <div class="imp-pane ${tab === "ai" ? "on" : ""}" data-ctpane="ai">
        <div class="st-composer" data-composer>
          <textarea id="createPrompt" placeholder="A boutique dental clinic in Dhaka called Crescent Dental — friendly, same-week appointments, online booking…"></textarea>
          <div class="st-comp-bar">
            <button class="cb-btn" data-mic title="Speak your idea">${micSvg(17)}</button>
            <span class="cb-hint">A detailed paragraph gives the best result</span>
            <span class="spacer"></span>
            <button class="cb-send" id="cmGenerate">${svg("spark", 16)} Generate website</button>
          </div>
        </div>
        <div class="cm-tuners">
          <select class="gen-select" id="cmNiche" title="Business type">${niches}</select>
          <select class="gen-select" id="cmStyle" title="Visual style"><option value="">Auto style</option><option value="minimal">Minimal</option><option value="bold">Bold</option><option value="elegant">Elegant</option></select>
          <select class="gen-select" id="cmLang" title="Language"><option value="en">English</option><option value="bn">Bengali</option><option value="ar">Arabic</option></select>
        </div>
        <div class="st-suggest">${chips}</div>
      </div>
      <div class="imp-pane ${tab === "blank" ? "on" : ""}" data-ctpane="blank">
        <div class="field"><label class="label">Site name</label><input class="input" id="cmBlankName" placeholder="Acme Co"></div>
        <p class="cm-note">${svg("doc", 15)}<span>Starts an empty canvas — add sections and pages in the visual editor.</span></p>
        <div class="modal-foot"><button class="btn btn-primary" id="cmBlankGo">${svg("plus", 14)} Create blank site</button></div>
      </div>
      <div class="imp-pane ${tab === "tpl" ? "on" : ""}" data-ctpane="tpl">
        <p class="cm-note">${svg("layers", 15)}<span>Pick a professional layout — it seeds your first page, fully editable.</span></p>
        <div class="cm-tpl-grid">${tmpls}</div>
      </div>
      <div class="imp-pane ${tab === "import" ? "on" : ""}" data-ctpane="import">
        <div class="field"><label class="label">Site name</label><input class="input" id="cmImpName" placeholder="Imported site"></div>
        <div class="field"><label class="label">Paste HTML</label><textarea class="input" id="cmImpHtml" rows="6" placeholder="&lt;section&gt;…your existing markup…&lt;/section&gt;"></textarea><span class="help">Paste raw HTML to import it into a new editable page. React / Next.js import arrives with the AI provider — flagged, not faked.</span></div>
        <div class="modal-foot"><button class="btn btn-primary" id="cmImpGo">${svg("download", 14)} Import as site</button></div>
      </div>
      <div class="imp-pane ${tab === "clone" ? "on" : ""}" data-ctpane="clone">
        <div class="scaffold-note">${svg("globe", 16)}<div><b>Clone from a URL</b><p class="muted">Paste a site to mirror its structure and palette into an editable draft. Cross-origin cloning runs server-side and arrives with the AI provider — flagged, not faked.</p></div></div>
        <div class="field" style="margin-top:12px"><label class="label">Website URL</label><input class="input" id="cmCloneUrl" placeholder="https://example.com"></div>
        <div class="modal-foot"><button class="btn btn-primary" id="cmCloneGo">${svg("copy", 14)} Clone site</button></div>
      </div>`);
    openModal(m);
    // Tab switching
    $$(".cm-tabs .imp-tab", m).forEach((b) => b.onclick = () => {
      $$(".cm-tabs .imp-tab", m).forEach((x) => x.classList.remove("on")); b.classList.add("on");
      $$(".imp-pane", m).forEach((p) => p.classList.toggle("on", p.dataset.ctpane === b.dataset.ct));
    });
    // AI: focus styling + mic + suggestions + generate
    const comp = $("[data-composer]", m), ta = $("#createPrompt", m);
    ta.addEventListener("focus", () => comp.classList.add("focus"));
    ta.addEventListener("blur", () => comp.classList.remove("focus"));
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("#cmGenerate", m).click(); });
    $("[data-mic]", m)?.addEventListener("click", () => micTo(ta));
    $$("[data-suggest]", m).forEach((b) => b.addEventListener("click", () => { ta.value = HERO_SAMPLES[b.dataset.suggest] || b.dataset.suggest; ta.focus(); }));
    $("#cmGenerate", m).onclick = () => {
      const desc = (ta.value || "").trim();
      if (!desc) { ta.focus(); toast("Describe your business first — one sentence is enough.", "info"); return; }
      closeModal(); createSiteFromAI(desc, $("#cmNiche", m).value || "agency");
    };
    // Blank
    $("#cmBlankGo", m).onclick = () => { closeModal(); createSite(($("#cmBlankName", m).value || "Untitled site").trim(), "blank"); };
    // Template — reuse the gallery binder, then close the modal on "use"
    bindTemplateCards(m);
    $$("[data-use-tpl]", m).forEach((b) => b.addEventListener("click", closeModal));
    // Import
    $("#cmImpGo", m).onclick = () => {
      const name = ($("#cmImpName", m).value || "Imported site").trim();
      const html = $("#cmImpHtml", m).value.trim();
      if (!html) { $("#cmImpHtml", m).focus(); toast("Paste some HTML to import.", "info"); return; }
      closeModal(); createSiteFromHtml(name, html);
    };
    // Clone
    $("#cmCloneGo", m).onclick = () => { const u = $("#cmCloneUrl", m).value.trim(); if (!u) { $("#cmCloneUrl", m).focus(); return; } closeModal(); toast("URL cloning runs with the AI provider — flagged, not faked.", "info"); };
  }
```

Replace it with:

```js
  // The single creation surface — every "create" entry point opens this. Five
  // inline paths (AI / Blank / Template / Import / Clone); no separate pages.
  // `prefill`, when set, seeds the AI tab's textarea (used by the page-level hero).
  function openCreateModal(tab, prefill) {
    tab = tab || "ai";
    const tmpls = studioTemplates().slice(0, 8).map(miniTpl).join("");
    const TABS = [["ai", "spark", "Create with AI"], ["blank", "doc", "Blank"], ["tpl", "layers", "Template"], ["import", "download", "Import"], ["clone", "copy", "Clone URL"]];
    const tabsHtml = TABS.map(([k, ic, l]) => `<button class="imp-tab ${k === tab ? "on" : ""}" data-ct="${k}">${svg(ic, 14)} ${l}</button>`).join("");
    const m = el("div", "modal-card create-modal", `
      <div class="modal-head"><h3>${svg("spark", 18)} Create a new website</h3><button class="icon-btn" data-close>${svg("x", 16)}</button></div>
      <div class="imp-tabs cm-tabs">${tabsHtml}</div>
      <div class="imp-pane ${tab === "ai" ? "on" : ""}" data-ctpane="ai">
        ${composerHtml("cm")}
      </div>
      <div class="imp-pane ${tab === "blank" ? "on" : ""}" data-ctpane="blank">
        <div class="field"><label class="label">Site name</label><input class="input" id="cmBlankName" placeholder="Acme Co"></div>
        <p class="cm-note">${svg("doc", 15)}<span>Starts an empty canvas — add sections and pages in the visual editor.</span></p>
        <div class="modal-foot"><button class="btn btn-primary" id="cmBlankGo">${svg("plus", 14)} Create blank site</button></div>
      </div>
      <div class="imp-pane ${tab === "tpl" ? "on" : ""}" data-ctpane="tpl">
        <p class="cm-note">${svg("layers", 15)}<span>Pick a professional layout — it seeds your first page, fully editable.</span></p>
        <div class="cm-tpl-grid">${tmpls}</div>
      </div>
      <div class="imp-pane ${tab === "import" ? "on" : ""}" data-ctpane="import">
        <div class="field"><label class="label">Site name</label><input class="input" id="cmImpName" placeholder="Imported site"></div>
        <div class="field"><label class="label">Paste HTML</label><textarea class="input" id="cmImpHtml" rows="6" placeholder="&lt;section&gt;…your existing markup…&lt;/section&gt;"></textarea><span class="help">Paste raw HTML to import it into a new editable page. React / Next.js import arrives with the AI provider — flagged, not faked.</span></div>
        <div class="modal-foot"><button class="btn btn-primary" id="cmImpGo">${svg("download", 14)} Import as site</button></div>
      </div>
      <div class="imp-pane ${tab === "clone" ? "on" : ""}" data-ctpane="clone">
        <div class="scaffold-note">${svg("globe", 16)}<div><b>Clone from a URL</b><p class="muted">Paste a site to mirror its structure and palette into an editable draft. Cross-origin cloning runs server-side and arrives with the AI provider — flagged, not faked.</p></div></div>
        <div class="field" style="margin-top:12px"><label class="label">Website URL</label><input class="input" id="cmCloneUrl" placeholder="https://example.com"></div>
        <div class="modal-foot"><button class="btn btn-primary" id="cmCloneGo">${svg("copy", 14)} Clone site</button></div>
      </div>`);
    openModal(m);
    if (prefill) $("#cmPrompt", m).value = prefill;
    // Tab switching
    $$(".cm-tabs .imp-tab", m).forEach((b) => b.onclick = () => {
      $$(".cm-tabs .imp-tab", m).forEach((x) => x.classList.remove("on")); b.classList.add("on");
      $$(".imp-pane", m).forEach((p) => p.classList.toggle("on", p.dataset.ctpane === b.dataset.ct));
    });
    // AI composer — shared with the page-level hero via composerHtml/bindComposer
    bindComposer("cm", m, (desc, niche) => { closeModal(); createSiteFromAI(desc, niche); });
    // Blank
    $("#cmBlankGo", m).onclick = () => { closeModal(); createSite(($("#cmBlankName", m).value || "Untitled site").trim(), "blank"); };
    // Template — reuse the gallery binder, then close the modal on "use"
    bindTemplateCards(m);
    $$("[data-use-tpl]", m).forEach((b) => b.addEventListener("click", closeModal));
    // Import
    $("#cmImpGo", m).onclick = () => {
      const name = ($("#cmImpName", m).value || "Imported site").trim();
      const html = $("#cmImpHtml", m).value.trim();
      if (!html) { $("#cmImpHtml", m).focus(); toast("Paste some HTML to import.", "info"); return; }
      closeModal(); createSiteFromHtml(name, html);
    };
    // Clone
    $("#cmCloneGo", m).onclick = () => { const u = $("#cmCloneUrl", m).value.trim(); if (!u) { $("#cmCloneUrl", m).focus(); return; } closeModal(); toast("URL cloning runs with the AI provider — flagged, not faked.", "info"); };
  }
```

- [ ] **Step 3: Verify via the preview tool**

1. `preview_start` for the `frontend/` static site (or confirm it's already running), then `preview_eval: location.reload()`.
2. `preview_eval: location.hash = "#/sites"`.
3. `preview_click` on the "New site" button (`#newSite`) to open the create modal.
4. `preview_snapshot` — confirm the AI tab's composer still renders (textarea, mic button, "Generate website" button, tuners, suggestion chips) — same as before the refactor, just with `id="cmPrompt"` / `id="cmGenerate"` instead of `id="createPrompt"`.
5. `preview_fill` on `#cmPrompt` with `"A test bakery site"`, `preview_click` on `#cmGenerate` — confirm the modal closes and a new site is created (mockup toast "Site created" or similar, and the app navigates into the new site) exactly as it did before this refactor.
6. `preview_console_logs` with `level: "error"` — expect empty output.

- [ ] **Step 4: Commit is not applicable**

This project is not a git repository (confirmed: no `.git` directory). Skip the commit step for every task in this plan — there is nothing to commit to. Move directly to the next task after each verification step passes.

---

### Task 2: `sitesHero()` — the page's AI composer hero

**Files:**
- Modify: `frontend/js/m19-sites.js` (add new function `sitesHero()` near `sitesHead()`, currently `m19-sites.js:455-464`)

- [ ] **Step 1: Add `sitesHero()` right before `sitesHead()`**

Find this line (currently `m19-sites.js:455-456`):

```js
  // Websites — the visual card portfolio (browse + open + operate). Operational
  // health/attention lives on the Dashboard; creation lives in the create modal.
  function sitesHead(sites) {
```

Replace it with:

```js
  // Hero — the page's one big headline + AI composer. It never generates a site
  // directly: it only opens/prefills the same openCreateModal() every other
  // creation entry point uses, so there is exactly one generation path.
  function sitesHero() {
    return `<div class="st-hero reveal">
      <div class="st-hero-in">
        <span class="st-eyebrow">${svg("spark", 12)} AI-powered website builder</span>
        <h1>Build websites <em>with AI</em></h1>
        <p class="st-lead">Describe the business in one paragraph and AI drafts a complete, on-brand website — pages, copy, SEO and schema included. Refine it in the visual editor before you publish.</p>
        ${composerHtml("hero")}
        <button class="st-link" id="heroBlank" style="margin-top:14px">${svg("doc", 13)} Prefer a blank canvas? Start a new site</button>
      </div>
    </div>`;
  }
  // Websites — the visual card portfolio (browse + open + operate). Operational
  // health/attention lives on the Dashboard; creation lives in the create modal.
  function sitesHead(sites) {
```

- [ ] **Step 2: Verify via the preview tool**

1. `preview_eval: location.reload()`, then `preview_eval: location.hash = "#/sites"`.
2. `preview_console_logs` with `level: "error"` — expect empty output (this step only adds the function; it isn't called from `viewSites()` yet, so the page is unchanged until Task 4).

---

### Task 3: `sitesQuickCreate()` — 6 quick-create cards

**Files:**
- Modify: `frontend/js/m19-sites.js` (add new function `sitesQuickCreate()` right after `sitesHero()`, added in Task 2)

- [ ] **Step 1: Add `sitesQuickCreate()` right after `sitesHero()`**

Find this line (the closing of `sitesHero()`, added in Task 2):

```js
        ${composerHtml("hero")}
        <button class="st-link" id="heroBlank" style="margin-top:14px">${svg("doc", 13)} Prefer a blank canvas? Start a new site</button>
      </div>
    </div>`;
  }
  // Websites — the visual card portfolio (browse + open + operate). Operational
  // health/attention lives on the Dashboard; creation lives in the create modal.
  function sitesHead(sites) {
```

Replace it with:

```js
        ${composerHtml("hero")}
        <button class="st-link" id="heroBlank" style="margin-top:14px">${svg("doc", 13)} Prefer a blank canvas? Start a new site</button>
      </div>
    </div>`;
  }
  // Six quick-create cards — second doors into the same openCreateModal(). "Continue
  // Recent" is omitted entirely when there are no sites yet (nothing to continue).
  function sitesQuickCreate() {
    const sites = state.sites || [];
    const recent = sites.length ? sites.reduce((a, b) => new Date(b.updated_at) > new Date(a.updated_at) ? b : a) : null;
    const cards = [
      ["ai", "spark", "Create with AI", "Describe your business — AI builds the whole site.", "qa-ai"],
      ["blank", "doc", "Start from Blank", "An empty canvas — add sections yourself.", ""],
      ["templates", "layers", "Browse Templates", "60+ professional starter layouts.", ""],
      ["import", "download", "Import a Website", "Paste existing HTML into an editable page.", ""],
      ["clone", "copy", "Clone a Website", "Mirror a URL's structure and palette.", ""],
    ];
    if (recent) cards.push(["recent", "clock", "Continue Recent", `Pick up where you left off on ${esc(recent.name)}.`, ""]);
    return `<div class="st-quick reveal">${cards.map(([act, ico, label, desc, cls]) =>
      `<button class="qa-card ${cls}" data-qcard="${act}"${act === "recent" ? ` data-recent-id="${esc(recent.id)}"` : ""}><span class="qa-ico">${svg(ico, 18)}</span><b>${label}</b><span>${desc}</span></button>`).join("")}</div>`;
  }
  // Websites — the visual card portfolio (browse + open + operate). Operational
  // health/attention lives on the Dashboard; creation lives in the create modal.
  function sitesHead(sites) {
```

- [ ] **Step 2: Verify via the preview tool**

1. `preview_eval: location.reload()`, then `preview_eval: location.hash = "#/sites"`.
2. `preview_console_logs` with `level: "error"` — expect empty output (this step only adds the function; it isn't called yet, so the page is still unchanged until Task 4).

---

### Task 4: Wire the hero + quick-create into `viewSites()`, demote the portfolio heading, remove the old empty-state branch

**Files:**
- Modify: `frontend/js/m19-sites.js:457-492` (`sitesHead` heading + `viewSites`)
- Modify: `frontend/styles/m19-studio.css` (add `.dash-head h2` styling near `.dash-head`, currently around line 318-327)

- [ ] **Step 1: Demote `sitesHead()`'s heading from `<h1>` to `<h2>`**

Find this block (currently `m19-sites.js:457-464`):

```js
  function sitesHead(sites) {
    return `<div class="dash-head reveal">
      <div class="dh-l"><span class="st-eyebrow">${svg("globe", 12)} Websites</span>
        <h1>Your <em>portfolio</em></h1>
        <p class="dh-lead">Every website in this workspace${sites.length ? ` — ${sites.length} site${sites.length === 1 ? "" : "s"}` : ""}.</p></div>
      <div class="dh-actions"><button class="btn btn-primary" id="newSite">${svg("plus", 14)} New site</button></div>
    </div>`;
  }
```

Replace it with:

```js
  function sitesHead(sites) {
    return `<div class="dash-head reveal">
      <div class="dh-l"><span class="st-eyebrow">${svg("globe", 12)} Websites</span>
        <h2>Your <em>portfolio</em></h2>
        <p class="dh-lead">Every website in this workspace${sites.length ? ` — ${sites.length} site${sites.length === 1 ? "" : "s"}` : ""}.</p></div>
      <div class="dh-actions"><button class="btn btn-primary" id="newSite">${svg("plus", 14)} New site</button></div>
    </div>`;
  }
```

- [ ] **Step 2: Replace `viewSites()` — render the hero + quick-create unconditionally, remove the standalone empty-state branch**

Find this block (currently `m19-sites.js:465-492`):

```js
  function viewSites() {
    if (stp("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    if (stp("error") || state.error) return previewStrip() + pageHead("Websites", "AI-built websites, published to the web.") + errorBlock(state.error);
    const sites = stp("empty") ? [] : state.sites;
    if (!sites.length) {
      return previewStrip() + `<div class="studio">${sitesHead(sites)}
        <div class="panel reveal"><div class="empty-state"><div class="es-ico">${svg("globe", 22)}</div>
          <h3>No websites yet</h3><p>Create your first AI-built site — it lands here with full publish, domain, SEO and analytics controls.</p>
          <button class="btn btn-primary es-cta" id="newSite2">${svg("plus", 14)} Create your first site</button></div></div></div>`;
    }
    const items = attentionItems(sites);
    const attnIds = new Set(items.filter((a) => a.sev !== "opp").map((a) => a.site && a.site.id).filter(Boolean));
    const live = sites.filter((s) => s.status === "published").length;
    const draft = sites.filter((s) => s.status === "draft").length;
    const chips = [["all", "All", sites.length], ["published", "Live", live], ["draft", "Drafts", draft], ["attn", "Needs action", attnIds.size]]
      .map(([k, l, n], i) => `<button class="dt-chip ${i === 0 ? "on" : ""}" data-schip="${k}">${l} <span class="dc-n">${n}</span></button>`).join("");
    return previewStrip() + `<div class="studio">
      ${sitesHead(sites)}
      <section class="st-sec reveal">
        <div class="dt-toolbar">
          <label class="dt-search">${svg("search", 15)}<input id="sitesSearch" placeholder="Filter websites by name…" autocomplete="off"></label>
          <div class="dt-chips">${chips}</div>
        </div>
        <div class="site-grid" id="sitesGrid">${sites.map((s) => siteCard(s, attnIds.has(s.id))).join("")}</div>
        <div class="empty-inline" id="sitesEmpty" style="display:none">No websites match this filter.</div>
      </section>
    </div>`;
  }
```

Replace it with:

```js
  function viewSites() {
    if (stp("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    if (stp("error") || state.error) return previewStrip() + pageHead("Websites", "AI-built websites, published to the web.") + errorBlock(state.error);
    const sites = stp("empty") ? [] : state.sites;
    const items = attentionItems(sites);
    const attnIds = new Set(items.filter((a) => a.sev !== "opp").map((a) => a.site && a.site.id).filter(Boolean));
    const live = sites.filter((s) => s.status === "published").length;
    const draft = sites.filter((s) => s.status === "draft").length;
    const chips = [["all", "All", sites.length], ["published", "Live", live], ["draft", "Drafts", draft], ["attn", "Needs action", attnIds.size]]
      .map(([k, l, n], i) => `<button class="dt-chip ${i === 0 ? "on" : ""}" data-schip="${k}">${l} <span class="dc-n">${n}</span></button>`).join("");
    return previewStrip() + `<div class="studio">
      ${sitesHero()}
      ${sitesQuickCreate()}
      ${sitesHead(sites)}
      <section class="st-sec reveal">
        <div class="dt-toolbar">
          <label class="dt-search">${svg("search", 15)}<input id="sitesSearch" placeholder="Filter websites by name…" autocomplete="off"></label>
          <div class="dt-chips">${chips}</div>
        </div>
        <div class="site-grid" id="sitesGrid">${sites.map((s) => siteCard(s, attnIds.has(s.id))).join("")}</div>
        <div class="empty-inline" id="sitesEmpty" style="${sites.length ? "display:none" : ""}">${sites.length ? "No websites match this filter." : "No websites yet — create your first one above."}</div>
      </section>
    </div>`;
  }
```

- [ ] **Step 3: Add CSS so the demoted `<h2>` still reads like a section heading**

Find this line (currently `m19-studio.css:327`):

```css
.dash-head .dh-actions{display:flex;gap:10px;flex:none}
```

Replace it with:

```css
.dash-head .dh-actions{display:flex;gap:10px;flex:none}
.dash-head h2{font-size:21px;letter-spacing:-.01em;margin:12px 0 0}
.dash-head h2 em{color:var(--gold-500);font-style:italic;font-weight:500}
```

- [ ] **Step 4: Verify via the preview tool**

1. `preview_eval: location.reload()`, then `preview_eval: location.hash = "#/sites"`.
2. `preview_snapshot` — confirm the page reads top to bottom: eyebrow "AI-powered website builder", `<h1>` "Build websites with AI", composer, "Prefer a blank canvas?" link, then 6 quick-create cards, then the smaller "Your portfolio" heading, then the toolbar + site-card grid.
3. `preview_inspect` on the "Your portfolio" heading with `styles: ["font-size"]` — confirm it renders around `21px`, not an unstyled browser-default `h2` size.
4. `preview_console_logs` with `level: "error"` — expect empty output.
5. `preview_eval: location.hash = "#/dashboard"` then `preview_screenshot` — confirm the Command center dashboard is visually unchanged (no `sitesHero`/`sitesQuickCreate` calls were added there).

---

### Task 5: Wire click handlers — hero generate/blank-canvas, quick-create cards

**Files:**
- Modify: `frontend/js/m19-sites.js:2008-2014` (`bindSites`)

- [ ] **Step 1: Replace `bindSites()`**

Find this block (currently `m19-sites.js:2008-2014`):

```js
  function bindSites() {
    bindNavTo();
    $("#newSite")?.addEventListener("click", () => openCreateModal());
    $("#newSite2")?.addEventListener("click", () => openCreateModal());
    bindSiteCardActions();
    bindSitesFilter();
  }
```

Replace it with:

```js
  function bindSites() {
    bindNavTo();
    $("#newSite")?.addEventListener("click", () => openCreateModal());
    bindSiteCardActions();
    bindSitesFilter();
    // Hero composer — Generate opens the create modal on the AI tab, prefilled
    // (nothing to close first — the hero isn't itself a generation path).
    bindComposer("hero", document, (desc) => openCreateModal("ai", desc));
    $("#heroBlank")?.addEventListener("click", () => openCreateModal("blank"));
    $$("[data-qcard]").forEach((b) => b.addEventListener("click", () => {
      const act = b.dataset.qcard;
      if (act === "templates") location.hash = "#/templates";
      else if (act === "recent") location.hash = "#/sites/" + b.dataset.recentId;
      else openCreateModal(act);
    }));
  }
```

(`#newSite2` was the old standalone empty-state panel's "Create your first site" button, deleted in Task 4 — its binding is removed here since the element no longer exists.)

- [ ] **Step 2: Verify via the preview tool**

1. `preview_eval: location.reload()`, then `preview_eval: location.hash = "#/sites"`.
2. `preview_fill` on `#heroPrompt` with `"A modern coffee roastery site"`, `preview_click` on `#heroGenerate` — confirm the create modal opens on the AI tab and `preview_eval: document.querySelector("#cmPrompt").value` returns `"A modern coffee roastery site"`.
3. Close the modal, `preview_click` on one of the hero's suggestion chips (`[data-suggest]` inside `#heroSuggest`) — confirm `#heroPrompt`'s value fills with the matching `HERO_SAMPLES` text.
4. `preview_click` on `#heroBlank` — confirm the create modal opens on the Blank tab.
5. Close the modal. `preview_click` on each quick-create card in turn (`[data-qcard="ai"]`, `="blank"`, `="templates"`, `="import"`, `="clone"`, `="recent"`) — confirm: the first four/five open the create modal on the matching tab (or the templates card navigates to `#/templates`), and `="recent"` navigates to `#/sites/{most-recently-updated-site-id}`.
6. `preview_eval: (() => { state.previewState = "empty"; })()` is not reachable from outside the closure — instead `preview_click` the "empty" preview-state button in the mock-mode strip at the top of the page, then `preview_snapshot` — confirm the hero and quick-create row still render, the "Continue Recent" card is absent, and the grid area shows "No websites yet — create your first one above." instead of a second CTA panel.
7. `preview_console_logs` with `level: "error"` — expect empty output.

---

### Task 6: Slice 1 end-to-end verification pass

**Files:** None (verification only — no code changes).

- [ ] **Step 1: Full regression check on `#/sites`**

1. `preview_click` the "default" preview-state button to restore normal mock data, then `preview_eval: location.reload()`.
2. `preview_resize` to `mobile` (375px) — `preview_screenshot` and confirm no horizontal scroll (check `document.documentElement.scrollWidth` via `preview_eval` equals `document.documentElement.clientWidth`).
3. `preview_resize` to `desktop` (1200px) — repeat the same h-scroll check.
4. `preview_resize` back to `desktop` (1280px), toggle dark mode via the theme button (`#themeToggle`) — `preview_screenshot` and confirm the hero's gradient-italic `<em>` text and quick-create cards render correctly in dark mode (no invisible/low-contrast text).
5. `preview_console_logs` with `level: "all"`, last 50 lines — confirm no new errors or warnings.
6. `preview_eval: location.hash = "#/dashboard"`, `preview_screenshot` — confirm the Command center dashboard is pixel-for-pixel unchanged from before this plan (KPIs, attention panel, sites table, publishing queue, quick actions all present and unaffected).

- [ ] **Step 2: Report completion**

Summarize to the user: hero + quick-create now render above the (demoted) portfolio toolbar and grid on `#/sites`, all quick-create entry points route into the single `openCreateModal()`, the empty-state panel was removed in favor of the hero always showing, and the Dashboard is unaffected. Slice 1 is now a complete, working, testable increment — Slice 2 builds on top of it starting at Task 7.

---

## Slice 2 — Portfolio enrichment

Everything below assumes Slice 1 (Tasks 1–6) has already landed — `composerHtml()`, `bindComposer()`, `sitesHero()`, `sitesQuickCreate()` and the trimmed `sitesHead()` all exist and are wired into `viewSites()` / `bindSites()` exactly as Task 4/5 left them.

### Task 7: New mock data — team, per-site fields, 3 new health categories, synthetic metrics

**Files:**
- Modify: `frontend/js/m19-sites.js:86-90` (`MOCK.sites`)
- Modify: `frontend/js/m19-sites.js:142-168` (`MOCK.health`)
- Modify: `frontend/js/m19-sites.js:178-187` (insert after `suggestions`, before `MOCK`'s `return`)
- Modify: `frontend/js/m19-sites.js:192-200` (`state`)
- Modify: `frontend/js/m19-sites.js:252-258` (`boot()` disconnected branch)

- [ ] **Step 1: Add `client_name` / `niche` / `archived` to each mock site**

Find this block (currently `m19-sites.js:86-90`):

```js
    const sites = [
      { id: "s1", name: "Northstar Agency", subdomain: "northstar", status: "published", pages: 4, primary_domain: "northstaragency.com", updated_at: "2026-06-30T10:00:00Z", favicon_url: "", preview_token: "amspt7f3a9c2b1e", style_preset: "", maintenance_mode: false, language: "en", last_version: 3, last_published: "2026-06-30T10:00:00Z", sessions_7d: 268, traffic: [22, 31, 28, 44, 39, 52, 52], health_score: 92 },
      { id: "s2", name: "Crescent Dental", subdomain: "crescent-dental", status: "draft", pages: 2, primary_domain: null, updated_at: "2026-07-02T14:00:00Z", favicon_url: "", preview_token: "amspt1a2b3c4d5e", style_preset: "islamic", maintenance_mode: false, language: "bn", last_version: null, last_published: null, sessions_7d: 0, traffic: [], health_score: 61 },
      { id: "s3", name: "Zenith Coaching", subdomain: "zenith", status: "published", pages: 3, primary_domain: "zenithcoaching.io", updated_at: "2026-06-28T09:00:00Z", favicon_url: "", preview_token: "amspt9e8d7c6b5a", style_preset: "elegant", maintenance_mode: true, language: "en", last_version: 7, last_published: "2026-06-28T09:00:00Z", sessions_7d: 144, traffic: [30, 26, 18, 24, 12, 9, 25], health_score: 78 },
    ];
```

Replace it with:

```js
    const sites = [
      { id: "s1", name: "Northstar Agency", subdomain: "northstar", status: "published", pages: 4, primary_domain: "northstaragency.com", updated_at: "2026-06-30T10:00:00Z", favicon_url: "", preview_token: "amspt7f3a9c2b1e", style_preset: "", maintenance_mode: false, language: "en", last_version: 3, last_published: "2026-06-30T10:00:00Z", sessions_7d: 268, traffic: [22, 31, 28, 44, 39, 52, 52], health_score: 92, niche: "agency", archived: false },
      { id: "s2", name: "Crescent Dental", subdomain: "crescent-dental", status: "draft", pages: 2, primary_domain: null, updated_at: "2026-07-02T14:00:00Z", favicon_url: "", preview_token: "amspt1a2b3c4d5e", style_preset: "islamic", maintenance_mode: false, language: "bn", last_version: null, last_published: null, sessions_7d: 0, traffic: [], health_score: 61, client_name: "Dr. Amina Chowdhury", niche: "dentist", archived: false },
      { id: "s3", name: "Zenith Coaching", subdomain: "zenith", status: "published", pages: 3, primary_domain: "zenithcoaching.io", updated_at: "2026-06-28T09:00:00Z", favicon_url: "", preview_token: "amspt9e8d7c6b5a", style_preset: "elegant", maintenance_mode: true, language: "en", last_version: 7, last_published: "2026-06-28T09:00:00Z", sessions_7d: 144, traffic: [30, 26, 18, 24, 12, 9, 25], health_score: 78, client_name: "Zenith Coaching LLC", niche: "coach", archived: false },
    ];
```

(`s1` has no `client_name` on purpose — it exercises the "falls back to `s.name`" rule from the spec. `niche` values are existing `NICHE_OPTS` keys, no new taxonomy.)

- [ ] **Step 2: Add 3 new health categories (security / conversion / content) to every mock site**

Find this block (currently `m19-sites.js:142-168`):

```js
    const health = {
      s1: { score: 92, updated_at: "2026-06-30T10:00:00Z", categories: [
        { key: "seo", label: "SEO", status: "pass", detail: "All 4 pages have title + meta description" },
        { key: "schema", label: "Schema", status: "pass", detail: "LocalBusiness + FAQPage valid" },
        { key: "a11y", label: "Accessibility", status: "warn", detail: "2 images missing alt text" },
        { key: "perf", label: "Performance", status: "pass", detail: "Est. LCP 1.9s · no oversized images" },
        { key: "links", label: "Broken links", status: "pass", detail: "0 broken internal links" },
        { key: "fields", label: "Required fields", status: "pass", detail: "Favicon, OG image, canonical set" },
      ] },
      s2: { score: 61, updated_at: "2026-07-02T14:00:00Z", categories: [
        { key: "seo", label: "SEO", status: "fail", detail: "2 pages missing meta description" },
        { key: "schema", label: "Schema", status: "warn", detail: "No LocalBusiness schema on home" },
        { key: "a11y", label: "Accessibility", status: "warn", detail: "Low contrast on 1 button" },
        { key: "perf", label: "Performance", status: "pass", detail: "Est. LCP 2.1s" },
        { key: "links", label: "Broken links", status: "pass", detail: "0 broken internal links" },
        { key: "fields", label: "Required fields", status: "fail", detail: "No OG image · no favicon" },
      ] },
      s3: { score: 78, updated_at: "2026-06-28T09:00:00Z", categories: [
        { key: "seo", label: "SEO", status: "pass", detail: "Titles + descriptions present" },
        { key: "schema", label: "Schema", status: "pass", detail: "Service schema valid" },
        { key: "a11y", label: "Accessibility", status: "pass", detail: "No issues found" },
        { key: "perf", label: "Performance", status: "warn", detail: "1 hero image over 400KB" },
        { key: "links", label: "Broken links", status: "warn", detail: "1 external link 404s" },
        { key: "fields", label: "Required fields", status: "pass", detail: "All set" },
      ] },
    };
```

Replace it with:

```js
    const health = {
      s1: { score: 92, updated_at: "2026-06-30T10:00:00Z", categories: [
        { key: "seo", label: "SEO", status: "pass", detail: "All 4 pages have title + meta description" },
        { key: "schema", label: "Schema", status: "pass", detail: "LocalBusiness + FAQPage valid" },
        { key: "a11y", label: "Accessibility", status: "warn", detail: "2 images missing alt text" },
        { key: "perf", label: "Performance", status: "pass", detail: "Est. LCP 1.9s · no oversized images" },
        { key: "links", label: "Broken links", status: "pass", detail: "0 broken internal links" },
        { key: "fields", label: "Required fields", status: "pass", detail: "Favicon, OG image, canonical set" },
        { key: "security", label: "Security", status: "pass", detail: "HTTPS enforced, no mixed content" },
        { key: "conversion", label: "Conversion", status: "warn", detail: "Homepage CTA click-through is below benchmark" },
        { key: "content", label: "Content", status: "pass", detail: "No stale or thin pages found" },
      ] },
      s2: { score: 61, updated_at: "2026-07-02T14:00:00Z", categories: [
        { key: "seo", label: "SEO", status: "fail", detail: "2 pages missing meta description" },
        { key: "schema", label: "Schema", status: "warn", detail: "No LocalBusiness schema on home" },
        { key: "a11y", label: "Accessibility", status: "warn", detail: "Low contrast on 1 button" },
        { key: "perf", label: "Performance", status: "pass", detail: "Est. LCP 2.1s" },
        { key: "links", label: "Broken links", status: "pass", detail: "0 broken internal links" },
        { key: "fields", label: "Required fields", status: "fail", detail: "No OG image · no favicon" },
        { key: "security", label: "Security", status: "fail", detail: "Site not yet published — HTTPS unverified" },
        { key: "conversion", label: "Conversion", status: "fail", detail: "No booking CTA on the homepage draft" },
        { key: "content", label: "Content", status: "warn", detail: "Only 2 pages drafted so far" },
      ] },
      s3: { score: 78, updated_at: "2026-06-28T09:00:00Z", categories: [
        { key: "seo", label: "SEO", status: "pass", detail: "Titles + descriptions present" },
        { key: "schema", label: "Schema", status: "pass", detail: "Service schema valid" },
        { key: "a11y", label: "Accessibility", status: "pass", detail: "No issues found" },
        { key: "perf", label: "Performance", status: "warn", detail: "1 hero image over 400KB" },
        { key: "links", label: "Broken links", status: "warn", detail: "1 external link 404s" },
        { key: "fields", label: "Required fields", status: "pass", detail: "All set" },
        { key: "security", label: "Security", status: "warn", detail: "SSL certificate pending on custom domain" },
        { key: "conversion", label: "Conversion", status: "pass", detail: "Booking CTA performing above benchmark" },
        { key: "content", label: "Content", status: "warn", detail: "Home page hasn't changed in 90+ days" },
      ] },
    };
```

- [ ] **Step 3: Add `MOCK.team`, `MOCK.teamBySite` and `MOCK.metricsBySite`, right after `suggestions`**

Find this block (currently `m19-sites.js:178-187`):

```js
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

Replace it with:

```js
    const suggestions = {
      s1: [
        { id: "sg1", title: "Homepage CTA has a low click-through", detail: "Try a stronger, benefit-led headline above the fold." },
      ],
      s2: [
        { id: "sg2", title: "Brand colors drift on the Contact page", detail: "Contact page buttons don't match your Brand Kit primary color." },
        { id: "sg3", title: "Pricing page could convert better", detail: "Add a comparison table — sites with one see higher signup rates." },
      ],
    };
    // Team roster (v3 hero/portfolio slice 2) — used by the hero "Team Members" tile
    // and each card's avatar cluster / "last edited by" line. Mock-only; not persisted.
    const team = [
      { id: "tm1", name: "Aisha Rahman", role: "Owner", initials: "AR", color: "teal" },
      { id: "tm2", name: "Priya Nandi", role: "Designer", initials: "PN", color: "gold" },
      { id: "tm3", name: "Omar Faruk", role: "Developer", initials: "OF", color: "teal" },
      { id: "tm4", name: "Lena Osei", role: "SEO", initials: "LO", color: "gold" },
      { id: "tm5", name: "Marco Diaz", role: "Content writer", initials: "MD", color: "teal" },
      { id: "tm6", name: "Sara Islam", role: "Client", initials: "SI", color: "gold" },
    ];
    const teamBySite = { s1: ["tm1", "tm2", "tm3"], s2: ["tm2", "tm4", "tm6"], s3: ["tm1", "tm5"] };
    // Explicitly synthetic per-site business metrics (Details drawer only) — no real
    // computation behind these, unlike sessions_7d which is a real (mock) traffic number.
    const metricsBySite = {
      s1: { revenue: 18400, bounce_rate: 38, cwv: { lcp: 1.9, cls: 0.04, inp: 120 } },
      s2: { revenue: 0, bounce_rate: 61, cwv: { lcp: 2.6, cls: 0.11, inp: 210 } },
      s3: { revenue: 9200, bounce_rate: 47, cwv: { lcp: 2.1, cls: 0.06, inp: 150 } },
    };
    return { user: { id: "u1", email: "aisha@northstar.agency", name: "Aisha Rahman" }, workspace: { id: "ws", name: "Northstar Agency" }, role: "owner", sites, pages, domains, templates, versions, publishLog, analytics, profiles, health, leads, suggestions, team, teamBySite, metricsBySite };
```

- [ ] **Step 4: Add the new state fields (team/portfolio-toolbar state)**

Find this block (currently `m19-sites.js:192-200`):

```js
  const state = {
    loaded: false, loading: false, error: null, previewState: "default",
    user: null, workspaceId: null, workspaceName: "", role: "staff",
    sites: [], pagesBySite: {}, domainsBySite: {}, templates: [],
    profilesBySite: {}, healthBySite: {},
    activity: [], sessions7: null, domainsActive: null, reviewBySite: {},
    leadsBySite: {}, suggestionsBySite: {}, dismissedSuggestions: {}, attnChip: "all",
    tab: "overview", editor: null,
  };
```

Replace it with:

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

- [ ] **Step 5: Hydrate the new state fields from MOCK in the disconnected branch**

Find this block (currently `m19-sites.js:252-258`):

```js
    } else {
      state.user = MOCK.user; state.workspaceId = MOCK.workspace.id; state.workspaceName = MOCK.workspace.name; state.role = MOCK.role;
      state.sites = MOCK.sites; state.pagesBySite = MOCK.pages; state.domainsBySite = MOCK.domains; state.templates = MOCK.templates;
      state.profilesBySite = MOCK.profiles; state.healthBySite = MOCK.health;
      state.leadsBySite = MOCK.leads; state.suggestionsBySite = MOCK.suggestions;
      state.loaded = true; state.loading = false;
    }
```

Replace it with:

```js
    } else {
      state.user = MOCK.user; state.workspaceId = MOCK.workspace.id; state.workspaceName = MOCK.workspace.name; state.role = MOCK.role;
      state.sites = MOCK.sites; state.pagesBySite = MOCK.pages; state.domainsBySite = MOCK.domains; state.templates = MOCK.templates;
      state.profilesBySite = MOCK.profiles; state.healthBySite = MOCK.health;
      state.leadsBySite = MOCK.leads; state.suggestionsBySite = MOCK.suggestions;
      state.team = MOCK.team; state.teamBySite = MOCK.teamBySite; state.metricsBySite = MOCK.metricsBySite;
      state.loaded = true; state.loading = false;
    }
```

(In connected/live mode these three fields stay at their empty defaults — team cluster, "last edited by" and the drawer's synthetic metrics simply don't render for a real database, same graceful-degrade pattern already used for `profilesBySite`/`healthBySite`.)

- [ ] **Step 6: Verify via the preview tool**

1. `preview_eval: location.reload()` — confirm the app still boots (mock data changes only; nothing new is rendered yet).
2. `preview_console_logs` with `level: "error"` — expect empty output.

---

### Task 8: Hero metrics strip — 6 KPI tiles

**Files:**
- Modify: `frontend/js/m19-sites.js` (add `heroMetrics()` right before `sitesHero()`, added in Slice 1 Task 2)
- Modify: `frontend/js/m19-sites.js` (wire the call into `viewSites()`, produced by Slice 1 Task 4)

- [ ] **Step 1: Add `heroMetrics()` right before `sitesHero()`**

Find this block (added by Slice 1 Task 2):

```js
  // Hero — the page's one big headline + AI composer. It never generates a site
  // directly: it only opens/prefills the same openCreateModal() every other
  // creation entry point uses, so there is exactly one generation path.
  function sitesHero() {
```

Replace it with:

```js
  // Six metric tiles under the hero — every number is computed from state that
  // already exists (nothing new stored), reusing the same kpiCard() the Dashboard uses.
  function heroMetrics() {
    const sites = state.sites || [];
    const pub = sites.filter((s) => s.status === "published").length;
    const draft = sites.filter((s) => s.status === "draft").length;
    const scores = Object.values(state.healthBySite || {}).map((h) => h.score).filter((n) => n != null);
    const avgHealth = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const cutoff = Date.now() - 7 * 864e5;
    const leads7 = Object.values(state.leadsBySite || {}).reduce((n, list) => n + (list || []).filter((l) => new Date(l.created_at).getTime() >= cutoff).length, 0);
    return `<div class="st-kpis reveal">
      ${kpiCard("globe", sites.length, "", "Websites", null, "flat", false)}
      ${kpiCard("rocket", pub, "", "Published", null, "flat", false, true)}
      ${kpiCard("doc", draft, "", "Drafts", null, "flat", false)}
      ${kpiCard("gauge", avgHealth != null ? avgHealth : "—", "", "Avg Health", null, "flat", false)}
      ${kpiCard("chart", leads7, "", "Leads · 7d", null, "flat", false)}
      ${kpiCard("users", (state.team || []).length, "", "Team Members", null, "flat", false, true)}
    </div>`;
  }
  // Hero — the page's one big headline + AI composer. It never generates a site
  // directly: it only opens/prefills the same openCreateModal() every other
  // creation entry point uses, so there is exactly one generation path.
  function sitesHero() {
```

- [ ] **Step 2: Call `heroMetrics()` from `viewSites()`, right after the hero**

Find this block (produced by Slice 1 Task 4):

```js
    return previewStrip() + `<div class="studio">
      ${sitesHero()}
      ${sitesQuickCreate()}
      ${sitesHead(sites)}
```

Replace it with:

```js
    return previewStrip() + `<div class="studio">
      ${sitesHero()}
      ${heroMetrics()}
      ${sitesQuickCreate()}
      ${sitesHead(sites)}
```

- [ ] **Step 3: Verify via the preview tool**

1. `preview_eval: location.reload()`, then `preview_eval: location.hash = "#/sites"`.
2. `preview_snapshot` — confirm 6 KPI tiles render between the hero composer and the quick-create cards: Websites (3), Published (2), Drafts (1), Avg Health (a number around 77), Leads · 7d (2 — `ld1`/`ld3` from `MOCK.leads` fall within the last 7 days relative to the app's reference "today"; `ld2` may or may not depending on exact run date, so treat "2 or 3" as passing), Team Members (6).
3. `preview_console_logs` with `level: "error"` — expect empty output.
4. `preview_resize` to `mobile` (375px) — confirm the tiles wrap to 2 columns (existing `.st-kpis` responsive rule) and there is no horizontal scroll.

---

### Task 9: Hero composer extras — attach file, competitor-URL toggle, prompt history

**Files:**
- Modify: `frontend/js/m19-sites.js:1369-1370` (insert history helpers right after `toggleFav`)
- Modify: `frontend/js/m19-sites.js` (`composerHtml()`, added by Slice 1 Task 1)
- Modify: `frontend/js/m19-sites.js` (`bindSites()`, produced by Slice 1 Task 5)
- Modify: `frontend/styles/m19-studio.css` (add rules near `.st-suggest`, currently line 88)

- [ ] **Step 1: Add the prompt-history localStorage helpers, right after `toggleFav`**

Find this line (currently `m19-sites.js:1370`):

```js
  const toggleFav = (id) => { const f = favTemplates(); const i = f.indexOf(id); if (i >= 0) f.splice(i, 1); else f.push(id); try { localStorage.setItem("aimindshare-tpl-favs", JSON.stringify(f)); } catch (e) {} return f.includes(id); };
```

Replace it with:

```js
  const toggleFav = (id) => { const f = favTemplates(); const i = f.indexOf(id); if (i >= 0) f.splice(i, 1); else f.push(id); try { localStorage.setItem("aimindshare-tpl-favs", JSON.stringify(f)); } catch (e) {} return f.includes(id); };
  // Hero prompt history — same localStorage pattern as favTemplates(): capped at 5,
  // most-recent-first, deduped by exact text. Session-local, nothing server-side.
  const HERO_PROMPTS_KEY = "aimindshare-hero-prompts";
  const heroPromptHistory = () => { try { return JSON.parse(localStorage.getItem(HERO_PROMPTS_KEY) || "[]"); } catch (e) { return []; } };
  const pushHeroPrompt = (text) => { const list = heroPromptHistory().filter((p) => p !== text); list.unshift(text); try { localStorage.setItem(HERO_PROMPTS_KEY, JSON.stringify(list.slice(0, 5))); } catch (e) {} };
```

- [ ] **Step 2: Gate the new markup in `composerHtml()` behind `idPrefix === "hero"`**

Find this block (added by Slice 1 Task 1):

```js
  function composerHtml(idPrefix) {
    const niches = NICHE_OPTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
    const chips = HERO_SUGGESTIONS.map((s) => `<button class="st-chip" data-suggest="${esc(s)}">${s}</button>`).join("");
    return `
      <div class="st-composer" data-composer id="${idPrefix}Composer">
        <textarea id="${idPrefix}Prompt" placeholder="A boutique dental clinic in Dhaka called Crescent Dental — friendly, same-week appointments, online booking…"></textarea>
        <div class="st-comp-bar">
          <button class="cb-btn" data-mic title="Speak your idea">${micSvg(17)}</button>
          <span class="cb-hint">A detailed paragraph gives the best result</span>
          <span class="spacer"></span>
          <button class="cb-send" id="${idPrefix}Generate">${svg("spark", 16)} Generate website</button>
        </div>
      </div>
      <div class="cm-tuners">
        <select class="gen-select" id="${idPrefix}Niche" title="Business type">${niches}</select>
        <select class="gen-select" id="${idPrefix}Style" title="Visual style"><option value="">Auto style</option><option value="minimal">Minimal</option><option value="bold">Bold</option><option value="elegant">Elegant</option></select>
        <select class="gen-select" id="${idPrefix}Lang" title="Language"><option value="en">English</option><option value="bn">Bengali</option><option value="ar">Arabic</option></select>
      </div>
      <div class="st-suggest" id="${idPrefix}Suggest">${chips}</div>`;
  }
```

Replace it with:

```js
  function composerHtml(idPrefix) {
    const niches = NICHE_OPTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
    const chips = HERO_SUGGESTIONS.map((s) => `<button class="st-chip" data-suggest="${esc(s)}">${s}</button>`).join("");
    // The hero (page-level) instance only: attach-file, competitor-URL toggle, prompt
    // history. The modal's composer ("cm") stays exactly as Slice 1 left it.
    const isHero = idPrefix === "hero";
    const attachBtn = isHero ? `<button class="cb-btn" data-attach title="Attach a business brief or competitor analysis">${svg("doc", 16)}</button><input type="file" id="heroAttach" accept=".pdf,.doc,.docx,image/*" hidden>` : "";
    const competitorToggle = isHero ? `
      <button class="st-link hero-competitor-toggle" id="heroCompetitorToggle">${svg("link", 12)} Paste a competitor URL instead</button>
      <div class="hero-competitor" id="heroCompetitorBox" hidden>
        <input class="input" id="heroCompetitorUrl" placeholder="https://competitor.com">
        <button class="btn btn-ghost btn-sm" id="heroCompetitorGo">Analyze</button>
      </div>` : "";
    const recentChips = isHero ? `<div class="st-suggest hero-recent" id="heroRecent">${heroPromptHistory().map((p) => `<button class="st-chip" data-recent="${esc(p)}">${esc(p.length > 44 ? p.slice(0, 44) + "…" : p)}</button>`).join("")}</div>` : "";
    return `
      <div class="st-composer" data-composer id="${idPrefix}Composer">
        <textarea id="${idPrefix}Prompt" placeholder="A boutique dental clinic in Dhaka called Crescent Dental — friendly, same-week appointments, online booking…"></textarea>
        <div class="st-comp-bar">
          <button class="cb-btn" data-mic title="Speak your idea">${micSvg(17)}</button>
          ${attachBtn}
          <span class="cb-hint">A detailed paragraph gives the best result</span>
          <span class="spacer"></span>
          <button class="cb-send" id="${idPrefix}Generate">${svg("spark", 16)} Generate website</button>
        </div>
      </div>
      <div class="cm-tuners">
        <select class="gen-select" id="${idPrefix}Niche" title="Business type">${niches}</select>
        <select class="gen-select" id="${idPrefix}Style" title="Visual style"><option value="">Auto style</option><option value="minimal">Minimal</option><option value="bold">Bold</option><option value="elegant">Elegant</option></select>
        <select class="gen-select" id="${idPrefix}Lang" title="Language"><option value="en">English</option><option value="bn">Bengali</option><option value="ar">Arabic</option></select>
      </div>
      ${competitorToggle}
      <div class="st-suggest" id="${idPrefix}Suggest">${chips}</div>
      ${recentChips}`;
  }
```

- [ ] **Step 3: Wire the attach button, competitor toggle and recent-prompt chips; push to history on Generate**

Find this block (produced by Slice 1 Task 5):

```js
  function bindSites() {
    bindNavTo();
    $("#newSite")?.addEventListener("click", () => openCreateModal());
    bindSiteCardActions();
    bindSitesFilter();
    // Hero composer — Generate opens the create modal on the AI tab, prefilled
    // (nothing to close first — the hero isn't itself a generation path).
    bindComposer("hero", document, (desc) => openCreateModal("ai", desc));
    $("#heroBlank")?.addEventListener("click", () => openCreateModal("blank"));
    $$("[data-qcard]").forEach((b) => b.addEventListener("click", () => {
      const act = b.dataset.qcard;
      if (act === "templates") location.hash = "#/templates";
      else if (act === "recent") location.hash = "#/sites/" + b.dataset.recentId;
      else openCreateModal(act);
    }));
  }
```

Replace it with:

```js
  function bindSites() {
    bindNavTo();
    $("#newSite")?.addEventListener("click", () => openCreateModal());
    bindSiteCardActions();
    bindSitesFilter();
    // Hero composer — Generate opens the create modal on the AI tab, prefilled
    // (nothing to close first — the hero isn't itself a generation path). Every
    // successful Generate also records the prompt into local history.
    bindComposer("hero", document, (desc) => { pushHeroPrompt(desc); openCreateModal("ai", desc); });
    $("#heroBlank")?.addEventListener("click", () => openCreateModal("blank"));
    $$("[data-qcard]").forEach((b) => b.addEventListener("click", () => {
      const act = b.dataset.qcard;
      if (act === "templates") location.hash = "#/templates";
      else if (act === "recent") location.hash = "#/sites/" + b.dataset.recentId;
      else openCreateModal(act);
    }));
    // Composer extras (hero only) — attach + competitor URL both show the same
    // flagged toast the Clone/Import flows already use; nothing is read or uploaded.
    $("#heroAttach")?.addEventListener("change", () => toast("Business brief / competitor analysis runs with the AI provider — flagged, not faked.", "info"));
    $("#heroCompetitorToggle")?.addEventListener("click", () => $("#heroCompetitorBox")?.toggleAttribute("hidden"));
    $("#heroCompetitorGo")?.addEventListener("click", () => {
      const u = $("#heroCompetitorUrl"); if (!u || !u.value.trim()) { u?.focus(); return; }
      toast("Business brief / competitor analysis runs with the AI provider — flagged, not faked.", "info");
    });
    $$("#heroRecent [data-recent]").forEach((b) => b.addEventListener("click", () => { const ta = $("#heroPrompt"); ta.value = b.dataset.recent; ta.focus(); }));
  }
```

- [ ] **Step 4: CSS for the competitor toggle box and recent-prompt row**

Find this line (currently `m19-studio.css:88`):

```css
.st-suggest{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
```

Replace it with:

```css
.st-suggest{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.hero-competitor-toggle{margin-top:10px}
.hero-competitor{display:flex;gap:8px;margin-top:10px}
.hero-competitor input{flex:1}
.hero-recent{margin-top:6px}
```

- [ ] **Step 5: Verify via the preview tool**

1. `preview_eval: location.reload()`, then `preview_eval: location.hash = "#/sites"`.
2. `preview_snapshot` — confirm the hero composer bar now shows both a mic and an attach button; confirm a "Paste a competitor URL instead" link renders under the hint text.
3. `preview_click` on `#heroAttach` isn't directly possible (file inputs can't be scripted to open a picker) — instead `preview_eval: document.querySelector("#heroAttach").dispatchEvent(new Event("change"))` and confirm a toast reading "Business brief / competitor analysis runs with the AI provider — flagged, not faked." appears (check via `preview_snapshot` or `preview_screenshot`).
4. `preview_click` on `#heroCompetitorToggle` — confirm `#heroCompetitorBox` becomes visible (no longer `hidden`).
5. `preview_click` on `#heroCompetitorGo` with the URL field empty — confirm no toast and focus moves to the field; `preview_fill` on `#heroCompetitorUrl` with `"https://example.com"`, click again — confirm the same flagged toast appears.
6. `preview_fill` on `#heroPrompt` with `"A modern coffee roastery site"`, `preview_click` on `#heroGenerate` — confirm the create modal opens (Slice 1 behavior unchanged), then close it and `preview_eval: location.hash = "#/sites"` again — confirm a "Recent" chip now renders under the hero's suggestion chips reading the coffee-roastery prompt (truncated to 44 chars if longer), and clicking it fills `#heroPrompt` with the full text.
7. `preview_eval: location.reload()`, then `location.hash = "#/sites"` — confirm the recent-prompt chip persists across reload (localStorage), unlike the composer text itself.
8. `preview_console_logs` with `level: "error"` — expect empty output.

---

### Task 10: `siteCard()` enrichment — client/category, status pills, accessibility dot, team cluster, AI insight, "⋯ More" trigger

**Files:**
- Modify: `frontend/js/m19-sites.js:387-441` (whole `siteCard` function)
- Modify: `frontend/styles/m19-studio.css:430-439` (card-enrichment CSS block)

- [ ] **Step 1: Replace `siteCard()`**

Find this block (currently `m19-sites.js:387-441`):

```js
  function siteCard(s, attn) {
    const domain = s.primary_domain || (s.subdomain + ".aimindshare.site");
    const staging = `https://${s.subdomain || "site"}.aimindshare.site/?pt=${s.preview_token || ""}`;
    const share = `https://${esc(domain)}`;
    const spark = (s.traffic && s.traffic.length)
      ? `<span class="spark" title="Last 7 days">${s.traffic.map((v) => `<i style="height:${Math.max(12, Math.round(v / Math.max(...s.traffic) * 100))}%"></i>`).join("")}</span>`
      : `<span class="spark spark-empty">no traffic yet</span>`;
    const pubMeta = s.last_published
      ? `${s.last_version ? "v" + s.last_version + " · " : ""}published ${fmtDate(s.last_published)}`
      : `never published`;
    // Domain-status chip (custom + live, or staging-only).
    const domChip = s.primary_domain
      ? `<span class="pill success" title="Custom domain connected">${svg("link", 11)} ${esc(s.primary_domain)}</span>`
      : `<span class="pill plain" title="Always-on staging subdomain">staging only</span>`;
    // Health-dimension dots from the site's quality report (SEO / schema / perf).
    const h = (state.healthBySite || {})[s.id];
    const dot = (key, label) => { const c = h && (h.categories || []).find((x) => x.key === key); const st = c ? c.status : "na";
      return `<span class="hd hd-${st}" title="${label}: ${c ? esc(c.detail) : "—"}"></span>`; };
    const dots = h ? `<span class="sc-dots" title="Content health">${dot("seo", "SEO")}${dot("schema", "Schema")}${dot("perf", "Performance")}</span>` : "";
    return `
      <div class="site-card sc-rich reveal" data-site="${esc(s.id)}" data-status="${esc(s.status)}" data-attn="${attn ? 1 : 0}" data-name="${esc(s.name.toLowerCase())}">
        <div class="sc-top">
          <span class="sc-favi ${s.style_preset ? "sc-favi-" + esc(s.style_preset) : ""}">${esc(initials(s.name))}</span>
          <div class="sc-id"><h3>${esc(s.name)}</h3>
            <button class="sc-domain" data-copy="${esc(domain)}">${svg("globe", 13)} ${esc(domain)} ${svg("copy", 12)}</button>
          </div>
          <button class="sc-health" data-gohealth="${esc(s.id)}" title="Site health — SEO, schema, accessibility, performance">${healthRing(s.health_score)}</button>
        </div>
        <div class="sc-meta">
          ${statusPill(s.status)}
          ${s.maintenance_mode ? `<span class="pill warning">maintenance</span>` : ""}
          ${domChip}
          <span class="pill plain">${s.pages} ${s.pages === 1 ? "page" : "pages"}</span>
          ${s.language && s.language !== "en" ? `<span class="pill plain">${esc(s.language)}</span>` : ""}
          ${dots}
        </div>
        <div class="sc-stats">
          <span class="sc-stat"><span class="cs-num">${esc(pubMeta)}</span><span class="cs-lab">Publish history</span></span>
          <span class="sc-stat sc-stat-spark">${spark}<span class="cs-lab">${s.sessions_7d != null ? s.sessions_7d + " sessions · 7d" : "Traffic"}</span></span>
        </div>
        <div class="sc-foot">
          <span class="sc-quick">
            <button class="icon-btn sm" data-copy="${esc(staging)}" title="Copy staging preview link (drafts + maintenance bypass)">${svg("eye", 14)}</button>
            <button class="icon-btn sm" data-copy="${share}" title="Copy public share link">${svg("link", 14)}</button>
            <button class="icon-btn sm" data-goseo="${esc(s.id)}" title="SEO defaults & schema">${svg("search", 14)}</button>
            <button class="icon-btn sm" data-goanalytics="${esc(s.id)}" title="Analytics & publish history">${svg("layers", 14)}</button>
            <button class="icon-btn sm" data-publish="${esc(s.id)}" title="Publish — runs the pre-flight quality gate">${svg("rocket", 14)}</button>
          </span>
          <span style="display:flex;gap:8px">
            <button class="btn btn-ghost btn-sm" data-open="${esc(s.id)}">Manage</button>
            <button class="btn btn-primary btn-sm" data-editsite="${esc(s.id)}">${svg("edit", 13)} Edit</button>
          </span>
        </div>
      </div>`;
  }
```

Replace it with:

```js
  function siteCard(s, attn) {
    const domain = s.primary_domain || (s.subdomain + ".aimindshare.site");
    const staging = `https://${s.subdomain || "site"}.aimindshare.site/?pt=${s.preview_token || ""}`;
    const share = `https://${esc(domain)}`;
    const spark = (s.traffic && s.traffic.length)
      ? `<span class="spark" title="Last 7 days">${s.traffic.map((v) => `<i style="height:${Math.max(12, Math.round(v / Math.max(...s.traffic) * 100))}%"></i>`).join("")}</span>`
      : `<span class="spark spark-empty">no traffic yet</span>`;
    // Team assigned to this site — avatar cluster + "last edited by" convention
    // (the first assigned member stands in for "last touched by").
    const teamIds = (state.teamBySite || {})[s.id] || [];
    const teamMembers = teamIds.map((id) => (state.team || []).find((t) => t.id === id)).filter(Boolean);
    const lastEditor = teamMembers[0] ? teamMembers[0].name : null;
    const pubMeta = (s.last_published
      ? `${s.last_version ? "v" + s.last_version + " · " : ""}published ${fmtDate(s.last_published)}`
      : `never published`) + (lastEditor ? ` · edited by ${esc(lastEditor)}` : "");
    // Domain-status chip (custom + live, or staging-only).
    const domChip = s.primary_domain
      ? `<span class="pill success" title="Custom domain connected">${svg("link", 11)} ${esc(s.primary_domain)}</span>`
      : `<span class="pill plain" title="Always-on staging subdomain">staging only</span>`;
    // Health-dimension dots from the site's quality report (SEO / schema / accessibility / perf).
    const h = (state.healthBySite || {})[s.id];
    const dot = (key, label) => { const c = h && (h.categories || []).find((x) => x.key === key); const st = c ? c.status : "na";
      return `<span class="hd hd-${st}" title="${label}: ${c ? esc(c.detail) : "—"}"></span>`; };
    const dots = h ? `<span class="sc-dots" title="Content health">${dot("seo", "SEO")}${dot("schema", "Schema")}${dot("a11y", "Accessibility")}${dot("perf", "Performance")}</span>` : "";
    // Client / category identity row — client_name falls back to the site name.
    const clientName = s.client_name || s.name;
    const nicheOpt = NICHE_OPTS.find(([v]) => v === s.niche);
    // Card-local status pill: Archived / Review override the base status pill for
    // display purposes only — s.status itself is never mutated here.
    const isReview = (state.reviewBySite || {})[s.id] === "review";
    const cardStatus = s.archived ? `<span class="pill idle">Archived</span>` : isReview ? `<span class="pill warning">Review</span>` : statusPill(s.status);
    // Team avatar cluster — up to 3 stacked initials + "+N" overflow.
    const teamCluster = teamMembers.length ? `<span class="sc-team" title="${esc(teamMembers.map((t) => t.name + " · " + t.role).join(", "))}">${
      teamMembers.slice(0, 3).map((t) => `<span class="team-av ${t.color === "gold" ? "ta-gold" : ""}">${esc(t.initials)}</span>`).join("")
    }${teamMembers.length > 3 ? `<span class="team-av ta-more">+${teamMembers.length - 3}</span>` : ""}</span>` : "";
    // One inline AI-insight line — the single top-ranked attentionItems() result for
    // just this site (same engine the Dashboard panel and the attention strip use).
    const insight = attentionItems([s])[0];
    return `
      <div class="site-card sc-rich reveal" data-site="${esc(s.id)}" data-status="${esc(s.status)}" data-attn="${attn ? 1 : 0}" data-name="${esc(s.name.toLowerCase())}" data-niche="${esc(s.niche || "")}" data-archived="${s.archived ? 1 : 0}">
        <div class="sc-top">
          <span class="sc-favi ${s.style_preset ? "sc-favi-" + esc(s.style_preset) : ""}">${esc(initials(s.name))}</span>
          <div class="sc-id"><h3>${esc(s.name)}</h3>
            <button class="sc-domain" data-copy="${esc(domain)}">${svg("globe", 13)} ${esc(domain)} ${svg("copy", 12)}</button>
          </div>
          <button class="sc-health" data-gohealth="${esc(s.id)}" title="Site health — SEO, schema, accessibility, performance">${healthRing(s.health_score)}</button>
        </div>
        <div class="sc-client">
          <span class="sc-client-name">${esc(clientName)}</span>
          ${nicheOpt ? `<span class="pill plain sc-niche">${esc(nicheOpt[1])}</span>` : ""}
        </div>
        <div class="sc-meta">
          ${cardStatus}
          ${s.maintenance_mode ? `<span class="pill warning">maintenance</span>` : ""}
          ${domChip}
          <span class="pill plain">${s.pages} ${s.pages === 1 ? "page" : "pages"}</span>
          ${s.language && s.language !== "en" ? `<span class="pill plain">${esc(s.language)}</span>` : ""}
          ${dots}
        </div>
        ${insight ? `<div class="sc-insight"><span class="si-ico">${svg(insight.ico, 13)}</span><span>${esc(insight.title)}</span></div>` : ""}
        <div class="sc-stats">
          <span class="sc-stat"><span class="cs-num">${esc(pubMeta)}</span><span class="cs-lab">Publish history</span></span>
          <span class="sc-stat sc-stat-spark">${spark}<span class="cs-lab">${s.sessions_7d != null ? s.sessions_7d + " sessions · 7d" : "Traffic"}</span></span>
        </div>
        <div class="sc-foot">
          <span class="sc-quick">
            ${teamCluster}
            <button class="icon-btn sm" data-copy="${esc(staging)}" title="Copy staging preview link (drafts + maintenance bypass)">${svg("eye", 14)}</button>
            <button class="icon-btn sm" data-publish="${esc(s.id)}" title="Publish — runs the pre-flight quality gate">${svg("rocket", 14)}</button>
            <button class="icon-btn sm" data-more="${esc(s.id)}" data-share="${esc(share)}" title="More actions">⋯</button>
          </span>
          <span style="display:flex;gap:8px">
            <button class="btn btn-ghost btn-sm" data-open="${esc(s.id)}">Manage</button>
            <button class="btn btn-primary btn-sm" data-editsite="${esc(s.id)}">${svg("edit", 13)} Edit</button>
          </span>
        </div>
      </div>`;
  }
```

(The visible "Share" icon button is removed — it moves into the "⋯ More" menu in Task 11, which reads the pre-escaped URL back off `data-share` so it doesn't need to recompute it. SEO and Analytics icon buttons are removed the same way; their `data-goseo`/`data-goanalytics` behavior is preserved as menu items in Task 11, not deleted.)

- [ ] **Step 2: CSS for the new card rows (client/category, AI insight, team cluster)**

Find this block (currently `m19-studio.css:430-439`):

```css
/* ── Websites portfolio: card enrichments (grid/toolbar reuse dashboard css) ── */
.sc-meta .sc-dots{display:inline-flex;gap:4px;align-items:center;margin-left:auto}
.sc-dots .hd{width:8px;height:8px;border-radius:50%;background:var(--status-idle)}
.sc-dots .hd-pass{background:var(--status-success)}
.sc-dots .hd-warn{background:var(--gold-500)}
.sc-dots .hd-fail{background:var(--status-danger)}
.sc-dots .hd-na{background:var(--line-strong)}
.site-card.sc-rich .sc-foot{flex-wrap:wrap;row-gap:10px}
.site-card.sc-rich .sc-quick{flex-wrap:wrap}
.dt-dom .pill svg{flex:none}
```

Replace it with:

```css
/* ── Websites portfolio: card enrichments (grid/toolbar reuse dashboard css) ── */
.sc-meta .sc-dots{display:inline-flex;gap:4px;align-items:center;margin-left:auto}
.sc-dots .hd{width:8px;height:8px;border-radius:50%;background:var(--status-idle)}
.sc-dots .hd-pass{background:var(--status-success)}
.sc-dots .hd-warn{background:var(--gold-500)}
.sc-dots .hd-fail{background:var(--status-danger)}
.sc-dots .hd-na{background:var(--line-strong)}
.site-card.sc-rich .sc-foot{flex-wrap:wrap;row-gap:10px}
.site-card.sc-rich .sc-quick{flex-wrap:wrap;align-items:center}
.dt-dom .pill svg{flex:none}
.sc-client{display:flex;align-items:center;gap:8px;margin-top:2px}
.sc-client-name{font-size:12.5px;color:var(--ink-500)}
.sc-niche{font-size:10.5px}
.sc-insight{display:flex;align-items:center;gap:7px;margin-top:2px;padding:8px 10px;border-radius:var(--r-sm);
  background:rgba(0,105,110,.06);font-size:12px;color:var(--ink-700)}
.sc-insight .si-ico{flex:none;color:var(--teal-700)}
:root[data-theme="dark"] .sc-insight .si-ico{color:var(--teal-300)}
.sc-team{display:inline-flex;align-items:center;margin-right:2px}
.sc-team .team-av{width:22px;height:22px;border-radius:50%;background:var(--grad-brand);color:#fff;font-family:var(--font-mono);
  font-size:9.5px;font-weight:700;display:grid;place-items:center;border:1.5px solid var(--card-solid);margin-left:-6px}
.sc-team .team-av:first-child{margin-left:0}
.sc-team .team-av.ta-gold{background:var(--grad-gold);color:#1A0E00}
.sc-team .team-av.ta-more{background:var(--ink-300);color:#fff}
```

- [ ] **Step 3: Verify via the preview tool**

1. `preview_eval: location.reload()`, then `preview_eval: location.hash = "#/sites"`.
2. `preview_snapshot` — confirm each card now shows: a client/category row under the name ("Northstar Agency" with no category chip since `niche="agency"` — wait, `agency` **is** a valid `NICHE_OPTS` key, so confirm the "Agency / services" chip renders; "Dr. Amina Chowdhury" with a "Dental practice" chip on Crescent Dental; "Zenith Coaching LLC" with a "Coach / creator" chip on Zenith Coaching), a 4th (Accessibility) health dot, a team avatar cluster, an "edited by" suffix on the publish-history line, one AI-insight line (may be absent only if `attentionItems([s])` returns nothing for that site — unlikely given the health/domain mock data), and a "⋯" more-actions button where the Share/SEO/Analytics icon buttons used to be.
3. `preview_inspect` on `.site-card[data-site="s1"] .sc-team` — confirm 3 `.team-av` elements render (Northstar's `teamBySite` has exactly 3 members, so no "+N" overflow badge).
4. `preview_console_logs` with `level: "error"` — expect empty output (the "⋯" button has no click handler yet — that's Task 11 — so clicking it does nothing yet; this step only checks rendering).
5. `preview_resize` to `mobile` (375px) — `preview_screenshot` and confirm no new horizontal scroll from the added rows.

---

### Task 11: `openPop()` dropdown primitive + the "⋯ More" menu

**Files:**
- Modify: `frontend/js/m19-sites.js:1877-1891` (insert `openPop`/`closePop`/`siteMoreMenu` before `bindSiteCardActions`, extend the function)
- Modify: `frontend/js/m19-sites.js` (add the global Escape-to-close listener near the bottom of the file, next to the existing `hashchange` listener)

- [ ] **Step 1: Insert the popover primitive and extend `bindSiteCardActions()`**

Find this block (currently `m19-sites.js:1877-1891`):

```js
  function bindNavTo(root) {
    root = root || document;
    $$("[data-nav-to]", root).forEach((b) => b.addEventListener("click", () => { location.hash = "#/" + b.dataset.navTo; }));
    $$("[data-qa]", root).forEach((b) => b.addEventListener("click", () => studioAction(b.dataset.qa)));
  }
  function bindSiteCardActions() {
    $$(".site-card").forEach((c) => c.addEventListener("click", (e) => { if (e.target.closest("button")) return; state.tab = "overview"; location.hash = "#/sites/" + c.dataset.site; }));
    $$("[data-open]").forEach((b) => b.addEventListener("click", () => { state.tab = "overview"; location.hash = "#/sites/" + b.dataset.open; }));
    $$("[data-editsite]").forEach((b) => b.addEventListener("click", async () => { const id = b.dataset.editsite; const d = await loadSite(id); const home = (d.pages || []).find((p) => p.is_home) || d.pages[0]; if (home) location.hash = `#/sites/${id}/edit/${home.id}`; else location.hash = "#/sites/" + id; }));
    $$("[data-editpage]").forEach((b) => b.addEventListener("click", () => { const [s, p] = b.dataset.editpage.split(":"); location.hash = `#/sites/${s}/edit/${p}`; }));
    $$("[data-goseo]").forEach((b) => b.addEventListener("click", () => { state.tab = "seo"; location.hash = "#/sites/" + b.dataset.goseo; }));
    $$("[data-goanalytics]").forEach((b) => b.addEventListener("click", () => { state.tab = "analytics"; location.hash = "#/sites/" + b.dataset.goanalytics; }));
    $$("[data-gohealth]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); state.tab = "health"; location.hash = "#/sites/" + b.dataset.gohealth; }));
    $$("[data-publish]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); state.tab = "publish"; location.hash = "#/sites/" + b.dataset.publish; }));
  }
```

Replace it with:

```js
  function bindNavTo(root) {
    root = root || document;
    $$("[data-nav-to]", root).forEach((b) => b.addEventListener("click", () => { location.hash = "#/" + b.dataset.navTo; }));
    $$("[data-qa]", root).forEach((b) => b.addEventListener("click", () => studioAction(b.dataset.qa)));
  }
  // Small shared dropdown primitive (reuses the existing `.pop`/`.pop-item` classes,
  // DESIGN §8.8) — the "⋯ More" card menu here, and the toolbar's Filters/Sort/
  // Saved-views menus in Task 13, all open through this one helper.
  function closePop() { $$(".pop.open").forEach((p) => p.remove()); document.removeEventListener("click", popOutside, true); }
  function popOutside(e) { if (!e.target.closest(".pop")) closePop(); }
  function openPop(anchor, html) {
    closePop();
    const p = el("div", "pop open", html);
    document.body.appendChild(p);
    const r = anchor.getBoundingClientRect();
    const pw = p.offsetWidth || 240;
    const left = Math.max(8, Math.min(r.right + window.scrollX - pw, window.scrollX + document.documentElement.clientWidth - pw - 8));
    p.style.top = (r.bottom + 6 + window.scrollY) + "px";
    p.style.left = left + "px";
    setTimeout(() => document.addEventListener("click", popOutside, true), 0);
    return p;
  }
  // The card's consolidated quick-actions menu — everything that used to be its own
  // icon button except Preview and Publish (kept visible on the card in Task 10).
  function siteMoreMenu() {
    const items = [
      ["details", "eye", "Details"],
      ["seo", "search", "SEO defaults & schema"],
      ["analytics", "chart", "Analytics"],
      ["share", "link", "Copy share link"],
      ["clone", "copy", "Clone this site"],
      ["versions", "clock", "Version history"],
      ["settings", "gear", "Settings"],
    ];
    return items.map(([act, ico, label]) => `<div class="pop-item" data-moreact="${act}">${svg(ico, 15)}<span class="pi-name">${label}</span></div>`).join("");
  }
  function bindSiteCardActions() {
    $$(".site-card").forEach((c) => c.addEventListener("click", (e) => { if (e.target.closest("button")) return; state.tab = "overview"; location.hash = "#/sites/" + c.dataset.site; }));
    $$("[data-open]").forEach((b) => b.addEventListener("click", () => { state.tab = "overview"; location.hash = "#/sites/" + b.dataset.open; }));
    $$("[data-editsite]").forEach((b) => b.addEventListener("click", async () => { const id = b.dataset.editsite; const d = await loadSite(id); const home = (d.pages || []).find((p) => p.is_home) || d.pages[0]; if (home) location.hash = `#/sites/${id}/edit/${home.id}`; else location.hash = "#/sites/" + id; }));
    $$("[data-editpage]").forEach((b) => b.addEventListener("click", () => { const [s, p] = b.dataset.editpage.split(":"); location.hash = `#/sites/${s}/edit/${p}`; }));
    $$("[data-goseo]").forEach((b) => b.addEventListener("click", () => { state.tab = "seo"; location.hash = "#/sites/" + b.dataset.goseo; }));
    $$("[data-goanalytics]").forEach((b) => b.addEventListener("click", () => { state.tab = "analytics"; location.hash = "#/sites/" + b.dataset.goanalytics; }));
    $$("[data-gohealth]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); state.tab = "health"; location.hash = "#/sites/" + b.dataset.gohealth; }));
    $$("[data-publish]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); state.tab = "publish"; location.hash = "#/sites/" + b.dataset.publish; }));
    $$("[data-more]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = b.dataset.more, shareUrl = b.dataset.share;
      const pop = openPop(b, siteMoreMenu());
      $$("[data-moreact]", pop).forEach((it) => it.addEventListener("click", () => {
        closePop();
        const act = it.dataset.moreact;
        if (act === "details") openDetailsDrawer(id);
        else if (act === "seo") { state.tab = "seo"; location.hash = "#/sites/" + id; }
        else if (act === "analytics") { state.tab = "analytics"; location.hash = "#/sites/" + id; }
        else if (act === "share") { try { navigator.clipboard.writeText(shareUrl); toast("Copied.", "success"); } catch (er) {} }
        else if (act === "clone") toast("Cloning duplicates this site as a new draft — runs with the AI provider, flagged, not faked.", "info");
        else if (act === "versions") { state.tab = "publish"; location.hash = "#/sites/" + id; }
        else if (act === "settings") { state.tab = "settings"; location.hash = "#/sites/" + id; }
      }));
    }));
  }
```

(`openDetailsDrawer(id)`, referenced by the "Details" menu item, is added in Task 12 — this is safe to reference here because it's a hoisted `function` declaration in the same IIFE, called only later on click, never at parse time.)

- [ ] **Step 2: Close any open popover on Escape**

Find this line (currently near the end of the file, right before `mountCopilot();`):

```js
  window.addEventListener("hashchange", () => { if (state.editor && !location.hash.includes("/edit/")) teardownEditor(); render(); if (copilot.open) { const ctx = copilotContext(); const c = $("#cpCtx"); if (c) c.textContent = "Context · " + ctx.label; renderCpSuggest(ctx); } });
```

Replace it with:

```js
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closePop(); });
  window.addEventListener("hashchange", () => { if (state.editor && !location.hash.includes("/edit/")) teardownEditor(); render(); if (copilot.open) { const ctx = copilotContext(); const c = $("#cpCtx"); if (c) c.textContent = "Context · " + ctx.label; renderCpSuggest(ctx); } });
```

- [ ] **Step 3: Verify via the preview tool**

1. `preview_eval: location.reload()`, then `preview_eval: location.hash = "#/sites"`.
2. `preview_click` on a card's "⋯" button (`[data-more]`) — `preview_snapshot` and confirm a popover opens listing Details, SEO defaults & schema, Analytics, Copy share link, Clone this site, Version history, Settings.
3. `preview_click` outside the popover (e.g. the page background) — confirm it closes.
4. `preview_click` the "⋯" button again, then `preview_click` "Copy share link" — confirm a "Copied." toast appears and the popover closes.
5. `preview_click` the "⋯" button again, then `preview_click` "SEO defaults & schema" — confirm navigation to that site's SEO tab (`#/sites/{id}` with the SEO tab active in the per-site rail).
6. Back on `#/sites`, `preview_click` the "⋯" button, then press `Escape` (`preview_eval: document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`) — confirm the popover closes.
7. `preview_console_logs` with `level: "error"` — expect empty output. Do **not** click "Details" yet — `openDetailsDrawer` doesn't exist until Task 12 lands, so clicking it now would throw a `ReferenceError`; every other menu item (SEO, Analytics, Share, Clone, Version history, Settings) is safe to test now.

---

### Task 12: The "Details" drawer — full per-site breakdown

**Files:**
- Modify: `frontend/js/m19-sites.js` (add `detailsDrawerBody`/`openDetailsDrawer`/`closeDetailsDrawer`, right before `bindNavTo` — same insertion point Task 11 used)
- Modify: `frontend/js/m19-sites.js` (extend the Escape-key listener added in Task 11 Step 2)
- Modify: `frontend/styles/m19-studio.css` (new `.dd-*` rules, appended after the Slice D block, currently ending around line 598)

Judgment call, flagged here since the spec names 6 progress-bar labels (Content/SEO/Design/Accessibility/QA/Publishing) that don't map 1:1 onto the 9 health-category keys (`seo`, `schema`, `a11y`, `perf`, `links`, `fields`, `security`, `conversion`, `content`): this task maps `Content→content`, `SEO→seo`, `Design→schema`, `Accessibility→a11y`, `QA→fields`, `Publishing→links`, leaving `perf`/`security`/`conversion` reflected only in the full health-breakdown list above the bars (not double-counted into a 7th/8th/9th bar) — still "derived from health category statuses", per the spec's requirement, just a specific choice of which 6 of the 9 categories back the 6 named bars.

- [ ] **Step 1: Add the drawer's content builder + open/close functions**

Find this block (currently right before `bindSiteCardActions`, produced by Task 11):

```js
  // The card's consolidated quick-actions menu — everything that used to be its own
  // icon button except Preview and Publish (kept visible on the card in Task 10).
  function siteMoreMenu() {
```

Replace it with:

```js
  // Details drawer — a per-site deep-dive. Built and torn down dynamically (append/
  // remove from document.body) rather than a persistent mounted root like Copilot,
  // since its content differs per site on every open.
  const DD_BUCKETS = [
    ["content", "Content"], ["seo", "SEO"], ["schema", "Design"],
    ["a11y", "Accessibility"], ["fields", "QA"], ["links", "Publishing"],
  ];
  const DD_PROGRESS = { pass: 100, warn: 60, fail: 20, na: 20 };
  function detailsDrawerBody(site) {
    const h = (state.healthBySite || {})[site.id] || { categories: [] };
    const cats = h.categories || [];
    const catByKey = {}; cats.forEach((c) => catByKey[c.key] = c);
    const catIco = { seo: "search", schema: "layers", a11y: "eye", perf: "gauge", links: "link", fields: "check", security: "gear", conversion: "chart", content: "doc" };
    const healthRows = cats.map((c) => `<div class="pf-row"><span class="pf-ico pf-${c.status}">${svg(catIco[c.key] || "doc", 12)}</span><div class="pf-main"><b>${esc(c.label)}</b><span>${esc(c.detail)}</span></div><span class="pill ${c.status === "pass" ? "success" : c.status === "fail" ? "danger" : "warning"}">${c.status}</span></div>`).join("") || `<div class="empty-inline">No health report yet.</div>`;
    const bars = DD_BUCKETS.map(([key, label]) => { const c = catByKey[key]; const pct = c ? (DD_PROGRESS[c.status] ?? 20) : 20;
      return `<div class="opt-row"><div class="o-main"><b>${label}</b><div class="o-track"><i class="${pct >= 85 ? "" : pct >= 55 ? "warn" : "bad"}" style="width:${pct}%"></i></div></div><span class="o-val">${pct}%</span></div>`; }).join("");
    const overall = Math.round(DD_BUCKETS.reduce((sum, [key]) => { const c = catByKey[key]; return sum + (c ? (DD_PROGRESS[c.status] ?? 20) : 20); }, 0) / DD_BUCKETS.length);
    const leadsAll = (state.leadsBySite || {})[site.id] || [];
    const forms = leadsAll.filter((l) => l.type === "form").length;
    const bookings = leadsAll.filter((l) => l.type === "booking").length;
    const sessions = site.sessions_7d || 0;
    const convRate = sessions ? ((leadsAll.length / sessions) * 100).toFixed(1) + "%" : "—";
    const uniqueVisitors = Math.round(sessions * 0.7);
    const m = (state.metricsBySite || {})[site.id] || { revenue: 0, bounce_rate: 0, cwv: { lcp: 0, cls: 0, inp: 0 } };
    const dom = (state.domainsBySite || {})[site.id] || [];
    const ssl = dom[0] ? dom[0].ssl_status : "—";
    const env = site.status === "published" ? "Production" : site.status === "draft" ? "Development" : "Staging";
    const build = (site.last_version || 0) * 10;
    const insights = attentionItems([site]);
    const insightRows = insights.length ? insights.map((a) => `<div class="attn-item ai-${a.sev}"><span class="ai-ico">${svg(a.ico, 15)}</span><div class="ai-main"><b>${esc(a.title)}</b><span>${esc(a.detail)}</span></div></div>`).join("")
      : `<div class="attn-clear"><span class="ac-ico">${svg("check", 18)}</span><div><b>All clear</b><span>No issues need attention on this site.</span></div></div>`;
    // publishLog entries aren't per-site in the mock dataset (only domain-verify rows
    // carry a domain); entries without a domain marker are shown for every site, same
    // as the existing global activityPanel() already does.
    const timeline = (MOCK.publishLog || []).filter((l) => !l.detail?.domain || l.detail.domain === site.primary_domain);
    const timelineRows = timeline.length ? timeline.map((l) => `<div class="ov-row"><span class="ov-favi">${svg(l.status === "ok" ? "check" : "x", 14)}</span><div class="ov-main"><b class="mono">${esc(l.kind)}</b><span>${esc(l.detail?.slug ? "/" + l.detail.slug : l.detail?.domain || "")}</span></div><span class="ov-right">${fmtDate(l.created_at)}</span></div>`).join("")
      : emptyInline("No activity yet.");
    return `
      <div class="dd-section"><div class="dd-h">Full health breakdown</div><div class="pf-list">${healthRows}</div></div>
      <div class="dd-section"><div class="dd-h">Progress <span class="pill plain" style="margin-left:8px">${overall}% overall</span></div><div class="opt-list">${bars}</div></div>
      <div class="dd-section"><div class="dd-h">Business metrics</div>
        <div class="ov-stats" style="grid-template-columns:repeat(3,1fr)">
          <div class="ov-stat"><span class="ovs-ico">${svg("users", 15)}</span><div class="ovs-t"><b>${leadsAll.length}</b><span>Leads</span></div></div>
          <div class="ov-stat"><span class="ovs-ico">${svg("form", 15)}</span><div class="ovs-t"><b>${forms}</b><span>Forms submitted</span></div></div>
          <div class="ov-stat"><span class="ovs-ico">${svg("clock", 15)}</span><div class="ovs-t"><b>${bookings}</b><span>Bookings</span></div></div>
          <div class="ov-stat"><span class="ovs-ico">${svg("gauge", 15)}</span><div class="ovs-t"><b>${convRate}</b><span>Conversion rate</span></div></div>
          <div class="ov-stat"><span class="ovs-ico">${svg("eye", 15)}</span><div class="ovs-t"><b>${uniqueVisitors}</b><span>Unique visitors (est.)</span></div></div>
          <div class="ov-stat"><span class="ovs-ico">${svg("chart", 15)}</span><div class="ovs-t"><b>$${m.revenue.toLocaleString()}</b><span>Revenue (mock)</span></div></div>
          <div class="ov-stat"><span class="ovs-ico">${svg("gauge", 15)}</span><div class="ovs-t"><b>${m.bounce_rate}%</b><span>Bounce rate (mock)</span></div></div>
          <div class="ov-stat"><span class="ovs-ico">${svg("rocket", 15)}</span><div class="ovs-t"><b>${m.cwv.lcp}s / ${m.cwv.cls} / ${m.cwv.inp}ms</b><span>LCP / CLS / INP (mock)</span></div></div>
        </div>
      </div>
      <div class="dd-section"><div class="dd-h">AI insights</div><div class="attn-list" style="max-height:none">${insightRows}</div></div>
      <div class="dd-section"><div class="dd-h">Activity timeline</div><div class="ov-list">${timelineRows}</div></div>
      <div class="dd-section"><div class="dd-h">Environment</div>
        <div class="ov-stats" style="grid-template-columns:repeat(3,1fr)">
          <div class="ov-stat"><span class="ovs-ico">${svg("link", 15)}</span><div class="ovs-t"><b>${esc(ssl)}</b><span>SSL status</span></div></div>
          <div class="ov-stat"><span class="ovs-ico">${svg("globe", 15)}</span><div class="ovs-t"><b>${esc(env)}</b><span>Environment</span></div></div>
          <div class="ov-stat"><span class="ovs-ico">${svg("layers", 15)}</span><div class="ovs-t"><b>${build}</b><span>Build number</span></div></div>
        </div>
      </div>`;
  }
  function closeDetailsDrawer() {
    $(".dd-scrim")?.classList.remove("open");
    $(".dd-panel")?.classList.remove("open");
    setTimeout(() => { $(".dd-scrim")?.remove(); $(".dd-panel")?.remove(); }, 260);
  }
  function openDetailsDrawer(siteId) {
    const site = (state.sites || []).find((s) => s.id === siteId); if (!site) return;
    closeDetailsDrawer();
    const scrim = el("div", "dd-scrim");
    const panel = el("aside", "dd-panel", `
      <header class="dd-head"><span class="sc-favi ${site.style_preset ? "sc-favi-" + esc(site.style_preset) : ""}">${esc(initials(site.name))}</span>
        <div class="dd-title"><b>${esc(site.name)}</b><span>${esc(site.client_name || site.name)}</span></div>
        <button class="icon-btn" id="ddClose" aria-label="Close details">${svg("x", 16)}</button></header>
      <div class="dd-body">${detailsDrawerBody(site)}</div>`);
    document.body.appendChild(scrim); document.body.appendChild(panel);
    requestAnimationFrame(() => { scrim.classList.add("open"); panel.classList.add("open"); });
    scrim.addEventListener("click", closeDetailsDrawer);
    $("#ddClose", panel).addEventListener("click", closeDetailsDrawer);
  }
  // The card's consolidated quick-actions menu — everything that used to be its own
  // icon button except Preview and Publish (kept visible on the card in Task 10).
  function siteMoreMenu() {
```

- [ ] **Step 2: Close the drawer on Escape too**

Find this line (added by Task 11 Step 2):

```js
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closePop(); });
```

Replace it with:

```js
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") { closePop(); closeDetailsDrawer(); } });
```

- [ ] **Step 3: CSS for the drawer**

Find this line (currently `m19-studio.css:598`, the end of the Slice D block):

```css
.cmp-main span{font-size:12px;color:var(--ink-400)}
```

Replace it with:

```css
.cmp-main span{font-size:12px;color:var(--ink-400)}

/* ═══ Hero/portfolio slice 2 — per-site "Details" drawer (dynamic, not mounted) ═══ */
.dd-scrim{position:fixed;inset:0;z-index:71;background:rgba(4,9,10,.5);backdrop-filter:blur(3px);
  opacity:0;pointer-events:none;transition:opacity .3s}
.dd-scrim.open{opacity:1;pointer-events:auto}
.dd-panel{position:fixed;top:0;right:0;bottom:0;z-index:72;width:460px;max-width:96vw;display:flex;flex-direction:column;
  background:var(--card-solid);border-left:.5px solid var(--glass-border);box-shadow:-18px 0 50px rgba(4,9,10,.28);
  transform:translateX(100%);transition:transform .34s var(--ease-premium);overflow-y:auto}
.dd-panel.open{transform:none}
.dd-head{display:flex;align-items:center;gap:11px;padding:16px;border-bottom:.5px solid var(--line);flex:none;
  position:sticky;top:0;background:var(--card-solid);z-index:1}
.dd-title{display:flex;flex-direction:column;line-height:1.2;flex:1;min-width:0}
.dd-title b{font-family:var(--font-serif);font-size:15px;color:var(--ink-900)}
.dd-title span{font-size:11.5px;color:var(--ink-400)}
.dd-body{padding:16px;display:flex;flex-direction:column;gap:18px}
.dd-section .dd-h{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-400);
  margin-bottom:8px;display:flex;align-items:center}
@media(max-width:520px){ .dd-panel{width:100vw;max-width:100vw} }
@media(prefers-reduced-motion:reduce){ .dd-panel,.dd-scrim{transition:none!important} }
```

- [ ] **Step 4: Verify via the preview tool**

1. `preview_eval: location.reload()`, then `preview_eval: location.hash = "#/sites"`.
2. `preview_click` the "⋯" button on a card, then `preview_click` "Details" — `preview_snapshot` and confirm the drawer slides in from the right showing: full health breakdown (9 rows including Security/Conversion/Content), a "Progress" section with 6 bars and an overall % pill, business metrics (Leads/Forms/Bookings/Conversion rate/Unique visitors/Revenue/Bounce rate/CWV), an AI-insights list, an activity timeline, and Environment (SSL/Environment/Build number).
3. `preview_click` on the scrim (background) — confirm the drawer closes.
4. Reopen it, press `Escape` — confirm it closes the same way.
5. `preview_console_logs` with `level: "error"` — expect empty output.
6. `preview_resize` to `mobile` (375px) with the drawer open — `preview_screenshot` and confirm the drawer fills the viewport width with no horizontal page scroll.

---

### Task 13: Card favorites, tags, and bulk actions

**Files:**
- Modify: `frontend/js/m19-sites.js:1369-1370` area (add `favSites`/`toggleFavSite`/`siteTags`/`setSiteTags` next to the other localStorage helpers added in Task 9)
- Modify: `frontend/js/m19-sites.js` (`siteCard()`, produced by Task 10 — add the favorite star, bulk checkbox and tags row)
- Modify: `frontend/js/m19-sites.js` (`viewSites()`, produced by Task 8 — render the floating bulk-action bar)
- Modify: `frontend/js/m19-sites.js` (`bindSites()`, produced by Task 9 — wire favorites, tag editing and bulk selection)
- Modify: `frontend/styles/m19-studio.css` (new `.sc-fav`/`.sc-tags`/`.sc-bulk-check`/`.bulk-bar` rules)

- [ ] **Step 1: Add the favorites/tags localStorage helpers**

Find this block (produced by Task 9 Step 1):

```js
  const toggleFav = (id) => { const f = favTemplates(); const i = f.indexOf(id); if (i >= 0) f.splice(i, 1); else f.push(id); try { localStorage.setItem("aimindshare-tpl-favs", JSON.stringify(f)); } catch (e) {} return f.includes(id); };
  // Hero prompt history — same localStorage pattern as favTemplates(): capped at 5,
  // most-recent-first, deduped by exact text. Session-local, nothing server-side.
  const HERO_PROMPTS_KEY = "aimindshare-hero-prompts";
  const heroPromptHistory = () => { try { return JSON.parse(localStorage.getItem(HERO_PROMPTS_KEY) || "[]"); } catch (e) { return []; } };
  const pushHeroPrompt = (text) => { const list = heroPromptHistory().filter((p) => p !== text); list.unshift(text); try { localStorage.setItem(HERO_PROMPTS_KEY, JSON.stringify(list.slice(0, 5))); } catch (e) {} };
```

Replace it with:

```js
  const toggleFav = (id) => { const f = favTemplates(); const i = f.indexOf(id); if (i >= 0) f.splice(i, 1); else f.push(id); try { localStorage.setItem("aimindshare-tpl-favs", JSON.stringify(f)); } catch (e) {} return f.includes(id); };
  // Hero prompt history — same localStorage pattern as favTemplates(): capped at 5,
  // most-recent-first, deduped by exact text. Session-local, nothing server-side.
  const HERO_PROMPTS_KEY = "aimindshare-hero-prompts";
  const heroPromptHistory = () => { try { return JSON.parse(localStorage.getItem(HERO_PROMPTS_KEY) || "[]"); } catch (e) { return []; } };
  const pushHeroPrompt = (text) => { const list = heroPromptHistory().filter((p) => p !== text); list.unshift(text); try { localStorage.setItem(HERO_PROMPTS_KEY, JSON.stringify(list.slice(0, 5))); } catch (e) {} };
  // Portfolio favorites/tags — same localStorage pattern again, this time keyed by
  // site id instead of template id. No schema change; local-only, per spec §3.
  const FAV_SITES_KEY = "aimindshare-sites-favs", SITE_TAGS_KEY = "aimindshare-sites-tags";
  const favSites = () => { try { return JSON.parse(localStorage.getItem(FAV_SITES_KEY) || "[]"); } catch (e) { return []; } };
  const toggleFavSite = (id) => { const f = favSites(); const i = f.indexOf(id); if (i >= 0) f.splice(i, 1); else f.push(id); try { localStorage.setItem(FAV_SITES_KEY, JSON.stringify(f)); } catch (e) {} return f.includes(id); };
  const siteTagsMap = () => { try { return JSON.parse(localStorage.getItem(SITE_TAGS_KEY) || "{}"); } catch (e) { return {}; } };
  const siteTagsFor = (id) => siteTagsMap()[id] || [];
  const setSiteTags = (id, tags) => { const m = siteTagsMap(); m[id] = tags; try { localStorage.setItem(SITE_TAGS_KEY, JSON.stringify(m)); } catch (e) {} };
```

- [ ] **Step 2: Add the favorite star, bulk-select checkbox and tags row to `siteCard()`**

Find this block (produced by Task 10 Step 1):

```js
  function siteCard(s, attn) {
    const domain = s.primary_domain || (s.subdomain + ".aimindshare.site");
    const staging = `https://${s.subdomain || "site"}.aimindshare.site/?pt=${s.preview_token || ""}`;
    const share = `https://${esc(domain)}`;
    const spark = (s.traffic && s.traffic.length)
      ? `<span class="spark" title="Last 7 days">${s.traffic.map((v) => `<i style="height:${Math.max(12, Math.round(v / Math.max(...s.traffic) * 100))}%"></i>`).join("")}</span>`
      : `<span class="spark spark-empty">no traffic yet</span>`;
    // Team assigned to this site — avatar cluster + "last edited by" convention
    // (the first assigned member stands in for "last touched by").
    const teamIds = (state.teamBySite || {})[s.id] || [];
    const teamMembers = teamIds.map((id) => (state.team || []).find((t) => t.id === id)).filter(Boolean);
    const lastEditor = teamMembers[0] ? teamMembers[0].name : null;
    const pubMeta = (s.last_published
      ? `${s.last_version ? "v" + s.last_version + " · " : ""}published ${fmtDate(s.last_published)}`
      : `never published`) + (lastEditor ? ` · edited by ${esc(lastEditor)}` : "");
    // Domain-status chip (custom + live, or staging-only).
    const domChip = s.primary_domain
      ? `<span class="pill success" title="Custom domain connected">${svg("link", 11)} ${esc(s.primary_domain)}</span>`
      : `<span class="pill plain" title="Always-on staging subdomain">staging only</span>`;
    // Health-dimension dots from the site's quality report (SEO / schema / accessibility / perf).
    const h = (state.healthBySite || {})[s.id];
    const dot = (key, label) => { const c = h && (h.categories || []).find((x) => x.key === key); const st = c ? c.status : "na";
      return `<span class="hd hd-${st}" title="${label}: ${c ? esc(c.detail) : "—"}"></span>`; };
    const dots = h ? `<span class="sc-dots" title="Content health">${dot("seo", "SEO")}${dot("schema", "Schema")}${dot("a11y", "Accessibility")}${dot("perf", "Performance")}</span>` : "";
    // Client / category identity row — client_name falls back to the site name.
    const clientName = s.client_name || s.name;
    const nicheOpt = NICHE_OPTS.find(([v]) => v === s.niche);
    // Card-local status pill: Archived / Review override the base status pill for
    // display purposes only — s.status itself is never mutated here.
    const isReview = (state.reviewBySite || {})[s.id] === "review";
    const cardStatus = s.archived ? `<span class="pill idle">Archived</span>` : isReview ? `<span class="pill warning">Review</span>` : statusPill(s.status);
    // Team avatar cluster — up to 3 stacked initials + "+N" overflow.
    const teamCluster = teamMembers.length ? `<span class="sc-team" title="${esc(teamMembers.map((t) => t.name + " · " + t.role).join(", "))}">${
      teamMembers.slice(0, 3).map((t) => `<span class="team-av ${t.color === "gold" ? "ta-gold" : ""}">${esc(t.initials)}</span>`).join("")
    }${teamMembers.length > 3 ? `<span class="team-av ta-more">+${teamMembers.length - 3}</span>` : ""}</span>` : "";
    // One inline AI-insight line — the single top-ranked attentionItems() result for
    // just this site (same engine the Dashboard panel and the attention strip use).
    const insight = attentionItems([s])[0];
    return `
      <div class="site-card sc-rich reveal" data-site="${esc(s.id)}" data-status="${esc(s.status)}" data-attn="${attn ? 1 : 0}" data-name="${esc(s.name.toLowerCase())}" data-niche="${esc(s.niche || "")}" data-archived="${s.archived ? 1 : 0}">
        <div class="sc-top">
          <span class="sc-favi ${s.style_preset ? "sc-favi-" + esc(s.style_preset) : ""}">${esc(initials(s.name))}</span>
          <div class="sc-id"><h3>${esc(s.name)}</h3>
            <button class="sc-domain" data-copy="${esc(domain)}">${svg("globe", 13)} ${esc(domain)} ${svg("copy", 12)}</button>
          </div>
          <button class="sc-health" data-gohealth="${esc(s.id)}" title="Site health — SEO, schema, accessibility, performance">${healthRing(s.health_score)}</button>
        </div>
        <div class="sc-client">
          <span class="sc-client-name">${esc(clientName)}</span>
          ${nicheOpt ? `<span class="pill plain sc-niche">${esc(nicheOpt[1])}</span>` : ""}
        </div>
        <div class="sc-meta">
          ${cardStatus}
          ${s.maintenance_mode ? `<span class="pill warning">maintenance</span>` : ""}
          ${domChip}
          <span class="pill plain">${s.pages} ${s.pages === 1 ? "page" : "pages"}</span>
          ${s.language && s.language !== "en" ? `<span class="pill plain">${esc(s.language)}</span>` : ""}
          ${dots}
        </div>
        ${insight ? `<div class="sc-insight"><span class="si-ico">${svg(insight.ico, 13)}</span><span>${esc(insight.title)}</span></div>` : ""}
        <div class="sc-stats">
          <span class="sc-stat"><span class="cs-num">${esc(pubMeta)}</span><span class="cs-lab">Publish history</span></span>
          <span class="sc-stat sc-stat-spark">${spark}<span class="cs-lab">${s.sessions_7d != null ? s.sessions_7d + " sessions · 7d" : "Traffic"}</span></span>
        </div>
        <div class="sc-foot">
          <span class="sc-quick">
            ${teamCluster}
            <button class="icon-btn sm" data-copy="${esc(staging)}" title="Copy staging preview link (drafts + maintenance bypass)">${svg("eye", 14)}</button>
            <button class="icon-btn sm" data-publish="${esc(s.id)}" title="Publish — runs the pre-flight quality gate">${svg("rocket", 14)}</button>
            <button class="icon-btn sm" data-more="${esc(s.id)}" data-share="${esc(share)}" title="More actions">⋯</button>
          </span>
          <span style="display:flex;gap:8px">
            <button class="btn btn-ghost btn-sm" data-open="${esc(s.id)}">Manage</button>
            <button class="btn btn-primary btn-sm" data-editsite="${esc(s.id)}">${svg("edit", 13)} Edit</button>
          </span>
        </div>
      </div>`;
  }
```

Replace it with:

```js
  function siteCard(s, attn) {
    const domain = s.primary_domain || (s.subdomain + ".aimindshare.site");
    const staging = `https://${s.subdomain || "site"}.aimindshare.site/?pt=${s.preview_token || ""}`;
    const share = `https://${esc(domain)}`;
    const spark = (s.traffic && s.traffic.length)
      ? `<span class="spark" title="Last 7 days">${s.traffic.map((v) => `<i style="height:${Math.max(12, Math.round(v / Math.max(...s.traffic) * 100))}%"></i>`).join("")}</span>`
      : `<span class="spark spark-empty">no traffic yet</span>`;
    // Team assigned to this site — avatar cluster + "last edited by" convention
    // (the first assigned member stands in for "last touched by").
    const teamIds = (state.teamBySite || {})[s.id] || [];
    const teamMembers = teamIds.map((id) => (state.team || []).find((t) => t.id === id)).filter(Boolean);
    const lastEditor = teamMembers[0] ? teamMembers[0].name : null;
    const pubMeta = (s.last_published
      ? `${s.last_version ? "v" + s.last_version + " · " : ""}published ${fmtDate(s.last_published)}`
      : `never published`) + (lastEditor ? ` · edited by ${esc(lastEditor)}` : "");
    // Domain-status chip (custom + live, or staging-only).
    const domChip = s.primary_domain
      ? `<span class="pill success" title="Custom domain connected">${svg("link", 11)} ${esc(s.primary_domain)}</span>`
      : `<span class="pill plain" title="Always-on staging subdomain">staging only</span>`;
    // Health-dimension dots from the site's quality report (SEO / schema / accessibility / perf).
    const h = (state.healthBySite || {})[s.id];
    const dot = (key, label) => { const c = h && (h.categories || []).find((x) => x.key === key); const st = c ? c.status : "na";
      return `<span class="hd hd-${st}" title="${label}: ${c ? esc(c.detail) : "—"}"></span>`; };
    const dots = h ? `<span class="sc-dots" title="Content health">${dot("seo", "SEO")}${dot("schema", "Schema")}${dot("a11y", "Accessibility")}${dot("perf", "Performance")}</span>` : "";
    // Client / category identity row — client_name falls back to the site name.
    const clientName = s.client_name || s.name;
    const nicheOpt = NICHE_OPTS.find(([v]) => v === s.niche);
    // Card-local status pill: Archived / Review override the base status pill for
    // display purposes only — s.status itself is never mutated here.
    const isReview = (state.reviewBySite || {})[s.id] === "review";
    const cardStatus = s.archived ? `<span class="pill idle">Archived</span>` : isReview ? `<span class="pill warning">Review</span>` : statusPill(s.status);
    // Team avatar cluster — up to 3 stacked initials + "+N" overflow.
    const teamCluster = teamMembers.length ? `<span class="sc-team" title="${esc(teamMembers.map((t) => t.name + " · " + t.role).join(", "))}">${
      teamMembers.slice(0, 3).map((t) => `<span class="team-av ${t.color === "gold" ? "ta-gold" : ""}">${esc(t.initials)}</span>`).join("")
    }${teamMembers.length > 3 ? `<span class="team-av ta-more">+${teamMembers.length - 3}</span>` : ""}</span>` : "";
    // One inline AI-insight line — the single top-ranked attentionItems() result for
    // just this site (same engine the Dashboard panel and the attention strip use).
    const insight = attentionItems([s])[0];
    // Favorites + tags — both local-only (Task 13), no schema change.
    const isFav = favSites().includes(s.id);
    const tags = siteTagsFor(s.id);
    const tagsRow = `<div class="sc-tags">${tags.map((t) => `<span class="tag-chip">${esc(t)}</span>`).join("")}<button class="tag-add" data-tagedit="${esc(s.id)}">${svg("plus", 10)} Tag</button></div>`;
    return `
      <div class="site-card sc-rich reveal" data-site="${esc(s.id)}" data-status="${esc(s.status)}" data-attn="${attn ? 1 : 0}" data-name="${esc(s.name.toLowerCase())}" data-niche="${esc(s.niche || "")}" data-archived="${s.archived ? 1 : 0}" data-fav="${isFav ? 1 : 0}" data-tags="${esc(tags.join(",").toLowerCase())}">
        <input type="checkbox" class="sc-bulk-check" data-bulk="${esc(s.id)}" title="Select for bulk actions">
        <div class="sc-top">
          <span class="sc-favi ${s.style_preset ? "sc-favi-" + esc(s.style_preset) : ""}">${esc(initials(s.name))}</span>
          <div class="sc-id"><h3>${esc(s.name)}</h3>
            <button class="sc-domain" data-copy="${esc(domain)}">${svg("globe", 13)} ${esc(domain)} ${svg("copy", 12)}</button>
          </div>
          <button class="icon-btn sm sc-fav ${isFav ? "on" : ""}" data-favsite="${esc(s.id)}" title="Favorite">${svg("star", 14)}</button>
          <button class="sc-health" data-gohealth="${esc(s.id)}" title="Site health — SEO, schema, accessibility, performance">${healthRing(s.health_score)}</button>
        </div>
        <div class="sc-client">
          <span class="sc-client-name">${esc(clientName)}</span>
          ${nicheOpt ? `<span class="pill plain sc-niche">${esc(nicheOpt[1])}</span>` : ""}
        </div>
        <div class="sc-meta">
          ${cardStatus}
          ${s.maintenance_mode ? `<span class="pill warning">maintenance</span>` : ""}
          ${domChip}
          <span class="pill plain">${s.pages} ${s.pages === 1 ? "page" : "pages"}</span>
          ${s.language && s.language !== "en" ? `<span class="pill plain">${esc(s.language)}</span>` : ""}
          ${dots}
        </div>
        ${insight ? `<div class="sc-insight"><span class="si-ico">${svg(insight.ico, 13)}</span><span>${esc(insight.title)}</span></div>` : ""}
        ${tagsRow}
        <div class="sc-stats">
          <span class="sc-stat"><span class="cs-num">${esc(pubMeta)}</span><span class="cs-lab">Publish history</span></span>
          <span class="sc-stat sc-stat-spark">${spark}<span class="cs-lab">${s.sessions_7d != null ? s.sessions_7d + " sessions · 7d" : "Traffic"}</span></span>
        </div>
        <div class="sc-foot">
          <span class="sc-quick">
            ${teamCluster}
            <button class="icon-btn sm" data-copy="${esc(staging)}" title="Copy staging preview link (drafts + maintenance bypass)">${svg("eye", 14)}</button>
            <button class="icon-btn sm" data-publish="${esc(s.id)}" title="Publish — runs the pre-flight quality gate">${svg("rocket", 14)}</button>
            <button class="icon-btn sm" data-more="${esc(s.id)}" data-share="${esc(share)}" title="More actions">⋯</button>
          </span>
          <span style="display:flex;gap:8px">
            <button class="btn btn-ghost btn-sm" data-open="${esc(s.id)}">Manage</button>
            <button class="btn btn-primary btn-sm" data-editsite="${esc(s.id)}">${svg("edit", 13)} Edit</button>
          </span>
        </div>
      </div>`;
  }
```

(The tag editor is a `prompt()`-based comma-separated list — same lightweight convention `bindBusinessProfile()`'s `#bpAddTesti` already uses for ad-hoc input — rather than a new inline chip-input widget; a judgment call favoring simplicity over a bespoke editor for a mockup feature.)

- [ ] **Step 3: Render the floating bulk-action bar in `viewSites()`**

Find this block (produced by Task 8 Step 2):

```js
    return previewStrip() + `<div class="studio">
      ${sitesHero()}
      ${heroMetrics()}
      ${sitesQuickCreate()}
      ${sitesHead(sites)}
      <section class="st-sec reveal">
        <div class="dt-toolbar">
          <label class="dt-search">${svg("search", 15)}<input id="sitesSearch" placeholder="Filter websites by name…" autocomplete="off"></label>
          <div class="dt-chips">${chips}</div>
        </div>
        <div class="site-grid" id="sitesGrid">${sites.map((s) => siteCard(s, attnIds.has(s.id))).join("")}</div>
        <div class="empty-inline" id="sitesEmpty" style="${sites.length ? "display:none" : ""}">${sites.length ? "No websites match this filter." : "No websites yet — create your first one above."}</div>
      </section>
    </div>`;
```

Replace it with:

```js
    return previewStrip() + `<div class="studio">
      ${sitesHero()}
      ${heroMetrics()}
      ${sitesQuickCreate()}
      ${sitesHead(sites)}
      <section class="st-sec reveal">
        <div class="dt-toolbar">
          <label class="dt-search">${svg("search", 15)}<input id="sitesSearch" placeholder="Filter websites by name…" autocomplete="off"></label>
          <div class="dt-chips">${chips}</div>
        </div>
        <div class="site-grid" id="sitesGrid">${sites.map((s) => siteCard(s, attnIds.has(s.id))).join("")}</div>
        <div class="empty-inline" id="sitesEmpty" style="${sites.length ? "display:none" : ""}">${sites.length ? "No websites match this filter." : "No websites yet — create your first one above."}</div>
      </section>
      <div class="bulk-bar" id="bulkBar" style="display:none">
        <span class="bulk-count" id="bulkCount">0 selected</span>
        <button class="btn btn-ghost btn-sm" data-bulk-act="publish">${svg("rocket", 13)} Publish selected</button>
        <button class="btn btn-ghost btn-sm" data-bulk-act="archive">${svg("doc", 13)} Archive selected</button>
        <button class="btn btn-ghost btn-sm" data-bulk-act="tag">${svg("layers", 13)} Tag selected</button>
        <button class="icon-btn sm" id="bulkClear" title="Clear selection">${svg("x", 13)}</button>
      </div>
    </div>`;
```

- [ ] **Step 4: Wire favorites, tag editing and bulk selection**

Find this block (produced by Task 9 Step 3):

```js
    // Composer extras (hero only) — attach + competitor URL both show the same
    // flagged toast the Clone/Import flows already use; nothing is read or uploaded.
    $("#heroAttach")?.addEventListener("change", () => toast("Business brief / competitor analysis runs with the AI provider — flagged, not faked.", "info"));
    $("#heroCompetitorToggle")?.addEventListener("click", () => $("#heroCompetitorBox")?.toggleAttribute("hidden"));
    $("#heroCompetitorGo")?.addEventListener("click", () => {
      const u = $("#heroCompetitorUrl"); if (!u || !u.value.trim()) { u?.focus(); return; }
      toast("Business brief / competitor analysis runs with the AI provider — flagged, not faked.", "info");
    });
    $$("#heroRecent [data-recent]").forEach((b) => b.addEventListener("click", () => { const ta = $("#heroPrompt"); ta.value = b.dataset.recent; ta.focus(); }));
  }
```

Replace it with:

```js
    // Composer extras (hero only) — attach + competitor URL both show the same
    // flagged toast the Clone/Import flows already use; nothing is read or uploaded.
    $("#heroAttach")?.addEventListener("change", () => toast("Business brief / competitor analysis runs with the AI provider — flagged, not faked.", "info"));
    $("#heroCompetitorToggle")?.addEventListener("click", () => $("#heroCompetitorBox")?.toggleAttribute("hidden"));
    $("#heroCompetitorGo")?.addEventListener("click", () => {
      const u = $("#heroCompetitorUrl"); if (!u || !u.value.trim()) { u?.focus(); return; }
      toast("Business brief / competitor analysis runs with the AI provider — flagged, not faked.", "info");
    });
    $$("#heroRecent [data-recent]").forEach((b) => b.addEventListener("click", () => { const ta = $("#heroPrompt"); ta.value = b.dataset.recent; ta.focus(); }));
    // Favorites — instant local toggle, no full re-render needed.
    $$("[data-favsite]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); const on = toggleFavSite(b.dataset.favsite); b.classList.toggle("on", on); b.closest(".site-card")?.setAttribute("data-fav", on ? "1" : "0"); }));
    // Tag editor — a plain prompt() (comma-separated), same lightweight convention
    // already used by the Business Profile tab's ad-hoc inputs.
    $$("[data-tagedit]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = b.dataset.tagedit;
      const current = siteTagsFor(id).join(", ");
      const next = prompt("Tags (comma-separated)", current);
      if (next == null) return;
      setSiteTags(id, next.split(",").map((t) => t.trim()).filter(Boolean));
      render();
    }));
    // Bulk selection — a plain Set kept in this closure; rebuilt every render().
    const bulkBar = $("#bulkBar"), bulkCount = $("#bulkCount");
    const selected = new Set();
    function updateBulkBar() {
      if (!bulkBar) return;
      bulkBar.style.display = selected.size ? "flex" : "none";
      if (bulkCount) bulkCount.textContent = selected.size + " selected";
    }
    $$("[data-bulk]").forEach((cb) => cb.addEventListener("change", () => {
      if (cb.checked) selected.add(cb.dataset.bulk); else selected.delete(cb.dataset.bulk);
      updateBulkBar();
    }));
    $("#bulkClear")?.addEventListener("click", () => { selected.clear(); $$("[data-bulk]").forEach((cb) => cb.checked = false); updateBulkBar(); });
    $$("[data-bulk-act]").forEach((b) => b.addEventListener("click", () => {
      const act = b.dataset.bulkAct, ids = Array.from(selected); if (!ids.length) return;
      if (act === "publish") {
        ids.forEach((id) => { const s = state.sites.find((x) => x.id === id); if (s && s.status !== "published") { s.status = "published"; s.last_published = new Date().toISOString(); } });
        toast(`Published ${ids.length} site${ids.length === 1 ? "" : "s"} (mockup).`, "success");
      } else if (act === "archive") {
        ids.forEach((id) => { const s = state.sites.find((x) => x.id === id); if (s) s.archived = true; });
        toast(`Archived ${ids.length} site${ids.length === 1 ? "" : "s"}.`, "success");
      } else if (act === "tag") {
        const next = prompt("Tags to apply (comma-separated)", ""); if (next == null) return;
        const tags = next.split(",").map((t) => t.trim()).filter(Boolean);
        ids.forEach((id) => setSiteTags(id, tags));
        toast(`Tagged ${ids.length} site${ids.length === 1 ? "" : "s"}.`, "success");
      }
      selected.clear(); render();
    }));
  }
```

- [ ] **Step 5: CSS for the star, tags row, bulk checkbox and floating bar**

Find this block (produced by Task 10 Step 2, at the end of the "card enrichments" CSS block):

```css
.sc-team{display:inline-flex;align-items:center;margin-right:2px}
.sc-team .team-av{width:22px;height:22px;border-radius:50%;background:var(--grad-brand);color:#fff;font-family:var(--font-mono);
  font-size:9.5px;font-weight:700;display:grid;place-items:center;border:1.5px solid var(--card-solid);margin-left:-6px}
.sc-team .team-av:first-child{margin-left:0}
.sc-team .team-av.ta-gold{background:var(--grad-gold);color:#1A0E00}
.sc-team .team-av.ta-more{background:var(--ink-300);color:#fff}
```

Replace it with:

```css
.sc-team{display:inline-flex;align-items:center;margin-right:2px}
.sc-team .team-av{width:22px;height:22px;border-radius:50%;background:var(--grad-brand);color:#fff;font-family:var(--font-mono);
  font-size:9.5px;font-weight:700;display:grid;place-items:center;border:1.5px solid var(--card-solid);margin-left:-6px}
.sc-team .team-av:first-child{margin-left:0}
.sc-team .team-av.ta-gold{background:var(--grad-gold);color:#1A0E00}
.sc-team .team-av.ta-more{background:var(--ink-300);color:#fff}
.site-card.sc-rich{position:relative}
.sc-fav{color:var(--ink-300)}
.sc-fav.on,.sc-fav:hover{color:var(--gold-500)}
.sc-bulk-check{position:absolute;top:14px;left:14px;width:17px;height:17px;z-index:2;accent-color:var(--teal-700);
  opacity:0;transition:opacity .15s}
.site-card.sc-rich:hover .sc-bulk-check,.sc-bulk-check:checked{opacity:1}
.sc-tags{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px}
.tag-chip{font-size:10.5px;color:var(--ink-500);border:.5px solid var(--line-strong);border-radius:var(--r-pill);padding:2px 8px}
.tag-add{display:inline-flex;align-items:center;gap:3px;font-size:10.5px;color:var(--ink-400);background:none;border:none;
  cursor:pointer;padding:2px 4px}
.tag-add:hover{color:var(--teal-700)}
:root[data-theme="dark"] .tag-add:hover{color:var(--teal-300)}
.bulk-bar{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:56;display:flex;align-items:center;gap:10px;
  padding:10px 16px;border-radius:var(--r-pill);background:var(--card-solid);border:.5px solid var(--glass-border);
  box-shadow:0 14px 40px rgba(4,9,10,.22)}
.bulk-count{font-size:12.5px;color:var(--ink-500);font-weight:600;white-space:nowrap}
@media(max-width:760px){ .bulk-bar{left:12px;right:12px;transform:none;flex-wrap:wrap;justify-content:center} }
```

- [ ] **Step 6: Verify via the preview tool**

1. `preview_eval: location.reload()`, then `preview_eval: location.hash = "#/sites"`.
2. `preview_click` a card's star icon (`[data-favsite]`) — confirm it turns gold/"on" and `preview_eval: location.reload()` then re-check `#/sites` — confirm it's still marked favorite (persisted).
3. `preview_click` a card's "+ Tag" control — since `prompt()` can't be driven by the preview tool, instead verify the wiring directly: `preview_eval: (() => { const id = document.querySelector("[data-tagedit]").dataset.tagedit; return id; })()` to confirm the attribute exists, then rely on the code-review reading of Step 4 for the prompt() flow (no automated way to answer a native `prompt()` dialog from this tool).
4. Hover a card (`preview_eval` can't hover — instead `preview_inspect` the card's `.sc-bulk-check` and confirm it exists in the DOM even though it's visually `opacity:0` until hover/checked).
5. `preview_eval: document.querySelector(".sc-bulk-check").click()` — confirm the floating bulk bar (`#bulkBar`) becomes visible with "1 selected".
6. `preview_click` "Archive selected" — confirm a success toast appears, the bar hides again (selection cleared + `render()` ran), and that site's status pill now reads "Archived" on its card.
7. `preview_console_logs` with `level: "error"` — expect empty output.

---

### Task 14: Toolbar upgrade — Filters popover, Sort, Grid/List toggle, Saved views

**Files:**
- Modify: `frontend/js/m19-sites.js` (add `sortSites()` right before `viewSites()`)
- Modify: `frontend/js/m19-sites.js` (add saved-views + filters-popover helpers, right after the Task 13 tags helpers)
- Modify: `frontend/js/m19-sites.js` (`viewSites()`, produced by Task 13 Step 3)
- Modify: `frontend/js/m19-sites.js:2008-2014` (`bindSites()` — swap `bindSitesFilter()` for `bindPortfolioToolbar()`)
- Modify: `frontend/js/m19-sites.js:2015-2029` (replace `bindSitesFilter()` with `bindPortfolioToolbar()`)
- Modify: `frontend/styles/m19-studio.css` (new `.seg-toggle` / 2-column grid default rules)

- [ ] **Step 1: Add `sortSites()` right before `viewSites()`**

Find this block (unchanged since the original file):

```js
  function sitesHead(sites) {
    return `<div class="dash-head reveal">
      <div class="dh-l"><span class="st-eyebrow">${svg("globe", 12)} Websites</span>
        <h2>Your <em>portfolio</em></h2>
        <p class="dh-lead">Every website in this workspace${sites.length ? ` — ${sites.length} site${sites.length === 1 ? "" : "s"}` : ""}.</p></div>
      <div class="dh-actions"><button class="btn btn-primary" id="newSite">${svg("plus", 14)} New site</button></div>
    </div>`;
  }
  function viewSites() {
```

Replace it with:

```js
  function sitesHead(sites) {
    return `<div class="dash-head reveal">
      <div class="dh-l"><span class="st-eyebrow">${svg("globe", 12)} Websites</span>
        <h2>Your <em>portfolio</em></h2>
        <p class="dh-lead">Every website in this workspace${sites.length ? ` — ${sites.length} site${sites.length === 1 ? "" : "s"}` : ""}.</p></div>
      <div class="dh-actions"><button class="btn btn-primary" id="newSite">${svg("plus", 14)} New site</button></div>
    </div>`;
  }
  // Sort — pure function over a list, driven by state.sitesToolbar.sort. A full
  // render() is what actually invokes this (see viewSites()), since reordering the
  // DOM in place isn't worth the complexity for a mockup-scale site list.
  function sortSites(list) {
    const sort = state.sitesToolbar.sort;
    const arr = list.slice();
    if (sort === "updated") arr.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    else if (sort === "health") arr.sort((a, b) => (b.health_score || 0) - (a.health_score || 0));
    else if (sort === "traffic") arr.sort((a, b) => (b.sessions_7d || 0) - (a.sessions_7d || 0));
    else arr.sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }
  function viewSites() {
```

- [ ] **Step 2: Add the Saved-views store + the two popover-content builders**

Find this block (produced by Task 13 Step 1):

```js
  const siteTagsMap = () => { try { return JSON.parse(localStorage.getItem(SITE_TAGS_KEY) || "{}"); } catch (e) { return {}; } };
  const siteTagsFor = (id) => siteTagsMap()[id] || [];
  const setSiteTags = (id, tags) => { const m = siteTagsMap(); m[id] = tags; try { localStorage.setItem(SITE_TAGS_KEY, JSON.stringify(m)); } catch (e) {} };
```

Replace it with:

```js
  const siteTagsMap = () => { try { return JSON.parse(localStorage.getItem(SITE_TAGS_KEY) || "{}"); } catch (e) { return {}; } };
  const siteTagsFor = (id) => siteTagsMap()[id] || [];
  const setSiteTags = (id, tags) => { const m = siteTagsMap(); m[id] = tags; try { localStorage.setItem(SITE_TAGS_KEY, JSON.stringify(m)); } catch (e) {} };
  // Saved views — same localStorage pattern once more; a saved view snapshots the
  // whole toolbar combo (status chip, search, category, needs-attention, tag, sort, layout).
  const SITES_VIEWS_KEY = "aimindshare-sites-views";
  const savedSitesViews = () => { try { return JSON.parse(localStorage.getItem(SITES_VIEWS_KEY) || "[]"); } catch (e) { return []; } };
  const saveSitesView = (name, cfg) => { const list = savedSitesViews(); list.push({ name, ...cfg }); try { localStorage.setItem(SITES_VIEWS_KEY, JSON.stringify(list)); } catch (e) {} };
  function sitesFiltersPopoverHtml() {
    const tb = state.sitesToolbar;
    const nicheItems = NICHE_OPTS.map(([v, l]) => `<div class="pop-item" data-nicheval="${v}">${tb.niche === v ? svg("check", 13) : ""}<span class="pi-name">${esc(l)}</span></div>`).join("");
    return `
      <div class="pop-label">Category</div>
      <div class="pop-item" data-nicheval="">${!tb.niche ? svg("check", 13) : ""}<span class="pi-name">All categories</span></div>
      ${nicheItems}
      <div class="pop-sep"></div>
      <div class="pop-item" data-needsattn-toggle>${tb.needsAttn ? svg("check", 13) : ""}<span class="pi-name">Needs attention only</span></div>
      <div class="pop-sep"></div>
      <div class="pop-label">Tag contains</div>
      <input class="pop-search" id="sitesTagFilterInput" placeholder="e.g. priority — press Enter" value="${esc(tb.tag)}">`;
  }
  function sitesSavedViewsPopoverHtml() {
    const views = savedSitesViews();
    const rows = views.length ? views.map((v, i) => `<div class="pop-item" data-viewidx="${i}"><span class="pi-name">${esc(v.name)}</span></div>`).join("")
      : `<div class="pop-item" style="cursor:default"><span class="pi-sub">No saved views yet</span></div>`;
    return `<div class="pop-item action" data-saveview>${svg("plus", 13)}<span class="pi-name">Save current view…</span></div><div class="pop-sep"></div><div class="pop-label">Saved views</div>${rows}`;
  }
```

- [ ] **Step 3: Replace `viewSites()` — Filters/Sort/Grid-List, applied before rendering**

Find this block (produced by Task 13 Step 3):

```js
    return previewStrip() + `<div class="studio">
      ${sitesHero()}
      ${heroMetrics()}
      ${sitesQuickCreate()}
      ${sitesHead(sites)}
      <section class="st-sec reveal">
        <div class="dt-toolbar">
          <label class="dt-search">${svg("search", 15)}<input id="sitesSearch" placeholder="Filter websites by name…" autocomplete="off"></label>
          <div class="dt-chips">${chips}</div>
        </div>
        <div class="site-grid" id="sitesGrid">${sites.map((s) => siteCard(s, attnIds.has(s.id))).join("")}</div>
        <div class="empty-inline" id="sitesEmpty" style="${sites.length ? "display:none" : ""}">${sites.length ? "No websites match this filter." : "No websites yet — create your first one above."}</div>
      </section>
      <div class="bulk-bar" id="bulkBar" style="display:none">
        <span class="bulk-count" id="bulkCount">0 selected</span>
        <button class="btn btn-ghost btn-sm" data-bulk-act="publish">${svg("rocket", 13)} Publish selected</button>
        <button class="btn btn-ghost btn-sm" data-bulk-act="archive">${svg("doc", 13)} Archive selected</button>
        <button class="btn btn-ghost btn-sm" data-bulk-act="tag">${svg("layers", 13)} Tag selected</button>
        <button class="icon-btn sm" id="bulkClear" title="Clear selection">${svg("x", 13)}</button>
      </div>
    </div>`;
  }
```

Replace it with:

```js
    const tb = state.sitesToolbar;
    // "All" excludes archived sites (spec §2) — Archived is its own chip. Review is
    // computable today from state.reviewBySite, just not surfaced as a chip until now.
    const nonArchived = sites.filter((s) => !s.archived);
    const liveCount = nonArchived.filter((s) => s.status === "published").length;
    const draftCount = nonArchived.filter((s) => s.status === "draft").length;
    const reviewCount = nonArchived.filter((s) => (state.reviewBySite || {})[s.id] === "review").length;
    const archivedCount = sites.filter((s) => s.archived).length;
    const chipsHtml = [["all", "All", nonArchived.length], ["published", "Live", liveCount], ["draft", "Drafts", draftCount], ["review", "Review", reviewCount], ["attn", "Needs action", attnIds.size], ["archived", "Archived", archivedCount]]
      .map(([k, l, n]) => `<button class="dt-chip ${k === tb.chip ? "on" : ""}" data-schip="${k}">${l} <span class="dc-n">${n}</span></button>`).join("");
    // Filters popover (category / needs-attention / tag) decides which sites are
    // eligible at all; the status chip + search box then hide/show within that set.
    const eligible = sites.filter((s) => {
      if (tb.niche && s.niche !== tb.niche) return false;
      if (tb.needsAttn && !attnIds.has(s.id)) return false;
      if (tb.tag && !siteTagsFor(s.id).some((t) => t.toLowerCase().includes(tb.tag.toLowerCase()))) return false;
      return true;
    });
    const sorted = sortSites(eligible);
    // Grid defaults to 2 columns (richer cards need the width); List reuses the
    // existing Dashboard row renderer (dtRow) at lower fidelity — no new component.
    const gridBody = tb.view === "list"
      ? `<div class="dt" id="sitesListWrap"><div class="dt-inner">
          <div class="dt-row dt-head"><span>Site</span><span>Status</span><span class="dt-c">Pages</span><span>Domain</span><span class="dt-c">Health</span><span>Last publish</span><span>Updated</span><span class="dt-r">Actions</span></div>
          ${sorted.map((s) => dtRow(s, attnIds.has(s.id))).join("")}
        </div></div>`
      : `<div class="site-grid sg-2col" id="sitesGrid">${sorted.map((s) => siteCard(s, attnIds.has(s.id))).join("")}</div>`;
    return previewStrip() + `<div class="studio">
      ${sitesHero()}
      ${heroMetrics()}
      ${sitesQuickCreate()}
      ${sitesHead(sites)}
      <section class="st-sec reveal">
        <div class="dt-toolbar">
          <label class="dt-search">${svg("search", 15)}<input id="sitesSearch" placeholder="Filter websites by name…" autocomplete="off" value="${esc(tb.q)}"></label>
          <div class="dt-chips">${chipsHtml}</div>
          <button class="btn btn-ghost btn-sm" id="sitesFilterBtn">${svg("filter", 13)} Filters</button>
          <select class="gen-select" id="sitesSort" title="Sort">
            <option value="name" ${tb.sort === "name" ? "selected" : ""}>Name</option>
            <option value="updated" ${tb.sort === "updated" ? "selected" : ""}>Last edited</option>
            <option value="health" ${tb.sort === "health" ? "selected" : ""}>Health score</option>
            <option value="traffic" ${tb.sort === "traffic" ? "selected" : ""}>Traffic</option>
          </select>
          <span class="seg-toggle">
            <button class="icon-btn sm ${tb.view === "grid" ? "on" : ""}" data-view="grid" title="Grid view">${svg("grid", 14)}</button>
            <button class="icon-btn sm ${tb.view === "list" ? "on" : ""}" data-view="list" title="List view">${svg("rows", 14)}</button>
          </span>
          <button class="btn btn-ghost btn-sm" id="sitesSavedViewsBtn">${svg("star", 13)} Saved views</button>
        </div>
        ${gridBody}
        <div class="empty-inline" id="sitesEmpty" style="${sorted.length ? "display:none" : ""}">${sites.length ? "No websites match this filter." : "No websites yet — create your first one above."}</div>
      </section>
      <div class="bulk-bar" id="bulkBar" style="display:none">
        <span class="bulk-count" id="bulkCount">0 selected</span>
        <button class="btn btn-ghost btn-sm" data-bulk-act="publish">${svg("rocket", 13)} Publish selected</button>
        <button class="btn btn-ghost btn-sm" data-bulk-act="archive">${svg("doc", 13)} Archive selected</button>
        <button class="btn btn-ghost btn-sm" data-bulk-act="tag">${svg("layers", 13)} Tag selected</button>
        <button class="icon-btn sm" id="bulkClear" title="Clear selection">${svg("x", 13)}</button>
      </div>
    </div>`;
  }
```

(Bulk-select checkboxes only exist on `siteCard()`, so bulk actions apply to Grid view only — List view is a read/navigate-only compact layout, consistent with the spec calling it "the same card data at lower fidelity.")

- [ ] **Step 4: `bindSites()` calls the new toolbar binder**

Find this line (produced by Task 9 Step 3, inside `bindSites()`):

```js
    bindSiteCardActions();
    bindSitesFilter();
    // Hero composer — Generate opens the create modal on the AI tab, prefilled
```

Replace it with:

```js
    bindSiteCardActions();
    bindPortfolioToolbar();
    // Hero composer — Generate opens the create modal on the AI tab, prefilled
```

- [ ] **Step 5: Replace `bindSitesFilter()` with `bindPortfolioToolbar()`**

Find this block (currently `m19-sites.js:2015-2029`, unchanged since the original file):

```js
  function bindSitesFilter() {
    const grid = $("#sitesGrid"); if (!grid) return;
    const search = $("#sitesSearch"), empty = $("#sitesEmpty"), st = { chip: "all", q: "" };
    function apply() {
      let shown = 0;
      $$(".site-card", grid).forEach((c) => {
        const okChip = st.chip === "all" || (st.chip === "attn" ? c.dataset.attn === "1" : c.dataset.status === st.chip);
        const okQ = !st.q || (c.dataset.name || "").includes(st.q);
        const show = okChip && okQ; c.style.display = show ? "" : "none"; if (show) shown++;
      });
      if (empty) empty.style.display = shown ? "none" : "block";
    }
    $$("[data-schip]").forEach((b) => b.addEventListener("click", () => { $$("[data-schip]").forEach((x) => x.classList.remove("on")); b.classList.add("on"); st.chip = b.dataset.schip; apply(); }));
    search?.addEventListener("input", () => { st.q = search.value.trim().toLowerCase(); apply(); });
  }
```

Replace it with:

```js
  function bindPortfolioToolbar() {
    const tb = state.sitesToolbar;
    const search = $("#sitesSearch");
    // Status chip + search box hide/show within whatever the Filters popover already
    // made eligible (state.sites is the source of truth, not stale dataset strings —
    // this works identically whether Grid (.site-card) or List (.dt-row) is showing).
    function applyQuickFilters() {
      const q = (search?.value || "").trim().toLowerCase();
      tb.q = q;
      const container = $("#sitesGrid") || $("#sitesListWrap");
      let shown = 0;
      (state.sites || []).forEach((s) => {
        const row = container && $(`[data-site="${s.id}"]`, container);
        if (!row) return;
        const okChip = tb.chip === "all" ? !s.archived
          : tb.chip === "attn" ? row.dataset.attn === "1"
          : tb.chip === "review" ? (state.reviewBySite || {})[s.id] === "review"
          : tb.chip === "archived" ? !!s.archived
          : (s.status === tb.chip && !s.archived);
        const okQ = !q || s.name.toLowerCase().includes(q);
        const show = okChip && okQ; row.style.display = show ? "" : "none"; if (show) shown++;
      });
      const empty = $("#sitesEmpty"); if (empty) empty.style.display = shown ? "none" : "block";
    }
    applyQuickFilters();
    $$("[data-schip]").forEach((b) => b.addEventListener("click", () => { $$("[data-schip]").forEach((x) => x.classList.remove("on")); b.classList.add("on"); tb.chip = b.dataset.schip; applyQuickFilters(); }));
    search?.addEventListener("input", applyQuickFilters);
    // Sort + Grid/List both reorder/relayout the DOM, so both go through render().
    $("#sitesSort")?.addEventListener("change", (e) => { tb.sort = e.target.value; render(); });
    $$("[data-view]").forEach((b) => b.addEventListener("click", () => { tb.view = b.dataset.view; render(); }));
    // Filters popover — category / needs-attention / tag all change which sites are
    // eligible at all, so they also go through render() (see viewSites()'s `eligible`).
    $("#sitesFilterBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const pop = openPop(e.currentTarget, sitesFiltersPopoverHtml());
      $$("[data-nicheval]", pop).forEach((it) => it.addEventListener("click", () => { tb.niche = it.dataset.nicheval; closePop(); render(); }));
      $("[data-needsattn-toggle]", pop)?.addEventListener("click", () => { tb.needsAttn = !tb.needsAttn; closePop(); render(); });
      $("#sitesTagFilterInput", pop)?.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { tb.tag = ev.target.value.trim(); closePop(); render(); } });
    });
    // Saved views — snapshot/restore the whole toolbar combo.
    $("#sitesSavedViewsBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const pop = openPop(e.currentTarget, sitesSavedViewsPopoverHtml());
      $("[data-saveview]", pop)?.addEventListener("click", () => {
        const name = prompt("Name this view"); if (!name) return;
        saveSitesView(name, { chip: tb.chip, q: tb.q, niche: tb.niche, needsAttn: tb.needsAttn, tag: tb.tag, sort: tb.sort, view: tb.view });
        closePop(); toast("View saved.", "success");
      });
      $$("[data-viewidx]", pop).forEach((it) => it.addEventListener("click", () => {
        const v = savedSitesViews()[Number(it.dataset.viewidx)]; if (!v) return;
        Object.assign(tb, { chip: v.chip, q: v.q, niche: v.niche, needsAttn: v.needsAttn, tag: v.tag, sort: v.sort, view: v.view });
        closePop(); render();
      }));
    });
  }
```

- [ ] **Step 6: Extend `dtRow()` with a `data-archived` attribute (so List view's Archived chip works identically to Grid view)**

Find this line (currently in `dtRow()`, unchanged since the original file):

```js
    return `<div class="dt-row" data-site="${esc(s.id)}" data-status="${esc(s.status)}" data-attn="${attn ? 1 : 0}" data-name="${esc(s.name.toLowerCase())}">
```

Replace it with:

```js
    return `<div class="dt-row" data-site="${esc(s.id)}" data-status="${esc(s.status)}" data-attn="${attn ? 1 : 0}" data-name="${esc(s.name.toLowerCase())}" data-archived="${s.archived ? 1 : 0}">
```

(`dtRow()` is shared with the Dashboard's `sitesTable()` — this is a purely additive attribute; the Dashboard's own filtering, `bindDashTable()`, doesn't read it and is unaffected.)

- [ ] **Step 7: CSS for the Grid/List segmented toggle and the 2-column grid default**

Find this line (currently `m19-studio.css:369`, unchanged since the original file):

```css
.dt-chip .dc-n{font-family:var(--font-mono);font-size:10px;opacity:.75}
```

Replace it with:

```css
.dt-chip .dc-n{font-family:var(--font-mono);font-size:10px;opacity:.75}
.seg-toggle{display:inline-flex;border:.5px solid var(--line-strong);border-radius:var(--r-sm);overflow:hidden}
.seg-toggle .icon-btn{border-radius:0;border:none}
.seg-toggle .icon-btn.on{background:var(--teal-700);color:#fff}
.site-grid.sg-2col{grid-template-columns:repeat(2,1fr)}
@media(max-width:900px){ .site-grid.sg-2col{grid-template-columns:1fr} }
```

- [ ] **Step 8: Verify via the preview tool**

1. `preview_eval: location.reload()`, then `preview_eval: location.hash = "#/sites"`.
2. `preview_snapshot` — confirm the toolbar now shows: search box, 6 status chips (All/Live/Drafts/Review/Needs action/Archived), a "Filters" button, a Sort dropdown, a Grid/List segmented toggle (Grid active by default), and a "Saved views" button.
3. `preview_inspect` on `#sitesGrid` with `styles: ["grid-template-columns"]` — confirm it resolves to two equal tracks (2-column default) at desktop width (1280px).
4. `preview_click` the List icon in the segmented toggle — confirm the grid is replaced by a compact table (`#sitesListWrap`, reusing the Dashboard's row style) and the toggle's List button now shows `.on`.
5. `preview_click` back to Grid — confirm cards return.
6. Change `#sitesSort` to "Health score" — confirm the card/row order changes so lower-health sites (Crescent Dental, health 61) sort appropriately relative to Northstar (92) and Zenith (78) per the selected direction.
7. `preview_click` "Filters", `preview_click` a category (e.g. "Dental practice") — confirm only Crescent Dental remains visible, then reopen Filters and click "All categories" to restore.
8. `preview_click` "Filters", `preview_click` "Needs attention only" — confirm the grid narrows to only sites with an outstanding `attentionItems()` entry.
9. `preview_click` "Saved views", click "Save current view…" — since `prompt()` can't be answered by this tool, this specific interaction requires a manual pass; instead confirm the wiring is present via `preview_eval: !!document.querySelector("#sitesSavedViewsBtn")` and treat the actual save/restore round-trip as a manual check during Task 16's end-to-end pass.
10. `preview_click` the "Archived" chip — confirm it shows only sites with `s.archived === true` (should include the one archived via Task 13's bulk-archive test, if that step was run).
11. `preview_console_logs` with `level: "error"` — expect empty output.
12. `preview_resize` to `mobile` (375px) — confirm the toolbar wraps (existing `.dt-toolbar{flex-wrap:wrap}`) with no horizontal scroll, and the 2-column grid collapses to 1 column (per the new `@media(max-width:900px)` rule).

---

### Task 15: Compact "Attention needed" strip

**Files:**
- Modify: `frontend/js/m19-sites.js` (add `sitesAttentionStrip()` right before `sortSites()`, added in Task 14)
- Modify: `frontend/js/m19-sites.js` (`viewSites()`, produced by Task 14 Step 3 — call it between the quick-create row and the portfolio heading)
- Modify: `frontend/styles/m19-studio.css` (new `.attn-strip` rule)

- [ ] **Step 1: Add `sitesAttentionStrip()`**

Find this block (added by Task 14 Step 1):

```js
  // Sort — pure function over a list, driven by state.sitesToolbar.sort. A full
  // render() is what actually invokes this (see viewSites()), since reordering the
  // DOM in place isn't worth the complexity for a mockup-scale site list.
  function sortSites(list) {
```

Replace it with:

```js
  // Compact, page-level attention summary — same attentionItems() ranking the
  // Dashboard's full panel uses; this is a summary view onto it, not a second
  // control center, so it only ever shows the top 2-3 and links out to `#/dashboard`.
  function sitesAttentionStrip(sites) {
    const items = attentionItems(sites);
    if (!items.length) return "";
    const siteCount = new Set(items.filter((a) => a.site).map((a) => a.site.id)).size;
    const top = items.slice(0, 3).map((a) => esc(a.title));
    return `<div class="attn-strip reveal">
      <span class="as-ico">${svg("bell", 14)}</span>
      <span class="as-text">${siteCount} site${siteCount === 1 ? "" : "s"} need attention — ${top.join(", ")}${items.length > 3 ? "…" : ""}</span>
      <button class="st-link" data-nav-to="dashboard" style="margin-left:auto">View all ${svg("chev", 12)}</button>
    </div>`;
  }
  // Sort — pure function over a list, driven by state.sitesToolbar.sort. A full
  // render() is what actually invokes this (see viewSites()), since reordering the
  // DOM in place isn't worth the complexity for a mockup-scale site list.
  function sortSites(list) {
```

- [ ] **Step 2: Call it from `viewSites()`, between the quick-create row and the portfolio heading**

Find this block (produced by Task 14 Step 3, inside the `<div class="studio">` template):

```js
      ${sitesHero()}
      ${heroMetrics()}
      ${sitesQuickCreate()}
      ${sitesHead(sites)}
```

Replace it with:

```js
      ${sitesHero()}
      ${heroMetrics()}
      ${sitesQuickCreate()}
      ${sitesAttentionStrip(sites)}
      ${sitesHead(sites)}
```

- [ ] **Step 3: CSS for the strip**

Find this line (currently `m19-studio.css:47`, right after `.st-link:hover{gap:9px}`):

```css
.st-link:hover{gap:9px}
```

Replace it with:

```css
.st-link:hover{gap:9px}
.attn-strip{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:var(--r-lg);
  background:rgba(196,97,78,.08);border:.5px solid rgba(196,97,78,.25)}
.attn-strip .as-ico{flex:none;color:var(--status-danger)}
.attn-strip .as-text{flex:1;min-width:0;font-size:13px;color:var(--ink-700);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.attn-strip .st-link{flex:none}
```

- [ ] **Step 4: Verify via the preview tool**

1. `preview_eval: location.reload()`, then `preview_eval: location.hash = "#/sites"`.
2. `preview_snapshot` — confirm a slim red-tinted bar renders between the quick-create cards and the "Your portfolio" heading, reading "N sites need attention — ⟨title⟩, ⟨title⟩, …" with a "View all →" link.
3. `preview_click` "View all" — confirm it navigates to `#/dashboard` and the existing full Attention panel there is unchanged (same titles, same counts).
4. `preview_click` the "empty" preview-state button (mock-mode strip), reload the route — confirm the strip disappears entirely when there are no sites (nothing to flag) rather than rendering an empty bar.
5. `preview_console_logs` with `level: "error"` — expect empty output.
6. `preview_resize` to `mobile` (375px) — confirm the strip's text truncates with an ellipsis instead of wrapping/overflowing, and there's no horizontal scroll.

---

### Task 16: Slice 2 end-to-end verification pass

**Files:** None (verification only — no code changes).

- [ ] **Step 1: Full regression check against the Slice 2 spec's verification plan**

1. `preview_click` the "default" preview-state button to restore normal mock data, then `preview_eval: location.reload()`, then `preview_eval: location.hash = "#/sites"`.
2. **Hero:** `preview_snapshot` — confirm the 6 metric tiles render with counts matching the mockup dataset; `preview_eval` fire a `change` event on `#heroAttach` and confirm the flagged toast; click `#heroCompetitorToggle` and confirm the URL box appears; generate once from the hero and confirm a "Recent" chip appears on the next render of `#/sites`.
3. **Cards:** confirm client/category row, Review/Archived states (test Review by sending a site to review from its Publish tab, as in the Slice 1/command-center plans' precedent, then check its card), the 4 health dots (SEO/Schema/Accessibility/Performance), team avatar cluster + "edited by", one AI-insight line, and the "⋯ More" menu all render; confirm "Details" opens the drawer with the full breakdown and closes on scrim-click / Escape.
4. **Toolbar:** confirm Filters applies status/category/tag filters, Sort reorders, Grid/List toggles layout (2-col grid default), a Saved View can be created (manual — `prompt()`-driven) and persists across reload and re-applies, and selecting cards shows the bulk-action bar and it acts on the selection (mockup toast, no backend).
5. **Attention strip:** confirm it shows the top items and its "View all" link lands on `#/dashboard` with the existing panel unchanged.
6. `preview_eval: location.hash = "#/dashboard"`, `preview_screenshot` — confirm the Command center dashboard is pixel-for-pixel unchanged (KPIs, attention panel + its chips/dismiss from the prior command-center plan, sites table, publishing queue, quick actions all present and unaffected by this plan).

- [ ] **Step 2: Cross-cutting regression pass**

1. `preview_console_logs` with `level: "all"`, last 50 lines — confirm no new errors or warnings versus a pre-change baseline.
2. `preview_network` with `filter: "failed"` — confirm no failed requests.
3. `preview_resize` to `mobile` (375px), `tablet` (768px), and `desktop` (1280px) on `#/sites` — confirm 0 horizontal scroll at every breakpoint, including with the Details drawer open and with the bulk-action bar visible.
4. Toggle dark mode (`#themeToggle`) — `preview_screenshot` on `#/sites` and confirm the hero's gradient-italic `<em>`, the attention strip, card enrichments, popovers and the Details drawer all render with correct contrast (no invisible/low-contrast text) in dark mode.
5. `preview_screenshot` at desktop width, light and dark — final visual confirmation for the user.

- [ ] **Step 3: Report completion**

Summarize to the user: Slice 1 (hero + quick-create) and Slice 2 (metrics, composer extras, card enrichment, Details drawer, toolbar upgrade, attention strip) are both fully wired into `#/sites`; the Dashboard (`#/dashboard`) remains untouched; list any residual known limitations worth flagging (e.g. the mock `publishLog` isn't truly per-site, so the drawer's activity timeline shows generic entries on sites other than Northstar; Saved-views/tag-editing use native `prompt()` dialogs rather than a custom inline UI).

---

## Self-Review

**1. Spec coverage.**
- Slice 1 spec (`2026-07-08-m19-websites-hero-portfolio-design.md`) §1–6: composer extraction → Task 1; hero → Task 2; quick-create → Task 3; portfolio heading demotion + empty-state removal → Task 4; click wiring → Task 5; styling reuse (no new CSS needed) → noted in Tasks 2–4. All six spec sections have a task. ✓
- Slice 2 spec (`2026-07-08-m19-websites-hero-portfolio-slice2-design.md`) §1 hero extras → Tasks 8–9; §2 card enrichment → Tasks 10–13 (client/category/status/dots/team/insight/more-menu in Task 10, the menu itself in Task 11, the drawer in Task 12, favorites/tags in Task 13); §3 toolbar upgrade → Tasks 13 (bulk/tags/favorites) and 14 (filters/sort/grid-list/saved views); §4 attention strip → Task 15; §5 new mock data table (`MOCK.team`, `MOCK.teamBySite`, `client_name`, `niche`, `archived`, 3 health categories, `MOCK.metricsBySite`) → Task 7, matched field-for-field. All five spec sections have a task, and the mock-data table's "everything else is derived" rule is honored (Leads/Forms/Bookings/SSL/AI-insights/activity all read existing state, only the five listed additions are new). ✓
- Both specs' verification plans are covered by Task 6 (Slice 1) and Task 16 (Slice 2). ✓

**2. Placeholder scan.** Searched for "TBD", "similar to above", "...", "// implement", bare prose steps without code. None found — every code step shows the complete find/replace text; every verification step names the exact preview tool call and expected result. The two spots that read like caveats ("do not click Details yet", "prompt() can't be scripted by this tool") are deliberate ordering/tooling notes, not missing implementation.

**3. Type/naming consistency.** Traced these names across every task that touches them:
- `composerHtml(idPrefix)` / `bindComposer(idPrefix, root, onGenerate)` — introduced Task 1, called identically in Task 1 (`"cm"`), Task 5 (`"hero"`), Task 9 (extended, same signature).
- `sitesHero()` / `sitesQuickCreate()` / `heroMetrics()` / `sitesAttentionStrip()` / `sitesHead()` — each introduced once (Tasks 2, 3, 8, 15, existing) and called in the same order everywhere `viewSites()` is rewritten (Tasks 4, 8, 13, 14, 15 all reproduce the full call chain consistently: hero → heroMetrics → quickCreate → attentionStrip → sitesHead → toolbar/grid).
- `state.sitesToolbar` fields (`chip`, `q`, `niche`, `needsAttn`, `tag`, `sort`, `view`) — declared once in Task 7, read/written with these exact names in Tasks 14's `viewSites()`, `bindPortfolioToolbar()`, `sitesFiltersPopoverHtml()`, `sitesSavedViewsPopoverHtml()`. No variant spellings (e.g. no `needsAttention`/`sitesView` drift).
- `state.team` / `state.teamBySite` / `state.metricsBySite` — declared Task 7, read in Task 8 (`heroMetrics`), Task 10/13 (`siteCard`), Task 12 (`detailsDrawerBody` doesn't use `metricsBySite`... — checked: it does, as `state.metricsBySite`). Consistent throughout.
- `favSites`/`toggleFavSite`/`siteTagsFor`/`setSiteTags`/`savedSitesViews`/`saveSitesView` — declared Task 13/14, used only by the functions in those same tasks (`siteCard`, `bindSites`, `bindPortfolioToolbar`). No naming drift from the template-derived `favTemplates`/`toggleFav` pair they're modeled on.
- `openPop`/`closePop`/`siteMoreMenu` (Task 11) and `openDetailsDrawer`/`closeDetailsDrawer`/`detailsDrawerBody` (Task 12) — both pairs used consistently in Task 11's `bindSiteCardActions` (`data-more` → `siteMoreMenu()`/`openPop`; `"details"` → `openDetailsDrawer`) and Task 12's Escape-key extension (`closePop(); closeDetailsDrawer();`).
- `dtRow()` — extended once in Task 14 Step 6 with `data-archived`; every other call site (Dashboard's `sitesTable()`, Task 14's List view) is unaffected since it's purely additive.

No inconsistencies found; nothing needed fixing.

---

Plan complete and saved to `docs/superpowers/plans/2026-07-08-m19-websites-hero-portfolio.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
