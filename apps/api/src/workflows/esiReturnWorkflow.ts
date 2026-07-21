/**
 * esiReturnWorkflow.ts — BullMQ queue + worker for ESIC monthly-return push (G2).
 *
 * Pipeline:
 *   india-compliance.filing.submitEsi(esiChallanId)
 *     → enqueueEsiReturnJob(esiChallanId)
 *       → BullMQ "coheronconnect-esi-return"
 *         → worker loads the ESI challan record + ESIC integration config
 *           → builds the EsiReturnUpload from the persisted return
 *             → esicReturnAdapter.send()
 *               → persists challan number + status on the record
 *
 * Modelled on statutoryFilingWorkflow: 5 attempts + exponential back-off, the job
 * is idempotent on (esiChallanId) — the worker short-circuits once the record
 * carries a challan number. Soft-fail: when no ESIC integration is connected we
 * mark the row `not_configured` once (no endless retry). Terminal failure flips
 * the row to `failed` with the last error for an admin-driven retry.
 */
import { Queue, Worker, type Job } from "bullmq";
import { eq, and } from "drizzle-orm";
import { esiChallanRecords, integrations, type Db } from "@coheronconnect/db";
import { decryptIntegrationConfigEnvelope } from "../services/encryption";
import { esicReturnAdapter, type EsiReturnUpload } from "../services/integrations/esic-return";

function redisConnection() {
  const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  return { url };
}

export interface EsiReturnJobData {
  esiChallanId: string;
  orgId: string;
  /** Carried MC member-line body (built at enqueue time from the payroll run). */
  mcLines: string;
  /** Set on admin-driven retries; bypasses the "already filed" guard. */
  force?: boolean;
}

export const ESI_RETURN_QUEUE_NAME = "coheronconnect-esi-return";

let _queue: Queue<EsiReturnJobData> | null = null;

export function createEsiReturnQueue(): Queue<EsiReturnJobData> {
  if (_queue) return _queue;
  _queue = new Queue<EsiReturnJobData>(ESI_RETURN_QUEUE_NAME, {
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

export async function enqueueEsiReturnJob(
  queue: Queue<EsiReturnJobData>,
  data: EsiReturnJobData,
): Promise<void> {
  const jobId = data.force
    ? `esi-${data.esiChallanId}-${Date.now()}`
    : `esi-${data.esiChallanId}`;
  await queue.add("file", data, { jobId });
}

export async function processEsiReturnJob(
  db: Db,
  data: EsiReturnJobData,
): Promise<{ status: "filed" | "skipped" | "not_configured" | "failed"; detail?: string }> {
  const { esiChallanId, orgId, mcLines, force } = data;

  const [record] = await db
    .select()
    .from(esiChallanRecords)
    .where(and(eq(esiChallanRecords.id, esiChallanId), eq(esiChallanRecords.orgId, orgId)));
  if (!record) {
    return { status: "skipped", detail: "ESI challan record not found (deleted before processing)" };
  }
  if (!force && record.challanNumber) {
    return { status: "skipped", detail: "ESI return already filed (challan present)" };
  }

  const [int] = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.orgId, orgId),
        eq(integrations.provider, "esic_return"),
        eq(integrations.status, "connected"),
      ),
    )
    .limit(1);
  if (!int?.configEncrypted) {
    await db
      .update(esiChallanRecords)
      .set({
        status: "not_configured",
        portalError: "ESIC return integration not connected",
        lastAttemptAt: new Date(),
      })
      .where(eq(esiChallanRecords.id, esiChallanId));
    return { status: "not_configured", detail: "ESIC not connected" };
  }

  const config = await decryptIntegrationConfigEnvelope(int.configEncrypted) as unknown as Parameters<
    NonNullable<typeof esicReturnAdapter.send>
  >[0];

  const upload: EsiReturnUpload = {
    contributionMonth: `${String(record.month).padStart(2, "0")}-${record.year}`,
    mcLines,
    totalEmployees: record.totalEmployees,
    totalEmployeeContribution: Number(record.totalEmployeeContribution),
    totalEmployerContribution: Number(record.totalEmployerContribution),
  };

  // Mark in-flight so the UI reflects an active push mid-retry.
  await db
    .update(esiChallanRecords)
    .set({ status: "submitting", lastAttemptAt: new Date(), portalError: null })
    .where(eq(esiChallanRecords.id, esiChallanId));

  try {
    const result = await esicReturnAdapter.send!(config, upload);
    await db
      .update(esiChallanRecords)
      .set({
        status: "submitted",
        challanNumber: result.providerRef,
        ackJson: (result.raw as Record<string, unknown>) ?? null,
        submittedAt: new Date(),
        lastAttemptAt: new Date(),
        portalError: null,
      })
      .where(eq(esiChallanRecords.id, esiChallanId));
    return { status: "filed", detail: result.providerRef };
  } catch (err) {
    const message = (err as Error).message ?? "unknown error";
    await db
      .update(esiChallanRecords)
      .set({
        status: "failed",
        portalError: message.slice(0, 500),
        lastAttemptAt: new Date(),
      })
      .where(eq(esiChallanRecords.id, esiChallanId));
    throw err;
  }
}

export function startEsiReturnWorker(db: Db): Worker<EsiReturnJobData> {
  const worker = new Worker<EsiReturnJobData>(
    ESI_RETURN_QUEUE_NAME,
    async (job: Job<EsiReturnJobData>) => processEsiReturnJob(db, job.data),
    {
      connection: redisConnection(),
      concurrency: Number(process.env["ESI_RETURN_WORKER_CONCURRENCY"] ?? 2),
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`[esi-return] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
