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

# ── Change D (PRUNE-PREFLIGHT): guarantee disk room BEFORE the pull/build ─────
# 12 Aug 2026: the root filesystem hit 100% (Docker images from every past deploy
# were never pruned — the old `docker image prune -f` here removed only *dangling*
# layers, never the tagged per-deploy images), which made `compose pull` die
# mid-layer and Postgres fail its healthcheck. Before pulling, read free space on
# the device that actually backs /var/lib/docker (NOT blindly /), and if it is below
# the threshold, prune old images first — then CONTINUE. Never abort: the goal is a
# deploy that succeeds. Figures go to /var/log/coheron/. This block cannot fail the
# deploy (guarded throughout, returns 0, called with `|| true`).
DISK_FREE_MIN_GB=10       # prune when free space on the docker device is below this many GB
PRUNE_RETENTION="168h"    # keep a week of images for rollback (used by Change D and Change E)
preflight_disk_guard() {
  local dir="/var/log/coheron" ts f docker_root avail_kb avail_gb
  ts="$(date +%Y%m%dT%H%M%S)"
  mkdir -p "$dir" 2>/dev/null || { echo "⚠ preflight: cannot create $dir — skipping (deploy continues)"; return 0; }
  f="$dir/disk-preflight-$ts.log"
  docker_root="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || true)"
  [[ -n "$docker_root" ]] || docker_root="/var/lib/docker"
  # df -Pk → 1024-byte blocks (portable), 4th column is available space in KB.
  avail_kb="$(df -Pk "$docker_root" 2>/dev/null | awk 'NR==2 {print $4}')"
  {
    echo "=== disk-preflight $ts  (docker root: $docker_root, threshold ${DISK_FREE_MIN_GB}GB) ==="
    echo "--- df -h $docker_root (before) ---"; df -h "$docker_root" 2>&1 || true
  } >"$f" 2>&1 || echo "⚠ preflight: writing $f errored — continuing"
  if [[ -z "$avail_kb" ]]; then
    echo "⚠ preflight: could not read free space for $docker_root — skipping prune, continuing" | tee -a "$f"
    return 0
  fi
  avail_gb=$(( avail_kb / 1024 / 1024 ))
  if (( avail_gb < DISK_FREE_MIN_GB )); then
    echo "── preflight: ${avail_gb}GB free < ${DISK_FREE_MIN_GB}GB — pruning images older than ${PRUNE_RETENTION} ──" | tee -a "$f"
    # -a removes unused tagged images too (dangling-only never freed the disk);
    # in-use images (the running containers') are protected by Docker regardless.
    docker image prune -af --filter "until=${PRUNE_RETENTION}" 2>&1 | tee -a "$f" || echo "⚠ preflight prune errored — continuing" | tee -a "$f"
    { echo "--- df -h $docker_root (after prune) ---"; df -h "$docker_root" 2>&1 || true; } >>"$f" 2>&1 || true
  else
    echo "── preflight: ${avail_gb}GB free ≥ ${DISK_FREE_MIN_GB}GB — no prune needed ──" | tee -a "$f"
  fi
  return 0
}
preflight_disk_guard || true

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

