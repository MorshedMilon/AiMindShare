# JOBS-AND-WORKERS-SPEC-v1_0.md
### AiMindShare.com — Async Contract
**Version 1.0 · 2026-07-02 · The PublishlyAI control-plane pattern, formalized.**

> Replaces BullMQ + Redis entirely. Every slow, scheduled, retried, or fan-out action is a row in
> `public.jobs`, claimed by a worker. The browser never loops, never blocks, never marks work done.
> This document is the contract between the three parties: **the browser (enqueues), Postgres
> (holds state), and workers (do the work).**

---

## 1 · The `jobs` table (canonical shape)

Defined in `DATA-SCHEMA` migration 0002. Key columns and who owns them:

| Column | Written by | Notes |
|---|---|---|
| `id`, `workspace_id`, `type`, `payload` | **browser** (or Edge Fn) at enqueue | `type` is a dotted verb, e.g. `blog.generate` |
| `status` | see §2 | browser may only set `queued` |
| `priority`, `run_after`, `idempotency_key` | enqueuer | scheduling + dedupe |
| `attempts`, `max_attempts` | worker | retry accounting |
| `locked_by`, `locked_at` | worker | claim lease |
| `result`, `error`, `done_at` | worker | terminal payload |

`type` registry lives in §6. `payload` is validated by the worker for that `type` before running.

---

## 2 · Status ownership (the core rule)

```
                 ┌─────────┐   worker claims   ┌─────────┐  success  ┌────────┐
  browser  ───▶  │ queued  │ ────────────────▶ │ running │ ────────▶ │  done  │
  (only!)        └─────────┘                    └─────────┘           └────────┘
                      ▲                              │ failure
                      │      backoff (run_after)     ▼
                      └──────────────────────── ┌─────────┐  attempts exhausted  ┌────────┐
                                                │ failed  │ ───────────────────▶ │ failed │
                                                └─────────┘   (terminal)         └────────┘
```

- **The browser (or an Edge Function acting for it) inserts rows with `status = 'queued'` only.**
  RLS forbids the browser from inserting any other status or from updating a job. This is enforced,
  not trusted (see `RLS-AND-SECURITY` §3, `jobs` overrides).
- **Workers own the rest.** A worker moves `queued → running` on claim, then `running → done` or
  `running → failed`. Only the service role (workers) may update a job.
- **The browser reads results back** via **Supabase Realtime** on the `jobs` row (or a short poll
  as fallback) — it never writes `done`, never writes `result`.

---

## 3 · Claiming a job (atomic, no double-run)

Workers claim with a single atomic statement so two workers never grab the same row:

```sql
update public.jobs
set status = 'running', locked_by = $worker_id, locked_at = now(),
    attempts = attempts + 1, updated_at = now()
where id = (
  select id from public.jobs
  where status = 'queued' and run_after <= now()
  order by priority desc, run_after asc
  for update skip locked
  limit 1
)
returning *;
```

`for update skip locked` is what makes this safe under concurrency. A stale lease (worker died
mid-run: `status='running'` and `locked_at < now() - interval '15 min'`) is reclaimed by a
`pg_cron` sweeper back to `queued`.

---

## 4 · Retry, backoff, idempotency

- **Retry:** on failure, if `attempts < max_attempts`, set `status='queued'` and
  `run_after = now() + backoff(attempts)`; else set `status='failed'` terminally and write `error`.
- **Backoff:** exponential with jitter — `run_after = now() + least(1h, 30s * 2^attempts) ± jitter`.
- **Idempotency:** an enqueuer may set `idempotency_key`; the unique index
  `(workspace_id, type, idempotency_key)` makes a duplicate enqueue a no-op. Use for anything a
  user could double-click (send campaign, generate article) or a webhook could redeliver.
- **Exactly-once side effects:** where the work has an external side effect (charge, send, post),
  the worker records the provider's response id in `result` and checks for it before retrying, so a
  retry after a partial success does not double-send. Metered actions increment M03 **inside** the
  same transaction as recording success (Constitution Law 4), so a failed job never bills.

---

## 5 · `pg_cron` registry (recurring triggers)

Recurring work is `pg_cron` entries that **enqueue jobs** — cron never does the work itself, it
just inserts `queued` rows for workers to claim. Registry (add here when a module needs a schedule):

