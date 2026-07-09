-- ═══════════════════════════════════════════════════════════════════════════
-- 0017_m14_calendar.sql — M14 Calendar & Booking (Session 12)
-- A Calendly replacement wired into the CRM (M09) + the automation bus (M13) +
-- the credential vault (M41). Built VERTICALLY on the locked stack — vanilla
-- HTML/CSS/JS + Supabase — NOT the PRD's Prisma/BullMQ/Next sketch. Reconciled
-- in DECISIONS this session:
--   · Slot engine   → compute_slots() SQL is authoritative for DB-visible
--                     constraints (availability, blocks, existing appts, buffer,
--                     notice, max/day, group capacity). Google freebusy is
--                     subtracted in the Edge Fn layer (it holds the token). UTC
--                     internal, tz rendered — DST-correct via per-date tz cast.
--   · Booking side- → an AFTER INSERT trigger on appointments does the CRM wiring
--     effects         (auto-tag "Appointment Booked" + log_activity timeline +
--                     reminder rows + emit_trigger('appointment.booked')). So a
--                     public booking AND a staff-created appointment behave
--                     identically, and nothing double-emits (M13-consistent).
--   · Reminders     → appointment_reminders rows are inserted on booking; the
--                     registered pg_cron '0 * * * *' → enqueue_due_reminders()
--                     enqueues 'appointment.remind' jobs (SMS live via M12 Twilio,
--                     email stubbed until D-011). Cancel/reschedule re-derive rows.
--   · Reschedule/   → single-purpose, expiring reschedule_token / cancel_token;
--     cancel          each rotates on use.
--   · Paid bookings → appointments.payment_intent_id column ships now but is a
--                     SCAFFOLD — M28 (Payments) is Session 13, not yet built. No
--                     live Stripe path here (accept-when excludes paid bookings).
--
-- Migration numbered 0017 (0000–0016 taken). The missing 0012 + the two 0010s are
-- pre-existing parallel-build collisions — M14 has no ordering dep on them.
--
-- PGlite-safety: the probe strips `create extension` lines and runs the raw SQL.
-- The one statement PGlite lacks — cron.schedule() — is wrapped in a guarded DO
-- block that swallows the error (identical to M04/M05/M13). Enums are guarded too.
-- Every new tenant table enables RLS in THIS file (DoD Gate-8).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. Enums (guarded — a duplicate is a no-op on re-run) ─────────────────────
do $$ begin
  create type public.calendar_type as enum ('one_on_one','round_robin','group','class');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.appt_status as enum ('confirmed','rescheduled','cancelled','completed','no_show');
exception when duplicate_object then null; end $$;

-- ── 1. calendars — one row per bookable calendar; public via slug ─────────────
create table if not exists public.calendars (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  name                text not null,
  type                public.calendar_type not null default 'one_on_one',
  slug                text not null,
  color               text,                                  -- token key, never raw hex (frontend maps it)
  duration_min        int  not null default 30,
  buffer_min          int  not null default 0,
  min_notice_min      int  not null default 0,               -- no slots sooner than now()+this
  max_per_day         int,                                   -- null = unlimited
  capacity            int  not null default 1,               -- group/class: attendees per slot
  timezone            text not null default 'UTC',
  requires_payment    boolean not null default false,        -- SCAFFOLD — gated off until M28
  round_robin_user_ids uuid[] not null default '{}',
  settings            jsonb not null default '{}',
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz,
  unique (workspace_id, slug)
);
create index if not exists calendars_ws_idx on public.calendars (workspace_id);

-- ── 2. calendar_availability — weekly recurring hours (0=Sun … 6=Sat) ─────────
create table if not exists public.calendar_availability (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  calendar_id   uuid not null references public.calendars(id) on delete cascade,
  day_of_week   int  not null check (day_of_week between 0 and 6),
  start_time    time not null,
  end_time      time not null,
  check (end_time > start_time)
);
create index if not exists calendar_availability_cal_idx on public.calendar_availability (calendar_id);

-- ── 3. calendar_blocks — date-specific blackouts / overrides (UTC) ────────────
create table if not exists public.calendar_blocks (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  calendar_id   uuid not null references public.calendars(id) on delete cascade,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  reason        text,
  check (ends_at > starts_at)
);
create index if not exists calendar_blocks_cal_idx on public.calendar_blocks (calendar_id, starts_at);

