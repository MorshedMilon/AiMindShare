# PRD — M17: Proposals & Contracts ⭐
**Layer:** L1 Core Ops | **Priority:** P1 | **Phase:** 5
**Depends On:** M09, M28, M06 | **Blocks:** —

## 1. Purpose
PandaDoc/DocuSign replacement: templated proposals, contracts, and quotes with CRM auto-fill, multi-party e-signature, viewing analytics, and accept→invoice conversion.

## 2. Core Features
- **Document builder:** block editor (TipTap) — headings, rich text, images, tables, page breaks, **pricing table block** (line items, qty, unit price, optional/selectable items, taxes, discounts → live total), **signature blocks** (assigned per signer), **variable tokens** ({{contact.first_name}}, {{deal.value}}, {{workspace.name}}, custom fields) resolved at send time.
- **Templates:** save any doc as template; seeded pack (service proposal, retainer agreement, NDA, SOW, quote); categories.
- **Quote calculator:** pricing table with client-selectable optional items → total recalculates live for recipient; selections captured on acceptance.
- **Signing flow:** ordered or parallel multi-party signers (contact + workspace user + extra emails); each signer gets unique signed link; identity capture (name, email, IP, timestamp, user agent); draw / type / upload signature; decline-with-reason option.
- **Legal audit trail:** immutable event log per document (created, sent, viewed, signed, completed) + final **certificate of completion page** appended to executed PDF (rendered via headless Chrome → PDF, stored in M06).
- **Viewing analytics:** per-recipient opens, total view time, per-section time (scroll telemetry) — "they spent 4 min on pricing."
- **Lifecycle:** draft → sent → viewed → partially signed → completed | declined | expired; expiry date + auto-reminders (3d before, on expiry); manual nudge.
- **Conversions:** on completion — optional auto-create M28 invoice from pricing table (incl. selected options), `document.completed` trigger (M13), timeline entry, deal auto-move option (e.g. → "Contract Signed" stage).

## 3. Database Schema (Prisma)
```prisma
model Document {
  id String @id @default(uuid())
  workspaceId String; contactId String?; dealId String?
  type String // proposal|contract|quote
  title String; contentJson Json
  status String @default("draft")
  expiresAt DateTime?; completedAt DateTime?
  finalPdfAssetId String?
  settingsJson Json // reminders, invoice-on-accept, deal-move
  createdBy String; createdAt DateTime @default(now())
}
model DocumentSigner {
  id String @id @default(uuid())
  documentId String; order Int
  name String; email String; role String // signer|viewer
  tokenHash String @unique
  viewedAt DateTime?; signedAt DateTime?; declinedAt DateTime?
  signatureImageUrl String?; ipAddress String?; userAgent String?
}
model DocumentEvent {
  id String @id @default(uuid())
  documentId String; signerId String?
  type String; metadata Json?
  createdAt DateTime @default(now())
}
model DocumentTemplate { id String @id @default(uuid()); workspaceId String?; name String; category String; contentJson Json }
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| CRUD | /api/documents (+templates) | Manage |
| POST | /api/documents/:id/send | Resolve tokens, create signer links, email |
| GET | /api/public/documents/:token | Recipient view (definition + state) |
| POST | /api/public/documents/:token/telemetry | View/scroll events |
| POST | /api/public/documents/:token/sign \| /decline | Signature submit |
| GET | /api/documents/:id/analytics | Viewing stats |
| POST | /api/documents/:id/remind | Manual nudge |

## 5. UI
- /documents: list with status pills + analytics glance
- /documents/[id]/edit: builder (block palette, token menu, signer manager, settings drawer)
- Recipient page: clean doc render, sticky sign CTA, pricing selections, signature modal
- Detail view: status timeline, per-signer state, analytics panel, event log

## 6. Acceptance Criteria
- [ ] Tokens resolve from contact/deal/workspace incl. custom fields
- [ ] Ordered signing enforces sequence; parallel works
- [ ] Executed PDF with certificate stored; hash of content recorded at send (tamper evidence)
- [ ] Selectable pricing options captured; invoice created matches selections
- [ ] Reminder + expiry jobs behave; declined stops flow with reason
- [ ] document.completed trigger + deal auto-move fire

## 7. Claude Code Prompt — M17
```
Build Module M17 (Proposals & Contracts). M09/M28/M06/M13 exist.
1. Prisma models per PRD. Content = TipTap JSON with custom node types:
   pricingTable, signatureBlock, pageBreak, token.
2. Builder: TipTap editor with custom extensions; signer manager;
   token insert menu (introspect contact/deal/custom fields).
3. Send: snapshot contentJson + sha256 hash; per-signer tokens; emails.
4. Recipient app (no auth): render doc, pricing option toggles with live
   total, scroll telemetry beacon, signature pad (canvas draw/type),
   sequential-order gate.
5. Completion: assemble final PDF via puppeteer (doc + certificate page
   listing signer identities/IPs/timestamps + content hash) → M06;
   optional invoice via M28 service; triggers.emit(document.completed);
   deal stage move if configured.
6. Reminder/expiry BullMQ jobs. Analytics rollups from DocumentEvent.
```

*Next: M18 — Projects & Team Ops*
