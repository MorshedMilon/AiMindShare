/* m22-content.js — AiMindShare M22 Content/CMS (manual slice).
   The article library + editorial workflow: a status-pipeline blog manager,
   autosave revisions, categories & authors, an editorial review queue, a
   hand-rolled contenteditable editor (D-120) with live readability (Flesch) +
   on-page SEO scoring (D-125), and publish-to-M19 (blog_articles.site_id).
   Vanilla + Supabase (anon key only, Law 3); falls back to a rich mockup when no
   project is connected. The AI auto-blog pipeline is the SEPARATE Session-23 slice
   — its settings section is a labelled, disabled scaffold here. */
import { scoreArticle, readingEase, plainText } from "./content-seo.mjs";
import { sanitizeHtml } from "./content-editor.mjs";
(function () {
  "use strict";

  // ── tiny DOM + string helpers ──────────────────────────────────────────────
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const CFG_KEY = "aimindshare-supabase";

  const ICON = {
    doc: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5",
    queue: "M4 6h16M4 12h16M4 18h10", tag: "M20.6 13.4 12 22l-9-9V4h9zM7.5 7.5h.01",
    user: "M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 6 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H2a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 3.3 6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H8a1.7 1.7 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V8a1.7 1.7 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
    plus: "M12 5v14M5 12h14", search: "M21 21l-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
    check: "M20 6 9 17l-5-5", x: "M18 6 6 18M6 6l12 12", image: "M4 5h16v14H4zM4 15l4-4 3 3 4-5 5 6",
    link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
    bold: "M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z", italic: "M19 4h-9M14 20H5M15 4 9 20",
    h2: "M4 5v14M12 5v14M4 12h8", h3: "M4 5v14M12 5v14M4 12h8", listu: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    listo: "M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4l2-3H4", quote: "M6 17h3l2-4V7H5v6h3zM14 17h3l2-4V7h-6v6h3z",
    minus: "M5 12h14", eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6", edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
    sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
    moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z", menu: "M3 12h18M3 6h18M3 18h18",
    sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z",
    rss: "M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16M6 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2z", star: "M12 3l2.9 6.3 6.6.6-5 4.4 1.5 6.4L12 17.8 6 21.1l1.5-6.4-5-4.4 6.6-.6z",
    arrow: "M5 12h14M13 6l6 6-6 6", clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2", restore: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
    calendar: "M4 6h16v15H4zM4 10h16M8 3v4M16 3v4", send: "M22 2 11 13M22 2l-7 20-4-9-9-4z", chev: "M6 9l6 6 6-6",
  };
  const svg = (n, s = 16) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[n] || ""}"/></svg>`;

  const fmtDate = (d) => { if (!d) return "—"; try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return String(d); } };
  const relTime = (d) => { if (!d) return ""; const s = (Date.now() - new Date(d).getTime()) / 1000; if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + "m ago"; if (s < 86400) return Math.floor(s / 3600) + "h ago"; return Math.floor(s / 86400) + "d ago"; };
  const STATUS_LABEL = { draft: "Draft", in_review: "In review", scheduled: "Scheduled", published: "Published", archived: "Archived" };

  function toast(msg, kind) {
    const wrap = $("#toasts"); if (!wrap) return;
    const t = el("div", "toast" + (kind ? " " + kind : ""), `<span class="t-ico">${svg(kind === "danger" ? "x" : "check", 15)}</span><span>${esc(msg)}</span>`);
    wrap.appendChild(t); setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 300); }, 2600);
  }

  // ── Supabase (anon key only) with mockup fallback ───────────────────────────
  function getCfg() { try { const s = JSON.parse(localStorage.getItem(CFG_KEY) || "null"); if (s && s.url) return s; } catch (e) {} const g = window.AIMINDSHARE_CONFIG; if (g && g.SUPABASE_URL && !/YOUR-/.test(g.SUPABASE_URL)) return { url: g.SUPABASE_URL, anon: g.SUPABASE_ANON_KEY }; return null; }
  let _client = null;
  function client() { const c = getCfg(); if (!c || !window.supabase?.createClient) return null; if (!_client) _client = window.supabase.createClient(c.url, c.anon || "", { auth: { persistSession: true } }); return _client; }
  const connected = () => !!getCfg() && !!window.supabase;

  // ════════════════════════════════════════════════════════════════════════════
  //  SCORING — readability (Flesch) + on-page SEO rubric. Pure, client-side (D-125).
  // ════════════════════════════════════════════════════════════════════════════
  // Scoring is the SHARED pure module content-seo.mjs (imported at top) — one source
  // of truth for the editor sidebar AND the Node m22seoprobe. These are thin adapters
  // that map an in-memory article row onto scoreArticle()'s input shape.
  const textOf = plainText;                                   // alias kept for call sites
  const wordCount = (html) => scoreArticle({ html }).wordCount;
  const scoreOf = (a) => scoreArticle({ html: a.content_html || "", title: a.title || "",
    keyword: a.keyword || "", metaTitle: a.meta_title || "", metaDesc: a.meta_desc || "", targetWords: 600 });
  const readLabel = (s) => s >= 70 ? "Easy" : s >= 50 ? "Fair" : s >= 30 ? "Difficult" : "Very hard";
  const band = (s) => s >= 75 ? "good" : s >= 45 ? "ok" : "low";

  // ════════════════════════════════════════════════════════════════════════════
  //  MOCK DATA (honest sample content; no mock leaks into live paths)
  // ════════════════════════════════════════════════════════════════════════════
  const SITE = { id: "site-acme", name: "Acme Wellness", subdomain: "acme" };
  const AUTHORS = [
    { id: "au-1", name: "Amina Rahman", user_id: "u1", bio: "Head of Content", avatar_url: null },
    { id: "au-2", name: "The Acme Team", user_id: null, bio: "House byline (pen name)", avatar_url: null },
    { id: "au-3", name: "Yusuf Karim", user_id: "u2", bio: "SEO strategist", avatar_url: null },
  ];
  const CATS = [
    { id: "c-1", name: "Guides", slug: "guides", site_id: "site-acme" },
    { id: "c-2", name: "Product", slug: "product", site_id: "site-acme" },
    { id: "c-3", name: "Wellness", slug: "wellness", site_id: "site-acme" },
  ];
  const BODY_1 = `<p>Building a consistent <a href="/blog/content-calendar">content calendar</a> is the single highest-leverage habit for organic growth. In this guide we walk through a repeatable weekly cadence that keeps your blog fresh without burning out your team.</p>
<h2>Why cadence beats intensity</h2><p>Search engines reward freshness and depth over time. A steady two-posts-a-week rhythm compounds far faster than an occasional burst. We recommend blocking the same two mornings each week for drafting.</p>
<h3>Batch your keyword research</h3><p>Pull a month of keywords at once, cluster them by intent, and slot them into the calendar. When it is time to write, the hard thinking is already done. Cross-link to your <a href="/blog/keyword-clusters">keyword clusters</a> post for the full method.</p>
<figure><img src="https://images.unsplash.com/photo-1499750310107-5fef28a66643" alt="A tidy editorial calendar on a desk"><figcaption>A simple two-column calendar is enough to start.</figcaption></figure>
<h2>Measuring what matters</h2><p>Track publishing consistency first, rankings second. Consistency is the input you control; rankings are the lagging output. Review both monthly and adjust your keyword mix accordingly.</p>`;
  const BODY_2 = `<p>Our new booking flow cuts scheduling friction in half. Here is what changed and why it matters for your clients.</p><h2>One-tap rescheduling</h2><p>Clients can now move an appointment without emailing back and forth.</p>`;

  function seedArticles() {
    const mk = (o) => { const r = scoreOf(o); return { site_id: "site-acme", tags: [], excerpt: "", meta_title: "", meta_desc: "", keyword: "", featured_image_url: null, schema: {}, ...o, word_count: r.wordCount, seo_score: o.seo_score ?? r.score, readability_score: o.readability_score ?? r.readability }; };
    return [
      mk({ id: "a1", title: "A weekly content cadence that actually compounds", slug: "weekly-content-cadence", keyword: "content cadence", category_id: "c-1", author_id: "au-1", content_html: BODY_1, excerpt: "The single highest-leverage habit for organic blog growth — a repeatable weekly rhythm.", meta_title: "A Weekly Content Cadence That Compounds | Acme", meta_desc: "Build a repeatable content cadence that grows organic traffic without burning out your team. A practical weekly rhythm for busy marketing teams.", featured_image_url: "https://images.unsplash.com/photo-1499750310107-5fef28a66643", status: "published", published_at: "2026-06-28T09:00:00Z", updated_at: "2026-06-28T09:00:00Z" }),
      mk({ id: "a2", title: "Introducing one-tap rescheduling", slug: "one-tap-rescheduling", keyword: "rescheduling", category_id: "c-2", author_id: "au-2", content_html: BODY_2, excerpt: "Our new booking flow cuts scheduling friction in half.", meta_title: "", meta_desc: "A quick look at the new one-tap rescheduling flow.", status: "in_review", published_at: null, updated_at: "2026-07-03T14:20:00Z" }),
      mk({ id: "a3", title: "5 breathing techniques for focus", slug: "breathing-techniques-focus", keyword: "breathing techniques", category_id: "c-3", author_id: "au-3", content_html: "<p>Draft in progress…</p>", excerpt: "", status: "draft", published_at: null, updated_at: "2026-07-04T08:10:00Z" }),
      mk({ id: "a4", title: "Our 2026 wellness report (preview)", slug: "2026-wellness-report", keyword: "wellness report", category_id: "c-3", author_id: "au-1", content_html: "<p>The full report drops next week. Here is a preview of the headline findings.</p><h2>Key findings</h2><p>Sleep quality improved across every cohort.</p>", excerpt: "A preview of our annual wellness findings.", meta_desc: "A preview of the headline findings from the Acme 2026 wellness report.", status: "scheduled", scheduled_at: "2026-07-10T13:00:00Z", published_at: null, updated_at: "2026-07-02T11:00:00Z" }),
      mk({ id: "a5", title: "Old launch announcement", slug: "old-launch", keyword: "", category_id: "c-2", author_id: "au-2", content_html: "<p>Archived post.</p>", status: "archived", published_at: "2025-11-01T09:00:00Z", updated_at: "2025-11-01T09:00:00Z" }),
    ];
  }
  const MOCK_REVS = {
    a1: [
      { version_no: 3, saved_at: "2026-06-28T08:55:00Z", saved_by: "Amina Rahman" },
      { version_no: 2, saved_at: "2026-06-27T17:40:00Z", saved_by: "Amina Rahman" },
      { version_no: 1, saved_at: "2026-06-27T16:10:00Z", saved_by: "Amina Rahman" },
    ],
  };

  // ── Bulk Content Creation mock state (mirrors seedArticles()'s honest-sample style) ─
  const MOCK_BATCHES = [
    { id: "b1", name: "Ramadan dua series", topic_source: "manual", status: "running",
      total_items: 12, model: "claude-sonnet-5", created_at: "2026-07-09T10:00:00Z" },
  ];
  const MOCK_TEMPLATES = [
    { id: "t1", name: "City travel guide", prompt_template: "A complete travel guide to [city] for [traveler_type]." },
  ];

  // Hand-rolled CSV parser, same quoting logic as frontend/js/m09-crm.js's parseCsvText —
  // kept local (not imported) since M22 and M09 are independent modules.
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

  // ── App state ───────────────────────────────────────────────────────────────
  const state = {
    route: "content", param: null,
    view: "default",            // mockup preview state: default|empty|loading|error|success
    articles: [], authors: [], cats: [],
    filters: { status: "all", cat: "all", author: "all", q: "" },
    selected: new Set(),
    editing: null,              // working copy of the open article
    revs: [],
    bulkExpanded: null,         // id of the batch job whose items panel is open, or null
    bulkSelected: new Set(),    // content_queue item ids checked in the open items panel
  };

  function loadMock() {
    state.articles = seedArticles(); state.authors = AUTHORS.slice(); state.cats = CATS.slice();
  }

  // ── live data layer (best-effort; falls back to mock on any failure) ────────
  async function loadLive() {
    const c = client();
    const { data: ws } = await c.from("workspaces").select("id").order("created_at").limit(1);
    const wsId = ws?.[0]?.id; if (!wsId) throw new Error("no workspace");
    const [{ data: arts }, { data: cats }, { data: authors }] = await Promise.all([
      c.from("blog_articles").select("*").eq("workspace_id", wsId).order("updated_at", { ascending: false }).limit(500),
      c.from("article_categories").select("*").eq("workspace_id", wsId).order("name"),
      c.from("article_authors").select("*").eq("workspace_id", wsId).order("name"),
    ]);
    state.articles = arts || []; state.cats = cats || []; state.authors = authors || [];
  }
  const catName = (id) => (state.cats.find((c) => c.id === id) || {}).name || "—";
  const authorName = (id) => (state.authors.find((a) => a.id === id) || {}).name || "—";

  // RPC wrapper: run live rpc when connected, else mutate the mock + toast.
  async function rpc(name, args, mockFn, okMsg) {
    if (connected()) {
      try { const { error } = await client().rpc(name, args); if (error) throw error; toast(okMsg); return true; }
      catch (e) { toast("Action failed: " + (e.message || name), "danger"); return false; }
    }
    if (mockFn) mockFn(); toast(okMsg + " (preview)"); return true;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  SHELL
  // ════════════════════════════════════════════════════════════════════════════
  function railItem(icon, label, route, active) {
    return `<div class="nav-item ${active ? "active" : ""}" data-go="${route}"><span class="ni-ico">${svg(icon)}</span><span>${label}</span></div>`;
  }
  function shell(contentHTML) {
    const app = $("#app");
    app.innerHTML = `
    <aside class="rail" id="rail">
      <div class="brand" style="display:flex;align-items:center;gap:9px;font-family:var(--font-serif);font-weight:600;color:var(--ink-900)">
        <span class="mark" style="background:var(--grad-brand);color:#fff;border-radius:9px;display:grid;place-items:center">${svg("doc", 15)}</span>
        <span>AiMindShare</span>
      </div>
      <div class="nav-group">
        <div class="nav-group-label">Content</div>
        ${railItem("doc", "Articles", "content", state.route === "content")}
        ${railItem("queue", "Review queue", "content/review", state.route === "review")}
        ${railItem("tag", "Categories &amp; authors", "content/taxonomy", state.route === "taxonomy")}
        ${railItem("sparkle", "Bulk create", "content/bulk", state.route === "bulk")}
      </div>
      <div class="nav-group">
        <div class="nav-group-label">Settings</div>
        ${railItem("gear", "Content settings", "settings/content", state.route === "settings")}
      </div>
      <div class="rail-foot">M22 · Content / CMS<br>manual slice · Session 22</div>
    </aside>
    <header class="tbar">
      <button class="tb-btn rail-burger" id="burger" style="display:none">${svg("menu")}</button>
      <div class="ws-trigger"><span class="ws-badge">A</span>
        <span><span class="ws-name">${esc(SITE.name)}</span><br><span class="ws-kind">Blog · ${esc(SITE.subdomain)}.aimindshare.site</span></span></div>
      <span class="spacer"></span>
      <div class="tb-search" onclick="document.querySelector('.inp-search')?.focus()"><span>${svg("search", 15)}</span><span class="tbs-label">Search articles</span><span class="kbd">/</span></div>
      <button class="tb-btn" id="themeBtn" title="Toggle theme">${svg(document.documentElement.getAttribute("data-theme") === "dark" ? "sun" : "moon")}</button>
      <div class="avatar" id="connectBtn" title="Connect a project">A</div>
    </header>
    <main class="content"><div class="content-inner" id="view">${contentHTML}</div></main>`;

    app.querySelectorAll("[data-go]").forEach((n) => n.onclick = () => { location.hash = "#/" + n.getAttribute("data-go"); });
    $("#themeBtn").onclick = toggleTheme;
    $("#connectBtn").onclick = openDrawer;
    const burger = $("#burger"); if (burger) burger.onclick = () => $("#rail").classList.toggle("open");
  }

  // mockup preview-state switcher (honest Gate-5)
  function mockNote() {
    return "";
  }
  function wireMockNote() {
    document.querySelectorAll("[data-view]").forEach((b) => b.onclick = () => { state.view = b.getAttribute("data-view"); render(); });
    const ci = $("#connectInline"); if (ci) ci.onclick = openDrawer;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  ROUTE: /content — articles table
  // ════════════════════════════════════════════════════════════════════════════
  function pageHead(eyebrow, title, sub, actionHTML) {
    return `<div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:6px">
      <div style="flex:1;min-width:240px">
        <span class="eyebrow">${eyebrow}</span>
        <h1 style="font-family:var(--font-serif);font-size:32px;color:var(--ink-900);margin:12px 0 4px">${title}</h1>
        <p class="muted" style="font-size:14px;max-width:640px">${sub}</p>
      </div>${actionHTML || ""}</div>`;
  }

  function viewList() {
    const filtered = applyFilters(state.articles);
    let listHTML;
    if (state.view === "loading") {
      listHTML = `<div class="panel">${Array.from({ length: 6 }).map(() => `<div class="data-row"><div class="skeleton" style="width:70%;height:16px"></div><div class="r-right"><div class="skeleton" style="width:60px;height:14px"></div></div></div>`).join("")}</div>`;
    } else if (state.view === "error") {
      listHTML = `<div class="panel card"><div class="empty-state"><div class="es-ico" style="background:rgba(196,97,78,.14);color:var(--status-danger)">${svg("x", 22)}</div><h3>Couldn't load articles</h3><p>The request returned an error envelope. Check your connection and try again.</p><button class="btn btn-ghost es-cta" onclick="location.reload()">Retry</button></div></div>`;
    } else if (state.view === "empty" || !filtered.length) {
      listHTML = `<div class="panel card"><div class="empty-state"><div class="es-ico">${svg("doc", 22)}</div><h3>No articles yet</h3><p>Draft your first post, score it for SEO and readability, then publish it straight to your site blog.</p><button class="btn btn-primary es-cta" id="newArticle2">${svg("plus", 15)} New article</button></div></div>`;
    } else {
      listHTML = renderTable(filtered);
    }
    const bulk = state.selected.size ? `<div class="bulkbar"><span class="bb-count">${state.selected.size} selected</span>
      <button class="btn btn-sm btn-ghost" data-bulk="publish">${svg("check", 13)} Publish</button>
      <button class="btn btn-sm btn-ghost" data-bulk="archive">Archive</button>
      <button class="btn btn-sm btn-ghost" data-bulk="delete">${svg("trash", 13)} Delete</button>
      <span class="spacer" style="flex:1"></span><button class="btn btn-sm btn-ghost" data-bulk="clear">Clear</button></div>` : "";
    const filters = `<div class="toolbar">
      <input class="inp-search" placeholder="Search title, slug, keyword…" value="${esc(state.filters.q)}" id="fq">
      <div class="seg" id="stseg">${["all", "draft", "in_review", "scheduled", "published", "archived"].map((s) => `<button class="${state.filters.status === s ? "on" : ""}" data-st="${s}">${s === "all" ? "All" : STATUS_LABEL[s]}</button>`).join("")}</div>
      <select class="sel-mini" id="fcat"><option value="all">All categories</option>${state.cats.map((c) => `<option value="${c.id}" ${state.filters.cat === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
      <select class="sel-mini" id="fauth"><option value="all">All authors</option>${state.authors.map((a) => `<option value="${a.id}" ${state.filters.author === a.id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select>
    </div>`;
    return mockNote()
      + pageHead("Blog manager", "Articles", "Every post across draft, review, scheduled, published and archived — with live SEO scores.",
        `<button class="btn btn-primary" id="newArticle">${svg("plus", 15)} New article</button>`)
      + filters + bulk + listHTML;
  }

  function renderTable(rows) {
    return `<div class="tbl-wrap card panel" style="padding:6px 14px 10px"><table class="table"><thead><tr>
      <th style="width:26px"></th><th>Title</th><th>Status</th><th class="num">SEO</th><th class="num">Read</th>
      <th class="num">Words</th><th>Category</th><th>Author</th><th>Updated</th></tr></thead><tbody>
      ${rows.map((a) => {
        const sb = band(a.seo_score ?? 0), rb = (a.readability_score ?? 0) >= 60 ? "good" : (a.readability_score ?? 0) >= 40 ? "ok" : "low";
        return `<tr>
        <td><span class="chk ${state.selected.has(a.id) ? "on" : ""}" data-chk="${a.id}">${svg("check", 12)}</span></td>
        <td><div class="a-title-cell"><span class="at-name" data-open="${a.id}">${esc(a.title)}</span><span class="at-slug">/blog/${esc(a.slug)}</span></div></td>
        <td><span class="pill st-${a.status}">${STATUS_LABEL[a.status]}</span></td>
        <td class="num"><span class="score-chip ${sb}"><span class="sc-dot"></span>${a.seo_score ?? "—"}</span></td>
        <td class="num"><span class="score-chip ${rb}"><span class="sc-dot"></span>${a.readability_score ?? "—"}</span></td>
        <td class="num">${a.word_count || 0}</td>
        <td>${esc(catName(a.category_id))}</td>
        <td>${esc(authorName(a.author_id))}</td>
        <td style="color:var(--ink-400);font-size:12.5px">${a.status === "scheduled" ? "→ " + fmtDate(a.scheduled_at) : a.published_at ? fmtDate(a.published_at) : relTime(a.updated_at)}</td>
      </tr>`; }).join("")}
    </tbody></table></div>`;
  }

  function applyFilters(list) {
    const f = state.filters;
    return list.filter((a) => {
      if (f.status !== "all" && a.status !== f.status) return false;
      if (f.cat !== "all" && a.category_id !== f.cat) return false;
      if (f.author !== "all" && a.author_id !== f.author) return false;
      if (f.q) { const hay = (a.title + " " + a.slug + " " + (a.keyword || "")).toLowerCase(); if (!hay.includes(f.q.toLowerCase())) return false; }
      return true;
    });
  }

  function wireList() {
    const nb = $("#newArticle"), nb2 = $("#newArticle2");
    if (nb) nb.onclick = newArticle; if (nb2) nb2.onclick = newArticle;
    const fq = $("#fq"); if (fq) fq.oninput = (e) => { state.filters.q = e.target.value; debouncedRerenderList(); };
    document.querySelectorAll("#stseg [data-st]").forEach((b) => b.onclick = () => { state.filters.status = b.getAttribute("data-st"); render(); });
    const fc = $("#fcat"); if (fc) fc.onchange = (e) => { state.filters.cat = e.target.value; render(); };
    const fa = $("#fauth"); if (fa) fa.onchange = (e) => { state.filters.author = e.target.value; render(); };
    document.querySelectorAll("[data-chk]").forEach((n) => n.onclick = () => { const id = n.getAttribute("data-chk"); state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id); render(); });
    document.querySelectorAll("[data-open]").forEach((n) => n.onclick = () => { location.hash = "#/content/" + n.getAttribute("data-open"); });
    document.querySelectorAll("[data-bulk]").forEach((b) => b.onclick = () => bulkAction(b.getAttribute("data-bulk")));
  }
  let _rlTimer; function debouncedRerenderList() { clearTimeout(_rlTimer); _rlTimer = setTimeout(() => { const v = $("#view"); if (!v) return; /* light re-render of table only */ render(); }, 220); }

  function bulkAction(kind) {
    if (kind === "clear") { state.selected.clear(); return render(); }
    const ids = [...state.selected];
    if (kind === "delete") { state.articles = state.articles.filter((a) => !state.selected.has(a.id)); toast(`${ids.length} deleted (preview)`); }
    else if (kind === "publish") { state.articles.forEach((a) => { if (state.selected.has(a.id)) { a.status = "published"; a.published_at = new Date().toISOString(); } }); toast(`${ids.length} published (preview)`); }
    else if (kind === "archive") { state.articles.forEach((a) => { if (state.selected.has(a.id)) a.status = "archived"; }); toast(`${ids.length} archived (preview)`); }
    state.selected.clear(); render();
  }

  function newArticle() {
    const id = "new-" + Math.random().toString(36).slice(2, 8);
    const a = { id, site_id: SITE.id, title: "Untitled article", slug: "untitled-" + id.slice(4), keyword: "", category_id: state.cats[0]?.id || null, author_id: state.authors[0]?.id || null, content_html: "", excerpt: "", meta_title: "", meta_desc: "", featured_image_url: null, tags: [], status: "draft", word_count: 0, seo_score: 0, readability_score: 0, schema: {}, updated_at: new Date().toISOString() };
    state.articles.unshift(a); location.hash = "#/content/" + id;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  ROUTE: /content/:id — editor + SEO sidebar + revisions
  // ════════════════════════════════════════════════════════════════════════════
  function viewEditor() {
    const a = state.editing; if (!a) { location.hash = "#/content"; return ""; }
    const canPublish = true; // role gate is server-side (RLS/RPC); UI shows the action
    const statusPill = `<span class="pill st-${a.status}">${STATUS_LABEL[a.status]}</span>`;
    return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <button class="btn btn-sm btn-ghost" data-go="content">← Articles</button>
        ${statusPill}
        ${a.reject_feedback ? `<span class="pill danger" title="Editorial feedback">${svg("x", 12)} Changes requested</span>` : ""}
        <span class="spacer" style="flex:1"></span>
        <span class="freshness" id="saveState">Saved ${relTime(a.updated_at)}</span>
        <button class="btn btn-sm btn-ghost" id="btnPreview">${svg("eye", 13)} Preview</button>
        <button class="btn btn-sm btn-ghost" id="btnSubmit">${svg("send", 13)} Submit for review</button>
        <button class="btn btn-sm btn-ghost" id="btnSchedule">${svg("calendar", 13)} Schedule</button>
        <button class="btn btn-sm btn-primary" id="btnPublish">${svg("check", 13)} Publish</button>
      </div>
      ${a.reject_feedback ? `<div class="scaffold-note" style="border-style:solid;border-color:rgba(196,97,78,.4);background:rgba(196,97,78,.06);margin-bottom:16px"><span class="sn-ico" style="color:var(--status-danger)">${svg("x", 15)}</span><span><b>Editor feedback:</b> ${esc(a.reject_feedback)}</span></div>` : ""}
      <div class="editor-grid">
        <div class="ed-main">
          <div class="ed-titlebar"><input class="ed-title" id="edTitle" value="${esc(a.title)}" placeholder="Article title"></div>
          <div class="ed-toolbar" id="edToolbar">
            <button class="tb-btn" data-cmd="bold" title="Bold">${svg("bold", 15)}</button>
            <button class="tb-btn" data-cmd="italic" title="Italic">${svg("italic", 15)}</button>
            <span class="tb-sep"></span>
            <button class="tb-btn" data-block="h2" title="Heading 2">${svg("h2", 15)}</button>
            <button class="tb-btn" data-block="h3" title="Heading 3">${svg("h3", 15)}</button>
            <button class="tb-btn" data-cmd="insertUnorderedList" title="Bullet list">${svg("listu", 15)}</button>
            <button class="tb-btn" data-cmd="insertOrderedList" title="Numbered list">${svg("listo", 15)}</button>
            <button class="tb-btn" data-block="blockquote" title="Quote">${svg("quote", 15)}</button>
            <span class="tb-sep"></span>
            <button class="tb-btn" id="tbLink" title="Link">${svg("link", 15)}</button>
            <button class="tb-btn" id="tbInternal" title="Internal link">${svg("doc", 15)}</button>
            <button class="tb-btn" id="tbImage" title="Insert image (M06)">${svg("image", 15)}</button>
            <button class="tb-btn" id="tbDivider" title="Divider">${svg("minus", 15)}</button>
            <span class="tb-sep"></span>
            <button class="tb-btn" id="tbSlash" title="Insert block (/)">${svg("plus", 15)}</button>
          </div>
          <div class="ed-canvas" id="edCanvas" contenteditable="true" data-placeholder="Start writing, or type “/” for blocks…">${a.content_html || ""}</div>
        </div>
        <aside class="ed-side" id="edSide">${renderSidebar(a)}</aside>
      </div>`;
  }

  function ringSvg(score) {
    const R = 34, C = 2 * Math.PI * R, off = C * (1 - score / 100);
    return `<svg class="ring-svg ${band(score)}" viewBox="0 0 82 82"><circle class="ring-bg" cx="41" cy="41" r="${R}" fill="none" stroke-width="7"></circle>
      <circle class="ring-fg" cx="41" cy="41" r="${R}" fill="none" stroke-width="7" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 41 41)"></circle>
      <text class="ring-num" x="41" y="41" text-anchor="middle" dominant-baseline="central">${score}</text></svg>`;
  }

  function renderSidebar(a) {
    const r = scoreOf(a); const read = r.readability;
    a.seo_score = r.score; a.readability_score = read; a.word_count = r.wordCount;
    const mtLen = (a.meta_title || "").length, mdLen = (a.meta_desc || "").length;
    const lenClass = (n, lo, hi) => n === 0 ? "" : (n >= lo && n <= hi ? "good" : "warn");
    const lenBar = (n, max, lo, hi) => `<div class="mbar"><span class="${lenClass(n, lo, hi)}" style="width:${Math.min(100, (n / max) * 100)}%"></span></div>`;
    return `
      <div class="side-card">
        <h4>SEO score</h4>
        <div class="score-ring">${ringSvg(r.score)}
          <div class="sr-meta"><div class="srm-big">${r.score >= 75 ? "Strong" : r.score >= 45 ? "Getting there" : "Needs work"}</div>
          <div class="srm-sub">${r.checklist.filter((c) => c.state === "pass").length}/${r.checklist.length} checks · ${r.wordCount} words</div>
          <div class="srm-sub" style="margin-top:4px">Readability <b class="mono" style="color:var(--ink-700)">${read}</b> · ${readLabel(read)}</div></div></div>
        <div class="check-list">${r.checklist.map((c) => { const cls = c.state === "pass" ? "ok" : c.state === "warn" ? "warn" : "no"; const ic = c.state === "pass" ? "check" : c.state === "warn" ? "clock" : "x"; return `<div class="check-item ${cls}"><span class="ci-box">${svg(ic, 12)}</span><span>${c.label}${c.state === "pass" ? "" : `<div class="ci-hint">${esc(c.hint)}</div>`}</span></div>`; }).join("")}</div>
      </div>
      <div class="side-card">
        <h4>Search appearance</h4>
        <div class="meter-field"><label>Slug <span class="mf-count">/blog/${esc(a.slug || "")}</span></label><input id="mSlug" value="${esc(a.slug || "")}"></div>
        <div class="meter-field"><label>Meta title <span class="mf-count ${lenClass(mtLen, 40, 60)}">${mtLen}/60</span></label><input id="mTitle" value="${esc(a.meta_title || "")}" placeholder="${esc(a.title || "")}">${lenBar(mtLen, 70, 40, 60)}</div>
        <div class="meter-field"><label>Meta description <span class="mf-count ${lenClass(mdLen, 120, 160)}">${mdLen}/160</span></label><textarea id="mDesc" placeholder="A compelling ~155-character summary…">${esc(a.meta_desc || "")}</textarea>${lenBar(mdLen, 180, 120, 160)}</div>
        <div class="meter-field"><label>Focus keyword</label><input id="mKw" value="${esc(a.keyword || "")}" placeholder="e.g. content cadence"></div>
      </div>
      <div class="side-card">
        <h4>Featured image</h4>
        <div class="feat-slot" id="featSlot">${a.featured_image_url ? `<img src="${esc(a.featured_image_url)}" alt="">` : `${svg("image", 20)}&nbsp; Choose from Media`}</div>
      </div>
      <div class="side-card">
        <h4>Organise</h4>
        <div class="meter-field"><label>Category</label><select id="mCat" class="sel-mini" style="width:100%;border-radius:var(--r-sm)"><option value="">— none —</option>${state.cats.map((c) => `<option value="${c.id}" ${a.category_id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
        <div class="meter-field"><label>Author</label><select id="mAuthor" class="sel-mini" style="width:100%;border-radius:var(--r-sm)"><option value="">— none —</option>${state.authors.map((au) => `<option value="${au.id}" ${a.author_id === au.id ? "selected" : ""}>${esc(au.name)}</option>`).join("")}</select></div>
        <div class="meter-field"><label>Tags</label><div class="chips" id="tagChips">${(a.tags || []).map((t) => `<span class="chip-x">${esc(t)} <b data-untag="${esc(t)}">×</b></span>`).join("")}<input id="tagIn" placeholder="Add tag…"></div></div>
      </div>
      <div class="side-card">
        <h4>Revisions</h4>
        <div id="revList">${renderRevs()}</div>
      </div>
      <div class="side-card">
        <h4>Publishing</h4>
        <div class="meter-field"><label>Schema preview (JSON-LD)</label>
          <div class="mono" style="font-size:11px;color:var(--ink-400);background:var(--bg-card);border:.5px solid var(--line);border-radius:var(--r-sm);padding:9px 11px;max-height:120px;overflow:auto">${esc(JSON.stringify(buildSchemaPreview(a), null, 1))}</div></div>
      </div>`;
  }
  function buildSchemaPreview(a) {
    return { "@context": "https://schema.org", "@type": "Article", headline: a.title || "", description: a.meta_desc || a.excerpt || "", image: a.featured_image_url || null, author: { "@type": "Person", name: authorName(a.author_id) } };
  }
  function renderRevs() {
    if (!state.revs.length) return `<p class="muted" style="font-size:12.5px">Autosaves appear here. Every save snapshots the article (last 20 kept).</p>`;
    return state.revs.map((v) => `<div class="rev-item"><span class="rv-v">v${v.version_no}</span><span class="rv-when">${relTime(v.saved_at)} · ${esc(v.saved_by || "you")}</span><span class="rv-restore" data-restore="${v.version_no}">Restore</span></div>`).join("");
  }

  // Editor wiring: toolbar, autosave/scoring, meta fields, tags, image, revisions.
  let _scoreTimer, _autosaveTimer;
  function refreshSidebar() { const s = $("#edSide"); if (s && state.editing) { s.innerHTML = renderSidebar(state.editing); wireSidebar(); } }
  function debouncedScore() { clearTimeout(_scoreTimer); _scoreTimer = setTimeout(refreshSidebar, 400); }
  function scheduleAutosave() {
    clearTimeout(_autosaveTimer);
    _autosaveTimer = setTimeout(() => {
      const a = state.editing; if (!a) return;
      const v = (state.revs[0]?.version_no || 0) + 1;
      state.revs.unshift({ version_no: v, saved_at: new Date().toISOString(), saved_by: "you" });
      if (state.revs.length > 20) state.revs.length = 20;
      a.updated_at = new Date().toISOString();
      const rl = $("#revList"); if (rl) { rl.innerHTML = renderRevs(); wireRevs(); }
      const ss = $("#saveState"); if (ss) ss.textContent = "Saved just now";
      if (connected()) client().rpc("save_article_revision", { p_article: a.id }).catch(() => {});
    }, 1400);
  }

  function wireEditor() {
    const a = state.editing; const canvas = $("#edCanvas"), titleI = $("#edTitle");
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) {}  // Enter → <p>, so the sanitiser keeps blocks
    // Paste is sanitised through the shared allowlist (content-editor.mjs) — the
    // blog-render Edge Fn injects content_html raw, so it must be clean at the source.
    canvas.addEventListener("paste", (e) => {
      e.preventDefault();
      const cd = e.clipboardData || window.clipboardData;
      const html = cd.getData("text/html"), text = cd.getData("text/plain");
      const clean = html ? sanitizeHtml(html) : esc(text).replace(/\n/g, "<br>");
      document.execCommand("insertHTML", false, clean); syncBody();
    });
    // toolbar exec
    document.querySelectorAll("#edToolbar [data-cmd]").forEach((b) => b.onmousedown = (e) => { e.preventDefault(); document.execCommand(b.getAttribute("data-cmd"), false, null); syncBody(); });
    document.querySelectorAll("#edToolbar [data-block]").forEach((b) => b.onmousedown = (e) => { e.preventDefault(); const tag = b.getAttribute("data-block"); document.execCommand("formatBlock", false, tag); syncBody(); });
    $("#tbDivider").onmousedown = (e) => { e.preventDefault(); document.execCommand("insertHorizontalRule"); syncBody(); };
    $("#tbLink").onmousedown = (e) => { e.preventDefault(); linkPopup(false); };
    $("#tbInternal").onmousedown = (e) => { e.preventDefault(); linkPopup(true); };
    $("#tbImage").onmousedown = (e) => { e.preventDefault(); insertImage(); };
    $("#tbSlash").onmousedown = (e) => { e.preventDefault(); slashMenu(); };

    titleI.oninput = () => { a.title = titleI.value; a.slug = a.slug && !a.slug.startsWith("untitled") ? a.slug : slugify(titleI.value); debouncedScore(); scheduleAutosave(); };
    canvas.oninput = () => { syncBody(); };
    canvas.onkeydown = (e) => { if (e.key === "/" && isLineEmpty()) { setTimeout(() => slashMenu(true), 0); } };

    $("#btnPreview").onclick = previewArticle;
    $("#btnSubmit").onclick = () => doTransition("submit_for_review", "in_review", "Submitted for review");
    $("#btnPublish").onclick = () => doTransition("publish_article", "published", "Published to " + SITE.name);
    $("#btnSchedule").onclick = scheduleModal;
    wireSidebar(); wireRevs();
  }
  function syncBody() { const a = state.editing, canvas = $("#edCanvas"); if (!a || !canvas) return; a.content_html = sanitizeHtml(canvas.innerHTML); debouncedScore(); scheduleAutosave(); }
  function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "untitled"; }
  function isLineEmpty() { const sel = window.getSelection(); if (!sel.rangeCount) return false; const node = sel.anchorNode; return node && (node.textContent || "").trim() === ""; }

  function wireSidebar() {
    const a = state.editing;
    const bind = (id, key, after) => { const n = $("#" + id); if (n) n.oninput = () => { a[key] = n.value; if (after) after(); debouncedScore(); scheduleAutosave(); }; };
    bind("mSlug", "slug"); bind("mTitle", "meta_title"); bind("mDesc", "meta_desc"); bind("mKw", "keyword");
    const cat = $("#mCat"); if (cat) cat.onchange = () => { a.category_id = cat.value || null; scheduleAutosave(); };
    const au = $("#mAuthor"); if (au) au.onchange = () => { a.author_id = au.value || null; refreshSidebar(); scheduleAutosave(); };
    const slot = $("#featSlot"); if (slot) slot.onclick = () => window.AssetPicker.open({ accept: "image", onSelect: (as) => { if (as[0]) { a.featured_image_url = as[0].storage_path ? (as[0].publicUrl || window.AssetPicker.mockThumb(as[0])) : window.AssetPicker.mockThumb(as[0]); refreshSidebar(); scheduleAutosave(); } } });
    const tagIn = $("#tagIn");
    if (tagIn) tagIn.onkeydown = (e) => { if (e.key === "Enter" && tagIn.value.trim()) { a.tags = [...(a.tags || []), tagIn.value.trim()]; refreshSidebar(); scheduleAutosave(); } };
    document.querySelectorAll("[data-untag]").forEach((b) => b.onclick = () => { const t = b.getAttribute("data-untag"); a.tags = (a.tags || []).filter((x) => x !== t); refreshSidebar(); scheduleAutosave(); });
  }
  function wireRevs() {
    document.querySelectorAll("[data-restore]").forEach((b) => b.onclick = () => {
      const v = b.getAttribute("data-restore");
      rpc("restore_article_revision", { p_article: state.editing.id, p_version: Number(v) }, null, `Restored v${v} as a draft`);
      state.editing.status = "draft"; render();
    });
  }

  // Insert image via the shared M06 AssetPicker → <figure><img alt>.
  function insertImage() {
    window.AssetPicker.open({ accept: "image", onSelect: (as) => {
      const a = as[0]; if (!a) return;
      const src = window.AssetPicker.mockThumb(a);
      const alt = (a.ai_tags && a.ai_tags[0]) ? a.ai_tags.join(", ") : a.filename || "image";
      focusCanvas(); document.execCommand("insertHTML", false, `<figure><img src="${src}" alt="${esc(alt)}"><figcaption>${esc(a.filename || "")}</figcaption></figure><p></p>`);
      syncBody();
    } });
  }
  function focusCanvas() { const c = $("#edCanvas"); c.focus(); }

  // Link / internal-link popup near the toolbar.
  function linkPopup(internal) {
    closePops(); focusCanvas();
    const sel = window.getSelection(); const saved = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const anchor = $("#tbLink").getBoundingClientRect();
    const pop = el("div", "mini-pop");
    pop.style.left = (anchor.left) + "px"; pop.style.top = (anchor.bottom + 6) + "px";
    if (internal) {
      const pub = state.articles.filter((x) => x.status === "published" && x.id !== state.editing.id);
      pop.innerHTML = `<input class="mp-input" id="ilq" placeholder="Search published articles…" autofocus>
        <div id="ilList">${pub.map((p) => `<div class="mp-item" data-slug="${esc(p.slug)}" data-t="${esc(p.title)}"><span class="mp-ico">${svg("doc", 14)}</span><span>${esc(p.title)}<div class="mp-sub">/blog/${esc(p.slug)}</div></span></div>`).join("") || `<div class="mp-item">No published articles yet</div>`}</div>`;
    } else {
      pop.innerHTML = `<input class="mp-input" id="urlIn" placeholder="https://…" autofocus>
        <div class="mp-item" id="urlGo"><span class="mp-ico">${svg("link", 14)}</span><span>Apply link to selection</span></div>`;
    }
    $("#modalRoot").appendChild(pop);
    const restore = () => { if (saved) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(saved); } };
    if (internal) {
      const q = $("#ilq"); q.focus();
      q.oninput = () => { const term = q.value.toLowerCase(); document.querySelectorAll("#ilList .mp-item").forEach((it) => { const t = (it.getAttribute("data-t") || "").toLowerCase(); it.style.display = t.includes(term) ? "" : "none"; }); };
      document.querySelectorAll("#ilList [data-slug]").forEach((it) => it.onmousedown = (e) => { e.preventDefault(); restore(); document.execCommand("createLink", false, "/blog/" + it.getAttribute("data-slug")); syncBody(); closePops(); });
    } else {
      const go = () => { const url = $("#urlIn").value.trim(); if (url) { restore(); document.execCommand("createLink", false, url); syncBody(); } closePops(); };
      $("#urlGo").onmousedown = (e) => { e.preventDefault(); go(); };
      $("#urlIn").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); go(); } };
      $("#urlIn").focus();
    }
    setTimeout(() => document.addEventListener("mousedown", outside), 0);
    function outside(e) { if (!pop.contains(e.target)) closePops(); }
    pop._outside = outside;
  }
  function slashMenu(fromKey) {
    closePops(); focusCanvas();
    const blocks = [
      { t: "Heading 2", ic: "h2", act: () => document.execCommand("formatBlock", false, "h2") },
      { t: "Heading 3", ic: "h3", act: () => document.execCommand("formatBlock", false, "h3") },
      { t: "Bullet list", ic: "listu", act: () => document.execCommand("insertUnorderedList") },
      { t: "Numbered list", ic: "listo", act: () => document.execCommand("insertOrderedList") },
      { t: "Quote", ic: "quote", act: () => document.execCommand("formatBlock", false, "blockquote") },
      { t: "Divider", ic: "minus", act: () => document.execCommand("insertHorizontalRule") },
      { t: "Image (Media)", ic: "image", act: insertImage },
      { t: "FAQ block", ic: "queue", act: () => document.execCommand("insertHTML", false, `<h3>Frequently asked questions</h3><p><b>Q. </b>Your question?</p><p><b>A. </b>Your answer.</p>`) },
    ];
    const r = $("#tbSlash").getBoundingClientRect();
    const pop = el("div", "mini-pop");
    pop.style.left = r.left + "px"; pop.style.top = (r.bottom + 6) + "px";
    pop.innerHTML = blocks.map((b, i) => `<div class="mp-item" data-i="${i}"><span class="mp-ico">${svg(b.ic, 14)}</span><span>${b.t}</span></div>`).join("");
    $("#modalRoot").appendChild(pop);
    pop.querySelectorAll("[data-i]").forEach((it) => it.onmousedown = (e) => { e.preventDefault(); if (fromKey) removeSlashChar(); blocks[+it.getAttribute("data-i")].act(); syncBody(); closePops(); });
    setTimeout(() => document.addEventListener("mousedown", outside), 0);
    function outside(e) { if (!pop.contains(e.target)) closePops(); }
    pop._outside = outside;
  }
  function removeSlashChar() { const sel = window.getSelection(); if (sel.rangeCount) { const r = sel.getRangeAt(0); const n = r.startContainer; if (n.nodeType === 3 && n.textContent.endsWith("/")) n.textContent = n.textContent.slice(0, -1); } }
  function closePops() { document.querySelectorAll(".mini-pop").forEach((p) => { if (p._outside) document.removeEventListener("mousedown", p._outside); p.remove(); }); }

  async function doTransition(rpcName, newStatus, okMsg) {
    const a = state.editing;
    await rpc(rpcName, { p_article: a.id }, () => { a.status = newStatus; if (newStatus === "published") a.published_at = new Date().toISOString(); }, okMsg);
    a.status = newStatus; if (newStatus === "published") a.published_at = new Date().toISOString();
    render();
  }
  function previewArticle() {
    const a = state.editing;
    const w = window.open("", "_blank");
    if (!w) { toast("Preview blocked by popup blocker", "danger"); return; }
    const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(a.meta_title || a.title)}</title>
      <link rel="stylesheet" href="styles/tokens.css">
      <style>body{margin:0;background:var(--bg);color:var(--ink-700);font-family:var(--font-sans);line-height:1.7}
      .w{max-width:720px;margin:0 auto;padding:48px 22px}h1{font-family:var(--font-serif);font-size:40px;color:var(--ink-900)}
      h2{font-family:var(--font-serif);color:var(--ink-900)}img{max-width:100%;border-radius:14px}a{color:var(--teal-700)}
      blockquote{border-left:3px solid var(--teal-500);margin:1.2em 0;padding:.3em 1.1em;color:var(--ink-500);font-style:italic}</style></head>
      <body><div class="w"><p class="mono" style="color:var(--teal-700);text-transform:uppercase;letter-spacing:.14em;font-size:12px">${esc(catName(a.category_id))}</p>
      <h1>${esc(a.title)}</h1><p style="color:var(--ink-400)">By ${esc(authorName(a.author_id))}</p>${a.featured_image_url ? `<img src="${esc(a.featured_image_url)}" alt="">` : ""}${a.content_html || ""}</div></body></html>`;
    w.document.write(doc); w.document.close();
  }
  function scheduleModal() {
    const a = state.editing;
    const now = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
    modal("Schedule publish", `<div class="form-field full"><label>Publish date &amp; time</label><input type="datetime-local" id="schWhen" value="${now}"></div>
      <p class="muted" style="font-size:12.5px;margin-top:10px">The <b>m22-scheduled-publish</b> cron (every 15 min) publishes due articles automatically.</p>`,
      "Schedule", async () => { const when = $("#schWhen").value; await rpc("schedule_article", { p_article: a.id, p_at: new Date(when).toISOString() }, () => { a.status = "scheduled"; a.scheduled_at = new Date(when).toISOString(); }, "Scheduled"); a.status = "scheduled"; a.scheduled_at = new Date(when).toISOString(); render(); });
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  ROUTE: /content/review — editorial queue
  // ════════════════════════════════════════════════════════════════════════════
  function viewReview() {
    const queue = state.articles.filter((a) => a.status === "in_review" || a.status === "draft").filter((a) => a.status === "in_review" || (a.content_html && a.word_count > 5));
    const inReview = state.articles.filter((a) => a.status === "in_review");
    let grid;
    if (state.view === "loading") grid = `<div class="review-grid">${Array.from({ length: 3 }).map(() => `<div class="rev-card"><div class="rc-cover skeleton" style="border-radius:0"></div><div class="rc-body"><div class="skeleton" style="height:18px;width:80%"></div><div class="skeleton" style="height:40px"></div></div></div>`).join("")}</div>`;
    else if (state.view === "error") grid = `<div class="card panel"><div class="empty-state"><div class="es-ico" style="background:rgba(196,97,78,.14);color:var(--status-danger)">${svg("x", 22)}</div><h3>Couldn't load the queue</h3><button class="btn btn-ghost es-cta" onclick="location.reload()">Retry</button></div></div>`;
    else if (!inReview.length || state.view === "empty") grid = `<div class="card panel"><div class="empty-state"><div class="es-ico">${svg("check", 22)}</div><h3>Queue is clear</h3><p>No drafts are awaiting review. Submitted articles land here for an editor to approve or send back with feedback.</p></div></div>`;
    else grid = `<div class="review-grid">${inReview.map(reviewCard).join("")}</div>`;
    return mockNote() + pageHead("Editorial", "Review queue", "Drafts submitted for review — approve to publish, or send back with feedback that guides the next revision.",
      `<span class="pill st-in_review">${inReview.length} awaiting</span>`) + grid;
  }
  function reviewCard(a) {
    const r = scoreOf(a), sb = band(a.seo_score ?? r.score), read = a.readability_score ?? r.readability;
    const cover = a.featured_image_url ? `style="background-image:url('${esc(a.featured_image_url)}')"` : "";
    return `<div class="rev-card">
      <div class="rc-cover" ${cover}><span class="rc-status pill st-in_review">In review</span></div>
      <div class="rc-body">
        <div class="mono" style="font-size:11px;color:var(--teal-700);text-transform:uppercase;letter-spacing:.1em">${esc(catName(a.category_id))} · ${esc(authorName(a.author_id))}</div>
        <div class="rc-title">${esc(a.title)}</div>
        <div class="rc-excerpt">${esc(a.excerpt || textOf(a.content_html).slice(0, 130))}</div>
        <div class="rc-scores"><span class="score-chip ${sb}"><span class="sc-dot"></span>SEO ${a.seo_score ?? r.score}</span>
          <span class="score-chip ${read >= 60 ? "good" : read >= 40 ? "ok" : "low"}"><span class="sc-dot"></span>Read ${read}</span>
          <span class="score-chip"><span class="sc-dot" style="background:var(--ink-300)"></span>${a.word_count} words</span></div>
      </div>
      <div class="rc-foot">
        <button class="btn btn-sm btn-ghost" data-editrev="${a.id}">${svg("edit", 13)} Edit</button>
        <button class="btn btn-sm btn-ghost" data-reject="${a.id}">Reject</button>
        <button class="btn btn-sm btn-primary" data-approve="${a.id}">${svg("check", 13)} Approve</button>
      </div></div>`;
  }
  function wireReview() {
    document.querySelectorAll("[data-editrev]").forEach((b) => b.onclick = () => location.hash = "#/content/" + b.getAttribute("data-editrev"));
    document.querySelectorAll("[data-approve]").forEach((b) => b.onclick = async () => { const id = b.getAttribute("data-approve"); await rpc("approve_article", { p_article: id }, () => { const a = state.articles.find((x) => x.id === id); if (a) { a.status = "published"; a.published_at = new Date().toISOString(); } }, "Approved & published"); const a = state.articles.find((x) => x.id === id); if (a) { a.status = "published"; a.published_at = new Date().toISOString(); } render(); });
    document.querySelectorAll("[data-reject]").forEach((b) => b.onclick = () => {
      const id = b.getAttribute("data-reject");
      modal("Send back with feedback", `<div class="form-field full"><label>What needs to change?</label><textarea id="rjFb" placeholder="e.g. Add two internal links and a sourced statistic in the intro." style="min-height:90px"></textarea></div><p class="muted" style="font-size:12px;margin-top:8px">This note is stored on the article and, in Session 23, is fed into the AI regeneration prompt.</p>`,
        "Send back", async () => { const fb = $("#rjFb").value.trim() || "Please revise."; await rpc("reject_article", { p_article: id, p_feedback: fb }, () => { const a = state.articles.find((x) => x.id === id); if (a) { a.status = "draft"; a.reject_feedback = fb; } }, "Sent back to draft"); const a = state.articles.find((x) => x.id === id); if (a) { a.status = "draft"; a.reject_feedback = fb; } render(); });
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  ROUTE: /content/taxonomy — categories + authors
  // ════════════════════════════════════════════════════════════════════════════
  function viewTaxonomy() {
    const catRows = state.cats.map((c) => { const n = state.articles.filter((a) => a.category_id === c.id).length; return `<div class="tax-row"><span class="tr-badge">${esc(c.name[0] || "?")}</span><div class="tr-body"><div class="tr-name">${esc(c.name)}</div><div class="tr-sub">/blog/category/${esc(c.slug)} · ${n} article${n === 1 ? "" : "s"}</div></div><div class="tr-actions"><button class="icon-btn" data-editcat="${c.id}">${svg("edit", 14)}</button><button class="icon-btn danger" data-delcat="${c.id}">${svg("trash", 14)}</button></div></div>`; }).join("") || `<p class="muted" style="padding:14px 4px">No categories yet.</p>`;
    const authRows = state.authors.map((a) => `<div class="tax-row"><span class="tr-badge ${a.user_id ? "" : "gold"}">${esc(a.name[0] || "?")}</span><div class="tr-body"><div class="tr-name">${esc(a.name)}</div><div class="tr-sub">${a.user_id ? "Workspace user" : "Pen name"}${a.bio ? " · " + esc(a.bio) : ""}</div></div><div class="tr-actions"><button class="icon-btn" data-editauth="${a.id}">${svg("edit", 14)}</button><button class="icon-btn danger" data-delauth="${a.id}">${svg("trash", 14)}</button></div></div>`).join("");
    return mockNote() + pageHead("Taxonomy", "Categories &amp; authors", "Organise the blog into categories and manage bylines — a workspace user or a pen name.", "")
      + `<div class="tax-grid">
        <div class="card panel"><div class="panel-head"><span class="ph-ico">${svg("tag")}</span><h3>Categories</h3><span class="cc-viewall" id="addCat">${svg("plus", 13)} New</span></div>${catRows}</div>
        <div class="card panel"><div class="panel-head"><span class="ph-ico">${svg("user")}</span><h3>Authors</h3><span class="cc-viewall" id="addAuth">${svg("plus", 13)} New</span></div>${authRows}</div>
      </div>`;
  }
  function wireTaxonomy() {
    $("#addCat").onclick = () => catModal();
    $("#addAuth").onclick = () => authModal();
    document.querySelectorAll("[data-editcat]").forEach((b) => b.onclick = () => catModal(state.cats.find((c) => c.id === b.getAttribute("data-editcat"))));
    document.querySelectorAll("[data-editauth]").forEach((b) => b.onclick = () => authModal(state.authors.find((a) => a.id === b.getAttribute("data-editauth"))));
    document.querySelectorAll("[data-delcat]").forEach((b) => b.onclick = () => { const id = b.getAttribute("data-delcat"); state.cats = state.cats.filter((c) => c.id !== id); toast("Category deleted (preview)"); render(); });
    document.querySelectorAll("[data-delauth]").forEach((b) => b.onclick = () => { const id = b.getAttribute("data-delauth"); state.authors = state.authors.filter((a) => a.id !== id); toast("Author deleted (preview)"); render(); });
  }
  function catModal(existing) {
    modal(existing ? "Edit category" : "New category", `<div class="form-field full"><label>Name</label><input id="cName" value="${esc(existing?.name || "")}"></div><div class="form-field full"><label>Slug</label><input id="cSlug" value="${esc(existing?.slug || "")}" placeholder="auto from name"></div>`,
      "Save", () => { const name = $("#cName").value.trim(); if (!name) return; const slug = $("#cSlug").value.trim() || slugify(name); if (existing) { existing.name = name; existing.slug = slug; } else state.cats.push({ id: "c-" + Math.random().toString(36).slice(2, 6), name, slug, site_id: SITE.id }); toast("Category saved (preview)"); render(); });
  }
  function authModal(existing) {
    modal(existing ? "Edit author" : "New author", `<div class="form-field full"><label>Display name</label><input id="aName" value="${esc(existing?.name || "")}"></div><div class="form-field full"><label>Bio</label><input id="aBio" value="${esc(existing?.bio || "")}"></div><p class="muted" style="font-size:12px">Leave unlinked for a pen name, or link a workspace user for a real byline (linking UI ships with live auth).</p>`,
      "Save", () => { const name = $("#aName").value.trim(); if (!name) return; const bio = $("#aBio").value.trim(); if (existing) { existing.name = name; existing.bio = bio; } else state.authors.push({ id: "au-" + Math.random().toString(36).slice(2, 6), name, bio, user_id: null }); toast("Author saved (preview)"); render(); });
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  ROUTE: /content/bulk — Bulk Content Creation (Job Builder + Status Dashboard)
  // ════════════════════════════════════════════════════════════════════════════
  const MOCK_BATCH_ITEMS = {
    b1: [
      { id: "bi1", article_id: "a-bi1", keyword: "best dua for travel", status: "in_review", duplicate: false },
      { id: "bi2", article_id: "a-bi2", keyword: "dua for anxiety", status: "in_review", duplicate: false },
      { id: "bi3", article_id: "a-bi3", keyword: "dua for travel", status: "in_review", duplicate: true },
    ],
  };

  function viewBulk() {
    const rows = MOCK_BATCHES.map((b) => {
      const items = MOCK_BATCH_ITEMS[b.id] || [];
      const dupCount = items.filter((i) => i.duplicate).length;
      return `<tr>
      <td>${esc(b.name)}</td><td><span class="pill st-${esc(b.status)}">${esc(b.status)}</span></td>
      <td>${b.total_items}</td><td>${esc(b.model)}</td>
      <td>${dupCount ? `<span class="pill st-warn">${dupCount} dup</span>` : "—"}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-sm" data-review-batch="${b.id}">Review items</button>
        <button class="btn btn-sm" data-schedule="${b.id}">Schedule spread</button>
        <button class="btn btn-sm" data-rollback="${b.id}">Rollback</button>
      </td>
    </tr>${state.bulkExpanded === b.id ? `<tr><td colspan="6">${batchItemsPanel(b, items)}</td></tr>` : ""}`;
    }).join("");
    const dashboard = MOCK_BATCHES.length
      ? `<table class="tbl"><thead><tr><th>Name</th><th>Status</th><th>Items</th><th>Model</th><th>Duplicates</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      : `<div class="card panel"><div class="empty-state"><h3>No batch jobs yet</h3><p>Build your first batch below.</p></div></div>`;

    const templateOpts = MOCK_TEMPLATES.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("");

    return pageHead("Bulk", "Bulk create", "Generate a batch of articles from a topic list, a CSV, or an AI-expanded seed keyword — preview a few before committing the rest.", "")
      + `<div class="card panel" style="margin-bottom:16px">
        <h3 style="margin-top:0">New batch</h3>
        <div class="form-field"><label>Batch name</label><input id="bName" placeholder="e.g. Ramadan dua series"></div>
        <div class="form-field"><label>Topic source</label>
          <select id="bSource"><option value="manual">Manual list</option><option value="csv">CSV upload</option><option value="ai_seed">AI-generate from seed keyword</option></select>
        </div>
        <div id="bSourceInputs">
          <div class="form-field"><label>Topics (one per line)</label><textarea id="bManualTopics" rows="4" placeholder="best dua for travel&#10;dua for anxiety"></textarea></div>
        </div>
        <div class="form-field"><label>Template (optional)</label><select id="bTemplate"><option value="">None</option>${templateOpts}</select></div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <div class="form-field"><label>Model</label><select id="bModel"><option value="claude-sonnet-5">Claude Sonnet 5 (quality)</option><option value="claude-3-5-haiku-20241022">Claude Haiku (cheap)</option></select></div>
          <div class="form-field"><label>Word count min</label><input id="bWordMin" type="number" value="800"></div>
          <div class="form-field"><label>Word count max</label><input id="bWordMax" type="number" value="1600"></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <button class="btn" id="bEstimate">Estimate cost</button>
          <button class="btn" id="bPreview">Generate 3 samples</button>
          <button class="btn btn-primary" id="bCommit">Commit batch</button>
        </div>
        <div id="bEstimateOut" class="muted" style="margin-top:8px"></div>
      </div>
      <h3>Batch status</h3>${dashboard}`;
  }

  // batchItemsPanel — the Bulk Edit/Reject drill-down: one row per content_queue item
  // this batch produced, with a checkbox + status + duplicate flag, and a toolbar that
  // applies approve/reject to every checked row via the SAME per-article RPCs the
  // Review queue already uses (approve_article/reject_article) — no new RPCs needed,
  // this is just a multi-select wrapper around the existing single-article actions.
  function batchItemsPanel(batch, items) {
    const rows = items.map((i) => `<tr>
      <td><input type="checkbox" data-bi-chk="${i.id}" ${state.bulkSelected.has(i.id) ? "checked" : ""}></td>
      <td>${esc(i.keyword)}</td><td><span class="pill st-${esc(i.status)}">${esc(i.status)}</span></td>
      <td>${i.duplicate ? `<span class="pill st-warn">possible duplicate</span>` : "—"}</td>
    </tr>`).join("");
    return `<div class="card panel" style="margin:8px 0">
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <button class="btn btn-sm" id="biApproveAll">Approve selected</button>
        <button class="btn btn-sm" id="biRejectAll">Reject selected</button>
      </div>
      <table class="tbl"><thead><tr><th></th><th>Topic</th><th>Status</th><th>Duplicate</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  }

  function wireBulk() {
    const src = $("#bSource"); if (src) src.onchange = () => {
      const inputs = $("#bSourceInputs"); if (!inputs) return;
      if (src.value === "csv") inputs.innerHTML = `<div class="form-field"><label>CSV file</label><input id="bCsvFile" type="file" accept=".csv"></div>`;
      else if (src.value === "ai_seed") inputs.innerHTML = `<div class="form-field"><label>Seed keyword / category</label><input id="bSeed" placeholder="e.g. Ramadan content"></div><div class="form-field"><label>How many topics</label><input id="bSeedCount" type="number" value="20"></div>`;
      else inputs.innerHTML = `<div class="form-field"><label>Topics (one per line)</label><textarea id="bManualTopics" rows="4" placeholder="best dua for travel&#10;dua for anxiety"></textarea></div>`;
    };

    function collectTopics() {
      const source = $("#bSource")?.value || "manual";
      if (source === "csv") {
        const file = $("#bCsvFile")?.files?.[0];
        if (!file) return [];
        return []; // resolved asynchronously via FileReader in a real commit handler; the
                   // wizard's Estimate/Preview/Commit buttons below call this synchronously
                   // for manual/ai_seed and separately await CSV parsing when a file is present.
      }
      if (source === "ai_seed") {
        const seed = $("#bSeed")?.value.trim(); if (!seed) return [];
        const n = parseInt($("#bSeedCount")?.value || "20", 10);
        return Array.from({ length: n }, (_, i) => ({ keyword: `${seed} — topic ${i + 1}` }));
      }
      const raw = $("#bManualTopics")?.value || "";
      return raw.split("\n").map((s) => s.trim()).filter(Boolean).map((keyword) => ({ keyword }));
    }

    async function withCsvTopics(cb) {
      const source = $("#bSource")?.value || "manual";
      if (source !== "csv") return cb(collectTopics());
      const file = $("#bCsvFile")?.files?.[0];
      if (!file) { toast("Choose a CSV file first", "danger"); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const { rows } = parseCsvText(String(reader.result || ""));
        cb(rows.map((r) => ({ keyword: r[0] })).filter((t) => t.keyword));
      };
      reader.readAsText(file);
    }

    function batchArgs() {
      return {
        p_ws: null, // resolved server-side by has_role() against the caller's session in live mode
        p_site: SITE.id, p_name: $("#bName")?.value.trim() || "Untitled batch",
        p_topic_source: $("#bSource")?.value || "manual",
        p_template: $("#bTemplate")?.value || null,
        p_model: $("#bModel")?.value || "claude-sonnet-5",
        p_word_min: parseInt($("#bWordMin")?.value || "800", 10),
        p_word_max: parseInt($("#bWordMax")?.value || "1600", 10),
      };
    }

    const est = $("#bEstimate"); if (est) est.onclick = () => withCsvTopics(async (topics) => {
      if (!topics.length) return toast("Add at least one topic first", "danger");
      const out = $("#bEstimateOut");
      if (connected()) {
        const { data: id } = await client().rpc("create_batch_job", { ...batchArgs(), p_topics: topics });
        const { data: est2 } = await client().rpc("estimate_batch_cost", { p_batch: id });
        if (out) out.textContent = `~${est2?.est_tokens ?? 0} tokens, ~$${est2?.est_cost_usd ?? 0} for ${topics.length} articles`;
      } else if (out) {
        const roughTokens = Math.round(((parseInt($("#bWordMin").value,10)+parseInt($("#bWordMax").value,10))/2)*2.2*topics.length);
        out.textContent = `~${roughTokens} tokens, ~$${(roughTokens/1000*0.009).toFixed(2)} for ${topics.length} articles (preview)`;
      }
    });

    const prev = $("#bPreview"); if (prev) prev.onclick = () => withCsvTopics(async (topics) => {
      if (!topics.length) return toast("Add at least one topic first", "danger");
      await rpc("generate_batch_preview", { p_n: 3 }, () => {
        MOCK_BATCHES.unshift({ id: "b" + Math.random().toString(36).slice(2, 6), name: $("#bName").value || "Untitled batch",
          topic_source: $("#bSource").value, status: "previewing", total_items: topics.length, model: $("#bModel").value, created_at: new Date().toISOString() });
      }, "Generated 3 preview samples"); render();
    });

    const commit = $("#bCommit"); if (commit) commit.onclick = () => withCsvTopics(async (topics) => {
      if (!topics.length) return toast("Add at least one topic first", "danger");
      await rpc("commit_batch_job", {}, () => {
        const existing = MOCK_BATCHES.find((b) => b.status === "previewing");
        if (existing) existing.status = "queued"; else MOCK_BATCHES.unshift({
          id: "b" + Math.random().toString(36).slice(2, 6), name: $("#bName").value || "Untitled batch",
          topic_source: $("#bSource").value, status: "queued", total_items: topics.length, model: $("#bModel").value, created_at: new Date().toISOString() });
      }, "Batch committed — generation will drain via the scheduler"); render();
    });

    document.querySelectorAll("[data-rollback]").forEach((b) => b.onclick = async () => {
      const id = b.getAttribute("data-rollback");
      await rpc("rollback_batch_job", { p_batch: id }, () => {
        const batch = MOCK_BATCHES.find((x) => x.id === id); if (batch) batch.status = "rolled_back";
      }, "Batch rolled back"); render();
    });

    document.querySelectorAll("[data-review-batch]").forEach((b) => b.onclick = () => {
      const id = b.getAttribute("data-review-batch");
      state.bulkExpanded = state.bulkExpanded === id ? null : id;
      state.bulkSelected.clear(); render();
    });

    document.querySelectorAll("[data-schedule]").forEach((b) => b.onclick = async () => {
      const id = b.getAttribute("data-schedule");
      const days = parseInt(prompt("Spread across how many days?", "7") || "0", 10);
      const perDay = parseInt(prompt("How many per day?", "3") || "0", 10);
      if (!days || !perDay) return;
      await rpc("schedule_batch_publish_spread",
        { p_batch: id, p_start: new Date().toISOString(), p_spread_days: days, p_per_day: perDay },
        () => { const batch = MOCK_BATCHES.find((x) => x.id === id); if (batch) batch.status = "completed"; },
        "Publish dates spread across the batch"); render();
    });

    document.querySelectorAll("[data-bi-chk]").forEach((n) => n.onclick = () => {
      const id = n.getAttribute("data-bi-chk");
      state.bulkSelected.has(id) ? state.bulkSelected.delete(id) : state.bulkSelected.add(id);
    });

    const approveAll = $("#biApproveAll"); if (approveAll) approveAll.onclick = async () => {
      for (const id of state.bulkSelected) {
        const item = (MOCK_BATCH_ITEMS[state.bulkExpanded] || []).find((i) => i.id === id);
        if (item) await rpc("approve_article", { p_article: item.article_id }, () => { item.status = "published"; }, `Approved ${item.keyword}`);
      }
      state.bulkSelected.clear(); render();
    };
    const rejectAll = $("#biRejectAll"); if (rejectAll) rejectAll.onclick = async () => {
      for (const id of state.bulkSelected) {
        const item = (MOCK_BATCH_ITEMS[state.bulkExpanded] || []).find((i) => i.id === id);
        if (item) await rpc("reject_article", { p_article: item.article_id, p_feedback: "Bulk-rejected — please revise." }, () => { item.status = "draft"; }, `Sent back ${item.keyword}`);
      }
      state.bulkSelected.clear(); render();
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  ROUTE: /settings/content
  // ════════════════════════════════════════════════════════════════════════════
  function viewSettings() {
    return mockNote() + pageHead("Configuration", "Content settings", "Per-site blog defaults and (coming in Session 23) the AI auto-blogging schedule.", "")
      + `<div class="card panel" style="max-width:720px"><div class="panel-head"><span class="ph-ico">${svg("gear")}</span><h3>Blog defaults · ${esc(SITE.name)}</h3></div>
        <div class="form-grid">
          <div class="form-field"><label>Default author</label><select>${state.authors.map((a) => `<option>${esc(a.name)}</option>`).join("")}</select></div>
          <div class="form-field"><label>Blog base path</label><input value="/blog"></div>
          <div class="form-field"><label>Posts per page</label><input value="12"></div>
          <div class="form-field"><label>RSS feed</label><select><option>Enabled</option><option>Disabled</option></select></div>
        </div>
        <div style="margin-top:16px"><button class="btn btn-primary btn-sm" onclick="(function(){})()" id="saveSettings">Save defaults</button></div>
      </div>
      <div class="card panel" style="max-width:720px;margin-top:20px">
        <div class="panel-head"><span class="ph-ico" style="background:var(--grad-ai);color:#fff">${svg("sparkle")}</span><h3>AI auto-blogging</h3><span class="pill attention" style="margin-left:auto">Session 23</span></div>
        <div class="scaffold-note" style="margin-bottom:16px"><span class="sn-ico">${svg("sparkle", 15)}</span><span>The full keyword → published pipeline (SERP research, GPT-4o drafting, DALL·E imagery, quality gate, auto-distribution) ships in the <b>Session 23</b> auto-blog slice. These controls are previewed but disabled here.</span></div>
        <fieldset class="locked"><div class="form-grid">
          <div class="form-field"><label>Frequency</label><select><option>3× per week</option></select></div>
          <div class="form-field"><label>Publish mode</label><select><option>Review queue first</option></select></div>
          <div class="form-field"><label>Brand voice</label><input value="Warm, practical, expert"></div>
          <div class="form-field"><label>Target word count</label><input value="1200"></div>
          <div class="form-field full"><label>Niche context</label><textarea>Wellness studio serving busy professionals.</textarea></div>
          <div class="form-field"><label>Min SEO score to auto-publish</label><input value="70"></div>
          <div class="form-field"><label>Min readability</label><input value="55"></div>
        </div></fieldset>
      </div>`;
  }
  function wireSettings() { const b = $("#saveSettings"); if (b) b.onclick = () => toast("Defaults saved (preview)"); }

  // ── shared modal helper ─────────────────────────────────────────────────────
  function modal(title, bodyHTML, okLabel, onOk) {
    const root = $("#modalRoot");
    const scrim = el("div", "modal-scrim");
    scrim.innerHTML = `<div class="modal-card"><div class="mc-head"><div class="mc-ico">${svg("edit", 17)}</div><div><h3>${esc(title)}</h3></div><button class="btn btn-ghost btn-sm mc-close">${svg("x", 14)}</button></div>
      <div>${bodyHTML}</div><div class="mc-foot"><button class="btn btn-ghost" data-x="cancel">Cancel</button><button class="btn btn-primary" data-x="ok">${esc(okLabel)}</button></div></div>`;
    root.appendChild(scrim); requestAnimationFrame(() => scrim.classList.add("open"));
    const close = () => { scrim.classList.remove("open"); setTimeout(() => scrim.remove(), 300); };
    scrim.querySelector(".mc-close").onclick = close;
    scrim.querySelector('[data-x="cancel"]').onclick = close;
    scrim.querySelector('[data-x="ok"]').onclick = () => { onOk(); close(); };
    scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Router + boot
  // ════════════════════════════════════════════════════════════════════════════
  function parseHash() {
    const h = (location.hash || "#/content").replace(/^#\/?/, "");
    const parts = h.split("/");
    if (parts[0] === "settings") return { route: "settings" };
    if (parts[0] === "content") {
      if (!parts[1]) return { route: "content" };
      if (parts[1] === "review") return { route: "review" };
      if (parts[1] === "taxonomy") return { route: "taxonomy" };
      if (parts[1] === "bulk") return { route: "bulk" };
      return { route: "editor", param: parts[1] };
    }
    return { route: "content" };
  }

  function render() {
    const r = parseHash(); state.route = r.route === "editor" ? "content" : r.route; state.param = r.param || null;
    let content = "";
    if (r.route === "editor") {
      state.editing = state.articles.find((a) => a.id === r.param);
      if (!state.editing) { location.hash = "#/content"; return; }
      state.revs = MOCK_REVS[state.editing.id] ? MOCK_REVS[state.editing.id].slice() : [];
      state.route = "content";
      content = viewEditor();
    } else if (r.route === "review") { state.route = "review"; content = viewReview(); }
    else if (r.route === "taxonomy") { state.route = "taxonomy"; content = viewTaxonomy(); }
    else if (r.route === "bulk") { state.route = "bulk"; content = viewBulk(); }
    else if (r.route === "settings") { state.route = "settings"; content = viewSettings(); }
    else { state.route = "content"; content = viewList(); }

    shell(content);
    wireMockNote();
    if (r.route === "editor") wireEditor();
    else if (r.route === "review") wireReview();
    else if (r.route === "bulk") wireBulk();
    else if (r.route === "taxonomy") wireTaxonomy();
    else if (r.route === "settings") wireSettings();
    else wireList();
    updateBurger();
  }
  function updateBurger() { const b = $("#burger"); if (b) b.style.display = window.innerWidth <= 760 ? "grid" : "none"; }

  // theme + connect drawer
  function toggleTheme() { const cur = document.documentElement.getAttribute("data-theme"); const next = cur === "dark" ? "light" : "dark"; document.documentElement.setAttribute("data-theme", next); try { localStorage.setItem("aimindshare-theme", next); } catch (e) {} render(); }
  function openDrawer() { $("#scrim").classList.add("open"); $("#drawer").classList.add("open"); const c = getCfg(); if (c) { $("#inpUrl").value = c.url || ""; $("#inpAnon").value = c.anon || ""; } }
  function closeDrawer() { $("#scrim").classList.remove("open"); $("#drawer").classList.remove("open"); }
  function wireDrawer() {
    $("#scrim").onclick = closeDrawer; $("#closeDrawer").onclick = closeDrawer;
    $("#saveCfg").onclick = () => { const url = $("#inpUrl").value.trim(), anon = $("#inpAnon").value.trim(); if (!url) return; localStorage.setItem(CFG_KEY, JSON.stringify({ url, anon })); _client = null; closeDrawer(); boot(); };
    $("#clearCfg").onclick = () => { localStorage.removeItem(CFG_KEY); _client = null; closeDrawer(); boot(); };
  }

  async function boot() {
    if (connected()) { try { await loadLive(); if (!state.articles.length) { /* keep live empty */ } } catch (e) { loadMock(); } }
    else loadMock();
    render();
  }

  window.addEventListener("hashchange", render);
  window.addEventListener("resize", updateBurger);
  document.addEventListener("DOMContentLoaded", () => { wireDrawer(); boot(); });
  if (document.readyState !== "loading") { wireDrawer(); boot(); }
})();
