/**
 * irnGenerationWorkflow.ts — BullMQ queue + worker for ClearTax IRN dual-write.
 *
 * Pipeline:
 *   createGSTInvoice (financial.ts)
 *     → enqueueIrnGenerationJob(invoiceId)
 *       → BullMQ "coheronconnect-irn-generation"
 *         → worker loads invoice + line items + ClearTax integration config
 *           → builds IrnRequest from invoice columns
 *             → clearTaxGstAdapter.send()
 *               → persists irn / ackNumber / ackDate / signedQrCode on the invoice row
 *
 * Why BullMQ (not synchronous in the createGSTInvoice mutation):
 *   - ClearTax sandbox p99 is ~3-4s; production has been observed at 8s+.
 *   - Tying the user-facing "Save invoice" call to that round-trip means
 *     a transient ClearTax outage breaks the entire AR flow.
 *   - The job is idempotent on (invoiceId) — re-runs are safe and the worker
 *     short-circuits if an IRN is already on the row.
 *
 * Retries: 5 attempts, exponential back-off, terminal failure marks
 * `e_invoice_status = 'failed'` with the last error so an admin can manually
 * retry from the AR UI (`financialRouter.retryEInvoiceGeneration`).
 *
 * Soft-fail: when no ClearTax integration is connected for the org we mark the
 * invoice `e_invoice_status = 'not_configured'` once and log a warning rather
 * than retrying forever. Tenants who genuinely don't need IRN never see noise.
 */
import { Queue, Worker, type Job } from "bullmq";
import { eq, and } from "drizzle-orm";
import {
  invoices,
  invoiceLineItems,
  integrations,
  vendors,
  type Db,
} from "@coheronconnect/db";
import { decryptIntegrationConfig } from "../services/encryption";
import {
  clearTaxGstAdapter,
  type IrnRequest,
} from "../services/integrations/cleartax-gst";

function redisConnection() {
  const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  return { url };
}

export interface IrnJobData {
  invoiceId: string;
  orgId: string;
  /** Set on admin-driven retries; bypasses the "already issued" guard. */
  force?: boolean;
}

export const IRN_GENERATION_QUEUE_NAME = "coheronconnect-irn-generation";

let _queue: Queue<IrnJobData> | null = null;

