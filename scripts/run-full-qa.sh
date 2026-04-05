#!/bin/bash
set -e

echo "=========================================="
echo "NexusOps Full QA Suite — 10 Layer Execution"
echo "=========================================="

# Step 1: Start test infrastructure
echo "🐳 Starting test infrastructure..."
docker compose -f docker-compose.test.yml up -d --wait
echo "✅ Postgres, Redis, Meilisearch running"

# Step 2: Load test env
export $(cat .env.test | grep -v '^#' | xargs)

# Step 3: Apply schema
echo "📋 Applying database schema..."
pnpm --filter @nexusops/db db:push
echo "✅ Schema applied"

# Step 4: Seed data (for E2E)
echo "🌱 Seeding demo data..."
pnpm --filter @nexusops/db db:seed || echo "⚠️  db:seed not found — skipping"
echo "✅ Seed step complete"

# Step 5: Run Layer 1-9 (API tests)
echo ""
echo "=========================================="
echo "Running API Tests (Layers 1-9)"
echo "=========================================="
echo ""

FAILED=false

for i in $(seq 1 9); do
  echo "--- Layer $i ---"
  pnpm --filter @nexusops/api exec vitest run --reporter=verbose "src/__tests__/layer${i}*" || {
    echo "❌ Layer $i FAILED"
    FAILED=true
  }
  echo ""
done

echo "--- tRPC web ↔ API procedure parity (not in layer glob) ---"
pnpm --filter @nexusops/api exec vitest run --reporter=verbose src/__tests__/trpc-web-parity.test.ts || {
  echo "❌ tRPC web/API parity FAILED"
  FAILED=true
}
echo ""

# Step 6: Run Layer 10 (E2E)
echo "=========================================="
echo "Running E2E Tests (Layer 10)"
echo "=========================================="
echo ""

pnpm exec playwright test --reporter=list || {
  echo "❌ Layer 10 (E2E) FAILED"
  FAILED=true
}

# Step 7: Report
echo ""
echo "=========================================="
if [ "$FAILED" = true ]; then
  echo "❌ QA SUITE: FAILURES DETECTED"
  echo "Review output above for failing tests."
  echo "=========================================="
  exit 1
else
  echo "✅ QA SUITE: ALL LAYERS PASSED"
  echo "Platform is PRODUCTION READY."
  echo "=========================================="
  exit 0
fi
