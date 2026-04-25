#!/usr/bin/env bash
# =============================================================================
# NexusOps Full-QA Runner
# Default target: local dev (web :3000, API :3001). Override for remote:
#   export NEXUS_QA_BASE_URL=http://your-host
#   export NEXUS_QA_API_URL=http://your-host:3001
# =============================================================================
set -euo pipefail

NEXUS_QA_BASE_URL="${NEXUS_QA_BASE_URL:-http://localhost:3000}"
NEXUS_QA_API_URL="${NEXUS_QA_API_URL:-http://localhost:3001}"
export NEXUS_QA_BASE_URL NEXUS_QA_API_URL

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QA_DIR="$SCRIPT_DIR/full-qa"
RESULTS_DIR="$QA_DIR/results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="$SCRIPT_DIR/NexusOps_QA_Master_${TIMESTAMP}.md"

mkdir -p "$RESULTS_DIR"

log()   { echo -e "\033[1;34m[$(date '+%H:%M:%S')] $*\033[0m"; }
ok()    { echo -e "\033[1;32m[$(date '+%H:%M:%S')] ✅ $*\033[0m"; }
warn()  { echo -e "\033[1;33m[$(date '+%H:%M:%S')] ⚠️  $*\033[0m"; }
error() { echo -e "\033[1;31m[$(date '+%H:%M:%S')] ❌ $*\033[0m"; }

# ── 0. Pre-flight: stack health check ─────────────────────────────────────────
log "0. Pre-flight health check ($NEXUS_QA_BASE_URL / $NEXUS_QA_API_URL)..."
WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${NEXUS_QA_BASE_URL%/}/api/health" || echo "000")
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${NEXUS_QA_API_URL%/}/health" || echo "000")

if [ "$WEB_STATUS" != "200" ]; then
  error "Web not responding (HTTP $WEB_STATUS). Start web + API or set NEXUS_QA_* URLs. Aborting."
  exit 1
fi
if [ "$API_STATUS" != "200" ]; then
  error "API not responding (HTTP $API_STATUS). Aborting."
  exit 1
fi
ok "Target is up — web=$WEB_STATUS api=$API_STATUS"

# ── 1. Install Playwright if needed ──────────────────────────────────────────
log "1. Checking Playwright installation..."
cd "$SCRIPT_DIR"
if ! npx playwright --version &>/dev/null; then
  log "   Installing Playwright + browsers..."
  npm install --save-dev @playwright/test 2>&1 | tail -3
  npx playwright install chromium 2>&1 | tail -5
fi
ok "Playwright ready"

# ── 2. Suite A: Smoke + CRUD ──────────────────────────────────────────────────
log "2. Running Suite A: Smoke + CRUD (all 53 routes + create mutations)..."
SMOKE_EXIT=0
npx playwright test \
  --config="$QA_DIR/playwright.config.ts" \
  --workers=8 \
  "$QA_DIR/00-smoke-crud.spec.ts" \
  --reporter=json \
  --output="$RESULTS_DIR/smoke-artifacts" \
  2>&1 | tee "$RESULTS_DIR/smoke-output.txt" || SMOKE_EXIT=$?

if [ "$SMOKE_EXIT" -eq 0 ]; then
  ok "Suite A PASSED"
else
  warn "Suite A had failures (exit $SMOKE_EXIT) — continuing..."
fi
SMOKE_STATUS=$( [ "$SMOKE_EXIT" -eq 0 ] && echo "PASS" || echo "FAIL($SMOKE_EXIT)" )

# ── 2b. Suite A2: E2E build-plan (outcome-based create→read + UI flows) ─────
log "2b. Running Suite A2: E2E build-plan (08-e2e-build-plan)..."
E2E_PLAN_EXIT=0
npx playwright test \
  --config="$QA_DIR/playwright.config.ts" \
  --workers=2 \
  "$QA_DIR/08-e2e-build-plan.spec.ts" \
  --reporter=json \
  --output="$RESULTS_DIR/e2e-plan-artifacts" \
  2>&1 | tee "$RESULTS_DIR/e2e-plan-output.txt" || E2E_PLAN_EXIT=$?

