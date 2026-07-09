# PRD — M25: AI Video Studio ⭐
**Layer:** L2 Growth | **Priority:** P3 | **Phase:** 8
**Depends On:** M22, M23, M06, M35, M41 | **Blocks:** —

## 1. Purpose
Blog-to-video pipeline: turn any article (or prompt) into short-form video — script, AI voiceover, visuals, captions — rendered in vertical/square/landscape and published via M23. No GoHighLevel-class competitor has this natively.

## 2. Core Features
- **Script generator:** article/URL/topic in → GPT-4o produces timed script JSON: scenes[] { narration, duration, visualDirection, onScreenText, brollKeywords } targeting 30/60/90s formats; hook-first structure; tone presets.
- **Voiceover:** TTS via ElevenLabs (M41) — voice library picker + per-workspace cloned/brand voice option; per-scene audio segments; speed/pitch controls; meter `voice.minutes` (M03).
- **Visuals per scene:** priority chain — (1) article images (M06), (2) stock b-roll search (Pexels/Pixabay API via M41), (3) AI image generation with subtle zoom/pan Ken Burns (M35); user can swap any scene visual.
- **Captions:** word-level timestamps from TTS alignment → burned-in animated captions (highlight style presets, brand colors); SRT export.
- **Avatar mode (optional):** AI presenter via HeyGen/D-ID-style API adapter (M41) rendering narration scenes; toggle per video.
- **Renderer:** server-side composition — Remotion (React-based) or ffmpeg timeline assembler: scene visuals + Ken Burns + captions + voiceover + background music (licensed library, ducking) + brand outro card; outputs 9:16 / 1:1 / 16:9 MP4 (1080p) to M06; render farm = BullMQ workers with progress events; meter `video.render`.
- **Editor (lightweight):** scene list — edit narration (re-TTS single scene), swap visual, adjust on-screen text, reorder, trim; regenerate script section.
- **Templates:** niche video templates (listicle countdown, tip-of-the-day, product feature, testimonial quote) = scene structure presets.
- **Publish:** one-click send renders to M23 composer (Reels/TikTok/Shorts presets) with AI caption + hashtags; also downloadable.
- **Bulk mode:** select N articles → queue N videos with a template.

## 3. Database Schema (Prisma)
```prisma
model VideoProject {
  id String @id @default(uuid())
  workspaceId String; sourceArticleId String?; title String
  scriptJson Json; settingsJson Json // voice, template, format(s), avatar
  status String @default("draft") // draft|rendering|ready|failed
  createdAt DateTime @default(now())
}
model VideoScene {
  id String @id @default(uuid())
  projectId String; order Int
  narration String; visualType String; visualRef String? // assetId|stockUrl|genPrompt
  onScreenText String?; durationMs Int?
  audioAssetId String?
}
model VideoRender {
  id String @id @default(uuid())
  projectId String; aspect String // 9:16|1:1|16:9
  status String; progress Int @default(0)
  outputAssetId String?; srtAssetId String?
  renderSec Int?; error String?
  createdAt DateTime @default(now())
}
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/video/projects (from article/topic) | Create + script gen |
| CRUD | /api/video/projects/:id (+scenes) | Edit |
| POST | /api/video/scenes/:id/retts \| /swap-visual | Scene ops |
| POST | /api/video/projects/:id/render | Queue renders (aspects[]) |
| GET | /api/video/renders/:id | Progress (SSE/Pusher) |
| POST | /api/video/projects/:id/publish | → M23 composer |
| POST | /api/video/bulk | Articles[] × template |
| GET | /api/video/stock-search?q= | B-roll search proxy |

## 5. UI
- /video: project grid with status + thumbnails
- /video/[id]: scene-list editor (left scenes, right preview player of latest render / storyboard), voice picker, template/format panel, render button with progress
- Bulk modal from /content article selection

## 6. Acceptance Criteria
- [ ] 60s article-to-video end-to-end in <10 min render time
- [ ] Captions word-synced within ±100ms; brand styles applied
- [ ] Scene re-TTS and visual swap only re-render affected segments where feasible
- [ ] All three aspects render from one project
- [ ] voice.minutes + video.render metered; hard-stop honored
- [ ] Publish lands in M23 with correct platform presets

## 7. Claude Code Prompt — M25
```
Build Module M25 (AI Video Studio). M22/M23/M06/M35/M41 exist.
1. Prisma models per PRD.
2. Script service: GPT-4o structured scenes JSON (validate w/ Zod).
3. TTS adapter (ElevenLabs via M41) returning audio + word timestamps;
   per-scene audio assets; meter voice.minutes.
4. Visual resolver chain (article assets → stock adapter → M35 gen).
5. Renderer: Remotion project (Scenes composition: media + KenBurns +
   AnimatedCaptions + audio track + music with ducking + outro) driven
   by project JSON; BullMQ render worker per aspect with progress
   events (Pusher); output → M06; meter video.render.
6. Scene editor UI + render progress; publish handoff building M23
   post drafts with video asset + AI caption.
7. Bulk queue from article list. Stock search proxy endpoint.
```

*Next: M26 — Local SEO*
