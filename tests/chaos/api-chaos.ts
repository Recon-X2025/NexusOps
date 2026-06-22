#!/usr/bin/env node
/**
 * CoheronConnect API Chaos Abuser
 *
 * 200 concurrent async loops hammering:
 *   - tickets.list      (GET query)
 *   - dashboard.getMetrics (GET query)
 *   - tickets.create    (POST mutation)
 *   - tickets.update    (POST mutation — race condition)
 *   - auth.login        (POST — repeated login storm)
 *   - /internal/metrics (GET — observer endpoint)
 *   - /internal/health  (GET — health endpoint)
 *
 * Sends valid, invalid, missing-field, and oversized payloads.
 * Tracks: 2xx/4xx/5xx counts, latency percentiles, errors, crashes.
 */

// ── Config ────────────────────────────────────────────────────────────────────
const API_URL       = process.env["NEXUS_QA_API_URL"] ?? "http://localhost:3001";
const WEB_URL       = process.env["NEXUS_QA_BASE_URL"] ?? process.env["CHAOS_BASE_URL"] ?? "http://localhost:3000";
const EMAIL         = "admin@coheron.com";
const PASSWORD      = "demo1234!";
const CONCURRENCY   = 200;
const DURATION_MS   = 5 * 60 * 1000; // 5 minutes
const LONG_STRING   = "X".repeat(50_000);
const MEDIUM_STRING = "Y".repeat(5_000);
const SPECIAL_CHARS = `<script>alert(1)</script>; DROP TABLE--'"\`{}[]`;

// ── Telemetry ─────────────────────────────────────────────────────────────────
const metrics = {
  total:      0,
  ok200:      0,
  err4xx:     0,
  err5xx:     0,
  errors:     0,
  latencies:  [] as number[],
  endpoints:  {} as Record<string, { count: number; errors: number; latencies: number[] }>,
  criticals:  [] as string[],  // 500s, crashes, panics
  anomalies:  [] as string[],  // unexpected responses
  duplicates: [] as string[],  // detected duplicate data
};

const createdTicketIds: string[] = [];

// ── Utilities ─────────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function trackEndpoint(name: string, ms: number, ok: boolean): void {
  if (!metrics.endpoints[name]) {
    metrics.endpoints[name] = { count: 0, errors: 0, latencies: [] };
  }
  const ep = metrics.endpoints[name];
  ep.count++;
  ep.latencies.push(ms);
  if (!ok) ep.errors++;
}

function percentile(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx    = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Auth ──────────────────────────────────────────────────────────────────────
let SESSION_ID = "";

async function login(): Promise<string> {
  const res = await fetch(`${API_URL}/trpc/auth.login`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const data: unknown = await res.json();
  const sessionId = (data as { result?: { data?: { sessionId?: string } } })?.result?.data?.sessionId ?? "";
  if (!sessionId) throw new Error(`Login failed: ${JSON.stringify(data).slice(0, 200)}`);
  return sessionId;
}

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${SESSION_ID}`,
  };
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function post(endpoint: string, body: unknown): Promise<{ status: number; data: unknown; ms: number }> {
  const start = Date.now();
  try {
    const res  = await fetch(`${API_URL}/trpc/${endpoint}`, {
      method:  "POST",
      headers: authHeaders(),
      body:    JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    const ms   = Date.now() - start;
    metrics.total++;
    metrics.latencies.push(ms);
    if (res.status >= 500) { metrics.err5xx++; metrics.criticals.push(`${endpoint} 500: ${JSON.stringify(data).slice(0, 200)}`); }
    else if (res.status >= 400) metrics.err4xx++;
    else metrics.ok200++;
    trackEndpoint(endpoint, ms, res.status < 400);
    return { status: res.status, data, ms };
  } catch (e: unknown) {
    metrics.errors++;
    trackEndpoint(endpoint, Date.now() - start, false);
    return { status: 0, data: null, ms: Date.now() - start };
  }
}

async function get(path: string): Promise<{ status: number; data: unknown; ms: number }> {
  const start = Date.now();
  try {
    const res  = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${SESSION_ID}` } });
    const data = await res.json().catch(() => null);
    const ms   = Date.now() - start;
    metrics.total++;
    metrics.latencies.push(ms);
    if (res.status >= 500) { metrics.err5xx++; metrics.criticals.push(`GET ${path} 500: ${JSON.stringify(data).slice(0, 200)}`); }
    else if (res.status >= 400) metrics.err4xx++;
    else metrics.ok200++;
    trackEndpoint(`GET:${path}`, ms, res.status < 400);
    return { status: res.status, data, ms };
  } catch (e: unknown) {
    metrics.errors++;
    return { status: 0, data: null, ms: Date.now() - start };
  }
}

// ── Payloads ──────────────────────────────────────────────────────────────────
function validTicketPayload() {
  const priorities = ["low", "medium", "high", "critical"];
  const types      = ["incident", "service_request", "change", "problem"];
  return {
    title:       `Chaos-${Date.now()}-${rand(1000, 9999)}`,
    description: "Automated chaos test ticket",
    priority:    priorities[rand(0, priorities.length - 1)],
    type:        types[rand(0, types.length - 1)],
  };
}

