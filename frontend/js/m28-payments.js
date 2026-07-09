/* m28-payments.js — AiMindShare Module M28 · Payments & Invoicing.
   Vanilla hash-routed dashboard on Supabase. Client-facing money: invoices &
   estimates (a live-preview builder), Stripe checkout links on the workspace's
   connected account, client subscriptions, a branded NO-AUTH hosted pay page, and
   revenue rollups. The wall is server-side: totals are recomputed by a DB trigger
   (calc_invoice_totals — the JS calcTotals below is only the preview mirror),
   payments are written ONLY by the service role (webhook / record_invoice_payment),
   the Stripe key lives in Vault. The browser READS its data (RLS-scoped) and calls
   the Edge Functions (payments-checkout / invoice-send / public-invoice). Anon key
   only (Law 3). No project connected → a high-fidelity mockup with a
   default/empty/loading/error/success preview switcher (Gate-5).

   Scope (BUILD-SEQUENCE S13 accept-when): invoices CRUD + send, Stripe checkout
   links, estimate→invoice, subscriptions, idempotent webhook, revenue rollups.
   Deferred + labelled: standalone payment links (own table), Text-to-Pay full flow
   (routes through M12 inbox-send), payment plans, dunning→M13, PDF (M06), QR. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const initials = (s) => (s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  /* ── Money (integer MINOR units everywhere — matches the DB, D-072) ──────── */
  const CUR = { USD: "$", EUR: "€", GBP: "£", AUD: "A$", CAD: "C$", AED: "د.إ", SAR: "﷼" };
  const money = (minor, cur = "USD") => {
    const sym = CUR[cur] || (cur + " ");
    return sym + (Number(minor || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
  const daysUntil = (d) => d ? Math.ceil((new Date(d) - new Date()) / 864e5) : null;

  /* calcTotals — the PREVIEW mirror of SQL calc_invoice_totals. The DB trigger is
     the source of truth; this exists only so the editor updates as you type. */
  function calcTotals(items, discount, taxRate) {
    const subtotal = (items || []).reduce((s, it) => s + Math.round((Number(it.qty) || 0) * (Number(it.unit_price) || 0)), 0);
    let discountTotal = 0;
    if (discount && discount.type === "percent") discountTotal = Math.round(subtotal * (Number(discount.value) || 0) / 100);
    else if (discount && discount.type === "fixed") discountTotal = Math.min(Math.round(Number(discount.value) || 0), subtotal);
    const taxable = subtotal - discountTotal;
    const tax = Math.round(taxable * (Number(taxRate) || 0) / 100);
    return { subtotal, discountTotal, tax, total: taxable + tax };
  }

  /* ── Inline icons (lucide-style) ─────────────────────────────────────────── */
  const P = {
    receipt: "M4 2h16v20l-3-2-2 2-3-2-3 2-2-2-3 2V2zM8 7h8M8 11h8M8 15h5",
    file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
    repeat: "M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3",
    link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
    swap: "M7 10l-3 3 3 3M4 13h16M17 8l3-3-3-3M20 5H4",
    plus: "M12 5v14M5 12h14", check: "M20 6 9 17l-5-5", chev: "M6 9l6 6 6-6",
    trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14",
    send: "M22 2 11 13M22 2l-7 20-4-9-9-4z", mail: "M4 4h16v16H4zM22 6l-10 7L2 6",
    msg: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
    card: "M2 5h20v14H2zM2 10h20", coins: "M12 8a8 4 0 1 0 0-8 8 4 0 0 0 0 8zM4 6v6c0 2 4 4 8 4M20 6v12c0 2-4 4-8 4M4 12c0 2 4 4 8 4",
    alert: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
    settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
    search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35", download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
    copy: "M9 9h11v11H9zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1", lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
    arrow: "M5 12h14M12 5l7 7-7 7", back: "M19 12H5M12 19l-7-7 7-7", user: "M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    trend: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6", clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  };
  const svg = (n, s = 17) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${P[n] || ""}"/></svg>`;

  /* ── Theme + starfield ───────────────────────────────────────────────────── */
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
  const CFG_KEY = "aimindshare-supabase", ACTIVE_KEY = "aimindshare-active-ws";
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
  const toastWrap = $("#toasts");
  function toast(msg, kind = "info") {
    const ico = kind === "success" ? "✓" : kind === "danger" ? "⚠" : "◈";
    const t = el("div", "toast " + kind, `<span class="t-ico">${ico}</span><div>${esc(msg)}</div>`);
    toastWrap.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateX(20px)"; setTimeout(() => t.remove(), 300); }, 3200);
  }

  /* ── Mockup data (mockup mode only — never a live code path) ─────────────── */
  const MOCK = {
    user: { id: "you", email: "aisha@northstar.agency", name: "Aisha Rahman" },
    workspace: { id: "ws-agency", name: "Northstar Agency" },
    connect: { connected: true, account_id: "acct_1Nz…demo", charges_enabled: true, application_fee: 0 },
    prefix: "INV-",
    contacts: [
      { id: "c1", name: "Bayyinah Studios", first_name: "Yusuf", phone: "+1 415 555 0142" },
      { id: "c2", name: "Crescent Dental", first_name: "Sara", phone: "+1 206 555 8890" },
      { id: "c3", name: "Al-Noor Boutique", first_name: "Layla", phone: "+1 312 555 2211" },
    ],
    invoices: [
      { id: "i1", kind: "invoice", number: "INV-0042", contact: "Bayyinah Studios", currency: "USD", line_items: [{ description: "Brand identity system", qty: 1, unit_price: 280000 }, { description: "Social launch kit", qty: 1, unit_price: 90000 }], discount: { type: "percent", value: 10 }, tax_rate: 8.5, amount_paid: 0, status: "sent", due_date: iso(9), created_at: iso(-4), public_token: "tok_i1" },
      { id: "i2", kind: "invoice", number: "INV-0041", contact: "Crescent Dental", currency: "USD", line_items: [{ description: "Monthly retainer — SEO", qty: 1, unit_price: 150000 }], discount: null, tax_rate: 0, amount_paid: 75000, status: "partial", due_date: iso(3), created_at: iso(-12), public_token: "tok_i2" },
      { id: "i3", kind: "invoice", number: "INV-0039", contact: "Al-Noor Boutique", currency: "USD", line_items: [{ description: "Photography day rate", qty: 2, unit_price: 60000 }], discount: null, tax_rate: 8.5, amount_paid: 130200, status: "paid", due_date: iso(-20), created_at: iso(-30), public_token: "tok_i3" },
      { id: "i4", kind: "invoice", number: "INV-0036", contact: "Crescent Dental", currency: "USD", line_items: [{ description: "Website build — milestone 1", qty: 1, unit_price: 320000 }], discount: null, tax_rate: 8.5, amount_paid: 0, status: "overdue", due_date: iso(-6), created_at: iso(-25), public_token: "tok_i4" },
    ],
    estimates: [
      { id: "e1", kind: "estimate", number: null, contact: "Al-Noor Boutique", currency: "USD", line_items: [{ description: "Seasonal campaign — full funnel", qty: 1, unit_price: 450000 }], discount: { type: "fixed", value: 25000 }, tax_rate: 8.5, amount_paid: 0, status: "sent", due_date: iso(14), created_at: iso(-2), public_token: "tok_e1" },
      { id: "e2", kind: "estimate", number: null, contact: "Bayyinah Studios", currency: "USD", line_items: [{ description: "Video studio — 3 reels", qty: 3, unit_price: 45000 }], discount: null, tax_rate: 0, amount_paid: 0, status: "accepted", due_date: iso(20), created_at: iso(-8), public_token: "tok_e2" },
    ],
    subscriptions: [
      { id: "s1", contact: "Crescent Dental", plan_name: "SEO retainer", amount: 150000, currency: "USD", interval: "month", status: "active", next_charge_at: iso(11) },
      { id: "s2", contact: "Al-Noor Boutique", plan_name: "Social management", amount: 90000, currency: "USD", interval: "month", status: "active", next_charge_at: iso(6) },
      { id: "s3", contact: "Bayyinah Studios", plan_name: "Care plan", amount: 24000, currency: "USD", interval: "month", status: "past_due", next_charge_at: iso(-2) },
    ],
    links: [
      { id: "l1", name: "Discovery call deposit", amount: 15000, currency: "USD", recurring: false, slug: "discovery", active: true, uses: 12 },
      { id: "l2", name: "Ramadan campaign — starter", amount: 199000, currency: "USD", recurring: false, slug: "ramadan", active: true, uses: 3 },
    ],
    transactions: [
      { id: "t1", contact: "Al-Noor Boutique", number: "INV-0039", amount: 130200, method: "card", paid_at: iso(-19) },
      { id: "t2", contact: "Crescent Dental", number: "INV-0041", amount: 75000, method: "card", paid_at: iso(-5) },
      { id: "t3", contact: "Bayyinah Studios", number: "INV-0032", amount: 210000, method: "ach", paid_at: iso(-14) },
    ],
    tax_rates: [{ id: "tr1", name: "Sales Tax (CA)", rate: 8.5, is_default: true }, { id: "tr2", name: "Zero-rated", rate: 0, is_default: false }],
  };
  function iso(dayOffset) { const d = new Date(); d.setDate(d.getDate() + dayOffset); return d.toISOString(); }

  /* ── App state ───────────────────────────────────────────────────────────── */
  const state = {
    loaded: false, loading: false, error: null, previewState: "default",
    user: null, workspaceId: null, workspaceName: "", role: "owner",
    invoices: [], estimates: [], subscriptions: [], links: [], transactions: [], taxRates: [],
    rollup: null, connect: null, prefix: "INV-", contacts: [],
    route: { name: "payments", tab: "invoices" }, editor: null,
  };
  const PREVIEW_STATES = ["default", "empty", "loading", "error", "success"];
  const st = (name) => !connected() && state.previewState === name;
  const canWrite = () => ["owner", "admin", "manager", "staff"].includes(state.role) || !connected();
  const canManage = () => ["owner", "admin", "manager"].includes(state.role) || !connected();

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
        const { data: wsRows } = await c.from("workspaces").select("id,name,parent_workspace_id,status").order("created_at");
        const active = pickActive(wsRows || []);
        if (!active) { state.loaded = true; state.loading = false; renderConn(); render(); return; }
        state.workspaceId = active.id; state.workspaceName = active.name;
        const { data: mine } = await c.from("memberships").select("role").eq("workspace_id", active.id).eq("user_id", user.id).maybeSingle();
        state.role = mine?.role || "staff";
        await loadData(active.id);
      } catch (e) { state.error = e.message || String(e); }
      state.loading = false; state.loaded = true;
    } else {
      state.user = MOCK.user; state.workspaceId = MOCK.workspace.id; state.workspaceName = MOCK.workspace.name; state.role = "owner";
      state.invoices = MOCK.invoices.map(clone); state.estimates = MOCK.estimates.map(clone);
      state.subscriptions = MOCK.subscriptions.map(clone); state.links = MOCK.links.map(clone);
      state.transactions = MOCK.transactions.map(clone); state.taxRates = MOCK.tax_rates.map(clone);
      state.connect = clone(MOCK.connect); state.prefix = MOCK.prefix; state.contacts = MOCK.contacts.map(clone);
      state.rollup = mockRollup();
      state.loaded = true; state.loading = false;
    }
    renderConn(); render();
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function pickActive(list) {
    const usable = (list || []).filter((w) => w.status !== "archived");
    if (!usable.length) return list[0] || null;
    let id; try { id = localStorage.getItem(ACTIVE_KEY); } catch (e) {}
    return usable.find((w) => w.id === id) || usable[0];
  }
  function mockRollup() {
    const collected = MOCK.transactions.reduce((s, t) => s + t.amount, 0);
    const live = MOCK.invoices.filter((i) => ["sent", "viewed", "partial", "overdue"].includes(i.status));
    const outstanding = live.reduce((s, i) => s + (calcTotals(i.line_items, i.discount, i.tax_rate).total - i.amount_paid), 0);
    const overdue = MOCK.invoices.filter((i) => i.status === "overdue").reduce((s, i) => s + (calcTotals(i.line_items, i.discount, i.tax_rate).total - i.amount_paid), 0);
    return { collected, outstanding, overdue, currency: "USD" };
  }
  async function loadData(wsId) {
    const c = ensureClient();
    const [{ data: inv }, { data: subs }, { data: tax }, { data: txn }, { data: roll }, { data: counter }, { data: integ }] = await Promise.all([
      c.from("invoices").select("*").eq("workspace_id", wsId).order("created_at", { ascending: false }),
      c.from("client_subscriptions").select("*").eq("workspace_id", wsId).order("created_at", { ascending: false }),
      c.from("tax_rates").select("*").eq("workspace_id", wsId).order("created_at"),
      c.from("invoice_payments").select("*").eq("workspace_id", wsId).order("paid_at", { ascending: false }).limit(50),
      c.rpc("revenue_rollup", { p_ws: wsId, p_from: null, p_to: null }),
      c.from("invoice_counters").select("prefix").eq("workspace_id", wsId).maybeSingle(),
      c.from("integrations").select("status,config").eq("provider", "stripe").eq("workspace_id", wsId).maybeSingle(),
    ]);
    const all = inv || [];
    state.invoices = all.filter((r) => r.kind === "invoice");
    state.estimates = all.filter((r) => r.kind === "estimate");
    state.subscriptions = subs || [];
    state.taxRates = tax || [];
    state.transactions = txn || [];
    state.rollup = roll || { collected: 0, outstanding: 0, overdue: 0, currency: "USD" };
    state.prefix = counter?.prefix || "INV-";
    state.connect = integ ? { connected: integ.status === "connected", account_id: integ.config?.account_id, application_fee: integ.config?.application_fee_amount || 0, charges_enabled: integ.status === "connected" } : { connected: false };
    state.links = []; // standalone payment_links table deferred (scaffold) — see TASKS
    // contacts for the editor typeahead (RLS-scoped)
    const { data: contacts } = await c.from("contacts").select("id,first_name,last_name,phone").is("deleted_at", null).limit(200);
    state.contacts = (contacts || []).map((x) => ({ id: x.id, name: [x.first_name, x.last_name].filter(Boolean).join(" ") || "Unnamed", first_name: x.first_name, phone: x.phone }));
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Router
     ══════════════════════════════════════════════════════════════════════════ */
  function parseRoute() {
    const h = (location.hash || "#/payments").replace(/^#/, "");
    const parts = h.split("/").filter(Boolean);            // ["payments"] / ["pay","tok"] / ...
    if (parts[0] === "pay" && parts[1]) { state.route = { name: "pay", token: parts[1] }; return; }
    if (parts[0] === "payments" && parts[1] === "new") { state.route = { name: "editor" }; openEditor(parts[2] || null); return; }
    if (parts[0] === "payments" && parts[1] === "invoice" && parts[2]) { state.route = { name: "editor", id: parts[2] }; openEditor(parts[2]); return; }
    if (parts[0] === "settings" && parts[1] === "payments") { state.route = { name: "settings" }; return; }
    const tab = (parts[0] === "payments" && parts[1]) ? parts[1] : "invoices";
    state.route = { name: "payments", tab: ["invoices", "estimates", "subscriptions", "links", "transactions"].includes(tab) ? tab : "invoices" };
  }
  window.addEventListener("hashchange", () => { parseRoute(); render(); });

  /* ══════════════════════════════════════════════════════════════════════════
     Shell (rail + topbar)
     ══════════════════════════════════════════════════════════════════════════ */
  const NAV = [
    { key: "payments", label: "Payments", ico: "receipt", hash: "#/payments" },
    { key: "estimates", label: "Estimates", ico: "file", hash: "#/payments/estimates" },
    { key: "subscriptions", label: "Subscriptions", ico: "repeat", hash: "#/payments/subscriptions" },
    { key: "settings", label: "Payment settings", ico: "settings", hash: "#/settings/payments" },
  ];
  function shell(activeKey, content) {
    const nav = NAV.map((n) => `<div class="nav-item ${n.key === activeKey ? "active" : ""}" data-hash="${n.hash}"><span class="ni-ico">${svg(n.ico)}</span><span>${n.label}</span></div>`).join("");
    return `
      <aside class="rail" id="rail">
        <div class="brand"><span class="mark">✦</span><span><b>AiMind</b><em>Share</em></span></div>
        <div class="nav-group"><div class="nav-group-label">Commerce</div>${nav}</div>
        <div class="rail-foot">M28 · Payments &amp; Invoicing</div>
      </aside>
      <header class="tbar">
        <button class="icon-btn rail-burger" id="railBurger" aria-label="Menu">☰</button>
        <div class="ws-trigger" style="cursor:default">
          <span class="ws-badge">${esc(initials(state.workspaceName || "AiMindShare"))}</span>
          <span class="ws-meta"><span class="ws-name">${esc(state.workspaceName || "Workspace")}</span><span class="ws-kind">Payments</span></span>
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
      Connect a project to read live invoices &amp; revenue and run Stripe checkout. Sample data shown. Preview state:
      ${PREVIEW_STATES.map((s) => `<button class="link ${state.previewState === s ? "on" : ""}" data-preview="${s}">${s}</button>`).join(" ")}</div>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Views
     ══════════════════════════════════════════════════════════════════════════ */
  const total = (r) => calcTotals(r.line_items, r.discount, r.tax_rate).total;
  const contactName = (r) => r.contact || (r.contact_id && (state.contacts.find((c) => c.id === r.contact_id)?.name)) || "No contact";
  const stPill = (s) => `<span class="st st-${s}">${esc(s)}</span>`;

  function revCards() {
    const r = st("empty") ? { collected: 0, outstanding: 0, overdue: 0, currency: "USD" } : (state.rollup || { collected: 0, outstanding: 0, overdue: 0, currency: "USD" });
    const cur = r.currency || "USD";
    const card = (tone, ico, label, val, sub) => `<div class="kpi ${tone}"><div class="kpi-ico">${svg(ico)}</div>
      <div class="kpi-val">${money(val, cur)}</div><div class="kpi-label">${label}</div><div class="kpi-delta">${sub}</div></div>`;
    return `<div class="rev-strip">
      ${card("tone-paid", "trend", "Collected", r.collected, "paid to date")}
      ${card("tone-out", "clock", "Outstanding", r.outstanding, "awaiting payment")}
      ${card("tone-over", "alert", "Overdue", r.overdue, "past due date")}
    </div>`;
  }

  function tabsBar() {
    const t = state.route.tab;
    const counts = { invoices: state.invoices.length, estimates: state.estimates.length, subscriptions: state.subscriptions.length, links: state.links.length, transactions: state.transactions.length };
    const defs = [["invoices", "Invoices", "receipt"], ["estimates", "Estimates", "file"], ["subscriptions", "Subscriptions", "repeat"], ["links", "Payment links", "link"], ["transactions", "Transactions", "coins"]];
    return `<div class="tabs">${defs.map(([k, label, ico]) =>
      `<button class="tab ${t === k ? "on" : ""}" data-hash="#/payments/${k}">${svg(ico, 15)}${label}<span class="tab-count">${counts[k]}</span></button>`).join("")}</div>`;
  }

  function viewPayments() {
    if (st("loading")) return shell("payments", loadingBlock());
    if (st("error")) return shell("payments", errorBlock());
    const head = `<div class="pay-head">
      <div><div class="eyebrow">${svg("card", 13)} Commerce</div>
        <div class="ph-title">Payments</div><div class="ph-sub">Invoices, estimates, subscriptions and revenue for ${esc(state.workspaceName)}.</div></div>
      <div class="spacer"></div>
      ${canWrite() ? `<button class="btn btn-ghost btn-sm" id="newEstimate">${svg("file", 15)} New estimate</button>
      <button class="btn btn-primary" id="newInvoice">${svg("plus", 15)} New invoice</button>` : ""}
    </div>`;
    const body = { invoices: tabInvoices, estimates: tabEstimates, subscriptions: tabSubs, links: tabLinks, transactions: tabTxns }[state.route.tab]();
    return shell("payments", previewStrip() + head + revCards() + tabsBar() + `<div class="panel table-scroll" style="padding:6px 10px">${body}</div>`);
  }

  function invRow(r, isEstimate) {
    const t = total(r), due = t - (r.amount_paid || 0);
    return `<tr data-open="${r.id}" data-kind="${isEstimate ? "estimate" : "invoice"}">
      <td><div class="cell-main"><span class="inv-num">${esc(r.number || (isEstimate ? "Draft estimate" : "—"))}</span>
        <span class="inv-sub">${esc(contactName(r))}</span></div></td>
      <td>${stPill(r.status)}</td>
      <td class="inv-sub">${fmtDate(r.due_date)}</td>
      <td class="num">${money(t, r.currency)}</td>
      <td class="num">${r.amount_paid ? `<span style="color:var(--status-success)">${money(r.amount_paid, r.currency)}</span>` : (isEstimate ? "—" : money(due, r.currency))}</td>
    </tr>`;
  }
  function invTable(rows, isEstimate, emptyMsg) {
    if (st("empty") || !rows.length) return emptyBlock(isEstimate ? "file" : "receipt", emptyMsg.t, emptyMsg.s, isEstimate ? "newEstimate2" : "newInvoice2", isEstimate ? "New estimate" : "New invoice");
    return `<table class="table inv-table"><thead><tr>
      <th>${isEstimate ? "Estimate" : "Invoice"}</th><th>Status</th><th>Due</th><th class="num">Total</th><th class="num">${isEstimate ? "—" : "Balance"}</th>
    </tr></thead><tbody>${rows.map((r) => invRow(r, isEstimate)).join("")}</tbody></table>`;
  }
  const tabInvoices = () => invTable(state.invoices, false, { t: "No invoices yet", s: "Create your first invoice — add line items, tax and a due date, then send a pay link." });
  const tabEstimates = () => invTable(state.estimates, true, { t: "No estimates yet", s: "Draft an estimate; when the client accepts, it converts to an invoice in one click." });

  function tabSubs() {
    const rows = st("empty") ? [] : state.subscriptions;
    if (!rows.length) return emptyBlock("repeat", "No subscriptions", "Set up a recurring plan on your connected Stripe account to auto-bill retainer clients.", canWrite() ? "newSub" : null, "New subscription");
    return `${canWrite() ? `<div style="padding:10px 6px"><button class="btn btn-ghost btn-sm" id="newSub">${svg("plus", 15)} New subscription</button></div>` : ""}
      <table class="table inv-table"><thead><tr><th>Client &amp; plan</th><th>Status</th><th>Next charge</th><th class="num">Amount</th></tr></thead>
      <tbody>${rows.map((s) => `<tr><td><div class="cell-main"><span class="inv-num">${esc(s.plan_name)}</span><span class="inv-sub">${esc(contactName(s))}</span></div></td>
        <td>${stPill(s.status)}</td><td class="inv-sub">${fmtDate(s.next_charge_at)}</td>
        <td class="num">${money(s.amount, s.currency)}<span class="inv-sub"> /${esc(s.interval)}</span></td></tr>`).join("")}</tbody></table>`;
  }

  function tabLinks() {
    return `<div class="banner"><span class="b-ico">${svg("alert", 16)}</span><div><b>Standalone payment links are scaffolded this session.</b>
      Per-invoice Stripe checkout links are live (open any invoice → <em>Send / Pay link</em>). Reusable product links with their own
      slug + QR ship with the <span class="mono">payment_links</span> table (deferred, see TASKS). Sample links shown below.</div></div>
      ${(st("empty") ? [] : state.links).length ? `<table class="table inv-table"><thead><tr><th>Link</th><th>Type</th><th>Uses</th><th class="num">Amount</th></tr></thead>
        <tbody>${state.links.map((l) => `<tr><td><div class="cell-main"><span class="inv-num">${esc(l.name)}</span><span class="inv-sub">/pay/${esc(l.slug)}</span></div></td>
        <td>${l.recurring ? stPill("active") : `<span class="st st-sent">one-time</span>`}</td><td class="inv-sub">${l.uses} paid</td>
        <td class="num">${money(l.amount, l.currency)}</td></tr>`).join("")}</tbody></table>`
        : emptyBlock("link", "No payment links", "Reusable product/deposit links land with the payment_links table.", null)}`;
  }

  function tabTxns() {
    const rows = st("empty") ? [] : state.transactions;
    if (!rows.length) return emptyBlock("coins", "No transactions yet", "Payments recorded by the Stripe webhook appear here — every one writes the client timeline and fires a notification.", null);
    return `<table class="table inv-table"><thead><tr><th>Payment</th><th>Method</th><th>Date</th><th class="num">Amount</th></tr></thead>
      <tbody>${rows.map((t) => `<tr><td><div class="cell-main"><span class="inv-num">${esc(t.number || "Payment")}</span><span class="inv-sub">${esc(t.contact || contactName(t))}</span></div></td>
        <td class="inv-sub" style="text-transform:capitalize">${esc(t.method)}</td><td class="inv-sub">${fmtDate(t.paid_at)}</td>
        <td class="num" style="color:var(--status-success)">${money(t.amount, t.currency || "USD")}</td></tr>`).join("")}</tbody></table>`;
  }

  /* ── Invoice / estimate editor ───────────────────────────────────────────── */
  function openEditor(id) {
    let base;
    if (id) {
      const found = [...state.invoices, ...state.estimates].find((r) => r.id === id);
      base = found ? clone(found) : null;
    }
    if (!base) base = { id: null, kind: state._newKind || "invoice", number: null, contact_id: null, contact: "", currency: "USD",
      line_items: [{ description: "", qty: 1, unit_price: 0 }], discount: null, tax_rate: (state.taxRates.find((t) => t.is_default)?.rate) || 0,
      amount_paid: 0, status: "draft", due_date: iso(14), notes: "" };
    state._newKind = null;
    state.editor = base;
  }
  function viewEditor() {
    const e = state.editor;
    if (!e) { location.hash = "#/payments"; return shell("payments", ""); }
    const t = calcTotals(e.line_items, e.discount, e.tax_rate);
    const due = t.total - (e.amount_paid || 0);
    const isEstimate = e.kind === "estimate";
    const locked = ["paid", "void"].includes(e.status);
    const rows = e.line_items.map((li, i) => `<tr>
      <td><input class="li-input" data-li="${i}" data-f="description" placeholder="Description" value="${esc(li.description)}" ${locked ? "disabled" : ""}></td>
      <td style="width:70px"><input class="li-input num" data-li="${i}" data-f="qty" value="${esc(li.qty)}" ${locked ? "disabled" : ""}></td>
      <td style="width:120px"><input class="li-input num" data-li="${i}" data-f="unit_price_major" value="${(li.unit_price / 100).toFixed(2)}" ${locked ? "disabled" : ""}></td>
      <td class="num"><span class="li-amount">${money(Math.round((li.qty || 0) * (li.unit_price || 0)), e.currency)}</span></td>
      <td style="width:38px">${locked ? "" : `<button class="li-del" data-del="${i}" title="Remove">${svg("trash", 14)}</button>`}</td>
    </tr>`).join("");
    const head = `<div class="pay-head">
      <button class="btn btn-ghost btn-sm" data-hash="#/payments${isEstimate ? "/estimates" : ""}">${svg("back", 15)} Back</button>
      <div><div class="eyebrow">${svg(isEstimate ? "file" : "receipt", 13)} ${isEstimate ? "Estimate" : "Invoice"}</div>
        <div class="ph-title">${esc(e.number || (e.id ? "Edit" : "New " + (isEstimate ? "estimate" : "invoice")))}</div></div>
      <div class="spacer"></div>${e.id ? stPill(e.status) : ""}</div>`;
    const editorBody = `<div class="panel" style="padding:22px">
      <div class="meta-row">
        <div class="form-field"><label class="label">Client</label>
          <input class="li-input" id="edContact" list="contactList" placeholder="Search a contact…" value="${esc(e.contact || contactName(e) || "")}" ${locked ? "disabled" : ""}>
          <datalist id="contactList">${state.contacts.map((c) => `<option value="${esc(c.name)}">`).join("")}</datalist></div>
        <div class="form-field"><label class="label">${isEstimate ? "Valid until" : "Due date"}</label>
          <input class="li-input" id="edDue" type="date" value="${(e.due_date || "").slice(0, 10)}" ${locked ? "disabled" : ""}></div>
      </div>
      <label class="label">Line items</label>
      <div class="table-scroll"><table class="li-table"><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th><th></th></tr></thead>
        <tbody id="liBody">${rows}</tbody></table></div>
      ${locked ? "" : `<button class="btn btn-ghost btn-sm" id="addLine" style="margin-top:10px">${svg("plus", 14)} Add line</button>`}
      <div class="meta-row" style="margin-top:20px">
        <div class="form-field"><label class="label">Discount</label>
          <div style="display:flex;gap:8px;align-items:center">
            <div class="seg" id="discType"><button data-dt="none" class="${!e.discount ? "on" : ""}">None</button><button data-dt="percent" class="${e.discount?.type === "percent" ? "on" : ""}">%</button><button data-dt="fixed" class="${e.discount?.type === "fixed" ? "on" : ""}">Fixed</button></div>
            <input class="li-input num" id="discVal" style="width:90px" value="${e.discount ? (e.discount.type === "fixed" ? (e.discount.value / 100).toFixed(2) : e.discount.value) : ""}" ${!e.discount || locked ? "disabled" : ""}>
          </div></div>
        <div class="form-field"><label class="label">Tax rate (%)</label>
          <input class="li-input num" id="edTax" value="${esc(e.tax_rate)}" ${locked ? "disabled" : ""}></div>
      </div>
      <div class="form-field"><label class="label">Notes / terms</label>
        <input class="li-input" id="edNotes" placeholder="Payment terms, thank-you note…" value="${esc(e.notes || "")}" ${locked ? "disabled" : ""}></div>
    </div>`;
    const preview = `<div class="preview-card"><div class="doc">
      <div class="doc-brand"><div class="doc-logo">✦</div><div style="text-align:right"><div class="doc-kind">${isEstimate ? "Estimate" : "Invoice"}</div><div class="mono" style="font-size:13px;color:var(--ink-700)">${esc(e.number || "—")}</div></div></div>
      <div style="margin:14px 0;font-size:12.5px;color:var(--ink-400)">Billed to <b style="color:var(--ink-700)">${esc(e.contact || contactName(e) || "—")}</b></div>
      <div class="doc-total-row"><span>Subtotal</span><span class="v">${money(t.subtotal, e.currency)}</span></div>
      ${t.discountTotal ? `<div class="doc-total-row muted-row"><span>Discount</span><span class="v">−${money(t.discountTotal, e.currency)}</span></div>` : ""}
      ${t.tax ? `<div class="doc-total-row muted-row"><span>Tax (${esc(e.tax_rate)}%)</span><span class="v">${money(t.tax, e.currency)}</span></div>` : ""}
      <div class="doc-total-row grand"><span>Total</span><span class="v">${money(t.total, e.currency)}</span></div>
      ${e.amount_paid ? `<div class="doc-total-row"><span>Paid</span><span class="v" style="color:var(--status-success)">−${money(e.amount_paid, e.currency)}</span></div>
        <div class="doc-total-row due"><span>Balance due</span><span class="v">${money(due, e.currency)}</span></div>` : ""}
      <div style="margin-top:20px;display:flex;flex-direction:column;gap:9px">
        ${locked ? `<div class="pay-secure">${svg("lock", 14)} This ${isEstimate ? "estimate" : "invoice"} is ${esc(e.status)}</div>`
          : `<button class="btn btn-primary" id="saveInv">${svg("check", 15)} Save ${isEstimate ? "estimate" : "invoice"}</button>
             ${e.id ? `<button class="btn btn-ghost" id="sendInv">${svg("send", 15)} Send / pay link</button>` : ""}
             ${isEstimate && e.id ? `<button class="btn btn-gold" id="acceptEst">${svg("swap", 15)} Accept → invoice</button>` : ""}`}
        ${e.id && canManage() && !["void"].includes(e.status) ? `<button class="btn btn-ghost btn-sm" id="voidInv" style="color:var(--status-danger);border-color:var(--status-danger)">Void</button>` : ""}
      </div>
    </div></div>`;
    return shell("payments", head + `<div class="editor-grid">${editorBody}${preview}</div>`);
  }

  /* ── Settings ────────────────────────────────────────────────────────────── */
  function viewSettings() {
    const cn = state.connect || { connected: false };
    const connectCard = `<div class="panel connect-card ${cn.connected ? "ok" : ""}">
      <div class="connect-ico">${svg("card", 22)}</div>
      <div style="flex:1"><div style="font-weight:600;color:var(--ink-900)">Stripe Connect</div>
        <div class="subs-mini">${cn.connected ? `Connected · ${esc(cn.account_id || "account")} · charges enabled · application fee ${cn.application_fee || 0}` : "Not connected — client charges land in your own Stripe account (Standard Connect via M41)"}</div></div>
      ${cn.connected ? `<span class="st st-active">connected</span>` : `<button class="btn btn-primary btn-sm" id="connectStripe">Connect Stripe</button>`}</div>`;
    const taxRows = (st("empty") ? [] : state.taxRates).map((t) => `<tr><td><span class="inv-num">${esc(t.name)}</span> ${t.is_default ? `<span class="st st-sent">default</span>` : ""}</td>
      <td class="num">${esc(t.rate)}%</td><td class="num">${canManage() ? `<button class="li-del" data-taxdel="${t.id}">${svg("trash", 14)}</button>` : ""}</td></tr>`).join("");
    const taxCard = `<div class="panel" style="padding:20px 22px">
      <div class="panel-head"><b>Tax rates</b><div style="flex:1"></div>${canManage() ? `<button class="btn btn-ghost btn-sm" id="addTax">${svg("plus", 14)} Add rate</button>` : ""}</div>
      ${state.taxRates.length && !st("empty") ? `<table class="table inv-table"><thead><tr><th>Name</th><th class="num">Rate</th><th></th></tr></thead><tbody>${taxRows}</tbody></table>` : `<p class="muted">No tax rates yet. Add one to apply on invoices.</p>`}</div>`;
    const numCard = `<div class="panel" style="padding:20px 22px">
      <div class="panel-head"><b>Invoice numbering</b></div>
      <div class="form-field" style="max-width:260px"><label class="label">Prefix</label>
        <div style="display:flex;gap:8px"><input class="li-input" id="numPrefix" value="${esc(state.prefix)}" ${canManage() ? "" : "disabled"}>
        ${canManage() ? `<button class="btn btn-ghost btn-sm" id="savePrefix">Save</button>` : ""}</div>
        <span class="help">Next invoice: <span class="mono">${esc(state.prefix)}00NN</span> · gap-free per workspace.</span></div></div>`;
    const reminderCard = `<div class="panel" style="padding:20px 22px">
      <div class="panel-head"><b>Reminders &amp; overdue</b></div>
      <div class="banner" style="margin:0"><span class="b-ico">${svg("clock", 16)}</span><div>A daily <span class="mono">m28-overdue-sweep</span> flips past-due invoices to <b>overdue</b> (feeds the revenue cards). The
        configurable reminder schedule (3d before / on-due / +3d / +7d) and late fees are scaffolded — they ship as a reminder job with the payments worker.</div></div></div>`;
    return shell("settings", previewStrip() + `<div class="pay-head"><div><div class="eyebrow">${svg("settings", 13)} Settings</div><div class="ph-title">Payment settings</div>
      <div class="ph-sub">Connect Stripe, manage tax rates and numbering.</div></div></div>
      <div style="display:flex;flex-direction:column;gap:18px">${connectCard}${taxCard}${numCard}${reminderCard}</div>`);
  }

  /* ── Public pay page (standalone — no rail) ──────────────────────────────── */
  async function viewPay() {
    const tok = state.route.token;
    let inv, brand, payer;
    if (connected()) {
      try {
        const c = ensureClient();
        const { data, error } = await c.functions.invoke("public-invoice", { body: { token: tok, action: "view" } });
        if (error || !data?.ok) throw new Error(data?.error || "not_found");
        inv = data.data.invoice; brand = data.data.brand; payer = data.data.payer_name;
      } catch (e) { return payShell(`<div class="pay-card"><div class="pay-body">${emptyBlock("alert", "Link not found", "This payment link is invalid or has expired.", null)}</div></div>`); }
    } else {
      const m = [...MOCK.invoices, ...MOCK.estimates].find((x) => x.public_token === tok) || MOCK.invoices[0];
      inv = { ...m, subtotal: calcTotals(m.line_items, m.discount, m.tax_rate).subtotal, discount_total: calcTotals(m.line_items, m.discount, m.tax_rate).discountTotal, tax: calcTotals(m.line_items, m.discount, m.tax_rate).tax, total: calcTotals(m.line_items, m.discount, m.tax_rate).total };
      brand = { name: MOCK.workspace.name }; payer = m.first_name || (state.contacts.find(() => true) || {}).first_name || "there";
    }
    const paid = new URLSearchParams(location.search).get("paid") === "1" || inv.status === "paid";
    const balance = Math.max(0, (inv.total || 0) - (inv.amount_paid || 0));
    const isEstimate = inv.kind === "estimate";
    const lineRows = (inv.line_items || []).map((li) => `<div class="pay-line"><span>${esc(li.description || "Item")} ${li.qty > 1 ? `× ${li.qty}` : ""}</span><span class="v">${money(Math.round((li.qty || 0) * (li.unit_price || 0)), inv.currency)}</span></div>`).join("");
    const body = paid ? `<div class="pay-paid"><div class="pp-check">${svg("check", 28)}</div>
        <div style="font-family:var(--font-serif);font-size:22px;color:var(--ink-900)">Payment received</div>
        <div class="muted" style="margin-top:6px">Thank you${payer ? ", " + esc(payer) : ""}. A receipt for ${esc(inv.number || "your invoice")} is on its way.</div></div>`
      : `${lineRows}
        ${inv.discount_total ? `<div class="pay-line"><span>Discount</span><span class="v">−${money(inv.discount_total, inv.currency)}</span></div>` : ""}
        ${inv.tax ? `<div class="pay-line"><span>Tax</span><span class="v">${money(inv.tax, inv.currency)}</span></div>` : ""}
        ${inv.amount_paid ? `<div class="pay-line"><span>Paid so far</span><span class="v" style="color:var(--status-success)">−${money(inv.amount_paid, inv.currency)}</span></div>` : ""}
        <div class="pay-line total"><span>${isEstimate ? "Estimate total" : "Amount due"}</span><span class="v">${money(isEstimate ? inv.total : balance, inv.currency)}</span></div>
        <div class="pay-cta">${isEstimate
          ? `<button class="btn btn-gold" id="payAccept">${svg("check", 16)} Accept this estimate</button>`
          : `<button class="btn btn-primary" id="payNow">${svg("lock", 16)} Pay ${money(balance, inv.currency)}</button>`}</div>
        <div class="pay-secure">${svg("lock", 13)} Secured by Stripe · ${isEstimate ? "no charge to accept" : "card, Apple Pay & Google Pay"}</div>`;
    return payShell(`<div class="pay-card">
      <div class="pay-hero"><div class="ph-brand"><div class="ph-logo">✦</div><div><div class="ph-name">${esc(brand?.name || "Invoice")}</div>
        <div class="doc-kind">${esc(inv.number || (isEstimate ? "Estimate" : "Invoice"))}</div></div></div>
        ${!paid ? `<div class="pay-amount"><div class="pa-label">${isEstimate ? "Estimate total" : "Amount due"}</div><div class="pa-val">${money(isEstimate ? inv.total : balance, inv.currency)}</div>
          ${inv.due_date ? `<div class="subs-mini" style="margin-top:6px">${isEstimate ? "Valid until" : "Due"} ${fmtDate(inv.due_date)}</div>` : ""}</div>` : ""}</div>
      <div class="pay-body">${body}</div></div>
      <div class="pay-foot">Powered by <b>AiMindShare</b> · This is a secure payment page</div>`);
  }
  function payShell(inner) { return `<div class="pay-page" style="grid-column:1/-1"><div class="pay-doc">${inner}</div></div>`; }

  /* ── Shared state blocks (Gate-5) ────────────────────────────────────────── */
  function loadingBlock() {
    return previewStrip() + `<div class="pay-head"><div><div class="eyebrow">${svg("card", 13)} Commerce</div><div class="ph-title">Payments</div></div></div>
      <div class="rev-strip">${[0, 1, 2].map(() => `<div class="kpi"><div class="skeleton" style="height:34px;width:34px;border-radius:10px"></div><div class="skeleton" style="height:22px;width:60%;margin-top:14px"></div><div class="skeleton" style="height:10px;width:40%;margin-top:10px"></div></div>`).join("")}</div>
      <div class="panel" style="padding:18px">${[0, 1, 2, 3, 4].map(() => `<div class="skeleton" style="height:44px;margin:8px 0;border-radius:10px"></div>`).join("")}</div>`;
  }
  function errorBlock() {
    const msg = state.error || "We couldn't reach the server.";
    return previewStrip() + `<div class="panel probe state-error" style="padding:40px;text-align:center">
      <div style="color:var(--status-danger);margin-bottom:10px">${svg("alert", 28)}</div>
      <div style="font-family:var(--font-serif);font-size:22px;color:var(--ink-900)">Something went wrong</div>
      <p class="muted" style="margin:8px auto 18px;max-width:420px">${esc(msg)}</p>
      <button class="btn btn-primary" id="retry">Try again</button></div>`;
  }
  function emptyBlock(ico, title, sub, btnId, btnLabel) {
    return `<div class="empty-state"><div style="color:var(--teal-500);opacity:.6">${svg(ico, 40)}</div>
      <div style="font-family:var(--font-serif);font-size:21px;color:var(--ink-900)">${esc(title)}</div>
      <p class="muted">${esc(sub)}</p>
      ${btnId && canWrite() ? `<button class="btn btn-primary btn-sm" id="${btnId}">${svg("plus", 14)} ${esc(btnLabel)}</button>` : ""}</div>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Render dispatch + event wiring
     ══════════════════════════════════════════════════════════════════════════ */
  async function render() {
    const app = $("#app");
    if (state.route.name === "pay") { app.classList.remove("shell"); app.innerHTML = await viewPay(); wirePay(); return; }
    app.classList.add("shell");
    if (state.route.name === "editor") app.innerHTML = viewEditor();
    else if (state.route.name === "settings") app.innerHTML = viewSettings();
    else app.innerHTML = viewPayments();
    wireCommon();
    if (state.route.name === "editor") wireEditor();
    else if (state.route.name === "settings") wireSettings();
    else wireList();
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
    $$("[data-preview]").forEach((b) => b.addEventListener("click", () => { state.previewState = b.dataset.preview; render(); }));
    const retry = $("#retry"); if (retry) retry.addEventListener("click", () => { state.previewState = "default"; boot(); });
    renderConn();
  }

  function wireList() {
    const goNew = (kind) => { state._newKind = kind; location.hash = "#/payments/new"; };
    ["newInvoice", "newInvoice2"].forEach((id) => { const b = $("#" + id); if (b) b.addEventListener("click", () => goNew("invoice")); });
    ["newEstimate", "newEstimate2"].forEach((id) => { const b = $("#" + id); if (b) b.addEventListener("click", () => goNew("estimate")); });
    const ns = $("#newSub"); if (ns) ns.addEventListener("click", subscriptionModal);
    $$("tr[data-open]").forEach((tr) => tr.addEventListener("click", () => {
      const id = tr.dataset.open; if (!id) return;
      location.hash = "#/payments/invoice/" + id;
    }));
  }

  function wireEditor() {
    const e = state.editor; if (!e) return;
    const rerender = () => { app_patch_editor(); };
    const app_patch_editor = () => { $("#app").innerHTML = viewEditor(); wireCommon(); wireEditor(); };
    // line item edits
    $$("[data-li]").forEach((inp) => inp.addEventListener("input", () => {
      const i = +inp.dataset.li, f = inp.dataset.f;
      if (f === "unit_price_major") e.line_items[i].unit_price = Math.round((parseFloat(inp.value) || 0) * 100);
      else if (f === "qty") e.line_items[i].qty = parseFloat(inp.value) || 0;
      else e.line_items[i][f] = inp.value;
      // live-update just the amount + preview without losing focus
      refreshPreview();
    }));
    $$("[data-del]").forEach((b) => b.addEventListener("click", () => { e.line_items.splice(+b.dataset.del, 1); if (!e.line_items.length) e.line_items.push({ description: "", qty: 1, unit_price: 0 }); rerender(); }));
    const add = $("#addLine"); if (add) add.addEventListener("click", () => { e.line_items.push({ description: "", qty: 1, unit_price: 0 }); rerender(); });
    const tax = $("#edTax"); if (tax) tax.addEventListener("input", () => { e.tax_rate = parseFloat(tax.value) || 0; refreshPreview(); });
    const notes = $("#edNotes"); if (notes) notes.addEventListener("input", () => { e.notes = notes.value; });
    const due = $("#edDue"); if (due) due.addEventListener("input", () => { e.due_date = due.value ? new Date(due.value).toISOString() : null; });
    const contact = $("#edContact"); if (contact) contact.addEventListener("input", () => {
      e.contact = contact.value; const match = state.contacts.find((c) => c.name === contact.value); e.contact_id = match ? match.id : e.contact_id;
    });
    $$("#discType button").forEach((b) => b.addEventListener("click", () => {
      const dt = b.dataset.dt;
      if (dt === "none") e.discount = null; else e.discount = { type: dt, value: e.discount?.value || 0 };
      rerender();
    }));
    const dv = $("#discVal"); if (dv) dv.addEventListener("input", () => { if (e.discount) e.discount.value = e.discount.type === "fixed" ? Math.round((parseFloat(dv.value) || 0) * 100) : (parseFloat(dv.value) || 0); refreshPreview(); });
    const save = $("#saveInv"); if (save) save.addEventListener("click", saveInvoice);
    const send = $("#sendInv"); if (send) send.addEventListener("click", () => sendModal(e));
    const acc = $("#acceptEst"); if (acc) acc.addEventListener("click", acceptEstimate);
    const vd = $("#voidInv"); if (vd) vd.addEventListener("click", voidInvoice);
  }
  function refreshPreview() {
    const e = state.editor; const t = calcTotals(e.line_items, e.discount, e.tax_rate);
    // update line amounts
    $$("#liBody tr").forEach((tr, i) => { const a = tr.querySelector(".li-amount"); if (a && e.line_items[i]) a.textContent = money(Math.round((e.line_items[i].qty || 0) * (e.line_items[i].unit_price || 0)), e.currency); });
    const pc = $(".preview-card"); if (pc) { const wrap = el("div"); wrap.innerHTML = viewEditor(); const fresh = wrap.querySelector(".preview-card"); if (fresh) { pc.replaceWith(fresh); wireEditor(); } }
  }

  function wireSettings() {
    const cs = $("#connectStripe"); if (cs) cs.addEventListener("click", () => connected()
      ? invokeConnect() : toast("Connect a project first to onboard Stripe (Standard Connect via M41).", "info"));
    const at = $("#addTax"); if (at) at.addEventListener("click", taxModal);
    $$("[data-taxdel]").forEach((b) => b.addEventListener("click", () => deleteTax(b.dataset.taxdel)));
    const sp = $("#savePrefix"); if (sp) sp.addEventListener("click", savePrefix);
  }

  function wirePay() {
    wireCommon();
    const tt = $("#themeToggle"); // pay page has no topbar; theme persists from boot
    const pn = $("#payNow"); if (pn) pn.addEventListener("click", payNow);
    const pa = $("#payAccept"); if (pa) pa.addEventListener("click", payAccept);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Actions (mock = local state; live = supabase / edge functions)
     ══════════════════════════════════════════════════════════════════════════ */
  async function saveInvoice() {
    const e = state.editor;
    if (!e.line_items.some((li) => li.description && li.unit_price)) { toast("Add at least one line item with a description and price.", "danger"); return; }
    if (!connected()) {
      const bucket = e.kind === "estimate" ? state.estimates : state.invoices;
      if (e.id) { const idx = bucket.findIndex((r) => r.id === e.id); if (idx >= 0) bucket[idx] = clone(e); }
      else { e.id = "new-" + Date.now(); if (e.kind === "invoice") e.number = state.prefix + String(40 + state.invoices.length + 3).padStart(4, "0"); e.status = "draft"; bucket.unshift(clone(e)); }
      state.rollup = mockRollup();
      toast(`${e.kind === "estimate" ? "Estimate" : "Invoice"} saved.`, "success");
      location.hash = "#/payments" + (e.kind === "estimate" ? "/estimates" : "");
      return;
    }
    try {
      const c = ensureClient();
      const payload = { workspace_id: state.workspaceId, contact_id: e.contact_id || null, kind: e.kind,
        currency: e.currency, line_items: e.line_items, discount: e.discount, tax_rate: e.tax_rate,
        due_date: e.due_date ? e.due_date.slice(0, 10) : null, notes: e.notes || null };
      let row;
      if (e.id) ({ data: row } = await c.from("invoices").update(payload).eq("id", e.id).select().single());
      else ({ data: row } = await c.from("invoices").insert(payload).select().single());
      if (!row) throw new Error("save failed");
      toast(`${e.kind === "estimate" ? "Estimate" : "Invoice"} ${row.number || "saved"}.`, "success");
      await loadData(state.workspaceId);
      location.hash = "#/payments" + (e.kind === "estimate" ? "/estimates" : "");
    } catch (err) { toast(err.message || "Could not save.", "danger"); }
  }

  async function acceptEstimate() {
    const e = state.editor;
    if (!connected()) {
      e.kind = "invoice"; e.status = "sent"; e.number = state.prefix + String(40 + state.invoices.length + 3).padStart(4, "0");
      state.estimates = state.estimates.filter((r) => r.id !== e.id); state.invoices.unshift(clone(e));
      state.rollup = mockRollup(); toast("Estimate accepted → invoice " + e.number, "success"); location.hash = "#/payments"; return;
    }
    try {
      const c = ensureClient();
      const { data, error } = await c.rpc("accept_estimate", { p_ws: state.workspaceId, p_invoice: e.id });
      if (error) throw error;
      toast("Estimate accepted → " + (data?.number || "invoice"), "success");
      await loadData(state.workspaceId); location.hash = "#/payments";
    } catch (err) { toast(err.message || "Could not accept.", "danger"); }
  }

  async function voidInvoice() {
    const e = state.editor;
    if (!confirm("Void this invoice? This cannot be undone.")) return;
    if (!connected()) { e.status = "void"; const b = e.kind === "estimate" ? state.estimates : state.invoices; const i = b.findIndex((r) => r.id === e.id); if (i >= 0) b[i].status = "void"; state.rollup = mockRollup(); toast("Invoice voided.", "info"); render(); return; }
    try { const c = ensureClient(); const { error } = await c.from("invoices").update({ status: "void" }).eq("id", e.id); if (error) throw error; toast("Invoice voided.", "info"); await loadData(state.workspaceId); e.status = "void"; render(); }
    catch (err) { toast(err.message || "Could not void (manager+ required).", "danger"); }
  }

  function sendModal(e) {
    let channel = "link";
    modal(`Send ${e.kind === "estimate" ? "estimate" : "invoice"} ${esc(e.number || "")}`, `
      <p class="muted" style="margin-top:-4px">Share a secure pay link. Choose how it reaches your client.</p>
      <div class="seg" id="sendCh" style="margin:10px 0">
        <button data-ch="link" class="on">${svg("copy", 14)} Copy link</button>
        <button data-ch="sms">${svg("msg", 14)} Text-to-Pay</button>
        <button data-ch="email">${svg("mail", 14)} Email</button>
      </div>
      <div id="sendBody"></div>`,
      `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="doSend">Send</button>`);
    const link = `${location.origin}${location.pathname}#/pay/${e.public_token || "tok_demo"}`;
    const bodyFor = (ch) => {
      if (ch === "email") return `<div class="banner"><span class="b-ico">${svg("alert", 15)}</span><div><b>Email delivery is pending a provider (D-011).</b> The invoice is marked sent and the link is ready; nothing is emailed until Resend/SendGrid is chosen.</div></div>`;
      if (ch === "sms") return `<div class="banner"><span class="b-ico">${svg("msg", 15)}</span><div>Text-to-Pay sends the link over SMS via the M12 inbox (consent-gated by M05, metered there). ${e.contact ? "" : "Add a contact with a phone number first."}</div></div>`;
      return `<div class="field"><label class="label">Public pay link</label><input class="li-input" id="payLink" readonly value="${esc(link)}"></div>`;
    };
    const setBody = (ch) => { $("#sendBody").innerHTML = bodyFor(ch); };
    setBody("link");
    $$("#sendCh button").forEach((b) => b.addEventListener("click", () => { channel = b.dataset.ch; $$("#sendCh button").forEach((x) => x.classList.toggle("on", x === b)); setBody(channel); }));
    $("#doSend").addEventListener("click", async () => {
      if (channel === "link") { try { await navigator.clipboard.writeText(link); } catch (e) {} toast("Pay link copied.", "success"); closeModal(); return; }
      if (!connected()) { toast(channel === "email" ? "Marked sent (email delivery pending D-011)." : "Text-to-Pay queued via M12 (demo).", channel === "email" ? "info" : "success"); closeModal(); return; }
      try {
        const c = ensureClient();
        const { data, error } = await c.functions.invoke("invoice-send", { body: { workspace_id: state.workspaceId, invoice_id: e.id, channel, return_url: location.origin + location.pathname + "#" } });
        if (error || !data?.ok) throw new Error(data?.error || "send failed");
        toast(channel === "email" ? "Marked sent — email delivery pending D-011." : channel === "sms" ? (data.data.sms_ready ? "Opening SMS composer in M12…" : "No phone on file for this contact.") : "Sent.", "success");
        await loadData(state.workspaceId); closeModal(); render();
      } catch (err) { toast(err.message || "Could not send.", "danger"); }
    });
  }

  async function payNow() {
    const btn = $("#payNow"); if (btn) btn.textContent = "Redirecting to secure checkout…";
    if (!connected()) { setTimeout(() => { const u = new URL(location.href); u.searchParams.set("paid", "1"); location.href = u.toString(); }, 700); return; }
    try {
      const c = ensureClient();
      const { data, error } = await c.functions.invoke("public-invoice", { body: { token: state.route.token, action: "intent" } });
      if (error || !data?.ok) throw new Error(data?.error === "stripe_unconfigured" ? "Online payment isn't enabled for this invoice yet." : (data?.error || "Payment failed to start."));
      // A real Payment Element would mount here with data.data.client_secret. That live
      // wiring is a carry-over (needs Stripe.js + a connected test account).
      toast("PaymentIntent created — mount the Stripe Payment Element with the returned client_secret (live carry-over).", "info");
    } catch (err) { toast(err.message, "danger"); if (btn) btn.innerHTML = `${svg("lock", 16)} Try again`; }
  }
  async function payAccept() {
    if (!connected()) { toast("Estimate accepted (demo).", "success"); setTimeout(() => location.reload(), 600); return; }
    try {
      const c = ensureClient();
      const { data, error } = await c.functions.invoke("public-invoice", { body: { token: state.route.token, action: "accept" } });
      if (error || !data?.ok) throw new Error(data?.error || "Could not accept");
      toast("Accepted! Invoice " + (data.data.number || "") + " created.", "success");
      setTimeout(() => render(), 500);
    } catch (err) { toast(err.message, "danger"); }
  }

  function subscriptionModal() {
    modal("New subscription", `
      <div class="form-field"><label class="label">Client</label><input class="li-input" id="subContact" list="contactList" placeholder="Contact…"><datalist id="contactList">${state.contacts.map((c) => `<option value="${esc(c.name)}">`).join("")}</datalist></div>
      <div class="meta-row"><div class="form-field"><label class="label">Plan name</label><input class="li-input" id="subPlan" placeholder="Monthly retainer"></div>
      <div class="form-field"><label class="label">Amount</label><input class="li-input num" id="subAmt" placeholder="0.00"></div></div>
      <div class="form-field"><label class="label">Interval</label><div class="seg" id="subInt"><button data-i="week">Weekly</button><button data-i="month" class="on">Monthly</button><button data-i="year">Yearly</button></div></div>`,
      `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="doSub">Create</button>`);
    let interval = "month";
    $$("#subInt button").forEach((b) => b.addEventListener("click", () => { interval = b.dataset.i; $$("#subInt button").forEach((x) => x.classList.toggle("on", x === b)); }));
    $("#doSub").addEventListener("click", async () => {
      const plan = $("#subPlan").value.trim(), amt = Math.round((parseFloat($("#subAmt").value) || 0) * 100), cname = $("#subContact").value.trim();
      if (!plan || !amt) { toast("Add a plan name and amount.", "danger"); return; }
      const match = state.contacts.find((c) => c.name === cname);
      if (!connected()) { state.subscriptions.unshift({ id: "s-" + Date.now(), contact: cname || "New client", plan_name: plan, amount: amt, currency: "USD", interval, status: "active", next_charge_at: iso(30) }); toast("Subscription created (demo).", "success"); closeModal(); location.hash = "#/payments/subscriptions"; render(); return; }
      try { const c = ensureClient(); const { error } = await c.from("client_subscriptions").insert({ workspace_id: state.workspaceId, contact_id: match?.id || null, plan_name: plan, amount: amt, currency: "USD", interval, status: "active", next_charge_at: iso(30) }); if (error) throw error; toast("Subscription created.", "success"); await loadData(state.workspaceId); closeModal(); location.hash = "#/payments/subscriptions"; render(); }
      catch (err) { toast(err.message || "Could not create.", "danger"); }
    });
  }

  function taxModal() {
    modal("Add tax rate", `
      <div class="meta-row"><div class="form-field"><label class="label">Name</label><input class="li-input" id="taxName" placeholder="Sales Tax"></div>
      <div class="form-field"><label class="label">Rate (%)</label><input class="li-input num" id="taxRate" placeholder="8.5"></div></div>`,
      `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="doTax">Add</button>`);
    $("#doTax").addEventListener("click", async () => {
      const name = $("#taxName").value.trim(), rate = parseFloat($("#taxRate").value) || 0;
      if (!name) { toast("Give the rate a name.", "danger"); return; }
      if (!connected()) { state.taxRates.push({ id: "tr-" + Date.now(), name, rate, is_default: false }); toast("Tax rate added.", "success"); closeModal(); render(); return; }
      try { const c = ensureClient(); const { error } = await c.from("tax_rates").insert({ workspace_id: state.workspaceId, name, rate }); if (error) throw error; toast("Tax rate added.", "success"); await loadData(state.workspaceId); closeModal(); render(); }
      catch (err) { toast(err.message || "Manager+ required.", "danger"); }
    });
  }
  async function deleteTax(id) {
    if (!connected()) { state.taxRates = state.taxRates.filter((t) => t.id !== id); render(); return; }
    try { const c = ensureClient(); const { error } = await c.from("tax_rates").delete().eq("id", id); if (error) throw error; await loadData(state.workspaceId); render(); }
    catch (err) { toast(err.message || "Manager+ required.", "danger"); }
  }
  async function savePrefix() {
    const p = $("#numPrefix").value.trim() || "INV-";
    if (!connected()) { state.prefix = p; toast("Numbering prefix saved.", "success"); return; }
    try { const c = ensureClient(); const { error } = await c.from("invoice_counters").update({ prefix: p }).eq("workspace_id", state.workspaceId); if (error) throw error; state.prefix = p; toast("Numbering prefix saved.", "success"); }
    catch (err) { toast(err.message || "Manager+ required.", "danger"); }
  }
  function invokeConnect() { toast("Stripe Standard Connect onboarding runs through M41 (integrations) — scaffolded this session.", "info"); }

  /* ── Modal primitive ─────────────────────────────────────────────────────── */
  function modal(title, body, footer) {
    const root = $("#modalRoot");
    root.innerHTML = `<div class="modal-scrim" id="mScrim"><div class="modal-card" role="dialog" aria-modal="true">
      <div class="modal-head"><h3 style="font-family:var(--font-serif);font-size:20px;margin:0">${esc(title)}</h3><button class="icon-btn" data-close>✕</button></div>
      <div class="modal-body">${body}</div><div class="modal-foot">${footer}</div></div></div>`;
    $("#mScrim").addEventListener("click", (ev) => { if (ev.target.id === "mScrim") closeModal(); });
    $$("[data-close]").forEach((b) => b.addEventListener("click", closeModal));
  }
  function closeModal() { $("#modalRoot").innerHTML = ""; }

  /* ── Go ──────────────────────────────────────────────────────────────────── */
  boot();
})();
