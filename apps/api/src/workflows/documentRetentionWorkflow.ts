/**
 * documentRetentionWorkflow.ts — Document retention sweeper.
 *
 * Hard-deletes documents that have been soft-deleted (deletedAt set) for
 * longer than the policy duration, **unless** legal hold is active.
 *
 * Two policy sources are honoured:
 *   1. Per-document `documents.retentionPolicyId` → durationDays from the
 *      retention policy table.
 *   2. Per-document `documents.legalHold` flag (instance-level override).
 *      Also honours the policy-level `legalHold` flag (e.g. an entire
 *      "Litigation 2026" policy can pin all attached docs).
 *
 * The sweeper:
 *   • Removes the underlying object-store keys for every version
 *   • Deletes document_versions rows (cascade), document_acls rows
 *   • Deletes the documents row itself
 *   • Logs a structured retention event for the audit trail
 *
 * Schedule: BullMQ repeatable job, daily at 02:00 IST. Configurable via
 * RETENTION_SWEEP_CRON env var.
 */
import { Queue, Worker, type Job } from "bullmq";
import { and, eq, isNotNull } from "drizzle-orm";
import {
  documents,
  documentRetentionPolicies,
  documentVersions,
} from "@coheronconnect/db";
import type { Db } from "@coheronconnect/db";
import { deleteObject } from "../services/storage";
import { appendAuditEntry } from "../lib/audit-hash";

function redisConnection() {
  const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  return { url };
}

export interface RetentionJobData {
  /** Optional cap on docs swept per run; default 500. */
  batchSize?: number;
}

export const RETENTION_QUEUE_NAME = "coheronconnect-doc-retention";
const SWEEP_JOB_NAME = "sweep";

let _queue: Queue<RetentionJobData> | null = null;

export function createRetentionQueue(): Queue<RetentionJobData> {
  if (_queue) return _queue;
  _queue = new Queue<RetentionJobData>(RETENTION_QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  });
  return _queue;
}

/**
 * Register the daily sweep. BullMQ dedupes repeatable jobs by name + repeat
 * key, so calling this on every server boot is idempotent.
 */
export async function scheduleRetentionSweep(queue: Queue<RetentionJobData>): Promise<void> {
  const cron = process.env["RETENTION_SWEEP_CRON"] ?? "0 2 * * *";
  await queue.add(
    SWEEP_JOB_NAME,
    {},
    {
      repeat: { pattern: cron, tz: "Asia/Kolkata" },
      jobId: `retention-sweep-${cron}`,
    },
  );
}

/**
 * Manual one-shot trigger — useful for admin "run now" buttons or tests.
 */
export async function enqueueRetentionSweepNow(
  queue: Queue<RetentionJobData>,
  batchSize?: number,
): Promise<void> {
  await queue.add(SWEEP_JOB_NAME, { batchSize }, { jobId: `retention-sweep-${Date.now()}` });
}

export interface SweepResult {
  examined: number;
  hardDeleted: number;
  skippedLegalHold: number;
  errors: number;
}

/**
 * Core sweep logic. Pulled out so admin endpoints can call it directly.
 */
