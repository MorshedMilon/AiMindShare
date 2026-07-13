#!/usr/bin/env bash
# verify.sh — AiMindShare Session 0 one-shot acceptance runner.
# Runs every "Accept when" probe. The two DB-in-WASM probes (leak + job) and
# Gate-8 need only Node + bash. The live worker + Edge Function probes need a
# running Supabase (Docker + Supabase CLI); they are skipped with a clear note
# when the stack/env isn't present — never reported as passing when not run.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2
RED=$'\e[31m'; GRN=$'\e[32m'; YEL=$'\e[33m'; RST=$'\e[0m'
fails=0

echo "══ 1/10  DoD Gate-8 greps ════════════════════════════════════════════"
bash scripts/gate8.sh || fails=$((fails+1))

echo; echo "══ 2/10  Cross-tenant leak probe (PGlite) ════════════════════════════"
( cd workers && node verify/leakprobe.mjs ) || fails=$((fails+1))

echo; echo "══ 3/10  Job queue claim→done probe (PGlite) ═════════════════════════"
( cd workers && node verify/jobprobe.mjs ) || fails=$((fails+1))

echo; echo "══ 4/10  M00 auth: profiles trigger + auth_events isolation (PGlite) ══"
( cd workers && node verify/m00probe.mjs ) || fails=$((fails+1))

echo; echo "══ 5/10  M01 workspaces: create/provision/invite/transfer + leak (PGlite) ══"
( cd workers && node verify/m01probe.mjs ) || fails=$((fails+1))

