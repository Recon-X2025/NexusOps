/**
 * notificationDispatchWorkflow.ts — Fan-out worker for external notification
 * channels (currently Slack).
 *
 * Why a worker, not an inline call:
 * - External webhook POSTs are slow + flaky. Doing them inline in a request
 *   handler couples the user's action latency to Slack's availability. The
 *   in-app + email path (services/notifications.ts) stays synchronous and
 *   fast; the external fan-out is enqueued and processed durably here.
 * - BullMQ gives us retries with back-off and survives API restarts (Redis).
 *
 * Guarantees:
 * - Best-effort: a missing/disconnected integration is a no-op success, not a
 *   failure (we don't want to retry forever for orgs that never connected Slack).
 * - Idempotent enqueue: caller may pass a dedupeKey to collapse duplicates.
 * - Retries: 3 attempts with exponential back-off for genuine transport errors.
 */
import { Queue, Worker, type Job } from "bullmq";
import {
  type Db,
  integrations,
  eq,
  and,
} from "@coheronconnect/db";
import { decryptIntegrationConfig } from "../services/encryption";
import { getIntegrationAdapter } from "../services/integrations/registry";
import type { SlackConfig, SlackMessage } from "../services/integrations/slack";

/** BullMQ-compatible Redis connection config derived from REDIS_URL env var. */
function redisConnection() {
  const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  return { url };
}

export interface NotificationDispatchJobData {
  orgId: string;
  /** Channels to fan out to. Currently only "slack" is wired. */
  channels: Array<"slack">;
  title: string;
  body: string;
  /** App-relative link (e.g. "/tickets/123"); resolved to absolute below. */
  link?: string;
  type?: "info" | "warning" | "success" | "error";
  /** Optional dedupe key — collapses duplicate enqueues into one job. */
  dedupeKey?: string;
}

export const NOTIFICATION_DISPATCH_QUEUE_NAME = "coheronconnect-notification-dispatch";

/** Create the notification fan-out queue (caller owns the Redis connection). */
export function createNotificationDispatchQueue(): Queue<NotificationDispatchJobData> {
  return new Queue(NOTIFICATION_DISPATCH_QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  });
}

/** Enqueue an external-channel fan-out. Never throws on the caller's path. */
export async function enqueueNotificationDispatch(
  queue: Queue<NotificationDispatchJobData>,
  data: NotificationDispatchJobData,
): Promise<void> {
  const opts = data.dedupeKey ? { jobId: `notify-${data.dedupeKey}` } : {};
  await queue.add("dispatch", data, opts);
}

/** Resolve + decrypt a connected integration config for an org, or null. */
async function getConnectedConfig(
  db: Db,
  orgId: string,
  provider: string,
): Promise<Record<string, string> | null> {
  const [row] = await db
    .select({ configEncrypted: integrations.configEncrypted, status: integrations.status })
    .from(integrations)
    .where(and(eq(integrations.orgId, orgId), eq(integrations.provider, provider)));
  if (!row || row.status !== "connected" || !row.configEncrypted) return null;
  try {
    return decryptIntegrationConfig(row.configEncrypted);
  } catch (err) {
    console.error(`[notify:dispatch] Failed to decrypt ${provider} config for org ${orgId}:`, err);
    return null;
  }
}

/** Dispatch a single job's payload to Slack (if connected for the org). */
async function dispatchSlack(db: Db, data: NotificationDispatchJobData): Promise<void> {
  const config = (await getConnectedConfig(db, data.orgId, "slack")) as SlackConfig | null;
  if (!config) return; // Not connected — best-effort no-op.

  const adapter = getIntegrationAdapter("slack");
  if (!adapter?.send) return;

  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000";
  const message: SlackMessage = {
    title: data.title,
    body: data.body,
    ...(data.link ? { link: `${appUrl}${data.link}` } : {}),
    ...(data.type ? { type: data.type } : {}),
  };
  await adapter.send(config, message as never);
}

/** Start the notification fan-out worker. Call once at server boot. */
export function startNotificationDispatchWorker(db: Db): Worker<NotificationDispatchJobData> {
  return new Worker<NotificationDispatchJobData>(
    NOTIFICATION_DISPATCH_QUEUE_NAME,
    async (job: Job<NotificationDispatchJobData>) => {
      const { channels } = job.data;
      for (const channel of channels) {
        if (channel === "slack") {
          await dispatchSlack(db, job.data);
        }
      }
    },
    {
      connection: redisConnection(),
      concurrency: 5,
    },
  );
}
