import crypto from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * S3-compatible storage service. Works with AWS S3, Cloudflare R2, MinIO,
 * DigitalOcean Spaces — env-configurable.
 *
 * Production tenants on AWS get S3 + KMS-managed encryption. Dev / sandbox
 * runs against MinIO.
 */

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;
  // Accept both the AWS-SDK-style names (S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY)
  // and the shorter names used across the env templates (S3_ACCESS_KEY / S3_SECRET_KEY).
  const accessKeyId = process.env["S3_ACCESS_KEY_ID"] ?? process.env["S3_ACCESS_KEY"];
  const secretAccessKey = process.env["S3_SECRET_ACCESS_KEY"] ?? process.env["S3_SECRET_KEY"];
  // MinIO and other S3-compatible providers require path-style addressing; default it
  // on automatically whenever a custom endpoint is set, unless explicitly disabled.
  const forcePathStyle = process.env["S3_FORCE_PATH_STYLE"]
    ? process.env["S3_FORCE_PATH_STYLE"] === "true"
    : Boolean(process.env["S3_ENDPOINT"]);
  _client = new S3Client({
    region: process.env["S3_REGION"] ?? "ap-south-1",
    endpoint: process.env["S3_ENDPOINT"], // optional — for non-AWS providers
    forcePathStyle,
    credentials:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
  });
  return _client;
}

function bucket(): string {
  const b = process.env["S3_BUCKET"];
  if (!b) throw new Error("S3_BUCKET not configured");
  return b;
}

/**
 * Whether object storage is provisioned for this deployment. When false, every
 * store/fetch/delete would throw ("S3_BUCKET not configured"), so callers should
 * degrade gracefully — refuse an upload with a clear message rather than 500,
 * and skip signing/download rather than break the surrounding request. Some
 * deployments deliberately run without object storage; the DMS/avatars are then
 * unavailable but the rest of the product (incl. generated PDFs, which stream on
 * demand) is unaffected.
 */
export function isStorageConfigured(): boolean {
  return Boolean(process.env["S3_BUCKET"]);
}

export interface PutOptions {
  orgId: string;
  /** Logical key fragment, e.g. "documents/<docId>/v1.pdf". */
  key: string;
  body: Buffer;
  mimeType: string;
  /** SSE-S3 by default; flip to KMS for prod. */
  serverSideEncryption?: "AES256" | "aws:kms";
  kmsKeyId?: string;
}

export interface PutResult {
  key: string;
  sha256: string;
  sizeBytes: number;
}

export async function putObject(opts: PutOptions): Promise<PutResult> {
  const sha256 = crypto.createHash("sha256").update(opts.body).digest("hex");
  const fullKey = `${opts.orgId}/${opts.key.replace(/^\/+/, "")}`;
  const putCmd = new PutObjectCommand({
    Bucket: bucket(),
    Key: fullKey,
    Body: opts.body,
    ContentType: opts.mimeType,
    ChecksumSHA256: Buffer.from(sha256, "hex").toString("base64"),
    ServerSideEncryption: opts.serverSideEncryption ?? "AES256",
    ...(opts.kmsKeyId ? { SSEKMSKeyId: opts.kmsKeyId } : {}),
  });

  try {
    await getClient().send(putCmd);
  } catch (err: any) {
    if (err.name === "NoSuchBucket") {
      // Auto-create bucket for local dev (MinIO)
      await getClient().send(new CreateBucketCommand({ Bucket: bucket() }));
      await getClient().send(putCmd);
    } else {
      throw err;
    }
  }

  return { key: fullKey, sha256, sizeBytes: opts.body.length };
}

export async function signedDownloadUrl(key: string, ttlSeconds = 300): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: bucket(), Key: key });
  return getSignedUrl(getClient(), cmd, { expiresIn: ttlSeconds });
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/**
 * Enqueue a document for virus scanning. The actual scan runs in the
 * BullMQ "coheronconnect-doc-virusscan" queue (see workflows/virusScanWorkflow.ts)
 * which talks to a clamd sidecar over the INSTREAM protocol and writes
 * the result back to `documents.scanStatus` + `scanResult`.
 *
 * If the queue isn't booted (e.g. in unit tests where the workflow service
 * isn't initialised) this is a no-op so callers don't have to defensively
 * gate uploads. The actual queue producer lives in workflows/virusScanWorkflow.ts.
 */
export async function enqueueVirusScan(documentId: string): Promise<void> {
  if (process.env["VIRUS_SCAN_DISABLED"] === "true") return;
  try {
    const { createVirusScanQueue, enqueueVirusScanJob } = await import(
      "../workflows/virusScanWorkflow.js"
    );
    await enqueueVirusScanJob(createVirusScanQueue(), documentId);
  } catch (err) {
    console.warn("[storage] enqueueVirusScan failed (non-fatal):", (err as Error).message);
  }
}

/**
 * Build the canonical key for a versioned document.
 */
export function buildDocumentKey(documentId: string, version: number, ext: string): string {
  const safeExt = ext.replace(/[^a-z0-9.]/gi, "");
  return `documents/${documentId}/v${version}${safeExt ? "." + safeExt : ""}`;
}
