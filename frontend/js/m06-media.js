/* m06-media.js — AiMindShare Module M06 · Media Library.
   Vanilla hash-routed dashboard on Supabase Storage. Two screens:
     /media              — folder tree + asset grid/list, drag-drop upload with
                           progress, search/type/favorites filters, bulk toolbar,
                           and a detail Sheet (preview · variants · alt/tags ·
                           where-used · delete-warns-if-used).
     /media/collections  — pinned brand collections manager (admin on the brand bucket).
   The walls are server-side (migration 0021): media = staff write / manager delete,
   brand = admin; the upload /complete is register_media_asset() (enqueues the
   media.autotag job); usage is the used_in jsonb via register_asset_usage(); a
   soft delete is soft_delete_asset() (manager+). Anon key only in the browser (Law 3).
   Offline → a high-fidelity mockup with a default/empty/loading/error/success switcher. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const uuid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.abs(Date.now() ^ (performance.now() * 1000 | 0)).toString(36));
  const fmtBytes = (window.AssetPicker && window.AssetPicker._fmtBytes) || ((b) => { b = Number(b || 0); if (!b) return "—"; const u = ["B", "KB", "MB", "GB"]; let i = 0; while (b >= 1024 && i < 3) { b /= 1024; i++; } return b.toFixed(b % 1 && i ? 1 : 0) + " " + u[i]; });
  const mockThumb = (window.AssetPicker && window.AssetPicker.mockThumb) || (() => "");
  const DAY = 864e5;
  const ago = (iso) => { const d = (Date.now() - new Date(iso).getTime()) / DAY; if (d < 1) return "today"; if (d < 2) return "yesterday"; if (d < 30) return Math.floor(d) + "d ago"; return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); };

  /* ── Icons ──────────────────────────────────────────────────────────────── */
  const P = {
    image: "M4 5h16v14H4zM4 15l4-4 3 3 4-5 5 6", video: "M4 5h11v14H4zM19 8l3-2v12l-3-2z",
    audio: "M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm10-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
    pdf: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6", doc: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6",
    folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", star: "M12 3l2.9 6.3 6.6.6-5 4.4 1.5 6.4L12 17.8 6 21.1l1.5-6.4-5-4.4 6.6-.6z",
    grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z", list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    up: "M12 19V5M5 12l7-7 7 7", search: "M21 21l-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", plus: "M12 5v14M5 12h14",
    check: "M20 6 9 17l-5-5", x: "M18 6 6 18M6 6l12 12", trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
    move: "M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20", download: "M12 3v12M7 10l5 5 5-5M5 21h14",
    link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
    sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z", info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
    alert: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
    burger: "M3 6h18M3 12h18M3 18h18", pin: "M9 4h6l-1 7 4 3v2H6v-2l4-3z M12 16v5",
  };
  const svg = (n, s = 17) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${P[n] || ""}"/></svg>`;
  const kindIco = (k) => svg(P[k] ? k : "doc", 30);

  /* ── Theme + starfield (light only; dark = no stars) ────────────────────── */
  const THEME_KEY = "aimindshare-theme";
  const root = document.documentElement;
  const setTheme = (t) => { root.setAttribute("data-theme", t); try { localStorage.setItem(THEME_KEY, t); } catch (e) {} const i = $("#themeIco"); if (i) i.textContent = t === "dark" ? "☀" : "☾"; };
  setTheme((() => { try { return localStorage.getItem(THEME_KEY) || "light"; } catch (e) { return "light"; } })());
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  (function stars() { const field = $("#starField"); if (!field || reduce) return; for (let i = 0; i < 42; i++) { const s = el("div", "star"); s.style.left = Math.random() * 100 + "%"; s.style.top = Math.random() * 100 + "%"; s.style.setProperty("--tw", (3 + Math.random() * 7).toFixed(1) + "s"); s.style.setProperty("--td", (Math.random() * 10).toFixed(1) + "s"); field.appendChild(s); } })();

  /* ── Config + Supabase client (anon key only) ───────────────────────────── */
  const CFG_KEY = "aimindshare-supabase", ACTIVE_KEY = "aimindshare-active-ws";
  function getCfg() {
    try { const s = JSON.parse(localStorage.getItem(CFG_KEY) || "null"); if (s && s.url) return s; } catch (e) {}
    const g = window.AIMINDSHARE_CONFIG;
    if (g && g.SUPABASE_URL && !/YOUR-/.test(g.SUPABASE_URL)) return { url: g.SUPABASE_URL, anon: g.SUPABASE_ANON_KEY };
    return null;
  }
  let client = null;
  function ensureClient() { const cfg = getCfg(); if (!cfg || !window.supabase?.createClient) { client = null; return null; } if (!client) client = window.supabase.createClient(cfg.url, cfg.anon || "", { auth: { persistSession: true, autoRefreshToken: true } }); return client; }
  const connected = () => !!getCfg() && !!window.supabase;

  /* ── Connect drawer ─────────────────────────────────────────────────────── */
  const drawer = $("#drawer"), scrim = $("#scrim");
  const openDrawer = () => { const c = getCfg(); if (c) { $("#inpUrl").value = c.url; $("#inpAnon").value = c.anon || ""; } drawer.classList.add("open"); scrim.classList.add("open"); };
  const closeDrawer = () => { drawer.classList.remove("open"); scrim.classList.remove("open"); };
  $("#closeDrawer").addEventListener("click", closeDrawer);
  scrim.addEventListener("click", closeDrawer);
  $("#saveCfg").addEventListener("click", async () => { const url = $("#inpUrl").value.trim(), anon = $("#inpAnon").value.trim(); if (!url) { $("#inpUrl").focus(); return; } try { localStorage.setItem(CFG_KEY, JSON.stringify({ url, anon })); } catch (e) {} client = null; closeDrawer(); state.loaded = false; await boot(); });
  $("#clearCfg").addEventListener("click", async () => { try { localStorage.removeItem(CFG_KEY); } catch (e) {} $("#inpUrl").value = ""; $("#inpAnon").value = ""; client = null; state.loaded = false; await boot(); });

  /* ── Toast ──────────────────────────────────────────────────────────────── */
  function toast(msg, kind = "info") {
    const ico = kind === "success" ? "✓" : kind === "danger" ? "⚠" : "◈";
    const t = el("div", "toast " + kind, `<span class="t-ico">${ico}</span><div>${esc(msg)}</div>`);
    $("#toasts").appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateX(20px)"; setTimeout(() => t.remove(), 300); }, 3200);
  }

  /* ── Mockup data ────────────────────────────────────────────────────────── */
  const MOCK = (() => {
    const folders = [
      { id: "col-logos", name: "Logos", bucket: "brand", kind: "collection", pinned: true, parent_id: null },
      { id: "col-photos", name: "Brand Photos", bucket: "brand", kind: "collection", pinned: true, parent_id: null },
      { id: "col-tmpl", name: "Templates", bucket: "brand", kind: "collection", pinned: true, parent_id: null },
      { id: "f-web", name: "Website", bucket: "media", kind: "folder", pinned: false, parent_id: null },
      { id: "f-hero", name: "Heroes", bucket: "media", kind: "folder", pinned: false, parent_id: "f-web" },
      { id: "f-social", name: "Social", bucket: "media", kind: "folder", pinned: false, parent_id: null },
      { id: "f-docs", name: "Documents", bucket: "media", kind: "folder", pinned: false, parent_id: null },
    ];
    const a = (id, filename, folder, bucket, kind, mime, bytes, tags, used, fav, tag_status) =>
      ({ id, filename, folder_id: folder, bucket, kind, mime, bytes, width: kind === "image" ? 1600 : null, height: kind === "image" ? 1067 : null,
         ai_tags: tags || [], used_in: used || [], is_favorite: !!fav, tag_status: tag_status || (kind === "image" ? "done" : "skipped"),
         created_at: new Date(Date.now() - (id.charCodeAt(1) % 20) * DAY).toISOString(), uploader: "Aisha Rahman", duration_sec: kind === "video" ? 42 : null });
    const assets = [
      a("a1", "northstar-logo.svg", "col-logos", "brand", "image", "image/svg+xml", 24800, ["logo", "brand", "mark"], [{ module: "sites", ref_id: "home" }, { module: "content", ref_id: "post-9" }], true),
      a("a2", "logo-mono-dark.png", "col-logos", "brand", "image", "image/png", 41200, ["logo", "monochrome", "dark"], [], false),
      a("a3", "team-portrait.jpg", "col-photos", "brand", "image", "image/jpeg", 1840000, ["team", "office", "people"], [{ module: "sites", ref_id: "about" }], true),
      a("a4", "founder-headshot.jpg", "col-photos", "brand", "image", "image/jpeg", 980000, ["portrait", "founder", "people"], [], false),
      a("a5", "hero-gradient.png", "f-hero", "media", "image", "image/png", 640000, ["hero", "gradient", "abstract"], [{ module: "sites", ref_id: "landing" }], false),
      a("a6", "hero-team-shot.jpg", "f-hero", "media", "image", "image/jpeg", 2200000, [], [], false, "pending"),
      a("a7", "og-banner.png", "f-web", "media", "image", "image/png", 320000, ["banner", "seo", "social"], [{ module: "content", ref_id: "blog-3" }], false),
      a("a8", "launch-reel.mp4", "f-social", "media", "video", "video/mp4", 48000000, [], [{ module: "social", ref_id: "post-42" }], false),
      a("a9", "podcast-intro.mp3", "f-social", "media", "audio", "audio/mpeg", 3600000, [], [], false),
      a("a10", "case-study.pdf", "f-docs", "media", "pdf", "application/pdf", 2200000, [], [{ module: "pipeline", ref_id: "deal-8" }], false),
      a("a11", "brand-guidelines.pdf", "col-tmpl", "brand", "pdf", "application/pdf", 5400000, [], [], true),
      a("a12", "insta-story-01.png", "f-social", "media", "image", "image/png", 410000, ["story", "instagram", "promo"], [], false),
    ];
    return {
      user: { id: "u1", email: "aisha@northstar.agency", name: "Aisha Rahman" },
      workspace: { id: "ws", name: "Northstar Agency" }, role: "owner",
      folders, assets, storageGb: 4.7,
    };
  })();

  /* ── State ──────────────────────────────────────────────────────────────── */
  const state = {
    loaded: false, loading: false, error: null, previewState: "default",
    user: null, workspaceId: null, workspaceName: "", role: "owner",
    folders: [], assets: [], storageGb: 0,
    route: "media", activeFolder: null, view: "grid",
    filters: { search: "", type: "", fav: false },
    selected: new Set(), sheetAsset: null, uploads: [], railOpen: false,
  };
  const PREVIEW_STATES = ["default", "empty", "loading", "error", "success"];
  const stp = (name) => !connected() && state.previewState === name;
  const canWrite = () => ["owner", "admin", "manager", "staff"].includes(state.role) || !connected();
  const canManageBrand = () => ["owner", "admin"].includes(state.role) || !connected();
  const canDelete = () => ["owner", "admin", "manager"].includes(state.role) || !connected();
  const folderById = (id) => state.folders.find((f) => f.id === id) || null;

  /* ── Data loading ───────────────────────────────────────────────────────── */
  async function boot() {
    state.selected.clear();
    if (connected()) {
      state.loading = true; state.error = null; render();
      try {
        const c = ensureClient();
        const { data: { user } } = await c.auth.getUser();
        state.user = user;
        if (!user) { state.loaded = true; state.loading = false; render(); return; }
        const { data: wsRows, error: wsErr } = await c.from("workspaces").select("id,name,status").order("created_at");
        if (wsErr) throw wsErr;
        const active = pickActive(wsRows || []);
        if (!active) { state.loaded = true; state.loading = false; render(); return; }
        state.workspaceId = active.id; state.workspaceName = active.name;
        const { data: mine } = await c.from("memberships").select("role").eq("workspace_id", active.id).eq("user_id", user.id).maybeSingle();
        state.role = mine?.role || "staff";
        await reload();
      } catch (e) { state.error = e.message || String(e); }
      state.loading = false; state.loaded = true;
    } else {
      state.user = MOCK.user; state.workspaceId = MOCK.workspace.id; state.workspaceName = MOCK.workspace.name; state.role = MOCK.role;
      state.folders = MOCK.folders.slice(); state.assets = MOCK.assets.slice(); state.storageGb = MOCK.storageGb;
      state.loaded = true; state.loading = false;
    }
    render();
  }
  function pickActive(list) { const usable = (list || []).filter((w) => w.status !== "archived"); if (!usable.length) return list[0] || null; let id; try { id = localStorage.getItem(ACTIVE_KEY); } catch (e) {} return usable.find((w) => w.id === id) || usable[0]; }

  async function reload() {
    const c = ensureClient(); if (!c) return;
    const [{ data: fs }, { data: as }] = await Promise.all([
      c.from("media_folders").select("id,name,bucket,kind,pinned,parent_id").eq("workspace_id", state.workspaceId).order("pinned", { ascending: false }).order("name"),
      c.from("media_assets").select("id,filename,title,folder_id,bucket,kind,mime,bytes,width,height,ai_tags,used_in,is_favorite,tag_status,alt_text,storage_path,created_at,created_by")
        .eq("workspace_id", state.workspaceId).is("deleted_at", null).order("created_at", { ascending: false }).limit(1000),
    ]);
    state.folders = fs || []; state.assets = as || [];
    let gb = 0; state.assets.forEach((a) => (gb += Number(a.bytes || 0))); state.storageGb = gb / (1024 ** 3);
  }

  /* ── Storage URL helpers (signed + transform variants, D-116) ───────────── */
  async function signedUrl(a, width) {
    const c = ensureClient(); if (!c || !a.storage_path) return null;
    try {
      const opts = width ? { transform: { width, resize: "cover" } } : undefined;
      const { data } = await c.storage.from(a.bucket).createSignedUrl(a.storage_path, 3600, opts);
      return data?.signedUrl || null;
    } catch (e) { return null; }
  }
  // After a grid render, swap real signed thumbnails in where we can (best-effort).
  async function hydrateThumbs() {
    if (!connected()) return;
    for (const img of $$("img[data-hydrate]")) {
      const a = state.assets.find((x) => x.id === img.getAttribute("data-hydrate"));
      if (!a || a.kind !== "image") continue;
      const u = await signedUrl(a, 400); if (u) img.src = u;
    }
  }

  /* ── Derived ────────────────────────────────────────────────────────────── */
  function visibleAssets() {
    const f = state.filters, q = f.search.trim().toLowerCase();
    return state.assets.filter((a) => {
      if (state.activeFolder && a.folder_id !== state.activeFolder) return false;
      if (f.type && a.kind !== f.type) return false;
      if (f.fav && !a.is_favorite) return false;
      if (q) { const hay = (a.filename + " " + (a.ai_tags || []).join(" ")).toLowerCase(); if (!hay.includes(q)) return false; }
      return true;
    });
  }
  const countIn = (fid) => state.assets.filter((a) => a.folder_id === fid).length;

  /* ═══════════════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════════════ */
  function render() {
    const app = $("#app");
    const nav = (id, ico, label) => `<div class="nav-item ${state.route === id ? "active" : ""}" data-route="${id}"><span class="ni-ico">${svg(ico)}</span><span>${label}</span></div>`;
    app.innerHTML = `
      <aside class="rail ${state.railOpen ? "open" : ""}" id="rail">
        <div class="brand"><span class="mark">◈</span><span>AiMindShare</span></div>
        <div class="nav-group">
          <div class="nav-group-label">Library</div>
          ${nav("media", "image", "All Media")}
          ${nav("collections", "star", "Brand Collections")}
        </div>
        <div class="rail-foot">M06 · Media Library<br>Supabase Storage · RLS</div>
      </aside>
      <header class="tbar">
        <button class="icon-btn rail-burger" id="burger" aria-label="Menu">${svg("burger")}</button>
        <div class="ws-trigger"><span class="ws-badge">${esc((state.workspaceName || "N")[0])}</span>
          <div><div class="ws-name">${esc(state.workspaceName || "Workspace")}</div><div class="ws-kind">Media</div></div></div>
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" id="pickDemo">${svg("sparkle", 14)} AssetPicker</button>
        <button class="jobs-chip" id="connBtn"><span class="jc-dot"></span>${connected() ? "connected" : "offline · mockup"}</button>
        <button class="icon-btn" id="themeToggle" aria-label="Theme"><span id="themeIco">☾</span></button>
      </header>
      <main class="content"><div class="content-inner" id="view"></div></main>`;

    $$("#app [data-route]").forEach((n) => n.onclick = () => { location.hash = "#/" + (n.getAttribute("data-route") === "media" ? "media" : "media/collections"); });
    $("#themeToggle").onclick = () => setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
    setTheme(root.getAttribute("data-theme"));
    $("#connBtn").onclick = openDrawer;
    $("#burger").onclick = () => { state.railOpen = !state.railOpen; $("#rail").classList.toggle("open", state.railOpen); };
    const pd = $("#pickDemo"); if (pd) pd.onclick = () => AssetPicker.open({ mode: "multi", onSelect: (a) => toast(a.length ? `Picked ${a.length}: ${a.map((x) => x.filename).join(", ")}` : "Nothing selected", a.length ? "success" : "info") });

    const view = $("#view");
    if (state.route === "collections") { renderCollections(view); return; }
    renderMedia(view);
  }

  function mockSwitcher() {
    if (connected()) return "";
    return `<div class="mock-note"><span class="mn-ico">${svg("info", 15)}</span>
      <span><b>Mockup preview</b> — sample data. Connect a project to run live. Preview state:</span>
      ${PREVIEW_STATES.map((s) => `<button class="link ${state.previewState === s ? "on" : ""}" data-ps="${s}">${s}</button>`).join("")}</div>`;
  }
  function wireMock(scope) {
    $$("[data-ps]", scope).forEach((b) => b.onclick = () => { state.previewState = b.getAttribute("data-ps"); render(); });
  }

  /* ── /media ───────────────────────────────────────────────────────────────*/
  function renderMedia(view) {
    const head = `
      ${mockSwitcher()}
      <div class="sec-head"><span class="eyebrow">Media Library</span><span class="spacer"></span>
        <span class="freshness"><span class="num">${state.storageGb.toFixed(2)}</span> GB stored</span></div>`;

    // Error state
    if (state.error || stp("error")) {
      view.innerHTML = head + `<div class="banner" style="border-color:var(--status-danger)">
        <span>${svg("alert", 18)}</span><div><b>Couldn't load your media.</b><br><span class="mono" style="font-size:12px">${esc(state.error || "connection_lost")}</span></div>
        <span class="spacer" style="flex:1"></span><button class="btn btn-ghost btn-sm" id="retry">Retry</button></div>`;
      wireMock(view); const r = $("#retry"); if (r) r.onclick = () => { state.error = null; state.previewState = "default"; boot(); };
      return;
    }
    // Loading state
    if (state.loading || stp("loading")) {
      view.innerHTML = head + `<div class="media-pane"><div class="tree">${Array.from({ length: 5 }).map(() => `<div class="skeleton" style="height:34px;margin:6px 0"></div>`).join("")}</div>
        <div><div class="skeleton" style="height:92px;margin-bottom:18px"></div><div class="asset-grid">${Array.from({ length: 8 }).map(() => `<div class="skeleton" style="height:184px"></div>`).join("")}</div></div></div>`;
      wireMock(view); return;
    }

    const emptyLib = state.assets.length === 0 || stp("empty");
    view.innerHTML = head + `
      <div class="media-toolbar">
        <label class="mt-search">${svg("search", 15)}<input id="q" type="search" placeholder="Search by name or tag…" value="${esc(state.filters.search)}"></label>
        <button class="filter-chip ${state.filters.type === "image" ? "on" : ""}" data-type="image">Images</button>
        <button class="filter-chip ${state.filters.type === "video" ? "on" : ""}" data-type="video">Video</button>
        <button class="filter-chip ${state.filters.type === "pdf" ? "on" : ""}" data-type="pdf">Docs</button>
        <button class="filter-chip gold ${state.filters.fav ? "on" : ""}" id="favChip">${svg("star", 13)} Favorites</button>
        <span class="spacer"></span>
        <div class="seg"><button class="${state.view === "grid" ? "on" : ""}" data-view="grid" aria-label="Grid">${svg("grid", 15)}</button>
          <button class="${state.view === "list" ? "on" : ""}" data-view="list" aria-label="List">${svg("list", 15)}</button></div>
      </div>
      <div class="media-pane">
        <nav class="tree" id="tree"></nav>
        <section id="stage"></section>
      </div>`;

    // Toolbar wiring
    const q = $("#q"); if (q) q.oninput = (e) => { state.filters.search = e.target.value; renderStage(); };
    $$("[data-type]", view).forEach((b) => b.onclick = () => { const t = b.getAttribute("data-type"); state.filters.type = state.filters.type === t ? "" : t; render(); });
    $("#favChip").onclick = () => { state.filters.fav = !state.filters.fav; render(); };
    $$("[data-view]", view).forEach((b) => b.onclick = () => { state.view = b.getAttribute("data-view"); render(); });
    wireMock(view);

    renderTree();
    renderStage(emptyLib);
    hydrateThumbs();
  }

  function renderTree() {
    const t = $("#tree"); if (!t) return;
    const brand = state.folders.filter((f) => f.kind === "collection");
    const roots = state.folders.filter((f) => f.kind !== "collection" && !f.parent_id);
    const childrenOf = (id) => state.folders.filter((f) => f.parent_id === id);
    const node = (f, cls) => `<div class="tnode ${cls} ${state.activeFolder === f.id ? "active" : ""}" data-f="${f.id}">
      <span class="tn-ico">${svg(f.kind === "collection" ? "star" : "folder")}</span>
      <span class="tn-name">${esc(f.name)}</span><span class="tn-count">${countIn(f.id) || ""}</span></div>`;
    let html = `<div class="tnode ${!state.activeFolder ? "active" : ""}" data-f=""><span class="tn-ico">${svg("folder")}</span><span class="tn-name">All files</span><span class="tn-count">${state.assets.length}</span></div>`;
    if (brand.length) html += `<div class="tree-sec" style="color:var(--gold-500)">Brand${canManageBrand() ? `<span class="ts-add" data-add="brand" title="New collection">${svg("plus", 13)}</span>` : ""}</div>` + brand.map((f) => node(f, "brand")).join("");
    html += `<div class="tree-sep"></div><div class="tree-sec">Folders${canWrite() ? `<span class="ts-add" data-add="media" title="New folder">${svg("plus", 13)}</span>` : ""}</div>`;
    roots.forEach((f) => { html += node(f, ""); childrenOf(f.id).forEach((ch) => html += node(ch, "child")); });
    t.innerHTML = html;
    $$(".tnode", t).forEach((n) => n.onclick = (e) => { if (e.target.closest("[data-add]")) return; state.activeFolder = n.getAttribute("data-f") || null; state.selected.clear(); render(); });
    $$("[data-add]", t).forEach((b) => b.onclick = (e) => { e.stopPropagation(); newFolder(b.getAttribute("data-add")); });
  }

  function renderStage(emptyLib) {
    const stage = $("#stage"); if (!stage) return;
    const list = visibleAssets();

    const dz = `<div class="dropzone" id="dropzone" tabindex="0" role="button">
      <div class="dz-ico">${svg("up", 22)}</div><h4>Drop files to upload</h4>
      <p>or click to browse — images, video, audio, PDF & docs</p>
      <div class="dz-hint">direct → Supabase Storage · variants + AI tags run as background jobs</div></div>`;

    const bulk = state.selected.size ? `<div class="bulk-bar"><span class="bb-count">${state.selected.size} selected</span>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm" data-bulk="fav">${svg("star", 13)} Favorite</button>
      ${canDelete() ? `<button class="btn btn-ghost btn-sm" data-bulk="delete">${svg("trash", 13)} Delete</button>` : ""}
      <button class="btn btn-ghost btn-sm" data-bulk="clear">Clear</button></div>` : "";

    let body;
    if (emptyLib && !state.filters.search && !state.filters.type && !state.filters.fav && !state.activeFolder) {
      body = `<div class="empty-state"><div class="es-ico">${svg("image", 23)}</div><h3>No files yet</h3>
        <p>Upload your logos, brand photos, and templates once — then reuse them everywhere with the AssetPicker.</p>
        <button class="btn btn-primary es-cta" id="emptyUp">${svg("up", 14)} Upload your first file</button></div>`;
    } else if (!list.length) {
      body = `<div class="empty-state"><div class="es-ico">${svg("search", 22)}</div><h3>Nothing matches</h3>
        <p>No assets in this view. Try another folder or clear the filters.</p></div>`;
    } else if (state.view === "list") {
      body = `<div class="asset-list row-list">` + list.map((a) => rowHtml(a)).join("") + `</div>`;
    } else {
      body = `<div class="asset-grid">` + list.map((a) => cardHtml(a)).join("") + `</div>`;
    }

    stage.innerHTML = (state.uploads.length ? uploadTrayHtml() : "") + bulk + dz + body;

    // Dropzone
    const zone = $("#dropzone");
    const openPick = () => { const inp = $("#fileInput"); inp.onchange = () => { if (inp.files && inp.files.length) doUpload(inp.files); inp.value = ""; }; inp.click(); };
    if (zone) {
      zone.onclick = openPick;
      zone.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPick(); } };
      ["dragenter", "dragover"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("drag"); }));
      ["dragleave", "drop"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); if (ev === "dragleave" && zone.contains(e.relatedTarget)) return; zone.classList.remove("drag"); }));
      zone.addEventListener("drop", (e) => { if (e.dataTransfer?.files?.length) doUpload(e.dataTransfer.files); });
    }
    const eu = $("#emptyUp"); if (eu) eu.onclick = openPick;

    // Cards / rows
    $$("[data-a]", stage).forEach((n) => n.onclick = (e) => {
      const id = n.getAttribute("data-a");
      if (e.target.closest("[data-check]")) { toggleSelect(id); return; }
      if (e.target.closest("[data-fav]")) { toggleFav(id); return; }
      openSheet(id);
    });
    $$("[data-bulk]", stage).forEach((b) => b.onclick = () => bulkAction(b.getAttribute("data-bulk")));
  }

  function cardHtml(a) {
    const sel = state.selected.has(a.id);
    const thumb = a.kind === "image"
      ? `<img data-hydrate="${a.id}" src="${mockThumb(a)}" alt="${esc(a.alt_text || a.filename)}">`
      : `<span class="at-ph">${kindIco(a.kind)}</span>`;
    const tags = a.tag_status === "pending"
      ? `<div class="tag-row"><span class="tag-pending">tagging…</span></div>`
      : ((a.ai_tags || []).length ? `<div class="tag-row">${a.ai_tags.slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : "");
    return `<div class="asset-card ${sel ? "sel" : ""}" data-a="${a.id}">
      <div class="asset-check" data-check>${svg("check", 13)}</div>
      <button class="asset-fav ${a.is_favorite ? "on" : ""}" data-fav aria-label="Favorite">${svg("star", 14)}</button>
      <div class="asset-thumb">${thumb}<span class="at-kind">${esc(a.kind || "file")}</span></div>
      <div class="asset-meta"><div class="am-name">${esc(a.filename)}</div>
        <div class="am-sub"><span>${fmtBytes(a.bytes)}</span>${(a.used_in || []).length ? `<span>· used ${a.used_in.length}×</span>` : ""}</div>
        ${tags}</div></div>`;
  }
  function rowHtml(a) {
    const sel = state.selected.has(a.id);
    const thumb = a.kind === "image" ? `<img data-hydrate="${a.id}" src="${mockThumb(a)}" alt="">` : svg(P[a.kind] ? a.kind : "doc", 18);
    return `<div class="data-row ${sel ? "sel" : ""}" data-a="${a.id}">
      <div class="asset-check" data-check style="position:static;opacity:1;border-color:var(--line-strong);background:${sel ? "var(--teal-600)" : "transparent"};color:${sel ? "#fff" : "transparent"}">${svg("check", 12)}</div>
      <div class="rl-thumb">${thumb}</div>
      <div class="r-body"><div class="r-title">${esc(a.filename)}</div>
        <div class="r-meta"><span class="oc-tag">${esc(a.kind || "file")}</span><span class="num">${fmtBytes(a.bytes)}</span>
          ${(a.ai_tags || []).slice(0, 3).map((t) => `<span>#${esc(t)}</span>`).join("")}${a.tag_status === "pending" ? `<span class="tag-pending">tagging…</span>` : ""}</div></div>
      <div class="r-right"><button class="asset-fav ${a.is_favorite ? "on" : ""}" data-fav style="position:static;opacity:1;background:transparent;color:${a.is_favorite ? "var(--gold-400)" : "var(--ink-400)"}" aria-label="Favorite">${svg("star", 15)}</button>
        <span class="r-value">${ago(a.created_at)}</span></div></div>`;
  }
  function uploadTrayHtml() {
    return `<div class="upload-tray">` + state.uploads.map((u) => `
      <div class="up-row ${u.status}"><div class="up-ico">${svg(u.status === "done" ? "check" : "up", 14)}</div>
        <div class="up-body"><div class="up-name">${esc(u.name)}</div><div class="up-bar"><span style="width:${u.pct}%"></span></div></div>
        <div class="up-pct">${u.status === "err" ? "failed" : u.pct + "%"}</div></div>`).join("") + `</div>`;
  }

  /* ── Selection / favorite / bulk ────────────────────────────────────────── */
  function toggleSelect(id) { state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id); render(); }
  async function toggleFav(id) {
    const a = state.assets.find((x) => x.id === id); if (!a) return;
    a.is_favorite = !a.is_favorite; render();
    if (connected()) { const { error } = await ensureClient().from("media_assets").update({ is_favorite: a.is_favorite }).eq("id", id); if (error) { a.is_favorite = !a.is_favorite; toast("Couldn't update favorite", "danger"); render(); } }
  }
  async function bulkAction(kind) {
    const ids = [...state.selected];
    if (kind === "clear") { state.selected.clear(); render(); return; }
    if (kind === "fav") {
      ids.forEach((id) => { const a = state.assets.find((x) => x.id === id); if (a) a.is_favorite = true; });
      if (connected()) await ensureClient().from("media_assets").update({ is_favorite: true }).in("id", ids);
      toast(`${ids.length} favorited`, "success"); state.selected.clear(); render(); return;
    }
    if (kind === "delete") {
      const inUse = ids.filter((id) => (state.assets.find((x) => x.id === id)?.used_in || []).length).length;
      confirmModal(`Delete ${ids.length} asset${ids.length > 1 ? "s" : ""}?`,
        inUse ? `${inUse} of these ${inUse > 1 ? "are" : "is"} still used by another module. Deleting won't remove them there, but the reference will break.` : "This moves them to trash (recoverable).",
        async () => {
          for (const id of ids) await softDelete(id, false);
          toast(`${ids.length} deleted`, "success"); state.selected.clear(); render();
        });
    }
  }

  /* ── Upload pipeline (direct → Storage + register_media_asset, D-115) ───── */
  const kindOf = (mime) => mime && mime.startsWith("image/") ? "image" : mime && mime.startsWith("video/") ? "video" : mime && mime.startsWith("audio/") ? "audio" : mime === "application/pdf" ? "pdf" : "doc";
  async function doUpload(fileList) {
    const files = [...fileList];
    const bucket = state.activeFolder ? (folderById(state.activeFolder)?.bucket || "media") : "media";
    if (bucket === "brand" && !canManageBrand()) { toast("Only admins can add to brand collections", "danger"); return; }
    if (!canWrite()) { toast("You don't have upload permission", "danger"); return; }

    for (const file of files) {
      const u = { id: uuid(), name: file.name, pct: 0, status: "up" };
      state.uploads.unshift(u); renderStage();
      try {
        if (connected()) {
          const c = ensureClient();
          const safe = file.name.replace(/[^\w.\-]+/g, "_");
          const path = `${state.workspaceId}/${state.activeFolder ? "f/" : ""}${uuid()}-${safe}`;
          u.pct = 35; renderStage();
          const { error: upErr } = await c.storage.from(bucket).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
          if (upErr) throw upErr;
          u.pct = 80; renderStage();
          const { error: rpcErr } = await c.rpc("register_media_asset", {
            p_bucket: bucket, p_path: path, p_folder: state.activeFolder,
            p_filename: file.name, p_mime: file.type || null, p_bytes: file.size,
            p_kind: kindOf(file.type), p_width: null, p_height: null, p_duration: null,
          });
          if (rpcErr) throw rpcErr;
          u.pct = 100; u.status = "done"; renderStage();
        } else {
          // Mockup: animate progress, then add the asset + simulate the autotag job.
          await new Promise((res) => { let p = 0; const t = setInterval(() => { p += 12 + Math.random() * 18; u.pct = Math.min(100, Math.round(p)); renderStage(); if (u.pct >= 100) { clearInterval(t); res(); } }, 90); });
          u.status = "done";
          const isImg = kindOf(file.type) === "image";
          const a = { id: uuid(), filename: file.name, folder_id: state.activeFolder, bucket, kind: kindOf(file.type), mime: file.type, bytes: file.size,
            ai_tags: [], used_in: [], is_favorite: false, tag_status: isImg ? "pending" : "skipped", created_at: new Date().toISOString(), uploader: state.user?.name || "You" };
          state.assets.unshift(a); renderStage();
          if (isImg) setTimeout(() => { a.tag_status = "done"; a.ai_tags = scaffoldTags(a.filename); a.alt_text = "Image of " + a.ai_tags.slice(0, 3).join(", "); if (state.route === "media") renderStage(); }, 1400);
        }
      } catch (e) { u.status = "err"; toast(`Upload failed: ${file.name}`, "danger"); renderStage(); }
      setTimeout(() => { state.uploads = state.uploads.filter((x) => x.id !== u.id); if (state.route === "media") renderStage(); }, 2600);
    }
    if (connected()) { await reload(); if (state.route === "media") { render(); } toast(`${files.length} uploaded — tagging in the background`, "success"); }
  }
  const STOPW = new Set(["the", "and", "img", "image", "photo", "final", "copy", "new", "untitled"]);
  function scaffoldTags(filename) {
    return [...new Set((filename || "").replace(/\.[a-z0-9]+$/i, "").split(/[\s\-_.]+/).map((w) => w.toLowerCase()).filter((w) => w.length > 2 && !STOPW.has(w) && !/^\d+$/.test(w)))].slice(0, 6);
  }

  /* ── Detail Sheet ───────────────────────────────────────────────────────── */
  async function openSheet(id) {
    const a = state.assets.find((x) => x.id === id); if (!a) return;
    state.sheetAsset = a;
    const usedRows = (a.used_in || []).length
      ? a.used_in.map((u) => `<div class="used-row"><span class="ur-mod">${esc(u.module)}</span><span>${esc(u.ref_id)}</span></div>`).join("")
      : `<div class="used-row" style="color:var(--ink-400)">Not used anywhere yet.</div>`;
    const dims = a.width && a.height ? `${a.width}×${a.height}` : "—";
    const previewInner = a.kind === "image"
      ? `<img id="shImg" src="${mockThumb(a)}" alt="${esc(a.alt_text || a.filename)}">`
      : `<span>${kindIco(a.kind)}</span>`;

    const root = $("#sheetRoot");
    root.innerHTML = `
      <div class="scrim open" id="shScrim"></div>
      <aside class="sheet open" role="dialog" aria-label="${esc(a.filename)}">
        <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px">
          <div><span class="oc-tag">${esc(a.kind || "file")}</span>
            <h3 style="font-size:20px;margin-top:8px;word-break:break-word">${esc(a.filename)}</h3></div>
          <button class="icon-btn" id="shClose" style="margin-left:auto">${svg("x", 16)}</button>
        </div>
        <div class="as-preview">${previewInner}</div>
        ${a.kind === "image" ? `<div class="as-varlinks" id="shVars">
          <a data-v="thumb" href="#">${svg("link", 12)} thumb 300</a>
          <a data-v="medium" href="#">${svg("link", 12)} medium 800</a>
          <a data-v="orig" href="#">${svg("link", 12)} original</a></div>` : ""}
        <div class="as-facts">
          <div class="as-fact"><div class="af-k">Size</div><div class="af-v num">${fmtBytes(a.bytes)}</div></div>
          <div class="as-fact"><div class="af-k">Dimensions</div><div class="af-v num">${dims}</div></div>
          <div class="as-fact"><div class="af-k">Type</div><div class="af-v">${esc(a.mime || a.kind || "—")}</div></div>
          <div class="as-fact"><div class="af-k">Added</div><div class="af-v">${ago(a.created_at)}</div></div>
        </div>
        <div class="panel-head" style="margin-top:6px"><div class="ph-ico">${svg("sparkle", 14)}</div><h3 style="font-size:15px">Alt text &amp; tags</h3>
          ${a.tag_status === "pending" ? `<span class="tag-pending" style="margin-left:auto">AI tagging…</span>` : ""}</div>
        <div class="form-field full" style="margin-bottom:12px">
          <label>Alt text (SEO — reused by Sites &amp; Content)</label>
          <input id="shAlt" value="${esc(a.alt_text || "")}" placeholder="Describe this image…">
        </div>
        <div class="form-field full" style="margin-bottom:16px"><label>Tags</label>
          <div class="tag-editor" id="shTags"></div></div>
        <div class="panel-head"><div class="ph-ico">${svg("link", 14)}</div><h3 style="font-size:15px">Where used</h3>
          <span class="tn-count" style="margin-left:auto;font-family:var(--font-mono)">${(a.used_in || []).length}</span></div>
        <div style="margin-bottom:22px">${usedRows}</div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-ghost" id="shFav">${svg("star", 14)} ${a.is_favorite ? "Unfavorite" : "Favorite"}</button>
          <span style="flex:1"></span>
          ${canDelete() ? `<button class="btn btn-ghost" id="shDel" style="border-color:var(--status-danger);color:var(--status-danger)">${svg("trash", 14)} Delete</button>` : ""}
        </div>
      </aside>`;

    const close = () => { $("#shScrim")?.classList.remove("open"); $(".sheet", root)?.classList.remove("open"); setTimeout(() => (root.innerHTML = ""), 260); state.sheetAsset = null; };
    $("#shScrim").onclick = close; $("#shClose").onclick = close;
    $("#shFav").onclick = async () => { await toggleFav(a.id); close(); };
    const del = $("#shDel"); if (del) del.onclick = () => {
      const warn = (a.used_in || []).length ? `This asset is used in ${a.used_in.length} place${a.used_in.length > 1 ? "s" : ""}. Deleting won't remove it there — the reference will break.` : "This moves it to trash (recoverable).";
      confirmModal(`Delete “${a.filename}”?`, warn, async () => { await softDelete(a.id, true); close(); toast("Asset deleted", "success"); render(); });
    };
    // Alt text save on blur
    const alt = $("#shAlt"); if (alt) alt.onblur = async () => { const v = alt.value.trim(); if (v === (a.alt_text || "")) return; a.alt_text = v; if (connected()) await ensureClient().from("media_assets").update({ alt_text: v }).eq("id", a.id); toast("Alt text saved", "success"); };
    renderTagEditor(a);

    // Variant transform links (signed URLs; live only)
    if (a.kind === "image") {
      const map = { thumb: 300, medium: 800, orig: null };
      $$("#shVars a").forEach((link) => link.onclick = async (e) => {
        e.preventDefault();
        if (!connected()) { toast("Connect a project to open Storage variants", "info"); return; }
        const u = await signedUrl(a, map[link.getAttribute("data-v")]); if (u) window.open(u, "_blank"); else toast("Couldn't sign that URL", "danger");
      });
      if (connected()) signedUrl(a, 900).then((u) => { const img = $("#shImg"); if (u && img) img.src = u; });
    }
  }
  function renderTagEditor(a) {
    const box = $("#shTags"); if (!box) return;
    const draw = () => {
      box.innerHTML = (a.ai_tags || []).map((t, i) => `<span class="tag">${esc(t)}<span class="tx" data-rm="${i}">×</span></span>`).join("") + `<input id="tagInp" placeholder="add tag…">`;
      $$("[data-rm]", box).forEach((x) => x.onclick = async () => { a.ai_tags.splice(Number(x.getAttribute("data-rm")), 1); await saveTags(a); draw(); });
      const inp = $("#tagInp", box); inp.onkeydown = async (e) => { if (e.key === "Enter" && inp.value.trim()) { const v = inp.value.trim().toLowerCase(); if (!a.ai_tags.includes(v)) { a.ai_tags.push(v); await saveTags(a); } draw(); $("#tagInp", box).focus(); } };
    };
    draw();
  }
  async function saveTags(a) { if (connected()) await ensureClient().from("media_assets").update({ ai_tags: a.ai_tags }).eq("id", a.id); }

  async function softDelete(id, single) {
    const a = state.assets.find((x) => x.id === id);
    if (connected()) { const { error } = await ensureClient().rpc("soft_delete_asset", { p_id: id }); if (error) { toast("Delete failed: " + error.message, "danger"); return; } }
    state.assets = state.assets.filter((x) => x.id !== id); state.selected.delete(id);
    if (a) state.storageGb -= Number(a.bytes || 0) / (1024 ** 3);
  }

  /* ── New folder / collection ────────────────────────────────────────────── */
  function newFolder(bucket) {
    const isCol = bucket === "brand";
    promptModal(isCol ? "New brand collection" : "New folder", isCol ? "Collection name" : "Folder name", async (name) => {
      if (!name) return;
      if (connected()) {
        const { data, error } = await ensureClient().from("media_folders")
          .insert({ workspace_id: state.workspaceId, name, bucket, kind: isCol ? "collection" : "folder", pinned: isCol, parent_id: state.activeFolder && !isCol ? state.activeFolder : null })
          .select().maybeSingle();
        if (error) { toast("Couldn't create: " + error.message, "danger"); return; }
        state.folders.push(data);
      } else {
        state.folders.push({ id: uuid(), name, bucket, kind: isCol ? "collection" : "folder", pinned: isCol, parent_id: null });
      }
      toast(`${isCol ? "Collection" : "Folder"} “${name}” created`, "success"); render();
    });
  }

  /* ── /media/collections — brand collections manager ─────────────────────── */
  function renderCollections(view) {
    const cols = state.folders.filter((f) => f.kind === "collection");
    const head = `${mockSwitcher()}
      <div class="sec-head"><span class="eyebrow" style="color:var(--gold-500);background:rgba(197,160,89,.14)">Brand Collections</span>
        <span class="spacer"></span>
        ${canManageBrand() ? `<button class="btn btn-gold btn-sm" id="newCol">${svg("plus", 14)} New collection</button>` : ""}</div>
      <p style="color:var(--ink-400);font-size:14px;max-width:640px;margin-bottom:22px">Pinned collections surface first in the AssetPicker across every module. Keep your logos, approved brand photos, and templates here — they link to the M35 brand kit when it ships.</p>`;

    if (state.loading || stp("loading")) { view.innerHTML = head + `<div class="asset-grid">${Array.from({ length: 3 }).map(() => `<div class="skeleton" style="height:150px"></div>`).join("")}</div>`; wireMock(view); return; }
    if (!cols.length || stp("empty")) {
      view.innerHTML = head + `<div class="empty-state"><div class="es-ico" style="background:rgba(197,160,89,.16);color:var(--gold-500)">${svg("star", 22)}</div>
        <h3>No brand collections yet</h3><p>Create Logos, Brand Photos, and Templates so the whole team pulls from one approved set.</p>
        ${canManageBrand() ? `<button class="btn btn-gold es-cta" id="newColE">${svg("plus", 14)} New collection</button>` : ""}</div>`;
      wireMock(view); const n1 = $("#newCol"), n2 = $("#newColE"); [n1, n2].forEach((b) => b && (b.onclick = () => newFolder("brand"))); return;
    }

    view.innerHTML = head + `<div class="asset-grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">` + cols.map((c) => {
      const n = countIn(c.id);
      return `<div class="asset-card" data-col="${c.id}" style="cursor:pointer">
        <div class="asset-thumb" style="aspect-ratio:16/9;background:linear-gradient(150deg,rgba(197,160,89,.18),rgba(0,105,110,.08))"><span class="at-ph" style="color:var(--gold-500)">${svg("star", 30)}</span></div>
        <div class="asset-meta"><div class="am-name">${esc(c.name)} ${svg("pin", 12)}</div>
          <div class="am-sub"><span>${n} asset${n === 1 ? "" : "s"}</span><span>· brand bucket</span></div></div></div>`;
    }).join("") + `</div>`;
    wireMock(view);
    const nc = $("#newCol"); if (nc) nc.onclick = () => newFolder("brand");
    $$("[data-col]", view).forEach((n) => n.onclick = () => { state.route = "media"; state.activeFolder = n.getAttribute("data-col"); location.hash = "#/media"; });
  }

  /* ── Modals (confirm / prompt) ──────────────────────────────────────────── */
  function confirmModal(title, body, onYes) {
    const root = $("#modalRoot");
    root.innerHTML = `<div class="modal-scrim open" id="cmScrim"><div class="modal-card">
      <div class="mc-head"><div class="mc-ico" style="background:var(--grad-gold);color:#1A0E00">${svg("alert", 17)}</div>
        <div><h3>${esc(title)}</h3><div class="mc-sub">${esc(body)}</div></div></div>
      <div class="mc-foot"><button class="btn btn-ghost" id="cmNo">Cancel</button>
        <button class="btn btn-primary" id="cmYes" style="background:var(--status-danger);box-shadow:none">Delete</button></div></div></div>`;
    const close = () => { $("#cmScrim").classList.remove("open"); setTimeout(() => (root.innerHTML = ""), 260); };
    $("#cmScrim").onclick = (e) => { if (e.target.id === "cmScrim") close(); };
    $("#cmNo").onclick = close; $("#cmYes").onclick = async () => { close(); await onYes(); };
  }
  function promptModal(title, label, onOk) {
    const root = $("#modalRoot");
    root.innerHTML = `<div class="modal-scrim open" id="pmScrim"><div class="modal-card" style="max-width:440px">
      <div class="mc-head"><div class="mc-ico">${svg("folder", 17)}</div><div><h3>${esc(title)}</h3></div></div>
      <div class="form-field full"><label>${esc(label)}</label><input id="pmInp" placeholder="${esc(label)}" autofocus></div>
      <div class="mc-foot"><button class="btn btn-ghost" id="pmNo">Cancel</button><button class="btn btn-primary" id="pmOk">Create</button></div></div></div>`;
    const close = () => { $("#pmScrim").classList.remove("open"); setTimeout(() => (root.innerHTML = ""), 260); };
    const go = async () => { const v = $("#pmInp").value.trim(); close(); await onOk(v); };
    $("#pmScrim").onclick = (e) => { if (e.target.id === "pmScrim") close(); };
    $("#pmNo").onclick = close; $("#pmOk").onclick = go;
    setTimeout(() => { const i = $("#pmInp"); if (i) { i.focus(); i.onkeydown = (e) => { if (e.key === "Enter") go(); }; } }, 40);
  }

  // AssetPicker inline-upload in mock mode routes back to our dropzone.
  window.addEventListener("assetpicker:upload-demo", () => toast("Connect a project to upload from the picker", "info"));

  /* ── Router ─────────────────────────────────────────────────────────────── */
  function syncRoute() {
    const h = location.hash.replace(/^#\/?/, "");
    state.route = h.startsWith("media/collections") ? "collections" : "media";
    if (state.loaded) render();
  }
  window.addEventListener("hashchange", syncRoute);

  /* ── Boot ───────────────────────────────────────────────────────────────── */
  syncRoute();
  boot().then(() => { document.body.classList.add("js-ready"); });
})();
