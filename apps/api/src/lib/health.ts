/**
 * Health evaluator for CoheronConnect API.
 *
 * Takes a MetricsSnapshot and applies a fixed rule set to produce one of:
 *
 *   HEALTHY    — all thresholds clear
 *   DEGRADED   — one or more soft thresholds breached; service is functional
 *                but operating outside normal parameters
 *   UNHEALTHY  — one or more hard thresholds breached; operator action needed
 *
 * Rules are evaluated in ascending severity order.  The worst signal wins:
 * if any UNHEALTHY rule fires, the overall status is UNHEALTHY regardless of
 * other rules.
 *
 * ── Design intent ─────────────────────────────────────────────────────────────
 *  - Pure function: same inputs always produce the same output.
 *  - No side effects, no async, no state.
 *  - Thresholds are named constants — change them in one place.
 *  - "reasons" is a human-readable list; "summary" carries the numbers that
 *    triggered the evaluation for dashboards and alerting.
 *
 * ── Minimum traffic guard ─────────────────────────────────────────────────────
 *  Error rate is only evaluated when at least MIN_REQUESTS_FOR_RATE_EVAL
 *  requests have been recorded.  A single 500 on a fresh process would
 *  otherwise flip the system to UNHEALTHY immediately.
 */

import type { MetricsSnapshot } from "./metrics.js";

// ── Thresholds ────────────────────────────────────────────────────────────────

const ERROR_RATE_UNHEALTHY       = 0.05;   // > 5 %   → UNHEALTHY
const ERROR_RATE_DEGRADED        = 0.01;   // > 1 %   → DEGRADED

const LATENCY_UNHEALTHY_MS       = 2000;   // avg > 2 s on any endpoint → UNHEALTHY
const LATENCY_DEGRADED_MS        = 1000;   // avg > 1 s on any endpoint → DEGRADED

const RATE_LIMIT_DEGRADED        = 100;    // > 100 rate-limited requests → DEGRADED

const MIN_REQUESTS_FOR_RATE_EVAL = 20;     // ignore error rate below this traffic floor

// ── Types ─────────────────────────────────────────────────────────────────────

export type HealthStatus = "HEALTHY" | "DEGRADED" | "UNHEALTHY";

export interface SlowEndpoint {
  endpoint:       string;
  avg_latency_ms: number;
}

export interface HealthResult {
  /** Overall system health signal. */
  status:  HealthStatus;
  /**
   * Human-readable list of reasons, one per triggered rule.
   * Empty when status is HEALTHY.
   */
  reasons: string[];
  /** Numeric values that drove the evaluation — useful for dashboards. */
  summary: {
    error_rate:     number;
    total_requests: number;
    total_errors:   number;
    rate_limited:   number;
    /** Endpoints whose avg_latency_ms exceeded LATENCY_DEGRADED_MS. */
    slow_endpoints: SlowEndpoint[];
  };
}

// ── Evaluator ─────────────────────────────────────────────────────────────────

/**
 * Evaluate system health from a metrics snapshot.
 *
 * Pure function — call as often as needed, no side effects.
 *
 * @param metrics A MetricsSnapshot from getMetricsSnapshot().
 * @returns       A HealthResult with status, reasons, and supporting numbers.
 */
export function evaluateHealth(metrics: MetricsSnapshot): HealthResult {
  const reasons:        string[]       = [];
  const slow_endpoints: SlowEndpoint[] = [];
  let   status:         HealthStatus   = "HEALTHY";

  // Helper: escalate to the worst status seen so far.
  function escalate(next: HealthStatus): void {
    if (next === "UNHEALTHY" || (next === "DEGRADED" && status === "HEALTHY")) {
      status = next;
    }
  }

  // ── Rule 1: Global error rate ──────────────────────────────────────────────
  //
  // Only evaluated when enough traffic has been seen to make the rate
  // statistically meaningful.
  if (metrics.total_requests >= MIN_REQUESTS_FOR_RATE_EVAL) {
    if (metrics.error_rate > ERROR_RATE_UNHEALTHY) {
      escalate("UNHEALTHY");
      reasons.push(
        `Error rate critical: ${(metrics.error_rate * 100).toFixed(1)}% ` +
        `(${metrics.total_errors}/${metrics.total_requests} requests) — ` +
        `threshold ${ERROR_RATE_UNHEALTHY * 100}%`,
      );
    } else if (metrics.error_rate > ERROR_RATE_DEGRADED) {
      escalate("DEGRADED");
      reasons.push(
        `Error rate elevated: ${(metrics.error_rate * 100).toFixed(1)}% ` +
        `(${metrics.total_errors}/${metrics.total_requests} requests) — ` +
        `threshold ${ERROR_RATE_DEGRADED * 100}%`,
      );
    }
  }

  // ── Rule 2: Per-endpoint average latency ──────────────────────────────────
  //
  // Only evaluated for endpoints that have received at least one request
  // (count > 0).  Endpoints that only have errors recorded (count === 0)
  // have no meaningful latency.
  for (const [endpoint, ep] of Object.entries(metrics.endpoints)) {
    if (ep.count === 0) continue;

    if (ep.avg_latency_ms > LATENCY_UNHEALTHY_MS) {
      escalate("UNHEALTHY");
      reasons.push(
        `Latency critical on ${endpoint}: avg ${ep.avg_latency_ms}ms — ` +
        `threshold ${LATENCY_UNHEALTHY_MS}ms`,
      );
      slow_endpoints.push({ endpoint, avg_latency_ms: ep.avg_latency_ms });
    } else if (ep.avg_latency_ms > LATENCY_DEGRADED_MS) {
      escalate("DEGRADED");
      reasons.push(
        `Latency elevated on ${endpoint}: avg ${ep.avg_latency_ms}ms — ` +
        `threshold ${LATENCY_DEGRADED_MS}ms`,
      );
      slow_endpoints.push({ endpoint, avg_latency_ms: ep.avg_latency_ms });
    }
  }

  // ── Rule 3: Rate-limit pressure ───────────────────────────────────────────
  //
  // A high number of rate-limited requests can indicate credential stuffing,
  // a misbehaving client, or that the rate-limit ceiling is too low for
  // legitimate traffic volume.
  if (metrics.rate_limited > RATE_LIMIT_DEGRADED) {
    escalate("DEGRADED");
    reasons.push(
      `Rate limit pressure: ${metrics.rate_limited} requests rejected ` +
      `(threshold ${RATE_LIMIT_DEGRADED})`,
    );
  }

  return {
    status,
    reasons,
    summary: {
      error_rate:     metrics.error_rate,
      total_requests: metrics.total_requests,
      total_errors:   metrics.total_errors,
      rate_limited:   metrics.rate_limited,
      slow_endpoints,
    },
  };
}
