-- ═══════════════════════════════════════════════════════════════════════════
-- 0002_jobs.sql — AiMindShare Session 0
-- Async control plane. Browser writes status='queued' ONLY (RLS-enforced);
-- workers own running/done/failed via service role. Atomic claim via
-- claim_job() using FOR UPDATE SKIP LOCKED so no two workers grab one row.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.jobs (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  type            text not null,                       -- dotted verb: 'blog.generate'
  payload         jsonb not null default '{}',
  status          public.job_status not null default 'queued',
  priority        int not null default 0,
  attempts        int not null default 0,
  max_attempts    int not null default 3,
  run_after       timestamptz not null default now(),  -- backoff / scheduling
  idempotency_key text,
  result          jsonb,
  error           text,
  locked_by       text,
  locked_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  done_at         timestamptz
);
create index if not exists jobs_workspace_id_idx    on public.jobs (workspace_id);
create index if not exists jobs_status_run_after_idx on public.jobs (status, run_after);
create unique index if not exists jobs_idempotency_uidx
  on public.jobs (workspace_id, type, idempotency_key)
  where idempotency_key is not null;

create trigger jobs_set_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- select : any member of the workspace
-- insert : any member, but ONLY status='queued' (browser can't seed running/done)
-- update/delete : NO policy → denied for anon/authenticated → service-role only
--                 (workers use the service_role key, which bypasses RLS)
alter table public.jobs enable row level security;
create policy jobs_sel on public.jobs for select
  using ( public.is_member(workspace_id) );
create policy jobs_ins on public.jobs for insert
  with check ( public.is_member(workspace_id) and status = 'queued' );

-- ── Atomic claim (service-role only) ─────────────────────────────────────────
-- Returns the claimed job (now 'running') or NULL when the queue is empty.
create or replace function public.claim_job(p_worker text)
returns public.jobs
language plpgsql security definer set search_path = public as $$
declare j public.jobs;
begin
  update public.jobs
     set status     = 'running',
         locked_by  = p_worker,
         locked_at  = now(),
         attempts   = attempts + 1,
         updated_at = now()
   where id = (
     select id from public.jobs
      where status = 'queued' and run_after <= now()
      order by priority desc, run_after asc
      for update skip locked
      limit 1
   )
   returning * into j;
  return j;   -- NULL row if nothing claimable
end $$;

revoke all on function public.claim_job(text) from public;
