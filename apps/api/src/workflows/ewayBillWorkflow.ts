/**
 * ewayBillWorkflow.ts — BullMQ queue + worker for NIC E-Way Bill push (G3).
 *
 * Pipeline:
 *   financial.ewayBill.generate(ewayBillId)
 *     → enqueueEwayBillJob({ op: "generate", ewayBillId })
 *       → BullMQ "coheronconnect-eway-bill"
 *         → worker loads the eway_bills row + NIC integration config
 *           → nicEwayBillAdapter.send({ op: "generate", ... })
 *             → persists ewbNo + validUpto + status on the row
 *
 *   financial.ewayBill.cancel(ewayBillId, reason) follows the same path with
 *   op: "cancel" and flips the row to `cancelled`.
 *
 * Modelled on statutoryFilingWorkflow: 5 attempts + exponential back-off, the
 * job is idempotent — generate short-circuits once the row carries an ewbNo (a
 * live EWB), cancel short-circuits once cancelled. Soft-fail: when no NIC
 * integration is connected we mark the row `not_configured` once (no endless
 * retry). Terminal failure flips the row to `failed` with the last error for an
 * admin-driven retry.
 */
import { Queue, Worker, type Job } from "bullmq";
import { eq, and } from "drizzle-orm";
import { ewayBills, integrations, type Db } from "@coheronconnect/db";
import { decryptIntegrationConfigEnvelope } from "../services/encryption";
import {
  nicEwayBillAdapter,
  parseNicValidUpto,
  type EwayBillGenerate,
  type EwayBillCancel,
} from "../services/integrations/nic-ewaybill";

function redisConnection() {
  const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  return { url };
}

export interface EwayBillJobData {
  ewayBillId: string;
  orgId: string;
  op: "generate" | "cancel";
  /** cancel-only: NIC reason code + remark. */
  cancelRsnCode?: 1 | 2 | 3 | 4;
  cancelRemark?: string;
  /** Set on admin-driven retries; bypasses the "already done" guard. */
  force?: boolean;
}

export const EWAY_BILL_QUEUE_NAME = "coheronconnect-eway-bill";

let _queue: Queue<EwayBillJobData> | null = null;

export function createEwayBillQueue(): Queue<EwayBillJobData> {
  if (_queue) return _queue;
  _queue = new Queue<EwayBillJobData>(EWAY_BILL_QUEUE_NAME, {
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

export async function enqueueEwayBillJob(
  queue: Queue<EwayBillJobData>,
  data: EwayBillJobData,
): Promise<void> {
  const jobId = data.force
    ? `ewb-${data.op}-${data.ewayBillId}-${Date.now()}`
    : `ewb-${data.op}-${data.ewayBillId}`;
  await queue.add(data.op, data, { jobId });
}

export async function processEwayBillJob(
  db: Db,
  data: EwayBillJobData,
): Promise<{ status: "generated" | "cancelled" | "skipped" | "not_configured" | "failed"; detail?: string }> {
  const { ewayBillId, orgId, op, force } = data;

  const [row] = await db
    .select()
    .from(ewayBills)
    .where(and(eq(ewayBills.id, ewayBillId), eq(ewayBills.orgId, orgId)));
  if (!row) {
    return { status: "skipped", detail: "E-Way Bill row not found (deleted before processing)" };
  }

  if (op === "generate" && !force && row.ewbNo && row.status === "generated") {
    return { status: "skipped", detail: "E-Way Bill already generated" };
  }
  if (op === "cancel" && !force && row.status === "cancelled") {
    return { status: "skipped", detail: "E-Way Bill already cancelled" };
  }
  if (op === "cancel" && !row.ewbNo) {
    return { status: "skipped", detail: "Cannot cancel: no E-Way Bill number on record" };
  }

  const [int] = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.orgId, orgId),
        eq(integrations.provider, "nic_ewaybill"),
        eq(integrations.status, "connected"),
      ),
    )
    .limit(1);
  if (!int?.configEncrypted) {
    await db
      .update(ewayBills)
      .set({
        status: "not_configured",
        portalError: "NIC E-Way Bill integration not connected",
        lastAttemptAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(ewayBills.id, ewayBillId));
    return { status: "not_configured", detail: "NIC E-Way Bill not connected" };
  }

  const config = await decryptIntegrationConfigEnvelope(int.configEncrypted) as unknown as Parameters<
    NonNullable<typeof nicEwayBillAdapter.send>
  >[0];

  if (op === "cancel") {
    try {
      const cancelMsg: EwayBillCancel = {
        op: "cancel",
        ewbNo: row.ewbNo!,
        cancelRsnCode: data.cancelRsnCode ?? 4,
        cancelRemark: data.cancelRemark ?? "Cancelled by supplier",
      };
      const result = await nicEwayBillAdapter.send!(config, cancelMsg);
      await db
        .update(ewayBills)
        .set({
          status: "cancelled",
          cancelReason: cancelMsg.cancelRemark,
          cancelledAt: new Date(),
          ackJson: result.raw as Record<string, unknown>,
          lastAttemptAt: new Date(),
          portalError: null,
          updatedAt: new Date(),
        })
        .where(eq(ewayBills.id, ewayBillId));
      return { status: "cancelled", detail: result.providerRef };
    } catch (err) {
      const message = (err as Error).message ?? "unknown error";
      await db
        .update(ewayBills)
        .set({ portalError: message.slice(0, 500), lastAttemptAt: new Date(), updatedAt: new Date() })
        .where(eq(ewayBills.id, ewayBillId));
      throw err;
    }
  }

  // generate — the canonical NIC EWB-01 payload was built + persisted at enqueue
  // time; the worker re-uses it so the round-trip is deterministic across retries.
  const payload = row.payloadJson as unknown as EwayBillGenerate | null;
  if (!payload || payload.op !== "generate") {
    await db
      .update(ewayBills)
      .set({
        status: "failed",
        portalError: "Missing or malformed E-Way Bill payload",
        lastAttemptAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(ewayBills.id, ewayBillId));
    return { status: "failed", detail: "Missing payload" };
  }

  await db
    .update(ewayBills)
    .set({ status: "generating", lastAttemptAt: new Date(), portalError: null, updatedAt: new Date() })
    .where(eq(ewayBills.id, ewayBillId));

  try {
    const result = await nicEwayBillAdapter.send!(config, payload);
    const validUpto = parseNicValidUpto(
      (result.raw as { validUpto?: string } | undefined)?.validUpto,
    );
    await db
      .update(ewayBills)
      .set({
        status: "generated",
        ewbNo: result.providerRef,
        validUpto: validUpto ?? undefined,
        ackJson: result.raw as Record<string, unknown>,
        lastAttemptAt: new Date(),
        portalError: null,
        updatedAt: new Date(),
      })
      .where(eq(ewayBills.id, ewayBillId));
    return { status: "generated", detail: result.providerRef };
  } catch (err) {
    const message = (err as Error).message ?? "unknown error";
    await db
      .update(ewayBills)
      .set({
        status: "failed",
        portalError: message.slice(0, 500),
        lastAttemptAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(ewayBills.id, ewayBillId));
    throw err;
  }
}

export function startEwayBillWorker(db: Db): Worker<EwayBillJobData> {
  const worker = new Worker<EwayBillJobData>(
    EWAY_BILL_QUEUE_NAME,
    async (job: Job<EwayBillJobData>) => processEwayBillJob(db, job.data),
    {
      connection: redisConnection(),
      concurrency: Number(process.env["EWAY_BILL_WORKER_CONCURRENCY"] ?? 2),
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`[eway-bill] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
