# PRD — M19: Sites (AI Website Builder)
**Layer:** L2 Growth | **Priority:** P0 | **Phase:** 2 (Sessions 20–22)
**Depends On:** M06, M15, M14, M12, M41 | **Blocks:** M20, M22 publishing, M05 cookie banner target

## 1. Purpose
AI text-to-website generation plus full Craft.js drag-and-drop editing, custom domains with auto-SSL, and deep CRM integration. Implements original PRD Section 12 fully.

## 2. Core Features
(Original PRD Section 12 scope)
- **AI generation:** describe business → GPT-4o returns valid Craft.js JSON (hero, features, testimonials, CTA, footer with real copy + image prompts → DALL-E via M35/M06); URL-to-clone (scrape structure/palette → regenerate); niche template generation; per-section AI rewrite (tone/niche); voice prompt (browser speech-to-text → same pipeline). All metered (ai.tokens/ai.image).
- **Editor (Craft.js):** Page→Section→Row→Column→Element; elements: heading, text, image (M06 picker), video embed, button, **form embed (M15)**, **calendar widget (M14)**, **chat widget (M12)**, map, countdown, testimonial, pricing table, FAQ accordion, social icons, HTML embed, spacer/divider; properties panel (typography, spacing, background, border); global styles (brand colors/fonts site-wide); mobile breakpoint overrides (375px toggle); 50-step undo/redo; layers panel; template gallery (20+ seeded, by niche).
- **Pages & navigation:** multi-page sites; nav menu builder; page duplicate; draft/published states; version history (restore last 10 publishes).
- **Publishing:** SSR public renderer (`/sites/[domain]/[slug]` resolution); custom domain connect wizard (CNAME/A instructions + verification) with auto-SSL (Let's Encrypt via Caddy/Cloudflare); staging preview URLs.
- **SEO per page:** meta title/description, OG image (M06), canonical, robots; sitemap.xml + robots.txt auto-generated per site; schema injection (LocalBusiness/Article/FAQ per page settings).
- **Tracking + CRM wiring:** first-party analytics pixel (page views → visitor sessions; identified contacts → `timeline.add(page_visit)` + `page.visited` trigger); form submissions → M15 pipeline; cookie banner injection (M05); chat widget messages → M12.

## 3. Database Schema
Original PRD Section 12 tables Prisma-ized (`Site, Page, SiteTemplate`) + `PageVersion { pageId, versionNo, pageJson, publishedAt }`, `SiteDomain { siteId, domain, status, sslStatus, verifiedAt }`, `SiteNav { siteId, itemsJson }`, `VisitorSession { id, siteId, visitorId, contactId?, pagesJson, utmJson, startedAt }`.

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| CRUD | /api/sites (+pages, +nav, +domains) | Manage |
| POST | /api/builder/ai-generate | Description → Craft JSON |
| POST | /api/builder/ai-rewrite-section | Section rewrite |
| POST | /api/builder/clone-url | URL analysis → JSON |
| POST | /api/pages/:id/publish \| /revert/:version | Publish/version ops |
| GET | /api/domains/:id/verify | DNS check + SSL provision |
| POST | /api/track | Pixel events (views, identify) |
| GET | (public) sitemap.xml, robots.txt, page SSR | Rendering |

## 5. UI
- /sites: site cards (domain, pages, status)
- /sites/[id]: pages list, nav editor, domain settings, SEO defaults
- /sites/[id]/edit/[pageId]: full editor per original Section 12 prompt (left elements/layers/templates, canvas, right properties, top toolbar: device toggle, undo/redo, AI generate, preview, save, publish)

## 6. Acceptance Criteria
- [ ] AI generate produces deserializable Craft JSON ≥95% (Zod-validated with one auto-repair retry)
- [ ] Form/calendar/chat elements fully functional on published pages
- [ ] Custom domain verify + SSL end-to-end on a test domain
- [ ] Mobile overrides apply only at breakpoint; undo/redo 50 steps
- [ ] Identified visitor page views hit contact timeline + trigger bus
- [ ] Version restore works; sitemap valid

## 7. Claude Code Prompt — M19
```
Build Module M19 (Sites) per original PRD Section 12 Claude prompt, plus:
- AI generation: GPT-4o system prompt embedding the Craft.js component
  schema + 2 few-shot examples; Zod-validate output; on failure, one
  repair pass; image prompts → M35 generation job → M06 URLs.
- Platform elements: FormEmbed (renders M15 public form by id),
  CalendarEmbed (M14 slug), ChatWidget (M12 script) as Craft components
  with picker-based props.
- Public SSR renderer resolving host→Site→Page, injecting SEO meta,
  schema JSON-LD, cookie banner (M05), tracking pixel.
- Domain flow: SiteDomain records, DNS verification endpoint, SSL
  provisioning hook (Caddy on-demand TLS or Cloudflare SaaS).
- /api/track: visitor sessions, identify via form-submit linkage,
  timeline.add + triggers.emit(page.visited) for identified contacts.
- PageVersion snapshots on publish; revert endpoint.
```

*Next: M20 — Funnels*
