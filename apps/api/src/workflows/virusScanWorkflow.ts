/**
 * virusScanWorkflow.ts — BullMQ queue + worker for document virus scanning.
 *
 * Pipeline:
 *   uploadDocument()
 *     → enqueueVirusScan(documentId)            ← producer (storage.ts)
 *       → BullMQ "coheronconnect-doc-virusscan"
 *         → scanWorker pulls object from S3
 *           → streams it to ClamAV (`clamd` TCP)
 *             → updates documents.scanStatus    ← clean | infected | failed
 *
 * Retries: 3 attempts with exponential back-off. On terminal failure
 * (e.g. ClamAV unreachable, object disappeared), status is set to
 * "failed" so the UI can surface it instead of being stuck on "pending".
 *
 * The worker is no-op-safe: when CLAMAV_HOST is unset (e.g. dev / CI
 * without the sidecar), each job is marked "skipped" and logged once.
 */
import { Queue, Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import net from "node:net";
import { Readable } from "node:stream";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { documents, documentVersions } from "@coheronconnect/db";
import type { Db } from "@coheronconnect/db";

function redisConnection() {
  const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  return { url };
}

export interface VirusScanJobData {
  documentId: string;
  /** Optional explicit version to scan. If unset, scans the latest version. */
  versionNumber?: number;
}

export const VIRUS_SCAN_QUEUE_NAME = "coheronconnect-doc-virusscan";

let _queue: Queue<VirusScanJobData> | null = null;

export function createVirusScanQueue(): Queue<VirusScanJobData> {
  if (_queue) return _queue;
  _queue = new Queue<VirusScanJobData>(VIRUS_SCAN_QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  });
  return _queue;
}

/**
 * Producer entry point — replaces the legacy stub in `services/storage.ts`.
 * Idempotent on (documentId, versionNumber).
 */
export async function enqueueVirusScanJob(
  queue: Queue<VirusScanJobData>,
  documentId: string,
  versionNumber?: number,
): Promise<void> {
  const jobId = versionNumber
    ? `vscan:${documentId}:v${versionNumber}`
    : `vscan:${documentId}`;
  await queue.add("scan", { documentId, versionNumber }, { jobId });
}

// ── ClamAV client (clamd INSTREAM protocol over TCP) ──────────────────────

interface ClamScanResult {
  ok: boolean;
  /** Virus signature on detection, e.g. "Eicar-Test-Signature". */
  threat?: string;
  /** Raw clamd response for diagnostics. */
  response: string;
}

async function clamdInstreamScan(buffer: Buffer): Promise<ClamScanResult> {
  const host = process.env["CLAMAV_HOST"];
  const port = Number(process.env["CLAMAV_PORT"] ?? 3310);
  if (!host) throw new Error("CLAMAV_HOST not configured");

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let response = "";

    socket.setTimeout(30_000);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("clamd: socket timeout (30s)"));
    });
    socket.on("error", reject);

    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      // INSTREAM expects [size:u32 BE][chunk]…[size=0]. Use 64KB chunks.
      const CHUNK = 64 * 1024;
      for (let off = 0; off < buffer.length; off += CHUNK) {
        const slice = buffer.subarray(off, Math.min(off + CHUNK, buffer.length));
        const sz = Buffer.alloc(4);
        sz.writeUInt32BE(slice.length, 0);
        socket.write(sz);
        socket.write(slice);
      }
      const eof = Buffer.alloc(4);
      eof.writeUInt32BE(0, 0);
      socket.write(eof);
    });

    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
    });
    socket.on("close", () => {
      const trimmed = response.replace(/\0/g, "").trim();
      if (/\bOK$/m.test(trimmed)) {
        resolve({ ok: true, response: trimmed });
        return;
      }
      const found = trimmed.match(/:\s*(.+?)\s+FOUND$/m);
      if (found) {
        resolve({ ok: false, threat: found[1], response: trimmed });
        return;
      }
      reject(new Error(`clamd: unexpected response: ${trimmed}`));
    });
  });
}

// ── Object fetch helper (mirrors services/storage.ts but stays isolated) ──

