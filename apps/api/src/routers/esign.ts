import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  signatureRequests,
  signatureSigners,
  signatureAudit,
  integrations,
  eq,
  and,
  desc,
} from "@coheronconnect/db";
import { decryptIntegrationConfig } from "../services/encryption";
import { getEsignProvider } from "../services/esign";

/**
 * Universal e-sign router. Source modules (contracts, recruitment, secretarial,
 * etc.) call `esign.createRequest` with their sourceType + sourceId — the
 * router persists the envelope, dispatches to the chosen provider, and writes
 * a row to `signature_requests`.
 *
 * Provider selection: per-tenant default lives in `integrations` rows with
 * provider in {emudhra, docusign}. The first connected one is used.
 */
export const esignRouter = router({
  list: permissionProcedure("contracts", "read")
    .input(
      z.object({
        sourceType: z.string().optional(),
        sourceId: z.string().uuid().optional(),
        limit: z.coerce.number().default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(signatureRequests.orgId, org!.id)];
      if (input.sourceType) conditions.push(eq(signatureRequests.sourceType, input.sourceType));
      if (input.sourceId) conditions.push(eq(signatureRequests.sourceId, input.sourceId));
      const rows = await db
        .select()
        .from(signatureRequests)
        .where(and(...conditions))
        .orderBy(desc(signatureRequests.createdAt))
        .limit(input.limit);
      return rows;
    }),

  get: permissionProcedure("contracts", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [req] = await db
        .select()
        .from(signatureRequests)
        .where(and(eq(signatureRequests.id, input.id), eq(signatureRequests.orgId, org!.id)))
        .limit(1);
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
      const signers = await db
        .select()
        .from(signatureSigners)
        .where(eq(signatureSigners.requestId, req.id));
      const audit = await db
        .select()
        .from(signatureAudit)
        .where(eq(signatureAudit.requestId, req.id))
        .orderBy(desc(signatureAudit.occurredAt))
        .limit(50);
      return { ...req, signers, audit };
    }),

  createRequest: permissionProcedure("contracts", "write")
    .input(
      z.object({
        title: z.string().min(1),
        message: z.string().optional(),
        sourceType: z.string().min(1),
        sourceId: z.string().uuid(),
        documentStorageKey: z.string().min(1),
        documentSha256: z.string().length(64),
        signers: z
          .array(
            z.object({
              name: z.string().min(1),
              email: z.string().email(),
              phone: z.string().optional(),
              role: z.string().optional(),
              routingOrder: z.number().int().min(1).optional(),
            }),
          )
          .min(1),
        provider: z.enum(["emudhra", "docusign"]).default("emudhra"),
        expiresAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;

      const [integration] = await db
        .select()
        .from(integrations)
        .where(
          and(
            eq(integrations.orgId, org!.id),
            eq(integrations.provider, input.provider),
            eq(integrations.status, "connected"),
          ),
        )
        .limit(1);
      if (!integration?.configEncrypted) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${input.provider} integration not configured`,
        });
      }

      const provider = getEsignProvider(input.provider);
      if (!provider) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Provider unsupported" });
      }
      const config = decryptIntegrationConfig(integration.configEncrypted);

      const [reqRow] = await db
        .insert(signatureRequests)
        .values({
          orgId: org!.id,
          provider: input.provider,
          title: input.title,
          message: input.message ?? null,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          documentStorageKey: input.documentStorageKey,
          documentSha256: input.documentSha256,
          status: "draft",
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          requestedById: user!.id,
        })
        .returning();

      await db.insert(signatureSigners).values(
        input.signers.map((s, idx) => ({
          requestId: reqRow.id,
          name: s.name,
          email: s.email,
          phone: s.phone ?? null,
          role: s.role ?? "signer",
          routingOrder: s.routingOrder ?? idx + 1,
          status: "pending" as const,
        })),
      );

      // Document fetch is handled by the client (it already has the storage
      // key and uploaded the bytes). For the live ASP call we'd fetch from
      // storage and base64-encode here. In v1 we pass the storageKey through
      // a signed URL; eMudhra fetches it server-to-server.
      const initRes = await provider.init(config, {
        title: input.title,
        documentBase64: "", // populated by background worker (avoids holding bytes in memory here)
        documentSha256: input.documentSha256,
        signers: input.signers,
        callbackUrl: `${process.env["PUBLIC_API_URL"] ?? ""}/webhooks/esign/${input.provider}`,
        ...(input.message ? { message: input.message } : {}),
        ...(input.expiresAt ? { expiresAt: new Date(input.expiresAt) } : {}),
        metadata: { signatureRequestId: reqRow.id },
      });

      await db
        .update(signatureRequests)
        .set({
          providerEnvelopeId: initRes.envelopeId,
          status: "sent",
          updatedAt: new Date(),
        })
        .where(eq(signatureRequests.id, reqRow.id));

      await db.insert(signatureAudit).values({
        requestId: reqRow.id,
        eventType: "sent",
        providerPayload: { envelopeId: initRes.envelopeId, signingUrls: initRes.signingUrls },
      });

      return {
        id: reqRow.id,
        envelopeId: initRes.envelopeId,
        signingUrls: initRes.signingUrls,
      };
    }),

  void: permissionProcedure("contracts", "write")
    .input(z.object({ id: z.string().uuid(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [req] = await db
        .select()
        .from(signatureRequests)
        .where(and(eq(signatureRequests.id, input.id), eq(signatureRequests.orgId, org!.id)))
        .limit(1);
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
      if (req.status === "completed" || req.status === "signed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot void completed envelope" });
      }
      await db
        .update(signatureRequests)
        .set({ status: "voided", updatedAt: new Date() })
        .where(eq(signatureRequests.id, input.id));
      await db.insert(signatureAudit).values({
        requestId: input.id,
        eventType: "voided",
        providerPayload: { reason: input.reason ?? null },
      });
      return { ok: true };
    }),
});
