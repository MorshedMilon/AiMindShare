# PRD — M39: Marketplace (Snapshots & Templates)
**Layer:** L5 Platform | **Priority:** P3 | **Phase:** 8
**Depends On:** Most modules (export/import), M28/M03 (payments), M44 (moderation) | **Blocks:** —

## 1. Purpose
The ecosystem play: package entire workspace configurations ("snapshots") and individual assets (workflows, sites, courses, templates, prompt packs) for sharing or selling — the network effect that locks in GoHighLevel's agency community.

## 2. Core Features
- **Snapshots (the core primitive):** export a workspace's configuration — selected components: pipelines+stages, workflows (M13), sites/funnels (M19/M20 pages), forms (M15), email/SMS templates + sequences (M16), calendars (M14 settings), custom fields/tags (M09), courses (M31 structure), agent configs (M33 minus knowledge data), pin/design templates (M24/M35) — into a versioned package (JSON manifest + asset bundle to R2); **no contact/PII data ever included** (enforced exporter allowlist).
- **Import/install:** one-click install into a workspace — dependency resolution (workflow references form X → both included or mapped), ID remapping, conflict handling (rename-on-collision), preview manifest before install, dry-run validation; partial install (pick components).
- **Use cases:** agency onboarding (install "Dental Agency Snapshot" into every new client workspace — direct integration with M01 provisioning: "provision from snapshot"), team sharing, and selling.
- **Marketplace storefront:** public catalog — listings (snapshot or single-asset type) with title, niche category, screenshots, description, preview details (component counts), price (free/one-time via M28-style platform checkout); search + category browse; ratings & reviews (verified-install only); seller profiles.
- **Seller program:** creator applications (M44 approval); listing submission → automated validation (installs cleanly into sandbox) + manual review queue (M44); revenue share (platform % configurable, default 70/30 via Stripe Connect); seller dashboard (sales, earnings, payouts, install analytics, review responses).
- **Versioning & updates:** sellers push updates; buyers notified, can update installed snapshot (diff preview; non-destructive: adds new, flags changed, never deletes user-modified items silently).
- **Licensing:** per-workspace install licenses; agency-wide license tier (install into unlimited sub-accounts).

## 3. Database Schema (Prisma)
```prisma
model Snapshot {
  id String @id @default(uuid())
  workspaceId String; name String; version Int @default(1)
  manifestJson Json; bundleUrl String
  componentsJson Json // counts by type
  createdAt DateTime @default(now())
}
model MarketListing {
  id String @id @default(uuid())
  sellerId String; snapshotId String?
  assetType String // snapshot|workflow|site|course|template_pack|prompt_pack
  title String; slug String @unique; category String
  description String; mediaJson Json
  priceCents Int; licenseType String
  status String @default("draft") // draft|in_review|live|suspended
  statsJson Json?
}
model Seller { id String @id @default(uuid()); agencyId String; profileJson Json; stripeConnectId String?; status String @default("pending") }
model Purchase {
  id String @id @default(uuid())
  listingId String; buyerAgencyId String
  amountCents Int; licenseType String
  stripePaymentId String?; createdAt DateTime @default(now())
}
model Install {
  id String @id @default(uuid())
  purchaseId String?; listingId String?; snapshotId String
  targetWorkspaceId String; version Int
  status String; mappingJson Json?
  installedAt DateTime @default(now())
}
model ListingReview { id String @id @default(uuid()); listingId String; buyerAgencyId String; rating Int; text String?; createdAt DateTime @default(now()) }
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/snapshots/export | Build snapshot (job, component picker) |
| POST | /api/snapshots/:id/install | Install → workspace (job, dry-run flag) |
| GET | /api/snapshots (+/:id/manifest) | My snapshots |
| GET | /api/market (+/:slug) | Public catalog |
| POST | /api/market/purchase | Checkout |
| CRUD | /api/market/listings (seller) | Listing mgmt (+submit for review) |
| GET | /api/market/seller/dashboard | Sales/earnings |
| POST | /api/market/listings/:id/review | Buyer review |
| POST | /api/installs/:id/update | Apply new version (diff preview) |

## 5. UI
- /snapshots: my snapshots, export wizard (component checklist → build progress), install wizard (target workspace, preview, conflicts)
- /marketplace: storefront (browse/search/detail with screenshots + component manifest + reviews), purchase flow
- /marketplace/seller: listings, submission status, sales dashboard
- M01 provisioning hook: "Create workspace from snapshot" option

## 6. Acceptance Criteria
- [ ] Round-trip: export full-config workspace → install into blank workspace → all components functional (workflows reference remapped forms/calendars correctly)
- [ ] PII exclusion verified — exporter cannot include contacts/messages/invoices (allowlist test)
- [ ] Dry-run reports conflicts without writing
- [ ] Purchase → install license → agency license installs into 2nd sub-account
- [ ] Update flow shows diff, preserves user-modified items
- [ ] Listing must pass sandbox auto-install before entering review queue

## 7. Claude Code Prompt — M39
```
Build Module M39 (Marketplace). Requires exporters in source modules.
1. Exporter/importer framework: lib/snapshot/registry.ts — each module
   registers { type, export(workspaceId, ids?), import(workspaceId,
   data, idMap) }. Implement for: pipelines, workflows, forms, pages/
   sites/funnels, campaigns/sequences, calendars, fields/tags,
   courses, agents(config), templates. STRICT allowlist — no PII types.
2. Snapshot build job: walk selected exporters → manifest + bundle →
   R2. Install job: topological order by dependencies, ID remap table,
   conflict strategy, dry-run mode, Install record with mapping.
3. Marketplace: listing lifecycle (sandbox auto-install validation job
   → M44 review queue), catalog pages (public, SSR), purchase via
   platform Stripe (Connect split to Seller), license enforcement
   on install.
4. Versioning: snapshot v+1 → installed-diff calculator → selective
   update applier (never overwrite user-modified without flag).
5. Seller dashboard + reviews (verified Install required).
6. M01 hook: provision-from-snapshot option.
```

*Next: M40 — Analytics & Report Builder*
