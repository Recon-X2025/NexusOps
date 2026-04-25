#!/usr/bin/env bash
# Class L (register Seq 1–12, 17–23, 38) — API depth + RBAC Vitest + hero Playwright C4 specs.
# Excludes Class P-only RBAC: grc-rbac, csm-rbac, hr-crm-rbac, serial-longtail-rbac.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Class L — Vitest (Layer 8 + RBAC) =="
pnpm exec dotenv -e .env.test -- pnpm --filter @nexusops/api exec vitest run \
  src/__tests__/layer8-module-smoke.test.ts \
  src/__tests__/changes-rbac.test.ts \
  src/__tests__/work-orders-rbac.test.ts \
  src/__tests__/knowledge-catalog-rbac.test.ts \
  src/__tests__/approvals-rbac.test.ts \
  src/__tests__/notifications-rbac.test.ts \
  src/__tests__/reports-dashboard-rbac.test.ts \
  src/__tests__/admin-rbac.test.ts \
  src/__tests__/auth-rbac.test.ts \
  src/__tests__/security-rbac.test.ts \
  src/__tests__/legal-governance-rbac.test.ts \
  src/__tests__/finance-procurement-rbac.test.ts \
  src/__tests__/finance-sequence-21-23-rbac.test.ts

echo "== Class L — Playwright (dedicated C4 specs) =="
pnpm exec dotenv -e .env.test -- pnpm exec playwright test \
  e2e/changes.spec.ts \
  e2e/work-orders.spec.ts \
  e2e/knowledge.spec.ts \
  e2e/catalog.spec.ts \
  e2e/approvals.spec.ts \
  e2e/notifications.spec.ts \
  e2e/search.spec.ts \
  e2e/reports.spec.ts \
  e2e/dashboard.spec.ts \
  e2e/admin.spec.ts \
  e2e/auth.spec.ts \
  e2e/security.spec.ts \
  e2e/legal-governance.spec.ts \
  e2e/finance-procurement.spec.ts \
  e2e/finance-sequence-21-23.spec.ts \
  --reporter=list

echo "== Class L smoke: OK =="
