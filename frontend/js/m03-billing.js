/* m03-billing.js — AiMindShare Module M03 · Billing & Usage Metering.
   Vanilla hash-routed dashboard on Supabase. Two screens: /settings/billing (plan,
   Stripe checkout/portal, trial state, invoices) and /settings/usage (per-meter
   bars vs plan limits, credit wallets, CSV export). The wall is server-side: plan
   gates run in Edge Functions / RLS (has_feature), meters are written only by the
   server (meter_increment); the browser just READS its usage and calls the
   billing-checkout / billing-portal Edge Functions. Anon key only in the browser
   (Law 3). When no project is connected the whole app renders as a high-fidelity
   mockup with a default/empty/loading/error/success preview switcher (Gate-5). */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const initials = (s) => (s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const nextTick = (fn) => setTimeout(fn, 12);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  /* Number formatting — all meter numbers render in --font-mono (D-014). */
  const fmtInt = (n) => Number(n || 0).toLocaleString("en-US");
  const fmtAbbrev = (n) => {
    n = Number(n || 0);
    if (n >= 1e9) return (n / 1e9).toFixed(n % 1e9 ? 1 : 0) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(n % 1e3 ? 1 : 0) + "k";
    return fmtInt(Math.round(n));
  };
  const money = (n) => "$" + Number(n || 0).toLocaleString("en-US");

  /* ── Lucide-style inline icons ──────────────────────────────────────────── */
  const P = {
    card: "M2 5h20v14H2zM2 10h20", gauge: "M12 14l4-4M3.5 18a9 9 0 1 1 17 0",
    zap: "M13 2 3 14h9l-1 8 10-12h-9z", image: "M3 3h18v18H3zM8 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4M21 15l-5-5L5 21",
    search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
    phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z",
    video: "M23 7l-7 5 7 5V7zM1 5h15v14H1z", mail: "M4 4h16v16H4zM22 6l-10 7L2 6",
    msg: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z", sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z",
    wallet: "M20 12V8H6a2 2 0 0 1 0-4h12v4M4 6v12a2 2 0 0 0 2 2h14v-4M18 12a2 2 0 0 0 0 4h4v-4z",
    download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
    plus: "M12 5v14M5 12h14", arrow: "M5 12h14M12 5l7 7-7 7", check: "M20 6 9 17l-5-5", chev: "M6 9l6 6 6-6",
    alert: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
    receipt: "M4 2h16v20l-3-2-2 2-3-2-3 2-2-2-3 2V2zM8 7h8M8 11h8M8 15h5", layers: "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
    settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
    external: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3",
  };
  const svg = (name, size = 17) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${P[name] || ""}"/></svg>`;

  /* ── Meter registry — client mirror of USAGE-METERING §2 (display + behavior). */
  const METERS = [
    { kind: "sms",           label: "SMS",            unit: "messages", behavior: "OVERAGE",   credit: true,  ico: "msg" },
    { kind: "email",         label: "Email",          unit: "emails",   behavior: "SOFT_WARN", credit: false, ico: "mail" },
    { kind: "ai_tokens",     label: "AI tokens",      unit: "tokens",   behavior: "OVERAGE",   credit: true,  ico: "zap" },
    { kind: "image_gen",     label: "Image generation", unit: "images", behavior: "HARD_STOP", credit: true,  ico: "image" },
    { kind: "enrichment",    label: "Enrichment",     unit: "credits",  behavior: "HARD_STOP", credit: true,  ico: "sparkle" },
    { kind: "seo_calls",     label: "SEO API calls",  unit: "calls",    behavior: "OVERAGE",   credit: true,  ico: "search" },
    { kind: "voice_minutes", label: "Voice minutes",  unit: "minutes",  behavior: "HARD_STOP", credit: true,  ico: "phone" },
    { kind: "video_render",  label: "Video renders",  unit: "renders",  behavior: "HARD_STOP", credit: true,  ico: "video" },
  ];
  const TIERS = ["free", "starter", "pro", "agency", "enterprise"];
  const FEATURE_LABELS = [
    ["m16_campaigns", "Campaigns"], ["m21_seo", "SEO engine"], ["m22_content", "Content / CMS"],
    ["m33_agents", "AI agents"], ["m34_voice", "AI voice"], ["m25_video", "Video studio"],
    ["m42_whitelabel", "White-label"], ["public_api", "Public API"],
  ];

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

  /* ── Period helpers (month buckets) ─────────────────────────────────────── */
  function periodKey(offset = 0) {
    const d = new Date(); const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth() - offset, 1));
    return dt.toISOString().slice(0, 10);           // YYYY-MM-01
  }
  function periodLabel(offset = 0) {
    const d = new Date(); const dt = new Date(d.getFullYear(), d.getMonth() - offset, 1);
    return dt.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  }

  /* ── Mockup data (mockup mode only — never a live code path) ─────────────── */
  const PLAN_DEFS = {
    free:      { tier: "free",      name: "Free",       monthly_price: 0,   included: { email: 500, sms: 0, ai_tokens: 50000, image_gen: 10, seo_calls: 0, enrichment: 0, voice_minutes: 0, video_render: 0, seats: 1, workspaces: 1 },       feature_gates: { m16_campaigns: false, m21_seo: false, m22_content: false, m33_agents: false, m34_voice: false, m25_video: false, m42_whitelabel: false, public_api: false } },
    starter:   { tier: "starter",   name: "Starter",    monthly_price: 49,  included: { email: 5000, sms: 500, ai_tokens: 500000, image_gen: 100, seo_calls: 1000, enrichment: 100, voice_minutes: 0, video_render: 0, seats: 3, workspaces: 1 },  feature_gates: { m16_campaigns: true, m21_seo: true, m22_content: true, m33_agents: false, m34_voice: false, m25_video: false, m42_whitelabel: false, public_api: false } },
    pro:       { tier: "pro",       name: "Pro",        monthly_price: 149, included: { email: 25000, sms: 2500, ai_tokens: 3000000, image_gen: 500, seo_calls: 10000, enrichment: 1000, voice_minutes: 200, video_render: 20, seats: 10, workspaces: 3 }, feature_gates: { m16_campaigns: true, m21_seo: true, m22_content: true, m33_agents: true, m34_voice: false, m25_video: false, m42_whitelabel: false, public_api: true } },
    agency:    { tier: "agency",    name: "Agency",     monthly_price: 399, included: { email: 100000, sms: 10000, ai_tokens: 15000000, image_gen: 2000, seo_calls: 50000, enrichment: 5000, voice_minutes: 1000, video_render: 100, seats: null, workspaces: null }, feature_gates: { m16_campaigns: true, m21_seo: true, m22_content: true, m33_agents: true, m34_voice: true, m25_video: true, m42_whitelabel: true, public_api: true } },
    enterprise:{ tier: "enterprise",name: "Enterprise", monthly_price: 0,   included: { seats: null, workspaces: null }, feature_gates: { m16_campaigns: true, m21_seo: true, m22_content: true, m33_agents: true, m34_voice: true, m25_video: true, m42_whitelabel: true, public_api: true } },
  };
  const MOCK = {
    user: { id: "you", email: "aisha@northstar.agency", name: "Aisha Rahman" },
    workspace: { id: "ws-agency", name: "Northstar Agency", kind: "agency", billing_state: "active", seats_used: 6 },
    subscription: { status: "trialing", current_period_end: new Date(Date.now() + 9 * 864e5).toISOString(), plan_tier: "pro" },
    meters: { email: 19800, sms: 2340, ai_tokens: 3120000, image_gen: 512, enrichment: 980, seo_calls: 6400, voice_minutes: 0, video_render: 0 },
    wallets: { ai_tokens: 250000, sms: 500, image_gen: 0 },
    invoices: [
      { id: "in_3", date: "2026-06-01", amount: 149, status: "paid", label: "Pro — June 2026" },
      { id: "in_2", date: "2026-05-01", amount: 149, status: "paid", label: "Pro — May 2026" },
      { id: "in_1", date: "2026-04-01", amount: 149, status: "paid", label: "Pro — April 2026" },
    ],
  };

  /* ── App state ──────────────────────────────────────────────────────────── */
  const state = {
    loaded: false, loading: false, error: null, previewState: "default", periodOffset: 0,
    user: null, workspaceId: null, workspaceName: "", role: "owner", billingState: "active", seatsUsed: null,
    subscription: null, plan: null, plans: [], meters: {}, wallets: {}, invoices: [],
  };
  const PREVIEW_STATES = ["default", "empty", "loading", "error", "success"];
  const st = (name) => !connected() && state.previewState === name;
  const canBill = () => state.role === "owner" || !connected();     // billing.manage is owner-tier
  const feature = (flag) => !!(state.plan && state.plan.feature_gates && state.plan.feature_gates[flag]);

  /* ── Data loading ───────────────────────────────────────────────────────── */
  async function boot() {
    if (connected()) {
      state.loading = true; state.error = null; render();
      try {
        const c = ensureClient();
        const { data: { user } } = await c.auth.getUser();
        state.user = user;
        if (!user) { state.plan = null; state.loaded = true; state.loading = false; renderConn(); render(); return; }

        // Resolve the active workspace (RLS-scoped localStorage selection, D-021).
        const { data: wsRows, error: wsErr } = await c.from("workspaces")
          .select("id,name,parent_workspace_id,plan,billing_state,status").order("created_at");
        if (wsErr) throw wsErr;
        const active = pickActive(wsRows || []);
        if (!active) { state.plan = null; state.loaded = true; state.loading = false; renderConn(); render(); return; }
        state.workspaceId = active.id; state.workspaceName = active.name; state.billingState = active.billing_state || "active";

        const { data: mine } = await c.from("memberships").select("role").eq("workspace_id", active.id).eq("user_id", user.id).maybeSingle();
        state.role = mine?.role || "staff";

        const [{ data: sub }, { data: plansRows }, { count: seats }] = await Promise.all([
          c.from("subscriptions_platform").select("*, plans(*)").eq("workspace_id", active.id).maybeSingle(),
          c.from("plans").select("*").order("monthly_price", { ascending: true }),
          c.from("memberships").select("user_id", { count: "exact", head: true }).eq("workspace_id", active.id).eq("status", "active"),
        ]);
        state.subscription = sub || null;
        state.plan = sub?.plans || null;
        state.plans = plansRows || [];
        state.seatsUsed = seats ?? null;

        await loadUsage(active.id);
      } catch (e) { state.error = e.message || String(e); }
      state.loading = false; state.loaded = true;
    } else {
      // Mockup mode
      state.user = MOCK.user; state.workspaceId = MOCK.workspace.id; state.workspaceName = MOCK.workspace.name;
      state.role = "owner"; state.billingState = MOCK.workspace.billing_state; state.seatsUsed = MOCK.workspace.seats_used;
      state.subscription = { ...MOCK.subscription };
      state.plan = PLAN_DEFS[MOCK.subscription.plan_tier];
      state.plans = TIERS.map((t) => PLAN_DEFS[t]);
      state.meters = { ...MOCK.meters }; state.wallets = { ...MOCK.wallets }; state.invoices = MOCK.invoices.map((i) => ({ ...i }));
      state.loaded = true; state.loading = false;
    }
    renderConn(); render();
  }

  function pickActive(list) {
    const usable = list.filter((w) => w.status !== "archived");
    if (!usable.length) return list[0] || null;
    let id; try { id = localStorage.getItem(ACTIVE_KEY); } catch (e) {}
    return usable.find((w) => w.id === id) || usable[0];
  }

  async function loadUsage(wsId) {
    const c = ensureClient();
    const [{ data: meters }, { data: wallets }] = await Promise.all([
      c.from("usage_meters").select("kind,quantity").eq("workspace_id", wsId).eq("period", periodKey(state.periodOffset)),
      c.from("credit_wallets").select("kind,balance").eq("workspace_id", wsId),
    ]);
    state.meters = {}; (meters || []).forEach((m) => (state.meters[m.kind] = Number(m.quantity)));
    state.wallets = {}; (wallets || []).forEach((w) => (state.wallets[w.kind] = Number(w.balance)));
    state.invoices = [];   // platform invoices live in Stripe — surfaced via the portal, not a table
  }

  /* ── Connection pill ────────────────────────────────────────────────────── */
  function renderConn() {
    const pill = $("#connPill");
    if (!pill) return;
    if (connected()) { pill.className = "pill success"; pill.textContent = "connected"; }
    else { pill.className = "pill plain"; pill.textContent = "mockup mode"; }
  }

  /* ── Trial / billing-state helpers ──────────────────────────────────────── */
  function trialDaysLeft() {
    const end = state.subscription?.current_period_end; if (!end) return null;
    return Math.ceil((new Date(end).getTime() - Date.now()) / 864e5);
  }
  function billingStatus() {
    const bs = state.billingState, sub = state.subscription?.status;
    if (bs === "trial_expired") return { key: "trial_expired", tone: "danger" };
    if (bs === "past_due" || sub === "past_due") return { key: "past_due", tone: "danger" };
    if (bs === "canceled" || sub === "canceled") return { key: "canceled", tone: "danger" };
    if (sub === "trialing") return { key: "trialing", tone: (trialDaysLeft() ?? 99) <= 3 ? "danger" : "warning" };
    return { key: "active", tone: "ok" };
  }

  /* ── Shell (rail + topbar) ──────────────────────────────────────────────── */
  const NAV = [
    { key: "billing", label: "Billing & plan", ico: "card", hash: "#/settings/billing" },
    { key: "usage", label: "Usage & meters", ico: "gauge", hash: "#/settings/usage" },
  ];
  function trialChip() {
    const bstat = billingStatus();
    if (bstat.key === "trialing") { const d = trialDaysLeft(); return `<button class="trial-chip ${bstat.tone === "danger" ? "danger" : ""}" data-hash="#/settings/billing"><span class="tc-dot"></span>Trial · ${d} day${d === 1 ? "" : "s"} left</button>`; }
    if (bstat.key === "trial_expired") return `<button class="trial-chip danger" data-hash="#/settings/billing"><span class="tc-dot"></span>Trial expired</button>`;
    if (bstat.key === "past_due") return `<button class="trial-chip danger" data-hash="#/settings/billing"><span class="tc-dot"></span>Payment past due</button>`;
    return "";
  }
  function shell(activeKey, content) {
    const nav = NAV.map((n) => `<div class="nav-item ${n.key === activeKey ? "active" : ""}" data-hash="${n.hash}"><span class="ni-ico">${svg(n.ico)}</span><span>${n.label}</span></div>`).join("");
    return `
      <aside class="rail" id="rail">
        <div class="brand"><span class="mark">✦</span><span><b>AiMind</b><em>Share</em></span></div>
        <div class="nav-group"><div class="nav-group-label">Settings</div>${nav}</div>
        <div class="rail-foot">M03 · Billing &amp; Metering</div>
      </aside>
      <header class="tbar">
        <button class="icon-btn rail-burger" id="railBurger" aria-label="Menu">☰</button>
        <div class="ws-trigger" style="cursor:default">
          <span class="ws-badge">${esc(initials(state.workspaceName || "AiMindShare"))}</span>
          <span class="ws-meta"><span class="ws-name">${esc(state.workspaceName || "Workspace")}</span><span class="ws-kind">${esc(state.plan ? state.plan.name + " plan" : "No plan")}</span></span>
        </div>
        <div class="tb-search"><span>${svg("search", 15)}</span><span class="tbs-label">Search…</span><span class="kbd">⌘K</span></div>
        <div class="spacer"></div>
        ${trialChip()}
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
      Connect a project to read live plan &amp; usage and run Stripe checkout. Sample data shown. Preview state:
      ${PREVIEW_STATES.map((s) => `<button class="link ${state.previewState === s ? "on" : ""}" data-preview="${s}">${s}</button>`).join(" ")}</div>`;
  }

  /* ── Meter math ─────────────────────────────────────────────────────────── */
  function meterInfo(kind) {
    const raw = state.plan && state.plan.included ? state.plan.included[kind] : undefined;
    const unlimited = raw === null || raw === undefined;
    const included = unlimited ? null : Number(raw);
    const used = Number(state.meters[kind] || 0);
    const wallet = Number(state.wallets[kind] || 0);
    const capacity = unlimited ? Infinity : included + wallet;
    // Bar tracks used vs the plan's included quota (USAGE-METERING §10: warn 80%,
    // danger 100%); a wallet-only meter (included 0, credits bought) tracks the wallet.
    const denom = unlimited ? Infinity : (included > 0 ? included : wallet);
    const pct = unlimited ? 0 : denom > 0 ? clamp((used / denom) * 100, 0, 100) : (used > 0 ? 100 : 0);
    const over = !unlimited && used > capacity;             // exhausted quota + wallet (gating)
    const notOnPlan = included === 0 && wallet === 0;
    return { unlimited, included, used, wallet, capacity, pct, over, notOnPlan };
  }
  const fillClass = (pct) => (pct >= 100 ? "danger" : pct >= 80 ? "warn" : "");

  /* ═══ VIEW: Billing ═══════════════════════════════════════════════════════ */
  function viewBilling() {
    if (st("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    if (st("error") || state.error) return previewStrip() + errorBlock(state.error || "We couldn't load your billing details.");
    if (st("empty") || (connected() && state.loaded && !state.plan)) return previewStrip() + emptyBilling();

    const plan = state.plan; const bstat = billingStatus();
    const price = plan ? Number(plan.monthly_price) : 0;
    const seatsLimit = plan?.included?.seats ?? null;
    const renew = state.subscription?.current_period_end;
    const days = trialDaysLeft();

    const banner = billingBanner(bstat);
    const successNote = st("success") ? `<div class="mock-note" style="background:rgba(46,158,123,.10);border-color:rgba(46,158,123,.35)"><span class="mn-ico" style="color:var(--status-success)">✓</span> Subscription updated — you're on the ${esc(plan?.name || "")} plan.</div>` : "";

    const kpis = [
      { ico: "layers", val: plan?.name || "—", label: "Current plan", feat: true },
      { ico: "card", val: price ? money(price) : "Custom", sub: price ? "/mo" : "", label: "Monthly price" },
      { ico: "layers", val: `${state.seatsUsed ?? "—"}${seatsLimit ? " / " + seatsLimit : ""}`, label: seatsLimit ? "Seats used" : "Seats (unlimited)" },
      { ico: "receipt", val: renew ? fmtDate(renew) : "—", label: bstat.key === "trialing" ? "Trial ends" : "Renews" },
    ];
    const kpiStrip = `<div class="kpi-strip">${kpis.map((k) => `
      <div class="kpi reveal ${k.feat ? "kpi-featured" : ""}"><div class="kpi-ico">${svg(k.ico, 16)}</div>
        <div class="kpi-val num">${esc(k.val)}${k.sub ? `<span class="cur" style="font-size:14px;color:var(--ink-400)"> ${k.sub}</span>` : ""}</div>
        <div class="kpi-label">${k.label}</div></div>`).join("")}</div>`;

    const planCards = (state.plans.length ? state.plans : TIERS.map((t) => PLAN_DEFS[t]))
      .filter((p) => p.tier !== "enterprise")
      .map((p) => planCard(p, plan)).join("");
    const entCard = planCard(state.plans.find((p) => p.tier === "enterprise") || PLAN_DEFS.enterprise, plan);

    const invoices = billingInvoices();

    return `${previewStrip()}
      <div class="page-head reveal">
        <span class="eyebrow">Module · M03</span>
        <h1 style="margin-top:12px">Billing &amp; <em>plan</em></h1>
        <p class="sub">Manage your platform subscription, compare plans, and reach the Stripe portal for
          payment methods and invoices. Feature access follows your plan's <span class="mono">feature_gates</span>.</p>
      </div>
      ${banner}${successNote}
      ${kpiStrip}
      <div class="sec-head"><h2>Your <em>plan</em></h2><div class="spacer"></div>
        <button class="btn btn-ghost btn-sm" id="portalBtn">${svg("external", 14)} Manage in Stripe</button></div>
      <div class="plan-grid reveal">${planCards}</div>
      <div style="margin-top:16px">${entCard}</div>
      <div class="sec-head" style="margin-top:34px"><h2>Recent <em>invoices</em></h2></div>
      ${invoices}`;
  }

  function billingBanner(bstat) {
    if (bstat.key === "active") return "";
    const days = trialDaysLeft();
    if (bstat.key === "trialing") return `
      <div class="state-banner ${bstat.tone === "danger" ? "warning" : ""} reveal">
        <span class="sb-ico">${svg("sparkle", 16)}</span>
        <div class="sb-body"><div class="sb-title">You're on a <em>free trial</em></div>
          <div class="sb-sub">Add a plan before your trial ends to keep full access. No charge until you upgrade.</div></div>
        <div class="sb-count">${days}<small>day${days === 1 ? "" : "s"} left</small></div>
        <button class="btn btn-gold btn-sm" data-scroll-plans>Choose a plan</button></div>`;
    const copy = {
      trial_expired: ["Your trial has ended", "Your workspace is read-only until you subscribe. Billing and settings stay reachable."],
      past_due: ["Payment past due", "We couldn't process your last payment. Update your card in the Stripe portal to restore access."],
      canceled: ["Subscription canceled", "Your plan was canceled. Re-subscribe any time to restore full access."],
    }[bstat.key] || ["", ""];
    return `<div class="state-banner danger reveal">
      <span class="sb-ico">${svg("alert", 16)}</span>
      <div class="sb-body"><div class="sb-title">${esc(copy[0])}</div><div class="sb-sub">${esc(copy[1])}</div></div>
      <button class="btn btn-gold btn-sm" ${bstat.key === "past_due" ? 'id="portalBtn2"' : "data-scroll-plans"}>${bstat.key === "past_due" ? "Update payment" : "Re-subscribe"}</button></div>`;
  }

  function planCard(p, current) {
    const isCurrent = current && p.tier === current.tier;
    const featured = p.tier === "agency";
    const price = Number(p.monthly_price);
    const inc = p.included || {};
    const feats = [
      inc.email != null ? `${fmtAbbrev(inc.email)} emails/mo` : "Unlimited email",
      inc.ai_tokens != null ? `${fmtAbbrev(inc.ai_tokens)} AI tokens/mo` : "Unlimited AI tokens",
      (inc.seats == null ? "Unlimited seats" : `${inc.seats} seat${inc.seats === 1 ? "" : "s"}`),
    ];
    const gates = FEATURE_LABELS.filter(([f]) => p.feature_gates && p.feature_gates[f]).slice(0, 3).map(([, l]) => l);
    const gateLis = FEATURE_LABELS.slice(0, 4).map(([f, l]) => {
      const on = p.feature_gates && p.feature_gates[f];
      return `<li class="${on ? "" : "off"}"><span class="pf-ck">${on ? svg("check", 13) : "—"}</span>${esc(l)}</li>`;
    }).join("");
    let cta;
    if (isCurrent) cta = `<button class="btn btn-ghost" disabled>Current plan</button>`;
    else if (p.tier === "enterprise") cta = `<button class="btn btn-ghost" data-contact>Contact sales</button>`;
    else if (!canBill()) cta = `<button class="btn btn-ghost" disabled title="Owner only">Owner only</button>`;
    else {
      const isUp = current && TIERS.indexOf(p.tier) > TIERS.indexOf(current.tier);
      cta = `<button class="btn ${featured ? "btn-gold" : "btn-primary"}" data-checkout="${esc(p.tier)}">${isUp ? "Upgrade" : "Switch"} to ${esc(p.name)}</button>`;
    }
    return `<div class="plan-card reveal ${isCurrent ? "is-current" : ""} ${featured ? "is-featured" : ""}">
      ${isCurrent ? `<span class="pc-badge">Current</span>` : featured ? `<span class="pc-badge">Popular</span>` : ""}
      <div class="pc-tier">${esc(p.tier)}</div>
      <div class="pc-name">${esc(p.name)}</div>
      <div class="pc-price">${p.tier === "enterprise" ? `<span style="font-family:var(--font-serif);font-size:22px">Custom</span>` : `<span class="cur">$</span>${price}<span class="per"> /mo</span>`}</div>
      <ul class="pc-feats">${feats.map((f) => `<li><span class="pf-ck">${svg("check", 13)}</span>${esc(f)}</li>`).join("")}${gateLis}</ul>
      <div class="pc-cta">${cta}</div></div>`;
  }

  function billingInvoices() {
    if (!connected()) {
      const rows = state.invoices.map((i) => invoiceRow(i)).join("");
      return `<div class="panel reveal"><div class="row-list">${rows}</div></div>`;
    }
    // Live: platform invoices live in Stripe, not a table — reach them via the portal.
    return `<div class="panel reveal"><div class="empty-state" style="padding:34px 24px">
      <div class="es-ico">${svg("receipt", 22)}</div><h3>Invoices live in Stripe</h3>
      <p>Your paid invoices and receipts are managed by Stripe. Open the billing portal to view or download them.</p>
      <button class="btn btn-ghost es-cta" id="portalBtn3">${svg("external", 14)} Open billing portal</button></div></div>`;
  }
  function invoiceRow(i) {
    return `<div class="data-row"><div class="r-lead">${svg("receipt", 15)}</div>
      <div class="r-body"><div class="r-title">${esc(i.label)}</div><div class="r-meta"><span class="num">${esc(fmtDate(i.date))}</span></div></div>
      <div class="r-right"><span class="pill success">${esc(i.status)}</span><span class="inv-amt">${money(i.amount)}</span></div></div>`;
  }

  /* ═══ VIEW: Usage ═════════════════════════════════════════════════════════ */
  function viewUsage() {
    if (st("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    if (st("error") || state.error) return previewStrip() + errorBlock(state.error || "We couldn't load your usage.");
    if (st("empty") || (connected() && state.loaded && !state.plan)) return previewStrip() + emptyUsage();

    const infos = METERS.map((m) => ({ m, info: meterInfo(m.kind) }));
    const tracked = infos.filter((x) => !x.info.notOnPlan);
    const near = infos.filter((x) => !x.info.unlimited && x.info.pct >= 80 && !x.info.over).length;
    const over = infos.filter((x) => x.info.over).length;
    const walletCount = METERS.filter((m) => (state.wallets[m.kind] || 0) > 0).length;

    const kpis = [
      { ico: "gauge", val: state.plan?.name || "—", label: "Plan", feat: true },
      { ico: "layers", val: tracked.length, label: "Metered features" },
      { ico: "alert", val: near, label: "Near limit (≥80%)" },
      { ico: "alert", val: over, label: "Over limit" },
    ];
    const kpiStrip = `<div class="kpi-strip">${kpis.map((k) => `
      <div class="kpi reveal ${k.feat ? "kpi-featured" : ""}"><div class="kpi-ico">${svg(k.ico, 16)}</div>
        <div class="kpi-val num">${esc(k.val)}</div><div class="kpi-label">${k.label}</div></div>`).join("")}</div>`;

    const periodSeg = `<div class="seg" id="periodSeg">${[0, 1, 2].map((o) => `<button class="${state.periodOffset === o ? "on" : ""}" data-period="${o}">${esc(periodLabel(o))}</button>`).join("")}</div>`;

    const meterRows = METERS.map((m) => meterRow(m, meterInfo(m.kind))).join("");

    const wallets = METERS.filter((m) => m.credit).map((m) => {
      const bal = Number(state.wallets[m.kind] || 0);
      return `<div class="wallet-card reveal">
        <div class="wc-top"><span class="wc-ico">${svg("wallet", 15)}</span><span class="wc-kind">${esc(m.label)}</span></div>
        <div><div class="wc-bal num">${fmtAbbrev(bal)}</div><div class="wc-unit">${esc(m.unit)} in wallet</div></div>
        <div class="wc-cta">${canBill() ? `<button class="btn btn-ghost btn-sm" data-topup="${esc(m.kind)}">${svg("plus", 13)} Top up</button>` : `<span class="pill plain">owner only</span>`}</div></div>`;
    }).join("");

    return `${previewStrip()}
      <div class="page-head reveal">
        <span class="eyebrow">Module · M03</span>
        <h1 style="margin-top:12px">Usage &amp; <em>meters</em></h1>
        <p class="sub">Every billable action is metered server-side the moment it happens
          (<span class="mono">meter_increment</span>, same transaction as the provider call). Bars show this
          period's consumption against your plan's included quota.</p>
      </div>
      ${kpiStrip}
      <div class="sec-head"><h2>Consumption this <em>period</em></h2><div class="spacer"></div>
        ${periodSeg}
        <button class="btn btn-ghost btn-sm" id="csvBtn" style="margin-left:10px">${svg("download", 14)} CSV</button></div>
      <div class="panel reveal"><div class="meter-list">${meterRows}</div></div>
      <div class="sec-head" style="margin-top:34px"><h2>Credit <em>wallets</em></h2><div class="spacer"></div>
        <span class="freshness">Prepaid, drawn after your monthly quota</span></div>
      <div class="wallet-grid reveal">${wallets}</div>`;
  }

  function meterRow(m, info) {
    const behaviorTitle = { HARD_STOP: "Blocks when exhausted", SOFT_WARN: "Warns at 80/100%", OVERAGE: "Bills per unit past quota" }[m.behavior];
    let vals, foot, unlimitedClass = "";
    if (info.unlimited) {
      unlimitedClass = "is-unlimited";
      vals = `<span class="used">${fmtAbbrev(info.used)}</span> <span class="lim">/ unlimited</span>`;
      foot = `<span>Included on your plan · no cap</span>`;
    } else if (info.notOnPlan) {
      vals = `<span class="lim">not on plan</span>`;
      foot = `<span class="gate-prompt" style="width:100%">${svg("alert", 14)} ${esc(m.label)} isn't included in ${esc(state.plan?.name || "your plan")}.
        ${canBill() ? `<button class="btn btn-gold btn-sm" data-scroll-plans-nav>Upgrade</button>` : ""}</span>`;
    } else {
      const remaining = Math.max(info.included - info.used, 0);
      vals = `<span class="used">${fmtAbbrev(info.used)}</span> <span class="lim">/ ${fmtAbbrev(info.included)}</span>`;
      foot = info.over
        ? `<span style="color:var(--status-danger)">${m.behavior === "OVERAGE" ? "Over quota — extra usage is billed" : "Limit reached"}</span>`
          + (info.wallet > 0 ? ` <span>· wallet: <span class="num">${fmtAbbrev(info.wallet)}</span></span>` : "")
          + (m.behavior === "HARD_STOP" && canBill() ? ` <button class="btn btn-gold btn-sm" style="margin-left:auto" data-topup="${esc(m.kind)}">Top up</button>` : "")
        : `<span><span class="num">${fmtAbbrev(remaining)}</span> ${esc(m.unit)} left</span>`
          + (info.wallet > 0 ? ` <span>· wallet <span class="num">${fmtAbbrev(info.wallet)}</span></span>` : "");
    }
    const barPct = info.unlimited ? 6 : info.pct;
    const bar = info.notOnPlan ? "" : `<div class="mbar"><div class="mbar-fill ${info.unlimited ? "" : fillClass(info.pct)}" style="width:${barPct.toFixed(1)}%"></div></div>`;
    return `<div class="meter ${unlimitedClass}">
      <div class="m-head"><span class="m-ico">${svg(m.ico, 15)}</span><span class="m-name">${esc(m.label)}</span>
        <span class="m-behavior" title="${esc(behaviorTitle)}">${esc(m.behavior.replace("_", " "))}</span>
        <span class="m-vals">${vals}</span></div>
      ${bar}
      <div class="m-foot">${foot}</div></div>`;
  }

  /* ── Shared building blocks ─────────────────────────────────────────────── */
  function skeleton() {
    return `<div class="page-head"><div class="skeleton" style="width:280px;height:44px;border-radius:12px"></div></div>
      <div class="kpi-strip">${Array(4).fill('<div class="skeleton" style="height:120px;border-radius:24px"></div>').join("")}</div>
      <div class="panel" style="margin-top:22px">${Array(4).fill('<div class="skeleton" style="height:44px;border-radius:10px;margin-bottom:14px"></div>').join("")}</div>`;
  }
  function errorBlock(msg) { return `<div class="panel" style="border-color:rgba(196,97,78,.4)"><div class="empty-state"><div class="es-ico" style="background:rgba(196,97,78,.12);color:var(--status-danger)">⚠</div><h3>Something went wrong</h3><p>${esc(msg)}</p><button class="btn btn-ghost es-cta" id="retryBtn">Retry</button></div></div>`; }
  function emptyBilling() { return `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("card", 22)}</div><h3>No subscription yet</h3><p>This workspace isn't on a plan. Start a subscription to unlock metered features and higher limits.</p><button class="btn btn-primary es-cta" data-scroll-plans>Choose a plan</button></div></div>`; }
  function emptyUsage() { return `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("gauge", 22)}</div><h3>No usage yet</h3><p>Once you start sending, generating, or enriching, every action is metered here in real time — honest counts, no estimates.</p><button class="btn btn-ghost es-cta" data-hash="#/settings/billing">View plan</button></div></div>`; }
  function fmtDate(d) { try { return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch (e) { return "—"; } }

  /* ── Router + render ────────────────────────────────────────────────────── */
  function currentRoute() {
    const h = (location.hash || "#/settings/billing").replace(/^#/, "");
    if (h.startsWith("/settings/usage")) return { key: "usage" };
    return { key: "billing" };
  }
  function render() {
    const app = $("#app");
    const r = currentRoute();
    app.innerHTML = shell(r.key, r.key === "usage" ? viewUsage() : viewBilling());
    afterShell();
    const inner = $(".content-inner");
    wireCommon(inner);
    if (r.key === "billing") wireBilling(inner); else wireUsage(inner);
    handleReturnParams();
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
    $$("[data-hash]", mount).forEach((n) => n.addEventListener("click", () => (location.hash = n.dataset.hash)));
    $$("[data-preview]", mount).forEach((b) => b.addEventListener("click", () => { state.previewState = b.dataset.preview; render(); }));
    const retry = $("#retryBtn", mount); if (retry) retry.addEventListener("click", () => { state.previewState = "default"; boot(); });
    $$("[data-scroll-plans],[data-scroll-plans-nav]", mount).forEach((b) => b.addEventListener("click", () => {
      if (b.hasAttribute("data-scroll-plans-nav")) { location.hash = "#/settings/billing"; return; }
      const g = $(".plan-grid", mount); if (g) g.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }));
  }

  function wireBilling(mount) {
    ["#portalBtn", "#portalBtn2", "#portalBtn3"].forEach((sel) => { const b = $(sel, mount); if (b) b.addEventListener("click", openPortal); });
    $$("[data-checkout]", mount).forEach((b) => b.addEventListener("click", () => openCheckout(b.dataset.checkout)));
    $$("[data-contact]", mount).forEach((b) => b.addEventListener("click", () => toast("Enterprise: our team will reach out — contact sales@aimindshare.com", "info")));
  }
  function wireUsage(mount) {
    $$("[data-period]", mount).forEach((b) => b.addEventListener("click", async () => {
      state.periodOffset = Number(b.dataset.period);
      if (connected() && state.workspaceId) { state.loading = true; render(); try { await loadUsage(state.workspaceId); } catch (e) {} state.loading = false; }
      render();
    }));
    $$("[data-topup]", mount).forEach((b) => b.addEventListener("click", () => openTopup(b.dataset.topup)));
    const csv = $("#csvBtn", mount); if (csv) csv.addEventListener("click", exportCsv);
  }

  /* ── Checkout / portal / top-up ─────────────────────────────────────────── */
  function planByTier(tier) { return state.plans.find((p) => p.tier === tier) || PLAN_DEFS[tier]; }

  async function openCheckout(tier) {
    const p = planByTier(tier); if (!p) return;
    if (!connected()) {
      modal(`<div class="mc-head"><span class="mc-ico">${svg("card", 18)}</span>
          <div><h3>Checkout — ${esc(p.name)}</h3><div class="mc-sub">${money(p.monthly_price)}/mo</div></div>
          <button class="icon-btn mc-close" data-close>✕</button></div>
        <p style="font-size:13.5px;color:var(--ink-400);line-height:1.6">In a connected project this opens a
          <b>Stripe Checkout</b> session created by the <span class="mono">billing-checkout</span> Edge Function
          (the secret key stays in Vault). On success, Stripe's webhook flips your workspace to
          <span class="mono">active</span> on the ${esc(p.name)} plan.</p>
        <div class="mc-foot"><button class="btn btn-ghost" data-close>Close</button>
          <button class="btn btn-primary" data-close>Simulate success</button></div>`);
      $$("#modalRoot [data-close]").forEach((b, i) => { if (i === 1) b.addEventListener("click", () => { state.previewState = "success"; render(); }); });
      return;
    }
    if (!canBill()) { toast("Only the workspace owner can change billing", "danger"); return; }
    toast("Starting checkout…");
    try {
      const { data, error } = await ensureClient().functions.invoke("billing-checkout", { body: { workspace_id: state.workspaceId, plan_id: p.id } });
      if (error) { const m = await readFnError(error); toast(m, "danger"); return; }
      if (data?.data?.url) { location.href = data.data.url; return; }
      toast("Checkout could not be started", "danger");
    } catch (e) { toast(e.message || "Checkout failed", "danger"); }
  }

  async function openPortal() {
    if (!connected()) { toast("Connect a project to open the Stripe billing portal", "info"); return; }
    if (!canBill()) { toast("Only the workspace owner can manage billing", "danger"); return; }
    toast("Opening billing portal…");
    try {
      const { data, error } = await ensureClient().functions.invoke("billing-portal", { body: { workspace_id: state.workspaceId } });
      if (error) { const m = await readFnError(error); toast(m, "danger"); return; }
      if (data?.data?.url) { location.href = data.data.url; return; }
      toast("Portal could not be opened", "danger");
    } catch (e) { toast(e.message || "Portal failed", "danger"); }
  }

  function openTopup(kind) {
    const meta = METERS.find((m) => m.kind === kind); if (!meta) return;
    const packs = { sms: [[500, 495], [1500, 1450]], ai_tokens: [[500000, 500], [2000000, 1900]], image_gen: [[100, 900], [500, 4250]], enrichment: [[100, 4900], [500, 22500]], seo_calls: [[1000, 900], [5000, 4250]], voice_minutes: [[100, 1500], [500, 7000]], video_render: [[20, 2000], [100, 9000]] }[kind] || [[100, 1000]];
    const opts = packs.map(([credits, cents], i) => `<label class="pop-item" style="border:.5px solid var(--line-strong);margin-bottom:8px">
        <input type="radio" name="pack" value="${i}" ${i === 0 ? "checked" : ""} style="accent-color:var(--teal-700)">
        <div style="min-width:0"><div class="pi-name">${fmtAbbrev(credits)} ${esc(meta.unit)}</div><div class="pi-sub">${money(cents / 100)}</div></div></label>`).join("");
    modal(`<div class="mc-head"><span class="mc-ico">${svg("wallet", 18)}</span>
        <div><h3>Top up ${esc(meta.label)} credits</h3><div class="mc-sub">Prepaid credits are drawn after your monthly quota.</div></div>
        <button class="icon-btn mc-close" data-close>✕</button></div>
      <div style="margin-top:4px">${opts}</div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-gold" id="tuGo">Continue to payment</button></div>`);
    $("#tuGo").addEventListener("click", async () => {
      const idx = Number(($("#modalRoot input[name=pack]:checked") || {}).value || 0);
      const [credits, cents] = packs[idx];
      if (!connected()) { $$("#modalRoot [data-close]")[0]?.click?.(); toast(`Top-up of ${fmtAbbrev(credits)} ${meta.unit} started (mockup)`, "success"); return; }
      if (!canBill()) { toast("Only the workspace owner can buy credits", "danger"); return; }
      const btn = $("#tuGo"); btn.disabled = true; btn.textContent = "Starting…";
      try {
        const { data, error } = await ensureClient().functions.invoke("billing-checkout", { body: { workspace_id: state.workspaceId, mode: "topup", kind, amount_cents: cents, credits } });
        if (error) { const m = await readFnError(error); btn.disabled = false; btn.textContent = "Continue to payment"; toast(m, "danger"); return; }
        if (data?.data?.url) { location.href = data.data.url; return; }
        toast("Top-up could not be started", "danger");
      } catch (e) { toast(e.message || "Top-up failed", "danger"); }
    });
  }

  // Read the envelope message out of a Supabase FunctionsHttpError (non-2xx body).
  async function readFnError(error) {
    try { const body = await error.context.json(); return body?.message || body?.error || error.message; }
    catch (e) { return error?.message || "Request failed"; }
  }

  /* ── CSV export (direct read; no job needed) ────────────────────────────── */
  function exportCsv() {
    const rows = [["meter", "unit", "behavior", "used", "included", "wallet", "period"]];
    METERS.forEach((m) => { const i = meterInfo(m.kind); rows.push([m.kind, m.unit, m.behavior, i.used, i.unlimited ? "unlimited" : i.included, i.wallet, periodKey(state.periodOffset)]); });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = el("a"); a.href = URL.createObjectURL(blob); a.download = `usage-${periodKey(state.periodOffset)}.csv`; document.body.appendChild(a); a.click(); a.remove();
    toast("Usage exported", "success");
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

  /* ── Post-checkout return params (?checkout=success / ?topup=success) ────── */
  function handleReturnParams() {
    const q = new URLSearchParams((location.hash.split("?")[1] || ""));
    if (q.get("checkout") === "success") { toast("Subscription confirmed — welcome aboard!", "success"); stripQuery(); if (connected()) boot(); }
    else if (q.get("checkout") === "cancel") { toast("Checkout canceled", "info"); stripQuery(); }
    else if (q.get("topup") === "success") { toast("Credits added to your wallet", "success"); stripQuery(); if (connected()) boot(); }
    else if (q.get("topup") === "cancel") { toast("Top-up canceled", "info"); stripQuery(); }
  }
  function stripQuery() { const base = location.hash.split("?")[0]; history.replaceState(null, "", location.pathname + location.search + base); }

  /* ── Go ─────────────────────────────────────────────────────────────────── */
  window.addEventListener("hashchange", render);
  boot();
})();
