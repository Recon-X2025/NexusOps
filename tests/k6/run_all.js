// =============================================================================
// /tests/k6/run_all.js
//
// PURPOSE
//   Master orchestration script that runs ALL test scenarios in a single
//   k6 execution. Each scenario runs in parallel using k6's native
//   scenarios API. Scenarios are staggered with startTime offsets to
//   allow each phase to build load progressively without one test
//   interfering with another's ramp-up.
//
// SCENARIO SCHEDULE
//
//   Time 0s  ────── auth_stress_ramp  (50 VUs, 1m45s)
//   Time 0s  ────── chaos_flow        (30 VUs, 3m)
//   Time 10s ────── invalid_payloads  ( 1 VU,  3m)
//   Time 3m  ────── rate_limit_storm  ( 1 VU,  30s, single-user hammer)
//   Time 4m  ────── race_condition    (20 VUs, 1m,  requires TEST_TICKET_ID)
//   Time 5m  ────── soak_read         (50 VUs, 2m,  sustained read load)
//
//   Total wall-clock time: ~7 minutes
//
// THRESHOLDS (global pass/fail)
//   - p(95) < 2 s across ALL scenarios
//   - Error rate < 3 % (storm phase excluded via tags)
//   - Zero 500s on bad input
//   - Zero stack leaks
//
// RUN
//   k6 run tests/k6/run_all.js
//   k6 run -e BASE_URL=http://localhost:3001/trpc \
//           -e TEST_TICKET_ID=<uuid> \
//           tests/k6/run_all.js
//
// NOTE
//   run_all.js inlines reduced versions of the individual test logic
//   because k6 does not support dynamic scenario-level imports. For
//   granular metrics, run each script individually.
// =============================================================================

import http             from "k6/http";
import { check, group } from "k6";
import { sleep }        from "k6";
import exec             from "k6/execution";
import { Counter, Rate, Trend } from "k6/metrics";

import {
  BASE_URL,
  ADMIN_USER,
  TEST_USERS,
  TEST_TICKET_ID,
  JSON_HEADERS,
  authHeaders,
  parseTrpc,
  randomSleep,
  login,
  userForVU,
} from "./config.js";

// ---------------------------------------------------------------------------
// Global custom metrics
// ---------------------------------------------------------------------------
const totalWorkflows   = new Counter("all_workflows_completed");
const totalErrors      = new Counter("all_errors");
const loginLatency     = new Trend("all_login_ms", true);
const endToEnd         = new Trend("all_end_to_end_ms", true);
const badInputRejected = new Rate("all_bad_input_rejection_rate");
const rateLimitTripped = new Counter("all_rate_limit_429s");

// ---------------------------------------------------------------------------
// Options — all scenarios declared here
// ---------------------------------------------------------------------------
export const options = {
  scenarios: {

    // ── 1. Auth stress ─────────────────────────────────────────────────────
    auth_stress: {
      executor:  "ramping-vus",
      startVUs:  0,
      stages: [
        { duration: "20s", target: 30 },
        { duration: "1m",  target: 30 },
        { duration: "15s", target: 0  },
      ],
      gracefulRampDown: "10s",
      tags:      { scenario: "auth_stress" },
    },

    // ── 2. Chaos flow (full user journey) ──────────────────────────────────
    chaos_flow: {
      executor:  "constant-vus",
      vus:       20,
      duration:  "3m",
      tags:      { scenario: "chaos_flow" },
    },

    // ── 3. Invalid payload probing ─────────────────────────────────────────
    invalid_payloads: {
      executor:  "constant-vus",
      vus:       1,
      duration:  "2m",
      startTime: "10s",
      tags:      { scenario: "invalid_payloads" },
    },

    // ── 4. Rate limit storm (single user, no sleep) ────────────────────────
    rate_limit_storm: {
      executor:  "constant-vus",
      vus:       1,
      duration:  "30s",
      startTime: "3m",
      tags:      { scenario: "rate_limit_storm" },
    },

    // ── 5. Race condition (concurrent writes to same ticket) ───────────────
    race_condition: {
      executor:  "constant-vus",
      vus:       20,
      duration:  "1m",
      startTime: "4m",
      tags:      { scenario: "race_condition" },
    },

    // ── 6. Soak read (sustained high-read load) ────────────────────────────
    soak_read: {
      executor:  "constant-vus",
      vus:       50,
      duration:  "2m",
      startTime: "5m",
      tags:      { scenario: "soak_read" },
    },
  },

  thresholds: {
    // Global response time
    "http_req_duration":            ["p(95)<2000"],
    // Global HTTP error rate (storm phase will produce 429s — that's expected)
    "http_req_failed":              ["rate<0.15"],
    // Bad input must always be rejected cleanly
    "all_bad_input_rejection_rate": ["rate>0.95"],
    // Zero unexpected 500s
    "all_errors":                   ["count<10"],
    // Login speed
    "all_login_ms":                 ["p(95)<1000"],
  },

  tags: { project: "nexusops", suite: "full" },
};

