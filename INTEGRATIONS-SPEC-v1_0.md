# INTEGRATIONS-SPEC-v1_0.md — AiMindShare Integrations & Credential Vault
### Doc 12 of 14 · **Version 1.0 (skeleton) · 2026-07-02**
**The vault-and-connection contract for every external provider. Vault rules are day-one and
LOCKED; per-provider sections are added just-in-time (the week a provider is first wired).**

> **Session 5 adoption (2026-07-04):** §1–§6 are **IN FORCE** as of the M41 Credential Vault slice —
> implemented by Migration `0010_m41_integrations.sql` (the `integrations` table + RLS +
> `is_platform_admin()` + hourly health cron), the provider registry `_shared/providers.ts` (§7, all
> 20 providers) mirrored by `frontend/js/providers.js`, `_shared/integrations.ts` (`resolveCredential`
> + §3 Vault naming + typed errors, Law 4), and the four Edge Functions `integrations-connect` /
> `-callback` / `-test` / `-disconnect`. Slice cut per DECISIONS **D-031…D-035**: api_key connect is
> live; generic OAuth2 connect/callback is **scaffolded** (live Google/Meta at M12/M14); health is the
> full async mechanism; `integration.refresh_token` is scaffolded. §8 per-provider sections remain
> empty on purpose (just-in-time). Public API / webhooks / api_keys (§6 outbound, Phase-7 items) stay
> deferred to Session 42.
>
> **Scope of this version:** `DATA-SCHEMA` §12 defers "which secrets go to Vault" to *this* doc
> (with `EDGE-FUNCTIONS-SPEC`). So §1–§6 below are the **binding day-one rules** — attach them from
> Session 9 (M41 credential vault) onward. §7 is the **provider registry** (every provider as a row,
> enough to build the vault against). §8 is the **per-provider deep-dive template** — one section is
> filled the session a provider is first integrated, not before. This doc references, and never
> duplicates, `EDGE-FUNCTIONS-SPEC` (webhook signatures, CORS, error envelope, auth preamble) and
> `RLS-AND-SECURITY` (Vault access, Edge Function auth).

---

## 0. RECONCILIATION — M41 PRD → locked stack

M41's *behavior* stands; its Node/Prisma/AES/BullMQ *mechanics* don't (D-001, D-005).

| M41 PRD says | AiMindShare reality | Why |
|---|---|---|
| `Integration.credentialsEnc Bytes` — AES-256-GCM ciphertext in a Postgres column, env master key | **Supabase Vault** holds the secret; the `integrations` row stores a **reference only** (`vault_secret_name`), never ciphertext | Constitution: all secrets in Vault, never in app-managed crypto or the browser. DATA-SCHEMA §10: "creds in Vault, ref only" |
| `integrations.get(workspaceId, provider)` in Node app code decrypts and returns creds | An **Edge Function-internal helper** (Deno, service role) resolves ref → reads `vault.decrypted_secrets` → auto-refreshes → returns. **No browser-reachable endpoint returns credentials, ever** | A static front end has no server it can trust with secrets; only Edge Functions run privileged |
| OAuth refresh = BullMQ worker (<24h to expiry) | `pg_cron` sweep enqueues `integration.refresh_token` **jobs**; a worker refreshes | D-005: BullMQ → jobs + pg_cron |
| Hourly health monitor = BullMQ | `pg_cron` enqueues `integration.health_check` jobs | same |
| Prisma models `Integration/ApiKey/WebhookSubscription/WebhookDelivery` | DATA-SCHEMA §10 tables: `integrations`, `webhooks_in`, `webhooks_out`, `api_keys`, `api_rate_limits` | Schema is the source of truth |
| `/api/integrations/*` Next routes | Edge Functions (`integrations-connect`, `integrations-callback`, `integrations-test`, `integrations-disconnect`) + direct Supabase reads for the list UI | EDGE-FUNCTIONS-SPEC: browser → Edge Function or Supabase, nothing else |

Nothing in M41's acceptance criteria is lost; §9 maps them.

---

## 1. THE FIVE VAULT LAWS (day-one, LOCKED)

1. **A secret never touches the browser.** No API key, token, client secret, or refresh token is
   ever sent to, stored in, or computed in front-end code. The front end only ever sees a
   provider's **connection status** (`connected | needs_reauth | error`), never its credential.
