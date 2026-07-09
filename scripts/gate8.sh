#!/usr/bin/env bash
# gate8.sh — AiMindShare DoD Gate-8 self-review greps (Laws 1/2/3/6).
# Every check must return ZERO hits. Exits non-zero if any violation is found.
# Scans only the Session 0 scaffold (frontend/ supabase/ workers/ scripts/ docs/);
# node_modules is excluded.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

RED=$'\e[31m'; GRN=$'\e[32m'; RST=$'\e[0m'
violations=0
EXCL=(--exclude-dir=node_modules)

check() { # <label> <hit-output>
  local label="$1" hits="$2"
  if [ -z "$hits" ]; then
    printf '  %sPASS%s  %s\n' "$GRN" "$RST" "$label"
  else
    printf '  %sFAIL%s  %s\n' "$RED" "$RST" "$label"
    printf '%s\n' "$hits" | sed 's/^/          /'
    violations=$((violations+1))
  fi
}

echo "Gate-8 — Law 1: dead stack (no React/Next/Prisma/BullMQ/…)"
check "no forbidden frontend/worker imports" \
  "$(grep -rn "${EXCL[@]}" -e 'import React' -e 'from "react"' -e 'next/' -e 'prisma' \
      -e 'bullmq' -e 'ioredis' -e '@hello-pangea' -e 'reactflow' -e 'craft.js' -e 'NextAuth' \
      frontend/ supabase/functions/ workers/ 2>/dev/null)"

echo "Gate-8 — Law 3: secrets in the front end"
check "no secret tokens under frontend/" \
  "$(grep -rn "${EXCL[@]}" -e 'sk-[A-Za-z0-9_-]{16,}' -e 'sk_live' -e 'rk_' -e 'service_role' \
      -e 'SUPABASE_SERVICE' -e 'whsec_' frontend/ 2>/dev/null)"

echo "Gate-8 — Law 6: design DNA"
check "no shimmer animations" \
  "$(grep -rn "${EXCL[@]}" 'shimmer' frontend/ 2>/dev/null)"
check "domain uses the quranlyai.com form" \
  "$(grep -rn "${EXCL[@]}" 'quranly\.ai' frontend/ supabase/ workers/ docs/ 2>/dev/null)"
check "no raw brand hex outside tokens.css" \
  "$(grep -rni "${EXCL[@]}" --include='*.css' -e '#00696e' -e '#c5a059' frontend/ 2>/dev/null | grep -v 'tokens.css')"
check "no fourth font family" \
  "$(grep -rn "${EXCL[@]}" --include='*.css' 'font-family' frontend/ 2>/dev/null | grep -viE 'cormorant|baskerville|shippori|georgia|serif|inherit|var\(')"

echo "Gate-8 — Law 2: every table-creating migration enables RLS"
rls_miss=""
for f in supabase/migrations/*.sql; do
  if grep -qiE 'create table( if not exists)? public\.' "$f"; then
    grep -qi 'enable row level security' "$f" || rls_miss+="$f"$'\n'
  fi
done
check "tenant-table migrations enable RLS" "$(printf '%s' "$rls_miss" | sed '/^$/d')"

echo
if [ "$violations" -eq 0 ]; then
  printf '%sGate-8: CLEAN — 0 violations%s\n' "$GRN" "$RST"; exit 0
else
  printf '%sGate-8: %d check(s) failed%s\n' "$RED" "$violations" "$RST"; exit 1
fi
