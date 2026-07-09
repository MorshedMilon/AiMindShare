-- ═══════════════════════════════════════════════════════════════════════════
-- 0020_m16_campaigns.sql — AiMindShare Session 17 · M16 Campaigns (Email + SMS)
--
-- One campaign framework, two channels: broadcasts + drip sequences replacing
-- Mailchimp/ActiveCampaign. Ships DATA-SCHEMA §9's canonical email_campaigns +
-- campaign_stats, plus seven PRD-only tables the module needs, as LOGGED
-- EXTENSIONS (Law 8 → DECISIONS). PRD_M16's Prisma / BullMQ / MJML-lib / SendGrid
-- SDK is superseded: sends are `jobs` fan-out (campaign.send → email.deliver/
-- sms.deliver batches), drips are run_after-delayed sequence.step jobs (the D-061
-- WAIT pattern), and SendGrid runs REST + Web Crypto with the key in Vault (the
-- D-028 pattern, in _shared/email.ts). D-011 (email provider) is RESOLVED → SendGrid.
--
-- SCOPE (BUILD-SEQUENCE S17 accept-when): email builder, broadcasts + drips as
-- fan-out jobs, A/B subjects, unsubscribe compliance (M05), meters++ per send.
-- Honest scaffolds (flagged on TASKS.md, never faked): AI copywriter (LLM provider
-- undecided — D-093, meters nothing), domain-auth verify (ready-not-run, D-091),
-- spam-score API (heuristic now, D-092), MJML library (block-JSON compiled to
-- responsive inline-CSS HTML directly, D-087). SendGrid send + event webhook +
-- tracking + Twilio SMS steps are built to full contract but ready-not-run here
-- (no Deno/creds), verified by the PGlite probe + code review.
--
-- Migration number 0024. Chosen to avoid a live parallel-session collision: M15
-- Forms shipped 0020, M06 0021, M19 Sites 0022, M20 Funnels 0023 concurrently on
-- disk, so M16 (independent of all four — deps are ≤0016) took the next free 0024.
-- The `0012` gap (M05 renumber) + double-`0010` are pre-existing collisions Session
-- 5/8 flagged for a human — not touched here. Append-only. ⚠ Re-verify 0024 is free
-- on merge; DECISIONS D-086…D-094 (M08 took D-084/D-085) — renumber if a parallel
-- session also claimed these.
--
-- Depends on: 0000 (set_updated_at, pgcrypto, job_status), 0001 tenancy
-- (is_member/has_role), 0002 jobs (fan-out enqueue), 0009 M03 (meter_kind already
-- carries 'email'+'sms' — reused, D-088; meter_increment/meter_check called in the
-- worker), 0010 M05 (consent_records — audience filter + unsubscribe dual-write),
-- 0013 M09 (contacts/tags/contact_tags/smart_lists + smart_list_eval + log_activity),
-- 0016 M13 (emit_trigger — email.* triggers; best-effort, tolerated absent).
--
-- Logged extensions / deviations from canonical §9 (→ DECISIONS):
--   • D-087  seven PRD-only tables (sequences, sequence_steps, sequence_enrollments,
--            suppressions, send_events, email_templates, sender_identities). MJML lib
--            deferred — compile block-JSON → responsive inline-CSS HTML directly.
--   • D-088  metering reuses the existing `email`/`sms` meter_kind values (no enum
--            churn); the PRD's `email.sent`/`sms.sent` are labels for those meters.
--   • D-089  send_events + suppressions + campaign_stats are SERVICE-ROLE-written
--            (member SELECT, no client I/U/D) — delivery history / block list can't
--            be forged (mirrors M28 invoice_payments, D-071).
--   • D-090  unsubscribe dual-writes suppressions + a consent_records opt-out so the
--            block list and the M05 ledger agree.
--   • D-094  send pipeline = campaign.send fan-out → throttled email/sms.deliver
--            batches; drips via run_after-delayed sequence.step jobs + hourly tick.
--
-- Order: enums → tables → indexes → RLS + policies → stats trigger → audience/
-- compliance helpers → dispatch/tick enqueuers → grants → template seed → cron →
-- realtime. Every table created here enables RLS in THIS file (Gate-8).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Enums (idempotent DO-block; PGlite-safe) ──────────────────────────────
do $$ begin create type public.campaign_status as enum ('draft','scheduled','sending','paused','sent','failed');
exception when duplicate_object then null; end $$;
do $$ begin create type public.sequence_status as enum ('active','paused','archived');
exception when duplicate_object then null; end $$;
do $$ begin create type public.enrollment_status as enum ('active','completed','exited','unsubscribed');
exception when duplicate_object then null; end $$;
do $$ begin create type public.send_event_type as enum
  ('queued','sent','delivered','opened','clicked','bounced','complained','unsubscribed','failed');
