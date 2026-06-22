/**
 * approvalWorkflow.ts — Sequential multi-step approval workflow via BullMQ
 *
 * Guarantees:
 * - Each approval step is processed durably (survives API restarts via Redis)
 * - Idempotent: jobId = `approval:${requestId}` prevents duplicate runs
 * - Retries: 3 automatic retries with exponential back-off
 * - Notifications sent on each decision + final outcome
 */
import { Queue, Worker, type Job } from "bullmq";
import type { Db } from "@coheronconnect/db";
import { notifyActivity, writeWorkflowAuditLog } from "./activities";

/** BullMQ-compatible Redis connection config derived from REDIS_URL env var. */
function redisConnection() {
  const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  return { url };
}

export interface ApprovalJobData {
  requestId: string;
  orgId: string;
  actorId: string;
  requesterId: string;
  decision: "approved" | "rejected";
  comment?: string;
  resourceType: string;
  resourceId: string;
  resourceTitle: string;
}

export const APPROVAL_QUEUE_NAME = "coheronconnect-approvals";

/** Create the approval BullMQ queue (caller is responsible for the Redis connection). */
export function createApprovalQueue(): Queue<ApprovalJobData> {
  return new Queue(APPROVAL_QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  });
}

/**
 * Enqueue a post-decision workflow job.
 * Uses requestId as the job deduplication key.
 */
export async function enqueueApprovalDecision(
  queue: Queue<ApprovalJobData>,
  data: ApprovalJobData,
): Promise<void> {
  await queue.add("decision", data, {
    jobId: `approval:${data.requestId}`,
  });
}

/** Start the approval workflow worker. Should be called once at server boot. */
export function startApprovalWorker(db: Db): Worker<ApprovalJobData> {
  return new Worker<ApprovalJobData>(
    APPROVAL_QUEUE_NAME,
    async (job: Job<ApprovalJobData>) => {
      const { requestId, orgId, actorId, requesterId, decision, comment, resourceType, resourceId, resourceTitle } =
        job.data;

      const ctx = { db, orgId, actorId };

      // Notify the requester of the outcome
      await notifyActivity(ctx, {
        userId: requesterId,
        title: decision === "approved" ? `✅ ${resourceType} Approved` : `❌ ${resourceType} Rejected`,
        message: `Your ${resourceType.toLowerCase()} "${resourceTitle}" has been ${decision}${comment ? `: ${comment}` : "."}`,
        resourceType,
        resourceId,
        link: `/${resourceType.toLowerCase()}s/${resourceId}`,
      });

      // Write workflow audit trail
      await writeWorkflowAuditLog(ctx, {
        resource: resourceType,
        resourceId,
        action: `approval.${decision}`,
        changes: { decision, comment, approvalRequestId: requestId },
      });
    },
    {
      connection: redisConnection(),
      concurrency: 5,
    },
  );
}
