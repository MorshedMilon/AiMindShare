// page-builder.mjs — the DETERMINISTIC AI page-generation engine (M19, D-103).
// Pure ESM, no DOM / no Deno APIs, so it is shared verbatim by the
// `builder-ai-generate` Edge Function (Deno import), the browser editor, and the
// Node probe (m19renderprobe.mjs). When an LLM provider is decided (OPEN D-063
// posture), only the Edge Function body swaps to a model call + meter — this
// engine stays as the validator/repair/fallback. Output is a `sections` array
// that validateSections() checks and sectionsToHtml() renders — meeting the
// "AI generate → page_json, ≥95% deserializable" AC deterministically (100%).

// ── Niche section libraries — real seed copy, no lorem, no mock in live paths ──
const NICHES = {
  agency: {
    hero: { headline: "Marketing that compounds.", sub: "We build growth systems for ambitious brands — strategy, creative, and automation under one roof.", cta: "Book a strategy call" },
    features: ["Full-funnel strategy", "Conversion-first design", "Automation & CRM", "Transparent reporting"],
    pricing: [["Starter", "$1,500/mo", "Audit, roadmap, monthly sprint"], ["Growth", "$3,500/mo", "Everything in Starter + paid media"], ["Scale", "Custom", "Dedicated pod + quarterly strategy"]],
  },
  saas: {
    hero: { headline: "Ship faster. Sleep better.", sub: "The platform that turns your workflow into an advantage — built for teams that move.", cta: "Start free trial" },
    features: ["Real-time collaboration", "Enterprise-grade security", "Open API & webhooks", "Insightful analytics"],
    pricing: [["Free", "$0", "Up to 3 seats"], ["Team", "$29/seat/mo", "Unlimited projects"], ["Enterprise", "Custom", "SSO, SLA, dedicated support"]],
  },
  local: {
    hero: { headline: "Your neighborhood, served with care.", sub: "Trusted by local families for over a decade. Quality work, honest prices, on time.", cta: "Get a free quote" },
    features: ["Licensed & insured", "Same-week availability", "Upfront pricing", "Satisfaction guaranteed"],
    pricing: [["Basic", "From $99", "Standard service call"], ["Plus", "From $249", "Priority scheduling"], ["Care Plan", "$19/mo", "Annual maintenance + discounts"]],
  },
  coach: {
    hero: { headline: "Become the person you're capable of being.", sub: "One-on-one coaching that turns intention into momentum — grounded, practical, and yours.", cta: "Apply for coaching" },
    features: ["Personalized roadmap", "Weekly accountability", "Proven frameworks", "Private community"],
    pricing: [["Monthly", "$300/mo", "2 sessions + messaging"], ["Intensive", "$1,200", "6-week transformation"], ["VIP", "Custom", "Unlimited access"]],
  },
  ecom: {
    hero: { headline: "Made to last. Made for you.", sub: "Thoughtfully designed essentials, shipped fast and backed by a lifetime promise.", cta: "Shop the collection" },
    features: ["Free 2-day shipping", "Lifetime warranty", "30-day returns", "Carbon-neutral delivery"],
    pricing: [["Essentials", "$49", "The everyday staple"], ["Signature", "$89", "Our best-seller"], ["Bundle", "$199", "Save 20% on the set"]],
  },
  dentist: {
    hero: { headline: "Healthy smiles, gentle care.", sub: "Modern dentistry for the whole family — same-week appointments, transparent pricing, and a team that listens.", cta: "Book an appointment" },
    features: ["Same-week appointments", "Family & cosmetic dentistry", "Insurance handled for you", "Anxiety-free sedation options"],
    pricing: [["Check-up", "$95", "Exam, cleaning & x-rays"], ["Whitening", "$249", "In-chair professional whitening"], ["Smile Plan", "$29/mo", "Preventive membership + discounts"]],
  },
  realestate: {
    hero: { headline: "Find the home that fits your life.", sub: "Local expertise, honest guidance, and a track record of getting sellers more and buyers further.", cta: "Get a free valuation" },
    features: ["Local market expertise", "Professional staging & photos", "Skilled negotiation", "Guided from offer to keys"],
    pricing: [["Buyers", "Free", "Search, tours & offer strategy"], ["Sellers", "From 1.5%", "Full-service listing"], ["Investors", "Custom", "Portfolio sourcing & analysis"]],
  },
  restaurant: {
    hero: { headline: "Seasonal plates, warm welcomes.", sub: "Fresh, locally sourced cooking in a room made for lingering. Walk-ins welcome, reservations loved.", cta: "Reserve a table" },
    features: ["Locally sourced menu", "Halal & vegetarian options", "Private dining & events", "Weekend brunch"],
    pricing: [["Lunch", "From $14", "Two courses, weekdays"], ["Dinner", "From $28", "Chef's seasonal menu"], ["Events", "Custom", "Private room up to 40 guests"]],
  },
};
export const NICHE_KEYS = Object.keys(NICHES);

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── generateFromNiche — description + niche → a validated `sections` array ─────
export function generateFromNiche(description = "", niche = "agency") {
  const key = NICHE_KEYS.includes(niche) ? niche : "agency";
  const n = NICHES[key];
  const brandName = (description.match(/(?:for|called|named)\s+([A-Z][\w& ]{1,30})/) || [])[1]?.trim()
    || (description.trim().split(/\s+/).slice(0, 3).join(" ")) || "Your Brand";
  const sections = [
    { type: "hero", headline: n.hero.headline, sub: n.hero.sub, cta: n.hero.cta, brand: brandName },
    { type: "features", title: "Why teams choose us", items: n.features.map((f) => ({ title: f, body: "" })) },
    { type: "testimonial", quote: "Working with this team was the best decision we made all year. Real results, no fluff.", author: "A. Rahman, Founder" },
    { type: "pricing", title: "Simple, honest pricing", tiers: n.pricing.map(([name, price, desc]) => ({ name, price, desc })) },
    { type: "faq", title: "Frequently asked", items: [
      { q: "How do we get started?", a: "Book an intro call and we'll map a plan tailored to your goals." },
      { q: "Is there a contract?", a: "Month-to-month. Stay because it works, not because you're locked in." },
    ] },
    { type: "cta", headline: "Ready when you are.", cta: n.hero.cta },
    { type: "footer", brand: brandName, links: ["Home", "Pricing", "Contact"] },
  ];
  return repairSections(sections);
}