exception when duplicate_object then null; end $$;
do $$ begin create type public.step_channel as enum ('email','sms');
exception when duplicate_object then null; end $$;
do $$ begin create type public.suppression_reason as enum ('bounce','complaint','unsub','manual');
exception when duplicate_object then null; end $$;

-- ── 2. Tables (DATA-SCHEMA §9 + logged extensions D-087) ─────────────────────

-- sender_identities — from-name/email + domain-auth status. Created first (FK target).
-- Domain-auth verify (SPF/DKIM/CNAME) runs live via SendGrid (D-091, ready-not-run);
-- spf_ok/dkim_ok/verified are written by that flow.
create table if not exists public.sender_identities (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  from_name    text not null,
  from_email   text not null,
  reply_to     text,
  domain       text,
  spf_ok       boolean not null default false,
  dkim_ok      boolean not null default false,
  verified     boolean not null default false,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now()
);
create unique index if not exists sender_identities_ws_email_idx
  on public.sender_identities (workspace_id, lower(from_email));

-- email_campaigns — broadcast (DATA-SCHEMA §9 verbatim + D-087 builder/A/B extensions).
create table if not exists public.email_campaigns (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  name             text not null,
  channel          public.step_channel not null default 'email',
  subject          text,                                   -- §9
  subject_b        text,                                   -- D-087: A/B variant
  preheader        text,
  body_html        text,                                   -- §9: compiled output (server truth from body_json)
  body_json        jsonb not null default '{"blocks":[]}', -- D-087: block document the builder edits
  sms_body         text,                                   -- for channel='sms'
  from_name        text,                                   -- §9 (snapshot; identity is the live source)
  from_email       text,                                   -- §9
  from_identity_id uuid references public.sender_identities(id) on delete set null,
  status           public.campaign_status not null default 'draft',
  audience         jsonb not null default '{"type":"all"}',-- {type:'tag'|'smartlist'|'all', ref:uuid?}
  ab_enabled       boolean not null default false,
  ab_sample_pct    int not null default 10,                -- each of A/B gets this % (10+10)
  ab_winner_metric text not null default 'opens',
  ab_winner        char(1),                                -- 'A' | 'B' — set by campaign.ab_winner
  throttle_per_min int,                                    -- send-rate throttle (null = provider default)
  footer_address   text,                                   -- CAN-SPAM postal address
  scheduled_at     timestamptz,                            -- §9
  sent_at          timestamptz,                            -- §9
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz,
  constraint email_campaigns_ab_pct_chk check (ab_sample_pct between 1 and 50)
);
create index if not exists email_campaigns_ws_status_idx on public.email_campaigns (workspace_id, status, created_at desc);
create index if not exists email_campaigns_sched_idx     on public.email_campaigns (scheduled_at) where status = 'scheduled';

