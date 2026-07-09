# RLS-AND-SECURITY-v1_0.md
### AiMindShare.com — Tenancy & Security Model
**Version 1.0 · 2026-07-02 · The wall that makes multi-tenancy real.**

> `DATA-SCHEMA` declares the tables; this document declares who may read and write each row. In
> this stack **the database is the security boundary**, not application code. Every tenant table
> ships with RLS enabled and the policies below. A table without RLS is a cross-tenant leak
> waiting to happen and fails Definition-of-Done.

---

## 1 · The hierarchy in `auth` / `memberships` terms

```
auth.users                     ← one row per human (Supabase Auth)
   └── memberships             ← (workspace_id, user_id, role, status)
         └── workspaces        ← agency (parent_workspace_id = null)
               └── workspaces  ← sub-accounts (parent_workspace_id → agency)
```

- An **agency** is a top-level workspace (`parent_workspace_id is null`).
- A **sub-account / client workspace** is a workspace whose parent is the agency.
- A **user** belongs to one or more workspaces via `memberships`, each with a `role`.
- Belonging is proven by `public.is_member(workspace_id)` (from migration 0000). Role thresholds
  are proven by `public.has_role(workspace_id, min_role)`. RLS calls these — nothing else.

**Agency reach into sub-accounts** is *not* automatic. An agency owner sees a sub-account only if
they also hold a membership in it (created at provisioning time). This keeps the wall simple: one
rule — membership — governs all access.

---

## 2 · The role matrix

Roles are ordered `client < staff < manager < admin < owner`. `has_role(ws,'manager')` is true
for manager, admin, and owner.

| Capability | Owner | Admin | Manager | Staff | Client |
|---|:--:|:--:|:--:|:--:|:--:|
| Read workspace data | ✓ | ✓ | ✓ | ✓ | portal-scoped only |
| Create/edit records (contacts, deals, content…) | ✓ | ✓ | ✓ | ✓ | ✗ |
| Delete records | ✓ | ✓ | ✓ | ✗ | ✗ |
| Manage members & roles | ✓ | ✓ | ✗ | ✗ | ✗ |
| Billing, plan, rebilling (M03) | ✓ | ✓ | ✗ | ✗ | ✗ |
| White-label / domains (M42) | ✓ | ✗ | ✗ | ✗ | ✗ |
| Integrations & API keys (M41) | ✓ | ✓ | ✗ | ✗ | ✗ |
| Approve content / pay invoices (portal) | — | — | — | — | ✓ (own) |
| Impersonate (platform admin only) | super-admin, audited |

Per-module fine-grained overrides live in `memberships.permissions` (jsonb, M02) and are read by
Edge Functions for actions that need finer control than the five roles. RLS enforces the coarse
matrix; Edge Functions enforce the fine overrides.

---

## 3 · The standard tenant-table policies

Applied to **every** table with a `workspace_id`. Role thresholds are tuned per table (below);
this is the default.

```sql
alter table public.<t> enable row level security;

create policy sel on public.<t> for select
  using ( public.is_member(workspace_id) );

create policy ins on public.<t> for insert
  with check ( public.has_role(workspace_id, 'staff') );

create policy upd on public.<t> for update
  using ( public.has_role(workspace_id, 'staff') )
  with check ( public.has_role(workspace_id, 'staff') );

create policy del on public.<t> for delete
  using ( public.has_role(workspace_id, 'manager') );
```

**Per-table threshold overrides:**
- `audit_log`, `usage_events`, `consent_records`: insert = any member; **update/delete = nobody**
  (append-only ledgers).
- `subscriptions_platform`, `rebilling_rules`, `plans`, `white_label_configs`, `api_keys`:
  insert/update/delete = `admin` (billing/white-label = admin+).
- `memberships`: insert/update/delete = `admin`; a user may always `select` their own row.
- `workspaces`: update/delete = `owner`; select = member.
- `jobs`: **insert restricted to status `queued`** (see §7); update/delete = service-role only
  (workers). Members `select` their workspace's jobs.

**Global (no `workspace_id`) tables** — `plans`, `feature_flags`, `impersonation_log`,
`system_health`, `site_templates`: RLS restricts all access to platform super-admins (a claim on
the JWT, `app_metadata.platform_admin = true`), except read-only catalogs (`plans`,
`site_templates`) which any authenticated user may `select`.

---

## 4 · Client-portal isolation (M37)

The `client` role is the hardest case: a client logs into the *same* workspace but must see only
their own slice. Two layers:

1. **RLS still applies** — a client is a member, so `is_member` is true, but `has_role(...,'staff')`
   is false, so they cannot write ordinary records.
2. **Portal-scoped read policies** — portal-exposed tables get an *additional* client policy that
   narrows `select` to rows tied to that client's `contact_id`:

```sql
create policy sel_client on public.invoices for select
  using (
    public.has_role(workspace_id,'staff')                 -- staff+ see all
    or ( public.is_member(workspace_id)                   -- client sees own
         and contact_id = public.portal_contact_id(workspace_id) )
  );
```

