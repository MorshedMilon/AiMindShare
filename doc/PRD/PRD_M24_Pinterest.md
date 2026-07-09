# PRD — M24: Pinterest Automation
**Layer:** L2 Growth | **Priority:** P1 | **Phase:** 4 (Session 30)
**Depends On:** M22, M35, M06, M41 | **Blocks:** —

## 1. Purpose
Dedicated Pinterest growth machine — AI pin generation with auto-designed vertical images, board management, bulk scheduling, and Pinterest SEO. Implements original PRD Section 15 (Pinterest portion) fully. A genuine differentiator: no GoHighLevel-class competitor has this.

## 2. Core Features
(Original PRD Pinterest sub-module scope)
- **Pin generator:** input = blog URL / product URL / keyword → Cheerio content extraction (title, description, og:image) → GPT-4o generates 5 titles (≤100 chars) + 5 keyword-rich descriptions (150–300 chars, CTA endings) → **Sharp.js 1000×1500 image composition** per original spec (source image top 65%, gradient overlay bottom 35%, bold white title text via SVG layer, domain+logo watermark strip, CTA badge option) → 5 draft variations saved; brand kit colors/fonts applied (M35).
- **Pin templates:** 12 seeded design templates (text-only, image-heavy, minimal, quote-style, listicle-number, before/after…) — template = composition recipe JSON consumed by the Sharp renderer; per-workspace custom templates.
- **Board management:** list/create/edit boards via Pinterest API v5; AI board name+description optimizer (Pinterest SEO); board keyword targeting field.
- **Scheduling:** per-pin schedule; **bulk pin creation** — keyword list / article list in → N pins generated with spread schedule (e.g. 20 pins across 30 days, daily caps to avoid spam flags: default ≤5/day); interval jitter; queue view.
- **Publishing:** BullMQ delayed jobs → Pinterest API v5 POST /pins (image upload → pin create with destination URL + UTM auto-tags); failure retry + notify.
- **Pinterest SEO:** keyword suggestions for titles/descriptions (annotation-style guidance from keyword input); alt-text set from AI.
- **Analytics:** per-pin + per-board impressions, saves, outbound clicks (Pinterest analytics API, nightly sync); top pins; traffic correlation with M19 site UTM sessions.
- **M22 integration:** article published → auto-draft pin set (if enabled in content schedule distribution settings).

## 3. Database Schema
Original PRD tables (`PinterestPin, PinterestBoard`) + `PinterestPin.templateId/variantGroupId/status`, `PinTemplate { id, workspaceId?, name, recipeJson, previewUrl }`, `PinSchedulePlan { id, workspaceId, name, totalPins, perDayCap, startAt, status }`.

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/pinterest/generate-pins | URL/keyword → 5 drafts (job) |
| POST | /api/pinterest/bulk-generate | Keyword/article list → plan |
| CRUD | /api/pinterest/boards | Board mgmt (+AI optimize) |
| POST | /api/pinterest/pins/:id/schedule | Schedule |
| CRUD | /api/pinterest/templates | Design templates |
| GET | /api/pinterest/analytics (+/pins/:id) | Insights |
| POST | /api/webhooks/pinterest | Status callbacks (if configured) |

## 5. UI
- /pinterest: pin queue calendar/grid (status: draft/scheduled/published), generator panel (input → variation picker showing 5 rendered images + title/desc combos, edit before save)
- /pinterest/boards: board cards with pin counts + AI-optimize button
- /pinterest/templates: template gallery + recipe editor (layout zones, colors, font size)
- /pinterest/analytics: top pins grid, saves/clicks charts

## 6. Acceptance Criteria
- [ ] Sharp renderer output matches spec (dimensions, text legibility, no overflow — long-title wrap/shrink logic)
- [ ] 5 distinct variations per generation; brand kit respected
- [ ] Bulk plan spreads schedule within daily caps + jitter
- [ ] Live publish verified against Pinterest sandbox/app
- [ ] UTM tags present on all destination URLs
- [ ] Article-published hook creates drafts when enabled

## 7. Claude Code Prompt — M24
```
Build Module M24 (Pinterest) per original PRD Pinterest Claude prompt
(Cheerio extraction + GPT-4o titles/descriptions + Sharp composition +
R2 upload + scheduling), extended with:
- Template recipe system: recipeJson { zones: [{type: image|gradient|
  text|logo|badge, rect, style}] } interpreted by the Sharp renderer;
  seed 12 recipes; text auto-fit (shrink font / wrap to max 3 lines).
- Brand kit application from M35 (colors, font, logo asset).
- Bulk plan generator: inputs → per-item generate jobs + schedule
  spreader (caps + jitter) → PinSchedulePlan progress UI.
- Pinterest API v5 client via M41: boards CRUD, media upload, pin
  create, analytics fetch (nightly sync worker).
- Variation picker UI with rendered previews; queue calendar.
- M22 distribution hook handler creating draft pin sets.
Meter ai.tokens + ai.image equivalents per generation.
```

*Next: M25 — AI Video Studio*
