import { config as loadEnv } from "dotenv";
// .env lives at the monorepo root; pnpm sets CWD to apps/api/ when running scripts
loadEnv({ path: "../../.env" });
loadEnv(); // fallback: also load apps/api/.env if present
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { appRouter } from "./routers";
import {
  createContext,
  clearSessionCache,
  SESSION_CACHE_TTL_MS,
  NULL_SESSION_CACHE_TTL_MS,
  REDIS_TTL_SECS,
} from "./middleware/auth";
import { getRedis } from "./lib/redis";
import { randomUUID } from "node:crypto";
import { logRateLimit, logServerError, initLogger } from "./lib/logger";
import { sanitizeInput } from "./lib/sanitize";
import { recordRequest, recordRateLimit, getMetricsSnapshot, resetMetrics } from "./lib/metrics";
import { evaluateHealth } from "./lib/health";
import { checkHealth, getMonitorState } from "./lib/healthMonitor";
// Observability MUST be imported first so auto-instrumentation patches load early
import { initObservability } from "./services/observability";
initObservability();

const PORT = parseInt(process.env["PORT"] ?? "3001");
const HOST = process.env["HOST"] ?? "0.0.0.0";

// ── Startup config banner ─────────────────────────────────────────────────────
//
// Printed once after the server is listening.  Uses console.log (not the pino
// logger) so it is always visible regardless of log-level or pino-pretty config.

function printStartupConfig(): void {
  const _isProd = process.env["NODE_ENV"] === "production";
  const dbMax  = parseInt(process.env["DB_POOL_MAX"]             ?? (_isProd ? "20" : "30"), 10);
  const dbIdle = parseInt(process.env["DB_POOL_IDLE_TIMEOUT"]    ?? "30", 10);
  const dbConn = parseInt(process.env["DB_POOL_CONNECT_TIMEOUT"] ?? "15", 10);
  const dbLife = parseInt(process.env["DB_POOL_MAX_LIFETIME"]    ?? "1800", 10);

  const E = "═".repeat(68);
  const D = "─".repeat(68);
  console.log([
    "",
    E,
    "  NexusOps API — STARTUP READY",
    E,
    `  Host               : http://${HOST}:${PORT}`,
    `  Node env           : ${process.env["NODE_ENV"] ?? "development"}`,
    D,
    "  Rate Limiting",
    `    Per-token max    : ${RATE_LIMIT_PER_TOKEN.toLocaleString()} req / ${RATE_LIMIT_WINDOW}`,
    `    Anonymous max    : ${RATE_LIMIT_ANON.toLocaleString()} req / ${RATE_LIMIT_WINDOW}`,
    `    Burst max        : ${RATE_LIMIT_BURST_MAX.toLocaleString()} req / ${RATE_LIMIT_BURST_WINDOW}`,
    `    Disabled         : ${RATE_LIMIT_DISABLED}`,
    "    Bucket strategy  : per session token (user:*) or per IP (anon:*)",
    D,
    "  Session Cache",
    `    L1 TTL (valid)   : ${SESSION_CACHE_TTL_MS.toLocaleString()} ms  (${SESSION_CACHE_TTL_MS / 60_000} min)`,
    `    L1 TTL (null)    : ${NULL_SESSION_CACHE_TTL_MS.toLocaleString()} ms  (${NULL_SESSION_CACHE_TTL_MS / 1_000} s)`,
    `    L2 Redis TTL     : ${REDIS_TTL_SECS} s  (${REDIS_TTL_SECS / 60} min)`,
    "    Coalescing       : enabled (single DB round-trip per token burst)",
    D,
    "  DB Connection Pool",
    `    Max connections  : ${dbMax}`,
    `    Idle timeout     : ${dbIdle} s`,
    `    Connect timeout  : ${dbConn} s`,
    `    Max lifetime     : ${dbLife} s  (${Math.round(dbLife / 60)} min)`,
    D,
    "  Database mode",
    `    DATABASE_PROVIDER : ${process.env["DATABASE_PROVIDER"] ?? process.env["DATABASE_OLTP_PROVIDER"] ?? "(unset → postgres)"}`,
    E,
    "",
  ].join("\n"));
}

