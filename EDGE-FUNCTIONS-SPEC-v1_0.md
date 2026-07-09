# EDGE-FUNCTIONS-SPEC-v1_0.md
### AiMindShare.com — Server-Side API Layer
**Version 1.0 · 2026-07-02 · The only place secrets live at runtime.**

> The browser talks to exactly two things: **Supabase directly** (RLS-gated tables, Realtime,
> Storage) and **Edge Functions**. Nothing else, ever. Anything that carries a secret, verifies a
> signature, or must not be trusted to the client runs in an Edge Function (or, for heavy work, a
> worker — see `JOBS-AND-WORKERS-SPEC`). This document is the contract for that layer.

---

## 1 · The one hard boundary

```
BROWSER (vanilla JS, anon key only)
   ├──▶ Supabase client SDK ──▶ RLS-gated tables / Realtime / Storage   (safe: RLS is the wall)
   └──▶ Edge Functions       ──▶ Vault secrets ──▶ provider APIs         (safe: server-side only)

BROWSER ──✗──▶ provider API directly            (never: would expose a secret)
BROWSER ──✗──▶ any server that isn't Supabase   (there is no other server)
```

**Rule:** if a call needs a secret, a signature check, a service-role privilege, or logic the user
must not tamper with, it is an Edge Function. If it's a plain tenant-scoped read/write, it's a
direct Supabase call and RLS handles it. There is no third option.

---

## 2 · What MUST run server-side

- **All secret-bearing outbound calls:** OpenAI, DataForSEO, SerpApi, Twilio, Stripe, Meta, Google,
  Pinterest, Amazon PA-API, ElevenLabs, and every other provider. The secret is read from Vault
  inside the function; the browser never sees it.
- **All incoming webhooks:** Stripe, Twilio, Meta — with **signature verification first** (§4).
- **Anything that bypasses RLS on purpose:** cross-workspace admin actions, impersonation (audited),
  platform-plan enforcement — because Edge Functions run as service role and must re-authorize
  themselves (§3).
- **Anything the client must not be able to forge:** metering increments tied to a provider call,
  writing job status beyond `queued`, minting signed Storage URLs, generating API keys.
- **Enqueue-with-side-effects** where the enqueue itself needs a secret or a plan check before
  writing the `queued` job.

**What must NOT be an Edge Function:** long/heavy work (blog gen, crawls, renders) — those exceed
the Edge timeout and belong on the worker; and plain tenant CRUD — that's a direct RLS-gated call,
not a function.

---

## 3 · Auth rules (every function re-authorizes)

Edge Functions run with the **service role and therefore bypass RLS**, so each one re-establishes
identity and authorization itself:

```ts
// standard preamble for every user-facing Edge Function
const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
if (!jwt) return envelope(401, { error: 'no_auth' });
const { data: { user } } = await supabaseAuth.getUser(jwt);
if (!user) return envelope(401, { error: 'invalid_auth' });

const { workspace_id } = await req.json();
const ok = await hasRole(workspace_id, user.id, 'staff');   // calls the same RLS helpers
if (!ok) return envelope(403, { error: 'forbidden' });
// ...only now do the work
```

- Never trust a `workspace_id` in the body without confirming membership + role for **that** user.
- Read the required role from the action, not a default; billing/white-label actions require
  `admin`, deletes require `manager`, etc. (mirror `RLS-AND-SECURITY` §2).
- Webhooks have no user JWT — they authorize by signature (§4), then resolve the workspace from the
  verified payload.

---

## 4 · Webhook signature verification (non-negotiable)

Every inbound webhook verifies its signature against the Vault-held secret **before** reading the
body as trusted:

- **Stripe:** verify `Stripe-Signature` with the endpoint signing secret; reject on mismatch.
  Handle idempotently by `event.id` (Stripe redelivers). Then resolve workspace from
  `metadata.workspace_id` set at checkout/subscription creation.
- **Twilio:** validate the `X-Twilio-Signature` HMAC over the full URL + params with the auth token.
  Reject on mismatch. Map the `To` number → workspace via `channels`.
