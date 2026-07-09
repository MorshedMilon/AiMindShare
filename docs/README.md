# AiMindShare — docs index

This repo is **docs-first** (Constitution Law 8). The foundation documents live at the
repo root and remain the source of truth; this folder indexes them and records the
Session 0 scaffold layout. Documents are **not** relocated (moving them would break the
many cross-references in the spec set).

## Foundation documents (root)
- [Constitution](../CLAUDE-AiMindShare-v1_0.md) — the nine laws
- [Decisions](../DECISIONS-AiMindShare-v1_0.md) — LOCKED / OPEN decision log
- [Data schema](../DATA-SCHEMA-v1_0.md)
- [RLS & security](../RLS-AND-SECURITY-v1_0.md) — RLS template + leak probe
- [Jobs & workers](../JOBS-AND-WORKERS-SPEC-v1_0.md)
- [Edge functions](../EDGE-FUNCTIONS-SPEC-v1_0.md) — standard envelope + Vault
- [Build sequence](../BUILD-SEQUENCE-v1_0.md) — Session 0 entry
- [Definition of Done](../DEFINITION-OF-DONE-v1_0.md) — the nine gates, Gate-8 greps
- [Design system](../AIMINDSHARE-DESIGN-v1_0.md) + [tokens.css](../tokens.css)
- [Tasks](../TASKS.md)

## Session 0 scaffold
```
frontend/   vanilla HTML/CSS/JS — the setup & verification console
supabase/   migrations 0000–0005, functions/ (health), tests/, seed.sql, config.toml
workers/    worker.mjs (stub worker) + verify/ (PGlite leak & job probes)
scripts/    gate8.sh (DoD Gate-8) + verify.sh (one-shot acceptance)
```

## Verify (Session 0 acceptance)
```bash
# Runs on Node + bash alone (real Postgres via PGlite):
cd workers && npm install && cd ..
bash scripts/verify.sh          # Gate-8 + leak probe + job probe (+ live probes if connected)

# Full stack (requires Docker Desktop + Supabase CLI):
supabase start && supabase db reset
supabase functions serve health
export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
node workers/worker.mjs --once  # claim the seeded queued job → done
psql "$DATABASE_URL" -f supabase/tests/leak_probe.sql
```

## Hosted setup (out of Session 0 local scope)
Create the Supabase project, then configure **Auth** (email/password, Google OAuth, magic
links, 2FA, reset flow) and add real provider secrets to **Vault**. These require the
Supabase console/org and are done once per environment. OPEN decisions D-009 (hosting),
D-010 (worker runtime), D-011 (email provider), D-012 (theme key) do not block Session 0.