if [ "$E2E_PLAN_EXIT" -eq 0 ]; then
  ok "Suite A2 (E2E build-plan) PASSED"
else
  warn "Suite A2 had failures (exit $E2E_PLAN_EXIT) — continuing..."
fi
E2E_PLAN_STATUS=$( [ "$E2E_PLAN_EXIT" -eq 0 ] && echo "PASS" || echo "FAIL($E2E_PLAN_EXIT)" )

# ── 3. Suite B: Auth + RBAC ──────────────────────────────────────────────────
log "3. Running Suite B: Auth + RBAC + Session Security..."
AUTH_EXIT=0
npx playwright test \
  --config="$QA_DIR/playwright.config.ts" \
  --workers=4 \
  "$QA_DIR/01-auth-rbac.spec.ts" \
  --reporter=json \
  --output="$RESULTS_DIR/auth-artifacts" \
  2>&1 | tee "$RESULTS_DIR/auth-output.txt" || AUTH_EXIT=$?

if [ "$AUTH_EXIT" -eq 0 ]; then
  ok "Suite B PASSED"
else
  warn "Suite B had failures (exit $AUTH_EXIT) — continuing..."
fi
AUTH_STATUS=$( [ "$AUTH_EXIT" -eq 0 ] && echo "PASS" || echo "FAIL($AUTH_EXIT)" )

# ── 4. Suite C: Form Validation ───────────────────────────────────────────────
log "4. Running Suite C: Form Validation + XSS + SQL Injection..."
FORMS_EXIT=0
npx playwright test \
  --config="$QA_DIR/playwright.config.ts" \
  --workers=6 \
  "$QA_DIR/02-forms-validation.spec.ts" \
  --reporter=json \
  --output="$RESULTS_DIR/forms-artifacts" \
  2>&1 | tee "$RESULTS_DIR/forms-output.txt" || FORMS_EXIT=$?

if [ "$FORMS_EXIT" -eq 0 ]; then
  ok "Suite C PASSED"
else
  warn "Suite C had failures (exit $FORMS_EXIT) — continuing..."
fi
FORMS_STATUS=$( [ "$FORMS_EXIT" -eq 0 ] && echo "PASS" || echo "FAIL($FORMS_EXIT)" )

# ── 5. Suite D: Chaos v2 (30 workers, destructive) ───────────────────────────
log "5. Running Suite D: Chaos v2 — 30 workers × 25 iterations (this takes ~15min)..."
CHAOS_EXIT=0
npx playwright test \
  --config="$QA_DIR/playwright.config.ts" \
  --workers=30 \
  --timeout=180000 \
  "$QA_DIR/03-chaos-v2.spec.ts" \
  --reporter=json \
  --output="$RESULTS_DIR/chaos-artifacts" \
  2>&1 | tee "$RESULTS_DIR/chaos-output.txt" || CHAOS_EXIT=$?

if [ "$CHAOS_EXIT" -eq 0 ]; then
  ok "Suite D PASSED"
else
  warn "Suite D had failures (exit $CHAOS_EXIT) — continuing..."
fi
CHAOS_STATUS=$( [ "$CHAOS_EXIT" -eq 0 ] && echo "PASS" || echo "FAIL($CHAOS_EXIT)" )

# ── 6. Suite E: k6 API Stress ────────────────────────────────────────────────
log "6. Running Suite E: k6 API Stress (150 VUs sustained, 300 spike)..."
K6_EXIT=0
K6_STATUS="SKIPPED"
if command -v k6 &>/dev/null; then
  k6 run \
    --out json="$RESULTS_DIR/k6-raw.json" \
    "$QA_DIR/04-api-stress.js" \
    2>&1 | tee "$RESULTS_DIR/k6-output.txt" || K6_EXIT=$?
  K6_STATUS=$( [ "$K6_EXIT" -eq 0 ] && echo "PASS" || echo "FAIL($K6_EXIT)" )
  if [ "$K6_EXIT" -eq 0 ]; then ok "Suite E PASSED"; else warn "Suite E had failures"; fi
