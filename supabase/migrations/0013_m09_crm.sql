-- ═══════════════════════════════════════════════════════════════════════════
-- 0013_m09_crm.sql — AiMindShare Session 8 · M09 CRM
--
-- The core CRM vertical slice. Ships DATA-SCHEMA §7 verbatim (companies, contacts,
-- tags, custom fields, activity_log, notes, tasks) onto the locked stack, plus the
-- minimal extensions this session's accept-when demands — each logged in DECISIONS
-- (D-042…D-048). PRD_M09's Prisma/BullMQ/Redis/Pusher is superseded: async work is
-- the `jobs` queue (Law 5), the timeline "add()" is a SECURITY DEFINER RPC, and
-- dup detection uses the pg_trgm extension loaded in 0000.
--
-- Migration number 0013 (M03=0009, M41=0010, M04=0011; the duplicate
-- 0010_m05_compliance.sql is a parallel-session collision that Session 5 flagged
-- for a human renumber to 0012 — NOT resolved here, per this session's decision).
--
-- Logged extensions / deviations from canonical §7 (Law 8):
--   • D-042  custom_fields.workspace_id FK corrected: canonical self-references
--            custom_fields(id) — a typo; it must reference workspaces(id). Also
--            adds workspace_id (not null) to the two junction tables so RLS scopes
--            them directly and Law 2 holds ("every tenant table has workspace_id").
--   • D-043  smart_lists table + jsonb AND/OR grammar + smart_list_eval() evaluator
--            (DB is source of truth; frontend mirrors the grammar for live preview).
--   • D-044  contact_imports table + `contact.import` job type (CSV import is a job,
--            Law 5 — the browser only enqueues `queued`).
--   • D-045  contact_duplicates table + `contact.dedupe_scan` job + daily pg_cron,
--            fed by pg_trgm indexes on contacts (email exact + name/phone fuzzy).
--   • D-046  merge_contacts() SECURITY DEFINER RPC (manager+): reassigns every FK
--            child to the primary, retains consent, soft-deletes the duplicate.
--   • D-047  Lead-scoring RULES ENGINE and @mention→M04 notify are deferred out of
--            this slice (PRD but not in the Session-8 accept-when). contacts.lead_score
--            still ships and renders; the recalc worker + /settings/scoring land later.
--   • D-048  activity_log is APPEND-ONLY (no update/delete) and is the platform-wide
--            timeline; log_activity() = PRD's timeline.add(); added to Realtime.
--
-- Order inside this file: tables → indexes (incl. pg_trgm) → triggers → RLS +
-- policies → RPCs (log_activity, merge_contacts, smart_list_eval) → retro consent
-- FK → dedupe pg_cron. Every table created here enables RLS in THIS file (Gate-8).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Tables (DATA-SCHEMA §7 verbatim + logged extensions) ──────────────────

-- companies — accounts/organizations. §7 verbatim.
create table if not exists public.companies (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  website       text,
  industry      text,
  size          text,
  enrichment    jsonb not null default '{}',    -- M10 fills this
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  deleted_at    timestamptz
);
create index if not exists companies_ws_idx on public.companies (workspace_id);

-- contacts — the CRM spine. §7 verbatim. Other modules FK to this (M05 consent,
-- M11 deals, M12 conversations, M14 appointments, M17 docs, M28 invoices).
create table if not exists public.contacts (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  company_id    uuid references public.companies(id) on delete set null,
  first_name    text,
  last_name     text,
  email         text,
  phone         text,
  source        text,                           -- inbound|referral|import|manual|form:{id}|...
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  lead_score    int not null default 0,         -- rules engine deferred (D-047); column ships now
  assigned_to   uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  deleted_at    timestamptz
);
create index if not exists contacts_ws_idx        on public.contacts (workspace_id);
create index if not exists contacts_ws_email_idx  on public.contacts (workspace_id, email);
create index if not exists contacts_ws_company_idx on public.contacts (workspace_id, company_id);
-- pg_trgm fuzzy indexes for dedupe + search (D-045). Partial on live rows only.
create index if not exists contacts_email_trgm on public.contacts using gin (lower(email) gin_trgm_ops) where deleted_at is null;
create index if not exists contacts_name_trgm  on public.contacts using gin (lower(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) gin_trgm_ops) where deleted_at is null;
create index if not exists contacts_phone_trgm on public.contacts using gin (regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') gin_trgm_ops) where deleted_at is null;

-- tags — colour-coded, unique per workspace. §7 verbatim.
create table if not exists public.tags (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  color         text,
  created_at    timestamptz not null default now(),
  unique (workspace_id, name)
);
create index if not exists tags_ws_idx on public.tags (workspace_id);

-- contact_tags — M:N join. §7 + workspace_id added for direct RLS scoping (D-042).
create table if not exists public.contact_tags (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  tag_id        uuid not null references public.tags(id) on delete cascade,
  primary key (contact_id, tag_id)
);
create index if not exists contact_tags_ws_idx  on public.contact_tags (workspace_id);
create index if not exists contact_tags_tag_idx on public.contact_tags (tag_id);

-- custom_fields — per-workspace field definitions. §7 + FK typo corrected (D-042).
create table if not exists public.custom_fields (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,  -- was custom_fields(id): typo
  field_name    text not null,
  field_type    text not null,                  -- text|textarea|number|date|dropdown|checkbox|multiselect|url|file
  options       jsonb not null default '[]',
  created_at    timestamptz not null default now(),
  unique (workspace_id, field_name)
);
create index if not exists custom_fields_ws_idx on public.custom_fields (workspace_id);

-- contact_custom_values — value per (contact, field). §7 + workspace_id (D-042).
create table if not exists public.contact_custom_values (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  field_id      uuid not null references public.custom_fields(id) on delete cascade,
  value         text,
  primary key (contact_id, field_id)
);
create index if not exists contact_custom_values_ws_idx    on public.contact_custom_values (workspace_id);
create index if not exists contact_custom_values_field_idx on public.contact_custom_values (field_id);

-- activity_log — unified timeline. §7 verbatim. APPEND-ONLY (D-048): every module
-- writes here via log_activity(); nobody edits/erases. In the Realtime publication
-- so contact detail timelines live-update.
create table if not exists public.activity_log (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  contact_id    uuid references public.contacts(id) on delete cascade,
  type          text not null,                  -- email|sms|call|form|page_visit|note|task|deal_change|appointment|payment|review|custom
  description   text,
  metadata      jsonb not null default '{}',
  actor_id      uuid references auth.users(id), -- who caused it (null = system/automation)
  created_at    timestamptz not null default now()
);
create index if not exists activity_log_ws_contact_idx on public.activity_log (workspace_id, contact_id, created_at desc);

-- contact_notes — free-text notes, author-attributed. §7 verbatim.
create table if not exists public.contact_notes (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  user_id       uuid references auth.users(id),
  content       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);
create index if not exists contact_notes_ws_contact_idx on public.contact_notes (workspace_id, contact_id, created_at desc);

-- contact_tasks — follow-ups with assignee/due/status. §7 verbatim.
create table if not exists public.contact_tasks (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  contact_id    uuid references public.contacts(id) on delete cascade,
  assigned_to   uuid references auth.users(id),
  title         text,
  due_date      date,
  status        text not null default 'open',   -- open|done|cancelled
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);
create index if not exists contact_tasks_ws_idx      on public.contact_tasks (workspace_id, status);
create index if not exists contact_tasks_assignee_idx on public.contact_tasks (assigned_to, status);

-- smart_lists — saved AND/OR segments (D-043). `definition` is the jsonb grammar
-- interpreted by smart_list_eval() below and mirrored in frontend/js for preview.
create table if not exists public.smart_lists (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  definition    jsonb not null default '{"match":"and","rules":[]}',
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  unique (workspace_id, name)
);
create index if not exists smart_lists_ws_idx on public.smart_lists (workspace_id);

-- contact_imports — CSV import job tracking (D-044). The heavy work is a
-- `contact.import` job; this row holds mapping, progress counts, and the
-- row-level error report the wizard shows.
create table if not exists public.contact_imports (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  file_path     text,                           -- storage path of the uploaded CSV
  mapping       jsonb not null default '{}',    -- { csvColumn: contactField }
  status        text not null default 'pending',-- pending|running|done|failed
  total_rows    int not null default 0,
  processed     int not null default 0,
  inserted      int not null default 0,
  updated       int not null default 0,
  failed        int not null default 0,
  error_report  jsonb not null default '[]',    -- [{ row, error }]
  consent_attested boolean not null default false,  -- M05 attestation checkbox
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);
create index if not exists contact_imports_ws_idx on public.contact_imports (workspace_id, status);

-- contact_duplicates — flagged pairs from the dedupe scan (D-045). A/B ordered so
-- the unique index dedupes the pair regardless of discovery direction.
create table if not exists public.contact_duplicates (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  contact_a     uuid not null references public.contacts(id) on delete cascade,
  contact_b     uuid not null references public.contacts(id) on delete cascade,
  score         numeric not null default 0,     -- 0..1 confidence
  reason        text not null,                  -- email_exact|phone_fuzzy|name_fuzzy
  status        text not null default 'open',   -- open|merged|dismissed
  created_at    timestamptz not null default now(),
  unique (workspace_id, contact_a, contact_b)
);
create index if not exists contact_duplicates_ws_idx on public.contact_duplicates (workspace_id, status);

-- ── 2. Triggers ──────────────────────────────────────────────────────────────
create trigger companies_set_updated_at       before update on public.companies       for each row execute function public.set_updated_at();
create trigger contacts_set_updated_at        before update on public.contacts        for each row execute function public.set_updated_at();
create trigger contact_notes_set_updated_at   before update on public.contact_notes   for each row execute function public.set_updated_at();
create trigger contact_tasks_set_updated_at   before update on public.contact_tasks   for each row execute function public.set_updated_at();
create trigger smart_lists_set_updated_at     before update on public.smart_lists     for each row execute function public.set_updated_at();
create trigger contact_imports_set_updated_at before update on public.contact_imports for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RLS + policies (RLS-AND-SECURITY §3 standard template unless noted)
--    sel: member · ins/upd: staff+ · del: manager+
-- ═══════════════════════════════════════════════════════════════════════════

-- Helper macro (by hand): the four standard policies per tenant table.
alter table public.companies enable row level security;
create policy companies_sel on public.companies for select using ( public.is_member(workspace_id) );
create policy companies_ins on public.companies for insert with check ( public.has_role(workspace_id,'staff') );
create policy companies_upd on public.companies for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy companies_del on public.companies for delete using ( public.has_role(workspace_id,'manager') );

alter table public.contacts enable row level security;
create policy contacts_sel on public.contacts for select using ( public.is_member(workspace_id) );
create policy contacts_ins on public.contacts for insert with check ( public.has_role(workspace_id,'staff') );
create policy contacts_upd on public.contacts for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy contacts_del on public.contacts for delete using ( public.has_role(workspace_id,'manager') );

alter table public.tags enable row level security;
create policy tags_sel on public.tags for select using ( public.is_member(workspace_id) );
create policy tags_ins on public.tags for insert with check ( public.has_role(workspace_id,'staff') );
create policy tags_upd on public.tags for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy tags_del on public.tags for delete using ( public.has_role(workspace_id,'manager') );

alter table public.contact_tags enable row level security;
create policy contact_tags_sel on public.contact_tags for select using ( public.is_member(workspace_id) );
create policy contact_tags_ins on public.contact_tags for insert with check ( public.has_role(workspace_id,'staff') );
create policy contact_tags_del on public.contact_tags for delete using ( public.has_role(workspace_id,'staff') );  -- tag/untag is a staff action

alter table public.custom_fields enable row level security;
create policy custom_fields_sel on public.custom_fields for select using ( public.is_member(workspace_id) );
create policy custom_fields_ins on public.custom_fields for insert with check ( public.has_role(workspace_id,'manager') );  -- schema change = manager+
create policy custom_fields_upd on public.custom_fields for update using ( public.has_role(workspace_id,'manager') ) with check ( public.has_role(workspace_id,'manager') );
create policy custom_fields_del on public.custom_fields for delete using ( public.has_role(workspace_id,'manager') );

alter table public.contact_custom_values enable row level security;
create policy contact_custom_values_sel on public.contact_custom_values for select using ( public.is_member(workspace_id) );
create policy contact_custom_values_ins on public.contact_custom_values for insert with check ( public.has_role(workspace_id,'staff') );
create policy contact_custom_values_upd on public.contact_custom_values for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy contact_custom_values_del on public.contact_custom_values for delete using ( public.has_role(workspace_id,'staff') );

-- activity_log — APPEND-ONLY (D-048): member reads, staff+ inserts, NO update/delete.
alter table public.activity_log enable row level security;
create policy activity_log_sel on public.activity_log for select using ( public.is_member(workspace_id) );
create policy activity_log_ins on public.activity_log for insert with check ( public.has_role(workspace_id,'staff') );
-- (no update / no delete policy — immutable timeline; service role bypasses for GDPR erase)

alter table public.contact_notes enable row level security;
create policy contact_notes_sel on public.contact_notes for select using ( public.is_member(workspace_id) );
create policy contact_notes_ins on public.contact_notes for insert with check ( public.has_role(workspace_id,'staff') );
create policy contact_notes_upd on public.contact_notes for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy contact_notes_del on public.contact_notes for delete using ( public.has_role(workspace_id,'manager') );

alter table public.contact_tasks enable row level security;
create policy contact_tasks_sel on public.contact_tasks for select using ( public.is_member(workspace_id) );
create policy contact_tasks_ins on public.contact_tasks for insert with check ( public.has_role(workspace_id,'staff') );
create policy contact_tasks_upd on public.contact_tasks for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy contact_tasks_del on public.contact_tasks for delete using ( public.has_role(workspace_id,'manager') );

alter table public.smart_lists enable row level security;
create policy smart_lists_sel on public.smart_lists for select using ( public.is_member(workspace_id) );
create policy smart_lists_ins on public.smart_lists for insert with check ( public.has_role(workspace_id,'staff') );
create policy smart_lists_upd on public.smart_lists for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy smart_lists_del on public.smart_lists for delete using ( public.has_role(workspace_id,'manager') );

-- contact_imports — staff create PENDING only (mirrors jobs' queued-only guard so
-- the browser can't seed a running/done import); manager+ advance/remove.
alter table public.contact_imports enable row level security;
create policy contact_imports_sel on public.contact_imports for select using ( public.is_member(workspace_id) );
create policy contact_imports_ins on public.contact_imports for insert with check ( public.has_role(workspace_id,'staff') and status = 'pending' );
create policy contact_imports_upd on public.contact_imports for update using ( public.has_role(workspace_id,'manager') ) with check ( public.has_role(workspace_id,'manager') );
create policy contact_imports_del on public.contact_imports for delete using ( public.has_role(workspace_id,'manager') );

-- contact_duplicates — member reads; writes are worker-owned (service role). Staff
-- may dismiss (update) a false-positive pair; inserts come from the dedupe worker.
alter table public.contact_duplicates enable row level security;
create policy contact_duplicates_sel on public.contact_duplicates for select using ( public.is_member(workspace_id) );
create policy contact_duplicates_upd on public.contact_duplicates for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
-- (no insert/delete policy — the dedupe worker writes via service role)

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RPCs
-- ═══════════════════════════════════════════════════════════════════════════

-- log_activity — the platform-wide timeline.add() (D-048). Any member of the
-- workspace may append an event; SECURITY DEFINER so future module triggers/workers
-- can write without owning the RLS insert. Returns the new row id.
create or replace function public.log_activity(
  p_ws uuid, p_contact uuid, p_type text, p_description text default null, p_metadata jsonb default '{}'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_member(p_ws) then
    raise exception 'not a member of workspace %', p_ws using errcode = '42501';
  end if;
  insert into public.activity_log (workspace_id, contact_id, type, description, metadata, actor_id)
  values (p_ws, p_contact, p_type, p_description, coalesce(p_metadata,'{}'::jsonb), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- merge_contacts — reassign every FK child of `dup` onto `primary`, keep consent,
-- soft-delete the duplicate, mark the dup pair merged, and log the merge (D-046).
-- manager+ only. Both contacts must be live and in the caller's workspace.
create or replace function public.merge_contacts(p_ws uuid, p_primary uuid, p_dup uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(p_ws, 'manager') then
    raise exception 'merge requires manager+' using errcode = '42501';
  end if;
  if p_primary = p_dup then
    raise exception 'cannot merge a contact into itself' using errcode = '22023';
  end if;
  perform 1 from public.contacts where id = p_primary and workspace_id = p_ws and deleted_at is null;
  if not found then raise exception 'primary contact not found in workspace' using errcode = 'P0002'; end if;
  perform 1 from public.contacts where id = p_dup and workspace_id = p_ws and deleted_at is null;
  if not found then raise exception 'duplicate contact not found in workspace' using errcode = 'P0002'; end if;

  -- Reassign children. Tags/custom-values use ON CONFLICT to avoid PK collisions.
  insert into public.contact_tags (workspace_id, contact_id, tag_id)
    select workspace_id, p_primary, tag_id from public.contact_tags where contact_id = p_dup
    on conflict (contact_id, tag_id) do nothing;
  delete from public.contact_tags where contact_id = p_dup;

  insert into public.contact_custom_values (workspace_id, contact_id, field_id, value)
    select workspace_id, p_primary, field_id, value from public.contact_custom_values where contact_id = p_dup
    on conflict (contact_id, field_id) do nothing;  -- primary's value wins
  delete from public.contact_custom_values where contact_id = p_dup;

  update public.contact_notes   set contact_id = p_primary where contact_id = p_dup;
  update public.contact_tasks   set contact_id = p_primary where contact_id = p_dup;
  update public.activity_log    set contact_id = p_primary where contact_id = p_dup;
  update public.consent_records set contact_id = p_primary where contact_id = p_dup;  -- retain consent proof

  update public.contacts set deleted_at = now(), updated_at = now() where id = p_dup;
  update public.contact_duplicates set status = 'merged'
    where workspace_id = p_ws and (contact_a = p_dup or contact_b = p_dup);

  perform public.log_activity(p_ws, p_primary, 'custom', 'Merged a duplicate contact', jsonb_build_object('merged_from', p_dup));
end $$;

-- smart_list_eval — evaluate a jsonb AND/OR definition to a set of contact ids
-- (D-043). Grammar (mirrored in frontend/js/smart-lists.js):
--   group = { "match": "and"|"or", "rules": [ rule | group, ... ] }
--   rule  = { "field": <name>, "op": <op>, "value": <v>, "field_id": <uuid?> }
-- Fields: first_name|last_name|email|phone|source (text) · lead_score (int) ·
--         created_at (date) · tag (value = tag_id) · custom (field_id + value).
-- Ops: eq neq contains is_set not_set (text) · eq neq gt gte lt lte (num/date) ·
--      has not_has (tag) . Values are quote_literal'd; fields/ops are whitelisted
-- (never interpolated raw) so the built SQL is injection-safe.
create or replace function public._smart_list_where(p_group jsonb) returns text
language plpgsql immutable set search_path = public as $$
declare
  v_match text := lower(coalesce(p_group->>'match','and'));
  v_rules jsonb := coalesce(p_group->'rules','[]'::jsonb);
  v_rule  jsonb;
  v_parts text[] := '{}';
  v_expr  text;
  v_field text; v_op text; v_val text; v_fid text; v_col text;
begin
  if v_match not in ('and','or') then v_match := 'and'; end if;
  for v_rule in select * from jsonb_array_elements(v_rules) loop
    if v_rule ? 'match' then
      v_expr := public._smart_list_where(v_rule);          -- nested group (recursion)
    else
      v_field := coalesce(v_rule->>'field','');
      v_op    := lower(coalesce(v_rule->>'op','eq'));
      v_val   := coalesce(v_rule->>'value','');
      v_fid   := v_rule->>'field_id';
      if v_field = 'tag' then
        if v_op = 'not_has' then
          v_expr := 'not exists (select 1 from public.contact_tags ct where ct.contact_id = c.id and ct.tag_id = '||quote_literal(v_val)||'::uuid)';
        else
          v_expr := 'exists (select 1 from public.contact_tags ct where ct.contact_id = c.id and ct.tag_id = '||quote_literal(v_val)||'::uuid)';
        end if;
      elsif v_field = 'custom' and v_fid is not null then
        v_expr := 'exists (select 1 from public.contact_custom_values cv where cv.contact_id = c.id and cv.field_id = '||quote_literal(v_fid)||'::uuid and '||
                  public._smart_list_leaf('cv.value', v_op, v_val)||')';
      elsif v_field in ('first_name','last_name','email','phone','source') then
        v_col := 'c.'||v_field;
        v_expr := public._smart_list_leaf(v_col, v_op, v_val);
      elsif v_field = 'lead_score' then
        v_expr := public._smart_list_leaf('c.lead_score', v_op, v_val, 'num');
      elsif v_field = 'created_at' then
        v_expr := public._smart_list_leaf('c.created_at', v_op, v_val, 'date');
      else
        v_expr := 'true';   -- unknown field → no-op (fail open within its group is safe; group AND still constrains)
      end if;
    end if;
    if v_expr is not null and v_expr <> '' then
      v_parts := array_append(v_parts, '('||v_expr||')');
    end if;
  end loop;
  if array_length(v_parts,1) is null then return 'true'; end if;   -- empty group matches all
  return array_to_string(v_parts, ' '||v_match||' ');
end $$;

-- Leaf comparator → safe SQL fragment. p_kind: 'text'(default)|'num'|'date'.
create or replace function public._smart_list_leaf(p_col text, p_op text, p_val text, p_kind text default 'text')
returns text
language plpgsql immutable set search_path = public as $$
declare q text := quote_literal(p_val);
begin
  if p_op = 'is_set'  then return p_col||' is not null'||case when p_kind='text' then ' and '||p_col||' <> '''''  else '' end; end if;
  if p_op = 'not_set' then return '('||p_col||' is null'||case when p_kind='text' then ' or '||p_col||' = '''''  else '' end||')'; end if;
  if p_kind = 'text' then
    if p_op = 'contains' then return 'lower('||p_col||') like lower('||quote_literal('%'||p_val||'%')||')'; end if;
    if p_op = 'neq'      then return '('||p_col||' is distinct from '||q||')'; end if;
    return 'lower('||p_col||') = lower('||q||')';                       -- eq (default)
  else
    -- numeric / date: cast literal appropriately
    q := case when p_kind='num' then quote_literal(p_val)||'::numeric' else quote_literal(p_val)||'::timestamptz' end;
    if p_op = 'gt'  then return p_col||' > '||q; end if;
    if p_op = 'gte' then return p_col||' >= '||q; end if;
    if p_op = 'lt'  then return p_col||' < '||q; end if;
    if p_op = 'lte' then return p_col||' <= '||q; end if;
    if p_op = 'neq' then return p_col||' <> '||q; end if;
    return p_col||' = '||q;                                             -- eq (default)
  end if;
end $$;

create or replace function public.smart_list_eval(p_ws uuid, p_def jsonb)
returns setof uuid
language plpgsql stable security definer set search_path = public as $$
declare v_where text; v_sql text;
begin
  if not public.is_member(p_ws) then
    raise exception 'not a member of workspace %', p_ws using errcode = '42501';
  end if;
  v_where := public._smart_list_where(coalesce(p_def, '{"match":"and","rules":[]}'::jsonb));
  v_sql := 'select c.id from public.contacts c where c.workspace_id = '||quote_literal(p_ws)||'::uuid and c.deleted_at is null and ('||v_where||')';
  return query execute v_sql;
end $$;

revoke all on function public.smart_list_eval(uuid, jsonb) from public;
grant execute on function public.smart_list_eval(uuid, jsonb) to authenticated;
grant execute on function public.log_activity(uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function public.merge_contacts(uuid, uuid, uuid) to authenticated;

-- dedupe_scan — the `contact.dedupe_scan` worker's core (D-045). Flags duplicate
-- pairs into contact_duplicates: email-exact (score 1.0) and normalized-phone-exact
-- (score 0.9), pair ordered least/greatest so the unique index dedupes regardless of
-- discovery direction. SECURITY DEFINER so the worker (service role) and the probe
-- exercise identical SQL. Fuzzy-name matching via pg_trgm similarity() is a logged
-- follow-up (the trgm indexes ship now; name-similarity dedup lands with enrichment).
create or replace function public.dedupe_scan(p_ws uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_open int;
begin
  insert into public.contact_duplicates (workspace_id, contact_a, contact_b, score, reason)
  select p_ws, least(a.id,b.id), greatest(a.id,b.id), 1.0, 'email_exact'
    from public.contacts a
    join public.contacts b
      on a.id < b.id
     and a.workspace_id = p_ws and b.workspace_id = p_ws
     and a.deleted_at is null and b.deleted_at is null
     and a.email is not null and b.email is not null
     and lower(a.email) = lower(b.email)
  on conflict (workspace_id, contact_a, contact_b) do nothing;

  insert into public.contact_duplicates (workspace_id, contact_a, contact_b, score, reason)
  select p_ws, least(a.id,b.id), greatest(a.id,b.id), 0.9, 'phone_exact'
    from public.contacts a
    join public.contacts b
      on a.id < b.id
     and a.workspace_id = p_ws and b.workspace_id = p_ws
     and a.deleted_at is null and b.deleted_at is null
     and nullif(regexp_replace(coalesce(a.phone,''),'[^0-9]','','g'),'')
       = nullif(regexp_replace(coalesce(b.phone,''),'[^0-9]','','g'),'')
  on conflict (workspace_id, contact_a, contact_b) do nothing;

  select count(*) into v_open from public.contact_duplicates where workspace_id = p_ws and status = 'open';
  return v_open;
end $$;
revoke all on function public.dedupe_scan(uuid) from public;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Retro FK: consent_records.contact_id → contacts (deferred from M05, §6 note)
-- consent_records shipped in 0010 with a bare uuid; wire the FK now that contacts
-- exists. Wrapped so re-running is safe and PGlite (no prior data) is happy.
-- ═══════════════════════════════════════════════════════════════════════════
do $$ begin
  alter table public.consent_records
    add constraint consent_contact_fk
    foreign key (contact_id) references public.contacts(id) on delete cascade;
exception when duplicate_object then null; end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Realtime + dedupe cron
-- ═══════════════════════════════════════════════════════════════════════════

-- activity_log in the Realtime publication so contact timelines live-update (D-048).
do $$ begin
  alter publication supabase_realtime add table public.activity_log;
exception when others then
  raise notice 'supabase_realtime publication unavailable — activity_log not added (%).', sqlerrm;
end $$;

-- Daily dedupe scan → enqueues a `contact.dedupe_scan` job per workspace with live
-- contacts (D-045). The worker does the trgm matching + writes contact_duplicates.
do $$ begin
  perform cron.schedule(
    'crm-dedupe-scan-daily',
    '17 3 * * *',
    $cron$
      insert into public.jobs (workspace_id, type, payload, idempotency_key)
      select distinct c.workspace_id, 'contact.dedupe_scan', '{}'::jsonb,
             'dedupe:' || c.workspace_id || ':' || to_char(now(),'YYYY-MM-DD')
        from public.contacts c
       where c.deleted_at is null
      on conflict (workspace_id, type, idempotency_key) where idempotency_key is not null do nothing
    $cron$);
exception when others then
  raise notice 'pg_cron unavailable — crm-dedupe-scan-daily not scheduled (%).', sqlerrm;
end $$;
