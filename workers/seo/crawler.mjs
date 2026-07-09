// workers/seo/crawler.mjs — pure, resumable BFS crawler for the M21 technical audit.
// NO network, NO db: the worker injects `fetchFn` (a rate-limited, robots-aware fetch)
// and persists the returned `state` into seo_audits.cursor between chunks. Because one
// call does a BOUNDED amount of work and returns the full resume state, the crawler fits
// ANY runtime budget (GitHub Actions minutes OR a VPS) — the D-010 resolution never
// forces a rewrite (D-131). Call it repeatedly until state.frontier is empty or
// state.visited.length reaches maxPages.
//
//   let state = { frontier: [origin], visited: [], issues: [] };
//   do { state = await crawlStep(state, { origin, batch: 50, fetchFn }); }
//   while (state.frontier.length && state.visited.length < 500);
//
// fetchFn(url) must resolve to { status:number, html:string }.

const norm = (u) => u.split("#")[0].replace(/\/$/, "") || u; // drop hash + trailing slash

// Extract same-origin links from an HTML string, normalised + absolute.
function linksFrom(html, base, origin) {
  const out = [];
  const re = /<a\b[^>]*\bhref=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;
    let abs;
    try { abs = new URL(href, base).toString(); } catch { continue; }
    if (!abs.startsWith("http")) continue;
    if (new URL(abs).origin !== origin) continue; // same-origin only
    out.push(norm(abs));
  }
  return out;
}

// Inspect one fetched page → typed issues (broken links, missing on-page SEO tags).
function inspect(url, status, html) {
  const issues = [];
  if (status >= 400) {
    issues.push({ type: "broken_link", severity: "critical", url, detail: `HTTP ${status}` });
    return issues; // don't parse a dead page
  }
  if (status >= 300) {
    issues.push({ type: "redirect_chain", severity: "warning", url, detail: `HTTP ${status}` });
    return issues;
  }
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim();
  if (!title) issues.push({ type: "missing_title", severity: "warning", url, detail: "no <title>" });
  if (!/<h1[\s>]/i.test(html)) issues.push({ type: "missing_h1", severity: "warning", url, detail: "no <h1>" });
  if (!/<meta[^>]+name=["']description["']/i.test(html))
    issues.push({ type: "missing_meta", severity: "notice", url, detail: "no meta description" });
  return issues;
}

// Process up to `batch` pages of work, discovering links as it goes, and return the
// new resume state. Pure and deterministic given the same fetchFn responses.
export async function crawlStep(state, opts) {
  const { origin, batch = 50, fetchFn, maxPages = 500, disallow = [] } = opts;
  const frontier = [...state.frontier];
  const visited = new Set(state.visited);
  const issues = [...state.issues];
  let processed = 0;

  while (processed < batch && frontier.length > 0 && visited.size < maxPages) {
    const url = frontier.shift();
    if (visited.has(url)) continue;
    if (disallow.some((p) => new URL(url).pathname.startsWith(p))) { visited.add(url); continue; }

    let status = 0, html = "";
    try { const r = await fetchFn(url); status = r.status; html = r.html || ""; }
    catch { status = 0; issues.push({ type: "broken_link", severity: "critical", url, detail: "fetch failed" }); }

    visited.add(url);
    processed++;
    if (status === 0) continue;

    for (const iss of inspect(url, status, html)) issues.push(iss);

    if (status < 300) {
      for (const link of linksFrom(html, url, origin)) {
        if (!visited.has(link) && !frontier.includes(link)) frontier.push(link);
      }
    }
  }

  return { frontier, visited: [...visited], issues };
}