else
  warn "k6 not installed — skipping API stress test"
fi

# ── 7. Post-chaos health check ────────────────────────────────────────────────
log "7. Post-chaos health check..."
sleep 5
WEB_POST=$(curl -s -o /dev/null -w "%{http_code}" "${NEXUS_QA_BASE_URL%/}/api/health" || echo "000")
API_POST=$(curl -s -o /dev/null -w "%{http_code}" "${NEXUS_QA_API_URL%/}/health" || echo "000")
if [ "$WEB_POST" = "200" ] && [ "$API_POST" = "200" ]; then
  ok "Post-chaos: target still healthy ✅"
  POST_HEALTH="HEALTHY"
else
  error "Post-chaos: target degraded! web=$WEB_POST api=$API_POST"
  POST_HEALTH="DEGRADED (web=$WEB_POST api=$API_POST)"
fi

# ── 8. Aggregate chaos results ────────────────────────────────────────────────
TOTAL_CRASHES=0
TOTAL_XSS=0
TOTAL_SESSION_BYPASSES=0
TOTAL_MUTATIONS_OK=0
TOTAL_MUTATIONS_FAILED=0

if ls "$RESULTS_DIR"/chaos-worker-*.json &>/dev/null 2>&1; then
  for f in "$RESULTS_DIR"/chaos-worker-*.json; do
    CRASHES=$(python3 -c "import json; d=json.load(open('$f')); print(len(d.get('crashes',[])))" 2>/dev/null || echo 0)
    XSS=$(python3 -c "import json; d=json.load(open('$f')); print(len(d.get('xssReflected',[])))" 2>/dev/null || echo 0)
    BYPASS=$(python3 -c "import json; d=json.load(open('$f')); print(1 if d.get('sessionBypassOk') else 0)" 2>/dev/null || echo 0)
    MOK=$(python3 -c "import json; d=json.load(open('$f')); print(d.get('mutationsOk',0))" 2>/dev/null || echo 0)
    MFAIL=$(python3 -c "import json; d=json.load(open('$f')); print(d.get('mutationsFailed',0))" 2>/dev/null || echo 0)
    TOTAL_CRASHES=$((TOTAL_CRASHES + CRASHES))
    TOTAL_XSS=$((TOTAL_XSS + XSS))
    TOTAL_SESSION_BYPASSES=$((TOTAL_SESSION_BYPASSES + BYPASS))
    TOTAL_MUTATIONS_OK=$((TOTAL_MUTATIONS_OK + MOK))
    TOTAL_MUTATIONS_FAILED=$((TOTAL_MUTATIONS_FAILED + MFAIL))
  done
fi

# ── 9. Parse Playwright pass/fail counts ─────────────────────────────────────
parse_counts() {
  local file=$1
  local passed=0 failed=0 skipped=0
  if [ -f "$file" ]; then
    passed=$(grep -oP '"passed":\s*\K\d+' "$file" 2>/dev/null | head -1 || echo 0)
    failed=$(grep -oP '"failed":\s*\K\d+' "$file" 2>/dev/null | head -1 || echo 0)
    skipped=$(grep -oP '"skipped":\s*\K\d+' "$file" 2>/dev/null | head -1 || echo 0)
  fi
  echo "$passed $failed $skipped"
}

# ── 10. Generate master report ────────────────────────────────────────────────
log "10. Generating master QA report..."

cat > "$REPORT_FILE" << REPORT_EOF
# NexusOps — Full-Stack QA Master Report

**Date:** $(date '+%B %d, %Y — %H:%M:%S UTC')
**Run ID:** $TIMESTAMP
**Target:** $NEXUS_QA_BASE_URL (web) / $NEXUS_QA_API_URL (API)
**Tester:** Automated Full-QA Suite v2

---

## Executive Summary

