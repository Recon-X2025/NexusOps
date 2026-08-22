import { router, permissionProcedure, protectedProcedure, adminProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assertSameOrg } from "../lib/assert-same-org";
import {
  documents,
  users,
  roles,
  teams,
  documentVersions,
  documentAcls,
  documentRetentionPolicies,
  eq,
  and,
  desc,
  asc,
  isNull,
  count,
} from "@coheronconnect/db";
import {
  putObject,
  signedDownloadUrl,
  buildDocumentKey,
  enqueueVirusScan,
} from "../services/storage";
import { checkDbUserPermission } from "../lib/rbac-db";

/**
 * DMS router. All file attachments across CoheronConnect go through this.
 *
 * Upload flow (chunked uploads will follow in v1.1):
 *   1. Client base64-encodes file → uploads via tRPC `upload` (≤ 25 MB).
 *   2. Server writes to object store, creates a `documents` row + first
 *      `document_versions` row, enqueues virus scan, returns the doc id.
 *   3. Source modules (tickets, contracts, …) reference the doc id.
 */
export const documentsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        sourceType: z.string().optional(),
        sourceId: z.string().uuid().optional(),
        folderPath: z.string().optional(),
        limit: z.coerce.number().default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      
      const moduleMap: Record<string, import("@coheronconnect/types").Module> = {
        "form16": "hr",
        "hr.policies": "hr",
        "recruitment.offers": "recruitment",
        "secretarial.resolutions": "secretarial",
        "procurement.vendor-onboarding": "procurement",
      };
      const moduleName = input.sourceType ? (moduleMap[input.sourceType] ?? "settings") : "settings";
      const hasPerm = checkDbUserPermission(user!.role, moduleName, "read", user!.matrixRole as string | undefined);
      if (!hasPerm) throw new TRPCError({ code: "FORBIDDEN", message: `Missing read permission for ${moduleName}` });

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
      if (!doc) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create document" });

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
      const { db, org, user } = ctx;
      // `document_acls` carries no `org_id` and so has no RLS behind it; this
      // filter is the only wall against granting on another tenant's document.
      // NOTE: nothing in the codebase READS `document_acls` — ACLs are not
      // enforced anywhere. This scopes the write; it does not make the feature
      // real. See docs/PLAN-*.md item 0.
      const [doc] = await db
        .select({ id: documents.id })
        .from(documents)
        .where(and(eq(documents.id, input.documentId), eq(documents.orgId, org!.id)))
        .limit(1);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });

      // The principal is a foreign key too, and which table it points at depends
      // on principalType. `everyone_in_org` carries no principalId at all.
      if (input.principalId) {
        const principalTable =
          input.principalType === "user" ? users
          : input.principalType === "role" ? roles
          : input.principalType === "team" ? teams
          : null;
        if (principalTable) {
          await assertSameOrg(db, principalTable, input.principalId, org!.id, "Principal");
        }
      }

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
   * Retention policies — the tenant-facing surface for the sweeper.
   *
   * The sweeper (`documentRetentionWorkflow`) hard-deletes soft-deleted
   * documents once they are older than their policy's `durationDays`, or
   * RETENTION_DEFAULT_DAYS (90) when no policy is attached. Until this
   * sub-router existed nothing wrote `document_retention_policies`, so that
   * 90-day default was unreachable and the policy-level `legalHold` flag —
   * the only way to pin a whole class of documents — could never be set.
   */
  retention: router({
    list: permissionProcedure("settings", "read").query(async ({ ctx }) => {
      const { db, org } = ctx;
      const policies = await db
        .select()
        .from(documentRetentionPolicies)
        .where(eq(documentRetentionPolicies.orgId, org!.id))
        .orderBy(asc(documentRetentionPolicies.name));

      // Attach usage so the UI can say what a delete would actually release.
      const usage = await db
        .select({ policyId: documents.retentionPolicyId, n: count() })
        .from(documents)
        .where(and(eq(documents.orgId, org!.id), isNull(documents.deletedAt)))
        .groupBy(documents.retentionPolicyId);
      const byId = new Map(usage.map((u) => [u.policyId, Number(u.n)]));

      return {
        policies: policies.map((p) => ({ ...p, documentCount: byId.get(p.id) ?? 0 })),
        /** What documents with no policy get. Shown so the default is not invisible. */
        defaultDurationDays: Number(process.env["RETENTION_DEFAULT_DAYS"] ?? 90),
      };
    }),

    create: permissionProcedure("settings", "write")
      .input(
        z.object({
          name: z.string().trim().min(1).max(120),
          description: z.string().trim().max(500).optional(),
          // A 0-day policy would delete a document the moment it is soft-deleted.
          durationDays: z.number().int().min(1).max(36_500),
          legalHold: z.boolean().default(false),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [existing] = await db
          .select({ id: documentRetentionPolicies.id })
          .from(documentRetentionPolicies)
          .where(
            and(
              eq(documentRetentionPolicies.orgId, org!.id),
              eq(documentRetentionPolicies.name, input.name),
            ),
          );
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `A retention policy named "${input.name}" already exists.`,
          });
        }
        const [created] = await db
          .insert(documentRetentionPolicies)
          .values({
            orgId: org!.id,
            name: input.name,
            description: input.description ?? null,
            durationDays: input.durationDays,
            legalHold: input.legalHold,
          })
          .returning();
        return created;
      }),

    update: permissionProcedure("settings", "write")
      .input(
        z.object({
          id: z.string().uuid(),
          name: z.string().trim().min(1).max(120).optional(),
          description: z.string().trim().max(500).nullable().optional(),
          durationDays: z.number().int().min(1).max(36_500).optional(),
          legalHold: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { id, ...rest } = input;
        const [target] = await db
          .select({ id: documentRetentionPolicies.id })
          .from(documentRetentionPolicies)
          .where(
            and(eq(documentRetentionPolicies.id, id), eq(documentRetentionPolicies.orgId, org!.id)),
          );
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Retention policy not found" });

        const [updated] = await db
          .update(documentRetentionPolicies)
          .set(rest)
          .where(
            and(eq(documentRetentionPolicies.id, id), eq(documentRetentionPolicies.orgId, org!.id)),
          )
          .returning();
        return updated;
      }),

    remove: permissionProcedure("settings", "delete")
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [target] = await db
          .select({ id: documentRetentionPolicies.id, name: documentRetentionPolicies.name })
          .from(documentRetentionPolicies)
          .where(
            and(
              eq(documentRetentionPolicies.id, input.id),
              eq(documentRetentionPolicies.orgId, org!.id),
            ),
          );
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Retention policy not found" });

        // `documents.retention_policy_id` is ON DELETE SET NULL, so every
        // attached document silently falls back to the 90-day default — which
        // may be SHORTER than the policy being removed. Report the count so the
        // caller can be told what they just changed.
        const [usage] = await db
          .select({ n: count() })
          .from(documents)
          .where(
            and(eq(documents.orgId, org!.id), eq(documents.retentionPolicyId, input.id)),
          );

        await db
          .delete(documentRetentionPolicies)
          .where(
            and(
              eq(documentRetentionPolicies.id, input.id),
              eq(documentRetentionPolicies.orgId, org!.id),
            ),
          );

        return {
          ok: true,
          name: target.name,
          documentsReverted: Number(usage?.n ?? 0),
          revertedToDays: Number(process.env["RETENTION_DEFAULT_DAYS"] ?? 90),
        };
      }),

    /**
     * Attach a policy to a document, or detach with `policyId: null`.
     *
     * The org check on the policy is load-bearing: the sweeper joins
     * documents → policies with NO org predicate, and the FK does not
     * constrain same-org, so a document holding another tenant's policy id
     * would inherit that tenant's duration and legal-hold.
     */
    assign: permissionProcedure("settings", "write")
      .input(
        z.object({
          documentId: z.string().uuid(),
          policyId: z.string().uuid().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [doc] = await db
          .select({ id: documents.id })
          .from(documents)
          .where(and(eq(documents.id, input.documentId), eq(documents.orgId, org!.id)));
        if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });

        if (input.policyId) {
          const [policy] = await db
            .select({ id: documentRetentionPolicies.id })
            .from(documentRetentionPolicies)
            .where(
              and(
                eq(documentRetentionPolicies.id, input.policyId),
                eq(documentRetentionPolicies.orgId, org!.id),
              ),
            );
          if (!policy) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Retention policy not found" });
          }
        }

        await db
          .update(documents)
          .set({ retentionPolicyId: input.policyId, updatedAt: new Date() })
          .where(and(eq(documents.id, input.documentId), eq(documents.orgId, org!.id)));
        return { ok: true };
      }),
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
