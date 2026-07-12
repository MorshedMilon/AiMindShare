-- ═══════════════════════════════════════════════════════════════════════════
-- seed.sql — AiMindShare Session 0 (local dev only)
-- Two isolated workspaces (A, B) with owner + staff each, and one queued test
-- job in workspace A for the worker probe. Runs as superuser (RLS bypassed).
-- Deterministic UUIDs so the leak probe and worker probe can reference them.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── auth users (local only) ─────────────────────────────────────────────────
-- raw_user_meta_data carries the display name so M00's handle_new_user() trigger
-- (migration 0006) auto-creates the matching public.profiles row on insert — this
-- seed doubles as a live end-to-end test of the trigger on `supabase db reset`.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111111','authenticated','authenticated','owner.a@aimindshare.test', crypt('password-a', gen_salt('bf')), '{"name":"Owner A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000','22222222-2222-2222-2222-222222222222','authenticated','authenticated','staff.a@aimindshare.test', crypt('password-a', gen_salt('bf')), '{"name":"Staff A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000','33333333-3333-3333-3333-333333333333','authenticated','authenticated','owner.b@aimindshare.test', crypt('password-b', gen_salt('bf')), '{"name":"Owner B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000','44444444-4444-4444-4444-444444444444','authenticated','authenticated','staff.b@aimindshare.test', crypt('password-b', gen_salt('bf')), '{"name":"Staff B"}', now(), now())
on conflict (id) do nothing;

-- Explicit fallback (idempotent): keeps names correct even if the trigger is absent.
insert into public.profiles (id, email, name) values
  ('11111111-1111-1111-1111-111111111111','owner.a@aimindshare.test','Owner A'),
  ('22222222-2222-2222-2222-222222222222','staff.a@aimindshare.test','Staff A'),
  ('33333333-3333-3333-3333-333333333333','owner.b@aimindshare.test','Owner B'),
  ('44444444-4444-4444-4444-444444444444','staff.b@aimindshare.test','Staff B')
on conflict (id) do update set name = excluded.name, email = excluded.email;

-- ── workspaces ──────────────────────────────────────────────────────────────
-- Acme = agency (parent null); Acme Dental = a SUB-ACCOUNT under Acme (M01 demo
-- of the agency → sub-account hierarchy). Beacon = a separate agency (isolation).
insert into public.workspaces (id, owner_id, parent_workspace_id, name, slug, plan, niche) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111', null, 'Acme Agency','acme','agency','Marketing'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Acme Dental','acme-dental','free','Dental'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','33333333-3333-3333-3333-333333333333', null, 'Beacon Media','beacon','pro',null)
on conflict (id) do nothing;

-- ── memberships ─────────────────────────────────────────────────────────────
-- Agency reach is NOT automatic (RLS-AND-SECURITY §1): Owner A holds an EXPLICIT
-- owner membership in the sub-account, created at provisioning. Staff A is only in
-- the agency, so they cannot see Acme Dental — the leak probe's core assertion.
insert into public.memberships (workspace_id, user_id, role, status) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','owner','active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','staff','active'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc','11111111-1111-1111-1111-111111111111','owner','active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','33333333-3333-3333-3333-333333333333','owner','active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','44444444-4444-4444-4444-444444444444','staff','active')
on conflict (workspace_id, user_id) do nothing;

-- ── M02: a custom role + a per-member override in Acme (roles demo) ──────────
-- "Sales Lead" is a manager-tier custom role with crm.delete/export toggled off.
-- Built-in roles are seeded globally by migration 0008 (workspace_id null); this is
-- the workspace-scoped custom role. Staff A also carries a fine grant override
-- (crm.export) so the matrix UI and has_permission() have live data to show.
insert into public.roles (id, workspace_id, name, base_role, is_built_in, permissions)
values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'Sales Lead','manager',false,
        array['crm.view','crm.create','crm.edit','pipeline.view','pipeline.manage','campaigns.view','reports.view'])
on conflict (id) do nothing;

update public.memberships
   set permissions = '{"grant":["crm.export"]}'::jsonb
 where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   and user_id      = '22222222-2222-2222-2222-222222222222';

-- ── one pending invitation in Acme (M01 team demo; token = sha256('demo-invite-token')) ──
insert into public.workspace_invitations (workspace_id, email, role, token_hash, invited_by, status)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','sofia@acme.test','manager',
        encode(digest('demo-invite-token','sha256'),'hex'),'11111111-1111-1111-1111-111111111111','pending')
on conflict (token_hash) do nothing;

-- ── plan catalog (real reference data) ──────────────────────────────────────
insert into public.plans (tier, name, monthly_price) values
  ('free','Free',0),
  ('starter','Starter',49),
  ('pro','Pro',149),
  ('agency','Agency',399),
  ('enterprise','Enterprise',0)
on conflict do nothing;

-- ── M03: plan matrix — included quotas + feature gates (USAGE-METERING §3) ────
-- The starting matrix (editable in M44, never hardcoded in gate logic). `included`
-- keys are meter_kind values + non-metered limits (seats/workspaces/tracked_keywords);
-- a null/absent quota = unlimited, 0 = not available on this tier. `feature_gates`
-- keys are the module flags has_feature() reads. stripe_price_id stays null (no
-- Stripe account on this machine — wired live later, D-028).
update public.plans set
  included = '{"email":500,"sms":0,"ai_tokens":50000,"image_gen":10,"seo_calls":0,"enrichment":0,"voice_minutes":0,"video_render":0,"tracked_keywords":0,"seats":1,"workspaces":1}',
  feature_gates = '{"m16_campaigns":false,"m21_seo":false,"m22_content":false,"m33_agents":false,"m34_voice":false,"m25_video":false,"m42_whitelabel":false,"m39_marketplace_sell":false,"public_api":false}'
  where tier = 'free';
update public.plans set
  included = '{"email":5000,"sms":500,"ai_tokens":500000,"image_gen":100,"seo_calls":1000,"enrichment":100,"voice_minutes":0,"video_render":0,"tracked_keywords":100,"seats":3,"workspaces":1}',
  feature_gates = '{"m16_campaigns":true,"m21_seo":true,"m22_content":true,"m33_agents":false,"m34_voice":false,"m25_video":false,"m42_whitelabel":false,"m39_marketplace_sell":false,"public_api":false}'
  where tier = 'starter';
update public.plans set
  included = '{"email":25000,"sms":2500,"ai_tokens":3000000,"image_gen":500,"seo_calls":10000,"enrichment":1000,"voice_minutes":200,"video_render":20,"tracked_keywords":500,"seats":10,"workspaces":3}',
  feature_gates = '{"m16_campaigns":true,"m21_seo":true,"m22_content":true,"m33_agents":true,"m34_voice":false,"m25_video":false,"m42_whitelabel":false,"m39_marketplace_sell":false,"public_api":true}'
  where tier = 'pro';
