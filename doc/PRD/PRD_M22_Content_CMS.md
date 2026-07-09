# PRD — M22: Content / CMS
**Layer:** L2 Growth | **Priority:** P1 | **Phase:** 3 (Sessions 26–27)
**Depends On:** M21, M19, M06, M35 | **Blocks:** M23/M24 repurposing, M29 review content

## 1. Purpose
The article library and AI auto-blogging engine — the full keyword→published pipeline from original PRD Section 14, plus a real CMS (drafts, revisions, categories, editorial queue).

## 2. Core Features
### CMS
- **Article manager:** list (status, SEO score, words, published date, traffic if available); statuses draft / in_review / scheduled / published / archived; rich editor (TipTap) with slash commands, image insert (M06), internal-link search popup; revisions (autosave versions, restore); categories + tags; authors (workspace users or pen names); scheduled publishing.
- **Publishing:** renders on M19 site blog routes (`/blog`, `/blog/[slug]`, category pages) with meta + Article/FAQ schema; RSS feed per site.

### AI Auto-Blog Pipeline (original PRD Section 14, all 11 steps)
- Keyword → SerpApi SERP fetch → GPT-4o content brief (JSON: H1, meta, sections, FAQs, intent, word count) → full article generation (brand voice, HTML, keyword placement rules) → SEO score (0–100 rubric per original spec) → internal link suggester (embedding similarity vs existing articles, insert 2+ links both directions) → DALL-E featured image (via M35 → M06) → schema JSON-LD build → quality gate (SEO ≥ threshold, Flesch-Kincaid readability, optional Originality.ai) → publish or review queue → distribution triggers (`article.published` → M13; one-click send to M23 social + M24 pins + M16 newsletter).
- **Settings per site:** frequency (X/week, days/times), brand voice, niche context, target word count, auto-publish vs review, language, min internal links, quality thresholds.
- **Content queue:** keyword rows (from M21 send-to-queue, CSV bulk import, or manual) with priority; scheduler cron (daily 6am) tops up per frequency; BullMQ generation workers (3 concurrent), statuses pending/generating/review/published/failed with progress UI; retry failed.
- **Review queue:** editors see generated drafts with SEO/readability scores, edit inline, approve→publish or reject→regenerate with feedback note (fed into regen prompt).
- **Metering:** ai.tokens + ai.image per article; hard-stop honors M03.

## 3. Database Schema
Original PRD Section 14 tables Prisma-ized (`BlogArticle, ContentSchedule, ContentQueue`) + `ArticleRevision { articleId, versionNo, contentHtml, savedAt }`, `ArticleCategory`, `BlogArticle.categoryId/authorId/embedding vector(1536)` (for internal linking), `ContentQueue.failReason`.

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| CRUD | /api/articles (+revisions, +categories) | CMS |
| POST | /api/articles/:id/publish \| /schedule | Publishing |
| POST | /api/blog/generate | Single-keyword pipeline (job) |
| CRUD | /api/content-queue (+bulk CSV) | Queue |
| GET/PATCH | /api/content-schedules/:siteId | Auto-blog settings |
| GET | /api/review-queue | Pending drafts |
| POST | /api/articles/:id/approve \| /reject | Editorial actions |
| POST | /api/articles/:id/distribute | Fan out to M23/M24/M16 |
| GET | (public) /blog routes + RSS | Rendering via M19 |

## 5. UI
- /content: articles table with filters + bulk actions
- /content/[id]: editor (TipTap) with SEO sidebar (live score checklist, keyword density, meta fields, featured image, schema preview)
- /content/queue: pipeline board (pending→generating→review→published) with progress
- /content/review: draft cards with scores + approve/reject
- /settings/content: per-site schedule settings

## 6. Acceptance Criteria
- [ ] Full pipeline end-to-end: keyword in → published article with image, schema, ≥2 internal links, SEO score
- [ ] Quality gate blocks below-threshold auto-publish → review queue
- [ ] Reject-with-feedback regenerates incorporating notes
- [ ] Scheduler respects frequency/days; 3-worker concurrency; failure retry ×2
- [ ] Internal link suggester uses pgvector similarity
- [ ] Distribution creates M23 drafts + M24 pin drafts (stub-safe if not built)

## 7. Claude Code Prompt — M22
```
Build Module M22 (Content/CMS) implementing original PRD Section 14
Claude prompt (full 11-step pipeline code) plus CMS layer:
1. Prisma models per PRD incl. pgvector embedding on BlogArticle.
2. Pipeline worker chain (BullMQ flow): serp → brief → article →
   seoScore → internalLinks (embed article, query top-5 similar,
   insert links) → image (M35 job) → schema → qualityGate →
   save/publish. Meter tokens/images. Per-step status updates
   (Pusher to queue UI).
3. Scheduler cron 6am per ContentSchedule; queue top-up logic per
   original spec.
4. TipTap editor page with live SEO checklist sidebar (recompute on
   change, debounced).
5. Review queue with approve/reject(feedback) → regen job.
6. Public blog rendering integrated into M19 SSR + RSS.
7. Distribution endpoint calling M23/M24/M16 draft-creation services
   (feature-flag guarded).
```

*Next: M23 — Social Planner*
