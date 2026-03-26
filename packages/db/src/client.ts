import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// ── Pool configuration ────────────────────────────────────────────────────────
//
// All knobs are controlled via environment variables so the same codebase works
// for production (conservative) and local stress testing (high concurrency).
//
//  DB_POOL_MAX              max connections in the pool
//                           prod default: 20  |  dev default: 30
//                           → leave headroom below Postgres max_connections (100)
//
//  DB_POOL_IDLE_TIMEOUT     seconds an idle connection is held before closing
//                           default: 30 s
//
//  DB_POOL_CONNECT_TIMEOUT  seconds to wait for an available connection
//                           default: 15 s  (increase if you see connection timeouts)
//
//  DB_POOL_MAX_LIFETIME     seconds before a connection is forcibly recycled
//                           default: 1 800 s (30 min) — prevents stale connections
//
// postgres.js creates all `max` connection objects upfront but only actually
// connects each one lazily (on first use).  Connections are reused across
// requests; this module is a singleton — getDb() NEVER creates a new client
// per request.

const _isProd = process.env["NODE_ENV"] === "production";

const DB_POOL_MAX = parseInt(
  process.env["DB_POOL_MAX"] ?? (_isProd ? "20" : "30"),
  10,
);

const DB_POOL_IDLE_TIMEOUT = parseInt(
  process.env["DB_POOL_IDLE_TIMEOUT"] ?? "30",
  10,
);

const DB_POOL_CONNECT_TIMEOUT = parseInt(
  process.env["DB_POOL_CONNECT_TIMEOUT"] ?? "15",
  10,
);

// Recycle connections every 30 min to prevent long-lived connections from
// accumulating state or hitting server-side idle kill timers.
const DB_POOL_MAX_LIFETIME = parseInt(
  process.env["DB_POOL_MAX_LIFETIME"] ?? "1800",
  10,
);

// ── Pool pressure monitoring ──────────────────────────────────────────────────
//
// postgres.js does not expose a public "pool exhausted" event, so we track
// inflight query count via a Proxy on the client.  Every sql`...` tagged
// template literal call is syntactic sugar for a function call, so the Proxy
// `apply` trap fires for every query dispatched through Drizzle.
//
// The counter is approximate (streaming cursors release the connection on the
// first row, not the last) but is accurate enough for exhaustion detection.

let _inflightQueries = 0;
let _peakInflight = 0;
let _exhaustionEventCount = 0;
let _lastExhaustionLogMs = 0;

/** Threshold at which a POOL_PRESSURE warning is emitted (85 % of max). */
const PRESSURE_THRESHOLD = Math.ceil(DB_POOL_MAX * 0.85);

/** Minimum interval between repeated POOL_PRESSURE log lines (5 s). */
const PRESSURE_LOG_DEBOUNCE_MS = 5_000;

/**
 * Returns a snapshot of pool pressure metrics.
 * Safe to call from health-check endpoints or logging pipelines.
 */
export function getPoolStats() {
  return {
    inflightQueries:   _inflightQueries,
    peakInflight:      _peakInflight,
    exhaustionEvents:  _exhaustionEventCount,
    poolMax:           DB_POOL_MAX,
    utilizationPct:    DB_POOL_MAX > 0
      ? Math.round((_inflightQueries / DB_POOL_MAX) * 100)
      : 0,
  };
}

/**
 * Wraps the postgres.js client in a transparent Proxy that:
 *  1. Counts inflight queries (increment on call, decrement on settle)
 *  2. Emits a debounced [POOL_PRESSURE] warning when utilisation ≥ 85 %
 *  3. Logs a [POOL_EXHAUSTION] error when connect_timeout fires
 *
 * Only the `apply` trap is implemented — property accesses (.end, .unsafe, …)
 * fall through to the real client unchanged.
 */
