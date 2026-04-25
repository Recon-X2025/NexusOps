/**
 * workflow.ts — Central workflow service
 *
 * Initialises all BullMQ queues and workers at server boot.
 * Exposes typed queue handles for routers to enqueue jobs.
 *
 * Usage:
 *   import { WorkflowService } from "./services/workflow";
 *   WorkflowService.approvalQueue.add(...)
 */
import type { Db } from "@nexusops/db";
import {
  createApprovalQueue,
  startApprovalWorker,
  type ApprovalJobData,
} from "../workflows/approvalWorkflow";
import {
  createSlaQueue,
  scheduleSlaSweep,
  startSlaWorker,
  type SlaJobData,
} from "../workflows/ticketLifecycleWorkflow";
import type { Queue } from "bullmq";
interface WorkflowServiceInstance {
  approvalQueue: Queue<ApprovalJobData>;
  slaQueue: Queue<SlaJobData>;
  shutdown: () => Promise<void>;
}

let _instance: WorkflowServiceInstance | undefined;

/** Boot all workflow queues and workers. Call once from server startup. */
export function initWorkflowService(db: Db): WorkflowServiceInstance {
  if (_instance) return _instance;

  const approvalQueue = createApprovalQueue();
  const slaQueue = createSlaQueue();

  const approvalWorker = startApprovalWorker(db);
  const slaWorker = startSlaWorker(db);

  approvalWorker.on("failed", (job, err) => {
    console.error(`[workflow:approval] Job ${job?.id} failed:`, err.message);
  });
  slaWorker.on("failed", (job, err) => {
    console.error(`[workflow:sla] Job ${job?.id} failed:`, err.message);
  });

  // Register the periodic SLA deadline sweeper. Idempotent — BullMQ
  // dedupes repeatable jobs by (name, repeat options). Failure here is
  // non-fatal: per-ticket delayed jobs still cover the happy path.
  scheduleSlaSweep(slaQueue).catch((err) => {
    console.warn("[workflow:sla] Failed to register periodic deadline sweeper:", err);
  });

  _instance = {
    approvalQueue,
    slaQueue,
    async shutdown() {
      await Promise.all([
        approvalWorker.close(),
        slaWorker.close(),
        approvalQueue.close(),
        slaQueue.close(),
      ]);
      _instance = undefined;
    },
  };

  return _instance;
}

/** Access the running workflow service. Throws if not yet initialised. */
export function getWorkflowService(): WorkflowServiceInstance {
  if (!_instance) throw new Error("WorkflowService not initialised. Call initWorkflowService() first.");
  return _instance;
}
