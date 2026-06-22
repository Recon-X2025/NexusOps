#!/usr/bin/env bash
# Class P (closure register Seq 13–16 · 24–37 · 39–44) — program-grade bar:
# L8 `layer8-module-smoke` (incl. §8.50 long-tail + §8.11/33/34/42 depth) +
# Vitest `grc-rbac` · `csm-rbac` · `hr-crm-rbac` · `serial-longtail-rbac` +
# Playwright `module-routes` sweep + dedicated `grc|csm|hr|crm` specs.
# Does not re-run Class L hero packs (use `pnpm test:class-l`).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Class P — Vitest (Layer 8 smoke + P RBAC) =="
pnpm exec dotenv -e .env.test -- pnpm --filter @coheronconnect/api exec vitest run \
  src/__tests__/layer8-module-smoke.test.ts \
  src/__tests__/grc-rbac.test.ts \
  src/__tests__/csm-rbac.test.ts \
  src/__tests__/hr-crm-rbac.test.ts \
  src/__tests__/serial-longtail-rbac.test.ts

echo "== Class P — Playwright (module-routes + GRC/CSM/HR/CRM) =="
pnpm exec dotenv -e .env.test -- pnpm exec playwright test \
  e2e/module-routes.spec.ts \
  e2e/grc.spec.ts \
  e2e/csm.spec.ts \
  e2e/hr.spec.ts \
  e2e/crm.spec.ts \
  --reporter=list

echo "== Class P smoke: OK =="
