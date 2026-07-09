/* notifications.js — AiMindShare reusable notification bell (M04).
   A drop-in the topbar of ANY module page can embed: an unread-badge bell that
   opens a dropdown of the latest 20 (grouped Today / Earlier), live-updated by
   Supabase Realtime (postgres_changes on public.notifications, filtered to the
   signed-in user — D-005 replaces the PRD's Pusher). Reads are RLS-scoped; the
   browser only ever SELECTs + marks rows read (writes come from notify(), server
   side). When no project is connected it renders from a supplied mock array so the
   feed is a faithful preview (honest Gate-5). Anon key only.

   Usage (see m04-notifications.js):
     AIMS_NOTIFICATIONS.bellMarkup(unread)   → topbar button HTML (badge included)
     AIMS_NOTIFICATIONS.mount({ client, user, workspaceId, connected, mock,
                                onCount, onNavigate, toast })
   mount() is idempotent across re-renders: the Realtime channel is a per-user
   singleton (re-render rewires the DOM but never re-subscribes). */
(function (global) {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var el = function (t, cls, html) { var n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]); }); };
  var REG = function () { return global.AIMS_NOTIF_TYPES; };
  var reduce = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var bellIco = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
  var checkIco = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  // ── time helpers ────────────────────────────────────────────────────────────
  function timeAgo(iso) {
    var t = new Date(iso).getTime();
    if (isNaN(t)) return "";
    var s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (s < 45) return "just now";
    if (s < 3600) return Math.round(s / 60) + "m ago";
    if (s < 86400) return Math.round(s / 3600) + "h ago";
    var d = Math.round(s / 86400);
    if (d === 1) return "yesterday";
    if (d < 7) return d + "d ago";
    try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch (e) { return ""; }
  }
  function isToday(iso) { var d = new Date(iso), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); }

  // ── module singletons (survive page re-renders) ──────────────────────────────
  var sub = null;          // the Realtime channel (one per user)
  var subKey = null;       // userId the channel is bound to
  var ctx = null;          // latest mount context
  var cache = [];          // latest ≤20 notifications
  var loaded = false;

  function unreadCount() { return cache.filter(function (n) { return !n.read_at; }).length; }

  // ── public: topbar button markup ─────────────────────────────────────────────
  function bellMarkup(unread) {
    var n = unread || 0;
    return '<button class="notif-bell" id="notifBell" title="Notifications" aria-label="Notifications' +
      (n ? " (" + n + " unread)" : "") + '">' + bellIco +
      '<span class="notif-badge" id="notifBadge"' + (n ? "" : ' hidden') + '>' + (n > 99 ? "99+" : n) + "</span></button>";
  }

  function paintBadge() {
    var b = $("#notifBadge"); if (!b) return;
    var n = unreadCount();
    if (n) { b.hidden = false; b.textContent = n > 99 ? "99+" : String(n); } else { b.hidden = true; }
    if (ctx && typeof ctx.onCount === "function") ctx.onCount(n);
  }

  // ── data ─────────────────────────────────────────────────────────────────────
  function load() {
    if (!ctx) return Promise.resolve();
    if (!ctx.connected) { cache = (ctx.mock || []).slice(0, 20); loaded = true; paintBadge(); return Promise.resolve(); }
    return ctx.client
      .from("notifications").select("*")
      .eq("workspace_id", ctx.workspaceId)
      .or("user_id.eq." + ctx.user.id + ",user_id.is.null")
      .order("created_at", { ascending: false }).limit(20)
      .then(function (res) { if (!res.error) { cache = res.data || []; loaded = true; paintBadge(); } });
  }

  function subscribe() {
    if (!ctx || !ctx.connected || !ctx.client.channel) return;
    if (sub && subKey === ctx.user.id) return;        // already subscribed for this user
    if (sub) { try { ctx.client.removeChannel(sub); } catch (e) {} sub = null; }
    subKey = ctx.user.id;
    sub = ctx.client.channel("m04-notifs-" + ctx.user.id)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + ctx.user.id },
        function (payload) {
          var row = payload["new"] || payload.record; if (!row) return;
          if (ctx.workspaceId && row.workspace_id && row.workspace_id !== ctx.workspaceId) return; // active-workspace only
          if (cache.some(function (n) { return n.id === row.id; })) return;
          cache.unshift(row); cache = cache.slice(0, 20);
          paintBadge();
          if (isOpen()) { renderMenu(); pulseBell(); }
          else pulseBell();
        })
      .subscribe();
  }

  function pulseBell() { var b = $("#notifBell"); if (b && !reduce) { b.classList.remove("ring"); void b.offsetWidth; b.classList.add("ring"); } }

  // ── dropdown ─────────────────────────────────────────────────────────────────
  function isOpen() { return !!$(".notif-menu"); }
  function closeMenu() { var m = $(".notif-menu"); if (m) m.remove(); }

  function menuHTML() {
    if (!loaded) {
      return '<div class="notif-menu-head"><b>Notifications</b></div>' +
        '<div class="notif-list">' + Array(4).fill('<div class="notif-skel"><span class="skeleton" style="width:34px;height:34px;border-radius:10px"></span><span class="skeleton" style="flex:1;height:34px;border-radius:8px"></span></div>').join("") + "</div>";
    }
    var unread = unreadCount();
    var head = '<div class="notif-menu-head"><b>Notifications</b>' +
      (unread ? '<span class="notif-count">' + unread + " new</span>" : "") +
      (unread ? '<button class="notif-readall" id="notifReadAll">Mark all read</button>' : "") + "</div>";

    if (!cache.length) {
      return head + '<div class="notif-empty"><div class="ne-ico">' + bellIco + "</div><h4>All caught up</h4><p>New activity across your workspace will appear here.</p></div>";
    }

    var today = cache.filter(function (n) { return isToday(n.created_at); });
    var earlier = cache.filter(function (n) { return !isToday(n.created_at); });
    var section = function (label, rows) {
      if (!rows.length) return "";
      return '<div class="notif-group">' + esc(label) + "</div>" + rows.map(rowHTML).join("");
    };
    var foot = '<a class="notif-menu-foot" href="m04-notifications-center.html#/notifications" id="notifViewAll">View all notifications</a>';
    return head + '<div class="notif-list">' + section("Today", today) + section("Earlier", earlier) + "</div>" + foot;
  }

  function rowHTML(n) {
    var reg = REG(); var ico = reg ? reg.icon(n.type) : "🔔"; var label = reg ? reg.label(n.type) : n.type;
    var link = (n.data && (n.data.link || n.data.deep_link)) || "";
    return '<button class="notif-row' + (n.read_at ? "" : " unread") + '" data-id="' + esc(n.id) + '" data-link="' + esc(link) + '">' +
      '<span class="notif-ico">' + ico + "</span>" +
      '<span class="notif-body"><span class="notif-title">' + esc(n.title || label) + "</span>" +
      (n.body ? '<span class="notif-text">' + esc(n.body) + "</span>" : "") +
      '<span class="notif-meta">' + esc(timeAgo(n.created_at)) + "</span></span>" +
      (n.read_at ? "" : '<span class="notif-dot" aria-label="Unread"></span>') + "</button>";
  }

  function renderMenu() { var m = $(".notif-menu"); if (m) { m.innerHTML = menuHTML(); wireMenu(m); } }

  function openMenu(anchor) {
    closeMenu();
    var m = el("div", "notif-menu"); m.innerHTML = menuHTML();
    document.body.appendChild(m);
    var r = anchor.getBoundingClientRect();
    var w = Math.min(392, window.innerWidth - 24);
    m.style.width = w + "px";
    m.style.top = (r.bottom + 8) + "px";
    m.style.left = Math.max(12, Math.min(r.right - w, window.innerWidth - w - 12)) + "px";
    setTimeout(function () { m.classList.add("open"); }, 12);
    wireMenu(m);
    if (!loaded) load().then(renderMenu);
    var onDoc = function (e) { if (!m.contains(e.target) && !anchor.contains(e.target)) { closeMenu(); document.removeEventListener("click", onDoc); } };
    setTimeout(function () { document.addEventListener("click", onDoc); }, 0);
  }

  function wireMenu(m) {
    $$(".notif-row", m).forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.dataset.id, link = b.dataset.link;
        markRead(id);
        if (ctx && typeof ctx.onNavigate === "function") ctx.onNavigate(link, id);
        else if (link) { closeMenu(); if (ctx && ctx.connected) global.location.href = link; }
      });
    });
    var ra = $("#notifReadAll", m); if (ra) ra.addEventListener("click", function (e) { e.stopPropagation(); markAllRead(); });
  }

  // ── mutations ────────────────────────────────────────────────────────────────
  function markRead(id) {
    var n = cache.find(function (x) { return x.id === id; });
    if (n && !n.read_at) { n.read_at = new Date().toISOString(); paintBadge(); if (isOpen()) renderMenu(); }
    if (ctx && ctx.connected && n) ctx.client.from("notifications").update({ read_at: n.read_at }).eq("id", id).then(function () {});
  }
  function markAllRead() {
    var now = new Date().toISOString(); var any = false;
    cache.forEach(function (n) { if (!n.read_at) { n.read_at = now; any = true; } });
    paintBadge(); if (isOpen()) renderMenu();
    if (any && ctx && typeof ctx.toast === "function") ctx.toast("All notifications marked read", "success");
    if (ctx && ctx.connected) ctx.client.from("notifications").update({ read_at: now }).eq("workspace_id", ctx.workspaceId).is("read_at", null).then(function () {});
  }

  // ── public: mount / rewire ───────────────────────────────────────────────────
  function mount(opts) {
    ctx = opts || {};
    var bell = $("#notifBell");
    if (bell) bell.addEventListener("click", function (e) { e.stopPropagation(); if (isOpen()) closeMenu(); else openMenu(bell); });
    if (!loaded) load(); else paintBadge();
    subscribe();
    return { refresh: load, unread: unreadCount, get: function () { return cache.slice(); }, markRead: markRead, markAllRead: markAllRead };
  }

  // Let the full-page feed reuse the same cache/mutations.
  function api() { return { get: function () { return cache.slice(); }, load: load, markRead: markRead, markAllRead: markAllRead, unread: unreadCount, timeAgo: timeAgo, isToday: isToday }; }

  global.AIMS_NOTIFICATIONS = { bellMarkup: bellMarkup, mount: mount, api: api, timeAgo: timeAgo, isToday: isToday };
})(window);
