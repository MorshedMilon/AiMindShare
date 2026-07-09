/* m02-roles.js — AiMindShare Module M02 · Roles & Permissions.
   Vanilla hash-routed dashboard app on Supabase, layered on the M01 shell. The
   coarse 5-tier wall (memberships.role enum) is enforced by Postgres RLS; M02 adds
   the FINE layer: a module.action permission registry, 5 built-in roles, custom
   workspace roles (clone → toggle a matrix → save), per-member grant/revoke
   overrides, and server-side enforcement via has_permission() + the permission-check
   Edge Function (DECISIONS D-023…D-026). UI gating (can / data-can) is COSMETIC —
   the database is the boundary (Constitution Law 2). When no project is connected
   the whole app renders as a high-fidelity mockup with a default/empty/loading/
   error/success preview switcher (honest Gate-5). Anon key only in the browser. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const initials = (s) => (s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const nextTick = (fn) => setTimeout(fn, 12);
  const fmtDate = (d) => { try { return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch (e) { return "—"; } };

  const REG = window.AIMS_PERMISSIONS;   // registry mirror (js/permissions.js)

  /* ── Lucide-style inline icons (DESIGN §9) ──────────────────────────────── */
  const P = {
    grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
    users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
    plus: "M12 5v14M5 12h14", search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
    check: "M20 6 9 17l-5-5", chev: "M6 9l6 6 6-6", mail: "M4 4h16v16H4zM22 6l-10 7L2 6",
    arrow: "M5 12h14M12 5l7 7-7 7", trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
    lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4",
    sliders: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
    edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z",
    copy: "M9 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
    layers: "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
    building: "M3 21h18M6 21V7l6-4 6 4v14M10 9h.01M14 9h.01M10 13h.01M14 13h.01M10 17h.01M14 17h.01",
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
  const ACTIVE_KEY = "aimindshare-active-ws";       // shared with M01 (same device)
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

  /* ── Built-in roles (fixed UUIDs mirror migration 0008's seed) ──────────── */
  const BUILTIN_IDS = {
    owner: "00000000-0000-0000-0000-0000000000a1",
    admin: "00000000-0000-0000-0000-0000000000a2",
    manager: "00000000-0000-0000-0000-0000000000a3",
    staff: "00000000-0000-0000-0000-0000000000a4",
    client: "00000000-0000-0000-0000-0000000000a5",
  };
  const NAME_BY_TIER = { owner: "Owner", admin: "Admin", manager: "Manager", staff: "Staff", client: "Client" };
  function builtinRoles() {
    return ["owner", "admin", "manager", "staff", "client"].map((tier) => ({
      id: BUILTIN_IDS[tier], workspace_id: null, name: NAME_BY_TIER[tier], base_role: tier,
      is_built_in: true, permissions: REG.ROLE_MATRIX[tier].slice(),
    }));
  }

  /* ── Mockup data (mockup mode only — never a live code path) ─────────────── */
  const MOCK = {
    user: { id: "you", email: "aisha@northstar.agency", name: "Aisha Rahman" },
    jobs: 1,
    workspaces: [
      { id: "ws-agency", name: "Northstar Agency", slug: "northstar-agency", kind: "agency", parent_id: null, status: "active", role: "owner" },
      { id: "ws-bluewave", name: "Bluewave Dental", slug: "bluewave-dental", kind: "sub", parent_id: "ws-agency", status: "active", role: "admin" },
    ],
    // Custom roles per workspace (clone a built-in, then toggle the matrix).
    customRoles: {
      "ws-agency": [
        { id: "role-sales", workspace_id: "ws-agency", name: "Sales Lead", base_role: "manager", is_built_in: false,
          permissions: ["crm.view", "crm.create", "crm.edit", "crm.export", "pipeline.view", "pipeline.manage", "campaigns.view", "reports.view"] }, // manager minus crm.delete / campaigns.send / automations.manage
        { id: "role-book", workspace_id: "ws-agency", name: "Bookkeeper", base_role: "staff", is_built_in: false,
          permissions: ["crm.view", "reports.view"] },
      ],
      "ws-bluewave": [],
    },
    members: {
      "ws-agency": [
        { user_id: "you", name: "Aisha Rahman", email: "aisha@northstar.agency", role: "owner", role_id: BUILTIN_IDS.owner, permissions: {}, status: "active", joined_at: "2026-01-12", you: true },
        { user_id: "u2", name: "Daniel Cole", email: "daniel@northstar.agency", role: "admin", role_id: BUILTIN_IDS.admin, permissions: {}, status: "active", joined_at: "2026-01-14" },
        { user_id: "u3", name: "Priya Nair", email: "priya@northstar.agency", role: "manager", role_id: BUILTIN_IDS.manager, permissions: {}, status: "active", joined_at: "2026-02-01" },
        { user_id: "u4", name: "Marco Ruiz", email: "marco@northstar.agency", role: "staff", role_id: BUILTIN_IDS.staff, permissions: { grant: ["crm.export"] }, status: "active", joined_at: "2026-02-20" },
        { user_id: "u5", name: "Sara Okonkwo", email: "sara@northstar.agency", role: "manager", role_id: "role-sales", permissions: {}, status: "active", joined_at: "2026-03-05" },
      ],
    },
    invitations: {
      "ws-agency": [
        { id: "inv1", email: "sofia@northstar.agency", role: "manager", status: "pending", expires_at: "2026-07-10", created_at: "2026-07-03" },
      ],
    },
  };

  /* ── App state ──────────────────────────────────────────────────────────── */
  const state = {
    loaded: false, loading: false, error: null,
    workspaces: [], user: null, jobs: 0,
    allRoles: [], myMem: {}, previewState: "default",
    selectedRoleId: null,               // matrix editor: which role is shown
    draft: null,                        // { roleId, perms:Set } — unsaved matrix edits
  };
  const PREVIEW_STATES = ["default", "empty", "loading", "error", "success"];
  const st = (name) => !connected() && state.previewState === name;
  const roleRank = { client: 0, staff: 1, manager: 2, admin: 3, owner: 4 };
  const canManage = (ws) => ws && roleRank[ws.role] >= roleRank.admin;   // admin+ manages roles/team

  function activeWs() {
    const list = state.workspaces;
    if (!list.length) return null;
    let id; try { id = localStorage.getItem(ACTIVE_KEY); } catch (e) {}
    return list.find((w) => w.id === id && w.status === "active") || list.find((w) => w.status === "active") || list[0];
  }
  function setActive(id) { try { localStorage.setItem(ACTIVE_KEY, id); } catch (e) {} }

  // Roles visible in a workspace: built-ins + that workspace's custom roles.
  function rolesFor(wsId) { return state.allRoles.filter((r) => r.is_built_in || r.workspace_id === wsId); }
  function roleById(id) { return state.allRoles.find((r) => r.id === id) || null; }
  // The role a member resolves to (custom by id, else the built-in matching the tier).
  function roleOfMember(m) {
    if (m.role_id) { const r = roleById(m.role_id); if (r) return r; }
    return state.allRoles.find((r) => r.is_built_in && r.base_role === m.role) || null;
  }

  /* ── Data loading ───────────────────────────────────────────────────────── */
  async function boot() {
    if (connected()) {
      state.loading = true; state.error = null; render();
      try {
        const c = ensureClient();
        const { data: { user } } = await c.auth.getUser();
        state.user = user;
        if (!user) { state.workspaces = []; state.allRoles = builtinRoles(); state.loaded = true; state.loading = false; renderConn(); render(); return; }
        const { data: wsRows, error } = await c.from("workspaces").select("*").eq("status", "active").order("created_at", { ascending: true });
        if (error) throw error;
        const { data: mem } = await c.from("memberships").select("workspace_id, user_id, role, role_id, permissions").eq("status", "active");
        const myRole = {}; state.myMem = {};
        (mem || []).forEach((m) => { if (m.user_id === user.id) { myRole[m.workspace_id] = m.role; state.myMem[m.workspace_id] = { role: m.role, role_id: m.role_id, permissions: m.permissions || {} }; } });
        state.workspaces = (wsRows || []).map((w) => ({ id: w.id, name: w.name, slug: w.slug, kind: w.parent_workspace_id ? "sub" : "agency", parent_id: w.parent_workspace_id, status: w.status, role: myRole[w.id] || "staff" }));
        // roles: built-ins (workspace_id null) + custom rows for my workspaces (RLS-scoped)
        const { data: roleRows, error: rErr } = await c.from("roles").select("*");
        if (rErr) throw rErr;
        state.allRoles = (roleRows && roleRows.length) ? roleRows.map((r) => ({ ...r, permissions: r.permissions || [] })) : builtinRoles();
      } catch (e) { state.error = e.message || String(e); state.workspaces = []; state.allRoles = builtinRoles(); }
      state.loading = false; state.loaded = true;
    } else {
      state.user = MOCK.user; state.jobs = MOCK.jobs;
      state.workspaces = MOCK.workspaces.map((w) => ({ ...w }));
      const customs = Object.values(MOCK.customRoles).flat().map((r) => ({ ...r, permissions: r.permissions.slice() }));
      state.allRoles = builtinRoles().concat(customs);
      state.myMem = { "ws-agency": { role: "owner", role_id: BUILTIN_IDS.owner, permissions: {} }, "ws-bluewave": { role: "admin", role_id: BUILTIN_IDS.admin, permissions: {} } };
      state.loaded = true; state.loading = false;
    }
    // default matrix selection = first built-in (Owner)
    if (!state.selectedRoleId || !roleById(state.selectedRoleId)) state.selectedRoleId = BUILTIN_IDS.owner;
    renderConn(); render();
  }

  async function fetchMembers(wsId) {
    if (!connected()) return (MOCK.members[wsId] || (wsId === activeWs()?.id ? MOCK.members["ws-agency"] : [])).map((m) => ({ ...m, permissions: { ...(m.permissions || {}) } }));
    const c = ensureClient();
    const { data: mem, error } = await c.from("memberships").select("*").eq("workspace_id", wsId).order("created_at");
    if (error) throw error;
    const ids = (mem || []).map((m) => m.user_id);
    let profs = [];
    if (ids.length) { const { data } = await c.from("profiles").select("id,name,email").in("id", ids); profs = data || []; }
    const pm = {}; profs.forEach((p) => (pm[p.id] = p));
    return (mem || []).map((m) => ({ user_id: m.user_id, role: m.role, role_id: m.role_id, permissions: m.permissions || {}, status: m.status, joined_at: m.created_at, you: m.user_id === state.user?.id, name: pm[m.user_id]?.name || "Member", email: pm[m.user_id]?.email || "—" }));
  }
  async function fetchInvites(wsId) {
    if (!connected()) return (MOCK.invitations[wsId] || []).map((i) => ({ ...i }));
    const c = ensureClient();
    const { data, error } = await c.from("workspace_invitations").select("*").eq("workspace_id", wsId).eq("status", "pending").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  // My effective permission Set in a workspace (owner⇒all; role grant ∪/− overrides).
  function myEffective(wsId) {
    const mm = state.myMem[wsId]; if (!mm) return new Set();
    const r = roleOfMember({ role: mm.role, role_id: mm.role_id });
    return REG.effectiveSet(mm.role, r ? r.permissions : [], mm.permissions);
  }

  /* ── Connection pill ────────────────────────────────────────────────────── */
  function renderConn() {
    const pill = $("#connPill"); if (!pill) return;
    if (connected()) { pill.className = "pill success"; pill.textContent = "connected"; }
    else { pill.className = "pill plain"; pill.textContent = "mockup mode"; }
  }

  /* ── Pills ──────────────────────────────────────────────────────────────── */
  const tierPill = (tier) => { const k = tier === "owner" ? "attention" : tier === "admin" ? "info" : tier === "manager" ? "success" : "plain"; return `<span class="pill ${k}">${esc(tier)}</span>`; };

  /* ── Shell (rail + topbar) ──────────────────────────────────────────────── */
  const NAV = [
    { key: "roles", label: "Roles & permissions", ico: "shield", hash: "#/settings/roles" },
    { key: "team", label: "Team", ico: "users", hash: "#/settings/team" },
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
        <div class="nav-group"><div class="nav-group-label">Access</div>${nav}</div>
        <div class="rail-foot">M02 · Roles &amp; Permissions</div>
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
  function emptyNoWorkspace() { return `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("building", 22)}</div><h3>No active workspace</h3><p>Create or select a workspace in M01 to manage its roles.</p><a class="btn btn-primary es-cta" href="m01-workspaces-and-multi-tenancy.html#/workspaces">Go to workspaces</a></div></div>`; }
  function skeletonPanel(rows) { return `<div class="panel"><div class="skeleton skel-line" style="width:34%;margin-bottom:16px"></div>${Array(rows || 4).fill('<div class="skeleton" style="height:56px;border-radius:12px;margin-bottom:8px"></div>').join("")}</div>`; }

  /* ═══ VIEW: Roles & permission matrix ═════════════════════════════════════ */
  function viewRoles(mount) {
    const ws = activeWs();
    if (!ws) { mount.innerHTML = previewStrip() + emptyNoWorkspace(); wireCommon(mount); return; }
    if (st("loading") || (state.loading && !state.loaded)) { mount.innerHTML = previewStrip() + rolesHead(ws) + skeletonPanel(5); wireCommon(mount); return; }
    if (st("error") || state.error) { mount.innerHTML = previewStrip() + rolesHead(ws) + errorBlock(state.error || "We couldn't load roles."); wireCommon(mount); return; }

    (async () => {
      const manage = canManage(ws) || !connected();
      let members = [];
      try { members = st("empty") ? [] : await fetchMembers(ws.id); } catch (e) { members = []; }
      const roles = rolesFor(ws.id);
      const builtins = roles.filter((r) => r.is_built_in);
      // First-run empty preview: show the "no custom roles yet" state (built-ins always exist).
      const customs = st("empty") ? [] : roles.filter((r) => !r.is_built_in);
      const shownCount = builtins.length + customs.length;
      const memberCount = (r) => members.filter((m) => { const mr = roleOfMember(m); return mr && mr.id === r.id; }).length;

      // KPI strip
      const kpis = [
        { ico: "shield", val: shownCount, label: "Roles", feat: false },
        { ico: "lock", val: builtins.length, label: "Built-in" },
        { ico: "sliders", val: customs.length, label: "Custom roles" },
        { ico: "users", val: members.length, label: "Members governed", feat: true },
      ];
      const kpiStrip = `<div class="kpi-strip">${kpis.map((k) => `
        <div class="kpi reveal kpi-tealico ${k.feat ? "kpi-featured" : ""}"><div class="kpi-ico">${svg(k.ico, 16)}</div>
          <div class="kpi-val num">${esc(k.val)}</div><div class="kpi-label">${k.label}</div></div>`).join("")}</div>`;

      const roleRow = (r) => {
        const perms = r.is_built_in && r.base_role === "owner" ? REG.PERMISSIONS.length : r.permissions.length;
        const cnt = memberCount(r);
        return `<div class="role-row ${r.is_built_in ? "builtin" : "custom"} ${r.id === state.selectedRoleId ? "selected" : ""}" data-role="${esc(r.id)}">
          <span class="rr-badge">${svg(r.is_built_in ? "shield" : "sliders", 17)}</span>
          <div class="rr-body">
            <div class="rr-name">${esc(r.name)} ${r.is_built_in ? '<span class="rr-lock" title="Built-in role — immutable">' + svg("lock", 13) + "</span>" : ""}</div>
            <div class="rr-sub"><span class="tier-tag">${esc(r.base_role)} tier</span><span><span class="num">${perms}</span> permissions</span><span><span class="num">${cnt}</span> member${cnt === 1 ? "" : "s"}</span></div>
          </div>
          <div class="rr-right">
            ${r.is_built_in ? '<span class="oc-tag">Built-in</span>' : '<span class="oc-tag" style="border-color:rgba(197,160,89,.4);color:var(--gold-500)">Custom</span>'}
            <div class="rr-actions">
              <button class="ov-btn" data-view="${esc(r.id)}" title="View permissions">${svg("sliders", 15)}</button>
              ${manage ? `<button class="ov-btn" data-clone="${esc(r.id)}" title="Duplicate as a custom role">${svg("copy", 15)}</button>` : ""}
              ${manage && !r.is_built_in ? `<button class="ov-btn" data-delrole="${esc(r.id)}" title="Delete role">${svg("trash", 15)}</button>` : ""}
            </div>
          </div>
        </div>`;
      };

      const listPanel = `<div class="panel reveal">
        <div class="panel-head"><span class="ph-ico">${svg("shield", 15)}</span><h3>Roles</h3><span class="pill plain" style="margin-left:8px">${shownCount}</span>
          ${manage ? `<button class="btn btn-primary btn-sm cc-viewall" id="newRoleBtn" data-can="team.manage" data-can-mode="disable" style="margin-left:auto;color:#fff">${svg("plus", 14)} New custom role</button>` : ""}</div>
        <div class="role-list">${builtins.map(roleRow).join("")}${customs.length ? customs.map(roleRow).join("") : `<div class="empty-state" style="padding:26px"><div class="es-ico">${svg("sliders", 20)}</div><h3 style="font-size:16px">No custom roles yet</h3><p>Clone a built-in role to tailor exactly what a group can do.</p>${manage ? `<button class="btn btn-primary es-cta" id="newRoleBtn2">${svg("plus", 14)} New custom role</button>` : ""}</div>`}</div>
      </div>`;

      mount.innerHTML = `${previewStrip()}${rolesHead(ws)}${kpiStrip}${listPanel}${matrixPanel(ws, manage)}`;
      wireCommon(mount);
      wireRoles(mount, ws, members, manage);
      REG.hydrate(mount, myEffective(ws.id));
    })();
  }

  function rolesHead(ws) {
    return `<div class="page-head reveal"><span class="eyebrow">Module · M02</span>
      <h1 style="margin-top:12px">Roles &amp; <em>permissions</em></h1>
      <p class="sub">Who can do what inside <b>${esc(ws.name)}</b>. Five built-in roles plus custom roles you define — enforced server-side by Postgres RLS and the <span class="mono">permission-check</span> Edge Function, not just hidden in the UI.</p>
      <div class="freshness" style="margin-top:10px">RLS enforces the coarse tier · Edge Functions enforce fine overrides</div></div>`;
  }

  // The matrix editor panel for the currently-selected role.
  function matrixPanel(ws, manage) {
    const r = roleById(state.selectedRoleId) || rolesFor(ws.id)[0];
    if (!r) return "";
    const editable = manage && !r.is_built_in;
    // draft perms (unsaved) for the selected custom role
    let perms;
    if (editable && state.draft && state.draft.roleId === r.id) perms = state.draft.perms;
    else perms = new Set(r.is_built_in && r.base_role === "owner" ? REG.PERMISSIONS : r.permissions);
    const dirty = editable && state.draft && state.draft.roleId === r.id && !sameSet(perms, new Set(r.permissions));

    const chips = rolesFor(ws.id).map((x) => `<button class="role-chip ${x.is_built_in ? "" : "custom"} ${x.id === r.id ? "on" : ""}" data-chip="${esc(x.id)}"><span class="rc-dot"></span>${esc(x.name)}</button>`).join("");

    // header + note
    const note = r.is_built_in
      ? `<div class="matrix-note"><span class="lock-ico">${svg("lock", 13)}</span> <b>${esc(r.name)}</b> is a built-in role — its permissions are fixed and shared by every workspace. Duplicate it to create an editable custom role.${r.base_role === "owner" ? " Owner always has every permission." : ""}${r.base_role === "client" ? " Client is portal-only; the coarse RLS wall blocks all workspace writes regardless of toggles." : ""}</div>`
      : `<div class="matrix-note">Editing <b>${esc(r.name)}</b> — a custom role on the <b>${esc(r.base_role)}</b> tier. Toggle exactly what its members may do. The tier still sets the coarse RLS ceiling; fine grants can only narrow within it.</div>`;

    // grid
    const actionCols = REG.ACTIONS.map((a) => `<th>${esc(a.label)}</th>`).join("");
    const rows = REG.MODULES.map((mod) => {
      const cells = REG.ACTIONS.map((a) => {
        const perm = mod.key + "." + a.key;
        if (!REG.hasAction(mod.key, a.key)) return `<td><span class="mx-none">·</span></td>`;
        const on = perms.has(perm);
        const forceOwner = r.is_built_in && r.base_role === "owner";
        const dis = !editable || forceOwner;
        return `<td><input type="checkbox" class="perm-check" data-perm="${esc(perm)}" ${on ? "checked" : ""} ${dis ? "disabled" : ""} aria-label="${esc(perm)}"></td>`;
      }).join("");
      return `<tr><td class="mx-mod"><div class="mx-mod-name">${esc(mod.label)}</div><div class="mx-mod-key">${esc(mod.key)}</div></td>${cells}</tr>`;
    }).join("");

    const foot = editable ? `<div class="matrix-foot">
      <span class="mf-status ${dirty ? "dirty" : ""}" id="mxStatus">${dirty ? "Unsaved changes" : "All changes saved"}</span>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm" id="mxReset" ${dirty ? "" : "disabled"}>Reset</button>
      <button class="btn btn-primary btn-sm" id="mxSave" ${dirty ? "" : "disabled"}>Save changes</button>
    </div>` : "";

    return `<div class="panel reveal" id="matrixPanel" style="margin-top:22px">
      <div class="matrix-head"><span class="ph-ico">${svg("sliders", 15)}</span><span class="mh-title">Permission matrix</span></div>
      <div class="role-chips">${chips}</div>
      ${note}
      <div class="matrix-wrap"><table class="matrix"><thead><tr><th class="mx-modcol">Module</th>${actionCols}</tr></thead><tbody>${rows}</tbody></table></div>
      ${foot}
    </div>`;
  }

  const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

  /* ── Wiring: roles view ─────────────────────────────────────────────────── */
  function wireRoles(mount, ws, members, manage) {
    // select a role row / chip → change matrix
    const select = (id) => { state.selectedRoleId = id; state.draft = null; render(); };
    $$("[data-role]", mount).forEach((n) => n.addEventListener("click", (e) => { if (e.target.closest("[data-clone],[data-delrole],[data-view]")) return; select(n.dataset.role); }));
    $$("[data-view]", mount).forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); select(b.dataset.view); const p = $("#matrixPanel"); if (p) p.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); }));
    $$("[data-chip]", mount).forEach((b) => b.addEventListener("click", () => select(b.dataset.chip)));

    // clone → new custom role from a base
    const clone = (baseId) => openCloneRole(ws, baseId);
    $$("[data-clone]", mount).forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); clone(b.dataset.clone); }));
    const nb = $("#newRoleBtn", mount); if (nb) nb.addEventListener("click", () => clone(state.selectedRoleId || BUILTIN_IDS.manager));
    const nb2 = $("#newRoleBtn2", mount); if (nb2) nb2.addEventListener("click", () => clone(BUILTIN_IDS.manager));

    // delete custom role
    $$("[data-delrole]", mount).forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); confirmDeleteRole(ws, b.dataset.delrole, members); }));

    // matrix checkbox toggles → update the draft (no full re-render; keep scroll/focus)
    const selRole = roleById(state.selectedRoleId);
    if (selRole && !selRole.is_built_in && manage) {
      ensureDraft(selRole);
      $$(".perm-check", mount).forEach((cb) => cb.addEventListener("change", () => {
        const perm = cb.dataset.perm;
        if (cb.checked) state.draft.perms.add(perm); else state.draft.perms.delete(perm);
        cb.classList.toggle("dirty", true);
        refreshMatrixFoot(mount, selRole);
      }));
      const save = $("#mxSave", mount); if (save) save.addEventListener("click", () => saveMatrix(ws, selRole));
      const rst = $("#mxReset", mount); if (rst) rst.addEventListener("click", () => { state.draft = null; render(); });
    }
  }

  function ensureDraft(role) { if (!state.draft || state.draft.roleId !== role.id) state.draft = { roleId: role.id, perms: new Set(role.permissions) }; }
  function refreshMatrixFoot(mount, role) {
    const dirty = !sameSet(state.draft.perms, new Set(role.permissions));
    const status = $("#mxStatus", mount); if (status) { status.textContent = dirty ? "Unsaved changes" : "All changes saved"; status.classList.toggle("dirty", dirty); }
    const save = $("#mxSave", mount); if (save) save.disabled = !dirty;
    const rst = $("#mxReset", mount); if (rst) rst.disabled = !dirty;
  }

  async function saveMatrix(ws, role) {
    const perms = [...state.draft.perms];
    if (!connected()) { role.permissions = perms; state.draft = null; toast("Permissions saved (mockup)", "success"); render(); return; }
    const save = $("#mxSave"); if (save) { save.disabled = true; save.textContent = "Saving…"; }
    const { error } = await ensureClient().from("roles").update({ permissions: perms }).eq("id", role.id);
    if (error) { if (save) { save.disabled = false; save.textContent = "Save changes"; } toast(error.message, "danger"); return; }
    role.permissions = perms; state.draft = null;
    toast("Permissions saved", "success"); render();
  }

  /* ── Clone / create custom role ─────────────────────────────────────────── */
  function openCloneRole(ws, baseId) {
    const base = roleById(baseId) || roleById(BUILTIN_IDS.manager);
    const bases = ["admin", "manager", "staff", "client"];   // custom roles can't be owner (D-024)
    const { close } = modal(`
      <div class="mc-head"><span class="mc-ico">${svg("copy", 18)}</span>
        <div><h3>New custom role</h3><div class="mc-sub">Start from a built-in role's permissions, then tailor the matrix. Members on this role inherit its <b>tier</b> for the coarse RLS wall.</div></div>
        <button class="icon-btn mc-close" data-close>✕</button></div>
      <div class="form-grid">
        <div class="form-field full"><label>Role name</label><input id="crName" placeholder="e.g. Sales Lead" autofocus></div>
        <div class="form-field full"><label>Base tier (RLS ceiling)</label><select id="crBase">${bases.map((b) => `<option value="${b}" ${base && base.base_role === b ? "selected" : ""}>${NAME_BY_TIER[b]} — ${esc(tierBlurb(b))}</option>`).join("")}</select></div>
      </div>
      <div class="hint" style="margin-top:6px;font-size:12px;color:var(--ink-400)">Cloned from <b>${esc(base ? base.name : "Manager")}</b>. You can toggle individual permissions after creating it. Owner isn't selectable — ownership transfers only.</div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="crCreate">Create role</button></div>`);
    $("#crCreate").addEventListener("click", async () => {
      const name = $("#crName").value.trim(); const baseRole = $("#crBase").value;
      if (!name) { $("#crName").focus(); toast("Give the role a name", "danger"); return; }
      // Seed permissions from the chosen base tier, but never exceed it conceptually.
      const seed = REG.ROLE_MATRIX[baseRole].slice();
      if (!connected()) {
        const id = "role-" + Math.abs(hashStr(name + baseRole + (state.allRoles.length))).toString(36);
        state.allRoles.push({ id, workspace_id: ws.id, name, base_role: baseRole, is_built_in: false, permissions: seed });
        state.selectedRoleId = id; close(); toast("Custom role created (mockup)", "success"); render(); return;
      }
      const btn = $("#crCreate"); btn.disabled = true; btn.textContent = "Creating…";
      const { data, error } = await ensureClient().from("roles").insert({ workspace_id: ws.id, name, base_role: baseRole, is_built_in: false, permissions: seed }).select().single();
      if (error) { btn.disabled = false; btn.textContent = "Create role"; toast(error.message, "danger"); return; }
      if (data) { state.allRoles.push({ ...data, permissions: data.permissions || [] }); state.selectedRoleId = data.id; }
      close(); toast("Custom role created", "success"); render();
    });
  }
  const tierBlurb = (t) => ({ admin: "all but billing & delete", manager: "full module access", staff: "view / create / edit", client: "portal only" }[t] || "");

  function confirmDeleteRole(ws, roleId, members) {
    const role = roleById(roleId); if (!role) return;
    const inUse = members.filter((m) => { const mr = roleOfMember(m); return mr && mr.id === role.id; });
    const { close } = modal(`
      <div class="mc-head"><span class="mc-ico" style="background:var(--status-danger)">${svg("trash", 18)}</span>
        <div><h3>Delete ${esc(role.name)}?</h3><div class="mc-sub">${inUse.length ? `<b>${inUse.length}</b> member${inUse.length === 1 ? " is" : "s are"} still on this role. Reassign them first — the server refuses to delete a role in use.` : "This custom role isn't assigned to anyone. This can't be undone."}</div></div>
        <button class="icon-btn mc-close" data-close>✕</button></div>
      ${inUse.length ? `<div class="ov-list" style="max-height:180px">${inUse.map((m) => `<div class="ov-item"><span class="avatar" style="width:28px;height:28px;font-size:11px">${esc(initials(m.name))}</span><span class="ov-perm">${esc(m.name)}</span><span class="ov-base">${esc(m.email)}</span></div>`).join("")}</div>` : ""}
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-danger" id="delGo" ${inUse.length ? "disabled" : ""}>Delete role</button></div>`);
    const go = $("#delGo"); if (go && !inUse.length) go.addEventListener("click", async () => {
      if (!connected()) { state.allRoles = state.allRoles.filter((r) => r.id !== role.id); if (state.selectedRoleId === role.id) state.selectedRoleId = BUILTIN_IDS.owner; close(); toast("Role deleted (mockup)", "success"); render(); return; }
      go.disabled = true; go.textContent = "Deleting…";
      const { error } = await ensureClient().rpc("delete_role", { p_ws: ws.id, p_role_id: role.id });
      if (error) { go.disabled = false; go.textContent = "Delete role"; toast(error.message, "danger"); return; }
      state.allRoles = state.allRoles.filter((r) => r.id !== role.id);
      if (state.selectedRoleId === role.id) state.selectedRoleId = BUILTIN_IDS.owner;
      close(); toast("Role deleted", "success"); render();
    });
  }

  /* ═══ VIEW: Team (members + role dropdown + overrides + invitations) ══════ */
  async function viewTeam(mount) {
    const ws = activeWs();
    if (!ws) { mount.innerHTML = previewStrip() + emptyNoWorkspace(); wireCommon(mount); return; }
    if (st("loading")) { mount.innerHTML = previewStrip() + teamHead(ws) + skeletonPanel(4); wireCommon(mount); return; }

    let members = [], invites = [], err = null;
    try {
      if (st("empty")) { members = [{ user_id: "you", name: state.user?.name || "You", email: state.user?.email || "you@agency.com", role: "owner", role_id: BUILTIN_IDS.owner, permissions: {}, status: "active", joined_at: new Date().toISOString(), you: true }]; invites = []; }
      else if (st("error")) { err = "Could not load your team."; }
      else { members = await fetchMembers(ws.id); invites = await fetchInvites(ws.id); }
    } catch (e) { err = e.message || String(e); }

    const manage = canManage(ws) || !connected();
    if (err) { mount.innerHTML = previewStrip() + teamHead(ws) + errorBlock(err); wireCommon(mount); return; }

    const roles = rolesFor(ws.id);
    const assignable = roles.filter((r) => r.base_role !== "owner");   // owner via transfer only

    const rows = members.map((m) => {
      const mr = roleOfMember(m);
      const ov = m.permissions || {};
      const grants = (ov.grant || []).length, revokes = (ov.revoke || []).length;
      const ovChips = `${grants ? `<span class="ov-chip grant" title="${esc((ov.grant || []).join(', '))}">+${grants}</span>` : ""}${revokes ? `<span class="ov-chip revoke" title="${esc((ov.revoke || []).join(', '))}">−${revokes}</span>` : ""}`;
      let roleCell;
      if (m.role === "owner") {
        roleCell = `${tierPill("owner")} <span class="oc-tag">Transfer only</span>`;
      } else if (manage && !m.you) {
        const opts = assignable.map((r) => `<option value="${esc(r.id)}" ${mr && mr.id === r.id ? "selected" : ""}>${esc(r.name)}${r.is_built_in ? "" : " (custom)"}</option>`).join("");
        roleCell = `<div class="cell-role"><select class="role-select" data-setrole="${esc(m.user_id)}">${opts}</select>${ovChips}<button class="ov-btn" data-override="${esc(m.user_id)}" title="Per-member overrides">${svg("sliders", 15)}</button></div>`;
      } else {
        roleCell = `<div class="cell-role">${tierPill(m.role)}${mr && !mr.is_built_in ? ` <span class="oc-tag">${esc(mr.name)}</span>` : ""}${ovChips}</div>`;
      }
      return `<tr>
        <td><div class="cell-user"><span class="avatar">${esc(initials(m.name))}</span><div><div class="cu-name">${esc(m.name)}${m.you ? ' <span class="oc-tag" style="margin-left:6px">You</span>' : ""}</div><div class="cu-sub">${esc(m.email)}</div></div></div></td>
        <td>${roleCell}</td>
        <td>${esc(fmtDate(m.joined_at))}</td>
      </tr>`;
    }).join("");

    const inviteRows = invites.length ? invites.map((i) => `
      <div class="invite-row">
        <span class="ir-ico">${svg("mail", 15)}</span>
        <div class="ir-body"><div class="ir-email">${esc(i.email)}</div><div class="ir-meta">${esc(i.role)} · expires ${esc(fmtDate(i.expires_at))}</div></div>
        <div class="ir-actions">${manage ? `<button class="btn btn-ghost btn-sm" data-copyinvite="${esc(i.id)}">Copy link</button><button class="btn btn-ghost btn-sm" data-revoke="${esc(i.id)}">Revoke</button>` : ""}</div>
      </div>`).join("") : `<div class="empty-state" style="padding:30px"><div class="es-ico">${svg("mail", 20)}</div><h3 style="font-size:16px">No pending invitations</h3><p>Invite a teammate and assign their role on the way in.</p></div>`;

    mount.innerHTML = `${previewStrip()}${teamHead(ws)}
      <div class="settings-col" style="max-width:960px;gap:22px">
        <div class="panel reveal">
          <div class="panel-head"><span class="ph-ico">${svg("users", 15)}</span><h3>Members</h3><span class="pill plain" style="margin-left:8px">${members.length}</span>
            ${manage ? `<button class="btn btn-primary btn-sm cc-viewall" id="inviteBtn" data-can="team.manage" data-can-mode="disable" style="margin-left:auto;color:#fff">${svg("plus", 14)} Invite</button>` : ""}</div>
          <div style="overflow-x:auto"><table class="table"><thead><tr><th>Member</th><th>Role &amp; access</th><th>Joined</th></tr></thead><tbody>${rows}</tbody></table></div>
        </div>
        <div class="panel reveal">
          <div class="panel-head"><span class="ph-ico">${svg("mail", 15)}</span><h3>Pending invitations</h3><span class="pill plain" style="margin-left:8px">${invites.length}</span></div>
          <div class="row-list">${inviteRows}</div>
        </div>
      </div>`;
    wireCommon(mount);
    wireTeam(mount, ws, members);
    REG.hydrate(mount, myEffective(ws.id));
  }

  function teamHead(ws) {
    return `<div class="page-head reveal"><span class="eyebrow">Module · M02</span>
      <h1 style="margin-top:12px">Team &amp; <em>access</em></h1>
      <p class="sub">Assign each member a role in <b>${esc(ws.name)}</b>, or fine-tune with per-member grants and revokes. Role changes are enforced by RLS the instant they save — the dropdown is a convenience, not the wall.</p></div>`;
  }

  /* ── Wiring: team view ──────────────────────────────────────────────────── */
  function wireTeam(mount, ws, members) {
    const inv = $("#inviteBtn", mount); if (inv) inv.addEventListener("click", () => openInvite(ws));

    $$("[data-setrole]", mount).forEach((sel) => sel.addEventListener("change", async () => {
      const uid = sel.dataset.setrole; const roleId = sel.value; const r = roleById(roleId);
      const m = members.find((x) => x.user_id === uid);
      if (!connected()) { if (m && r) { m.role_id = r.id; m.role = r.base_role; } toast(`Role changed to ${r ? r.name : "role"} (mockup)`, "success"); render(); return; }
      sel.disabled = true;
      const { error } = await ensureClient().rpc("set_member_role", { p_ws: ws.id, p_user: uid, p_role_id: roleId });
      sel.disabled = false;
      if (error) { toast(error.message, "danger"); render(); return; }
      toast("Role updated", "success"); render();
    }));

    $$("[data-override]", mount).forEach((b) => b.addEventListener("click", () => { const m = members.find((x) => x.user_id === b.dataset.override); if (m) openOverrides(ws, m); }));

    $$("[data-revoke]", mount).forEach((b) => b.addEventListener("click", async () => {
      const id = b.dataset.revoke;
      if (!connected()) { toast("Invitation revoked (mockup)"); return; }
      const { error } = await ensureClient().from("workspace_invitations").update({ status: "revoked" }).eq("id", id);
      if (error) { toast(error.message, "danger"); return; }
      toast("Invitation revoked", "success"); render();
    }));
    $$("[data-copyinvite]", mount).forEach((b) => b.addEventListener("click", () => { copyText(`${location.origin}${location.pathname.replace(/m02[^/]*$/, "m01-workspaces-and-multi-tenancy.html")}#/accept?token=demo-token`); toast("Invite link copied", "success"); }));
  }

  /* ── Per-member override editor ─────────────────────────────────────────── */
  function openOverrides(ws, m) {
    const mr = roleOfMember(m);
    const base = new Set(mr ? mr.permissions : []);
    const ov = m.permissions || {};
    const grant = new Set(ov.grant || []); const revoke = new Set(ov.revoke || []);
    // per-perm current state: 'grant' | 'revoke' | 'inherit'
    const stateOf = (p) => grant.has(p) ? "grant" : revoke.has(p) ? "revoke" : "inherit";
    const list = REG.PERMISSIONS.map((p) => {
      const inBase = base.has(p);
      return `<div class="ov-item"><span class="ov-perm">${esc(p)}</span><span class="ov-base">${inBase ? "in role" : "not in role"}</span>
        <span class="ov-seg" data-perm="${esc(p)}">
          <button data-v="revoke" class="${stateOf(p) === "revoke" ? "on" : ""}">Deny</button>
          <button data-v="inherit" class="${stateOf(p) === "inherit" ? "on" : ""}">Inherit</button>
          <button data-v="grant" class="${stateOf(p) === "grant" ? "on" : ""}">Allow</button>
        </span></div>`;
    }).join("");
    const { close } = modal(`
      <div class="mc-head"><span class="mc-ico">${svg("sliders", 18)}</span>
        <div><h3>Overrides — ${esc(m.name)}</h3><div class="mc-sub">Grant or revoke individual permissions on top of <b>${esc(mr ? mr.name : m.role)}</b>. Revoke always wins. Owner can't be overridden.</div></div>
        <button class="icon-btn mc-close" data-close>✕</button></div>
      <div class="ov-list">${list}</div>
      <div class="hint" style="margin-top:8px;font-size:12px;color:var(--ink-400)">“Allow” adds a permission the role lacks; “Deny” removes one the role grants. “Inherit” follows the role.</div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="ovSave">Save overrides</button></div>`);

    const wrap = $("#modalRoot");
    $$(".ov-seg", wrap).forEach((seg) => $$("button", seg).forEach((btn) => btn.addEventListener("click", () => {
      $$("button", seg).forEach((x) => x.classList.remove("on")); btn.classList.add("on");
    })));
    $("#ovSave").addEventListener("click", async () => {
      const g = [], rv = [];
      $$(".ov-seg", wrap).forEach((seg) => { const perm = seg.dataset.perm; const on = $("button.on", seg); const v = on ? on.dataset.v : "inherit"; if (v === "grant") g.push(perm); else if (v === "revoke") rv.push(perm); });
      const overrides = {}; if (g.length) overrides.grant = g; if (rv.length) overrides.revoke = rv;
      if (!connected()) { m.permissions = overrides; close(); toast("Overrides saved (mockup)", "success"); render(); return; }
      const btn = $("#ovSave"); btn.disabled = true; btn.textContent = "Saving…";
      const { error } = await ensureClient().rpc("set_member_permissions", { p_ws: ws.id, p_user: m.user_id, p_overrides: overrides });
      if (error) { btn.disabled = false; btn.textContent = "Save overrides"; toast(error.message, "danger"); return; }
      m.permissions = overrides; close(); toast("Overrides saved", "success"); render();
    });
  }

  /* ── Invite modal (role assignment on the way in) ───────────────────────── */
  function openInvite(ws) {
    const roles = rolesFor(ws.id).filter((r) => r.base_role !== "owner");
    const { close } = modal(`
      <div class="mc-head"><span class="mc-ico">${svg("mail", 18)}</span>
        <div><h3>Invite a teammate</h3><div class="mc-sub">They'll join <b>${esc(ws.name)}</b> with the role you choose — including your custom roles.</div></div>
        <button class="icon-btn mc-close" data-close>✕</button></div>
      <div class="form-grid">
        <div class="form-field full"><label>Email address</label><input id="ivEmail" type="email" placeholder="teammate@agency.com" autofocus></div>
        <div class="form-field full"><label>Role</label><select id="ivRole">${roles.map((r) => `<option value="${esc(r.base_role)}" data-roleid="${esc(r.id)}">${esc(r.name)}${r.is_built_in ? "" : " (custom)"} — ${esc(tierBlurb(r.base_role) || r.base_role)}</option>`).join("")}</select></div>
      </div>
      <div class="hint" style="margin-top:6px;font-size:12px;color:var(--ink-400)">Email delivery arrives with M04 (provider pending, D-011). For now we generate a secure invite link you can share.</div>
      <div id="ivLinkBox"></div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="ivSend">Create invite</button></div>`);
    $("#ivSend").addEventListener("click", async () => {
      const email = $("#ivEmail").value.trim(); const roleSel = $("#ivRole"); const role = roleSel.value;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("Enter a valid email", "danger"); return; }
      const rawToken = genToken();
      const link = `${location.origin}${location.pathname.replace(/m02[^/]*$/, "m01-workspaces-and-multi-tenancy.html")}#/accept?token=${rawToken}`;
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

  /* ── Router + render ────────────────────────────────────────────────────── */
  function currentRoute() {
    const h = (location.hash || "#/settings/roles").replace(/^#/, "");
    if (h.startsWith("/settings/team")) return { key: "team" };
    return { key: "roles" };
  }
  function render() {
    const app = $("#app");
    const r = currentRoute();
    app.innerHTML = shell(r.key, "");
    afterShell();
    const inner = $(".content-inner");
    if (r.key === "team") viewTeam(inner); else viewRoles(inner);
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
    $$("[data-switch]", pop).forEach((it) => it.addEventListener("click", () => { setActive(it.dataset.switch); state.selectedRoleId = BUILTIN_IDS.owner; state.draft = null; pop.remove(); toast("Switched workspace"); render(); }));
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

  /* ── Small utils ────────────────────────────────────────────────────────── */
  function genToken() { const a = new Uint8Array(24); (crypto.getRandomValues ? crypto.getRandomValues(a) : a.fill(1)); return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join(""); }
  async function sha256Hex(s) { const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(""); }
  function copyText(t) { try { navigator.clipboard.writeText(t); } catch (e) { const ta = el("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); } }
  function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; } return h; }

  /* ── Go ─────────────────────────────────────────────────────────────────── */
  window.addEventListener("hashchange", render);
  boot();
})();