export async function runRetentionSweep(db: Db, batchSize = 500): Promise<SweepResult> {
  const result: SweepResult = { examined: 0, hardDeleted: 0, skippedLegalHold: 0, errors: 0 };
  const now = new Date();

  // Pull soft-deleted docs joined to their policy. We compute "age"
  // application-side rather than in SQL because durationDays lives on the
  // policy row and Drizzle's interval math is awkward with day counts.
  const candidates = await db
    .select({
      id: documents.id,
      orgId: documents.orgId,
      name: documents.name,
      deletedAt: documents.deletedAt,
      legalHold: documents.legalHold,
      policyId: documents.retentionPolicyId,
      policyDays: documentRetentionPolicies.durationDays,
      policyLegalHold: documentRetentionPolicies.legalHold,
      policyName: documentRetentionPolicies.name,
    })
    .from(documents)
    .leftJoin(
      documentRetentionPolicies,
      // The org predicate is part of the JOIN, not the WHERE: on a LEFT JOIN a
      // WHERE clause against the policy side would discard documents that have
      // no policy at all, and those are exactly the ones the 90-day default is
      // for. Matching on org here means a document holding another tenant's
      // policy id falls back to the default instead of inheriting that tenant's
      // duration and legal hold. The FK does not constrain same-org, and
      // `documents.retention.assign` closing the reachable path does not make
      // existing rows safe.
      and(
        eq(documents.retentionPolicyId, documentRetentionPolicies.id),
        eq(documents.orgId, documentRetentionPolicies.orgId),
      ),
    )
    .where(isNotNull(documents.deletedAt))
    .limit(batchSize);

  // Parse the env default ONCE, defensively. A blank ("") env var is not nullish,
  // so `?? 90` never fires and Number("") is 0 (a malformed value is NaN). With
  // days = 0/NaN the `ageMs < days*…` guard below is always false, so EVERY
  // soft-deleted document would be hard-deleted immediately. Fall back to 90
  // unless the value is a finite positive number.
  const parsedDefault = Number(process.env["RETENTION_DEFAULT_DAYS"]);
  const defaultRetentionDays = Number.isFinite(parsedDefault) && parsedDefault > 0 ? parsedDefault : 90;

  for (const row of candidates) {
    result.examined++;

    if (!row.deletedAt) continue;

    if (row.legalHold || row.policyLegalHold) {
      result.skippedLegalHold++;
      continue;
    }

    // Default retention if no policy is attached: 90 days (validated above).
    const days = row.policyDays ?? defaultRetentionDays;
    // Belt-and-suspenders: a non-positive or non-finite window must NEVER be read
    // as "delete now" — skip and warn rather than purge.
    if (!Number.isFinite(days) || days <= 0) {
      console.warn(`[retention] skipping ${row.id}: invalid retention window (${days} days)`);
      continue;
    }
    const ageMs = now.getTime() - new Date(row.deletedAt).getTime();
    if (ageMs < days * 86_400_000) continue;

    // Eligible — wipe the object store first, then DB rows.
    try {
      const versions = await db
        .select({ id: documentVersions.id, storageKey: documentVersions.storageKey })
        .from(documentVersions)
        .where(eq(documentVersions.documentId, row.id));

      for (const v of versions) {
        try {
          await deleteObject(v.storageKey);
        } catch (err) {
          // Don't abort on a single object-store failure; log and continue.
          // Worst case: orphaned object key, sweepable by lifecycle rules.
          console.warn(
            `[retention] Object delete failed for ${v.storageKey} (${row.id}):`,
            (err as Error).message,
          );
        }
      }

      await db.delete(documents).where(eq(documents.id, row.id));

      await appendAuditEntry(db, {
        orgId: row.orgId,
        action: "document.retention.purged",
        resourceType: "document",
        resourceId: row.id,
        changes: {
          name: row.name,
          policyId: row.policyId,
          policyName: row.policyName,
          retentionDays: days,
          softDeletedAt: row.deletedAt,
          versionsRemoved: versions.length,
        },
      });

      result.hardDeleted++;
    } catch (err) {
      result.errors++;
      console.error(`[retention] Hard-delete failed for ${row.id}:`, (err as Error).message);
    }
  }

  return result;
}

export function startRetentionWorker(db: Db): Worker<RetentionJobData> {
  const worker = new Worker<RetentionJobData>(
    RETENTION_QUEUE_NAME,
    async (job: Job<RetentionJobData>) => {
      const batchSize = job.data.batchSize ?? 500;
      const t0 = Date.now();
      const result = await runRetentionSweep(db, batchSize);
      console.info(
        `[retention] Sweep complete in ${Date.now() - t0}ms — examined=${result.examined} ` +
          `hardDeleted=${result.hardDeleted} skippedLegalHold=${result.skippedLegalHold} ` +
          `errors=${result.errors}`,
      );
      return result;
    },
    {
      connection: redisConnection(),
      concurrency: 1, // sweeper runs serially — no need for parallel workers.
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`[retention] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
