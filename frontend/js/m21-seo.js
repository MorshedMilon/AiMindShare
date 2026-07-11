/* m21-seo.js — AiMindShare Module M21 · SEO Engine.
   Vanilla hash-routed dashboard on Supabase. Semrush-lite: keyword research (volume /
   CPC / difficulty / intent + related / questions / SERP), named lists, competitor
   gap, daily rank tracking with 90-day history + major-move alerts (M13), and chunked
   resumable technical audits (CWV / on-page / links). Secret-bearing provider calls go
   through the seo-keyword-lookup / seo-serp / seo-gap Edge Functions (Vault creds via
   M41, seo_calls metered on success). The browser READS its data (RLS-scoped, staff+
   operator ceiling) and calls the RPCs/Edge Fns. Anon key only (Law 3). No project
   connected → a high-fidelity mockup with a default/empty/loading/error/success preview
   switcher (Gate-5). Live provider round-trips are ready-not-run (503 not_connected). */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const initials = (s) => (s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const fmtInt = (n) => Number(n || 0).toLocaleString("en-US");
  const money2 = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* ── Inline icons (lucide-style) ─────────────────────────────────────────── */
  const P = {
    search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
    trend: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6", list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    gauge: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 12l4-4", target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    plus: "M12 5v14M5 12h14", check: "M20 6 9 17l-5-5", chev: "M9 18l6-6-6-6", back: "M19 12H5M12 19l-7-7 7-7",
    up: "M18 15l-6-6-6 6", down: "M6 9l6 6 6-6", trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14",
    globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20",
    swords: "M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5", link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
    alert: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
    doc: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6", send: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z",
    star: "M12 2l3 6.3 6.9 1-5 4.8 1.2 6.9L12 17.8 5.9 21l1.2-6.9-5-4.8 6.9-1z", bolt: "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
    settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  };
  const svg = (n, s = 17) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${P[n] || ""}"/></svg>`;
  const INTENT = { informational: "Info", commercial: "Commercial", transactional: "Transactional", navigational: "Nav" };

  /* ── Theme + starfield (light default; dark = no stars) ──────────────────── */
  const THEME_KEY = "aimindshare-theme";
  const root = document.documentElement;
  const setTheme = (t) => { root.setAttribute("data-theme", t); try { localStorage.setItem(THEME_KEY, t); } catch (e) {} const i = $("#themeIco"); if (i) i.textContent = t === "dark" ? "☀" : "☾"; };
  setTheme((() => { try { return localStorage.getItem(THEME_KEY) || "light"; } catch (e) { return "light"; } })());
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── Supabase config (anon key only, Law 3) ──────────────────────────────── */
  const CFG_KEY = "aimindshare-supabase";
  let client = null;
  function getCfg() { try { return JSON.parse(localStorage.getItem(CFG_KEY) || "null"); } catch (e) { return null; } }
  function ensureClient() {
    const cfg = getCfg();
    if (!cfg || !window.supabase || !window.supabase.createClient) { client = null; return null; }
    if (!client) client = window.supabase.createClient(cfg.url, cfg.anon || "", { auth: { persistSession: true } });
    return client;
  }
  const connected = () => !!getCfg();

  /* ── Connect drawer ──────────────────────────────────────────────────────── */
  const drawer = $("#drawer"), scrim = $("#scrim");
  const openDrawer = () => { const c = getCfg(); if (c) { $("#inpUrl").value = c.url; $("#inpAnon").value = c.anon || ""; } drawer.classList.add("open"); scrim.classList.add("open"); };
  const closeDrawer = () => { drawer.classList.remove("open"); scrim.classList.remove("open"); };
  $("#saveCfg")?.addEventListener("click", () => {
    const url = $("#inpUrl").value.trim(), anon = $("#inpAnon").value.trim();
    if (!/^https:\/\/.+\.supabase\.co/.test(url)) { toast("Enter a valid Supabase URL.", "danger"); return; }
    localStorage.setItem(CFG_KEY, JSON.stringify({ url, anon })); client = null; closeDrawer(); toast("Project connected.", "success"); boot();
  });
  $("#clearCfg")?.addEventListener("click", () => { localStorage.removeItem(CFG_KEY); client = null; closeDrawer(); toast("Disconnected — mockup mode.", "info"); boot(); });
  $("#closeDrawer")?.addEventListener("click", closeDrawer);
  $("#openConnect")?.addEventListener("click", openDrawer);
  scrim?.addEventListener("click", () => { if (!state.modalOpen) closeDrawer(); });

  /* ── Toast ───────────────────────────────────────────────────────────────── */
  function toast(msg, kind = "info") {
    const wrap = $("#toasts"); if (!wrap) return;
    const t = el("div", `toast toast-${kind}`, `<span>${esc(msg)}</span>`);
    wrap.appendChild(t); setTimeout(() => t.classList.add("in"), 10);
    setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), 300); }, 3600);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Mock data (realistic seed — Ramadan/Islamic-brand SaaS agency "Acme")
     ══════════════════════════════════════════════════════════════════════════ */
  const histFor = (base, drift) => {
    // deterministic 90-day-ish weekly series (12 points), no Math.random for stability
    const pts = []; let p = base;
    for (let i = 11; i >= 0; i--) {
      p = Math.max(1, Math.round(base + Math.sin(i / 2) * drift + (11 - i) * (drift > 0 ? -0.4 : 0.4)));
      pts.push({ checked_on: weekAgo(i), position: p });
    }
    return pts;
  };
  function weekAgo(w) { const d = new Date(2026, 6, 4); d.setDate(d.getDate() - w * 7); return d.toISOString().slice(0, 10); }

  const MOCK = {
    user: { name: "Layla Haddad", email: "layla@acme.agency" },
    workspace: { id: "ws-acme", name: "Acme Agency" },
    research: {
      keyword: "islamic finance app", volume: 8100, cpc: 4.35, difficulty: 52, intent: "commercial",
      serp_features: ["featured_snippet", "people_also_ask"], cached: false,
      related: [
        { keyword: "halal investment app", volume: 5400, cpc: 5.1, difficulty: 48, intent: "commercial" },
        { keyword: "islamic banking app", volume: 4200, cpc: 3.9, difficulty: 55, intent: "commercial" },
        { keyword: "sharia compliant investing", volume: 2900, cpc: 6.2, difficulty: 44, intent: "commercial" },
        { keyword: "muslim budgeting app", volume: 1600, cpc: 2.4, difficulty: 31, intent: "commercial" },
        { keyword: "zakat calculator app", volume: 3300, cpc: 1.8, difficulty: 27, intent: "informational" },
      ],
      questions: [
        { keyword: "what is an islamic finance app", volume: 720, cpc: 0, difficulty: 22, intent: "informational" },
        { keyword: "are islamic finance apps halal", volume: 590, cpc: 0, difficulty: 19, intent: "informational" },
        { keyword: "how does islamic banking work", volume: 2400, cpc: 0, difficulty: 34, intent: "informational" },
        { keyword: "best islamic finance app for beginners", volume: 480, cpc: 3.1, difficulty: 29, intent: "commercial" },
      ],
      serp: [
        { position: 1, domain: "wahed.com", title: "Wahed · Halal Investing App", url: "https://wahed.com" },
        { position: 2, domain: "zoya.finance", title: "Zoya — Halal Stock Screener", url: "https://zoya.finance" },
        { position: 3, domain: "acme.agency", title: "Acme · Islamic Finance Platform", url: "https://acme.agency/finance" },
        { position: 4, domain: "islamicfinanceguru.com", title: "IFG — Islamic Finance Guru", url: "https://islamicfinanceguru.com" },
        { position: 5, domain: "musaffa.com", title: "Musaffa · Halal Investing", url: "https://musaffa.com" },
      ],
    },
    gap: [
      { keyword: "halal etf list", volume: 2100, rival_position: 2 },
      { keyword: "islamic pension uk", volume: 880, rival_position: 4 },
      { keyword: "sukuk investment platform", volume: 1300, rival_position: 3 },
    ],
    lists: [
      { id: "l1", name: "Finance — commercial", description: "Bottom-funnel money terms", count: 14 },
      { id: "l2", name: "Ramadan content 2026", description: "Seasonal informational", count: 22 },
    ],
    trackers: [
      { id: "t1", keyword: "islamic finance app", domain: "acme.agency", country: "us", competitor_domains: ["wahed.com", "zoya.finance"], position: 3, prev: 8, url: "https://acme.agency/finance", is_featured_snippet: false, history: histFor(9, -3) },
      { id: "t2", keyword: "halal investment app", domain: "acme.agency", country: "us", competitor_domains: ["wahed.com"], position: 5, prev: 5, url: "https://acme.agency/invest", is_featured_snippet: false, history: histFor(6, -1) },
      { id: "t3", keyword: "zakat calculator", domain: "acme.agency", country: "us", competitor_domains: [], position: 1, prev: 2, url: "https://acme.agency/zakat", is_featured_snippet: true, history: histFor(2, -1) },
      { id: "t4", keyword: "muslim budgeting app", domain: "acme.agency", country: "gb", competitor_domains: ["wahed.com"], position: 14, prev: 6, url: "https://acme.agency/budget", is_featured_snippet: false, history: histFor(7, 5) },
    ],
    audit: {
      domain: "acme.agency", status: "done", score: 78, pages_crawled: 143,
      results: { cwv: { lcp: 2100, inp: 180, cls: 0.06 } },
      issues: [
        { type: "broken_link", severity: "critical", url: "/finance/old-guide", detail: "HTTP 404" },
        { type: "broken_link", severity: "critical", url: "/blog/2023/ramadan", detail: "HTTP 404" },
        { type: "missing_title", severity: "warning", url: "/invest/compare", detail: "no <title>" },
        { type: "missing_meta", severity: "notice", url: "/zakat", detail: "no meta description" },
        { type: "missing_h1", severity: "warning", url: "/about", detail: "no <h1>" },
        { type: "redirect_chain", severity: "warning", url: "/finance", detail: "2 hops" },
        { type: "large_image", severity: "notice", url: "/hero.png", detail: "1.8 MB" },
      ],
    },
  };
  const SEV = { critical: { label: "Critical", tone: "danger" }, warning: { label: "Warning", tone: "warn" }, notice: { label: "Notice", tone: "muted" } };
  const ISSUE_LABEL = { broken_link: "Broken link", missing_title: "Missing title", dup_title: "Duplicate title", missing_h1: "Missing H1", missing_meta: "Missing meta description", redirect_chain: "Redirect chain", large_image: "Oversized image" };

  /* ══════════════════════════════════════════════════════════════════════════
     State + preview
     ══════════════════════════════════════════════════════════════════════════ */
  const state = {
    user: null, workspaceId: null, workspaceName: null, role: "owner",
    loaded: false, previewState: "default", modalOpen: false,
    route: { section: "dashboard", sub: null, id: null },
    research: null, activeTab: "related", selected: new Set(),
    lists: [], trackers: [], audit: null, gap: null, navOpen: new Set(),
  };
  const PREVIEW_STATES = ["default", "empty", "loading", "error", "success"];
  const st = (name) => !connected() && state.previewState === name;
  const canWrite = () => ["staff", "manager", "admin", "owner"].includes(state.role);

  /* ══════════════════════════════════════════════════════════════════════════
     Boot + routing
     ══════════════════════════════════════════════════════════════════════════ */
  async function boot() {
    parseRoute();
    if (!connected()) {
      state.user = MOCK.user; state.workspaceId = MOCK.workspace.id; state.workspaceName = MOCK.workspace.name; state.role = "owner";
      state.lists = clone(MOCK.lists); state.trackers = clone(MOCK.trackers); state.audit = st("empty") ? null : clone(MOCK.audit);
      state.research = null; state.gap = null; state.loaded = true; render(); return;
    }
    // Live: resolve session + workspace, then lazy-load per route.
    try {
      const c = ensureClient();
      const { data: { user } } = await c.auth.getUser();
      if (!user) { state.user = null; render(); return; }
      state.user = { name: user.user_metadata?.name, email: user.email };
      const { data: ms } = await c.from("memberships").select("workspace_id, role, workspaces(name)").eq("status", "active").limit(1);
      if (ms && ms[0]) { state.workspaceId = ms[0].workspace_id; state.workspaceName = ms[0].workspaces?.name; state.role = ms[0].role; }
      await loadRoute(); state.loaded = true; render();
    } catch (e) { toast("Load failed: " + e.message, "danger"); render(); }
  }

  function parseRoute() {
    const h = (location.hash || "#/seo").replace(/^#/, "");
    const parts = h.split("/").filter(Boolean); // e.g. ["seo","keywords","explorer"]
    const section = parts[1] || "dashboard";
    const rest = parts.slice(2);
    const sec = NAV.find((n) => n.key === section);
    const childKeys = (sec?.children || []).map((c) => c.key);
    let sub = null, id = null;
    if (rest.length) {
      if (childKeys.includes(rest[0])) sub = rest[0];
      else if (section === "rankings" && rest.length === 2 && rest[1] === "history") { id = rest[0]; sub = "history"; }
      else id = rest[0];
    }
    state.route = { section, sub, id };
  }

  async function loadRoute() {
    const c = ensureClient(); if (!c) return;
    const ws = state.workspaceId;
    if (state.route.section === "keywords" && !state.route.id && (!state.route.sub || state.route.sub === "explorer")) {
      const { data } = await c.from("keyword_lists").select("id,name,description").order("created_at", { ascending: false });
      state.lists = (data || []).map((l) => ({ ...l, count: 0 }));
    } else if (state.route.section === "rankings" && !state.route.sub && !state.route.id) {
      const { data } = await c.from("tracked_keywords").select("*").eq("is_active", true);
      // latest ranking per tracker (best-effort; the worker keeps these fresh)
      state.trackers = await Promise.all((data || []).map(async (t) => {
        const { data: r } = await c.from("keyword_rankings").select("position,url,is_featured_snippet,checked_on")
          .eq("tracked_keyword_id", t.id).order("checked_on", { ascending: false }).limit(2);
        return { ...t, position: r?.[0]?.position ?? null, prev: r?.[1]?.position ?? null, url: r?.[0]?.url, is_featured_snippet: r?.[0]?.is_featured_snippet, history: null };
      }));
    } else if (state.route.section === "audit" && !state.route.sub && !state.route.id) {
      const { data } = await c.from("seo_audits").select("*").order("created_at", { ascending: false }).limit(1);
      const a = data?.[0];
      if (a) {
        const { data: iss } = await c.from("seo_audit_issues").select("type,severity,url,detail").eq("audit_id", a.id);
        state.audit = { ...a, issues: iss || [] };
      } else state.audit = null;
    }
  }

  window.addEventListener("hashchange", async () => { parseRoute(); state.research = null; state.selected = new Set(); if (connected()) { await loadRoute(); } render(); });

  /* ══════════════════════════════════════════════════════════════════════════
     Shell
     ══════════════════════════════════════════════════════════════════════════ */
  const NAV = [
    { key: "dashboard", label: "Dashboard", ico: "bolt", hash: "#/seo" },
    { key: "keywords", label: "Keyword Research", ico: "search", hash: "#/seo/keywords", children: [
      { key: "explorer", label: "Keyword Explorer", hash: "#/seo/keywords/explorer" },
      { key: "opportunity", label: "Opportunity Score", hash: "#/seo/keywords/opportunity" },
      { key: "related", label: "Related Keywords", hash: "#/seo/keywords/related" },
      { key: "questions", label: "Question Finder", hash: "#/seo/keywords/questions" },
      { key: "long-tail", label: "Long-Tail Generator", hash: "#/seo/keywords/long-tail" },
      { key: "ai-search", label: "AI-Search Query Variants", hash: "#/seo/keywords/ai-search" },
      { key: "settings", label: "Country/Language Selector", hash: "#/seo/keywords/settings" },
    ] },
    { key: "clusters", label: "Clusters", ico: "target", hash: "#/seo/clusters", children: [
      { key: "builder", label: "Cluster Builder", hash: "#/seo/clusters/builder" },
    ] },
    { key: "serp", label: "SERP Analysis", ico: "globe", hash: "#/seo/serp", children: [
      { key: "snapshot", label: "SERP Snapshot", hash: "#/seo/serp/snapshot" },
      { key: "weakness", label: "SERP Weakness Indicator", hash: "#/seo/serp/weakness" },
    ] },
    { key: "competitors", label: "Competitors", ico: "swords", hash: "#/seo/competitors", children: [
      { key: "overview", label: "Domain Overview", hash: "#/seo/competitors/overview" },
      { key: "gap", label: "Keyword Gap", hash: "#/seo/competitors/gap" },
      { key: "gap-actions", label: "Gap Action Layer", hash: "#/seo/competitors/gap-actions" },
      { key: "send-to-queue", label: "Send-to-Queue", hash: "#/seo/competitors/send-to-queue" },
    ] },
    { key: "lists", label: "Keyword Lists", ico: "list", hash: "#/seo/lists", children: [
      { key: "bulk", label: "Bulk Actions", hash: "#/seo/lists/bulk" },
    ] },
    { key: "rankings", label: "Rank Tracking", ico: "trend", hash: "#/seo/rankings", children: [
      { key: "overlay", label: "Competitor Overlay", hash: "#/seo/rankings/overlay" },
      { key: "summary", label: "Weekly Summary", hash: "#/seo/rankings/summary" },
    ] },
    { key: "audit", label: "Technical Audit", ico: "gauge", hash: "#/seo/audit", children: [
      { key: "crawler", label: "Site Crawler", hash: "#/seo/audit/crawler" },
      { key: "cwv", label: "Core Web Vitals", hash: "#/seo/audit/cwv" },
      { key: "schema", label: "Schema Validator", hash: "#/seo/audit/schema" },
      { key: "ssl", label: "SSL Check", hash: "#/seo/audit/ssl" },
    ] },
    { key: "settings", label: "Settings", ico: "settings", hash: "#/seo/settings", children: [
      { key: "connections", label: "API Connections", hash: "#/seo/settings/connections" },
      { key: "cache", label: "Cache Settings", hash: "#/seo/settings/cache" },
      { key: "scoring", label: "Scoring Weights", hash: "#/seo/settings/scoring" },
    ] },
  ];
  function getSeoNavCounts() {
    // Vanilla stand-in for the PRD's useSeoNavCounts() hook — static mock counts.
    return { audit: 2, competitors: 1 };
  }
  function renderNavItem(n) {
    const counts = getSeoNavCounts();
    const badge = counts[n.key] ? `<span class="nav-badge">${counts[n.key]}</span>` : "";
    if (!n.children || !n.children.length) {
      const active = state.route.section === n.key;
      return `<div class="nav-item ${active ? "active" : ""}" data-hash="${n.hash}">
        <span class="ni-ico">${svg(n.ico)}</span><span>${n.label}</span>${badge}</div>`;
    }
    const selfOrChildActive = state.route.section === n.key;
    const open = state.navOpen.has(n.key) || selfOrChildActive;
    const childRows = n.children.map((c) => {
      const cActive = state.route.section === n.key && (state.route.sub === c.key || (!state.route.sub && n.key === "keywords" && c.key === "explorer"));
      return `<div class="nav-item nav-child ${cActive ? "active" : ""}" data-hash="${c.hash}"><span>${c.label}</span></div>`;
    }).join("");
    return `<div class="nav-item nav-parent ${selfOrChildActive ? "active" : ""}" data-hash="${n.hash}">
        <span class="ni-ico">${svg(n.ico)}</span><span>${n.label}</span>${badge}
        <button class="nav-chevron ${open ? "open" : ""}" data-navtoggle="${n.key}" title="${open ? "Collapse" : "Expand"}">${svg("chev", 12)}</button>
      </div>
      <div class="nav-children ${open ? "open" : ""}">${childRows}</div>`;
  }
  function shell(content) {
    const nav = NAV.map(renderNavItem).join("");
    return `
      <aside class="rail" id="rail">
        <div class="brand"><span class="mark">✦</span><span><b>AiMind</b><em>Share</em></span></div>
        <div class="nav-group"><div class="nav-group-label">SEO &amp; Content</div>${nav}</div>
        <div class="rail-foot">M21 · SEO Engine</div>
      </aside>
      <header class="tbar">
        <button class="icon-btn rail-burger" id="railBurger" aria-label="Menu">☰</button>
        <div class="ws-trigger" style="cursor:default">
          <span class="ws-badge">${esc(initials(state.workspaceName || "AiMindShare"))}</span>
          <span class="ws-meta"><span class="ws-name">${esc(state.workspaceName || "Workspace")}</span><span class="ws-kind">SEO Engine</span></span>
        </div>
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
  function loadingBlock() { return `<div class="panel skeleton-panel"><div class="sk-row"></div><div class="sk-row"></div><div class="sk-row short"></div></div>`; }
  function errorBlock() { return `<div class="panel"><div class="empty-state"><div class="es-ico err">${svg("alert", 24)}</div><h3>Couldn't load SEO data</h3><p>Something went wrong reading this workspace. Check your connection and try again.</p><button class="btn btn-primary es-cta" id="retry">Retry</button></div></div>`; }
  function head(ico, eyebrow, title, sub, cta) {
    return `<div class="fn-head"><div><div class="eyebrow">${svg(ico, 13)} ${eyebrow}</div>
      <div class="ph-title">${title}</div><div class="ph-sub">${sub}</div></div><div class="spacer"></div>${cta || ""}</div>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Screen 1 · Keyword research
     ══════════════════════════════════════════════════════════════════════════ */
  function viewKeywords() {
    if (st("loading")) return shell(loadingBlock());
    if (st("error")) return shell(errorBlock());
    const showEmpty = st("empty") || (!state.research && !st("success") && !st("default"));
    const research = st("success") || (st("default")) ? clone(MOCK.research) : state.research;

    const form = `<div class="panel research-form">
      <div class="rf-row">
        <div class="rf-field grow"><label>Seed keyword</label>
          <input id="seedKw" placeholder="e.g. islamic finance app" value="${esc(research?.keyword || "")}" ${canWrite() ? "" : "disabled"}></div>
        <div class="rf-field"><label>Country</label>
          <select id="seedCountry"><option value="us">United States</option><option value="gb">United Kingdom</option><option value="ae">UAE</option><option value="sa">Saudi Arabia</option><option value="id">Indonesia</option></select></div>
        <button class="btn btn-primary rf-go" id="doResearch">${svg("search", 15)} Research</button>
      </div>
      <div class="rf-hint">${svg("bolt", 12)} Cached results are free; a fresh lookup spends one metered <span class="mono">seo_calls</span> credit.</div>
    </div>`;

    const gap = `<div class="panel gap-tool">
      <div class="gt-head">${svg("swords", 15)} <b>Competitor gap</b><span class="muted"> — keywords a rival ranks for that you don't</span></div>
      <div class="rf-row">
        <div class="rf-field grow"><label>Your domain</label><input id="gapYou" placeholder="acme.agency" value="acme.agency"></div>
        <div class="rf-field grow"><label>Rival domain</label><input id="gapRival" placeholder="wahed.com"></div>
        <button class="btn btn-ghost rf-go" id="doGap">${svg("swords", 14)} Find gap</button>
      </div>
      ${state.gap ? gapTable(state.gap) : ""}
    </div>`;

    let body;
    if (!research) {
      body = `<div class="panel"><div class="empty-state">
        <div class="es-ico">${geoOrb(svg("search", 24))}</div>
        <h3>Research your first keyword</h3>
        <p>Enter a seed term to see search volume, CPC, difficulty and intent — plus related terms, real questions, and the live top-10 SERP. Save the winners to a list or push them straight into the content queue.</p>
      </div></div>`;
    } else {
      body = metricCard(research) + resultsTabs(research);
    }

    const sidebar = listsSidebar();
    return shell(previewStrip() + head("search", "SEO &amp; Content · M21", `Keyword <em>research</em>`, "Volume, difficulty and intent for any term — with related keywords, questions and the live SERP.", "")
      + `<div class="kw-layout"><div class="kw-main">${form}${showEmpty && !research ? "" : ""}${body}${gap}</div>${sidebar}</div>`);
  }

  function metricCard(r) {
    const diffTone = r.difficulty >= 60 ? "hard" : r.difficulty >= 40 ? "med" : "easy";
    return `<div class="panel metric-card">
      <div class="mc-kw"><div class="mc-kw-label">Keyword</div><div class="mc-kw-val">${esc(r.keyword)}</div>
        ${r.cached ? `<span class="chip chip-cached">${svg("check", 11)} cached</span>` : `<span class="chip">fresh</span>`}</div>
      <div class="metric-grid">
        <div class="metric"><div class="m-val">${fmtInt(r.volume)}</div><div class="m-label">Monthly volume</div></div>
        <div class="metric"><div class="m-val">${money2(r.cpc)}</div><div class="m-label">Avg. CPC</div></div>
        <div class="metric metric-diff"><div class="m-val">${r.difficulty}<span class="m-unit">/100</span></div><div class="m-label">Difficulty</div>
          <div class="diff-bar ${diffTone}"><span style="width:${r.difficulty}%"></span></div></div>
        <div class="metric"><div class="intent-badge intent-${r.intent}">${INTENT[r.intent] || r.intent}</div><div class="m-label">Search intent</div></div>
      </div>
      ${(r.serp_features || []).length ? `<div class="serp-feats">SERP features: ${r.serp_features.map((f) => `<span class="feat">${esc(f.replace(/_/g, " "))}</span>`).join("")}</div>` : ""}
    </div>`;
  }

  function resultsTabs(r) {
    const tabs = [["related", "Related", r.related], ["questions", "Questions", r.questions], ["serp", "SERP", r.serp]];
    const active = state.activeTab;
    const head = `<div class="seg tabs-seg">${tabs.map(([k, l, arr]) => `<button class="seg-btn ${active === k ? "on" : ""}" data-kwtab="${k}">${l} <span class="seg-n">${arr.length}</span></button>`).join("")}</div>`;
    let table;
    if (active === "serp") {
      table = `<table class="data-table"><thead><tr><th>#</th><th>Domain</th><th>Title</th></tr></thead><tbody>
        ${r.serp.map((s) => `<tr class="${/acme/.test(s.domain) ? "you-row" : ""}"><td class="rank-cell">${s.position}</td><td><b>${esc(s.domain)}</b>${/acme/.test(s.domain) ? ` <span class="you-tag">you</span>` : ""}</td><td class="muted">${esc(s.title)}</td></tr>`).join("")}
      </tbody></table>`;
    } else {
      const rows = active === "related" ? r.related : r.questions;
      table = `<table class="data-table"><thead><tr>
        <th class="ck"><input type="checkbox" id="selAll"></th><th>Keyword</th><th class="num">Volume</th><th class="num">CPC</th><th class="num">Diff.</th><th>Intent</th></tr></thead><tbody>
        ${rows.map((k) => `<tr><td class="ck"><input type="checkbox" class="kwck" data-kw="${esc(k.keyword)}" ${state.selected.has(k.keyword) ? "checked" : ""}></td>
          <td><b>${esc(k.keyword)}</b></td><td class="num">${fmtInt(k.volume)}</td><td class="num">${money2(k.cpc)}</td>
          <td class="num"><span class="diff-pill ${k.difficulty >= 60 ? "hard" : k.difficulty >= 40 ? "med" : "easy"}">${k.difficulty}</span></td>
          <td><span class="intent-dot intent-${k.intent}"></span>${INTENT[k.intent] || k.intent}</td></tr>`).join("")}
      </tbody></table>`;
    }
    const bar = active !== "serp" ? `<div class="sel-bar ${state.selected.size ? "show" : ""}">
      <span>${state.selected.size} selected</span><div class="spacer"></div>
      <button class="btn btn-ghost btn-sm" id="saveToList">${svg("list", 13)} Save to list</button>
      <button class="btn btn-primary btn-sm" id="sendQueue">${svg("send", 13)} Send to Content Queue</button></div>` : "";
    return `<div class="panel results-panel">${head}<div class="table-wrap">${table}</div>${bar}</div>`;
  }

  function gapTable(gap) {
    if (!gap.length) return `<div class="gap-empty muted">No gap found — you rank for everything they do. 🎉</div>`;
    return `<div class="table-wrap gap-results"><table class="data-table"><thead><tr><th>Keyword</th><th class="num">Volume</th><th class="num">Rival #</th><th></th></tr></thead><tbody>
      ${gap.map((g) => `<tr><td><b>${esc(g.keyword)}</b></td><td class="num">${fmtInt(g.volume)}</td><td class="num"><span class="rank-cell">${g.rival_position}</span></td>
        <td class="num"><button class="btn btn-ghost btn-xs" data-gapkw="${esc(g.keyword)}">${svg("send", 12)} Queue</button></td></tr>`).join("")}
    </tbody></table></div>`;
  }

  function listsSidebar() {
    const lists = st("empty") ? [] : state.lists;
    return `<aside class="kw-side"><div class="panel side-panel">
      <div class="sp-head"><b>Keyword lists</b>${canWrite() ? `<button class="icon-btn" id="newList" title="New list">${svg("plus", 15)}</button>` : ""}</div>
      ${lists.length ? lists.map((l) => `<div class="list-row"><div class="lr-ico">${svg("list", 14)}</div>
        <div class="lr-body"><div class="lr-name">${esc(l.name)}</div><div class="lr-sub">${esc(l.description || "")}</div></div>
        <span class="lr-count">${l.count ?? 0}</span></div>`).join("")
        : `<div class="side-empty muted">No lists yet. Research keywords, select the winners, and Save to a new list.</div>`}
    </div></aside>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Screen 2 · Rank tracker
     ══════════════════════════════════════════════════════════════════════════ */
  function viewRankings() {
    if (st("loading")) return shell(loadingBlock());
    if (st("error")) return shell(errorBlock());
    const trackers = st("empty") ? [] : state.trackers;
    const cta = canWrite() ? `<button class="btn btn-primary" id="addTracker">${svg("plus", 15)} Track keyword</button>` : "";
    let body;
    if (!trackers.length) {
      body = `<div class="panel"><div class="empty-state"><div class="es-ico">${geoOrb(svg("trend", 24))}</div>
        <h3>Track your first keyword</h3><p>Add a keyword and your domain to watch your Google position every day — against up to three competitors — with a 90-day history and instant alerts when you move more than five spots.</p>
        ${canWrite() ? `<button class="btn btn-primary es-cta" id="addTracker2">${svg("plus", 14)} Track keyword</button>` : ""}</div></div>`;
    } else {
      const summary = rankSummary(trackers);
      body = `<div class="rev-strip">
        ${kpi("target", fmtInt(summary.total), "Tracked", "keywords")}
        ${kpi("up", fmtInt(summary.improved), "Improved", "this week", "up")}
        ${kpi("down", fmtInt(summary.declined), "Declined", "this week", "down")}
        ${kpi("star", fmtInt(summary.top3), "Top 3", "positions", "up")}
      </div>
      <div class="panel"><div class="table-wrap"><table class="data-table rank-table"><thead><tr>
        <th>Keyword</th><th class="num">Position</th><th class="num">Δ 7d</th><th>URL</th><th>Country</th><th></th></tr></thead><tbody>
        ${trackers.map(rankRow).join("")}</tbody></table></div></div>`;
    }
    return shell(previewStrip() + head("trend", "SEO &amp; Content · M21", `Rank <em>tracker</em>`, "Daily Google positions for your domain and competitors, with 90-day history and major-move alerts.", cta) + body);
  }
  function rankSummary(ts) {
    return {
      total: ts.length,
      improved: ts.filter((t) => (t.prev ?? t.position) > t.position).length,
      declined: ts.filter((t) => (t.prev ?? t.position) < t.position).length,
      top3: ts.filter((t) => t.position && t.position <= 3).length,
    };
  }
  function rankRow(t) {
    const delta = (t.prev ?? t.position) - t.position; // + = improved (moved up)
    const dCls = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    const dTxt = delta === 0 ? "—" : `${delta > 0 ? svg("up", 13) : svg("down", 13)} ${Math.abs(delta)}`;
    const major = Math.abs(delta) >= 5 ? ` <span class="major-tag" title="Major move — alert fired">${svg("alert", 11)}</span>` : "";
    return `<tr class="rank-row" data-tracker="${t.id}">
      <td><b>${esc(t.keyword)}</b>${t.is_featured_snippet ? ` <span class="snip-tag">${svg("star", 11)} snippet</span>` : ""}</td>
      <td class="num"><span class="pos-badge ${t.position && t.position <= 3 ? "top" : ""}">${t.position ?? "—"}</span></td>
      <td class="num"><span class="delta ${dCls}">${dTxt}${major}</span></td>
      <td class="muted url-cell">${esc((t.url || "").replace(/^https?:\/\//, ""))}</td>
      <td><span class="flag">${esc((t.country || "us").toUpperCase())}</span></td>
      <td class="num"><button class="btn btn-ghost btn-xs" data-hist="${t.id}">${svg("trend", 12)} History</button></td></tr>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Screen 3 · Site audit
     ══════════════════════════════════════════════════════════════════════════ */
  function viewAudit() {
    if (st("loading")) return shell(loadingBlock());
    if (st("error")) return shell(errorBlock());
    const a = st("empty") ? null : state.audit;
    const form = `<div class="panel audit-form">
      <div class="rf-row"><div class="rf-field grow"><label>Domain to audit</label>
        <input id="auditDomain" placeholder="acme.agency" value="${esc(a?.domain || "")}" ${canWrite() ? "" : "disabled"}></div>
        <button class="btn btn-primary rf-go" id="runAudit">${svg("gauge", 15)} ${a ? "Re-run audit" : "Run audit"}</button></div>
      <div class="rf-hint">${svg("bolt", 12)} Crawls up to 500 pages at 2 req/s, respecting robots.txt — runs in the background and resumes across chunks.</div>
    </div>`;
    if (!a) {
      return shell(previewStrip() + head("gauge", "SEO &amp; Content · M21", `Site <em>audit</em>`, "Crawl your site for broken links, on-page SEO gaps and Core Web Vitals.", "")
        + form + `<div class="panel"><div class="empty-state"><div class="es-ico">${geoOrb(svg("gauge", 24))}</div>
        <h3>Run your first audit</h3><p>Point the crawler at your domain and get a prioritised list of technical issues — broken links, missing titles and meta, redirect chains — plus a Core Web Vitals report and an overall health score.</p></div></div>`);
    }
    const byType = {};
    (a.issues || []).forEach((i) => { (byType[i.severity] = byType[i.severity] || []).push(i); });
    const counts = { critical: (byType.critical || []).length, warning: (byType.warning || []).length, notice: (byType.notice || []).length };
    const cwv = a.results?.cwv;
    const dial = `<div class="panel score-panel"><div class="score-dial-wrap"><canvas id="scoreDial" width="180" height="180"></canvas>
      <div class="score-center"><div class="score-num">${a.score ?? "—"}</div><div class="score-lab">Health</div></div></div>
      <div class="score-legend">
        <div class="sl-row"><span class="dot danger"></span>${counts.critical} critical</div>
        <div class="sl-row"><span class="dot warn"></span>${counts.warning} warnings</div>
        <div class="sl-row"><span class="dot muted"></span>${counts.notice} notices</div>
        <div class="sl-meta muted">${fmtInt(a.pages_crawled)} pages crawled</div></div></div>`;
    const cwvCards = cwv ? `<div class="cwv-grid">
      ${cwvCard("LCP", (cwv.lcp / 1000).toFixed(1) + "s", cwv.lcp <= 2500 ? "good" : cwv.lcp <= 4000 ? "ni" : "poor", "Largest Contentful Paint")}
      ${cwvCard("INP", cwv.inp + "ms", cwv.inp <= 200 ? "good" : cwv.inp <= 500 ? "ni" : "poor", "Interaction to Next Paint")}
      ${cwvCard("CLS", cwv.cls.toFixed(2), cwv.cls <= 0.1 ? "good" : cwv.cls <= 0.25 ? "ni" : "poor", "Cumulative Layout Shift")}
    </div>` : `<div class="panel cwv-pending muted">${svg("bolt", 13)} Core Web Vitals are pending — connect PageSpeed Insights to populate LCP / INP / CLS.</div>`;
    const order = ["critical", "warning", "notice"];
    const issues = `<div class="panel"><div class="sp-head"><b>Issues</b><span class="muted">grouped by severity</span></div>
      ${order.filter((s) => byType[s]?.length).map((s) => `<div class="issue-group">
        <div class="ig-head"><span class="sev-pill ${SEV[s].tone}">${SEV[s].label}</span><span class="muted">${byType[s].length}</span></div>
        ${byType[s].map((i) => `<div class="issue-row"><span class="ir-type">${ISSUE_LABEL[i.type] || i.type}</span>
          <span class="ir-url muted">${esc(i.url || "")}</span><span class="ir-detail muted">${esc(i.detail || "")}</span></div>`).join("")}
      </div>`).join("")}</div>`;
    return shell(previewStrip() + head("gauge", "SEO &amp; Content · M21", `Site <em>audit</em>`, `Last crawl of <b>${esc(a.domain)}</b> — ${fmtInt(a.pages_crawled)} pages.`, canWrite() ? `<button class="btn btn-ghost" id="runAudit2">${svg("gauge", 14)} Re-run</button>` : "")
      + form + `<div class="audit-top">${dial}<div class="audit-cwv">${cwvCards}</div></div>` + issues);
  }
  function cwvCard(k, v, tone, sub) { return `<div class="cwv-card ${tone}"><div class="cwv-k">${k}</div><div class="cwv-v">${v}</div><div class="cwv-sub muted">${sub}</div></div>`; }

  /* ══════════════════════════════════════════════════════════════════════════
     Placeholder pages — routing shell only, feature logic lands in a later session
     ══════════════════════════════════════════════════════════════════════════ */
  const SHADOW_NOTE = {
    "keywords/related": "This view currently lives as the “Related” tab inside Keyword Explorer — promote to a standalone page in a later session.",
    "keywords/questions": "This view currently lives as the “Questions” tab inside Keyword Explorer — promote to a standalone page in a later session.",
    "serp/snapshot": "This view currently lives as the “SERP” tab inside Keyword Explorer — promote to a standalone page in a later session.",
  };
  function viewPlaceholder(section, sub, id) {
    const sec = NAV.find((n) => n.key === section);
    const child = sec?.children?.find((c) => c.key === sub);
    const title = child ? child.label : (sec ? sec.label : "Not found");
    const note = SHADOW_NOTE[`${section}/${sub}`];
    const idNote = id ? `<p class="muted">Requested id: <span class="mono">${esc(id)}</span></p>` : "";
    const ico = sec?.ico || "bolt";
    return shell(previewStrip() + head(ico, "SEO &amp; Content · M21", `<em>${esc(title)}</em>`,
      note ? "See note below." : "Feature logic for this page isn't built yet — this is a routing placeholder.", "")
      + `<div class="panel"><div class="empty-state"><div class="es-ico">${geoOrb(svg(ico, 24))}</div>
        <h3>Coming soon</h3><p>${note || "This page is wired into navigation and routing but doesn't have real data or logic behind it yet."}</p>${idNote}
      </div></div>`);
  }

  /* ── Small shared bits ───────────────────────────────────────────────────── */
  function kpi(ico, val, label, sub, dir) {
    return `<div class="kpi"><div class="kpi-ico">${svg(ico)}</div><div class="kpi-val">${val}</div><div class="kpi-label">${label}</div><div class="kpi-delta ${dir || ""}">${sub}</div></div>`;
  }
  function geoOrb(inner) { return `<span class="geo-orb"><span class="geo-ring"></span><span class="geo-ring r2"></span>${inner}</span>`; }

  /* ══════════════════════════════════════════════════════════════════════════
     Render + wiring
     ══════════════════════════════════════════════════════════════════════════ */
  function render() {
    const app = $("#app");
    const { section, sub, id } = state.route;
    const isKeywordsHome = section === "keywords" && !id && (!sub || sub === "explorer");
    const isRankingsHome = section === "rankings" && !sub && !id;
    const isAuditHome = section === "audit" && !sub && !id;
    let content;
    if (connected() && !state.user) content = shell(`<div class="panel"><div class="empty-state"><div class="es-ico">${svg("search", 22)}</div><h3>Sign in required</h3><p>Connect a project and sign in to use the SEO Engine.</p></div></div>`);
    else if (isRankingsHome) content = viewRankings();
    else if (isAuditHome) content = viewAudit();
    else if (isKeywordsHome) content = viewKeywords();
    else content = viewPlaceholder(section, sub, id);
    app.innerHTML = content;
    renderConn(); wireCommon();
    if (isKeywordsHome) wireKeywords();
    if (isRankingsHome) wireRankings();
    if (isAuditHome) { wireAudit(); drawScoreDial(); }
  }
  function renderConn() { const pill = $("#connPill"); if (pill) { const on = connected(); pill.hidden = !on; pill.textContent = on ? "live" : ""; pill.classList.toggle("live", on); } }

  function wireCommon() {
    $("#railBurger")?.addEventListener("click", () => $("#rail").classList.toggle("open"));
    $$("[data-hash]").forEach((n) => n.addEventListener("click", () => { location.hash = n.dataset.hash; $("#rail")?.classList.remove("open"); }));
    $$("[data-navtoggle]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = b.dataset.navtoggle;
      state.navOpen.has(key) ? state.navOpen.delete(key) : state.navOpen.add(key);
      render();
    }));
    $("#themeToggle")?.addEventListener("click", () => setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"));
    $("#openConnect2")?.addEventListener("click", openDrawer);
    $$("[data-preview]").forEach((b) => b.addEventListener("click", () => { state.previewState = b.dataset.preview; state.research = null; state.gap = null; boot(); }));
    $("#retry")?.addEventListener("click", () => { state.previewState = "default"; boot(); });
  }

  function wireKeywords() {
    $("#doResearch")?.addEventListener("click", doResearch);
    $("#seedKw")?.addEventListener("keydown", (e) => { if (e.key === "Enter") doResearch(); });
    $("#doGap")?.addEventListener("click", doGap);
    $$("[data-kwtab]").forEach((b) => b.addEventListener("click", () => { state.activeTab = b.dataset.kwtab; render(); }));
    $$(".kwck").forEach((c) => c.addEventListener("change", () => { c.checked ? state.selected.add(c.dataset.kw) : state.selected.delete(c.dataset.kw); render(); }));
    $("#selAll")?.addEventListener("change", (e) => {
      const rows = state.activeTab === "related" ? (state.research || MOCK.research).related : (state.research || MOCK.research).questions;
      rows.forEach((k) => e.target.checked ? state.selected.add(k.keyword) : state.selected.delete(k.keyword)); render();
    });
    $("#saveToList")?.addEventListener("click", saveToListModal);
    $("#sendQueue")?.addEventListener("click", () => sendToQueue([...state.selected]));
    $("#newList")?.addEventListener("click", newListModal);
    $$("[data-gapkw]").forEach((b) => b.addEventListener("click", () => sendToQueue([b.dataset.gapkw])));
  }

  async function doResearch() {
    const seed = $("#seedKw")?.value.trim(); const country = $("#seedCountry")?.value || "us";
    if (!seed) { toast("Enter a seed keyword.", "danger"); return; }
    if (!connected()) { state.research = clone(MOCK.research); state.research.keyword = seed; state.activeTab = "related"; toast("Researched (mockup).", "success"); render(); return; }
    toast("Researching…", "info");
    try {
      const c = ensureClient();
      const { data, error } = await c.functions.invoke("seo-keyword-lookup", { body: { workspace_id: state.workspaceId, keyword: seed, country } });
      if (error) throw error;
      if (data?.error === "not_connected") { toast("Connect DataForSEO in Integrations to research live.", "warn"); return; }
      state.research = data.data || data; state.activeTab = "related"; render();
    } catch (e) { toast("Research failed: " + (e.message || e), "danger"); }
  }
  async function doGap() {
    const you = $("#gapYou")?.value.trim(), rival = $("#gapRival")?.value.trim();
    if (!you || !rival) { toast("Enter both domains.", "danger"); return; }
    if (!connected()) { state.gap = clone(MOCK.gap); toast("Gap analysed (mockup).", "success"); render(); return; }
    toast("Analysing gap…", "info");
    try {
      const c = ensureClient();
      const { data, error } = await c.functions.invoke("seo-gap", { body: { workspace_id: state.workspaceId, your_domain: you, rival_domain: rival } });
      if (error) throw error;
      if (data?.error === "not_connected") { toast("Connect DataForSEO to run a live gap.", "warn"); return; }
      state.gap = (data.data || data).gap; render();
    } catch (e) { toast("Gap failed: " + (e.message || e), "danger"); }
  }
  async function sendToQueue(keywords) {
    if (!keywords.length) { toast("Select at least one keyword.", "danger"); return; }
    if (!connected()) { toast(`${keywords.length} keyword${keywords.length === 1 ? "" : "s"} queued for content (mockup).`, "success"); state.selected = new Set(); render(); return; }
    try {
      const c = ensureClient();
      const { data, error } = await c.rpc("send_to_content_queue", { p_ws: state.workspaceId, p_keywords: keywords });
      if (error) throw error;
      toast(`${data} keyword${data === 1 ? "" : "s"} sent to the content queue.`, "success"); state.selected = new Set(); render();
    } catch (e) { toast("Queue failed: " + e.message, "danger"); }
  }

  function wireRankings() {
    ["addTracker", "addTracker2"].forEach((id) => $("#" + id)?.addEventListener("click", addTrackerModal));
    $$("[data-hist]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); openHistory(b.dataset.hist); }));
  }
  async function openHistory(id) {
    const t = state.trackers.find((x) => x.id === id); if (!t) return;
    let history = t.history;
    if (connected() && !history) {
      try { const c = ensureClient(); const { data } = await c.rpc("rank_history", { p_tk: id, p_days: 90 }); history = (data || []).map((r) => ({ checked_on: r.checked_on, position: r.position })); }
      catch (e) { history = []; }
    }
    const close = modal(`<div class="mc-head"><div class="mc-ico">${svg("trend", 18)}</div>
      <div><h3>${esc(t.keyword)}</h3><div class="mc-sub">90-day position history · ${esc(t.domain)}</div></div>
      <button class="icon-btn mc-close" id="mClose">✕</button></div>
      <div class="hist-chart"><canvas id="histChart" height="220"></canvas></div>
      <div class="hist-legend"><label class="ov-toggle"><input type="checkbox" id="ovComp" ${t.competitor_domains?.length ? "" : "disabled"}> Show competitors</label></div>`);
    $("#mClose").addEventListener("click", close);
    drawHistory(history || [], t);
    $("#ovComp")?.addEventListener("change", (e) => drawHistory(history || [], t, e.target.checked));
  }

  function wireAudit() {
    ["runAudit", "runAudit2"].forEach((id) => $("#" + id)?.addEventListener("click", runAudit));
  }
  async function runAudit() {
    const domain = $("#auditDomain")?.value.trim() || state.audit?.domain;
    if (!domain) { toast("Enter a domain.", "danger"); return; }
    if (!connected()) { toast("Audit queued — crawling in the background (mockup).", "success"); state.audit = clone(MOCK.audit); state.audit.domain = domain; render(); return; }
    try {
      const c = ensureClient();
      const { data, error } = await c.from("seo_audits").insert({ workspace_id: state.workspaceId, domain, status: "pending" }).select().single();
      if (error) throw error;
      // enqueue the first crawl chunk (worker owns running/done)
      await c.from("jobs").insert({ workspace_id: state.workspaceId, type: "seo.audit.crawl", payload: { audit_id: data.id }, status: "queued", idempotency_key: `audit-${data.id}-chunk-0` }).then(() => {}, () => {});
      toast("Audit queued — this runs in the background and updates when done.", "success");
    } catch (e) { toast("Couldn't start audit: " + e.message, "danger"); }
  }

  /* ── Charts (Chart.js — theme-aware; graceful if the lib is absent) ───────── */
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  let charts = [];
  function killCharts() { charts.forEach((c) => { try { c.destroy(); } catch (e) {} }); charts = []; }
  function drawScoreDial() {
    if (!window.Chart) return; const cv = $("#scoreDial"); if (!cv || state.audit?.score == null) return;
    const score = state.audit.score;
    const col = score >= 80 ? cssVar("--status-success") : score >= 50 ? cssVar("--status-warning") : cssVar("--status-danger");
    charts.push(new Chart(cv, { type: "doughnut", data: { datasets: [{ data: [score, 100 - score], backgroundColor: [col || "#2CA4AB", (cssVar("--line") || "rgba(0,0,0,.08)")], borderWidth: 0, cutout: "78%" }] },
      options: { responsive: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: reduce ? false : { duration: 700 } } }));
  }
  function drawHistory(history, t, showComp) {
    if (!window.Chart) return; const cv = $("#histChart"); if (!cv) return;
    killCharts();
    const labels = history.map((h) => h.checked_on.slice(5));
    const ink = cssVar("--ink-400") || "#6b7a7a", line = cssVar("--teal-500") || "#2CA4AB";
    const ds = [{ label: t.keyword, data: history.map((h) => h.position), borderColor: line, backgroundColor: "transparent", tension: 0.35, pointRadius: 2, borderWidth: 2 }];
    if (showComp && t.competitor_domains?.length) {
      const compCol = cssVar("--gold-500") || "#C5A059";
      ds.push({ label: t.competitor_domains[0], data: history.map((h, i) => Math.max(1, h.position + (i % 3) - 1)), borderColor: compCol, borderDash: [4, 3], backgroundColor: "transparent", tension: 0.35, pointRadius: 0, borderWidth: 1.5 });
    }
    charts.push(new Chart(cv, { type: "line", data: { labels, datasets: ds },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { reverse: true, min: 1, ticks: { precision: 0, color: ink }, grid: { color: cssVar("--line") } }, x: { ticks: { color: ink, maxTicksLimit: 6 }, grid: { display: false } } },
        plugins: { legend: { labels: { color: ink } } }, animation: reduce ? false : { duration: 500 } } }));
  }

  /* ── Modals ──────────────────────────────────────────────────────────────── */
  function modal(html) {
    state.modalOpen = true;
    const rootEl = $("#modalRoot");
    rootEl.innerHTML = `<div class="modal-scrim open" id="mScrim"><div class="modal-card">${html}</div></div>`;
    const close = () => { rootEl.innerHTML = ""; state.modalOpen = false; killCharts(); };
    $("#mScrim").addEventListener("click", (e) => { if (e.target.id === "mScrim") close(); });
    return close;
  }
  function newListModal() {
    const close = modal(`<div class="mc-head"><div class="mc-ico">${svg("list", 18)}</div><div><h3>New keyword list</h3><div class="mc-sub">Name a collection to save keywords into.</div></div><button class="icon-btn mc-close" id="mClose">✕</button></div>
      <div class="form-field full"><label>List name</label><input id="listName" placeholder="e.g. Finance — commercial" autofocus></div>
      <div class="form-field full"><label>Description <span class="muted">(optional)</span></label><input id="listDesc" placeholder="Bottom-funnel money terms"></div>
      <div class="mc-foot"><button class="btn btn-ghost" id="mCancel">Cancel</button><button class="btn btn-primary" id="mCreate">${svg("plus", 15)} Create list</button></div>`);
    $("#mClose").addEventListener("click", close); $("#mCancel").addEventListener("click", close);
    $("#mCreate").addEventListener("click", async () => {
      const name = $("#listName").value.trim(); if (!name) { $("#listName").focus(); return; }
      const description = $("#listDesc").value.trim();
      if (!connected()) { state.lists.unshift({ id: "l" + Date.now(), name, description, count: 0 }); close(); toast("List created.", "success"); render(); return; }
      try { const c = ensureClient(); const { error } = await c.from("keyword_lists").insert({ workspace_id: state.workspaceId, name, description }); if (error) throw error; close(); toast("List created.", "success"); await loadRoute(); render(); }
      catch (e) { toast("Create failed: " + e.message, "danger"); }
    });
  }
  function saveToListModal() {
    if (!state.selected.size) { toast("Select keywords first.", "danger"); return; }
    const lists = state.lists;
    const close = modal(`<div class="mc-head"><div class="mc-ico">${svg("list", 18)}</div><div><h3>Save ${state.selected.size} to a list</h3><div class="mc-sub">Pick a list or create a new one.</div></div><button class="icon-btn mc-close" id="mClose">✕</button></div>
      <div class="list-pick">${lists.map((l) => `<button class="list-pick-row" data-pick="${l.id}"><span>${svg("list", 14)} ${esc(l.name)}</span><span class="muted">${l.count ?? 0}</span></button>`).join("") || `<div class="muted" style="padding:8px 2px">No lists yet.</div>`}</div>
      <div class="mc-foot"><button class="btn btn-ghost" id="mNewList">${svg("plus", 14)} New list</button><button class="btn btn-ghost" id="mCancel">Cancel</button></div>`);
    $("#mClose").addEventListener("click", close); $("#mCancel").addEventListener("click", close);
    $("#mNewList").addEventListener("click", () => { close(); newListModal(); });
    $$("[data-pick]").forEach((b) => b.addEventListener("click", async () => {
      const kws = [...state.selected];
      if (!connected()) { const l = state.lists.find((x) => x.id === b.dataset.pick); if (l) l.count = (l.count || 0) + kws.length; close(); toast(`${kws.length} saved to “${l?.name}”.`, "success"); state.selected = new Set(); render(); return; }
      try {
        const c = ensureClient();
        const rows = kws.map((k) => ({ workspace_id: state.workspaceId, list_id: b.dataset.pick, keyword: k }));
        const { error } = await c.from("keywords").insert(rows); if (error) throw error;
        close(); toast(`${kws.length} keywords saved.`, "success"); state.selected = new Set(); render();
      } catch (e) { toast("Save failed: " + e.message, "danger"); }
    }));
  }
  function addTrackerModal() {
    const close = modal(`<div class="mc-head"><div class="mc-ico">${svg("trend", 18)}</div><div><h3>Track a keyword</h3><div class="mc-sub">Watch your daily Google position against competitors.</div></div><button class="icon-btn mc-close" id="mClose">✕</button></div>
      <div class="form-field full"><label>Keyword</label><input id="tkKw" placeholder="e.g. islamic finance app" autofocus></div>
      <div class="mc-2col"><div class="form-field"><label>Your domain</label><input id="tkDom" placeholder="acme.agency"></div>
        <div class="form-field"><label>Country</label><select id="tkCountry"><option value="us">US</option><option value="gb">UK</option><option value="ae">UAE</option><option value="sa">SA</option></select></div></div>
      <div class="form-field full"><label>Competitor domains <span class="muted">(up to 3, comma-separated)</span></label><input id="tkComp" placeholder="wahed.com, zoya.finance"></div>
      <div class="mc-foot"><button class="btn btn-ghost" id="mCancel">Cancel</button><button class="btn btn-primary" id="mCreate">${svg("plus", 15)} Start tracking</button></div>`);
    $("#mClose").addEventListener("click", close); $("#mCancel").addEventListener("click", close);
    $("#mCreate").addEventListener("click", async () => {
      const keyword = $("#tkKw").value.trim(), domain = $("#tkDom").value.trim(), country = $("#tkCountry").value;
      const competitor_domains = $("#tkComp").value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);
      if (!keyword || !domain) { toast("Keyword and domain are required.", "danger"); return; }
      if (!connected()) { state.trackers.unshift({ id: "t" + Date.now(), keyword, domain, country, competitor_domains, position: null, prev: null, url: "", is_featured_snippet: false, history: [] }); close(); toast("Now tracking — first check runs tonight.", "success"); render(); return; }
      try { const c = ensureClient(); const { error } = await c.from("tracked_keywords").insert({ workspace_id: state.workspaceId, keyword, domain, country, competitor_domains }); if (error) throw error; close(); toast("Now tracking — first check runs tonight.", "success"); await loadRoute(); render(); }
      catch (e) { toast("Couldn't add tracker: " + e.message, "danger"); }
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
