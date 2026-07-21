/**
 * mca21FilingWorkflow.ts — BullMQ queue + worker for MCA21 V3 filing push (G4).
 *
 * Pipeline:
 *   legal.mca21.submit(mcaFilingRecordId)
 *     → enqueueMca21FilingJob({ mcaFilingRecordId })
 *       → BullMQ "coheronconnect-mca21-filing"
 *         → worker loads the mca_filing_records row + MCA21 gateway config
 *           → mca21Adapter.send({ formCode, formData })
 *             → persists SRN + filedAt + status on the row
 *
 * Modelled on statutoryFilingWorkflow / ewayBillWorkflow: 5 attempts +
 * exponential back-off, idempotent (short-circuits once the row carries an SRN),
 * soft-fail `not_configured` once when no MCA21 gateway is connected, terminal
 * failure flips the row to `failed` with the last error for an admin-driven retry.
 */
import { Queue, Worker, type Job } from "bullmq";
import { eq, and } from "drizzle-orm";
import { mcaFilingRecords, integrations, type Db } from "@coheronconnect/db";
import { decryptIntegrationConfigEnvelope } from "../services/encryption";
import { mca21Adapter, type Mca21Filing } from "../services/integrations/mca21";

function redisConnection() {
  const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  return { url };
}

export interface Mca21FilingJobData {
  mcaFilingRecordId: string;
  orgId: string;
  /** Set on admin-driven retries; bypasses the "already filed" guard. */
  force?: boolean;
}

export const MCA21_FILING_QUEUE_NAME = "coheronconnect-mca21-filing";

let _queue: Queue<Mca21FilingJobData> | null = null;

export function createMca21FilingQueue(): Queue<Mca21FilingJobData> {
  if (_queue) return _queue;
  _queue = new Queue<Mca21FilingJobData>(MCA21_FILING_QUEUE_NAME, {
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

export async function enqueueMca21FilingJob(
  queue: Queue<Mca21FilingJobData>,
  data: Mca21FilingJobData,
): Promise<void> {
  const jobId = data.force
    ? `mca21-${data.mcaFilingRecordId}-${Date.now()}`
    : `mca21-${data.mcaFilingRecordId}`;
  await queue.add("file", data, { jobId });
}

export async function processMca21FilingJob(
  db: Db,
  data: Mca21FilingJobData,
): Promise<{ status: "filed" | "skipped" | "not_configured" | "failed"; detail?: string }> {
  const { mcaFilingRecordId, orgId, force } = data;

  const [row] = await db
    .select()
    .from(mcaFilingRecords)
    .where(and(eq(mcaFilingRecords.id, mcaFilingRecordId), eq(mcaFilingRecords.orgId, orgId)));
  if (!row) {
    return { status: "skipped", detail: "MCA filing record not found (deleted before processing)" };
  }
  if (!force && row.srn) {
    return { status: "skipped", detail: "MCA form already filed (SRN present)" };
  }

  const [int] = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.orgId, orgId),
        eq(integrations.provider, "mca21"),
        eq(integrations.status, "connected"),
      ),
    )
    .limit(1);
  if (!int?.configEncrypted) {
    await db
      .update(mcaFilingRecords)
      .set({
        status: "not_configured",
        portalError: "MCA21 gateway integration not connected",
        lastAttemptAt: new Date(),
      })
      .where(eq(mcaFilingRecords.id, mcaFilingRecordId));
    return { status: "not_configured", detail: "MCA21 not connected" };
  }

  const config = await decryptIntegrationConfigEnvelope(int.configEncrypted) as unknown as Parameters<
    NonNullable<typeof mca21Adapter.send>
  >[0];

  const payload = row.payloadJson as unknown as Mca21Filing | null;
  if (!payload || !payload.formCode) {
    await db
      .update(mcaFilingRecords)
      .set({
        status: "failed",
        portalError: "Missing or malformed MCA21 e-Form payload",
        lastAttemptAt: new Date(),
      })
      .where(eq(mcaFilingRecords.id, mcaFilingRecordId));
    return { status: "failed", detail: "Missing payload" };
  }

  await db
    .update(mcaFilingRecords)
    .set({ status: "submitting", lastAttemptAt: new Date(), portalError: null })
    .where(eq(mcaFilingRecords.id, mcaFilingRecordId));

  try {
    const result = await mca21Adapter.send!(config, payload);
    await db
      .update(mcaFilingRecords)
      .set({
        status: "filed",
        srn: result.providerRef,
        ackJson: result.raw as Record<string, unknown>,
        filedAt: new Date(),
        lastAttemptAt: new Date(),
        portalError: null,
      })
      .where(eq(mcaFilingRecords.id, mcaFilingRecordId));
    return { status: "filed", detail: result.providerRef };
  } catch (err) {
    const message = (err as Error).message ?? "unknown error";
    await db
      .update(mcaFilingRecords)
      .set({
        status: "failed",
        portalError: message.slice(0, 500),
        lastAttemptAt: new Date(),
      })
      .where(eq(mcaFilingRecords.id, mcaFilingRecordId));
    throw err;
  }
}

export function startMca21FilingWorker(db: Db): Worker<Mca21FilingJobData> {
  const worker = new Worker<Mca21FilingJobData>(
    MCA21_FILING_QUEUE_NAME,
    async (job: Job<Mca21FilingJobData>) => processMca21FilingJob(db, job.data),
    {
      connection: redisConnection(),
      concurrency: Number(process.env["MCA21_FILING_WORKER_CONCURRENCY"] ?? 2),
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`[mca21-filing] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
