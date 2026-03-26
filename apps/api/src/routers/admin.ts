import { router, adminProcedure } from "../lib/trpc";
import { z } from "zod";
import { auditLogs, users, eq, and, desc, gte, lte, count } from "@nexusops/db";

export const adminRouter = router({
  auditLog: router({
    list: adminProcedure
      .input(
        z.object({
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(50),
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
          userId: z.string().uuid().optional(),
          action: z.string().optional(),
          resourceType: z.string().optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { page, limit, dateFrom, dateTo, userId, action, resourceType } = input;
        const offset = (page - 1) * limit;

        const conditions = [eq(auditLogs.orgId, org!.id)];

        if (dateFrom) conditions.push(gte(auditLogs.createdAt, new Date(dateFrom)));
        if (dateTo) conditions.push(lte(auditLogs.createdAt, new Date(dateTo)));
        if (userId) conditions.push(eq(auditLogs.userId, userId));
        if (action) conditions.push(eq(auditLogs.action, action));
        if (resourceType) conditions.push(eq(auditLogs.resourceType, resourceType));

        const [{ total }] = await db
          .select({ total: count() })
          .from(auditLogs)
          .where(and(...conditions));

        const items = await db
          .select({
            id: auditLogs.id,
            orgId: auditLogs.orgId,
            action: auditLogs.action,
            resourceType: auditLogs.resourceType,
            resourceId: auditLogs.resourceId,
            changes: auditLogs.changes,
            ipAddress: auditLogs.ipAddress,
            userAgent: auditLogs.userAgent,
            createdAt: auditLogs.createdAt,
            userId: auditLogs.userId,
            userName: users.name,
            userEmail: users.email,
          })
          .from(auditLogs)
          .leftJoin(users, eq(auditLogs.userId, users.id))
          .where(and(...conditions))
          .orderBy(desc(auditLogs.createdAt))
          .limit(limit)
          .offset(offset);

        return {
          items,
          total,
          page,
          pages: Math.ceil(total / limit),
        };
      }),
  }),

  users: router({
    list: adminProcedure.query(async ({ ctx }) => {
      const { db, org } = ctx;
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          matrixRole: users.matrixRole,
          status: users.status,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.orgId, org!.id))
        .orderBy(users.name);
      return rows;
    }),

    update: adminProcedure
      .input(
        z.object({
          userId: z.string().uuid(),
          role: z.enum(["owner", "admin", "member", "viewer"]).optional(),
          matrixRole: z.string().nullable().optional(),
          status: z.enum(["active", "invited", "disabled"]).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { userId, ...updates } = input;
        const [user] = await db
          .update(users)
          .set({ ...updates, updatedAt: new Date() })
          .where(and(eq(users.id, userId), eq(users.orgId, org!.id)))
          .returning({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            matrixRole: users.matrixRole,
            status: users.status,
          });
        return user;
      }),
  }),

  slaDefinitions: router({
    list: adminProcedure.query(async () => {
      // slaPolicies table not yet in schema - return empty
      return [];
    }),
    upsert: adminProcedure
      .input(z.object({
        id: z.string().uuid().optional(),
        name: z.string(),
        priority: z.string(),
        responseMinutes: z.coerce.number(),
        resolveMinutes: z.coerce.number(),
      }))
      .mutation(async ({ input }) => {
        return input;
      }),
  }),

  systemProperties: router({
    list: adminProcedure.query(async () => {
      return [
        { key: "platform.name", value: "NexusOps", description: "Platform display name", environment: "all" },
        { key: "session.timeout_hours", value: "24", description: "Session sliding window hours", environment: "all" },
        { key: "rate_limit.login_attempts", value: "10", description: "Max failed login attempts before lockout", environment: "all" },
        { key: "email.from_address", value: process.env.SMTP_FROM ?? "noreply@nexusops.io", description: "Email from address", environment: "all" },
        { key: "meilisearch.enabled", value: process.env.MEILISEARCH_URL ? "true" : "false", description: "Global search enabled", environment: "all" },
      ];
    }),
    update: adminProcedure
      .input(z.object({ key: z.string(), value: z.string() }))
      .mutation(async ({ input }) => input),
  }),

  notificationRules: router({
    list: adminProcedure.query(async () => {
      // notificationRules table not yet in schema - return empty
      return [];
    }),
  }),

  scheduledJobs: router({
    list: adminProcedure.query(async () => {
      return [
        { id: "sla-checker", name: "SLA Breach Checker", schedule: "*/5 * * * *", lastRun: new Date(Date.now() - 5 * 60 * 1000), nextRun: new Date(Date.now() + 5 * 60 * 1000), status: "active" },
        { id: "notification-digest", name: "Notification Digest", schedule: "0 9 * * 1-5", lastRun: new Date(Date.now() - 86400 * 1000), nextRun: new Date(Date.now() + 3600 * 1000), status: "active" },
        { id: "contract-expiry", name: "Contract Expiry Alerts", schedule: "0 8 * * *", lastRun: new Date(Date.now() - 86400 * 1000), nextRun: new Date(Date.now() + 86400 * 1000), status: "active" },
        { id: "report-aggregator", name: "Executive Report Aggregation", schedule: "0 6 * * 1", lastRun: new Date(Date.now() - 7 * 86400 * 1000), nextRun: new Date(Date.now() + 86400 * 1000), status: "active" },
      ];
    }),
  }),
});
