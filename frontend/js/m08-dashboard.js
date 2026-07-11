/* m08-dashboard.js — AiMindShare Module M08 · Dashboard (no Copilot).
   The workspace home screen. Read-only aggregation over tables that already exist:
     KPI strip   — new contacts (Chart.js sparkline), open pipeline, revenue collected,
                   appointments upcoming; each card renders ONLY if its table exists and
                   deep-links to its module.
     Needs panel — act-now: overdue tasks, overdue invoices, today's appointments.
     Quick acts  — New Contact/Deal/Compose/Book/Task → navigate to the owning module.
     Widgets     — pipeline snapshot (mini funnel), activity feed (notifications), tasks due,
                   upcoming appointments, usage meters (M03), a contacts trend chart.
   Every query is `.eq('workspace_id', …)` under RLS; only the anon key touches the browser
   (Law 3). No writes, no jobs, no metered actions. Offline → a high-fidelity mockup with a
   default/empty/loading/error/success preview switcher. Copilot is deferred to Phase 8. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const initials = (s) => (s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const DAY = 864e5;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  /* ── Icons ──────────────────────────────────────────────────────────────── */
  const P = {
    grid: "M4 4h6v7H4zM14 4h6v7h-6zM4 15h6v5H4zM14 13h6v7h-6z",
    users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    user: "M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    dollar: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
    cal: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
    check: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
    mail: "M2 5h20v14H2zM2 6l10 7 10-7",
    plus: "M12 5v14M5 12h14",
    bolt: "M13 2 3 14h7l-1 8 10-12h-7z",
    alert: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
    arrow: "M5 12h14M13 6l6 6-6 6",
    trend: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6",
    gauge: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 3a9 9 0 0 0-9 9 9 9 0 0 0 4 7.5M12 3a9 9 0 0 1 9 9 9 9 0 0 1-4 7.5",
    bell: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
    search: "M21 21l-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
    clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
    home: "M3 11l9-8 9 8M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9",
    spark: "M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3",
  };
  const svg = (n, s = 17) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${P[n] || ""}"/></svg>`;

  /* ── Theme + starfield (light default; dark = no stars, hidden by app.css) ── */
  const THEME_KEY = "aimindshare-theme";
  const root = document.documentElement;
  const setTheme = (t) => { root.setAttribute("data-theme", t); try { localStorage.setItem(THEME_KEY, t); } catch (e) {} };
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

  /* ── Formatters (all numbers render in --font-mono via markup) ──────────── */
  const CUR = { USD: "$", EUR: "€", GBP: "£", CAD: "$", AUD: "$" };
  const fmtInt = (n) => Number(n || 0).toLocaleString("en-US");
  function fmtCompact(n) { n = Number(n || 0); const a = Math.abs(n); if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M"; if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "k"; return fmtInt(n); }
  const money = (major, cur = "USD") => `<span class="cur">${CUR[cur] || cur + " "}</span>${fmtCompact(major)}`;
  function relTime(iso) { const d = (Date.now() - new Date(iso).getTime()) / 1000; if (d < 60) return "just now"; if (d < 3600) return Math.floor(d / 60) + "m ago"; if (d < DAY / 1000) return Math.floor(d / 3600) + "h ago"; if (d < 7 * DAY / 1000) return Math.floor(d / (DAY / 1000)) + "d ago"; return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
  const fmtWhen = (iso) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
  function deltaHtml(cur, prev) {
    if (prev == null) return "";
    if (prev === 0) return cur > 0 ? `<span class="kpi-delta up">${svg("trend", 12)} new</span>` : "";
    const pct = Math.round(((cur - prev) / prev) * 100);
    if (pct === 0) return `<span class="kpi-delta flat">±0%</span>`;
    const up = pct > 0;
    return `<span class="kpi-delta ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(pct)}%</span>`;
  }

  /* ── Date-range bounds ──────────────────────────────────────────────────── */
  function rangeBounds(kind) {
    const now = new Date(); const end = now;
    // Previous windows are the SAME elapsed length as the current one (month-to-date vs the
    // same number of days last period) — a fair comparison, not partial-vs-full.
    if (kind === "30d") { const start = new Date(now.getTime() - 30 * DAY); return { start, end, prevStart: new Date(now.getTime() - 60 * DAY), prevEnd: start, label: "Last 30 days", compare: "vs prior 30 days", buckets: 30, bucketMs: DAY }; }
    if (kind === "quarter") { const q = Math.floor(now.getMonth() / 3); const start = new Date(now.getFullYear(), q * 3, 1); const prevStart = new Date(now.getFullYear(), q * 3 - 3, 1); return { start, end, prevStart, prevEnd: new Date(prevStart.getTime() + (end - start)), label: "This quarter", compare: "vs last quarter", buckets: 13, bucketMs: 7 * DAY }; }
    const start = new Date(now.getFullYear(), now.getMonth(), 1); const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { start, end, prevStart, prevEnd: new Date(prevStart.getTime() + (end - start)), label: "This month", compare: "vs last month", buckets: Math.max(now.getDate(), 2), bucketMs: DAY };
  }
  const inRange = (iso, a, b) => { const t = new Date(iso).getTime(); return t >= a.getTime() && t <= b.getTime(); };
  function bucketSeries(dates, start, count, stepMs) {
    const out = new Array(count).fill(0); const s = start.getTime();
    for (const iso of dates) { const idx = Math.floor((new Date(iso).getTime() - s) / stepMs); if (idx >= 0 && idx < count) out[idx]++; }
    return out;
  }
  const isToday = (iso) => { const d = new Date(iso), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); };
  const dateOnlyToday = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };

  /* ── Mock dataset (realistic; run through the same compute path as live) ─── */
  const MOCK = (() => {
    const now = Date.now();
    const contactsCreatedAt = [];
    for (let d = 74; d >= 0; d--) { const n = 1 + Math.round((74 - d) / 26) + ((d * 7) % 3 === 0 ? 1 : 0); for (let k = 0; k < n; k++) contactsCreatedAt.push(new Date(now - d * DAY - (k * 137 % 20) * 36e5).toISOString()); }
    const stages = [
      { id: "s1", name: "New", order_index: 0 }, { id: "s2", name: "Qualified", order_index: 1 },
      { id: "s3", name: "Proposal", order_index: 2 }, { id: "s4", name: "Negotiation", order_index: 3 }, { id: "s5", name: "Won", order_index: 4 },
    ];
    const deals = [
      ["s1", 4200], ["s1", 2600], ["s1", 8100], ["s2", 12500], ["s2", 6400], ["s2", 9800],
      ["s3", 24000], ["s3", 15600], ["s4", 38000], ["s4", 21000],
    ].map(([stage_id, value], i) => ({ id: "d" + i, value, status: "open", stage_id }));
    const invoices = [
      { amount_paid: 320000, total: 320000, status: "paid", due_date: iso(-20), paid_at: iso(-6), currency: "USD" },
      { amount_paid: 148000, total: 148000, status: "paid", due_date: iso(-12), paid_at: iso(-3), currency: "USD" },
      { amount_paid: 96000, total: 96000, status: "paid", due_date: iso(-2), paid_at: iso(-1), currency: "USD" },
      { amount_paid: 0, total: 210000, status: "sent", due_date: iso(-4), paid_at: null, currency: "USD" },
      { amount_paid: 0, total: 54000, status: "sent", due_date: iso(-1), paid_at: null, currency: "USD" },
      { amount_paid: 0, total: 88000, status: "sent", due_date: iso(9), paid_at: null, currency: "USD" },
    ];
    const appts = [
      { starts_at: iso(0, 15), status: "confirmed", calendar_name: "Intro Call", label: "Nadia Iqbal" },
      { starts_at: iso(0, 17), status: "confirmed", calendar_name: "Strategy Session", label: "Omar Farouk" },
      { starts_at: iso(1, 10.5), status: "confirmed", calendar_name: "Intro Call", label: "Sana Malik" },
      { starts_at: iso(2, 14), status: "confirmed", calendar_name: "Strategy Session", label: "Bilal Ahmed" },
      { starts_at: iso(4, 11), status: "confirmed", calendar_name: "Intro Call", label: "Layla Hassan" },
    ];
    const tasks = [
      { title: "Send proposal to Zenith", due_date: dstr(-2), status: "open", label: "Omar Farouk" },
      { title: "Follow up on contract", due_date: dstr(-1), status: "open", label: "Sana Malik" },
      { title: "Call back about pricing", due_date: dstr(0), status: "open", label: "Nadia Iqbal" },
      { title: "Prep onboarding docs", due_date: dstr(0), status: "open", label: "Bilal Ahmed" },
    ];
    const notifications = [
      { type: "deal.won", title: "Deal won — Crescent Co ($24,000)", created_at: iso(-0.05) },
      { type: "appointment.booked", title: "New booking — Intro Call with Layla Hassan", created_at: iso(-0.3) },
      { type: "contact.created", title: "New contact added — Yusuf Karim", created_at: iso(-0.8) },
      { type: "invoice.paid", title: "Invoice #1043 paid — $9,600", created_at: iso(-1.4) },
      { type: "task.due", title: "Task due today — Call back about pricing", created_at: iso(-2.1) },
      { type: "deal.moved", title: "Deal moved to Negotiation — Northgate", created_at: iso(-3.2) },
    ];
    const meters = [{ kind: "email", quantity: 19800 }, { kind: "sms", quantity: 2340 }, { kind: "ai_tokens", quantity: 3120000 }, { kind: "enrichment", quantity: 980 }];
    const planIncluded = { email: 25000, sms: 2500, ai_tokens: 5000000, enrichment: 2000 };
    return { user: { id: "u1", email: "aisha@northstar.agency", name: "Aisha Rahman" }, workspace: { id: "ws", name: "Northstar Agency" }, role: "owner", contactsCreatedAt, stages, deals, invoices, appts, tasks, notifications, meters, planIncluded };
    function iso(dayOff, hour) { const d = new Date(now + dayOff * DAY); if (hour != null) { d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0); } return d.toISOString(); }
    function dstr(dayOff) { const d = new Date(now + dayOff * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
  })();
  const METER_LABEL = { email: "Email", sms: "SMS", ai_tokens: "AI tokens", enrichment: "Enrichment", image_gen: "Image gen", seo_calls: "SEO calls", voice_minutes: "Voice minutes", video_render: "Video renders" };

  /* ── State ──────────────────────────────────────────────────────────────── */
  const PREVIEW_STATES = ["default", "empty", "loading", "error", "success"];
  const state = {
    loaded: false, loading: false, error: null, previewState: "default", range: "month",
    user: null, workspaceId: null, workspaceName: "", role: "staff",
    raw: null, present: {},
  };
  const stp = (name) => !connected() && state.previewState === name;

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
        await loadAll(c, active.id);
      } catch (e) { state.error = e.message || String(e); }
      state.loading = false; state.loaded = true;
    } else {
      state.user = MOCK.user; state.workspaceId = MOCK.workspace.id; state.workspaceName = MOCK.workspace.name; state.role = MOCK.role;
      state.raw = mockRaw(); state.present = { contacts: true, deals: true, invoices: true, appts: true, tasks: true, notifications: true, meters: true };
      state.loaded = true; state.loading = false;
    }
    render();
  }
  function pickActive(list) { const usable = (list || []).filter((w) => w.status !== "archived"); if (!usable.length) return list[0] || null; let id; try { id = localStorage.getItem(ACTIVE_KEY); } catch (e) {} return usable.find((w) => w.id === id) || usable[0]; }

  function mockRaw() {
    // In the "empty" preview, exercise the honest zero-data path.
    if (stp("empty")) return { contactsCreatedAt: [], stages: MOCK.stages, deals: [], invoices: [], appts: [], tasks: [], notifications: [], meters: [], planIncluded: {} };
    return { contactsCreatedAt: MOCK.contactsCreatedAt, stages: MOCK.stages, deals: MOCK.deals, invoices: MOCK.invoices, appts: MOCK.appts, tasks: MOCK.tasks, notifications: MOCK.notifications, meters: MOCK.meters, planIncluded: MOCK.planIncluded };
  }

  /* ── Live loaders — each table guarded; a missing/denied table just hides its card ── */
  async function loadAll(c, ws) {
    const present = {}; const raw = { contactsCreatedAt: [], stages: [], deals: [], invoices: [], appts: [], tasks: [], notifications: [], meters: [], planIncluded: {} };
    const since = new Date(Date.now() - 100 * DAY).toISOString();      // wide enough for month/30d/quarter + previous
    const jobs = [
      c.from("contacts").select("created_at").eq("workspace_id", ws).gte("created_at", since).then((r) => { if (!r.error) { present.contacts = true; raw.contactsCreatedAt = (r.data || []).map((x) => x.created_at); } }),
      c.from("pipeline_stages").select("id,name,order_index").eq("workspace_id", ws).order("order_index").then((r) => { if (!r.error) raw.stages = r.data || []; }),
      c.from("deals").select("value,status,stage_id").eq("workspace_id", ws).then((r) => { if (!r.error) { present.deals = true; raw.deals = r.data || []; } }),
      c.from("invoices").select("amount_paid,total,status,due_date,paid_at,currency").eq("workspace_id", ws).then((r) => { if (!r.error) { present.invoices = true; raw.invoices = r.data || []; } }),
      c.from("appointments").select("starts_at,status,calendar_id,contacts(first_name,last_name),calendars(name)").eq("workspace_id", ws).gte("starts_at", dateOnlyToday().toISOString()).order("starts_at").limit(50).then((r) => { if (!r.error) { present.appts = true; raw.appts = (r.data || []).map((a) => ({ starts_at: a.starts_at, status: a.status, calendar_name: a.calendars?.name || "Appointment", label: nm(a.contacts) })); } }),
      c.from("contact_tasks").select("title,due_date,status,contacts(first_name,last_name)").eq("workspace_id", ws).eq("status", "open").order("due_date").limit(50).then((r) => { if (!r.error) { present.tasks = true; raw.tasks = (r.data || []).map((t) => ({ title: t.title, due_date: t.due_date, status: t.status, label: nm(t.contacts) })); } }),
      c.from("notifications").select("type,title,body,created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(8).then((r) => { if (!r.error) { present.notifications = true; raw.notifications = r.data || []; } }),
      loadMeters(c, ws).then((m) => { if (m) { present.meters = true; raw.meters = m.meters; raw.planIncluded = m.planIncluded; } }),
    ];
    await Promise.allSettled(jobs);
    state.raw = raw; state.present = present;
  }
  const nm = (ct) => [ct?.first_name, ct?.last_name].filter(Boolean).join(" ") || "Contact";
  function periodKey() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`; }
  async function loadMeters(c, ws) {
    const { data: meters, error } = await c.from("usage_meters").select("kind,quantity").eq("workspace_id", ws).eq("period", periodKey());
    if (error) return null;
    let planIncluded = {};
    try {
      const { data: sub } = await c.from("subscriptions_platform").select("plan_id").eq("workspace_id", ws).maybeSingle();
      if (sub?.plan_id) { const { data: plan } = await c.from("plans").select("included").eq("id", sub.plan_id).maybeSingle(); planIncluded = plan?.included || {}; }
    } catch (e) {}
    return { meters: (meters || []).map((m) => ({ kind: m.kind, quantity: Number(m.quantity) })), planIncluded };
  }

  /* ── Derived — compute everything the view needs from raw + range ────────── */
  function compute() {
    const r = state.raw || {}; const rb = rangeBounds(state.range);
    // Contacts
    const curContacts = (r.contactsCreatedAt || []).filter((d) => inRange(d, rb.start, rb.end)).length;
    const prevContacts = (r.contactsCreatedAt || []).filter((d) => inRange(d, rb.prevStart, rb.prevEnd)).length;
    const curSeries = bucketSeries(r.contactsCreatedAt || [], rb.start, rb.buckets, rb.bucketMs);
    const prevSeries = bucketSeries(r.contactsCreatedAt || [], rb.prevStart, rb.buckets, rb.bucketMs);
    // Pipeline (snapshot, not range-bound)
    const openDeals = (r.deals || []).filter((d) => d.status === "open");
    const pipelineValue = openDeals.reduce((a, d) => a + Number(d.value || 0), 0);
    const stageMap = {}; (r.stages || []).forEach((s) => (stageMap[s.id] = { name: s.name, order: s.order_index, count: 0, value: 0 }));
    openDeals.forEach((d) => { const s = stageMap[d.stage_id]; if (s) { s.count++; s.value += Number(d.value || 0); } });
    const pipeline = Object.values(stageMap).sort((a, b) => a.order - b.order);
    // Revenue (amount_paid minor units → major)
    const paid = (r.invoices || []).filter((i) => i.paid_at);
    const curRev = paid.filter((i) => inRange(i.paid_at, rb.start, rb.end)).reduce((a, i) => a + Number(i.amount_paid || 0), 0) / 100;
    const prevRev = paid.filter((i) => inRange(i.paid_at, rb.prevStart, rb.prevEnd)).reduce((a, i) => a + Number(i.amount_paid || 0), 0) / 100;
    const revSeries = bucketPaid(paid, rb.start, rb.buckets, rb.bucketMs);
    const cur = (r.invoices || [])[0]?.currency || "USD";
    // Appointments
    const upcoming = (r.appts || []).filter((a) => new Date(a.starts_at) >= new Date() && (a.status === "confirmed" || a.status === "rescheduled"));
    const apptsToday = upcoming.filter((a) => isToday(a.starts_at)).length;
    // Tasks
    const today0 = dateOnlyToday();
    const overdueTasks = (r.tasks || []).filter((t) => t.status === "open" && t.due_date && new Date(t.due_date) < today0);
    const dueTodayTasks = (r.tasks || []).filter((t) => t.status === "open" && t.due_date && new Date(t.due_date).toDateString() === today0.toDateString());
    const tasksList = overdueTasks.concat(dueTodayTasks);
    // Invoices overdue
    const overdueInv = (r.invoices || []).filter((i) => (i.status === "sent" || i.status === "overdue" || i.status === "partial") && i.due_date && new Date(i.due_date) < today0 && Number(i.amount_paid || 0) < Number(i.total || 0));
    // Meters
    const meters = (r.meters || []).map((m) => { const inc = r.planIncluded?.[m.kind]; const unlimited = inc == null; const used = Number(m.quantity || 0); const pct = unlimited ? 0 : inc > 0 ? clamp((used / inc) * 100, 0, 100) : (used > 0 ? 100 : 0); return { kind: m.kind, used, included: unlimited ? null : Number(inc), unlimited, pct }; }).filter((m) => m.used > 0 || m.included).sort((a, b) => b.pct - a.pct).slice(0, 4);
    return {
      rb,
      kpi: { curContacts, prevContacts, curSeries, prevSeries, pipelineValue, curRev, prevRev, revSeries, cur, upcoming: upcoming.length },
      pipeline, activity: r.notifications || [], tasks: tasksList, appts: upcoming.slice(0, 5), meters,
      needs: { overdueTasks: overdueTasks.length, overdueInv: overdueInv.length, apptsToday },
    };
  }
  function bucketPaid(paid, start, count, stepMs) { const out = new Array(count).fill(0); const s = start.getTime(); for (const i of paid) { const idx = Math.floor((new Date(i.paid_at).getTime() - s) / stepMs); if (idx >= 0 && idx < count) out[idx] += Number(i.amount_paid || 0) / 100; } return out; }

  /* ── Shell ──────────────────────────────────────────────────────────────── */
  function shell(content) {
    return `
      <aside class="rail" id="rail">
        <div class="brand"><span class="mark">✦</span><span><b>AiMind</b><em>Share</em></span></div>
        <div class="nav-group"><div class="nav-group-label">Overview</div>
          <div class="nav-item active" data-hash="#/dashboard"><span class="ni-ico">${svg("home", 15)}</span><span>Dashboard</span></div>
        </div>
        <div class="rail-foot">M08 · Dashboard</div>
      </aside>
      <header class="tbar">
        <button class="icon-btn rail-burger" id="railBurger" aria-label="Menu">☰</button>
        <div class="ws-trigger" style="cursor:default">
          <span class="ws-badge">${esc(initials(state.workspaceName || "AiMindShare"))}</span>
          <span class="ws-meta"><span class="ws-name">${esc(state.workspaceName || "Workspace")}</span><span class="ws-kind">Dashboard</span></span>
        </div>
        <div class="tb-search"><span>${svg("search", 15)}</span><span class="tbs-label">Search…</span><span class="kbd">⌘K</span></div>
        <div class="spacer"></div>
        <span class="pill plain" id="connPill" ${connected() ? "" : "hidden"}>${connected() ? "connected" : ""}</span>
        <button class="btn btn-ghost btn-sm" id="openConnect2">${connected() ? "Reconnect" : "Connect"}</button>
        <button class="icon-btn" id="themeToggle" title="Toggle theme" aria-label="Toggle theme"><span id="themeIco">${root.getAttribute("data-theme") === "dark" ? "☀" : "☾"}</span></button>
        <span class="avatar" title="${esc(state.user?.email || "")}">${esc(initials(state.user?.name || state.user?.email))}</span>
      </header>
      <main class="content"><div class="content-inner">${content}</div></main>`;
  }
  function previewStrip() {
    return "";
  }
  function pageHead() {
    const rb = rangeBounds(state.range);
    const seg = `<div class="seg" role="tablist" aria-label="Date range">
      ${[["month", "This month"], ["30d", "30 days"], ["quarter", "Quarter"]].map(([k, l]) => `<button class="${state.range === k ? "on" : ""}" data-range="${k}">${l}</button>`).join("")}</div>`;
    return `<div class="page-head reveal"><span class="eyebrow">Module · M08</span>
      <div class="dash-head-row">
        <div>
          <h1 style="margin-top:12px">Your <em>workspace</em></h1>
          <p class="sub">Everything that needs you, at a glance — pipeline, revenue, appointments and the day's work, ${esc(rb.label.toLowerCase())}.</p>
          <div class="freshness">Latest snapshot · just now</div>
        </div>
        ${seg}
      </div></div>`;
  }
  function skeleton() {
    return `<div class="page-head"><div class="skeleton" style="width:300px;height:46px;border-radius:12px"></div></div>
      <div class="kpi-strip">${Array(4).fill('<div class="skeleton" style="height:132px;border-radius:24px"></div>').join("")}</div>
      <div class="skeleton" style="height:96px;border-radius:24px;margin:22px 0"></div>
      <div class="dash-grid">${Array(4).fill('<div class="skeleton" style="height:220px;border-radius:24px"></div>').join("")}</div>`;
  }
  function errorBlock(msg) {
    return `<div class="panel" style="border-color:rgba(196,97,78,.4)"><div class="empty-state">
      <div class="es-ico" style="background:rgba(196,97,78,.12);color:var(--status-danger)">${svg("alert", 24)}</div>
      <h3>We couldn't load your dashboard</h3><p>${esc(msg || "Something went wrong reading this workspace.")}</p>
      <button class="btn btn-ghost es-cta" id="retryBtn">Retry</button></div></div>`;
  }

  /* ── View ───────────────────────────────────────────────────────────────── */
  const chartRegistry = [];
  function viewDashboard() {
    if (stp("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    if (stp("error") || state.error) return previewStrip() + pageHead() + errorBlock(state.error);
    const d = compute();
    return previewStrip() + pageHead() + kpiStrip(d) + needsPanel(d) + quickActions() + widgetGrid(d);
  }

  function kpiStrip(d) {
    const k = d.kpi; const P0 = state.present; const cards = [];
    if (P0.contacts) cards.push(kpiCard("m09-crm.html", "users", "New contacts", fmtInt(k.curContacts), deltaHtml(k.curContacts, k.prevContacts), d.rb.compare, "spk-contacts", false));
    if (P0.deals) cards.push(kpiCard("m11-pipeline.html", "target", "Open pipeline", money(k.pipelineValue, k.cur), "", "open value", null, false));
    if (P0.invoices) cards.push(kpiCard("m28-payments-and-invoicing.html", "dollar", "Revenue collected", money(k.curRev, k.cur), deltaHtml(k.curRev, k.prevRev), d.rb.compare, "spk-rev", true));
    if (P0.appts) cards.push(kpiCard("m14-calendar-and-booking.html", "cal", "Appointments", fmtInt(k.upcoming), "", "upcoming", null, false));
    if (!cards.length) return `<div class="panel reveal"><div class="empty-state"><div class="es-ico">${svg("grid", 24)}</div><h3>No modules connected yet</h3><p>Add contacts, deals, invoices or a calendar and your KPIs light up here.</p></div></div>`;
    return `<div class="kpi-strip reveal">${cards.join("")}</div>`;
  }
  function kpiCard(href, ico, label, valueHtml, delta, chip, sparkId, featured) {
    const spark = sparkId ? `<span class="kpi-spark"><canvas id="${sparkId}" width="78" height="30"></canvas></span>` : "";
    const meta = (delta || chip) ? `<div class="kpi-meta">${delta || ""}${chip ? `<span class="kpi-chip">${esc(chip)}</span>` : ""}</div>` : "";
    return `<a class="kpi ${featured ? "kpi-featured" : ""}" href="${href}">
      <div class="kpi-head"><span class="kpi-ico">${svg(ico, 16)}</span>${spark}</div>
      <div class="kpi-val">${valueHtml}</div>
      <div class="kpi-label">${esc(label)}</div>${meta}</a>`;
  }

  function needsPanel(d) {
    const n = d.needs; const items = [];
    if (n.overdueTasks) items.push(niItem("m09-crm.html", "check", n.overdueTasks, n.overdueTasks === 1 ? "Overdue task" : "Overdue tasks", true));
    if (n.overdueInv) items.push(niItem("m28-payments-and-invoicing.html", "dollar", n.overdueInv, n.overdueInv === 1 ? "Overdue invoice" : "Overdue invoices", true));
    if (n.apptsToday) items.push(niItem("m14-calendar-and-booking.html", "cal", n.apptsToday, "Today's appointments", false));
    const total = n.overdueTasks + n.overdueInv + n.apptsToday;
    if (!items.length) {
      return `<div class="needs-panel reveal"><div class="np-head"><div class="np-ico">${svg("check", 18)}</div>
        <h2>You're all <em>caught up</em></h2></div>
        <p style="color:var(--ink-400);font-size:13.5px">No overdue tasks or invoices, and nothing else needs you right now. Nice work.</p></div>`;
    }
    return `<div class="needs-panel reveal"><div class="np-head"><div class="np-ico">${svg("bolt", 18)}</div>
      <h2>Needs <em>you</em></h2><span class="np-count">${total} item${total === 1 ? "" : "s"}</span></div>
      <div class="needs-actions">${items.join("")}</div></div>`;
  }
  function niItem(href, ico, num, label, danger) {
    return `<a class="needs-item ${danger ? "danger" : ""}" href="${href}" style="text-decoration:none">
      <span class="ni-ico">${svg(ico, 15)}</span>
      <div><div class="ni-num">${fmtInt(num)}</div><div class="ni-label">${esc(label)}</div></div>
      <span class="ni-go">${svg("arrow", 16)}</span></a>`;
  }

  function quickActions() {
    const acts = [
      ["m09-crm.html", "user", "New contact"], ["m11-pipeline.html", "target", "New deal"],
      ["m12-inbox.html", "mail", "Compose"], ["m14-calendar-and-booking.html", "cal", "Book"],
      ["m09-crm.html", "check", "New task"],
    ];
    return `<div class="qa-bar reveal">${acts.map(([h, i, l]) => `<a class="qa-btn" href="${h}"><span class="qa-ico">${svg(i, 16)}</span><span class="qa-label">${esc(l)}</span></a>`).join("")}</div>`;
  }

  function panel(icoName, title, viewallHref, body, span) {
    const va = viewallHref ? `<a class="cc-viewall" href="${viewallHref}">View all ${svg("arrow", 13)}</a>` : "";
    return `<section class="panel reveal ${span ? "span-2" : ""}"><div class="panel-head"><span class="ph-ico">${svg(icoName, 15)}</span><h3>${esc(title)}</h3>${va}</div>${body}</section>`;
  }
  function emptyBody(msg) { return `<div class="panel-empty">${esc(msg)}</div>`; }

  function widgetGrid(d) {
    return `<div class="dash-grid">
      ${panel("target", "Pipeline snapshot", "m11-pipeline.html", pipelineBody(d), false)}
      ${panel("bell", "Recent activity", "m04-notifications-center.html", activityBody(d), false)}
      ${panel("check", "Tasks due", "m09-crm.html", tasksBody(d), false)}
      ${panel("cal", "Upcoming appointments", "m14-calendar-and-booking.html", apptsBody(d), false)}
      ${panel("gauge", "Usage this period", "m03-billing-and-usage-metering.html", metersBody(d), false)}
      ${panel("trend", "New contacts trend", "m09-crm.html", trendBody(d), false)}
    </div>`;
  }
  function pipelineBody(d) {
    if (!state.present.deals) return emptyBody("Connect a pipeline to see stage flow.");
    if (!d.pipeline.length) return emptyBody("No open deals yet — add one in the pipeline.");
    return `<div class="pipe-mini">${d.pipeline.map((s) => `<div class="pipe-stage ${s.count ? "" : "dim"}">
      <div class="ps-label">${esc(s.name)}</div><div class="ps-count">${fmtInt(s.count)}</div>
      <div class="ps-value">${s.value ? "$" + fmtCompact(s.value) : "—"}</div></div>`).join("")}</div>`;
  }
  function activityBody(d) {
    if (!state.present.notifications) return emptyBody("Activity shows up as things happen across your workspace.");
    if (!d.activity.length) return emptyBody("No activity yet. As deals move and bookings land, they appear here.");
    return `<div class="row-list">${d.activity.map((a) => `<div class="data-row">
      <span class="r-lead ${/won|paid|invoice/.test(a.type || "") ? "gold" : ""}">${svg(actIco(a.type), 15)}</span>
      <div class="r-body"><div class="r-title">${esc(a.title || a.type || "Activity")}</div>
      ${a.body ? `<div class="r-meta">${esc(a.body)}</div>` : ""}</div>
      <div class="r-right"><span class="r-value">${esc(relTime(a.created_at))}</span></div></div>`).join("")}</div>`;
  }
  const actIco = (t) => /appointment|booking|cal/.test(t || "") ? "cal" : /invoice|paid|payment|revenue/.test(t || "") ? "dollar" : /deal|pipeline/.test(t || "") ? "target" : /task/.test(t || "") ? "check" : /contact/.test(t || "") ? "user" : "bell";
  function tasksBody(d) {
    if (!state.present.tasks) return emptyBody("Tasks from your CRM land here.");
    if (!d.tasks.length) return emptyBody("Nothing due today. You're clear.");
    const today0 = dateOnlyToday();
    return `<div class="row-list">${d.tasks.slice(0, 6).map((t) => { const overdue = t.due_date && new Date(t.due_date) < today0; return `<div class="data-row">
      <span class="r-lead ${overdue ? "gold" : ""}">${svg("check", 15)}</span>
      <div class="r-body"><div class="r-title">${esc(t.title || "Task")}</div><div class="r-meta">${esc(t.label || "")}</div></div>
      <div class="r-right"><span class="pill ${overdue ? "danger" : "info"}">${overdue ? "overdue" : "today"}</span></div></div>`; }).join("")}</div>`;
  }
  function apptsBody(d) {
    if (!state.present.appts) return emptyBody("Bookings from your calendars show up here.");
    if (!d.appts.length) return emptyBody("No upcoming appointments.");
    return `<div class="row-list">${d.appts.map((a) => `<div class="data-row">
      <span class="r-lead">${svg("cal", 15)}</span>
      <div class="r-body"><div class="r-title">${esc(a.label || a.calendar_name)}</div><div class="r-meta">${esc(a.calendar_name)}</div></div>
      <div class="r-right"><span class="r-value">${esc(fmtWhen(a.starts_at))}</span></div></div>`).join("")}</div>`;
  }
  function metersBody(d) {
    if (!state.present.meters) return emptyBody("Usage meters appear once billing is set up.");
    if (!d.meters.length) return emptyBody("No usage recorded this period.");
    return `<div class="um-list">${d.meters.map((m) => {
      const cls = m.pct >= 95 ? "danger" : m.pct >= 80 ? "warn" : "";
      const right = m.unlimited ? `${fmtCompact(m.used)} · unlimited` : `${fmtCompact(m.used)} / ${fmtCompact(m.included)}`;
      return `<div class="um-row ${m.unlimited ? "unlimited" : ""}">
        <div class="um-top"><span class="um-name">${esc(METER_LABEL[m.kind] || m.kind)}</span><span class="um-val">${right}</span></div>
        <div class="um-track"><div class="um-fill ${cls}" style="width:${m.unlimited ? 8 : Math.max(2, m.pct)}%"></div></div></div>`;
    }).join("")}</div>`;
  }
  function trendBody(d) {
    if (!state.present.contacts) return emptyBody("Add contacts to see how they grow over time.");
    if (!d.kpi.curSeries.some((v) => v > 0) && !d.kpi.prevSeries.some((v) => v > 0)) return emptyBody("No contacts in this range yet.");
    return `<div class="trend-wrap"><canvas id="trendChart"></canvas></div>
      <div class="trend-legend"><span><i class="primary"></i>${esc(d.rb.label)}</span><span><i class="compare"></i>Previous</span></div>`;
  }

  /* ── Charts (Chart.js — colors read from tokens so they follow the theme) ── */
  function cssVar(name) { return getComputedStyle(root).getPropertyValue(name).trim(); }
  function withAlpha(color, a) {
    color = color.trim();
    if (color.startsWith("#")) { let h = color.slice(1); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
    const m = color.match(/rgba?\(([^)]+)\)/); if (m) { const p = m[1].split(",").slice(0, 3).map((s) => s.trim()); return `rgba(${p.join(",")},${a})`; }
    return color;
  }
  function drawCharts(d) {
    if (!window.Chart) return;                    // graceful: sparklines simply absent if the lib failed to load
    while (chartRegistry.length) { try { chartRegistry.pop().destroy(); } catch (e) {} }
    const teal = cssVar("--teal-500") || "#2CA4AB", gold = cssVar("--gold-500") || "#C5A059";
    const ink = cssVar("--ink-400") || "#6b7a7a", line = cssVar("--line") || "rgba(0,0,0,.08)", cardSolid = cssVar("--card-solid") || "#fff";
    const spark = (id, data, color) => {
      const cv = document.getElementById(id); if (!cv) return;
      chartRegistry.push(new window.Chart(cv, { type: "line", data: { labels: data.map((_, i) => i), datasets: [{ data, borderColor: color, borderWidth: 1.6, backgroundColor: withAlpha(color, .14), fill: true, tension: .38, pointRadius: 0 }] },
        options: { responsive: false, animation: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false, min: 0 } }, elements: { line: { capBezierPoints: true } } } }));
    };
    if (d.kpi.curSeries) spark("spk-contacts", d.kpi.curSeries, teal);
    if (d.kpi.revSeries) spark("spk-rev", d.kpi.revSeries, gold);
    const tc = document.getElementById("trendChart");
    if (tc && window.Chart) {
      chartRegistry.push(new window.Chart(tc, { type: "line",
        data: { labels: d.kpi.curSeries.map((_, i) => i + 1), datasets: [
          { label: d.rb.label, data: d.kpi.curSeries, borderColor: teal, backgroundColor: withAlpha(teal, .12), borderWidth: 2, fill: true, tension: .35, pointRadius: 0 },
          { label: "Previous", data: d.kpi.prevSeries, borderColor: gold, borderWidth: 1.5, borderDash: [5, 4], fill: false, tension: .35, pointRadius: 0 },
        ] },
        options: { responsive: true, maintainAspectRatio: false, animation: reduce ? false : { duration: 500 },
          plugins: { legend: { display: false }, tooltip: { backgroundColor: cardSolid, titleColor: ink, bodyColor: ink, borderColor: line, borderWidth: 1, displayColors: false, padding: 10 } },
          scales: { x: { grid: { display: false }, ticks: { color: ink, font: { size: 10 }, maxTicksLimit: 6 } }, y: { beginAtZero: true, grid: { color: line }, border: { display: false }, ticks: { color: ink, font: { size: 10 }, precision: 0, maxTicksLimit: 5 } } } } }));
    }
  }

  /* ── Render + wiring ────────────────────────────────────────────────────── */
  function render() {
    $("#app").innerHTML = shell(viewDashboard());
    $("#themeToggle")?.addEventListener("click", () => { setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"); render(); });
    $("#openConnect2")?.addEventListener("click", openDrawer);
    $("#railBurger")?.addEventListener("click", () => $("#rail")?.classList.toggle("open"));
    $$("[data-hash]").forEach((n) => n.addEventListener("click", () => { location.hash = n.dataset.hash; $("#rail")?.classList.remove("open"); }));
    $$("[data-preview]").forEach((b) => b.addEventListener("click", () => { state.previewState = b.dataset.preview; if (!connected()) { state.raw = mockRaw(); } render(); }));
    $$("[data-range]").forEach((b) => b.addEventListener("click", () => { state.range = b.dataset.range; render(); }));
    $("#retryBtn")?.addEventListener("click", () => { state.previewState = "default"; state.error = null; boot(); });
    // Reveal (sections, not cards)
    if (!reduce) { document.body.classList.add("js-ready"); const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))), { threshold: 0, rootMargin: "0px 0px -40px 0px" }); $$(".reveal").forEach((n) => io.observe(n)); } else { $$(".reveal").forEach((n) => n.classList.add("in")); }
    // Charts after the DOM is in place
    if (state.loaded && !state.error && !(stp("loading") || (state.loading && !state.loaded)) && !stp("error")) { try { drawCharts(compute()); } catch (e) {} }
  }

  window.addEventListener("hashchange", () => { if (!/dashboard/.test(location.hash) && location.hash && location.hash !== "#/") return; render(); });
  boot();
})();