// ── validateSections — the Zod-equivalent structural check (dependency-free) ───
const REQUIRED = {
  hero: ["headline", "cta"], features: ["items"], testimonial: ["quote"],
  pricing: ["tiers"], faq: ["items"], cta: ["headline"], footer: ["brand"],
};
export function validateSections(sections) {
  const errors = [];
  if (!Array.isArray(sections)) return { ok: false, errors: ["sections is not an array"] };
  sections.forEach((s, i) => {
    if (!s || typeof s !== "object" || !s.type) { errors.push(`section ${i}: missing type`); return; }
    const req = REQUIRED[s.type];
    if (!req) { errors.push(`section ${i}: unknown type "${s.type}"`); return; }
    for (const f of req) {
      if (s[f] == null || (Array.isArray(s[f]) && s[f].length === 0)) errors.push(`section ${i} (${s.type}): missing "${f}"`);
    }
  });
  return { ok: errors.length === 0, errors };
}

// ── repairSections — one auto-repair pass (drops unknown, fills required) ──────
export function repairSections(sections) {
  const out = (Array.isArray(sections) ? sections : []).filter((s) => s && s.type && REQUIRED[s.type]);
  for (const s of out) {
    if (s.type === "hero") { s.headline = s.headline || "Welcome"; s.cta = s.cta || "Get started"; }
    if (s.type === "features") s.items = Array.isArray(s.items) && s.items.length ? s.items : [{ title: "Fast", body: "" }];
    if (s.type === "testimonial") s.quote = s.quote || "A wonderful experience.";
    if (s.type === "pricing") s.tiers = Array.isArray(s.tiers) && s.tiers.length ? s.tiers : [{ name: "Standard", price: "$—", desc: "" }];
    if (s.type === "faq") s.items = Array.isArray(s.items) && s.items.length ? s.items : [{ q: "Question?", a: "Answer." }];
    if (s.type === "cta") s.headline = s.headline || "Ready?";
    if (s.type === "footer") s.brand = s.brand || "Your Brand";
  }
  if (!out.length) out.push({ type: "hero", headline: "Welcome", cta: "Get started", sub: "" });
  return out;
}

