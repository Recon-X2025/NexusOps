/**
 * expiryAlertWorkflow.ts — Asset-warranty & contract-renewal expiry alerting (G9).
 *
 * The `assets.expiring` query already *surfaces* expiring warranties/licenses
 * on demand, but nothing *closed the loop*: an owner was never proactively
 * notified when a contract entered its renewal-notice window or an asset
 * warranty was about to lapse. This sweep mirrors the proven vuln-SLA sweeper
 * (`vulnerabilitySlaWorkflow.ts`): a repeatable BullMQ job that scans due items
 * and dispatches one notification per item.
 *
 * Two independent scans, both idempotent:
 *   1. `sweepContractExpiries` — a contract is "due" once NOW() has entered its
 *      renewal-notice window: `end_date − notice_period_days ≤ NOW() < end_date`
 *      (active/executed contracts with an owner). Notifies `internal_owner_id`
 *      (falling back to `legal_owner_id`).
 *   2. `sweepWarrantyExpiries` — an asset warranty within `WARRANTY_HORIZON_DAYS`
 *      of lapsing (non-disposed, owned). Notifies `owner_id`.
 *
 * Idempotency: before notifying we check for an existing notification row with
 * the same (source_type, source_id), so each item is alerted at most once — no
 * duplicate alerts across ticks. The alert re-fires only if that notification is
 * cleared. `source_type` is distinct per kind (`contract_expiry` /
 * `asset_warranty_expiry`).
 *
 * Both sweeps are exported directly so tests can drive them without Redis, and
 * write notifications through the passed `db` (not the singleton) so they are
 * transaction-visible and tenant-correct.
 */
import { Queue, Worker, type Job } from "bullmq";
import type { Db } from "@coheronconnect/db";
import {
  contracts,
  assets,
  notifications,
  users,
  eq,
  and,
  or,
  isNull,
  isNotNull,
  sql,
} from "@coheronconnect/db";

function redisConnection() {
  return { url: process.env["REDIS_URL"] ?? "redis://localhost:6379" };
}

export const EXPIRY_ALERT_QUEUE_NAME = "coheronconnect-expiry-alert";
export const CONTRACT_EXPIRY_JOB_NAME = "contract-expiry-sweep";
export const WARRANTY_EXPIRY_JOB_NAME = "warranty-expiry-sweep";

/** Sweep cadence — hourly; expiry windows are day-scale, minute precision is wasteful. */
const EXPIRY_SWEEP_INTERVAL_MS = 60 * 60_000;
/** Hard cap per tick — protects DB + notification volume. */
const EXPIRY_SWEEP_BATCH_LIMIT = 500;
/** How many days ahead a warranty lapse triggers an alert. */
export const WARRANTY_HORIZON_DAYS = 30;

const CONTRACT_SOURCE = "contract_expiry";
const WARRANTY_SOURCE = "asset_warranty_expiry";

export interface ExpiryAlertJobData {
  _: string;
}

export interface ExpirySweepResult {
  examined: number;
  notified: number;
  skipped: number;
  errors: number;
}

export function createExpiryAlertQueue(): Queue<ExpiryAlertJobData> {
  return new Queue(EXPIRY_ALERT_QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 3_000 },
      removeOnComplete: { count: 300 },
      removeOnFail: { count: 100 },
    },
  });
}

/** Register both repeatable expiry sweepers. Idempotent (BullMQ dedupes repeatables). */
export async function scheduleExpiryAlertSweep(queue: Queue<ExpiryAlertJobData>): Promise<void> {
  for (const name of [CONTRACT_EXPIRY_JOB_NAME, WARRANTY_EXPIRY_JOB_NAME]) {
    await queue.add(
      name,
      { _: "" },
      {
        repeat: { every: EXPIRY_SWEEP_INTERVAL_MS },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 50 },
      },
    );
  }
}

/**
 * Has this (sourceType, sourceId) already been alerted for this org? Used to keep
 * the sweep idempotent so an item is notified at most once.
 */
async function alreadyAlerted(
  db: Db,
  orgId: string,
  sourceType: string,
  sourceId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.orgId, orgId),
        eq(notifications.sourceType, sourceType),
        eq(notifications.sourceId, sourceId),
      ),
    )
    .limit(1);
  return !!row;
}

/** Insert an in-app notification row directly through the passed db (test-visible). */
async function insertAlert(
  db: Db,
  args: {
    orgId: string;
    userId: string;
    title: string;
    body: string;
    link: string;
    sourceType: string;
    sourceId: string;
  },
): Promise<void> {
  await db.insert(notifications).values({
    orgId: args.orgId,
    userId: args.userId,
    title: args.title,
    body: args.body,
    link: args.link,
    type: "warning",
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    isRead: false,
  });
}

/**
 * Alert the owner of every contract that has entered its renewal-notice window
 * and not yet been alerted. Returns a per-tick tally.
 */