echo; echo "══ 6/10  M02 roles: matrix enforcement + overrides + roles-table leak (PGlite) ══"
( cd workers && node verify/m02probe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M04 notifications: notify()/dedupe/prefs + feed leak + digest enqueue (PGlite) ══"
( cd workers && node verify/m04probe.mjs ) || fails=$((fails+1))

echo; echo "══ 7/10  M03 billing: meter_increment/check + has_feature + trial sweep + billing leak (PGlite) ══"
( cd workers && node verify/m03probe.mjs ) || fails=$((fails+1))

echo; echo "══ 8/10  M41 integrations: RLS admin+/platform-null + resolveCredential order + health job (PGlite) ══"
( cd workers && node verify/m41probe.mjs ) || fails=$((fails+1))

echo; echo "══ 9/10  M05 compliance: consent ledger + A2P matrix + GDPR jobs + leak (PGlite) ══"
( cd workers && node verify/m05probe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M09 CRM: tenancy + role matrix + smart_list_eval + merge + dedupe + import job (PGlite) ══"
( cd workers && node verify/m09probe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M11 Pipeline: tenancy + config/deal matrix + move/close/forecast + value-history (PGlite) ══"
( cd workers && node verify/m11probe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M12 Inbox: tenancy + notes-only insert + ingest/thread/unread + role matrix + search (PGlite) ══"
( cd workers && node verify/m12probe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M13 Automations: tenancy + roles + emit_trigger bus + re-entry + source triggers + version-pin (PGlite) ══"
( cd workers && node verify/m13probe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M13 walker: real automation.mjs engine (add_tag/if_else/wait/notify/goal) via PGlite adapter ══"
( cd workers && node verify/m13walkprobe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M28 Payments: tenancy + role matrix + server totals + numbering + estimate→invoice + payment idempotency + overdue/rollup (PGlite) ══"
( cd workers && node verify/m28probe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M14 Calendar: tenancy + role matrix + slot engine (tz/DST/buffer/notice/cap/round-robin/group) + booking bus + lifecycle tokens + reminder cron (PGlite) ══"
( cd workers && node verify/m14probe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M15 Forms: tenancy on 3 tables + role matrix (staff edit/manager delete/client ceiling) + form_submissions/form_views service-role-insert-only + submit_form (contact dedupe/consent/quiz/logic-drop/routing/form.submitted bus) + honeypot/time-trap + double-opt-in + A/B sticky + analytics (PGlite) ══"
( cd workers && node verify/m15probe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M44 Admin: is_platform_admin() wall on every RPC + cross-tenant reads + flag resolution + audit append-only + suspend + jobs retry/discard + impersonation expiry sweep (PGlite) ══"
( cd workers && node verify/m44probe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M06 Media: media_folders/media_assets leak + bucket role matrix + register_media_asset/autotag job + used_in register/backfill + storage-meter gauge + soft-delete (PGlite) ══"
( cd workers && node verify/m06probe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M16 Campaigns: tenancy + role matrix + audience/suppression + unsubscribe dual-write + fan-out enqueue + stats trigger (PGlite) ══"
( cd workers && node verify/m16probe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M20 Funnels: tenancy + role matrix (staff edit/manager delete/client ceiling) + funnel_map conversion math + A/B z-test winner + order→M28 invoice + funnel_visits service-role-only + abandoned sweep + AI Funnel Studio blueprint engine + Affiliate Hub bridge + compliance scan (PGlite) ══"
( cd workers && node verify/m20probe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M29 Affiliate Hub: offer vault / networks / disclosure templates — tenancy + role matrix (staff write/client ceiling) (PGlite) ══"
( cd workers && node verify/m29probe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M19 Sites: tenancy on 6 tables + role matrix (staff edit/manager publish+delete/admin domains/client ceiling) + publish_page snapshot+prune-to-10 + revert + duplicate + renderer draft-hiding + visitor_sessions service-role-only + page.visited bus (PGlite) ══"
( cd workers && node verify/m19probe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M19 Sites: pure page-builder (deterministic AI, ≥95% AC) + site-render (SEO/JSON-LD/brand/cookie/pixel/embeds + sitemap draft-hiding) (Node) ══"
( cd workers && node verify/m19renderprobe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M19 Sites v2 (0028): kind/label save-points + per-kind prune + site_publish_log tenancy/system-write + save-as-template + staging draft shape + presets/i18n/maintenance/404/Product-Event JSON-LD/M15 embed + 3 new niches (PGlite+Node) ══"
( cd workers && node verify/m19v2probe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M22 Content/CMS: tenancy on 4 tables + role matrix (staff edit/manager publish+delete/client ceiling) + revision snapshot/restore + publish JSON-LD + schedule + due-publish sweep + editorial workflow (submit/approve/reject) + slug uniqueness (PGlite) ══"
( cd workers && node verify/m22probe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M22 blog-render: pure article/index/category/RSS + Article/FAQ JSON-LD + 404 published-only (Node) ══"
( cd workers && node verify/m22renderprobe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M22 editor-side: content-seo deterministic on-page score + Flesch readability + content-editor sanitiser allowlist (Node) ══"
( cd workers && node verify/m22seoprobe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M22-auto pipeline: pure deterministic blog-pipeline.mjs (cluster/pillar + SERP brief + placeholder HTML + SEO score + internal links + BlogPosting JSON-LD) (Node) ══"
( cd workers && node verify/m22pipelineprobe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M22-auto DB: content_schedules + content_queue extension + cluster cols + leak/role matrix + worker-RPC service-role wall + enqueue idempotency + pipeline path (draft/score/schema/links) + review-vs-autopublish gate + advance_content_pipeline scheduler (PGlite) ══"
( cd workers && node verify/m22autoprobe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M22-auto: real LLM adapter (unit, no network) ══"
( cd workers && node verify/llmprobe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M22-auto: Bulk Content Creation schema + RLS + RPCs (PGlite) ══"
( cd workers && node verify/m22bulkprobe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M21 SEO Engine: 8-table leak + operator-ceiling role matrix + worker-write posture + keyword cache TTL/scope + send-to-queue + rank delta/major-move emit + rank_history + audit_score + daily/weekly cron enqueue + grants (PGlite) ══"
( cd workers && node verify/m21probe.mjs ) || fails=$((fails+1))

echo; echo "══ +  M21 audit crawler: bounded resumable BFS + broken-link/on-page issue detection + maxPages cap + robots disallow (Node) ══"
( cd workers && node verify/m21crawlprobe.mjs ) || fails=$((fails+1))

echo; echo "══ 10/10  Live worker + Edge Function (needs Supabase CLI) ══════════"
if command -v supabase >/dev/null 2>&1 && [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "→ worker --once against local stack:"
  ( cd workers && node worker.mjs --once ) || fails=$((fails+1))
  echo "→ health Edge Function (Vault read → envelope):"
  curl -s "${SUPABASE_URL}/functions/v1/health" || fails=$((fails+1))
  echo
else
  printf '%s⤳ SKIPPED%s  Supabase CLI / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.\n' "$YEL" "$RST"
  echo "           Install Docker Desktop + Supabase CLI, then:"
  echo "             supabase start && supabase db reset"
  echo "             export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=..."
  echo "             bash scripts/verify.sh"
fi

echo
if [ "$fails" -eq 0 ]; then
  printf '%s✔ verify.sh: all runnable probes passed%s\n' "$GRN" "$RST"; exit 0
else
  printf '%sx verify.sh: %d probe group(s) failed%s\n' "$RED" "$fails" "$RST"; exit 1
fi
