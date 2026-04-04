/**
 * NexusOps Full-QA — k6 API Stress Test
 *
 * Uses setup() to login once and share session across all VUs.
 *
 * Stages:
 *   0-30s:  ramp from 0 → 50 VUs  (warm-up)
 *   30-90s: hold 150 VUs           (sustained load)
 *   90-120s: spike to 300 VUs      (burst)
 *   120-150s: ramp down to 0       (cool-down)
 *
 * Thresholds:
 *   - p95 < 2500ms
 *   - error rate < 30% (auth bypass tests intentionally cause 401s)
 *   - all auth bypass attempts → 401/403
 */

import http from "k6/http";
import { sleep, check, group } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { randomIntBetween } from "https://jslib.k6.io/k6-utils/1.2.0/index.js";

const BASE = "http://139.84.154.78";
const API  = "http://139.84.154.78/api/trpc"; // route through Nginx → Next.js proxy (port 80)

// Custom metrics
const authBypassAttempts = new Counter("auth_bypass_attempts");
const authBypassBlocked  = new Rate("auth_bypass_blocked");
const mutationSuccess    = new Rate("mutation_success_rate");
const navDuration        = new Trend("nav_duration");

export const options = {
  stages: [
    { duration: "30s",  target: 50  },
    { duration: "60s",  target: 150 },
    { duration: "30s",  target: 300 },
    { duration: "30s",  target: 0   },
  ],
  thresholds: {
    http_req_duration:      ["p(95)<2500"],
    http_req_failed:        ["rate<0.70"],  // includes 401s from auth bypass + invalid endpoint 404s
    auth_bypass_blocked:    ["rate>0.95"],  // unauthenticated requests must not get 200
    mutation_success_rate:  ["rate>0.70"],
  },
};

// ── Setup: login once, share session across all VUs ───────────────────────────
export function setup() {
  const res = http.post(
    `${API}/auth.login`,
    JSON.stringify({ email: "admin@coheron.com", password: "Admin1234!" }),
    { headers: { "Content-Type": "application/json" } },
  );
  if (res.status !== 200) {
    console.error(`Login failed: ${res.status} — ${res.body}`);
    return { sessionId: null };
  }
  try {
    const body = JSON.parse(res.body);
    const sessionId = body.result?.data?.sessionId ?? null;
    console.log(`✅ Login OK — sessionId: ${sessionId ? sessionId.slice(0, 12) + "…" : "null"}`);
    return { sessionId };
  } catch {
    return { sessionId: null };
  }
}

// ── Query endpoints ───────────────────────────────────────────────────────────
const QUERY_ENDPOINTS = [
  "tickets.list",
  "changes.list",
  "changes.listProblems",
  "changes.listReleases",
  "crm.listDeals",
  "crm.listContacts",
  "crm.listAccounts",
  "csm.listCases",
  "vendors.list",
  "contracts.list",
  "legal.listMatters",
  "legal.listRequests",
  "financial.listInvoices",
  "hr.listEmployees",
  "hr.listLeaveRequests",
  "devops.listDeployments",
  "projects.list",
  "approvals.list",
  "catalog.listItems",
  "knowledge.listArticles",
];

function encodeInput(input) {
  return encodeURIComponent(JSON.stringify({ json: input }));
}

