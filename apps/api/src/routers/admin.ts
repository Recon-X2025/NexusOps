import { router, adminProcedure } from "../lib/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  auditLogs,
  users,
  businessRules,
  organizations,
  sessions,
  eq,
  and,
  desc,
  asc,
  gte,
  lte,
  count,
} from "@nexusops/db";
import { BusinessRuleCreateSchema } from "../services/business-rules-engine";
import { parseOrgSettings } from "../lib/org-settings";
import { invalidateSessionCache } from "../middleware/auth";

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
          mfaEnrolled: users.mfaEnrolled,
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
          /** US-SEC-001: admin attestation that MFA is enrolled for this user (invalidates session cache). */
          mfaEnrolled: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { userId, mfaEnrolled, ...rest } = input;
        const patch: Record<string, unknown> = { ...rest, updatedAt: new Date() };
        if (mfaEnrolled !== undefined) patch.mfaEnrolled = mfaEnrolled;
        const [user] = await db
          .update(users)
          .set(patch as typeof users.$inferInsert)
          .where(and(eq(users.id, userId), eq(users.orgId, org!.id)))
          .returning({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            matrixRole: users.matrixRole,
            status: users.status,
            mfaEnrolled: users.mfaEnrolled,
          });
        if (mfaEnrolled !== undefined && user) {
          const sess = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
          await Promise.all(sess.map((s) => invalidateSessionCache(s.id)));
        }
        return user;
      }),
  }),

  /** Org `settings.security` — step-up + MFA matrix policies (US-SEC-001). */
  securityPolicy: router({
    get: adminProcedure.query(async ({ ctx }) => {
      const { db, org } = ctx;
      const [row] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, org!.id));
      const sec = parseOrgSettings(row?.settings ?? org!.settings).security;
      return {
        requireStepUpForMatrixRoles: [...(sec?.requireStepUpForMatrixRoles ?? [])],
        requireMfaForMatrixRoles: [...(sec?.requireMfaForMatrixRoles ?? [])],
      };
    }),

    update: adminProcedure
      .input(
        z.object({
          requireStepUpForMatrixRoles: z.array(z.string().max(64)).max(40).optional(),
          requireMfaForMatrixRoles: z.array(z.string().max(64)).max(40).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (input.requireStepUpForMatrixRoles === undefined && input.requireMfaForMatrixRoles === undefined) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No security policy fields to update" });
        }
        const { db, org } = ctx;
        const [row] = await db
          .select({ settings: organizations.settings })
          .from(organizations)
          .where(eq(organizations.id, org!.id));
        const raw = (row?.settings ?? {}) as Record<string, unknown>;
        const prevSec = (raw.security as Record<string, unknown> | undefined) ?? {};
        const security: Record<string, unknown> = { ...prevSec };
        if (input.requireStepUpForMatrixRoles !== undefined) {
          security.requireStepUpForMatrixRoles = input.requireStepUpForMatrixRoles;
        }
        if (input.requireMfaForMatrixRoles !== undefined) {
          security.requireMfaForMatrixRoles = input.requireMfaForMatrixRoles;
        }
        await db
          .update(organizations)
          .set({
            settings: {
              ...raw,
              security,
            },
          })
          .where(eq(organizations.id, org!.id));
        return {
          ok: true as const,
          requireStepUpForMatrixRoles: security.requireStepUpForMatrixRoles,
          requireMfaForMatrixRoles: security.requireMfaForMatrixRoles,
        };
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
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        event: z.string().min(1),
        channel: z.enum(["email", "slack", "teams", "in_app"]),
        recipients: z.string().min(1),
        conditions: z.string().optional(),
        active: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        // notificationRules table not yet in schema — return stub with generated id
        return {
          id: `NR-${Date.now()}`,
          ...input,
          createdAt: new Date(),
        };
      }),
  }),

  businessRules: router({
    list: adminProcedure.query(async ({ ctx }) => {
      const { db, org } = ctx;
      return db
        .select()
        .from(businessRules)
        .where(eq(businessRules.orgId, org!.id))
        .orderBy(asc(businessRules.priority), desc(businessRules.updatedAt));
    }),

    create: adminProcedure.input(BusinessRuleCreateSchema).mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [row] = await db
        .insert(businessRules)
        .values({
          orgId: org!.id,
          createdBy: user!.id,
          name: input.name,
          description: input.description ?? null,
          entityType: input.entityType,
          events: input.events,
          conditions: input.conditions as unknown[],
          actions: input.actions as unknown[],
          priority: input.priority,
          enabled: input.enabled,
        })
        .returning();
      return row;
    }),

    update: adminProcedure
      .input(z.object({ id: z.string().uuid() }).merge(BusinessRuleCreateSchema.partial()))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { id, ...patch } = input;
        const keys = Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined);
        if (keys.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No fields to update" });
        }
        const [row] = await db
          .update(businessRules)
          .set({ ...patch, updatedAt: new Date() } as typeof businessRules.$inferInsert)
          .where(and(eq(businessRules.id, id), eq(businessRules.orgId, org!.id)))
          .returning();
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });
        return row;
      }),

    delete: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [row] = await db
        .delete(businessRules)
        .where(and(eq(businessRules.id, input.id), eq(businessRules.orgId, org!.id)))
        .returning({ id: businessRules.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });
      return { ok: true };
    }),

    toggle: adminProcedure
      .input(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [row] = await db
          .update(businessRules)
          .set({ enabled: input.enabled, updatedAt: new Date() })
          .where(and(eq(businessRules.id, input.id), eq(businessRules.orgId, org!.id)))
          .returning();
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });
        return row;
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

    trigger: adminProcedure
      .input(z.object({ jobId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        await db.insert(auditLogs).values({
          orgId: org!.id,
          userId: user!.id,
          action: `scheduled_job.manual_trigger`,
          resourceType: "scheduled_job",
          resourceId: input.jobId,
          changes: { jobId: input.jobId, triggeredAt: new Date().toISOString() } as Record<string, unknown>,
        }).catch(() => {});
        return { success: true, jobId: input.jobId, triggeredAt: new Date() };
      }),
  }),
});
