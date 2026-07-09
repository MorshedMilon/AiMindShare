# M06 — Media Library & Asset Manager · Design Spec

**Session 20 · Phase 2 · 2026-07-05**
Attach set: Constitution · DECISIONS · DATA-SCHEMA (§6 media) · RLS-AND-SECURITY · JOBS-AND-WORKERS ·
EDGE-FUNCTIONS-SPEC · PRD_M06 · BUILD-SEQUENCE (row 20) · DEFINITION-OF-DONE · AIMINDSHARE-DESIGN · TASKS.

---

## 1. Scope (approved)

Build the **BUILD-SEQUENCE row-20 accept-when to full DoD**, the rest of PRD_M06 to DoD where it fits the
locked stack, and defer nothing that the accept-when names:

> **Accept-when:** Storage-backed folders · upload · AI auto-tagging (as jobs) · usage-tracking backfill
> (`used_in`) · brand collections.

**In scope (to DoD):**
1. **Storage-backed folders** — nested `media_folders` tree (rename, move, nest), per bucket.
2. **Upload pipeline** — drag-drop multi-upload direct to Supabase Storage (existing `0004` RLS), a
   `register_media_asset()` definer RPC as the `/complete` step (asset row + autotag job enqueue, atomic).
3. **AI auto-tagging as a job** — `media.autotag` enqueued on image upload; worker handler built to
   contract; **the vision provider is a labelled scaffold** (deterministic filename/mime tags) until a
   provider decision lands — honest deferral, `meter_increment(ai_tokens)` only on a real call (Gate 3).
4. **Usage tracking (`used_in`)** — canonical `used_in` jsonb `[{module, ref_id}]` + register/unregister
   RPCs + **one-time backfill from `deal_files.asset_id`** (the sole existing consumer, M11).
5. **Brand collections** — pinned collections (Logos · Brand Photos · Templates) in the `brand` bucket,
   surfaced first in the picker; the M35 brand-kit link is scaffolded (M35 not built).
6. **Shared `AssetPicker`** — one vanilla modal (`js/asset-picker.js`, single/multi, inline upload, search)
   embedded in a **test consumer** to prove the contract (AC-3).
7. **Where-used + delete-warning** — "Where used" drawer panel from `used_in`; soft-delete warns if in use.
8. **Storage metering** — nightly `pg_cron` recomputes GB per workspace → `usage_meters` (revives the
   dead `storage_gb` meter kind), gauge-set not incremented.
9. **Variant delivery** — thumb 300 / medium 800 / WebP via **Supabase Storage image-transform URLs**
   (native query params), derived client-side; no Sharp/BullMQ worker.

**Superseded by the locked stack (Gate-8):** PRD's Prisma models, R2 presigned PUT, S3 SDK, BullMQ
workers, Sharp variant worker, and GPT-4o SDK call. Reconciled to: canonical DATA-SCHEMA §6 tables +
Supabase Storage + definer RPCs + the `jobs` queue + `pg_cron` + Storage transform URLs.

**Deferred (honest scaffold + DECISIONS, never faked):** live vision auto-tagging (provider undecided);
virus-scan hook (ClamAV) — column-ready, no scanner; M35 brand-kit binding; the Storage image-transform
add-on / imgproxy at deploy ("ready-not-run" like all live infra here).

---

## 2. Central architectural fact

The canonical schema (DATA-SCHEMA §6) **indexes Storage objects** — it does **not** store a public `url`.
An asset is `(bucket, storage_path)`; delivery is a **signed URL** (private buckets) computed at read time,
and variants are the same URL with transform params. So:

> **The DB row is the index; the bytes live in Storage under `<bucket>/<workspace_id>/<...>`; the two RLS
> systems (table + `storage.objects`) both gate on `workspace_id`, and stay consistent because the RPC
> writes the row only after the object path is fixed.**

The PRD's separate `AssetUsage` table collapses into the canonical **`used_in` jsonb** on the asset — the
accept-when literally names `used_in`. Registration is a definer RPC; where-used is a plain read.

