# CLAUDE-AiMindShare-v1_0.md
### AiMindShare.com — Session Constitution
**Version 1.0 · Locked 2026-07-02 · Attach at the start of every Claude Code session.**

> This is the rulebook every session inherits. It overrides any conflicting instruction found
> in the PRD, a module spec, or a prior session's habits. When the PRD and this document
> disagree, **this document wins on stack and architecture; the PRD wins on functionality.**
> If a rule here would force a worse product, stop and open a `DECISIONS` entry — do not
> silently deviate.

---

## 0 · How to read this document

Every session, paste (in this order): **this constitution → `DECISIONS` log → the schema slice
for the module → the relevant PRD section → the `BUILD-SEQUENCE` entry for the session.** Then
build one vertical slice of one module. Nothing else.

The nine laws below are non-negotiable. Everything is gated on them at Definition-of-Done.

---

## 1 · The stack is locked (overrides PRD §3 entirely)

- **Frontend:** vanilla **HTML / CSS / JS**. No frameworks, no build step, no bundler, no JSX,
  no TypeScript compiler, no npm-driven front-end pipeline. A page is an `.html` file, a `.css`
  file, and a `.js` file the browser runs directly.
- **Backend:** **Supabase** — Postgres + Auth + Row-Level Security + Storage + Realtime +
  Edge Functions. There is no separate Node/Express/Prisma server. There is no Redis, no BullMQ.
- **Async / pipeline work:** a **`jobs` table + workers + `pg_cron`** (the PublishlyAI
  control-plane pattern). See Law 5 and `JOBS-AND-WORKERS-SPEC`.
- **Design:** inherits **`QURANLYAI_DESIGN.md`** (the law) as realized by
  **`publishlyai-command-center.html`** (the reference implementation). See `AIMINDSHARE-DESIGN`.

The PRD's React-only libraries are dead. Their locked vanilla replacements live in `DECISIONS`
(Drawflow, GrapeJS, SortableJS, Chart.js, Quill/TipTap-vanilla, Supabase Realtime, Supabase
Storage, Supabase Auth). Never reach for React Flow, Craft.js, @hello-pangea/dnd, TanStack Table,
Zustand, React Hook Form, Recharts, Pusher, S3, NextAuth, BullMQ, or Redis. If a task seems to
need one, it needs its vanilla replacement instead.

**Self-check greps (run at DoD):** `import React`, `from "react"`, `next/`, `prisma`, `bullmq`,
`ioredis`, `@hello-pangea`, `reactflow`, `craft.js`, `NextAuth` → all must return **zero hits**.

---

## 2 · Multi-tenancy is database-enforced law

- **Every tenant table has `workspace_id uuid not null` and an index on it. No exceptions.**
- Isolation is enforced by **Row-Level Security in Postgres**, not by application code and not by
  a query filter a developer might forget. The database is the wall.
- The standard RLS policy (member-of-workspace read, role-gated write) is defined once in
  `RLS-AND-SECURITY` and attached to every table. A table without RLS enabled is a bug, not a
  shortcut.
