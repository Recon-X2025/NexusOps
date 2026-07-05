/**
 * correlationWorkflow.ts — ITOM correlation sweeper via BullMQ (Sprint 3.4b).
 *
 * Complements the `events.ingest` path: ingestion runs suppression + correlation
 * synchronously on arrival, but events can be inserted by other paths (manual,
 * legacy imports) and correlation policies can be added *after* events already
 * exist. This periodic sweep re-evaluates OPEN, unlinked, un-suppressed events
 * so no matching policy is missed.
 *
 * Mirrors escalationWorkflow.ts: `sweepCorrelation(db)` is exported directly so
 * tests can drive it without a Redis-backed queue/worker.
 */
import { Queue, Worker, type Job } from "bullmq";
import type { Db } from "@coheronconnect/db";
import { itomEvents, sql } from "@coheronconnect/db";
import { evaluateEvent, type CorrelatableEvent } from "../services/itom-correlation";

function redisConnection() {
  return { url: process.env["REDIS_URL"] ?? "redis://localhost:6379" };
}

export const CORRELATION_QUEUE_NAME = "coheronconnect-correlation";

/** Job name used by the periodic correlation sweeper. */
export const CORRELATION_SWEEP_JOB_NAME = "correlation-sweep";
/** Sweep cadence — every minute, matching the other ITSM sweepers. */
const CORRELATION_SWEEP_INTERVAL_MS = 60_000;
/** Hard cap on events a single tick may evaluate. */
const CORRELATION_SWEEP_BATCH_LIMIT = 500;

export interface CorrelationJobData {
  /** Unused — the sweeper queries the DB directly. */
  _: string;
}

export interface CorrelationSweepResult {
  /** OPEN unlinked events examined this tick. */
  examined: number;
  /** Events suppressed by a matching suppression rule. */
  suppressed: number;
  /** Incidents auto-created by a matching correlation policy. */
  incidentsCreated: number;
  errors: number;
}

export function createCorrelationQueue(): Queue<CorrelationJobData> {
  return new Queue(CORRELATION_QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 3_000 },
      removeOnComplete: { count: 300 },
      removeOnFail: { count: 100 },
    },
  });
}

/**
 * Register the repeatable correlation sweeper. Idempotent — BullMQ deduplicates
 * repeatable jobs by (name, repeat options), so calling at every boot is safe.
 */
export async function scheduleCorrelationSweep(queue: Queue<CorrelationJobData>): Promise<void> {
  await queue.add(
    CORRELATION_SWEEP_JOB_NAME,
    { _: "" },
    {
      repeat: { every: CORRELATION_SWEEP_INTERVAL_MS },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  );
}

/**
 * Re-evaluate OPEN, unlinked events against suppression rules + correlation
 * policies.
 *
 * Claims events with `FOR UPDATE SKIP LOCKED` (state='open', linked_incident_id
 * IS NULL) so concurrent workers don't double-process. Per-event failures are
 * counted and never propagate. Idempotent: a suppressed or now-linked event is
 * no longer claimed on the next tick.
 */
export async function sweepCorrelation(db: Db): Promise<CorrelationSweepResult> {
  const result: CorrelationSweepResult = { examined: 0, suppressed: 0, incidentsCreated: 0, errors: 0 };

  const claimed = await db.execute(sql`
    SELECT id, org_id, node, metric, value, threshold, severity, state, count, linked_incident_id
    FROM   ${itomEvents}
    WHERE  state = 'open'
      AND  linked_incident_id IS NULL
    ORDER  BY last_occurrence ASC
    LIMIT  ${CORRELATION_SWEEP_BATCH_LIMIT}
    FOR    UPDATE SKIP LOCKED
  `);
  const rows = (Array.isArray(claimed) ? claimed : ((claimed as { rows?: unknown[] }).rows ?? [])) as Array<{
    id: string;
    org_id: string;
    node: string;
    metric: string;
    value: string | null;
    threshold: string | null;
    severity: string;
    state: string;
    count: number;
    linked_incident_id: string | null;
  }>;

  for (const row of rows) {
    result.examined++;
    try {
      const event: CorrelatableEvent = {
        id: row.id,
        orgId: row.org_id,
        node: row.node,
        metric: row.metric,
        value: row.value,
        threshold: row.threshold,
        severity: row.severity,
        state: row.state,
        count: Number(row.count),
        linkedIncidentId: row.linked_incident_id,
      };
      const outcome = await evaluateEvent(db, row.org_id, event);
      if (outcome.suppressed) result.suppressed++;
      if (outcome.correlation?.incidentId) result.incidentsCreated++;
    } catch (err) {
      result.errors++;
      console.error("[correlation] event evaluation failed", row.id, (err as Error).message);
    }
  }

  return result;
}

export function startCorrelationWorker(db: Db): Worker<CorrelationJobData> {
  return new Worker<CorrelationJobData>(
    CORRELATION_QUEUE_NAME,
    async (job: Job<CorrelationJobData>) => {
      if (job.name === CORRELATION_SWEEP_JOB_NAME) {
        await sweepCorrelation(db);
      }
    },
    { connection: redisConnection(), concurrency: 5 },
  );
}