---

## 3. Data model — `supabase/migrations/0021_m06_media.sql`

Migration **0021** (highest present is `0020_m15_forms`; M08/M16/M19/M20 sessions run in parallel — a
merge-collision flag is added at close, same posture as every prior parallel session). All tables RLS-on
**in-file** (Gate-8 Law 2). Ships canonical §6 **verbatim** + the minimal logged extensions the PRD UI needs.

### 3.1 `media_folders` (canonical + logged extensions)
| col | type | notes |
|---|---|---|
| `id` | uuid PK | canonical |
| `workspace_id` | uuid not null FK → workspaces on delete cascade | canonical |
| `parent_id` | uuid null FK → media_folders(id) on delete cascade | canonical (nested tree) |
| `name` | text not null | canonical |
| `bucket` | text not null default `'media'` | **ext (D-113):** which bucket the folder lives in (`media`/`brand`) |
| `kind` | text not null default `'folder'` CHECK in (`folder`,`collection`) | **ext:** `collection` = brand collection |
| `pinned` | bool not null default false | **ext:** surfaced first in the picker |
| `created_at` / `updated_at` | timestamptz | `set_updated_at` trigger |

RLS: SELECT = `is_member`. INSERT/UPDATE = `has_role(ws,'staff')` for `bucket='media'`,
`has_role(ws,'admin')` for `bucket='brand'` (mirrors the `0004` bucket posture). DELETE = `manager` /
`admin` respectively.

### 3.2 `media_assets` (canonical + logged extensions)
| col | type | notes |
|---|---|---|
| `id` | uuid PK | canonical |
| `workspace_id` | uuid not null FK → workspaces on delete cascade | canonical |
| `folder_id` | uuid null FK → media_folders(id) on delete set null | canonical |
| `bucket` | text not null default `'media'` | canonical |
| `storage_path` | text not null | canonical — object key `<workspace_id>/<...>` |
| `kind` | text | canonical — `image`/`video`/`audio`/`pdf`/`doc` |
| `mime` | text | canonical |
| `bytes` | bigint | canonical |
| `width` / `height` | int | canonical |
| `ai_tags` | text[] default `'{}'` | canonical — filled by the autotag job |
| `used_in` | jsonb default `'[]'` | canonical — `[{module, ref_id}]` |
| `created_by` | uuid FK → auth.users | canonical |
| `created_at` | timestamptz default now() | canonical |
| `deleted_at` | timestamptz null | canonical — **soft delete** |
| `filename` | text not null default `''` | **ext (D-114):** human name (search/rename) |
| `title` | text | **ext:** optional display title |
| `alt_text` | text | **ext:** SEO alt, reused by M19/M22 |
| `duration_sec` | int | **ext:** audio/video length |
| `is_favorite` | bool not null default false | **ext:** favorites filter |
| `tag_status` | text not null default `'pending'` CHECK in (`pending`,`done`,`skipped`,`failed`) | **ext:** autotag lifecycle for live-updating grid |

Indexes: canonical `(workspace_id)`; add `(workspace_id, folder_id)` (PRD), a GIN on `ai_tags`, and a
`filename` btree for search. `search_tsv` is **not** added — search is name (ilike) + tag (array/GIN),
matching the accept-when; full-text deferred (YAGNI).

RLS: SELECT = `is_member` **and `deleted_at is null`** for the browse policy (a second admin+ policy can
read soft-deleted for restore — deferred; soft-deleted simply disappears this slice). INSERT/UPDATE =
`has_role('staff')` (media) / `has_role('admin')` (brand). Hard DELETE = `manager`/`admin`; the app uses
**soft delete** (UPDATE `deleted_at`) so where-used warnings and restore stay possible.

