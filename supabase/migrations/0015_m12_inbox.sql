-- ═══════════════════════════════════════════════════════════════════════════
-- 0015_m12_inbox.sql — AiMindShare Session 10 · M12 Inbox (Email + SMS)
--
-- Omnichannel conversations. Ships DATA-SCHEMA §8 verbatim (conversations,
-- messages, channels, canned_responses) onto the locked stack, plus the small
-- additions PRD_M12 §3 calls for (message delivery status, ai_generated flag,
-- full-text search, unread counts). PRD_M12's Prisma / Pusher / BullMQ is
-- superseded: realtime is Supabase Realtime (D-029 pattern, publication add at
-- the foot of this file), the "timeline.add()" event bus is M09's activity_log
-- written by a SECURITY DEFINER trigger, and there is NO async work in THIS
-- module (outbound SMS is a synchronous Edge Function send; no jobs, no cron).
--
-- SCOPE (BUILD-SEQUENCE S10 accept-when): SMS threads + Twilio inbound webhook
-- (signature-verified) + outbound send (meter++), internal notes, canned "/"
-- responses, assignment. WhatsApp/FB/IG defer to their provider weeks; EMAIL
-- send/receive defers with OPEN D-011 (provider) exactly like M04 — the schema
-- is channel-agnostic (conv_channel enum) but only SMS is wired live this
-- session. AI auto-reply defers to M33 (not built). The webchat widget is out
-- of the S10 accept-when (deferred). All flagged on TASKS.md.
--
-- Migration number 0015 (M03=0009, M05/M41=0010, M04=0011, M09=0013, M11=0014;
-- the `0012` gap is the still-unresolved M05 renumber Session 5 flagged for a
-- human — NOT touched here, migrations are append-only).
--
-- Depends on: 0000 (conv_channel/msg_direction enums, set_updated_at),
-- 0001 tenancy (is_member/has_role), 0011 M04 (notify() for @mentions),
-- 0013 M09 (contacts + activity_log — the timeline).
--
-- Logged extensions / deviations from canonical §8 (Law 8 → DECISIONS):
--   • D-053  conversations gains status CHECK ('open'|'pending'|'resolved'|'spam'
--            = PRD's Open/In Progress/Resolved/Spam), unread_count, last_channel
--            (reply defaults to last-inbound channel), ai_mode (per-conversation
--            AI toggle; the M33 engine is deferred so it stays a labelled scaffold).
--   • D-054  messages gains status (queued|sent|delivered|failed — provider
--            callbacks), ai_generated bool, external_id (provider MessageSid →
--            delivery callbacks + webhook idempotency), mentions uuid[] (@mention
--            targets), and a generated search_tsv + GIN (PRD full-text search).
--   • D-055  messages INSERT policy restricts the BROWSER to internal notes only
--            (is_internal_note = true). Every real channel message (inbound + the
--            metered outbound send) is written by the service role via the Edge
--            Functions / the ingest RPC — the browser can never forge inbound
--            traffic or bypass the send gates by inserting an outbound row.
--   • D-056  channels write = admin+ (integrations posture, RLS §2 + M41 D-033).
--            Non-secret config only; Twilio/Gmail creds live in Vault (Law 3).
--   • D-057  Inbox uses the coarse RLS tiers (staff+ reply/note/assign, manager+
--            delete/manage canned, admin+ channels) rather than minting new
--            inbox.* fine grants this session — same call as M11 D-049 / M41 D-035
--            ("RLS enforces coarse, don't rebuild the registry for zero security
--            gain"); dedicated inbox.* grants can be added to the M02 registry later.
--   • D-058  M12 CREATES the conv_channel + msg_direction enums. DATA-SCHEMA §1
--            lists them as canonical, but 0000 only shipped the enums the early
--            sessions needed; M12 is their first consumer, so it defines them here
--            (idempotent DO-block, values verbatim from §1) — same append-as-needed
--            posture as D-027. Any later channel module reuses them.
--
-- Order: enums → tables → indexes → triggers → RLS + policies → RPCs → realtime.
-- Every table created here enables RLS in THIS file (Gate-8).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. Enums (DATA-SCHEMA §1; deferred from 0000, first consumed here — D-058) ─
do $$ begin
  create type public.conv_channel as enum ('email','sms','whatsapp','fb','ig','webchat','voice');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.msg_direction as enum ('inbound','outbound');
exception when duplicate_object then null; end $$;

-- ── 1. Tables (DATA-SCHEMA §8 verbatim + logged extensions) ──────────────────

-- conversations — one thread per (contact, channel). §8 verbatim + D-053.
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  contact_id      uuid references public.contacts(id) on delete set null,
  channel         public.conv_channel not null,
  status          text not null default 'open',
  assigned_to     uuid references auth.users(id),
  last_message_at timestamptz,
  last_channel    public.conv_channel,              -- D-053: reply defaults to last-inbound channel
  unread_count    int not null default 0,           -- D-053: maintained by the message trigger
  ai_mode         boolean not null default false,   -- D-053: per-conversation AI toggle (M33 scaffold)
  created_at      timestamptz not null default now(),
  constraint conversations_status_chk check (status in ('open','pending','resolved','spam'))
);
create index if not exists conversations_ws_last_idx   on public.conversations (workspace_id, last_message_at desc);
create index if not exists conversations_ws_status_idx on public.conversations (workspace_id, status);
create index if not exists conversations_assignee_idx  on public.conversations (assigned_to);
create index if not exists conversations_contact_idx   on public.conversations (contact_id);

-- messages — every message + internal note in a thread. §8 verbatim + D-054.
create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  direction        public.msg_direction not null,
  channel          public.conv_channel not null,
  content          text,
  media_url        text,
  sender_id        uuid,                             -- auth.users(id) for outbound/notes; null for inbound
  is_internal_note boolean not null default false,
  status           text not null default 'sent',     -- D-054: queued|sent|delivered|failed (provider callbacks)
  ai_generated     boolean not null default false,   -- D-054: labelled AI reply (M33; scaffold this session)
  external_id      text,                             -- D-054: provider MessageSid — callbacks + idempotency
  mentions         uuid[] not null default '{}',     -- D-054: @mention targets → M04 notify()
  created_at       timestamptz not null default now(),
  -- D-054: full-text search over the message body (PRD §2 "Postgres full-text").
  search_tsv       tsvector generated always as (to_tsvector('english', coalesce(content, ''))) stored,
  constraint messages_status_chk check (status in ('queued','sent','delivered','failed'))
);
create index if not exists messages_ws_conv_idx  on public.messages (workspace_id, conversation_id, created_at);
create index if not exists messages_search_idx   on public.messages using gin (search_tsv);
create index if not exists messages_external_idx on public.messages (workspace_id, external_id);

