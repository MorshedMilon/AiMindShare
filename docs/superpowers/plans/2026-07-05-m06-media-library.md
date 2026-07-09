# M06 Media Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **No git in this repo** (`is a git
> repository: false`) — "commit" steps are replaced by "run the probe / verify.sh". Verification is
> **PGlite probes** (real Postgres) + `bash scripts/verify.sh` + Preview MCP, matching every prior session.

**Goal:** Build M06 Media Library (Storage-backed folders, upload, AI auto-tagging as jobs, `used_in`
usage tracking + backfill, brand collections, shared AssetPicker) to full Definition-of-Done on the
vanilla + Supabase stack.

**Architecture:** Canonical DATA-SCHEMA §6 tables (`media_assets`/`media_folders`, `bucket`+`storage_path`,
`used_in` jsonb) + minimal logged extensions, RLS-in-file, over the existing `media`/`brand` Storage
buckets (`0004`). Definer RPCs for the `/complete` write + usage registration + backfill + storage-meter
recompute. `media.autotag` job with a provider-deferred vision scaffold. Vanilla two-pane `/media` app +
reusable `js/asset-picker.js`. PGlite probe + preview verification.

**Tech Stack:** Postgres + RLS + `pg_cron` + `public.jobs` + Supabase Storage (transform URLs) + Deno Edge
Function + vanilla HTML/CSS/JS + `supabase-js` (vendored) + PGlite (verification).

**Reference:** spec `docs/superpowers/specs/2026-07-05-m06-media-library-design.md`.

---

### Task 1: Migration — tables, RLS, RPCs, backfill, cron

**Files:**
- Create: `supabase/migrations/0021_m06_media.sql`

- [ ] **Step 1:** Write `media_folders` (canonical + `bucket`/`kind`/`pinned` + timestamps) and
  `media_assets` (canonical §6 verbatim + `filename`/`title`/`alt_text`/`duration_sec`/`is_favorite`/
  `tag_status`), all indexes (`(workspace_id)`, `(workspace_id, folder_id)`, GIN on `ai_tags`, `filename`).
  `enable row level security` on both **in the same file** (Gate-8 Law 2).
- [ ] **Step 2:** RLS policies — folders/assets SELECT `is_member` (assets: `and deleted_at is null`);
  INSERT/UPDATE `has_role(ws,'staff')` when `bucket='media'` else `has_role(ws,'admin')` (brand); DELETE
  `has_role(ws,'manager')`/`'admin'`. Match the `0004` bucket posture exactly.
- [ ] **Step 3:** RPCs (SECURITY DEFINER): `register_media_asset(...)` (assert role for bucket, insert row,
  image→enqueue `media.autotag` job idempotent `media:autotag:<id>` + `tag_status='pending'`, else
  `'skipped'`; validate `storage_ws(p_path)=workspace`), `register_asset_usage`/`unregister_asset_usage`
  (dedup jsonb append/remove, member-gated), `backfill_asset_usage()` (idempotent scan of `deal_files`,
  existence-guarded), `recompute_storage_meter(ws)` (gauge upsert into `usage_meters` for `storage_gb`).
  `grant execute` to `authenticated` where the caller invokes it.
- [ ] **Step 4:** `pg_cron` `m06-storage-meter-nightly` (`0 3 * * *`, loops workspaces → recompute),
  guarded with a `do $$ begin ... exception when others then raise notice ...` block for PGlite. Call
  `backfill_asset_usage()` once in the migration tail (existence-guarded).
- [ ] **Step 5 (verify):** `node -e` smoke-load the SQL into PGlite is done by the probe (Task 2); for now
  re-read the file and confirm: 2 tables, both `enable row level security`, no raw hex, no dead-stack
  tokens. Run `bash scripts/gate8.sh` → expect 0 new violations for `0021`.

---

### Task 2: PGlite probe — `m06probe.mjs`

**Files:**
- Create: `workers/verify/m06probe.mjs`
- Modify: `scripts/verify.sh` (add m06 step), `workers/verify/verify-status.json`

- [ ] **Step 1:** Model the probe on `workers/verify/m44probe.mjs`/`m14probe.mjs` (same PGlite bootstrap:
  load `0000…0021` in order, seed two workspaces A/B + memberships at each role). Load M06's `0021` after
  the deps it needs (`0002` jobs, `0003/0009` meters, `0014` deal_files for backfill).
- [ ] **Step 2:** Assertions per spec §8: cross-tenant leak (folders+assets, read+write) · role matrix
  (staff media-write, brand admin-only, manager+ delete, client ceiling) · `register_media_asset` (row +
  image job queued idempotent + non-image skipped + path mismatch rejected) · `used_in`
  register/dedup/unregister · `backfill_asset_usage` from a seeded `deal_files` row (idempotent) ·
  `recompute_storage_meter` gauge (re-run overwrites) · soft-delete hides from browse.
- [ ] **Step 3 (verify):** Run `node workers/verify/m06probe.mjs` → expect `m06 N/N`. Iterate until green.
- [ ] **Step 4 (verify):** Add the m06 step to `scripts/verify.sh` and run **`bash scripts/verify.sh`** →
  expect the full suite green (leak 8/8 · job 5/5 · m00…m44 · **m06 N/N**) with **no regressions**. Update
  `verify-status.json`.

---

### Task 3: Edge Function + worker + config

**Files:**
- Create: `supabase/functions/media-autotag/index.ts`
- Modify: `workers/worker.mjs` (add `media.autotag` handler + gdpr folds), `supabase/config.toml`

- [ ] **Step 1:** `media-autotag/index.ts` — service-role; `{asset_id}` → load asset → deterministic tags
  from filename/kind/mime + labelled `alt_text` draft → update `ai_tags`/`alt_text`/`tag_status='done'`.
  Marked `// TODO(provider): GPT-4o vision` + a wired-but-unreached `meter_increment(ai_tokens)` call site.
  Reuse `_shared/envelope.ts`. `config.toml`: `[functions.media-autotag] verify_jwt=false`.
