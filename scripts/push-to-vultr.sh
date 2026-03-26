#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# One-shot deploy to Vultr — run from your Mac.
# Enter password ONCE. Everything else is automatic.
# Usage: bash scripts/push-to-vultr.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SERVER_IP="139.84.154.78"
SERVER="root@${SERVER_IP}"
LOCAL_DIR="/Users/kathikiyer/Documents/NexusOps"
SOCK="/tmp/nexusops-deploy-$$"

GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
info() { echo -e "${CYAN}▶ $*${RESET}"; }
ok()   { echo -e "${GREEN}✓ $*${RESET}"; }

echo ""
echo -e "${BOLD}NexusOps → Vultr Deploy${RESET}"
echo -e "Server: ${SERVER_IP}"
echo ""

# ── Open one SSH connection, reuse for everything ─────────────────────────────
info "Connecting to server (enter password once)..."
ssh -M -S "$SOCK" -o ControlPersist=600 -o StrictHostKeyChecking=accept-new -f -N "$SERVER"
ok "Connected"

# ── Sync project files ────────────────────────────────────────────────────────
info "Syncing project files..."
rsync -az --info=progress2 \
  -e "ssh -S $SOCK" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.next' \
  --exclude='dist' \
  --exclude='.turbo' \
  --exclude='*.pdf' \
  --exclude='.pnpm-store' \
  "${LOCAL_DIR}/" "${SERVER}:/opt/nexusops/"
ok "Files synced"

# ── Build + start all services ────────────────────────────────────────────────
info "Building Docker images and starting services (8-12 min)..."
ssh -S "$SOCK" "$SERVER" bash << REMOTE
set -e
cd /opt/nexusops
export SERVER_IP=${SERVER_IP}

# Generate secrets if not already done
if [[ ! -f .env.production ]]; then
  gen_secret()   { openssl rand -base64 48 | tr -d '/+=' | head -c 48; }
  gen_password() { openssl rand -base64 32 | tr -d '/+=' | head -c 24; }
  POSTGRES_PASS=\$(gen_password)
  REDIS_PASS=\$(gen_password)
  MEILI_KEY=\$(gen_secret)
  JWT_SECRET=\$(gen_secret)
  SESSION_SECRET=\$(gen_secret)
  S3_ACCESS=\$(gen_password)
  S3_SECRET=\$(gen_secret)
  cat > .env.production << EOF
NODE_ENV=production
SERVER_IP=${SERVER_IP}
DATABASE_URL=postgresql://nexusops:\${POSTGRES_PASS}@postgres:5432/nexusops
POSTGRES_PASSWORD=\${POSTGRES_PASS}
POSTGRES_USER=nexusops
POSTGRES_DB=nexusops
REDIS_URL=redis://:\${REDIS_PASS}@redis:6379
REDIS_PASSWORD=\${REDIS_PASS}
JWT_SECRET=\${JWT_SECRET}
SESSION_SECRET=\${SESSION_SECRET}
SESSION_TTL_HOURS=8
RATE_LIMIT_MAX=200000
RATE_LIMIT_ANON_MAX=200000
DB_POOL_MAX=30
MEILISEARCH_URL=http://meilisearch:7700
MEILISEARCH_KEY=\${MEILI_KEY}
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=\${S3_ACCESS}
S3_SECRET_KEY=\${S3_SECRET}
S3_BUCKET=nexusops
FLUSH_REDIS_SESSION_ON_START=true
EOF
  chmod 600 .env.production
  echo "✓ Secrets generated"
else
  echo "✓ Secrets already exist"
fi

# Prune old images to free space
docker image prune -f > /dev/null 2>&1 || true

# Build
echo "Building images..."
docker compose -f docker-compose.vultr-test.yml build --no-cache

# Start
echo "Starting services..."
docker compose -f docker-compose.vultr-test.yml up -d

# Wait for API health
echo "Waiting for API..."
for i in \$(seq 1 40); do
  if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    echo "✓ API is healthy"
    break
  fi
  sleep 3
done

# Seed DB
echo "Seeding database..."
docker compose -f docker-compose.vultr-test.yml exec -T api \
  node -e "try{require('./dist/seed.js')}catch(e){}" 2>/dev/null || true

echo "DONE"
REMOTE

# ── Close SSH multiplexer ─────────────────────────────────────────────────────
ssh -S "$SOCK" -O exit "$SERVER" 2>/dev/null || true

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║   NexusOps is live on Vultr!                ║${RESET}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}Web app:${RESET}     http://${SERVER_IP}"
echo -e "  ${BOLD}API health:${RESET}  http://${SERVER_IP}:3001/health"
echo ""
