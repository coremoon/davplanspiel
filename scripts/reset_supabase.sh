#!/usr/bin/env bash
# =============================================================================
# reset_supabase.sh
#
# Deletes all game data from the Supabase database (v2.3 schema).
# Requires SUPABASE_URL and SUPABASE_SECRET in .env
#
# Usage:
#   chmod +x scripts/reset_supabase.sh
#   ./scripts/reset_supabase.sh
# =============================================================================

set -euo pipefail

ENV_FILE="$(dirname "$0")/../.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source <(grep -v '^\s*#' "$ENV_FILE" | grep -v '^\s*$')
  set +a
fi

if [[ -z "${SUPABASE_URL:-}" ]]; then
  echo "❌ SUPABASE_URL not set (in .env or as environment variable)"
  exit 1
fi

if [[ -z "${SUPABASE_SECRET:-}" ]]; then
  echo "❌ SUPABASE_SECRET not set (sb_secret_... from Supabase Dashboard)"
  echo "   Dashboard → Project Settings → API → Secret keys"
  exit 1
fi

echo ""
echo "  Insurance Planning Game – Supabase Reset"
echo "  ========================================="
echo ""
echo "  ⚠️  WARNING: All game data will be permanently deleted!"
echo ""
read -r -p "  Continue? (y/N) " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "  Aborted."
  exit 0
fi

echo ""

delete_table() {
  local table="$1"
  local filter="$2"
  echo -n "  Deleting ${table} … "
  response=$(curl -s -o /dev/null -w "%{http_code}" \
    -X DELETE \
    "${SUPABASE_URL}/rest/v1/${table}?${filter}" \
    -H "apikey: ${SUPABASE_SECRET}" \
    -H "Authorization: Bearer ${SUPABASE_SECRET}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal")
  if [[ "$response" == "200" || "$response" == "204" ]]; then
    echo "✅"
  else
    echo "❌ (HTTP $response)"
    exit 1
  fi
}

# Delete in dependency order (child tables first)
delete_table "game_state"    "game_id=neq.null"
delete_table "group_inputs"  "game_id=neq.null"
delete_table "game_results"  "game_id=neq.null"
delete_table "groups"        "game_id=neq.null"
delete_table "games"         "id=neq.null"

echo ""
echo "  ✅ All game data deleted."
echo "  Hard-reload browser: Cmd+Shift+R (Mac) / Ctrl+Shift+R (Windows)"
echo ""
