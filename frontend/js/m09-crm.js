/* m09-crm.js — AiMindShare Module M09 · CRM & Contacts.
   Vanilla hash-routed dashboard on Supabase — the contacts database every other
   module hangs off. Screens under /crm and /settings: contacts list (KPIs, saved
   AND/OR smart lists, tag filters, search, multi-select + bulk bar), contact
   detail (Overview / Activity timeline / Notes / Tasks), companies, my tasks,
   duplicate review + merge, a 3-step CSV import wizard (consent-attested), and the
   tag + custom-field managers. The walls are server-side: RLS enforces staff+ for
   create/edit and manager+ for delete; export is permission-gated (crm.export →
   STAFF gets 403); the import Edge Function enqueues a job (the browser never
   processes rows); merge/eval/log_activity run as RPCs. Offline → a high-fidelity
   mockup with a default/empty/loading/error/success preview switcher (Gate-5). */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const initials = (s) => (s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const nextTick = (fn) => setTimeout(fn, 12);
  const fmtInt = (n) => Number(n || 0).toLocaleString("en-US");

  /* ── Lucide-style inline icons ──────────────────────────────────────────── */
  const P = {
    users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    user: "M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    building: "M4 22V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v18M15 9h4a1 1 0 0 1 1 1v12M8 7h.01M8 11h.01M8 15h.01M12 7h.01M12 11h.01M12 15h.01",
    check: "M20 6 9 17l-5-5", checks: "M18 6 7 17l-5-5M22 10l-7.5 7.5L13 16",
    mail: "M4 4h16v16H4zM22 6l-10 7L2 6",
    phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z",
    msg: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
    flame: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z",
    tag: "M20.59 13.41 12 22l-9-9V3h10l7.59 7.59a2 2 0 0 1 0 2.82zM7 7h.01",
    clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
    note: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5",
    task: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
    calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
    copy: "M9 9h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
    upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
    download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
    search: "M21 21l-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
    filter: "M22 3H2l8 9.5V19l4 2v-8.5z",
    x: "M18 6 6 18M6 6l12 12", plus: "M12 5v14M5 12h14", arrow: "M5 12h14M12 5l7 7-7 7",
    arrowLeft: "M19 12H5M12 19l-7-7 7-7", chev: "M9 18l6-6-6-6",
    edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z",
    trash: "M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
    merge: "M6 3v12M18 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM15 6a9 9 0 0 1-9 9",
    sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z",
    external: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3",
    info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
    alert: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
    globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z",
    dollar: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
    eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01z",
    star2: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z",
  };
  const svg = (name, size = 17) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${P[name] || ""}"/></svg>`;

  /* ── Registries ─────────────────────────────────────────────────────────── */
  const ACTIVITY_ICON = {
    email: "mail", sms: "msg", call: "phone", form: "task", page_visit: "eye",
    note: "note", task: "task", deal_change: "sparkle", appointment: "calendar",
    payment: "dollar", review: "star", custom: "info",
  };
  const TAG_PALETTE = ["#00696E", "#C5A059", "#2E9E7B", "#C4614E", "#2CA4AB", "#9A7C3F", "#6D797A", "#C79A3A"];
  const FIELD_TYPES = ["text", "textarea", "number", "date", "dropdown", "checkbox", "multiselect", "url", "file"];
  // Smart-list builder field + op catalog (mirrors js/smart-lists.js grammar).
  const SL_FIELDS = [
    { key: "first_name", label: "First name", kind: "text" },
    { key: "last_name", label: "Last name", kind: "text" },
    { key: "email", label: "Email", kind: "text" },
    { key: "phone", label: "Phone", kind: "text" },
    { key: "source", label: "Source", kind: "text" },
    { key: "lead_score", label: "Lead score", kind: "number" },
    { key: "created_at", label: "Created date", kind: "date" },
    { key: "tag", label: "Tag", kind: "tag" },
  ];
  const OPS = {
    text: [["eq", "equals"], ["neq", "not equals"], ["contains", "contains"], ["is_set", "is set"], ["not_set", "is empty"]],
    number: [["eq", "="], ["neq", "≠"], ["gt", ">"], ["gte", "≥"], ["lt", "<"], ["lte", "≤"]],
    date: [["gt", "after"], ["gte", "on or after"], ["lt", "before"], ["lte", "on or before"], ["eq", "on"]],
    tag: [["has", "has tag"], ["not_has", "missing tag"]],
  };

  /* ── Score bands ────────────────────────────────────────────────────────── */
  function scoreBand(n) {
    const s = Number(n || 0);
    if (s >= 61) return { cls: "hot", label: "Hot" };
    if (s >= 31) return { cls: "warm", label: "Warm" };
    return { cls: "cold", label: "Cold" };
  }
  function scoreBadge(n) {
    const b = scoreBand(n);
    return `<span class="score-badge ${b.cls}">${b.label} <span class="sb-num">${fmtInt(n || 0)}</span></span>`;
  }

  /* ── Deal stages (mockup pipeline) ──────────────────────────────────────── */
  const DEAL_STAGES = [
    { key: "new", label: "New", cls: "new" },
    { key: "qualified", label: "Qualified", cls: "qualified" },
    { key: "proposal", label: "Proposal", cls: "proposal" },
    { key: "negotiation", label: "Negotiation", cls: "negotiation" },
    { key: "won", label: "Won", cls: "won" },
    { key: "lost", label: "Lost", cls: "lost" },
  ];
  const OPEN_STAGES = ["new", "qualified", "proposal", "negotiation"];
  const stageMeta = (k) => DEAL_STAGES.find((s) => s.key === k) || { label: k, cls: "new" };
  const fmtMoney = (n) => "$" + Number(n || 0).toLocaleString("en-US");

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

  /* ── Date helpers ───────────────────────────────────────────────────────── */
  const DAY = 864e5;
  function fmtDate(d) { try { return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch (e) { return "—"; } }
  function fmtDateTime(d) { try { return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch (e) { return "—"; } }
  function relTime(d) {
    const diff = Date.now() - new Date(d).getTime();
    const h = Math.round(diff / 36e5);
    if (h < 1) return "just now";
    if (h < 24) return h + "h ago";
    const dd = Math.round(h / 24);
    if (dd < 30) return dd + "d ago";
    return fmtDate(d);
  }
  function daysUntil(d) { try { return Math.ceil((new Date(d).getTime() - Date.now()) / DAY); } catch (e) { return null; } }
  const isoDay = (offset = 0) => new Date(Date.now() + offset * DAY).toISOString();

  /* ── Mockup data (mockup mode only — never a live code path) ─────────────── */
  const MOCK = (() => {
    const tags = [
      { id: "t1", name: "VIP", color: "#C5A059" },
      { id: "t2", name: "Newsletter", color: "#2CA4AB" },
      { id: "t3", name: "Enterprise", color: "#00696E" },
      { id: "t4", name: "Trial", color: "#C79A3A" },
      { id: "t5", name: "Churned", color: "#C4614E" },
      { id: "t6", name: "Referral", color: "#2E9E7B" },
    ];
    const companies = [
      { id: "co1", name: "Bayan Studios", website: "bayan.studio", industry: "Design agency", size: "11-50", contacts: 4 },
      { id: "co2", name: "Sadaqah Fund", website: "sadaqahfund.org", industry: "Non-profit", size: "51-200", contacts: 3 },
      { id: "co3", name: "Noor Analytics", website: "nooranalytics.io", industry: "SaaS", size: "1-10", contacts: 3 },
      { id: "co4", name: "Falak Ventures", website: "falak.vc", industry: "Venture capital", size: "11-50", contacts: 2 },
    ];
    const cf = [
      { id: "cf1", field_name: "Preferred channel", field_type: "dropdown", options: ["Email", "SMS", "WhatsApp"] },
      { id: "cf2", field_name: "Lifetime value", field_type: "number", options: null },
    ];
    const mk = (id, fn, ln, email, phone, company_id, source, score, tagIds, assignee, days, custom) => ({
      id, first_name: fn, last_name: ln, email, phone, company_id, source,
      utm_source: source === "ads" ? "google" : null, utm_medium: source === "ads" ? "cpc" : null, utm_campaign: source === "ads" ? "ramadan24" : null,
      lead_score: score, assigned_to: assignee, tags: tagIds, custom: custom || {}, created_at: isoDay(-days),
    });
    const contacts = [
      mk("c1", "Aisha", "Rahman", "aisha.rahman@bayan.studio", "+1 (415) 555-0142", "co1", "referral", 84, ["t1", "t3"], "you", 3, { cf1: "Email", cf2: "48200" }),
      mk("c2", "Yusuf", "Karim", "yusuf.karim@sadaqahfund.org", "+1 (312) 555-0198", "co2", "form", 72, ["t2", "t6"], "you", 6, { cf1: "SMS" }),
      mk("c3", "Layla", "Hassan", "layla@nooranalytics.io", "+1 (206) 555-0175", "co3", "ads", 61, ["t4"], "sara", 9, { cf1: "WhatsApp", cf2: "12000" }),
      mk("c4", "Omar", "Farouk", "omar.farouk@falak.vc", "+1 (646) 555-0119", "co4", "manual", 58, ["t3"], "you", 12, { cf1: "Email" }),
      mk("c5", "Sana", "Iqbal", "sana.iqbal@bayan.studio", "+1 (415) 555-0163", "co1", "import", 45, ["t2"], "sara", 15, {}),
      mk("c6", "Bilal", "Ahmed", "bilal.ahmed@sadaqahfund.org", "+1 (312) 555-0187", "co2", "form", 39, ["t2", "t4"], "you", 18, { cf1: "SMS" }),
      mk("c7", "Fatima", "Zahra", "fatima.zahra@nooranalytics.io", "+1 (206) 555-0128", "co3", "referral", 67, ["t1", "t6"], "sara", 21, { cf2: "22400" }),
      mk("c8", "Hamza", "Sheikh", "hamza.sheikh@falak.vc", "+1 (646) 555-0154", "co4", "ads", 29, ["t4"], "you", 24, {}),
      mk("c9", "Mariam", "Nasser", "mariam.nasser@bayan.studio", "+1 (415) 555-0191", "co1", "manual", 18, ["t5"], "sara", 30, { cf1: "Email" }),
      mk("c10", "Idris", "Malik", "idris.malik@nooranalytics.io", "+1 (206) 555-0146", "co3", "form", 52, ["t2"], "you", 40, {}),
      mk("c11", "Khadija", "Bano", "khadija.bano@sadaqahfund.org", "+1 (312) 555-0133", "co2", "import", 8, ["t5"], "sara", 55, {}),
      mk("c12", "Tariq", "Aziz", "tariq.aziz@bayan.studio", "+1 (415) 555-0177", "co1", "referral", 76, ["t1", "t3"], "you", 70, { cf2: "63100" }),
    ];
    const activity = [
      { id: "a1", contact_id: "c1", type: "email", description: "Sent proposal “Q3 brand refresh”", actor: "Aisha (you)", created_at: isoDay(-0.2) },
      { id: "a2", contact_id: "c1", type: "call", description: "Discovery call — 24 min", actor: "Aisha (you)", created_at: isoDay(-1) },
      { id: "a3", contact_id: "c1", type: "page_visit", description: "Viewed pricing page 3×", actor: "System", created_at: isoDay(-1.5) },
      { id: "a4", contact_id: "c1", type: "payment", description: "Paid invoice #1042 — $4,800", actor: "System", created_at: isoDay(-2) },
      { id: "a5", contact_id: "c1", type: "form", description: "Submitted “Book a consult” form", actor: "System", created_at: isoDay(-3) },
      { id: "a6", contact_id: "c2", type: "sms", description: "Reminder: your appointment is tomorrow", actor: "System", created_at: isoDay(-0.5) },
      { id: "a7", contact_id: "c2", type: "review", description: "Left a 5★ review on Google", actor: "System", created_at: isoDay(-4) },
      { id: "a8", contact_id: "c1", type: "deal_change", description: "Deal moved to “Proposal sent”", actor: "Aisha (you)", created_at: isoDay(-2.5) },
    ];
    const notes = [
      { id: "n1", contact_id: "c1", user: "Aisha Rahman", content: "Prefers async updates over Slack. Decision-maker is the CMO, loops in on Fridays.", created_at: isoDay(-1) },
      { id: "n2", contact_id: "c1", user: "Sara Yılmaz", content: "Budget confirmed for Q3. Wants a phased rollout.", created_at: isoDay(-5) },
    ];
    const tasks = [
      { id: "k1", contact_id: "c1", contact_name: "Aisha Rahman", title: "Send revised SOW", due_date: isoDay(-1), status: "open" },
      { id: "k2", contact_id: "c2", contact_name: "Yusuf Karim", title: "Follow up on donation drive", due_date: isoDay(0), status: "open" },
      { id: "k3", contact_id: "c3", contact_name: "Layla Hassan", title: "Schedule onboarding call", due_date: isoDay(2), status: "open" },
      { id: "k4", contact_id: "c7", contact_name: "Fatima Zahra", title: "Share case study deck", due_date: isoDay(5), status: "open" },
      { id: "k5", contact_id: "c4", contact_name: "Omar Farouk", title: "Confirm contract terms", due_date: isoDay(-3), status: "done" },
    ];
    const smartLists = [
      { id: "sl1", name: "Hot leads", definition: { match: "and", rules: [{ field: "lead_score", op: "gte", value: 61 }] } },
      { id: "sl2", name: "VIP enterprise", definition: { match: "and", rules: [{ field: "tag", op: "has", value: "t3" }, { field: "tag", op: "has", value: "t1" }] } },
    ];
    const duplicates = [
      { id: "d1", contact_a: "c1", contact_b: "c5", score: 0.82, reason: "Same company + similar name", status: "open" },
      { id: "d2", contact_a: "c6", contact_b: "c11", score: 0.74, reason: "Matching email domain + phone", status: "open" },
    ];
    const deals = [
      { id: "dl1", name: "Q3 brand refresh", contact_id: "c1", company_id: "co1", stage: "proposal", value: 48200, owner: "you", close_date: isoDay(9) },
      { id: "dl2", name: "Annual donor CRM", contact_id: "c2", company_id: "co2", stage: "qualified", value: 22000, owner: "you", close_date: isoDay(21) },
      { id: "dl3", name: "Analytics dashboard build", contact_id: "c3", company_id: "co3", stage: "negotiation", value: 36500, owner: "sara", close_date: isoDay(5) },
      { id: "dl4", name: "Seed round advisory", contact_id: "c4", company_id: "co4", stage: "new", value: 15000, owner: "you", close_date: isoDay(30) },
      { id: "dl5", name: "Website redesign", contact_id: "c5", company_id: "co1", stage: "won", value: 18400, owner: "sara", close_date: isoDay(-4) },
      { id: "dl6", name: "Ramadan campaign", contact_id: "c7", company_id: "co3", stage: "proposal", value: 27400, owner: "sara", close_date: isoDay(12) },
      { id: "dl7", name: "Portfolio microsite", contact_id: "c8", company_id: "co4", stage: "lost", value: 9000, owner: "you", close_date: isoDay(-10) },
      { id: "dl8", name: "CRM onboarding retainer", contact_id: "c12", company_id: "co1", stage: "won", value: 63100, owner: "you", close_date: isoDay(-2) },
      { id: "dl9", name: "Newsletter automation", contact_id: "c10", company_id: "co3", stage: "qualified", value: 12000, owner: "you", close_date: isoDay(18) },
    ];
    return { user: { id: "you", email: "aisha@bayan.studio", name: "Aisha Rahman" }, workspace: { id: "ws-bayan", name: "Bayan Studios" }, members: { you: "Aisha (you)", sara: "Sara Yılmaz" }, tags, companies, custom_fields: cf, contacts, activity, notes, tasks, smartLists, duplicates, deals };
  })();

  /* ── App state ──────────────────────────────────────────────────────────── */
  const state = {
    loaded: false, loading: false, error: null, previewState: "default",
    user: null, workspaceId: null, workspaceName: "", role: "owner", flashOk: null,
    contacts: [], companies: [], tags: [], smartLists: [], customFields: [], duplicates: [], tasks: [], deals: [],
    // contacts screen local UI
    search: "", activeList: null, activeTags: [], selected: {},
    // detail screen local UI
    detailTab: "overview", tlFilter: "all", editingField: null,
    // activity feed screen local UI
    actFilter: "all",
    // import wizard
    importStep: 1, importRows: [], importHeaders: [], importMap: {}, importConsent: false, importProgress: null,
    // smart-list builder working definition
    builderDef: null,
  };
  const PREVIEW_STATES = ["default", "empty", "loading", "error", "success"];
  const st = (name) => !connected() && state.previewState === name;
  const canWrite = () => ["owner", "admin", "manager", "staff"].includes(state.role) || !connected();
  const canDelete = () => ["owner", "admin", "manager"].includes(state.role) || !connected();
  const memberName = (id) => (connected() ? (id === state.user?.id ? "You" : id ? String(id).slice(0, 8) : "—") : (MOCK.members[id] || id || "Unassigned"));

  /* ── Data loading ───────────────────────────────────────────────────────── */
  async function boot() {
    if (connected()) {
      state.loading = true; state.error = null; render();
      try {
        const c = ensureClient();
        const { data: { user } } = await c.auth.getUser();
        state.user = user;
        if (!user) { state.loaded = true; state.loading = false; renderConn(); render(); return; }

        const { data: wsRows, error: wsErr } = await c.from("workspaces").select("id,name,status").order("created_at");
        if (wsErr) throw wsErr;
        const active = pickActive(wsRows || []);
        if (!active) { state.loaded = true; state.loading = false; renderConn(); render(); return; }
        state.workspaceId = active.id; state.workspaceName = active.name;

        const { data: mine } = await c.from("memberships").select("role").eq("workspace_id", active.id).eq("user_id", user.id).maybeSingle();
        state.role = mine?.role || "staff";
        await loadWorkspace();
      } catch (e) { state.error = e.message || String(e); }
      state.loading = false; state.loaded = true;
    } else {
      // Mockup mode
      state.user = MOCK.user; state.workspaceId = MOCK.workspace.id; state.workspaceName = MOCK.workspace.name; state.role = "owner";
      hydrateMock();
      state.loaded = true; state.loading = false;
    }
    renderConn(); render();
  }

  function hydrateMock() {
    state.contacts = MOCK.contacts.map((c) => ({ ...c }));
    state.companies = MOCK.companies.map((c) => ({ ...c }));
    state.tags = MOCK.tags.map((t) => ({ ...t }));
    state.smartLists = MOCK.smartLists.map((s) => ({ ...s }));
    state.customFields = MOCK.custom_fields.map((f) => ({ ...f }));
    state.duplicates = MOCK.duplicates.map((d) => ({ ...d }));
    state.tasks = MOCK.tasks.map((t) => ({ ...t }));
    state.deals = MOCK.deals.map((d) => ({ ...d }));
  }

  async function loadWorkspace() {
    const c = ensureClient(), ws = state.workspaceId;
    const [{ data: contacts }, { data: companies }, { data: tags }, { data: ctags }, { data: lists }, { data: cf }, { data: cvals }, { data: dups }, { data: tasks }] = await Promise.all([
      c.from("contacts").select("*").eq("workspace_id", ws).is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
      c.from("companies").select("*").eq("workspace_id", ws).is("deleted_at", null).order("name"),
      c.from("tags").select("*").eq("workspace_id", ws),
      c.from("contact_tags").select("contact_id,tag_id").eq("workspace_id", ws),
      c.from("smart_lists").select("*").eq("workspace_id", ws).order("name"),
      c.from("custom_fields").select("*").eq("workspace_id", ws),
      c.from("contact_custom_values").select("contact_id,field_id,value").eq("workspace_id", ws),
      c.from("contact_duplicates").select("*").eq("workspace_id", ws).eq("status", "open"),
      c.from("contact_tasks").select("*").eq("workspace_id", ws),
    ]);
    const tagByContact = {}; (ctags || []).forEach((r) => { (tagByContact[r.contact_id] = tagByContact[r.contact_id] || []).push(String(r.tag_id)); });
    const cvByContact = {}; (cvals || []).forEach((r) => { (cvByContact[r.contact_id] = cvByContact[r.contact_id] || {})[r.field_id] = r.value; });
    state.contacts = (contacts || []).map((c2) => ({ ...c2, tags: tagByContact[c2.id] || [], custom: cvByContact[c2.id] || {} }));
    state.companies = companies || [];
    state.tags = (tags || []).map((t) => ({ ...t, id: String(t.id) }));
    state.smartLists = lists || [];
    state.customFields = cf || [];
    state.duplicates = dups || [];
    state.tasks = (tasks || []).map((t) => { const ct = state.contacts.find((x) => x.id === t.contact_id); return { ...t, contact_name: ct ? `${ct.first_name} ${ct.last_name}` : "—" }; });
    state.deals = []; // deals are a mockup-only concept — no backend table yet (M11 owns the live pipeline)
  }

  function pickActive(list) {
    const usable = (list || []).filter((w) => w.status !== "archived");
    if (!usable.length) return list[0] || null;
    let id; try { id = localStorage.getItem(ACTIVE_KEY); } catch (e) {}
    return usable.find((w) => w.id === id) || usable[0];
  }

  /* ── Lookups ────────────────────────────────────────────────────────────── */
  const contactById = (id) => state.contacts.find((c) => c.id === id);
  const companyById = (id) => state.companies.find((c) => c.id === id);
  const tagById = (id) => state.tags.find((t) => String(t.id) === String(id));
  const fullName = (c) => `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email || "Unnamed";

  /* ── Connection pill ────────────────────────────────────────────────────── */
  function renderConn() {
    const pill = $("#connPill"); if (!pill) return;
    if (connected()) { pill.className = "pill success"; pill.textContent = "connected"; }
    else { pill.className = "pill plain"; pill.textContent = "mockup mode"; }
  }

  /* ── Shell (rail + topbar) ──────────────────────────────────────────────── */
  const NAV = {
    crm: [
      { key: "dashboard", label: "Dashboard", ico: "flame", hash: "#/crm/dashboard" },
      { key: "contacts", label: "Contacts", ico: "users", hash: "#/crm/contacts" },
      { key: "companies", label: "Companies", ico: "building", hash: "#/crm/companies" },
      { key: "deals", label: "Deals", ico: "dollar", hash: "#/crm/deals" },
      { key: "activities", label: "Activities", ico: "clock", hash: "#/crm/activities" },
      { key: "tasks", label: "My tasks", ico: "task", hash: "#/crm/tasks" },
      { key: "reports", label: "Reports", ico: "eye", hash: "#/crm/reports" },
      { key: "duplicates", label: "Duplicates", ico: "copy", hash: "#/crm/duplicates" },
      { key: "import", label: "Import", ico: "upload", hash: "#/crm/import" },
    ],
    settings: [
      { key: "settings", label: "Settings", ico: "sparkle", hash: "#/settings" },
      { key: "tags", label: "Tags", ico: "tag", hash: "#/settings/tags" },
      { key: "fields", label: "Custom fields", ico: "sparkle", hash: "#/settings/fields" },
    ],
  };
  function navGroup(label, items, activeKey) {
    const rows = items.map((n) => `<div class="nav-item ${n.key === activeKey ? "active" : ""}" data-hash="${n.hash}"><span class="ni-ico">${svg(n.ico)}</span><span>${n.label}</span></div>`).join("");
    return `<div class="nav-group"><div class="nav-group-label">${label}</div>${rows}</div>`;
  }
  function shell(activeKey, content) {
    return `
      <aside class="rail" id="rail">
        <div class="brand"><span class="mark">✦</span><span><b>AiMind</b><em>Share</em></span></div>
        ${navGroup("CRM", NAV.crm, activeKey)}
        ${navGroup("Settings", NAV.settings, activeKey)}
        <div class="rail-foot">M09 · CRM &amp; Contacts</div>
      </aside>
      <header class="tbar">
        <button class="icon-btn rail-burger" id="railBurger" aria-label="Menu">☰</button>
        <div class="ws-trigger" style="cursor:default">
          <span class="ws-badge">${esc(initials(state.workspaceName || "AiMindShare"))}</span>
          <span class="ws-meta"><span class="ws-name">${esc(state.workspaceName || "Workspace")}</span><span class="ws-kind">CRM</span></span>
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

  /* ── Mockup preview switcher + shared bits ──────────────────────────────── */
  function previewStrip() {
    if (connected()) return "";
    return `<div class="mock-note"><span class="mn-ico">◈</span><b>Mockup mode.</b>
      Connect a project to read live contacts, companies, smart lists and timelines under RLS. Sample data shown. Preview state:
      ${PREVIEW_STATES.map((s) => `<button class="link ${state.previewState === s ? "on" : ""}" data-preview="${s}">${s}</button>`).join(" ")}</div>`;
  }
  function pageHead(title, sub) {
    return `<div class="page-head reveal">
      <span class="eyebrow">Module · M09</span>
      <h1 style="margin-top:12px">${title}</h1>
      <p class="sub">${sub}</p></div>`;
  }
  function flash() {
    if (!state.flashOk) return "";
    const m = state.flashOk; state.flashOk = null;
    return `<div class="ok-banner reveal"><span class="okb-ico">${svg("check", 18)}</span>${esc(m)}</div>`;
  }
  function skeleton() {
    return `<div class="page-head"><div class="skeleton" style="width:300px;height:44px;border-radius:12px"></div></div>
      <div class="kpi-strip">${Array(4).fill('<div class="skeleton" style="height:120px;border-radius:24px"></div>').join("")}</div>
      <div class="panel" style="margin-top:22px">${Array(5).fill('<div class="skeleton" style="height:52px;border-radius:10px;margin-bottom:14px"></div>').join("")}</div>`;
  }
  function errorBlock(msg) { return `<div class="panel" style="border-color:rgba(196,97,78,.4)"><div class="empty-state"><div class="es-ico" style="background:rgba(196,97,78,.12);color:var(--status-danger)">⚠</div><h3>Something went wrong</h3><p>${esc(msg || "We couldn't load this workspace's CRM data.")}</p><button class="btn btn-ghost es-cta" id="retryBtn">Retry</button></div></div>`; }
  function emptyBlock(ico, title, body, ctaLabel, ctaId) {
    const cta = ctaLabel ? `<button class="btn btn-primary es-cta" id="${ctaId}">${svg("plus", 14)} ${esc(ctaLabel)}</button>` : "";
    return `<div class="panel"><div class="empty-state"><div class="es-ico">${svg(ico, 22)}</div><h3>${esc(title)}</h3><p>${esc(body)}</p>${cta}</div></div>`;
  }
  function kpiStrip(kpis) {
    return `<div class="kpi-strip">${kpis.map((k) => `
      <div class="kpi reveal ${k.feat ? "kpi-featured" : ""}"><div class="kpi-ico">${svg(k.ico, 16)}</div>
        <div class="kpi-val num">${esc(k.val)}</div><div class="kpi-label">${k.label}</div></div>`).join("")}</div>`;
  }
  function tagPill(id) {
    const t = tagById(id); if (!t) return "";
    return `<span class="mini-tag"><span class="mt-dot" style="background:${esc(t.color)}"></span>${esc(t.name)}</span>`;
  }

  /* ── Which contacts are in scope after search + list + tag filters ──────── */
  function filteredContacts(source) {
    let list = source || state.contacts;
    if (state.activeList) {
      const sl = state.smartLists.find((s) => s.id === state.activeList);
      if (sl && window.SmartLists) list = window.SmartLists.evalSmartList(list, sl.definition);
    }
    if (state.activeTags.length) list = list.filter((c) => state.activeTags.every((t) => (c.tags || []).map(String).includes(String(t))));
    const q = state.search.trim().toLowerCase();
    if (q) list = list.filter((c) => [fullName(c), c.email, c.phone].some((v) => String(v || "").toLowerCase().includes(q)));
    return list;
  }

  /* ═══ VIEW: Contacts list ═════════════════════════════════════════════════ */
  function viewContacts() {
    if (st("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    if (st("error") || (connected() && state.error)) return previewStrip() + errorBlock(state.error);
    const all = st("empty") ? [] : state.contacts;
    const rows = filteredContacts(all);

    const weekAgo = Date.now() - 7 * DAY;
    const newThisWeek = all.filter((c) => new Date(c.created_at).getTime() >= weekAgo).length;
    const hot = all.filter((c) => Number(c.lead_score) >= 61).length;
    const tasksDue = state.tasks.filter((t) => t.status === "open" && (daysUntil(t.due_date) ?? 99) <= 0).length;
    const kpis = [
      { ico: "users", val: fmtInt(all.length), label: "Total contacts", feat: true },
      { ico: "sparkle", val: fmtInt(newThisWeek), label: "New this week" },
      { ico: "flame", val: fmtInt(hot), label: "Hot leads ≥61" },
      { ico: "clock", val: fmtInt(tasksDue), label: "Tasks due" },
    ];

    // Sidebar: smart lists + tag filters
    const listItems = state.smartLists.map((sl) => {
      const count = window.SmartLists ? window.SmartLists.evalSmartList(all, sl.definition).length : 0;
      return `<div class="smart-list-item ${state.activeList === sl.id ? "on" : ""}" data-list="${esc(sl.id)}">
        <span class="sli-ico">${svg("filter", 14)}</span><span>${esc(sl.name)}</span><span class="sli-count">${fmtInt(count)}</span></div>`;
    }).join("");
    const allItem = `<div class="smart-list-item ${!state.activeList ? "on" : ""}" data-list=""><span class="sli-ico">${svg("users", 14)}</span><span>All contacts</span><span class="sli-count">${fmtInt(all.length)}</span></div>`;
    const tagChips = state.tags.map((t) => `<button class="tag-chip-filter ${state.activeTags.includes(t.id) ? "on" : ""}" data-tagfilter="${esc(t.id)}"><span class="tcf-dot" style="background:${esc(t.color)}"></span>${esc(t.name)}</button>`).join("");
    const side = `<div class="crm-side">
      <div class="side-block reveal">
        <div class="sb-head"><span class="sbh-label">Smart lists</span><button class="sbh-add" id="newSmartList">${svg("plus", 12)} New</button></div>
        ${allItem}${listItems}
      </div>
      <div class="side-block reveal">
        <div class="sb-head"><span class="sbh-label">Filter by tag</span></div>
        <div class="tag-chip-wrap">${tagChips || '<span class="muted" style="font-size:12px;color:var(--ink-400)">No tags yet</span>'}</div>
      </div>
    </div>`;

    // Main: search + rows
    const search = `<div class="crm-search"><span class="cs-ico">${svg("search", 16)}</span>
      <input id="contactSearch" type="text" placeholder="Search name, email or phone…" value="${esc(state.search)}"></div>`;
    let main;
    if (!rows.length) {
      main = all.length
        ? emptyBlock("search", "No contacts match", "Try clearing the search, the active smart list or tag filters.")
        : emptyBlock("users", "No contacts yet", "Add your first contact, or import a CSV to bring your existing list into the CRM.", "New contact", "newContactEmpty");
    } else {
      main = `<div class="panel reveal" style="overflow-x:auto"><div class="row-list">${rows.map(contactRow).join("")}</div></div>`;
    }
    const selCount = Object.values(state.selected).filter(Boolean).length;
    const bulk = selCount ? `<div class="bulk-bar">
      <span class="bb-count"><b>${selCount}</b> selected</span>
      <button class="bb-clear" id="bulkClear">Clear</button><div class="spacer"></div>
      <button class="btn btn-ghost btn-sm" id="bulkTag">${svg("tag", 13)} Tag</button>
      <button class="btn btn-ghost btn-sm" id="bulkAssign">${svg("user", 13)} Assign</button>
      <button class="btn btn-ghost btn-sm" id="bulkExport">${svg("download", 13)} Export</button>
      <button class="btn btn-ghost btn-sm" id="bulkDelete" style="color:var(--status-danger);border-color:rgba(196,97,78,.4)">${svg("trash", 13)} Delete</button>
    </div>` : "";

    return `${previewStrip()}${flash()}
      ${pageHead(`Contacts &amp; <em>relationships</em>`, `The database at the heart of the workspace — every contact with a lead-score band, tags, custom fields and a full activity timeline. Messaging, deals and reviews all hang off these records.`)}
      ${kpiStrip(kpis)}
      <div class="sec-head"><h2>All <em>contacts</em></h2><div class="spacer"></div>
        <button class="btn btn-primary btn-sm" id="newContact">${svg("plus", 14)} New contact</button></div>
      <div class="crm-workbench">${side}<div>${search}${main}${bulk}</div></div>`;
  }
  function contactRow(c) {
    const co = companyById(c.company_id);
    const sel = !!state.selected[c.id];
    const tags = (c.tags || []).slice(0, 3).map(tagPill).join("");
    return `<div class="contact-row ${sel ? "selected" : ""}" data-cid="${esc(c.id)}">
      <input type="checkbox" class="cbx cr-check" data-select="${esc(c.id)}" ${sel ? "checked" : ""} aria-label="Select ${esc(fullName(c))}">
      <div class="cr-id" data-open="${esc(c.id)}">
        <span class="cr-avatar">${esc(initials(fullName(c)))}</span>
        <div style="min-width:0"><div class="cr-name">${esc(fullName(c))}</div>
          <div class="cr-contact">${esc(c.email || c.phone || "—")}</div></div></div>
      <div class="cr-company">${co ? `<span class="crc-ico">${svg("building", 13)}</span>${esc(co.name)}` : ""}</div>
      <div class="cr-score">${scoreBadge(c.lead_score)}</div>
      <div class="cr-tags">${tags}</div></div>`;
  }

  /* ═══ VIEW: Contact detail ════════════════════════════════════════════════ */
  function viewContactDetail(id) {
    if (st("loading") || (state.loading && !state.loaded)) return skeleton();
    if (st("error") || (connected() && state.error)) return errorBlock(state.error);
    const c = contactById(id);
    if (!c) return `<button class="back-link" data-hash="#/crm/contacts">${svg("arrowLeft", 14)} Contacts</button>` + emptyBlock("user", "Contact not found", "This contact may have been deleted or belongs to another workspace.");
    const co = companyById(c.company_id);

    const head = `<div class="detail-head reveal">
      <span class="dh-avatar">${esc(initials(fullName(c)))}</span>
      <div class="dh-body">
        <div class="dh-name">${esc(fullName(c))}</div>
        <div class="dh-meta">
          ${scoreBadge(c.lead_score)}
          ${c.email ? `<a class="dhm-item" href="mailto:${esc(c.email)}"><span class="dhmi-ico">${svg("mail", 13)}</span>${esc(c.email)}</a>` : ""}
          ${c.phone ? `<span class="dhm-item"><span class="dhmi-ico">${svg("phone", 13)}</span><span class="num">${esc(c.phone)}</span></span>` : ""}
          ${co ? `<a class="dhm-item" data-hash="#/crm/companies/${esc(co.id)}"><span class="dhmi-ico">${svg("building", 13)}</span>${esc(co.name)}</a>` : ""}
          <span class="dhm-item"><span class="dhmi-ico">${svg("user", 13)}</span>${esc(memberName(c.assigned_to))}</span>
        </div>
        <div class="dh-tags">${(c.tags || []).map(tagPill).join("") || ""}</div>
      </div>
      <div class="dh-actions">
        <button class="btn btn-primary btn-sm" data-log-activity>${svg("plus", 13)} Log activity</button>
        <button class="btn btn-ghost btn-sm" data-edit-tags>${svg("tag", 13)} Tags</button>
      </div></div>`;

    const acts = activityFor(id), notes = notesFor(id), tasks = tasksFor(id);
    const tabs = [
      { key: "overview", label: "Overview" },
      { key: "activity", label: "Activity", badge: acts.length },
      { key: "notes", label: "Notes", badge: notes.length },
      { key: "tasks", label: "Tasks", badge: tasks.length },
    ];
    const strip = `<div class="tab-strip">${tabs.map((t) => `<button class="tab-btn ${state.detailTab === t.key ? "on" : ""}" data-tab="${t.key}">${t.label}${t.badge ? `<span class="tb-badge">${fmtInt(t.badge)}</span>` : ""}</button>`).join("")}</div>`;

    let body;
    if (state.detailTab === "activity") body = tabActivity(c, acts);
    else if (state.detailTab === "notes") body = tabNotes(c, notes);
    else if (state.detailTab === "tasks") body = tabTasks(c, tasks);
    else body = tabOverview(c);

    return `${flash()}<button class="back-link" data-hash="#/crm/contacts">${svg("arrowLeft", 14)} Contacts</button>
      ${head}${strip}<div class="panel reveal">${body}</div>`;
  }
  function fieldRow(label, key, value, editing) {
    const empty = value == null || value === "";
    if (editing) {
      return `<div class="field-row"><div class="fr-label">${esc(label)}</div>
        <input id="edit_${key}" value="${esc(value || "")}" data-fieldkey="${key}">
        <button class="btn btn-primary btn-sm fr-save" data-save-field="${key}">${svg("check", 13)}</button></div>`;
    }
    return `<div class="field-row"><div class="fr-label">${esc(label)}</div>
      <div class="fr-value ${empty ? "empty" : ""}">${empty ? "Not set" : esc(value)}</div>
      <button class="fr-edit" data-edit-field="${key}" title="Edit">${svg("edit", 14)}</button></div>`;
  }
  function tabOverview(c) {
    const e = (k) => state.editingField === k;
    const std = [
      fieldRow("First name", "first_name", c.first_name, e("first_name")),
      fieldRow("Last name", "last_name", c.last_name, e("last_name")),
      fieldRow("Email", "email", c.email, e("email")),
      fieldRow("Phone", "phone", c.phone, e("phone")),
      fieldRow("Source", "source", c.source, e("source")),
      fieldRow("Lead score", "lead_score", c.lead_score, e("lead_score")),
    ].join("");
    const utm = (c.utm_source || c.utm_medium || c.utm_campaign)
      ? `<div class="panel-head" style="margin-top:22px"><span class="ph-ico">${svg("globe", 15)}</span><h3>Attribution</h3></div>
         <div class="field-list">
           ${fieldRow("UTM source", "utm_source", c.utm_source, false)}
           ${fieldRow("UTM medium", "utm_medium", c.utm_medium, false)}
           ${fieldRow("UTM campaign", "utm_campaign", c.utm_campaign, false)}</div>` : "";
    const custom = state.customFields.length
      ? `<div class="panel-head" style="margin-top:22px"><span class="ph-ico">${svg("sparkle", 15)}</span><h3>Custom fields</h3></div>
         <div class="field-list">${state.customFields.map((f) => {
        const k = "cf:" + f.id;
        return fieldRow(f.field_name, k, (c.custom || {})[f.id], e(k));
      }).join("")}</div>` : "";
    return `<div class="panel-head"><span class="ph-ico">${svg("user", 15)}</span><h3>Contact details</h3></div>
      <div class="field-list">${std}</div>${utm}${custom}`;
  }
  function activityFor(id) {
    const src = connected() ? state.activityLive || [] : MOCK.activity;
    return src.filter((a) => a.contact_id === id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  function tabActivity(c, acts) {
    const types = Array.from(new Set(acts.map((a) => a.type)));
    const filters = `<div class="tl-filter">
      <button class="tag-chip-filter ${state.tlFilter === "all" ? "on" : ""}" data-tlfilter="all">All</button>
      ${types.map((t) => `<button class="tag-chip-filter ${state.tlFilter === t ? "on" : ""}" data-tlfilter="${esc(t)}">${esc(t.replace("_", " "))}</button>`).join("")}</div>`;
    const shown = state.tlFilter === "all" ? acts : acts.filter((a) => a.type === state.tlFilter);
    if (!shown.length) return filters + `<div class="empty-state"><div class="es-ico">${svg("clock", 22)}</div><h3>No activity yet</h3><p>Emails, calls, form fills, payments and page visits will appear here as an immutable timeline. Log one manually with “Log activity”.</p></div>`;
    const items = shown.map((a) => `<div class="tl-item t-${esc(a.type)}">
      <div class="tli-rail"><div class="tli-dot">${svg(ACTIVITY_ICON[a.type] || "info", 15)}</div><div class="tli-line"></div></div>
      <div class="tli-body"><div class="tli-title">${esc(a.description)}</div>
        <div class="tli-meta"><span class="tl-type">${esc(a.type.replace("_", " "))}</span><span>${esc(a.actor || "System")}</span>·<span>${esc(fmtDateTime(a.created_at))}</span></div></div></div>`).join("");
    return filters + `<div class="timeline">${items}</div>`;
  }
  function notesFor(id) {
    const src = connected() ? state.notesLive || [] : MOCK.notes;
    return src.filter((n) => n.contact_id === id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  function tabNotes(c, notes) {
    const composer = `<div class="note-composer">
      <textarea id="noteText" placeholder="Add a note about ${esc(fullName(c))}…"></textarea>
      <div class="nc-actions"><button class="btn btn-primary btn-sm" data-add-note="${esc(c.id)}">${svg("plus", 13)} Add note</button></div></div>`;
    const list = notes.length ? notes.map((n) => `<div class="note-card">
      <div class="nc-head"><span class="nc-av">${esc(initials(n.user))}</span><span class="nc-who">${esc(n.user)}</span><span class="nc-when">${esc(relTime(n.created_at))}</span></div>
      <div class="nc-body">${esc(n.content)}</div></div>`).join("")
      : `<div class="empty-state" style="padding:32px 24px"><div class="es-ico">${svg("note", 22)}</div><h3>No notes yet</h3><p>Jot down context — preferences, decisions, meeting recaps — visible to your whole team.</p></div>`;
    return composer + list;
  }
  function tasksFor(id) {
    return state.tasks.filter((t) => t.contact_id === id).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  }
  function taskRow(t, showContact) {
    const done = t.status === "done";
    const dLeft = daysUntil(t.due_date);
    const dueCls = done ? "" : dLeft < 0 ? "overdue" : dLeft === 0 ? "today" : "";
    const dueTxt = done ? "done" : dLeft < 0 ? `${Math.abs(dLeft)}d overdue` : dLeft === 0 ? "due today" : fmtDate(t.due_date);
    return `<div class="todo-row ${done ? "done" : ""}">
      <input type="checkbox" class="todo-check" data-toggle-task="${esc(t.id)}" ${done ? "checked" : ""} aria-label="Toggle ${esc(t.title)}">
      <div class="tr-body"><div class="tr-title">${esc(t.title)}</div>
        <div class="tr-meta">${showContact ? `<span data-hash="#/crm/contacts/${esc(t.contact_id)}" style="cursor:pointer;color:var(--teal-700)">${esc(t.contact_name || "")}</span>` : ""}<span class="tr-due ${dueCls}">${esc(dueTxt)}</span></div></div></div>`;
  }
  function tabTasks(c, tasks) {
    const composer = `<div class="note-composer">
      <div class="form-grid"><div class="form-field"><label>Task</label><input id="taskTitle" placeholder="Follow up on proposal"></div>
        <div class="form-field"><label>Due date</label><input id="taskDue" type="date"></div></div>
      <div class="nc-actions"><button class="btn btn-primary btn-sm" data-add-task="${esc(c.id)}">${svg("plus", 13)} Add task</button></div></div>`;
    const list = tasks.length ? `<div class="row-list" style="margin-top:6px">${tasks.map((t) => taskRow(t, false)).join("")}</div>`
      : `<div class="empty-state" style="padding:32px 24px"><div class="es-ico">${svg("task", 22)}</div><h3>No tasks</h3><p>Add a task with a due date to keep this relationship moving.</p></div>`;
    return composer + list;
  }

  /* ═══ VIEW: Companies list ════════════════════════════════════════════════ */
  function viewCompanies() {
    if (st("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    if (st("error") || (connected() && state.error)) return previewStrip() + errorBlock(state.error);
    const companies = st("empty") ? [] : state.companies;
    const withCounts = companies.map((co) => ({ ...co, count: co.contacts != null ? co.contacts : state.contacts.filter((c) => c.company_id === co.id).length }));
    const kpis = [
      { ico: "building", val: fmtInt(companies.length), label: "Companies", feat: true },
      { ico: "users", val: fmtInt(state.contacts.length), label: "Linked contacts" },
      { ico: "globe", val: fmtInt(new Set(companies.map((c) => c.industry).filter(Boolean)).size), label: "Industries" },
      { ico: "flame", val: fmtInt(state.contacts.filter((c) => Number(c.lead_score) >= 61).length), label: "Hot leads" },
    ];
    const table = withCounts.length ? `<div class="panel reveal" style="overflow-x:auto"><table class="table">
      <thead><tr><th>Company</th><th>Industry</th><th>Size</th><th class="num">Contacts</th><th></th></tr></thead>
      <tbody>${withCounts.map((co) => `<tr data-open-company="${esc(co.id)}" style="cursor:pointer">
        <td><div class="cell-user"><span class="avatar" style="width:34px;height:34px;font-size:13px;border-radius:10px;background:var(--grad-gold);color:#1A0E00">${esc(initials(co.name))}</span>
          <div><div class="cu-name">${esc(co.name)}</div><div class="cu-sub num">${esc(co.website || "")}</div></div></div></td>
        <td>${esc(co.industry || "—")}</td><td class="num">${esc(co.size || "—")}</td><td class="num">${fmtInt(co.count)}</td>
        <td style="text-align:right">${svg("chev", 15)}</td></tr>`).join("")}</tbody></table></div>`
      : emptyBlock("building", "No companies yet", "Companies group your contacts by organization and share a timeline. Add one, or they’re created automatically when you set a contact’s company.", "New company", "newCompanyEmpty");
    return `${previewStrip()}${flash()}
      ${pageHead(`Companies &amp; <em>accounts</em>`, `Organizations your contacts belong to. Each rolls up its people, a shared activity timeline and account-level enrichment.`)}
      ${kpiStrip(kpis)}
      <div class="sec-head"><h2>All <em>companies</em></h2><div class="spacer"></div>
        <button class="btn btn-primary btn-sm" id="newCompany">${svg("plus", 14)} New company</button></div>
      ${table}`;
  }

  /* ═══ VIEW: Company detail ════════════════════════════════════════════════ */
  function viewCompanyDetail(id) {
    if (st("loading") || (state.loading && !state.loaded)) return skeleton();
    if (st("error") || (connected() && state.error)) return errorBlock(state.error);
    const co = companyById(id);
    if (!co) return `<button class="back-link" data-hash="#/crm/companies">${svg("arrowLeft", 14)} Companies</button>` + emptyBlock("building", "Company not found", "This company may have been deleted or belongs to another workspace.");
    const people = state.contacts.filter((c) => c.company_id === id);
    const acts = (connected() ? state.activityLive || [] : MOCK.activity).filter((a) => people.some((p) => p.id === a.contact_id)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 12);

    const head = `<div class="detail-head company reveal">
      <span class="dh-avatar">${esc(initials(co.name))}</span>
      <div class="dh-body"><div class="dh-name">${esc(co.name)}</div>
        <div class="dh-meta">
          ${co.website ? `<a class="dhm-item" href="https://${esc(co.website)}" target="_blank" rel="noopener"><span class="dhmi-ico">${svg("globe", 13)}</span>${esc(co.website)}</a>` : ""}
          ${co.industry ? `<span class="dhm-item"><span class="dhmi-ico">${svg("building", 13)}</span>${esc(co.industry)}</span>` : ""}
          ${co.size ? `<span class="dhm-item"><span class="dhmi-ico">${svg("users", 13)}</span>${esc(co.size)}</span>` : ""}
          <span class="dhm-item"><span class="dhmi-ico">${svg("user", 13)}</span><span class="num">${fmtInt(people.length)}</span> contacts</span>
        </div></div>
      <div class="dh-actions"><button class="btn btn-ghost btn-sm" data-edit-company="${esc(co.id)}">${svg("edit", 13)} Edit</button></div></div>`;

    const peoplePanel = people.length ? `<div class="panel reveal">
        <div class="panel-head"><span class="ph-ico">${svg("users", 15)}</span><h3>Contacts</h3></div>
        <div class="row-list">${people.map(contactRowMini).join("")}</div></div>`
      : `<div class="panel reveal"><div class="empty-state" style="padding:32px 24px"><div class="es-ico">${svg("users", 22)}</div><h3>No linked contacts</h3><p>Assign contacts to ${esc(co.name)} from a contact’s Overview tab.</p></div></div>`;
    const tlPanel = `<div class="panel reveal">
        <div class="panel-head"><span class="ph-ico">${svg("clock", 15)}</span><h3>Shared timeline</h3></div>
        ${acts.length ? `<div class="timeline">${acts.map((a) => `<div class="tl-item t-${esc(a.type)}">
          <div class="tli-rail"><div class="tli-dot">${svg(ACTIVITY_ICON[a.type] || "info", 15)}</div><div class="tli-line"></div></div>
          <div class="tli-body"><div class="tli-title">${esc(a.description)}</div>
            <div class="tli-meta"><span class="tl-type">${esc(a.type.replace("_", " "))}</span>·<span>${esc(fmtDateTime(a.created_at))}</span></div></div></div>`).join("")}</div>`
          : `<p class="sub" style="color:var(--ink-400);font-size:13px">No account activity yet.</p>`}</div>`;

    return `${flash()}<button class="back-link" data-hash="#/crm/companies">${svg("arrowLeft", 14)} Companies</button>
      ${head}<div class="company-contacts-grid" style="margin-top:22px">${peoplePanel}${tlPanel}</div>`;
  }
  function contactRowMini(c) {
    return `<div class="data-row" data-open="${esc(c.id)}" style="cursor:pointer">
      <span class="cr-avatar" style="width:34px;height:34px;font-size:13px">${esc(initials(fullName(c)))}</span>
      <div class="r-body"><div class="r-title">${esc(fullName(c))}</div><div class="r-meta"><span class="num">${esc(c.email || c.phone || "")}</span></div></div>
      <div class="r-right">${scoreBadge(c.lead_score)}</div></div>`;
  }

  /* ═══ VIEW: My tasks ══════════════════════════════════════════════════════ */
  function viewTasks() {
    if (st("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    if (st("error") || (connected() && state.error)) return previewStrip() + errorBlock(state.error);
    const tasks = st("empty") ? [] : state.tasks;
    if (!tasks.length) return `${previewStrip()}${flash()}${pageHead(`My <em>tasks</em>`, `Every task across your contacts, grouped by urgency.`)}${emptyBlock("task", "No tasks", "Tasks you add on a contact’s Tasks tab are aggregated here — overdue, today, upcoming and done.")}`;

    const open = tasks.filter((t) => t.status === "open");
    const done = tasks.filter((t) => t.status === "done");
    const overdue = open.filter((t) => (daysUntil(t.due_date) ?? 99) < 0);
    const today = open.filter((t) => daysUntil(t.due_date) === 0);
    const upcoming = open.filter((t) => (daysUntil(t.due_date) ?? -1) > 0);
    const kpis = [
      { ico: "task", val: fmtInt(open.length), label: "Open", feat: true },
      { ico: "alert", val: fmtInt(overdue.length), label: "Overdue" },
      { ico: "clock", val: fmtInt(today.length), label: "Due today" },
      { ico: "check", val: fmtInt(done.length), label: "Completed" },
    ];
    const group = (label, cls, arr) => arr.length ? `<div class="todo-group-label ${cls}">${label}<span class="tgl-count">${fmtInt(arr.length)}</span></div>
      <div class="panel"><div class="row-list">${arr.map((t) => taskRow(t, true)).join("")}</div></div>` : "";
    return `${previewStrip()}${flash()}
      ${pageHead(`My <em>tasks</em>`, `Every task across your contacts, grouped by urgency. Toggle a checkbox to mark it done.`)}
      ${kpiStrip(kpis)}
      <div class="sec-head"><h2>Task <em>queue</em></h2></div>
      ${group("Overdue", "overdue", overdue)}
      ${group("Today", "", today)}
      ${group("Upcoming", "", upcoming)}
      ${group("Done", "", done)}`;
  }

  /* ═══ VIEW: Duplicates ════════════════════════════════════════════════════ */
  function viewDuplicates() {
    if (st("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    if (st("error") || (connected() && state.error)) return previewStrip() + errorBlock(state.error);
    const dups = (st("empty") ? [] : state.duplicates).filter((d) => d.status === "open");
    if (!dups.length) return `${previewStrip()}${flash()}${pageHead(`Duplicate <em>review</em>`, `Likely-duplicate contact pairs, surfaced for a human to confirm.`)}${emptyBlock("checks", "No duplicates to review", "Nice — your contact list is clean. New likely-duplicates from imports or form fills will appear here for review.")}`;

    const kpis = [
      { ico: "copy", val: fmtInt(dups.length), label: "Pairs to review", feat: true },
      { ico: "alert", val: fmtInt(dups.filter((d) => d.score >= 0.8).length), label: "High confidence" },
      { ico: "merge", val: fmtInt(MOCK.duplicates.filter((d) => d.status === "merged").length), label: "Merged" },
      { ico: "x", val: fmtInt(MOCK.duplicates.filter((d) => d.status === "dismissed").length), label: "Dismissed" },
    ];
    const cards = dups.map(dupCard).join("");
    return `${previewStrip()}${flash()}
      ${pageHead(`Duplicate <em>review</em>`, `Likely-duplicate pairs surfaced by the server. Pick which record to keep, then merge — the timeline, tags and custom values are combined onto the primary.`)}
      ${connected() ? kpiStrip(kpis) : kpiStrip(kpis)}
      <div class="sec-head"><h2>Pending <em>pairs</em></h2></div>
      ${cards}`;
  }
  function dupField(k, va, vb) {
    return `<div class="ds-field"><span class="dsf-k">${esc(k)}</span><span class="dsf-v">${esc(va)}</span></div>`;
  }
  function dupSide(c, primary) {
    const co = companyById(c.company_id);
    return `<div class="dup-side ${primary ? "primary" : ""}">
      <div class="ds-tag">${primary ? "Keep (primary)" : "Merge in"}</div>
      <div class="ds-name">${esc(fullName(c))}</div>
      ${dupField("Email", c.email || "—")}
      ${dupField("Phone", c.phone || "—")}
      ${dupField("Company", co ? co.name : "—")}
      ${dupField("Score", c.lead_score)}
      ${dupField("Created", fmtDate(c.created_at))}</div>`;
  }
  function dupCard(d) {
    const a = contactById(d.contact_a), b = contactById(d.contact_b);
    if (!a || !b) return "";
    return `<div class="dup-card reveal" data-dup="${esc(d.id)}">
      <div class="dup-head"><span class="ph-ico" style="width:28px;height:28px;border-radius:var(--r-sm);background:rgba(197,160,89,.14);color:var(--gold-500);display:grid;place-items:center">${svg("copy", 15)}</span>
        <span class="dh-reason">${esc(d.reason)}</span><span class="dh-score">${Math.round(d.score * 100)}% match</span></div>
      <div class="dup-compare">${dupSide(a, true)}<div class="dup-vs">vs</div>${dupSide(b, false)}</div>
      <div class="dup-actions">
        <button class="btn btn-ghost btn-sm" data-dismiss-dup="${esc(d.id)}">${svg("x", 13)} Not a duplicate</button>
        <button class="btn btn-primary btn-sm" data-merge-dup="${esc(d.id)}">${svg("merge", 13)} Merge into ${esc(a.first_name)}</button></div></div>`;
  }

  /* ═══ VIEW: CSV import wizard ═════════════════════════════════════════════ */
  const IMPORT_STEPS = ["Upload CSV", "Map columns", "Preview & import"];
  const IMPORT_TARGETS = [["", "— skip —"], ["first_name", "First name"], ["last_name", "Last name"], ["email", "Email"], ["phone", "Phone"], ["source", "Source"], ["company", "Company name"], ["lead_score", "Lead score"]];
  function viewImport() {
    const step = state.importStep;
    const stepper = `<div class="wiz-steps">${IMPORT_STEPS.map((label, i) => {
      const idx = i + 1; const cls = idx < step ? "done" : idx === step ? "active" : "";
      return `<div class="wiz-step ${cls}"><div class="ws-conn"></div><div class="ws-dot">${idx < step ? svg("check", 15) : idx}</div><div class="ws-label">${esc(label)}</div></div>`;
    }).join("")}</div>`;
    let body;
    if (state.importProgress) body = importProgressPanel();
    else if (step === 1) body = importUpload();
    else if (step === 2) body = importMapping();
    else body = importPreview();
    return `${previewStrip()}${flash()}
      ${pageHead(`Import <em>contacts</em>`, `Bring an existing list into the CRM from a CSV. Rows are processed server-side by a background job — your browser only parses the header and hands off; it never writes contacts directly.`)}
      ${stepper}
      <div class="panel reveal">${body}</div>`;
  }
  function importUpload() {
    return `<div class="drop-zone" id="dropZone">
        <div class="dz-ico">${svg("upload", 24)}</div>
        <h3>Upload or paste a CSV</h3>
        <p>The first row must be a header. We parse it in your browser to build the column map.</p>
        <input type="file" id="csvFile" accept=".csv,text/csv" style="display:none">
        <button class="btn btn-ghost btn-sm" id="pickFile">${svg("upload", 13)} Choose file</button></div>
      <div class="label" style="margin-top:20px;margin-bottom:8px">…or paste CSV text</div>
      <textarea class="csv-paste" id="csvPaste" placeholder="first_name,last_name,email,phone&#10;Aisha,Rahman,aisha@example.com,+14155550142"></textarea>
      <div class="wiz-actions"><div class="spacer"></div>
        <button class="btn btn-primary" id="parseCsv">${svg("arrow", 14)} Parse &amp; continue</button></div>`;
  }
  function importMapping() {
    const targetOpts = (sel) => IMPORT_TARGETS.map(([v, l]) => `<option value="${v}" ${state.importMap[sel] === v ? "selected" : ""}>${esc(l)}</option>`).join("");
    const rows = state.importHeaders.map((h) => {
      const sample = (state.importRows[0] || [])[state.importHeaders.indexOf(h)] || "";
      return `<div class="map-row"><div class="mr-csv"><span class="mrc-name">${esc(h)}</span><span class="mrc-sample">${esc(sample || "—")}</span></div>
        <div class="mr-arrow">${svg("arrow", 16)}</div>
        <div class="mr-target"><select data-map="${esc(h)}">${targetOpts(h)}</select></div></div>`;
    }).join("");
    return `<div class="panel-head"><span class="ph-ico">${svg("filter", 15)}</span><h3>Map ${state.importHeaders.length} columns → contact fields</h3></div>
      <div class="row-list">${rows}</div>
      <div class="consent-attest"><input type="checkbox" class="cbx" id="consentBox" ${state.importConsent ? "checked" : ""}>
        <div><b>Consent attestation (M05).</b> I confirm every contact in this file gave lawful consent to be contacted, and I have a record of that opt-in. Imported contacts are added to the consent ledger as <span class="mono">source: import</span>.</div></div>
      <div class="wiz-actions">
        <button class="btn btn-ghost" id="importBack">${svg("arrowLeft", 14)} Back</button><div class="spacer"></div>
        <button class="btn btn-primary" id="toPreview">${svg("arrow", 14)} Preview</button></div>`;
  }
  function importPreview() {
    const mapped = state.importHeaders.map((h) => state.importMap[h]).filter(Boolean);
    const cols = IMPORT_TARGETS.filter(([v]) => v && mapped.includes(v));
    const preview = state.importRows.slice(0, 5).map((r) => `<tr>${cols.map(([v]) => {
      const idx = state.importHeaders.findIndex((h) => state.importMap[h] === v);
      return `<td>${esc(idx >= 0 ? r[idx] || "" : "")}</td>`;
    }).join("")}</tr>`).join("");
    return `<div class="panel-head"><span class="ph-ico">${svg("eye", 15)}</span><h3>Preview — first 5 of ${fmtInt(state.importRows.length)} rows</h3></div>
      <div style="overflow-x:auto"><table class="table"><thead><tr>${cols.map(([, l]) => `<th>${esc(l)}</th>`).join("")}</tr></thead><tbody>${preview}</tbody></table></div>
      <div class="ip-stats"><div class="ip-stat"><span class="ips-num">${fmtInt(state.importRows.length)}</span><span class="ips-label">Rows to import</span></div>
        <div class="ip-stat"><span class="ips-num">${fmtInt(cols.length)}</span><span class="ips-label">Mapped fields</span></div></div>
      ${state.importConsent ? "" : `<div class="defer-note" style="border-color:rgba(196,97,78,.4)"><span class="dn-ico" style="color:var(--status-danger)">${svg("alert", 14)}</span>Consent not attested — go back and tick the box before importing.</div>`}
      <div class="wiz-actions">
        <button class="btn btn-ghost" id="importBack">${svg("arrowLeft", 14)} Back</button><div class="spacer"></div>
        <button class="btn btn-primary" id="startImport" ${state.importConsent ? "" : "disabled"}>${svg("upload", 14)} Start import</button></div>`;
  }
  function importProgressPanel() {
    const p = state.importProgress;
    const pct = p.total ? Math.round((p.processed / p.total) * 100) : 0;
    const done = p.status === "completed" || p.status === "done" || p.status === "failed";
    return `<div class="panel-head"><span class="ph-ico">${svg("upload", 15)}</span><h3>${done ? "Import complete" : "Importing…"}</h3></div>
      <div class="import-progress"><div class="ip-track"><div class="ip-fill" style="width:${pct}%"></div></div>
        <div class="ip-stats">
          <div class="ip-stat"><span class="ips-num">${fmtInt(p.processed)}/${fmtInt(p.total)}</span><span class="ips-label">Processed</span></div>
          <div class="ip-stat inserted"><span class="ips-num">${fmtInt(p.inserted)}</span><span class="ips-label">Inserted</span></div>
          <div class="ip-stat"><span class="ips-num">${fmtInt(p.updated)}</span><span class="ips-label">Updated</span></div>
          <div class="ip-stat failed"><span class="ips-num">${fmtInt(p.failed)}</span><span class="ips-label">Failed</span></div></div></div>
      ${p.failed ? `<div class="defer-note"><span class="dn-ico">${svg("info", 14)}</span>${fmtInt(p.failed)} row(s) failed validation (bad email or missing name). A full error report is attached to the <span class="mono">contact_imports</span> row.</div>` : ""}
      <div class="wiz-actions"><div class="spacer"></div>
        ${done ? `<button class="btn btn-primary" id="importDone">${svg("check", 14)} Done</button>` : `<span class="sl-preview-count">Polling job status…</span>`}</div>`;
  }

  /* ═══ VIEW: Tag manager ═══════════════════════════════════════════════════ */
  function viewTags() {
    if (st("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    if (st("error") || (connected() && state.error)) return previewStrip() + errorBlock(state.error);
    const tags = st("empty") ? [] : state.tags;
    const usage = (id) => state.contacts.filter((c) => (c.tags || []).map(String).includes(String(id))).length;
    const table = tags.length ? `<div class="panel reveal"><div class="row-list">${tags.map((t) => `<div class="mgr-row">
        <span class="mgr-swatch" style="background:${esc(t.color)}"></span>
        <span class="mr-name">${esc(t.name)}</span>
        <span class="mr-usage">${fmtInt(usage(t.id))} contacts</span>
        <div class="mr-acts">
          <button class="btn btn-ghost btn-sm" data-edit-tag="${esc(t.id)}">${svg("edit", 13)}</button>
          <button class="btn btn-ghost btn-sm" data-del-tag="${esc(t.id)}" style="color:var(--status-danger);border-color:rgba(196,97,78,.4)">${svg("trash", 13)}</button></div></div>`).join("")}</div></div>`
      : emptyBlock("tag", "No tags yet", "Tags let you segment contacts and power smart lists. Create your first one.", "New tag", "newTagEmpty");
    return `${previewStrip()}${flash()}
      ${pageHead(`Tag <em>manager</em>`, `Tags segment your contacts and drive smart lists. Rename, recolor or delete — deleting a tag removes it from every contact.`)}
      <div class="sec-head"><h2>All <em>tags</em></h2><div class="spacer"></div>
        <button class="btn btn-primary btn-sm" id="newTag">${svg("plus", 14)} New tag</button></div>
      ${table}`;
  }

  /* ═══ VIEW: Custom fields manager ═════════════════════════════════════════ */
  function viewFields() {
    if (st("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    if (st("error") || (connected() && state.error)) return previewStrip() + errorBlock(state.error);
    const fields = st("empty") ? [] : state.customFields;
    const table = fields.length ? `<div class="panel reveal"><div class="row-list">${fields.map((f) => `<div class="mgr-row">
        <span class="ph-ico" style="width:30px;height:30px;border-radius:var(--r-sm);background:rgba(0,105,110,.1);color:var(--teal-700);display:grid;place-items:center">${svg("sparkle", 15)}</span>
        <span class="mr-name">${esc(f.field_name)}</span>
        <span class="mr-type">${esc(f.field_type)}</span>
        ${Array.isArray(f.options) && f.options.length ? `<span class="mr-usage">${esc(f.options.join(", "))}</span>` : `<span class="mr-usage"></span>`}
        <div class="mr-acts">
          <button class="btn btn-ghost btn-sm" data-edit-field-def="${esc(f.id)}">${svg("edit", 13)}</button>
          <button class="btn btn-ghost btn-sm" data-del-field="${esc(f.id)}" style="color:var(--status-danger);border-color:rgba(196,97,78,.4)">${svg("trash", 13)}</button></div></div>`).join("")}</div></div>`
      : emptyBlock("sparkle", "No custom fields", "Custom fields capture data unique to your business — a preferred channel, a lifetime value, a plan tier. They appear inline on every contact’s Overview.", "New field", "newFieldEmpty");
    return `${previewStrip()}${flash()}
      ${pageHead(`Custom <em>fields</em>`, `Extend the contact record with fields specific to your business. Types: text, textarea, number, date, dropdown, checkbox, multiselect, URL and file.`)}
      <div class="sec-head"><h2>Field <em>definitions</em></h2><div class="spacer"></div>
        <button class="btn btn-primary btn-sm" id="newField">${svg("plus", 14)} New field</button></div>
      ${table}`;
  }

  /* ── Shared bits for the dashboard / deals / activity / reports views ────── */
  function allActivity() {
    const src = connected() ? (state.activityLive || []) : MOCK.activity;
    return src.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  function activityItem(a) {
    const c = contactById(a.contact_id);
    const who = c ? `·<span class="tl-link" data-hash="#/crm/contacts/${esc(c.id)}">${esc(fullName(c))}</span>` : "";
    return `<div class="tl-item t-${esc(a.type)}">
      <div class="tli-rail"><div class="tli-dot">${svg(ACTIVITY_ICON[a.type] || "info", 15)}</div><div class="tli-line"></div></div>
      <div class="tli-body"><div class="tli-title">${esc(a.description)}</div>
        <div class="tli-meta"><span class="tl-type">${esc(a.type.replace("_", " "))}</span>${who}<span>${esc(a.actor || "System")}</span>·<span>${esc(fmtDateTime(a.created_at))}</span></div></div></div>`;
  }
  function dealMiniRow(d) {
    const c = contactById(d.contact_id), sm = stageMeta(d.stage);
    return `<div class="data-row" data-hash="#/crm/deals" style="cursor:pointer">
      <span class="cr-avatar" style="width:34px;height:34px;font-size:12px">${esc(initials(d.name))}</span>
      <div class="r-body"><div class="r-title">${esc(d.name)}</div><div class="r-meta"><span>${c ? esc(fullName(c)) : "—"}</span></div></div>
      <div class="r-right"><span class="deal-stage ${sm.cls}">${sm.label}</span><span class="deal-val num">${fmtMoney(d.value)}</span></div></div>`;
  }

  /* ═══ VIEW: Dashboard ═════════════════════════════════════════════════════ */
  function viewDashboard() {
    if (st("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    if (st("error") || (connected() && state.error)) return previewStrip() + errorBlock(state.error);
    const empty = st("empty");
    const contacts = empty ? [] : state.contacts;
    const companies = empty ? [] : state.companies;
    const deals = empty ? [] : state.deals;
    const tasks = empty ? [] : state.tasks;
    const openDeals = deals.filter((d) => OPEN_STAGES.includes(d.stage));
    const pipeline = openDeals.reduce((s, d) => s + Number(d.value || 0), 0);
    const openTasks = tasks.filter((t) => t.status === "open");
    const tasksDue = openTasks.filter((t) => (daysUntil(t.due_date) ?? 99) <= 0).length;
    const kpis = [
      { ico: "users", val: fmtInt(contacts.length), label: "Contacts", feat: true },
      { ico: "building", val: fmtInt(companies.length), label: "Companies" },
      { ico: "dollar", val: fmtMoney(pipeline), label: "Open pipeline" },
      { ico: "clock", val: fmtInt(tasksDue), label: "Tasks due" },
    ];
    const bands = [
      { label: "Hot", cls: "hot", n: contacts.filter((c) => Number(c.lead_score) >= 61).length },
      { label: "Warm", cls: "warm", n: contacts.filter((c) => { const s = Number(c.lead_score); return s >= 31 && s < 61; }).length },
      { label: "Cold", cls: "cold", n: contacts.filter((c) => Number(c.lead_score) < 31).length },
    ];
    const bandMax = Math.max(1, ...bands.map((b) => b.n));
    const bandBars = bands.map((b) => `<div class="bar-row"><span class="bar-label">${b.label}</span>
      <div class="bar-track"><div class="bar-fill ${b.cls}" style="width:${Math.round((b.n / bandMax) * 100)}%"></div></div>
      <span class="bar-val num">${fmtInt(b.n)}</span></div>`).join("");
    const recent = empty ? [] : allActivity().slice(0, 6);
    const recentList = recent.length ? `<div class="timeline">${recent.map(activityItem).join("")}</div>`
      : `<p class="dash-none">No recent activity.</p>`;
    const upcoming = openTasks.slice().sort((a, b) => new Date(a.due_date) - new Date(b.due_date)).slice(0, 5);
    const taskList = upcoming.length ? `<div class="row-list">${upcoming.map((t) => taskRow(t, true)).join("")}</div>`
      : `<p class="dash-none">Nothing due — you're all caught up.</p>`;
    const top = openDeals.slice().sort((a, b) => b.value - a.value).slice(0, 5);
    const topList = top.length ? `<div class="row-list">${top.map(dealMiniRow).join("")}</div>`
      : `<p class="dash-none">No open deals.</p>`;
    return `${previewStrip()}${flash()}
      ${pageHead(`CRM <em>dashboard</em>`, `A live pulse of your workspace — pipeline, lead quality, what's due and what just happened across every contact.`)}
      ${kpiStrip(kpis)}
      <div class="dash-grid">
        <div class="panel reveal"><div class="panel-head"><span class="ph-ico">${svg("flame", 15)}</span><h3>Lead-score bands</h3></div><div class="bar-chart">${bandBars}</div></div>
        <div class="panel reveal"><div class="panel-head"><span class="ph-ico">${svg("dollar", 15)}</span><h3>Top open deals</h3><a class="cc-viewall" data-hash="#/crm/deals">View all ${svg("arrow", 13)}</a></div>${topList}</div>
        <div class="panel reveal"><div class="panel-head"><span class="ph-ico">${svg("clock", 15)}</span><h3>Upcoming tasks</h3><a class="cc-viewall" data-hash="#/crm/tasks">My tasks ${svg("arrow", 13)}</a></div>${taskList}</div>
        <div class="panel reveal"><div class="panel-head"><span class="ph-ico">${svg("info", 15)}</span><h3>Recent activity</h3><a class="cc-viewall" data-hash="#/crm/activities">All activity ${svg("arrow", 13)}</a></div>${recentList}</div>
      </div>`;
  }

  /* ═══ VIEW: Deals ═════════════════════════════════════════════════════════ */
  function viewDeals() {
    if (st("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    if (st("error") || (connected() && state.error)) return previewStrip() + errorBlock(state.error);
    const deals = st("empty") ? [] : state.deals;
    if (!deals.length) return `${previewStrip()}${flash()}${pageHead(`<em>Deals</em> &amp; opportunities`, `Revenue opportunities across your contacts and companies.`)}${emptyBlock("dollar", "No deals yet", "Deals track revenue opportunities against your contacts and companies — stage, value and expected close. They roll up into your pipeline forecast.")}`;
    const open = deals.filter((d) => OPEN_STAGES.includes(d.stage));
    const won = deals.filter((d) => d.stage === "won");
    const pipeline = open.reduce((s, d) => s + Number(d.value || 0), 0);
    const wonVal = won.reduce((s, d) => s + Number(d.value || 0), 0);
    const kpis = [
      { ico: "dollar", val: fmtMoney(pipeline), label: "Open pipeline", feat: true },
      { ico: "sparkle", val: fmtInt(open.length), label: "Open deals" },
      { ico: "check", val: fmtMoney(wonVal), label: "Won" },
      { ico: "star", val: fmtMoney(open.length ? Math.round(pipeline / open.length) : 0), label: "Avg deal size" },
    ];
    const idx = (k) => DEAL_STAGES.findIndex((s) => s.key === k);
    const ordered = deals.slice().sort((a, b) => (idx(a.stage) - idx(b.stage)) || (b.value - a.value));
    const rows = ordered.map((d) => {
      const c = contactById(d.contact_id), co = companyById(d.company_id), sm = stageMeta(d.stage);
      const dl = daysUntil(d.close_date);
      const closed = d.stage === "won" || d.stage === "lost";
      const closeCls = closed ? "" : dl < 0 ? "overdue" : dl <= 7 ? "today" : "";
      const closeTxt = d.stage === "won" ? "won" : d.stage === "lost" ? "lost" : fmtDate(d.close_date);
      return `<tr>
        <td><div class="cell-user"><span class="avatar" style="width:34px;height:34px;font-size:12px;border-radius:10px;background:var(--grad-gold);color:#1A0E00">${esc(initials(d.name))}</span>
          <div><div class="cu-name">${esc(d.name)}</div><div class="cu-sub">${co ? esc(co.name) : "—"}</div></div></div></td>
        <td>${c ? `<span class="tl-link" data-hash="#/crm/contacts/${esc(c.id)}">${esc(fullName(c))}</span>` : "—"}</td>
        <td><span class="deal-stage ${sm.cls}">${sm.label}</span></td>
        <td class="num">${fmtMoney(d.value)}</td>
        <td class="num ${closeCls ? "deal-close " + closeCls : ""}">${esc(closeTxt)}</td>
        <td>${esc(memberName(d.owner))}</td></tr>`;
    }).join("");
    return `${previewStrip()}${flash()}
      ${pageHead(`<em>Deals</em> &amp; opportunities`, `Revenue opportunities across your contacts and companies — each with a stage, value and expected close. Deals here roll up into your pipeline forecast.`)}
      ${kpiStrip(kpis)}
      <div class="sec-head"><h2>All <em>deals</em></h2></div>
      <div class="panel reveal" style="overflow-x:auto"><table class="table">
        <thead><tr><th>Deal</th><th>Contact</th><th>Stage</th><th class="num">Value</th><th class="num">Close</th><th>Owner</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
  }

  /* ═══ VIEW: Activity feed ═════════════════════════════════════════════════ */
  function viewActivities() {
    if (st("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    if (st("error") || (connected() && state.error)) return previewStrip() + errorBlock(state.error);
    const all = st("empty") ? [] : allActivity();
    if (!all.length) return `${previewStrip()}${flash()}${pageHead(`<em>Activity</em> feed`, `Everything happening across your CRM, newest first.`)}${emptyBlock("clock", "No activity yet", "Emails, calls, form fills, payments, reviews and deal changes across every contact appear here as one immutable, workspace-wide feed.")}`;
    const types = Array.from(new Set(all.map((a) => a.type)));
    const filters = `<div class="tl-filter">
      <button class="tag-chip-filter ${state.actFilter === "all" ? "on" : ""}" data-actfilter="all">All</button>
      ${types.map((t) => `<button class="tag-chip-filter ${state.actFilter === t ? "on" : ""}" data-actfilter="${esc(t)}">${esc(t.replace("_", " "))}</button>`).join("")}</div>`;
    const shown = state.actFilter === "all" ? all : all.filter((a) => a.type === state.actFilter);
    const kpis = [
      { ico: "info", val: fmtInt(all.length), label: "Total events", feat: true },
      { ico: "mail", val: fmtInt(all.filter((a) => a.type === "email").length), label: "Emails" },
      { ico: "phone", val: fmtInt(all.filter((a) => a.type === "call").length), label: "Calls" },
      { ico: "dollar", val: fmtInt(all.filter((a) => a.type === "payment").length), label: "Payments" },
    ];
    const body = shown.length ? `<div class="timeline">${shown.map(activityItem).join("")}</div>`
      : `<div class="empty-state" style="padding:32px 24px"><div class="es-ico">${svg("filter", 22)}</div><h3>No ${esc(state.actFilter.replace("_", " "))} activity</h3><p>Try a different filter.</p></div>`;
    return `${previewStrip()}${flash()}
      ${pageHead(`<em>Activity</em> feed`, `Every event across the workspace — emails, calls, form fills, payments, reviews and deal changes — in one immutable, filterable timeline.`)}
      ${kpiStrip(kpis)}
      <div class="sec-head"><h2>Recent <em>events</em></h2></div>
      <div class="panel reveal">${filters}${body}</div>`;
  }

  /* ═══ VIEW: Reports ═══════════════════════════════════════════════════════ */
  function viewReports() {
    if (st("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    if (st("error") || (connected() && state.error)) return previewStrip() + errorBlock(state.error);
    const empty = st("empty");
    const contacts = empty ? [] : state.contacts;
    const deals = empty ? [] : state.deals;
    const acts = empty ? [] : allActivity();
    if (!contacts.length && !deals.length) return `${previewStrip()}${flash()}${pageHead(`<em>Reports</em> &amp; analytics`, `Segment your CRM by source, quality, pipeline and engagement.`)}${emptyBlock("info", "Nothing to report yet", "Once you have contacts, deals and activity, this page charts your lead sources, score distribution, pipeline by stage and engagement mix.")}`;
    const chart = (rows, fmt) => {
      const max = Math.max(1, ...rows.map((r) => r.n));
      return rows.length ? `<div class="bar-chart">${rows.map((r) => `<div class="bar-row"><span class="bar-label">${esc(r.label)}</span>
        <div class="bar-track"><div class="bar-fill ${r.cls || ""}" style="width:${Math.round((r.n / max) * 100)}%"></div></div>
        <span class="bar-val num">${(fmt || fmtInt)(r.n)}</span></div>`).join("")}</div>` : `<p class="dash-none">No data yet.</p>`;
    };
    const sources = {};
    contacts.forEach((c) => { const s = c.source || "unknown"; sources[s] = (sources[s] || 0) + 1; });
    const srcRows = Object.keys(sources).sort((a, b) => sources[b] - sources[a]).map((s) => ({ label: s, n: sources[s] }));
    const bandRows = [
      { label: "Hot (≥61)", cls: "hot", n: contacts.filter((c) => Number(c.lead_score) >= 61).length },
      { label: "Warm (31–60)", cls: "warm", n: contacts.filter((c) => { const s = Number(c.lead_score); return s >= 31 && s < 61; }).length },
      { label: "Cold (<31)", cls: "cold", n: contacts.filter((c) => Number(c.lead_score) < 31).length },
    ];
    const stageRows = DEAL_STAGES.map((s) => ({ label: s.label, cls: s.cls, n: deals.filter((d) => d.stage === s.key).reduce((sum, d) => sum + Number(d.value || 0), 0) })).filter((r) => r.n > 0);
    const typeCount = {};
    acts.forEach((a) => { typeCount[a.type] = (typeCount[a.type] || 0) + 1; });
    const typeRows = Object.keys(typeCount).sort((a, b) => typeCount[b] - typeCount[a]).map((t) => ({ label: t.replace("_", " "), n: typeCount[t] }));
    return `${previewStrip()}${flash()}
      ${pageHead(`<em>Reports</em> &amp; analytics`, `Where your contacts come from, how they score, what's in the pipeline and how engaged they are — at a glance.`)}
      <div class="reports-grid">
        <div class="panel reveal"><div class="panel-head"><span class="ph-ico">${svg("filter", 15)}</span><h3>Contacts by source</h3></div>${chart(srcRows)}</div>
        <div class="panel reveal"><div class="panel-head"><span class="ph-ico">${svg("flame", 15)}</span><h3>Lead-score distribution</h3></div>${chart(bandRows)}</div>
        <div class="panel reveal"><div class="panel-head"><span class="ph-ico">${svg("dollar", 15)}</span><h3>Pipeline by stage</h3></div>${chart(stageRows, fmtMoney)}</div>
        <div class="panel reveal"><div class="panel-head"><span class="ph-ico">${svg("info", 15)}</span><h3>Activity by type</h3></div>${chart(typeRows)}</div>
      </div>`;
  }

  /* ═══ VIEW: CRM settings overview ═════════════════════════════════════════ */
  function viewSettings() {
    if (st("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    if (st("error") || (connected() && state.error)) return previewStrip() + errorBlock(state.error);
    const toggle = (id, on, label, desc) => `<label class="set-toggle">
      <input type="checkbox" class="cbx" id="${id}" ${on ? "checked" : ""}>
      <span class="st-body"><span class="st-label">${esc(label)}</span><span class="st-desc">${esc(desc)}</span></span></label>`;
    const memberOpts = Object.keys(MOCK.members).map((k) => `<option value="${esc(k)}">${esc(MOCK.members[k])}</option>`).join("");
    return `${previewStrip()}${flash()}
      ${pageHead(`CRM <em>settings</em>`, `Workspace-level defaults for scoring, de-duplication, assignment and data handling. Tags and custom fields have their own screens.`)}
      <div class="settings-grid">
        <div class="panel reveal"><div class="panel-head"><span class="ph-ico">${svg("flame", 15)}</span><h3>Lead scoring</h3></div>
          <p class="set-note">Bands classify every contact automatically from their score.</p>
          <div class="set-bands">
            <div class="set-band"><span class="score-badge hot">Hot</span><span class="num">61 – 100</span></div>
            <div class="set-band"><span class="score-badge warm">Warm</span><span class="num">31 – 60</span></div>
            <div class="set-band"><span class="score-badge cold">Cold</span><span class="num">0 – 30</span></div>
          </div></div>
        <div class="panel reveal"><div class="panel-head"><span class="ph-ico">${svg("copy", 15)}</span><h3>Duplicate detection</h3></div>
          <div class="set-field"><label>Match sensitivity</label>
            <select id="dupSensitivity"><option>Strict — email + phone</option><option selected>Balanced — email or name + company</option><option>Loose — fuzzy name</option></select></div>
          ${toggle("dupAuto", true, "Auto-flag on import", "Surface likely duplicates for review after every CSV import.")}
        </div>
        <div class="panel reveal"><div class="panel-head"><span class="ph-ico">${svg("user", 15)}</span><h3>Assignment &amp; fields</h3></div>
          <div class="set-field"><label>Default assignee for new contacts</label>
            <select id="defaultAssignee">${memberOpts}</select></div>
          ${toggle("reqEmail", true, "Require email or phone", "Block contacts that have neither an email nor a phone number.")}
        </div>
        <div class="panel reveal"><div class="panel-head"><span class="ph-ico">${svg("tag", 15)}</span><h3>Segmentation</h3></div>
          <p class="set-note">Manage the tags and custom fields that power smart lists.</p>
          <div class="set-links">
            <button class="btn btn-ghost btn-sm" data-hash="#/settings/tags">${svg("tag", 13)} Manage tags</button>
            <button class="btn btn-ghost btn-sm" data-hash="#/settings/fields">${svg("sparkle", 13)} Custom fields</button>
          </div></div>
        <div class="panel reveal"><div class="panel-head"><span class="ph-ico">${svg("download", 15)}</span><h3>Data &amp; export</h3></div>
          ${toggle("consentDefault", true, "Require consent on import", "Force the consent attestation before any CSV import (M05).")}
          ${toggle("exportGate", true, "Gate export to manager+", "Only owners, admins and managers can export contacts (crm.export).")}
        </div>
      </div>
      <div class="sec-head" style="margin-top:26px"><div class="spacer"></div><button class="btn btn-primary btn-sm" id="saveSettings">${svg("check", 14)} Save changes</button></div>`;
  }

  /* ── Router + render ────────────────────────────────────────────────────── */
  function currentRoute() {
    const h = (location.hash || "").replace(/^#/, "").split("?")[0];
    const seg = h.split("/").filter(Boolean); // e.g. ["crm","contacts","c1"]
    if (seg[0] === "settings") {
      if (seg[1] === "fields") return { key: "fields", view: viewFields };
      if (seg[1] === "tags") return { key: "tags", view: viewTags };
      return { key: "settings", view: viewSettings };
    }
    // default group: crm — landing on the dashboard
    const sub = seg[1] || "dashboard";
    const idPart = seg[2];
    if (sub === "contacts") return idPart ? { key: "contacts", view: () => viewContactDetail(idPart) } : { key: "contacts", view: viewContacts };
    if (sub === "companies") return idPart ? { key: "companies", view: () => viewCompanyDetail(idPart) } : { key: "companies", view: viewCompanies };
    if (sub === "deals") return { key: "deals", view: viewDeals };
    if (sub === "activities") return { key: "activities", view: viewActivities };
    if (sub === "tasks") return { key: "tasks", view: viewTasks };
    if (sub === "reports") return { key: "reports", view: viewReports };
    if (sub === "duplicates") return { key: "duplicates", view: viewDuplicates };
    if (sub === "import") return { key: "import", view: viewImport };
    // dashboard (default landing)
    return { key: "dashboard", view: viewDashboard };
  }
  function render() {
    const app = $("#app");
    const r = currentRoute();
    app.innerHTML = shell(r.key, r.view());
    afterShell();
    const inner = $(".content-inner");
    wireCommon(inner);
    wireView(r.key, inner);
    if (!reduce) nextTick(() => document.body.classList.add("js-ready"));
    else document.body.classList.add("js-ready");
  }
  function afterShell() {
    renderConn();
    setTheme(root.getAttribute("data-theme"));
    $("#themeToggle").addEventListener("click", () => setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"));
    $("#openConnect2").addEventListener("click", openDrawer);
    const burger = $("#railBurger"); if (burger) burger.addEventListener("click", () => $("#rail").classList.toggle("open"));
    $$("[data-hash]").forEach((n) => n.addEventListener("click", () => { location.hash = n.dataset.hash; $("#rail")?.classList.remove("open"); }));
  }
  function wireCommon(mount) {
    $$("[data-preview]", mount).forEach((b) => b.addEventListener("click", () => { state.previewState = b.dataset.preview; render(); }));
    const retry = $("#retryBtn", mount); if (retry) retry.addEventListener("click", () => { state.previewState = "default"; boot(); });
    // hash navigation on any element that carries data-hash inside the content
    $$("[data-hash]", mount).forEach((n) => n.addEventListener("click", () => (location.hash = n.dataset.hash)));
    $$("[data-open]", mount).forEach((n) => n.addEventListener("click", () => (location.hash = "#/crm/contacts/" + n.dataset.open)));
    $$("[data-open-company]", mount).forEach((n) => n.addEventListener("click", () => (location.hash = "#/crm/companies/" + n.dataset.openCompany)));
  }
  function wireView(key, mount) {
    ({ contacts: wireContacts, companies: wireCompanies, tasks: wireTasks, duplicates: wireDuplicates, import: wireImport, tags: wireTags, fields: wireFields, activities: wireActivities, settings: wireSettings }[key] || (() => {}))(mount);
    // detail views share contacts/companies key — wire their controls too
    // (also covers [data-toggle-task] on the dashboard's upcoming-tasks list)
    wireDetail(mount);
  }
  function wireActivities(mount) {
    $$("[data-actfilter]", mount).forEach((b) => b.addEventListener("click", () => { state.actFilter = b.dataset.actfilter; render(); }));
  }
  function wireSettings(mount) {
    const save = $("#saveSettings", mount); if (save) save.addEventListener("click", () => toast("CRM settings saved", "success"));
  }

  /* ── Contacts wiring ────────────────────────────────────────────────────── */
  function wireContacts(mount) {
    const search = $("#contactSearch", mount);
    if (search) search.addEventListener("input", (e) => { state.search = e.target.value; const inner = renderInPlaceContacts(); if (inner) { const s = $("#contactSearch"); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } } });
    $$("[data-list]", mount).forEach((b) => b.addEventListener("click", () => { state.activeList = b.dataset.list || null; state.selected = {}; render(); }));
    $$("[data-tagfilter]", mount).forEach((b) => b.addEventListener("click", () => { const id = b.dataset.tagfilter; const i = state.activeTags.indexOf(id); if (i >= 0) state.activeTags.splice(i, 1); else state.activeTags.push(id); render(); }));
    $$("[data-select]", mount).forEach((b) => b.addEventListener("change", () => { state.selected[b.dataset.select] = b.checked; render(); }));
    const nsl = $("#newSmartList", mount); if (nsl) nsl.addEventListener("click", openSmartListBuilder);
    ["newContact", "newContactEmpty"].forEach((id) => { const b = $("#" + id, mount); if (b) b.addEventListener("click", openNewContact); });
    // bulk bar
    const clear = $("#bulkClear", mount); if (clear) clear.addEventListener("click", () => { state.selected = {}; render(); });
    const bt = $("#bulkTag", mount); if (bt) bt.addEventListener("click", bulkTag);
    const ba = $("#bulkAssign", mount); if (ba) ba.addEventListener("click", bulkAssign);
    const be = $("#bulkExport", mount); if (be) be.addEventListener("click", bulkExport);
    const bd = $("#bulkDelete", mount); if (bd) bd.addEventListener("click", bulkDelete);
  }
  // Light re-render of just the row list on search keystroke (keeps input focus).
  function renderInPlaceContacts() {
    const wb = $(".crm-workbench"); if (!wb) { render(); return false; }
    render(); return true;
  }
  const selectedIds = () => Object.keys(state.selected).filter((k) => state.selected[k]);

  function openNewContact() {
    if (!canWrite()) { toast("You need staff access to create contacts", "danger"); return; }
    const coOpts = state.companies.map((co) => `<option value="${esc(co.id)}">${esc(co.name)}</option>`).join("");
    modal(`<div class="mc-head"><span class="mc-ico">${svg("user", 18)}</span>
        <div><h3>New contact</h3><div class="mc-sub">Add a person to the CRM.</div></div>
        <button class="icon-btn mc-close" data-close>${svg("x", 15)}</button></div>
      <div class="form-grid">
        <div class="form-field"><label>First name</label><input id="nc_fn"></div>
        <div class="form-field"><label>Last name</label><input id="nc_ln"></div>
        <div class="form-field"><label>Email</label><input id="nc_email" placeholder="name@example.com"></div>
        <div class="form-field"><label>Phone</label><input id="nc_phone" placeholder="+1…"></div>
        <div class="form-field"><label>Company</label><select id="nc_co"><option value="">— none —</option>${coOpts}</select></div>
        <div class="form-field"><label>Source</label><input id="nc_source" placeholder="referral / form / ads"></div>
      </div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="nc_go">${svg("check", 14)} Create contact</button></div>`);
    $("#nc_go").addEventListener("click", async () => {
      const fn = $("#nc_fn").value.trim(), ln = $("#nc_ln").value.trim(), email = $("#nc_email").value.trim();
      if (!fn && !email) { toast("Give at least a name or an email", "danger"); return; }
      const payload = { first_name: fn, last_name: ln, email, phone: $("#nc_phone").value.trim(), company_id: $("#nc_co").value || null, source: $("#nc_source").value.trim() || "manual" };
      closeModal();
      if (!connected()) {
        const id = "c" + (state.contacts.length + 1) + "_" + Date.now().toString(36);
        state.contacts.unshift({ id, ...payload, lead_score: 0, assigned_to: "you", tags: [], custom: {}, created_at: new Date().toISOString() });
        state.flashOk = "Contact created."; toast("Contact created", "success"); render(); return;
      }
      try {
        const c = ensureClient();
        const { error } = await c.from("contacts").insert({ workspace_id: state.workspaceId, ...payload });
        if (error) { toast(error.message, "danger"); return; }
        state.flashOk = "Contact created."; await boot();
      } catch (e) { toast(e.message || "Failed", "danger"); }
    });
  }

  function bulkTag() {
    const ids = selectedIds(); if (!ids.length) return;
    const opts = state.tags.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("");
    modal(`<div class="mc-head"><span class="mc-ico">${svg("tag", 18)}</span><div><h3>Tag ${ids.length} contacts</h3><div class="mc-sub">Apply a tag to every selected contact.</div></div><button class="icon-btn mc-close" data-close>${svg("x", 15)}</button></div>
      <div class="form-field"><label>Tag</label><select id="bt_tag">${opts}</select></div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="bt_go">${svg("check", 14)} Apply tag</button></div>`);
    $("#bt_go").addEventListener("click", async () => {
      const tag = $("#bt_tag").value; closeModal();
      if (!connected()) { ids.forEach((id) => { const c = contactById(id); if (c && !(c.tags || []).includes(tag)) (c.tags = c.tags || []).push(tag); }); state.selected = {}; toast("Tag applied", "success"); render(); return; }
      try { const c = ensureClient(); const rows = ids.map((cid) => ({ workspace_id: state.workspaceId, contact_id: cid, tag_id: tag })); const { error } = await c.from("contact_tags").upsert(rows, { onConflict: "contact_id,tag_id" }); if (error) { toast(error.message, "danger"); return; } state.selected = {}; state.flashOk = "Tag applied."; await boot(); }
      catch (e) { toast(e.message || "Failed", "danger"); }
    });
  }
  function bulkAssign() {
    const ids = selectedIds(); if (!ids.length) return;
    const opts = connected() ? `<option value="${esc(state.user?.id)}">Me</option>` : Object.entries(MOCK.members).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
    modal(`<div class="mc-head"><span class="mc-ico">${svg("user", 18)}</span><div><h3>Assign ${ids.length} contacts</h3><div class="mc-sub">Set the owner for every selected contact.</div></div><button class="icon-btn mc-close" data-close>${svg("x", 15)}</button></div>
      <div class="form-field"><label>Assign to</label><select id="ba_who">${opts}</select></div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="ba_go">${svg("check", 14)} Assign</button></div>`);
    $("#ba_go").addEventListener("click", async () => {
      const who = $("#ba_who").value; closeModal();
      if (!connected()) { ids.forEach((id) => { const c = contactById(id); if (c) c.assigned_to = who; }); state.selected = {}; toast("Contacts assigned", "success"); render(); return; }
      try { const c = ensureClient(); const { error } = await c.from("contacts").update({ assigned_to: who }).in("id", ids).eq("workspace_id", state.workspaceId); if (error) { toast(error.message, "danger"); return; } state.selected = {}; state.flashOk = "Contacts assigned."; await boot(); }
      catch (e) { toast(e.message || "Failed", "danger"); }
    });
  }
  async function bulkExport() {
    const ids = selectedIds();
    if (!connected()) {
      const rows = ids.map((id) => contactById(id)).filter(Boolean);
      const csv = ["first_name,last_name,email,phone,lead_score"].concat(rows.map((c) => [c.first_name, c.last_name, c.email, c.phone, c.lead_score].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))).join("\n");
      downloadCsv(csv, "contacts-export.csv"); toast(`Exported ${rows.length} contacts (mockup)`, "success"); return;
    }
    try {
      const c = ensureClient();
      const { data, error } = await c.functions.invoke("crm-export", { body: { workspace_id: state.workspaceId, ids } });
      if (error) { const msg = await readFnError(error); toast(/403|permission/i.test(msg) ? "You don't have export permission" : msg, "danger"); return; }
      const payload = data?.data ?? data;
      if (payload?.csv != null) { downloadCsv(payload.csv, "contacts-export.csv"); toast(`Export ready (${fmtInt(payload.count ?? 0)})`, "success"); }
    } catch (e) { toast(e.message || "Export failed", "danger"); }
  }
  function bulkDelete() {
    const ids = selectedIds(); if (!ids.length) return;
    if (!canDelete()) { toast("Deleting contacts requires manager access", "danger"); return; }
    modal(`<div class="mc-head"><span class="mc-ico" style="background:var(--grad-gold);color:#1A0E00">${svg("trash", 18)}</span><div><h3>Delete ${ids.length} contacts?</h3><div class="mc-sub">This soft-deletes them (sets <span class="mono">deleted_at</span>). They leave lists and search.</div></div><button class="icon-btn mc-close" data-close>${svg("x", 15)}</button></div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="bd_go" style="background:var(--status-danger)">${svg("trash", 14)} Delete</button></div>`);
    $("#bd_go").addEventListener("click", async () => {
      closeModal();
      if (!connected()) { state.contacts = state.contacts.filter((c) => !ids.includes(c.id)); state.selected = {}; toast("Contacts deleted", "success"); render(); return; }
      try { const c = ensureClient(); const { error } = await c.from("contacts").update({ deleted_at: new Date().toISOString() }).in("id", ids).eq("workspace_id", state.workspaceId); if (error) { toast(error.message, "danger"); return; } state.selected = {}; state.flashOk = "Contacts deleted."; await boot(); }
      catch (e) { toast(e.message || "Failed", "danger"); }
    });
  }

  /* ── Smart-list builder ─────────────────────────────────────────────────── */
  function opsFor(fieldKey) {
    const f = SL_FIELDS.find((x) => x.key === fieldKey) || SL_FIELDS[0];
    return OPS[f.kind] || OPS.text;
  }
  function renderRule(rule, path) {
    const fieldOpts = SL_FIELDS.map((f) => `<option value="${f.key}" ${rule.field === f.key ? "selected" : ""}>${f.label}</option>`).join("");
    const ops = opsFor(rule.field);
    const opOpts = ops.map(([v, l]) => `<option value="${v}" ${rule.op === v ? "selected" : ""}>${esc(l)}</option>`).join("");
    const f = SL_FIELDS.find((x) => x.key === rule.field);
    let valueInput;
    if (f && f.kind === "tag") valueInput = `<select data-rulepath="${path}" data-rulekey="value">${state.tags.map((t) => `<option value="${t.id}" ${String(rule.value) === String(t.id) ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>`;
    else if (rule.op === "is_set" || rule.op === "not_set") valueInput = `<input data-rulepath="${path}" data-rulekey="value" disabled placeholder="—">`;
    else if (f && f.kind === "number") valueInput = `<input data-rulepath="${path}" data-rulekey="value" type="number" value="${esc(rule.value ?? "")}">`;
    else if (f && f.kind === "date") valueInput = `<input data-rulepath="${path}" data-rulekey="value" type="date" value="${esc(rule.value ?? "")}">`;
    else valueInput = `<input data-rulepath="${path}" data-rulekey="value" value="${esc(rule.value ?? "")}" placeholder="value">`;
    return `<div class="sl-rule">
      <select data-rulepath="${path}" data-rulekey="field">${fieldOpts}</select>
      <select data-rulepath="${path}" data-rulekey="op">${opOpts}</select>
      ${valueInput}
      <button class="sl-del" data-delrule="${path}">${svg("x", 13)}</button></div>`;
  }
  function renderGroup(group, path, nested) {
    const rules = group.rules || [];
    const inner = rules.map((r, i) => {
      const cp = path + "." + i;
      return Array.isArray(r.rules) ? renderGroup(r, cp, true) : renderRule(r, cp);
    }).join("");
    return `<div class="sl-group ${nested ? "nested" : ""}">
      <div class="sl-match-toggle">
        <button data-matchpath="${path}" data-match="and" class="${(group.match || "and") === "and" ? "on" : ""}">Match ALL</button>
        <button data-matchpath="${path}" data-match="or" class="${group.match === "or" ? "on" : ""}">Match ANY</button></div>
      ${inner}
      <div class="sl-add-row">
        <button data-addrule="${path}">${svg("plus", 12)} Add rule</button>
        <button data-addgroup="${path}">${svg("plus", 12)} Add group</button></div></div>`;
  }
  function groupAt(path) {
    // path like "root" or "root.2.0"
    const parts = path.split(".").slice(1).map(Number);
    let node = state.builderDef;
    for (const idx of parts) node = node.rules[idx];
    return node;
  }
  function openSmartListBuilder(existing) {
    // Guard: when used directly as a click handler the arg is an Event, not a saved list.
    if (existing instanceof Event || !existing || !existing.definition) existing = null;
    state.builderDef = existing ? JSON.parse(JSON.stringify(existing.definition)) : { match: "and", rules: [{ field: "lead_score", op: "gte", value: 61 }] };
    const paint = () => {
      const count = window.SmartLists ? window.SmartLists.evalSmartList(state.contacts, state.builderDef).length : 0;
      const html = `<div class="mc-head"><span class="mc-ico">${svg("filter", 18)}</span>
          <div><h3>${existing ? "Edit" : "New"} smart list</h3><div class="mc-sub">Build an AND/OR filter — it re-runs whenever contacts change.</div></div>
          <button class="icon-btn mc-close" data-close>${svg("x", 15)}</button></div>
        <div class="form-field" style="margin-bottom:14px"><label>List name</label><input id="sl_name" value="${esc(existing?.name || "")}" placeholder="Hot enterprise leads"></div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px"><span class="sl-preview-count">${svg("users", 14)} ${fmtInt(count)} contacts match</span></div>
        ${renderGroup(state.builderDef, "root", false)}
        <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="sl_save">${svg("check", 14)} Save list</button></div>`;
      modal(html);
      wireBuilder(paint);
    };
    paint();
  }
  function wireBuilder(paint) {
    const wrap = $("#modalRoot");
    const nameEl = $("#sl_name"); const nameVal = () => (nameEl ? nameEl.value : "");
    $$("[data-match]", wrap).forEach((b) => b.addEventListener("click", () => { groupAt(b.dataset.matchpath).match = b.dataset.match; const nm = nameVal(); paint(); const n = $("#sl_name"); if (n) n.value = nm; }));
    $$("[data-addrule]", wrap).forEach((b) => b.addEventListener("click", () => { groupAt(b.dataset.addrule).rules.push({ field: "lead_score", op: "gte", value: 50 }); const nm = nameVal(); paint(); const n = $("#sl_name"); if (n) n.value = nm; }));
    $$("[data-addgroup]", wrap).forEach((b) => b.addEventListener("click", () => { groupAt(b.dataset.addgroup).rules.push({ match: "or", rules: [{ field: "source", op: "eq", value: "referral" }] }); const nm = nameVal(); paint(); const n = $("#sl_name"); if (n) n.value = nm; }));
    $$("[data-delrule]", wrap).forEach((b) => b.addEventListener("click", () => {
      const parts = b.dataset.delrule.split("."); const idx = Number(parts.pop()); const parent = groupAt(parts.join("."));
      parent.rules.splice(idx, 1); const nm = nameVal(); paint(); const n = $("#sl_name"); if (n) n.value = nm;
    }));
    $$("[data-rulekey]", wrap).forEach((inp) => inp.addEventListener("change", () => {
      const parts = inp.dataset.rulepath.split("."); const idx = Number(parts.pop()); const parent = groupAt(parts.join(".")); const rule = parent.rules[idx];
      const key = inp.dataset.rulekey;
      if (key === "field") { rule.field = inp.value; rule.op = opsFor(inp.value)[0][0]; rule.value = ""; }
      else rule[key] = inp.value;
      const nm = nameVal(); paint(); const n = $("#sl_name"); if (n) n.value = nm;
    }));
    const save = $("#sl_save", wrap); if (save) save.addEventListener("click", async () => {
      const name = nameVal().trim(); if (!name) { toast("Give the list a name", "danger"); return; }
      const def = state.builderDef; closeModal();
      if (!connected()) { state.smartLists.push({ id: "sl" + Date.now().toString(36), name, definition: def }); state.flashOk = "Smart list saved."; toast("Smart list saved", "success"); render(); return; }
      try { const c = ensureClient(); const { error } = await c.from("smart_lists").insert({ workspace_id: state.workspaceId, name, definition: def, created_by: state.user?.id }); if (error) { toast(error.message, "danger"); return; } state.flashOk = "Smart list saved."; await boot(); }
      catch (e) { toast(e.message || "Failed", "danger"); }
    });
  }

  /* ── Detail wiring (contact + company) ──────────────────────────────────── */
  function wireDetail(mount) {
    $$("[data-tab]", mount).forEach((b) => b.addEventListener("click", () => { state.detailTab = b.dataset.tab; state.editingField = null; render(); }));
    $$("[data-tlfilter]", mount).forEach((b) => b.addEventListener("click", () => { state.tlFilter = b.dataset.tlfilter; render(); }));
    $$("[data-edit-field]", mount).forEach((b) => b.addEventListener("click", () => { state.editingField = b.dataset.editField; render(); }));
    $$("[data-save-field]", mount).forEach((b) => b.addEventListener("click", () => saveField(b.dataset.saveField)));
    const la = $("[data-log-activity]", mount); if (la) la.addEventListener("click", () => openLogActivity(detailContactId()));
    const et = $("[data-edit-tags]", mount); if (et) et.addEventListener("click", () => openEditTags(detailContactId()));
    $$("[data-add-note]", mount).forEach((b) => b.addEventListener("click", () => addNote(b.dataset.addNote)));
    $$("[data-add-task]", mount).forEach((b) => b.addEventListener("click", () => addTask(b.dataset.addTask)));
    $$("[data-toggle-task]", mount).forEach((b) => b.addEventListener("change", () => toggleTask(b.dataset.toggleTask)));
    const ec = $("[data-edit-company]", mount); if (ec) ec.addEventListener("click", () => openEditCompany(ec.dataset.editCompany));
  }
  function detailContactId() { const seg = (location.hash || "").replace(/^#/, "").split("?")[0].split("/").filter(Boolean); return seg[2]; }

  async function saveField(key) {
    const id = detailContactId(); const c = contactById(id); if (!c) return;
    const inp = $("#edit_" + key.replace(/[^\w]/g, "\\$&")) || document.querySelector(`[data-fieldkey="${key}"]`);
    const val = inp ? inp.value : "";
    state.editingField = null;
    const isCustom = key.indexOf("cf:") === 0;
    if (!connected()) {
      if (isCustom) { const fid = key.slice(3); c.custom = c.custom || {}; c.custom[fid] = val; }
      else c[key] = key === "lead_score" ? Number(val) : val;
      toast("Saved", "success"); render(); return;
    }
    try {
      const cl = ensureClient();
      if (isCustom) { const fid = key.slice(3); const { error } = await cl.from("contact_custom_values").upsert({ workspace_id: state.workspaceId, contact_id: id, field_id: fid, value: val }, { onConflict: "contact_id,field_id" }); if (error) { toast(error.message, "danger"); return; } }
      else { const patch = {}; patch[key] = key === "lead_score" ? Number(val) : val; const { error } = await cl.from("contacts").update(patch).eq("id", id).eq("workspace_id", state.workspaceId); if (error) { toast(error.message, "danger"); return; } }
      await boot();
    } catch (e) { toast(e.message || "Failed", "danger"); }
  }

  function openLogActivity(id) {
    const opts = ["note", "call", "email", "sms", "task", "appointment", "deal_change", "custom"].map((t) => `<option value="${t}">${t.replace("_", " ")}</option>`).join("");
    modal(`<div class="mc-head"><span class="mc-ico">${svg("clock", 18)}</span><div><h3>Log activity</h3><div class="mc-sub">Append an event to this contact's timeline (calls <span class="mono">log_activity</span>).</div></div><button class="icon-btn mc-close" data-close>${svg("x", 15)}</button></div>
      <div class="form-field" style="margin-bottom:14px"><label>Type</label><select id="la_type">${opts}</select></div>
      <div class="form-field"><label>Description</label><textarea id="la_desc" placeholder="What happened?"></textarea></div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="la_go">${svg("check", 14)} Log</button></div>`);
    $("#la_go").addEventListener("click", async () => {
      const type = $("#la_type").value, desc = $("#la_desc").value.trim(); if (!desc) { toast("Add a description", "danger"); return; }
      closeModal();
      if (!connected()) { MOCK.activity.unshift({ id: "a" + Date.now().toString(36), contact_id: id, type, description: desc, actor: "Aisha (you)", created_at: new Date().toISOString() }); state.detailTab = "activity"; toast("Activity logged", "success"); render(); return; }
      try { const c = ensureClient(); const { error } = await c.rpc("log_activity", { p_ws: state.workspaceId, p_contact: id, p_type: type, p_description: desc, p_metadata: {} }); if (error) { toast(error.message, "danger"); return; } state.detailTab = "activity"; await boot(); }
      catch (e) { toast(e.message || "Failed", "danger"); }
    });
  }
  function openEditTags(id) {
    const c = contactById(id); if (!c) return;
    const current = new Set((c.tags || []).map(String));
    modal(`<div class="mc-head"><span class="mc-ico">${svg("tag", 18)}</span><div><h3>Edit tags</h3><div class="mc-sub">Toggle tags for ${esc(fullName(c))}.</div></div><button class="icon-btn mc-close" data-close>${svg("x", 15)}</button></div>
      <div class="tag-chip-wrap">${state.tags.map((t) => `<button class="tag-chip-filter ${current.has(String(t.id)) ? "on" : ""}" data-toggletag="${esc(t.id)}"><span class="tcf-dot" style="background:${esc(t.color)}"></span>${esc(t.name)}</button>`).join("") || '<span style="color:var(--ink-400);font-size:13px">No tags — create some in Settings › Tags.</span>'}</div>
      <div class="mc-foot"><button class="btn btn-primary" data-close>${svg("check", 14)} Done</button></div>`);
    $$("[data-toggletag]", $("#modalRoot")).forEach((b) => b.addEventListener("click", async () => {
      const tid = b.dataset.toggletag; const has = current.has(String(tid));
      if (has) current.delete(String(tid)); else current.add(String(tid));
      b.classList.toggle("on");
      if (!connected()) { c.tags = Array.from(current); render(); return; }
      try { const cl = ensureClient(); if (has) await cl.from("contact_tags").delete().eq("workspace_id", state.workspaceId).eq("contact_id", id).eq("tag_id", tid); else await cl.from("contact_tags").insert({ workspace_id: state.workspaceId, contact_id: id, tag_id: tid }); await loadWorkspace(); }
      catch (e) { toast(e.message || "Failed", "danger"); }
    }));
  }
  async function addNote(id) {
    const inp = $("#noteText"); const content = inp ? inp.value.trim() : ""; if (!content) { toast("Write something first", "danger"); return; }
    if (!connected()) { MOCK.notes.unshift({ id: "n" + Date.now().toString(36), contact_id: id, user: state.user?.name || "You", content, created_at: new Date().toISOString() }); state.detailTab = "notes"; toast("Note added", "success"); render(); return; }
    try { const c = ensureClient(); const { error } = await c.from("contact_notes").insert({ workspace_id: state.workspaceId, contact_id: id, user_id: state.user?.id, content }); if (error) { toast(error.message, "danger"); return; } state.detailTab = "notes"; await boot(); }
    catch (e) { toast(e.message || "Failed", "danger"); }
  }
  async function addTask(id) {
    const title = ($("#taskTitle")?.value || "").trim(); const due = $("#taskDue")?.value || null;
    if (!title) { toast("Give the task a title", "danger"); return; }
    if (!connected()) { const c = contactById(id); state.tasks.push({ id: "k" + Date.now().toString(36), contact_id: id, contact_name: c ? fullName(c) : "—", title, due_date: due ? new Date(due).toISOString() : isoDay(3), status: "open" }); state.detailTab = "tasks"; toast("Task added", "success"); render(); return; }
    try { const cl = ensureClient(); const { error } = await cl.from("contact_tasks").insert({ workspace_id: state.workspaceId, contact_id: id, assigned_to: state.user?.id, title, due_date: due, status: "open" }); if (error) { toast(error.message, "danger"); return; } state.detailTab = "tasks"; await boot(); }
    catch (e) { toast(e.message || "Failed", "danger"); }
  }
  async function toggleTask(id) {
    const t = state.tasks.find((x) => x.id === id); if (!t) return;
    const next = t.status === "done" ? "open" : "done";
    if (!connected()) { t.status = next; render(); return; }
    try { const c = ensureClient(); const { error } = await c.from("contact_tasks").update({ status: next }).eq("id", id).eq("workspace_id", state.workspaceId); if (error) { toast(error.message, "danger"); return; } t.status = next; render(); }
    catch (e) { toast(e.message || "Failed", "danger"); }
  }

  /* ── Companies wiring ───────────────────────────────────────────────────── */
  function wireCompanies(mount) {
    ["newCompany", "newCompanyEmpty"].forEach((id) => { const b = $("#" + id, mount); if (b) b.addEventListener("click", () => openEditCompany(null)); });
  }
  function openEditCompany(id) {
    if (!canWrite()) { toast("You need staff access to edit companies", "danger"); return; }
    const co = id ? companyById(id) : {};
    modal(`<div class="mc-head"><span class="mc-ico" style="background:var(--grad-gold);color:#1A0E00">${svg("building", 18)}</span><div><h3>${id ? "Edit" : "New"} company</h3><div class="mc-sub">Group contacts under an organization.</div></div><button class="icon-btn mc-close" data-close>${svg("x", 15)}</button></div>
      <div class="form-grid">
        <div class="form-field full"><label>Name</label><input id="co_name" value="${esc(co.name || "")}"></div>
        <div class="form-field"><label>Website</label><input id="co_web" value="${esc(co.website || "")}" placeholder="example.com"></div>
        <div class="form-field"><label>Industry</label><input id="co_ind" value="${esc(co.industry || "")}"></div>
        <div class="form-field"><label>Size</label><input id="co_size" value="${esc(co.size || "")}" placeholder="1-10 / 11-50…"></div>
      </div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="co_go">${svg("check", 14)} Save</button></div>`);
    $("#co_go").addEventListener("click", async () => {
      const payload = { name: $("#co_name").value.trim(), website: $("#co_web").value.trim(), industry: $("#co_ind").value.trim(), size: $("#co_size").value.trim() };
      if (!payload.name) { toast("Name is required", "danger"); return; }
      closeModal();
      if (!connected()) { if (id) { Object.assign(co, payload); } else { state.companies.push({ id: "co" + Date.now().toString(36), ...payload, contacts: 0 }); } state.flashOk = "Company saved."; toast("Company saved", "success"); render(); return; }
      try { const c = ensureClient(); const q = id ? c.from("companies").update(payload).eq("id", id).eq("workspace_id", state.workspaceId) : c.from("companies").insert({ workspace_id: state.workspaceId, ...payload }); const { error } = await q; if (error) { toast(error.message, "danger"); return; } state.flashOk = "Company saved."; await boot(); }
      catch (e) { toast(e.message || "Failed", "danger"); }
    });
  }

  /* ── Tasks / Duplicates wiring ──────────────────────────────────────────── */
  function wireTasks(mount) {
    $$("[data-toggle-task]", mount).forEach((b) => b.addEventListener("change", () => toggleTask(b.dataset.toggleTask)));
  }
  function wireDuplicates(mount) {
    $$("[data-merge-dup]", mount).forEach((b) => b.addEventListener("click", () => mergeDup(b.dataset.mergeDup)));
    $$("[data-dismiss-dup]", mount).forEach((b) => b.addEventListener("click", () => dismissDup(b.dataset.dismissDup)));
  }
  async function mergeDup(id) {
    if (!canDelete()) { toast("Merging requires manager access", "danger"); return; }
    const d = state.duplicates.find((x) => x.id === id); if (!d) return;
    if (!connected()) { state.contacts = state.contacts.filter((c) => c.id !== d.contact_b); d.status = "merged"; state.duplicates = state.duplicates.filter((x) => x.id !== id); state.flashOk = "Contacts merged."; toast("Merged", "success"); render(); return; }
    try { const c = ensureClient(); const { error } = await c.rpc("merge_contacts", { p_ws: state.workspaceId, p_primary: d.contact_a, p_dup: d.contact_b }); if (error) { toast(error.message, "danger"); return; } state.flashOk = "Contacts merged."; await boot(); }
    catch (e) { toast(e.message || "Failed", "danger"); }
  }
  async function dismissDup(id) {
    const d = state.duplicates.find((x) => x.id === id); if (!d) return;
    if (!connected()) { d.status = "dismissed"; state.duplicates = state.duplicates.filter((x) => x.id !== id); toast("Marked as not a duplicate", "success"); render(); return; }
    try { const c = ensureClient(); const { error } = await c.from("contact_duplicates").update({ status: "dismissed" }).eq("id", id).eq("workspace_id", state.workspaceId); if (error) { toast(error.message, "danger"); return; } await boot(); }
    catch (e) { toast(e.message || "Failed", "danger"); }
  }

  /* ── Import wizard wiring ───────────────────────────────────────────────── */
  function parseCsvText(text) {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.length);
    if (!lines.length) return { headers: [], rows: [] };
    const split = (line) => {
      const out = []; let cur = "", q = false;
      for (let i = 0; i < line.length; i++) { const ch = line[i];
        if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
        else { if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch; } }
      out.push(cur); return out.map((s) => s.trim());
    };
    const headers = split(lines[0]);
    const rows = lines.slice(1).map(split);
    return { headers, rows };
  }
  function autoMap(headers) {
    const map = {};
    headers.forEach((h) => {
      const k = h.toLowerCase().replace(/[^a-z]/g, "");
      if (/first/.test(k)) map[h] = "first_name"; else if (/last/.test(k)) map[h] = "last_name";
      else if (/mail/.test(k)) map[h] = "email"; else if (/phone|mobile|tel/.test(k)) map[h] = "phone";
      else if (/company|org/.test(k)) map[h] = "company"; else if (/source/.test(k)) map[h] = "source";
      else if (/score/.test(k)) map[h] = "lead_score"; else map[h] = "";
    });
    return map;
  }
  function wireImport(mount) {
    const pick = $("#pickFile", mount), file = $("#csvFile", mount), dz = $("#dropZone", mount);
    if (pick && file) pick.addEventListener("click", (e) => { e.stopPropagation(); file.click(); });
    if (dz && file) dz.addEventListener("click", () => file.click());
    if (file) file.addEventListener("change", () => { const f = file.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { const t = $("#csvPaste"); if (t) t.value = rd.result; toast("File loaded — click Parse", "info"); }; rd.readAsText(f); });
    const parse = $("#parseCsv", mount); if (parse) parse.addEventListener("click", () => {
      const text = ($("#csvPaste")?.value || "").trim(); if (!text) { toast("Paste or upload a CSV first", "danger"); return; }
      const { headers, rows } = parseCsvText(text);
      if (!headers.length) { toast("Couldn't parse a header row", "danger"); return; }
      state.importHeaders = headers; state.importRows = rows; state.importMap = autoMap(headers); state.importStep = 2; render();
    });
    $$("[data-map]", mount).forEach((s) => s.addEventListener("change", () => { state.importMap[s.dataset.map] = s.value; }));
    const cb = $("#consentBox", mount); if (cb) cb.addEventListener("change", () => { state.importConsent = cb.checked; });
    const back = $("#importBack", mount); if (back) back.addEventListener("click", () => { state.importStep = Math.max(1, state.importStep - 1); render(); });
    const toPrev = $("#toPreview", mount); if (toPrev) toPrev.addEventListener("click", () => { const mapped = Object.values(state.importMap).filter(Boolean); if (!mapped.length) { toast("Map at least one column", "danger"); return; } state.importStep = 3; render(); });
    const start = $("#startImport", mount); if (start) start.addEventListener("click", startImport);
    const doneBtn = $("#importDone", mount); if (doneBtn) doneBtn.addEventListener("click", () => { resetImport(); location.hash = "#/crm/contacts"; });
  }
  function resetImport() { state.importStep = 1; state.importRows = []; state.importHeaders = []; state.importMap = {}; state.importConsent = false; state.importProgress = null; }
  async function startImport() {
    if (!state.importConsent) { toast("Attest consent before importing", "danger"); return; }
    const mapping = state.importMap;
    const total = state.importRows.length;
    if (!connected()) {
      // Simulate the server job stepping through the contact_imports row.
      const bad = Math.max(0, Math.round(total * 0.06));
      state.importProgress = { status: "processing", total, processed: 0, inserted: 0, updated: 0, failed: 0 };
      render();
      let processed = 0;
      const tick = () => {
        processed = Math.min(total, processed + Math.max(1, Math.ceil(total / 8)));
        const failed = Math.min(bad, Math.round((processed / total) * bad));
        state.importProgress = { status: processed >= total ? "completed" : "processing", total, processed, inserted: processed - failed, updated: 0, failed };
        render();
        if (processed < total) setTimeout(tick, 420);
      };
      setTimeout(tick, 420);
      return;
    }
    try {
      const c = ensureClient();
      const rows = state.importRows;
      const { data, error } = await c.functions.invoke("contacts-import", { body: { workspace_id: state.workspaceId, mapping, rows, consent_attested: state.importConsent } });
      if (error) { toast(await readFnError(error), "danger"); return; }
      const res = data?.data ?? data;
      const importId = res?.import_id || res?.id;
      state.importProgress = { status: "processing", total, processed: 0, inserted: 0, updated: 0, failed: 0 };
      render();
      pollImport(importId);
    } catch (e) { toast(e.message || "Import failed to start", "danger"); }
  }
  async function pollImport(importId) {
    if (!importId) return;
    const c = ensureClient();
    const poll = async () => {
      try {
        const { data } = await c.from("contact_imports").select("status,total_rows,processed,inserted,updated,failed").eq("id", importId).maybeSingle();
        if (data) { state.importProgress = { status: data.status, total: data.total_rows || 0, processed: data.processed || 0, inserted: data.inserted || 0, updated: data.updated || 0, failed: data.failed || 0 }; render(); }
        if (data && (data.status === "done" || data.status === "completed" || data.status === "failed")) return;
      } catch (e) {}
      setTimeout(poll, 1500);
    };
    poll();
  }

  /* ── Tag manager wiring ─────────────────────────────────────────────────── */
  function wireTags(mount) {
    ["newTag", "newTagEmpty"].forEach((id) => { const b = $("#" + id, mount); if (b) b.addEventListener("click", () => openEditTag(null)); });
    $$("[data-edit-tag]", mount).forEach((b) => b.addEventListener("click", () => openEditTag(b.dataset.editTag)));
    $$("[data-del-tag]", mount).forEach((b) => b.addEventListener("click", () => delTag(b.dataset.delTag)));
  }
  function openEditTag(id) {
    if (!canWrite()) { toast("You need staff access to manage tags", "danger"); return; }
    const t = id ? tagById(id) : { color: TAG_PALETTE[0] };
    let color = t.color || TAG_PALETTE[0];
    modal(`<div class="mc-head"><span class="mc-ico">${svg("tag", 18)}</span><div><h3>${id ? "Edit" : "New"} tag</h3><div class="mc-sub">Name and color for segmenting contacts.</div></div><button class="icon-btn mc-close" data-close>${svg("x", 15)}</button></div>
      <div class="form-field" style="margin-bottom:16px"><label>Name</label><input id="tg_name" value="${esc(t.name || "")}" placeholder="VIP"></div>
      <div class="label" style="margin-bottom:8px">Color</div>
      <div class="color-picker" id="tg_colors">${TAG_PALETTE.map((c) => `<span class="color-swatch ${c === color ? "on" : ""}" data-color="${c}" style="background:${c}"></span>`).join("")}</div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="tg_go">${svg("check", 14)} Save tag</button></div>`);
    $$("[data-color]", $("#modalRoot")).forEach((s) => s.addEventListener("click", () => { color = s.dataset.color; $$("[data-color]").forEach((x) => x.classList.toggle("on", x === s)); }));
    $("#tg_go").addEventListener("click", async () => {
      const name = $("#tg_name").value.trim(); if (!name) { toast("Name the tag", "danger"); return; }
      closeModal();
      if (!connected()) { if (id) { t.name = name; t.color = color; } else state.tags.push({ id: "t" + Date.now().toString(36), name, color }); state.flashOk = "Tag saved."; toast("Tag saved", "success"); render(); return; }
      try { const c = ensureClient(); const q = id ? c.from("tags").update({ name, color }).eq("id", id).eq("workspace_id", state.workspaceId) : c.from("tags").insert({ workspace_id: state.workspaceId, name, color }); const { error } = await q; if (error) { toast(error.message, "danger"); return; } state.flashOk = "Tag saved."; await boot(); }
      catch (e) { toast(e.message || "Failed", "danger"); }
    });
  }
  function delTag(id) {
    if (!canDelete()) { toast("Deleting tags requires manager access", "danger"); return; }
    const t = tagById(id);
    modal(`<div class="mc-head"><span class="mc-ico" style="background:var(--grad-gold);color:#1A0E00">${svg("trash", 18)}</span><div><h3>Delete “${esc(t?.name || "tag")}”?</h3><div class="mc-sub">It's removed from every contact. This can't be undone.</div></div><button class="icon-btn mc-close" data-close>${svg("x", 15)}</button></div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="dt_go" style="background:var(--status-danger)">${svg("trash", 14)} Delete</button></div>`);
    $("#dt_go").addEventListener("click", async () => {
      closeModal();
      if (!connected()) { state.tags = state.tags.filter((x) => x.id !== id); state.contacts.forEach((c) => { c.tags = (c.tags || []).filter((x) => String(x) !== String(id)); }); toast("Tag deleted", "success"); render(); return; }
      try { const c = ensureClient(); await c.from("contact_tags").delete().eq("workspace_id", state.workspaceId).eq("tag_id", id); const { error } = await c.from("tags").delete().eq("id", id).eq("workspace_id", state.workspaceId); if (error) { toast(error.message, "danger"); return; } state.flashOk = "Tag deleted."; await boot(); }
      catch (e) { toast(e.message || "Failed", "danger"); }
    });
  }

  /* ── Custom field manager wiring ────────────────────────────────────────── */
  function wireFields(mount) {
    ["newField", "newFieldEmpty"].forEach((id) => { const b = $("#" + id, mount); if (b) b.addEventListener("click", () => openEditField(null)); });
    $$("[data-edit-field-def]", mount).forEach((b) => b.addEventListener("click", () => openEditField(b.dataset.editFieldDef)));
    $$("[data-del-field]", mount).forEach((b) => b.addEventListener("click", () => delField(b.dataset.delField)));
  }
  function openEditField(id) {
    if (!canWrite()) { toast("You need staff access to manage fields", "danger"); return; }
    const f = id ? state.customFields.find((x) => x.id === id) : { field_type: "text" };
    const typeOpts = FIELD_TYPES.map((t) => `<option value="${t}" ${f.field_type === t ? "selected" : ""}>${t}</option>`).join("");
    modal(`<div class="mc-head"><span class="mc-ico">${svg("sparkle", 18)}</span><div><h3>${id ? "Edit" : "New"} custom field</h3><div class="mc-sub">Appears inline on every contact's Overview.</div></div><button class="icon-btn mc-close" data-close>${svg("x", 15)}</button></div>
      <div class="form-grid">
        <div class="form-field full"><label>Field name</label><input id="cf_name" value="${esc(f.field_name || "")}" placeholder="Preferred channel"></div>
        <div class="form-field full"><label>Type</label><select id="cf_type">${typeOpts}</select></div>
        <div class="form-field full"><label>Options (comma-separated, for dropdown/multiselect)</label><input id="cf_opts" value="${esc(Array.isArray(f.options) ? f.options.join(", ") : "")}" placeholder="Email, SMS, WhatsApp"></div>
      </div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="cf_go">${svg("check", 14)} Save field</button></div>`);
    $("#cf_go").addEventListener("click", async () => {
      const name = $("#cf_name").value.trim(); if (!name) { toast("Name the field", "danger"); return; }
      const type = $("#cf_type").value; const optsRaw = $("#cf_opts").value.trim();
      const options = /dropdown|multiselect/.test(type) && optsRaw ? optsRaw.split(",").map((s) => s.trim()).filter(Boolean) : null;
      closeModal();
      if (!connected()) { if (id) { f.field_name = name; f.field_type = type; f.options = options; } else state.customFields.push({ id: "cf" + Date.now().toString(36), field_name: name, field_type: type, options }); state.flashOk = "Custom field saved."; toast("Field saved", "success"); render(); return; }
      try { const c = ensureClient(); const payload = { field_name: name, field_type: type, options }; const q = id ? c.from("custom_fields").update(payload).eq("id", id).eq("workspace_id", state.workspaceId) : c.from("custom_fields").insert({ workspace_id: state.workspaceId, ...payload }); const { error } = await q; if (error) { toast(error.message, "danger"); return; } state.flashOk = "Custom field saved."; await boot(); }
      catch (e) { toast(e.message || "Failed", "danger"); }
    });
  }
  function delField(id) {
    if (!canDelete()) { toast("Deleting fields requires manager access", "danger"); return; }
    const f = state.customFields.find((x) => x.id === id);
    modal(`<div class="mc-head"><span class="mc-ico" style="background:var(--grad-gold);color:#1A0E00">${svg("trash", 18)}</span><div><h3>Delete “${esc(f?.field_name || "field")}”?</h3><div class="mc-sub">Its values are removed from every contact.</div></div><button class="icon-btn mc-close" data-close>${svg("x", 15)}</button></div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="df_go" style="background:var(--status-danger)">${svg("trash", 14)} Delete</button></div>`);
    $("#df_go").addEventListener("click", async () => {
      closeModal();
      if (!connected()) { state.customFields = state.customFields.filter((x) => x.id !== id); toast("Field deleted", "success"); render(); return; }
      try { const c = ensureClient(); await c.from("contact_custom_values").delete().eq("workspace_id", state.workspaceId).eq("field_id", id); const { error } = await c.from("custom_fields").delete().eq("id", id).eq("workspace_id", state.workspaceId); if (error) { toast(error.message, "danger"); return; } state.flashOk = "Field deleted."; await boot(); }
      catch (e) { toast(e.message || "Failed", "danger"); }
    });
  }

  /* ── CSV download helper ────────────────────────────────────────────────── */
  function downloadCsv(csv, filename) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = el("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
  }

  // Read the envelope message out of a Supabase FunctionsHttpError (non-2xx body).
  async function readFnError(error) {
    try { const body = await error.context.json(); return body?.message || body?.error || error.message; }
    catch (e) { return error?.message || "Request failed"; }
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

  /* ── Go ─────────────────────────────────────────────────────────────────── */
  window.addEventListener("hashchange", () => { state.editingField = null; render(); });
  boot();
})();