const INVALID_PAYLOADS = [
  // Missing required fields
  {},
  { title: "" },
  { title: null },
  // Invalid enum values
  { title: "test", priority: "ULTRA_CRITICAL", type: "incident" },
  { title: "test", priority: "medium", type: "hack_attempt" },
  // Oversized fields
  { title: LONG_STRING, description: LONG_STRING, priority: "medium", type: "incident" },
  { title: MEDIUM_STRING, priority: "medium", type: "incident" },
  // Prototype pollution
  { __proto__: { admin: true }, title: "hack", priority: "medium", type: "incident" },
  { constructor: { prototype: { admin: true } }, title: "hack", priority: "medium", type: "incident" },
  // XSS in title/description
  { title: SPECIAL_CHARS, description: SPECIAL_CHARS, priority: "medium", type: "incident" },
  // Type confusion
  { title: 42, priority: ["medium"], type: { name: "incident" } },
  // Deeply nested
  { title: "test", meta: { nested: { deeply: { very: { nested: "value" } } } }, priority: "medium", type: "incident" },
];

// ── Worker loops ───────────────────────────────────────────────────────────────

/** Loop A: Valid ticket CRUD + race conditions */
async function validCrudLoop(deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    // Create
    const res = await post("tickets.create", validTicketPayload());
    const ticketId = (res.data as { result?: { data?: { id?: string } } })?.result?.data?.id;
    if (ticketId) createdTicketIds.push(ticketId);

    // List
    await post("tickets.list", { limit: 20, offset: 0 });

    // Update a recently created ticket
    if (createdTicketIds.length > 0) {
      const id = createdTicketIds[rand(0, Math.min(createdTicketIds.length - 1, 20))];
      await post("tickets.update", { id, data: { status: "in_progress", priority: "high" } });
    }

    await sleep(rand(100, 500));
  }
}

/** Loop B: Invalid payload flood */
async function invalidPayloadLoop(deadline: number): Promise<void> {
  let idx = 0;
  while (Date.now() < deadline) {
    const payload = INVALID_PAYLOADS[idx % INVALID_PAYLOADS.length];
    const res     = await post("tickets.create", payload);

    // A 500 on invalid input is a CRITICAL finding
    if (res.status === 500) {
      metrics.criticals.push(`INVALID_PAYLOAD_500: ${JSON.stringify(payload).slice(0, 100)}`);
    }

    idx++;
    await sleep(rand(50, 200));
  }
}

/** Loop C: Race condition — concurrent updates to SAME ticket */
async function raceConditionLoop(deadline: number, targetId: string | null): Promise<void> {
  if (!targetId) return;
  while (Date.now() < deadline) {
    const statuses = ["open", "in_progress", "resolved", "closed"];
    const updates  = Array.from({ length: 10 }, () =>
      post("tickets.update", {
        id:   targetId,
        data: { status: statuses[rand(0, statuses.length - 1)] },
      }),
    );
    await Promise.all(updates);
    await sleep(rand(200, 600));
  }
}

/** Loop D: Auth storm — repeated logins */
async function authStormLoop(deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    // Valid login
    const validRes = await fetch(`${API_URL}/trpc/auth.login`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    }).then((r) => { metrics.total++; return r.status; }).catch(() => { metrics.errors++; return 0; });

    // Wrong password (should 401 not 500)
    const wrongRes = await fetch(`${API_URL}/trpc/auth.login`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email: EMAIL, password: "WRONG_PW_CHAOS" }),
    }).then((r) => { metrics.total++; return r.status; }).catch(() => { metrics.errors++; return 0; });

    if (wrongRes === 500) {
      metrics.criticals.push("AUTH_WRONG_PW_500: wrong password caused 500");
    }

    await sleep(rand(100, 400));
  }
}

/** Loop E: Internal endpoints */
async function observabilityLoop(deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    await get("/internal/metrics");
    await get("/internal/health");
    await get("/health");
    await sleep(rand(500, 1500));
  }
}

/** Loop F: Dashboard metrics hammer */
async function dashboardLoop(deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    await post("dashboard.getMetrics", {});
    await sleep(rand(200, 800));
  }
}

/** Loop G: Oversized request flood */
async function oversizedLoop(deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    await post("tickets.create", { title: LONG_STRING, description: LONG_STRING, priority: "medium", type: "incident" });
    await sleep(rand(500, 1000));
  }
}

/** Loop H: Concurrent ticket creation for duplicate detection */
async function duplicateDetectionLoop(deadline: number): Promise<void> {
  const title = `DEDUP-${Date.now()}`;
  while (Date.now() < deadline) {
    // Send 5 identical creates simultaneously
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        post("tickets.create", { title, description: "dedup test", priority: "low", type: "incident" }),
      ),
    );
    const created = results.filter((r) => r.status === 200);
    if (created.length > 1) {
      metrics.duplicates.push(`DUPLICATE: title="${title}" created ${created.length} times at ${new Date().toISOString()}`);
    }
    await sleep(rand(2000, 4000));
  }
}

