/**
 * statutoryFilingWorkflow.ts — BullMQ queue + worker for EPFO ECR portal push (G2).
 *
 * Pipeline:
 *   india-compliance.filing.submit(ecrSubmissionId)
 *     → enqueueStatutoryFilingJob(ecrSubmissionId)
 *       → BullMQ "coheronconnect-statutory-filing"
 *         → worker loads the ECR submission + EPFO integration config
 *           → builds the EcrUpload from the persisted return
 *             → epfoEcrAdapter.send()
 *               → persists TRRN (epfoAckNumber) + status on the submission row
 *
 * Modelled on irnGenerationWorkflow: 5 attempts + exponential back-off, the job
 * is idempotent on (ecrSubmissionId) — the worker short-circuits once the return
 * carries an ack. Soft-fail: when no EPFO integration is connected we mark the
 * row `not_configured` once (no endless retry) so tenants who file manually
 * never see noise. Terminal failure flips the row to `failed` with the last
 * error for an admin-driven retry.
 */
import { Queue, Worker, type Job } from "bullmq";
import { eq, and } from "drizzle-orm";
import { epfoEcrSubmissions, integrations, type Db } from "@coheronconnect/db";
import { decryptIntegrationConfigEnvelope } from "../services/encryption";
import { epfoEcrAdapter, type EcrUpload } from "../services/integrations/epfo-ecr";

function redisConnection() {
  const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  return { url };
}

export interface StatutoryFilingJobData {
  ecrSubmissionId: string;
  orgId: string;
  /** Carried ECR member-line body (built by generateECR at enqueue time). */
  ecrBody: string;
  /** Set on admin-driven retries; bypasses the "already filed" guard. */
  force?: boolean;
}

export const STATUTORY_FILING_QUEUE_NAME = "coheronconnect-statutory-filing";

let _queue: Queue<StatutoryFilingJobData> | null = null;

export function createStatutoryFilingQueue(): Queue<StatutoryFilingJobData> {
  if (_queue) return _queue;
  _queue = new Queue<StatutoryFilingJobData>(STATUTORY_FILING_QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  });
  return _queue;
}

export async function enqueueStatutoryFilingJob(
  queue: Queue<StatutoryFilingJobData>,
  data: StatutoryFilingJobData,
): Promise<void> {
  const jobId = data.force
    ? `ecr-${data.ecrSubmissionId}-${Date.now()}`
    : `ecr-${data.ecrSubmissionId}`;
  await queue.add("file", data, { jobId });
}

export async function processStatutoryFilingJob(
  db: Db,
  data: StatutoryFilingJobData,
): Promise<{ status: "filed" | "skipped" | "not_configured" | "failed"; detail?: string }> {
  const { ecrSubmissionId, orgId, ecrBody, force } = data;

  const [submission] = await db
    .select()
    .from(epfoEcrSubmissions)
    .where(and(eq(epfoEcrSubmissions.id, ecrSubmissionId), eq(epfoEcrSubmissions.orgId, orgId)));
  if (!submission) {
    return { status: "skipped", detail: "ECR submission not found (deleted before processing)" };
  }
  if (!force && submission.epfoAckNumber) {
    return { status: "skipped", detail: "ECR already filed (ack present)" };
  }

  const [int] = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.orgId, orgId),
        eq(integrations.provider, "epfo_ecr"),
        eq(integrations.status, "connected"),
      ),
    )
    .limit(1);
  if (!int?.configEncrypted) {
    await db
      .update(epfoEcrSubmissions)
      .set({
        submissionStatus: "not_configured",
        portalError: "EPFO ECR integration not connected",
        lastAttemptAt: new Date(),
      })
      .where(eq(epfoEcrSubmissions.id, ecrSubmissionId));
    return { status: "not_configured", detail: "EPFO not connected" };
  }

  const config = await decryptIntegrationConfigEnvelope(int.configEncrypted) as unknown as Parameters<
    NonNullable<typeof epfoEcrAdapter.send>
  >[0];

  const upload: EcrUpload = {
    wageMonth: `${String(submission.month).padStart(2, "0")}-${submission.year}`,
    ecrBody,
    totalEpf: Number(submission.totalEpfContribution),
    totalEps: Number(submission.totalEpsContribution),
    totalEmployee: Number(submission.totalEmployeeContribution),
    totalEmployer: Number(submission.totalEmployerContribution),
  };

  // Mark in-flight so the UI reflects an active push mid-retry.
  await db
    .update(epfoEcrSubmissions)
    .set({ submissionStatus: "submitting", lastAttemptAt: new Date(), portalError: null })
    .where(eq(epfoEcrSubmissions.id, ecrSubmissionId));

  try {
    const result = await epfoEcrAdapter.send!(config, upload);
    await db
      .update(epfoEcrSubmissions)
      .set({
        submissionStatus: "submitted",
        epfoAckNumber: result.providerRef,
        submittedAt: new Date(),
        lastAttemptAt: new Date(),
        portalError: null,
      })
      .where(eq(epfoEcrSubmissions.id, ecrSubmissionId));
    return { status: "filed", detail: result.providerRef };
  } catch (err) {
    const message = (err as Error).message ?? "unknown error";
    await db
      .update(epfoEcrSubmissions)
      .set({
        submissionStatus: "failed",
        portalError: message.slice(0, 500),
        lastAttemptAt: new Date(),
      })
      .where(eq(epfoEcrSubmissions.id, ecrSubmissionId));
    throw err;
  }
}

export function startStatutoryFilingWorker(db: Db): Worker<StatutoryFilingJobData> {
  const worker = new Worker<StatutoryFilingJobData>(
    STATUTORY_FILING_QUEUE_NAME,
    async (job: Job<StatutoryFilingJobData>) => processStatutoryFilingJob(db, job.data),
    {
      connection: redisConnection(),
      concurrency: Number(process.env["STATUTORY_FILING_WORKER_CONCURRENCY"] ?? 2),
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`[statutory-filing] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
