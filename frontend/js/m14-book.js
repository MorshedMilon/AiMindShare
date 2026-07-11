/* m14-book.js — AiMindShare M14 public booking page (no auth). Reads a calendar by
   ?slug=, computes/paints available slots in the visitor's timezone, collects details
   + custom questions, and books via the no-auth public-booking Edge Function. Also
   handles ?action=reschedule|cancel&token= self-service. Offline → a labelled mockup.
   Only the anon key ever touches the browser (Law 3); all privileged work is the Edge
   Fn under the service role. Public page = calm (no app atmosphere). */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const mount = $("#book");
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DAY = 864e5;
  const svg = (d, s = 16) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  const I = { clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2", globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z", vid: "M23 7l-7 5 7 5V7zM1 5h15v14H1z", chevl: "M15 18l-6-6 6-6", chevr: "M9 18l6-6-6-6" };

  const params = new URLSearchParams(location.search);
  const SLUG = params.get("slug") || "";
  const ACTION = params.get("action") || "";
  const TOKEN = params.get("token") || "";
  const EMBED = params.get("embed") === "1";
  if (EMBED) document.body.classList.add("embed");
  const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  /* Config / client */
  function getCfg() {
    try { const s = JSON.parse(localStorage.getItem("aimindshare-supabase") || "null"); if (s && s.url) return s; } catch (e) {}
    const g = window.AIMINDSHARE_CONFIG;
    if (g && g.SUPABASE_URL && !/YOUR-/.test(g.SUPABASE_URL)) return { url: g.SUPABASE_URL, anon: g.SUPABASE_ANON_KEY };
    return null;
  }
  const cfg = getCfg();
  const live = !!cfg;

  async function callFn(method, query, body) {
    const url = `${cfg.url}/functions/v1/public-booking${query || ""}`;
    const res = await fetch(url, {
      method, headers: { apikey: cfg.anon || "", Authorization: `Bearer ${cfg.anon || ""}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) throw new Error(json.message || json.error || "Request failed");
    return json.data;
  }

  /* Mock config + slot generator */
  const MOCK_CAL = { id: "cal1", name: "Intro Call", type: "one_on_one", duration_min: 30, timezone: "America/New_York", requires_payment: false };
  const MOCK_Q = [{ id: "q1", label: "What would you like to cover?", type: "textarea", required: true }, { id: "q2", label: "Company", type: "text", required: false }];
  function mockSlots(dateStr) {
    const d = new Date(dateStr + "T00:00:00"); const dow = d.getDay();
    if (dow === 0 || dow === 6) return [];              // weekends closed in the sample
    const out = []; for (let h = 9; h < 16; h++) { for (const m of [0, 30]) { const st = new Date(d); st.setHours(h, m, 0, 0); if (st > new Date()) out.push({ slot_start: st.toISOString(), slot_end: new Date(st.getTime() + 30 * 6e4).toISOString(), assigned_user: null }); } }
    return out;
  }

  /* State */
  const S = { step: 1, cal: null, questions: [], monthCursor: null, date: null, slot: null, slots: [], loadingSlots: false, contact: { name: "", email: "", phone: "" }, answers: {}, result: null, error: null };
  const fmtTime = (isoStr) => new Date(isoStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const fmtDay = (d) => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  /* ── Boot ─────────────────────────────────────────────────────────────────── */
  async function boot() {
    if (ACTION === "cancel") return renderCancel();
    S.rescheduling = ACTION === "reschedule";
    if (!SLUG) { mount.innerHTML = card(`<div class="bk-empty">No booking page specified.</div>`); return; }
    try {
      if (live) { const data = await callFn("GET", `?slug=${encodeURIComponent(SLUG)}`); S.cal = data.calendar; S.questions = data.questions || []; }
      else { S.cal = MOCK_CAL; S.questions = MOCK_Q; }
    } catch (e) { mount.innerHTML = card(`<div class="bk-empty">This booking page isn't available.<br><span style="font-size:12px">${esc(e.message)}</span></div>`); return; }
    if (S.rescheduling) S.cal = { ...S.cal, name: `Reschedule — ${S.cal.name}` };
    S.monthCursor = new Date(); S.monthCursor.setDate(1);
    render();
  }

  /* ── Layout helpers ───────────────────────────────────────────────────────── */
  function card(inner) {
    return `<div class="bk-card"><div class="bk-grid">${sidebar()}<div class="bk-main">${inner}</div></div></div>`;
  }
  function sidebar() {
    const c = S.cal || {}; const meetLine = c.type ? `${c.type.replace(/_/g, "-")} meeting` : "";
    return `<div class="bk-side">
      <div class="bk-eyebrow">Book a time</div>
      <h1>${esc(c.name || "Appointment")}</h1>
      <div class="bk-facts">
        <div class="bk-fact">${svg(I.clock)} ${c.duration_min || 30} minutes</div>
        <div class="bk-fact">${svg(I.globe)} ${esc(TZ)}</div>
        ${c.type ? `<div class="bk-fact">${svg(I.vid)} ${esc(meetLine)}</div>` : ""}
      </div>
    </div>`;
  }
  const steps = (n) => `<div class="bk-steps">${[1, 2, 3].map((i) => `<span class="bk-dot ${i <= n ? "on" : ""}"></span>`).join("")}</div>`;
  const mockFlag = () => "";

  /* ── Render ───────────────────────────────────────────────────────────────── */
  function render() {
    if (S.step === 3 && S.result) return renderSuccess();
    mount.innerHTML = card(steps(S.step) + mockFlag() + (S.step === 1 ? stepDateTime() : stepDetails()));
    wire();
  }

  function stepDateTime() {
    const c = S.monthCursor, first = new Date(c.getFullYear(), c.getMonth(), 1);
    const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let days = "";
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getTime() + i * DAY); const dim = d.getMonth() !== c.getMonth();
      const past = d < today; const sel = S.date && d.toDateString() === S.date.toDateString();
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      days += `<button class="mp-day ${sel ? "sel" : ""} ${dim ? "dim" : ""}" data-date="${iso}" ${past ? "disabled" : ""}>${d.getDate()}</button>`;
    }
    const picker = `<div class="mp-head"><button class="btn btn-ghost btn-sm" id="moPrev">${svg(I.chevl, 16)}</button>
        <span class="mp-title">${MONTHS[c.getMonth()]} ${c.getFullYear()}</span>
        <button class="btn btn-ghost btn-sm" id="moNext">${svg(I.chevr, 16)}</button></div>
      <div class="mp-grid">${DOW.map((d) => `<div class="mp-dow">${d[0]}</div>`).join("")}${days}</div>`;

    let right = `<p class="bk-sub">Pick a day to see available times.</p>`;
    if (S.date) {
      if (S.loadingSlots) right = `<div class="slot-grid">${Array(6).fill('<div class="skeleton-line"></div>').join("")}</div>`;
      else if (!S.slots.length) right = `<div class="bk-empty">No times available on ${esc(fmtDay(S.date))}.<br>Try another day.</div>`;
      else right = `<div class="slot-grid">${S.slots.map((s) => `<button class="slot ${S.slot && S.slot.slot_start === s.slot_start ? "sel" : ""}" data-slot="${esc(s.slot_start)}">${fmtTime(s.slot_start)}</button>`).join("")}</div>`;
    }
    return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px" class="dt-cols">
      <div><h2 class="bk-h">Select a date</h2>${picker}</div>
      <div><h2 class="bk-h">${S.date ? esc(fmtDay(S.date)) : "Available times"}</h2>${right}<div class="tzsel">Times shown in <b>${esc(TZ)}</b></div></div>
    </div>`;
  }

  function stepDetails() {
    const qs = S.questions.map((q) => `<div class="bk-field"><label>${esc(q.label)}${q.required ? " *" : ""}</label>${q.type === "textarea"
      ? `<textarea data-q="${esc(q.id || q.label)}" ${q.required ? "required" : ""}>${esc(S.answers[q.id || q.label] || "")}</textarea>`
      : `<input type="${q.type === "email" ? "email" : q.type === "phone" ? "tel" : "text"}" data-q="${esc(q.id || q.label)}" value="${esc(S.answers[q.id || q.label] || "")}" ${q.required ? "required" : ""}>`}</div>`).join("");
    return `<h2 class="bk-h">Your details</h2>
      <div class="bk-summary">${svg(I.clock)} <b>${esc(fmtDay(S.date))}</b> · ${fmtTime(S.slot.slot_start)} (${S.cal.duration_min} min)</div>
      <div class="bk-field"><label>Full name *</label><input id="bkName" value="${esc(S.contact.name)}" required></div>
      <div class="bk-field"><label>Email *</label><input id="bkEmail" type="email" value="${esc(S.contact.email)}" required></div>
      <div class="bk-field"><label>Phone (for reminders)</label><input id="bkPhone" type="tel" value="${esc(S.contact.phone)}"></div>
      ${qs}
      ${S.cal.requires_payment ? `<div class="bk-summary" style="background:rgba(199,154,58,.10);border-color:rgba(199,154,58,.3)">Payment step arrives with M28 — this booking will confirm without payment for now.</div>` : ""}
      ${S.error ? `<div class="bk-summary" style="background:rgba(196,97,78,.10);border-color:rgba(196,97,78,.3)">${esc(S.error)}</div>` : ""}
      <div class="bk-actions"><button class="btn btn-ghost" id="bkBack">Back</button><button class="btn btn-primary" id="bkConfirm">Confirm booking</button></div>`;
  }

  function renderSuccess() {
    const r = S.result; const when = `${fmtDay(S.date)} · ${fmtTime(S.slot.slot_start)}`;
    mount.innerHTML = card(`<div class="bk-success">
      <div class="ok-mark">✓</div>
      <h2>You're booked</h2>
      <p class="bk-sub">${esc(S.cal.name)} — ${esc(when)} (${esc(TZ)})</p>
      <div class="bk-links">
        ${r.reschedule_url ? `<a class="btn btn-ghost btn-sm" href="${esc(r.reschedule_url)}">Reschedule</a>` : ""}
        ${r.cancel_url ? `<a class="btn btn-ghost btn-sm" href="${esc(r.cancel_url)}">Cancel</a>` : ""}
      </div>
      <p class="bk-note">A confirmation${S.contact.phone ? " and SMS reminders" : ""} will follow. ${live ? "" : "(Sample — connect a project to send for real.)"}</p>
    </div>`);
  }

  /* ── Wiring ───────────────────────────────────────────────────────────────── */
  function wire() {
    $("#moPrev")?.addEventListener("click", () => { S.monthCursor = new Date(S.monthCursor.getFullYear(), S.monthCursor.getMonth() - 1, 1); render(); });
    $("#moNext")?.addEventListener("click", () => { S.monthCursor = new Date(S.monthCursor.getFullYear(), S.monthCursor.getMonth() + 1, 1); render(); });
    $$("[data-date]").forEach((b) => b.addEventListener("click", () => selectDate(b.dataset.date)));
    $$("[data-slot]").forEach((b) => b.addEventListener("click", () => { S.slot = S.slots.find((s) => s.slot_start === b.dataset.slot); if (S.rescheduling) doReschedule(); else { S.step = 2; render(); } }));
    $("#bkBack")?.addEventListener("click", () => { S.step = 1; S.error = null; render(); });
    $("#bkConfirm")?.addEventListener("click", confirmBooking);
  }

  async function selectDate(isoStr) {
    S.date = new Date(isoStr + "T00:00:00"); S.slot = null; S.slots = []; S.loadingSlots = true; render();
    try {
      if (live) { const data = await callFn("GET", `?slug=${encodeURIComponent(SLUG)}&date=${isoStr}&tz=${encodeURIComponent(TZ)}`); S.slots = data.slots || []; }
      else { await new Promise((r) => setTimeout(r, 250)); S.slots = mockSlots(isoStr); }
    } catch (e) { S.slots = []; }
    S.loadingSlots = false; render();
  }

  async function confirmBooking() {
    S.contact.name = $("#bkName").value.trim(); S.contact.email = $("#bkEmail").value.trim(); S.contact.phone = $("#bkPhone").value.trim();
    S.answers = {}; $$("[data-q]").forEach((f) => { S.answers[f.dataset.q] = f.value.trim(); });
    if (!S.contact.name || !S.contact.email) { S.error = "Name and email are required."; render(); return; }
    const missing = S.questions.find((q) => q.required && !S.answers[q.id || q.label]);
    if (missing) { S.error = `“${missing.label}” is required.`; render(); return; }
    S.error = null;
    const btn = $("#bkConfirm"); if (btn) { btn.disabled = true; btn.textContent = "Booking…"; }
    try {
      if (live) {
        S.result = await callFn("POST", "", { slug: SLUG, start: S.slot.slot_start, end: S.slot.slot_end, tz: TZ, contact: S.contact, answers: S.answers });
      } else {
        await new Promise((r) => setTimeout(r, 350));
        S.result = { appointment_id: "mock", reschedule_url: `book.html?action=reschedule&token=mock`, cancel_url: `book.html?action=cancel&token=mock` };
      }
      S.step = 3; render();
    } catch (e) { S.error = e.message || "Booking failed — please pick another time."; if (btn) { btn.disabled = false; btn.textContent = "Confirm booking"; } render(); }
  }

  /* ── Token self-service ───────────────────────────────────────────────────── */
  // Reschedule reuses the date/time picker (S.rescheduling): picking a slot POSTs the
  // reschedule action with the token instead of advancing to the details step.
  async function doReschedule() {
    if (!S.slot) return;
    try {
      if (live) await callFn("POST", "", { action: "reschedule", token: TOKEN, start: S.slot.slot_start, end: S.slot.slot_end });
      else await new Promise((r) => setTimeout(r, 300));
      mount.innerHTML = card(`<div class="bk-success"><div class="ok-mark">✓</div><h2>Rescheduled</h2>
        <p class="bk-sub">${esc(fmtDay(S.date))} · ${esc(fmtTime(S.slot.slot_start))} (${esc(TZ)})</p>
        <p class="bk-note">${live ? "A new confirmation will follow." : "(Sample — connect a project to persist.)"}</p></div>`);
    } catch (e) { S.error = e.message; render(); }
  }

  function renderCancel() {
    mount.innerHTML = card(`<h2 class="bk-h">Cancel your appointment</h2><p class="bk-sub">This can't be undone.</p>
      ${mockFlag()}<div class="bk-actions"><span></span><button class="btn btn-danger" id="doCancel">Cancel appointment</button></div><div id="tkMsg"></div>`);
    $("#doCancel").addEventListener("click", async () => {
      const ok2 = (m) => `<div class="bk-summary" style="margin-top:16px;background:rgba(46,158,123,.1);border-color:rgba(46,158,123,.3)">${m}</div>`;
      const bad = (m) => `<div class="bk-summary" style="margin-top:16px;background:rgba(196,97,78,.1);border-color:rgba(196,97,78,.3)">${esc(m)}</div>`;
      try { if (live) await callFn("POST", "", { action: "cancel", token: TOKEN }); else await new Promise((r) => setTimeout(r, 250)); $("#tkMsg").innerHTML = ok2("Your appointment has been cancelled."); }
      catch (e) { $("#tkMsg").innerHTML = bad(e.message); }
    });
  }

  boot();
})();
