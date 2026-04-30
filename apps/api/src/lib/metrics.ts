/**
 * Lightweight in-memory metrics store for CoheronConnect API.
 *
 * Design constraints:
 *  - Zero dependencies — plain JS objects and arithmetic only.
 *  - Bounded memory: per-endpoint latency ring buffer capped at RING_SIZE
 *    samples; RPS tracker uses a fixed 60-bucket second-resolution ring.
 *  - No async I/O, no locks — every operation is synchronous and cheap
 *    (a few additions and comparisons per request).
 *  - Safe to call from the hot path (onResponse hook, error handlers).
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** Latency samples per endpoint for percentile calculation (p95 + p99). */
const RING_SIZE = 200;

/** Slow request threshold in ms — requests above this are counted separately. */
const SLOW_THRESHOLD_MS = 1_000;

/** RPS rolling window in seconds. */
const RPS_WINDOW_SECS = 60;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EndpointStats {
  /** Total completed requests (all status codes). */
  count:          number;
  /** Requests that resulted in a 5xx status code. */
  errors:         number;
  /** error / count — 0 when count is 0. */
  error_rate:     number;
  /** Requests whose response time exceeded SLOW_THRESHOLD_MS (1 000 ms). */
  slow_requests:  number;
  /** Running arithmetic mean of response time in milliseconds. */
  avg_latency_ms: number;
  /** 95th-percentile latency based on the last RING_SIZE samples. */
  p95_latency_ms: number;
  /** 99th-percentile latency based on the last RING_SIZE samples. */
  p99_latency_ms: number;
  /** Fastest observed response (ms). */
  min_latency_ms: number;
  /** Slowest observed response (ms). */
  max_latency_ms: number;
  /** Requests per second averaged over the last 60 seconds. */
  rps:            number;
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
  /** Requests per second (global, averaged over last 60 s). */
  rps:             number;
  /** Per-endpoint breakdown keyed by normalised URL. */
  endpoints:       Record<string, EndpointStats>;
}

// ── Internal state ────────────────────────────────────────────────────────────
//
// A single plain object — no Map, no class.  Fields are mutated in-place by
// the record* functions.  All access is synchronous; Node.js's single-threaded
// event loop guarantees no concurrent mutation.

interface EndpointState {
  count:          number;
  errors:         number;
  slow_requests:  number;
  avg_latency_ms: number;
  min_latency_ms: number;
  max_latency_ms: number;
  last_seen:      string;
  /** Ring buffer of the last RING_SIZE latency samples for percentile calc. */
  ring:           number[];
  ringHead:       number;
  ringFull:       boolean;
  /** RPS: 60-bucket second-resolution counter ring. */
  rpsRing:        number[];
  rpsHead:        number;
  rpsLastSec:     number;
}

interface MetricsState {
  since:          string;
  total_requests: number;
  total_errors:   number;
  rate_limited:   number;
  endpoints:      Record<string, EndpointState>;
  /** Global RPS tracker across all endpoints. */
  globalRps: {
    rpsRing:    number[];
    rpsHead:    number;
    rpsLastSec: number;
  };
}

const state: MetricsState = {
  since:          new Date().toISOString(),
  total_requests: 0,
  total_errors:   0,
  rate_limited:   0,
  endpoints:      {},
  globalRps: {
    rpsRing:    new Array<number>(RPS_WINDOW_SECS).fill(0),
    rpsHead:    0,
    rpsLastSec: Math.floor(Date.now() / 1_000),
  },
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
/** Helper: compute a percentile from a sorted numeric array. */
function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1);
  return sorted[idx]!;
}

/** Build a fresh EndpointState for the first request to a given endpoint. */
function newEndpointState(ms: number, isError: boolean, nowSec: number): EndpointState {
  const ring    = new Array<number>(RING_SIZE).fill(0);
  const rpsRing = new Array<number>(RPS_WINDOW_SECS).fill(0);
  ring[0]    = ms;
  rpsRing[0] = 1;
  return {
    count:          1,
    errors:         isError ? 1 : 0,
    slow_requests:  ms >= SLOW_THRESHOLD_MS ? 1 : 0,
    avg_latency_ms: ms,
    min_latency_ms: ms,
    max_latency_ms: ms,
    last_seen:      new Date().toISOString(),
    ring,
    ringHead:       1,
    ringFull:       false,
    rpsRing,
    rpsHead:        0,
    rpsLastSec:     nowSec,
  };
}

