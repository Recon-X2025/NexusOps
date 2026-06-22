// =============================================================================
// /tests/k6/invalid_payload.js
//
// PURPOSE
//   Send every kind of malformed, boundary-breaking, or adversarial input
//   to the tRPC API and verify:
//   1. Server NEVER returns 500 for bad input — always 4xx
//   2. Server NEVER leaks stack traces, file paths, or internal SQL
//   3. Response times remain bounded even for oversized payloads
//   4. tRPC error envelopes are structurally correct on every bad request
//
// CATEGORIES TESTED
//   A. Auth endpoint bad inputs
//   B. tickets.create bad inputs
//   C. tickets.update bad inputs
//   D. Oversized payloads
//   E. Type confusion attacks (array where object expected, etc.)
//   F. Injection attempt payloads (SQL-like, JSON-injection)
//   G. Empty body / wrong Content-Type
//   H. Unauthenticated access to protected endpoints
//
// RUN
//   k6 run tests/k6/invalid_payload.js
//   k6 run -e BASE_URL=http://localhost:3001/trpc tests/k6/invalid_payload.js
// =============================================================================

import http             from "k6/http";
import { check, group } from "k6";
import { Counter, Rate } from "k6/metrics";

import {
  BASE_URL,
  ADMIN_USER,
  DEFAULT_OPTIONS,
  JSON_HEADERS,
  authHeaders,
  parseTrpc,
  randomSleep,
  login,
} from "./config.js";

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const unexpected500s     = new Counter("invalid_unexpected_500");
const stackLeaks         = new Counter("invalid_stack_leak");
const correctRejections  = new Rate("invalid_correct_rejection_rate");

