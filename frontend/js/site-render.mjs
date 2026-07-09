// site-render.mjs — the PURE public-page renderer (M19, D-100/D-102/D-106).
// No DOM / no Deno APIs → shared verbatim by the `site-render` Edge Function
// (Deno), the editor "Preview", and the Node probe. Turns a stored page snapshot
// (render_html/render_css) into a full HTML document with per-page SEO meta,
// JSON-LD schema, brand CSS variables, the M05 cookie banner, the first-party
// tracking pixel, and the embed-hydration script (calendar→M14 iframe,
// form→M15 fetch scaffold, chat→M12 scaffold). The renderer never runs GrapeJS.

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Per-site style presets (D-150) — token overrides layered UNDER the brand jsonb
// (brand always wins). Shared by the published page and the editor preview.
export const STYLE_PRESETS = {
  minimal: `--grad-brand:linear-gradient(135deg,#1a1a1a,#3a3a3a);--font-serif:Inter,system-ui,sans-serif;--r-xl:8px;--r-pill:8px`,
  bold:    `--grad-brand:linear-gradient(135deg,#e8590c,#c2255c);--ink-900:#141414;--r-xl:20px`,
  elegant: `--grad-brand:linear-gradient(135deg,#6b5b95,#b8a9c9);--font-serif:'Cormorant Garamond',Georgia,serif`,
  islamic: `--grad-brand:linear-gradient(135deg,#0f5f4c,#b8912a);--ink-900:#12312a;--font-serif:'Shippori Mincho',Georgia,serif`,
};

// Brand + preset → CSS custom properties injected on :root of the published page.
// Preset first, brand second — the workspace's brand kit always overrides.
function brandVars(brand = {}, preset = null) {
  const c = brand.colors || {}, f = brand.fonts || {};
  const decls = [];
  if (preset && STYLE_PRESETS[preset]) decls.push(STYLE_PRESETS[preset]);
  if (c.teal) decls.push(`--grad-brand:linear-gradient(135deg,${esc(c.teal)},${esc(c.teal2 || c.teal)})`);
  if (c.ink) decls.push(`--ink-900:${esc(c.ink)}`);
  if (f.serif) decls.push(`--font-serif:${esc(f.serif)}`);
  return decls.length ? `:root{${decls.join(";")}}` : "";
}