export function recordRequest(url: string, duration: number, status: number): void {
  const endpoint = normalise(url);
  const ms       = Math.round(duration);
  const isError  = status >= 500;
  const isSlow   = ms >= SLOW_THRESHOLD_MS;
  const nowSec   = Math.floor(Date.now() / 1_000);

  // ── Global counters ────────────────────────────────────────────────────────
  state.total_requests++;
  if (isError) state.total_errors++;

  // Global RPS
  advanceRpsRing(state.globalRps, nowSec);
  state.globalRps.rpsRing[state.globalRps.rpsHead] = (state.globalRps.rpsRing[state.globalRps.rpsHead] ?? 0) + 1;

  // ── Per-endpoint counters ──────────────────────────────────────────────────
  let ep = state.endpoints[endpoint];

  if (ep === undefined) {
    state.endpoints[endpoint] = newEndpointState(ms, isError, nowSec);
    return;
  }

  ep.count++;
  if (isError) ep.errors++;
  if (isSlow) ep.slow_requests++;

  // Incremental mean
  ep.avg_latency_ms = ep.avg_latency_ms + (ms - ep.avg_latency_ms) / ep.count;
  if (ms < ep.min_latency_ms) ep.min_latency_ms = ms;
  if (ms > ep.max_latency_ms) ep.max_latency_ms = ms;

  // Latency ring buffer → p95 + p99
  ep.ring[ep.ringHead] = ms;
  ep.ringHead = (ep.ringHead + 1) % RING_SIZE;
  if (!ep.ringFull && ep.ringHead === 0) ep.ringFull = true;

  // RPS second-bucket ring
  advanceRpsRing(ep, nowSec);
  ep.rpsRing[ep.rpsHead] = (ep.rpsRing[ep.rpsHead] ?? 0) + 1;

  ep.last_seen = new Date().toISOString();
}

/** Advance the per-endpoint (or global) RPS ring to the current second. */
function advanceRpsRing(ep: { rpsRing: number[]; rpsHead: number; rpsLastSec: number }, nowSec: number): void {
  const elapsed = nowSec - ep.rpsLastSec;
  if (elapsed <= 0) return;
  const steps = Math.min(elapsed, RPS_WINDOW_SECS);
  for (let i = 0; i < steps; i++) {
    ep.rpsHead = (ep.rpsHead + 1) % RPS_WINDOW_SECS;
    ep.rpsRing[ep.rpsHead] = 0; // zero out the expired bucket
  }
  ep.rpsLastSec = nowSec;
}

/** Compute current RPS from a ring buffer: sum / window_size. */
function computeRps(ep: { rpsRing: number[] }): number {
  const total = ep.rpsRing.reduce((a, b) => a + b, 0);
  return Math.round((total / RPS_WINDOW_SECS) * 100) / 100;
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
    const ring    = new Array<number>(RING_SIZE).fill(0);
    const rpsRing = new Array<number>(RPS_WINDOW_SECS).fill(0);
    const nowSec  = Math.floor(Date.now() / 1_000);
    state.endpoints[endpoint] = {
      count:          0,
      errors:         1,
      slow_requests:  0,
      avg_latency_ms: 0,
      min_latency_ms: 0,
      max_latency_ms: 0,
      last_seen:      new Date().toISOString(),
      ring,
      ringHead:       0,
      ringFull:       false,
      rpsRing,
      rpsHead:        0,
      rpsLastSec:     nowSec,
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
  const total  = state.total_requests;
  const errors = state.total_errors;

  // Round per-endpoint averages to one decimal; compute percentiles.
  // Ring buffer and RPS tracking state excluded from snapshot.
  const endpoints: Record<string, EndpointStats> = {};
  for (const [key, ep] of Object.entries(state.endpoints)) {
    const filled = ep.ringFull ? RING_SIZE : ep.count;
    const sorted = ep.ring.slice(0, filled).sort((a, b) => a - b);

    endpoints[key] = {
      count:          ep.count,
      errors:         ep.errors,
      error_rate:     ep.count === 0 ? 0 : Math.round((ep.errors / ep.count) * 10_000) / 10_000,
      slow_requests:  ep.slow_requests,
      avg_latency_ms: Math.round(ep.avg_latency_ms * 10) / 10,
      p95_latency_ms: Math.round(pct(sorted, 0.95)),
      p99_latency_ms: Math.round(pct(sorted, 0.99)),
      min_latency_ms: ep.min_latency_ms,
      max_latency_ms: ep.max_latency_ms,
      rps:            computeRps(ep),
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
    rps:            computeRps(state.globalRps),
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
  state.globalRps.rpsRing    = new Array<number>(RPS_WINDOW_SECS).fill(0);
  state.globalRps.rpsHead    = 0;
  state.globalRps.rpsLastSec = Math.floor(Date.now() / 1_000);
}
