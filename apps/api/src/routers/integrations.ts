import crypto from "node:crypto";
import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  integrations,
  webhooks,
  webhookDeliveries,
  apiKeys,
  eq,
  and,
  desc,
} from "@nexusops/db";
import { syncJiraToNexus } from "../services/jira";
import { syncSapToNexus } from "../services/sap";

// ─── Integrations (Slack, Teams, Jira, SAP …) ────────────────────────────────

export const integrationsRouter = router({
  // ── Integration providers ──────────────────────────────────────────────
  listIntegrations: permissionProcedure("settings", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    return db
      .select()
      .from(integrations)
      .where(eq(integrations.orgId, org!.id))
      .orderBy(integrations.provider);
  }),

  upsertIntegration: permissionProcedure("settings", "write")
    .input(
      z.object({
        provider: z.enum(["slack", "teams", "email", "jira", "sap"]),
        config: z.record(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      // Encrypt config JSON with AES-256-CBC using APP_SECRET
      const appSecret = process.env["APP_SECRET"];
      if (!appSecret) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "APP_SECRET is not configured" });
      const key = crypto.createHash("sha256").update(appSecret).digest();
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
      const configJson = JSON.stringify(input.config);
      const encrypted =
        iv.toString("hex") +
        ":" +
        Buffer.concat([cipher.update(configJson, "utf8"), cipher.final()]).toString("hex");

      const existing = await db
        .select({ id: integrations.id })
        .from(integrations)
        .where(and(eq(integrations.orgId, org!.id), eq(integrations.provider, input.provider)));

      if (existing[0]) {
        const [updated] = await db
          .update(integrations)
          .set({
            configEncrypted: encrypted,
            status: "connected",
            updatedAt: new Date(),
          })
          .where(eq(integrations.id, existing[0].id))
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Integration not found" });
        return updated;
      }

      const [created] = await db
        .insert(integrations)
        .values({
          orgId: org!.id,
          provider: input.provider,
          configEncrypted: encrypted,
          status: "connected",
        })
        .returning();
      return created;
    }),

  disconnectIntegration: permissionProcedure("settings", "write")
    .input(z.object({ provider: z.enum(["slack", "teams", "email", "jira", "sap"]) }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      await db
        .update(integrations)
        .set({ status: "disconnected", configEncrypted: null, updatedAt: new Date() })
        .where(and(eq(integrations.orgId, org!.id), eq(integrations.provider, input.provider)));
      return { ok: true };
    }),

  // ── Outgoing Webhooks ──────────────────────────────────────────────────
  listWebhooks: permissionProcedure("settings", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    return db
      .select()
      .from(webhooks)
      .where(eq(webhooks.orgId, org!.id))
      .orderBy(desc(webhooks.createdAt));
  }),

  createWebhook: permissionProcedure("settings", "write")
    .input(
      z.object({
        name: z.string().min(1).max(200),
        url: z.string().url(),
        events: z.array(z.string()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const secret = crypto.randomBytes(32).toString("hex");
      const [webhook] = await db
        .insert(webhooks)
        .values({
          orgId: org!.id,
          name: input.name,
          url: input.url,
          events: input.events,
          secret,
          isActive: true,
        })
        .returning();
      return { ...webhook!, secretOnce: secret };
    }),

  updateWebhook: permissionProcedure("settings", "write")
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(200).optional(),
        url: z.string().url().optional(),
        events: z.array(z.string()).min(1).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [existing] = await db
        .select({ id: webhooks.id })
        .from(webhooks)
        .where(and(eq(webhooks.id, input.id), eq(webhooks.orgId, org!.id)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.url !== undefined) patch.url = input.url;
      if (input.events !== undefined) patch.events = input.events;
      if (input.isActive !== undefined) patch.isActive = input.isActive;

      const [updated] = await db
        .update(webhooks)
        .set(patch)
        .where(eq(webhooks.id, input.id))
        .returning();
      return updated;
    }),

  deleteWebhook: permissionProcedure("settings", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      await db
        .delete(webhooks)
        .where(and(eq(webhooks.id, input.id), eq(webhooks.orgId, org!.id)));
      return { ok: true };
    }),

  rerollWebhookSecret: permissionProcedure("settings", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [existing] = await db
        .select({ id: webhooks.id })
        .from(webhooks)
        .where(and(eq(webhooks.id, input.id), eq(webhooks.orgId, org!.id)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const newSecret = crypto.randomBytes(32).toString("hex");
      await db
        .update(webhooks)
        .set({ secret: newSecret, updatedAt: new Date() })
        .where(eq(webhooks.id, input.id));
      return { secretOnce: newSecret };
    }),

  listDeliveries: permissionProcedure("settings", "read")
    .input(z.object({ webhookId: z.string().uuid(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      // Verify org ownership
      const [hook] = await db
        .select({ id: webhooks.id })
        .from(webhooks)
        .where(and(eq(webhooks.id, input.webhookId), eq(webhooks.orgId, org!.id)));
      if (!hook) throw new TRPCError({ code: "NOT_FOUND" });

      return db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.webhookId, input.webhookId))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(input.limit);
    }),

  // ── API Keys ───────────────────────────────────────────────────────────
  listApiKeys: permissionProcedure("settings", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    // Never return keyHash; return display-safe fields only
    return db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        permissions: apiKeys.permissions,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
        createdById: apiKeys.createdById,
      })
      .from(apiKeys)
      .where(eq(apiKeys.orgId, org!.id))
      .orderBy(desc(apiKeys.createdAt));
  }),

  createApiKey: permissionProcedure("settings", "write")
    .input(
      z.object({
        name: z.string().min(1).max(200),
        permissions: z.record(z.array(z.string())).default({}),
        expiresInDays: z.number().int().min(1).max(3650).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;

      // Generate nxk_<random32hex>
      const rawKey = "nxk_" + crypto.randomBytes(32).toString("hex");
      const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
      const keyPrefix = rawKey.slice(0, 12); // "nxk_" + 8 chars

      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86_400_000)
        : null;

      const [created] = await db
        .insert(apiKeys)
        .values({
          orgId: org!.id,
          createdById: user!.id,
          name: input.name,
          keyHash,
          keyPrefix,
          permissions: input.permissions,
          expiresAt: expiresAt ?? undefined,
        })
        .returning({
          id: apiKeys.id,
          name: apiKeys.name,
          keyPrefix: apiKeys.keyPrefix,
          permissions: apiKeys.permissions,
          expiresAt: apiKeys.expiresAt,
          createdAt: apiKeys.createdAt,
        });

      return { ...created!, keyOnce: rawKey };
    }),

  revokeApiKey: permissionProcedure("settings", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      await db
        .delete(apiKeys)
        .where(and(eq(apiKeys.id, input.id), eq(apiKeys.orgId, org!.id)));
      return { ok: true };
    }),

  // ── Sync triggers ──────────────────────────────────────────────────────
  triggerJiraSync: permissionProcedure("settings", "write")
    .input(z.object({ integrationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const [integration] = await db
        .select({ id: integrations.id, provider: integrations.provider })
        .from(integrations)
        .where(and(eq(integrations.id, input.integrationId), eq(integrations.orgId, org!.id)));

      if (!integration) throw new TRPCError({ code: "NOT_FOUND" });
      if (integration.provider !== "jira") throw new TRPCError({ code: "BAD_REQUEST", message: "Integration is not a Jira integration" });

      try {
        const synced = await syncJiraToNexus(db, org!.id, input.integrationId);
        return { ok: true, synced };
      } catch (err) {
        await db
          .update(integrations)
          .set({ lastError: (err as Error).message, updatedAt: new Date() })
          .where(eq(integrations.id, input.integrationId));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (err as Error).message });
      }
    }),

  triggerSapSync: permissionProcedure("settings", "write")
    .input(z.object({ integrationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const [integration] = await db
        .select({ id: integrations.id, provider: integrations.provider })
        .from(integrations)
        .where(and(eq(integrations.id, input.integrationId), eq(integrations.orgId, org!.id)));

      if (!integration) throw new TRPCError({ code: "NOT_FOUND" });
      if (integration.provider !== "sap") throw new TRPCError({ code: "BAD_REQUEST", message: "Integration is not a SAP integration" });

      try {
        const synced = await syncSapToNexus(db, org!.id, input.integrationId);
        return { ok: true, synced };
      } catch (err) {
        await db
          .update(integrations)
          .set({ lastError: (err as Error).message, updatedAt: new Date() })
          .where(eq(integrations.id, input.integrationId));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (err as Error).message });
      }
    }),
});
