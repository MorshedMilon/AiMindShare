-- ═══════════════════════════════════════════════════════════════════════════
-- 0016_m13_automations.sql — M13 Automations (Session 11)
-- The platform's nervous system: a visual no-code workflow engine + a central
-- trigger bus every module publishes to. Built VERTICALLY on the locked stack —
-- vanilla HTML/CSS/JS + Supabase — NOT the PRD's React Flow / BullMQ / GPT-4o /
-- Zod sketch (all dead-stack here). Reconciliation recorded in DECISIONS:
--   · Canvas         → Drawflow (vanilla, vendored), NOT React Flow (D-060).
--   · Execution      → the public.jobs queue + a node-walker in worker.mjs; a
--                      WAIT node is a delayed re-queue via jobs.run_after (D-061).
--   · Trigger bus    → this file's emit_trigger(ws,type,payload) SECURITY DEFINER
--                      fn — the shape of M04 notify() / M03 meter_increment; every
--                      module calls it (D-062).
--   · AI builder     → scaffold; no LLM provider is chosen yet (like email/D-011),
--                      so ai-generate returns a template-derived draft and meters
--                      ai_tokens only on a real provider call (D-063).
--
-- Ground truth reconciled against the codebase (not the PRD):
--   · The M13 tables did not exist; DATA-SCHEMA §9 names them. Created HERE with
--     platform extensions: workflows.reentry_rule + workflows.version, a
--     workflow_versions snapshot table (so editing a live workflow can't corrupt
--     a running execution — PRD §3 / AC-3), and a global workflow_templates seed.
--   · The bus wires to the tables that EXIST today (M09 contacts/contact_tags,
--     M11 deals, M12 messages). Triggers for not-yet-built sources (forms M15,
--     appointments M14, payments M28) live in the registry as honest stubs.
--
-- Migration numbered 0016 (0000–0015 taken; two 0010s + a missing 0012 are the
-- known parallel-build collisions — M13 has no ordering dep on them). Order in
-- file: enums → tables → indexes → RLS → version-snapshot triggers → emit_trigger
-- + enrolment → source triggers (contacts/tags/deals/messages) → guarded mover →
-- date-sweep cron. Every new tenant table enables RLS in THIS file (DoD Gate-8).
--
-- PGlite-safety: the probe strips `create extension` and runs the raw SQL, so the
-- one statement PGlite lacks — cron.schedule() — is wrapped in a guarded DO block
-- that swallows the error (identical to M04/M05). Enums are guarded too.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. Enums (guarded — a duplicate is a no-op on re-run) ─────────────────────
do $$ begin
  create type public.workflow_exec_status as enum ('running','waiting','completed','failed','cancelled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.workflow_step_status as enum ('success','failed','skipped');
exception when duplicate_object then null; end $$;

-- ── 1. workflows — one row per automation; Drawflow writes nodes/edges jsonb ───
-- trigger_type is a registry key (contact.created, tag.added, deal.stage_changed,
-- message.received, date.scheduled, manual, + deferred form/appointment/payment).
-- trigger_config narrows the match (e.g. {tag_id} for tag.added, {stage_id} for a
-- specific stage). reentry_rule ∈ allow | once | once_per_days:N controls whether a
-- contact re-enters. version is bumped by trigger whenever nodes/edges change; a
-- snapshot of each version lives in workflow_versions so running executions finish
-- on the version they started on. stats is a denormalised {runs_7d,last_run_at}
-- cache the list view reads without scanning executions.
create table if not exists public.workflows (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  name           text not null default 'Untitled automation',
  description    text,
  trigger_type   text not null default 'manual',
  trigger_config jsonb not null default '{}',
  nodes          jsonb not null default '[]',
  edges          jsonb not null default '[]',
  is_active      boolean not null default false,
  reentry_rule   text not null default 'once',
  version        int not null default 1,
  stats          jsonb not null default '{}',
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz,
  constraint workflows_reentry_chk
    check (reentry_rule = 'allow' or reentry_rule = 'once' or reentry_rule ~ '^once_per_days:[0-9]+$')
);
create index if not exists workflows_ws_active_idx on public.workflows (workspace_id, is_active);
create index if not exists workflows_ws_trigger_idx on public.workflows (workspace_id, trigger_type) where is_active;

drop trigger if exists workflows_set_updated_at on public.workflows;
create trigger workflows_set_updated_at before update on public.workflows
  for each row execute function public.set_updated_at();

-- ── 2. workflow_versions — immutable snapshot of nodes/edges per version ───────
-- Populated automatically by the version trigger below. A running execution reads
-- its pinned (workflow_id, version) row, so a mid-run edit to the live workflow
-- never changes the graph a walker is currently traversing (AC-3).
create table if not exists public.workflow_versions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  workflow_id  uuid not null references public.workflows(id) on delete cascade,
  version      int not null,
  nodes        jsonb not null,
  edges        jsonb not null,
  created_at   timestamptz not null default now(),
  unique (workflow_id, version)
);
create index if not exists workflow_versions_wf_idx on public.workflow_versions (workflow_id, version);