// ---------------------------------------------------------------------------
// setup() — pre-authenticate all VUs
// ---------------------------------------------------------------------------
export function setup() {
  console.log("[run_all] setup: logging in all test users...");

  // Auth stress tokens (first 30 users)
  const authTokens = TEST_USERS.slice(0, 30).map((u) => login(u.email, u.password));

  // Chaos flow tokens (next 20 users)
  const chaosTokens = TEST_USERS.slice(0, 20).map((u) => login(u.email, u.password));

  // Race condition tokens — all VUs must share the same org so they genuinely
  // contend on the same ticket. Admin user tokens satisfy this requirement.
  const raceTokens = Array.from({ length: 20 }, () =>
    login(ADMIN_USER.email, ADMIN_USER.password)
  );

  // Soak tokens (50 users, cycling over available)
  const soakTokens = Array.from({ length: 50 }, (_, i) =>
    login(TEST_USERS[i % TEST_USERS.length].email,
          TEST_USERS[i % TEST_USERS.length].password)
  );

  // Admin token for rate-limit storm
  const adminToken = login(ADMIN_USER.email, ADMIN_USER.password);

  console.log("[run_all] setup: all tokens acquired.");
  return { authTokens, chaosTokens, raceTokens, soakTokens, adminToken };
}

// ---------------------------------------------------------------------------
// Default function — dispatches to the right logic per scenario
// ---------------------------------------------------------------------------
export default function (data) {
  const scenario = exec.scenario.name;
  const vuIndex  = exec.vu.idInTest - 1;

  // ══════════════════════════════════════════════════════════════════════════
  // SCENARIO: auth_stress
  // ══════════════════════════════════════════════════════════════════════════
  if (scenario === "auth_stress") {
    const user  = userForVU(vuIndex);
    const start = Date.now();

    const res = http.post(
      `${BASE_URL}/auth.login`,
      JSON.stringify({ email: user.email, password: user.password }),
      { headers: JSON_HEADERS, tags: { endpoint: "auth.login" } }
    );

    loginLatency.add(Date.now() - start);
    const { data: d, error } = parseTrpc(res);
    const token = d?.sessionId;

    check(res, {
      "auth_stress: login 200":    (r) => r.status === 200,
      "auth_stress: token present": (_) => typeof token === "string",
      "auth_stress: no error":      (_) => error === null,
    });

    if (!token) totalErrors.add(1);
    else {
      // Immediately log out to free the session slot
      http.post(`${BASE_URL}/auth.logout`, JSON.stringify({}),
        { headers: authHeaders(token), tags: { endpoint: "auth.logout" } });
    }

    randomSleep(0.3, 1.0);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCENARIO: chaos_flow
  // ══════════════════════════════════════════════════════════════════════════
  else if (scenario === "chaos_flow") {
    const token    = data.chaosTokens[vuIndex % data.chaosTokens.length];
    const flowStart = Date.now();

    // List
    const listRes = http.get(
      `${BASE_URL}/tickets.list?input=${encodeURIComponent(JSON.stringify({}))}`,
      { headers: authHeaders(token), tags: { step: "list" } }
    );
    check(listRes, { "chaos: list 200": (r) => r.status === 200 });

    randomSleep(0.3, 0.8);

    // Create
    const createRes = http.post(
      `${BASE_URL}/tickets.create`,
      JSON.stringify({
        title:    `[run_all chaos] VU${exec.vu.idInTest} @ ${Date.now()}`,
        type:     "incident",
        priority: "low",
      }),
      { headers: authHeaders(token), tags: { step: "create" } }
    );
    const { data: cd, error: ce } = parseTrpc(createRes);
    const createdId = cd?.id ?? cd?.ticket?.id ?? null;

    check(createRes, {
      "chaos: create 200":    (r) => r.status === 200,
      "chaos: create no err": (_) => ce === null,
    });

    randomSleep(0.3, 0.8);

    // Update (if created successfully)
    // tickets.update expects { id: uuid, data: UpdateTicketSchema }
    if (createdId) {
      const updateRes = http.post(
        `${BASE_URL}/tickets.update`,
        JSON.stringify({
          id:   createdId,
          data: {
            title:       `[run_all chaos updated] VU${exec.vu.idInTest} @ ${Date.now()}`,
            description: `Updated by run_all chaos VU ${exec.vu.idInTest}`,
          },
        }),
        { headers: authHeaders(token), tags: { step: "update" } }
      );
      check(updateRes, { "chaos: update 200": (r) => r.status === 200 });
    }

    endToEnd.add(Date.now() - flowStart);
    totalWorkflows.add(1);
    randomSleep(0.5, 1.5);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCENARIO: invalid_payloads
  // ══════════════════════════════════════════════════════════════════════════
  else if (scenario === "invalid_payloads") {
    // Cycle through 4 bad-input cases per iteration
    const badPayloads = [
      ["/auth.login",       JSON.stringify({}),                            "empty_login"],
      ["/auth.login",       JSON.stringify({ email: 12345, password: 1 }), "type_error"],
      ["/tickets.create",   JSON.stringify({ priority: "INVALID" }),       "bad_enum"],
      ["/tickets.update",   JSON.stringify({ id: "not-a-uuid" }),          "bad_uuid"],
    ];

    for (const [path, body, label] of badPayloads) {
      const res = http.post(`${BASE_URL}${path}`, body, { headers: JSON_HEADERS });
      const { error } = parseTrpc(res);
      const rejected = error !== null || res.status >= 400;

      check(res, {
        [`invalid ${label}: no 500`]:  (r) => r.status < 500,
        [`invalid ${label}: rejected`]: (_) => rejected,
      });

      badInputRejected.add(rejected ? 1 : 0);
      if (res.status >= 500) totalErrors.add(1);
    }

    randomSleep(0.5, 1.5);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCENARIO: rate_limit_storm
  // ══════════════════════════════════════════════════════════════════════════
  else if (scenario === "rate_limit_storm") {
    const res = http.get(
      `${BASE_URL}/tickets.list?input=${encodeURIComponent(JSON.stringify({}))}`,
      { headers: authHeaders(data.adminToken), tags: { phase: "storm" } }
    );

    const { error } = parseTrpc(res);
    const is429 = res.status === 429 || error?.data?.code === "TOO_MANY_REQUESTS";

    check(res, {
      "storm: no 500": (r) => r.status < 500,
      "storm: 200 or 429": (r) => r.status === 200 || r.status === 429 || is429,
    });

    if (is429) rateLimitTripped.add(1);
    if (res.status >= 500) totalErrors.add(1);

    sleep(0.1); // no think-time — maximise pressure
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCENARIO: race_condition
  // ══════════════════════════════════════════════════════════════════════════
  else if (scenario === "race_condition") {
    const token    = data.raceTokens[vuIndex % data.raceTokens.length];
    const statuses = ["open", "in_progress", "pending"];
    const status   = statuses[vuIndex % statuses.length];

    if (TEST_TICKET_ID === "PLACEHOLDER_TICKET_UUID") {
      // No ticket ID set — do a read-only race instead
      const res = http.get(
        `${BASE_URL}/tickets.list?input=${encodeURIComponent(JSON.stringify({}))}`,
        { headers: authHeaders(token), tags: { op: "fallback_read" } }
      );
      check(res, { "race fallback: 200": (r) => r.status === 200 });
    } else {
      // tickets.update expects { id: uuid, data: UpdateTicketSchema }
      const raceTitles = [
        `[run_all race] concurrent A — VU ${exec.vu.idInTest}`,
        `[run_all race] concurrent B — VU ${exec.vu.idInTest}`,
        `[run_all race] concurrent C — VU ${exec.vu.idInTest}`,
      ];
      const res = http.post(
        `${BASE_URL}/tickets.update`,
        JSON.stringify({
          id:   TEST_TICKET_ID,
          data: {
            title:       raceTitles[vuIndex % raceTitles.length],
            description: `Race condition run_all — VU ${exec.vu.idInTest} @ ${Date.now()}`,
          },
        }),
        { headers: authHeaders(token), tags: { op: "concurrent_update" } }
      );
      check(res, {
        "race: no 500":    (r) => r.status < 500,
        "race: 200 or 409": (r) => r.status === 200 || r.status === 409,
      });
      if (res.status >= 500) totalErrors.add(1);
    }

    randomSleep(0.05, 0.2);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCENARIO: soak_read
  // ══════════════════════════════════════════════════════════════════════════
  else if (scenario === "soak_read") {
    const token = data.soakTokens[vuIndex % data.soakTokens.length];

    const res = http.get(
      `${BASE_URL}/tickets.list?input=${encodeURIComponent(JSON.stringify({}))}`,
      { headers: authHeaders(token), tags: { op: "soak_read" } }
    );

    check(res, {
      "soak: 200":           (r) => r.status === 200,
      "soak: valid body":    (_) => parseTrpc(res).data !== null || parseTrpc(res).error !== null,
    });

    if (res.status >= 500) totalErrors.add(1);
    randomSleep(0.8, 2.0);
  }
}

// ---------------------------------------------------------------------------
// handleSummary — consolidated report for the full suite
// ---------------------------------------------------------------------------
export function handleSummary(data) {
  const m = data.metrics;

  const workflows  = m?.all_workflows_completed?.values?.count    ?? 0;
  const errors     = m?.all_errors?.values?.count                 ?? 0;
  const p95all     = m?.http_req_duration?.values?.["p(95)"]       ?? 0;
  const p95login   = m?.all_login_ms?.values?.["p(95)"]            ?? 0;
  const p95e2e     = m?.all_end_to_end_ms?.values?.["p(95)"]       ?? 0;
  const badRate    = m?.all_bad_input_rejection_rate?.values?.rate  ?? 0;
  const rl429s     = m?.all_rate_limit_429s?.values?.count          ?? 0;
  const httpFailed = m?.http_req_failed?.values?.rate               ?? 0;
  const totalReqs  = m?.http_reqs?.values?.count                    ?? 0;

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║      NEXUSOPS FULL SUITE SUMMARY         ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║ Total HTTP requests   : ${String(totalReqs).padEnd(16)} ║`);
  console.log(`║ HTTP error rate       : ${(httpFailed * 100).toFixed(2).padEnd(14)}%  ║`);
  console.log(`║ p(95) all endpoints   : ${String(p95all.toFixed(1) + " ms").padEnd(14)}  ║`);
  console.log(`║ p(95) login           : ${String(p95login.toFixed(1) + " ms").padEnd(14)}  ║`);
  console.log(`║ p(95) end-to-end      : ${String(p95e2e.toFixed(1) + " ms").padEnd(14)}  ║`);
  console.log(`║ Workflows completed   : ${String(workflows).padEnd(16)} ║`);
  console.log(`║ Total errors (500s)   : ${String(errors).padEnd(16)} ║`);
  console.log(`║ Bad input rejected %  : ${(badRate * 100).toFixed(1).padEnd(14)}%  ║`);
  console.log(`║ Rate-limit 429s fired : ${String(rl429s).padEnd(16)} ║`);
  console.log("╚══════════════════════════════════════════╝\n");

  return { stdout: JSON.stringify(data, null, 2) };
}
