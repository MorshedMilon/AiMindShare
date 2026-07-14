// providersprobe.mjs — pure unit tests for workers/config/providers.js. No
// network: PROVIDER_CONFIG's "free" providers are just metadata (env var
// names), never called here.
import { PROVIDER_CONFIG, resolveProvider, logProviderUsage, RateLimiter } from "../config/providers.js";
import { rmSync, existsSync as existsSyncForTest, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

console.log("══ workers/config/providers.js — PROVIDER_CONFIG + resolveProvider ══");

const CAPABILITIES = ["seoAudit", "plagiarism", "embeddings", "webSearch", "imageGen"];
const CAPABILITIES_WITH_REGISTERED_PAID = ["seoAudit", "imageGen"]; // BYOK providers registered but not implemented — see providers/seoAudit.js, providers/imageGen.js
for (const capability of CAPABILITIES) {
  assert(Object.prototype.hasOwnProperty.call(PROVIDER_CONFIG, capability),
    `PROVIDER_CONFIG has a "${capability}" entry`);
  assert(Array.isArray(PROVIDER_CONFIG[capability].paid) &&
    (CAPABILITIES_WITH_REGISTERED_PAID.includes(capability) ? PROVIDER_CONFIG[capability].paid.length > 0 : PROVIDER_CONFIG[capability].paid.length === 0),
    `PROVIDER_CONFIG.${capability}.paid ${CAPABILITIES_WITH_REGISTERED_PAID.includes(capability) ? "has registered BYOK entries" : "starts empty"}`);
  assert(typeof PROVIDER_CONFIG[capability].free.name === "string",
    `PROVIDER_CONFIG.${capability}.free has a name`);
}

{
  const result = resolveProvider("seoAudit", {});
  assert(result.tier === "free" && result.provider.name === "ranknibbler",
    "resolveProvider('seoAudit', {}) resolves to the ranknibbler free default");
}
{
  const result = resolveProvider("plagiarism", {});
  assert(result.tier === "free" && result.provider.name === "none",
    "resolveProvider('plagiarism', {}) resolves to the honest 'none' stub");
}
{
  const result = resolveProvider("embeddings", {});
  assert(result.tier === "free" && result.provider.name === "huggingface",
    "resolveProvider('embeddings', {}) resolves to the huggingface free default");
}
{
  const result = resolveProvider("webSearch", {});
  assert(result.tier === "free" && result.provider.name === "brave",
    "resolveProvider('webSearch', {}) resolves to the brave free default");
}
{
  const result = resolveProvider("imageGen", {});
  assert(result.tier === "free" && result.provider.name === "pexels",
    "resolveProvider('imageGen', {}) resolves to the pexels free default");
}
{
  const paidNames = PROVIDER_CONFIG.imageGen.paid.map((p) => p.name);
  assert(paidNames.includes("dalle") && paidNames.includes("midjourney") && paidNames.includes("stability"),
    "PROVIDER_CONFIG.imageGen.paid registers dalle, midjourney, stability (not implemented, registration only)");
}
{
  let threw = false;
  try { resolveProvider("notARealCapability", {}); } catch { threw = true; }
  assert(threw, "resolveProvider throws on an unknown capability");
}
{
  let threw = false;
  try { resolveProvider("plagiarism", { apiKey: "sk-test" }); } catch { threw = true; }
  assert(threw, "resolveProvider throws when apiKey is given but no paid provider is configured yet (plagiarism)");
}
{
  // seoAudit has 3 real (registered-but-not-yet-implemented) paid providers —
  // exercises the ambiguous-selection branch for real, no simulation needed.
  let ambiguousMessage = "";
  try { resolveProvider("seoAudit", { apiKey: "sk-test" }); } catch (e) { ambiguousMessage = e.message; }
  assert(/ambiguous/i.test(ambiguousMessage),
    "resolveProvider throws an 'ambiguous' error when 2+ paid providers exist and none is named (seoAudit: ahrefs/semrush/seranking)");

  const result = resolveProvider("seoAudit", { apiKey: "sk-test", provider: "semrush" });
  assert(result.tier === "paid" && result.provider.name === "semrush",
    "resolveProvider picks the named paid provider when 2+ exist");
}

console.log("\n══ workers/config/providers.js — logProviderUsage ══");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_LOG_PATH = path.join(__dirname, "providers-usage-test.json");

if (existsSyncForTest(TEST_LOG_PATH)) rmSync(TEST_LOG_PATH);

await logProviderUsage("seoAudit", "pagespeed", { tier: "free" }, TEST_LOG_PATH);
{
  const entries = JSON.parse(readFileSync(TEST_LOG_PATH, "utf8"));
  assert(entries.length === 1, "logProviderUsage creates the log file with one entry");
  assert(entries[0].capability === "seoAudit" && entries[0].provider === "pagespeed" && entries[0].tier === "free",
    "logProviderUsage's entry has capability/provider/tier");
  assert(typeof entries[0].timestamp === "string" && !Number.isNaN(Date.parse(entries[0].timestamp)),
    "logProviderUsage's entry has a parseable timestamp");
}

await logProviderUsage("imageGen", "pollinations", {}, TEST_LOG_PATH);
{
  const entries = JSON.parse(readFileSync(TEST_LOG_PATH, "utf8"));
  assert(entries.length === 2, "logProviderUsage appends to an existing log rather than overwriting it");
}

rmSync(TEST_LOG_PATH);

console.log("\n══ workers/config/providers.js — RateLimiter ══");

{
  let currentTime = 1_700_000_000_000;
  const limiter = new RateLimiter({ now: () => currentTime });

  assert(!limiter.isLimited("pagespeed", { hourly: 2 }), "isLimited is false before any calls");

  limiter.recordCall("pagespeed");
  assert(!limiter.isLimited("pagespeed", { hourly: 2 }), "isLimited is false after 1 of 2 allowed calls");

  limiter.recordCall("pagespeed");
  assert(limiter.isLimited("pagespeed", { hourly: 2 }), "isLimited is true after hitting the hourly cap");

  assert(!limiter.isLimited("brave", { hourly: 2 }), "counters are per-provider — a different provider is unaffected");

  currentTime += 60 * 60 * 1000; // advance exactly one hour
  assert(!limiter.isLimited("pagespeed", { hourly: 2 }), "isLimited resets to false once the hourly window elapses");

  limiter.recordCall("pagespeed");
  limiter.recordCall("pagespeed");
  assert(limiter.isLimited("pagespeed", { daily: 2 }), "the daily counter accumulates across hourly resets");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
