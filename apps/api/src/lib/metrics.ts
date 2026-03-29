/**
 * Lightweight in-memory metrics store for NexusOps API.
 *
 * Design constraints:
 *  - Zero dependencies — plain JS objects and arithmetic only.
 *  - Constant memory: per-endpoint state is O(1); no unbounded arrays.
 *  - No async I/O, no locks — every operation is synchronous and cheap
 *    (a few additions and comparisons per request).
 *  - Safe to call from the hot path (onResponse hook, error handlers).
 *
 * Running average algorithm:
 *   Welford's online algorithm is overkill here; a simple cumulative mean
 *   is sufficient:
 *
 *     new_avg = old_avg + (new_value - old_avg) / new_count
 *
 *   This gives exact running averages with O(1) state and no floating-point
 *   drift for the request volumes this API sees.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EndpointStats {
  /** Total completed requests (all status codes). */
  count:          number;
  /** Requests that resulted in a 5xx status code. */
  errors:         number;
  /** Running arithmetic mean of response time in milliseconds. */
  avg_latency_ms: number;
  /** Fastest observed response (ms). */
  min_latency_ms: number;
  /** Slowest observed response (ms). */
  max_latency_ms: number;
  /** Last time this endpoint was hit (ISO string). */
  last_seen:      string;
}

export interface MetricsSnapshot {
  /** Wall-clock time when the counters were last reset (or when the process started). */
  since:           string;
  /** Wall-clock time of this snapshot. */
  timestamp:       string;
  /** Total HTTP requests recorded since last reset. */
  total_requests:  number;
  /** Total 5xx responses recorded since last reset. */
  total_errors:    number;
  /** total_errors / total_requests — 0 when no requests have been recorded. */
  error_rate:      number;
  /** Total 429 responses served by @fastify/rate-limit since last reset. */
  rate_limited:    number;
  /** Per-endpoint breakdown keyed by normalised URL. */
  endpoints:       Record<string, EndpointStats>;
}

// ── Internal state ────────────────────────────────────────────────────────────
//
// A single plain object — no Map, no class.  Fields are mutated in-place by
// the record* functions.  All access is synchronous; Node.js's single-threaded
// event loop guarantees no concurrent mutation.

interface MetricsState {
  since:          string;
  total_requests: number;
  total_errors:   number;
  rate_limited:   number;
  endpoints:      Record<string, EndpointStats>;
}

const state: MetricsState = {
  since:          new Date().toISOString(),
  total_requests: 0,
  total_errors:   0,
  rate_limited:   0,
  endpoints:      {},
};

// ── URL normalisation ─────────────────────────────────────────────────────────
//
// Strip query strings so that `/trpc/tickets.list?input=...` is bucketed as
// `/trpc/tickets.list`.  This keeps the endpoint map bounded even if callers
// pass arbitrary query parameters.

function normalise(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

// ── API ───────────────────────────────────────────────────────────────────────

/**
 * Record one completed HTTP request.
 *
 * Called from the Fastify `onResponse` hook — runs after every HTTP response
 * regardless of status code.
 *
 * @param url      Raw request URL (query string stripped internally).
 * @param duration Response time in milliseconds (reply.elapsedTime).
 * @param status   HTTP status code.
 */
export function recordRequest(url: string, duration: number, status: number): void {
  const endpoint = normalise(url);
  const ms       = Math.round(duration);
  const isError  = status >= 500;

  // ── Global counters ────────────────────────────────────────────────────────
  state.total_requests++;
  if (isError) state.total_errors++;

  // ── Per-endpoint counters ──────────────────────────────────────────────────
  let ep = state.endpoints[endpoint];

  if (ep === undefined) {
    // First request to this endpoint.
    state.endpoints[endpoint] = {
      count:          1,
      errors:         isError ? 1 : 0,
      avg_latency_ms: ms,
      min_latency_ms: ms,
      max_latency_ms: ms,
      last_seen:      new Date().toISOString(),
    };
    return;
  }

  ep.count++;
  if (isError) ep.errors++;

  // Welford-style incremental mean: no running sum needed, no overflow risk.
  ep.avg_latency_ms = ep.avg_latency_ms + (ms - ep.avg_latency_ms) / ep.count;

  if (ms < ep.min_latency_ms) ep.min_latency_ms = ms;
  if (ms > ep.max_latency_ms) ep.max_latency_ms = ms;

  ep.last_seen = new Date().toISOString();
}

/**
 * Increment the rate-limit counter.
 *
 * Called from the @fastify/rate-limit `errorResponseBuilder` alongside
 * `logRateLimit`, so that health evaluation can detect rate-limit pressure.
 */
export function recordRateLimit(): void {
  state.rate_limited++;
}

/**
 * Increment the error counter for a specific endpoint.
 *
 * This is a targeted increment for cases where an error is detected outside
 * the normal request/response cycle (e.g. tRPC onError callback for
 * pre-context errors).  The regular `recordRequest` already counts 5xx
 * responses when called from `onResponse`, so avoid double-counting by only
 * calling this for errors that do NOT go through the normal flow.
 *
 * @param url Endpoint URL (query string stripped internally).
 */
export function recordError(url: string): void {
  const endpoint = normalise(url);
  state.total_errors++;

  const ep = state.endpoints[endpoint];
  if (ep) {
    ep.errors++;
  } else {
    // Error on an endpoint we have not seen a full request for yet.
    state.endpoints[endpoint] = {
      count:          0,
      errors:         1,
      avg_latency_ms: 0,
      min_latency_ms: 0,
      max_latency_ms: 0,
      last_seen:      new Date().toISOString(),
    };
  }
}

/**
 * Return a point-in-time snapshot of all metrics.
 *
 * Rounds avg_latency_ms to one decimal place for readability.
 * Does NOT reset counters — call `resetMetrics()` for that.
 */
export function getMetricsSnapshot(): MetricsSnapshot {
  const total = state.total_requests;
  const errors = state.total_errors;

  // Round per-endpoint averages to one decimal; copy to avoid exposing
  // mutable internal state.
  const endpoints: Record<string, EndpointStats> = {};
  for (const [key, ep] of Object.entries(state.endpoints)) {
    endpoints[key] = {
      count:          ep.count,
      errors:         ep.errors,
      avg_latency_ms: Math.round(ep.avg_latency_ms * 10) / 10,
      min_latency_ms: ep.min_latency_ms,
      max_latency_ms: ep.max_latency_ms,
      last_seen:      ep.last_seen,
    };
  }

  return {
    since:          state.since,
    timestamp:      new Date().toISOString(),
    total_requests: total,
    total_errors:   errors,
    error_rate:     total === 0 ? 0 : Math.round((errors / total) * 10_000) / 10_000,
    rate_limited:   state.rate_limited,
    endpoints,
  };
}

/**
 * Reset all counters to zero.
 *
 * Called from `POST /internal/metrics/reset`.
 */
export function resetMetrics(): void {
  state.since          = new Date().toISOString();
  state.total_requests = 0;
  state.total_errors   = 0;
  state.rate_limited   = 0;
  state.endpoints      = {};
}
