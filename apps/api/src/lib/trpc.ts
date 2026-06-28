import { initTRPC, TRPCError } from "@trpc/server";
import jwt from "jsonwebtoken";
import { z, ZodError } from "zod";
import type { Module, RbacAction } from "@coheronconnect/types";
import { auditLogs, users, organizations, type Db } from "@coheronconnect/db";
import { checkDbUserPermission } from "./rbac-db";
import { isRetryableTrpcResult, retryDelay, MAX_ATTEMPTS, extractPgCode } from "./db-retry";
import {
  logAuthFail,
  logRbacDenied,
  logDbError,
  logServerError,
  logInfo,
  logWarn,
  logError,
  shortRef,
  type RequestMeta,
} from "./logger";
import { sanitizeForAudit } from "./audit-sanitize";
import { assertStepUpIfRequired } from "./step-up";
import { assertMfaIfRequired } from "./mfa-policy";

/**
 * The authenticated user as exposed on the request context.
 * `passwordHash` is intentionally stripped by the auth middleware
 * (`withoutPasswordHash`) and is therefore absent from this type — the
 * credential hash must never travel through the request context.
 */
export type ContextUser = Omit<typeof users.$inferSelect, "passwordHash">;
export type ContextOrg = typeof organizations.$inferSelect;

/**
 * Shared pagination input for list endpoints. Bounds the result set so no
 * single query can return an unbounded number of rows (DoS / memory guard),
 * and exposes a uniform `limit`/`offset` contract across routers.
 *
 * Spread into an existing input object:
 *   .input(z.object({ ...paginationShape, status: z.string().optional() }))
 * or use directly (standalone). `.default({})` lets callers omit the argument
 * entirely (tRPC passes `undefined`) and still receive the field defaults.
 */
export const paginationShape = {
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
};
export const paginationInput = z.object(paginationShape).default({});

export type Context = {
  db: Db;
  /**
   * Optional MongoDB database when `MONGODB_URI` is set and init succeeded.
   * OLTP remains PostgreSQL unless/until individual procedures are migrated.
   */
  mongoDb: import("mongodb").Db | null;
  /** Declared mode: postgres | hybrid | mongo (see `DATABASE_PROVIDER`). */
  databaseProvider: "postgres" | "hybrid" | "mongo";
  user: ContextUser | null;
  org: ContextOrg | null;
  /** Set from org.id when org is loaded (see createContext + enforceAuth). */
  orgId: string | null;
  /** Fastify request.id — unique per HTTP request, used to correlate all logs. */
  requestId: string | null;
  sessionId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  /** Value of the X-Idempotency-Key request header, if provided. */
  idempotencyKey: string | null;
  /**
   * Raw bearer token from the Authorization header, used only by the MAC
   * (platform super-admin) surface to verify a `MAC_JWT_SECRET`-signed
   * operator token. Never populated from cookies and never used for tenant
   * auth — see `macProcedure`.
   */
  macToken: string | null;
};

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error, ctx }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
        // traceId lets the caller correlate client-side error logs with
        // server-side structured logs using the same request_id value.
        traceId: (ctx as Context | undefined)?.requestId ?? null,
      },
    };
  },
});

export const router = t.router;

// ── Latency Tracker ──────────────────────────────────────────────────────────

/** Warn when any single request exceeds this threshold. */
const SLOW_WARN_MS = 500;

const QUERY_HARD_LIMIT_MS =
  process.env.NODE_ENV === "production" ? 8_000 : 60_000;

/** How many recent samples to keep in the rolling window. */
const MAX_LATENCY_SAMPLES = 2000;

/** Print a latency distribution report every N completed requests. */
const REPORT_EVERY_N = 200;

interface LatencySample { path: string; ms: number }

const latencyTracker = (() => {
  const samples: LatencySample[] = [];
  let callCount = 0;

  function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1);
    return sorted[idx]!;
  }

  function report(label = "LATENCY_REPORT") {
    if (samples.length === 0) return;
    const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
    const avg = Math.round(ms.reduce((a, b) => a + b, 0) / ms.length);

    // Per-path averages → top-5 slowest
    const byPath: Record<string, number[]> = {};
    for (const s of samples) {
      (byPath[s.path] ??= []).push(s.ms);
    }
    const slowEndpoints = Object.entries(byPath)
      .map(([path, times]) => ({
        path,
        avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
        max: Math.max(...times),
        count: times.length,
      }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);

    logInfo(label, {
      samples: ms.length,
      avg,
      p50: percentile(ms, 0.5),
      p95: percentile(ms, 0.95),
      p99: percentile(ms, 0.99),
      max: ms[ms.length - 1],
      slow_endpoints: slowEndpoints,
    });
  }

  function record(path: string, ms: number) {
    callCount++;
    if (samples.length >= MAX_LATENCY_SAMPLES) samples.shift();
    samples.push({ path, ms });
    if (callCount % REPORT_EVERY_N === 0) report();
  }

  return { record, report };
})();