| Suite | Scope | Result |
|-------|-------|--------|
| A — Smoke + CRUD | 53 routes × navigation + 14 CRUD mutations | $SMOKE_STATUS |
| A2 — E2E build-plan | Outcome-based API chains + recruitment/HR/analytics UI | $E2E_PLAN_STATUS |
| B — Auth + RBAC | Login validation, session security, API bypass | $AUTH_STATUS |
| C — Form Validation | XSS, SQL injection, oversized input, modal lifecycle | $FORMS_STATUS |
| D — Chaos v2 | 30 workers × 25 iterations × all 53 routes | $CHAOS_STATUS |
| E — API Stress | k6: 150 VUs sustained, 300 VU spike | $K6_STATUS |

**Post-chaos target health:** $POST_HEALTH

---

## Chaos v2 Aggregate Metrics (30 Workers)

| Metric | Count |
|--------|-------|
| React/JS crashes detected | $TOTAL_CRASHES |
| XSS reflected in page | $TOTAL_XSS |
| Session bypass successes | $TOTAL_SESSION_BYPASSES |
| Destructive mutations succeeded | $TOTAL_MUTATIONS_OK |
| Destructive mutations failed | $TOTAL_MUTATIONS_FAILED |

---

## Suite D — Chaos Worker Detail

$(
  echo "| Worker | Login | Iterations | Crashes | XSS | Session Bypass | Mutations OK | Mutations Failed | UI Freezes | Console Errors |"
  echo "|--------|-------|-----------|---------|-----|----------------|-------------|------------------|------------|----------------|"
  if ls "$RESULTS_DIR"/chaos-worker-*.json &>/dev/null 2>&1; then
    for f in $(ls "$RESULTS_DIR"/chaos-worker-*.json | sort -V); do
      python3 - "$f" << 'PYEOF'
import json, sys
d = json.load(open(sys.argv[1]))
w = d.get('worker', '?')
login = '✅' if d.get('loginOk') else '❌'
iters = d.get('iterations', 0)
crashes = len(d.get('crashes', []))
xss = len(d.get('xssReflected', []))
bypass = '⚠️ YES' if d.get('sessionBypassOk') else '✅ No'
mok = d.get('mutationsOk', 0)
mfail = d.get('mutationsFailed', 0)
freezes = len(d.get('uiFreezes', []))
cons = len(d.get('consoleErrors', []))
print(f"| {w} | {login} | {iters} | {crashes} | {xss} | {bypass} | {mok} | {mfail} | {freezes} | {cons} |")
PYEOF
    done
  else
    echo "| — | No worker results found | | | | | | | | |"
  fi
)

---

## Suite A — Smoke Test Results

