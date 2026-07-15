// internallinkingprobe.mjs — pure unit tests for providers/embeddings.js and
// seo/internal-linking.mjs. No network, no real model download: embeddings
// are always supplied via an injected pipelineFactory/embedFn.
import { rmSync, existsSync as existsSyncForTest, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { embed } from "../providers/embeddings.js";
import { crawlSitemap, buildIndex, findLinkCandidates } from "../seo/internal-linking.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

console.log("══ workers/providers/embeddings.js — embed() ══");

const fakeVector = [0.1, 0.2, 0.3];
const fakePipelineFactory = async () => async (text, opts) => ({ data: Float32Array.from(fakeVector) });

const EMBED_TEST_LOG_PATH = path.join(__dirname, "embeddings-usage-test.json");
if (existsSyncForTest(EMBED_TEST_LOG_PATH)) rmSync(EMBED_TEST_LOG_PATH);

{
  const vector = await embed("hello world", {}, { pipelineFactory: fakePipelineFactory, logPath: EMBED_TEST_LOG_PATH });
  assert(Array.isArray(vector) && vector.length === 3, "embed() free tier returns a plain array from the injected pipeline");
  assert(Math.abs(vector[0] - 0.1) < 1e-4, "embed() free tier returns the pipeline's actual values");
}
{
  const entries = JSON.parse(readFileSync(EMBED_TEST_LOG_PATH, "utf8"));
  assert(entries.length === 1 && entries[0].provider === "xenova-transformers" && entries[0].tier === "free",
    "embed() logs usage against the xenova-transformers free provider");
}
{
  let threw = false, message = "";
  try {
    await embed("hello", { apiKey: "sk-test", provider: "openai" }, { logPath: EMBED_TEST_LOG_PATH });
  } catch (e) { threw = true; message = e.message; }
  assert(threw && /openai embeddings not implemented yet/.test(message),
    "embed() throws for the registered-but-unimplemented openai paid provider");
}
{
  let threw = false, message = "";
  try {
    await embed("hello", { apiKey: "sk-test", provider: "cohere" }, { logPath: EMBED_TEST_LOG_PATH });
  } catch (e) { threw = true; message = e.message; }
  assert(threw && /cohere embeddings not implemented yet/.test(message),
    "embed() throws for the registered-but-unimplemented cohere paid provider");
}
{
  const entries = JSON.parse(readFileSync(EMBED_TEST_LOG_PATH, "utf8"));
  assert(entries.length === 3, "embed() logs usage even for the paid not-implemented throws");
}
rmSync(EMBED_TEST_LOG_PATH);

console.log("\n══ workers/seo/internal-linking.mjs — crawlSitemap() ══");

function fakeFetch(responses) {
  return async (url) => {
    const entry = responses[url];
    if (!entry) return { ok: false, status: 404, text: async () => "" };
    return { ok: entry.status < 400, status: entry.status, text: async () => entry.body };
  };
}

const kayakHtml = `<html><head><title>Best Kayak Trip Planning</title></head><body><nav>NAVMARKER</nav><h1>Kayak Trips</h1><p>${"paddle ".repeat(210)}</p><footer>FOOTERMARKER</footer></body></html>`;
const hikeHtml = `<html><head><title>Trail Hiking Guide</title></head><body><p>${"trail ".repeat(50)}</p></body></html>`;

const flatSitemapXml = `<?xml version="1.0"?><urlset><url><loc>https://example.com/kayaking</loc></url><url><loc>https://example.com/hiking</loc></url><url><loc>https://example.com/dead</loc></url></urlset>`;

const flatResponses = {
  "https://example.com/sitemap.xml": { status: 200, body: flatSitemapXml },
  "https://example.com/kayaking": { status: 200, body: kayakHtml },
  "https://example.com/hiking": { status: 200, body: hikeHtml },
  "https://example.com/dead": { status: 404, body: "" },
};

{
  const { pages, skippedUrls } = await crawlSitemap("https://example.com/sitemap.xml", { fetchFn: fakeFetch(flatResponses) });
  assert(pages.length === 2, `crawlSitemap indexes the 2 live pages (got ${pages.length})`);
  assert(skippedUrls.length === 1 && skippedUrls[0] === "https://example.com/dead",
    "crawlSitemap skips the dead page instead of throwing");
  const kayak = pages.find((p) => p.url === "https://example.com/kayaking");
  assert(kayak.title === "Best Kayak Trip Planning", "crawlSitemap extracts the page <title>");
  assert(kayak.snippet.split(" ").length === 200, `crawlSitemap's snippet is capped at 200 words (got ${kayak.snippet.split(" ").length})`);
  assert(!kayak.snippet.includes("NAVMARKER") && !kayak.snippet.includes("FOOTERMARKER"),
    "crawlSitemap's snippet excludes nav/footer text");
}

const indexXml = `<?xml version="1.0"?><sitemapindex><sitemap><loc>https://example.com/sitemap-a.xml</loc></sitemap><sitemap><loc>https://example.com/sitemap-b.xml</loc></sitemap></sitemapindex>`;
const sitemapAXml = `<urlset><url><loc>https://example.com/kayaking</loc></url></urlset>`;
const sitemapBXml = `<urlset><url><loc>https://example.com/hiking</loc></url></urlset>`;
const indexResponses = {
  "https://example.com/sitemap-index.xml": { status: 200, body: indexXml },
  "https://example.com/sitemap-a.xml": { status: 200, body: sitemapAXml },
  "https://example.com/sitemap-b.xml": { status: 200, body: sitemapBXml },
  "https://example.com/kayaking": { status: 200, body: kayakHtml },
  "https://example.com/hiking": { status: 200, body: hikeHtml },
};
{
  const { pages } = await crawlSitemap("https://example.com/sitemap-index.xml", { fetchFn: fakeFetch(indexResponses) });
  assert(pages.length === 2, "crawlSitemap follows one level of <sitemapindex> nesting and merges child pages");
}

console.log("\n══ workers/seo/internal-linking.mjs — buildIndex() + findLinkCandidates() ══");

const INDEX_TEST_PATH = path.join(__dirname, "sitemap-index-test.json");
if (existsSyncForTest(INDEX_TEST_PATH)) rmSync(INDEX_TEST_PATH);

function fakeEmbed(text) {
  const lower = text.toLowerCase();
  if (lower.includes("kayak")) return [1, 0, 0];
  if (lower.includes("trail") || lower.includes("hik")) return [0.9, 0.1, 0];
  return [0, 1, 0];
}

const buildResult = await buildIndex("https://example.com/sitemap.xml", {}, {
  fetchFn: fakeFetch(flatResponses),
  embedFn: async (text) => fakeEmbed(text),
  indexPath: INDEX_TEST_PATH,
});
assert(buildResult.indexed === 2 && buildResult.skipped === 1,
  `buildIndex reports 2 indexed, 1 skipped (got ${JSON.stringify(buildResult)})`);

{
  const stored = JSON.parse(readFileSync(INDEX_TEST_PATH, "utf8"));
  assert(Object.keys(stored).length === 2, "buildIndex writes an entry per indexed page");
  assert(Array.isArray(stored["https://example.com/kayaking"].embedding),
    "buildIndex stores the embedding vector alongside url/title/snippet");
}

{
  const candidates = await findLinkCandidates("An article about kayak gear", 5, {}, {
    embedFn: async (text) => fakeEmbed(text),
    indexPath: INDEX_TEST_PATH,
  });
  assert(candidates[0].url === "https://example.com/kayaking",
    "findLinkCandidates ranks the most semantically similar page first");
  assert(candidates.length === 2, "findLinkCandidates returns all indexed pages when topN exceeds the index size");
}
{
  const candidates = await findLinkCandidates("An article about kayak gear", 1, {}, {
    embedFn: async (text) => fakeEmbed(text),
    indexPath: INDEX_TEST_PATH,
  });
  assert(candidates.length === 1, "findLinkCandidates truncates to topN");
}
{
  const candidates = await findLinkCandidates("An article about kayak gear", 5, { currentUrl: "https://example.com/kayaking" }, {
    embedFn: async (text) => fakeEmbed(text),
    indexPath: INDEX_TEST_PATH,
  });
  assert(!candidates.some((c) => c.url === "https://example.com/kayaking"),
    "findLinkCandidates excludes config.currentUrl from results");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
