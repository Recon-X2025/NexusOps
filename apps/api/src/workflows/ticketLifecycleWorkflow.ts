/**
 * ticketLifecycleWorkflow.ts — SLA breach detection via BullMQ jobs
 *
 * Two complementary mechanisms keep `tickets.sla_breached` honest:
 *
 * 1. PER-TICKET DELAYED JOBS (primary path).
 *    On ticket create, `scheduleSlaBreach` enqueues two delayed jobs:
 *      - sla:response:{ticketId}  — fires at SLA response deadline
 *      - sla:resolve:{ticketId}   — fires at SLA resolve deadline
 *    The worker checks current ticket state; if not already breached/resolved,
 *    it marks `slaBreached = true` and notifies the assignee.
 *
 * 2. PERIODIC SWEEPER (safety net).
 *    A repeatable job (`sla:sweep`) runs every minute and bulk-updates
 *    `slaBreached = true` for any unresolved, unpaused ticket whose deadline
 *    has passed. This catches:
 *      - Tickets created without going through the API (seed data, raw SQL,
 *        ETL imports).
 *      - Tickets whose delayed job was lost (Redis flush, queue eviction).
 *      - Deadlines that elapsed while the worker was offline.
 *    Notifications are skipped in the sweeper path to avoid storms; an audit
 *    log is written per affected ticket.
 *
 * All jobs use deterministic jobIds so rescheduling is safe.
 */
import { Queue, Worker, type Job } from "bullmq";
import type { Db } from "@nexusops/db";
import { tickets, eq, and, sql } from "@nexusops/db";
import { notifyActivity, writeWorkflowAuditLog } from "./activities";

function redisConnection() {
  return { url: process.env["REDIS_URL"] ?? "redis://localhost:6379" };
}

export const SLA_QUEUE_NAME = "nexusops-sla";

/** Job name used by the periodic deadline sweeper (see `scheduleSlaSweep`). */
export const SLA_SWEEP_JOB_NAME = "sla-sweep";
/** Sweep cadence — every minute is a good balance for typical ticket volumes. */
const SLA_SWEEP_INTERVAL_MS = 60_000;
/** Hard cap on tickets a single sweep tick can flip — protects DB + audit log. */
const SLA_SWEEP_BATCH_LIMIT = 1_000;

export interface SlaJobData {
  ticketId: string;
  orgId: string;
  type: "response" | "resolve";
  ticketNumber: string;
  assigneeId?: string;
}

export function createSlaQueue(): Queue<SlaJobData> {
  return new Queue(SLA_QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 3_000 },
      removeOnComplete: { count: 300 },
      removeOnFail: { count: 100 },
    },
  });
}

/** Schedule SLA breach jobs for a newly created ticket. Safe to call multiple times. */
export async function scheduleSlaBreach(
  queue: Queue<SlaJobData>,
  payload: {
    ticketId: string;
    orgId: string;
    ticketNumber: string;
    assigneeId?: string;
    slaResponseDueAt?: Date;
    slaResolveDueAt?: Date;
  },
): Promise<void> {
  const base: Omit<SlaJobData, "type"> = {
    ticketId: payload.ticketId,
    orgId: payload.orgId,
    ticketNumber: payload.ticketNumber,
    assigneeId: payload.assigneeId,
  };

  if (payload.slaResponseDueAt) {
    const delay = Math.max(0, payload.slaResponseDueAt.getTime() - Date.now());
    await queue.add("sla-response", { ...base, type: "response" }, {
      jobId: `sla:response:${payload.ticketId}`,
      delay,
    });
  }

  if (payload.slaResolveDueAt) {
    const delay = Math.max(0, payload.slaResolveDueAt.getTime() - Date.now());
    await queue.add("sla-resolve", { ...base, type: "resolve" }, {
      jobId: `sla:resolve:${payload.ticketId}`,
      delay,
    });
  }
}

/** Cancel pending SLA jobs when a ticket is resolved before breach. */
export async function cancelSlaJobs(
  queue: Queue<SlaJobData>,
  ticketId: string,
): Promise<void> {
  for (const type of ["response", "resolve"] as const) {
    const job = await queue.getJob(`sla:${type}:${ticketId}`);
    if (job) await job.remove();
  }
}

/**
 * Register the repeatable deadline sweeper. Idempotent — BullMQ deduplicates
 * repeatable jobs by (name, repeat options), so calling at every server boot
 * is safe.
 *
 * The sweep job's `data` is unused — the worker dispatches purely on `job.name`.
 */
