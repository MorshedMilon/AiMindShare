-- ═══════════════════════════════════════════════════════════════════════════
-- 0014_m11_pipeline.sql — AiMindShare Session 9 · M11 Pipeline
--
-- Visual deal tracking. Ships DATA-SCHEMA §8 verbatim (pipelines, pipeline_stages,
-- deals) onto the locked stack, plus the four sub-resource / analytics tables the
-- PRD_M11 schema calls for (deal_notes, deal_files, deal_value_history,
-- pipeline_targets). PRD_M11's Prisma / React-DnD / BullMQ stack is superseded:
-- drag is SortableJS in the browser (D-025), the stage-change "event bus" is a
-- SECURITY DEFINER RPC that writes M09's activity_log timeline (Law 5 / the
-- accept-when), and there is NO async work in this module (no jobs, no cron).
--
-- Migration number 0014 (M03=0009, M41=0010, M04=0011, M09=0013; the `0012` gap is
-- the still-unresolved M05 renumber that Session 5 flagged for a human — NOT touched
-- here, migrations are append-only).
--
-- Depends on: 0001 tenancy (is_member/has_role), 0000 (set_updated_at), 0013 M09
-- (contacts + activity_log + log_activity() = PRD's timeline.add()). The deal_status
-- enum is specced in DATA-SCHEMA §8 but was never landed in 0000's registry, so M11
-- creates it here (idempotent, 0000's idiom); migrations are append-only (D-049).
--
-- Logged extensions / deviations from canonical §8 (Law 8):
--   • D-049  Permission model uses the ALREADY-REGISTERED pipeline.view /
--            pipeline.manage (0008 / _shared/permissions.ts) — NOT the PRD prompt's
--            create/edit/delete wording, which predates the M02 registry. Pipeline /
--            stage / target *config* = manager+ (pipeline.manage); day-to-day deal
--            work = the standard template (member read · staff+ ins/upd · manager+
--            del). Matches ROLE_MATRIX (staff = pipeline.view only) exactly.
--   • D-050  Stage-change event bus = move_deal_stage()/bulk_move_stage() SECURITY
--            DEFINER RPCs. Each atomically moves the deal AND writes a 'deal_change'
--            row to activity_log via log_activity() with the full M13 payload
--            {deal_id,old_stage_id,new_stage_id,contact_id,workspace_id}. That row
--            IS the durable event M13 will consume; M13's live trigger-bus is not
--            built yet, so its subscription is a documented scaffold (honest
--            deferral), never faked.
--   • D-051  deals.stage_entered_at (not in §8) added for the days-in-stage card
--            badge; set by the move RPCs. deal_value_history is written by a
--            SECURITY DEFINER AFTER-UPDATE trigger (can't be forgotten by any write
--            path). A table CHECK makes "lost requires reason" a hard invariant, not
--            just RPC-level.
--   • D-052  deal_files.asset_id is a bare uuid (M06 Media Library / AssetPicker not
--            built — no FK yet; the picker is a scaffolded UI state). The default
--            pipeline + 5 stages deferred from M01 provisioning (D-020) are seeded by
--            the workspace.provision worker handler (see worker.mjs), and gdpr
--            export/erase are extended to the deals cascade (worker.mjs) — both were
--            already listed there as "deferred → …(M11)".
--
-- Order: tables → indexes → triggers → RLS + policies → RPCs → realtime. Every
-- table created here enables RLS in THIS file (Gate-8).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. Enum (DATA-SCHEMA §8; missing from 0000's registry — added here) ──────
do $$ begin
  create type public.deal_status as enum ('open','won','lost');
exception when duplicate_object then null; end $$;

-- ── 1. Tables (DATA-SCHEMA §8 verbatim + logged extensions) ──────────────────

-- pipelines — a named board. §8 verbatim.
create table if not exists public.pipelines (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  created_at    timestamptz not null default now()
);
create index if not exists pipelines_ws_idx on public.pipelines (workspace_id);

-- pipeline_stages — ordered columns with a close probability (0..100). §8 verbatim.
create table if not exists public.pipeline_stages (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  pipeline_id       uuid not null references public.pipelines(id) on delete cascade,
  name              text not null,
  order_index       int not null,
  close_probability numeric(5,2),                 -- percent 0..100; forecast = value×prob/100
  color             text                          -- hue key ('slate'|'teal'|'gold'|'amber'|'green'); UI maps to tokens
);
create index if not exists pipeline_stages_pipeline_idx on public.pipeline_stages (pipeline_id, order_index);
create index if not exists pipeline_stages_ws_idx       on public.pipeline_stages (workspace_id);

-- deals — the card. §8 verbatim + stage_entered_at (D-051) + lost-reason CHECK.
create table if not exists public.deals (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  pipeline_id         uuid references public.pipelines(id) on delete cascade,
  stage_id            uuid references public.pipeline_stages(id),
  contact_id          uuid references public.contacts(id) on delete set null,
  title               text,
  value               numeric(12,2),
  currency            char(3) default 'USD',
  assigned_to         uuid references auth.users(id),
  expected_close_date date,
  status              public.deal_status not null default 'open',
  lost_reason         text,
  won_at              timestamptz,
  stage_entered_at    timestamptz not null default now(),   -- D-051: days-in-stage badge
  created_at          timestamptz not null default now(),
  updated_at          timestamptz,
  constraint deal_lost_reason check (
    status <> 'lost' or (lost_reason is not null and length(trim(lost_reason)) > 0)
  )
);
create index if not exists deals_ws_pipeline_stage_idx on public.deals (workspace_id, pipeline_id, stage_id);
create index if not exists deals_ws_status_idx         on public.deals (workspace_id, status);
create index if not exists deals_contact_idx           on public.deals (contact_id);
create index if not exists deals_assignee_idx          on public.deals (assigned_to);

-- deal_notes — free-text notes on a deal (PRD DealNote). Mirrors contact_notes.
create table if not exists public.deal_notes (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  deal_id       uuid not null references public.deals(id) on delete cascade,
  user_id       uuid references auth.users(id),
  content       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);
create index if not exists deal_notes_deal_idx on public.deal_notes (deal_id, created_at desc);

-- deal_files — files attached to a deal (PRD DealFile). asset_id references the M06
-- Media Library asset (NOT built yet → bare uuid, no FK; D-052). file_name is the
-- display label the drawer shows until the AssetPicker lands.
create table if not exists public.deal_files (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  deal_id       uuid not null references public.deals(id) on delete cascade,
  asset_id      uuid,                             -- → M06 assets(id) when M06 ships
  file_name     text,
  added_by      uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index if not exists deal_files_deal_idx on public.deal_files (deal_id);

-- deal_value_history — append-only log of every value change (PRD DealValueHistory).
-- Written by the deals_value_history trigger below, never by hand.
create table if not exists public.deal_value_history (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  deal_id       uuid not null references public.deals(id) on delete cascade,
  old_value     numeric(12,2),
  new_value     numeric(12,2),
  changed_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index if not exists deal_value_history_deal_idx on public.deal_value_history (deal_id, created_at desc);

-- pipeline_targets — the monthly revenue target the forecast bar measures against
-- (PRD PipelineTarget { pipelineId, monthlyTarget }). One row per pipeline.
create table if not exists public.pipeline_targets (
  pipeline_id    uuid primary key references public.pipelines(id) on delete cascade,
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  monthly_target numeric(12,2) not null default 0,
  updated_at     timestamptz
);
create index if not exists pipeline_targets_ws_idx on public.pipeline_targets (workspace_id);

-- ── 2. Triggers ──────────────────────────────────────────────────────────────
create trigger deals_set_updated_at           before update on public.deals           for each row execute function public.set_updated_at();
create trigger deal_notes_set_updated_at       before update on public.deal_notes      for each row execute function public.set_updated_at();
create trigger pipeline_targets_set_updated_at before update on public.pipeline_targets for each row execute function public.set_updated_at();

-- deal_value_history writer — append a history row whenever value actually changes
-- (D-051). SECURITY DEFINER so the append lands regardless of the caller's RLS
-- (the table has no client insert policy — it's append-only-by-trigger).
create or replace function public.deals_log_value_change()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.value is distinct from old.value then
    insert into public.deal_value_history (workspace_id, deal_id, old_value, new_value, changed_by)
    values (new.workspace_id, new.id, old.value, new.value, auth.uid());
  end if;
  return new;
end $$;

create trigger deals_value_history after update of value on public.deals
  for each row execute function public.deals_log_value_change();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RLS + policies (RLS-AND-SECURITY §3 standard template unless noted)
--    Config (pipelines/stages/targets): member read · manager+ write (D-049).
--    Operational (deals/notes/files): member read · staff+ ins/upd · manager+ del.
--    History: member read · append-only (trigger-written, no client write).
-- ═══════════════════════════════════════════════════════════════════════════

-- pipelines — config, manager+.
alter table public.pipelines enable row level security;
create policy pipelines_sel on public.pipelines for select using ( public.is_member(workspace_id) );
create policy pipelines_ins on public.pipelines for insert with check ( public.has_role(workspace_id,'manager') );
create policy pipelines_upd on public.pipelines for update using ( public.has_role(workspace_id,'manager') ) with check ( public.has_role(workspace_id,'manager') );
create policy pipelines_del on public.pipelines for delete using ( public.has_role(workspace_id,'manager') );

-- pipeline_stages — config, manager+.
alter table public.pipeline_stages enable row level security;
create policy pipeline_stages_sel on public.pipeline_stages for select using ( public.is_member(workspace_id) );
create policy pipeline_stages_ins on public.pipeline_stages for insert with check ( public.has_role(workspace_id,'manager') );
create policy pipeline_stages_upd on public.pipeline_stages for update using ( public.has_role(workspace_id,'manager') ) with check ( public.has_role(workspace_id,'manager') );
create policy pipeline_stages_del on public.pipeline_stages for delete using ( public.has_role(workspace_id,'manager') );

-- pipeline_targets — a setting, manager+.
alter table public.pipeline_targets enable row level security;
create policy pipeline_targets_sel on public.pipeline_targets for select using ( public.is_member(workspace_id) );
create policy pipeline_targets_ins on public.pipeline_targets for insert with check ( public.has_role(workspace_id,'manager') );
create policy pipeline_targets_upd on public.pipeline_targets for update using ( public.has_role(workspace_id,'manager') ) with check ( public.has_role(workspace_id,'manager') );
create policy pipeline_targets_del on public.pipeline_targets for delete using ( public.has_role(workspace_id,'manager') );

-- deals — standard template. Stage moves go through the RPCs (D-050) but general
-- field edits (title/value/assignee) are a direct staff+ update.
alter table public.deals enable row level security;
create policy deals_sel on public.deals for select using ( public.is_member(workspace_id) );
create policy deals_ins on public.deals for insert with check ( public.has_role(workspace_id,'staff') );
create policy deals_upd on public.deals for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy deals_del on public.deals for delete using ( public.has_role(workspace_id,'manager') );

alter table public.deal_notes enable row level security;
create policy deal_notes_sel on public.deal_notes for select using ( public.is_member(workspace_id) );
create policy deal_notes_ins on public.deal_notes for insert with check ( public.has_role(workspace_id,'staff') );
create policy deal_notes_upd on public.deal_notes for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy deal_notes_del on public.deal_notes for delete using ( public.has_role(workspace_id,'manager') );

alter table public.deal_files enable row level security;
create policy deal_files_sel on public.deal_files for select using ( public.is_member(workspace_id) );
create policy deal_files_ins on public.deal_files for insert with check ( public.has_role(workspace_id,'staff') );
create policy deal_files_del on public.deal_files for delete using ( public.has_role(workspace_id,'staff') );  -- attach/detach is a staff action

-- deal_value_history — APPEND-ONLY: member reads, trigger writes (no client I/U/D).
alter table public.deal_value_history enable row level security;
create policy deal_value_history_sel on public.deal_value_history for select using ( public.is_member(workspace_id) );
-- (no insert/update/delete policy — the deals_value_history trigger writes via definer)

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RPCs — the stage-change event bus + close + forecast (D-050)
-- ═══════════════════════════════════════════════════════════════════════════

-- _move_one — internal: move a single deal to a stage in the caller's workspace and
-- write the timeline event. Assumes has_role already checked by the public wrapper.
-- Validates the target stage is in the SAME pipeline as the deal (no cross-pipeline
-- teleport) and same workspace. Returns the deal id moved (null if not eligible).
create or replace function public._move_deal_stage_one(p_ws uuid, p_deal uuid, p_stage uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_old uuid; v_contact uuid; v_pipeline uuid; v_stage_pipeline uuid;
begin
  select stage_id, contact_id, pipeline_id into v_old, v_contact, v_pipeline
    from public.deals where id = p_deal and workspace_id = p_ws;
  if not found then return null; end if;

  select pipeline_id into v_stage_pipeline
    from public.pipeline_stages where id = p_stage and workspace_id = p_ws;
  if not found then
    raise exception 'stage % not found in workspace', p_stage using errcode = 'P0002';
  end if;
  if v_pipeline is not null and v_stage_pipeline is distinct from v_pipeline then
    raise exception 'stage belongs to a different pipeline' using errcode = '22023';
  end if;

  if v_old is distinct from p_stage then
    update public.deals
       set stage_id = p_stage, stage_entered_at = now(), updated_at = now()
     where id = p_deal;
    perform public.log_activity(
      p_ws, v_contact, 'deal_change', 'Deal moved to a new stage',
      jsonb_build_object('deal_id', p_deal, 'old_stage_id', v_old,
                         'new_stage_id', p_stage, 'contact_id', v_contact, 'workspace_id', p_ws));
  end if;
  return p_deal;
end $$;

-- move_deal_stage — the single-card move the Kanban drag calls (staff+).
create or replace function public.move_deal_stage(p_ws uuid, p_deal uuid, p_stage uuid)
returns public.deals
language plpgsql security definer set search_path = public as $$
declare v_deal public.deals;
begin
  if not public.has_role(p_ws, 'staff') then
    raise exception 'moving a deal requires staff+' using errcode = '42501';
  end if;
  perform public._move_deal_stage_one(p_ws, p_deal, p_stage);
  select * into v_deal from public.deals where id = p_deal and workspace_id = p_ws;
  return v_deal;
end $$;

-- bulk_move_stage — list-view bulk move (staff+). Returns the count actually moved.
create or replace function public.bulk_move_stage(p_ws uuid, p_deals uuid[], p_stage uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n int := 0;
begin
  if not public.has_role(p_ws, 'staff') then
    raise exception 'moving deals requires staff+' using errcode = '42501';
  end if;
  foreach v_id in array coalesce(p_deals, '{}'::uuid[]) loop
    if public._move_deal_stage_one(p_ws, v_id, p_stage) is not null then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

-- close_deal — win / lose a deal (staff+). Lost REQUIRES a non-empty reason (also a
-- table CHECK). Won stamps won_at (revenue + date logged to the timeline; M40 reads
-- deals.value + won_at + this activity row). Writes the deal_change event.
create or replace function public.close_deal(p_ws uuid, p_deal uuid, p_status public.deal_status, p_lost_reason text default null)
returns public.deals
language plpgsql security definer set search_path = public as $$
declare v_deal public.deals; v_contact uuid; v_value numeric; v_desc text;
begin
  if not public.has_role(p_ws, 'staff') then
    raise exception 'closing a deal requires staff+' using errcode = '42501';
  end if;
  if p_status not in ('won','lost','open') then
    raise exception 'invalid close status %', p_status using errcode = '22023';
  end if;
  if p_status = 'lost' and (p_lost_reason is null or length(trim(p_lost_reason)) = 0) then
    raise exception 'a lost deal requires a reason' using errcode = '23514';
  end if;

  select contact_id, value into v_contact, v_value
    from public.deals where id = p_deal and workspace_id = p_ws;
  if not found then raise exception 'deal not found in workspace' using errcode = 'P0002'; end if;

  update public.deals set
    status      = p_status,
    won_at      = case when p_status = 'won'  then now() else null end,
    lost_reason = case when p_status = 'lost' then p_lost_reason else null end,
    updated_at  = now()
  where id = p_deal;

  v_desc := case p_status when 'won' then 'Deal won' when 'lost' then 'Deal lost' else 'Deal reopened' end;
  perform public.log_activity(
    p_ws, v_contact, 'deal_change', v_desc,
    jsonb_build_object('deal_id', p_deal, 'status', p_status, 'value', v_value,
                       'lost_reason', p_lost_reason, 'contact_id', v_contact, 'workspace_id', p_ws));

  select * into v_deal from public.deals where id = p_deal and workspace_id = p_ws;
  return v_deal;
end $$;

-- pipeline_forecast — the weighted forecast the header bar shows (accept-when).
-- weighted = Σ(open deal value × its stage close_probability / 100). Also returns
-- the open/won rollups and the pipeline's monthly target.
create or replace function public.pipeline_forecast(p_ws uuid, p_pipeline uuid)
returns table (weighted numeric, open_total numeric, open_count int, won_total numeric, won_count int, lost_count int, target numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member(p_ws) then
    raise exception 'not a member of workspace %', p_ws using errcode = '42501';
  end if;
  return query
  with d as (
    select dl.value, dl.status, ps.close_probability
      from public.deals dl
      left join public.pipeline_stages ps on ps.id = dl.stage_id
     where dl.workspace_id = p_ws and dl.pipeline_id = p_pipeline
  )
  select
    coalesce(sum(case when status = 'open' then value * coalesce(close_probability,0) / 100 end), 0)::numeric,
    coalesce(sum(case when status = 'open' then value end), 0)::numeric,
    count(*) filter (where status = 'open')::int,
    coalesce(sum(case when status = 'won' then value end), 0)::numeric,
    count(*) filter (where status = 'won')::int,
    count(*) filter (where status = 'lost')::int,
    coalesce((select monthly_target from public.pipeline_targets where pipeline_id = p_pipeline), 0)::numeric
  from d;
end $$;

revoke all on function public.move_deal_stage(uuid, uuid, uuid) from public;
revoke all on function public.bulk_move_stage(uuid, uuid[], uuid) from public;
revoke all on function public.close_deal(uuid, uuid, public.deal_status, text) from public;
revoke all on function public.pipeline_forecast(uuid, uuid) from public;
grant execute on function public.move_deal_stage(uuid, uuid, uuid) to authenticated;
grant execute on function public.bulk_move_stage(uuid, uuid[], uuid) to authenticated;
grant execute on function public.close_deal(uuid, uuid, public.deal_status, text) to authenticated;
grant execute on function public.pipeline_forecast(uuid, uuid) to authenticated;
-- _move_deal_stage_one stays private (no grant) — only the wrappers call it.

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Realtime — deals in the publication so open boards live-update across users
--    (optimistic-drag is local; this keeps other viewers in sync). Guarded for PGlite.
-- ═══════════════════════════════════════════════════════════════════════════
do $$ begin
  alter publication supabase_realtime add table public.deals;
exception when others then
  raise notice 'supabase_realtime publication unavailable — deals not added (%).', sqlerrm;
end $$;