| Schedule | Enqueues | Module | Purpose |
|---|---|---|---|
| `*/1 * * * *` | claim sweep + stale-lease reclaim | core | keep the queue moving |
| `*/5 * * * *` | `social.post` due, `campaign.send` due | M23/M16 | fire scheduled posts/sends |
| `0 * * * *` | `appointment.remind` | M14 | hourly reminder pass — **built (S12)** as `m14-appointment-remind` → `enqueue_due_reminders()` (enqueues one idempotent job per due unsent `appointment_reminders` row) |
| `0 3 * * *` | `rank.check` per tracked keyword | M21 | daily rank tracking — **built (S21)** as `seo-rank-check-daily` → `enqueue_due_rank_checks()` (one idempotent job per active tracked keyword) |
| `0 6 * * 1` | `report.weekly`, `rank.report`, `insights.digest` | M40/M21/M36 | weekly digests — M21 **built (S21)** as `seo-rank-report-weekly` → `enqueue_weekly_rank_reports()` (one job per workspace with active trackers) |
| `0 2 * * *` | `enrichment.refresh`, `oauth.refresh` | M10/M41 | nightly maintenance |
| `*/10 * * * *` | `content.pipeline.advance` | M22 | move blog queue forward |
| `17 3 * * *` | trial-expiry sweep (direct `billing_state` flip) | M03 | lapsed trials → `trial_expired` (read-only) |
| `0 * * * *` | `notification.digest` per workspace (`m04-digest-enqueue`) | M04 | hourly sweep; enqueue for workspaces at **local 8am** (tz from `workspaces.branding`, **UTC default until M07** — D-030) with ≥1 daily/weekly-digest member. Enqueue only — **sender stubbed until D-011**. Idempotent per (ws, day). |
| `0 * * * *` | `integration.health_check` per connected integration (`integration-health-check-hourly`) | M41 | hourly connection health ping; enqueues one job per connected/errored **workspace** integration (platform rows deferred — `jobs.workspace_id` is NOT NULL, D-034). Hour-bucket idempotency key. |
| `17 3 * * *` | `contact.dedupe_scan` per workspace (`crm-dedupe-scan-daily`) | M09 | daily duplicate scan; enqueues one job per workspace with live contacts. Day-bucket idempotency key `dedupe:<ws>:<YYYY-MM-DD>`. |
| `0 6 * * *` | `automation.date_sweep` per workspace (`m13-date-trigger-sweep`) | M13 | daily sweep; enqueues one job per workspace with an active `date.scheduled` workflow. Day-bucket idempotency key `automation-datesweep-<ws>-<YYYY-MM-DD>`. Full birthday/scheduled-date matching rides on M09 date fields (D-047) — schedule + hook ship now, honest deferral. |
| `15 6 * * *` | overdue-invoice sweep (direct `status` flip via `sweep_overdue_invoices()`) (`m28-overdue-sweep`) | M28 | daily; flips live invoices (`sent`/`viewed`/`partial`) past `due_date` → `overdue` so the revenue rollups show the aging slice. Inline set-based flip (like M03's trial-expiry) — no job enqueued. The configurable reminder schedule + late fees defer (D-074). |
| `*/1 * * * *` | impersonation expiry sweep (direct `ended_at` flip via `m44-impersonation-expiry-sweep`) | M44 | ends any `impersonation_sessions` past `expires_at` (the server-side 30-min guarantee even if the client never calls end) and writes one dual-identity `impersonate.expire` row to `admin_audit_log` per closed session. Inline set-based flip (like M03/M28) — no job enqueued (D-080). |
| `20 * * * *` | abandoned-funnel-order sweep (direct `cart.abandoned` emit via `sweep_abandoned_funnels()`) (`m20-abandoned-sweep`) | M20 | hourly; order invoices (`source_type='order'`) unpaid past the funnel's `abandon_hours` (default 1h) → `emit_trigger('cart.abandoned')` for M13 recovery sequences. Idempotent via an `abandoned` `funnel_visits` marker (`order:<invoice>`) so a redelivery never re-fires. Inline emit (like M28's sweep) — no job enqueued (D-112). One-click off-session upsell defers (scaffold). |
| `0 3 * * *` | storage-GB recompute per workspace (direct gauge set via `recompute_storage_meter()`) (`m06-storage-meter-nightly`) | M06 | nightly; **SETs** (not increments) each workspace's current-period `storage_gb` `usage_meters` row = Σ live-asset `bytes` / GB — a **gauge**, so a re-run overwrites rather than doubling. Revives the dormant `storage_gb` meter kind (0000). Inline set-based recompute (like M03's trial-expiry) — no job enqueued (D-119). |
| `*/15 * * * *` | scheduled-article publish (direct status flip via `publish_due_articles()`) (`m22-scheduled-publish`) | M22 | **manual slice (S22)**; publishes every `blog_articles` row `status='scheduled'` past its `scheduled_at` — per-row `_m22_publish` builds Article JSON-LD server-side, flips to `published`, stamps `published_at`, fires `article.published`. Inline set-based flip (like M28/M20/M06 sweeps) — no job enqueued (D-127). Distinct from the row-104 auto-blog `content.pipeline.advance` (S23). |

