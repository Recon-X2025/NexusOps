import { TRPCError } from "@trpc/server";

// ── Retryable PostgreSQL error codes ─────────────────────────────────────────
//
//  23505  unique_violation       — concurrent inserts racing on the same UK
//  40001  serialization_failure  — SERIALIZABLE / repeatable-read tx conflict
//  40P01  deadlock_detected      — mutual row-lock deadlock
//
// Deliberately NOT retried (same data → same failure):
//  23502  not_null_violation
//  23503  foreign_key_violation
//  23514  check_violation
//  42P01  undefined_table        (schema error, not transient)
//  … anything else

export const RETRYABLE_PG_CODES = new Set<string>(["23505", "40001", "40P01"]);

// ── Tuning constants ──────────────────────────────────────────────────────────

/** Total attempts: 1 original + (MAX_ATTEMPTS - 1) retries. */
export const MAX_ATTEMPTS = 3;

/** Retry delay window in ms — random uniform sample keeps workers from
 *  retrying in lock-step after a shared-key conflict. */
const RETRY_MIN_MS = 10;
const RETRY_MAX_MS = 50;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a one-shot timer for a random delay in [RETRY_MIN_MS, RETRY_MAX_MS]. */
export function retryDelay(): Promise<void> {
  const ms = RETRY_MIN_MS + Math.random() * (RETRY_MAX_MS - RETRY_MIN_MS);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Walks the error chain (err → err.cause → …, up to 8 levels) looking for a
 * PostgreSQL error code — a 5-character uppercase-alphanumeric string.
 *
 * Works with raw pg / postgres.js errors, Drizzle-wrapped errors, and
 * errors nested inside TRPCError.cause.
 */
export function extractPgCode(err: unknown): string | null {
  let cur: unknown = err;
  for (let depth = 0; depth < 8 && cur != null && typeof cur === "object"; depth++) {
    const code = (cur as Record<string, unknown>)["code"];
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as Record<string, unknown>)["cause"] ?? null;
  }
  return null;
}

/**
 * Returns true if the *thrown* error is a transient DB conflict that is safe
 * to retry with the same inputs.
 *
 * Rule: never retry application-level TRPCErrors (auth, validation,
 * permission, not-found…) — those are deterministic failures.
 */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof TRPCError) return false;
  const code = extractPgCode(err);
  return code !== null && RETRYABLE_PG_CODES.has(code);
}

/**
 * Returns true if a tRPC middleware Result (the value returned by opts.next())
 * represents a transient DB conflict.
 *
 * In tRPC v11, procedure errors do not throw through the middleware chain —
 * they are returned as `{ ok: false; error: TRPCError }`.  A raw DB error
 * surfaces as INTERNAL_SERVER_ERROR with the original error as `.cause`.
 *
 * Application errors (UNAUTHORIZED, FORBIDDEN, BAD_REQUEST, NOT_FOUND …) are
 * never retryable regardless of their cause.
 */
export function isRetryableTrpcResult(result: { ok: boolean; error?: unknown }): boolean {
  if (result.ok) return false;
  const err = result.error;
  // Only raw-DB-error wrapping qualifies; all named application codes do not.
  if (!(err instanceof TRPCError)) return false;
  if (err.code !== "INTERNAL_SERVER_ERROR") return false;
  const pgCode = extractPgCode(err.cause ?? err);
  return pgCode !== null && RETRYABLE_PG_CODES.has(pgCode);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Wraps a DB write operation (or `db.transaction()` block) with automatic
 * retry on transient conflicts.
 *
 * Use this inside mutation handlers when you want fine-grained control over
 * exactly which operation is retried rather than the whole handler:
 *
 *   const [row] = await withDbRetry(() =>
 *     db.insert(table).values(data).returning()
 *   );
 *
 * Retries on : 23505 (unique_violation), 40001 (serialization_failure),
 *              40P01 (deadlock_detected)
 * Never retries: TRPCError of any kind, foreign-key / not-null / check
 *                violations, or any non-DB error.
 *
 * @param fn The async write to execute and potentially retry.
 */
export async function withDbRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const shouldRetry = isRetryableError(err) && attempt < MAX_ATTEMPTS - 1;
      if (!shouldRetry) throw err;

      console.warn("[DB_RETRY]", {
        pgCode: extractPgCode(err),
        attempt: attempt + 1,
        maxAttempts: MAX_ATTEMPTS,
      });
      await retryDelay();
    }
  }
  // TypeScript: the loop always throws on the last attempt; this is unreachable.
  throw new Error("db-retry: unreachable");
}
