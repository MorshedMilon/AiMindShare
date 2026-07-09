/* ══════════════════════════════════════════════════════════════════════════
   m15-forms.js — AiMindShare Module M15 · Forms & Surveys
   Vanilla hash-routed app on Supabase. A premium drag-and-drop form / survey /
   quiz builder: field palette → SortableJS canvas → field-settings panel, with
   Build · Logic · Routing · Design tabs. Save writes the four jsonb blobs the
   live submit_form() pipeline consumes (fields_json / logic_json / settings_json
   / routing_json). Publish flips status='published' + shows the embed snippet.
   The results screen reads form_analytics() (funnel + per-step + A/B) and the
   submissions table (CSV export via forms-export). Mockup mode drives every
   screen state (default/empty/loading/error/success) with honest SAMPLE data
   when no Supabase project is connected — never fabricated live numbers.
   Tokens-only styling; 3 fonts; calm loaders (no sweep); dark = no stars.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (t, c) => { const n = document.createElement(t); if (c) n.className = c; return n; };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const fmtInt = (n) => new Intl.NumberFormat("en-US").format(Number(n) || 0);
  const pct = (n) => (Number(n) || 0).toFixed(1) + "%";
  const uid = (p) => (p || "f") + Math.random().toString(36).slice(2, 8);
  const root = document.documentElement;
  const THEME_KEY = "aimindshare-theme";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── Theme (own key per D-012; light default per D-007). NO star generator:
        session rule = no stars/dots in dark; atmosphere is grid + orbs only. ── */
  const setTheme = (t) => { root.setAttribute("data-theme", t); try { localStorage.setItem(THEME_KEY, t); } catch (e) {} const i = $("#themeIco"); if (i) i.textContent = t === "dark" ? "☀" : "☾"; if (state && state.chart) drawResultsCharts(); };

  /* ── Config + Supabase client (anon key only, Law 3) ────────────────────── */
  const CFG_KEY = "aimindshare-supabase";
  function getCfg() {
    try { const s = JSON.parse(localStorage.getItem(CFG_KEY) || "null"); if (s && s.url) return s; } catch (e) {}
    const g = window.AIMINDSHARE_CONFIG;
    if (g && g.SUPABASE_URL && !/YOUR-/.test(g.SUPABASE_URL)) return { url: g.SUPABASE_URL, anon: g.SUPABASE_ANON_KEY };
    return null;
  }
  let client = null;
  function ensureClient() { const cfg = getCfg(); if (!cfg || !window.supabase || !window.supabase.createClient) { client = null; return null; } if (!client) client = window.supabase.createClient(cfg.url, cfg.anon || "", { auth: { persistSession: true } }); return client; }
  const connected = () => !!getCfg() && !!window.supabase;

  /* ── Connect drawer ─────────────────────────────────────────────────────── */
  const drawer = $("#drawer"), scrim = $("#scrim");
  const openDrawer = () => { const c = getCfg(); if (c) { $("#inpUrl").value = c.url; $("#inpAnon").value = c.anon || ""; } drawer.classList.add("open"); scrim.classList.add("open"); };
  const closeDrawer = () => { drawer.classList.remove("open"); scrim.classList.remove("open"); };
  $("#closeDrawer").addEventListener("click", closeDrawer);
  scrim.addEventListener("click", closeDrawer);
  $("#saveCfg").addEventListener("click", async () => { const url = $("#inpUrl").value.trim(), anon = $("#inpAnon").value.trim(); if (!url) return $("#inpUrl").focus(); try { localStorage.setItem(CFG_KEY, JSON.stringify({ url, anon })); } catch (e) {} client = null; closeDrawer(); state.loaded = false; await boot(); });
  $("#clearCfg").addEventListener("click", async () => { try { localStorage.removeItem(CFG_KEY); } catch (e) {} client = null; state.loaded = false; await boot(); });

  /* ── Toast ──────────────────────────────────────────────────────────────── */
  function toast(msg, kind = "info") { const wrap = $("#toasts"); const t = el("div", "toast toast-" + kind); t.innerHTML = `<span>${svg(kind === "success" ? "check" : kind === "error" ? "alert" : "info", 15)}</span><span>${esc(msg)}</span>`; wrap.appendChild(t); setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 260); }, 3000); }

  /* ── Icon set (Lucide-style, stroke-based) ──────────────────────────────── */
  const ICONS = {
    forms: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    text: '<path d="M4 7V5h16v2M9 5v14M7 19h4"/>',
    email: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M4 7l8 6 8-6"/>',
    phone: '<path d="M5 4h4l1.5 5-2 1.5a11 11 0 0 0 5 5l1.5-2 5 1.5v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1"/>',
    hash: '<path d="M5 9h14M5 15h14M9 4l-2 16M17 4l-2 16"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 9h17M8 3v4M16 3v4"/>',
    paragraph: '<path d="M4 6h16M4 10h16M4 14h12M4 18h8"/>',
    dropdown: '<rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="M9 11l3 3 3-3"/>',
    radio: '<circle cx="7" cy="7" r="3"/><circle cx="7" cy="7" r="1"/><circle cx="7" cy="17" r="3"/><path d="M13 6h7M13 8h4M13 16h7M13 18h4"/>',
    checkbox: '<rect x="4" y="5" width="6" height="6" rx="1.5"/><path d="M5.5 8l1.2 1.2L9 7"/><path d="M14 6h6M14 8h4"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><path d="M14 15h6M14 17h4"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="4" cy="18" r="1.2"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M12 12v5M9.5 14.5 12 12l2.5 2.5"/>',
    rating: '<path d="M12 3l2.5 6.5L21 10l-5 4.2L17.5 21 12 17.3 6.5 21 8 14.2 3 10l6.5-.5z"/>',
    heading: '<path d="M6 4v16M18 4v16M6 12h12"/>',
    consent: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
    hidden: '<path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7"/><path d="M4 4l16 16"/>',
    logic: '<path d="M7 4v6a5 5 0 0 0 5 5h5M17 4v16"/><circle cx="7" cy="4" r="2"/><circle cx="17" cy="4" r="2"/><circle cx="17" cy="20" r="2"/>',
    route: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M6 8.5v4a4 4 0 0 0 4 4h5.5"/>',
    paint: '<path d="M12 3a9 9 0 1 0 0 18 2.5 2.5 0 0 0 2.5-2.5 2 2 0 0 1 2-2H19a2 2 0 0 0 2-2 9 9 0 0 0-9-9.5"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/>',
    chart: '<path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><circle cx="17.5" cy="9" r="2.4"/><path d="M15 20c0-2.5 1.5-4 4-4"/>',
    funnel: '<path d="M3 5h18l-7 8v6l-4-2v-4z"/>',
    grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', trash: '<path d="M5 7h14M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>', check: '<path d="M5 12l5 5 9-11"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>', dots: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    back: '<path d="M15 6l-6 6 6 6"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M9 12h6"/>',
    edit: '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="M14 6l4 4"/>', results: '<path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6"/>',
    eye: '<path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7"/><circle cx="12" cy="12" r="3"/>',
    rocket: '<path d="M12 3c4 2 5 6 5 9l-3 3H10L7 12c0-3 1-7 5-9z"/><path d="M7 15l-2 4 4-2M12 9v.5"/>',
    link: '<path d="M9 15l6-6M10 6l1-1a4 4 0 0 1 6 6l-1 1M14 18l-1 1a4 4 0 0 1-6-6l1-1"/>',
    export: '<path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3M12 4v11M8 8l4-4 4 4"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    split: '<path d="M6 3v6a6 6 0 0 0 6 6h6M6 21v-6M18 9l3-3-3-3"/>',
    quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .8-1 1.7M12 16.5v.5"/>',
    survey: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8h.5M8 12h.5M8 16h.5M11 8h5M11 12h5M11 16h4"/>',
  };
  function svg(name, size = 18) { const p = ICONS[name] || ICONS.info; return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`; }

  /* ── Field-type catalog (the palette). type ∈ the DATA CONTRACT set. ─────── */
  const FIELD_TYPES = [
    { t: "text", label: "Short text", icon: "text", grp: "input" },
    { t: "email", label: "Email", icon: "email", grp: "input", map: "email" },
    { t: "phone", label: "Phone", icon: "phone", grp: "input", map: "phone" },
    { t: "number", label: "Number", icon: "hash", grp: "input" },
    { t: "date", label: "Date", icon: "calendar", grp: "input" },
    { t: "textarea", label: "Long text", icon: "paragraph", grp: "input" },
    { t: "dropdown", label: "Dropdown", icon: "dropdown", grp: "choice", opts: true },
    { t: "radio", label: "Radio", icon: "radio", grp: "choice", opts: true },
    { t: "checkbox", label: "Checkboxes", icon: "checkbox", grp: "choice", opts: true },
    { t: "multiselect", label: "Multi-select", icon: "list", grp: "choice", opts: true },
    { t: "rating", label: "Rating", icon: "rating", grp: "choice" },
    { t: "file", label: "File upload", icon: "file", grp: "special", disabled: "after M06" },
    { t: "consent", label: "Consent", icon: "consent", grp: "special" },
    { t: "heading", label: "Heading", icon: "heading", grp: "layout" },
    { t: "paragraph", label: "Paragraph", icon: "paragraph", grp: "layout" },
    { t: "hidden", label: "Hidden", icon: "hidden", grp: "layout" },
  ];
  const TYPE_META = Object.fromEntries(FIELD_TYPES.map((f) => [f.t, f]));
  const hasOptions = (t) => !!TYPE_META[t]?.opts;
  const isLayout = (t) => ["heading", "paragraph"].includes(t);
  // Contact columns a field can map to (map_to), plus a "custom field" free key.
  const MAP_TARGETS = [
    { v: "", l: "— not mapped —" }, { v: "name", l: "Contact · Name" }, { v: "email", l: "Contact · Email" },
    { v: "phone", l: "Contact · Phone" }, { v: "company", l: "Contact · Company" }, { v: "custom", l: "Custom field…" },
  ];
  const LOGIC_OPS = [{ v: "eq", l: "equals" }, { v: "neq", l: "does not equal" }];

  /* ── Design accent swatches — TOKEN NAMES ONLY (zero raw hex, Gate 6) ───── */
  const ACCENTS = [
    { v: "teal", l: "Teal", token: "--teal-500" }, { v: "gold", l: "Gold", token: "--gold-500" },
    { v: "deep", l: "Deep teal", token: "--teal-700" }, { v: "ink", l: "Ink", token: "--ink-900" },
  ];
  const LAYOUTS = [{ v: "stacked", l: "Stacked" }, { v: "card", l: "Card" }, { v: "compact", l: "Compact" }];

  /* ── Mockup data (honest SAMPLE content; labelled; never in a live path) ── */
  const MOCK = (() => {
    const now = Date.now();
    const iso = (d) => new Date(now - d * 864e5).toISOString();
    const members = [
      { id: "u1", name: "Aisha Rahman" }, { id: "u2", name: "Yusuf Karim" }, { id: "u3", name: "Layla Haddad" },
    ];
    const contactUpsertSample = "Contact upserted · consent recorded · form.submitted fired";
    // A demonstrably real "Contact Us" starter + a multi-step survey + a scored quiz.
    const forms = [
      {
        id: "form-contact", name: "Contact Us", type: "form", status: "published",
        views: 1840, subs: 214, created_at: iso(28), published_at: iso(26),
        fields_json: [
          { key: "name", type: "text", label: "Your name", placeholder: "Jane Doe", required: true, map_to: "name" },
          { key: "email", type: "email", label: "Email", placeholder: "jane@company.com", required: true, map_to: "email" },
          { key: "message", type: "textarea", label: "How can we help?", placeholder: "A few words…", required: true },
          { key: "consent1", type: "consent", label: "Marketing consent", required: true, consent_text: "I agree to receive occasional updates from AiMindShare and can unsubscribe anytime." },
        ],
        logic_json: [],
        settings_json: { design: { accent: "teal", button_text: "Send message", layout: "card" }, spam: { honeypot: "hp_url", min_ms: 1500 }, source_tag: "Contact form" },
        routing_json: { assign_owner: true, round_robin_ids: ["u1", "u2"], tags: ["inbound"], create_deal: false, thank_you: "Thanks — we'll be in touch within one business day." },
      },
      {
        id: "form-nps", name: "Customer NPS Survey", type: "survey", status: "published",
        views: 920, subs: 331, created_at: iso(14), published_at: iso(12),
        fields_json: [
          { key: "score", type: "rating", label: "How likely are you to recommend us?", required: true },
          { key: "reason", type: "textarea", label: "What's the main reason for your score?" },
          { key: "role", type: "dropdown", label: "Your role", options: ["Owner", "Manager", "Team member"] },
        ],
        logic_json: [{ when: { field: "score", op: "neq", value: "10" }, action: "show", target: "reason" }],
        settings_json: { design: { accent: "gold", button_text: "Submit feedback", layout: "stacked" }, steps: [{ title: "Your score", field_keys: ["score"] }, { title: "Tell us more", field_keys: ["reason", "role"] }], spam: { honeypot: "hp_url", min_ms: 1200 }, anonymous: true, source_tag: "NPS" },
        routing_json: { redirect: "", thank_you: "Thank you for your feedback." },
      },
      {
        id: "form-quiz", name: "Which Plan Fits You?", type: "quiz", status: "draft",
        views: 0, subs: 0, created_at: iso(3), published_at: null,
        fields_json: [
          { key: "team", type: "radio", label: "How big is your team?", required: true, options: ["Just me", "2–10", "10+"] },
          { key: "goal", type: "radio", label: "Primary goal?", required: true, options: ["Get leads", "Automate", "Scale ops"] },
        ],
        logic_json: [],
        settings_json: {
          design: { accent: "deep", button_text: "See my plan", layout: "card" }, spam: { honeypot: "hp_url", min_ms: 1500 },
          scoring: { team: { "Just me": 1, "2–10": 2, "10+": 3 }, goal: { "Get leads": 1, "Automate": 2, "Scale ops": 3 } },
          tiers: [{ min: 0, max: 2, label: "Starter", redirect: "", message: "The Starter plan is a great fit." }, { min: 3, max: 4, label: "Growth", redirect: "", message: "Growth gives you room to scale." }, { min: 5, max: 6, label: "Scale", redirect: "", message: "Scale is built for teams like yours." }],
          source_tag: "Plan quiz",
        },
        routing_json: { create_deal: true, value_field: "", thank_you: "" },
      },
    ];
    // Sample submissions for the results table (labelled SAMPLE in the UI).
    const submissions = forms[0].fields_json && [
      { id: "s1", created_at: iso(0.2), contact: "Omar Farouk", email: "omar@nurhome.co", variant: "A", answers: { name: "Omar Farouk", email: "omar@nurhome.co", message: "Interested in a demo" } },
      { id: "s2", created_at: iso(0.5), contact: "Fatima Zahra", email: "fatima@barakah.io", variant: "B", answers: { name: "Fatima Zahra", email: "fatima@barakah.io", message: "Pricing question" } },
      { id: "s3", created_at: iso(1.1), contact: "Bilal Ahmed", email: "bilal@salaamtech.com", variant: "A", answers: { name: "Bilal Ahmed", email: "bilal@salaamtech.com", message: "Onboarding help" } },
      { id: "s4", created_at: iso(2.3), contact: "Noor Sadiq", email: "noor@qamar.app", variant: "A", answers: { name: "Noor Sadiq", email: "noor@qamar.app", message: "Feature request" } },
      { id: "s5", created_at: iso(3.0), contact: "Hana Yusuf", email: "hana@dawn.co", variant: "B", answers: { name: "Hana Yusuf", email: "hana@dawn.co", message: "Partnership" } },
    ];
    // Sample analytics matching the form_analytics() shape (labelled SAMPLE).
    const analytics = {
      "form-contact": { views: 1840, starts: 640, completions: 214, submissions: 214, conversion: 0.1163, by_step: {}, ab: { A: { views: 980, submissions: 128 }, B: { views: 860, submissions: 86 } } },
      "form-nps": { views: 920, starts: 512, completions: 331, submissions: 331, conversion: 0.3598, by_step: { "0": 512, "1": 388 }, ab: {} },
      "form-quiz": { views: 0, starts: 0, completions: 0, submissions: 0, conversion: 0, by_step: {}, ab: {} },
    };
    const series = { "form-contact": [4, 6, 5, 9, 8, 12, 10, 14, 11, 16, 13, 18, 15, 20], "form-nps": [8, 12, 10, 15, 20, 18, 24, 22, 28, 26, 30, 34, 31, 36], "form-quiz": [] };
    return { members, forms, submissions, analytics, series, contactUpsertSample, workspace: { id: "ws-acme", name: "Acme Agency" } };
  })();

  /* ── App state ──────────────────────────────────────────────────────────── */
  const PREVIEW_STATES = ["default", "empty", "loading", "error", "success"];
  const state = { loaded: false, loading: false, error: null, previewState: "default", forms: [], role: "owner", editing: null, sel: null, tab: "build", sortable: null, chart: null, resultsAnalytics: null, resultsSeries: null, submissions: [], page: 0 };
  // Apply the persisted theme now that `state` exists (setTheme reads state.chart).
  setTheme((() => { try { return localStorage.getItem(THEME_KEY) || "light"; } catch (e) { return "light"; } })());
  const st = (n) => !connected() && state.previewState === n;
  const canEdit = () => ["owner", "admin", "manager", "staff"].includes(state.role);
  const canDelete = () => ["owner", "admin", "manager"].includes(state.role);

  /* ── Data load ──────────────────────────────────────────────────────────── */
  async function boot() {
    state.loading = true; state.error = null; render();
    if (!connected()) { // mockup mode — honest sample data
      state.role = "owner";
      state.forms = MOCK.forms.map((f) => { const c = JSON.parse(JSON.stringify(f)); c.logic_json = logicFromPayload(c.logic_json); return c; });
      state.loaded = true; state.loading = false; render(); return;
    }
    try {
      const db = ensureClient();
      const { data: forms, error } = await db.from("forms").select("*").is("variant_of_id", null).order("created_at", { ascending: false });
      if (error) throw error;
      state.forms = (forms || []).map((f) => ({ ...f, logic_json: logicFromPayload(f.logic_json), views: 0, subs: 0 }));
      state.loaded = true; state.loading = false; render();
    } catch (e) { state.error = e.message || String(e); state.loading = false; render(); }
  }

  /* ── Shell (rail + topbar) ──────────────────────────────────────────────── */
  const NAV = [
    { key: "list", label: "Forms", icon: "forms", hash: "#/forms" },
  ];
  function shell(activeKey, content, opts = {}) {
    const theme = root.getAttribute("data-theme");
    return `
      <aside class="rail" id="rail">
        <div class="rail-brand"><span class="rail-glyph">${svg("forms", 18)}</span><span>AiMind<em>Share</em></span></div>
        <nav class="rail-nav">
          <div class="nav-group-label">Acquisition</div>
          ${NAV.map((n) => `<a class="rail-link ${n.key === activeKey ? "on" : ""}" data-hash="${n.hash}">${svg(n.icon, 18)}<span>${n.label}</span></a>`).join("")}
        </nav>
        <div class="rail-foot">M15 · Forms &amp; Surveys</div>
      </aside>
      <header class="tbar">
        <button class="icon-btn rail-burger" id="railBurger" aria-label="Menu">☰</button>
        <div class="tb-search"><span>${svg("search", 15)}</span><input placeholder="Search forms…" id="tbSearch"><kbd class="mono">⌘K</kbd></div>
        <div class="tb-actions">
          <button class="jobs-chip" id="jobsChip" title="Background jobs"><span class="dot"></span><span class="mono">3</span></button>
          <button class="icon-btn" id="themeBtn" aria-label="Theme"><span id="themeIco">${theme === "dark" ? "☀" : "☾"}</span></button>
          <button class="btn btn-ghost btn-sm" id="connectBtn">${connected() ? "Connected" : "Connect project"}</button>
          <span class="avatar" title="Aisha Rahman">AR</span>
        </div>
      </header>
      <main class="content${opts.wide ? " content--flush" : ""}" id="content">${opts.wide ? content : `<div class="content-inner">${content}</div>`}</main>`;
  }

  function previewStrip() {
    if (connected()) return "";
    return `<div class="preview-strip"><span class="ps-label">Preview state</span>
      ${PREVIEW_STATES.map((s) => `<button class="ps-btn ${state.previewState === s ? "on" : ""}" data-preview="${s}">${s}</button>`).join("")}
      <span class="ps-hint">mockup mode · SAMPLE data · connect a project for live data</span></div>`;
  }
  function sampleTag() { return connected() ? "" : `<span class="sample-tag mono">Sample data</span>`; }

  /* ── Routing ────────────────────────────────────────────────────────────── */
  function parseHash() {
    const raw = (location.hash || "#/forms").replace(/^#/, "");
    const [path] = raw.split("?");
    const seg = path.split("/").filter(Boolean); // ['forms', ':id', 'edit'|'results']
    return { seg };
  }
  function render() {
    const app = $("#app"); const { seg } = parseHash();
    if (seg[0] === "forms" && seg[1] && seg[2] === "edit") { app.innerHTML = shell("list", viewBuilder(seg[1]), { wide: true }); wireShell(); mountBuilder(seg[1]); afterRender(); return; }
    if (seg[0] === "forms" && seg[1] && seg[2] === "results") { app.innerHTML = shell("list", viewResults(seg[1])); wireShell(); wireResults(seg[1]); afterRender(); return; }
    app.innerHTML = shell("list", viewList()); wireShell(); wireList(); afterRender();
  }
  function afterRender() {
    if (reduce) { $$(".reveal").forEach((n) => n.classList.add("in")); return; }
    document.body.classList.add("js-ready");
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))), { threshold: 0, rootMargin: "0px 0px -40px 0px" });
    $$(".reveal").forEach((n) => io.observe(n));
  }
  function wireShell() {
    $("#themeBtn")?.addEventListener("click", () => setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"));
    $("#connectBtn")?.addEventListener("click", openDrawer);
    $("#jobsChip")?.addEventListener("click", () => toast("Jobs panel — queue depth 3 (demo)", "info"));
    $("#railBurger")?.addEventListener("click", () => $("#rail").classList.toggle("open"));
    $$("[data-hash]").forEach((n) => n.addEventListener("click", () => { location.hash = n.dataset.hash; $("#rail")?.classList.remove("open"); }));
    $$("[data-preview]").forEach((b) => b.addEventListener("click", () => { state.previewState = b.dataset.preview; render(); }));
  }

  /* ══════════════════════════════════════════════════════════════════════════
     SCREEN 1 — /forms (list)
     ══════════════════════════════════════════════════════════════════════════ */
  function viewList() {
    const head = `<div class="page-head">
      <div><span class="eyebrow">Module · M15</span>
        <h1>Forms &amp; <em>surveys</em></h1>
        <p class="sub">Build forms, surveys and quizzes that capture leads straight into your CRM — with consent, routing and conversion analytics baked in.</p>
        <div class="freshness"><span class="fresh-dot"></span><span class="mono">${connected() ? "live · RLS-scoped" : "mockup · sample data"}</span></div>
      </div>
      <div class="ph-actions">${canEdit() ? `<button class="btn btn-primary" id="newBtn">${svg("plus", 16)} New form</button>` : ""}</div></div>`;
    if (st("loading") || (state.loading && !state.loaded)) return previewStrip() + head + skeletonList();
    if (st("error") || state.error) return previewStrip() + head + errorBox(state.error || "We couldn't load your forms.");
    const list = st("empty") ? [] : state.forms;
    if (!list.length) return previewStrip() + head + emptyList();
    const totalSubs = list.reduce((s, f) => s + (f.subs || 0), 0);
    const rates = list.filter((f) => f.views).map((f) => (f.subs / f.views) * 100);
    const avg = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
    const kpis = `<div class="kpi-strip reveal">
      ${kpi("forms", fmtInt(list.length), "Total forms")}
      ${kpi("chart", fmtInt(totalSubs), "Submissions · 30d")}
      ${kpi("funnel", pct(avg), "Avg conversion")}
      ${kpiFeat("rocket", fmtInt(list.filter((f) => f.status === "published").length), "Published")}</div>`;
    const rows = `<div class="panel reveal"><div class="panel-head"><div class="ph-ico">${svg("forms", 16)}</div><h3>Your forms ${sampleTag()}</h3></div>
      <div class="row-list">${list.map(rowForm).join("")}</div></div>`;
    return previewStrip() + head + kpis + rows;
  }
  function kpi(icon, val, label) { return `<div class="kpi"><div class="kpi-top"><div class="kpi-label">${label}</div><div class="kpi-ico">${svg(icon, 17)}</div></div><div class="kpi-value mono">${val}</div></div>`; }
  function kpiFeat(icon, val, label) { return `<div class="kpi kpi-featured"><div class="kpi-top"><div class="kpi-label">${label}</div><div class="kpi-ico">${svg(icon, 17)}</div></div><div class="kpi-value mono">${val}</div></div>`; }

  function rowForm(f) {
    const rate = f.views ? (f.subs / f.views) * 100 : 0;
    const typePill = { form: "info", survey: "attention", quiz: "success" }[f.type] || "info";
    const statusPill = { published: "success", draft: "plain", archived: "warning" }[f.status] || "plain";
    return `<div class="data-row" data-open="${esc(f.id)}">
      <div class="r-body">
        <div class="r-title">${esc(f.name)}</div>
        <div class="r-meta"><span class="pill ${typePill}">${esc(f.type)}</span><span class="pill ${statusPill}">${esc(f.status)}</span>
          <span class="r-frag"><b class="num">${fmtInt(f.views)}</b> views</span>
          <span class="r-frag"><b class="num">${fmtInt(f.subs)}</b> subs</span>
          <span class="r-frag"><b class="num">${pct(rate)}</b> rate</span></div>
      </div>
      <div class="r-right" data-stop>
        <button class="icon-btn sm" data-act="edit" data-id="${esc(f.id)}" title="Edit">${svg("edit", 15)}</button>
        <button class="icon-btn sm" data-act="results" data-id="${esc(f.id)}" title="Results">${svg("results", 15)}</button>
        <button class="icon-btn sm" data-act="duplicate" data-id="${esc(f.id)}" title="Duplicate">${svg("copy", 15)}</button>
        <button class="icon-btn sm" data-act="archive" data-id="${esc(f.id)}" title="${f.status === "archived" ? "Restore" : "Archive"}">${svg("archive", 15)}</button>
      </div>
    </div>`;
  }
  function emptyList() {
    return `<div class="empty reveal">
      <div class="empty-art">${svg("forms", 34)}</div>
      <h2>No forms yet</h2>
      <p>Forms are how leads reach your CRM. Capture contacts with a form, gather feedback with a survey, or route prospects with a scored quiz — every submission upserts a contact, records consent, and can fire an automation.</p>
      <div class="empty-cta">${canEdit() ? `<button class="btn btn-primary" id="emptyNew">${svg("plus", 16)} Create your first form</button>` : `<span class="muted">Ask a manager to create the first form.</span>`}</div>
    </div>`;
  }
  function skeletonList() {
    return `<div class="kpi-strip">${Array(4).fill(0).map(() => `<div class="kpi skel"><div class="skb skb-ico"></div><div class="skb skb-line"></div></div>`).join("")}</div>
      <div class="panel"><div class="row-list">${Array(5).fill(0).map(() => `<div class="data-row skel"><div class="skb skb-title"></div><div class="skb skb-chip"></div></div>`).join("")}</div></div>`;
  }
  function errorBox(msg) { return `<div class="errbox reveal"><div class="errbox-ico">${svg("alert", 26)}</div><h2>Something went wrong</h2><p>${esc(msg)}</p><button class="btn btn-primary" id="retryBtn">Try again</button></div>`; }

  function wireList() {
    $("#newBtn")?.addEventListener("click", newFormFlow);
    $("#emptyNew")?.addEventListener("click", newFormFlow);
    $("#retryBtn")?.addEventListener("click", () => { state.previewState = "default"; state.error = null; boot(); });
    $$("[data-open]").forEach((r) => r.addEventListener("click", (e) => { if (e.target.closest("[data-stop]")) return; location.hash = "#/forms/" + r.dataset.open + "/edit"; }));
    $$("[data-act]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); rowAction(b.dataset.act, b.dataset.id); }));
  }
  function rowAction(act, id) {
    const f = state.forms.find((x) => x.id === id); if (!f) return;
    if (act === "edit") return void (location.hash = "#/forms/" + id + "/edit");
    if (act === "results") return void (location.hash = "#/forms/" + id + "/results");
    if (act === "duplicate") { const copy = JSON.parse(JSON.stringify(f)); copy.id = uid("form-"); copy.name = f.name + " (copy)"; copy.status = "draft"; copy.views = 0; copy.subs = 0; copy.published_at = null; state.forms.unshift(copy); toast("Form duplicated", "success"); return render(); }
    if (act === "archive") { f.status = f.status === "archived" ? "draft" : "archived"; toast(f.status === "archived" ? "Form archived" : "Form restored", "success"); return render(); }
  }

  /* ── New-form modal ─────────────────────────────────────────────────────── */
  function newFormFlow() {
    if (!canEdit()) return toast("Requires staff+", "error");
    modal(`<div class="mo-head"><h3>New form</h3><button class="icon-btn" data-close>${svg("x", 16)}</button></div>
      <p class="muted">Name it and pick a type. You can change everything on the builder.</p>
      <div class="field"><label class="label" for="nfName">Form name</label><input id="nfName" placeholder="Contact Us" autocomplete="off"></div>
      <label class="label" style="margin-bottom:8px;display:block">Type</label>
      <div class="type-pick">
        ${[["form", "forms", "Standard form", "Capture leads into your CRM"], ["survey", "survey", "Survey", "Gather feedback, optionally multi-step"], ["quiz", "quiz", "Scored quiz", "Score answers → route to a result tier"]].map(([v, ic, t, d], i) => `<button class="type-opt ${i === 0 ? "on" : ""}" data-type="${v}"><span class="type-ico">${svg(ic, 18)}</span><span class="type-txt"><b>${t}</b><small>${d}</small></span></button>`).join("")}
      </div>
      <div class="mo-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="nfCreate">${svg("plus", 15)} Create form</button></div>`);
    let type = "form";
    $$("[data-type]").forEach((b) => b.addEventListener("click", () => { type = b.dataset.type; $$("[data-type]").forEach((x) => x.classList.toggle("on", x === b)); }));
    $("#nfCreate").addEventListener("click", () => { const name = $("#nfName").value.trim() || (type === "quiz" ? "New quiz" : type === "survey" ? "New survey" : "New form"); closeModal(); createForm(name, type); });
    setTimeout(() => $("#nfName")?.focus(), 30);
  }
  function createForm(name, type) {
    const id = uid("form-");
    const f = {
      id, name, type, status: "draft", views: 0, subs: 0, created_at: new Date().toISOString(), published_at: null,
      fields_json: type === "quiz"
        ? [{ key: uid("q_"), type: "radio", label: "First question", required: true, options: ["Option A", "Option B"] }]
        : [{ key: "name", type: "text", label: "Your name", placeholder: "Jane Doe", required: true, map_to: "name" }, { key: "email", type: "email", label: "Email", placeholder: "jane@company.com", required: true, map_to: "email" }],
      logic_json: [],
      settings_json: { design: { accent: "teal", button_text: "Submit", layout: "card" }, spam: { honeypot: "hp_url", min_ms: 1500 }, source_tag: name },
      routing_json: { thank_you: "Thanks — we got your submission." },
    };
    if (type === "quiz") { f.settings_json.scoring = {}; f.settings_json.tiers = [{ min: 0, max: 99, label: "Result", redirect: "", message: "Thanks for taking the quiz." }]; }
    state.forms.unshift(f);
    if (connected()) {
      const db = ensureClient();
      db.from("forms").insert({ name, type, fields_json: f.fields_json, logic_json: f.logic_json, settings_json: f.settings_json, routing_json: f.routing_json })
        .select("id").single().then(({ data }) => { if (data) { f.id = data.id; location.hash = "#/forms/" + data.id + "/edit"; } }).catch((e) => toast(e.message, "error"));
    }
    location.hash = "#/forms/" + id + "/edit";
  }

  /* ══════════════════════════════════════════════════════════════════════════
     SCREEN 2 — /forms/[id]/edit (builder)  ·  three columns + 4 tabs
     ══════════════════════════════════════════════════════════════════════════ */
  function viewBuilder(id) {
    const f = state.forms.find((x) => x.id === id);
    if (!f) return `<div class="content-inner"><div class="errbox"><h2>Form not found</h2><button class="btn btn-primary" id="backList">Back to forms</button></div></div>`;
    state.editing = f; if (state.sel == null && f.fields_json.length) state.sel = f.fields_json[0].key;
    const tabs = [["build", "Build", "forms"], ["logic", "Logic", "logic"], ["routing", "Routing", "route"], ["design", "Design", "paint"]];
    return `<div class="bd-wrap">
      <div class="bd-topbar">
        <button class="icon-btn" id="bdBack" aria-label="Back">${svg("back", 18)}</button>
        <input class="bd-name" id="bdName" value="${esc(f.name)}" spellcheck="false" ${canEdit() ? "" : "disabled"}>
        <span class="pill ${f.status === "published" ? "success" : "plain"}">${esc(f.status)}</span>
        <div class="bd-tabs">${tabs.map(([k, l, ic]) => `<button class="bd-tab ${state.tab === k ? "on" : ""}" data-tab="${k}">${svg(ic, 14)} ${l}</button>`).join("")}</div>
        <div class="bd-spacer"></div>
        <button class="btn btn-ghost btn-sm" id="bdResults">${svg("chart", 15)} Results</button>
        <button class="btn btn-ghost btn-sm" id="bdSave" ${canEdit() ? "" : "disabled"}>${svg("check", 15)} Save</button>
        <button class="btn btn-primary btn-sm" id="bdPublish" ${canEdit() ? "" : "disabled"}>${svg("rocket", 15)} ${f.status === "published" ? "Published" : "Publish"}</button>
      </div>
      <div class="bd-body" id="bdBody">${tabBody(f)}</div>
    </div>`;
  }
  function tabBody(f) {
    if (state.tab === "build") return buildTab(f);
    if (state.tab === "logic") return `<div class="bd-scroll"><div class="tab-inner">${logicTab(f)}</div></div>`;
    if (state.tab === "routing") return `<div class="bd-scroll"><div class="tab-inner">${routingTab(f)}</div></div>`;
    if (state.tab === "design") return `<div class="bd-scroll"><div class="tab-inner">${designTab(f)}</div></div>`;
    return "";
  }

  /* ── BUILD tab: palette · canvas · field settings ───────────────────────── */
  function buildTab(f) {
    const groups = [["input", "Inputs"], ["choice", "Choices"], ["special", "Special"], ["layout", "Layout"]];
    const palette = groups.map(([g, gl]) => `<div class="pal-group"><div class="pal-head">${gl}</div>
      ${FIELD_TYPES.filter((t) => t.grp === g).map((t) => `<button class="pal-item ${t.disabled ? "off" : ""}" data-add="${t.t}" ${t.disabled ? "disabled" : ""} title="${t.disabled ? "Available " + t.disabled : "Add " + t.label}">
        <span class="pal-ico">${svg(t.icon, 15)}</span><span>${t.label}</span>${t.disabled ? `<span class="pal-tag mono">${t.disabled}</span>` : ""}</button>`).join("")}</div>`).join("");
    const steps = f.settings_json.steps;
    return `<div class="bd-cols">
      <aside class="bd-palette"><div class="pal-scroll">${palette}</div>
        <div class="pal-tip">${svg("info", 13)} Click or drag a field onto the canvas. Reorder by dragging the handle.</div></aside>
      <div class="bd-canvas-host"><div class="cv-head"><div class="cv-title">${esc(f.name)} <span class="pill ${{ form: "info", survey: "attention", quiz: "success" }[f.type]}">${esc(f.type)}</span></div>
        <label class="mini-toggle"><input type="checkbox" id="stepToggle" ${steps ? "checked" : ""}><span>Multi-step</span></label></div>
        <div class="cv-list" id="cvList">${canvasList(f)}</div></div>
      <aside class="bd-settings" id="bdSettings">${settingsPanel(f)}</aside>
    </div>`;
  }
  function canvasList(f) {
    if (!f.fields_json.length) return `<div class="cv-empty">${svg("forms", 28)}<p>Empty canvas</p><span>Add a field from the palette on the left.</span></div>`;
    const steps = f.settings_json.steps;
    if (steps) {
      // Multi-step organizer: group fields under step headers; unassigned bucket at end.
      const assigned = new Set(steps.flatMap((s) => s.field_keys || []));
      const bodyFor = (keys) => keys.map((k) => f.fields_json.find((x) => x.key === k)).filter(Boolean).map(fieldChip).join("");
      const stepBlocks = steps.map((s, i) => `<div class="cv-step"><div class="cv-step-head"><span class="mono">Step ${i + 1}</span><input class="cv-step-title" data-steptitle="${i}" value="${esc(s.title || "")}" placeholder="Step title"></div>
        <div class="cv-sort" data-step="${i}">${bodyFor(s.field_keys || [])}</div></div>`).join("");
      const orphan = f.fields_json.filter((x) => !assigned.has(x.key));
      const orphanBlock = `<div class="cv-step cv-step-orphan"><div class="cv-step-head"><span class="mono">Unassigned</span></div><div class="cv-sort" data-step="-1">${orphan.map(fieldChip).join("")}</div></div>`;
      return stepBlocks + orphanBlock;
    }
    return `<div class="cv-sort" data-step="none">${f.fields_json.map(fieldChip).join("")}</div>`;
  }
  function fieldChip(fld) {
    const m = TYPE_META[fld.type] || TYPE_META.text;
    const sel = state.sel === fld.key ? " on" : "";
    const req = fld.required ? `<span class="fc-req mono" title="Required">required</span>` : "";
    const map = fld.map_to ? `<span class="fc-map mono">→ ${esc(fld.map_to)}</span>` : "";
    return `<div class="field-chip${sel}" data-field="${esc(fld.key)}" draggable="false">
      <span class="fc-grip" data-grip>${svg("grip", 14)}</span>
      <span class="fc-ico">${svg(m.icon, 15)}</span>
      <span class="fc-body"><span class="fc-label">${esc(fld.label || m.label)}</span><span class="fc-sub mono">${esc(fld.type)}${map ? " " : ""}${map}</span></span>
      ${req}
      <button class="icon-btn xs" data-del="${esc(fld.key)}" data-stop title="Remove">${svg("trash", 13)}</button>
    </div>`;
  }
  function settingsPanel(f) {
    const fld = f.fields_json.find((x) => x.key === state.sel);
    if (!fld) return `<div class="cfg-empty">${svg("edit", 26)}<p>Select a field</p><span>Click a field on the canvas to edit it.</span></div>`;
    const m = TYPE_META[fld.type] || TYPE_META.text;
    const rows = [];
    rows.push(`<div class="sp-head"><div class="sp-ico">${svg(m.icon, 16)}</div><div><b>${esc(m.label)}</b><small class="mono">${esc(fld.key)}</small></div></div>`);
    if (!isLayout(fld.type)) {
      rows.push(field("Label", `<input data-cfg="label" value="${esc(fld.label || "")}">`));
      if (!["consent", "rating", "hidden"].includes(fld.type)) rows.push(field("Placeholder", `<input data-cfg="placeholder" value="${esc(fld.placeholder || "")}">`));
      rows.push(`<label class="sp-switch"><span>Required</span><input type="checkbox" data-cfg="required" ${fld.required ? "checked" : ""}></label>`);
      rows.push(field("Maps to", `<select data-cfg="map_to">${MAP_TARGETS.map((o) => `<option value="${o.v}" ${((fld.map_to === o.v) || (o.v === "custom" && fld.map_to && !MAP_TARGETS.some((x) => x.v === fld.map_to))) ? "selected" : ""}>${o.l}</option>`).join("")}</select>`));
      if (fld.map_to && !["", "name", "email", "phone", "company"].includes(fld.map_to)) rows.push(field("Custom field key", `<input data-cfg="map_custom" value="${esc(fld.map_to)}" placeholder="e.g. budget">`));
      if (!["email", "phone", "number", "date"].includes(fld.type) && !hasOptions(fld.type) && fld.type !== "consent") rows.push(field("Validation (regex, optional)", `<input data-cfg="validation" value="${esc(fld.validation || "")}" placeholder="^.{2,}$">`));
    } else {
      rows.push(field("Text", `<input data-cfg="label" value="${esc(fld.label || "")}">`));
    }
    if (fld.type === "consent") rows.push(field("Consent text", `<textarea data-cfg="consent_text" rows="3" placeholder="I agree to…">${esc(fld.consent_text || "")}</textarea>`));
    if (hasOptions(fld.type)) rows.push(optionsEditor(fld));
    rows.push(`<button class="btn btn-ghost btn-sm sp-del" data-delfield="${esc(fld.key)}">${svg("trash", 14)} Remove field</button>`);
    return `<div class="sp-scroll">${rows.join("")}</div>`;
    function field(label, ctrl) { return `<div class="sp-field"><label class="label">${label}</label>${ctrl}</div>`; }
  }
  function optionsEditor(fld) {
    const opts = fld.options || [];
    return `<div class="sp-field"><label class="label">Options</label>
      <div class="opt-list" id="optList">${opts.map((o, i) => `<div class="opt-row"><input data-opt="${i}" value="${esc(o)}"><button class="icon-btn xs" data-optdel="${i}">${svg("x", 12)}</button></div>`).join("")}</div>
      <button class="btn btn-ghost btn-sm" id="optAdd">${svg("plus", 13)} Add option</button></div>`;
  }

  /* ── LOGIC tab ──────────────────────────────────────────────────────────── */
  function logicTab(f) {
    const fields = f.fields_json.filter((x) => !isLayout(x.type));
    const steps = f.settings_json.steps || [];
    const rules = f.logic_json || [];
    const fieldOpts = (sel) => fields.map((x) => `<option value="${esc(x.key)}" ${sel === x.key ? "selected" : ""}>${esc(x.label || x.key)}</option>`).join("");
    const targetOpts = (r) => {
      const t = r.target || {};
      const fs = fields.map((x) => `<option value="field:${esc(x.key)}" ${t.field === x.key ? "selected" : ""}>Field · ${esc(x.label || x.key)}</option>`).join("");
      const ss = steps.map((s, i) => `<option value="step:${i}" ${String(t.step) === String(i) ? "selected" : ""}>Step · ${esc(s.title || i + 1)}</option>`).join("");
      return fs + ss;
    };
    const rows = rules.map((r, i) => `<div class="logic-row" data-lrow="${i}">
      <span class="lr-lead">If</span>
      <select data-l="field">${fieldOpts(r.if?.field)}</select>
      <select data-l="op">${LOGIC_OPS.map((o) => `<option value="${o.v}" ${r.if?.op === o.v ? "selected" : ""}>${o.l}</option>`).join("")}</select>
      <input data-l="value" value="${esc(r.if?.value ?? "")}" placeholder="value">
      <span class="lr-lead">then</span>
      <select data-l="action"><option value="show" ${r.action === "show" ? "selected" : ""}>show</option><option value="hide" ${r.action === "hide" ? "selected" : ""}>hide</option></select>
      <select data-l="target">${targetOpts(r)}</select>
      <button class="icon-btn xs" data-ldel="${i}">${svg("trash", 13)}</button>
    </div>`).join("");
    return `<div class="tab-head"><div><h2>Conditional <em>logic</em></h2><p class="tab-sub">Show or hide a field or step based on an earlier answer. Rules are re-checked server-side — hidden answers are dropped.</p></div>
      <button class="btn btn-ghost btn-sm" id="logicAdd" ${fields.length ? "" : "disabled"}>${svg("plus", 14)} Add rule</button></div>
      ${rules.length ? `<div class="logic-list">${rows}</div>` : `<div class="tab-empty">${svg("logic", 26)}<p>No logic rules</p><span>Add a rule to show or hide fields conditionally.</span></div>`}`;
  }

  /* ── ROUTING tab ────────────────────────────────────────────────────────── */
  function routingTab(f) {
    const r = f.routing_json || {};
    const valueFieldOpts = f.fields_json.filter((x) => ["number", "text"].includes(x.type)).map((x) => `<option value="${esc(x.key)}" ${r.value_field === x.key ? "selected" : ""}>${esc(x.label || x.key)}</option>`).join("");
    const rrList = (r.round_robin_ids || []);
    return `<div class="tab-head"><div><h2>Routing &amp; <em>follow-up</em></h2><p class="tab-sub">What happens after a submission — who owns the contact, which tags and deals get created, where the visitor lands.</p></div></div>
      <div class="route-grid">
        <div class="route-card">
          <div class="rc-head">${svg("users", 16)}<b>Owner assignment</b></div>
          <label class="sp-switch"><span>Assign an owner (round-robin)</span><input type="checkbox" data-r="assign_owner" ${r.assign_owner ? "checked" : ""}></label>
          <div class="rr-pick" data-rrwrap ${r.assign_owner ? "" : "hidden"}>
            <label class="label">Round-robin pool</label>
            <div class="chip-pick">${MOCK.members.map((m) => `<button class="pick-chip ${rrList.includes(m.id) ? "on" : ""}" data-rr="${m.id}">${esc(m.name)}</button>`).join("")}</div>
          </div>
        </div>
        <div class="route-card">
          <div class="rc-head">${svg("route", 16)}<b>Tags</b></div>
          <label class="label">Add these tags to the contact</label>
          <input data-r="tags" value="${esc((r.tags || []).join(", "))}" placeholder="inbound, newsletter">
          <span class="help">Comma-separated. The form's source tag is always added too.</span>
        </div>
        <div class="route-card">
          <div class="rc-head">${svg("funnel", 16)}<b>Create a deal</b></div>
          <label class="sp-switch"><span>Open a pipeline deal on submit</span><input type="checkbox" data-r="create_deal" ${r.create_deal ? "checked" : ""}></label>
          <div data-dealwrap ${r.create_deal ? "" : "hidden"}>
            <label class="label">Deal value from field</label>
            <select data-r="value_field"><option value="">— none —</option>${valueFieldOpts}</select>
            <span class="help">Uses the workspace's first pipeline &amp; stage (server-side).</span>
          </div>
        </div>
        <div class="route-card">
          <div class="rc-head">${svg("link", 16)}<b>After submit</b></div>
          <label class="label">Redirect URL (optional)</label>
          <input data-r="redirect" value="${esc(r.redirect || "")}" placeholder="https://example.com/thanks">
          <label class="label" style="margin-top:12px">Thank-you message</label>
          <textarea data-r="thank_you" rows="2" placeholder="Thanks — we got it.">${esc(r.thank_you || "")}</textarea>
        </div>
      </div>`;
  }

  /* ── DESIGN tab ─────────────────────────────────────────────────────────── */
  function designTab(f) {
    const s = f.settings_json || {}; const d = s.design || {}; const spam = s.spam || {};
    const variantB = state.forms.find((x) => x.variant_of_id === f.id);
    return `<div class="tab-head"><div><h2>Design &amp; <em>delivery</em></h2><p class="tab-sub">Look, spam protection and A/B — all bound to design tokens so the public form stays on-brand.</p></div></div>
      <div class="route-grid">
        <div class="route-card">
          <div class="rc-head">${svg("paint", 16)}<b>Appearance</b></div>
          <label class="label">Form type</label>
          <select data-d="type">${["form", "survey", "quiz"].map((t) => `<option value="${t}" ${f.type === t ? "selected" : ""}>${t}</option>`).join("")}</select>
          <label class="label" style="margin-top:12px">Accent</label>
          <div class="swatch-row">${ACCENTS.map((a) => `<button class="swatch ${d.accent === a.v ? "on" : ""}" data-accent="${a.v}" title="${a.l}"><span class="sw-dot" style="background:var(${a.token})"></span>${a.l}</button>`).join("")}</div>
          <label class="label" style="margin-top:12px">Layout</label>
          <select data-d="layout">${LAYOUTS.map((l) => `<option value="${l.v}" ${d.layout === l.v ? "selected" : ""}>${l.l}</option>`).join("")}</select>
          <label class="label" style="margin-top:12px">Button text</label>
          <input data-d="button_text" value="${esc(d.button_text || "Submit")}">
        </div>
        <div class="route-card">
          <div class="rc-head">${svg("shield", 16)}<b>Spam &amp; consent</b></div>
          <label class="sp-switch"><span>Honeypot field</span><input type="checkbox" data-d="honeypot" ${spam.honeypot ? "checked" : ""}></label>
          <label class="label" style="margin-top:10px">Time-trap (min ms before submit)</label>
          <input data-d="min_ms" type="number" value="${esc(spam.min_ms ?? 1500)}" min="0" step="100" class="mono">
          <label class="sp-switch" style="margin-top:10px"><span>Turnstile CAPTCHA <span class="pill plain mono" style="margin-left:6px">needs key</span></span><input type="checkbox" disabled title="Add a Cloudflare Turnstile key in Vault to enable"></label>
          <label class="sp-switch" style="margin-top:6px"><span>Double opt-in (confirm email)</span><input type="checkbox" data-d="double_optin" ${s.double_optin ? "checked" : ""}></label>
        </div>
        <div class="route-card">
          <div class="rc-head">${svg("split", 16)}<b>A/B testing</b></div>
          ${variantB
        ? `<p class="ab-live"><span class="pill success">Variant B live</span></p>`
        : `<button class="btn btn-ghost btn-sm" id="abCreate">${svg("plus", 14)} Create variant B</button>`}
          <label class="label" style="margin-top:14px">Traffic split — A <span class="mono" id="abLabel">${100 - (f.ab_split || 50)}</span>% / B <span class="mono">${f.ab_split || 50}</span>%</label>
          <input type="range" min="10" max="90" step="5" value="${f.ab_split || 50}" data-d="ab_split" class="ab-slider" ${variantB ? "" : "disabled"}>
        </div>
      </div>`;
  }

  /* ── Builder mount + wiring ─────────────────────────────────────────────── */
  function mountBuilder(id) {
    const f = state.forms.find((x) => x.id === id); if (!f) { $("#backList")?.addEventListener("click", () => (location.hash = "#/forms")); return; }
    // topbar
    $("#bdBack")?.addEventListener("click", () => (location.hash = "#/forms"));
    $("#bdName")?.addEventListener("input", (e) => { f.name = e.target.value; });
    $("#bdResults")?.addEventListener("click", () => (location.hash = "#/forms/" + id + "/results"));
    $("#bdSave")?.addEventListener("click", () => saveForm(f));
    $("#bdPublish")?.addEventListener("click", () => publishForm(f));
    $$("[data-tab]").forEach((b) => b.addEventListener("click", () => { state.tab = b.dataset.tab; $$("[data-tab]").forEach((x) => x.classList.toggle("on", x === b)); $("#bdBody").innerHTML = tabBody(f); wireTab(f); }));
    wireTab(f);
  }
  function wireTab(f) {
    if (state.tab === "build") wireBuild(f);
    if (state.tab === "logic") wireLogic(f);
    if (state.tab === "routing") wireRouting(f);
    if (state.tab === "design") wireDesign(f);
  }

  function wireBuild(f) {
    // palette add (click)
    $$("[data-add]").forEach((b) => b.addEventListener("click", () => { if (b.disabled) return; addField(f, b.dataset.add); }));
    // multi-step toggle
    $("#stepToggle")?.addEventListener("change", (e) => {
      if (e.target.checked) { f.settings_json.steps = [{ title: "Step 1", field_keys: f.fields_json.filter((x) => !isLayout(x.type)).map((x) => x.key) }, { title: "Step 2", field_keys: [] }]; }
      else delete f.settings_json.steps;
      refreshBuild(f);
    });
    // step title edits
    $$("[data-steptitle]").forEach((inp) => inp.addEventListener("input", (e) => { const i = +inp.dataset.steptitle; if (f.settings_json.steps?.[i]) f.settings_json.steps[i].title = e.target.value; }));
    // select field
    $$("[data-field]").forEach((c) => c.addEventListener("click", (e) => { if (e.target.closest("[data-stop]") || e.target.closest("[data-grip]")) return; state.sel = c.dataset.field; refreshSelection(f); }));
    // delete field (chip button)
    $$("[data-del]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); delField(f, b.dataset.del); }));
    // settings-panel bindings
    wireSettings(f);
    // SortableJS on each step-sort container
    initSortable(f);
  }
  function initSortable(f) {
    if (state.sortable) { state.sortable.forEach((s) => { try { s.destroy(); } catch (e) {} }); }
    state.sortable = [];
    if (!window.Sortable) return;
    $$(".cv-sort").forEach((cont) => {
      state.sortable.push(window.Sortable.create(cont, {
        group: "fields", handle: "[data-grip]", animation: reduce ? 0 : 170,
        ghostClass: "chip-ghost", chosenClass: "chip-chosen", dragClass: "chip-drag",
        onEnd: () => syncOrderFromDom(f),
      }));
    });
  }
  function syncOrderFromDom(f) {
    const steps = f.settings_json.steps;
    if (steps) {
      const assigned = [];
      $$(".cv-sort").forEach((cont) => {
        const idx = cont.dataset.step; const keys = $$("[data-field]", cont).map((c) => c.dataset.field);
        if (idx === "-1") { assigned.push(...keys); return; }
        const i = +idx; if (steps[i]) steps[i].field_keys = keys.slice();
        assigned.push(...keys);
      });
      // reorder the master fields array to match visual order (steps then orphans)
      f.fields_json.sort((a, b) => assigned.indexOf(a.key) - assigned.indexOf(b.key));
    } else {
      const cont = $(".cv-sort"); if (!cont) return;
      const order = $$("[data-field]", cont).map((c) => c.dataset.field);
      f.fields_json.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    }
    toast("Order updated", "info");
  }
  function refreshBuild(f) { $("#bdBody").innerHTML = tabBody(f); wireBuild(f); }
  function refreshSelection(f) { $("#cvList").innerHTML = canvasList(f); $("#bdSettings").innerHTML = settingsPanel(f); wireBuild(f); }

  function addField(f, type) {
    const m = TYPE_META[type];
    const key = uid(type.slice(0, 3) + "_");
    const fld = { key, type, label: m.label };
    if (type === "email") fld.map_to = "email";
    if (type === "phone") fld.map_to = "phone";
    if (hasOptions(type)) fld.options = ["Option A", "Option B"];
    if (type === "consent") { fld.consent_text = "I agree to receive communications and accept the privacy policy."; fld.required = true; }
    if (isLayout(type)) fld.label = type === "heading" ? "Section heading" : "Descriptive paragraph text.";
    // add to last step if multi-step
    const steps = f.settings_json.steps;
    if (steps && steps.length && !isLayout(type)) steps[steps.length - 1].field_keys.push(key);
    f.fields_json.push(fld); state.sel = key; refreshBuild(f);
  }
  function delField(f, key) {
    f.fields_json = f.fields_json.filter((x) => x.key !== key);
    if (f.settings_json.steps) f.settings_json.steps.forEach((s) => { s.field_keys = (s.field_keys || []).filter((k) => k !== key); });
    if (state.sel === key) state.sel = f.fields_json[0]?.key || null;
    refreshBuild(f);
  }
  function wireSettings(f) {
    const fld = f.fields_json.find((x) => x.key === state.sel); if (!fld) return;
    $$("[data-cfg]", $("#bdSettings")).forEach((inp) => {
      const key = inp.dataset.cfg;
      const evt = inp.type === "checkbox" ? "change" : "input";
      inp.addEventListener(evt, () => {
        if (key === "required") fld.required = inp.checked;
        else if (key === "map_to") { fld.map_to = inp.value === "custom" ? "custom_field" : inp.value; if (!inp.value) delete fld.map_to; refreshSelection(f); return; }
        else if (key === "map_custom") fld.map_to = inp.value;
        else fld[key] = inp.value;
        // reflect label / map changes on the chip
        if (["label", "required", "map_custom"].includes(key)) $("#cvList").innerHTML = canvasList(f), rebindChips(f);
      });
    });
    // options editor
    $("#optAdd")?.addEventListener("click", () => { fld.options = (fld.options || []).concat("New option"); $("#bdSettings").innerHTML = settingsPanel(f); wireSettings(f); });
    $$("[data-opt]", $("#bdSettings")).forEach((inp) => inp.addEventListener("input", () => { fld.options[+inp.dataset.opt] = inp.value; }));
    $$("[data-optdel]", $("#bdSettings")).forEach((b) => b.addEventListener("click", () => { fld.options.splice(+b.dataset.optdel, 1); $("#bdSettings").innerHTML = settingsPanel(f); wireSettings(f); }));
    $("[data-delfield]", $("#bdSettings"))?.addEventListener("click", () => delField(f, fld.key));
  }
  function rebindChips(f) {
    $$("[data-field]").forEach((c) => c.addEventListener("click", (e) => { if (e.target.closest("[data-stop]") || e.target.closest("[data-grip]")) return; state.sel = c.dataset.field; refreshSelection(f); }));
    $$("[data-del]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); delField(f, b.dataset.del); }));
    initSortable(f);
  }

  function wireLogic(f) {
    $("#logicAdd")?.addEventListener("click", () => {
      const first = f.fields_json.find((x) => !isLayout(x.type));
      f.logic_json.push({ if: { field: first?.key || "", op: "eq", value: "" }, action: "show", target: { field: first?.key || "" } });
      $("#bdBody").innerHTML = tabBody(f); wireLogic(f);
    });
    $$("[data-lrow]").forEach((row) => {
      const i = +row.dataset.lrow; const r = f.logic_json[i];
      $$("[data-l]", row).forEach((ctrl) => ctrl.addEventListener("change", () => {
        const k = ctrl.dataset.l;
        if (k === "field") r.if.field = ctrl.value;
        else if (k === "op") r.if.op = ctrl.value;
        else if (k === "value") r.if.value = ctrl.value;
        else if (k === "action") r.action = ctrl.value;
        else if (k === "target") { const [kind, val] = ctrl.value.split(":"); r.target = kind === "step" ? { step: +val } : { field: val }; }
      }));
      $("[data-l='value']", row)?.addEventListener("input", (e) => { r.if.value = e.target.value; });
      $("[data-ldel]", row)?.addEventListener("click", () => { f.logic_json.splice(i, 1); $("#bdBody").innerHTML = tabBody(f); wireLogic(f); });
    });
  }

  function wireRouting(f) {
    const r = f.routing_json;
    $("[data-r='assign_owner']")?.addEventListener("change", (e) => { r.assign_owner = e.target.checked; $("[data-rrwrap]").hidden = !e.target.checked; });
    $$("[data-rr]").forEach((b) => b.addEventListener("click", () => { r.round_robin_ids = r.round_robin_ids || []; const id = b.dataset.rr; if (r.round_robin_ids.includes(id)) r.round_robin_ids = r.round_robin_ids.filter((x) => x !== id); else r.round_robin_ids.push(id); b.classList.toggle("on"); }));
    $("[data-r='tags']")?.addEventListener("input", (e) => { r.tags = e.target.value.split(",").map((s) => s.trim()).filter(Boolean); });
    $("[data-r='create_deal']")?.addEventListener("change", (e) => { r.create_deal = e.target.checked; $("[data-dealwrap]").hidden = !e.target.checked; });
    $("[data-r='value_field']")?.addEventListener("change", (e) => { r.value_field = e.target.value; });
    $("[data-r='redirect']")?.addEventListener("input", (e) => { r.redirect = e.target.value; });
    $("[data-r='thank_you']")?.addEventListener("input", (e) => { r.thank_you = e.target.value; });
  }

  function wireDesign(f) {
    const s = f.settings_json; s.design = s.design || {}; s.spam = s.spam || {};
    $("[data-d='type']")?.addEventListener("change", (e) => { f.type = e.target.value; if (f.type === "quiz" && !s.scoring) { s.scoring = {}; s.tiers = s.tiers || [{ min: 0, max: 99, label: "Result", redirect: "", message: "" }]; } });
    $$("[data-accent]").forEach((b) => b.addEventListener("click", () => { s.design.accent = b.dataset.accent; $$("[data-accent]").forEach((x) => x.classList.toggle("on", x === b)); }));
    $("[data-d='layout']")?.addEventListener("change", (e) => { s.design.layout = e.target.value; });
    $("[data-d='button_text']")?.addEventListener("input", (e) => { s.design.button_text = e.target.value; });
    $("[data-d='honeypot']")?.addEventListener("change", (e) => { if (e.target.checked) s.spam.honeypot = "hp_url"; else delete s.spam.honeypot; });
    $("[data-d='min_ms']")?.addEventListener("input", (e) => { s.spam.min_ms = +e.target.value || 0; });
    $("[data-d='double_optin']")?.addEventListener("change", (e) => { s.double_optin = e.target.checked; });
    $("#abCreate")?.addEventListener("click", () => {
      const b = JSON.parse(JSON.stringify(f)); b.id = uid("form-"); b.variant_of_id = f.id; b.name = f.name + " — Variant B"; b.status = f.status;
      state.forms.push(b); f.ab_split = f.ab_split || 50; toast("Variant B created — split traffic below", "success"); $("#bdBody").innerHTML = tabBody(f); wireDesign(f);
    });
    const slider = $("[data-d='ab_split']");
    slider?.addEventListener("input", (e) => { f.ab_split = +e.target.value; $("#abLabel").textContent = 100 - f.ab_split; e.target.parentElement.querySelectorAll(".mono")[1].textContent = f.ab_split; });
  }

  /* ── Logic shape bridge — the builder edits an internal model that keeps
        step targets as objects; the DB/submit_form() dialect is
        { when:{field,op,value}, action, target:"<fieldKey>" } (field targets
        only). logicToPayload expands a step target into one field-target rule
        per field in the step so the server tamper-guard covers steps too.
        logicFromPayload reads the DB shape back into the internal model. ── */
  function logicToPayload(rules, settings) {
    const steps = (settings && settings.steps) || [];
    const out = [];
    (rules || []).forEach((r) => {
      const when = { field: r.if?.field, op: r.if?.op || "eq", value: r.if?.value ?? "" };
      const action = r.action === "hide" ? "hide" : "show";
      if (!when.field) return;
      const tgt = r.target || {};
      if (tgt.step != null) {
        const keys = steps[tgt.step]?.field_keys || [];
        keys.forEach((k) => { if (k) out.push({ when: { ...when }, action, target: k }); });
      } else if (tgt.field) {
        out.push({ when: { ...when }, action, target: tgt.field });
      }
    });
    return out;
  }
  function logicFromPayload(rules) {
    return (rules || []).map((r) => ({
      if: { field: r.when?.field ?? "", op: r.when?.op === "neq" ? "neq" : "eq", value: r.when?.value ?? "" },
      action: r.action === "hide" ? "hide" : "show",
      target: { field: typeof r.target === "string" ? r.target : (r.target?.field ?? "") },
    }));
  }

  /* ── SAVE — writes the four json blobs the submit_form() pipeline consumes ─ */
  function buildPayload(f) {
    // fields_json: [{ key, type, label, placeholder?, required?, map_to?, consent_text?, options?, validation? }]
    const fields_json = f.fields_json.map((x) => {
      const o = { key: x.key, type: x.type, label: x.label };
      if (x.placeholder) o.placeholder = x.placeholder;
      if (x.required) o.required = true;
      if (x.map_to) o.map_to = x.map_to;
      if (x.type === "consent") o.consent_text = x.consent_text || "";
      if (hasOptions(x.type)) o.options = (x.options || []).slice();
      if (x.validation) o.validation = x.validation;
      return o;
    });
    // logic_json (DB dialect submit_form reads): [{ when:{field,op,value},
    // action:'show'|'hide', target:"<fieldKey>" }]. Step targets are expanded to
    // one field-target rule per field in the step.
    const logic_json = logicToPayload(f.logic_json, f.settings_json);
    // settings_json: { design, steps?, spam, scoring?, tiers?, double_optin?, anonymous?, source_tag? }
    const s = f.settings_json || {};
    const settings_json = {
      design: { accent: s.design?.accent || "teal", button_text: s.design?.button_text || "Submit", layout: s.design?.layout || "card" },
      spam: { honeypot: s.spam?.honeypot || "hp_url", min_ms: s.spam?.min_ms ?? 1500 },
    };
    if (s.steps) settings_json.steps = s.steps.map((st) => ({ title: st.title, field_keys: (st.field_keys || []).slice() }));
    if (s.scoring) settings_json.scoring = s.scoring;
    if (s.tiers) settings_json.tiers = s.tiers.map((t) => ({ min: t.min, max: t.max, label: t.label, redirect: t.redirect || "", message: t.message || "" }));
    if (s.double_optin) settings_json.double_optin = true;
    if (s.anonymous) settings_json.anonymous = true;
    settings_json.source_tag = s.source_tag || f.name;
    // routing_json: { assign_owner?, round_robin_ids?, tags?, create_deal?, value_field?, redirect?, thank_you? }
    const r = f.routing_json || {};
    const routing_json = {};
    if (r.assign_owner) { routing_json.assign_owner = true; routing_json.round_robin_ids = (r.round_robin_ids || []).slice(); }
    if (r.tags && r.tags.length) routing_json.tags = r.tags.slice();
    if (r.create_deal) { routing_json.create_deal = true; if (r.value_field) routing_json.value_field = r.value_field; }
    if (r.redirect) routing_json.redirect = r.redirect;
    if (r.thank_you) routing_json.thank_you = r.thank_you;
    const payload = { name: f.name, type: f.type, ab_split: f.ab_split || 50, fields_json, logic_json, settings_json, routing_json };
    if (f.variant_of_id) payload.variant_of_id = f.variant_of_id;
    return payload;
  }
  async function saveForm(f) {
    if (!canEdit()) return toast("Requires staff+", "error");
    const payload = buildPayload(f);
    if (!connected()) { toast("Saved (mockup) — 4 json blobs assembled", "success"); return; }
    try { const db = ensureClient(); const { error } = await db.from("forms").update(payload).eq("id", f.id); if (error) throw error; toast("Form saved", "success"); }
    catch (e) { toast(e.message, "error"); }
  }
  async function publishForm(f) {
    if (!canEdit()) return toast("Requires staff+", "error");
    const payload = buildPayload(f);
    f.status = "published"; f.published_at = f.published_at || new Date().toISOString();
    const token = f.public_token || uid("tok-");
    if (connected()) {
      try { const db = ensureClient(); const { data, error } = await db.from("forms").update({ ...payload, status: "published", published_at: new Date().toISOString() }).eq("id", f.id).select("public_token").single(); if (error) throw error; if (data?.public_token) f.public_token = data.public_token; }
      catch (e) { toast(e.message, "error"); return; }
    }
    publishModal(f, f.public_token || token);
    render();
  }
  function publishModal(f, token) {
    const origin = (getCfg()?.url || "https://app.aimindshare.com").replace(/\/$/, "");
    const publicUrl = origin + "/f/" + token;
    const snippet = `<script src="${origin}/embed.js" data-form="${token}" async><\/script>`;
    modal(`<div class="mo-head"><h3>${svg("rocket", 18)} ${esc(f.name)} is live</h3><button class="icon-btn" data-close>${svg("x", 16)}</button></div>
      <p class="muted">Share the link or paste the embed snippet on any site. Submissions flow straight into your CRM under RLS.</p>
      <label class="label">Public link</label>
      <div class="copy-row"><input class="mono" readonly value="${esc(publicUrl)}"><button class="btn btn-ghost btn-sm" data-copy="${esc(publicUrl)}">${svg("copy", 14)} Copy</button></div>
      <label class="label" style="margin-top:14px">Embed snippet</label>
      <div class="copy-row"><input class="mono" readonly value='${esc(snippet)}'><button class="btn btn-ghost btn-sm" data-copy='${esc(snippet)}'>${svg("copy", 14)} Copy</button></div>
      <div class="mo-foot"><button class="btn btn-primary" data-close>Done</button></div>`);
    $$("[data-copy]").forEach((b) => b.addEventListener("click", () => { navigator.clipboard?.writeText(b.dataset.copy).then(() => toast("Copied", "success")).catch(() => toast("Copy failed", "error")); }));
  }

  /* ══════════════════════════════════════════════════════════════════════════
     SCREEN 3 — /forms/[id]/results
     ══════════════════════════════════════════════════════════════════════════ */
  function viewResults(id) {
    const f = state.forms.find((x) => x.id === id);
    if (!f) return `<div class="errbox"><h2>Form not found</h2><button class="btn btn-primary" id="backList">Back to forms</button></div>`;
    const head = `<div class="page-head">
      <div><span class="eyebrow">Module · M15 · Results</span>
        <h1>${esc(f.name)} <em>results</em></h1>
        <p class="sub">Submissions, funnel conversion and A/B performance for this form.</p>
        <div class="freshness"><span class="fresh-dot"></span><span class="mono">${connected() ? "live · form_analytics()" : "mockup · sample analytics"}</span></div>
      </div>
      <div class="ph-actions"><button class="btn btn-ghost" id="backForms">${svg("back", 15)} Forms</button><button class="btn btn-primary" id="csvBtn">${svg("export", 16)} Export CSV</button></div></div>`;
    if (st("loading")) return previewStrip() + head + `<div class="panel">${skeletonBlock()}</div>`;
    if (st("error")) return previewStrip() + head + errorBox("We couldn't load analytics.");
    const a = analyticsFor(f);
    const subs = submissionsFor(f);
    const emptyResults = st("empty") || (!a.views && !subs.length);
    if (emptyResults) return previewStrip() + head + `<div class="empty reveal"><div class="empty-art">${svg("chart", 34)}</div><h2>No results yet</h2><p>Once this form is published and starts receiving traffic, its funnel, submissions and A/B comparison will appear here.</p><div class="empty-cta"><button class="btn btn-primary" id="emptyEdit">${svg("edit", 15)} Back to builder</button></div></div>`;
    // funnel
    const conv = a.views ? (a.completions / a.views) * 100 : 0;
    const funnel = `<div class="panel reveal"><div class="panel-head"><div class="ph-ico">${svg("funnel", 16)}</div><h3>Funnel ${sampleTag()}</h3></div>
      <div class="funnel">${funnelStep("Views", a.views, a.views)}${funnelStep("Starts", a.starts, a.views)}${funnelStep("Completions", a.completions, a.views)}
        <div class="funnel-conv"><span class="fc-num mono">${pct(conv)}</span><span class="fc-lab">conversion</span></div></div></div>`;
    // per-step drop-off (multi-step)
    const stepKeys = Object.keys(a.by_step || {});
    const stepBars = stepKeys.length ? `<div class="panel reveal"><div class="panel-head"><div class="ph-ico">${svg("survey", 16)}</div><h3>Per-step drop-off ${sampleTag()}</h3></div>
      <div class="step-bars">${stepKeys.map((k) => { const max = Math.max(...stepKeys.map((s) => a.by_step[s])); const w = max ? (a.by_step[k] / max) * 100 : 0; return `<div class="step-bar"><span class="sb-lab mono">Step ${+k + 1}</span><span class="sb-track"><span class="sb-fill" style="width:${w}%"></span></span><span class="sb-val mono">${fmtInt(a.by_step[k])}</span></div>`; }).join("")}</div></div>` : "";
    // trend chart
    const trend = `<div class="panel reveal"><div class="panel-head"><div class="ph-ico">${svg("chart", 16)}</div><h3>Submissions over time ${sampleTag()}</h3></div>
      <div class="chart-wrap"><canvas id="trendChart"></canvas></div></div>`;
    // A/B compare
    const abKeys = Object.keys(a.ab || {});
    const ab = abKeys.length ? `<div class="panel reveal"><div class="panel-head"><div class="ph-ico">${svg("split", 16)}</div><h3>A/B comparison ${sampleTag()}</h3></div>
      <div class="ab-grid">${abKeys.map((k) => { const v = a.ab[k]; const c = v.views ? (v.submissions / v.views) * 100 : 0; return `<div class="ab-card"><div class="ab-top"><span class="ab-badge mono">Variant ${esc(k)}</span></div><div class="ab-conv mono">${pct(c)}</div><div class="ab-meta"><span><b class="num">${fmtInt(v.views)}</b> views</span><span><b class="num">${fmtInt(v.submissions)}</b> subs</span></div></div>`; }).join("")}</div></div>` : "";
    // submissions table (paginated)
    const perPage = 4; const pages = Math.ceil(subs.length / perPage) || 1; const page = Math.min(state.page, pages - 1);
    const slice = subs.slice(page * perPage, page * perPage + perPage);
    const table = `<div class="panel reveal"><div class="panel-head"><div class="ph-ico">${svg("forms", 16)}</div><h3>Submissions ${sampleTag()}</h3><span class="ph-count mono">${fmtInt(subs.length)}</span></div>
      <div class="table-wrap"><table class="res-table"><thead><tr><th>When</th><th>Contact</th><th>Email</th><th>Variant</th><th>Preview</th></tr></thead>
        <tbody>${slice.map((s) => `<tr><td class="mono">${esc(timeAgo(s.created_at))}</td><td>${esc(s.contact)}</td><td class="mono">${esc(s.email)}</td><td><span class="pill plain mono">${esc(s.variant || "—")}</span></td><td class="res-prev">${esc(Object.values(s.answers).join(" · ").slice(0, 48))}</td></tr>`).join("")}</tbody></table></div>
      ${pages > 1 ? `<div class="pager"><button class="btn btn-ghost btn-sm" id="pgPrev" ${page === 0 ? "disabled" : ""}>Prev</button><span class="mono">Page ${page + 1} / ${pages}</span><button class="btn btn-ghost btn-sm" id="pgNext" ${page >= pages - 1 ? "disabled" : ""}>Next</button></div>` : ""}</div>`;
    return previewStrip() + head + funnel + stepBars + trend + ab + table;
  }
  function funnelStep(label, val, base) {
    const w = base ? Math.max((val / base) * 100, 4) : 4;
    return `<div class="funnel-step"><div class="fs-bar" style="width:${w}%"><span class="fs-val mono">${fmtInt(val)}</span></div><span class="fs-lab">${label}</span></div>`;
  }
  function skeletonBlock() { return `<div class="skb" style="height:120px;border-radius:var(--r-lg)"></div>`; }

  function analyticsFor(f) {
    if (st("success")) return { views: 3200, starts: 1400, completions: 620, submissions: 620, conversion: 0.1937, by_step: {}, ab: { A: { views: 1650, submissions: 340 }, B: { views: 1550, submissions: 280 } } };
    if (!connected()) return MOCK.analytics[f.id] || { views: 0, starts: 0, completions: 0, submissions: 0, conversion: 0, by_step: {}, ab: {} };
    return state.resultsAnalytics || { views: 0, starts: 0, completions: 0, submissions: 0, conversion: 0, by_step: {}, ab: {} };
  }
  function submissionsFor(f) {
    if (st("empty")) return [];
    if (!connected()) return f.id === "form-contact" ? MOCK.submissions : (f.subs ? MOCK.submissions.slice(0, 2) : []);
    return state.submissions || [];
  }
  function seriesFor(f) {
    if (st("success")) return [10, 14, 12, 18, 22, 20, 26, 24, 30, 28, 34, 32, 38, 40];
    if (!connected()) return MOCK.series[f.id] || [];
    return state.resultsSeries || [];
  }

  function wireResults(id) {
    const f = state.forms.find((x) => x.id === id);
    $("#backForms")?.addEventListener("click", () => (location.hash = "#/forms"));
    $("#backList")?.addEventListener("click", () => (location.hash = "#/forms"));
    $("#emptyEdit")?.addEventListener("click", () => (location.hash = "#/forms/" + id + "/edit"));
    $("#csvBtn")?.addEventListener("click", () => exportCsv(f));
    $("#pgPrev")?.addEventListener("click", () => { state.page = Math.max(0, state.page - 1); render(); });
    $("#pgNext")?.addEventListener("click", () => { state.page = state.page + 1; render(); });
    if (connected()) loadResults(id);
    else { state.chart = true; drawResultsCharts(f); }
  }
  async function loadResults(id) {
    try {
      const db = ensureClient();
      const [{ data: a }, { data: subs }] = await Promise.all([
        db.rpc("form_analytics", { p_form: id }),
        db.from("form_submissions").select("id,created_at,variant,answers_json,contacts(first_name,last_name,email)").eq("form_id", id).order("created_at", { ascending: false }).limit(50),
      ]);
      state.resultsAnalytics = a || null;
      state.submissions = (subs || []).map((s) => ({ id: s.id, created_at: s.created_at, variant: s.variant, contact: [s.contacts?.first_name, s.contacts?.last_name].filter(Boolean).join(" ") || "—", email: s.contacts?.email || "—", answers: s.answers_json || {} }));
      state.chart = true; render();
    } catch (e) { toast(e.message, "error"); }
  }
  function drawResultsCharts(f) {
    const cv = $("#trendChart"); if (!cv || !window.Chart) return;
    f = f || state.editing || state.forms.find((x) => location.hash.includes(x.id));
    const data = seriesFor(f || {});
    if (state._chart) { try { state._chart.destroy(); } catch (e) {} }
    if (!data.length) return;
    const teal = css("--teal-500"), gold = css("--gold-500"), ink = css("--ink-400"), line = css("--line"), cardSolid = css("--card-solid");
    state._chart = new window.Chart(cv, {
      type: "line",
      data: { labels: data.map((_, i) => i + 1), datasets: [{ label: "Submissions", data, borderColor: teal, backgroundColor: alpha(teal, .12), borderWidth: 2, fill: true, tension: .35, pointRadius: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: reduce ? false : { duration: 500 },
        plugins: { legend: { display: false }, tooltip: { backgroundColor: cardSolid, titleColor: ink, bodyColor: ink, borderColor: line, borderWidth: 1, displayColors: false, padding: 10 } },
        scales: { x: { grid: { display: false }, ticks: { color: ink, font: { size: 10 }, maxTicksLimit: 7 } }, y: { beginAtZero: true, grid: { color: line }, border: { display: false }, ticks: { color: ink, font: { size: 10 }, precision: 0, maxTicksLimit: 5 } } } },
    });
  }
  function css(name) { return getComputedStyle(root).getPropertyValue(name).trim() || "#2CA4AB"; }
  function alpha(color, a) { const m = color.match(/rgba?\(([^)]+)\)/); if (m) { const p = m[1].split(",").slice(0, 3).map((s) => s.trim()); return `rgba(${p.join(",")},${a})`; } if (color.startsWith("#")) { let h = color.slice(1); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; } return color; }

  function exportCsv(f) {
    if (connected()) {
      const db = ensureClient(); const cfg = getCfg();
      db.functions.invoke("forms-export", { body: { form_id: f.id } }).then(({ data, error }) => {
        if (error) return toast(error.message || "Export failed", "error");
        toast("CSV export requested", "success");
      }).catch((e) => toast(e.message, "error"));
      return;
    }
    // mockup: build a CSV from sample submissions
    const subs = submissionsFor(f); if (!subs.length) return toast("No submissions to export", "info");
    const cols = ["created_at", "contact", "email", "variant"];
    const csv = [cols.join(","), ...subs.map((s) => cols.map((c) => `"${String(s[c] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob);
    const a = el("a"); a.href = url; a.download = f.name.replace(/\s+/g, "-").toLowerCase() + "-submissions.csv"; a.click(); URL.revokeObjectURL(url);
    toast("CSV downloaded (sample)", "success");
  }

  /* ── Modal ──────────────────────────────────────────────────────────────── */
  function modal(html, cls = "") {
    const r = $("#modalRoot");
    r.innerHTML = `<div class="mo-scrim" id="moScrim"></div><div class="mo ${cls}" role="dialog" aria-modal="true">${html}</div>`;
    r.classList.add("open");
    $("#moScrim").addEventListener("click", closeModal);
    $$("[data-close]", r).forEach((b) => b.addEventListener("click", closeModal));
    document.addEventListener("keydown", escClose);
  }
  function closeModal() { $("#modalRoot").classList.remove("open"); $("#modalRoot").innerHTML = ""; document.removeEventListener("keydown", escClose); }
  function escClose(e) { if (e.key === "Escape") closeModal(); }

  /* ── time helpers ───────────────────────────────────────────────────────── */
  function timeAgo(iso) {
    if (!iso) return "—"; const s = Math.max(1, Math.floor((Date.now() - new Date(iso)) / 1000));
    if (s < 60) return s + "s ago"; const m = Math.floor(s / 60); if (m < 60) return m + "m ago";
    const h = Math.floor(m / 60); if (h < 24) return h + "h ago"; const d = Math.floor(h / 24); return d + "d ago";
  }

  /* ── ⌘K focuses search ──────────────────────────────────────────────────── */
  document.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("#tbSearch")?.focus(); } });

  window.addEventListener("hashchange", render);
  boot();
})();
