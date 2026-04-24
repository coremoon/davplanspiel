#!/usr/bin/env bash
# =============================================================================
# install_local.sh
#
# One-time setup for the local self-hosted Supabase + Planspiel stack.
# Generates all secrets, writes .env.local, and starts Docker.
#
# Usage:
#   chmod +x scripts/install_local.sh
#   ./scripts/install_local.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"
COMPOSE_FILE="$ROOT_DIR/docker-compose.local.yml"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

header() { echo -e "\n${BOLD}${BLUE}$1${NC}"; }
ok()     { echo -e "  ${GREEN}✅ $1${NC}"; }
info()   { echo -e "  ${YELLOW}ℹ️  $1${NC}"; }
err()    { echo -e "  ${RED}❌ $1${NC}"; exit 1; }

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   Insurance Planning Game – Local Setup              ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"

# ── Prerequisites ─────────────────────────────────────────────────────────────
header "Checking prerequisites"

command -v docker  >/dev/null 2>&1 || err "Docker not found. Please install Docker Desktop."
command -v openssl >/dev/null 2>&1 || err "openssl not found."
command -v node    >/dev/null 2>&1 || err "Node.js not found."
command -v npm     >/dev/null 2>&1 || err "npm not found."

docker info >/dev/null 2>&1 || err "Docker is not running. Please start Docker Desktop."

ok "Docker running"
ok "openssl available"
ok "Node.js $(node --version)"

# ── Generate secrets ──────────────────────────────────────────────────────────
header "Generating secrets"

SKIP_GENERATE=false
if [[ -f "$ENV_FILE" ]]; then
  echo ""
  read -r -p "  .env.local already exists. Overwrite? (y/N) " overwrite
  [[ "$overwrite" != "y" && "$overwrite" != "Y" ]] && {
    info "Skipping secret generation – using existing .env.local"
    SKIP_GENERATE=true
  }
fi

if [[ "$SKIP_GENERATE" == "false" ]]; then
  POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '=/+' | head -c 32)
  JWT_SECRET=$(openssl rand -base64 64 | tr -d '=/+' | head -c 64)
  SECRET_KEY_BASE=$(openssl rand -base64 64 | tr -d '=/+' | head -c 64)

  JWT_HEADER=$(echo -n '{"alg":"HS256","typ":"JWT"}' | base64 | tr -d '=' | tr '+/' '-_' | tr -d '\n')

  ANON_PAYLOAD=$(echo -n "{\"role\":\"anon\",\"iss\":\"supabase-local\",\"iat\":$(date +%s),\"exp\":$(( $(date +%s) + 315360000 ))}" \
    | base64 | tr -d '=' | tr '+/' '-_' | tr -d '\n')

  SERVICE_PAYLOAD=$(echo -n "{\"role\":\"service_role\",\"iss\":\"supabase-local\",\"iat\":$(date +%s),\"exp\":$(( $(date +%s) + 315360000 ))}" \
    | base64 | tr -d '=' | tr '+/' '-_' | tr -d '\n')

  sign_jwt() {
    local header="$1" payload="$2" secret="$3" sig
    sig=$(echo -n "${header}.${payload}" \
      | openssl dgst -sha256 -hmac "$secret" -binary \
      | base64 | tr -d '=' | tr '+/' '-_' | tr -d '\n')
    echo "${header}.${payload}.${sig}"
  }

  ANON_KEY=$(sign_jwt "$JWT_HEADER" "$ANON_PAYLOAD" "$JWT_SECRET")
  SERVICE_ROLE_KEY=$(sign_jwt "$JWT_HEADER" "$SERVICE_PAYLOAD" "$JWT_SECRET")

  cat > "$ENV_FILE" << EOF
# =============================================================================
# Insurance Planning Game – Local environment variables
# Generated: $(date)
# WARNING: Contains secrets – never commit this file!
# =============================================================================

# PostgreSQL
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# Supabase secrets
JWT_SECRET=${JWT_SECRET}
SECRET_KEY_BASE=${SECRET_KEY_BASE}

# API keys
ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}

# App config
VITE_SUPABASE_URL=http://localhost:8000
VITE_SUPABASE_ANON_KEY=${ANON_KEY}
EOF

  ok ".env.local created"
fi

set -a
# shellcheck disable=SC1090
source <(grep -v '^\s*#' "$ENV_FILE" | grep -v '^\s*$')
set +a

# ── Kong config ───────────────────────────────────────────────────────────────
header "Preparing Kong configuration"

sed \
  -e "s|\${SUPABASE_ANON_KEY}|${ANON_KEY}|g" \
  -e "s|\${SUPABASE_SERVICE_KEY}|${SERVICE_ROLE_KEY}|g" \
  "$ROOT_DIR/docker/kong.yml" > "$ROOT_DIR/docker/kong.rendered.yml"

ok "Kong configuration ready"

# ── npm install ───────────────────────────────────────────────────────────────
header "Installing npm dependencies"
cd "$ROOT_DIR"
npm install --silent
ok "npm install complete"

# ── Build Docker image ────────────────────────────────────────────────────────
header "Building Docker images"
info "This may take a few minutes on the first run..."

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build \
  --build-arg VITE_SUPABASE_URL="http://localhost:8000" \
  --build-arg VITE_SUPABASE_ANON_KEY="${ANON_KEY}" \
  app

ok "App image built"

# ── Start stack ───────────────────────────────────────────────────────────────
header "Starting stack"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
ok "All containers started"

info "Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  docker compose -f "$COMPOSE_FILE" exec db \
    pg_isready -U supabase_admin -d postgres >/dev/null 2>&1 && break
  sleep 2
  [[ $i -eq 30 ]] && err "PostgreSQL did not become ready after 60s."
done
ok "PostgreSQL ready"

info "Waiting for API gateway..."
for i in $(seq 1 20); do
  curl -sf http://localhost:8000/rest/v1/ \
    -H "apikey: ${ANON_KEY}" >/dev/null 2>&1 && break
  sleep 3
done
ok "API gateway ready"

# ── Summary ───────────────────────────────────────────────────────────────────
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "YOUR_IP")

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   ✅ Setup complete                                               ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}App:${NC}              http://localhost:5173"
echo -e "  ${GREEN}Supabase Studio:${NC}  http://localhost:3000"
echo -e "  ${GREEN}API:${NC}              http://localhost:8000"
echo ""
echo -e "  ${BOLD}For participants on the same network:${NC}"
echo -e "  App: ${GREEN}http://${LOCAL_IP}:5173${NC}"
echo ""
echo -e "  Secrets saved to: ${YELLOW}${ENV_FILE}${NC}"
echo ""