2. **The `integrations` row is a reference, not a secret.** It stores `provider`, `status`,
   health fields, and `vault_secret_name` — the pointer into Vault. No ciphertext, no plaintext.
3. **Only Edge Functions (service role) decrypt.** Reading `vault.decrypted_secrets` is confined
   to Edge Functions running under the service role, after the standard auth preamble
   (`EDGE-FUNCTIONS-SPEC`). Postgres RLS-side code and the browser cannot read it.
4. **One access path.** Every module reaches a provider through the `resolveCredential()` helper
   (§4) inside an Edge Function. No module hand-rolls credential loading. A metered/action Edge
   Function calls the provider *itself*; it never hands creds back to its caller.
5. **Secrets are per-scope and named deterministically.** Platform-level defaults and
   per-workspace overrides live under a fixed naming convention (§3) so resolution is
   mechanical and auditable.

Violating any of these is an automatic Definition-of-Done failure (RLS/secret greps in doc 9).

---

## 2. WHAT GOES IN VAULT vs WHAT GOES IN A TABLE

The line DATA-SCHEMA §12 defers to this doc:

| Goes in **Supabase Vault** (secret) | Goes in a **table** (non-secret) |
|---|---|
| API keys, client secrets | Provider name, category, connection `status` |
| OAuth access + refresh tokens | `vault_secret_name` (the reference) |
| Webhook signing secrets (inbound verify, outbound sign) | `token_expires_at`, `last_health_check`, `last_error` |
| Basic-auth passwords | Non-secret config (`config jsonb` — e.g. a `from` email, a sender ID, an account label) |
| Stripe/Twilio/Meta signing secrets | `connected_by`, timestamps |

Rule of thumb: **if leaking it lets someone act as the customer, it's a Vault secret.** Everything
else — labels, expiry timestamps, health, non-sensitive config — is a normal column and may be
read by the browser under standard RLS. Channel config tables already encode this: DATA-SCHEMA's
`conversations`/channel `config jsonb` is annotated *"NON-secret; creds live in Vault."*

---

## 3. VAULT NAMING CONVENTION (LOCKED)

Deterministic names so `resolveCredential()` needs no lookup table:

```
platform default :  plat__<provider>[__<field>]
workspace override:  ws_<workspace_uuid>__<provider>[__<field>]
webhook signing   :  ws_<workspace_uuid>__<provider>__whsec     (or plat__<provider>__whsec)
```

Examples: `plat__openai`, `ws_9f3…__stripe`, `ws_9f3…__stripe__whsec`,
`ws_9f3…__google__refresh_token`. Multi-field providers (OAuth: access + refresh + expiry) store a
single JSON secret `ws_<uuid>__<provider>` unless a field genuinely needs isolation.

`integrations.vault_secret_name` stores the base name; the helper derives field/whsec suffixes.

**Resolution order** (in `resolveCredential`): workspace override → platform default → typed
`NotConnectedError`. This is M41's "workspace override → platform fallback" rule, mechanized.

---

## 4. THE ACCESS HELPER — `resolveCredential()` (Edge Function-internal)

The single credential path (Law 4). Pseudocode; lives in a shared Edge Function module:

```
resolveCredential(supabaseAdmin, workspaceId, provider):
  row = select provider,status,vault_secret_name,token_expires_at
        from integrations
        where provider=provider and (workspace_id=workspaceId or workspace_id is null)
        order by workspace_id nulls last   -- override beats platform default
        limit 1
  if no row or status='error':  throw NotConnectedError(provider)   # UI shows connect prompt

  secret = vault.decrypted_secrets[ row.vault_secret_name ]          # service role only

  if provider.auth == 'oauth2' and expiring_soon(row.token_expires_at):
      secret = refreshNow(provider, secret)     # updates Vault + integrations.token_expires_at
                                                 # on failure: mark needs_reauth, notify M04, throw

  return secret        # returned ONLY to the calling Edge Function, never to the browser
```

`NotConnectedError` and `NeedsReauthError` are typed; the calling action surfaces a connect/re-auth
prompt (doc 7) rather than a raw failure. The browser's only integration-related powers are:
list connections (RLS read of non-secret columns), start a connect flow, and start a health test —
all through Edge Functions.

---

## 5. OAUTH, REFRESH & HEALTH — via jobs + pg_cron (D-003/D-005)

- **Connect (api_key providers):** `integrations-connect` Edge Function receives the key **once**
  over the authenticated call, writes it straight to Vault under the §3 name, inserts the
  `integrations` row (`status=connected`), returns status only. The key is never echoed back.
