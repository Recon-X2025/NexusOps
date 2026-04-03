# STRESS_TEST_CRITICAL_FAILURES.md

**Generated:** 2026-04-03T02:41:59.551Z
**Target:** `http://139.84.154.78` (Frontend) + `http://139.84.154.78:3001` (API)
**Agent:** Autonomous Chaos Engineering Agent v2 — Principal Software Resilience Architect
**Test Scope:** Auth bypass, IDOR, input validation, concurrency/race, DB integrity, workflow attacks, API destruction

---

## Executive Summary

| Severity | Count | Description |
|---|---|---|
| 🔴 CRITICAL | 1 | System crashes, auth bypass, data corruption |
| 🟠 HIGH     | 2 | Major instability, workflow failure, injection |
| 🟡 MEDIUM   | 4 | Recoverable issues, validation gaps |
| 🔵 LOW      | 0 | Minor issues |
| **TOTAL**   | **7** | |

---

## 🔴 CRITICAL (1 findings)

### 🔴 F-001: Non-admin user can access admin procedure: admin.users.list

- **Severity:** CRITICAL
- **Category:** SECURITY
- **Endpoint/Feature:** `/trpc/admin.users.list`
- **Payload Used:** `victim session`
- **Observed Behavior:** HTTP 200
- **Expected Behavior:** 403 FORBIDDEN
- **Root Cause Hypothesis:** Admin guard missing on this procedure

---

## 🟠 HIGH (2 findings)

### 🟠 F-002: Stored XSS: script/event tags returned unsanitized in ticket response

- **Severity:** HIGH
- **Category:** SECURITY
- **Endpoint/Feature:** `/trpc/tickets.create`
- **Payload Used:** `title: <script>alert('XSS')</script>`
- **Observed Behavior:** Response contains: <script>alert('XSS')</script>
- **Expected Behavior:** HTML entities escaped in response
- **Root Cause Hypothesis:** No server-side HTML sanitization; if frontend renders as innerHTML, stored XSS executes

### 🟠 F-003: System health degraded post-chaos: DEGRADED

- **Severity:** HIGH
- **Category:** STABILITY
- **Endpoint/Feature:** `/internal/health`
- **Payload Used:** `GET`
- **Observed Behavior:** status=DEGRADED, reasons=["Latency elevated on /trpc/tickets.create: avg 1350.4ms — threshold 1000ms"]
- **Expected Behavior:** HEALTHY after test completes
- **Root Cause Hypothesis:** Active health monitor detects error spike or latency regression from chaos load

---

## 🟡 MEDIUM (4 findings)

### 🟡 F-004: Sensitive endpoint accessible without authentication: /internal/metrics

