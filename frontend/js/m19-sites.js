/* m19-sites.js — AiMindShare Module M19 · Sites (GrapeJS website builder, authed app).
   Vanilla hash-routed dashboard on Supabase. Three screens:
     /sites                     — site cards (status, pages, domain).
     /sites/:id                 — pages · nav builder · domains · SEO defaults · settings.
     /sites/:id/edit/:pageId    — the GrapeJS editor (blocks/layers/templates · canvas ·
                                  styles/settings/page-meta · device/undo/redo/AI/preview/save/publish).
   Walls are server-side: site/page read+edit = staff+, publish + delete = manager+, domains = admin+
   (RLS). Publishing calls the publish_page RPC; the public renderer is the site-render Edge Fn. Anon key
   only in the browser (Law 3). Offline → a high-fidelity mockup with a default/empty/loading/error/success
   switcher. The AI generator + preview reuse the SAME pure modules the Edge Functions use (page-builder.mjs,
   site-render.mjs) via dynamic import — one source of truth. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const initials = (s) => (s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

  const P = {
    globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z",
    plus: "M12 5v14M5 12h14", check: "M20 6 9 17l-5-5", x: "M18 6 6 18M6 6l12 12", copy: "M9 9h10v10H9zM5 15H4V4h11v1",
    doc: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6", edit: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z",
    ext: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3", spark: "M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z",
    layers: "M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5", trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
    home: "M3 11l9-8 9 8M5 10v10h14V10", search: "M21 21l-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
    undo: "M3 7v6h6M3 13a9 9 0 1 0 3-7", redo: "M21 7v6h-6M21 13a9 9 0 1 1-3-7", eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z",
    save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM7 3v6h8", rocket: "M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M9 11a4 4 0 0 1 5-5c3-3 8-3 8-3s0 5-3 8a4 4 0 0 1-5 5l-2 2-3-3z",
    monitor: "M3 4h18v12H3zM8 20h8M12 16v4", tablet: "M6 2h12v20H6zM12 18h.01", mobile: "M8 2h8v20H8zM12 18h.01", back: "M15 18l-6-6 6-6",
    grid: "M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z",
    puzzle: "M12 2a2 2 0 0 1 2 2v1h3a1 1 0 0 1 1 1v3h1a2 2 0 1 1 0 4h-1v3a1 1 0 0 1-1 1h-3v-1a2 2 0 1 0-4 0v1H6a1 1 0 0 1-1-1v-3H4a2 2 0 1 1 0-4h1V6a1 1 0 0 1 1-1h3V4a2 2 0 0 1 2-2z",
    rows: "M3 4h18v6H3zM3 14h18v6H3z", image: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 5 5M8.5 10a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z",
    form: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM9 8h6M9 12h6M9 16h4",
    book: "M4 4h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2zM8 4v14M11 9h4M11 12h4", link: "M9 15l6-6M10.5 6.5l1-1a4 4 0 0 1 6 6l-1 1M13.5 17.5l-1 1a4 4 0 0 1-6-6l1-1",
    chart: "M3 3v18h18M8 14v4M13 9v9M18 5v13", gear: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
    bell: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0", star: "M12 2.5l2.9 6.4 6.6.6-5 4.4 1.5 6.6L12 17.3 5.5 21l1.5-6.6-5-4.4 6.6-.6z",
    filter: "M3 4h18l-7 8v6l-4 2v-8z", play: "M8 5v14l11-7z", download: "M12 3v12M8 11l4 4 4-4M5 21h14",
    zap: "M13 2 4 14h7l-1 8 9-12h-7z", wand: "M15 4V2M15 10V8M12.5 6.5h-2M19.5 6.5h-2M6 21l9-9-2-2-9 9zM17 5l1 1",
    clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 7v5l3 2", chev: "M9 6l6 6-6 6",
    gauge: "M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5 16a8 8 0 1 1 14 0M13.5 11.5 17 8", palette: "M12 2a10 10 0 1 0 0 20c1.4 0 2-1 2-2v-1c0-1 .5-2 2-2h1c1 0 2-.5 2-2a9 9 0 0 0-9-11zM7.5 10.5v.01M12 7.5v.01M16.5 10.5v.01",
    type: "M4 7V5h16v2M9 19h6M12 5v14", users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9",
  };
  const svg = (n, s = 17) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${P[n] || ""}"/></svg>`;

  /* ── Theme + starfield (dark = no stars, hidden by app.css) ────────────────── */
  const THEME_KEY = "aimindshare-theme";
  const root = document.documentElement;
  const setTheme = (t) => { root.setAttribute("data-theme", t); try { localStorage.setItem(THEME_KEY, t); } catch (e) {} const i = $("#themeIco"); if (i) i.textContent = t === "dark" ? "☀" : "☾"; };
  setTheme((() => { try { return localStorage.getItem(THEME_KEY) || "light"; } catch (e) { return "light"; } })());
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  (function stars() { const field = $("#starField"); if (!field || reduce) return; for (let i = 0; i < 42; i++) { const s = el("div", "star"); s.style.left = Math.random() * 100 + "%"; s.style.top = Math.random() * 100 + "%"; s.style.setProperty("--tw", (3 + Math.random() * 7).toFixed(1) + "s"); s.style.setProperty("--td", (Math.random() * 10).toFixed(1) + "s"); field.appendChild(s); } })();

  /* ── Config + Supabase client (anon key only) ─────────────────────────────── */
  const CFG_KEY = "aimindshare-supabase", ACTIVE_KEY = "aimindshare-active-ws";
  function getCfg() {
    try { const s = JSON.parse(localStorage.getItem(CFG_KEY) || "null"); if (s && s.url) return s; } catch (e) {}
    const g = window.AIMINDSHARE_CONFIG;
    if (g && g.SUPABASE_URL && !/YOUR-/.test(g.SUPABASE_URL)) return { url: g.SUPABASE_URL, anon: g.SUPABASE_ANON_KEY };
    return null;
  }
  let client = null;
  function ensureClient() { const cfg = getCfg(); if (!cfg || !window.supabase?.createClient) { client = null; return null; } if (!client) client = window.supabase.createClient(cfg.url, cfg.anon || "", { auth: { persistSession: true, autoRefreshToken: true } }); return client; }
  const connected = () => !!getCfg() && !!window.supabase;

  /* ── Connect drawer ───────────────────────────────────────────────────────── */
  const drawer = $("#drawer"), scrim = $("#scrim");
  const closeDrawer = () => { drawer.classList.remove("open"); scrim.classList.remove("open"); };
  const openDrawer = () => { const c = getCfg(); if (c) { $("#inpUrl").value = c.url; $("#inpAnon").value = c.anon || ""; } drawer.classList.add("open"); scrim.classList.add("open"); };
  $("#closeDrawer").addEventListener("click", closeDrawer);
  scrim.addEventListener("click", closeDrawer);
  $("#saveCfg").addEventListener("click", async () => { const url = $("#inpUrl").value.trim(), anon = $("#inpAnon").value.trim(); if (!url) { $("#inpUrl").focus(); return; } try { localStorage.setItem(CFG_KEY, JSON.stringify({ url, anon })); } catch (e) {} client = null; closeDrawer(); state.loaded = false; await boot(); });
  $("#clearCfg").addEventListener("click", async () => { try { localStorage.removeItem(CFG_KEY); } catch (e) {} $("#inpUrl").value = ""; $("#inpAnon").value = ""; client = null; state.loaded = false; await boot(); });

  /* ── Toast ────────────────────────────────────────────────────────────────── */
  function toast(msg, kind = "info") {
    const ico = kind === "success" ? "✓" : kind === "danger" ? "⚠" : "◈";
    const t = el("div", "toast " + kind, `<span class="t-ico">${ico}</span><div>${esc(msg)}</div>`);
    $("#toasts").appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateX(20px)"; setTimeout(() => t.remove(), 300); }, 3200);
  }

  /* ── Mockup data ──────────────────────────────────────────────────────────── */
  const MOCK = (() => {
    const home = { html: '<section class="s-hero" style="padding:72px 24px;text-align:center"><h1 style="font-family:var(--font-serif);font-size:52px">Marketing that compounds.</h1><p style="font-size:20px;color:var(--ink-500)">We build growth systems for ambitious brands.</p><a class="s-btn" href="#" style="display:inline-block;background:var(--grad-brand);color:#fff;padding:14px 28px;border-radius:999px">Book a call</a></section>', css: "" };
    const sites = [
      { id: "s1", name: "Northstar Agency", subdomain: "northstar", status: "published", pages: 4, primary_domain: "northstaragency.com", updated_at: "2026-06-30T10:00:00Z", favicon_url: "", preview_token: "amspt7f3a9c2b1e", style_preset: "", maintenance_mode: false, language: "en", last_version: 3, last_published: "2026-06-30T10:00:00Z", sessions_7d: 268, traffic: [22, 31, 28, 44, 39, 52, 52], health_score: 92, niche: "agency", archived: false },
      { id: "s2", name: "Crescent Dental", subdomain: "crescent-dental", status: "draft", pages: 2, primary_domain: null, updated_at: "2026-07-02T14:00:00Z", favicon_url: "", preview_token: "amspt1a2b3c4d5e", style_preset: "islamic", maintenance_mode: false, language: "bn", last_version: null, last_published: null, sessions_7d: 0, traffic: [], health_score: 61, client_name: "Dr. Amina Chowdhury", niche: "dentist", archived: false },
      { id: "s3", name: "Zenith Coaching", subdomain: "zenith", status: "published", pages: 3, primary_domain: "zenithcoaching.io", updated_at: "2026-06-28T09:00:00Z", favicon_url: "", preview_token: "amspt9e8d7c6b5a", style_preset: "elegant", maintenance_mode: true, language: "en", last_version: 7, last_published: "2026-06-28T09:00:00Z", sessions_7d: 144, traffic: [30, 26, 18, 24, 12, 9, 25], health_score: 78, client_name: "Zenith Coaching LLC", niche: "coach", archived: false },
    ];
    const pages = {
      s1: [
        { id: "p1", title: "Home", slug: "home", is_home: true, status: "published", published_at: "2026-06-30T10:00:00Z", page_json: home, render_html: home.html },
        { id: "p2", title: "Services", slug: "services", is_home: false, status: "published", published_at: "2026-06-30T10:00:00Z" },
        { id: "p3", title: "Pricing", slug: "pricing", is_home: false, status: "published", published_at: "2026-06-30T10:00:00Z" },
        { id: "p4", title: "Contact", slug: "contact", is_home: false, status: "draft", published_at: null },
      ],
      s2: [
        { id: "p5", title: "Home", slug: "home", is_home: true, status: "draft", published_at: null, render_html: home.html },
        { id: "p6", title: "Book a visit", slug: "book", is_home: false, status: "draft", published_at: null },
      ],
      s3: [{ id: "p7", title: "Home", slug: "home", is_home: true, status: "published", published_at: "2026-06-28T09:00:00Z", render_html: home.html }],
    };
    const domains = { s1: [{ id: "d1", domain: "northstaragency.com", status: "active", ssl_status: "pending", is_primary: true, verification_token: "ams7f3a9c2b1e", expires_at: "2026-08-02T00:00:00Z" }], s3: [{ id: "d3", domain: "zenithcoaching.io", status: "active", ssl_status: "pending", is_primary: true, verification_token: "ams1a2b3c4d5e", expires_at: "2026-07-11T00:00:00Z" }] };
    const templates = [
      { id: "t1", name: "Dental Practice", niche: "dentist", conversion_type: "booking", description: "Appointment-first site for dental clinics." },
      { id: "t2", name: "Real Estate Agent", niche: "realestate", conversion_type: "lead", description: "Listing-led layout with valuation CTA." },
      { id: "t3", name: "Restaurant & Cafe", niche: "restaurant", conversion_type: "booking", description: "Menu-forward with reservations." },
      { id: "t4", name: "Coaching Program", niche: "coach", conversion_type: "lead", description: "Program tiers and application CTA." },
      { id: "t5", name: "SaaS Launch", niche: "saas", conversion_type: "signup", description: "Feature grid, pricing, trial CTA." },
      { id: "t6", name: "Storefront", niche: "ecom", conversion_type: "purchase", description: "Collection highlights and bundles." },
      { id: "t7", name: "Landing — June promo", niche: "agency", conversion_type: "lead", workspace_id: "ws", description: "Saved from Northstar home." },
    ];
    const versions = [
      { id: "v3", version_no: 3, kind: "publish", label: null, published_at: "2026-06-30T10:00:00Z" },
      { id: "v2", version_no: 2, kind: "save", label: "Before pricing rework", published_at: "2026-06-28T09:00:00Z" },
      { id: "v1", version_no: 1, kind: "publish", label: null, published_at: "2026-06-20T09:00:00Z" },
    ];
    const publishLog = [
      { id: "l1", kind: "page.publish", status: "ok", detail: { slug: "home", version_no: 3 }, created_at: "2026-06-30T10:00:00Z" },
      { id: "l2", kind: "domain.verify", status: "ok", detail: { domain: "northstaragency.com", result: "verified" }, created_at: "2026-06-29T15:00:00Z" },
      { id: "l3", kind: "domain.verify", status: "error", detail: { domain: "northstaragency.com", result: "dns_not_found" }, created_at: "2026-06-29T11:00:00Z" },
    ];
    const analytics = { sessions: 412, identified: 37, topPages: [["/", 268], ["/pricing", 84], ["/services", 60]] };
    // Business Profile (v3 D-153): the structured, reusable source the AI generator
    // references instead of a freeform prompt. One row per site.
    const profiles = {
      s1: { business_name: "Northstar Agency", phone: "+880 1711 000111", email: "hello@northstaragency.com",
        address: "Level 6, Gulshan Avenue, Dhaka 1212", service_areas: ["Dhaka", "Chattogram", "Sylhet", "Remote / global"],
        services: ["Full-funnel strategy", "Conversion design", "Paid media", "Marketing automation", "SEO & content"],
        differentiators: ["Senior-only pods", "Weekly reporting", "No lock-in contracts"],
        exclusions: ["We don't do one-off logos", "No SEO-only retainers under $1.5k"],
        proof_points: ["4.9★ across 60 reviews", "312% avg. pipeline lift", "Meta & Google partner"],
        testimonials: [{ quote: "Best decision we made all year — real results, no fluff.", author: "A. Rahman, Founder, Lumen" }],
        hours: "Sun–Thu, 9am–6pm" },
      s2: { business_name: "Crescent Dental", phone: "+880 1811 222333", email: "care@crescentdental.com",
        address: "House 12, Road 7, Dhanmondi, Dhaka 1205", service_areas: ["Dhanmondi", "Mohammadpur", "Lalmatia"],
        services: ["General dentistry", "Cosmetic dentistry", "Braces & aligners", "Emergency care"],
        differentiators: ["Same-week appointments", "Anxiety-free sedation"], exclusions: [],
        proof_points: ["10,000+ patients", "Insurance handled for you"], testimonials: [], hours: "Sat–Thu, 10am–8pm" },
    };
    // Site Health / quality score (v3 D-155) — nine categories, compute-on-publish.
    const health = {
      s1: { score: 92, updated_at: "2026-06-30T10:00:00Z", categories: [
        { key: "seo", label: "SEO", status: "pass", detail: "All 4 pages have title + meta description" },
        { key: "schema", label: "Schema", status: "pass", detail: "LocalBusiness + FAQPage valid" },
        { key: "a11y", label: "Accessibility", status: "warn", detail: "2 images missing alt text" },
        { key: "perf", label: "Performance", status: "pass", detail: "Est. LCP 1.9s · no oversized images" },
        { key: "links", label: "Broken links", status: "pass", detail: "0 broken internal links" },
        { key: "fields", label: "Required fields", status: "pass", detail: "Favicon, OG image, canonical set" },
        { key: "security", label: "Security", status: "warn", detail: "SSL certificate pending on primary domain" },
        { key: "conversion", label: "Conversion", status: "warn", detail: "Homepage CTA click-through is below benchmark" },
        { key: "content", label: "Content", status: "pass", detail: "No stale or thin pages found" },
      ] },
      s2: { score: 61, updated_at: "2026-07-02T14:00:00Z", categories: [
        { key: "seo", label: "SEO", status: "fail", detail: "2 pages missing meta description" },
        { key: "schema", label: "Schema", status: "warn", detail: "No LocalBusiness schema on home" },
        { key: "a11y", label: "Accessibility", status: "warn", detail: "Low contrast on 1 button" },
        { key: "perf", label: "Performance", status: "pass", detail: "Est. LCP 2.1s" },
        { key: "links", label: "Broken links", status: "pass", detail: "0 broken internal links" },
        { key: "fields", label: "Required fields", status: "fail", detail: "No OG image · no favicon" },
        { key: "security", label: "Security", status: "fail", detail: "Site not yet published — HTTPS unverified" },
        { key: "conversion", label: "Conversion", status: "fail", detail: "No booking CTA on the homepage draft" },
        { key: "content", label: "Content", status: "warn", detail: "Only 2 pages drafted so far" },
      ] },
      s3: { score: 78, updated_at: "2026-06-28T09:00:00Z", categories: [
        { key: "seo", label: "SEO", status: "pass", detail: "Titles + descriptions present" },
        { key: "schema", label: "Schema", status: "pass", detail: "Service schema valid" },
        { key: "a11y", label: "Accessibility", status: "pass", detail: "No issues found" },
        { key: "perf", label: "Performance", status: "warn", detail: "1 hero image over 400KB" },
        { key: "links", label: "Broken links", status: "warn", detail: "1 external link 404s" },
        { key: "fields", label: "Required fields", status: "pass", detail: "All set" },
        { key: "security", label: "Security", status: "warn", detail: "SSL certificate pending on custom domain" },
        { key: "conversion", label: "Conversion", status: "pass", detail: "Booking CTA performing above benchmark" },
        { key: "content", label: "Content", status: "warn", detail: "Home page hasn't changed in 90+ days" },
      ] },
    };
    const leads = {
      s1: [
        { id: "ld1", type: "form", label: "Contact form", created_at: "2026-07-07T09:20:00Z" },
        { id: "ld2", type: "booking", label: "Discovery call", created_at: "2026-07-06T16:05:00Z" },
      ],
      s3: [
        { id: "ld3", type: "booking", label: "Coaching consult", created_at: "2026-07-07T11:00:00Z" },
      ],
    };
    const suggestions = {
      s1: [
        { id: "sg1", title: "Homepage CTA has a low click-through", detail: "Try a stronger, benefit-led headline above the fold." },
      ],
      s2: [
        { id: "sg2", title: "Brand colors drift on the Contact page", detail: "Contact page buttons don't match your Brand Kit primary color." },
        { id: "sg3", title: "Pricing page could convert better", detail: "Add a comparison table — sites with one see higher signup rates." },
      ],
    };
    // Team roster (v3 hero/portfolio slice 2) — used by the hero "Team Members" tile
    // and each card's avatar cluster / "last edited by" line. Mock-only; not persisted.
    const team = [
      { id: "tm1", name: "Aisha Rahman", role: "Owner", initials: "AR", color: "teal" },
      { id: "tm2", name: "Priya Nandi", role: "Designer", initials: "PN", color: "gold" },
      { id: "tm3", name: "Omar Faruk", role: "Developer", initials: "OF", color: "teal" },
      { id: "tm4", name: "Lena Osei", role: "SEO", initials: "LO", color: "gold" },
      { id: "tm5", name: "Marco Diaz", role: "Content writer", initials: "MD", color: "teal" },
      { id: "tm6", name: "Sara Islam", role: "Client", initials: "SI", color: "gold" },
    ];
    const teamBySite = { s1: ["tm1", "tm2", "tm3"], s2: ["tm2", "tm4", "tm6"], s3: ["tm1", "tm5"] };
    // Explicitly synthetic per-site business metrics (Details drawer only) — no real
    // computation behind these, unlike sessions_7d which is a real (mock) traffic number.
    const metricsBySite = {
      s1: { revenue: 18400, bounce_rate: 38, cwv: { lcp: 1.9, cls: 0.04, inp: 120 } },
      s2: { revenue: 0, bounce_rate: 61, cwv: { lcp: 2.6, cls: 0.11, inp: 210 } },
      s3: { revenue: 9200, bounce_rate: 47, cwv: { lcp: 2.1, cls: 0.06, inp: 150 } },
    };
    return { user: { id: "u1", email: "aisha@northstar.agency", name: "Aisha Rahman" }, workspace: { id: "ws", name: "Northstar Agency" }, role: "owner", sites, pages, domains, templates, versions, publishLog, analytics, profiles, health, leads, suggestions, team, teamBySite, metricsBySite };
  })();

  /* ── State ────────────────────────────────────────────────────────────────── */
  const state = {
    loaded: false, loading: false, error: null, previewState: "default",
    user: null, workspaceId: null, workspaceName: "", role: "staff",
    sites: [], pagesBySite: {}, domainsBySite: {}, templates: [],
    profilesBySite: {}, healthBySite: {},
    activity: [], sessions7: null, domainsActive: null, reviewBySite: {},
    leadsBySite: {}, suggestionsBySite: {}, dismissedSuggestions: {}, attnChip: "all",
    team: [], teamBySite: {}, metricsBySite: {},
    sitesToolbar: { chip: "all", q: "", niche: "", needsAttn: false, tag: "", sort: "name", view: "grid" },
    tab: "overview", editor: null,
    // Website Studio sidebar (IA restructure) — the "Website" row's expand state,
    // and the last site opened this session, used to resolve which site the
    // per-site Website submodules (Pages, Navigation, ...) should jump into.
    railWebsiteOpen: true, lastSiteId: null,
  };
  // Resolves "which site" for Website submodule items clicked from outside a site
  // detail view: last-opened site if it still exists, else the first site, else null.
  function activeSiteId() {
    const sites = state.sites || [];
    if (state.lastSiteId && sites.some((s) => s.id === state.lastSiteId)) return state.lastSiteId;
    return sites[0] ? sites[0].id : null;
  }
  const stp = (name) => !connected() && state.previewState === name;
  const canManage = () => ["manager", "admin", "owner"].includes(state.role);
  const canAdmin = () => ["admin", "owner"].includes(state.role);

  /* ── Boot ─────────────────────────────────────────────────────────────────── */
  async function boot() {
    if (connected()) {
      state.loading = true; state.error = null; render();
      try {
        const c = ensureClient();
        const { data: { user } } = await c.auth.getUser();
        state.user = user;
        if (!user) { state.loaded = true; state.loading = false; render(); return; }
        const { data: wsRows, error: wsErr } = await c.from("workspaces").select("id,name,status").order("created_at");
        if (wsErr) throw wsErr;
        const active = pickActive(wsRows || []);
        if (!active) { state.loaded = true; state.loading = false; render(); return; }
        state.workspaceId = active.id; state.workspaceName = active.name;
        const { data: mine } = await c.from("memberships").select("role").eq("workspace_id", active.id).eq("user_id", user.id).maybeSingle();
        state.role = mine?.role || "staff";
        const [{ data: sites }, { data: tpl }] = await Promise.all([
          c.from("sites").select("*, pages(count)").eq("workspace_id", active.id).order("created_at"),
          // Global gallery + this workspace's own saved templates (RLS scopes both).
          c.from("site_templates").select("id,name,niche,thumb_url,description,conversion_type,language,workspace_id")
            .or(`workspace_id.is.null,workspace_id.eq.${active.id}`).eq("is_active", true).order("name"),
        ]);
        state.sites = (sites || []).map((s) => ({ ...s, pages: s.pages?.[0]?.count ?? 0 }));
        state.templates = tpl || [];
        // v2 surfacing enrichment (best-effort — a v1 database without 0028 still renders)
        try {
          const since = new Date(Date.now() - 7 * 864e5).toISOString();
          const [{ data: act }, { data: sess }, { count: domN }] = await Promise.all([
            c.from("site_publish_log").select("site_id,kind,status,detail,created_at").eq("workspace_id", active.id).order("created_at", { ascending: false }).limit(50),
            c.from("visitor_sessions").select("site_id,last_seen_at").eq("workspace_id", active.id).gte("last_seen_at", since).limit(2000),
            c.from("site_domains").select("id", { count: "exact", head: true }).eq("workspace_id", active.id).eq("status", "active"),
          ]);
          state.activity = act || [];
          state.sessions7 = (sess || []).length;
          state.domainsActive = domN ?? 0;
          const bySite = {};
          (sess || []).forEach((r) => { const day = Math.min(6, Math.max(0, 6 - Math.floor((Date.now() - new Date(r.last_seen_at).getTime()) / 864e5))); (bySite[r.site_id] = bySite[r.site_id] || Array(7).fill(0))[day]++; });
          const lastPub = {};
          (act || []).forEach((l) => { if (l.kind === "page.publish" && !lastPub[l.site_id]) lastPub[l.site_id] = l; });
          state.sites = state.sites.map((s) => ({ ...s,
            sessions_7d: (bySite[s.id] || []).reduce((a, b) => a + b, 0),
            traffic: bySite[s.id] || [],
            last_published: lastPub[s.id]?.created_at || (s.status === "published" ? s.published_at || s.updated_at : null),
            last_version: lastPub[s.id]?.detail?.version_no || null }));
        } catch (e) { /* enrichment is optional */ }
      } catch (e) { state.error = e.message || String(e); }
      state.loading = false; state.loaded = true;
    } else {
      state.user = MOCK.user; state.workspaceId = MOCK.workspace.id; state.workspaceName = MOCK.workspace.name; state.role = MOCK.role;
      state.sites = MOCK.sites; state.pagesBySite = MOCK.pages; state.domainsBySite = MOCK.domains; state.templates = MOCK.templates;
      state.profilesBySite = MOCK.profiles; state.healthBySite = MOCK.health;
      state.leadsBySite = MOCK.leads; state.suggestionsBySite = MOCK.suggestions;
      state.team = MOCK.team; state.teamBySite = MOCK.teamBySite; state.metricsBySite = MOCK.metricsBySite;
      state.loaded = true; state.loading = false;
    }
    render();
  }
  function pickActive(list) { const usable = (list || []).filter((w) => w.status !== "archived"); if (!usable.length) return list[0] || null; let id; try { id = localStorage.getItem(ACTIVE_KEY); } catch (e) {} return usable.find((w) => w.id === id) || usable[0]; }

  async function loadSite(id) {
    if (!connected()) return { site: state.sites.find((s) => s.id === id), pages: state.pagesBySite[id] || [], domains: state.domainsBySite[id] || [], sessions: null, publishLog: MOCK.publishLog, profile: (state.profilesBySite || {})[id] || null, health: (state.healthBySite || {})[id] || null };
    const c = ensureClient();
    const [{ data: site }, { data: pages }, { data: domains }, { data: sessions }, { data: publishLog }] = await Promise.all([
      c.from("sites").select("*").eq("id", id).maybeSingle(),
      c.from("pages").select("*").eq("site_id", id).order("sort"),
      c.from("site_domains").select("*").eq("site_id", id).order("created_at"),
      c.from("visitor_sessions").select("pages, contact_id").eq("site_id", id).order("last_seen_at", { ascending: false }).limit(500),
      c.from("site_publish_log").select("*").eq("site_id", id).order("created_at", { ascending: false }).limit(20),
    ]);
    // v3 surfaces (D-153 profile, D-155 health) — best-effort so a pre-v3 database
    // without these tables still renders the whole detail screen.
    let profile = null, health = null;
    try {
      const [{ data: pr }, { data: hz }] = await Promise.all([
        c.from("site_business_profiles").select("*").eq("site_id", id).maybeSingle(),
        c.from("site_health_reports").select("*").eq("site_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      profile = pr || null; health = hz || null;
    } catch (e) { /* v3 tables not migrated yet — degrade gracefully */ }
    return { site, pages: pages || [], domains: domains || [], sessions: sessions || [], publishLog: publishLog || [], profile, health };
  }

  /* ── Shell ────────────────────────────────────────────────────────────────── */
  // Workspace sidebar — slim, portfolio-level. Per-site tools (pages, SEO, domains,
  // publish, versions…) live in the contextual site rail (siteRail), not here.
  const NAV = [
    ["Overview", [["dashboard", "Dashboard", "grid"]]],
    ["Create", [["sites", "Websites", "globe"], ["templates", "Templates", "layers"]]],
    ["Library", [["assets", "Assets", "image"]]],
    ["Grow", [["analytics", "Analytics", "chart"]]],
    ["Configure", [["settings", "Settings", "gear"]]],
  ];
  // Per-site workspace nav — swaps into the rail when you're inside a site.
  const SITE_NAV = [
    ["Site", [["overview", "Overview", "grid"], ["pages", "Pages", "doc"], ["__editor", "Editor", "edit"]]],
    ["Design", [["profile", "Brand & profile", "palette"], ["nav", "Navigation", "rows"]]],
    ["Optimize", [["seo", "SEO & schema", "search"], ["health", "Site Health", "gauge"], ["domains", "Domains", "link"]]],
    ["Grow", [["analytics", "Analytics", "chart"], ["publish", "Publish", "rocket"], ["integrations", "Integrations", "puzzle"]]],
    ["Configure", [["settings", "Settings", "gear"]]],
  ];
  const ROUTE_LABELS = { dashboard: "Command center", sites: "Websites", templates: "Template library", pages: "Pages", components: "Components", sections: "Sections", assets: "Assets", forms: "Forms", blog: "Blog", seo: "SEO", domains: "Domains", publish: "Publish", analytics: "Analytics", settings: "Settings" };
  function railNav(active) {
    return NAV.map(([label, items]) => `<div class="nav-group"><div class="nav-group-label">${label}</div>${items.map(([k, l, ic]) =>
      `<div class="nav-item ${k === active ? "active" : ""}" data-nav="${k}"><span class="ni-ico">${svg(ic)}</span><span>${l}</span>${k === "dashboard" && (state.sites || []).some((s) => s.status === "published") ? `<span class="ni-dot" title="Live sites"></span>` : ""}</div>`).join("")}</div>`).join("");
  }
  // Contextual per-site rail — back link + site identity + the SITE_NAV groups.
  function siteRail(site, tab) {
    const dom = site.primary_domain || ((site.subdomain || "site") + ".aimindshare.site");
    const groups = SITE_NAV.map(([label, items]) => `<div class="nav-group"><div class="nav-group-label">${label}</div>${items.map(([k, l, ic]) =>
      k === "__editor"
        ? `<div class="nav-item" data-openeditor="${esc(site.id)}"><span class="ni-ico">${svg(ic)}</span><span>${l}</span><span class="ni-tag">open</span></div>`
        : `<div class="nav-item ${k === tab ? "active" : ""}" data-tab="${k}"><span class="ni-ico">${svg(ic)}</span><span>${l}</span></div>`).join("")}</div>`).join("");
    return `
      <button class="rail-back" id="backSites">${svg("back", 14)} All websites</button>
      <div class="rail-site"><span class="rs-favi ${site.style_preset ? "sc-favi-" + esc(site.style_preset) : ""}">${esc(initials(site.name))}</span>
        <span class="rs-id"><b>${esc(site.name)}</b><span class="rs-dom">${esc(dom)}</span></span></div>
      ${groups}`;
  }
  function shell(content, opts) {
    opts = opts || {};
    if (opts.bare) return `<main class="content editor-full"><div class="content-inner editor-inner">${content}</div></main>`;
    const site = opts.siteCtx && opts.siteCtx.site;
    const active = opts.active || "dashboard";
    const railBody = site ? siteRail(site, opts.siteCtx.tab)
      : `<div class="rail-mod"><span class="rm-ico">${svg("globe", 15)}</span><span class="rm-t"><b>Website Studio</b><span>Module · M19</span></span></div>${railNav(active)}`;
    const tbLabel = site ? "Website workspace" : (ROUTE_LABELS[active] || "");
    return `
      <aside class="rail ${site ? "rail-in-site" : ""}" id="rail">
        <div class="brand"><span class="mark">✦</span><span><b>AiMind</b><em>Share</em></span></div>
        ${railBody}
        <div class="rail-foot">M19 · Sites · v3</div>
      </aside>
      <header class="tbar">
        <button class="icon-btn rail-burger" id="railBurger" aria-label="Menu">☰</button>
        <div class="tb-title"><b>AI Website Studio</b><span>${tbLabel}</span></div>
        <div class="ws-trigger" style="cursor:default">
          <span class="ws-badge">${esc(initials(state.workspaceName || "AiMindShare"))}</span>
          <span class="ws-meta"><span class="ws-name">${esc(state.workspaceName || "Workspace")}</span><span class="ws-kind">Workspace</span></span>
        </div>
        <div class="tb-search" id="tbSearch"><span>${svg("search", 15)}</span><span class="tbs-label">Search sites, pages, templates…</span><span class="kbd">⌘K</span></div>
        <div class="spacer"></div>
        <div class="tb-quick">
          <button class="icon-btn" id="tqTemplates" title="Browse templates">${svg("layers", 16)}</button>
          <button class="icon-btn" id="tqNew" title="New website">${svg("plus", 16)}</button>
        </div>
        <span class="pill info tb-credits" title="Shared AI credits">${svg("spark", 11)} 2,450</span>
        <button class="icon-btn tb-bell" id="tbBell" title="Notifications">${svg("bell", 16)}<span class="bell-dot"></span></button>
        <button class="icon-btn" id="themeToggle" title="Toggle theme" aria-label="Toggle theme"><span id="themeIco">☾</span></button>
        <button class="btn btn-ghost btn-sm" id="openConnect2">${connected() ? "Reconnect" : "Connect"}</button>
        <button class="btn btn-primary btn-sm tb-cta" id="tbGenerate">${svg("spark", 14)} Create with AI</button>
        <span class="avatar" title="${esc(state.user?.email || "")}">${esc(initials(state.user?.name || state.user?.email))}</span>
      </header>
      <main class="content"><div class="content-inner">${content}</div></main>`;
  }
  function previewStrip() {
    return "";
  }
  function pageHead(title, sub, extra = "") {
    return `<div class="page-head reveal"><span class="eyebrow">Module · M19</span>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap">
        <div><h1 style="margin-top:12px">${title}</h1><p class="sub">${sub}</p></div>${extra}</div></div>`;
  }
  const statusPill = (s) => `<span class="pill ${s === "published" ? "success" : s === "archived" ? "idle" : "plain"}">${s}</span>`;
  const healthTier = (n) => n == null ? "na" : n >= 85 ? "good" : n >= 65 ? "warn" : "bad";
  function healthRing(n, size = 40) {
    const tier = healthTier(n), pct = n == null ? 0 : Math.max(0, Math.min(100, n));
    const r = (size - 6) / 2, circ = 2 * Math.PI * r;
    return `<span class="health-ring hr-${tier}" title="Site health ${n == null ? "—" : n + "/100"}" style="width:${size}px;height:${size}px;--hr:${size}px">
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="3"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"
          stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${(circ * (1 - pct / 100)).toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
      </svg><b class="hr-num">${n == null ? "—" : n}</b></span>`;
  }
  function skeleton(n = 3) { return `<div class="page-head"><div class="skeleton" style="width:280px;height:44px;border-radius:12px"></div></div><div class="site-grid">${Array(n).fill('<div class="skeleton" style="height:196px;border-radius:24px"></div>').join("")}</div>`; }
  function errorBlock(msg) { return `<div class="panel" style="border-color:rgba(196,97,78,.4)"><div class="empty-state"><div class="es-ico" style="background:rgba(196,97,78,.12);color:var(--status-danger)">⚠</div><h3>Something went wrong</h3><p>${esc(msg || "We couldn't load your sites.")}</p><button class="btn btn-ghost es-cta" id="retryBtn">Retry</button></div></div>`; }

  /* ── Screen: sites list — the "AI website platform" front door ────────────── */
  const NICHE_OPTS = [["agency", "Agency / services"], ["saas", "SaaS / product"], ["local", "Local business"], ["coach", "Coach / creator"], ["ecom", "E-commerce"], ["dentist", "Dental practice"], ["realestate", "Real estate"], ["restaurant", "Restaurant / cafe"]];

  function siteCard(s, attn) {
    const domain = s.primary_domain || (s.subdomain + ".aimindshare.site");
    const staging = `https://${s.subdomain || "site"}.aimindshare.site/?pt=${s.preview_token || ""}`;
    const share = `https://${esc(domain)}`;
    const spark = (s.traffic && s.traffic.length)
      ? `<span class="spark" title="Last 7 days">${s.traffic.map((v) => `<i style="height:${Math.max(12, Math.round(v / Math.max(...s.traffic) * 100))}%"></i>`).join("")}</span>`
      : `<span class="spark spark-empty">no traffic yet</span>`;
    // Team assigned to this site — avatar cluster + "last edited by" convention
    // (the first assigned member stands in for "last touched by").
    const teamIds = (state.teamBySite || {})[s.id] || [];
    const teamMembers = teamIds.map((id) => (state.team || []).find((t) => t.id === id)).filter(Boolean);
    const lastEditor = teamMembers[0] ? teamMembers[0].name : null;
    const pubMeta = (s.last_published
      ? `${s.last_version ? "v" + s.last_version + " · " : ""}published ${fmtDate(s.last_published)}`
      : `never published`) + (lastEditor ? ` · edited by ${esc(lastEditor)}` : "");
    // Domain-status chip (custom + live, or staging-only).
    const domChip = s.primary_domain
      ? `<span class="pill success" title="Custom domain connected">${svg("link", 11)} ${esc(s.primary_domain)}</span>`
      : `<span class="pill plain" title="Always-on staging subdomain">staging only</span>`;
    // Health-dimension dots from the site's quality report (SEO / schema / accessibility / perf).
    const h = (state.healthBySite || {})[s.id];
    const dot = (key, label) => { const c = h && (h.categories || []).find((x) => x.key === key); const st = c ? c.status : "na";
      return `<span class="hd hd-${st}" title="${label}: ${c ? esc(c.detail) : "—"}"></span>`; };
    const dots = h ? `<span class="sc-dots" title="Content health">${dot("seo", "SEO")}${dot("schema", "Schema")}${dot("a11y", "Accessibility")}${dot("perf", "Performance")}</span>` : "";
    // Client / category identity row — client_name falls back to the site name.
    const clientName = s.client_name || s.name;
    const nicheOpt = NICHE_OPTS.find(([v]) => v === s.niche);
    // Card-local status pill: Archived / Review override the base status pill for
    // display purposes only — s.status itself is never mutated here.
    const isReview = (state.reviewBySite || {})[s.id] === "review";
    const cardStatus = s.archived ? `<span class="pill idle">Archived</span>` : isReview ? `<span class="pill warning">Review</span>` : statusPill(s.status);
    // Team avatar cluster — up to 3 stacked initials + "+N" overflow.
    const teamCluster = teamMembers.length ? `<span class="sc-team" title="${esc(teamMembers.map((t) => t.name + " · " + t.role).join(", "))}">${
      teamMembers.slice(0, 3).map((t) => `<span class="team-av ${t.color === "gold" ? "ta-gold" : ""}">${esc(t.initials)}</span>`).join("")
    }${teamMembers.length > 3 ? `<span class="team-av ta-more">+${teamMembers.length - 3}</span>` : ""}</span>` : "";
    // One inline AI-insight line — the single top-ranked attentionItems() result for
    // just this site (same engine the Dashboard panel and the attention strip use).
    const insight = attentionItems([s])[0];
    // Favorites + tags — both local-only (Task 13), no schema change.
    const isFav = favSites().includes(s.id);
    const tags = siteTagsFor(s.id);
    const tagsRow = `<div class="sc-tags">${tags.map((t) => `<span class="tag-chip">${esc(t)}</span>`).join("")}<button class="tag-add" data-tagedit="${esc(s.id)}">${svg("plus", 10)} Tag</button></div>`;
    return `
      <div class="site-card sc-rich reveal" data-site="${esc(s.id)}" data-status="${esc(s.status)}" data-attn="${attn ? 1 : 0}" data-name="${esc(s.name.toLowerCase())}" data-niche="${esc(s.niche || "")}" data-archived="${s.archived ? 1 : 0}" data-fav="${isFav ? 1 : 0}" data-tags="${esc(tags.join(",").toLowerCase())}">
        <input type="checkbox" class="sc-bulk-check" data-bulk="${esc(s.id)}" title="Select for bulk actions">
        <div class="sc-top">
          <span class="sc-favi ${s.style_preset ? "sc-favi-" + esc(s.style_preset) : ""}">${esc(initials(s.name))}</span>
          <div class="sc-id"><h3>${esc(s.name)}</h3>
            <button class="sc-domain" data-copy="${esc(domain)}">${svg("globe", 13)} ${esc(domain)} ${svg("copy", 12)}</button>
          </div>
          <button class="icon-btn sm sc-fav ${isFav ? "on" : ""}" data-favsite="${esc(s.id)}" title="Favorite">${svg("star", 14)}</button>
          <button class="sc-health" data-gohealth="${esc(s.id)}" title="Site health — SEO, schema, accessibility, performance">${healthRing(s.health_score)}</button>
        </div>
        <div class="sc-client">
          <span class="sc-client-name">${esc(clientName)}</span>
          ${nicheOpt ? `<span class="pill plain sc-niche">${esc(nicheOpt[1])}</span>` : ""}
        </div>
        <div class="sc-meta">
          ${cardStatus}
          ${s.maintenance_mode ? `<span class="pill warning">maintenance</span>` : ""}
          ${domChip}
          <span class="pill plain">${s.pages} ${s.pages === 1 ? "page" : "pages"}</span>
          ${s.language && s.language !== "en" ? `<span class="pill plain">${esc(s.language)}</span>` : ""}
          ${dots}
        </div>
        ${insight ? `<div class="sc-insight"><span class="si-ico">${svg(insight.ico, 13)}</span><span>${esc(insight.title)}</span></div>` : ""}
        ${tagsRow}
        <div class="sc-stats">
          <span class="sc-stat"><span class="cs-num">${pubMeta}</span><span class="cs-lab">Publish history</span></span>
          <span class="sc-stat sc-stat-spark">${spark}<span class="cs-lab">${s.sessions_7d != null ? s.sessions_7d + " sessions · 7d" : "Traffic"}</span></span>
        </div>
        <div class="sc-foot">
          <span class="sc-quick">
            ${teamCluster}
            <button class="icon-btn sm" data-copy="${esc(staging)}" title="Copy staging preview link (drafts + maintenance bypass)">${svg("eye", 14)}</button>
            <button class="icon-btn sm" data-publish="${esc(s.id)}" title="Publish — runs the pre-flight quality gate">${svg("rocket", 14)}</button>
            <button class="icon-btn sm" data-more="${esc(s.id)}" data-share="${share}" title="More actions">⋯</button>
          </span>
          <span style="display:flex;gap:8px">
            <button class="btn btn-ghost btn-sm" data-open="${esc(s.id)}">Manage</button>
            <button class="btn btn-primary btn-sm" data-editsite="${esc(s.id)}">${svg("edit", 13)} Edit</button>
          </span>
        </div>
      </div>`;
  }

  function activityPanel() {
    const rows = (state.activity && state.activity.length ? state.activity : (!connected() ? MOCK.publishLog : []))
      .slice(0, 8).map((l) => `<div class="log-row">
        <span class="pill ${l.status === "ok" ? "success" : "danger"}">${esc(l.status)}</span>
        <b class="mono">${esc(l.kind)}</b>
        <span class="muted">${esc(l.detail?.slug ? "/" + l.detail.slug : l.detail?.domain || "")}${l.detail?.version_no ? " · v" + l.detail.version_no : ""}${l.detail?.result === "dns_not_found" ? " · DNS not found" : ""}</span>
        <span class="pr-when">${fmtDate(l.created_at)}</span></div>`).join("");
    return `<div class="panel reveal"><div class="panel-head"><h3>Publish & domain activity</h3>
        <span class="muted" style="font-size:13px">Every publish, save point, revert and domain check is logged.</span></div>
      <div class="log-list">${rows || `<div class="empty-inline">No activity yet — publish a page and it lands here.</div>`}</div></div>`;
  }

  // Six metric tiles under the hero — every number is computed from state that
  // already exists (nothing new stored), reusing the same kpiCard() the Dashboard uses.
  function heroMetrics() {
    const sites = state.sites || [];
    const pub = sites.filter((s) => s.status === "published").length;
    const draft = sites.filter((s) => s.status === "draft").length;
    const scores = Object.values(state.healthBySite || {}).map((h) => h.score).filter((n) => n != null);
    const avgHealth = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const cutoff = Date.now() - 7 * 864e5;
    const leads7 = Object.values(state.leadsBySite || {}).reduce((n, list) => n + (list || []).filter((l) => new Date(l.created_at).getTime() >= cutoff).length, 0);
    return `<div class="st-kpis reveal">
      ${kpiCard("globe", sites.length, "", "Websites", null, "flat", false)}
      ${kpiCard("rocket", pub, "", "Published", null, "flat", false, true)}
      ${kpiCard("doc", draft, "", "Drafts", null, "flat", false)}
      ${kpiCard("gauge", avgHealth != null ? avgHealth : "—", "", "Avg Health", null, "flat", false)}
      ${kpiCard("chart", leads7, "", "Leads · 7d", null, "flat", false)}
      ${kpiCard("users", (state.team || []).length, "", "Team Members", null, "flat", false, true)}
    </div>`;
  }
  // Hero — the page's one big headline + AI composer. It never generates a site
  // directly: it only opens/prefills the same openCreateModal() every other
  // creation entry point uses, so there is exactly one generation path.
  function sitesHero() {
    return `<div class="st-hero reveal">
      <div class="st-hero-in">
        <span class="st-eyebrow">${svg("spark", 12)} AI-powered website builder</span>
        <h1>Build websites <em>with AI</em></h1>
        <p class="st-lead">Describe the business in one paragraph and AI drafts a complete, on-brand website — pages, copy, SEO and schema included. Refine it in the visual editor before you publish.</p>
        ${composerHtml("hero")}
        <button class="st-link" id="heroBlank" style="margin-top:14px">${svg("doc", 13)} Prefer a blank canvas? Start a new site</button>
      </div>
    </div>`;
  }
  // Six quick-create cards — second doors into the same openCreateModal(). "Continue
  // Recent" is omitted entirely when there are no sites yet (nothing to continue).
  function sitesQuickCreate(sites) {
    const recent = sites.length ? sites.reduce((a, b) => new Date(b.updated_at) > new Date(a.updated_at) ? b : a) : null;
    const cards = [
      ["ai", "spark", "Create with AI", "Describe your business — AI builds the whole site.", "qa-ai"],
      ["blank", "doc", "Start from Blank", "An empty canvas — add sections yourself.", ""],
      ["templates", "layers", "Browse Templates", "60+ professional starter layouts.", ""],
      ["import", "download", "Import a Website", "Paste existing HTML into an editable page.", ""],
      ["clone", "copy", "Clone a Website", "Mirror a URL's structure and palette.", ""],
    ];
    if (recent) cards.push(["recent", "clock", "Continue Recent", `Pick up where you left off on ${esc(recent.name)}.`, ""]);
    return `<div class="st-quick reveal">${cards.map(([act, ico, label, desc, cls]) =>
      `<button class="qa-card ${cls}" data-qcard="${act}"${act === "recent" ? ` data-recent-id="${esc(recent.id)}"` : ""}><span class="qa-ico">${svg(ico, 18)}</span><b>${label}</b><span>${desc}</span></button>`).join("")}</div>`;
  }
  // Websites — the visual card portfolio (browse + open + operate). Operational
  // health/attention lives on the Dashboard; creation lives in the create modal.
  function sitesHead(sites) {
    return `<div class="dash-head reveal">
      <div class="dh-l"><span class="st-eyebrow">${svg("globe", 12)} Websites</span>
        <h2>Your <em>portfolio</em></h2>
        <p class="dh-lead">Every website in this workspace${sites.length ? ` — ${sites.length} site${sites.length === 1 ? "" : "s"}` : ""}.</p></div>
      <div class="dh-actions"><button class="btn btn-primary" id="newSite">${svg("plus", 14)} New site</button></div>
    </div>`;
  }
  // Compact, page-level attention summary — same attentionItems() ranking the
  // Dashboard's full panel uses; this is a summary view onto it, not a second
  // control center, so it only ever shows the top 2-3 and links out to `#/dashboard`.
  function sitesAttentionStrip(sites) {
    const items = attentionItems(sites);
    if (!items.length) return "";
    const siteCount = new Set(items.filter((a) => a.site).map((a) => a.site.id)).size;
    const top = items.slice(0, 3).map((a) => esc(a.title));
    return `<div class="attn-strip reveal">
      <span class="as-ico">${svg("bell", 14)}</span>
      <span class="as-text">${siteCount} site${siteCount === 1 ? "" : "s"} need attention — ${top.join(", ")}${items.length > 3 ? "…" : ""}</span>
      <button class="st-link" data-nav-to="dashboard" style="margin-left:auto">View all ${svg("chev", 12)}</button>
    </div>`;
  }
  // Sort — pure function over a list, driven by state.sitesToolbar.sort. A full
  // render() is what actually invokes this (see viewSites()), since reordering the
  // DOM in place isn't worth the complexity for a mockup-scale site list.
  function sortSites(list) {
    const sort = state.sitesToolbar.sort;
    const arr = list.slice();
    if (sort === "updated") arr.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    else if (sort === "health") arr.sort((a, b) => (b.health_score || 0) - (a.health_score || 0));
    else if (sort === "traffic") arr.sort((a, b) => (b.sessions_7d || 0) - (a.sessions_7d || 0));
    else arr.sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }
  function viewSites() {
    if (stp("loading") || (state.loading && !state.loaded)) return previewStrip() + skeleton();
    if (stp("error") || state.error) return previewStrip() + pageHead("Websites", "AI-built websites, published to the web.") + errorBlock(state.error);
    const sites = stp("empty") ? [] : state.sites;
    const items = attentionItems(sites);
    const attnIds = new Set(items.filter((a) => a.sev !== "opp").map((a) => a.site && a.site.id).filter(Boolean));
    const tb = state.sitesToolbar;
    // "All" excludes archived sites (spec §2) — Archived is its own chip. Review is
    // computable today from state.reviewBySite, just not surfaced as a chip until now.
    const nonArchived = sites.filter((s) => !s.archived);
    const liveCount = nonArchived.filter((s) => s.status === "published").length;
    const draftCount = nonArchived.filter((s) => s.status === "draft").length;
    const reviewCount = nonArchived.filter((s) => (state.reviewBySite || {})[s.id] === "review").length;
    const archivedCount = sites.filter((s) => s.archived).length;
    const attnCount = nonArchived.filter((s) => attnIds.has(s.id)).length;
    const chipsHtml = [["all", "All", nonArchived.length], ["published", "Live", liveCount], ["draft", "Drafts", draftCount], ["review", "Review", reviewCount], ["attn", "Needs action", attnCount], ["archived", "Archived", archivedCount]]
      .map(([k, l, n]) => `<button class="dt-chip ${k === tb.chip ? "on" : ""}" data-schip="${k}">${l} <span class="dc-n">${n}</span></button>`).join("");
    // Filters popover (category / needs-attention / tag) decides which sites are
    // eligible at all; the status chip + search box then hide/show within that set.
    const eligible = sites.filter((s) => {
      if (tb.niche && s.niche !== tb.niche) return false;
      if (tb.needsAttn && !attnIds.has(s.id)) return false;
      if (tb.tag && !siteTagsFor(s.id).some((t) => t.toLowerCase().includes(tb.tag.toLowerCase()))) return false;
      return true;
    });
    const sorted = sortSites(eligible);
    // Grid defaults to 2 columns (richer cards need the width); List reuses the
    // existing Dashboard row renderer (dtRow) at lower fidelity — no new component.
    const gridBody = tb.view === "list"
      ? `<div class="dt" id="sitesListWrap"><div class="dt-inner">
          <div class="dt-row dt-head"><span>Site</span><span>Status</span><span class="dt-c">Pages</span><span>Domain</span><span class="dt-c">Health</span><span>Last publish</span><span>Updated</span><span class="dt-r">Actions</span></div>
          ${sorted.map((s) => dtRow(s, attnIds.has(s.id))).join("")}
        </div></div>`
      : `<div class="site-grid sg-2col" id="sitesGrid">${sorted.map((s) => siteCard(s, attnIds.has(s.id))).join("")}</div>`;
    return previewStrip() + `<div class="studio">
      ${sitesHero()}
      ${sitesQuickCreate(sites)}
      ${heroMetrics()}
      ${sitesAttentionStrip(nonArchived)}
      ${sitesHead(sites)}
      <section class="st-sec reveal">
        <div class="dt-toolbar">
          <label class="dt-search">${svg("search", 15)}<input id="sitesSearch" placeholder="Filter websites by name…" autocomplete="off" value="${esc(tb.q)}"></label>
          <div class="dt-chips">${chipsHtml}</div>
          <button class="btn btn-ghost btn-sm" id="sitesFilterBtn">${svg("filter", 13)} Filters</button>
          <select class="gen-select" id="sitesSort" title="Sort">
            <option value="name" ${tb.sort === "name" ? "selected" : ""}>Name</option>
            <option value="updated" ${tb.sort === "updated" ? "selected" : ""}>Last edited</option>
            <option value="health" ${tb.sort === "health" ? "selected" : ""}>Health score</option>
            <option value="traffic" ${tb.sort === "traffic" ? "selected" : ""}>Traffic</option>
          </select>
          <span class="seg-toggle">
            <button class="icon-btn sm ${tb.view === "grid" ? "on" : ""}" data-view="grid" title="Grid view">${svg("grid", 14)}</button>
            <button class="icon-btn sm ${tb.view === "list" ? "on" : ""}" data-view="list" title="List view">${svg("rows", 14)}</button>
          </span>
          <button class="btn btn-ghost btn-sm" id="sitesSavedViewsBtn">${svg("star", 13)} Saved views</button>
        </div>
        ${gridBody}
        <div class="empty-inline" id="sitesEmpty" style="${sorted.length ? "display:none" : ""}">${sites.length ? "No websites match this filter." : "No websites yet — create your first one above."}</div>
      </section>
      <div class="bulk-bar" id="bulkBar" style="display:none">
        <span class="bulk-count" id="bulkCount">0 selected</span>
        <button class="btn btn-ghost btn-sm" data-bulk-act="publish">${svg("rocket", 13)} Publish selected</button>
        <button class="btn btn-ghost btn-sm" data-bulk-act="archive">${svg("doc", 13)} Archive selected</button>
        <button class="btn btn-ghost btn-sm" data-bulk-act="tag">${svg("layers", 13)} Tag selected</button>
        <button class="icon-btn sm" id="bulkClear" title="Clear selection">${svg("x", 13)}</button>
      </div>
    </div>`;
  }

  /* ── Screen: site detail ──────────────────────────────────────────────────── */
  let detailCache = null;
  // Tracks which top-level rail section was active on the PREVIOUS render, so the
  // "Website" submenu auto-opens only when navigation transitions INTO its scope
  // (not on every in-place re-render while already inside it, which would fight a
  // manual collapse). See WEBSITE_PAGE_KEYS + the render() edit in Task 1 Step 3.
  let lastRailSection = null;
  const WEBSITE_PAGE_KEYS = new Set(["structure", "components", "sections", "content", "assets", "forms", "blog", "preview"]);
  async function viewSiteDetail(id) {
    if (!detailCache || detailCache.site?.id !== id) {
      const box = $("#app .content-inner"); if (box && !detailCache) box.innerHTML = previewStrip() + skeleton(1);
      detailCache = await loadSite(id);
    }
    const { site, pages, domains, sessions, publishLog, profile, health } = detailCache;
    if (!site) return previewStrip() + pageHead("Site", "") + errorBlock("Site not found.");
    const KNOWN = ["overview", "pages", "profile", "nav", "domains", "seo", "health", "analytics", "publish", "integrations", "settings"];
    const tab = KNOWN.includes(state.tab) ? state.tab : "overview";
    const openBtn = `<button class="btn btn-primary btn-sm" data-openeditor="${esc(site.id)}">${svg("edit", 13)} Open editor</button>`;
    const head = pageHead(esc(site.name), `${statusPill(site.status)} <span class="mono" style="margin-left:8px">${esc(site.primary_domain || site.subdomain + ".aimindshare.site")}</span>`, openBtn);
    let body;
    switch (tab) {
      case "pages": body = tabPages(site, pages); break;
      case "profile": body = tabBusinessProfile(site, profile); break;
      case "nav": body = tabNav(site, pages); break;
      case "domains": body = tabDomains(site, domains); break;
      case "seo": body = tabSeo(site); break;
      case "health": body = tabHealth(site, health); break;
      case "analytics": body = tabAnalytics(site, sessions, publishLog); break;
      case "publish": body = tabPublish(site, publishLog, health); break;
      case "integrations": body = tabIntegrations(site); break;
      case "settings": body = tabSettings(site); break;
      default: body = tabOverview(site, pages, health);
    }
    return previewStrip() + head + body;
  }
  // ── New per-site views (Overview · Publish · Integrations) ─────────────────
  function tabOverview(site, pages, health) {
    const items = attentionItems(state.sites || []).filter((a) => a.site && a.site.id === site.id);
    const dom = site.primary_domain || ((site.subdomain || "site") + ".aimindshare.site");
    const stat = (ico, label, val) => `<div class="ov-stat"><span class="ovs-ico">${svg(ico, 15)}</span><div class="ovs-t"><b>${esc(String(val))}</b><span>${label}</span></div></div>`;
    const attn = items.length
      ? items.slice(0, 5).map((a) => `<div class="attn-item ai-${a.sev}"><span class="ai-ico">${svg(a.ico, 15)}</span><div class="ai-main"><b>${esc(a.title)}</b><span>${esc(a.detail)}</span></div><button class="btn btn-ghost btn-sm ai-act" ${actAttr(a)}>${esc(a.actLabel)} ${svg("chev", 12)}</button></div>`).join("")
      : `<div class="attn-clear"><span class="ac-ico">${svg("check", 18)}</span><div><b>All clear</b><span>No issues need attention on this site.</span></div></div>`;
    const quick = [
      ["edit", "Open editor", "Design & content", `data-openeditor="${esc(site.id)}"`],
      ["doc", "Manage pages", `${site.pages} page${site.pages === 1 ? "" : "s"}`, `data-tab="pages"`],
      ["search", "SEO & schema", "Titles, meta, JSON-LD", `data-tab="seo"`],
      ["rocket", "Publish", site.last_published ? "Last " + fmtDate(site.last_published) : "Not published yet", `data-tab="publish"`],
    ].map(([ico, t, s, attr]) => `<button class="qa-line" ${attr}><span class="ql-ico">${svg(ico, 15)}</span><span class="ql-t"><b>${t}</b><span>${s}</span></span>${svg("chev", 13)}</button>`).join("");
    return `<div class="studio">
      <section class="st-sec reveal"><div class="panel ov-summary">
        <div class="ovs-hero"><span class="sc-favi lg ${site.style_preset ? "sc-favi-" + esc(site.style_preset) : ""}">${esc(initials(site.name))}</span>
          <div class="ovs-idt"><h2>${esc(site.name)}</h2><button class="sc-domain" data-copy="${esc(dom)}">${svg("globe", 13)} ${esc(dom)} ${svg("copy", 12)}</button></div>
          <span class="ovs-ring">${healthRing(site.health_score, 54)}</span></div>
        <div class="ov-stats">
          ${stat("rocket", "Status", site.status)}
          ${stat("doc", "Pages", site.pages)}
          ${stat("link", "Domain", site.primary_domain ? "custom" : "staging")}
          ${stat("clock", "Last publish", site.last_published ? fmtDate(site.last_published) : "Never")}
          ${stat("chart", "Sessions · 7d", site.sessions_7d != null ? site.sessions_7d : "—")}
        </div>
      </div></section>
      <section class="st-cols reveal">
        <div class="panel attn"><div class="panel-head"><span class="ph-ico ph-alert">${svg("bell", 15)}</span><h3>Attention</h3>${items.length ? `<span class="attn-count">${items.length}</span>` : ""}</div><div class="attn-list">${attn}</div></div>
        <div class="panel"><div class="panel-head"><span class="ph-ico">${svg("zap", 15)}</span><h3>Quick actions</h3></div><div class="qa-lines">${quick}</div></div>
      </section>
    </div>`;
  }
  function tabPublish(site, publishLog, health) {
    const cats = (health && health.categories) || [];
    const fails = cats.filter((c) => c.status === "fail").length;
    const check = cats.length
      ? cats.map((c) => `<div class="pf-row"><span class="pf-ico pf-${c.status}">${svg(c.status === "pass" ? "check" : c.status === "fail" ? "x" : "gauge", 12)}</span><div class="pf-main"><b>${esc(c.label)}</b><span>${esc(c.detail)}</span></div><span class="pill ${c.status === "pass" ? "success" : c.status === "fail" ? "danger" : "warning"}">${c.status}</span></div>`).join("")
      : `<div class="empty-inline">Publish once to generate the quality report.</div>`;
    const vsrc = !connected() ? MOCK.versions : [];
    const latest = vsrc[0];
    const vers = vsrc.length ? vsrc.map((v, i) => `<div class="ov-row"><span class="pill ${v.kind === "publish" ? "success" : "plain"}">${v.kind === "publish" ? "v" + v.version_no : "save"}</span>
      <div class="ov-main"><b>${esc(v.label || (v.kind === "publish" ? "Published v" + v.version_no : "Save point " + v.version_no))}</b><span>${fmtDate(v.published_at)}</span></div>
      <span class="ov-right">${i === 0 ? `<span class="pill plain">current</span>` : `<button class="btn btn-ghost btn-sm" data-compare="${v.version_no}">Compare</button>`}${i > 0 && canManage() ? `<button class="btn btn-ghost btn-sm" data-restore="${v.version_no}">Restore</button>` : ""}</span></div>`).join("")
      : emptyInline("No versions yet.");
    // Client review & approval (Slice D)
    const rstatus = reviewStatus(site);
    const steps = [["draft", "Draft"], ["review", "In review"], ["approved", "Approved"], ["live", "Live"]];
    const idx = Math.max(0, steps.findIndex((s) => s[0] === rstatus));
    const stepper = steps.map(([k, l], i) => `<div class="appr-step ${i < idx ? "done" : ""} ${i === idx ? "cur" : ""}"><span class="as-dot">${i < idx ? svg("check", 12) : i + 1}</span><span class="as-l">${l}</span></div>`).join("");
    const reviewUrl = `https://${site.subdomain || "site"}.aimindshare.site/?review=amsrv${(site.preview_token || "xxxxxx").slice(-6)}`;
    const advance = rstatus === "draft" ? ["review", "Send for client review"] : rstatus === "review" ? ["approved", "Mark approved"] : rstatus === "approved" ? ["live", "Publish live"] : null;
    const reviewActions = advance
      ? `<button class="btn btn-primary btn-sm" data-review="${advance[0]}">${advance[1]}</button>${idx > 0 ? `<button class="btn btn-ghost btn-sm" data-review="draft">Reset to draft</button>` : ""}`
      : `<span class="pill success">${svg("check", 12)} Live &amp; approved</span><button class="btn btn-ghost btn-sm" data-review="draft">Reset to draft</button>`;
    return `<div class="studio">
      <section class="st-cols reveal">
        <div class="panel"><div class="panel-head"><span class="ph-ico">${svg("rocket", 15)}</span><h3>Publish</h3></div>
          <div class="pub-state"><div class="ps-l"><b>${site.status === "published" ? "Live" : "Draft"}</b><span>${site.last_published ? "Last published " + fmtDate(site.last_published) + (site.last_version ? " · v" + site.last_version : "") : "Never published"}</span></div>
            <button class="btn btn-primary" id="pubNow">${svg("rocket", 14)} ${site.status === "published" ? "Publish changes" : "Publish site"}</button></div>
          <div class="pf-head">Pre-flight quality gate ${fails ? `<span class="pill danger">${fails} blocking</span>` : `<span class="pill success">all clear</span>`}</div>
          <div class="pf-list">${check}</div></div>
        <div class="panel"><div class="panel-head"><span class="ph-ico">${svg("clock", 15)}</span><h3>Version history</h3></div><div class="ov-list">${vers}</div></div>
      </section>
      <section class="st-sec reveal"><div class="panel">
        <div class="panel-head"><span class="ph-ico">${svg("users", 15)}</span><h3>Client review &amp; approval</h3></div>
        <div class="appr-track">${stepper}</div>
        <div class="review-share">
          <label class="label">Client review link — read-only preview with comment &amp; approve</label>
          <div class="rv-link"><span class="mono">${esc(reviewUrl)}</span><button class="icon-btn sm" data-copy="${esc(reviewUrl)}" title="Copy review link">${svg("copy", 13)}</button></div>
          <label class="rv-toggle"><input type="checkbox" id="rvPass"> Password-protect this link</label>
        </div>
        <div class="rv-actions">${reviewActions}</div>
      </div></section>
    </div>`;
  }
  function reviewStatus(site) {
    const m = state.reviewBySite || {};
    return m[site.id] || (site.status === "published" ? "live" : "draft");
  }
  function versionDiff(fromV, toV) {
    const map = {
      2: { summary: `v${toV} rewrote the pricing story and tightened the hero — the biggest change since the last publish.`,
        changes: [["added", "Pricing FAQ section", "5 Q&As with FAQPage schema under the pricing table."], ["changed", "Hero headline & CTA", "Shorter, benefit-led headline; CTA now “Book a call”."], ["changed", "Pricing table", "Moved from 2 tiers to 3; annual toggle added."], ["added", "Contact page", "New page with a lead form wired to the CRM."]] },
      1: { summary: `v${toV} is a major evolution from the original launch — new structure, copy and SEO.`,
        changes: [["added", "Services & Pricing pages", "Two new pages with on-brand copy."], ["changed", "Full copy rewrite", "Editorial tone across every section."], ["added", "JSON-LD schema", "LocalBusiness + FAQ schema on all pages."]] },
    };
    return map[fromV] || { summary: `Comparing v${fromV} with v${toV}.`, changes: [["changed", "Content updated", "Copy and layout refinements across pages."]] };
  }
  function openCompareModal(fromV) {
    const vsrc = !connected() ? MOCK.versions : [];
    const latest = vsrc[0]; if (!latest) return;
    const d = versionDiff(Number(fromV), latest.version_no);
    const rows = d.changes.map(([k, t, ds]) => `<div class="cmp-row cmp-${k}"><span class="cmp-tag">${k}</span><div class="cmp-main"><b>${esc(t)}</b><span>${esc(ds)}</span></div></div>`).join("");
    const m = el("div", "modal-card cmp-modal", `
      <div class="modal-head"><h3>${svg("layers", 18)} Compare v${esc(String(fromV))} → v${latest.version_no}</h3><button class="icon-btn" data-close>${svg("x", 16)}</button></div>
      <p class="cmp-summary">${svg("spark", 13)} ${esc(d.summary)}</p>
      <div class="cmp-list">${rows}</div>
      <div class="modal-foot"><button class="btn btn-ghost" data-close>Close</button>${canManage() ? `<button class="btn btn-primary" id="cmpRestore">${svg("undo", 13)} Restore v${esc(String(fromV))}</button>` : ""}</div>`);
    openModal(m);
    $("#cmpRestore", m)?.addEventListener("click", () => { closeModal(); toast(`Restoring version ${fromV}${connected() ? "…" : " (mockup)."}`, "info"); });
  }
  function tabIntegrations(site) {
    const widgets = [
      ["form", "Lead form", "Capture leads straight into your CRM", "connected"],
      ["clock", "Booking calendar", "Let visitors self-schedule appointments", "available"],
      ["book", "Live chat", "Chat widget wired to your team inbox", "available"],
    ];
    const cards = widgets.map(([ico, name, desc, st]) => `<div class="intg-card"><span class="intg-ico">${svg(ico, 18)}</span>
      <div class="intg-main"><b>${name}</b><span>${desc}</span></div>
      <div class="intg-act"><span class="pill ${st === "connected" ? "success" : "plain"}">${st}</span><button class="btn btn-ghost btn-sm" data-intg="${esc(name)}">${st === "connected" ? "Manage" : "Add"}</button></div></div>`).join("");
    return `<div class="studio"><section class="st-sec reveal">
      <div class="st-sec-head"><div class="sh-l"><h2>CRM <em>integrations</em></h2><p>Embed forms, calendars and chat — every submission flows into your CRM.</p></div></div>
      <div class="intg-grid">${cards}</div></section></div>`;
  }
  function tabPages(site, pages) {
    const rows = (pages || []).map((p) => `
      <div class="page-row" data-page="${esc(p.id)}">
        <span class="pr-ico">${p.is_home ? svg("home", 15) : svg("doc", 15)}</span>
        <div class="pr-main"><b>${esc(p.title)}</b><span class="mono">/${esc(p.is_home ? "" : p.slug)}</span></div>
        ${statusPill(p.status)}
        <span class="pr-when">${p.published_at ? "Published " + fmtDate(p.published_at) : "Draft"}</span>
        <span class="pr-actions">
          <button class="btn btn-primary btn-sm" data-editpage="${esc(site.id)}:${esc(p.id)}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-duppage="${esc(p.id)}">Duplicate</button>
          ${canManage() ? `<button class="icon-btn sm danger" data-delpage="${esc(p.id)}" title="Delete">${svg("trash", 14)}</button>` : ""}
        </span>
      </div>`).join("");
    return `<div class="panel"><div class="panel-head"><h3>Pages</h3>
        <span style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" id="genPages" title="Bulk-generate service, location and service×location pages from the Business Profile">${svg("layers", 14)} Generate pages</button>
          <button class="btn btn-primary btn-sm" id="newPage">${svg("plus", 14)} New page</button>
        </span></div>
      <div class="page-list">${rows || `<div class="empty-inline">No pages yet.</div>`}</div></div>`;
  }

  /* ── Tab: Business Profile — the structured, reusable generation source (v3) ── */
  function tabBusinessProfile(site, profile) {
    const p = profile || {};
    const chips = (arr, id, ph) => `<div class="chip-field" data-chipfield="${id}">
        <div class="chips">${(arr || []).map((v, i) => `<span class="chip" data-chip="${i}">${esc(v)}<button class="chip-x" data-chipdel="${i}" title="Remove">×</button></span>`).join("")}</div>
        <input class="input chip-input" data-chipadd="${id}" placeholder="${ph}">
      </div>`;
    const testis = (p.testimonials || []).map((t) => `<div class="proof-row"><span class="pr-quote">“${esc(t.quote)}”</span><span class="pr-author">${esc(t.author || "")}</span></div>`).join("")
      || `<div class="empty-inline" style="padding:14px">No testimonials yet.</div>`;
    return `<div class="panel bp-panel">
        <div class="panel-head"><h3>Business Profile</h3>
          <span class="muted" style="font-size:13px">One structured source of truth. AI generation, SEO, schema and programmatic pages all read from here — not a freeform prompt.</span></div>
        <div class="bp-grid">
          ${field("Business name", "bpName", p.business_name || site.name)}
          ${field("Phone", "bpPhone", p.phone || "")}
          ${field("Email", "bpEmail", p.email || "")}
          ${field("Opening hours", "bpHours", p.hours || "")}
          <div class="field bp-wide">${field("Address", "bpAddr", p.address || "", "text", "Powers LocalBusiness schema + the map/contact block")}</div>
        </div>
        <div class="bp-sections">
          <div class="bp-block"><label class="label">Service areas <span class="bp-hint">→ location pages</span></label>${chips(p.service_areas, "service_areas", "Add a city / area, Enter")}</div>
          <div class="bp-block"><label class="label">Services <span class="bp-hint">→ service pages</span></label>${chips(p.services, "services", "Add a service, Enter")}</div>
          <div class="bp-block"><label class="label">Differentiators <span class="bp-hint">→ hero + why-us</span></label>${chips(p.differentiators, "differentiators", "What sets you apart, Enter")}</div>
          <div class="bp-block"><label class="label">Exclusions <span class="bp-hint">keeps AI honest</span></label>${chips(p.exclusions, "exclusions", "What you DON'T do, Enter")}</div>
          <div class="bp-block"><label class="label">Proof points <span class="bp-hint">→ trust bar + schema</span></label>${chips(p.proof_points, "proof_points", "Award, stat, rating, Enter")}</div>
          <div class="bp-block"><label class="label">Testimonials</label><div class="proof-list">${testis}</div>
            <button class="btn btn-ghost btn-sm" id="bpAddTesti" style="margin-top:8px">${svg("plus", 13)} Add testimonial</button></div>
        </div>
        <div class="panel-foot" style="justify-content:space-between">
          <button class="btn btn-ghost btn-sm" id="bpGenerate">${svg("spark", 14)} Regenerate site from profile</button>
          <button class="btn btn-primary btn-sm" id="bpSave">Save profile</button></div>
      </div>`;
  }

  /* ── Tab: Site Health — the publish-time quality score (v3) ─────────────────── */
  function tabHealth(site, health) {
    const h = health || (site.health_score != null ? { score: site.health_score, categories: [] } : null);
    if (!h) return `<div class="panel"><div class="empty-state"><div class="es-ico">${svg("check", 20)}</div>
      <h3>No health report yet</h3><p>Publish a page and AiMindShare runs SEO, schema, accessibility, performance, broken-link and required-field checks, then scores the site.</p></div></div>`;
    const catIco = { seo: "search", schema: "layers", a11y: "eye", perf: "rocket", links: "ext", fields: "doc", security: "gear", conversion: "chart", content: "doc" };
    const badge = (st) => `<span class="qc-badge qc-${st}">${st === "pass" ? "✓" : st === "warn" ? "!" : "✕"}</span>`;
    const rows = (h.categories || []).map((c) => `<div class="hc-row">
        <span class="hc-ico">${svg(catIco[c.key] || "doc", 15)}</span>
        <div class="hc-main"><b>${esc(c.label)}</b><span class="muted">${esc(c.detail || "")}</span></div>
        ${badge(c.status)}</div>`).join("");
    const fails = (h.categories || []).filter((c) => c.status !== "pass").length;
    return `<div class="sk-cols" style="grid-template-columns:300px 1fr">
      <div class="panel hc-score-panel"><div class="panel-head"><h3>Health score</h3></div>
        <div class="hc-score">${healthRing(h.score, 132)}
          <p class="hc-verdict hr-${healthTier(h.score)}">${h.score >= 85 ? "Ready to publish" : h.score >= 65 ? "Fixable warnings" : "Needs attention"}</p>
          <p class="muted" style="font-size:12.5px">${fails ? fails + " check" + (fails === 1 ? "" : "s") + " to review" : "All checks pass"}${h.updated_at ? " · " + fmtDate(h.updated_at) : ""}</p>
          <button class="btn btn-ghost btn-sm" id="hcRerun" style="margin-top:10px">${svg("undo", 13)} Re-run checks</button></div></div>
      <div class="panel"><div class="panel-head"><h3>Quality checks</h3>
          <span class="muted" style="font-size:13px">Run automatically on every publish. GEO-readiness (llms.txt, entity coverage) included.</span></div>
        <div class="hc-list">${rows || `<div class="empty-inline">Checks run on next publish.</div>`}</div></div>
    </div>`;
  }
  function tabNav(site, pages) {
    const items = (site.nav?.items || (pages || []).slice(0, 4).map((p) => ({ label: p.title, page_id: p.id }))).map((it, i) => `
      <div class="nav-builder-row" draggable="true" data-navi="${i}"><span class="drag">⣿</span>
        <input class="input" value="${esc(it.label)}" data-navlabel="${i}"><span class="mono muted">${esc(it.url || "/" + (pages.find((p) => p.id === it.page_id)?.slug || ""))}</span>
        <button class="icon-btn sm" data-navdel="${i}">${svg("x", 13)}</button></div>`).join("");
    return `<div class="panel"><div class="panel-head"><h3>Navigation menu</h3><button class="btn btn-ghost btn-sm" id="navAdd">${svg("plus", 14)} Add item</button></div>
      <div class="nav-builder" id="navBuilder">${items || `<div class="empty-inline">No menu items.</div>`}</div>
      <div class="panel-foot"><button class="btn btn-primary btn-sm" id="navSave">Save menu</button></div></div>`;
  }
  function tabDomains(site, domains) {
    const rows = (domains || []).map((d) => `
      <div class="domain-row">
        <div class="dr-main">${svg("globe", 15)} <b>${esc(d.domain)}</b> ${d.is_primary ? `<span class="pill info">primary</span>` : ""}</div>
        <span class="pill ${d.status === "active" ? "success" : d.status === "failed" ? "danger" : "warning"}">${d.status}</span>
        <span class="pill ${d.ssl_status === "active" ? "success" : "plain"}" title="Live SSL provisioning arrives once hosting is finalized (D-009)">SSL: ${d.ssl_status}</span>
        <button class="btn btn-ghost btn-sm" data-verify="${esc(d.id)}">Verify DNS</button>
      </div>`).join("");
    return `<div class="panel"><div class="panel-head"><h3>Custom domains</h3>${canAdmin() ? `<button class="btn btn-primary btn-sm" id="addDomain">${svg("plus", 14)} Connect domain</button>` : ""}</div>
      <div class="domain-list">${rows || `<div class="empty-inline">No custom domains. Your site is live at <span class="mono">${esc(site.subdomain)}.aimindshare.site</span>.</div>`}</div>
      <div class="hint-card">${svg("globe", 15)} <div><b>How it works.</b> Add your domain, then create a <span class="mono">CNAME</span> → <span class="mono">sites.aimindshare.com</span> and a <span class="mono">TXT</span> verification record. We check DNS and issue SSL automatically. <span class="muted">Live certificate issuance is enabled once the platform host is finalized (D-009).</span></div></div></div>`;
  }
  function tabSeo(site) {
    const d = site.seo_defaults || {};
    return `<div class="panel"><div class="panel-head"><h3>SEO defaults</h3></div><div class="form-grid">
      ${field("Default title pattern", "seoTitle", d.title || "%page% · " + site.name)}
      ${field("Default description", "seoDesc", d.description || "", "textarea")}
      ${field("Default OG image URL", "seoOg", d.og_image || "", "text", "Media Library (M06) picker arrives with M06 — paste a URL for now")}
      ${field("Robots", "seoRobots", d.robots || "index,follow")}
      ${field("Favicon URL", "seoFav", site.favicon_url || "")}
    </div><div class="panel-foot"><button class="btn btn-primary btn-sm" id="seoSave">Save defaults</button></div></div>
    <div class="panel"><div class="panel-head"><h3>Technical SEO &amp; GEO</h3>
        <span class="muted" style="font-size:13px">Auto-generated by the renderer on every publish — no action needed.</span></div>
      <div class="seo-tech">
        ${[["sitemap.xml", "Every published page, updated on publish", "auto"],
           ["robots.txt", "Allow-all + sitemap reference", "auto"],
           ["llms.txt", "Structured business summary for AI search engines", "auto"],
           ["JSON-LD schema", "LocalBusiness / Service / FAQ / Product per page", "auto"],
           ["Internal linking", "Service ↔ location ↔ home auto-cross-linking", "auto"],
           ["OpenGraph / Twitter", "Cards generated from page meta + OG image", "auto"]
          ].map(([name, desc, st]) => `<div class="st-row"><div class="st-main"><b class="mono">${name}</b><span class="muted">${desc}</span></div><span class="pill success">${st}</span></div>`).join("")}
      </div>
      <div class="hint-card">${svg("spark", 15)} <div><b>GEO-ready.</b> The <span class="mono">llms.txt</span> and schema layer make each page legible to AI answer engines (ChatGPT, Perplexity, Google AI) — the same structured Business Profile feeds both classic SEO and generative-engine optimization.</div></div>
    </div>`;
  }
  function tabAnalytics(site, sessions, publishLog) {
    // Compute-on-read from visitor_sessions (staff+ RLS) — no rollup table.
    let stats;
    if (sessions === null) stats = MOCK.analytics;
    else {
      const counts = {};
      let identified = 0;
      (sessions || []).forEach((s) => { if (s.contact_id) identified++; (Array.isArray(s.pages) ? s.pages : []).forEach((p) => { const k = "/" + (p.slug || ""); counts[k] = (counts[k] || 0) + 1; }); });
      stats = { sessions: (sessions || []).length, identified, topPages: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5) };
    }
    const tiles = `<div class="an-tiles">
      <div class="an-tile"><span class="cs-num">${stats.sessions}</span><span class="cs-lab">Visitor sessions</span></div>
      <div class="an-tile"><span class="cs-num">${stats.identified}</span><span class="cs-lab">Identified contacts</span></div>
      <div class="an-tile"><span class="cs-num">${stats.topPages.length}</span><span class="cs-lab">Pages with traffic</span></div>
    </div>`;
    const top = stats.topPages.length
      ? stats.topPages.map(([slug, n]) => `<div class="an-row"><span class="mono">${esc(slug)}</span><span class="an-bar"><span style="width:${Math.min(100, Math.round(n / (stats.topPages[0][1] || 1) * 100))}%"></span></span><b>${n}</b></div>`).join("")
      : `<div class="empty-inline">No visits recorded yet — the tracking pixel reports here once the site is live.</div>`;
    const logRows = (publishLog || []).length
      ? publishLog.map((l) => `<div class="log-row">
          <span class="pill ${l.status === "ok" ? "success" : "danger"}">${esc(l.status)}</span>
          <b class="mono">${esc(l.kind)}</b>
          <span class="muted">${esc(l.detail?.slug ? "/" + l.detail.slug : l.detail?.domain || "")}${l.detail?.version_no ? " · v" + l.detail.version_no : ""}${l.detail?.result === "dns_not_found" ? " · DNS not found" : ""}</span>
          <span class="pr-when">${fmtDate(l.created_at)}</span></div>`).join("")
      : `<div class="empty-inline">No publish or domain activity logged yet.</div>`;
    return `<div class="panel"><div class="panel-head"><h3>Traffic</h3></div>${tiles}<div class="an-top">${top}</div></div>
      <div class="panel"><div class="panel-head"><h3>Publish & domain history</h3></div><div class="log-list">${logRows}</div></div>`;
  }
  function tabSettings(site) {
    const b = site.brand || {};
    const PRESETS = [["", "Default"], ["minimal", "Minimal"], ["bold", "Bold"], ["elegant", "Elegant"], ["islamic", "Islamic"]];
    const stagingUrl = `https://${site.subdomain || "your-site"}.aimindshare.site/?pt=${site.preview_token || ""}`;
    return `<div class="panel"><div class="panel-head"><h3>Brand & global styles</h3></div><div class="form-grid">
      ${field("Site name", "setName", site.name)}
      ${field("Staging subdomain", "setSub", site.subdomain || "", "text", "Your always-on preview URL host")}
      ${field("Brand color (teal)", "setTeal", (b.colors?.teal) || "", "text", "Applied site-wide as the accent — hex or token")}
      ${field("Heading font", "setFont", (b.fonts?.serif) || "", "text", "Falls back to the design system")}
      <div class="field"><label class="label" for="setPreset">Style preset</label>
        <select class="input" id="setPreset">${PRESETS.map(([v, l]) => `<option value="${v}" ${(site.style_preset || "") === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        <span class="help">A site-wide look (colors, type, radius). Your brand kit below always wins over the preset.</span></div>
    </div>
    <div class="brand-kit">
      <div class="bk-h"><b>Brand kit tokens</b><span class="muted">Design tokens applied across every page — one edit re-themes the whole site.</span></div>
      <div class="bk-grid">
        <div class="bk-swatches"><span class="bk-lab">Palette</span><div class="bk-row">
          <span class="bk-sw" style="background:var(--grad-brand)"></span><span class="bk-sw" style="background:var(--teal-500)"></span>
          <span class="bk-sw" style="background:var(--gold-500)"></span><span class="bk-sw" style="background:var(--ink-900)"></span>
          <button class="bk-add" title="Add color">+</button></div></div>
        <div class="field"><label class="label">Type scale</label><select class="input" id="bkType"><option>Serif display · Sans body (default)</option><option>All sans (modern)</option><option>All serif (editorial)</option></select></div>
        <div class="field"><label class="label">Corner radius</label><select class="input" id="bkRadius"><option>Rounded (16px)</option><option>Soft (10px)</option><option>Sharp (4px)</option><option>Pill</option></select></div>
        <div class="field"><label class="label">Shadow depth</label><select class="input" id="bkShadow"><option>Subtle</option><option>Elevated</option><option>Flat / none</option></select></div>
        <div class="field"><label class="label">Spacing rhythm</label><select class="input" id="bkSpace"><option>Comfortable</option><option>Compact</option><option>Airy</option></select></div>
      </div>
    </div>
    <div class="panel-foot"><button class="btn btn-primary btn-sm" id="setSave">Save settings</button></div>
    </div>
    <div class="panel"><div class="panel-head"><h3>Publish controls</h3></div>
      <div class="dz-row"><div><b>Staging preview</b><p class="muted">Share this link to review drafts before publishing — it also bypasses maintenance mode.</p></div>
        <button class="btn btn-ghost btn-sm" data-copy="${esc(stagingUrl)}">${svg("copy", 13)} Copy link</button></div>
      <div class="dz-row"><div><b>Maintenance mode</b><p class="muted">Visitors see a branded "back soon" page; the staging link still works.</p></div>
        <button class="btn ${site.maintenance_mode ? "btn-primary" : "btn-ghost"} btn-sm" id="maintToggle">${site.maintenance_mode ? "Turn off" : "Turn on"}</button></div>
      <div class="field" style="padding:0 4px 8px"><label class="label" for="set404">Custom 404 page (HTML)</label>
        <textarea class="input" id="set404" rows="3" placeholder="&lt;h1&gt;Lost?&lt;/h1&gt;&lt;p&gt;Let's get you home.&lt;/p&gt;">${esc(site.not_found_html || "")}</textarea>
        <span class="help">Shown for unknown URLs on this site. Leave empty for the standard 404.</span></div>
      <div class="panel-foot"><button class="btn btn-primary btn-sm" id="save404">Save 404 page</button></div>
    </div>
    <div class="panel danger-zone"><div class="panel-head"><h3>Danger zone</h3></div>
      <div class="dz-row"><div><b>Archive site</b><p class="muted">Unpublishes and hides the site. Reversible.</p></div><button class="btn btn-ghost btn-sm" id="archiveSite">Archive</button></div>
      ${canManage() ? `<div class="dz-row"><div><b>Delete site</b><p class="muted">Permanently removes the site, its pages and version history.</p></div><button class="btn btn-danger btn-sm" id="deleteSite">Delete</button></div>` : ""}
    </div>`;
  }
  function field(label, id, val, type = "text", help = "") {
    const input = type === "textarea" ? `<textarea class="input" id="${id}" rows="2">${esc(val)}</textarea>` : `<input class="input" id="${id}" value="${esc(val)}">`;
    return `<div class="field"><label class="label" for="${id}">${label}</label>${input}${help ? `<span class="help">${help}</span>` : ""}</div>`;
  }

  /* ── Screen: GrapeJS editor ───────────────────────────────────────────────── */
  let curPage = null;
  function viewEditor(siteId, pageId) {
    const canPub = canManage();
    return `<div class="ed-shell">
      <header class="ed-bar">
        <button class="icon-btn" id="edBack" title="Back to site">${svg("back", 16)}</button>
        <div class="ed-title"><b id="edPageTitle">Loading…</b><span class="mono" id="edSaved">—</span></div>
        <div class="ed-devices seg">
          <button data-dev="Desktop" class="on" title="Desktop">${svg("monitor", 15)}</button>
          <button data-dev="Tablet" title="Tablet">${svg("tablet", 15)}</button>
          <button data-dev="Mobile" title="Mobile">${svg("mobile", 15)}</button>
        </div>
        <button class="icon-btn" id="edUndo" title="Undo">${svg("undo", 15)}</button>
        <button class="icon-btn" id="edRedo" title="Redo">${svg("redo", 15)}</button>
        <div class="spacer"></div>
        <button class="btn btn-ghost btn-sm" id="edAI">${svg("spark", 14)} AI generate</button>
        <button class="btn btn-ghost btn-sm" id="edPreview">${svg("eye", 14)} Preview</button>
        ${canManage() ? `<button class="btn btn-ghost btn-sm" id="edSaveTpl" title="Save this page to your workspace template library">${svg("layers", 14)} Template</button>` : ""}
        <button class="btn btn-ghost btn-sm" id="edSave">${svg("save", 14)} Save</button>
        <button class="btn btn-primary btn-sm" id="edPublish" ${canPub ? "" : "disabled title='Publishing requires manager+'"}>${svg("rocket", 14)} Publish</button>
      </header>
      <div class="ed-body">
        <aside class="ed-left">
          <div class="ed-left-tabs"><button class="on" data-lt="blocks">Blocks</button><button data-lt="layers">Layers</button><button data-lt="templates">Templates</button></div>
          <div class="ed-left-panes">
            <div class="ed-pane on" id="paneBlocks"></div>
            <div class="ed-pane" id="paneLayers"></div>
            <div class="ed-pane" id="paneTemplates">${templateGallery()}</div>
          </div>
        </aside>
        <div class="ed-canvas-wrap"><div id="gjs" class="ed-canvas"></div>
          <div class="ed-mobile-note">The visual editor is designed for a larger screen. Open this page on desktop to edit; publishing and preview still work here.</div>
        </div>
        <aside class="ed-right">
          <div class="ed-right-tabs"><button class="on" data-rt="styles">Styles</button><button data-rt="settings">Settings</button><button data-rt="page">Page</button><button data-rt="versions">Versions</button></div>
          <div class="ed-right-panes">
            <div class="ed-pane on" id="paneStyles"></div>
            <div class="ed-pane" id="paneTraits"></div>
            <div class="ed-pane" id="panePageMeta">${pageMetaForm()}</div>
            <div class="ed-pane" id="paneVersions"><div class="empty-inline">Loading versions…</div></div>
          </div>
        </aside>
      </div>
    </div>`;
  }
  function templateGallery() {
    const t = (state.templates.length ? state.templates : MOCK.templates).slice(0, 40);
    const card = (x) => `<button class="tpl-card" data-tplid="${esc(x.id)}" title="${esc(x.description || "")}">
        <span class="tpl-thumb tpl-${esc(x.niche || "agency")}"></span>
        <span class="tpl-name">${esc(x.name)}</span>
        <span class="tpl-meta">${x.workspace_id ? `<span class="pill plain">yours</span>` : ""}${x.conversion_type ? `<span class="pill plain">${esc(x.conversion_type)}</span>` : ""}</span>
      </button>`;
    const mine = t.filter((x) => x.workspace_id), global = t.filter((x) => !x.workspace_id);
    return `${mine.length ? `<div class="tpl-group-label">Your library</div><div class="tpl-grid">${mine.map(card).join("")}</div>` : ""}
      <div class="tpl-group-label">Gallery</div><div class="tpl-grid">${global.map(card).join("")}</div>
      <p class="muted" style="padding:12px;font-size:13px">Click a template to replace the page. Save your own with the Template button in the toolbar.</p>`;
  }
  function pageMetaForm() {
    const LANGS = [["en", "English"], ["ar", "Arabic"], ["bn", "Bangla"], ["ur", "Urdu"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["tr", "Turkish"], ["id", "Indonesian"], ["ms", "Malay"]];
    return `<div class="meta-form">
      ${field("Meta title", "mTitle", "")}
      ${field("Meta description", "mDesc", "", "textarea")}
      ${field("OG image URL", "mOg", "", "text", "Paste a Media Library (M06) URL")}
      ${field("Canonical URL", "mCanon", "")}
      <div class="field"><label class="label">Robots</label><select class="input" id="mRobots"><option>index,follow</option><option>noindex,follow</option><option>noindex,nofollow</option></select></div>
      <div class="field"><label class="label">Schema (JSON-LD)</label><select class="input" id="mSchema"><option value="">None</option><option value="LocalBusiness">LocalBusiness</option><option value="Article">Article</option><option value="FAQPage">FAQPage</option><option value="Product">Product</option><option value="Event">Event</option></select></div>
      <div class="field"><label class="label">Page language</label><select class="input" id="mLang">${LANGS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select><span class="help">Sets the published page's <span class="mono">&lt;html lang&gt;</span>.</span></div>
    </div>`;
  }
  function versionsPane(versions) {
    const rows = (versions || []).map((v) => `
      <div class="ver-row">
        <span class="pill ${v.kind === "publish" ? "success" : "plain"}">${v.kind === "publish" ? "v" + v.version_no : "save"}</span>
        <div class="ver-main"><b>${esc(v.label || (v.kind === "publish" ? "Published version " + v.version_no : "Save point " + v.version_no))}</b>
          <span class="muted">${fmtDate(v.published_at)}</span></div>
        ${canManage() ? `<button class="btn btn-ghost btn-sm" data-restore="${v.version_no}">Restore</button>` : ""}
      </div>`).join("");
    return `<div class="ver-head"><button class="btn btn-ghost btn-sm" id="verSavePoint">${svg("save", 13)} Save point</button>
      <span class="help" style="padding:0 4px">Named snapshots you can roll back to. Publishing also snapshots automatically.</span></div>
      <div class="ver-list">${rows || `<div class="empty-inline">No versions yet — publish or create a save point.</div>`}</div>
      ${canManage() ? "" : `<p class="muted" style="padding:10px;font-size:12.5px">Restoring requires manager+.</p>`}`;
  }

  async function mountEditor(siteId, pageId) {
    // Resolve the page (live or mock).
    let page = null;
    if (connected()) {
      const c = ensureClient();
      const { data } = await c.from("pages").select("*").eq("id", pageId).maybeSingle();
      page = data;
    } else {
      const list = state.pagesBySite[siteId] || MOCK.pages[siteId] || [];
      page = list.find((p) => p.id === pageId) || list[0];
    }
    curPage = page ? { ...page, siteId } : { id: pageId, siteId, title: "Untitled", meta: {}, render_html: "" };
    $("#edPageTitle").textContent = curPage.title || "Untitled";
    fillMeta(curPage.meta || {});
    if ($("#mLang")) $("#mLang").value = curPage.language || "en";

    const handle = window.M19Editor.init($("#gjs"), {
      blocksEl: $("#paneBlocks"), layersEl: $("#paneLayers"), stylesEl: $("#paneStyles"), traitsEl: $("#paneTraits"),
      html: curPage.render_html || curPage.page_json?.html || "", css: curPage.render_css || "",
      projectData: (curPage.page_json && !curPage.render_html) ? curPage.page_json : null,
    });
    state.editor = handle;
    if (!handle) { toast("Editor failed to load.", "danger"); return; }
    markSaved("loaded");
    bindEditorChrome(siteId);
    refreshVersions();
  }
  const fillMeta = (m) => { const set = (id, v) => { const e = $("#" + id); if (e) e.value = v || ""; }; set("mTitle", m.title); set("mDesc", m.description); set("mOg", m.og_image); set("mCanon", m.canonical); if ($("#mRobots")) $("#mRobots").value = m.robots || "index,follow"; if ($("#mSchema")) $("#mSchema").value = m.schema_type || ""; };
  const readMeta = () => ({ title: $("#mTitle")?.value || "", description: $("#mDesc")?.value || "", og_image: $("#mOg")?.value || "", canonical: $("#mCanon")?.value || "", robots: $("#mRobots")?.value || "index,follow", schema_type: $("#mSchema")?.value || "" });
  function markSaved(txt) { const e = $("#edSaved"); if (e) e.textContent = txt === "loaded" ? "ready" : txt; }

  function bindEditorChrome(siteId) {
    $("#edBack").onclick = () => { teardownEditor(); location.hash = "#/sites/" + siteId; };
    $$(".ed-devices button").forEach((b) => b.onclick = () => { $$(".ed-devices button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); state.editor.device(b.dataset.dev); });
    $("#edUndo").onclick = () => state.editor.undo();
    $("#edRedo").onclick = () => state.editor.redo();
    $$(".ed-left-tabs button").forEach((b) => b.onclick = () => switchPane(".ed-left-tabs", ".ed-left-panes", b, { blocks: "paneBlocks", layers: "paneLayers", templates: "paneTemplates" }[b.dataset.lt]));
    $$(".ed-right-tabs button").forEach((b) => b.onclick = () => switchPane(".ed-right-tabs", ".ed-right-panes", b, { styles: "paneStyles", settings: "paneTraits", page: "panePageMeta", versions: "paneVersions" }[b.dataset.rt]));
    $$(".tpl-card").forEach((b) => b.onclick = () => applyTemplate(b.dataset.tplid));
    $("#edSaveTpl") && ($("#edSaveTpl").onclick = saveAsTemplate);
    $("#edAI").onclick = openAIPanel;
    $("#edPreview").onclick = previewPage;
    $("#edSave").onclick = () => savePage(siteId, false);
    $("#edPublish").onclick = () => { if (!canManage()) return; openQualityGate(() => savePage(siteId, true)); };
  }
  function switchPane(tabsSel, panesSel, btn, paneId) { $$(tabsSel + " button").forEach((x) => x.classList.remove("on")); btn.classList.add("on"); $$(panesSel + " .ed-pane").forEach((p) => p.classList.remove("on")); $("#" + paneId)?.classList.add("on"); }
  function teardownEditor() { if (state.editor) { state.editor.destroy(); state.editor = null; } curPage = null; }

  // Resolve a template ROW (D-151) to renderable content: a workspace-saved
  // template carries its own snapshot; a global generator seed routes through
  // the shared deterministic engine.
  async function resolveTemplate(tplId) {
    const row = (state.templates || []).find((t) => t.id === tplId) || (MOCK.templates || []).find((t) => t.id === tplId);
    if (!row) return null;
    let full = row;
    if (connected() && !("render_html" in row)) {
      const c = ensureClient();
      const { data } = await c.from("site_templates").select("page_json,render_html,render_css,niche,name").eq("id", tplId).maybeSingle();
      if (data) full = { ...row, ...data };
    }
    if (full.render_html) return { row: full, html: full.render_html, css: full.render_css || "" };
    const B = await loadBuilder(); if (!B) return null;
    const niche = full.page_json?.niche || full.niche || "agency";
    const { html, css } = B.sectionsToHtml(B.generateFromNiche("", niche));
    return { row: full, html, css };
  }

  async function applyTemplate(tplId) {
    const r = await resolveTemplate(tplId); if (!r) return;
    state.editor.setContent(r.html, r.css);
    markSaved("unsaved"); toast(`Applied "${r.row.name}".`, "success");
  }

  // The AI hero bar (list screen): description + niche → a new site with a
  // generated home page, straight into the editor. Same shared engine as
  // builder-ai-generate (D-103) — one source of truth.
  const deriveName = (desc) => (desc.match(/(?:for|called|named)\s+([A-Z][\w& ]{1,30})/) || [])[1]?.trim()
    || desc.trim().split(/\s+/).slice(0, 3).join(" ") || "New site";
  async function createSiteFromAI(desc, niche) {
    const B = await loadBuilder(); if (!B) return;
    const { html, css } = B.sectionsToHtml(B.generateFromNiche(desc, niche));
    const name = deriveName(desc);
    const sub = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "site-" + Math.random().toString(36).slice(2, 6);
    if (!connected()) {
      const id = "mock-" + Math.random().toString(36).slice(2, 6);
      state.sites.unshift({ id, name, subdomain: sub, status: "draft", pages: 1, primary_domain: null, updated_at: new Date().toISOString(), preview_token: "amspt" + Math.random().toString(36).slice(2, 10), sessions_7d: 0, traffic: [] });
      state.pagesBySite[id] = [{ id: id + "-home", title: "Home", slug: "home", is_home: true, status: "draft", render_html: html, render_css: css }];
      toast("Site drafted (mockup). Opening the editor…", "success");
      location.hash = `#/sites/${id}/edit/${id}-home`; return;
    }
    const c = ensureClient();
    try {
      const { data: site, error } = await c.from("sites").insert({ workspace_id: state.workspaceId, name, subdomain: sub }).select().single();
      if (error) throw error;
      const { data: page, error: pErr } = await c.from("pages")
        .insert({ workspace_id: state.workspaceId, site_id: site.id, title: "Home", slug: "home", is_home: true, render_html: html, render_css: css }).select().single();
      if (pErr) throw pErr;
      toast("Site drafted. Opening the editor…", "success");
      detailCache = null; location.hash = `#/sites/${site.id}/edit/${page.id}`;
    } catch (e) { toast(e.message || "Could not create the site", "danger"); }
  }

  // Save the current page into the WORKSPACE template library (manager+ via RLS).
  async function saveAsTemplate() {
    if (!state.editor || !curPage) return;
    const name = prompt("Template name", (curPage.title || "Page") + " template"); if (!name) return;
    const out = state.editor.exportPage();
    if (!connected()) { toast("Template saved (mockup).", "success"); return; }
    const c = ensureClient();
    const { error } = await c.from("site_templates").insert({
      workspace_id: state.workspaceId, name, description: "Saved from " + (curPage.title || "a page"),
      page_json: out.page_json, render_html: out.render_html, render_css: out.render_css,
    });
    if (error) { toast(error.message, "danger"); return; }
    toast("Saved to your template library.", "success");
    const { data: tpl } = await c.from("site_templates").select("id,name,niche,thumb_url,description,conversion_type,language,workspace_id")
      .or(`workspace_id.is.null,workspace_id.eq.${state.workspaceId}`).eq("is_active", true).order("name");
    state.templates = tpl || state.templates;
    const pane = $("#paneTemplates"); if (pane) { pane.innerHTML = templateGallery(); $$(".tpl-card", pane).forEach((b) => b.onclick = () => applyTemplate(b.dataset.tplid)); }
  }

  // Versions pane (D-147): list save points + published snapshots; restore = revert_page.
  async function refreshVersions() {
    const pane = $("#paneVersions"); if (!pane || !curPage) return;
    let versions = MOCK.versions;
    if (connected()) {
      const c = ensureClient();
      const { data } = await c.from("page_versions").select("id,version_no,kind,label,published_at")
        .eq("page_id", curPage.id).order("version_no", { ascending: false }).limit(20);
      versions = data || [];
    }
    pane.innerHTML = versionsPane(versions);
    $("#verSavePoint") && ($("#verSavePoint").onclick = async () => {
      const label = prompt("Label this save point (optional)") ?? "";
      if (!connected()) { toast("Save point created (mockup).", "success"); return; }
      const out = state.editor.exportPage();
      const c = ensureClient();
      // Persist the canvas first so the snapshot captures what you see.
      const { error: upErr } = await c.from("pages").update({ page_json: out.page_json, render_html: out.render_html, render_css: out.render_css, meta: readMeta() }).eq("id", curPage.id);
      if (upErr) { toast(upErr.message, "danger"); return; }
      const { error } = await c.rpc("save_page_version", { p_page: curPage.id, p_label: label || null });
      if (error) toast(error.message, "danger"); else { toast("Save point created.", "success"); markSaved("saved " + new Date().toLocaleTimeString()); refreshVersions(); }
    });
    $$("[data-restore]", pane).forEach((b) => b.onclick = async () => {
      if (!confirm(`Restore version ${b.dataset.restore}? The page becomes a draft you can re-publish.`)) return;
      if (!connected()) { toast("Restored (mockup).", "success"); return; }
      const c = ensureClient();
      const { error } = await c.rpc("revert_page", { p_page: curPage.id, p_version: Number(b.dataset.restore) });
      if (error) { toast(error.message, "danger"); return; }
      const { data: fresh } = await c.from("pages").select("*").eq("id", curPage.id).maybeSingle();
      if (fresh) { curPage = { ...fresh, siteId: curPage.siteId }; state.editor.setContent(fresh.render_html || "", fresh.render_css || ""); fillMeta(fresh.meta || {}); }
      toast("Version restored as a draft.", "success"); refreshVersions();
    });
  }

  async function savePage(siteId, publish) {
    if (!state.editor || !curPage) return;
    const out = state.editor.exportPage();
    const meta = readMeta();
    markSaved("saving…");
    if (!connected()) { markSaved("saved (mock) " + new Date().toLocaleTimeString()); toast(publish ? "Published (mockup)." : "Saved (mockup).", "success"); return; }
    const c = ensureClient();
    try {
      const { error } = await c.from("pages").update({ page_json: out.page_json, render_html: out.render_html, render_css: out.render_css, meta, language: $("#mLang")?.value || "en" }).eq("id", curPage.id);
      if (error) throw error;
      if (publish) {
        const { error: pErr } = await c.rpc("publish_page", { p_page: curPage.id });
        if (pErr) throw pErr;
        toast("Published.", "success");
        refreshVersions();
      } else toast("Saved.", "success");
      markSaved("saved " + new Date().toLocaleTimeString());
    } catch (e) { toast(e.message || "Save failed", "danger"); markSaved("save failed"); }
  }

  async function previewPage() {
    if (!state.editor) return;
    const out = state.editor.exportPage();
    const R = await loadRender(); if (!R) { toast("Preview module unavailable", "danger"); return; }
    const site = { id: curPage.siteId, name: curPage.title || "Preview", brand: {}, seo_defaults: {} };
    const page = { slug: "preview", title: curPage.title, is_home: true, status: "published", render_html: out.render_html, render_css: out.render_css, meta: readMeta() };
    const doc = R.renderPage({ site, page, cookie: {} });
    const w = window.open("", "_blank"); if (w) { w.document.open(); w.document.write(doc); w.document.close(); } else toast("Allow pop-ups to preview.", "info");
  }

  /* ── AI generate panel (modal) ────────────────────────────────────────────── */
  function openAIPanel() {
    const m = el("div", "modal-card ai-panel", `
      <div class="modal-head"><h3>${svg("spark", 18)} AI generate</h3><button class="icon-btn" data-close>${svg("x", 16)}</button></div>
      <div class="ai-tabs seg"><button class="on" data-ait="describe">Describe</button><button data-ait="clone">Clone URL</button><button data-ait="voice">Voice</button></div>
      <div class="ai-body">
        <div class="ai-pane on" data-aipane="describe">
          <div class="field"><label class="label">Niche</label><select class="input" id="aiNiche"><option value="agency">Agency / services</option><option value="saas">SaaS / product</option><option value="local">Local business</option><option value="coach">Coach / creator</option><option value="ecom">E-commerce</option></select></div>
          <div class="field"><label class="label">Describe your business</label><textarea class="input" id="aiDesc" rows="3" placeholder="A boutique growth agency for wellness brands, called Northstar…"></textarea></div>
          <button class="btn btn-primary" id="aiGo">${svg("spark", 14)} Generate page</button>
        </div>
        <div class="ai-pane" data-aipane="clone"><div class="scaffold-note">${svg("globe", 16)} <div><b>Clone from a URL</b><p class="muted">Paste a site to mirror its structure and palette. Arrives with the AI provider — flagged, not faked.</p></div></div></div>
        <div class="ai-pane" data-aipane="voice"><div class="scaffold-note">🎙 <div><b>Voice prompt</b><p class="muted">Describe your site out loud. Uses your browser's speech recognition where available.</p><button class="btn btn-ghost btn-sm" id="aiMic">Start speaking</button></div></div></div>
      </div>`);
    openModal(m);
    $$(".ai-tabs button", m).forEach((b) => b.onclick = () => { $$(".ai-tabs button", m).forEach((x) => x.classList.remove("on")); b.classList.add("on"); $$(".ai-pane", m).forEach((p) => p.classList.toggle("on", p.dataset.aipane === b.dataset.ait)); });
    $("#aiGo", m).onclick = async () => {
      const desc = $("#aiDesc", m).value.trim(), niche = $("#aiNiche", m).value;
      $("#aiGo", m).disabled = true; $("#aiGo", m).innerHTML = "Generating…";
      try {
        let html, css;
        if (connected()) {
          const c = ensureClient();
          const { data, error } = await c.functions.invoke("builder-ai-generate", { body: { workspace_id: state.workspaceId, mode: "describe", description: desc, niche } });
          if (error) throw error; const r = data?.data || data; html = r.html; css = r.css;
        } else { const B = await loadBuilder(); const s = B.generateFromNiche(desc, niche); ({ html, css } = B.sectionsToHtml(s)); }
        state.editor.setContent(html, css); markSaved("unsaved");
        closeModal(); toast("Page generated. Refine it in the editor.", "success");
      } catch (e) { toast(e.message || "Generation failed", "danger"); $("#aiGo", m).disabled = false; $("#aiGo", m).innerHTML = "Generate page"; }
    };
    const mic = $("#aiMic", m);
    if (mic) mic.onclick = () => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { toast("Speech recognition isn't supported in this browser.", "info"); return; }
      const rec = new SR(); rec.onresult = (ev) => { $$(".ai-tabs button", m)[0].click(); $("#aiDesc", m).value = ev.results[0][0].transcript; toast("Transcribed — review and generate.", "success"); }; rec.start(); toast("Listening…", "info");
    };
  }

  /* ── Programmatic pages: services × locations → bulk pages (v3) ───────────── */
  function openProgrammaticModal(siteId) {
    const p = (detailCache?.profile) || (state.profilesBySite || {})[siteId] || {};
    const services = p.services || [], areas = p.service_areas || [];
    const opt = (arr, kind) => arr.length
      ? arr.map((v, i) => `<label class="pg-check"><input type="checkbox" data-pg="${kind}" value="${esc(v)}" checked> ${esc(v)}</label>`).join("")
      : `<span class="muted" style="font-size:13px">None in the Business Profile yet — add ${kind === "svc" ? "services" : "service areas"} first.</span>`;
    const m = el("div", "modal-card pg-modal", `
      <div class="modal-head"><h3>${svg("layers", 18)} Generate pages</h3><button class="icon-btn" data-close>${svg("x", 16)}</button></div>
      <p class="muted" style="font-size:13.5px;margin:2px 0 12px">Spin up SEO-optimized pages from your Business Profile. Each page gets its own title, meta, LocalBusiness/Service schema and internal links — deterministically, no per-page prompting.</p>
      <div class="pg-cols">
        <div class="pg-col"><div class="pg-col-h">Services</div><div class="pg-list">${opt(services, "svc")}</div></div>
        <div class="pg-col"><div class="pg-col-h">Locations</div><div class="pg-list">${opt(areas, "loc")}</div></div>
      </div>
      <div class="field" style="margin-top:12px"><label class="label">Page type</label>
        <select class="input" id="pgType">
          <option value="svc">Service pages (one per service)</option>
          <option value="loc">Location pages (one per area)</option>
          <option value="combo" selected>Service × Location (a page for each pair)</option>
        </select></div>
      <div class="pg-preview" id="pgPreview"></div>
      <div class="modal-foot"><button class="btn btn-primary" id="pgGo">${svg("spark", 14)} Generate <span id="pgN">0</span> pages</button></div>`);
    openModal(m);
    const sel = (kind) => $$(`[data-pg="${kind}"]`, m).filter((c) => c.checked).map((c) => c.value);
    const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    function refresh() {
      const svc = sel("svc"), loc = sel("loc"), type = $("#pgType", m).value;
      let pages = [];
      if (type === "svc") pages = svc.map((s) => ({ title: s, slug: slug(s) }));
      else if (type === "loc") pages = loc.map((l) => ({ title: l, slug: slug(l) }));
      else pages = svc.flatMap((s) => loc.map((l) => ({ title: `${s} in ${l}`, slug: `${slug(s)}/${slug(l)}` })));
      pages = pages.slice(0, 60);
      $("#pgN", m).textContent = pages.length;
      $("#pgPreview", m).innerHTML = pages.length
        ? `<div class="pg-prev-h">${pages.length} page${pages.length === 1 ? "" : "s"} · preview</div>` +
          pages.slice(0, 12).map((pg) => `<div class="pg-prev-row"><b>${esc(pg.title)}</b><span class="mono">/${esc(pg.slug)}</span></div>`).join("") +
          (pages.length > 12 ? `<div class="muted" style="padding:8px 10px;font-size:12.5px">+ ${pages.length - 12} more…</div>` : "")
        : `<div class="empty-inline" style="padding:16px">Select at least one item to preview the pages.</div>`;
    }
    $$("[data-pg]", m).forEach((c) => c.onchange = refresh);
    $("#pgType", m).onchange = refresh;
    refresh();
    $("#pgGo", m).onclick = () => {
      const n = $("#pgN", m).textContent;
      closeModal();
      toast(connected() ? `Queued ${n} pages for generation.` : `${n} pages generated (mockup) — each SEO-ready with schema + internal links.`, "success");
    };
  }

  /* ── Pre-publish quality gate (v3): run checks, then confirm publish ───────── */
  function openQualityGate(onConfirm) {
    // Derive lightweight checks from the current editor content + page meta.
    const meta = readMeta();
    const html = (state.editor?.exportPage()?.render_html) || "";
    const checks = [
      { label: "Meta title set", status: meta.title ? "pass" : "warn", detail: meta.title ? "" : "Falls back to the page title" },
      { label: "Meta description set", status: meta.description ? "pass" : "fail", detail: meta.description ? "" : "Add one — it drives search click-through" },
      { label: "Schema selected", status: meta.schema_type ? "pass" : "warn", detail: meta.schema_type ? meta.schema_type : "No JSON-LD — recommended for rich results" },
      { label: "Images have alt text", status: !/<img(?![^>]*alt=)/i.test(html) ? "pass" : "warn", detail: /<img(?![^>]*alt=)/i.test(html) ? "Some images missing alt" : "" },
      { label: "Has a call-to-action", status: /s-btn|data-embed/.test(html) ? "pass" : "warn", detail: /s-btn|data-embed/.test(html) ? "" : "No button/form found" },
      { label: "Canonical URL", status: meta.canonical ? "pass" : "warn", detail: meta.canonical ? "" : "Optional — set for duplicate content" },
    ];
    const score = Math.round(checks.reduce((a, c) => a + (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0), 0) / checks.length * 100);
    const blocking = checks.some((c) => c.status === "fail");
    const badge = (st) => `<span class="qc-badge qc-${st}">${st === "pass" ? "✓" : st === "warn" ? "!" : "✕"}</span>`;
    const m = el("div", "modal-card qg-modal", `
      <div class="modal-head"><h3>${svg("rocket", 18)} Publish checks</h3><button class="icon-btn" data-close>${svg("x", 16)}</button></div>
      <div class="qg-top">${healthRing(score, 64)}<div><b class="hr-${healthTier(score)}">${score >= 85 ? "Looks great" : score >= 65 ? "A few warnings" : "Needs attention"}</b>
        <p class="muted" style="font-size:12.5px;margin:2px 0 0">${blocking ? "Fix the blocking item, or publish anyway." : "Warnings won't block publishing."}</p></div></div>
      <div class="qg-list">${checks.map((c) => `<div class="qg-row">${badge(c.status)}<div class="qg-main"><b>${esc(c.label)}</b>${c.detail ? `<span class="muted">${esc(c.detail)}</span>` : ""}</div></div>`).join("")}</div>
      <div class="modal-foot"><button class="btn btn-ghost btn-sm" data-close>Keep editing</button>
        <button class="btn ${blocking ? "btn-danger" : "btn-primary"} btn-sm" id="qgPublish">${blocking ? "Publish anyway" : "Publish now"}</button></div>`);
    openModal(m);
    $("#qgPublish", m).onclick = () => { closeModal(); onConfirm(); };
  }

  /* ── Dynamic imports of the SHARED pure modules (one source of truth) ─────── */
  let _B, _R;
  async function loadBuilder() { if (!_B) { try { _B = await import("./js/page-builder.mjs"); } catch (e) { try { _B = await import("./page-builder.mjs"); } catch (e2) { toast("Builder module failed to load", "danger"); return null; } } } return _B; }
  async function loadRender() { if (!_R) { try { _R = await import("./js/site-render.mjs"); } catch (e) { try { _R = await import("./site-render.mjs"); } catch (e2) { return null; } } } return _R; }

  /* ── Modals ───────────────────────────────────────────────────────────────── */
  function openModal(cardEl) { const root = $("#modalRoot"); root.innerHTML = ""; const wrap = el("div", "modal-scrim"); wrap.appendChild(cardEl); root.appendChild(wrap); requestAnimationFrame(() => wrap.classList.add("open")); wrap.addEventListener("click", (e) => { if (e.target === wrap) closeModal(); }); cardEl.querySelector("[data-close]")?.addEventListener("click", closeModal); }
  function closeModal() { const w = $("#modalRoot .modal-scrim"); if (w) { w.classList.remove("open"); setTimeout(() => { $("#modalRoot").innerHTML = ""; }, 200); } }

  // The single creation surface — every "create" entry point opens this. Five
  // inline paths (AI / Blank / Template / Import / Clone); no separate pages.
  // `prefill`, when set, seeds the AI tab's textarea (used by the page-level hero).
  function openCreateModal(tab, prefill) {
    tab = tab || "ai";
    const tmpls = studioTemplates().slice(0, 8).map(miniTpl).join("");
    const TABS = [["ai", "spark", "Create with AI"], ["blank", "doc", "Blank"], ["tpl", "layers", "Template"], ["import", "download", "Import"], ["clone", "copy", "Clone URL"]];
    const tabsHtml = TABS.map(([k, ic, l]) => `<button class="imp-tab ${k === tab ? "on" : ""}" data-ct="${k}">${svg(ic, 14)} ${l}</button>`).join("");
    const m = el("div", "modal-card create-modal", `
      <div class="modal-head"><h3>${svg("spark", 18)} Create a new website</h3><button class="icon-btn" data-close>${svg("x", 16)}</button></div>
      <div class="imp-tabs cm-tabs">${tabsHtml}</div>
      <div class="imp-pane ${tab === "ai" ? "on" : ""}" data-ctpane="ai">
        ${composerHtml("cm")}
      </div>
      <div class="imp-pane ${tab === "blank" ? "on" : ""}" data-ctpane="blank">
        <div class="field"><label class="label">Site name</label><input class="input" id="cmBlankName" placeholder="Acme Co"></div>
        <p class="cm-note">${svg("doc", 15)}<span>Starts an empty canvas — add sections and pages in the visual editor.</span></p>
        <div class="modal-foot"><button class="btn btn-primary" id="cmBlankGo">${svg("plus", 14)} Create blank site</button></div>
      </div>
      <div class="imp-pane ${tab === "tpl" ? "on" : ""}" data-ctpane="tpl">
        <p class="cm-note">${svg("layers", 15)}<span>Pick a professional layout — it seeds your first page, fully editable.</span></p>
        <div class="cm-tpl-grid">${tmpls}</div>
      </div>
      <div class="imp-pane ${tab === "import" ? "on" : ""}" data-ctpane="import">
        <div class="field"><label class="label">Site name</label><input class="input" id="cmImpName" placeholder="Imported site"></div>
        <div class="field"><label class="label">Paste HTML</label><textarea class="input" id="cmImpHtml" rows="6" placeholder="&lt;section&gt;…your existing markup…&lt;/section&gt;"></textarea><span class="help">Paste raw HTML to import it into a new editable page. React / Next.js import arrives with the AI provider — flagged, not faked.</span></div>
        <div class="modal-foot"><button class="btn btn-primary" id="cmImpGo">${svg("download", 14)} Import as site</button></div>
      </div>
      <div class="imp-pane ${tab === "clone" ? "on" : ""}" data-ctpane="clone">
        <div class="scaffold-note">${svg("globe", 16)}<div><b>Clone from a URL</b><p class="muted">Paste a site to mirror its structure and palette into an editable draft. Cross-origin cloning runs server-side and arrives with the AI provider — flagged, not faked.</p></div></div>
        <div class="field" style="margin-top:12px"><label class="label">Website URL</label><input class="input" id="cmCloneUrl" placeholder="https://example.com"></div>
        <div class="modal-foot"><button class="btn btn-primary" id="cmCloneGo">${svg("copy", 14)} Clone site</button></div>
      </div>`);
    openModal(m);
    if (prefill) $("#cmPrompt", m).value = prefill;
    // Tab switching
    $$(".cm-tabs .imp-tab", m).forEach((b) => b.onclick = () => {
      $$(".cm-tabs .imp-tab", m).forEach((x) => x.classList.remove("on")); b.classList.add("on");
      $$(".imp-pane", m).forEach((p) => p.classList.toggle("on", p.dataset.ctpane === b.dataset.ct));
    });
    // AI composer — shared with the page-level hero via composerHtml/bindComposer
    bindComposer("cm", m, (desc, niche) => { closeModal(); createSiteFromAI(desc, niche); });
    // Blank
    $("#cmBlankGo", m).onclick = () => { closeModal(); createSite(($("#cmBlankName", m).value || "Untitled site").trim(), "blank"); };
    // Template — reuse the gallery binder, then close the modal on "use"
    bindTemplateCards(m);
    $$("[data-use-tpl]", m).forEach((b) => b.addEventListener("click", closeModal));
    // Import
    $("#cmImpGo", m).onclick = () => {
      const name = ($("#cmImpName", m).value || "Imported site").trim();
      const html = $("#cmImpHtml", m).value.trim();
      if (!html) { $("#cmImpHtml", m).focus(); toast("Paste some HTML to import.", "info"); return; }
      closeModal(); createSiteFromHtml(name, html);
    };
    // Clone
    $("#cmCloneGo", m).onclick = () => { const u = $("#cmCloneUrl", m).value.trim(); if (!u) { $("#cmCloneUrl", m).focus(); return; } closeModal(); toast("URL cloning runs with the AI provider — flagged, not faked.", "info"); };
  }
  async function createSite(name, start) {
    const sub = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "site-" + Math.random().toString(36).slice(2, 6);
    if (!connected()) { closeModal(); toast("Site created (mockup). Connect a project to persist.", "success"); const id = "mock-" + Math.random().toString(36).slice(2, 6); state.sites.unshift({ id, name, subdomain: sub, status: "draft", pages: 1, primary_domain: null, updated_at: new Date().toISOString() }); state.pagesBySite[id] = [{ id: "mp1", title: "Home", slug: "home", is_home: true, status: "draft", render_html: MOCK.pages.s1[0].render_html }]; location.hash = "#/sites/" + id; return; }
    const c = ensureClient();
    try {
      const { data: site, error } = await c.from("sites").insert({ workspace_id: state.workspaceId, name, subdomain: sub }).select().single();
      if (error) throw error;
      let html = "", css = "";
      if (start === "ai" || start === "tpl") { const B = await loadBuilder(); if (B) ({ html, css } = B.sectionsToHtml(B.generateFromNiche(name, "agency"))); }
      await c.from("pages").insert({ workspace_id: state.workspaceId, site_id: site.id, title: "Home", slug: "home", is_home: true, render_html: html, render_css: css });
      closeModal(); toast("Site created.", "success"); detailCache = null; await boot(); location.hash = "#/sites/" + site.id;
    } catch (e) { toast(e.message || "Could not create site", "danger"); }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     STUDIO LAYER — command-center dashboard, AI-create hero, template library,
     cross-site overviews and capability screens. All read the same state/MOCK the
     rest of the module uses; generation routes through the shared builder engine.
     ═══════════════════════════════════════════════════════════════════════════ */

  /* ── Template library dataset (category → niche seed + gradient) ───────────── */
  const TPL_CATS = [
    ["saas", "SaaS", "grid", "saas", 1], ["ai", "AI Startups", "spark", "saas", 8], ["agency", "Agencies", "users", "agency", 0],
    ["business", "Small Business", "globe", "local", 6], ["restaurant", "Restaurants", "globe", "restaurant", 10], ["healthcare", "Healthcare", "check", "dentist", 4],
    ["education", "Education", "book", "coach", 3], ["ecommerce", "E-commerce", "layers", "ecom", 5], ["portfolio", "Portfolio", "image", "agency", 9],
    ["realestate", "Real Estate", "home", "realestate", 7], ["finance", "Finance", "chart", "agency", 9], ["events", "Events", "spark", "coach", 2],
    ["nonprofit", "Nonprofits", "users", "agency", 4], ["personal", "Personal Brands", "star", "coach", 11], ["blog", "Blogs", "book", "coach", 3],
    ["landing", "Landing Pages", "rows", "saas", 1], ["launch", "Product Launches", "rocket", "saas", 2], ["dashboard", "Dashboards", "grid", "saas", 8],
    ["membership", "Membership Sites", "users", "coach", 7], ["booking", "Booking Platforms", "clock", "local", 6],
  ];
  const CAT_META = Object.fromEntries(TPL_CATS.map(([k, label, ico, niche, thm]) => [k, { label, ico, niche, thm }]));
  // 63 named, professionally-themed starter templates across all 20 categories.
  const TPL_DEFS = [
    ["Nimbus SaaS", "saas", ["Signup", "Pricing"], "feat"], ["FlowMetrics", "saas", ["Analytics", "Trial"], "pop"], ["StackBase", "saas", ["Docs", "API"]], ["Cadence", "saas", ["B2B", "Demo"]],
    ["Synapse AI", "ai", ["LLM", "Waitlist"], "feat"], ["NeuralForge", "ai", ["Startup", "Beta"], "new"], ["PromptWorks", "ai", ["Tool", "Signup"]], ["VectorMind", "ai", ["Research"]],
    ["Northstar Agency", "agency", ["Growth", "Lead"], "pop"], ["Meridian Studio", "agency", ["Creative"]], ["Loop Collective", "agency", ["Design", "Lead"]], ["Brightside", "agency", ["Marketing"]],
    ["Cornerstone Co", "business", ["Local", "Quote"]], ["Maple & Co", "business", ["Services"], "new"], ["Ironclad Trades", "business", ["Contractor"]], ["Harbor Consulting", "business", ["B2B"]],
    ["Saffron Table", "restaurant", ["Menu", "Reserve"], "pop"], ["The Copper Pot", "restaurant", ["Bistro"]], ["Ember & Oak", "restaurant", ["Fine dining"]], ["Brew Lane Cafe", "restaurant", ["Cafe"], "new"],
    ["Crescent Dental", "healthcare", ["Booking"], "feat"], ["Wellspring Clinic", "healthcare", ["Appointments"]], ["Vitalis Care", "healthcare", ["Practice"]], ["Serenity Therapy", "healthcare", ["Wellness"]],
    ["Lumen Academy", "education", ["Courses"], "pop"], ["ScholarHub", "education", ["School"]], ["CodeCraft", "education", ["Bootcamp", "Apply"]], ["BrightMinds", "education", ["Tutoring"]],
    ["Vellum Store", "ecommerce", ["Shop", "Purchase"], "feat"], ["Loom & Weave", "ecommerce", ["Fashion"]], ["Peak Supply", "ecommerce", ["Outdoor"], "new"], ["Aura Beauty", "ecommerce", ["Cosmetics"]],
    ["Studio Mono", "portfolio", ["Showcase"], "pop"], ["Frame & Field", "portfolio", ["Photography"]], ["The Maker", "portfolio", ["Designer"]], ["Atelier", "portfolio", ["Creative"]],
    ["Skyline Realty", "realestate", ["Listings", "Lead"], "feat"], ["Haven Homes", "realestate", ["Valuation"]], ["Metro Estates", "realestate", ["Agent"], "new"], ["Terra Property", "realestate", ["Commercial"]],
    ["Sterling Capital", "finance", ["Advisory"], "pop"], ["LedgerPro", "finance", ["Accounting"]], ["Vault Wealth", "finance", ["Planning"]], ["Northbridge", "finance", ["Fintech"]],
    ["Summit Live", "events", ["Conference", "Tickets"], "feat"], ["The Gathering", "events", ["Meetup"]], ["Encore", "events", ["Concert"], "new"], ["Vertex Expo", "events", ["Trade show"]],
    ["Open Hands", "nonprofit", ["Donate"], "pop"], ["GreenRoots", "nonprofit", ["Cause"]], ["Bright Future Fund", "nonprofit", ["Charity"]],
    ["Alex Rivera", "personal", ["Creator"], "new"], ["The Founder", "personal", ["Coach", "Apply"]], ["Mira Chen", "personal", ["Speaker"]],
    ["Inkwell", "blog", ["Editorial"], "pop"], ["The Dispatch", "blog", ["News"]], ["Longform", "blog", ["Magazine"]],
    ["Launchpad", "landing", ["Conversion"], "feat"], ["Spotlight", "landing", ["Promo"]], ["Momentum", "launch", ["Product", "Waitlist"], "pop"],
    ["Insight Board", "dashboard", ["Analytics", "App"], "new"], ["Pulse Admin", "dashboard", ["SaaS UI"]],
    ["Inner Circle", "membership", ["Community"], "feat"], ["The Vault Club", "membership", ["Subscription"]], ["Bookwise", "booking", ["Appointments"], "pop"], ["Reserve", "booking", ["Scheduling"]],
  ];
  let TPL_CACHE = null;
  function studioTemplates() {
    if (TPL_CACHE) return TPL_CACHE;
    TPL_CACHE = TPL_DEFS.map(([name, cat, tags, badge], i) => {
      const m = CAT_META[cat] || {}; return { id: "st" + (i + 1), name, cat, catLabel: m.label || cat, tags: tags || [], badge: badge || "", niche: m.niche || "agency", thm: (m.thm != null ? m.thm : 0) };
    });
    return TPL_CACHE;
  }
  const favTemplates = () => { try { return JSON.parse(localStorage.getItem("aimindshare-tpl-favs") || "[]"); } catch (e) { return []; } };
  const toggleFav = (id) => { const f = favTemplates(); const i = f.indexOf(id); if (i >= 0) f.splice(i, 1); else f.push(id); try { localStorage.setItem("aimindshare-tpl-favs", JSON.stringify(f)); } catch (e) {} return f.includes(id); };
  // Hero prompt history — same localStorage pattern as favTemplates(): capped at 5,
  // most-recent-first, deduped by exact text. Session-local, nothing server-side.
  const HERO_PROMPTS_KEY = "aimindshare-hero-prompts";
  const heroPromptHistory = () => { try { return JSON.parse(localStorage.getItem(HERO_PROMPTS_KEY) || "[]"); } catch (e) { return []; } };
  const pushHeroPrompt = (text) => { const list = heroPromptHistory().filter((p) => p !== text); list.unshift(text); try { localStorage.setItem(HERO_PROMPTS_KEY, JSON.stringify(list.slice(0, 5))); } catch (e) {} };
  // Portfolio favorites/tags — same localStorage pattern again, this time keyed by
  // site id instead of template id. No schema change; local-only, per spec §3.
  const FAV_SITES_KEY = "aimindshare-sites-favs", SITE_TAGS_KEY = "aimindshare-sites-tags";
  const favSites = () => { try { return JSON.parse(localStorage.getItem(FAV_SITES_KEY) || "[]"); } catch (e) { return []; } };
  const toggleFavSite = (id) => { const f = favSites(); const i = f.indexOf(id); if (i >= 0) f.splice(i, 1); else f.push(id); try { localStorage.setItem(FAV_SITES_KEY, JSON.stringify(f)); } catch (e) {} return f.includes(id); };
  const siteTagsMap = () => { try { return JSON.parse(localStorage.getItem(SITE_TAGS_KEY) || "{}"); } catch (e) { return {}; } };
  const siteTagsFor = (id) => siteTagsMap()[id] || [];
  const setSiteTags = (id, tags) => { const m = siteTagsMap(); m[id] = tags; try { localStorage.setItem(SITE_TAGS_KEY, JSON.stringify(m)); } catch (e) {} };
  // Saved views — same localStorage pattern once more; a saved view snapshots the
  // whole toolbar combo (status chip, search, category, needs-attention, tag, sort, layout).
  const SITES_VIEWS_KEY = "aimindshare-sites-views";
  const savedSitesViews = () => { try { return JSON.parse(localStorage.getItem(SITES_VIEWS_KEY) || "[]"); } catch (e) { return []; } };
  const saveSitesView = (name, cfg) => { const list = savedSitesViews(); list.push({ name, ...cfg }); try { localStorage.setItem(SITES_VIEWS_KEY, JSON.stringify(list)); } catch (e) {} };
  function sitesFiltersPopoverHtml() {
    const tb = state.sitesToolbar;
    const nicheItems = NICHE_OPTS.map(([v, l]) => `<div class="pop-item" data-nicheval="${v}">${tb.niche === v ? svg("check", 13) : ""}<span class="pi-name">${esc(l)}</span></div>`).join("");
    return `
      <div class="pop-label">Category</div>
      <div class="pop-item" data-nicheval="">${!tb.niche ? svg("check", 13) : ""}<span class="pi-name">All categories</span></div>
      ${nicheItems}
      <div class="pop-sep"></div>
      <div class="pop-item" data-needsattn-toggle>${tb.needsAttn ? svg("check", 13) : ""}<span class="pi-name">Needs attention only</span></div>
      <div class="pop-sep"></div>
      <div class="pop-label">Tag contains</div>
      <input class="pop-search" id="sitesTagFilterInput" placeholder="e.g. priority — press Enter" value="${esc(tb.tag)}">`;
  }
  function sitesSavedViewsPopoverHtml() {
    const views = savedSitesViews();
    const rows = views.length ? views.map((v, i) => `<div class="pop-item" data-viewidx="${i}"><span class="pi-name">${esc(v.name)}</span></div>`).join("")
      : `<div class="pop-item" style="cursor:default"><span class="pi-sub">No saved views yet</span></div>`;
    return `<div class="pop-item action" data-saveview>${svg("plus", 13)}<span class="pi-name">Save current view…</span></div><div class="pop-sep"></div><div class="pop-label">Saved views</div>${rows}`;
  }

  /* ── Shared studio building blocks ────────────────────────────────────────── */
  const HERO_SUGGESTIONS = ["a dental clinic in Dhaka", "a SaaS landing page", "a real-estate agency", "a restaurant with online menu", "a coaching program", "a fashion storefront"];
  const HERO_SAMPLES = {
    "a dental clinic in Dhaka": "A boutique dental clinic in Dhaka called Crescent Dental — friendly, same-week appointments, online booking and insurance handled for you.",
    "a SaaS landing page": "A B2B SaaS product launch site — feature grid, pricing tiers, social proof and a free-trial signup CTA.",
    "a real-estate agency": "A local real-estate agency — property listings, a free home-valuation CTA, neighbourhood guides and agent bios.",
    "a restaurant with online menu": "A neighbourhood restaurant — seasonal menu, opening hours, photo gallery and table reservations.",
    "a coaching program": "A 1:1 coaching program for founders — program tiers, testimonials and an application form.",
    "a fashion storefront": "A modern fashion storefront — collection highlights, lookbook, bundles and a shop-now checkout.",
  };
  const micSvg = (s = 17) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`;
  // Shared AI composer — renders identically inside the create modal ("cm") and as
  // the page-level Websites hero ("hero"); every id is namespaced by idPrefix so
  // both instances can exist in the DOM at once without colliding.
  function composerHtml(idPrefix) {
    const niches = NICHE_OPTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
    const chips = HERO_SUGGESTIONS.map((s) => `<button class="st-chip" data-suggest="${esc(s)}">${s}</button>`).join("");
    // The hero (page-level) instance only: attach-file, competitor-URL toggle, prompt
    // history. The modal's composer ("cm") stays exactly as Slice 1 left it.
    const isHero = idPrefix === "hero";
    const attachBtn = isHero ? `<button class="cb-btn" data-attach title="Attach a business brief or competitor analysis">${svg("doc", 16)}</button><input type="file" id="heroAttach" accept=".pdf,.doc,.docx,image/*" hidden>` : "";
    const competitorToggle = isHero ? `
      <button class="st-link hero-competitor-toggle" id="heroCompetitorToggle">${svg("link", 12)} Paste a competitor URL instead</button>
      <div class="hero-competitor" id="heroCompetitorBox" hidden>
        <input class="input" id="heroCompetitorUrl" placeholder="https://competitor.com">
        <button class="btn btn-ghost btn-sm" id="heroCompetitorGo">Analyze</button>
      </div>` : "";
    const recentChips = isHero ? `<div class="st-suggest hero-recent" id="heroRecent">${heroPromptHistory().map((p) => `<button class="st-chip" data-recent="${esc(p)}">${esc(p.length > 44 ? p.slice(0, 44) + "…" : p)}</button>`).join("")}</div>` : "";
    return `
      <div class="st-composer" data-composer id="${idPrefix}Composer">
        <textarea id="${idPrefix}Prompt" placeholder="A boutique dental clinic in Dhaka called Crescent Dental — friendly, same-week appointments, online booking…"></textarea>
        <div class="st-comp-bar">
          <button class="cb-btn" data-mic title="Speak your idea">${micSvg(17)}</button>
          ${attachBtn}
          <span class="cb-hint">A detailed paragraph gives the best result</span>
          <span class="spacer"></span>
          <button class="cb-send" id="${idPrefix}Generate">${svg("spark", 16)} Generate website</button>
        </div>
      </div>
      <div class="cm-tuners">
        <select class="gen-select" id="${idPrefix}Niche" title="Business type">${niches}</select>
        <select class="gen-select" id="${idPrefix}Style" title="Visual style"><option value="">Auto style</option><option value="minimal">Minimal</option><option value="bold">Bold</option><option value="elegant">Elegant</option></select>
        <select class="gen-select" id="${idPrefix}Lang" title="Language"><option value="en">English</option><option value="bn">Bengali</option><option value="ar">Arabic</option></select>
      </div>
      ${competitorToggle}
      <div class="st-suggest" id="${idPrefix}Suggest">${chips}</div>
      ${recentChips}`;
  }
  // Wires focus styling, mic, Ctrl/Cmd+Enter submit, suggestion chips and Generate
  // for one composerHtml(idPrefix) instance. onGenerate(desc, niche) runs on submit;
  // it decides what "generate" means for that instance (open+prefill vs. close+create).
  function bindComposer(idPrefix, root, onGenerate) {
    const comp = $(`#${idPrefix}Composer`, root), ta = $(`#${idPrefix}Prompt`, root);
    if (!comp || !ta) return;
    ta.addEventListener("focus", () => comp.classList.add("focus"));
    ta.addEventListener("blur", () => comp.classList.remove("focus"));
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $(`#${idPrefix}Generate`, root).click(); });
    $("[data-mic]", comp)?.addEventListener("click", () => micTo(ta));
    $$("[data-suggest]", root).forEach((b) => b.addEventListener("click", () => { ta.value = HERO_SAMPLES[b.dataset.suggest] || b.dataset.suggest; ta.focus(); }));
    $(`#${idPrefix}Generate`, root).onclick = () => {
      const desc = (ta.value || "").trim();
      if (!desc) { ta.focus(); toast("Describe your business first — one sentence is enough.", "info"); return; }
      onGenerate(desc, $(`#${idPrefix}Niche`, root)?.value || "agency");
    };
  }
  const spark = (arr) => `<div class="k-spark">${(arr && arr.length ? arr : [4, 6, 5, 8, 7, 9, 8]).map((v) => `<i style="height:${Math.max(14, Math.round(v / Math.max(...(arr && arr.length ? arr : [9])) * 100))}%"></i>`).join("")}</div>`;
  function kpiCard(ico, val, unit, label, delta, dir, arr, gold) {
    const dcls = dir === "up" ? "" : dir === "down" ? "down" : "flat";
    return `<div class="st-kpi ${gold ? "k-gold" : ""}"><div class="k-top"><span class="k-ico">${svg(ico, 15)}</span>${delta != null ? `<span class="k-delta ${dcls}">${delta}</span>` : ""}</div>
      <div class="k-val">${val}${unit ? `<span class="u">${unit}</span>` : ""}</div><div class="k-label">${label}</div>${arr !== false ? spark(arr) : ""}</div>`;
  }

  /* ── Screen: Dashboard — studio control center (ops cockpit) ──────────────────
     Overview first, actions second, deep editing third. Not a builder homepage:
     site creation lives in AI Generate / Templates and is demoted here to a single
     "New site" button. Every signal below is derived from the real data model —
     site status, publish state, per-page health categories, domain SSL/DNS logs. */

  // Relative "…ago" label for the ops audit trail (falls back to absolute date).
  function relTime(d) {
    if (!d) return "—";
    const ms = Date.now() - new Date(d).getTime(), day = 864e5;
    if (ms < 0) return fmtDate(d);
    if (ms < 36e5) return Math.max(1, Math.round(ms / 6e4)) + "m ago";
    if (ms < day) return Math.round(ms / 36e5) + "h ago";
    const dd = Math.round(ms / day);
    return dd < 30 ? dd + "d ago" : fmtDate(d);
  }

  // Derive the "what needs action" list from live data. Grouped domain | seo | publish
  // so the KPI strip, Attention panel and Publishing queue all read the same source.
  function attentionItems(sites) {
    const items = [], byId = {}; sites.forEach((s) => byId[s.id] = s);
    const health = state.healthBySite || {}, doms = state.domainsBySite || {};
    const catTitle = { seo: "SEO", schema: "Schema", a11y: "Accessibility", perf: "Performance", links: "Broken links", fields: "Required fields", security: "Security", conversion: "Conversion", content: "Content" };
    const catIco = { seo: "search", schema: "search", a11y: "eye", perf: "gauge", links: "link", fields: "check", security: "gear", conversion: "chart", content: "doc" };
    // Custom-domain SSL not yet issued.
    Object.entries(doms).forEach(([sid, ds]) => (ds || []).forEach((d) => {
      const s = byId[sid]; if (!s) return;
      if (d.ssl_status && d.ssl_status !== "active")
        items.push({ group: "domain", sev: "warn", ico: "link", site: s, title: `SSL pending · ${d.domain}`, detail: "Certificate not yet issued — finish DNS verification to secure the domain.", actLabel: "Domains", nav: "domains" });
    }));
    // Latest DNS verification per domain — surface only if the most recent check failed.
    const src = (state.activity && state.activity.length) ? state.activity : (!connected() ? MOCK.publishLog : []);
    const latestVerify = {};
    src.forEach((l) => { if (l.kind === "domain.verify" && l.detail?.domain && !latestVerify[l.detail.domain]) latestVerify[l.detail.domain] = l; });
    const flaggedDomains = new Set();
    Object.values(latestVerify).forEach((l) => {
      if (l.status === "error") { const s = sites.find((x) => x.primary_domain === l.detail.domain) || null;
        items.push({ group: "domain", sev: "crit", ico: "link", site: s, title: `DNS not found · ${l.detail.domain}`, detail: "Add the CNAME → sites.aimindshare.com plus the TXT record, then re-verify.", actLabel: "Domains", nav: "domains" });
        flaggedDomains.add(l.detail.domain); }
    });
    // Domain expiring soon — skip only if that same domain already has a DNS-failure row above
    // (a real failure makes an expiry warning redundant). Do NOT dedupe against the routine
    // SSL-pending check above — SSL-pending and about-to-lapse are unrelated facts about a
    // domain, and suppressing expiry on that basis would hide real risk.
    Object.entries(doms).forEach(([sid, ds]) => (ds || []).forEach((d) => {
      const s = byId[sid]; if (!s || !d.expires_at || flaggedDomains.has(d.domain)) return;
      const daysLeft = Math.ceil((new Date(d.expires_at).getTime() - Date.now()) / 864e5);
      if (daysLeft > 30) return;
      items.push({ group: "domain", sev: daysLeft <= 7 ? "crit" : "warn", ico: "link", site: s, title: `Domain expires in ${daysLeft}d · ${d.domain}`, detail: "Renew before it lapses to avoid downtime.", actLabel: "Domains", nav: "domains" });
    }));
    // Per-page health categories that aren't passing (SEO, schema, a11y, perf, links, fields).
    Object.entries(health).forEach(([sid, h]) => { const s = byId[sid]; if (!s || !h) return;
      (h.categories || []).forEach((c) => { if (c.status === "pass") return;
        items.push({ group: "seo", sev: c.status === "fail" ? "crit" : "warn", ico: catIco[c.key] || "search", site: s, title: `${catTitle[c.key] || c.key} · ${s.name}`, detail: c.detail || "Needs review.", actLabel: "Fix", gohealth: s.id }); });
    });
    // Pending client review — sent for review, not yet approved or published.
    sites.forEach((s) => {
      if ((state.reviewBySite || {})[s.id] === "review")
        items.push({ group: "review", sev: "info", ico: "check", site: s, title: `Awaiting client review · ${s.name}`, detail: "Sent for review — waiting on client approval before it can go live.", actLabel: "Publish", publish: s.id });
    });
    // Publish backlog: unpublished edits on a live site, a draft never shipped, or stale published content.
    sites.forEach((s) => {
      if (s.status === "published" && s.last_published && new Date(s.updated_at) > new Date(s.last_published))
        items.push({ group: "publish", sev: "warn", ico: "rocket", site: s, title: `Unpublished changes · ${s.name}`, detail: `Edited ${relTime(s.updated_at)} — the live version is older.`, actLabel: "Publish", editsite: s.id });
      else if (s.status !== "published" && !s.last_published)
        items.push({ group: "publish", sev: "info", ico: "doc", site: s, title: `${s.name} is still a draft`, detail: "Never published — review and ship it when ready.", actLabel: "Open", open: s.id });
      else if (s.status === "published") {
        const staleDays = Math.floor((Date.now() - new Date(s.updated_at).getTime()) / 864e5);
        if (staleDays > 90) items.push({ group: "publish", sev: "info", ico: "doc", site: s, title: `Content hasn't changed in ${staleDays}d · ${s.name}`, detail: "No edits in a while — review for freshness.", actLabel: "Review", open: s.id, stale: true });
      }
    });
    // Leads & bookings captured in the last 48h — one rolled-up row per site, not per lead.
    const leadTypeLabel = { form: "form submission", booking: "booking" };
    Object.entries(state.leadsBySite || {}).forEach(([sid, leadList]) => {
      const s = byId[sid]; if (!s) return;
      const cutoff = Date.now() - 48 * 36e5;
      const recent = (leadList || []).filter((l) => new Date(l.created_at).getTime() >= cutoff);
      if (!recent.length) return;
      const counts = {}; recent.forEach((l) => { counts[l.type] = (counts[l.type] || 0) + 1; });
      const parts = Object.entries(counts).map(([type, n]) => `${n} ${leadTypeLabel[type] || type}${n > 1 ? "s" : ""}`);
      items.push({ group: "leads", sev: "info", ico: "users", site: s, title: `${recent.length} new lead${recent.length > 1 ? "s" : ""} · ${s.name}`, detail: parts.join(", "), actLabel: "Review", goanalytics: s.id });
    });
    // AI suggestions — synthetic, lowest-priority tier; dismissed ones are filtered out before ranking.
    const dismissed = state.dismissedSuggestions || {};
    Object.entries(state.suggestionsBySite || {}).forEach(([sid, suggList]) => {
      const s = byId[sid]; if (!s) return;
      (suggList || []).forEach((sg) => {
        if (dismissed[sg.id]) return;
        items.push({ group: "ai", sev: "opp", ico: "spark", site: s, title: sg.title, detail: sg.detail, actLabel: "Open", open: s.id, suggId: sg.id });
      });
    });
    // Rank controls sort order only — no cross-item suppression. A site can and will
    // produce multiple rows across multiple groups (e.g. a crit SSL issue AND an opp
    // AI suggestion both show).
    const rank = { crit: 0, warn: 1, info: 2, opp: 3 };
    items.sort((a, b) => rank[a.sev] - rank[b.sev]);
    return items;
  }

  function actAttr(a) {
    return a.gohealth ? `data-gohealth="${esc(a.gohealth)}"` : a.goanalytics ? `data-goanalytics="${esc(a.goanalytics)}"`
      : a.publish ? `data-publish="${esc(a.publish)}"` : a.editsite ? `data-editsite="${esc(a.editsite)}"`
      : a.open ? `data-open="${esc(a.open)}"` : `data-nav-to="${esc(a.nav)}"`;
  }

  function dashHead(sites) {
    return `<div class="dash-head reveal">
      <div class="dh-l"><span class="st-eyebrow">${svg("grid", 12)} Control center</span>
        <h1>Studio <em>operations</em></h1>
        <p class="dh-lead">What's live, what changed, what's broken, and what needs action today — across ${sites.length} website${sites.length === 1 ? "" : "s"}.</p></div>
      <div class="dh-actions">
        <button class="btn btn-ghost" data-nav-to="publish">${svg("rocket", 14)} Review publishes</button>
        <button class="btn btn-primary" data-qa="gen">${svg("plus", 14)} New site</button>
      </div>
    </div>`;
  }

  // Workspace overview — operational counts, not vanity metrics.
  function dashKpis(sites, items) {
    const pub = sites.filter((s) => s.status === "published").length;
    const drafts = sites.filter((s) => s.status === "draft").length;
    const pend = items.filter((a) => a.group === "publish" && !a.stale).length;
    const dom = items.filter((a) => a.group === "domain").length;
    const seo = items.filter((a) => a.group === "seo").length;
    return `<section class="st-sec reveal">
      <div class="st-sec-head"><div class="sh-l"><h2>Workspace <em>overview</em></h2><p>Operational health across every website in ${esc(state.workspaceName || "this workspace")}.</p></div></div>
      <div class="st-kpis">
        ${kpiCard("globe", sites.length, "", "Total sites", null, "flat", [3, 4, 4, 5, 6, 6, sites.length || 1])}
        ${kpiCard("rocket", pub, "", "Live", sites.length ? pub + "/" + sites.length : null, "up", [1, 1, 2, 2, 2, 2, pub], true)}
        ${kpiCard("doc", drafts, "", "Drafts", null, "flat", false)}
        ${kpiCard("clock", pend, "", "Pending publish", pend ? "queued" : "clear", pend ? "flat" : "up", false)}
        ${kpiCard("link", dom, "", "Domain issues", dom ? "fix" : "clear", dom ? "down" : "up", false)}
        ${kpiCard("search", seo, "", "SEO issues", seo ? "review" : "clear", seo ? "down" : "up", false)}
      </div>
    </section>`;
  }

  // Attention Needed — the section that tells the user what's wrong, not just pretty cards.
  const ATTN_CHIPS = [
    ["all", "All", (a) => true],
    ["seo", "SEO & Health", (a) => a.group === "seo"],
    ["domain", "Domains", (a) => a.group === "domain"],
    ["publish", "Publish & Reviews", (a) => a.group === "publish" || a.group === "review"],
    ["leads", "Leads & Bookings", (a) => a.group === "leads"],
    ["ai", "AI Suggestions", (a) => a.group === "ai"],
  ];
  function attentionRow(a) {
    const dismiss = a.group === "ai" ? `<button class="icon-btn sm attn-dismiss" data-dismiss-sugg="${esc(a.suggId)}" title="Dismiss suggestion">${svg("x", 12)}</button>` : "";
    return `<div class="attn-item ai-${a.sev}" data-agroup="${esc(a.group)}">
      <span class="ai-ico">${svg(a.ico, 15)}</span>
      <div class="ai-main"><b>${esc(a.title)}</b><span>${esc(a.detail)}</span></div>
      <button class="btn btn-ghost btn-sm ai-act" ${actAttr(a)}>${esc(a.actLabel)} ${svg("chev", 12)}</button>
      ${dismiss}
    </div>`;
  }
  function attentionPanel(items) {
    const activeChip = state.attnChip || "all";
    const chips = ATTN_CHIPS.map(([k, l, pred]) => `<button class="dt-chip ${k === activeChip ? "on" : ""}" data-achip="${k}">${l} <span class="dc-n">${items.filter(pred).length}</span></button>`).join("");
    const rows = items.map(attentionRow).join("");
    const clear = `<div class="attn-clear"><span class="ac-ico">${svg("check", 18)}</span><div><b>All clear</b><span>No domain, SEO, publish, review or leads issues need attention right now.</span></div></div>`;
    return `<section class="st-sec reveal"><div class="panel attn">
      <div class="panel-head"><span class="ph-ico ph-alert">${svg("bell", 15)}</span><h3>Attention needed</h3>${items.length ? `<span class="attn-count">${items.length}</span>` : ""}<button class="st-link" data-nav-to="publish" style="margin-left:auto">Publish center ${svg("chev", 12)}</button></div>
      ${items.length ? `<div class="dt-chips attn-chips">${chips}</div>` : ""}
      <div class="attn-list" id="attnList">${items.length ? rows : clear}</div>
    </div></section>`;
  }

  // The center of the dashboard — a strong, filterable sites table (not a create block).
  function dtRow(s, attn) {
    const isCustom = !!s.primary_domain;
    const domain = s.primary_domain || ((s.subdomain || "site") + ".aimindshare.site");
    const pub = s.last_published ? `${s.last_version ? "v" + s.last_version + " · " : ""}${fmtDate(s.last_published)}` : "Never";
    // Archived / Review override the base status pill for display purposes only —
    // mirrors siteCard()'s cardStatus so Grid and List agree on what a site's status reads as.
    const rowStatus = s.archived ? `<span class="pill idle">Archived</span>` : (state.reviewBySite || {})[s.id] === "review" ? `<span class="pill warning">Review</span>` : statusPill(s.status);
    return `<div class="dt-row" data-site="${esc(s.id)}" data-status="${esc(s.status)}" data-attn="${attn ? 1 : 0}" data-name="${esc(s.name.toLowerCase())}" data-archived="${s.archived ? 1 : 0}">
      <span class="dt-site"><span class="sc-favi ${s.style_preset ? "sc-favi-" + esc(s.style_preset) : ""}">${esc(initials(s.name))}</span><span class="dt-id"><b>${esc(s.name)}</b><span class="mono">${esc(s.subdomain || "site")}.aimindshare.site</span></span></span>
      <span class="dt-cell">${rowStatus}${s.maintenance_mode ? ` <span class="pill warning">maint</span>` : ""}</span>
      <span class="dt-cell dt-c">${s.pages}</span>
      <span class="dt-cell dt-dom">${isCustom ? `<span class="pill success">${svg("link", 11)} ${esc(domain)}</span>` : `<span class="pill plain">staging</span>`}</span>
      <span class="dt-cell dt-c">${healthRing(s.health_score, 30)}</span>
      <span class="dt-cell dt-pub">${esc(pub)}</span>
      <span class="dt-cell dt-upd">${esc(relTime(s.updated_at))}</span>
      <span class="dt-cell dt-act">
        <button class="icon-btn sm" data-goseo="${esc(s.id)}" title="SEO &amp; health">${svg("search", 13)}</button>
        <button class="icon-btn sm" data-open="${esc(s.id)}" title="Manage site">${svg("layers", 13)}</button>
        <button class="btn btn-primary btn-sm" data-editsite="${esc(s.id)}">${svg("edit", 12)} Edit</button>
      </span>
    </div>`;
  }
  function sitesTable(sites, attnIds) {
    const live = sites.filter((s) => s.status === "published").length;
    const draft = sites.filter((s) => s.status === "draft").length;
    const chips = [["all", "All", sites.length], ["published", "Live", live], ["draft", "Drafts", draft], ["attn", "Needs action", attnIds.size]]
      .map(([k, l, n], i) => `<button class="dt-chip ${i === 0 ? "on" : ""}" data-dchip="${k}">${l} <span class="dc-n">${n}</span></button>`).join("");
    const head = `<div class="dt-row dt-head"><span>Site</span><span>Status</span><span class="dt-c">Pages</span><span>Domain</span><span class="dt-c">Health</span><span>Last publish</span><span>Updated</span><span class="dt-r">Actions</span></div>`;
    const rows = sites.map((s) => dtRow(s, attnIds.has(s.id))).join("");
    return `<div class="panel dt-panel">
      <div class="dt-toolbar">
        <label class="dt-search">${svg("search", 15)}<input id="dashSearch" placeholder="Filter sites by name…" autocomplete="off"></label>
        <div class="dt-chips">${chips}</div>
      </div>
      <div class="dt" id="dashTable"><div class="dt-inner">${head}${rows}<div class="empty-inline" id="dtEmpty" style="display:none">No sites match this filter.</div></div></div>
    </div>`;
  }

  // Publishing queue — what's ready, pending or unshipped (the actionable publish subset).
  function publishingQueue(items) {
    const q = items.filter((a) => a.group === "publish" && !a.stale);
    const rows = q.length ? q.map((a) => `<div class="ov-row"><span class="ov-favi ${a.site && a.site.style_preset ? "sc-favi-" + esc(a.site.style_preset) : ""}">${esc(initials(a.site ? a.site.name : "?"))}</span>
      <div class="ov-main"><b>${esc(a.site ? a.site.name : "")}</b><span>${esc(a.detail)}</span></div>
      <span class="ov-right"><button class="btn btn-primary btn-sm" ${a.editsite ? `data-editsite="${esc(a.editsite)}"` : `data-open="${esc(a.open)}"`}>${svg("rocket", 12)} ${a.editsite ? "Publish" : "Open"}</button></span></div>`).join("")
      : `<div class="empty-inline">Nothing queued — every site is published and up to date.</div>`;
    return `<div class="panel"><div class="panel-head"><span class="ph-ico">${svg("rocket", 15)}</span><h3>Publishing queue</h3>${q.length ? `<span class="attn-count">${q.length}</span>` : ""}<button class="st-link" data-nav-to="publish" style="margin-left:auto">Open ${svg("chev", 12)}</button></div><div class="ov-list">${rows}</div></div>`;
  }

  // Compact, utility-based quick actions — shortcuts into existing workflows, not a builder.
  function dashQuickActions() {
    const acts = [
      ["New site", "spark", "gen", "Describe it, AI builds it"],
      ["Add a page", "doc", "nav:pages", "Into an existing site"],
      ["Connect domain", "link", "nav:domains", "DNS + auto-SSL"],
      ["Publish changes", "rocket", "nav:publish", "Review & deploy"],
      ["Restore a version", "undo", "nav:publish", "Roll back a publish"],
      ["Add CRM widget", "form", "nav:forms", "Form · calendar · chat"],
    ].map(([t, ic, act, sub]) => {
      const attr = act.startsWith("nav:") ? `data-nav-to="${act.slice(4)}"` : `data-qa="${act}"`;
      return `<button class="qa-line" ${attr}><span class="ql-ico">${svg(ic, 15)}</span><span class="ql-t"><b>${t}</b><span>${sub}</span></span>${svg("chev", 13)}</button>`;
    }).join("");
    return `<div class="panel dash-qa"><div class="panel-head"><span class="ph-ico">${svg("zap", 15)}</span><h3>Quick actions</h3></div><div class="qa-lines">${acts}</div></div>`;
  }

  function viewDashboard() {
    const sites = state.sites || [];
    if (!sites.length) {
      return previewStrip() + `<div class="studio">${dashHead(sites)}
        <div class="panel reveal"><div class="empty-state"><div class="es-ico">${svg("globe", 22)}</div>
          <h3>No websites yet</h3><p>This workspace is empty. Spin up your first AI-built site — it lands here with full publish, domain, SEO and analytics controls.</p>
          <button class="btn btn-primary es-cta" data-qa="gen">${svg("plus", 14)} Create your first site</button></div></div></div>`;
    }
    const items = attentionItems(sites);
    const attnIds = new Set(items.filter((a) => a.sev !== "opp").map((a) => a.site && a.site.id).filter(Boolean));
    return previewStrip() + `<div class="studio">
      ${dashHead(sites)}
      ${dashKpis(sites, items)}
      ${attentionPanel(items)}
      <section class="st-sec reveal">
        <div class="st-sec-head"><div class="sh-l"><h2>All <em>websites</em></h2><p>Sort, filter and jump straight into any site.</p></div><span class="spacer"></span><button class="st-link" data-nav-to="sites">Open websites ${svg("chev", 13)}</button></div>
        ${sitesTable(sites, attnIds)}
      </section>
      <section class="st-cols reveal">
        ${activityPanel()}
        <div class="dash-rail">${publishingQueue(items)}${dashQuickActions()}</div>
      </section>
    </div>`;
  }
  function miniTpl(x) {
    const favs = favTemplates();
    return `<div class="tplc" data-cat="${x.cat}" data-badge="${x.badge}" data-name="${esc((x.name + " " + x.catLabel + " " + x.tags.join(" ")).toLowerCase())}" data-tid="${x.id}" data-niche="${x.niche}" data-tname="${esc(x.name)}">
      <div class="tplc-thumb thm-${x.thm}">
        ${x.badge ? `<div class="tplc-badges"><span class="tplc-badge ${x.badge}">${x.badge === "pop" ? "Popular" : x.badge === "new" ? "New" : "Featured"}</span></div>` : ""}
        <button class="tplc-fav ${favs.includes(x.id) ? "on" : ""}" data-fav="${x.id}" title="Favorite">${svg("star", 15)}</button>
        <div class="tplc-wm"><b>${esc(x.name)}</b><i></i><i></i></div>
        <div class="tplc-over"><button class="btn btn-ghost btn-sm" data-preview-tpl="${x.id}">${svg("play", 13)} Preview</button><button class="btn btn-primary btn-sm" data-use-tpl="${x.id}">${svg("plus", 13)} Use</button></div>
      </div>
      <div class="tplc-body"><span class="tc-name">${esc(x.name)}</span><span class="tc-cat">${esc(x.catLabel)}</span><span class="tc-tags">${x.tags.map((t) => `<span class="tc-tag">${esc(t)}</span>`).join("")}</span></div>
    </div>`;
  }

  /* ── Screen: Template library ─────────────────────────────────────────────── */
  function viewTemplates() {
    const tpls = studioTemplates();
    const counts = {}; tpls.forEach((t) => counts[t.cat] = (counts[t.cat] || 0) + 1);
    const cats = `<div class="ts-cat on" data-cat="all">${svg("layers", 15)} All templates <span class="ts-n">${tpls.length}</span></div>` +
      TPL_CATS.map(([k, label, ico]) => `<div class="ts-cat" data-cat="${k}">${svg(ico, 15)} ${label} <span class="ts-n">${counts[k] || 0}</span></div>`).join("");
    const chips = [["all", "All"], ["pop", "Popular"], ["new", "New"], ["feat", "Featured"], ["fav", "Favorites"]].map(([k, l], i) => `<button class="tpl-fchip ${i === 0 ? "on" : ""}" data-fchip="${k}">${l}</button>`).join("");
    return previewStrip() + `<div class="tpl-lib">
      <aside class="tpl-side">${`<div class="ts-label">Categories</div>` + cats}</aside>
      <div class="tpl-main">
        <div class="tpl-toolbar"><label class="tpl-searchbox">${svg("search", 16)}<input id="tplSearch" placeholder="Search 60+ templates by name, industry or tag…" autocomplete="off"></label></div>
        <div class="tpl-filters">${chips}</div>
        <div class="st-sec-head"><div class="sh-l"><h2>Professional <em>templates</em></h2></div><span class="spacer"></span><span class="tpl-count" id="tplCount">${tpls.length} templates</span></div>
        <div class="tpl-gallery" id="tplGallery">${tpls.map(miniTpl).join("")}</div>
        <div class="empty-inline" id="tplEmpty" style="display:none">No templates match — try another category or search.</div>
      </div>
    </div>`;
  }

  /* ── Screen: Pages (cross-site) ───────────────────────────────────────────── */
  function viewPagesOverview() {
    const sites = state.sites || [];
    if (!sites.length) return previewStrip() + pageHead("Pages", "Every page across your websites.") + emptyPanel("doc", "No pages yet", "Create a website first — its pages will appear here.", "Create a website", "generate");
    const blocks = sites.map((s) => {
      const pages = (state.pagesBySite || {})[s.id] || [];
      const rows = pages.length ? pages.map((p) => `<div class="ov-row"><span class="ov-favi">${p.is_home ? svg("home", 15) : svg("doc", 15)}</span>
        <div class="ov-main"><b>${esc(p.title)}</b><span class="mono">/${esc(p.is_home ? "" : p.slug)}</span></div>
        <span class="ov-right">${statusPill(p.status)}<button class="btn btn-primary btn-sm" data-editpage="${esc(s.id)}:${esc(p.id)}">${svg("edit", 13)} Edit</button></span></div>`).join("")
        : `<div class="ov-row"><div class="ov-main"><span class="muted">${s.pages || 0} page${s.pages === 1 ? "" : "s"} — open the site to manage them.</span></div><span class="ov-right"><button class="btn btn-ghost btn-sm" data-open="${esc(s.id)}">Open site</button></span></div>`;
      return `<div class="panel"><div class="panel-head"><span class="ph-ico">${svg("globe", 15)}</span><h3>${esc(s.name)}</h3><span class="pill plain" style="margin-left:8px">${s.pages || pages.length} pages</span><button class="st-link" data-open="${esc(s.id)}" style="margin-left:auto">Manage ${svg("chev", 12)}</button></div><div class="ov-list">${rows}</div></div>`;
    }).join("");
    return previewStrip() + pageHead("Pages", "Every page across your websites — jump straight into the editor.") + `<div class="studio">${blocks}</div>`;
  }

  /* ── Screen: SEO (cross-site) ─────────────────────────────────────────────── */
  function viewSeoOverview() {
    const sites = state.sites || [];
    const healths = sites.map((s) => s.health_score).filter((n) => n != null);
    const avg = healths.length ? Math.round(healths.reduce((a, b) => a + b, 0) / healths.length) : null;
    const kp = `<div class="st-kpis" style="grid-template-columns:repeat(4,1fr)">
      ${kpiCard("gauge", avg != null ? avg : "—", "", "Avg SEO health", null, "flat", false)}
      ${kpiCard("check", sites.filter((s) => (s.health_score || 0) >= 85).length, "", "Ready to rank", null, "flat", false)}
      ${kpiCard("search", "auto", "", "Meta & schema", null, "flat", false)}
      ${kpiCard("spark", "on", "", "GEO / llms.txt", null, "flat", false, true)}</div>`;
    const rows = sites.map((s) => `<div class="ov-row"><span class="ov-favi ${s.style_preset ? "sc-favi-" + esc(s.style_preset) : ""}">${esc(initials(s.name))}</span>
      <div class="ov-main"><b>${esc(s.name)}</b><span>${s.pages || 0} pages · ${esc(s.primary_domain || s.subdomain + ".aimindshare.site")}</span></div>
      <span class="ov-right">${healthRing(s.health_score)}<button class="btn btn-ghost btn-sm" data-goseo="${esc(s.id)}">Open SEO</button></span></div>`).join("");
    return previewStrip() + pageHead("SEO", "Search & generative-engine optimization across every site — titles, meta, JSON-LD, sitemaps and llms.txt, generated on every publish.")
      + `<div class="studio">${kp}<div class="panel"><div class="panel-head"><span class="ph-ico">${svg("search", 15)}</span><h3>SEO by site</h3></div><div class="ov-list">${rows || emptyInline("No sites yet.")}</div></div>${seoTechPanel()}</div>`;
  }
  function seoTechPanel() {
    const rows = [["sitemap.xml", "Every published page"], ["robots.txt", "Allow-all + sitemap"], ["llms.txt", "AI-search business summary"], ["JSON-LD schema", "LocalBusiness / Service / FAQ / Product"], ["Internal linking", "Service ↔ location ↔ home"], ["OpenGraph / Twitter", "Cards from page meta"]]
      .map(([n, d]) => `<div class="st-row"><div class="st-main"><b class="mono">${n}</b><span class="muted">${d}</span></div><span class="pill success">auto</span></div>`).join("");
    return `<div class="panel"><div class="panel-head"><span class="ph-ico">${svg("spark", 15)}</span><h3>Technical SEO &amp; GEO — automatic</h3></div><div class="seo-tech">${rows}</div></div>`;
  }

  /* ── Screen: Domains (cross-site) ─────────────────────────────────────────── */
  function viewDomainsOverview() {
    const sites = state.sites || [];
    const all = Object.entries(state.domainsBySite || {}).flatMap(([sid, ds]) => (ds || []).map((d) => ({ ...d, site: sites.find((s) => s.id === sid) })));
    const domRows = all.length ? all.map((d) => `<div class="ov-row"><span class="ov-favi">${svg("link", 15)}</span>
      <div class="ov-main"><b>${esc(d.domain)}</b><span>${esc(d.site?.name || "")}${d.is_primary ? " · primary" : ""}</span></div>
      <span class="ov-right"><span class="pill ${d.status === "active" ? "success" : "warning"}">${d.status}</span><span class="pill ${d.ssl_status === "active" ? "success" : "plain"}">SSL: ${d.ssl_status}</span></span></div>`).join("")
      : emptyInline("No custom domains connected yet.");
    const subRows = sites.map((s) => `<div class="ov-row"><span class="ov-favi ${s.style_preset ? "sc-favi-" + esc(s.style_preset) : ""}">${esc(initials(s.name))}</span>
      <div class="ov-main"><b>${esc(s.name)}</b><span class="mono">${esc(s.subdomain || "site")}.aimindshare.site</span></div>
      <span class="ov-right"><button class="btn btn-ghost btn-sm" data-open="${esc(s.id)}">Connect domain</button></span></div>`).join("");
    return previewStrip() + pageHead("Domains", "Connect custom domains with automatic DNS verification and SSL. Every site also gets an always-on staging subdomain.")
      + `<div class="studio">
        <div class="panel"><div class="panel-head"><span class="ph-ico">${svg("link", 15)}</span><h3>Custom domains</h3></div><div class="ov-list">${domRows}</div>
          <div class="hint-card" style="margin:14px 0 0">${svg("globe", 15)}<div><b>How it works.</b> Add a domain on a site, point a <span class="mono">CNAME</span> → <span class="mono">sites.aimindshare.com</span> plus a <span class="mono">TXT</span> record, and we verify DNS and issue SSL automatically.</div></div></div>
        <div class="panel"><div class="panel-head"><span class="ph-ico">${svg("globe", 15)}</span><h3>Staging subdomains</h3></div><div class="ov-list">${subRows || emptyInline("No sites yet.")}</div></div>
      </div>`;
  }

  /* ── Screen: Publish center ───────────────────────────────────────────────── */
  function viewPublishCenter() {
    const sites = state.sites || [];
    const rows = sites.map((s) => `<div class="ov-row"><span class="ov-favi ${s.style_preset ? "sc-favi-" + esc(s.style_preset) : ""}">${esc(initials(s.name))}</span>
      <div class="ov-main"><b>${esc(s.name)}</b><span>${s.last_published ? "v" + (s.last_version || "?") + " · published " + fmtDate(s.last_published) : "never published"}</span></div>
      <span class="ov-right">${statusPill(s.status)}<button class="btn btn-primary btn-sm" data-editsite="${esc(s.id)}">${svg("rocket", 13)} Open</button></span></div>`).join("");
    const PIPE = [["Brief", "done"], ["AI structure", "done"], ["Design", "done"], ["Content", "active"], ["Forms", ""], ["SEO", ""], ["Domain", ""], ["Publish", ""], ["Optimize", ""]];
    const pipeIco = { Brief: "doc", "AI structure": "spark", Design: "palette", Content: "type", Forms: "form", SEO: "search", Domain: "link", Publish: "rocket", Optimize: "gauge" };
    const pipe = PIPE.map(([label, st], i) => `<div class="pipe-node ${st}"><span class="pn-dot">${svg(pipeIco[label] || "check", 16)}</span><span class="pn-label">${label}</span><span class="pn-step">0${i + 1}</span></div>`).join("");
    return previewStrip() + pageHead("Publish", "Staging previews, one-click publish, version history and rollback — every publish runs the pre-flight quality gate first.")
      + `<div class="studio"><div class="panel st-pipe"><div class="pipe-track">${pipe}</div></div>
        <div class="st-cols"><div class="panel"><div class="panel-head"><span class="ph-ico">${svg("rocket", 15)}</span><h3>Sites &amp; status</h3></div><div class="ov-list">${rows || emptyInline("No sites yet.")}</div></div>${activityPanel()}</div></div>`;
  }

  /* ── Screen: Analytics (cross-site) ───────────────────────────────────────── */
  function viewAnalyticsOverview() {
    const sites = state.sites || [];
    const sessions = state.sessions7 != null ? state.sessions7 : sites.reduce((n, s) => n + (s.sessions_7d || 0), 0);
    const live = sites.filter((s) => s.status === "published").length;
    const kp = `<div class="st-kpis" style="grid-template-columns:repeat(3,1fr)">
      ${kpiCard("chart", sessions, "", "Sessions · 7d", "+18%", "up", [22, 31, 28, 44, 39, 52, 52])}
      ${kpiCard("globe", live, "", "Live sites", null, "flat", false)}
      ${kpiCard("users", (MOCK.analytics.identified || 0), "", "Identified contacts", null, "flat", false, true)}</div>`;
    const rows = sites.map((s) => {
      const t = s.traffic || [];
      const sp = t.length ? `<span class="spark">${t.map((v) => `<i style="height:${Math.max(12, Math.round(v / Math.max(...t) * 100))}%"></i>`).join("")}</span>` : `<span class="spark spark-empty">no traffic</span>`;
      return `<div class="ov-row"><span class="ov-favi ${s.style_preset ? "sc-favi-" + esc(s.style_preset) : ""}">${esc(initials(s.name))}</span>
        <div class="ov-main"><b>${esc(s.name)}</b><span>${s.sessions_7d || 0} sessions · 7d</span></div>
        <span class="ov-right">${sp}<button class="btn btn-ghost btn-sm" data-goanalytics="${esc(s.id)}">Details</button></span></div>`;
    }).join("");
    return previewStrip() + pageHead("Analytics", "Privacy-first traffic and conversion analytics, computed on read from your visitor sessions — no third-party pixel required.")
      + `<div class="studio">${kp}<div class="panel"><div class="panel-head"><span class="ph-ico">${svg("chart", 15)}</span><h3>Traffic by site</h3></div><div class="ov-list">${rows || emptyInline("No sites yet.")}</div></div></div>`;
  }

  /* ── Screen: Settings (module) ────────────────────────────────────────────── */
  function viewSettings() {
    return previewStrip() + pageHead("Settings", "Studio defaults applied to every new website in this workspace.")
      + `<div class="studio">
        <div class="panel"><div class="panel-head"><span class="ph-ico">${svg("palette", 15)}</span><h3>Default brand &amp; style</h3></div>
          <div class="form-grid">
            ${field("Default style preset", "seDefPreset", "Elegant")}
            ${field("Default language", "seDefLang", "English")}
            ${field("Brand color", "seDefColor", "Teal (design system)")}
            ${field("Heading font", "seDefFont", "Cormorant Garamond")}
          </div><div class="panel-foot"><button class="btn btn-primary btn-sm" id="seSave">Save defaults</button></div></div>
        <div class="panel"><div class="panel-head"><span class="ph-ico">${svg("gear", 15)}</span><h3>Generation &amp; publishing</h3></div>
          <div class="dz-row"><div><b>Pre-publish quality gate</b><p class="muted">Run SEO, schema, accessibility and link checks before every publish.</p></div><span class="pill success">on</span></div>
          <div class="dz-row"><div><b>Auto SEO &amp; schema</b><p class="muted">Generate titles, meta, JSON-LD, sitemap and llms.txt on publish.</p></div><span class="pill success">on</span></div>
          <div class="dz-row"><div><b>Business Profile first</b><p class="muted">Reuse one structured profile across generation, copy and schema.</p></div><span class="pill success">on</span></div>
        </div>
        <div class="panel"><div class="panel-head"><span class="ph-ico">${svg("globe", 15)}</span><h3>Data &amp; connection</h3></div>
          <div class="dz-row"><div><b>Supabase project</b><p class="muted">${connected() ? "Connected — sites, pages and domains are live." : "Not connected — running on sample data (mockup mode)."}</p></div><button class="btn btn-ghost btn-sm" id="seConnect">${connected() ? "Reconnect" : "Connect"}</button></div>
        </div>
      </div>`;
  }

  /* ── Screen: capability placeholders (Components/Sections/Assets/Forms/Blog) ─ */
  const CAP = {
    components: { ico: "puzzle", title: "Components", lead: "Reusable, on-brand building blocks — buttons, cards, navbars, CTAs and CRM widgets — that stay consistent across every page and update everywhere at once.",
      feats: [["puzzle", "Reusable blocks", "Drop in headers, footers, pricing tables and forms."], ["palette", "On-brand by default", "Every component inherits your brand kit tokens."], ["form", "CRM widgets", "Forms, calendars and chat that wire to your CRM."], ["layers", "Symbol overrides", "Edit once, update every instance."]], cta: "editor", ctaLabel: "Open the visual editor" },
    sections: { ico: "rows", title: "Sections", lead: "Full, pre-designed page sections — heroes, feature grids, testimonials, FAQs and footers — that you can generate, swap and restyle in a click.",
      feats: [["rows", "Section library", "Hero, features, pricing, FAQ, contact and more."], ["spark", "AI-generated", "Ask AI for a new section and drop it in."], ["type", "Editable copy", "Rewrite any section inline or with AI."], ["monitor", "Responsive", "Every section adapts to desktop, tablet and mobile."]], cta: "editor", ctaLabel: "Open the visual editor" },
    assets: { ico: "image", title: "Assets", lead: "Every image, logo, video and document your sites use — organized, optimized and reusable across all your websites from one library.",
      feats: [["image", "Media library", "Upload once, reuse across every site."], ["gauge", "Auto-optimized", "Served at the right size for fast loads."], ["layers", "Organized", "Folders, tags and search."], ["globe", "CDN-delivered", "Fast, global asset delivery."]], cta: "href", href: "m06-media-library.html", ctaLabel: "Open Media Library" },
    forms: { ico: "form", title: "Forms", lead: "Capture leads and bookings with drag-and-drop forms and surveys that feed straight into your CRM — embed them on any page in seconds.",
      feats: [["form", "Drag-and-drop", "Build forms without code."], ["puzzle", "Conditional logic", "Show fields based on answers."], ["users", "CRM capture", "Every submission becomes a contact."], ["spark", "Spam protection", "Turnstile-ready, honeypots built in."]], cta: "href", href: "m15-forms-and-surveys.html", ctaLabel: "Open Forms & Surveys" },
    blog: { ico: "book", title: "Blog", lead: "Publish articles and a structured blog with AI drafting, scheduling and SEO built in — perfect for content that ranks and feeds your funnels.",
      feats: [["book", "Structured CMS", "Posts, categories and authors."], ["spark", "AI drafting", "Generate and refine posts fast."], ["clock", "Scheduling & RSS", "Queue posts and syndicate."], ["search", "SEO-ready", "Meta, schema and internal links per post."]], cta: "href", href: "m22-manual-content-cms.html", ctaLabel: "Open Content & Blog" },
  };
  function viewCapability(key) {
    const c = CAP[key]; if (!c) return viewDashboard();
    const feats = c.feats.map(([ico, h, p]) => `<div class="ph-feat"><span class="pf-ico">${svg(ico, 17)}</span><h3>${h}</h3><p>${p}</p></div>`).join("");
    const cta = c.cta === "href"
      ? `<a class="btn btn-primary" href="${c.href}">${svg("ext", 14)} ${c.ctaLabel}</a><button class="btn btn-ghost" data-qa="gen">${svg("spark", 14)} Generate a site instead</button>`
      : `<button class="btn btn-primary" data-cap-editor>${svg("edit", 14)} ${c.ctaLabel}</button><button class="btn btn-ghost" data-nav-to="templates">${svg("layers", 14)} Browse templates</button>`;
    return previewStrip() + `<div class="ph">
      <section class="ph-hero reveal"><span class="ph-ico">${svg(c.ico, 24)}</span><h1>${c.title}</h1><p>${c.lead}</p><div class="ph-actions">${cta}</div></section>
      <section class="st-sec reveal"><div class="ph-feats">${feats}</div></section>
    </div>`;
  }

  /* ── Small shared helpers ─────────────────────────────────────────────────── */
  function emptyInline(msg) { return `<div class="empty-inline">${esc(msg)}</div>`; }
  function emptyPanel(ico, h, p, cta, navTo) {
    return `<div class="panel reveal"><div class="empty-state"><div class="es-ico">${svg(ico, 22)}</div><h3>${esc(h)}</h3><p>${esc(p)}</p>${cta ? `<button class="btn btn-primary es-cta" data-nav-to="${navTo}">${esc(cta)}</button>` : ""}</div></div>`;
  }

  /* ── Studio create flows ──────────────────────────────────────────────────── */
  function openRecent() {
    const s = (state.sites || [])[0]; if (!s) { openCreateModal("ai"); return; }
    (async () => { const d = await loadSite(s.id); const home = (d.pages || []).find((p) => p.is_home) || d.pages[0]; if (home) location.hash = `#/sites/${s.id}/edit/${home.id}`; else location.hash = "#/sites/" + s.id; })();
  }
  function previewTemplateModal(id) {
    const t = studioTemplates().find((x) => x.id === id); if (!t) return;
    const m = el("div", "modal-card tpl-preview-card", `
      <div class="modal-head"><h3>${svg("eye", 18)} ${esc(t.name)} · live preview</h3><button class="icon-btn" data-close>${svg("x", 16)}</button></div>
      <div class="tpl-preview-note"><span class="pill plain">${esc(t.catLabel)}</span> <span class="muted">Generated live from the ${esc(t.catLabel)} starter — this is real output you can edit.</span></div>
      <iframe class="tpl-preview-frame" title="Template preview"></iframe>
      <div class="modal-foot"><button class="btn btn-ghost btn-sm" data-close>Close</button><button class="btn btn-primary btn-sm" id="tpUse">${svg("plus", 13)} Use this template</button></div>`);
    openModal(m);
    const frame = m.querySelector("iframe");
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui,Segoe UI,Roboto,sans-serif}</style></head><body><div style="display:grid;place-items:center;height:100vh;color:#889;font-family:system-ui">Building preview…</div></body></html>`;
    (async () => {
      const B = await loadBuilder();
      if (!B) { frame.srcdoc = `<div style="padding:40px;font-family:system-ui;color:#667">Preview engine unavailable offline.</div>`; return; }
      try {
        const { html, css } = B.sectionsToHtml(B.generateFromNiche(t.name, t.niche));
        frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#0F2A2C}${css}</style></head><body>${html}</body></html>`;
      } catch (e) { frame.srcdoc = `<div style="padding:40px;font-family:system-ui;color:#667">Couldn't build this preview.</div>`; }
    })();
    $("#tpUse", m).onclick = () => { closeModal(); createSiteFromAI(t.name, t.niche); };
  }
  async function createSiteFromHtml(name, html) {
    const sub = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "site-" + Math.random().toString(36).slice(2, 6);
    if (!connected()) {
      const id = "mock-" + Math.random().toString(36).slice(2, 6);
      state.sites.unshift({ id, name, subdomain: sub, status: "draft", pages: 1, primary_domain: null, updated_at: new Date().toISOString(), preview_token: "amspt" + Math.random().toString(36).slice(2, 10), sessions_7d: 0, traffic: [] });
      state.pagesBySite[id] = [{ id: id + "-home", title: "Home", slug: "home", is_home: true, status: "draft", render_html: html, render_css: "" }];
      toast("Imported into a new site (mockup). Opening the editor…", "success");
      location.hash = `#/sites/${id}/edit/${id}-home`; return;
    }
    const c = ensureClient();
    try {
      const { data: site, error } = await c.from("sites").insert({ workspace_id: state.workspaceId, name, subdomain: sub }).select().single();
      if (error) throw error;
      const { data: page, error: pErr } = await c.from("pages").insert({ workspace_id: state.workspaceId, site_id: site.id, title: "Home", slug: "home", is_home: true, render_html: html, render_css: "" }).select().single();
      if (pErr) throw pErr;
      toast("Imported. Opening the editor…", "success"); detailCache = null; location.hash = `#/sites/${site.id}/edit/${page.id}`;
    } catch (e) { toast(e.message || "Could not import the site", "danger"); }
  }
  // Quick-action dispatcher — all creation verbs open the one create modal.
  function studioAction(act) {
    if (act === "gen" || act === "generate" || act === "ai") openCreateModal("ai");
    else if (act === "blank") openCreateModal("blank");
    else if (act === "templates") location.hash = "#/templates";
    else if (act === "import") openCreateModal("import");
    else if (act === "clone") openCreateModal("clone");
    else if (act === "recent") openRecent();
  }

  /* ── Studio binders ───────────────────────────────────────────────────────── */
  function micTo(ta) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast("Speech recognition isn't supported in this browser.", "info"); return; }
    const rec = new SR(); rec.onresult = (ev) => { if (ta) ta.value = ev.results[0][0].transcript; toast("Transcribed — review and generate.", "success"); }; rec.start(); toast("Listening…", "info");
  }
  function bindNavTo(root) {
    root = root || document;
    $$("[data-nav-to]", root).forEach((b) => b.addEventListener("click", () => { location.hash = "#/" + b.dataset.navTo; }));
    $$("[data-qa]", root).forEach((b) => b.addEventListener("click", () => studioAction(b.dataset.qa)));
  }
  // Small shared dropdown primitive (reuses the existing `.pop`/`.pop-item` classes
  // already defined in components.css) — the "⋯ More" card menu here, and a later
  // task's toolbar Filters/Sort/Saved-views menus, all open through this one helper.
  function closePop() { $$(".pop.open").forEach((p) => p.remove()); document.removeEventListener("click", popOutside, true); }
  function popOutside(e) { if (!e.target.closest(".pop")) closePop(); }
  function openPop(anchor, html) {
    closePop();
    const p = el("div", "pop open", html);
    document.body.appendChild(p);
    const r = anchor.getBoundingClientRect();
    const pw = p.offsetWidth || 240;
    const left = Math.max(8, Math.min(r.right + window.scrollX - pw, window.scrollX + document.documentElement.clientWidth - pw - 8));
    p.style.top = (r.bottom + 6 + window.scrollY) + "px";
    p.style.left = left + "px";
    setTimeout(() => document.addEventListener("click", popOutside, true), 0);
    return p;
  }
  // Details drawer — a per-site deep-dive. Built and torn down dynamically (append/
  // remove from document.body) rather than a persistent mounted root like Copilot,
  // since its content differs per site on every open.
  const DD_BUCKETS = [
    ["content", "Content"], ["seo", "SEO"], ["schema", "Design"],
    ["a11y", "Accessibility"], ["fields", "QA"], ["links", "Publishing"],
  ];
  const DD_PROGRESS = { pass: 100, warn: 60, fail: 20, na: 20 };
  function detailsDrawerBody(site) {
    const h = (state.healthBySite || {})[site.id] || { categories: [] };
    const cats = h.categories || [];
    const catByKey = {}; cats.forEach((c) => catByKey[c.key] = c);
    const catIco = { seo: "search", schema: "layers", a11y: "eye", perf: "gauge", links: "link", fields: "check", security: "gear", conversion: "chart", content: "doc" };
    const healthRows = cats.map((c) => `<div class="pf-row"><span class="pf-ico pf-${c.status}">${svg(catIco[c.key] || "doc", 12)}</span><div class="pf-main"><b>${esc(c.label)}</b><span>${esc(c.detail)}</span></div><span class="pill ${c.status === "pass" ? "success" : c.status === "fail" ? "danger" : "warning"}">${c.status}</span></div>`).join("") || `<div class="empty-inline">No health report yet.</div>`;
    const bars = DD_BUCKETS.map(([key, label]) => { const c = catByKey[key]; const pct = c ? (DD_PROGRESS[c.status] ?? 20) : 20;
      return `<div class="opt-row"><div class="o-main"><b>${label}</b><div class="o-track"><i class="${pct >= 85 ? "" : pct >= 55 ? "warn" : "bad"}" style="width:${pct}%"></i></div></div><span class="o-val">${pct}%</span></div>`; }).join("");
    const overall = Math.round(DD_BUCKETS.reduce((sum, [key]) => { const c = catByKey[key]; return sum + (c ? (DD_PROGRESS[c.status] ?? 20) : 20); }, 0) / DD_BUCKETS.length);
    const leadsAll = (state.leadsBySite || {})[site.id] || [];
    const forms = leadsAll.filter((l) => l.type === "form").length;
    const bookings = leadsAll.filter((l) => l.type === "booking").length;
    const sessions = site.sessions_7d || 0;
    const convRate = sessions ? ((leadsAll.length / sessions) * 100).toFixed(1) + "%" : "—";
    const uniqueVisitors = Math.round(sessions * 0.7);
    const m = (state.metricsBySite || {})[site.id] || { revenue: 0, bounce_rate: 0, cwv: { lcp: 0, cls: 0, inp: 0 } };
    const dom = (state.domainsBySite || {})[site.id] || [];
    const ssl = dom[0] ? dom[0].ssl_status : "—";
    const env = site.status === "published" ? "Production" : site.status === "draft" ? "Development" : "Staging";
    const build = (site.last_version || 0) * 10;
    const insights = attentionItems([site]);
    const insightRows = insights.length ? insights.map((a) => `<div class="attn-item ai-${a.sev}"><span class="ai-ico">${svg(a.ico, 15)}</span><div class="ai-main"><b>${esc(a.title)}</b><span>${esc(a.detail)}</span></div></div>`).join("")
      : `<div class="attn-clear"><span class="ac-ico">${svg("check", 18)}</span><div><b>All clear</b><span>No issues need attention on this site.</span></div></div>`;
    // publishLog entries aren't per-site in the mock dataset (only domain-verify rows
    // carry a domain); entries without a domain marker are shown for every site, same
    // as the existing global activityPanel() already does.
    const timeline = (MOCK.publishLog || []).filter((l) => !l.detail?.domain || l.detail.domain === site.primary_domain);
    const timelineRows = timeline.length ? timeline.map((l) => `<div class="ov-row"><span class="ov-favi">${svg(l.status === "ok" ? "check" : "x", 14)}</span><div class="ov-main"><b class="mono">${esc(l.kind)}</b><span>${esc(l.detail?.slug ? "/" + l.detail.slug : l.detail?.domain || "")}</span></div><span class="ov-right">${fmtDate(l.created_at)}</span></div>`).join("")
      : emptyInline("No activity yet.");
    return `
      <div class="dd-section"><div class="dd-h">Full health breakdown</div><div class="pf-list">${healthRows}</div></div>
      <div class="dd-section"><div class="dd-h">Progress <span class="pill plain" style="margin-left:8px">${overall}% overall</span></div><div class="opt-list">${bars}</div></div>
      <div class="dd-section"><div class="dd-h">Business metrics</div>
        <div class="ov-stats" style="grid-template-columns:repeat(3,1fr)">
          <div class="ov-stat"><span class="ovs-ico">${svg("users", 15)}</span><div class="ovs-t"><b>${leadsAll.length}</b><span>Leads</span></div></div>
          <div class="ov-stat"><span class="ovs-ico">${svg("form", 15)}</span><div class="ovs-t"><b>${forms}</b><span>Forms submitted</span></div></div>
          <div class="ov-stat"><span class="ovs-ico">${svg("clock", 15)}</span><div class="ovs-t"><b>${bookings}</b><span>Bookings</span></div></div>
          <div class="ov-stat"><span class="ovs-ico">${svg("gauge", 15)}</span><div class="ovs-t"><b>${convRate}</b><span>Conversion rate</span></div></div>
          <div class="ov-stat"><span class="ovs-ico">${svg("eye", 15)}</span><div class="ovs-t"><b>${uniqueVisitors}</b><span>Unique visitors (est.)</span></div></div>
          <div class="ov-stat"><span class="ovs-ico">${svg("chart", 15)}</span><div class="ovs-t"><b>$${m.revenue.toLocaleString()}</b><span>Revenue (mock)</span></div></div>
          <div class="ov-stat"><span class="ovs-ico">${svg("gauge", 15)}</span><div class="ovs-t"><b>${m.bounce_rate}%</b><span>Bounce rate (mock)</span></div></div>
          <div class="ov-stat"><span class="ovs-ico">${svg("rocket", 15)}</span><div class="ovs-t"><b>${m.cwv.lcp}s / ${m.cwv.cls} / ${m.cwv.inp}ms</b><span>LCP / CLS / INP (mock)</span></div></div>
        </div>
      </div>
      <div class="dd-section"><div class="dd-h">AI insights</div><div class="attn-list" style="max-height:none">${insightRows}</div></div>
      <div class="dd-section"><div class="dd-h">Activity timeline</div><div class="ov-list">${timelineRows}</div></div>
      <div class="dd-section"><div class="dd-h">Environment</div>
        <div class="ov-stats" style="grid-template-columns:repeat(3,1fr)">
          <div class="ov-stat"><span class="ovs-ico">${svg("link", 15)}</span><div class="ovs-t"><b>${esc(ssl)}</b><span>SSL status</span></div></div>
          <div class="ov-stat"><span class="ovs-ico">${svg("globe", 15)}</span><div class="ovs-t"><b>${esc(env)}</b><span>Environment</span></div></div>
          <div class="ov-stat"><span class="ovs-ico">${svg("layers", 15)}</span><div class="ovs-t"><b>${build}</b><span>Build number</span></div></div>
        </div>
      </div>`;
  }
  function closeDetailsDrawer() {
    const scrim = $(".dd-scrim"), panel = $(".dd-panel");
    if (!scrim && !panel) return;
    scrim?.classList.remove("open");
    panel?.classList.remove("open");
    setTimeout(() => { scrim?.remove(); panel?.remove(); }, 340);
  }
  function openDetailsDrawer(siteId) {
    const site = (state.sites || []).find((s) => s.id === siteId); if (!site) return;
    closeDetailsDrawer();
    const scrim = el("div", "dd-scrim");
    const panel = el("aside", "dd-panel", `
      <header class="dd-head"><span class="sc-favi ${site.style_preset ? "sc-favi-" + esc(site.style_preset) : ""}">${esc(initials(site.name))}</span>
        <div class="dd-title"><b>${esc(site.name)}</b><span>${esc(site.client_name || site.name)}</span></div>
        <button class="icon-btn" id="ddClose" aria-label="Close details">${svg("x", 16)}</button></header>
      <div class="dd-body">${detailsDrawerBody(site)}</div>`);
    document.body.appendChild(scrim); document.body.appendChild(panel);
    requestAnimationFrame(() => { scrim.classList.add("open"); panel.classList.add("open"); });
    scrim.addEventListener("click", closeDetailsDrawer);
    $("#ddClose", panel).addEventListener("click", closeDetailsDrawer);
  }
  // The card's consolidated quick-actions menu — everything that used to be its own
  // icon button except Preview and Publish (kept visible on the card in Task 10).
  function siteMoreMenu() {
    const items = [
      ["details", "eye", "Details"],
      ["seo", "search", "SEO defaults & schema"],
      ["analytics", "chart", "Analytics"],
      ["share", "link", "Copy share link"],
      ["clone", "copy", "Clone this site"],
      ["versions", "clock", "Version history"],
      ["settings", "gear", "Settings"],
    ];
    return items.map(([act, ico, label]) => `<div class="pop-item" data-moreact="${act}">${svg(ico, 15)}<span class="pi-name">${label}</span></div>`).join("");
  }
  function bindSiteCardActions() {
    $$(".site-card").forEach((c) => c.addEventListener("click", (e) => { if (e.target.closest("button, input")) return; state.tab = "overview"; location.hash = "#/sites/" + c.dataset.site; }));
    $$("[data-open]").forEach((b) => b.addEventListener("click", () => { state.tab = "overview"; location.hash = "#/sites/" + b.dataset.open; }));
    $$("[data-editsite]").forEach((b) => b.addEventListener("click", async () => { const id = b.dataset.editsite; const d = await loadSite(id); const home = (d.pages || []).find((p) => p.is_home) || d.pages[0]; if (home) location.hash = `#/sites/${id}/edit/${home.id}`; else location.hash = "#/sites/" + id; }));
    $$("[data-editpage]").forEach((b) => b.addEventListener("click", () => { const [s, p] = b.dataset.editpage.split(":"); location.hash = `#/sites/${s}/edit/${p}`; }));
    $$("[data-goseo]").forEach((b) => b.addEventListener("click", () => { state.tab = "seo"; location.hash = "#/sites/" + b.dataset.goseo; }));
    $$("[data-goanalytics]").forEach((b) => b.addEventListener("click", () => { state.tab = "analytics"; location.hash = "#/sites/" + b.dataset.goanalytics; }));
    $$("[data-gohealth]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); state.tab = "health"; location.hash = "#/sites/" + b.dataset.gohealth; }));
    $$("[data-publish]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); state.tab = "publish"; location.hash = "#/sites/" + b.dataset.publish; }));
    $$("[data-more]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = b.dataset.more, shareUrl = b.dataset.share;
      const pop = openPop(b, siteMoreMenu());
      $$("[data-moreact]", pop).forEach((it) => it.addEventListener("click", () => {
        closePop();
        const act = it.dataset.moreact;
        if (act === "details") openDetailsDrawer(id);
        else if (act === "seo") { state.tab = "seo"; location.hash = "#/sites/" + id; }
        else if (act === "analytics") { state.tab = "analytics"; location.hash = "#/sites/" + id; }
        else if (act === "share") { try { navigator.clipboard.writeText(shareUrl); toast("Copied.", "success"); } catch (er) {} }
        else if (act === "clone") toast("Cloning duplicates this site as a new draft — runs with the AI provider, flagged, not faked.", "info");
        else if (act === "versions") { state.tab = "publish"; location.hash = "#/sites/" + id; }
        else if (act === "settings") { state.tab = "settings"; location.hash = "#/sites/" + id; }
      }));
    }));
  }
  function bindTemplateCards(root) {
    root = root || document;
    $$("[data-use-tpl]", root).forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); const t = studioTemplates().find((x) => x.id === b.dataset.useTpl); if (t) createSiteFromAI(t.name, t.niche); }));
    $$("[data-preview-tpl]", root).forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); previewTemplateModal(b.dataset.previewTpl); }));
    $$("[data-fav]", root).forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); const on = toggleFav(b.dataset.fav); b.classList.toggle("on", on); }));
  }
  function bindAttentionChips() {
    const list = $("#attnList"); if (!list) return;
    const rows = $$(".attn-item", list);
    const preds = {}; ATTN_CHIPS.forEach(([k, l, pred]) => preds[k] = pred);
    const apply = (chip) => { const pred = preds[chip] || (() => true); rows.forEach((r) => { r.style.display = pred({ group: r.dataset.agroup }) ? "" : "none"; }); };
    apply(state.attnChip || "all");
    $$("[data-achip]").forEach((b) => b.addEventListener("click", () => {
      $$("[data-achip]").forEach((x) => x.classList.remove("on")); b.classList.add("on");
      state.attnChip = b.dataset.achip;
      apply(state.attnChip);
    }));
  }
  function bindAttentionDismiss() {
    $$("[data-dismiss-sugg]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      (state.dismissedSuggestions ||= {})[b.dataset.dismissSugg] = true;
      render();
    }));
  }
  function bindDashTable() {
    const table = $("#dashTable"); if (!table) return;
    const search = $("#dashSearch"), empty = $("#dtEmpty"), st = { chip: "all", q: "" };
    function apply() {
      let shown = 0;
      $$(".dt-row:not(.dt-head)", table).forEach((r) => {
        const okChip = st.chip === "all" || (st.chip === "attn" ? r.dataset.attn === "1" : r.dataset.status === st.chip);
        const okQ = !st.q || r.dataset.name.includes(st.q);
        const show = okChip && okQ; r.style.display = show ? "" : "none"; if (show) shown++;
      });
      if (empty) empty.style.display = shown ? "none" : "block";
    }
    $$("[data-dchip]").forEach((b) => b.addEventListener("click", () => { $$("[data-dchip]").forEach((x) => x.classList.remove("on")); b.classList.add("on"); st.chip = b.dataset.dchip; apply(); }));
    search?.addEventListener("input", () => { st.q = search.value.trim().toLowerCase(); apply(); });
    $$(".dt-row:not(.dt-head)", table).forEach((r) => r.addEventListener("click", (e) => { if (e.target.closest("button")) return; location.hash = "#/sites/" + r.dataset.site; }));
  }
  function bindDashboard() { bindNavTo(); bindSiteCardActions(); bindDashTable(); bindAttentionChips(); bindAttentionDismiss(); }
  function bindPagesOverview() { bindNavTo(); bindSiteCardActions(); }
  function bindOverview() { bindNavTo(); bindSiteCardActions(); }
  function bindCapability() { bindNavTo(); $("[data-cap-editor]")?.addEventListener("click", openRecent); }
  function bindSettings() { bindNavTo(); $("#seConnect")?.addEventListener("click", openDrawer); $("#seSave")?.addEventListener("click", () => toast("Studio defaults saved.", "success")); }
  function bindTemplates() {
    bindTemplateCards();
    const gallery = $("#tplGallery"), search = $("#tplSearch"), count = $("#tplCount"), empty = $("#tplEmpty");
    const st = { cat: "all", chip: "all", q: "" };
    function apply() {
      const favs = favTemplates(); let shown = 0;
      $$(".tplc", gallery).forEach((card) => {
        const okCat = st.cat === "all" || card.dataset.cat === st.cat;
        const okChip = st.chip === "all" || (st.chip === "fav" ? favs.includes(card.dataset.tid) : card.dataset.badge === st.chip);
        const okQ = !st.q || card.dataset.name.includes(st.q);
        const show = okCat && okChip && okQ; card.style.display = show ? "" : "none"; if (show) shown++;
      });
      if (count) count.textContent = shown + " template" + (shown === 1 ? "" : "s");
      if (empty) empty.style.display = shown ? "none" : "block";
    }
    $$(".ts-cat").forEach((b) => b.addEventListener("click", () => { $$(".ts-cat").forEach((x) => x.classList.remove("on")); b.classList.add("on"); st.cat = b.dataset.cat; apply(); }));
    $$("[data-fchip]").forEach((b) => b.addEventListener("click", () => { $$("[data-fchip]").forEach((x) => x.classList.remove("on")); b.classList.add("on"); st.chip = b.dataset.fchip; apply(); }));
    search?.addEventListener("input", () => { st.q = search.value.trim().toLowerCase(); apply(); });
  }

  /* ── Router + event binding ───────────────────────────────────────────────── */
  function parseHash() { const h = (location.hash || "#/dashboard").replace(/^#\//, "").split("/"); return h; }
  async function render() {
    const app = $("#app");
    const parts = parseHash();
    const websiteScoped = parts[0] === "sites" || WEBSITE_PAGE_KEYS.has(parts[0]);
    const section = websiteScoped ? "website" : (parts[0] || "dashboard");
    if (section === "website" && lastRailSection !== "website") state.railWebsiteOpen = true;
    lastRailSection = section;
    if (parts[0] === "sites" && parts[2] === "edit") { // editor (full-bleed)
      app.innerHTML = shell(viewEditor(parts[1], parts[3]), { bare: true });
      bindGlobal(); await mountEditor(parts[1], parts[3]); return;
    }
    if (parts[0] === "sites" && parts[1]) { // site detail — Website submenu shows this site's tabs
      if (detailCache && detailCache.site?.id !== parts[1]) detailCache = null;
      const body = await viewSiteDetail(parts[1]);
      state.lastSiteId = parts[1];
      app.innerHTML = shell(body, { active: "sites", siteCtx: { site: detailCache && detailCache.site, tab: state.tab } });
      bindGlobal(); bindDetail(parts[1]); reveal(); return;
    }
    detailCache = null;
    const r0 = parts[0] || "dashboard";
    let html, binder, active = r0;
    switch (r0) {
      case "sites": html = viewSites(); binder = bindSites; break;
      case "templates": html = viewTemplates(); binder = bindTemplates; break;
      case "pages": html = viewPagesOverview(); binder = bindPagesOverview; break;
      case "components": case "sections": case "assets": case "forms": case "blog":
        html = viewCapability(r0); binder = bindCapability; break;
      case "seo": html = viewSeoOverview(); binder = bindOverview; break;
      case "domains": html = viewDomainsOverview(); binder = bindOverview; break;
      case "publish": html = viewPublishCenter(); binder = bindOverview; break;
      case "analytics": html = viewAnalyticsOverview(); binder = bindOverview; break;
      case "settings": html = viewSettings(); binder = bindSettings; break;
      default: html = viewDashboard(); binder = bindDashboard; active = "dashboard";
    }
    app.innerHTML = shell(html, { active });
    bindGlobal(); binder && binder(); reveal();
  }
  function reveal() { $$(".reveal").forEach((n) => n.classList.add("in")); }
  function bindGlobal() {
    $("#themeToggle")?.addEventListener("click", () => setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"));
    $("#openConnect2")?.addEventListener("click", openDrawer);
    $("#railBurger")?.addEventListener("click", () => $("#rail")?.classList.toggle("open"));
    $("#retryBtn")?.addEventListener("click", () => { state.error = null; boot(); });
    $$("[data-preview]").forEach((b) => b.addEventListener("click", () => { state.previewState = b.dataset.preview; render(); }));
    $$("[data-copy]").forEach((b) => b.addEventListener("click", () => { try { navigator.clipboard.writeText(b.dataset.copy); toast("Copied.", "success"); } catch (e) {} }));
    // Sidebar navigation + topbar quick actions
    $$("[data-nav]").forEach((b) => b.addEventListener("click", () => { location.hash = "#/" + b.dataset.nav; $("#rail")?.classList.remove("open"); }));
    $("#tbGenerate")?.addEventListener("click", () => openCreateModal("ai"));
    $("#tqTemplates")?.addEventListener("click", () => { location.hash = "#/templates"; });
    $("#tqNew")?.addEventListener("click", () => openCreateModal());
    $("#tbBell")?.addEventListener("click", () => toast("You're all caught up — no new notifications.", "info"));
    $("#tbSearch")?.addEventListener("click", () => toast("Global search is coming — use the sidebar to navigate for now.", "info"));
  }
  function bindSites() {
    bindNavTo();
    $("#newSite")?.addEventListener("click", () => openCreateModal());
    bindSiteCardActions();
    bindPortfolioToolbar();
    // Hero composer — Generate opens the create modal on the AI tab, prefilled
    // (nothing to close first — the hero isn't itself a generation path). Every
    // successful Generate also records the prompt into local history.
    bindComposer("hero", document, (desc) => { pushHeroPrompt(desc); openCreateModal("ai", desc); });
    $("#heroBlank")?.addEventListener("click", () => openCreateModal("blank"));
    $$("[data-qcard]").forEach((b) => b.addEventListener("click", () => {
      const act = b.dataset.qcard;
      if (act === "templates") location.hash = "#/templates";
      else if (act === "recent") location.hash = "#/sites/" + b.dataset.recentId;
      else openCreateModal(act);
    }));
    // Composer extras (hero only) — attach + competitor URL both show the same
    // flagged toast the Clone/Import flows already use; nothing is read or uploaded.
    $("#heroAttach")?.addEventListener("change", () => toast("Business brief / competitor analysis runs with the AI provider — flagged, not faked.", "info"));
    $("#heroCompetitorToggle")?.addEventListener("click", () => $("#heroCompetitorBox")?.toggleAttribute("hidden"));
    $("#heroCompetitorGo")?.addEventListener("click", () => {
      const u = $("#heroCompetitorUrl"); if (!u || !u.value.trim()) { u?.focus(); return; }
      toast("Business brief / competitor analysis runs with the AI provider — flagged, not faked.", "info");
    });
    $$("#heroRecent [data-recent]").forEach((b) => b.addEventListener("click", () => { const ta = $("#heroPrompt"); ta.value = b.dataset.recent; ta.focus(); }));
    // Favorites — instant local toggle, no full re-render needed.
    $$("[data-favsite]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); const on = toggleFavSite(b.dataset.favsite); b.classList.toggle("on", on); b.closest(".site-card")?.setAttribute("data-fav", on ? "1" : "0"); }));
    // Tag editor — a plain prompt() (comma-separated), same lightweight convention
    // already used by the Business Profile tab's ad-hoc inputs.
    $$("[data-tagedit]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = b.dataset.tagedit;
      const current = siteTagsFor(id).join(", ");
      const next = prompt("Tags (comma-separated)", current);
      if (next == null) return;
      setSiteTags(id, next.split(",").map((t) => t.trim()).filter(Boolean));
      render();
    }));
    // Bulk selection — a plain Set kept in this closure; rebuilt every render().
    const bulkBar = $("#bulkBar"), bulkCount = $("#bulkCount");
    const selected = new Set();
    function updateBulkBar() {
      if (!bulkBar) return;
      bulkBar.style.display = selected.size ? "flex" : "none";
      if (bulkCount) bulkCount.textContent = selected.size + " selected";
    }
    $$("[data-bulk]").forEach((cb) => cb.addEventListener("change", () => {
      if (cb.checked) selected.add(cb.dataset.bulk); else selected.delete(cb.dataset.bulk);
      updateBulkBar();
    }));
    $("#bulkClear")?.addEventListener("click", () => { selected.clear(); $$("[data-bulk]").forEach((cb) => cb.checked = false); updateBulkBar(); });
    $$("[data-bulk-act]").forEach((b) => b.addEventListener("click", () => {
      const act = b.dataset.bulkAct, ids = Array.from(selected); if (!ids.length) return;
      if (act === "publish") {
        ids.forEach((id) => { const s = state.sites.find((x) => x.id === id); if (s && s.status !== "published") { s.status = "published"; s.last_published = new Date().toISOString(); } });
        toast(`Published ${ids.length} site${ids.length === 1 ? "" : "s"} (mockup).`, "success");
      } else if (act === "archive") {
        ids.forEach((id) => { const s = state.sites.find((x) => x.id === id); if (s) s.archived = true; });
        toast(`Archived ${ids.length} site${ids.length === 1 ? "" : "s"}.`, "success");
      } else if (act === "tag") {
        const next = prompt("Tags to apply (comma-separated)", ""); if (next == null) return;
        const tags = next.split(",").map((t) => t.trim()).filter(Boolean);
        ids.forEach((id) => setSiteTags(id, tags));
        toast(`Tagged ${ids.length} site${ids.length === 1 ? "" : "s"}.`, "success");
      }
      selected.clear(); render();
    }));
  }
  function bindPortfolioToolbar() {
    const tb = state.sitesToolbar;
    const search = $("#sitesSearch");
    // Status chip + search box hide/show within whatever the Filters popover already
    // made eligible (state.sites is the source of truth, not stale dataset strings —
    // this works identically whether Grid (.site-card) or List (.dt-row) is showing).
    function applyQuickFilters() {
      const q = (search?.value || "").trim().toLowerCase();
      tb.q = q;
      const container = $("#sitesGrid") || $("#sitesListWrap");
      let shown = 0;
      (state.sites || []).forEach((s) => {
        const row = container && $(`[data-site="${s.id}"]`, container);
        if (!row) return;
        const okChip = tb.chip === "all" ? !s.archived
          : tb.chip === "attn" ? (row.dataset.attn === "1" && !s.archived)
          : tb.chip === "review" ? ((state.reviewBySite || {})[s.id] === "review" && !s.archived)
          : tb.chip === "archived" ? !!s.archived
          : (s.status === tb.chip && !s.archived);
        const okQ = !q || s.name.toLowerCase().includes(q);
        const show = okChip && okQ; row.style.display = show ? "" : "none"; if (show) shown++;
      });
      const empty = $("#sitesEmpty"); if (empty) empty.style.display = shown ? "none" : "block";
    }
    applyQuickFilters();
    $$("[data-schip]").forEach((b) => b.addEventListener("click", () => { $$("[data-schip]").forEach((x) => x.classList.remove("on")); b.classList.add("on"); tb.chip = b.dataset.schip; applyQuickFilters(); }));
    search?.addEventListener("input", applyQuickFilters);
    // Sort + Grid/List both reorder/relayout the DOM, so both go through render().
    $("#sitesSort")?.addEventListener("change", (e) => { tb.sort = e.target.value; render(); });
    $$("[data-view]").forEach((b) => b.addEventListener("click", () => { tb.view = b.dataset.view; render(); }));
    // Filters popover — category / needs-attention / tag all change which sites are
    // eligible at all, so they also go through render() (see viewSites()'s `eligible`).
    $("#sitesFilterBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const pop = openPop(e.currentTarget, sitesFiltersPopoverHtml());
      $$("[data-nicheval]", pop).forEach((it) => it.addEventListener("click", () => { tb.niche = it.dataset.nicheval; closePop(); render(); }));
      $("[data-needsattn-toggle]", pop)?.addEventListener("click", () => { tb.needsAttn = !tb.needsAttn; closePop(); render(); });
      $("#sitesTagFilterInput", pop)?.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { tb.tag = ev.target.value.trim(); closePop(); render(); } });
    });
    // Saved views — snapshot/restore the whole toolbar combo.
    $("#sitesSavedViewsBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const pop = openPop(e.currentTarget, sitesSavedViewsPopoverHtml());
      $("[data-saveview]", pop)?.addEventListener("click", () => {
        const name = prompt("Name this view"); if (!name) return;
        saveSitesView(name, { chip: tb.chip, q: tb.q, niche: tb.niche, needsAttn: tb.needsAttn, tag: tb.tag, sort: tb.sort, view: tb.view });
        closePop(); toast("View saved.", "success");
      });
      $$("[data-viewidx]", pop).forEach((it) => it.addEventListener("click", () => {
        const v = savedSitesViews()[Number(it.dataset.viewidx)]; if (!v) return;
        Object.assign(tb, { chip: v.chip, q: v.q, niche: v.niche, needsAttn: v.needsAttn, tag: v.tag, sort: v.sort, view: v.view });
        closePop(); render();
      }));
    });
  }
  async function openSiteEditor(siteId) {
    const d = detailCache && detailCache.site && detailCache.site.id === siteId ? detailCache : await loadSite(siteId);
    const home = (d.pages || []).find((p) => p.is_home) || (d.pages || [])[0];
    if (home) location.hash = `#/sites/${siteId}/edit/${home.id}`; else toast("No page to edit yet.", "info");
  }
  function bindDetail(id) {
    $("#backSites")?.addEventListener("click", () => { state.tab = "overview"; location.hash = "#/sites"; });
    $$("[data-tab]").forEach((b) => b.addEventListener("click", () => { state.tab = b.dataset.tab; $("#rail")?.classList.remove("open"); render(); }));
    $$("[data-openeditor]").forEach((b) => b.addEventListener("click", () => openSiteEditor(b.dataset.openeditor)));
    $("#pubNow")?.addEventListener("click", () => toast(connected() ? "Running the pre-flight gate, then publishing…" : "Published (mockup) — pre-flight gate passed.", "success"));
    $$("[data-restore]").forEach((b) => b.addEventListener("click", () => toast(`Restoring version ${b.dataset.restore}${connected() ? "…" : " (mockup)."}`, "info")));
    $$("[data-compare]").forEach((b) => b.addEventListener("click", () => openCompareModal(b.dataset.compare)));
    $$("[data-review]").forEach((b) => b.addEventListener("click", () => { (state.reviewBySite ||= {})[id] = b.dataset.review; const L = { review: "Sent for client review.", approved: "Marked approved — ready to publish.", live: "Published live.", draft: "Reset to draft." }; toast(L[b.dataset.review] || "Updated.", "success"); render(); }));
    $("#rvPass")?.addEventListener("change", (e) => toast(e.target.checked ? "Review link is now password-protected." : "Password protection removed.", "info"));
    $$("[data-intg]").forEach((b) => b.addEventListener("click", () => toast(`${b.dataset.intg} — CRM widget setup arrives with the AI provider (flagged, not faked).`, "info")));
    $$("[data-editpage]").forEach((b) => b.addEventListener("click", () => { const [s, p] = b.dataset.editpage.split(":"); location.hash = `#/sites/${s}/edit/${p}`; }));
    $("#newPage")?.addEventListener("click", () => newPage(id));
    $("#genPages")?.addEventListener("click", () => openProgrammaticModal(id));
    bindBusinessProfile(id);
    $("#hcRerun")?.addEventListener("click", () => toast(connected() ? "Re-running quality checks…" : "Checks re-run (mockup) — score refreshed.", "info"));
    $$("[data-duppage]").forEach((b) => b.addEventListener("click", () => duplicatePage(b.dataset.duppage, id)));
    $$("[data-delpage]").forEach((b) => b.addEventListener("click", () => deletePage(b.dataset.delpage, id)));
    $("#addDomain")?.addEventListener("click", () => addDomain(id));
    $$("[data-verify]").forEach((b) => b.addEventListener("click", () => verifyDomain(b.dataset.verify, id)));
    $("#navAdd")?.addEventListener("click", () => toast("Add a menu item, then Save menu.", "info"));
    $("#navSave")?.addEventListener("click", () => persist(id, "nav", collectNav(), "Menu saved."));
    $("#seoSave")?.addEventListener("click", () => persist(id, "seo_defaults", { title: $("#seoTitle").value, description: $("#seoDesc").value, og_image: $("#seoOg").value, robots: $("#seoRobots").value }, "SEO defaults saved.", { favicon_url: $("#seoFav").value }));
    $("#setSave")?.addEventListener("click", () => persist(id, "brand", { colors: { teal: $("#setTeal").value }, fonts: { serif: $("#setFont").value } }, "Settings saved.", { name: $("#setName").value, subdomain: $("#setSub").value, style_preset: $("#setPreset")?.value || null }));
    $("#maintToggle")?.addEventListener("click", async () => { const on = !detailCache?.site?.maintenance_mode; await persist(id, "maintenance_mode", on, on ? "Maintenance mode on — visitors see the back-soon page." : "Maintenance mode off."); render(); });
    $("#save404")?.addEventListener("click", () => persist(id, "not_found_html", $("#set404")?.value || null, "404 page saved."));
    $("#archiveSite")?.addEventListener("click", () => setStatus(id, "archived", "Site archived."));
    $("#deleteSite")?.addEventListener("click", () => deleteSite(id));
  }
  const collectNav = () => ({ items: $$("#navBuilder .nav-builder-row").map((r, i) => ({ label: $(`[data-navlabel="${i}"]`, r)?.value || r.querySelector("input")?.value || "" })) });

  /* Business Profile: chip add/remove, testimonials, save (best-effort upsert). */
  function bindBusinessProfile(siteId) {
    $$("[data-chipadd]").forEach((inp) => inp.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || !inp.value.trim()) return;
      e.preventDefault();
      const chips = inp.closest(".chip-field").querySelector(".chips");
      const i = chips.children.length;
      const span = el("span", "chip", `${esc(inp.value.trim())}<button class="chip-x" data-chipdel="${i}" title="Remove">×</button>`);
      span.dataset.chip = i; chips.appendChild(span);
      span.querySelector(".chip-x").addEventListener("click", () => span.remove());
      inp.value = "";
    }));
    $$(".chip-x").forEach((b) => b.addEventListener("click", () => b.closest(".chip").remove()));
    $("#bpAddTesti")?.addEventListener("click", () => {
      const q = prompt("Testimonial quote"); if (!q) return;
      const a = prompt("Author (name, role)") || "";
      const list = $(".proof-list"); const inline = list.querySelector(".empty-inline"); if (inline) inline.remove();
      const row = el("div", "proof-row", `<span class="pr-quote">“${esc(q)}”</span><span class="pr-author">${esc(a)}</span>`);
      list.appendChild(row);
    });
    $("#bpGenerate")?.addEventListener("click", () => toast(connected() ? "Regenerating from profile…" : "Site regenerated from the Business Profile (mockup).", "success"));
    $("#bpSave")?.addEventListener("click", async () => {
      const chipsOf = (id) => $$(`[data-chipfield="${id}"] .chip`).map((c) => c.firstChild.textContent.trim()).filter(Boolean);
      const profile = {
        business_name: $("#bpName")?.value || "", phone: $("#bpPhone")?.value || "", email: $("#bpEmail")?.value || "",
        hours: $("#bpHours")?.value || "", address: $("#bpAddr")?.value || "",
        service_areas: chipsOf("service_areas"), services: chipsOf("services"),
        differentiators: chipsOf("differentiators"), exclusions: chipsOf("exclusions"), proof_points: chipsOf("proof_points"),
        testimonials: $$(".proof-list .proof-row").map((r) => ({ quote: r.querySelector(".pr-quote")?.textContent.replace(/^“|”$/g, "") || "", author: r.querySelector(".pr-author")?.textContent || "" })),
      };
      if (!connected()) { (state.profilesBySite ||= {})[siteId] = profile; if (detailCache) detailCache.profile = profile; toast("Business Profile saved (mockup).", "success"); return; }
      const c = ensureClient();
      try {
        const { error } = await c.from("site_business_profiles").upsert({ workspace_id: state.workspaceId, site_id: siteId, ...profile }, { onConflict: "site_id" });
        if (error) throw error;
        toast("Business Profile saved.", "success"); if (detailCache) detailCache.profile = profile;
      } catch (e) { toast("Profile save needs the v3 migration (site_business_profiles). " + (e.message || ""), "info"); }
    });
  }

  async function persist(siteId, col, val, msg, extra) {
    if (!connected()) { toast(msg + " (mockup)", "success"); return; }
    const c = ensureClient(); const patch = { [col]: val, ...(extra || {}) };
    const { error } = await c.from("sites").update(patch).eq("id", siteId);
    if (error) toast(error.message, "danger"); else { toast(msg, "success"); detailCache = null; }
  }
  async function setStatus(siteId, status, msg) { if (!connected()) { toast(msg + " (mockup)", "success"); return; } const c = ensureClient(); const { error } = await c.from("sites").update({ status }).eq("id", siteId); if (error) toast(error.message, "danger"); else { toast(msg, "success"); detailCache = null; await boot(); location.hash = "#/sites/" + siteId; } }
  async function deleteSite(siteId) { if (!confirm("Delete this site and all its pages permanently?")) return; if (!connected()) { toast("Deleted (mockup).", "success"); location.hash = "#/sites"; return; } const c = ensureClient(); const { error } = await c.from("sites").delete().eq("id", siteId); if (error) toast(error.message, "danger"); else { toast("Site deleted.", "success"); detailCache = null; await boot(); location.hash = "#/sites"; } }

  async function newPage(siteId) {
    const title = prompt("Page title"); if (!title) return;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!connected()) { toast("Page created (mockup).", "success"); return; }
    const c = ensureClient(); const { error } = await c.from("pages").insert({ workspace_id: state.workspaceId, site_id: siteId, title, slug });
    if (error) toast(error.message, "danger"); else { toast("Page created.", "success"); detailCache = null; render(); }
  }
  async function duplicatePage(pageId, siteId) { if (!connected()) { toast("Duplicated (mockup).", "success"); return; } const c = ensureClient(); const { error } = await c.rpc("duplicate_page", { p_page: pageId }); if (error) toast(error.message, "danger"); else { toast("Page duplicated.", "success"); detailCache = null; render(); } }
  async function deletePage(pageId, siteId) { if (!confirm("Delete this page?")) return; if (!connected()) { toast("Deleted (mockup).", "success"); return; } const c = ensureClient(); const { error } = await c.from("pages").delete().eq("id", pageId); if (error) toast(error.message, "danger"); else { toast("Page deleted.", "success"); detailCache = null; render(); } }

  async function addDomain(siteId) {
    const domain = prompt("Custom domain (e.g. example.com)"); if (!domain) return;
    if (!connected()) { toast("Domain added (mockup). Verify DNS to activate.", "success"); return; }
    const c = ensureClient(); const { error } = await c.from("site_domains").insert({ workspace_id: state.workspaceId, site_id: siteId, domain: domain.trim().toLowerCase() });
    if (error) toast(error.message, "danger"); else { toast("Domain added. Add the DNS records, then verify.", "success"); detailCache = null; render(); }
  }
  async function verifyDomain(domainId, siteId) {
    if (!connected()) { toast("DNS not found yet (mockup) — records can take up to 24h.", "info"); return; }
    const c = ensureClient();
    try { const { data, error } = await c.functions.invoke("domain-verify", { body: { workspace_id: state.workspaceId, domain_id: domainId } }); if (error) throw error; const r = data?.data || data; toast(r.verified ? "Domain verified. SSL pending (D-009)." : "DNS records not found yet.", r.verified ? "success" : "info"); detailCache = null; render(); }
    catch (e) { toast(e.message || "Verification failed", "danger"); }
  }

  /* ── AI Copilot — system-wide, always-available (mockup) ──────────────────────
     A floating launcher + right-side chat drawer, mounted once at the app level so
     it persists across every route (including the full-bleed editor). Responses are
     canned-but-context-aware and clearly framed as a preview — no live LLM here. */
  const copilot = { open: false, mounted: false, thread: [] };

  function copilotContext() {
    const h = (location.hash || "").replace(/^#\//, "").split("/");
    if (h[0] === "sites" && h[2] === "edit") return { key: "editor", label: "Editor" };
    if (h[0] === "sites" && h[1]) { const s = (state.sites || []).find((x) => x.id === h[1]); return { key: "site", label: s ? s.name : "Site", site: s }; }
    const map = { dashboard: "Dashboard", sites: "Websites", templates: "Templates", pages: "Pages", components: "Components", sections: "Sections", assets: "Assets", forms: "Forms", blog: "Blog", seo: "SEO", domains: "Domains", publish: "Publish", analytics: "Analytics", settings: "Settings" };
    return { key: h[0] || "dashboard", label: map[h[0]] || "Studio" };
  }
  const CP_SUGGEST = {
    dashboard: ["What needs my attention today?", "Summarize this week’s publishes", "Which sites have SEO issues?", "Draft a new landing page"],
    site: ["Improve this site’s SEO", "Generate the missing pages", "Add a lead-capture form", "Rewrite the homepage hero"],
    editor: ["Make this section more premium", "Rewrite this in a bolder tone", "Add an FAQ under pricing", "Generate alt text for images"],
    sites: ["Which drafts are ready to publish?", "Create a new website", "Find sites with domain issues"],
    templates: ["Recommend a template for a dental clinic", "Draft a new website", "Which template converts best?"],
    default: ["Draft a new website", "Improve SEO across my sites", "What should I work on next?"],
  };
  const cpSuggestions = (ctx) => CP_SUGGEST[ctx.key] || CP_SUGGEST.default;

  function copilotReply(text, ctx) {
    const t = text.toLowerCase();
    const sites = state.sites || [];
    const items = attentionItems(sites);
    const preview = "Preview — connect the AI provider to apply this live.";
    const siteName = ctx.site ? ctx.site.name : (sites[0] && sites[0].name) || "your site";
    if (/attention|what.*(work|next|do)|priorit/.test(t)) {
      const dom = items.filter((a) => a.group === "domain").length, seo = items.filter((a) => a.group === "seo").length, pub = items.filter((a) => a.group === "publish" && !a.stale).length;
      const top = items.slice(0, 3).map((a) => "• " + a.title).join("\n");
      return { text: `Here's what needs you today across ${sites.length} sites:\n${top}\n\nThat's ${dom} domain, ${seo} SEO and ${pub} publish item${pub === 1 ? "" : "s"}. Want me to start with the SEO fixes?`, note: preview };
    }
    if (/seo|meta|schema|rank/.test(t)) {
      const seo = items.filter((a) => a.group === "seo");
      return { text: `I can auto-generate titles, meta descriptions, JSON-LD schema, image alt text and an internal-linking pass. Right now I see ${seo.length} SEO issue${seo.length === 1 ? "" : "s"}${seo[0] ? " — e.g. " + seo[0].title : ""}. I'll draft every fix and you approve them in one review.`, note: preview };
    }
    if (/faq/.test(t)) return { text: `Drafted a 5-question FAQ for ${siteName} — pricing, timelines, guarantees, support and getting started — with FAQPage schema so it can win rich results. I'll place it under your pricing section.`, note: preview };
    if (/premium|luxur|elegant|bolder|bold|tone|rewrite|copy|hero/.test(t)) return { text: `Rewrote it with a more ${/(premium|luxur|elegant)/.test(t) ? "premium, editorial" : "bold, confident"} voice — tighter headline, benefit-led subcopy and a stronger CTA. Structure stays intact so nothing breaks.`, note: preview };
    if (/missing page|generate.*page|sitemap|new page/.test(t)) return { text: `From ${siteName}'s business profile I can generate the pages it's missing — Services, About, Pricing, Contact and location pages — each with on-brand copy and internal links. Add all five as drafts?`, note: preview };
    if (/form|lead|capture/.test(t)) return { text: `Added a lead-capture form (name · email · message) wired to your CRM, with spam protection and a thank-you state. Submissions sync straight into Contacts.`, note: preview };
    if (/publish|deploy|go.?live/.test(t)) {
      const pub = items.filter((a) => a.group === "publish" && !a.stale);
      return { text: pub.length ? `${pub.length} site${pub.length === 1 ? " is" : "s are"} waiting to publish: ${pub.map((a) => a.site && a.site.name).filter(Boolean).join(", ")}. Each runs the pre-flight quality gate first. Queue them?` : `Everything's published and up to date — no pending changes. Nice.`, note: pub.length ? preview : null };
    }
    if (/domain|dns|ssl/.test(t)) return { text: `I can walk a domain through DNS setup and verification. Two of your domains have SSL pending — I'll re-check the records and issue certificates once they resolve.`, note: preview };
    if (/accessib|a11y|contrast|alt text/.test(t)) return { text: `Ran an accessibility pass — I can add missing alt text, fix low-contrast buttons and label form fields for screen readers. Found a few issues on ${siteName}. Apply the fixes?`, note: preview };
    if (/translat|multiling|language|bengali|arabic/.test(t)) return { text: `I can create localized variants of ${siteName} — translating copy while keeping layout and brand, with per-language SEO. Bengali and Arabic are ready to draft.`, note: preview };
    if (/variant|version|compare|difference/.test(t)) return { text: `I can generate multiple design variants — luxury, minimal, editorial and conversion-focused — from the same content, then explain the differences so you can pick. Want three?`, note: preview };
    if (/new (web)?site|create|draft a new|build a|spin up|landing page/.test(t)) { setTimeout(() => { copilotClose(); openCreateModal("ai"); }, 420); return { text: `Let's build it — opening the create studio so you can describe the business and I'll draft the whole site.` }; }
    return { text: `I can help with that. In this preview I draft the work — sites, sections, copy, SEO, pages, forms and audits — and you approve it. Connect an AI provider to apply changes live. Try a suggestion above to see it in action.` };
  }

  function copilotRender() {
    const body = $("#cpThread"); if (!body) return;
    body.innerHTML = copilot.thread.map((mm) => mm.role === "user"
      ? `<div class="cp-msg cp-user"><div class="cp-bubble">${esc(mm.text)}</div></div>`
      : `<div class="cp-msg cp-ai"><span class="cp-ava">${svg("spark", 12)}</span><div class="cp-bubble">${mm.typing ? `<span class="cp-typing"><i></i><i></i><i></i></span>` : esc(mm.text).replace(/\n/g, "<br>") + (mm.note ? `<span class="cp-note">${svg("spark", 11)} ${esc(mm.note)}</span>` : "")}</div></div>`).join("");
    body.scrollTop = body.scrollHeight;
  }
  function renderCpSuggest(ctx) {
    const box = $("#cpSuggest"); if (!box) return;
    box.innerHTML = cpSuggestions(ctx).map((s) => `<button class="cp-chip" data-cpsug="${esc(s)}">${esc(s)}</button>`).join("");
    $$("[data-cpsug]", box).forEach((b) => b.addEventListener("click", () => copilotSend(b.dataset.cpsug)));
  }
  function copilotSend(text) {
    copilot.thread.push({ role: "user", text });
    const typing = { role: "ai", typing: true }; copilot.thread.push(typing);
    copilotRender();
    const ctx = copilotContext();
    setTimeout(() => {
      const i = copilot.thread.indexOf(typing); if (i >= 0) copilot.thread.splice(i, 1);
      const r = copilotReply(text, ctx);
      copilot.thread.push({ role: "ai", text: r.text, note: r.note });
      copilotRender();
    }, 650);
  }
  function copilotOpen() {
    copilot.open = true;
    const ctx = copilotContext();
    $("#cpCtx").textContent = "Context · " + ctx.label;
    renderCpSuggest(ctx);
    if (!copilot.thread.length) {
      const who = (state.user && state.user.name ? state.user.name : "").split(" ")[0] || "there";
      copilot.thread.push({ role: "ai", text: `Hi ${who} — I'm your studio copilot. I can draft sites, rewrite copy, generate pages, fix SEO and run audits. What are we working on${ctx.key === "site" || ctx.key === "editor" ? " for " + ctx.label : ""}?` });
      copilotRender();
    }
    $("#copilot").classList.add("open"); $("#cpScrim").classList.add("open"); document.body.classList.add("cp-lock");
    setTimeout(() => $("#cpText")?.focus(), 60);
  }
  function copilotClose() { copilot.open = false; $("#copilot")?.classList.remove("open"); $("#cpScrim")?.classList.remove("open"); document.body.classList.remove("cp-lock"); }
  function mountCopilot() {
    if (copilot.mounted) return; const rootEl = $("#copilotRoot"); if (!rootEl) return; copilot.mounted = true;
    rootEl.innerHTML = `
      <button class="copilot-fab" id="cpFab" aria-label="Ask the AI copilot">${svg("spark", 18)}<span>Ask AI</span></button>
      <div class="cp-scrim" id="cpScrim"></div>
      <aside class="copilot" id="copilot" aria-label="AI Copilot">
        <header class="cp-head">
          <span class="cp-ava lg">${svg("spark", 15)}</span>
          <div class="cp-title"><b>AI Copilot</b><span id="cpCtx">Studio</span></div>
          <button class="icon-btn" id="cpClose" aria-label="Close copilot">${svg("x", 16)}</button>
        </header>
        <div class="cp-thread" id="cpThread"></div>
        <div class="cp-suggest" id="cpSuggest"></div>
        <div class="cp-input">
          <textarea id="cpText" rows="1" placeholder="Ask the copilot to build, edit or improve…"></textarea>
          <button class="cp-send" id="cpSend" aria-label="Send">${svg("chev", 16)}</button>
        </div>
        <div class="cp-foot">${svg("spark", 11)} Preview copilot — connect an AI provider to apply changes live.</div>
      </aside>`;
    $("#cpFab").addEventListener("click", copilotOpen);
    $("#cpClose").addEventListener("click", copilotClose);
    $("#cpScrim").addEventListener("click", copilotClose);
    $("#cpSend").addEventListener("click", () => { const ta = $("#cpText"); const t = ta.value.trim(); if (t) { ta.value = ""; copilotSend(t); } });
    $("#cpText").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#cpSend").click(); } });
    window.addEventListener("keydown", (e) => { if (e.key === "Escape" && copilot.open) copilotClose(); });
  }

  window.addEventListener("keydown", (e) => { if (e.key === "Escape") { closePop(); closeDetailsDrawer(); } });
  window.addEventListener("hashchange", () => { if (state.editor && !location.hash.includes("/edit/")) teardownEditor(); render(); if (copilot.open) { const ctx = copilotContext(); const c = $("#cpCtx"); if (c) c.textContent = "Context · " + ctx.label; renderCpSuggest(ctx); } });
  if (!reduce) document.body.classList.add("js-ready"); else $$(".reveal").forEach((n) => n.classList.add("in"));
  mountCopilot();
  boot();
})();
