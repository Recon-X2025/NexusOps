import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  applications,
  eq,
  and,
  desc,
  count,
  sum,
  avg,
} from "@nexusops/db";

export const apmRouter = router({
  applications: router({
    list: permissionProcedure("analytics" as any, "read")
      .input(z.object({
        lifecycle: z.string().optional(),
        cloudReadiness: z.string().optional(),
        search: z.string().optional(),
        limit: z.coerce.number().default(50),
        cursor: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(applications.orgId, org!.id)];
        if (input.lifecycle) conditions.push(eq(applications.lifecycle, input.lifecycle as any));
        if (input.cloudReadiness) conditions.push(eq(applications.cloudReadiness, input.cloudReadiness as any));

        const rows = await db.select().from(applications)
          .where(and(...conditions))
          .orderBy(desc(applications.createdAt))
          .limit(input.limit + 1)
          .offset(input.cursor ? parseInt(input.cursor) : 0);

        const hasMore = rows.length > input.limit;
        return {
          items: hasMore ? rows.slice(0, -1) : rows,
          nextCursor: hasMore ? String((input.cursor ? parseInt(input.cursor) : 0) + input.limit) : null,
        };
      }),

    get: permissionProcedure("analytics" as any, "read")
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [app] = await db.select().from(applications)
          .where(and(eq(applications.id, input.id), eq(applications.orgId, org!.id)));
        if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });
        return app;
      }),

    create: permissionProcedure("analytics" as any, "write")
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        category: z.string().optional(),
        lifecycle: z.enum(["evaluating", "investing", "sustaining", "harvesting", "retiring", "obsolete"]).default("sustaining"),
        cloudReadiness: z.enum(["cloud_native", "lift_shift", "replatform", "rearchitect", "retire", "not_assessed"]).default("not_assessed"),
        vendor: z.string().optional(),
        department: z.string().optional(),
        ownerId: z.string().uuid().optional(),
        annualCost: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [app] = await db.insert(applications).values({
          orgId: org!.id,
          ...input,
        }).returning();
        return app;
      }),

    update: permissionProcedure("analytics" as any, "write")
      .input(z.object({
        id: z.string().uuid(),
        lifecycle: z.string().optional(),
        healthScore: z.coerce.number().optional(),
        techDebtScore: z.coerce.number().optional(),
        cloudReadiness: z.string().optional(),
        annualCost: z.string().optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { id, ...data } = input;
        const [app] = await db.update(applications)
          .set({ ...data as any, updatedAt: new Date() })
          .where(and(eq(applications.id, id), eq(applications.orgId, org!.id)))
          .returning();
        if (!app) throw new TRPCError({ code: "NOT_FOUND" });
        return app;
      }),
  }),

  portfolio: router({
    summary: permissionProcedure("analytics" as any, "read").query(async ({ ctx }) => {
      const { db, org } = ctx;

      const [{ total }] = await db.select({ total: count() }).from(applications).where(eq(applications.orgId, org!.id));
      const [{ avgHealth }] = await db.select({ avgHealth: avg(applications.healthScore) }).from(applications).where(eq(applications.orgId, org!.id));
      const [{ totalCost }] = await db.select({ totalCost: sum(applications.annualCost) }).from(applications).where(eq(applications.orgId, org!.id));

      const lifecycleCounts = await db.select({
        lifecycle: applications.lifecycle,
        cnt: count(),
      }).from(applications)
        .where(eq(applications.orgId, org!.id))
        .groupBy(applications.lifecycle);

      const byLifecycle: Record<string, number> = lifecycleCounts.reduce((acc: Record<string, number>, row: any) => {
        acc[row.lifecycle] = Number(row.cnt);
        return acc;
      }, {});

      return {
        total: Number(total),
        avgHealthScore: avgHealth ? Math.round(Number(avgHealth)) : 0,
        totalAnnualCost: totalCost ? Number(totalCost) : 0,
        byLifecycle,
        retireCandidates: byLifecycle["retire"] ?? 0,
        highTechDebt: byLifecycle["sunset"] ?? 0,
        cloudNative: byLifecycle["active"] ?? 0,
      };
    }),
  }),
});
