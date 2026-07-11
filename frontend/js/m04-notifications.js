/* m04-notifications.js — AiMindShare Module M04 · Notifications Center.
   Vanilla hash-routed dashboard on Supabase, layered on the M01/M02 shell. Two
   surfaces: the in-app FEED (/notifications — grouped, filterable, live via the
   reusable bell + Supabase Realtime) and PREFERENCES (/settings/notifications —
   a type × channel matrix, digest schedule, quiet hours, mute-all). Rows are
   written server-side by notify(); the browser only SELECTs (RLS-scoped) and marks
   read, and upserts its own notification_prefs row. Email delivery is stubbed until
   the provider decision D-011; push arrives with the mobile app (M43). When no
   project is connected the whole app renders as a high-fidelity mockup with a
   default/empty/loading/error/success preview switcher (honest Gate-5). Anon key
   only in the browser (Law 3). */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const initials = (s) => (s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const nextTick = (fn) => setTimeout(fn, 12);

  const NT = window.AIMS_NOTIF_TYPES;          // registry mirror (js/notification-types.js)
  const BELL = window.AIMS_NOTIFICATIONS;      // reusable bell (js/notifications.js)

  /* ── Lucide-style inline icons ──────────────────────────────────────────── */
  const P = {
    bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0",
    sliders: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
    check: "M20 6 9 17l-5-5", chev: "M6 9l6 6 6-6", search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
    inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
    clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2", moon: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z",
    building: "M3 21h18M6 21V7l6-4 6 4v14M10 9h.01M14 9h.01M10 13h.01M14 13h.01",
    doubleCheck: "M18 6 7 17l-4-4M22 10l-7.5 7.5L13 16",
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
    setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateX(20px)"; setTimeout(() => t.remove(), 300); }, 3000);
  }

  /* ── Mockup data (mockup mode only — never a live code path) ─────────────── */
  const ago = (mins) => new Date(Date.now() - mins * 60000).toISOString();
  const MOCK = {
    user: { id: "you", email: "aisha@northstar.agency", name: "Aisha Rahman" },
    jobs: 2,
    workspaces: [
      { id: "ws-agency", name: "Northstar Agency", slug: "northstar-agency", kind: "agency", parent_id: null, status: "active", role: "owner" },
      { id: "ws-bluewave", name: "Bluewave Dental", slug: "bluewave-dental", kind: "sub", parent_id: "ws-agency", status: "active", role: "admin" },
    ],
    // Latest activity for Aisha in Northstar — honest, varied, some unread.
    notifs: [
      { id: "n1", type: "deal.won", title: "Deal won — Bluewave retainer", body: "Priya moved “Bluewave Dental — Q3 retainer” to Won ($14,400).", data: { link: "#" }, channels: ["in_app", "email"], read_at: null, created_at: ago(6) },
      { id: "n2", type: "form.submitted", title: "New form submission", body: "“Book a consult” submitted by marcus@harborlaw.com.", data: { link: "#" }, channels: ["in_app", "email"], read_at: null, created_at: ago(22) },
      { id: "n3", type: "mention", title: "Daniel mentioned you", body: "“@Aisha can you approve the Northstar landing copy?”", data: { link: "#" }, channels: ["in_app", "email"], read_at: null, created_at: ago(48) },
      { id: "n4", type: "appointment.booked", title: "New appointment booked", body: "Discovery call with Harbor Law — Fri 2:00 PM.", data: { link: "#" }, channels: ["in_app", "email"], read_at: null, created_at: ago(95) },
      { id: "n5", type: "automation.failed", title: "Automation failed", body: "“Welcome sequence” errored on step 3 (missing merge field).", data: { link: "#" }, channels: ["in_app", "email"], read_at: ago(180), created_at: ago(200) },
      { id: "n6", type: "payment.received", title: "Payment received", body: "$1,200 from Bluewave Dental via Stripe.", data: { link: "#" }, channels: ["in_app"], read_at: ago(1500), created_at: ago(1510) },
      { id: "n7", type: "usage.limit_warning", title: "Approaching email quota", body: "You've used 82% of this month's email allowance.", data: { link: "#" }, channels: ["in_app", "email"], read_at: ago(1600), created_at: ago(1620) },
      { id: "n8", type: "review.new", title: "New 5-star review", body: "“Bluewave's new site is stunning.” — Google.", data: { link: "#" }, channels: ["in_app", "email"], read_at: ago(2800), created_at: ago(2880) },
      { id: "n9", type: "campaign.finished", title: "Campaign finished", body: "“July newsletter” sent to 4,210 contacts.", data: { link: "#" }, channels: ["in_app"], read_at: ago(4200), created_at: ago(4320) },
    ],
    prefs: {},        // empty → registry defaults
    digest: "daily",
  };

  /* ── App state ──────────────────────────────────────────────────────────── */
  const state = {
    loaded: false, loading: false, error: null,
    user: null, jobs: 0, workspaces: [],
    notifs: [], prefs: {}, digest: "off",
    previewState: "default",
    feed: { type: "all", status: "all" },
  };
  const PREVIEW_STATES = ["default", "empty", "loading", "error", "success"];
  const st = (name) => !connected() && state.previewState === name;

  function activeWs() {
    const list = state.workspaces;
    if (!list.length) return null;
    let id; try { id = localStorage.getItem(ACTIVE_KEY); } catch (e) {}
    return list.find((w) => w.id === id && w.status === "active") || list.find((w) => w.status === "active") || list[0];
  }
  function setActive(id) { try { localStorage.setItem(ACTIVE_KEY, id); } catch (e) {} }

  /* ── Preference resolution (registry defaults ⊕ user overrides) ──────────── */
  const CHANNELS = ["in_app", "email", "push"];
  function channelOn(type, ch) {
    const pr = state.prefs && state.prefs[type];
    if (pr && typeof pr[ch] === "boolean") return pr[ch];
    const reg = NT.byType(type);
    if (ch === "push") return false;                       // push always off by default (M43 stub)
    return reg ? reg.defaultChannels.indexOf(ch) !== -1 : ch === "in_app";
  }
  const muteAll = () => !!(state.prefs && state.prefs.mute_all);
  const quietHours = () => (state.prefs && state.prefs.quiet_hours) || null;

  /* ── Data loading ───────────────────────────────────────────────────────── */
  async function boot() {
    if (connected()) {
      state.loading = true; state.error = null; render();
      try {
        const c = ensureClient();
        const { data: { user } } = await c.auth.getUser();
        state.user = user;
        if (!user) { state.workspaces = []; state.loaded = true; state.loading = false; renderConn(); render(); return; }
        const { data: mem } = await c.from("memberships").select("workspace_id, role").eq("status", "active");
        const myRole = {}; (mem || []).forEach((m) => (myRole[m.workspace_id] = m.role));
        const { data: wsRows, error } = await c.from("workspaces").select("*").order("created_at", { ascending: true });
        if (error) throw error;
        state.workspaces = (wsRows || []).map((w) => ({ id: w.id, name: w.name, slug: w.slug, kind: w.parent_workspace_id ? "sub" : "agency", parent_id: w.parent_workspace_id, status: "active", role: myRole[w.id] || "staff" }));
        await loadPrefs();
      } catch (e) { state.error = e.message || String(e); state.workspaces = []; }
      state.loading = false; state.loaded = true;
    } else {
      state.user = MOCK.user; state.jobs = MOCK.jobs;
      state.workspaces = MOCK.workspaces.map((w) => ({ ...w }));
      state.notifs = MOCK.notifs.map((n) => ({ ...n }));
      state.prefs = JSON.parse(JSON.stringify(MOCK.prefs)); state.digest = MOCK.digest;
      state.loaded = true; state.loading = false;
    }
    renderConn(); render();
  }

  async function loadPrefs() {
    const ws = activeWs(); if (!ws || !connected()) return;
    const c = ensureClient();
    const { data } = await c.from("notification_prefs").select("prefs, digest").eq("workspace_id", ws.id).eq("user_id", state.user.id).maybeSingle();
    state.prefs = (data && data.prefs) || {}; state.digest = (data && data.digest) || "off";
  }

  async function savePrefs(msg) {
    if (!connected()) { toast((msg || "Preferences updated") + " (mockup)", "success"); return; }
    const ws = activeWs();
    const { error } = await ensureClient().from("notification_prefs").upsert(
      { workspace_id: ws.id, user_id: state.user.id, prefs: state.prefs, digest: state.digest },
      { onConflict: "workspace_id,user_id" });
    if (error) { toast(error.message, "danger"); return; }
    if (msg) toast(msg, "success");
  }

  async function fetchFeed() {
    const ws = activeWs();
    let rows;
    if (!connected()) {
      rows = st("empty") ? [] : state.notifs.slice();
    } else {
      const c = ensureClient();
      let q = c.from("notifications").select("*").eq("workspace_id", ws.id)
        .or(`user_id.eq.${state.user.id},user_id.is.null`).order("created_at", { ascending: false }).limit(50);
      const { data, error } = await q;
      if (error) throw error;
      rows = data || [];
    }
    // client-side filters (keep the query simple; volumes are page-sized)
    if (state.feed.type !== "all") rows = rows.filter((n) => n.type === state.feed.type);
    if (state.feed.status === "unread") rows = rows.filter((n) => !n.read_at);
    if (state.feed.status === "read") rows = rows.filter((n) => !!n.read_at);
    return rows;
  }

  /* ── Connection pill ────────────────────────────────────────────────────── */
  function renderConn() {
    const pill = $("#connPill"); if (!pill) return;
    if (connected()) { pill.className = "pill success"; pill.textContent = "connected"; pill.hidden = false; }
    else { pill.hidden = true; }
  }

  /* ── Shell (rail + topbar with the bell) ────────────────────────────────── */
  const NAV = [
    { key: "feed", label: "Notifications", ico: "bell", hash: "#/notifications" },
    { key: "prefs", label: "Preferences", ico: "sliders", hash: "#/settings/notifications" },
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
        <div class="nav-group"><div class="nav-group-label">Notifications</div>${nav}</div>
        <div class="rail-foot">M04 · Notifications Center</div>
      </aside>
      <header class="tbar">
        <button class="icon-btn rail-burger" id="railBurger" aria-label="Menu">☰</button>
        ${trigger}
        <div class="tb-search"><span>${svg("search", 15)}</span><span class="tbs-label">Search…</span><span class="kbd">⌘K</span></div>
        <div class="spacer"></div>
        ${BELL.bellMarkup(0)}
        <button class="jobs-chip" id="jobsChip" title="Job queue"><span class="jc-dot"></span><span class="num">${state.jobs || 0}</span> jobs</button>
        <span class="pill plain" id="connPill" hidden></span>
        <button class="btn btn-ghost btn-sm" id="openConnect2">Connect</button>
        <button class="icon-btn" id="themeToggle" title="Toggle theme" aria-label="Toggle theme"><span id="themeIco">☾</span></button>
        <span class="avatar" title="${esc(state.user?.email || "")}">${esc(initials(state.user?.name || state.user?.email))}</span>
      </header>
      <main class="content"><div class="content-inner">${content}</div></main>`;
  }

  /* ── Mockup preview switcher + shared blocks ────────────────────────────── */
  function previewStrip() {
    return "";
  }
  function errorBlock(msg) { return `<div class="panel" style="border-color:rgba(196,97,78,.4)"><div class="empty-state"><div class="es-ico" style="background:rgba(196,97,78,.12);color:var(--status-danger)">⚠</div><h3>Something went wrong</h3><p>${esc(msg)}</p><button class="btn btn-ghost es-cta" id="retryBtn">Retry</button></div></div>`; }
  function emptyNoWorkspace() { return `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("building", 22)}</div><h3>No active workspace</h3><p>Create or select a workspace in M01 to see its notifications.</p><a class="btn btn-primary es-cta" href="m01-workspaces-and-multi-tenancy.html#/workspaces">Go to workspaces</a></div></div>`; }
  function skeletonPanel(rows) { return `<div class="panel"><div class="skeleton" style="width:34%;height:20px;margin-bottom:16px;border-radius:8px"></div>${Array(rows || 5).fill('<div class="skeleton" style="height:58px;border-radius:14px;margin-bottom:10px"></div>').join("")}</div>`; }

  /* ═══ VIEW: Feed (/notifications) ═════════════════════════════════════════ */
  async function viewFeed(mount) {
    const ws = activeWs();
    if (!ws) { mount.innerHTML = previewStrip() + emptyNoWorkspace(); wireCommon(mount); return; }
    if (st("loading") || (state.loading && !state.loaded)) { mount.innerHTML = previewStrip() + feedHead(0) + skeletonPanel(5); wireCommon(mount); return; }
    if (st("error") || state.error) { mount.innerHTML = previewStrip() + feedHead(0) + errorBlock(state.error || "We couldn't load your notifications."); wireCommon(mount); return; }

    let rows = [];
    try { rows = await fetchFeed(); } catch (e) { mount.innerHTML = previewStrip() + feedHead(0) + errorBlock(e.message || String(e)); wireCommon(mount); return; }

    const unread = rows.filter((n) => !n.read_at).length;
    const typeOpts = [`<option value="all">All types</option>`].concat(NT.TYPES.map((t) => `<option value="${esc(t.type)}" ${state.feed.type === t.type ? "selected" : ""}>${esc(t.icon)}  ${esc(t.label)}</option>`)).join("");
    const seg = (v, label) => `<button class="seg ${state.feed.status === v ? "on" : ""}" data-status="${v}">${label}</button>`;

    const toolbar = `<div class="feed-toolbar reveal">
      <div class="seg-group">${seg("all", "All")}${seg("unread", "Unread")}${seg("read", "Read")}</div>
      <div class="form-field feed-type"><select id="feedType" aria-label="Filter by type">${typeOpts}</select></div>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm" id="markAll" ${unread ? "" : "disabled"}>${svg("doubleCheck", 15)} Mark all read</button>
    </div>`;

    let listHTML;
    if (!rows.length) {
      const emptyCopy = state.feed.status === "unread"
        ? { h: "No unread notifications", p: "You're all caught up. New activity will appear here the moment it happens." }
        : state.feed.type !== "all"
          ? { h: "Nothing of this type yet", p: "Try a different filter — or clear it to see everything." }
          : { h: "All caught up", p: "When teammates act, deals move, or forms come in, you'll see it here first." };
      listHTML = `<div class="panel reveal"><div class="empty-state"><div class="es-ico">${svg("bell", 23)}</div><h3>${esc(emptyCopy.h)}</h3><p>${esc(emptyCopy.p)}</p>
        <a class="btn btn-ghost es-cta" href="#/settings/notifications">Adjust preferences</a></div></div>`;
    } else {
      const today = rows.filter((n) => BELL.isToday(n.created_at));
      const earlier = rows.filter((n) => !BELL.isToday(n.created_at));
      const group = (label, list) => list.length ? `<div class="feed-group-label">${esc(label)} <span class="fg-count">${list.length}</span></div><div class="row-list">${list.map(feedRow).join("")}</div>` : "";
      listHTML = `<div class="panel reveal feed-panel">${group("Today", today)}${group("Earlier", earlier)}</div>`;
    }

    mount.innerHTML = `${previewStrip()}${feedHead(unread)}${toolbar}${listHTML}`;
    wireCommon(mount);
    wireFeed(mount);
  }

  function feedHead(unread) {
    return `<div class="page-head reveal"><span class="eyebrow">Module · M04</span>
      <h1 style="margin-top:12px">Your <em>notifications</em></h1>
      <p class="sub">Everything that happens across your workspace, in one calm feed — assignments, deals, messages, bookings and system alerts, delivered the instant they occur via Supabase Realtime.</p>
      <div class="freshness" style="margin-top:10px">${unread ? `<span class="num">${unread}</span> unread · live` : "All caught up · live"}</div></div>`;
  }

  function feedRow(n) {
    const reg = NT.byType(n.type);
    const ico = reg ? reg.icon : "🔔";
    const link = (n.data && (n.data.link || n.data.deep_link)) || "";
    return `<div class="feed-row ${n.read_at ? "" : "unread"}" data-id="${esc(n.id)}" data-link="${esc(link)}" tabindex="0" role="button">
      <span class="feed-ico">${ico}</span>
      <div class="feed-body">
        <div class="feed-title">${esc(n.title || (reg ? reg.label : n.type))}</div>
        ${n.body ? `<div class="feed-text">${esc(n.body)}</div>` : ""}
        <div class="feed-meta"><span class="oc-tag">${esc(reg ? reg.label : n.type)}</span><span class="num">${esc(BELL.timeAgo(n.created_at))}</span>${(n.channels || []).indexOf("email") !== -1 ? `<span class="feed-chan" title="Also sent by email once the provider is live">✉ email</span>` : ""}</div>
      </div>
      <div class="feed-actions">
        ${n.read_at ? `<span class="feed-read" title="Read">${svg("check", 15)}</span>` : `<button class="feed-mark" data-mark="${esc(n.id)}" title="Mark read">${svg("check", 15)}</button>`}
      </div>
      ${n.read_at ? "" : `<span class="feed-dot" aria-label="Unread"></span>`}
    </div>`;
  }

  function wireFeed(mount) {
    $$("[data-status]", mount).forEach((b) => b.addEventListener("click", () => { state.feed.status = b.dataset.status; render(); }));
    const ft = $("#feedType", mount); if (ft) ft.addEventListener("change", () => { state.feed.type = ft.value; render(); });
    const ma = $("#markAll", mount); if (ma) ma.addEventListener("click", () => markAllRead());

    const open = (r) => { const id = r.dataset.id, link = r.dataset.link; markRead(id, false); if (link && link !== "#") { if (connected()) location.href = link; else toast("Deep link → " + link + " (mockup)"); } else nextTick(render); };
    $$(".feed-row", mount).forEach((r) => {
      r.addEventListener("click", (e) => { if (e.target.closest("[data-mark]")) return; open(r); });
      r.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(r); } });
    });
    $$("[data-mark]", mount).forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); markRead(b.dataset.mark, true); }));
  }

  async function markRead(id, rerender) {
    const n = state.notifs.find((x) => x.id === id);
    if (n && !n.read_at) n.read_at = new Date().toISOString();
    if (connected()) { try { await ensureClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id); } catch (e) {} }
    if (BELL.api) BELL.api().markRead(id);
    if (rerender !== false) render();
  }
  async function markAllRead() {
    const ws = activeWs(); const now = new Date().toISOString(); let any = false;
    state.notifs.forEach((n) => { if (!n.read_at) { n.read_at = now; any = true; } });
    if (connected()) { try { await ensureClient().from("notifications").update({ read_at: now }).eq("workspace_id", ws.id).is("read_at", null); } catch (e) {} }
    if (BELL.api) BELL.api().markAllRead();
    if (any) toast("All notifications marked read", "success");
    render();
  }

  /* ═══ VIEW: Preferences (/settings/notifications) ═════════════════════════ */
  async function viewPrefs(mount) {
    const ws = activeWs();
    if (!ws) { mount.innerHTML = previewStrip() + emptyNoWorkspace(); wireCommon(mount); return; }
    if (st("loading") || (state.loading && !state.loaded)) { mount.innerHTML = previewStrip() + prefsHead() + skeletonPanel(4); wireCommon(mount); return; }
    if (st("error") || state.error) { mount.innerHTML = previewStrip() + prefsHead() + errorBlock(state.error || "We couldn't load your preferences."); wireCommon(mount); return; }

    const muted = muteAll();
    const emailBanner = `<div class="banner reveal"><span class="b-ico">✉</span><div><b>Email delivery is being finalised.</b> Your email choices are saved now and will start sending once the provider is live (D-011). Push notifications arrive with the mobile app (M43).</div></div>`;

    // mute-all + digest controls
    const digestSeg = ["off", "daily", "weekly"].map((d) => `<button class="seg ${state.digest === d ? "on" : ""}" data-digest="${d}">${d[0].toUpperCase() + d.slice(1)}</button>`).join("");
    const qh = quietHours() || { enabled: false, start: "22:00", end: "07:00" };
    const controls = `<div class="pref-controls reveal">
      <div class="pref-card">
        <div class="pref-card-head"><span class="ph-ico">${svg("bell", 15)}</span><div><h4>Mute everything</h4><p>Pause all notifications for <b>${esc(ws.name)}</b>. You can turn it back on anytime.</p></div>${toggle("mute", muted)}</div>
      </div>
      <div class="pref-card">
        <div class="pref-card-head"><span class="ph-ico">${svg("inbox", 15)}</span><div><h4>Email digest</h4><p>Group unread items into one email at 8:00 AM in your workspace's time zone.</p></div></div>
        <div class="seg-group digest-seg">${digestSeg}</div>
      </div>
      <div class="pref-card">
        <div class="pref-card-head"><span class="ph-ico">${svg("moon", 15)}</span><div><h4>Quiet hours</h4><p>Hold non-urgent <b>emails</b> overnight (applies once email is live). In-app stays instant.</p></div>${toggle("quiet", qh.enabled)}</div>
        <div class="quiet-row ${qh.enabled ? "" : "off"}" id="quietRow">
          <label>From <input type="time" id="qhStart" value="${esc(qh.start)}"></label>
          <label>To <input type="time" id="qhEnd" value="${esc(qh.end)}"></label>
        </div>
      </div>
    </div>`;

    // the type × channel matrix, grouped by category
    const matrix = NT.CATEGORIES.map((cat) => {
      const rows = NT.forCategory(cat.key).map((t) => `
        <div class="pref-row ${muted ? "muted-off" : ""}">
          <div class="pref-row-main"><span class="pref-ico">${t.icon}</span><div><div class="pref-name">${esc(t.label)}</div><div class="pref-desc">${esc(t.description)}</div></div></div>
          <div class="pref-toggles">
            ${channelToggle(t.type, "in_app", channelOn(t.type, "in_app"), muted)}
            ${channelToggle(t.type, "email", channelOn(t.type, "email"), muted)}
            ${channelToggle(t.type, "push", channelOn(t.type, "push"), true)}
          </div>
        </div>`).join("");
      return `<div class="pref-cat"><div class="pref-cat-head">${esc(cat.label)}</div>${rows}</div>`;
    }).join("");

    const matrixPanel = `<div class="panel reveal">
      <div class="panel-head"><span class="ph-ico">${svg("sliders", 15)}</span><h3>What you're notified about</h3></div>
      <div class="pref-matrix-head"><span class="pmh-type">Notification</span><span class="pmh-ch">In-app</span><span class="pmh-ch">Email</span><span class="pmh-ch">Push</span></div>
      ${matrix}
    </div>`;

    mount.innerHTML = `${previewStrip()}${prefsHead()}${emailBanner}${controls}${matrixPanel}`;
    wireCommon(mount);
    wirePrefs(mount);
  }

  function prefsHead() {
    return `<div class="page-head reveal"><span class="eyebrow">Module · M04</span>
      <h1 style="margin-top:12px">Notification <em>preferences</em></h1>
      <p class="sub">Decide exactly what reaches you and where. In-app is instant; email arrives batched or as a daily digest once the provider is live; push lands with the mobile app.</p></div>`;
  }

  // A generic on/off switch (aria switch). `kind` disambiguates the data attr.
  function toggle(kind, on, disabled) {
    return `<button class="tgl ${on ? "on" : ""} ${disabled ? "disabled" : ""}" role="switch" aria-checked="${on ? "true" : "false"}" data-toggle="${kind}" ${disabled ? "disabled" : ""}><span class="tgl-knob"></span></button>`;
  }
  function channelToggle(type, ch, on, disabled) {
    const note = ch === "push" ? ' title="Push arrives with the mobile app (M43)"' : ch === "email" ? ' title="Sends once the email provider is live (D-011)"' : "";
    const label = ch === "in_app" ? "In-app" : ch === "email" ? "Email" : "Push";
    return `<span class="pref-cell" data-label="${label}"><button class="tgl sm ${on ? "on" : ""} ${disabled ? "disabled" : ""}" role="switch" aria-checked="${on ? "true" : "false"}" data-ch="${esc(ch)}" data-type="${esc(type)}" ${disabled ? "disabled" : ""}${note}><span class="tgl-knob"></span></button></span>`;
  }

  function wirePrefs(mount) {
    // channel matrix toggles
    $$(".tgl[data-ch]", mount).forEach((b) => b.addEventListener("click", () => {
      if (b.hasAttribute("disabled")) return;
      const type = b.dataset.type, ch = b.dataset.ch;
      const cur = channelOn(type, ch);
      state.prefs[type] = state.prefs[type] || {};
      state.prefs[type][ch] = !cur;
      b.classList.toggle("on", !cur); b.setAttribute("aria-checked", (!cur).toString());
      savePrefs(null);
    }));
    // mute-all
    const mute = $('.tgl[data-toggle="mute"]', mount);
    if (mute) mute.addEventListener("click", () => { state.prefs.mute_all = !muteAll(); savePrefs(state.prefs.mute_all ? "All notifications muted" : "Notifications unmuted"); render(); });
    // digest
    $$("[data-digest]", mount).forEach((b) => b.addEventListener("click", () => { state.digest = b.dataset.digest; savePrefs("Digest set to " + state.digest); render(); }));
    // quiet hours
    const quiet = $('.tgl[data-toggle="quiet"]', mount);
    if (quiet) quiet.addEventListener("click", () => { const q = quietHours() || { start: "22:00", end: "07:00" }; q.enabled = !q.enabled; state.prefs.quiet_hours = q; $("#quietRow").classList.toggle("off", !q.enabled); quiet.classList.toggle("on", q.enabled); quiet.setAttribute("aria-checked", q.enabled.toString()); savePrefs("Quiet hours " + (q.enabled ? "enabled" : "disabled")); });
    const persistQH = () => { const q = quietHours() || {}; q.enabled = true; q.start = $("#qhStart").value; q.end = $("#qhEnd").value; state.prefs.quiet_hours = q; savePrefs(null); };
    const s = $("#qhStart", mount), e = $("#qhEnd", mount);
    if (s) s.addEventListener("change", persistQH); if (e) e.addEventListener("change", persistQH);
  }

  /* ── Router + render ────────────────────────────────────────────────────── */
  function currentRoute() {
    const h = (location.hash || "#/notifications").replace(/^#/, "");
    if (h.startsWith("/settings/notifications")) return { key: "prefs" };
    return { key: "feed" };
  }
  function render() {
    const app = $("#app");
    const r = currentRoute();
    app.innerHTML = shell(r.key === "prefs" ? "prefs" : "feed", "");
    afterShell();
    const inner = $(".content-inner");
    if (r.key === "prefs") viewPrefs(inner); else viewFeed(inner);
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
    mountBell();
  }

  function mountBell() {
    const ws = activeWs(); if (!ws || !state.user) return;
    BELL.mount({
      client: ensureClient(), user: state.user, workspaceId: ws.id, connected: connected(),
      mock: connected() ? null : state.notifs, toast,
      onCount: () => {},
      onNavigate: (link) => { if (link && link !== "#") { if (connected()) location.href = link; else toast("Deep link → " + link + " (mockup)"); } },
    });
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
    $$("[data-switch]", pop).forEach((it) => it.addEventListener("click", async () => { setActive(it.dataset.switch); pop.remove(); if (connected()) await loadPrefs(); toast("Switched workspace"); render(); }));
  }

  /* ── Wiring: common (preview switcher + retry) ──────────────────────────── */
  function wireCommon(mount) {
    $$("[data-hash]", mount).forEach((n) => n.addEventListener("click", () => (location.hash = n.dataset.hash)));
    $$("[data-preview]", mount).forEach((b) => b.addEventListener("click", () => { state.previewState = b.dataset.preview; render(); }));
    const retry = $("#retryBtn", mount); if (retry) retry.addEventListener("click", () => { state.previewState = "default"; state.error = null; boot(); });
  }

  /* ── Go ─────────────────────────────────────────────────────────────────── */
  window.addEventListener("hashchange", render);
  boot();
})();
