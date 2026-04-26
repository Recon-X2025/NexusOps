import { router, permissionProcedure, adminProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  documents,
  documentVersions,
  documentAcls,
  eq,
  and,
  desc,
  isNull,
} from "@nexusops/db";
import {
  putObject,
  signedDownloadUrl,
  buildDocumentKey,
  enqueueVirusScan,
} from "../services/storage";

/**
 * DMS router. All file attachments across NexusOps go through this.
 *
 * Upload flow (chunked uploads will follow in v1.1):
 *   1. Client base64-encodes file → uploads via tRPC `upload` (≤ 25 MB).
 *   2. Server writes to object store, creates a `documents` row + first
 *      `document_versions` row, enqueues virus scan, returns the doc id.
 *   3. Source modules (tickets, contracts, …) reference the doc id.
 */
export const documentsRouter = router({
  list: permissionProcedure("settings", "read")
    .input(
      z.object({
        sourceType: z.string().optional(),
        sourceId: z.string().uuid().optional(),
        folderPath: z.string().optional(),
        limit: z.coerce.number().default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(documents.orgId, org!.id), isNull(documents.deletedAt)];
      if (input.sourceType) conditions.push(eq(documents.sourceType, input.sourceType));
      if (input.sourceId) conditions.push(eq(documents.sourceId, input.sourceId));
      if (input.folderPath) conditions.push(eq(documents.folderPath, input.folderPath));
      return db
        .select()
        .from(documents)
        .where(and(...conditions))
        .orderBy(desc(documents.createdAt))
        .limit(input.limit);
    }),

  get: permissionProcedure("settings", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [doc] = await db
        .select()
        .from(documents)
        .where(and(eq(documents.id, input.id), eq(documents.orgId, org!.id)))
        .limit(1);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
      const versions = await db
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.documentId, doc.id))
        .orderBy(desc(documentVersions.version));
      return { ...doc, versions };
    }),

  /**
   * Upload a small file (≤ 25 MB) inline.
   * Returns the document row + a short-lived signed download URL.
   */
  upload: permissionProcedure("settings", "write")
    .input(
      z.object({
        name: z.string().min(1).max(512),
        mimeType: z.string().min(1).max(128),
        contentBase64: z.string().min(1),
        sourceType: z.string().optional(),
        sourceId: z.string().uuid().optional(),
        folderPath: z.string().optional(),
        classification: z
          .enum(["public", "internal", "confidential", "restricted", "pii"])
          .default("internal"),
        retentionPolicyId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const body = Buffer.from(input.contentBase64, "base64");
      if (body.length > 25 * 1024 * 1024) {
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: "Use chunked upload for files > 25MB (v1.1)",
        });
      }
      const ext = input.name.split(".").pop() ?? "";

      const [doc] = await db
        .insert(documents)
        .values({
          orgId: org!.id,
          name: input.name,
          mimeType: input.mimeType,
          sizeBytes: body.length,
          storageKey: "", // populated after putObject below
          sha256: "", // ditto
          currentVersion: 1,
          folderPath: input.folderPath ?? null,
          classification: input.classification,
          scanStatus: "pending",
          retentionPolicyId: input.retentionPolicyId ?? null,
          sourceType: input.sourceType ?? null,
          sourceId: input.sourceId ?? null,
          ownerId: user!.id,
        })
        .returning();

      const key = buildDocumentKey(doc.id, 1, ext);
      const put = await putObject({
        orgId: org!.id,
        key,
        body,
        mimeType: input.mimeType,
      });

      await db
        .update(documents)
        .set({ storageKey: put.key, sha256: put.sha256, updatedAt: new Date() })
        .where(eq(documents.id, doc.id));

      await db.insert(documentVersions).values({
        documentId: doc.id,
        version: 1,
        storageKey: put.key,
        sha256: put.sha256,
        sizeBytes: put.sizeBytes,
        uploadedById: user!.id,
      });

      await enqueueVirusScan(doc.id);

      const downloadUrl = await signedDownloadUrl(put.key, 300);
      return { id: doc.id, version: 1, downloadUrl, sha256: put.sha256 };
    }),

  /** Add a new version to an existing document. */
  addVersion: permissionProcedure("settings", "write")
    .input(
      z.object({
        documentId: z.string().uuid(),
        contentBase64: z.string().min(1),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [doc] = await db
        .select()
        .from(documents)
        .where(and(eq(documents.id, input.documentId), eq(documents.orgId, org!.id)))
        .limit(1);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
      const body = Buffer.from(input.contentBase64, "base64");
      const ext = doc.name.split(".").pop() ?? "";
      const nextVersion = doc.currentVersion + 1;
      const key = buildDocumentKey(doc.id, nextVersion, ext);
      const put = await putObject({
        orgId: org!.id,
        key,
        body,
        mimeType: doc.mimeType,
      });
      await db.insert(documentVersions).values({
        documentId: doc.id,
        version: nextVersion,
        storageKey: put.key,
        sha256: put.sha256,
        sizeBytes: put.sizeBytes,
        uploadedById: user!.id,
        notes: input.notes ?? null,
      });
      await db
        .update(documents)
        .set({
          currentVersion: nextVersion,
          storageKey: put.key,
          sha256: put.sha256,
          sizeBytes: put.sizeBytes,
          updatedAt: new Date(),
          scanStatus: "pending",
        })
        .where(eq(documents.id, doc.id));
      await enqueueVirusScan(doc.id);
      return { version: nextVersion };
    }),

  /** Get a short-lived signed URL to download the current version. */
  getDownloadUrl: permissionProcedure("settings", "read")
    .input(z.object({ id: z.string().uuid(), ttlSeconds: z.number().min(30).max(3600).default(300) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [doc] = await db
        .select()
        .from(documents)
        .where(and(eq(documents.id, input.id), eq(documents.orgId, org!.id)))
        .limit(1);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
      if (doc.scanStatus === "infected") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Document failed virus scan" });
      }
      const url = await signedDownloadUrl(doc.storageKey, input.ttlSeconds);
      return { url, expiresIn: input.ttlSeconds };
    }),

  /**
   * Soft delete — sets deletedAt. The retention worker hard-deletes after
   * the retention policy duration unless legalHold = true.
   */
  delete: permissionProcedure("settings", "delete")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [doc] = await db
        .select()
        .from(documents)
        .where(and(eq(documents.id, input.id), eq(documents.orgId, org!.id)))
        .limit(1);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
      if (doc.legalHold) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Document on legal hold" });
      }
      await db
        .update(documents)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(documents.id, input.id));
      return { ok: true };
    }),

  grantAcl: permissionProcedure("settings", "admin")
    .input(
      z.object({
        documentId: z.string().uuid(),
        principalType: z.enum(["user", "role", "team", "everyone_in_org"]),
        principalId: z.string().uuid().optional(),
        permission: z.enum(["read", "write", "delete", "share"]),
        expiresAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, user } = ctx;
      await db.insert(documentAcls).values({
        documentId: input.documentId,
        principalType: input.principalType,
        principalId: input.principalId ?? null,
        permission: input.permission,
        grantedById: user!.id,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      });
      return { ok: true };
    }),

  /**
   * Admin trigger — run the retention sweeper on demand. Hard-deletes every
   * soft-deleted document past its retention window (legal-hold rows are
   * skipped). Use sparingly; the daily cron does this automatically.
   */
  runRetentionSweepNow: adminProcedure
    .input(z.object({ batchSize: z.number().int().min(1).max(5000).default(500) }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const { runRetentionSweep } = await import("../workflows/documentRetentionWorkflow.js");
      return runRetentionSweep(db, input.batchSize);
    }),
});
