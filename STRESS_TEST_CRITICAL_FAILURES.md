# STRESS_TEST_CRITICAL_FAILURES.md

**Generated:** 2026-04-03T02:50:00.000Z  
**Target:** `http://139.84.154.78` (Frontend) + `http://139.84.154.78:3001` (API)  
**Agent:** Autonomous Chaos Engineering Agent v2 — Principal Software Resilience Architect  
**Methodology:** 10-phase agentic loop — DISCOVER → ATTACK → ANALYZE → ADAPT → ESCALATE → REPEAT  
**Iterations:** 2 full passes + targeted verification  
**Total Requests Fired:** ~5,200+  
**Total Findings:** 8  

---

## Executive Summary

| Severity | Count | Focus Areas |
|---|---|---|
| 🔴 CRITICAL | 0 | No full bypass/corruption confirmed |
| 🟠 HIGH | 3 | XSS storage, session management, concurrency gate failure |
| 🟡 MEDIUM | 4 | FK errors, unauthenticated internals, rate limit false positives |
| 🔵 LOW | 1 | Operational data disclosure |
| **TOTAL** | **8** | |

**System under test held well against most attacks.** Auth token tampering (13 vectors), SQL injection (5 vectors), IDOR cross-org reads, idempotency under 50-concurrent load, mass assignment, and deeply-nested JSON DoS all passed with zero breaches. Three significant vulnerabilities were confirmed requiring immediate remediation.

---

## What Held Strong ✅

| Test | Concurrency | Result |
|---|---|---|
| Token tampering (13 variants) | Sequential | All 13 rejected — 0 bypasses |
| SQL injection in login (5 payloads) | Sequential | All rejected — 0 bypasses |
| IDOR cross-org ticket read | N/A | Org-scoping correct — 404 returned |
| IDOR cross-org ticket write | N/A | Org-scoping correct — 404 returned |
| Idempotency race (50-concurrent, same key) | 50× | 1 unique ID — perfect deduplication |
| Concurrent updates on same ticket | 30× | 0 errors — no serialization failure |
| Mass assignment (orgId override) | N/A | Server-side orgId correctly enforced |
| Deeply nested JSON (1000 levels) | N/A | Returns 400, not 500 |
| Login storm (20-concurrent same user) | 20× | 0 server errors |
| Type confusion inputs (10 variants) | Sequential | All returned 4xx — 0 server errors |
| Prototype pollution | 2 variants | Sanitized — no 500 |
| Concurrent signup (10 orgs) | 10× | All 200 — no errors |
| Concurrent DB race + phantom read | 6× | 0 errors |
| Login rate limit trigger | 8 attempts | Triggers at attempt 6 ✓ |
| Session invalidation after logout | Manual | Correctly rejected ✓ |
| API load ramp (100× concurrent creates) | 100× | 100/100 success, p95=936ms |
| API load ramp (300× concurrent creates) | 300× | 0 server errors |
| Body limit enforcement | 1.1MB, 2MB, 10MB | All 413 ✓ |

---

## System Performance Under Load

| Concurrency | Outcome | p95 Latency | Notes |
|---|---|---|---|
| 10× tickets.create | 10/10 ok | ~244ms | Baseline healthy |
| 50× tickets.create | 49/50 ok | ~852ms | 1 network timeout at 10.3s |
| 100× tickets.create | 100/100 ok | 936ms | Excellent |
| 300× tickets.create | ~300/300 ok | ~1350ms avg | Elevated, flagged by health monitor |
| 500× tickets.list | 60 ok / 440 rate-limited | p99=614ms | Rate limiter correctly shedding load |
| 510× tickets.create (max concurrency) | 510/510 ok | — | Rate limiter absorbed all load |

---

## 🟠 HIGH (3 findings)

---

### 🟠 F-001: Stored XSS — Script/Event Tags Returned Unsanitized in API Response

- **Severity:** HIGH
- **Category:** SECURITY
- **Endpoint/Feature:** `POST /trpc/tickets.create` → `GET /trpc/tickets.get`
- **Payload Used:** `{"title": "<script>alert('XSS')</script>", "description": "..."}`
- **Observed Behavior:** API stores and returns `<script>alert('XSS')</script>` verbatim in `title` field. No HTML entity encoding applied.
- **Expected Behavior:** HTML special characters should be encoded on write or sanitized in API response (e.g., `&lt;script&gt;`).
- **Root Cause Hypothesis:** No server-side HTML sanitization layer (e.g., `DOMPurify`, `sanitize-html`) applied to free-text ticket fields. Risk depends entirely on frontend rendering: React JSX auto-escapes by default (safe), but any use of `dangerouslySetInnerHTML`, `innerHTML`, or third-party rich-text renderers on ticket title/description would execute the payload.
- **Reproduction Steps:**
  ```
  1. POST /trpc/tickets.create with body:
     {"title":"<script>alert('XSS')</script>","description":"test","priority":"4_low","type":"incident"}
  2. GET /trpc/tickets.get?input={"id":"<created-id>"}
  3. Observe: response.result.data.title = "<script>alert('XSS')</script>" (raw, unescaped)
  ```
