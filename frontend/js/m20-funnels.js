/* m20-funnels.js — AiMindShare Module M20 · Funnels.
   Vanilla hash-routed dashboard on Supabase. Multi-step conversion flows on top of
   the M19 page engine: opt-in → sales → order → upsell → thank-you, with per-step
   conversion tracking and A/B split testing. A funnel is an ordered list of M19
   pages (funnel_steps.page_id → pages.id); funnel_map() is the server truth for the
   step map + waterfall; funnel_split_stats() runs the two-proportion z-test; orders
   wire to M28 by creating an invoices row (source_type='order') — the public-funnel
   Edge Fn owns the service-role writes. The browser READS its data (RLS-scoped,
   staff+ operator ceiling) and calls the RPCs/Edge Fn. Anon key only (Law 3). No
   project connected → a high-fidelity mockup with a default/empty/loading/error/
   success preview switcher (Gate-5).

   Scope (BUILD-SEQUENCE S19 accept-when): step builder on M19 pages · funnel map
   with per-step conversion · A/B split with winner detection · order forms wired to
   M28. Deferred + labelled: one-click off-session Stripe upsell (seam present),
   public funnel renderer (M19 site-render), sequential significance. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const initials = (s) => (s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  /* ── Money (integer MINOR units everywhere — matches M28, D-072) ─────────── */
  const CUR = { USD: "$", EUR: "€", GBP: "£", AUD: "A$", CAD: "C$", AED: "د.إ", SAR: "﷼" };
  const money = (minor, cur = "USD") => (CUR[cur] || cur + " ") +
    (Number(minor || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const money2 = (minor, cur = "USD") => (CUR[cur] || cur + " ") +
    (Number(minor || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInt = (n) => Number(n || 0).toLocaleString("en-US");
  const pct = (n) => (Math.round(Number(n || 0) * 10) / 10) + "%";

  /* ── Inline icons (lucide-style) ─────────────────────────────────────────── */
  const P = {
    funnel: "M3 4h18l-7 8v7l-4 2v-9L3 4z", layers: "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
    split: "M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5", target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    chart: "M3 3v18h18M7 15l4-4 3 3 5-6", flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
    cart: "M2 3h2l2.4 12.2a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6M9 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2M20 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2",
    up: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6", users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    plus: "M12 5v14M5 12h14", check: "M20 6 9 17l-5-5", chev: "M9 18l6-6-6-6", back: "M19 12H5M12 19l-7-7 7-7",
    trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14", settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
    file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6", edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z",
    trophy: "M6 9a6 6 0 0 0 12 0V3H6zM6 5H3v2a3 3 0 0 0 3 3M18 5h3v2a3 3 0 0 1-3 3M9 21h6M12 17v4", mail: "M4 4h16v16H4zM22 6l-10 7L2 6",
    gift: "M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7",
    link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1", zap: "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  };
  const svg = (n, s = 17) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${P[n] || ""}"/></svg>`;
  const TYPE_ICO = { optin: "mail", sales: "file", order: "cart", upsell: "up", downsell: "gift", thankyou: "check" };
  const TYPE_LABEL = { optin: "Opt-in", sales: "Sales", order: "Order", upsell: "Upsell", downsell: "Downsell", thankyou: "Thank you" };

  /* ── Theme + starfield (light default; dark = no stars) ──────────────────── */
  const THEME_KEY = "aimindshare-theme";
  const root = document.documentElement;
  const setTheme = (t) => { root.setAttribute("data-theme", t); try { localStorage.setItem(THEME_KEY, t); } catch (e) {} const i = $("#themeIco"); if (i) i.textContent = t === "dark" ? "☀" : "☾"; };
  setTheme((() => { try { return localStorage.getItem(THEME_KEY) || "light"; } catch (e) { return "light"; } })());
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  (function stars() {
    const field = $("#starField"); if (!field || reduce) return;
    for (let i = 0; i < 42; i++) { const s = el("div", "star"); s.style.left = Math.random() * 100 + "%"; s.style.top = Math.random() * 100 + "%"; s.style.setProperty("--tw", (3 + Math.random() * 7).toFixed(1) + "s"); s.style.setProperty("--td", (Math.random() * 10).toFixed(1) + "s"); field.appendChild(s); }
  })();

  /* ── Config + Supabase client (anon key only) ────────────────────────────── */
  const CFG_KEY = "aimindshare-supabase", ACTIVE_KEY = "aimindshare-active-ws";
  function getCfg() {
    try { const s = JSON.parse(localStorage.getItem(CFG_KEY) || "null"); if (s && s.url) return s; } catch (e) {}
    const g = window.AIMINDSHARE_CONFIG;
    if (g && g.SUPABASE_URL && !/YOUR-/.test(g.SUPABASE_URL)) return { url: g.SUPABASE_URL, anon: g.SUPABASE_ANON_KEY };
    return null;
  }
  let client = null;
  function ensureClient() {
    const cfg = getCfg();
    if (!cfg || !window.supabase || !window.supabase.createClient) { client = null; return null; }
    if (!client) client = window.supabase.createClient(cfg.url, cfg.anon || "", { auth: { persistSession: true, autoRefreshToken: true } });
    return client;
  }
  const connected = () => !!getCfg() && !!window.supabase;

  /* ── Connect drawer ──────────────────────────────────────────────────────── */
  const drawer = $("#drawer"), scrim = $("#scrim");
  const openDrawer = () => { const c = getCfg(); if (c) { $("#inpUrl").value = c.url; $("#inpAnon").value = c.anon || ""; } drawer.classList.add("open"); scrim.classList.add("open"); };
  const closeDrawer = () => { drawer.classList.remove("open"); scrim.classList.remove("open"); };
  $("#closeDrawer").addEventListener("click", closeDrawer);
  scrim.addEventListener("click", closeDrawer);
  $("#saveCfg").addEventListener("click", async () => {
    const url = $("#inpUrl").value.trim(), anon = $("#inpAnon").value.trim();
    if (!url) { $("#inpUrl").focus(); return; }
    try { localStorage.setItem(CFG_KEY, JSON.stringify({ url, anon })); } catch (e) {}
    client = null; closeDrawer(); state.loaded = false; await boot();
  });
  $("#clearCfg").addEventListener("click", async () => { try { localStorage.removeItem(CFG_KEY); } catch (e) {} $("#inpUrl").value = ""; $("#inpAnon").value = ""; client = null; state.loaded = false; await boot(); });

  /* ── Toast ───────────────────────────────────────────────────────────────── */
  function toast(msg, kind = "info") {
    const ico = kind === "success" ? "✓" : kind === "danger" ? "⚠" : "◈";
    const t = el("div", "toast " + kind, `<span class="t-ico">${ico}</span><div>${esc(msg)}</div>`);
    $("#toasts").appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateX(20px)"; setTimeout(() => t.remove(), 300); }, 3200);
  }

  /* ── Mockup dataset (never a live code path) ─────────────────────────────── */
  const MOCK = {
    user: { id: "you", email: "aisha@northstar.agency", name: "Aisha Rahman" },
    workspace: { id: "ws-agency", name: "Northstar Agency" },
    pages: [
      { id: "p1", title: "Free Ramadan Planner — Opt-in", slug: "ramadan-planner" },
      { id: "p2", title: "Reset Masterclass — Sales", slug: "masterclass" },
      { id: "p3", title: "Checkout — The Reset Bundle", slug: "checkout" },
      { id: "p4", title: "One-time Upsell — Coaching", slug: "upsell-coaching" },
      { id: "p5", title: "Thank You", slug: "thank-you" },
      { id: "p6", title: "Sales — Story-led (B)", slug: "masterclass-b" },
    ],
    funnels: [
      {
        id: "fn1", name: "Ramadan Reset Launch", status: "active", currency: "USD",
        settings: { abandon_hours: 1, pipeline: "Sales", stage: "New" },
        steps: [
          { id: "s1", step_type: "optin", name: "Free Planner", page_id: "p1", page_title: "Free Ramadan Planner — Opt-in", visitors: 4820, conversions: 2170, rate: 45.0, has_split: false },
          { id: "s2", step_type: "sales", name: "Masterclass", page_id: "p2", page_title: "Reset Masterclass — Sales", visitors: 2170, conversions: 954, rate: 44.0, has_split: true },
          { id: "s3", step_type: "order", name: "Checkout", page_id: "p3", page_title: "Checkout — The Reset Bundle", visitors: 954, conversions: 372, rate: 39.0, has_split: false, config: { products: [{ name: "The Reset Bundle", price: 19900 }], bump: { name: "Guided Journal", price: 2900 } } },
          { id: "s4", step_type: "upsell", name: "Coaching Upsell", page_id: "p4", page_title: "One-time Upsell — Coaching", visitors: 372, conversions: 96, rate: 25.8, has_split: false, config: { products: [{ name: "1:1 Coaching Call", price: 9900 }] } },
          { id: "s5", step_type: "thankyou", name: "Thank You", page_id: "p5", page_title: "Thank You", visitors: 372, conversions: 372, rate: 100, has_split: false },
        ],
        split: { step_id: "s2", a: { visitors: 1085, conversions: 466, rate: 42.9 }, b: { visitors: 1085, conversions: 531, rate: 48.9 }, z: 2.86, significant: true, leader: "B", status: "running", winner: null, variant_page_id: "p6", variant_page_title: "Sales — Story-led (B)" },
      },
      {
        id: "fn2", name: "Webinar Registration", status: "active", currency: "USD",
        settings: { abandon_hours: 2 },
        steps: [
          { id: "w1", step_type: "optin", name: "Register", page_id: "p1", page_title: "Webinar registration", visitors: 1960, conversions: 1120, rate: 57.1, has_split: false },
          { id: "w2", step_type: "sales", name: "Replay + Offer", page_id: "p2", page_title: "Replay page", visitors: 1120, conversions: 402, rate: 35.9, has_split: false },
          { id: "w3", step_type: "order", name: "Enroll", page_id: "p3", page_title: "Enrollment", visitors: 402, conversions: 148, rate: 36.8, has_split: false, config: { products: [{ name: "Course enrollment", price: 49900 }] } },
          { id: "w4", step_type: "thankyou", name: "Welcome", page_id: "p5", page_title: "Welcome aboard", visitors: 148, conversions: 148, rate: 100, has_split: false },
        ],
        split: null,
      },
      {
        id: "fn3", name: "Lead Magnet — Dua Cards", status: "draft", currency: "USD", settings: {}, steps: [], split: null,
      },
    ],
    utm: [{ source: "instagram", visitors: 2140 }, { source: "email", visitors: 1290 }, { source: "google", visitors: 880 }, { source: "direct", visitors: 510 }],
  };

  /* ── App state ───────────────────────────────────────────────────────────── */
  const state = {
    loaded: false, loading: false, error: null, previewState: "default",
    user: null, workspaceId: null, workspaceName: "", role: "owner",
    funnels: [], pages: [], glance: null, utm: [],
    active: null,                                   // the loaded funnel detail
    route: { name: "funnels" }, drawer: null,       // drawer = {stepId, tab}
  };
  const PREVIEW_STATES = ["default", "empty", "loading", "error", "success"];
  const st = (name) => !connected() && state.previewState === name;
  const canWrite = () => ["owner", "admin", "manager", "staff"].includes(state.role) || !connected();
  const canManage = () => ["owner", "admin", "manager"].includes(state.role) || !connected();
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* ── Data loading ────────────────────────────────────────────────────────── */
  async function boot() {
    parseRoute();
    if (connected()) {
      state.loading = true; state.error = null; render();
      try {
        const c = ensureClient();
        const { data: { user } } = await c.auth.getUser();
        state.user = user;
        if (!user) { state.loaded = true; state.loading = false; renderConn(); render(); return; }
        const { data: wsRows } = await c.from("workspaces").select("id,name,status").order("created_at");
        const active = pickActive(wsRows || []);
        if (!active) { state.loaded = true; state.loading = false; renderConn(); render(); return; }
        state.workspaceId = active.id; state.workspaceName = active.name;
        const { data: mine } = await c.from("memberships").select("role").eq("workspace_id", active.id).eq("user_id", user.id).maybeSingle();
        state.role = mine?.role || "staff";
        await loadFunnels(active.id);
        if (state.route.name === "funnel" && state.route.id) await loadDetail(state.route.id);
      } catch (e) { state.error = e.message || String(e); }
      state.loading = false; state.loaded = true;
    } else {
      state.user = MOCK.user; state.workspaceId = MOCK.workspace.id; state.workspaceName = MOCK.workspace.name; state.role = "owner";
      state.funnels = MOCK.funnels.map(clone); state.pages = MOCK.pages.map(clone); state.utm = MOCK.utm.map(clone);
      state.glance = mockGlance();
      if (state.route.name === "funnel") state.active = state.funnels.find((f) => f.id === state.route.id) || null;
      state.loaded = true; state.loading = false;
    }
    renderConn(); render();
  }
  function pickActive(list) {
    const usable = (list || []).filter((w) => w.status !== "archived");
    if (!usable.length) return list[0] || null;
    let id; try { id = localStorage.getItem(ACTIVE_KEY); } catch (e) {}
    return usable.find((w) => w.id === id) || usable[0];
  }
  function mockGlance() {
    const all = MOCK.funnels.flatMap((f) => f.steps);
    const visitors = all.filter((s) => s.step_type === "optin").reduce((a, s) => a + s.visitors, 0);
    const optins = all.filter((s) => s.step_type === "optin").reduce((a, s) => a + s.conversions, 0);
    const orders = 520, revenue = 11486000;
    return { visitors, optins, optin_rate: visitors ? (optins / visitors * 100) : 0, orders, revenue, currency: "USD" };
  }
  async function loadFunnels(wsId) {
    const c = ensureClient();
    const [{ data: fns }, { data: pages }] = await Promise.all([
      c.from("funnels").select("*").is("archived_at", null).order("created_at", { ascending: false }),
      c.from("pages").select("id,title,slug").order("sort").limit(400),
    ]);
    state.funnels = (fns || []).map((f) => ({ ...f, currency: f.settings?.currency || "USD" }));
    state.pages = pages || [];
    // Light revenue glance from M28 orders + funnel_visits counts (RLS-scoped).
    const [{ count: viewCount }, { count: optinCount }, { data: orders }] = await Promise.all([
      c.from("funnel_visits").select("id", { count: "exact", head: true }).eq("event", "view"),
      c.from("funnel_visits").select("id", { count: "exact", head: true }).eq("event", "optin"),
      c.from("invoices").select("amount_paid,status").eq("source_type", "order"),
    ]);
    const paid = (orders || []).filter((o) => o.amount_paid > 0);
    state.glance = {
      visitors: viewCount || 0, optins: optinCount || 0,
      optin_rate: viewCount ? (optinCount / viewCount * 100) : 0,
      orders: (orders || []).length, revenue: paid.reduce((a, o) => a + (o.amount_paid || 0), 0), currency: "USD",
    };
  }
  async function loadDetail(id) {
    const c = ensureClient();
    const f = state.funnels.find((x) => x.id === id);
    if (!f) { state.active = null; return; }
    const [{ data: mapData }, { data: splits }] = await Promise.all([
      c.rpc("funnel_map", { p_funnel: id }),
      c.from("funnel_splits").select("*").order("created_at", { ascending: false }),
    ]);
    const pageById = Object.fromEntries(state.pages.map((p) => [p.id, p]));
    const steps = (mapData || []).map((s) => ({
      ...s, page_title: pageById[s.page_id]?.title || (s.page_id ? "Linked page" : "No page yet"),
    }));
    // attach the running split (if any) — the drawer fetches live stats on open.
    const splitByStep = {};
    (splits || []).forEach((sp) => { if (!splitByStep[sp.step_id]) splitByStep[sp.step_id] = sp; });
    state.active = { ...f, steps, splitByStep, currency: f.settings?.currency || "USD" };
  }

  /* ── Router ──────────────────────────────────────────────────────────────── */
  function parseRoute() {
    const h = (location.hash || "#/funnels").replace(/^#/, "");
    const parts = h.split("/").filter(Boolean);
    if (parts[0] === "funnels" && parts[1]) {
      state.route = { name: "funnel", id: parts[1], tab: ["map", "analytics", "settings"].includes(parts[2]) ? parts[2] : "map" };
    } else {
      state.route = { name: "funnels" };
    }
  }
  window.addEventListener("hashchange", async () => {
    const prev = state.route.name === "funnel" ? state.route.id : null;
    parseRoute();
    if (state.route.name === "funnel" && state.route.id && connected() && state.route.id !== prev) {
      state.loading = true; render(); try { await loadDetail(state.route.id); } catch (e) { state.error = e.message; } state.loading = false;
    } else if (!connected() && state.route.name === "funnel") {
      state.active = state.funnels.find((f) => f.id === state.route.id) || null;
    }
    state.drawer = null;
    render();
  });

  /* ── Shell (rail + topbar) ───────────────────────────────────────────────── */
  const NAV = [
    { key: "funnels", label: "Funnels", ico: "funnel", hash: "#/funnels" },
    { key: "pages", label: "Pages (M19)", ico: "layers", hash: "#/funnels" },
    { key: "settings", label: "Settings", ico: "settings", hash: "#/funnels" },
  ];
  function shell(activeKey, content) {
    const nav = NAV.map((n) => `<div class="nav-item ${n.key === activeKey ? "active" : ""}" data-hash="${n.hash}"><span class="ni-ico">${svg(n.ico)}</span><span>${n.label}</span></div>`).join("");
    return `
      <aside class="rail" id="rail">
        <div class="brand"><span class="mark">✦</span><span><b>AiMind</b><em>Share</em></span></div>
        <div class="nav-group"><div class="nav-group-label">Acquisition</div>${nav}</div>
        <div class="rail-foot">M20 · Funnels</div>
      </aside>
      <header class="tbar">
        <button class="icon-btn rail-burger" id="railBurger" aria-label="Menu">☰</button>
        <div class="ws-trigger" style="cursor:default">
          <span class="ws-badge">${esc(initials(state.workspaceName || "AiMindShare"))}</span>
          <span class="ws-meta"><span class="ws-name">${esc(state.workspaceName || "Workspace")}</span><span class="ws-kind">Funnels</span></span>
        </div>
        <div class="spacer"></div>
        <span class="pill plain" id="connPill">mockup mode</span>
        <button class="btn btn-ghost btn-sm" id="openConnect2">Connect</button>
        <button class="icon-btn" id="themeToggle" title="Toggle theme" aria-label="Toggle theme"><span id="themeIco">☾</span></button>
        <span class="avatar" title="${esc(state.user?.email || "")}">${esc(initials(state.user?.name || state.user?.email))}</span>
      </header>
      <main class="content"><div class="content-inner">${content}</div></main>`;
  }
  function previewStrip() {
    if (connected()) return "";
    return `<div class="mock-note"><span class="mn-ico">◈</span><b>Mockup mode.</b>
      Connect a project to read live funnels, conversion stats &amp; A/B results. Sample data shown. Preview state:
      ${PREVIEW_STATES.map((s) => `<button class="link ${state.previewState === s ? "on" : ""}" data-preview="${s}">${s}</button>`).join(" ")}</div>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     List view
     ══════════════════════════════════════════════════════════════════════════ */
  function funnelStats(f) {
    const steps = f.steps || [];
    const optin = steps.find((s) => s.step_type === "optin") || steps[0];
    const order = steps.find((s) => s.step_type === "order");
    const visitors = optin?.visitors || 0;
    const optinRate = optin?.rate || 0;
    const orders = order?.conversions || 0;
    return { visitors, optinRate, orders };
  }
  function viewList() {
    if (st("loading")) return shell("funnels", loadingBlock());
    if (st("error")) return shell("funnels", errorBlock());
    const g = st("empty") ? { visitors: 0, optins: 0, optin_rate: 0, orders: 0, revenue: 0, currency: "USD" } : (state.glance || {});
    const head = `<div class="fn-head">
      <div><div class="eyebrow">${svg("funnel", 13)} Acquisition · M20</div>
        <div class="ph-title">Conversion <em>funnels</em></div>
        <div class="ph-sub">Multi-step flows on your published pages — opt-in to order to upsell — with per-step conversion and A/B split testing.</div></div>
      <div class="spacer"></div>
      ${canWrite() ? `<button class="btn btn-primary" id="newFunnel">${svg("plus", 15)} New funnel</button>` : ""}
    </div>`;
    const kpi = (tone, ico, val, label, delta) => `<div class="kpi ${tone || ""}"><div class="kpi-ico">${svg(ico)}</div>
      <div class="kpi-val">${val}</div><div class="kpi-label">${label}</div>${delta ? `<div class="kpi-delta ${delta.dir || ""}">${delta.text}</div>` : ""}</div>`;
    const glance = `<div class="rev-strip">
      ${kpi("", "users", fmtInt(g.visitors), "Visitors", { text: "into your funnels", dir: "" })}
      ${kpi("", "target", pct(g.optin_rate), "Opt-in rate", { text: `${fmtInt(g.optins)} leads`, dir: "up" })}
      ${kpi("", "cart", fmtInt(g.orders), "Orders", { text: "wired to payments", dir: "" })}
      ${kpi("kpi-featured", "trophy", money(g.revenue, g.currency), "Revenue", { text: "collected", dir: "up" })}
    </div>`;

    const list = st("empty") ? [] : state.funnels;
    let body;
    if (!list.length) {
      body = `<div class="panel"><div class="empty-state">
        <div class="es-ico">${svg("funnel", 24)}</div>
        <h3>Build your first funnel</h3>
        <p>A funnel chains your published pages into a conversion flow — opt-in, sales, order, upsell, thank-you — and tracks how visitors move through each step.</p>
        ${canWrite() ? `<button class="btn btn-primary es-cta" id="newFunnel2">${svg("plus", 14)} New funnel</button>` : ""}
      </div></div>`;
    } else {
      body = `<div class="fn-grid">${list.map(funnelCard).join("")}</div>`;
    }
    return shell("funnels", previewStrip() + head + glance + body);
  }
  function funnelCard(f) {
    const s = funnelStats(f);
    const stepCount = (f.steps || []).length;
    return `<div class="panel fn-card" data-funnel="${f.id}">
      <div class="fc-top">
        <div class="fc-ico">${svg("funnel", 19)}</div>
        <div style="min-width:0;flex:1">
          <div class="fc-name">${esc(f.name)}</div>
          <div class="fc-meta">${stepCount} step${stepCount === 1 ? "" : "s"} · ${esc((f.steps || []).map((x) => TYPE_LABEL[x.step_type]).slice(0, 3).join(" → ") || "no steps yet")}</div>
        </div>
        <span class="st st-${f.status}">${esc(f.status)}</span>
      </div>
      <div class="fc-stats">
        <div class="fc-stat"><div class="fs-val">${fmtInt(s.visitors)}</div><div class="fs-label">Visitors</div></div>
        <div class="fc-stat"><div class="fs-val">${pct(s.optinRate)}</div><div class="fs-label">Opt-in</div></div>
        <div class="fc-stat"><div class="fs-val fc-rev">${fmtInt(s.orders)}</div><div class="fs-label">Orders</div></div>
      </div>
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Funnel detail — map / analytics / settings
     ══════════════════════════════════════════════════════════════════════════ */
  function viewFunnel() {
    if (st("loading") || (connected() && state.loading)) return shell("funnels", loadingBlock());
    if (st("error")) return shell("funnels", errorBlock());
    const f = state.active;
    if (!f) return shell("funnels", `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("funnel", 24)}</div><h3>Funnel not found</h3><p>It may have been deleted.</p><button class="btn btn-ghost es-cta" data-hash="#/funnels">Back to funnels</button></div></div>`);
    const tab = state.route.tab || "map";
    const head = `<div class="fn-head">
      <div><div class="fn-back" data-hash="#/funnels">${svg("back", 14)} All funnels</div>
        <div class="eyebrow">${svg("funnel", 13)} Funnel</div>
        <div class="ph-title" style="margin-top:6px">${esc(f.name)}</div></div>
      <div class="spacer"></div>
      <span class="st st-${f.status}" style="align-self:center">${esc(f.status)}</span>
    </div>`;
    const tabs = `<div class="fn-tabs">
      ${["map", "analytics", "settings"].map((t) => `<div class="fn-tab ${t === tab ? "on" : ""}" data-tab="${t}">${svg(t === "map" ? "funnel" : t === "analytics" ? "chart" : "settings", 15)} ${t[0].toUpperCase() + t.slice(1)}</div>`).join("")}
    </div>`;
    const body = tab === "analytics" ? tabAnalytics(f) : tab === "settings" ? tabSettings(f) : tabMap(f);
    return shell("funnels", previewStrip() + head + tabs + body);
  }

  function tabMap(f) {
    const steps = (f.steps || []).slice().sort((a, b) => (a.step_order || 0) - (b.step_order || 0));
    if (!steps.length) {
      return `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("funnel", 24)}</div>
        <h3>No steps yet</h3><p>Add your first step and pick a published page. Each step becomes a stage in the conversion flow.</p>
        ${canWrite() ? `<button class="btn btn-primary es-cta" id="addStep0">${svg("plus", 14)} Add a step</button>` : ""}</div></div>`;
    }
    let html = "";
    steps.forEach((s, i) => {
      const barW = Math.max(4, Math.min(100, Number(s.rate) || 0));
      html += `<div class="map-step"><div class="map-card type-${s.step_type}" data-step="${s.id}">
        ${s.has_split ? `<div class="ms-split">${svg("split", 9)} A/B</div>` : ""}
        <div class="ms-top"><div class="ms-badge">${svg(TYPE_ICO[s.step_type] || "file", 15)}</div>
          <div style="min-width:0"><div class="ms-type">${TYPE_LABEL[s.step_type] || s.step_type}</div>
          <div class="ms-name">${esc(s.name || s.page_title || "Step")}</div></div></div>
        <div class="ms-visitors">${fmtInt(s.visitors)}</div><div class="ms-vlabel">Visitors</div>
        <div class="ms-bar"><span style="width:${barW}%"></span></div>
        <div class="ms-conv"><span>Converts</span><b>${pct(s.rate)}</b></div>
      </div></div>`;
      if (i < steps.length - 1) {
        const next = steps[i + 1];
        const drop = s.visitors > 0 ? Math.round((1 - (next.visitors / s.visitors)) * 100) : 0;
        html += `<div class="map-join"><div class="mj-line">${svg("chev", 20)}</div><div class="mj-drop ${drop >= 60 ? "warn" : ""}">−${drop}%</div></div>`;
      }
    });
    if (canWrite()) html += `<div class="map-add"><button id="addStep">${svg("plus", 20)}<span>Add step</span></button></div>`;
    return `<div class="panel" style="padding:20px 18px"><div class="fn-map">${html}</div></div>`;
  }

  function tabAnalytics(f) {
    const steps = (f.steps || []).slice().sort((a, b) => (a.step_order || 0) - (b.step_order || 0));
    if (!steps.length) return `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("chart", 24)}</div><h3>No data yet</h3><p>Add steps and drive traffic to see the conversion waterfall.</p></div></div>`;
    const maxV = Math.max(1, ...steps.map((s) => s.visitors || 0));
    const waterfall = steps.map((s, i) => {
      const w = Math.max(2, (s.visitors / maxV) * 100);
      const dropFromPrev = i === 0 ? null : (steps[i - 1].visitors > 0 ? Math.round((1 - s.visitors / steps[i - 1].visitors) * 100) : 0);
      return `<div class="wf-row">
        <div class="wf-name"><span class="wf-badge">${svg(TYPE_ICO[s.step_type] || "file", 12)}</span><span>${esc(s.name || TYPE_LABEL[s.step_type])}</span></div>
        <div class="wf-track ${s.step_type === "order" || s.step_type === "upsell" ? "gold" : ""}"><span style="width:${w}%"></span></div>
        <div class="wf-nums">${fmtInt(s.visitors)}<small>${dropFromPrev == null ? pct(s.rate) + " conv" : "−" + dropFromPrev + "% drop"}</small></div>
      </div>`;
    }).join("");
    const utm = (st("empty") ? [] : state.utm);
    const maxU = Math.max(1, ...utm.map((u) => u.visitors));
    const utmHtml = utm.length ? utm.map((u) => `<div class="utm-row"><span class="utm-name">${esc(u.source)}</span>
      <span class="utm-bar"><span style="width:${(u.visitors / maxU * 100).toFixed(0)}%"></span></span>
      <span class="utm-val">${fmtInt(u.visitors)}</span></div>`).join("")
      : `<p class="muted" style="padding:8px 4px">UTM breakdown appears once tracked visits arrive.</p>`;
    return `<div style="display:grid;grid-template-columns:1.6fr 1fr;gap:18px" class="fn-analytics-grid">
      <div class="panel"><div class="panel-head"><div class="ph-ico">${svg("chart", 15)}</div><h3>Conversion waterfall</h3></div><div class="waterfall">${waterfall}</div></div>
      <div class="panel"><div class="panel-head"><div class="ph-ico">${svg("link", 15)}</div><h3>Traffic by source</h3></div><div class="utm-list">${utmHtml}</div></div>
    </div>`;
  }

  function tabSettings(f) {
    const s = f.settings || {};
    return `<div style="display:flex;flex-direction:column;gap:18px;max-width:640px">
      <div class="panel"><div class="panel-head"><div class="ph-ico">${svg("target", 15)}</div><h3>CRM &amp; pipeline mapping</h3></div>
        <p class="muted" style="margin-bottom:14px;font-size:13px">On purchase, create a deal in this pipeline &amp; stage and fire the <span class="mono">payment.received</span> automation trigger.</p>
        <div class="form-grid">
          <div class="form-field"><label>Pipeline</label><input id="setPipeline" value="${esc(s.pipeline || "")}" placeholder="e.g. Sales" ${canManage() ? "" : "disabled"}></div>
          <div class="form-field"><label>Stage</label><input id="setStage" value="${esc(s.stage || "")}" placeholder="e.g. New" ${canManage() ? "" : "disabled"}></div>
        </div></div>
      <div class="panel"><div class="panel-head"><div class="ph-ico">${svg("cart", 15)}</div><h3>Cart abandonment</h3></div>
        <p class="muted" style="margin-bottom:14px;font-size:13px">An order started but unpaid past this window fires <span class="mono">cart.abandoned</span> for M13 recovery sequences. Runs hourly (<span class="mono">m20-abandoned-sweep</span>).</p>
        <div class="form-field" style="max-width:220px"><label>Abandon after (hours)</label>
          <input id="setAbandon" class="num" value="${esc(s.abandon_hours ?? 1)}" ${canManage() ? "" : "disabled"}></div></div>
      ${canManage() ? `<div style="display:flex;gap:10px"><button class="btn btn-primary" id="saveSettings">${svg("check", 15)} Save settings</button>
        <button class="btn btn-ghost" id="delFunnel" style="color:var(--status-danger);border-color:var(--status-danger)">${svg("trash", 15)} Delete funnel</button></div>` : ""}
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Step drawer — page / config / split
     ══════════════════════════════════════════════════════════════════════════ */
  function stepDrawerHtml() {
    const d = state.drawer; if (!d) return "";
    const f = state.active; const step = (f?.steps || []).find((s) => s.id === d.stepId);
    if (!step) return "";
    const tab = d.tab || "page";
    const tabs = `<div class="sd-tabs">
      ${["page", "config", "split"].map((t) => `<div class="sd-tab ${t === tab ? "on" : ""}" data-sdtab="${t}">${t === "page" ? "Page" : t === "config" ? "Config" : "A/B Split"}</div>`).join("")}
    </div>`;
    let body;
    if (tab === "page") body = drawerPage(step);
    else if (tab === "config") body = drawerConfig(step, f);
    else body = drawerSplit(step, f);
    return `<aside class="drawer step-drawer open" id="stepDrawer" aria-label="Step">
      <div style="display:flex;align-items:center;gap:11px;margin-bottom:4px">
        <div class="fc-ico" style="width:34px;height:34px;font-size:16px">${svg(TYPE_ICO[step.step_type] || "file", 16)}</div>
        <div style="flex:1"><h3 style="margin:0">${esc(step.name || TYPE_LABEL[step.step_type])}</h3>
          <div class="mono" style="font-size:11px;color:var(--ink-400)">${TYPE_LABEL[step.step_type]} step</div></div>
        <button class="icon-btn" id="closeStep" aria-label="Close">✕</button>
      </div>
      ${tabs}${body}
    </aside>`;
  }
  function drawerPage(step) {
    return `<div style="display:flex;flex-direction:column;gap:14px">
      <div class="pagelink">
        <div class="pl-ico">${svg("layers", 17)}</div>
        <div style="flex:1;min-width:0"><div class="pl-name">${esc(step.page_title || "No page linked")}</div>
          <div class="pl-sub">${step.page_id ? "M19 page · published" : "pick a page below"}</div></div>
        ${step.page_id ? `<button class="btn btn-ghost btn-sm" id="openPage">${svg("edit", 14)} Edit</button>` : ""}
      </div>
      <div class="form-field"><label>Linked page</label>
        <select id="stepPage" ${canWrite() ? "" : "disabled"}>
          <option value="">— choose a published page —</option>
          ${state.pages.map((p) => `<option value="${p.id}" ${p.id === step.page_id ? "selected" : ""}>${esc(p.title)}</option>`).join("")}
        </select>
        <span class="hint">Each funnel step renders one of your M19 pages. Build the page in the Sites editor; wire it here.</span></div>
      <div class="form-field"><label>Step name</label><input id="stepName" value="${esc(step.name || "")}" ${canWrite() ? "" : "disabled"}></div>
      ${canWrite() ? `<button class="btn btn-primary" id="saveStepPage">${svg("check", 15)} Save step</button>` : ""}
    </div>`;
  }
  function drawerConfig(step, f) {
    const cfg = step.config || {};
    const typeSeg = `<div class="form-field"><label>Step type</label>
      <div class="seg" id="stepTypeSeg">${Object.keys(TYPE_LABEL).map((t) => `<button data-type="${t}" class="${step.step_type === t ? "on" : ""}">${TYPE_LABEL[t]}</button>`).join("")}</div></div>`;
    let orderCfg = "";
    if (step.step_type === "order" || step.step_type === "upsell" || step.step_type === "downsell") {
      const products = cfg.products || [{ name: "", price: 0 }];
      orderCfg = `<div class="form-field"><label>Products (wired to payments · M28)</label>
        <div id="prodRows">${products.map((p, i) => prodRow(p, i, f.currency)).join("")}</div>
        ${canWrite() ? `<button class="btn btn-ghost btn-sm" id="addProd" style="margin-top:2px">${svg("plus", 14)} Add product</button>` : ""}</div>
        <div class="bump-toggle"><span style="color:var(--gold-500)">${svg("gift", 16)}</span>
          <div style="flex:1"><div style="font-size:13px;color:var(--ink-900)">Order bump</div>
            <div style="font-size:11.5px;color:var(--ink-400)">${cfg.bump ? esc(cfg.bump.name) + " · " + money2(cfg.bump.price, f.currency) : "A pre-purchase checkbox add-on"}</div></div>
          <label style="font-size:12px;color:var(--ink-500)"><input type="checkbox" id="bumpOn" ${cfg.bump ? "checked" : ""} ${canWrite() ? "" : "disabled"}> enable</label></div>`;
    }
    return `<div style="display:flex;flex-direction:column;gap:14px">
      ${typeSeg}${orderCfg}
      ${canWrite() ? `<button class="btn btn-primary" id="saveStepCfg">${svg("check", 15)} Save configuration</button>` : `<p class="muted">You have read-only access to this funnel.</p>`}
    </div>`;
  }
  function prodRow(p, i, cur) {
    return `<div class="prod-row" data-prod="${i}">
      <input data-pf="name" placeholder="Product name" value="${esc(p.name || "")}">
      <input data-pf="price" class="num" placeholder="0.00" value="${p.price ? (p.price / 100).toFixed(2) : ""}">
      <button class="prod-del" data-proddel="${i}" title="Remove">${svg("trash", 14)}</button>
    </div>`;
  }
  function drawerSplit(step, f) {
    const sp = step._splitStats;   // populated on drawer open (live) / from mock
    if (!sp) {
      return `<div class="split-wrap">
        <p class="muted" style="font-size:13px">No A/B test on this step. Create one to serve two page variants, split the traffic, and let AiMindShare detect a winner by significance.</p>
        <div class="form-field"><label>Variant B page</label>
          <select id="splitPage">${state.pages.filter((p) => p.id !== step.page_id).map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join("")}</select></div>
        <div class="form-grid">
          <div class="form-field"><label>Traffic to B (%)</label><input id="splitPct" class="num" value="50"></div>
          <div class="form-field"><label>Goal</label><select id="splitGoal"><option value="progression">Step progression</option><option value="purchase">Purchase</option></select></div>
        </div>
        ${canWrite() ? `<button class="btn btn-primary" id="createSplit">${svg("split", 15)} Start A/B test</button>` : ""}
      </div>`;
    }
    const winnerBanner = sp.status === "promoted"
      ? `<div class="split-winner"><div class="sw-ico">${svg("trophy", 16)}</div><div class="sw-body">
          <div class="sw-title">Variant ${sp.winner} promoted</div><div class="sw-sub">Live traffic now goes to the winning page.</div></div></div>`
      : sp.significant
        ? `<div class="split-winner"><div class="sw-ico">${svg("check", 16)}</div><div class="sw-body">
            <div class="sw-title">Variant ${sp.leader} is winning — statistically significant</div>
            <div class="sw-sub">z = ${sp.z} (95% confidence). Safe to promote.</div></div>
            ${canManage() ? `<button class="btn btn-gold btn-sm" id="promoteWin" data-variant="${sp.leader}">${svg("trophy", 14)} Promote ${sp.leader}</button>` : ""}</div>`
        : `<div class="split-winner pending"><div class="sw-ico">${svg("split", 16)}</div><div class="sw-body">
            <div class="sw-title">Test running — no clear winner yet</div>
            <div class="sw-sub">z = ${sp.z}. Keep sampling until it clears 95% (both arms ≥ 30 visitors).</div></div></div>`;
    const variant = (key, label, v, pageTitle, lead) => `<div class="variant ${key} ${lead ? "lead" : ""}">
      <div class="v-tag">${svg(key === "a" ? "flag" : "split", 11)} Variant ${label}${lead ? " · leading" : ""}</div>
      <div class="v-rate">${pct(v.rate)}</div>
      <div class="v-detail">${fmtInt(v.conversions)} / ${fmtInt(v.visitors)} converted</div>
      <div class="v-page">${esc(pageTitle || "—")}</div></div>`;
    return `<div class="split-wrap">
      ${winnerBanner}
      <div class="variant-grid">
        ${variant("a", "A", sp.a, step.page_title, sp.leader === "A")}
        ${variant("b", "B", sp.b, sp.variant_page_title || "Variant B page", sp.leader === "B")}
      </div>
      ${sp.status !== "promoted" && canManage() ? `<div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" id="promoteA" data-variant="A">Promote A</button>
        <button class="btn btn-ghost btn-sm" id="promoteB" data-variant="B">Promote B</button></div>` : ""}
    </div>`;
  }

  /* ── Shared state blocks (Gate-5) ────────────────────────────────────────── */
  function loadingBlock() {
    return previewStrip() + `<div class="fn-head"><div><div class="eyebrow">${svg("funnel", 13)} Acquisition · M20</div><div class="ph-title">Conversion <em>funnels</em></div></div></div>
      <div class="rev-strip">${[0, 1, 2, 3].map(() => `<div class="kpi"><div class="skeleton" style="height:34px;width:34px;border-radius:10px"></div><div class="skeleton" style="height:22px;width:60%;margin-top:14px"></div><div class="skeleton" style="height:10px;width:40%;margin-top:10px"></div></div>`).join("")}</div>
      <div class="fn-grid">${[0, 1, 2].map(() => `<div class="panel" style="padding:22px"><div class="skeleton" style="height:40px;width:40px;border-radius:14px"></div><div class="skeleton" style="height:18px;width:70%;margin-top:14px"></div><div class="skeleton" style="height:44px;margin-top:16px;border-radius:10px"></div></div>`).join("")}</div>`;
  }
  function errorBlock() {
    const msg = state.error || "We couldn't reach the server.";
    return previewStrip() + `<div class="panel probe state-error" style="padding:40px;text-align:center">
      <div style="color:var(--status-danger);margin-bottom:10px">${svg("flag", 28)}</div>
      <div style="font-family:var(--font-serif);font-size:22px;color:var(--ink-900)">Something went wrong</div>
      <p class="muted" style="margin:8px auto 18px;max-width:420px">${esc(msg)}</p>
      <button class="btn btn-primary" id="retry">Try again</button></div>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Render dispatch + event wiring
     ══════════════════════════════════════════════════════════════════════════ */
  function render() {
    const app = $("#app"); app.classList.add("shell");
    app.innerHTML = state.route.name === "funnel" ? viewFunnel() : viewList();
    // step drawer overlay
    const existing = $("#stepDrawer"); if (existing) existing.remove();
    if (state.drawer) { document.body.insertAdjacentHTML("beforeend", stepDrawerHtml()); scrim.classList.add("open"); }
    document.body.classList.add("js-ready");
    wireCommon();
    if (state.route.name === "funnel") wireFunnel(); else wireList();
    if (state.drawer) wireStepDrawer();
  }
  function renderConn() {
    const pill = $("#connPill");
    if (pill) { const on = connected(); pill.textContent = on ? "live" : "mockup mode"; pill.classList.toggle("live", on); }
  }
  function wireCommon() {
    const burger = $("#railBurger"); if (burger) burger.addEventListener("click", () => $("#rail").classList.toggle("open"));
    $$("[data-hash]").forEach((n) => n.addEventListener("click", () => { location.hash = n.dataset.hash; $("#rail")?.classList.remove("open"); }));
    const tt = $("#themeToggle"); if (tt) tt.addEventListener("click", () => setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"));
    const oc = $("#openConnect2"); if (oc) oc.addEventListener("click", openDrawer);
    $$("[data-preview]").forEach((b) => b.addEventListener("click", () => { state.previewState = b.dataset.preview; state.drawer = null; render(); }));
    const retry = $("#retry"); if (retry) retry.addEventListener("click", () => { state.previewState = "default"; boot(); });
    renderConn();
  }
  function wireList() {
    ["newFunnel", "newFunnel2"].forEach((id) => { const b = $("#" + id); if (b) b.addEventListener("click", newFunnelModal); });
    $$("[data-funnel]").forEach((c) => c.addEventListener("click", () => { location.hash = "#/funnels/" + c.dataset.funnel; }));
  }
  function wireFunnel() {
    $$("[data-tab]").forEach((t) => t.addEventListener("click", () => {
      location.hash = `#/funnels/${state.route.id}/${t.dataset.tab}`;
    }));
    $$("[data-step]").forEach((c) => c.addEventListener("click", () => openStep(c.dataset.step)));
    ["addStep", "addStep0"].forEach((id) => { const b = $("#" + id); if (b) b.addEventListener("click", addStep); });
    const ss = $("#saveSettings"); if (ss) ss.addEventListener("click", saveSettings);
    const df = $("#delFunnel"); if (df) df.addEventListener("click", deleteFunnel);
  }

  async function openStep(stepId) {
    state.drawer = { stepId, tab: "page" };
    // load live split stats for the split tab (best-effort)
    const step = (state.active?.steps || []).find((s) => s.id === stepId);
    if (step) step._splitStats = await splitStatsFor(step);
    render();
  }
  async function splitStatsFor(step) {
    if (!connected()) {   // mock: read from the funnel's single split object
      const mf = MOCK.funnels.find((f) => f.id === state.active?.id);
      const sp = mf?.split && mf.split.step_id === step.id ? mf.split : null;
      return sp ? { ...sp } : null;
    }
    const sp = state.active?.splitByStep?.[step.id];
    if (!sp) return null;
    try {
      const c = ensureClient();
      const { data } = await c.rpc("funnel_split_stats", { p_step: step.id });
      const pageById = Object.fromEntries(state.pages.map((p) => [p.id, p]));
      return data ? { ...data, variant_page_id: sp.variant_page_id, variant_page_title: pageById[sp.variant_page_id]?.title } : null;
    } catch (e) { return null; }
  }

  function wireStepDrawer() {
    const close = () => { state.drawer = null; scrim.classList.remove("open"); render(); };
    $("#closeStep")?.addEventListener("click", close);
    // one-time scrim close for the step drawer
    scrim.addEventListener("click", close, { once: true });
    $$("[data-sdtab]").forEach((t) => t.addEventListener("click", () => { state.drawer.tab = t.dataset.sdtab; render(); }));
    const step = (state.active?.steps || []).find((s) => s.id === state.drawer.stepId);
    if (!step) return;

    // page tab
    $("#saveStepPage")?.addEventListener("click", () => saveStep(step, { page_id: $("#stepPage").value || null, name: $("#stepName").value.trim() }));
    $("#openPage")?.addEventListener("click", () => toast("Opens the page in the M19 Sites editor (site-render).", "info"));
    // config tab
    $$("#stepTypeSeg [data-type]").forEach((b) => b.addEventListener("click", () => { step.step_type = b.dataset.type; render(); }));
    $("#addProd")?.addEventListener("click", () => {
      step.config = step.config || {}; step.config.products = (step.config.products || []); step.config.products.push({ name: "", price: 0 }); render();
    });
    $$("[data-proddel]").forEach((b) => b.addEventListener("click", () => {
      const i = +b.dataset.proddel; readProds(step); step.config.products.splice(i, 1); render();
    }));
    $("#saveStepCfg")?.addEventListener("click", () => { readProds(step); const bump = $("#bumpOn")?.checked; if (step.config) { if (bump && !step.config.bump) step.config.bump = { name: "Order bump", price: 2900 }; if (!bump) delete step.config.bump; } saveStep(step, { step_type: step.step_type, config: step.config }); });
    // split tab
    $("#createSplit")?.addEventListener("click", () => createSplit(step));
    ["promoteWin", "promoteA", "promoteB"].forEach((id) => { const b = $("#" + id); if (b) b.addEventListener("click", () => promote(step, b.dataset.variant)); });
  }
  function readProds(step) {
    step.config = step.config || {};
    step.config.products = $$("#prodRows .prod-row").map((r) => ({
      name: $("[data-pf=name]", r).value.trim(),
      price: Math.round((parseFloat($("[data-pf=price]", r).value) || 0) * 100),
    })).filter((p) => p.name);
  }

  /* ── Writes (live via Supabase; mock updates local state) ────────────────── */
  async function saveStep(step, patch) {
    Object.assign(step, patch);
    if (patch.page_id) step.page_title = state.pages.find((p) => p.id === patch.page_id)?.title || step.page_title;
    if (!connected()) { toast("Step saved.", "success"); state.drawer = null; render(); return; }
    try {
      const c = ensureClient();
      const { error } = await c.from("funnel_steps").update({
        page_id: step.page_id || null, name: step.name, step_type: step.step_type, config: step.config || {},
      }).eq("id", step.id);
      if (error) throw error;
      toast("Step saved.", "success"); state.drawer = null; await loadDetail(state.active.id); render();
    } catch (e) { toast("Save failed: " + e.message, "danger"); }
  }
  async function addStep() {
    const f = state.active; const order = (f.steps || []).length;
    if (!connected()) {
      const id = "s" + Date.now();
      f.steps.push({ id, step_type: order === 0 ? "optin" : "sales", name: "New step", page_id: null, page_title: "No page yet", step_order: order, visitors: 0, conversions: 0, rate: 0, has_split: false });
      toast("Step added — pick a page.", "success"); openStep(id); return;
    }
    try {
      const c = ensureClient();
      const { data, error } = await c.from("funnel_steps").insert({
        workspace_id: state.workspaceId, funnel_id: f.id, step_order: order,
        step_type: order === 0 ? "optin" : "sales", name: "New step",
      }).select().single();
      if (error) throw error;
      await loadDetail(f.id); openStep(data.id);
    } catch (e) { toast("Couldn't add step: " + e.message, "danger"); }
  }
  async function createSplit(step) {
    const pageId = $("#splitPage")?.value; const splitPct = +($("#splitPct")?.value || 50); const goal = $("#splitGoal")?.value || "progression";
    if (!pageId) { toast("Pick a variant B page.", "danger"); return; }
    if (!connected()) { toast("A/B test started (mockup).", "success"); step.has_split = true; state.drawer.tab = "split"; render(); return; }
    try {
      const c = ensureClient();
      const { error } = await c.from("funnel_splits").insert({
        workspace_id: state.workspaceId, step_id: step.id, variant_page_id: pageId, split: splitPct, goal,
      });
      if (error) throw error;
      toast("A/B test started.", "success"); await loadDetail(state.active.id); openStep(step.id); state.drawer.tab = "split"; render();
    } catch (e) { toast("Couldn't start test: " + e.message, "danger"); }
  }
  async function promote(step, variant) {
    if (!connected()) { toast(`Variant ${variant} promoted (mockup).`, "success"); if (step._splitStats) { step._splitStats.status = "promoted"; step._splitStats.winner = variant; } render(); return; }
    try {
      const c = ensureClient();
      const { error } = await c.rpc("promote_split_winner", { p_step: step.id, p_variant: variant });
      if (error) throw error;
      toast(`Variant ${variant} promoted — live traffic updated.`, "success");
      await loadDetail(state.active.id); step._splitStats = await splitStatsFor(step); render();
    } catch (e) { toast("Promote failed: " + e.message, "danger"); }
  }
  async function saveSettings() {
    const f = state.active;
    const patch = { ...(f.settings || {}), pipeline: $("#setPipeline").value.trim() || undefined, stage: $("#setStage").value.trim() || undefined, abandon_hours: +($("#setAbandon").value || 1) };
    f.settings = patch;
    if (!connected()) { toast("Settings saved.", "success"); return; }
    try { const c = ensureClient(); const { error } = await c.from("funnels").update({ settings: patch }).eq("id", f.id); if (error) throw error; toast("Settings saved.", "success"); }
    catch (e) { toast("Save failed: " + e.message, "danger"); }
  }
  async function deleteFunnel() {
    const f = state.active;
    confirmModal("Delete funnel?", `“${esc(f.name)}” and its steps will be removed. This cannot be undone.`, async () => {
      if (!connected()) { state.funnels = state.funnels.filter((x) => x.id !== f.id); toast("Funnel deleted.", "success"); location.hash = "#/funnels"; return; }
      try { const c = ensureClient(); const { error } = await c.from("funnels").update({ archived_at: new Date().toISOString(), status: "archived" }).eq("id", f.id); if (error) throw error; toast("Funnel deleted.", "success"); location.hash = "#/funnels"; boot(); }
      catch (e) { toast("Delete failed: " + e.message, "danger"); }
    });
  }

  /* ── Modals ──────────────────────────────────────────────────────────────── */
  function modal(html) {
    const root = $("#modalRoot");
    root.innerHTML = `<div class="modal-scrim open" id="mScrim"><div class="modal-card">${html}</div></div>`;
    const close = () => { root.innerHTML = ""; };
    $("#mScrim").addEventListener("click", (e) => { if (e.target.id === "mScrim") close(); });
    return close;
  }
  function newFunnelModal() {
    const close = modal(`<div class="mc-head"><div class="mc-ico">${svg("funnel", 18)}</div>
      <div><h3>New funnel</h3><div class="mc-sub">Name it — you'll add steps and pick pages next.</div></div>
      <button class="icon-btn mc-close" id="mClose">✕</button></div>
      <div class="form-field full"><label>Funnel name</label><input id="fnName" placeholder="e.g. Ramadan Reset Launch" autofocus></div>
      <div class="mc-foot"><button class="btn btn-ghost" id="mCancel">Cancel</button><button class="btn btn-primary" id="mCreate">${svg("plus", 15)} Create funnel</button></div>`);
    $("#mClose").addEventListener("click", close); $("#mCancel").addEventListener("click", close);
    const create = async () => {
      const name = $("#fnName").value.trim(); if (!name) { $("#fnName").focus(); return; }
      if (!connected()) { const id = "fn" + Date.now(); state.funnels.unshift({ id, name, status: "draft", currency: "USD", settings: {}, steps: [], split: null }); close(); toast("Funnel created.", "success"); location.hash = "#/funnels/" + id; return; }
      try { const c = ensureClient(); const { data, error } = await c.from("funnels").insert({ workspace_id: state.workspaceId, name, status: "draft" }).select().single(); if (error) throw error; close(); toast("Funnel created.", "success"); await loadFunnels(state.workspaceId); location.hash = "#/funnels/" + data.id; }
      catch (e) { toast("Create failed: " + e.message, "danger"); }
    };
    $("#mCreate").addEventListener("click", create);
    $("#fnName").addEventListener("keydown", (e) => { if (e.key === "Enter") create(); });
  }
  function confirmModal(title, sub, onYes) {
    const close = modal(`<div class="mc-head"><div class="mc-ico" style="background:var(--status-danger)">${svg("trash", 18)}</div>
      <div><h3>${title}</h3><div class="mc-sub">${sub}</div></div></div>
      <div class="mc-foot"><button class="btn btn-ghost" id="cCancel">Cancel</button><button class="btn btn-primary" id="cYes" style="background:var(--status-danger)">Delete</button></div>`);
    $("#cCancel").addEventListener("click", close);
    $("#cYes").addEventListener("click", () => { close(); onYes(); });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
