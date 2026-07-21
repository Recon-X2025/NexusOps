/**
 * ptChallanWorkflow.ts — BullMQ queue + worker for professional-tax challan push (G2).
 *
 * Pipeline:
 *   india-compliance.filing.submitPt(ptChallanId)
 *     → enqueuePtChallanJob(ptChallanId)
 *       → BullMQ "coheronconnect-pt-challan"
 *         → worker loads the PT challan record + PT integration config
 *           → builds the PtChallanUpload from the persisted challan
 *             → ptChallanAdapter.send()
 *               → persists challan number + status on the record
 *
 * Modelled on statutoryFilingWorkflow: 5 attempts + exponential back-off, the job
 * is idempotent on (ptChallanId) — the worker short-circuits once the record
 * carries a challan number. Soft-fail: when no PT integration is connected we
 * mark the row `not_configured` once (no endless retry). Terminal failure flips
 * the row to `failed` with the last error for an admin-driven retry.
 */
import { Queue, Worker, type Job } from "bullmq";
import { eq, and } from "drizzle-orm";
import { ptChallanRecords, integrations, type Db } from "@coheronconnect/db";
import { decryptIntegrationConfigEnvelope } from "../services/encryption";
import { ptChallanAdapter, type PtChallanUpload } from "../services/integrations/pt-challan";

function redisConnection() {
  const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  return { url };
}

export interface PtChallanJobData {
  ptChallanId: string;
  orgId: string;
  /** Carried per-employee PT line list (built at enqueue time). */
  ptLines: string;
  /** Set on admin-driven retries; bypasses the "already filed" guard. */
  force?: boolean;
}

export const PT_CHALLAN_QUEUE_NAME = "coheronconnect-pt-challan";

let _queue: Queue<PtChallanJobData> | null = null;

export function createPtChallanQueue(): Queue<PtChallanJobData> {
  if (_queue) return _queue;
  _queue = new Queue<PtChallanJobData>(PT_CHALLAN_QUEUE_NAME, {
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

export async function enqueuePtChallanJob(
  queue: Queue<PtChallanJobData>,
  data: PtChallanJobData,
): Promise<void> {
  const jobId = data.force
    ? `pt-${data.ptChallanId}-${Date.now()}`
    : `pt-${data.ptChallanId}`;
  await queue.add("file", data, { jobId });
}

export async function processPtChallanJob(
  db: Db,
  data: PtChallanJobData,
): Promise<{ status: "filed" | "skipped" | "not_configured" | "failed"; detail?: string }> {
  const { ptChallanId, orgId, ptLines, force } = data;

  const [record] = await db
    .select()
    .from(ptChallanRecords)
    .where(and(eq(ptChallanRecords.id, ptChallanId), eq(ptChallanRecords.orgId, orgId)));
  if (!record) {
    return { status: "skipped", detail: "PT challan record not found (deleted before processing)" };
  }
  if (!force && record.challanNumber) {
    return { status: "skipped", detail: "PT challan already filed (challan present)" };
  }

  const [int] = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.orgId, orgId),
        eq(integrations.provider, "pt_challan"),
        eq(integrations.status, "connected"),
      ),
    )
    .limit(1);
  if (!int?.configEncrypted) {
    await db
      .update(ptChallanRecords)
      .set({
        status: "not_configured",
        portalError: "PT challan integration not connected",
        lastAttemptAt: new Date(),
      })
      .where(eq(ptChallanRecords.id, ptChallanId));
    return { status: "not_configured", detail: "PT not connected" };
  }

  const config = await decryptIntegrationConfigEnvelope(int.configEncrypted) as unknown as Parameters<
    NonNullable<typeof ptChallanAdapter.send>
  >[0];

  const upload: PtChallanUpload = {
    stateCode: record.stateCode,
    period: `${String(record.month).padStart(2, "0")}-${record.year}`,
    ptLines,
    totalEmployees: record.totalEmployees,
    totalPtDeducted: Number(record.totalPtDeducted),
  };

  // Mark in-flight so the UI reflects an active push mid-retry.
  await db
    .update(ptChallanRecords)
    .set({ status: "submitting", lastAttemptAt: new Date(), portalError: null })
    .where(eq(ptChallanRecords.id, ptChallanId));

  try {
    const result = await ptChallanAdapter.send!(config, upload);
    await db
      .update(ptChallanRecords)
      .set({
        status: "submitted",
        challanNumber: result.providerRef,
        ackJson: (result.raw as Record<string, unknown>) ?? null,
        submittedAt: new Date(),
        lastAttemptAt: new Date(),
        portalError: null,
      })
      .where(eq(ptChallanRecords.id, ptChallanId));
    return { status: "filed", detail: result.providerRef };
  } catch (err) {
    const message = (err as Error).message ?? "unknown error";
    await db
      .update(ptChallanRecords)
      .set({
        status: "failed",
        portalError: message.slice(0, 500),
        lastAttemptAt: new Date(),
      })
      .where(eq(ptChallanRecords.id, ptChallanId));
    throw err;
  }
}

export function startPtChallanWorker(db: Db): Worker<PtChallanJobData> {
  const worker = new Worker<PtChallanJobData>(
    PT_CHALLAN_QUEUE_NAME,
    async (job: Job<PtChallanJobData>) => processPtChallanJob(db, job.data),
    {
      connection: redisConnection(),
      concurrency: Number(process.env["PT_CHALLAN_WORKER_CONCURRENCY"] ?? 2),
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`[pt-challan] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
