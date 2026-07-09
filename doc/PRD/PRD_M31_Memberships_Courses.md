# PRD — M31: Memberships & Courses
**Layer:** L3 Commerce | **Priority:** P2 | **Phase:** 6
**Depends On:** M28, M19, M06, M09 | **Blocks:** —

## 1. Purpose
Kajabi/Teachable replacement: sell and deliver courses, memberships, and communities under the workspace's brand — completing the "sell → deliver → retain" loop with M20 funnels and M28 payments.

## 2. Core Features
- **Course builder:** courses → modules → lessons; lesson types: video (M06 upload or external embed, hosted playback with resume position), text (TipTap), PDF/downloads, quiz (pass threshold, retakes), assignment (file upload → instructor review); drag-reorder; draft/published per lesson.
- **Drip & prerequisites:** unlock by schedule (X days after enrollment / fixed date) or completion of prior module; locked-state UI with unlock date.
- **Offers & access:** products (one-time / subscription / payment plan via M28); bundles (multi-course); coupon support; free courses (lead magnet mode → contact + tag); enrollment via purchase, manual grant, or M13 action ("grant course access" — already a workflow node).
- **Member experience:** branded member area on M19 site domain (`/members`): login (contact-scoped auth — magic link), dashboard (my courses, progress bars, continue button), lesson player (sidebar curriculum, next/prev, notes per lesson, completion checkboxes), search.
- **Progress & completion:** per-lesson tracking; course % complete; **PDF certificates** on completion (name, course, date, branded template); completion trigger `course.completed` (M13) for upsell sequences.
- **Community (lite):** per-course discussion space — threads + replies, instructor badge, moderation (delete/pin), @mention notifications; optional standalone community product.
- **Engagement automation:** stalled-student detection (no activity X days) → `course.stalled` trigger → re-engagement sequence; new-lesson-drip notifications.
- **Instructor analytics:** enrollments, active students, completion rates per lesson (drop-off finder), quiz score distributions, revenue (via M28).
- **Affiliate option:** per-course affiliate links using M38 infrastructure.

## 3. Database Schema (Prisma)
```prisma
model Course {
  id String @id @default(uuid())
  workspaceId String; title String; slug String
  descriptionHtml String?; coverAssetId String?
  status String @default("draft"); settingsJson Json
}
model CourseModule { id String @id @default(uuid()); courseId String; title String; order Int; dripJson Json? }
model Lesson {
  id String @id @default(uuid())
  moduleId String; title String; order Int
  type String; contentJson Json // videoAssetId | html | quiz def | files
  status String @default("draft")
}
model CourseOffer { id String @id @default(uuid()); workspaceId String; courseIds String[]; pricingJson Json; slug String }
model Enrollment {
  id String @id @default(uuid())
  workspaceId String; contactId String; courseId String
  source String // purchase|manual|automation
  status String @default("active"); enrolledAt DateTime @default(now())
  @@unique([contactId, courseId])
}
model LessonProgress {
  enrollmentId String; lessonId String
  completedAt DateTime?; positionSec Int?
  notes String?
  @@id([enrollmentId, lessonId])
}
model QuizAttempt { id String @id @default(uuid()); enrollmentId String; lessonId String; score Int; passed Boolean; answersJson Json; createdAt DateTime @default(now()) }
model CommunityThread { id String @id @default(uuid()); courseId String; contactId String?; userId String?; title String; body String; pinned Boolean @default(false); createdAt DateTime @default(now()) }
model CommunityReply { id String @id @default(uuid()); threadId String; contactId String?; userId String?; body String; createdAt DateTime @default(now()) }
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| CRUD | /api/courses (+modules, +lessons, +offers) | Authoring |
| POST | /api/enrollments (+manual grant) | Enrollment (also M13 handler + M28 purchase hook) |
| GET | /api/member/courses (+/:id/curriculum) | Member area (contact session) |
| POST | /api/member/lessons/:id/progress \| /complete | Tracking |
| POST | /api/member/quiz/:lessonId/attempt | Quiz |
| CRUD | /api/member/community/* | Threads/replies |
| GET | /api/courses/:id/analytics | Instructor stats |
| GET | /api/member/certificates/:courseId | PDF cert |

## 5. UI
- /courses (admin): course cards; builder (curriculum tree left, lesson editor right); offers tab; analytics tab
- Member area (public, branded): /members login, dashboard, /members/course/[slug] player (video with resume, curriculum sidebar, notes, community tab)

## 6. Acceptance Criteria
- [ ] Purchase via M28 offer auto-enrolls; manual + automation grants work
- [ ] Drip locks honored; prerequisite gating verified
- [ ] Video resume position persists; completion updates progress + fires course.completed at 100%
- [ ] Quiz pass/fail with threshold + retakes; assignment upload reaches review queue
- [ ] Certificate PDF generated with correct name/date
- [ ] Community posts notify instructor; moderation works
- [ ] Member auth is contact-scoped and workspace-isolated (no CRM user access)

## 7. Claude Code Prompt — M31
```
Build Module M31 (Memberships & Courses). M28/M19/M06/M09/M13 exist.
1. Prisma models per PRD.
2. Member auth: separate contact-session (magic link to contact email,
   signed member JWT scoped {contactId, workspaceId}) — completely
   distinct from platform user auth.
3. Authoring UI: curriculum tree (dnd), lesson editors per type
   (video via AssetPicker w/ HLS-ready playback, TipTap text, quiz
   builder, files), drip config, offer builder wired to M28
   products/payment links.
4. Purchase hook: M28 payment.received with offer metadata →
   enrollments. Register M13 handlers grant_course_access +
   course.completed / course.stalled triggers (stalled = nightly scan).
5. Member area on M19 site rendering (theme-aware): dashboard, player
   with position beacon, notes, completion, certificates (puppeteer PDF).
6. Community endpoints + UI tab with moderation + mention notifications.
7. Analytics queries incl. per-lesson drop-off funnel.
```

*Next: M32 — Conversational Commerce*
