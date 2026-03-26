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
import { logRateLimit, logServerError } from "./lib/logger";
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
    E,
    "",
  ].join("\n"));
}

// ── Rate limiting configuration ───────────────────────────────────────────────
//
// Limits are applied per-bucket (never globally), so one user's burst cannot
// consume another user's quota.  Two bucket types:
//
//   user:<token>  — one bucket per authenticated session token
//   anon:<ip>     — one bucket per IP for unauthenticated requests
//
// Env-var controls (all optional):
//
//   RATE_LIMIT_MAX       max req / window per authenticated token
//                        prod default: 1 000  |  dev default: 10 000
//                        → set to 200 000 in .env for 10K-session stress tests
//
//   RATE_LIMIT_ANON_MAX  max req / window per IP (no token present)
//                        prod default: 100  |  dev default: 1 000
//
//   RATE_LIMIT_WINDOW    sliding-window length — any ms-compatible string
//                        default: "1 minute"
//
// Rate limiting is NEVER disabled; only its ceiling is configurable.

const _isProd = process.env["NODE_ENV"] === "production";

const RATE_LIMIT_PER_TOKEN = parseInt(
  process.env["RATE_LIMIT_MAX"] ?? (_isProd ? "1000" : "10000"),
  10,
);

const RATE_LIMIT_ANON = parseInt(
  process.env["RATE_LIMIT_ANON_MAX"] ?? (_isProd ? "100" : "1000"),
  10,
);

const RATE_LIMIT_WINDOW = process.env["RATE_LIMIT_WINDOW"] ?? "1 minute";

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
  });

  // ── Plugins ──────────────────────────────────────────────────────────────
  await fastify.register(cors, {
    origin:
      process.env["NODE_ENV"] === "production"
        ? [process.env["NEXT_PUBLIC_APP_URL"] ?? ""]
        : true,
    credentials: true,
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: false,
  });

  await fastify.register(rateLimit, {
    global: true,
    // Dynamic max: authenticated tokens get the generous per-token ceiling;
    // anonymous IP buckets get the tighter anti-abuse ceiling.
    max: (_req, key) =>
      (key as string).startsWith("user:") ? RATE_LIMIT_PER_TOKEN : RATE_LIMIT_ANON,
    timeWindow: RATE_LIMIT_WINDOW,
    // If Redis is unavailable, skip rate limiting rather than 500-ing every request.
    skipOnError: true,
    redis: getRedis(),
    // Bucket by session token (per-user) or IP (anonymous).
    // Using the raw token — not the full "Bearer …" header — keeps keys clean
    // and allows cookie-authenticated requests to share the same bucket as
    // their Bearer-equivalent.
    keyGenerator: (req) => {
      const auth = req.headers.authorization as string | undefined;
      if (auth?.startsWith("Bearer ")) {
        return `user:${auth.slice(7)}`;
      }
      // Cookie-based session (browser clients)
      const cookies = req.headers.cookie as string | undefined;
      if (cookies) {
        const match = cookies.match(/nexusops_session=([^;]+)/);
        if (match?.[1]) return `user:${match[1]}`;
      }
      // Unauthenticated: bucket by IP
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

  // ── Graceful Shutdown ─────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    fastify.log.info(`Received ${signal}, shutting down...`);
    await fastify.close();

    const { closeDb } = await import("@nexusops/db");
    const { closeRedis } = await import("./lib/redis.js");
    // Shutdown workflow service first (drain queues)
    try {
      const { getWorkflowService } = await import("./services/workflow.js");
      await getWorkflowService().shutdown();
    } catch { /* already shut down or never started */ }
    await Promise.all([closeDb(), closeRedis()]);

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