-- ── 4. appointment_questions — custom pre-booking questions ───────────────────
create table if not exists public.appointment_questions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  calendar_id   uuid not null references public.calendars(id) on delete cascade,
  label         text not null,
  type          text not null default 'text',               -- text|textarea|select|phone|email
  required      boolean not null default false,
  sort_order    int not null default 0
);
create index if not exists appointment_questions_cal_idx on public.appointment_questions (calendar_id, sort_order);

-- ── 5. appointments — the bookings themselves (UTC internal) ──────────────────
create table if not exists public.appointments (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  calendar_id        uuid not null references public.calendars(id) on delete cascade,
  contact_id         uuid references public.contacts(id) on delete set null,
  assigned_user_id   uuid references public.profiles(id) on delete set null,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  status             public.appt_status not null default 'confirmed',
  timezone           text not null default 'UTC',           -- the contact's tz at booking time
  answers            jsonb not null default '{}',
  google_event_id    text,                                  -- set by google-calendar-sync
  payment_intent_id  text,                                  -- SCAFFOLD — unused until M28
  reschedule_token   uuid not null default gen_random_uuid(),
  cancel_token       uuid not null default gen_random_uuid(),
  token_expires_at   timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz,
  check (ends_at > starts_at)
);
create index if not exists appointments_ws_cal_start_idx on public.appointments (workspace_id, calendar_id, starts_at);
create index if not exists appointments_reschedule_tok_idx on public.appointments (reschedule_token);
create index if not exists appointments_cancel_tok_idx on public.appointments (cancel_token);
create index if not exists appointments_contact_idx on public.appointments (contact_id);

-- ── 6. appointment_reminders — reminder ledger (cron enqueues jobs from here) ──
create table if not exists public.appointment_reminders (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  channel        text not null default 'sms' check (channel in ('sms','email')),
  scheduled_at   timestamptz not null,
  sent_at        timestamptz,
  job_id         uuid
);
create index if not exists appointment_reminders_due_idx
  on public.appointment_reminders (scheduled_at) where sent_at is null;
