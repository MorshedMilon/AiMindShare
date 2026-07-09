/* m01-workspaces.js — AiMindShare Module M01 · Workspaces & Multi-Tenancy.
   Vanilla hash-routed dashboard app on Supabase. The wall is Postgres RLS: every
   read/write is workspace-scoped by policy, so a tampered active-workspace id just
   yields empty results — the DB, not a signed cookie, is the boundary (DECISIONS
   D-021). Privileged provisioning (create workspace + owner membership, transfer,
   archive, accept-invite) goes through the SECURITY DEFINER RPCs in migration 0007.
   When no project is connected the whole app renders as a high-fidelity mockup with
   a default/empty/loading/error/success preview switcher (honest Gate-5, like M00).
   Anon key only in the browser (Law 3). */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const initials = (s) => (s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  // Trigger a CSS enter-transition on the next tick. setTimeout (not rAF) so it
  // still fires when the tab is backgrounded/hidden (rAF is throttled there).
  const nextTick = (fn) => setTimeout(fn, 12);
  const fmtDate = (d) => { try { return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch (e) { return "—"; } };

  /* ── Lucide-style inline icons (DESIGN §9) ──────────────────────────────── */
  const P = {
    grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
    building: "M3 21h18M6 21V7l6-4 6 4v14M10 9h.01M14 9h.01M10 13h.01M14 13h.01M10 17h.01M14 17h.01",
    users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
    plus: "M12 5v14M5 12h14", search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
    check: "M20 6 9 17l-5-5", chev: "M6 9l6 6 6-6", mail: "M4 4h16v16H4zM22 6l-10 7L2 6",
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", arrow: "M5 12h14M12 5l7 7-7 7",
    layers: "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
    swap: "M16 3l4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16", trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  };
  const svg = (name, size = 17) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${P[name] || ""}"/></svg>`;

  /* ── Theme + starfield ──────────────────────────────────────────────────── */
  const THEME_KEY = "aimindshare-theme";
  const root = document.documentElement;
  const setTheme = (t) => { root.setAttribute("data-theme", t); try { localStorage.setItem(THEME_KEY, t); } catch (e) {} const i = $("#themeIco"); if (i) i.textContent = t === "dark" ? "☀" : "☾"; };
  setTheme((() => { try { return localStorage.getItem(THEME_KEY) || "light"; } catch (e) { return "light"; } })());
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  (function stars() {
    const field = $("#starField"); if (!field || reduce) return;
    for (let i = 0; i < 42; i++) { const s = el("div", "star"); s.style.left = Math.random() * 100 + "%"; s.style.top = Math.random() * 100 + "%"; s.style.setProperty("--tw", (3 + Math.random() * 7).toFixed(1) + "s"); s.style.setProperty("--td", (Math.random() * 10).toFixed(1) + "s"); field.appendChild(s); }
  })();

  /* ── Config + Supabase client (anon key only) ───────────────────────────── */
  const CFG_KEY = "aimindshare-supabase";
  const ACTIVE_KEY = "aimindshare-active-ws";
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

  /* ── Connect drawer ─────────────────────────────────────────────────────── */
  const drawer = $("#drawer"), scrim = $("#scrim");
  const openDrawer = () => { const c = getCfg(); if (c) { $("#inpUrl").value = c.url; $("#inpAnon").value = c.anon || ""; } drawer.classList.add("open"); scrim.classList.add("open"); };
  const closeDrawer = () => { drawer.classList.remove("open"); scrim.classList.remove("open"); };
  // (The topbar "Connect" button is #openConnect2, rendered into the shell and
  //  wired in afterShell(); only the static drawer controls are wired here.)
  $("#closeDrawer").addEventListener("click", closeDrawer);
  scrim.addEventListener("click", closeDrawer);
  $("#saveCfg").addEventListener("click", async () => {
    const url = $("#inpUrl").value.trim(), anon = $("#inpAnon").value.trim();
    if (!url) { $("#inpUrl").focus(); return; }
    try { localStorage.setItem(CFG_KEY, JSON.stringify({ url, anon })); } catch (e) {}
    client = null; closeDrawer(); state.loaded = false; await boot();
  });
  $("#clearCfg").addEventListener("click", async () => { try { localStorage.removeItem(CFG_KEY); } catch (e) {} $("#inpUrl").value = ""; $("#inpAnon").value = ""; client = null; state.loaded = false; await boot(); });

  /* ── Toast ──────────────────────────────────────────────────────────────── */
  const toastWrap = $("#toasts");
  function toast(msg, kind = "info") {
    const ico = kind === "success" ? "✓" : kind === "danger" ? "⚠" : "◈";
    const t = el("div", "toast " + kind, `<span class="t-ico">${ico}</span><div>${esc(msg)}</div>`);
    toastWrap.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateX(20px)"; setTimeout(() => t.remove(), 300); }, 3200);
  }

  /* ── Mockup data (mockup mode only — never a live code path) ─────────────── */
  const MOCK = {
    user: { id: "you", email: "aisha@northstar.agency", name: "Aisha Rahman" },
    jobs: 2,
    workspaces: [
      { id: "ws-agency", name: "Northstar Agency", slug: "northstar-agency", kind: "agency", parent_id: null, niche: "Marketing", timezone: "America/Toronto", currency: "USD", locale: "en", status: "active", role: "owner", members: 6, created_at: "2026-01-12" },
      { id: "ws-bluewave", name: "Bluewave Dental", slug: "bluewave-dental", kind: "sub", parent_id: "ws-agency", niche: "Dental", timezone: "America/New_York", currency: "USD", locale: "en", status: "active", role: "owner", members: 3, created_at: "2026-02-03" },
      { id: "ws-verde", name: "Verde Landscaping", slug: "verde-landscaping", kind: "sub", parent_id: "ws-agency", niche: "Home services", timezone: "America/Toronto", currency: "CAD", locale: "en", status: "active", role: "admin", members: 4, created_at: "2026-03-19" },
      { id: "ws-lumen", name: "Lumen Law Group", slug: "lumen-law-group", kind: "sub", parent_id: "ws-agency", niche: "Legal", timezone: "America/Chicago", currency: "USD", locale: "en", status: "archived", role: "owner", members: 2, created_at: "2025-11-02" },
    ],
    members: {
      "ws-agency": [
        { user_id: "you", name: "Aisha Rahman", email: "aisha@northstar.agency", role: "owner", status: "active", joined_at: "2026-01-12", you: true },
        { user_id: "u2", name: "Daniel Cole", email: "daniel@northstar.agency", role: "admin", status: "active", joined_at: "2026-01-14" },
        { user_id: "u3", name: "Priya Nair", email: "priya@northstar.agency", role: "manager", status: "active", joined_at: "2026-02-01" },
        { user_id: "u4", name: "Marco Ruiz", email: "marco@northstar.agency", role: "staff", status: "active", joined_at: "2026-02-20" },
      ],
    },
    invitations: {
      "ws-agency": [
        { id: "inv1", email: "sofia@northstar.agency", role: "manager", status: "pending", expires_at: "2026-07-10", created_at: "2026-07-03" },
        { id: "inv2", email: "james@contractor.io", role: "staff", status: "pending", expires_at: "2026-07-09", created_at: "2026-07-02" },
      ],
    },
  };

  /* ── App state ──────────────────────────────────────────────────────────── */
  const state = { loaded: false, loading: false, error: null, workspaces: [], user: null, jobs: 0, previewState: "default" };
  const PREVIEW_STATES = ["default", "empty", "loading", "error", "success"];
  const st = (name) => !connected() && state.previewState === name;    // mockup preview toggle
  const roleRank = { client: 0, staff: 1, manager: 2, admin: 3, owner: 4 };
  const canManage = (ws) => ws && roleRank[ws.role] >= roleRank.admin;

  function activeWs() {
    const list = state.workspaces;
    if (!list.length) return null;
    let id; try { id = localStorage.getItem(ACTIVE_KEY); } catch (e) {}
    return list.find((w) => w.id === id && w.status === "active") || list.find((w) => w.status === "active") || list[0];
  }
  function setActive(id) { try { localStorage.setItem(ACTIVE_KEY, id); } catch (e) {} }

  /* ── Data loading ───────────────────────────────────────────────────────── */
  async function boot() {
    if (connected()) {
      state.loading = true; state.error = null; render();
      try {
        const c = ensureClient();
        const { data: { user } } = await c.auth.getUser();
        state.user = user;
        if (!user) { state.workspaces = []; state.loaded = true; state.loading = false; renderConn(); render(); return; }
        const { data: wsRows, error } = await c.from("workspaces").select("*").order("created_at", { ascending: true });
        if (error) throw error;
        const { data: mem } = await c.from("memberships").select("workspace_id, user_id, role").eq("status", "active");
        const counts = {}; const myRole = {};
        (mem || []).forEach((m) => { counts[m.workspace_id] = (counts[m.workspace_id] || 0) + 1; if (m.user_id === user.id) myRole[m.workspace_id] = m.role; });
        state.workspaces = (wsRows || []).map((w) => ({
          id: w.id, name: w.name, slug: w.slug, kind: w.parent_workspace_id ? "sub" : "agency",
          parent_id: w.parent_workspace_id, niche: w.niche, timezone: w.timezone, currency: w.currency,
          locale: w.locale, status: w.status, settings: w.settings, role: myRole[w.id] || "staff",
          members: counts[w.id] || 1, created_at: w.created_at,
        }));
      } catch (e) { state.error = e.message || String(e); state.workspaces = []; }
      state.loading = false; state.loaded = true;
    } else {
      state.user = MOCK.user; state.workspaces = MOCK.workspaces.map((w) => ({ ...w })); state.jobs = MOCK.jobs; state.loaded = true; state.loading = false;
    }
    renderConn(); render();
  }

  async function fetchMembers(wsId) {
    if (!connected()) return (MOCK.members[wsId] || (wsId === activeWs()?.id ? MOCK.members["ws-agency"] : [])).map((m) => ({ ...m }));
    const c = ensureClient();
    const { data: mem, error } = await c.from("memberships").select("*").eq("workspace_id", wsId).order("created_at");
    if (error) throw error;
    const ids = (mem || []).map((m) => m.user_id);
    let profs = [];
    if (ids.length) { const { data } = await c.from("profiles").select("id,name,email").in("id", ids); profs = data || []; }
    const pm = {}; profs.forEach((p) => (pm[p.id] = p));
    return (mem || []).map((m) => ({ user_id: m.user_id, role: m.role, status: m.status, joined_at: m.created_at, you: m.user_id === state.user?.id, name: pm[m.user_id]?.name || "Member", email: pm[m.user_id]?.email || "—" }));
  }
  async function fetchInvites(wsId) {
    if (!connected()) return (MOCK.invitations[wsId] || (wsId === activeWs()?.id ? MOCK.invitations["ws-agency"] : [])).map((i) => ({ ...i }));
    const c = ensureClient();
    const { data, error } = await c.from("workspace_invitations").select("*").eq("workspace_id", wsId).eq("status", "pending").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  /* ── Connection pill ────────────────────────────────────────────────────── */
  function renderConn() {
    const pill = $("#connPill");
    if (!pill) return;                 // shell not mounted yet — afterShell() re-calls this
    if (connected()) { pill.className = "pill success"; pill.textContent = "connected"; }
    else { pill.className = "pill plain"; pill.textContent = "mockup mode"; }
  }

  /* ── Role pill helper ───────────────────────────────────────────────────── */
  const rolePill = (role) => { const k = role === "owner" ? "attention" : role === "admin" ? "info" : role === "manager" ? "success" : "plain"; return `<span class="pill ${k}">${esc(role)}</span>`; };

  /* ── Shell (rail + topbar) ──────────────────────────────────────────────── */
  const NAV = [
    { key: "workspaces", label: "Workspaces", ico: "grid", hash: "#/workspaces" },
    { key: "team", label: "Team", ico: "users", hash: "#/settings/team" },
    { key: "settings", label: "Workspace settings", ico: "settings", hash: "#/settings/workspace" },
  ];
  function shell(activeKey, content) {
    const ws = activeWs();
    const nav = NAV.map((n) => `<div class="nav-item ${n.key === activeKey ? "active" : ""}" data-hash="${n.hash}"><span class="ni-ico">${svg(n.ico)}</span><span>${n.label}</span></div>`).join("");
    const trigger = ws ? `
      <button class="ws-trigger" id="wsTrigger">
        <span class="ws-badge">${esc(initials(ws.name))}</span>
        <span class="ws-meta"><span class="ws-name">${esc(ws.name)}</span><span class="ws-kind">${ws.kind === "agency" ? "Agency" : "Sub-account"}</span></span>
        <span class="chev">${svg("chev", 13)}</span>
      </button>` : `<span class="ws-kind" style="color:var(--ink-400)">No workspace</span>`;
    return `
      <aside class="rail" id="rail">
        <div class="brand"><span class="mark">✦</span><span><b>AiMind</b><em>Share</em></span></div>
        <div class="nav-group"><div class="nav-group-label">Agency</div>${nav}</div>
        <div class="rail-foot">M01 · Multi-Tenancy</div>
      </aside>
      <header class="tbar">
        <button class="icon-btn rail-burger" id="railBurger" aria-label="Menu">☰</button>
        ${trigger}
        <div class="tb-search"><span>${svg("search", 15)}</span><span class="tbs-label">Search…</span><span class="kbd">⌘K</span></div>
        <div class="spacer"></div>
        <button class="jobs-chip" id="jobsChip" title="Job queue"><span class="jc-dot"></span><span class="num">${state.jobs || 0}</span> jobs</button>
        <span class="pill plain" id="connPill">mockup mode</span>
        <button class="btn btn-ghost btn-sm" id="openConnect2">Connect</button>
        <button class="icon-btn" id="themeToggle" title="Toggle theme" aria-label="Toggle theme"><span id="themeIco">☾</span></button>
        <span class="avatar" title="${esc(state.user?.email || "")}">${esc(initials(state.user?.name || state.user?.email))}</span>
      </header>
      <main class="content"><div class="content-inner">${content}</div></main>`;
  }

  /* ── Mockup preview switcher ─────────────────────────────────────────────── */
  function previewStrip() {
    if (connected()) return "";
    return `<div class="mock-note"><span class="mn-ico">◈</span><b>Mockup mode.</b>
      Connect a project to run these flows live. Preview state:
      ${PREVIEW_STATES.map((s) => `<button class="link ${state.previewState === s ? "on" : ""}" data-preview="${s}">${s}</button>`).join(" ")}</div>`;
  }

  /* ── VIEW: Workspaces (agency dashboard) ────────────────────────────────── */
  function viewWorkspaces() {
    const list = state.workspaces;
    const showEmpty = st("empty") || (connected() && state.loaded && !list.length && !state.loading);
    if (showEmpty) return previewStrip() + viewOnboard();
    if (st("loading") || (state.loading && !list.length)) return previewStrip() + skeletonGrid();
    if (st("error") || state.error) return previewStrip() + errorBlock(state.error || "We couldn't load your workspaces.");

    const agencies = list.filter((w) => w.kind === "agency");
    const active = list.filter((w) => w.status === "active");
    const subs = list.filter((w) => w.kind === "sub");
    const totalMembers = list.reduce((a, w) => a + (w.members || 0), 0);
    const pending = st("success") ? 3 : (MOCK.invitations["ws-agency"] || []).length;

    const kpis = [
      { ico: "layers", val: list.length, label: "Workspaces" },
      { ico: "building", val: subs.length, label: "Sub-accounts" },
      { ico: "users", val: totalMembers, label: "Members" },
      { ico: "mail", val: connected() ? "—" : pending, label: "Pending invites", feat: true },
    ];
    const kpiStrip = `<div class="kpi-strip">${kpis.map((k) => `
      <div class="kpi reveal ${k.feat ? "kpi-featured" : ""}"><div class="kpi-ico">${svg(k.ico, 16)}</div>
        <div class="kpi-val num">${esc(k.val)}</div><div class="kpi-label">${k.label}</div></div>`).join("")}</div>`;

    const cards = list.map((w) => `
      <div class="ws-card reveal ${w.kind === "agency" ? "is-agency" : ""} ${w.status === "archived" ? "archived" : ""}" data-ws="${w.id}">
        <div class="wc-top">
          <span class="wc-badge">${esc(initials(w.name))}</span>
          <div style="min-width:0"><div class="wc-name">${esc(w.name)}</div><div class="wc-slug">/${esc(w.slug)}</div></div>
        </div>
        <div class="wc-meta">
          <div class="wc-stat"><span class="num">${w.members}</span><small>Members</small></div>
          <div class="wc-stat"><span class="num" style="font-size:13px">${esc(w.niche || "—")}</span><small>Niche</small></div>
          <div class="wc-stat"><span class="num" style="font-size:13px">${esc(fmtDate(w.created_at))}</span><small>Created</small></div>
        </div>
        <div class="wc-foot">
          ${w.kind === "agency" ? `<span class="oc-tag">Agency</span>` : `<span class="oc-tag">Sub-account</span>`}
          ${w.status === "archived" ? `<span class="pill warning">archived</span>` : ""}
          <span class="wc-role">${rolePill(w.role)}</span>
        </div>
      </div>`).join("");

    const newCard = `<div class="ws-card new-card reveal" id="newWsCard"><span class="nc-plus">${svg("plus", 20)}</span><b>New workspace</b><span style="font-size:12.5px">Add a sub-account for a client</span></div>`;

    const needs = pending > 0 ? `
      <div class="needs-panel reveal" style="margin-bottom:24px">
        <div class="np-head"><span class="np-ico">${svg("mail", 17)}</span><h2>Needs your <em>attention</em></h2><span class="np-count">${pending}</span></div>
        <div class="needs-actions">
          <div class="needs-item" data-hash="#/settings/team"><span class="ni-ico">${svg("mail", 15)}</span><div><div class="ni-num num">${pending}</div><div class="ni-label">Pending invitations</div></div><span class="ni-go">${svg("arrow", 15)}</span></div>
          <div class="needs-item" data-hash="#/settings/team"><span class="ni-ico">${svg("users", 15)}</span><div><div class="ni-num num">${totalMembers}</div><div class="ni-label">Active members</div></div><span class="ni-go">${svg("arrow", 15)}</span></div>
        </div>
      </div>` : "";

    return `${previewStrip()}
      <div class="page-head reveal">
        <span class="eyebrow">Module · M01</span>
        <h1 style="margin-top:12px">Your <em>workspaces</em></h1>
        <p class="sub">Every client is an isolated workspace under your agency. Data never crosses the wall — Postgres Row-Level Security scopes every record to its <span class="mono">workspace_id</span>.</p>
        <div class="freshness" style="margin-top:10px">${agencies.length} agency · ${subs.length} sub-accounts · ${active.length} active</div>
      </div>
      ${kpiStrip}
      ${needs}
      <div class="sec-head"><h2>All <em>workspaces</em></h2><div class="spacer"></div><button class="btn btn-primary btn-sm" id="newWsBtn">${svg("plus", 15)} New workspace</button></div>
      <div class="ws-grid">${cards}${newCard}</div>`;
  }

  function viewOnboard() {
    return `<div class="onboard reveal">
      <div class="ob-crest">✦</div>
      <h1>Welcome to <em>AiMindShare</em></h1>
      <p>Let's set up your agency — the home for your team, billing, and every client sub-account you'll manage from here.</p>
      <div class="ob-steps">
        <span class="ob-step"><span class="os-n num">1</span> Create your agency</span>
        <span class="ob-step"><span class="os-n num">2</span> Add client workspaces</span>
        <span class="ob-step"><span class="os-n num">3</span> Invite your team</span>
      </div>
      <button class="btn btn-primary" id="createAgencyBtn" style="margin-top:8px">${svg("plus", 15)} Create your agency</button>
    </div>`;
  }

  /* ── VIEW: Workspace settings + danger zone ─────────────────────────────── */
  function viewSettings() {
    const ws = activeWs();
    if (!ws) return previewStrip() + emptyNoWorkspace();
    if (st("loading")) return previewStrip() + `<div class="panel"><div class="skeleton skel-line" style="width:40%;margin-bottom:18px"></div><div class="form-grid">${Array(4).fill('<div class="skeleton" style="height:40px;border-radius:10px"></div>').join("")}</div></div>`;
    const saved = st("success");
    const manage = canManage(ws) || !connected();
    const TZ = ["America/Toronto", "America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London", "Asia/Dubai", "UTC"];
    const CUR = ["USD", "CAD", "EUR", "GBP", "AED"];
    const LOC = [["en", "English"], ["fr", "Français"], ["es", "Español"], ["ar", "العربية"]];
    return `${previewStrip()}
      <div class="page-head reveal"><span class="eyebrow">Module · M01</span>
        <h1 style="margin-top:12px">Workspace <em>settings</em></h1>
        <p class="sub">General information for <b>${esc(ws.name)}</b>. Changes apply to this workspace only.</p></div>
      ${saved ? `<div class="mock-note" style="background:rgba(46,158,123,.10);border-color:rgba(46,158,123,.35)"><span class="mn-ico" style="color:var(--status-success)">✓</span> Settings saved.</div>` : ""}
      ${st("error") ? errorBlock("Could not save changes. Please retry.") : ""}
      <div class="settings-col">
        <div class="panel reveal">
          <div class="panel-head"><span class="ph-ico">${svg("settings", 15)}</span><h3>General</h3></div>
          <div class="form-grid">
            <div class="form-field full"><label>Workspace name</label><input id="setName" value="${esc(ws.name)}" ${manage ? "" : "disabled"}></div>
            <div class="form-field"><label>Slug</label><input value="${esc(ws.slug)}" disabled><span class="hint">Permanent — used in URLs.</span></div>
            <div class="form-field"><label>Niche</label><input id="setNiche" value="${esc(ws.niche || "")}" placeholder="e.g. Dental" ${manage ? "" : "disabled"}></div>
            <div class="form-field"><label>Timezone</label><select id="setTz" ${manage ? "" : "disabled"}>${TZ.map((t) => `<option ${t === ws.timezone ? "selected" : ""}>${t}</option>`).join("")}</select></div>
            <div class="form-field"><label>Currency</label><select id="setCur" ${manage ? "" : "disabled"}>${CUR.map((t) => `<option ${t === ws.currency ? "selected" : ""}>${t}</option>`).join("")}</select></div>
            <div class="form-field full"><label>Locale</label><select id="setLoc" ${manage ? "" : "disabled"}>${LOC.map(([v, n]) => `<option value="${v}" ${v === ws.locale ? "selected" : ""}>${n}</option>`).join("")}</select></div>
          </div>
          ${manage ? `<div style="display:flex;justify-content:flex-end;margin-top:20px"><button class="btn btn-primary" id="saveSettings">Save changes</button></div>` : `<p class="hint" style="margin-top:14px">You need admin access to edit these fields.</p>`}
        </div>

        ${roleRank[ws.role] >= roleRank.owner || !connected() ? `
        <div class="danger-zone reveal">
          <div class="sec-head" style="margin:14px 0 4px"><h2 style="font-size:16px;color:var(--status-danger)">${svg("shield", 16)} Danger zone</h2></div>
          <div class="dz-row">
            <div class="dz-body"><div class="dz-title">Transfer ownership</div><div class="dz-sub">Hand this workspace to another member. You'll become an admin. Requires their confirmation.</div></div>
            <button class="btn btn-danger btn-sm" id="transferBtn">${svg("swap", 14)} Transfer</button>
          </div>
          <div class="dz-row">
            <div class="dz-body"><div class="dz-title">${ws.status === "archived" ? "Restore workspace" : "Archive workspace"}</div><div class="dz-sub">${ws.status === "archived" ? "Bring this workspace back into active use." : "Hide from the switcher and pause activity. Restorable for 90 days."}</div></div>
            <button class="btn ${ws.status === "archived" ? "btn-ghost" : "btn-danger"} btn-sm" id="archiveBtn">${ws.status === "archived" ? "Restore" : svg("trash", 14) + " Archive"}</button>
          </div>
        </div>` : ""}
      </div>`;
  }

  /* ── VIEW: Team (members + invitations) ─────────────────────────────────── */
  async function viewTeam(mount) {
    const ws = activeWs();
    if (!ws) { mount.innerHTML = previewStrip() + emptyNoWorkspace(); wireCommon(mount); return; }
    if (st("loading")) { mount.innerHTML = previewStrip() + `<div class="panel"><div class="skeleton skel-line" style="width:30%;margin-bottom:16px"></div>${Array(4).fill('<div class="skeleton" style="height:52px;border-radius:10px;margin-bottom:8px"></div>').join("")}</div>`; wireCommon(mount); return; }

    let members = [], invites = [], err = null;
    try {
      if (st("empty")) { members = [{ user_id: "you", name: state.user?.name || "You", email: state.user?.email || "you@agency.com", role: "owner", status: "active", joined_at: new Date().toISOString(), you: true }]; invites = []; }
      else if (st("error")) { err = "Could not load your team."; }
      else { members = await fetchMembers(ws.id); invites = st("success") ? [{ id: "new", email: "sofia@northstar.agency", role: "manager", status: "pending", expires_at: "2026-07-10", created_at: new Date().toISOString() }, ...(await fetchInvites(ws.id))] : await fetchInvites(ws.id); }
    } catch (e) { err = e.message || String(e); }

    const manage = canManage(ws) || !connected();
    const head = `<div class="page-head reveal"><span class="eyebrow">Module · M01</span>
      <h1 style="margin-top:12px">Team &amp; <em>access</em></h1>
      <p class="sub">Everyone with access to <b>${esc(ws.name)}</b>. Roles govern what each member can do — enforced by Postgres RLS, not just the UI.</p></div>`;

    if (err) { mount.innerHTML = previewStrip() + head + errorBlock(err); wireCommon(mount); return; }

    const rows = members.map((m) => `
      <tr>
        <td><div class="cell-user"><span class="avatar">${esc(initials(m.name))}</span><div><div class="cu-name">${esc(m.name)}${m.you ? ' <span class="oc-tag" style="margin-left:6px">You</span>' : ""}</div><div class="cu-sub">${esc(m.email)}</div></div></div></td>
        <td>${rolePill(m.role)}</td>
        <td>${esc(fmtDate(m.joined_at))}</td>
        <td class="num" style="text-align:right">${manage && !m.you && m.role !== "owner" ? `<button class="btn btn-ghost btn-sm" data-remove="${esc(m.user_id)}">Remove</button>` : ""}</td>
      </tr>`).join("");

    const inviteRows = invites.length ? invites.map((i) => `
      <div class="invite-row">
        <span class="ir-ico">${svg("mail", 15)}</span>
        <div class="ir-body"><div class="ir-email">${esc(i.email)}</div><div class="ir-meta">${esc(i.role)} · expires ${esc(fmtDate(i.expires_at))}</div></div>
        <div class="ir-actions">${manage ? `<button class="btn btn-ghost btn-sm" data-copyinvite="${esc(i.id)}">Copy link</button><button class="btn btn-ghost btn-sm" data-revoke="${esc(i.id)}">Revoke</button>` : ""}</div>
      </div>`).join("") : `<div class="empty-state" style="padding:30px"><div class="es-ico">${svg("mail", 20)}</div><h3 style="font-size:16px">No pending invitations</h3><p>Invite a teammate to give them access to this workspace.</p></div>`;

    const membersPanel = members.length ? `
      <div class="panel reveal">
        <div class="panel-head"><span class="ph-ico">${svg("users", 15)}</span><h3>Members</h3><span class="pill plain" style="margin-left:8px">${members.length}</span>
          ${manage ? `<button class="btn btn-primary btn-sm cc-viewall" id="inviteBtn" style="margin-left:auto;color:#fff">${svg("plus", 14)} Invite</button>` : ""}</div>
        <div style="overflow-x:auto"><table class="table"><thead><tr><th>Member</th><th>Role</th><th>Joined</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      </div>` : `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("users", 22)}</div><h3>No members yet</h3><p>You're the first one here. Invite your team to collaborate.</p>${manage ? `<button class="btn btn-primary es-cta" id="inviteBtn">${svg("plus", 15)} Invite a teammate</button>` : ""}</div></div>`;

    mount.innerHTML = `${previewStrip()}${head}
      ${st("success") ? `<div class="mock-note" style="background:rgba(46,158,123,.10);border-color:rgba(46,158,123,.35)"><span class="mn-ico" style="color:var(--status-success)">✓</span> Invitation created — copy the link to share it.</div>` : ""}
      <div class="settings-col" style="max-width:920px;gap:22px">
        ${membersPanel}
        <div class="panel reveal">
          <div class="panel-head"><span class="ph-ico">${svg("mail", 15)}</span><h3>Pending invitations</h3><span class="pill plain" style="margin-left:8px">${invites.length}</span></div>
          <div class="row-list">${inviteRows}</div>
        </div>
      </div>`;
    wireCommon(mount);
    wireTeam(mount, ws);
  }

  /* ── Shared building blocks ─────────────────────────────────────────────── */
  function skeletonGrid() { return `<div class="page-head"><div class="skeleton skel-line" style="width:220px;height:40px"></div></div><div class="kpi-strip">${Array(4).fill('<div class="skeleton" style="height:120px;border-radius:24px"></div>').join("")}</div><div class="ws-grid" style="margin-top:22px">${Array(3).fill('<div class="skeleton skel-card"></div>').join("")}</div>`; }
  function errorBlock(msg) { return `<div class="panel" style="border-color:rgba(196,97,78,.4)"><div class="empty-state"><div class="es-ico" style="background:rgba(196,97,78,.12);color:var(--status-danger)">⚠</div><h3>Something went wrong</h3><p>${esc(msg)}</p><button class="btn btn-ghost es-cta" id="retryBtn">Retry</button></div></div>`; }
  function emptyNoWorkspace() { return `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("building", 22)}</div><h3>No active workspace</h3><p>Create or select a workspace to see its settings.</p><button class="btn btn-primary es-cta" data-hash="#/workspaces">Go to workspaces</button></div></div>`; }

  /* ── Router + render ────────────────────────────────────────────────────── */
  function currentRoute() {
    const h = (location.hash || "#/workspaces").replace(/^#/, "");
    if (h.startsWith("/accept")) return { key: "accept" };
    if (h.startsWith("/settings/team")) return { key: "team" };
    if (h.startsWith("/settings/workspace")) return { key: "settings" };
    return { key: "workspaces" };
  }

  function render() {
    const app = $("#app");
    const r = currentRoute();
    if (r.key === "accept") { app.innerHTML = shell("workspaces", acceptView()); afterShell(); wireAccept(); return; }
    // Team view is async (fetches members) — render shell first, then fill content.
    app.innerHTML = shell(r.key, r.key === "team" ? "" : (r.key === "settings" ? viewSettings() : viewWorkspaces()));
    afterShell();
    const inner = $(".content-inner");
    if (r.key === "team") { viewTeam(inner); }
    else { wireCommon(inner); if (r.key === "workspaces") wireWorkspaces(inner); if (r.key === "settings") wireSettings(inner, activeWs()); }
    if (!reduce) nextTick(() => document.body.classList.add("js-ready"));
    else document.body.classList.add("js-ready");
  }

  /* ── Wiring: shell-level (nav, topbar, switcher, drawer) ────────────────── */
  function afterShell() {
    renderConn();
    setTheme(root.getAttribute("data-theme"));
    $("#themeToggle").addEventListener("click", () => setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"));
    $("#openConnect2").addEventListener("click", openDrawer);
    const burger = $("#railBurger"); if (burger) burger.addEventListener("click", () => $("#rail").classList.toggle("open"));
    $$("[data-hash]").forEach((n) => n.addEventListener("click", () => { location.hash = n.dataset.hash; $("#rail")?.classList.remove("open"); }));
    const trg = $("#wsTrigger"); if (trg) trg.addEventListener("click", (e) => { e.stopPropagation(); openSwitcher(trg); });
  }

  function openSwitcher(anchor) {
    document.querySelectorAll(".pop").forEach((p) => p.remove());
    const active = state.workspaces.filter((w) => w.status === "active");
    const archived = state.workspaces.filter((w) => w.status === "archived");
    const cur = activeWs();
    const item = (w) => `<div class="pop-item ${w.kind === "sub" ? "sub" : ""}" data-switch="${w.id}"><span class="ws-badge">${esc(initials(w.name))}</span><div style="min-width:0"><div class="pi-name">${esc(w.name)}</div><div class="pi-sub">${w.kind === "agency" ? "Agency" : "Sub-account"} · ${esc(w.role)}</div></div>${cur && cur.id === w.id ? `<span class="pi-check">${svg("check", 15)}</span>` : ""}</div>`;
    const pop = el("div", "pop");
    pop.innerHTML = `<input class="pop-search" placeholder="Search workspaces…" id="popSearch">
      <div class="pop-label">Switch to</div>${active.map(item).join("")}
      ${archived.length ? `<div class="pop-label">Archived</div>${archived.map(item).join("")}` : ""}
      <div class="pop-sep"></div>
      <div class="pop-item action" data-newws><span class="ws-badge" style="background:transparent;border:.5px dashed var(--teal-500);color:var(--teal-700)">+</span><span>New workspace</span></div>`;
    document.body.appendChild(pop);
    const rect = anchor.getBoundingClientRect();
    pop.style.left = rect.left + "px"; pop.style.top = rect.bottom + 8 + "px"; pop.style.minWidth = Math.max(280, rect.width) + "px";
    nextTick(() => pop.classList.add("open"));
    const close = (e) => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener("click", close); } };
    setTimeout(() => document.addEventListener("click", close), 0);
    $("#popSearch", pop).addEventListener("input", (e) => { const q = e.target.value.toLowerCase(); $$(".pop-item[data-switch]", pop).forEach((it) => { const w = state.workspaces.find((x) => x.id === it.dataset.switch); it.style.display = w.name.toLowerCase().includes(q) ? "" : "none"; }); });
    $$("[data-switch]", pop).forEach((it) => it.addEventListener("click", () => { setActive(it.dataset.switch); pop.remove(); toast("Switched workspace"); render(); }));
    $("[data-newws]", pop).addEventListener("click", () => { pop.remove(); openNewWorkspace(); });
  }

  /* ── Wiring: common (nav hashes, retry, preview strip) ──────────────────── */
  function wireCommon(mount) {
    $$("[data-hash]", mount).forEach((n) => n.addEventListener("click", () => (location.hash = n.dataset.hash)));
    $$("[data-preview]", mount).forEach((b) => b.addEventListener("click", () => { state.previewState = b.dataset.preview; render(); }));
    const retry = $("#retryBtn", mount); if (retry) retry.addEventListener("click", () => { state.previewState = "default"; boot(); });
  }

  /* ── Wiring: workspaces view ────────────────────────────────────────────── */
  function wireWorkspaces(mount) {
    const open = () => openNewWorkspace();
    ["#newWsBtn", "#newWsCard", "#createAgencyBtn"].forEach((sel) => { const b = $(sel, mount); if (b) b.addEventListener("click", open); });
    $$("[data-ws]", mount).forEach((c) => c.addEventListener("click", () => { const id = c.dataset.ws; const w = state.workspaces.find((x) => x.id === id); if (w && w.status === "active") { setActive(id); location.hash = "#/settings/workspace"; } else { setActive(id); location.hash = "#/settings/workspace"; } }));
  }

  /* ── Wiring: settings view ──────────────────────────────────────────────── */
  function wireSettings(mount, ws) {
    const save = $("#saveSettings", mount);
    if (save) save.addEventListener("click", async () => {
      const patch = { name: $("#setName").value.trim(), niche: $("#setNiche").value.trim() || null, timezone: $("#setTz").value, currency: $("#setCur").value, locale: $("#setLoc").value };
      if (!patch.name) { toast("Workspace name is required", "danger"); return; }
      if (!connected()) { toast("Saved (mockup)", "success"); return; }
      save.disabled = true; save.textContent = "Saving…";
      const { error } = await ensureClient().from("workspaces").update(patch).eq("id", ws.id);
      save.disabled = false; save.textContent = "Save changes";
      if (error) { toast(error.message, "danger"); return; }
      toast("Settings saved", "success"); await boot();
    });
    const tr = $("#transferBtn", mount); if (tr) tr.addEventListener("click", () => openTransfer(ws));
    const ar = $("#archiveBtn", mount); if (ar) ar.addEventListener("click", () => confirmArchive(ws));
  }

  /* ── Wiring: team view ──────────────────────────────────────────────────── */
  function wireTeam(mount, ws) {
    const inv = $("#inviteBtn", mount); if (inv) inv.addEventListener("click", () => openInvite(ws));
    $$("[data-remove]", mount).forEach((b) => b.addEventListener("click", async () => {
      const uid = b.dataset.remove;
      if (!connected()) { toast("Member removed (mockup)"); return; }
      if (!confirm("Remove this member from the workspace?")) return;
      const { error } = await ensureClient().from("memberships").delete().eq("workspace_id", ws.id).eq("user_id", uid);
      if (error) { toast(error.message, "danger"); return; }
      toast("Member removed", "success"); render();
    }));
    $$("[data-revoke]", mount).forEach((b) => b.addEventListener("click", async () => {
      const id = b.dataset.revoke;
      if (!connected()) { toast("Invitation revoked (mockup)"); return; }
      const { error } = await ensureClient().from("workspace_invitations").update({ status: "revoked" }).eq("id", id);
      if (error) { toast(error.message, "danger"); return; }
      toast("Invitation revoked", "success"); render();
    }));
    $$("[data-copyinvite]", mount).forEach((b) => b.addEventListener("click", () => { copyText(`${location.origin}${location.pathname}#/accept?token=demo-token`); toast("Invite link copied", "success"); }));
  }

  /* ── Modals ─────────────────────────────────────────────────────────────── */
  function modal(html) {
    const wrap = $("#modalRoot");
    wrap.innerHTML = `<div class="modal-scrim" id="mScrim"><div class="modal-card">${html}</div></div>`;
    const scrimEl = $("#mScrim");
    nextTick(() => scrimEl.classList.add("open"));
    const close = () => { scrimEl.classList.remove("open"); setTimeout(() => (wrap.innerHTML = ""), 300); };
    scrimEl.addEventListener("click", (e) => { if (e.target === scrimEl) close(); });
    $$("[data-close]", wrap).forEach((b) => b.addEventListener("click", close));
    return { close, wrap };
  }

  function openNewWorkspace() {
    const hasAgency = state.workspaces.some((w) => w.kind === "agency");
    const TZ = ["America/Toronto", "America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London", "Asia/Dubai", "UTC"];
    const CUR = ["USD", "CAD", "EUR", "GBP", "AED"];
    const { close } = modal(`
      <div class="mc-head"><span class="mc-ico">${svg(hasAgency ? "building" : "layers", 18)}</span>
        <div><h3>${hasAgency ? "New sub-account" : "Create your agency"}</h3><div class="mc-sub">${hasAgency ? "A fresh, isolated workspace for a client." : "Your top-level account — it holds billing and all client workspaces."}</div></div>
        <button class="icon-btn mc-close" data-close>✕</button></div>
      <div class="form-grid">
        <div class="form-field full"><label>${hasAgency ? "Client / workspace name" : "Agency name"}</label><input id="nwName" placeholder="${hasAgency ? "Bluewave Dental" : "Northstar Agency"}" autofocus></div>
        <div class="form-field"><label>Niche</label><input id="nwNiche" placeholder="e.g. Dental"></div>
        <div class="form-field"><label>Timezone</label><select id="nwTz">${TZ.map((t) => `<option ${t === "America/Toronto" ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        <div class="form-field"><label>Currency</label><select id="nwCur">${CUR.map((t) => `<option>${t}</option>`).join("")}</select></div>
        <div class="form-field"><label>Locale</label><select id="nwLoc"><option value="en" selected>English</option><option value="fr">Français</option><option value="es">Español</option><option value="ar">العربية</option></select></div>
      </div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="nwCreate">${hasAgency ? "Create workspace" : "Create agency"}</button></div>`);
    $("#nwCreate").addEventListener("click", async () => {
      const name = $("#nwName").value.trim();
      if (!name) { $("#nwName").focus(); toast("Name is required", "danger"); return; }
      const payload = { p_name: name, p_niche: $("#nwNiche").value.trim() || null, p_timezone: $("#nwTz").value, p_currency: $("#nwCur").value, p_locale: $("#nwLoc").value, p_parent: hasAgency ? (state.workspaces.find((w) => w.kind === "agency")?.id || null) : null };
      if (!connected()) { close(); toast(hasAgency ? "Sub-account created (mockup)" : "Agency created (mockup)", "success"); state.previewState = "default"; return; }
      const btn = $("#nwCreate"); btn.disabled = true; btn.textContent = "Creating…";
      const { data, error } = await ensureClient().rpc("create_workspace", payload);
      if (error) { btn.disabled = false; btn.textContent = "Create"; toast(error.message, "danger"); return; }
      close(); toast("Workspace created — provisioning defaults…", "success");
      if (data?.id) setActive(data.id);
      await boot();
    });
  }

  function openInvite(ws) {
    const { close } = modal(`
      <div class="mc-head"><span class="mc-ico">${svg("mail", 18)}</span>
        <div><h3>Invite a teammate</h3><div class="mc-sub">They'll join <b>${esc(ws.name)}</b> with the role you choose.</div></div>
        <button class="icon-btn mc-close" data-close>✕</button></div>
      <div class="form-grid">
        <div class="form-field full"><label>Email address</label><input id="ivEmail" type="email" placeholder="teammate@agency.com" autofocus></div>
        <div class="form-field full"><label>Role</label><select id="ivRole"><option value="staff">Staff — create &amp; edit records</option><option value="manager">Manager — + delete records</option><option value="admin">Admin — + manage members &amp; billing</option></select></div>
      </div>
      <div class="hint" style="margin-top:6px;font-size:12px;color:var(--ink-400)">Email delivery arrives with M04 (provider pending, D-011). For now we generate a secure invite link you can share.</div>
      <div id="ivLinkBox"></div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="ivSend">Create invite</button></div>`);
    $("#ivSend").addEventListener("click", async () => {
      const email = $("#ivEmail").value.trim(); const role = $("#ivRole").value;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("Enter a valid email", "danger"); return; }
      const rawToken = genToken();
      const link = `${location.origin}${location.pathname}#/accept?token=${rawToken}`;
      if (!connected()) { showInviteLink(link); toast("Invite created (mockup)", "success"); return; }
      const btn = $("#ivSend"); btn.disabled = true; btn.textContent = "Creating…";
      const token_hash = await sha256Hex(rawToken);
      const { error } = await ensureClient().from("workspace_invitations").insert({ workspace_id: ws.id, email, role, token_hash, invited_by: state.user?.id });
      btn.disabled = false; btn.textContent = "Create invite";
      if (error) { toast(error.message, "danger"); return; }
      showInviteLink(link); toast("Invitation created", "success");
    });
    function showInviteLink(link) {
      $("#ivLinkBox").innerHTML = `<div class="link-box"><code>${esc(link)}</code><button class="btn btn-ghost btn-sm" id="ivCopy">Copy</button></div>`;
      $("#ivCopy").addEventListener("click", () => { copyText(link); toast("Link copied", "success"); });
    }
  }

  function openTransfer(ws) {
    (async () => {
      let members = [];
      try { members = (await fetchMembers(ws.id)).filter((m) => !m.you && m.status === "active"); } catch (e) {}
      const { close } = modal(`
        <div class="mc-head"><span class="mc-ico">${svg("swap", 18)}</span>
          <div><h3>Transfer ownership</h3><div class="mc-sub">Choose the member who will become the new owner of <b>${esc(ws.name)}</b>. You'll become an admin.</div></div>
          <button class="icon-btn mc-close" data-close>✕</button></div>
        ${members.length ? `<div class="form-field full"><label>New owner</label><select id="tfUser">${members.map((m) => `<option value="${esc(m.user_id)}">${esc(m.name)} — ${esc(m.email)}</option>`).join("")}</select></div>
        <div class="mock-note" style="margin-top:14px"><span class="mn-ico">⚠</span> This can't be undone from here — the new owner would need to transfer it back.</div>` : `<div class="empty-state" style="padding:24px"><div class="es-ico">${svg("users", 20)}</div><h3 style="font-size:16px">No other members</h3><p>Invite a teammate first, then you can transfer ownership to them.</p></div>`}
        <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button>${members.length ? `<button class="btn btn-danger" id="tfGo">Transfer ownership</button>` : ""}</div>`);
      const go = $("#tfGo"); if (go) go.addEventListener("click", async () => {
        const to = $("#tfUser").value;
        if (!connected()) { close(); toast("Ownership transferred (mockup)", "success"); return; }
        go.disabled = true; go.textContent = "Transferring…";
        const { error } = await ensureClient().rpc("transfer_ownership", { p_workspace: ws.id, p_to_user: to });
        if (error) { go.disabled = false; go.textContent = "Transfer ownership"; toast(error.message, "danger"); return; }
        close(); toast("Ownership transferred", "success"); await boot(); location.hash = "#/settings/workspace";
      });
    })();
  }

  function confirmArchive(ws) {
    const archiving = ws.status !== "archived";
    const { close } = modal(`
      <div class="mc-head"><span class="mc-ico" style="background:${archiving ? "var(--status-danger)" : "var(--grad-brand)"}">${svg(archiving ? "trash" : "arrow", 18)}</span>
        <div><h3>${archiving ? "Archive" : "Restore"} ${esc(ws.name)}?</h3><div class="mc-sub">${archiving ? "It'll be hidden from the switcher and paused. You can restore it within 90 days." : "It'll return to active use and reappear in the switcher."}</div></div>
        <button class="icon-btn mc-close" data-close>✕</button></div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn ${archiving ? "btn-danger" : "btn-primary"}" id="arGo">${archiving ? "Archive workspace" : "Restore workspace"}</button></div>`);
    $("#arGo").addEventListener("click", async () => {
      if (!connected()) { close(); toast(archiving ? "Workspace archived (mockup)" : "Workspace restored (mockup)", "success"); return; }
      const go = $("#arGo"); go.disabled = true;
      const { error } = await ensureClient().rpc(archiving ? "archive_workspace" : "restore_workspace", { p_workspace: ws.id });
      if (error) { go.disabled = false; toast(error.message, "danger"); return; }
      close(); toast(archiving ? "Workspace archived" : "Workspace restored", "success"); await boot();
    });
  }

  /* ── Invitation accept route ────────────────────────────────────────────── */
  function acceptView() {
    return `<div class="onboard reveal" style="margin-top:4vh"><div class="ob-crest">${svg("mail", 30)}</div>
      <h1>Accept your <em>invitation</em></h1>
      <p id="acceptMsg">Joining the workspace…</p>
      <div id="acceptActions"></div></div>`;
  }
  function wireAccept() {
    const params = new URLSearchParams((location.hash.split("?")[1] || ""));
    const token = params.get("token");
    const msg = $("#acceptMsg"), actions = $("#acceptActions");
    if (!token) { msg.textContent = "This invitation link is missing its token."; return; }
    if (!connected()) {
      msg.innerHTML = `In mockup mode we can't verify the token, but here's the flow: your email is matched to the invite, a membership row is created, and you land in the workspace. <b>Connect a project</b> to run it live.`;
      actions.innerHTML = `<button class="btn btn-primary" data-hash="#/workspaces" style="margin-top:8px">Continue to workspaces</button>`;
      $$("[data-hash]", actions).forEach((n) => n.addEventListener("click", () => (location.hash = n.dataset.hash)));
      return;
    }
    (async () => {
      const c = ensureClient();
      const { data: { user } } = await c.auth.getUser();
      if (!user) { msg.innerHTML = "Please sign in first, then open this link again."; actions.innerHTML = `<a class="btn btn-primary" href="m00-auth-and-identity.html#/login" style="margin-top:8px">Go to sign in</a>`; return; }
      const { data, error } = await c.rpc("accept_invitation", { p_token_raw: token });
      if (error) { msg.innerHTML = `We couldn't accept this invitation: <b>${esc(error.message)}</b>`; return; }
      if (data) setActive(data);
      msg.innerHTML = `You're in! Welcome to the workspace.`;
      actions.innerHTML = `<button class="btn btn-primary" data-hash="#/workspaces" style="margin-top:8px">Enter workspace</button>`;
      $$("[data-hash]", actions).forEach((n) => n.addEventListener("click", () => { location.hash = n.dataset.hash; boot(); }));
    })();
  }

  /* ── Small utils ────────────────────────────────────────────────────────── */
  function genToken() { const a = new Uint8Array(24); (crypto.getRandomValues ? crypto.getRandomValues(a) : a.fill(1)); return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join(""); }
  async function sha256Hex(s) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function copyText(t) { try { navigator.clipboard.writeText(t); } catch (e) { const ta = el("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); } }

  /* ── Go ─────────────────────────────────────────────────────────────────── */
  window.addEventListener("hashchange", render);
  boot();
})();
