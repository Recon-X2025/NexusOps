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
import {
  createNotificationDispatchQueue,
  startNotificationDispatchWorker,
  type NotificationDispatchJobData,
} from "../workflows/notificationDispatchWorkflow";
import {
  createWorkflowTriggerQueue,
  scheduleWorkflowTriggerSweep,
  startWorkflowTriggerWorker,
  type WorkflowTriggerJobData,
} from "../workflows/workflowTriggerWorkflow";
import {
  createWebhookDispatchQueue,
  scheduleWebhookDispatchSweep,
  startWebhookDispatchWorker,
  type WebhookDispatchJobData,
} from "../workflows/webhookDispatchWorkflow";
import {
  createEscalationQueue,
  scheduleEscalationSweep,
  startEscalationWorker,
  type EscalationJobData,
} from "../workflows/escalationWorkflow";
import {
  createCorrelationQueue,
  scheduleCorrelationSweep,
  startCorrelationWorker,
  type CorrelationJobData,
} from "../workflows/correlationWorkflow";
import {
  createVulnSlaQueue,
  scheduleVulnSlaSweep,
  startVulnSlaWorker,
  type VulnSlaJobData,
} from "../workflows/vulnerabilitySlaWorkflow";
import {
  createExpiryAlertQueue,
  scheduleExpiryAlertSweep,
  startExpiryAlertWorker,
  type ExpiryAlertJobData,
} from "../workflows/expiryAlertWorkflow";
import {
  createStatutoryFilingQueue,
  startStatutoryFilingWorker,
  type StatutoryFilingJobData,
} from "../workflows/statutoryFilingWorkflow";
import {
  createEwayBillQueue,
  startEwayBillWorker,
  type EwayBillJobData,
} from "../workflows/ewayBillWorkflow";
import {
  createMca21FilingQueue,
  startMca21FilingWorker,
  type Mca21FilingJobData,
} from "../workflows/mca21FilingWorkflow";
import {
  createEsiReturnQueue,
  startEsiReturnWorker,
  type EsiReturnJobData,
} from "../workflows/esiReturnWorkflow";
import {
  createPtChallanQueue,
  startPtChallanWorker,
  type PtChallanJobData,
} from "../workflows/ptChallanWorkflow";
import type { Queue } from "bullmq";
interface WorkflowServiceInstance {
  approvalQueue: Queue<ApprovalJobData>;
  slaQueue: Queue<SlaJobData>;
  virusScanQueue: Queue<VirusScanJobData>;
  retentionQueue: Queue<RetentionJobData>;
  irnQueue: Queue<IrnJobData>;
  ticketEmbeddingQueue: Queue<TicketEmbeddingJobData>;
  notificationDispatchQueue: Queue<NotificationDispatchJobData>;
  workflowTriggerQueue: Queue<WorkflowTriggerJobData>;
  webhookDispatchQueue: Queue<WebhookDispatchJobData>;
  escalationQueue: Queue<EscalationJobData>;
  correlationQueue: Queue<CorrelationJobData>;
  vulnSlaQueue: Queue<VulnSlaJobData>;
  expiryAlertQueue: Queue<ExpiryAlertJobData>;
  statutoryFilingQueue: Queue<StatutoryFilingJobData>;
  ewayBillQueue: Queue<EwayBillJobData>;
  mca21FilingQueue: Queue<Mca21FilingJobData>;
  esiReturnQueue: Queue<EsiReturnJobData>;
  ptChallanQueue: Queue<PtChallanJobData>;
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
  const notificationDispatchQueue = createNotificationDispatchQueue();
  const workflowTriggerQueue = createWorkflowTriggerQueue();
  const webhookDispatchQueue = createWebhookDispatchQueue();
  const escalationQueue = createEscalationQueue();
  const correlationQueue = createCorrelationQueue();
  const vulnSlaQueue = createVulnSlaQueue();
  const expiryAlertQueue = createExpiryAlertQueue();
  const statutoryFilingQueue = createStatutoryFilingQueue();
  const ewayBillQueue = createEwayBillQueue();
  const mca21FilingQueue = createMca21FilingQueue();
  const esiReturnQueue = createEsiReturnQueue();
  const ptChallanQueue = createPtChallanQueue();

  const approvalWorker = startApprovalWorker(db);
  const slaWorker = startSlaWorker(db);
  const virusScanWorker = startVirusScanWorker(db);
  const retentionWorker = startRetentionWorker(db);
  const irnWorker = startIrnWorker(db);
  const ticketEmbeddingWorker = startTicketEmbeddingWorker(db);
  const notificationDispatchWorker = startNotificationDispatchWorker(db);
  const workflowTriggerWorker = startWorkflowTriggerWorker(db);
  const webhookDispatchWorker = startWebhookDispatchWorker(db);
  const escalationWorker = startEscalationWorker(db);
  const correlationWorker = startCorrelationWorker(db);
  const vulnSlaWorker = startVulnSlaWorker(db);
  const expiryAlertWorker = startExpiryAlertWorker(db);
  const statutoryFilingWorker = startStatutoryFilingWorker(db);
  const ewayBillWorker = startEwayBillWorker(db);
  const mca21FilingWorker = startMca21FilingWorker(db);
  const esiReturnWorker = startEsiReturnWorker(db);
  const ptChallanWorker = startPtChallanWorker(db);

