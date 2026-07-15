// internal-linking.mjs — Sitemap-Aware Internal Linking: crawls a sitemap,
// embeds each page (via providers/embeddings.js), stores a local JSON index,
// and suggests semantically relevant internal links for a piece of content.
// See docs/superpowers/specs/2026-07-13-sitemap-aware-internal-linking-design.md.
// NOT wired into workers/worker.mjs's auto_link stage — that remains a stub
// (deferred, see the design doc's Scope section).

import * as cheerio from "cheerio";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { embed } from "../providers/embeddings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_INDEX_PATH = path.join(__dirname, "sitemap-index.json");

function locsFrom(xml) {
  const out = [];
  const re = /<loc>\s*([^<\s][^<]*?)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1].trim());
  return out;
}

function firstNWords(text, n) {
  return text.trim().split(/\s+/).filter(Boolean).slice(0, n).join(" ");
}

async function scrapePage(url, fetchFn) {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, footer, header").remove();
  const title = $("title").first().text().trim();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  return { url, title, snippet: firstNWords(bodyText, 200) };
}

export async function crawlSitemap(sitemapUrl, { fetchFn = fetch } = {}) {
  const sitemapRes = await fetchFn(sitemapUrl);
  const xml = await sitemapRes.text();

  let pageUrls;
  if (/<sitemapindex[\s>]/i.test(xml)) {
    pageUrls = [];
    for (const childUrl of locsFrom(xml)) {
      const childRes = await fetchFn(childUrl);
      const childXml = await childRes.text();
      pageUrls.push(...locsFrom(childXml));
    }
  } else {
    pageUrls = locsFrom(xml);
  }

  const pages = [];
  const skippedUrls = [];
  for (const url of pageUrls) {
    try {
      pages.push(await scrapePage(url, fetchFn));
    } catch {
      skippedUrls.push(url);
    }
  }
  return { pages, skippedUrls };
}