update public.plans set
  included = '{"email":100000,"sms":10000,"ai_tokens":15000000,"image_gen":2000,"seo_calls":50000,"enrichment":5000,"voice_minutes":1000,"video_render":100,"tracked_keywords":2500,"seats":null,"workspaces":null}',
  feature_gates = '{"m16_campaigns":true,"m21_seo":true,"m22_content":true,"m33_agents":true,"m34_voice":true,"m25_video":true,"m42_whitelabel":true,"m39_marketplace_sell":true,"public_api":true}'
  where tier = 'agency';
update public.plans set
  included = '{"seats":null,"workspaces":null}',   -- absent quotas = unlimited (custom)
  feature_gates = '{"m16_campaigns":true,"m21_seo":true,"m22_content":true,"m33_agents":true,"m34_voice":true,"m25_video":true,"m42_whitelabel":true,"m39_marketplace_sell":true,"public_api":true}'
  where tier = 'enterprise';

-- ── M03: platform subscriptions (agency active · sub-account trialing · Beacon pro) ──
-- Acme is on the paid Agency plan; Acme Dental is mid-trial (drives the trial
-- banner + the pg_cron expiry sweep); Beacon runs Pro. stripe_* left null.
insert into public.subscriptions_platform (id, workspace_id, plan_id, status, current_period_end) values
  ('a5000000-0000-0000-0000-0000000000a1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     (select id from public.plans where tier='agency' limit 1), 'active',  now() + interval '21 days'),
  ('a5000000-0000-0000-0000-0000000000c1','cccccccc-cccc-cccc-cccc-cccccccccccc',
     (select id from public.plans where tier='free'   limit 1), 'trialing', now() + interval '9 days'),
  ('a5000000-0000-0000-0000-0000000000b1','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
     (select id from public.plans where tier='pro'    limit 1), 'active',  now() + interval '17 days')
on conflict (id) do nothing;

-- ── M03: synthetic current-month usage for Acme (proves the upsert path; honest
-- dashboard data). Period = first of the current month. ────────────────────────
insert into public.usage_meters (workspace_id, kind, period, quantity) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','email',      date_trunc('month', now())::date, 32000),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','sms',        date_trunc('month', now())::date, 6400),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ai_tokens',  date_trunc('month', now())::date, 12750000),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','image_gen',  date_trunc('month', now())::date, 1850),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','seo_calls',  date_trunc('month', now())::date, 41200),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','enrichment', date_trunc('month', now())::date, 3100)
on conflict (workspace_id, kind, period) do nothing;

-- A few ledger rows carrying real unit_cost (rebilling data model, M42 §8).
insert into public.usage_events (workspace_id, kind, quantity, unit_cost, source) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ai_tokens', 42000, 0.000002, 'openai'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','sms',       120,   0.007900, 'twilio'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','seo_calls', 300,   0.002000, 'dataforseo')
on conflict do nothing;

-- ── M03: prepaid credit wallets for Acme (top-up demo; per meter_kind) ───────
insert into public.credit_wallets (workspace_id, kind, balance) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ai_tokens', 500000),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','sms',       1500)
on conflict (workspace_id, kind) do nothing;

-- ── M41: credential-vault reference rows for Acme (connections demo) ─────────
-- REFERENCE ROWS ONLY — the `vault_secret_name` is a Vault pointer (§3), never a
-- secret value (Law 2). The actual Vault secret is created live by the
-- integrations-connect Edge Function on a running stack (carried over; can't be
-- seeded in PGlite, which lacks the Vault extension). Statuses vary so the pills
-- (green/amber/red) all have live data. openai is a WORKSPACE override of the
-- platform default; stripe/twilio are workspace-only. No platform (null) row is
-- seeded — it would be visible only to a platform-admin and isn't needed for the demo.
insert into public.integrations (workspace_id, provider, auth_type, scope, status, vault_secret_name, config, connected_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','openai','api_key','workspace','connected',
     'ws_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa__openai','{"label":"Acme OpenAI (workspace override)"}','11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','stripe','api_key','workspace','connected',
     'ws_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa__stripe','{"label":"Acme Stripe"}','11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','twilio','api_key','workspace','error',
     'ws_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa__twilio','{"label":"Acme Twilio"}','11111111-1111-1111-1111-111111111111')
on conflict (workspace_id, provider) where workspace_id is not null do nothing;

-- ── one queued test job in workspace A (for the worker probe) ────────────────
insert into public.jobs (id, workspace_id, type, payload, status, idempotency_key)
values (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'session0.probe',
  '{"note":"Session 0 worker probe"}',
  'queued',
  'session0-probe'
) on conflict (id) do nothing;

-- ── M04: a live notification feed + a digest preference for Owner A in Acme ───
-- Honest sample data so a hosted/seeded DB shows the bell badge + a populated feed
-- (mix of unread/read; deep links live in data->>'link'). Rows are normally written
-- by notify(); seeded directly here (superuser) for the demo. Owner A on a daily digest.
insert into public.notifications (id, workspace_id, user_id, type, title, body, data, channels, read_at, created_at) values
  ('a4000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',
     'deal.won','Deal won — Acme Dental retainer','Owner A closed “Acme Dental — Q3 retainer” ($14,400).',
     '{"link":"m11-pipeline.html#/deals/1"}', '{in_app,email}', null, now() - interval '6 minutes'),
  ('a4000000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',
     'form.submitted','New form submission','“Book a consult” submitted by marcus@harborlaw.test.',
     '{"link":"m15-forms.html#/submissions/1"}', '{in_app,email}', null, now() - interval '22 minutes'),
  ('a4000000-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',
     'mention','Staff A mentioned you','“@Owner can you approve the Acme landing copy?”',
     '{"link":"m09-crm.html#/notes/9"}', '{in_app,email}', null, now() - interval '2 hours'),
  ('a4000000-0000-0000-0000-000000000004','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',
     'payment.received','Payment received','$1,200 from Acme Dental via Stripe.',
     '{"link":"m28-payments.html#/payments/1"}', '{in_app}', now() - interval '1 day', now() - interval '1 day 1 hour'),
  ('a4000000-0000-0000-0000-000000000005','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',null,
     'campaign.finished','Campaign finished','“July newsletter” sent to 4,210 contacts.',
     '{"link":"m16-campaigns.html#/campaigns/1"}', '{in_app}', null, now() - interval '2 days')
on conflict (id) do nothing;

insert into public.notification_prefs (workspace_id, user_id, prefs, digest) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',
   '{"inbox.new_message":{"in_app":true,"email":false,"push":false}}', 'daily')
on conflict (workspace_id, user_id) do nothing;

-- ── M09: CRM sample data for Acme (companies, contacts, tags, notes, tasks, ───
-- timeline, a smart list, a flagged duplicate pair). Honest data so the CRM
-- screens render populated on a hosted/seeded DB. Superuser insert (RLS bypassed).
insert into public.companies (id, workspace_id, name, website, industry, size) values
  ('c9000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Harbor Law','harborlaw.test','Legal','11-50'),
  ('c9000000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Cedar Dental Group','cedardental.test','Healthcare','51-200'),
  ('c9000000-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Noor Interiors','noorinteriors.test','Design','1-10')