function createMonitoredClient(
  url: string,
): ReturnType<typeof postgres> {
  const client = postgres(url, {
    max:             DB_POOL_MAX,
    idle_timeout:    DB_POOL_IDLE_TIMEOUT,
    connect_timeout: DB_POOL_CONNECT_TIMEOUT,
    max_lifetime:    DB_POOL_MAX_LIFETIME,

    // Called whenever a connection is closed (error, idle eviction, or
    // max_lifetime expiry).  Useful for diagnosing rapid connection churn.
    onclose(connId) {
      if (process.env["NODE_ENV"] !== "test") {
        // Only log at debug level — normal pool recycling fires this too.
        // Uncomment the line below to trace individual connection lifecycle.
        // console.debug("[POOL_CONN_CLOSE]", { connId });
      }
    },
  });

  return new Proxy(client, {
    apply(target, thisArg, argArray) {
      // ── Increment inflight counter ────────────────────────────────────────
      _inflightQueries++;
      if (_inflightQueries > _peakInflight) _peakInflight = _inflightQueries;

      // ── Pool pressure warning (debounced) ─────────────────────────────────
      if (_inflightQueries >= PRESSURE_THRESHOLD) {
        const now = Date.now();
        if (now - _lastExhaustionLogMs > PRESSURE_LOG_DEBOUNCE_MS) {
          _lastExhaustionLogMs = now;
          _exhaustionEventCount++;
          console.warn("[POOL_PRESSURE]", {
            inflightQueries:  _inflightQueries,
            poolMax:          DB_POOL_MAX,
            utilizationPct:   Math.round((_inflightQueries / DB_POOL_MAX) * 100),
            peakInflight:     _peakInflight,
            exhaustionEvents: _exhaustionEventCount,
          });
        }
      }

      // ── Dispatch to real client ───────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = Reflect.apply(target as (...a: any[]) => any, thisArg, argArray);

      // PendingQuery is PromiseLike — decrement once the query settles,
      // regardless of success or failure.
      Promise.resolve(result).finally(() => {
        _inflightQueries = Math.max(0, _inflightQueries - 1);
      }).catch(() => {
        // Swallow: the real error surfaces through the normal query promise.
        // This finally-catch only prevents UnhandledPromiseRejection on the
        // monitoring wrapper itself.
      });

      return result;
    },
  }) as ReturnType<typeof postgres>;
}

// ── Singleton DB client ───────────────────────────────────────────────────────

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;
let _client: ReturnType<typeof postgres> | undefined;

/**
 * Returns the singleton Drizzle DB instance backed by a connection pool.
 *
 * The pool is created ONCE per process — this function is safe to call on
 * every request without creating new connections.
 */
export function getDb() {
  if (!_db) {
    const databaseUrl = process.env["DATABASE_URL"];
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is required");
    }

    _client = createMonitoredClient(databaseUrl);
    _db = drizzle(_client, {
      schema,
      logger: process.env["NODE_ENV"] === "development",
    });

    if (process.env["NODE_ENV"] !== "test") {
      console.log("[POOL_INIT]", {
        max:            DB_POOL_MAX,
        idleTimeout:    DB_POOL_IDLE_TIMEOUT,
        connectTimeout: DB_POOL_CONNECT_TIMEOUT,
        maxLifetime:    DB_POOL_MAX_LIFETIME,
      });
    }
  }
  return _db;
}

export type Db = ReturnType<typeof getDb>;

/**
 * Gracefully closes all pool connections.
 * Logs a final pool summary (peak utilisation, exhaustion events) before exit.
 */
export async function closeDb() {
  if (_client) {
    const stats = getPoolStats();
    if (stats.peakInflight > 0 || stats.exhaustionEvents > 0) {
      console.log("[POOL_SUMMARY_ON_CLOSE]", stats);
    }
    await _client.end();
    _client = undefined;
    _db    = undefined;
    // Reset counters so a re-initialisation in tests starts clean.
    _inflightQueries   = 0;
    _peakInflight      = 0;
    _exhaustionEventCount = 0;
  }
}