- **Connect (oauth2 providers):** `integrations-connect` returns the provider consent URL (state =
  signed `{workspace_id, provider, nonce}`); provider redirects to `integrations-callback`, which
  exchanges the code, stores the token bundle in Vault, records `token_expires_at`, inserts the row.
- **Refresh:** `pg_cron` (e.g. every 15 min) enqueues `integration.refresh_token` **jobs** for rows
  whose `token_expires_at < now() + 24h`; the worker calls the provider refresh endpoint, updates
  Vault + `token_expires_at`. Refresh failure → `status=needs_reauth` + M04 notification.
- **Health:** `pg_cron` hourly enqueues `integration.health_check` jobs; the worker runs the
  provider's cheap status call, updates `last_health_check`/`last_error`/`status`
  (`connected`→green, transient→`error` yellow/red). Connections UI reads these columns.

All three are jobs the **browser never enqueues** — they're `pg_cron`-owned system jobs
(the browser only ever inserts `queued` rows for user-initiated work; these are system-initiated).

---

## 6. WEBHOOKS — inbound & outbound (defer to EDGE-FUNCTIONS-SPEC for the crypto)

**This doc owns the routing/registry; `EDGE-FUNCTIONS-SPEC` owns signature verification.** Do not
re-specify HMAC/signature logic here — reference it.

- **Inbound (provider → us):** each provider webhook is a dedicated Edge Function
  (`webhook-stripe`, `webhook-twilio`, `webhook-meta`, …) that **first** verifies the provider
  signature using the Vault-stored signing secret (`…__whsec`) per EDGE-FUNCTIONS-SPEC, dedupes on
  provider event id, then acts (e.g. Stripe → M03 `billing_state`; Twilio inbound SMS → M12; Meta
  → M12). Unverified payloads are rejected before any side effect.
- **Incoming catch-hooks (third party → M13):** per-workspace catch URLs (`webhooks_in`) usable as
  automation triggers; the receiving Edge Function validates the workspace token, then enqueues an
  M13 trigger job.
- **Outbound (us → subscriber):** `webhooks_out` subscriptions (url, events[], signing secret in
  Vault). A `webhook.deliver` job signs the payload (HMAC-SHA256, secret from Vault) and POSTs;
  retry with backoff (5 attempts, per M41); every attempt logged for replay.

Event names are the platform's canonical set (M41): `contact.created`, `deal.won`,
`appointment.booked`, `invoice.paid`, `form.submitted`, … (registry maintained alongside M13's
trigger catalogue — single list, two consumers).

---

## 7. PROVIDER REGISTRY (day-one skeleton — every provider as a row)

The `providers` registry (`providers.ts`-equivalent, but as static config the Edge Functions read).
This table is complete enough to build the vault and connect flows against on day one. The deep
per-provider section (§8) is filled the session the provider is first *used*.

Columns: auth (`api_key` / `oauth2` / `basic`) · scope (platform-default vs typically per-workspace)
· meter it hits (doc 11 `meter_kind`, or —) · first wired (phase/module) · webhook in.