`public.portal_contact_id(ws)` resolves the logged-in client to their `contact_id` via
`portal_access`. Applied to: `invoices`, `documents`, `blog_articles` (approval), `social_posts`
(approval), `projects`/`project_tasks` (deliverables), `media_assets` (brand library),
`conversations` (their own thread with the agency). **A client can never `select` another client's
rows, another workspace's rows, or any write path beyond approvals/payments.**

Portal approvals and payments are the only writes a client makes, and they go through Edge
Functions that re-check `portal_contact_id`, never a direct table write.

---

## 5 · Storage bucket policies (M06)

Supabase Storage replaces S3. Buckets are **private by default**; access is path-scoped by
`workspace_id`.

- **Path convention:** `media/<workspace_id>/<folder>/<file>`; `brand/<workspace_id>/…`;
  `portal/<workspace_id>/<contact_id>/…`.
- **Bucket policy** (mirrors table RLS):

```sql
create policy media_read on storage.objects for select
  using ( bucket_id = 'media'
          and public.is_member( (storage.foldername(name))[1]::uuid ) );

create policy media_write on storage.objects for insert
  with check ( bucket_id = 'media'
               and public.has_role( (storage.foldername(name))[1]::uuid, 'staff') );
```

- Public delivery (e.g. a published site's images) uses **signed URLs** minted server-side, or a
  dedicated `public` bucket for genuinely public assets — never by loosening the private bucket.
- Uploads go through the client SDK with the anon key **plus** these policies; the anon key alone
  grants nothing without a valid membership.

---

## 6 · Supabase Vault for provider credentials (M41)

- **Every provider secret** (Stripe, Twilio, OpenAI, DataForSEO, SerpApi, Meta, Google, Pinterest,
  OAuth tokens, webhook signing secrets) lives in **Supabase Vault**, read **only inside Edge
  Functions / workers** via the service role.
- Tables that reference a provider (`integrations`, `channels`, `social_accounts`,
  `affiliate_networks`, `ad_accounts`) store **non-secret config and a Vault reference only** — never
  the token itself. The `_json`/`credentials` columns from PRD §29 that implied storing tokens are
  **redefined here as reference-only**; the secret is in Vault.
- OAuth refresh runs as a scheduled `job`; the refreshed token is written back to Vault, never to a
  table.

**Self-check:** grep every table's columns for `token`, `secret`, `api_key`, `client_secret` — any
that would hold a live value (not a hash or a Vault ref) is a defect.

---

## 7 · Edge Function auth rules

- Edge Functions run with the **service role** and therefore **bypass RLS** — so each one must
  **re-establish the caller's identity and authorization itself**:
  1. Read the caller's JWT from the `Authorization` header; reject if absent/invalid.
  2. Resolve `auth.uid()`; confirm membership + required role via `is_member`/`has_role` **for the
     specific `workspace_id` in the request**.
  3. Only then act. Never trust a `workspace_id` in the body without this check.
- **Webhooks** (Stripe, Twilio, Meta) have no user JWT — they authenticate by **signature
  verification** against the Vault-held signing secret, then look up the workspace from the payload.
  An unverified webhook is dropped.
- Edge Functions return the standard envelope `{ ok: boolean, data?, error? }` and never leak the
  service-role key, Vault contents, or another workspace's data into a response.

---

## 8 · The mandatory cross-tenant leak test

**No module is Done until it passes this.** For each new table/endpoint:

1. Seed two workspaces, A and B, each with an owner and a staff user.
2. As B's user, attempt to `select`, `insert`, `update`, `delete` **A's rows** — directly via the
   client SDK (RLS path) *and* via every new Edge Function (auth-check path).
3. **Every attempt must fail** (empty result or authorization error). One leaked row = fail.
4. As B's **client** user, attempt to read another client's portal rows in B → must fail.
5. Confirm the anon key with no session grants nothing.

Automate as a repeatable script; run it in the DoD self-review. A green leak test is the single
most important gate in the project.

---

## 9 · Defense-in-depth checklist (per session)

- [ ] Every new table: RLS enabled + four policies + correct role thresholds.
- [ ] No secret stored in any table (Vault only); grep clean.
- [ ] Every Edge Function re-checks membership/role for the request's `workspace_id`.
- [ ] Every webhook verifies its signature before acting.
- [ ] Storage paths are `workspace_id`-scoped; buckets private; public delivery via signed URLs.
- [ ] Client-portal tables carry the narrowed `sel_client` policy.
- [ ] Cross-tenant leak test green.
- [ ] No `service_role` key anywhere reachable by the browser.

---

*AiMindShare.com · Tenancy & Security Model v1.0. RLS is the wall; Vault holds every secret; Edge
Functions re-authorize; the leak test is the gate. Attach alongside `DATA-SCHEMA` in any session
that touches a table, a bucket, or a provider.*
