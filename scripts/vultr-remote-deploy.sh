#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Run on the Vultr host (e.g. after rsync) from /opt/nexusops.
#
# Env (typical — set in shell or .env.production):
#   DEPLOY_MODE           pull | build   (default: pull)
#   NEXUSOPS_WEB_IMAGE    full ref for web when DEPLOY_MODE=pull
#   NEXUSOPS_API_IMAGE    full ref for api when DEPLOY_MODE=pull
#   GHCR_USERNAME / GHCR_TOKEN   optional; if set, logs in to ghcr.io before pull
#
# Compose: docker-compose.vultr-test.yml [+ docker-compose.vultr.images.yml when pull]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd /opt/nexusops

if [[ ! -f .env.production ]]; then
  echo "ERROR: .env.production missing in /opt/nexusops" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.production
set +a

# Compose expects POSTGRES_PASSWORD; .env may only define DATABASE_URL.
if [[ -z "${POSTGRES_PASSWORD:-}" && -n "${DATABASE_URL:-}" ]]; then
  POSTGRES_PASSWORD="$(python3 -c "import os,re;from urllib.parse import unquote;u=os.environ.get('DATABASE_URL','');m=re.search(r'postgresql://[^:]+:([^@]+)@',u) or re.search(r'postgres://[^:]+:([^@]+)@',u);print(unquote(m.group(1)) if m else '')")"
  export POSTGRES_PASSWORD
fi

DEPLOY_MODE="${DEPLOY_MODE:-pull}"

if [[ -n "${GHCR_TOKEN:-}" ]]; then
  echo "── docker login ghcr.io ──"
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USERNAME:-oauth2}" --password-stdin
fi

docker image prune -f >/dev/null 2>&1 || true

if [[ "$DEPLOY_MODE" == "pull" ]]; then
  : "${NEXUSOPS_WEB_IMAGE:?NEXUSOPS_WEB_IMAGE is required when DEPLOY_MODE=pull}"
  : "${NEXUSOPS_API_IMAGE:?NEXUSOPS_API_IMAGE is required when DEPLOY_MODE=pull}"
  export NEXUSOPS_WEB_IMAGE NEXUSOPS_API_IMAGE
  COMPOSE=(docker compose --env-file .env.production -f docker-compose.vultr-test.yml -f docker-compose.vultr.images.yml)
  echo "── docker compose pull (web, api) ──"
  "${COMPOSE[@]}" pull web api
elif [[ "$DEPLOY_MODE" == "build" ]]; then
  COMPOSE=(docker compose --env-file .env.production -f docker-compose.vultr-test.yml)
  echo "── docker compose build ──"
  if [[ "${NO_CACHE:-}" == "1" ]]; then
    "${COMPOSE[@]}" build --parallel --no-cache web api
  else
    "${COMPOSE[@]}" build --parallel web api
  fi
else
  echo "ERROR: DEPLOY_MODE must be pull or build, got: $DEPLOY_MODE" >&2
  exit 1
fi

echo "── docker compose down (remove orphans) ──"
"${COMPOSE[@]}" down --remove-orphans || true

echo "── docker compose up ──"
if [[ "$DEPLOY_MODE" == "pull" ]]; then
  # Base compose still defines `build:`; pulled images must be used without rebuilding on VPS.
  "${COMPOSE[@]}" up -d --no-build
else
  "${COMPOSE[@]}" up -d
fi

echo "── wait API health ──"
for _ in $(seq 1 60); do
  if curl -sf http://127.0.0.1:3001/health >/dev/null 2>&1; then
    echo "✓ API healthy"
    break
  fi
  sleep 2
done

echo "── seed (best-effort; API already runs migrate on start) ──"
if [[ "$DEPLOY_MODE" == "pull" ]]; then
  EXEC=(docker compose --env-file .env.production -f docker-compose.vultr-test.yml -f docker-compose.vultr.images.yml)
else
  EXEC=(docker compose --env-file .env.production -f docker-compose.vultr-test.yml)
fi
"${EXEC[@]}" exec -T api node -e "try{require('./dist/seed.js')}catch(e){console.error(e)}" 2>/dev/null || true

"${EXEC[@]}" ps
echo "DONE"
