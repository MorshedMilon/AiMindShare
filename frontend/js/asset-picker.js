/* asset-picker.js — AiMindShare M06 · the ONE shared asset picker.
   Exported as window.AssetPicker. Every module that needs to attach an image or
   file (M19 Sites, M22 Content, M23 Social, M24 Pinterest, M35 Creative, the M11
   deal drawer…) imports THIS — one browse/search/upload/select modal, so the
   "same logo uploaded 9 times" problem ends. Self-contained: it builds its own
   Supabase client from the shared localStorage config (anon key only, Law 3) and
   falls back to a compact mockup when no project is connected.

     AssetPicker.open({
       mode: 'single' | 'multi',      // default 'single'
       bucket: 'media' | 'brand',     // default 'media' (brand collections always shown)
       accept: 'image' | null,        // filter to a kind (null = all)
       onSelect: (assets) => {}       // assets: [{ id, filename, bucket, storage_path, kind, ai_tags, ... }]
     })

   Also exposes AssetPicker.mockThumb(asset) — a CSP-safe data-URI thumbnail so
   grids look premium offline without any network image. */
(function () {
  "use strict";
  const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const CFG_KEY = "aimindshare-supabase";

  const ICON = {
    image: "M4 5h16v14H4zM4 15l4-4 3 3 4-5 5 6", video: "M4 5h11v14H4zM19 8l3-2v12l-3-2z",
    audio: "M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm10-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
    pdf: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6", doc: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6",
    folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", star: "M12 3l2.9 6.3 6.6.6-5 4.4 1.5 6.4L12 17.8 6 21.1l1.5-6.4-5-4.4 6.6-.6z",
    check: "M20 6 9 17l-5-5", x: "M18 6 6 18M6 6l12 12", up: "M12 19V5M5 12l7-7 7 7", search: "M21 21l-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
  };
  const svg = (n, s = 16) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[n] || ""}"/></svg>`;
  const fmtBytes = (b) => { b = Number(b || 0); if (!b) return "—"; const u = ["B", "KB", "MB", "GB"]; let i = 0; while (b >= 1024 && i < 3) { b /= 1024; i++; } return b.toFixed(b % 1 && i ? 1 : 0) + " " + u[i]; };

  function getCfg() {
    try { const s = JSON.parse(localStorage.getItem(CFG_KEY) || "null"); if (s && s.url) return s; } catch (e) {}
    const g = window.AIMINDSHARE_CONFIG;
    if (g && g.SUPABASE_URL && !/YOUR-/.test(g.SUPABASE_URL)) return { url: g.SUPABASE_URL, anon: g.SUPABASE_ANON_KEY };
    return null;
  }
  let _client = null;
  function client() { const c = getCfg(); if (!c || !window.supabase?.createClient) return null; if (!_client) _client = window.supabase.createClient(c.url, c.anon || "", { auth: { persistSession: true } }); return _client; }
  const connected = () => !!getCfg() && !!window.supabase;

  // Deterministic CSP-safe gradient thumbnail (data URI) — premium tiles offline.
  const HUES = [[2, 151, 161], [197, 160, 89], [0, 105, 110], [46, 158, 123], [63, 191, 199]];
  function mockThumb(a) {
    const seed = (a.id || a.filename || "x").split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
    const c1 = HUES[seed % HUES.length], c2 = HUES[(seed >> 3) % HUES.length];
    const g = `rgb(${c1.join(",")})`, h = `rgb(${c2.join(",")})`;
    const letter = esc((a.filename || "•")[0].toUpperCase());
    const s = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='240'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${g}' stop-opacity='.85'/><stop offset='1' stop-color='${h}' stop-opacity='.55'/></linearGradient></defs><rect width='320' height='240' fill='url(%23g)'/><text x='50%' y='54%' font-family='Georgia,serif' font-size='96' fill='rgba(255,255,255,.82)' text-anchor='middle' dominant-baseline='middle'>${letter}</text></svg>`;
    return "data:image/svg+xml;charset=utf-8," + s.replace(/#/g, "%23").replace(/"/g, "'");
  }

  const MOCK_FOLDERS = [
    { id: "col-logos", name: "Logos", bucket: "brand", kind: "collection", pinned: true },
    { id: "col-photos", name: "Brand Photos", bucket: "brand", kind: "collection", pinned: true },
    { id: "col-tmpl", name: "Templates", bucket: "brand", kind: "collection", pinned: true },
    { id: "f-web", name: "Website", bucket: "media", kind: "folder" },
    { id: "f-social", name: "Social", bucket: "media", kind: "folder" },
  ];
  const MOCK_ASSETS = [
    { id: "a1", filename: "northstar-logo.svg", folder_id: "col-logos", bucket: "brand", kind: "image", mime: "image/svg+xml", bytes: 24800, ai_tags: ["logo", "brand", "mark"] },
    { id: "a2", filename: "team-portrait.jpg", folder_id: "col-photos", bucket: "brand", kind: "image", mime: "image/jpeg", bytes: 1840000, ai_tags: ["team", "office", "portrait"] },
    { id: "a3", filename: "hero-gradient.png", folder_id: "f-web", bucket: "media", kind: "image", mime: "image/png", bytes: 640000, ai_tags: ["hero", "gradient", "abstract"] },
    { id: "a4", filename: "case-study.pdf", folder_id: "f-web", bucket: "media", kind: "pdf", mime: "application/pdf", bytes: 2200000, ai_tags: [] },
    { id: "a5", filename: "launch-reel.mp4", folder_id: "f-social", bucket: "media", kind: "video", mime: "video/mp4", bytes: 48000000, ai_tags: ["reel", "promo"] },
    { id: "a6", filename: "og-banner.png", folder_id: "f-web", bucket: "media", kind: "image", mime: "image/png", bytes: 320000, ai_tags: ["banner", "seo", "social"] },
  ];

  function open(opts) {
    opts = opts || {};
    const mode = opts.mode === "multi" ? "multi" : "single";
    const bucket = opts.bucket || "media";
    const accept = opts.accept || null;
    const onSelect = typeof opts.onSelect === "function" ? opts.onSelect : () => {};

    let folders = MOCK_FOLDERS.slice(), assets = MOCK_ASSETS.slice();
    let activeFolder = null, query = "", picked = new Set();

    const root = document.getElementById("modalRoot") || document.body;
    const scrim = el("div", "picker-scrim");
    scrim.innerHTML = `
      <div class="picker-card" role="dialog" aria-label="Choose an asset">
        <div class="picker-head">
          <div class="pk-ico">${svg("image", 18)}</div>
          <div><h3>Choose ${accept === "image" ? "an image" : "an asset"}</h3>
            <div class="pk-sub">${mode === "multi" ? "Select one or more" : "Select one"} · brand collections shown first</div></div>
          <input class="pk-search" type="search" placeholder="Search name or tag…">
        </div>
        <div class="picker-body">
          <div class="pk-tree"></div>
          <div class="pk-grid"></div>
        </div>
        <div class="picker-foot">
          <button class="btn btn-ghost btn-sm" data-x="upload">${svg("up", 14)} Upload</button>
          <span class="pk-sel"></span>
          <span class="spacer"></span>
          <button class="btn btn-ghost" data-x="cancel">Cancel</button>
          <button class="btn btn-primary" data-x="use" disabled>Use selected</button>
        </div>
      </div>`;
    root.appendChild(scrim);
    requestAnimationFrame(() => scrim.classList.add("open"));

    const q = (s) => scrim.querySelector(s);
    const close = () => { scrim.classList.remove("open"); setTimeout(() => scrim.remove(), 260); };

    function visibleAssets() {
      return assets.filter((a) => {
        if (accept && a.kind !== accept) return false;
        if (activeFolder && a.folder_id !== activeFolder) return false;
        if (query) { const hay = (a.filename + " " + (a.ai_tags || []).join(" ")).toLowerCase(); if (!hay.includes(query)) return false; }
        return true;
      });
    }
    function renderTree() {
      const t = q(".pk-tree");
      const brand = folders.filter((f) => f.kind === "collection");
      const norm = folders.filter((f) => f.kind !== "collection");
      const node = (f, cls) => `<div class="tnode ${cls} ${activeFolder === f.id ? "active" : ""}" data-f="${f.id}">
        <span class="tn-ico">${svg(f.kind === "collection" ? "star" : "folder")}</span>
        <span class="tn-name">${esc(f.name)}</span></div>`;
      t.innerHTML =
        `<div class="tnode ${!activeFolder ? "active" : ""}" data-f=""><span class="tn-ico">${svg("folder")}</span><span class="tn-name">All files</span></div>` +
        (brand.length ? `<div class="tree-sec" style="color:var(--gold-500)">Brand${""}</div>` + brand.map((f) => node(f, "brand")).join("") : "") +
        (norm.length ? `<div class="tree-sec">Folders</div>` + norm.map((f) => node(f, "")).join("") : "");
      t.querySelectorAll(".tnode").forEach((n) => n.onclick = () => { activeFolder = n.getAttribute("data-f") || null; renderTree(); renderGrid(); });
    }
    function renderGrid() {
      const g = q(".pk-grid"); const list = visibleAssets();
      if (!list.length) { g.innerHTML = `<div class="empty-state"><div class="es-ico">${svg("image", 22)}</div><h3>No assets here</h3><p>Upload a file or pick another folder.</p></div>`; return; }
      g.innerHTML = `<div class="asset-grid">` + list.map((a) => `
        <div class="asset-card ${picked.has(a.id) ? "sel" : ""}" data-a="${a.id}">
          <div class="asset-check">${svg("check", 13)}</div>
          <div class="asset-thumb">${a.kind === "image" ? `<img src="${mockThumb(a)}" alt="${esc(a.filename)}">` : `<span class="at-ph">${svg(a.kind || "doc", 30)}</span>`}<span class="at-kind">${esc(a.kind || "file")}</span></div>
          <div class="asset-meta"><div class="am-name">${esc(a.filename)}</div><div class="am-sub"><span>${fmtBytes(a.bytes)}</span></div></div>
        </div>`).join("") + `</div>`;
      g.querySelectorAll(".asset-card").forEach((card) => card.onclick = () => {
        const id = card.getAttribute("data-a");
        if (mode === "single") { picked = new Set([id]); } else { picked.has(id) ? picked.delete(id) : picked.add(id); }
        renderGrid(); syncFoot();
      });
      syncFoot();
    }
    function syncFoot() { q(".pk-sel").textContent = picked.size ? `${picked.size} selected` : ""; q('[data-x="use"]').disabled = !picked.size; }

    async function load() {
      if (!connected()) { renderTree(); renderGrid(); return; }
      try {
        const c = client();
        const { data: { user } } = await c.auth.getUser();
        const { data: ws } = await c.from("workspaces").select("id").order("created_at").limit(1);
        const wsId = ws && ws[0] && ws[0].id;
        if (!wsId) { renderTree(); renderGrid(); return; }
        const [{ data: fs }, { data: as }] = await Promise.all([
          c.from("media_folders").select("id,name,bucket,kind,pinned").eq("workspace_id", wsId).order("pinned", { ascending: false }).order("name"),
          c.from("media_assets").select("id,filename,folder_id,bucket,kind,mime,bytes,ai_tags,storage_path").eq("workspace_id", wsId).is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
        ]);
        folders = fs && fs.length ? fs : []; assets = as || [];
      } catch (e) { /* fall back to whatever loaded */ }
      renderTree(); renderGrid();
    }

    // Inline upload → the same pipeline as /media (Storage upload + register RPC).
    q('[data-x="upload"]').onclick = () => {
      if (!connected()) { window.dispatchEvent(new CustomEvent("assetpicker:upload-demo")); return; }
      const input = document.getElementById("fileInput") || el("input", "", "");
      input.value = ""; input.click();
    };
    q('[data-x="cancel"]').onclick = close;
    q(".pk-search").oninput = (e) => { query = e.target.value.trim().toLowerCase(); renderGrid(); };
    q('[data-x="use"]').onclick = () => { const chosen = assets.filter((a) => picked.has(a.id)); close(); onSelect(chosen); };
    scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
    document.addEventListener("keydown", function onEsc(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onEsc); } });

    load();
  }

  window.AssetPicker = { open, mockThumb, _fmtBytes: fmtBytes };
})();