\`\`\`
$(tail -50 "$RESULTS_DIR/smoke-output.txt" 2>/dev/null || echo "No output captured")
\`\`\`

---

## Suite B — Auth + RBAC Results

\`\`\`
$(tail -50 "$RESULTS_DIR/auth-output.txt" 2>/dev/null || echo "No output captured")
\`\`\`

---

## Suite C — Form Validation Results

\`\`\`
$(tail -50 "$RESULTS_DIR/forms-output.txt" 2>/dev/null || echo "No output captured")
\`\`\`

---

## Suite E — k6 API Stress Results

\`\`\`
$(tail -40 "$RESULTS_DIR/k6-output.txt" 2>/dev/null || echo "k6 not run or no output")
\`\`\`

---

## Crash Inventory (from Chaos Workers)

$(
  if ls "$RESULTS_DIR"/chaos-worker-*.json &>/dev/null 2>&1; then
    python3 - "$RESULTS_DIR" << 'PYEOF'
import json, os, sys
results_dir = sys.argv[1]
all_crashes = []
for f in sorted(os.listdir(results_dir)):
    if f.startswith('chaos-worker-') and f.endswith('.json'):
        try:
            d = json.load(open(os.path.join(results_dir, f)))
            for c in d.get('crashes', []):
                all_crashes.append(f"- **Worker {d['worker']}:** {c}")
        except: pass
if all_crashes:
    print('\n'.join(all_crashes))
else:
    print('No crashes detected across all 30 workers ✅')
PYEOF
  else
    echo "No chaos results available"
  fi
)

---

## Failed Navigation Inventory

$(
  if ls "$RESULTS_DIR"/chaos-worker-*.json &>/dev/null 2>&1; then
    python3 - "$RESULTS_DIR" << 'PYEOF'
import json, os, sys
results_dir = sys.argv[1]
all_navfails = []
for f in sorted(os.listdir(results_dir)):
    if f.startswith('chaos-worker-') and f.endswith('.json'):
        try:
            d = json.load(open(os.path.join(results_dir, f)))
            for n in d.get('failedNavs', [])[:3]:  # top 3 per worker
                all_navfails.append(f"- **W{d['worker']}:** {n}")
        except: pass
if all_navfails:
    print('\n'.join(all_navfails[:50]))  # cap at 50
else:
    print('No failed navigations ✅')
PYEOF
  else
    echo "No chaos results available"
  fi
)

---

## Security Findings

| Check | Result |
|-------|--------|
| XSS reflection across all 30 workers | $([ "$TOTAL_XSS" -eq 0 ] && echo "✅ 0 instances (SAFE)" || echo "🔴 $TOTAL_XSS instances (CRITICAL)") |
| Session bypass after cookie clear | $([ "$TOTAL_SESSION_BYPASSES" -eq 0 ] && echo "✅ 0 bypasses (SAFE)" || echo "🔴 $TOTAL_SESSION_BYPASSES bypasses (CRITICAL)") |
| SQL error messages in API responses | See Suite C results |
| Unauthenticated API access | See Suite B results |

---

## Post-Run System Vitals

$(
  if [ -n "${VULTR_SSH:-}" ]; then
    ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$VULTR_SSH" '
    echo "### Container Status"
    echo ""
    docker ps --format "| {{.Names}} | {{.Status}} |"
    echo ""
    echo "### System Load"
    uptime
    echo ""
    echo "### Memory"
    free -h | grep Mem
    echo ""
    echo "### Disk"
    df -h / | tail -1
  ' 2>/dev/null || echo "Could not fetch server vitals (SSH failed for ${VULTR_SSH})"
  else
    echo "*Remote vitals skipped — set **VULTR_SSH** (e.g. root@your.server) to collect Docker status after the run.*"
  fi
)

---

*Report generated by NexusOps Full-QA Runner v2 at $(date '+%Y-%m-%d %H:%M:%S UTC')*
REPORT_EOF

ok "Master report written → $REPORT_FILE"

# ── Final summary ─────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  NexusOps Full-QA Complete"
echo "════════════════════════════════════════════════════════════════"
echo "  Suite A (Smoke+CRUD):      $SMOKE_STATUS"
echo "  Suite A2 (E2E build-plan): $E2E_PLAN_STATUS"
echo "  Suite B (Auth+RBAC):       $AUTH_STATUS"
echo "  Suite C (Forms+Security):  $FORMS_STATUS"
echo "  Suite D (Chaos v2):        $CHAOS_STATUS"
echo "  Suite E (k6 Stress):       $K6_STATUS"
echo "  Post-chaos health:         $POST_HEALTH"
echo "────────────────────────────────────────────────────────────────"
echo "  Crashes detected:          $TOTAL_CRASHES"
echo "  XSS reflected:             $TOTAL_XSS"
echo "  Session bypasses:          $TOTAL_SESSION_BYPASSES"
echo "────────────────────────────────────────────────────────────────"
echo "  Master report:  $REPORT_FILE"
echo "════════════════════════════════════════════════════════════════"

# Exit non-zero if any hard failures
OVERALL_EXIT=0
[ "$TOTAL_XSS" -gt 0 ] && OVERALL_EXIT=1
[ "$TOTAL_SESSION_BYPASSES" -gt 0 ] && OVERALL_EXIT=1
[ "$POST_HEALTH" != "HEALTHY" ] && OVERALL_EXIT=1

exit $OVERALL_EXIT
