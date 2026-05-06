#!/usr/bin/env bash
# One-shot: test Docker stack + migrations + fast API smoke tests.
# DevOps / CI: use before merge or after infra changes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! docker info >/dev/null 2>&1; then
  echo "Error: Docker is not running. Start Docker Desktop (or the Docker daemon) and retry."
  exit 1
fi

echo "==> Starting test stack (Postgres :5433, Redis :6380, Meilisearch :7701)…"
docker compose -f docker-compose.test.yml up -d --wait

echo "==> Applying SQL migrations to coheronconnect_test…"
pnpm exec dotenv -e .env.test -- pnpm --filter @coheronconnect/db db:migrate

echo "==> API smoke: tRPC parity, ticket lifecycle, Layer 1 infrastructure…"
pnpm exec dotenv -e .env.test -- pnpm --filter @coheronconnect/api exec vitest run \
  src/__tests__/trpc-web-parity.test.ts \
  src/__tests__/ticket-lifecycle.test.ts \
  src/__tests__/layer1-infrastructure.test.ts

echo ""
echo "✅ Local test harness is ready."
echo "   Next: pnpm test:stage2  (all API vitest)  or  pnpm test:layer2 … test:layer9"
echo "   Full QA: pnpm test:full-qa"
echo "   Tear down: pnpm docker:test:down"
