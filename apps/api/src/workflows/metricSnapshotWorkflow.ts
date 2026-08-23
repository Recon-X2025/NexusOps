/**
 * Daily metric snapshot — WIRING-01 item W1.
 *
 * Sixteen of thirty metrics rendered a number and an empty trend line, and the
 * resolvers said why: "a point-in-time count; without a daily snapshot table
 * there is no honest history to backfill, so leave the series empty." That was
 * correct — "tickets currently open" cannot be reconstructed for last Tuesday,
 * because the rows that were open then are not distinguishable now.
 *
 * This job records each metric once a day so a trend can be drawn from real
 * observations. It does NOT backfill, and there is nothing here that could:
 * series begin empty and fill forward from the first run. Inventing history is
 * the fabricated-figure problem the standing directive exists to stop.
 *
 * IDEMPOTENT PER DAY. The upsert keys on (org_id, metric_id, captured_on), so a
 * second run in the same day corrects the figure rather than doubling the
 * series — which matters because BullMQ will retry.
 *
 * ONE ORG'S FAILURE IS NOT THE SWEEP'S. A resolver that throws is counted and
 * logged; the loop continues. A single misbehaving metric must not cost every
 * other tenant its history for that day.
 */
import { Queue, Worker, type Job } from "bullmq";
import { format, subDays } from "date-fns";
import { getAllMetricDefinitions } from "@coheronconnect/metrics";
import { organizations, metricSnapshots, and, eq, gte, asc, inArray, type Db } from "@coheronconnect/db";

/** Local, matching every other worker in this directory. */
function redisConnection() {
  return { url: process.env["REDIS_URL"] ?? "redis://localhost:6379" };
}

export const METRIC_SNAPSHOT_QUEUE_NAME = "coheronconnect-metric-snapshot";
export const METRIC_SNAPSHOT_JOB_NAME = "metric-snapshot-sweep";

/** Daily. Retries land in the same day and upsert, so they cost nothing. */
export const METRIC_SNAPSHOT_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface MetricSnapshotJobData { _: string }

export interface MetricSnapshotResult {
  orgs: number;
  metrics: number;
  written: number;
  errors: number;
}

export function createMetricSnapshotQueue(): Queue<MetricSnapshotJobData> {
  return new Queue(METRIC_SNAPSHOT_QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 3_000 },
      removeOnComplete: { count: 300 },
      removeOnFail: { count: 100 },
    },
  });
}

/** Idempotent — BullMQ deduplicates repeatable jobs by (name, repeat options). */
export async function scheduleMetricSnapshotSweep(
  queue: Queue<MetricSnapshotJobData>,
): Promise<void> {
  await queue.add(
    METRIC_SNAPSHOT_JOB_NAME,
    { _: "" },
    {
      repeat: { every: METRIC_SNAPSHOT_INTERVAL_MS },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  );
}

/**
 * Capture every metric for every tenant, once for `day`.
 *
 * `day` is formatted with date-fns rather than toISOString(): CLAUDE.md records
 * that `toISOString()` renders UTC while `new Date(y,m,d)` is local midnight, so
 * east of UTC they disagree by a day — a bug that has shipped here twice.
 */
export interface CaptureOptions {
  /** Capture for these tenants only. Omit to sweep every tenant. */
  orgIds?: string[];
  /** The day being captured. Defaults to now. */
  now?: Date;
}

export async function captureMetricSnapshots(
  db: Db,
  opts: CaptureOptions = {},
): Promise<MetricSnapshotResult> {
  const now = opts.now ?? new Date();
  const capturedOn = format(now, "yyyy-MM-dd");
  const defs = getAllMetricDefinitions();

  // SCOPE MATTERS AT SCALE. Every metric is a database round trip, so the cost
  // is tenants x metrics. The test database carries several thousand tenants of
  // accumulated exhaust, and an unscoped sweep there runs for minutes — which is
  // how this option came to exist. The worker still sweeps everything; callers
  // that know which tenants they care about should say so.
  const orgs = opts.orgIds?.length
    ? opts.orgIds.map((id) => ({ id }))
    : await db.select({ id: organizations.id }).from(organizations);
  const result: MetricSnapshotResult = { orgs: orgs.length, metrics: defs.length, written: 0, errors: 0 };

  // The resolvers take a range; a point-in-time capture asks for "today".
  const range = { start: now, end: now, granularity: "day" as const };

  for (const org of orgs) {
    for (const def of defs) {
      try {
        const value = await def.resolve({
          tenantId: org.id,
          userId: "system",
          range,
          services: { db },
        });
        if (!Number.isFinite(value.current)) continue;   // nothing honest to record
        await db
          .insert(metricSnapshots)
          .values({
            orgId: org.id,
            metricId: def.id,
            capturedOn,
            value: String(value.current),
            state: value.state ?? null,
          })
          .onConflictDoUpdate({
            target: [metricSnapshots.orgId, metricSnapshots.metricId, metricSnapshots.capturedOn],
            set: { value: String(value.current), state: value.state ?? null },
          });
        result.written++;
      } catch (err) {
        result.errors++;
        console.warn(
          `[metric-snapshot] ${def.id} failed for org ${org.id}:`,
          (err as Error).message,
        );
      }
    }
  }
  return result;
}

/**
 * Read recorded history for several metrics at once.
 *
 * Batched deliberately: this sits on the dashboard render path, and one query
 * per metric would mean thirty round trips to draw one screen.
 *
 * Returns an empty array for any metric with no rows yet — which is the honest
 * answer before the job has run, not a synthesised line.
 */
export async function readMetricSeriesBatch(
  db: Db,
  orgId: string,
  metricIds: string[],
  days = 30,
): Promise<Map<string, Array<{ t: string; v: number }>>> {
  const out = new Map<string, Array<{ t: string; v: number }>>();
  if (metricIds.length === 0) return out;

  const rows = await db
    .select({
      metricId: metricSnapshots.metricId,
      capturedOn: metricSnapshots.capturedOn,
      value: metricSnapshots.value,
    })
    .from(metricSnapshots)
    .where(
      and(
        eq(metricSnapshots.orgId, orgId),
        inArray(metricSnapshots.metricId, metricIds),
        gte(metricSnapshots.capturedOn, format(subDays(new Date(), days), "yyyy-MM-dd")),
      ),
    )
    .orderBy(asc(metricSnapshots.capturedOn));

  for (const r of rows) {
    const list = out.get(r.metricId) ?? [];
    list.push({ t: String(r.capturedOn), v: Number(r.value) });
    out.set(r.metricId, list);
  }
  return out;
}

export function startMetricSnapshotWorker(db: Db): Worker<MetricSnapshotJobData> {
  return new Worker<MetricSnapshotJobData>(
    METRIC_SNAPSHOT_QUEUE_NAME,
    async (job: Job<MetricSnapshotJobData>) => {
      const r = await captureMetricSnapshots(db);
      console.log(
        `[metric-snapshot] job ${job.id}: ${r.written} written across ${r.orgs} org(s) ` +
        `× ${r.metrics} metric(s), ${r.errors} error(s)`,
      );
      return r;
    },
    { connection: redisConnection(), concurrency: 1 },
  );
}