// JSON-LD per meta.schema_type (LocalBusiness / Article / FAQPage / Product / Event).
function jsonLd(site, page) {
  const m = page.meta || {};
  const type = m.schema_type;
  if (!type) return "";
  const sj = m.schema_json || {};
  let obj;
  if (type === "FAQPage") {
    obj = { "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: (sj.faqs || []).map((f) => ({ "@type": "Question", name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  } else if (type === "Article") {
    obj = { "@context": "https://schema.org", "@type": "Article",
      headline: m.title || page.title, description: m.description || "" };
  } else if (type === "Product") {
    obj = { "@context": "https://schema.org", "@type": "Product",
      name: sj.name || m.title || page.title, description: m.description || "",
      ...(sj.price ? { offers: { "@type": "Offer", price: String(sj.price),
        priceCurrency: sj.currency || "USD" } } : {}) };
  } else if (type === "Event") {
    obj = { "@context": "https://schema.org", "@type": "Event",
      name: sj.name || m.title || page.title, description: m.description || "",
      ...(sj.start_date ? { startDate: sj.start_date } : {}),
      ...(sj.location ? { location: { "@type": "Place", name: sj.location } } : {}) };
  } else {
    obj = { "@context": "https://schema.org", "@type": "LocalBusiness",
      name: site.name, description: m.description || site.seo_defaults?.description || "" };
  }
  return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
}

// The client script that hydrates data-embed placeholders + fires the pixel.
export function hydrationScript(site, page, opts = {}) {
  const track = opts.trackUrl || "/functions/v1/site-track";
  return `<script>(function(){
  // first-party visitor id
  var k="ams_vid",v=null;try{v=localStorage.getItem(k)}catch(e){}
  if(!v){v=(Date.now().toString(36)+Math.random().toString(36).slice(2,8));try{localStorage.setItem(k,v)}catch(e){}}
  var ce=new URLSearchParams(location.search).get("ce")||null;
  try{navigator.sendBeacon(${JSON.stringify(track)},new Blob([JSON.stringify({site_id:${JSON.stringify(site.id)},visitor_id:v,slug:${JSON.stringify(page.slug)},contact_id:ce,utm:location.search})],{type:"application/json"}))}catch(e){}
  // hydrate embeds
  document.querySelectorAll('[data-embed]').forEach(function(el){
    var t=el.getAttribute('data-embed');
    if(t==='calendar'){var s=el.getAttribute('data-slug');if(s){var f=document.createElement('iframe');f.src='/book.html?embed=1&slug='+encodeURIComponent(s);f.style.cssText='width:100%;min-height:640px;border:0';el.innerHTML='';el.appendChild(f);}}
    else if(t==='form'){var ft=el.getAttribute('data-form-id');if(ft){var g=document.createElement('iframe');g.src='/f.html?embed=1&token='+encodeURIComponent(ft);g.style.cssText='width:100%;min-height:480px;border:0';el.innerHTML='';el.appendChild(g);window.addEventListener('message',function(ev){var d=ev.data;if(d&&d.__aims_form&&d.type==='height'&&d.token===ft){g.style.height=d.height+'px';}});}else{el.innerHTML='<div class="embed-note">Set a Form token (M15) in the editor Settings panel.</div>';}}
    else if(t==='chat'){el.innerHTML='<div class="embed-note">Chat widget loads here once M12 web-chat is connected.</div>';}
  });
}());</script>`;
}

// The M05 cookie banner (injected per D-106; cfg comes from the site/workspace).
export function cookieBanner(cfg = {}) {
  const text = esc(cfg.text || "We use cookies to improve your experience.");
  return `<div id="ams-cookie" class="ams-cookie" role="dialog" aria-label="Cookie notice">
  <span>${text}</span>
  <button onclick="document.getElementById('ams-cookie').remove()">Accept</button>
</div>`;
}

// renderPage — the full HTML document string for a published page.
export function renderPage({ site, page, cookie }) {
  const m = page.meta || {};
  const sd = site.seo_defaults || {};
  const title = esc(m.title || page.title || site.name);
  const desc = esc(m.description || sd.description || "");
  const robots = esc(m.robots || sd.robots || "index,follow");
  const canonical = m.canonical ? `<link rel="canonical" href="${esc(m.canonical)}">` : "";
  const og = m.og_image || sd.og_image;
  const favicon = site.favicon_url ? `<link rel="icon" href="${esc(site.favicon_url)}">` : "";
  const lang = esc(page.language || site.language || "en");
  return `<!doctype html>
<html lang="${lang}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta name="robots" content="${robots}">
<meta property="og:title" content="${title}"><meta property="og:description" content="${desc}">
${og ? `<meta property="og:image" content="${esc(og)}">` : ""}
${canonical}${favicon}
<link rel="stylesheet" href="/assets/css/tokens.css">
<style>${brandVars(site.brand, site.style_preset)}
body{margin:0;background:var(--bg);color:var(--ink-700);font-family:var(--font-sans)}
.embed-note{padding:24px;border:.5px dashed var(--line-strong);border-radius:var(--r-lg);color:var(--ink-400);text-align:center}
.ams-cookie{position:fixed;left:16px;right:16px;bottom:16px;max-width:560px;margin:0 auto;background:var(--card-solid);border:.5px solid var(--line);border-radius:var(--r-lg);padding:14px 18px;display:flex;gap:14px;align-items:center;justify-content:space-between;box-shadow:var(--shadow-lg);z-index:50}
.ams-cookie button{background:var(--grad-brand);color:#fff;border:0;border-radius:var(--r-pill);padding:8px 18px;cursor:pointer}
${page.render_css || ""}</style>
${jsonLd(site, page)}
</head><body>
${page.render_html || "<main></main>"}
${cookieBanner(cookie)}
${hydrationScript(site, page)}
</body></html>`;
}

// 404 shell for an unknown host / unpublished slug. A site with a custom
// not_found_html gets its own body inside the same safe shell.
export function renderNotFound(site = null) {
  const body = site?.not_found_html
    ? site.not_found_html
    : `<div><h1 style="font-family:var(--font-serif)">404</h1><p>This page hasn't been published.</p></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Not found</title>
<link rel="stylesheet" href="/assets/css/tokens.css">
<style>${brandVars(site?.brand || {}, site?.style_preset)}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink-500);font-family:var(--font-sans)}</style>
</head><body>${body}</body></html>`;
}

// Maintenance shell — served for every path while sites.maintenance_mode is on
// (the ?pt= staging token bypasses it so operators can still review).
export function renderMaintenance(site = {}) {
  return `<!doctype html><html lang="${esc(site.language || "en")}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(site.name || "Back soon")}</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/assets/css/tokens.css">
<style>${brandVars(site.brand || {}, site.style_preset)}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink-500);font-family:var(--font-sans);text-align:center}</style>
</head><body><div><h1 style="font-family:var(--font-serif)">We'll be right back.</h1>
<p>${esc(site.name || "This site")} is undergoing scheduled maintenance.</p></div></body></html>`;
}

// buildSitemap — valid XML with only published page slugs.
export function buildSitemap(site, pages, origin = "") {
  const urls = pages.filter((p) => p.status === "published").map((p) =>
    `  <url><loc>${esc(origin)}/${esc(p.is_home ? "" : p.slug)}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

// buildRobots — allow all + point at the sitemap.
export function buildRobots(origin = "") {
  return `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`;
}