let _s3: S3Client | null = null;
function s3(): S3Client {
  if (_s3) return _s3;
  _s3 = new S3Client({
    region: process.env["S3_REGION"] ?? "ap-south-1",
    endpoint: process.env["S3_ENDPOINT"],
    forcePathStyle: process.env["S3_FORCE_PATH_STYLE"] === "true",
    credentials:
      process.env["S3_ACCESS_KEY_ID"] && process.env["S3_SECRET_ACCESS_KEY"]
        ? {
            accessKeyId: process.env["S3_ACCESS_KEY_ID"],
            secretAccessKey: process.env["S3_SECRET_ACCESS_KEY"],
          }
        : undefined,
  });
  return _s3;
}

async function fetchObject(key: string): Promise<Buffer> {
  const bucket = process.env["S3_BUCKET"];
  if (!bucket) throw new Error("S3_BUCKET not configured");
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  const res = await s3().send(cmd);
  const stream = res.Body as Readable | undefined;
  if (!stream) throw new Error("S3 object body missing");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

// ── Worker ────────────────────────────────────────────────────────────────

let _warnedNoClam = false;

export async function processScanJob(
  db: Db,
  job: Job<VirusScanJobData>,
): Promise<{ status: "clean" | "infected" | "skipped" | "failed"; detail?: string }> {
  const { documentId, versionNumber } = job.data;

  // Resolve the storage key for the requested version (or latest).
  const versions = await db
    .select({
      id: documentVersions.id,
      version: documentVersions.version,
      storageKey: documentVersions.storageKey,
    })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(documentVersions.version);

  const target = versionNumber
    ? versions.find((v) => v.version === versionNumber)
    : versions[versions.length - 1];

  if (!target) {
    return { status: "failed", detail: `No version found for document ${documentId}` };
  }

  // Sidecar absent → skip cleanly. Useful for dev / CI / air-gapped.
  if (!process.env["CLAMAV_HOST"]) {
    if (!_warnedNoClam) {
      console.warn(
        "[virus-scan] CLAMAV_HOST not configured — marking documents as 'skipped'. " +
          "Set CLAMAV_HOST/CLAMAV_PORT and run the clamd sidecar to enable scanning.",
      );
      _warnedNoClam = true;
    }
    return { status: "skipped", detail: "clamd not configured" };
  }

  let buffer: Buffer;
  try {
    buffer = await fetchObject(target.storageKey);
  } catch (err) {
    const msg = (err as Error).message;
    return { status: "failed", detail: `Fetch failed: ${msg}` };
  }

  const result = await clamdInstreamScan(buffer);
  if (result.ok) return { status: "clean" };
  return { status: "infected", detail: result.threat ?? "unknown threat" };
}

export function startVirusScanWorker(db: Db): Worker<VirusScanJobData> {
  const worker = new Worker<VirusScanJobData>(
    VIRUS_SCAN_QUEUE_NAME,
    async (job) => {
      const result = await processScanJob(db, job);

      // Persist scan result on the document row. We deliberately do NOT
      // touch storage for infected files here — quarantine/delete is a
      // separate workflow that an admin can drive from the UI once we
      // see real signal.
      await db
        .update(documents)
        .set({
          scanStatus: result.status,
          scanResult: {
            status: result.status,
            scannedAt: new Date().toISOString(),
            detail: result.detail ?? null,
            attempt: job.attemptsMade + 1,
          },
          updatedAt: new Date(),
        })
        .where(eq(documents.id, job.data.documentId));

      return result;
    },
    {
      connection: redisConnection(),
      concurrency: Number(process.env["VIRUS_SCAN_CONCURRENCY"] ?? 4),
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`[virus-scan] Job ${job?.id} failed:`, err.message);
    // After exhausting retries, mark the document as 'failed' so it
    // shows up in the UI and admins can re-enqueue.
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      const docId = job.data.documentId;
      void db
        .update(documents)
        .set({
          scanStatus: "failed",
          scanResult: {
            status: "failed",
            scannedAt: new Date().toISOString(),
            detail: err.message.slice(0, 500),
            terminal: true,
          },
          updatedAt: new Date(),
        })
        .where(eq(documents.id, docId))
        .catch((e) => console.error("[virus-scan] terminal-fail update error:", e));
    }
  });

  return worker;
}
