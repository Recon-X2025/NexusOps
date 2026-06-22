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
import type { Db } from "@coheronconnect/db";
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
import {
  createVirusScanQueue,
  startVirusScanWorker,
  type VirusScanJobData,
} from "../workflows/virusScanWorkflow";
import {
  createRetentionQueue,
  scheduleRetentionSweep,
  startRetentionWorker,
  type RetentionJobData,
} from "../workflows/documentRetentionWorkflow";
import {
  createIrnQueue,
  startIrnWorker,
  type IrnJobData,
} from "../workflows/irnGenerationWorkflow";
import {
  createTicketEmbeddingQueue,
  startTicketEmbeddingWorker,
  type TicketEmbeddingJobData,
} from "../workflows/ticketEmbeddingWorkflow";
import type { Queue } from "bullmq";
interface WorkflowServiceInstance {
  approvalQueue: Queue<ApprovalJobData>;
  slaQueue: Queue<SlaJobData>;
  virusScanQueue: Queue<VirusScanJobData>;
  retentionQueue: Queue<RetentionJobData>;
  irnQueue: Queue<IrnJobData>;
  ticketEmbeddingQueue: Queue<TicketEmbeddingJobData>;
  shutdown: () => Promise<void>;
}

let _instance: WorkflowServiceInstance | undefined;

/** Boot all workflow queues and workers. Call once from server startup. */
export function initWorkflowService(db: Db): WorkflowServiceInstance {
  if (_instance) return _instance;

  const approvalQueue = createApprovalQueue();
  const slaQueue = createSlaQueue();
  const virusScanQueue = createVirusScanQueue();
  const retentionQueue = createRetentionQueue();
  const irnQueue = createIrnQueue();
  const ticketEmbeddingQueue = createTicketEmbeddingQueue();

  const approvalWorker = startApprovalWorker(db);
  const slaWorker = startSlaWorker(db);
  const virusScanWorker = startVirusScanWorker(db);
  const retentionWorker = startRetentionWorker(db);
  const irnWorker = startIrnWorker(db);
  const ticketEmbeddingWorker = startTicketEmbeddingWorker(db);

  scheduleRetentionSweep(retentionQueue).catch((err) => {
    console.warn("[workflow:retention] Failed to register sweeper:", err);
  });

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

  irnWorker.on("failed", (job, err) => {
    console.error(`[workflow:irn] Job ${job?.id} failed:`, err.message);
  });

  _instance = {
    approvalQueue,
    slaQueue,
    virusScanQueue,
    retentionQueue,
    irnQueue,
    ticketEmbeddingQueue,
    async shutdown() {
      await Promise.all([
        approvalWorker.close(),
        slaWorker.close(),
        virusScanWorker.close(),
        retentionWorker.close(),
        irnWorker.close(),
        ticketEmbeddingWorker.close(),
        approvalQueue.close(),
        slaQueue.close(),
        virusScanQueue.close(),
        retentionQueue.close(),
        irnQueue.close(),
        ticketEmbeddingQueue.close(),
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