-- ── 3. workflow_executions — one per (workflow, contact) enrolment ─────────────
-- Written ONLY by emit_trigger()/the test Edge Fn/the worker (SECURITY DEFINER or
-- service role) — never by the browser (Gate-4). current_node_id is the walker's
-- resume point; is_test suppresses real sends; trigger_payload carries the event
-- context (contact_id, deal_id, …) the nodes read.
create table if not exists public.workflow_executions (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  workflow_id      uuid not null references public.workflows(id) on delete cascade,
  workflow_version int not null,
  contact_id       uuid references public.contacts(id) on delete set null,
  status           public.workflow_exec_status not null default 'running',
  current_node_id  text,
  is_test          boolean not null default false,
  trigger_payload  jsonb not null default '{}',
  error            text,
  started_at       timestamptz not null default now(),
  completed_at     timestamptz
);
create index if not exists workflow_executions_wf_idx on public.workflow_executions (workflow_id, started_at desc);
create index if not exists workflow_executions_ws_idx on public.workflow_executions (workspace_id, started_at desc);
-- concurrency/re-entry guard reads this hot path: active runs for a (workflow, contact).
create index if not exists workflow_executions_active_idx
  on public.workflow_executions (workflow_id, contact_id, status);

-- ── 4. workflow_execution_steps — per-node audit trail (green/red timeline) ────
create table if not exists public.workflow_execution_steps (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  execution_id uuid not null references public.workflow_executions(id) on delete cascade,
  node_id      text not null,
  node_type    text not null,
  status       public.workflow_step_status not null,
  result       jsonb not null default '{}',
  error        text,
  executed_at  timestamptz not null default now()
);
create index if not exists workflow_exec_steps_exec_idx
  on public.workflow_execution_steps (execution_id, executed_at);

-- ── 5. workflow_templates — GLOBAL seed gallery (workspace_id null = global) ───
-- Same global-read pattern as plans/roles: everyone reads the built-ins; a
-- workspace can also save its own. Install copies a template into a new workflow.
create table if not exists public.workflow_templates (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid references public.workspaces(id) on delete cascade,   -- null = global built-in
  key            text,
  name           text not null,
  description    text,
  category       text not null default 'general',
  icon           text,
  trigger_type   text not null,
  trigger_config jsonb not null default '{}',
  nodes          jsonb not null default '[]',
  edges          jsonb not null default '[]',
  is_global      boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (key)
);
create index if not exists workflow_templates_cat_idx on public.workflow_templates (category);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. RLS — workflows/versions are config (staff read, manager+ write; client
--    ceiling: automations are internal ops, clients see nothing). Executions +
--    steps are a system-written ledger (service-role insert, staff+ read).
--    Templates: global read + own-workspace read; manager+ may save own.
--    RLS-AND-SECURITY §2/§3.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.workflows enable row level security;
create policy workflows_sel on public.workflows for select using ( public.has_role(workspace_id,'staff') );
create policy workflows_ins on public.workflows for insert with check ( public.has_role(workspace_id,'manager') );
create policy workflows_upd on public.workflows for update
  using ( public.has_role(workspace_id,'manager') ) with check ( public.has_role(workspace_id,'manager') );
