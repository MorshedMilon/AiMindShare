/* m12-inbox.js — AiMindShare Module M12 · Inbox (Email + SMS).
   Vanilla hash-routed omnichannel inbox on Supabase. Three panels — conversation
   list (filters: status/channel/assignee/unread + search) / thread (messages +
   composer) / contact context (profile, quick actions, recent timeline). SMS is
   wired live this session: inbound arrives via the signature-verified Twilio
   webhook → ingest_inbound_message (contact resolve + thread + M09 timeline);
   outbound goes through the `inbox-send` Edge Function (A2P + consent + meter
   gates — the browser can only post internal NOTES, per 0015 D-055). Assignment,
   statuses, canned "/" responses, @mentions and full-text search complete the
   workspace. Email defers with D-011; WhatsApp/FB/IG + live chat defer to their
   provider weeks (labelled scaffolds). Offline → a high-fidelity mockup with a
   default/empty/loading/error/success preview switcher (Gate-5). */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const initials = (s) => (s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const nextTick = (fn) => setTimeout(fn, 12);

  /* ── Lucide-style inline icons ──────────────────────────────────────────── */
  const P = {
    inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
    msg: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
    mail: "M4 4h16v16H4zM22 6l-10 7L2 6",
    phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z",
    send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
    user: "M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    note: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5",
    at: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z",
    slash: "M9 18l6-12", search: "M21 21l-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
    filter: "M22 3H2l8 9.5V19l4 2v-8.5z", check: "M20 6 9 17l-5-5", checks: "M18 6 7 17l-5-5M22 10l-7.5 7.5L13 16",
    clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
    x: "M18 6 6 18M6 6l12 12", plus: "M12 5v14M5 12h14", chev: "M9 18l6-6-6-6", chevDown: "M6 9l6 6 6-6",
    arrowLeft: "M19 12H5M12 19l-7-7 7-7", sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z",
    tag: "M20.59 13.41 12 22l-9-9V3h10l7.59 7.59a2 2 0 0 1 0 2.82zM7 7h.01",
    settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
    edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z",
    trash: "M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
    paperclip: "M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48",
    building: "M4 22V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v18M15 9h4a1 1 0 0 1 1 1v12M8 7h.01M8 11h.01M8 15h.01M12 7h.01M12 11h.01M12 15h.01",
    dollar: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
    alert: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
    calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
    lock: "M5 11h14v10H5zM7 11V7a5 5 0 0 1 10 0v4",
  };
  const svg = (name, size = 17) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${P[name] || ""}"/></svg>`;
  const CHAN_ICON = { sms: "msg", email: "mail", whatsapp: "phone", fb: "msg", ig: "msg", webchat: "msg", voice: "phone" };
  const CHAN_LABEL = { sms: "SMS", email: "Email", whatsapp: "WhatsApp", fb: "Facebook", ig: "Instagram", webchat: "Web chat", voice: "Voice" };
  const STATUSES = [["open", "Open"], ["pending", "In Progress"], ["resolved", "Resolved"], ["spam", "Spam"]];
  const STATUS_LABEL = Object.fromEntries(STATUSES);

  /* ── Theme + starfield ──────────────────────────────────────────────────── */
  const THEME_KEY = "aimindshare-theme";
  const root = document.documentElement;
  const setTheme = (t) => { root.setAttribute("data-theme", t); try { localStorage.setItem(THEME_KEY, t); } catch (e) {} const i = $("#themeIco"); if (i) i.textContent = t === "dark" ? "☀" : "☾"; };
  setTheme((() => { try { return localStorage.getItem(THEME_KEY) || "light"; } catch (e) { return "light"; } })());
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  (function stars() {
    const field = $("#starField"); if (!field || reduce) return;
    for (let i = 0; i < 40; i++) { const s = el("div", "star"); s.style.left = Math.random() * 100 + "%"; s.style.top = Math.random() * 100 + "%"; s.style.setProperty("--tw", (3 + Math.random() * 7).toFixed(1) + "s"); s.style.setProperty("--td", (Math.random() * 10).toFixed(1) + "s"); field.appendChild(s); }
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
  const HOUR = 36e5, DAY = 864e5;
  const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
  function relTime(d) {
    const diff = Date.now() - new Date(d).getTime();
    const m = Math.round(diff / 6e4);
    if (m < 1) return "now"; if (m < 60) return m + "m";
    const h = Math.round(m / 60); if (h < 24) return h + "h";
    const dd = Math.round(h / 24); if (dd < 7) return dd + "d";
    try { return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch (e) { return "—"; }
  }
  function clockTime(d) { try { return new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } }
  function daySep(d) {
    const day = new Date(d); const today = new Date();
    const diff = Math.floor((today.setHours(0, 0, 0, 0) - new Date(day).setHours(0, 0, 0, 0)) / DAY);
    if (diff === 0) return "Today"; if (diff === 1) return "Yesterday";
    try { return new Date(d).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }); } catch (e) { return ""; }
  }

  /* ── Mockup data (mockup mode only — never a live code path) ─────────────── */
  const MOCK = (() => {
    const members = [
      { id: "you", name: "Aisha Rahman" }, { id: "sara", name: "Sara Malik" },
      { id: "bilal", name: "Bilal Ahmed" }, { id: "noor", name: "Noor Siddiqui" },
    ];
    const canned = [
      { id: "k1", shortcut: "greeting", title: "Warm greeting", content: "Assalamu alaikum {{first_name}} — thanks so much for reaching out! How can we help today?" },
      { id: "k2", shortcut: "hours", title: "Business hours", content: "We're available Sun–Thu, 9am–6pm. We'll reply as soon as we're back, in shaa Allah." },
      { id: "k3", shortcut: "booking", title: "Booking link", content: "You can pick a time that suits you here: https://aimindshare.com/book/{{first_name}} — looking forward to it!" },
      { id: "k4", shortcut: "thanks", title: "Thank you", content: "JazakAllah khair, {{first_name}}! Let us know if there's anything else we can do." },
    ];
    const channels = [
      { id: "ch1", type: "sms", label: "Main line", external_ref: "+1 (415) 555-0100", is_active: true, status: "connected" },
    ];
    // conversations with an inline messages array (demo only)
    const mk = (id, contact, channel, status, assignee, unread, msgs) => ({
      id, contact, channel, status, assigned_to: assignee, unread_count: unread,
      last_channel: msgs[msgs.length - 1].channel,
      last_message_at: msgs[msgs.length - 1].created_at, messages: msgs,
    });
    const m = (dir, chan, content, ago, opts = {}) => Object.assign({
      id: "m" + Math.random().toString(36).slice(2, 8), direction: dir, channel: chan, content,
      created_at: iso(-ago), status: dir === "outbound" ? "delivered" : "delivered", is_internal_note: false,
    }, opts);
    const contacts = {
      c1: { id: "c1", first_name: "Yusuf", last_name: "Karim", email: "yusuf.karim@sadaqahfund.org", phone: "+1 (312) 555-0198", company: "Sadaqah Fund", score: 72, tags: ["Newsletter", "Referral"] },
      c2: { id: "c2", first_name: "Layla", last_name: "Hassan", email: "layla@nooranalytics.io", phone: "+1 (206) 555-0175", company: "Noor Analytics", score: 61, tags: ["Trial"] },
      c3: { id: "c3", first_name: "Omar", last_name: "Farouk", email: "omar.farouk@falak.vc", phone: "+1 (646) 555-0119", company: "Falak Ventures", score: 58, tags: ["Enterprise"] },
      c4: { id: "c4", first_name: "Fatima", last_name: "Zahra", email: "fatima.zahra@nooranalytics.io", phone: "+1 (206) 555-0128", company: "Noor Analytics", score: 67, tags: ["VIP", "Referral"] },
      c5: { id: "c5", first_name: "Bilal", last_name: "Ahmed", email: "bilal.ahmed@sadaqahfund.org", phone: "+1 (312) 555-0187", company: "Sadaqah Fund", score: 39, tags: ["Newsletter"] },
      c6: { id: "c6", first_name: "Aisha", last_name: "Rahman", email: "aisha.rahman@bayan.studio", phone: "+1 (415) 555-0142", company: "Bayan Studios", score: 84, tags: ["VIP", "Enterprise"] },
    };
    const convs = [
      mk("d1", contacts.c1, "sms", "open", "you", 2, [
        m("inbound", "sms", "Salaam! Is the Ramadan brand refresh package still available?", 2.4 * HOUR),
        m("outbound", "sms", "Wa alaikum assalam Yusuf! Yes it is — I'd love to walk you through it. Are you free for a quick call this week?", 2.1 * HOUR),
        m("inbound", "sms", "That would be great. Thursday works for me.", 40 * 6e4),
        m("inbound", "sms", "Also — do you offer a non-profit discount?", 12 * 6e4),
      ]),
      mk("d2", contacts.c2, "sms", "pending", "sara", 0, [
        m("inbound", "sms", "Hi, following up on the analytics dashboard proposal 🙏", 26 * HOUR),
        m("outbound", "sms", "Hi Layla — sending the revised scope over today. Thanks for your patience!", 25 * HOUR),
        m("outbound", "sms", "Here's the summary: https://aimindshare.com/p/noor-dash", 24.6 * HOUR, { status: "delivered" }),
        { id: "n1", direction: "outbound", channel: "sms", content: "Layla mentioned budget is tight — let's lead with the starter tier. @sara can you prep the numbers?", created_at: iso(-24.5 * HOUR), is_internal_note: true, sender: "you", mentions: ["sara"] },
      ]),
      mk("d3", contacts.c3, "email", "open", "you", 1, [
        m("inbound", "email", "Could you send over the partnership deck we discussed at the summit? Keen to share it with our LPs.", 5 * HOUR),
        m("outbound", "email", "Absolutely, Omar. Attaching it now — let me know if you'd like a tailored one-pager for the LP conversation.", 4.5 * HOUR),
        m("inbound", "email", "Perfect, thank you. One more thing — do you have case studies in the fintech space?", 30 * 6e4),
      ]),
      mk("d4", contacts.c4, "sms", "resolved", "sara", 0, [
        m("inbound", "sms", "Just wanted to say the new booking flow is beautiful, mashaAllah!", 3 * DAY),
        m("outbound", "sms", "That means a lot, Fatima — JazakAllah khair for the kind words! 🌙", 3 * DAY + 20 * 6e4, { ai: true }),
      ]),
      mk("d5", contacts.c5, "sms", "open", null, 1, [
        m("inbound", "sms", "STOP", 8 * HOUR),
        m("outbound", "sms", "You have been unsubscribed and will receive no further messages. Reply START to opt back in.", 8 * HOUR - 4000),
      ]),
      mk("d6", contacts.c6, "email", "pending", "noor", 0, [
        m("inbound", "email", "Reminder: our contract renews next month — can we review the scope before then?", 2 * DAY),
        { id: "n2", direction: "outbound", channel: "email", content: "High-value account (84 score). Loop in @you before the renewal call.", created_at: iso(-2 * DAY + 6e4), is_internal_note: true, sender: "noor", mentions: ["you"] },
      ]),
    ];
    return { members, canned, channels, contacts, convs };
  })();

  /* ── State ──────────────────────────────────────────────────────────────── */
  const state = {
    loaded: false, loading: false, error: null, previewState: "default",
    user: null, workspaceId: null, workspaceName: "", role: "owner",
    members: [], canned: [], channels: [], conversations: [], messages: {},
    activeConvId: null,
    filter: { status: "all", channel: "all", assignee: "all", unread: false },
    search: "",
    composer: { mode: "reply", channel: null },
    ctxOpen: false, sending: false,
    menu: null, // 'status' | 'assign'
    pop: null,  // { type, items, cursor, tokenStart }
  };
  const PREVIEW_STATES = ["default", "empty", "loading", "error", "success"];
  const st = (name) => !connected() && state.previewState === name;
  const canWrite = () => ["owner", "admin", "manager", "staff"].includes(state.role) || !connected();
  const canDelete = () => ["owner", "admin", "manager"].includes(state.role) || !connected();
  const isAdmin = () => ["owner", "admin"].includes(state.role) || !connected();

  const memberName = (id) => {
    if (!id) return "Unassigned";
    if (connected()) return id === state.user?.id ? "You" : (state.members.find((m) => m.id === id)?.name || String(id).slice(0, 8));
    const m = state.members.find((m) => m.id === id); return id === "you" ? (m?.name || "You") : (m?.name || id);
  };
  const cannedList = () => (connected() ? state.canned : MOCK.canned);
  const memberList = () => (connected() ? state.members : MOCK.members);
  const fullName = (c) => c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || c.phone || c.email || "Unknown" : "Unknown";

  /* ── Data source (mock vs live) ─────────────────────────────────────────── */
  const conversations = () => (connected() ? state.conversations : MOCK.convs);
  function convMessages(convId) {
    if (!connected()) { const c = MOCK.convs.find((x) => x.id === convId); return c ? c.messages : []; }
    return state.messages[convId] || [];
  }
  const convById = (id) => conversations().find((c) => c.id === id);

  /* ── Filtering ──────────────────────────────────────────────────────────── */
  function filtered() {
    let list = conversations().slice();
    const f = state.filter;
    if (f.status !== "all") list = list.filter((c) => c.status === f.status);
    if (f.channel !== "all") list = list.filter((c) => c.channel === f.channel);
    if (f.assignee === "me") list = list.filter((c) => c.assigned_to === (connected() ? state.user?.id : "you"));
    else if (f.assignee === "unassigned") list = list.filter((c) => !c.assigned_to);
    if (f.unread) list = list.filter((c) => (c.unread_count || 0) > 0);
    const q = state.search.trim().toLowerCase();
    if (q) list = list.filter((c) => {
      const ct = c.contact || (connected() ? c.contacts : null);
      const hay = [fullName(ct), ct?.email, ct?.phone, (convMessages(c.id).map((m) => m.content).join(" "))].join(" ").toLowerCase();
      return hay.includes(q);
    });
    return list.sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
  }

  /* ═══════════════════════════════════════════════════════════════════════
     SHELL
     ═══════════════════════════════════════════════════════════════════════ */
  const NAV = {
    inbox: [
      { key: "inbox", label: "Conversations", ico: "inbox", hash: "#/inbox" },
    ],
    settings: [
      { key: "channels", label: "Channels", ico: "settings", hash: "#/settings/channels" },
      { key: "canned", label: "Canned replies", ico: "slash", hash: "#/settings/canned" },
    ],
  };
  function navGroup(label, items, activeKey) {
    const rows = items.map((n) => `<div class="nav-item ${n.key === activeKey ? "active" : ""}" data-hash="${n.hash}"><span class="ni-ico">${svg(n.ico)}</span><span>${n.label}</span></div>`).join("");
    return `<div class="nav-group"><div class="nav-group-label">${label}</div>${rows}</div>`;
  }
  function shell(activeKey, content, flush) {
    return `
      <aside class="rail" id="rail">
        <div class="brand"><span class="mark">✦</span><span><b>AiMind</b><em>Share</em></span></div>
        ${navGroup("Inbox", NAV.inbox, activeKey)}
        ${navGroup("Settings", NAV.settings, activeKey)}
        <div class="rail-foot">M12 · Inbox</div>
      </aside>
      <header class="tbar">
        <button class="icon-btn rail-burger" id="railBurger" aria-label="Menu">☰</button>
        <div class="ws-trigger" style="cursor:default">
          <span class="ws-badge">${esc(initials(state.workspaceName || "AiMindShare"))}</span>
          <span class="ws-meta"><span class="ws-name">${esc(state.workspaceName || "Workspace")}</span><span class="ws-kind">Inbox</span></span>
        </div>
        <div class="spacer"></div>
        <span class="pill ${connected() ? "success" : "plain"}" id="connPill">${connected() ? "live" : "mockup mode"}</span>
        <button class="btn btn-ghost btn-sm" id="openConnect2">Connect</button>
        <button class="icon-btn" id="themeToggle" title="Toggle theme" aria-label="Toggle theme"><span id="themeIco">☾</span></button>
        <span class="avatar" title="${esc(state.user?.email || "")}">${esc(initials(state.user?.email || "AiMindShare"))}</span>
      </header>
      <main class="content"><div class="content-inner ${flush ? "ci-flush" : ""}">${content}</div></main>`;
  }
  function pageHead(m, title, sub) {
    return `<div class="page-head reveal"><span class="eyebrow">Module · ${m}</span>
      <h1 style="margin-top:12px">${title}</h1><p class="sub">${sub}</p></div>`;
  }
  function previewStrip() {
    if (connected()) return "";
    return `<div class="mock-note"><span class="mn-ico">◈</span><b>Mockup mode.</b>
      Connect a project to load live threads, post notes and send SMS under RLS. Sample data shown. Preview:
      ${PREVIEW_STATES.map((s) => `<button class="link ${state.previewState === s ? "on" : ""}" data-preview="${s}">${s}</button>`).join(" ")}</div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     VIEW: INBOX (three panels)
     ═══════════════════════════════════════════════════════════════════════ */
  function viewInbox(activeId) {
    // loading / error / empty preview states (mockup switcher)
    if (state.loading || st("loading")) return { flush: false, html: skeleton() };
    if (state.error || st("error")) return { flush: false, html: errorBlock(state.error) };

    const list = filtered();
    const isEmpty = st("empty") || (connected() && conversations().length === 0);
    const active = isEmpty ? null : (convById(activeId) || list[0] || null);
    state.activeConvId = active ? active.id : null;

    const mobileView = active && activeId ? "thread" : "list";
    return {
      flush: true,
      html: `<div class="inbox" data-view="${mobileView}">
        ${listPanel(list, active, isEmpty)}
        ${threadPanel(active, isEmpty)}
        ${contextPanel(active)}
      </div>`,
    };
  }

  function listPanel(list, active, isEmpty) {
    const f = state.filter;
    const total = conversations().length;
    const unread = conversations().reduce((n, c) => n + ((c.unread_count || 0) > 0 ? 1 : 0), 0);
    const fchip = (key, val, label, num) => `<button class="fchip ${f[key] === val || (key === "unread" && f.unread && val) ? "on" : ""}" data-f="${key}" data-v="${val}">${esc(label)}${num != null ? `<span class="fc-num">${num}</span>` : ""}</button>`;
    const rows = isEmpty ? "" : list.map((c) => convRow(c, active)).join("");
    const emptyRows = isEmpty || list.length === 0
      ? `<div style="padding:40px 20px" class="ibx-blank"><div class="es-ico">${svg("inbox", 24)}</div>
          <h3 style="font-size:18px">${isEmpty ? "No conversations yet" : "Nothing matches"}</h3>
          <p>${isEmpty ? "Inbound SMS and replies will appear here the moment they arrive." : "Try clearing a filter or search term."}</p></div>` : "";
    return `<div class="ibx-list">
      <div class="ibx-lhead">
        <div class="ibx-title">${svg("inbox", 19)}<h2>Inbox</h2><span class="ibx-count">${total} · ${unread} unread</span></div>
        <div class="ibx-lsearch">${svg("search", 15)}<input id="ibxSearch" placeholder="Search conversations & messages…" value="${esc(state.search)}"></div>
      </div>
      <div class="ibx-filters">
        ${fchip("status", "all", "All")}
        ${STATUSES.map(([v, l]) => fchip("status", v, l)).join("")}
        <span style="width:1px;height:20px;background:var(--line);margin:4px 2px"></span>
        ${fchip("assignee", "me", "Mine")}
        ${fchip("unread", true, "Unread", unread)}
      </div>
      <div class="ibx-rows">${rows}${emptyRows}</div>
    </div>`;
  }

  function convRow(c, active) {
    const ct = c.contact || c.contacts || null;
    const msgs = convMessages(c.id);
    const last = msgs[msgs.length - 1];
    const snip = last ? (last.is_internal_note ? "📝 " : (last.direction === "outbound" ? "You: " : "")) + (last.content || "[attachment]") : "";
    const unread = (c.unread_count || 0) > 0;
    return `<div class="conv-row ${c.id === (active && active.id) ? "active" : ""} ${unread ? "unread" : ""}" data-conv="${c.id}">
      <div class="cr-av">
        <span class="avatar">${esc(initials(fullName(ct)))}</span>
        <span class="cr-chan ${c.channel}">${svg(CHAN_ICON[c.channel] || "msg")}</span>
      </div>
      <div class="cr-main">
        <div class="cr-top"><span class="cr-name">${esc(fullName(ct))}</span><span class="cr-time">${relTime(c.last_message_at)}</span></div>
        <div class="cr-snip">${esc(snip)}</div>
        <div class="cr-meta">
          <span class="cr-status-dot st-${c.status}"></span>
          <span class="cr-assignee">${esc(memberName(c.assigned_to))}</span>
          ${unread ? `<span class="cr-badge" style="margin-left:auto">${c.unread_count}</span>` : ""}
        </div>
      </div>
    </div>`;
  }

  function threadPanel(c, isEmpty) {
    if (!c) {
      return `<div class="ibx-thread"><div class="ibx-blank">
        <div class="es-ico">${svg("msg", 26)}</div>
        <h3>${isEmpty ? "Your inbox is ready" : "Select a conversation"}</h3>
        <p>${isEmpty ? "When a contact texts your number or replies to an email, the thread opens here — in realtime." : "Pick a conversation on the left to read the thread and reply."}</p>
      </div></div>`;
    }
    const ct = c.contact || c.contacts || null;
    const msgs = convMessages(c.id);
    return `<div class="ibx-thread">
      <div class="ibx-thead">
        <button class="icon-btn ibx-back" id="ibxBack" aria-label="Back">${svg("arrowLeft", 18)}</button>
        <div class="th-id">
          <div class="th-name">${esc(fullName(ct))}</div>
          <div class="th-sub">${svg(CHAN_ICON[c.channel] || "msg", 12)} ${CHAN_LABEL[c.channel] || c.channel} · ${esc(ct?.phone || ct?.email || "")}</div>
        </div>
        <div class="th-actions">
          <div class="sel" id="selAssign">
            <button class="sel-btn" data-menu="assign">${svg("user", 14)} ${esc(memberName(c.assigned_to))} ${svg("chevDown", 13)}</button>
            <div class="sel-menu ${state.menu === "assign" ? "open" : ""}">
              <div class="sel-opt ${!c.assigned_to ? "on" : ""}" data-assign="">${svg("user", 14)} Unassigned</div>
              ${memberList().map((m) => `<div class="sel-opt ${c.assigned_to === m.id ? "on" : ""}" data-assign="${m.id}">${svg("user", 14)} ${esc(m.name)}</div>`).join("")}
            </div>
          </div>
          <div class="sel" id="selStatus">
            <button class="sel-btn" data-menu="status"><span class="cr-status-dot st-${c.status}"></span> ${STATUS_LABEL[c.status] || c.status} ${svg("chevDown", 13)}</button>
            <div class="sel-menu ${state.menu === "status" ? "open" : ""}">
              ${STATUSES.map(([v, l]) => `<div class="sel-opt ${c.status === v ? "on" : ""}" data-status="${v}"><span class="cr-status-dot st-${v}"></span> ${l}</div>`).join("")}
            </div>
          </div>
          <button class="icon-btn" id="ctxToggle" title="Contact details" aria-label="Contact details">${svg("user", 17)}</button>
        </div>
      </div>
      <div class="ibx-msgs" id="ibxMsgs">${renderMessages(msgs, ct)}</div>
      ${composer(c, ct)}
    </div>`;
  }

  function renderMessages(msgs, ct) {
    if (!msgs.length) return `<div class="ibx-blank" style="flex:1"><p>No messages yet — say salaam 👋</p></div>`;
    let out = ""; let lastDay = "";
    msgs.forEach((m) => {
      const dsep = daySep(m.created_at);
      if (dsep !== lastDay) { out += `<div class="msg-daysep">${esc(dsep)}</div>`; lastDay = dsep; }
      out += m.is_internal_note ? noteBubble(m) : msgBubble(m);
    });
    return out;
  }
  function msgBubble(m) {
    const out = m.direction === "outbound";
    const statusIco = m.status === "delivered" ? `<span class="msg-status delivered">${svg("checks", 13)}</span>`
      : m.status === "failed" ? `<span class="msg-status failed">${svg("alert", 12)} failed</span>`
      : `<span class="msg-status">${svg("check", 13)}</span>`;
    return `<div class="msg ${out ? "out" : "in"}">
      <div class="bubble">${linkify(esc(m.content || ""))}</div>
      <div class="msg-foot">
        <span class="msg-chan">${svg(CHAN_ICON[m.channel] || "msg", 11)}</span>
        <span>${clockTime(m.created_at)}</span>
        ${m.ai ? `<span class="ai-tag">${svg("sparkle", 10)} AI</span>` : ""}
        ${out ? statusIco : ""}
      </div>
    </div>`;
  }
  function noteBubble(m) {
    const body = String(m.content || "").replace(/@(\w+)/g, (_, h) => `<span class="mention">@${esc(h)}</span>`);
    return `<div class="msg note">
      <div class="bubble">
        <div class="note-head">${svg("note", 12)} Internal note · ${esc(memberName(m.sender || m.sender_id))}</div>
        ${body}
      </div>
      <div class="msg-foot"><span>${clockTime(m.created_at)}</span></div>
    </div>`;
  }
  function linkify(s) { return s.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>'); }

  /* ── Composer ───────────────────────────────────────────────────────────── */
  function composer(c, ct) {
    if (!canWrite()) {
      return `<div class="composer"><div class="cmp-gate info">${svg("lock", 15)} Your role can read this conversation but not reply. Ask an admin for staff access.</div></div>`;
    }
    const noteMode = state.composer.mode === "note";
    const chan = state.composer.channel || c.last_channel || c.channel;
    // SMS-only send is wired this session; email send defers with D-011.
    const sendable = noteMode || chan === "sms";
    const gate = !noteMode && chan !== "sms"
      ? `<div class="cmp-gate info">${svg("info", 15)} Sending on ${CHAN_LABEL[chan]} arrives with its provider (email → D-011). You can still add an internal note.</div>` : "";
    return `<div class="composer" id="composer">
      <div class="pop" id="cmpPop"></div>
      ${gate}
      <div class="cmp-mode">
        <button data-mode="reply" class="${!noteMode ? "on" : ""}">${svg("send", 13)} Reply</button>
        <button data-mode="note" class="${noteMode ? "on note-on" : ""}">${svg("note", 13)} Note</button>
      </div>
      <div class="cmp-box ${noteMode ? "note-mode" : ""}" id="cmpBox">
        <textarea id="cmpText" rows="1" placeholder="${noteMode ? "Write an internal note… use @ to mention a teammate" : "Type a message… press / for canned replies"}"></textarea>
        <div class="cmp-bar">
          ${!noteMode ? `<button class="cmp-chan" id="cmpChan" title="Reply channel">${svg(CHAN_ICON[chan] || "msg", 13)} ${CHAN_LABEL[chan] || chan}</button>` : ""}
          <button class="cmp-tool" id="cmpCanned" title="Canned replies (/)">${svg("slash", 16)}</button>
          <button class="cmp-tool" id="cmpAttach" title="Attach (Media Library — M06)" disabled>${svg("paperclip", 16)}</button>
          <span class="cmp-hint">${noteMode ? "Not sent to the contact" : "⏎ to send · ⇧⏎ new line"}</span>
          <button class="btn ${noteMode ? "btn-gold" : "btn-primary"} btn-sm cmp-send" id="cmpSend" ${sendable ? "" : "disabled"}>
            ${noteMode ? "Add note" : (svg("send", 13) + " Send")}
          </button>
        </div>
      </div>
    </div>`;
  }

  /* ── Context panel ──────────────────────────────────────────────────────── */
  function contextPanel(c) {
    if (!c) return `<div class="ibx-context ${state.ctxOpen ? "open" : ""}"></div>`;
    const ct = c.contact || c.contacts || null;
    const tl = convMessages(c.id).filter((m) => !m.is_internal_note).slice(-4).reverse();
    return `<div class="ibx-context ${state.ctxOpen ? "open" : ""}">
      <div class="ctx-card">
        <span class="avatar">${esc(initials(fullName(ct)))}</span>
        <div class="ctx-name">${esc(fullName(ct))}</div>
        <div class="ctx-sub">${esc(ct?.company || "—")}</div>
        <div class="ctx-actions">
          <button class="btn btn-ghost btn-sm" id="ctxProfile">${svg("user", 13)} Profile</button>
          <button class="btn btn-ghost btn-sm" id="ctxTag">${svg("tag", 13)} Tag</button>
        </div>
      </div>
      <div class="ctx-sec">
        <h4>Contact</h4>
        <div class="ctx-field">${svg("phone", 15)} Phone <span class="cf-val">${esc(ct?.phone || "—")}</span></div>
        <div class="ctx-field">${svg("mail", 15)} Email <span class="cf-val">${esc(ct?.email || "—")}</span></div>
        ${ct?.score != null ? `<div class="ctx-field">${svg("sparkle", 15)} Lead score <span class="cf-val">${ct.score}</span></div>` : ""}
      </div>
      ${(ct?.tags && ct.tags.length) ? `<div class="ctx-sec"><h4>Tags</h4><div style="display:flex;flex-wrap:wrap;gap:7px">${ct.tags.map((t) => `<span class="mini-tag"><span class="mt-dot" style="background:var(--gold-500)"></span>${esc(t)}</span>`).join("")}</div></div>` : ""}
      <div class="ctx-sec">
        <h4>Recent activity</h4>
        <div class="ctx-tl">
          ${tl.length ? tl.map((m) => `<div class="ctx-tli"><div class="tli-dot">${svg(CHAN_ICON[m.channel] || "msg")}</div>
            <div class="tli-body"><div class="tli-desc">${esc((m.direction === "outbound" ? "Sent" : "Received") + ": " + (m.content || "").slice(0, 64))}</div>
            <div class="tli-time">${relTime(m.created_at)}</div></div></div>`).join("") : `<p class="muted" style="font-size:12.5px">No activity yet.</p>`}
        </div>
      </div>
      <div class="ctx-sec">
        <h4>Quick actions</h4>
        <div class="ctx-act-row">
          <button class="btn btn-ghost btn-sm" id="ctxDeal">${svg("dollar", 13)} Create deal (M11)</button>
          <button class="btn btn-ghost btn-sm" id="ctxBook">${svg("calendar", 13)} Book appointment (M14)</button>
        </div>
      </div>
    </div>`;
  }

  /* ── Shared state blocks ────────────────────────────────────────────────── */
  function skeleton() {
    return `<div style="padding:32px"><div class="skeleton" style="width:280px;height:40px;border-radius:12px;margin-bottom:20px"></div>
      <div style="display:grid;grid-template-columns:340px 1fr;gap:16px;height:60vh">
        <div class="panel" style="padding:14px">${Array(6).fill('<div class="skeleton" style="height:56px;border-radius:12px;margin-bottom:12px"></div>').join("")}</div>
        <div class="panel">${Array(5).fill('<div class="skeleton" style="height:44px;border-radius:12px;margin-bottom:16px"></div>').join("")}</div>
      </div></div>`;
  }
  function errorBlock(msg) {
    return `<div style="padding:32px"><div class="panel" style="border-color:rgba(196,97,78,.4)"><div class="empty-state">
      <div class="es-ico" style="background:rgba(196,97,78,.12);color:var(--status-danger)">⚠</div>
      <h3>Something went wrong</h3><p>${esc(msg || "We couldn't load this workspace's inbox.")}</p>
      <button class="btn btn-ghost es-cta" id="retryBtn">Retry</button></div></div></div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     VIEW: SETTINGS · CHANNELS
     ═══════════════════════════════════════════════════════════════════════ */
  function viewChannels() {
    const connectedSms = (connected() ? state.channels : MOCK.channels).filter((c) => c.type === "sms");
    const tile = (cls, ico, name, desc, cta) => `<div class="chan-tile ${cta.soon ? "soon" : ""}">
      <div class="chan-ico ${cls}">${svg(ico, 20)}</div>
      <h3>${name}</h3><p>${desc}</p>
      <div class="chan-foot">${cta.html}</div></div>`;
    return `${previewStrip()}${pageHead("M12", `Connect a <em>channel</em>`, "Wire the places your contacts message you from. SMS is live this session; email arrives with the provider decision (D-011), and WhatsApp / Messenger / Instagram + the web-chat widget land in their provider weeks.")}
      <div class="chan-grid">
        ${tile("sms", "msg", "SMS · Twilio", "Two-way texting on your 10DLC number. Inbound is signature-verified; every send is consent- and A2P-gated and metered.", {
          html: connectedSms.length
            ? `<span class="pill success">connected</span><span class="muted" style="font-size:12px;margin-left:auto">${esc(connectedSms[0].external_ref || "")}</span>`
            : `<button class="btn btn-primary btn-sm" id="connectSms" ${isAdmin() ? "" : "disabled"}>Connect number</button>` })}
        ${tile("email", "mail", "Email", "Threaded email via Gmail OAuth or SMTP. Waiting on the email-provider decision — the schema is ready.", { soon: true, html: `<span class="pill plain">D-011 · soon</span>` })}
        ${tile("whatsapp", "phone", "WhatsApp", "Meta Cloud API with 24-hour session rules and template messages.", { soon: true, html: `<span class="pill plain">provider week</span>` })}
        ${tile("meta", "msg", "Messenger & Instagram", "Facebook + Instagram DMs through the unified Meta webhook.", { soon: true, html: `<span class="pill plain">provider week</span>` })}
        ${tile("webchat", "msg", "Web chat widget", "An embeddable bubble with pre-chat capture that creates a CRM contact.", { soon: true, html: `<span class="pill plain">soon</span>` })}
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     VIEW: SETTINGS · CANNED REPLIES
     ═══════════════════════════════════════════════════════════════════════ */
  function viewCanned() {
    const list = cannedList();
    const rows = list.length ? list.map((k) => `<div class="canned-row">
      <div class="cn-key">/${esc(k.shortcut)}</div>
      <div><div class="cn-title">${esc(k.title)}</div><div class="cn-text">${esc(k.content)}</div></div>
      <div class="cn-acts">
        <button class="icon-btn" data-canned-edit="${k.id}" title="Edit" ${canWrite() ? "" : "disabled"}>${svg("edit", 15)}</button>
        <button class="icon-btn" data-canned-del="${k.id}" title="Delete" ${canDelete() ? "" : "disabled"}>${svg("trash", 15)}</button>
      </div></div>`).join("")
      : `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("slash", 22)}</div><h3>No canned replies yet</h3>
          <p>Save your team's go-to responses and drop them into any thread by typing <b>/</b>. Use <span class="mono">{{first_name}}</span> to personalise.</p>
          <button class="btn btn-primary es-cta" id="newCanned">${svg("plus", 14)} New reply</button></div></div>`;
    return `${previewStrip()}${pageHead("M12", `Canned <em>replies</em>`, "Reusable snippets your team drops into a thread by typing / in the composer. Tokens like {{first_name}} are filled from the contact automatically.")}
      <div class="sec-head" style="display:flex;align-items:center;margin-bottom:14px"><h2 style="font-size:18px">${list.length} repl${list.length === 1 ? "y" : "ies"}</h2><div style="flex:1"></div>
        ${list.length ? `<button class="btn btn-primary btn-sm" id="newCanned">${svg("plus", 14)} New reply</button>` : ""}</div>
      ${rows}`;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ACTIONS
     ═══════════════════════════════════════════════════════════════════════ */
  function fillVars(text, ct) { return String(text || "").replace(/\{\{\s*first_name\s*\}\}/g, ct?.first_name || "there").replace(/\{\{\s*last_name\s*\}\}/g, ct?.last_name || ""); }

  async function doSend(convId) {
    if (state.sending) return;
    const box = $("#cmpText"); if (!box) return;
    const text = box.value.trim(); if (!text) return;
    const c = convById(convId); if (!c) return;
    const ct = c.contact || c.contacts || null;
    const noteMode = state.composer.mode === "note";

    if (noteMode) return doAddNote(convId, text);

    const chan = state.composer.channel || c.last_channel || c.channel;
    if (chan !== "sms") { toast("Only SMS sending is wired this session.", "info"); return; }

    if (!connected()) {
      // Demo: append optimistic outbound + simulate a delivered receipt.
      c.messages.push({ id: "m" + Date.now(), direction: "outbound", channel: "sms", content: fillVars(text, ct), created_at: iso(), status: "sent", is_internal_note: false });
      c.last_message_at = iso(); c.last_channel = "sms"; box.value = ""; autoGrow(box);
      renderThreadOnly(); toast("Message sent (demo).", "success");
      setTimeout(() => { const m = c.messages[c.messages.length - 1]; if (m) m.status = "delivered"; renderThreadOnly(); }, 900);
      return;
    }

    // Live: the ONLY channel-send path is the Edge Function (gates + meter).
    state.sending = true; setSendBusy(true);
    try {
      const cfg = getCfg(); const c2 = ensureClient();
      const { data: { session } } = await c2.auth.getSession();
      const res = await fetch(cfg.url.replace(/\/$/, "") + "/functions/v1/inbox-send", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.anon || "", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ workspace_id: state.workspaceId, conversation_id: convId, content: fillVars(text, ct), idempotency_key: cryptoRandom() }),
      });
      const env = await res.json().catch(() => ({}));
      if (!env.ok) return handleSendError(env);
      box.value = ""; autoGrow(box); toast("Message sent.", "success");
      await loadMessages(convId, true); renderThreadOnly();
    } catch (e) {
      toast("Send failed — check your connection.", "danger");
    } finally { state.sending = false; setSendBusy(false); }
  }

  function handleSendError(env) {
    const map = {
      a2p_not_registered: "SMS is blocked until your A2P 10DLC registration is approved (M05 → Compliance).",
      consent_blocked: "This contact hasn't opted in to SMS (or replied STOP). You can't text them until they opt in.",
      not_connected: "No Twilio number is connected. Add one in Settings → Channels.",
      quota_exceeded: "Your SMS quota for this period is used up — upgrade or add credits (M03).",
      channel_unavailable: "That channel isn't available to send on yet.",
      forbidden: "Your role can't send messages.",
    };
    const box = $("#composer");
    const msg = map[env.error] || env.message || "Message could not be sent.";
    if (box) {
      const g = el("div", "cmp-gate", `${svg("alert", 15)} ${esc(msg)}`);
      const old = box.querySelector(".cmp-gate"); if (old) old.remove();
      box.insertBefore(g, box.querySelector(".cmp-mode"));
    }
    toast(msg, "danger");
  }

  async function doAddNote(convId, text) {
    const c = convById(convId); if (!c) return;
    const mentions = parseMentions(text);
    if (!connected()) {
      c.messages.push({ id: "n" + Date.now(), direction: "outbound", channel: c.channel, content: text, created_at: iso(), is_internal_note: true, sender: "you", mentions });
      c.last_message_at = iso(); const box = $("#cmpText"); if (box) { box.value = ""; autoGrow(box); }
      renderThreadOnly();
      toast(mentions.length ? `Note added · notified ${mentions.length} teammate${mentions.length > 1 ? "s" : ""}.` : "Note added.", "success");
      return;
    }
    state.sending = true; setSendBusy(true);
    try {
      const c2 = ensureClient();
      const { error } = await c2.from("messages").insert({
        workspace_id: state.workspaceId, conversation_id: convId, direction: "outbound", channel: c.channel,
        content: text, is_internal_note: true, sender_id: state.user?.id, mentions,
      });
      if (error) throw error;
      const box = $("#cmpText"); if (box) { box.value = ""; autoGrow(box); }
      await loadMessages(convId, true); renderThreadOnly(); toast("Note added.", "success");
    } catch (e) { toast("Couldn't add the note: " + (e.message || e), "danger"); }
    finally { state.sending = false; setSendBusy(false); }
  }

  function parseMentions(text) {
    const names = (memberList() || []);
    const found = [];
    (text.match(/@([A-Za-z][\w-]*)/g) || []).forEach((tok) => {
      const h = tok.slice(1).toLowerCase();
      const m = names.find((n) => n.id.toLowerCase() === h || n.name.toLowerCase().split(/\s+/)[0] === h);
      if (m && !found.includes(m.id)) found.push(m.id);
    });
    return found;
  }
  function cryptoRandom() { try { return crypto.randomUUID(); } catch (e) { return "ik-" + Date.now() + "-" + Math.random().toString(36).slice(2); } }

  async function setStatus(convId, status) {
    const c = convById(convId); if (!c) return;
    c.status = status; state.menu = null;
    if (connected()) { try { await ensureClient().from("conversations").update({ status }).eq("id", convId); } catch (e) { toast("Update failed: " + e.message, "danger"); } }
    render(); toast(`Marked ${STATUS_LABEL[status]}.`, "success");
  }
  async function setAssignee(convId, uid) {
    const c = convById(convId); if (!c) return;
    c.assigned_to = uid || null; state.menu = null;
    if (connected()) { try { await ensureClient().from("conversations").update({ assigned_to: uid || null }).eq("id", convId); } catch (e) { toast("Update failed: " + e.message, "danger"); } }
    render(); toast(uid ? `Assigned to ${memberName(uid)}.` : "Unassigned.", "success");
  }
  async function markRead(convId) {
    const c = convById(convId); if (!c || !(c.unread_count > 0)) return;
    c.unread_count = 0;
    if (connected()) { try { await ensureClient().rpc("clear_unread", { p_ws: state.workspaceId, p_conv: convId }); } catch (e) {} }
  }

  /* ── Canned + mention popover ───────────────────────────────────────────── */
  function openCanned(prefix) {
    const items = cannedList().filter((k) => !prefix || k.shortcut.toLowerCase().startsWith(prefix.toLowerCase()));
    state.pop = { type: "canned", items, cursor: 0 };
    renderPop();
  }
  function openMention(prefix) {
    const items = memberList().filter((m) => !prefix || m.name.toLowerCase().includes(prefix.toLowerCase()) || m.id.toLowerCase().startsWith(prefix.toLowerCase()));
    state.pop = { type: "mention", items, cursor: 0 };
    renderPop();
  }
  function closePop() { state.pop = null; const p = $("#cmpPop"); if (p) p.classList.remove("open"); }
  function renderPop() {
    const p = $("#cmpPop"); if (!p) return;
    const pop = state.pop; if (!pop || !pop.items.length) { closePop(); return; }
    if (pop.type === "canned") {
      p.innerHTML = `<div class="pop-head">Canned replies</div>` + pop.items.map((k, i) =>
        `<div class="pop-item ${i === pop.cursor ? "cursor" : ""}" data-pop="${i}"><span class="pi-key">/${esc(k.shortcut)}</span>
          <div class="pi-body"><div class="pi-title">${esc(k.title)}</div><div class="pi-text">${esc(k.content)}</div></div></div>`).join("");
    } else {
      p.innerHTML = `<div class="pop-head">Mention a teammate</div>` + pop.items.map((m, i) =>
        `<div class="pop-item ${i === pop.cursor ? "cursor" : ""}" data-pop="${i}"><span class="avatar pi-av">${esc(initials(m.name))}</span>
          <div class="pi-body"><div class="pi-title">${esc(m.name)}</div></div></div>`).join("");
    }
    p.classList.add("open");
    $$(".pop-item", p).forEach((it) => it.addEventListener("mousedown", (e) => { e.preventDefault(); choosePop(Number(it.dataset.pop)); }));
  }
  function choosePop(i) {
    const pop = state.pop; if (!pop) return;
    const box = $("#cmpText"); if (!box) return;
    const item = pop.items[i]; if (!item) return;
    const val = box.value; const caret = box.selectionStart;
    const before = val.slice(0, caret);
    if (pop.type === "canned") {
      const c = convById(state.activeConvId); const ct = c ? (c.contact || c.contacts) : null;
      const newBefore = before.replace(/\/[\w-]*$/, fillVars(item.content, ct));
      box.value = newBefore + val.slice(caret);
    } else {
      const first = item.name.split(/\s+/)[0];
      const newBefore = before.replace(/@[\w-]*$/, "@" + first + " ");
      box.value = newBefore + val.slice(caret);
    }
    closePop(); box.focus(); autoGrow(box);
  }

  /* ── Small DOM helpers ──────────────────────────────────────────────────── */
  function autoGrow(box) { box.style.height = "auto"; box.style.height = Math.min(box.scrollHeight, 180) + "px"; }
  function setSendBusy(b) { const s = $("#cmpSend"); if (s) { s.disabled = b; } }
  function scrollMsgs() { const m = $("#ibxMsgs"); if (m) m.scrollTop = m.scrollHeight; }
  function renderThreadOnly() {
    const c = convById(state.activeConvId); const ct = c ? (c.contact || c.contacts) : null;
    const m = $("#ibxMsgs"); if (m && c) { m.innerHTML = renderMessages(convMessages(c.id), ct); scrollMsgs(); }
    // refresh the row snippet + context timeline without a full re-render
    const list = $(".ibx-rows"); if (list && c) { const row = list.querySelector(`[data-conv="${c.id}"]`); if (row) row.outerHTML = convRow(c, c); }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     LIVE DATA
     ═══════════════════════════════════════════════════════════════════════ */
  function pickActive(rows) {
    let id = null; try { id = localStorage.getItem(ACTIVE_KEY); } catch (e) {}
    return rows.find((r) => r.id === id) || rows[0] || null;
  }
  async function loadMessages(convId, force) {
    if (!connected()) return;
    if (state.messages[convId] && !force) return;
    const c2 = ensureClient();
    const { data } = await c2.from("messages").select("*").eq("conversation_id", convId).order("created_at", { ascending: true });
    state.messages[convId] = data || [];
  }
  let rtChannel = null;
  function subscribeRealtime() {
    const c2 = ensureClient(); if (!c2 || !state.workspaceId) return;
    if (rtChannel) { try { c2.removeChannel(rtChannel); } catch (e) {} rtChannel = null; }
    rtChannel = c2.channel("m12-" + state.workspaceId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "workspace_id=eq." + state.workspaceId }, async (payload) => {
        const msg = payload.new; if (!msg) return;
        if (state.messages[msg.conversation_id]) state.messages[msg.conversation_id].push(msg);
        await loadConversations();
        if (msg.conversation_id === state.activeConvId) { renderThreadOnly(); } else if (msg.direction === "inbound") { toast("New message received", "info"); render(); } else { render(); }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: "workspace_id=eq." + state.workspaceId }, async () => { await loadConversations(); render(); })
      .subscribe();
  }
  async function loadConversations() {
    const c2 = ensureClient();
    const { data } = await c2.from("conversations")
      .select("id, workspace_id, contact_id, channel, status, assigned_to, last_message_at, last_channel, unread_count, contacts:contact_id(id, first_name, last_name, email, phone, lead_score)")
      .order("last_message_at", { ascending: false, nullsFirst: false });
    state.conversations = (data || []).map((c) => ({ ...c, contact: c.contacts ? { ...c.contacts, score: c.contacts.lead_score } : null }));
  }
  async function loadMembers() {
    const c2 = ensureClient();
    const { data } = await c2.from("memberships").select("user_id, role, profiles:user_id(name, email)").eq("workspace_id", state.workspaceId).eq("status", "active");
    state.members = (data || []).map((m) => ({ id: m.user_id, name: m.profiles?.name || m.profiles?.email || String(m.user_id).slice(0, 8), role: m.role }));
    const me = (data || []).find((m) => m.user_id === state.user?.id); if (me) state.role = me.role;
  }
  async function loadCanned() { const { data } = await ensureClient().from("canned_responses").select("*").order("shortcut"); state.canned = data || []; }
  async function loadChannels() { const { data } = await ensureClient().from("channels").select("*").order("created_at"); state.channels = data || []; }

  async function boot() {
    if (connected()) {
      state.loading = true; state.error = null; render();
      try {
        const c2 = ensureClient();
        const { data: { user } } = await c2.auth.getUser();
        state.user = user;
        if (!user) { state.loading = false; state.loaded = true; render(); toast("Sign in to load your inbox.", "info"); return; }
        const { data: wsRows, error: wsErr } = await c2.from("workspaces").select("id,name").order("created_at");
        if (wsErr) throw wsErr;
        const active = pickActive(wsRows || []);
        if (!active) { state.loading = false; state.loaded = true; render(); return; }
        state.workspaceId = active.id; state.workspaceName = active.name;
        await Promise.all([loadMembers(), loadCanned(), loadChannels()]);
        await loadConversations();
        const first = convById(state.activeConvId) || state.conversations[0];
        if (first) await loadMessages(first.id, true);
        subscribeRealtime();
        state.loading = false; state.loaded = true; render();
      } catch (e) {
        state.loading = false; state.error = e.message || String(e); state.loaded = true; render();
      }
    } else {
      state.loaded = true; state.loading = false; render();
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ROUTER + RENDER
     ═══════════════════════════════════════════════════════════════════════ */
  function currentRoute() {
    const h = (location.hash || "").replace(/^#/, "").split("?")[0];
    const seg = h.split("/").filter(Boolean);
    if (seg[0] === "settings") {
      if (seg[1] === "canned") return { key: "canned", render: () => ({ flush: false, html: viewCanned() }) };
      return { key: "channels", render: () => ({ flush: false, html: viewChannels() }) };
    }
    const id = seg[0] === "inbox" ? seg[1] : null;
    return { key: "inbox", id, render: () => viewInbox(id) };
  }
  function render() {
    const app = $("#app"); const r = currentRoute();
    const out = r.render();
    app.innerHTML = shell(r.key, out.html, out.flush);
    afterShell();
    wireView(r.key, r.id);
    if (!reduce) nextTick(() => document.body.classList.add("js-ready")); else document.body.classList.add("js-ready");
    if (r.key === "inbox") { scrollMsgs(); if (state.activeConvId) markRead(state.activeConvId); }
  }
  function afterShell() {
    setTheme(root.getAttribute("data-theme"));
    $("#themeToggle").addEventListener("click", () => setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"));
    $("#openConnect2").addEventListener("click", openDrawer);
    const burger = $("#railBurger"); if (burger) burger.addEventListener("click", () => $("#rail").classList.toggle("open"));
    $$("[data-hash]").forEach((n) => n.addEventListener("click", () => { location.hash = n.dataset.hash; $("#rail")?.classList.remove("open"); }));
    $$("[data-preview]").forEach((b) => b.addEventListener("click", () => { state.previewState = b.dataset.preview; render(); }));
    const retry = $("#retryBtn"); if (retry) retry.addEventListener("click", () => { state.previewState = "default"; boot(); });
  }

  function wireView(key, id) {
    if (key === "inbox") return wireInbox();
    if (key === "channels") return wireChannels();
    if (key === "canned") return wireCanned();
  }

  function wireInbox() {
    // search
    const s = $("#ibxSearch"); if (s) s.addEventListener("input", debounce(() => { state.search = s.value; renderListOnly(); }, 160));
    // filters
    $$(".fchip").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.f, v = b.dataset.v;
      if (k === "unread") state.filter.unread = !state.filter.unread;
      else if (k === "assignee") state.filter.assignee = state.filter.assignee === v ? "all" : v;
      else state.filter[k] = state.filter[k] === v ? "all" : v;
      renderListOnly();
    }));
    // rows
    $$(".conv-row").forEach((row) => row.addEventListener("click", () => {
      const cid = row.dataset.conv; try { localStorage.setItem(ACTIVE_KEY, cid); } catch (e) {}
      if (connected()) loadMessages(cid).then(() => { location.hash = "#/inbox/" + cid; });
      else location.hash = "#/inbox/" + cid;
    }));
    // back (mobile)
    const back = $("#ibxBack"); if (back) back.addEventListener("click", () => { location.hash = "#/inbox"; });
    // context toggle
    const ct = $("#ctxToggle"); if (ct) ct.addEventListener("click", () => { state.ctxOpen = !state.ctxOpen; $(".ibx-context")?.classList.toggle("open", state.ctxOpen); });
    // status / assign menus
    $$("[data-menu]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); const m = b.dataset.menu; state.menu = state.menu === m ? null : m; render(); }));
    $$("[data-status]").forEach((o) => o.addEventListener("click", () => setStatus(state.activeConvId, o.dataset.status)));
    $$("[data-assign]").forEach((o) => o.addEventListener("click", () => setAssignee(state.activeConvId, o.dataset.assign)));
    document.addEventListener("click", closeMenus, { once: true });
    // composer
    wireComposer();
    // ctx quick actions (informational scaffolds)
    ["ctxProfile", "ctxTag", "ctxDeal", "ctxBook"].forEach((idn) => { const b = $("#" + idn); if (b) b.addEventListener("click", () => toast("Opens the linked module — wired as those flows connect.", "info")); });
  }
  function closeMenus() { if (state.menu) { state.menu = null; render(); } }

  function wireComposer() {
    const box = $("#cmpText"); if (!box) return;
    autoGrow(box);
    $$("[data-mode]").forEach((b) => b.addEventListener("click", () => { state.composer.mode = b.dataset.mode; closePop(); render(); const t = $("#cmpText"); if (t) t.focus(); }));
    const cbx = $("#cmpBox");
    box.addEventListener("focus", () => cbx && cbx.classList.add("focus"));
    box.addEventListener("blur", () => { cbx && cbx.classList.remove("focus"); setTimeout(closePop, 120); });
    box.addEventListener("input", () => { autoGrow(box); onComposerInput(box); });
    box.addEventListener("keydown", (e) => onComposerKey(e, box));
    const send = $("#cmpSend"); if (send) send.addEventListener("click", () => doSend(state.activeConvId));
    const cann = $("#cmpCanned"); if (cann) cann.addEventListener("click", () => { box.focus(); if (state.pop) closePop(); else openCanned(""); });
    const chan = $("#cmpChan"); if (chan) chan.addEventListener("click", cycleChannel);
    const attach = $("#cmpAttach"); if (attach) attach.addEventListener("click", () => toast("Attachments arrive with the Media Library (M06).", "info"));
  }
  function onComposerInput(box) {
    const before = box.value.slice(0, box.selectionStart);
    const noteMode = state.composer.mode === "note";
    const slash = before.match(/(?:^|\s)\/([\w-]*)$/);
    const at = before.match(/(?:^|\s)@([\w-]*)$/);
    if (!noteMode && slash) return openCanned(slash[1]);
    if (noteMode && at) return openMention(at[1]);
    closePop();
  }
  function onComposerKey(e, box) {
    if (state.pop) {
      if (e.key === "ArrowDown") { e.preventDefault(); state.pop.cursor = Math.min(state.pop.cursor + 1, state.pop.items.length - 1); renderPop(); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); state.pop.cursor = Math.max(state.pop.cursor - 1, 0); renderPop(); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); choosePop(state.pop.cursor); return; }
      if (e.key === "Escape") { e.preventDefault(); closePop(); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(state.activeConvId); }
  }
  function cycleChannel() {
    // Only SMS is sendable this session; email/whatsapp are shown as unavailable.
    const order = ["sms", "email", "whatsapp"]; const cur = state.composer.channel || (convById(state.activeConvId) || {}).last_channel || "sms";
    state.composer.channel = order[(order.indexOf(cur) + 1) % order.length];
    render(); const t = $("#cmpText"); if (t) t.focus();
  }

  function wireChannels() {
    const b = $("#connectSms"); if (b) b.addEventListener("click", () => toast(connected() ? "Connect Twilio in Integrations (M41) → store creds in Vault." : "Connect a project to wire Twilio.", "info"));
  }
  function wireCanned() {
    const nb = $("#newCanned"); if (nb) nb.addEventListener("click", () => cannedModal(null));
    $$("[data-canned-edit]").forEach((b) => b.addEventListener("click", () => cannedModal(b.dataset.cannedEdit)));
    $$("[data-canned-del]").forEach((b) => b.addEventListener("click", () => deleteCanned(b.dataset.cannedDel)));
  }

  /* ── Canned CRUD modal ──────────────────────────────────────────────────── */
  function cannedModal(id) {
    const k = id ? cannedList().find((x) => x.id === id) : { shortcut: "", title: "", content: "" };
    const root = $("#modalRoot");
    root.innerHTML = `<div class="modal-scrim open" id="cannedScrim"><div class="modal-card">
      <div class="mc-head"><div class="mc-ico">${svg("slash", 18)}</div>
        <div><h3>${id ? "Edit" : "New"} canned reply</h3><div class="mc-sub">Type / in a thread to insert it. {{first_name}} personalises.</div></div>
        <button class="icon-btn mc-close" id="cannedClose">${svg("x", 16)}</button></div>
      <div class="form-field" style="margin-bottom:14px"><label class="label">Shortcut</label><input id="cnShortcut" placeholder="greeting" value="${esc(k.shortcut || "")}"></div>
      <div class="form-field" style="margin-bottom:14px"><label class="label">Title</label><input id="cnTitle" placeholder="Warm greeting" value="${esc(k.title || "")}"></div>
      <div class="form-field"><label class="label">Message</label><textarea id="cnContent" rows="4" placeholder="Assalamu alaikum {{first_name}} — thanks for reaching out!">${esc(k.content || "")}</textarea></div>
      <div class="mc-foot"><button class="btn btn-ghost" id="cannedCancel">Cancel</button><button class="btn btn-primary" id="cannedSave">${id ? "Save" : "Create"}</button></div>
    </div></div>`;
    const close = () => { root.innerHTML = ""; };
    $("#cannedClose").addEventListener("click", close); $("#cannedCancel").addEventListener("click", close);
    $("#cannedScrim").addEventListener("click", (e) => { if (e.target.id === "cannedScrim") close(); });
    $("#cannedSave").addEventListener("click", async () => {
      const rec = { shortcut: $("#cnShortcut").value.trim().replace(/^\//, ""), title: $("#cnTitle").value.trim(), content: $("#cnContent").value.trim() };
      if (!rec.shortcut || !rec.content) { toast("Shortcut and message are required.", "danger"); return; }
      if (connected()) {
        try {
          const c2 = ensureClient();
          if (id) await c2.from("canned_responses").update(rec).eq("id", id);
          else await c2.from("canned_responses").insert({ ...rec, workspace_id: state.workspaceId, created_by: state.user?.id });
          await loadCanned();
        } catch (e) { toast("Save failed: " + e.message, "danger"); return; }
      } else {
        if (id) Object.assign(MOCK.canned.find((x) => x.id === id), rec);
        else MOCK.canned.push({ id: "k" + Date.now(), ...rec });
      }
      close(); render(); toast(id ? "Reply updated." : "Reply created.", "success");
    });
  }
  async function deleteCanned(id) {
    if (connected()) { try { await ensureClient().from("canned_responses").delete().eq("id", id); await loadCanned(); } catch (e) { toast("Delete failed: " + e.message, "danger"); return; } }
    else { const i = MOCK.canned.findIndex((x) => x.id === id); if (i >= 0) MOCK.canned.splice(i, 1); }
    render(); toast("Reply deleted.", "success");
  }

  /* ── Partial re-renders ─────────────────────────────────────────────────── */
  function renderListOnly() {
    const list = filtered(); const active = convById(state.activeConvId);
    const wrap = $(".ibx-list"); if (!wrap) return render();
    const parent = wrap.parentElement; parent.querySelector(".ibx-list").outerHTML = listPanel(list, active, st("empty") || (connected() && conversations().length === 0));
    // re-wire the new list nodes
    const s = $("#ibxSearch"); if (s) { s.addEventListener("input", debounce(() => { state.search = s.value; renderListOnly(); }, 160)); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    $$(".fchip").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.f, v = b.dataset.v;
      if (k === "unread") state.filter.unread = !state.filter.unread;
      else if (k === "assignee") state.filter.assignee = state.filter.assignee === v ? "all" : v;
      else state.filter[k] = state.filter[k] === v ? "all" : v;
      renderListOnly();
    }));
    $$(".conv-row").forEach((row) => row.addEventListener("click", () => {
      const cid = row.dataset.conv; try { localStorage.setItem(ACTIVE_KEY, cid); } catch (e) {}
      if (connected()) loadMessages(cid).then(() => { location.hash = "#/inbox/" + cid; }); else location.hash = "#/inbox/" + cid;
    }));
  }

  /* ── Utilities ──────────────────────────────────────────────────────────── */
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  // Global keyboard shortcuts (r reply · e resolve · a assign · / canned), when
  // not typing into a field (PRD_M12 §5).
  document.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || e.metaKey || e.ctrlKey) return;
    if (currentRoute().key !== "inbox" || !state.activeConvId) return;
    if (e.key === "r") { e.preventDefault(); const t = $("#cmpText"); if (t) t.focus(); }
    else if (e.key === "e") { e.preventDefault(); setStatus(state.activeConvId, "resolved"); }
    else if (e.key === "a") { e.preventDefault(); state.menu = "assign"; render(); }
    else if (e.key === "/") { e.preventDefault(); const t = $("#cmpText"); if (t) { t.focus(); openCanned(""); } }
  });

  window.addEventListener("hashchange", () => { state.menu = null; closePop(); render(); });

  boot();
})();
