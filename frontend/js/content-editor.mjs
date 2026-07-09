// content-editor.mjs — the hand-rolled contenteditable rich editor (M22, D-120).
// No TipTap/ProseMirror (no-build vanilla stack). A focused block editor: toolbar
// (H2/H3, bold, italic, link, lists, quote, code), a "/" slash menu, an M06 image
// picker seam, and an internal-link search popup. getHtml() returns SANITISED
// semantic HTML (tag+attr allowlist) → blog_articles.content_html. sanitizeHtml is
// pure (regex allowlist) so the Node probe can exercise it without a DOM.

// ── allowlist sanitiser (pure — no DOM, runs in Node + browser) ───────────────
const ALLOWED = new Set(["h2","h3","p","ul","ol","li","blockquote","pre","code",
  "a","img","strong","em","b","i","br","hr","figure","figcaption"]);
const ALLOWED_ATTR = { a: ["href","title"], img: ["src","alt","title"] };

export function sanitizeHtml(html) {
  let out = String(html == null ? "" : html)
    // drop whole dangerous elements + their content
    .replace(/<(script|style|iframe|object|embed|link|meta)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, "");
  // walk every tag: keep allowlisted ones (with allowlisted attrs), strip the rest
  out = out.replace(/<(\/?)([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g,
    (m, close, tagRaw, attrs) => {
      const tag = tagRaw.toLowerCase();
      if (!ALLOWED.has(tag)) return "";            // unknown tag → unwrap (keep inner text)
      if (close) return `</${tag}>`;
      const keep = ALLOWED_ATTR[tag] || [];
      let safe = "";
      const re = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g; let a;
      while ((a = re.exec(attrs))) {
        const name = a[1].toLowerCase(), val = a[3] != null ? a[3] : a[4];
        if (name.startsWith("on")) continue;        // no event handlers
        if (!keep.includes(name)) continue;
        if ((name === "href" || name === "src") && /^\s*javascript:/i.test(val)) continue;
        safe += ` ${name}="${val.replace(/"/g, "&quot;")}"`;
      }
      return `<${tag}${safe}>`;
    });
  return out.replace(/\s+\n/g, "\n").trim();
}

// ── the browser editor controller ─────────────────────────────────────────────
// opts: { onChange(html), openAssetPicker()->Promise<{url,alt}>, searchArticles(q)->Promise<[{title,slug}]> }
export function createEditor(rootEl, opts = {}) {
  if (!rootEl || typeof document === "undefined") return null;
  const { onChange = () => {}, openAssetPicker, searchArticles } = opts;

  rootEl.innerHTML = "";
  rootEl.classList.add("ce-root");
  const bar = document.createElement("div"); bar.className = "ce-toolbar";
  const body = document.createElement("div");
  body.className = "ce-body article-body"; body.contentEditable = "true";
  body.setAttribute("role", "textbox"); body.setAttribute("aria-multiline", "true");
  rootEl.append(bar, body);

  const exec = (cmd, val = null) => { document.execCommand(cmd, false, val); body.focus(); fire(); };
  const wrapBlock = (tag) => exec("formatBlock", tag);
  const BTN = [
    ["H2", () => wrapBlock("h2"), "Heading 2"], ["H3", () => wrapBlock("h3"), "Heading 3"],
    ["B", () => exec("bold"), "Bold"], ["I", () => exec("italic"), "Italic"],
    ["“ ”", () => wrapBlock("blockquote"), "Quote"], ["</>", () => wrapBlock("pre"), "Code block"],
    ["• List", () => exec("insertUnorderedList"), "Bullet list"],
    ["1. List", () => exec("insertOrderedList"), "Numbered list"],
    ["Link", () => addLink(), "Insert link"], ["Image", () => addImage(), "Insert image (M06)"],
    ["↺", () => exec("undo"), "Undo"],
  ];
  BTN.forEach(([label, fn, title]) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "ce-btn"; b.textContent = label; b.title = title;
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", fn);
    bar.append(b);
  });

  let changeTimer = null;
  function fire() {
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => onChange(getHtml()), 300);
  }
  body.addEventListener("input", fire);

  // "/" slash menu at an empty line
  const menu = document.createElement("div"); menu.className = "ce-slash"; menu.hidden = true;
  rootEl.append(menu);
  const SLASH = [
    ["Heading 2", () => wrapBlock("h2")], ["Heading 3", () => wrapBlock("h3")],
    ["Quote", () => wrapBlock("blockquote")], ["Bulleted list", () => exec("insertUnorderedList")],
    ["Numbered list", () => exec("insertOrderedList")], ["Divider", () => exec("insertHorizontalRule")],
    ["Image", () => addImage()], ["Internal link", () => addInternalLink()],
  ];
  body.addEventListener("keydown", (e) => {
    if (e.key === "/" ) {
      const sel = window.getSelection();
      if (sel && sel.anchorNode && !sel.toString()) openSlash();
    } else if (e.key === "Escape") closeSlash();
  });
  function openSlash() {
    menu.innerHTML = ""; menu.hidden = false;
    SLASH.forEach(([label, fn]) => {
      const item = document.createElement("button");
      item.type = "button"; item.className = "ce-slash-item"; item.textContent = label;
      item.addEventListener("mousedown", (e) => { e.preventDefault(); closeSlash(); fn(); });
      menu.append(item);
    });
  }
  const closeSlash = () => { menu.hidden = true; };
  document.addEventListener("click", (e) => { if (!menu.contains(e.target)) closeSlash(); });

  function addLink() {
    const url = window.prompt("Link URL (https://… or /blog/slug)");
    if (url) exec("createLink", url);
  }
  async function addImage() {
    if (typeof openAssetPicker === "function") {
      const asset = await openAssetPicker();
      if (asset && asset.url) insertHtml(`<img src="${asset.url}" alt="${(asset.alt || "").replace(/"/g, "&quot;")}">`);
    } else {
      const url = window.prompt("Image URL");
      if (url) insertHtml(`<img src="${url}" alt="">`);
    }
  }
  async function addInternalLink() {
    if (typeof searchArticles !== "function") return addLink();
    const q = window.prompt("Search published articles by title");
    if (!q) return;
    const results = (await searchArticles(q)) || [];
    if (!results.length) { window.alert("No published articles matched."); return; }
    const a = results[0];
    insertHtml(`<a href="/blog/${a.slug}">${a.title}</a>`);
  }
  function insertHtml(html) { body.focus(); document.execCommand("insertHTML", false, html); fire(); }

  function getHtml() { return sanitizeHtml(body.innerHTML); }
  function setHtml(html) { body.innerHTML = html || ""; }
  function focus() { body.focus(); }

  return { getHtml, setHtml, focus, el: body };
}