- **Severity:** MEDIUM
- **Category:** SECURITY
- **Endpoint/Feature:** `http://139.84.154.78:3001/internal/metrics`
- **Payload Used:** `GET (no auth)`
- **Observed Behavior:** HTTP 200 — {"since":"2026-04-03T00:50:06.878Z","timestamp":"2026-04-03T02:41:17.012Z","tota
- **Expected Behavior:** 401 Unauthorized or 404 Not Found
- **Root Cause Hypothesis:** Internal observability endpoint lacks auth middleware; exposes metrics, health state, error rates to unauthenticated callers
- **Reproduction Steps:**
  ```
  curl http://139.84.154.78:3001/internal/metrics
  ```

### 🟡 F-005: Sensitive endpoint accessible without authentication: /internal/health

- **Severity:** MEDIUM
- **Category:** SECURITY
- **Endpoint/Feature:** `http://139.84.154.78:3001/internal/health`
- **Payload Used:** `GET (no auth)`
- **Observed Behavior:** HTTP 200 — {"status":"HEALTHY","reasons":[],"summary":{"error_rate":0.0032,"total_requests"
- **Expected Behavior:** 401 Unauthorized or 404 Not Found
- **Root Cause Hypothesis:** Internal observability endpoint lacks auth middleware; exposes metrics, health state, error rates to unauthenticated callers
- **Reproduction Steps:**
  ```
  curl http://139.84.154.78:3001/internal/health
  ```

### 🟡 F-006: FK violation causes 500: assigneeId=non-existent

- **Severity:** MEDIUM
- **Category:** DATA_INTEGRITY
- **Endpoint/Feature:** `/trpc/tickets.create`
- **Payload Used:** `{"title":"FK_ASSIGNEE","assigneeId":"00000000-0000-0000-0000-000000000001"}`
- **Observed Behavior:** HTTP 500 — FK constraint error
- **Expected Behavior:** 400 BAD_REQUEST
- **Root Cause Hypothesis:** FK constraint violation bubbles as unhandled 500 rather than user-facing validation error

### 🟡 F-007: FK violation causes 500: teamId=non-existent

- **Severity:** MEDIUM
- **Category:** DATA_INTEGRITY
- **Endpoint/Feature:** `/trpc/tickets.create`
- **Payload Used:** `{"title":"FK_TEAM","teamId":"00000000-0000-0000-0000-000000000001"}`
- **Observed Behavior:** HTTP 500 — FK constraint error
- **Expected Behavior:** 400 BAD_REQUEST
- **Root Cause Hypothesis:** FK constraint violation bubbles as unhandled 500 rather than user-facing validation error

---

## Live Execution Log (last 60 lines)
```
[2026-04-03T02:41:37.593Z]     100 ok | 0 rl | 0 overload | 0 err | 0 net-fail | p95=936ms total=943ms
[2026-04-03T02:41:39.595Z]   Ramp: 300× concurrent tickets.create…
[2026-04-03T02:41:41.931Z]     300 ok | 0 rl | 0 overload | 0 err | 0 net-fail | p95=2303ms total=2336ms
[2026-04-03T02:41:43.932Z]   Ramp: 500× concurrent tickets.create…
[2026-04-03T02:41:54.440Z]     499 ok | 0 rl | 0 overload | 0 err | 1 net-fail | p95=3222ms total=10508ms
[2026-04-03T02:41:56.441Z]   7b. 300× burst on unprotected /internal/metrics…
[2026-04-03T02:41:56.844Z]   /internal/metrics 300×: 300 ok | 0 fail
[2026-04-03T02:41:56.844Z]   7c. Admin/hidden endpoint probe (authenticated)…
[2026-04-03T02:41:56.884Z]   /trpc/admin.getAllUsers: 404
[2026-04-03T02:41:56.928Z]   /trpc/admin.getSystemSettings: 404
[2026-04-03T02:41:57.006Z]   /trpc/admin.listOrganizations: 404
[2026-04-03T02:41:57.060Z]   /trpc/admin.impersonateUser: 404
[2026-04-03T02:41:57.115Z]   /trpc/admin.deleteOrganization: 404
[2026-04-03T02:41:57.115Z]   7d. Search/filter injection…
[2026-04-03T02:41:57.548Z] 
══════════════════════════════════════════
[2026-04-03T02:41:57.548Z]   PHASE 8: DATABASE INTEGRITY ATTACKS
[2026-04-03T02:41:57.548Z] ══════════════════════════════════════════
[2026-04-03T02:41:57.638Z]   8a. Concurrent ops on ticket 3f8673d2…
[2026-04-03T02:41:57.712Z]   ✓ Concurrent mixed ops: 0 errors
[2026-04-03T02:41:57.712Z]   8b. Invalid state machine transitions…
[2026-04-03T02:41:57.887Z]   8c. Orphaned foreign key references…
[2026-04-03T02:41:57.947Z]   🟡 [MEDIUM] FK violation causes 500: assigneeId=non-existent
[2026-04-03T02:41:58.002Z]   🟡 [MEDIUM] FK violation causes 500: teamId=non-existent
[2026-04-03T02:41:58.070Z]   8d. Create-delete-read race condition…
[2026-04-03T02:41:58.209Z]   ✓ Phantom race: 0 errors
[2026-04-03T02:41:58.209Z] 
══════════════════════════════════════════
[2026-04-03T02:41:58.209Z]   PHASE 9: WORKFLOW & CROSS-SYSTEM ATTACKS
[2026-04-03T02:41:58.209Z] ══════════════════════════════════════════
[2026-04-03T02:41:58.209Z]   9a. Workflow list + concurrent trigger…
[2026-04-03T02:41:58.269Z]   Workflows list: HTTP 200
[2026-04-03T02:41:58.269Z]   Workflows found: 0
[2026-04-03T02:41:58.269Z]   9b. Approval workflow manipulation…
[2026-04-03T02:41:58.329Z]   My pending approvals: HTTP 200
[2026-04-03T02:41:58.329Z]   9c. Notification storm (50× simultaneous notifications read)…
[2026-04-03T02:41:58.472Z]   9d. Probing all module procedures (RBAC gaps)…
[2026-04-03T02:41:58.525Z]   surveys.create: 405
[2026-04-03T02:41:58.585Z]   events.list: 200
[2026-04-03T02:41:58.627Z]   oncall.schedules.list: 200
[2026-04-03T02:41:58.664Z]   walkup.requests.list: 404
[2026-04-03T02:41:58.725Z]   grc.list: 404
[2026-04-03T02:41:58.774Z]   legal.contracts.list: 404
[2026-04-03T02:41:58.816Z]   crm.accounts.list: 404
[2026-04-03T02:41:58.816Z] 
══════════════════════════════════════════
[2026-04-03T02:41:58.816Z]   PHASE 10: ADAPTIVE ESCALATION
[2026-04-03T02:41:58.816Z] ══════════════════════════════════════════
[2026-04-03T02:41:58.816Z]   Current findings: 1 CRITICAL, 1 HIGH
[2026-04-03T02:41:58.816Z]   Escalating: 500-concurrent burst + replay attacks…
[2026-04-03T02:41:59.431Z]   500× tickets.list: 60 ok | 440 rl | 0 ov | 0 err | 0 fail
[2026-04-03T02:41:59.432Z]   p50=457ms p95=580ms p99=614ms max=615ms
[2026-04-03T02:41:59.432Z]   Replay attack: use session after logout…
[2026-04-03T02:41:59.480Z] 
  POST-CHAOS HEALTH CHECK…
[2026-04-03T02:41:59.548Z]   Health: HTTP 200
[2026-04-03T02:41:59.548Z]   Status: DEGRADED
[2026-04-03T02:41:59.548Z]   In-flight: {"in_flight":-647,"max_in_flight":500}
[2026-04-03T02:41:59.548Z]   Error rate: 0.0025
[2026-04-03T02:41:59.548Z]   p99 latency: undefinedms
[2026-04-03T02:41:59.549Z]   🟠 [HIGH] System health degraded post-chaos: DEGRADED
[2026-04-03T02:41:59.549Z] 
══════════════════════════════════════════
[2026-04-03T02:41:59.549Z]   CHAOS COMPLETE — GENERATING REPORT
[2026-04-03T02:41:59.549Z] ══════════════════════════════════════════
```