export async function sweepContractExpiries(db: Db): Promise<ExpirySweepResult> {
  const result: ExpirySweepResult = { examined: 0, notified: 0, skipped: 0, errors: 0 };

  const rows = await db
    .select({
      id: contracts.id,
      orgId: contracts.orgId,
      title: contracts.title,
      endDate: contracts.endDate,
      internalOwnerId: contracts.internalOwnerId,
      legalOwnerId: contracts.legalOwnerId,
    })
    .from(contracts)
    .where(
      and(
        isNotNull(contracts.endDate),
        // In the renewal-notice window: end_date − notice_period_days ≤ NOW() < end_date.
        sql`${contracts.endDate} - (COALESCE(${contracts.noticePeriodDays}, 30) || ' days')::interval <= NOW()`,
        sql`${contracts.endDate} > NOW()`,
        or(isNotNull(contracts.internalOwnerId), isNotNull(contracts.legalOwnerId)),
      ),
    )
    .limit(EXPIRY_SWEEP_BATCH_LIMIT);

  for (const c of rows) {
    result.examined++;
    try {
      if (await alreadyAlerted(db, c.orgId, CONTRACT_SOURCE, c.id)) {
        result.skipped++;
        continue;
      }
      const ownerId = c.internalOwnerId ?? c.legalOwnerId!;
      const days = c.endDate
        ? Math.max(0, Math.ceil((new Date(c.endDate).getTime() - Date.now()) / 86400000))
        : 0;
      await insertAlert(db, {
        orgId: c.orgId,
        userId: ownerId,
        title: `Contract renewal due: ${c.title}`,
        body: `Contract "${c.title}" expires in ${days} day(s). It has entered its renewal-notice window — renew or issue notice now.`,
        link: `/app/contracts/${c.id}`,
        sourceType: CONTRACT_SOURCE,
        sourceId: c.id,
      });
      result.notified++;
    } catch (err) {
      result.errors++;
      console.error("[expiry-alert] contract alert failed", c.id, (err as Error).message);
    }
  }

  return result;
}

/**
 * Alert the owner of every asset whose warranty lapses within
 * `WARRANTY_HORIZON_DAYS` and hasn't been alerted. Disposed assets and
 * owner-less assets are skipped.
 */
export async function sweepWarrantyExpiries(db: Db): Promise<ExpirySweepResult> {
  const result: ExpirySweepResult = { examined: 0, notified: 0, skipped: 0, errors: 0 };

  const rows = await db
    .select({
      id: assets.id,
      orgId: assets.orgId,
      name: assets.name,
      assetTag: assets.assetTag,
      warrantyExpiry: assets.warrantyExpiry,
      ownerId: assets.ownerId,
    })
    .from(assets)
    .where(
      and(
        isNotNull(assets.warrantyExpiry),
        isNotNull(assets.ownerId),
        sql`${assets.status} <> 'disposed'`,
        sql`${assets.warrantyExpiry} <= NOW() + (${WARRANTY_HORIZON_DAYS} || ' days')::interval`,
      ),
    )
    .limit(EXPIRY_SWEEP_BATCH_LIMIT);

  for (const a of rows) {
    result.examined++;
    try {
      if (await alreadyAlerted(db, a.orgId, WARRANTY_SOURCE, a.id)) {
        result.skipped++;
        continue;
      }
      const ms = a.warrantyExpiry ? new Date(a.warrantyExpiry).getTime() - Date.now() : 0;
      const days = Math.ceil(ms / 86400000);
      const when = days < 0 ? `${Math.abs(days)} day(s) ago` : `in ${days} day(s)`;
      await insertAlert(db, {
        orgId: a.orgId,
        userId: a.ownerId!,
        title: `Warranty expiring: ${a.name}`,
        body: `Warranty for asset "${a.name}" (${a.assetTag}) ${days < 0 ? "expired" : "expires"} ${when}.`,
        link: `/app/assets/${a.id}`,
        sourceType: WARRANTY_SOURCE,
        sourceId: a.id,
      });
      result.notified++;
    } catch (err) {
      result.errors++;
      console.error("[expiry-alert] warranty alert failed", a.id, (err as Error).message);
    }
  }

  return result;
}

export function startExpiryAlertWorker(db: Db): Worker<ExpiryAlertJobData> {
  return new Worker<ExpiryAlertJobData>(
    EXPIRY_ALERT_QUEUE_NAME,
    async (job: Job<ExpiryAlertJobData>) => {
      if (job.name === CONTRACT_EXPIRY_JOB_NAME) {
        await sweepContractExpiries(db);
      } else if (job.name === WARRANTY_EXPIRY_JOB_NAME) {
        await sweepWarrantyExpiries(db);
      }
    },
    { connection: redisConnection(), concurrency: 5 },
  );
}