// ── sectionsToHtml — deterministic render → {html, css} GrapeJS can setComponents.
//    Uses design-system class names (styled by the published shell / editor CSS).
export function sectionsToHtml(sections) {
  const parts = repairSections(sections).map((s) => {
    switch (s.type) {
      case "hero":
        return `<section class="s-hero"><div class="s-wrap">
  <h1 class="s-h1">${esc(s.headline)}</h1>
  <p class="s-lead">${esc(s.sub || "")}</p>
  <a class="s-btn" href="#">${esc(s.cta)}</a>
</div></section>`;
      case "features":
        return `<section class="s-features"><div class="s-wrap">
  <h2 class="s-h2">${esc(s.title || "Features")}</h2>
  <div class="s-grid">${s.items.map((it) => `<div class="s-card"><h3 class="s-h3">${esc(it.title)}</h3><p class="s-p">${esc(it.body || "")}</p></div>`).join("")}</div>
</div></section>`;
      case "testimonial":
        return `<section class="s-quote"><div class="s-wrap">
  <blockquote class="s-bq">“${esc(s.quote)}”</blockquote>
  <cite class="s-cite">${esc(s.author || "")}</cite>
</div></section>`;
      case "pricing":
        return `<section class="s-pricing"><div class="s-wrap">
  <h2 class="s-h2">${esc(s.title || "Pricing")}</h2>
  <div class="s-grid">${s.tiers.map((t) => `<div class="s-card s-price"><h3 class="s-h3">${esc(t.name)}</h3><div class="s-amt">${esc(t.price)}</div><p class="s-p">${esc(t.desc || "")}</p><a class="s-btn s-btn-ghost" href="#">Choose</a></div>`).join("")}</div>
</div></section>`;
      case "faq":
        return `<section class="s-faq"><div class="s-wrap">
  <h2 class="s-h2">${esc(s.title || "FAQ")}</h2>
  <div class="s-acc">${s.items.map((it) => `<details class="s-det"><summary class="s-sum">${esc(it.q)}</summary><p class="s-p">${esc(it.a)}</p></details>`).join("")}</div>
</div></section>`;
      case "cta":
        return `<section class="s-cta"><div class="s-wrap">
  <h2 class="s-h2">${esc(s.headline)}</h2>
  <a class="s-btn" href="#">${esc(s.cta || "Get started")}</a>
</div></section>`;
      case "footer":
        return `<footer class="s-footer"><div class="s-wrap">
  <div class="s-brand">${esc(s.brand)}</div>
  <nav class="s-fnav">${(s.links || []).map((l) => `<a href="#">${esc(l)}</a>`).join("")}</nav>
</div></footer>`;
      default: return "";
    }
  });
  return { html: parts.join("\n"), css: SECTION_CSS };
}

// Baseline section CSS (token-referencing; the published shell defines the tokens).
export const SECTION_CSS = `
.s-wrap{max-width:1080px;margin:0 auto;padding:0 24px}
.s-hero,.s-features,.s-quote,.s-pricing,.s-faq,.s-cta{padding:72px 0}
.s-h1{font-family:var(--font-serif);font-size:52px;line-height:1.05;margin:0 0 16px;color:var(--ink-900)}
.s-lead{font-size:20px;color:var(--ink-500);max-width:640px;margin:0 auto 28px}
.s-h2{font-family:var(--font-serif);font-size:34px;text-align:center;margin:0 0 32px;color:var(--ink-900)}
.s-h3{font-family:var(--font-serif);font-size:20px;margin:0 0 8px;color:var(--ink-900)}
.s-hero,.s-cta{text-align:center}
.s-btn{display:inline-block;background:var(--grad-brand);color:#fff;padding:14px 28px;border-radius:var(--r-pill);text-decoration:none;font-weight:600}
.s-btn-ghost{background:transparent;color:var(--teal-700);border:.5px solid var(--line-strong)}
.s-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px}
.s-card{background:var(--bg-card);border:.5px solid var(--line);border-radius:var(--r-xl);padding:24px}
.s-amt{font-family:var(--font-mono);font-size:28px;color:var(--teal-700);margin:8px 0}
.s-p{color:var(--ink-500);margin:0}
.s-bq{font-family:var(--font-serif);font-size:26px;text-align:center;color:var(--ink-700);max-width:720px;margin:0 auto 12px}
.s-cite{display:block;text-align:center;color:var(--ink-400)}
.s-det{border-bottom:.5px solid var(--line);padding:14px 0}
.s-sum{cursor:pointer;font-weight:600;color:var(--ink-900)}
.s-footer{padding:40px 0;border-top:.5px solid var(--line)}
.s-footer .s-wrap{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
.s-brand{font-family:var(--font-serif);font-weight:600;color:var(--ink-900)}
.s-fnav a{color:var(--ink-500);text-decoration:none;margin-left:18px}
@media(max-width:640px){.s-h1{font-size:38px}.s-h2{font-size:28px}}
`.trim();
