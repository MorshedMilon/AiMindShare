/* m14-calendar.js — AiMindShare Module M14 · Calendar & Booking (authed app).
   Vanilla hash-routed dashboard on Supabase. Two screens:
     /calendars  — calendar cards + the editor sheet (availability grid, question
                   builder, reminders, Google connect, embed snippet, payment toggle).
     /calendar   — team week/month view with an appointment drawer (attended/no_show/
                   reassign) + manual create + drag-to-reschedule.
   The walls are server-side: calendar config is manager+ (RLS + calendar.manage);
   appointments are staff+; public bookings never touch this page — they go through the
   no-auth public-booking Edge Fn. Anon key only in the browser (Law 3). Offline → a
   high-fidelity mockup with a default/empty/loading/error/success switcher. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const initials = (s) => (s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const DAY = 864e5, DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  /* ── Icons ──────────────────────────────────────────────────────────────── */
  const P = {
    cal: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
    grid: "M4 4h6v16H4zM14 4h6v9h-6z", plus: "M12 5v14M5 12h14", check: "M20 6 9 17l-5-5", x: "M18 6 6 18M6 6l12 12",
    chevl: "M15 18l-6-6 6-6", chevr: "M9 18l6-6-6-6", clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
    users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    user: "M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", search: "M21 21l-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
    trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6", link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
    globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z",
    bell: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0", card: "M2 5h20v14H2zM2 10h20",
    ban: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM4.9 4.9l14.2 14.2", info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
    ext: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3",
  };
  const svg = (n, s = 17) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${P[n] || ""}"/></svg>`;
  const TYPE_LABEL = { one_on_one: "One-on-one", round_robin: "Round-robin", group: "Group", class: "Class" };

  /* ── Theme + starfield (light only; dark = no stars, hidden by app.css) ───── */
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
  const iso = (d) => new Date(d).toISOString();
  const at = (base, h, m = 0) => { const d = new Date(base); d.setHours(h, m, 0, 0); return d; };
  const MOCK = (() => {
    const members = [{ user_id: "u1", name: "Aisha Rahman" }, { user_id: "u2", name: "Yusuf Karim" }];
    const contacts = [
      { id: "c1", name: "Nadia Iqbal", email: "nadia@crescent.co" }, { id: "c2", name: "Omar Farouk", email: "omar@zenith.io" },
      { id: "c3", name: "Sana Malik", email: "sana@almanar.com" }, { id: "c4", name: "Bilal Ahmed", email: "bilal@northgate.co" },
    ];
    const calendars = [
      { id: "cal1", name: "Intro Call", type: "one_on_one", slug: "intro-call", duration_min: 30, buffer_min: 0, min_notice_min: 240, timezone: "America/New_York", requires_payment: false, is_active: true, upcoming: 3 },
      { id: "cal2", name: "Strategy Session", type: "round_robin", slug: "strategy", duration_min: 60, buffer_min: 15, min_notice_min: 1440, timezone: "America/New_York", requires_payment: false, is_active: true, upcoming: 1, round_robin_user_ids: ["u1", "u2"] },
      { id: "cal3", name: "Group Workshop", type: "group", slug: "workshop", duration_min: 90, buffer_min: 0, min_notice_min: 2880, timezone: "UTC", requires_payment: true, is_active: true, capacity: 8, upcoming: 0 },
    ];
    const avail = { cal1: [1, 2, 3, 4, 5].map((d) => ({ day_of_week: d, start_time: "09:00", end_time: "17:00" })) };
    const questions = { cal1: [{ id: "q1", label: "What would you like to cover?", type: "textarea", required: true, sort_order: 0 }, { id: "q2", label: "Company", type: "text", required: false, sort_order: 1 }] };
    const now = new Date();
    const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const appt = (id, cal, cName, day, h, m, dur, status, user) =>
      ({ id, calendar_id: cal, calendar_name: cName, contact_name: cName === "Group Workshop" ? "8 attendees" : ["Nadia Iqbal", "Omar Farouk", "Sana Malik", "Bilal Ahmed"][id.charCodeAt(id.length - 1) % 4], starts_at: iso(at(new Date(monday.getTime() + day * DAY), h, m)), ends_at: iso(at(new Date(monday.getTime() + day * DAY), h, m + dur)), status, assigned_user: user, timezone: "America/New_York" });
    const appts = [
      appt("a1", "cal1", "Intro Call", 1, 10, 0, 30, "confirmed", "u1"),
      appt("a2", "cal1", "Intro Call", 1, 14, 30, 30, "confirmed", "u1"),
      appt("a3", "cal2", "Strategy Session", 2, 11, 0, 60, "confirmed", "u2"),
      appt("a4", "cal1", "Intro Call", 3, 9, 30, 30, "no_show", "u1"),
      appt("a5", "cal2", "Strategy Session", 4, 15, 0, 60, "confirmed", "u1"),
      appt("a6", "cal1", "Intro Call", 4, 16, 0, 30, "cancelled", "u2"),
    ];
    return { user: { id: "u1", email: "aisha@northstar.agency", name: "Aisha Rahman" }, workspace: { id: "ws", name: "Northstar Agency" }, role: "owner", members, contacts, calendars, avail, questions, appts };
  })();

  /* ── State ──────────────────────────────────────────────────────────────── */
  const PREVIEW_STATES = ["default", "empty", "loading", "error", "success"];
  const state = {
    loaded: false, loading: false, error: null, previewState: "default",
    user: null, workspaceId: null, workspaceName: "", role: "staff",
    calendars: [], members: [], contacts: [], appts: [],
    view: "week", weekOffset: 0, monthCursor: null, filterCal: "", filterUser: "",
    editCal: null, editAvail: [], editQuestions: [], sheetAppt: null,
  };
  const stp = (name) => !connected() && state.previewState === name;
  const canManage = () => ["manager", "admin", "owner"].includes(state.role);

  /* ── Boot ───────────────────────────────────────────────────────────────── */
  async function boot() {
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
        const [{ data: cals }, { data: mems }, { data: cons }] = await Promise.all([
          c.from("calendars").select("*").eq("workspace_id", active.id).order("created_at"),
          c.from("memberships").select("user_id, profiles(name,email)").eq("workspace_id", active.id),
          c.from("contacts").select("id,first_name,last_name,email").eq("workspace_id", active.id).order("created_at", { ascending: false }).limit(500),
        ]);
        state.calendars = cals || [];
        state.members = (mems || []).map((m) => ({ user_id: m.user_id, name: m.profiles?.name || m.profiles?.email || "Member" }));
        state.contacts = (cons || []).map((x) => ({ id: x.id, name: [x.first_name, x.last_name].filter(Boolean).join(" ") || x.email || "Contact", email: x.email }));
        await loadAppointments();
      } catch (e) { state.error = e.message || String(e); }
      state.loading = false; state.loaded = true;
    } else {
      state.user = MOCK.user; state.workspaceId = MOCK.workspace.id; state.workspaceName = MOCK.workspace.name; state.role = MOCK.role;
      state.calendars = MOCK.calendars; state.members = MOCK.members; state.contacts = MOCK.contacts; state.appts = MOCK.appts;
      state.loaded = true; state.loading = false;
    }
    render();
  }
  function pickActive(list) { const usable = (list || []).filter((w) => w.status !== "archived"); if (!usable.length) return list[0] || null; let id; try { id = localStorage.getItem(ACTIVE_KEY); } catch (e) {} return usable.find((w) => w.id === id) || usable[0]; }

  async function loadAppointments() {
    const c = ensureClient(); if (!c || !state.workspaceId) return;
    const { start, end } = viewRange();
    const { data } = await c.from("appointments")
      .select("id,calendar_id,contact_id,assigned_user_id,starts_at,ends_at,status,timezone,contacts(first_name,last_name)")
      .eq("workspace_id", state.workspaceId).gte("starts_at", iso(start)).lt("starts_at", iso(end)).order("starts_at");
    const nameOf = (id) => state.calendars.find((k) => k.id === id)?.name || "Appointment";
    state.appts = (data || []).map((a) => ({ ...a, calendar_name: nameOf(a.calendar_id), assigned_user: a.assigned_user_id, contact_name: [a.contacts?.first_name, a.contacts?.last_name].filter(Boolean).join(" ") || "Contact" }));
  }

  /* ── Date helpers for the team calendar ─────────────────────────────────── */
  function weekStart() { const now = new Date(); const m = new Date(now); m.setDate(now.getDate() - ((now.getDay() + 6) % 7) + state.weekOffset * 7); m.setHours(0, 0, 0, 0); return m; }
  function monthCursor() { if (!state.monthCursor) { const n = new Date(); state.monthCursor = new Date(n.getFullYear(), n.getMonth(), 1); } return state.monthCursor; }
  function viewRange() {
    if (state.view === "week") { const s = weekStart(); return { start: s, end: new Date(s.getTime() + 7 * DAY) }; }
    const c = monthCursor(); const s = new Date(c.getFullYear(), c.getMonth(), 1); const e = new Date(c.getFullYear(), c.getMonth() + 1, 1); return { start: s, end: e };
  }
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const fmtTime = (d, tz) => new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz || undefined });

  /* ── Shell ──────────────────────────────────────────────────────────────── */
  const NAV = [
    { key: "calendars", label: "Calendars", ico: "cal", hash: "#/calendars" },
    { key: "calendar", label: "Team calendar", ico: "grid", hash: "#/calendar" },
  ];
  function shell(activeKey, content) {
    const nav = NAV.map((n) => `<div class="nav-item ${n.key === activeKey ? "active" : ""}" data-hash="${n.hash}"><span class="ni-ico">${svg(n.ico)}</span><span>${n.label}</span></div>`).join("");
    return `
      <aside class="rail" id="rail">
        <div class="brand"><span class="mark">✦</span><span><b>AiMind</b><em>Share</em></span></div>
        <div class="nav-group"><div class="nav-group-label">Scheduling</div>${nav}</div>
        <div class="rail-foot">M14 · Calendar &amp; Booking</div>
      </aside>
      <header class="tbar">
        <button class="icon-btn rail-burger" id="railBurger" aria-label="Menu">☰</button>
        <div class="ws-trigger" style="cursor:default">
          <span class="ws-badge">${esc(initials(state.workspaceName || "AiMindShare"))}</span>
          <span class="ws-meta"><span class="ws-name">${esc(state.workspaceName || "Workspace")}</span><span class="ws-kind">Calendar</span></span>
        </div>
        <div class="tb-search"><span>${svg("search", 15)}</span><span class="tbs-label">Search…</span><span class="kbd">⌘K</span></div>
        <div class="spacer"></div>
        <span class="pill plain" id="connPill">${connected() ? "connected" : "mockup mode"}</span>
        <button class="btn btn-ghost btn-sm" id="openConnect2">${connected() ? "Reconnect" : "Connect"}</button>
        <button class="icon-btn" id="themeToggle" title="Toggle theme" aria-label="Toggle theme"><span id="themeIco">☾</span></button>
        <span class="avatar" title="${esc(state.user?.email || "")}">${esc(initials(state.user?.name || state.user?.email))}</span>
      </header>
      <main class="content"><div class="content-inner">${content}</div></main>`;
  }
  function previewStrip() {
    if (connected()) return "";
    return `<div class="mock-note"><span class="mn-ico">◈</span><b>Mockup mode.</b>
      Connect a project to read live calendars and appointments. Sample data shown. Preview state:
      ${PREVIEW_STATES.map((s) => `<button class="link ${state.previewState === s ? "on" : ""}" data-preview="${s}">${s}</button>`).join(" ")}</div>`;
  }
  function pageHead(sub, extra = "") {
    return `<div class="page-head reveal"><span class="eyebrow">Module · M14</span>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap">
        <div><h1 style="margin-top:12px">Calendar &amp; <em>booking</em></h1><p class="sub">${sub}</p></div>${extra}</div></div>`;
  }
  function skeleton() {
    return `<div class="page-head"><div class="skeleton" style="width:280px;height:44px;border-radius:12px"></div></div>
      <div class="cal-grid">${Array(3).fill('<div class="skeleton" style="height:190px;border-radius:24px"></div>').join("")}</div>`;
  }
  function errorBlock(msg) { return `<div class="panel" style="border-color:rgba(196,97,78,.4)"><div class="empty-state"><div class="es-ico" style="background:rgba(196,97,78,.12);color:var(--status-danger)">⚠</div><h3>Something went wrong</h3><p>${esc(msg || "We couldn't load this workspace's calendars.")}</p><button class="btn btn-ghost es-cta" id="retryBtn">Retry</button></div></div>`; }

  /* ── Screen: Calendars list ─────────────────────────────────────────────── */
  function viewCalendars() {
    if (stp("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    if (stp("error") || state.error) return previewStrip() + pageHead("Bookable calendars, availability and public booking pages.") + errorBlock(state.error);
    const newBtn = canManage() ? `<button class="btn btn-primary" id="newCal">${svg("plus", 16)} New calendar</button>` : "";
    const head = pageHead("Bookable calendars, availability, questions and reminders — each with a public booking page.", newBtn);
    const cals = stp("empty") ? [] : state.calendars;
    if (!cals.length) {
      return previewStrip() + head + `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("cal", 22)}</div>
        <h3>No calendars yet</h3><p>Create a calendar to publish a booking page, set availability, and take appointments.</p>
        ${canManage() ? `<button class="btn btn-primary es-cta" id="newCal2">Create your first calendar</button>` : ""}</div></div>`;
    }
    const cards = cals.map((k) => `
      <div class="cal-card reveal" data-cal="${esc(k.id)}">
        <div class="cal-card-top"><span class="cal-ico">${svg(k.type === "group" || k.type === "class" ? "users" : "cal")}</span>
          <div><h3>${esc(k.name)}</h3><span class="cc-slug">/book/${esc(k.slug)}</span></div></div>
        <div class="cal-meta">
          <span class="pill info">${TYPE_LABEL[k.type] || k.type}</span>
          <span class="pill plain">${k.duration_min} min</span>
          ${k.requires_payment ? `<span class="pill warning">paid</span>` : ""}
          ${k.is_active === false ? `<span class="pill idle">off</span>` : ""}
        </div>
        <div class="cal-card-foot">
          <span class="cal-stat"><span class="cs-num">${k.upcoming ?? "—"}</span><span class="cs-lab">Upcoming</span></span>
          <span style="display:flex;gap:8px">
            <a class="btn btn-ghost btn-sm" href="book.html?slug=${encodeURIComponent(k.slug)}" target="_blank" rel="noopener">${svg("ext", 14)} Booking page</a>
            ${canManage() ? `<button class="btn btn-ghost btn-sm" data-edit="${esc(k.id)}">Edit</button>` : ""}
          </span>
        </div>
      </div>`).join("");
    return previewStrip() + head + `<div class="cal-grid">${cards}</div>`;
  }

  /* ── Screen: Team calendar ──────────────────────────────────────────────── */
  function viewCalendar() {
    if (stp("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    if (stp("error") || state.error) return previewStrip() + pageHead("Team schedule across every calendar.") + errorBlock(state.error);
    const filters = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <select class="input" id="fCal" style="width:auto"><option value="">All calendars</option>${state.calendars.map((k) => `<option value="${esc(k.id)}" ${state.filterCal === k.id ? "selected" : ""}>${esc(k.name)}</option>`).join("")}</select>
        ${canManage() ? `<button class="btn btn-primary btn-sm" id="newAppt">${svg("plus", 15)} New appointment</button>` : ""}
      </div>`;
    const head = pageHead("Every appointment across your calendars — filter, inspect, mark attended or no-show, and drag to reschedule.", filters);
    const title = state.view === "week"
      ? `Week of ${weekStart().toLocaleDateString("en-US", { month: "long", day: "numeric" })}`
      : `${MONTHS[monthCursor().getMonth()]} ${monthCursor().getFullYear()}`;
    const toolbar = `
      <div class="cal-toolbar">
        <div class="cal-nav">
          <button class="icon-btn" id="calPrev" aria-label="Previous">${svg("chevl", 18)}</button>
          <button class="btn btn-ghost btn-sm" id="calToday">Today</button>
          <button class="icon-btn" id="calNext" aria-label="Next">${svg("chevr", 18)}</button>
        </div>
        <div class="cal-title">${esc(title)}</div>
        <div class="spacer"></div>
        <div class="seg"><button class="${state.view === "week" ? "on" : ""}" data-view="week">Week</button><button class="${state.view === "month" ? "on" : ""}" data-view="month">Month</button></div>
      </div>`;
    return previewStrip() + head + toolbar + (state.view === "week" ? weekGrid() : monthGrid());
  }

  function visibleAppts() { return state.appts.filter((a) => !state.filterCal || a.calendar_id === state.filterCal); }

  function weekGrid() {
    const s = weekStart(), HOURS = []; for (let h = 8; h <= 19; h++) HOURS.push(h);
    const days = Array.from({ length: 7 }, (_, i) => new Date(s.getTime() + i * DAY));
    const today = new Date();
    let head = `<div class="wk-corner"></div>` + days.map((d) => `<div class="wk-head ${sameDay(d, today) ? "today" : ""}"><div class="wh-dow">${DOW[d.getDay()]}</div><div class="wh-day">${d.getDate()}</div></div>`).join("");
    let body = "";
    for (const h of HOURS) {
      body += `<div class="wk-hour">${((h + 11) % 12) + 1}${h < 12 ? "a" : "p"}</div>`;
      for (const d of days) {
        const cellAppts = visibleAppts().filter((a) => { const st = new Date(a.starts_at); return sameDay(st, d) && st.getHours() === h; });
        const blocks = cellAppts.map((a) => { const st = new Date(a.starts_at), en = new Date(a.ends_at); const mins = (en - st) / 6e4; const top = (st.getMinutes() / 60) * 52; const hgt = Math.max(18, (mins / 60) * 52 - 4);
          return `<div class="appt-block st-${a.status}" data-appt="${esc(a.id)}" style="top:${top}px;height:${hgt}px"><div class="ab-time">${fmtTime(a.starts_at, a.timezone)}</div>${esc(a.contact_name || a.calendar_name)}</div>`; }).join("");
        body += `<div class="wk-cell">${blocks}</div>`;
      }
    }
    return `<div class="week-grid">${head}${body}</div>`;
  }

  function monthGrid() {
    const c = monthCursor(), first = new Date(c.getFullYear(), c.getMonth(), 1);
    const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
    const today = new Date(); let cells = "";
    let headRow = DOW.map((d) => `<div class="wk-head"><div class="wh-dow">${d}</div></div>`).join("");
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getTime() + i * DAY); const dim = d.getMonth() !== c.getMonth();
      const dayAppts = visibleAppts().filter((a) => sameDay(new Date(a.starts_at), d)).slice(0, 3);
      const more = visibleAppts().filter((a) => sameDay(new Date(a.starts_at), d)).length - dayAppts.length;
      cells += `<div class="mo-cell ${dim ? "dim" : ""} ${sameDay(d, today) ? "today" : ""}"><div class="mo-day">${d.getDate()}</div>
        ${dayAppts.map((a) => `<div class="mo-appt st-${a.status}" data-appt="${esc(a.id)}">${fmtTime(a.starts_at, a.timezone)} ${esc(a.contact_name || a.calendar_name)}</div>`).join("")}
        ${more > 0 ? `<div class="mo-day" style="margin-top:4px">+${more} more</div>` : ""}</div>`;
    }
    return `<div class="month-grid">${headRow}${cells}</div>`;
  }

  /* ── Editor sheet (calendar) ────────────────────────────────────────────── */
  function openEditor(calId) {
    const base = calId ? state.calendars.find((k) => k.id === calId) : { name: "", type: "one_on_one", slug: "", duration_min: 30, buffer_min: 0, min_notice_min: 240, timezone: "UTC", requires_payment: false, is_active: true };
    state.editCal = JSON.parse(JSON.stringify(base));
    state.editAvail = calId && !connected() ? (MOCK.avail[calId] || []).slice() : (state.editCal.availability || []);
    state.editQuestions = calId && !connected() ? (MOCK.questions[calId] || []).slice() : (state.editCal.questions || []);
    if (connected() && calId) loadEditorDetail(calId);
    renderSheet();
  }
  async function loadEditorDetail(calId) {
    const c = ensureClient(); if (!c) return;
    const [{ data: av }, { data: q }] = await Promise.all([
      c.from("calendar_availability").select("day_of_week,start_time,end_time").eq("calendar_id", calId).order("day_of_week"),
      c.from("appointment_questions").select("id,label,type,required,sort_order").eq("calendar_id", calId).order("sort_order"),
    ]);
    state.editAvail = av || []; state.editQuestions = q || []; renderSheet();
  }
  function availByDay(d) { return state.editAvail.filter((a) => a.day_of_week === d); }

  function renderSheet() {
    const rootEl = $("#sheetRoot");
    if (!state.editCal) { rootEl.innerHTML = ""; return; }
    const k = state.editCal;
    const origin = location.origin + location.pathname.replace(/[^/]*$/, "");
    const embed = `<script src="${origin}book-embed.js" data-slug="${esc(k.slug || "your-slug")}"><\/script>`;
    const dayRows = DOW.map((name, d) => {
      const rs = availByDay(d); const on = rs.length > 0;
      const ranges = rs.map((r, i) => `<span class="time-range" data-day="${d}" data-i="${i}"><input type="time" value="${r.start_time}" data-f="start"><span class="tr-dash">–</span><input type="time" value="${r.end_time}" data-f="end"><button class="icon-del" data-rmrange="${d}:${i}" aria-label="Remove">${svg("x", 13)}</button></span>`).join("");
      return `<div class="avail-day ${on ? "" : "off"}"><div class="ad-name"><span class="switch ${on ? "on" : ""}" data-toggleday="${d}"></span>${name}</div>
        <div class="ad-ranges">${ranges || `<span class="rr-sub">Unavailable</span>`}</div>
        <button class="mini-add" data-addrange="${d}">${svg("plus", 13)} Add</button></div>`;
    }).join("");
    const qRows = state.editQuestions.map((q, i) => `<div class="q-row" data-qi="${i}">
      <input class="input" value="${esc(q.label)}" data-qf="label" placeholder="Question label">
      <select class="input" data-qf="type" style="width:120px">${["text", "textarea", "select", "phone", "email"].map((t) => `<option ${q.type === t ? "selected" : ""}>${t}</option>`).join("")}</select>
      <label class="q-req"><input type="checkbox" ${q.required ? "checked" : ""} data-qf="required"> req</label>
      <button class="icon-del" data-rmq="${i}" aria-label="Remove">${svg("trash", 15)}</button></div>`).join("");

    rootEl.innerHTML = `
      <div class="scrim open" id="sheetScrim"></div>
      <aside class="sheet open" role="dialog" aria-label="Calendar editor">
        <div class="sheet-head"><h2>${k.id ? "Edit" : "New"} calendar</h2><button class="icon-btn" id="closeSheet" aria-label="Close">${svg("x", 18)}</button></div>
        <div class="sheet-body">
          <div class="ed-section">
            <div class="field"><label class="label">Name</label><input class="input" id="edName" value="${esc(k.name)}" placeholder="Intro Call"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div class="field"><label class="label">Type</label><select class="input" id="edType">${Object.keys(TYPE_LABEL).map((t) => `<option value="${t}" ${k.type === t ? "selected" : ""}>${TYPE_LABEL[t]}</option>`).join("")}</select></div>
              <div class="field"><label class="label">URL slug</label><input class="input" id="edSlug" value="${esc(k.slug)}" placeholder="intro-call"></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
              <div class="field"><label class="label">Duration (min)</label><input class="input" id="edDur" type="number" value="${k.duration_min}"></div>
              <div class="field"><label class="label">Buffer (min)</label><input class="input" id="edBuf" type="number" value="${k.buffer_min}"></div>
              <div class="field"><label class="label">Notice (min)</label><input class="input" id="edNotice" type="number" value="${k.min_notice_min}"></div>
            </div>
            <div class="field"><label class="label">Timezone</label><input class="input" id="edTz" value="${esc(k.timezone)}" placeholder="America/New_York"></div>
          </div>

          <div class="ed-section"><h4>Weekly availability</h4><p class="es-hint">Times are in the calendar's timezone; visitors see their own local time.</p>${dayRows}</div>

          <div class="ed-section"><h4>Booking questions</h4><p class="es-hint">Asked on the booking page before confirming.</p>
            <div id="qList">${qRows || `<p class="rr-sub">No custom questions.</p>`}</div>
            <button class="mini-add" id="addQ">${svg("plus", 13)} Add question</button></div>

          <div class="ed-section"><h4>Reminders</h4><p class="es-hint">Sent as cron-enqueued jobs. SMS is live; email arrives with the email provider (D-011).</p>
            <div class="rem-row"><div><div class="rr-label">24 hours before</div><div class="rr-sub">SMS · respects consent</div></div><span class="switch on" data-rem="24"></span></div>
            <div class="rem-row"><div><div class="rr-label">1 hour before</div><div class="rr-sub">SMS · respects consent</div></div><span class="switch on" data-rem="1"></span></div>
          </div>

          <div class="ed-section"><h4>Google Calendar</h4>
            <div class="set-card"><div class="sc-head"><div><div class="sc-title">Two-way sync</div><div class="sc-sub" id="gcSub">Block booked times & push new appointments to Google.</div></div>
              <button class="btn btn-ghost btn-sm" id="gcConnect">${svg("globe", 14)} Connect Google</button></div></div></div>

          <div class="ed-section"><h4>Payments</h4>
            <div class="set-card disabled"><div class="sc-head"><div><div class="sc-title">Require payment to book</div><div class="sc-sub">Available after M28 (Payments) ships.</div></div>
              <span class="switch" title="Available after M28" style="pointer-events:none;opacity:.5"></span></div></div></div>

          <div class="ed-section"><h4>Embed</h4><p class="es-hint">Drop this on any site to embed the booking page.</p>
            <textarea class="embed-box" readonly>${esc(embed)}</textarea></div>
        </div>
        <div class="sheet-foot">
          ${k.id && canManage() ? `<button class="btn btn-danger btn-sm" id="delCal">Delete</button>` : "<span></span>"}
          <div style="display:flex;gap:10px"><button class="btn btn-ghost" id="cancelSheet">Cancel</button><button class="btn btn-primary" id="saveSheet">Save calendar</button></div>
        </div>
      </aside>`;
    wireSheet();
  }

  function wireSheet() {
    const close = () => { state.editCal = null; renderSheet(); };
    $("#closeSheet")?.addEventListener("click", close);
    $("#cancelSheet")?.addEventListener("click", close);
    $("#sheetScrim")?.addEventListener("click", close);
    // Availability edits (mutate state.editAvail; re-render sheet)
    $$("[data-toggleday]").forEach((b) => b.addEventListener("click", () => { const d = +b.dataset.toggleday; if (availByDay(d).length) state.editAvail = state.editAvail.filter((a) => a.day_of_week !== d); else state.editAvail.push({ day_of_week: d, start_time: "09:00", end_time: "17:00" }); renderSheet(); }));
    $$("[data-addrange]").forEach((b) => b.addEventListener("click", () => { state.editAvail.push({ day_of_week: +b.dataset.addrange, start_time: "09:00", end_time: "17:00" }); renderSheet(); }));
    $$("[data-rmrange]").forEach((b) => b.addEventListener("click", () => { const [d, i] = b.dataset.rmrange.split(":").map(Number); const rows = availByDay(d); const target = rows[i]; state.editAvail = state.editAvail.filter((a) => a !== target); renderSheet(); }));
    $$(".time-range input").forEach((inp) => inp.addEventListener("change", () => { const wrap = inp.closest(".time-range"); const d = +wrap.dataset.day, i = +wrap.dataset.i; const row = availByDay(d)[i]; if (row) row[inp.dataset.f + "_time"] = inp.value; }));
    // Questions
    $("#addQ")?.addEventListener("click", () => { state.editQuestions.push({ label: "", type: "text", required: false, sort_order: state.editQuestions.length }); renderSheet(); });
    $$("[data-rmq]").forEach((b) => b.addEventListener("click", () => { state.editQuestions.splice(+b.dataset.rmq, 1); renderSheet(); }));
    $$("#qList .q-row").forEach((rowEl) => { const i = +rowEl.dataset.qi; $$("[data-qf]", rowEl).forEach((f) => f.addEventListener("change", () => { const q = state.editQuestions[i]; q[f.dataset.qf] = f.dataset.qf === "required" ? f.checked : f.value; })); });
    // Google connect
    $("#gcConnect")?.addEventListener("click", async () => {
      if (!connected()) { toast("Connect a project to link Google Calendar.", "info"); return; }
      try { const c = ensureClient(); const { data, error } = await c.functions.invoke("google-calendar-sync", { body: { workspace_id: state.workspaceId, action: "connect" } });
        if (error) throw error; if (data?.data?.consent_url) location.href = data.data.consent_url; }
      catch (e) { toast("Google connect isn't configured on this environment yet.", "danger"); }
    });
    // Delete + save
    $("#delCal")?.addEventListener("click", () => deleteCalendar(state.editCal.id));
    $("#saveSheet")?.addEventListener("click", saveCalendar);
  }

  function collectCalForm() {
    return {
      name: $("#edName").value.trim(), type: $("#edType").value, slug: $("#edSlug").value.trim(),
      duration_min: +$("#edDur").value || 30, buffer_min: +$("#edBuf").value || 0, min_notice_min: +$("#edNotice").value || 0,
      timezone: $("#edTz").value.trim() || "UTC",
    };
  }
  async function saveCalendar() {
    const form = collectCalForm();
    if (!form.name || !form.slug) { toast("Name and slug are required.", "danger"); return; }
    if (!connected()) { toast(`Saved “${form.name}” (mockup — connect a project to persist).`, "success"); state.editCal = null; renderSheet(); return; }
    try {
      const c = ensureClient(); const id = state.editCal.id;
      let calId = id;
      if (id) { const { error } = await c.from("calendars").update(form).eq("id", id); if (error) throw error; }
      else { const { data, error } = await c.from("calendars").insert({ ...form, workspace_id: state.workspaceId }).select("id").single(); if (error) throw error; calId = data.id; }
      // Replace availability + questions (manager+ via RLS).
      await c.from("calendar_availability").delete().eq("calendar_id", calId);
      if (state.editAvail.length) await c.from("calendar_availability").insert(state.editAvail.map((a) => ({ ...a, calendar_id: calId, workspace_id: state.workspaceId })));
      await c.from("appointment_questions").delete().eq("calendar_id", calId);
      if (state.editQuestions.length) await c.from("appointment_questions").insert(state.editQuestions.map((q, i) => ({ label: q.label, type: q.type, required: !!q.required, sort_order: i, calendar_id: calId, workspace_id: state.workspaceId })));
      toast("Calendar saved.", "success"); state.editCal = null; await boot();
    } catch (e) { toast(e.message || "Save failed.", "danger"); }
  }
  async function deleteCalendar(id) {
    if (!connected()) { toast("Deleted (mockup).", "success"); state.editCal = null; renderSheet(); return; }
    try { const c = ensureClient(); const { error } = await c.from("calendars").delete().eq("id", id); if (error) throw error; toast("Calendar deleted.", "success"); state.editCal = null; await boot(); }
    catch (e) { toast(e.message || "Delete failed.", "danger"); }
  }

  /* ── Appointment drawer ─────────────────────────────────────────────────── */
  function openAppt(id) { state.sheetAppt = state.appts.find((a) => a.id === id) || null; renderApptSheet(); }
  function renderApptSheet() {
    const rootEl = $("#sheetRoot"); const a = state.sheetAppt;
    if (!a) { rootEl.innerHTML = ""; return; }
    const member = state.members.find((m) => m.user_id === a.assigned_user);
    rootEl.innerHTML = `
      <div class="scrim open" id="apScrim"></div>
      <aside class="sheet open" role="dialog" aria-label="Appointment detail">
        <div class="sheet-head"><h2>${esc(a.calendar_name)}</h2><button class="icon-btn" id="apClose" aria-label="Close">${svg("x", 18)}</button></div>
        <div class="sheet-body">
          <span class="pill ${a.status === "cancelled" ? "danger" : a.status === "no_show" ? "warning" : a.status === "completed" ? "success" : "info"}">${a.status.replace("_", " ")}</span>
          <dl class="appt-kv">
            <dt>Who</dt><dd>${esc(a.contact_name || "—")}</dd>
            <dt>When</dt><dd class="num">${new Date(a.starts_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</dd>
            <dt>Duration</dt><dd class="num">${Math.round((new Date(a.ends_at) - new Date(a.starts_at)) / 6e4)} min</dd>
            <dt>Host</dt><dd>${esc(member?.name || "—")}</dd>
            <dt>Timezone</dt><dd>${esc(a.timezone || "—")}</dd>
          </dl>
        </div>
        <div class="sheet-foot">
          <span></span>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${a.status === "confirmed" || a.status === "rescheduled" ? `<button class="btn btn-ghost btn-sm" data-status="completed">Attended</button>
            <button class="btn btn-ghost btn-sm" data-status="no_show">No-show</button>
            <button class="btn btn-danger btn-sm" data-status="cancelled">Cancel</button>` : `<button class="btn btn-ghost btn-sm" id="apClose2">Close</button>`}
          </div>
        </div>
      </aside>`;
    const close = () => { state.sheetAppt = null; renderApptSheet(); };
    $("#apClose")?.addEventListener("click", close); $("#apScrim")?.addEventListener("click", close); $("#apClose2")?.addEventListener("click", close);
    $$("[data-status]").forEach((b) => b.addEventListener("click", () => setStatus(a.id, b.dataset.status)));
  }
  async function setStatus(id, status) {
    if (!connected()) { const a = state.appts.find((x) => x.id === id); if (a) a.status = status; toast(`Marked ${status.replace("_", " ")} (mockup).`, "success"); state.sheetAppt = null; renderApptSheet(); render(); return; }
    try { const c = ensureClient(); const { error } = await c.rpc("set_appointment_status", { p_appt: id, p_status: status }); if (error) throw error; toast(`Marked ${status.replace("_", " ")}.`, "success"); state.sheetAppt = null; await loadAppointments(); render(); }
    catch (e) { toast(e.message || "Update failed.", "danger"); }
  }

  /* ── Router + render ────────────────────────────────────────────────────── */
  function currentRoute() { const h = (location.hash || "").replace(/^#/, ""); if (h.includes("/calendar") && !h.includes("/calendars")) return { key: "calendar" }; return { key: "calendars" }; }
  function render() {
    const route = currentRoute();
    const content = route.key === "calendar" ? viewCalendar() : viewCalendars();
    $("#app").innerHTML = shell(route.key, content);
    // Chrome wiring
    $("#themeToggle")?.addEventListener("click", () => setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"));
    $("#openConnect2")?.addEventListener("click", openDrawer);
    $("#railBurger")?.addEventListener("click", () => $("#rail")?.classList.toggle("open"));
    $$("[data-hash]").forEach((n) => n.addEventListener("click", () => { location.hash = n.dataset.hash; $("#rail")?.classList.remove("open"); }));
    $$("[data-preview]").forEach((b) => b.addEventListener("click", () => { state.previewState = b.dataset.preview; render(); }));
    $("#retryBtn")?.addEventListener("click", () => { state.previewState = "default"; boot(); });
    // Reveal
    if (!reduce) { document.body.classList.add("js-ready"); const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("in")), { threshold: 0, rootMargin: "0px 0px -40px 0px" }); $$(".reveal").forEach((n) => io.observe(n)); } else { $$(".reveal").forEach((n) => n.classList.add("in")); }

    if (route.key === "calendars") {
      $("#newCal")?.addEventListener("click", () => openEditor(null));
      $("#newCal2")?.addEventListener("click", () => openEditor(null));
      $$("[data-edit]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); openEditor(b.dataset.edit); }));
      $$(".cal-card").forEach((c) => c.addEventListener("click", () => { if (canManage()) openEditor(c.dataset.cal); }));
    } else {
      $("#calPrev")?.addEventListener("click", () => nav(-1));
      $("#calNext")?.addEventListener("click", () => nav(1));
      $("#calToday")?.addEventListener("click", () => { state.weekOffset = 0; state.monthCursor = null; refreshCal(); });
      $$("[data-view]").forEach((b) => b.addEventListener("click", () => { state.view = b.dataset.view; refreshCal(); }));
      $("#fCal")?.addEventListener("change", (e) => { state.filterCal = e.target.value; render(); });
      $("#newAppt")?.addEventListener("click", () => toast("Manual appointment creation opens the booking flow — connect a project to persist.", "info"));
      $$("[data-appt]").forEach((b) => b.addEventListener("click", () => openAppt(b.dataset.appt)));
    }
  }
  function nav(dir) { if (state.view === "week") state.weekOffset += dir; else { const c = monthCursor(); state.monthCursor = new Date(c.getFullYear(), c.getMonth() + dir, 1); } refreshCal(); }
  async function refreshCal() { if (connected()) { state.loading = true; render(); await loadAppointments(); state.loading = false; } render(); }

  window.addEventListener("hashchange", render);
  boot();
})();