-- campaign_stats — §9 verbatim. One row per campaign (unique); trigger-maintained.
create table if not exists public.campaign_stats (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id  uuid not null unique references public.email_campaigns(id) on delete cascade,
  sent         int not null default 0,
  delivered    int not null default 0,
  opened       int not null default 0,
  clicked      int not null default 0,
  bounced      int not null default 0,
  unsubscribed int not null default 0
);
create index if not exists campaign_stats_ws_idx on public.campaign_stats (workspace_id);

-- sequences — drip campaign (PRD-only, D-087).
create table if not exists public.sequences (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  name           text not null,
  status         public.sequence_status not null default 'active',
  exit_on        jsonb not null default '{"goal":null,"unsub":true,"replied":false}',
  enrolled_count int not null default 0,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz
);
create index if not exists sequences_ws_idx on public.sequences (workspace_id, status);

-- sequence_steps — ordered email/SMS steps with delays (PRD-only, D-087).
create table if not exists public.sequence_steps (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sequence_id  uuid not null references public.sequences(id) on delete cascade,
  step_order   int not null default 0,
  channel      public.step_channel not null default 'email',
  delay        jsonb not null default '{"mode":"relative","days":1}', -- {mode:'relative',days} | {mode:'fixed',weekday,time}
  subject      text,
  body_json    jsonb not null default '{"blocks":[]}',
  sms_body     text,
  sent         int not null default 0,
  opened       int not null default 0,
  clicked      int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists sequence_steps_seq_idx on public.sequence_steps (sequence_id, step_order);

-- sequence_enrollments — a contact enrolled in a sequence (PRD-only, D-087).
create table if not exists public.sequence_enrollments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sequence_id  uuid not null references public.sequences(id) on delete cascade,
  contact_id   uuid not null references public.contacts(id) on delete cascade,
  current_step int not null default 0,
  status       public.enrollment_status not null default 'active',
  next_run_at  timestamptz,
  enrolled_at  timestamptz not null default now(),
  completed_at timestamptz,
  unique (sequence_id, contact_id)
);
create index if not exists sequence_enrollments_due_idx on public.sequence_enrollments (next_run_at) where status = 'active';
create index if not exists sequence_enrollments_seq_idx on public.sequence_enrollments (sequence_id, status);

-- suppressions — the global block list (PRD-only, D-087/D-089). Service-role write.
create table if not exists public.suppressions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email        text not null,
  reason       public.suppression_reason not null default 'manual',
  source       text,
  created_at   timestamptz not null default now()
);
create unique index if not exists suppressions_ws_email_idx on public.suppressions (workspace_id, lower(email));

-- send_events — per-recipient delivery/engagement ledger (PRD-only, D-087/D-089).
-- Append-only; service-role write (worker + signed webhook). `token` is the
-- unguessable per-recipient tracking key used by the pixel/click/unsub endpoints.
create table if not exists public.send_events (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  campaign_id         uuid references public.email_campaigns(id) on delete cascade,
  step_id             uuid references public.sequence_steps(id) on delete cascade,
  enrollment_id       uuid references public.sequence_enrollments(id) on delete cascade,
  contact_id          uuid references public.contacts(id) on delete set null,
  email               text,
  type                public.send_event_type not null,
  url                 text,                                -- for 'clicked'
  token               uuid not null default gen_random_uuid(),
  provider_message_id text,
  created_at          timestamptz not null default now()
);
create index if not exists send_events_campaign_idx on public.send_events (workspace_id, campaign_id, type);
create index if not exists send_events_token_idx     on public.send_events (token);
create index if not exists send_events_step_idx      on public.send_events (step_id, type);