Each cron function is small: `insert into jobs (workspace_id, type, payload) select …`. It respects
per-workspace plan limits and rebilling before enqueuing metered work. A few sweeps are trivial
set-based state flips done inline (like the core stale-lease reclaim and M03's trial-expiry sweep) —
no worker needed, since there is no per-row provider work to enqueue.

---

## 6 · Job `type` catalog + where each runs

Two runtimes: **Edge Functions** (fast, <~30s, request/response + light jobs) and the **real
worker** (long/heavy — GitHub Actions runner or small VPS, **D-010 open**). Choose by duration.

| `type` | Runtime | Meter | Notes |
|---|---|---|---|
| `workspace.provision` | worker | — | M01. Enqueued by `create_workspace`; seeds `workspaces.settings` defaults (notification prefs + sender placeholder) and — since M11 (D-052) — a **default pipeline + 5 stages** (idempotent, only when the workspace has none). Owner membership is created **synchronously** in the RPC, not here. **Calendar (M14) / 5 starter tags (M09) remain deferred** (Law 9); those modules extend this handler. Deferral is logged, never faked (DECISIONS D-020). Idempotency key `workspace.provision:<ws>`. |
| `email.send`, `sms.send` | Edge Fn | email / sms | per-recipient; idempotent |
| `campaign.send` | worker (fan-out) | email/sms | expands to many `*.send` jobs |
| `blog.generate` | **worker** | ai_tokens, image_gen | 2,000-word gen exceeds Edge timeout |
| `content.pipeline.advance` | Edge Fn | — | orchestrates blog stages |
| `rank.check` | worker | seo_calls | DataForSEO/SerpApi; batched; M21 built S21 |
| `rank.report` | worker | — | weekly rank digest → SendGrid; M21 built S21 (send carried) |
| `seo.audit.crawl` | **worker** | seo_calls | 500-page crawl — heavy; M21 chunked+resumable (self-re-enqueue, D-131) |
| `social.post` | Edge Fn | — | one provider call |
| `pin.render` | **worker** | image_gen | Sharp.js bulk image render |
| `enrichment.run` | worker | enrichment | provider call per contact/company |
| `appointment.remind` | Edge Fn | sms/email | reminder send — **built (S12)**: worker → `appointment-remind` Edge Fn; **SMS live** (M12 Twilio + consent + meter `sms`), **email stubbed until D-011**; marks `appointment_reminders.sent_at` (D-066) |
| `review.request` | Edge Fn | sms/email | timed request |
| `report.weekly` / `insights.digest` | worker | ai_tokens | aggregate + AI summary |
| `notification.digest` | worker | (email) | M04. Enqueued hourly by `m04-digest-enqueue` for workspaces at local 8am with a daily/weekly-digest member; groups that user's unread notifications into one email. **Sender stubbed until D-011** — the job lands in `jobs` now (schedule proven); no handler ships Session 6. Idempotency key `digest-<ws>-<local-date>`. |
| `video.render` | **heavy worker** | video_render | M25 — infra deferred (D-013) |
| `voice.session` | **persistent service** | voice_minutes | M34 — not a job; deferred (D-013) |
| `oauth.refresh` | Edge Fn | — | writes token back to Vault. **M41 adopts the name `integration.refresh_token`** (INTEGRATIONS-SPEC §5) for this; same concept, one job type. |
| `automation.execute` | **worker** | (email/sms/ai when live) | M13. The node-walker (`workers/automation.mjs`): resumes an execution from `current_node_id` on the **version-pinned** graph, runs each node via a typed handler, logs one `workflow_execution_steps` row per node. A **WAIT** node re-enqueues this same type with `run_after = now + delay` (the delay mechanism). Enqueued by `emit_trigger()` (bus) or `automations-test` (sandbox). Real sends are **stubbed until their provider lands** — no meter fires (Gate-3). Idempotency key `automation-exec-<execution_id>` (+ `automation-resume-<execution_id>-<node>-<n>` for resumes). |
| `automation.date_sweep` | worker | — | M13. Daily hook enqueued by `m13-date-trigger-sweep`; emits `date.scheduled` enrolments. Date matching deferred to M09 date fields (D-047) — hook active, honest no-op today. |
| `integration.health_check` | worker | — | M41. Enqueued hourly by `integration-health-check-hourly` per connected/errored **workspace** integration; runs the provider's cheap status call → updates `last_health_check`/`status`/`last_error`. Per-provider ping map is just-in-time (§8). Platform (null) rows deferred (D-034). Hour-bucket idempotency key. |
| `integration.refresh_token` | worker | — | M41. Refreshes oauth2 tokens expiring <24h → writes back to Vault; failure → `needs_reauth` + M04 notify. **Scaffolded** — no oauth2 provider connected in the Session-5 slice; each provider's session activates it (D-034). |
| `contact.import` | worker | — | **M09 (Session 8). Built.** Enqueued by `contacts-import` after it records a `contact_imports` row. Maps CSV rows → contacts and upserts by email within the workspace (chunked, up to 10k rows), tracking inserted/updated/failed + a row-level `error_report` on the `contact_imports` row. Optional `consent_attested` writes an `email_optin` consent record per new contact (M05). Idempotency key `contact.import:<import_id>`. |
| `contact.dedupe_scan` | worker | — | **M09 (Session 8). Built.** Enqueued daily by `crm-dedupe-scan-daily` (or on demand). Calls the `dedupe_scan(ws)` SQL function — email-exact (1.0) + normalized-phone-exact (0.9) pairs into `contact_duplicates`; idempotent (ON CONFLICT). Fuzzy-name via pg_trgm `similarity()` is a logged follow-up (D-045). |
| `gdpr.export` / `gdpr.erase` | worker | — | **M05 (Session 7). Built.** Enqueued by `gdpr-request` (or a browser `queued` insert) on data-subject intake. `gdpr.export` (access/rectify) walks every BUILT module's tables for the subject, assembles a portable JSON bundle, writes it to `gdpr_requests.export_url` + flips `status='completed'`. `gdpr.erase` (delete) anonymises the subject's PII across built modules while **keeping legally-required financial records** (scrubs `consent_records.evidence`, retains the consent decision as legal proof). Unbuilt-module cascade (contacts M09, messages M12, deals M11) is listed in the result `deferred[]`, folded in as they land — never faked (D-040). Idempotency key `gdpr:<request_id>:export|erase`; retry/backoff via the shared `fail()`. No Twilio SDK in this path. |
| `media.autotag` | worker → Edge Fn | (ai_tokens) | **M06 (Session 20). Built.** Enqueued by `register_media_asset` on **image** upload (non-images get `tag_status='skipped'`, no job). The worker invokes the `media-autotag` Edge Fn, which writes `ai_tags` + an `alt_text` draft and flips `tag_status` (`done`; `failed` after max attempts → grid shows an honest "untagged"). The **vision provider is a labelled scaffold** (deterministic filename/kind tags) until a provider is decided (D-117, like M13 D-063) — `meter_increment('ai_tokens')` fires **only** on a real provider call (Gate 3 clean until then). Idempotency key `media:autotag:<asset_id>`. |

---

## 7 · Capability table — honest about the stack (the honesty box)

| Need | Verdict | How |
|---|---|---|
| CRM, pipeline, inbox, forms, campaigns, calendar, payments, portal, analytics | **Handles cleanly** | Edge Fns + jobs + Realtime |
| Sites/funnels, SEO research, social/Pinterest scheduling | **Handles cleanly** | GrapeJS vanilla; `pg_cron` + jobs |
| 2,000-word blog generation | **Needs a real worker** | Edge Fns time out; run on GitHub Actions runner |
| 500-page site crawls | **Needs a real worker** | long-running; heavy IO |
| Bulk pin image rendering (Sharp.js) | **Needs a real worker** | CPU/render heavy |
| Video rendering (M25) | **Fights the stack — defer** | heavy render compute; P3/Phase 8; D-013 |
| Voice agents (M34) | **Fights the stack — defer** | persistent realtime media server (Twilio ↔ OpenAI Realtime websocket bridge); a small always-on service, not a job; P2/Phase 7; D-013 |

**Rule:** if a `type` is marked *worker* or *heavy worker*, it must never be attempted inside an
Edge Function "just to ship it." Faking heavy work in an Edge Function produces silent timeouts and
half-done side effects. Defer honestly; don't fake.

---

## 8 · Enqueue example (browser → Edge Fn → job)

```js
// browser: never touches secrets, only inserts a queued job (RLS-gated)
const { data, error } = await supabase.from('jobs').insert({
  workspace_id: WS, type: 'blog.generate',
  payload: { keyword: 'best crm for agencies', site_id: SITE },
  idempotency_key: `blog:${SITE}:best-crm-for-agencies`
}).select().single();

// browser then subscribes for the result — does not poll-block, does not mark done
supabase.channel(`job:${data.id}`)
  .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${data.id}` },
      ({ new: job }) => { if (job.status === 'done') render(job.result); })
  .subscribe();