create policy workflows_del on public.workflows for delete using ( public.has_role(workspace_id,'manager') );

alter table public.workflow_versions enable row level security;
create policy workflow_versions_sel on public.workflow_versions for select using ( public.has_role(workspace_id,'staff') );
-- writes happen inside the SECURITY DEFINER snapshot trigger; no client INSERT/UPDATE/DELETE policy.

alter table public.workflow_executions enable row level security;
create policy workflow_executions_sel on public.workflow_executions for select using ( public.has_role(workspace_id,'staff') );
-- no client write policy: emit_trigger()/worker (definer/service-role) own the writes (Gate-4).

alter table public.workflow_execution_steps enable row level security;
create policy workflow_exec_steps_sel on public.workflow_execution_steps for select using ( public.has_role(workspace_id,'staff') );
-- no client write policy.

alter table public.workflow_templates enable row level security;
create policy workflow_templates_sel on public.workflow_templates for select
  using ( is_global or (workspace_id is not null and public.has_role(workspace_id,'staff')) );
create policy workflow_templates_ins on public.workflow_templates for insert
  with check ( workspace_id is not null and public.has_role(workspace_id,'manager') and is_global = false );
create policy workflow_templates_del on public.workflow_templates for delete
  using ( workspace_id is not null and public.has_role(workspace_id,'manager') );

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Version snapshot — bump workflows.version on graph change; snapshot each
--    version into workflow_versions. This is what lets a running execution finish
--    on its pinned version even after the live workflow is edited (AC-3).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.workflow_snapshot_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.nodes is distinct from old.nodes or new.edges is distinct from old.edges) then
    new.version := old.version + 1;
  end if;
  return new;
end $$;

drop trigger if exists workflows_version_bump on public.workflows;
create trigger workflows_version_bump before update on public.workflows
  for each row execute function public.workflow_snapshot_version();

-- After the row is written, persist the (version → nodes/edges) snapshot. Upsert so
-- re-saving the same version (no graph change) is idempotent.
create or replace function public.workflow_write_snapshot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.workflow_versions (workspace_id, workflow_id, version, nodes, edges)
  values (new.workspace_id, new.id, new.version, new.nodes, new.edges)
  on conflict (workflow_id, version) do update set nodes = excluded.nodes, edges = excluded.edges;
  return new;
end $$;

