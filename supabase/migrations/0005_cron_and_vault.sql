-- ═══════════════════════════════════════════════════════════════════════════
-- 0005_cron_and_vault.sql — AiMindShare Session 0
-- First pg_cron entries + first Vault secret (read-proof for the Edge Function).
-- (No public.* tables → DoD Gate-8 RLS check does not apply to this file.)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── pg_cron registry (Session 0 foundation) ─────────────────────────────────
-- Claim sweep: nudge listening workers every minute (NOTIFY on the jobs channel).
select cron.schedule(
  'jobs-claim-sweep',
  '*/1 * * * *',
  $$ select pg_notify('jobs', 'tick') $$
);

-- Stale-lease reclaim: a worker that died mid-run leaves status='running' with
-- an old lock; reclaim it back to 'queued' so another worker can pick it up.
select cron.schedule(
  'jobs-stale-lease-reclaim',
  '*/1 * * * *',
  $$ update public.jobs
        set status = 'queued', locked_by = null, locked_at = null, updated_at = now()
      where status = 'running'
        and locked_at < now() - interval '15 minutes' $$
);

-- ── Vault: first placeholder secret ─────────────────────────────────────────
-- Proves the Edge Function can read a secret from Vault (Law 3: secrets live in
-- Vault, read only server-side, never in the browser). Real provider keys
-- (Stripe, OpenAI, …) are added the same way in their own sessions.
select vault.create_secret(
  'placeholder-secret-value-session-0',
  'aimindshare_placeholder',
  'Session 0 Vault read-proof — safe to rotate/delete once real secrets exist'
);
