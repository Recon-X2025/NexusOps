// =============================================================================
// /tests/k6/config.js
// Shared configuration, constants, and utility helpers for the NexusOps k6
// test suite. Import this file from every other test script.
// =============================================================================

// ---------------------------------------------------------------------------
// BASE URL
// Override at runtime:  k6 run -e BASE_URL=http://localhost:3001/trpc script.js
// ---------------------------------------------------------------------------
export const BASE_URL = __ENV.BASE_URL || "http://localhost:3001/trpc";

// ---------------------------------------------------------------------------
// TEST USERS
// Replace the placeholder values below with real load-test credentials.
// These users must already exist in the database (run seed_users.js first).
// Each entry maps to one VU in per-VU-isolated tests.
// ---------------------------------------------------------------------------
export const TEST_USERS = [
  { email: "loadtest0@test.com",  password: "Test1234!" },
  { email: "loadtest1@test.com",  password: "Test1234!" },
  { email: "loadtest2@test.com",  password: "Test1234!" },
  { email: "loadtest3@test.com",  password: "Test1234!" },
  { email: "loadtest4@test.com",  password: "Test1234!" },
  { email: "loadtest5@test.com",  password: "Test1234!" },
  { email: "loadtest6@test.com",  password: "Test1234!" },
  { email: "loadtest7@test.com",  password: "Test1234!" },
  { email: "loadtest8@test.com",  password: "Test1234!" },
  { email: "loadtest9@test.com",  password: "Test1234!" },
  { email: "loadtest10@test.com", password: "Test1234!" },
  { email: "loadtest11@test.com", password: "Test1234!" },
  { email: "loadtest12@test.com", password: "Test1234!" },
  { email: "loadtest13@test.com", password: "Test1234!" },
  { email: "loadtest14@test.com", password: "Test1234!" },
  { email: "loadtest15@test.com", password: "Test1234!" },
  { email: "loadtest16@test.com", password: "Test1234!" },
  { email: "loadtest17@test.com", password: "Test1234!" },
  { email: "loadtest18@test.com", password: "Test1234!" },
  { email: "loadtest19@test.com", password: "Test1234!" },
];

// ---------------------------------------------------------------------------
// ADMIN USER
// Used in auth_stress.js and rate_limit.js for single-user hammering tests.
// Must be a real account with admin privileges.
// ---------------------------------------------------------------------------
export const ADMIN_USER = {
  email:    __ENV.ADMIN_EMAIL    || "admin@coheron.com",
  password: __ENV.ADMIN_PASSWORD || "demo1234!",
};

// ---------------------------------------------------------------------------
// TEST TICKET ID
// A ticket that already exists in the DB, used by race_condition.js.
// Override at runtime:  k6 run -e TEST_TICKET_ID=<uuid> race_condition.js
// ---------------------------------------------------------------------------
export const TEST_TICKET_ID = __ENV.TEST_TICKET_ID || "PLACEHOLDER_TICKET_UUID";

// ---------------------------------------------------------------------------
// SHARED DEFAULT OPTIONS
// Each test file can spread these and override individual fields.
// ---------------------------------------------------------------------------
export const DEFAULT_OPTIONS = {
  thresholds: {
    // Hard stop if error rate exceeds 5 %
    http_req_failed:   ["rate<0.05"],
    // 95th-percentile response must be under 2 s
    http_req_duration: ["p(95)<2000"],
  },
  // Tag every request with the scenario name for Grafana filtering
  tags: { project: "nexusops" },
};

// ---------------------------------------------------------------------------
// JSON HEADERS
// Used for every POST to the tRPC API.
// ---------------------------------------------------------------------------
export const JSON_HEADERS = { "Content-Type": "application/json" };

// ---------------------------------------------------------------------------
// authHeaders(token)
// Returns headers object with Bearer token pre-filled.
// ---------------------------------------------------------------------------
export function authHeaders(token) {
  return {
    "Content-Type":  "application/json",
    "Authorization": `Bearer ${token}`,
  };
}

// ---------------------------------------------------------------------------
// login(email, password)
// Performs auth.login and returns the plaintext session token.
// Throws on failure so setup() aborts early instead of running with bad state.
// ---------------------------------------------------------------------------
import http from "k6/http";

export function login(email, password) {
  const res = http.post(
    `${BASE_URL}/auth.login`,
    JSON.stringify({ email, password }),
    { headers: JSON_HEADERS }
  );

  const token = res.json()?.result?.data?.sessionId;

  if (!token) {
    const msg = res.json()?.error?.message || res.status;
    throw new Error(`Login failed for ${email}: ${msg}`);
  }

  return token;
}

// ---------------------------------------------------------------------------
// randomSleep(minSec, maxSec)
// Pauses execution for a random duration between minSec and maxSec.
// Simulates realistic think-time between user actions.
// ---------------------------------------------------------------------------
import { sleep } from "k6";

export function randomSleep(minSec = 0.5, maxSec = 2.0) {
  const duration = minSec + Math.random() * (maxSec - minSec);
  sleep(duration);
}

// ---------------------------------------------------------------------------
// parseTrpc(res)
// Safely unwraps a tRPC response envelope.
// Returns { data, error } — both may be null.
// ---------------------------------------------------------------------------
export function parseTrpc(res) {
  try {
    const body = res.json();
    return {
      data:  body?.result?.data  ?? null,
      error: body?.error         ?? null,
      raw:   body,
    };
  } catch (_) {
    return { data: null, error: { message: "JSON parse error" }, raw: null };
  }
}

// ---------------------------------------------------------------------------
// userForVU(vuIndex)
// Selects a TEST_USER for the current VU using round-robin.
// vuIndex should be exec.vu.idInTest - 1 (0-based).
// ---------------------------------------------------------------------------
export function userForVU(vuIndex) {
  return TEST_USERS[vuIndex % TEST_USERS.length];
}
