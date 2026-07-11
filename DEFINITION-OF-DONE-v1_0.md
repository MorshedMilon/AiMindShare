# DEFINITION-OF-DONE-v1_0.md
### AiMindShare.com — Definition of Done
**Version 1.0 · 2026-07-02 · A module is Done when every gate below is green. Not before.**

> Attach at the end of every build session. These gates are binary — pass or fail, no "mostly."
> A module that fails any gate stays open on `TASKS.md` and its session is not closed. The gates
> encode the Constitution's nine laws plus the QuranlyAI design law as checkable facts.

---

## Gate 1 · Tenancy — the cross-tenant leak test passes

Run the leak test from `RLS-AND-SECURITY` §8 against every table and Edge Function the module
added or touched:

- [ ] Two seeded workspaces (A, B); B's staff user cannot `select/insert/update/delete` any of A's
      rows via the client SDK.
- [ ] B's user cannot reach A's data through any new Edge Function (re-auth check holds).
- [ ] B's **client**-role user cannot read another client's portal rows.
- [ ] The anon key with no session grants nothing.
- [ ] Every new table has RLS enabled + the four standard policies (or documented per-table
      overrides). Migration grep: every `create table` is paired with
      `enable row level security` + at least one `create policy`.

**One leaked row = the whole module fails.**

## Gate 2 · Roles — the matrix is enforced

- [ ] Each role (Owner / Admin / Manager / Staff / Client) can do exactly what the matrix in
      `RLS-AND-SECURITY` §2 says — verified by attempting at least one forbidden action per role
      and confirming it fails.
- [ ] Fine-grained `memberships.permissions` overrides (where the module uses them) are checked in
      the Edge Function, not just hidden in the UI.
- [ ] UI hides what a role can't do, but hiding is cosmetic — the server-side check is what's tested.

## Gate 3 · Metering — every billable action increments M03

- [ ] Every metered action in the module (SMS, email, AI tokens, enrichment, voice minutes,
      SEO calls, image/video renders) writes a `usage_events` row and upserts `usage_meters`
      **in the same transaction as the successful provider call**.
- [ ] A failed provider call bills nothing (verified by forcing a failure).
- [ ] Plan gates / quotas return `429 quota_exceeded` or `plan_gated` and the UI surfaces it.
- [ ] If the module has no billable action, state that explicitly in the session close note.

## Gate 4 · Async — jobs enqueue and complete correctly

- [ ] Every slow/scheduled/retried action is a `jobs` row; zero browser loops, zero blocking
      `await`s doing heavy work in page JS.
- [ ] Browser inserts `queued` only (attempt to insert `running` from the client → RLS rejects it).
- [ ] Worker claim, retry/backoff, and terminal `failed` behavior verified for at least one job
      type the module introduces.
- [ ] Idempotency key present on anything double-clickable or webhook-redeliverable.
- [ ] Recurring work is a `pg_cron` registry entry (added to `JOBS-AND-WORKERS-SPEC` §5), not a
      client timer.
- [ ] Heavy job types run on the real worker, never inline in an Edge Function.

## Gate 5 · Screens — all states present

For every screen the module ships (per `SCREEN-INVENTORY` once it exists; until then, per the
session's attach list):

- [ ] **Default** state with real data.
- [ ] **Empty** state (first-run, zero rows) — designed, not a blank div.
- [ ] **Loading** state — calm, token-based, **no shimmer**.
- [ ] **Error** state — envelope `error` codes mapped to human messages; retry path where sane.

These states must exist and be reachable for testing (e.g. via `state.previewState` in the
browser console), but a module must NOT render a permanent, user-visible "mockup mode" /
"not connected" banner or pill to switch between them — Gate 5 is about the states existing
and being testable, not about advertising the sample-data condition to end users. The
`connected()` fallback-data logic that lets a module run without a live backend stays; only
its always-on visible indicator does not ship *(2026-07-10, D-188)*.

## Gate 6 · Design — both themes, responsive, motion-safe

- [ ] Light theme (default) and dark theme (`[data-theme="dark"]` sibling block) both correct —
      every new component checked in both.
- [ ] Responsive at **360 / 768 / 1280** — no horizontal scroll, no clipped controls, kanban and
      tables degrade deliberately.
- [ ] `prefers-reduced-motion` respected — all non-essential animation disabled under it.
- [ ] Only token variables used (no raw hex outside `tokens.css`); three fonts only
      (Cormorant Garamond / Baskerville / Shippori Mincho — D-014); 0.5px hairlines; eyebrow labels
      at the locked tracking.

## Gate 7 · Secrets — zero client-side

- [ ] No provider key, service-role key, webhook secret, or token anywhere reachable by the
      browser (code, config, response payloads).
- [ ] New provider credentials went into Supabase Vault; tables hold references only.
- [ ] New webhooks verify signatures before acting.

## Gate 8 · Bash self-review greps — all clean

Run from the repo root at session close. **All must return zero hits** (or every hit individually
justified in the session note):

```bash
# Law 1 — dead stack
grep -rn -e 'import React' -e 'from "react"' -e 'next/' -e 'prisma' -e 'bullmq' \
  -e 'ioredis' -e '@hello-pangea' -e 'reactflow' -e 'craft.js' -e 'NextAuth' src/

# Law 3 — secrets in the front end
grep -rn -e 'sk-' -e 'sk_live' -e 'rk_' -e 'service_role' -e 'SUPABASE_SERVICE' \
  -e 'whsec_' frontend/

# Law 6 — QuranlyAI forbidden patterns
grep -rn 'shimmer' frontend/
grep -rn 'quranly\.ai' .                      # must be quranlyai.com
grep -rn '#00696e\|#00696E\|#C5A059\|#c5a059' frontend/ --include='*.css' \
  | grep -v tokens.css                        # raw brand hex outside tokens.css
grep -rn 'font-family' frontend/ --include='*.css' | grep -viE 'cormorant|baskerville|shippori|georgia|serif|inherit|var\(' # fourth font (D-014)

# Law 2 — tables without RLS (run against new migrations)
grep -L 'enable row level security' supabase/migrations/<new>*.sql
```

## Gate 9 · Docs & tasks updated in the same session

- [ ] `DATA-SCHEMA` updated if any table/column changed (new migration appended, never edited).
- [ ] `DECISIONS` entry for any deviation, however small.
- [ ] `pg_cron` registry / job-type catalog updated for any new schedule or job type.
- [ ] `INTEGRATIONS-SPEC` section added the week a new provider is first wired.
- [ ] `TASKS.md` updated: session's boxes checked, carry-overs explicit.

---

## The close ritual

A session ends with a short note in `TASKS.md`:

```
### Session N close — <module> — <date>
Gates: 1 ✅ 2 ✅ 3 ✅(no billable actions) 4 ✅ 5 ✅ 6 ✅ 7 ✅ 8 ✅ 9 ✅
Carried over: <items or "none">
DECISIONS added: <ids or "none">
```

If any gate is ❌, the module is **not Done**, the note says why, and the item carries over.

---

*AiMindShare.com · Definition of Done v1.0. Nine gates: leak test, roles, meters, jobs, screen
states, themes/responsive/motion, secrets, greps, docs. Binary, per module, every session.*