-- channels — a connected channel (a Twilio number, a Gmail address…). §8 verbatim
-- + D-056. config holds NON-secret settings only; the credential lives in Vault.
create table if not exists public.channels (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  type          public.conv_channel not null,
  label         text,                                -- display name ("Main line", "hello@…")
  external_ref  text,                                -- non-secret handle: the E.164 number / email / page id
  config        jsonb not null default '{}',         -- NON-secret; creds live in Vault (Law 3)
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);
create index if not exists channels_ws_idx on public.channels (workspace_id);

-- canned_responses — "/" quick replies with {{variable}} tokens. §8 verbatim.
create table if not exists public.canned_responses (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  shortcut      text,                                -- the "/greeting" trigger (no leading slash stored)
  title         text,
  content       text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);
create index if not exists canned_ws_shortcut_idx on public.canned_responses (workspace_id, shortcut);

-- ── 2. Triggers ──────────────────────────────────────────────────────────────
create trigger channels_set_updated_at        before update on public.channels         for each row execute function public.set_updated_at();
create trigger canned_responses_set_updated_at before update on public.canned_responses for each row execute function public.set_updated_at();

-- messages_after_insert — the one place a new message updates its conversation and
-- fans out to the timeline / notifications. SECURITY DEFINER so it works for BOTH
-- the browser (internal notes; auth.uid() = the author) AND the service role
-- (inbound + outbound channel messages; auth.uid() is null). It writes activity_log
-- DIRECTLY (not via log_activity(), whose is_member() guard would reject the
-- service role) — same definer-insert pattern as M11's deal_value_history writer.
create or replace function public.messages_after_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_contact uuid;
begin
  -- Bump the conversation: last activity, last channel, and unread (inbound, non-note).
  update public.conversations c set
    last_message_at = new.created_at,
    last_channel    = new.channel,
    unread_count    = c.unread_count
      + case when new.direction = 'inbound' and not new.is_internal_note then 1 else 0 end
  where c.id = new.conversation_id
  returning c.contact_id into v_contact;

  if not new.is_internal_note then
    -- Timeline (PRD "timeline.add()"): one activity_log row per real message, so
    -- the M09 contact timeline shows the whole conversation history. Only when the
    -- thread is tied to a contact (unresolved inbound has nothing to attach to).
    if v_contact is not null then
      insert into public.activity_log (workspace_id, contact_id, type, description, metadata, actor_id)
      values (new.workspace_id, v_contact, new.channel::text,
              left(coalesce(new.content, case when new.media_url is not null then '[attachment]' else '' end), 140),
              jsonb_build_object('conversation_id', new.conversation_id, 'message_id', new.id,
                                 'direction', new.direction, 'channel', new.channel::text,
                                 'ai_generated', new.ai_generated),
              new.sender_id);
    end if;
  elsif array_length(new.mentions, 1) is not null then
    -- Internal note @mentions → M04 in-app notifications (notify() is service-role
    -- granted; this definer trigger may call it regardless of the caller).
    perform public.notify(
      new.workspace_id,
      (select array_agg(m::text) from unnest(new.mentions) m),
      'mention',
      'You were mentioned in a conversation',
      left(coalesce(new.content, ''), 140),
      jsonb_build_object('link', '#/inbox/' || new.conversation_id::text,
                         'conversation_id', new.conversation_id));
  end if;

  return new;
