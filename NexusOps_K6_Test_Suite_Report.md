# NexusOps k6 Test Suite — Design & Execution Report

**Document ID:** NEXOPS-PERF-002  
**Version:** 1.0  
**Date:** March 27, 2026  
**Author:** Performance Engineering  
**Classification:** Internal — Engineering  
**Related Documents:** NexusOps_Load_Test_Report_2026.md, NexusOps_Technical_Requirements_Document.md

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Under Test](#2-system-under-test)
3. [Test Suite Architecture](#3-test-suite-architecture)
4. [File Reference](#4-file-reference)
5. [Test Design — Detailed Specifications](#5-test-design--detailed-specifications)
   - 5.1 config.js
   - 5.2 auth_stress.js
   - 5.3 chaos_flow.js
   - 5.4 race_condition.js
   - 5.5 rate_limit.js
   - 5.6 invalid_payload.js
   - 5.7 run_all.js
6. [Installation & Prerequisites](#6-installation--prerequisites)
7. [Execution Guide](#7-execution-guide)
8. [Expected Baselines & Pass/Fail Criteria](#8-expected-baselines--passfail-criteria)
9. [Metrics Reference](#9-metrics-reference)
10. [Findings & Recommendations](#10-findings--recommendations)
11. [Revision History](#11-revision-history)

---

## 1. Executive Summary

This document describes the design rationale, execution procedure, and expected outcomes for the NexusOps k6 performance and reliability test suite located at `/tests/k6/`. The suite was engineered to validate seven distinct reliability dimensions of the NexusOps backend (Fastify + tRPC + PostgreSQL + Redis) under conditions ranging from controlled authentication stress to deliberate race-condition induction and adversarial payload injection.

### Suite Objectives

| # | Objective | Test Script |
|---|-----------|-------------|
| 1 | Validate authentication subsystem throughput and session isolation | `auth_stress.js` |
| 2 | Validate end-to-end user workflow under concurrent load | `chaos_flow.js` |
| 3 | Detect write-contention bugs and data-loss under concurrent updates | `race_condition.js` |
| 4 | Characterise rate-limiter behaviour and verify system stability under throttling | `rate_limit.js` |
| 5 | Verify API robustness against malformed, adversarial, and edge-case inputs | `invalid_payload.js` |
| 6 | Provide a single orchestrated pass over all scenarios | `run_all.js` |
| 7 | Provide shared constants, helpers, and utilities | `config.js` |

### Key Design Principles

- **No token reuse** — each virtual user (VU) authenticates independently. Session isolation bugs will surface.
- **No destructive operations** — no deletes, no schema changes, no DB wipes. All tests are safe to run against a live development database.
- **Graceful degradation validation** — the suite tests not only happy paths but also error paths (wrong credentials, invalid enums, unauthenticated access), verifying that the system rejects bad input cleanly without leaking internals.
- **Placeholder-first** — all credentials and IDs are clearly marked as placeholders to prevent accidental use of production data.
- **Real user simulation** — randomised sleep (0.5s–2s) models actual human think-time to produce realistic request distributions.

---

## 2. System Under Test

| Component | Technology | Notes |
|-----------|-----------|-------|
| API Server | Fastify + tRPC | Running on `localhost:3001` |
| Frontend | Next.js | Running on `localhost:3000` (browser tests only) |
| Database | PostgreSQL | Managed by Drizzle ORM |
| Cache / Sessions | Redis | Session tokens stored here |
| Auth | Custom session-based | `auth.login` → `sessionId` bearer token |
| Multi-tenancy | Org-scoped RBAC | Rate limits are per (user, org, endpoint) |
| Rate Limiter | Sliding window | 60 req/min per user per endpoint |

### tRPC Response Envelope

All tRPC responses follow one of two shapes:

```json
// Success
{ "result": { "data": { ... } } }

// Error
{ "error": { "message": "...", "data": { "code": "UNAUTHORIZED", "httpStatus": 401 } } }
```

The `parseTrpc(res)` helper in `config.js` normalises both shapes into `{ data, error }`.

---

## 3. Test Suite Architecture

```
tests/k6/
├── config.js          ← Shared constants, helpers, login utility
├── auth_stress.js     ← Authentication volume and session creation stress
├── chaos_flow.js      ← Full user journey under concurrent load
├── race_condition.js  ← Write contention on a single entity
├── rate_limit.js      ← Rate limiter characterisation
├── invalid_payload.js ← Adversarial input validation
└── run_all.js         ← Parallel scenario orchestration
```

### Dependency Graph

```
auth_stress.js  ──┐
chaos_flow.js   ──┤
race_condition.js ┤──→ config.js
rate_limit.js   ──┤
invalid_payload.js┤
run_all.js      ──┘
```

All test files import from `config.js`. No circular dependencies.

### Data Flow

```
k6 engine
  │
  ├── setup()          ← One-time: authenticate all VUs, return tokens
  │     └── login()    ← config.js helper, calls auth.login
  │
  ├── default(data)    ← Called N times per VU
  │     ├── authHeaders(token)   ← injects Bearer header
  │     ├── parseTrpc(res)       ← unwraps response envelope
  │     └── randomSleep()        ← 0.5–2s think-time
  │
  └── handleSummary(data) ← Post-run: print custom metric summary
```

---

## 4. File Reference

### 4.1 config.js

**Purpose:** Central shared configuration and utility module. Import from every other script.

| Export | Type | Description |
|--------|------|-------------|
| `BASE_URL` | `string` | tRPC base URL, overridable via env var |
| `TEST_USERS` | `array` | 20 load-test user credentials (placeholders) |
| `ADMIN_USER` | `object` | Admin credentials for single-user tests |
| `TEST_TICKET_ID` | `string` | UUID placeholder for race condition test |
| `DEFAULT_OPTIONS` | `object` | Shared k6 options (thresholds, tags) |
| `JSON_HEADERS` | `object` | `Content-Type: application/json` |
| `authHeaders(token)` | `function` | Returns headers with Bearer token |
| `login(email, pass)` | `function` | Authenticates and returns token, throws on failure |
| `randomSleep(min, max)` | `function` | Randomised think-time pause |
| `parseTrpc(res)` | `function` | Unwraps tRPC envelope → `{ data, error, raw }` |
| `userForVU(vuIndex)` | `function` | Round-robin VU→user assignment |

### 4.2 auth_stress.js

**Purpose:** Validate the authentication subsystem under high concurrent login volume.

| Property | Value |
|----------|-------|
| VU count | Ramp 0→50 over 30s, sustain 1m |
| Duration | ~1m 45s total |
| Token reuse | None — each iteration logs in fresh |
| Checks | 200 status, sessionId present, bad-pw rejected, missing-email rejected, logout success |
| Custom metrics | `auth_login_success`, `auth_login_failure`, `auth_login_duration_ms`, `auth_logout_duration_ms` |
| Thresholds | Login p(95) < 800ms, HTTP errors < 2% |

**Test cases per iteration:**
1. Valid login → verify token → logout
2. Login with wrong password → verify UNAUTHORIZED error
3. Login with missing email → verify BAD_REQUEST / PARSE_ERROR

### 4.3 chaos_flow.js

**Purpose:** End-to-end user journey simulation with per-VU isolation.

| Property | Value |
|----------|-------|
| VU count | 30 constant |
| Duration | 3 minutes |
| Steps per iteration | login → list → create → update → relist → logout |
| Token reuse | No — each VU logs in per iteration |
| Checks | Each step validated individually; created ticket appears in relist |
| Custom metrics | `chaos_workflow_completed`, `chaos_workflow_failed`, `chaos_ticket_create_success_rate`, `chaos_end_to_end_ms` |
| Thresholds | Ticket create success > 95%, end-to-end p(95) < 5s |

**User journey per iteration:**

```
[VU N] login → tickets.list (count=C) → tickets.create (id=X)
     → tickets.update(id=X, status=in_progress)
     → tickets.list (verify X visible)
     → logout
```

### 4.4 race_condition.js

**Purpose:** Detect write-contention bugs by having 20 VUs simultaneously update the same ticket.

| Property | Value |
|----------|-------|
| VU count | 20 concurrent writers (Phase 1), 10 writers + 10 readers (Phase 2) |
| Duration | Phase 1: 1m, Phase 2: 1m (starts at 1m10s) |
| Target entity | `TEST_TICKET_ID` — must be set via env var |
| Checks | No 500s, no hangs, structured response on every update |
| Custom metrics | `race_update_success`, `race_update_conflict`, `race_update_error`, `race_no_data_loss` |
| Thresholds | HTTP errors < 5%, 500s = 0, data loss rate < 2% |

**Contention pattern:**

| VU | Status set |
|----|-----------|
| 0 | `open` |
| 1 | `in_progress` |
| 2 | `pending` |
| 3 | `resolved` |
| 4 | `open` (cycles) |
| … | … |

This creates maximum write-contention where every commit may conflict with the previous one.

**Acceptable outcomes:**
- HTTP 200 (update applied) ✅
- HTTP 409 (optimistic-locking conflict, if implemented) ✅
- HTTP 500 ❌ — indicates a concurrency bug

### 4.5 rate_limit.js

**Purpose:** Characterise rate-limiter behaviour and verify system stability under throttling.

| Property | Value |
|----------|-------|
| Phase 1 (storm) | 1 VU, 30s, no sleep → trips 429 |
| Phase 3 (recovery) | 1 VU, 30s, starts at 1m40s → confirms reset |
| Phase 4 (multi-user) | 5 VUs, 30s, each own token → should all succeed |
| Custom metrics | `rate_limit_429_hits`, `rate_limit_rejection_rate`, `rate_limit_server_errors`, `rate_limit_recovery_success`, `rate_limit_cross_user_throttle` |
| Critical assertion | `cross_user_throttle == 0` (cross-user throttle is a bug) |

**Phase timeline:**

```
0s ─────────────── 30s        100s ─────────────── 130s    140s ── 170s
[storm phase]      [60s gap]   [recovery phase]             [multi-user]
  429s expected                  200s expected               200s expected
```

**What a passing result looks like:**
- Storm phase: high 429 rate (expected and desired)
- Recovery phase: 200s return (rate limit window reset)
- Multi-user phase: 0 cross-user 429s (each user in own bucket)

### 4.6 invalid_payload.js

**Purpose:** Verify the API rejects all malformed input without leaking internal information.

| Property | Value |
|----------|-------|
| VU count | 1 (sequential, not concurrent) |
| Duration | 3 minutes |
| Test categories | 5 categories, 20+ individual bad-input cases |
| Checks | No 500, rejection via error envelope, no stack trace in response body |
| Custom metrics | `invalid_unexpected_500`, `invalid_stack_leak`, `invalid_correct_rejection_rate` |
| Hard thresholds | `unexpected_500 == 0`, `stack_leak == 0`, rejection rate > 95% |

**Test category overview:**

| Category | Description | Cases |
|----------|-------------|-------|
| A | auth.login bad inputs | 7 (empty, null, type-error, oversized, SQL-injection, null-bytes, array body) |
| B | tickets.create bad inputs | 7 (missing title, bad enum, type confusion, oversized title, prototype pollution, deep nesting) |
| C | tickets.update bad inputs | 4 (non-UUID id, non-existent UUID, missing id, invalid enum) |
| D | Transport malformation | 4 (form-encoded, truncated JSON, empty body, binary garbage) |
| E | Unauthenticated access | 4 (no header, invalid token, empty bearer, wrong scheme) |

**Stack-leak detection** scans response bodies for:
- JavaScript stack frame strings (`at Object.`, `at Module.`)
- File path fragments (`/src/`)
- ORM/DB identifiers (`pg_`, `drizzle`)
- String literal `"stacktrace"`

### 4.7 run_all.js

**Purpose:** Single-command execution of all scenarios in parallel with staggered start times.

| Scenario | VUs | Duration | Start time |
|----------|-----|----------|-----------|
| `auth_stress` | 0→30 ramp | 1m35s | 0s |
| `chaos_flow` | 20 | 3m | 0s |
| `invalid_payloads` | 1 | 2m | 10s |
| `rate_limit_storm` | 1 | 30s | 3m |
| `race_condition` | 20 | 1m | 4m |
| `soak_read` | 50 | 2m | 5m |

**Total wall-clock time:** ~7 minutes

**Global thresholds in run_all.js:**

| Metric | Threshold | Rationale |
|--------|-----------|-----------|
| `http_req_duration p(95)` | < 2000ms | All endpoints, all scenarios |
| `http_req_failed` | < 15% | Relaxed because storm phase intentionally trips 429s |
| `all_bad_input_rejection_rate` | > 95% | Near-perfect rejection rate |
| `all_errors` | < 10 | Absolute cap on unexpected 500s |
| `all_login_ms p(95)` | < 1000ms | Login must stay fast under load |

---

## 5. Test Design — Detailed Specifications

### 5.1 Authentication Model

All tests use the following authentication flow:

```
POST /trpc/auth.login
Body: { "email": "<user>", "password": "<pass>" }

Response: { "result": { "data": { "sessionId": "<uuid>" } } }

All subsequent requests:
  Authorization: Bearer <sessionId>
```

Session tokens are obtained in `setup()` so the measurement phase only includes business logic, not auth overhead (except in `auth_stress.js` which specifically measures auth).

### 5.2 tRPC GET Request Encoding

tRPC query procedures are called via HTTP GET with `input` as a URL-encoded JSON query parameter:

```
GET /trpc/tickets.list?input=%7B%7D
                              ^^^
                       encodeURIComponent("{}")
```

### 5.3 VU Isolation Strategy

| Script | Token assignment |
|--------|----------------|
| `auth_stress.js` | Per-iteration fresh login (no token reuse) |
| `chaos_flow.js` | Per-iteration fresh login |
| `race_condition.js` | `setup()` tokens distributed by `vuIndex % tokens.length` |
| `rate_limit.js` | Storm: single admin token; multi-user: `vuIndex % 5` |
| `invalid_payload.js` | Single shared admin token (writes are minimal) |
| `run_all.js` | `setup()` tokens pre-distributed per scenario |

### 5.4 Randomised Think-Time Distribution

```
randomSleep(min=0.5, max=2.0)

Uniform distribution: sleep = 0.5 + random() × 1.5

Expected mean: ~1.25 s between requests
Effective max RPS per VU: ~0.8 req/s
At 30 VUs: ~24 req/s aggregate (well within server capacity)
```

---

## 6. Installation & Prerequisites

### 6.1 Install k6

**macOS (Homebrew):**
```bash
brew install k6
```

**Linux (Debian/Ubuntu):**
```bash
sudo gpg -k
sudo gpg --no-default-keyring \
    --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
    --keyserver hkp://keyserver.ubuntu.com:80 \
    --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] \
    https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

**Verify installation:**
```bash
k6 version
# Expected: k6 v0.50.0 or newer
```

### 6.2 Seed Test Users

Before running load tests, create the 20 required test users:

```bash
# Ensure the API is running
curl http://localhost:3001/trpc/health

# Run the existing seeder (creates loadtest0–loadtest199)
k6 run --vus 1 --iterations 1 seed_users.js
```

Alternatively, seed only the first 20 users needed by the suite:

```bash
node -e "
const http = require('http');
for (let i = 0; i < 20; i++) {
  const body = JSON.stringify({
    email: \`loadtest\${i}@test.com\`,
    password: 'Test1234!',
    name: \`Load User \${i}\`,
    orgName: \`LoadTestOrg\${i}\`
  });
  const req = http.request({
    hostname: 'localhost', port: 3001,
    path: '/trpc/auth.signup', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }
  });
  req.write(body);
  req.end();
}
"
```

### 6.3 Obtain a TEST_TICKET_ID

For `race_condition.js`, find an existing ticket UUID:

```bash
# Via API (requires valid token)
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3001/trpc/tickets.list?input={}" \
  | python3 -m json.tool | grep '"id"' | head -1
```

Set it as an environment variable before running:
```bash
export TEST_TICKET_ID=<paste-uuid-here>
```

---

## 7. Execution Guide

### 7.1 Recommended Execution Order

Run scripts in this sequence when running individually:

```
Step 1: invalid_payload.js   ← No auth stress, validates input safety first
Step 2: auth_stress.js       ← Validate auth subsystem in isolation
Step 3: rate_limit.js        ← Characterise rate limiter
Step 4: chaos_flow.js        ← Full user journey
Step 5: race_condition.js    ← Concurrent write test (requires TEST_TICKET_ID)
Step 6: run_all.js           ← Full suite (after individual tests pass)
```

### 7.2 Individual Script Commands

```bash
# 1. Input validation (safe to run first, minimal load)
k6 run tests/k6/invalid_payload.js

# 2. Authentication stress
k6 run tests/k6/auth_stress.js

# 3. Rate limiter characterisation
k6 run tests/k6/rate_limit.js

# 4. Chaos flow (full journey)
k6 run tests/k6/chaos_flow.js

# 5. Race condition (provide a real ticket UUID)
k6 run -e TEST_TICKET_ID=<uuid> tests/k6/race_condition.js

# 6. Full suite
k6 run \
  -e BASE_URL=http://localhost:3001/trpc \
  -e TEST_TICKET_ID=<uuid> \
  tests/k6/run_all.js
```

### 7.3 Override Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `BASE_URL` | `http://localhost:3001/trpc` | API base URL |
| `ADMIN_EMAIL` | `admin@coheron.com` | Admin user for single-user tests |
| `ADMIN_PASSWORD` | `demo1234!` | Admin password |
| `TEST_TICKET_ID` | `PLACEHOLDER_TICKET_UUID` | Target ticket for race condition test |

**Example with all overrides:**
```bash
k6 run \
  -e BASE_URL=http://localhost:3001/trpc \
  -e ADMIN_EMAIL=admin@coheron.com \
  -e ADMIN_PASSWORD=demo1234! \
  -e TEST_TICKET_ID=550e8400-e29b-41d4-a716-446655440000 \
  tests/k6/run_all.js
```

### 7.4 Output Interpretation

k6 prints a real-time progress bar and a summary table at the end. Look for:

```
✓ checks.........................: 98.23%
✗ checks.........................: 1.77%  ← count of failed assertions

http_req_duration............: avg=234ms p(50)=180ms p(95)=620ms p(99)=1100ms
http_req_failed..............: 0.00%
```

Scripts emit additional console output from `handleSummary()` with scenario-specific breakdowns.

### 7.5 Saving Results to JSON

```bash
k6 run --out json=results/auth_stress_$(date +%Y%m%d_%H%M).json \
  tests/k6/auth_stress.js
```

---

## 8. Expected Baselines & Pass/Fail Criteria

These baselines assume a healthy local development environment (MacBook Pro / Linux workstation, API and DB on same machine).

### 8.1 auth_stress.js

| Metric | Expected | Pass threshold |
|--------|----------|----------------|
| HTTP error rate | < 0.5% | < 2% |
| Login p(50) | < 200ms | — |
| Login p(95) | < 600ms | < 800ms |
| Login p(99) | < 1200ms | — |
| Wrong-password rejection rate | 100% | 100% |
| Missing-field rejection rate | 100% | 100% |
| Logout success rate | > 99% | — |

### 8.2 chaos_flow.js

| Metric | Expected | Pass threshold |
|--------|----------|----------------|
| Workflow completion rate | > 98% | > 95% |
| Ticket create success rate | > 97% | > 95% |
| End-to-end p(95) | < 3s | < 5s |
| HTTP error rate | < 1% | < 2% |

### 8.3 race_condition.js

| Metric | Expected | Pass threshold |
|--------|----------|----------------|
| 500 errors | 0 | 0 |
| Update success + conflict | 100% | 100% |
| Read data-loss rate | 0% | < 2% |
| p(95) request duration | < 2s | < 3s |

### 8.4 rate_limit.js

| Metric | Expected | Pass threshold |
|--------|----------|----------------|
| 429s during storm phase | > 50 | — |
| 500s at any phase | 0 | < 5 |
| Recovery 200s | > 10 | > 5 |
| Cross-user throttle events | 0 | 0 |

### 8.5 invalid_payload.js

| Metric | Expected | Pass threshold |
|--------|----------|----------------|
| Unexpected 500s | 0 | 0 |
| Stack trace leaks | 0 | 0 |
| Correct rejection rate | > 98% | > 95% |
| p(95) response time | < 500ms | < 2000ms |

### 8.6 run_all.js (full suite)

| Metric | Expected | Pass threshold |
|--------|----------|----------------|
| p(95) all requests | < 1.5s | < 2s |
| HTTP error rate | < 8% (storm 429s included) | < 15% |
| Bad input rejection rate | > 98% | > 95% |
| Unexpected 500s | 0 | < 10 |
| Login p(95) | < 700ms | < 1000ms |

---

## 9. Metrics Reference

### 9.1 Standard k6 Metrics

| Metric | Description |
|--------|-------------|
| `http_reqs` | Total number of HTTP requests made |
| `http_req_duration` | Request round-trip time (avg, p50, p95, p99) |
| `http_req_failed` | Rate of requests with HTTP status >= 400 (or network errors) |
| `http_req_blocked` | Time blocked waiting for a free TCP connection slot |
| `http_req_connecting` | Time establishing a new TCP connection |
| `http_req_tls_handshaking` | TLS handshake duration |
| `http_req_sending` | Time uploading request body |
| `http_req_waiting` | Time from first byte sent to first byte received (TTFB) |
| `http_req_receiving` | Time downloading response body |
| `vus` | Current number of active VUs |
| `vus_max` | Peak VU count |
| `iterations` | Total number of default() function calls |
| `iteration_duration` | Time for one complete default() iteration |
| `checks` | Pass/fail rate of k6 check() assertions |

### 9.2 Custom Metrics (per script)

#### auth_stress.js

| Metric | Type | Description |
|--------|------|-------------|
| `auth_login_success` | Counter | Successful logins (token received) |
| `auth_login_failure` | Counter | Failed logins (no token) |
| `auth_login_duration_ms` | Trend | Login RTT in milliseconds |
| `auth_logout_duration_ms` | Trend | Logout RTT in milliseconds |

#### chaos_flow.js

| Metric | Type | Description |
|--------|------|-------------|
| `chaos_workflow_completed` | Counter | Full 6-step flows completed |
| `chaos_workflow_failed` | Counter | Flows aborted (login failure) |
| `chaos_ticket_create_success_rate` | Rate | % of create calls that succeed |
| `chaos_end_to_end_ms` | Trend | Full flow duration (login to logout) |

#### race_condition.js

| Metric | Type | Description |
|--------|------|-------------|
| `race_update_success` | Counter | Updates that returned 200 |
| `race_update_conflict` | Counter | Updates that returned 409 (optimistic lock) |
| `race_update_error` | Counter | Updates that returned 500 |
| `race_no_data_loss` | Rate | Reads returning valid structured data |

#### rate_limit.js

| Metric | Type | Description |
|--------|------|-------------|
| `rate_limit_429_hits` | Counter | 429 responses received |
| `rate_limit_rejection_rate` | Rate | % of requests that were rate-limited |
| `rate_limit_server_errors` | Counter | 500 responses during limiter test |
| `rate_limit_recovery_success` | Counter | 200s received during recovery phase |
| `rate_limit_cross_user_throttle` | Counter | 429s received by users in isolated buckets (must be 0) |

#### invalid_payload.js

| Metric | Type | Description |
|--------|------|-------------|
| `invalid_unexpected_500` | Counter | 5xx responses on bad input |
| `invalid_stack_leak` | Counter | Responses containing internal stack traces |
| `invalid_correct_rejection_rate` | Rate | % of bad inputs correctly rejected |

#### run_all.js

| Metric | Type | Description |
|--------|------|-------------|
| `all_workflows_completed` | Counter | Chaos flow completions |
| `all_errors` | Counter | All unexpected 500s across all scenarios |
| `all_login_ms` | Trend | Login duration across all scenarios |
| `all_end_to_end_ms` | Trend | End-to-end flow duration (chaos scenario) |
| `all_bad_input_rejection_rate` | Rate | Combined bad-input rejection rate |
| `all_rate_limit_429s` | Counter | 429s triggered in storm scenario |

### 9.3 Key Percentiles to Watch

| Percentile | Meaning | Action if breached |
|------------|---------|-------------------|
| p(50) / median | Half of requests faster than this | Baseline health check |
| p(90) | 9 in 10 requests faster | SLO boundary |
| **p(95)** | **Primary SLO percentile** | **Alert if > 2000ms** |
| p(99) | Tail latency | Investigate for timeouts, DB locks |
| p(99.9) | Extreme outliers | Database connection exhaustion, GC pauses |

---

## 10. Findings & Recommendations

> This section will be populated after the first test suite execution. The items below are pre-run recommendations based on system design analysis.

### 10.1 Pre-Run Observations

#### Observation 1: Rate-Limit Bucket Granularity
The NexusOps rate limiter operates per `(userId, orgId, endpoint)`. This is correctly scoped and prevents cross-tenant throttle interference. The `rate_limit.js` multi-user phase validates this.

**Recommendation:** Verify the sliding window resets at exactly 60 seconds in the recovery phase. If recovery takes longer than 65s, the window implementation may be using a fixed window (not sliding), which can cause bursty behaviour at window boundaries.

#### Observation 2: Session Token Lifespan
The existing `test.js` scripts (from NexusOps_Load_Test_Report_2026.md) demonstrated that sessions survive 2+ minute load tests without expiry. If session TTL is shorter than the `chaos_flow.js` 3-minute duration, workflows will fail mid-iteration.

**Recommendation:** Confirm session TTL ≥ 10 minutes, or modify `chaos_flow.js` to re-authenticate if a 401 is received.

#### Observation 3: Concurrent Write Safety
The `race_condition.js` test was designed to surface missing database-level locking. If `tickets.update` does not use row-level locks (e.g., `SELECT ... FOR UPDATE`), concurrent updates to the same row may produce inconsistent results.

**Recommendation:** Review `tickets.update` handler for use of transactions and row-level locks before running `race_condition.js`.

#### Observation 4: Input Validation Library
The `invalid_payload.js` test targets Zod schema validation (inferred from the tRPC + Zod stack). Zod throws on extra fields only when `.strict()` is used. Without it, prototype pollution fields (`__proto__`, `constructor`) will be silently stripped.

**Recommendation:** The test passes if the server does not 500 — silent strip is acceptable. However, B6 (prototype pollution) should ideally return `BAD_REQUEST` rather than `200` with stripped body.

#### Observation 5: PostgreSQL Connection Pool
At 50 VUs (soak_read scenario in `run_all.js`), the system will generate approximately 40 req/s. Verify the PostgreSQL connection pool (typically configured via `pg.Pool` or Drizzle's pool config) is sized to handle this without connection exhaustion.

**Recommendation:** Set `max_connections` ≥ 25 in the pool config. Watch `http_req_blocked` metric — if it rises above 50ms, the pool is saturated.

### 10.2 Post-Run Template

After each test execution, fill in this table:

| Script | Date | VUs | Duration | p(95) | Error Rate | Status |
|--------|------|-----|----------|-------|------------|--------|
| `auth_stress.js` | | 50 | 1m45s | TBD | TBD | TBD |
| `chaos_flow.js` | | 30 | 3m | TBD | TBD | TBD |
| `race_condition.js` | | 20 | 2m | TBD | TBD | TBD |
| `rate_limit.js` | | 1/5 | 3m | TBD | TBD | TBD |
| `invalid_payload.js` | | 1 | 3m | TBD | TBD | TBD |
| `run_all.js` | | 50 peak | 7m | TBD | TBD | TBD |

---

## 11. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-27 | Performance Engineering | Initial test suite creation and report. All 7 scripts authored from scratch. Covers auth stress, chaos flow, race conditions, rate limiting, invalid payload probing, and full orchestration. |

---

*NexusOps — Performance Engineering Division*  
*This document is intended for internal engineering use. Do not distribute externally.*
