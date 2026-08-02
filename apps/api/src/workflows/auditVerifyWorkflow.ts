/**
 * auditVerifyWorkflow.ts — Scheduled audit-chain verifier (B5 / H-2).
 *
 * The tamper-evident audit hash chain (`lib/audit-hash.ts`) is well built, but
 * the audit found nothing ever *ran* `verifyAuditChain` — no endpoint, job, or
 * console. A tamper-detector nobody runs detects nothing. This sweep closes that
 * loop: on a schedule it re-derives every anchored org's chain and, on the first
 * detection of a break, records it and notifies the org's owners/admins so a
 * human sees it.
 *
 * How a break is caught:
 *   • `verifyAuditChain` re-derives the chain from the surviving rows (catching
 *     edited fields, seq gaps, reordering) AND compares the live head against the
 *     independent per-org anchor (`audit_chain_anchors`) — which is how tail
 *     truncation (deleting the newest entries) is detected. See B5 / R-5.
 *
 * Idempotency / notify-once:
 *   • The anchor's `status` column is the latch. When the sweep first sees a
 *     chain fail while its anchor still says `ok`, it flips the anchor to
 *     `broken`, writes one chained audit row, and notifies the org's owners and
 *     admins. On every later tick the anchor already reads `broken`, so the break
 *     is still counted as failing but nobody is re-notified. This makes the sweep
 *     safe to run every hour without a notification storm — the alarm fires once
 *     per newly-detected break and stays latched until a human resolves it.
 *   • Anchors backfilled as `broken` (structural breaks the migration could see)
 *     are therefore reported as failing but do NOT re-notify — they predate this
 *     sweep and were never `ok` for it to transition from.
 *
 * The sweep is exported directly so tests can drive it without Redis.
 */
import { Queue, Worker, type Job } from "bullmq";
import type { Db } from "@coheronconnect/db";
import {
  auditChainAnchors,
  users,
  eq,
  and,
  inArray,
  desc,
} from "@coheronconnect/db";
import { verifyAuditChain } from "../lib/audit-hash";
import { notifyActivity, writeWorkflowAuditLog } from "./activities";

function redisConnection() {
  return { url: process.env["REDIS_URL"] ?? "redis://localhost:6379" };
}

export const AUDIT_VERIFY_QUEUE_NAME = "coheronconnect-audit-verify";

/** Job name for the periodic chain-verification sweep. */
export const AUDIT_VERIFY_JOB_NAME = "audit-verify-sweep";

/**
 * Sweep cadence — hourly. The chain is only broken by deletion/tampering (rare,
 * out-of-band DB access), not by normal traffic, so a minute-level cadence would
 * be wasted work. Hourly bounds the detection lag to ≤1h.
 */
const AUDIT_VERIFY_SWEEP_INTERVAL_MS = 60 * 60_000;

/**
 * Hard cap on orgs verified per tick — bounds DB work on very large tenancies.
 * The tick verifies the most-recently-updated anchors first (see the ordered
 * select below): a just-appended or just-tampered chain bumps its anchor's
 * `updatedAt`, so the orgs most likely to have changed since the last sweep are
 * always in the batch. On tenancies larger than this cap, quieter orgs are
 * reached on a later tick as activity rotates the ordering.
 */
const AUDIT_VERIFY_SWEEP_BATCH_LIMIT = 1_000;

export interface AuditVerifyJobData {
  /** Unused — the sweep queries the DB directly. */
  _: string;
}

export interface AuditVerifySweepResult {
  /** Anchored orgs verified this tick. */
  examined: number;
  /** Orgs whose chain verified clean. */
  ok: number;
  /** Orgs whose chain failed verification (newly-detected + already-broken). */
  broken: number;
  /** Orgs whose anchor was flipped ok→broken this tick (first detection). */
  newlyBroken: number;
  /** Owner/admin notifications sent this tick. */
  notified: number;
  errors: number;
}

