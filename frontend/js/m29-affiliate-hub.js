/* m29-affiliate-hub.js — AiMindShare Module M29 · Affiliate Hub.
   Vanilla hash-routed dashboard on Supabase, same conventions as every other
   module (see m20-funnels.js). Affiliate Hub is the BUSINESS layer: an offer
   vault, a manual network list, and a disclosure-template library. It does
   NOT build funnels — "Create Funnel from Offer" hands off to M20's existing
   AI Funnel Studio via a one-time localStorage prefill key, then M20 owns
   the rest (wizard, blueprint, generation). Reverse bridge (Open in
   Affiliate Hub / Earnings rollup from generated funnels / real tracking
   links with click logging) is Phase 1b — deliberately not built here, see
   the "Coming soon" sections below.

   Scope (Phase 1a, D-182): offer vault (CRUD) · manual network list ·
   disclosure template library · one-directional bridge into M20's Studio.
   No live network APIs, no link cloaking/redirects, no earnings sync — all
   explicitly deferred, not faked (same D-063 posture as every other
   unbuilt-integration stub in this repo). No project connected → a
   high-fidelity mockup with a default/empty/loading/error/success preview
   switcher (Gate-5). */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const initials = (s) => (s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const fmtInt = (n) => Number(n || 0).toLocaleString("en-US");
  const money = (minor) => "$" + (Number(minor || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  /* ── Inline icons (lucide-style, reused paths — module-local dict) ───────── */
  const P = {
    flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
    cart: "M2 3h2l2.4 12.2a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6M9 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2M20 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2",
    users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    zap: "M13 2 3 14h9l-1 8 10-12h-9l1-8z", edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z",
    link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
    file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
    chart: "M3 3v18h18M7 15l4-4 3 3 5-6", split: "M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5",
    layers: "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
    settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
    plus: "M12 5v14M5 12h14", check: "M20 6 9 17l-5-5", chev: "M9 18l6-6-6-6", back: "M19 12H5M12 19l-7-7 7-7", trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14",
  };
  const svg = (n, s = 17) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${P[n] || ""}"/></svg>`;
  const CAT_LABEL = { general: "General", health: "Health", finance: "Finance", income: "Income", sensitive: "Sensitive" };

  /* ── Theme + starfield (identical contract to every module) ──────────────── */
  const THEME_KEY = "aimindshare-theme";
  const root = document.documentElement;
  const setTheme = (t) => { root.setAttribute("data-theme", t); try { localStorage.setItem(THEME_KEY, t); } catch (e) {} const i = $("#themeIco"); if (i) i.textContent = t === "dark" ? "☀" : "☾"; };
  setTheme((() => { try { return localStorage.getItem(THEME_KEY) || "light"; } catch (e) { return "light"; } })());
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  (function stars() {
    const field = $("#starField"); if (!field || reduce) return;
    for (let i = 0; i < 42; i++) { const s = el("div", "star"); s.style.left = Math.random() * 100 + "%"; s.style.top = Math.random() * 100 + "%"; s.style.setProperty("--tw", (3 + Math.random() * 7).toFixed(1) + "s"); s.style.setProperty("--td", (Math.random() * 10).toFixed(1) + "s"); field.appendChild(s); }
  })();

  /* ── Config + Supabase client (anon key only, Law 3) ─────────────────────── */
  const CFG_KEY = "aimindshare-supabase", ACTIVE_KEY = "aimindshare-active-ws";
  const OFFER_PREFILL_KEY = "aimindshare-offer-prefill"; // the bridge into M20 Studio — written here, consumed there
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
    offers: [
      { id: "off1", name: "NutraBoost Metabolism Support", network: "ClickBank", vendor_url: "https://clickbank.net/nutraboost",
        niche: "Weight loss / wellness", commission_note: "50% recurring, ~$38 avg", compliance_category: "health",
        disclosure_text: "This page contains affiliate links. As an affiliate, we may earn a commission from qualifying purchases. Individual results vary and are not guaranteed.",
        promo_assets: [], status: "active", funnels_generated: 1, linked_funnel_name: "NutraBoost Bridge", linked_funnel_revenue: 128400 },
      { id: "off2", name: "WealthPath Trading Course", network: "Digistore24", vendor_url: "https://digistore24.com/wealthpath",
        niche: "Trading / income", commission_note: "40% one-time, ~$160 avg", compliance_category: "income",
        disclosure_text: "Affiliate disclosure: we earn a commission on sales made through this link. Trading involves risk and results are not typical.",
        promo_assets: [], status: "active", funnels_generated: 0, linked_funnel_name: null, linked_funnel_revenue: 0 },
      { id: "off3", name: "CloudHost Pro Hosting", network: "ShareASale", vendor_url: "https://shareasale.com/cloudhostpro",
        niche: "SaaS / hosting", commission_note: "$65 per signup", compliance_category: "general",
        disclosure_text: "We may earn a commission if you sign up through our link, at no extra cost to you.",
        promo_assets: [], status: "active", funnels_generated: 0, linked_funnel_name: null, linked_funnel_revenue: 0 },
    ],
    networks: [
      { id: "net1", name: "ClickBank", status: "manual", notes: "Vendor + tracking IDs stored per-offer for now — no API sync yet." },
      { id: "net2", name: "Digistore24", status: "manual", notes: "" },
      { id: "net3", name: "ShareASale", status: "manual", notes: "" },
    ],
    disclosures: [
      { id: "d1", name: "General affiliate disclosure", compliance_category: "general",
        body: "This page contains affiliate links. We may earn a commission if you make a purchase, at no additional cost to you." },
      { id: "d2", name: "Health / wellness disclosure", compliance_category: "health",
        body: "This content is for informational purposes only and is not medical advice. Individual results vary. We may earn a commission from qualifying purchases." },
      { id: "d3", name: "Income / earnings disclosure", compliance_category: "income",
        body: "Earnings and income representations are aspirational statements of earnings potential only. Results are not typical and vary based on effort, experience, and market conditions." },
    ],
  };

  /* ── App state ───────────────────────────────────────────────────────────── */
  const state = {
    loaded: false, loading: false, error: null, previewState: "default",
    user: null, workspaceId: null, workspaceName: "", role: "owner",
    offers: [], networks: [], disclosures: [],
    route: { section: "overview" }, offerMenu: null,
  };
  const PREVIEW_STATES = ["default", "empty", "loading", "error", "success"];
  const st = (name) => !connected() && state.previewState === name;
  const canWrite = () => ["owner", "admin", "manager", "staff"].includes(state.role) || !connected();
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
        await loadAll(active.id);
      } catch (e) { state.error = e.message || String(e); }
      state.loading = false; state.loaded = true;
    } else {
      state.user = MOCK.user; state.workspaceId = MOCK.workspace.id; state.workspaceName = MOCK.workspace.name; state.role = "owner";
      state.offers = MOCK.offers.map(clone); state.networks = MOCK.networks.map(clone); state.disclosures = MOCK.disclosures.map(clone);
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
  async function loadAll(wsId) {
    const c = ensureClient();
    const [{ data: offers }, { data: networks }, { data: disclosures }, { data: funnels }] = await Promise.all([
      c.from("affiliate_offers").select("*").order("created_at", { ascending: false }),
      c.from("affiliate_networks").select("*").order("created_at", { ascending: false }),
      c.from("affiliate_disclosure_templates").select("*").order("created_at", { ascending: false }),
      c.from("funnels").select("id,name,source_offer_id").not("source_offer_id", "is", null),
    ]);
    const funnelsByOffer = {};
    (funnels || []).forEach((f) => { (funnelsByOffer[f.source_offer_id] ||= []).push(f); });
    // Revenue rollup: one funnel_revenue_summary() call per offer-linked funnel — small N, RLS-scoped reads only.
    const revenueByFunnel = {};
    await Promise.all((funnels || []).map(async (f) => {
      const { data } = await c.rpc("funnel_revenue_summary", { p_funnel: f.id });
      revenueByFunnel[f.id] = data?.revenue || 0;
    }));
    state.offers = (offers || []).map((o) => {
      const linked = funnelsByOffer[o.id] || [];
      return { ...o, funnels_generated: linked.length, linked_funnel_name: linked[0]?.name || null,
        linked_funnel_revenue: linked.reduce((a, f) => a + (revenueByFunnel[f.id] || 0), 0) };
    });
    state.networks = networks || [];
    state.disclosures = disclosures || [];
  }

  /* ── Router (module-level only — Phase 1a has no per-offer deep route) ───── */
  const SECTIONS = ["overview", "offers", "networks", "campaigns", "creatives", "links", "disclosures", "earnings", "analytics", "library", "settings"];
  function parseRoute() {
    const h = (location.hash || "#/affiliate").replace(/^#\/?(affiliate)?\/?/, "");
    state.route = { section: SECTIONS.includes(h) ? h : "overview" };
  }
  window.addEventListener("hashchange", () => { parseRoute(); render(); });

  /* ── Shell (rail + topbar) — same contract as every module ───────────────── */
  const NAV = [
    { key: "overview", label: "Overview", ico: "flag" },
    { key: "offers", label: "Offers", ico: "cart" },
    { key: "networks", label: "Networks", ico: "users" },
    { key: "campaigns", label: "Campaigns", ico: "zap" },
    { key: "creatives", label: "Creatives", ico: "edit" },
    { key: "links", label: "Tracking Links", ico: "link" },
    { key: "disclosures", label: "Disclosures & Compliance", ico: "file" },
    { key: "earnings", label: "Earnings", ico: "chart" },
    { key: "analytics", label: "Analytics", ico: "split" },
    { key: "library", label: "Library", ico: "layers" },
    { key: "settings", label: "Settings", ico: "settings" },
  ];
  function shell(activeKey, content) {
    const nav = NAV.map((n) => `<div class="nav-item ${n.key === activeKey ? "active" : ""}" data-hash="#/affiliate/${n.key}"><span class="ni-ico">${svg(n.ico)}</span><span>${n.label}</span></div>`).join("");
    return `
      <aside class="rail" id="rail">
        <div class="brand"><span class="mark">✦</span><span><b>AiMind</b><em>Share</em></span></div>
        <div class="nav-group"><div class="nav-group-label">Affiliate Hub</div>${nav}</div>
        <div class="rail-foot">M29 · Affiliate Hub</div>
      </aside>
      <header class="tbar">
        <button class="icon-btn rail-burger" id="railBurger" aria-label="Menu">☰</button>
        <div class="ws-trigger" style="cursor:default">
          <span class="ws-badge">${esc(initials(state.workspaceName || "AiMindShare"))}</span>
          <span class="ws-meta"><span class="ws-name">${esc(state.workspaceName || "Workspace")}</span><span class="ws-kind">Affiliate Hub</span></span>
        </div>
        <div class="spacer"></div>
        <span class="pill plain" id="connPill" hidden></span>
        <button class="btn btn-ghost btn-sm" id="openConnect2">Connect</button>
        <button class="icon-btn" id="themeToggle" title="Toggle theme" aria-label="Toggle theme"><span id="themeIco">☾</span></button>
        <span class="avatar" title="${esc(state.user?.email || "")}">${esc(initials(state.user?.name || state.user?.email))}</span>
      </header>
      <main class="content"><div class="content-inner">${content}</div></main>`;
  }
  function previewStrip() {
    return "";
  }
  function moduleHead(title, sub, extra) {
    return `<div class="fn-head">
      <div><div class="eyebrow">${svg("cart", 13)} Affiliate Hub · M29</div>
        <div class="ph-title">${title}</div>
        ${sub ? `<div class="ph-sub">${sub}</div>` : ""}</div>
      <div class="spacer"></div>${extra || ""}
    </div>`;
  }
  function catBadge(cat) { return `<span class="cat-badge cat-${cat}">${CAT_LABEL[cat] || cat}</span>`; }

  /* ══════════════════════════════════════════════════════════════════════════
     Overview
     ══════════════════════════════════════════════════════════════════════════ */
  function viewOverview() {
    if (st("loading")) return shell("overview", loadingBlock());
    if (st("error")) return shell("overview", errorBlock());
    const offers = st("empty") ? [] : state.offers;
    const generated = offers.filter((o) => o.funnels_generated > 0);
    const revenue = generated.reduce((a, o) => a + (o.linked_funnel_revenue || 0), 0);
    const missingDisclosure = offers.filter((o) => !o.disclosure_text);
    const head = moduleHead("Affiliate Hub <em>overview</em>", "Your offer vault, networks, and disclosure library — the business layer behind AI Funnel Studio's affiliate funnels.");
    const kpis = `<div class="ah-kpis">
      <div class="panel ah-kpi"><div class="kv">${fmtInt(offers.length)}</div><div class="kl">Offers</div></div>
      <div class="panel ah-kpi"><div class="kv">${fmtInt(state.networks.length)}</div><div class="kl">Networks</div></div>
      <div class="panel ah-kpi"><div class="kv">${fmtInt(state.disclosures.length)}</div><div class="kl">Disclosure templates</div></div>
      <div class="panel ah-kpi"><div class="kv">${fmtInt(generated.length)}</div><div class="kl">Funnels generated</div></div>
      <div class="panel ah-kpi"><div class="kv">${money(revenue)}</div><div class="kl">Revenue from offer-linked funnels</div></div>
    </div>`;
    const attn = missingDisclosure.length
      ? `<div class="panel"><div class="panel-head"><div class="ph-ico">${svg("flag", 15)}</div><h3>Attention needed</h3></div>
        <div class="access-list">${missingDisclosure.map((o) => `<div class="access-row"><span class="log-status failed">${svg("file", 13)}</span>
          <div style="flex:1;font-size:12.5px;color:var(--ink-700)">"${esc(o.name)}" has no disclosure text set.</div></div>`).join("")}</div></div>`
      : "";
    const list = `<div class="panel"><div class="panel-head"><div class="ph-ico">${svg("cart", 15)}</div><h3>Recent offers</h3></div>
      <div class="access-list">${offers.slice(0, 5).map((o) => `<div class="access-row" data-gohash="#/affiliate/offers" style="cursor:pointer">
        <div class="fc-ico" style="width:28px;height:28px;font-size:12px">${svg("cart", 13)}</div>
        <div style="flex:1;min-width:0"><div style="font-size:12.5px;color:var(--ink-900)">${esc(o.name)}</div>
          <div style="font-size:11px;color:var(--ink-400)">${esc(o.network || "—")} · ${o.funnels_generated} funnel${o.funnels_generated === 1 ? "" : "s"} generated</div></div>
        ${catBadge(o.compliance_category)}
      </div>`).join("") || `<p class="muted" style="font-size:12.5px">No offers yet — add one in Offers.</p>`}</div></div>`;
    return shell("overview", previewStrip() + head + kpis + attn + list);
  }
  function loadingBlock() { return `<div class="panel"><p class="muted">Loading…</p></div>`; }
  function errorBlock() { return `<div class="panel"><p class="muted">Something went wrong. <button class="link" id="retry">Retry</button></p></div>`; }

  /* ══════════════════════════════════════════════════════════════════════════
     Offers
     ══════════════════════════════════════════════════════════════════════════ */
  function offerCard(o) {
    const menuOpen = state.offerMenu === o.id;
    return `<div class="panel fn-card">
      <div class="fc-top">
        <div class="fc-ico">${svg("cart", 19)}</div>
        <div style="min-width:0;flex:1">
          <div class="fc-name">${esc(o.name)}</div>
          <div class="fc-meta">${esc(o.network || "—")} · ${esc(o.niche || "—")}${o.commission_note ? " · " + esc(o.commission_note) : ""}</div>
        </div>
        ${catBadge(o.compliance_category)}
        ${canWrite() ? `<div style="position:relative">
          <button class="icon-btn fc-menu-btn" data-offermenu="${o.id}" title="More" aria-label="More">⋯</button>
          ${menuOpen ? `<div class="fc-menu">
            <button data-editoffer="${o.id}">${svg("edit", 13)} Edit</button>
            <button data-createfunnel="${o.id}">${svg("zap", 13)} Create Funnel from Offer</button>
            <button data-deloffer="${o.id}">${svg("trash", 13)} Delete</button>
          </div>` : ""}
        </div>` : ""}
      </div>
      ${o.disclosure_text ? `<p class="muted" style="font-size:12px;margin:10px 0 0">${svg("file", 12)} ${esc(o.disclosure_text.slice(0, 140))}${o.disclosure_text.length > 140 ? "…" : ""}</p>`
        : `<p class="muted" style="font-size:12px;margin:10px 0 0;color:var(--status-danger)">${svg("flag", 12)} No disclosure text set.</p>`}
      ${o.funnels_generated > 0 ? `<div class="fc-stats" style="margin-top:12px">
        <div class="fc-stat"><div class="fs-val">${o.funnels_generated}</div><div class="fs-label">Funnel${o.funnels_generated === 1 ? "" : "s"}</div></div>
        <div class="fc-stat"><div class="fs-val fc-rev">${money(o.linked_funnel_revenue)}</div><div class="fs-label">Revenue</div></div>
      </div>` : ""}
    </div>`;
  }
  function viewOffers() {
    if (st("loading")) return shell("offers", loadingBlock());
    if (st("error")) return shell("offers", errorBlock());
    const head = moduleHead("Offer <em>vault</em>", "Every affiliate offer you're promoting — networks, commission notes, disclosures, and the funnels generated from each.",
      canWrite() ? `<button class="btn btn-primary" id="newOffer">${svg("plus", 15)} New offer</button>` : "");
    const list = st("empty") ? [] : state.offers;
    const body = list.length
      ? `<div class="fn-grid">${list.map(offerCard).join("")}</div>`
      : `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("cart", 24)}</div><h3>No offers yet</h3>
          <p>Add the affiliate offers you're promoting — ClickBank, Digistore24, Amazon, or a custom network.</p>
          ${canWrite() ? `<button class="btn btn-primary es-cta" id="newOffer2">${svg("plus", 14)} New offer</button>` : ""}</div></div>`;
    return shell("offers", previewStrip() + head + body);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Networks
     ══════════════════════════════════════════════════════════════════════════ */
  function viewNetworks() {
    if (st("loading")) return shell("networks", loadingBlock());
    const head = moduleHead("Networks", "The affiliate networks you work with. This is a manual reference list today — live API/CSV earnings sync is a future phase, not built yet.",
      canWrite() ? `<button class="btn btn-primary" id="newNetwork">${svg("plus", 15)} Add network</button>` : "");
    const list = st("empty") ? [] : state.networks;
    const rows = list.map((n) => `<div class="access-row">
        <div class="fc-ico" style="width:28px;height:28px;font-size:12px">${svg("users", 13)}</div>
        <div style="flex:1;min-width:0"><div style="font-size:12.5px;color:var(--ink-900)">${esc(n.name)}</div>
          ${n.notes ? `<div style="font-size:11px;color:var(--ink-400)">${esc(n.notes)}</div>` : ""}</div>
        <span class="st st-${n.status === "connected" ? "active" : "draft"}">${n.status === "connected" ? "Connected" : "Manual"}</span>
        ${canWrite() ? `<button class="icon-btn" data-delnetwork="${n.id}" title="Remove">${svg("trash", 14)}</button>` : ""}
      </div>`).join("") || `<p class="muted" style="font-size:12.5px">No networks added yet.</p>`;
    return shell("networks", previewStrip() + head + `<div class="panel"><div class="access-list">${rows}</div></div>`);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Disclosures & Compliance
     ══════════════════════════════════════════════════════════════════════════ */
  function viewDisclosures() {
    if (st("loading")) return shell("disclosures", loadingBlock());
    const head = moduleHead("Disclosures &amp; <em>compliance</em>", "Reusable disclosure language, tagged by category — pull these into an offer, or reference them from a funnel's Compliance check.",
      canWrite() ? `<button class="btn btn-primary" id="newDisclosure">${svg("plus", 15)} New template</button>` : "");
    const list = st("empty") ? [] : state.disclosures;
    const body = list.length ? `<div class="fn-grid">${list.map((d) => `<div class="panel fn-card">
        <div class="fc-top"><div class="fc-ico">${svg("file", 19)}</div>
          <div style="min-width:0;flex:1"><div class="fc-name">${esc(d.name)}</div></div>
          ${catBadge(d.compliance_category)}
          ${canWrite() ? `<button class="icon-btn" data-deldisclosure="${d.id}" title="Delete">${svg("trash", 14)}</button>` : ""}
        </div>
        <p class="muted" style="font-size:12.5px;margin-top:10px">${esc(d.body)}</p>
      </div>`).join("")}</div>`
      : `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("file", 24)}</div><h3>No templates yet</h3>
          <p>Save standard disclosure language once, reuse it across every offer.</p></div></div>`;
    return shell("disclosures", previewStrip() + head + body);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Coming-soon sections (named honestly, not faked — Phase 1b/2 per the plan)
     ══════════════════════════════════════════════════════════════════════════ */
  const COMING_SOON = {
    campaigns: { title: "Campaigns", sub: "Campaign records across traffic sources — planned for Phase 2." },
    creatives: { title: "Creatives", sub: "Ad angles, hooks, and creative assets, with a “Send Hook to Funnel” bridge — planned for Phase 2." },
    links: { title: "Tracking Links", sub: "Pretty-link cloaking, click logging, and rotation — planned for Phase 1b." },
    earnings: { title: "Earnings", sub: "Network commission sync (API/CSV) — planned for Phase 1b. Bridged revenue from your own generated funnels is already on the Overview." },
    analytics: { title: "Analytics", sub: "Cross-offer and cross-network reporting — planned for Phase 2." },
    library: { title: "Library", sub: "Reusable hooks, CTA blocks, and niche packs — planned for Phase 2." },
  };
  function viewComingSoon(key) {
    const cfg = COMING_SOON[key];
    const head = moduleHead(cfg.title, cfg.sub);
    return shell(key, head + `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("layers", 24)}</div>
      <h3>Not built yet</h3><p>${esc(cfg.sub)} This section is visible now so the module's structure is stable, but it deliberately shows no placeholder data.</p></div></div>`);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Settings
     ══════════════════════════════════════════════════════════════════════════ */
  const DEFAULTS_KEY = "aimindshare-m29-defaults";
  function moduleDefaults() {
    try { return { defaultCategory: "general", defaultDisclosureId: "", ...JSON.parse(localStorage.getItem(DEFAULTS_KEY) || "{}") }; }
    catch (e) { return { defaultCategory: "general", defaultDisclosureId: "" }; }
  }
  function saveModuleDefaults(patch) { try { localStorage.setItem(DEFAULTS_KEY, JSON.stringify({ ...moduleDefaults(), ...patch })); } catch (e) {} }
  function viewSettings() {
    const d = moduleDefaults();
    const head = moduleHead("Settings", "Workspace defaults for new offers. Device-local preference — not shared with teammates yet.");
    const body = `<div class="panel" style="max-width:520px">
      <div class="form-field"><label>Default compliance category for new offers</label>
        <select id="defCat">${Object.entries(CAT_LABEL).map(([v, l]) => `<option value="${v}" ${d.defaultCategory === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="form-field"><label>Default disclosure template</label>
        <select id="defDisc"><option value="">None</option>${state.disclosures.map((t) => `<option value="${t.id}" ${d.defaultDisclosureId === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></div>
      <div class="mc-foot" style="border-top:none;padding-top:14px"><button class="btn btn-primary" id="saveDefaults">${svg("check", 15)} Save</button></div>
    </div>`;
    return shell("settings", head + body);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Modals — offer / network / disclosure CRUD
     ══════════════════════════════════════════════════════════════════════════ */
  function modal(html) {
    const rootEl = $("#modalRoot");
    rootEl.innerHTML = `<div class="modal-scrim open" id="mScrim"><div class="modal-card">${html}</div></div>`;
    const close = () => { rootEl.innerHTML = ""; };
    $("#mScrim").addEventListener("click", (e) => { if (e.target.id === "mScrim") close(); });
    return close;
  }
  function confirmModal(title, body, onConfirm) {
    const close = modal(`<div class="mc-head"><div class="mc-ico">${svg("trash", 18)}</div><div><h3>${esc(title)}</h3></div>
      <button class="icon-btn mc-close" id="mClose">✕</button></div>
      <p class="muted" style="font-size:13px">${esc(body)}</p>
      <div class="mc-foot"><button class="btn btn-ghost" id="mCancel">Cancel</button><button class="btn btn-danger" id="mOk">Confirm</button></div>`);
    $("#mClose").addEventListener("click", close); $("#mCancel").addEventListener("click", close);
    $("#mOk").addEventListener("click", () => { close(); onConfirm(); });
  }
  function offerModal(existing) {
    const o = existing || { name: "", network: "", vendor_url: "", niche: "", commission_note: "", compliance_category: moduleDefaults().defaultCategory, disclosure_text: "" };
    const close = modal(`<div class="mc-head"><div class="mc-ico">${svg("cart", 18)}</div>
      <div><h3>${existing ? "Edit offer" : "New offer"}</h3></div><button class="icon-btn mc-close" id="mClose">✕</button></div>
      <div class="form-field full"><label>Offer name</label><input id="ofName" placeholder="e.g. NutraBoost Metabolism Support" value="${esc(o.name)}" autofocus></div>
      <div class="form-field"><label>Network</label><input id="ofNetwork" placeholder="e.g. ClickBank" value="${esc(o.network || "")}"></div>
      <div class="form-field"><label>Compliance category</label><select id="ofCat">${Object.entries(CAT_LABEL).map(([v, l]) => `<option value="${v}" ${o.compliance_category === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="form-field full"><label>Vendor / product URL</label><input id="ofUrl" placeholder="https://…" value="${esc(o.vendor_url || "")}"></div>
      <div class="form-field"><label>Niche</label><input id="ofNiche" placeholder="e.g. Weight loss / wellness" value="${esc(o.niche || "")}"></div>
      <div class="form-field"><label>Commission note</label><input id="ofCommission" placeholder="e.g. 50% recurring, ~$38 avg" value="${esc(o.commission_note || "")}"></div>
      <div class="form-field full"><label>Disclosure text</label>
        ${state.disclosures.length ? `<select id="ofUseTemplate" style="margin-bottom:6px"><option value="">— insert from a template —</option>${state.disclosures.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select>` : ""}
        <textarea id="ofDisclosure" rows="3" placeholder="This page contains affiliate links…">${esc(o.disclosure_text || "")}</textarea></div>
      <div class="mc-foot"><button class="btn btn-ghost" id="mCancel">Cancel</button><button class="btn btn-primary" id="mSave">${svg("check", 15)} ${existing ? "Save" : "Create offer"}</button></div>`);
    $("#mClose").addEventListener("click", close); $("#mCancel").addEventListener("click", close);
    $("#ofUseTemplate")?.addEventListener("change", (e) => { const t = state.disclosures.find((d) => d.id === e.target.value); if (t) $("#ofDisclosure").value = t.body; });
    $("#mSave").addEventListener("click", async () => {
      const name = $("#ofName").value.trim(); if (!name) { $("#ofName").focus(); return; }
      const patch = { name, network: $("#ofNetwork").value.trim(), vendor_url: $("#ofUrl").value.trim(), niche: $("#ofNiche").value.trim(),
        commission_note: $("#ofCommission").value.trim(), compliance_category: $("#ofCat").value, disclosure_text: $("#ofDisclosure").value.trim() };
      close();
      if (!connected()) {
        if (existing) Object.assign(state.offers.find((x) => x.id === existing.id), patch);
        else state.offers.unshift({ id: "off" + Date.now(), status: "active", promo_assets: [], funnels_generated: 0, linked_funnel_name: null, linked_funnel_revenue: 0, ...patch });
        toast(existing ? "Offer updated." : "Offer created.", "success"); render(); return;
      }
      try {
        const c = ensureClient();
        if (existing) { const { error } = await c.from("affiliate_offers").update(patch).eq("id", existing.id); if (error) throw error; }
        else { const { error } = await c.from("affiliate_offers").insert({ ...patch, workspace_id: state.workspaceId }); if (error) throw error; }
        toast(existing ? "Offer updated." : "Offer created.", "success"); await loadAll(state.workspaceId); render();
      } catch (e) { toast("Save failed: " + e.message, "danger"); }
    });
  }
  function networkModal() {
    const close = modal(`<div class="mc-head"><div class="mc-ico">${svg("users", 18)}</div><div><h3>Add network</h3></div><button class="icon-btn mc-close" id="mClose">✕</button></div>
      <div class="form-field full"><label>Network name</label><input id="nwName" placeholder="e.g. Impact" autofocus></div>
      <div class="form-field full"><label>Notes (optional)</label><textarea id="nwNotes" rows="2"></textarea></div>
      <div class="mc-foot"><button class="btn btn-ghost" id="mCancel">Cancel</button><button class="btn btn-primary" id="mSave">${svg("check", 15)} Add</button></div>`);
    $("#mClose").addEventListener("click", close); $("#mCancel").addEventListener("click", close);
    $("#mSave").addEventListener("click", async () => {
      const name = $("#nwName").value.trim(); if (!name) { $("#nwName").focus(); return; }
      const notes = $("#nwNotes").value.trim(); close();
      if (!connected()) { state.networks.unshift({ id: "net" + Date.now(), name, status: "manual", notes }); toast("Network added.", "success"); render(); return; }
      try { const c = ensureClient(); const { error } = await c.from("affiliate_networks").insert({ workspace_id: state.workspaceId, name, notes }); if (error) throw error; toast("Network added.", "success"); await loadAll(state.workspaceId); render(); }
      catch (e) { toast("Save failed: " + e.message, "danger"); }
    });
  }
  function disclosureModal() {
    const close = modal(`<div class="mc-head"><div class="mc-ico">${svg("file", 18)}</div><div><h3>New disclosure template</h3></div><button class="icon-btn mc-close" id="mClose">✕</button></div>
      <div class="form-field full"><label>Name</label><input id="dcName" placeholder="e.g. Health / wellness disclosure" autofocus></div>
      <div class="form-field"><label>Compliance category</label><select id="dcCat">${Object.entries(CAT_LABEL).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></div>
      <div class="form-field full"><label>Disclosure body</label><textarea id="dcBody" rows="3" placeholder="This page contains affiliate links…"></textarea></div>
      <div class="mc-foot"><button class="btn btn-ghost" id="mCancel">Cancel</button><button class="btn btn-primary" id="mSave">${svg("check", 15)} Create</button></div>`);
    $("#mClose").addEventListener("click", close); $("#mCancel").addEventListener("click", close);
    $("#mSave").addEventListener("click", async () => {
      const name = $("#dcName").value.trim(); const body = $("#dcBody").value.trim();
      if (!name || !body) { (name ? $("#dcBody") : $("#dcName")).focus(); return; }
      const compliance_category = $("#dcCat").value; close();
      if (!connected()) { state.disclosures.unshift({ id: "d" + Date.now(), name, compliance_category, body }); toast("Template created.", "success"); render(); return; }
      try { const c = ensureClient(); const { error } = await c.from("affiliate_disclosure_templates").insert({ workspace_id: state.workspaceId, name, compliance_category, body }); if (error) throw error; toast("Template created.", "success"); await loadAll(state.workspaceId); render(); }
      catch (e) { toast("Save failed: " + e.message, "danger"); }
    });
  }

  /* ── The bridge: Create Funnel from Offer ─────────────────────────────────── */
  function createFunnelFromOffer(offer) {
    const prefill = {
      niche: offer.niche || "", offer_source: "affiliate", affiliate_vendor: offer.network || "",
      affiliate_url: offer.vendor_url || "", commission_note: offer.commission_note || "",
      disclosure_required: true, offer_id: offer.id, offer_name: offer.name,
    };
    try { localStorage.setItem(OFFER_PREFILL_KEY, JSON.stringify(prefill)); } catch (e) {}
    location.href = "m20-funnels.html#/funnels/studio";
  }

  /* ── Render + wiring ───────────────────────────────────────────────────────── */
  const SECTION_BODY = { overview: viewOverview, offers: viewOffers, networks: viewNetworks, disclosures: viewDisclosures, settings: viewSettings };
  function render() {
    const body = SECTION_BODY[state.route.section] ? SECTION_BODY[state.route.section]() : viewComingSoon(state.route.section);
    $("#app").innerHTML = body;
    wire();
  }
  function renderConn() {
    const pill = $("#connPill"); if (!pill) return;
    const on = connected(); pill.hidden = !on; pill.textContent = on ? "live" : ""; pill.classList.toggle("live", on);
  }
  function wire() {
    $$("[data-hash]").forEach((n) => n.addEventListener("click", () => { location.hash = n.dataset.hash; }));
    $$("[data-gohash]").forEach((n) => n.addEventListener("click", () => { location.hash = n.dataset.gohash; }));
    const tt = $("#themeToggle"); if (tt) tt.addEventListener("click", () => setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"));
    const oc = $("#openConnect2"); if (oc) oc.addEventListener("click", openDrawer);
    $$("[data-preview]").forEach((b) => b.addEventListener("click", () => { state.previewState = b.dataset.preview; render(); }));
    const retry = $("#retry"); if (retry) retry.addEventListener("click", () => { state.previewState = "default"; boot(); });
    const burger = $("#railBurger"); if (burger) burger.addEventListener("click", () => $("#rail")?.classList.toggle("open"));
    renderConn();

    ["newOffer", "newOffer2"].forEach((id) => { const b = $("#" + id); if (b) b.addEventListener("click", () => offerModal(null)); });
    $$("[data-offermenu]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); state.offerMenu = state.offerMenu === b.dataset.offermenu ? null : b.dataset.offermenu; render(); }));
    $$("[data-editoffer]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); state.offerMenu = null; offerModal(state.offers.find((o) => o.id === b.dataset.editoffer)); }));
    $$("[data-createfunnel]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); state.offerMenu = null; createFunnelFromOffer(state.offers.find((o) => o.id === b.dataset.createfunnel)); }));
    $$("[data-deloffer]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation(); state.offerMenu = null; const o = state.offers.find((x) => x.id === b.dataset.deloffer);
      confirmModal("Delete offer?", `"${o.name}" will be removed. Funnels already generated from it are not affected.`, async () => {
        if (!connected()) { state.offers = state.offers.filter((x) => x.id !== o.id); toast("Offer deleted.", "success"); render(); return; }
        try { const c = ensureClient(); const { error } = await c.from("affiliate_offers").delete().eq("id", o.id); if (error) throw error; toast("Offer deleted.", "success"); await loadAll(state.workspaceId); render(); }
        catch (e2) { toast("Delete failed: " + e2.message, "danger"); }
      });
    }));
    $("#newNetwork")?.addEventListener("click", networkModal);
    $$("[data-delnetwork]").forEach((b) => b.addEventListener("click", () => {
      const n = state.networks.find((x) => x.id === b.dataset.delnetwork);
      confirmModal("Remove network?", `"${n.name}" will be removed from your list.`, async () => {
        if (!connected()) { state.networks = state.networks.filter((x) => x.id !== n.id); render(); return; }
        try { const c = ensureClient(); await c.from("affiliate_networks").delete().eq("id", n.id); await loadAll(state.workspaceId); render(); } catch (e) { toast("Failed: " + e.message, "danger"); }
      });
    }));
    $("#newDisclosure")?.addEventListener("click", disclosureModal);
    $$("[data-deldisclosure]").forEach((b) => b.addEventListener("click", () => {
      const d = state.disclosures.find((x) => x.id === b.dataset.deldisclosure);
      confirmModal("Delete template?", `"${d.name}" will be removed.`, async () => {
        if (!connected()) { state.disclosures = state.disclosures.filter((x) => x.id !== d.id); render(); return; }
        try { const c = ensureClient(); await c.from("affiliate_disclosure_templates").delete().eq("id", d.id); await loadAll(state.workspaceId); render(); } catch (e) { toast("Failed: " + e.message, "danger"); }
      });
    }));
    $("#saveDefaults")?.addEventListener("click", () => { saveModuleDefaults({ defaultCategory: $("#defCat").value, defaultDisclosureId: $("#defDisc").value }); toast("Defaults saved.", "success"); });
  }

  boot();
})();
