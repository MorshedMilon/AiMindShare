/* m41-integrations.js — AiMindShare Module M41 · Credential Vault (slice).
   Vanilla hash-routed dashboard app on Supabase, layered on the M01/M02 shell.
   The connections page (/settings/integrations): every provider as a card grouped by
   category, with connect (api_key form → Edge Fn → Vault; oauth2 → consent redirect),
   "Test now" health ping, and disconnect. The FIVE VAULT LAWS hold (INTEGRATIONS-SPEC
   §1): a secret never touches the browser — provider keys go straight to the
   integrations-connect Edge Function and into Supabase Vault; the table the browser
   reads holds a REFERENCE only. The list is an RLS-gated read (admin+); connect / test /
   disconnect are Edge-Function calls. When no project is connected the whole app renders
   as a high-fidelity mockup with a default/empty/loading/error/success preview switcher
   (honest Gate-5). Anon key only in the browser (Law 3). */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const initials = (s) => (s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const nextTick = (fn) => setTimeout(fn, 12);
  const relTime = (d) => {
    if (!d) return "never";
    const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago"; return Math.floor(s / 86400) + "d ago";
  };

  const REG = window.AIMS_PROVIDERS;   // provider registry mirror (js/providers.js)

  /* ── Lucide-style inline icons (DESIGN §9) ──────────────────────────────── */
  const P = {
    plug: "M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5",
    key: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3",
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    activity: "M22 12h-4l-3 9L9 3l-3 9H2",
    check: "M20 6 9 17l-5-5", plus: "M12 5v14M5 12h14", search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
    chev: "M6 9l6 6 6-6", trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
    refresh: "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
    building: "M3 21h18M6 21V7l6-4 6 4v14M10 9h.01M14 9h.01M10 13h.01M14 13h.01M10 17h.01M14 17h.01",
    globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z",
    lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4",
    zap: "M13 2L3 14h9l-1 8 10-12h-9l1-8z", link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
    alert: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
    eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    layers: "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
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
  const ACTIVE_KEY = "aimindshare-active-ws";       // shared with M01/M02 (same device)
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
  // Reference rows only (a vault_secret_name pointer, never a secret). Statuses vary
  // so the pills (green/amber/red/neutral) all have live data to show.
  const MOCK = {
    user: { id: "you", email: "aisha@northstar.agency", name: "Aisha Rahman" },
    jobs: 2,
    workspaces: [
      { id: "ws-agency", name: "Northstar Agency", slug: "northstar-agency", kind: "agency", parent_id: null, status: "active", role: "owner" },
      { id: "ws-bluewave", name: "Bluewave Dental", slug: "bluewave-dental", kind: "sub", parent_id: "ws-agency", status: "active", role: "admin" },
    ],
    integrations: {
      "ws-agency": [
        { provider: "stripe", auth_type: "api_key", scope: "workspace", status: "connected", vault_secret_name: "ws_ws-agency__stripe", last_health_check: new Date(Date.now() - 42 * 60000).toISOString(), last_error: null, token_expires_at: null },
        { provider: "twilio", auth_type: "api_key", scope: "workspace", status: "error", vault_secret_name: "ws_ws-agency__twilio", last_health_check: new Date(Date.now() - 9 * 60000).toISOString(), last_error: "401 authenticate — check the auth token", token_expires_at: null },
        { provider: "openai", auth_type: "api_key", scope: "workspace", status: "connected", vault_secret_name: "ws_ws-agency__openai", last_health_check: new Date(Date.now() - 55 * 60000).toISOString(), last_error: null, token_expires_at: null },
        { provider: "google", auth_type: "oauth2", scope: "workspace", status: "needs_reauth", vault_secret_name: "ws_ws-agency__google", last_health_check: new Date(Date.now() - 3 * 3600000).toISOString(), last_error: "refresh token rejected", token_expires_at: new Date(Date.now() + 40 * 60000).toISOString() },
      ],
      "ws-bluewave": [
        { provider: "stripe", auth_type: "api_key", scope: "workspace", status: "connected", vault_secret_name: "ws_ws-bluewave__stripe", last_health_check: new Date(Date.now() - 12 * 60000).toISOString(), last_error: null, token_expires_at: null },
      ],
    },
  };

  /* ── App state ──────────────────────────────────────────────────────────── */
  const state = {
    loaded: false, loading: false, error: null,
    workspaces: [], user: null, jobs: 0, myMem: {},
    integrations: [], previewState: "default",
  };
  const PREVIEW_STATES = ["default", "empty", "loading", "error", "success"];
  const st = (name) => !connected() && state.previewState === name;
  const roleRank = { client: 0, staff: 1, manager: 2, admin: 3, owner: 4 };
  const canManage = (ws) => ws && roleRank[ws.role] >= roleRank.admin;   // admin+ manages integrations (§2)

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
        if (!user) { state.workspaces = []; state.integrations = []; state.loaded = true; state.loading = false; renderConn(); render(); return; }
        const { data: wsRows, error } = await c.from("workspaces").select("*").eq("status", "active").order("created_at", { ascending: true });
        if (error) throw error;
        const { data: mem } = await c.from("memberships").select("workspace_id, user_id, role").eq("status", "active");
        const myRole = {}; state.myMem = {};
        (mem || []).forEach((m) => { if (m.user_id === user.id) { myRole[m.workspace_id] = m.role; state.myMem[m.workspace_id] = { role: m.role }; } });
        state.workspaces = (wsRows || []).map((w) => ({ id: w.id, name: w.name, slug: w.slug, kind: w.parent_workspace_id ? "sub" : "agency", parent_id: w.parent_workspace_id, status: w.status, role: myRole[w.id] || "staff" }));
        await loadIntegrations();
      } catch (e) { state.error = e.message || String(e); state.workspaces = []; state.integrations = []; }
      state.loading = false; state.loaded = true;
    } else {
      state.user = MOCK.user; state.jobs = MOCK.jobs;
      state.workspaces = MOCK.workspaces.map((w) => ({ ...w }));
      state.myMem = { "ws-agency": { role: "owner" }, "ws-bluewave": { role: "admin" } };
      const ws = activeWs();
      state.integrations = (MOCK.integrations[ws ? ws.id : "ws-agency"] || []).map((i) => ({ ...i }));
      state.loaded = true; state.loading = false;
    }
    renderConn(); render();
  }

  // Live: RLS returns only the non-secret columns, and only if the caller is admin+ of
  // the workspace (or platform-admin for null rows). The secret is never present.
  async function loadIntegrations() {
    const ws = activeWs(); if (!ws) { state.integrations = []; return; }
    const c = ensureClient();
    const { data, error } = await c.from("integrations")
      .select("id, provider, auth_type, scope, status, config, token_expires_at, last_health_check, last_error, workspace_id")
      .or(`workspace_id.eq.${ws.id},workspace_id.is.null`);
    if (error) throw error;
    state.integrations = data || [];
  }

  // The connection row for a provider in the active scope (workspace override beats platform).
  function connFor(providerKey) {
    const rows = state.integrations.filter((r) => r.provider === providerKey);
    return rows.find((r) => r.scope === "workspace") || rows.find((r) => r.scope === "platform") || null;
  }

  /* ── Connection pill ────────────────────────────────────────────────────── */
  function renderConn() {
    const pill = $("#connPill"); if (!pill) return;
    if (connected()) { pill.className = "pill success"; pill.textContent = "connected"; }
    else { pill.className = "pill plain"; pill.textContent = "mockup mode"; }
  }

  /* ── Status → pill ──────────────────────────────────────────────────────── */
  const STATUS_META = {
    connected:   { cls: "success",   label: "Connected" },
    needs_reauth:{ cls: "attention", label: "Needs re-auth" },
    error:       { cls: "danger",    label: "Error" },
    disconnected:{ cls: "plain",     label: "Disconnected" },
  };
  const statusPill = (s) => { const m = STATUS_META[s] || { cls: "plain", label: "Not connected" }; return `<span class="pill ${m.cls}">${m.label}</span>`; };
  const notConnectedPill = () => `<span class="pill plain">Not connected</span>`;

  /* ── Shell (rail + topbar) ──────────────────────────────────────────────── */
  const NAV = [
    { key: "integrations", label: "Integrations", ico: "plug", hash: "#/settings/integrations" },
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
        <div class="nav-group"><div class="nav-group-label">Settings</div>${nav}</div>
        <div class="rail-foot">M41 · Credential Vault</div>
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

  /* ── Shared building blocks ─────────────────────────────────────────────── */
  function errorBlock(msg) { return `<div class="panel" style="border-color:rgba(196,97,78,.4)"><div class="empty-state"><div class="es-ico" style="background:rgba(196,97,78,.12);color:var(--status-danger)">⚠</div><h3>Something went wrong</h3><p>${esc(msg)}</p><button class="btn btn-ghost es-cta" id="retryBtn">Retry</button></div></div>`; }
  function emptyNoWorkspace() { return `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("building", 22)}</div><h3>No active workspace</h3><p>Create or select a workspace in M01 to manage its integrations.</p><a class="btn btn-primary es-cta" href="m01-workspaces-and-multi-tenancy.html#/workspaces">Go to workspaces</a></div></div>`; }
  function notAdmin(ws) { return `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("lock", 22)}</div><h3>Admins only</h3><p>Integrations for <b>${esc(ws.name)}</b> are managed by owners and admins (RLS-AND-SECURITY §2). Ask an admin to connect a provider.</p></div></div>`; }
  function skeletonGrid() { return `<div class="prov-grid">${Array(6).fill('<div class="panel prov-card"><div class="skeleton" style="width:60%;height:18px;margin-bottom:14px"></div><div class="skeleton" style="height:44px;border-radius:12px"></div></div>').join("")}</div>`; }

  /* ═══ VIEW: Integrations / connections ════════════════════════════════════ */
  function viewIntegrations(mount) {
    const ws = activeWs();
    if (!ws) { mount.innerHTML = previewStrip() + emptyNoWorkspace(); wireCommon(mount); return; }
    if (st("loading") || (state.loading && !state.loaded)) { mount.innerHTML = previewStrip() + head(ws) + skeletonGrid(); wireCommon(mount); return; }
    if (st("error") || state.error) { mount.innerHTML = previewStrip() + head(ws) + errorBlock(state.error || "We couldn't load your connections."); wireCommon(mount); return; }

    const manage = canManage(ws) || !connected();
    if (connected() && !manage) { mount.innerHTML = previewStrip() + head(ws) + notAdmin(ws); wireCommon(mount); return; }

    // Empty preview / first-run: no connections yet (registry still renders as "not connected").
    const conns = st("empty") ? [] : state.integrations;
    const connByProvider = (k) => conns.filter((r) => r.provider === k).sort((a, b) => (a.scope === "workspace" ? -1 : 1))[0] || null;

    const connectedCount = conns.filter((r) => r.status === "connected").length;
    const attentionCount = conns.filter((r) => r.status === "needs_reauth" || r.status === "error").length;
    const lastSweep = conns.map((r) => r.last_health_check).filter(Boolean).sort().pop();

    const kpis = [
      { ico: "check", val: connectedCount, label: "Connected" },
      { ico: "alert", val: attentionCount, label: "Need attention", feat: attentionCount > 0 },
      { ico: "layers", val: REG.PROVIDERS.length, label: "Providers available" },
      { ico: "activity", val: lastSweep ? relTime(lastSweep) : "—", label: "Last health check" },
    ];
    const kpiStrip = `<div class="kpi-strip">${kpis.map((k) => `
      <div class="kpi reveal ${k.feat ? "kpi-featured" : ""}"><div class="kpi-ico">${svg(k.ico, 16)}</div>
        <div class="kpi-val ${typeof k.val === "number" ? "num" : ""}">${esc(k.val)}</div><div class="kpi-label">${k.label}</div></div>`).join("")}</div>`;

    // Category-grouped provider cards (every registry provider shows a card).
    const groups = REG.CATEGORIES.map((cat) => {
      const cards = REG.PROVIDERS.filter((p) => p.category === cat).map((p) => providerCard(p, connByProvider(p.key), manage)).join("");
      return `<div class="cat-block reveal"><div class="cat-head"><span class="cat-name">${esc(cat)}</span><span class="cat-line"></span></div><div class="prov-grid">${cards}</div></div>`;
    }).join("");

    mount.innerHTML = `${previewStrip()}${head(ws)}${kpiStrip}${vaultLaws()}${groups}`;
    wireCommon(mount);
    wireIntegrations(mount, ws, manage);
  }

  function head(ws) {
    return `<div class="page-head reveal"><span class="eyebrow">Module · M41</span>
      <h1 style="margin-top:12px">Credential <em>Vault</em></h1>
      <p class="sub">Every external connection for <b>${esc(ws.name)}</b> in one place. Keys live in
        Supabase <b>Vault</b>, never in the browser — this page holds a reference and a health status,
        and reaches providers only through Edge Functions.</p>
      <div class="freshness" style="margin-top:10px">Secrets in Vault · one access path · health checked hourly by <span class="mono">pg_cron</span></div></div>`;
  }

  // The five vault laws as a premium trust panel (INTEGRATIONS-SPEC §1).
  function vaultLaws() {
    const laws = [
      { ico: "eye", t: "A secret never touches the browser", d: "No key, token, or client secret is ever sent to or stored in front-end code — you only ever see a connection's status." },
      { ico: "link", t: "The row is a reference, not a secret", d: "The integrations table stores a Vault pointer plus health — never ciphertext, never plaintext." },
      { ico: "shield", t: "Only Edge Functions decrypt", d: "Reading a live secret is confined to service-role Edge Functions, after the standard auth check." },
      { ico: "key", t: "One access path", d: "Every module reaches a provider through resolveCredential() — no module hand-rolls credential loading." },
    ];
    return `<div class="vault-laws reveal">
      <div class="vl-head"><span class="vl-ico">${svg("lock", 16)}</span><span>How your credentials are protected</span></div>
      <div class="vl-grid">${laws.map((l) => `<div class="vl-item"><span class="vl-i">${svg(l.ico, 15)}</span><div><div class="vl-t">${esc(l.t)}</div><div class="vl-d">${esc(l.d)}</div></div></div>`).join("")}</div>
    </div>`;
  }

  function providerCard(p, conn, manage) {
    const status = conn ? conn.status : null;
    const scope = conn ? conn.scope : p.scope;
    const scopeBadge = conn
      ? `<span class="scope-badge ${scope}">${scope === "platform" ? "Platform default" : "Workspace"}</span>`
      : `<span class="scope-badge muted">${p.scope === "platform" ? "Platform" : "Workspace"} · default</span>`;
    const used = (p.usedBy || []).slice(0, 4).map((m) => `<span class="used-chip">${esc(m)}</span>`).join("");
    const err = conn && conn.last_error && (status === "error" || status === "needs_reauth")
      ? `<div class="prov-err">${svg("alert", 13)} ${esc(conn.last_error)}</div>` : "";
    const health = conn && conn.last_health_check ? `<span class="prov-health">checked ${esc(relTime(conn.last_health_check))}</span>` : "";

    const actions = manage ? (conn
      ? `<button class="btn btn-ghost btn-sm" data-test="${esc(p.key)}">${svg("activity", 13)} Test</button>
         <button class="btn btn-danger btn-sm" data-disc="${esc(p.key)}">Disconnect</button>`
      : `<button class="btn btn-primary btn-sm" data-connect="${esc(p.key)}" style="color:#fff">${svg(p.auth === "oauth2" ? "link" : "plus", 13)} ${p.auth === "oauth2" ? "Connect" : "Connect"}</button>`) : "";

    return `<div class="panel prov-card ${status ? "is-" + status : "is-off"}" data-prov="${esc(p.key)}">
      <div class="pc-top">
        <span class="pc-logo" data-p="${esc(p.key)}">${esc(initials(p.name))}</span>
        <div class="pc-id"><div class="pc-name">${esc(p.name)}</div><div class="pc-auth">${esc(authLabel(p.auth))}</div></div>
        ${conn ? statusPill(status) : notConnectedPill()}
      </div>
      <div class="pc-meta">${scopeBadge}${health}</div>
      ${err}
      ${used ? `<div class="pc-used"><span class="pu-label">Used by</span>${used}</div>` : ""}
      <div class="pc-actions">${actions || `<span class="pc-readonly">Managed by an admin</span>`}</div>
    </div>`;
  }
  const authLabel = (a) => ({ api_key: "API key", oauth2: "OAuth 2.0", basic: "Basic auth" }[a] || a);

  /* ── Wiring: integrations view ──────────────────────────────────────────── */
  function wireIntegrations(mount, ws, manage) {
    if (!manage) return;
    $$("[data-connect]", mount).forEach((b) => b.addEventListener("click", () => openConnect(ws, REG.PROVIDER_BY_KEY[b.dataset.connect])));
    $$("[data-test]", mount).forEach((b) => b.addEventListener("click", () => testConnection(ws, REG.PROVIDER_BY_KEY[b.dataset.test], b)));
    $$("[data-disc]", mount).forEach((b) => b.addEventListener("click", () => confirmDisconnect(ws, REG.PROVIDER_BY_KEY[b.dataset.disc])));
  }

  /* ── Connect flow (api_key form / oauth2 redirect) ──────────────────────── */
  function openConnect(ws, p) {
    if (!p) return;
    if (p.auth === "oauth2") return openOauthConnect(ws, p);
    const fields = (p.fields || []).map((f) => `
      <div class="form-field full"><label>${esc(fieldLabel(f))}</label>
        <input id="cf_${esc(f)}" type="password" autocomplete="off" spellcheck="false" placeholder="${esc(fieldPlaceholder(f))}"></div>`).join("");
    const { close } = modal(`
      <div class="mc-head"><span class="mc-ico">${svg("key", 18)}</span>
        <div><h3>Connect ${esc(p.name)}</h3><div class="mc-sub">${esc(p.name)} uses an <b>${esc(authLabel(p.auth))}</b>. Enter it once — it goes straight to an Edge Function and into Supabase Vault. It is never stored in this page (Law 1).</div></div>
        <button class="icon-btn mc-close" data-close>✕</button></div>
      <div class="vault-note">${svg("lock", 13)} Stored encrypted in Supabase Vault under <span class="mono">${esc(vaultBase(ws, p))}</span>. The browser never sees it again.</div>
      <div class="form-grid" style="margin-top:14px">${fields}</div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="connGo" style="color:#fff">Connect ${esc(p.name)}</button></div>`);
    $("#connGo").addEventListener("click", async () => {
      const creds = {}; let missing = false;
      (p.fields || []).forEach((f) => { const v = $("#cf_" + f).value.trim(); if (!v) missing = true; creds[f] = v; });
      if (missing) { toast("Fill every field", "danger"); return; }
      const go = $("#connGo"); go.disabled = true; go.textContent = "Connecting…";
      if (!connected()) {
        state.integrations.push({ provider: p.key, auth_type: p.auth, scope: "workspace", status: "connected", vault_secret_name: vaultBase(ws, p), last_health_check: new Date().toISOString(), last_error: null, token_expires_at: null });
        close(); toast(`${p.name} connected (mockup)`, "success"); render(); return;
      }
      const { data, error } = await ensureClient().functions.invoke("integrations-connect", { body: { workspace_id: ws.id, provider: p.key, credentials: creds } });
      if (error || (data && data.ok === false)) { go.disabled = false; go.textContent = `Connect ${p.name}`; toast((data && data.message) || error?.message || "Connect failed", "danger"); return; }
      close(); toast(`${p.name} connected`, "success"); await boot();
    });
  }

  function openOauthConnect(ws, p) {
    const { close } = modal(`
      <div class="mc-head"><span class="mc-ico">${svg("link", 18)}</span>
        <div><h3>Connect ${esc(p.name)}</h3><div class="mc-sub">${esc(p.name)} uses <b>OAuth 2.0</b>. You'll be redirected to ${esc(p.name)} to approve access${p.scopes && p.scopes.length ? ` (${esc(p.scopes.join(", "))})` : ""}; the token is exchanged server-side and stored in Vault. AiMindShare never sees your password.</div></div>
        <button class="icon-btn mc-close" data-close>✕</button></div>
      <div class="vault-note">${svg("lock", 13)} The callback stores the token bundle in Vault under <span class="mono">${esc(vaultBase(ws, p))}</span>. Live ${esc(p.name)} OAuth is wired at its own session (this slice scaffolds the flow).</div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="oauthGo" style="color:#fff">${svg("link", 14)} Continue with ${esc(p.name)}</button></div>`);
    $("#oauthGo").addEventListener("click", async () => {
      const go = $("#oauthGo"); go.disabled = true; go.textContent = "Starting…";
      if (!connected()) { close(); toast(`${p.name} OAuth is scaffolded — wired live at its session`, "info"); return; }
      const { data, error } = await ensureClient().functions.invoke("integrations-connect", { body: { workspace_id: ws.id, provider: p.key } });
      if (error || (data && data.ok === false)) { go.disabled = false; go.textContent = `Continue with ${p.name}`; toast((data && data.message) || error?.message || "Could not start OAuth", "danger"); return; }
      if (data?.data?.consent_url) { toast("Redirecting to " + p.name + "…", "info"); location.href = data.data.consent_url; return; }
      close(); toast("OAuth flow started", "info");
    });
  }

  async function testConnection(ws, p, btn) {
    if (!p) return;
    const label = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.innerHTML = `${svg("refresh", 13)} Testing…`; }
    if (!connected()) {
      setTimeout(() => { const conn = connFor(p.key); if (conn) { conn.status = "connected"; conn.last_health_check = new Date().toISOString(); conn.last_error = null; } toast(`${p.name} is healthy (mockup)`, "success"); render(); }, 550);
      return;
    }
    const { data, error } = await ensureClient().functions.invoke("integrations-test", { body: { workspace_id: ws.id, provider: p.key } });
    if (btn) { btn.disabled = false; btn.innerHTML = label; }
    if (error || (data && data.ok === false)) { toast((data && data.message) || error?.message || `${p.name} test failed`, "danger"); await boot(); return; }
    toast(`${p.name}: ${data?.data?.status || "checked"}`, data?.data?.status === "connected" ? "success" : "danger");
    await boot();
  }

  function confirmDisconnect(ws, p) {
    if (!p) return;
    const { close } = modal(`
      <div class="mc-head"><span class="mc-ico" style="background:var(--status-danger)">${svg("trash", 18)}</span>
        <div><h3>Disconnect ${esc(p.name)}?</h3><div class="mc-sub">This deletes the credential from Vault and removes the connection. Any module that uses ${esc(p.name)} will show a “connect” prompt until it's reconnected.</div></div>
        <button class="icon-btn mc-close" data-close>✕</button></div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-danger" id="discGo">Disconnect</button></div>`);
    $("#discGo").addEventListener("click", async () => {
      const go = $("#discGo"); go.disabled = true; go.textContent = "Disconnecting…";
      if (!connected()) { state.integrations = state.integrations.filter((r) => r.provider !== p.key); close(); toast(`${p.name} disconnected (mockup)`, "success"); render(); return; }
      const { data, error } = await ensureClient().functions.invoke("integrations-disconnect", { body: { workspace_id: ws.id, provider: p.key } });
      if (error || (data && data.ok === false)) { go.disabled = false; go.textContent = "Disconnect"; toast((data && data.message) || error?.message || "Disconnect failed", "danger"); return; }
      close(); toast(`${p.name} disconnected`, "success"); await boot();
    });
  }

  const vaultBase = (ws, p) => (p.scope === "platform" ? `plat__${p.key}` : `ws_${ws.id}__${p.key}`);
  const fieldLabel = (f) => f.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const fieldPlaceholder = (f) => ({ account_sid: "AC…", login: "account@example.com" }[f] || "••••••••••••••••");

  /* ── Router + render ────────────────────────────────────────────────────── */
  function render() {
    const app = $("#app");
    app.innerHTML = shell("integrations", "");
    afterShell();
    viewIntegrations($(".content-inner"));
    if (!reduce) nextTick(() => document.body.classList.add("js-ready"));
    else document.body.classList.add("js-ready");
  }

  /* ── Wiring: shell-level ────────────────────────────────────────────────── */
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
    const cur = activeWs();
    const item = (w) => `<div class="pop-item ${w.kind === "sub" ? "sub" : ""}" data-switch="${w.id}"><span class="ws-badge">${esc(initials(w.name))}</span><div style="min-width:0"><div class="pi-name">${esc(w.name)}</div><div class="pi-sub">${w.kind === "agency" ? "Agency" : "Sub-account"} · ${esc(w.role)}</div></div>${cur && cur.id === w.id ? `<span class="pi-check">${svg("check", 15)}</span>` : ""}</div>`;
    const pop = el("div", "pop");
    pop.innerHTML = `<div class="pop-label">Switch workspace</div>${active.map(item).join("")}`;
    document.body.appendChild(pop);
    const rect = anchor.getBoundingClientRect();
    pop.style.left = rect.left + "px"; pop.style.top = rect.bottom + 8 + "px"; pop.style.minWidth = Math.max(260, rect.width) + "px";
    nextTick(() => pop.classList.add("open"));
    const close = (e) => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener("click", close); } };
    setTimeout(() => document.addEventListener("click", close), 0);
    $$("[data-switch]", pop).forEach((it) => it.addEventListener("click", async () => { setActive(it.dataset.switch); pop.remove(); toast("Switched workspace"); if (connected()) { try { await loadIntegrations(); } catch (e) {} } else { const ws = activeWs(); state.integrations = (MOCK.integrations[ws.id] || []).map((i) => ({ ...i })); } render(); }));
  }

  /* ── Wiring: common ─────────────────────────────────────────────────────── */
  function wireCommon(mount) {
    $$("[data-hash]", mount).forEach((n) => n.addEventListener("click", () => (location.hash = n.dataset.hash)));
    $$("[data-preview]", mount).forEach((b) => b.addEventListener("click", () => { state.previewState = b.dataset.preview; render(); }));
    const retry = $("#retryBtn", mount); if (retry) retry.addEventListener("click", () => { state.previewState = "default"; boot(); });
  }

  /* ── Modal ──────────────────────────────────────────────────────────────── */
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

  /* ── Go ─────────────────────────────────────────────────────────────────── */
  window.addEventListener("hashchange", render);
  boot();
})();