// ---------------------------------------------------------------------------
// Test options — single VU, sequential, no concurrency needed here
// ---------------------------------------------------------------------------
export const options = {
  ...DEFAULT_OPTIONS,
  scenarios: {
    bad_inputs: {
      executor:   "constant-vus",
      vus:        1,
      duration:   "3m",
    },
  },
  thresholds: {
    "invalid_unexpected_500":       ["count==0"],   // zero 500s on bad input
    "invalid_stack_leak":           ["count==0"],   // zero internal leaks
    "invalid_correct_rejection_rate": ["rate>0.95"],// > 95 % of bad inputs rejected
    "http_req_duration":            ["p(95)<2000"],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function noStackLeak(res) {
  const body = res.body || "";
  return (
    !body.includes("at Object.")     &&  // JS stack frame
    !body.includes("at Module.")     &&
    !body.includes("/src/")          &&  // file path
    !body.includes("pg_")            &&  // PostgreSQL internal
    !body.includes("drizzle")        &&  // ORM name
    !body.includes("stacktrace")
  );
}

function is4xx(res) {
  // tRPC wraps errors in HTTP 200 with an error envelope, OR returns 400/401/422
  const { error } = parseTrpc(res);
  return res.status === 200
    ? error !== null                      // tRPC-level error in envelope
    : (res.status >= 400 && res.status < 500); // HTTP-level 4xx
}

function recordCheck(res, label) {
  const rejected = is4xx(res);
  const no500    = res.status < 500;
  const noLeak   = noStackLeak(res);

  check(res, {
    [`${label}: no 500`]:         (r) => r.status < 500,
    [`${label}: rejected/4xx`]:   (_) => rejected,
    [`${label}: no stack leak`]:  (_) => noLeak,
    [`${label}: bounded latency`]:(r) => r.timings.duration < 5000,
  });

  if (!no500)   unexpected500s.add(1);
  if (!noLeak)  stackLeaks.add(1);
  correctRejections.add(rejected ? 1 : 0);
}

// ---------------------------------------------------------------------------
// setup() — get a valid admin token for auth-required tests
// ---------------------------------------------------------------------------
export function setup() {
  const token = login(ADMIN_USER.email, ADMIN_USER.password);
  return { token };
}

// ---------------------------------------------------------------------------
// Default function — cycles through all bad-input categories
// ---------------------------------------------------------------------------
export default function (data) {
  const { token } = data;

  // ════════════════════════════════════════════════════════════════════════
  // CATEGORY A — auth.login bad inputs
  // ════════════════════════════════════════════════════════════════════════

  group("A_auth_bad_inputs", () => {

    // A1: Empty object
    recordCheck(
      http.post(`${BASE_URL}/auth.login`, JSON.stringify({}), { headers: JSON_HEADERS }),
      "A1_empty_object"
    );
    randomSleep(0.1, 0.3);

    // A2: null body
    recordCheck(
      http.post(`${BASE_URL}/auth.login`, "null", { headers: JSON_HEADERS }),
      "A2_null_body"
    );
    randomSleep(0.1, 0.3);

    // A3: email as integer
    recordCheck(
      http.post(`${BASE_URL}/auth.login`,
        JSON.stringify({ email: 12345, password: "pass" }),
        { headers: JSON_HEADERS }),
      "A3_email_integer"
    );
    randomSleep(0.1, 0.3);

    // A4: extremely long email (1 MB)
    const longEmail = "a".repeat(1_000_000) + "@test.com";
    recordCheck(
      http.post(`${BASE_URL}/auth.login`,
        JSON.stringify({ email: longEmail, password: "pass" }),
        { headers: JSON_HEADERS }),
      "A4_oversized_email"
    );
    randomSleep(0.2, 0.5);

    // A5: SQL-injection-style email
    recordCheck(
      http.post(`${BASE_URL}/auth.login`,
        JSON.stringify({ email: "' OR 1=1; --", password: "x" }),
        { headers: JSON_HEADERS }),
      "A5_sql_injection_email"
    );
    randomSleep(0.1, 0.3);

    // A6: Unicode / emoji in credentials
    recordCheck(
      http.post(`${BASE_URL}/auth.login`,
        JSON.stringify({ email: "test\u0000@test.com", password: "pass\u0000word" }),
        { headers: JSON_HEADERS }),
      "A6_null_byte_credentials"
    );
    randomSleep(0.1, 0.3);

    // A7: Array instead of object
    recordCheck(
      http.post(`${BASE_URL}/auth.login`,
        JSON.stringify([{ email: "x@x.com", password: "y" }]),
        { headers: JSON_HEADERS }),
      "A7_array_body"
    );
    randomSleep(0.1, 0.3);
  });

  // ════════════════════════════════════════════════════════════════════════
  // CATEGORY B — tickets.create bad inputs (authenticated)
  // ════════════════════════════════════════════════════════════════════════

  group("B_tickets_create_bad_inputs", () => {

    // B1: Missing required title
    recordCheck(
      http.post(`${BASE_URL}/tickets.create`,
        JSON.stringify({ description: "no title", type: "incident", priority: "low" }),
        { headers: authHeaders(token) }),
      "B1_missing_title"
    );
    randomSleep(0.1, 0.3);

    // B2: Invalid priority enum value
    recordCheck(
      http.post(`${BASE_URL}/tickets.create`,
        JSON.stringify({ title: "test", priority: "ULTRA_CRITICAL", type: "incident" }),
        { headers: authHeaders(token) }),
      "B2_invalid_priority_enum"
    );
    randomSleep(0.1, 0.3);

    // B3: Invalid type enum
    recordCheck(
      http.post(`${BASE_URL}/tickets.create`,
        JSON.stringify({ title: "test", type: "FAKE_TYPE", priority: "medium" }),
        { headers: authHeaders(token) }),
      "B3_invalid_type_enum"
    );
    randomSleep(0.1, 0.3);

    // B4: Title as object instead of string
    recordCheck(
      http.post(`${BASE_URL}/tickets.create`,
        JSON.stringify({ title: { nested: "object" }, type: "incident", priority: "low" }),
        { headers: authHeaders(token) }),
      "B4_title_as_object"
    );
    randomSleep(0.1, 0.3);

    // B5: Oversized title (100 KB)
    const bigTitle = "X".repeat(100_000);
    recordCheck(
      http.post(`${BASE_URL}/tickets.create`,
        JSON.stringify({ title: bigTitle, type: "incident", priority: "low" }),
        { headers: authHeaders(token) }),
      "B5_oversized_title"
    );
    randomSleep(0.2, 0.5);

    // B6: Extra unknown fields (should be stripped or rejected, never 500)
    recordCheck(
      http.post(`${BASE_URL}/tickets.create`,
        JSON.stringify({
          title:         "test",
          type:          "incident",
          priority:      "low",
          __proto__:     { admin: true },
          constructor:   "pwned",
          injectedField: "DROP TABLE tickets;",
        }),
        { headers: authHeaders(token) }),
      "B6_prototype_pollution"
    );
    randomSleep(0.1, 0.3);

    // B7: Deeply nested object (stack overflow probe)
    let deep = {};
    let ref = deep;
    for (let i = 0; i < 200; i++) {
      ref.child = {};
      ref = ref.child;
    }
    ref.title = "deep";
    recordCheck(
      http.post(`${BASE_URL}/tickets.create`,
        JSON.stringify(deep),
        { headers: authHeaders(token) }),
      "B7_deep_nested_object"
    );
    randomSleep(0.2, 0.4);
  });

  // ════════════════════════════════════════════════════════════════════════
  // CATEGORY C — tickets.update bad inputs
  // ════════════════════════════════════════════════════════════════════════

  group("C_tickets_update_bad_inputs", () => {

    // C1: Non-UUID id
    recordCheck(
      http.post(`${BASE_URL}/tickets.update`,
        JSON.stringify({ id: "not-a-uuid", status: "open" }),
        { headers: authHeaders(token) }),
      "C1_invalid_uuid"
    );
    randomSleep(0.1, 0.3);

    // C2: UUID that definitely does not exist
    recordCheck(
      http.post(`${BASE_URL}/tickets.update`,
        JSON.stringify({ id: "00000000-0000-0000-0000-000000000000", status: "open" }),
        { headers: authHeaders(token) }),
      "C2_nonexistent_uuid"
    );
    randomSleep(0.1, 0.3);

    // C3: Missing id field
    recordCheck(
      http.post(`${BASE_URL}/tickets.update`,
        JSON.stringify({ status: "resolved" }),
        { headers: authHeaders(token) }),
      "C3_missing_id"
    );
    randomSleep(0.1, 0.3);

    // C4: Invalid status enum
    recordCheck(
      http.post(`${BASE_URL}/tickets.update`,
        JSON.stringify({ id: "00000000-0000-0000-0000-000000000001", status: "FAKE" }),
        { headers: authHeaders(token) }),
      "C4_invalid_status_enum"
    );
    randomSleep(0.1, 0.3);
  });

  // ════════════════════════════════════════════════════════════════════════
  // CATEGORY D — Wrong Content-Type / malformed JSON
  // ════════════════════════════════════════════════════════════════════════

  group("D_malformed_transport", () => {

    // D1: Plain text body (not JSON)
    recordCheck(
      http.post(`${BASE_URL}/auth.login`,
        "email=admin&password=admin",
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }),
      "D1_form_encoded"
    );
    randomSleep(0.1, 0.3);

    // D2: Truncated JSON
    recordCheck(
      http.post(`${BASE_URL}/auth.login`,
        '{"email": "test@test.com", "pass',
        { headers: JSON_HEADERS }),
      "D2_truncated_json"
    );
    randomSleep(0.1, 0.3);

    // D3: Empty body
    recordCheck(
      http.post(`${BASE_URL}/auth.login`,
        "",
        { headers: JSON_HEADERS }),
      "D3_empty_body"
    );
    randomSleep(0.1, 0.3);

    // D4: Binary garbage
    recordCheck(
      http.post(`${BASE_URL}/auth.login`,
        "\x00\x01\x02\x03\xFF\xFE",
        { headers: JSON_HEADERS }),
      "D4_binary_body"
    );
    randomSleep(0.1, 0.3);
  });

  // ════════════════════════════════════════════════════════════════════════
  // CATEGORY E — Unauthenticated access to protected endpoints
  // ════════════════════════════════════════════════════════════════════════

  group("E_unauthenticated_access", () => {

    // E1: No auth header at all
    recordCheck(
      http.get(
        `${BASE_URL}/tickets.list?input=${encodeURIComponent(JSON.stringify({}))}`,
        { headers: { "Content-Type": "application/json" } }
      ),
      "E1_no_auth_header"
    );
    randomSleep(0.1, 0.3);

    // E2: Malformed bearer token
    recordCheck(
      http.get(
        `${BASE_URL}/tickets.list?input=${encodeURIComponent(JSON.stringify({}))}`,
        { headers: { "Authorization": "Bearer THIS_IS_NOT_A_VALID_TOKEN_XYZ" } }
      ),
      "E2_invalid_bearer_token"
    );
    randomSleep(0.1, 0.3);

    // E3: Bearer with empty string
    recordCheck(
      http.get(
        `${BASE_URL}/tickets.list?input=${encodeURIComponent(JSON.stringify({}))}`,
        { headers: { "Authorization": "Bearer " } }
      ),
      "E3_empty_bearer"
    );
    randomSleep(0.1, 0.3);

    // E4: Wrong scheme (Basic instead of Bearer)
    recordCheck(
      http.get(
        `${BASE_URL}/tickets.list?input=${encodeURIComponent(JSON.stringify({}))}`,
        { headers: { "Authorization": "Basic dXNlcjpwYXNz" } }
      ),
      "E4_wrong_auth_scheme"
    );
    randomSleep(0.1, 0.3);
  });

  randomSleep(0.5, 1.5);
}

// ---------------------------------------------------------------------------
// handleSummary
// ---------------------------------------------------------------------------
export function handleSummary(data) {
  const sv500s   = data.metrics?.invalid_unexpected_500?.values?.count       ?? 0;
  const leaks    = data.metrics?.invalid_stack_leak?.values?.count           ?? 0;
  const rejRate  = data.metrics?.invalid_correct_rejection_rate?.values?.rate ?? 0;
  const p95      = data.metrics?.http_req_duration?.values?.["p(95)"]         ?? 0;

  console.log("========== INVALID PAYLOAD SUMMARY ==========");
  console.log(`Unexpected 500s     : ${sv500s}  (must be 0)`);
  console.log(`Stack trace leaks   : ${leaks}   (must be 0)`);
  console.log(`Correct rejections  : ${(rejRate * 100).toFixed(1)} %`);
  console.log(`HTTP p(95)          : ${p95.toFixed(1)} ms`);
  console.log("=============================================");

  return { stdout: JSON.stringify(data, null, 2) };
}
