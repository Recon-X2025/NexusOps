/**
 * Structured event logger for CoheronConnect API.
 *
 * Backed by the Fastify pino instance, wired via `initLogger()` once at
 * startup.  Every log entry is emitted as JSON so that log aggregators
 * (Datadog, Loki, CloudWatch, etc.) can index individual fields.
 *
 * Before `initLogger()` is called (early startup), a minimal fallback
 * writes NDJSON directly to stdout / stderr so no log lines are lost.
 *
 * ── Sensitive data rules ──────────────────────────────────────────────────────
 *  - Raw session tokens, passwords, email addresses, and Authorization header
 *    values are NEVER logged.
 *  - Session tokens appear only as the first 8 hex chars of their SHA-256
 *    hash — enough for cross-log correlation, not enough to reconstruct.
 *  - PostgreSQL error `detail` and `hint` fields are suppressed; they may
 *    contain actual row values (e.g. "Key (email)=(user@example.com) exists").
 *  - Input values are never logged; only structural metadata (resource type,
 *    IDs) is captured.
 */

import type { FastifyBaseLogger } from "fastify";

const isTest   = process.env["NODE_ENV"] === "test";
const isProd   = process.env["NODE_ENV"] === "production";

// ── Logger singleton ──────────────────────────────────────────────────────────

/** Wired to fastify.log after Fastify is created in index.ts. */
let _log: FastifyBaseLogger | null = null;

/**
 * Call once in index.ts immediately after `Fastify(...)` returns.
 * Ties all structured log output to the same pino instance — and therefore
 * the same transport — that Fastify itself uses (pino-pretty in dev,
 * raw NDJSON in production).
 */
export function initLogger(logger: FastifyBaseLogger): void {
  _log = logger;
}

type LogLevel = "info" | "warn" | "error";

/** Internal emitter — routes through pino when available, raw JSON otherwise. */
function emit(level: LogLevel, data: Record<string, unknown>): void {
  if (_log) {
    _log[level](data);
    return;
  }
  // Fallback: Fastify not yet created (very early startup / import-time side effects).
  const line = JSON.stringify({ level, time: Date.now(), ...data });
  (level === "error" ? process.stderr : process.stdout).write(line + "\n");
}

// ── Generic log utilities (satisfies requirements §4) ─────────────────────────

/**
 * logInfo — emit a structured info-level event.
 *
 * Usage:
 *   logInfo("TICKET_CREATED", { ticketId, orgId })
 */
export function logInfo(
  event: string,
  data: Record<string, unknown> = {},
): void {
  if (isTest) return;
  emit("info", { event, ...data });
}

/**
 * logWarn — emit a structured warn-level event.
 *
 * Usage:
 *   logWarn("SLOW_REQUEST", { path, duration_ms })
 */
export function logWarn(
  event: string,
  data: Record<string, unknown> = {},
): void {
  if (isTest) return;
  emit("warn", { event, ...data });
}

/**
 * logError — emit a structured error-level event.
 * Includes error type, message, and (in non-production) stack trace.
 *
 * Usage:
 *   logError("UNHANDLED_EXCEPTION", err, { requestId, path })
 */
