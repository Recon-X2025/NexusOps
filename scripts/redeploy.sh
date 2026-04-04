#!/usr/bin/env bash
# NexusOps — quick redeploy to Vultr via rsync + docker compose
# Run from project root:  bash scripts/redeploy.sh
# Requires: sshpass installed locally

set -euo pipefail

SERVER="root@139.84.154.78"
SSH_PASS='{mP3g}w]WQwS+g%?'
REMOTE_DIR="/opt/nexusops"
COMPOSE="docker-compose.prod.yml"

echo "▶ Syncing code to Vultr ($SERVER)…"
sshpass -p "$SSH_PASS" rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'dist' \
  --exclude '.git' \
  --exclude '.env.production' \
  --exclude '.env.local' \
  --exclude '*.md' \
  --exclude '.DS_Store' \
  -e "ssh -o StrictHostKeyChecking=no" \
  ./ ${SERVER}:${REMOTE_DIR}/

echo "▶ Building & restarting web + api containers…"
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SERVER" bash <<REMOTE
  set -euo pipefail
  cd ${REMOTE_DIR}
  echo "── Building images ──────────────────────────"
  docker compose -f ${COMPOSE} build --no-cache web api

  echo "── Restarting containers ────────────────────"
  docker compose -f ${COMPOSE} up -d --no-deps web api

  echo "── Waiting for API health ───────────────────"
  for i in \$(seq 1 20); do
    sleep 5
    if curl -sf http://127.0.0.1:3001/health >/dev/null 2>&1; then
      echo "✅ API healthy"
      break
    fi
    echo "   still starting… (\${i}/20)"
  done

  echo "── Container status ─────────────────────────"
  docker ps --format 'table {{.Names}}\t{{.Status}}'

  echo ""
  echo "✅ NexusOps redeployed successfully"
  echo "   Web:  http://139.84.154.78"
  echo "   API:  http://139.84.154.78:3001/health"
REMOTE
