/* m44-admin.js — AiMindShare Module M44 · Admin Basics (Platform Ops).
   The super-admin console. Every tenant table is RLS-scoped to membership, so a
   platform admin reads/writes ACROSS workspaces only through is_platform_admin()-
   gated SECURITY DEFINER RPCs (D-078) — the browser never touches raw cross-tenant
   tables. Hash-routed on the shared M01/M02 shell: Overview · Directory · Jobs ·
   Flags. Impersonation opens an audited, 30-min session via the admin-impersonate
   Edge Function; the banner shows while active; every admin action is written to the
   append-only admin_audit_log (D-079). The /admin surface is gated by the
   app_metadata.platform_admin claim client-side (cosmetic — the RPCs are the real
   wall); non-admins get a Restricted screen. No secrets in the browser (Law 3):
   anon key only. With no project connected the whole app renders as a high-fidelity
   mockup with a default/empty/loading/error/success preview switcher (honest Gate-5). */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const initials = (s) => (s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const fmt = (n) => (n == null || isNaN(n)) ? "—" : Number(n).toLocaleString("en-US");
  const money = (n) => "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const relTime = (d) => {
    if (!d) return "never";
    const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago"; return Math.floor(s / 86400) + "d ago";
  };
  const dateShort = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

  /* ── Inline icons (DESIGN §9) ────────────────────────────────────────────── */
  const P = {
    grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
    building: "M3 21h18M6 21V7l6-4 6 4v14M10 9h.01M14 9h.01M10 13h.01M14 13h.01M10 17h.01M14 17h.01",
    users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    layers: "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
    flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
    activity: "M22 12h-4l-3 9L9 3l-3 9H2",
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4",
    search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
    refresh: "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
    check: "M20 6 9 17l-5-5", plus: "M12 5v14M5 12h14", chev: "M6 9l6 6 6-6",
    alert: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
    eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    pause: "M6 4h4v16H6zM14 4h4v16h-4z", play: "M5 3l14 9-14 9V3z",
    x: "M18 6 6 18M6 6l12 12", dollar: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
    zap: "M13 2L3 14h9l-1 8 10-12h-9l1-8z", clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  };
  const svg = (name, size = 17) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${P[name] || ""}"/></svg>`;

  /* ── Theme + atmosphere (dark = no stars; app.css hides #starField in dark) ── */
  const THEME_KEY = "aimindshare-theme";
  const root = document.documentElement;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const setTheme = (t) => { root.setAttribute("data-theme", t); try { localStorage.setItem(THEME_KEY, t); } catch (e) {} const i = $("#themeIco"); if (i) i.textContent = t === "dark" ? "☀" : "☾"; };
  setTheme((() => { try { return localStorage.getItem(THEME_KEY) || "light"; } catch (e) { return "light"; } })());
  (function stars() {
    const field = $("#starField"); if (!field || reduce) return;
    for (let i = 0; i < 42; i++) { const s = el("div", "star"); s.style.left = Math.random() * 100 + "%"; s.style.top = Math.random() * 100 + "%"; s.style.setProperty("--tw", (3 + Math.random() * 7).toFixed(1) + "s"); s.style.setProperty("--td", (Math.random() * 10).toFixed(1) + "s"); field.appendChild(s); }
  })();

  /* ── Config + Supabase client (anon key only, Law 3) ─────────────────────── */
  const CFG_KEY = "aimindshare-supabase";
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
  async function rpc(name, args) { const c = ensureClient(); const { data, error } = await c.rpc(name, args || {}); if (error) throw error; return data; }

  /* ── Connect drawer (same contract as M01/M02/M41) ───────────────────────── */
  const drawer = $("#drawer"), scrim = $("#scrim");
  const openDrawer = () => { const c = getCfg(); if (c) { $("#inpUrl").value = c.url; $("#inpAnon").value = c.anon || ""; } drawer.classList.add("open"); scrim.classList.add("open"); };
  const closeDrawer = () => { drawer.classList.remove("open"); scrim.classList.remove("open"); };
  $("#closeDrawer").addEventListener("click", closeDrawer);
  scrim.addEventListener("click", closeDrawer);
  $("#saveCfg").addEventListener("click", async () => {
    const url = $("#inpUrl").value.trim(), anon = $("#inpAnon").value.trim();
    if (!url) { $("#inpUrl").focus(); return; }
    try { localStorage.setItem(CFG_KEY, JSON.stringify({ url, anon })); } catch (e) {}
    client = null; closeDrawer(); await boot();
  });
  $("#clearCfg").addEventListener("click", async () => { try { localStorage.removeItem(CFG_KEY); } catch (e) {} $("#inpUrl").value = ""; $("#inpAnon").value = ""; client = null; await boot(); });

  /* ── Toast + modal ───────────────────────────────────────────────────────── */
  function toast(msg, kind = "info") {
    const ico = kind === "success" ? "✓" : kind === "danger" ? "⚠" : "◈";
    const t = el("div", "toast " + kind, `<span class="t-ico">${ico}</span><div>${esc(msg)}</div>`);
    $("#toasts").appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateX(20px)"; setTimeout(() => t.remove(), 300); }, 3200);
  }
  function openModal(html) { $("#modalRoot").innerHTML = `<div class="scrim open" id="mScrim"></div><div class="modal open" role="dialog" aria-modal="true">${html}</div>`; $("#mScrim").addEventListener("click", closeModal); }
  function closeModal() { $("#modalRoot").innerHTML = ""; }

  /* ── Mockup data (mockup mode only — never a live code path; sample data) ─── */
  const MOCK = {
    admin: { id: "you", email: "ops@aimindshare.com", name: "Platform Ops", platform: true },
    kpis: { workspaces: 128, users: 412, active_subs: 96, mrr: 18740, jobs_queued: 7, jobs_running: 2, jobs_failed: 3 },
    workspaces: [
      { id: "w-acme", name: "Acme Agency", parent_workspace_id: null, status: "active", billing_state: "active", plan_name: "Agency", sub_status: "active", member_count: 12, created_at: "2026-02-14" },
      { id: "w-dental", name: "Acme Dental", parent_workspace_id: "w-acme", status: "active", billing_state: "trial_expired", plan_name: "Pro", sub_status: "trialing", member_count: 4, created_at: "2026-05-02" },
      { id: "w-beacon", name: "Beacon Studio", parent_workspace_id: null, status: "suspended", billing_state: "past_due", plan_name: "Pro", sub_status: "past_due", member_count: 6, created_at: "2026-03-21" },
      { id: "w-north", name: "Northstar Agency", parent_workspace_id: null, status: "active", billing_state: "active", plan_name: "Enterprise", sub_status: "active", member_count: 21, created_at: "2025-11-08" },
    ],
    users: [
      { id: "u-aisha", email: "aisha@northstar.agency", name: "Aisha Rahman", membership_count: 3, created_at: "2025-11-08" },
      { id: "u-omar", email: "omar@acme.co", name: "Omar Farouk", membership_count: 2, created_at: "2026-02-14" },
      { id: "u-lena", email: "lena@beacon.studio", name: "Lena Cho", membership_count: 1, created_at: "2026-03-21" },
    ],
    jobs: [
      { id: "j1", workspace_name: "Acme Agency", type: "contact.import", status: "running", attempts: 1, run_after: new Date(Date.now() - 4 * 60000).toISOString(), error: null },
      { id: "j2", workspace_name: "Acme Dental", type: "notification.digest", status: "queued", attempts: 0, run_after: new Date(Date.now() + 5 * 60000).toISOString(), error: null },
      { id: "j3", workspace_name: "Beacon Studio", type: "gdpr.export", status: "failed", attempts: 3, run_after: new Date(Date.now() - 22 * 60000).toISOString(), error: "storage upload timeout" },
      { id: "j4", workspace_name: "Northstar Agency", type: "integration.health_check", status: "done", attempts: 1, run_after: new Date(Date.now() - 61 * 60000).toISOString(), error: null },
    ],
    flags: [
      { key: "voice.rollout", default_on: false, category: "Beta", description: "M34 AI Voice Agents gated rollout" },
      { key: "marketplace.enabled", default_on: false, category: "Beta", description: "M39 Marketplace surface" },
      { key: "video.studio", default_on: true, category: "Beta", description: "M25 Video Studio renders" },
      { key: "ai.generation", default_on: true, category: "Kill-switch", description: "Master switch for all AI generation (incident kill-switch)" },
    ],
    audit: [
      { action: "flag.set", target_type: "flag", target_id: "video.studio", actor: "Platform Ops", created_at: new Date(Date.now() - 8 * 60000).toISOString() },
      { action: "workspace.suspend", target_type: "workspace", target_id: "Beacon Studio", actor: "Platform Ops", created_at: new Date(Date.now() - 90 * 60000).toISOString() },
      { action: "impersonate.start", target_type: "user", target_id: "omar@acme.co", actor: "Platform Ops", created_at: new Date(Date.now() - 3 * 3600000).toISOString() },
    ],
  };

  /* ── App state ──────────────────────────────────────────────────────────── */
  const state = {
    booted: false, loading: false, error: null, isAdmin: false, user: null,
    previewState: "default", route: "overview", dirTab: "workspaces", jobFilter: "",
    kpis: null, audit: [], workspaces: [], users: [], jobs: [], flags: [], impersonation: null,
  };
  const PREVIEW_STATES = ["default", "empty", "loading", "error", "success"];
  const st = (name) => !connected() && state.previewState === name;

  /* ── Boot / gate ────────────────────────────────────────────────────────── */
  async function boot() {
    if (connected()) {
      try {
        const c = ensureClient();
        const { data: { user } } = await c.auth.getUser();
        state.user = user;
        state.isAdmin = !!(user && user.app_metadata && user.app_metadata.platform_admin === true);
      } catch (e) { state.user = null; state.isAdmin = false; }
    } else {
      state.user = MOCK.admin; state.isAdmin = true;   // mockup mode renders the console
    }
    state.booted = true;
    await route();
  }

  /* ── Router ─────────────────────────────────────────────────────────────── */
  const ROUTES = { "": "overview", "overview": "overview", "directory": "directory", "jobs": "jobs", "flags": "flags" };
  function currentRoute() {
    const h = (location.hash || "").replace(/^#\/?/, "").replace(/^admin\/?/, "");
    const key = h.split("/")[0] || "";
    return ROUTES[key] || "overview";
  }
  async function route() {
    state.route = currentRoute();
    render();                          // paint shell + a loading region
    if (!connected() || !state.isAdmin) return;
    await loadRoute(state.route);
    render();
  }
  window.addEventListener("hashchange", route);

  async function loadRoute(r) {
    state.loading = true; state.error = null; render();
    try {
      if (r === "overview") {
        state.kpis = await rpc("admin_platform_kpis");
        const c = ensureClient();
        const { data } = await c.from("admin_audit_log").select("action,target_type,target_id,actor_user_id,created_at").order("created_at", { ascending: false }).limit(20);
        state.audit = (data || []).map((a) => ({ ...a, actor: a.actor_user_id }));
      } else if (r === "directory") {
        state.workspaces = await rpc("admin_list_workspaces", {});
        state.users = await rpc("admin_list_users", {});
      } else if (r === "jobs") {
        state.jobs = await rpc("admin_list_jobs", state.jobFilter ? { p_status: state.jobFilter } : {});
      } else if (r === "flags") {
        const c = ensureClient();
        const { data, error } = await c.from("feature_flags").select("*").order("category", { ascending: true });
        if (error) throw error;
        state.flags = data || [];
      }
    } catch (e) { state.error = e.message || String(e); }
    state.loading = false;
  }

  /* ── Shell (rail + topbar) ──────────────────────────────────────────────── */
  const NAV = [
    { key: "overview", label: "Overview", ico: "grid", hash: "#/admin" },
    { key: "directory", label: "Directory", ico: "building", hash: "#/admin/directory" },
    { key: "jobs", label: "Jobs", ico: "activity", hash: "#/admin/jobs" },
    { key: "flags", label: "Feature flags", ico: "flag", hash: "#/admin/flags" },
  ];
  function shell(content) {
    const nav = NAV.map((n) => `<div class="nav-item ${n.key === state.route ? "active" : ""}" data-hash="${n.hash}"><span class="ni-ico">${svg(n.ico)}</span><span>${n.label}</span></div>`).join("");
    const jf = state.kpis ? (Number(state.kpis.jobs_queued || 0) + Number(state.kpis.jobs_running || 0)) : (connected() ? 0 : MOCK.kpis.jobs_queued + MOCK.kpis.jobs_running);
    return `
      <aside class="rail" id="rail">
        <div class="brand"><span class="mark">✦</span><span><b>AiMind</b><em>Share</em></span></div>
        <div class="nav-group"><div class="nav-group-label">Platform</div>${nav}</div>
        <div class="rail-foot">M44 · Admin Ops</div>
      </aside>
      <header class="tbar">
        <button class="icon-btn rail-burger" id="railBurger" aria-label="Menu">☰</button>
        <span class="admin-scope"><span class="as-ico">${svg("shield", 14)}</span> Super-admin</span>
        <div class="tb-search"><span>${svg("search", 15)}</span><span class="tbs-label">Search…</span><span class="kbd">⌘K</span></div>
        <div class="spacer"></div>
        <button class="jobs-chip" id="jobsChip" title="Job queue"><span class="jc-dot"></span><span class="num">${jf}</span> jobs</button>
        <span class="pill ${connected() ? "success" : "plain"}" id="connPill">${connected() ? "connected" : "mockup mode"}</span>
        <button class="btn btn-ghost btn-sm" id="openConnect2">Connect</button>
        <button class="icon-btn" id="themeToggle" title="Toggle theme" aria-label="Toggle theme"><span id="themeIco">☾</span></button>
        <span class="avatar" title="${esc(state.user?.email || "")}">${esc(initials(state.user?.name || state.user?.email || "Ops"))}</span>
      </header>
      <main class="content"><div class="content-inner">${impersonationBanner()}${content}</div></main>`;
  }

  function impersonationBanner() {
    const im = state.impersonation; if (!im) return "";
    return `<div class="imp-banner reveal"><span class="ib-ico">${svg("eye", 15)}</span>
      <div class="ib-txt">Viewing as <b>${esc(im.email || im.target_user_id)}</b> — ${esc(im.reason)}
        <span class="ib-exp">expires ${esc(relTime(im.expires_at).replace("ago", "").trim()) || "in 30m"}</span></div>
      <button class="btn btn-ghost btn-sm" id="endImp">Return to admin</button></div>`;
  }

  function previewStrip() {
    if (connected()) return "";
    return `<div class="mock-note"><span class="mn-ico">◈</span><b>Mockup mode · sample data.</b>
      Connect a project to run these flows live. Preview state:
      ${PREVIEW_STATES.map((s) => `<button class="link ${state.previewState === s ? "on" : ""}" data-preview="${s}">${s}</button>`).join(" ")}</div>`;
  }

  /* ── Shared blocks ──────────────────────────────────────────────────────── */
  const pageHead = (eyebrow, title, em, sub) => `<div class="page-head reveal"><span class="eyebrow">${esc(eyebrow)}</span>
    <h1 style="margin-top:12px">${esc(title)} <em>${esc(em)}</em></h1><p class="sub">${sub}</p></div>`;
  const errorBlock = (msg) => `<div class="panel" style="border-color:rgba(196,97,78,.4)"><div class="empty-state"><div class="es-ico" style="background:rgba(196,97,78,.12);color:var(--status-danger)">⚠</div><h3>Something went wrong</h3><p>${esc(msg)}</p><button class="btn btn-ghost es-cta" id="retryBtn">Retry</button></div></div>`;
  const emptyBlock = (ico, title, msg) => `<div class="panel"><div class="empty-state"><div class="es-ico">${svg(ico, 22)}</div><h3>${esc(title)}</h3><p>${esc(msg)}</p></div></div>`;
  const skeletonRows = (n = 6) => `<div class="panel"><div class="tbl-skel">${Array(n).fill('<div class="skeleton" style="height:40px;border-radius:10px;margin-bottom:10px"></div>').join("")}</div></div>`;
  const statusPill = (s) => {
    const m = { active: "success", connected: "success", done: "success", trialing: "attention", queued: "attention", running: "info", past_due: "danger", trial_expired: "danger", failed: "danger", suspended: "danger", cancelled: "plain", canceled: "plain" }[s] || "plain";
    return `<span class="pill ${m}">${esc(s || "—")}</span>`;
  };

  /* ═══ VIEW: Overview ══════════════════════════════════════════════════════ */
  function viewOverview(mount) {
    if (loadingOrError(mount, "overview")) return;
    const k = (!connected() && st("empty")) ? { workspaces: 0, users: 0, active_subs: 0, mrr: 0, jobs_queued: 0, jobs_running: 0, jobs_failed: 0 }
      : (connected() ? (state.kpis || {}) : MOCK.kpis);
    const audit = (!connected() && st("empty")) ? [] : (connected() ? state.audit : MOCK.audit);
    const tiles = [
      { ico: "building", val: fmt(k.workspaces), label: "Workspaces" },
      { ico: "users", val: fmt(k.users), label: "Users" },
      { ico: "check", val: fmt(k.active_subs), label: "Active subscriptions" },
      { ico: "dollar", val: money(k.mrr), label: "MRR (est.)" },
      { ico: "clock", val: fmt(k.jobs_queued), label: "Jobs queued" },
      { ico: "zap", val: fmt(k.jobs_running), label: "Jobs running" },
      { ico: "alert", val: fmt(k.jobs_failed), label: "Jobs failed", feat: Number(k.jobs_failed) > 0 },
    ];
    const strip = `<div class="kpi-strip kpi-7">${tiles.map((t) => `<div class="kpi reveal ${t.feat ? "kpi-featured" : ""}"><div class="kpi-ico">${svg(t.ico, 16)}</div><div class="kpi-val num">${esc(t.val)}</div><div class="kpi-label">${t.label}</div></div>`).join("")}</div>`;
    const feed = audit.length ? `<div class="feed">${audit.map((a) => `<div class="feed-row"><span class="fr-ico">${svg(auditIco(a.action), 14)}</span>
        <div class="fr-body"><span class="fr-act">${esc(a.action)}</span> <span class="fr-tgt">${esc(a.target_id || a.target_type || "")}</span></div>
        <span class="fr-time num">${esc(relTime(a.created_at))}</span></div>`).join("")}</div>`
      : `<div class="empty-inline">No admin activity yet.</div>`;
    mount.innerHTML = `${previewStrip()}${pageHead("Module · M44", "Platform", "Overview", "Health of the whole platform at a glance — tenancy, revenue, and the async control plane. Every number is a cross-tenant read through an <span class=\"mono\">is_platform_admin()</span>-gated function.")}
      ${strip}
      <div class="panel"><div class="panel-head"><h3>Recent admin activity</h3><span class="ph-sub">append-only audit ledger</span></div>${feed}</div>`;
    wireCommon(mount);
  }
  const auditIco = (a) => a?.startsWith("flag") ? "flag" : a?.startsWith("impersonate") ? "eye" : a?.startsWith("job") ? "activity" : a?.startsWith("workspace") ? "building" : "shield";

  /* ═══ VIEW: Directory ═════════════════════════════════════════════════════ */
  function viewDirectory(mount) {
    if (loadingOrError(mount, "directory")) return;
    const tab = state.dirTab;
    const tabs = `<div class="seg"><button class="seg-btn ${tab === "workspaces" ? "on" : ""}" data-tab="workspaces">Workspaces</button><button class="seg-btn ${tab === "users" ? "on" : ""}" data-tab="users">Users</button></div>`;
    let body;
    if (tab === "workspaces") {
      const rows = (!connected() && st("empty")) ? [] : (connected() ? state.workspaces : MOCK.workspaces);
      body = rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Workspace</th><th>Plan</th><th>Subscription</th><th class="num">Members</th><th>Created</th><th>Status</th><th></th></tr></thead><tbody>
        ${rows.map((w) => `<tr>
          <td><div class="cell-main">${esc(w.name)}</div><div class="cell-sub">${w.parent_workspace_id ? "Sub-account" : "Agency"}</div></td>
          <td>${esc(w.plan_name || "—")}</td><td>${statusPill(w.sub_status)}</td>
          <td class="num">${fmt(w.member_count)}</td><td class="num">${dateShort(w.created_at)}</td>
          <td>${statusPill(w.status)}</td>
          <td class="row-actions"><button class="btn btn-ghost btn-sm" data-ws-detail="${esc(w.id)}">Manage</button></td></tr>`).join("")}
        </tbody></table></div>` : emptyBlock("building", "No workspaces yet", "Provisioned agencies and sub-accounts will appear here.");
    } else {
      const rows = (!connected() && st("empty")) ? [] : (connected() ? state.users : MOCK.users);
      body = rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>User</th><th>Email</th><th class="num">Memberships</th><th>Joined</th></tr></thead><tbody>
        ${rows.map((u) => `<tr><td><div class="cell-main">${esc(u.name || "—")}</div></td><td class="mono-cell">${esc(u.email)}</td><td class="num">${fmt(u.membership_count)}</td><td class="num">${dateShort(u.created_at)}</td></tr>`).join("")}
        </tbody></table></div>` : emptyBlock("users", "No users yet", "Signed-up users across every workspace will appear here.");
    }
    mount.innerHTML = `${previewStrip()}${pageHead("Module · M44", "Agency & workspace", "Directory", "Every workspace, agency, and user on the platform. Reads are cross-tenant through gated functions; actions are audited.")}
      <div class="dir-bar">${tabs}<div class="tb-search sm"><span>${svg("search", 14)}</span><input class="dir-search" id="dirSearch" placeholder="Search ${tab}…"></div></div>${body}`;
    wireCommon(mount);
    wireDirectory(mount);
  }

  function openWorkspaceDrawer(w) {
    const flagRows = (connected() ? state.flags : MOCK.flags);
    openModal(`<div class="modal-head"><h3>${esc(w.name)}</h3><button class="icon-btn" id="mClose">${svg("x", 16)}</button></div>
      <div class="ws-detail">
        <div class="wd-grid">
          <div><span class="wd-k">Plan</span><span class="wd-v">${esc(w.plan_name || "—")}</span></div>
          <div><span class="wd-k">Subscription</span><span class="wd-v">${statusPill(w.sub_status)}</span></div>
          <div><span class="wd-k">Members</span><span class="wd-v num">${fmt(w.member_count)}</span></div>
          <div><span class="wd-k">Billing</span><span class="wd-v">${statusPill(w.billing_state)}</span></div>
          <div><span class="wd-k">Status</span><span class="wd-v">${statusPill(w.status)}</span></div>
          <div><span class="wd-k">Created</span><span class="wd-v num">${dateShort(w.created_at)}</span></div>
        </div>
        <div class="wd-section"><h4>Actions</h4><div class="wd-actions">
          ${w.status === "suspended"
            ? `<button class="btn btn-primary btn-sm" data-unsuspend="${esc(w.id)}" style="color:#fff">${svg("play", 13)} Unsuspend</button>`
            : `<button class="btn btn-danger btn-sm" data-suspend="${esc(w.id)}">${svg("pause", 13)} Suspend</button>`}
          <button class="btn btn-ghost btn-sm" data-impersonate="${esc(w.id)}">${svg("eye", 13)} Impersonate owner</button>
        </div><p class="wd-note">Suspend flips the workspace to read-only status and writes an audit entry. Impersonation opens a 30-min audited session.</p></div>
        <div class="wd-section"><h4>Feature overrides</h4><div class="wd-overrides">
          ${flagRows.map((f) => `<label class="ovr-row"><span>${esc(f.key)}</span>
            <select class="ovr-sel" data-ovr="${esc(f.key)}" data-ws="${esc(w.id)}"><option value="">default (${f.default_on ? "on" : "off"})</option><option value="on">force on</option><option value="off">force off</option></select></label>`).join("")}
        </div></div>
      </div>`);
    $("#mClose").addEventListener("click", closeModal);
    wireWorkspaceDrawer(w);
  }

  /* ═══ VIEW: Jobs monitor ══════════════════════════════════════════════════ */
  function viewJobs(mount) {
    if (loadingOrError(mount, "jobs")) return;
    const all = (!connected() && st("empty")) ? [] : (connected() ? state.jobs : MOCK.jobs);
    const rows = state.jobFilter ? all.filter((j) => j.status === state.jobFilter) : all;
    const counts = { queued: 0, running: 0, failed: 0, done: 0, cancelled: 0 };
    all.forEach((j) => { counts[j.status] = (counts[j.status] || 0) + 1; });
    const chips = ["", "queued", "running", "failed", "done"].map((s) => `<button class="fchip ${state.jobFilter === s ? "on" : ""}" data-jfilter="${s}">${s || "all"}${s ? ` <span class="num">${counts[s] || 0}</span>` : ""}</button>`).join("");
    const body = rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Type</th><th>Workspace</th><th>Status</th><th class="num">Attempts</th><th>Run after</th><th>Error</th><th></th></tr></thead><tbody>
      ${rows.map((j) => `<tr>
        <td class="mono-cell">${esc(j.type)}</td><td>${esc(j.workspace_name || "—")}</td><td>${statusPill(j.status)}</td>
        <td class="num">${fmt(j.attempts)}</td><td class="num">${esc(relTime(j.run_after))}</td>
        <td class="cell-err">${esc(j.error || "")}</td>
        <td class="row-actions">${j.status === "failed" ? `<button class="btn btn-ghost btn-sm" data-retry="${esc(j.id)}">${svg("refresh", 13)} Retry</button><button class="btn btn-danger btn-sm" data-discard="${esc(j.id)}">Discard</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div>` : emptyBlock("check", "Queue is clear", "No jobs match this filter. The queue is a live read of public.jobs across every workspace.");
    mount.innerHTML = `${previewStrip()}${pageHead("Module · M44", "Async control", "Plane", "Every job across every workspace — <span class=\"mono\">public.jobs</span> on the locked stack (no BullMQ/Redis). Retry re-queues a failed job; discard marks it failed.")}
      <div class="dir-bar"><div class="fchips">${chips}</div><button class="btn btn-ghost btn-sm" id="jobRefresh">${svg("refresh", 13)} Refresh</button></div>${body}`;
    wireCommon(mount);
    wireJobs(mount);
  }

  /* ═══ VIEW: Feature flags ═════════════════════════════════════════════════ */
  function viewFlags(mount) {
    if (loadingOrError(mount, "flags")) return;
    const rows = (!connected() && st("empty")) ? [] : (connected() ? state.flags : MOCK.flags);
    const byCat = {}; rows.forEach((f) => { (byCat[f.category || "Uncategorized"] = byCat[f.category || "Uncategorized"] || []).push(f); });
    const groups = Object.keys(byCat).length ? Object.keys(byCat).map((cat) => `<div class="cat-block reveal"><div class="cat-head"><span class="cat-name">${esc(cat)}</span><span class="cat-line"></span></div>
      <div class="panel flag-list">${byCat[cat].map((f) => `<div class="flag-row">
        <div class="fl-id"><div class="fl-key mono-cell">${esc(f.key)}</div><div class="fl-desc">${esc(f.description || "")}</div></div>
        <label class="switch"><input type="checkbox" data-flag="${esc(f.key)}" ${f.default_on ? "checked" : ""}><span class="track"></span></label></div>`).join("")}</div></div>`).join("")
      : emptyBlock("flag", "No feature flags", "Add a flag to gate a beta module or wire a kill-switch.");
    mount.innerHTML = `${previewStrip()}${pageHead("Module · M44", "Feature", "Flags", "Global defaults plus per-workspace overrides. Flip a default to kill-switch a feature platform-wide; set an override from a workspace's Manage panel.")}
      <div class="dir-bar"><div></div><button class="btn btn-primary btn-sm" id="addFlag" style="color:#fff">${svg("plus", 13)} New flag</button></div>${groups}`;
    wireCommon(mount);
    wireFlags(mount);
  }

  /* ── Restricted (non-admin) ─────────────────────────────────────────────── */
  function viewRestricted(mount) {
    mount.innerHTML = `<div class="restricted"><div class="rs-ico">${svg("lock", 30)}</div>
      <h1>Restricted</h1><p>The platform admin console is limited to super-admins. Your account doesn't carry the <span class="mono">platform_admin</span> claim.</p>
      <p class="rs-note">This screen is cosmetic — every admin query is independently gated server-side by <span class="mono">is_platform_admin()</span>.</p>
      <a class="btn btn-ghost" href="m01-workspaces-and-multi-tenancy.html#/workspaces">Back to your workspaces</a></div>`;
  }

  /* ── Loading/error gate helper for views ────────────────────────────────── */
  function loadingOrError(mount, r) {
    if (st("loading") || (connected() && state.loading)) { mount.innerHTML = previewStrip() + skeletonRows(); wireCommon(mount); return true; }
    if (st("error") || (connected() && state.error)) { mount.innerHTML = previewStrip() + errorBlock(state.error || "We couldn't load this view."); wireCommon(mount); return true; }
    return false;
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */
  function render() {
    const app = $("#app");
    if (state.booted && connected() && !state.isAdmin) { app.innerHTML = shell(""); $(".content-inner", app).innerHTML = ""; viewRestricted($(".content-inner", app)); wireShell(app); return; }
    app.innerHTML = shell(`<div id="viewMount"></div>`);
    const mount = $("#viewMount", app);
    ({ overview: viewOverview, directory: viewDirectory, jobs: viewJobs, flags: viewFlags }[state.route] || viewOverview)(mount);
    wireShell(app);
    if (!reduce) requestAnimationFrame(() => $$(".reveal", app).forEach((n, i) => setTimeout(() => n.classList.add("in"), 24 * i)));
    else $$(".reveal", app).forEach((n) => n.classList.add("in"));
  }

  /* ── Wiring ─────────────────────────────────────────────────────────────── */
  function wireShell(root) {
    $$(".nav-item", root).forEach((n) => n.addEventListener("click", () => { location.hash = n.dataset.hash; }));
    const bt = $("#themeToggle", root); if (bt) bt.addEventListener("click", () => setTheme(root.querySelector ? (document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark") : "light"));
    const oc = $("#openConnect2", root); if (oc) oc.addEventListener("click", openDrawer);
    const rb = $("#railBurger", root); if (rb) rb.addEventListener("click", () => $("#rail").classList.toggle("open"));
    const ei = $("#endImp", root); if (ei) ei.addEventListener("click", endImpersonation);
  }
  function wireCommon(mount) {
    $$("[data-preview]", mount).forEach((b) => b.addEventListener("click", () => { state.previewState = b.dataset.preview; render(); }));
    const rt = $("#retryBtn", mount); if (rt) rt.addEventListener("click", () => route());
  }
  function wireDirectory(mount) {
    $$("[data-tab]", mount).forEach((b) => b.addEventListener("click", () => { state.dirTab = b.dataset.tab; render(); }));
    $$("[data-ws-detail]", mount).forEach((b) => b.addEventListener("click", () => {
      const rows = connected() ? state.workspaces : MOCK.workspaces;
      const w = rows.find((x) => x.id === b.dataset.wsDetail); if (w) openWorkspaceDrawer(w);
    }));
  }
  function wireWorkspaceDrawer(w) {
    const s = $(`[data-suspend]`); if (s) s.addEventListener("click", () => adminAction("admin_suspend_workspace", { p_id: w.id, p_reason: "suspended from admin console" }, `${w.name} suspended`));
    const u = $(`[data-unsuspend]`); if (u) u.addEventListener("click", () => adminAction("admin_unsuspend_workspace", { p_id: w.id }, `${w.name} unsuspended`));
    const im = $(`[data-impersonate]`); if (im) im.addEventListener("click", () => openImpersonateModal(w));
    $$(`[data-ovr]`).forEach((sel) => sel.addEventListener("change", () => {
      const v = sel.value; const enabled = v === "" ? null : v === "on";
      adminAction("admin_set_flag_override", { p_key: sel.dataset.ovr, p_workspace: sel.dataset.ws, p_enabled: enabled }, `Override saved for ${sel.dataset.ovr}`, false);
    }));
  }
  function wireJobs(mount) {
    $$("[data-jfilter]", mount).forEach((b) => b.addEventListener("click", () => { state.jobFilter = b.dataset.jfilter; if (connected()) route(); else render(); }));
    const jr = $("#jobRefresh", mount); if (jr) jr.addEventListener("click", () => route());
    $$("[data-retry]", mount).forEach((b) => b.addEventListener("click", () => adminAction("admin_retry_job", { p_id: b.dataset.retry }, "Job re-queued")));
    $$("[data-discard]", mount).forEach((b) => b.addEventListener("click", () => adminAction("admin_discard_job", { p_id: b.dataset.discard }, "Job discarded")));
  }
  function wireFlags(mount) {
    $$("[data-flag]", mount).forEach((cb) => cb.addEventListener("change", () => adminAction("admin_set_feature_flag", { p_key: cb.dataset.flag, p_default_on: cb.checked }, `${cb.dataset.flag} ${cb.checked ? "enabled" : "disabled"}`, false)));
    const af = $("#addFlag", mount); if (af) af.addEventListener("click", openAddFlagModal);
  }

  /* ── Actions ────────────────────────────────────────────────────────────── */
  async function adminAction(fn, args, okMsg, reloadAfter = true) {
    if (!connected()) { toast("Mockup mode — connect a project to run this live.", "info"); return; }
    try { await rpc(fn, args); toast(okMsg, "success"); if (reloadAfter) { closeModal(); await route(); } }
    catch (e) { toast(mapErr(e), "danger"); }
  }
  function mapErr(e) {
    const m = (e && (e.message || e.code || "")) + "";
    if (/not_platform_admin/.test(m)) return "Restricted — platform admin only.";
    if (/permission|denied|42501/.test(m)) return "Not permitted.";
    return m || "Something went wrong.";
  }
  function openImpersonateModal(w) {
    openModal(`<div class="modal-head"><h3>Impersonate ${esc(w.name)} owner</h3><button class="icon-btn" id="mClose">${svg("x", 16)}</button></div>
      <div class="imp-form"><p class="muted">Opens a read-write but flagged 30-minute session. A banner shows for the whole session and every action is audited with your identity as the impersonator.</p>
      <div class="field"><label class="label" for="impReason">Reason (required)</label><textarea id="impReason" rows="3" placeholder="e.g. debugging a failed import reported in ticket #482"></textarea></div>
      <div style="display:flex;gap:10px;margin-top:6px"><button class="btn btn-primary" id="impGo" style="color:#fff">${svg("eye", 14)} Start session</button><button class="btn btn-ghost" id="impCancel">Cancel</button></div></div>`);
    $("#mClose").addEventListener("click", closeModal); $("#impCancel").addEventListener("click", closeModal);
    $("#impGo").addEventListener("click", async () => {
      const reason = $("#impReason").value.trim(); if (!reason) { $("#impReason").focus(); return; }
      if (!connected()) { state.impersonation = { target_user_id: "owner@" + w.name.toLowerCase().replace(/\s+/g, "") + ".demo", email: "owner (demo)", reason, expires_at: new Date(Date.now() + 30 * 60000).toISOString() }; closeModal(); toast("Impersonation started (mockup).", "success"); render(); return; }
      try {
        const c = ensureClient();
        const { data, error } = await c.functions.invoke("admin-impersonate", { body: { target_workspace_id: w.id, target_user_id: w.owner_id || null, reason } });
        if (error) throw error;
        const payload = data && data.data ? data.data : data;
        state.impersonation = { target_user_id: payload.target_user_id, reason, expires_at: payload.expires_at };
        closeModal(); toast("Impersonation session opened + audited.", "success"); render();
      } catch (e) { toast(mapErr(e), "danger"); }
    });
  }
  async function endImpersonation() {
    const im = state.impersonation; state.impersonation = null; render();
    if (connected() && im && im.session_id) { try { await rpc("admin_end_impersonation", { p_id: im.session_id }); } catch (e) {} }
    toast("Returned to admin.", "info");
  }
  function openAddFlagModal() {
    openModal(`<div class="modal-head"><h3>New feature flag</h3><button class="icon-btn" id="mClose">${svg("x", 16)}</button></div>
      <div class="imp-form">
      <div class="field"><label class="label" for="flKey">Key</label><input id="flKey" placeholder="e.g. voice.rollout" spellcheck="false"></div>
      <div class="field"><label class="label" for="flCat">Category</label><input id="flCat" placeholder="Beta" spellcheck="false"></div>
      <div class="field"><label class="label" for="flDesc">Description</label><input id="flDesc" placeholder="What this gates"></div>
      <label class="ovr-row" style="border:none;padding:0"><span>Default on</span><input type="checkbox" id="flOn"></label>
      <div style="display:flex;gap:10px;margin-top:10px"><button class="btn btn-primary" id="flGo" style="color:#fff">Create flag</button><button class="btn btn-ghost" id="flCancel">Cancel</button></div></div>`);
    $("#mClose").addEventListener("click", closeModal); $("#flCancel").addEventListener("click", closeModal);
    $("#flGo").addEventListener("click", () => {
      const key = $("#flKey").value.trim(); if (!key) { $("#flKey").focus(); return; }
      adminAction("admin_set_feature_flag", { p_key: key, p_default_on: $("#flOn").checked, p_description: $("#flDesc").value.trim() || null, p_category: $("#flCat").value.trim() || null }, `Flag ${key} created`);
    });
  }

  /* ── Go ─────────────────────────────────────────────────────────────────── */
  boot();
})();