on conflict (id) do nothing;

insert into public.tags (id, workspace_id, name, color) values
  ('c9100000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','VIP','gold'),
  ('c9100000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Newsletter','teal'),
  ('c9100000-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Hot lead','danger')
on conflict (id) do nothing;

insert into public.custom_fields (id, workspace_id, field_name, field_type, options) values
  ('c9200000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Tier','dropdown','["Bronze","Silver","Gold"]'),
  ('c9200000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Budget','number','[]')
on conflict (id) do nothing;

insert into public.contacts (id, workspace_id, company_id, first_name, last_name, email, phone, source, lead_score, assigned_to) values
  ('c9300000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9000000-0000-0000-0000-000000000001','Marcus','Reed','marcus@harborlaw.test','(415) 555-0142','form',82,'11111111-1111-1111-1111-111111111111'),
  ('c9300000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9000000-0000-0000-0000-000000000002','Yusuf','Karim','yusuf.karim@cedardental.test','(628) 555-0199','referral',67,'22222222-2222-2222-2222-222222222222'),
  ('c9300000-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9000000-0000-0000-0000-000000000003','Aisha','Rahman','aisha@noorinteriors.test','(917) 555-0176','organic',44,null),
  ('c9300000-0000-0000-0000-000000000004','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',null,'Omar','Farouk','omar.farouk@gmail.test','(212) 555-0128','import',23,null),
  ('c9300000-0000-0000-0000-000000000005','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9000000-0000-0000-0000-000000000002','Layla','Haddad','layla@cedardental.test','(628) 555-0200','referral',58,'22222222-2222-2222-2222-222222222222'),
  ('c9300000-0000-0000-0000-000000000006','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9000000-0000-0000-0000-000000000001','Marcus','Reed','MARCUS@harborlaw.test','415-555-0142','manual',0,null)
on conflict (id) do nothing;

insert into public.contact_tags (workspace_id, contact_id, tag_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000001','c9100000-0000-0000-0000-000000000001'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000001','c9100000-0000-0000-0000-000000000003'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000002','c9100000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into public.contact_custom_values (workspace_id, contact_id, field_id, value) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000001','c9200000-0000-0000-0000-000000000001','Gold'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000001','c9200000-0000-0000-0000-000000000002','24000')
on conflict do nothing;

insert into public.contact_notes (workspace_id, contact_id, user_id, content) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Wants a proposal by Friday. Budget approved by partner.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','Referred by the Cedar Dental office manager. Interested in the growth plan.')
on conflict do nothing;

insert into public.contact_tasks (workspace_id, contact_id, assigned_to, title, due_date, status) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Send proposal', current_date + 2,'open'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','Follow-up call', current_date,'open'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000004','22222222-2222-2222-2222-222222222222','Qualify lead', current_date - 1,'open')
on conflict do nothing;

insert into public.activity_log (workspace_id, contact_id, type, description, actor_id, created_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000001','form','Submitted the Book a consult form', null, now() - interval '3 hours'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000001','email','Sent welcome email','11111111-1111-1111-1111-111111111111', now() - interval '2 hours'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000001','note','Added a note','11111111-1111-1111-1111-111111111111', now() - interval '90 minutes'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000002','call','Logged a 12-min discovery call','22222222-2222-2222-2222-222222222222', now() - interval '1 day')
on conflict do nothing;