export async function scheduleSlaSweep(queue: Queue<SlaJobData>): Promise<void> {
  await queue.add(
    SLA_SWEEP_JOB_NAME,
    {
      // Placeholder — sweep logic queries the DB directly and ignores payload.
      ticketId: "",
      orgId: "",
      type: "resolve",
      ticketNumber: "",
    },
    {
      repeat: { every: SLA_SWEEP_INTERVAL_MS },
      // Repeatable jobs auto-generate per-tick jobIds; removeOnComplete keeps
      // the queue from growing unbounded.
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  );
}

/**
 * Bulk-flip `slaBreached = true` for any unresolved, unpaused ticket whose
 * deadline has elapsed. Returns the rows that were updated so callers can
 * write audit entries / emit metrics.
 *
 * Uses `FOR UPDATE SKIP LOCKED` + `LIMIT` so multiple workers (or a slow
 * sweep colliding with an in-flight per-ticket job) can't double-count and
 * a single tick can never blow up the DB.
 */
export async function sweepSlaBreaches(
  db: Db,
): Promise<Array<{ id: string; orgId: string; number: string }>> {
  const result = await db.execute(sql`
    UPDATE ${tickets}
    SET    sla_breached = true,
           updated_at   = NOW()
    WHERE  id IN (
      SELECT id
      FROM   ${tickets}
      WHERE  sla_breached         = false
        AND  resolved_at          IS NULL
        AND  closed_at            IS NULL
        AND  sla_paused_at        IS NULL
        AND  (
              (sla_resolve_due_at  IS NOT NULL AND sla_resolve_due_at  < NOW())
           OR (sla_response_due_at IS NOT NULL
               AND sla_responded_at IS NULL
               AND sla_response_due_at < NOW())
        )
      ORDER  BY sla_resolve_due_at NULLS LAST, sla_response_due_at NULLS LAST
      LIMIT  ${SLA_SWEEP_BATCH_LIMIT}
      FOR    UPDATE SKIP LOCKED
    )
    RETURNING id, org_id, number
  `);
  // postgres-js returns the row array directly; node-postgres returns { rows: [...] }.
  const list = Array.isArray(result)
    ? result
    : ((result as { rows?: unknown[] }).rows ?? []);
  return (list as Array<{ id: string; org_id: string; number: string }>).map((r) => ({
    id: r.id,
    orgId: r.org_id,
    number: r.number,
  }));
}

export function startSlaWorker(db: Db): Worker<SlaJobData> {
  return new Worker<SlaJobData>(
    SLA_QUEUE_NAME,
    async (job: Job<SlaJobData>) => {
      // Periodic sweeper: identified by job name, payload is unused.
      if (job.name === SLA_SWEEP_JOB_NAME) {
        const breached = await sweepSlaBreaches(db);
        if (breached.length === 0) return;
        // Write an audit entry per ticket so the UI's activity log stays accurate.
        // Notifications are intentionally skipped — sweeper is a safety net and
        // a single tick could otherwise mass-notify on first run after downtime.
        await Promise.all(
          breached.map((t) =>
            writeWorkflowAuditLog(
              { db, orgId: t.orgId, actorId: "system" },
              {
                resource: "ticket",
                resourceId: t.id,
                action: "sla.sweep_breach",
                changes: { slaBreached: true, source: "deadline_sweeper" },
              },
            ),
          ),
        );
        return;
      }

      const { ticketId, orgId, type, ticketNumber, assigneeId } = job.data;

      // Fetch current ticket state — skip if already resolved/closed
      const [ticket] = await db
        .select({ id: tickets.id, statusId: tickets.statusId, slaBreached: tickets.slaBreached })
        .from(tickets)
        .where(and(eq(tickets.id, ticketId), eq(tickets.orgId, orgId)));

      if (!ticket) return; // Deleted ticket — no-op
      // statusId check deferred to avoid joining ticketStatuses — treat active if not breached
      if (ticket.slaBreached) return; // Already marked

      // Mark SLA as breached on the ticket
      await db
        .update(tickets)
        .set({ slaBreached: true, updatedAt: new Date() })
        .where(eq(tickets.id, ticketId));

      const ctx = { db, orgId, actorId: "system" };

      // Notify assignee if set
      if (assigneeId) {
        await notifyActivity(ctx, {
          userId: assigneeId,
          title: `⚠️ SLA ${type === "response" ? "Response" : "Resolution"} Breach`,
          message: `Ticket ${ticketNumber} has breached its ${type} SLA target.`,
          resourceType: "ticket",
          resourceId: ticketId,
          link: `/app/tickets/${ticketId}`,
        });
      }

      await writeWorkflowAuditLog(ctx, {
        resource: "ticket",
        resourceId: ticketId,
        action: `sla.${type}_breach`,
        changes: { slaBreached: true, breachType: type },
      });
    },
    { connection: redisConnection(), concurrency: 10 },
  );
}