end $$;

create trigger messages_after_insert_trg after insert on public.messages
  for each row execute function public.messages_after_insert();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RLS + policies (RLS-AND-SECURITY §3 standard template unless noted)
--    conversations: member read · staff+ ins/upd · manager+ del.
--    messages:      member read · staff+ ins BUT internal-notes-only (D-055) ·
--                   channel traffic written by the service role · manager+ del.
--    channels:      member read · admin+ write (integrations, D-056).
--    canned:        member read · staff+ ins/upd · manager+ del.
-- ═══════════════════════════════════════════════════════════════════════════

-- conversations — standard template. Assign / status / ai_mode are staff+ updates.
alter table public.conversations enable row level security;
create policy conversations_sel on public.conversations for select using ( public.is_member(workspace_id) );
create policy conversations_ins on public.conversations for insert with check ( public.has_role(workspace_id,'staff') );
create policy conversations_upd on public.conversations for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy conversations_del on public.conversations for delete using ( public.has_role(workspace_id,'manager') );

-- messages — the browser may ONLY insert internal notes (D-055). Real channel
-- messages (inbound webhook + outbound send) are service-role writes and bypass
-- RLS. Notes are editable by staff+ (still notes-only via the with-check).
alter table public.messages enable row level security;
create policy messages_sel on public.messages for select using ( public.is_member(workspace_id) );
create policy messages_ins on public.messages for insert
  with check ( public.has_role(workspace_id,'staff') and is_internal_note = true );
create policy messages_upd on public.messages for update
  using ( public.has_role(workspace_id,'staff') and is_internal_note = true )
  with check ( public.has_role(workspace_id,'staff') and is_internal_note = true );
create policy messages_del on public.messages for delete using ( public.has_role(workspace_id,'manager') );

-- channels — integration config, admin+ (D-056).
alter table public.channels enable row level security;
create policy channels_sel on public.channels for select using ( public.is_member(workspace_id) );
create policy channels_ins on public.channels for insert with check ( public.has_role(workspace_id,'admin') );
create policy channels_upd on public.channels for update using ( public.has_role(workspace_id,'admin') ) with check ( public.has_role(workspace_id,'admin') );
create policy channels_del on public.channels for delete using ( public.has_role(workspace_id,'admin') );

-- canned_responses — team snippets, staff+ manage, manager+ delete.
alter table public.canned_responses enable row level security;
create policy canned_sel on public.canned_responses for select using ( public.is_member(workspace_id) );
create policy canned_ins on public.canned_responses for insert with check ( public.has_role(workspace_id,'staff') );
create policy canned_upd on public.canned_responses for update using ( public.has_role(workspace_id,'staff') ) with check ( public.has_role(workspace_id,'staff') );
create policy canned_del on public.canned_responses for delete using ( public.has_role(workspace_id,'manager') );

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RPCs — conversation upsert, inbound ingest, read state, full-text search
-- ═══════════════════════════════════════════════════════════════════════════

