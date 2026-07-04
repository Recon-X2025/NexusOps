/**
 * webhookDispatchWorkflow.ts — Outbound webhook dispatcher.
 *
 * Closes the automation loop's second half: the `webhooks` + `webhook_deliveries`
 * tables were fully modelled but no code ever created a delivery or POSTed a
 * subscriber. This module:
 *   • `enqueueWebhookEvent` — when a domain event fires, insert a pending
 *     `webhook_deliveries` row for every active subscriber to that event.
 *   • `sweepPendingDeliveries` — claim pending/retry-due deliveries, sign the
 *     payload with the subscriber's HMAC-SHA256 secret, POST it, and record
 *     the outcome with exponential backoff on failure.
 *
 * Delivery semantics: at-least-once. Each POST carries:
 *   • `X-Coheron-Signature: sha256=<hex>` — HMAC of the raw JSON body.
 *   • `X-Coheron-Delivery: <deliveryId>` — idempotency key for the subscriber.
 *   • `X-Coheron-Event: <event>`.
 *
 * Idempotency of the sweeper itself: deliveries are claimed with
 * `FOR UPDATE SKIP LOCKED` and flipped to `retrying` in the claim statement,
 * so overlapping ticks can't double-POST the same row.
 *
 * Schedule: BullMQ repeatable job, every 30s.
 */
import { createHmac } from "node:crypto";
import { Queue, Worker, type Job } from "bullmq";
import { and, arrayContains, eq, sql } from "drizzle-orm";
import { webhooks, webhookDeliveries } from "@coheronconnect/db";
import type { Db } from "@coheronconnect/db";

function redisConnection() {
  const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  return { url };
}

export interface WebhookDispatchJobData {
  _sweep?: true;
}

export const WEBHOOK_DISPATCH_QUEUE_NAME = "coheronconnect-webhook-dispatch";
export const WEBHOOK_DISPATCH_SWEEP_JOB_NAME = "sweep";
/** 30s cadence for outbound delivery. */
const SWEEP_INTERVAL_MS = 30_000;
const SWEEP_BATCH_LIMIT = 50;
const MAX_ATTEMPTS = 6;
/** Base backoff; delay = BASE * 2^attempts (capped). */
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 6 * 60 * 60 * 1000; // 6h
const POST_TIMEOUT_MS = 10_000;

let _queue: Queue<WebhookDispatchJobData> | null = null;

export function createWebhookDispatchQueue(): Queue<WebhookDispatchJobData> {
  if (_queue) return _queue;
  _queue = new Queue<WebhookDispatchJobData>(WEBHOOK_DISPATCH_QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: {
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  });
  return _queue;
}

export async function scheduleWebhookDispatchSweep(
  queue: Queue<WebhookDispatchJobData>,
): Promise<void> {
  await queue.add(
    WEBHOOK_DISPATCH_SWEEP_JOB_NAME,
    {},
    {
      repeat: { every: SWEEP_INTERVAL_MS },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  );
}

export interface EnqueueWebhookEventParams {
  orgId: string;
  /** Dotted event name, e.g. "ticket.created". */
  event: string;
  payload: Record<string, unknown>;
}

/**
 * Create a pending delivery row for every active subscriber to `event`.
 * Returns the number of deliveries created. Does nothing (0) when no
 * subscriber matches — the common case, so this is cheap.
 */
export async function enqueueWebhookEvent(
  db: Db,
  params: EnqueueWebhookEventParams,
): Promise<number> {
  const subscribers = await db
    .select({ id: webhooks.id })
    .from(webhooks)
    .where(
      and(
        eq(webhooks.orgId, params.orgId),
        eq(webhooks.isActive, true),
        arrayContains(webhooks.events, [params.event]),
      ),
    );

  if (subscribers.length === 0) return 0;

  await db.insert(webhookDeliveries).values(
    subscribers.map((s) => ({
      webhookId: s.id,
      event: params.event,
      payload: params.payload,
      status: "pending" as const,
    })),
  );

  return subscribers.length;
}

function signPayload(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** attempts, BACKOFF_CAP_MS);
}

export interface WebhookSweepResult {
  claimed: number;
  delivered: number;
  failed: number;
  exhausted: number;
}

/**
 * Core dispatch sweep. Exported for admin "flush now" endpoints and tests.
 *
 * Claims due deliveries (`pending`, or `retrying`/`failed` whose `nextRetryAt`
 * has elapsed) with `FOR UPDATE SKIP LOCKED`, flipping them to `retrying` in
 * the same statement, then POSTs each to its subscriber URL.
 *
 * `fetchImpl` is injectable so tests can supply a stub without a real server.
 */
