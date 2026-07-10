/* m20-funnels.js — AiMindShare Module M20 · Funnels.
   Vanilla hash-routed dashboard on Supabase. Multi-step conversion flows on top of
   the M19 page engine: opt-in → sales → order → upsell → thank-you, with per-step
   conversion tracking and A/B split testing. A funnel is an ordered list of M19
   pages (funnel_steps.page_id → pages.id); funnel_map() is the server truth for the
   step map + waterfall; funnel_split_stats() runs the two-proportion z-test; orders
   wire to M28 by creating an invoices row (source_type='order') — the public-funnel
   Edge Fn owns the service-role writes. The browser READS its data (RLS-scoped,
   staff+ operator ceiling) and calls the RPCs/Edge Fn. Anon key only (Law 3). No
   project connected → a high-fidelity mockup with a default/empty/loading/error/
   success preview switcher (Gate-5).

   Scope (BUILD-SEQUENCE S19 accept-when): step builder on M19 pages · funnel map
   with per-step conversion · A/B split with winner detection · order forms wired to
   M28. Deferred + labelled: one-click off-session Stripe upsell (seam present),
   public funnel renderer (M19 site-render), sequential significance. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const initials = (s) => (s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  /* ── Money (integer MINOR units everywhere — matches M28, D-072) ─────────── */
  const CUR = { USD: "$", EUR: "€", GBP: "£", AUD: "A$", CAD: "C$", AED: "د.إ", SAR: "﷼" };
  const money = (minor, cur = "USD") => (CUR[cur] || cur + " ") +
    (Number(minor || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const money2 = (minor, cur = "USD") => (CUR[cur] || cur + " ") +
    (Number(minor || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInt = (n) => Number(n || 0).toLocaleString("en-US");
  const pct = (n) => (Math.round(Number(n || 0) * 10) / 10) + "%";

  /* ── Inline icons (lucide-style) ─────────────────────────────────────────── */
  const P = {
    funnel: "M3 4h18l-7 8v7l-4 2v-9L3 4z", layers: "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
    split: "M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5", target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    chart: "M3 3v18h18M7 15l4-4 3 3 5-6", flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
    cart: "M2 3h2l2.4 12.2a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6M9 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2M20 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2",
    up: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6", users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    plus: "M12 5v14M5 12h14", check: "M20 6 9 17l-5-5", chev: "M9 18l6-6-6-6", back: "M19 12H5M12 19l-7-7 7-7",
    trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14", settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
    file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6", edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z",
    trophy: "M6 9a6 6 0 0 0 12 0V3H6zM6 5H3v2a3 3 0 0 0 3 3M18 5h3v2a3 3 0 0 1-3 3M9 21h6M12 17v4", mail: "M4 4h16v16H4zM22 6l-10 7L2 6",
    gift: "M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7",
    link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1", zap: "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  };
  const svg = (n, s = 17) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${P[n] || ""}"/></svg>`;
  const TYPE_ICO = { optin: "mail", sales: "file", order: "cart", upsell: "up", downsell: "gift", thankyou: "check" };
  const TYPE_LABEL = { optin: "Opt-in", sales: "Sales", order: "Order", upsell: "Upsell", downsell: "Downsell", thankyou: "Thank you" };
  const STATUS_STEPS = ["draft", "testing", "active", "paused", "archived"];
  const STATUS_LABEL = { draft: "Draft", testing: "Testing", active: "Live", paused: "Paused", archived: "Archived" };

  /* ── Theme + starfield (light default; dark = no stars) ──────────────────── */
  const THEME_KEY = "aimindshare-theme";
  const root = document.documentElement;
  const setTheme = (t) => { root.setAttribute("data-theme", t); try { localStorage.setItem(THEME_KEY, t); } catch (e) {} const i = $("#themeIco"); if (i) i.textContent = t === "dark" ? "☀" : "☾"; };
  setTheme((() => { try { return localStorage.getItem(THEME_KEY) || "light"; } catch (e) { return "light"; } })());
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  (function stars() {
    const field = $("#starField"); if (!field || reduce) return;
    for (let i = 0; i < 42; i++) { const s = el("div", "star"); s.style.left = Math.random() * 100 + "%"; s.style.top = Math.random() * 100 + "%"; s.style.setProperty("--tw", (3 + Math.random() * 7).toFixed(1) + "s"); s.style.setProperty("--td", (Math.random() * 10).toFixed(1) + "s"); field.appendChild(s); }
  })();

  /* ── Config + Supabase client (anon key only) ────────────────────────────── */
  const CFG_KEY = "aimindshare-supabase", ACTIVE_KEY = "aimindshare-active-ws", MODULE_DEFAULTS_KEY = "aimindshare-m20-defaults";
  // Module-level "New-funnel defaults" — device-local preferences (same pattern as the theme
  // toggle), NOT a workspace table. No schema change for a page that's pure navigation/UX.
  function moduleDefaults() {
    try { return { currency: "USD", testModeDefault: false, ...JSON.parse(localStorage.getItem(MODULE_DEFAULTS_KEY) || "{}") }; }
    catch (e) { return { currency: "USD", testModeDefault: false }; }
  }
  function saveModuleDefaults(patch) {
    try { localStorage.setItem(MODULE_DEFAULTS_KEY, JSON.stringify({ ...moduleDefaults(), ...patch })); } catch (e) {}
  }
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
    pages: [
      { id: "p1", title: "Free Ramadan Planner — Opt-in", slug: "ramadan-planner" },
      { id: "p2", title: "Reset Masterclass — Sales", slug: "masterclass" },
      { id: "p3", title: "Checkout — The Reset Bundle", slug: "checkout" },
      { id: "p4", title: "One-time Upsell — Coaching", slug: "upsell-coaching" },
      { id: "p5", title: "Thank You", slug: "thank-you" },
      { id: "p6", title: "Sales — Story-led (B)", slug: "masterclass-b" },
    ],
    funnels: [
      {
        id: "fn1", name: "Ramadan Reset Launch", status: "active", currency: "USD", test_mode: false,
        settings: { abandon_hours: 1, pipeline: "Sales", stage: "New" },
        steps: [
          { id: "s1", step_type: "optin", name: "Free Planner", page_id: "p1", page_title: "Free Ramadan Planner — Opt-in", visitors: 4820, conversions: 2170, rate: 45.0, has_split: false, revenue: 0, has_bump: false, warning_no_page: false },
          { id: "s2", step_type: "sales", name: "Masterclass", page_id: "p2", page_title: "Reset Masterclass — Sales", visitors: 2170, conversions: 954, rate: 44.0, has_split: true, revenue: 0, has_bump: false, warning_no_page: false },
          { id: "s3", step_type: "order", name: "Checkout", page_id: "p3", page_title: "Checkout — The Reset Bundle", visitors: 954, conversions: 372, rate: 39.0, has_split: false, config: { products: [{ name: "The Reset Bundle", price: 19900 }], bump: { name: "Guided Journal", price: 2900 } }, revenue: 8942000, has_bump: true, warning_no_page: false },
          { id: "s4", step_type: "upsell", name: "Coaching Upsell", page_id: "p4", page_title: "One-time Upsell — Coaching", visitors: 372, conversions: 96, rate: 25.8, has_split: false, config: { products: [{ name: "1:1 Coaching Call", price: 9900 }] }, revenue: 2544000, has_bump: false, warning_no_page: false },
          { id: "s5", step_type: "thankyou", name: "Thank You", page_id: "p5", page_title: "Thank You", visitors: 372, conversions: 372, rate: 100, has_split: false, revenue: 0, has_bump: false, warning_no_page: false },
        ],
        split: {
          step_id: "s2", a: { visitors: 1085, conversions: 466, rate: 42.9 }, b: { visitors: 1085, conversions: 531, rate: 48.9 },
          c: { visitors: 1085, conversions: 411, rate: 37.9 }, has_c: true,
          z: 2.86, significant: true, leader: "B", status: "running", winner: null,
          variant_page_id: "p6", variant_page_title: "Sales — Story-led (B)",
          variant_c_page_id: null, variant_c_page_title: null,
          min_sample_size: 30, confidence: 0.95, auto_promote: false,
        },
        readiness: { ready: true, score: 90, blockers: [], warnings: ["SSL has not been provisioned for a custom domain yet."] },
        access: [{ user_id: "u-staff1", can_edit: true, can_view_analytics: false, profiles: { name: "Sara Khan", email: "sara@northstar.agency" } }],
        recommendations: [
          { type: "low_epc", severity: "info", message: "EPC is healthy relative to your traffic volume — no action needed here." },
          { type: "variant_winner_ready", severity: "info", message: "The test on \"Masterclass\" has a statistically significant leader (variant B) — review it in Variants." },
        ],
        jobRuns: [
          { job_name: "sweep_abandoned_funnels", rows_affected: 3, ran_at: "2026-07-10T09:00:00Z" },
          { job_name: "auto_promote_split_winners", rows_affected: 0, ran_at: "2026-07-10T08:25:00Z" },
        ],
        entrants: {
          total: 4820,
          entrants: [
            { visitor_id: "v-9f2a", first_name: "Yusuf", last_name: "Rahman", email: "yusuf@ex.com", is_test: false, variant: "B", source: "instagram", furthest_step_name: "Coaching Upsell", furthest_step_order: 3, order_status: "paid", order_amount_paid: 22800, last_seen: "2026-07-09T09:14:00Z" },
            { visitor_id: "v-71cd", first_name: "Aisha", last_name: null, email: "aisha@ex.com", is_test: false, variant: "A", source: "email", furthest_step_name: "Checkout", furthest_step_order: 2, order_status: "sent", order_amount_paid: 0, last_seen: "2026-07-09T08:40:00Z" },
            { visitor_id: "v-3b10", first_name: null, last_name: null, email: null, is_test: false, variant: null, source: "google", furthest_step_name: "Masterclass", furthest_step_order: 1, order_status: null, order_amount_paid: 0, last_seen: "2026-07-08T21:02:00Z" },
            { visitor_id: "v-test1", first_name: "Preview", last_name: "Tester", email: "you@northstar.agency", is_test: true, variant: null, source: "direct", furthest_step_name: "Free Planner", furthest_step_order: 0, order_status: null, order_amount_paid: 0, last_seen: "2026-07-08T18:11:00Z" },
          ],
        },
        opsLog: {
          abandoned_count: 14, promoted_count: 1,
          automation: [
            { trigger_type: "payment.received", status: "completed", error: null, started_at: "2026-07-09T09:14:00Z" },
            { trigger_type: "checkout.started", status: "completed", error: null, started_at: "2026-07-09T09:12:40Z" },
            { trigger_type: "step.completed", status: "completed", error: null, started_at: "2026-07-09T09:10:05Z" },
            { trigger_type: "form.submitted", status: "completed", error: null, started_at: "2026-07-09T08:58:22Z" },
            { trigger_type: "cart.abandoned", status: "failed", error: "recovery sequence has no active steps", started_at: "2026-07-08T22:00:11Z" },
            { trigger_type: "funnel.entered", status: "completed", error: null, started_at: "2026-07-08T21:40:03Z" },
          ],
        },
        revenue: {
          revenue: 11486000, orders: 520, aov: 22088, epc: 2383, visitors: 4820,
          by_step: [{ step_id: "s3", name: "Checkout", step_type: "order", revenue: 8942000, orders: 372 },
                    { step_id: "s4", name: "Coaching Upsell", step_type: "upsell", revenue: 2544000, orders: 96 }],
          by_source: [{ source: "instagram", visitors: 2140, revenue: 5210000, orders: 231 },
                      { source: "email", visitors: 1290, revenue: 3480000, orders: 168 },
                      { source: "google", visitors: 880, revenue: 1890000, orders: 89 },
                      { source: "direct", visitors: 510, revenue: 906000, orders: 32 }],
          by_medium: [{ medium: "paid_social", visitors: 2140 }, { medium: "email", visitors: 1290 }, { medium: "organic", visitors: 880 }, { medium: "none", visitors: 510 }],
          by_campaign: [{ campaign: "reset-launch", visitors: 3200 }, { campaign: "none", visitors: 1620 }],
          trend: [
            { day: "2026-07-06", revenue: 1420000, orders: 58 }, { day: "2026-07-07", revenue: 1680000, orders: 66 },
            { day: "2026-07-08", revenue: 1990000, orders: 79 }, { day: "2026-07-09", revenue: 2210000, orders: 91 },
            { day: "2026-07-10", revenue: 1740000, orders: 70 },
          ],
          reconciled: true,
        },
      },
      {
        id: "fn2", name: "Webinar Registration", status: "testing", currency: "USD", test_mode: true,
        settings: { abandon_hours: 2 },
        steps: [
          { id: "w1", step_type: "optin", name: "Register", page_id: "p1", page_title: "Webinar registration", visitors: 1960, conversions: 1120, rate: 57.1, has_split: false },
          { id: "w2", step_type: "sales", name: "Replay + Offer", page_id: "p2", page_title: "Replay page", visitors: 1120, conversions: 402, rate: 35.9, has_split: false },
          { id: "w3", step_type: "order", name: "Enroll", page_id: "p3", page_title: "Enrollment", visitors: 402, conversions: 148, rate: 36.8, has_split: false, config: { products: [{ name: "Course enrollment", price: 49900 }] } },
          { id: "w4", step_type: "thankyou", name: "Welcome", page_id: "p5", page_title: "Welcome aboard", visitors: 148, conversions: 148, rate: 100, has_split: false },
        ],
        split: null,
        readiness: { ready: true, blockers: [], warnings: [] },
        revenue: { revenue: 7385200, orders: 148, aov: 49900, epc: 3768, visitors: 1960,
          by_step: [{ step_id: "w3", name: "Enroll", step_type: "order", revenue: 7385200, orders: 148 }],
          by_source: [{ source: "email", visitors: 1200, revenue: 4520000, orders: 91 }, { source: "direct", visitors: 760, revenue: 2865200, orders: 57 }] },
      },
      {
        id: "fn3", name: "Lead Magnet — Dua Cards", status: "draft", currency: "USD", test_mode: false, settings: {}, steps: [], split: null,
        readiness: { ready: false, blockers: ["Add at least one step before publishing."], warnings: [] },
        revenue: { revenue: 0, orders: 0, aov: 0, epc: 0, visitors: 0, by_step: [], by_source: [] },
      },
      {
        id: "tmpl1", name: "Webinar Registration Template", status: "draft", currency: "USD", test_mode: false,
        is_template: true, template_of_id: null, site_id: null, settings: {},
        steps: [
          { id: "t1", step_type: "optin", name: "Register", page_id: null, page_title: "No page yet", visitors: 0, conversions: 0, rate: 0, has_split: false },
          { id: "t2", step_type: "sales", name: "Replay + Offer", page_id: null, page_title: "No page yet", visitors: 0, conversions: 0, rate: 0, has_split: false },
          { id: "t3", step_type: "order", name: "Enroll", page_id: null, page_title: "No page yet", visitors: 0, conversions: 0, rate: 0, has_split: false },
        ],
        split: null, readiness: null, revenue: null,
      },
    ],
    utm: [{ source: "instagram", visitors: 2140 }, { source: "email", visitors: 1290 }, { source: "google", visitors: 880 }, { source: "direct", visitors: 510 }],
    members: [
      { user_id: "u-staff1", role: "staff", profiles: { name: "Sara Khan", email: "sara@northstar.agency" } },
      { user_id: "u-manager1", role: "manager", profiles: { name: "Omar Malik", email: "omar@northstar.agency" } },
    ],
  };

  /* ── App state ───────────────────────────────────────────────────────────── */
  const state = {
    loaded: false, loading: false, error: null, previewState: "default",
    user: null, workspaceId: null, workspaceName: "", role: "owner",
    funnels: [], pages: [], glance: null, utm: [],
    active: null,                                   // the loaded funnel detail
    route: { name: "funnels" }, drawer: null,       // drawer = {stepId, tab}
    cardMenu: null,                                 // funnel id whose "more" menu is open
  };
  const PREVIEW_STATES = ["default", "empty", "loading", "error", "success"];
  const st = (name) => !connected() && state.previewState === name;
  const canWrite = () => ["owner", "admin", "manager", "staff"].includes(state.role) || !connected();
  const canManage = () => ["owner", "admin", "manager"].includes(state.role) || !connected();
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
        await loadFunnels(active.id);
        if (state.route.name === "funnel" && state.route.id) await loadDetail(state.route.id);
        if (state.route.name === "module" && state.route.section === "pages") await loadPagesUsage();
      } catch (e) { state.error = e.message || String(e); }
      state.loading = false; state.loaded = true;
    } else {
      state.user = MOCK.user; state.workspaceId = MOCK.workspace.id; state.workspaceName = MOCK.workspace.name; state.role = "owner";
      state.funnels = MOCK.funnels.map(clone); state.pages = MOCK.pages.map(clone); state.utm = MOCK.utm.map(clone);
      state.members = MOCK.members.map(clone);
      state.glance = mockGlance();
      if (state.route.name === "funnel") state.active = state.funnels.find((f) => f.id === state.route.id) || null;
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
  function mockGlance() {
    const all = MOCK.funnels.filter((f) => !f.is_template).flatMap((f) => f.steps);
    const visitors = all.filter((s) => s.step_type === "optin").reduce((a, s) => a + s.visitors, 0);
    const optins = all.filter((s) => s.step_type === "optin").reduce((a, s) => a + s.conversions, 0);
    const orders = 520, revenue = 11486000;
    return { visitors, optins, optin_rate: visitors ? (optins / visitors * 100) : 0, orders, revenue, currency: "USD" };
  }
  async function loadFunnels(wsId) {
    const c = ensureClient();
    const [{ data: fns }, { data: pages }, { data: members }] = await Promise.all([
      c.from("funnels").select("*").is("archived_at", null).order("created_at", { ascending: false }),
      c.from("pages").select("id,title,slug").order("sort").limit(400),
      c.from("memberships").select("user_id,role,profiles(name,email)").eq("workspace_id", wsId),
    ]);
    state.funnels = (fns || []).map((f) => ({ ...f, currency: f.settings?.currency || "USD" }));
    state.pages = pages || [];
    state.members = members || [];
    // Light revenue glance from M28 orders + funnel_visits counts (RLS-scoped).
    const [{ count: viewCount }, { count: optinCount }, { data: orders }] = await Promise.all([
      c.from("funnel_visits").select("id", { count: "exact", head: true }).eq("event", "view"),
      c.from("funnel_visits").select("id", { count: "exact", head: true }).eq("event", "optin"),
      c.from("invoices").select("amount_paid,status").eq("source_type", "order"),
    ]);
    const paid = (orders || []).filter((o) => o.amount_paid > 0);
    state.glance = {
      visitors: viewCount || 0, optins: optinCount || 0,
      optin_rate: viewCount ? (optinCount / viewCount * 100) : 0,
      orders: (orders || []).length, revenue: paid.reduce((a, o) => a + (o.amount_paid || 0), 0), currency: "USD",
    };
  }
  async function loadDetail(id) {
    const c = ensureClient();
    const f = state.funnels.find((x) => x.id === id);
    if (!f) { state.active = null; return; }
    const [{ data: mapData }, { data: splits }, { data: readiness }, { data: revenue }, { data: access }, { data: opsLog }, { data: entrants }, { data: recs }, { data: jobRuns }] = await Promise.all([
      c.rpc("funnel_map", { p_funnel: id }),
      c.from("funnel_splits").select("*").order("created_at", { ascending: false }),
      c.rpc("funnel_publish_readiness", { p_funnel: id }),
      c.rpc("funnel_revenue_summary", { p_funnel: id }),
      c.from("funnel_access").select("user_id,can_edit,can_view_analytics,profiles(name,email)").eq("funnel_id", id),
      c.rpc("funnel_operations_log", { p_funnel: id }),
      c.rpc("funnel_entrants", { p_funnel: id }),
      c.rpc("funnel_recommendations", { p_funnel: id }),
      c.from("funnel_job_runs").select("job_name,rows_affected,ran_at").order("ran_at", { ascending: false }).limit(10),
    ]);
    const pageById = Object.fromEntries(state.pages.map((p) => [p.id, p]));
    const steps = (mapData || []).map((s) => ({
      ...s, page_title: pageById[s.page_id]?.title || (s.page_id ? "Linked page" : "No page yet"),
    }));
    // attach the running split (if any) — the drawer fetches live stats on open.
    const splitByStep = {};
    (splits || []).forEach((sp) => { if (!splitByStep[sp.step_id]) splitByStep[sp.step_id] = sp; });
    let sourceOffer = null;
    if (f.source_offer_id) {
      const { data } = await c.from("affiliate_offers").select("*").eq("id", f.source_offer_id).maybeSingle();
      sourceOffer = data || null;
    }
    let compliance = null;
    try { const { data } = await c.rpc("funnel_compliance_scan", { p_funnel: id }); compliance = data; } catch (e) { compliance = null; }
    state.active = {
      ...f, steps, splitByStep, currency: f.settings?.currency || "USD",
      readiness: readiness || { ready: false, score: 0, blockers: [], warnings: [] },
      revenue: revenue || { revenue: 0, orders: 0, aov: 0, epc: 0, visitors: 0, by_step: [], by_source: [], by_medium: [], by_campaign: [], trend: [], reconciled: true },
      access: access || [],
      opsLog: opsLog || { automation: [], abandoned_count: 0, promoted_count: 0 },
      entrants: entrants || { entrants: [], total: 0 },
      recommendations: recs || [],
      sourceOffer, compliance: compliance || { findings: [], high_count: 0, medium_count: 0, clear: true },
      jobRuns: jobRuns || [],
    };
  }
  // Read-only cross-funnel page-reuse index for the Pages landing view (D-182) —
  // no new schema, just a workspace-scoped read of funnel_steps.page_id already stored.
  async function loadPagesUsage() {
    const c = ensureClient();
    const { data } = await c.from("funnel_steps").select("page_id,funnel_id,name").not("page_id", "is", null);
    state.pagesUsage = data || [];
  }
  async function loadDetailRange(p_from, p_to) {
    const c = ensureClient(); const f = state.active; if (!f) return;
    const { data } = await c.rpc("funnel_revenue_summary", { p_funnel: f.id, p_from, p_to });
    if (data) state.active.revenue = data;
    render();
  }

  /* ── Router ──────────────────────────────────────────────────────────────────────
     Two distinct nav contexts share the "#/funnels/..." prefix:
       #/funnels                    → module landing, "Funnels" section (the grid)
       #/funnels/<moduleSection>    → module landing, one of MODULE_SECTIONS
       #/funnels/<id>/<tab>         → deep workspace for ONE funnel, one of FUNNEL_SECTIONS
     MODULE_SECTIONS is the reserved-word list that tells parseRoute which of the two a
     path segment means — a real funnel id never collides with these short words. ────── */
  const FUNNEL_SECTIONS = ["overview", "steps", "map", "variants", "optimization", "offers", "checkout", "compliance", "analytics", "attribution", "entrants",
    "crm", "automations", "operations", "team", "logs", "settings"];
  const MODULE_SECTIONS = ["overview", "templates", "studio", "pages", "analytics", "attribution", "automations", "settings"];
  function parseRoute() {
    const h = (location.hash || "#/funnels").replace(/^#/, "");
    const parts = h.split("/").filter(Boolean);
    if (parts[0] === "funnels" && parts[1] && !MODULE_SECTIONS.includes(parts[1])) {
      state.route = { name: "funnel", id: parts[1], tab: FUNNEL_SECTIONS.includes(parts[2]) ? parts[2] : "overview" };
    } else {
      state.route = { name: "module", section: (parts[0] === "funnels" && MODULE_SECTIONS.includes(parts[1])) ? parts[1] : "funnels" };
    }
  }
  window.addEventListener("hashchange", async () => {
    const prev = state.route.name === "funnel" ? state.route.id : null;
    parseRoute();
    if (state.route.name === "funnel" && state.route.id && connected() && state.route.id !== prev) {
      state.loading = true; render(); try { await loadDetail(state.route.id); } catch (e) { state.error = e.message; } state.loading = false;
    } else if (!connected() && state.route.name === "funnel") {
      state.active = state.funnels.find((f) => f.id === state.route.id) || null;
    } else if (state.route.name === "module" && state.route.section === "pages" && connected() && !state.pagesUsage) {
      state.loading = true; render(); try { await loadPagesUsage(); } catch (e) { state.error = e.message; } state.loading = false;
    }
    state.drawer = null;
    render();
  });

  /* ── Shell (rail + topbar) ───────────────────────────────────────────────── */
  // Module landing nav — stays shallow on purpose (Karpathy: don't overload the launchpad
  // with the deep per-funnel operating surface, that's FUNNEL_NAV below). "Acquisition" is
  // the shared suite label across M15 Forms/M16 Campaigns/M19 Sites/M20 Funnels (Master
  // Module List Phase 2 "Acquisition & Sites") — not renamed here, would desync from siblings.
  // Reordered/relabeled per the Funnels↔Affiliate-Hub IA pass (D-182): Attribution's
  // route/view is unchanged (folds into Analytics's existing UTM breakdowns per D-178)
  // and stays reachable at #/funnels/attribution — it's just no longer a top-level item.
  const NAV = [
    { key: "overview", label: "Overview", ico: "flag", hash: "#/funnels/overview" },
    { key: "funnels", label: "Funnels", ico: "funnel", hash: "#/funnels" },
    { key: "studio", label: "AI Funnel Studio", ico: "zap", hash: "#/funnels/studio" },
    { key: "templates", label: "Templates", ico: "layers", hash: "#/funnels/templates" },
    { key: "pages", label: "Pages", ico: "file", hash: "#/funnels/pages" },
    { key: "automations", label: "Automations", ico: "zap", hash: "#/funnels/automations" },
    { key: "analytics", label: "Analytics", ico: "chart", hash: "#/funnels/analytics" },
    { key: "settings", label: "Settings", ico: "settings", hash: "#/funnels/settings" },
  ];
  // Per-funnel rail nav (mirrors M19's per-site rail swap) — deep operating nav for ONE
  // funnel's workspace. Templates lives one level up, on the module landing page (MODULE_NAV
  // below) — duplicating/saving-as-template from inside a funnel is still possible, via the
  // "Duplication & templates" panel folded into Operations.
  const FUNNEL_NAV = [
    { key: "overview", label: "Overview", ico: "flag" },
    { key: "steps", label: "Steps", ico: "layers" },
    { key: "map", label: "Flow Map", ico: "funnel" },
    { key: "variants", label: "Variants", ico: "split" },
    { key: "optimization", label: "Optimization", ico: "trophy" },
    { key: "offers", label: "Offers", ico: "cart" },
    { key: "checkout", label: "Checkout", ico: "cart" },
    { key: "compliance", label: "Compliance", ico: "file" },
    { key: "analytics", label: "Analytics", ico: "chart" },
    { key: "attribution", label: "Attribution", ico: "link" },
    { key: "entrants", label: "Contacts", ico: "users" },
    { key: "crm", label: "CRM & Revenue", ico: "target" },
    { key: "automations", label: "Automations", ico: "zap" },
    { key: "operations", label: "Operations", ico: "settings" },
    { key: "team", label: "Team", ico: "users" },
    { key: "logs", label: "Logs", ico: "file" },
    { key: "settings", label: "Settings", ico: "edit" },
  ];
  function shell(activeKey, content) {
    const inFunnel = state.route.name === "funnel" && state.active;
    let nav, groupLabel, backLink = "";
    if (inFunnel) {
      const fid = state.active.id, tab = state.route.tab || "overview";
      nav = FUNNEL_NAV.map((n) => `<div class="nav-item ${n.key === tab ? "active" : ""}" data-hash="#/funnels/${fid}/${n.key}"><span class="ni-ico">${svg(n.ico)}</span><span>${n.label}</span></div>`).join("");
      groupLabel = state.active.name;
      backLink = `<div class="nav-item nav-back" data-hash="#/funnels"><span class="ni-ico">${svg("back", 15)}</span><span>All funnels</span></div>`;
    } else {
      nav = NAV.map((n) => `<div class="nav-item ${n.key === activeKey ? "active" : ""}" data-hash="${n.hash}"><span class="ni-ico">${svg(n.ico)}</span><span>${n.label}</span></div>`).join("");
      groupLabel = "Acquisition";
    }
    return `
      <aside class="rail" id="rail">
        <div class="brand"><span class="mark">✦</span><span><b>AiMind</b><em>Share</em></span></div>
        <div class="nav-group">${backLink}<div class="nav-group-label">${esc(groupLabel)}</div>${nav}</div>
        <div class="rail-foot">M20 · Funnels</div>
      </aside>
      <header class="tbar">
        <button class="icon-btn rail-burger" id="railBurger" aria-label="Menu">☰</button>
        <div class="ws-trigger" style="cursor:default">
          <span class="ws-badge">${esc(initials(state.workspaceName || "AiMindShare"))}</span>
          <span class="ws-meta"><span class="ws-name">${esc(state.workspaceName || "Workspace")}</span><span class="ws-kind">Funnels</span></span>
        </div>
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
      Connect a project to read live funnels, conversion stats &amp; A/B results. Sample data shown. Preview state:
      ${PREVIEW_STATES.map((s) => `<button class="link ${state.previewState === s ? "on" : ""}" data-preview="${s}">${s}</button>`).join(" ")}</div>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     List view
     ══════════════════════════════════════════════════════════════════════════ */
  function funnelStats(f) {
    const steps = f.steps || [];
    const optin = steps.find((s) => s.step_type === "optin") || steps[0];
    const order = steps.find((s) => s.step_type === "order");
    const visitors = optin?.visitors || 0;
    const optinRate = optin?.rate || 0;
    const orders = order?.conversions || 0;
    return { visitors, optinRate, orders };
  }
  /* ── Module landing dispatch ─────────────────────────────────────────────── */
  const MODULE_BODY = {
    funnels: viewList, overview: viewOverview, templates: viewTemplatesPage, studio: viewStudio,
    pages: viewPagesPage, analytics: viewAnalyticsPage, attribution: viewAttributionPage,
    automations: viewAutomationsPage, settings: viewSettingsPage,
  };
  function viewModule() {
    return (MODULE_BODY[state.route.section] || viewList)();
  }
  function moduleHead(title, sub, extra) {
    return `<div class="fn-head">
      <div><div class="eyebrow">${svg("funnel", 13)} Acquisition · M20</div>
        <div class="ph-title">${title}</div>
        ${sub ? `<div class="ph-sub">${sub}</div>` : ""}</div>
      <div class="spacer"></div>${extra || ""}
    </div>`;
  }
  function viewList() {
    if (st("loading")) return shell("funnels", loadingBlock());
    if (st("error")) return shell("funnels", errorBlock());
    const head = moduleHead("Conversion <em>funnels</em>",
      "Multi-step flows on your published pages — opt-in to order to upsell — with per-step conversion and A/B split testing.",
      canWrite() ? `<button class="btn btn-ghost" id="goStudio">${svg("zap", 15)} Generate with AI</button>
        <button class="btn btn-primary" id="newFunnel">${svg("plus", 15)} New funnel</button>` : "");
    const list = st("empty") ? [] : state.funnels.filter((x) => !x.is_template);
    let body;
    if (!list.length) {
      body = `<div class="panel"><div class="empty-state">
        <div class="es-ico">${svg("funnel", 24)}</div>
        <h3>Build your first funnel</h3>
        <p>A funnel chains your published pages into a conversion flow — opt-in, sales, order, upsell, thank-you — and tracks how visitors move through each step.</p>
        ${canWrite() ? `<button class="btn btn-primary es-cta" id="newFunnel2">${svg("plus", 14)} New funnel</button>` : ""}
      </div></div>`;
    } else {
      body = `<div class="fn-grid">${list.map(funnelCard).join("")}</div>`;
    }
    return shell("funnels", previewStrip() + head + body);
  }
  function viewOverview() {
    if (st("loading")) return shell("overview", loadingBlock());
    if (st("error")) return shell("overview", errorBlock());
    const g = st("empty") ? { visitors: 0, optins: 0, optin_rate: 0, orders: 0, revenue: 0, currency: "USD" } : (state.glance || {});
    const kpi = (tone, ico, val, label, delta) => `<div class="kpi ${tone || ""}"><div class="kpi-ico">${svg(ico)}</div>
      <div class="kpi-val">${val}</div><div class="kpi-label">${label}</div>${delta ? `<div class="kpi-delta ${delta.dir || ""}">${delta.text}</div>` : ""}</div>`;
    const glance = `<div class="rev-strip">
      ${kpi("", "users", fmtInt(g.visitors), "Visitors", { text: "into your funnels", dir: "" })}
      ${kpi("", "target", pct(g.optin_rate), "Opt-in rate", { text: `${fmtInt(g.optins)} leads`, dir: "up" })}
      ${kpi("", "cart", fmtInt(g.orders), "Orders", { text: "wired to payments", dir: "" })}
      ${kpi("kpi-featured", "trophy", money(g.revenue, g.currency), "Revenue", { text: "collected", dir: "up" })}
    </div>`;

    const live = st("empty") ? [] : state.funnels.filter((f) => !f.is_template && f.status === "active");
    const testing = st("empty") ? [] : state.funnels.filter((f) => !f.is_template && f.status === "testing");
    const staleDrafts = st("empty") ? [] : state.funnels.filter((f) => !f.is_template && f.status === "draft"
      && (Date.now() - new Date(f.created_at).getTime()) > 14 * 86400000);
    const liveInTest = live.filter((f) => f.test_mode);
    const attn = [];
    if (liveInTest.length) attn.push({ ico: "flag", tone: "warn", text: `${liveInTest.length} live funnel${liveInTest.length === 1 ? "" : "s"} still flagged test-mode — real visitors won't count toward revenue.`, f: liveInTest[0] });
    if (testing.length) attn.push({ ico: "split", tone: "", text: `${testing.length} A/B test${testing.length === 1 ? "" : "s"} running — check Variants for a winner.`, f: testing[0] });
    if (staleDrafts.length) attn.push({ ico: "layers", tone: "", text: `${staleDrafts.length} draft${staleDrafts.length === 1 ? "" : "s"} idle for 2+ weeks — finish or archive.`, f: staleDrafts[0] });
    const attnHtml = attn.length ? attn.map((a) => `<div class="access-row" ${a.f ? `data-hash="#/funnels/${a.f.id}/operations"` : ""} style="${a.f ? "cursor:pointer" : ""}">
        <span class="log-status ${a.tone === "warn" ? "failed" : ""}">${svg(a.ico, 13)}</span>
        <div style="flex:1;font-size:12.5px;color:var(--ink-700)">${a.text}</div>
      </div>`).join("") : `<p class="muted" style="font-size:12.5px">Nothing needs attention — every funnel is in good shape.</p>`;

    const liveList = live.slice(0, 5).map((f) => `<div class="access-row" data-hash="#/funnels/${f.id}" style="cursor:pointer">
        <div class="fc-ico" style="width:28px;height:28px;font-size:12px">${svg("funnel", 13)}</div>
        <div style="flex:1;min-width:0;font-size:12.5px;color:var(--ink-900)">${esc(f.name)}</div>
        <span class="st st-${f.status}">${esc(STATUS_LABEL[f.status] || f.status)}</span>
      </div>`).join("") || `<p class="muted" style="font-size:12.5px">No live funnels yet.</p>`;

    const head = moduleHead("Funnels <em>overview</em>", "Your acquisition health at a glance — jump into Funnels for the full list.",
      canWrite() ? `<button class="btn btn-primary" id="newFunnel">${svg("plus", 15)} New funnel</button>` : "");
    const cols = `<div class="fn-grid">
      <div class="panel"><div class="panel-head"><div class="ph-ico">${svg("flag", 15)}</div><h3>Attention needed</h3></div><div class="access-list">${attnHtml}</div></div>
      <div class="panel"><div class="panel-head"><div class="ph-ico">${svg("funnel", 15)}</div><h3>Live funnels</h3></div><div class="access-list">${liveList}</div>
        <button class="btn btn-ghost btn-sm" data-hash="#/funnels" style="margin-top:12px">All funnels →</button></div>
    </div>`;
    return shell("overview", previewStrip() + head + glance + cols);
  }
  function viewTemplatesPage() {
    if (st("loading")) return shell("templates", loadingBlock());
    if (st("error")) return shell("templates", errorBlock());
    const templates = st("empty") ? [] : state.funnels.filter((f) => f.is_template);
    const head = moduleHead("Funnel <em>templates</em>", "Reusable starting points saved from any funnel — use one to skip straight to a pre-built step chain.");
    const body = templates.length
      ? `<div class="fn-grid">${templates.map((t) => `<div class="panel fn-card" data-funnel="${t.id}">
          <div class="fc-top"><div class="fc-ico">${svg("gift", 19)}</div>
            <div style="min-width:0;flex:1"><div class="fc-name">${esc(t.name)}</div>
              <div class="fc-meta">${(t.steps || []).length} step${(t.steps || []).length === 1 ? "" : "s"}</div></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:14px">
            <button class="btn btn-primary btn-sm" data-usetmpl="${t.id}" style="flex:1">${svg("plus", 13)} Use template</button>
            ${canManage() ? `<button class="icon-btn" data-deltmpl="${t.id}" title="Delete template">${svg("trash", 14)}</button>` : ""}
          </div>
        </div>`).join("")}</div>`
      : `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("gift", 24)}</div>
          <h3>No templates yet</h3><p>Open any funnel's Operations tab (or its "⋯" menu here on Funnels) and choose "Save as template".</p></div></div>`;
    return shell("templates", previewStrip() + head + body);
  }
  function viewPagesPage() {
    if (st("loading")) return shell("pages", loadingBlock());
    if (st("error")) return shell("pages", errorBlock());
    const head = moduleHead("Pages", "Every page currently linked across this workspace's funnels — a read-only index so you can see reuse without leaving Funnels. Build/edit pages in Sites.");
    // Mockup: derive usage straight from funnels' embedded steps. Live: from the
    // lazily-loaded funnel_steps rows (loadPagesUsage) joined against state.pages/state.funnels.
    const usageByPage = {};
    if (!connected()) {
      (st("empty") ? [] : state.funnels).filter((f) => !f.is_template).forEach((f) => {
        (f.steps || []).filter((s) => s.page_id).forEach((s) => {
          (usageByPage[s.page_id] ||= { title: s.page_title || "Untitled page", uses: [] }).uses.push({ funnel_id: f.id, funnel_name: f.name, step_name: s.name });
        });
      });
    } else {
      const funnelById = Object.fromEntries(state.funnels.map((f) => [f.id, f]));
      const pageById = Object.fromEntries(state.pages.map((p) => [p.id, p]));
      (state.pagesUsage || []).forEach((row) => {
        const p = pageById[row.page_id]; const f = funnelById[row.funnel_id];
        (usageByPage[row.page_id] ||= { title: p?.title || "Untitled page", uses: [] }).uses.push({ funnel_id: row.funnel_id, funnel_name: f?.name || "—", step_name: row.name });
      });
    }
    const entries = Object.entries(usageByPage);
    const body = entries.length
      ? `<div class="panel"><div class="access-list">${entries.map(([pageId, p]) => `<div class="access-row">
          <div class="fc-ico" style="width:28px;height:28px;font-size:12px">${svg("file", 13)}</div>
          <div style="flex:1;min-width:0"><div style="font-size:12.5px;color:var(--ink-900)">${esc(p.title)}</div>
            <div style="font-size:11px;color:var(--ink-400)">${p.uses.map((u) => `${esc(u.funnel_name)} → ${esc(u.step_name)}`).join(" · ")}</div></div>
          <span class="st st-draft">${p.uses.length} use${p.uses.length === 1 ? "" : "s"}</span>
        </div>`).join("")}</div></div>`
      : `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("file", 24)}</div>
          <h3>No pages linked yet</h3><p>Once a funnel step links a page, it will show up here.</p></div></div>`;
    return shell("pages", previewStrip() + head + body);
  }
  function viewAnalyticsPage() {
    if (st("loading")) return shell("analytics", loadingBlock());
    if (st("error")) return shell("analytics", errorBlock());
    const g = st("empty") ? { visitors: 0, optins: 0, optin_rate: 0, orders: 0, revenue: 0, currency: "USD" } : (state.glance || {});
    const kpi = (tone, ico, val, label) => `<div class="kpi ${tone || ""}"><div class="kpi-ico">${svg(ico)}</div><div class="kpi-val">${val}</div><div class="kpi-label">${label}</div></div>`;
    const glance = `<div class="rev-strip">
      ${kpi("", "users", fmtInt(g.visitors), "Visitors")}${kpi("", "target", pct(g.optin_rate), "Opt-in rate")}
      ${kpi("", "cart", fmtInt(g.orders), "Orders")}${kpi("kpi-featured", "trophy", money(g.revenue, g.currency), "Revenue")}
    </div>`;
    const list = st("empty") ? [] : state.funnels.filter((f) => !f.is_template);
    const rows = list.length ? list.map((f) => `<div class="access-row">
        <div style="flex:1;min-width:0;font-size:12.5px;color:var(--ink-900)">${esc(f.name)}</div>
        <span class="st st-${f.status}">${esc(STATUS_LABEL[f.status] || f.status)}</span>
        <button class="btn btn-ghost btn-sm" data-hash="#/funnels/${f.id}/analytics">Open analytics →</button>
      </div>`).join("") : `<p class="muted" style="font-size:12.5px">Create a funnel to see its analytics here.</p>`;
    const head = moduleHead("Funnels <em>analytics</em>", "Workspace-wide totals above; per-funnel conversion waterfalls and revenue live inside each funnel.");
    return shell("analytics", previewStrip() + head + glance + `<div class="panel"><div class="panel-head"><div class="ph-ico">${svg("chart", 15)}</div><h3>By funnel</h3></div><div class="access-list">${rows}</div></div>`);
  }
  function viewAttributionPage() {
    if (st("loading")) return shell("attribution", loadingBlock());
    if (st("error")) return shell("attribution", errorBlock());
    const list = st("empty") ? [] : state.funnels.filter((f) => !f.is_template);
    const rows = list.length ? list.map((f) => `<div class="access-row">
        <div style="flex:1;min-width:0;font-size:12.5px;color:var(--ink-900)">${esc(f.name)}</div>
        <span class="st st-${f.status}">${esc(STATUS_LABEL[f.status] || f.status)}</span>
        <button class="btn btn-ghost btn-sm" data-hash="#/funnels/${f.id}/attribution">Open attribution →</button>
      </div>`).join("") : `<p class="muted" style="font-size:12.5px">Create a funnel to see its source attribution here.</p>`;
    const head = moduleHead("Traffic <em>attribution</em>", "UTM source/medium/campaign breakdown is tracked per funnel — pick one below for its full report.");
    return shell("attribution", previewStrip() + head + `<div class="panel"><div class="panel-head"><div class="ph-ico">${svg("link", 15)}</div><h3>By funnel</h3></div><div class="access-list">${rows}</div></div>`);
  }
  function viewAutomationsPage() {
    if (st("loading")) return shell("automations", loadingBlock());
    if (st("error")) return shell("automations", errorBlock());
    const TRIGGERS = ["funnel.entered", "step.completed", "form.submitted", "checkout.started", "payment.received",
      "upsell.accepted", "upsell.declined", "downsell.accepted", "downsell.declined", "test.winner_selected", "funnel.published", "cart.abandoned"];
    const list = st("empty") ? [] : state.funnels.filter((f) => !f.is_template);
    const rows = list.length ? list.map((f) => `<div class="access-row">
        <div style="flex:1;min-width:0;font-size:12.5px;color:var(--ink-900)">${esc(f.name)}</div>
        <span class="st st-${f.status}">${esc(STATUS_LABEL[f.status] || f.status)}</span>
        <button class="btn btn-ghost btn-sm" data-hash="#/funnels/${f.id}/automations">Open automations →</button>
      </div>`).join("") : `<p class="muted" style="font-size:12.5px">Create a funnel to connect workflows to it.</p>`;
    const head = moduleHead("Funnel <em>automations</em>", "Every funnel fires these events on the M13 automation bus — connect a workflow to any trigger from inside a funnel's Automations tab.");
    return shell("automations", previewStrip() + head
      + `<div class="panel"><div class="panel-head"><div class="ph-ico">${svg("zap", 15)}</div><h3>Trigger catalog</h3></div>
          <p class="mono" style="font-size:11.5px;color:var(--ink-400);line-height:2">${TRIGGERS.join(" · ")}</p></div>`
      + `<div class="panel" style="margin-top:18px"><div class="panel-head"><div class="ph-ico">${svg("funnel", 15)}</div><h3>By funnel</h3></div><div class="access-list">${rows}</div></div>`);
  }
  function viewSettingsPage() {
    const d = moduleDefaults();
    const head = moduleHead("Funnels <em>settings</em>", "Defaults applied when you create a new funnel. Stored on this device.");
    return shell("settings", previewStrip() + head + `<div class="panel" style="max-width:520px">
      <div class="panel-head"><div class="ph-ico">${svg("settings", 15)}</div><h3>New-funnel defaults</h3></div>
      <div class="form-field"><label>Default currency</label><input id="setDefCurrency" value="${esc(d.currency)}" style="max-width:120px" ${canManage() ? "" : "disabled"}></div>
      <div class="bump-toggle" style="margin-top:14px">
        <span style="color:var(--gold-500)">${svg("zap", 16)}</span>
        <div style="flex:1"><div style="font-size:13px;color:var(--ink-900)">Test mode by default</div>
          <div style="font-size:11.5px;color:var(--ink-400)">New funnels start in test mode until you turn it off in Operations.</div></div>
        <label style="font-size:12px;color:var(--ink-500)"><input type="checkbox" id="setDefTestMode" ${d.testModeDefault ? "checked" : ""} ${canManage() ? "" : "disabled"}> enabled</label>
      </div>
      ${canManage() ? `<button class="btn btn-primary" id="saveModuleSettings" style="margin-top:16px">${svg("check", 15)} Save</button>` : ""}
    </div>`);
  }
  /* ══════════════════════════════════════════════════════════════════════════
     AI Funnel Studio — a guided wizard that turns structured answers into a
     funnel blueprint (recommend_funnel_blueprint, D-173/D-174).

     The recommendation engine is a DETERMINISTIC decision matrix today, not a
     live model call — no LLM provider is decided anywhere in AiMindShare yet
     (same D-063 posture as M13's automation builder / M16's AI copywriter).
     `localRecommendBlueprint` below is a plain JS port of the SQL function so
     the wizard works identically in mockup mode; the single seam for a future
     LLM swap is the SQL function's body, not this file.
     ══════════════════════════════════════════════════════════════════════════ */
  const FUNNEL_TYPE_LABEL = {
    lead_magnet: "Lead Magnet Funnel", webinar: "Webinar Funnel", booking: "Appointment/Booking Funnel",
    application: "Application Funnel", vsl: "VSL Funnel", direct_checkout: "Direct-to-Checkout Funnel",
    tripwire: "Tripwire Funnel", low_ticket: "Low-Ticket Product Funnel", course_membership: "Course/Membership Funnel",
    product_launch: "Product Launch Funnel", quiz: "Quiz Funnel", challenge: "Challenge Funnel",
    affiliate_bridge: "Affiliate Bridge Funnel", affiliate_review: "Affiliate Review Funnel", affiliate_comparison: "Affiliate Comparison Funnel",
  };
  // Coarse UI categories -> engine-answer seeds + which extra guided fields to
  // show. The engine/LLM still decides the exact one of 15 funnel_type values
  // within the category picked here (D-187 refinement) — selecting a card
  // narrows the family, it doesn't hard-pick the type.
  const TYPE_CARDS = [
    { key: "lead_gen", label: "Lead Generation", ico: "mail", desc: "Capture leads with a free resource, quiz, or webinar.",
      seed: { objective: "leads", checkout_required: false, offer_price: 0 } },
    { key: "sales", label: "Sales", ico: "cart", desc: "Sell a product, service, or offer with a real checkout.",
      seed: { objective: "sales", checkout_required: true } },
    { key: "affiliate", label: "Affiliate", ico: "link", desc: "Promote someone else's offer and earn a commission.",
      seed: { offer_source: "affiliate" } },
    { key: "webinar", label: "Webinar", ico: "users", desc: "Fill a live or evergreen training, then pitch your offer.",
      seed: { objective: "webinar_signups" } },
    { key: "quiz", label: "Quiz", ico: "target", desc: "Segment visitors with a quiz, then show a matched offer.",
      seed: { objective: "quiz_leads" } },
    { key: "auto", label: "Let AI decide", ico: "zap", desc: "Not sure? Describe your funnel and we'll infer the best fit." },
  ];

  // Very small keyword parser: fills a few structured answers from free text so
  // the deterministic fallback (and the guided fields underneath the prompt)
  // has something sensible even before/without an LLM call. Real inference for
  // ambiguous prompts is the LLM's job (funnel-ai-generate); this only
  // recognizes unambiguous, common phrasing.
  function parsePromptToAnswers(text) {
    const t = (text || "").toLowerCase();
    const a = {};
    if (/\baffiliate\b|promote (someone|another)|commission/.test(t)) a.offer_source = "affiliate";
    if (/\bwebinar\b|\btraining\b|\bmasterclass\b/.test(t)) a.objective = "webinar_signups";
    else if (/\bquiz\b/.test(t)) a.objective = "quiz_leads";
    else if (/\bbook(ing|ed)? (a )?call\b|\bconsult/.test(t)) a.objective = "bookings";
    else if (/\bapplication\b|\bapply\b/.test(t)) a.objective = "applications";
    else if (/\bchallenge\b/.test(t)) a.objective = "challenge_signups";
    else if (/\bwaitlist\b|\blaunch\b/.test(t)) a.objective = "launch_waitlist";
    else if (/\blead(s)?\b|\bfree (guide|resource|ebook|checklist)\b/.test(t)) a.objective = "leads";
    else if (/\bsell\b|\bsale\b|\bbuy\b|\bcheckout\b/.test(t)) a.objective = "sales";
    const priceMatch = t.match(/\$\s?(\d[\d,]*)/);
    if (priceMatch) { a.offer_price = Number(priceMatch[1].replace(/,/g, "")); a.checkout_required = true; }
    return a;
  }

  // Plain JS mirror of funnel_compliance_scan (SQL, migration 0037) for mockup mode —
  // same fixed rule table, same categories/severities. See that function's header
  // comment for why this is deterministic pattern-matching, not NLP claim understanding.
  const COMPLIANCE_RULES = [
    { category: "income", pattern: /guaranteed income|get rich quick|make \$[0-9,]+ (a|per) (day|week)|quit your job/i,
      severity: "high", message: "Unrealistic/guaranteed income claim — high compliance risk on ad platforms.",
      rewrite_hint: "Describe potential, not guarantees — e.g. \"designed to help you build income\" rather than \"guaranteed income\"." },
    { category: "health", pattern: /cure[sd]?|miracle (cure|fix)|lose [0-9]+ ?(lbs|pounds|kg) in|melt (fat|belly fat)/i,
      severity: "high", message: "Unrealistic/medical outcome claim — high compliance risk (health category).",
      rewrite_hint: "Avoid cure/miracle language and specific timeframes — describe the approach, not a guaranteed result." },
    { category: "finance", pattern: /risk[- ]?free|no risk|100% guaranteed returns|double your money/i,
      severity: "high", message: "Unrealistic financial-outcome claim — high compliance risk (finance category).",
      rewrite_hint: "Financial outcomes vary — avoid \"risk-free\"/\"guaranteed returns\" language." },
    { category: "general", pattern: /only [0-9]+ (left|spots|seats) (in stock )?- act now|hurry,? (offer|sale) ends (today|soon)|last chance ever/i,
      severity: "medium", message: "Fake-urgency phrasing — flagged as a soft compliance/trust risk.",
      rewrite_hint: "Use urgency only if it is real (an actual deadline/stock count) or soften to \"limited availability\"." },
    { category: "general", pattern: /100% (results|success)|works for everyone|no effort required/i,
      severity: "medium", message: "Absolute outcome claim (\"100%\"/\"everyone\") — flagged as overpromising.",
      rewrite_hint: "Qualify the claim — e.g. \"most members see...\" instead of \"100% of people\"." },
  ];
  function localComplianceScan(steps) {
    const findings = [];
    (steps || []).forEach((s) => {
      const text = [s.name, s.config?.cta, s.config?.purpose].filter(Boolean).join(" ");
      COMPLIANCE_RULES.forEach((r) => {
        if (r.pattern.test(text)) findings.push({ step_id: s.id, step_name: s.name, category: r.category, severity: r.severity, message: r.message, rewrite_hint: r.rewrite_hint });
      });
    });
    return { findings, high_count: findings.filter((f) => f.severity === "high").length,
      medium_count: findings.filter((f) => f.severity === "medium").length, clear: findings.length === 0 };
  }
  function localRecommendBlueprint(a) {
    const price = Number(a.offer_price) || 0;
    const checkoutRequired = a.checkout_required != null ? !!a.checkout_required : price > 0;
    const disclosure = a.disclosure_required != null ? !!a.disclosure_required : true;
    let type;
    if (a.offer_source === "affiliate" && (a.traffic_source === "cold_paid" || ["unaware", "problem_aware"].includes(a.audience_awareness))) type = "affiliate_bridge";
    else if (a.offer_source === "affiliate" && a.audience_awareness === "solution_aware") type = "affiliate_comparison";
    else if (a.offer_source === "affiliate") type = "affiliate_review";
    else if (a.objective === "bookings") type = "booking";
    else if (a.objective === "applications") type = "application";
    else if (a.objective === "webinar_signups") type = "webinar";
    else if (a.objective === "quiz_leads") type = "quiz";
    else if (a.objective === "challenge_signups") type = "challenge";
    else if (a.objective === "launch_waitlist") type = "product_launch";
    else if (a.offer_type === "course" || a.offer_type === "membership") type = "course_membership";
    else if (!checkoutRequired || price === 0) type = "lead_magnet";
    else if (price > 0 && price < 100 && a.has_lead_magnet) type = "tripwire";
    else if (price > 0 && price < 500) type = "low_ticket";
    else if (a.traffic_source === "cold_paid" && ["unaware", "problem_aware"].includes(a.audience_awareness)) type = "vsl";
    else if (["product_aware", "most_aware"].includes(a.audience_awareness)) type = "direct_checkout";
    else type = "lead_magnet";

    const REASONING = {
      affiliate_bridge: "Cold or not-yet-aware traffic converts better on a pre-sell bridge page that builds context before sending them to the vendor's offer.",
      affiliate_review: "Warmer, more product-aware traffic responds well to an in-depth review that reinforces a decision they're already leaning toward.",
      affiliate_comparison: "Your audience knows solutions exist but is still comparing, so a comparison page that positions your pick clearly converts best.",
      booking: "Your goal is booked calls, so the whole funnel exists to get a qualified lead onto your calendar.",
      application: "You need to qualify people before they can buy or book, so an application step comes before any pitch.",
      webinar: "A live or evergreen webinar builds enough trust to pitch a real offer at the end, better than a cold sales page.",
      quiz: "A quiz lowers the barrier to opt in and lets you segment the offer by their answers.",
      challenge: "A multi-day challenge builds momentum and trust before the pitch, which suits this kind of offer.",
      product_launch: "A waitlist-first sequence builds anticipation before the cart opens.",
      course_membership: "Course/membership offers convert better with a dedicated sales page than a bare checkout.",
      lead_magnet: "No checkout is needed yet — the priority is building a list with a free resource.",
      tripwire: "A low price under $100 with a lead magnet available works well as a tripwire: capture the lead, convert on a small first purchase.",
      low_ticket: "This price point converts well straight off a dedicated sales page rather than a long-form video pitch.",
      vsl: "Cold, unaware-to-problem-aware traffic needs more persuasion before being asked to buy — a video sales letter does that work.",
      direct_checkout: "Your audience is already product-aware, so you can skip persuasion pages and go straight to checkout.",
    };
    const STEP = (step_type, role_label, cta_direction, purpose) => ({ step_type, role_label, cta_direction, purpose });
    const STEPS = {
      affiliate_bridge: [STEP("optin", "Bridge opt-in", "Get the free breakdown first", "Capture the lead before sending them to the vendor, so you can follow up if they don't buy."),
        STEP("sales", "Bridge page", "See the full breakdown & get access", "Warm the visitor up and set context before the external offer."),
        STEP("thankyou", "Continue to offer", "Continue to the offer", "Hand off to the vendor's page via your affiliate link (external).")],
      affiliate_review: [STEP("sales", "Review page", "Read the full review", "Give an in-depth, trust-building review of the offer."),
        STEP("thankyou", "Continue to offer", "Get it now", "Hand off to the vendor's page via your affiliate link (external).")],
      affiliate_comparison: [STEP("sales", "Comparison page", "See the comparison", "Compare this offer against alternatives and position your recommended pick."),
        STEP("thankyou", "Continue to offer", "Choose this option", "Hand off to the vendor's page via your affiliate link (external).")],
      lead_magnet: [STEP("optin", "Lead capture", "Get the free resource", "Capture name + email in exchange for the lead magnet."),
        STEP("thankyou", "Thank-you", "Confirm delivery, suggest the next step", "Deliver the resource and warm them toward your paid offer.")],
      webinar: [STEP("optin", "Webinar registration", "Save my seat", "Capture registrants for the live/evergreen session."),
        STEP("sales", "Webinar / replay", "Watch now", "Deliver the training that builds the case for your offer."),
        STEP("order", "Offer", "Get instant access", "Pitch the paid offer at the end of the training."),
        STEP("thankyou", "Thank-you", "What happens next", "Confirm and set expectations.")],
      booking: [STEP("optin", "Qualify", "Tell us about your situation", "Capture contact info + qualifying details."),
        STEP("sales", "Book a call", "Pick a time", "Embed your calendar and set expectations for the call."),
        STEP("thankyou", "Confirmed", "What to prepare", "Reduce no-shows with clear next steps.")],
      application: [STEP("optin", "Application", "Apply now", "Collect qualifying answers before any pitch."),
        STEP("sales", "What happens next", "Learn how it works", "Set expectations while the application is reviewed."),
        STEP("thankyou", "Received", "We will be in touch", "Confirm submission and timeline.")],
      vsl: [STEP("sales", "Video sales letter", "Watch to unlock the offer", "Build the full case for the offer before asking for the sale."),
        STEP("order", "Checkout", "Get it now", "Take the order."),
        STEP("upsell", "Upsell", "Add this for a one-time price", "Increase order value immediately after purchase."),
        STEP("downsell", "Downsell", "A smaller offer instead", "Recover value if the upsell is declined."),
        STEP("thankyou", "Thank-you", "Access instructions", "Deliver the purchase.")],
      direct_checkout: [STEP("order", "Checkout", "Buy now", "Your audience already knows the offer — take the order directly."),
        STEP("upsell", "Upsell", "Add this for a one-time price", "Increase order value immediately after purchase."),
        STEP("downsell", "Downsell", "A smaller offer instead", "Recover value if the upsell is declined."),
        STEP("thankyou", "Thank-you", "Access instructions", "Deliver the purchase.")],
      tripwire: [STEP("optin", "Lead capture", "Get the free resource", "Capture the lead with your free offer."),
        STEP("order", "Tripwire offer", "Add this for a small one-time price", "Convert the fresh lead into a first, low-risk buyer."),
        STEP("upsell", "Upsell", "Add this for a one-time price", "Increase order value while they are still buying."),
        STEP("thankyou", "Thank-you", "Access instructions", "Deliver the purchase.")],
      low_ticket: [STEP("sales", "Sales page", "Get it now", "Make the case for the offer at this price point."),
        STEP("order", "Checkout", "Complete your order", "Take the order."),
        STEP("upsell", "Upsell", "Add this for a one-time price", "Increase order value immediately after purchase."),
        STEP("downsell", "Downsell", "A smaller offer instead", "Recover value if the upsell is declined."),
        STEP("thankyou", "Thank-you", "Access instructions", "Deliver the purchase.")],
      course_membership: [STEP("sales", "Sales page", "Enroll now", "Make the full case for the course/membership."),
        STEP("order", "Checkout", "Complete enrollment", "Take the order."),
        STEP("upsell", "Upsell", "Add this for a one-time price", "Offer a complementary upgrade at the moment of highest intent."),
        STEP("thankyou", "Welcome", "Get started", "Deliver access and set onboarding expectations.")],
      product_launch: [STEP("optin", "Waitlist", "Get early access", "Build anticipation and capture interest before the cart opens."),
        STEP("sales", "Launch reveal", "See what's inside", "Reveal the offer to your warmed-up waitlist."),
        STEP("order", "Checkout", "Get it now", "Take the order during the launch window."),
        STEP("thankyou", "Thank-you", "Access instructions", "Deliver the purchase.")],
      quiz: [STEP("optin", "Quiz", "Take the quiz", "Lower the barrier to opt in and segment by answers."),
        STEP("sales", "Personalized result", "See your result + recommendation", "Pitch the offer that matches their quiz answers."),
        STEP("order", "Checkout", "Get it now", "Take the order."),
        STEP("thankyou", "Thank-you", "Access instructions", "Deliver the purchase.")],
      challenge: [STEP("optin", "Challenge signup", "Join the challenge", "Capture signups for the challenge."),
        STEP("sales", "Challenge + pitch", "Continue your progress", "Deliver value daily and build the case for the paid offer."),
        STEP("order", "Checkout", "Get it now", "Take the order at the challenge's close."),
        STEP("thankyou", "Thank-you", "Access instructions", "Deliver the purchase.")],
    };
    const bump = ["tripwire", "low_ticket", "vsl", "direct_checkout"].includes(type);
    const upsell = ["tripwire", "low_ticket", "vsl", "direct_checkout", "course_membership"].includes(type);
    const downsell = ["low_ticket", "vsl", "direct_checkout"].includes(type);
    const isAffiliate = ["affiliate_bridge", "affiliate_review", "affiliate_comparison"].includes(type);
    const tests = isAffiliate
      ? ["Test the bridge/review headline against a curiosity-led alternative.",
         "Test disclosure placement (top vs. bottom of page) for compliance and trust.", "Test the outbound CTA copy driving to the vendor offer."]
      : ["vsl", "low_ticket", "direct_checkout", "tripwire"].includes(type)
      ? ["Test the headline on the sales/checkout step against a benefit-led alternative.",
         "Test adding (or removing) the order bump to see its effect on AOV.", "Test a shorter vs. longer sales page for this offer."]
      : ["lead_magnet", "webinar", "quiz", "challenge"].includes(type)
      ? ["Test the opt-in headline against a curiosity-led alternative.", "Test a 1-field form (email only) against your current form length.", "Test the CTA button copy on the opt-in step."]
      : ["Test the primary CTA copy on your first step.", "Test the headline on your first step."];
    const checklist = [isAffiliate ? "No payment wiring needed — the sale/checkout happens on the vendor's site."
      : checkoutRequired ? "Confirm your M28 payment wiring is connected before going live." : "No payment wiring needed for this funnel type.",
      "Make sure every step has a published page linked before launch.",
      "Review the Launch Readiness checks in Operations before switching this funnel to Live."];
    if (bump) checklist.push("Decide on your order bump offer and price before launch.");
    if (isAffiliate && disclosure) checklist.push("Add an affiliate disclosure per FTC guidelines before publishing — do not imply you own this product.");

    return { funnel_type: type, reasoning: REASONING[type] || "Default recommendation based on a straightforward opt-in-first flow.",
      steps: STEPS[type] || STEPS.lead_magnet, order_bump_suggested: bump, upsell_suggested: upsell, downsell_suggested: downsell,
      test_ideas: tests, launch_checklist_emphasis: checklist };
  }
  const OFFER_PREFILL_KEY = "aimindshare-offer-prefill"; // written by M29 Affiliate Hub's "Create Funnel from Offer"
  function consumeOfferPrefill() {
    // One-time read: an M29 offer's "Create Funnel from Offer" writes this key then
    // navigates here. Consumed (removed) immediately so it never re-applies on a
    // later, unrelated Studio visit.
    try {
      const raw = localStorage.getItem(OFFER_PREFILL_KEY);
      if (!raw) return null;
      localStorage.removeItem(OFFER_PREFILL_KEY);
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function ensureStudio() {
    if (!state.studio) {
      state.studio = {
        stage: "landing", prompt: "", selectedType: null, answers: {},
        clarifyQuestions: null, clarifyAnswers: [], generating: false,
        blueprint: null, blueprintId: null,
        generationSource: null, llmModel: null, tokensUsed: null,
        funnelName: "", recent: [], recentLoaded: false,
      };
      const prefill = consumeOfferPrefill();
      if (prefill) {
        state.studio.answers = { niche: prefill.niche || "", offer_source: "affiliate", affiliate_vendor: prefill.affiliate_vendor || "",
          affiliate_url: prefill.affiliate_url || "", commission_note: prefill.commission_note || "", disclosure_required: true,
          offer_id: prefill.offer_id, offer_name: prefill.offer_name };
        state.studio.selectedType = "affiliate";
        state.studio.prompt = `Build an affiliate funnel promoting ${prefill.offer_name}${prefill.affiliate_vendor ? " via " + prefill.affiliate_vendor : ""}.`;
        toast(`Pre-filled from "${prefill.offer_name}" — review and generate.`, "info");
      }
    }
    return state.studio;
  }
  function studioExampleChips() {
    const examples = [
      "Create a lead generation funnel for a roofing company in Toronto",
      "Build an affiliate funnel for a keto meal offer aimed at busy moms",
      "Make a webinar funnel for a Quran learning workshop",
      "Create a quiz funnel for travel deal personalization",
    ];
    return `<div class="st-suggest">${examples.map((e) => `<button class="st-chip" data-studiochip="${esc(e)}">${esc(e)}</button>`).join("")}</div>`;
  }
  // Quick-start cards below the hero — same component as M19's sitesQuickCreate()
  // (.st-quick/.qa-card), same 6-card slot: 5 funnel-type cards + a conditional
  // "Continue recent funnel" card (omitted entirely when there's no recent
  // blueprint yet, mirroring M19's own "Continue Recent" pattern). Clicking a
  // type card still just toggles s.selectedType via the unchanged [data-studiotype]
  // wiring in wireStudio(); the recent card reuses the existing [data-studioreopen]
  // handler — no new event wiring needed for either.
  function studioTypeCards(s) {
    const recent = s.recent && s.recent.length ? s.recent[0] : null;
    const typeCards = TYPE_CARDS.filter((c) => c.key !== "auto").map((c) => `
      <button class="qa-card ${s.selectedType === c.key ? "on" : ""}" data-studiotype="${c.key}">
        <span class="qa-ico">${svg(c.ico, 18)}</span><b>${esc(c.label)} funnel</b><span>${esc(c.desc)}</span>
      </button>`).join("");
    const recentCard = recent ? `
      <button class="qa-card" data-studioreopen="${recent.id}">
        <span class="qa-ico">${svg("zap", 18)}</span><b>Continue recent funnel</b><span>Pick up "${esc(FUNNEL_TYPE_LABEL[recent.blueprint?.funnel_type] || "your last draft")}" where you left off.</span>
      </button>` : "";
    return `<div class="st-quick reveal">${typeCards}${recentCard}</div>`;
  }
  function studioGuidedFields(s) {
    const cat = s.selectedType && s.selectedType !== "auto" ? s.selectedType : null;
    return `<div class="studio-guided">
      ${studioField("Your niche / business", `<input id="sgNiche" placeholder="e.g. Ramadan meal-prep coaching" value="${esc(s.answers.niche || "")}">`)}
      ${cat === "sales" || cat === "affiliate" ? studioField("Price (0 if free)", `<input id="sgPrice" class="num" type="number" min="0" step="1" value="${esc(s.answers.offer_price ?? "")}" style="max-width:140px">`) : ""}
      ${cat === "webinar" ? studioField("Webinar topic", `<input id="sgWebinarTopic" placeholder="e.g. 5-day Quran reading fundamentals" value="${esc(s.answers.webinar_topic || "")}">`) : ""}
      ${cat === "quiz" ? studioField("What should the quiz segment on?", `<input id="sgQuizGoal" placeholder="e.g. travel style, budget, destination type" value="${esc(s.answers.quiz_segmentation || "")}">`) : ""}
      ${cat === "affiliate" ? offerSourceToggle({ answers: { ...s.answers, offer_source: "affiliate" } }) : ""}
    </div>`;
  }
  function studioAdvancedFields(s) {
    return `<details class="studio-advanced">
      <summary>Advanced options</summary>
      <div class="studio-advanced-body">
        ${studioField("Main traffic source", `<select id="sgTraffic">
          <option value="">Not sure yet</option>
          ${[["cold_paid", "Cold paid traffic"], ["warm_email", "Warm email list"], ["organic_social", "Organic social"], ["referral", "Referral / word of mouth"]]
            .map(([v, l]) => `<option value="${v}" ${s.answers.traffic_source === v ? "selected" : ""}>${l}</option>`).join("")}</select>`)}
        ${studioField("How aware is your audience?", `<select id="sgAwareness">
          <option value="">Not sure yet</option>
          ${[["unaware", "Unaware they have this problem"], ["problem_aware", "Aware of the problem, not the solution"],
             ["solution_aware", "Aware solutions exist"], ["product_aware", "Aware of your product specifically"], ["most_aware", "Ready to buy"]]
            .map(([v, l]) => `<option value="${v}" ${s.answers.audience_awareness === v ? "selected" : ""}>${l}</option>`).join("")}</select>`)}
        ${studioField("I already have a free lead magnet", `<input type="checkbox" id="sgLeadMagnet" ${s.answers.has_lead_magnet ? "checked" : ""}>`)}
        ${s.selectedType !== "affiliate" ? offerSourceToggle(s) : ""}
      </div>
    </details>`;
  }
  function studioClarifyBlock(s) {
    if (!s.clarifyQuestions || !s.clarifyQuestions.length) return "";
    return `<div class="studio-clarify">${s.clarifyQuestions.map((q, qi) => `
      <div class="studio-clarify-q">
        <div class="scq-text">${esc(q.question)}</div>
        <div class="scq-chips">${q.chips.map((c) => `<button class="studio-chip" data-clarifyanswer="${qi}" data-clarifyvalue="${esc(c)}">${esc(c)}</button>`).join("")}
          <input class="scq-custom" data-clarifycustom="${qi}" placeholder="Type your own…">
        </div>
      </div>`).join("")}</div>`;
  }
  function studioHowItWorks() {
    return `<div class="studio-how">
      <div class="studio-how-step"><div class="shw-n">1</div><div class="shw-title">Describe your funnel</div><div class="shw-sub">Type a sentence or pick guided fields.</div></div>
      <div class="studio-how-step"><div class="shw-n">2</div><div class="shw-title">AI generates the structure</div><div class="shw-sub">Steps, copy direction, and CTAs, mapped to your goal.</div></div>
      <div class="studio-how-step"><div class="shw-n">3</div><div class="shw-title">Review, edit, and launch</div><div class="shw-sub">Approve the blueprint, then edit it like any funnel.</div></div>
    </div>`;
  }
  function studioRecentSection(s) {
    const recentBlock = s.recent.length ? `
      <div class="panel-head"><h3>Recent generations</h3></div>
      <div class="access-list">${s.recent.map((r) => `<div class="access-row" data-studioreopen="${r.id}">
        <div class="fc-ico" style="width:28px;height:28px;font-size:12px">${svg("zap", 13)}</div>
        <div style="flex:1;min-width:0"><div style="font-size:12.5px;color:var(--ink-900)">${esc(FUNNEL_TYPE_LABEL[r.blueprint?.funnel_type] || "Draft")}</div>
          <div style="font-size:11px;color:var(--ink-400)">${esc(r.status)} · ${new Date(r.created_at).toLocaleDateString()}</div></div>
      </div>`).join("")}</div>` : "";
    return `<div class="studio-recent">
      ${recentBlock}
      <a class="link studio-templates-link" href="#/funnels/templates">${svg("layers", 13)} Browse funnel templates instead →</a>
    </div>`;
  }
  async function loadStudioRecent() {
    const s = ensureStudio();
    if (s.recentLoaded || !connected()) return;
    s.recentLoaded = true;
    const c = ensureClient();
    const { data } = await c.from("funnel_blueprints").select("id,status,blueprint,answers,generation_source,llm_model,tokens_used,created_at")
      .eq("workspace_id", state.workspaceId).order("created_at", { ascending: false }).limit(5);
    if (data) { s.recent = data; render(); }
  }
  function offerSourceToggle(s) {
    const src = s.answers.offer_source || "own_product";
    return `${studioField("Who owns this offer?", `<div class="studio-offersource">
        <label><input type="radio" name="stOfferSource" value="own_product" ${src !== "affiliate" ? "checked" : ""}> Own product / service</label>
        <label><input type="radio" name="stOfferSource" value="affiliate" ${src === "affiliate" ? "checked" : ""}> Affiliate offer</label>
      </div>`)}
      ${src === "affiliate" ? `
        ${studioField("Affiliate vendor / network", `<input id="stAffVendor" placeholder="e.g. ClickBank, PartnerStack, direct vendor" value="${esc(s.answers.affiliate_vendor || "")}">`)}
        ${studioField("Product / affiliate link", `<input id="stAffUrl" placeholder="https://…" value="${esc(s.answers.affiliate_url || "")}">`)}
        ${studioField("Commission / bonus angle (optional)", `<input id="stAffCommission" placeholder="e.g. 40% recurring, bonus stack" value="${esc(s.answers.commission_note || "")}">`)}
        <div class="bump-toggle"><span style="color:var(--gold-500)">${svg("info", 16)}</span>
          <div style="flex:1"><div style="font-size:13px;color:var(--ink-900)">Show an affiliate disclosure notice on this funnel</div></div>
          <label><input type="checkbox" id="stAffDisclosure" ${s.answers.disclosure_required !== false ? "checked" : ""}></label></div>
      ` : ""}`;
  }
  function readOfferSource() {
    const s = ensureStudio();
    const checked = $("input[name='stOfferSource']:checked")?.value;
    if (checked) s.answers.offer_source = checked;
    // Guard on the field actually being in the DOM: the radio's own "change" event fires
    // before the affiliate fields it reveals exist yet, so reading them then would wipe
    // disclosure_required to false instead of leaving it at its true-by-default state.
    if (s.answers.offer_source === "affiliate" && $("#stAffVendor")) {
      s.answers.affiliate_vendor = $("#stAffVendor")?.value.trim();
      s.answers.affiliate_url = $("#stAffUrl")?.value.trim();
      s.answers.commission_note = $("#stAffCommission")?.value.trim();
      s.answers.disclosure_required = !!$("#stAffDisclosure")?.checked;
    }
  }
  function studioField(label, inner) { return `<div class="form-field">${label ? `<label>${label}</label>` : ""}${inner}</div>`; }
  // Read the envelope message out of a Supabase FunctionsHttpError (non-2xx body).
  async function readFnError(error) {
    try { const body = await error.context.json(); return body?.message || body?.error || error.message; }
    catch (e) { return error?.message || "Request failed"; }
  }
  function viewStudio() {
    const s = ensureStudio();
    let body;
    if (s.stage === "blueprint") {
      const head = moduleHead("AI Funnel <em>Studio</em>", "Describe your funnel in one sentence, or use guided fields — review the blueprint, then launch a working funnel.");
      const bp = s.blueprint;
      body = bp ? `
        <div class="studio-result">
          <div class="studio-badge">${svg("zap", 13)} ${esc(FUNNEL_TYPE_LABEL[bp.funnel_type] || bp.funnel_type)}</div>
          <span class="st ${s.generationSource === "llm" ? "st-active" : "st-testing"}" style="margin-left:8px">${s.generationSource === "llm" ? "AI-generated" : "Quick-match"}</span>
          <button class="link" id="studioChangeType" style="margin-left:10px;font-size:12px" ${s.generating ? "disabled" : ""}>Change type</button>
          ${String(bp.funnel_type || "").indexOf("affiliate_") === 0 ? `<div class="studio-affiliate-note">${svg("info", 13)} Affiliate offer — remember to add a compliant disclosure and never imply you own this product.</div>` : ""}
          <p class="muted" style="font-size:13px;margin:10px 0 16px">${esc(bp.reasoning)}</p>
          <div class="access-list">${bp.steps.map((st, i) => `<div class="access-row">
              <div class="fc-ico" style="width:28px;height:28px;font-size:12px">${svg(TYPE_ICO[st.step_type] || "file", 13)}</div>
              <div style="flex:1;min-width:0"><div style="font-size:12.5px;color:var(--ink-900)">${i + 1}. ${esc(st.role_label)}</div>
                <div style="font-size:11px;color:var(--ink-400)">${TYPE_LABEL[st.step_type]} · CTA: "${esc(st.cta_direction)}" — ${esc(st.purpose)}</div></div>
            </div>`).join("")}</div>
          <div style="display:flex;gap:8px;margin:14px 0;flex-wrap:wrap">
            ${bp.order_bump_suggested ? `<span class="st st-testing">Order bump suggested</span>` : ""}
            ${bp.upsell_suggested ? `<span class="st st-testing">Upsell suggested</span>` : ""}
            ${bp.downsell_suggested ? `<span class="st st-testing">Downsell suggested</span>` : ""}
          </div>
          <div class="panel-head" style="margin-top:4px"><h3 style="font-size:12.5px">First test ideas</h3></div>
          <ul class="readiness-list warnings">${bp.test_ideas.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
          <div class="panel-head" style="margin-top:4px"><h3 style="font-size:12.5px">Launch checklist emphasis</h3></div>
          <ul class="readiness-list warnings">${bp.launch_checklist_emphasis.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
        </div>
        ${studioField("Name this funnel", `<input id="stFunnelName" placeholder="e.g. ${esc(s.answers.niche || "My")} Funnel" value="${esc(s.funnelName)}">`)}
        <div class="mc-foot" style="border-top:none;padding-top:14px">
          <button class="btn btn-ghost" id="studioBack" ${s.generating ? "disabled" : ""}>${svg("back", 14)} Back</button>
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost" id="studioRegenerate" ${s.generating ? "disabled" : ""}>${svg("zap", 14)} ${s.generating ? "Generating…" : "Regenerate"}</button>
            <button class="btn btn-primary" id="studioApprove" ${s.generating ? "disabled" : ""}>${svg("check", 15)} Approve &amp; generate funnel</button>
          </div>
        </div>` : `<p class="muted">Generating your blueprint…</p>`;
      return shell("studio", previewStrip() + head + `<div class="panel studio-panel-wide">${body}</div>`);
    }
    // stage === "landing" — hero mirrors M19's AI Website Studio hero (st-hero/
    // st-composer/st-quick/qa-card, D-187 refinement): the hero is the page
    // header itself, no separate moduleHead above it.
    body = `
      <div class="st-hero reveal">
        <div class="st-hero-in">
          <span class="st-eyebrow">${svg("zap", 12)} AI-powered funnel builder</span>
          <h1>Build funnels <em>with AI</em></h1>
          <p class="st-lead">One sentence is enough — AI Funnel Studio infers the type, structure, and copy direction.</p>
          <div class="st-composer" data-composer id="stComposer">
            <textarea id="stPrompt" placeholder="e.g. Create a lead generation funnel for a roofing company in Toronto">${esc(s.prompt || "")}</textarea>
            <div class="st-comp-bar">
              <span class="cb-hint">A detailed sentence gives the best result</span>
              <span class="spacer"></span>
              <button class="cb-send" id="studioGenerate" ${s.generating ? "disabled" : ""}>${svg("zap", 16)} ${s.generating ? "Generating…" : "Generate Funnel"}</button>
            </div>
          </div>
          ${studioClarifyBlock(s)}
          ${studioExampleChips()}
          <button class="st-link" id="studioStartScratch" style="margin-top:14px">${svg("file", 13)} Prefer to start from scratch?</button>
        </div>
      </div>
      ${studioTypeCards(s)}
      <div class="panel studio-panel-wide">
        <div class="panel-head"><h3>Guided setup</h3></div>
        ${studioGuidedFields(s)}
        ${studioAdvancedFields(s)}
        ${studioHowItWorks()}
        ${studioRecentSection(s)}
      </div>
    `;
    return shell("studio", previewStrip() + body);
  }
  function readStudioAnswers() {
    const s = ensureStudio();
    s.prompt = $("#stPrompt")?.value ?? s.prompt;
    if ($("#sgNiche")) s.answers.niche = $("#sgNiche").value.trim();
    if ($("#sgPrice")) { s.answers.offer_price = Number($("#sgPrice").value) || 0; s.answers.checkout_required = s.answers.offer_source === "affiliate" ? false : s.answers.offer_price > 0; }
    if ($("#sgWebinarTopic")) s.answers.webinar_topic = $("#sgWebinarTopic").value.trim();
    if ($("#sgQuizGoal")) s.answers.quiz_segmentation = $("#sgQuizGoal").value.trim();
    if ($("#sgTraffic")) s.answers.traffic_source = $("#sgTraffic").value || undefined;
    if ($("#sgAwareness")) s.answers.audience_awareness = $("#sgAwareness").value || undefined;
    if ($("#sgLeadMagnet")) s.answers.has_lead_magnet = !!$("#sgLeadMagnet").checked;
    readOfferSource();
  }
  async function generateStudioBlueprint() {
    const s = ensureStudio();
    readStudioAnswers();
    const seed = TYPE_CARDS.find((c) => c.key === s.selectedType)?.seed || {};
    const promptAnswers = s.prompt ? parsePromptToAnswers(s.prompt) : {};
    const mergedAnswers = { ...promptAnswers, ...seed, ...s.answers };
    s.clarifyQuestions = null;
    s.generating = true;
    render();
    let result;
    try {
      if (!connected()) {
        result = { kind: "blueprint", blueprint: localRecommendBlueprint(mergedAnswers), generation_source: "deterministic", model: null, tokens_used: null };
      } else {
        const c = ensureClient();
        const { data, error } = await c.functions.invoke("funnel-ai-generate", {
          body: { workspace_id: state.workspaceId, prompt: s.prompt || null, guided_answers: mergedAnswers, funnel_type_hint: s.selectedType && s.selectedType !== "auto" ? s.selectedType : null },
        });
        if (error) throw error;
        result = data?.data || data;
      }
    } catch (e) {
      s.generating = false;
      const msg = e?.context ? await readFnError(e) : (e?.message || "Blueprint generation failed");
      toast(msg, "danger");
      render();
      return;
    }
    s.generating = false;
    if (result.kind === "clarify") { s.clarifyQuestions = result.questions; render(); return; }
    s.answers = mergedAnswers;
    s.blueprint = result.blueprint;
    s.generationSource = result.generation_source;
    s.llmModel = result.model || null;
    s.tokensUsed = result.tokens_used || null;
    s.stage = "blueprint";
    if (!s.funnelName) s.funnelName = (s.answers.niche ? s.answers.niche + " " : "") + (FUNNEL_TYPE_LABEL[result.blueprint.funnel_type] || "Funnel");
    if (connected()) {
      const c = ensureClient();
      const { data, error } = await c.rpc("save_funnel_blueprint", {
        p_ws: state.workspaceId, p_answers: s.answers, p_blueprint: s.blueprint, p_blueprint_id: s.blueprintId,
        p_generation_source: s.generationSource, p_llm_model: s.llmModel, p_tokens_used: s.tokensUsed,
      });
      if (!error && data) s.blueprintId = data.id;
      else if (error) toast("Blueprint generated but not saved — regenerate again before approving.", "danger");
    }
    render();
  }
  async function approveAndGenerateFunnel() {
    const s = ensureStudio();
    s.funnelName = $("#stFunnelName")?.value.trim() || s.funnelName;
    if (!s.funnelName) { toast("Name this funnel first.", "danger"); return; }
    if (!connected()) {
      const id = "fn" + Date.now();
      state.funnels.unshift({ id, name: s.funnelName, status: "draft", funnel_type: s.blueprint.funnel_type, currency: "USD", settings: {}, split: null,
        source_offer_id: s.answers.offer_id || null, source_offer_name: s.answers.offer_name || null,
        steps: s.blueprint.steps.map((st, i) => ({ id: id + "-s" + i, step_order: i, step_type: st.step_type, name: st.role_label, page_id: null, config: { cta: st.cta_direction, purpose: st.purpose } })) });
      state.studio = null;
      toast("Funnel generated from blueprint.", "success");
      location.hash = "#/funnels/" + id;
      return;
    }
    try {
      const c = ensureClient();
      await c.rpc("approve_funnel_blueprint", { p_blueprint_id: s.blueprintId });
      const { data, error } = await c.rpc("convert_blueprint_to_funnel", { p_blueprint_id: s.blueprintId, p_name: s.funnelName, p_source_offer_id: s.answers.offer_id || null });
      if (error) throw error;
      state.studio = null;
      toast("Funnel generated from blueprint.", "success");
      await loadFunnels(state.workspaceId);
      location.hash = "#/funnels/" + data.id;
    } catch (e) { toast("Generate failed: " + e.message, "danger"); }
  }
  function wireStudio() {
    const s = ensureStudio();
    loadStudioRecent();
    $$("[data-studiochip]").forEach((el) => el.addEventListener("click", () => { $("#stPrompt").value = el.dataset.studiochip; s.prompt = el.dataset.studiochip; }));
    $$("[data-studiotype]").forEach((el) => el.addEventListener("click", () => {
      readStudioAnswers();
      s.selectedType = s.selectedType === el.dataset.studiotype ? null : el.dataset.studiotype;
      const seed = TYPE_CARDS.find((c) => c.key === s.selectedType)?.seed || {};
      s.answers = { ...s.answers, ...seed };
      render();
    }));
    $$("input[name='stOfferSource']").forEach((el) => el.addEventListener("change", () => { readStudioAnswers(); render(); }));
    $("#studioStartScratch")?.addEventListener("click", () => { state.studio = null; newFunnelModal(); });
    $$("[data-clarifyanswer]").forEach((el) => el.addEventListener("click", () => {
      const qi = Number(el.dataset.clarifyanswer);
      s.clarifyAnswers[qi] = el.dataset.clarifyvalue;
      if (s.clarifyQuestions.every((_, i) => s.clarifyAnswers[i])) {
        s.prompt = (s.prompt || "") + " " + s.clarifyQuestions.map((q, i) => `${q.question} ${s.clarifyAnswers[i]}`).join(" ");
        s.clarifyQuestions = null; s.clarifyAnswers = [];
        generateStudioBlueprint();
      } else render();
    }));
    $$("[data-clarifycustom]").forEach((el) => el.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" || !el.value.trim()) return;
      const qi = Number(el.dataset.clarifycustom);
      s.clarifyAnswers[qi] = el.value.trim();
      if (s.clarifyQuestions.every((_, i) => s.clarifyAnswers[i])) {
        s.prompt = (s.prompt || "") + " " + s.clarifyQuestions.map((q, i) => `${q.question} ${s.clarifyAnswers[i]}`).join(" ");
        s.clarifyQuestions = null; s.clarifyAnswers = [];
        generateStudioBlueprint();
      } else render();
    }));
    $("#studioGenerate")?.addEventListener("click", generateStudioBlueprint);
    $("#studioRegenerate")?.addEventListener("click", generateStudioBlueprint);
    $("#studioApprove")?.addEventListener("click", approveAndGenerateFunnel);
    $("#studioBack")?.addEventListener("click", () => { s.stage = "landing"; render(); });
    $("#studioChangeType")?.addEventListener("click", () => { s.stage = "landing"; s.blueprint = null; render(); });
    $$("[data-studioreopen]").forEach((el) => el.addEventListener("click", () => {
      const row = s.recent.find((r) => r.id === el.dataset.studioreopen);
      if (!row) return;
      s.answers = row.answers || {}; s.blueprint = row.blueprint; s.blueprintId = row.id;
      s.generationSource = row.generation_source; s.llmModel = row.llm_model; s.tokensUsed = row.tokens_used;
      s.stage = "blueprint"; render();
    }));
  }
  function funnelCard(f) {
    const s = funnelStats(f);
    const stepCount = (f.steps || []).length;
    const menuOpen = state.cardMenu === f.id;
    return `<div class="panel fn-card" data-funnel="${f.id}">
      <div class="fc-top">
        <div class="fc-ico">${svg("funnel", 19)}</div>
        <div style="min-width:0;flex:1">
          <div class="fc-name">${esc(f.name)}</div>
          <div class="fc-meta">${stepCount} step${stepCount === 1 ? "" : "s"} · ${esc((f.steps || []).map((x) => TYPE_LABEL[x.step_type]).slice(0, 3).join(" → ") || "no steps yet")}</div>
        </div>
        <span class="st st-${f.status}">${esc(STATUS_LABEL[f.status] || f.status)}</span>
        ${f.test_mode ? `<span class="test-badge">Test</span>` : ""}
        ${canWrite() ? `<div style="position:relative">
          <button class="icon-btn fc-menu-btn" data-cardmenu="${f.id}" title="More" aria-label="More">⋯</button>
          ${menuOpen ? `<div class="fc-menu">
            <button data-dupfunnel="${f.id}">${svg("layers", 13)} Duplicate</button>
            <button data-tmplfunnel="${f.id}">${svg("gift", 13)} Save as template</button>
          </div>` : ""}
        </div>` : ""}
      </div>
      <div class="fc-stats">
        <div class="fc-stat"><div class="fs-val">${fmtInt(s.visitors)}</div><div class="fs-label">Visitors</div></div>
        <div class="fc-stat"><div class="fs-val">${pct(s.optinRate)}</div><div class="fs-label">Opt-in</div></div>
        <div class="fc-stat"><div class="fs-val fc-rev">${fmtInt(s.orders)}</div><div class="fs-label">Orders</div></div>
      </div>
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Funnel detail — map / analytics / settings
     ══════════════════════════════════════════════════════════════════════════ */
  const FUNNEL_BODY = {
    overview: tabOverview, steps: tabSteps, map: tabMap, variants: tabVariants, optimization: tabOptimization,
    offers: tabOffers, checkout: tabCheckout, compliance: tabCompliance,
    analytics: tabAnalytics, attribution: tabAttribution, entrants: tabEntrants, crm: tabCRM, automations: tabAutomations,
    operations: tabOperations, team: tabTeam, logs: tabLogs, settings: tabSettings,
  };
  function viewFunnel() {
    if (st("loading") || (connected() && state.loading)) return shell("funnels", loadingBlock());
    if (st("error")) return shell("funnels", errorBlock());
    const f = state.active;
    if (!f) return shell("funnels", `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("funnel", 24)}</div><h3>Funnel not found</h3><p>It may have been deleted.</p><button class="btn btn-ghost es-cta" data-hash="#/funnels">Back to funnels</button></div></div>`);
    const tab = state.route.tab || "overview";
    const head = `<div class="fn-head">
      <div><div class="eyebrow">${svg("funnel", 13)} Funnel</div>
        <div class="ph-title" style="margin-top:6px">${esc(f.name)}</div></div>
      <div class="spacer"></div>
      <span class="st st-${f.status}" style="align-self:center">${esc(STATUS_LABEL[f.status] || f.status)}</span>
      ${f.test_mode ? `<span class="test-badge" style="align-self:center">Test</span>` : ""}
    </div>`;
    const body = (FUNNEL_BODY[tab] || tabOverview)(f);
    return shell("funnels", previewStrip() + head + body);
  }

  function tabOverview(f) {
    const r = f.readiness || { ready: false, score: 0, blockers: [], warnings: [] };
    const rev = f.revenue || { revenue: 0, orders: 0, aov: 0, epc: 0 };
    const log = f.opsLog || { automation: [] };
    const readyBadge = r.ready
      ? `<span class="ready-badge ok">${svg("check", 13)} Ready to publish</span>`
      : `<span class="ready-badge no">${svg("flag", 13)} ${r.blockers.length} blocker${r.blockers.length === 1 ? "" : "s"}</span>`;
    const revKpi = (ico, val, label) => `<div class="kpi"><div class="kpi-ico">${svg(ico)}</div><div class="kpi-val">${val}</div><div class="kpi-label">${label}</div></div>`;
    const recent = (log.automation || []).slice(0, 3);
    const recentHtml = recent.length ? recent.map((e) => `<div class="log-row">
        <span class="log-status ${e.status}">${svg(e.status === "failed" ? "flag" : "check", 12)}</span>
        <div style="flex:1;min-width:0" class="mono"><span style="font-size:12.5px">${esc(e.trigger_type)}</span></div>
        <span class="mono" style="font-size:11px;color:var(--ink-400)">${new Date(e.started_at).toLocaleDateString()}</span>
      </div>`).join("") : `<p class="muted" style="font-size:12.5px">No activity yet.</p>`;
    return `<div style="display:flex;flex-direction:column;gap:18px">
      <div class="rev-strip">
        ${revKpi("trophy", money(rev.revenue, f.currency), "Revenue")}
        ${revKpi("cart", fmtInt(rev.orders), "Orders")}
        ${revKpi("target", money2(rev.aov, f.currency), "AOV")}
        ${revKpi("layers", fmtInt((f.steps || []).length), "Steps")}
      </div>
      <div class="panel"><div class="panel-head"><div class="ph-ico">${svg("flag", 15)}</div><h3>Launch readiness</h3></div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">${readyBadge}<span class="mono" style="font-size:12px;color:var(--ink-400)">Score ${r.score ?? 0}/100</span></div>
        ${r.blockers.length ? `<ul class="readiness-list blockers">${r.blockers.slice(0, 3).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        <button class="btn btn-ghost btn-sm" data-hash="#/funnels/${f.id}/operations" style="margin-top:10px">Go to Operations →</button>
      </div>
      <div class="panel"><div class="panel-head"><div class="ph-ico">${svg("zap", 15)}</div><h3>AI recommendations</h3></div>
        <p class="muted" style="font-size:11.5px;margin-bottom:10px">Moved to its own tab — see Optimization for the full advisory list.</p>
        <button class="btn btn-ghost btn-sm" data-hash="#/funnels/${f.id}/optimization">Go to Optimization →</button>
      </div>
      <div class="panel"><div class="panel-head"><div class="ph-ico">${svg("chart", 15)}</div><h3>Recent activity</h3></div>
        <div class="log-list">${recentHtml}</div>
        <button class="btn btn-ghost btn-sm" data-hash="#/funnels/${f.id}/logs" style="margin-top:10px">View all logs →</button>
      </div>
    </div>`;
  }
  function tabOptimization(f) {
    const recs = f.recommendations || [];
    const recsHtml = recs.length ? recs.map((rc) => `<div class="log-row">
        <span class="log-status ${rc.severity === "warning" ? "failed" : ""}">${svg(rc.severity === "warning" ? "flag" : "zap", 12)}</span>
        <div style="flex:1;font-size:12.5px;color:var(--ink-700)">${esc(rc.message)}</div>
      </div>`).join("") : `<p class="muted" style="font-size:12.5px">No recommendations right now — this funnel looks healthy.</p>`;
    return `<div class="panel"><div class="panel-head"><div class="ph-ico">${svg("zap", 15)}</div><h3>AI recommendations</h3></div>
      <p class="muted" style="font-size:11.5px;margin-bottom:10px">Deterministic advisories derived from this funnel's own tracked data (drop-off, checkout completion, EPC, order bump, running-test significance) — not a live model call.</p>
      <div class="log-list">${recsHtml}</div>
    </div>`;
  }
  function tabVariants(f) {
    const steps = (f.steps || []).slice().sort((a, b) => (a.step_order || 0) - (b.step_order || 0));
    const rows = steps.map((s) => `<div class="access-row">
        <div class="fc-ico" style="width:30px;height:30px;font-size:13px">${svg(TYPE_ICO[s.step_type] || "file", 14)}</div>
        <div style="flex:1;min-width:0"><div style="font-size:13px;color:var(--ink-900)">${esc(s.name || TYPE_LABEL[s.step_type])}</div>
          <div style="font-size:11px;color:var(--ink-400)">${s.has_split ? "A/B(/C) test running" : "No test"}</div></div>
        <button class="btn btn-ghost btn-sm" data-variantstep="${s.id}">${s.has_split ? "Manage" : `${svg("plus", 13)} Start test`}</button>
      </div>`).join("");
    return `<div class="panel"><div class="panel-head"><div class="ph-ico">${svg("split", 15)}</div><h3>Variants</h3></div>
      <p class="muted" style="font-size:12.5px;margin-bottom:10px">Manage A/B/C tests across every step in this funnel.</p>
      <div class="access-list">${steps.length ? rows : `<p class="muted" style="font-size:12.5px">Add steps first (Funnel Map) before starting a test.</p>`}</div>
    </div>`;
  }
  function tabCheckout(f) {
    const steps = (f.steps || []).filter((s) => ["order", "upsell", "downsell"].includes(s.step_type)).sort((a, b) => (a.step_order || 0) - (b.step_order || 0));
    const rows = steps.map((s) => {
      const cfg = s.config || {};
      const products = cfg.products || [];
      const bumps = cfg.bumps || (cfg.bump ? [cfg.bump] : []);
      return `<div class="access-row">
        <div class="fc-ico" style="width:30px;height:30px;font-size:13px">${svg(TYPE_ICO[s.step_type] || "cart", 14)}</div>
        <div style="flex:1;min-width:0"><div style="font-size:13px;color:var(--ink-900)">${esc(s.name || TYPE_LABEL[s.step_type])}</div>
          <div style="font-size:11px;color:var(--ink-400)">${products.length} product${products.length === 1 ? "" : "s"} · ${bumps.length} bump${bumps.length === 1 ? "" : "s"}${cfg.coupon ? ` · coupon ${esc(cfg.coupon.code)} (${cfg.coupon.percent_off}%)` : ""}</div></div>
        <button class="btn btn-ghost btn-sm" data-checkoutstep="${s.id}">${svg("edit", 13)} Edit</button>
      </div>`;
    }).join("");
    return `<div class="panel"><div class="panel-head"><div class="ph-ico">${svg("cart", 15)}</div><h3>Checkout</h3></div>
      <p class="muted" style="font-size:12.5px;margin-bottom:10px">Products, order bumps, and step routing for every order, upsell, and downsell step.</p>
      <div class="access-list">${steps.length ? rows : `<p class="muted" style="font-size:12.5px">No order, upsell, or downsell steps yet.</p>`}</div>
    </div>`;
  }
  function tabOffers(f) {
    if (!f.source_offer_id) {
      return `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("cart", 24)}</div>
        <h3>Not created from an offer</h3><p>This funnel wasn't generated from an Affiliate Hub offer. Use "Create Funnel from Offer" in Affiliate Hub's Offers list to link one.</p></div></div>`;
    }
    const o = connected() ? f.sourceOffer : null;
    const name = o?.name || f.source_offer_name || "Linked offer";
    return `<div class="panel">
      <div class="panel-head"><div class="ph-ico">${svg("cart", 15)}</div><h3>Source offer</h3></div>
      <div class="fc-top" style="margin-bottom:12px"><div class="fc-ico">${svg("cart", 19)}</div>
        <div style="min-width:0;flex:1"><div class="fc-name">${esc(name)}</div>
          ${o ? `<div class="fc-meta">${esc(o.network || "—")} · ${esc(o.niche || "—")}${o.commission_note ? " · " + esc(o.commission_note) : ""}</div>` : ""}
        </div>
      </div>
      ${o?.disclosure_text ? `<p class="muted" style="font-size:12.5px">${svg("file", 12)} ${esc(o.disclosure_text)}</p>` : ""}
      ${!connected() ? `<p class="muted" style="font-size:12px">Full offer details live in Affiliate Hub — this mockup only carries the offer name across the bridge.</p>` : ""}
      <button class="btn btn-ghost btn-sm" id="openInAffHub" style="margin-top:12px">${svg("chev", 13)} Open in Affiliate Hub</button>
    </div>`;
  }
  function tabCompliance(f) {
    const scan = connected() ? (f.compliance || { findings: [], high_count: 0, medium_count: 0, clear: true }) : localComplianceScan(f.steps);
    const rows = scan.findings.map((x) => `<div class="access-row">
        <span class="log-status ${x.severity === "high" ? "failed" : ""}">${svg("flag", 13)}</span>
        <div style="flex:1;min-width:0"><div style="font-size:12.5px;color:var(--ink-900)">${esc(x.step_name)} — ${esc(x.message)}</div>
          <div style="font-size:11px;color:var(--ink-400)">${esc(x.rewrite_hint)}</div></div>
        <span class="cat-badge cat-${x.category}">${esc(x.category)}</span>
      </div>`).join("");
    return `<div class="panel">
      <div class="panel-head"><div class="ph-ico">${svg("file", 15)}</div><h3>Compliance check</h3></div>
      <p class="muted" style="font-size:11.5px;margin-bottom:10px">Deterministic phrase-pattern scan over this funnel's own step copy (name/CTA/purpose) — fake urgency, unrealistic health/income/finance claims. Not NLP claim understanding, and not a substitute for legal review.</p>
      ${scan.clear
        ? `<div class="ready-badge ok">${svg("check", 13)} No risky phrasing detected</div>`
        : `<div style="display:flex;gap:10px;margin-bottom:10px">
            ${scan.high_count ? `<span class="ready-badge no">${svg("flag", 13)} ${scan.high_count} high-risk</span>` : ""}
            ${scan.medium_count ? `<span class="st st-testing">${scan.medium_count} medium-risk</span>` : ""}
          </div><div class="access-list">${rows}</div>`}
    </div>`;
  }
  function tabSteps(f) {
    const steps = (f.steps || []).slice().sort((a, b) => (a.step_order || 0) - (b.step_order || 0));
    if (!steps.length) {
      return `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("layers", 24)}</div>
        <h3>No steps yet</h3><p>Add your first step and pick a published page. Steps run in order — opt-in, sales, order, upsell, thank-you.</p>
        ${canWrite() ? `<button class="btn btn-primary es-cta" id="addStep0">${svg("plus", 14)} Add a step</button>` : ""}</div></div>`;
    }
    const rows = steps.map((s) => `<div class="access-row" data-step="${s.id}" style="cursor:pointer">
        <div class="fc-ico" style="width:30px;height:30px;font-size:13px">${svg(TYPE_ICO[s.step_type] || "file", 14)}</div>
        <div style="flex:1;min-width:0"><div style="font-size:13px;color:var(--ink-900)">${esc(s.name || TYPE_LABEL[s.step_type])}</div>
          <div style="font-size:11px;color:var(--ink-400)">${TYPE_LABEL[s.step_type] || s.step_type}${s.has_split ? " · A/B split running" : ""}${s.has_bump ? " · order bump" : ""}</div></div>
        ${!s.page_id ? `<span class="st st-draft">${svg("flag", 11)} No page linked</span>` : `<span class="muted" style="font-size:11.5px">${esc(s.page_title)}</span>`}
      </div>`).join("");
    return `<div class="panel"><div class="panel-head"><div class="ph-ico">${svg("layers", 15)}</div><h3>Steps</h3></div>
      <p class="muted" style="font-size:12.5px;margin-bottom:10px">The structure of this funnel — click a step to edit its page, type, or checkout config. See <span class="mono">Funnel Map</span> for live conversion numbers.</p>
      <div class="access-list">${rows}</div>
      ${canWrite() ? `<button class="btn btn-ghost btn-sm" id="addStep" style="margin-top:14px">${svg("plus", 14)} Add step</button>` : ""}
    </div>`;
  }
  function tabMap(f) {
    const steps = (f.steps || []).slice().sort((a, b) => (a.step_order || 0) - (b.step_order || 0));
    if (!steps.length) {
      return `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("funnel", 24)}</div>
        <h3>No steps yet</h3><p>Add your first step and pick a published page. Each step becomes a stage in the conversion flow.</p>
        ${canWrite() ? `<button class="btn btn-primary es-cta" id="addStep0">${svg("plus", 14)} Add a step</button>` : ""}</div></div>`;
    }
    let html = "";
    steps.forEach((s, i) => {
      const barW = Math.max(4, Math.min(100, Number(s.rate) || 0));
      html += `<div class="map-step"><div class="map-card type-${s.step_type}" data-step="${s.id}">
        ${s.has_split ? `<div class="ms-split">${svg("split", 9)} A/B</div>` : ""}
        ${s.warning_no_page ? `<div class="ms-split" style="background:rgba(196,97,78,.14);color:var(--status-danger)">${svg("flag", 9)} No page</div>` : ""}
        <div class="ms-top"><div class="ms-badge">${svg(TYPE_ICO[s.step_type] || "file", 15)}</div>
          <div style="min-width:0"><div class="ms-type">${TYPE_LABEL[s.step_type] || s.step_type}${s.has_bump ? " · bump" : ""}</div>
          <div class="ms-name">${esc(s.name || s.page_title || "Step")}</div></div></div>
        <div class="ms-visitors">${fmtInt(s.visitors)}</div><div class="ms-vlabel">Visitors</div>
        <div class="ms-bar"><span style="width:${barW}%"></span></div>
        <div class="ms-conv"><span>Converts</span><b>${pct(s.rate)}</b></div>
        ${s.revenue > 0 ? `<div class="ms-conv" style="margin-top:2px"><span>Revenue</span><b>${money(s.revenue, f.currency)}</b></div>` : ""}
      </div></div>`;
      if (i < steps.length - 1) {
        const next = steps[i + 1];
        const drop = s.visitors > 0 ? Math.round((1 - (next.visitors / s.visitors)) * 100) : 0;
        html += `<div class="map-join"><div class="mj-line">${svg("chev", 20)}</div><div class="mj-drop ${drop >= 60 ? "warn" : ""}">−${drop}%</div></div>`;
      }
    });
    if (canWrite()) html += `<div class="map-add"><button id="addStep">${svg("plus", 20)}<span>Add step</span></button></div>`;
    return `<div class="panel" style="padding:20px 18px"><div class="fn-map">${html}</div></div>`;
  }

  function tabAnalytics(f) {
    const steps = (f.steps || []).slice().sort((a, b) => (a.step_order || 0) - (b.step_order || 0));
    if (!steps.length) return `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("chart", 24)}</div><h3>No data yet</h3><p>Add steps and drive traffic to see the conversion waterfall.</p></div></div>`;
    const maxV = Math.max(1, ...steps.map((s) => s.visitors || 0));
    const waterfall = steps.map((s, i) => {
      const w = Math.max(2, (s.visitors / maxV) * 100);
      const dropFromPrev = i === 0 ? null : (steps[i - 1].visitors > 0 ? Math.round((1 - s.visitors / steps[i - 1].visitors) * 100) : 0);
      return `<div class="wf-row">
        <div class="wf-name"><span class="wf-badge">${svg(TYPE_ICO[s.step_type] || "file", 12)}</span><span>${esc(s.name || TYPE_LABEL[s.step_type])}</span></div>
        <div class="wf-track ${s.step_type === "order" || s.step_type === "upsell" ? "gold" : ""}"><span style="width:${w}%"></span></div>
        <div class="wf-nums">${fmtInt(s.visitors)}<small>${dropFromPrev == null ? pct(s.rate) + " conv" : "−" + dropFromPrev + "% drop"}</small></div>
      </div>`;
    }).join("");
    const rev = st("empty") ? { revenue: 0, orders: 0, aov: 0, epc: 0, visitors: 0, by_step: [], reconciled: true, trend: [] } : (f.revenue || {});
    const byStep = rev.by_step || [];
    const stepRevRows = byStep.length ? byStep.map((s) => `<div class="rev-step-row">
        <span>${esc(s.name)}</span><span class="mono">${fmtInt(s.orders)} orders</span><span class="mono">${money(s.revenue, f.currency)}</span>
      </div>`).join("") : `<p class="muted" style="padding:8px 4px">No paid orders yet.</p>`;
    const revKpi = (ico, val, label) => `<div class="kpi"><div class="kpi-ico">${svg(ico)}</div><div class="kpi-val">${val}</div><div class="kpi-label">${label}</div></div>`;
    const trend = rev.trend || [];
    const maxRev = Math.max(1, ...trend.map((t) => Number(t.revenue) || 0));
    const trendHtml = trend.length ? `<div class="waterfall">${trend.map((t) => `<div class="wf-row">
        <div class="wf-name mono" style="font-size:11px">${new Date(t.day).toLocaleDateString()}</div>
        <div class="wf-track gold"><span style="width:${Math.max(2, (Number(t.revenue) || 0) / maxRev * 100)}%"></span></div>
        <div class="wf-nums">${money(t.revenue, f.currency)}<small>${fmtInt(t.orders)} orders</small></div>
      </div>`).join("")}</div>` : `<p class="muted" style="padding:8px 4px">No paid orders in this range yet.</p>`;
    return `<div style="display:flex;flex-direction:column;gap:18px">
      <div class="panel" style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;padding:14px 18px">
        <div class="form-field" style="margin:0"><label>From</label><input type="date" id="anFrom"></div>
        <div class="form-field" style="margin:0"><label>To</label><input type="date" id="anTo"></div>
        <button class="btn btn-ghost btn-sm" id="anApply">Apply range</button>
        <button class="btn btn-ghost btn-sm" id="anClear">All time</button>
        ${rev.reconciled === false ? `<span class="st st-draft" style="margin-left:auto">${svg("flag", 11)} Revenue totals don't reconcile — check Operations</span>` : ""}
      </div>
      <div class="rev-strip">
        ${revKpi("trophy", money(rev.revenue, f.currency), "Revenue")}
        ${revKpi("cart", fmtInt(rev.orders), "Orders")}
        ${revKpi("target", money2(rev.aov, f.currency), "AOV")}
        ${revKpi("zap", money2(rev.epc, f.currency), "EPC")}
      </div>
      <div class="panel"><div class="panel-head"><div class="ph-ico">${svg("chart", 15)}</div><h3>Conversion waterfall</h3></div><div class="waterfall">${waterfall}</div></div>
      <div class="panel"><div class="panel-head"><div class="ph-ico">${svg("trophy", 15)}</div><h3>Revenue trend</h3></div>${trendHtml}</div>
      <div class="panel"><div class="panel-head"><div class="ph-ico">${svg("cart", 15)}</div><h3>Revenue by step</h3></div>${stepRevRows}</div>
    </div>`;
  }
  function tabAttribution(f) {
    const rev = st("empty") ? { by_source: [], by_medium: [], by_campaign: [] } : (f.revenue || {});
    const bySource = rev.by_source || [];
    const maxU = Math.max(1, ...bySource.map((u) => u.visitors || 0));
    const utmHtml = bySource.length ? bySource.map((u) => `<div class="utm-row"><span class="utm-name">${esc(u.source)}</span>
      <span class="utm-bar"><span style="width:${(u.visitors / maxU * 100).toFixed(0)}%"></span></span>
      <span class="utm-val">${fmtInt(u.visitors)}</span><span class="utm-rev">${money(u.revenue, f.currency)}</span></div>`).join("")
      : `<p class="muted" style="padding:8px 4px">UTM breakdown appears once tracked visits arrive.</p>`;
    const dimRows = (list, key) => {
      const max = Math.max(1, ...(list || []).map((x) => x.visitors || 0));
      return (list && list.length) ? list.map((x) => `<div class="utm-row"><span class="utm-name">${esc(x[key])}</span>
        <span class="utm-bar"><span style="width:${(x.visitors / max * 100).toFixed(0)}%"></span></span>
        <span class="utm-val">${fmtInt(x.visitors)}</span></div>`).join("") : `<p class="muted" style="padding:8px 4px">No data yet.</p>`;
    };
    return `<div style="display:flex;flex-direction:column;gap:18px">
      <div class="panel"><div class="panel-head"><div class="ph-ico">${svg("link", 15)}</div><h3>Traffic &amp; revenue by source</h3></div><div class="utm-list">${utmHtml}</div></div>
      <div class="panel"><div class="panel-head"><div class="ph-ico">${svg("link", 15)}</div><h3>By UTM medium</h3></div><div class="utm-list">${dimRows(rev.by_medium, "medium")}</div></div>
      <div class="panel"><div class="panel-head"><div class="ph-ico">${svg("link", 15)}</div><h3>By UTM campaign</h3></div><div class="utm-list">${dimRows(rev.by_campaign, "campaign")}</div></div>
    </div>`;
  }
  function tabEntrants(f) {
    const data = st("empty") ? { entrants: [], total: 0 } : (f.entrants || { entrants: [], total: 0 });
    const rows = data.entrants.map((e) => {
      const name = [e.first_name, e.last_name].filter(Boolean).join(" ") || e.email || e.visitor_id;
      const orderBadge = e.order_status
        ? `<span class="st ${e.order_status === "paid" ? "st-active" : "st-draft"}">${esc(e.order_status)}</span>`
        : `<span class="muted" style="font-size:11px">—</span>`;
      return `<div class="entrant-row">
        <div style="min-width:0"><div style="font-size:13px;color:var(--ink-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(name)}</div>
          <div class="mono" style="font-size:10.5px;color:var(--ink-400)">${esc(e.visitor_id)}${e.is_test ? " · TEST" : ""}</div></div>
        <span class="entrant-cell" style="text-transform:capitalize">${esc(e.source || "direct")}</span>
        <span class="entrant-cell">${esc(e.furthest_step_name || "—")}</span>
        <span class="entrant-cell mono">${e.variant ? "Variant " + e.variant : "—"}</span>
        <span class="entrant-cell">${orderBadge}</span>
        <span class="entrant-cell mono" style="color:var(--ink-400)">${new Date(e.last_seen).toLocaleDateString()}</span>
      </div>`;
    }).join("");
    return `<div class="panel"><div class="panel-head"><div class="ph-ico">${svg("users", 15)}</div><h3>Contacts &amp; entries</h3></div>
      <p class="muted" style="font-size:12.5px;margin-bottom:10px">${fmtInt(data.total)} visitor${data.total === 1 ? "" : "s"} ${data.total === 1 ? "has" : "have"} entered this funnel.</p>
      ${data.entrants.length ? `<div class="entrant-row entrant-head">
        <span>Visitor</span><span class="entrant-cell">Source</span><span class="entrant-cell">Furthest step</span><span class="entrant-cell">Variant</span><span class="entrant-cell">Order</span><span class="entrant-cell">Last seen</span>
      </div>` : ""}
      <div class="entrant-list">${rows || `<p class="muted" style="font-size:12.5px">No entrants yet — this list fills in as visitors move through the funnel.</p>`}</div>
    </div>`;
  }
  function tabCRM(f) {
    const rev = st("empty") ? { by_step: [], reconciled: true } : (f.revenue || {});
    const s = f.settings || {};
    const byStep = rev.by_step || [];
    const stepRevRows = byStep.length ? byStep.map((s2) => `<div class="rev-step-row">
        <span>${esc(s2.name)}</span><span class="mono">${fmtInt(s2.orders)} orders</span><span class="mono">${money(s2.revenue, f.currency)}</span>
      </div>`).join("") : `<p class="muted" style="padding:8px 4px">No paid orders yet.</p>`;
    return `<div style="display:flex;flex-direction:column;gap:18px;max-width:640px">
      <div class="panel"><div class="panel-head"><div class="ph-ico">${svg("target", 15)}</div><h3>CRM &amp; pipeline mapping</h3></div>
        <p class="muted" style="margin-bottom:14px;font-size:13px">On purchase, create a deal in this pipeline &amp; stage and fire the <span class="mono">payment.received</span> automation trigger.</p>
        <div class="form-grid">
          <div class="form-field"><label>Pipeline</label><input id="setPipeline" value="${esc(s.pipeline || "")}" placeholder="e.g. Sales" ${canManage() ? "" : "disabled"}></div>
          <div class="form-field"><label>Stage</label><input id="setStage" value="${esc(s.stage || "")}" placeholder="e.g. New" ${canManage() ? "" : "disabled"}></div>
        </div>
        ${canManage() ? `<button class="btn btn-primary" id="saveSettings" style="margin-top:14px">${svg("check", 15)} Save</button>` : ""}
      </div>
      <div class="panel"><div class="panel-head"><div class="ph-ico">${svg("cart", 15)}</div><h3>Revenue by step</h3></div>
        ${rev.reconciled === false ? `<p style="font-size:12px;color:var(--status-danger);margin-bottom:10px">${svg("flag", 11)} Total revenue doesn't reconcile with the sum of step revenue below — an order may be attached to a non-order-type step. Worth a look.</p>` : ""}
        ${stepRevRows}
      </div>
    </div>`;
  }
  function tabAutomations(f) {
    const ALL_TRIGGERS = [
      ["funnel.entered", "Visitor enters the funnel"], ["step.completed", "A step is completed"],
      ["form.submitted", "An opt-in form is submitted"], ["checkout.started", "Checkout begins"],
      ["payment.received", "An order is paid"], ["upsell.accepted", "An upsell is accepted"],
      ["upsell.declined", "An upsell is declined"], ["downsell.accepted", "A downsell is accepted"],
      ["downsell.declined", "A downsell is declined"], ["test.winner_selected", "An A/B/C winner is promoted"],
      ["funnel.published", "The funnel goes live"], ["cart.abandoned", "An order is abandoned"],
    ];
    const log = f.opsLog || { automation: [] };
    const lastByType = {};
    (log.automation || []).forEach((e) => { if (!lastByType[e.trigger_type]) lastByType[e.trigger_type] = e; });
    const rows = ALL_TRIGGERS.map(([type, desc]) => {
      const last = lastByType[type];
      return `<div class="access-row">
        <span class="log-status ${last ? last.status : ""}">${svg(last ? (last.status === "failed" ? "flag" : "check") : "zap", 12)}</span>
        <div style="flex:1;min-width:0"><div class="mono" style="font-size:12.5px;color:var(--ink-900)">${esc(type)}</div>
          <div style="font-size:11px;color:var(--ink-400)">${esc(desc)}</div></div>
        <span style="font-size:11px;color:var(--ink-400)">${last ? new Date(last.started_at).toLocaleDateString() : "never fired"}</span>
      </div>`;
    }).join("");
    return `<div class="panel"><div class="panel-head"><div class="ph-ico">${svg("zap", 15)}</div><h3>Automations</h3></div>
      <p class="muted" style="font-size:12.5px;margin-bottom:10px">Events this funnel fires on the M13 automation bus — connect a workflow to any of these triggers.</p>
      <div class="access-list">${rows}</div>
      <button class="btn btn-ghost btn-sm" data-hash="#/funnels/${f.id}/logs" style="margin-top:10px">View delivery log →</button>
    </div>`;
  }
  function tabOperations(f) {
    const pills = STATUS_STEPS.map((st) => `<button data-status="${st}" class="${st === f.status ? "on" : ""}" ${canManage() ? "" : "disabled"}>${STATUS_LABEL[st]}</button>`).join("");
    const r = f.readiness || { ready: false, blockers: [], warnings: [] };
    const readyBadge = r.ready
      ? `<span class="ready-badge ok">${svg("check", 13)} Ready to publish</span>`
      : `<span class="ready-badge no">${svg("flag", 13)} Not ready to publish</span>`;
    const list = (arr, cls) => arr.length ? `<ul class="readiness-list ${cls}">${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
    const derived = (state.funnels || []).filter((x) => x.template_of_id === f.id && x.is_template);
    const derivedRows = derived.length ? derived.map((t) => `<div class="access-row">
        <div class="fc-ico" style="width:28px;height:28px;font-size:12px">${svg("gift", 13)}</div>
        <div style="flex:1;min-width:0"><div style="font-size:12.5px;color:var(--ink-900)">${esc(t.name)}</div></div>
      </div>`).join("") : `<p class="muted" style="font-size:12.5px">No templates saved from this funnel yet.</p>`;
    return `<div style="display:flex;flex-direction:column;gap:18px">
      <div class="panel">
        <div class="panel-head"><div class="ph-ico">${svg("flag", 15)}</div><h3>Operations</h3></div>
        <div class="form-field"><label>Status</label><div class="seg" id="statusSeg">${pills}</div></div>
        <div class="bump-toggle" style="margin-top:14px">
          <span style="color:var(--gold-500)">${svg("zap", 16)}</span>
          <div style="flex:1"><div style="font-size:13px;color:var(--ink-900)">Test mode</div>
            <div style="font-size:11.5px;color:var(--ink-400)">Test traffic and orders are flagged and excluded from revenue &amp; analytics.</div></div>
          <label style="font-size:12px;color:var(--ink-500)"><input type="checkbox" id="testModeToggle" ${f.test_mode ? "checked" : ""} ${canManage() ? "" : "disabled"}> enabled</label>
        </div>
        <div style="margin-top:16px;padding-top:14px;border-top:.5px solid var(--line)">
          <div style="margin-bottom:8px">${readyBadge}</div>
          ${list(r.blockers, "blockers")}${list(r.warnings, "warnings")}
          ${!r.blockers.length && !r.warnings.length ? `<p class="muted" style="font-size:12.5px">All publish-readiness checks passed.</p>` : ""}
        </div>
      </div>
      <div class="panel"><div class="panel-head"><div class="ph-ico">${svg("layers", 15)}</div><h3>Duplication &amp; templates</h3></div>
        <p class="muted" style="font-size:12.5px;margin-bottom:12px">Duplicate this funnel as a fresh draft, or save its steps as a reusable template — templates live on the module-level <a href="#/funnels/templates" data-hash="#/funnels/templates">Templates</a> page.</p>
        ${canWrite() ? `<div style="display:flex;gap:10px;margin-bottom:14px">
          <button class="btn btn-ghost btn-sm" id="tmplDuplicate">${svg("layers", 13)} Duplicate this funnel</button>
          <button class="btn btn-ghost btn-sm" id="tmplSave">${svg("gift", 13)} Save as template</button>
        </div>` : ""}
        <div class="panel-head" style="margin-top:2px"><h3 style="font-size:12.5px">Templates saved from this funnel</h3></div>
        <div class="access-list">${derivedRows}</div>
      </div>
    </div>`;
  }
  const ROLE_PRESET = {
    viewer:  { can_edit: false, can_view_analytics: false, label: "Viewer" },
    analyst: { can_edit: false, can_view_analytics: true,  label: "Analyst" },
    editor:  { can_edit: true,  can_view_analytics: false, label: "Editor" },
    admin:   { can_edit: true,  can_view_analytics: true,  label: "Full access" },
  };
  function rolePresetFor(a) {
    if (a.can_edit && a.can_view_analytics) return "admin";
    if (a.can_edit) return "editor";
    if (a.can_view_analytics) return "analyst";
    return "viewer";
  }
  function tabTeam(f) {
    const access = f.access || [];
    const members = state.members || [];
    const rows = access.length ? access.map((a) => `<div class="access-row">
        <span class="avatar" style="width:28px;height:28px;font-size:11px">${esc(initials(a.profiles?.name || a.profiles?.email))}</span>
        <div style="flex:1;min-width:0"><div style="font-size:13px;color:var(--ink-900)">${esc(a.profiles?.name || a.profiles?.email || "Member")}</div>
          <div style="font-size:11px;color:var(--ink-400)">${esc(a.profiles?.email || "")}</div></div>
        <select data-accesspreset="${a.user_id}" style="font-size:11.5px" ${canManage() ? "" : "disabled"}>
          ${Object.entries(ROLE_PRESET).map(([k, v]) => `<option value="${k}" ${rolePresetFor(a) === k ? "selected" : ""}>${v.label}</option>`).join("")}
        </select>
        ${canManage() ? `<button class="icon-btn" data-accessdel="${a.user_id}" title="Remove restriction">${svg("trash", 13)}</button>` : ""}
      </div>`).join("") : `<p class="muted" style="font-size:12.5px">Everyone with staff+ access to this workspace can fully edit and view analytics for this funnel — add a restriction below to narrow that for one person.</p>`;
    const pickable = members.filter((m) => !access.some((a) => a.user_id === m.user_id));
    const picker = canManage() && pickable.length ? `<div class="form-grid" style="margin-top:12px;align-items:end">
        <div class="form-field"><label>Restrict a team member</label><select id="accessPick"><option value="">— choose —</option>
          ${pickable.map((m) => `<option value="${m.user_id}">${esc(m.profiles?.name || m.profiles?.email)} (${m.role})</option>`).join("")}</select></div>
        <button class="btn btn-ghost btn-sm" id="addAccess">${svg("plus", 14)} Add restriction</button>
      </div>` : "";
    return `<div class="panel"><div class="panel-head"><div class="ph-ico">${svg("users", 15)}</div><h3>Team &amp; permissions</h3></div>
      <p class="muted" style="font-size:12.5px;margin-bottom:12px">This only ever <b>narrows</b> access below the workspace role — it can never grant more than someone's role already allows. Viewer/Analyst/Editor/Full-access are labels over the same two switches (can edit, can view analytics) — "can view analytics" is enforced server-side; "can edit" is a UI-level convenience for now, not yet enforced by the database.</p>
      <div class="access-list">${rows}</div>
      ${picker}
    </div>`;
  }
  function tabLogs(f) {
    const log = f.opsLog || { automation: [], abandoned_count: 0, promoted_count: 0 };
    const STATUS_ICO = { completed: "check", failed: "flag", running: "zap", waiting: "zap", cancelled: "trash" };
    const rows = log.automation.length ? log.automation.map((e) => `<div class="log-row">
        <span class="log-status ${e.status}">${svg(STATUS_ICO[e.status] || "zap", 12)}</span>
        <div style="flex:1;min-width:0"><div class="mono" style="font-size:12.5px;color:var(--ink-900)">${esc(e.trigger_type)}</div>
          ${e.error ? `<div style="font-size:11px;color:var(--status-danger)">${esc(e.error)}</div>` : ""}</div>
        <span class="mono" style="font-size:11px;color:var(--ink-400)">${new Date(e.started_at).toLocaleString()}</span>
      </div>`).join("") : `<p class="muted" style="font-size:12.5px">No automation activity yet — deliveries appear here as visitors move through the funnel.</p>`;
    const jobRuns = f.jobRuns || [];
    const jobRows = jobRuns.length ? jobRuns.map((j) => `<div class="log-row">
        <span class="log-status completed">${svg("check", 12)}</span>
        <div style="flex:1;min-width:0"><div class="mono" style="font-size:12.5px;color:var(--ink-900)">${esc(j.job_name)}</div>
          <div style="font-size:11px;color:var(--ink-400)">${fmtInt(j.rows_affected)} row${j.rows_affected === 1 ? "" : "s"} affected</div></div>
        <span class="mono" style="font-size:11px;color:var(--ink-400)">${new Date(j.ran_at).toLocaleString()}</span>
      </div>`).join("") : `<p class="muted" style="font-size:12.5px">The hourly sweep jobs haven't run yet.</p>`;
    return `<div style="display:flex;flex-direction:column;gap:18px">
      <div class="panel"><div class="panel-head"><div class="ph-ico">${svg("chart", 15)}</div><h3>Activity &amp; automation logs</h3></div>
        <div class="rev-strip" style="grid-template-columns:repeat(2,1fr);margin-bottom:16px">
          <div class="kpi"><div class="kpi-ico">${svg("cart", 18)}</div><div class="kpi-val">${fmtInt(log.abandoned_count)}</div><div class="kpi-label">Abandoned orders</div></div>
          <div class="kpi"><div class="kpi-ico">${svg("trophy", 18)}</div><div class="kpi-val">${fmtInt(log.promoted_count)}</div><div class="kpi-label">Winners promoted</div></div>
        </div>
        <div class="log-list">${rows}</div>
      </div>
      <div class="panel"><div class="panel-head"><div class="ph-ico">${svg("settings", 15)}</div><h3>Background jobs</h3></div>
        <p class="muted" style="font-size:11.5px;margin-bottom:10px">Workspace-wide — the hourly abandon-sweep and auto-promote sweep, not scoped to just this funnel.</p>
        <div class="log-list">${jobRows}</div>
      </div>
    </div>`;
  }
  function tabSettings(f) {
    const s = f.settings || {};
    return `<div style="display:flex;flex-direction:column;gap:18px;max-width:640px">
      <div class="panel"><div class="panel-head"><div class="ph-ico">${svg("cart", 15)}</div><h3>Cart abandonment</h3></div>
        <p class="muted" style="margin-bottom:14px;font-size:13px">An order started but unpaid past this window fires <span class="mono">cart.abandoned</span> for M13 recovery sequences. Runs hourly (<span class="mono">m20-abandoned-sweep</span>).</p>
        <div class="form-field" style="max-width:220px"><label>Abandon after (hours)</label>
          <input id="setAbandon" class="num" value="${esc(s.abandon_hours ?? 1)}" ${canManage() ? "" : "disabled"}></div>
        ${canManage() ? `<button class="btn btn-primary" id="saveSettings" style="margin-top:14px">${svg("check", 15)} Save settings</button>` : ""}
      </div>
      ${canManage() ? `<div class="panel"><div class="panel-head"><div class="ph-ico">${svg("trash", 15)}</div><h3>Delete funnel</h3></div>
        <p class="muted" style="margin-bottom:14px;font-size:13px">Permanently removes this funnel and its steps. This cannot be undone.</p>
        <button class="btn btn-ghost" id="delFunnel" style="color:var(--status-danger);border-color:var(--status-danger)">${svg("trash", 15)} Delete funnel</button></div>` : ""}
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Step drawer — page / config / split
     ══════════════════════════════════════════════════════════════════════════ */
  function stepDrawerHtml() {
    const d = state.drawer; if (!d) return "";
    const f = state.active; const step = (f?.steps || []).find((s) => s.id === d.stepId);
    if (!step) return "";
    const tab = d.tab || "page";
    const tabs = `<div class="sd-tabs">
      ${["page", "config", "split"].map((t) => `<div class="sd-tab ${t === tab ? "on" : ""}" data-sdtab="${t}">${t === "page" ? "Page" : t === "config" ? "Config" : "A/B Split"}</div>`).join("")}
    </div>`;
    let body;
    if (tab === "page") body = drawerPage(step);
    else if (tab === "config") body = drawerConfig(step, f);
    else body = drawerSplit(step, f);
    return `<aside class="drawer step-drawer open" id="stepDrawer" aria-label="Step">
      <div style="display:flex;align-items:center;gap:11px;margin-bottom:4px">
        <div class="fc-ico" style="width:34px;height:34px;font-size:16px">${svg(TYPE_ICO[step.step_type] || "file", 16)}</div>
        <div style="flex:1"><h3 style="margin:0">${esc(step.name || TYPE_LABEL[step.step_type])}</h3>
          <div class="mono" style="font-size:11px;color:var(--ink-400)">${TYPE_LABEL[step.step_type]} step</div></div>
        <button class="icon-btn" id="closeStep" aria-label="Close">✕</button>
      </div>
      ${tabs}${body}
    </aside>`;
  }
  function drawerPage(step) {
    return `<div style="display:flex;flex-direction:column;gap:14px">
      <div class="pagelink">
        <div class="pl-ico">${svg("layers", 17)}</div>
        <div style="flex:1;min-width:0"><div class="pl-name">${esc(step.page_title || "No page linked")}</div>
          <div class="pl-sub">${step.page_id ? "M19 page · published" : "pick a page below"}</div></div>
        ${step.page_id ? `<button class="btn btn-ghost btn-sm" id="openPage">${svg("edit", 14)} Edit</button>` : ""}
      </div>
      <div class="form-field"><label>Linked page</label>
        <select id="stepPage" ${canWrite() ? "" : "disabled"}>
          <option value="">— choose a published page —</option>
          ${state.pages.map((p) => `<option value="${p.id}" ${p.id === step.page_id ? "selected" : ""}>${esc(p.title)}</option>`).join("")}
        </select>
        <span class="hint">Each funnel step renders one of your M19 pages. Build the page in the Sites editor; wire it here.</span></div>
      <div class="form-field"><label>Step name</label><input id="stepName" value="${esc(step.name || "")}" ${canWrite() ? "" : "disabled"}></div>
      ${canWrite() ? `<button class="btn btn-primary" id="saveStepPage">${svg("check", 15)} Save step</button>` : ""}
    </div>`;
  }
  function drawerConfig(step, f) {
    const cfg = step.config || {};
    const bumps = cfg.bumps || (cfg.bump ? [cfg.bump] : []);   // back-compat with the old singular `bump`
    const typeSeg = `<div class="form-field"><label>Step type</label>
      <div class="seg" id="stepTypeSeg">${Object.keys(TYPE_LABEL).map((t) => `<button data-type="${t}" class="${step.step_type === t ? "on" : ""}">${TYPE_LABEL[t]}</button>`).join("")}</div></div>`;
    let orderCfg = "";
    if (step.step_type === "order" || step.step_type === "upsell" || step.step_type === "downsell") {
      const products = cfg.products || [{ name: "", price: 0 }];
      orderCfg = `<div class="form-field"><label>Products (wired to payments · M28)</label>
        <div id="prodRows">${products.map((p, i) => prodRow(p, i, f.currency)).join("")}</div>
        ${canWrite() ? `<button class="btn btn-ghost btn-sm" id="addProd" style="margin-top:2px">${svg("plus", 14)} Add product</button>` : ""}</div>
        <div class="form-field"><label>Order bumps (pre-purchase checkbox add-ons)</label>
          <div id="bumpRows">${bumps.map((b, i) => bumpRow(b, i)).join("") || `<p class="muted" style="font-size:12px;padding:2px 0">No bumps yet.</p>`}</div>
          ${canWrite() ? `<button class="btn btn-ghost btn-sm" id="addBump" style="margin-top:2px">${svg("plus", 14)} Add bump</button>` : ""}</div>
        <div class="form-grid"><div class="form-field"><label>Coupon code (optional)</label><input id="couponCode" placeholder="e.g. RAMADAN20" value="${esc(cfg.coupon?.code || "")}"></div>
          <div class="form-field"><label>Discount %</label><input id="couponPct" class="num" value="${cfg.coupon?.percent_off || ""}" placeholder="0" style="max-width:100px"></div></div>`;
      if (step.step_type === "upsell" || step.step_type === "downsell") {
        orderCfg += `<div class="bump-toggle"><span style="color:var(--gold-500)">${svg("zap", 16)}</span>
          <div style="font-size:12px;color:var(--ink-500)">One-click charging on a saved card isn't wired yet — this step currently needs the customer to re-enter payment details. The order-creation seam is ready for it.</div></div>`;
      }
    }
    let routing = "";
    if (step.step_type === "order" || step.step_type === "upsell" || step.step_type === "downsell") {
      const others = (f.steps || []).filter((s) => s.id !== step.id).sort((a, b) => (a.step_order || 0) - (b.step_order || 0));
      const stepOpts = (selected) => `<option value="">— next step in order —</option>` +
        others.map((s) => `<option value="${s.id}" ${selected === s.id ? "selected" : ""}>${esc(s.name || TYPE_LABEL[s.step_type])}</option>`).join("");
      const onLabel = step.step_type === "order" ? "On purchase, go to" : "If accepted, go to";
      routing = `<div class="form-grid">
        <div class="form-field"><label>${onLabel}</label><select id="routeNext">${stepOpts(cfg.next_step_id)}</select></div>
        ${step.step_type !== "order" ? `<div class="form-field"><label>If declined, go to</label><select id="routeDecline">${stepOpts(cfg.decline_step_id)}</select></div>` : ""}
      </div>`;
    }
    return `<div style="display:flex;flex-direction:column;gap:14px">
      ${typeSeg}${orderCfg}${routing}
      ${canWrite() ? `<button class="btn btn-primary" id="saveStepCfg">${svg("check", 15)} Save configuration</button>` : `<p class="muted">You have read-only access to this funnel.</p>`}
    </div>`;
  }
  function prodRow(p, i, cur) {
    return `<div class="prod-row" data-prod="${i}">
      <input data-pf="name" placeholder="Product name" value="${esc(p.name || "")}">
      <input data-pf="price" class="num" placeholder="0.00" value="${p.price ? (p.price / 100).toFixed(2) : ""}">
      <button class="prod-del" data-proddel="${i}" title="Remove">${svg("trash", 14)}</button>
    </div>`;
  }
  function bumpRow(b, i) {
    return `<div class="prod-row" data-bump="${i}">
      <input data-bf="name" placeholder="Bump name" value="${esc(b.name || "")}">
      <input data-bf="price" class="num" placeholder="0.00" value="${b.price ? (b.price / 100).toFixed(2) : ""}">
      <button class="prod-del" data-bumpdel="${i}" title="Remove">${svg("trash", 14)}</button>
    </div>`;
  }
  function drawerSplit(step, f) {
    const sp = step._splitStats;   // populated on drawer open (live) / from mock
    if (!sp) {
      const otherPages = state.pages.filter((p) => p.id !== step.page_id);
      return `<div class="split-wrap">
        <p class="muted" style="font-size:13px">No A/B test on this step. Create one to serve two (or three) page variants, split the traffic, and let AiMindShare detect a winner by significance.</p>
        <div class="form-field"><label>Variant B page</label>
          <select id="splitPage">${otherPages.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join("")}</select></div>
        <div class="form-grid">
          <div class="form-field"><label>Traffic to B (%)</label><input id="splitPct" class="num" value="50"></div>
          <div class="form-field"><label>Goal</label><select id="splitGoal"><option value="progression">Step progression</option><option value="purchase">Purchase</option></select></div>
        </div>
        <div class="bump-toggle"><span style="color:var(--gold-500)">${svg("split", 16)}</span>
          <div style="flex:1"><div style="font-size:13px;color:var(--ink-900)">Add variant C</div>
            <div style="font-size:11.5px;color:var(--ink-400)">Test a third page variant alongside A/B.</div></div>
          <label style="font-size:12px;color:var(--ink-500)"><input type="checkbox" id="splitCOn"> enable</label></div>
        <div class="form-grid" id="splitCFields" style="display:none">
          <div class="form-field"><label>Variant C page</label>
            <select id="splitCPage">${otherPages.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join("")}</select></div>
          <div class="form-field"><label>Traffic to C (%)</label><input id="splitCPct" class="num" value="25"></div>
        </div>
        <div class="form-grid">
          <div class="form-field"><label>Min. sample size / arm</label><input id="splitMinN" class="num" value="30"></div>
          <div class="form-field"><label>Confidence</label><select id="splitConfidence">
            <option value="0.90">90%</option><option value="0.95" selected>95%</option><option value="0.99">99%</option></select></div>
        </div>
        <label style="font-size:12px;color:var(--ink-500);display:flex;align-items:center;gap:8px"><input type="checkbox" id="splitAutoPromote"> Auto-promote the winner once significant</label>
        ${canWrite() ? `<button class="btn btn-primary" id="createSplit">${svg("split", 15)} Start test</button>` : ""}
      </div>`;
    }
    const winnerBanner = sp.status === "promoted"
      ? `<div class="split-winner"><div class="sw-ico">${svg("trophy", 16)}</div><div class="sw-body">
          <div class="sw-title">Variant ${sp.winner} promoted</div><div class="sw-sub">Live traffic now goes to the winning page.</div></div></div>`
      : sp.significant
        ? `<div class="split-winner"><div class="sw-ico">${svg("check", 16)}</div><div class="sw-body">
            <div class="sw-title">Variant ${sp.leader} is winning — statistically significant</div>
            <div class="sw-sub">z = ${sp.z} (${pct((sp.confidence ?? 0.95) * 100)} confidence). Safe to promote.</div></div>
            ${canManage() ? `<button class="btn btn-gold btn-sm" id="promoteWin" data-variant="${sp.leader}">${svg("trophy", 14)} Promote ${sp.leader}</button>` : ""}</div>`
        : `<div class="split-winner pending"><div class="sw-ico">${svg("split", 16)}</div><div class="sw-body">
            <div class="sw-title">Test running — no clear winner yet</div>
            <div class="sw-sub">z = ${sp.z}. Keep sampling until every arm clears ${sp.min_sample_size ?? 30} visitors at ${pct((sp.confidence ?? 0.95) * 100)}.</div></div></div>`;
    const variant = (key, label, v, pageTitle, lead) => `<div class="variant ${key} ${lead ? "lead" : ""}">
      <div class="v-tag">${svg(key === "a" ? "flag" : "split", 11)} Variant ${label}${lead ? " · leading" : ""}</div>
      <div class="v-rate">${pct(v.rate)}</div>
      <div class="v-detail">${fmtInt(v.conversions)} / ${fmtInt(v.visitors)} converted</div>
      <div class="v-page">${esc(pageTitle || "—")}</div></div>`;
    const hasC = sp.has_c && sp.c;
    return `<div class="split-wrap">
      ${winnerBanner}
      <div class="variant-grid ${hasC ? "three" : ""}">
        ${variant("a", "A", sp.a, step.page_title, sp.leader === "A")}
        ${variant("b", "B", sp.b, sp.variant_page_title || "Variant B page", sp.leader === "B")}
        ${hasC ? variant("c", "C", sp.c, sp.variant_c_page_title || "Variant C page", sp.leader === "C") : ""}
      </div>
      ${sp.auto_promote ? `<p class="muted" style="font-size:12px">${svg("zap", 12)} Auto-promote is on — the winner is promoted automatically once significant.</p>` : ""}
      ${sp.status !== "promoted" && canManage() ? `<div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" id="promoteA" data-variant="A">Promote A</button>
        <button class="btn btn-ghost btn-sm" id="promoteB" data-variant="B">Promote B</button>
        ${hasC ? `<button class="btn btn-ghost btn-sm" id="promoteC" data-variant="C">Promote C</button>` : ""}
        <button class="btn btn-ghost btn-sm" id="stopSplit" style="color:var(--status-danger);border-color:var(--status-danger)">${svg("trash", 14)} Stop test</button>
      </div>` : ""}
    </div>`;
  }

  /* ── Shared state blocks (Gate-5) ────────────────────────────────────────── */
  function loadingBlock() {
    return previewStrip() + `<div class="fn-head"><div><div class="eyebrow">${svg("funnel", 13)} Acquisition · M20</div><div class="ph-title">Conversion <em>funnels</em></div></div></div>
      <div class="rev-strip">${[0, 1, 2, 3].map(() => `<div class="kpi"><div class="skeleton" style="height:34px;width:34px;border-radius:10px"></div><div class="skeleton" style="height:22px;width:60%;margin-top:14px"></div><div class="skeleton" style="height:10px;width:40%;margin-top:10px"></div></div>`).join("")}</div>
      <div class="fn-grid">${[0, 1, 2].map(() => `<div class="panel" style="padding:22px"><div class="skeleton" style="height:40px;width:40px;border-radius:14px"></div><div class="skeleton" style="height:18px;width:70%;margin-top:14px"></div><div class="skeleton" style="height:44px;margin-top:16px;border-radius:10px"></div></div>`).join("")}</div>`;
  }
  function errorBlock() {
    const msg = state.error || "We couldn't reach the server.";
    return previewStrip() + `<div class="panel probe state-error" style="padding:40px;text-align:center">
      <div style="color:var(--status-danger);margin-bottom:10px">${svg("flag", 28)}</div>
      <div style="font-family:var(--font-serif);font-size:22px;color:var(--ink-900)">Something went wrong</div>
      <p class="muted" style="margin:8px auto 18px;max-width:420px">${esc(msg)}</p>
      <button class="btn btn-primary" id="retry">Try again</button></div>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Render dispatch + event wiring
     ══════════════════════════════════════════════════════════════════════════ */
  function render() {
    const app = $("#app"); app.classList.add("shell");
    app.innerHTML = state.route.name === "funnel" ? viewFunnel() : viewModule();
    // step drawer overlay
    const existing = $("#stepDrawer"); if (existing) existing.remove();
    if (state.drawer) { document.body.insertAdjacentHTML("beforeend", stepDrawerHtml()); scrim.classList.add("open"); }
    document.body.classList.add("js-ready");
    wireCommon();
    if (state.route.name === "funnel") wireFunnel(); else wireModule();
    if (state.drawer) wireStepDrawer();
  }
  function renderConn() {
    const pill = $("#connPill");
    if (pill) { const on = connected(); pill.textContent = on ? "live" : "mockup mode"; pill.classList.toggle("live", on); }
  }
  function wireCommon() {
    const burger = $("#railBurger"); if (burger) burger.addEventListener("click", () => $("#rail").classList.toggle("open"));
    $$("[data-hash]").forEach((n) => n.addEventListener("click", () => { location.hash = n.dataset.hash; $("#rail")?.classList.remove("open"); }));
    const tt = $("#themeToggle"); if (tt) tt.addEventListener("click", () => setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"));
    const oc = $("#openConnect2"); if (oc) oc.addEventListener("click", openDrawer);
    $$("[data-preview]").forEach((b) => b.addEventListener("click", () => { state.previewState = b.dataset.preview; state.drawer = null; render(); }));
    const retry = $("#retry"); if (retry) retry.addEventListener("click", () => { state.previewState = "default"; boot(); });
    renderConn();
  }
  function wireList() {
    ["newFunnel", "newFunnel2"].forEach((id) => { const b = $("#" + id); if (b) b.addEventListener("click", newFunnelModal); });
    $("#goStudio")?.addEventListener("click", () => { location.hash = "#/funnels/studio"; });
    $$("[data-funnel]").forEach((c) => c.addEventListener("click", () => { location.hash = "#/funnels/" + c.dataset.funnel; }));
    $$("[data-cardmenu]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation(); state.cardMenu = state.cardMenu === b.dataset.cardmenu ? null : b.dataset.cardmenu; render();
    }));
    $$("[data-dupfunnel]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); state.cardMenu = null; duplicateFunnel(b.dataset.dupfunnel, false); }));
    $$("[data-tmplfunnel]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); state.cardMenu = null; duplicateFunnel(b.dataset.tmplfunnel, true); }));
  }
  function wireModule() {
    wireList();
    if (state.route.section === "studio") wireStudio();
    $$("[data-usetmpl]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); createFromTemplate(b.dataset.usetmpl); }));
    $$("[data-deltmpl]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); deleteTemplate(b.dataset.deltmpl); }));
    $("#saveModuleSettings")?.addEventListener("click", () => {
      saveModuleDefaults({ currency: $("#setDefCurrency").value.trim() || "USD", testModeDefault: $("#setDefTestMode").checked });
      toast("Defaults saved.", "success");
    });
  }
  function deleteTemplate(id) {
    const t = state.funnels.find((f) => f.id === id); if (!t) return;
    confirmModal("Delete template?", `“${esc(t.name)}” will be removed. Funnels already created from it are unaffected.`, async () => {
      if (!connected()) { state.funnels = state.funnels.filter((f) => f.id !== id); toast("Template deleted.", "success"); render(); return; }
      try { const c = ensureClient(); const { error } = await c.from("funnels").update({ archived_at: new Date().toISOString(), status: "archived" }).eq("id", id); if (error) throw error; toast("Template deleted.", "success"); await loadFunnels(state.workspaceId); render(); }
      catch (e) { toast("Delete failed: " + e.message, "danger"); }
    });
  }
  async function duplicateFunnel(id, asTemplate) {
    if (!connected()) {
      const src = state.funnels.find((f) => f.id === id);
      const dup = JSON.parse(JSON.stringify(src || {}));
      dup.id = (asTemplate ? "tmpl" : "fn") + Date.now();
      dup.name = (src?.name || "Funnel") + (asTemplate ? " (Template)" : " (Copy)");
      dup.status = "draft"; dup.test_mode = false; dup.is_template = asTemplate; dup.template_of_id = id; dup.split = null;
      if (asTemplate) { dup.site_id = null; (dup.steps || []).forEach((st2) => { st2.page_id = null; st2.page_title = "No page yet"; }); }
      state.funnels.unshift(dup);
      toast(asTemplate ? "Saved as template." : "Funnel duplicated.", "success");
      render();
      return;
    }
    try {
      const c = ensureClient();
      const { data, error } = await c.rpc("duplicate_funnel", { p_funnel: id, p_as_template: asTemplate });
      if (error) throw error;
      toast(asTemplate ? "Saved as template." : "Funnel duplicated.", "success");
      await loadFunnels(state.workspaceId);
      if (!asTemplate) location.hash = "#/funnels/" + data.id; else render();
    } catch (e) { toast("Couldn't duplicate: " + e.message, "danger"); }
  }
  async function createFromTemplate(tmplId) {
    if (!connected()) {
      const t = state.funnels.find((f) => f.id === tmplId);
      const dup = JSON.parse(JSON.stringify(t || {}));
      dup.id = "fn" + Date.now();
      dup.name = (t?.name || "Funnel").replace(/ \(Template\)$/, "");
      dup.status = "draft"; dup.is_template = false; dup.template_of_id = tmplId; dup.readiness = { ready: false, blockers: [], warnings: [] };
      dup.revenue = { revenue: 0, orders: 0, aov: 0, epc: 0, visitors: 0, by_step: [], by_source: [] };
      state.funnels.unshift(dup);
      toast("Funnel created from template.", "success");
      location.hash = "#/funnels/" + dup.id;
      return;
    }
    try {
      const c = ensureClient();
      const { data, error } = await c.rpc("duplicate_funnel", { p_funnel: tmplId, p_as_template: false });
      if (error) throw error;
      toast("Funnel created from template.", "success");
      await loadFunnels(state.workspaceId);
      location.hash = "#/funnels/" + data.id;
    } catch (e) { toast("Couldn't create from template: " + e.message, "danger"); }
  }
  function wireFunnel() {
    $$("[data-step]").forEach((c) => c.addEventListener("click", () => openStep(c.dataset.step)));
    ["addStep", "addStep0"].forEach((id) => { const b = $("#" + id); if (b) b.addEventListener("click", addStep); });
    const ss = $("#saveSettings"); if (ss) ss.addEventListener("click", saveSettings);
    const df = $("#delFunnel"); if (df) df.addEventListener("click", deleteFunnel);
    $$("#statusSeg [data-status]").forEach((b) => b.addEventListener("click", () => updateFunnelStatus(b.dataset.status)));
    const tm = $("#testModeToggle"); if (tm) tm.addEventListener("change", () => toggleTestMode(tm.checked));
    $("#addAccess")?.addEventListener("click", () => { const uid = $("#accessPick")?.value; if (uid) setFunnelAccess(uid, true, false); });
    $$("[data-accesspreset]").forEach((sel) => sel.addEventListener("change", () => {
      const preset = ROLE_PRESET[sel.value]; if (preset) setFunnelAccess(sel.dataset.accesspreset, preset.can_edit, preset.can_view_analytics);
    }));
    $$("[data-accessdel]").forEach((b) => b.addEventListener("click", () => removeFunnelAccess(b.dataset.accessdel)));
    $$("[data-variantstep]").forEach((b) => b.addEventListener("click", () => openStep(b.dataset.variantstep, "split")));
    $("#openInAffHub")?.addEventListener("click", () => { location.href = "m29-affiliate-hub.html#/affiliate/offers"; });
    $$("[data-checkoutstep]").forEach((b) => b.addEventListener("click", () => openStep(b.dataset.checkoutstep, "config")));
    $("#tmplDuplicate")?.addEventListener("click", () => duplicateFunnel(state.active.id, false));
    $("#tmplSave")?.addEventListener("click", () => duplicateFunnel(state.active.id, true));
    $("#anApply")?.addEventListener("click", () => {
      const from = $("#anFrom")?.value, to = $("#anTo")?.value;
      if (!connected()) { toast("Date-range filtering needs a connected project.", "info"); return; }
      loadDetailRange(from ? new Date(from).toISOString() : null, to ? new Date(to + "T23:59:59").toISOString() : null);
    });
    $("#anClear")?.addEventListener("click", () => {
      if ($("#anFrom")) $("#anFrom").value = ""; if ($("#anTo")) $("#anTo").value = "";
      if (connected()) loadDetailRange(null, null);
    });
  }
  async function setFunnelAccess(userId, canEdit, canViewAnalytics) {
    const f = state.active; if (!f) return;
    if (!connected()) {
      f.access = f.access || [];
      const existing = f.access.find((a) => a.user_id === userId);
      const member = (state.members || []).find((m) => m.user_id === userId);
      if (existing) { existing.can_edit = canEdit; existing.can_view_analytics = canViewAnalytics; }
      else f.access.push({ user_id: userId, can_edit: canEdit, can_view_analytics: canViewAnalytics, profiles: member?.profiles });
      toast("Access updated.", "success"); render(); return;
    }
    try {
      const c = ensureClient();
      const { error } = await c.rpc("set_funnel_access", { p_funnel: f.id, p_user: userId, p_can_edit: canEdit, p_can_view_analytics: canViewAnalytics });
      if (error) throw error;
      toast("Access updated.", "success"); await loadDetail(f.id); render();
    } catch (e) { toast("Couldn't update access: " + e.message, "danger"); }
  }
  async function removeFunnelAccess(userId) {
    const f = state.active; if (!f) return;
    if (!connected()) { f.access = (f.access || []).filter((a) => a.user_id !== userId); toast("Restriction removed.", "success"); render(); return; }
    try {
      const c = ensureClient();
      const { error } = await c.rpc("remove_funnel_access", { p_funnel: f.id, p_user: userId });
      if (error) throw error;
      toast("Restriction removed.", "success"); await loadDetail(f.id); render();
    } catch (e) { toast("Couldn't remove access: " + e.message, "danger"); }
  }

  async function updateFunnelStatus(status) {
    const f = state.active; if (!f || f.status === status) return;
    if (status === "active" && f.status !== "active") {
      const scan = connected() ? (f.compliance || { high_count: 0, medium_count: 0 }) : localComplianceScan(f.steps);
      if (scan.high_count > 0 || scan.medium_count > 0) {
        const close = modal(`<div class="mc-head"><div class="mc-ico" style="background:var(--status-danger)">${svg("flag", 18)}</div>
          <div><h3>Compliance findings before going live</h3><div class="mc-sub">${scan.high_count} high-risk, ${scan.medium_count} medium-risk phrase${(scan.high_count + scan.medium_count) === 1 ? "" : "s"} found in this funnel's copy.</div></div></div>
          <p class="muted" style="font-size:13px">Review the Compliance tab before publishing, or continue anyway.</p>
          <div class="mc-foot"><button class="btn btn-ghost" id="cCancel">Review first</button><button class="btn btn-primary" id="cYes">Publish anyway</button></div>`);
        $("#cCancel").addEventListener("click", () => { close(); location.hash = `#/funnels/${f.id}/compliance`; });
        $("#cYes").addEventListener("click", () => { close(); applyFunnelStatus(f, status); });
        return;
      }
    }
    await applyFunnelStatus(f, status);
  }
  async function applyFunnelStatus(f, status) {
    f.status = status;
    if (!connected()) { const mf = state.funnels.find((x) => x.id === f.id); if (mf) mf.status = status; toast(`Status set to ${STATUS_LABEL[status]}.`, "success"); render(); return; }
    try { const c = ensureClient(); const { error } = await c.rpc("set_funnel_status", { p_funnel: f.id, p_status: status }); if (error) throw error; toast(`Status set to ${STATUS_LABEL[status]}.`, "success"); await loadFunnels(state.workspaceId); render(); }
    catch (e) { toast("Couldn't update status: " + e.message, "danger"); }
  }
  async function toggleTestMode(on) {
    const f = state.active; if (!f) return;
    f.test_mode = on;
    if (!connected()) { const mf = state.funnels.find((x) => x.id === f.id); if (mf) mf.test_mode = on; toast(on ? "Test mode enabled." : "Test mode disabled.", "success"); return; }
    try { const c = ensureClient(); const { error } = await c.from("funnels").update({ test_mode: on }).eq("id", f.id); if (error) throw error; toast(on ? "Test mode enabled." : "Test mode disabled.", "success"); }
    catch (e) { toast("Couldn't update test mode: " + e.message, "danger"); render(); }
  }

  async function openStep(stepId, tab = "page") {
    state.drawer = { stepId, tab };
    // load live split stats for the split tab (best-effort)
    const step = (state.active?.steps || []).find((s) => s.id === stepId);
    if (step) step._splitStats = await splitStatsFor(step);
    render();
  }
  async function splitStatsFor(step) {
    if (!connected()) {   // mock: read from the funnel's single split object
      const mf = MOCK.funnels.find((f) => f.id === state.active?.id);
      const sp = mf?.split && mf.split.step_id === step.id ? mf.split : null;
      return sp ? { ...sp } : null;
    }
    const sp = state.active?.splitByStep?.[step.id];
    if (!sp) return null;
    try {
      const c = ensureClient();
      const { data } = await c.rpc("funnel_split_stats", { p_step: step.id });
      const pageById = Object.fromEntries(state.pages.map((p) => [p.id, p]));
      return data ? { ...data, variant_page_id: sp.variant_page_id, variant_page_title: pageById[sp.variant_page_id]?.title } : null;
    } catch (e) { return null; }
  }

  function wireStepDrawer() {
    const close = () => { state.drawer = null; scrim.classList.remove("open"); render(); };
    $("#closeStep")?.addEventListener("click", close);
    // one-time scrim close for the step drawer
    scrim.addEventListener("click", close, { once: true });
    $$("[data-sdtab]").forEach((t) => t.addEventListener("click", () => { state.drawer.tab = t.dataset.sdtab; render(); }));
    const step = (state.active?.steps || []).find((s) => s.id === state.drawer.stepId);
    if (!step) return;

    // page tab
    $("#saveStepPage")?.addEventListener("click", () => saveStep(step, { page_id: $("#stepPage").value || null, name: $("#stepName").value.trim() }));
    $("#openPage")?.addEventListener("click", () => toast("Opens the page in the M19 Sites editor (site-render).", "info"));
    // config tab
    $$("#stepTypeSeg [data-type]").forEach((b) => b.addEventListener("click", () => { step.step_type = b.dataset.type; render(); }));
    $("#addProd")?.addEventListener("click", () => {
      step.config = step.config || {}; step.config.products = (step.config.products || []); step.config.products.push({ name: "", price: 0 }); render();
    });
    $$("[data-proddel]").forEach((b) => b.addEventListener("click", () => {
      const i = +b.dataset.proddel; readProds(step); step.config.products.splice(i, 1); render();
    }));
    $("#addBump")?.addEventListener("click", () => {
      step.config = step.config || {}; step.config.bumps = (step.config.bumps || (step.config.bump ? [step.config.bump] : []));
      step.config.bumps.push({ name: "", price: 0 }); delete step.config.bump; render();
    });
    $$("[data-bumpdel]").forEach((b) => b.addEventListener("click", () => {
      const i = +b.dataset.bumpdel; readBumps(step); step.config.bumps.splice(i, 1); render();
    }));
    $("#saveStepCfg")?.addEventListener("click", () => {
      readProds(step); readBumps(step);
      step.config = step.config || {};
      step.config.next_step_id = $("#routeNext")?.value || null;
      const declineSel = $("#routeDecline"); if (declineSel) step.config.decline_step_id = declineSel.value || null;
      const couponCode = $("#couponCode")?.value.trim();
      step.config.coupon = couponCode ? { code: couponCode, percent_off: Number($("#couponPct")?.value) || 0 } : null;
      saveStep(step, { step_type: step.step_type, config: step.config });
    });
    // split tab
    $("#splitCOn")?.addEventListener("change", (e) => { const f = $("#splitCFields"); if (f) f.style.display = e.target.checked ? "" : "none"; });
    $("#createSplit")?.addEventListener("click", () => createSplit(step));
    ["promoteWin", "promoteA", "promoteB", "promoteC"].forEach((id) => { const b = $("#" + id); if (b) b.addEventListener("click", () => promote(step, b.dataset.variant)); });
    $("#stopSplit")?.addEventListener("click", () => stopSplit(step));
  }
  function readProds(step) {
    step.config = step.config || {};
    step.config.products = $$("#prodRows .prod-row").map((r) => ({
      name: $("[data-pf=name]", r).value.trim(),
      price: Math.round((parseFloat($("[data-pf=price]", r).value) || 0) * 100),
    })).filter((p) => p.name);
  }
  function readBumps(step) {
    step.config = step.config || {};
    step.config.bumps = $$("#bumpRows .prod-row").map((r) => ({
      name: $("[data-bf=name]", r).value.trim(),
      price: Math.round((parseFloat($("[data-bf=price]", r).value) || 0) * 100),
    })).filter((b) => b.name);
    delete step.config.bump;
  }

  /* ── Writes (live via Supabase; mock updates local state) ────────────────── */
  async function saveStep(step, patch) {
    Object.assign(step, patch);
    if (patch.page_id) step.page_title = state.pages.find((p) => p.id === patch.page_id)?.title || step.page_title;
    if (!connected()) { toast("Step saved.", "success"); state.drawer = null; render(); return; }
    try {
      const c = ensureClient();
      const { error } = await c.from("funnel_steps").update({
        page_id: step.page_id || null, name: step.name, step_type: step.step_type, config: step.config || {},
      }).eq("id", step.id);
      if (error) throw error;
      toast("Step saved.", "success"); state.drawer = null; await loadDetail(state.active.id); render();
    } catch (e) { toast("Save failed: " + e.message, "danger"); }
  }
  async function addStep() {
    const f = state.active; const order = (f.steps || []).length;
    if (!connected()) {
      const id = "s" + Date.now();
      f.steps.push({ id, step_type: order === 0 ? "optin" : "sales", name: "New step", page_id: null, page_title: "No page yet", step_order: order, visitors: 0, conversions: 0, rate: 0, has_split: false });
      toast("Step added — pick a page.", "success"); openStep(id); return;
    }
    try {
      const c = ensureClient();
      const { data, error } = await c.from("funnel_steps").insert({
        workspace_id: state.workspaceId, funnel_id: f.id, step_order: order,
        step_type: order === 0 ? "optin" : "sales", name: "New step",
      }).select().single();
      if (error) throw error;
      await loadDetail(f.id); openStep(data.id);
    } catch (e) { toast("Couldn't add step: " + e.message, "danger"); }
  }
  async function createSplit(step) {
    const pageId = $("#splitPage")?.value; const splitPct = +($("#splitPct")?.value || 50); const goal = $("#splitGoal")?.value || "progression";
    const cOn = $("#splitCOn")?.checked; const cPageId = $("#splitCPage")?.value; const cPct = +($("#splitCPct")?.value || 25);
    const minN = +($("#splitMinN")?.value || 30); const confidence = +($("#splitConfidence")?.value || 0.95);
    const autoPromote = !!$("#splitAutoPromote")?.checked;
    if (!pageId) { toast("Pick a variant B page.", "danger"); return; }
    if (cOn && !cPageId) { toast("Pick a variant C page.", "danger"); return; }
    const patch = {
      workspace_id: state.workspaceId, step_id: step.id, variant_page_id: pageId, split: splitPct, goal,
      variant_c_page_id: cOn ? cPageId : null, split_c: cOn ? cPct : null,
      min_sample_size: minN, confidence, auto_promote: autoPromote,
    };
    if (!connected()) { toast("Test started (mockup).", "success"); step.has_split = true; state.drawer.tab = "split"; render(); return; }
    try {
      const c = ensureClient();
      const { error } = await c.from("funnel_splits").insert(patch);
      if (error) throw error;
      toast("Test started.", "success"); await loadDetail(state.active.id); openStep(step.id); state.drawer.tab = "split"; render();
    } catch (e) { toast("Couldn't start test: " + e.message, "danger"); }
  }
  async function promote(step, variant) {
    if (!connected()) { toast(`Variant ${variant} promoted (mockup).`, "success"); if (step._splitStats) { step._splitStats.status = "promoted"; step._splitStats.winner = variant; } render(); return; }
    try {
      const c = ensureClient();
      const { error } = await c.rpc("promote_split_winner", { p_step: step.id, p_variant: variant });
      if (error) throw error;
      toast(`Variant ${variant} promoted — live traffic updated.`, "success");
      await loadDetail(state.active.id); step._splitStats = await splitStatsFor(step); render();
    } catch (e) { toast("Promote failed: " + e.message, "danger"); }
  }
  async function stopSplit(step) {
    if (!connected()) { toast("Test stopped (mockup).", "success"); if (step._splitStats) step._splitStats.status = "stopped"; render(); return; }
    try {
      const c = ensureClient();
      const { error } = await c.rpc("stop_split", { p_step: step.id });
      if (error) throw error;
      toast("Test stopped.", "success");
      await loadDetail(state.active.id); step._splitStats = await splitStatsFor(step); render();
    } catch (e) { toast("Couldn't stop test: " + e.message, "danger"); }
  }
  async function saveSettings() {
    const f = state.active;
    const s = f.settings || {};
    const patch = {
      ...s,
      pipeline: $("#setPipeline") ? ($("#setPipeline").value.trim() || undefined) : s.pipeline,
      stage: $("#setStage") ? ($("#setStage").value.trim() || undefined) : s.stage,
      abandon_hours: $("#setAbandon") ? +($("#setAbandon").value || 1) : (s.abandon_hours ?? 1),
    };
    f.settings = patch;
    if (!connected()) { toast("Settings saved.", "success"); return; }
    try { const c = ensureClient(); const { error } = await c.from("funnels").update({ settings: patch }).eq("id", f.id); if (error) throw error; toast("Settings saved.", "success"); }
    catch (e) { toast("Save failed: " + e.message, "danger"); }
  }
  async function deleteFunnel() {
    const f = state.active;
    confirmModal("Delete funnel?", `“${esc(f.name)}” and its steps will be removed. This cannot be undone.`, async () => {
      if (!connected()) { state.funnels = state.funnels.filter((x) => x.id !== f.id); toast("Funnel deleted.", "success"); location.hash = "#/funnels"; return; }
      try { const c = ensureClient(); const { error } = await c.from("funnels").update({ archived_at: new Date().toISOString(), status: "archived" }).eq("id", f.id); if (error) throw error; toast("Funnel deleted.", "success"); location.hash = "#/funnels"; boot(); }
      catch (e) { toast("Delete failed: " + e.message, "danger"); }
    });
  }

  /* ── Modals ──────────────────────────────────────────────────────────────── */
  function modal(html) {
    const root = $("#modalRoot");
    root.innerHTML = `<div class="modal-scrim open" id="mScrim"><div class="modal-card">${html}</div></div>`;
    const close = () => { root.innerHTML = ""; };
    $("#mScrim").addEventListener("click", (e) => { if (e.target.id === "mScrim") close(); });
    return close;
  }
  function newFunnelModal() {
    const templates = state.funnels.filter((f) => f.is_template);
    const tmplHtml = templates.length ? `<div class="form-field full"><label>Or start from a template</label>
      <div class="seg" id="tmplSeg" style="flex-wrap:wrap">${templates.map((t) => `<button data-tmpl="${t.id}">${esc(t.name)}</button>`).join("")}</div>
      <span class="hint">Copies the template's steps into a new draft funnel.</span></div>` : "";
    const close = modal(`<div class="mc-head"><div class="mc-ico">${svg("funnel", 18)}</div>
      <div><h3>New funnel</h3><div class="mc-sub">Name it — you'll add steps and pick pages next.</div></div>
      <button class="icon-btn mc-close" id="mClose">✕</button></div>
      <div class="form-field full"><label>Funnel name</label><input id="fnName" placeholder="e.g. Ramadan Reset Launch" autofocus></div>
      ${tmplHtml}
      <div class="mc-foot"><button class="btn btn-ghost" id="mCancel">Cancel</button><button class="btn btn-primary" id="mCreate">${svg("plus", 15)} Create funnel</button></div>`);
    $("#mClose").addEventListener("click", close); $("#mCancel").addEventListener("click", close);
    $$("#tmplSeg [data-tmpl]").forEach((b) => b.addEventListener("click", () => { close(); createFromTemplate(b.dataset.tmpl); }));
    const create = async () => {
      const name = $("#fnName").value.trim(); if (!name) { $("#fnName").focus(); return; }
      const d = moduleDefaults();
      if (!connected()) { const id = "fn" + Date.now(); state.funnels.unshift({ id, name, status: "draft", currency: d.currency, test_mode: d.testModeDefault, settings: { currency: d.currency }, steps: [], split: null }); close(); toast("Funnel created.", "success"); location.hash = "#/funnels/" + id; return; }
      try { const c = ensureClient(); const { data, error } = await c.from("funnels").insert({ workspace_id: state.workspaceId, name, status: "draft", test_mode: d.testModeDefault, settings: { currency: d.currency } }).select().single(); if (error) throw error; close(); toast("Funnel created.", "success"); await loadFunnels(state.workspaceId); location.hash = "#/funnels/" + data.id; }
      catch (e) { toast("Create failed: " + e.message, "danger"); }
    };
    $("#mCreate").addEventListener("click", create);
    $("#fnName").addEventListener("keydown", (e) => { if (e.key === "Enter") create(); });
  }
  function confirmModal(title, sub, onYes) {
    const close = modal(`<div class="mc-head"><div class="mc-ico" style="background:var(--status-danger)">${svg("trash", 18)}</div>
      <div><h3>${title}</h3><div class="mc-sub">${sub}</div></div></div>
      <div class="mc-foot"><button class="btn btn-ghost" id="cCancel">Cancel</button><button class="btn btn-primary" id="cYes" style="background:var(--status-danger)">Delete</button></div>`);
    $("#cCancel").addEventListener("click", close);
    $("#cYes").addEventListener("click", () => { close(); onYes(); });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
