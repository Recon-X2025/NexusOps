import { router, permissionProcedure, paginationInput } from "../lib/trpc";
import { z } from "zod";
import {
  itomEvents,
  itomSuppressionRules,
  itomCorrelationPolicies,
  ciItems,
  integrations,
  eq,
  asc,
  desc,
  and,
} from "@coheronconnect/db";

export const eventsRouter = router({
  list: permissionProcedure("events", "read")
    .input(z.object({
      status: z.string().optional(),
      severity: z.string().optional(),
      limit: z.coerce.number().default(50),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const items = await db.select().from(itomEvents)
        .where(eq(itomEvents.orgId, org!.id))
        .orderBy(desc(itomEvents.lastOccurrence))
        .limit(input.limit);

      return { items, nextCursor: null };
    }),

  acknowledge: permissionProcedure("events", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      await db.update(itomEvents)
        .set({ state: "resolved", resolvedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(itomEvents.id, input.id), eq(itomEvents.orgId, org!.id)));
      return { success: true };
    }),

  suppress: permissionProcedure("events", "write")
    .input(z.object({ id: z.string().uuid(), suppressUntil: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      await db.update(itomEvents)
        .set({
          state: "suppressed",
          updatedAt: new Date(),
        })
        .where(and(eq(itomEvents.id, input.id), eq(itomEvents.orgId, org!.id)));
      return { success: true };
    }),

  listSuppressionRules: permissionProcedure("events", "read")
    .input(paginationInput)
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      return db.select().from(itomSuppressionRules)
        .where(eq(itomSuppressionRules.orgId, org!.id))
        .orderBy(asc(itomSuppressionRules.name))
        .limit(input.limit).offset(input.offset);
    }),

  listCorrelationPolicies: permissionProcedure("events", "read")
    .input(paginationInput)
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      return db.select().from(itomCorrelationPolicies)
        .where(eq(itomCorrelationPolicies.orgId, org!.id))
        .orderBy(asc(itomCorrelationPolicies.name))
        .limit(input.limit).offset(input.offset);
    }),

  listIntegrations: permissionProcedure("events", "read")
    .input(paginationInput)
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      return db.select().from(integrations)
        .where(eq(integrations.orgId, org!.id))
        .orderBy(asc(integrations.provider))
        .limit(input.limit).offset(input.offset);
    }),

  healthNodes: permissionProcedure("events", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const cis = await db.select({
      id: ciItems.id,
      name: ciItems.name,
      ciType: ciItems.ciType,
      status: ciItems.status,
    }).from(ciItems).where(eq(ciItems.orgId, org!.id)).orderBy(asc(ciItems.name)).limit(100);

    return cis.map((ci) => ({
      id: ci.id,
      name: ci.name,
      type: ci.ciType,
      health:
        ci.status === "operational"
          ? "healthy"
          : ci.status === "degraded"
            ? "degraded"
            : ci.status === "down"
              ? "down"
              : "unknown",
    }));
  }),

  dashboard: permissionProcedure("events", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const events = await db.select().from(itomEvents).where(eq(itomEvents.orgId, org!.id));

    const bySeverity = { critical: 0, major: 0, minor: 0, warning: 0, info: 0, clear: 0 };
    const byStatus = { open: 0, in_progress: 0, suppressed: 0, resolved: 0, flapping: 0 };

    events.forEach((e) => {
      const sev = e.severity as keyof typeof bySeverity;
      if (sev in bySeverity) bySeverity[sev]++;
      const st = e.state as keyof typeof byStatus;
      if (st in byStatus) byStatus[st]++;
    });

    return {
      total: events.length,
      bySeverity,
      byStatus,
      openCount: byStatus.open + byStatus.in_progress,
    };
  }),
});
