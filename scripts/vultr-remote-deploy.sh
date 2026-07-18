#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Run on the Vultr host (e.g. after rsync) from /opt/coheronconnect.
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

cd /opt/coheronconnect

if [[ ! -f .env.production ]]; then
  echo "ERROR: .env.production missing in /opt/coheronconnect" >&2
  exit 1
fi

# GitHub Actions can pass GHCR_TOKEN / GHCR_USERNAME for docker login; preserve if .env overwrites or omits them.
_CI_GHCR_TOKEN="${GHCR_TOKEN:-}"
_CI_GHCR_USER="${GHCR_USERNAME:-}"
# PII_HASH_PEPPER (DPDP) may be injected by CI when the host .env.production lacks it.
# Preserve a non-empty CI value over an empty/absent one in the file.
_CI_PII_PEPPER="${PII_HASH_PEPPER:-}"

set -a
# shellcheck disable=SC1091
source .env.production
set +a

[[ -n "$_CI_GHCR_TOKEN" ]] && export GHCR_TOKEN="$_CI_GHCR_TOKEN"
[[ -n "$_CI_GHCR_USER" ]] && export GHCR_USERNAME="$_CI_GHCR_USER"
[[ -n "$_CI_PII_PEPPER" ]] && export PII_HASH_PEPPER="$_CI_PII_PEPPER"

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

# Compose handle for exec/ps — same file set as the up/pull above. The api port
# (3001) is NOT published to the host (only caddy exposes 80/443), so all probes
# must run *inside* the network via `compose exec`, not host curl.
if [[ "$DEPLOY_MODE" == "pull" ]]; then
  EXEC=(docker compose --env-file .env.production -f docker-compose.vultr-test.yml -f docker-compose.vultr.images.yml)
else
  EXEC=(docker compose --env-file .env.production -f docker-compose.vultr-test.yml)
fi

echo "── wait API health ──"
HEALTH_BODY=""
for _ in $(seq 1 60); do
  if HEALTH_BODY="$("${EXEC[@]}" exec -T api wget -qO- http://127.0.0.1:3001/health 2>/dev/null)"; then
    echo "✓ API healthy"
    break
  fi
  sleep 2
done

# ── verify the running container is the commit we just deployed ───────────────
# A stale container answers /health perfectly, so health alone is not proof.
# When deploying an immutable 7-hex SHA tag, assert /health.version matches it.
EXPECT_VERSION="${EXPECT_VERSION:-}"
if [[ "$EXPECT_VERSION" =~ ^[0-9a-f]{7,40}$ ]]; then
  LIVE_VERSION="$(printf '%s' "$HEALTH_BODY" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')"
  echo "── verify version: expected=${EXPECT_VERSION} live=${LIVE_VERSION:-<none>} ──"
  # Image tag is the short (7-char) SHA; GIT_SHA baked in is the full SHA.
  if [[ -z "$LIVE_VERSION" || "$LIVE_VERSION" != "$EXPECT_VERSION"* ]]; then
    echo "✗ DEPLOY FAILED: running container reports '${LIVE_VERSION:-<none>}', expected '${EXPECT_VERSION}'." >&2
    echo "  The new image did not start (stale container still running). Investigate before retrying." >&2
    exit 1
  fi
  echo "✓ version verified — running the deployed commit"
else
  echo "⚠ EXPECT_VERSION='${EXPECT_VERSION}' is not an immutable SHA — skipping version assertion."
fi

echo "── seed (best-effort; API already runs migrate on start) ──"
"${EXEC[@]}" exec -T api node -e "try{require('./dist/seed.js')}catch(e){console.error(e)}" 2>/dev/null || true

"${EXEC[@]}" ps
echo "DONE"