-- upsert_conversation — find the live (non-resolved) thread for (contact, channel)
-- or create one. SECURITY DEFINER: the outbound Edge Function (service role) and a
-- staff user both use it. Guards on has_role only when there IS a caller identity
-- (auth.uid() is null under the service role, which is already trusted).
create or replace function public.upsert_conversation(p_ws uuid, p_contact uuid, p_channel public.conv_channel)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is not null and not public.has_role(p_ws, 'staff') then
    raise exception 'starting a conversation requires staff+' using errcode = '42501';
  end if;

  select id into v_id from public.conversations
   where workspace_id = p_ws
     and channel = p_channel
     and status <> 'resolved'
     and coalesce(contact_id::text, '∅') = coalesce(p_contact::text, '∅')
   order by last_message_at desc nulls last
   limit 1;

  if v_id is null then
    insert into public.conversations (workspace_id, contact_id, channel, last_channel)
    values (p_ws, p_contact, p_channel, p_channel)
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- ingest_inbound_message — the whole inbound pipeline in one atomic call: resolve
-- (or create) the contact by normalized phone (SMS) / passthrough, find-or-open the
-- conversation, and append the inbound message. Called ONLY by the webhook under
-- the service role (service_role grant), never the browser. Returns the message id.
create or replace function public.ingest_inbound_message(
  p_ws uuid, p_channel public.conv_channel, p_from text, p_body text,
  p_external_id text default null, p_media text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_contact uuid; v_conv uuid; v_msg uuid; v_digits text;
begin
  -- Idempotency: a redelivered webhook (same provider id) must not double-insert.
  if p_external_id is not null then
    select id into v_msg from public.messages
     where workspace_id = p_ws and external_id = p_external_id and direction = 'inbound' limit 1;
    if v_msg is not null then return v_msg; end if;
  end if;

  -- Contact resolution (phone-only for SMS this session; PSID map defers with Meta).
  if p_channel = 'sms' and p_from is not null then
    v_digits := regexp_replace(p_from, '[^0-9]', '', 'g');
    if length(v_digits) >= 7 then
      select id into v_contact from public.contacts
       where workspace_id = p_ws and right(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'), 10) = right(v_digits, 10)
       order by created_at limit 1;
      if v_contact is null then
        insert into public.contacts (workspace_id, first_name, phone, source)
        values (p_ws, p_from, p_from, 'inbox')
        returning id into v_contact;
      end if;
    end if;
  end if;

  v_conv := public.upsert_conversation(p_ws, v_contact, p_channel);

  insert into public.messages (workspace_id, conversation_id, direction, channel, content, media_url, external_id, status)
  values (p_ws, v_conv, 'inbound', p_channel, p_body, p_media, p_external_id, 'delivered')
  returning id into v_msg;

  return v_msg;
end $$;

-- clear_unread — reset the unread badge when a member opens the thread.
create or replace function public.clear_unread(p_ws uuid, p_conv uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(p_ws) then
    raise exception 'not a member of workspace %', p_ws using errcode = '42501';
  end if;
  update public.conversations set unread_count = 0 where id = p_conv and workspace_id = p_ws;
end $$;

-- search_inbox — full-text search over messages, scoped to the caller's workspace,
-- returning the matching conversations with a highlighted snippet (PRD §4 search).
create or replace function public.search_inbox(p_ws uuid, p_q text)
returns table (conversation_id uuid, message_id uuid, snippet text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member(p_ws) then
    raise exception 'not a member of workspace %', p_ws using errcode = '42501';
  end if;
  if coalesce(trim(p_q), '') = '' then return; end if;
  return query
  select m.conversation_id, m.id,
         ts_headline('english', coalesce(m.content, ''), websearch_to_tsquery('english', p_q),
                     'StartSel=<mark>,StopSel=</mark>,MaxWords=18,MinWords=6'),
         m.created_at
    from public.messages m
   where m.workspace_id = p_ws
     and m.search_tsv @@ websearch_to_tsquery('english', p_q)
   order by m.created_at desc
   limit 50;
end $$;

-- Grants: browser (authenticated) may upsert/read/mark/search; ingest is server-only.
revoke all on function public.upsert_conversation(uuid, uuid, public.conv_channel) from public;
revoke all on function public.ingest_inbound_message(uuid, public.conv_channel, text, text, text, text) from public;
revoke all on function public.clear_unread(uuid, uuid) from public;
revoke all on function public.search_inbox(uuid, text) from public;
grant execute on function public.upsert_conversation(uuid, uuid, public.conv_channel) to authenticated, service_role;
grant execute on function public.ingest_inbound_message(uuid, public.conv_channel, text, text, text, text) to service_role;
grant execute on function public.clear_unread(uuid, uuid) to authenticated;
grant execute on function public.search_inbox(uuid, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Realtime — conversations + messages in the publication so open threads and
--    the list live-update across users (D-029 Supabase Realtime). Guarded for PGlite.
-- ═══════════════════════════════════════════════════════════════════════════
do $$ begin
  alter publication supabase_realtime add table public.conversations;
exception when others then
  raise notice 'supabase_realtime publication unavailable — conversations not added (%).', sqlerrm;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when others then
  raise notice 'supabase_realtime publication unavailable — messages not added (%).', sqlerrm;
end $$;