insert into public.smart_lists (id, workspace_id, name, definition, created_by) values
  ('c9400000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Hot leads (score 60+)',
   '{"match":"and","rules":[{"field":"lead_score","op":"gte","value":"60"}]}','11111111-1111-1111-1111-111111111111'),
  ('c9400000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Referrals to nurture',
   '{"match":"and","rules":[{"field":"source","op":"eq","value":"referral"},{"field":"lead_score","op":"lt","value":"60"}]}','11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

insert into public.contact_duplicates (workspace_id, contact_a, contact_b, score, reason) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000001','c9300000-0000-0000-0000-000000000006',1.0,'email_exact')
on conflict (workspace_id, contact_a, contact_b) do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- M12 · Inbox — a connected SMS channel, canned replies, and sample threads on
-- the CRM contacts above (Acme Agency). Inbound messages let the 0015 trigger
-- set last_message_at + unread_count and write the M09 timeline; notes carry no
-- @mentions here so no notifications are generated by the seed.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.channels (id, workspace_id, type, label, external_ref, is_active) values
  ('c9500000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','sms','Main line','+14155550100',true)
on conflict (id) do nothing;

insert into public.canned_responses (id, workspace_id, shortcut, title, content, created_by) values
  ('c9600000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','greeting','Warm greeting','Assalamu alaikum {{first_name}} — thanks so much for reaching out! How can we help today?','11111111-1111-1111-1111-111111111111'),
  ('c9600000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','booking','Booking link','You can pick a time that suits you here: https://aimindshare.com/book/{{first_name}} — looking forward to it!','11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

insert into public.conversations (id, workspace_id, contact_id, channel, status, assigned_to) values
  ('c9700000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000001','sms','open','11111111-1111-1111-1111-111111111111'),
  ('c9700000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000002','sms','pending','22222222-2222-2222-2222-222222222222'),
  ('c9700000-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000003','email','open',null)
on conflict (id) do nothing;

-- Marcus (open, assigned to owner) — two inbound (unread) around one reply.
insert into public.messages (workspace_id, conversation_id, direction, channel, content, sender_id, status, created_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9700000-0000-0000-0000-000000000001','inbound','sms','Salaam! Is the Ramadan brand refresh package still available?', null,'delivered', now() - interval '3 hours'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9700000-0000-0000-0000-000000000001','outbound','sms','Wa alaikum assalam Marcus! Yes it is — I''d love to walk you through it. Are you free for a quick call this week?', '11111111-1111-1111-1111-111111111111','delivered', now() - interval '2 hours'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9700000-0000-0000-0000-000000000001','inbound','sms','That would be great. Thursday works for me.', null,'delivered', now() - interval '40 minutes'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9700000-0000-0000-0000-000000000001','inbound','sms','Also — do you offer a non-profit discount on the booking?', null,'delivered', now() - interval '12 minutes');

-- Yusuf (in progress, assigned to staff) — inbound, reply, and an internal note.
insert into public.messages (workspace_id, conversation_id, direction, channel, content, sender_id, is_internal_note, status, created_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9700000-0000-0000-0000-000000000002','inbound','sms','Hi, following up on the growth plan proposal 🙏', null, false,'delivered', now() - interval '26 hours'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9700000-0000-0000-0000-000000000002','outbound','sms','Hi Yusuf — sending the revised scope over today. Thanks for your patience!', '22222222-2222-2222-2222-222222222222', false,'delivered', now() - interval '25 hours'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9700000-0000-0000-0000-000000000002','outbound','sms','Budget is tight on their side — let''s lead with the starter tier and note the upsell path.', '22222222-2222-2222-2222-222222222222', true,'sent', now() - interval '24 hours');

-- Aisha (email thread — read-only display; email send defers with D-011).
insert into public.messages (workspace_id, conversation_id, direction, channel, content, sender_id, status, created_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9700000-0000-0000-0000-000000000003','inbound','email','Could you send the partnership deck we discussed at the summit? Keen to share it internally.', null,'delivered', now() - interval '5 hours');

-- ═══════════════════════════════════════════════════════════════════════════
-- M28 Payments & Invoicing (Session 13) — Acme sample: invoices in each state,
-- an estimate, client subscriptions, a tax rate, and the payment ledger. Totals
-- (subtotal/tax/total) are recomputed by the invoices trigger from line_items —
-- we only supply the inputs + status + amount_paid (which only the server moves).
-- Numbers are set explicitly here for a realistic demo; the counter is pre-seeded
-- past them so a NEW live invoice continues from INV-0043.
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.invoice_counters (workspace_id, prefix, next_seq) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','INV-',43)
on conflict (workspace_id) do nothing;

insert into public.tax_rates (id, workspace_id, name, rate, is_default) values
  ('d2810000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Sales Tax (CA)',8.5,true),
  ('d2810000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Zero-rated',0,false)
on conflict (id) do nothing;

-- Invoices (trigger fills subtotal/discount_total/tax/total; number kept as given).
insert into public.invoices (id, workspace_id, contact_id, kind, number, currency, line_items, discount, tax_rate, amount_paid, status, due_date, notes, created_by, created_at) values
  ('d2800000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000001','invoice','INV-0042','USD',
    '[{"description":"Brand identity system","qty":1,"unit_price":280000},{"description":"Social launch kit","qty":1,"unit_price":90000}]','{"type":"percent","value":10}',8.5,0,'sent', now()::date + 9,'Thank you for your business. Payment due within 14 days.','11111111-1111-1111-1111-111111111111', now() - interval '4 days'),
  ('d2800000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000002','invoice','INV-0041','USD',
    '[{"description":"Monthly retainer — SEO","qty":1,"unit_price":150000}]',null,0,75000,'partial', now()::date + 3,null,'11111111-1111-1111-1111-111111111111', now() - interval '12 days'),
  ('d2800000-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000003','invoice','INV-0039','USD',
    '[{"description":"Photography day rate","qty":2,"unit_price":60000}]',null,8.5,130200,'paid', now()::date - 20,null,'11111111-1111-1111-1111-111111111111', now() - interval '30 days'),
  ('d2800000-0000-0000-0000-000000000004','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000002','invoice','INV-0036','USD',
    '[{"description":"Website build — milestone 1","qty":1,"unit_price":320000}]',null,8.5,0,'overdue', now()::date - 6,null,'11111111-1111-1111-1111-111111111111', now() - interval '25 days')
on conflict (id) do nothing;

update public.invoices set paid_at = now() - interval '19 days' where id = 'd2800000-0000-0000-0000-000000000003';

-- Estimate (numberless until accepted).
insert into public.invoices (id, workspace_id, contact_id, kind, currency, line_items, discount, tax_rate, status, due_date, created_by, created_at) values
  ('d2800000-0000-0000-0000-000000000005','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000003','estimate','USD',
    '[{"description":"Seasonal campaign — full funnel","qty":1,"unit_price":450000}]','{"type":"fixed","value":25000}',8.5,'sent', now()::date + 14,'11111111-1111-1111-1111-111111111111', now() - interval '2 days')
on conflict (id) do nothing;

-- Payment ledger (service-role writes; seed runs as superuser). Matches the paid /
-- partial invoices above.
insert into public.invoice_payments (id, workspace_id, invoice_id, amount, method, stripe_payment_intent_id, paid_at) values
  ('d2820000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','d2800000-0000-0000-0000-000000000003',130200,'card','pi_seed_i3', now() - interval '19 days'),
  ('d2820000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','d2800000-0000-0000-0000-000000000002',75000,'card','pi_seed_i2', now() - interval '5 days')
on conflict (id) do nothing;

-- Client subscriptions (recurring on the connected Stripe account).
insert into public.client_subscriptions (id, workspace_id, contact_id, plan_name, amount, currency, interval, status, next_charge_at, created_by) values
  ('d2830000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000002','SEO retainer',150000,'USD','month','active', now() + interval '11 days','11111111-1111-1111-1111-111111111111'),
  ('d2830000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','c9300000-0000-0000-0000-000000000001','Care plan',24000,'USD','month','past_due', now() - interval '2 days','11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- M14 Calendar & Booking (Session 12) — Acme sample: a public "Intro Call"
-- calendar with weekday availability + two pre-booking questions, and two
-- upcoming appointments on the CRM contacts above. Inserting an appointment
-- fires the 0017 AFTER INSERT trigger (auto-tag "Appointment Booked" + M09
-- timeline + reminder rows + the appointment.booked bus) — so the seed also
-- demonstrates the wiring end to end. Times are stored UTC.
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.calendars (id, workspace_id, name, type, slug, duration_min, buffer_min, min_notice_min, timezone) values
  ('ca140000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Intro Call','one_on_one','intro-call',30,0,240,'America/New_York')
on conflict (id) do nothing;

insert into public.calendar_availability (workspace_id, calendar_id, day_of_week, start_time, end_time)
select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ca140000-0000-0000-0000-000000000001', d, time '09:00', time '17:00'
from generate_series(1,5) d
on conflict do nothing;

insert into public.appointment_questions (id, workspace_id, calendar_id, label, type, required, sort_order) values
  ('a1400000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ca140000-0000-0000-0000-000000000001','What would you like to cover?','textarea',true,0),
  ('a1400000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ca140000-0000-0000-0000-000000000001','Company','text',false,1)
on conflict (id) do nothing;

insert into public.appointments (id, workspace_id, calendar_id, contact_id, assigned_user_id, starts_at, ends_at, status, timezone, token_expires_at) values
  ('ap140000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ca140000-0000-0000-0000-000000000001','c9300000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111', now() + interval '2 days', now() + interval '2 days' + interval '30 min','confirmed','America/New_York', now() + interval '32 days'),
  ('ap140000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ca140000-0000-0000-0000-000000000001','c9300000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222', now() + interval '3 days', now() + interval '3 days' + interval '30 min','confirmed','America/New_York', now() + interval '33 days')
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- M44 Admin Basics (Session 14) — platform-ops sample. Feature flags (two beta
-- gates + one incident kill-switch), a per-workspace override, and a few audit /
-- impersonation rows so the Overview feed renders with honest data. NOTE: the
-- platform_admin claim itself is NOT seedable in SQL — it lives in a user's auth
-- app_metadata and is minted in the hosted console / admin API (carried, D-080).
-- These rows are written service-role (bypass RLS), exactly as the M44 definer
-- RPCs write them in production.
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.feature_flags (key, default_on, description, category) values
  ('voice.rollout',       false, 'M34 AI Voice Agents gated rollout',                          'Beta'),
  ('marketplace.enabled', false, 'M39 Marketplace surface',                                     'Beta'),
  ('ai.generation',       true,  'Master switch for all AI generation (incident kill-switch)',  'Kill-switch')
on conflict (key) do nothing;

-- Acme (agency) gets AI voice turned on ahead of the global default.
insert into public.feature_flag_overrides (flag_key, workspace_id, enabled) values
  ('voice.rollout','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true)
on conflict (flag_key, workspace_id) do nothing;

-- Sample admin actions (append-only ledger) + one completed impersonation session.
insert into public.admin_audit_log (id, actor_user_id, acting_as_user_id, workspace_id, action, target_type, target_id, detail, created_at) values
  ('ad440000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111', null, null, 'flag.set','flag','ai.generation','{"default_on":true}', now() - interval '8 minutes'),
  ('ad440000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111', null, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','flag.override','flag','voice.rollout','{"enabled":true}', now() - interval '20 minutes'),
  ('ad440000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','impersonate.start','user','22222222-2222-2222-2222-222222222222','{"reason":"debugging a failed import (ticket #482)"}', now() - interval '3 hours')
on conflict (id) do nothing;

insert into public.impersonation_sessions (id, admin_user_id, target_user_id, target_workspace_id, reason, started_at, expires_at, ended_at) values
  ('19440000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','debugging a failed import (ticket #482)', now() - interval '3 hours', now() - interval '3 hours' + interval '30 min', now() - interval '2 hours 40 minutes')
on conflict (id) do nothing;

-- ── M16 Campaigns (Session 17) — labelled sample data (Acme Agency) ──────────
insert into public.sender_identities (id, workspace_id, from_name, from_email, reply_to, domain, spf_ok, dkim_ok, verified, is_default) values
  ('16440000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Acme Agency','hello@acme.example','support@acme.example','acme.example', true, true, true, true)
on conflict (id) do nothing;

insert into public.email_campaigns (id, workspace_id, name, channel, subject, preheader, body_json, from_identity_id, status, audience, footer_address) values
  ('16440000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Spring Newsletter','email','What''s new this month, {{first_name}}','A quick roundup from the Acme team',
   '{"blocks":[{"type":"text","text":"Hi {{first_name}}, here is what''s new at {{company}}."},{"type":"button","label":"Read more","href":"https://acme.example/news"}]}',
   '16440000-0000-0000-0000-000000000001','draft','{"type":"all"}','Acme Agency, 123 Market St, San Francisco CA 94105')
on conflict (id) do nothing;

insert into public.sequences (id, workspace_id, name, status) values
  ('16440000-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','New Lead Nurture','active')
on conflict (id) do nothing;
insert into public.sequence_steps (id, workspace_id, sequence_id, step_order, channel, delay, subject, body_json) values
  ('16440000-0000-0000-0000-000000000004','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','16440000-0000-0000-0000-000000000003',0,'email','{"mode":"relative","days":0}','Welcome to Acme, {{first_name}}','{"blocks":[{"type":"text","text":"Thanks for reaching out, {{first_name}}!"}]}'),
  ('16440000-0000-0000-0000-000000000005','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','16440000-0000-0000-0000-000000000003',1,'email','{"mode":"relative","days":2}','A few resources for you','{"blocks":[{"type":"text","text":"Here are some links we think you''ll find useful."}]}')
on conflict (id) do nothing;

-- ── M19 Sites: a published Acme website + custom domain + global templates ────
-- A sample site with a published home page (real render snapshot), an active
-- custom domain (SSL pending — the D-009 scaffold), a handful of GLOBAL niche
-- templates, and one identified visitor session (analytics demo). Labeled sample.
insert into public.sites (id, workspace_id, name, subdomain, status, brand, nav, seo_defaults) values
  ('19000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Acme Agency Site','acme','published',
   '{"colors":{"teal":"#0F766E"},"fonts":{}}','{"items":[{"label":"Home","page_id":null},{"label":"Pricing","page_id":null}]}',
   '{"description":"Marketing that compounds — growth systems for ambitious brands.","robots":"index,follow"}')
on conflict (id) do nothing;

insert into public.pages (id, workspace_id, site_id, title, slug, is_home, status, meta, render_html, render_css, published_at) values
  ('19100000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','19000000-0000-0000-0000-000000000001','Home','home',true,'published',
   '{"title":"Acme Agency — Marketing that compounds","description":"Growth systems for ambitious brands.","schema_type":"LocalBusiness"}',
   '<section class="s-hero"><div class="s-wrap"><h1 class="s-h1">Marketing that compounds.</h1><p class="s-lead">We build growth systems for ambitious brands — strategy, creative, and automation under one roof.</p><a class="s-btn" href="#">Book a strategy call</a></div></section>',
   '.s-wrap{max-width:1080px;margin:0 auto;padding:0 24px}.s-hero{padding:72px 0;text-align:center}', now()),
  ('19100000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','19000000-0000-0000-0000-000000000001','Pricing','pricing',false,'published',
   '{"title":"Pricing — Acme Agency"}','<section class="s-pricing"><div class="s-wrap"><h2>Simple, honest pricing</h2></div></section>','', now())
on conflict (id) do nothing;

insert into public.page_versions (workspace_id, page_id, version_no, page_json, render_html, meta, published_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','19100000-0000-0000-0000-000000000001',1,'{}',
   '<section class="s-hero"><div class="s-wrap"><h1 class="s-h1">Marketing that compounds.</h1></div></section>',
   '{"title":"Acme Agency — Marketing that compounds"}','11111111-1111-1111-1111-111111111111')
on conflict (page_id, version_no) do nothing;

insert into public.site_domains (id, workspace_id, site_id, domain, status, ssl_status, is_primary, verified_at) values
  ('19200000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','19000000-0000-0000-0000-000000000001','acmeagency.com','active','pending',true, now())
on conflict (domain) do nothing;

insert into public.site_templates (id, workspace_id, name, niche, page_json) values
  ('19300000-0000-0000-0000-000000000001', null, 'Agency Growth','agency','{}'),
  ('19300000-0000-0000-0000-000000000002', null, 'SaaS Launch','saas','{}'),
  ('19300000-0000-0000-0000-000000000003', null, 'Local Service','local','{}'),
  ('19300000-0000-0000-0000-000000000004', null, 'Coaching','coach','{}'),
  ('19300000-0000-0000-0000-000000000005', null, 'Storefront','ecom','{}'),
  ('19300000-0000-0000-0000-000000000006', null, 'Portfolio','agency','{}')
on conflict (id) do nothing;

insert into public.visitor_sessions (workspace_id, site_id, visitor_id, pages, utm) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','19000000-0000-0000-0000-000000000001','demo-visitor-1',
   '[{"slug":"home","at":"2026-07-03T10:00:00Z"},{"slug":"pricing","at":"2026-07-03T10:02:00Z"}]','{"utm_source":"google"}')
on conflict (site_id, visitor_id) do nothing;

-- ── M06 Media Library (Session 20) ───────────────────────────────────────────
-- Acme workspace (A). Brand collections are pinned folders in the `brand` bucket;
-- Website/Blog are plain `media` folders. Assets show every tag_status + a used_in.
insert into public.media_folders (id, workspace_id, parent_id, name, bucket, kind, pinned) values
  ('06f00000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Logos',        'brand','collection', true),
  ('06f00000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Brand Photos', 'brand','collection', true),
  ('06f00000-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Templates',    'brand','collection', true),
  ('06f00000-0000-0000-0000-000000000010','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Website',      'media','folder',     false),
  ('06f00000-0000-0000-0000-000000000011','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Blog',         'media','folder',     false)
on conflict (id) do nothing;

insert into public.media_assets
  (id, workspace_id, folder_id, bucket, storage_path, kind, mime, bytes, width, height,
   ai_tags, used_in, created_by, filename, title, alt_text, duration_sec, is_favorite, tag_status) values
  -- brand collection assets (admin bucket)
  ('06a00000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','06f00000-0000-0000-0000-000000000001','brand',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/brand/logo-primary.svg','image','image/svg+xml',18240,512,512,
   '{logo,brand,vector,mark}','[]','11111111-1111-1111-1111-111111111111','logo-primary.svg','Primary Logo','Acme Agency primary logo',null,true,'done'),
  ('06a00000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','06f00000-0000-0000-0000-000000000001','brand',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/brand/logo-mark.png','image','image/png',9820,256,256,
   '{logo,icon,mark}','[]','11111111-1111-1111-1111-111111111111','logo-mark.png',null,'Acme logomark',null,false,'done'),
  ('06a00000-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','06f00000-0000-0000-0000-000000000002','brand',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/brand/team-photo.jpg','image','image/jpeg',842300,1600,1067,
   '{team,office,people,candid}','[]','11111111-1111-1111-1111-111111111111','team-photo.jpg','The Team','Acme team in the office',null,false,'done'),
  -- media bucket assets (staff bucket)
  ('06a00000-0000-0000-0000-000000000004','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','06f00000-0000-0000-0000-000000000010','media',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/media/hero-bg.webp','image','image/webp',210500,1920,1080,
   '{abstract,gradient,hero,teal}','[{"module":"sites","ref_id":"19000000-0000-0000-0000-000000000001"}]',
   '11111111-1111-1111-1111-111111111111','hero-bg.webp','Home hero','Abstract teal gradient hero background',null,true,'done'),
  ('06a00000-0000-0000-0000-000000000005','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','06f00000-0000-0000-0000-000000000010','media',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/media/pricing-illustration.png','image','image/png',94120,1200,900,
   '{illustration,pricing,ui}','[]','11111111-1111-1111-1111-111111111111','pricing-illustration.png',null,'Pricing page illustration',null,false,'done'),
  ('06a00000-0000-0000-0000-000000000006','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','06f00000-0000-0000-0000-000000000011','media',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/media/blog-header-seo.jpg','image','image/jpeg',356800,1600,840,
   '{seo,marketing,chart,growth}','[]','11111111-1111-1111-1111-111111111111','blog-header-seo.jpg','SEO post header','Line chart showing organic growth',null,false,'done'),
  ('06a00000-0000-0000-0000-000000000007','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','06f00000-0000-0000-0000-000000000011','media',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/media/explainer.mp4','video','video/mp4',18400000,1920,1080,
   '{}','[]','11111111-1111-1111-1111-111111111111','explainer.mp4','Product explainer',null,92,false,'skipped'),
  ('06a00000-0000-0000-0000-000000000008','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null,'media',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/media/brand-guide.pdf','pdf','application/pdf',1240000,null,null,
   '{}','[]','11111111-1111-1111-1111-111111111111','brand-guide.pdf','Brand guidelines',null,null,false,'skipped'),
  -- a freshly uploaded image mid-tagging (drives the "tagging…" live-grid state)
  ('06a00000-0000-0000-0000-000000000009','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','06f00000-0000-0000-0000-000000000010','media',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/media/new-upload.png','image','image/png',72000,1024,768,
   '{}','[]','11111111-1111-1111-1111-111111111111','new-upload.png',null,null,null,false,'pending')
on conflict (id) do nothing;

-- ── M15: Forms & Surveys sample data for Acme (one published form + submissions ─
-- + funnel views). Runs AFTER the M09 contacts block above so a submission can
-- reference an existing seeded contact (marcus@harborlaw.test) to demo the
-- upsert-by-email dedupe. Submissions/views are normally written service-role by
-- the public-form Edge Fn; here they are seed rows for the results/analytics UI.
insert into public.forms
  (id, workspace_id, name, type, status, fields_json, logic_json, settings_json, routing_json,
   public_token, published_at, created_at) values
  ('15f00000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'Contact Us','form','published',
   '[{"key":"name","type":"text","label":"Your name","map_to":"name","required":true},
     {"key":"email","type":"email","label":"Email","map_to":"email","required":true},
     {"key":"message","type":"textarea","label":"How can we help?","map_to":"message"},
     {"key":"consent","type":"consent","label":"Keep me updated","consent_text":"I agree to receive marketing emails."},
     {"key":"website","type":"text","label":"Website","hidden":true}]'::jsonb,
   '[]'::jsonb,
   '{"source_tag":"Website – Contact","spam":{"honeypot":"website","min_ms":1500}}'::jsonb,
   '{}'::jsonb,
   '15f00000-0000-0000-0000-0000000000f1','2026-06-20 09:00:00+00','2026-06-20 08:30:00+00')
on conflict (id) do nothing;

-- ~4 submissions. The first reuses the seeded contact c9300000…0001 (Marcus Reed,
-- marcus@harborlaw.test) — the dedupe target; others are fresh leads. Varied
-- created_at drives the results timeline. ip_hash is a sha256 digest, never raw IP.
insert into public.form_submissions
  (id, form_id, workspace_id, contact_id, answers_json, utm_json, ip_hash, variant, status, created_at) values
  ('15b00000-0000-0000-0000-000000000001','15f00000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'c9300000-0000-0000-0000-000000000001',
   '{"name":"Marcus Reed","email":"marcus@harborlaw.test","message":"Following up on the proposal.","consent":true}'::jsonb,
   '{"utm_source":"newsletter","utm_medium":"email"}'::jsonb,
   'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855','A','complete','2026-06-24 14:12:00+00'),
  ('15b00000-0000-0000-0000-000000000002','15f00000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   null,
   '{"name":"Priya Nair","email":"priya@brightpath.test","message":"Interested in a demo for our clinic.","consent":true}'::jsonb,
   '{"utm_source":"google","utm_medium":"cpc","utm_campaign":"dental-q3"}'::jsonb,
   '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae','A','complete','2026-06-27 10:41:00+00'),
  ('15b00000-0000-0000-0000-000000000003','15f00000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   null,
   '{"name":"Tom Alvarez","email":"tom@alvarezco.test","message":"What is your pricing?","consent":false}'::jsonb,
   '{"utm_source":"direct"}'::jsonb,
   'fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9','B','complete','2026-07-01 16:05:00+00'),
  ('15b00000-0000-0000-0000-000000000004','15f00000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   null,
   '{"name":"Sara Ito","email":"sara@itostudio.test","consent":true}'::jsonb,
   '{"utm_source":"newsletter","utm_medium":"email"}'::jsonb,
   '18ac3e7343f016890c510e93f935261169d9e3f565436429830faf0934f4f8e4','A','pending_confirmation','2026-07-03 09:22:00+00')
on conflict (id) do nothing;

-- ~10 funnel view events across event=view/start/complete (drives the analytics
-- funnel: views > starts > completes). visitor_id is an anonymous client id.
insert into public.form_views
  (id, form_id, workspace_id, visitor_id, variant, step, event, created_at) values
  ('15e00000-0000-0000-0000-000000000001','15f00000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','vis-001','A',0,'view','2026-06-24 14:10:00+00'),
  ('15e00000-0000-0000-0000-000000000002','15f00000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','vis-001','A',0,'start','2026-06-24 14:11:00+00'),
  ('15e00000-0000-0000-0000-000000000003','15f00000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','vis-001','A',0,'complete','2026-06-24 14:12:00+00'),
  ('15e00000-0000-0000-0000-000000000004','15f00000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','vis-002','A',0,'view','2026-06-27 10:39:00+00'),
  ('15e00000-0000-0000-0000-000000000005','15f00000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','vis-002','A',0,'start','2026-06-27 10:40:00+00'),
  ('15e00000-0000-0000-0000-000000000006','15f00000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','vis-002','A',0,'complete','2026-06-27 10:41:00+00'),
  ('15e00000-0000-0000-0000-000000000007','15f00000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','vis-003','B',0,'view','2026-07-01 16:03:00+00'),
  ('15e00000-0000-0000-0000-000000000008','15f00000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','vis-003','B',0,'complete','2026-07-01 16:05:00+00'),
  ('15e00000-0000-0000-0000-000000000009','15f00000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','vis-004','A',0,'view','2026-07-02 11:20:00+00'),
  ('15e00000-0000-0000-0000-000000000010','15f00000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','vis-005','A',0,'view','2026-07-03 09:20:00+00')
on conflict (id) do nothing;

-- ═══ M22 Content/CMS (manual slice) sample content ═══════════════════════════
-- One category + one author on the Acme Agency site, and four articles across the
-- editorial statuses (published / scheduled / in_review / draft) so every CMS
-- screen — list, editor, review queue, taxonomy — is populated on first run.
insert into public.article_categories (id, workspace_id, site_id, name, slug) values
  ('22c00000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','19000000-0000-0000-0000-000000000001','Growth','growth')
on conflict (id) do nothing;

insert into public.article_authors (id, workspace_id, user_id, name, bio) values
  ('22a00000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',
   'Amina Yusuf','Head of content at Acme Agency — writes about compounding growth.')
on conflict (id) do nothing;

insert into public.blog_articles
  (id, workspace_id, site_id, category_id, author_id, keyword, title, slug, excerpt, content_html,
   meta_title, meta_desc, featured_image_url, tags, schema, seo_score, readability_score, word_count,
   status, scheduled_at, reject_feedback, published_at, created_at, updated_at) values
  ('22b00000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','19000000-0000-0000-0000-000000000001',
   '22c00000-0000-0000-0000-000000000001','22a00000-0000-0000-0000-000000000001',
   'compounding growth','How Compounding Growth Beats Quick Wins','compounding-growth-beats-quick-wins',
   'Small, consistent gains compound into an unfair advantage. Here is how to build a compounding growth system.',
   '<h2>Why compounding beats quick wins</h2><p>Compounding growth turns small, consistent gains into an unfair advantage over time. Chasing quick wins optimises for a spike; compounding optimises for a slope.</p><h3>Start with a system</h3><p>Pick one lever, measure it weekly, and let the gains stack. See our <a href="/blog/content-that-ranks">content that ranks</a> guide.</p>',
   'How Compounding Growth Beats Quick Wins | Acme','Compounding growth turns small, consistent gains into an unfair advantage. Build a system that compounds.',
   null, '{growth,strategy}',
   '{"@context":"https://schema.org","@type":"Article","headline":"How Compounding Growth Beats Quick Wins"}',
   84, 62, 96, 'published', null, null, '2026-06-28 09:00:00+00','2026-06-27 12:00:00+00','2026-06-28 09:00:00+00'),
  ('22b00000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','19000000-0000-0000-0000-000000000001',
   '22c00000-0000-0000-0000-000000000001','22a00000-0000-0000-0000-000000000001',
   'content that ranks','Content That Ranks: A Practical Checklist','content-that-ranks',
   'A no-nonsense on-page checklist for content that actually ranks.',
   '<h2>The on-page checklist</h2><p>Ranking is not luck. Match intent, cover the topic, and earn internal links.</p>',
   'Content That Ranks: A Practical Checklist','A practical on-page SEO checklist for content that ranks — intent, depth, internal links.',
   null, '{seo,content}', '{}', 71, 58, 42, 'scheduled', '2026-07-10 08:00:00+00', null, null, '2026-07-02 15:30:00+00','2026-07-02 15:30:00+00'),
  ('22b00000-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','19000000-0000-0000-0000-000000000001',
   '22c00000-0000-0000-0000-000000000001','22a00000-0000-0000-0000-000000000001',
   'lead magnets','Lead Magnets That Convert in 2026','lead-magnets-that-convert',
   'The lead-magnet formats pulling the highest opt-in rates this year.',
   '<h2>Formats that convert</h2><p>Interactive tools and templated teardowns are outperforming static PDFs.</p>',
   'Lead Magnets That Convert in 2026','The lead-magnet formats with the highest opt-in rates in 2026.',
   null, '{leadgen}', '{}', 66, 55, 31, 'in_review', null, null, null, '2026-07-03 10:00:00+00','2026-07-03 10:00:00+00'),
  ('22b00000-0000-0000-0000-000000000004','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','19000000-0000-0000-0000-000000000001',
   null,'22a00000-0000-0000-0000-000000000001',
   'email cadence','The Right Email Cadence (Draft)','the-right-email-cadence',
   null, '<p>Draft — outline only.</p>', null, null, null, '{}', '{}', 12, 0, 4, 'draft', null, null, null, '2026-07-04 09:15:00+00','2026-07-04 09:15:00+00')
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- M21 SEO Engine (Session 21) — Acme Agency sample. Two keyword lists, researched
-- keywords, four rank trackers with a short position history (drives the chart +
-- Δ/major-move UI), and one completed audit with graded issues + CWV. content_queue
-- rows demonstrate the "Send to Content Queue" seam M22/S23 consumes.
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.keyword_lists (id, workspace_id, name, description) values
  ('21100000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Finance — commercial','Bottom-funnel money terms'),
  ('21100000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Ramadan content 2026','Seasonal informational')
on conflict (id) do nothing;

insert into public.keywords (workspace_id, list_id, keyword, volume, cpc, difficulty, intent) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','21100000-0000-0000-0000-000000000001','islamic finance app',8100,4.35,52,'commercial'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','21100000-0000-0000-0000-000000000001','halal investment app',5400,5.10,48,'commercial'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','21100000-0000-0000-0000-000000000001','sharia compliant investing',2900,6.20,44,'commercial'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','21100000-0000-0000-0000-000000000002','how does islamic banking work',2400,0,34,'informational'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','21100000-0000-0000-0000-000000000002','zakat calculator app',3300,1.80,27,'informational')
on conflict do nothing;

insert into public.tracked_keywords (id, workspace_id, list_id, keyword, domain, country, competitor_domains) values
  ('21200000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','21100000-0000-0000-0000-000000000001','islamic finance app','acme.agency','us','{wahed.com,zoya.finance}'),
  ('21200000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','21100000-0000-0000-0000-000000000001','halal investment app','acme.agency','us','{wahed.com}'),
  ('21200000-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',null,'zakat calculator','acme.agency','us','{}'),
  ('21200000-0000-0000-0000-000000000004','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',null,'muslim budgeting app','acme.agency','gb','{wahed.com}')
on conflict (id) do nothing;

-- Short position history (3 snapshots each) — enough for the trend line + a major move on t4.
insert into public.keyword_rankings (workspace_id, tracked_keyword_id, position, url, is_featured_snippet, checked_on) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','21200000-0000-0000-0000-000000000001',8,'https://acme.agency/finance',false,'2026-06-20'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','21200000-0000-0000-0000-000000000001',5,'https://acme.agency/finance',false,'2026-06-27'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','21200000-0000-0000-0000-000000000001',3,'https://acme.agency/finance',false,'2026-07-04'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','21200000-0000-0000-0000-000000000002',6,'https://acme.agency/invest',false,'2026-06-27'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','21200000-0000-0000-0000-000000000002',5,'https://acme.agency/invest',false,'2026-07-04'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','21200000-0000-0000-0000-000000000003',2,'https://acme.agency/zakat',true,'2026-06-27'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','21200000-0000-0000-0000-000000000003',1,'https://acme.agency/zakat',true,'2026-07-04'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','21200000-0000-0000-0000-000000000004',6,'https://acme.agency/budget',false,'2026-06-27'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','21200000-0000-0000-0000-000000000004',14,'https://acme.agency/budget',false,'2026-07-04')
on conflict do nothing;

insert into public.seo_audits (id, workspace_id, domain, status, results, score, pages_crawled) values
  ('21300000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','acme.agency','done',
   '{"cwv":{"lcp":2100,"inp":180,"cls":0.06},"summary":{"pages":143,"issues":7}}'::jsonb, 78, 143)
on conflict (id) do nothing;

insert into public.seo_audit_issues (workspace_id, audit_id, type, severity, url, detail) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','21300000-0000-0000-0000-000000000001','broken_link','critical','/finance/old-guide','HTTP 404'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','21300000-0000-0000-0000-000000000001','broken_link','critical','/blog/2023/ramadan','HTTP 404'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','21300000-0000-0000-0000-000000000001','missing_title','warning','/invest/compare','no <title>'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','21300000-0000-0000-0000-000000000001','missing_h1','warning','/about','no <h1>'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','21300000-0000-0000-0000-000000000001','redirect_chain','warning','/finance','2 hops'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','21300000-0000-0000-0000-000000000001','missing_meta','notice','/zakat','no meta description'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','21300000-0000-0000-0000-000000000001','large_image','notice','/hero.png','1.8 MB')
on conflict do nothing;

insert into public.content_queue (workspace_id, keyword, priority, status, source) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','sharia compliant investing',2,'queued','seo'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','zakat calculator app',3,'queued','seo')
on conflict do nothing;

-- ── M22-auto (D-190/D-191) — the real content-network sites the bulk pipeline ──
-- targets, replacing the single generic "Acme" test site for this purpose.
-- plan='agency' (not the plan's original 'scale' — 'scale' is not a public.plan_tier
-- enum value anywhere in the migration chain (0000_extensions_enums.sql defines only
-- free/starter/pro/agency/enterprise); 'agency' matches the only other parent-null,
-- top-level workspace in this file (Acme Agency) — flagged for plan-author review).
insert into public.workspaces (id, owner_id, parent_workspace_id, name, slug, plan, niche) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd','11111111-1111-1111-1111-111111111111', null, 'AiMindShare Content Network','content-network','agency','Content')
on conflict (id) do nothing;

insert into public.sites (id, workspace_id, name, subdomain, status, brand, nav, seo_defaults, style_preset) values
  ('19000000-0000-0000-0000-000000000002','dddddddd-dddd-dddd-dddd-dddddddddddd','IslamicInfo.org','islamicinfo','published',
   '{"colors":{"emerald":"#0F6E4A"},"fonts":{}}','{"items":[{"label":"Home","page_id":null}]}',
   '{"description":"Authentic Islamic knowledge, duas, and daily guidance.","robots":"index,follow"}','islamic'),
  ('19000000-0000-0000-0000-000000000003','dddddddd-dddd-dddd-dddd-dddddddddddd','TravellyAI.com','travellyai','published',
   '{"colors":{"sky":"#0284C7"},"fonts":{}}','{"items":[{"label":"Home","page_id":null}]}',
   '{"description":"Travel deals, destination guides, and trip-planning tips.","robots":"index,follow"}','bold'),
  ('19000000-0000-0000-0000-000000000004','dddddddd-dddd-dddd-dddd-dddddddddddd','GeniuslyAI.com','geniuslyai','published',
   '{"colors":{"violet":"#7C3AED"},"fonts":{}}','{"items":[{"label":"Home","page_id":null}]}',
   '{"description":"Practical guides on AI tools, productivity, and learning.","robots":"index,follow"}','minimal')
on conflict (id) do nothing;

insert into public.site_brand_voice (site_id, workspace_id, tone_prompt, review_required) values
  ('19000000-0000-0000-0000-000000000002','dddddddd-dddd-dddd-dddd-dddddddddddd',
   'Warm, respectful, and rooted in authentic Islamic sources. Avoid casual slang, avoid speculative religious rulings, cite the Quran/Sunnah in general terms only (never invent a specific ayah/hadith reference).',
   true),
  ('19000000-0000-0000-0000-000000000003','dddddddd-dddd-dddd-dddd-dddddddddddd',
   'Upbeat, practical, and deal-focused — write like a well-traveled friend giving advice, with concrete tips and urgency around limited-time offers.',
   false),
  ('19000000-0000-0000-0000-000000000004','dddddddd-dddd-dddd-dddd-dddddddddddd',
   'Clear, encouraging, and jargon-light — explain AI/productivity concepts to a smart beginner without condescension.',
   false)
on conflict (site_id) do nothing;