- **Suggested Fix:** Add `sanitize-html` or `DOMPurify` sanitization on all free-text inputs (title, description, comments, notes). At minimum, audit all frontend components that render ticket text for use of `dangerouslySetInnerHTML`.

---

### 🟠 F-002: Session Not Invalidated After Password Change

- **Severity:** HIGH
- **Category:** SECURITY / SESSION MANAGEMENT
- **Endpoint/Feature:** `POST /trpc/auth.changePassword` → `GET /trpc/auth.me`
- **Payload Used:** `{currentPassword:"Original123!", newPassword:"Changed456!"}` — then immediately calling `auth.me` with the pre-change session token.
- **Observed Behavior:** HTTP 200 returned on `auth.me` after password change using the old session token. The session remains fully valid and authenticated.
- **Expected Behavior:** All existing sessions for the user should be invalidated (deleted from Redis) when password changes, forcing re-authentication.
- **Root Cause Hypothesis:** `changePassword` handler updates the DB password hash but does not call session invalidation (e.g., does not delete all `session:{userId}:*` keys from Redis). An attacker who has obtained a session token (via phishing, XSS, network sniff) retains access even after the victim changes their password to revoke access.
- **Reproduction Steps:**
  ```
  1. POST /trpc/auth.signup → obtain sessionId (S1)
  2. POST /trpc/auth.changePassword with S1: {currentPassword:"...", newPassword:"..."}
  3. Confirm HTTP 200
  4. GET /trpc/auth.me with Bearer S1
  5. Observe: HTTP 200 — still authenticated with old session
  ```
- **Suggested Fix:** In `changePassword` handler, after updating the password hash, delete all Redis session keys for the user:
  ```typescript
  // After successful password update:
  const redis = getRedis();
  const sessionKeys = await redis.keys(`session:${userId}:*`);
  if (sessionKeys.length > 0) await redis.del(...sessionKeys);
  // Or: if sessions are keyed by tokenHash, scan for user's sessions
  ```
  Alternatively, store `passwordChangedAt` on the user record and validate it against session creation time in `createContext`.

---

### 🟠 F-003: In-Flight Concurrency Counter Permanently Broken — Concurrency Gate Silently Disabled

- **Severity:** HIGH
- **Category:** STABILITY / METRICS
- **Endpoint/Feature:** `apps/api/src/index.ts` — `onRequest`/`onResponse` hooks (lines 333–349)
- **Payload Used:** Sustained concurrent load (300–500 concurrent requests)
- **Observed Behavior:** `GET /internal/health` reports `in_flight: -677` (at time of test). The counter decreases (goes more negative) with each completed request batch. The `max_in_flight: 500` gate never fires despite 510+ concurrent requests being processed simultaneously.
- **Expected Behavior:** `in_flight` should oscillate between 0 and ~current concurrency level. The gate should reject requests with HTTP 503 when `in_flight > 500`.
- **Root Cause Hypothesis:** Double-decrement bug in Fastify lifecycle hooks:
  ```typescript
  // onRequest: fires for ALL requests
  fastify.addHook("onRequest", (req, reply, done) => {
    if (++inFlight > MAX_IN_FLIGHT) {
      inFlight--;           // decrement #1 (conditional)
      reply.status(503).send({...});
      return;               // does NOT call done()
    }
    done();
  });

  // onResponse: fires for ALL responses — INCLUDING the 503 above
  fastify.addHook("onResponse", (_req, _reply, done) => {
    inFlight--;             // decrement #2 (always fires, even for 503 from onRequest)
    done();
  });
  ```
  For any request that hits the `MAX_IN_FLIGHT` gate:
  - `onRequest`: `++inFlight` then `inFlight--` → net 0
  - `onResponse`: `inFlight--` → net **-1**
  
  Every 503 from the gate permanently decrements the counter. After enough 503s, the counter is deeply negative, meaning `inFlight > MAX_IN_FLIGHT` is **permanently false** — the gate never fires again for the lifetime of the process. The server has no concurrency protection.
  
  Note: In our test environment, the rate limiter absorbs load before the 503 gate triggers, masking the bug — but if rate limiting is disabled or bypassed for specific endpoints, the server is unprotected.
