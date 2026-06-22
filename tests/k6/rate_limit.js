// =============================================================================
// /tests/k6/rate_limit.js
//
// PURPOSE
//   Deliberately trigger and characterise the backend rate limiter by
//   hammering a single endpoint from a single authenticated session token.
//   Because the NexusOps rate limiter operates per (user, org, endpoint),
//   a single token on the same endpoint will be throttled at 60 req/min.
//
// WHAT IT TESTS
//   1. Rate limiter returns HTTP 429 (or tRPC TOO_MANY_REQUESTS) when exceeded
//   2. Server remains stable and healthy during and after rate-limit storm
//   3. Throttled requests are rejected cleanly (no 500s, no hangs)
//   4. Rate limit resets after the window expires (recovery check)
//   5. Different users on the same endpoint are NOT cross-throttled
//
// PHASES
//   Phase 1 (0–30s)   — 1 VU, fast loop → trip the limiter
//   Phase 2 (30s–60s) — 60s cooldown wait (window reset)
//   Phase 3 (60s–90s) — burst again from SAME user to confirm reset
//   Phase 4 (90s–2m)  — 5 VUs, each with own token → should all succeed
//
// RUN
//   k6 run tests/k6/rate_limit.js
//   k6 run -e BASE_URL=http://localhost:3001/trpc tests/k6/rate_limit.js
// =============================================================================

import http             from "k6/http";
import { check, group } from "k6";
import { sleep }        from "k6";
import exec             from "k6/execution";
import { Counter, Rate, Gauge } from "k6/metrics";

import {
  BASE_URL,
  ADMIN_USER,
  TEST_USERS,
  DEFAULT_OPTIONS,
  authHeaders,
  parseTrpc,
  login,
  userForVU,
} from "./config.js";

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const rateLimitHits       = new Counter("rate_limit_429_hits");
const rateLimitRejected   = new Rate("rate_limit_rejection_rate");
const serverErrorsDuring  = new Counter("rate_limit_server_errors");
const recoverySuccess     = new Counter("rate_limit_recovery_success");
const crossUserThrottled  = new Counter("rate_limit_cross_user_throttle"); // must stay 0

// ---------------------------------------------------------------------------
// Test options — multi-phase via scenarios
// ---------------------------------------------------------------------------
export const options = {
  ...DEFAULT_OPTIONS,
  scenarios: {
    // Phase 1: Single user, zero sleep — trip the limiter fast
    single_user_storm: {
      executor:  "constant-vus",
      vus:       1,
      duration:  "30s",
      tags:      { phase: "storm" },
    },

    // Phase 3: Recovery check — same user after 60 s cooldown
    // startTime must be > 30s (storm) + 60s (cooldown) = 90s
    single_user_recovery: {
      executor:  "constant-vus",
      vus:       1,
      duration:  "30s",
      startTime: "1m40s",  // storm(30s) + cooldown(70s) = 100s
      tags:      { phase: "recovery" },
    },

    // Phase 4: Multi-user burst — each VU has own token, should all pass
    multi_user_burst: {
      executor:  "constant-vus",
      vus:       5,
      duration:  "30s",
      startTime: "2m20s",  // after recovery phase
      tags:      { phase: "multi_user" },
    },
  },
  thresholds: {
    // During the storm phase we EXPECT many 429s, so no global error threshold
    "http_req_duration":           ["p(95)<1000"],
    "rate_limit_server_errors":    ["count<5"],      // 500s must be near-zero
    "rate_limit_cross_user_throttle": ["count==0"],  // cross-user throttling is a bug
  },
};

// ---------------------------------------------------------------------------
// setup() — log in the tokens we need
// ---------------------------------------------------------------------------
export function setup() {
  // Token for single-user phases
  const adminToken = login(ADMIN_USER.email, ADMIN_USER.password);

  // Tokens for multi-user phase (5 unique users)
  const multiTokens = TEST_USERS.slice(0, 5).map((u) => login(u.email, u.password));

  return { adminToken, multiTokens };
}

