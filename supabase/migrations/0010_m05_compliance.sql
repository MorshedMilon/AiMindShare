-- ═══════════════════════════════════════════════════════════════════════════
-- 0010_m05_compliance.sql — AiMindShare Session 7 · M05 Compliance & Consent
--
-- Ships the three compliance ledgers from DATA-SCHEMA §6 onto the locked stack
-- (canonical shapes verbatim + the minimal columns the accept-criteria demand,
-- each logged in DECISIONS — D-036…D-041). Reconciles PRD_M05's dead Prisma
-- models (channel/status strings, BullMQ, R2) to: kind+granted booleans, the
-- consent_kind enum, RLS-gated tables, and the jobs queue (gdpr.export/erase).
--
-- These are append-only / privileged compliance tables:
--   • consent_records  — immutable ledger (insert-only; NO update/delete policy),
--                        like usage_events / audit_log (RLS-AND-SECURITY §3).
--   • a2p_registrations— A2P 10DLC status; Owner/Admin write (RLS-AND-SECURITY §2).
--   • gdpr_requests    — data-subject requests; staff create (pending only),
--                        admin+ advance/delete.
--
-- contact_id stays a bare uuid (NO FK) — the contacts table is M09, not built
-- yet; the FK is deferred exactly as DATA-SCHEMA §6 notes ("FK added after
-- contacts exists"). Twilio TrustHub / inbound-signature wiring is stubbed this
-- session (BUILD-SEQUENCE S7: "Twilio wiring can stub"); creds live in M41's Vault.
--
-- Order inside this file: enum → tables → indexes → triggers → RLS + policies →
-- deferred cron hook. Every table created here enables RLS in THIS file (Gate-8).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. consent_kind enum (DATA-SCHEMA §2 canonical + D-036 channel extension) ─
-- Canonical set is {sms_optin,email_optin,cookie,gdpr_export,gdpr_erase}. M05's
-- PRD needs four opt-in channels (sms/email/whatsapp/voice), so whatsapp_optin /
-- voice_optin are added here as the minimal extension (D-036). Append-only, DO/
-- exception-wrapped so re-running the migration is safe (same idiom as 0000).
do $$ begin
  create type public.consent_kind as enum
    ('sms_optin','email_optin','whatsapp_optin','voice_optin','cookie','gdpr_export','gdpr_erase');
exception when duplicate_object then null; end $$;
-- If an earlier cut created the enum without the channel values, add them (no-op
-- when already present). Safe: added enum values are usable in later statements
-- once this migration commits; nothing below writes these literals at load time.
alter type public.consent_kind add value if not exists 'whatsapp_optin';
alter type public.consent_kind add value if not exists 'voice_optin';

-- ── 2. Tables (DATA-SCHEMA §6 verbatim + logged extensions) ──────────────────

-- consent_records — universal opt-in/opt-out ledger. DATA-SCHEMA §6:430-438.
-- The PRD's `consentText` (exact wording shown) + form/keyword metadata live in
-- `evidence` jsonb rather than a dedicated column (D-037). Immutable once written.
create table if not exists public.consent_records (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  contact_id    uuid,                          -- FK deferred to M09 (contacts)
  kind          public.consent_kind not null,
  granted       boolean not null,              -- true = opted_in, false = opted_out
  source        text,                          -- form:{id} | keyword | import | manual | unsub_link
  ip_hash       text,
  evidence      jsonb not null default '{}',   -- { consent_text, phone, message, ... }
  created_at    timestamptz not null default now()
);
create index if not exists consent_records_ws_idx      on public.consent_records (workspace_id);
create index if not exists consent_records_contact_idx on public.consent_records (contact_id, kind);

-- a2p_registrations — Twilio 10DLC brand + campaign status, one per workspace.
-- DATA-SCHEMA §6:440-446 + D-038 extensions: rejection_reason (rejection screen),
-- business_info (wizard step 1 payload), updated_at (mutable status), and a
-- unique(workspace_id) so the wizard upserts a single row per workspace.
create table if not exists public.a2p_registrations (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  brand_status     text not null default 'not_started',    -- not_started|pending|approved|rejected
  campaign_status  text not null default 'not_started',    -- not_started|pending|approved|rejected
  provider_ref     text,                                   -- twilio brand/campaign SIDs (jsonb-ish text)
  rejection_reason text,                                   -- D-038
  business_info    jsonb not null default '{}',            -- D-038
  submitted_at     timestamptz,
  approved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz,                            -- D-038
  unique (workspace_id)
);
create index if not exists a2p_registrations_ws_idx on public.a2p_registrations (workspace_id);

-- gdpr_requests — data-subject requests (access/delete/rectify), 30-day SLA.
-- DATA-SCHEMA §6:448-454 base + D-039 extensions: request_type (the PRD's
-- access|delete|rectify, distinct from the consent_kind job discriminator),
-- requested_email (public intake), due_at (SLA countdown), export_url (ZIP),
-- notes (audit trail).
create table if not exists public.gdpr_requests (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  contact_id      uuid,                                    -- FK deferred to M09
  kind            public.consent_kind not null,           -- gdpr_export | gdpr_erase (job discriminator)
  request_type    text not null default 'access',         -- access | delete | rectify (D-039)
  requested_email text,                                    -- D-039 (public intake)
  status          text not null default 'pending',        -- pending | in_progress | completed
  due_at          timestamptz,                             -- D-039 (now()+30d at intake)
  export_url      text,                                    -- D-039 (worker writes on gdpr.export)
  notes           text,                                    -- D-039
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists gdpr_requests_ws_idx     on public.gdpr_requests (workspace_id);
create index if not exists gdpr_requests_status_idx on public.gdpr_requests (workspace_id, status);

-- ── 3. Triggers ──────────────────────────────────────────────────────────────
create trigger a2p_registrations_set_updated_at before update on public.a2p_registrations
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RLS + policies (RLS-AND-SECURITY §3 template + append-only override §79)
-- ═══════════════════════════════════════════════════════════════════════════

-- 4.1 consent_records — APPEND-ONLY ledger. Any member may record a consent
-- event (opt-ins arrive from forms, keyword replies, imports, manual entry, and
-- portal/client self-service — RLS-AND-SECURITY §79 "insert = any member"); only
-- staff+ may READ the ledger (compliance data is operator-facing — the client
-- ceiling of Gate-2 keeps portal users out of the compliance surface, D-041).
-- NOBODY may edit or erase a row (no update/delete policy → denied for
-- authenticated; the service role bypasses RLS for GDPR erasure via the worker).
alter table public.consent_records enable row level security;
create policy consent_records_sel on public.consent_records for select
  using ( public.has_role(workspace_id, 'staff') );
create policy consent_records_ins on public.consent_records for insert
  with check ( public.is_member(workspace_id) );
-- (no update / no delete policy — immutable ledger)

-- 4.2 a2p_registrations — staff+ read; Owner/Admin configure (admin+ writes).
-- Client ceiling (D-041): compliance config is not a portal surface.
alter table public.a2p_registrations enable row level security;
create policy a2p_registrations_sel on public.a2p_registrations for select
  using ( public.has_role(workspace_id, 'staff') );
create policy a2p_registrations_ins on public.a2p_registrations for insert
  with check ( public.has_role(workspace_id, 'admin') );
create policy a2p_registrations_upd on public.a2p_registrations for update
  using ( public.has_role(workspace_id, 'admin') )
  with check ( public.has_role(workspace_id, 'admin') );
create policy a2p_registrations_del on public.a2p_registrations for delete
  using ( public.has_role(workspace_id, 'admin') );

-- 4.3 gdpr_requests — member reads; staff create (PENDING only, mirrors jobs'
-- queued-only guard so the browser can't seed a completed/in_progress request);
-- admin+ advance (update) or remove (delete).
alter table public.gdpr_requests enable row level security;
create policy gdpr_requests_sel on public.gdpr_requests for select
  using ( public.has_role(workspace_id, 'staff') );
create policy gdpr_requests_ins on public.gdpr_requests for insert
  with check ( public.has_role(workspace_id, 'staff') and status = 'pending' );
create policy gdpr_requests_upd on public.gdpr_requests for update
  using ( public.has_role(workspace_id, 'admin') )
  with check ( public.has_role(workspace_id, 'admin') );
create policy gdpr_requests_del on public.gdpr_requests for delete
  using ( public.has_role(workspace_id, 'admin') );

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Deferred SLA-reminder hook (M04 Notifications not built yet — D-040)
-- The 30-day GDPR SLA needs a daily reminder. M04 owns the notification center
-- and is NOT built (Session 6 pending) — so this schedules the *sweep* now (the
-- hook exists) but only counts overdue requests; the notification enqueue is a
-- documented TODO that lights up when M04 lands (same honest-deferral pattern as
-- worker.mjs's provisioning defaults and D-022's invite email). Wrapped so this
-- file still loads where pg_cron is absent (PGlite verification harness).
-- ═══════════════════════════════════════════════════════════════════════════
do $$
begin
  perform cron.schedule(
    'gdpr-sla-reminder-sweep',
    '23 6 * * *',
    $cron$
      -- TODO(M04): for each row returned, enqueue a 'notification.send' job.
      -- Until M04 exists this is a harmless daily count of breaching requests.
      select count(*) from public.gdpr_requests
       where status <> 'completed' and due_at is not null and due_at < now()
    $cron$);
exception when others then
  raise notice 'pg_cron unavailable — gdpr-sla-reminder-sweep not scheduled (%).', sqlerrm;
end $$;