# ── Change A: capture Postgres evidence BEFORE any recreate ───────────────────
# The healthcheck failure that has needed a manual reboot three times destroys its
# own evidence: a `compose down` removes the container (and its logs) and the
# recovery reboot follows immediately. Dump logs + health + host resources to a
# durable file on the host first. This must NEVER fail the deploy.
capture_postgres_evidence() {
  local dir="/var/log/coheron" ts f cid
  ts="$(date +%Y%m%dT%H%M%S)"
  if ! mkdir -p "$dir" 2>/dev/null; then
    echo "⚠ capture: cannot create $dir — skipping (deploy continues)"; return 0
  fi
  cid="$("${COMPOSE[@]}" ps -q postgres 2>/dev/null || true)"
  f="$dir/pg-predeploy-$ts.log"
  {
    echo "=== pg-predeploy $ts  (container=${cid:-<none>}) ==="
    if [[ -n "$cid" ]]; then
      echo "--- docker inspect .State.Health (the failing check + recent results) ---"
      docker inspect "$cid" --format '{{json .State.Health}}' 2>&1 || true
      echo; echo "--- docker logs postgres ---"
      docker logs "$cid" 2>&1 || true
    else
      echo "(no postgres container present)"
    fi
    echo; echo "--- df -h ---";  df -h  2>&1 || true
    echo; echo "--- free -m ---"; free -m 2>&1 || true
  } >"$f" 2>&1 || echo "⚠ capture: writing $f errored — continuing"
  echo "✓ captured Postgres evidence → $f"
  # Keep the newest ~20 captures so this can never fill the disk.
  ls -1t "$dir"/pg-predeploy-*.log 2>/dev/null | tail -n +21 | while read -r old; do
    rm -f "$old" 2>/dev/null || true
  done
  return 0
}
capture_postgres_evidence || true

# ── Change B: recreate the application tier only — Postgres stays up ───────────
# A blanket `compose down` used to stop Postgres too, and the recreate then raced
# its healthcheck; three deploys in a row needed a manual host reboot. Postgres
# (and Redis/Meilisearch) data does not change between deploys, so they are never
# stopped here — only web/api/caddy/dpdp-sweeper are recreated with the new images.
# The api self-migrates on boot against the already-running Postgres (this compose
# file has no migrator service). NEVER pass -v to anything below.
echo "── data services: ensure up (no teardown, no recreate if unchanged) ──"
"${COMPOSE[@]}" up -d --no-build postgres redis meilisearch

echo "── wait for Postgres health before recreating the app tier ──"
for _ in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T postgres pg_isready -U coheronconnect >/dev/null 2>&1; then
    echo "✓ Postgres ready"; break
  fi
  sleep 2
done

echo "── recreate application services (postgres/redis/meilisearch untouched) ──"
if [[ "$DEPLOY_MODE" == "pull" ]]; then
  # Base compose still defines `build:`; pulled images must be used without rebuilding on VPS.
  "${COMPOSE[@]}" up -d --no-build --no-deps web api caddy dpdp-sweeper
else
  "${COMPOSE[@]}" up -d --no-deps web api caddy dpdp-sweeper
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

# ── Change E (PRUNE-PREFLIGHT): retention prune AFTER a confirmed-good deploy ──
# Only reached on the success path — the version-verify block above `exit 1`s on a
# mismatch, so old images are removed only once the new containers are proven
# running. Keeps a week (${PRUNE_RETENTION}) for rollback; NEVER touches volumes
# (postgres_data); cannot fail the deploy (guarded, returns 0, called with `|| true`).
prune_old_images() {
  local dir="/var/log/coheron" f
  # Append to this run's preflight file if present, else a post-deploy sibling.
  f="$(ls -1t "$dir"/disk-preflight-*.log 2>/dev/null | head -1 || true)"
  [[ -n "$f" ]] || f="$dir/disk-postdeploy-$(date +%Y%m%dT%H%M%S).log"
  echo "── retention prune: removing images older than ${PRUNE_RETENTION} (a week kept for rollback) ──"
  {
    echo "=== retention-prune $(date +%Y%m%dT%H%M%S) ==="
    docker image prune -af --filter "until=${PRUNE_RETENTION}" 2>&1 || echo "⚠ retention prune errored — continuing"
    echo "--- df -h /var/lib/docker (after retention prune) ---"; df -h /var/lib/docker 2>&1 || true
  } >>"$f" 2>&1 || true
  return 0
}
prune_old_images || true

# NO SEED STEP HERE, DELIBERATELY — the base seed resets the org owner's password (packages/db/src/seed.ts) and must never run against a tenant database on deploy. Do not reinstate; guarded by vultr-remote-deploy-no-seed.test.ts.

"${EXEC[@]}" ps
echo "DONE"
