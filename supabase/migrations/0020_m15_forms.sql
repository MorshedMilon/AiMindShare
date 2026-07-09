-- ═══════════════════════════════════════════════════════════════════════════
-- 0020_m15_forms.sql — M15 Forms & Surveys (Session 16)
-- Public-facing form / survey / quiz builder + submission capture + funnel
-- analytics. Built VERTICALLY on the locked stack — vanilla HTML/CSS/JS +
-- Supabase — NOT the PRD's Prisma / Zod / dnd-kit sketch (all dead-stack here).
-- Reconciliation recorded in DECISIONS:
--   · Schema/ORM      → raw SQL + PostgREST/RPC, NOT Prisma. fields_json /
--                       logic_json / settings_json are plain jsonb the vanilla
--                       builder reads/writes; there is no Prisma model layer.
--   · Validation      → server-side in the submit Edge Function + DB constraints,
--                       NOT Zod. The client hint schema is just jsonb.
--   · Drag-and-drop   → the vanilla builder handles reordering in the browser;
--                       dnd-kit (a React lib) is dead-stack and dropped.
--
-- This migration ships ONLY the data layer (DoD Gate-8: every new tenant table
-- enables RLS + ≥1 policy in THIS file). The submit/track Edge Functions, the
-- form.submitted bus emit, contact-upsert, scoring, and A/B routing land in the
-- module's later tasks — the M13 registry already lists form.submitted as an
-- honest stub, so a template using it installs today and fires once this wiring
-- lands. Submissions/views are written by the public-form Edge Function under the
-- service role only (service_role bypasses RLS) — the exact posture as M12's
-- inbound traffic (D-055): the browser can never forge a submission or a view.
--
-- Migration numbered 0020 (0000–0019 taken). The `0012` gap + the double-`0010`
-- (0010_m41_integrations / 0010_m05_compliance) are pre-existing parallel-build
-- collisions flagged in earlier sessions — M15 has no ordering dep on them, and
-- migrations are append-only, so nothing is renumbered here.
--
-- Depends on: 0000 (gen_random_uuid via pgcrypto, set_updated_at),
-- 0001 tenancy (is_member/has_role), 0013 M09 (contacts — submissions link a
-- contact when the form resolves one).
--
-- PGlite-safety: the probe strips `create extension` and runs the raw SQL. This
-- file has NO cron.schedule / publication / extension statement, so it loads
-- verbatim under PGlite. Enums are guarded (a duplicate is a no-op on re-run),
-- same posture as M12/M13.
--
-- Order: enums → tables → RLS + policies → indexes → set_updated_at trigger.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. Enums (guarded — a duplicate is a no-op on re-run) ─────────────────────
do $$ begin
  create type public.form_type as enum ('form','survey','quiz');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.form_status as enum ('draft','published','archived');
exception when duplicate_object then null; end $$;

-- ── 1. forms — one row per form/survey/quiz. The vanilla builder reads/writes the
-- *_json columns; public_token is the unguessable public URL key; variant_of_id +
-- ab_split back the A/B split (a variant points at its parent, ab_split is the % of
-- traffic routed to it). status gates public visibility (only 'published' renders).
create table public.forms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  type public.form_type not null default 'form',
  status public.form_status not null default 'draft',
  fields_json jsonb not null default '[]'::jsonb,
  logic_json jsonb not null default '[]'::jsonb,
  settings_json jsonb not null default '{}'::jsonb,
  routing_json jsonb not null default '{}'::jsonb,
  variant_of_id uuid references public.forms(id) on delete set null,
  ab_split int not null default 50,
  public_token uuid not null default gen_random_uuid(),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 2. form_submissions — one row per completed (or pending) submission. Written by
-- the public-form Edge Function under the service role only. contact_id links the
-- upserted CRM contact; score/result_tier back quiz scoring; utm_json/ip_hash/variant
-- carry attribution; status='pending_confirmation' + confirm_token back double opt-in.
create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  answers_json jsonb not null default '{}'::jsonb,
  score int,
  result_tier text,
  utm_json jsonb not null default '{}'::jsonb,
  ip_hash text,
  variant text,
  status text not null default 'complete',   -- complete | pending_confirmation
  confirm_token uuid,
  created_at timestamptz not null default now()
);

