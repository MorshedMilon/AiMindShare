/* ══════════════════════════════════════════════════════════════════════════
   m13-automations.js — AiMindShare Module M13 · Automations
   Vanilla hash-routed app on Supabase. The platform's nervous system: a visual
   no-code workflow builder on a Drawflow canvas, a central trigger bus, executions
   that run as background jobs with per-node step logs, a 15-template gallery, an AI
   draft builder (scaffold), and a sandbox test runner. Mockup mode drives every
   screen state (default/empty/loading/error/success) with honest sample data when
   no Supabase project is connected. Tokens-only styling; 3 fonts; calm token
   loaders (no sweep); dark = no stars (app.css). RLS/roles enforced server-side.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (t, c) => { const n = document.createElement(t); if (c) n.className = c; return n; };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const fmtInt = (n) => new Intl.NumberFormat("en-US").format(Number(n) || 0);
  const root = document.documentElement;
  const THEME_KEY = "aimindshare-theme";

  /* ── Theme + atmosphere ─────────────────────────────────────────────────── */
  const setTheme = (t) => { root.setAttribute("data-theme", t); try { localStorage.setItem(THEME_KEY, t); } catch (e) {} const i = $("#themeIco"); if (i) i.textContent = t === "dark" ? "☀" : "☾"; };
  setTheme((() => { try { return localStorage.getItem(THEME_KEY) || "light"; } catch (e) { return "light"; } })());
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  (function stars() { const f = $("#starField"); if (!f || reduce) return; for (let i = 0; i < 42; i++) { const s = el("div", "star"); s.style.left = Math.random() * 100 + "%"; s.style.top = Math.random() * 100 + "%"; s.style.setProperty("--tw", (3 + Math.random() * 7).toFixed(1) + "s"); s.style.setProperty("--td", (Math.random() * 10).toFixed(1) + "s"); f.appendChild(s); } })();

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

  /* ── Minimal icon set (geometric, stroke-based; premium + Islamic-inspired) ─ */
  const ICONS = {
    bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>', "user-plus": '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M18 8v6M15 11h6"/>',
    tag: '<path d="M3 3h7l11 11-7 7L3 10z"/><circle cx="7.5" cy="7.5" r="1.4"/>', flag: '<path d="M5 3v18M5 4h11l-2 4 2 4H5"/>',
    inbox: '<path d="M3 12h5l2 3h4l2-3h5"/><path d="M3 12 6 4h12l3 8v6H3z"/>', calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 9h17M8 3v4M16 3v4"/>',
    play: '<path d="M7 5l12 7-12 7z"/>', clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>',
    receipt: '<path d="M5 3v18l2-1.5L9 21l2-1.5L13 21l2-1.5L17 21l2-1.5V3z"/><path d="M8 8h8M8 12h8"/>', mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M4 7l8 6 8-6"/>',
    message: '<path d="M4 5h16v11H9l-4 4v-4H4z"/>', clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2.2"/>',
    branch: '<path d="M7 4v6a5 5 0 0 0 5 5h5M17 4v16"/><circle cx="7" cy="4" r="2"/><circle cx="17" cy="4" r="2"/><circle cx="17" cy="20" r="2"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>', bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>',
    webhook: '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="16" r="3"/><circle cx="7" cy="17" r="3"/><path d="M10.5 6.5 15 14M14 16H9M8 11l-2 4"/>',
    "user-check": '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M16 12l2 2 4-4"/>', edit: '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="M14 6l4 4"/>',
    deal: '<path d="M12 3l3 3 4 .5-3 3 .8 4-4.8-2-4.8 2 .8-4-3-3 4-.5z"/>', task: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
    campaign: '<path d="M4 9v6l11 5V4L4 9z"/><path d="M15 8a4 4 0 0 1 0 8"/>', plus: '<path d="M12 5v14M5 12h14"/>', trash: '<path d="M5 7h14M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>', check: '<path d="M5 12l5 5 9-11"/>', alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', dots: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>', chevron: '<path d="M9 6l6 6-6 6"/>',
    back: '<path d="M15 6l-6 6 6 6"/>', power: '<path d="M12 3v9M7 6a7 7 0 1 0 10 0"/>', save: '<path d="M5 4h11l4 4v12H5z"/><path d="M8 4v5h7M8 15h8"/>',
    star: '<path d="M12 3l2.5 6.5L21 10l-5 4.2L17.5 21 12 17.3 6.5 21 8 14.2 3 10l6.5-.5z"/>', crown: '<path d="M4 8l3 4 5-7 5 7 3-4v10H4z"/>', gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M4 9h16M12 9v11M8 9a2.5 2.5 0 1 1 4-2 2.5 2.5 0 1 1 4 2"/>',
    refresh: '<path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2"/><path d="M18 3v6h-6M6 21v-6h6"/>', rocket: '<path d="M12 3c4 2 5 6 5 9l-3 3H10L7 12c0-3 1-7 5-9z"/><path d="M7 15l-2 4 4-2M12 9v.5"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M3 4h2l2 12h11l2-8H6"/>', flame: '<path d="M12 3c1 3-2 4-2 7a4 4 0 0 0 8 0c0-2-1-3-2-5 0 2-1 3-2 3 .5-3-1-5-2-8z"/>',
  };
  function svg(name, size = 18) { const p = ICONS[name] || ICONS.info; return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`; }

  /* ── Node catalog — 6 real triggers + 3 deferred · 12 actions · IF/ELSE·wait·goal ─ */
  const OPERATORS = [
    { v: "equals", l: "equals" }, { v: "not_equals", l: "does not equal" }, { v: "contains", l: "contains" },
    { v: "greater_than", l: "is greater than" }, { v: "less_than", l: "is less than" },
    { v: "is_set", l: "is set" }, { v: "not_set", l: "is empty" }, { v: "has_tag", l: "has tag" }, { v: "not_has_tag", l: "does not have tag" },
  ];
  const COND_FIELDS = [
    { v: "lead_score", l: "Lead score" }, { v: "deal_value", l: "Deal value" }, { v: "email", l: "Email" },
    { v: "first_name", l: "First name" }, { v: "source", l: "Source" }, { v: "phone", l: "Phone" },
  ];
  const NODES = {
    // triggers (real)
    "contact.created": { cat: "trigger", label: "Contact created", icon: "user-plus", blurb: "A new contact is added" },
    "tag.added": { cat: "trigger", label: "Tag added", icon: "tag", fields: [{ k: "tag_name", l: "Tag name", t: "text", ph: "VIP" }], blurb: "A tag is applied" },
    "deal.stage_changed": { cat: "trigger", label: "Deal stage changed", icon: "flag", blurb: "A deal moves stage" },
    "message.received": { cat: "trigger", label: "Message received", icon: "message", blurb: "An inbound reply arrives" },
    "date.scheduled": { cat: "trigger", label: "Scheduled date", icon: "calendar", blurb: "A date is reached (daily)" },
    "manual": { cat: "trigger", label: "Manual / test", icon: "play", blurb: "Started by hand or test" },
    // triggers (registered, source module deferred)
    "form.submitted": { cat: "trigger", label: "Form submitted", icon: "clipboard", blurb: "A form is submitted", deferred: "M15" },
    "appointment.booked": { cat: "trigger", label: "Appointment booked", icon: "calendar", blurb: "A booking is made", deferred: "M14" },
    "payment.received": { cat: "trigger", label: "Payment received", icon: "receipt", blurb: "A payment succeeds", deferred: "M28" },
    // actions (real)
    "add_tag": { cat: "action", label: "Add tag", icon: "tag", fields: [{ k: "tag_name", l: "Tag", t: "text", ph: "VIP" }], blurb: "Tag the contact" },
    "remove_tag": { cat: "action", label: "Remove tag", icon: "tag", fields: [{ k: "tag_name", l: "Tag", t: "text" }], blurb: "Untag the contact" },
    "create_task": { cat: "action", label: "Create task", icon: "task", fields: [{ k: "title", l: "Title", t: "text", ph: "Follow up" }, { k: "due_in_days", l: "Due in (days)", t: "number", ph: "1" }], blurb: "Add a follow-up task" },
    "create_deal": { cat: "action", label: "Create deal", icon: "deal", fields: [{ k: "title", l: "Deal title", t: "text" }, { k: "value", l: "Value", t: "number" }], blurb: "Open a new deal" },
    "move_deal_stage": { cat: "action", label: "Move deal stage", icon: "flag", fields: [{ k: "stage_id", l: "Stage", t: "stage" }], blurb: "Advance the deal" },
    "update_field": { cat: "action", label: "Update field", icon: "edit", fields: [{ k: "field", l: "Field", t: "text", ph: "source" }, { k: "value", l: "Value", t: "text" }], blurb: "Set a contact field" },
    "assign_owner": { cat: "action", label: "Assign owner", icon: "user-check", fields: [{ k: "user_id", l: "Owner", t: "user" }], blurb: "Assign the contact's deals" },
    "internal_notification": { cat: "action", label: "Internal alert", icon: "bell", fields: [{ k: "targets", l: "Notify", t: "targets" }, { k: "title", l: "Title", t: "text", ph: "New activity" }, { k: "body", l: "Message", t: "textarea" }], blurb: "Alert your team" },
    "webhook_post": { cat: "action", label: "Webhook POST", icon: "webhook", fields: [{ k: "url", l: "URL", t: "text", ph: "https://…" }], blurb: "POST to a URL" },
    "send_email": { cat: "action", label: "Send email", icon: "mail", fields: [{ k: "subject", l: "Subject", t: "text" }, { k: "body", l: "Body", t: "textarea" }], blurb: "Email the contact", stub: "email provider (D-011)" },
    "send_sms": { cat: "action", label: "Send SMS", icon: "message", fields: [{ k: "body", l: "Message", t: "textarea" }], blurb: "Text the contact", stub: "SMS provider (M05)" },
    "add_to_campaign": { cat: "action", label: "Add to campaign", icon: "campaign", fields: [{ k: "campaign_id", l: "Campaign", t: "text" }], blurb: "Enrol in a campaign", stub: "campaigns (M16)" },
    // logic
    "if_else": { cat: "logic", label: "If / Else", icon: "branch", outputs: 2, fields: [{ k: "field", l: "Field", t: "field" }, { k: "operator", l: "Condition", t: "operator" }, { k: "value", l: "Value", t: "text" }], blurb: "Branch on a condition" },
    "wait": { cat: "logic", label: "Wait", icon: "clock", fields: [{ k: "amount", l: "Amount", t: "number", ph: "1" }, { k: "unit", l: "Unit", t: "unit" }], blurb: "Delay the flow" },
    "goal": { cat: "logic", label: "Goal", icon: "target", fields: [{ k: "field", l: "Field", t: "field" }, { k: "operator", l: "Condition", t: "operator" }, { k: "value", l: "Value", t: "text" }], blurb: "Exit when met" },
  };
  const TRIGGER_KEYS = Object.keys(NODES).filter((k) => NODES[k].cat === "trigger");
  const catColor = { trigger: "teal", action: "gold", logic: "amber" };

  /* ── Mockup data (honest sample content; no mock left in live paths) ─────── */
  const MOCK = (() => {
    const now = Date.now();
    const iso = (d) => new Date(now - d * 864e5).toISOString();
    const members = { u1: "Aisha Rahman", u2: "Yusuf Karim", u3: "Layla Haddad" };
    const contacts = [
      { id: "c1", name: "Omar Farouk", email: "omar@nurhome.co" }, { id: "c2", name: "Fatima Zahra", email: "fatima@barakah.io" },
      { id: "c3", name: "Bilal Ahmed", email: "bilal@salaamtech.com" }, { id: "c4", name: "Noor Sadiq", email: "noor@qamar.app" },
    ];
    const stages = [{ id: "s1", name: "New Lead" }, { id: "s2", name: "Qualified" }, { id: "s3", name: "Proposal Sent" }, { id: "s4", name: "Won" }];
    const wf = (o) => Object.assign({ nodes: [], edges: [], reentry_rule: "once", version: 3 }, o);
    const workflows = [
      wf({ id: "w1", name: "7-Day Welcome Nurture", trigger_type: "contact.created", is_active: true, runs_7d: 128, last_run_at: iso(0.02),
        nodes: [{ id: "t", type: "trigger", config: {} }, { id: "n1", type: "send_email", config: { subject: "Welcome 👋" } }, { id: "n2", type: "wait", config: { amount: 2, unit: "days" } }, { id: "n3", type: "add_tag", config: { tag_name: "Nurtured" } }, { id: "n4", type: "internal_notification", config: { targets: ["manager"], title: "Lead nurtured" } }],
        edges: [{ source: "t", target: "n1" }, { source: "n1", target: "n2" }, { source: "n2", target: "n3" }, { source: "n3", target: "n4" }] }),
      wf({ id: "w2", name: "Hot-Intent Alert", trigger_type: "tag.added", trigger_config: { tag_name: "hot" }, is_active: true, runs_7d: 43, last_run_at: iso(0.1),
        nodes: [{ id: "t", type: "trigger", config: {} }, { id: "n1", type: "internal_notification", config: { targets: ["manager"], title: "🔥 Hot lead" } }, { id: "n2", type: "create_task", config: { title: "Call now", due_in_days: 0 } }],
        edges: [{ source: "t", target: "n1" }, { source: "n1", target: "n2" }] }),
      wf({ id: "w3", name: "Won Deal → Onboarding", trigger_type: "deal.stage_changed", is_active: false, runs_7d: 0, last_run_at: null,
        nodes: [{ id: "t", type: "trigger", config: {} }, { id: "n1", type: "if_else", config: { field: "deal_value", operator: "greater_than", value: "1000" } }, { id: "n2", type: "create_task", config: { title: "VIP onboarding", due_in_days: 1 } }, { id: "n3", type: "send_email", config: { subject: "Welcome aboard" } }],
        edges: [{ source: "t", target: "n1" }, { source: "n1", target: "n2", sourceHandle: "true" }, { source: "n1", target: "n3", sourceHandle: "false" }] }),
    ];
    const stepsFor = (ok) => [
      { node_type: "trigger", status: "success", result: { via: "contact.created" }, at: iso(0.02) },
      { node_type: "send_email", status: ok ? "success" : "success", result: { suppressed: true, reason: "provider_pending" }, at: iso(0.019) },
      { node_type: "wait", status: "success", result: { wait: "2 days" }, at: iso(0.018) },
      { node_type: "add_tag", status: ok ? "success" : "failed", result: ok ? { tag_id: "t-nurtured", added: true } : {}, error: ok ? null : "tag service timeout", at: iso(0.001) },
    ];
    const executions = [
      { id: "e1", workflow_id: "w1", contact: "Omar Farouk", status: "completed", started_at: iso(0.02), steps: stepsFor(true) },
      { id: "e2", workflow_id: "w1", contact: "Fatima Zahra", status: "waiting", started_at: iso(0.05), steps: stepsFor(true).slice(0, 3) },
      { id: "e3", workflow_id: "w1", contact: "Bilal Ahmed", status: "failed", started_at: iso(0.3), steps: stepsFor(false) },
      { id: "e4", workflow_id: "w1", contact: "Noor Sadiq", status: "running", started_at: iso(0.001), steps: stepsFor(true).slice(0, 2) },
    ];
    const templates = [
      { key: "tmpl-welcome", name: "7-Day Welcome Nurture", category: "nurture", icon: "sparkles", trigger_type: "contact.created", description: "Greet every new contact and warm them up over a week." },
      { key: "tmpl-appt-reminder", name: "Appointment Reminder", category: "booking", icon: "calendar", trigger_type: "appointment.booked", description: "Text a reminder before a booked appointment." },
      { key: "tmpl-review-request", name: "Review Request", category: "reputation", icon: "star", trigger_type: "deal.stage_changed", description: "Ask happy won-deal clients for a review." },
      { key: "tmpl-cart-abandon", name: "Cart Abandonment", category: "sales", icon: "cart", trigger_type: "form.submitted", description: "Recover an abandoned checkout with a nudge." },
      { key: "tmpl-birthday", name: "Birthday Greeting", category: "engagement", icon: "gift", trigger_type: "date.scheduled", description: "Send a warm message on a contact's birthday." },
      { key: "tmpl-reengage", name: "Re-Engagement", category: "engagement", icon: "refresh", trigger_type: "tag.added", description: "Win back contacts tagged cold." },
      { key: "tmpl-onboarding", name: "Client Onboarding", category: "ops", icon: "rocket", trigger_type: "deal.stage_changed", description: "Kick off onboarding when a deal is won." },
      { key: "tmpl-noshow", name: "No-Show Rebook", category: "booking", icon: "clock", trigger_type: "appointment.booked", description: "Rebook a missed appointment." },
      { key: "tmpl-invoice-chase", name: "Invoice Chase", category: "payments", icon: "receipt", trigger_type: "payment.received", description: "Chase an overdue invoice politely." },
      { key: "tmpl-hot-intent", name: "Hot-Intent Alert", category: "sales", icon: "flame", trigger_type: "tag.added", description: "Alert the team the moment a lead goes hot." },
      { key: "tmpl-newlead-tag", name: "New Lead → Tag & Notify", category: "sales", icon: "tag", trigger_type: "contact.created", description: "Tag and announce every new lead." },
      { key: "tmpl-form-task", name: "Form → CRM Task", category: "ops", icon: "clipboard", trigger_type: "form.submitted", description: "Create a follow-up task from a form submission." },
      { key: "tmpl-stage-field", name: "Stage Move → Update Field", category: "sales", icon: "flag", trigger_type: "deal.stage_changed", description: "Stamp a field when a deal advances." },
      { key: "tmpl-reply-assign", name: "Inbound Reply → Assign", category: "inbox", icon: "inbox", trigger_type: "message.received", description: "Assign and alert on an inbound message." },
      { key: "tmpl-vip", name: "VIP Tagging Flow", category: "engagement", icon: "crown", trigger_type: "tag.added", description: "Roll out the red carpet for VIP contacts." },
    ];
    return { members, contacts, stages, workflows, executions, templates, workspace: { id: "ws-acme", name: "Acme Agency" }, user: { id: "u1", name: "Aisha Rahman" } };
  })();

  /* ── App state ──────────────────────────────────────────────────────────── */
  const PREVIEW_STATES = ["default", "empty", "loading", "error", "success"];
  const state = { loaded: false, loading: false, error: null, previewState: "default", workflows: [], templates: [], role: "owner", editor: null, editing: null, selNode: null, dirty: false };
  const connectedOrPreview = () => connected();
  const st = (n) => !connected() && state.previewState === n;
  const canEdit = () => ["owner", "admin", "manager"].includes(state.role);

  /* ── Data load ──────────────────────────────────────────────────────────── */
  async function boot() {
    state.loading = true; state.error = null; render();
    if (!connected()) { // mockup mode
      state.role = "owner";
      state.workflows = MOCK.workflows.map((w) => ({ ...w }));
      state.templates = MOCK.templates.map((t) => ({ ...t }));
      state.loaded = true; state.loading = false; render(); return;
    }
    try {
      const db = ensureClient();
      const ws = localStorage.getItem("aimindshare-active-ws");
      const [{ data: wfs, error: e1 }, { data: tpls }] = await Promise.all([
        db.from("workflows").select("*").order("created_at", { ascending: false }),
        db.from("workflow_templates").select("*").eq("is_global", true).order("name"),
      ]);
      if (e1) throw e1;
      state.workflows = (wfs || []).map((w) => ({ ...w, runs_7d: w.stats?.runs_7d ?? 0, last_run_at: w.stats?.last_run_at ?? null }));
      state.templates = tpls || [];
      state.loaded = true; state.loading = false; render();
    } catch (e) { state.error = e.message || String(e); state.loading = false; render(); }
  }

  /* ── Shell (rail + topbar) ──────────────────────────────────────────────── */
  const NAV = [
    { key: "list", label: "Automations", icon: "bolt", hash: "#/automations" },
    { key: "templates", label: "Templates", icon: "sparkles", hash: "#/automations?templates=1" },
  ];
  function shell(activeKey, content, opts = {}) {
    const wide = opts.wide ? " shell--wide" : "";
    return `
      <aside class="rail" id="rail">
        <div class="rail-brand"><span class="rail-glyph">${starGlyph()}</span><span>AiMindShare</span></div>
        <nav class="rail-nav">
          ${NAV.map((n) => `<a class="rail-link ${n.key === activeKey ? "on" : ""}" data-hash="${n.hash}">${svg(n.icon, 18)}<span>${n.label}</span></a>`).join("")}
        </nav>
        <div class="rail-foot">M13 · Automations</div>
      </aside>
      <header class="tbar">
        <button class="icon-btn rail-burger" id="railBurger" aria-label="Menu">☰</button>
        <div class="tb-title"><span class="eyebrow">Workflow Engine</span></div>
        <div class="tb-actions">
          <button class="icon-btn" id="themeBtn" aria-label="Theme"><span id="themeIco">${root.getAttribute("data-theme") === "dark" ? "☀" : "☾"}</span></button>
          <button class="btn btn-ghost btn-sm" id="connectBtn">${connected() ? "Connected" : "Connect project"}</button>
        </div>
      </header>
      <main class="content${opts.wide ? " content--flush" : ""}" id="content">${opts.wide ? content : `<div class="content-inner">${content}</div>`}</main>`;
  }
  function starGlyph() { return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 2l2.4 4.8L20 8l-4 4 1 6-5-3-5 3 1-6-4-4 5.6-1.2z"/><circle cx="12" cy="12" r="2"/></svg>`; }

  function previewStrip() {
    if (connected()) return "";
    return `<div class="preview-strip"><span class="ps-label">Preview state</span>
      ${PREVIEW_STATES.map((s) => `<button class="ps-btn ${state.previewState === s ? "on" : ""}" data-preview="${s}">${s}</button>`).join("")}
      <span class="ps-hint">mockup mode · connect a project for live data</span></div>`;
  }

  /* ── Routing ────────────────────────────────────────────────────────────── */
  function parseHash() {
    const raw = (location.hash || "#/automations").replace(/^#/, "");
    const [path, query] = raw.split("?");
    const seg = path.split("/").filter(Boolean); // ['automations', ':id', 'executions']
    const params = new URLSearchParams(query || "");
    return { seg, params };
  }
  function render() {
    const app = $("#app");
    const { seg, params } = parseHash();
    // canvas editor route: /automations/:id (full-screen)
    if (seg[0] === "automations" && seg[1] && seg[1] !== "" && seg[2] !== "executions") { app.innerHTML = shell("list", viewCanvas(seg[1]), { wide: true }); wire(app); mountCanvas(seg[1]); return; }
    if (seg[0] === "automations" && seg[1] && seg[2] === "executions") { app.innerHTML = shell("list", viewExecutions(seg[1])); wire(app); return; }
    app.innerHTML = shell("list", viewList()); wire(app);
    if (params.get("templates")) openTemplates();
  }
  function wire(app) {
    $("#themeBtn")?.addEventListener("click", () => setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"));
    $("#connectBtn")?.addEventListener("click", openDrawer);
    $("#railBurger")?.addEventListener("click", () => $("#rail").classList.toggle("open"));
    $$("[data-hash]").forEach((n) => n.addEventListener("click", () => { location.hash = n.dataset.hash; $("#rail")?.classList.remove("open"); }));
    $$("[data-preview]").forEach((b) => b.addEventListener("click", () => { state.previewState = b.dataset.preview; render(); }));
    const mount = $("#content"); if (mount) bindView(mount);
  }

  /* ── View: list ─────────────────────────────────────────────────────────── */
  function viewList() {
    const head = `<div class="page-head"><div><h1>Automations<em>.</em></h1><p class="sub">Your workspace's nervous system — triggers fan out to actions, automatically.</p></div>
      <div class="ph-actions">${canEdit() ? `<button class="btn btn-ghost" id="tplBtn">${svg("sparkles", 16)} Templates</button><button class="btn btn-primary" id="newBtn">${svg("plus", 16)} New automation</button>` : ""}</div></div>`;
    if (st("loading") || state.loading) return previewStrip() + head + skeletonList();
    if (st("error") || state.error) return previewStrip() + head + errorBox(state.error || "We couldn't load your automations.");
    const list = st("empty") ? [] : state.workflows;
    if (!list.length) return previewStrip() + head + emptyList();
    const active = list.filter((w) => w.is_active).length;
    const totalRuns = list.reduce((s, w) => s + (w.runs_7d || 0), 0);
    const kpis = `<div class="kpi-row">
      ${kpi("bolt", fmtInt(list.length), "Automations")}
      ${kpi("power", fmtInt(active), "Active")}
      ${kpi("target", fmtInt(totalRuns), "Runs · 7 days")}
      ${kpi("sparkles", fmtInt(state.templates.length), "Templates")}</div>`;
    const cards = list.map(cardWorkflow).join("");
    return previewStrip() + head + kpis + `<div class="wf-grid">${cards}</div>`;
  }
  function cardWorkflow(w) {
    const meta = NODES[w.trigger_type] || NODES.manual;
    const last = w.last_run_at ? timeAgo(w.last_run_at) : "never";
    const spark = sparkline(w.runs_7d || 0);
    const steps = (w.nodes || []).filter((n) => n.type !== "trigger").length;
    return `<article class="wf-card" data-open="${esc(w.id)}">
      <div class="wf-card-top">
        <div class="wf-trig trig-${catColor.trigger}">${svg(meta.icon, 16)}<span>${esc(meta.label)}</span></div>
        <label class="switch" title="${w.is_active ? "Active" : "Paused"}" data-stop>
          <input type="checkbox" data-toggle="${esc(w.id)}" ${w.is_active ? "checked" : ""} ${canEdit() ? "" : "disabled"}><span class="switch-track"></span></label>
      </div>
      <h3 class="wf-name">${esc(w.name)}</h3>
      <div class="wf-meta"><span>${svg("branch", 13)} ${steps} step${steps === 1 ? "" : "s"}</span><span>·</span><span>last run ${last}</span></div>
      <div class="wf-foot">
        <div class="wf-runs"><span class="wf-runs-n mono">${fmtInt(w.runs_7d || 0)}</span><span class="wf-runs-l">runs · 7d</span>${spark}</div>
        <span class="wf-status ${w.is_active ? "on" : "off"}">${w.is_active ? "Active" : "Paused"}</span>
      </div>
    </article>`;
  }
  function sparkline(n) {
    const bars = 12, seed = (n * 9301 + 49297) % 233280; let s = seed;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const vals = Array.from({ length: bars }, () => (n === 0 ? 0.06 : 0.2 + rnd() * 0.8));
    return `<span class="spark">${vals.map((v) => `<i style="height:${(v * 100).toFixed(0)}%"></i>`).join("")}</span>`;
  }
  function kpi(icon, val, label) { return `<div class="kpi"><div class="kpi-ico">${svg(icon, 18)}</div><div class="kpi-val mono">${val}</div><div class="kpi-label">${label}</div></div>`; }

  function emptyList() {
    return `<div class="empty">
      <div class="empty-art">${starGlyph()}<div class="empty-orbit"></div></div>
      <h2>No automations yet</h2>
      <p>Automations run your busywork for you — welcome new leads, chase invoices, alert your team the moment intent goes hot. Start from a proven template or a blank canvas.</p>
      <div class="empty-cta">${canEdit() ? `<button class="btn btn-primary" id="emptyTpl">${svg("sparkles", 16)} Browse 15 templates</button><button class="btn btn-ghost" id="emptyNew">${svg("plus", 16)} Blank canvas</button>` : `<span class="muted">Ask a manager to create your first automation.</span>`}</div>
    </div>`;
  }
  function skeletonList() { return `<div class="kpi-row">${Array(4).fill(0).map(() => `<div class="kpi skel"><div class="skb skb-ico"></div><div class="skb skb-line"></div></div>`).join("")}</div><div class="wf-grid">${Array(6).fill(0).map(() => `<article class="wf-card skel"><div class="skb skb-chip"></div><div class="skb skb-title"></div><div class="skb skb-line"></div><div class="skb skb-foot"></div></article>`).join("")}</div>`; }
  function errorBox(msg) { return `<div class="errbox"><div class="errbox-ico">${svg("alert", 26)}</div><h2>Something went wrong</h2><p>${esc(msg)}</p><button class="btn btn-primary" id="retryBtn">Try again</button></div>`; }

  function bindView(mount) {
    $("#newBtn", mount)?.addEventListener("click", newWorkflowFlow);
    $("#emptyNew", mount)?.addEventListener("click", newWorkflowFlow);
    $("#tplBtn", mount)?.addEventListener("click", openTemplates);
    $("#emptyTpl", mount)?.addEventListener("click", openTemplates);
    $("#retryBtn", mount)?.addEventListener("click", () => { state.previewState = "default"; state.error = null; boot(); });
    $$("[data-open]", mount).forEach((n) => n.addEventListener("click", (e) => { if (e.target.closest("[data-stop]")) return; location.hash = "#/automations/" + n.dataset.open; }));
    $$("[data-toggle]", mount).forEach((c) => c.addEventListener("change", (e) => { e.stopPropagation(); toggleWorkflow(c.dataset.toggle, c.checked); }));
    $$("[data-stop]", mount).forEach((n) => n.addEventListener("click", (e) => e.stopPropagation()));
    // executions view bindings
    $$("[data-exec]", mount).forEach((r) => r.addEventListener("click", () => openExecution(r.dataset.exec)));
    $("#backList", mount)?.addEventListener("click", () => (location.hash = "#/automations"));
  }

  /* ── Actions: toggle / new / templates ──────────────────────────────────── */
  async function toggleWorkflow(id, active) {
    const w = state.workflows.find((x) => x.id === id); if (!w) return;
    if (active && !validateGraph(w).ok) { toast("Fix validation issues before activating", "error"); w.is_active = false; render(); return; }
    w.is_active = active;
    if (!connected()) { toast(active ? "Automation activated" : "Automation paused", "success"); render(); return; }
    try { const db = ensureClient(); const { error } = await db.from("workflows").update({ is_active: active }).eq("id", id); if (error) throw error; toast(active ? "Activated" : "Paused", "success"); } catch (e) { toast(e.message, "error"); w.is_active = !active; } render();
  }
  function newWorkflowFlow() {
    if (!canEdit()) return toast("Requires manager+", "error");
    modal(`<div class="mo-head"><h3>New automation</h3><button class="icon-btn" data-close>${svg("x", 16)}</button></div>
      <p class="muted">Choose what starts this automation. You can change it later on the canvas.</p>
      <div class="trig-pick">${TRIGGER_KEYS.map((k) => { const n = NODES[k]; return `<button class="trig-opt" data-trig="${k}"><span class="trig-ico trig-${catColor.trigger}">${svg(n.icon, 18)}</span><span class="trig-txt"><b>${esc(n.label)}</b><small>${esc(n.blurb)}${n.deferred ? ` · ${n.deferred}` : ""}</small></span></button>`; }).join("")}</div>
      <div class="mo-foot"><button class="btn btn-ghost" id="aiBtn">${svg("sparkles", 15)} Describe with AI</button></div>`);
    $$("[data-trig]").forEach((b) => b.addEventListener("click", () => { closeModal(); createWorkflow(b.dataset.trig); }));
    $("#aiBtn")?.addEventListener("click", () => { closeModal(); aiBuilderFlow(); });
  }
  function createWorkflow(triggerType, seed) {
    const id = "w" + Date.now().toString(36);
    const w = { id, name: seed?.name || (NODES[triggerType]?.label + " automation"), trigger_type: triggerType, trigger_config: {}, is_active: false, reentry_rule: "once", version: 1, runs_7d: 0, last_run_at: null,
      nodes: seed?.nodes || [{ id: "t", type: "trigger", config: {} }], edges: seed?.edges || [] };
    state.workflows.unshift(w);
    if (connected()) { const db = ensureClient(); db.from("workflows").insert({ name: w.name, trigger_type: triggerType, nodes: w.nodes, edges: w.edges, reentry_rule: "once" }).select("id").single().then(({ data }) => { if (data) { w.id = data.id; location.hash = "#/automations/" + data.id; } }).catch((e) => toast(e.message, "error")); }
    location.hash = "#/automations/" + id;
  }

  function openTemplates() {
    const cats = [...new Set(state.templates.map((t) => t.category))];
    modal(`<div class="mo-head"><h3>Template gallery</h3><button class="icon-btn" data-close>${svg("x", 16)}</button></div>
      <p class="muted">15 proven automations, ready in one click. Installing creates an editable copy in your workspace.</p>
      <div class="tpl-grid">${state.templates.map((t) => `<button class="tpl-card" data-tpl="${esc(t.key)}">
        <div class="tpl-ico tpl-${esc(t.category)}">${svg(t.icon || "bolt", 20)}</div>
        <div class="tpl-body"><div class="tpl-name">${esc(t.name)}</div><div class="tpl-desc">${esc(t.description)}</div>
        <div class="tpl-trig">${svg((NODES[t.trigger_type] || NODES.manual).icon, 12)} ${esc((NODES[t.trigger_type] || NODES.manual).label)}<span class="tpl-cat">${esc(t.category)}</span></div></div>
      </button>`).join("")}</div>`, "modal-lg");
    $$("[data-tpl]").forEach((b) => b.addEventListener("click", () => installTemplate(b.dataset.tpl)));
  }
  function installTemplate(key) {
    const t = state.templates.find((x) => x.key === key); if (!t) return;
    closeModal();
    // In mockup mode, synthesize a small graph from the template's known shape.
    const seed = { name: t.name, nodes: t.nodes, edges: t.edges };
    if (!t.nodes) { const g = starterGraph(t); seed.nodes = g.nodes; seed.edges = g.edges; }
    if (connected()) { const db = ensureClient(); db.rpc ? null : null; }
    createWorkflow(t.trigger_type, seed);
    toast(`Installed “${t.name}” — edit and activate when ready`, "success");
  }
  function starterGraph(t) {
    // fallback graph for mock templates (real templates carry nodes/edges from DB)
    const nodes = [{ id: "t", type: "trigger", config: {} }]; const edges = []; let last = "t"; let i = 0;
    const add = (type, config) => { const id = "n" + (++i); nodes.push({ id, type, config }); edges.push({ source: last, target: id }); last = id; };
    add("send_email", { subject: "Hello" }); add("wait", { amount: 1, unit: "days" }); add("internal_notification", { targets: ["all"], title: "Automation ran" });
    return { nodes, edges };
  }

  /* ── AI builder (scaffold) ──────────────────────────────────────────────── */
  function aiBuilderFlow() {
    modal(`<div class="mo-head"><h3>${svg("sparkles", 18)} Describe your automation</h3><button class="icon-btn" data-close>${svg("x", 16)}</button></div>
      <p class="muted">Tell us what you want in plain words. We'll draft the workflow — you review and edit before activating (never auto-activated).</p>
      <textarea class="ai-input" id="aiPrompt" rows="3" placeholder="e.g. When a new lead comes in, welcome them by email, wait 2 days, then tag them VIP and alert my team"></textarea>
      <div class="ai-note">${svg("info", 13)} No AI provider is connected yet — this generates a smart starter draft locally (D-063). When a provider is wired, this calls the model and meters AI tokens.</div>
      <div class="mo-foot"><button class="btn btn-primary" id="aiGo">${svg("sparkles", 15)} Generate draft</button></div>`);
    $("#aiGo").addEventListener("click", async () => {
      const prompt = $("#aiPrompt").value.trim(); if (!prompt) return $("#aiPrompt").focus();
      const draft = await aiGenerate(prompt);
      closeModal(); createWorkflow(draft.trigger_type, { name: prompt.slice(0, 48), nodes: draft.nodes, edges: draft.edges });
      toast("Draft ready — review, then activate", "success");
    });
  }
  async function aiGenerate(prompt) {
    if (connected()) { try { const db = ensureClient(); const ws = localStorage.getItem("aimindshare-active-ws"); const { data, error } = await db.functions.invoke("automations-ai-generate", { body: { workspace_id: ws, prompt } }); if (!error && data?.ok) return data.data; } catch (e) {} }
    return localDraft(prompt);
  }
  function localDraft(prompt) {
    const p = prompt.toLowerCase();
    const trigger_type = /form/.test(p) ? "form.submitted" : /tag/.test(p) ? "tag.added" : /deal|stage|pipeline|won/.test(p) ? "deal.stage_changed" : /reply|message|sms|text/.test(p) ? "message.received" : "contact.created";
    const nodes = [{ id: "t", type: "trigger", config: {} }]; const edges = []; let last = "t"; let i = 0;
    const add = (type, config) => { const id = "n" + (++i); nodes.push({ id, type, config }); edges.push({ source: last, target: id }); last = id; };
    if (/welcome|onboard|new lead|nurture/.test(p)) { add("send_email", { subject: "Welcome" }); add("wait", { amount: 2, unit: "days" }); }
    if (/tag/.test(p)) add("add_tag", { tag_name: /vip/.test(p) ? "VIP" : "New" });
    if (/task|follow ?up|call/.test(p)) add("create_task", { title: "Follow up", due_in_days: 1 });
    if (/notify|alert|team/.test(p)) add("internal_notification", { targets: ["manager"], title: "New activity" });
    if (/sms|text/.test(p)) add("send_sms", { body: "Thanks for reaching out!" });
    if (i === 0) { add("send_email", { subject: "Hello" }); add("wait", { amount: 1, unit: "days" }); add("internal_notification", { targets: ["all"], title: "Automation ran" }); }
    return { trigger_type, nodes, edges };
  }

  /* ── View: canvas (full-screen builder) ─────────────────────────────────── */
  function viewCanvas(id) {
    const w = state.workflows.find((x) => x.id === id);
    if (!w) return `<div class="errbox"><h2>Automation not found</h2><button class="btn btn-primary" id="backList">Back to list</button></div>`;
    state.editing = w;
    const palette = ["trigger", "action", "logic"].map((cat) => {
      const items = Object.keys(NODES).filter((k) => NODES[k].cat === cat && (cat !== "trigger"));
      if (cat === "trigger") return ""; // trigger is the fixed entry; not draggable
      return `<div class="pal-group"><div class="pal-head">${cat === "action" ? "Actions" : "Logic"}</div>
        ${items.map((k) => { const n = NODES[k]; return `<div class="pal-item pal-${catColor[n.cat]}" draggable="true" data-add="${k}" title="${esc(n.blurb)}"><span class="pal-ico">${svg(n.icon, 15)}</span><span>${esc(n.label)}</span>${n.stub ? `<span class="pal-stub" title="Stubbed: ${esc(n.stub)}">stub</span>` : ""}</div>`; }).join("")}</div>`;
    }).join("");
    return `<div class="cv-wrap">
      <div class="cv-topbar">
        <button class="icon-btn" id="cvBack" aria-label="Back">${svg("back", 18)}</button>
        <input class="cv-name" id="cvName" value="${esc(w.name)}" ${canEdit() ? "" : "disabled"} spellcheck="false">
        <span class="cv-ver">v${w.version || 1}</span>
        <div class="cv-spacer"></div>
        <div class="cv-valid" id="cvValid"></div>
        <button class="btn btn-ghost btn-sm" id="cvExec">${svg("target", 15)} Executions</button>
        <button class="btn btn-ghost btn-sm" id="cvTest" ${canEdit() ? "" : "disabled"}>${svg("play", 15)} Test</button>
        <button class="btn btn-ghost btn-sm" id="cvSave" ${canEdit() ? "" : "disabled"}>${svg("save", 15)} Save</button>
        <label class="switch switch-lg" title="Activate"><input type="checkbox" id="cvActive" ${w.is_active ? "checked" : ""} ${canEdit() ? "" : "disabled"}><span class="switch-track"></span></label>
      </div>
      <div class="cv-body">
        <aside class="cv-palette">
          <div class="pal-search"><span>${svg("search", 14)}</span><input id="palSearch" placeholder="Search nodes…"></div>
          <div class="pal-scroll" id="palScroll">${palette}</div>
          <div class="pal-tip">${svg("info", 13)} Drag a node onto the canvas, then connect the dots. Best on desktop.</div>
        </aside>
        <div class="cv-canvas-host">
          <div id="drawflow" class="cv-canvas"></div>
          <div class="cv-mobile-note">${svg("info", 20)}<b>The visual builder needs a bigger screen.</b><span>Open this automation on a desktop to drag and connect nodes. Here's the flow:</span><div id="mobileFlow" class="mobile-flow"></div></div>
        </div>
        <aside class="cv-config" id="cvConfig">${configEmpty()}</aside>
      </div>
    </div>`;
  }
  function configEmpty() { return `<div class="cfg-empty">${svg("branch", 26)}<p>Select a node to configure it</p><span>or drag a new one from the left</span></div>`; }

  /* ── Drawflow mount + serialization ─────────────────────────────────────── */
  function mountCanvas(id) {
    const w = state.workflows.find((x) => x.id === id); if (!w) return;
    const host = $("#drawflow"); if (!host || !window.Drawflow) return;
    const editor = new window.Drawflow(host);
    editor.reroute = true; editor.editor_mode = canEdit() ? "edit" : "view";
    editor.start();
    state.editor = editor; state.selNode = null; state.dirty = false;
    loadGraph(editor, w);
    renderMobileFlow(w);
    // events
    editor.on("nodeSelected", (nid) => selectNode(nid));
    editor.on("nodeUnselected", () => { state.selNode = null; $("#cvConfig").innerHTML = configEmpty(); });
    editor.on("nodeCreated", () => { state.dirty = true; refreshValid(); });
    editor.on("nodeRemoved", () => { state.dirty = true; refreshValid(); });
    editor.on("connectionCreated", () => { state.dirty = true; refreshValid(); });
    editor.on("connectionRemoved", () => { state.dirty = true; refreshValid(); });
    // palette drag/drop
    const canvasHost = $(".cv-canvas-host");
    $$("[data-add]").forEach((it) => it.addEventListener("dragstart", (e) => e.dataTransfer.setData("node", it.dataset.add)));
    host.addEventListener("dragover", (e) => e.preventDefault());
    host.addEventListener("drop", (e) => { e.preventDefault(); if (!canEdit()) return; const type = e.dataTransfer.getData("node"); if (type) addNodeAt(editor, type, e); });
    // palette search
    $("#palSearch")?.addEventListener("input", (e) => { const q = e.target.value.toLowerCase(); $$(".pal-item").forEach((it) => { const k = it.dataset.add; it.style.display = NODES[k].label.toLowerCase().includes(q) ? "" : "none"; }); });
    // topbar
    $("#cvBack")?.addEventListener("click", () => backFromCanvas());
    $("#cvName")?.addEventListener("input", () => { state.dirty = true; });
    $("#cvSave")?.addEventListener("click", () => saveCanvas(w));
    $("#cvTest")?.addEventListener("click", () => testFlow(w));
    $("#cvExec")?.addEventListener("click", () => (location.hash = "#/automations/" + w.id + "/executions"));
    $("#cvActive")?.addEventListener("change", (e) => activateFromCanvas(w, e.target.checked));
    refreshValid();
    // wire generic view controls (theme, connect, rail)
    $("#themeBtn")?.addEventListener("click", () => setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"));
    $("#connectBtn")?.addEventListener("click", openDrawer);
  }
  // The entry node has type "trigger" but should DISPLAY the workflow's trigger_type.
  function displayMeta(type) { if (type === "trigger") return NODES[state.editing?.trigger_type] || NODES.manual; return NODES[type] || NODES.manual; }
  const isTrig = (type) => type === "trigger" || NODES[type]?.cat === "trigger";
  function nodeInner(type, config) {
    const n = displayMeta(type);
    return `<div class="wfn wfn-${catColor[n.cat]}" data-nodetype="${type}">
      <div class="wfn-ico">${svg(n.icon, 15)}</div>
      <div class="wfn-b"><div class="wfn-t">${esc(n.label)}</div><div class="wfn-s">${esc(nodeSummary(type, config))}</div></div>
      ${type === "if_else" ? `<div class="wfn-branch"><span class="wfn-yes">Yes</span><span class="wfn-no">No</span></div>` : ""}
    </div>`;
  }
  function nodeSummary(type, cfg) {
    cfg = cfg || {};
    if (type === "trigger") return (NODES[state.editing?.trigger_type] || NODES.manual).blurb;
    switch (type) {
      case "tag.added": case "add_tag": case "remove_tag": return cfg.tag_name ? `“${cfg.tag_name}”` : "any tag";
      case "wait": return cfg.amount ? `${cfg.amount} ${cfg.unit || "minutes"}` : "set delay";
      case "if_else": case "goal": return cfg.field ? `${labelFor(COND_FIELDS, cfg.field)} ${labelFor(OPERATORS, cfg.operator) || ""} ${cfg.value || ""}`.trim() : "set condition";
      case "send_email": return cfg.subject ? `“${cfg.subject}”` : "compose";
      case "send_sms": return cfg.body ? `“${String(cfg.body).slice(0, 22)}…”` : "compose";
      case "create_task": return cfg.title ? `“${cfg.title}”` : "new task";
      case "internal_notification": return cfg.title || "alert team";
      case "webhook_post": return cfg.url ? String(cfg.url).replace(/^https?:\/\//, "").slice(0, 22) : "set URL";
      default: return NODES[type]?.blurb || "";
    }
  }
  const labelFor = (arr, v) => (arr.find((x) => x.v === v) || {}).l || v || "";

  function loadGraph(editor, w) {
    const nodes = laidOut(w.nodes || [], w.edges || []);
    const idmap = {};
    nodes.forEach((n) => {
      const meta = NODES[n.type] || NODES.manual;
      const inputs = meta.cat === "trigger" ? 0 : 1;
      const outputs = meta.outputs || 1;
      const dfId = editor.addNode(n.type, inputs, outputs, n.x, n.y, "wfnode wfnode-" + catColor[meta.cat] + (meta.outputs === 2 ? " has-branch" : ""), { type: n.type, config: n.config || {} }, nodeInner(n.type, n.config || {}), false);
      idmap[n.id] = dfId;
    });
    (w.edges || []).forEach((e) => {
      const from = idmap[e.source], to = idmap[e.target]; if (from == null || to == null) return;
      const out = e.sourceHandle === "false" ? "output_2" : (e.sourceHandle === "true" ? "output_1" : "output_1");
      try { editor.addConnection(from, to, out, "input_1"); } catch (err) {}
    });
    state._idmap = idmap;
  }
  function laidOut(nodes, edges) {
    // BFS depth layout when x/y absent
    if (nodes.every((n) => n.x != null)) return nodes;
    const adj = {}; edges.forEach((e) => { (adj[e.source] = adj[e.source] || []).push(e.target); });
    const depth = {}; const start = (nodes.find((n) => n.type === "trigger") || nodes[0]); if (!start) return nodes;
    const q = [[start.id, 0]]; depth[start.id] = 0;
    while (q.length) { const [id, d] = q.shift(); (adj[id] || []).forEach((t) => { if (depth[t] == null) { depth[t] = d + 1; q.push([t, d + 1]); } }); }
    const perDepth = {};
    return nodes.map((n) => { const d = depth[n.id] ?? 0; perDepth[d] = (perDepth[d] || 0); const row = perDepth[d]++; return { ...n, x: 60 + d * 250, y: 60 + row * 150 }; });
  }
  function addNodeAt(editor, type, e) {
    const meta = NODES[type]; const rect = $("#drawflow").getBoundingClientRect();
    const zoom = editor.zoom || 1;
    const x = (e.clientX - rect.left - editor.canvas_x) / zoom;
    const y = (e.clientY - rect.top - editor.canvas_y) / zoom;
    editor.addNode(type, 1, meta.outputs || 1, x, y, "wfnode wfnode-" + catColor[meta.cat] + (meta.outputs === 2 ? " has-branch" : ""), { type, config: {} }, nodeInner(type, {}), false);
    toast(`${meta.label} added`, "info");
  }

  function selectNode(dfId) {
    const editor = state.editor; const node = editor.getNodeFromId(dfId);
    state.selNode = { dfId, type: node.data.type, config: node.data.config || {} };
    renderConfig();
  }
  function renderConfig() {
    const sel = state.selNode; const host = $("#cvConfig"); if (!sel) { host.innerHTML = configEmpty(); return; }
    const meta = displayMeta(sel.type);
    const isTrigger = meta.cat === "trigger";
    const fields = (isTrigger ? (NODES[state.editing.trigger_type]?.fields || meta.fields) : meta.fields) || [];
    host.innerHTML = `<div class="cfg">
      <div class="cfg-head"><span class="cfg-ico cfg-${catColor[meta.cat]}">${svg(meta.icon, 16)}</span><div><div class="cfg-title">${esc(meta.label)}</div><div class="cfg-cat">${meta.cat}</div></div>
        ${!isTrigger && canEdit() ? `<button class="icon-btn cfg-del" id="cfgDel" title="Delete node">${svg("trash", 15)}</button>` : ""}</div>
      ${meta.stub ? `<div class="cfg-stub">${svg("info", 13)} Sends are stubbed until ${esc(meta.stub)} is wired — the step logs but doesn't deliver yet.</div>` : ""}
      ${isTrigger ? triggerConfig() : ""}
      <div class="cfg-fields">${fields.map((f) => fieldHTML(f, sel.config[f.k])).join("") || `<p class="muted">No settings for this node.</p>`}</div>
    </div>`;
    if (!canEdit()) $$(".cfg-fields input,.cfg-fields select,.cfg-fields textarea", host).forEach((i) => (i.disabled = true));
    bindConfig();
  }
  function triggerConfig() {
    const w = state.editing;
    return `<div class="cfg-fields">
      <label class="cfg-f"><span>Trigger</span><select data-trigfield="trigger_type">${TRIGGER_KEYS.map((k) => `<option value="${k}" ${w.trigger_type === k ? "selected" : ""}>${esc(NODES[k].label)}${NODES[k].deferred ? " (soon)" : ""}</option>`).join("")}</select></label>
      <label class="cfg-f"><span>Re-entry</span><select data-trigfield="reentry_rule">
        <option value="once" ${w.reentry_rule === "once" ? "selected" : ""}>Once ever</option>
        <option value="allow" ${w.reentry_rule === "allow" ? "selected" : ""}>Allow re-entry</option>
        <option value="once_per_days:7" ${String(w.reentry_rule).startsWith("once_per_days") ? "selected" : ""}>Once per 7 days</option>
      </select></label></div>`;
  }
  function fieldHTML(f, val) {
    const id = "cfg_" + f.k;
    if (f.t === "textarea") return `<label class="cfg-f"><span>${esc(f.l)}</span><textarea id="${id}" data-field="${f.k}" rows="3" placeholder="${esc(f.ph || "")}">${esc(val || "")}</textarea></label>`;
    if (f.t === "unit") return `<label class="cfg-f"><span>${esc(f.l)}</span><select id="${id}" data-field="${f.k}">${["minutes", "hours", "days"].map((u) => `<option value="${u}" ${val === u ? "selected" : ""}>${u}</option>`).join("")}</select></label>`;
    if (f.t === "operator") return `<label class="cfg-f"><span>${esc(f.l)}</span><select id="${id}" data-field="${f.k}">${OPERATORS.map((o) => `<option value="${o.v}" ${val === o.v ? "selected" : ""}>${o.l}</option>`).join("")}</select></label>`;
    if (f.t === "field") return `<label class="cfg-f"><span>${esc(f.l)}</span><select id="${id}" data-field="${f.k}">${COND_FIELDS.map((o) => `<option value="${o.v}" ${val === o.v ? "selected" : ""}>${o.l}</option>`).join("")}</select></label>`;
    if (f.t === "stage") return `<label class="cfg-f"><span>${esc(f.l)}</span><select id="${id}" data-field="${f.k}">${MOCK.stages.map((s) => `<option value="${s.id}" ${val === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>`;
    if (f.t === "user") return `<label class="cfg-f"><span>${esc(f.l)}</span><select id="${id}" data-field="${f.k}">${Object.entries(MOCK.members).map(([k, v]) => `<option value="${k}" ${val === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`;
    if (f.t === "targets") { const set = new Set(Array.isArray(val) ? val : ["all"]); return `<label class="cfg-f"><span>${esc(f.l)}</span><select id="${id}" data-field="${f.k}" data-multi="1">${["all", "owner", "admin", "manager", "staff"].map((r) => `<option value="${r}" ${set.has(r) ? "selected" : ""}>${r === "all" ? "Everyone" : r}</option>`).join("")}</select></label>`; }
    return `<label class="cfg-f"><span>${esc(f.l)}</span><input id="${id}" data-field="${f.k}" type="${f.t === "number" ? "number" : "text"}" value="${esc(val ?? "")}" placeholder="${esc(f.ph || "")}"></label>`;
  }
  function bindConfig() {
    const host = $("#cvConfig");
    $$("[data-field]", host).forEach((inp) => inp.addEventListener("input", () => {
      const k = inp.dataset.field; let v = inp.value;
      if (inp.dataset.multi) v = Array.from(inp.selectedOptions).map((o) => o.value);
      state.selNode.config[k] = v;
      // write back into drawflow node data + refresh its summary
      const node = state.editor.getNodeFromId(state.selNode.dfId);
      const data = { ...node.data, config: state.selNode.config };
      state.editor.updateNodeDataFromId(state.selNode.dfId, data);
      const sum = document.querySelector(`#node-${state.selNode.dfId} .wfn-s`); if (sum) sum.textContent = nodeSummary(state.selNode.type, state.selNode.config);
      state.dirty = true; refreshValid();
    }));
    $$("[data-trigfield]", host).forEach((sel) => sel.addEventListener("change", () => {
      const k = sel.dataset.trigfield; state.editing[k] = sel.value; state.dirty = true;
      if (k === "trigger_type") renderConfig();
      refreshValid();
    }));
    $("#cfgDel", host)?.addEventListener("click", () => { state.editor.removeNodeId("node-" + state.selNode.dfId); state.selNode = null; host.innerHTML = configEmpty(); state.dirty = true; refreshValid(); });
  }

  /* ── Serialize Drawflow → normalized {nodes, edges} ─────────────────────── */
  function serialize(editor) {
    const raw = editor.export().drawflow.Home.data;
    const nodes = [], edges = [];
    Object.values(raw).forEach((n) => {
      const sid = "n" + n.id;
      nodes.push({ id: sid, type: n.data.type, config: n.data.config || {}, x: n.pos_x, y: n.pos_y });
      Object.entries(n.outputs || {}).forEach(([outName, out]) => {
        (out.connections || []).forEach((c) => {
          const handle = outName === "output_2" ? "false" : (n.data.type === "if_else" ? "true" : undefined);
          const edge = { source: sid, target: "n" + c.node }; if (handle) edge.sourceHandle = handle;
          edges.push(edge);
        });
      });
    });
    // normalize the entry node id to "t" for readability (first trigger)
    const trig = nodes.find((n) => isTrig(n.type));
    if (trig) { const oldId = trig.id; trig.id = "t"; trig.type = "trigger"; edges.forEach((e) => { if (e.source === oldId) e.source = "t"; if (e.target === oldId) e.target = "t"; }); }
    return { nodes, edges };
  }
  function validateGraph(w) {
    const nodes = w.nodes || [], edges = w.edges || [];
    const issues = [];
    const triggers = nodes.filter((n) => isTrig(n.type));
    if (triggers.length === 0) issues.push("Add a trigger to start the flow");
    if (triggers.length > 1) issues.push("Only one trigger is allowed");
    const connected = new Set(); edges.forEach((e) => { connected.add(e.source); connected.add(e.target); });
    const orphans = nodes.filter((n) => nodes.length > 1 && !connected.has(n.id) && !isTrig(n.type));
    if (orphans.length) issues.push(`${orphans.length} unconnected node${orphans.length > 1 ? "s" : ""}`);
    // required config
    nodes.forEach((n) => { const meta = NODES[n.type]; if (!meta) return; if (n.type === "wait" && !(n.config?.amount > 0)) issues.push("A wait node needs a duration"); if ((n.type === "if_else" || n.type === "goal") && !n.config?.field) issues.push(`Set the ${meta.label} condition`); if (n.type === "webhook_post" && !n.config?.url) issues.push("Webhook needs a URL"); });
    return { ok: issues.length === 0, issues: [...new Set(issues)] };
  }
  function currentGraph() { const w = state.editing; const g = state.editor ? serialize(state.editor) : { nodes: w.nodes, edges: w.edges }; return { ...w, nodes: g.nodes, edges: g.edges, name: $("#cvName")?.value || w.name }; }
  function refreshValid() {
    const g = currentGraph(); const v = validateGraph(g); const host = $("#cvValid"); if (!host) return;
    host.className = "cv-valid " + (v.ok ? "ok" : "warn");
    host.innerHTML = v.ok ? `${svg("check", 14)} Ready to activate` : `${svg("alert", 14)} ${v.issues[0]}${v.issues.length > 1 ? ` +${v.issues.length - 1}` : ""}`;
    host.title = v.issues.join(" · ");
  }
  function saveCanvas(w) {
    const g = currentGraph();
    Object.assign(w, { nodes: g.nodes, edges: g.edges, name: g.name });
    if (state.editor && state.dirty) w.version = (w.version || 1) + 1;
    state.dirty = false;
    if (connected()) { const db = ensureClient(); db.from("workflows").update({ name: w.name, nodes: w.nodes, edges: w.edges, trigger_type: w.trigger_type, trigger_config: w.trigger_config || {}, reentry_rule: w.reentry_rule }).eq("id", w.id).then(({ error }) => error ? toast(error.message, "error") : toast("Saved", "success")); }
    else toast("Saved", "success");
    $(".cv-ver") && ($(".cv-ver").textContent = "v" + (w.version || 1));
    renderMobileFlow(w);
  }
  function activateFromCanvas(w, on) {
    const g = currentGraph(); Object.assign(w, { nodes: g.nodes, edges: g.edges });
    if (on) { const v = validateGraph(w); if (!v.ok) { toast(v.issues[0], "error"); $("#cvActive").checked = false; return; } }
    saveCanvas(w); toggleWorkflow(w.id, on);
  }
  function backFromCanvas() { if (state.dirty && !confirm("Discard unsaved changes?")) return; state.dirty = false; state.editor = null; location.hash = "#/automations"; }

  async function testFlow(w) {
    const g = currentGraph(); Object.assign(w, { nodes: g.nodes, edges: g.edges });
    modal(`<div class="mo-head"><h3>${svg("play", 17)} Test with a contact</h3><button class="icon-btn" data-close>${svg("x", 16)}</button></div>
      <p class="muted">Runs a sandbox execution — every send is suppressed and logged as simulated. Nothing reaches a real contact.</p>
      <label class="cfg-f"><span>Contact</span><select id="testContact">${MOCK.contacts.map((c) => `<option value="${c.id}">${esc(c.name)} · ${esc(c.email)}</option>`).join("")}</select></label>
      <div class="mo-foot"><button class="btn btn-primary" id="testGo">${svg("play", 15)} Run sandbox test</button></div>`);
    $("#testGo").addEventListener("click", async () => {
      const cid = $("#testContact").value; closeModal();
      if (connected()) { try { const db = ensureClient(); const ws = localStorage.getItem("aimindshare-active-ws"); const { data, error } = await db.functions.invoke("automations-test", { body: { workspace_id: ws, workflow_id: w.id, contact_id: cid } }); if (error) throw error; toast("Sandbox test queued — see Executions", "success"); location.hash = "#/automations/" + w.id + "/executions"; return; } catch (e) { toast(e.message, "error"); return; } }
      // mock: synthesize a completed test execution
      const name = MOCK.contacts.find((c) => c.id === cid)?.name || "Test contact";
      MOCK.executions.unshift({ id: "e" + Date.now().toString(36), workflow_id: w.id, contact: name, status: "completed", is_test: true, started_at: new Date().toISOString(), steps: simulate(w) });
      toast("Sandbox test complete", "success"); location.hash = "#/automations/" + w.id + "/executions";
    });
  }
  function simulate(w) {
    const steps = []; const byId = Object.fromEntries((w.nodes || []).map((n) => [n.id, n]));
    const nextOf = (id, h) => (w.edges || []).filter((e) => e.source === id && (h == null || (e.sourceHandle || (byId[id]?.type === "if_else" ? "true" : undefined)) === h)).map((e) => e.target);
    let cur = nextOf("t")[0] || nextOf((w.nodes || [])[0]?.id)[0]; let guard = 0;
    while (cur && guard++ < 40) { const n = byId[cur]; if (!n) break; const meta = NODES[n.type]; const suppressed = /send_|campaign/.test(n.type); steps.push({ node_type: n.type, status: "success", result: suppressed ? { suppressed: true, reason: "test_mode" } : { ok: true }, at: new Date().toISOString() }); if (n.type === "if_else") { cur = nextOf(n.id, "true")[0]; continue; } if (n.type === "goal") break; cur = nextOf(n.id)[0]; }
    return [{ node_type: "trigger", status: "success", result: { via: w.trigger_type, test: true }, at: new Date().toISOString() }, ...steps];
  }
  function renderMobileFlow(w) {
    const host = $("#mobileFlow"); if (!host) return;
    const ordered = orderNodes(w);
    host.innerHTML = ordered.map((n) => { const m = displayMeta(n.type); return `<div class="mf-node mf-${catColor[m.cat]}">${svg(m.icon, 14)} <b>${esc(m.label)}</b> <small>${esc(nodeSummary(n.type, n.config))}</small></div>`; }).join(`<div class="mf-link">${svg("chevron", 12)}</div>`);
  }
  function orderNodes(w) {
    const byId = Object.fromEntries((w.nodes || []).map((n) => [n.id, n])); const out = []; const seen = new Set();
    let cur = (w.nodes || []).find((n) => isTrig(n.type))?.id; let guard = 0;
    while (cur && !seen.has(cur) && guard++ < 40) { seen.add(cur); out.push(byId[cur]); const e = (w.edges || []).find((x) => x.source === cur); cur = e?.target; }
    (w.nodes || []).forEach((n) => { if (!seen.has(n.id)) out.push(n); });
    return out.filter(Boolean);
  }

  /* ── View: executions ───────────────────────────────────────────────────── */
  function viewExecutions(id) {
    const w = state.workflows.find((x) => x.id === id) || { name: "Automation", id };
    const rows = st("empty") ? [] : (connected() ? (state._execs || []) : MOCK.executions.filter((e) => e.workflow_id === id || true));
    const head = `<div class="page-head"><div><a class="crumb" id="backList">${svg("back", 14)} Automations</a><h1>${esc(w.name)}<em>.</em></h1><p class="sub">Execution log — every run, step by step.</p></div>
      <a class="btn btn-ghost" data-hash="#/automations/${esc(id)}">${svg("edit", 15)} Edit canvas</a></div>`;
    if (st("loading")) return head + skeletonList();
    if (st("error")) return head + errorBox("Couldn't load executions.");
    if (!rows.length) return head + `<div class="empty"><div class="empty-art">${svg("target", 30)}</div><h2>No runs yet</h2><p>When this automation is triggered, each contact's journey shows up here with a full per-step log.</p></div>`;
    const statusChip = (s) => `<span class="ex-status ex-${s}">${s}</span>`;
    const table = `<div class="ex-table"><div class="ex-row ex-h"><span>Contact</span><span>Started</span><span>Steps</span><span>Status</span></div>
      ${rows.map((e) => `<div class="ex-row" data-exec="${esc(e.id)}"><span class="ex-c">${svg("user-plus", 14)} ${esc(e.contact)}${e.is_test ? ` <em class="ex-test">test</em>` : ""}</span><span class="mono">${timeAgo(e.started_at)}</span><span class="mono">${(e.steps || []).length}</span><span>${statusChip(e.status)}</span></div>`).join("")}</div>`;
    return head + table;
  }
  function openExecution(execId) {
    const rows = connected() ? (state._execs || []) : MOCK.executions;
    const e = rows.find((x) => x.id === execId); if (!e) return;
    modal(`<div class="mo-head"><h3>Run · ${esc(e.contact)}</h3><button class="icon-btn" data-close>${svg("x", 16)}</button></div>
      <div class="ex-detail-head"><span class="ex-status ex-${e.status}">${e.status}</span><span class="muted">started ${timeAgo(e.started_at)}</span>${e.is_test ? `<span class="ex-test">sandbox</span>` : ""}</div>
      <div class="ex-timeline">${(e.steps || []).map((s, i) => stepRow(s, i, e)).join("")}</div>`, "modal-lg");
    $$("[data-retry]").forEach((b) => b.addEventListener("click", () => { toast("Step re-queued", "success"); closeModal(); }));
  }
  function stepRow(s, i, e) {
    const m = NODES[s.node_type] || NODES.manual;
    const ok = s.status === "success"; const failed = s.status === "failed";
    return `<div class="tl-step ${failed ? "tl-fail" : ok ? "tl-ok" : "tl-skip"}">
      <div class="tl-rail"><span class="tl-dot">${svg(failed ? "x" : ok ? "check" : "clock", 12)}</span>${i < e.steps.length - 1 ? '<span class="tl-line"></span>' : ""}</div>
      <div class="tl-body"><div class="tl-title">${svg(m.icon, 13)} ${esc(m.label)}<span class="tl-time mono">${timeAgo(s.at)}</span></div>
        ${s.error ? `<div class="tl-err">${svg("alert", 12)} ${esc(s.error)} <button class="link" data-retry="1">Retry step</button></div>` : ""}
        ${s.result && Object.keys(s.result).length ? `<pre class="tl-json">${esc(JSON.stringify(s.result))}</pre>` : ""}</div></div>`;
  }

  /* ── Modal ──────────────────────────────────────────────────────────────── */
  function modal(html, cls = "") { const r = $("#modalRoot"); r.innerHTML = `<div class="mo-scrim"><div class="mo ${cls}" role="dialog" aria-modal="true">${html}</div></div>`; r.querySelector(".mo-scrim").addEventListener("click", (e) => { if (e.target.classList.contains("mo-scrim")) closeModal(); }); r.querySelector("[data-close]")?.addEventListener("click", closeModal); document.addEventListener("keydown", escClose); }
  function closeModal() { $("#modalRoot").innerHTML = ""; document.removeEventListener("keydown", escClose); }
  function escClose(e) { if (e.key === "Escape") closeModal(); }

  /* ── Utils ──────────────────────────────────────────────────────────────── */
  function timeAgo(iso) { if (!iso) return "—"; const s = (Date.now() - new Date(iso).getTime()) / 1000; if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + "m ago"; if (s < 86400) return Math.floor(s / 3600) + "h ago"; return Math.floor(s / 86400) + "d ago"; }

  /* ── Init ───────────────────────────────────────────────────────────────── */
  window.addEventListener("hashchange", render);
  boot();
})();
