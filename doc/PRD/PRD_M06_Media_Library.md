# PRD — M06: Media Library & Asset Manager ⭐
**Layer:** L0 Foundation | **Priority:** P1 | **Phase:** 2 (Session 7)
**Depends On:** M01, M02 | **Blocks:** M19, M22, M23, M24, M35 (all consume assets)

## 1. Purpose
Central workspace file store on Cloudflare R2 — one upload pipeline, one picker component, used by Sites, Content, Social, Pinterest, Creative Studio, Portal, and Agents. Ends the "same logo uploaded 9 times" problem.

## 2. Core Features
- **Upload pipeline:** drag-drop multi-upload; presigned R2 PUT URLs (direct browser→R2); types: images (jpg/png/webp/gif/svg), video (mp4/webm ≤500MB), audio, PDF, docs; virus-scan hook (ClamAV optional); auto image variants via Sharp worker (thumb 300px, medium 800px, original) + WebP conversion.
- **Organization:** folders (nested), rename, move, multi-select; favorites; search by name/tag; filters (type, date, folder).
- **AI auto-tagging:** on image upload, background job calls GPT-4o vision → descriptive tags + alt text stored (searchable, reused by M19/M22 for SEO alt attributes).
- **Usage tracking:** `asset_usages` records where each asset is used (module, entityType, entityId); "Where used" panel; deletion warning if in use.
- **Brand collections:** pinned collections (Logos, Brand Photos, Templates) surfaced first in pickers; connected to M35 brand kit.
- **Shared picker component:** `<AssetPicker>` modal (browse/search/upload inline, single or multi select) — the one component every module imports.
- **Storage metering:** total GB per workspace → `meter.increment('storage.gb')` (M03) recalculated nightly.
- **Public CDN URLs:** all assets served via R2 public bucket/custom domain with cache headers.

## 3. Database Schema (Prisma)
```prisma
model MediaFolder {
  id String @id @default(uuid())
  workspaceId String; name String; parentId String?
  createdAt DateTime @default(now())
}
model MediaAsset {
  id String @id @default(uuid())
  workspaceId String; folderId String?
  filename String; mimeType String; sizeBytes Int
  url String; thumbUrl String?; mediumUrl String?
  width Int?; height Int?; durationSec Int?
  aiTags String[]; altText String?
  isFavorite Boolean @default(false)
  uploadedBy String
  createdAt DateTime @default(now())
  @@index([workspaceId, folderId])
}
model AssetUsage {
  id String @id @default(uuid())
  assetId String; module String; entityType String; entityId String
  createdAt DateTime @default(now())
  @@index([assetId])
}
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/media/presign | Get presigned R2 upload URL |
| POST | /api/media/complete | Register uploaded asset (triggers variants + AI tag jobs) |
| GET | /api/media | List/search (folder, type, q, favorites) |
| PATCH | /api/media/:id | Rename, move, favorite, alt text |
| DELETE | /api/media/:id | Delete (warn if usages exist) |
| CRUD | /api/media/folders | Folder management |
| POST | /api/media/:id/usage | Register usage (internal, from other modules) |
| GET | /api/media/:id/usage | Where-used list |

## 5. UI
- /media: two-pane (folder tree left, grid right), grid/list toggle, upload dropzone, bulk toolbar, detail drawer (preview, variants, alt text, tags, where-used)
- `<AssetPicker>` exported component

## 6. Acceptance Criteria
- [ ] Direct-to-R2 upload with progress; 100MB image and 500MB video verified
- [ ] Variants + AI tags generated async; grid updates live
- [ ] AssetPicker embedded successfully in a test consumer
- [ ] Where-used populated when consumers register usage; delete warns
- [ ] Nightly storage meter job feeds M03

## 7. Claude Code Prompt — M06
```
Build Module M06 (Media Library). M01–M03 exist. R2 creds via M41.
1. Prisma models per PRD.
2. Presigned upload flow (R2 S3-compatible SDK), /complete registration.
3. BullMQ workers: sharp variants (thumb/medium/webp), GPT-4o vision
   auto-tagging + alt text (meter ai.tokens), nightly storage-gb meter.
4. /media page: folder tree, virtualized grid, drag-drop upload with
   progress, detail drawer, bulk actions.
5. <AssetPicker> reusable modal component (single/multi select modes,
   inline upload, search) — export from components/media/.
6. Usage registration endpoint + where-used UI.
```

*Next: M07 — Audit Logs & Platform Settings*