| Provider | Category | Auth | Typical scope | Meter (doc 11) | First wired | Webhook in |
|---|---|---|---|---|---|---|
| **Stripe** | Payments | api_key + `whsec` | per-workspace (Connect) + platform | — (billing $, not a meter) | Ph1 · M03/M28 | ✓ `webhook-stripe` |
| **Twilio** | SMS/Voice | api_key (+ subaccount) | per-workspace | `sms`, `voice_minutes` | Ph1 · M12 | ✓ `webhook-twilio` |
| **Resend / SendGrid** (D-011) | Email | api_key | platform (+ workspace domain) | `email` | Ph1 · M04/M16 | ✓ (bounces) |
| **OpenAI** | AI | api_key | platform | `ai_tokens`, `image_gen` | Ph1 · M08 → M13/M16/M22/M33 | — |
| **Anthropic** | AI | api_key | platform | `ai_tokens` | Ph1+ · M08/M33 (as configured) | — |
| **DataForSEO** | SEO data | basic | platform | `seo_calls` | Ph3 · M21 **built (S21)** — `seo-keyword-lookup` (cached) + `seo-gap` | — |
| **SerpApi** | SERP | api_key | platform | `seo_calls` | Ph3 · M21 **built (S21)** — `seo-serp` + worker `rank.check` | — |
| **PageSpeed Insights** | SEO data | api_key | platform | `seo_calls` | Ph3 · M21 **built (S21)** — CWV in `seo.audit.crawl` (registry key `pagespeed`; standalone api_key, not the Google OAuth suite) | — |
| **Google** (Calendar/GBP/Ads/PSI) | OAuth suite | oauth2 | per-workspace | `seo_calls` (PSI/Ads read) | Ph1 Calendar (M14) · Ph6 GBP/Ads | — |
| **Meta** (FB/IG/WhatsApp/Ads) | OAuth suite | oauth2 + `whsec` | per-workspace | `sms`-class (WA) via M12 | Ph1 M12 (WA/DM) · Ph6 Ads | ✓ `webhook-meta` |
| **Pinterest** | Social | oauth2 | per-workspace | — | Ph4 · M24 | — |
| **LinkedIn / X / TikTok** | Social | oauth2 | per-workspace | — | Ph4 · M23 | — |
| **ElevenLabs** | Voice TTS | api_key | platform | `voice_minutes` (M34) / render (M25) | Ph7/8 · M34/M25 | — |
| **Amazon PA-API** | Affiliate | api_key (signed) | per-workspace | — | Ph5 · M29 | — |
| **ClickBank / ShareASale / Impact / CJ** | Affiliate nets | api_key/oauth2 | per-workspace | — | Ph5 · M29 | — |

Adding a provider must stay **<30 lines** (M41 acceptance criterion): a registry row + a Vault
name + (if oauth2) scopes + (if it emits) a webhook Edge Function. If it exceeds that, the registry
abstraction has a bug.

---

## 8. PER-PROVIDER SECTION — TEMPLATE (fill just-in-time)

Copy this block and fill it the session a provider is first integrated. Until then it stays a
one-line registry row above. Keeping these empty on purpose is correct — this is the "just-in-time"
half of the doc.

```
### 8.x <Provider>
- **Auth model:** api_key | oauth2 (scopes: …) | basic. Vault name(s): plat__… / ws_…__…
- **Scope decision:** platform-default and/or per-workspace override — and why.
- **Endpoints used:** the specific calls this platform makes (not the whole API).
- **Rate limits:** provider's limits + our client-side throttle; which jobs must respect them.
- **Cost per call/unit:** $ per unit → written to usage_events.unit_cost (doc 11 §8 rebilling).
- **Meter hit:** meter_kind + the exact quantity formula (e.g. tokens = prompt+completion).
- **Retry policy:** which errors retry, backoff, max attempts (via jobs), which are terminal.
- **Webhook in (if any):** Edge Function name, signature scheme (ref EDGE-FUNCTIONS-SPEC), events consumed, dedupe key.
- **Health check:** the cheap status call used by integration.health_check.
- **Refresh (oauth2):** refresh endpoint, expiry field, needs_reauth trigger.
- **Failure UX:** what NotConnectedError / rate-limit / provider-down shows the user.
- **Compliance notes (if any):** e.g. Twilio A2P 10DLC gate (M05), Meta WA opt-in (M05).
```

Priority fill order follows the build sequence: **Stripe, Twilio, Resend/SendGrid, OpenAI** at
Phase 1; **DataForSEO, SerpApi, Google** at Phase 3; social providers Phase 4; affiliate nets
Phase 5; ElevenLabs Phase 7–8.

### 8.1 Twilio — *first wired Session 10 · M12 Inbox*
- **Auth model:** api_key. Vault names (§3): `ws_<workspace_id>__twilio__account_sid`,
  `ws_<workspace_id>__twilio__auth_token`. The `integrations` row for `provider='twilio'` holds the base
  `vault_secret_name` + non-secret config; the SMS number lives on `channels.external_ref` (non-secret).
- **Scope decision:** per-workspace (each agency/sub-account brings its own 10DLC number + subaccount). No
  platform default — an unconnected workspace gets a clean `not_connected` (no shared sender).
- **Endpoints used:** `POST https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json` (outbound SMS,
  Basic auth `sid:auth_token`). Inbound is Twilio → our webhook (below), not a call we make.
- **Rate limits:** 10DLC throughput is carrier/campaign-tier bound (~1 msg/s default). M12 sends are
  user-initiated one-offs (no fan-out); M16 broadcasts will throttle at the job layer.
