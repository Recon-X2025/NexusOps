/**
 * Active health monitor for CoheronConnect API.
 *
 * Watches the in-memory metrics stream and emits a single structured log line
 * whenever the system's health status changes.  No background threads, no
 * timers, no external dependencies.
 *
 * ── How it works ──────────────────────────────────────────────────────────────
 *
 *   1. `checkHealth()` is called from the Fastify `onResponse` hook after every
 *      completed request (after `recordRequest` has updated the metrics store).
 *
 *   2. A module-level counter tracks how many times `checkHealth()` has been
 *      called.  When the counter reaches EVAL_EVERY (default: every 50
 *      requests) an evaluation is triggered.
 *
 *   3. The evaluator runs `getMetricsSnapshot()` → `evaluateHealth()` and
 *      compares the result to the last known status.
 *
 *   4. If the status has CHANGED, one log line is emitted at the appropriate
 *      level.  If the status is the same, nothing happens — zero log spam.
 *
 * ── Overhead ──────────────────────────────────────────────────────────────────
 *
 *   Non-evaluation path (49 out of 50 calls):
 *     ++counter  (one integer increment)
 *     counter % EVAL_EVERY  (one modulo)
 *     → return  (immediate)
 *
 *   Evaluation path (1 in 50 calls):
 *     getMetricsSnapshot()  — copies in-memory state (O(endpoints))
 *     evaluateHealth()      — iterates over endpoint map once
 *     compare two strings   — lastStatus vs new status
 *     → return  (no log if unchanged; one log line if changed)
 *
 *   Both paths are synchronous and complete in microseconds.
 *
 * ── Anti-spam guarantee ───────────────────────────────────────────────────────
 *
 *   The monitor only emits when `newStatus !== lastStatus`.
 *   A system stuck in DEGRADED for 10 000 requests produces exactly ONE log
 *   line (the initial DEGRADED transition), not 200.
 */

import { getMetricsSnapshot } from "./metrics.js";
import { evaluateHealth, type HealthStatus, type HealthResult } from "./health.js";
import { logInfo, logWarn, logError } from "./logger.js";

// ── Configuration ─────────────────────────────────────────────────────────────

/**
 * How many completed requests to process between health evaluations.
 *
 * 50 gives roughly one evaluation per 50 requests — fast enough to detect a
 * sudden spike, infrequent enough to add no meaningful overhead.
 *
 * Override via HEALTH_EVAL_EVERY env var (must be a positive integer).
 */
const EVAL_EVERY: number = (() => {
  const v = parseInt(process.env["HEALTH_EVAL_EVERY"] ?? "50", 10);
  return Number.isFinite(v) && v > 0 ? v : 50;
})();

// ── In-memory state ───────────────────────────────────────────────────────────
//
// Deliberately minimal: two values, module scope, no class required.

let lastStatus:    HealthStatus = "HEALTHY";
let lastChangedAt: string       = new Date().toISOString();
let callCount:     number       = 0;

// ── Log dispatch ──────────────────────────────────────────────────────────────

type EventName =
  | "SYSTEM_DEGRADED"
  | "SYSTEM_UNHEALTHY"
  | "SYSTEM_RECOVERED";

function resolveEvent(from: HealthStatus, to: HealthStatus): EventName {
  if (to === "HEALTHY")   return "SYSTEM_RECOVERED";
  if (to === "UNHEALTHY") return "SYSTEM_UNHEALTHY";
  return "SYSTEM_DEGRADED";
}

function emitTransition(
  event:  EventName,
  from:   HealthStatus,
  to:     HealthStatus,
  result: HealthResult,
): void {
  const payload = {
    event,
    from,
    to,
    reasons: result.reasons,
    summary: result.summary,
    changed_at: new Date().toISOString(),
  };

  if (to === "UNHEALTHY") {
    // Hard threshold breached — operator action likely needed.
    logError(event, new Error(result.reasons[0] ?? event), payload);
    return;
  }

  if (to === "DEGRADED") {
    // Soft threshold breached — service functional but outside normal range.
    logWarn(event, payload);
    return;
  }

  // to === "HEALTHY": system has recovered from a previous degraded state.
  logInfo(event, payload);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Increment the request counter and, every EVAL_EVERY calls, evaluate system
 * health and emit a log line if the status has changed.
 *
 * Called synchronously from the Fastify `onResponse` hook — must never throw.
 */
export function checkHealth(): void {
  callCount++;

  // Fast path: not an evaluation tick.
  if (callCount % EVAL_EVERY !== 0) return;

  // Evaluation path — runs once every EVAL_EVERY requests.
  try {
    const metrics = getMetricsSnapshot();
    const result  = evaluateHealth(metrics);
    const newStatus = result.status;

    // No change — silent return.  This is the common case once the system
    // reaches a steady state.
    if (newStatus === lastStatus) return;

    const event = resolveEvent(lastStatus, newStatus);

    emitTransition(event, lastStatus, newStatus, result);

    lastStatus    = newStatus;
    lastChangedAt = new Date().toISOString();
  } catch {
    // Never let a monitoring failure propagate into the request lifecycle.
  }
}

/**
 * Return the current monitor state.
 *
 * Exposed so that `GET /internal/health` can include how long the system has
 * been in its current state alongside the live evaluation result.
 */
export function getMonitorState(): { status: HealthStatus; since: string; eval_every: number } {
  return {
    status:     lastStatus,
    since:      lastChangedAt,
    eval_every: EVAL_EVERY,
  };
}
