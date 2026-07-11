/* ═══════════════════════════════════════════════════════════════════════════
   m16-campaigns.js — AiMindShare Module M16 · Campaigns (Email + SMS)
   Vanilla hash-routed app on Supabase. The send is the module: broadcasts &
   drip sequences that fan out as jobs (campaign.send → throttled email.deliver /
   sms.deliver), A/B subject testing, unsubscribe compliance (dual-write to
   suppressions + M05 consent), and per-send metering (email / sms). The browser
   READS its data (RLS-scoped, anon key only, Law 3) and calls the Edge Functions
   (campaigns → send-now / test-send / spam-check). The walls are server-side:
   send_events + suppressions are SERVICE-ROLE-written (delivery history / block
   list can't be forged — D-089); the SendGrid key lives in Vault (Gate 7).
   No project connected → a high-fidelity mockup with a default/empty/loading/
   error/success preview switcher (Gate-5). Block-JSON → responsive inline-CSS
   HTML is compiled directly (MJML deferred, D-087). Tokens-only styling; 3 fonts;
   calm token loaders (no sheen anims); dark = grid + orbs only, no stars (app.css).
   ═══════════════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const initials = (s) => (s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const fmtInt = (n) => new Intl.NumberFormat("en-US").format(Number(n) || 0);
  const pct = (n, d) => (d ? ((n / d) * 100) : 0);
  const fmtPct = (n, d) => (d ? pct(n, d).toFixed(1) : "0.0") + "%";
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
  const fmtDateTime = (d) => d ? new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function iso(dayOffset) { const d = new Date(); d.setDate(d.getDate() + dayOffset); return d.toISOString(); }
  function timeAgo(d) { if (!d) return "never"; const s = (Date.now() - new Date(d).getTime()) / 1000; if (s < 0) return "in " + Math.abs(Math.round(s / 86400)) + "d"; if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + "m ago"; if (s < 86400) return Math.floor(s / 3600) + "h ago"; return Math.floor(s / 86400) + "d ago"; }
  const uid = (p) => p + "-" + Math.random().toString(36).slice(2, 8);

  /* ── Inline icons (lucide-style, stroke-based) ───────────────────────────── */
  const P = {
    send: "M22 2 11 13M22 2l-7 20-4-9-9-4z", mail: "M4 4h16v16H4zM22 6l-10 7L2 6",
    msg: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
    users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    tag: "M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01",
    list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    layout: "M3 3h18v18H3zM3 9h18M9 21V9", type: "M4 7V4h16v3M9 20h6M12 4v16",
    columns: "M3 3h18v18H3zM12 3v18", image: "M3 3h18v18H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M21 15l-5-5L5 21",
    button: "M3 8h18v8H3zM7 12h10", divider: "M3 12h18", social: "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6M8.6 13.5l6.8 4M15.4 6.5l-6.8 4",
    spacer: "M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4", code: "M16 18l6-6-6-6M8 6l-6 6 6 6",
    plus: "M12 5v14M5 12h14", check: "M20 6 9 17l-5-5", chev: "M6 9l6 6 6-6", chevR: "M9 6l6 6-6 6",
    trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14", copy: "M9 9h11v11H9zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
    back: "M19 12H5M12 19l-7-7 7-7", arrow: "M5 12h14M12 5l7 7-7 7", grip: "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01",
    clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2", calendar: "M3 5h18v16H3zM3 9h18M8 3v4M16 3v4",
    trend: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6", eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
    cursor: "M4 4l7 16 2.5-6.5L20 11z", slash: "M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10", alert: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
    settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
    search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35", shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20", key: "M21 2l-2 2m-7.6 7.6a5 5 0 1 0-7 7 5 5 0 0 0 7-7zm0 0L15 8l3 3 3-3-3-3", flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
    play: "M5 3l14 9-14 9z", pause: "M6 4h4v16H6zM14 4h4v16h-4z", x: "M18 6 6 18M6 6l12 12",
    sliders: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6", target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
    sparkles: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z", info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
    user: "M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", zap: "M13 2 4 14h6l-1 8 9-12h-6z", filter: "M22 3H2l8 9.5V19l4 2v-8.5z",
  };
  const svg = (n, s = 17) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[n] || P.info}"/></svg>`;

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

  /* ── Config + Supabase client (anon key only, Law 3) ─────────────────────── */
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

  /* ── Block catalog (email builder) — 9 block types per spec §1 ───────────── */
  const BLOCKS = {
    section: { label: "Section", ico: "layout", blurb: "A padded band with a background" },
    columns: { label: "Columns", ico: "columns", blurb: "Two side-by-side text columns" },
    text: { label: "Text", ico: "type", blurb: "A paragraph of copy" },
    image: { label: "Image", ico: "image", blurb: "An image (from M06 assets)" },
    button: { label: "Button", ico: "button", blurb: "A call-to-action button" },
    divider: { label: "Divider", ico: "divider", blurb: "A hairline separator" },
    social: { label: "Social", ico: "social", blurb: "Social profile links" },
    spacer: { label: "Spacer", ico: "spacer", blurb: "Vertical breathing room" },
    html: { label: "Raw HTML", ico: "code", blurb: "Paste your own HTML" },
  };
  const newBlock = (type) => {
    const d = { section: { bg: "#f6f4ef", pad: 20, text: "Section heading" }, columns: { left: "Left column copy goes here.", right: "Right column copy goes here." },
      text: { text: "Write your message here. Personalize with {{first_name}} and always keep the {{unsubscribe_link}}." },
      image: { alt: "Hero image", url: "" }, button: { label: "Book a call", url: "https://" }, divider: {},
      social: { networks: ["instagram", "facebook", "x"] }, spacer: { h: 24 }, html: { code: "<p>Custom HTML…</p>" } }[type] || {};
    return { id: uid("b"), type, cfg: clone(d) };
  };

  /* ── Mockup data (honest sample content; never a live code path) ─────────── */
  const MOCK = (() => {
    const now = Date.now();
    const stat = (sent, o, cl, u, b) => ({ sent, delivered: sent - b, opened: o, clicked: cl, unsubscribed: u, bounced: b });
    const welcomeBlocks = [
      { id: "b1", type: "section", cfg: { bg: "#0F2A2C", pad: 26, text: "As-salamu alaykum, {{first_name}} 👋" } },
      { id: "b2", type: "text", cfg: { text: "Thank you for joining Northstar. Over the next week we'll share the three ideas that most move the needle for growing brands." } },
      { id: "b3", type: "image", cfg: { alt: "Welcome banner", url: "" } },
      { id: "b4", type: "button", cfg: { label: "Explore your dashboard", url: "https://northstar.agency/app" } },
      { id: "b5", type: "divider", cfg: {} },
      { id: "b6", type: "social", cfg: { networks: ["instagram", "facebook", "x"] } },
    ];
    const campaigns = [
      { id: "c1", name: "Ramadan Kareem — annual greeting", channel: "email", status: "sent", subject: "Ramadan Mubarak from Northstar 🌙", subject_b: null, preheader: "A note of gratitude this holy month", audience: { type: "all", label: "All contacts" }, ab_enabled: false, from_identity_id: "id1", body_json: welcomeBlocks, sent_at: iso(-9), created_at: iso(-12), stats: stat(4820, 3110, 986, 14, 62) },
      { id: "c2", name: "Spring collection launch", channel: "email", status: "sending", subject: "The Spring edit is live ✨", subject_b: "New season, new essentials", audience: { type: "smartlist", label: "Engaged (30d)" }, ab_enabled: true, ab_sample_pct: 15, from_identity_id: "id1", body_json: welcomeBlocks, sent_at: iso(0), created_at: iso(-1), stats: stat(1240, 402, 118, 3, 9) },
      { id: "c3", name: "Weekend flash — 20% off", channel: "sms", status: "scheduled", subject: "Flash sale! 20% off everything this weekend only — reply STOP to opt out. {{unsubscribe_link}}", subject_b: null, audience: { type: "tag", label: "VIP" }, ab_enabled: false, from_identity_id: null, body_json: [], scheduled_at: iso(2), created_at: iso(-1), stats: stat(0, 0, 0, 0, 0) },
      { id: "c4", name: "Re-engagement — we miss you", channel: "email", status: "draft", subject: "It's been a while, {{first_name}}", subject_b: null, audience: { type: "smartlist", label: "Cold (90d)" }, ab_enabled: false, from_identity_id: "id2", body_json: welcomeBlocks, created_at: iso(-3), stats: stat(0, 0, 0, 0, 0) },
      { id: "c5", name: "Q1 newsletter", channel: "email", status: "paused", subject: "5 growth wins from our clients this quarter", subject_b: null, audience: { type: "all", label: "All contacts" }, ab_enabled: false, from_identity_id: "id1", body_json: welcomeBlocks, created_at: iso(-6), stats: stat(2200, 1400, 470, 8, 31) },
      { id: "c6", name: "Abandoned checkout nudge", channel: "email", status: "failed", subject: "You left something behind", subject_b: null, audience: { type: "tag", label: "Cart" }, ab_enabled: false, from_identity_id: "id1", body_json: welcomeBlocks, created_at: iso(-4), fail_reason: "Email quota exceeded — top up your wallet or upgrade the plan to resume.", stats: stat(0, 0, 0, 0, 0) },
    ];
    const sequences = [
      { id: "sq1", name: "7-Day Welcome Nurture", status: "active", enrolled_count: 342, exit_on: { unsub: true, replied: true, goal: false },
        steps: [
          { id: "s1", channel: "email", subject: "Welcome to Northstar 👋", delay: { mode: "relative", days: 0 }, sent: 342, opened: 251, clicked: 88 },
          { id: "s2", channel: "email", subject: "The one metric that matters", delay: { mode: "relative", days: 2 }, sent: 318, opened: 190, clicked: 61 },
          { id: "s3", channel: "sms", subject: "Quick q — what's your #1 goal this quarter? Reply anytime.", delay: { mode: "relative", days: 4 }, sent: 295, opened: 0, clicked: 40 },
          { id: "s4", channel: "email", subject: "Ready when you are", delay: { mode: "fixed", weekday: 2, time: "09:00" }, sent: 271, opened: 158, clicked: 72 },
        ] },
      { id: "sq2", name: "Won-deal onboarding", status: "active", enrolled_count: 84, exit_on: { unsub: true, replied: false, goal: true },
        steps: [
          { id: "s1", channel: "email", subject: "Welcome aboard — here's what happens next", delay: { mode: "relative", days: 0 }, sent: 84, opened: 71, clicked: 55 },
          { id: "s2", channel: "email", subject: "Your kickoff checklist", delay: { mode: "relative", days: 1 }, sent: 80, opened: 62, clicked: 44 },
        ] },
      { id: "sq3", name: "Re-engagement drip", status: "paused", enrolled_count: 0, exit_on: { unsub: true, replied: true, goal: false }, steps: [] },
    ];
    const suppressions = [
      { id: "u1", email: "bounced@example.com", reason: "bounce", source: "sendgrid", created_at: iso(-2) },
      { id: "u2", email: "no-thanks@client.co", reason: "unsub", source: "one-click", created_at: iso(-5) },
      { id: "u3", email: "spam-report@mail.io", reason: "complaint", source: "sendgrid", created_at: iso(-8) },
      { id: "u4", email: "old-address@legacy.net", reason: "manual", source: "import", created_at: iso(-20) },
      { id: "u5", email: "hard-bounce@typo.cmo", reason: "bounce", source: "sendgrid", created_at: iso(-1) },
    ];
    const identities = [
      { id: "id1", from_name: "Northstar Agency", from_email: "hello@northstar.agency", reply_to: "team@northstar.agency", domain: "northstar.agency", spf_ok: true, dkim_ok: true, verified: true, is_default: true },
      { id: "id2", from_name: "Aisha at Northstar", from_email: "aisha@northstar.agency", reply_to: "aisha@northstar.agency", domain: "northstar.agency", spf_ok: true, dkim_ok: true, verified: true, is_default: false },
      { id: "id3", from_name: "Northstar Events", from_email: "events@events.northstar.agency", reply_to: "events@events.northstar.agency", domain: "events.northstar.agency", spf_ok: false, dkim_ok: false, verified: false, is_default: false },
    ];
    const templates = [
      { id: "t1", name: "Welcome nurture", category: "onboarding" }, { id: "t2", name: "Product launch", category: "sales" },
      { id: "t3", name: "Newsletter", category: "engagement" }, { id: "t4", name: "Re-engagement", category: "retention" },
      { id: "t5", name: "Event invite", category: "events" }, { id: "t6", name: "Abandoned cart", category: "sales" },
      { id: "t7", name: "Seasonal greeting", category: "engagement" }, { id: "t8", name: "Review request", category: "reputation" },
      { id: "t9", name: "Receipt / thank-you", category: "transactional" }, { id: "t10", name: "Plain announcement", category: "engagement" },
    ];
    const smartLists = [{ id: "sl1", name: "Engaged (30d)", count: 1240 }, { id: "sl2", name: "Cold (90d)", count: 3180 }, { id: "sl3", name: "High LTV", count: 210 }];
    const tags = [{ id: "tg1", name: "VIP", count: 148 }, { id: "tg2", name: "Cart", count: 92 }, { id: "tg3", name: "Newsletter", count: 4210 }, { id: "tg4", name: "Trial", count: 560 }];
    return {
      user: { id: "you", email: "aisha@northstar.agency", name: "Aisha Rahman" },
      workspace: { id: "ws-agency", name: "Northstar Agency" },
      totalContacts: 5210, campaigns, sequences, suppressions, identities, templates, smartLists, tags,
    };
  })();

  /* ── App state ───────────────────────────────────────────────────────────── */
  const PREVIEW_STATES = ["default", "empty", "loading", "error", "success"];
  const state = {
    loaded: false, loading: false, error: null, previewState: "default",
    user: null, workspaceId: null, workspaceName: "", role: "owner",
    campaigns: [], sequences: [], suppressions: [], identities: [], templates: [], smartLists: [], tags: [], totalContacts: 0,
    route: { name: "list" },
    editor: null, wizardStep: 1, previewMode: "desktop", seq: null, supQuery: "",
  };
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
      state.campaigns = MOCK.campaigns.map(clone); state.sequences = MOCK.sequences.map(clone);
      state.suppressions = MOCK.suppressions.map(clone); state.identities = MOCK.identities.map(clone);
      state.templates = MOCK.templates.map(clone); state.smartLists = MOCK.smartLists.map(clone); state.tags = MOCK.tags.map(clone);
      state.totalContacts = MOCK.totalContacts;
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
  async function loadData(wsId) {
    const c = ensureClient();
    const [{ data: camps }, { data: cstats }, { data: seqs }, { data: sups }, { data: ids }, { data: tpls }] = await Promise.all([
      c.from("email_campaigns").select("*").eq("workspace_id", wsId).order("created_at", { ascending: false }),
      c.from("campaign_stats").select("*").eq("workspace_id", wsId),
      c.from("sequences").select("*, sequence_steps(*)").eq("workspace_id", wsId).order("created_at", { ascending: false }),
      c.from("suppressions").select("*").eq("workspace_id", wsId).order("created_at", { ascending: false }).limit(500),
      c.from("sender_identities").select("*").eq("workspace_id", wsId).order("created_at"),
      c.from("email_templates").select("*").or("workspace_id.is.null,workspace_id.eq." + wsId).order("name"),
    ]);
    const statById = Object.fromEntries((cstats || []).map((s) => [s.campaign_id, s]));
    state.campaigns = (camps || []).map((r) => ({ ...r, stats: statById[r.id] || { sent: 0, delivered: 0, opened: 0, clicked: 0, unsubscribed: 0, bounced: 0 } }));
    state.sequences = (seqs || []).map((s) => ({ ...s, steps: (s.sequence_steps || []).sort((a, b) => a.step_order - b.step_order) }));
    state.suppressions = sups || [];
    state.identities = ids || [];
    state.templates = tpls || [];
    // audience picker sources (RLS-scoped)
    const [{ data: sl }, { data: tg }, { count: contacts }] = await Promise.all([
      c.from("smart_lists").select("id,name").limit(100),
      c.from("contact_tags").select("tag").limit(200),
      c.from("contacts").select("id", { count: "exact", head: true }).is("deleted_at", null),
    ]);
    state.smartLists = (sl || []).map((x) => ({ id: x.id, name: x.name, count: null }));
    const tagCounts = {}; (tg || []).forEach((r) => { tagCounts[r.tag] = (tagCounts[r.tag] || 0) + 1; });
    state.tags = Object.entries(tagCounts).map(([name, count]) => ({ id: name, name, count }));
    state.totalContacts = contacts || 0;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Router
     ══════════════════════════════════════════════════════════════════════════ */
  function parseRoute() {
    const h = (location.hash || "#/campaigns").replace(/^#/, "");
    const parts = h.split("/").filter(Boolean);
    if (parts[0] === "campaigns" && parts[1] === "new") { state.route = { name: "wizard", id: null }; openEditor(null); return; }
    if (parts[0] === "campaigns" && parts[1]) { state.route = { name: "wizard", id: parts[1] }; openEditor(parts[1]); return; }
    if (parts[0] === "sequences" && parts[1]) { state.route = { name: "sequence", id: parts[1] }; openSequence(parts[1]); return; }
    if (parts[0] === "settings" && parts[1] === "sending") { state.route = { name: "sending" }; return; }
    state.route = { name: "list" };
  }
  window.addEventListener("hashchange", () => { parseRoute(); render(); });

  /* ══════════════════════════════════════════════════════════════════════════
     Shell (rail + topbar)
     ══════════════════════════════════════════════════════════════════════════ */
  const NAV = [
    { key: "list", label: "Campaigns", ico: "send", hash: "#/campaigns" },
    { key: "sequence", label: "Sequences", ico: "zap", hash: "#/sequences/sq1" },
    { key: "sending", label: "Sending settings", ico: "settings", hash: "#/settings/sending" },
  ];
  function shell(activeKey, content, opts = {}) {
    const nav = NAV.map((n) => `<div class="nav-item ${n.key === activeKey ? "active" : ""}" data-hash="${n.hash}"><span class="ni-ico">${svg(n.ico)}</span><span>${n.label}</span></div>`).join("");
    return `
      <aside class="rail" id="rail">
        <div class="brand"><span class="mark">✦</span><span><b>AiMind</b><em>Share</em></span></div>
        <div class="nav-group"><div class="nav-group-label">Acquisition</div>${nav}</div>
        <div class="rail-foot">M16 · Campaigns</div>
      </aside>
      <header class="tbar">
        <button class="icon-btn rail-burger" id="railBurger" aria-label="Menu">☰</button>
        <div class="ws-trigger" style="cursor:default">
          <span class="ws-badge">${esc(initials(state.workspaceName || "AiMindShare"))}</span>
          <span class="ws-meta"><span class="ws-name">${esc(state.workspaceName || "Workspace")}</span><span class="ws-kind">Campaigns</span></span>
        </div>
        <div class="tb-search"><span>${svg("search", 15)}</span><span class="tbs-label">Search…</span><span class="kbd">⌘K</span></div>
        <div class="spacer"></div>
        <span class="pill plain" id="connPill" hidden></span>
        <button class="btn btn-ghost btn-sm" id="openConnect2">Connect</button>
        <button class="icon-btn" id="themeToggle" title="Toggle theme" aria-label="Toggle theme"><span id="themeIco">☾</span></button>
        <span class="avatar" title="${esc(state.user?.email || "")}">${esc(initials(state.user?.name || state.user?.email))}</span>
      </header>
      <main class="content"><div class="content-inner">${content}</div></main>`;
  }
  function previewStrip() {
    return "";
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Shared status pill + KPI helpers
     ══════════════════════════════════════════════════════════════════════════ */
  const stPill = (s) => `<span class="st st-${s}">${esc(String(s).replace(/_/g, " "))}</span>`;
  const typePill = (ch) => `<span class="type-pill type-${ch}">${svg(ch === "sms" ? "msg" : "mail", 12)}${ch === "sms" ? "SMS" : "Email"}</span>`;
  const audLabel = (a) => a?.label || ({ all: "All contacts", tag: "Tag", smartlist: "Smart list" }[a?.type] || "Audience");

  /* ══════════════════════════════════════════════════════════════════════════
     View: Campaign list (#/campaigns)
     ══════════════════════════════════════════════════════════════════════════ */
  function viewList() {
    if (st("loading")) return shell("list", loadingBlock());
    if (st("error")) return shell("list", errorBlock());
    const rows = st("empty") ? [] : state.campaigns;
    const head = `<div class="pg-head">
      <div><div class="eyebrow">${svg("send", 13)} Acquisition</div>
        <div class="pg-title">Campaigns</div><div class="pg-sub">Broadcasts, drips and A/B tests across email &amp; SMS for ${esc(state.workspaceName)}.</div></div>
      <div class="spacer"></div>
      ${canWrite() ? `<button class="btn btn-primary" id="newCampaign">${svg("plus", 15)} New campaign</button>` : ""}
    </div>`;
    // aggregate KPIs across sent-ish campaigns
    const agg = rows.reduce((a, c) => { const s = c.stats || {}; a.sent += s.sent || 0; a.delivered += s.delivered || 0; a.opened += s.opened || 0; a.clicked += s.clicked || 0; a.unsub += s.unsubscribed || 0; return a; }, { sent: 0, delivered: 0, opened: 0, clicked: 0, unsub: 0 });
    const kpis = `<div class="kpi-strip">
      ${kpiCard("send", fmtInt(agg.sent), "Sent", "messages delivered to send")}
      ${kpiCard("eye", fmtPct(agg.opened, agg.delivered), "Open rate", fmtInt(agg.opened) + " opens")}
      ${kpiCard("cursor", fmtPct(agg.clicked, agg.delivered), "Click rate", fmtInt(agg.clicked) + " clicks")}
      ${kpiCard("slash", fmtPct(agg.unsub, agg.delivered), "Unsub rate", fmtInt(agg.unsub) + " opted out")}
    </div>`;
    if (!rows.length) return shell("list", previewStrip() + head + emptyBlock("send", "No campaigns yet", "Launch your first broadcast — pick an audience, design a block email or SMS, review the checklist, then schedule or send now.", "newCampaign2", "New campaign"));
    const list = rows.map(campaignRow).join("");
    return shell("list", previewStrip() + head + kpis + `<div class="panel" style="padding:6px 12px"><div class="camp-list">${list}</div></div>`);
  }
  function kpiCard(ico, val, label, sub) {
    return `<div class="kpi"><div class="kpi-ico">${svg(ico)}</div>
      <div class="kpi-val mono">${val}</div><div class="kpi-label">${label}</div><div class="kpi-delta">${esc(sub)}</div></div>`;
  }
  function campaignRow(c) {
    const s = c.stats || {};
    const when = c.status === "sent" ? "Sent " + timeAgo(c.sent_at) : c.status === "scheduled" ? "Scheduled " + fmtDateTime(c.scheduled_at) : "Edited " + timeAgo(c.created_at);
    const mini = ["sent", "sending", "paused"].includes(c.status)
      ? `<span class="mini"><b class="mono">${fmtPct(s.opened, s.delivered)}</b> open</span><span class="mini"><b class="mono">${fmtPct(s.clicked, s.delivered)}</b> click</span><span class="mini"><b class="mono">${fmtInt(s.sent)}</b> sent</span>`
      : `<span class="mini muted">${c.status === "failed" ? esc(c.fail_reason || "Send failed") : "Not sent yet"}</span>`;
    return `<div class="camp-row data-row" data-open="${esc(c.id)}">
      <div class="r-body">
        <div class="cr-top"><span class="r-title">${esc(c.name)}</span>${typePill(c.channel)}${stPill(c.status)}${c.ab_enabled ? `<span class="ab-chip">A/B</span>` : ""}</div>
        <div class="r-meta"><span>${svg(c.audience?.type === "all" ? "users" : c.audience?.type === "tag" ? "tag" : "list", 12)} ${esc(audLabel(c.audience))}</span><span>·</span><span>${esc(when)}</span></div>
      </div>
      <div class="cr-stats">${mini}</div>
      <div class="r-right">${svg("chevR", 16)}</div>
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     View: Builder wizard (#/campaigns/new · #/campaigns/:id)
     5 steps: Audience · Content · A/B · Review · Schedule
     ══════════════════════════════════════════════════════════════════════════ */
  const WIZARD_STEPS = [
    { k: 1, label: "Audience", ico: "users" }, { k: 2, label: "Content", ico: "layout" },
    { k: 3, label: "A/B test", ico: "sliders" }, { k: 4, label: "Review", ico: "check" }, { k: 5, label: "Schedule", ico: "calendar" },
  ];
  function openEditor(id) {
    let base;
    if (id) { const found = state.campaigns.find((c) => c.id === id); base = found ? clone(found) : null; }
    // SMS campaigns store their copy in `subject` (data model); seed the composer field.
    if (base && base.channel === "sms" && !base.sms_body) base.sms_body = base.subject || "";
    if (!base) base = {
      id: null, name: "Untitled campaign", channel: "email", status: "draft",
      subject: "", subject_b: null, preheader: "", audience: { type: "all", label: "All contacts" },
      ab_enabled: false, ab_sample_pct: 10, from_identity_id: (state.identities.find((i) => i.is_default)?.id) || (state.identities[0]?.id) || null,
      body_json: [newBlock("text")], sms_body: "", throttle_per_min: 200, footer_address: "Northstar Agency · 500 Market St, San Francisco, CA",
      schedule_mode: "now", scheduled_at: iso(1),
    };
    // Wizard-only fields (not persisted columns) — default when opening an existing row.
    if (base.schedule_mode == null) base.schedule_mode = base.scheduled_at ? "later" : "now";
    if (base.scheduled_at == null) base.scheduled_at = iso(1);
    if (base.throttle_per_min == null) base.throttle_per_min = 200;
    if (base.body_json == null) base.body_json = [newBlock("text")];
    if (base.ab_sample_pct == null) base.ab_sample_pct = 10;
    if (base.footer_address == null) base.footer_address = "";
    state.editor = base; state.wizardStep = 1; state.previewMode = "desktop";
  }
  function viewWizard() {
    const e = state.editor;
    if (!e) { location.hash = "#/campaigns"; return shell("list", ""); }
    const steps = WIZARD_STEPS.map((s) => `<button class="wz-step ${state.wizardStep === s.k ? "on" : ""} ${state.wizardStep > s.k ? "done" : ""}" data-step="${s.k}">
      <span class="wz-num">${state.wizardStep > s.k ? svg("check", 12) : s.k}</span><span class="wz-lbl">${s.label}</span></button>`).join(`<span class="wz-sep"></span>`);
    const head = `<div class="pg-head">
      <button class="btn btn-ghost btn-sm" data-hash="#/campaigns">${svg("back", 15)} Back</button>
      <div><div class="eyebrow">${svg("send", 13)} ${e.id ? "Edit campaign" : "New campaign"}</div>
        <input class="wz-name" id="campName" value="${esc(e.name)}" spellcheck="false" ${canWrite() ? "" : "disabled"}></div>
      <div class="spacer"></div>${typePill(e.channel)}${e.id ? stPill(e.status) : ""}</div>`;
    const body = { 1: stepAudience, 2: stepContent, 3: stepAB, 4: stepReview, 5: stepSchedule }[state.wizardStep](e);
    const nav = `<div class="wz-nav">
      ${state.wizardStep > 1 ? `<button class="btn btn-ghost" id="wzPrev">${svg("back", 15)} Previous</button>` : "<span></span>"}
      <div style="display:flex;gap:10px">
        <button class="btn btn-ghost" id="wzSave">${svg("check", 15)} Save draft</button>
        ${state.wizardStep < 5 ? `<button class="btn btn-primary" id="wzNext">Continue ${svg("arrow", 15)}</button>`
          : `<button class="btn btn-primary" id="wzSend">${svg("send", 15)} ${e.schedule_mode === "now" ? "Send now" : "Schedule send"}</button>`}
      </div></div>`;
    return shell(state.route.name, head + `<div class="wz-rail">${steps}</div>` + `<div class="wz-body">${body}</div>` + nav);
  }

  /* Step 1 · Audience */
  function stepAudience(e) {
    const count = audienceCount(e);
    const pick = (type, ico, label, sub, active) => `<button class="aud-opt ${active ? "on" : ""}" data-aud="${type}">
      <span class="aud-ico">${svg(ico, 18)}</span><span class="aud-txt"><b>${label}</b><small>${esc(sub)}</small></span>
      <span class="aud-check">${active ? svg("check", 14) : ""}</span></button>`;
    let refPicker = "";
    if (e.audience.type === "tag") refPicker = `<div class="form-field full"><label>Tag</label><select id="audRef">${state.tags.map((t) => `<option value="${esc(t.name)}" ${e.audience.label === t.name ? "selected" : ""}>${esc(t.name)} · ${fmtInt(t.count)} contacts</option>`).join("")}</select></div>`;
    if (e.audience.type === "smartlist") refPicker = `<div class="form-field full"><label>Smart list</label><select id="audRef">${state.smartLists.map((l) => `<option value="${esc(l.name)}" ${e.audience.label === l.name ? "selected" : ""}>${esc(l.name)}${l.count != null ? " · " + fmtInt(l.count) + " contacts" : ""}</option>`).join("")}</select></div>`;
    return `<div class="wz-grid">
      <div class="panel" style="padding:22px">
        <div class="panel-head"><b>Who receives this?</b></div>
        <div class="aud-opts">
          ${pick("all", "users", "All contacts", "Everyone who hasn't opted out", e.audience.type === "all")}
          ${pick("tag", "tag", "A tag", "Contacts carrying a specific tag", e.audience.type === "tag")}
          ${pick("smartlist", "list", "A smart list", "A saved AND/OR audience from CRM", e.audience.type === "smartlist")}
        </div>
        <div class="form-grid" style="margin-top:16px">${refPicker}</div>
        <div class="channel-pick">
          <label>Channel</label>
          <div class="seg" id="chSeg"><button data-ch="email" class="${e.channel === "email" ? "on" : ""}">${svg("mail", 14)} Email</button><button data-ch="sms" class="${e.channel === "sms" ? "on" : ""}">${svg("msg", 14)} SMS</button></div>
        </div>
      </div>
      <div class="panel aud-count-card" style="padding:22px">
        <div class="acc-eyebrow">Eligible recipients</div>
        <div class="acc-count mono">${fmtInt(count.eligible)}</div>
        <div class="acc-break">
          <div class="acc-line"><span>${svg("users", 13)} In audience</span><span class="mono">${fmtInt(count.base)}</span></div>
          <div class="acc-line sub"><span>${svg("slash", 13)} Suppressed</span><span class="mono">−${fmtInt(count.suppressed)}</span></div>
          <div class="acc-line sub"><span>${svg("shield", 13)} Opted out (M05)</span><span class="mono">−${fmtInt(count.optedOut)}</span></div>
        </div>
        <div class="acc-note">${svg("info", 12)} The live count runs <span class="mono">resolve_campaign_audience</span> then subtracts the suppression list and consent opt-outs, so this equals exactly who will be sent.</div>
      </div>
    </div>`;
  }
  function audienceCount(e) {
    // Mock heuristic; live path uses supabase.rpc('resolve_campaign_audience', {...}) then counts.
    let base = state.totalContacts;
    if (e.audience.type === "tag") base = (state.tags.find((t) => t.name === e.audience.label)?.count) || 148;
    else if (e.audience.type === "smartlist") base = (state.smartLists.find((l) => l.name === e.audience.label)?.count) || 1240;
    const suppressed = Math.min(state.suppressions.length || 5, Math.round(base * 0.012) + 5);
    const optedOut = Math.round(base * 0.02);
    return { base, suppressed, optedOut, eligible: Math.max(0, base - suppressed - optedOut) };
  }

  /* Step 2 · Content — block email editor OR SMS composer */
  function stepContent(e) {
    if (e.channel === "sms") return stepSMS(e);
    const palette = Object.keys(BLOCKS).map((k) => `<button class="pal-block" data-addblock="${k}" title="${esc(BLOCKS[k].blurb)}">
      <span class="pal-ico">${svg(BLOCKS[k].ico, 15)}</span><span>${BLOCKS[k].label}</span></button>`).join("");
    const blocks = (e.body_json || []).map((b, i) => blockRow(b, i)).join("");
    const preview = compileEmail(e);
    return `<div class="build-grid">
      <aside class="build-palette panel">
        <div class="bp-head">Blocks</div>
        <div class="bp-list">${palette}</div>
        <div class="bp-tip">${svg("grip", 12)} Drag to reorder. Click a block to configure it. Best on desktop.</div>
      </aside>
      <div class="build-canvas panel">
        <div class="bc-head"><b>${esc(e.name)}</b><span class="bc-sub">${(e.body_json || []).length} block${(e.body_json || []).length === 1 ? "" : "s"}</span></div>
        <div class="subject-fields">
          <div class="form-field full"><label>Subject line</label><input id="subjA" value="${esc(e.subject)}" placeholder="Your subject…"></div>
          <div class="form-field full"><label>Preheader</label><input id="preheader" value="${esc(e.preheader || "")}" placeholder="Preview text after the subject"></div>
        </div>
        <div class="blocks-col" id="blocksCol">${blocks || `<div class="bc-empty">${svg("layout", 26)}<p>Add a block from the left to start building.</p></div>`}</div>
      </div>
      <div class="build-preview">
        <div class="pv-toolbar">
          <span class="pv-label">Preview</span>
          <div class="seg pv-seg" id="pvSeg"><button data-pv="desktop" class="${state.previewMode === "desktop" ? "on" : ""}">${svg("eye", 13)} Desktop</button><button data-pv="mobile" class="${state.previewMode === "mobile" ? "on" : ""}">${svg("msg", 13)} Mobile</button></div>
        </div>
        <div class="pv-frame pv-${state.previewMode}"><div class="pv-doc">${preview}</div></div>
      </div>
    </div>`;
  }
  function blockRow(b, i) {
    const m = BLOCKS[b.type] || BLOCKS.text;
    return `<div class="blk" data-blk="${b.id}" data-idx="${i}">
      <div class="blk-head"><span class="blk-grip" title="Drag to reorder">${svg("grip", 14)}</span>
        <span class="blk-ico">${svg(m.ico, 14)}</span><span class="blk-name">${m.label}</span>
        <span class="blk-sum">${esc(blockSummary(b))}</span>
        <button class="blk-del" data-delblk="${b.id}" title="Remove">${svg("trash", 13)}</button></div>
      <div class="blk-cfg">${blockFields(b)}</div>
    </div>`;
  }
  function blockSummary(b) {
    const c = b.cfg || {};
    switch (b.type) {
      case "text": return (c.text || "").slice(0, 40) + ((c.text || "").length > 40 ? "…" : "");
      case "button": return `“${c.label || ""}”`;
      case "image": return c.url ? "image set" : "no image";
      case "section": return (c.text || "").slice(0, 30);
      case "spacer": return (c.h || 0) + "px";
      case "social": return (c.networks || []).join(" · ");
      case "html": return "custom HTML";
      case "divider": return "hairline";
      case "columns": return "2 columns";
      default: return "";
    }
  }
  function blockFields(b) {
    const c = b.cfg || {};
    const f = (k, label, val, type = "text", ph = "") => `<label class="blk-f"><span>${label}</span><input data-blkf="${k}" type="${type}" value="${esc(val ?? "")}" placeholder="${esc(ph)}"></label>`;
    const ta = (k, label, val) => `<label class="blk-f full"><span>${label}</span><textarea data-blkf="${k}" rows="2">${esc(val ?? "")}</textarea></label>`;
    switch (b.type) {
      case "text": return ta("text", "Copy", c.text);
      case "section": return f("bg", "Background", c.bg, "text", "#f6f4ef") + f("pad", "Padding (px)", c.pad, "number") + ta("text", "Heading / copy", c.text);
      case "columns": return ta("left", "Left column", c.left) + ta("right", "Right column", c.right);
      case "image": return f("url", "Image URL", c.url, "text", "https://…") + f("alt", "Alt text", c.alt);
      case "button": return f("label", "Label", c.label) + f("url", "Link URL", c.url, "text", "https://…");
      case "spacer": return f("h", "Height (px)", c.h, "number");
      case "social": return f("networks", "Networks (comma-sep)", (c.networks || []).join(","), "text", "instagram,facebook,x");
      case "html": return ta("code", "HTML", c.code);
      case "divider": return `<p class="muted" style="font-size:12px;margin:0">A hairline separator. No settings.</p>`;
      default: return "";
    }
  }
  /* Block-JSON → responsive inline-CSS HTML (direct compile; MJML deferred, D-087) */
  function compileEmail(e) {
    const inline = "font-family:'Baskerville',Georgia,serif;color:#0F2A2C;";
    const render = (b) => {
      const c = b.cfg || {};
      switch (b.type) {
        case "section": return `<div style="background:${esc(c.bg || "#f6f4ef")};padding:${(+c.pad || 20)}px 22px;border-radius:12px;margin:0 0 14px"><div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;${inline}">${personalize(c.text || "")}</div></div>`;
        case "text": return `<p style="font-size:15px;line-height:1.65;margin:0 0 16px;${inline}">${personalize(c.text || "")}</p>`;
        case "columns": return `<table width="100%" style="margin:0 0 16px"><tr><td width="50%" style="padding-right:8px;vertical-align:top;font-size:14px;line-height:1.6;${inline}">${personalize(c.left || "")}</td><td width="50%" style="padding-left:8px;vertical-align:top;font-size:14px;line-height:1.6;${inline}">${personalize(c.right || "")}</td></tr></table>`;
        case "image": return c.url ? `<img src="${esc(c.url)}" alt="${esc(c.alt || "")}" style="width:100%;border-radius:12px;margin:0 0 16px;display:block">` : `<div style="width:100%;aspect-ratio:16/7;background:#e7efef;border:1px dashed #b7c9c9;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#6d8080;font-size:13px;margin:0 0 16px">${esc(c.alt || "Image")}</div>`;
        case "button": return `<div style="text-align:center;margin:6px 0 18px"><a href="${esc(c.url || "#")}" style="display:inline-block;background:#00696E;color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-size:15px;font-family:'Baskerville',Georgia,serif">${esc(c.label || "Button")}</a></div>`;
        case "divider": return `<hr style="border:none;border-top:1px solid #e2ecec;margin:18px 0">`;
        case "social": return `<div style="text-align:center;margin:6px 0 14px;color:#00696E;font-size:13px;letter-spacing:.04em">${(c.networks || []).map((n) => esc(n)).join(" &nbsp;·&nbsp; ")}</div>`;
        case "spacer": return `<div style="height:${(+c.h || 24)}px"></div>`;
        case "html": return `<div>${c.code || ""}</div>`;
        default: return "";
      }
    };
    const footer = `<div style="margin-top:22px;padding-top:16px;border-top:1px solid #e2ecec;font-size:11px;color:#6d8080;text-align:center;font-family:'Baskerville',Georgia,serif">
      ${esc(e.footer_address || "")}<br><a href="#" style="color:#6d8080">Unsubscribe</a> · You received this because you opted in.</div>`;
    return `<div style="max-width:600px;margin:0 auto;padding:8px">${(e.body_json || []).map(render).join("")}${footer}</div>`;
  }
  function personalize(s) {
    return esc(s).replace(/\{\{\s*([a-z_.]+)\s*\}\}/gi, (m, k) => `<span style="background:rgba(0,105,110,.08);color:#00696E;border-radius:4px;padding:0 3px">${k === "unsubscribe_link" ? "unsubscribe" : k === "first_name" ? "Aisha" : k}</span>`);
  }

  /* Step 2 (SMS variant) — 160-char segment counter */
  function stepSMS(e) {
    const body = e.sms_body || "";
    const len = body.length;
    const seg = len === 0 ? 0 : Math.ceil(len / 160);
    return `<div class="wz-grid">
      <div class="panel" style="padding:22px">
        <div class="panel-head"><b>SMS message</b></div>
        <div class="form-field full"><label>Message</label>
          <textarea id="smsBody" rows="5" placeholder="Your SMS… keep {{unsubscribe_link}} or a STOP note for compliance.">${esc(body)}</textarea></div>
        <div class="sms-meter">
          <div class="sms-bar"><span style="width:${clamp((len % 160) / 160 * 100 || (len ? 100 : 0), 0, 100)}%"></span></div>
          <div class="sms-stats"><span class="mono">${len}</span> chars · <span class="mono">${seg}</span> segment${seg === 1 ? "" : "s"} · <span class="mono">${160 - (len % 160 || (len ? 160 : 0))}</span> left in segment</div>
        </div>
        <div class="banner" style="margin-top:16px"><span class="b-ico">${svg("shield", 15)}</span><div>SMS sends run on the M12 Twilio contract — consent-gated (M05), A2P-checked, quiet-hours honored, and metered as <span class="mono">sms</span>. Replies land in the M12 inbox.</div></div>
      </div>
      <div class="panel sms-preview-card" style="padding:22px">
        <div class="acc-eyebrow">Preview</div>
        <div class="sms-phone"><div class="sms-bubble">${personalize(body) || "<span style='opacity:.5'>Your message appears here…</span>"}</div></div>
      </div>
    </div>`;
  }

  /* Step 3 · A/B */
  function stepAB(e) {
    return `<div class="wz-grid">
      <div class="panel" style="padding:22px">
        <div class="ab-toggle-row">
          <div><b>A/B subject test</b><div class="muted" style="font-size:12.5px">Send two subjects to a small sample; the winner (by opens after 4h) is auto-sent to the rest.</div></div>
          <label class="switch"><input type="checkbox" id="abToggle" ${e.ab_enabled ? "checked" : ""}><span class="switch-track"></span></label>
        </div>
        <div class="ab-fields ${e.ab_enabled ? "" : "disabled"}">
          <div class="form-field full"><label>Subject A</label><input id="abA" value="${esc(e.subject)}" placeholder="First subject…" ${e.ab_enabled ? "" : "disabled"}></div>
          <div class="form-field full"><label>Subject B</label><input id="abB" value="${esc(e.subject_b || "")}" placeholder="Second subject…" ${e.ab_enabled ? "" : "disabled"}></div>
          <div class="form-field full"><label>Sample size — <span class="mono" id="abPctLbl">${e.ab_sample_pct}%</span> per variant</label>
            <input id="abSlider" type="range" min="5" max="25" step="5" value="${e.ab_sample_pct}" ${e.ab_enabled ? "" : "disabled"}></div>
        </div>
      </div>
      <div class="panel ab-viz-card" style="padding:22px">
        <div class="acc-eyebrow">How it works</div>
        <div class="ab-split">
          <div class="ab-slice ab-a"><span class="mono">${e.ab_sample_pct}%</span><small>Subject A</small></div>
          <div class="ab-slice ab-b"><span class="mono">${e.ab_sample_pct}%</span><small>Subject B</small></div>
          <div class="ab-slice ab-rest"><span class="mono">${100 - e.ab_sample_pct * 2}%</span><small>Winner</small></div>
        </div>
        <div class="acc-note">${svg("clock", 12)} After 4 hours, <span class="mono">campaign.ab_winner</span> compares sample opens and sends the remainder with the winning subject.</div>
      </div>
    </div>`;
  }

  /* Step 4 · Review checklist */
  function stepReview(e) {
    const count = audienceCount(e);
    const ident = state.identities.find((i) => i.id === e.from_identity_id);
    const bodyText = JSON.stringify(e.body_json || []) + (e.sms_body || "") + (e.subject || "");
    const hasUnsub = e.channel === "sms" ? /unsubscribe_link|stop/i.test(e.sms_body || "") : /unsubscribe_link/i.test(bodyText) || true; // email footer always injects it
    const spam = spamScore(e);
    const checks = [
      { ok: count.eligible > 0, label: "Audience resolved", detail: `${fmtInt(count.eligible)} eligible recipient${count.eligible === 1 ? "" : "s"} (after suppressions & opt-outs)` },
      { ok: !!hasUnsub, label: "Unsubscribe link present", detail: e.channel === "sms" ? "STOP / opt-out required for SMS" : "Injected into the email footer + List-Unsubscribe header (RFC 8058)" },
      { ok: spam.score < 5, label: "Spam score", detail: `${spam.score.toFixed(1)} / 10 — ${spam.score < 5 ? "looks good" : "review flagged words"}${spam.flags.length ? " · " + spam.flags.join(", ") : ""}`, warn: spam.score >= 3 && spam.score < 5 },
      { ok: e.channel === "sms" ? true : !!ident && ident.verified, label: "From identity", detail: e.channel === "sms" ? "Sent from your Twilio number (M12)" : ident ? `${ident.from_name} <${ident.from_email}>${ident.verified ? "" : " — not verified"}` : "No sender identity selected" },
    ];
    const rows = checks.map((c) => `<div class="chk ${c.ok ? (c.warn ? "warn" : "ok") : "bad"}">
      <span class="chk-ico">${svg(c.ok ? "check" : "alert", 15)}</span>
      <div><div class="chk-label">${esc(c.label)}</div><div class="chk-detail">${esc(c.detail)}</div></div></div>`).join("");
    const identOpts = state.identities.map((i) => `<option value="${i.id}" ${e.from_identity_id === i.id ? "selected" : ""}>${esc(i.from_name)} · ${esc(i.from_email)}${i.verified ? "" : " (unverified)"}</option>`).join("");
    return `<div class="wz-grid">
      <div class="panel" style="padding:22px">
        <div class="panel-head"><b>Pre-send checklist</b></div>
        <div class="chk-list">${rows}</div>
        <div class="banner" style="margin-top:8px"><span class="b-ico">${svg("sparkles", 15)}</span><div>The spam score is a client-side heuristic today; the SpamAssassin/provider API is a ready-not-run hook (D-092).</div></div>
      </div>
      <div class="panel" style="padding:22px">
        <div class="panel-head"><b>From identity</b></div>
        ${e.channel === "sms" ? `<p class="muted" style="font-size:13px">SMS is sent from your connected Twilio number via M12 — no from-identity needed.</p>`
          : `<div class="form-field full"><label>Send as</label><select id="fromIdent">${identOpts || `<option>No identities — add one in Sending settings</option>`}</select></div>
             <a class="link-row" data-hash="#/settings/sending">${svg("settings", 13)} Manage sender identities & domains</a>`}
        <button class="btn btn-ghost btn-sm" id="testSend" style="margin-top:14px">${svg("send", 14)} Send a test to myself</button>
      </div>
    </div>`;
  }
  function spamScore(e) {
    const text = (e.subject + " " + (e.subject_b || "") + " " + (e.sms_body || "") + " " + JSON.stringify(e.body_json || [])).toLowerCase();
    const flags = [];
    let score = 0.4;
    if (/free|winner|100%|act now|urgent|guarantee/.test(text)) { score += 2.1; flags.push("urgency words"); }
    if (/\$\$\$|!!!/.test(text)) { score += 1.4; flags.push("excess punctuation"); }
    if (/[A-Z]{6,}/.test(e.subject)) { score += 1.2; flags.push("all-caps"); }
    if ((e.subject || "").length > 90) { score += 0.8; flags.push("long subject"); }
    return { score: Math.min(10, score), flags };
  }

  /* Step 5 · Schedule */
  function stepSchedule(e) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    return `<div class="wz-grid">
      <div class="panel" style="padding:22px">
        <div class="panel-head"><b>When should this go out?</b></div>
        <div class="sched-opts">
          <button class="sched-opt ${e.schedule_mode === "now" ? "on" : ""}" data-sched="now"><span class="aud-ico">${svg("send", 18)}</span><span class="aud-txt"><b>Send now</b><small>Enqueue the fan-out immediately</small></span><span class="aud-check">${e.schedule_mode === "now" ? svg("check", 14) : ""}</span></button>
          <button class="sched-opt ${e.schedule_mode === "later" ? "on" : ""}" data-sched="later"><span class="aud-ico">${svg("clock", 18)}</span><span class="aud-txt"><b>Schedule</b><small>Pick a date &amp; time</small></span><span class="aud-check">${e.schedule_mode === "later" ? svg("check", 14) : ""}</span></button>
        </div>
        ${e.schedule_mode === "later" ? `<div class="form-grid" style="margin-top:16px">
          <div class="form-field"><label>Date &amp; time</label><input id="schedAt" type="datetime-local" value="${(e.scheduled_at || iso(1)).slice(0, 16)}"></div>
          <div class="form-field"><label>Timezone</label><input id="schedTz" value="${esc(tz)}" disabled></div>
        </div>` : ""}
        <div class="form-field full" style="margin-top:16px"><label>Send rate — throttle (per minute)</label>
          <input id="throttle" type="number" value="${e.throttle_per_min || 200}" min="10" max="5000">
          <span class="hint">Batches are staggered by this rate so one bad recipient never blocks the send.</span></div>
      </div>
      <div class="panel" style="padding:22px">
        <div class="acc-eyebrow">Ready to launch</div>
        <div class="launch-sum">
          <div class="ls-line"><span>Audience</span><b>${esc(audLabel(e.audience))} · ${fmtInt(audienceCount(e).eligible)}</b></div>
          <div class="ls-line"><span>Channel</span><b>${e.channel === "sms" ? "SMS" : "Email"}</b></div>
          <div class="ls-line"><span>A/B test</span><b>${e.ab_enabled ? "On · " + e.ab_sample_pct + "% each" : "Off"}</b></div>
          <div class="ls-line"><span>When</span><b>${e.schedule_mode === "now" ? "Immediately" : fmtDateTime(e.scheduled_at)}</b></div>
        </div>
        <div class="acc-note">${svg("info", 12)} "Send" enqueues <span class="mono">campaign.send</span> which resolves the audience, gates on <span class="mono">meter_check</span>, then fans out throttled <span class="mono">${e.channel === "sms" ? "sms" : "email"}.deliver</span> jobs.</div>
      </div>
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     View: Sequence timeline editor (#/sequences/:id)
     ══════════════════════════════════════════════════════════════════════════ */
  function openSequence(id) {
    const found = state.sequences.find((s) => s.id === id);
    state.seq = found ? clone(found) : (state.sequences[0] ? clone(state.sequences[0]) : null);
  }
  function viewSequence() {
    if (st("loading")) return shell("sequence", loadingBlock());
    if (st("error")) return shell("sequence", errorBlock());
    const q = st("empty") ? null : state.seq;
    const head = `<div class="pg-head">
      <button class="btn btn-ghost btn-sm" data-hash="#/campaigns">${svg("back", 15)} Campaigns</button>
      <div><div class="eyebrow">${svg("zap", 13)} Drip sequence</div>
        <div class="pg-title">${esc(q?.name || "Sequences")}</div></div>
      <div class="spacer"></div>
      ${q ? `<span class="st st-${q.status}">${esc(q.status)}</span>` : ""}
    </div>`;
    if (!q) return shell("sequence", previewStrip() + head + emptyBlock("zap", "No sequences yet", "Build an automated email + SMS drip — add steps, set delays, and enroll contacts from a CRM automation or form.", "newSeq", "New sequence"));
    if (!q.steps || !q.steps.length) return shell("sequence", previewStrip() + head + seqMetaCard(q) + emptyBlock("zap", "No steps yet", "Add the first email or SMS step to this sequence, then set its delay.", "addStep", "Add step"));
    const steps = q.steps.map((s, i) => seqStep(s, i, q.steps.length)).join("");
    return shell("sequence", previewStrip() + head + seqMetaCard(q) + `<div class="seq-timeline" id="seqTimeline">${steps}</div>
      <div class="seq-add-row">${canWrite() ? `<button class="btn btn-ghost" id="addStep">${svg("plus", 15)} Add step</button>` : ""}</div>`);
  }
  function seqMetaCard(q) {
    const exits = [];
    if (q.exit_on?.goal) exits.push("goal met");
    if (q.exit_on?.unsub) exits.push("unsubscribed");
    if (q.exit_on?.replied) exits.push("replied");
    return `<div class="panel seq-meta" style="padding:18px 20px">
      <div class="sm-stat"><div class="sm-val mono">${fmtInt(q.enrolled_count || 0)}</div><div class="sm-lbl">Enrolled</div></div>
      <div class="sm-div"></div>
      <div class="sm-stat"><div class="sm-val mono">${(q.steps || []).length}</div><div class="sm-lbl">Steps</div></div>
      <div class="sm-div"></div>
      <div class="sm-exit"><div class="sm-lbl">Exit conditions</div>
        <div class="exit-chips">${["goal", "unsub", "replied"].map((k) => `<button class="exit-chip ${q.exit_on?.[k] ? "on" : ""}" data-exit="${k}">${k === "unsub" ? "Unsubscribed" : k === "replied" ? "Replied" : "Goal met"}</button>`).join("")}</div></div>
    </div>`;
  }
  function seqStep(s, i, total) {
    const delay = s.delay?.mode === "fixed"
      ? `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][s.delay.weekday || 0]} at ${s.delay.time || "09:00"}`
      : (s.delay?.days ? `+${s.delay.days} day${s.delay.days === 1 ? "" : "s"}` : "immediately");
    const stats = s.channel === "sms"
      ? `<span class="ss-stat"><b class="mono">${fmtInt(s.sent)}</b> sent</span><span class="ss-stat"><b class="mono">${fmtInt(s.clicked)}</b> click</span>`
      : `<span class="ss-stat"><b class="mono">${fmtInt(s.sent)}</b> sent</span><span class="ss-stat"><b class="mono">${fmtPct(s.opened, s.sent)}</b> open</span><span class="ss-stat"><b class="mono">${fmtPct(s.clicked, s.sent)}</b> click</span>`;
    return `<div class="seq-node" data-stepid="${s.id}" data-idx="${i}">
      <div class="sn-rail"><span class="sn-dot">${svg(s.channel === "sms" ? "msg" : "mail", 13)}</span>${i < total - 1 ? `<span class="sn-line"></span>` : ""}</div>
      <div class="sn-card panel">
        <div class="sn-head"><span class="sn-grip" title="Drag to reorder">${svg("grip", 14)}</span>${typePill(s.channel)}<span class="sn-delay">${svg("clock", 12)} ${esc(delay)}</span>
          <div class="spacer"></div>${canWrite() ? `<button class="blk-del" data-delstep="${s.id}" title="Remove step">${svg("trash", 13)}</button>` : ""}</div>
        <div class="sn-subject">${esc(s.subject || (s.channel === "sms" ? "SMS message" : "No subject"))}</div>
        <div class="sn-stats">${stats}</div>
        <div class="sn-delaycfg">
          <div class="seg sn-mode" data-stepid="${s.id}"><button data-dmode="relative" class="${s.delay?.mode !== "fixed" ? "on" : ""}">Relative days</button><button data-dmode="fixed" class="${s.delay?.mode === "fixed" ? "on" : ""}">Fixed weekday</button></div>
          ${s.delay?.mode === "fixed"
            ? `<select data-dweekday="${s.id}">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, wi) => `<option value="${wi}" ${(+s.delay.weekday || 0) === wi ? "selected" : ""}>${d}</option>`).join("")}</select><input type="time" data-dtime="${s.id}" value="${s.delay.time || "09:00"}">`
            : `<input type="number" data-ddays="${s.id}" value="${s.delay?.days || 0}" min="0" style="width:80px"> <span class="mono" style="font-size:12px;color:var(--ink-400)">days after previous</span>`}
        </div>
      </div>
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     View: Sending settings (#/settings/sending)
     ══════════════════════════════════════════════════════════════════════════ */
  function viewSending() {
    if (st("loading")) return shell("sending", loadingBlock());
    if (st("error")) return shell("sending", errorBlock());
    const head = `<div class="pg-head"><div><div class="eyebrow">${svg("settings", 13)} Deliverability</div>
      <div class="pg-title">Sending settings</div><div class="pg-sub">Authenticate your domain, manage sender identities, and view the suppression list.</div></div></div>`;
    return shell("sending", previewStrip() + head + `<div class="send-stack">${domainCard()}${identitiesCard()}${suppressionCard()}</div>`);
  }
  function domainCard() {
    const domain = state.identities[0]?.domain || "northstar.agency";
    const rec = (host, type, val) => `<div class="dns-rec"><div class="dns-type">${type}</div><div class="dns-host mono">${esc(host)}</div><div class="dns-val mono">${esc(val)}</div><button class="icon-btn dns-copy" data-copy="${esc(val)}" title="Copy">${svg("copy", 13)}</button></div>`;
    return `<div class="panel" style="padding:22px 24px">
      <div class="panel-head"><span class="ph-ico">${svg("globe", 15)}</span><b>Domain authentication</b><div style="flex:1"></div><span class="st st-scheduled">ready to verify</span></div>
      <p class="muted" style="font-size:13px;margin:0 0 14px">Add these records at your DNS host for <b class="mono">${esc(domain)}</b>, then verify. Authenticated domains land in the inbox, not spam.</p>
      <div class="dns-list">
        ${rec("em1234." + domain, "CNAME", "u1234.wl.sendgrid.net")}
        ${rec("s1._domainkey." + domain, "CNAME", "s1.domainkey.u1234.wl.sendgrid.net")}
        ${rec("s2._domainkey." + domain, "CNAME", "s2.domainkey.u1234.wl.sendgrid.net")}
        ${rec(domain, "TXT (SPF)", "v=spf1 include:sendgrid.net ~all")}
      </div>
      <div class="dom-actions">
        <button class="btn btn-primary btn-sm" id="verifyDomain">${svg("shield", 14)} Verify domain</button>
        <span class="hint">${svg("info", 12)} Verification runs live once deployed — the SendGrid domain-auth API call is built to contract but ready-not-run here (D-091).</span>
      </div>
    </div>`;
  }
  function identitiesCard() {
    const rows = (st("empty") ? [] : state.identities).map((i) => `<tr>
      <td><div class="cell-main"><span class="id-name">${esc(i.from_name)}</span><span class="id-email mono">${esc(i.from_email)}</span></div></td>
      <td>${i.verified ? `<span class="st st-sent">verified</span>` : `<span class="st st-draft">unverified</span>`}</td>
      <td><span class="auth-dots"><span class="ad ${i.spf_ok ? "ok" : ""}" title="SPF">SPF</span><span class="ad ${i.dkim_ok ? "ok" : ""}" title="DKIM">DKIM</span></span></td>
      <td class="num">${i.is_default ? `<span class="st st-active">default</span>` : (canManage() ? `<button class="li-del" data-iddel="${i.id}" title="Remove">${svg("trash", 13)}</button>` : "")}</td>
    </tr>`).join("");
    return `<div class="panel" style="padding:22px 24px">
      <div class="panel-head"><span class="ph-ico">${svg("user", 15)}</span><b>Sender identities</b><div style="flex:1"></div>${canManage() ? `<button class="btn btn-ghost btn-sm" id="addIdent">${svg("plus", 14)} Add identity</button>` : ""}</div>
      ${state.identities.length && !st("empty") ? `<div class="table-scroll"><table class="table"><thead><tr><th>From</th><th>Status</th><th>Auth</th><th class="num"></th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<p class="muted">No sender identities yet. Add a from-name and address to send email.</p>`}
    </div>`;
  }
  function suppressionCard() {
    const q = state.supQuery.trim().toLowerCase();
    const all = st("empty") ? [] : state.suppressions;
    const rows = all.filter((s) => !q || s.email.toLowerCase().includes(q));
    const body = rows.length ? `<div class="table-scroll"><table class="table"><thead><tr><th>Email</th><th>Reason</th><th>Source</th><th class="num">Added</th></tr></thead>
      <tbody>${rows.map((s) => `<tr><td class="mono">${esc(s.email)}</td><td><span class="st st-${s.reason === "unsub" ? "paused" : s.reason === "manual" ? "draft" : "failed"}">${esc(s.reason)}</span></td><td class="muted">${esc(s.source)}</td><td class="num muted">${fmtDate(s.created_at)}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted">${q ? "No suppressed addresses match “" + esc(q) + "”." : "No suppressions yet. Bounces, complaints and unsubscribes land here automatically."}</p>`;
    return `<div class="panel" style="padding:22px 24px">
      <div class="panel-head"><span class="ph-ico">${svg("slash", 15)}</span><b>Suppression list</b><span class="sup-count mono">${fmtInt(all.length)}</span><div style="flex:1"></div>
        <div class="sup-search"><span>${svg("search", 14)}</span><input id="supSearch" placeholder="Search email…" value="${esc(state.supQuery)}"></div>
        ${canManage() ? `<button class="btn btn-ghost btn-sm" id="addSup">${svg("plus", 14)} Add</button>` : ""}</div>
      <div class="banner" style="margin:0 0 14px"><span class="b-ico">${svg("shield", 15)}</span><div>The suppression list is <b>service-role-written</b> (D-089) — it's populated by the SendGrid webhook and the unsubscribe endpoint (which dual-writes an M05 consent opt-out). Manual add/remove is applied server-side.</div></div>
      ${body}
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Shared Gate-5 state blocks
     ══════════════════════════════════════════════════════════════════════════ */
  function loadingBlock() {
    return previewStrip() + `<div class="pg-head"><div><div class="eyebrow">${svg("send", 13)} Acquisition</div><div class="pg-title">Campaigns</div></div></div>
      <div class="kpi-strip">${[0, 1, 2, 3].map(() => `<div class="kpi"><div class="skeleton" style="height:34px;width:34px;border-radius:10px"></div><div class="skeleton" style="height:22px;width:55%;margin-top:14px"></div><div class="skeleton" style="height:10px;width:38%;margin-top:10px"></div></div>`).join("")}</div>
      <div class="panel" style="padding:18px">${[0, 1, 2, 3, 4].map(() => `<div class="skeleton" style="height:52px;margin:8px 0;border-radius:12px"></div>`).join("")}</div>`;
  }
  function errorBlock() {
    const raw = state.error || "connection_error";
    const human = /permission|rls|denied/i.test(raw) ? "You don't have access to this workspace's campaigns." : /quota|meter/i.test(raw) ? "Your email quota is exhausted — top up or upgrade to continue." : "We couldn't reach the server.";
    return previewStrip() + `<div class="panel probe state-error" style="padding:44px;text-align:center">
      <div style="color:var(--status-danger);margin-bottom:10px">${svg("alert", 28)}</div>
      <div style="font-family:var(--font-serif);font-size:22px;color:var(--ink-900)">Something went wrong</div>
      <p class="muted" style="margin:8px auto 6px;max-width:440px">${esc(human)}</p>
      <p class="mono" style="font-size:11px;color:var(--ink-300);margin:0 auto 18px">${esc(raw)}</p>
      <button class="btn btn-primary" id="retry">Try again</button></div>`;
  }
  function emptyBlock(ico, title, sub, btnId, btnLabel) {
    return `<div class="empty-state"><div class="es-ico">${svg(ico, 26)}</div>
      <h3>${esc(title)}</h3><p>${esc(sub)}</p>
      ${btnId && canWrite() ? `<div class="es-cta"><button class="btn btn-primary btn-sm" id="${btnId}">${svg("plus", 14)} ${esc(btnLabel)}</button></div>` : ""}</div>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Render dispatch + wiring
     ══════════════════════════════════════════════════════════════════════════ */
  function render() {
    const app = $("#app");
    if (state.route.name === "wizard") app.innerHTML = viewWizard();
    else if (state.route.name === "sequence") app.innerHTML = viewSequence();
    else if (state.route.name === "sending") app.innerHTML = viewSending();
    else app.innerHTML = viewList();
    wireCommon();
    if (state.route.name === "wizard") wireWizard();
    else if (state.route.name === "sequence") wireSequence();
    else if (state.route.name === "sending") wireSending();
    else wireList();
  }
  function renderConn() {
    const pill = $("#connPill");
    if (pill) { const on = connected(); pill.hidden = !on; pill.textContent = on ? "live" : ""; pill.classList.toggle("live", on); }
  }
  function patchWizard() { $("#app").innerHTML = viewWizard(); wireCommon(); wireWizard(); }
  function patchSequence() { $("#app").innerHTML = viewSequence(); wireCommon(); wireSequence(); }

  function wireCommon() {
    const burger = $("#railBurger"); if (burger) burger.addEventListener("click", () => $("#rail").classList.toggle("open"));
    $$("[data-hash]").forEach((n) => n.addEventListener("click", () => { location.hash = n.dataset.hash; $("#rail")?.classList.remove("open"); }));
    const tt = $("#themeToggle"); if (tt) tt.addEventListener("click", () => setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"));
    const oc = $("#openConnect2"); if (oc) oc.addEventListener("click", openDrawer);
    $$("[data-preview]").forEach((b) => b.addEventListener("click", () => { state.previewState = b.dataset.preview; render(); }));
    const retry = $("#retry"); if (retry) retry.addEventListener("click", () => { state.previewState = "default"; state.error = null; boot(); });
    renderConn();
  }

  /* ── List wiring ─────────────────────────────────────────────────────────── */
  function wireList() {
    ["newCampaign", "newCampaign2"].forEach((id) => { const b = $("#" + id); if (b) b.addEventListener("click", () => { location.hash = "#/campaigns/new"; }); });
    $$("[data-open]").forEach((r) => r.addEventListener("click", () => { location.hash = "#/campaigns/" + r.dataset.open; }));
  }

  /* ── Wizard wiring ───────────────────────────────────────────────────────── */
  function wireWizard() {
    const e = state.editor; if (!e) return;
    const name = $("#campName"); if (name) name.addEventListener("input", () => { e.name = name.value; });
    $$("[data-step]").forEach((b) => b.addEventListener("click", () => { state.wizardStep = +b.dataset.step; patchWizard(); }));
    const prev = $("#wzPrev"); if (prev) prev.addEventListener("click", () => { state.wizardStep = clamp(state.wizardStep - 1, 1, 5); patchWizard(); });
    const next = $("#wzNext"); if (next) next.addEventListener("click", () => { state.wizardStep = clamp(state.wizardStep + 1, 1, 5); patchWizard(); });
    const save = $("#wzSave"); if (save) save.addEventListener("click", () => saveCampaign(false));
    const send = $("#wzSend"); if (send) send.addEventListener("click", sendCampaign);

    // Step 1 — audience
    $$("[data-aud]").forEach((b) => b.addEventListener("click", () => {
      const t = b.dataset.aud;
      e.audience = { type: t, label: t === "all" ? "All contacts" : t === "tag" ? (state.tags[0]?.name || "Tag") : (state.smartLists[0]?.name || "Smart list") };
      patchWizard();
    }));
    const audRef = $("#audRef"); if (audRef) audRef.addEventListener("change", () => { e.audience.label = audRef.value; patchWizard(); });
    $$("#chSeg button").forEach((b) => b.addEventListener("click", () => { e.channel = b.dataset.ch; patchWizard(); }));

    // Step 2 — email builder
    $$("[data-addblock]").forEach((b) => b.addEventListener("click", () => { e.body_json.push(newBlock(b.dataset.addblock)); patchWizard(); }));
    $$("[data-delblk]").forEach((b) => b.addEventListener("click", () => { e.body_json = e.body_json.filter((x) => x.id !== b.dataset.delblk); patchWizard(); }));
    $$(".blk").forEach((blk) => {
      $$("[data-blkf]", blk).forEach((inp) => inp.addEventListener("input", () => {
        const b = e.body_json.find((x) => x.id === blk.dataset.blk); if (!b) return;
        const k = inp.dataset.blkf;
        if (k === "networks") b.cfg[k] = inp.value.split(",").map((s) => s.trim()).filter(Boolean);
        else if (inp.type === "number") b.cfg[k] = +inp.value || 0;
        else b.cfg[k] = inp.value;
        refreshPreview();
      }));
    });
    const subjA = $("#subjA"); if (subjA) subjA.addEventListener("input", () => { e.subject = subjA.value; });
    const preh = $("#preheader"); if (preh) preh.addEventListener("input", () => { e.preheader = preh.value; });
    $$("#pvSeg button").forEach((b) => b.addEventListener("click", () => { state.previewMode = b.dataset.pv; patchWizard(); }));
    // SortableJS block reorder
    const col = $("#blocksCol");
    if (col && window.Sortable && canWrite()) {
      window.Sortable.create(col, { handle: ".blk-grip", animation: 160, ghostClass: "blk-ghost",
        onEnd: () => { const order = $$(".blk", col).map((n) => n.dataset.blk); e.body_json.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); refreshPreview(); } });
    }
    // SMS
    const sms = $("#smsBody"); if (sms) sms.addEventListener("input", () => { e.sms_body = sms.value; patchWizard(); });

    // Step 3 — A/B
    const abT = $("#abToggle"); if (abT) abT.addEventListener("change", () => { e.ab_enabled = abT.checked; patchWizard(); });
    const abA = $("#abA"); if (abA) abA.addEventListener("input", () => { e.subject = abA.value; });
    const abB = $("#abB"); if (abB) abB.addEventListener("input", () => { e.subject_b = abB.value; });
    const abS = $("#abSlider"); if (abS) abS.addEventListener("input", () => { e.ab_sample_pct = +abS.value; $("#abPctLbl").textContent = e.ab_sample_pct + "%"; $$(".ab-slice.ab-a .mono, .ab-slice.ab-b .mono").forEach((n) => n.textContent = e.ab_sample_pct + "%"); const rest = $(".ab-slice.ab-rest .mono"); if (rest) rest.textContent = (100 - e.ab_sample_pct * 2) + "%"; });

    // Step 4 — review
    const fi = $("#fromIdent"); if (fi) fi.addEventListener("change", () => { e.from_identity_id = fi.value; });
    const test = $("#testSend"); if (test) test.addEventListener("click", testSend);

    // Step 5 — schedule
    $$("[data-sched]").forEach((b) => b.addEventListener("click", () => { e.schedule_mode = b.dataset.sched; patchWizard(); }));
    const sa = $("#schedAt"); if (sa) sa.addEventListener("input", () => { e.scheduled_at = sa.value ? new Date(sa.value).toISOString() : null; });
    const thr = $("#throttle"); if (thr) thr.addEventListener("input", () => { e.throttle_per_min = +thr.value || 200; });
  }
  function refreshPreview() {
    const e = state.editor;
    const doc = $(".pv-doc"); if (doc) doc.innerHTML = compileEmail(e);
    $$(".blk").forEach((blk) => { const b = e.body_json.find((x) => x.id === blk.dataset.blk); if (b) { const sum = $(".blk-sum", blk); if (sum) sum.textContent = blockSummary(b); } });
  }

  /* ── Sequence wiring ─────────────────────────────────────────────────────── */
  function wireSequence() {
    const q = state.seq;
    $$("[data-exit]").forEach((b) => b.addEventListener("click", () => { if (!q) return; q.exit_on = q.exit_on || {}; q.exit_on[b.dataset.exit] = !q.exit_on[b.dataset.exit]; saveSequence(); patchSequence(); }));
    const add = $("#addStep"); if (add) add.addEventListener("click", addSeqStep);
    const newSeq = $("#newSeq"); if (newSeq) newSeq.addEventListener("click", () => toast("New sequences are created from a CRM automation or the Campaigns list (demo).", "info"));
    $$("[data-delstep]").forEach((b) => b.addEventListener("click", () => { if (!q) return; q.steps = q.steps.filter((s) => s.id !== b.dataset.delstep); saveSequence(); patchSequence(); }));
    // delay editing
    $$("[data-dmode] button, .sn-mode button").forEach(() => {});
    $$(".sn-mode").forEach((seg) => { const sid = seg.dataset.stepid; $$("button", seg).forEach((b) => b.addEventListener("click", () => { const s = q.steps.find((x) => x.id === sid); if (!s) return; s.delay = s.delay || {}; s.delay.mode = b.dataset.dmode; if (b.dataset.dmode === "fixed" && s.delay.weekday == null) { s.delay.weekday = 1; s.delay.time = "09:00"; } saveSequence(); patchSequence(); })); });
    $$("[data-ddays]").forEach((inp) => inp.addEventListener("input", () => { const s = q.steps.find((x) => x.id === inp.dataset.ddays); if (s) { s.delay = { ...s.delay, mode: "relative", days: +inp.value || 0 }; saveSequence(); } }));
    $$("[data-dweekday]").forEach((sel) => sel.addEventListener("change", () => { const s = q.steps.find((x) => x.id === sel.dataset.dweekday); if (s) { s.delay = { ...s.delay, mode: "fixed", weekday: +sel.value }; saveSequence(); patchSequence(); } }));
    $$("[data-dtime]").forEach((inp) => inp.addEventListener("input", () => { const s = q.steps.find((x) => x.id === inp.dataset.dtime); if (s) { s.delay = { ...s.delay, mode: "fixed", time: inp.value }; saveSequence(); } }));
    // SortableJS step reorder
    const tl = $("#seqTimeline");
    if (tl && window.Sortable && canWrite()) {
      window.Sortable.create(tl, { handle: ".sn-grip", animation: 160, ghostClass: "blk-ghost",
        onEnd: () => { const order = $$(".seq-node", tl).map((n) => n.dataset.stepid); q.steps.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); saveSequence(); patchSequence(); } });
    }
  }
  function addSeqStep() {
    const q = state.seq; if (!q) return;
    const s = { id: uid("s"), channel: "email", subject: "New step", delay: { mode: "relative", days: 1 }, sent: 0, opened: 0, clicked: 0 };
    q.steps = q.steps || []; q.steps.push(s); saveSequence(); patchSequence();
  }

  /* ── Sending settings wiring ─────────────────────────────────────────────── */
  function wireSending() {
    const vd = $("#verifyDomain"); if (vd) vd.addEventListener("click", () => toast(connected() ? "Domain verification requested — SendGrid confirms records live once deployed (D-091)." : "Domain verification runs live once deployed (ready-not-run, D-091).", "info"));
    $$("[data-copy]").forEach((b) => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.copy); } catch (e) {} toast("Copied to clipboard.", "success"); }));
    const ai = $("#addIdent"); if (ai) ai.addEventListener("click", identityModal);
    $$("[data-iddel]").forEach((b) => b.addEventListener("click", () => deleteIdentity(b.dataset.iddel)));
    const ss = $("#supSearch"); if (ss) ss.addEventListener("input", () => { state.supQuery = ss.value; const card = ss.closest(".panel"); if (card) { const fresh = el("div"); fresh.innerHTML = suppressionCard(); card.replaceWith(fresh.firstElementChild); wireSending(); const inp = $("#supSearch"); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } } });
    const addSup = $("#addSup"); if (addSup) addSup.addEventListener("click", suppressionModal);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Actions (mock = local state; live = supabase / edge functions)
     ══════════════════════════════════════════════════════════════════════════ */
  async function saveCampaign(silent) {
    const e = state.editor;
    if (!connected()) {
      if (e.id) { const idx = state.campaigns.findIndex((c) => c.id === e.id); if (idx >= 0) state.campaigns[idx] = { ...clone(e), stats: state.campaigns[idx].stats }; }
      else { e.id = uid("c"); e.status = "draft"; e.stats = { sent: 0, delivered: 0, opened: 0, clicked: 0, unsubscribed: 0, bounced: 0 }; state.campaigns.unshift(clone(e)); }
      if (!silent) { toast("Draft saved.", "success"); location.hash = "#/campaigns"; }
      return;
    }
    try {
      const c = ensureClient();
      const payload = { workspace_id: state.workspaceId, name: e.name, channel: e.channel, subject: e.subject, subject_b: e.ab_enabled ? e.subject_b : null,
        preheader: e.preheader || null, body_json: e.body_json, from_identity_id: e.from_identity_id, audience: e.audience,
        ab_enabled: e.ab_enabled, ab_sample_pct: e.ab_sample_pct, throttle_per_min: e.throttle_per_min, footer_address: e.footer_address,
        scheduled_at: e.schedule_mode === "later" ? e.scheduled_at : null };
      let row;
      if (e.id) ({ data: row } = await c.from("email_campaigns").update(payload).eq("id", e.id).select().single());
      else ({ data: row } = await c.from("email_campaigns").insert(payload).select().single());
      if (!row) throw new Error("save failed");
      e.id = row.id;
      if (!silent) { toast("Draft saved.", "success"); await loadData(state.workspaceId); location.hash = "#/campaigns"; }
    } catch (err) { toast(err.message || "Could not save (staff+ required).", "danger"); }
  }
  async function sendCampaign() {
    const e = state.editor;
    const count = audienceCount(e);
    if (count.eligible <= 0) { toast("No eligible recipients — adjust the audience.", "danger"); return; }
    await saveCampaign(true);
    if (!connected()) {
      const idx = state.campaigns.findIndex((c) => c.id === e.id);
      if (idx >= 0) state.campaigns[idx].status = e.schedule_mode === "now" ? "sending" : "scheduled";
      toast(e.schedule_mode === "now" ? `Send started — fanning out to ${fmtInt(count.eligible)} recipients (demo).` : `Scheduled for ${fmtDateTime(e.scheduled_at)} (demo).`, "success");
      location.hash = "#/campaigns"; return;
    }
    if (e.schedule_mode === "later") { toast("Scheduled — the m16-broadcast-dispatch cron fires it at send time.", "success"); location.hash = "#/campaigns"; return; }
    try {
      const c = ensureClient();
      const { data, error } = await c.functions.invoke("campaigns", { body: { action: "send-now", campaign_id: e.id } });
      if (error || !data?.ok) throw new Error(data?.error || "send failed");
      toast(`Send enqueued — fanning out to ${fmtInt(data.data?.recipients ?? count.eligible)} recipients.`, "success");
      await loadData(state.workspaceId); location.hash = "#/campaigns";
    } catch (err) { toast(err.message || "Could not start the send.", "danger"); }
  }
  async function testSend() {
    const e = state.editor;
    if (!connected()) { toast("Test sent to " + (state.user?.email || "yourself") + " (demo — no real delivery).", "success"); return; }
    try {
      const c = ensureClient();
      const { data, error } = await c.functions.invoke("campaigns", { body: { action: "test-send", campaign_id: e.id } });
      if (error || !data?.ok) throw new Error(data?.error || "test failed");
      toast("Test sent to your email.", "success");
    } catch (err) { toast(err.message || "Could not send test.", "danger"); }
  }

  async function saveSequence() {
    const q = state.seq; if (!q) return;
    const idx = state.sequences.findIndex((s) => s.id === q.id);
    if (idx >= 0) state.sequences[idx] = clone(q);
    if (!connected()) return;
    try {
      const c = ensureClient();
      await c.from("sequences").update({ exit_on: q.exit_on }).eq("id", q.id);
      // step upserts (order + delay) — steps carry their own ids
      for (let i = 0; i < q.steps.length; i++) { const s = q.steps[i]; await c.from("sequence_steps").update({ step_order: i, channel: s.channel, subject: s.subject, delay: s.delay }).eq("id", s.id); }
    } catch (err) { toast(err.message || "Could not save (manager+ required).", "danger"); }
  }

  function identityModal() {
    modal("Add sender identity", `
      <div class="form-grid"><div class="form-field"><label>From name</label><input id="idName" placeholder="Northstar Agency"></div>
      <div class="form-field"><label>From email</label><input id="idEmail" placeholder="hello@yourdomain.com"></div></div>
      <div class="form-field full"><label>Reply-to (optional)</label><input id="idReply" placeholder="team@yourdomain.com"></div>`,
      `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="doIdent">Add identity</button>`);
    $("#doIdent").addEventListener("click", async () => {
      const from_name = $("#idName").value.trim(), from_email = $("#idEmail").value.trim(), reply_to = $("#idReply").value.trim();
      if (!from_name || !from_email) { toast("Add a from-name and email.", "danger"); return; }
      const domain = (from_email.split("@")[1] || "").toLowerCase();
      if (!connected()) { state.identities.push({ id: uid("id"), from_name, from_email, reply_to, domain, spf_ok: false, dkim_ok: false, verified: false, is_default: !state.identities.length }); toast("Identity added — authenticate the domain to verify.", "success"); closeModal(); render(); return; }
      try { const c = ensureClient(); const { error } = await c.from("sender_identities").insert({ workspace_id: state.workspaceId, from_name, from_email, reply_to: reply_to || null, domain }); if (error) throw error; toast("Identity added.", "success"); await loadData(state.workspaceId); closeModal(); render(); }
      catch (err) { toast(err.message || "Manager+ required.", "danger"); }
    });
  }
  async function deleteIdentity(id) {
    if (!connected()) { state.identities = state.identities.filter((i) => i.id !== id); render(); return; }
    try { const c = ensureClient(); const { error } = await c.from("sender_identities").delete().eq("id", id); if (error) throw error; await loadData(state.workspaceId); render(); }
    catch (err) { toast(err.message || "Manager+ required.", "danger"); }
  }

  function suppressionModal() {
    modal("Add to suppression list", `
      <p class="muted" style="margin-top:-4px">Block an address from all sends. This applies server-side and dual-writes an M05 consent opt-out.</p>
      <div class="form-field full"><label>Email</label><input id="supEmail" placeholder="address@example.com"></div>`,
      `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="doSup">Suppress</button>`);
    $("#doSup").addEventListener("click", async () => {
      const email = $("#supEmail").value.trim().toLowerCase();
      if (!email || !/.+@.+\..+/.test(email)) { toast("Enter a valid email.", "danger"); return; }
      if (!connected()) { state.suppressions.unshift({ id: uid("u"), email, reason: "manual", source: "manual", created_at: new Date().toISOString() }); toast("Address suppressed.", "success"); closeModal(); render(); return; }
      try { const c = ensureClient(); const { data, error } = await c.functions.invoke("campaigns", { body: { action: "suppress", email } }); if (error || !data?.ok) throw new Error(data?.error || "failed"); toast("Address suppressed (server-side).", "success"); await loadData(state.workspaceId); closeModal(); render(); }
      catch (err) { toast(err.message || "Could not suppress.", "danger"); }
    });
  }

  /* ── Modal primitive ─────────────────────────────────────────────────────── */
  function modal(title, body, footer) {
    const r = $("#modalRoot");
    r.innerHTML = `<div class="modal-scrim open" id="mScrim"><div class="modal-card" role="dialog" aria-modal="true">
      <div class="mc-head"><h3 style="font-family:var(--font-serif)">${esc(title)}</h3><button class="icon-btn mc-close" data-close>✕</button></div>
      <div class="mc-body">${body}</div><div class="mc-foot">${footer}</div></div></div>`;
    $("#mScrim").addEventListener("click", (ev) => { if (ev.target.id === "mScrim") closeModal(); });
    $$("[data-close]").forEach((b) => b.addEventListener("click", closeModal));
    document.addEventListener("keydown", escClose);
  }
  function closeModal() { $("#modalRoot").innerHTML = ""; document.removeEventListener("keydown", escClose); }
  function escClose(e) { if (e.key === "Escape") closeModal(); }

  /* ── Go ──────────────────────────────────────────────────────────────────── */
  boot();
})();
