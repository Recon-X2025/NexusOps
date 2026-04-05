#!/usr/bin/env bash
# =============================================================================
# NexusOps — localhost brutal Playwright run (full platform UI smoke)
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Playwright treats any CI value as "do not reuse webServer" — brutal localhost must attach to existing dev servers.
unset CI || true
export CI=""

export NEXUS_LOCAL_BASE_URL="${NEXUS_LOCAL_BASE_URL:-http://localhost:3000}"
export DATABASE_URL="${DATABASE_URL:-postgresql://nexusops_test:nexusops_test@localhost:5433/nexusops_test}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6380}"

if [[ "${DOCKER_TEST_UP:-}" == "1" ]]; then
  echo "→ Starting test Postgres/Redis (docker-compose.test.yml)..."
  pnpm docker:test:up
fi

echo "→ Playwright brutal suite (config: tests/local-brutal/playwright.config.ts)"
echo "   Base URL: $NEXUS_LOCAL_BASE_URL"
echo "   Tip: SKIP_LOCAL_BRUTAL_WEBSERVER=1 if web+api already running"
echo "   Tip: SKIP_LOCAL_BRUTAL_DB=1 to skip db push/seed in global setup"
echo ""

exec pnpm exec playwright test --config="$ROOT/tests/local-brutal/playwright.config.ts" "$@"
