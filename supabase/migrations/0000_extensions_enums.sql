-- ═══════════════════════════════════════════════════════════════════════════
-- 0000_extensions_enums.sql — AiMindShare Session 0
-- Extensions, enum registry, and the shared updated_at trigger function.
-- No tables / no RLS in this file by design (DoD Gate-8 scopes the RLS check
-- to migrations that create public tenant tables).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists vector;      -- pgvector, agent RAG (M33, later)
create extension if not exists pg_cron;     -- recurring jobs (claim sweep, reclaim)
create extension if not exists pg_trgm;     -- fuzzy search / dup detection (later)

-- ── Enum registry (Session 0 minimum) ───────────────────────────────────────
do $$ begin
  create type public.member_role   as enum ('owner','admin','manager','staff','client');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.member_status as enum ('active','invited','suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.plan_tier     as enum ('free','starter','pro','agency','enterprise');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.job_status    as enum ('queued','running','done','failed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.meter_kind    as enum ('email','sms','ai_tokens','enrichment','voice_minutes','seo_api','storage_gb');
exception when duplicate_object then null; end $$;

-- ── Shared trigger: bump updated_at on every UPDATE ──────────────────────────
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