  scheduleRetentionSweep(retentionQueue).catch((err) => {
    console.warn("[workflow:retention] Failed to register sweeper:", err);
  });

  // Automation-loop sweepers (Sprint 3.1 / 3.2). Idempotent repeatable jobs;
  // failure to register is non-fatal (workers still serve one-shot enqueues).
  scheduleWorkflowTriggerSweep(workflowTriggerQueue).catch((err) => {
    console.warn("[workflow:trigger] Failed to register scheduled-workflow sweeper:", err);
  });
  scheduleWebhookDispatchSweep(webhookDispatchQueue).catch((err) => {
    console.warn("[workflow:webhook] Failed to register outbound webhook dispatcher:", err);
  });
  // On-call escalation sweeper (Sprint 3.4a).
  scheduleEscalationSweep(escalationQueue).catch((err) => {
    console.warn("[workflow:escalation] Failed to register escalation sweeper:", err);
  });
  // ITOM correlation sweeper (Sprint 3.4b).
  scheduleCorrelationSweep(correlationQueue).catch((err) => {
    console.warn("[workflow:correlation] Failed to register correlation sweeper:", err);
  });
  // Vulnerability remediation-SLA breach + escalation sweepers (Security Phase B).
  scheduleVulnSlaSweep(vulnSlaQueue).catch((err) => {
    console.warn("[workflow:vuln-sla] Failed to register vuln SLA sweepers:", err);
  });
  // Asset-warranty + contract-renewal expiry alert sweepers (G9).
  scheduleExpiryAlertSweep(expiryAlertQueue).catch((err) => {
    console.warn("[workflow:expiry-alert] Failed to register expiry alert sweepers:", err);
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

  notificationDispatchWorker.on("failed", (job, err) => {
    console.error(`[workflow:notify-dispatch] Job ${job?.id} failed:`, err.message);
  });
  workflowTriggerWorker.on("failed", (job, err) => {
    console.error(`[workflow:trigger] Job ${job?.id} failed:`, err.message);
  });
  webhookDispatchWorker.on("failed", (job, err) => {
    console.error(`[workflow:webhook] Job ${job?.id} failed:`, err.message);
  });
  escalationWorker.on("failed", (job, err) => {
    console.error(`[workflow:escalation] Job ${job?.id} failed:`, err.message);
  });
  correlationWorker.on("failed", (job, err) => {
    console.error(`[workflow:correlation] Job ${job?.id} failed:`, err.message);
  });
  vulnSlaWorker.on("failed", (job, err) => {
    console.error(`[workflow:vuln-sla] Job ${job?.id} failed:`, err.message);
  });
  expiryAlertWorker.on("failed", (job, err) => {
    console.error(`[workflow:expiry-alert] Job ${job?.id} failed:`, err.message);
  });
  statutoryFilingWorker.on("failed", (job, err) => {
    console.error(`[workflow:statutory-filing] Job ${job?.id} failed:`, err.message);
  });
  ewayBillWorker.on("failed", (job, err) => {
    console.error(`[workflow:eway-bill] Job ${job?.id} failed:`, err.message);
  });
  mca21FilingWorker.on("failed", (job, err) => {
    console.error(`[workflow:mca21-filing] Job ${job?.id} failed:`, err.message);
  });
  esiReturnWorker.on("failed", (job, err) => {
    console.error(`[workflow:esi-return] Job ${job?.id} failed:`, err.message);
  });
  ptChallanWorker.on("failed", (job, err) => {
    console.error(`[workflow:pt-challan] Job ${job?.id} failed:`, err.message);
  });

  _instance = {
    approvalQueue,
    slaQueue,
    virusScanQueue,
    retentionQueue,
    irnQueue,
    ticketEmbeddingQueue,
    notificationDispatchQueue,
    workflowTriggerQueue,
    webhookDispatchQueue,
    escalationQueue,
    correlationQueue,
    vulnSlaQueue,
    expiryAlertQueue,
    statutoryFilingQueue,
    ewayBillQueue,
    mca21FilingQueue,
    esiReturnQueue,
    ptChallanQueue,
    async shutdown() {
      await Promise.all([
        approvalWorker.close(),
        slaWorker.close(),
        virusScanWorker.close(),
        retentionWorker.close(),
        irnWorker.close(),
        ticketEmbeddingWorker.close(),
        notificationDispatchWorker.close(),
        workflowTriggerWorker.close(),
        webhookDispatchWorker.close(),
        escalationWorker.close(),
        correlationWorker.close(),
        vulnSlaWorker.close(),
        expiryAlertWorker.close(),
        statutoryFilingWorker.close(),
        ewayBillWorker.close(),
        mca21FilingWorker.close(),
        esiReturnWorker.close(),
        ptChallanWorker.close(),
        approvalQueue.close(),
        slaQueue.close(),
        virusScanQueue.close(),
        retentionQueue.close(),
        irnQueue.close(),
        ticketEmbeddingQueue.close(),
        notificationDispatchQueue.close(),
        workflowTriggerQueue.close(),
        webhookDispatchQueue.close(),
        escalationQueue.close(),
        correlationQueue.close(),
        vulnSlaQueue.close(),
        expiryAlertQueue.close(),
        statutoryFilingQueue.close(),
        ewayBillQueue.close(),
        mca21FilingQueue.close(),
        esiReturnQueue.close(),
        ptChallanQueue.close(),
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
