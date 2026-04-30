#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CoheronConnect · Vultr Test Server Bootstrap
#
# Run this ONCE on a fresh Ubuntu 24.04 Vultr VPS as root:
#   curl -fsSL https://raw.githubusercontent.com/Recon-X2025/CoheronConnect/main/scripts/deploy-vultr.sh | bash
#
# What it does:
#   1. Installs Docker + Docker Compose plugin
#   2. Clones the repo
#   3. Generates .env.production with random secrets
#   4. Builds and starts all containers
#   5. Runs DB migrations + seeds
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="https://github.com/Recon-X2025/CoheronConnect.git"
APP_DIR="/opt/coheronconnect"
COMPOSE_FILE="docker-compose.vultr-test.yml"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
die()     { echo -e "${RED}[ERROR]${RESET} $*" >&2; exit 1; }

# ── Root check ────────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || die "Run as root (sudo bash $0)"

# ── Detect server public IP ──────────────────────────────────────────────────
SERVER_IP=$(curl -s https://api.ipify.org || hostname -I | awk '{print $1}')
info "Server IP detected: ${BOLD}${SERVER_IP}${RESET}"

# ── 1. System updates ─────────────────────────────────────────────────────────
info "Installing required packages..."
export DEBIAN_FRONTEND=noninteractive

# Wait up to 120s for any existing apt lock to clear
LOCK_WAIT=0
while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; do
  if [[ $LOCK_WAIT -ge 120 ]]; then
    warn "apt lock held too long — force-clearing it"
    kill "$(fuser /var/lib/dpkg/lock-frontend 2>/dev/null)" 2>/dev/null || true
    rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock
    dpkg --configure -a -q
    break
  fi
  info "Waiting for apt lock... (${LOCK_WAIT}s)"
  sleep 5
  LOCK_WAIT=$((LOCK_WAIT + 5))
done

apt-get update -qq
apt-get install -y -qq \
  -o Dpkg::Options::="--force-confold" \
  -o Dpkg::Options::="--force-confdef" \
  curl git openssl ca-certificates gnupg

# ── 2. Install Docker ─────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  info "Installing Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
  success "Docker installed"
else
  success "Docker already installed ($(docker --version | head -c 30))"
fi

# ── 3. Clone / update repo ────────────────────────────────────────────────────
if [[ -f "$APP_DIR/docker-compose.vultr-test.yml" ]]; then
  info "Project files already present at $APP_DIR — skipping clone"
elif [[ -d "$APP_DIR/.git" ]]; then
  info "Repo already cloned — pulling latest..."
  git -C "$APP_DIR" pull --ff-only
else
  info "Cloning CoheronConnect repo..."
  git clone "$REPO" "$APP_DIR" || {
    die "Git clone failed. The repo may be private. Run from your Mac first:
  rsync -az --exclude='node_modules' --exclude='.git' --exclude='.next' \\
    --exclude='dist' --exclude='.turbo' --exclude='*.pdf' --exclude='.pnpm-store' \\
    /Users/kathikiyer/Documents/CoheronConnect/ root@${SERVER_IP}:/opt/coheronconnect/
Then re-run this script."
  }
fi
cd "$APP_DIR"

# ── 4. Generate .env.production if not present ───────────────────────────────
ENV_FILE="$APP_DIR/.env.production"

gen_secret() { openssl rand -base64 48 | tr -d '/+=' | head -c 48; }
gen_password() { openssl rand -base64 32 | tr -d '/+=' | head -c 24; }

if [[ -f "$ENV_FILE" ]]; then
  warn ".env.production already exists — skipping secret generation."
  warn "Delete it and re-run if you want fresh secrets."
else
  info "Generating .env.production with random secrets..."

  POSTGRES_PASS=$(gen_password)
  REDIS_PASS=$(gen_password)
  MEILI_KEY=$(gen_secret)
  JWT_SECRET=$(gen_secret)
  SESSION_SECRET=$(gen_secret)
  S3_ACCESS=$(gen_password)
  S3_SECRET=$(gen_secret)

  cat > "$ENV_FILE" <<EOF
# ── CoheronConnect Production Environment ──────────────────────────────────────────
# Auto-generated on $(date -u +"%Y-%m-%d %H:%M UTC") by deploy-vultr.sh
# KEEP THIS FILE PRIVATE — never commit it.

NODE_ENV=production
SERVER_IP=${SERVER_IP}

# Database
DATABASE_URL=postgresql://coheronconnect:${POSTGRES_PASS}@postgres:5432/coheronconnect
POSTGRES_PASSWORD=${POSTGRES_PASS}
POSTGRES_USER=coheronconnect
POSTGRES_DB=coheronconnect

# Redis
REDIS_URL=redis://:${REDIS_PASS}@redis:6379
REDIS_PASSWORD=${REDIS_PASS}

# Auth
JWT_SECRET=${JWT_SECRET}
SESSION_SECRET=${SESSION_SECRET}
SESSION_TTL_HOURS=8

# Rate limiting (high for testing)
RATE_LIMIT_MAX=200000
RATE_LIMIT_ANON_MAX=200000
DB_POOL_MAX=30

# Meilisearch
MEILISEARCH_URL=http://meilisearch:7700
MEILISEARCH_KEY=${MEILI_KEY}

# S3 / MinIO (local object storage)
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=${S3_ACCESS}
S3_SECRET_KEY=${S3_SECRET}
S3_BUCKET=coheronconnect

# Session cache
FLUSH_REDIS_SESSION_ON_START=true
EOF

  chmod 600 "$ENV_FILE"
  success ".env.production created"
fi

# Export SERVER_IP for docker compose interpolation
export SERVER_IP

# ── 5. Build images & start services ─────────────────────────────────────────
info "Building Docker images (this takes ~5 minutes on first run)..."
docker compose -f "$COMPOSE_FILE" build --parallel

info "Starting all services..."
docker compose -f "$COMPOSE_FILE" up -d

# ── 6. Wait for API health ────────────────────────────────────────────────────
info "Waiting for API to become healthy..."
MAX_WAIT=120
ELAPSED=0
until curl -sf "http://localhost:3001/health" &>/dev/null; do
  sleep 3
  ELAPSED=$((ELAPSED + 3))
  if [[ $ELAPSED -ge $MAX_WAIT ]]; then
    warn "API health check timed out after ${MAX_WAIT}s."
    warn "Run: docker compose -f $COMPOSE_FILE logs api"
    break
  fi
done
[[ $ELAPSED -lt $MAX_WAIT ]] && success "API is healthy"

# ── 7. Seed the database ──────────────────────────────────────────────────────
info "Running database seed..."
docker compose -f "$COMPOSE_FILE" exec -T api \
  node -e "require('./dist/seed.js')" 2>&1 || \
  warn "Seed step skipped or already applied"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║        CoheronConnect is live on Vultr!                   ║${RESET}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}Web app:${RESET}  http://${SERVER_IP}"
echo -e "  ${BOLD}API:${RESET}      http://${SERVER_IP}:3001"
echo -e "  ${BOLD}Health:${RESET}   http://${SERVER_IP}:3001/health"
echo ""
echo -e "  ${BOLD}Secrets file:${RESET} ${ENV_FILE}"
echo ""
echo -e "  ${YELLOW}Tip:${RESET} To view logs:  docker compose -f $COMPOSE_FILE logs -f"
echo -e "  ${YELLOW}Tip:${RESET} To stop:       docker compose -f $COMPOSE_FILE down"
echo ""