// Print a final summary when the process shuts down (SIGINT / SIGTERM).
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => {
    latencyTracker.report("LATENCY_SUMMARY_SHUTDOWN");
    process.exit(0);
  });
}

// ── Logging + timing middleware ───────────────────────────────────────────────

/**
 * Logs every tRPC call (path, type, requestId, user) and captures errors with
 * context.  Also tracks request latency and emits [SLOW REQUEST] / [TIMEOUT]
 * warnings.  Suppressed in test environments to keep vitest output clean.
 *
 * Error categorisation:
 *   INTERNAL_SERVER_ERROR + PG code  → [DB_ERROR]    via logDbError
 *   INTERNAL_SERVER_ERROR (other)    → [SERVER_ERROR] via logServerError
 *   UNAUTHORIZED                     → [AUTH_FAIL]   logged at enforceAuth
 *   FORBIDDEN                        → [RBAC_DENIED] logged at permissionProcedure
 *   Other 4xx (BAD_REQUEST, etc.)    → not logged here (expected app responses)
 */
const loggingMiddleware = t.middleware(async ({ ctx, path, type, next }) => {
  const isTest = process.env["NODE_ENV"] === "test";
  const start = Date.now();

  if (!isTest) {
    logInfo("TRPC_REQUEST", {
      request_id: ctx.requestId ?? null,
      path,
      type,
      user_id: ctx.user?.id ?? null,
      org_id:  ctx.orgId ?? null,
    });
  }

  // Hard timeout for queries only (mutations must be allowed to complete so
  // that partially-committed transactions are not silently abandoned).
  let result: Awaited<ReturnType<typeof next>>;

  if (type === "query") {
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new TRPCError({ code: "TIMEOUT", message: "Query took too long. Please retry." })),
        QUERY_HARD_LIMIT_MS,
      );
      // Ensure timer doesn't keep the process alive
      if (typeof timer === "object" && timer !== null && "unref" in timer) {
        (timer as ReturnType<typeof setTimeout> & { unref(): void }).unref();
      }
    });

    try {
      result = await Promise.race([next(), timeoutPromise]);
    } catch (err) {
      const ms = Date.now() - start;
      if (err instanceof TRPCError && err.code === "TIMEOUT" && !isTest) {
        logError("QUERY_TIMEOUT", err, {
          request_id: ctx.requestId ?? null,
          path,
          duration_ms: ms,
          user_id: ctx.user?.id ?? null,
        });
      }
      throw err;
    }
  } else {
    // Mutations: no hard timeout — just let them complete
    result = await next();
  }

  const duration = Date.now() - start;

  if (!isTest) {
    latencyTracker.record(path, duration);

    if (duration > SLOW_WARN_MS) {
      logWarn("SLOW_REQUEST", {
        request_id: ctx.requestId ?? null,
        path,
        duration_ms: duration,
        type,
        user_id: ctx.user?.id ?? null,
      });
    }

    if (!result.ok) {
      const e = result.error as TRPCError & { cause?: unknown };

      const meta: RequestMeta = {
        requestId: ctx.requestId ?? null,
        userId:    (ctx.user?.id as string | null) ?? null,
        orgId:     ctx.orgId ?? null,
        route:     path,
        ip:        ctx.ipAddress,
      };

      if (e.code === "INTERNAL_SERVER_ERROR") {
        // Distinguish DB errors (have a 5-char PG code in the cause chain)
        // from generic server errors (bugs, unhandled exceptions, etc.).
        const pgCode = extractPgCode(e.cause ?? e);
        if (pgCode) {
          logDbError(meta, e.cause ?? e);
        } else {
          logServerError(meta, e.cause ?? e);
        }
      }
      // UNAUTHORIZED  → already logged by enforceAuth at the point of detection
      // FORBIDDEN     → already logged by permissionProcedure / adminProcedure
      // TIMEOUT       → logged above with its own [TIMEOUT] prefix
      // Other 4xx     → expected application responses (BAD_REQUEST, NOT_FOUND…)
      //                 not treated as server errors
    }
  }

  return result;
});

export const publicProcedure = t.procedure.use(loggingMiddleware);

/**
 * MAC (platform super-admin / Mission-and-Admin-Control) operator gate.
 *
 * The MAC surface performs CROSS-TENANT privileged operations (org create /
 * suspend, session revocation, operator impersonation, billing, feature
 * flags). It is NOT tenant-scoped and must never be a `publicProcedure`.
 *
 * Authn model: `mac.login` validates the operator against MAC_OPERATOR_* env
 * and issues a short-lived JWT signed with `MAC_JWT_SECRET` carrying
 * `{ role: "mac_operator" }`. Every other MAC procedure must present that
 * token as `Authorization: Bearer <token>` — verified here. Failure → 401.
 *
 * `mac.login` itself stays a `publicProcedure` (no token yet exists).
 */