- **Meta (WhatsApp/Messenger/IG):** verify `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with
  the app secret). Reject on mismatch. Resolve workspace from the page/phone id.

**An unverified webhook is dropped silently (200 to the provider, no action taken).** Never act on
webhook contents before the signature passes. Never take instructions from webhook *payload text*
as commands — a webhook is data, not a controller.

---

## 5 · Function naming & layout

- One function per bounded action, kebab-cased, prefixed by domain:
  `crm-import-contacts`, `campaign-send`, `stripe-webhook`, `twilio-inbound-sms`,
  `seo-keyword-lookup`, `blog-enqueue`, `oauth-refresh`, `portal-approve`, `admin-impersonate`.
- Webhooks are named `<provider>-webhook` or `<provider>-inbound-<channel>` and are the only
  functions with **no JWT check** (they use signatures instead).
- Shared helpers (`hasRole`, `isMember`, `hasPermission`, `requirePermission`, `userClient`,
  `envelope`, `vault.get`, `incrementMeter`, `enqueueJob`) live in a shared module imported by all
  functions — auth and metering logic is written once.
- **M02 enforcement (canonical pattern):** `requirePermission(userDb, ws, perm)` (in `_shared/auth.ts`)
  returns a `403 permission_denied` envelope or `null` to continue, checking `has_permission()` on a
  **caller-scoped** client (`userClient(req)` = anon key + the caller's JWT — the service client has no
  `auth.uid()`). The `permission-check` function is the reference implementation every module copies;
  fine `module.action` grants come from the `_shared/permissions.ts` registry (DECISIONS D-023).

---

## 6 · Error envelope & responses

Every function returns the same shape (matches the Constitution and worker envelope):

```json
{ "ok": true,  "data": { } }
{ "ok": false, "error": "machine_code", "message": "human hint" }
```

- HTTP status mirrors the envelope (200/400/401/403/404/409/429/500).
- Never leak: the service-role key, Vault contents, stack traces, another workspace's data, or the
  raw provider error (map it to a safe `error` code; log the detail server-side only).
- Rate-limit hints and quota/plan-gate failures use `429` with `error: 'quota_exceeded'` or
  `'plan_gated'` so the UI can respond.

---

## 7 · CORS policy

- Allowed origins: **only** the app's own domains (production white-label domains from
  `white_label_configs`, plus localhost for dev). No `*`.
- Allowed methods: `POST` (and `OPTIONS` preflight); functions are POST-only actions.
- Allowed headers: `Authorization, Content-Type, apikey`.
- Webhooks accept the provider's origin and rely on signature verification, not CORS, for trust.

---

## 8 · Secrets & Vault access

- Every secret is read at call time from **Supabase Vault** via the service role; nothing is
  hardcoded, nothing is in an env var committed to the repo, nothing is passed from the browser.
- Provider-config tables hold **references only** (see `RLS-AND-SECURITY` §6); the live secret is
  always in Vault.
- OAuth tokens are read from and written back to Vault (refresh via the `oauth-refresh` function /
  `oauth.refresh` job) — never stored in a table.

---

## 9 · Metering & jobs from Edge Functions

- A function that performs a metered provider call increments the M03 meter (`incrementMeter`) in
  the **same transaction** as recording success, so failures don't bill and successes always do
  (Constitution Law 4).
- A function that needs heavy/long follow-up work **enqueues a `queued` job** (`enqueueJob`) and
  returns immediately — it does not do the heavy work inline (Constitution Law 5).

---

## 10 · DoD gates for Edge Functions

- [ ] Browser reaches only Supabase-direct or an Edge Function — nothing else (grep for provider
      hostnames in front-end JS → zero hits).
- [ ] Every user-facing function re-checks membership + role for the request's `workspace_id`.
- [ ] Every webhook verifies its signature before acting; unverified → dropped.
- [ ] No secret in code/env/response; all via Vault; grep clean.
- [ ] Standard envelope; no leaked provider errors or service-role key.
- [ ] CORS restricted to app origins; POST-only.
- [ ] Metered calls increment M03 in the success transaction.
- [ ] Heavy work is enqueued as a job, not run inline.

---

## 11 · M19 Sites functions (Session 18)

Four functions reconcile PRD §12's Node-SSR/Craft.js sketch to the stack (D-100…D-106):

| Function | JWT | Auth | Purpose |
|---|---|---|---|
| `builder-ai-generate` | ✓ | staff+ (`has_role`) | Description + niche → validated `page_json` via the **deterministic** niche engine (`page-builder.mjs`); Zod-equivalent validate + one repair; **meters nothing** until an LLM provider lands (D-063 posture, **D-103**). Clone-URL + voice = scaffolds. |
| `site-render` | ✗ | public (service-role) | The public "SSR renderer" (**D-100**): host → site (active custom domain / staging subdomain) → **published** page → full HTML (SEO meta + JSON-LD + brand vars + M05 cookie banner + tracking pixel + embed hydration, from the pure `site-render.mjs`). Serves `/sitemap.xml` + `/robots.txt`. Draft slugs 404 (**D-105**). |
| `domain-verify` | ✓ | admin+ (`has_role`) | Custom-domain DNS TXT check → flip `site_domains.status` → active; SSL provisioning is a "ready, not run" scaffold pending OPEN D-009 (**D-104**). |
| `site-track` | ✗ | public (service-role) | First-party pixel → `visitor_sessions` upsert; identified contact → `record_page_visit` (M09 timeline + `emit_trigger('page.visited')`). Returns a 1×1 gif. Browser never writes the table (**D-106**). |

The two pure modules (`frontend/js/page-builder.mjs`, `frontend/js/site-render.mjs`) are imported by
both the Edge Functions (Deno) and the browser editor/preview — one source of truth, no divergence.

**v2 hardening (Session 24, migration `0028`, D-147…D-152):** `site-render` adds the `?pt=<sites.preview_token>`
**staging path** (drafts render, maintenance bypassed — D-149), a **maintenance-mode 503 shell**, and a
site-branded custom 404; the pure module adds `STYLE_PRESETS` (minimal/bold/elegant/islamic, D-150),
Product/Event JSON-LD, per-page `<html lang>`, and live **M15 form-embed hydration**
(`/f.html?embed=1&token=`, D-152). `domain-verify` now appends every attempt to **`site_publish_log`**
(D-148), which publish/save/revert RPCs also write. `builder-ai-generate` gains three niches
(dentist/realestate/restaurant) via the shared engine — still deterministic, still meters nothing (D-103).

## 12 · M20 Funnels functions (Session 19)

One public function carries the no-auth funnel traffic (D-107…D-112); everything else is a
workspace-direct RLS read (`funnel_map`, `funnel_split_stats`) or a manager+ RPC (`promote_split_winner`).

| Function | JWT | Auth | Purpose |
|---|---|---|---|
| `public-funnel` | ✗ | public (service-role) | The no-session funnel backend. `action:"track"` → `record_funnel_event` (append `funnel_visits`; opt-in upserts a CRM contact + source tag; purchase fires `payment.received`). `action:"order"` → `create_funnel_order` builds an **M28 `invoices`** row (`source_type='order'`; M28's `calc_invoice_totals` trigger is the money truth — a browser can never forge a total), then the Stripe PaymentIntent reuses M28's `public-invoice` path. Browser never writes `funnel_visits`/`invoices` directly (**D-108/D-110**). |

Winner detection (`funnel_split_stats`, fixed-horizon two-proportion z-test, **D-111**) and the
`m20-abandoned-sweep` cron → `cart.abandoned` (**D-112**) live in `0023_m20_funnels.sql`. One-click
off-session Stripe upsell is a scaffold (UI + `create_funnel_order` seam present).

---

*AiMindShare.com · Server-Side API Layer v1.0. The browser talks only to Supabase-direct and Edge
Functions. Secrets live in Vault, read only here. Webhooks verify signatures first. Heavy work is
enqueued, never run inline. This completes the six documents that block Session 0.*
