import crypto from "node:crypto";
import multer from "multer";
import { getDb, storedFiles, eq } from "@coheronconnect/db";

/**
 * In-Database file storage service powered by PostgreSQL and Multer.
 * Stores binary files directly in the `stored_files` table (BYTEA) via Drizzle,
 * eliminating local directory dependencies completely so files persist across
 * code deployments and container restarts.
 */

export function isStorageConfigured(): boolean {
  return process.env["STORAGE_DISABLED"] !== "true";
}

export interface PutOptions {
  orgId: string;
  /** Logical key fragment, e.g. "documents/<docId>/v1.pdf". */
  key: string;
  body: Buffer;
  mimeType: string;
  serverSideEncryption?: "AES256" | "aws:kms";
  kmsKeyId?: string;
}

export interface PutResult {
  key: string;
  sha256: string;
  sizeBytes: number;
}

export interface StoredFileRecord {
  storageKey: string;
  data: Buffer;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

/**
 * Writes file binary buffer directly into the PostgreSQL `stored_files` table.
 * Returns metadata (key, sha256, sizeBytes) saved in documents/versions/users tables.
 */
export async function putObject(opts: PutOptions): Promise<PutResult> {
  const sha256 = crypto.createHash("sha256").update(opts.body).digest("hex");
  const fullKey = `${opts.orgId}/${opts.key.replace(/^\/+/, "")}`;
  const db = getDb();

  await db
    .insert(storedFiles)
    .values({
      storageKey: fullKey,
      data: opts.body,
      mimeType: opts.mimeType,
      sizeBytes: opts.body.length,
      sha256,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: storedFiles.storageKey,
      set: {
        data: opts.body,
        mimeType: opts.mimeType,
        sizeBytes: opts.body.length,
        sha256,
        updatedAt: new Date(),
      },
    });

  return { key: fullKey, sha256, sizeBytes: opts.body.length };
}

/**
 * Fetch file binary directly from PostgreSQL as a Buffer.
 * Used by virus scanning workflow and internal processors.
 */
export async function getObject(key: string): Promise<Buffer> {
  const file = await getStoredFile(key);
  if (!file) {
    throw new Error(`Stored file not found: ${key}`);
  }
  return file.data;
}

/**
 * Retrieve the full file record with binary data and MIME type from PostgreSQL.
 */
export async function getStoredFile(key: string): Promise<StoredFileRecord | null> {
  const cleanKey = key.replace(/^\/+/, "");
  const db = getDb();

  const [row] = await db
    .select({
      storageKey: storedFiles.storageKey,
      data: storedFiles.data,
      mimeType: storedFiles.mimeType,
      sizeBytes: storedFiles.sizeBytes,
      sha256: storedFiles.sha256,
    })
    .from(storedFiles)
    .where(eq(storedFiles.storageKey, cleanKey))
    .limit(1);

  if (!row) return null;
  return row as StoredFileRecord;
}

/**
 * Generates API download URL referencing the database-backed file.
 */
export async function signedDownloadUrl(key: string, _ttlSeconds = 300): Promise<string> {
  const cleanKey = key.replace(/^\/+/, "");
  const apiBase = process.env["API_URL"] ?? "";
  return `${apiBase}/api/files/${encodeURIComponent(cleanKey)}`;
}

/**
 * Delete a file directly from PostgreSQL stored_files table.
 * Used by the document retention sweeper during hard-delete.
 */
export async function deleteObject(key: string): Promise<void> {
  const cleanKey = key.replace(/^\/+/, "");
  const db = getDb();
  await db.delete(storedFiles).where(eq(storedFiles.storageKey, cleanKey));
}

/**
 * Enqueue a document for virus scanning.
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
  const cleanExt = ext.replace(/^\.+/, "");
  const safeExt = cleanExt.replace(/[^a-z0-9.]/gi, "");
  return `documents/${documentId}/v${version}${safeExt ? "." + safeExt : ""}`;
}

// ── Multer Configuration (In-Memory Buffer Storage) ───────────────────────

/**
 * Memory storage keeps incoming files in RAM buffer (file.buffer),
 * avoiding any writing to ephemeral local disk.
 */
export const multerStorage = multer.memoryStorage();

export const multerUpload = multer({
  storage: multerStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max
});