const enforceMacOperator = t.middleware(({ ctx, path, next }) => {
  // Defense-in-depth: the whole MAC control plane is off unless explicitly
  // enabled. Throw NOT_FOUND so a disabled surface is indistinguishable from a
  // non-existent one (mirrors `assertMacEnabled` guarding `mac.login`).
  if (process.env["MAC_ENABLED"] !== "true") {
    throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
  }

  const macSecret = process.env["MAC_JWT_SECRET"];
  if (!macSecret) {
    // Fail closed: if the secret is unset the surface cannot be authenticated,
    // so deny rather than allow unauthenticated access.
    logAuthFail({
      requestId: ctx.requestId ?? null,
      userId: null,
      orgId: null,
      route: path,
      ip: ctx.ipAddress,
      sessionRef: null,
      reason: "mac_not_configured",
    });
    throw new TRPCError({ code: "UNAUTHORIZED", message: "MAC not configured" });
  }

  const token = ctx.macToken;
  if (!token) {
    logAuthFail({
      requestId: ctx.requestId ?? null,
      userId: null,
      orgId: null,
      route: path,
      ip: ctx.ipAddress,
      sessionRef: null,
      reason: "mac_no_token",
    });
    throw new TRPCError({ code: "UNAUTHORIZED", message: "MAC operator token required" });
  }

  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, macSecret);
  } catch {
    logAuthFail({
      requestId: ctx.requestId ?? null,
      userId: null,
      orgId: null,
      route: path,
      ip: ctx.ipAddress,
      sessionRef: null,
      reason: "mac_invalid_token",
    });
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid MAC operator token" });
  }

  const role = typeof payload === "object" ? payload["role"] : undefined;
  if (role !== "mac_operator") {
    logAuthFail({
      requestId: ctx.requestId ?? null,
      userId: null,
      orgId: null,
      route: path,
      ip: ctx.ipAddress,
      sessionRef: null,
      reason: "mac_wrong_role",
    });
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not a MAC operator" });
  }

  return next({ ctx });
});

/**
 * Procedure for the platform super-admin (MAC) surface. Requires a valid
 * `MAC_JWT_SECRET`-signed operator token. Use for every `mac.*` procedure
 * except `mac.login`.
 */
export const macProcedure = publicProcedure.use(enforceMacOperator);

const enforceAuth = t.middleware(({ ctx, path, next }) => {
  if (!ctx.user || !ctx.org) {
    logAuthFail({
      requestId:  ctx.requestId ?? null,
      userId:     null,
      orgId:      null,
      route:      path,
      ip:         ctx.ipAddress,
      // ctx.sessionId is the SHA-256 hash of the token — safe to log truncated.
      sessionRef: shortRef(ctx.sessionId),
      reason:     "no_user_or_org",
    });
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      org: ctx.org,
      orgId: ctx.org.id as string,
    },
  });
});

/**
 * Successful mutations → audit_logs.
 * Captures resource_id (from input.id or result.id) and sanitized changes.
 */