- **Cost per call/unit:** ~$0.0079/SMS segment (US) → `usage_events.unit_cost` for rebilling (doc 11 §8).
- **Meter hit:** `meter_kind='sms'`, quantity = 1 per outbound message (segment-accurate metering is a
  follow-up once provider callbacks report `num_segments`). Incremented in the `inbox-send` success path only.
- **Retry policy:** outbound is synchronous (not a job) — a Twilio non-2xx returns `provider_error` and
  **bills nothing** (Gate 3); the user retries. No auto-retry/backoff this slice.
- **Webhook in:** `twilio-inbound-sms` (Edge Function, `verify_jwt=false`). Signature scheme:
  `X-Twilio-Signature` = base64(HMAC-SHA1(auth_token, url + Σ sorted(k+v))) — verified against the Vault
  auth_token before acting (ref EDGE-FUNCTIONS-SPEC §4). Events: inbound SMS + carrier keywords
  (STOP/START/HELP → M05 consent). Dedupe key: `MessageSid` (→ `messages.external_id`; `ingest_inbound_message`
  is idempotent on it). *Missed-call → SMS (voice webhook) defers to M34.*
- **Health check:** a `GET Accounts/{sid}.json` under the workspace creds (used by `integration.health_check`).
- **Refresh:** n/a (api_key).
- **Failure UX:** `not_connected` → "Connect a Twilio number in Settings → Channels"; `a2p_not_registered`
  → link to the M05 A2P wizard; `consent_blocked` → "contact hasn't opted in"; `quota_exceeded` → upgrade/credits.
- **Compliance notes:** every send is gated by `sms.canSend()` (A2P 10DLC approved, M05) **and**
  `consent.check()` (latest opt-in, M05) before the provider call — the un-bypassable contract (D-055).

### 8.2 Google Calendar — *first OAuth provider wired · Session 12 · M14 Calendar & Booking*
- **Auth model:** oauth2 (scopes: `https://www.googleapis.com/auth/calendar.events` +
  `.../auth/calendar.readonly`). Vault name (§3): `ws_<workspace_id>__google` — **one JSON secret**
  `{access_token, refresh_token, expires_in}` (the bundle-under-base shape `integrations-callback` uses,
  read by `_shared/google.ts`). The `integrations` row (`provider='google'`) holds the base
  `vault_secret_name` + `token_expires_at`; `appointments.google_event_id` is the non-secret event link.
- **Scope decision:** per-workspace (each workspace connects its own Google account). No platform default —
  an unconnected workspace simply computes slots without freebusy and skips event push (clean degrade).
- **Endpoints used:** `POST oauth2.googleapis.com/token` (code exchange + refresh);
  `POST calendar/v3/freeBusy` (busy read, subtracted from the slot grid, cached ~5m per PRD);
  `POST/PATCH/DELETE calendar/v3/calendars/primary/events` (push/update/delete a booking, optional Meet link).
- **Rate limits:** Google Calendar per-project/per-user quotas (generous for booking volumes); freebusy is
  read once per slot-page load; event writes are one-per-lifecycle-transition. No fan-out.
- **Cost per call/unit:** none (no per-call cost) → no `usage_events` row.
- **Meter hit:** none — calendar sync is not a metered action (Gate 3 = "no billable action" for the sync).
- **Retry policy:** freebusy **fails open** (a Google hiccup never blocks a booking — slots just omit busy
  subtraction); event push is best-effort and never blocks a confirmed booking. Token refresh on 401.
- **Webhook in:** none this slice — refresh is **poll-on-read** (freebusy at slot time) + immediate push on
  write. Google `watch` push-channels are deferred (extra infra; not needed for correctness).
- **Health check:** the presence of a valid token bundle + a cheap freebusy probe (via `integration.health_check`).
- **Refresh (oauth2):** `oauth2.googleapis.com/token` with `grant_type=refresh_token`; expiry tracked in
  `integrations.token_expires_at`; `expiringSoon()` (<24h) triggers a refresh in `googleAccessToken()`; a failed
  refresh flips the row to `needs_reauth` (→ `NeedsReauthError`, surfaced as a reconnect prompt). This is the
  concretization of the refresh the M41 `resolveCredential` scaffold left for "the first OAuth provider" (D-068).
- **Failure UX:** `not_connected` → the calendar editor's "Connect Google" card; `needs_reauth` → reconnect
  banner; `not_configured` (no `GOOGLE_CLIENT_ID` on the env) → "Google isn't set up on this environment".