```

---

## 9 · DoD gates for anything async

- [ ] Work is a `jobs` row, not a browser loop or a blocking `await`.
- [ ] Browser inserts `queued` only; RLS proves it can't insert anything else.
- [ ] Worker claim uses `for update skip locked`.
- [ ] Retry/backoff + `max_attempts` set; terminal `failed` writes `error`.
- [ ] Idempotency key on anything double-clickable or webhook-redeliverable.
- [ ] Metered work increments the M03 meter in the success transaction.
- [ ] Recurring work is `pg_cron` enqueuing jobs, not a client timer.
- [ ] Heavy/persistent needs (blog gen, crawl, render, voice) run on the worker/service, never an
      Edge Function.

---

*AiMindShare.com · Async Contract v1.0. Browser enqueues `queued`; Postgres holds state; workers
own `running/done/failed`; `pg_cron` schedules; heavy and persistent work is deferred honestly.*

---

### §5/§6 update — M16 Campaigns job types + crons (Session 17)
**Job types** (worker handlers in `workers/worker.mjs`, all `queued`-only from any client, idempotency-keyed):
- `campaign.send` — **fan-out** (pre-registered §6): resolve audience minus suppressions minus opt-outs →
  `meter_check('email',n)` gate → one `send_events` row per recipient → throttled `email.deliver`/`sms.deliver`
  batches (`run_after` staggered by `throttle_per_min`); A/B splits two samples + a `campaign.ab_winner` at +4h.
- `email.deliver` — one batch → SendGrid (`_shared/email.ts` shape, inlined in the worker) → `meter_increment('email',1)`
  on success (a failed/`sendgrid_unconfigured` send bills nothing and retries via backoff).
- `sms.deliver` — one batch → M12 `inbox-send` contract (A2P + consent + `meter('sms')`).
- `sequence.step` — one drip step for one enrollment: exit checks → send → advance → schedule the NEXT step as a
  `run_after`-delayed `sequence.step` (the D-061 WAIT pattern) or complete.
- `campaign.ab_winner` — pick the higher-opens subject → send the remainder.

**pg_cron** (registered in `0024_m16_campaigns.sql`, PGlite-guarded): `m16-broadcast-dispatch` (`* * * * *` →
`dispatch_scheduled_broadcasts()` — fire due scheduled broadcasts) · `m16-sequence-tick` (`0 * * * *` →
`tick_due_enrollments()` — reconciliation backstop for slipped enrollments). Cron only enqueues; it never sends.

### §6 update — M19 Sites job type (Session 18)

- `site.ssl_provision` — **Edge Fn / worker · SCAFFOLD (D-104).** Issue/renew a TLS certificate for a verified
  custom domain (`site_domains.ssl_status`). **Not wired** — live certificate issuance (Caddy on-demand TLS /
  Cloudflare SaaS) is blocked by OPEN **D-009** (hosting). `domain-verify` flips a domain to `active` and leaves
  `ssl_status='pending'` with a logged note; **no `pg_cron` is registered** and nothing provisions. When D-009
  lands, `domain-verify` enqueues this job and a renewal cron is added. Publishing itself (`publish_page`) is a
  synchronous SECURITY DEFINER RPC — no async. The first-party pixel (`site-track`) writes synchronously
  service-role; there is no heavy M19 job in the built slice.

### §5/§6 update — M15 Forms & Surveys (Session 16)

- **`form.submitted` bus source is now LIVE.** M13's `emit_trigger` registered `form.submitted` as an honest stub
  source (D-062, Session 11); M15's `submit_form()` now **fires it live** on every completed submission (and on
  double-opt-in confirm), enrolling matching M13 workflows that run as existing `automation.execute` jobs. No new
  job type and no new `pg_cron` — **submission is synchronous** (the `public-form` Edge Fn + the `submit_form`
  SECURITY DEFINER RPC do the work inline, like a booking; the browser never writes submissions/views).
- **`workspace.provision` now seeds a starter form.** The M01 provision handler (`workers/worker.mjs`) gains an
  idempotent step: when the workspace has **no** forms, it inserts a published **"Contact Us"** form
  (name→`map_to:name`, email→`map_to:email`, message, + a marketing-consent field carrying its exact wording;
  `settings_json.source_tag`). Only when empty — same guard/posture as the M11 default-pipeline seed (D-052).
  Deferral of nothing new; the `starter tags (M09)` line stays deferred. Idempotency key unchanged.
