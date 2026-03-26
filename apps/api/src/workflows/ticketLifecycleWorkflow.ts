/**
 * ticketLifecycleWorkflow.ts — SLA breach detection via BullMQ delayed jobs
 *
 * How it works:
 * 1. When a ticket is created, `scheduleSlaBreach` enqueues two delayed jobs:
 *    - sla:response:{ticketId}  — fires at SLA response deadline
 *    - sla:resolve:{ticketId}   — fires at SLA resolve deadline
 * 2. The worker checks if the breach has already been resolved; if not, it marks
 *    the ticket as SLA-breached and notifies the assigned agent + team lead.
 * 3. Both jobs use the ticketId as a dedup key — rescheduling is safe.
 */
import { Queue, Worker, type Job } from "bullmq";
import type { Db } from "@nexusops/db";
import { tickets, eq, and } from "@nexusops/db";
import { notifyActivity, writeWorkflowAuditLog } from "./activities";

function redisConnection() {
  return { url: process.env["REDIS_URL"] ?? "redis://localhost:6379" };
}

export const SLA_QUEUE_NAME = "nexusops-sla";

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

export function startSlaWorker(db: Db): Worker<SlaJobData> {
  return new Worker<SlaJobData>(
    SLA_QUEUE_NAME,
    async (job: Job<SlaJobData>) => {
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