// ---------------------------------------------------------------------------
// Default function
// ---------------------------------------------------------------------------
export default function (data) {
  const phase  = exec.scenario.tags?.phase ?? exec.scenario.name;
  const vuIdx  = exec.vu.idInTest - 1;

  // ── PHASE: storm & recovery — single token, hammer tickets.list ─────────
  if (phase === "storm" || phase === "single_user_storm" ||
      phase === "recovery" || phase === "single_user_recovery") {

    const token = data.adminToken;

    group(`rate_limit_${phase}`, () => {
      const res = http.get(
        `${BASE_URL}/tickets.list?input=${encodeURIComponent(JSON.stringify({}))}`,
        { headers: authHeaders(token), tags: { phase } }
      );

      const statusCode = res.status;
      const { error }  = parseTrpc(res);

      const is429 = statusCode === 429 ||
                    error?.data?.code === "TOO_MANY_REQUESTS";

      check(res, {
        [`${phase}: no 500`]:      (r) => r.status < 500,
        [`${phase}: clean reject`]: (_) =>
          statusCode === 200 || statusCode === 429 || is429,
        [`${phase}: no hang`]: (r) => r.timings.duration < 5000,
      });

      if (is429) {
        rateLimitHits.add(1);
        rateLimitRejected.add(1);
      } else if (statusCode >= 500) {
        serverErrorsDuring.add(1);
        rateLimitRejected.add(0);
      } else {
        rateLimitRejected.add(0);
        if (phase === "recovery" || phase === "single_user_recovery") {
          recoverySuccess.add(1);
        }
      }
    });

    // No sleep — max throughput to hit the limiter as quickly as possible
    sleep(0.1);
  }

  // ── PHASE: multi_user — each VU uses its own token ──────────────────────
  else if (phase === "multi_user" || phase === "multi_user_burst") {
    const token = data.multiTokens[vuIdx % data.multiTokens.length];

    group("multi_user_no_crossthrottle", () => {
      const res = http.get(
        `${BASE_URL}/tickets.list?input=${encodeURIComponent(JSON.stringify({}))}`,
        { headers: authHeaders(token), tags: { phase: "multi_user" } }
      );

      const statusCode = res.status;
      const { error }  = parseTrpc(res);
      const is429 = statusCode === 429 || error?.data?.code === "TOO_MANY_REQUESTS";

      check(res, {
        "multi_user: 200 (own rate bucket)": (r) => r.status === 200,
        "multi_user: no 429 (isolated)":     (_) => !is429,
        "multi_user: no 500":                (r) => r.status < 500,
      });

      // Cross-user throttling would be a bug — count these
      if (is429) {
        crossUserThrottled.add(1);
      }
    });

    sleep(1); // paced — stay safely within each user's 60 req/min quota
  }
}

// ---------------------------------------------------------------------------
// handleSummary
// ---------------------------------------------------------------------------
export function handleSummary(data) {
  const hits      = data.metrics?.rate_limit_429_hits?.values?.count        ?? 0;
  const svErrors  = data.metrics?.rate_limit_server_errors?.values?.count   ?? 0;
  const recovery  = data.metrics?.rate_limit_recovery_success?.values?.count ?? 0;
  const crossUser = data.metrics?.rate_limit_cross_user_throttle?.values?.count ?? 0;
  const p95       = data.metrics?.http_req_duration?.values?.["p(95)"]       ?? 0;

  console.log("========== RATE LIMIT SUMMARY ==========");
  console.log(`429s triggered (storm phase) : ${hits}`);
  console.log(`Server errors (500s)         : ${svErrors}  (must be ~0)`);
  console.log(`Recovery success hits        : ${recovery}`);
  console.log(`Cross-user throttle events   : ${crossUser} (must be 0)`);
  console.log(`HTTP p(95)                   : ${p95.toFixed(1)} ms`);
  console.log("=========================================");

  return { stdout: JSON.stringify(data, null, 2) };
}