export function createAuditVerifyQueue(): Queue<AuditVerifyJobData> {
  return new Queue(AUDIT_VERIFY_QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 3_000 },
      removeOnComplete: { count: 300 },
      removeOnFail: { count: 100 },
    },
  });
}

/**
 * Register the repeatable audit-verify sweep. Idempotent — BullMQ deduplicates
 * repeatable jobs by (name, repeat options), so calling at every boot is safe.
 */
export async function scheduleAuditVerifySweep(
  queue: Queue<AuditVerifyJobData>,
): Promise<void> {
  await queue.add(
    AUDIT_VERIFY_JOB_NAME,
    { _: "" },
    {
      repeat: { every: AUDIT_VERIFY_SWEEP_INTERVAL_MS },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  );
}

/**
 * Re-derive and verify every anchored org's audit chain. On the first tick that
 * finds a chain broken while its anchor still reads `ok`, latch the anchor to
 * `broken`, write one chained audit row, and notify the org's owners/admins.
 *
 * Never throws to the caller — a per-org failure is counted and logged so one
 * bad org can't stall the whole sweep.
 */
export async function sweepAuditChainVerification(
  db: Db,
): Promise<AuditVerifySweepResult> {
  const result: AuditVerifySweepResult = {
    examined: 0,
    ok: 0,
    broken: 0,
    newlyBroken: 0,
    notified: 0,
    errors: 0,
  };

  const anchors = await db
    .select({ orgId: auditChainAnchors.orgId, status: auditChainAnchors.status })
    .from(auditChainAnchors)
    .orderBy(desc(auditChainAnchors.updatedAt))
    .limit(AUDIT_VERIFY_SWEEP_BATCH_LIMIT);

  for (const anchor of anchors) {
    result.examined++;
    try {
      const verdict = await verifyAuditChain(db, anchor.orgId);
      if (verdict.ok) {
        result.ok++;
        continue;
      }

      result.broken++;

      // Already latched broken (prior sweep or backfill) → still failing, but do
      // not re-notify. The alarm already fired once for this break.
      if (anchor.status === "broken") continue;

      // First detection: latch the anchor, audit it, and notify humans.
      result.newlyBroken++;
      await db
        .update(auditChainAnchors)
        .set({ status: "broken", updatedAt: new Date() })
        .where(eq(auditChainAnchors.orgId, anchor.orgId));

      await writeWorkflowAuditLog(
        { db, orgId: anchor.orgId, actorId: "system" },
        {
          resource: "audit_chain",
          resourceId: anchor.orgId,
          action: "audit.chain.verification_failed",
          changes: {
            reason: verdict.reason ?? "chain verification failed",
            brokenAtSeq: verdict.brokenAtSeq,
            entries: verdict.entries,
          },
        },
      );

      const recipients = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.orgId, anchor.orgId),
            inArray(users.role, ["owner", "admin"]),
          ),
        );

      for (const r of recipients) {
        await notifyActivity(
          { db, orgId: anchor.orgId, actorId: "system" },
          {
            userId: r.id,
            title: "Audit log integrity check failed",
            message:
              `The tamper-evident audit chain for your organisation failed ` +
              `verification: ${verdict.reason ?? "chain broken"}. This can mean ` +
              `audit entries were deleted or altered. Investigate immediately.`,
            resourceType: "audit_chain",
            resourceId: anchor.orgId,
            link: `/app/admin/audit-log`,
          },
        );
        result.notified++;
      }
    } catch (err) {
      result.errors++;
      console.error(
        "[audit-verify] chain verification failed for org",
        anchor.orgId,
        (err as Error).message,
      );
    }
  }

  return result;
}

export function startAuditVerifyWorker(db: Db): Worker<AuditVerifyJobData> {
  return new Worker<AuditVerifyJobData>(
    AUDIT_VERIFY_QUEUE_NAME,
    async (job: Job<AuditVerifyJobData>) => {
      if (job.name === AUDIT_VERIFY_JOB_NAME) {
        await sweepAuditChainVerification(db);
      }
    },
    { connection: redisConnection(), concurrency: 1 },
  );
}
