/* m05-compliance.js — AiMindShare Module M05 · Compliance & Consent.
   Vanilla hash-routed dashboard on Supabase. Four screens under /settings/compliance:
   A2P 10DLC registration wizard, the consent ledger (opt-in/out + STOP/START/HELP),
   GDPR/CCPA data-subject requests (30-day SLA → gdpr.export/erase jobs), and a
   cookie-banner customizer for published sites. The walls are server-side: the
   consent ledger is append-only (RLS), A2P config is admin+, GDPR delete is admin+,
   and the export/erase heavy lifting runs in a worker (the browser only enqueues a
   'queued' job). Twilio/TrustHub wiring is stubbed this slice; creds live in Vault
   (Law 3 — anon key only in the browser). Offline → a high-fidelity mockup with a
   default/empty/loading/error/success preview switcher (Gate-5). */
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
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", check: "M20 6 9 17l-5-5",
    msg: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
    mail: "M4 4h16v16H4zM22 6l-10 7L2 6",
    phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z",
    whatsapp: "M12 2a10 10 0 0 0-8.6 15l-1.4 5 5.1-1.3A10 10 0 1 0 12 2zM8.5 7.5c.3 0 .6.7.8 1.2.2.5-.4.9-.6 1.1-.2.2-.1.5 0 .7.8 1.4 1.6 2 2.9 2.6.3.1.5.1.7-.1l.6-.8c.2-.2.4-.2.7-.1l1.3.6c.3.1.3.6.2 1-.3.9-1.6 1.3-2.4 1.1a8 8 0 0 1-5.6-5.6c-.2-.9.3-2 1.1-2.4z",
    cookie: "M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5zM8.5 10.5h.01M12 15h.01M15.5 11.5h.01",
    clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2", building: "M4 22V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v18M15 9h4a1 1 0 0 1 1 1v12M8 7h.01M8 11h.01M8 15h.01M12 7h.01M12 11h.01M12 15h.01",
    file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6", user: "M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    alert: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
    x: "M18 6 6 18M6 6l12 12", plus: "M12 5v14M5 12h14", arrow: "M5 12h14M12 5l7 7-7 7", chev: "M9 18l6-6-6-6",
    download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
    external: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3",
    lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4",
    sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z", send: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z",
    ban: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM4.9 4.9l14.2 14.2", info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
  };
  const svg = (name, size = 17) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${P[name] || ""}"/></svg>`;

  /* ── Registries (client mirror of the schema) ───────────────────────────── */
  const CHANNELS = [
    { key: "sms", label: "SMS", kind: "sms_optin", ico: "msg" },
    { key: "email", label: "Email", kind: "email_optin", ico: "mail" },
    { key: "whatsapp", label: "WhatsApp", kind: "whatsapp_optin", ico: "whatsapp" },
    { key: "voice", label: "Voice", kind: "voice_optin", ico: "phone" },
  ];
  const kindToChannel = (k) => CHANNELS.find((c) => c.kind === k) || { label: k, ico: "shield" };
  const A2P_STEPS = ["Business info", "Brand registration", "Campaign use-case", "Live"];

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
  function fmtDate(d) { try { return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch (e) { return "—"; } }
  function daysUntil(d) { try { return Math.ceil((new Date(d).getTime() - Date.now()) / 864e5); } catch (e) { return null; } }

  /* ── Mockup data (mockup mode only — never a live code path) ─────────────── */
  const DAY = 864e5;
  const MOCK = {
    user: { id: "you", email: "aisha@northstar.agency", name: "Aisha Rahman" },
    workspace: { id: "ws-agency", name: "Northstar Agency" },
    a2p: {
      brand_status: "approved", campaign_status: "pending",
      business_info: { legal_name: "Northstar Agency LLC", ein: "88-1234567", website: "https://northstar.agency", contact_email: "compliance@northstar.agency", vertical: "Professional services" },
      rejection_reason: null, provider_ref: "BN1a2b… / CM9x8y…",
    },
    consent: {
      counts: { sms: { in: 1840, out: 96 }, email: { in: 4120, out: 210 }, whatsapp: { in: 610, out: 22 }, voice: { in: 88, out: 9 } },
      records: [
        { name: "Yusuf Karim", channel: "sms", granted: false, source: "keyword", at: new Date(Date.now() - 0.2 * DAY).toISOString() },
        { name: "Layla Hassan", channel: "email", granted: true, source: "form:newsletter", at: new Date(Date.now() - 1 * DAY).toISOString() },
        { name: "Omar Farouk", channel: "sms", granted: true, source: "manual", at: new Date(Date.now() - 2 * DAY).toISOString() },
        { name: "Sana Iqbal", channel: "whatsapp", granted: true, source: "form:contact", at: new Date(Date.now() - 3 * DAY).toISOString() },
        { name: "Bilal Ahmed", channel: "email", granted: false, source: "unsub_link", at: new Date(Date.now() - 4 * DAY).toISOString() },
        { name: "Imported list (412)", channel: "email", granted: true, source: "import", at: new Date(Date.now() - 6 * DAY).toISOString() },
      ],
    },
    requests: [
      { who: "yusuf.karim@example.com", request_type: "access", status: "pending", due_at: new Date(Date.now() + 26 * DAY).toISOString(), created_at: new Date(Date.now() - 4 * DAY).toISOString() },
      { who: "hidden@example.com", request_type: "delete", status: "in_progress", due_at: new Date(Date.now() + 5 * DAY).toISOString(), created_at: new Date(Date.now() - 25 * DAY).toISOString() },
      { who: "layla.hassan@example.com", request_type: "rectify", status: "pending", due_at: new Date(Date.now() + 12 * DAY).toISOString(), created_at: new Date(Date.now() - 18 * DAY).toISOString() },
      { who: "old.request@example.com", request_type: "access", status: "completed", due_at: new Date(Date.now() - 2 * DAY).toISOString(), created_at: new Date(Date.now() - 33 * DAY).toISOString() },
    ],
    sites: [{ id: "s1", name: "Northstar — Main site", domain: "northstar.agency" }, { id: "s2", name: "Ramadan Campaign LP", domain: "go.northstar.agency" }],
  };

  /* ── App state ──────────────────────────────────────────────────────────── */
  const state = {
    loaded: false, loading: false, error: null, previewState: "default",
    user: null, workspaceId: null, workspaceName: "", role: "owner",
    a2p: null, consent: null, requests: [], flashOk: null,
    cookie: { color: "teal", position: "left" },
  };
  const PREVIEW_STATES = ["default", "empty", "loading", "error", "success"];
  const st = (name) => !connected() && state.previewState === name;
  const isAdmin = () => ["owner", "admin"].includes(state.role) || !connected();

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

        const [{ data: a2p }, { data: consents }, { data: reqs }] = await Promise.all([
          c.from("a2p_registrations").select("*").eq("workspace_id", active.id).maybeSingle(),
          c.from("consent_records").select("kind,granted,source,contact_id,created_at").eq("workspace_id", active.id).order("created_at", { ascending: false }).limit(200),
          c.from("gdpr_requests").select("*").eq("workspace_id", active.id).order("created_at", { ascending: false }).limit(100),
        ]);
        state.a2p = a2p || null;
        state.consent = summariseConsent(consents || []);
        state.requests = reqs || [];
      } catch (e) { state.error = e.message || String(e); }
      state.loading = false; state.loaded = true;
    } else {
      // Mockup mode
      state.user = MOCK.user; state.workspaceId = MOCK.workspace.id; state.workspaceName = MOCK.workspace.name; state.role = "owner";
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

  function summariseConsent(rows) {
    const counts = {}; CHANNELS.forEach((c) => (counts[c.key] = { in: 0, out: 0 }));
    const records = rows.map((r) => {
      const ch = kindToChannel(r.kind);
      const key = CHANNELS.find((c) => c.kind === r.kind)?.key;
      if (key) counts[key][r.granted ? "in" : "out"]++;
      return { name: r.contact_id ? "Contact " + String(r.contact_id).slice(0, 8) : "—", channel: key || r.kind, granted: r.granted, source: r.source || "manual", at: r.created_at };
    });
    return { counts, records };
  }

  /* ── Connection pill ────────────────────────────────────────────────────── */
  function renderConn() {
    const pill = $("#connPill"); if (!pill) return;
    if (connected()) { pill.className = "pill success"; pill.textContent = "connected"; }
    else { pill.className = "pill plain"; pill.textContent = "mockup mode"; }
  }

  /* ── A2P stage resolution (mock respects the preview switcher) ───────────── */
  function a2pData() {
    if (connected()) return state.a2p || { brand_status: "not_started", campaign_status: "not_started", business_info: {}, rejection_reason: null };
    const m = MOCK.a2p;
    if (st("empty")) return { brand_status: "not_started", campaign_status: "not_started", business_info: {}, rejection_reason: null };
    if (st("error")) return { ...m, brand_status: "rejected", campaign_status: "not_started", rejection_reason: "Business name does not match the EIN on file with the IRS. Verify the legal entity name and resubmit." };
    if (st("success")) return { ...m, brand_status: "approved", campaign_status: "approved", rejection_reason: null };
    return m; // default → mid-flow (brand approved, campaign pending)
  }
  function a2pStep(a) {
    if (!a || a.brand_status === "not_started") return 0;
    if (a.brand_status === "pending" || a.brand_status === "rejected") return 1;
    if (a.brand_status === "approved" && (a.campaign_status === "not_started")) return 2;
    if (a.campaign_status === "approved") return 3;
    return 2; // campaign pending/rejected → awaiting on the campaign step
  }
  const canSendSms = (a) => a && a.brand_status === "approved" && a.campaign_status === "approved";

  /* ── Shell (rail + topbar) ──────────────────────────────────────────────── */
  const NAV = [
    { key: "a2p", label: "A2P registration", ico: "shield", hash: "#/settings/compliance/a2p" },
    { key: "consent", label: "Consent ledger", ico: "msg", hash: "#/settings/compliance/consent" },
    { key: "requests", label: "Data requests", ico: "file", hash: "#/settings/compliance/requests" },
    { key: "cookie", label: "Cookie banner", ico: "cookie", hash: "#/settings/compliance/cookie" },
  ];
  function shell(activeKey, content) {
    const nav = NAV.map((n) => `<div class="nav-item ${n.key === activeKey ? "active" : ""}" data-hash="${n.hash}"><span class="ni-ico">${svg(n.ico)}</span><span>${n.label}</span></div>`).join("");
    return `
      <aside class="rail" id="rail">
        <div class="brand"><span class="mark">✦</span><span><b>AiMind</b><em>Share</em></span></div>
        <div class="nav-group"><div class="nav-group-label">Compliance</div>${nav}</div>
        <div class="rail-foot">M05 · Compliance &amp; Consent</div>
      </aside>
      <header class="tbar">
        <button class="icon-btn rail-burger" id="railBurger" aria-label="Menu">☰</button>
        <div class="ws-trigger" style="cursor:default">
          <span class="ws-badge">${esc(initials(state.workspaceName || "AiMindShare"))}</span>
          <span class="ws-meta"><span class="ws-name">${esc(state.workspaceName || "Workspace")}</span><span class="ws-kind">Compliance</span></span>
        </div>
        <div class="tb-search"><span>${svg("shield", 15)}</span><span class="tbs-label">Search…</span><span class="kbd">⌘K</span></div>
        <div class="spacer"></div>
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
      Connect a project to read live A2P status, the consent ledger and data requests. Sample data shown. Preview state:
      ${PREVIEW_STATES.map((s) => `<button class="link ${state.previewState === s ? "on" : ""}" data-preview="${s}">${s}</button>`).join(" ")}</div>`;
  }
  function pageHead(sub) {
    return `<div class="page-head reveal">
      <span class="eyebrow">Module · M05</span>
      <h1 style="margin-top:12px">Compliance &amp; <em>consent</em></h1>
      <p class="sub">${sub}</p></div>`;
  }
  function flash() {
    if (!state.flashOk) return "";
    const m = state.flashOk; state.flashOk = null;
    return `<div class="ok-banner reveal"><span class="okb-ico">${svg("check", 18)}</span>${esc(m)}</div>`;
  }

  /* ═══ VIEW: A2P registration wizard ═══════════════════════════════════════ */
  function viewA2p() {
    if (st("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    const a = a2pData();
    const step = a2pStep(a);

    const stepper = `<div class="stepper">${A2P_STEPS.map((label, i) => {
      const cls = i < step ? "done" : i === step ? "active" : "";
      const inner = i < step ? svg("check", 15) : String(i + 1);
      return `<div class="step ${cls}"><div class="s-connector"></div><div class="s-dot">${inner}</div><div class="s-label">${esc(label)}</div></div>`;
    }).join("")}</div>`;

    const smsGate = canSendSms(a)
      ? `<span class="pill success">${svg("check", 12)} SMS sending enabled</span>`
      : `<span class="pill danger">${svg("ban", 12)} SMS blocked until approved</span>`;

    let panel;
    if (a.brand_status === "rejected") panel = a2pRejected(a);
    else if (a.brand_status === "approved" && a.campaign_status === "approved") panel = a2pLive(a);
    else if (a.brand_status === "approved") panel = a2pCampaign(a);
    else if (a.brand_status === "pending") panel = a2pPending("brand");
    else panel = a2pForm(a);

    return `${previewStrip()}${flash()}
      ${pageHead(`Register your business for <span class="mono">A2P 10DLC</span> so you can legally send SMS in the US &amp; Canada.
        This is the #1 SMS blocker — until your brand and campaign are approved, sending is gated (server-side <span class="mono">sms.canSend()</span>).`)}
      <div class="status-tiles reveal">
        ${a2pTile("Brand", "10DLC brand registration", a.brand_status, "building")}
        ${a2pTile("Campaign", "Messaging use-case", a.campaign_status, "send")}
      </div>
      <div class="sec-head"><h2>Registration <em>wizard</em></h2><div class="spacer"></div>${smsGate}</div>
      ${stepper}
      <div class="panel wizard-panel reveal">${panel}</div>`;
  }
  function a2pTile(name, sub, status, ico) {
    const map = { approved: ["is-approved", "success", "Approved"], pending: ["is-pending", "warning", "Pending review"], rejected: ["is-rejected", "danger", "Rejected"], not_started: ["", "plain", "Not started"] };
    const [cls, pill, label] = map[status] || map.not_started;
    return `<div class="status-tile ${cls}"><div class="st-head"><span class="st-ico">${svg(ico, 16)}</span><span class="st-name">${esc(name)}</span></div>
      <div class="st-sub">${esc(sub)}</div><div class="st-state"><span class="pill ${pill}">${esc(label)}</span></div></div>`;
  }
  function a2pForm(a) {
    const b = a.business_info || {};
    return `<div class="wizard-head"><h3>Business information</h3><p>Twilio's TrustHub verifies these against public records. They must exactly match your registered legal entity.</p></div>
      <div class="form-grid">
        <div class="form-field"><label>Legal business name</label><input id="f_legal" value="${esc(b.legal_name || "")}" placeholder="Acme Agency LLC"></div>
        <div class="form-field"><label>EIN / Tax ID</label><input id="f_ein" value="${esc(b.ein || "")}" placeholder="88-1234567"></div>
        <div class="form-field"><label>Website</label><input id="f_web" value="${esc(b.website || "")}" placeholder="https://…"></div>
        <div class="form-field"><label>Compliance contact email</label><input id="f_email" value="${esc(b.contact_email || "")}" placeholder="compliance@…"></div>
        <div class="form-field full"><label>Business vertical</label><input id="f_vert" value="${esc(b.vertical || "")}" placeholder="Professional services / Marketing"></div>
      </div>
      <div class="defer-note"><span class="dn-ico">${svg("info", 14)}</span>Twilio TrustHub submission is stubbed this session — “Submit” records your brand as <b>pending</b>; a webhook flips it to approved/rejected when live.</div>
      <div class="wizard-actions"><div class="spacer"></div>
        <button class="btn btn-primary" id="a2pSubmitBrand" ${isAdmin() ? "" : "disabled title='Owner/Admin only'"}>${svg("send", 14)} Submit brand registration</button></div>`;
  }
  function a2pPending(which) {
    return `<div class="empty-state">
      <div class="es-ico" style="background:rgba(199,154,58,.14);color:var(--status-warning)">${svg("clock", 22)}</div>
      <h3>${which === "brand" ? "Brand" : "Campaign"} under review</h3>
      <p>Twilio TrustHub is reviewing your submission. This typically takes minutes to a few business days. We'll update the status automatically when the carrier responds.</p>
      <span class="pill warning">Pending review</span></div>`;
  }
  function a2pRejected(a) {
    return `<div class="wizard-head"><h3 style="color:var(--status-danger)">Brand registration rejected</h3>
      <p>The carrier declined this submission. Fix the items below and resubmit — there's no penalty for resubmitting.</p></div>
      <div class="banner" style="background:rgba(196,97,78,.08);border-color:rgba(196,97,78,.30)">
        <span class="b-ico" style="color:var(--status-danger)">${svg("alert", 16)}</span>
        <div><b>Rejection reason</b><div style="font-size:13px;color:var(--ink-400);margin-top:3px">${esc(a.rejection_reason || "See carrier notes.")}</div></div></div>
      <div class="label" style="margin-bottom:8px">Fix checklist</div>
      <ul class="checklist">
        <li><span class="cl-ico">${svg("x", 12)}</span>Confirm the legal business name matches your EIN exactly as registered with the IRS.</li>
        <li><span class="cl-ico">${svg("x", 12)}</span>Use a website on your own domain with a visible privacy policy and opt-in language.</li>
        <li><span class="cl-ico">${svg("x", 12)}</span>Ensure the compliance contact email is on the business domain (not a free provider).</li>
      </ul>
      <div class="wizard-actions"><div class="spacer"></div>
        <button class="btn btn-primary" id="a2pResubmit" ${isAdmin() ? "" : "disabled"}>${svg("arrow", 14)} Fix &amp; resubmit</button></div>`;
  }
  function a2pCampaign(a) {
    return `<div class="wizard-head"><h3>Campaign use-case</h3><p>Your brand is approved. Register the messaging use-case that describes what you'll send and how contacts opted in.</p></div>
      ${a.campaign_status === "pending" ? a2pPending("campaign") : `
      <div class="form-grid">
        <div class="form-field full"><label>Use-case description</label><textarea id="c_desc" placeholder="Appointment reminders and account notifications for opted-in clients of our agency.">Appointment reminders, account notifications and marketing for opted-in clients.</textarea></div>
        <div class="form-field full"><label>Sample message</label><textarea id="c_sample" placeholder="Hi {name}, this is a reminder…">Hi {{first_name}}, your consultation with Northstar is tomorrow at {{time}}. Reply STOP to opt out.</textarea></div>
        <div class="form-field full"><label>How do contacts opt in?</label><input id="c_optin" value="Web form with explicit SMS checkbox; keyword START; verbal at intake (logged)."></div>
      </div>
      <div class="defer-note"><span class="dn-ico">${svg("info", 14)}</span>Campaign submission is stubbed — “Submit” marks the campaign <b>pending</b> until the TrustHub webhook returns.</div>
      <div class="wizard-actions"><div class="spacer"></div>
        <button class="btn btn-primary" id="a2pSubmitCampaign" ${isAdmin() ? "" : "disabled"}>${svg("send", 14)} Submit campaign</button></div>`}`;
  }
  function a2pLive(a) {
    return `<div class="empty-state">
      <div class="es-ico" style="background:rgba(46,158,123,.14);color:var(--status-success)">${svg("check", 24)}</div>
      <h3>You're cleared to send SMS</h3>
      <p>Your 10DLC brand and campaign are approved. <span class="mono">sms.canSend()</span> now returns true for this workspace — SMS, campaigns and voice modules are unblocked.</p>
      <div style="font-family:var(--font-mono);font-size:11.5px;color:var(--ink-400);margin-top:4px">Provider ref · ${esc(a.provider_ref || "—")}</div></div>`;
  }

  /* ═══ VIEW: Consent ledger ════════════════════════════════════════════════ */
  function viewConsent() {
    if (st("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    if (st("error") || (connected() && state.error)) return previewStrip() + errorBlock(state.error);
    const data = connected() ? state.consent : (st("empty") ? { counts: emptyCounts(), records: [] } : MOCK.consent);
    const counts = data?.counts || emptyCounts();
    const records = data?.records || [];

    const totalIn = CHANNELS.reduce((s, c) => s + (counts[c.key]?.in || 0), 0);
    const totalOut = CHANNELS.reduce((s, c) => s + (counts[c.key]?.out || 0), 0);
    const recentOut = records.filter((r) => !r.granted).length;

    const kpis = [
      { ico: "check", val: fmtInt(totalIn), label: "Opted in", feat: true },
      { ico: "ban", val: fmtInt(totalOut), label: "Opted out" },
      { ico: "msg", val: CHANNELS.length, label: "Channels tracked" },
      { ico: "alert", val: fmtInt(recentOut), label: "Recent opt-outs" },
    ];
    const kpiStrip = `<div class="kpi-strip">${kpis.map((k) => `
      <div class="kpi reveal ${k.feat ? "kpi-featured" : ""}"><div class="kpi-ico">${svg(k.ico, 16)}</div>
        <div class="kpi-val num">${esc(k.val)}</div><div class="kpi-label">${k.label}</div></div>`).join("")}</div>`;

    const bars = `<div class="panel reveal"><div class="panel-head"><span class="ph-ico">${svg("shield", 15)}</span><h3>Opt-in rate by channel</h3></div>
      <div class="mini-bars">${CHANNELS.map((c) => {
        const cc = counts[c.key] || { in: 0, out: 0 }; const tot = cc.in + cc.out; const pct = tot ? Math.round((cc.in / tot) * 100) : 0;
        return `<div class="mini-bar-row"><div class="mbr-label">${svg(c.ico, 14)} ${esc(c.label)}</div>
          <div class="mbr-track"><div class="mbr-fill" style="width:${pct}%"></div></div>
          <div class="mbr-val">${pct}% · <span style="color:var(--ink-400)">${fmtInt(cc.in)} in</span></div></div>`;
      }).join("")}</div></div>`;

    const ledger = records.length ? `<div class="panel reveal"><div class="row-list">${records.map(consentRow).join("")}</div></div>`
      : emptyBlock("msg", "No consent records yet", "Every opt-in and opt-out — from forms, keyword replies (STOP/START), imports or manual entry — is recorded here as an immutable ledger row.");

    return `${previewStrip()}${flash()}
      ${pageHead(`A universal, append-only ledger of every opt-in and opt-out across SMS, email, WhatsApp and voice.
        Messaging modules call <span class="mono">consent.check()</span> before every send — an opted-out contact is hard-blocked.`)}
      ${kpiStrip}
      <div class="sec-head"><h2>Consent <em>overview</em></h2><div class="spacer"></div>
        <button class="btn btn-ghost btn-sm" id="recordConsent">${svg("plus", 14)} Record consent</button></div>
      ${bars}
      <div class="sec-head" style="margin-top:30px"><h2>Recent <em>activity</em></h2><div class="spacer"></div><span class="freshness">Immutable · newest first</span></div>
      ${ledger}`;
  }
  function emptyCounts() { const o = {}; CHANNELS.forEach((c) => (o[c.key] = { in: 0, out: 0 })); return o; }
  function consentRow(r) {
    const ch = CHANNELS.find((c) => c.key === r.channel) || { label: r.channel, ico: "shield" };
    const pill = r.granted ? `<span class="pill success">${svg("check", 12)} opted in</span>` : `<span class="pill danger">${svg("ban", 12)} opted out</span>`;
    return `<div class="data-row">
      <div class="channel-cell"><span class="ch-ico">${svg(ch.ico, 15)}</span></div>
      <div class="r-body"><div class="r-title">${esc(r.name)}</div>
        <div class="r-meta"><span class="ch-name">${esc(ch.label)}</span><span class="consent-source">${esc(r.source)}</span></div></div>
      <div class="r-right"><span class="num" style="font-size:12px;color:var(--ink-400)">${esc(fmtDate(r.at))}</span>${pill}</div></div>`;
  }

  /* ═══ VIEW: Data-subject requests ═════════════════════════════════════════ */
  function viewRequests() {
    if (st("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    if (st("error") || (connected() && state.error)) return previewStrip() + errorBlock(state.error);
    const rows = connected() ? state.requests : (st("empty") ? [] : MOCK.requests);

    const open = rows.filter((r) => r.status !== "completed").length;
    const breaching = rows.filter((r) => r.status !== "completed" && (daysUntil(r.due_at) ?? 99) <= 7).length;
    const done = rows.filter((r) => r.status === "completed").length;
    const kpis = [
      { ico: "file", val: fmtInt(rows.length), label: "Total requests", feat: true },
      { ico: "clock", val: fmtInt(open), label: "Open" },
      { ico: "alert", val: fmtInt(breaching), label: "Due ≤ 7 days" },
      { ico: "check", val: fmtInt(done), label: "Completed" },
    ];
    const kpiStrip = `<div class="kpi-strip">${kpis.map((k) => `
      <div class="kpi reveal ${k.feat ? "kpi-featured" : ""}"><div class="kpi-ico">${svg(k.ico, 16)}</div>
        <div class="kpi-val num">${esc(k.val)}</div><div class="kpi-label">${k.label}</div></div>`).join("")}</div>`;

    const table = rows.length ? `<div class="panel reveal" style="overflow-x:auto"><table class="table">
        <thead><tr><th>Subject</th><th>Type</th><th>Status</th><th>SLA</th><th>Received</th><th></th></tr></thead>
        <tbody>${rows.map(requestRow).join("")}</tbody></table></div>`
      : emptyBlock("file", "No data-subject requests", "GDPR/CCPA access, delete and rectify requests land here — from your public privacy form or created manually — each with a 30-day SLA countdown.");

    return `${previewStrip()}${flash()}
      ${pageHead(`GDPR/CCPA data-subject requests with a 30-day SLA. An <b>access</b> request compiles the subject's data (<span class="mono">gdpr.export</span>);
        a <b>delete</b> anonymises them across modules while keeping legally-required financial records (<span class="mono">gdpr.erase</span>).`)}
      ${kpiStrip}
      <div class="sec-head"><h2>Requests <em>queue</em></h2><div class="spacer"></div>
        <button class="btn btn-primary btn-sm" id="newRequest">${svg("plus", 14)} New request</button></div>
      ${table}
      <div class="defer-note"><span class="dn-ico">${svg("info", 14)}</span>Public intake form <span class="mono">/privacy/{slug}/request</span> and 30-day reminder emails route through M04 Notifications — wired now that M04 is built; slug→workspace resolver lands with M09.</div>`;
  }
  function requestRow(r) {
    const dLeft = daysUntil(r.due_at);
    let sla;
    if (r.status === "completed") sla = `<span class="sla-badge done">${svg("check", 11)} met</span>`;
    else if (dLeft == null) sla = `<span class="sla-badge">—</span>`;
    else { const cls = dLeft <= 7 ? "danger" : dLeft <= 14 ? "warn" : ""; sla = `<span class="sla-badge ${cls}">${dLeft}d left</span>`; }
    const statusPill = { pending: `<span class="pill warning">pending</span>`, in_progress: `<span class="pill info">in progress</span>`, completed: `<span class="pill success">completed</span>` }[r.status] || `<span class="pill plain">${esc(r.status)}</span>`;
    const runnable = r.status !== "completed";
    return `<tr>
      <td><div class="cell-user"><span class="avatar" style="width:30px;height:30px;font-size:12px">${esc(initials(r.who))}</span><div><div class="cu-name" style="font-size:13.5px">${esc(r.who)}</div></div></div></td>
      <td><span class="req-type ${esc(r.request_type)}">${esc(r.request_type)}</span></td>
      <td>${statusPill}</td>
      <td>${sla}</td>
      <td class="num" style="font-size:12.5px;color:var(--ink-400)">${esc(fmtDate(r.created_at))}</td>
      <td style="text-align:right">${runnable ? `<button class="btn btn-ghost btn-sm" data-run="${esc(r.id || r.who)}">${svg("arrow", 13)} Run</button>` : `<button class="btn btn-ghost btn-sm" data-export="${esc(r.id || r.who)}">${svg("download", 13)} Export</button>`}</td></tr>`;
  }

  /* ═══ VIEW: Cookie banner customizer ══════════════════════════════════════ */
  const CK_COLORS = { teal: { bg: "#0F2A2C", fg: "#EDF6F6", accent: "#2CA4AB" }, gold: { bg: "#2A2213", fg: "#FBF6EA", accent: "#C5A059" }, ink: { bg: "#0A0F0E", fg: "#EDF6F6", accent: "#6AD7DE" }, light: { bg: "#FFFFFF", fg: "#0F2A2C", accent: "#00696E" } };
  function viewCookie() {
    if (st("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    const sites = connected() ? [] : (st("empty") ? [] : MOCK.sites);
    const hasSites = sites.length > 0;

    const editor = `<div class="panel reveal">
      <div class="panel-head"><span class="ph-ico">${svg("cookie", 15)}</span><h3>Banner appearance</h3></div>
      <div class="form-field" style="margin-bottom:16px"><label>Published site</label>
        <select id="ck_site">${hasSites ? sites.map((s) => `<option value="${esc(s.id)}">${esc(s.name)} — ${esc(s.domain)}</option>`).join("") : `<option>No published sites yet</option>`}</select></div>
      <div class="label" style="margin-bottom:8px">Theme</div>
      <div class="swatch-row" style="margin-bottom:18px">${Object.entries(CK_COLORS).map(([k, v]) => `<div class="swatch ${state.cookie.color === k ? "on" : ""}" data-color="${k}" style="background:${v.bg}" title="${k}"></div>`).join("")}</div>
      <div class="label" style="margin-bottom:8px">Position</div>
      <div class="seg-choice">${["left", "right", "bar"].map((p) => `<button class="${state.cookie.position === p ? "on" : ""}" data-pos="${p}">${p === "bar" ? "Full bar" : p[0].toUpperCase() + p.slice(1)}</button>`).join("")}</div>
      <div class="wizard-actions" style="margin-top:22px"><div class="spacer"></div>
        <button class="btn btn-primary" id="ck_save" ${isAdmin() ? "" : "disabled"}>${svg("check", 14)} Save banner</button></div>
      ${hasSites ? "" : `<div class="defer-note"><span class="dn-ico">${svg("info", 14)}</span>Per-site persistence &amp; the injected banner script are delivered with <b>M19 Sites</b> (not built yet). Design &amp; behaviour are final; this preview is the exact markup the script will render.</div>`}</div>`;

    const c = CK_COLORS[state.cookie.color] || CK_COLORS.teal;
    const preview = `<div class="cookie-stage reveal">
      <span class="stage-tag">Live preview</span>
      <div class="ck-banner pos-${state.cookie.position}" style="background:${c.bg};color:${c.fg}">
        <div class="ck-text"><div class="ck-title">We value your privacy</div>
          We use cookies to improve your experience and analyse traffic. Analytics stay off until you accept.</div>
        <div class="ck-actions">
          <button class="ck-btn" style="background:${c.accent};color:${c.bg}">Accept all</button>
          <button class="ck-btn ghost" style="color:${c.fg}">Necessary only</button>
          <button class="ck-btn ghost" style="color:${c.fg}">Preferences</button></div></div></div>`;

    return `${previewStrip()}${flash()}
      ${pageHead(`Design the cookie-consent banner injected into your published sites. It blocks analytics and pixel scripts
        until the visitor accepts, logs each choice against an anonymised visitor id, and offers Accept all / Necessary only / Preferences.`)}
      <div class="sec-head"><h2>Banner <em>customizer</em></h2></div>
      <div class="cookie-grid">${editor}${preview}</div>`;
  }

  /* ── Shared building blocks ─────────────────────────────────────────────── */
  function skeleton() {
    return `<div class="page-head"><div class="skeleton" style="width:300px;height:44px;border-radius:12px"></div></div>
      <div class="kpi-strip">${Array(4).fill('<div class="skeleton" style="height:120px;border-radius:24px"></div>').join("")}</div>
      <div class="panel" style="margin-top:22px">${Array(4).fill('<div class="skeleton" style="height:44px;border-radius:10px;margin-bottom:14px"></div>').join("")}</div>`;
  }
  function errorBlock(msg) { return `<div class="panel" style="border-color:rgba(196,97,78,.4)"><div class="empty-state"><div class="es-ico" style="background:rgba(196,97,78,.12);color:var(--status-danger)">⚠</div><h3>Something went wrong</h3><p>${esc(msg || "We couldn't load this workspace's compliance data.")}</p><button class="btn btn-ghost es-cta" id="retryBtn">Retry</button></div></div>`; }
  function emptyBlock(ico, title, body) { return `<div class="panel"><div class="empty-state"><div class="es-ico">${svg(ico, 22)}</div><h3>${esc(title)}</h3><p>${esc(body)}</p></div></div>`; }

  /* ── Router + render ────────────────────────────────────────────────────── */
  function currentRoute() {
    const h = (location.hash || "").replace(/^#/, "");
    if (h.includes("/consent")) return { key: "consent" };
    if (h.includes("/requests")) return { key: "requests" };
    if (h.includes("/cookie")) return { key: "cookie" };
    return { key: "a2p" };
  }
  function render() {
    const app = $("#app");
    const r = currentRoute();
    const view = { a2p: viewA2p, consent: viewConsent, requests: viewRequests, cookie: viewCookie }[r.key];
    app.innerHTML = shell(r.key, view());
    afterShell();
    const inner = $(".content-inner");
    wireCommon(inner);
    ({ a2p: wireA2p, consent: wireConsent, requests: wireRequests, cookie: wireCookie }[r.key])(inner);
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
  }

  /* ── A2P wiring ─────────────────────────────────────────────────────────── */
  function wireA2p(mount) {
    const submitBrand = $("#a2pSubmitBrand", mount);
    if (submitBrand) submitBrand.addEventListener("click", () => a2pWrite({ brand_status: "pending", submitted_at: new Date().toISOString(), business_info: readBusiness() }, "Brand registration submitted — status is now pending carrier review."));
    const resub = $("#a2pResubmit", mount); if (resub) resub.addEventListener("click", () => a2pWrite({ brand_status: "pending", rejection_reason: null }, "Resubmitted — status is pending review again."));
    const submitCamp = $("#a2pSubmitCampaign", mount); if (submitCamp) submitCamp.addEventListener("click", () => a2pWrite({ campaign_status: "pending" }, "Campaign submitted — pending review."));
  }
  function readBusiness() {
    return { legal_name: $("#f_legal")?.value?.trim(), ein: $("#f_ein")?.value?.trim(), website: $("#f_web")?.value?.trim(), contact_email: $("#f_email")?.value?.trim(), vertical: $("#f_vert")?.value?.trim() };
  }
  async function a2pWrite(patch, okMsg) {
    if (!isAdmin()) { toast("Only Owner/Admin can configure A2P registration", "danger"); return; }
    if (!connected()) { state.flashOk = okMsg; MOCK.a2p = { ...MOCK.a2p, ...patch }; toast(okMsg, "success"); render(); return; }
    try {
      const c = ensureClient();
      const row = { workspace_id: state.workspaceId, ...patch };
      const { error } = await c.from("a2p_registrations").upsert(row, { onConflict: "workspace_id" });
      if (error) { toast(error.message, "danger"); return; }
      state.flashOk = okMsg; await boot();
    } catch (e) { toast(e.message || "Write failed", "danger"); }
  }

  /* ── Consent wiring ─────────────────────────────────────────────────────── */
  function wireConsent(mount) {
    const rec = $("#recordConsent", mount); if (rec) rec.addEventListener("click", openRecordConsent);
  }
  function openRecordConsent() {
    const chOpts = CHANNELS.map((c) => `<option value="${c.key}">${c.label}</option>`).join("");
    modal(`<div class="mc-head"><span class="mc-ico">${svg("shield", 18)}</span>
        <div><h3>Record consent</h3><div class="mc-sub">Append an immutable opt-in / opt-out to the ledger.</div></div>
        <button class="icon-btn mc-close" data-close>${svg("x", 15)}</button></div>
      <div class="form-grid">
        <div class="form-field"><label>Channel</label><select id="rc_ch">${chOpts}</select></div>
        <div class="form-field"><label>Decision</label><select id="rc_g"><option value="true">Opted in</option><option value="false">Opted out</option></select></div>
        <div class="form-field full"><label>Contact id (optional — M09)</label><input id="rc_cid" placeholder="uuid of the contact, if known"></div>
        <div class="form-field full"><label>Exact consent text shown</label><textarea id="rc_txt" placeholder="I agree to receive SMS from Northstar Agency. Msg &amp; data rates may apply.">I agree to receive messages from Northstar Agency. Reply STOP to opt out.</textarea></div>
      </div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="rc_go">${svg("check", 14)} Record</button></div>`);
    $("#rc_go").addEventListener("click", async () => {
      const channel = $("#rc_ch").value, granted = $("#rc_g").value === "true", cid = $("#rc_cid").value.trim() || null, text = $("#rc_txt").value.trim();
      closeModal();
      if (!connected()) { const ch = CHANNELS.find((c) => c.key === channel); MOCK.consent.records.unshift({ name: cid ? "Contact " + cid.slice(0, 8) : "Manual entry", channel, granted, source: "manual", at: new Date().toISOString() }); MOCK.consent.counts[channel][granted ? "in" : "out"]++; state.flashOk = "Consent recorded to the ledger."; toast("Consent recorded", "success"); render(); return; }
      try {
        const c = ensureClient();
        const kind = CHANNELS.find((x) => x.key === channel).kind;
        const { error } = await c.from("consent_records").insert({ workspace_id: state.workspaceId, contact_id: cid, kind, granted, source: "manual", evidence: text ? { consent_text: text } : {} });
        if (error) { toast(error.message, "danger"); return; }
        state.flashOk = "Consent recorded to the ledger."; await boot();
      } catch (e) { toast(e.message || "Failed to record", "danger"); }
    });
  }

  /* ── Requests wiring ────────────────────────────────────────────────────── */
  function wireRequests(mount) {
    const nw = $("#newRequest", mount); if (nw) nw.addEventListener("click", openNewRequest);
    $$("[data-run]", mount).forEach((b) => b.addEventListener("click", () => runRequest(b.dataset.run)));
    $$("[data-export]", mount).forEach((b) => b.addEventListener("click", () => toast("In a connected project this downloads the compiled ZIP from the completed gdpr.export job.", "info")));
  }
  function openNewRequest() {
    modal(`<div class="mc-head"><span class="mc-ico">${svg("file", 18)}</span>
        <div><h3>New data-subject request</h3><div class="mc-sub">Starts a 30-day SLA and enqueues the export/erase job.</div></div>
        <button class="icon-btn mc-close" data-close>${svg("x", 15)}</button></div>
      <div class="form-grid">
        <div class="form-field"><label>Request type</label><select id="nr_type"><option value="access">Access (export data)</option><option value="delete">Delete (right to be forgotten)</option><option value="rectify">Rectify</option></select></div>
        <div class="form-field"><label>Subject email</label><input id="nr_email" placeholder="subject@example.com"></div>
        <div class="form-field full"><label>Contact id (optional — M09)</label><input id="nr_cid" placeholder="uuid, if known"></div>
        <div class="form-field full"><label>Notes</label><textarea id="nr_notes" placeholder="Context, verification method, etc."></textarea></div>
      </div>
      <div class="defer-note"><span class="dn-ico">${svg("lock", 14)}</span>Delete requests require an <b>admin</b> — enforced server-side.</div>
      <div class="mc-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="nr_go">${svg("send", 14)} Create &amp; enqueue</button></div>`);
    $("#nr_go").addEventListener("click", async () => {
      const request_type = $("#nr_type").value, email = $("#nr_email").value.trim(), cid = $("#nr_cid").value.trim() || null, notes = $("#nr_notes").value.trim();
      if (!email && !cid) { toast("Provide the subject's email or contact id", "danger"); return; }
      closeModal();
      if (!connected()) { MOCK.requests.unshift({ who: email || "contact " + cid.slice(0, 8), request_type, status: "pending", due_at: new Date(Date.now() + 30 * DAY).toISOString(), created_at: new Date().toISOString() }); state.flashOk = `Request created — ${request_type === "delete" ? "gdpr.erase" : "gdpr.export"} job enqueued.`; toast("Request created & job enqueued", "success"); render(); return; }
      if (request_type === "delete" && !isAdmin()) { toast("Delete requests require an admin", "danger"); return; }
      try {
        const c = ensureClient();
        const { data, error } = await c.functions.invoke("gdpr-request", { body: { workspace_id: state.workspaceId, request_type, email, contact_id: cid, notes } });
        if (error) { toast(await readFnError(error), "danger"); return; }
        state.flashOk = "Request created — export/erase job enqueued."; await boot();
      } catch (e) { toast(e.message || "Failed", "danger"); }
    });
  }
  async function runRequest(id) {
    if (!connected()) { toast("Re-enqueued the export/erase job (mockup)", "success"); return; }
    const req = state.requests.find((r) => r.id === id); if (!req) return;
    try {
      const c = ensureClient();
      const type = req.kind === "gdpr_erase" ? "gdpr.erase" : "gdpr.export";
      const { error } = await c.from("jobs").insert({ workspace_id: state.workspaceId, type, payload: { request_id: req.id, contact_id: req.contact_id }, status: "queued", idempotency_key: `gdpr:${req.id}:${type === "gdpr.erase" ? "erase" : "export"}` });
      if (error) { toast(error.message, "danger"); return; }
      toast("Job enqueued — a worker will process it", "success");
    } catch (e) { toast(e.message || "Failed", "danger"); }
  }

  /* ── Cookie wiring ──────────────────────────────────────────────────────── */
  function wireCookie(mount) {
    $$("[data-color]", mount).forEach((s) => s.addEventListener("click", () => { state.cookie.color = s.dataset.color; render(); }));
    $$("[data-pos]", mount).forEach((b) => b.addEventListener("click", () => { state.cookie.position = b.dataset.pos; render(); }));
    const save = $("#ck_save", mount); if (save) save.addEventListener("click", () => {
      if (!isAdmin()) { toast("Only Owner/Admin can configure the cookie banner", "danger"); return; }
      if (connected()) { toast("Per-site cookie config persists with M19 Sites (not built yet)", "info"); return; }
      state.flashOk = "Cookie banner saved."; toast("Banner saved", "success"); render();
    });
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
  window.addEventListener("hashchange", render);
  boot();
})();