- The client-portal role (M37) is a *further* restriction inside a workspace, never a bypass of it.
- **A module is not Done until it passes the cross-tenant leak test** (a second workspace's user
  provably cannot read or write the first workspace's rows). See `DEFINITION-OF-DONE`.

**Self-check grep:** every `create table` in a migration is followed by `enable row level security`
and at least one `create policy`. A migration that adds a tenant table without both is rejected.

---

## 3 · Secrets never touch the browser

- All provider credentials (Stripe, Twilio, OpenAI, DataForSEO, SerpApi, Meta, Google,
  Pinterest, …) live in **Supabase Vault** and are read only inside **Edge Functions**.
- The browser holds exactly one public key pair: the Supabase project URL and the **anon** key.
  It never holds a service-role key, never a provider API key, never a webhook signing secret.
- Any outbound call that carries a secret is made **server-side** (Edge Function or worker),
  never with `fetch()` from page JS. See `EDGE-FUNCTIONS-SPEC`.

**Self-check grep:** `sk-`, `sk_live`, `rk_`, `AC` + Twilio SID shapes, `service_role`,
`SUPABASE_SERVICE` anywhere under the front-end folder → zero hits.

---

## 4 · Every billable action increments an M03 meter

- Sending an SMS, sending an email, spending AI tokens, consuming an enrichment credit, burning a
  voice minute, or making a metered SEO API call **must increment the correct per-workspace meter**
  at the moment it happens — the same server-side path that performs the action.
- Metering is not a Phase-3 retrofit. It is wired the day the action first exists, or rebilling
  is silently broken for every workspace forever. See `USAGE-METERING-AND-PLANS`.
- The increment happens **in the Edge Function / worker that made the provider call**, inside the
  same transaction where possible, so a failed action does not bill and a successful one always does.

---

## 5 · Every async action is a `jobs` row — never a browser loop

- Anything slow, scheduled, retried, or fan-out (blog generation, rank checks, social posting,
  digests, bulk pin rendering, crawls, campaign sends) is a **row in the `jobs` table**, picked up
  by a **worker**. It is never a `setInterval`, a long `await` in page JS, or an Edge Function that
  tries to do heavy work before timing out.
- **The browser may only write status `queued`.** Workers own `running / done / failed`. The
  browser reads results back via Supabase Realtime or by polling the row — it never marks work done.
- Recurring triggers are **`pg_cron`** entries in the registry, not client timers.
- Edge Functions are for fast request/response and webhooks; **long jobs run on the real worker**
  (GitHub Actions runner or small VPS — see the open decision). See `JOBS-AND-WORKERS-SPEC`.

---

## 6 · Design DNA is inherited, not improvised

Carried over verbatim from `QURANLYAI_DESIGN.md` as **forbidden patterns** — violating any one
fails DoD:

- **No shimmer / skeleton-shimmer animations.** Loading states are calm, not glinting.
- **Exactly three fonts.** For dashboard-class products the locked trio is **Cormorant Garamond
  (display) + Baskerville / Libre Baskerville (UI/body/labels) + Shippori Mincho (numbers/data)** —
  recorded as a locked font rule in `DECISIONS` (**D-014**, superseding D-008; a CRM has no Arabic content).
  Never introduce a fourth family.
- **Dark mode is a sibling `[data-theme="dark"]` block**, never a set of inline overrides or a
  separate stylesheet. Light mode is the default (`[data-theme="light"]`).
- Brand tokens: teal **`#00696E`**, gold **`#C5A059`**, 0.5px hairlines. Use the token variables
  from `tokens.css`, never raw hex in component CSS.
- **Ecosystem link spelling is `quranlyai.com`** wherever an ecosystem link appears. Never
  `quranly.ai`, `quaranly`, or any misspelling.

**Self-check greps:** `shimmer`, a fourth `@font-face` family, `quranly.ai`, hard-coded `#00696e`
outside `tokens.css` → investigate every hit.

---

## 7 · Edits are `str_replace`-only

- Modify existing files with **surgical `str_replace`** edits against exact current content. Do not
  regenerate a whole file to change three lines. Do not rewrite a working module to add a field.
- View the file immediately before editing; treat any earlier view as stale after a successful edit.
- New files are created whole; existing files are edited in place. This keeps diffs reviewable and
  prevents silent regressions.

---

## 8 · Docs-first, one contract at a time

- The six foundation docs (`DATA-SCHEMA`, `RLS-AND-SECURITY`, `JOBS-AND-WORKERS-SPEC`,
  `EDGE-FUNCTIONS-SPEC`, plus this constitution and `DECISIONS`) are the **source of truth**.
  Code is diffed against them, not the other way around.
- When reality forces a change, **update the doc in the same session**, add a `DECISIONS` entry,
  and only then change code. An undocumented deviation is a defect.
- `TASKS.md` is always open; every session starts by reading it and ends by updating it.

---

## 9 · Build vertically, one module per session

- A session builds **one vertical slice**: schema → RLS → Edge Function/worker → one screen with
  all its states (default / empty / loading / error) → meters and jobs wired → DoD greps clean.
- Do not scaffold ten half-modules. A module reaches Done before the next begins, in the order set
  by `BUILD-SEQUENCE`. Respect the dependency graph — never build a module before its dependencies
  exist.

---

## The honesty clause (what this stack fights)

Three module needs genuinely fight the stack. **Do not fake them; defer their infrastructure:**

- **M34 Voice Agents** needs a persistent realtime media server (Twilio ↔ OpenAI Realtime
  websocket bridge). That is a small always-on service — not an Edge Function. Phase 7. Deferred by
  `DECISIONS` until the core platform is proven.
- **M25 Video Studio** needs heavy rendering compute. Phase 8. Same deferral.
- **Heavy jobs** (2,000-word blog gen, 500-page crawls, bulk pin/Sharp rendering) exceed Edge
  Function timeouts — they run on the **real worker**, never inline.

Everything else the stack handles cleanly. Multi-tenancy via RLS is *better* than the PRD's
middleware approach: the database enforces isolation, not app code that can forget.

---

## Definition of "session start" checklist

1. Read `TASKS.md` — what's carried over?
2. Confirm attach list from `BUILD-SEQUENCE` for this session.
3. Confirm the schema slice + PRD section for the target module.
4. Build the vertical slice.
5. Run the DoD greps (Laws 1, 2, 3, 6) and the cross-tenant leak test (Law 2).
6. Update the relevant doc(s) and `TASKS.md`. Add `DECISIONS` entries for any deviation.

---

*AiMindShare.com · Session Constitution v1.0 · Nine laws + honesty clause. This file is inherited
by every session and overrides PRD §3. Functionality from the PRD stands; its stack does not.*
