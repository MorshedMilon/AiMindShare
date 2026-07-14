# Provider Abstraction Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone capability-router (`workers/config/providers.js`) that resolves `seoAudit`/`plagiarism`/`embeddings`/`webSearch`/`imageGen` to a free-tier default today, accepts a BYOK paid override later, logs usage locally, and tracks per-provider rate limits — with no real adapter code and no relation to the existing M41 Credential Vault registry.

**Architecture:** One config/logic module (`workers/config/providers.js`) exporting `PROVIDER_CONFIG`, `resolveProvider`, `logProviderUsage`, and `RateLimiter`. An empty `workers/providers/` folder is the drop point for future real adapters. A pure-unit probe (`workers/verify/providersprobe.mjs`, no network, no PGlite — matches `workers/verify/llmprobe.mjs`'s style) verifies all four exports, registered in `scripts/verify.sh`.

**Tech Stack:** Node 18+ ESM (matches `workers/package.json`, `type: "module"`), `node:fs/promises` for the local JSON log, no new npm dependencies.

**Full spec:** `docs/superpowers/specs/2026-07-13-provider-abstraction-layer-design.md`

---

## File Structure

- Create: `workers/config/providers.js` — `PROVIDER_CONFIG`, `resolveProvider`, `logProviderUsage`, `RateLimiter`
- Create: `workers/providers/.gitkeep` — empty folder, future adapter files go here
- Create: `workers/README-providers.md` — capability table + BYOK how-to
- Create: `workers/verify/providersprobe.mjs` — pure unit test, no network
- Modify: `scripts/verify.sh` — register the new probe
- Modify: `.gitignore` (repo root) — ignore `workers/config/provider-usage.json`

---

### Task 1: `PROVIDER_CONFIG` + `resolveProvider`

**Files:**
- Create: `workers/config/providers.js`
- Create: `workers/verify/providersprobe.mjs`

- [ ] **Step 1: Write the failing test**

Create `workers/verify/providersprobe.mjs`:

```js
// providersprobe.mjs — pure unit tests for workers/config/providers.js. No
// network: PROVIDER_CONFIG's "free" providers are just metadata (env var
// names), never called here.
import { PROVIDER_CONFIG, resolveProvider } from "../config/providers.js";

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

console.log("══ workers/config/providers.js — PROVIDER_CONFIG + resolveProvider ══");

const CAPABILITIES = ["seoAudit", "plagiarism", "embeddings", "webSearch", "imageGen"];
for (const capability of CAPABILITIES) {
  assert(Object.prototype.hasOwnProperty.call(PROVIDER_CONFIG, capability),
    `PROVIDER_CONFIG has a "${capability}" entry`);
  assert(Array.isArray(PROVIDER_CONFIG[capability].paid) && PROVIDER_CONFIG[capability].paid.length === 0,
    `PROVIDER_CONFIG.${capability}.paid starts empty`);
  assert(typeof PROVIDER_CONFIG[capability].free.name === "string",
    `PROVIDER_CONFIG.${capability}.free has a name`);
}

{
  const result = resolveProvider("seoAudit", {});
  assert(result.tier === "free" && result.provider.name === "pagespeed",
    "resolveProvider('seoAudit', {}) resolves to the pagespeed free default");
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
  assert(result.tier === "free" && result.provider.name === "pollinations",
    "resolveProvider('imageGen', {}) resolves to the pollinations free default");
}
{
  let threw = false;
  try { resolveProvider("notARealCapability", {}); } catch { threw = true; }
  assert(threw, "resolveProvider throws on an unknown capability");
}
{
  let threw = false;
  try { resolveProvider("seoAudit", { apiKey: "sk-test" }); } catch { threw = true; }
  assert(threw, "resolveProvider throws when apiKey is given but no paid provider is configured yet");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers && node verify/providersprobe.mjs`
Expected: FAIL — `Cannot find module '../config/providers.js'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `workers/config/providers.js`:

```js
// providers.js — capability router: free-tier defaults now, BYOK for paid
// providers later. Standalone from supabase/functions/_shared/providers.ts
// (the M41 Credential Vault registry) — no shared code, no shared keys, no
// Vault/DB involvement. See ../README-providers.md.

export const PROVIDER_CONFIG = {
  seoAudit: {
    free: {
      name: "pagespeed",
      envVar: "PAGESPEED_API_KEY",
      description: "Google PageSpeed Insights API — free tier (~25,000 requests/day).",
    },
    paid: [],
  },
  plagiarism: {
    free: {
      name: "none",
      envVar: null,
      description: "No reliable free plagiarism-detection API exists; reports unavailable until a paid provider is configured.",
    },
    paid: [],
  },
  embeddings: {
    free: {
      name: "huggingface",
      envVar: "HUGGINGFACE_API_KEY",
      description: "HuggingFace Inference API — free tier, rate-limited.",
    },
    paid: [],
  },
  webSearch: {
    free: {
      name: "brave",
      envVar: "BRAVE_SEARCH_API_KEY",
      description: "Brave Search API — free tier (2,000 queries/month).",
    },
    paid: [],
  },
  imageGen: {
    free: {
      name: "pollinations",
      envVar: null,
      description: "Pollinations.ai — free, keyless image generation.",
    },
    paid: [],
  },
};

export function resolveProvider(capability, userConfig = {}) {
  const config = PROVIDER_CONFIG[capability];
  if (!config) {
    throw new Error(`resolveProvider: unknown capability "${capability}"`);
  }

  if (!userConfig.apiKey) {
    return { capability, tier: "free", provider: config.free };
  }

  const paidProvider = userConfig.provider
    ? config.paid.find((p) => p.name === userConfig.provider)
    : config.paid.length === 1
      ? config.paid[0]
      : undefined;

  if (!paidProvider) {
    throw new Error(`resolveProvider: no paid provider configured for "${capability}" yet`);
  }

  return { capability, tier: "paid", provider: paidProvider };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers && node verify/providersprobe.mjs`
Expected: `22 passed, 0 failed` (5 capabilities × 3 `PROVIDER_CONFIG` assertions = 15, plus 5 `resolveProvider` free-path assertions + 2 throw assertions = 22 total). The printed count must show `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add workers/config/providers.js workers/verify/providersprobe.mjs
git commit -m "feat(providers): add PROVIDER_CONFIG + resolveProvider capability router"
```

---

### Task 2: `logProviderUsage`

**Files:**
- Modify: `workers/config/providers.js`
- Modify: `workers/verify/providersprobe.mjs`

- [ ] **Step 1: Write the failing test**

Add to the end of `workers/verify/providersprobe.mjs` (before the final `console.log(pass/fail)` + `process.exit` lines — move those two lines to the very end of the file after this new section):

```js
console.log("\n══ workers/config/providers.js — logProviderUsage ══");

import { rmSync, existsSync as existsSyncForTest, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logProviderUsage } from "../config/providers.js";

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
```

Note: ES module `import` statements must be hoisted to the top of the file in real JS (you cannot `import` mid-file). When writing this into `providersprobe.mjs`, move the three new `import` lines (`node:fs`, `node:path`, `node:url`, and the `logProviderUsage` import — merge it into the existing `../config/providers.js` import on line 4) up to the top of the file alongside the existing imports, and leave only the executable statements (the `TEST_LOG_PATH` const, the `if (existsSync...)`, the `await logProviderUsage(...)` calls, and their assertions) in place at the end of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers && node verify/providersprobe.mjs`
Expected: FAIL — `logProviderUsage is not a function` (not exported yet).

- [ ] **Step 3: Write the implementation**

Add to `workers/config/providers.js`, after `resolveProvider` and before the end of the file. First add these imports at the top of the file (right after the header comment, before `export const PROVIDER_CONFIG`):

```js
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_USAGE_LOG_PATH = path.join(__dirname, "provider-usage.json");
```

Then append this function:

```js
export async function logProviderUsage(capability, providerName, meta = {}, logPath = DEFAULT_USAGE_LOG_PATH) {
  let entries = [];
  if (existsSync(logPath)) {
    try {
      entries = JSON.parse(await readFile(logPath, "utf8"));
    } catch {
      entries = [];
    }
  }
  entries.push({
    timestamp: new Date().toISOString(),
    capability,
    provider: providerName,
    ...meta,
  });
  await mkdir(path.dirname(logPath), { recursive: true });
  await writeFile(logPath, JSON.stringify(entries, null, 2));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers && node verify/providersprobe.mjs`
Expected: all assertions pass, ending in `N passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add workers/config/providers.js workers/verify/providersprobe.mjs
git commit -m "feat(providers): add logProviderUsage local JSON log"
```

---

### Task 3: `RateLimiter`

**Files:**
- Modify: `workers/config/providers.js`
- Modify: `workers/verify/providersprobe.mjs`

- [ ] **Step 1: Write the failing test**

Add to the top imports of `workers/verify/providersprobe.mjs` (merge into the existing `../config/providers.js` import): add `RateLimiter` to the named imports.

Add to the end of `workers/verify/providersprobe.mjs`, before the final `console.log(pass/fail)` + `process.exit`:

```js
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
```

(Remove the old, now-duplicate `console.log(pass/fail)` + `process.exit` lines that were previously at the end of the file from Task 2 — there must be exactly one such pair, at the very end of the file, after this new section.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workers && node verify/providersprobe.mjs`
Expected: FAIL — `RateLimiter is not a constructor` (not exported yet).

- [ ] **Step 3: Write the implementation**

Append to `workers/config/providers.js`:

```js
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export class RateLimiter {
  constructor({ now = () => Date.now() } = {}) {
    this.counters = new Map();
    this._now = now;
  }

  _windows(providerName) {
    if (!this.counters.has(providerName)) {
      const now = this._now();
      this.counters.set(providerName, {
        hourly: { count: 0, windowStart: now },
        daily: { count: 0, windowStart: now },
      });
    }
    return this.counters.get(providerName);
  }

  recordCall(providerName) {
    const windows = this._windows(providerName);
    const now = this._now();
    if (now - windows.hourly.windowStart >= HOUR_MS) windows.hourly = { count: 0, windowStart: now };
    if (now - windows.daily.windowStart >= DAY_MS) windows.daily = { count: 0, windowStart: now };
    windows.hourly.count += 1;
    windows.daily.count += 1;
  }

  isLimited(providerName, { hourly, daily } = {}) {
    const windows = this._windows(providerName);
    const now = this._now();
    const hourlyCount = now - windows.hourly.windowStart >= HOUR_MS ? 0 : windows.hourly.count;
    const dailyCount = now - windows.daily.windowStart >= DAY_MS ? 0 : windows.daily.count;
    if (hourly != null && hourlyCount >= hourly) return true;
    if (daily != null && dailyCount >= daily) return true;
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workers && node verify/providersprobe.mjs`
Expected: all assertions pass, ending in `N passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add workers/config/providers.js workers/verify/providersprobe.mjs
git commit -m "feat(providers): add in-memory per-provider RateLimiter"
```

---

### Task 4: empty `providers/` adapter folder

**Files:**
- Create: `workers/providers/.gitkeep`

- [ ] **Step 1: Create the placeholder**

Create `workers/providers/.gitkeep` (empty file — git doesn't track empty directories, this is the standard workaround):

```

```

- [ ] **Step 2: Verify it's tracked**

Run: `git status --short workers/providers/`
Expected: `?? workers/providers/.gitkeep`

- [ ] **Step 3: Commit**

```bash
git add workers/providers/.gitkeep
git commit -m "chore(providers): add empty providers/ folder for future adapters"
```

---

### Task 5: `README-providers.md`

**Files:**
- Create: `workers/README-providers.md`

- [ ] **Step 1: Write the doc**

Create `workers/README-providers.md`:

```markdown
# Provider abstraction layer

`config/providers.js` routes each *capability* (an external-API-shaped need,
not a specific vendor) to a free-tier default today, with a path to Bring
Your Own Key (BYOK) for a paid provider later. Module code calls
`resolveProvider(capability, userConfig)` instead of hardcoding a vendor.

**This is unrelated to `supabase/functions/_shared/providers.ts`** (the M41
Credential Vault registry of third-party integration connections — Stripe,
OpenAI, SerpApi, etc., with Vault-backed secrets and a frontend mirror). That
registry is about connecting a workspace's own accounts to those vendors for
existing modules. This layer is about picking which vendor answers a given
capability, with no Vault/DB/workspace-scoping involved — `userConfig` is
just a plain object the caller passes in.

## Capabilities and free defaults

| Capability | Free default | Env var | Notes |
|---|---|---|---|
| `seoAudit` | Google PageSpeed Insights API | `PAGESPEED_API_KEY` | free tier, ~25,000 requests/day |
| `plagiarism` | none | — | no reliable free plagiarism API exists; resolves to an honest "unavailable" stub until a paid provider is added |
| `embeddings` | HuggingFace Inference API | `HUGGINGFACE_API_KEY` | free tier, rate-limited |
| `webSearch` | Brave Search API | `BRAVE_SEARCH_API_KEY` | free tier, 2,000 queries/month |
| `imageGen` | Pollinations.ai | — | free, keyless, no signup |

## Usage

```js
import { resolveProvider, logProviderUsage, RateLimiter } from "./config/providers.js";

const { tier, provider } = resolveProvider("seoAudit", userConfig);
// provider.envVar tells you which env var holds the key (if any)

const limiter = new RateLimiter();
if (limiter.isLimited(provider.name, { hourly: 100 })) {
  // back off / switch providers before hitting a real 429
}
limiter.recordCall(provider.name);

// ... make the actual API call in providers/<provider.name>.js ...

await logProviderUsage("seoAudit", provider.name, { tier });
```

## Adding a paid BYOK provider later

1. In `config/providers.js`, add an entry to the relevant capability's `paid`
   array: `{ name: "<vendor>", envVar: "<VENDOR>_API_KEY", description: "..." }`.
2. Create `providers/<vendor>.js` implementing the actual API call for that
   vendor. There's no fixed interface yet — the first paid adapter for a
   capability sets the pattern the next one follows.
3. Callers already work unchanged: once a workspace passes
   `{ apiKey, provider: "<vendor>" }` into `resolveProvider`, it routes there
   instead of the free default.

## Usage log

Every `logProviderUsage` call appends a `{ timestamp, capability, provider,
...meta }` entry to `config/provider-usage.json` (gitignored, created on
first write). Intended for future usage analytics/billing — nothing reads
it yet.
```

- [ ] **Step 2: Commit**

```bash
git add workers/README-providers.md
git commit -m "docs(providers): add README-providers.md"
```

---

### Task 6: register the probe + gitignore the usage log

**Files:**
- Modify: `scripts/verify.sh`
- Modify: `.gitignore` (repo root)

- [ ] **Step 1: Register the probe in `scripts/verify.sh`**

Add after the `llmprobe.mjs` block (currently around line 106-107, right after `( cd workers && node verify/llmprobe.mjs ) || fails=$((fails+1))`):

```bash
echo; echo "══ +  Provider abstraction layer: PROVIDER_CONFIG + resolveProvider + logProviderUsage + RateLimiter (unit, no network) ══"
( cd workers && node verify/providersprobe.mjs ) || fails=$((fails+1))
```

- [ ] **Step 2: Add the usage log to `.gitignore`**

Add this line to the repo-root `.gitignore` (append to the end of the file):

```
workers/config/provider-usage.json
```

- [ ] **Step 3: Run the new probe standalone once more**

Run: `cd workers && node verify/providersprobe.mjs`
Expected: `N passed, 0 failed`.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify.sh .gitignore
git commit -m "test(providers): register providersprobe.mjs in verify.sh"
```

---

### Task 7: full verify.sh sanity pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full verify suite**

Run: `bash scripts/verify.sh`
Expected: the new "Provider abstraction layer" section prints `N passed, 0 failed`; overall script output ends with `✔ verify.sh: all runnable probes passed` (pre-existing unrelated failures, if any were already present before this change, are not this task's concern — only confirm the new section is clean and no previously-passing probe regressed).

- [ ] **Step 2: Confirm no stray files**

Run: `git status --short`
Expected: clean (everything from this plan already committed); no untracked `workers/config/provider-usage.json` (it's gitignored and nothing calls `logProviderUsage` for real yet, so it shouldn't even exist on disk outside the probe's use of a throwaway `TEST_LOG_PATH`).

---

## Self-Review Notes

- **Spec coverage:** `PROVIDER_CONFIG` shape (Task 1), `resolveProvider` (Task 1), `logProviderUsage` (Task 2), `RateLimiter` (Task 3), empty `providers/` folder (Task 4), `README-providers.md` (Task 5), probe registered in `verify.sh` (Task 6) — every spec section has a task.
- **Type consistency:** `resolveProvider` returns `{ capability, tier, provider }` everywhere it's referenced (spec, Task 1, README). `logProviderUsage(capability, providerName, meta, logPath)` signature is consistent between Task 2's implementation and its test. `RateLimiter`'s `recordCall`/`isLimited` names match between Task 3's implementation, its test, and the README usage example.
- **No Vault/DB coupling anywhere** — confirmed `resolveProvider` and `logProviderUsage` take only plain JS values, no `db`/`workspaceId` params, matching the spec's explicit scope boundary against M41.
