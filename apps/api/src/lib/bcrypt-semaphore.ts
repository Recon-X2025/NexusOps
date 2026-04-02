/**
 * Counting semaphore for bcrypt operations.
 *
 * Problem: bcrypt.compare() is CPU-bound and runs on Node.js's libuv thread
 * pool (default size: 4).  Under load, 200 concurrent login requests saturate
 * the thread pool, causing all requests to queue up and multiply the effective
 * latency.  Serialising through this semaphore caps parallelism at a level the
 * thread pool can sustain, keeping individual latency predictable.
 *
 * Configuration:
 *   BCRYPT_CONCURRENCY   max simultaneous bcrypt executions (default: 8)
 *                        Set to 2× the libuv thread pool size for headroom.
 *                        Increase LIBUV_THREADPOOL_SIZE env var in tandem if
 *                        you raise this above the pool size.
 *
 *   BCRYPT_QUEUE_MAX     max callers queued waiting for a slot (default: 200)
 *                        Requests beyond this limit fail-fast with 503
 *                        rather than piling up indefinitely.
 */

const MAX_CONCURRENT = parseInt(process.env["BCRYPT_CONCURRENCY"] ?? "8", 10);
const MAX_QUEUE      = parseInt(process.env["BCRYPT_QUEUE_MAX"]    ?? "200", 10);

let active = 0;
const waiters: Array<() => void> = [];

/** Hand off the active slot to the next waiter, or decrement the counter. */
function release(): void {
  const next = waiters.shift();
  if (next) {
    // Hand off the slot — active count stays the same.
    next();
  } else {
    active--;
  }
}

/**
 * Run `fn` inside a bcrypt slot.  If no slot is available, waits in a FIFO
 * queue.  Throws `TRPCError(TOO_MANY_REQUESTS)` if the queue is full.
 */
export async function withBcryptSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) {
    if (waiters.length >= MAX_QUEUE) {
      // Shed load rather than pile up — caller should retry.
      const { TRPCError } = await import("@trpc/server");
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Login service is temporarily overloaded. Please retry in a moment.",
      });
    }
    // Enqueue: wait until a slot is released.
    await new Promise<void>((resolve) => waiters.push(resolve));
    // After waking up we already hold the slot (release() skipped decrement).
  } else {
    active++;
  }

  try {
    return await fn();
  } finally {
    release();
  }
}

/** Snapshot for observability — exposed on /internal/metrics. */
export function getBcryptStats(): { active: number; queued: number; max_concurrent: number } {
  return { active, queued: waiters.length, max_concurrent: MAX_CONCURRENT };
}