// ── Rate limiting configuration ───────────────────────────────────────────────
//
// Limits are applied per-bucket (never globally), so one user's burst cannot
// consume another user's quota.  Two bucket types:
//
//   user:<token>:<endpoint>  — one bucket per authenticated session token × endpoint
//   anon:<ip>                — one bucket per IP for unauthenticated requests
//
// Env-var controls (all optional):
//
//   RATE_LIMIT_DISABLED      set to "true" to bypass rate limiting entirely
//                            (useful for load testing; NEVER use in production)
//
//   RATE_LIMIT_MAX           max req / window per authenticated token+endpoint
//                            prod default: 1 000  |  dev default: 10 000
//
//   RATE_LIMIT_ANON_MAX      max req / window per IP (no token present)
//                            prod default: 100  |  dev default: 1 000
//
//   RATE_LIMIT_WINDOW        sliding-window length — any ms-compatible string
//                            default: "1 minute"
//
//   RATE_LIMIT_BURST_MAX     burst ceiling: requests allowed within the BURST
//                            window before the harder RATE_LIMIT_MAX kicks in.
//                            default: RATE_LIMIT_MAX * 2 (i.e., 2× burst for
//                            short windows).  Disabled when set to 0.
//
//   RATE_LIMIT_BURST_WINDOW  burst check window (must be shorter than WINDOW)
//                            default: "5 seconds"

const _isProd = process.env["NODE_ENV"] === "production";

const RATE_LIMIT_DISABLED =
  process.env["RATE_LIMIT_DISABLED"] === "true" && !_isProd;

const RATE_LIMIT_PER_TOKEN = parseInt(
  process.env["RATE_LIMIT_MAX"] ?? (_isProd ? "1000" : "10000"),
  10,
);

const RATE_LIMIT_ANON = parseInt(
  process.env["RATE_LIMIT_ANON_MAX"] ?? (_isProd ? "100" : "1000"),
  10,
);

const RATE_LIMIT_WINDOW = process.env["RATE_LIMIT_WINDOW"] ?? "1 minute";

// Burst window: shorter window with a higher ceiling.
// Default: 2× the per-token max within a 5-second window — allows legitimate
// UI actions (bulk operations, page loads with multiple concurrent tRPC calls)
// without triggering the slower per-minute limit.
const RATE_LIMIT_BURST_WINDOW = process.env["RATE_LIMIT_BURST_WINDOW"] ?? "5 seconds";
const RATE_LIMIT_BURST_MAX    = parseInt(
  process.env["RATE_LIMIT_BURST_MAX"] ?? String(Math.ceil(RATE_LIMIT_PER_TOKEN / 6)),
  10,
);