- **Compliance notes:** none beyond the vault laws — the OAuth callback authorizes by signed `state`
  (HMAC, verified before any side effect), identical to `integrations-callback` (EDGE-FUNCTIONS-SPEC §4).
- **Status:** LIVE path built to contract, **ready-not-run** — no Google OAuth client / Deno toolchain on the
  build machine. Verified by code review + the m14 probe's RPC contract (D-068).

---

## 9. DEFINITION OF DONE — M41 vault (maps PRD §5)

- [ ] `providers` registry seeded; a new provider adds in <30 lines (§7)
- [ ] `resolveCredential()` is the **sole** credential access path; decryption never leaves an Edge Function (Law 1, 4)
- [ ] `integrations` rows hold **references only** — grep proves no ciphertext/keys in any table or client bundle (Law 2)
- [ ] OAuth connect + callback verified for **Google + Meta**; `needs_reauth` flow works end to end
- [ ] `pg_cron` refresh sweep + `integration.refresh_token` job refresh tokens expiring <24h (no BullMQ)
- [ ] `pg_cron` health sweep flags a revoked key within an hour; UI shows green/yellow/red + last error
- [ ] Every inbound webhook Edge Function verifies the provider signature (per EDGE-FUNCTIONS-SPEC) **before** any side effect; dedupes on event id
- [ ] Metered providers write `usage_events.unit_cost` on every call (doc 11 §8)
- [ ] RLS: `integrations`, `webhooks_*`, `api_keys`, `api_rate_limits` workspace-scoped; Vault readable only by service-role Edge Functions; cross-tenant leak test passes
- [ ] (Phase 7) API keys hashed + scoped (reuse M02 registry); `/v1/*` rate-limited (`api_rate_limits`); outbound HMAC + retry/replay

---

## 10. OPEN ITEMS (flag, don't resolve in a build session)

- **Email provider (D-011):** Resend vs SendGrid decides the `email`-meter `source`, the Vault name,
  and the bounce-webhook shape. Fill §8 for the winner at M16/M04 time.
- **Per-workspace vs platform default per provider:** the §7 "typical scope" column is a default,
  not a lock — an agency may push its own Stripe/Twilio per sub-account. Confirm each at wiring time.
- **Anthropic vs OpenAI routing** for a given AI feature is a per-module config choice, not an
  integrations concern — both are api_key platform secrets; the calling module picks.
- **`api_call` meter** for M41's public API (Phase 7) — add to `meter_kind` when the public API ships
  (doc 11 §12), not now.

---

*INTEGRATIONS-SPEC v1.0 (skeleton) · Doc 12 of 14 · Vault rules (§1–§6) LOCKED day-one; provider
sections (§8) just-in-time · Pins to DATA-SCHEMA §10 (M41 tables) · Authorities it defers to:
EDGE-FUNCTIONS-SPEC (signatures, CORS, error envelope, auth preamble), RLS-AND-SECURITY (Vault
access, Edge Function auth) · Resolves PRD M41 into vanilla + Supabase · Bound by DECISIONS
D-001, D-003, D-005; Constitution secrets law.*

---

### §8 — SendGrid (email) · first wired Session 17 (M16)
**Auth:** `api_key`. **Vault fields** (M41 §3 naming): `ws_<uuid>__sendgrid__api_key` /
`__event_webhook_verification_key`, platform default `plat__sendgrid__*`. `resolveSendgridKey()` /
`resolveSendgridWebhookKey()` do override→default. **Provider row** in `_shared/providers.ts` (mirrored in
`frontend/js/providers.js`): category email, `usedBy` includes M16 (and the now-unblocked M04/M12/M14/M28).
**API surface:** Mail Send `POST /v3/mail/send` (JSON; `List-Unsubscribe` + `List-Unsubscribe-Post` headers;
per-recipient `custom_args.token` for event correlation). **Signed Event Webhook:** ECDSA-P256/SHA-256 over
`timestamp + rawBody`, verified in `verifySendgridEvent()` before acting (verify-before-act, Gate 7); events →
`send_events` + `suppress_email`/`unsubscribe_email` + `emit_trigger(email.*)`. **Domain authentication**
(SPF/DKIM/CNAME) verify is built to contract, **ready-not-run** (D-091). D-011 resolved → SendGrid (D-086).
