/**
 * ticketEmbeddingWorkflow.ts — BullMQ queue + worker to backfill ticket embeddings.
 *
 * Triggers:
 * - ticket.created
 * - ticket.resolved (or resolution notes change)
 *
 * Writes:
 * - tickets.embeddingVector as JSON string of number[]
 *
 * NOTE: This uses a lightweight deterministic embedding (hashing trick) so we
 * can ship the pipeline without introducing a heavyweight model dependency.
 */
import { Queue, Worker, type Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import type { Db } from "@coheronconnect/db";
import { tickets } from "@coheronconnect/db";
import { embedTextHashing } from "../services/embeddings";

function redisConnection() {
  const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  return { url };
}

export interface TicketEmbeddingJobData {
  orgId: string;
  ticketId: string;
  reason: "created" | "resolved" | "updated";
}

export const TICKET_EMBEDDING_QUEUE_NAME = "coheronconnect-ticket-embedding";

let _queue: Queue<TicketEmbeddingJobData> | null = null;

export function createTicketEmbeddingQueue(): Queue<TicketEmbeddingJobData> {
  if (_queue) return _queue;
  _queue = new Queue<TicketEmbeddingJobData>(TICKET_EMBEDDING_QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { count: 1_000 },
      removeOnFail: { count: 300 },
    },
  });
  return _queue;
}

export async function enqueueTicketEmbeddingJob(
  queue: Queue<TicketEmbeddingJobData>,
  data: TicketEmbeddingJobData,
): Promise<void> {
  const jobId = `tkt-emb:${data.orgId}:${data.ticketId}:${data.reason}`;
  await queue.add("embed", data, { jobId });
}

async function processEmbeddingJob(db: Db, data: TicketEmbeddingJobData): Promise<void> {
  const [t] = await db
    .select({
      id: tickets.id,
      title: tickets.title,
      description: tickets.description,
      resolutionNotes: tickets.resolutionNotes,
    })
    .from(tickets)
    .where(and(eq(tickets.orgId, data.orgId), eq(tickets.id, data.ticketId)))
    .limit(1);

  if (!t) return;

  const text = [
    t.title ?? "",
    t.description ?? "",
    t.resolutionNotes ? `Resolution: ${t.resolutionNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const vec = embedTextHashing(text, 256);
  await db
    .update(tickets)
    .set({ embeddingVector: JSON.stringify(vec), updatedAt: new Date() })
    .where(and(eq(tickets.orgId, data.orgId), eq(tickets.id, data.ticketId)));
}

export function startTicketEmbeddingWorker(db: Db): Worker<TicketEmbeddingJobData> {
  const worker = new Worker<TicketEmbeddingJobData>(
    TICKET_EMBEDDING_QUEUE_NAME,
    async (job: Job<TicketEmbeddingJobData>) => {
      await processEmbeddingJob(db, job.data);
    },
    { connection: redisConnection() },
  );
  return worker;
}

