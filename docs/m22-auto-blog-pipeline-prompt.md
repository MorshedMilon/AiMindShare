You are Claude Code, assisting a senior SaaS founder and web/app developer.
Your task in this session is to implement the M22 Auto-Blog Pipeline as a scaffolded, SEO-first module that is designed to rank in Google, with proper keyword clustering, topic architecture, and internal linking, but without calling any real external LLM or image provider yet.

The project context:

The manual content CMS (M22-manual) already exists with:

blog_articles table, article status enums, and publish RPCs.

A review queue and manual publish-to-M19 workflow.

The SEO Engine (M21) is already landed:

content_queue table from migration 0026 (keyword, priority, status, etc.).

Worker runtime:

worker.mjs supports claim_job() and dispatches jobs by job.type.

Jobs can enqueue follow-up jobs.

Job/type reservations:

blog.generate is reserved for auto-blog article generation.

content.pipeline.advance is reserved for cron-style pipeline advancement.

Your explicit goals for this session:

Database migration 0027 (SEO-aware, cluster-ready):

Create a content_schedules table to control per-site auto-blogging:

Fields (example):

id (PK), site_id (FK), schedule_name

frequency (daily, weekly, custom)

days_of_week, hour_of_day

brand_voice, niche, target_word_count

auto_publish (boolean)

min_seo_score, min_readability_score

max_posts_per_run

created_at, updated_at

Extend the existing content_queue table (migration 0026) with:

site_id

schedule_id (nullable FK into content_schedules)

article_id (nullable FK into blog_articles)

fail_reason (nullable text)

step (current pipeline step: e.g. queued, brief, draft, seo_scored, internal_links, published)

Widen status to support pipeline states (e.g. queued, in_progress, done, failed, skipped).

Make sure the migration files follow the existing project pattern (naming, schema helper functions, enum style).

SEO-first deterministic pipeline module (blog-pipeline.mjs):

Create a pure deterministic module that turns a keyword into a placeholder blog article, designed to mimic a real SEO workflow without external LLM calls.

Pipeline stages:

Keyword clustering & topic mapping (deterministic):

Given a seed keyword and optional site_id / schedule_id, assign it to a cluster and pillar topic using simple, local logic (e.g. string similarity / naive rules) so the rest of the system can treat clusters as real objects.

Output: {cluster_slug, pillar_slug, cluster_label, intent}.

SERP-style brief (deterministic placeholder):

Create a structured brief object with sections like:

search_intent

title_ideas

h2_sections

faqs

internal_link_targets

Use static templates and existing content-seo.mjs utilities where possible (e.g. slugify, meta generator).

Draft article scaffold (deterministic HTML):

Generate an HTML placeholder article structure:

<h1> main title

<p> intro

<h2>/<h3> sections mapped from the brief

A FAQ or Q&A block

Internal links section.

At the very top of the HTML, insert a clear HTML comment:

<!-- PLACEHOLDER: auto-generated scaffold, not real AI content. Safe for testing only. -->

SEO scoring & checks (local):

Reuse existing SEO utilities (e.g. from content-seo.mjs) to compute:

seo_score (0–100)

readability_score

On-page checks: keyword in title/H1, in first paragraph, headings, meta description.

Internal linking suggestion (local):

Based on the cluster and pillar, generate a set of internal link candidates:

Slugs or IDs of pillar/cluster articles (even if they are not yet published, use stable slugs).

Structured data (schema.org) snippet:

Produce a JSON-LD object for BlogPosting (title, description, author placeholder, date, mainEntityOfPage) to help with Google-rich results.

The module should export clear functions, for example:

compute_topic_cluster(keyword, siteId)

build_serp_brief(keyword, cluster)

build_article_html(brief, cluster)

score_article(html, keyword)

suggest_internal_links(cluster)

build_schema(keyword, htmlMeta)

All functions must be deterministic and must not call any external AI provider. No tokens are metered here.

Worker handler blog.generate (AI-ready but stubbed):

In worker.mjs (or the appropriate worker router file), add a handler for job type blog.generate.

Handler behavior:

Claim a job from content_queue where:

status = 'queued'

step = 'queued'

keyword is present.

Run the deterministic pipeline:

Get cluster + brief + article HTML + scores + internal links + schema.

Create or update a blog_articles draft:

Use existing blog_articles insert/update helpers.

Save the placeholder HTML, meta fields, schema, and cluster info.

Mark the article as status = 'draft' and attach schedule_id, site_id, seo_score, etc.

Quality gate:

Compare seo_score and readability_score against the thresholds from content_schedules.

If scores are below threshold:

Set content_queue.status = 'done', step = 'review', fail_reason = 'BELOW_THRESHOLD'.

Route the article into the review queue (M22-manual).

If scores pass and auto_publish = true:

Call existing publish RPCs to publish the article.

Set content_queue.status = 'done', step = 'published'.

If scores pass and auto_publish = false:

Set step = 'review' and send to review queue.

Stubbed AI calls:

For actual GPT article generation and DALL·E/M35 images, include clearly marked stub functions such as:

async generate_article_with_ai(promptContext) { /* TODO: wire real LLM provider here (GPT-4o / Claude / Gemini). Must meter ai_tokens. */ }

async generate_featured_image_with_ai(article) { /* TODO: wire M35 Creative Studio. Must meter image_gen. */ }

Do not call these stubs yet. They exist only as placeholders with TODO(provider) comments.

Ensure job metrics fields are ready (e.g. for future ai_tokens, image_gen) but not yet incremented.

Cron job m22-content-scheduler (keyword enqueue + clustering):

Implement a cron job or scheduled task that:

Reads content_schedules for active sites.

For each due schedule, determines how many new posts to enqueue (max_posts_per_run).

For each post:

Generates or retrieves the next keyword (from M21 SEO Engine’s keyword pool, or a simple deterministic seed list for now).

Assigns cluster and pillar info (using compute_topic_cluster).

Inserts rows into content_queue with:

keyword, site_id, schedule_id, initial status = 'queued', step = 'queued', priority.

Ensure the cron job is idempotent, safe to run repeatedly, and logs enough info for observability.

Frontend stub (m22-auto-content-cms.html) – optional in this session:

If this session includes frontend work, build a basic HTML/JS page that:

Displays a pipeline board with columns like:

Queued → Generating → Review → Published.

Shows schedule configuration from content_schedules.

Allows bulk CSV import of keywords into content_queue.

Has “Generate now” buttons (which trigger blog.generate jobs).

Displays a prominent banner:

“Auto-Blog Pipeline is in scaffold mode. No real AI or image provider is wired yet. All articles are deterministic placeholders.”

General implementation rules:

Follow the project’s existing coding style, naming conventions, and module structure.

Reuse existing utilities (especially content-seo.mjs) for slugging, meta generation, and simple scoring when possible.

Never hard-code provider-specific endpoints; everything AI-related must be stubbed and clearly marked TODO(provider) / TODO(M35).

Make sure all placeholder articles are clearly marked in the HTML and in the DB so they cannot be mistaken for real production content.

When you are done with schema and worker implementation, you must:

Update any relevant documentation files (DATA-SCHEMA, DECISIONS D-147+, JOBS/TASKS) to reflect:

content_schedules table.

Extended content_queue schema.

blog-pipeline.mjs functions.

blog.generate handler behavior.

m22-content-scheduler cron responsibilities.

Ensure the module can be tested end-to-end in “placeholder mode”:

Enqueue keyword → run blog.generate → see draft in CMS → pass/fail against thresholds → route to review or auto-publish.