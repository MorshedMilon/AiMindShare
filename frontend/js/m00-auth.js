/* m00-auth.js — AiMindShare Module M00 · Auth & Identity.
   Vanilla hash-routed auth app on Supabase Auth (GoTrue). Wired to the vendored
   supabase-js UMD global when a project is connected; otherwise every screen
   renders as a high-fidelity mockup with a preview-state switcher (Default /
   Loading / Error / Success) so all Gate-5 states are reviewable without faking a
   backend response. No secrets in the browser — anon key only (Law 3). */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ── Theme (light default, own key per D-012) ───────────────────────────── */
  const THEME_KEY = "aimindshare-theme";
  const root = document.documentElement;
  const setTheme = (t) => { root.setAttribute("data-theme", t); try { localStorage.setItem(THEME_KEY, t); } catch (e) {} $("#themeIco").textContent = t === "dark" ? "☀" : "☾"; };
  setTheme((() => { try { return localStorage.getItem(THEME_KEY) || "light"; } catch (e) { return "light"; } })());
  $("#themeToggle").addEventListener("click", () => setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"));

  /* ── Starfield (light only; app.css hides in dark) ──────────────────────── */
  const field = $("#starField");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (field && !reduce) for (let i = 0; i < 46; i++) {
    const s = el("div", "star");
    s.style.left = Math.random() * 100 + "%"; s.style.top = Math.random() * 100 + "%";
    s.style.setProperty("--tw", (3 + Math.random() * 7).toFixed(1) + "s");
    s.style.setProperty("--td", (Math.random() * 10).toFixed(1) + "s");
    field.appendChild(s);
  }

  /* ── Config + Supabase client ───────────────────────────────────────────── */
  const CFG_KEY = "aimindshare-supabase";
  function getCfg() {
    try { const s = JSON.parse(localStorage.getItem(CFG_KEY) || "null"); if (s && s.url) return s; } catch (e) {}
    const g = window.AIMINDSHARE_CONFIG;
    if (g && g.SUPABASE_URL && !/YOUR-/.test(g.SUPABASE_URL)) return { url: g.SUPABASE_URL, anon: g.SUPABASE_ANON_KEY };
    return null;
  }
  let client = null;
  function ensureClient() {
    const cfg = getCfg();
    if (!cfg) { client = null; return null; }
    if (!window.supabase || !window.supabase.createClient) { client = null; return null; }
    if (!client) client = window.supabase.createClient(cfg.url, cfg.anon || "", { auth: { persistSession: true, autoRefreshToken: true } });
    return client;
  }
  const connected = () => !!getCfg() && !!window.supabase;

  function renderConn() {
    const pill = $("#connPill");
    if (connected()) { pill.className = "pill success"; pill.textContent = "connected"; pill.hidden = false; }
    else { pill.hidden = true; }
  }

  /* ── Connect drawer ─────────────────────────────────────────────────────── */
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
    client = null; closeDrawer(); renderConn(); render();
  });
  $("#clearCfg").addEventListener("click", () => { try { localStorage.removeItem(CFG_KEY); } catch (e) {} $("#inpUrl").value = ""; $("#inpAnon").value = ""; client = null; renderConn(); render(); });

  /* ── Small building blocks ──────────────────────────────────────────────── */
  const GOOGLE_SVG = '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"/></svg>';
  const crest = () => '<div class="auth-crest"><span>✦</span></div>';
  const msg = (kind, ico, html) => `<div class="inline-msg ${kind}"><span class="im-ico">${ico}</span><div>${html}</div></div>`;
  const spinBtn = (label) => `<span class="spin"></span> ${label}`;

  // Preview-state switcher (only in mockup mode) — makes all Gate-5 states visible.
  let previewState = "default";
  const STATES = ["default", "loading", "error", "success"];
  function stateStrip() {
    return "";
  }
  function wireStateStrip(mount) {
    $$("[data-state]", mount).forEach((b) => b.addEventListener("click", () => { previewState = b.dataset.state; render(); }));
  }

  // Should a flow render its non-default state? (real busy flag OR preview toggle)
  const st = (name) => !connected() && previewState === name;

  /* ── Auth helpers ───────────────────────────────────────────────────────── */
  async function currentUser() { const c = ensureClient(); if (!c) return null; const { data } = await c.auth.getUser(); return data.user || null; }
  function pwScore(v) { let s = 0; if (v.length >= 8) s++; if (/[0-9]/.test(v)) s++; if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++; if (/[^A-Za-z0-9]/.test(v) && v.length >= 12) s++; return v ? Math.max(1, s) : 0; }
  const PW_LABEL = ["", "weak", "fair", "good", "strong"];

  function setBusy(btn, busy, label) { if (!btn) return; btn.dataset.busy = busy ? "true" : "false"; btn.innerHTML = busy ? spinBtn(label || "Working…") : label; }
  function friendly(error) {
    const m = (error && (error.message || error.error_description || String(error))) || "Something went wrong.";
    if (/invalid login|invalid credentials/i.test(m)) return "Invalid email or password.";
    if (/already registered|already exists/i.test(m)) return "An account with this email already exists — try signing in instead.";
    if (/rate limit|too many/i.test(m)) return "Too many attempts. Please wait a moment and try again.";
    if (/email not confirmed/i.test(m)) return "Please verify your email first — check your inbox.";
    return esc(m);
  }

  /* ── Views ──────────────────────────────────────────────────────────────── */
  const ROUTES = {}; // name → { title, icon, blurb, states, render, wire }

  function passwordField(id, label, ph, meter) {
    return `<div class="field">
      <label for="${id}">${label}</label>
      <div class="input-wrap">
        <input id="${id}" type="password" placeholder="${ph}" autocomplete="off">
        <button class="peek" type="button" data-peek="${id}" aria-label="Show password">◉</button>
      </div>
      ${meter ? `<div class="pw-meter" data-score="0"><i></i><i></i><i></i><i></i></div><div class="pw-note" id="${id}-note">Use 8+ characters with a number.</div>` : ""}
    </div>`;
  }
  function wirePeeks(mount) {
    $$("[data-peek]", mount).forEach((b) => b.addEventListener("click", () => { const i = $("#" + b.dataset.peek, mount); i.type = i.type === "password" ? "text" : "password"; }));
  }
  function wireMeter(mount, id) {
    const inp = $("#" + id, mount); if (!inp) return;
    inp.addEventListener("input", () => {
      const s = pwScore(inp.value); const m = $(".pw-meter", mount); const note = $("#" + id + "-note", mount);
      if (m) m.dataset.score = String(s);
      if (note) note.innerHTML = inp.value ? `Strength: <b>${PW_LABEL[s]}</b>` : "Use 8+ characters with a number.";
    });
  }

  /* — Login / Signup (shared card with segmented tabs) — */
  function authCard(mode) {
    const isSignup = mode === "signup";
    let body = "";
    if (st("success")) {
      body = msg("success", "✓", isSignup
        ? "<b>Account created.</b> We sent a verification link to your email — confirm it to unlock sending."
        : "<b>Signed in.</b> Redirecting to your workspace…");
    } else {
      if (st("error")) body += msg("error", "⚠", isSignup ? "An account with this email already exists — try signing in instead." : "Invalid email or password.");
      body += `<button class="oauth-btn" data-google>${GOOGLE_SVG}<span>Continue with Google</span></button>
        <div class="divider">or with email</div>`;
      if (isSignup) body += `<div class="field"><label for="name">Full name</label><input id="name" type="text" placeholder="Aisha Rahman" autocomplete="name"></div>`;
      body += `<div class="field"><label for="email">Email address</label><input id="email" type="email" placeholder="you@agency.com" autocomplete="email" spellcheck="false"></div>`;
      body += passwordField("password", "Password", isSignup ? "Create a password" : "Your password", isSignup);
      if (isSignup) {
        body += `<label class="check-row"><input type="checkbox" id="tos"><span>I agree to the <a href="#/" onclick="return false">Terms</a> and <a href="#/" onclick="return false">Privacy Policy</a>.</span></label>`;
      } else {
        body += `<div class="check-row row-between" style="margin-top:10px">
          <label style="display:flex;gap:8px;align-items:center;margin:0"><input type="checkbox" id="remember" checked><span style="font-size:13px">Remember me for 30 days</span></label>
          <button class="link" data-go="#/forgot">Forgot password?</button></div>`;
      }
      body += `<button class="btn btn-primary btn-block" data-submit>${isSignup ? "Create account" : "Sign in"}</button>`;
      if (!isSignup) body += `<button class="btn btn-ghost btn-block" data-go="#/magic" style="margin-top:10px">Email me a magic link</button>`;
    }
    return `${stateStrip()}
      <div class="auth-stage"><div class="auth-card">
        ${crest()}
        <div class="seg" role="tablist">
          <button role="tab" aria-selected="${!isSignup}" data-go="#/login">Sign in</button>
          <button role="tab" aria-selected="${isSignup}" data-go="#/signup">Create account</button>
        </div>
        <div class="auth-head"><h1>${isSignup ? "Start with <em>clarity</em>." : "Welcome <em>back</em>."}</h1>
          <p>${isSignup ? "Your workspace, your data, walled off by database-level security." : "Sign in to your AiMindShare workspace."}</p></div>
        <form data-form novalidate>${body}</form>
      </div></div>`;
  }

  function wireAuthCard(mount, mode) {
    const isSignup = mode === "signup";
    wirePeeks(mount); if (isSignup) wireMeter(mount, "password");
    const g = $("[data-google]", mount);
    if (g) g.addEventListener("click", async () => {
      const c = ensureClient(); if (!c) return openDrawer();
      await c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname + "#/login" } });
    });
    const form = $("[data-form]", mount);
    if (form) form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("[data-submit]", mount);
      const email = ($("#email", mount) || {}).value, password = ($("#password", mount) || {}).value;
      const c = ensureClient(); if (!c) return openDrawer();
      if (isSignup && !$("#tos", mount).checked) return flash(mount, "error", "Please accept the Terms to continue.");
      setBusy(btn, true, isSignup ? "Creating account…" : "Signing in…");
      try {
        if (isSignup) {
          const name = ($("#name", mount) || {}).value;
          const { error } = await c.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: location.origin + location.pathname + "#/verify" } });
          if (error) throw error;
          mount.querySelector(".auth-card").innerHTML = crest() + `<div class="auth-head"><h1>Check your <em>email</em></h1><p>We sent a verification link to <b>${esc(email)}</b>. Confirm it to activate your account.</p></div>` + msg("success", "✉", "Didn't get it? Check spam, or return to <button class='link' data-go='#/login'>sign in</button>.");
          wireNav(mount);
        } else {
          const { data, error } = await c.auth.signInWithPassword({ email, password });
          if (error) throw error;
          await c.rpc("log_auth_event", { p_type: "login_success", p_metadata: {} }).catch(() => {});
          const { data: aal } = await c.auth.mfa.getAuthenticatorAssuranceLevel();
          if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") { location.hash = "#/2fa"; return; }
          location.hash = "#/settings/security";
        }
      } catch (err) { setBusy(btn, false, isSignup ? "Create account" : "Sign in"); flash(mount, "error", friendly(err)); }
    });
  }
  function flash(mount, kind, text) {
    const form = $("[data-form]", mount) || mount;
    let box = $(".inline-msg.flash", mount);
    if (!box) { box = el("div", "inline-msg flash " + kind, `<span class="im-ico">${kind === "error" ? "⚠" : "✓"}</span><div>${text}</div>`); form.prepend(box); }
    else { box.className = "inline-msg flash " + kind; box.querySelector("div").innerHTML = text; }
  }

  ROUTES.login = { title: "Sign in", icon: "→", blurb: "Email + password, Google, or magic link.", states: "default·loading·error·success", render: () => authCard("login"), wire: (m) => wireAuthCard(m, "login") };
  ROUTES.signup = { title: "Create account", icon: "＋", blurb: "Name, email, password with strength meter, Google, ToS.", states: "default·loading·error·success", render: () => authCard("signup"), wire: (m) => wireAuthCard(m, "signup") };

  /* — Magic link — */
  ROUTES.magic = {
    title: "Magic link", icon: "✉", blurb: "Passwordless one-time login link.", states: "default·loading·success",
    render: () => {
      let body;
      if (st("success")) body = msg("success", "✉", "<b>Link sent.</b> Check your inbox for a one-time sign-in link (valid 15 minutes).");
      else body = `<div class="field"><label for="email">Email address</label><input id="email" type="email" placeholder="you@agency.com" spellcheck="false"></div>
        <button class="btn btn-primary btn-block" data-submit>Email me a link</button>`;
      return `${stateStrip()}<div class="auth-stage"><div class="auth-card">
        <button class="flow-back" data-go="#/login">← Back to sign in</button>
        ${crest()}<div class="auth-head"><h1>One-tap <em>sign in</em></h1><p>No password to remember — we email a secure link.</p></div>
        <form data-form novalidate>${body}</form></div></div>`;
    },
    wire: (mount) => {
      const form = $("[data-form]", mount); if (!form) return;
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); const btn = $("[data-submit]", mount); const email = ($("#email", mount) || {}).value;
        const c = ensureClient(); if (!c) return openDrawer();
        setBusy(btn, true, "Sending…");
        try { const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname + "#/settings/security" } }); if (error) throw error;
          mount.querySelector(".auth-card").innerHTML = crest() + `<div class="auth-head"><h1>Check your <em>email</em></h1><p>A one-time link is on its way to <b>${esc(email)}</b>.</p></div>` + msg("success", "✉", "The link expires in 15 minutes and can be used once.");
        } catch (err) { setBusy(btn, false, "Email me a link"); flash(mount, "error", friendly(err)); }
      });
    },
  };

  /* — 2FA step-up — */
  ROUTES["2fa"] = {
    title: "Two-factor", icon: "🛡", blurb: "6-digit TOTP step-up + backup code fallback.", states: "default·loading·error",
    render: () => {
      let extra = st("error") ? msg("error", "⚠", "That code didn't match. Try again or use a backup code.") : "";
      return `${stateStrip()}<div class="auth-stage"><div class="auth-card">
        ${crest()}<div class="auth-head"><h1>Verify it's <em>you</em></h1><p>Enter the 6-digit code from your authenticator app.</p></div>
        <form data-form novalidate>${extra}
          <div class="otp-group">${[0,1,2,3,4,5].map((i)=>`<input inputmode="numeric" maxlength="1" data-otp="${i}" aria-label="digit ${i+1}">`).join("")}</div>
          <button class="btn btn-primary btn-block" data-submit style="margin-top:16px">Verify</button>
          <div class="auth-foot"><button class="link" data-go="#/2fa">Use a backup code instead</button></div>
        </form></div></div>`;
    },
    wire: (mount) => {
      const inputs = $$("[data-otp]", mount);
      inputs.forEach((inp, i) => {
        inp.addEventListener("input", () => { inp.value = inp.value.replace(/\D/g, "").slice(0, 1); if (inp.value && inputs[i + 1]) inputs[i + 1].focus(); });
        inp.addEventListener("keydown", (e) => { if (e.key === "Backspace" && !inp.value && inputs[i - 1]) inputs[i - 1].focus(); });
      });
      if (inputs[0]) inputs[0].focus();
      const form = $("[data-form]", mount);
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); const code = inputs.map((i) => i.value).join(""); const btn = $("[data-submit]", mount);
        const c = ensureClient(); if (!c) return openDrawer();
        if (code.length < 6) return flash(mount, "error", "Enter all six digits.");
        setBusy(btn, true, "Verifying…");
        try {
          const { data: f } = await c.auth.mfa.listFactors();
          const totp = f && f.totp && f.totp[0]; if (!totp) throw new Error("No enrolled authenticator.");
          const { error } = await c.auth.mfa.challengeAndVerify({ factorId: totp.id, code }); if (error) throw error;
          location.hash = "#/settings/security";
        } catch (err) { setBusy(btn, false, "Verify"); flash(mount, "error", friendly(err)); }
      });
    },
  };

  /* — Forgot password — */
  ROUTES.forgot = {
    title: "Forgot password", icon: "↺", blurb: "Reset email; identical response (no enumeration).", states: "default·loading·success",
    render: () => {
      let body = st("success")
        ? msg("success", "✓", "<b>If an account exists</b> for that email, a reset link is on its way. The link expires in 1 hour.")
        : `<div class="field"><label for="email">Email address</label><input id="email" type="email" placeholder="you@agency.com" spellcheck="false"></div>
           <button class="btn btn-primary btn-block" data-submit>Send reset link</button>`;
      return `${stateStrip()}<div class="auth-stage"><div class="auth-card">
        <button class="flow-back" data-go="#/login">← Back to sign in</button>
        ${crest()}<div class="auth-head"><h1>Reset your <em>password</em></h1><p>We'll email you a secure link to set a new one.</p></div>
        <form data-form novalidate>${body}</form></div></div>`;
    },
    wire: (mount) => {
      const form = $("[data-form]", mount); if (!form) return;
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); const btn = $("[data-submit]", mount); const email = ($("#email", mount) || {}).value;
        const c = ensureClient(); if (!c) return openDrawer();
        setBusy(btn, true, "Sending…");
        try { await c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + "#/reset" });
          mount.querySelector(".auth-card").innerHTML = crest() + `<div class="auth-head"><h1>Check your <em>email</em></h1></div>` + msg("success", "✉", `<b>If an account exists</b> for <b>${esc(email)}</b>, a reset link is on its way (valid 1 hour).`);
        } catch (err) { setBusy(btn, false, "Send reset link"); flash(mount, "error", friendly(err)); }
      });
    },
  };

  /* — Reset password (after redirect, recovery session active) — */
  ROUTES.reset = {
    title: "Set new password", icon: "🔑", blurb: "New password + confirm; invalidates sessions.", states: "default·loading·error·success",
    render: () => {
      if (st("success")) return `${stateStrip()}<div class="auth-stage"><div class="auth-card">${crest()}<div class="auth-head"><h1>Password <em>updated</em></h1></div>${msg("success","✓","Your password was changed and all other sessions were signed out. <button class='link' data-go='#/login'>Sign in</button>.")}</div></div>`;
      let body = st("error") ? msg("error", "⚠", "This reset link has expired or was already used. <button class='link' data-go='#/forgot'>Request a new one</button>.") : "";
      body += passwordField("password", "New password", "Create a new password", true);
      body += `<div class="field"><label for="confirm">Confirm password</label><input id="confirm" type="password" placeholder="Re-enter password" autocomplete="off"></div>
        <button class="btn btn-primary btn-block" data-submit>Update password</button>`;
      return `${stateStrip()}<div class="auth-stage"><div class="auth-card">${crest()}<div class="auth-head"><h1>Choose a new <em>password</em></h1><p>For your security, this signs out every other session.</p></div><form data-form novalidate>${body}</form></div></div>`;
    },
    wire: (mount) => {
      wirePeeks(mount); wireMeter(mount, "password");
      const form = $("[data-form]", mount); if (!form) return;
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); const btn = $("[data-submit]", mount);
        const p = ($("#password", mount) || {}).value, cf = ($("#confirm", mount) || {}).value;
        if (p.length < 8) return flash(mount, "error", "Password must be at least 8 characters.");
        if (p !== cf) return flash(mount, "error", "Passwords don't match.");
        const c = ensureClient(); if (!c) return openDrawer();
        setBusy(btn, true, "Updating…");
        try { const { error } = await c.auth.updateUser({ password: p }); if (error) throw error;
          await c.rpc("log_auth_event", { p_type: "password_changed", p_metadata: {} }).catch(() => {});
          await c.auth.signOut({ scope: "others" }).catch(() => {});
          mount.querySelector(".auth-card").innerHTML = crest() + `<div class="auth-head"><h1>Password <em>updated</em></h1></div>` + msg("success", "✓", "All other sessions were signed out. <button class='link' data-go='#/login'>Continue</button>.");
          wireNav(mount);
        } catch (err) { setBusy(btn, false, "Update password"); flash(mount, "error", friendly(err)); }
      });
    },
  };

  /* — Email verification landing — */
  ROUTES.verify = {
    title: "Verify email", icon: "✓", blurb: "Success / expired / resend states.", states: "default·success·error",
    render: () => {
      let inner;
      if (st("error")) inner = `<div class="auth-head"><h1>Link <em>expired</em></h1></div>${msg("error","⚠","This verification link is no longer valid.")}<button class="btn btn-primary btn-block" data-resend>Resend verification</button>`;
      else if (st("success")) inner = `<div class="auth-head"><h1>Email <em>verified</em></h1></div>${msg("success","✓","Your email is confirmed. <button class='link' data-go='#/settings/security'>Go to your account</button>.")}`;
      else inner = `<div class="auth-head"><h1>Check your <em>inbox</em></h1><p>We sent a verification link. Didn't arrive? Resend below (max 3/hour).</p></div><button class="btn btn-primary btn-block" data-resend>Resend verification email</button>`;
      return `${stateStrip()}<div class="auth-stage"><div class="auth-card">${crest()}${inner}</div></div>`;
    },
    wire: (mount) => {
      const btn = $("[data-resend]", mount); if (!btn) return;
      btn.addEventListener("click", async () => {
        const c = ensureClient(); if (!c) return openDrawer();
        const u = await currentUser(); if (!u) return flash(mount, "error", "Sign in first to resend verification.");
        setBusy(btn, true, "Sending…");
        try { await c.auth.resend({ type: "signup", email: u.email }); setBusy(btn, false, "Sent ✓"); btn.disabled = true; }
        catch (err) { setBusy(btn, false, "Resend verification email"); flash(mount, "error", friendly(err)); }
      });
    },
  };

  /* — Security settings — */
  ROUTES["settings/security"] = {
    title: "Account security", icon: "⛨", blurb: "Password · 2FA wizard · sessions · delete.", states: "default·empty·loading",
    render: () => `
      <div class="page-head"><h1>Account <em>security</em></h1><p>Manage how you sign in and keep your AiMindShare account safe.</p></div>
      <div class="settings-wrap settings-grid">
        <div class="panel set-card">
          <div class="sc-head"><div><h3>Password</h3><div class="sc-sub">Change your password. Updating it signs out every other device.</div></div></div>
          <div class="sc-body"><button class="btn btn-ghost" data-go="#/reset">Change password</button></div>
        </div>
        <div class="panel set-card" data-2fa>
          <div class="sc-head"><div><h3>Two-factor authentication</h3><div class="sc-sub">Add a one-time code from an authenticator app on top of your password.</div></div><span class="pill idle" data-2fa-pill>checking…</span></div>
          <div class="sc-body" data-2fa-body><div class="load-block"></div></div>
        </div>
        <div class="panel set-card">
          <div class="sc-head"><div><h3>Active sessions</h3><div class="sc-sub">Devices signed in to your account.</div></div><button class="btn btn-ghost btn-sm" data-revoke-all>Sign out others</button></div>
          <div class="sc-body" data-sessions><div class="load-block"></div><div class="load-block" style="width:70%"></div></div>
        </div>
        <div class="panel set-card">
          <div class="sc-head"><div><h3 style="color:var(--status-danger)">Delete account</h3><div class="sc-sub">Soft-delete with a 30-day grace period. Sole workspace owners must transfer ownership first (available after M01).</div></div></div>
          <div class="sc-body"><button class="btn btn-danger" data-delete disabled title="Available after M01">Delete account</button></div>
        </div>
      </div>`,
    wire: async (mount) => {
      // 2FA card
      const pill = $("[data-2fa-pill]", mount), body = $("[data-2fa-body]", mount);
      const render2fa = (enrolled) => {
        pill.className = "pill " + (enrolled ? "success" : "plain"); pill.textContent = enrolled ? "enabled" : "not enabled";
        body.innerHTML = enrolled
          ? `<button class="btn btn-ghost" data-2fa-disable>Disable 2FA</button>`
          : `<button class="btn btn-primary" data-2fa-enable>Enable 2FA</button>`;
        const en = $("[data-2fa-enable]", body); if (en) en.addEventListener("click", () => enroll2fa(mount));
        const dis = $("[data-2fa-disable]", body); if (dis) dis.addEventListener("click", () => disable2fa(mount));
      };
      const c = ensureClient();
      if (!c) { render2fa(false); renderSessions(mount, null); return; }
      try { const { data } = await c.auth.mfa.listFactors(); render2fa(!!(data && data.totp && data.totp.length)); }
      catch { render2fa(false); }
      renderSessions(mount, c);
      const ra = $("[data-revoke-all]", mount); if (ra) ra.addEventListener("click", async () => {
        if (!c) return openDrawer(); setBusy(ra, true, "Signing out…");
        try { await c.auth.signOut({ scope: "others" }); await c.rpc("log_auth_event", { p_type: "session_revoked", p_metadata: { scope: "others" } }).catch(()=>{}); renderSessions(mount, c); setBusy(ra, false, "Sign out others"); }
        catch (e) { setBusy(ra, false, "Sign out others"); }
      });
    },
  };

  async function renderSessions(mount, c) {
    const box = $("[data-sessions]", mount); if (!box) return;
    if (!c) { // mockup: show the empty-state + a sample current-device row
      box.innerHTML = `<div class="sess-list"><div class="sess-row"><div class="sess-ico">🖥</div><div class="sess-meta"><b>This device — current</b><small>Chrome · Windows · signed in now</small></div><span class="pill success">current</span></div></div>
        <div class="empty-state"><div class="es-ico">🗝</div><p>Connect a project to see every device signed in to your account.</p></div>`;
      return;
    }
    const { data } = await c.auth.getSession();
    if (!data || !data.session) { box.innerHTML = `<div class="empty-state"><div class="es-ico">🗝</div><p>No active session on this device.</p></div>`; return; }
    box.innerHTML = `<div class="sess-list"><div class="sess-row"><div class="sess-ico">🖥</div><div class="sess-meta"><b>This device — current</b><small>${esc(navigator.userAgent.split(")")[0].split("(")[1] || "this browser")}</small></div><span class="pill success">current</span></div></div>
      <div class="field-hint" style="margin-top:10px">Full multi-device listing uses the Supabase admin API (server-side) — wired with the hosted project. Use <b>Sign out others</b> to revoke every other session now.</div>`;
  }

  async function enroll2fa(mount) {
    const c = ensureClient(); if (!c) return openDrawer();
    const card = $("[data-2fa]", mount), body = $("[data-2fa-body]", card);
    body.innerHTML = `<div class="load-block"></div>`;
    try {
      const { data, error } = await c.auth.mfa.enroll({ factorType: "totp" }); if (error) throw error;
      const totp = data.totp || {};
      const qr = totp.qr_code ? `<img alt="2FA QR code" src="${esc(totp.qr_code)}">` : "";
      body.innerHTML = `<div class="qr-panel"><div class="qr-box">${qr}</div>
        <div class="qr-side"><div class="field-hint">Scan with Google Authenticator, 1Password, or Authy — then enter the 6-digit code.</div>
        <div class="qr-secret">${esc(totp.secret || "")}</div></div></div>
        <div class="field"><label>Verification code</label><div class="otp-group">${[0,1,2,3,4,5].map((i)=>`<input inputmode="numeric" maxlength="1" data-otp="${i}">`).join("")}</div></div>
        <div style="display:flex;gap:10px;margin-top:12px"><button class="btn btn-primary" data-2fa-confirm>Confirm &amp; enable</button><button class="btn btn-ghost" data-2fa-cancel>Cancel</button></div>
        <div data-2fa-msg></div>`;
      const inputs = $$("[data-otp]", body);
      inputs.forEach((inp, i) => inp.addEventListener("input", () => { inp.value = inp.value.replace(/\D/g,"").slice(0,1); if (inp.value && inputs[i+1]) inputs[i+1].focus(); }));
      $("[data-2fa-cancel]", body).addEventListener("click", () => ROUTES["settings/security"].wire(mount));
      $("[data-2fa-confirm]", body).addEventListener("click", async () => {
        const code = inputs.map((i) => i.value).join(""); const btn = $("[data-2fa-confirm]", body);
        if (code.length < 6) { $("[data-2fa-msg]", body).innerHTML = msg("error","⚠","Enter all six digits."); return; }
        setBusy(btn, true, "Verifying…");
        try { const ch = await c.auth.mfa.challenge({ factorId: data.id }); if (ch.error) throw ch.error;
          const v = await c.auth.mfa.verify({ factorId: data.id, challengeId: ch.data.id, code }); if (v.error) throw v.error;
          await c.rpc("log_auth_event", { p_type: "twofa_enabled", p_metadata: {} }).catch(()=>{});
          ROUTES["settings/security"].wire(mount);
        } catch (err) { setBusy(btn, false, "Confirm & enable"); $("[data-2fa-msg]", body).innerHTML = msg("error","⚠",friendly(err)); }
      });
    } catch (err) { body.innerHTML = msg("error", "⚠", friendly(err)) + `<button class="btn btn-ghost" data-2fa-enable>Try again</button>`; const b=$("[data-2fa-enable]",body); if(b)b.addEventListener("click",()=>enroll2fa(mount)); }
  }
  async function disable2fa(mount) {
    const c = ensureClient(); if (!c) return openDrawer();
    try { const { data } = await c.auth.mfa.listFactors(); const totp = data && data.totp && data.totp[0];
      if (totp) { await c.auth.mfa.unenroll({ factorId: totp.id }); await c.rpc("log_auth_event", { p_type: "twofa_disabled", p_metadata: {} }).catch(()=>{}); }
      ROUTES["settings/security"].wire(mount);
    } catch (e) { ROUTES["settings/security"].wire(mount); }
  }

  /* — Profile settings — */
  ROUTES["settings/profile"] = {
    title: "Profile", icon: "👤", blurb: "Name, avatar, email (with re-verification).", states: "default·loading",
    render: () => `
      <div class="page-head"><h1>Your <em>profile</em></h1><p>How you appear across AiMindShare. Changing your email requires re-verification.</p></div>
      <div class="settings-wrap settings-grid">
        <div class="panel set-card">
          <div class="avatar-row"><div class="avatar" data-avatar>AR</div>
            <div><button class="btn btn-ghost btn-sm" data-avatar-btn>Upload avatar</button><div class="field-hint" style="margin-top:6px">PNG or JPG, up to 2 MB. Stored in your Media Library (M06).</div></div></div>
          <div class="field"><label for="pname">Full name</label><input id="pname" type="text" placeholder="Your name"></div>
          <div class="field"><label for="pemail">Email address</label><input id="pemail" type="email" placeholder="you@agency.com" spellcheck="false"></div>
          <button class="btn btn-primary" data-save-profile>Save changes</button>
          <span data-profile-msg></span>
        </div>
      </div>`,
    wire: async (mount) => {
      const c = ensureClient();
      const nameI = $("#pname", mount), emailI = $("#pemail", mount), av = $("[data-avatar]", mount);
      let original = { name: "", email: "" };
      if (c) {
        const u = await currentUser();
        if (u) {
          const { data } = await c.from("profiles").select("name,email,avatar_url").eq("id", u.id).maybeSingle();
          original = { name: (data && data.name) || "", email: (data && data.email) || u.email };
          nameI.value = original.name; emailI.value = original.email;
          const initials = (original.name || original.email || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
          if (data && data.avatar_url) av.innerHTML = `<img src="${esc(data.avatar_url)}" alt="">`; else av.textContent = initials || "?";
        }
      } else { nameI.value = "Aisha Rahman"; emailI.value = "aisha@northstar.agency"; }
      const abtn = $("[data-avatar-btn]", mount); if (abtn) abtn.addEventListener("click", () => $("[data-profile-msg]", mount).innerHTML = msg("info", "◈", "Avatar upload lands with the Media Library (M06)."));
      const save = $("[data-save-profile]", mount);
      save.addEventListener("click", async () => {
        if (!c) return openDrawer(); const u = await currentUser(); if (!u) return openDrawer();
        setBusy(save, true, "Saving…");
        try {
          if (nameI.value !== original.name) await c.from("profiles").update({ name: nameI.value }).eq("id", u.id);
          let note = "Profile saved.";
          if (emailI.value && emailI.value !== original.email) { await c.auth.updateUser({ email: emailI.value }); await c.rpc("log_auth_event", { p_type: "email_changed", p_metadata: {} }).catch(()=>{}); note = "Saved. Check your new inbox to verify the email change."; }
          setBusy(save, false, "Save changes"); $("[data-profile-msg]", mount).innerHTML = msg("success", "✓", note);
        } catch (err) { setBusy(save, false, "Save changes"); $("[data-profile-msg]", mount).innerHTML = msg("error", "⚠", friendly(err)); }
      });
    },
  };

  /* — Invitation acceptance (M01-dependent stub) — */
  ROUTES.invite = {
    title: "Accept invite", icon: "✧", blurb: "Join a workspace from an invite link (needs M01).", states: "default",
    render: () => `${stateStrip()}<div class="auth-stage"><div class="auth-card">${crest()}
      <div class="auth-head"><h1>You're <em>invited</em></h1><p>Set your name and password to join <b>Northstar Agency</b>.</p></div>
      <div class="field locked"><label>Email address</label><input value="invited@northstar.agency" disabled></div>
      <div class="field"><label>Full name</label><input type="text" placeholder="Your name"></div>
      ${passwordField("ipw","Password","Create a password",true)}
      <button class="btn btn-primary btn-block" disabled title="Available after M01">Accept &amp; join</button>
      ${msg("info","◈","Workspace membership attaches in <b>M01</b>. This screen ships ready; the join action activates once M01 is built.")}
    </div></div>`,
    wire: (m) => { wirePeeks(m); wireMeter(m, "ipw"); },
  };

  /* — Screen gallery (mockup overview) — */
  ROUTES.gallery = {
    title: "Overview", icon: "✦", blurb: "", states: "",
    render: () => {
      const cards = ["login","signup","magic","2fa","forgot","reset","verify","settings/security","settings/profile","invite"].map((k) => {
        const r = ROUTES[k];
        return `<button class="panel g-card" data-go="#/${k}">
          <div class="g-top"><span class="g-ico">${r.icon}</span><h3>${r.title}</h3></div>
          <p>${r.blurb}</p>
          <div class="g-states">${(r.states||"").split("·").filter(Boolean).map((s)=>`<span class="pill plain">${s}</span>`).join("")}</div>
          <div class="g-route">#/${k}</div>
        </button>`;
      }).join("");
      return `<div class="page-head gallery-head"><h1>Auth &amp; <em>Identity</em></h1>
        <p>Module M00 — the front door of AiMindShare. Sign-up, sign-in, magic link, two-factor, password reset, and account security, all on Supabase Auth with database-enforced isolation. Open any screen; each ships default, empty, loading, error, and success states.</p></div>
        <div class="kpi-strip" style="margin-bottom:24px">
          <div class="kpi reveal"><div class="kpi-ico">◆</div><div class="kpi-val num">3</div><div class="kpi-label">Sign-in methods</div></div>
          <div class="kpi reveal"><div class="kpi-ico">🛡</div><div class="kpi-val num">TOTP</div><div class="kpi-label">Two-factor</div></div>
          <div class="kpi reveal kpi-featured"><div class="kpi-ico">✦</div><div class="kpi-val num">10</div><div class="kpi-label">Auth screens</div></div>
          <div class="kpi reveal"><div class="kpi-ico">⛁</div><div class="kpi-val num">RLS</div><div class="kpi-label">Enforced isolation</div></div>
        </div>
        <div class="section-h"><h2>All <em>screens</em></h2><span class="hint">M00 · click to open</span></div>
        <div class="gallery">${cards}</div>`;
    },
    wire: () => {},
  };

  /* ── Router ─────────────────────────────────────────────────────────────── */
  function wireNav(mount) {
    $$("[data-go]", mount).forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); location.hash = b.dataset.go; }));
  }
  function routeName() {
    const h = (location.hash || "#/").replace(/^#\/?/, "");
    if (!h) return "gallery";
    return ROUTES[h] ? h : "gallery";
  }
  function render() {
    renderConn();
    const name = routeName();
    const r = ROUTES[name] || ROUTES.gallery;
    const isGallery = name === "gallery";
    const view = $("#view");
    view.classList.toggle("wrap", true);
    view.innerHTML = r.render();
    wireNav(view);
    if (!connected()) wireStateStrip(view);
    if (r.wire) { try { r.wire(view); } catch (e) { console.error("wire error", e); } }
    document.body.classList.add("js-ready");
    window.scrollTo(0, 0);
  }
  // reset preview state when route changes so each screen opens in Default
  window.addEventListener("hashchange", () => { previewState = "default"; render(); });

  renderConn();
  render();
})();
