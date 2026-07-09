# PRD — M35: Creative Studio (AI Image & Design)
**Layer:** L4 AI | **Priority:** P1 | **Phase:** 3 (with M22)
**Depends On:** M06, M41 (OpenAI/DALL-E, optional SDXL) | **Blocks:** M19/M22/M24/M25 image needs

## 1. Purpose
Central AI image generation + brand kit service consumed by every visual module — blog featured images, pin backgrounds, social/ad creatives, video scene imagery, site sections — one pipeline, one brand system.

## 2. Core Features
- **Brand kit:** per workspace — logo assets (primary/light/dark from M06), color palette (primary/secondary/accent + auto-extracted from logo), fonts (Google Fonts picker), brand voice descriptor (shared with M22/M23 prompts); consumed via `brandKit.get(workspaceId)` by M19/M24/M25/M23.
- **Generation service:** `creative.generate({ workspaceId, purpose, prompt|autoPromptContext, size, stylePreset })` — provider adapter (DALL-E 3 default; SDXL/Flux adapter optional via M41); purpose presets map to sizes + prompt scaffolds: blog_featured (1792×1024, editorial style), social_square/story, ad_creative, pin_background (1000×1500), video_scene (16:9/9:16), site_hero, thumbnail; negative-prompt + style presets (photo/illustration/3D/minimal); moderation pass on prompts; output → M06 with AI-tag + purpose metadata; meter `ai.image`.
- **Template compositor:** layered template system (extends M24's recipe engine to general use): background (generated/uploaded) + text zones + logo + badge/CTA shapes → Sharp render; 200+ seeded templates across purposes (quote cards, promo posts, event announcements, before/after, testimonial cards, YouTube thumbnails, story templates); template editor (zone positions, fonts, colors auto-bound to brand kit).
- **Studio UI:** prompt box + purpose/size/style pickers → 4 variations grid → refine (variation-of, inpaint-lite via regenerate-with-edits prompt), upscale; recent generations gallery (M06 filtered); "Use in…" actions (set as article image, create pin, attach to post).
- **Logo generator (lite):** business name + style quiz → N logo concepts (DALL-E) → selected concept saved to brand kit (with "for drafts; commission a designer for trademark use" note).
- **Bulk generation:** CSV/list of prompts or article IDs → batch job with progress.
- **Consumption API:** other modules call generation service directly (M22 pipeline step, M24 backgrounds, M25 scenes, M19 AI-site images) — single metering + moderation point.

## 3. Database Schema (Prisma)
```prisma
model BrandKit {
  workspaceId String @id
  logoAssetIds Json; palette Json; fonts Json
  voiceDescriptor String?
  updatedAt DateTime @updatedAt
}
model Generation {
  id String @id @default(uuid())
  workspaceId String; purpose String
  promptText String; providerId String; params Json
  assetIds String[]; status String
  createdBy String?; sourceModule String?
  createdAt DateTime @default(now())
}
model DesignTemplate {
  id String @id @default(uuid())
  workspaceId String? // null = platform seed
  purpose String; name String
  recipeJson Json; previewUrl String
}
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| GET/PATCH | /api/brand-kit | Brand kit (+logo palette extraction) |
| POST | /api/creative/generate | Core generation (also internal lib) |
| POST | /api/creative/compose | Template + inputs → rendered image |
| CRUD | /api/creative/templates | Template mgmt |
| POST | /api/creative/bulk | Batch job |
| POST | /api/creative/logo | Logo concepts |
| GET | /api/creative/history | Generations gallery |

## 5. UI
- /studio: generator (prompt, purpose chips, style presets, 4-up results with refine/upscale/use-in), template browser by purpose with brand-kit-applied previews, history gallery
- /settings/brand: brand kit editor (logos, palette with extraction button, fonts, voice)

## 6. Acceptance Criteria
- [ ] creative.generate() consumed successfully by M22 pipeline (featured images) and M24 (backgrounds)
- [ ] Brand kit colors/fonts/logo auto-apply in compositor previews
- [ ] Purpose presets produce correct dimensions; moderation blocks disallowed prompts
- [ ] Template render text auto-fits; 20 seed templates minimum at launch (expand to 200+)
- [ ] ai.image metered per output; bulk job resumable
- [ ] Provider adapter swap (DALL-E→SDXL) requires no caller changes

## 7. Claude Code Prompt — M35
```
Build Module M35 (Creative Studio). M06/M41 exist.
1. Prisma models per PRD.
2. lib/creative/: provider adapter interface + dalle3 impl (M41 creds,
   moderation endpoint pre-check, meter ai.image); generate() service
   with purpose preset map (size + prompt scaffold + style merge);
   outputs → M06 upload with metadata.
3. brandKit.get() lib + palette extraction from logo (node-vibrant).
4. Compositor: generalize recipe renderer (Sharp: layers, text auto-fit,
   brand token substitution {{brand.primary}} etc.); seed 20 templates
   across purposes; compose endpoint.
5. Studio UI per PRD (4-up grid, refine loop, use-in actions wiring
   to M22/M23/M24 draft creators where present).
6. Bulk BullMQ job with progress. Logo concept flow.
Document creative.generate() for module consumption.
```

*Next: M36 — AI Insights & Churn Prediction*