### 3.3 What is NOT a new table
- **No `asset_usages` table** — folded into `used_in` jsonb (canonical, accept-when-named).
- **No `variants` table / columns** — variants are transform URLs derived at read time.
- **No new bucket** — `media` + `brand` already exist (`0004`); brand collections are folders in `brand`.

---

## 4. RPCs (`SECURITY DEFINER`, member/role-gated)

- **`register_media_asset(p_folder uuid, p_bucket text, p_path text, p_filename text, p_mime text,
  p_bytes bigint, p_kind text, p_width int, p_height int, p_duration int)`** → the `/complete` step.
  Asserts `has_role(ws, staff|admin)` for the bucket, inserts the `media_assets` row (`created_by =
  auth.uid()`, `tag_status='pending'` for images else `'skipped'`), and for images **enqueues a
  `media.autotag` job** (`queued`, idempotency `media:autotag:<asset_id>`) in the same transaction.
  Returns the asset row. (Workspace resolved from the caller's active membership + path segment 1 — the
  RPC validates `storage_ws(p_path) = p_workspace`.)
- **`register_asset_usage(p_asset uuid, p_module text, p_ref_id text)`** — append `{module, ref_id}` to
  `used_in` if not already present (dedup). Member-gated; callable by other modules server-side (and by
  the app when the user attaches an asset). Idempotent.
- **`unregister_asset_usage(p_asset uuid, p_module text, p_ref_id text)`** — remove the entry.
- **`backfill_asset_usage()`** — one-time (idempotent): scan `deal_files` where `asset_id` is not null →
  `register_asset_usage(asset, 'pipeline', deal_id)`. Wrapped in an existence check on `deal_files`
  (parallel-safe). Runs in the migration tail **and** is callable later. Fulfils the accept-when backfill.
- **`recompute_storage_meter(p_workspace uuid)`** — sum `bytes` of live assets → GB (numeric) → **set**
  the current-period `usage_meters` row for `storage_gb` (gauge upsert, not additive). Definer; the cron
  calls it per workspace.
- **`media_move(p_ids uuid[], p_folder uuid)`** / **`media_toggle_favorite`** / rename — thin definer
  helpers or plain RLS UPDATEs; prefer plain RLS UPDATE where the policy already gates it (favorite,
  rename, alt-text are member/staff UPDATEs — no RPC needed). Only cross-cutting writes get an RPC.

`storage_gb` already exists in `meter_kind` (0000) — no enum change; the nightly recompute simply revives it.

---

## 5. Edge Function

- **`functions/media-autotag/index.ts`** (`verify_jwt=false`, service-role; invoked by the worker) — the
  **vision scaffold**: given `{asset_id}`, loads the asset, produces deterministic tags from
  filename/kind/mime + a labelled `alt_text` draft, writes `ai_tags` + `alt_text` + `tag_status='done'`.
  A clearly-marked `// TODO(provider): GPT-4o vision` block + the `meter_increment(ai_tokens)` call site
  are wired for when a provider lands (no billable call fires now → Gate 3 clean). Reuses `_shared/
  envelope.ts`.
- **No `media-presign` Edge Function** — direct-to-Storage upload via storage-js is already RLS-gated
  (`0004` "media staff write"); the browser calls `supabase.storage.from(bucket).upload(path, file)` then
  the `register_media_asset` RPC. (A presign Edge Fn would add a service-role hop for zero security gain —
  same call as M12 D-055 "don't rebuild the wall".) Documented in DECISIONS D-115.

`config.toml`: `[functions.media-autotag]` `verify_jwt = false`.

---

## 6. Worker + Cron (JOBS-AND-WORKERS)

- **Worker** `workers/worker.mjs`: add a **`media.autotag`** handler → invokes the `media-autotag` Edge
  Function (or, in the local probe, calls the scaffold logic directly via the injected `db`). Idempotent
  on `media:autotag:<asset_id>`; on success sets `tag_status='done'`; on failure `fail()` → retry, and
  after max attempts `tag_status='failed'` (grid shows an honest "untagged" state).
