/* app.js — AiMindShare Session 0 verification console.
   Renders the committed foundation facts + the real local-probe results
   (data/verify-status.json), and runs the Edge Function envelope test live
   when a Supabase URL + anon key are connected. Vanilla JS, no build step. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };

  /* ── Theme (own key per D-012; light default per D-007) ─────────────────── */
  const THEME_KEY = "aimindshare-theme";
  const root = document.documentElement;
  function setTheme(t) { root.setAttribute("data-theme", t); try { localStorage.setItem(THEME_KEY, t); } catch (e) {} $("#themeIco").textContent = t === "dark" ? "☀" : "☾"; }
  setTheme((() => { try { return localStorage.getItem(THEME_KEY) || "light"; } catch (e) { return "light"; } })());
  $("#themeToggle").addEventListener("click", () => setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"));

  /* ── Starfield (light mode only; CSS hides in dark) ─────────────────────── */
  const field = $("#starField");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (field && !reduce) for (let i = 0; i < 55; i++) {
    const s = el("div", "star");
    s.style.left = Math.random() * 100 + "%"; s.style.top = Math.random() * 100 + "%";
    s.style.setProperty("--tw", (3 + Math.random() * 7).toFixed(1) + "s");
    s.style.setProperty("--td", (Math.random() * 10).toFixed(1) + "s");
    field.appendChild(s);
  }

  /* ── Committed foundation facts (describe the real scaffold) ─────────────── */
  const KPIS = [
    { ico: "▤", val: "6", label: "Migrations", feat: false },
    { ico: "⛨", val: "10", label: "Tables under RLS", feat: false },
    { ico: "⛁", val: "4", label: "Storage buckets", feat: false },
    { ico: "⏱", val: "2", label: "pg_cron jobs", feat: true },
  ];
  const LEDGER = [
    ["profiles", "user public mirror", "self only", ["success:RLS", "info:sel/ins/upd"]],
    ["workspaces", "agency / sub-account", "member read · owner write", ["success:RLS", "attention:owner-only"]],
    ["memberships", "role + status", "self read · admin write", ["success:RLS", "attention:admin-only"]],
    ["jobs", "async control plane", "member read · queued-only insert", ["success:RLS", "warning:queued-only"]],
    ["plans", "platform catalog", "authenticated read", ["success:RLS", "plain:catalog"]],
    ["subscriptions_platform", "Stripe subscriptions", "member read · service write", ["success:RLS"]],
    ["usage_meters", "metered totals", "member read · service write", ["success:RLS"]],
    ["usage_events", "append-only ledger", "member read · service write", ["success:RLS"]],
    ["credit_wallets", "prepaid balance", "member read · service write", ["success:RLS"]],
    ["rebilling_rules", "agency markup", "member read · admin write", ["success:RLS", "attention:admin-only"]],
  ];

  $("#kpis").append(...KPIS.map((k) => {
    const c = el("div", "kpi reveal" + (k.feat ? " kpi-featured" : ""));
    c.append(el("div", "kpi-ico", k.ico), el("div", "kpi-val num", k.val), el("div", "kpi-label", k.label));
    return c;
  }));

  const ledger = $("#ledger");
  LEDGER.forEach(([name, desc, scope, badges]) => {
    const row = el("div", "row");
    row.append(el("div", "t-name", `${name}<small>${desc}</small>`), el("div", "t-scope", scope));
    const b = el("div", "badges");
    badges.forEach((spec) => { const [k, txt] = spec.split(":"); b.append(el("span", "pill " + k, txt)); });
    row.append(b); ledger.append(row);
  });

  /* ── Render a static probe card (from real local run) ───────────────────── */
  function fillProbe(id, data) {
    const card = $("#probe-" + id);
    const body = $(".p-content", card), foot = $(".p-status", card);
    body.innerHTML = "";
    const ok = data.fail === 0;
    const ul = el("ul", "assertions");
    data.assertions.forEach((a) => ul.append(el("li", ok ? "" : "", a)));
    body.append(ul);
    foot.className = "pill p-status " + (ok ? "success" : "danger");
    foot.textContent = ok ? `${data.pass} passed` : `${data.fail} failed`;
  }

  fetch("data/verify-status.json", { cache: "no-store" })
    .then((r) => { if (!r.ok) throw new Error("status " + r.status); return r.json(); })
    .then((v) => {
      fillProbe("leak", v.leak);
      fillProbe("job", v.job);
      const g = $("#probe-gate8"); const body = $(".p-content", g), foot = $(".p-status", g);
      body.innerHTML = "";
      const ul = el("ul", "assertions");
      (v.gate8.laws || []).forEach((l) => ul.append(el("li", "", l)));
      body.append(ul);
      foot.className = "pill p-status " + (v.gate8.clean ? "success" : "danger");
      foot.textContent = v.gate8.clean ? "0 violations" : "violations";
      $("#genAt").textContent = v.generatedAt;
    })
    .catch((e) => {
      ["leak", "job", "gate8"].forEach((id) => {
        const c = $("#probe-" + id); $(".p-content", c).innerHTML =
          `<div class="p-body" style="color:var(--status-warning)">Local status not found — run <span class="mono">bash scripts/verify.sh</span> to generate <span class="mono">data/verify-status.json</span>.</div>`;
        $(".p-status", c).className = "pill p-status warning"; $(".p-status", c).textContent = "not run";
      });
    });

  /* ── Config + live health probe ─────────────────────────────────────────── */
  const CFG_KEY = "aimindshare-supabase";
  function getCfg() {
    try { const s = JSON.parse(localStorage.getItem(CFG_KEY) || "null"); if (s && s.url) return s; } catch (e) {}
    const g = window.AIMINDSHARE_CONFIG;
    if (g && g.SUPABASE_URL && !/YOUR-/.test(g.SUPABASE_URL)) return { url: g.SUPABASE_URL, anon: g.SUPABASE_ANON_KEY };
    return null;
  }
  function renderConn() {
    const cfg = getCfg(), pill = $("#connPill");
    if (cfg) { pill.className = "pill success"; pill.textContent = "connected"; }
    else { pill.className = "pill plain"; pill.textContent = "not connected"; }
    $("#runHealth").disabled = !cfg;
    const hc = $("#probe-health");
    if (!cfg) {
      $(".p-content", hc).innerHTML = `<div class="p-body">Connect a Supabase project (URL + anon key) to call the <span class="mono">health</span> Edge Function and read its Vault-backed envelope live.</div>`;
      $(".p-status", hc).className = "pill p-status"; $(".p-status", hc).textContent = "idle";
    } else {
      $(".p-content", hc).innerHTML = `<div class="p-body">Ready. Click <b>Run</b> to call <span class="mono">/functions/v1/health</span>.</div>`;
    }
  }
  async function runHealth() {
    const cfg = getCfg(); if (!cfg) return;
    const hc = $("#probe-health"), status = $(".p-status", hc);
    status.className = "pill p-status info"; status.textContent = "calling…";
    $(".p-content", hc).innerHTML = `<div class="skeleton" style="height:74px"></div>`;
    try {
      const res = await fetch(cfg.url.replace(/\/$/, "") + "/functions/v1/health", {
        headers: cfg.anon ? { apikey: cfg.anon, Authorization: "Bearer " + cfg.anon } : {},
      });
      const json = await res.json();
      const good = json && json.ok === true;
      $(".p-content", hc).innerHTML = `<div class="p-envelope">${escapeHtml(JSON.stringify(json, null, 2))}</div>`;
      status.className = "pill p-status " + (good ? "success" : "danger");
      status.textContent = good ? "envelope ok" : (json && json.error) || "error";
    } catch (e) {
      hc.classList.add("state-error");
      $(".p-content", hc).innerHTML = `<div class="p-body" style="color:var(--status-danger)">${escapeHtml(String(e))}</div>`;
      status.className = "pill p-status danger"; status.textContent = "unreachable";
    }
  }
  function escapeHtml(s) { return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

  /* ── Drawer wiring ──────────────────────────────────────────────────────── */
  const drawer = $("#drawer"), scrim = $("#scrim");
  const openDrawer = () => { const c = getCfg(); if (c) { $("#inpUrl").value = c.url; $("#inpAnon").value = c.anon || ""; } drawer.classList.add("open"); scrim.classList.add("open"); };
  const closeDrawer = () => { drawer.classList.remove("open"); scrim.classList.remove("open"); };
  $("#openConnect").addEventListener("click", openDrawer);
  $("#closeDrawer").addEventListener("click", closeDrawer);
  scrim.addEventListener("click", closeDrawer);
  $("#saveCfg").addEventListener("click", () => {
    const url = $("#inpUrl").value.trim(), anon = $("#inpAnon").value.trim();
    if (!url) { $("#inpUrl").focus(); return; }
    try { localStorage.setItem(CFG_KEY, JSON.stringify({ url, anon })); } catch (e) {}
    closeDrawer(); renderConn();
  });
  $("#clearCfg").addEventListener("click", () => { try { localStorage.removeItem(CFG_KEY); } catch (e) {} $("#inpUrl").value = ""; $("#inpAnon").value = ""; renderConn(); });
  $("#runHealth").addEventListener("click", runHealth);

  renderConn();
  document.body.classList.add("js-ready");
})();