export function createIrnQueue(): Queue<IrnJobData> {
  if (_queue) return _queue;
  _queue = new Queue<IrnJobData>(IRN_GENERATION_QUEUE_NAME, {
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

export async function enqueueIrnGenerationJob(
  queue: Queue<IrnJobData>,
  data: IrnJobData,
): Promise<void> {
  const jobId = data.force
    ? `irn:${data.invoiceId}:${Date.now()}`
    : `irn:${data.invoiceId}`;
  await queue.add("generate", data, { jobId });
}

// ── Helpers ───────────────────────────────────────────────────────────────

function toClearTaxDate(d: Date | string | null | undefined): string {
  const date = d ? new Date(d) : new Date();
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function buildIrnRequest(args: {
  invoice: typeof invoices.$inferSelect;
  vendor: typeof vendors.$inferSelect | null;
  lines: Array<typeof invoiceLineItems.$inferSelect>;
}): IrnRequest {
  const { invoice, vendor, lines } = args;
  // Place-of-supply is a 2-digit state code per IRP. We accept either the raw
  // 2-digit string the UI captures or fall back to "00" (URP) when unknown so
  // the request still validates in sandbox.
  const buyerStateCode = (invoice.placeOfSupply ?? "00").slice(0, 2);
  return {
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: toClearTaxDate(invoice.invoiceDate),
    invoiceType: invoice.invoiceType === "credit_note" ? "CRN" : "INV",
    supplyType: invoice.buyerGstin ? "B2B" : "B2C",
    ...(invoice.buyerGstin ? { buyerGstin: invoice.buyerGstin } : {}),
    buyerName: vendor?.name ?? "Unknown",
    buyerStateCode,
    totalAmount: Number(invoice.amount),
    taxableAmount: Number(invoice.taxableValue),
    cgst: Number(invoice.cgstAmount),
    sgst: Number(invoice.sgstAmount),
    igst: Number(invoice.igstAmount),
    lineItems: lines.length
      ? lines.map((li) => ({
          description: li.description ?? "Line item",
          hsnCode: li.hsnSacCode ?? "9983",
          quantity: Number(li.quantity ?? 1),
          unitPrice: Number(li.unitPrice ?? 0),
          taxableValue: Number(li.taxableValue ?? li.lineTotal ?? 0),
          gstRate: Number(li.gstRate ?? 18),
        }))
      : [
          // Fall back to a single synthetic line when the invoice was inserted
          // without explicit line items. ClearTax requires at least one.
          {
            description: invoice.invoiceNumber,
            hsnCode: "9983",
            quantity: 1,
            unitPrice: Number(invoice.taxableValue),
            taxableValue: Number(invoice.taxableValue),
            gstRate:
              Number(invoice.taxableValue) > 0
                ? Math.round(
                    ((Number(invoice.cgstAmount) +
                      Number(invoice.sgstAmount) +
                      Number(invoice.igstAmount)) /
                      Number(invoice.taxableValue)) *
                      100,
                  )
                : 18,
          },
        ],
  };
}

export async function processIrnJob(
  db: Db,
  job: Job<IrnJobData>,
): Promise<{ status: "generated" | "skipped" | "not_configured" | "failed"; detail?: string }> {
  const { invoiceId, orgId, force } = job.data;

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, orgId)));
  if (!invoice) {
    return { status: "skipped", detail: "Invoice not found (deleted before processing)" };
  }
  if (!force && invoice.eInvoiceIrn) {
    return { status: "skipped", detail: "IRN already present" };
  }

  const [int] = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.orgId, orgId),
        eq(integrations.provider, "cleartax_gst"),
        eq(integrations.status, "connected"),
      ),
    )
    .limit(1);
  if (!int?.configEncrypted) {
    await db
      .update(invoices)
      .set({
        eInvoiceStatus: "not_configured",
        eInvoiceLastAttemptAt: new Date(),
        eInvoiceError: "ClearTax GST integration not connected",
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));
    return { status: "not_configured", detail: "ClearTax not connected" };
  }

  const [vendor] = invoice.vendorId
    ? await db.select().from(vendors).where(eq(vendors.id, invoice.vendorId))
    : [null as null];
  const lines = await db
    .select()
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceId));

  const config = decryptIntegrationConfig(int.configEncrypted) as unknown as Parameters<
    NonNullable<typeof clearTaxGstAdapter.send>
  >[0];

  const irnRequest = buildIrnRequest({ invoice, vendor, lines });

  try {
    const result = await clearTaxGstAdapter.send!(config, irnRequest);
    const raw = result.raw as
      | { irn?: string; ackNumber?: string; ackDate?: string; signedQrCode?: string }
      | undefined;

    await db
      .update(invoices)
      .set({
        eInvoiceIrn: result.providerRef ?? raw?.irn ?? null,
        eInvoiceAckNumber: raw?.ackNumber ?? null,
        eInvoiceAckDate: raw?.ackDate ? new Date(raw.ackDate) : new Date(),
        eInvoiceSignedQrCode: raw?.signedQrCode ?? null,
        eInvoiceStatus: "generated",
        eInvoiceLastAttemptAt: new Date(),
        eInvoiceError: null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));

    return { status: "generated", detail: result.providerRef };
  } catch (err) {
    const message = (err as Error).message ?? "unknown error";
    // Always record the latest attempt so the UI shows a fresh error even
    // mid-retry; the terminal-fail handler in startIrnWorker flips the
    // status to `failed` only after attempts are exhausted.
    await db
      .update(invoices)
      .set({
        eInvoiceLastAttemptAt: new Date(),
        eInvoiceError: message.slice(0, 500),
        eInvoiceStatus: invoice.eInvoiceStatus ?? "pending",
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));
    throw err;
  }
}

export function startIrnWorker(db: Db): Worker<IrnJobData> {
  const worker = new Worker<IrnJobData>(
    IRN_GENERATION_QUEUE_NAME,
    async (job) => processIrnJob(db, job),
    {
      connection: redisConnection(),
      concurrency: Number(process.env["IRN_WORKER_CONCURRENCY"] ?? 2),
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`[irn] Job ${job?.id} failed:`, err.message);
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      void db
        .update(invoices)
        .set({
          eInvoiceStatus: "failed",
          eInvoiceLastAttemptAt: new Date(),
          eInvoiceError: err.message.slice(0, 500),
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, job.data.invoiceId))
        .catch((e) => console.error("[irn] terminal-fail update error:", e));
    }
  });

  return worker;
}