- **Reproduction Steps:**
  ```
  1. Send 510+ concurrent requests to any unrate-limited endpoint
  2. Some requests should hit the 503 gate
  3. GET /internal/health — observe in_flight going progressively negative
  4. Each subsequent batch of requests drives it more negative
  5. The gate never fires again for the process lifetime
  ```
- **Suggested Fix:**
  ```typescript
  // Option A: Don't use onResponse to decrement for early-rejected requests
  // Track which requests were incremented via a request-level flag
  fastify.addHook("onRequest", (req, reply, done) => {
    if (++inFlight > MAX_IN_FLIGHT) {
      inFlight--;
      // Set flag so onResponse doesn't double-decrement
      (req as { _inflight?: boolean })._inflight = false;
      reply.status(503).send({...});
      return;
    }
    (req as { _inflight?: boolean })._inflight = true;
    done();
  });

  fastify.addHook("onResponse", (req, _reply, done) => {
    if ((req as { _inflight?: boolean })._inflight) inFlight--;
    done();
  });

  // Option B (simpler): Clamp counter to 0 as minimum
  fastify.addHook("onResponse", (_req, _reply, done) => {
    if (inFlight > 0) inFlight--;
    done();
  });
  ```

---

## 🟡 MEDIUM (4 findings)

---

### 🟡 F-004: Foreign Key Violation Surfaces as Unhandled HTTP 500

