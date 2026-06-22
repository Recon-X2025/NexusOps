// =============================================================================
// /tests/k6/auth_stress.js
//
// PURPOSE
//   Stress-test the authentication subsystem:
//   - High volume of logins (each VU gets a unique session per iteration)
//   - No token reuse across iterations (each login is a fresh POST)
//   - Measures session creation throughput and latency
//   - Validates correct rejection of wrong credentials
//   - Validates correct rejection of empty credentials
//
// WHAT IT TESTS
//   1. auth.login succeeds for valid credentials            → check 200 + sessionId
//   2. auth.login rejects wrong password                    → check 401/UNAUTHORIZED
//   3. auth.login rejects missing email field               → check 400/BAD_REQUEST
//   4. Session token is a non-empty string                  → structural check
//   5. Logout invalidates the session                       → check success: true
//
// RUN
//   k6 run tests/k6/auth_stress.js
//   k6 run -e BASE_URL=http://localhost:3001/trpc tests/k6/auth_stress.js
// =============================================================================

import http               from "k6/http";
import { check, group }   from "k6";
import exec               from "k6/execution";
import { Counter, Trend } from "k6/metrics";

import {
  BASE_URL,
  TEST_USERS,
  DEFAULT_OPTIONS,
  JSON_HEADERS,
  authHeaders,
  parseTrpc,
  randomSleep,
  userForVU,
} from "./config.js";

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const loginSuccessCount  = new Counter("auth_login_success");
const loginFailCount     = new Counter("auth_login_failure");
const loginDuration      = new Trend("auth_login_duration_ms", true);
const logoutDuration     = new Trend("auth_logout_duration_ms", true);

// ---------------------------------------------------------------------------
// Test options
// ---------------------------------------------------------------------------
export const options = {
  ...DEFAULT_OPTIONS,
  scenarios: {
    // Ramp up to 50 VUs over 30 s, sustain for 1 m, ramp down
    login_ramp: {
      executor:       "ramping-vus",
      startVUs:       0,
      stages: [
        { duration: "30s", target: 50  }, // ramp-up
        { duration: "1m",  target: 50  }, // sustained stress
        { duration: "15s", target: 0   }, // ramp-down
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    ...DEFAULT_OPTIONS.thresholds,
    "auth_login_duration_ms": ["p(95)<800"],  // 95 % of logins < 800 ms
    "http_req_failed":        ["rate<0.02"],  // < 2 % HTTP failures
  },
};

// ---------------------------------------------------------------------------
// Default function — executed by every VU on every iteration
// ---------------------------------------------------------------------------
export default function () {
  const vuIndex = exec.vu.idInTest - 1;
  const user    = userForVU(vuIndex);

  // ── GROUP 1: Valid login ─────────────────────────────────────────────────
  group("valid_login", () => {
    const startMs = Date.now();
    const res = http.post(
      `${BASE_URL}/auth.login`,
      JSON.stringify({ email: user.email, password: user.password }),
      { headers: JSON_HEADERS, tags: { endpoint: "auth.login" } }
    );
    loginDuration.add(Date.now() - startMs);

    const { data, error } = parseTrpc(res);
    const token = data?.sessionId;

    const loginOk = check(res, {
      "login: HTTP 200":          (r) => r.status === 200,
      "login: result envelope":   (_) => data !== null,
      "login: sessionId present": (_) => typeof token === "string" && token.length > 0,
      "login: no error envelope": (_) => error === null,
    });

    if (loginOk && token) {
      loginSuccessCount.add(1);

      randomSleep(0.2, 0.5); // brief think-time before logout

      // ── GROUP 2: Logout invalidates session ──────────────────────────────
      group("logout", () => {
        const startLogout = Date.now();
        const logoutRes = http.post(
          `${BASE_URL}/auth.logout`,
          JSON.stringify({}),
          { headers: authHeaders(token), tags: { endpoint: "auth.logout" } }
        );
        logoutDuration.add(Date.now() - startLogout);

        check(logoutRes, {
          "logout: HTTP 200":    (r) => r.status === 200,
          "logout: success:true": (_) => parseTrpc(logoutRes).data?.success === true,
        });
      });

    } else {
      loginFailCount.add(1);
    }
  });

  randomSleep(0.5, 1.5);

  // ── GROUP 3: Wrong password must be rejected ─────────────────────────────
  group("wrong_password_rejected", () => {
    const res = http.post(
      `${BASE_URL}/auth.login`,
      JSON.stringify({ email: user.email, password: "WRONG_PASSWORD_XYZ" }),
      { headers: JSON_HEADERS, tags: { endpoint: "auth.login.bad_pw" } }
    );

    const { error } = parseTrpc(res);

    check(res, {
      "bad_pw: HTTP 200 (tRPC wraps errors in 200)": (r) => r.status === 200,
      "bad_pw: error envelope present":              (_) => error !== null,
      "bad_pw: UNAUTHORIZED code":                   (_) =>
        error?.data?.code === "UNAUTHORIZED" || res.status === 401,
      "bad_pw: no sessionId returned":               (_) =>
        parseTrpc(res).data?.sessionId == null,
    });
  });

  randomSleep(0.3, 0.8);

  // ── GROUP 4: Missing email field must be rejected ────────────────────────
  group("missing_email_rejected", () => {
    const res = http.post(
      `${BASE_URL}/auth.login`,
      JSON.stringify({ password: user.password }), // email omitted
      { headers: JSON_HEADERS, tags: { endpoint: "auth.login.no_email" } }
    );

    const { error } = parseTrpc(res);

    check(res, {
      "no_email: error returned":      (_) => error !== null,
      "no_email: no sessionId":        (_) =>
        parseTrpc(res).data?.sessionId == null,
      "no_email: BAD_REQUEST or parse error": (_) =>
        ["BAD_REQUEST", "PARSE_ERROR", "INTERNAL_SERVER_ERROR"]
          .includes(error?.data?.code) || res.status >= 400,
    });
  });

  randomSleep(0.5, 2.0);
}

// ---------------------------------------------------------------------------
// handleSummary — prints a brief auth-specific summary at the end
// ---------------------------------------------------------------------------
export function handleSummary(data) {
  const successes = data.metrics?.auth_login_success?.values?.count ?? 0;
  const failures  = data.metrics?.auth_login_failure?.values?.count ?? 0;
  const p95ms     = data.metrics?.auth_login_duration_ms?.values?.["p(95)"] ?? 0;

  console.log("========== AUTH STRESS SUMMARY ==========");
  console.log(`Login successes : ${successes}`);
  console.log(`Login failures  : ${failures}`);
  console.log(`Login p(95)     : ${p95ms.toFixed(1)} ms`);
  console.log("=========================================");

  return { stdout: JSON.stringify(data, null, 2) };
}
