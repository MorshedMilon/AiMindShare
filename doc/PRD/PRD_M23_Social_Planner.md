# PRD — M23: Social Planner
**Layer:** L2 Growth | **Priority:** P1 | **Phase:** 4 (Sessions 28–29)
**Depends On:** M22, M06, M41, M35 | **Blocks:** M25 publishing

## 1. Purpose
Unified scheduler for Facebook, Instagram, LinkedIn, X, TikTok, GBP, and YouTube Community — with AI repurposing from blog content. Implements original PRD Section 15 (social planner portion) fully. Pinterest is M24.

## 2. Core Features
(Original PRD Section 15 planner scope)
- **Account connections:** OAuth per platform via M41 (FB pages/groups, IG business, LinkedIn personal+company, X, TikTok, GBP, YT); token health surfaced (M41 monitor); multi-account per platform.
- **Composer:** write once → per-platform customization tabs (char limits enforced live, platform previews); media via M06 (image specs validated per platform); first-comment option (IG); link shortening with UTM auto-tagging; hashtag AI suggester; emoji picker; save drafts.
- **Calendar:** month/week/day; drag-to-reschedule; click-slot compose; platform color coding; filters; list view.
- **Scheduling:** manual datetime; **Best Time AI** (engagement-history heuristic per platform/account); recurring posts (weekly/monthly repeat with variation option); bulk CSV upload (text, media URLs, datetime, platforms) with validation report; RSS auto-post (feed watch → AI caption → queue per rules).
- **Approval workflow:** optional per-workspace — creator submits → approver (permission `social.approve`) approves/rejects with comment → approved posts auto-publish on schedule; pending state visible on calendar; ties into M37 client approvals.
- **Publishing engine:** BullMQ scheduled jobs → platform adapters (Graph API, LinkedIn, X v2, TikTok, GBP) with per-platform media upload flows; failure → retry ×2 → notify with platform error; platform_post_id stored.
- **AI repurposing:** pick published M22 article (or paste URL) → generate all-platform caption set in one shot (LinkedIn insight post, IG caption, X thread [threaded posts supported], FB story, GBP update) each editable before queueing; 30-day niche content calendar generator (varied content-type plan → bulk drafts).
- **Analytics:** per-post reach/impressions/likes/comments/shares/clicks (platform insight APIs, nightly sync); per-account growth; top posts; best-time chart feeding the scheduler heuristic.
- **Listening (lite):** brand keyword mention feed (X search + IG/FB mentions webhooks where available).

## 3. Database Schema
Original PRD tables (`SocialAccount, SocialPost`) + `SocialPost.threadJson` (X threads), `SocialPost.approvalStatus/approvedBy`, `RecurringPost { workspaceId, baseJson, cadenceJson, nextRunAt }`, `RssSource { workspaceId, url, rulesJson, lastSeenGuid }`, `SocialInsight { postId, metricsJson, syncedAt }`.

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| GET/POST/DELETE | /api/social/accounts | Connections |
| CRUD | /api/social/posts | Compose/draft/schedule |
| POST | /api/social/posts/bulk-csv | Bulk import |
| POST | /api/social/repurpose | Article → all-platform set |
| POST | /api/social/content-series | 30-day plan |
| POST | /api/social/posts/:id/approve \| /reject | Workflow |
| CRUD | /api/social/recurring, /api/social/rss | Automations |
| GET | /api/social/analytics (+/posts/:id) | Insights |
| GET | /api/social/best-times/:accountId | Heuristic |

## 5. UI
- /social: calendar (FullCalendar-style custom) + list toggle + filters
- Composer modal/page: platform tabs, previews, media picker, hashtag AI, schedule panel (datetime / best-time chips / recurring)
- /social/approvals: pending queue with side-by-side preview
- /social/analytics: per-platform cards, top posts, best-time heatmap
- /settings/social: connections, approval toggle, RSS sources

## 6. Acceptance Criteria
- [ ] Publish verified live on FB page, IG, LinkedIn, X (sandbox/test accounts)
- [ ] X thread posting chains reply IDs correctly
- [ ] Char limits + media specs block invalid per-platform variants
- [ ] Approval gate prevents unapproved publishing when enabled
- [ ] Repurpose returns platform-appropriate distinct outputs (not one caption copied)
- [ ] Insights sync nightly; failed posts surface actionable errors

## 7. Claude Code Prompt — M23
```
Build Module M23 (Social Planner). M22/M06/M41/M35 exist.
1. Adapter interface lib/social/adapter.ts { validate(post), publish(post),
   fetchInsights(postId) } + implementations: meta (FB/IG), linkedin,
   x (incl. thread chaining), tiktok, gbp. Creds via M41; errors typed.
2. Prisma models per PRD. Publish worker: due-post scan → adapter →
   retry ×2 → notify on fail; recurring materializer; RSS watcher
   (15-min) with AI caption (meter tokens).
3. Composer UI: shared content + per-platform override tabs with live
   preview components and limit counters; UTM link wrapper.
4. Repurpose service: GPT-4o structured output {platform: variant}
   with per-platform format instructions; series generator → bulk drafts.
5. Approval flow with permission social.approve; calendar states.
6. Nightly insights sync worker → SocialInsight; best-time heuristic
   (median engagement by weekday-hour buckets).
```

*Next: M24 — Pinterest Automation*