create index if not exists appointment_reminders_appt_idx on public.appointment_reminders (appointment_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. RLS — standard template. SELECT = staff+ (internal-ops ceiling: a client role
--    cannot read the workspace's calendar config or team schedule; the per-client
--    portal-narrowed policy lands with M37, like M12's conversations). config
--    (calendars/availability/blocks/questions) = manager+ write; appointments =
--    staff+ write, manager+ delete; reminders = system-written only (service-role/
--    cron own the writes — like M12 D-055). Public bookings are written by the
--    public-booking Edge Fn under the service role (no anon table write). SECURITY
--    DEFINER fns bypass RLS for side-effects.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.calendars enable row level security;
create policy calendars_sel on public.calendars for select using ( public.has_role(workspace_id,'staff') );
create policy calendars_ins on public.calendars for insert with check ( public.has_role(workspace_id,'manager') );
create policy calendars_upd on public.calendars for update using ( public.has_role(workspace_id,'manager') );
create policy calendars_del on public.calendars for delete using ( public.has_role(workspace_id,'manager') );

alter table public.calendar_availability enable row level security;
create policy cal_avail_sel on public.calendar_availability for select using ( public.has_role(workspace_id,'staff') );
create policy cal_avail_ins on public.calendar_availability for insert with check ( public.has_role(workspace_id,'manager') );
create policy cal_avail_upd on public.calendar_availability for update using ( public.has_role(workspace_id,'manager') );
create policy cal_avail_del on public.calendar_availability for delete using ( public.has_role(workspace_id,'manager') );

alter table public.calendar_blocks enable row level security;
create policy cal_block_sel on public.calendar_blocks for select using ( public.has_role(workspace_id,'staff') );
create policy cal_block_ins on public.calendar_blocks for insert with check ( public.has_role(workspace_id,'manager') );
create policy cal_block_upd on public.calendar_blocks for update using ( public.has_role(workspace_id,'manager') );
create policy cal_block_del on public.calendar_blocks for delete using ( public.has_role(workspace_id,'manager') );

alter table public.appointment_questions enable row level security;
create policy appt_q_sel on public.appointment_questions for select using ( public.has_role(workspace_id,'staff') );
create policy appt_q_ins on public.appointment_questions for insert with check ( public.has_role(workspace_id,'manager') );
create policy appt_q_upd on public.appointment_questions for update using ( public.has_role(workspace_id,'manager') );
create policy appt_q_del on public.appointment_questions for delete using ( public.has_role(workspace_id,'manager') );

alter table public.appointments enable row level security;
create policy appt_sel on public.appointments for select using ( public.has_role(workspace_id,'staff') );
create policy appt_ins on public.appointments for insert with check ( public.has_role(workspace_id,'staff') );
create policy appt_upd on public.appointments for update using ( public.has_role(workspace_id,'staff') );
create policy appt_del on public.appointments for delete using ( public.has_role(workspace_id,'manager') );

alter table public.appointment_reminders enable row level security;
create policy appt_rem_sel on public.appointment_reminders for select using ( public.has_role(workspace_id,'staff') );
-- no client insert/update/delete: enqueue_due_reminders()/the trigger/the worker own the writes (Gate-4).

-- ── updated_at triggers ───────────────────────────────────────────────────────
create trigger calendars_set_updated_at    before update on public.calendars    for each row execute function public.set_updated_at();
create trigger appointments_set_updated_at before update on public.appointments for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. pick_round_robin_user — least upcoming load; ties broken by array order.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.pick_round_robin_user(p_calendar uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare uids uuid[]; best uuid; best_load int; u uuid; ld int;
begin
  select round_robin_user_ids into uids from public.calendars where id = p_calendar;
  if uids is null or array_length(uids,1) is null then return null; end if;
  foreach u in array uids loop
    select count(*)::int into ld from public.appointments a
      where a.assigned_user_id = u and a.calendar_id = p_calendar
        and a.starts_at > now() and a.status in ('confirmed','rescheduled');
    if best is null or ld < best_load then best := u; best_load := ld; end if;
  end loop;
  return best;
end $$;
revoke all on function public.pick_round_robin_user(uuid) from public;
grant execute on function public.pick_round_robin_user(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. compute_slots — the slot engine. Expands weekly availability for a date in
--    the TARGET tz (→ UTC, DST-correct), grids by duration+buffer, drops slots
--    inside min_notice, excludes blocks + booked (capacity-aware for group/class),
--    caps by max_per_day, assigns a round-robin user. Google freebusy is applied
--    by the Edge Fn afterwards. day_of_week: 0=Sunday … 6=Saturday (extract dow).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.compute_slots(p_calendar uuid, p_date date, p_tz text)
returns table(slot_start timestamptz, slot_end timestamptz, assigned_user uuid)
language plpgsql stable security definer set search_path = public as $$
declare
  cal record;
  dur  interval;
  step interval;
  rr_user uuid;
  booked_today int;
  cap int;
begin
  select * into cal from public.calendars where id = p_calendar and is_active;
  if not found then return; end if;

  dur  := make_interval(mins => cal.duration_min);
  step := make_interval(mins => cal.duration_min + coalesce(cal.buffer_min,0));
  cap  := case when cal.type in ('group','class') then greatest(coalesce(cal.capacity,1),1) else 1 end;
  rr_user := case when cal.type = 'round_robin' then public.pick_round_robin_user(p_calendar) else null end;

  select count(*)::int into booked_today
    from public.appointments a
   where a.calendar_id = p_calendar
     and a.status in ('confirmed','rescheduled')
     and (a.starts_at at time zone p_tz)::date = p_date;

  return query
  with windows as (
    select ((p_date + av.start_time) at time zone p_tz) as w_start,
           ((p_date + av.end_time)   at time zone p_tz) as w_end
      from public.calendar_availability av
     where av.calendar_id = p_calendar
       and av.day_of_week = extract(dow from p_date)::int
  ),
  candidates as (
    select gs as c_start, gs + dur as c_end
      from windows w,
           lateral generate_series(w.w_start, w.w_end - dur, step) gs
  )
  select c.c_start, c.c_end, rr_user
    from candidates c
   where c.c_start >= now() + make_interval(mins => coalesce(cal.min_notice_min,0))
     and not exists (
       select 1 from public.calendar_blocks b
        where b.calendar_id = p_calendar
          and b.starts_at < c.c_end and b.ends_at > c.c_start )
     and (
       select count(*) from public.appointments a
        where a.calendar_id = p_calendar
          and a.status in ('confirmed','rescheduled')
          and a.starts_at < c.c_end and a.ends_at > c.c_start
     ) < cap
   order by c.c_start
   limit greatest(coalesce(cal.max_per_day, 1000000) - booked_today, 0);
end $$;
revoke all on function public.compute_slots(uuid, date, text) from public;
grant execute on function public.compute_slots(uuid, date, text) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. _enqueue_appointment_reminders — (re)build the 24h + 1h reminder ROWS for
--     an appointment (only future ones). Jobs are enqueued later by the cron.
--     Internal (service-role / definer callers only).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public._enqueue_appointment_reminders(p_appt uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select * into a from public.appointments where id = p_appt;
  if not found or a.status in ('cancelled','completed','no_show') then return; end if;
  delete from public.appointment_reminders where appointment_id = p_appt and sent_at is null;
  if a.starts_at - interval '24 hours' > now() then
    insert into public.appointment_reminders (workspace_id, appointment_id, channel, scheduled_at)
      values (a.workspace_id, p_appt, 'sms', a.starts_at - interval '24 hours');
  end if;
  if a.starts_at - interval '1 hour' > now() then
    insert into public.appointment_reminders (workspace_id, appointment_id, channel, scheduled_at)
      values (a.workspace_id, p_appt, 'sms', a.starts_at - interval '1 hour');
  end if;
end $$;
revoke all on function public._enqueue_appointment_reminders(uuid) from public;
grant execute on function public._enqueue_appointment_reminders(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. AFTER INSERT trigger — the booking side-effects (M13-consistent). Fires for
--     BOTH public bookings and staff-created appointments; nothing else emits
--     appointment.booked, so there is no double-emit.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.tg_appointment_booked() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tag uuid;
begin
  -- auto-tag "Appointment Booked" (idempotent), only when there is a contact
  if new.contact_id is not null then
    insert into public.tags (workspace_id, name) values (new.workspace_id, 'Appointment Booked')
      on conflict (workspace_id, name) do nothing;
    select id into v_tag from public.tags where workspace_id = new.workspace_id and name = 'Appointment Booked';
    insert into public.contact_tags (workspace_id, contact_id, tag_id)
      values (new.workspace_id, new.contact_id, v_tag) on conflict do nothing;

    -- timeline (direct insert — public bookings have no auth.uid(); definer bypasses RLS)
    insert into public.activity_log (workspace_id, contact_id, type, description, metadata, actor_id)
      values (new.workspace_id, new.contact_id, 'appointment', 'Appointment booked',
              jsonb_build_object('appointment_id', new.id, 'calendar_id', new.calendar_id), auth.uid());
  end if;

  -- reminder rows
  perform public._enqueue_appointment_reminders(new.id);

  -- automation bus
  perform public.emit_trigger(new.workspace_id, 'appointment.booked',
    jsonb_build_object('contact_id', new.contact_id, 'appointment_id', new.id, 'calendar_id', new.calendar_id));

  return new;
end $$;
create trigger appointments_after_insert
  after insert on public.appointments
  for each row execute function public.tg_appointment_booked();

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. book_appointment — thin insert wrapper for the Edge Fn / staff UI. The
--     AFTER INSERT trigger does the side-effects. Returns id + self-service tokens.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.book_appointment(
  p_ws uuid, p_calendar uuid, p_contact uuid,
  p_start timestamptz, p_end timestamptz, p_tz text,
  p_answers jsonb default '{}', p_assigned uuid default null
) returns table(appointment_id uuid, reschedule_token uuid, cancel_token uuid)
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_rt uuid; v_ct uuid;
begin
  insert into public.appointments
    (workspace_id, calendar_id, contact_id, assigned_user_id, starts_at, ends_at, status, timezone, answers, token_expires_at)
  values (p_ws, p_calendar, p_contact, p_assigned, p_start, p_end, 'confirmed', p_tz,
          coalesce(p_answers,'{}'::jsonb), p_start + interval '30 days')
  returning id, appointments.reschedule_token, appointments.cancel_token into v_id, v_rt, v_ct;
  return query select v_id, v_rt, v_ct;
end $$;
revoke all on function public.book_appointment(uuid,uuid,uuid,timestamptz,timestamptz,text,jsonb,uuid) from public;
grant execute on function public.book_appointment(uuid,uuid,uuid,timestamptz,timestamptz,text,jsonb,uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. set_appointment_status — attended/no_show/cancel; fires the lifecycle bus.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.set_appointment_status(p_appt uuid, p_status public.appt_status)
returns void language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select * into a from public.appointments where id = p_appt;
  if not found then raise exception 'appointment % not found', p_appt using errcode='P0002'; end if;
  update public.appointments set status = p_status where id = p_appt;
  if p_status = 'cancelled' then
    delete from public.appointment_reminders where appointment_id = p_appt and sent_at is null;
    perform public.emit_trigger(a.workspace_id, 'appointment.cancelled',
      jsonb_build_object('contact_id', a.contact_id, 'appointment_id', p_appt, 'calendar_id', a.calendar_id));
  elsif p_status = 'no_show' then
    perform public.emit_trigger(a.workspace_id, 'appointment.no_show',
      jsonb_build_object('contact_id', a.contact_id, 'appointment_id', p_appt, 'calendar_id', a.calendar_id));
  end if;
end $$;
revoke all on function public.set_appointment_status(uuid, public.appt_status) from public;
grant execute on function public.set_appointment_status(uuid, public.appt_status) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. reschedule_appointment / cancel_appointment — signed-token self-service.
--     Tokens are single-purpose + expiring; each rotates on use.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.reschedule_appointment(p_token uuid, p_start timestamptz, p_end timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select * into a from public.appointments
    where reschedule_token = p_token
      and (token_expires_at is null or token_expires_at > now())
      and status not in ('cancelled','completed','no_show');
  if not found then raise exception 'invalid or expired reschedule token' using errcode='42501'; end if;
  update public.appointments
     set starts_at = p_start, ends_at = p_end, status = 'rescheduled',
         reschedule_token = gen_random_uuid()          -- rotate: single-purpose
   where id = a.id;
  perform public._enqueue_appointment_reminders(a.id);
  return a.id;
end $$;
revoke all on function public.reschedule_appointment(uuid,timestamptz,timestamptz) from public;
grant execute on function public.reschedule_appointment(uuid,timestamptz,timestamptz) to authenticated, service_role;

create or replace function public.cancel_appointment(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select * into a from public.appointments
    where cancel_token = p_token
      and (token_expires_at is null or token_expires_at > now())
      and status not in ('cancelled','completed','no_show');
  if not found then raise exception 'invalid or expired cancel token' using errcode='42501'; end if;
  update public.appointments set cancel_token = gen_random_uuid() where id = a.id;  -- rotate
  perform public.set_appointment_status(a.id, 'cancelled');
  return a.id;
end $$;
revoke all on function public.cancel_appointment(uuid) from public;
grant execute on function public.cancel_appointment(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 15. enqueue_due_reminders — the pg_cron '0 * * * *' pass. Enqueues one
--     'appointment.remind' job per due unsent reminder (idempotent per reminder).
--     Cron never sends — the worker/Edge Fn does (SMS live / email stubbed).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.enqueue_due_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select ar.id, ar.appointment_id, ar.channel, a.workspace_id
      from public.appointment_reminders ar
      join public.appointments a on a.id = ar.appointment_id
     where ar.sent_at is null and ar.scheduled_at <= now()
       and a.status in ('confirmed','rescheduled')
  loop
    insert into public.jobs (workspace_id, type, payload, idempotency_key)
    values (r.workspace_id, 'appointment.remind',
            jsonb_build_object('appointment_id', r.appointment_id, 'reminder_id', r.id, 'channel', r.channel),
            'appointment-remind-' || r.id)
    on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.enqueue_due_reminders() from public;
grant execute on function public.enqueue_due_reminders() to service_role;

-- ── pg_cron registry (guarded — PGlite lacks cron; swallow) ────────────────────
do $$ begin
  perform cron.schedule('m14-appointment-remind', '0 * * * *', $cron$ select public.enqueue_due_reminders(); $cron$);
exception when others then null; end $$;