- **Severity:** MEDIUM
- **Category:** DATA_INTEGRITY / STABILITY
- **Endpoint/Feature:** `POST /trpc/tickets.create`
- **Payload Used:** `{"title":"FK_ASSIGNEE", "assigneeId":"00000000-0000-0000-0000-000000000001", ...}` (UUID that doesn't exist in users table)
- **Observed Behavior:** HTTP 500 with server error when `assigneeId` or `teamId` references a non-existent UUID.
- **Expected Behavior:** HTTP 400 BAD_REQUEST with a user-friendly validation message: "Assignee not found" or "Team not found".
- **Root Cause Hypothesis:** FK constraint violation from PostgreSQL (`FOREIGN KEY violation`) bubbles up as an unhandled Drizzle/Postgres exception that the tRPC error handler converts to a generic 500 rather than a domain-specific 400.
- **Suggested Fix:** Pre-validate referenced entity existence in the router handler (query user/team by ID before insert), or catch `PostgresError` with code `23503` (FK violation) in a shared error handler and translate to `TRPCError({ code: "BAD_REQUEST" })`.

---

### 🟡 F-005: Internal Observability Endpoints Accessible Without Authentication

- **Severity:** MEDIUM
- **Category:** SECURITY / INFORMATION DISCLOSURE
- **Endpoint/Feature:** `GET /internal/metrics`, `GET /internal/health`
- **Payload Used:** `curl http://139.84.154.78:3001/internal/metrics` (no auth headers)
- **Observed Behavior:** Both endpoints return HTTP 200 with full system metrics: total requests, error counts, error rate, rate-limited count, RPS, per-endpoint latency breakdown, bcrypt concurrency state (`active`, `queued`, `max_concurrent`), and `in_flight`/`max_in_flight` values.
- **Expected Behavior:** Should require an internal API key, IP allowlist, or at minimum a secret token to access. Unauthenticated access from the public internet should return 401 or 403.
- **Root Cause Hypothesis:** Internal monitoring endpoints registered without auth middleware. An attacker can continuously poll these to:
  - Determine `bcrypt.max_concurrent` (8) — revealing the bcrypt semaphore limit for timing attacks
  - Monitor real-time error rates to detect when chaos attempts are succeeding
  - See per-endpoint breakdown to map the full API surface
  - Observe `in_flight` to time flood attacks when the gate is most overloaded
- **Suggested Fix:**
  ```typescript
  // Add a pre-handler that validates an internal secret
  const INTERNAL_TOKEN = process.env["INTERNAL_API_TOKEN"];
  fastify.addHook("preHandler", async (req, reply) => {
    if (req.url?.startsWith("/internal/")) {
      const token = req.headers["x-internal-token"];
      if (!INTERNAL_TOKEN || token !== INTERNAL_TOKEN) {
        reply.status(401).send({ error: "Unauthorized" });
      }
    }
  });
  ```
  Or use an IP allowlist restricted to localhost/private network.

---

### 🟡 F-006: Login Rate Limiter False Positives on First Attempt (55% Rate Under Concurrent Load)

- **Severity:** MEDIUM
- **Category:** SECURITY / RELIABILITY
- **Endpoint/Feature:** `POST /trpc/auth.login` → `checkLoginRateLimit` in `login-rate-limit.ts`
- **Payload Used:** 100 concurrent login attempts to 100 unique never-before-seen emails
- **Observed Behavior:** 55/100 unique emails receive HTTP 429 `TOO_MANY_REQUESTS` on their **first ever attempt**. Only 45/100 correctly receive HTTP 401 (wrong password, not rate-limited).
- **Expected Behavior:** 100/100 should receive HTTP 401 — brand-new email addresses have 0 prior attempts and should never be rate-limited on the first try.
- **Root Cause Hypothesis (candidate):** The Redis pipeline `incr` + `expire NX` implementation may have a race condition under high concurrent load. If the `pipeline.exec()` returns `results?.[0]?.[1]` as `undefined` or `null` instead of the actual increment value (ioredis pipeline error handling), the fallback `?? 0` makes `count = 0` (under limit). However, the observed behavior shows the OPPOSITE — false positives. More likely: there is an **IP-based or global rate limit** at the Fastify or Nginx level that fires before the per-email check, or the ioredis pipeline returns stale/cached values under concurrent execution. Alternatively, the Redis `incr` returns a value > 5 if a key collision occurs (e.g., if key normalization is lossy for certain email patterns).
- **Impact:** Legitimate users (e.g., users who've never logged in before) can be denied service during concurrent login traffic. An attacker can also use this to DoS specific users by flooding their email in concurrent batches (exhausting their rate limit window instantly).
- **Suggested Fix:** Add logging to `checkLoginRateLimit` to capture the actual `count` returned per email under concurrent load. Verify the ioredis pipeline returns `[null, count]` not `[err, null]` under high concurrency. If an IP-based limiter exists, tune its threshold to not fire for valid concurrent multi-user login traffic.

---

### 🟡 F-007: Health Endpoint Reports DEGRADED During Load With Misleading `in_flight` Value

- **Severity:** MEDIUM
- **Category:** OBSERVABILITY
- **Endpoint/Feature:** `GET /internal/health`
- **Payload Used:** 300-concurrent ticket creates (chaos load test)
- **Observed Behavior:** During high-concurrency load, health endpoint reports:
  - `status: DEGRADED`
  - `reason: "Latency elevated on /trpc/tickets.create: avg 1350.4ms — threshold 1000ms"`
  - `in_flight: -647` (negative — physically impossible, see F-003)
- **Expected Behavior:** `in_flight` should reflect actual concurrent request count. Latency threshold of 1000ms may be too aggressive — during 300-concurrent load, 1350ms average is acceptable degradation not a true "degraded" state.
- **Root Cause Hypothesis:** Cascading effect of F-003 (counter underflow) makes health reporting untrustworthy. The `DEGRADED` status trigger at 1000ms avg latency under burst load may generate alert noise; consider using p99 latency rather than average, or a higher threshold during sustained load periods.
- **Suggested Fix:** Fix F-003 first. Then recalibrate latency thresholds using p95/p99 rather than mean average (which is skewed by outliers). Add a `jitter` window before transitioning health state to avoid alert flapping during temporary load spikes.

---

## 🔵 LOW (1 finding)

---

### 🔵 F-008: Internal Metrics Disclose bcrypt Concurrency Configuration

- **Severity:** LOW
- **Category:** INFORMATION DISCLOSURE
- **Endpoint/Feature:** `GET /internal/metrics`
- **Payload Used:** Unauthenticated GET
- **Observed Behavior:** Response includes `"bcrypt": {"active":0,"queued":0,"max_concurrent":8}` — exposing the bcrypt semaphore concurrency ceiling.
- **Expected Behavior:** This information should be gated behind auth (per F-005). Knowing `max_concurrent: 8` allows an attacker to calibrate a login storm: sending exactly 8 concurrent bcrypt-triggering logins saturates the semaphore while staying below rate limits.
- **Root Cause Hypothesis:** bcrypt metrics included in public-facing metrics export. Combine with F-005 to form a targeted DoS vector.
- **Suggested Fix:** Fix F-005 (auth-gate the metrics endpoint). Alternatively, remove bcrypt concurrency stats from the public metrics payload.

---

## Findings That Were Tested But Did NOT Trigger (System Held)

| Attack Vector | Test Method | Result |
|---|---|---|
| JWT `alg:none` token bypass | Bearer with base64 `{alg:none}` | 401 — rejected |
| Session replay after logout | Old session used post-logout | 401 — correctly invalidated |
| Cross-org IDOR (ticket read) | Victim reads admin org ticket | 404 — correctly blocked |
| Cross-org IDOR (ticket write) | Victim updates admin org ticket | 404 — correctly blocked |
| SQL injection in login | 5 payloads including `OR 1=1` | 401 — parameterized queries working |
| Mass assignment (orgId override) | Extra `orgId` field in create | Server-side orgId enforced — correct |
| Idempotency race (50-concurrent) | Same key, 50 simultaneous creates | 1 unique ticket — deduplication working |
| Concurrent DB race (30 updates) | Same ticket, 30 simultaneous updates | 0 errors — no serialization failure |
| Deep JSON nesting (1000 levels) | Nested object payload | Returns 400 — not 500 |
| Login rate limit | 8 rapid attempts same email | 429 at attempt 6 — working |
| Prototype pollution | `__proto__` in request body | Sanitized — no 500 |
| Login storm (20-concurrent) | 20× concurrent same user | 0 server errors |
| 300× concurrent ticket creates | Concurrency ramp | 0 server errors |
| Body limit (1.1MB+) | 1.1MB, 2MB, 10MB payloads | All 413 — limit enforced |

---

## Attack Coverage Summary

| Phase | Tests Run | Findings | Pass Rate |
|---|---|---|---|
| P1: System Discovery | Live endpoint probe, route enumeration | F-005 | — |
| P2: Unauthenticated Access | 7 protected procedures, 1 mutation | Clean | 100% blocked |
| P3: Auth Bypass & Tokens | 13 token variants, 5 SQL injections, rate limit, reset | F-006 | Mostly held |
| P4: IDOR & Cross-Org | 3 tickets read/write, 3 admin procedures, UUID enum | Clean | 100% blocked |
| P5: Input Validation | 8 XSS, 5 body sizes, 10 type attacks, 6 numeric | F-001 | XSS stored but not executed server-side |
| P6: Concurrency / Race | 50× idempotency, 30× updates, 20× login, 10× signup | Clean | 0 failures |
| P7: API Destruction | 10→500 ramp, 300× metrics burst, search injection | F-003 indirectly | Handled well |
| P8: DB Integrity | Mixed concurrent ops, state machine, FK refs, phantom | F-004 | 2 FK 500s |
| P9: Workflow & Modules | Workflow list, approvals, notifications, module probes | Clean | All responded |
| P10: Adaptive Escalation | 500-concurrent burst, replay attack | F-002 | 1 confirmed |
| P2/T: Pass 2 Targeted | In-flight gate, scope verification, session, mass assign | F-002, F-003 confirmed | — |

---

## Recommended Fix Priority

| Priority | Finding | Effort | Impact |
|---|---|---|---|
| P0 — Immediate | **F-003**: Fix `onResponse` double-decrement for 503 path | 5 min code fix | Restores concurrency gate |
| P0 — Immediate | **F-002**: Invalidate all sessions on password change | 30 min | Closes session hijacking window |
| P1 — This sprint | **F-001**: Audit frontend XSS rendering surface | 1 day | Prevents stored XSS if innerHTML used |
| P1 — This sprint | **F-005**: Auth-gate `/internal/metrics` and `/internal/health` | 2 hours | Removes operational intel exposure |
| P2 — Next sprint | **F-004**: Catch FK violations → return 400 not 500 | 4 hours | Cleaner error surface |
| P2 — Next sprint | **F-006**: Investigate rate limit false positives | 2 hours | Prevents DoS of legitimate users |
| P3 — Backlog | **F-007**: Improve health threshold calibration | 1 day | Reduces alert noise |
| P3 — Backlog | **F-008**: Remove bcrypt config from public metrics | 30 min | Minor hardening |

---

## System State Post-Chaos

```json
{
  "status": "HEALTHY",
  "summary": {
    "error_rate": 0.0021,
    "total_requests": 4368,
    "total_errors": 9
  },
  "concurrency": {
    "in_flight": -677,
    "max_in_flight": 500
  },
  "bcrypt": {
    "active": 0,
    "queued": 0,
    "max_concurrent": 8
  }
}
```

**System recovered to HEALTHY status.** Error rate: 0.21% (9 errors across 4,368 total requests). The only persistent anomaly is the `in_flight: -677` counter (F-003) which requires a server restart or the code fix to reset.

---

*Report generated by Autonomous Chaos Engineering Agent v2 — NexusOps Principal Software Resilience Architect Mode*  
*Two full attack passes + targeted verification runs against live production at `http://139.84.154.78`*
