# Session 0 — design & architecture rationale

**One-line:** stand up the whole Supabase data plane behind database-enforced RLS, prove the
four acceptance probes, and ship a premium internal console that doubles as the living
Definition-of-Done board — without any product screens (DoD Gate 5).

## Technical decisions
- **RLS co-located with tables.** Each table-creating migration also enables RLS and defines its
  four policies, so the Gate-8 "table without RLS" grep is a true invariant, not a cross-file
  guess. SQL helpers (`is_member`/`has_role`) sit **after** `memberships` in `0001` because
  language-sql function bodies resolve table references at creation time.
- **Security-definer helpers.** `is_member`/`has_role` run as definer and are called *inside* the
  `memberships` policies — bypassing RLS only for the membership lookup avoids infinite policy
  recursion while keeping tenant isolation intact.
- **Jobs contract in the database.** Browsers can insert `queued` only (`with check status='queued'`);
  `update`/`delete` have no policy → denied for everyone except the service role. The atomic
  `claim_job()` uses `FOR UPDATE SKIP LOCKED` so two workers never grab one row.
- **Secrets never in the browser (Law 3).** The `health` Edge Function reads Vault server-side and
  returns only *whether* the secret exists, never its value. The console takes the anon key only.
- **Verification without Docker.** The dev machine has Node but no Docker/Supabase CLI/Deno, so the
  leak probe and job-queue contract run on **PGlite** (real Postgres in WASM): migrations load
  unchanged, `SET ROLE authenticated` + a JWT-`sub` GUC reproduce Supabase's `auth.uid()` path, and
  RLS is exercised for real. The two probes that genuinely need the full stack (live worker, live
  Edge Function) are one-command-ready via `scripts/verify.sh` and clearly marked *not run* until
  the toolchain is installed — never faked green.

## UX decisions
- **Console, not product UI.** Session 0 has no end-user screens; a setup/verification console
  satisfies the "premium showcase" ask while honoring Gate 5, and it stays useful for every later
  session as the DoD dashboard.
- **Honest states.** Cards show real local-run results (`data/verify-status.json`); the live probe
  shows an explicit empty/idle state until a project is connected. No fabricated numbers.
- **Design DNA (Law 6).** Three fonts (Cormorant Garamond / Baskerville / Shippori Mincho — D-014,
  all numbers in the data font), `.5px` hairlines, cards ≥ 24px radius, glass panels, atmospheric orbs + grid, glow/pulse
  instead of sweep animations, and **no stars/dots in dark mode** — all gated behind
  `prefers-reduced-motion`.
