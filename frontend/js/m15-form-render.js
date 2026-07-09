/* m15-form-render.js — AiMindShare M15 public form/survey/quiz renderer (no auth).
   Used by f.html standalone AND inside the embed iframe. Fetches the public-safe
   definition from the `public-form` Edge Fn by ?token=, renders every field type,
   runs a client validator + conditional-logic engine that STRUCTURALLY MIRROR
   _shared/formValidator.ts (server re-validates authoritatively), handles multi-step
   with per-step validation + view/step beacons, honeypot + time-trap, and every
   submit outcome (complete / pending_confirmation / validation_failed / spam_rejected).
   Offline / no backend → a labelled SAMPLE form (never blank). Only the anon key ever
   touches the browser (Law 3); all privileged work is the service-role Edge Fn. */
(() => {
  "use strict";
  const root = document.getElementById("form-root");
  if (!root) return;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ── URL params ───────────────────────────────────────────────────────────── */
  const params = new URLSearchParams(location.search);
  const TOKEN = params.get("token") || "";
  const EMBED = params.get("embed") === "1";
  if (EMBED) document.body.classList.add("embed");

  // Embed auto-size: when in an iframe, report content height to the host embed.js so
  // an inline iframe can size itself to the form. Namespaced message, safe to ignore.
  function reportHeight() {
    if (!EMBED || window.parent === window) return;
    try {
      const h = Math.max(document.body.scrollHeight, (root && root.scrollHeight) || 0) + 8;
      window.parent.postMessage({ __aims_form: true, type: "height", token: TOKEN, height: h }, "*");
    } catch (e) {}
  }
  if (EMBED) {
    window.addEventListener("load", reportHeight);
    // Re-report on any DOM change (step nav, validation lines, result screen).
    if (window.ResizeObserver) { try { new ResizeObserver(reportHeight).observe(document.body); } catch (e) {} }
    else { setInterval(reportHeight, 500); }
  }

  // UTM capture straight off the URL (utm_source/medium/campaign/term/content).
  const UTM = (() => {
    const u = {};
    params.forEach((v, k) => { if (/^utm_/i.test(k)) u[k.toLowerCase()] = v; });
    return u;
  })();

  /* ── Visitor id (persisted for sticky A/B) ────────────────────────────────── */
  const VISITOR = (() => {
    try {
      let v = localStorage.getItem("aims_visitor");
      if (!v) { v = "v_" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("aims_visitor", v); }
      return v;
    } catch (e) { return "anon"; }
  })();

  /* ── Config / anon client (fail-soft → mockup mode) ───────────────────────── */
  function getCfg() {
    try { const s = JSON.parse(localStorage.getItem("aimindshare-supabase") || "null"); if (s && s.url) return s; } catch (e) {}
    const g = window.AIMINDSHARE_CONFIG;
    if (g && g.SUPABASE_URL && !/YOUR-/.test(g.SUPABASE_URL)) return { url: g.SUPABASE_URL, anon: g.SUPABASE_ANON_KEY };
    return null;
  }
  const cfg = getCfg();
  const live = !!(cfg && TOKEN);

  async function callFn(method, query, body) {
    const url = `${cfg.url}/functions/v1/public-form${query || ""}`;
    const res = await fetch(url, {
      method,
      headers: { apikey: cfg.anon || "", Authorization: `Bearer ${cfg.anon || ""}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) throw new Error(json.message || json.error || "Request failed");
    return json.data;
  }

  /* ── Accent → token map (never inject raw hex from user input; clamp to a safe
        token set, exactly the builder's ACCENTS). Applied via CSS var. ───────── */
  const ACCENT_TOKENS = { teal: "--teal-500", gold: "--gold-500", deep: "--teal-700", ink: "--ink-900" };
  const ACCENT_GLOW = { teal: "rgba(44,164,171,.15)", gold: "rgba(197,160,89,.18)", deep: "rgba(0,105,110,.15)", ink: "rgba(15,42,44,.12)" };
  const ACCENT_TINT = { teal: "rgba(44,164,171,.08)", gold: "rgba(197,160,89,.08)", deep: "rgba(0,105,110,.06)", ink: "rgba(15,42,44,.05)" };
  function applyAccent(name) {
    const key = ACCENT_TOKENS[name] ? name : "teal"; // clamp to a known-safe accent
    root.style.setProperty("--_accent", `var(${ACCENT_TOKENS[key]})`);
    root.style.setProperty("--_accent-glow", ACCENT_GLOW[key]);
    root.style.setProperty("--_accent-tint", ACCENT_TINT[key]);
  }

  /* ═══ VALIDATOR + LOGIC — structural mirror of _shared/formValidator.ts ══════ */
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;       // SQL line 293
  const NUMBER_RE = /^-?[0-9]+(\.[0-9]+)?$/;            // SQL line 295
  const asText = (v) => (v === null || v === undefined) ? "" : (typeof v === "string" ? v : (Array.isArray(v) ? v.join(",") : String(v)));

  // visibleFields — apply logic_json show/hide against answers; return VISIBLE fields.
  // Logic rule shape (public-form contract): {target, action:'hide'|'show', when:{field,op:'eq'|'neq',value}}.
  function visibleFields(fields, logic, answers) {
    const hidden = new Set();
    for (const rule of logic || []) {
      const target = rule && rule.target != null ? rule.target : null;
      const action = String((rule && rule.action) || "hide").toLowerCase();
      const wfield = rule && rule.when && rule.when.field != null ? rule.when.field : null;
      const wop = String((rule && rule.when && rule.when.op) || "eq").toLowerCase();
      const wval = rule && rule.when ? rule.when.value : undefined;
      if (target == null || wfield == null) continue;
      const actual = asText(answers ? answers[wfield] : undefined);
      const wvalText = asText(wval);
      const match = wop === "neq" ? actual !== wvalText : actual === wvalText;
      if ((action === "hide" && match) || (action === "show" && !match)) hidden.add(target);
    }
    return (fields || []).filter((f) => f && f.key != null && !hidden.has(f.key));
  }

  // validate — required (present + non-empty after trim) + type checks on VISIBLE fields.
  // errors map field.key → 'required'|'invalid_email'|'invalid_number'|'invalid_phone'.
  // NON-INPUT fields (heading/paragraph/file) carry no answer and are never required-checked.
  const NON_INPUT = new Set(["heading", "paragraph", "file"]);
  function validate(fields, answers, logic) {
    const errors = {};
    const visible = visibleFields(fields || [], logic || [], answers || {});
    for (const field of visible) {
      const key = field && field.key;
      if (key == null) continue;
      const type = String((field && field.type) || "text").toLowerCase();
      if (NON_INPUT.has(type)) continue; // static content / scaffolded-off file — nothing to validate
      const raw = answers ? answers[key] : undefined;
      const ans = raw === null || raw === undefined ? null : asText(raw);
      const empty = ans == null || ans.trim() === "";
      if (field && field.required && empty) { errors[key] = "required"; continue; }
      if (!empty) {
        const v = ans;
        if (type === "email" && !EMAIL_RE.test(v)) errors[key] = "invalid_email";
        else if (type === "number" && !NUMBER_RE.test(v)) errors[key] = "invalid_number";
        else if (type === "phone" && v.replace(/[^0-9]/g, "").length < 7) errors[key] = "invalid_phone";
      }
    }
    return { ok: Object.keys(errors).length === 0, errors };
  }

  const ERR_COPY = {
    required: "This field is required.",
    invalid_email: "Enter a valid email address.",
    invalid_number: "Enter a number.",
    invalid_phone: "Enter a valid phone number.",
  };

  /* ── Sample definition (mockup mode: covers multi-step + quiz + consent + a
        hidden honeypot + logic). Honest labelled sample — never a live path. ─── */
  function sampleForm() {
    return {
      id: "sample",
      name: "Which plan fits you?",
      type: "quiz",
      fields_json: [
        { key: "intro", type: "paragraph", label: "Answer three quick questions and we'll suggest a plan. No account needed." },
        { key: "team", type: "radio", label: "How big is your team?", required: true, options: ["Just me", "2–10", "10+"] },
        { key: "goal", type: "radio", label: "Primary goal?", required: true, options: ["Get leads", "Automate", "Scale ops"] },
        { key: "email", type: "email", label: "Where should we send your plan?", placeholder: "you@company.com", required: true },
        { key: "wants_call", type: "checkbox", label: "Anything else?", options: ["Book me a call"] },
        { key: "phone", type: "phone", label: "Best number to reach you", placeholder: "+1 555 000 0000" },
        { key: "consent1", type: "consent", label: "Marketing consent", required: true, consent_text: "I agree to receive occasional updates from AiMindShare and can unsubscribe anytime." },
        { key: "hp_url", type: "text", label: "Leave this empty" },
      ],
      // public-form contract logic shape: show `phone` only when the caller ticked "Book me a call".
      logic_json: [{ target: "phone", action: "show", when: { field: "wants_call", op: "eq", value: "Book me a call" } }],
      settings_json: {
        design: { accent: "deep", button_text: "See my plan", layout: "card" },
        steps: [
          { title: "About you", field_keys: ["intro", "team", "goal"] },
          { title: "Where to send it", field_keys: ["email", "wants_call", "phone", "consent1"] },
        ],
        spam: { honeypot: "hp_url", min_ms: 1500 },
        scoring: { team: { "Just me": 1, "2–10": 2, "10+": 3 }, goal: { "Get leads": 1, "Automate": 2, "Scale ops": 3 } },
        tiers: [
          { min: 0, max: 2, label: "Starter", message: "The Starter plan is a great fit — everything you need to get going." },
          { min: 3, max: 4, label: "Growth", message: "Growth gives you room to scale as your team grows." },
          { min: 5, max: 6, label: "Scale", message: "Scale is built for teams like yours." },
        ],
      },
    };
  }

  /* ── State ────────────────────────────────────────────────────────────────── */
  const S = {
    form: null, variant: null, settings: {}, design: {}, spam: {},
    steps: null, stepIdx: 0,
    answers: {}, errors: {}, touched: {},
    loadTime: Date.now(), started: false, submitting: false,
    result: null,           // set once submitted → shows the result screen
  };

  /* ── Boot ─────────────────────────────────────────────────────────────────── */
  async function boot() {
    renderLoading();
    let form = null, variant = null;
    if (live) {
      try {
        const data = await callFn("GET", `?token=${encodeURIComponent(TOKEN)}&visitor=${encodeURIComponent(VISITOR)}`);
        form = data && data.form; variant = data && data.variant;
      } catch (e) {
        renderError(e.message || "This form is unavailable.");
        return;
      }
      if (!form) { renderError("This form is unavailable."); return; }
    } else {
      form = sampleForm();
    }

    S.form = form;
    S.variant = variant || null;
    S.settings = form.settings_json || {};
    S.design = S.settings.design || {};
    S.spam = S.settings.spam || {};
    S.steps = Array.isArray(S.settings.steps) && S.settings.steps.length ? S.settings.steps : null;
    S.loadTime = Date.now();
    applyAccent(S.design.accent);

    // Sticky A/B variant persistence per token.
    try {
      const vkey = `aims_variant_${TOKEN || "sample"}`;
      if (S.variant) localStorage.setItem(vkey, S.variant);
      else { const stored = localStorage.getItem(vkey); if (stored) S.variant = stored; }
    } catch (e) {}

    trackView("view", S.steps ? 0 : null);
    render();
  }

  /* ── View beacons (start / view+step / complete) ──────────────────────────── */
  function trackView(event, step) {
    if (!live) return; // no beacon in mockup mode
    callFn("POST", "?action=view", {
      token: TOKEN, visitor: VISITOR, variant: S.variant,
      event, step: Number.isInteger(step) ? step : null,
    }).catch(() => {});
  }

  /* ── Field helpers ────────────────────────────────────────────────────────── */
  // Fields visible in the CURRENT step (multi-step) or the whole form, after logic.
  function activeFields() {
    const all = S.form.fields_json || [];
    const visible = visibleFields(all, S.form.logic_json || [], S.answers);
    if (!S.steps) return visible;
    const keys = new Set((S.steps[S.stepIdx] && S.steps[S.stepIdx].field_keys) || []);
    return visible.filter((f) => keys.has(f.key));
  }

  // Every visible field across the form (for final validation + submit answer set).
  function allVisible() { return visibleFields(S.form.fields_json || [], S.form.logic_json || [], S.answers); }

  /* ── Renderers ────────────────────────────────────────────────────────────── */
  function renderLoading() {
    root.innerHTML = shell(`<div class="skel"></div><div class="skel" style="width:70%"></div><div class="skel"></div>`);
  }
  function renderError(msg) {
    root.innerHTML = shell(`<div class="f-empty">${esc(msg)}</div>`);
  }
  function shell(inner) { return `<div class="f-card">${inner}</div>`; }

  function fieldHTML(f) {
    const type = String(f.type || "text").toLowerCase();
    const key = f.key;
    const bad = S.errors[key] ? " bad" : "";
    const errLine = S.errors[key] ? `<div class="ff-err">${esc(ERR_COPY[S.errors[key]] || "Please check this field.")}</div>` : "";
    const req = f.required ? ` <span class="req">*</span>` : "";
    const lab = (extra = "") => `<label class="ff-label" for="ff_${esc(key)}">${esc(f.label || key)}${req}</label>${extra}`;
    const val = S.answers[key];

    // Static content blocks.
    if (type === "heading") return `<div class="ff"><div class="ff-heading">${esc(f.label || "")}</div></div>`;
    if (type === "paragraph") return `<div class="ff"><p class="ff-paragraph">${esc(f.label || "")}</p></div>`;

    // Honeypot — visually hidden decoy (offscreen, aria-hidden, no tab, no autocomplete).
    if (S.spam && S.spam.honeypot && key === S.spam.honeypot) {
      return `<div class="hp" aria-hidden="true"><label>${esc(f.label || "Leave empty")}<input type="text" tabindex="-1" autocomplete="off" data-hp="1" data-key="${esc(key)}" value="${esc(val || "")}"></label></div>`;
    }

    // Hidden (UTM capture) — no visible control; value carried in answers on submit.
    if (type === "hidden") return "";

    if (type === "file") {
      return `<div class="ff">${lab()}<div class="ff-file"><span>File upload</span><span class="badge">Available after M06</span></div><div class="ff-help">Uploads arrive with the Media Library.</div></div>`;
    }

    if (type === "textarea") {
      return `<div class="ff${bad}">${lab()}<textarea id="ff_${esc(key)}" data-key="${esc(key)}" placeholder="${esc(f.placeholder || "")}">${esc(val || "")}</textarea>${errLine}</div>`;
    }

    if (type === "dropdown") {
      const opts = (f.options || []).map((o) => `<option value="${esc(o)}" ${val === o ? "selected" : ""}>${esc(o)}</option>`).join("");
      return `<div class="ff${bad}">${lab()}<select id="ff_${esc(key)}" data-key="${esc(key)}"><option value="">Select…</option>${opts}</select>${errLine}</div>`;
    }

    if (type === "radio") {
      const opts = (f.options || []).map((o) => `<label class="opt ${val === o ? "sel" : ""}"><input type="radio" name="ff_${esc(key)}" data-key="${esc(key)}" data-choice="single" value="${esc(o)}" ${val === o ? "checked" : ""}><span>${esc(o)}</span></label>`).join("");
      return `<div class="ff${bad}">${lab()}<div class="ff-opts">${opts}</div>${errLine}</div>`;
    }

    if (type === "checkbox" || type === "multiselect") {
      // Multi-value → answer stored as an array; asText() joins with "," to mirror the SQL text form.
      const cur = Array.isArray(val) ? val : (val ? [val] : []);
      const opts = (f.options || []).map((o) => `<label class="opt ${cur.includes(o) ? "sel" : ""}"><input type="checkbox" data-key="${esc(key)}" data-choice="multi" value="${esc(o)}" ${cur.includes(o) ? "checked" : ""}><span>${esc(o)}</span></label>`).join("");
      return `<div class="ff${bad}">${lab()}<div class="ff-opts">${opts}</div>${errLine}</div>`;
    }

    if (type === "consent") {
      const checked = asText(val) === "yes";
      return `<div class="ff${bad}"><label class="ff-consent"><input type="checkbox" data-key="${esc(key)}" data-choice="consent" ${checked ? "checked" : ""}><span class="ct">${esc(f.consent_text || f.label || "I agree.")}${f.required ? ' <span class="req">*</span>' : ""}</span></label>${errLine}</div>`;
    }

    if (type === "rating") {
      const max = Number(f.max) > 0 ? Number(f.max) : 10;
      let btns = "";
      for (let i = 1; i <= max; i++) btns += `<button type="button" class="rate-btn ${String(val) === String(i) ? "sel" : ""}" data-key="${esc(key)}" data-choice="rating" data-val="${i}">${i}</button>`;
      return `<div class="ff${bad}">${lab()}<div class="ff-rating">${btns}</div>${errLine}</div>`;
    }

    // text | email | phone | number | date → native input.
    const inputType = type === "email" ? "email" : type === "phone" ? "tel" : type === "number" ? "number" : type === "date" ? "date" : "text";
    return `<div class="ff${bad}">${lab()}<input id="ff_${esc(key)}" type="${inputType}" data-key="${esc(key)}" value="${esc(val || "")}" placeholder="${esc(f.placeholder || "")}">${errLine}</div>`;
  }

  function render() {
    if (S.result) return renderResult();

    const name = S.form.name || "Form";
    const typeLabel = S.form.type === "quiz" ? "Quiz" : S.form.type === "survey" ? "Survey" : "Form";
    const flag = live ? "" : `<div class="mock-flag">Sample form · connect a project to go live</div>`;

    // Multi-step chrome.
    let stepChrome = "";
    if (S.steps) {
      const dots = S.steps.map((_, i) => `<span class="f-dot ${i <= S.stepIdx ? "on" : ""}"></span>`).join("");
      const st = S.steps[S.stepIdx] || {};
      stepChrome = `<div class="f-steps">${dots}</div><div class="f-stepno">Step ${S.stepIdx + 1} of ${S.steps.length}${st.title ? " · " + esc(st.title) : ""}</div>`;
    }

    const fields = activeFields().map(fieldHTML).join("");
    // Ensure the honeypot is present even if it's not in the current step's field list.
    const hpKey = S.spam && S.spam.honeypot;
    let hpHTML = "";
    if (hpKey && !activeFields().some((f) => f.key === hpKey)) {
      const hpField = (S.form.fields_json || []).find((f) => f.key === hpKey) || { key: hpKey, label: "Leave empty" };
      hpHTML = fieldHTML(hpField);
    }

    const alert = S.errors.__form ? `<div class="f-alert">${esc(S.errors.__form)}</div>` : "";

    const isLast = !S.steps || S.stepIdx === S.steps.length - 1;
    const btnText = esc(S.design.button_text || "Submit");
    let actions;
    if (S.steps && S.steps.length > 1) {
      actions = `<div class="f-actions${S.stepIdx === 0 ? " solo" : ""}">
        ${S.stepIdx > 0 ? `<button type="button" class="btn btn-ghost" data-act="back">Back</button>` : ""}
        <button type="submit" class="btn btn-primary" data-act="${isLast ? "submit" : "next"}">${isLast ? btnText : "Next"}</button>
      </div>`;
    } else {
      actions = `<div class="f-actions solo"><button type="submit" class="btn btn-primary" data-act="submit">${btnText}</button></div>`;
    }

    root.innerHTML = shell(
      `${flag}<div class="f-eyebrow">${typeLabel}</div><div class="f-title">${esc(name)}</div>
       ${stepChrome}${alert}
       <form id="theForm" novalidate>${fields}${hpHTML}${actions}</form>`
    );
    wire();
  }

  function renderResult() {
    const r = S.result;
    if (r.status === "complete") {
      const tierPill = r.result_tier ? `<div class="f-tier">${esc(r.result_tier)}</div>` : "";
      const msg = r.message || "Thanks — your response has been received.";
      root.innerHTML = shell(`<div class="f-result"><div class="rk">&#10003;</div>${tierPill}<h2>${r.result_tier ? "Your result" : "All done"}</h2><p>${esc(msg)}</p>${live ? "" : `<div class="f-note">(Sample — connect a project to submit for real.)</div>`}</div>`);
    } else if (r.status === "pending_confirmation") {
      root.innerHTML = shell(`<div class="f-result pending"><div class="rk">&#9993;</div><h2>Check your email</h2><p>${esc(r.message || "We've sent a confirmation link — click it to complete your submission.")}</p></div>`);
    } else {
      root.innerHTML = shell(`<div class="f-result pending"><div class="rk">!</div><h2>Something went wrong</h2><p>Please retry in a moment.</p></div>`);
    }
  }

  /* ── Wiring ───────────────────────────────────────────────────────────────── */
  function wire() {
    const form = $("#theForm");
    if (!form) return;

    // First interaction → funnel "start" beacon (once).
    const markStart = () => { if (!S.started) { S.started = true; trackView("start", S.steps ? S.stepIdx : null); } };

    // Text-like inputs + textareas + selects: live capture + validate-on-blur.
    $$("[data-key]", form).forEach((el) => {
      const key = el.dataset.key;
      const choice = el.dataset.choice;
      if (el.dataset.hp) {
        el.addEventListener("input", () => { S.answers[key] = el.value; });
        return;
      }
      if (!choice) {
        // text/email/phone/number/date/textarea/dropdown
        el.addEventListener("input", () => { markStart(); S.answers[key] = el.value; });
        // relayout on change (not per-keystroke) so a logic-trigger text/select re-flows without losing focus mid-type.
        el.addEventListener("change", () => { S.answers[key] = el.value; if (relayoutIfLogic(key)) return; });
        el.addEventListener("blur", () => validateField(key));
      } else if (choice === "single") {
        el.addEventListener("change", () => { markStart(); S.answers[key] = el.value; if (relayoutIfLogic(key)) return; syncChoiceUI(key); validateField(key); });
      } else if (choice === "multi") {
        el.addEventListener("change", () => {
          markStart();
          const cur = new Set(Array.isArray(S.answers[key]) ? S.answers[key] : []);
          if (el.checked) cur.add(el.value); else cur.delete(el.value);
          S.answers[key] = Array.from(cur);
          if (relayoutIfLogic(key)) return;
          syncChoiceUI(key); validateField(key);
        });
      } else if (choice === "consent") {
        el.addEventListener("change", () => { markStart(); S.answers[key] = el.checked ? "yes" : ""; if (relayoutIfLogic(key)) return; validateField(key); });
      } else if (choice === "rating") {
        el.addEventListener("click", () => { markStart(); S.answers[key] = el.dataset.val; if (relayoutIfLogic(key)) return; syncRatingUI(key, el); validateField(key); });
      }
    });

    $("[data-act='back']", form)?.addEventListener("click", (e) => { e.preventDefault(); goBack(); });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const act = e.submitter && e.submitter.dataset ? e.submitter.dataset.act : "submit";
      if (act === "next") goNext();
      else doSubmit();
    });
  }

  // A field whose answer any logic rule reads (a `when.field`). Changing it can
  // show/hide other fields, so we re-render the step to re-evaluate live logic.
  function isLogicTrigger(key) {
    return (S.form.logic_json || []).some((r) => r && r.when && r.when.field === key);
  }
  function relayoutIfLogic(key) {
    if (!isLogicTrigger(key)) return false;
    // Drop errors on fields the change may have hidden; keep others. Simplest: clear
    // the inline form-level alert and re-render (per-field errors re-derive on next check).
    delete S.errors.__form;
    render();
    return true;
  }

  // Toggle the .sel class on option rows without a full re-render (keeps focus/scroll).
  function syncChoiceUI(key) {
    $$(`[data-key="${cssEsc(key)}"]`).forEach((el) => {
      const wrap = el.closest(".opt"); if (!wrap) return;
      wrap.classList.toggle("sel", el.type === "checkbox" ? el.checked : el.checked);
    });
  }
  function syncRatingUI(key, active) {
    $$(`[data-choice="rating"][data-key="${cssEsc(key)}"]`).forEach((b) => b.classList.toggle("sel", b === active));
  }
  const cssEsc = (s) => String(s).replace(/["\\]/g, "\\$&");

  function validateField(key) {
    const field = (S.form.fields_json || []).find((f) => f.key === key);
    if (!field) return;
    const res = validate([field], S.answers, S.form.logic_json || []);
    if (res.errors[key]) S.errors[key] = res.errors[key]; else delete S.errors[key];
    // Update just this field's error line + .bad class in place.
    const el = $(`[data-key="${cssEsc(key)}"]`);
    const wrap = el ? el.closest(".ff") : null;
    if (!wrap) return;
    wrap.classList.toggle("bad", !!S.errors[key]);
    let line = wrap.querySelector(".ff-err");
    if (S.errors[key]) {
      if (!line) { line = document.createElement("div"); line.className = "ff-err"; wrap.appendChild(line); }
      line.textContent = ERR_COPY[S.errors[key]] || "Please check this field.";
    } else if (line) { line.remove(); }
  }

  /* ── Step nav (per-step validation) ───────────────────────────────────────── */
  function validateStep() {
    const fields = activeFields().filter((f) => !NON_INPUT.has(String(f.type || "text").toLowerCase()) && !(S.spam.honeypot && f.key === S.spam.honeypot));
    const res = validate(fields, S.answers, S.form.logic_json || []);
    S.errors = Object.assign({}, res.errors);
    return res.ok;
  }

  function goNext() {
    if (!validateStep()) { render(); return; }
    if (S.stepIdx < S.steps.length - 1) {
      S.stepIdx++;
      S.errors = {};
      trackView("view", S.stepIdx);
      render();
      root.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  function goBack() {
    if (S.stepIdx > 0) { S.stepIdx--; S.errors = {}; render(); }
  }

  /* ── Submit ───────────────────────────────────────────────────────────────── */
  function buildAnswers() {
    // Only VISIBLE (logic-passing) fields' answers are submitted; hidden fields dropped.
    const visible = allVisible();
    const out = {};
    for (const f of visible) {
      const type = String(f.type || "text").toLowerCase();
      if (NON_INPUT.has(type) || type === "heading" || type === "paragraph") continue;
      if (type === "hidden") {
        // UTM capture: prefer a matching utm_* param, else any preset value.
        const uk = (f.map_to || f.key || "").toLowerCase();
        out[f.key] = UTM[uk] || UTM[`utm_${uk}`] || S.answers[f.key] || "";
        continue;
      }
      if (S.spam.honeypot && f.key === S.spam.honeypot) continue; // decoy never a real answer
      if (S.answers[f.key] !== undefined) out[f.key] = S.answers[f.key];
    }
    return out;
  }

  async function doSubmit() {
    if (S.submitting) return;
    // Final full-form validation across every visible field.
    const visibleInput = allVisible().filter((f) => !NON_INPUT.has(String(f.type || "text").toLowerCase()) && !(S.spam.honeypot && f.key === S.spam.honeypot));
    const res = validate(visibleInput, S.answers, S.form.logic_json || []);
    if (!res.ok) {
      S.errors = Object.assign({}, res.errors);
      // If a failing field lives on an earlier step, jump the visitor there.
      if (S.steps) {
        for (let i = 0; i < S.steps.length; i++) {
          const keys = new Set(S.steps[i].field_keys || []);
          if (Object.keys(res.errors).some((k) => keys.has(k))) { S.stepIdx = i; break; }
        }
      }
      S.errors.__form = "Please fix the highlighted fields.";
      render();
      return;
    }

    S.submitting = true;
    const btn = $("[data-act='submit']"); if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }

    const answers = buildAnswers();
    // Honeypot value (if the decoy was filled, the SERVER rejects; we send it faithfully).
    const hpKey = S.spam.honeypot;
    if (hpKey) answers[hpKey] = S.answers[hpKey] || "";
    const elapsed_ms = Date.now() - S.loadTime;

    try {
      if (live) {
        const result = await callFn("POST", "?action=submit", {
          token: TOKEN, answers, utm: UTM, visitor: VISITOR, variant: S.variant,
          spam: { elapsed_ms },
        });
        handleResult(result);
      } else {
        // Mockup: simulate the server pipeline (honeypot + time-trap + quiz scoring).
        await new Promise((r) => setTimeout(r, 350));
        handleResult(mockSubmit(answers, elapsed_ms));
      }
    } catch (e) {
      S.submitting = false;
      if (btn) { btn.disabled = false; btn.textContent = esc(S.design.button_text || "Submit"); }
      S.errors.__form = e.message || "Submission failed — please retry.";
      render();
    }
  }

  function handleResult(result) {
    S.submitting = false;
    const status = (result && result.status) || "complete";
    if (status === "validation_failed") {
      // Map server errors [{field,error}] to fields (server is authoritative).
      S.errors = {};
      (result.errors || []).forEach((e) => { if (e && e.field) S.errors[e.field] = e.error; });
      if (S.steps) {
        for (let i = 0; i < S.steps.length; i++) {
          const keys = new Set(S.steps[i].field_keys || []);
          if (Object.keys(S.errors).some((k) => keys.has(k))) { S.stepIdx = i; break; }
        }
      }
      S.errors.__form = "Please fix the highlighted fields.";
      render();
      return;
    }
    if (status === "complete" && result.redirect) {
      trackView("complete", null);
      try { location.href = result.redirect; return; } catch (e) {}
    }
    if (status === "complete") trackView("complete", null);
    S.result = result;
    render();
  }

  // Mock server: mirrors public-form's ordering — spam gate BEFORE validation, then quiz score→tier.
  function mockSubmit(answers, elapsed_ms) {
    const hpKey = S.spam.honeypot;
    const minMs = Number.isFinite(S.spam.min_ms) ? Number(S.spam.min_ms) : 1500;
    if ((hpKey && String(answers[hpKey] || "") !== "") || elapsed_ms < minMs) return { status: "spam_rejected" };
    if (S.form.type === "quiz") {
      const scoring = S.settings.scoring || {};
      let score = 0;
      for (const k in scoring) { const a = asText(answers[k]); if (scoring[k] && scoring[k][a] != null) score += Number(scoring[k][a]) || 0; }
      const tiers = S.settings.tiers || [];
      const tier = tiers.find((t) => score >= (t.min ?? 0) && score <= (t.max ?? 999)) || tiers[tiers.length - 1] || null;
      return { status: "complete", result_tier: tier ? tier.label : null, message: tier ? tier.message : "Thanks for taking the quiz." };
    }
    return { status: "complete", message: "Thanks — your response has been received." };
  }

  boot();
})();
