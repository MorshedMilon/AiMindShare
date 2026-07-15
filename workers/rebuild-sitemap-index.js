#!/usr/bin/env node
// rebuild-sitemap-index.js — CLI to (re)build workers/seo/sitemap-index.json
// from a site's sitemap.xml. Usage:
//   node rebuild-sitemap-index.js <sitemapUrl>
import { buildIndex } from "./seo/internal-linking.mjs";

const sitemapUrl = process.argv[2];
if (!sitemapUrl) {
  console.error("Usage: node rebuild-sitemap-index.js <sitemapUrl>");
  process.exit(1);
}

try {
  const { indexed, skipped } = await buildIndex(sitemapUrl);
  console.log(`Indexed ${indexed} pages, skipped ${skipped}`);
  process.exit(0);
} catch (e) {
  console.error(`rebuild-sitemap-index failed: ${e.message}`);
  process.exit(1);
}
