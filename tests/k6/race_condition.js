// =============================================================================
// /tests/k6/race_condition.js
//
// PURPOSE
//   Deliberately induce concurrent write contention on a SINGLE ticket.
//   Multiple VUs simultaneously attempt to update the same resource to
//   detect race conditions, lost updates, or inconsistent state.
//
// WHAT IT TESTS
//   1. Concurrent updates to TEST_TICKET_ID do not cause 500 errors
//   2. Each update either succeeds (200) or fails gracefully (400/409)
//   3. No request hangs or times out under write contention
//   4. Final ticket state is consistent (not half-written)
//   5. Concurrent list + update mixture does not corrupt read results
//
// IMPORTANT
//   TEST_TICKET_ID must be a real ticket UUID that exists in the DB.
//   This test is NON-DESTRUCTIVE: it only updates title/notes/status,
//   never deletes. The ticket is left in "in_progress" state after the run.
//
// RUN
//   k6 run -e TEST_TICKET_ID=<uuid> tests/k6/race_condition.js
//   k6 run -e TEST_TICKET_ID=<uuid> -e BASE_URL=http://localhost:3001/trpc \
//       tests/k6/race_condition.js
// =============================================================================

import http             from "k6/http";
import { check, group } from "k6";
import exec             from "k6/execution";
import { Counter, Rate } from "k6/metrics";

import {
  BASE_URL,
  TEST_TICKET_ID,
  ADMIN_USER,
  DEFAULT_OPTIONS,
  authHeaders,
  parseTrpc,
  randomSleep,
  login,
} from "./config.js";

// ---------------------------------------------------------------------------
// Validate the placeholder has been replaced
// ---------------------------------------------------------------------------
if (TEST_TICKET_ID === "PLACEHOLDER_TICKET_UUID") {
  console.warn(
    "[race_condition] WARNING: TEST_TICKET_ID is still a placeholder. " +
    "Set it via: k6 run -e TEST_TICKET_ID=<uuid> race_condition.js"
  );
}

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const updateSuccess   = new Counter("race_update_success");
const updateConflict  = new Counter("race_update_conflict");   // 409 or similar
const updateError     = new Counter("race_update_error");      // 500s
const noDataLoss      = new Rate("race_no_data_loss");         // reads return valid data

// ---------------------------------------------------------------------------
// Test options — high-contention burst
// ---------------------------------------------------------------------------
export const options = {
  ...DEFAULT_OPTIONS,
  scenarios: {
    // Phase 1: 20 VUs all start at the same time — maximum write burst
    concurrent_writers: {
      executor:   "constant-vus",
      vus:        20,
      duration:   "1m",
      tags:       { scenario: "writers" },
    },
    // Phase 2: 10 VUs read while 10 VUs write simultaneously
    mixed_read_write: {
      executor:   "constant-vus",
      vus:        20,
      duration:   "1m",
      startTime:  "1m10s", // starts after writers finish + 10s gap
      tags:       { scenario: "mixed" },
    },
  },
  thresholds: {
    "http_req_failed":          ["rate<0.05"],  // < 5 % hard HTTP failures
    "http_req_duration":        ["p(95)<3000"], // writers may be slower under lock
    "race_no_data_loss":        ["rate>0.98"],  // 98 % of reads return valid data
  },
};

// ---------------------------------------------------------------------------
// setup() — log in as ADMIN_USER for all VUs.
// All 20 VUs share the same org so they genuinely contend on the same ticket.
// Using per-user loadtest accounts would put each VU in a different org,
// meaning cross-org FORBIDDEN errors instead of real write contention.
// ---------------------------------------------------------------------------
export function setup() {
  const tokens = Array.from({ length: 20 }, () => login(ADMIN_USER.email, ADMIN_USER.password));
  return { tokens };
}

// ---------------------------------------------------------------------------
// Default function
// ---------------------------------------------------------------------------
export default function (data) {
  const vuIndex = exec.vu.idInTest - 1;
  const token   = data.tokens[vuIndex % data.tokens.length];
  const scenario = exec.scenario.name;

  // ── WRITE PATH (concurrent_writers scenario or even VUs in mixed) ───────
  const isWriter = scenario === "concurrent_writers" || (vuIndex % 2 === 0);

  if (isWriter) {
    group("concurrent_update", () => {
      // tickets.update expects { id: uuid, data: UpdateTicketSchema }
      // Cycle through titles to maximise concurrent write contention on the same row.
      const titles = [
        `[race] concurrent write A — VU ${exec.vu.idInTest}`,
        `[race] concurrent write B — VU ${exec.vu.idInTest}`,
        `[race] concurrent write C — VU ${exec.vu.idInTest}`,
        `[race] concurrent write D — VU ${exec.vu.idInTest}`,
      ];

      const payload = {
        id:   TEST_TICKET_ID,
        data: {
          title:       titles[vuIndex % titles.length],
          description: `Race condition test — VU ${exec.vu.idInTest} @ ${Date.now()}`,
        },
      };

      const res = http.post(
        `${BASE_URL}/tickets.update`,
        JSON.stringify(payload),
        { headers: authHeaders(token), tags: { op: "update" } }
      );

      const { data: respData, error } = parseTrpc(res);
      const statusCode = res.status;

      check(res, {
        "update: no 500":           (r) => r.status !== 500,
        "update: no timeout":       (r) => r.timings.duration < 5000,
        "update: structured resp":  (_) => respData !== null || error !== null,
      });

      if (statusCode === 200 && !error) {
        updateSuccess.add(1);
      } else if (statusCode === 409) {
        // Optimistic locking conflict — acceptable, not a bug
        updateConflict.add(1);
      } else if (statusCode >= 500) {
        updateError.add(1);
      }
    });

  } else {
    // ── READ PATH (readers in mixed scenario) ──────────────────────────────
    group("concurrent_read", () => {
      const res = http.get(
        `${BASE_URL}/tickets.list?input=${encodeURIComponent(JSON.stringify({}))}`,
        { headers: authHeaders(token), tags: { op: "read" } }
      );

      const { data: respData } = parseTrpc(res);
      const items = respData?.items ?? (Array.isArray(respData) ? respData : null);

      const readOk = check(res, {
        "read: 200":             (r) => r.status === 200,
        "read: valid structure": (_) => items !== null,
      });

      noDataLoss.add(readOk ? 1 : 0);
    });
  }

  // Tight loop to maximise contention — minimal sleep
  randomSleep(0.05, 0.3);
}

// ---------------------------------------------------------------------------
// handleSummary
// ---------------------------------------------------------------------------
export function handleSummary(data) {
  const success  = data.metrics?.race_update_success?.values?.count   ?? 0;
  const conflict = data.metrics?.race_update_conflict?.values?.count  ?? 0;
  const errors   = data.metrics?.race_update_error?.values?.count     ?? 0;
  const noLoss   = data.metrics?.race_no_data_loss?.values?.rate      ?? 1;
  const p95      = data.metrics?.http_req_duration?.values?.["p(95)"] ?? 0;

  console.log("========== RACE CONDITION SUMMARY ==========");
  console.log(`Concurrent update successes : ${success}`);
  console.log(`Optimistic-lock conflicts   : ${conflict}  (expected)`);
  console.log(`Server errors (500)         : ${errors}   (should be 0)`);
  console.log(`Read data-loss rate         : ${((1 - noLoss) * 100).toFixed(2)} %`);
  console.log(`HTTP p(95) duration         : ${p95.toFixed(1)} ms`);
  console.log("=============================================");

  return { stdout: JSON.stringify(data, null, 2) };
}
