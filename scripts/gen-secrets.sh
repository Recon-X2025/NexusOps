#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# gen-secrets.sh  —  Generate a .env.production file locally
#
# Usage (run from repo root):
#   bash scripts/gen-secrets.sh [server-ip]
#
# Output: .env.production (gitignored)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SERVER_IP="${1:-YOUR_SERVER_IP}"
ENV_FILE=".env.production"

gen_secret()   { openssl rand -base64 48 | tr -d '/+=' | head -c 48; }
gen_password() { openssl rand -base64 32 | tr -d '/+=' | head -c 24; }

if [[ -f "$ENV_FILE" ]]; then
  echo "⚠  $ENV_FILE already exists. Delete it first if you want fresh secrets."
  exit 0
fi

echo "Generating secrets..."

POSTGRES_PASS=$(gen_password)
REDIS_PASS=$(gen_password)
MEILI_KEY=$(gen_secret)
JWT_SECRET=$(gen_secret)
SESSION_SECRET=$(gen_secret)
S3_ACCESS=$(gen_password)
S3_SECRET=$(gen_secret)

cat > "$ENV_FILE" <<EOF
# ── CoheronConnect Production Environment ──────────────────────────────────────────
# Generated on $(date -u +"%Y-%m-%d %H:%M UTC")
# KEEP THIS FILE PRIVATE — it is gitignored and must never be committed.

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
echo "✓ $ENV_FILE created"
echo ""
echo "Next: copy this file to your server:"
echo "  scp .env.production root@${SERVER_IP}:/opt/coheronconnect/.env.production"