drop trigger if exists workflows_snapshot_after on public.workflows;
create trigger workflows_snapshot_after after insert or update on public.workflows
  for each row execute function public.workflow_write_snapshot();

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. emit_trigger — THE platform trigger bus. Every module calls it (directly in
--    SQL, or via the automations-trigger Edge Fn). Finds active workflows matching
--    (workspace, trigger_type) whose trigger_config is satisfied by the payload,
--    applies the re-entry rule + per-contact concurrency guard, and for each match
--    enrols an execution (pinned to the current version) + enqueues an
--    automation.execute job. Returns the number of executions started.
--    SECURITY DEFINER; callable by service_role AND authenticated (a human action —
--    adding a tag, moving a deal — legitimately fans out to automations). The
--    _depth backstop (payload._depth) caps runaway trigger→action→trigger cascades.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.emit_trigger(p_ws uuid, p_type text, p_payload jsonb default '{}'::jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  wf         record;
  c_id       uuid := nullif(p_payload->>'contact_id','')::uuid;
  depth      int  := coalesce((p_payload->>'_depth')::int, 0);
  cfg        jsonb;
  reentry    text;
  days       int;
  enrol      boolean;
  exec_id    uuid;
  made       int := 0;
begin
  if depth >= 10 then return 0; end if;                    -- cascade backstop

  for wf in
    select id, version, trigger_config, reentry_rule
      from public.workflows
     where workspace_id = p_ws and is_active and trigger_type = p_type
  loop
    cfg := wf.trigger_config;

    -- trigger_config narrows the match: every key present in cfg must equal the
    -- same key in the payload (e.g. {tag_id}, {stage_id}, {pipeline_id}). An empty
    -- cfg matches everything.
    if cfg is not null and cfg <> '{}'::jsonb then
      continue when exists (
        select 1 from jsonb_each_text(cfg) kv
         where coalesce(p_payload->>kv.key,'') <> kv.value
      );
    end if;

    -- Re-entry + concurrency guard (skipped when there is no contact context).
    enrol := true;
    reentry := wf.reentry_rule;
    if c_id is not null then
      -- one active run per (workflow, contact) unless the rule explicitly allows re-entry
      if reentry <> 'allow' and exists (
        select 1 from public.workflow_executions
         where workflow_id = wf.id and contact_id = c_id and status in ('running','waiting')
      ) then
        enrol := false;
      elsif reentry = 'once' and exists (
        select 1 from public.workflow_executions where workflow_id = wf.id and contact_id = c_id
      ) then
        enrol := false;
      elsif reentry ~ '^once_per_days:[0-9]+$' then
        days := split_part(reentry, ':', 2)::int;
        if exists (
          select 1 from public.workflow_executions
           where workflow_id = wf.id and contact_id = c_id
             and started_at > now() - make_interval(days => days)
        ) then
          enrol := false;
        end if;
      end if;
    end if;

    if not enrol then continue; end if;

    insert into public.workflow_executions (workspace_id, workflow_id, workflow_version, contact_id, trigger_payload)
    values (p_ws, wf.id, wf.version,
            c_id,
            jsonb_set(coalesce(p_payload,'{}'::jsonb), '{_depth}', to_jsonb(depth + 1)))
    returning id into exec_id;

    insert into public.jobs (workspace_id, type, payload, idempotency_key)
    values (p_ws, 'automation.execute',
            jsonb_build_object('execution_id', exec_id, 'workspace_id', p_ws),
            'automation-exec-' || exec_id);

    made := made + 1;
  end loop;

  return made;
end $$;
revoke all on function public.emit_trigger(uuid, text, jsonb) from public;
grant execute on function public.emit_trigger(uuid, text, jsonb) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Source triggers — the bus's real inputs, wired to the tables that exist.
--    Each is additive and self-contained in this migration (M13 owns the wiring;
--    it does not edit M09/M11/M12). The loop guard app.in_automation lets the
--    walker's own deal move avoid re-emitting deal.stage_changed (§10).
-- ═══════════════════════════════════════════════════════════════════════════

-- contact.created — any new contact (human OR the CSV-import worker) enrols.
create or replace function public.tg_emit_contact_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.emit_trigger(new.workspace_id, 'contact.created',
    jsonb_build_object('contact_id', new.id, 'source', new.source));
  return new;
end $$;
drop trigger if exists contacts_emit_created on public.contacts;
create trigger contacts_emit_created after insert on public.contacts
  for each row execute function public.tg_emit_contact_created();

-- tag.added — a tag applied to a contact. trigger_config {tag_id} narrows it.
create or replace function public.tg_emit_tag_added() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.emit_trigger(new.workspace_id, 'tag.added',
    jsonb_build_object('contact_id', new.contact_id, 'tag_id', new.tag_id));
  return new;
end $$;
drop trigger if exists contact_tags_emit_added on public.contact_tags;
create trigger contact_tags_emit_added after insert on public.contact_tags
  for each row execute function public.tg_emit_tag_added();

-- deal.stage_changed — a deal moved to a new stage. Guarded: the walker's own
-- move (app.in_automation='1', §10) does NOT re-emit, so a workflow that moves a
-- deal can't trigger itself. trigger_config {stage_id}/{pipeline_id} narrows it.
create or replace function public.tg_emit_deal_stage() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.in_automation', true), '') = '1' then
    return new;
  end if;
  if new.stage_id is distinct from old.stage_id then
    perform public.emit_trigger(new.workspace_id, 'deal.stage_changed',
      jsonb_build_object('contact_id', new.contact_id, 'deal_id', new.id,
                         'pipeline_id', new.pipeline_id,
                         'stage_id', new.stage_id, 'old_stage_id', old.stage_id));
  end if;
  return new;
end $$;
drop trigger if exists deals_emit_stage on public.deals;
create trigger deals_emit_stage after update of stage_id on public.deals
  for each row execute function public.tg_emit_deal_stage();

-- message.received — an INBOUND message on a conversation (M12). Outbound sends
-- (incl. the walker's own send_* actions) never enrol.
create or replace function public.tg_emit_message_received() returns trigger
language plpgsql security definer set search_path = public as $$
declare c_id uuid;
begin
  if new.direction = 'inbound' then
    select contact_id into c_id from public.conversations where id = new.conversation_id;
    perform public.emit_trigger(new.workspace_id, 'message.received',
      jsonb_build_object('contact_id', c_id, 'conversation_id', new.conversation_id, 'channel', new.channel));
  end if;
  return new;
end $$;
drop trigger if exists messages_emit_received on public.messages;
create trigger messages_emit_received after insert on public.messages
  for each row execute function public.tg_emit_message_received();

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. automation_apply_move_deal — the ONLY path the walker's move_deal_stage
--     action uses. Sets the loop guard (local to this txn) so the deal.stage_changed
--     source trigger above skips, moves the deal, and logs a 'deal_change' activity
--     mirroring M11's payload shape. SECURITY DEFINER, service-role only.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.automation_apply_move_deal(p_ws uuid, p_deal uuid, p_stage uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare old_stage uuid; c_id uuid;
begin
  perform set_config('app.in_automation', '1', true);   -- local: skips the re-emit trigger
  select stage_id, contact_id into old_stage, c_id from public.deals
   where id = p_deal and workspace_id = p_ws;
  if not found then raise exception 'deal % not in workspace %', p_deal, p_ws; end if;
  if old_stage is distinct from p_stage then
    update public.deals set stage_id = p_stage, updated_at = now()
     where id = p_deal and workspace_id = p_ws;
    insert into public.activity_log (workspace_id, contact_id, type, description, metadata, actor_id)
    values (p_ws, c_id, 'deal_change', 'Moved by automation',
            jsonb_build_object('deal_id', p_deal, 'old_stage_id', old_stage,
                               'new_stage_id', p_stage, 'contact_id', c_id, 'via', 'automation'),
            null);
  end if;
end $$;
revoke all on function public.automation_apply_move_deal(uuid, uuid, uuid) from public;
grant execute on function public.automation_apply_move_deal(uuid, uuid, uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. Date-trigger sweep — daily pg_cron enqueues a date.scheduled emit sweep as
--     a job (birthdays / scheduled dates). The full date-matching lives with the
--     contact date fields (M09 rules engine, D-047) — the HOOK + schedule ship now
--     (the accept-when is the engine, not birthday matching). Guarded for PGlite.
-- ═══════════════════════════════════════════════════════════════════════════
do $$ begin
  perform cron.schedule(
    'm13-date-trigger-sweep',
    '0 6 * * *',
    $cron$
      insert into public.jobs (workspace_id, type, payload, idempotency_key)
      select w.id, 'automation.date_sweep',
             jsonb_build_object('date', current_date),
             'automation-datesweep-' || w.id || '-' || to_char(current_date,'YYYY-MM-DD')
        from public.workspaces w
       where w.deleted_at is null
         and exists (select 1 from public.workflows wf
                      where wf.workspace_id = w.id and wf.is_active and wf.trigger_type = 'date.scheduled')
      on conflict (workspace_id, type, idempotency_key) where idempotency_key is not null
      do nothing;
    $cron$
  );
exception when others then null; end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. Seed the 15 GLOBAL templates (workspace_id null, is_global) — built-in
--     reference data, like the 5 built-in roles. Install copies one into a new
--     workflow (editable). Graphs are normalised {nodes,edges}. Templates may use
--     registry trigger types whose SOURCE module isn't wired yet (appointment.*,
--     payment.*, form.submitted, intent.hot) — they install fine and fire once that
--     module lands (honest: the trigger exists in the registry, the source follows).
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.workflow_templates (key, name, description, category, icon, trigger_type, trigger_config, nodes, edges, is_global) values
('tmpl-welcome','7-Day Welcome Nurture','Greet every new contact and warm them up over a week.','nurture','sparkles','contact.created','{}',
 '[{"id":"t","type":"trigger"},{"id":"a","type":"send_email","config":{"subject":"Welcome 👋"}},{"id":"b","type":"wait","config":{"amount":2,"unit":"days"}},{"id":"c","type":"send_email","config":{"subject":"Getting started"}},{"id":"d","type":"wait","config":{"amount":3,"unit":"days"}},{"id":"e","type":"send_email","config":{"subject":"How can we help?"}}]',
 '[{"source":"t","target":"a"},{"source":"a","target":"b"},{"source":"b","target":"c"},{"source":"c","target":"d"},{"source":"d","target":"e"}]', true),
('tmpl-appt-reminder','Appointment Reminder','Text a reminder before a booked appointment.','booking','calendar','appointment.booked','{}',
 '[{"id":"t","type":"trigger"},{"id":"a","type":"wait","config":{"amount":1,"unit":"days"}},{"id":"b","type":"send_sms","config":{"body":"Reminder: your appointment is tomorrow."}}]',
 '[{"source":"t","target":"a"},{"source":"a","target":"b"}]', true),
('tmpl-review-request','Review Request','Ask happy won-deal clients for a review.','reputation','star','deal.stage_changed','{}',
 '[{"id":"t","type":"trigger"},{"id":"a","type":"wait","config":{"amount":1,"unit":"days"}},{"id":"b","type":"send_email","config":{"subject":"Would you leave us a review?"}}]',
 '[{"source":"t","target":"a"},{"source":"a","target":"b"}]', true),
('tmpl-cart-abandon','Cart Abandonment','Recover an abandoned checkout with a nudge.','sales','cart','form.submitted','{}',
 '[{"id":"t","type":"trigger"},{"id":"a","type":"wait","config":{"amount":1,"unit":"hours"}},{"id":"b","type":"send_email","config":{"subject":"You left something behind"}}]',
 '[{"source":"t","target":"a"},{"source":"a","target":"b"}]', true),
('tmpl-birthday','Birthday Greeting','Send a warm message on a contact''s birthday.','engagement','gift','date.scheduled','{}',
 '[{"id":"t","type":"trigger"},{"id":"a","type":"send_email","config":{"subject":"Happy birthday! 🎉"}}]',
 '[{"source":"t","target":"a"}]', true),
('tmpl-reengage','Re-Engagement','Win back contacts tagged cold.','engagement','refresh','tag.added','{"__hint":"cold"}',
 '[{"id":"t","type":"trigger"},{"id":"a","type":"send_email","config":{"subject":"We miss you"}},{"id":"b","type":"wait","config":{"amount":3,"unit":"days"}},{"id":"c","type":"if_else","config":{"field":"lead_score","operator":"greater_than","value":10}},{"id":"d","type":"internal_notification","config":{"targets":["manager"],"title":"Re-engaged lead"}}]',
 '[{"source":"t","target":"a"},{"source":"a","target":"b"},{"source":"b","target":"c"},{"source":"c","target":"d","sourceHandle":"true"}]', true),
('tmpl-onboarding','Client Onboarding','Kick off onboarding when a deal is won.','ops','rocket','deal.stage_changed','{}',
 '[{"id":"t","type":"trigger"},{"id":"a","type":"create_task","config":{"title":"Send onboarding pack","due_in_days":1}},{"id":"b","type":"internal_notification","config":{"targets":["all"],"title":"New client won 🎉"}},{"id":"c","type":"send_email","config":{"subject":"Welcome aboard"}}]',
 '[{"source":"t","target":"a"},{"source":"a","target":"b"},{"source":"b","target":"c"}]', true),
('tmpl-noshow','No-Show Rebook','Rebook a missed appointment.','booking','clock','appointment.no_show','{}',
 '[{"id":"t","type":"trigger"},{"id":"a","type":"send_sms","config":{"body":"Sorry we missed you — rebook here."}},{"id":"b","type":"create_task","config":{"title":"Follow up on no-show","due_in_days":1}}]',
 '[{"source":"t","target":"a"},{"source":"a","target":"b"}]', true),
('tmpl-invoice-chase','Invoice Chase','Chase an overdue invoice politely.','payments','receipt','payment.failed','{}',
 '[{"id":"t","type":"trigger"},{"id":"a","type":"send_email","config":{"subject":"Payment reminder"}},{"id":"b","type":"wait","config":{"amount":2,"unit":"days"}},{"id":"c","type":"send_sms","config":{"body":"Friendly reminder about your invoice."}}]',
 '[{"source":"t","target":"a"},{"source":"a","target":"b"},{"source":"b","target":"c"}]', true),
('tmpl-hot-intent','Hot-Intent Alert','Alert the team the moment a lead goes hot.','sales','flame','tag.added','{"__hint":"hot"}',
 '[{"id":"t","type":"trigger"},{"id":"a","type":"internal_notification","config":{"targets":["manager"],"title":"🔥 Hot lead"}},{"id":"b","type":"create_task","config":{"title":"Call hot lead now","due_in_days":0}}]',
 '[{"source":"t","target":"a"},{"source":"a","target":"b"}]', true),
('tmpl-newlead-tag','New Lead → Tag & Notify','Tag and announce every new lead.','sales','tag','contact.created','{}',
 '[{"id":"t","type":"trigger"},{"id":"a","type":"add_tag","config":{"tag_name":"New Lead"}},{"id":"b","type":"internal_notification","config":{"targets":["staff"],"title":"New lead in"}}]',
 '[{"source":"t","target":"a"},{"source":"a","target":"b"}]', true),
('tmpl-form-task','Form → CRM Task','Create a follow-up task from a form submission.','ops','clipboard','form.submitted','{}',
 '[{"id":"t","type":"trigger"},{"id":"a","type":"create_task","config":{"title":"Review form submission","due_in_days":1}},{"id":"b","type":"send_email","config":{"subject":"Thanks for reaching out"}}]',
 '[{"source":"t","target":"a"},{"source":"a","target":"b"}]', true),
('tmpl-stage-field','Stage Move → Update Field','Stamp a field when a deal advances.','sales','flag','deal.stage_changed','{}',
 '[{"id":"t","type":"trigger"},{"id":"a","type":"update_field","config":{"field":"source","value":"pipeline"}}]',
 '[{"source":"t","target":"a"}]', true),
('tmpl-reply-assign','Inbound Reply → Assign','Assign and alert on an inbound message.','inbox','inbox','message.received','{}',
 '[{"id":"t","type":"trigger"},{"id":"a","type":"internal_notification","config":{"targets":["staff"],"title":"New reply"}},{"id":"b","type":"create_task","config":{"title":"Respond to reply","due_in_days":0}}]',
 '[{"source":"t","target":"a"},{"source":"a","target":"b"}]', true),
('tmpl-vip','VIP Tagging Flow','Roll out the red carpet for VIP contacts.','engagement','crown','tag.added','{"__hint":"vip"}',
 '[{"id":"t","type":"trigger"},{"id":"a","type":"send_email","config":{"subject":"You''re a VIP ✨"}},{"id":"b","type":"create_task","config":{"title":"Personal VIP outreach","due_in_days":2}}]',
 '[{"source":"t","target":"a"},{"source":"a","target":"b"}]', true)
on conflict (key) do nothing;