export async function sweepPendingDeliveries(
  db: Db,
  fetchImpl: typeof fetch = fetch,
): Promise<WebhookSweepResult> {
  const result: WebhookSweepResult = { claimed: 0, delivered: 0, failed: 0, exhausted: 0 };

  const claimed = await db.execute(sql`
    WITH due AS (
      SELECT d.id
      FROM ${webhookDeliveries} d
      WHERE (
        d.status = 'pending'
        OR (d.status IN ('failed', 'retrying') AND d.next_retry_at IS NOT NULL AND d.next_retry_at <= NOW())
      )
      AND d.attempts < ${MAX_ATTEMPTS}
      ORDER BY d.created_at
      LIMIT ${SWEEP_BATCH_LIMIT}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE ${webhookDeliveries} d
    SET    status = 'retrying'
    FROM   due
    WHERE  d.id = due.id
    RETURNING d.id, d.webhook_id, d.event, d.payload, d.attempts
  `);

  const rows = (Array.isArray(claimed) ? claimed : ((claimed as { rows?: unknown[] }).rows ?? [])) as Array<{
    id: string;
    webhook_id: string;
    event: string;
    payload: Record<string, unknown>;
    attempts: number;
  }>;

  for (const del of rows) {
    result.claimed++;

    const [hook] = await db
      .select({ url: webhooks.url, secret: webhooks.secret, isActive: webhooks.isActive })
      .from(webhooks)
      .where(eq(webhooks.id, del.webhook_id));

    const attempts = del.attempts + 1;

    // Subscriber deleted or deactivated between enqueue and dispatch — mark
    // failed terminally (no point retrying a dead endpoint).
    if (!hook || !hook.isActive) {
      await db
        .update(webhookDeliveries)
        .set({ status: "failed", attempts, response: "subscriber inactive", completedAt: new Date() })
        .where(eq(webhookDeliveries.id, del.id));
      result.failed++;
      continue;
    }

    const rawBody = JSON.stringify({ event: del.event, payload: del.payload });
    const signature = signPayload(hook.secret, rawBody);

    let statusCode: number | null = null;
    let responseText = "";
    let ok = false;
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), POST_TIMEOUT_MS);
      try {
        const resp = await fetchImpl(hook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Coheron-Signature": `sha256=${signature}`,
            "X-Coheron-Delivery": del.id,
            "X-Coheron-Event": del.event,
          },
          body: rawBody,
          signal: ac.signal,
        });
        statusCode = resp.status;
        responseText = (await resp.text().catch(() => "")).slice(0, 2000);
        ok = resp.status >= 200 && resp.status < 300;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      responseText = (err as Error).message?.slice(0, 2000) ?? "request error";
    }

    if (ok) {
      await db
        .update(webhookDeliveries)
        .set({ status: "success", statusCode, response: responseText, attempts, completedAt: new Date() })
        .where(eq(webhookDeliveries.id, del.id));
      result.delivered++;
    } else if (attempts >= MAX_ATTEMPTS) {
      await db
        .update(webhookDeliveries)
        .set({ status: "failed", statusCode, response: responseText, attempts, completedAt: new Date() })
        .where(eq(webhookDeliveries.id, del.id));
      result.exhausted++;
    } else {
      await db
        .update(webhookDeliveries)
        .set({
          status: "failed",
          statusCode,
          response: responseText,
          attempts,
          nextRetryAt: new Date(Date.now() + backoffMs(attempts)),
        })
        .where(eq(webhookDeliveries.id, del.id));
      result.failed++;
    }
  }

  return result;
}

export function startWebhookDispatchWorker(db: Db): Worker<WebhookDispatchJobData> {
  const worker = new Worker<WebhookDispatchJobData>(
    WEBHOOK_DISPATCH_QUEUE_NAME,
    async (job: Job<WebhookDispatchJobData>) => {
      if (job.name !== WEBHOOK_DISPATCH_SWEEP_JOB_NAME) return;
      const t0 = Date.now();
      const r = await sweepPendingDeliveries(db);
      if (r.claimed > 0) {
        console.info(
          `[webhook-dispatch] sweep in ${Date.now() - t0}ms — claimed=${r.claimed} ` +
            `delivered=${r.delivered} failed=${r.failed} exhausted=${r.exhausted}`,
        );
      }
      return r;
    },
    { connection: redisConnection(), concurrency: 5 },
  );

  worker.on("failed", (job, err) => {
    console.error(`[webhook-dispatch] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