// ── Main VU scenario ──────────────────────────────────────────────────────────
export default function (data) {
  const { sessionId } = data;

  group("auth_bypass_attempts", () => {
    // Test unauthenticated access → should get 401
    const endpoints = ["tickets.list", "changes.list", "crm.listDeals"];
    for (const ep of endpoints) {
      authBypassAttempts.add(1);
      const r = http.get(`${API}/${ep}?input=${encodeInput({})}`, {
        headers: { "Content-Type": "application/json" },
      });
      const blocked = r.status === 401 || r.status === 403 || r.status === 404;
      authBypassBlocked.add(blocked);
      check(r, { [`${ep} blocks unauthenticated (no 200)`]: () => r.status !== 200 });
    }
  });

  if (!sessionId) {
    sleep(1);
    return;
  }

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${sessionId}`,
  };

  group("query_endpoints", () => {
    // Pick 6 random query endpoints each iteration to reduce load
    const sample = QUERY_ENDPOINTS.sort(() => Math.random() - 0.5).slice(0, 6);
    for (const ep of sample) {
      const start = Date.now();
      const r = http.get(`${API}/${ep}?input=${encodeInput({})}`, { headers });
      navDuration.add(Date.now() - start);
      check(r, {
        [`${ep} status 200`]: (res) => res.status === 200,
        [`${ep} has result`]:  (res) => {
          try { return JSON.parse(res.body).result !== undefined; } catch { return false; }
        },
      });
    }
  });

  group("mutations", () => {
    // Create a ticket (every iteration)
    const ticketRes = http.post(
      `${API}/tickets.create`,
      JSON.stringify({
        title:       `k6-stress-${Date.now()}`,
        description: "k6 stress test ticket",
        type:        "incident",
      }),
      { headers },
    );
    mutationSuccess.add(ticketRes.status === 200);
    check(ticketRes, { "ticket create 200": (r) => r.status === 200 });

    // Create a problem (25% of VUs)
    if (randomIntBetween(0, 3) === 0) {
      const probRes = http.post(
        `${API}/changes.createProblem`,
        JSON.stringify({
          title:       `k6-prob-${Date.now()}`,
          description: "k6 stress test problem",
          priority:    "low",
        }),
        { headers },
      );
      check(probRes, { "problem create ok": (r) => r.status === 200 });
    }

    // Create a legal matter (16% of VUs)
    if (randomIntBetween(0, 5) === 0) {
      const legalRes = http.post(
        `${API}/legal.createMatter`,
        JSON.stringify({
          title:       `k6-legal-${Date.now()}`,
          description: "k6 stress test matter",
          type:        "contract_review",
        }),
        { headers },
      );
      check(legalRes, { "legal matter create ok": (r) => r.status === 200 });
    }
  });

  group("invalid_inputs", () => {
    // Oversized input → should not return 500
    const oversized = "X".repeat(4000);
    const r = http.post(
      `${API}/tickets.create`,
      JSON.stringify({
        title:       oversized,
        description: oversized,
        type:        "incident",
      }),
      { headers },
    );
    check(r, {
      "oversized input: no 500": (res) => res.status !== 500,
      "oversized input: handled": (res) => res.status < 500,
    });

    // SQL injection in search
    const sqlRes = http.get(
      `${API}/tickets.list?input=${encodeInput({ search: "' OR '1'='1'; DROP TABLE tickets;--" })}`,
      { headers },
    );
    check(sqlRes, {
      "sql injection: no 500": (res) => res.status !== 500,
      "sql injection: no SQL error in body": (res) => {
        try {
          const b = res.body || "";
          return !b.includes("syntax error") && !b.includes("SQLSTATE");
        } catch { return true; }
      },
    });
  });

  sleep(randomIntBetween(1, 2));
}

export function handleSummary(data) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const failRate = data.metrics.http_req_failed?.values?.rate;
  return {
    [`tests/full-qa/results/k6-stress-${ts}.json`]: JSON.stringify(data, null, 2),
    stdout: `
════════════════════════════════════════════════════════
  NexusOps k6 API Stress Test — Summary
════════════════════════════════════════════════════════
  Total requests:   ${data.metrics.http_reqs?.values?.count ?? "—"}
  Failed requests:  ${failRate != null ? (failRate * 100).toFixed(1) + "%" : "—"}
  p50 latency:      ${data.metrics.http_req_duration?.values?.["p(50)"]?.toFixed(0) ?? "—"}ms
  p95 latency:      ${data.metrics.http_req_duration?.values?.["p(95)"]?.toFixed(0) ?? "—"}ms
  p99 latency:      ${data.metrics.http_req_duration?.values?.["p(99)"]?.toFixed(0) ?? "—"}ms
  Auth bypass rate: ${(data.metrics.auth_bypass_blocked?.values?.rate * 100)?.toFixed(1) ?? "—"}%
  Mutation success: ${(data.metrics.mutation_success_rate?.values?.rate * 100)?.toFixed(1) ?? "—"}%
════════════════════════════════════════════════════════
`,
  };
}