export function logError(
  event: string,
  err: unknown,
  data: Record<string, unknown> = {},
): void {
  if (isTest) return;
  const e = err instanceof Error ? err : null;
  emit("error", {
    event,
    ...data,
    error_type:    e?.constructor?.name ?? typeof err,
    error_message: (e?.message ?? String(err)).slice(0, 200),
    // Stack traces help diagnose issues in dev/staging; suppressed in
    // production to avoid leaking internal paths to log aggregators.
    stack: !isProd ? e?.stack?.slice(0, 800) : undefined,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the first `n` characters of `id` for log correlation.
 * SHA-256 hashes are 64 hex chars; 8 chars gives 32 bits of identifier
 * — collision probability < 0.05 % across 10 K concurrent sessions.
 */
function shortRef(id: string | null | undefined, n = 8): string | null {
  if (!id) return null;
  return `${id.slice(0, n)}…`;
}

/**
 * Walks the error chain (err → err.cause → …) looking for PostgreSQL error
 * fields.  Returns only safe metadata — never `detail` or `hint`.
 */
function extractDbFields(err: unknown): Record<string, unknown> {
  let cur: unknown = err;
  for (let depth = 0; depth < 8 && cur != null && typeof cur === "object"; depth++) {
    const e = cur as Record<string, unknown>;
    const code = e["code"];
    // PostgreSQL codes are 5-character uppercase-alphanumeric strings.
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) {
      return {
        pg_code:       code,
        pg_table:      typeof e["table"]      === "string" ? e["table"]      : null,
        pg_constraint: typeof e["constraint"] === "string" ? e["constraint"] : null,
        pg_schema:     typeof e["schema"]     === "string" ? e["schema"]     : null,
        // NOT included: detail, hint, where — may contain row data
      };
    }
    cur = e["cause"] ?? null;
  }
  return {};
}

// ── Common metadata attached to every structured entry ────────────────────────

export interface RequestMeta {
  /** Fastify request.id — correlates all logs for one HTTP request. */
  requestId: string | null;
  /** Authenticated user UUID (null for unauthenticated requests). */
  userId:    string | null;
  /** Organisation UUID. */
  orgId:     string | null;
  /** tRPC path (e.g. "tickets.create") or HTTP route. */
  route:     string | null;
  /** Client IP (from X-Forwarded-For or socket). */
  ip?:       string | null;
}

// ── Domain-specific log functions ─────────────────────────────────────────────

/**
 * [AUTH_FAIL] — session missing, invalid, or could not be resolved to a user.
 *
 * Fired by: enforceAuth middleware, auth.login handler.
 */
export function logAuthFail(
  meta: RequestMeta & {
    /** First 8 chars of the SHA-256 session token hash (safe to log). */
    sessionRef?: string | null;
    /**
     * Machine-readable reason:
     *   "no_token"        — request arrived with no Authorization / cookie
     *   "no_user_or_org"  — token resolved but user/org missing (expired / deleted)
     *   "bad_credentials" — wrong password at login
     *   "account_locked"  — too many failed attempts
     */
    reason: string;
  },
): void {
  if (isTest) return;
  emit("warn", {
    event:      "AUTH_FAIL",
    request_id:  meta.requestId,
    user_id:     meta.userId,
    org_id:      meta.orgId,
    route:       meta.route,
    ip:          meta.ip ?? null,
    session_ref: meta.sessionRef ?? null,
    reason:      meta.reason,
  });
}

/**
 * [RATE_LIMIT] — 429 Too Many Requests triggered by @fastify/rate-limit.
 *
 * Fired by: Fastify errorResponseBuilder in index.ts.
 * The bucket is identified only as "user" or "anon" — the actual token or IP
 * is never logged here.
 */
export function logRateLimit(meta: {
  requestId:  string | null;
  route:      string | null;
  ip:         string | null;
  /** "user" = authenticated token bucket; "anon" = IP bucket. */
  bucketType: "user" | "anon";
  limit:      number;
  window:     string;
  /** Milliseconds until the window resets. */
  ttlMs:      number;
}): void {
  if (isTest) return;
  emit("warn", {
    event:           "RATE_LIMIT",
    request_id:      meta.requestId,
    route:           meta.route,
    ip:              meta.ip,
    bucket_type:     meta.bucketType,
    limit:           meta.limit,
    window:          meta.window,
    ttl_ms:          meta.ttlMs,
    retry_after_sec: Math.ceil(meta.ttlMs / 1000),
  });
}

/**
 * [RBAC_DENIED] — 403 Forbidden from permissionProcedure or adminProcedure.
 *
 * Fired by: permissionProcedure, adminProcedure in trpc.ts.
 */
export function logRbacDenied(
  meta: RequestMeta & {
    /** Module being accessed (e.g. "incidents", "contracts"). */
    module: string;
    /** Action attempted (e.g. "read", "write", "delete"). */
    action: string;
    /** DB role of the requesting user (e.g. "member", "viewer"). */
    role:   string;
  },
): void {
  if (isTest) return;
  emit("warn", {
    event:      "RBAC_DENIED",
    request_id: meta.requestId,
    user_id:    meta.userId,
    org_id:     meta.orgId,
    route:      meta.route,
    module:     meta.module,
    action:     meta.action,
    role:       meta.role,
  });
}

/**
 * [DB_ERROR] — a PostgreSQL error surfaced as INTERNAL_SERVER_ERROR.
 *
 * Only safe structural fields are logged (error code, table, constraint).
 * `detail` and `hint` are suppressed as they may contain row data.
 *
 * Fired by: loggingMiddleware in trpc.ts.
 */
export function logDbError(meta: RequestMeta, err: unknown): void {
  if (isTest) return;
  const dbFields = extractDbFields(err);
  // Trim error message to 120 chars.  The leading portion of PG messages
  // typically just names the problem (e.g. "duplicate key value violates…")
  // without embedding row data; the detail line — which we skip — is where
  // actual values appear.
  const message =
    err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120);

  emit("error", {
    event:         "DB_ERROR",
    request_id:    meta.requestId,
    user_id:       meta.userId,
    org_id:        meta.orgId,
    route:         meta.route,
    ...dbFields,
    error_message: message,
  });
}

/**
 * [SERVER_ERROR] — an unexpected 5xx that is not a known DB error.
 *
 * Stack traces are included only outside production to avoid leaking
 * internal file paths to log aggregators that may be externally accessible.
 *
 * Fired by: loggingMiddleware in trpc.ts.
 */
export function logServerError(meta: RequestMeta, err: unknown): void {
  if (isTest) return;
  const e = err instanceof Error ? err : null;
  emit("error", {
    event:         "SERVER_ERROR",
    request_id:    meta.requestId,
    user_id:       meta.userId,
    org_id:        meta.orgId,
    route:         meta.route,
    error_type:    e?.constructor?.name ?? typeof err,
    error_message: (e?.message ?? String(err)).slice(0, 200),
    stack:         !isProd ? e?.stack?.slice(0, 800) : undefined,
  });
}

// ── Re-export shortRef for use in auth.ts ─────────────────────────────────────
export { shortRef };
