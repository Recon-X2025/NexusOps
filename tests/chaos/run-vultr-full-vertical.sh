#!/usr/bin/env bash
# Full chaos vertical against the Vultr deployment: seed → UI (with 10% POST failures) → screenshot → DB row count.
#
# Requires CHAOS_DATABASE_URL to be the SAME PostgreSQL the deployment uses (public host:port or SSH tunnel).
# Do not commit secrets. Example:
#   export CHAOS_DATABASE_URL='postgresql://USER:PASS@localhost:5434/nexusops'
#   export CHAOS_BASE_URL='http://localhost:3000'   # optional; localhost is the default in chaos-config
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -z "${CHAOS_DATABASE_URL:-}" && -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: Set CHAOS_DATABASE_URL (preferred) or DATABASE_URL to the deployment Postgres URL." >&2
  echo "See tests/chaos/CHAOS_SYSTEM_VALIDATION.md — local .env alone is wrong for remote CHAOS_BASE_URL." >&2
  exit 1
fi

pnpm --filter @nexusops/types build
exec pnpm exec playwright test -c tests/chaos/playwright.config.ts "$@"
