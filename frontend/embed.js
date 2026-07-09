/* embed.js — AiMindShare M15 pasteable form embed. A customer drops ONE script tag
   on their site; it renders a published form via an auto-sized iframe of f.html.

   Usage:
     <script src="https://<host>/embed.js"
             data-form="<public_token>"
             data-mode="inline|iframe|popup|slidein"        (default: inline)
             data-trigger="delay:5000|scroll:50|exit"       (popup/slidein only)
             data-frequency-days="7"                        (popup/slidein re-show cap)
             data-target="#my-container"></script>          (inline mount target, optional)

   MOUNT STRATEGY — iframe (chosen over direct DOM render):
     The renderer + validator + Edge-Fn calls all live in f.html/m15-form-render.js.
     An iframe reuses that surface verbatim, sandboxes the form's CSS/JS from the host
     page (no token/style collisions, no framework clash), and lets f.html handle the
     anon key + submit pipeline. Inline/iframe modes auto-size to content via a
     namespaced postMessage from the renderer (see reportHeight in m15-form-render.js).

   Defensive: every path is wrapped so a host page never sees a thrown error. Zero raw
   hex; no framework; self-contained. */
(function () {
  "use strict";
  var script = document.currentScript;
  if (!script) {
    // Fallback: last script tag carrying a data-form attribute.
    var all = document.querySelectorAll("script[data-form]");
    script = all[all.length - 1];
  }
  if (!script) return;

  var token = (script.getAttribute("data-form") || "").trim();
  if (!token) { try { console.warn("[aims-embed] missing data-form token"); } catch (e) {} return; }

  var mode = (script.getAttribute("data-mode") || "inline").trim().toLowerCase();
  var trigger = (script.getAttribute("data-trigger") || "delay:5000").trim().toLowerCase();
  var freqDays = parseInt(script.getAttribute("data-frequency-days") || "0", 10);
  var targetSel = (script.getAttribute("data-target") || "").trim();

  // Resolve the origin f.html lives at from THIS script's own src.
  var base = "";
  try { base = script.src.replace(/embed\.js(?:\?.*)?$/, ""); } catch (e) {}
  var formUrl = base + "f.html?embed=1&token=" + encodeURIComponent(token);

  var SEEN_KEY = "aims_form_" + token + "_seen";

  /* ── Helpers ──────────────────────────────────────────────────────────────── */
  function makeIframe(extraStyle) {
    var f = document.createElement("iframe");
    f.src = formUrl;
    f.setAttribute("title", "Form");
    f.setAttribute("loading", "lazy");
    f.style.cssText = "width:100%;border:0;display:block;background:transparent;" + (extraStyle || "");
    f.setAttribute("scrolling", "no");
    return f;
  }

  // Auto-size an inline iframe from the renderer's height postMessage (per-token).
  function autoSize(iframe) {
    function onMsg(ev) {
      var d = ev && ev.data;
      if (!d || d.__aims_form !== true || d.type !== "height") return;
      if (d.token && d.token !== token) return;
      var h = parseInt(d.height, 10);
      if (h > 0) iframe.style.height = h + "px";
    }
    window.addEventListener("message", onMsg);
  }

  function withinFrequencyCap() {
    if (!freqDays || freqDays <= 0) return false; // no cap → always allowed
    try {
      var last = parseInt(localStorage.getItem(SEEN_KEY) || "0", 10);
      if (!last) return false;
      return (Date.now() - last) < freqDays * 86400000;
    } catch (e) { return false; }
  }
  function recordShown() {
    try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch (e) {}
  }

  /* ── Inline / iframe: mount straight into the page ────────────────────────── */
  function mountInline() {
    var host = null;
    if (targetSel) { try { host = document.querySelector(targetSel); } catch (e) {} }
    if (!host) host = document.querySelector("[data-form-target]");
    if (!host) {
      // Default: mount right after the script tag.
      host = document.createElement("div");
      host.setAttribute("data-aims-form-host", token);
      if (script.parentNode) script.parentNode.insertBefore(host, script.nextSibling);
    }
    var iframe = makeIframe("min-height:220px;");
    autoSize(iframe);
    host.appendChild(iframe);
  }

  /* ── Overlay chrome (popup + slide-in) ────────────────────────────────────── */
  var overlay = null, shown = false;

  function buildPopup() {
    var wrap = document.createElement("div");
    wrap.setAttribute("data-aims-overlay", "popup");
    wrap.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;" +
      "background:rgba(4,9,10,.55);padding:20px;opacity:0;transition:opacity .25s ease";
    var panel = document.createElement("div");
    panel.style.cssText = "position:relative;width:100%;max-width:600px;max-height:90vh;overflow:auto;" +
      "background:transparent;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.35)";
    var iframe = makeIframe("min-height:420px;border-radius:18px;");
    panel.appendChild(closeBtn());
    panel.appendChild(iframe);
    wrap.appendChild(panel);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });
    return wrap;
  }

  function buildSlidein() {
    var wrap = document.createElement("div");
    wrap.setAttribute("data-aims-overlay", "slidein");
    wrap.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483000;width:100%;max-width:380px;" +
      "max-height:80vh;overflow:auto;border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.30);" +
      "background:#fff;transform:translateY(24px);opacity:0;transition:transform .3s ease,opacity .3s ease";
    var iframe = makeIframe("min-height:380px;border-radius:16px;");
    wrap.appendChild(closeBtn());
    wrap.appendChild(iframe);
    return wrap;
  }

  function closeBtn() {
    var b = document.createElement("button");
    b.setAttribute("aria-label", "Close");
    b.innerHTML = "&#10005;";
    b.style.cssText = "position:absolute;top:8px;right:8px;z-index:2;width:32px;height:32px;border:0;border-radius:50%;" +
      "background:rgba(0,0,0,.45);color:#fff;font-size:15px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center";
    b.addEventListener("click", close);
    return b;
  }

  function open() {
    if (shown) return;
    shown = true;
    overlay = mode === "slidein" ? buildSlidein() : buildPopup();
    document.body.appendChild(overlay);
    // Force reflow then animate in.
    void overlay.offsetHeight;
    overlay.style.opacity = "1";
    if (mode === "slidein") overlay.style.transform = "translateY(0)";
    document.addEventListener("keydown", onKey);
    recordShown();
    postView(); // funnel "view" when actually shown
  }

  function close() {
    if (!overlay) return;
    overlay.style.opacity = "0";
    if (mode === "slidein") overlay.style.transform = "translateY(24px)";
    document.removeEventListener("keydown", onKey);
    var o = overlay; overlay = null;
    setTimeout(function () { if (o && o.parentNode) o.parentNode.removeChild(o); }, 320);
  }

  function onKey(e) { if (e.key === "Escape" || e.keyCode === 27) close(); }

  // Optional funnel beacon on show. Best-effort; no anon key here so this only fires
  // if the host set one globally (the iframe posts its own authoritative view too).
  function postView() {
    try {
      var g = window.AIMINDSHARE_CONFIG;
      if (!g || !g.SUPABASE_URL || /YOUR-/.test(g.SUPABASE_URL)) return;
      var v = "anon"; try { v = localStorage.getItem("aims_visitor") || "anon"; } catch (e) {}
      fetch(g.SUPABASE_URL + "/functions/v1/public-form?action=view", {
        method: "POST",
        headers: { apikey: g.SUPABASE_ANON_KEY || "", Authorization: "Bearer " + (g.SUPABASE_ANON_KEY || ""), "Content-Type": "application/json" },
        body: JSON.stringify({ token: token, visitor: v, event: "view", step: null }),
      }).catch(function () {});
    } catch (e) {}
  }

  /* ── Trigger engine (delay / scroll% / exit-intent) ───────────────────────── */
  function armTrigger() {
    if (withinFrequencyCap()) return; // suppress within the re-show window

    var kind = trigger.split(":")[0];
    var arg = parseInt(trigger.split(":")[1] || "0", 10);

    if (kind === "delay") {
      setTimeout(open, isFinite(arg) && arg > 0 ? arg : 5000);
    } else if (kind === "scroll") {
      var pct = isFinite(arg) && arg > 0 ? arg : 50;
      var onScroll = function () {
        var st = window.pageYOffset || document.documentElement.scrollTop || 0;
        var docH = document.documentElement.scrollHeight - window.innerHeight;
        var reached = docH <= 0 ? true : (st / docH) * 100 >= pct;
        if (reached) { window.removeEventListener("scroll", onScroll); open(); }
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    } else if (kind === "exit") {
      var onExit = function (e) {
        // Mouse leaving toward the top of the viewport = exit intent.
        if (e.clientY != null && e.clientY <= 0) { document.removeEventListener("mouseout", onExit); document.removeEventListener("mouseleave", onLeave); open(); }
      };
      var onLeave = function () { document.removeEventListener("mouseout", onExit); document.removeEventListener("mouseleave", onLeave); open(); };
      document.addEventListener("mouseout", onExit);
      document.addEventListener("mouseleave", onLeave);
    } else {
      setTimeout(open, 5000); // unknown trigger → gentle default
    }
  }

  /* ── Init (defensive; run once DOM is ready) ──────────────────────────────── */
  function init() {
    try {
      if (mode === "popup" || mode === "slidein") armTrigger();
      else mountInline(); // inline (default) + explicit "iframe"
    } catch (e) { try { console.warn("[aims-embed] init failed", e); } catch (_) {} }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