- **`gdpr.export` / `gdpr.erase`** (M05): fold in the subject's `media_assets` (export list / detach —
  soft-delete owned assets on erase, retain nothing sensitive). One-line additions to the existing
  deferred-fold list in `worker.mjs`.
- **Cron** JOBS §5: **`m06-storage-meter-nightly`** — `0 3 * * *`: `for each workspace: perform
  recompute_storage_meter(ws)`. Guarded for PGlite (try/notice). New job **type** `media.autotag`; the
  storage meter is a direct cron recompute (no job row needed).

---

## 7. Frontend — `/media` app + AssetPicker

Files: `frontend/m06-media-library.html` · `frontend/styles/m06-media.css` · `frontend/js/m06-media.js` ·
`frontend/js/asset-picker.js` (the reusable export). Reuses `tokens.css` + `components.css` verbatim.
Hash-routed. Mono numerals, `.5px` hairlines, 3 fonts (Cormorant/Baskerville/Shippori), glass by zone,
**no shimmer**, **dark = no stars** (radial-wash atmosphere only).

**Routes**
- `/media` — **two-pane**: folder tree (left; nest, rename, new folder, brand collections pinned on top
  with a gold accent) + asset **grid** (right; responsive masonry-ish card grid, grid/list toggle).
  Top: upload **dropzone** (drag-drop, multi, per-file progress), search (name + tag), filters (type,
  favorites, folder), sort. Multi-select **bulk toolbar** (move, favorite, delete). **Detail drawer**:
  preview (image/video/audio/pdf/doc icon), variants (thumb/medium/original transform links), metadata,
  editable alt-text + title + tags, favorite, **Where-used** panel, download, delete (warns if used).
- `/media/collections` — brand collections manager (create/rename/pin, admin-gated on the `brand` bucket).

**AssetPicker** (`window.AssetPicker.open({ mode:'single'|'multi', bucket, accept, onSelect })`) — a modal
that browses folders/collections, searches, and **uploads inline**, returning selected asset(s). Brand
collections surface first. This is the one component M19/M22/M23/M24/M35 will import. **Test consumer:** a
small "Pick an asset" demo button on the `/media` page (and a note that M11's `deal_files` is the first
real consumer) exercises the open→select→return contract (AC-3).

**Auto-tag live update:** after upload, cards show a "tagging…" chip (`tag_status='pending'`); a Realtime
subscription (or poll fallback in mockup mode) flips them to show tags when the job completes — satisfies
"grid updates live" (AC-2).

**States (Gate 5):** default (sample assets) · empty ("No files yet" designed dropzone) · loading (calm
skeleton cards, no shimmer) · error (envelope code → human copy + retry) · success (upload complete flash).
Mockup preview switcher with a visible "sample data" label. **Responsive** 360/768/1280, no page h-scroll
(tree collapses to a drawer on mobile, grid owns its overflow). **Both themes.** `prefers-reduced-motion`.

---

## 8. Verification — `workers/verify/m06probe.mjs` (PGlite, real Postgres)

- **Cross-tenant leak** — B cannot read/insert/update A's `media_folders` or `media_assets`; leak_probe
  extended.
- **Role matrix** — staff can write `media` assets, cannot on `brand` (admin only); manager+ delete;
  client write-ceiling; `is_member` read.
- **`register_media_asset`** — inserts the row, image → one `queued` `media.autotag` job (idempotent),
  non-image → `tag_status='skipped'`, no job; path/workspace mismatch rejected.
- **`used_in`** — `register_asset_usage` appends + dedups; `unregister` removes; where-used read reflects it.
- **Backfill** — with a seeded `deal_files.asset_id`, `backfill_asset_usage()` populates `used_in`
  `{module:'pipeline', ref_id:<deal>}`; second run is a no-op (idempotent).
- **Storage meter** — `recompute_storage_meter` sets `storage_gb` = Σbytes/GB as a gauge (re-run overwrites,
  not adds).
