/**
 * notificationDispatchWorkflow.ts — Fan-out worker for external notification
 * channels (Slack + SMS via MSG91).
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
import { decryptIntegrationConfigEnvelope } from "../services/encryption";
import { getIntegrationAdapter } from "../services/integrations/registry";
import type { SlackConfig, SlackMessage } from "../services/integrations/slack";
import type { SmsMessage } from "../services/integrations/sms-msg91";

/** BullMQ-compatible Redis connection config derived from REDIS_URL env var. */
function redisConnection() {
  const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  return { url };
}

export type NotificationDispatchChannel = "slack" | "sms";

/**
 * SMS is DLT-gated (TRAI): MSG91 will only deliver against a registered
 * template id + variables to an E.164 recipient — it can't send free-form
 * `title`/`body` text. So an SMS fan-out must carry its own payload; a job that
 * lists "sms" in `channels` but omits `sms` is a no-op for that channel.
 */
export interface SmsDispatchPayload {
  /** E.164 recipient (e.g. +919876543210). */
  to: string;
  /** DLT-registered template id. */
  templateId: string;
  /** Template variables (name→value) the DLT template expects. */
  variables: Record<string, string>;
}

export interface NotificationDispatchJobData {
  orgId: string;
  /** Channels to fan out to. "slack" and "sms" are wired. */
  channels: NotificationDispatchChannel[];
  title: string;
  body: string;
  /** App-relative link (e.g. "/tickets/123"); resolved to absolute below. */
  link?: string;
  type?: "info" | "warning" | "success" | "error";
  /** DLT-compliant SMS payload; required when "sms" is in `channels`. */
  sms?: SmsDispatchPayload;
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
    return await decryptIntegrationConfigEnvelope(row.configEncrypted);
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

/** Dispatch a single job's SMS payload via MSG91 (if connected for the org). */
async function dispatchSms(db: Db, data: NotificationDispatchJobData): Promise<void> {
  // No SMS payload → nothing DLT-compliant to send; treat as a no-op success.
  if (!data.sms) return;

  const config = await getConnectedConfig(db, data.orgId, "sms_msg91");
  if (!config) return; // Not connected — best-effort no-op.

  const adapter = getIntegrationAdapter("sms_msg91");
  if (!adapter?.send) return;

  const message: SmsMessage = {
    to: data.sms.to,
    templateId: data.sms.templateId,
    variables: data.sms.variables,
  };
  await adapter.send(config, message as never);
}

/**
 * Fan a single dispatch payload out to its requested channels. Extracted from
 * the worker so it can be driven directly (without Redis) — each channel is
 * best-effort: an unconnected integration or a missing SMS payload is a no-op,
 * not a failure.
 */
export async function runNotificationDispatch(
  db: Db,
  data: NotificationDispatchJobData,
): Promise<void> {
  for (const channel of data.channels) {
    if (channel === "slack") {
      await dispatchSlack(db, data);
    } else if (channel === "sms") {
      await dispatchSms(db, data);
    }
  }
}

/** Start the notification fan-out worker. Call once at server boot. */
export function startNotificationDispatchWorker(db: Db): Worker<NotificationDispatchJobData> {
  return new Worker<NotificationDispatchJobData>(
    NOTIFICATION_DISPATCH_QUEUE_NAME,
    async (job: Job<NotificationDispatchJobData>) => {
      await runNotificationDispatch(db, job.data);
    },
    {
      connection: redisConnection(),
      concurrency: 5,
    },
  );
}