- [ ] **Step 2:** `worker.mjs` — add `media.autotag` router case → invoke the Edge Fn (or the injectable
  scaffold in probe mode); idempotent; success→`tag_status='done'`, terminal fail→`'failed'`. Fold
  `media_assets` into the existing `gdpr.export`/`gdpr.erase` deferred lists.
- [ ] **Step 3 (verify):** `node -c workers/worker.mjs` (syntax) and re-run `node workers/verify/m06probe.mjs`
  — the probe exercises the autotag scaffold logic directly (injected db), expect still green.

---

### Task 4: Frontend — `/media` app + AssetPicker

**Files:**
- Create: `frontend/m06-media-library.html`, `frontend/styles/m06-media.css`, `frontend/js/m06-media.js`,
  `frontend/js/asset-picker.js`
- Modify: `.claude/launch.json` (add `m06-preview`)

- [ ] **Step 1:** HTML shell reusing `tokens.css` + `components.css` + `m06-media.css`; app rail/topbar per
  `components.css`; hash-routed containers for `/media` and `/media/collections`; mockup preview-state
  switcher; `<script>` includes (vendored supabase-js, config, `asset-picker.js`, `m06-media.js`).
- [ ] **Step 2:** `js/asset-picker.js` — `window.AssetPicker.open({mode,bucket,accept,onSelect})` modal:
  browse folders/collections (brand pinned first), search, inline upload (Storage upload → RPC), single/
  multi select → `onSelect(assets)`. Self-contained; no page deps beyond the supabase client + tokens.
- [ ] **Step 3:** `js/m06-media.js` — two-pane: folder tree (nest/rename/new/collections), asset grid
  (grid/list, cards with `tag_status` chip), dropzone multi-upload with progress, search/filters/sort,
  bulk toolbar (move/favorite/delete), detail drawer (preview + variants transform URLs + editable
  alt/title/tags + favorite + Where-used + delete-warns-if-used), Realtime/poll grid refresh, a "Pick an
  asset" **AssetPicker test-consumer** button. All Gate-5 states. Live reads via anon client + RLS;
  mockup sample data labelled.
- [ ] **Step 4:** `m06-media.css` — tokens-only, glass by zone, `.5px` hairlines, mono numerals, no
  shimmer, dark = no stars (radial-wash), responsive 360/768/1280 (tree→drawer on mobile, grid owns
  overflow).
- [ ] **Step 5 (verify):** Add `m06-preview` to `.claude/launch.json`; `preview_start`; load the page;
  `preview_console_logs` (expect zero errors); `preview_snapshot` (routes render, grid + tree + drawer);
  `preview_resize` 360/768/1280 (no page h-scroll) + dark (bg `#04090A`, no stars); exercise AssetPicker
  open→select. `preview_screenshot` for the record.

---

### Task 5: Docs, seed, leak_probe, close

**Files:**
- Modify: `DATA-SCHEMA-v1_0.md` (§6 M06 note), `DECISIONS-AiMindShare-v1_0.md` (D-113…D-119),
  `JOBS-AND-WORKERS-SPEC-v1_0.md` (§5 cron + §6 `media.autotag`), `supabase/seed.sql`,
  `supabase/leak_probe.sql`, `TASKS.md`

- [ ] **Step 1:** `seed.sql` — Acme `media`/`brand` folder tree, 3 pinned brand collections (Logos/Brand
  Photos/Templates), ~8 sample assets (mix of kinds, some with `ai_tags`), one `used_in` `pipeline` entry.
- [ ] **Step 2:** `leak_probe.sql` — B cannot read/insert A's `media_folders`/`media_assets` (append to the
  existing repo-wide leak probe).
- [ ] **Step 3:** DATA-SCHEMA §6 implementation note (canonical + extensions + reconciliation) · DECISIONS
  D-113…D-119 (from spec §10) · JOBS-AND-WORKERS §5/§6 entries.
- [ ] **Step 4 (verify):** Final **`bash scripts/verify.sh`** green (all probes + m06) + **`bash
  scripts/gate8.sh`** clean. Record results.
- [ ] **Step 5:** TASKS.md Session 20 block — Done list, Gate 1–9 close note, carry-overs (spec §9),
  DECISIONS added, human-reconcile flag (`0021` / D-113 parallel collisions + open `0012` M05 renumber).

---

## Self-Review

**Spec coverage:** §1 scope→Tasks 1–4; §3 schema→Task 1; §4 RPCs→Task 1; §5 Edge Fn→Task 3; §6 worker/cron
→Tasks 1+3; §7 frontend→Task 4; §8 probe→Task 2; §9 deferred→documented in Task 5 close; §10 DECISIONS→Task
5; §11 docs→Task 5. All covered.

**Placeholder scan:** none — each task names exact files + concrete content; the vision provider is an
intentional labelled scaffold, not a plan gap.

**Type consistency:** `register_media_asset`/`register_asset_usage`/`unregister_asset_usage`/
`backfill_asset_usage`/`recompute_storage_meter`, `tag_status` values (`pending`/`done`/`skipped`/`failed`),
`used_in` `{module, ref_id}`, `media.autotag` job type, `m06-storage-meter-nightly` cron — used identically
across tasks and the spec.

**Execution:** Inline in this session (single cohesive module with tightly-coupled RLS↔probe↔frontend
contracts; matches every prior session's build order: migration → probe green → Edge/worker → frontend →
preview → docs).