- **Soft delete** — `deleted_at` hides the asset from the browse policy; used-in still resolvable for the warning.
- **No regressions** — full existing probe suite green + Gate-8 greps clean.

Wire into `scripts/verify.sh` (m06 step) and `verify-status.json`.

---

## 9. Deferred / carried (honest, never faked green)

- **Live vision auto-tagging** — provider undecided (parallel to D-063); the job pipeline, Edge Fn,
  meter call-site, and `tag_status` lifecycle are built + probe-tested; the GPT-4o call is a scaffold.
- **Storage image-transform add-on / imgproxy** — the transform-URL helpers are built; whether transforms
  render depends on the deploy-time Storage config (Pro add-on or self-host imgproxy) — ready-not-run.
- **Virus scan (ClamAV)** — out of the accept-when; a `scan_status` is **not** added this slice (YAGNI);
  noted for a later hardening pass.
- **M35 brand-kit binding** — brand collections exist now; the `brand_kits` link lands with M35.
- **Live Storage round-trips** (upload → object → signed URL → transform) + the nightly cron + Realtime
  grid refresh against a hosted project — carried (no Docker/CLI/Deno here).
- **Restore-from-trash UI** — soft-delete is in the schema; the restore surface is deferred (YAGNI this slice).

---

## 10. DECISIONS to add (claim **D-113…D-119**; reconcile on merge with parallel S15–S19)

- **D-113** M06 ships canonical DATA-SCHEMA §6 (`media_assets`/`media_folders`, `bucket`+`storage_path`,
  `used_in` jsonb) — **not** PRD's Prisma (`AssetUsage` table, stored `url`); `media_folders` gains
  `bucket`/`kind`/`pinned` for brand collections.
- **D-114** `media_assets` minimal logged extensions for the PRD UI: `filename`/`title`/`alt_text`/
  `duration_sec`/`is_favorite`/`tag_status`. No `search_tsv` (name ilike + tag GIN suffices).
- **D-115** Upload is **direct-to-Storage** via storage-js (RLS from `0004` is the wall) + a
  `register_media_asset` definer RPC for the row + job enqueue; **no presign Edge Function** (no security
  gain — mirrors M12 D-055 / M41 D-035).
- **D-116** Image variants = **Supabase Storage image-transform URLs** (native query params), derived
  client-side; the Sharp/BullMQ variant worker is dropped (dead stack). Rendering depends on deploy-time
  transform config (add-on/imgproxy), carried.
- **D-117** AI auto-tagging is a **`media.autotag` job** + `media-autotag` Edge Fn scaffold; vision provider
  deferred (parallel to D-063); `tag_status` drives the live-updating grid; `meter_increment(ai_tokens)`
  fires only on a real provider call (Gate 3 clean until then).
- **D-118** Usage tracking = canonical **`used_in` jsonb** + `register/unregister_asset_usage` RPCs +
  `backfill_asset_usage()` from `deal_files` (the sole existing consumer). No separate `asset_usages` table.
- **D-119** Storage metering revives the dormant `storage_gb` meter kind via a **nightly `pg_cron`
  gauge-recompute** (`recompute_storage_meter`, set-not-add); no per-upload metering (storage is a gauge).

---

## 11. Docs updated at close (Gate 9)

DATA-SCHEMA (§6 M06 implementation note) · DECISIONS (D-113…D-119) · JOBS-AND-WORKERS §5
(`m06-storage-meter-nightly` cron) + §6 (`media.autotag` type) · `config.toml` (`media-autotag`) ·
`verify.sh` (m06 step) + `verify-status.json` · `seed.sql` (a `media`/`brand` folder tree, 3 brand
collections, sample assets with tags + a `used_in` entry) · `leak_probe.sql` (M06 read/write guards) ·
`.claude/launch.json` (m06-preview) · TASKS.md (Session 20 close + carry-overs + human-reconcile flag for
the `0021` / D-113 parallel collisions + the still-open `0012` M05 renumber).
