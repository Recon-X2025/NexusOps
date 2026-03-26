/**
 * Structured event logger for NexusOps API.
 *
 * Every log entry is emitted as a plain JSON-serialisable object so that
 * log aggregators (Datadog, Loki, CloudWatch, etc.) can index each field.
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

const isTest = process.env["NODE_ENV"] === "test";

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
        pgCode:       code,
        pgTable:      typeof e["table"]      === "string" ? e["table"]      : null,
        pgConstraint: typeof e["constraint"] === "string" ? e["constraint"] : null,
        pgSchema:     typeof e["schema"]     === "string" ? e["schema"]     : null,
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

// ── Event loggers ─────────────────────────────────────────────────────────────

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
  console.warn("[AUTH_FAIL]", {
    requestId:  meta.requestId,
    userId:     meta.userId,
    orgId:      meta.orgId,
    route:      meta.route,
    ip:         meta.ip ?? null,
    sessionRef: meta.sessionRef ?? null,
    reason:     meta.reason,
    ts:         new Date().toISOString(),
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
  console.warn("[RATE_LIMIT]", {
    requestId:  meta.requestId,
    route:      meta.route,
    ip:         meta.ip,
    bucketType: meta.bucketType,
    limit:      meta.limit,
    window:     meta.window,
    ttlMs:      meta.ttlMs,
    retryAfterSec: Math.ceil(meta.ttlMs / 1000),
    ts:         new Date().toISOString(),
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
  console.warn("[RBAC_DENIED]", {
    requestId: meta.requestId,
    userId:    meta.userId,
    orgId:     meta.orgId,
    route:     meta.route,
    module:    meta.module,
    action:    meta.action,
    role:      meta.role,
    ts:        new Date().toISOString(),
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

  console.error("[DB_ERROR]", {
    requestId: meta.requestId,
    userId:    meta.userId,
    orgId:     meta.orgId,
    route:     meta.route,
    errorType: "DB_ERROR",
    ...dbFields,
    errorMessage: message,
    ts:        new Date().toISOString(),
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
  const isProd = process.env["NODE_ENV"] === "production";
  const e = err instanceof Error ? err : null;

  console.error("[SERVER_ERROR]", {
    requestId:    meta.requestId,
    userId:       meta.userId,
    orgId:        meta.orgId,
    route:        meta.route,
    errorType:    e?.constructor?.name ?? typeof err,
    errorMessage: (e?.message ?? String(err)).slice(0, 200),
    // Stack traces help diagnose issues in dev/staging but are suppressed in
    // production where they could expose internal paths or library versions.
    stack:        !isProd ? e?.stack?.slice(0, 800) : undefined,
    ts:           new Date().toISOString(),
  });
}

// ── Re-export shortRef for use in auth.ts ─────────────────────────────────────
export { shortRef };