const auditMutation = t.middleware(async (opts) => {
  const rawInputValue = await opts.getRawInput().catch(() => null);
  const result = await opts.next();
  if (opts.type !== "mutation") return result;
  const { ctx, path } = opts;
  if (!ctx.org?.id || !ctx.user?.id) return result;
  try {
    const parts = path?.split(".") ?? [];
    const resourceType = parts[0] ?? "unknown";

    const input = rawInputValue as Record<string, unknown> | null | undefined;
    const output = (result as { ok: boolean; data?: unknown }).data as Record<string, unknown> | null | undefined;

    // resource_id: prefer input.id (for updates/deletes), fall back to result.id (for creates)
    const resourceId =
      (typeof input?.id === "string" ? input.id : null) ??
      (typeof output?.id === "string" ? output.id : null) ??
      null;

    // changes: sanitized input (creates get full input; updates get input fields)
    const changes = input ? sanitizeForAudit(input) as Record<string, unknown> : undefined;

    await ctx.db.insert(auditLogs).values({
      orgId: ctx.org.id,
      userId: ctx.user.id,
      action: path ?? "mutation",
      resourceType,
      resourceId,
      changes,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  } catch {
    /* non-fatal — never block the actual mutation */
  }
  return result;
});

// ── Mutation retry middleware ─────────────────────────────────────────────────
//
// Middleware execution order (outermost → innermost):
//
//   loggingMiddleware → enforceAuth → auditMutation → retryMutation → handler
//
// Placing retryMutation as the INNERMOST layer means:
//   • Only the handler is re-executed on each retry attempt.
//   • loggingMiddleware records the full round-trip (including all retries) as
//     one request — latency is measured end-to-end.
//   • auditMutation writes its log entry ONCE, after all retries settle, using
//     the final successful result.
//
// Safety:
//   Retrying the full handler is safe only for transient DB conflicts where the
//   same inputs will succeed on the next attempt (serialization failures,
//   deadlocks).  For 23505 (unique_violation), the org_counters atomic counter
//   prevents duplicate auto-numbers; handlers with idempotency keys catch
//   accidental second inserts; other genuine unique conflicts will fail again on
//   retry and surface normally to the caller after MAX_ATTEMPTS.
//
// Never retried: any named TRPCError (UNAUTHORIZED, FORBIDDEN, BAD_REQUEST,
//   NOT_FOUND …) — those are application-level decisions, not infrastructure.

const retryMutation = t.middleware(async (opts) => {
  // Queries carry a hard timeout above; leave them untouched here.
  if (opts.type !== "mutation") return opts.next();

  let result!: Awaited<ReturnType<typeof opts.next>>;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    result = await opts.next();

    // Happy path — return immediately.
    if (result.ok) return result;

    // Check whether the failure is a retryable transient DB conflict.
    const shouldRetry =
      isRetryableTrpcResult(result) && attempt < MAX_ATTEMPTS - 1;

    if (!shouldRetry) return result;

    logWarn("MUTATION_RETRY", {
      path:        opts.path,
      attempt:     attempt + 1,
      max_attempts: MAX_ATTEMPTS,
    });

    await retryDelay();
  }

  return result;
});

export const protectedProcedure = t.procedure
  .use(loggingMiddleware)
  .use(enforceAuth)
  .use(auditMutation)
  .use(retryMutation);

export function permissionProcedure(module: Module, action: RbacAction) {
  return protectedProcedure.use(({ ctx, path, next }) => {
    // enforceAuth (layered below) already rejects null users, but under heavy
    // concurrency a middleware race can reach this point with ctx.user still
    // null (session cache miss → DB lookup still in-flight). Guard explicitly
    // so the error is always UNAUTHORIZED, never a TypeError → 500.
    if (!ctx.user || !ctx.org) {
      logAuthFail({
        requestId:  ctx.requestId ?? null,
        userId:     null,
        orgId:      null,
        route:      path,
        ip:         ctx.ipAddress,
        sessionRef: shortRef(ctx.sessionId),
        reason:     "no_user_or_org",
      });
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Not authenticated",
      });
    }

    const role = String(ctx.user.role ?? "");
    const matrixRole = ctx.user.matrixRole as string | null | undefined;

    if (!checkDbUserPermission(role, module, action, matrixRole)) {
      logRbacDenied({
        requestId: ctx.requestId ?? null,
        userId:    ctx.user.id as string,
        orgId:     ctx.orgId ?? null,
        route:     path,
        module,
        action,
        role,
      });
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Permission denied: ${module}.${action}`,
      });
    }

    return next({ ctx });
  });
}

/** Org policy: `settings.security.requireStepUpForMatrixRoles` → password re-check via `auth.verifyStepUp`. */
export const stepUpGate = t.middleware(async ({ ctx, next }) => {
  await assertStepUpIfRequired(ctx);
  return next();
});

/** Org policy: `settings.security.requireMfaForMatrixRoles` → `users.mfa_enrolled` must be true (US-SEC-001). */
export const mfaGate = t.middleware(async ({ ctx, next, path }) => {
  await assertMfaIfRequired({
    db: ctx.db,
    orgId: ctx.orgId,
    user: ctx.user as Record<string, unknown> | null,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    procedurePath: path,
  });
  return next();
});

export const adminProcedure = protectedProcedure.use(({ ctx, path, next }) => {
  // Same null guard — ensures admin checks always return UNAUTHORIZED/FORBIDDEN,
  // never 500, even when ctx.user is transiently null under load.
  if (!ctx.user || !ctx.org) {
    logAuthFail({
      requestId:  ctx.requestId ?? null,
      userId:     null,
      orgId:      null,
      route:      path,
      ip:         ctx.ipAddress,
      sessionRef: shortRef(ctx.sessionId),
      reason:     "no_user_or_org",
    });
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Not authenticated",
    });
  }

  const r = ctx.user.role;
  if (r !== "owner" && r !== "admin") {
    logRbacDenied({
      requestId: ctx.requestId ?? null,
      userId:    ctx.user.id as string,
      orgId:     ctx.orgId ?? null,
      route:     path,
      module:    "admin",
      action:    "access",
      role:      String(r ?? ""),
    });
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});
