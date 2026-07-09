/* m11-pipeline.js — AiMindShare Module M11 · Pipeline.
   Vanilla hash-routed dashboard on Supabase. Two screens:
     /pipeline           — switcher + weighted forecast bar + Kanban (SortableJS,
                           optimistic drag w/ rollback) / list view + filters +
                           bulk stage move + Add-Deal + the deal drawer (Sheet).
     /settings/pipelines — pipeline list + stage editor (drag-reorder, probability
                           sliders, colours).
   The walls are server-side: pipeline/stage config is manager+ (RLS + pipeline.manage,
   D-049); deals are staff+ / manager-delete; every stage move is the SECURITY DEFINER
   move_deal_stage() which writes a 'deal_change' row to the CRM timeline (activity_log,
   D-050) — the durable event M13 will consume. Anon key only in the browser (Law 3).
   Offline → a high-fidelity mockup with a default/empty/loading/error/success switcher. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const initials = (s) => (s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const nextTick = (fn) => setTimeout(fn, 12);
  const DAY = 864e5;

  /* ── Icons ──────────────────────────────────────────────────────────────── */
  const P = {
    board: "M4 4h6v16H4zM14 4h6v9h-6z", list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    plus: "M12 5v14M5 12h14", check: "M20 6 9 17l-5-5", x: "M18 6 6 18M6 6l12 12",
    chev: "M9 18l6-6-6-6", chevd: "M6 9l6 6 6-6", arrow: "M5 12h14M12 5l7 7-7 7",
    user: "M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", search: "M21 21l-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
    file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
    clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2", alert: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
    trophy: "M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0zM7 4H4v2a3 3 0 0 0 3 3M17 4h3v2a3 3 0 0 0-3 3",
    ban: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM4.9 4.9l14.2 14.2", target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    grip: "M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01", trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
    activity: "M22 12h-4l-3 9L9 3l-3 9H2", note: "M11 4H4v16h16v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z",
    info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01", dollar: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
    sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z", cal: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  };
  const svg = (n, s = 17) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${P[n] || ""}"/></svg>`;

  const HUES = ["slate", "teal", "gold", "amber", "green"];
  const CUR = (v, cur = "USD") => { const n = Number(v || 0); try { return n.toLocaleString("en-US", { style: "currency", currency: cur, maximumFractionDigits: n % 1 ? 2 : 0 }); } catch (e) { return "$" + n.toLocaleString("en-US"); } }
  const money = (v) => "$" + Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

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
    const members = [
      { user_id: "u1", name: "Aisha Rahman" }, { user_id: "u2", name: "Yusuf Karim" }, { user_id: "u3", name: "Layla Hassan" },
    ];
    const contacts = [
      { id: "c1", name: "Nadia Iqbal", email: "nadia@crescent.co" }, { id: "c2", name: "Omar Farouk", email: "omar@zenith.io" },
      { id: "c3", name: "Sana Malik", email: "sana@almanar.com" }, { id: "c4", name: "Bilal Ahmed", email: "bilal@northgate.co" },
      { id: "c5", name: "Hana Yusuf", email: "hana@lumen.app" }, { id: "c6", name: "Tariq Aziz", email: "tariq@harbor.co" },
    ];
    const stages = [
      { id: "s1", name: "New Lead", order_index: 0, close_probability: 10, color: "slate" },
      { id: "s2", name: "Qualified", order_index: 1, close_probability: 30, color: "teal" },
      { id: "s3", name: "Proposal Sent", order_index: 2, close_probability: 55, color: "gold" },
      { id: "s4", name: "Negotiation", order_index: 3, close_probability: 75, color: "amber" },
      { id: "s5", name: "Verbal Commit", order_index: 4, close_probability: 90, color: "green" },
    ];
    const p2s = [
      { id: "p2s1", name: "Outreach", order_index: 0, close_probability: 15, color: "slate" },
      { id: "p2s2", name: "In Talks", order_index: 1, close_probability: 45, color: "teal" },
      { id: "p2s3", name: "Agreement", order_index: 2, close_probability: 80, color: "green" },
    ];
    const d = (id, stage, contact, title, value, assignee, ago, files, overdue, status) =>
      ({ id, stage_id: stage, contact_id: contact, title, value, currency: "USD", assigned_to: assignee, status: status || "open", files: files || 0, overdue: !!overdue, stage_entered_at: new Date(Date.now() - ago * DAY).toISOString(), pipeline_id: "p1" });
    const deals = [
      d("d1", "s1", "c1", "Crescent Co — brand retainer", 12000, "u1", 1, 0, false),
      d("d2", "s1", "c4", "Northgate — landing page", 4500, "u2", 5, 1, true),
      d("d3", "s2", "c2", "Zenith — growth package", 26000, "u1", 2, 2, false),
      d("d4", "s2", "c5", "Lumen — SEO sprint", 8800, "u3", 9, 0, true),
      d("d5", "s3", "c3", "Al Manar — full rebrand", 42000, "u1", 3, 3, false),
      d("d6", "s3", "c6", "Harbor — ads management", 15500, "u2", 6, 1, false),
      d("d7", "s4", "c2", "Zenith — retainer upsell", 30000, "u3", 4, 2, false),
      d("d8", "s5", "c1", "Crescent Co — Q3 expansion", 55000, "u1", 2, 4, false),
      d("dw", "s5", "c3", "Al Manar — won deal", 18000, "u2", 12, 1, false, "won"),
    ];
    return {
      user: { id: "u1", email: "aisha@northstar.agency", name: "Aisha Rahman" },
      workspace: { id: "ws", name: "Northstar Agency" }, role: "owner", members, contacts,
      pipelines: [{ id: "p1", name: "Sales Pipeline" }, { id: "p2", name: "Partnerships" }],
      stagesByPipe: { p1: stages, p2: p2s }, deals, dealsByPipe: { p1: deals, p2: [] },
      target: 120000,
      notes: { d5: [{ content: "Client loved the moodboard. Wants a call Thursday to review typography.", at: new Date(Date.now() - 1 * DAY).toISOString(), by: "Aisha Rahman" }] },
      filesByDeal: { d5: [{ file_name: "AlManar-Rebrand-Proposal.pdf" }, { file_name: "Moodboard-v2.png" }, { file_name: "Scope-of-work.pdf" }] },
      activity: { d5: [
        { type: "deal_change", description: "Deal moved to Proposal Sent", at: new Date(Date.now() - 3 * DAY).toISOString() },
        { type: "note", description: "Added a note", at: new Date(Date.now() - 1 * DAY).toISOString() },
        { type: "email", description: "Sent proposal email", at: new Date(Date.now() - 2.5 * DAY).toISOString() },
      ] },
    };
  })();

  /* ── State ──────────────────────────────────────────────────────────────── */
  const state = {
    loaded: false, loading: false, error: null, previewState: "default",
    user: null, workspaceId: null, workspaceName: "", role: "owner",
    pipelines: [], activePipe: null, stages: [], deals: [], contacts: [], members: [],
    target: 0, view: "board", filters: { search: "", assignee: "", vmin: "", vmax: "" },
    selected: new Set(), sheetDeal: null, sheetTab: "overview", sheetNotes: [], sheetFiles: [], sheetActivity: [],
    editPipe: null, flashOk: null, switchOpen: false,
  };
  const PREVIEW_STATES = ["default", "empty", "loading", "error", "success"];
  const stp = (name) => !connected() && state.previewState === name;
  const canManage = () => ["owner", "admin", "manager"].includes(state.role) || !connected();
  const canWrite = () => ["owner", "admin", "manager", "staff"].includes(state.role) || !connected();
  const memberName = (id) => state.members.find((m) => m.user_id === id)?.name || null;
  const contactById = (id) => state.contacts.find((c) => c.id === id) || null;

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

        const { data: pipes } = await c.from("pipelines").select("id,name").eq("workspace_id", active.id).order("created_at");
        state.pipelines = pipes || [];
        if (!state.pipelines.length) { state.loaded = true; state.loading = false; render(); return; }
        if (!state.activePipe || !state.pipelines.find((p) => p.id === state.activePipe)) state.activePipe = state.pipelines[0].id;

        // Members (best-effort names for assignees) + contacts (typeahead).
        const [{ data: mems }, { data: cons }] = await Promise.all([
          c.from("memberships").select("user_id, profiles(name,email)").eq("workspace_id", active.id),
          c.from("contacts").select("id,first_name,last_name,email").eq("workspace_id", active.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
        ]);
        state.members = (mems || []).map((m) => ({ user_id: m.user_id, name: m.profiles?.name || m.profiles?.email || null }));
        state.contacts = (cons || []).map((c2) => ({ id: c2.id, name: [c2.first_name, c2.last_name].filter(Boolean).join(" ") || c2.email || "Contact", email: c2.email }));

        await loadPipeline(active.id, state.activePipe);
      } catch (e) { state.error = e.message || String(e); }
      state.loading = false; state.loaded = true;
    } else {
      state.user = MOCK.user; state.workspaceId = MOCK.workspace.id; state.workspaceName = MOCK.workspace.name; state.role = MOCK.role;
      state.pipelines = MOCK.pipelines; state.activePipe = state.activePipe || MOCK.pipelines[0].id;
      state.members = MOCK.members; state.contacts = MOCK.contacts;
      state.stages = MOCK.stagesByPipe[state.activePipe] || []; state.deals = MOCK.dealsByPipe[state.activePipe] || []; state.target = MOCK.target;
      state.loaded = true; state.loading = false;
    }
    render();
  }
  function pickActive(list) { const usable = (list || []).filter((w) => w.status !== "archived"); if (!usable.length) return list[0] || null; let id; try { id = localStorage.getItem(ACTIVE_KEY); } catch (e) {} return usable.find((w) => w.id === id) || usable[0]; }

  async function loadPipeline(ws, pipeId) {
    const c = ensureClient();
    const [{ data: stages }, { data: deals }, { data: tgt }] = await Promise.all([
      c.from("pipeline_stages").select("*").eq("pipeline_id", pipeId).order("order_index"),
      c.from("deals").select("*").eq("workspace_id", ws).eq("pipeline_id", pipeId).order("created_at", { ascending: false }),
      c.from("pipeline_targets").select("monthly_target").eq("pipeline_id", pipeId).maybeSingle(),
    ]);
    state.stages = stages || []; state.deals = deals || []; state.target = Number(tgt?.monthly_target || 0);
    // Card meta: file counts + overdue-task contacts (one query each).
    try {
      const dealIds = state.deals.map((d) => d.id);
      if (dealIds.length) {
        const { data: files } = await c.from("deal_files").select("deal_id").in("deal_id", dealIds);
        const fmap = {}; (files || []).forEach((f) => (fmap[f.deal_id] = (fmap[f.deal_id] || 0) + 1));
        const today = new Date().toISOString().slice(0, 10);
        const { data: tasks } = await c.from("contact_tasks").select("contact_id").eq("workspace_id", ws).eq("status", "open").lt("due_date", today);
        const overdue = new Set((tasks || []).map((t) => t.contact_id));
        state.deals.forEach((d) => { d.files = fmap[d.id] || 0; d.overdue = d.contact_id ? overdue.has(d.contact_id) : false; });
      }
    } catch (e) { /* card meta is best-effort */ }
  }

  async function switchPipeline(pipeId) {
    state.activePipe = pipeId; state.selected.clear(); state.switchOpen = false;
    if (!connected()) { state.stages = MOCK.stagesByPipe[pipeId] || []; state.deals = MOCK.dealsByPipe[pipeId] || []; render(); return; }
    state.loading = true; render();
    try { await loadPipeline(state.workspaceId, pipeId); } catch (e) { state.error = e.message; }
    state.loading = false; render();
  }

  /* ── Derived: deals for a stage (filtered), forecast ────────────────────── */
  function filtered(deals) {
    const f = state.filters, q = f.search.trim().toLowerCase();
    return deals.filter((d) => {
      if (d.status !== "open") return false;
      if (f.assignee && d.assigned_to !== f.assignee) return false;
      if (f.vmin && Number(d.value || 0) < Number(f.vmin)) return false;
      if (f.vmax && Number(d.value || 0) > Number(f.vmax)) return false;
      if (q) { const hay = (d.title + " " + (contactById(d.contact_id)?.name || "")).toLowerCase(); if (!hay.includes(q)) return false; }
      return true;
    });
  }
  function forecast() {
    const open = state.deals.filter((d) => d.status === "open");
    let weighted = 0, openTotal = 0;
    open.forEach((d) => { const st = state.stages.find((s) => s.id === d.stage_id); const p = Number(st?.close_probability || 0); weighted += Number(d.value || 0) * p / 100; openTotal += Number(d.value || 0); });
    const wonTotal = state.deals.filter((d) => d.status === "won").reduce((s, d) => s + Number(d.value || 0), 0);
    return { weighted, openTotal, openCount: open.length, wonTotal, target: Number(state.target || 0) };
  }
  function daysIn(d) { try { return Math.floor((Date.now() - new Date(d.stage_entered_at).getTime()) / DAY); } catch (e) { return 0; } }

  /* ── Shell ──────────────────────────────────────────────────────────────── */
  const NAV = [
    { key: "board", label: "Pipeline board", ico: "board", hash: "#/pipeline" },
    { key: "settings", label: "Pipelines & stages", ico: "list", hash: "#/settings/pipelines" },
  ];
  function shell(activeKey, content) {
    const nav = NAV.map((n) => `<div class="nav-item ${n.key === activeKey ? "active" : ""}" data-hash="${n.hash}"><span class="ni-ico">${svg(n.ico)}</span><span>${n.label}</span></div>`).join("");
    return `
      <aside class="rail" id="rail">
        <div class="brand"><span class="mark">✦</span><span><b>AiMind</b><em>Share</em></span></div>
        <div class="nav-group"><div class="nav-group-label">Pipeline</div>${nav}</div>
        <div class="rail-foot">M11 · Pipeline</div>
      </aside>
      <header class="tbar">
        <button class="icon-btn rail-burger" id="railBurger" aria-label="Menu">☰</button>
        <div class="ws-trigger" style="cursor:default">
          <span class="ws-badge">${esc(initials(state.workspaceName || "AiMindShare"))}</span>
          <span class="ws-meta"><span class="ws-name">${esc(state.workspaceName || "Workspace")}</span><span class="ws-kind">Pipeline</span></span>
        </div>
        <div class="tb-search"><span>${svg("search", 15)}</span><span class="tbs-label">Search…</span><span class="kbd">⌘K</span></div>
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
      Connect a project to read live pipelines, deals and the forecast. Sample data shown. Preview state:
      ${PREVIEW_STATES.map((s) => `<button class="link ${state.previewState === s ? "on" : ""}" data-preview="${s}">${s}</button>`).join(" ")}</div>`;
  }
  function pageHead(sub) {
    return `<div class="page-head reveal"><span class="eyebrow">Module · M11</span>
      <h1 style="margin-top:12px">Pipeline &amp; <em>deals</em></h1><p class="sub">${sub}</p></div>`;
  }
  function flash() { if (!state.flashOk) return ""; const m = state.flashOk; state.flashOk = null; return `<div class="ok-banner reveal"><span class="okb-ico">${svg("check", 18)}</span>${esc(m)}</div>`; }
  function skeleton() {
    return `<div class="page-head"><div class="skeleton" style="width:280px;height:44px;border-radius:12px"></div></div>
      <div class="skeleton" style="height:120px;border-radius:24px;margin:16px 0"></div>
      <div class="board" style="margin-top:18px">${Array(4).fill('<div class="skeleton" style="height:340px;width:300px;flex:none;border-radius:24px"></div>').join("")}</div>`;
  }
  function errorBlock(msg) { return `<div class="panel" style="border-color:rgba(196,97,78,.4)"><div class="empty-state"><div class="es-ico" style="background:rgba(196,97,78,.12);color:var(--status-danger)">⚠</div><h3>Something went wrong</h3><p>${esc(msg || "We couldn't load this workspace's pipeline.")}</p><button class="btn btn-ghost es-cta" id="retryBtn">Retry</button></div></div>`; }

  /* ═══ VIEW: Board / List ══════════════════════════════════════════════════ */
  function viewBoard() {
    if (stp("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    if (stp("error") || (connected() && state.error)) return previewStrip() + errorBlock(state.error);
    if ((connected() && !state.pipelines.length)) return previewStrip() + pageHead(subLine()) + noPipelines();
    const empty = stp("empty");
    const stages = empty ? state.stages : state.stages;
    const deals = empty ? [] : state.deals;

    const fc = empty ? { weighted: 0, openTotal: 0, openCount: 0, wonTotal: 0, target: state.target } : forecast();
    return `${previewStrip()}${flash()}
      ${pageHead(subLine())}
      ${toolbar()}
      ${forecastBar(fc)}
      ${state.view === "board" ? filterBar() + board(stages, deals) : filterBar() + listView(stages, deals)}`;
  }
  function subLine() { return `Track deals across stages with optimistic drag, a weighted forecast, and win/loss analytics. Every stage move writes the contact's CRM timeline for automations (M13) and reporting (M40).`; }
  function noPipelines() {
    return `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("board", 22)}</div><h3>No pipelines yet</h3>
      <p>A new workspace is seeded with a default Sales Pipeline automatically. Create one here to start tracking deals.</p>
      ${canManage() ? `<button class="btn btn-primary es-cta" id="firstPipe">${svg("plus", 14)} Create a pipeline</button>` : ""}</div></div>`;
  }
  function toolbar() {
    const p = state.pipelines.find((x) => x.id === state.activePipe) || { name: "Pipeline" };
    const menu = state.switchOpen ? `<div class="pop open" style="top:52px;left:0" id="pipePop">
      <div class="pop-label">Pipelines</div>
      ${state.pipelines.map((pp) => `<div class="pop-item" data-pipe="${pp.id}"><span class="ws-badge">${esc(initials(pp.name))}</span><span class="pi-name">${esc(pp.name)}</span>${pp.id === state.activePipe ? `<span class="pi-check">${svg("check", 14)}</span>` : ""}</div>`).join("")}
      <div class="pop-sep"></div>
      <div class="pop-item action" data-hash="#/settings/pipelines">${svg("plus", 14)} Manage pipelines</div></div>` : "";
    return `<div class="pl-toolbar">
      <div class="pipe-switch">
        <div class="ps-trigger" id="pipeTrigger"><span class="ps-badge">${esc(initials(p.name))}</span>
          <span><div class="ps-name">${esc(p.name)}</div><div class="ps-sub">${state.stages.length} stages · ${state.deals.filter((d) => d.status === "open").length} open</div></span>
          <span class="ps-chev">${svg("chevd", 13)}</span></div>${menu}</div>
      <div class="spacer"></div>
      <div class="seg-toggle">
        <button class="${state.view === "board" ? "on" : ""}" data-view="board">${svg("board", 14)} Board</button>
        <button class="${state.view === "list" ? "on" : ""}" data-view="list">${svg("list", 14)} List</button></div>
      <button class="btn btn-primary" id="addDeal" ${canWrite() ? "" : "disabled title='Staff+ only'"}>${svg("plus", 14)} Add deal</button>
    </div>`;
  }
  function forecastBar(fc) {
    const pctW = fc.target ? Math.min(100, (fc.weighted / fc.target) * 100) : 0;
    const pctWon = fc.target ? Math.min(100, (fc.wonTotal / fc.target) * 100) : 0;
    return `<div class="forecast reveal">
      <div class="fc-top">
        <div class="fc-metric accent"><span class="fcm-label">Weighted forecast</span><span class="fcm-val">${money(fc.weighted)}</span><span class="fcm-sub">Σ value × stage probability</span></div>
        <div class="fc-metric"><span class="fcm-label">Open pipeline</span><span class="fcm-val">${money(fc.openTotal)}</span><span class="fcm-sub">${fc.openCount} open deal${fc.openCount === 1 ? "" : "s"}</span></div>
        <div class="fc-metric gold"><span class="fcm-label">Won this view</span><span class="fcm-val">${money(fc.wonTotal)}</span><span class="fcm-sub">closed revenue</span></div>
        <div class="spacer"></div>
        <div class="fc-metric" style="text-align:right"><span class="fcm-label">Monthly target</span><span class="fcm-val">${money(fc.target)}</span></div>
        <button class="btn btn-ghost btn-sm fc-target-btn" id="editTarget" ${canManage() ? "" : "disabled"}>${svg("target", 13)} Set target</button>
      </div>
      <div class="fc-track"><div class="fc-fill won" style="width:${pctWon}%"></div><div class="fc-fill" style="width:${pctW}%"></div></div>
      <div class="fc-scale"><span>$0</span><span>${money(fc.target)}</span></div>
      <div class="fc-legend"><span><span class="dot weighted"></span>Weighted forecast (${fc.target ? Math.round(pctW) : 0}%)</span><span><span class="dot won"></span>Won so far (${fc.target ? Math.round(pctWon) : 0}%)</span></div>
    </div>`;
  }
  function filterBar() {
    const f = state.filters;
    const mem = state.members.filter((m) => m.name);
    return `<div class="filter-bar">
      <div class="fb-input search"><span class="fb-ico">${svg("search", 14)}</span><input id="fSearch" placeholder="Search deals…" value="${esc(f.search)}"></div>
      <div class="fb-input"><span class="fb-ico">${svg("user", 14)}</span><select id="fAssignee"><option value="">All assignees</option>${mem.map((m) => `<option value="${m.user_id}" ${f.assignee === m.user_id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></div>
      <div class="fb-input"><span class="fb-ico">${svg("dollar", 14)}</span><input id="fVmin" type="number" placeholder="Min" value="${esc(f.vmin)}" style="width:70px"><span style="color:var(--ink-400)">–</span><input id="fVmax" type="number" placeholder="Max" value="${esc(f.vmax)}" style="width:70px"></div>
      ${(f.search || f.assignee || f.vmin || f.vmax) ? `<button class="btn btn-ghost btn-sm fb-clear" id="fClear">${svg("x", 12)} Clear</button>` : ""}
    </div>`;
  }
  function board(stages, deals) {
    if (!stages.length) return `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("list", 22)}</div><h3>No stages in this pipeline</h3><p>Add stages in the pipeline editor to start moving deals across the board.</p>${canManage() ? `<button class="btn btn-ghost es-cta" data-hash="#/settings/pipelines">Edit stages</button>` : ""}</div></div>`;
    return `<div class="board-scroll"><div class="board" id="board">${stages.map((s) => column(s, filtered(deals).filter((d) => d.stage_id === s.id))).join("")}</div></div>`;
  }
  function column(s, deals) {
    const total = deals.reduce((a, d) => a + Number(d.value || 0), 0);
    const cards = deals.length ? deals.map(dealCard).join("") : `<div class="col-empty">Drop deals here</div>`;
    return `<div class="column hue-${esc(s.color || "teal")}" data-stage="${s.id}">
      <div class="col-head"><span class="col-dot"></span><span class="col-name">${esc(s.name)}</span>
        <span class="col-prob">${Math.round(Number(s.close_probability || 0))}%</span><span class="spacer"></span><span class="col-count">${deals.length}</span></div>
      <div class="col-total">${money(total)}</div>
      <div class="kanban-cards" data-stage="${s.id}">${cards}</div>
      <button class="col-add" data-addstage="${s.id}">${svg("plus", 13)} Add deal</button></div>`;
  }
  function dealCard(d) {
    const con = contactById(d.contact_id);
    const dz = daysIn(d);
    const dCls = dz > 7 ? "hot" : dz >= 3 ? "warm" : "";
    const icons = [];
    if (d.files) icons.push(`<span class="dc-i" title="${d.files} file${d.files === 1 ? "" : "s"}">${svg("file", 13)}</span>`);
    if (d.overdue) icons.push(`<span class="dc-i warn" title="Overdue task">${svg("alert", 13)}</span>`);
    return `<div class="deal-card hue-${esc(stageHue(d.stage_id))}" data-deal="${d.id}">
      <div class="dc-spine"></div>
      <div class="dc-top">
        <span class="dc-avatar" title="${esc(memberName(d.assigned_to) || "Unassigned")}">${esc(con ? initials(con.name) : "—")}</span>
        <div class="dc-body"><div class="dc-title">${esc(d.title || "Untitled deal")}</div>
          <div class="dc-contact">${esc(con ? con.name : "No contact")}</div></div>
      </div>
      <div class="dc-foot"><span class="dc-value">${money(d.value)}</span><span class="spacer"></span>
        <span class="dc-icons">${icons.join("")}</span>
        <span class="days-badge ${dCls}" title="Days in stage">${dz}d</span></div>
    </div>`;
  }
  const stageHue = (sid) => state.stages.find((s) => s.id === sid)?.color || "teal";

  /* List view */
  function listView(stages, deals) {
    const rows = filtered(deals);
    const allSel = rows.length && rows.every((d) => state.selected.has(d.id));
    const bulk = state.selected.size ? `<div class="bulk-bar reveal"><span class="bb-count">${state.selected.size} selected</span>
      <span class="spacer"></span>
      <select id="bulkStage" class="fb-input" style="height:36px;border-radius:10px;padding:0 10px">${stages.map((s) => `<option value="${s.id}">Move to · ${esc(s.name)}</option>`).join("")}</select>
      <button class="btn btn-primary btn-sm" id="bulkGo">${svg("arrow", 13)} Move</button>
      <button class="btn btn-ghost btn-sm" id="bulkClear">Clear</button></div>` : "";
    const table = rows.length ? `<div class="panel reveal" style="overflow-x:auto"><table class="table">
      <thead><tr><th style="width:20px"><span class="chk ${allSel ? "on" : ""}" id="selAll">${svg("check", 11)}</span></th>
        <th data-sort="title">Deal</th><th data-sort="stage">Stage</th><th class="num" data-sort="value">Value</th><th>Assignee</th><th>Contact</th><th class="num" data-sort="days">Days</th></tr></thead>
      <tbody>${rows.map((d) => listRow(d, stages)).join("")}</tbody></table></div>`
      : `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("list", 22)}</div><h3>No deals match</h3><p>Adjust the filters, or add a deal to this pipeline.</p></div></div>`;
    return bulk + table;
  }
  function listRow(d, stages) {
    const s = stages.find((x) => x.id === d.stage_id) || {};
    const con = contactById(d.contact_id);
    const sel = state.selected.has(d.id);
    const dz = daysIn(d);
    return `<tr data-deal="${d.id}">
      <td><span class="chk ${sel ? "on" : ""}" data-sel="${d.id}">${svg("check", 11)}</span></td>
      <td data-open="${d.id}" style="cursor:pointer"><div class="cell-deal"><span class="cd-name">${esc(d.title || "Untitled")}</span></div></td>
      <td><span class="stage-chip hue-${esc(s.color || "teal")}"><span class="sc-dot"></span>${esc(s.name || "—")}</span></td>
      <td class="num">${money(d.value)}</td>
      <td>${esc(memberName(d.assigned_to) || "—")}</td>
      <td>${esc(con ? con.name : "—")}</td>
      <td class="num">${dz}d</td></tr>`;
  }

  /* ═══ VIEW: Settings — pipelines & stages ═════════════════════════════════ */
  function viewSettings() {
    if (stp("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    if (stp("error") || (connected() && state.error)) return previewStrip() + errorBlock(state.error);
    const editId = state.editPipe || state.activePipe || state.pipelines[0]?.id;
    const stages = editStages(editId);
    const list = state.pipelines.map((p) => `<div class="pipe-list-item ${p.id === editId ? "on" : ""}" data-editpipe="${p.id}">
      <span class="ps-badge">${esc(initials(p.name))}</span><div style="flex:1"><div style="font-family:var(--font-serif);font-size:15px;color:var(--ink-900)">${esc(p.name)}</div>
      <div style="font-size:12px;color:var(--ink-400)">${(editStages(p.id) || []).length} stages</div></div>${svg("chev", 15)}</div>`).join("");
    return `${previewStrip()}${flash()}
      ${pageHead(`Configure your pipelines and their stages. Reorder by drag, rename inline, and tune each stage's close probability — the weighting behind your forecast. ${canManage() ? "" : "<b>Manager+</b> can edit; you have read-only access."}`)}
      <div class="sec-head"><h2>Your <em>pipelines</em></h2><div class="spacer"></div>
        <button class="btn btn-ghost btn-sm" id="newPipe" ${canManage() ? "" : "disabled"}>${svg("plus", 13)} New pipeline</button></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin-bottom:26px">${list || '<div class="col-empty">No pipelines yet</div>'}</div>
      <div class="sec-head"><h2>Stage <em>editor</em></h2><div class="spacer"></div><span class="freshness">${esc((state.pipelines.find((p) => p.id === editId) || {}).name || "")}</span></div>
      <div class="stage-editor" id="stageEditor" data-pipe="${editId}">${(stages || []).map(stageEditorRow).join("") || '<div class="col-empty">This pipeline has no stages yet.</div>'}</div>
      ${canManage() ? `<button class="col-add" id="addStage" style="max-width:220px;margin-top:12px">${svg("plus", 13)} Add stage</button>` : ""}
      <div class="defer-note" style="margin-top:20px"><span class="dn-ico">${svg("info", 14)}</span>Stage config is <b>manager+</b> (RLS + <span class="mono">pipeline.manage</span>). Moving deals is staff+ and writes the CRM timeline via <span class="mono">move_deal_stage()</span>.</div>`;
  }
  function editStages(pipeId) { return connected() ? (pipeId === state.activePipe ? state.stages : null) || state._editStages?.[pipeId] : (MOCK.stagesByPipe[pipeId] || []); }
  function stageEditorRow(s) {
    const dis = canManage() ? "" : "disabled";
    return `<div class="stage-row hue-${esc(s.color || "teal")}" data-stage="${s.id}">
      <span class="drag-handle" title="Drag to reorder">${svg("grip", 16)}</span>
      <div class="sr-color">${HUES.map((h) => `<span class="swatch-dot hue-${h} ${s.color === h ? "on" : ""}" data-hue="${h}" style="background:var(--hue)"></span>`).join("")}</div>
      <input class="sr-name" value="${esc(s.name)}" ${dis} placeholder="Stage name">
      <div class="sr-prob"><input type="range" min="0" max="100" step="5" value="${Math.round(Number(s.close_probability || 0))}" ${dis}><span class="sp-val">${Math.round(Number(s.close_probability || 0))}%</span></div>
      ${canManage() ? `<button class="sr-del" title="Delete stage">${svg("trash", 15)}</button>` : ""}
    </div>`;
  }

  /* ═══ Deal drawer (Sheet) ═════════════════════════════════════════════════ */
  async function openSheet(dealId) {
    const d = state.deals.find((x) => x.id === dealId); if (!d) return;
    state.sheetDeal = dealId; state.sheetTab = "overview"; state.sheetNotes = []; state.sheetFiles = []; state.sheetActivity = [];
    renderSheet();
    if (!connected()) {
      state.sheetNotes = (MOCK.notes[dealId] || []).slice();
      state.sheetFiles = (MOCK.filesByDeal[dealId] || []).slice();
      state.sheetActivity = (MOCK.activity[dealId] || []).slice();
      renderSheet(); return;
    }
    try {
      const c = ensureClient();
      const [{ data: notes }, { data: files }, { data: acts }] = await Promise.all([
        c.from("deal_notes").select("*").eq("deal_id", dealId).order("created_at", { ascending: false }),
        c.from("deal_files").select("*").eq("deal_id", dealId).order("created_at", { ascending: false }),
        d.contact_id ? c.from("activity_log").select("type,description,created_at,metadata").eq("workspace_id", state.workspaceId).eq("contact_id", d.contact_id).order("created_at", { ascending: false }).limit(40) : Promise.resolve({ data: [] }),
      ]);
      state.sheetNotes = (notes || []).map((n) => ({ content: n.content, at: n.created_at, by: memberName(n.user_id) }));
      state.sheetFiles = files || [];
      state.sheetActivity = (acts || []).map((a) => ({ type: a.type, description: a.description, at: a.created_at }));
    } catch (e) { toast(e.message || "Failed to load deal", "danger"); }
    renderSheet();
  }
  function closeSheet() { state.sheetDeal = null; const r = $("#sheetRoot"); const sc = $("#sheetScrim"); if (sc) sc.classList.remove("open"); const sh = $(".sheet", r); if (sh) sh.classList.remove("open"); setTimeout(() => { if (!state.sheetDeal) r.innerHTML = ""; }, 380); }
  function renderSheet() {
    const r = $("#sheetRoot");
    const d = state.deals.find((x) => x.id === state.sheetDeal);
    if (!d) { r.innerHTML = ""; return; }
    const con = contactById(d.contact_id);
    const statusPill = d.status === "won" ? `<span class="pill success">${svg("trophy", 12)} Won</span>` : d.status === "lost" ? `<span class="pill danger">${svg("ban", 12)} Lost</span>` : `<span class="pill plain">Open</span>`;
    const tabs = ["overview", "notes", "files", "activity"];
    const body = { overview: sheetOverview, notes: sheetNotes, files: sheetFiles, activity: sheetActivity }[state.sheetTab](d, con);
    const actions = d.status === "open"
      ? `<button class="btn btn-primary" id="winDeal" ${canWrite() ? "" : "disabled"}>${svg("trophy", 14)} Mark won</button>
         <button class="btn btn-ghost" id="loseDeal" ${canWrite() ? "" : "disabled"}>${svg("ban", 14)} Mark lost</button>`
      : `<button class="btn btn-ghost" id="reopenDeal" ${canWrite() ? "" : "disabled"}>${svg("arrow", 14)} Reopen deal</button>`;
    r.innerHTML = `<div class="sheet-scrim" id="sheetScrim"></div>
      <aside class="sheet" role="dialog" aria-label="Deal detail">
        <div class="sheet-head">
          <div class="sh-eyebrow"><span class="eyebrow">Deal · ${esc((state.pipelines.find((p) => p.id === state.activePipe) || {}).name || "Pipeline")}</span><span class="spacer"></span>
            <button class="icon-btn" id="sheetClose">${svg("x", 15)}</button></div>
          <div class="sh-title" ${canWrite() ? 'contenteditable="true"' : ""} id="shTitle">${esc(d.title || "Untitled deal")}</div>
          <div class="sh-meta">${statusPill}<span>${money(d.value)}</span>${con ? `<span>${svg("user", 12)} ${esc(con.name)}</span>` : ""}<span>${svg("clock", 12)} ${daysIn(d)}d in stage</span></div>
        </div>
        <div class="sh-tabs">${tabs.map((t) => `<div class="sh-tab ${state.sheetTab === t ? "on" : ""}" data-tab="${t}">${t[0].toUpperCase() + t.slice(1)}</div>`).join("")}</div>
        <div class="sh-body">${body}</div>
        <div class="sh-actions">${actions}</div>
      </aside>`;
    nextTick(() => { $("#sheetScrim").classList.add("open"); $(".sheet", r).classList.add("open"); });
    wireSheet(d);
  }
  function sheetOverview(d, con) {
    const mem = state.members.filter((m) => m.name);
    return `<div class="kv-grid">
      <div class="kv full"><label>Stage</label><select id="ov_stage">${state.stages.map((s) => `<option value="${s.id}" ${s.id === d.stage_id ? "selected" : ""}>${esc(s.name)} · ${Math.round(Number(s.close_probability || 0))}%</option>`).join("")}</select></div>
      <div class="kv"><label>Value</label><input class="num" id="ov_value" type="number" value="${esc(d.value ?? "")}"></div>
      <div class="kv"><label>Currency</label><input id="ov_currency" value="${esc(d.currency || "USD")}" maxlength="3"></div>
      <div class="kv"><label>Assignee</label><select id="ov_assignee"><option value="">Unassigned</option>${mem.map((m) => `<option value="${m.user_id}" ${m.user_id === d.assigned_to ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></div>
      <div class="kv"><label>Expected close</label><input id="ov_close" type="date" value="${esc(d.expected_close_date || "")}"></div>
      <div class="kv full"><label>Contact</label><input id="ov_contact" value="${esc(con ? con.name : "")}" placeholder="Search contacts…" ${con ? "readonly" : ""}></div>
    </div>
    ${canWrite() ? `<button class="btn btn-primary" id="ov_save" style="width:100%;justify-content:center">${svg("check", 14)} Save changes</button>` : `<div class="defer-note"><span class="dn-ico">${svg("info", 14)}</span>Read-only — editing deals requires staff+.</div>`}`;
  }
  function sheetNotes(d) {
    const add = canWrite() ? `<div class="mini-add"><textarea id="noteText" placeholder="Add a note…"></textarea></div>
      <button class="btn btn-ghost btn-sm" id="noteAdd" style="margin-bottom:12px">${svg("plus", 13)} Add note</button>` : "";
    const list = state.sheetNotes.length ? state.sheetNotes.map((n) => `<div class="note-item"><div class="ni-text">${esc(n.content)}</div><div class="ni-meta">${esc(n.by || "—")} · ${esc(fmtDT(n.at))}</div></div>`).join("")
      : `<div class="col-empty">No notes yet. Capture context, next steps, and call summaries here.</div>`;
    return add + list;
  }
  function sheetFiles(d) {
    const add = canWrite() ? `<button class="btn btn-ghost btn-sm" id="fileAdd" style="margin-bottom:14px">${svg("plus", 13)} Attach file</button>` : "";
    const list = state.sheetFiles.length ? state.sheetFiles.map((f) => `<div class="file-item"><span class="fi-ico">${svg("file", 16)}</span><div style="flex:1"><div class="fi-name">${esc(f.file_name || "File")}</div><div class="fi-sub">${f.asset_id ? "Media Library asset" : "Reference"}</div></div></div>`).join("")
      : `<div class="col-empty">No files attached.</div>`;
    return add + list + `<div class="defer-note" style="margin-top:14px"><span class="dn-ico">${svg("info", 14)}</span>The full asset picker arrives with <b>M06 Media Library</b> (not built yet). Attachments link a <span class="mono">deal_files.asset_id</span> today.</div>`;
  }
  function sheetActivity(d) {
    if (!state.sheetActivity.length) return `<div class="col-empty">No timeline activity yet. Stage moves, notes and emails appear here.</div>`;
    return `<div class="timeline">${state.sheetActivity.map((a) => `<div class="tl-item ${esc(a.type)}"><div class="tl-title">${esc(a.description || a.type)}</div><div class="tl-meta">${esc(a.type)} · ${esc(fmtDT(a.at))}</div></div>`).join("")}</div>`;
  }
  function fmtDT(d) { try { return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch (e) { return "—"; } }

  /* ── Router + render ────────────────────────────────────────────────────── */
  function currentRoute() { const h = (location.hash || "").replace(/^#/, ""); if (h.includes("/settings/pipelines")) return { key: "settings" }; return { key: "board" }; }
  function render() {
    const app = $("#app"); const r = currentRoute();
    const view = { board: viewBoard, settings: viewSettings }[r.key];
    app.innerHTML = shell(r.key, view());
    afterShell();
    const inner = $(".content-inner");
    wireCommon(inner);
    (r.key === "board" ? wireBoard : wireSettings)(inner);
    if (state.sheetDeal) renderSheet();
    document.body.classList.add("js-ready");
  }
  function afterShell() {
    const pill = $("#connPill"); if (pill) { if (connected()) { pill.className = "pill success"; pill.textContent = "connected"; } else { pill.className = "pill plain"; pill.textContent = "mockup mode"; } }
    setTheme(root.getAttribute("data-theme"));
    $("#themeToggle").addEventListener("click", () => setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"));
    $("#openConnect2").addEventListener("click", openDrawer);
    const burger = $("#railBurger"); if (burger) burger.addEventListener("click", () => $("#rail").classList.toggle("open"));
    $$("[data-hash]").forEach((n) => n.addEventListener("click", () => { location.hash = n.dataset.hash; $("#rail")?.classList.remove("open"); }));
  }
  function wireCommon(mount) {
    $$("[data-preview]", mount).forEach((b) => b.addEventListener("click", () => { state.previewState = b.dataset.preview; render(); }));
    const retry = $("#retryBtn", mount); if (retry) retry.addEventListener("click", () => { state.previewState = "default"; boot(); });
  }

  /* ── Board wiring ───────────────────────────────────────────────────────── */
  function wireBoard(mount) {
    const trig = $("#pipeTrigger", mount); if (trig) trig.addEventListener("click", (e) => { e.stopPropagation(); state.switchOpen = !state.switchOpen; render(); });
    $$("[data-pipe]", mount).forEach((it) => it.addEventListener("click", () => switchPipeline(it.dataset.pipe)));
    $$("[data-view]", mount).forEach((b) => b.addEventListener("click", () => { state.view = b.dataset.view; render(); }));
    const add = $("#addDeal", mount); if (add) add.addEventListener("click", () => openAddDeal());
    const fp = $("#firstPipe", mount); if (fp) fp.addEventListener("click", () => openNewPipeline());
    const et = $("#editTarget", mount); if (et) et.addEventListener("click", openEditTarget);
    $$("[data-addstage]", mount).forEach((b) => b.addEventListener("click", () => openAddDeal(b.dataset.addstage)));

    // filters
    const bind = (id, key, ev = "input") => { const n = $("#" + id, mount); if (n) n.addEventListener(ev, () => { state.filters[key] = n.value; if (state.view === "board") { /* live filter */ renderBoardCardsOnly(); } else render(); }); };
    bind("fSearch", "search"); bind("fVmin", "vmin"); bind("fVmax", "vmax");
    const fa = $("#fAssignee", mount); if (fa) fa.addEventListener("change", () => { state.filters.assignee = fa.value; render(); });
    const fc = $("#fClear", mount); if (fc) fc.addEventListener("click", () => { state.filters = { search: "", assignee: "", vmin: "", vmax: "" }; render(); });

    // card open + sortable
    $$(".deal-card[data-deal]", mount).forEach((c) => c.addEventListener("click", () => openSheet(c.dataset.deal)));
    if (state.view === "board") initSortable(mount);

    // list interactions
    $$("[data-sel]", mount).forEach((c) => c.addEventListener("click", (e) => { e.stopPropagation(); toggleSel(c.dataset.sel); }));
    const selAll = $("#selAll", mount); if (selAll) selAll.addEventListener("click", toggleSelAll);
    $$("[data-open]", mount).forEach((td) => td.addEventListener("click", () => openSheet(td.dataset.open)));
    const bg = $("#bulkGo", mount); if (bg) bg.addEventListener("click", () => bulkMove($("#bulkStage", mount).value));
    const bc = $("#bulkClear", mount); if (bc) bc.addEventListener("click", () => { state.selected.clear(); render(); });
  }
  function renderBoardCardsOnly() {
    // Re-render just the columns' cards for a snappy filter without losing input focus.
    const boardEl = $("#board"); if (!boardEl) return;
    state.stages.forEach((s) => {
      const col = boardEl.querySelector(`.kanban-cards[data-stage="${s.id}"]`); if (!col) return;
      const deals = filtered(state.deals).filter((d) => d.stage_id === s.id);
      col.innerHTML = deals.length ? deals.map(dealCard).join("") : `<div class="col-empty">Drop deals here</div>`;
      col.querySelectorAll(".deal-card[data-deal]").forEach((c) => c.addEventListener("click", () => openSheet(c.dataset.deal)));
      const head = boardEl.querySelector(`.column[data-stage="${s.id}"] .col-count`); if (head) head.textContent = deals.length;
      const tot = boardEl.querySelector(`.column[data-stage="${s.id}"] .col-total`); if (tot) tot.textContent = money(deals.reduce((a, d) => a + Number(d.value || 0), 0));
    });
    initSortable($(".content-inner"));
  }
  let sortables = [];
  function initSortable(mount) {
    if (!window.Sortable) return;
    sortables.forEach((s) => { try { s.destroy(); } catch (e) {} }); sortables = [];
    $$(".kanban-cards", mount).forEach((colEl) => {
      sortables.push(window.Sortable.create(colEl, {
        group: "deals", animation: reduce ? 0 : 180, ghostClass: "sortable-ghost", chosenClass: "sortable-chosen", dragClass: "sortable-drag",
        disabled: !canWrite(),
        onStart: () => $$(".kanban-cards", mount).forEach((c) => c.classList.add("drop-hot")),
        onEnd: async (evt) => {
          $$(".kanban-cards", mount).forEach((c) => c.classList.remove("drop-hot"));
          const dealId = evt.item.dataset.deal;
          const toStage = evt.to.dataset.stage, fromStage = evt.from.dataset.stage;
          if (toStage === fromStage) return;
          await moveDeal(dealId, toStage, fromStage, evt);
        },
      }));
    });
  }

  async function moveDeal(dealId, toStage, fromStage, evt) {
    const deal = state.deals.find((d) => d.id === dealId); if (!deal) return;
    const prev = deal.stage_id;
    deal.stage_id = toStage; deal.stage_entered_at = new Date().toISOString(); // optimistic
    updateColumnMeta();
    if (!connected()) { toast("Deal moved", "success"); return; }
    try {
      const c = ensureClient();
      const { error } = await c.rpc("move_deal_stage", { p_ws: state.workspaceId, p_deal: dealId, p_stage: toStage });
      if (error) throw error;
    } catch (e) {
      // rollback: restore model + DOM position
      deal.stage_id = prev;
      toast((e.message || "Move failed") + " — reverted", "danger");
      render();
    }
  }
  function updateColumnMeta() {
    const boardEl = $("#board"); if (!boardEl) return;
    state.stages.forEach((s) => {
      const deals = filtered(state.deals).filter((d) => d.stage_id === s.id);
      const cnt = boardEl.querySelector(`.column[data-stage="${s.id}"] .col-count`); if (cnt) cnt.textContent = deals.length;
      const tot = boardEl.querySelector(`.column[data-stage="${s.id}"] .col-total`); if (tot) tot.textContent = money(deals.reduce((a, d) => a + Number(d.value || 0), 0));
    });
    const fc = forecast(); const bar = $(".forecast"); if (bar) { const p = document.createElement("div"); p.innerHTML = forecastBar(fc); bar.replaceWith(p.firstElementChild); }
  }

  function toggleSel(id) { if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id); render(); }
  function toggleSelAll() { const rows = filtered(state.deals); if (rows.every((d) => state.selected.has(d.id))) state.selected.clear(); else rows.forEach((d) => state.selected.add(d.id)); render(); }
  async function bulkMove(toStage) {
    const ids = Array.from(state.selected); if (!ids.length) return;
    if (!connected()) { ids.forEach((id) => { const d = state.deals.find((x) => x.id === id); if (d) { d.stage_id = toStage; d.stage_entered_at = new Date().toISOString(); } }); state.selected.clear(); toast(`Moved ${ids.length} deals`, "success"); render(); return; }
    try {
      const c = ensureClient();
      const { data, error } = await c.rpc("bulk_move_stage", { p_ws: state.workspaceId, p_deals: ids, p_stage: toStage });
      if (error) throw error;
      state.selected.clear(); toast(`Moved ${data} deal${data === 1 ? "" : "s"}`, "success");
      await loadPipeline(state.workspaceId, state.activePipe); render();
    } catch (e) { toast(e.message || "Bulk move failed", "danger"); }
  }

  /* ── Sheet wiring ───────────────────────────────────────────────────────── */
  function wireSheet(d) {
    const r = $("#sheetRoot");
    $("#sheetClose", r)?.addEventListener("click", closeSheet);
    $("#sheetScrim", r)?.addEventListener("click", closeSheet);
    $$(".sh-tab", r).forEach((t) => t.addEventListener("click", () => { state.sheetTab = t.dataset.tab; renderSheet(); }));
    const title = $("#shTitle", r); if (title) title.addEventListener("blur", () => saveDealFields(d, { title: title.textContent.trim() }, false));
    $("#ov_save", r)?.addEventListener("click", () => {
      const patch = {
        stage_id: $("#ov_stage", r).value, value: num($("#ov_value", r).value), currency: ($("#ov_currency", r).value || "USD").toUpperCase().slice(0, 3),
        assigned_to: $("#ov_assignee", r).value || null, expected_close_date: $("#ov_close", r).value || null,
      };
      saveDealFields(d, patch, true);
    });
    $("#noteAdd", r)?.addEventListener("click", () => addNote(d));
    $("#fileAdd", r)?.addEventListener("click", () => addFile(d));
    $("#winDeal", r)?.addEventListener("click", () => closeDeal(d, "won"));
    $("#loseDeal", r)?.addEventListener("click", () => openLostModal(d));
    $("#reopenDeal", r)?.addEventListener("click", () => closeDeal(d, "open"));
  }
  const num = (v) => (v === "" || v == null ? null : Number(v));
  async function saveDealFields(d, patch, toastOk) {
    const stageChanged = patch.stage_id && patch.stage_id !== d.stage_id;
    Object.assign(d, patch); // optimistic
    if (stageChanged) d.stage_entered_at = new Date().toISOString();
    if (!connected()) { if (toastOk) toast("Deal updated", "success"); renderSheet(); render(); return; }
    try {
      const c = ensureClient();
      if (stageChanged) { const { error } = await c.rpc("move_deal_stage", { p_ws: state.workspaceId, p_deal: d.id, p_stage: patch.stage_id }); if (error) throw error; delete patch.stage_id; }
      if (Object.keys(patch).length) { const { error } = await c.from("deals").update(patch).eq("id", d.id); if (error) throw error; }
      if (toastOk) toast("Deal saved", "success");
      renderSheet(); render();
    } catch (e) { toast(e.message || "Save failed", "danger"); }
  }
  async function addNote(d) {
    const r = $("#sheetRoot"); const text = $("#noteText", r).value.trim(); if (!text) return;
    if (!connected()) { state.sheetNotes.unshift({ content: text, at: new Date().toISOString(), by: state.user?.name || "You" }); renderSheet(); toast("Note added", "success"); return; }
    try { const c = ensureClient(); const { error } = await c.from("deal_notes").insert({ workspace_id: state.workspaceId, deal_id: d.id, user_id: state.user.id, content: text }); if (error) throw error; state.sheetNotes.unshift({ content: text, at: new Date().toISOString(), by: state.user?.name }); renderSheet(); toast("Note added", "success"); }
    catch (e) { toast(e.message || "Failed", "danger"); }
  }
  async function addFile(d) {
    if (!connected()) { state.sheetFiles.unshift({ file_name: "New reference.pdf" }); renderSheet(); toast("File reference attached (M06 picker pending)", "info"); return; }
    const name = prompt("File name / reference (the M06 asset picker lands later):"); if (!name) return;
    try { const c = ensureClient(); const { error } = await c.from("deal_files").insert({ workspace_id: state.workspaceId, deal_id: d.id, file_name: name, added_by: state.user.id }); if (error) throw error; state.sheetFiles.unshift({ file_name: name }); d.files = (d.files || 0) + 1; renderSheet(); render(); toast("File attached", "success"); }
    catch (e) { toast(e.message || "Failed", "danger"); }
  }
  async function closeDeal(d, status, lostReason) {
    if (!connected()) { d.status = status; if (status === "won") d.won_at = new Date().toISOString(); if (status === "lost") d.lost_reason = lostReason; toast(status === "won" ? "Deal won 🎉" : status === "lost" ? "Deal marked lost" : "Deal reopened", status === "won" ? "success" : "info"); renderSheet(); render(); return; }
    try {
      const c = ensureClient();
      const { error } = await c.rpc("close_deal", { p_ws: state.workspaceId, p_deal: d.id, p_status: status, p_lost_reason: lostReason || null });
      if (error) throw error;
      d.status = status; d.lost_reason = lostReason || null; if (status === "won") d.won_at = new Date().toISOString();
      toast(status === "won" ? "Deal won 🎉" : status === "lost" ? "Deal marked lost" : "Deal reopened", status === "won" ? "success" : "info");
      renderSheet(); render();
    } catch (e) { toast(e.message || "Failed to close deal", "danger"); }
  }
  function openLostModal(d) {
    modal(`<div class="mc-head"><span class="mc-ico">${svg("ban", 18)}</span><div><h3>Mark deal lost</h3><div class="mc-sub">A reason is required — it feeds win/loss analytics (M40).</div></div>
      <button class="icon-btn mc-close" data-close>${svg("x", 15)}</button></div>
      <div class="form-field full"><label>Lost reason</label>
        <select id="lostPreset"><option value="">Choose a reason…</option><option>Price / budget</option><option>Went with a competitor</option><option>No decision / went quiet</option><option>Bad timing</option><option>Not a fit</option><option value="__other">Other…</option></select></div>
      <div class="form-field full" id="lostOtherWrap" style="display:none;margin-top:12px"><label>Details</label><textarea id="lostOther" placeholder="What happened?"></textarea></div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="lostGo">${svg("check", 14)} Confirm lost</button></div>`);
    const sel = $("#lostPreset"), otherWrap = $("#lostOtherWrap");
    sel.addEventListener("change", () => { otherWrap.style.display = sel.value === "__other" ? "block" : "none"; });
    $("#lostGo").addEventListener("click", () => {
      let reason = sel.value === "__other" ? $("#lostOther").value.trim() : sel.value;
      if (!reason) { toast("Please choose or enter a reason", "danger"); return; }
      closeModal(); closeDeal(d, "lost", reason);
    });
  }

  /* ── Add-deal modal (with contact typeahead) ────────────────────────────── */
  function openAddDeal(stageId) {
    const stages = state.stages;
    const mem = state.members.filter((m) => m.name);
    modal(`<div class="mc-head"><span class="mc-ico">${svg("sparkle", 18)}</span><div><h3>Add a deal</h3><div class="mc-sub">Create a deal in ${esc((state.pipelines.find((p) => p.id === state.activePipe) || {}).name || "this pipeline")}.</div></div>
      <button class="icon-btn mc-close" data-close>${svg("x", 15)}</button></div>
      <div class="form-grid">
        <div class="form-field full"><label>Deal title</label><input id="ad_title" placeholder="Acme Co — website redesign"></div>
        <div class="form-field"><label>Value</label><input id="ad_value" type="number" placeholder="10000"></div>
        <div class="form-field"><label>Stage</label><select id="ad_stage">${stages.map((s) => `<option value="${s.id}" ${s.id === stageId ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></div>
        <div class="form-field full"><label>Contact</label><input id="ad_contact" placeholder="Search contacts by name or email…" autocomplete="off">
          <div id="ad_typeahead" class="pop" style="position:relative;box-shadow:none;border:none;padding:0"></div></div>
        <div class="form-field"><label>Assignee</label><select id="ad_assignee"><option value="">Unassigned</option>${mem.map((m) => `<option value="${m.user_id}" ${m.user_id === state.user?.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></div>
        <div class="form-field"><label>Expected close</label><input id="ad_close" type="date"></div>
      </div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="ad_go">${svg("plus", 14)} Create deal</button></div>`);
    let chosenContact = null;
    const input = $("#ad_contact"), ta = $("#ad_typeahead");
    input.addEventListener("input", async () => {
      chosenContact = null; const q = input.value.trim().toLowerCase(); if (!q) { ta.innerHTML = ""; return; }
      let matches = state.contacts.filter((c) => (c.name + " " + (c.email || "")).toLowerCase().includes(q)).slice(0, 6);
      if (connected() && matches.length < 3) { try { const c = ensureClient(); const { data } = await c.from("contacts").select("id,first_name,last_name,email").eq("workspace_id", state.workspaceId).or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`).is("deleted_at", null).limit(6); if (data) matches = data.map((x) => ({ id: x.id, name: [x.first_name, x.last_name].filter(Boolean).join(" ") || x.email, email: x.email })); } catch (e) {} }
      ta.innerHTML = matches.length ? matches.map((m) => `<div class="pop-item" data-cid="${m.id}"><span class="ws-badge">${esc(initials(m.name))}</span><div><div class="pi-name">${esc(m.name)}</div><div class="pi-sub">${esc(m.email || "")}</div></div></div>`).join("") : `<div class="pop-label">No matches — the deal can be created without a contact.</div>`;
      $$("[data-cid]", ta).forEach((it) => it.addEventListener("click", () => { chosenContact = it.dataset.cid; input.value = it.querySelector(".pi-name").textContent; ta.innerHTML = ""; }));
    });
    $("#ad_go").addEventListener("click", async () => {
      const title = $("#ad_title").value.trim(); if (!title) { toast("A deal needs a title", "danger"); return; }
      const payload = { title, value: num($("#ad_value").value), stage_id: $("#ad_stage").value, contact_id: chosenContact, assigned_to: $("#ad_assignee").value || null, expected_close_date: $("#ad_close").value || null };
      closeModal();
      if (!connected()) { const nd = { id: "new" + Date.now(), pipeline_id: state.activePipe, status: "open", currency: "USD", stage_entered_at: new Date().toISOString(), files: 0, overdue: false, ...payload }; state.deals.unshift(nd); toast("Deal created", "success"); render(); return; }
      try { const c = ensureClient(); const { data, error } = await c.from("deals").insert({ workspace_id: state.workspaceId, pipeline_id: state.activePipe, currency: "USD", ...payload }).select("*").single(); if (error) throw error; state.deals.unshift({ ...data, files: 0, overdue: false }); toast("Deal created", "success"); render(); }
      catch (e) { toast(e.message || "Failed to create deal", "danger"); }
    });
  }
  function openEditTarget() {
    modal(`<div class="mc-head"><span class="mc-ico">${svg("target", 18)}</span><div><h3>Monthly target</h3><div class="mc-sub">The revenue goal your weighted forecast is measured against.</div></div>
      <button class="icon-btn mc-close" data-close>${svg("x", 15)}</button></div>
      <div class="form-field full"><label>Target (${esc((state.deals[0]?.currency) || "USD")})</label><input id="tg_val" type="number" value="${esc(state.target || "")}" placeholder="50000"></div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="tg_go">${svg("check", 14)} Save target</button></div>`);
    $("#tg_go").addEventListener("click", async () => {
      const v = num($("#tg_val").value) || 0; closeModal(); state.target = v;
      if (!connected()) { toast("Target updated", "success"); render(); return; }
      try { const c = ensureClient(); const { error } = await c.from("pipeline_targets").upsert({ pipeline_id: state.activePipe, workspace_id: state.workspaceId, monthly_target: v }, { onConflict: "pipeline_id" }); if (error) throw error; toast("Target saved", "success"); render(); }
      catch (e) { toast(e.message || "Failed", "danger"); }
    });
  }
  function openNewPipeline() {
    modal(`<div class="mc-head"><span class="mc-ico">${svg("board", 18)}</span><div><h3>New pipeline</h3><div class="mc-sub">Give it a name; you can add stages next.</div></div>
      <button class="icon-btn mc-close" data-close>${svg("x", 15)}</button></div>
      <div class="form-field full"><label>Pipeline name</label><input id="np_name" placeholder="Sales Pipeline"></div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="np_go">${svg("plus", 14)} Create</button></div>`);
    $("#np_go").addEventListener("click", async () => {
      const name = $("#np_name").value.trim(); if (!name) { toast("Name it first", "danger"); return; }
      closeModal();
      if (!connected()) { const id = "p" + Date.now(); MOCK.pipelines.push({ id, name }); MOCK.stagesByPipe[id] = []; MOCK.dealsByPipe[id] = []; state.pipelines = MOCK.pipelines; state.editPipe = id; toast("Pipeline created", "success"); render(); return; }
      try { const c = ensureClient(); const { data, error } = await c.from("pipelines").insert({ workspace_id: state.workspaceId, name }).select("id,name").single(); if (error) throw error; state.pipelines.push(data); state.editPipe = data.id; toast("Pipeline created", "success"); render(); }
      catch (e) { toast(e.message || "Failed (manager+ required)", "danger"); }
    });
  }

  /* ── Settings wiring ────────────────────────────────────────────────────── */
  function wireSettings(mount) {
    $$("[data-editpipe]", mount).forEach((it) => it.addEventListener("click", () => { state.editPipe = it.dataset.editpipe; if (connected() && it.dataset.editpipe !== state.activePipe) switchPipelineForEdit(it.dataset.editpipe); else render(); }));
    $("#newPipe", mount)?.addEventListener("click", openNewPipeline);
    $("#addStage", mount)?.addEventListener("click", addStage);
    // stage rows
    $$(".stage-row", mount).forEach((row) => {
      const sid = row.dataset.stage;
      $$("[data-hue]", row).forEach((sw) => sw.addEventListener("click", () => { if (!canManage()) return; setStageField(sid, { color: sw.dataset.hue }); }));
      const name = $(".sr-name", row); if (name) name.addEventListener("change", () => setStageField(sid, { name: name.value.trim() }));
      const rng = $("input[type=range]", row); if (rng) { rng.addEventListener("input", () => { $(".sp-val", row).textContent = rng.value + "%"; }); rng.addEventListener("change", () => setStageField(sid, { close_probability: Number(rng.value) })); }
      $(".sr-del", row)?.addEventListener("click", () => delStage(sid));
    });
    // reorder
    const editor = $("#stageEditor", mount);
    if (editor && window.Sortable && canManage()) {
      window.Sortable.create(editor, { handle: ".drag-handle", animation: reduce ? 0 : 160, ghostClass: "sortable-ghost", onEnd: () => reorderStages(editor) });
    }
  }
  async function switchPipelineForEdit(pipeId) {
    if (!connected()) { render(); return; }
    try { const c = ensureClient(); const { data } = await c.from("pipeline_stages").select("*").eq("pipeline_id", pipeId).order("order_index"); state._editStages = state._editStages || {}; state._editStages[pipeId] = data || []; } catch (e) {}
    render();
  }
  function stagesForEdit() { const pid = state.editPipe || state.activePipe; return connected() ? (pid === state.activePipe ? state.stages : (state._editStages?.[pid] || [])) : (MOCK.stagesByPipe[pid] || []); }
  async function setStageField(sid, patch) {
    const arr = stagesForEdit(); const s = arr.find((x) => x.id === sid); if (s) Object.assign(s, patch);
    if (!connected()) { render(); return; }
    try { const c = ensureClient(); const { error } = await c.from("pipeline_stages").update(patch).eq("id", sid); if (error) throw error; render(); }
    catch (e) { toast(e.message || "Update failed (manager+)", "danger"); }
  }
  async function addStage() {
    const pid = state.editPipe || state.activePipe; const arr = stagesForEdit();
    const order = arr.length ? Math.max(...arr.map((s) => s.order_index)) + 1 : 0;
    if (!connected()) { arr.push({ id: "st" + Date.now(), name: "New stage", order_index: order, close_probability: 50, color: "teal" }); render(); return; }
    try { const c = ensureClient(); const { data, error } = await c.from("pipeline_stages").insert({ workspace_id: state.workspaceId, pipeline_id: pid, name: "New stage", order_index: order, close_probability: 50, color: "teal" }).select("*").single(); if (error) throw error; if (pid === state.activePipe) state.stages.push(data); else { state._editStages = state._editStages || {}; (state._editStages[pid] = state._editStages[pid] || []).push(data); } render(); }
    catch (e) { toast(e.message || "Add failed (manager+)", "danger"); }
  }
  async function delStage(sid) {
    const arr = stagesForEdit(); const idx = arr.findIndex((s) => s.id === sid); if (idx < 0) return;
    arr.splice(idx, 1);
    if (!connected()) { render(); return; }
    try { const c = ensureClient(); const { error } = await c.from("pipeline_stages").delete().eq("id", sid); if (error) throw error; toast("Stage removed", "success"); render(); }
    catch (e) { toast(e.message || "Delete failed", "danger"); render(); }
  }
  async function reorderStages(editor) {
    const ids = $$(".stage-row", editor).map((r) => r.dataset.stage);
    const arr = stagesForEdit();
    ids.forEach((id, i) => { const s = arr.find((x) => x.id === id); if (s) s.order_index = i; });
    arr.sort((a, b) => a.order_index - b.order_index);
    if (!connected()) { render(); return; }
    try { const c = ensureClient(); await Promise.all(ids.map((id, i) => c.from("pipeline_stages").update({ order_index: i }).eq("id", id))); toast("Order saved", "success"); }
    catch (e) { toast(e.message || "Reorder failed", "danger"); }
  }

  /* ── Modal ──────────────────────────────────────────────────────────────── */
  function modal(html) {
    const wrap = $("#modalRoot");
    wrap.innerHTML = `<div class="modal-scrim" id="mScrim"><div class="modal-card">${html}</div></div>`;
    const scrimEl = $("#mScrim");
    nextTick(() => scrimEl.classList.add("open"));
    scrimEl.addEventListener("click", (e) => { if (e.target === scrimEl) closeModal(); });
    $$("[data-close]", wrap).forEach((b) => b.addEventListener("click", closeModal));
  }
  function closeModal() { const wrap = $("#modalRoot"); const scrimEl = $("#mScrim"); if (!scrimEl) return; scrimEl.classList.remove("open"); setTimeout(() => (wrap.innerHTML = ""), 300); }

  /* ── Global click-away for pipe switcher ────────────────────────────────── */
  document.addEventListener("click", (e) => { if (state.switchOpen && !e.target.closest(".pipe-switch")) { state.switchOpen = false; render(); } });

  /* ── Go ─────────────────────────────────────────────────────────────────── */
  window.addEventListener("hashchange", render);
  boot();
})();