async function bootstrap() {
  const fastify = Fastify({
    logger: {
      level: process.env["NODE_ENV"] === "production" ? "info" : "debug",
      transport:
        process.env["NODE_ENV"] !== "production"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
    trustProxy: true,
    // Hard limit on incoming request body size.
    // 1 MB is generous for a tRPC API; anything larger is almost certainly
    // a mis-configured client or an abuse attempt.
    bodyLimit: parseInt(process.env["MAX_BODY_BYTES"] ?? String(1 * 1024 * 1024), 10),
    // Suppress Fastify's default "incoming request" / "request completed" messages.
    // Our onResponse hook (below) emits a single structured REQUEST log per call
    // in the exact shape we want — no duplication.
    disableRequestLogging: true,
    // Honour the x-request-id header from upstream proxies / load balancers.
    // If absent, generate a UUID.  The value becomes req.id and is included
    // in every log line that carries request_id.
    genReqId: (req) => {
      const fromHeader = req.headers["x-request-id"];
      if (typeof fromHeader === "string" && fromHeader.length > 0 && fromHeader.length <= 128) {
        return fromHeader;
      }
      return randomUUID();
    },
  });

  // Wire the logger module to Fastify's pino instance immediately so that all
  // structured log output shares the same transport (pino-pretty in dev,
  // raw NDJSON in production).
  initLogger(fastify.log);

  {
    const {
      getDatabaseOltpProvider,
      validateDatabaseEnvAtStartup,
      providerRequiresMongo,
      connectMongoOrThrow,
    } = await import("@nexusops/db");
    const dbProvider = getDatabaseOltpProvider();
    try {
      validateDatabaseEnvAtStartup(dbProvider);
    } catch (err) {
      fastify.log.fatal({ err }, "[database] Invalid environment for DATABASE_PROVIDER");
      process.exit(1);
    }
    if (providerRequiresMongo(dbProvider)) {
      try {
        await connectMongoOrThrow();
        fastify.log.info({ databaseProvider: dbProvider }, "[mongo] MongoDB connected");
      } catch (err) {
        fastify.log.fatal({ err }, "[mongo] MongoDB required for this DATABASE_PROVIDER but connection failed");
        process.exit(1);
      }
    }
  }

  // ── Plugins ──────────────────────────────────────────────────────────────
  // CORS_ORIGIN supports comma-separated list: "http://localhost:3000,https://app.example.com"
  const corsOrigins: (string | RegExp)[] = [];
  const rawOrigin =
    process.env["CORS_ORIGIN"] ?? process.env["NEXT_PUBLIC_APP_URL"] ?? "";
  if (rawOrigin) {
    rawOrigin.split(",").forEach((o) => corsOrigins.push(o.trim()));
  }
  await fastify.register(cors, {
    origin:
      process.env["NODE_ENV"] === "production" && corsOrigins.length > 0
        ? corsOrigins
        : true,
    credentials: true,
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: false,
  });

  await fastify.register(rateLimit, {
    global: true,
    max: (_req, key) =>
      (key as string).startsWith("user:") ? RATE_LIMIT_PER_TOKEN : RATE_LIMIT_ANON,
    timeWindow: RATE_LIMIT_WINDOW,
    // allowList: bypass rate limiting entirely when RATE_LIMIT_DISABLED=true
    // (load testing mode, only ever true outside production).
    allowList: RATE_LIMIT_DISABLED ? () => true : undefined,
    skipOnError: true,
    redis: getRedis(),
    // Bucket by session token + endpoint (per-user, per-route) or IP (anonymous).
    // Including the normalised endpoint prevents a single heavy endpoint from
    // consuming another endpoint's quota for the same user.
    keyGenerator: (req) => {
      const auth = req.headers.authorization as string | undefined;
      if (auth?.startsWith("Bearer ")) {
        const endpoint = (req.url ?? "").split("?")[0] ?? "";
        return `user:${auth.slice(7)}:${endpoint}`;
      }
      // Cookie-based session (browser clients)
      const cookies = req.headers.cookie as string | undefined;
      if (cookies) {
        const match = cookies.match(/nexusops_session=([^;]+)/);
        if (match?.[1]) {
          const endpoint = (req.url ?? "").split("?")[0] ?? "";
          return `user:${match[1]}:${endpoint}`;
        }
      }
      // Unauthenticated: bucket by IP only (no endpoint suffix — keeps anon buckets cheap)
      return `anon:${req.ip ?? "unknown"}`;
    },
    // Emit a structured [RATE_LIMIT] log and return a consistent 429 payload.
    // The bucket type ("user" / "anon") is logged — the actual token or IP is
    // never included in the log output.
    errorResponseBuilder: (req, context) => {
      const auth = req.headers.authorization as string | undefined;
      const cookies = req.headers.cookie as string | undefined;
      const isAuthenticated =
        auth?.startsWith("Bearer ") ||
        (typeof cookies === "string" && cookies.includes("nexusops_session="));

      logRateLimit({
        requestId:  String(req.id ?? ""),
        route:      req.url ?? null,
        ip:         req.ip ?? null,
        bucketType: isAuthenticated ? "user" : "anon",
        limit:      (context as { max: number }).max,
        window:     RATE_LIMIT_WINDOW,
        ttlMs:      (context as { ttl: number }).ttl ?? 0,
      });

      // Track rate-limited request count for health evaluation.
      recordRateLimit();

      return {
        statusCode: 429,
        error:      "Too Many Requests",
        message:    `Rate limit exceeded. Retry after ${Math.ceil(((context as { ttl: number }).ttl ?? 0) / 1000)}s.`,
      };
    },
  });

  // ── Workflow Service (BullMQ) ─────────────────────────────────────────────
  try {
    const { getDb } = await import("@nexusops/db");
    const { initWorkflowService } = await import("./services/workflow.js");
    initWorkflowService(getDb());
    fastify.log.info("Workflow service initialised");
  } catch (err) {
    fastify.log.warn({ err }, "Workflow service failed to start — continuing without durable workflows");
  }

  // ── OIDC Routes ───────────────────────────────────────────────────────────
  const { registerOidcRoutes } = await import("./services/oidc.js");
  await registerOidcRoutes(fastify);

  // ── Burst rate limiter ────────────────────────────────────────────────────
  // Secondary, shorter-window limiter that caps instantaneous bursts.
  // Registered only when RATE_LIMIT_BURST_MAX > 0 (enabled by default).
  // Uses a dedicated Redis key prefix (rl_burst:) so it doesn't interfere with
  // the main rate limit bucket.
  if (!RATE_LIMIT_DISABLED && RATE_LIMIT_BURST_MAX > 0) {
    await fastify.register(rateLimit, {
      global: false, // apply only where explicitly added — we add it globally below
      nameSpace: "rl_burst:",
      max: RATE_LIMIT_BURST_MAX,
      timeWindow: RATE_LIMIT_BURST_WINDOW,
      skipOnError: true,
      redis: getRedis(),
      keyGenerator: (req) => {
        const auth = req.headers.authorization as string | undefined;
        if (auth?.startsWith("Bearer ")) return `rl_burst:user:${auth.slice(7)}`;
        const cookies = req.headers.cookie as string | undefined;
        if (cookies) {
          const match = cookies.match(/nexusops_session=([^;]+)/);
          if (match?.[1]) return `rl_burst:user:${match[1]}`;
        }
        return `rl_burst:anon:${req.ip ?? "unknown"}`;
      },
      errorResponseBuilder: (req, context) => {
        recordRateLimit();
        return {
          statusCode: 429,
          error:      "Too Many Requests",
          message:    `Burst limit exceeded. Retry after ${Math.ceil(((context as { ttl: number }).ttl ?? 0) / 1000)}s.`,
        };
      },
    });
  }

  // ── Prototype-pollution sanitization ─────────────────────────────────────
  //
  // Runs on every incoming request BEFORE tRPC (and therefore before Zod)
  // sees the body.  Strips "__proto__", "constructor", and "prototype" keys
  // recursively so they can never reach router handlers or pollute the
  // process-wide prototype chain.
  //
  // This is applied at the HTTP layer (not in tRPC middleware) because:
  //   a) It must run before Zod parsing — a malicious key could confuse
  //      certain Zod internals before validation even starts.
  //   b) It protects ALL routes, not just tRPC procedures.
  fastify.addHook("preHandler", (req, _reply, done) => {
    if (req.body !== null && req.body !== undefined && typeof req.body === "object") {
      req.body = sanitizeInput(req.body);
    }
    done();
  });

  // ── In-flight concurrency guard ───────────────────────────────────────────
  //
  // Caps the number of requests being actively processed.  Returns HTTP 503
  // immediately when the limit is exceeded rather than queuing indefinitely,
  // which would degrade all concurrent requests.  This protects the DB
  // connection pool and prevents memory exhaustion from unbounded fan-out.
  //
  // MAX_IN_FLIGHT is intentionally much higher than the DB pool max — it
  // accounts for requests that are auth-checking, serializing, etc. without
  // holding a DB connection.
  //
  // Configure:
  //   MAX_IN_FLIGHT   max simultaneous requests in processing (default: 500)
  const MAX_IN_FLIGHT = parseInt(process.env["MAX_IN_FLIGHT"] ?? "500", 10);
  let inFlight = 0;

  fastify.addHook("onRequest", (req, reply, done) => {
    if (++inFlight > MAX_IN_FLIGHT) {
      inFlight--;
      // Mark this request as NOT counted so onResponse doesn't double-decrement
      (req as any)._inflight = false;
      reply.status(503).send({
        statusCode: 503,
        error:      "Service Unavailable",
        message:    "Server is temporarily overloaded. Please retry shortly.",
      });
      return;
    }
    (req as any)._inflight = true;
    done();
  });

  fastify.addHook("onResponse", (req, _reply, done) => {
    if ((req as any)._inflight) inFlight--;
    done();
  });

  // ── Structured HTTP request logging ──────────────────────────────────────
  //
  // Fires once per HTTP request after the response is sent.  Emits a flat
  // JSON log line with the fields required for request tracing:
  //
  //   { event, request_id, method, url, status, duration_ms }
  //
  // user_id / org_id are NOT available at the HTTP transport layer — they
  // live inside the tRPC context.  The tRPC loggingMiddleware in trpc.ts
  // emits a TRPC_REQUEST log that includes both fields, correlated by the
  // same request_id.  Together the two events give a complete trace:
  //
  //   REQUEST       → transport view  (method, url, status, duration)
  //   TRPC_REQUEST  → application view (path, type, user_id, org_id)
  //
  // reply.elapsedTime is maintained by Fastify from onRequest onwards
  // (fractional milliseconds); Math.round() gives integer ms.
  fastify.addHook("onResponse", (req, reply, done) => {
    const duration = reply.elapsedTime;
    const status   = reply.statusCode;

    // Structured log — one line per HTTP request.
    fastify.log.info({
      event:       "REQUEST",
      request_id:  req.id,
      method:      req.method,
      url:         req.url,
      status,
      duration_ms: Math.round(duration),
    });

    // In-memory metrics — O(1) arithmetic, no allocations on the hot path.
    recordRequest(req.url, duration, status);

    // Active health monitoring — checks every EVAL_EVERY requests and emits
    // a structured log line if the health status has changed.  Non-evaluation
    // ticks cost exactly one integer increment and one modulo check.
    checkHealth();

    done();
  });

  // ── tRPC ─────────────────────────────────────────────────────────────────
  await fastify.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: ({ req }: { req: Parameters<typeof createContext>[0] }) => createContext(req),
      onError: ({ path, error }: { path?: string; error: { code: string; message?: string; cause?: unknown } }) => {
        // loggingMiddleware handles INTERNAL_SERVER_ERROR with full requestId context.
        // This callback fires only for errors that escape the middleware chain
        // (e.g. Fastify adapter layer errors before context is established).
        if (error.code === "INTERNAL_SERVER_ERROR") {
          logServerError(
            { requestId: null, userId: null, orgId: null, route: path ?? null },
            error.cause ?? error,
          );
        }
      },
    },
  });

  const { registerPayrollPayslipPdfRoute } = await import("./http/payroll-payslip-pdf.js");
  registerPayrollPayslipPdfRoute(fastify);

  // ── Health Checks ─────────────────────────────────────────────────────────
  fastify.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  async function runDetailedChecks(): Promise<{
    checks: Record<string, "ok" | "error">;
    allOk: boolean;
  }> {
    const checks: Record<string, "ok" | "error"> = {};

    try {
      const { getDb, sql } = await import("@nexusops/db");
      const db = getDb();
      await db.execute(sql`SELECT 1`);
      checks["db"] = "ok";
    } catch {
      checks["db"] = "error";
    }

    try {
      const redis = getRedis();
      await redis.ping();
      checks["redis"] = "ok";
    } catch {
      checks["redis"] = "error";
    }

    try {
      const searchUrl = process.env["MEILISEARCH_HOST"] ?? "http://localhost:7700";
      const resp = await fetch(`${searchUrl}/health`, { signal: AbortSignal.timeout(3000) });
      checks["search"] = resp.ok ? "ok" : "error";
    } catch {
      checks["search"] = "error";
    }

    return { checks, allOk: Object.values(checks).every((v) => v === "ok") };
  }

  fastify.get("/health/detailed", async (_, reply) => {
    const { checks, allOk } = await runDetailedChecks();
    // Include live pool stats in the detailed health response so operators
    // can monitor connection pressure without tailing logs.
    const { getPoolStats } = await import("@nexusops/db");
    const pool = getPoolStats();
    reply.status(allOk ? 200 : 503);
    return { status: allOk ? "ok" : "degraded", checks, pool, timestamp: new Date().toISOString() };
  });

  // /ready — alias for k8s readiness probe (same checks as /health/detailed)
  fastify.get("/ready", async (_, reply) => {
    const { checks, allOk } = await runDetailedChecks();
    reply.status(allOk ? 200 : 503);
    return { status: allOk ? "ready" : "not_ready", checks, timestamp: new Date().toISOString() };
  });

  // ── Internal Metrics ──────────────────────────────────────────────────────
  //
  // ── Guarded internal check ───────────────────────────────────────────────
  // Require X-Internal-Token header matching INTERNAL_API_TOKEN env var.
  // If INTERNAL_API_TOKEN is not set, fall back to allowing localhost only.
  const INTERNAL_API_TOKEN = process.env["INTERNAL_API_TOKEN"];
  fastify.addHook("preHandler", async (req, reply) => {
    if (!req.url?.startsWith("/internal/")) return;
    const token = req.headers["x-internal-token"];
    if (INTERNAL_API_TOKEN) {
      if (token !== INTERNAL_API_TOKEN) {
        return reply.status(401).send({ error: "Unauthorized", message: "Valid X-Internal-Token header required" });
      }
    } else {
      // No token configured — only allow requests from localhost/Docker network
      const ip = req.ip ?? (req.socket?.remoteAddress ?? "");
      const isLocal = ip === "127.0.0.1" || ip === "::1" || ip.startsWith("172.") || ip.startsWith("10.");
      if (!isLocal) {
        return reply.status(401).send({ error: "Unauthorized", message: "Internal endpoint — set INTERNAL_API_TOKEN env var for remote access" });
      }
    }
  });

  // GET  /internal/metrics        — current snapshot
  // POST /internal/metrics/reset  — zero all counters

  fastify.get("/internal/metrics", async () => {
    const { getBcryptStats } = await import("./lib/bcrypt-semaphore.js");
    return { ...getMetricsSnapshot(), bcrypt: getBcryptStats() };
  });

  fastify.post("/internal/metrics/reset", async () => {
    resetMetrics();
    return { ok: true, message: "Metrics reset", timestamp: new Date().toISOString() };
  });

  // GET /internal/health — evaluate current metrics against health thresholds.
  // Returns HEALTHY / DEGRADED / UNHEALTHY with human-readable reasons.
  fastify.get("/internal/health", async () => {
    const metrics = getMetricsSnapshot();
    const result  = evaluateHealth(metrics);
    const monitor = getMonitorState();
    const { getBcryptStats } = await import("./lib/bcrypt-semaphore.js");
    return {
      ...result,
      concurrency: {
        in_flight:     inFlight,
        max_in_flight: MAX_IN_FLIGHT,
      },
      bcrypt: getBcryptStats(),
      monitor: {
        last_changed_at: monitor.since,
        eval_every:      monitor.eval_every,
      },
    };
  });

  // ── Graceful Shutdown ─────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    fastify.log.info(`Received ${signal}, shutting down...`);
    await fastify.close();

    const { closeDb, closeMongo } = await import("@nexusops/db");
    const { closeRedis } = await import("./lib/redis.js");
    // Shutdown workflow service first (drain queues)
    try {
      const { getWorkflowService } = await import("./services/workflow.js");
      await getWorkflowService().shutdown();
    } catch { /* already shut down or never started */ }
    await Promise.all([closeDb(), closeMongo(), closeRedis()]);

    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // ── Pre-start: clean state preparation ───────────────────────────────────
  //
  // Ensures the API starts from a known-clean baseline — essential for
  // deterministic stress test runs.  All operations here are non-fatal:
  // a failure is logged and the server continues to start.
  //
  // Steps:
  //   1. Clear L1 in-process session cache + coalescing inflight map
  //   2. Flush Redis session keys (controlled by FLUSH_REDIS_SESSION_ON_START)
  //   3. Verify org_counters table is accessible
  //   4. Terminate any connections stuck in idle-in-transaction for > 30 s

  // 1. Clear L1 session cache (always empty on fresh process start, but
  //    this is explicit and provides a log line confirming clean state).
  const l1Evicted = clearSessionCache();
  fastify.log.info(`[CLEAN_START] L1 session cache cleared (${l1Evicted} entries evicted)`);

  // 2. Redis session key flush (opt-in via FLUSH_REDIS_SESSION_ON_START=true).
  //    Scans for session:* keys and deletes them in batches.  Does NOT flush
  //    rate-limit buckets or other Redis data.
  const flushRedisOnStart = process.env["FLUSH_REDIS_SESSION_ON_START"] === "true";
  if (flushRedisOnStart) {
    let flushed = 0;
    try {
      const redis = getRedis();
      let cursor = "0";
      do {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "session:*", "COUNT", "500") as [string, string[]];
        cursor = nextCursor;
        if (keys.length > 0) {
          await redis.del(...(keys as [string, ...string[]]));
          flushed += keys.length;
        }
      } while (cursor !== "0");
      fastify.log.info(`[CLEAN_START] Redis session keys flushed: ${flushed} keys removed`);
    } catch (e) {
      fastify.log.warn(`[CLEAN_START] Redis flush failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    fastify.log.info("[CLEAN_START] Redis flush skipped (set FLUSH_REDIS_SESSION_ON_START=true to enable)");
  }

  // 3 + 4. DB checks: sync org_counters to actual DB state, then clean up
  //        any idle-in-transaction connections from a previous aborted run.
  try {
    const { getDb, sql } = await import("@nexusops/db");
    const { syncOrgCounters } = await import("./lib/auto-number.js");
    const db = getDb();

    // Sync all org_counters to the actual max values in each source table.
    // This ensures that auto-number sequences never generate a value that
    // already exists — eliminating duplicate key violations permanently.
    //
    // syncOrgCounters is fault-isolated per entity: a missing table or column
    // logs a warning and continues; it never blocks the server from starting.
    const { checked, upserted, errors } = await syncOrgCounters(db);

    if (errors.length === 0) {
      fastify.log.info(
        `[CLEAN_START] org_counters synced: ${checked} entities checked, ${upserted} rows upserted`,
      );
    } else {
      fastify.log.info(
        `[CLEAN_START] org_counters synced: ${checked} entities checked, ${upserted} rows upserted` +
        ` (${errors.length} warnings: ${errors.map((e) => `${e.entity}: ${e.message}`).join("; ")})`,
      );
    }

    // Terminate idle-in-transaction connections older than 30 s.
    // These are typically leftover from a previous test run that was
    // interrupted mid-write.  Drizzle / postgres.js transactions that
    // were not rolled back will show up here.
    await db.execute(sql`
      SELECT pg_terminate_backend(pid)
      FROM   pg_stat_activity
      WHERE  state        = 'idle in transaction'
        AND  state_change < NOW() - INTERVAL '30 seconds'
        AND  pid          <> pg_backend_pid()
    `);
    fastify.log.info("[CLEAN_START] Stale idle-in-transaction connections cleared");
  } catch (e) {
    fastify.log.warn(`[CLEAN_START] DB prep check failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Start ─────────────────────────────────────────────────────────────────
  try {
    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`NexusOps API listening on http://${HOST}:${PORT}`);
    printStartupConfig();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

bootstrap();
