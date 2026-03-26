#!/usr/bin/env node
/**
 * NexusOps — Lightweight load simulation
 *
 * Simulates 20–50 concurrent users hitting critical API endpoints.
 * Validates stability under parallel reads and writes.
 *
 * Usage:
 *   node scripts/load-test.js
 *   CONCURRENCY=20 node scripts/load-test.js
 *   BASE_URL=http://localhost:3001 node scripts/load-test.js
 */

const BASE = (process.env.BASE_URL ?? "http://localhost:3001") + "/trpc";
const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? "50", 10);
const EMAIL = process.env.LOAD_TEST_EMAIL ?? "admin@coheron.com";
const PASSWORD = process.env.LOAD_TEST_PASSWORD ?? "demo1234!";

// ── Helpers ────────────────────────────────────────────────────────────────

function trpcMutation(path, body, token) {
  return fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function trpcQuery(path, input, token) {
  const qs = input && Object.keys(input).length > 0
    ? `?input=${encodeURIComponent(JSON.stringify(input))}`
    : "";
  return fetch(`${BASE}/${path}${qs}`, {
    method: "GET",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function login() {
  const res = await trpcMutation("auth.login", { email: EMAIL, password: PASSWORD });
  const json = await res.json();
  const token = json?.result?.data?.sessionId;
  if (!token) {
    console.error("❌  Login failed:", JSON.stringify(json).slice(0, 200));
    process.exit(1);
  }
  return token;
}

// ── Scenario definitions ───────────────────────────────────────────────────

/**
 * Each scenario returns { name, fn(token, i) } where fn returns a fetch Promise.
 * We weigh scenarios to mimic realistic traffic: reads >> writes.
 *
 * Distribution across CONCURRENCY requests:
 *   40% — tickets.list (read)
 *   20% — tickets.statusCounts (read)
 *   10% — auth.me (read)
 *   10% — dashboard.getMetrics (read)
 *   10% — changes.list (read)
 *   10% — tickets.create (write)
 */
const SCENARIOS = [
  { name: "tickets.list",         weight: 40, fn: (t)    => trpcQuery("tickets.list",               { limit: 20 },  t) },
  { name: "tickets.statusCounts", weight: 20, fn: (t)    => trpcQuery("tickets.statusCounts",        {},             t) },
  { name: "auth.me",              weight: 10, fn: (t)    => trpcQuery("auth.me",                     {},             t) },
  { name: "dashboard.getMetrics", weight: 10, fn: (t)    => trpcQuery("dashboard.getMetrics",        {},             t) },
  { name: "changes.list",         weight: 10, fn: (t)    => trpcQuery("changes.list",                { limit: 20 },  t) },
  { name: "tickets.create",       weight: 10, fn: (t, i) => trpcMutation("tickets.create", {
      title: `Load test ticket ${i}`,
      description: "Automated load test",
      type: "incident",
      tags: ["load-test"],
    }, t),
  },
];

/** Expand scenarios by weight into a flat array, then cycle through it. */
function buildRequestQueue(count) {
  const pool = [];
  for (const s of SCENARIOS) {
    const n = Math.round((s.weight / 100) * count);
    for (let j = 0; j < n; j++) pool.push(s);
  }
  // Pad or trim to exactly `count`
  while (pool.length < count) pool.push(SCENARIOS[0]);
  return pool.slice(0, count);
}

// ── Runner ─────────────────────────────────────────────────────────────────

async function executeRequest(scenario, token, index) {
  const start = Date.now();
  let status = 0;
  let trpcCode = null;
  let error = null;

  try {
    const res = await scenario.fn(token, index);
    status = res.status;

    const json = await res.json().catch(() => null);
    trpcCode = json?.error?.data?.code ?? null;

    if (status >= 500) {
      error = json?.error?.message ?? "Server error";
    }
  } catch (e) {
    status = 0; // network failure
    error = e.message;
  }

  return { scenario: scenario.name, status, trpcCode, durationMs: Date.now() - start, error };
}

// ── Reporting ──────────────────────────────────────────────────────────────

function printReport(results, wallMs) {
  const total = results.length;
  const byScenario = {};
  const statusGroups = { "2xx": 0, "4xx": 0, "5xx": 0, network: 0 };
  const durations = [];

  for (const r of results) {
    if (!byScenario[r.scenario]) {
      byScenario[r.scenario] = { ok: 0, fail: 0, total: 0, durations: [] };
    }
    const s = byScenario[r.scenario];
    s.total++;
    s.durations.push(r.durationMs);
    durations.push(r.durationMs);

    if (r.status >= 200 && r.status < 300)      { s.ok++;   statusGroups["2xx"]++; }
    else if (r.status >= 400 && r.status < 500) { s.fail++; statusGroups["4xx"]++; }
    else if (r.status >= 500)                    { s.fail++; statusGroups["5xx"]++; }
    else                                          { s.fail++; statusGroups.network++; }
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);

  console.log("\n" + "═".repeat(60));
  console.log("  NexusOps Load Test Results");
  console.log("═".repeat(60));
  console.log(`  Concurrency : ${total} requests`);
  console.log(`  Wall time   : ${wallMs} ms`);
  console.log(`  Throughput  : ${((total / wallMs) * 1000).toFixed(1)} req/s`);
  console.log("─".repeat(60));
  console.log("  Latency");
  console.log(`    avg : ${avg} ms`);
  console.log(`    p50 : ${p50} ms`);
  console.log(`    p95 : ${p95} ms`);
  console.log(`    p99 : ${p99} ms`);
  console.log("─".repeat(60));
  console.log("  Status breakdown");
  console.log(`    2xx (success) : ${statusGroups["2xx"]}  (${pct(statusGroups["2xx"], total)})`);
  console.log(`    4xx (client)  : ${statusGroups["4xx"]}  (${pct(statusGroups["4xx"], total)})`);
  console.log(`    5xx (server)  : ${statusGroups["5xx"]}  (${pct(statusGroups["5xx"], total)})`);
  console.log(`    network err   : ${statusGroups.network}  (${pct(statusGroups.network, total)})`);
  console.log("─".repeat(60));
  console.log("  Per scenario");
  for (const [name, s] of Object.entries(byScenario)) {
    const scenarioP95 = [...s.durations].sort((a, b) => a - b)[Math.floor(s.durations.length * 0.95)];
    const okPct = pct(s.ok, s.total);
    const icon = s.fail === 0 ? "✓" : "✗";
    console.log(`    ${icon} ${name.padEnd(24)} ${String(s.total).padStart(3)} reqs  ${okPct} ok  p95=${scenarioP95}ms`);
  }
  console.log("─".repeat(60));

  const failures = results.filter((r) => r.status >= 500 || r.status === 0);
  if (failures.length > 0) {
    console.log(`  ⚠  ${failures.length} server/network failures:`);
    const seen = new Set();
    for (const f of failures.slice(0, 5)) {
      const key = `${f.scenario}|${f.status}|${f.error}`;
      if (!seen.has(key)) {
        seen.add(key);
        console.log(`     ${f.scenario} → HTTP ${f.status}: ${f.error ?? "(no body)"}`);
      }
    }
  }

  const conflicts = results.filter((r) => r.status === 409 || r.trpcCode === "CONFLICT");
  if (conflicts.length > 0) {
    console.log(`  ℹ  ${conflicts.length} CONFLICT responses (expected under concurrency)`);
  }

  console.log("═".repeat(60));

  // Exit 1 if any 5xx or network errors
  if (statusGroups["5xx"] > 0 || statusGroups.network > 0) {
    console.error(`\n  FAIL: ${statusGroups["5xx"]} server errors, ${statusGroups.network} network errors\n`);
    process.exit(1);
  }
  console.log("  PASS: No server errors\n");
}

function pct(n, total) {
  return total === 0 ? "0%" : `${Math.round((n / total) * 100)}%`;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\nNexusOps load test — ${CONCURRENCY} concurrent requests → ${BASE}`);
  console.log("Authenticating...");

  const token = await login();
  console.log(`Session token acquired (${token.slice(0, 12)}...)\n`);

  const queue = buildRequestQueue(CONCURRENCY);
  console.log(`Firing ${queue.length} requests simultaneously...`);

  const wallStart = Date.now();
  const settled = await Promise.allSettled(
    queue.map((scenario, i) => executeRequest(scenario, token, i)),
  );
  const wallMs = Date.now() - wallStart;

  const results = settled.map((s) =>
    s.status === "fulfilled" ? s.value : { scenario: "unknown", status: 0, trpcCode: null, durationMs: 0, error: s.reason?.message },
  );

  printReport(results, wallMs);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
