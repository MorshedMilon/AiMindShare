/* m19-editor.js — GrapeJS init + the M19 custom block set (D-102 embeds).
   Exposes window.M19Editor.init(el, opts) → an editor handle with exportPage().
   GrapeJS is initialised with NO preset; the block manager, style manager, device
   manager and panels are configured to the AiMindShare design system. The three
   platform embeds (Form / Calendar / Chat) export as data-* placeholders that the
   published-page hydration script mounts at view time (calendar → real M14, form →
   planned M15 scaffold, chat → M12 web-chat scaffold). page_json = getProjectData();
   render_html/render_css = getHtml()/getCss() — the snapshot the public renderer serves. */
(function () {
  "use strict";
  if (!window.grapesjs) { window.M19Editor = { init: () => null }; return; }

  // Block definitions: label + category + the HTML GrapeJS drops on the canvas.
  const BLOCKS = [
    // Layout
    { id: "section", label: "Section", cat: "Layout", content: `<section class="s-block" style="padding:56px 24px"><div style="max-width:1080px;margin:0 auto"><h2>Section</h2><p>Drop content here.</p></div></section>` },
    { id: "hero", label: "Hero", cat: "Layout", content: `<section class="s-hero" style="padding:72px 24px;text-align:center"><div style="max-width:1080px;margin:0 auto"><h1 style="font-family:var(--font-serif);font-size:52px;margin:0 0 16px">Your headline here</h1><p style="font-size:20px;color:var(--ink-500);max-width:640px;margin:0 auto 28px">A short line that explains the value you deliver.</p><a class="s-btn" href="#" style="display:inline-block;background:var(--grad-brand);color:#fff;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600">Call to action</a></div></section>` },
    { id: "pricing", label: "Pricing", cat: "Layout", content: `<section class="s-pricing" style="padding:72px 24px"><div style="max-width:1080px;margin:0 auto"><h2 style="font-family:var(--font-serif);font-size:34px;text-align:center;margin:0 0 32px">Simple, honest pricing</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px">${["Starter|$29/mo", "Growth|$79/mo", "Scale|Custom"].map((t) => { const [n, p] = t.split("|"); return `<div style="background:var(--bg-card);border:.5px solid var(--line);border-radius:18px;padding:24px;text-align:center"><h3 style="font-family:var(--font-serif);margin:0 0 8px">${n}</h3><div style="font-family:var(--font-mono);font-size:28px;color:var(--teal-700);margin:8px 0">${p}</div><p style="color:var(--ink-500)">What's included, in one line.</p><a class="s-btn" href="#" style="display:inline-block;border:.5px solid var(--line-strong);border-radius:999px;padding:10px 24px;text-decoration:none">Choose</a></div>`; }).join("")}</div></div></section>` },
    { id: "gallery", label: "Gallery", cat: "Layout", content: `<section class="s-gallery" style="padding:56px 24px"><div style="max-width:1080px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px">${Array(3).fill(`<div style="aspect-ratio:4/3;background:var(--bg-card);border:.5px solid var(--line);border-radius:14px;display:grid;place-items:center;color:var(--ink-400)">Drop an image</div>`).join("")}</div></section>` },
    { id: "row-2", label: "2 Columns", cat: "Layout", content: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:1080px;margin:24px auto;padding:0 24px"><div>Column one</div><div>Column two</div></div>` },
    { id: "row-3", label: "3 Columns", cat: "Layout", content: `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;max-width:1080px;margin:24px auto;padding:0 24px"><div>One</div><div>Two</div><div>Three</div></div>` },
    { id: "spacer", label: "Spacer", cat: "Layout", content: `<div style="height:48px"></div>` },
    { id: "divider", label: "Divider", cat: "Layout", content: `<hr style="border:none;border-top:.5px solid var(--line);max-width:1080px;margin:24px auto">` },
    // Content
    { id: "heading", label: "Heading", cat: "Content", content: `<h2 style="font-family:var(--font-serif);text-align:center;margin:24px">Your headline</h2>` },
    { id: "text", label: "Text", cat: "Content", content: `<p style="max-width:680px;margin:16px auto;padding:0 24px;color:var(--ink-500)">Write something meaningful here.</p>` },
    { id: "image", label: "Image", cat: "Content", content: { type: "image", style: { padding: "10px" }, activeOnRender: 1 } },
    { id: "button", label: "Button", cat: "Content", content: `<a class="s-btn" href="#" style="display:inline-block;margin:16px 24px">Call to action</a>` },
    { id: "video", label: "Video", cat: "Content", content: `<div style="max-width:880px;margin:24px auto;aspect-ratio:16/9"><iframe width="100%" height="100%" src="https://www.youtube.com/embed/" frameborder="0" allowfullscreen style="border-radius:14px"></iframe></div>` },
    { id: "testimonial", label: "Testimonial", cat: "Content", content: `<blockquote style="font-family:var(--font-serif);font-size:24px;text-align:center;max-width:720px;margin:32px auto;color:var(--ink-700)">“A wonderful experience from start to finish.”<footer style="font-size:15px;color:var(--ink-400);margin-top:10px">— Happy client</footer></blockquote>` },
    { id: "faq", label: "FAQ", cat: "Content", content: `<div style="max-width:720px;margin:24px auto;padding:0 24px"><details style="border-bottom:.5px solid var(--line);padding:12px 0"><summary style="cursor:pointer;font-weight:600">A common question?</summary><p style="color:var(--ink-500)">A clear, helpful answer.</p></details></div>` },
    { id: "html", label: "Embed HTML", cat: "Content", content: `<div data-gjs-type="text">&lt;!-- paste HTML here --&gt;</div>` },
    // Platform embeds (data-* placeholders, hydrated on the published page)
    { id: "form-embed", label: "Form (M15)", cat: "AiMindShare", content: { type: "form-embed" } },
    { id: "calendar-embed", label: "Calendar (M14)", cat: "AiMindShare", content: { type: "calendar-embed" } },
    { id: "chat-embed", label: "Chat (M12)", cat: "AiMindShare", content: { type: "chat-embed" } },
  ];

  // Custom component types for the three embeds (trait-driven placeholders).
  function registerEmbeds(editor) {
    const dc = editor.DomComponents;
    const embed = (type, dataAttr, label, trait) => dc.addType(type, {
      isComponent: (elx) => elx.getAttribute && elx.getAttribute("data-embed") === dataAttr,
      model: {
        defaults: {
          tagName: "div",
          attributes: { "data-embed": dataAttr, class: "ams-embed" },
          traits: [trait],
          components: `<div class="embed-ph"><b>${label}</b><span>Configure in the Settings panel · loads on the published page</span></div>`,
          droppable: false,
        },
      },
    });
    embed("form-embed", "form", "Form embed", { type: "text", name: "data-form-id", label: "Form ID (M15)" });
    embed("calendar-embed", "calendar", "Calendar embed", { type: "text", name: "data-slug", label: "Calendar slug (M14)" });
    embed("chat-embed", "chat", "Chat widget", { type: "text", name: "data-channel", label: "Channel (M12)" });
  }

  window.M19Editor = {
    init(mountEl, opts) {
      opts = opts || {};
      const editor = window.grapesjs.init({
        container: mountEl,
        height: "100%",
        width: "auto",
        storageManager: false,
        undoManager: { trackSelection: false },
        blockManager: { appendTo: opts.blocksEl || undefined, blocks: [] },
        layerManager: { appendTo: opts.layersEl || undefined },
        traitManager: { appendTo: opts.traitsEl || undefined },
        selectorManager: { componentFirst: true },
        styleManager: {
          appendTo: opts.stylesEl || undefined,
          sectors: [
            { name: "Typography", open: true, properties: ["font-size", "font-weight", "color", "text-align", "line-height", "letter-spacing"] },
            { name: "Spacing", open: false, properties: ["margin", "padding"] },
            { name: "Background", open: false, properties: ["background-color", "background"] },
            { name: "Border", open: false, properties: ["border-radius", "border"] },
            { name: "Layout", open: false, properties: ["display", "width", "max-width", "height", "align-items", "justify-content"] },
          ],
        },
        deviceManager: {
          devices: [
            { name: "Desktop", width: "" },
            { name: "Tablet", width: "768px", widthMedia: "768px" },
            { name: "Mobile", width: "375px", widthMedia: "480px" },
          ],
        },
        panels: { defaults: [] },
      });

      registerEmbeds(editor);
      BLOCKS.forEach((b) => editor.BlockManager.add(b.id, {
        label: b.label, category: b.cat, content: b.content,
        attributes: { class: "gjs-block-ams" },
      }));

      // Load the page: prefer stored render html/css; else the project data.
      if (opts.html != null) {
        editor.setComponents(opts.html || "");
        if (opts.css != null) editor.setStyle(opts.css || "");
      } else if (opts.projectData) {
        try { editor.loadProjectData(opts.projectData); } catch (e) { /* fresh */ }
      }

      return {
        editor,
        setContent(html, css) { editor.setComponents(html || ""); if (css != null) editor.setStyle(css || ""); },
        exportPage() {
          return { page_json: editor.getProjectData(), render_html: editor.getHtml(), render_css: editor.getCss() };
        },
        device(name) { editor.setDevice(name); },
        undo() { editor.UndoManager.undo(); },
        redo() { editor.UndoManager.redo(); },
        destroy() { try { editor.destroy(); } catch (e) {} },
      };
    },
  };
})();