-- ── 3. form_views — the funnel/analytics event stream (view → start → complete),
-- one row per event. Also service-role-written (the public tracker beacon). visitor_id
-- is an anonymous client id; step powers per-step drop-off; variant powers A/B stats.
create table public.form_views (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  visitor_id text not null,
  variant text,
  step int,
  event text not null default 'view',        -- view | start | complete
  created_at timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RLS + policies (RLS-AND-SECURITY §3). forms: member read · staff+ ins/upd ·
--    manager+ del (config the whole team uses; delete is the destructive tier).
--    form_submissions + form_views: member read · NO authenticated write — the
--    public-form Edge Function writes them under the service role, which bypasses
--    RLS (Gate-4, mirrors M12 D-055). Every table below enables RLS in THIS file.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.forms enable row level security;
create policy forms_sel on public.forms for select using ( public.is_member(workspace_id) );
create policy forms_ins on public.forms for insert with check ( public.has_role(workspace_id,'staff') );
create policy forms_upd on public.forms for update
  using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy forms_del on public.forms for delete using ( public.has_role(workspace_id,'manager') );

alter table public.form_submissions enable row level security;
create policy fsub_sel on public.form_submissions for select using ( public.is_member(workspace_id) );
-- NO insert/update/delete policy for authenticated: submissions are written by the
-- public-form Edge Function under the service role only (service_role bypasses RLS).
-- Mirrors M12 inbound traffic (D-055).

alter table public.form_views enable row level security;
create policy fview_sel on public.form_views for select using ( public.is_member(workspace_id) );
-- likewise service-role INSERT only (the public tracker beacon).

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Indexes — public_token is the unguessable lookup key (unique); the rest back
--    the list view (forms by status) and the analytics reads (submissions/views by
--    form over time, views split by event for the funnel).
-- ═══════════════════════════════════════════════════════════════════════════
create unique index forms_public_token_idx on public.forms (public_token);
create index forms_ws_status_idx on public.forms (workspace_id, status);
create index form_submissions_form_idx on public.form_submissions (form_id, created_at);
create index form_views_form_idx on public.form_views (form_id, created_at);
create index form_views_form_event_idx on public.form_views (form_id, event);

-- ── 6. updated_at maintenance on forms ───────────────────────────────────────
create trigger forms_set_updated_at before update on public.forms
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. submit_form — THE public submission pipeline (M15 Task 2).
--
-- Called by the public-form Edge Function under the SERVICE ROLE only (there is no
-- logged-in user on a public form → auth.uid() is null). SECURITY DEFINER so it can
-- write across M09 (contacts/tags/custom values), M05 (consent_records), M11 (deals)
-- and fan out to the M13 bus (emit_trigger) even though the caller owns none of
-- those RLS insert grants. Grant is service_role ONLY (NOT authenticated): the
-- browser can never forge a submission — it POSTs to the Edge Fn, which holds the key.
--
-- Integration contracts wired here (verified against the REAL migrations, NOT the
-- pseudocode):
--   · contacts (0013) has NO unique index on email → upsert is a manual
--     select-by-lower(email)+workspace / else select-by-phone / else insert (there
--     is no `on conflict` target to use). The assignee column is `assigned_to`
--     (uuid → auth.users), NOT `owner_id`.
--   · consent_records (0010) stores `granted boolean` (NOT a status enum) + a
--     `kind public.consent_kind`; there is no 'form' enum member, so a form opt-in
--     is recorded as email_optin/granted=true, source='form', with the exact
--     consent wording in evidence->>'text' (D-037 evidence pattern).
--   · activity_log is written by a DIRECT insert (not log_activity(), which gates on
--     is_member(auth.uid()) — null here); mirrors M14's tg_appointment_booked.
--   · emit_trigger(ws,type,payload) / notify(ws,targets[],type,title,body,data) are
--     called with their real 3- and 6-arg signatures.
--   · deals (0014) insert targets the workspace's first pipeline + its lowest
--     order_index stage (the default board is seeded by the provision worker, D-052).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.submit_form(
  p_token   uuid,
  p_answers jsonb,
  p_utm     jsonb   default '{}'::jsonb,
  p_visitor text    default null,
  p_variant text    default null,
  p_spam    jsonb   default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_form         public.forms;
  v_ws           uuid;
  v_settings     jsonb;
  v_routing      jsonb;
  v_answers      jsonb := coalesce(p_answers, '{}'::jsonb);
  v_clean        jsonb := '{}'::jsonb;
  v_hidden       text[] := '{}';
  v_errors       jsonb := '[]'::jsonb;
  v_field        jsonb;
  v_key          text;
  v_type         text;
  v_ans          text;
  v_map          text;
  v_rule         jsonb;
  v_honeypot     text;
  v_min_ms       int;
  v_elapsed      int;
  -- quiz
  v_score        int;
  v_tier         text;
  v_tier_row     jsonb;
  v_redirect     text;
  v_message      text;
  -- contact
  v_name         text;
  v_email        text;
  v_phone        text;
  v_first        text;
  v_last         text;
  v_contact      uuid;
  v_consent_key  text;
  v_consent_text text;
  v_source_tag   text;
  v_tag_id       uuid;
  v_fid          uuid;
  -- routing
  v_pipeline     uuid;
  v_stage        uuid;
  v_deal_value   numeric;
  v_owner        uuid;
  v_rr           jsonb;
  v_cand         text;
  v_best         uuid;
  v_best_cnt     bigint;
  v_cnt          bigint;
  -- submission
  v_sub          uuid;
  v_status       text := 'complete';
  v_confirm      uuid;
begin
  -- 1. Resolve the form by its public token; only a published form accepts.
  select * into v_form from public.forms where public_token = p_token;
  if not found then raise exception 'form_not_found'; end if;
  if v_form.status <> 'published' then raise exception 'form_not_published'; end if;
  v_ws       := v_form.workspace_id;
  v_settings := coalesce(v_form.settings_json, '{}'::jsonb);
  v_routing  := coalesce(v_form.routing_json,  '{}'::jsonb);

  -- 2. Spam gate. Honeypot: a named decoy field must be empty. Time-trap: if the
  --    client reported elapsed_ms, it must clear the (default 1500ms) floor; an
  --    ABSENT elapsed_ms passes (a real submit that didn't instrument timing).
  v_honeypot := nullif(v_settings->'spam'->>'honeypot','');
  if v_honeypot is not null and coalesce(v_answers->>v_honeypot,'') <> '' then
    return jsonb_build_object('status','spam_rejected');
  end if;
  v_min_ms := coalesce((v_settings->'spam'->>'min_ms')::int, 1500);
  if (p_spam ? 'elapsed_ms') then
    v_elapsed := coalesce((p_spam->>'elapsed_ms')::int, 0);
    if v_elapsed < v_min_ms then
      return jsonb_build_object('status','spam_rejected');
    end if;
  end if;

  -- 3. Server-side logic drop + re-validation. First compute hidden fields from
  --    logic_json (a hide rule whose condition holds, or a show rule whose
  --    condition fails, hides the target). Then validate visible required/typed
  --    fields and build v_clean = answers minus hidden keys (tamper guard).
  for v_rule in select * from jsonb_array_elements(coalesce(v_form.logic_json,'[]'::jsonb)) loop
    -- rule shape: {target, action:'hide'|'show', when:{field, op:'eq'|'neq', value}}
    declare
      r_target text := v_rule->>'target';
      r_action text := lower(coalesce(v_rule->>'action','hide'));
      r_wfield text := v_rule->'when'->>'field';
      r_wop    text := lower(coalesce(v_rule->'when'->>'op','eq'));
      r_wval   text := v_rule->'when'->>'value';
      r_actual text := coalesce(v_answers->>r_wfield,'');
      r_match  boolean;
    begin
      if r_target is null or r_wfield is null then continue; end if;
      r_match := case when r_wop = 'neq' then r_actual is distinct from r_wval
                      else r_actual = r_wval end;
      -- hide when: (hide-rule condition true) OR (show-rule condition false)
      if (r_action = 'hide' and r_match) or (r_action = 'show' and not r_match) then
        v_hidden := array_append(v_hidden, r_target);
      end if;
    end;
  end loop;

  for v_field in select * from jsonb_array_elements(coalesce(v_form.fields_json,'[]'::jsonb)) loop
    v_key  := v_field->>'key';
    v_type := lower(coalesce(v_field->>'type','text'));
    if v_key is null then continue; end if;
    if v_key = any(v_hidden) then continue; end if;              -- dropped, never stored
    v_ans := v_answers->>v_key;

    if coalesce((v_field->>'required')::boolean, false)
       and (v_ans is null or btrim(v_ans) = '') then
      v_errors := v_errors || jsonb_build_object('field', v_key, 'error', 'required');
      continue;
    end if;

    if v_ans is not null and btrim(v_ans) <> '' then
      if v_type = 'email' and v_ans !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        v_errors := v_errors || jsonb_build_object('field', v_key, 'error', 'invalid_email');
      elsif v_type = 'number' and v_ans !~ '^-?[0-9]+(\.[0-9]+)?$' then
        v_errors := v_errors || jsonb_build_object('field', v_key, 'error', 'invalid_number');
      elsif v_type = 'phone' and (length(regexp_replace(v_ans,'[^0-9]','','g')) < 7) then
        v_errors := v_errors || jsonb_build_object('field', v_key, 'error', 'invalid_phone');
      end if;
    end if;

    -- carry the (visible, valid-enough) answer into the clean payload
    if v_answers ? v_key then
      v_clean := jsonb_set(v_clean, array[v_key], v_answers->v_key);
    end if;
  end loop;

  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('status','validation_failed','errors',v_errors);
  end if;

  -- 4. Quiz scoring. settings_json.scoring maps field.key → { <answer>: points }.
  --    tiers is an array of {min,max,label,redirect,message}; the first tier whose
  --    [min,max] contains the score wins.
  if v_form.type = 'quiz' then
    v_score := 0;
    for v_field in select * from jsonb_array_elements(coalesce(v_form.fields_json,'[]'::jsonb)) loop
      v_key := v_field->>'key';
      if v_key is null or v_key = any(v_hidden) then continue; end if;
      v_ans := v_clean->>v_key;
      if v_ans is not null and (v_settings->'scoring'->v_key ? v_ans) then
        v_score := v_score + coalesce((v_settings->'scoring'->v_key->>v_ans)::int, 0);
      end if;
    end loop;
    for v_tier_row in select * from jsonb_array_elements(coalesce(v_settings->'tiers','[]'::jsonb)) loop
      if v_score >= coalesce((v_tier_row->>'min')::int, -2147483648)
         and v_score <= coalesce((v_tier_row->>'max')::int, 2147483647) then
        v_tier     := v_tier_row->>'label';
        v_redirect := coalesce(v_redirect, v_tier_row->>'redirect');
        v_message  := coalesce(v_message,  v_tier_row->>'message');
        exit;
      end if;
    end loop;
  end if;

  -- 5. Contact upsert (M09). Pull name/email/phone off any field mapped to them.
  for v_field in select * from jsonb_array_elements(coalesce(v_form.fields_json,'[]'::jsonb)) loop
    v_key := v_field->>'key';
    v_map := v_field->>'map_to';
    if v_key is null or v_key = any(v_hidden) then continue; end if;
    if v_map = 'name'  then v_name  := v_clean->>v_key; end if;
    if v_map = 'email' then v_email := lower(nullif(btrim(v_clean->>v_key),'')); end if;
    if v_map = 'phone' then v_phone := v_clean->>v_key; end if;
    -- remember the consent field (type='consent') + its exact wording for step 6
    if lower(coalesce(v_field->>'type','')) = 'consent' then
      v_consent_key  := v_key;
      v_consent_text := v_field->>'consent_text';
    end if;
  end loop;

  if v_name is not null then
    v_first := split_part(btrim(v_name), ' ', 1);
    v_last  := nullif(btrim(substr(btrim(v_name), length(split_part(btrim(v_name),' ',1)) + 1)), '');
  end if;

  -- anonymous survey (no consent field) → skip contact/consent/routing entirely.
  -- (coalesce guards SQL three-valued logic: a missing 'anonymous' key must read as
  -- "not anonymous" → the contact block runs.)
  if not (coalesce(v_settings->>'anonymous','') = 'true' and v_consent_key is null) then
    -- resolve an existing contact: email first (contacts has NO unique email index
    -- in 0013 → manual match), then phone.
    if v_email is not null then
      select id into v_contact from public.contacts
       where workspace_id = v_ws and lower(email) = v_email and deleted_at is null
       order by created_at limit 1;
    end if;
    if v_contact is null and v_phone is not null then
      select id into v_contact from public.contacts
       where workspace_id = v_ws
         and regexp_replace(coalesce(phone,''),'[^0-9]','','g')
             = regexp_replace(v_phone,'[^0-9]','','g')
         and regexp_replace(v_phone,'[^0-9]','','g') <> ''
         and deleted_at is null
       order by created_at limit 1;
    end if;

    if v_contact is null then
      insert into public.contacts (workspace_id, first_name, last_name, email, phone, source,
                                   utm_source, utm_medium, utm_campaign)
      values (v_ws, v_first, v_last, v_email, v_phone, 'form:' || v_form.id,
              nullif(p_utm->>'utm_source',''), nullif(p_utm->>'utm_medium',''), nullif(p_utm->>'utm_campaign',''))
      returning id into v_contact;
    else
      update public.contacts set
        first_name = coalesce(v_first, first_name),
        last_name  = coalesce(v_last,  last_name),
        email      = coalesce(v_email, email),
        phone      = coalesce(v_phone, phone),
        updated_at = now()
      where id = v_contact;
    end if;

    -- map every field carrying a map_to that ISN'T a known contact column into a
    -- contact_custom_values row (auto-creating the custom_fields def).
    for v_field in select * from jsonb_array_elements(coalesce(v_form.fields_json,'[]'::jsonb)) loop
      v_key := v_field->>'key';
      v_map := v_field->>'map_to';
      if v_key is null or v_map is null or v_key = any(v_hidden) then continue; end if;
      if v_map in ('name','email','phone') then continue; end if;
      -- resolve/create the custom field definition (unique per workspace+name)
      insert into public.custom_fields (workspace_id, field_name, field_type)
        values (v_ws, v_map, 'text') on conflict (workspace_id, field_name) do nothing;
      select id into v_fid from public.custom_fields where workspace_id = v_ws and field_name = v_map;
      insert into public.contact_custom_values (workspace_id, contact_id, field_id, value)
        values (v_ws, v_contact, v_fid, v_clean->>v_key)
        on conflict (contact_id, field_id) do update set value = excluded.value;
    end loop;

    -- 6. Consent (M05). A truthy answer on the consent field records an opt-in with
    --    the exact wording. Double opt-in defers the consent + tags + routing + bus
    --    to Task 3's form_confirm_optin: we insert a PENDING submission and return.
    if v_consent_key is not null and coalesce((v_answers->>v_consent_key)::boolean, false) then
      if v_settings->>'double_optin' = 'true' then
        v_confirm := gen_random_uuid();
        insert into public.form_submissions
          (form_id, workspace_id, contact_id, answers_json, score, result_tier, utm_json,
           ip_hash, variant, status, confirm_token)
        values (v_form.id, v_ws, v_contact, v_clean, v_score, v_tier, coalesce(p_utm,'{}'::jsonb),
                nullif(p_spam->>'ip_hash',''), p_variant, 'pending_confirmation', v_confirm)
        returning id into v_sub;
        return jsonb_build_object('status','pending_confirmation');
      end if;
      insert into public.consent_records (workspace_id, contact_id, kind, granted, source, ip_hash, evidence)
      values (v_ws, v_contact, 'email_optin', true, 'form', nullif(p_spam->>'ip_hash',''),
              jsonb_build_object('text', v_consent_text, 'form_id', v_form.id));
    end if;

    -- 7. Tags — the form's source tag + one tag per UTM value (idempotent).
    v_source_tag := coalesce(nullif(v_settings->>'source_tag',''), v_form.name);
    perform public._form_add_tag(v_ws, v_contact, v_source_tag);
    for v_key in select value from jsonb_each_text(coalesce(p_utm,'{}'::jsonb)) where nullif(value,'') is not null loop
      perform public._form_add_tag(v_ws, v_contact, v_key);
    end loop;

    -- 8. Routing (routing_json). assign_owner (round-robin least-loaded), extra
    --    tags, and an optional deal on the workspace default pipeline/first stage.
    if coalesce((v_routing->>'assign_owner')::boolean, false) then
      v_rr := v_routing->'round_robin_ids';
      if v_rr is not null and jsonb_array_length(v_rr) > 0 then
        v_best := null; v_best_cnt := null;
        for v_cand in select value from jsonb_array_elements_text(v_rr) loop
          select count(*) into v_cnt from public.contacts
            where workspace_id = v_ws and assigned_to = v_cand::uuid and deleted_at is null;
          if v_best_cnt is null or v_cnt < v_best_cnt then
            v_best := v_cand::uuid; v_best_cnt := v_cnt;
          end if;
        end loop;
        v_owner := v_best;
      end if;
      if v_owner is not null then
        update public.contacts set assigned_to = v_owner, updated_at = now() where id = v_contact;
      end if;
    end if;

    for v_key in select value from jsonb_array_elements_text(coalesce(v_routing->'tags','[]'::jsonb)) loop
      perform public._form_add_tag(v_ws, v_contact, v_key);
    end loop;

    if coalesce((v_routing->>'create_deal')::boolean, false) then
      select id into v_pipeline from public.pipelines where workspace_id = v_ws order by created_at limit 1;
      if v_pipeline is not null then
        select id into v_stage from public.pipeline_stages
          where workspace_id = v_ws and pipeline_id = v_pipeline order by order_index limit 1;
        v_deal_value := nullif(v_clean->>(v_routing->>'value_field'), '')::numeric;
        insert into public.deals (workspace_id, pipeline_id, stage_id, contact_id, title, value, assigned_to)
        values (v_ws, v_pipeline, v_stage, v_contact,
                coalesce(v_name, v_form.name) || ' — ' || v_form.name, v_deal_value, v_owner);
      end if;
    end if;

    v_redirect := coalesce(v_redirect, nullif(v_routing->>'redirect',''));
    v_message  := coalesce(v_message,  nullif(v_routing->>'thank_you',''));
  end if;

  -- 9-11. Insert the submission FIRST (so v_sub is known), then fan out to the bus,
  --        the timeline, and the staff notification.
  insert into public.form_submissions
    (form_id, workspace_id, contact_id, answers_json, score, result_tier, utm_json,
     ip_hash, variant, status)
  values (v_form.id, v_ws, v_contact, v_clean, v_score, v_tier, coalesce(p_utm,'{}'::jsonb),
          nullif(p_spam->>'ip_hash',''), p_variant, v_status)
  returning id into v_sub;

  perform public.emit_trigger(v_ws, 'form.submitted',
    jsonb_build_object('form_id', v_form.id, 'contact_id', v_contact,
                       'submission_id', v_sub, 'answers', v_clean));

  -- timeline (direct insert — a public submit has no auth.uid(); definer bypasses RLS,
  -- and log_activity() would raise on is_member()). Only when a contact resolved.
  if v_contact is not null then
    insert into public.activity_log (workspace_id, contact_id, type, description, metadata, actor_id)
    values (v_ws, v_contact, 'form', 'Submitted "' || v_form.name || '"',
            jsonb_build_object('form_id', v_form.id, 'submission_id', v_sub), auth.uid());
  end if;

  perform public.notify(v_ws, array['staff'], 'form.submitted',
    'New submission: ' || v_form.name, null,
    jsonb_build_object('link', '/forms/' || v_form.id || '/results', 'submission_id', v_sub));

  return jsonb_build_object('status', v_status, 'result_tier', v_tier,
                            'redirect', v_redirect, 'message', v_message);
end $$;

-- helper: idempotently ensure a tag exists (by name, per workspace) and attach it
-- to the contact. Extracted so the source-tag / UTM / routing-tag loops stay flat.
create or replace function public._form_add_tag(p_ws uuid, p_contact uuid, p_name text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_tag uuid;
begin
  if p_contact is null or nullif(btrim(p_name),'') is null then return; end if;
  insert into public.tags (workspace_id, name) values (p_ws, btrim(p_name))
    on conflict (workspace_id, name) do nothing;
  select id into v_tag from public.tags where workspace_id = p_ws and name = btrim(p_name);
  insert into public.contact_tags (workspace_id, contact_id, tag_id)
    values (p_ws, p_contact, v_tag) on conflict (contact_id, tag_id) do nothing;
end $$;

revoke all on function public.submit_form(uuid,jsonb,jsonb,text,text,jsonb) from public;
grant execute on function public.submit_form(uuid,jsonb,jsonb,text,text,jsonb) to service_role;
revoke all on function public._form_add_tag(uuid,uuid,text) from public;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. _form_finalize — the deferred "complete" tail (M15 Task 3a).
--
-- submit_form's double_optin branch inserts a pending_confirmation submission and
-- returns EARLY, deferring the consent + tags + routing + bus/timeline/notify tail.
-- form_confirm_optin (below) runs that tail once the subscriber clicks the link.
--
-- This helper re-resolves everything it needs from the ALREADY-INSERTED submission
-- row (form, contact, stored answers, utm) and replays the tail. It is a faithful
-- copy of submit_form's steps 6-11 rather than a refactor of them: in submit_form
-- the submission is inserted LAST (step 9, after routing) so v_sub is only known at
-- the end, whereas here the row exists up front — the control flow differs enough
-- that extracting a single shared body would force risky edits to the already-green
-- submit_form. The complete-path tail there is left untouched (DRY note in DECISIONS);
-- the shared consent/tag/routing SEMANTICS are what this mirrors, exactly.
--
-- SECURITY DEFINER (writes across M05/M09/M11 + the M13 bus with no logged-in user);
-- grant is service_role ONLY (the confirm Edge Fn holds the key).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public._form_finalize(p_sub uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row          public.form_submissions;
  v_form         public.forms;
  v_ws           uuid;
  v_settings     jsonb;
  v_routing      jsonb;
  v_clean        jsonb;
  v_utm          jsonb;
  v_contact      uuid;
  v_field        jsonb;
  v_key          text;
  v_map          text;
  v_name         text;
  v_consent_key  text;
  v_consent_text text;
  v_source_tag   text;
  v_owner        uuid;
  v_rr           jsonb;
  v_cand         text;
  v_best         uuid;
  v_best_cnt     bigint;
  v_cnt          bigint;
  v_pipeline     uuid;
  v_stage        uuid;
  v_deal_value   numeric;
begin
  select * into v_row from public.form_submissions where id = p_sub;
  if not found then return; end if;
  select * into v_form from public.forms where id = v_row.form_id;
  if not found then return; end if;
  v_ws       := v_row.workspace_id;
  v_contact  := v_row.contact_id;
  v_clean    := coalesce(v_row.answers_json, '{}'::jsonb);
  v_utm      := coalesce(v_row.utm_json, '{}'::jsonb);
  v_settings := coalesce(v_form.settings_json, '{}'::jsonb);
  v_routing  := coalesce(v_form.routing_json,  '{}'::jsonb);

  -- resolve the display name (for the deal title) + the consent field wording.
  for v_field in select * from jsonb_array_elements(coalesce(v_form.fields_json,'[]'::jsonb)) loop
    v_key := v_field->>'key';
    v_map := v_field->>'map_to';
    if v_key is null then continue; end if;
    if v_map = 'name' then v_name := v_clean->>v_key; end if;
    if lower(coalesce(v_field->>'type','')) = 'consent' then
      v_consent_key  := v_key;
      v_consent_text := v_field->>'consent_text';
    end if;
  end loop;

  -- 6. Consent (M05) — the deferred opt-in, recorded verbatim now that it's confirmed.
  if v_contact is not null and v_consent_key is not null then
    insert into public.consent_records (workspace_id, contact_id, kind, granted, source, ip_hash, evidence)
    values (v_ws, v_contact, 'email_optin', true, 'form', v_row.ip_hash,
            jsonb_build_object('text', v_consent_text, 'form_id', v_form.id));
  end if;

  -- 7. Tags — source tag + one per UTM value (idempotent).
  v_source_tag := coalesce(nullif(v_settings->>'source_tag',''), v_form.name);
  perform public._form_add_tag(v_ws, v_contact, v_source_tag);
  for v_key in select value from jsonb_each_text(v_utm) where nullif(value,'') is not null loop
    perform public._form_add_tag(v_ws, v_contact, v_key);
  end loop;

  -- 8. Routing (assign_owner round-robin · routing tags · optional deal).
  if coalesce((v_routing->>'assign_owner')::boolean, false) then
    v_rr := v_routing->'round_robin_ids';
    if v_rr is not null and jsonb_array_length(v_rr) > 0 then
      v_best := null; v_best_cnt := null;
      for v_cand in select value from jsonb_array_elements_text(v_rr) loop
        select count(*) into v_cnt from public.contacts
          where workspace_id = v_ws and assigned_to = v_cand::uuid and deleted_at is null;
        if v_best_cnt is null or v_cnt < v_best_cnt then
          v_best := v_cand::uuid; v_best_cnt := v_cnt;
        end if;
      end loop;
      v_owner := v_best;
    end if;
    if v_owner is not null and v_contact is not null then
      update public.contacts set assigned_to = v_owner, updated_at = now() where id = v_contact;
    end if;
  end if;

  for v_key in select value from jsonb_array_elements_text(coalesce(v_routing->'tags','[]'::jsonb)) loop
    perform public._form_add_tag(v_ws, v_contact, v_key);
  end loop;

  if coalesce((v_routing->>'create_deal')::boolean, false) and v_contact is not null then
    select id into v_pipeline from public.pipelines where workspace_id = v_ws order by created_at limit 1;
    if v_pipeline is not null then
      select id into v_stage from public.pipeline_stages
        where workspace_id = v_ws and pipeline_id = v_pipeline order by order_index limit 1;
      v_deal_value := nullif(v_clean->>(v_routing->>'value_field'), '')::numeric;
      insert into public.deals (workspace_id, pipeline_id, stage_id, contact_id, title, value, assigned_to)
      values (v_ws, v_pipeline, v_stage, v_contact,
              coalesce(v_name, v_form.name) || ' — ' || v_form.name, v_deal_value, v_owner);
    end if;
  end if;

  -- 9-11. Bus emit · timeline · staff notification (submission already exists).
  perform public.emit_trigger(v_ws, 'form.submitted',
    jsonb_build_object('form_id', v_form.id, 'contact_id', v_contact,
                       'submission_id', p_sub, 'answers', v_clean));

  if v_contact is not null then
    insert into public.activity_log (workspace_id, contact_id, type, description, metadata, actor_id)
    values (v_ws, v_contact, 'form', 'Submitted "' || v_form.name || '"',
            jsonb_build_object('form_id', v_form.id, 'submission_id', p_sub), auth.uid());
  end if;

  perform public.notify(v_ws, array['staff'], 'form.submitted',
    'New submission: ' || v_form.name, null,
    jsonb_build_object('link', '/forms/' || v_form.id || '/results', 'submission_id', p_sub));
end $$;

revoke all on function public._form_finalize(uuid) from public;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. form_confirm_optin — double opt-in confirmation (M15 Task 3a).
--
-- The confirm Edge Fn calls this with the confirm_token from the emailed link. It
-- flips the pending submission to complete and runs the deferred tail via
-- _form_finalize. Idempotent: an unknown / already-consumed token (confirm_token is
-- nulled on success) returns {status:'already_confirmed'} without side effects, so a
-- double-click never double-writes consent. SECURITY DEFINER · service_role only.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.form_confirm_optin(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sub uuid;
begin
  if p_token is null then return jsonb_build_object('status','already_confirmed'); end if;
  -- claim the pending row (confirm_token is nulled below → a second call finds nothing)
  select id into v_sub from public.form_submissions
    where confirm_token = p_token and status = 'pending_confirmation'
    limit 1;
  if v_sub is null then return jsonb_build_object('status','already_confirmed'); end if;

  update public.form_submissions
    set status = 'complete', confirm_token = null
    where id = v_sub;

  perform public._form_finalize(v_sub);
  return jsonb_build_object('status','complete');
end $$;

revoke all on function public.form_confirm_optin(uuid) from public;
grant execute on function public.form_confirm_optin(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. form_analytics — funnel + drop-off + A/B stats (M15 Task 3b).
--
-- STABLE read for the results dashboard. Guards is_member of the form's workspace
-- (a member READS their own analytics; a non-member raises not_authorized). Returns:
--   { views, starts, completions, submissions, conversion,
--     by_step: { "<step>": <start count> },      -- per-step drop-off
--     ab:      { "<variant>": { views, submissions } } }  -- A/B split
-- Granted to authenticated (the dashboard call) + service_role.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.form_analytics(p_form uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ws           uuid;
  v_views        bigint;
  v_starts       bigint;
  v_completions  bigint;
  v_submissions  bigint;
  v_by_step      jsonb;
  v_ab           jsonb;
begin
  select workspace_id into v_ws from public.forms where id = p_form;
  if v_ws is null then raise exception 'form_not_found'; end if;
  if not public.is_member(v_ws) then raise exception 'not_authorized'; end if;

  select
    count(*) filter (where event = 'view'),
    count(*) filter (where event = 'start'),
    count(*) filter (where event = 'complete')
    into v_views, v_starts, v_completions
    from public.form_views where form_id = p_form;

  select count(*) into v_submissions from public.form_submissions where form_id = p_form;

  -- per-step drop-off: start events grouped by their step.
  select coalesce(jsonb_object_agg(step::text, cnt), '{}'::jsonb) into v_by_step
    from (select step, count(*) cnt from public.form_views
           where form_id = p_form and event = 'start' and step is not null
           group by step) s;

  -- A/B: views + submissions per variant (only rows that carry a variant).
  select coalesce(jsonb_object_agg(variant, jsonb_build_object('views', v_cnt, 'submissions', s_cnt)), '{}'::jsonb)
    into v_ab
    from (
      select variant,
             (select count(*) from public.form_views fv
                where fv.form_id = p_form and fv.event = 'view' and fv.variant = x.variant) as v_cnt,
             (select count(*) from public.form_submissions fs
                where fs.form_id = p_form and fs.variant = x.variant) as s_cnt
        from (
          select variant from public.form_views where form_id = p_form and variant is not null
          union
          select variant from public.form_submissions where form_id = p_form and variant is not null
        ) x
    ) ab;

  return jsonb_build_object(
    'views',       v_views,
    'starts',      v_starts,
    'completions', v_completions,
    'submissions', v_submissions,
    'conversion',  round(v_completions::numeric / nullif(v_views, 0), 4),
    'by_step',     v_by_step,
    'ab',          v_ab);
end $$;

revoke all on function public.form_analytics(uuid) from public;
grant execute on function public.form_analytics(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. assign_form_variant — deterministic A/B assignment (M15 Task 3c).
--
-- The public-form Edge Fn (Task 4) calls this to decide which variant to render for
-- a visitor. Kept in SQL (not the Edge Fn) so it's probe-testable and so the same
-- deterministic rule backs both the render and any server-side A/B analytics.
--
-- Resolves the A/B family: the "root" is the form itself if it has no variant_of_id,
-- else its parent. The family = root + its published variant children, ordered
-- deterministically. If there is only one form in the family (no siblings/children),
-- there is no A/B in play → return null. Otherwise hash the visitor into a stable
-- bucket weighted by each child's ab_split (the root implicitly takes the remainder),
-- so the SAME visitor always resolves to the SAME variant. Returns the chosen form's
-- id::text. STABLE + immutable-by-inputs. service_role only (the Edge Fn holds the key).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.assign_form_variant(p_form uuid, p_visitor text)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_root    uuid;
  v_family  uuid[];
  v_weights int[];
  v_total   int := 0;
  v_bucket  int;
  v_acc     int := 0;
  v_hash    bigint;
  i         int;
begin
  -- root = this form if it's a parent, else its parent.
  select coalesce(variant_of_id, id) into v_root from public.forms where id = p_form;
  if v_root is null then return null; end if;

  -- family = root first, then its published variant children (stable order by id).
  select array_agg(id order by (id <> v_root), id),
         array_agg(greatest(coalesce(ab_split,50),0) order by (id <> v_root), id)
    into v_family, v_weights
    from public.forms
   where (id = v_root or variant_of_id = v_root) and status = 'published';

  -- no A/B in play (root alone, no published children).
  if v_family is null or array_length(v_family, 1) < 2 then return null; end if;

  -- deterministic bucket: hash the visitor into [0,total) over the summed weights.
  foreach i in array v_weights loop v_total := v_total + i; end loop;
  if v_total <= 0 then return v_family[1]::text; end if;
  v_hash  := ('x' || substr(md5(p_visitor), 1, 8))::bit(32)::bigint;  -- 0 .. 4294967295
  v_bucket := (v_hash % v_total)::int;

  for i in 1 .. array_length(v_family, 1) loop
    v_acc := v_acc + v_weights[i];
    if v_bucket < v_acc then return v_family[i]::text; end if;
  end loop;
  return v_family[array_length(v_family,1)]::text;
end $$;

revoke all on function public.assign_form_variant(uuid,text) from public;
grant execute on function public.assign_form_variant(uuid,text) to service_role;