// ── Progress ticker ───────────────────────────────────────────────────────────
function startProgressTicker(deadline: number): NodeJS.Timeout {
  return setInterval(() => {
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const errRate   = metrics.total > 0 ? ((metrics.err5xx + metrics.errors) / metrics.total * 100).toFixed(1) : "0.0";
    const p95       = percentile(metrics.latencies, 95);
    process.stdout.write(
      `\r[${remaining}s left] req=${metrics.total} 200s=${metrics.ok200} 4xx=${metrics.err4xx} 5xx=${metrics.err5xx} net-err=${metrics.errors} ` +
      `err%=${errRate} p95=${p95}ms crits=${metrics.criticals.length} dupes=${metrics.duplicates.length}    `,
    );
  }, 2000);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  CoheronConnect API CHAOS ABUSER — 200 concurrent workers");
  console.log(`  Target: ${API_URL}`);
  console.log(`  Duration: ${DURATION_MS / 60000} minutes`);
  console.log("═══════════════════════════════════════════════════════");

  // Login to get session
  console.log("→ Authenticating...");
  try {
    SESSION_ID = await login();
    console.log(`✓ Session: ${SESSION_ID.slice(0, 12)}...`);
  } catch (e: unknown) {
    console.error("✗ Login failed:", (e as Error).message);
    process.exit(1);
  }

  // Get an initial ticket to use as race condition target
  const listRes  = await post("tickets.list", { limit: 1, offset: 0 });
  const firstId: string | null = (listRes.data as { result?: { data?: { items?: Array<{ id: string }> } } })?.result?.data?.items?.[0]?.id ?? null;
  console.log(`→ Race condition target: ${firstId ?? "none (will create)"}`);

  const deadline = Date.now() + DURATION_MS;
  const ticker   = startProgressTicker(deadline);

  console.log(`\n→ Launching ${CONCURRENCY} concurrent workers...\n`);

  // Distribute workers across loop types
  const workers: Promise<void>[] = [];

  for (let i = 0; i < CONCURRENCY; i++) {
    const type = i % 8;
    switch (type) {
      case 0: case 1: workers.push(validCrudLoop(deadline));        break;
      case 2: case 3: workers.push(invalidPayloadLoop(deadline));   break;
      case 4:         workers.push(raceConditionLoop(deadline, firstId)); break;
      case 5:         workers.push(authStormLoop(deadline));        break;
      case 6:         workers.push(dashboardLoop(deadline));        break;
      case 7:         workers.push(observabilityLoop(deadline));    break;
    }
  }

  // Extra dedicated loops
  workers.push(duplicateDetectionLoop(deadline));
  workers.push(oversizedLoop(deadline));

  await Promise.allSettled(workers);
  clearInterval(ticker);
  process.stdout.write("\n");

  // ── Print summary ───────────────────────────────────────────────────────────
  const errRate = metrics.total > 0 ? (((metrics.err5xx + metrics.errors) / metrics.total) * 100).toFixed(2) : "0.00";
  const p50     = percentile(metrics.latencies, 50);
  const p95     = percentile(metrics.latencies, 95);
  const p99     = percentile(metrics.latencies, 99);

  const summary = {
    total_requests:    metrics.total,
    ok_200:            metrics.ok200,
    client_errors_4xx: metrics.err4xx,
    server_errors_5xx: metrics.err5xx,
    network_errors:    metrics.errors,
    error_rate_pct:    parseFloat(errRate),
    latency: { p50, p95, p99, max: Math.max(...(metrics.latencies.length ? metrics.latencies : [0])) },
    critical_findings: metrics.criticals,
    duplicate_tickets: metrics.duplicates,
    anomalies:         metrics.anomalies,
    endpoints:         Object.fromEntries(
      Object.entries(metrics.endpoints).map(([k, v]) => [
        k,
        {
          count:         v.count,
          errors:        v.errors,
          error_rate:    v.count > 0 ? (v.errors / v.count).toFixed(3) : "0",
          avg_latency:   v.latencies.length ? Math.round(v.latencies.reduce((a, b) => a + b, 0) / v.latencies.length) : 0,
          p95_latency:   percentile(v.latencies, 95),
        },
      ]),
    ),
    tickets_created: createdTicketIds.length,
  };

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  RESULTS SUMMARY");
  console.log("═══════════════════════════════════════════════════════");
  console.log(JSON.stringify(summary, null, 2));

  // Write to file
  const { writeFileSync, mkdirSync } = await import("fs");
  mkdirSync("results", { recursive: true });
  writeFileSync("results/api-chaos-results.json", JSON.stringify(summary, null, 2));
  console.log("\n✓ Results written to results/api-chaos-results.json");
}

main().catch((e: unknown) => {
  console.error("FATAL:", (e as Error).message);
  process.exit(1);
});