-- email_templates — saved + seeded templates. workspace_id NULL = a global builtin.
create table if not exists public.email_templates (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,  -- NULL = global seed
  name         text not null,
  category     text,
  thumbnail    text,
  body_json    jsonb not null default '{"blocks":[]}',
  is_builtin   boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists email_templates_ws_idx on public.email_templates (workspace_id);

-- ── 3. updated_at triggers ───────────────────────────────────────────────────
create trigger email_campaigns_set_updated_at before update on public.email_campaigns
  for each row execute function public.set_updated_at();
create trigger sequences_set_updated_at before update on public.sequences
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RLS + policies (RLS-AND-SECURITY §3 standard template + M16 posture)
--    email_campaigns / sender_identities: member read · staff+ ins/upd · manager+ del
--    sequences / sequence_steps:          config = manager+ write (like M14/M13)
--    sequence_enrollments:                member read · staff+ ins (manual enroll) · manager+ del
--    send_events / suppressions / campaign_stats: member READ · NO client write
--                                          (service-role only — D-089)
--    email_templates:                     global (null ws) world-read + workspace-scoped
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.sender_identities enable row level security;
create policy sender_identities_sel on public.sender_identities for select using ( public.is_member(workspace_id) );
create policy sender_identities_ins on public.sender_identities for insert with check ( public.has_role(workspace_id,'staff') );
create policy sender_identities_upd on public.sender_identities for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy sender_identities_del on public.sender_identities for delete using ( public.has_role(workspace_id,'manager') );

alter table public.email_campaigns enable row level security;
create policy email_campaigns_sel on public.email_campaigns for select using ( public.is_member(workspace_id) );
create policy email_campaigns_ins on public.email_campaigns for insert with check ( public.has_role(workspace_id,'staff') );
create policy email_campaigns_upd on public.email_campaigns for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy email_campaigns_del on public.email_campaigns for delete using ( public.has_role(workspace_id,'manager') );

-- campaign_stats — trigger-written from send_events; browser reads only (D-089).
alter table public.campaign_stats enable row level security;
create policy campaign_stats_sel on public.campaign_stats for select using ( public.is_member(workspace_id) );

alter table public.sequences enable row level security;
create policy sequences_sel on public.sequences for select using ( public.is_member(workspace_id) );
create policy sequences_ins on public.sequences for insert with check ( public.has_role(workspace_id,'manager') );
create policy sequences_upd on public.sequences for update using ( public.has_role(workspace_id,'manager') ) with check ( public.has_role(workspace_id,'manager') );
create policy sequences_del on public.sequences for delete using ( public.has_role(workspace_id,'manager') );

alter table public.sequence_steps enable row level security;
create policy sequence_steps_sel on public.sequence_steps for select using ( public.is_member(workspace_id) );
create policy sequence_steps_ins on public.sequence_steps for insert with check ( public.has_role(workspace_id,'manager') );
create policy sequence_steps_upd on public.sequence_steps for update using ( public.has_role(workspace_id,'manager') ) with check ( public.has_role(workspace_id,'manager') );
create policy sequence_steps_del on public.sequence_steps for delete using ( public.has_role(workspace_id,'manager') );

alter table public.sequence_enrollments enable row level security;
create policy sequence_enrollments_sel on public.sequence_enrollments for select using ( public.is_member(workspace_id) );
create policy sequence_enrollments_ins on public.sequence_enrollments for insert with check ( public.has_role(workspace_id,'staff') );
create policy sequence_enrollments_upd on public.sequence_enrollments for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy sequence_enrollments_del on public.sequence_enrollments for delete using ( public.has_role(workspace_id,'manager') );

-- suppressions — the browser may READ the block list but NEVER write it. Additions
-- come from the worker/webhook (bounce/complaint) or the unsubscribe endpoint, all
-- service-role via suppress_email()/unsubscribe_email() (D-089). No I/U/D policy.
alter table public.suppressions enable row level security;
create policy suppressions_sel on public.suppressions for select using ( public.is_member(workspace_id) );

-- send_events — append-only delivery ledger; service-role write only (D-089). No I/U/D policy.
alter table public.send_events enable row level security;
create policy send_events_sel on public.send_events for select using ( public.is_member(workspace_id) );

-- email_templates — global builtins are world-readable so the builder can offer them;
-- workspace rows are tenant-scoped. Writes (save-as-template) are staff+, workspace-scoped.
alter table public.email_templates enable row level security;
create policy email_templates_sel on public.email_templates for select
  using ( workspace_id is null or public.is_member(workspace_id) );
create policy email_templates_ins on public.email_templates for insert
  with check ( workspace_id is not null and public.has_role(workspace_id,'staff') );
create policy email_templates_upd on public.email_templates for update
  using ( workspace_id is not null and public.has_role(workspace_id,'staff') )
  with check ( workspace_id is not null and public.has_role(workspace_id,'staff') );
create policy email_templates_del on public.email_templates for delete
  using ( workspace_id is not null and public.has_role(workspace_id,'manager') );

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Stats rollup trigger — every send_event rolls into campaign_stats / step
--    counters so the numbers can't drift from the ledger (D-089). Service-role
--    (definer) — runs on the worker/webhook insert path.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.roll_send_event()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.campaign_id is not null then
    insert into public.campaign_stats (workspace_id, campaign_id)
    values (new.workspace_id, new.campaign_id)
    on conflict (campaign_id) do nothing;
    update public.campaign_stats set
      sent         = sent         + (new.type = 'sent')::int,
      delivered    = delivered    + (new.type = 'delivered')::int,
      opened       = opened       + (new.type = 'opened')::int,
      clicked      = clicked      + (new.type = 'clicked')::int,
      bounced      = bounced      + (new.type = 'bounced')::int,
      unsubscribed = unsubscribed + (new.type = 'unsubscribed')::int
    where campaign_id = new.campaign_id;
  end if;
  if new.step_id is not null then
    update public.sequence_steps set
      sent    = sent    + (new.type = 'sent')::int,
      opened  = opened  + (new.type = 'opened')::int,
      clicked = clicked + (new.type = 'clicked')::int
    where id = new.step_id;
  end if;
  return new;
end $$;

create trigger send_events_roll_trg
  after insert on public.send_events
  for each row execute function public.roll_send_event();

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Audience resolver + compliance helpers
-- ═══════════════════════════════════════════════════════════════════════════

-- resolve_campaign_audience — the eligible recipient set for a broadcast: the base
-- audience (all | tag | smartlist via M09's smart_list_eval) MINUS the suppression
-- list MINUS the most-recent email opt-OUT (matching consent-check's most-recent-wins).
-- Definer so the UI can show a live eligible count and the worker can fan out.
create or replace function public.resolve_campaign_audience(p_ws uuid, p_audience jsonb)
returns setof public.contacts
language plpgsql stable security definer set search_path = public as $$
declare v_type text; v_ref uuid;
begin
  -- Authenticated callers must be members (the UI's live count path); the service
  -- role (auth.uid() null — the worker's fan-out) is trusted and passes.
  if auth.uid() is not null and not public.is_member(p_ws) then
    raise exception 'not a member of workspace %', p_ws using errcode = '42501';
  end if;
  v_type := coalesce(p_audience->>'type', 'all');
  v_ref  := nullif(p_audience->>'ref', '')::uuid;

  return query
  select c.* from public.contacts c
  where c.workspace_id = p_ws
    and c.deleted_at is null
    and c.email is not null
    and (
      v_type = 'all'
      or (v_type = 'tag' and exists (
            select 1 from public.contact_tags ct
             where ct.contact_id = c.id and ct.tag_id = v_ref))
      or (v_type = 'smartlist' and c.id in (
            select public.smart_list_eval(p_ws,
              (select definition from public.smart_lists where id = v_ref and workspace_id = p_ws))))
    )
    and not exists (
      select 1 from public.suppressions s
       where s.workspace_id = p_ws and lower(s.email) = lower(c.email))
    and not exists (
      select 1 from public.consent_records cr
       where cr.workspace_id = p_ws and cr.contact_id = c.id and cr.kind = 'email_optin'
         and cr.granted = false
         and cr.created_at = (
           select max(created_at) from public.consent_records
            where workspace_id = p_ws and contact_id = c.id and kind = 'email_optin'));
end $$;

-- suppress_email — add an address to the block list (bounce/complaint/manual/unsub).
-- Service-role / worker / webhook. Idempotent on (workspace_id, lower(email)).
create or replace function public.suppress_email(
  p_ws uuid, p_email text, p_reason public.suppression_reason default 'manual', p_source text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.suppressions (workspace_id, email, reason, source)
  values (p_ws, p_email, p_reason, p_source)
  on conflict (workspace_id, lower(email)) do nothing;
end $$;

-- unsubscribe_email — THE one-click unsubscribe (D-090). Dual-writes: the block list
-- (fast per-send lookup) AND an M05 consent opt-out (the legal ledger), so a later
-- consent-check and a later suppression-check give the same answer. Service-role
-- (the public email-unsubscribe endpoint has no JWT — the token is the authorization).
create or replace function public.unsubscribe_email(p_ws uuid, p_email text, p_contact uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.suppress_email(p_ws, p_email, 'unsub', 'unsub_link');
  insert into public.consent_records (workspace_id, contact_id, kind, granted, source, evidence)
  values (p_ws, p_contact, 'email_optin', false, 'unsub_link',
          jsonb_build_object('email', p_email, 'via', 'campaign_unsubscribe'));
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Dispatch / tick enqueuers — the two crons' bodies (thin, idempotent).
--    Cron never sends; it only enqueues `queued` jobs the worker owns (Gate-4).
-- ═══════════════════════════════════════════════════════════════════════════

-- dispatch_scheduled_broadcasts — flip due `scheduled` broadcasts to `sending` and
-- enqueue one campaign.send fan-out job each (idempotent on the campaign id).
create or replace function public.dispatch_scheduled_broadcasts()
returns int
language plpgsql security definer set search_path = public as $$
declare v_count int := 0; r record;
begin
  for r in
    select id, workspace_id from public.email_campaigns
     where status = 'scheduled' and scheduled_at is not null and scheduled_at <= now()
     for update skip locked
  loop
    update public.email_campaigns set status = 'sending' where id = r.id;
    insert into public.jobs (workspace_id, type, payload, status, idempotency_key)
    values (r.workspace_id, 'campaign.send', jsonb_build_object('campaign_id', r.id), 'queued', 'campaign:'||r.id)
    on conflict (workspace_id, type, idempotency_key) where idempotency_key is not null do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- tick_due_enrollments — reconciliation backstop: re-enqueue a sequence.step job for
-- any active enrollment whose next_run_at slipped (the primary path is the run_after
-- delayed job the worker schedules; this catches misses). Idempotent per (enrollment, step).
create or replace function public.tick_due_enrollments()
returns int
language plpgsql security definer set search_path = public as $$
declare v_count int := 0; r record;
begin
  for r in
    select id, workspace_id, current_step from public.sequence_enrollments
     where status = 'active' and next_run_at is not null and next_run_at <= now()
     for update skip locked
  loop
    insert into public.jobs (workspace_id, type, payload, status, idempotency_key)
    values (r.workspace_id, 'sequence.step',
            jsonb_build_object('enrollment_id', r.id), 'queued',
            'seqstep:'||r.id||':'||r.current_step)
    on conflict (workspace_id, type, idempotency_key) where idempotency_key is not null do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ── 8. Grants — the browser (authenticated) may compute the audience count; every
--    mutation (suppress/unsubscribe/dispatch/tick) is service-role only (D-089).
revoke all on function public.resolve_campaign_audience(uuid, jsonb) from public;
revoke all on function public.suppress_email(uuid, text, public.suppression_reason, text) from public;
revoke all on function public.unsubscribe_email(uuid, text, uuid) from public;
revoke all on function public.dispatch_scheduled_broadcasts() from public;
revoke all on function public.tick_due_enrollments() from public;
grant execute on function public.resolve_campaign_audience(uuid, jsonb) to authenticated, service_role;
grant execute on function public.suppress_email(uuid, text, public.suppression_reason, text) to service_role;
grant execute on function public.unsubscribe_email(uuid, text, uuid) to service_role;
grant execute on function public.dispatch_scheduled_broadcasts() to service_role;
grant execute on function public.tick_due_enrollments() to service_role;

-- ── 9. Global template seed (10 builtins; PRD prompt: "10 seed templates, expand
--    later"). workspace_id NULL = global. Guarded so re-running never duplicates.
insert into public.email_templates (workspace_id, name, category, body_json, is_builtin)
select * from (values
  (null::uuid, 'Welcome',            'onboarding',    '{"blocks":[{"type":"text","text":"Welcome to {{company}}, {{first_name}}!"}]}'::jsonb, true),
  (null::uuid, 'Monthly Newsletter', 'newsletter',    '{"blocks":[{"type":"text","text":"This month at {{company}}"}]}'::jsonb, true),
  (null::uuid, 'Product Launch',      'promo',         '{"blocks":[{"type":"text","text":"Introducing our newest offering"}]}'::jsonb, true),
  (null::uuid, 'Event Invitation',    'event',         '{"blocks":[{"type":"text","text":"You are invited, {{first_name}}"}]}'::jsonb, true),
  (null::uuid, 'We Miss You',         're-engagement', '{"blocks":[{"type":"text","text":"It has been a while, {{first_name}}"}]}'::jsonb, true),
  (null::uuid, 'Receipt',             'receipt',       '{"blocks":[{"type":"text","text":"Thanks for your purchase"}]}'::jsonb, true),
  (null::uuid, 'Big Announcement',    'announcement',  '{"blocks":[{"type":"text","text":"We have news to share"}]}'::jsonb, true),
  (null::uuid, 'Quick Survey',        'survey-invite', '{"blocks":[{"type":"text","text":"Got a minute, {{first_name}}?"}]}'::jsonb, true),
  (null::uuid, 'You Left Something',  'abandoned-cart','{"blocks":[{"type":"text","text":"Your cart is waiting"}]}'::jsonb, true),
  (null::uuid, 'Thank You',           'thank-you',     '{"blocks":[{"type":"text","text":"Thank you, {{first_name}}"}]}'::jsonb, true)
) as t(workspace_id, name, category, body_json, is_builtin)
where not exists (select 1 from public.email_templates where is_builtin = true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. pg_cron — broadcast dispatch (minutely) + sequence tick (hourly).
--     Guarded for PGlite (no pg_cron there). Registered in JOBS-AND-WORKERS-SPEC §5.
-- ═══════════════════════════════════════════════════════════════════════════
do $$ begin
  perform cron.schedule('m16-broadcast-dispatch', '* * * * *',
    $cron$ select public.dispatch_scheduled_broadcasts(); $cron$);
exception when others then
  raise notice 'pg_cron unavailable — m16-broadcast-dispatch not scheduled (%).', sqlerrm;
end $$;
do $$ begin
  perform cron.schedule('m16-sequence-tick', '0 * * * *',
    $cron$ select public.tick_due_enrollments(); $cron$);
exception when others then
  raise notice 'pg_cron unavailable — m16-sequence-tick not scheduled (%).', sqlerrm;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. Realtime — email_campaigns + campaign_stats in the publication so the list
--     and stat counters live-update as the worker/webhook writes. Guarded for PGlite.
-- ═══════════════════════════════════════════════════════════════════════════
do $$ begin
  alter publication supabase_realtime add table public.email_campaigns;
exception when others then
  raise notice 'supabase_realtime publication unavailable — email_campaigns not added (%).', sqlerrm;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.campaign_stats;
exception when others then
  raise notice 'supabase_realtime publication unavailable — campaign_stats not added (%).', sqlerrm;
end $$;
