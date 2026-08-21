import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  applications,
  appLifecycleEnum,
  cloudReadinessEnum,
  eq,
  and,
  desc,
  count,
  sum,
  avg,
  inArray,
  sql,
} from "@coheronconnect/db";

/**
 * Score at or above which an application counts as "high tech debt".
 *
 * `tech_debt_score` is a 0-100 integer. The UI speaks in categorical bands
 * (critical/high/medium/low) but NO mapping from score to band exists anywhere
 * in this repo — the bands are only a TypeScript union on the page. This
 * constant is therefore a CHOSEN boundary, not a recovered one, and the tile
 * carries it in its label so the number is never read without its definition.
 */
const HIGH_TECH_DEBT_MIN_SCORE = 70;

export const apmRouter = router({
  applications: router({
    list: permissionProcedure("analytics", "read")
      .input(z.object({
        lifecycle: z.enum(appLifecycleEnum.enumValues).optional(),
        cloudReadiness: z.enum(cloudReadinessEnum.enumValues).optional(),
        search: z.string().optional(),
        limit: z.coerce.number().default(50),
        cursor: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(applications.orgId, org!.id)];
        if (input.lifecycle) conditions.push(eq(applications.lifecycle, input.lifecycle));
        if (input.cloudReadiness) conditions.push(eq(applications.cloudReadiness, input.cloudReadiness));

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

    get: permissionProcedure("analytics", "read")
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [app] = await db.select().from(applications)
          .where(and(eq(applications.id, input.id), eq(applications.orgId, org!.id)));
        if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });
        return app;
      }),

    create: permissionProcedure("analytics", "write")
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        category: z.string().optional(),
        lifecycle: z.enum(appLifecycleEnum.enumValues).default("sustaining"),
        cloudReadiness: z.enum(cloudReadinessEnum.enumValues).default("not_assessed"),
        vendor: z.string().optional(),
        department: z.string().optional(),
        ownerId: z.string().uuid().optional(),
        annualCost: z.string().optional(),
        // These three feed tiles on /app/apm but `create` accepted none of them,
        // so a row could only ever be born with the column defaults
        // (health 70, users 0, debt 0) and then edited — and `usersCount` was
        // accepted by neither create NOR update, so it could not be set at all.
        healthScore: z.coerce.number().int().min(0).max(100).optional(),
        techDebtScore: z.coerce.number().int().min(0).max(100).optional(),
        usersCount: z.coerce.number().int().min(0).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [app] = await db.insert(applications).values({
          orgId: org!.id,
          ...input,
        }).returning();
        return app;
      }),

    update: permissionProcedure("analytics", "write")
      .input(z.object({
        id: z.string().uuid(),
        // `name`, `category`, `vendor` and `department` were accepted by CREATE
        // but not by UPDATE, so a typo in any of them was uncorrectable through
        // the API. `usersCount` was accepted by neither.
        name: z.string().min(1).optional(),
        category: z.string().optional(),
        vendor: z.string().optional(),
        department: z.string().optional(),
        lifecycle: z.enum(appLifecycleEnum.enumValues).optional(),
        // 0-100 is the range the UI already assumes: the health bar is rendered
        // as `width: {healthScore}%` and the tech-debt tile bands on >= 70.
        // Neither bound was enforced anywhere — not in zod, and there is no
        // CHECK constraint on the table (queried).
        healthScore: z.coerce.number().int().min(0).max(100).optional(),
        techDebtScore: z.coerce.number().int().min(0).max(100).optional(),
        usersCount: z.coerce.number().int().min(0).optional(),
        cloudReadiness: z.enum(cloudReadinessEnum.enumValues).optional(),
        annualCost: z.string().optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { id, ...data } = input;
        const [app] = await db.update(applications)
          .set({ ...data, updatedAt: new Date() })
          .where(and(eq(applications.id, id), eq(applications.orgId, org!.id)))
          .returning();
        if (!app) throw new TRPCError({ code: "NOT_FOUND" });
        return app;
      }),
  }),

  portfolio: router({
    summary: permissionProcedure("analytics", "read").query(async ({ ctx }) => {
      const { db, org } = ctx;

      const [totalRow] = await db.select({ total: count() }).from(applications).where(eq(applications.orgId, org!.id));
      const total = totalRow?.total ?? 0;
      const [avgHealthRow] = await db.select({ avgHealth: avg(applications.healthScore) }).from(applications).where(eq(applications.orgId, org!.id));
      const avgHealth = avgHealthRow?.avgHealth ?? null;
      const [totalCostRow] = await db.select({ totalCost: sum(applications.annualCost) }).from(applications).where(eq(applications.orgId, org!.id));
      const totalCost = totalCostRow?.totalCost ?? null;

      const lifecycleCounts = await db.select({
        lifecycle: applications.lifecycle,
        cnt: count(),
      }).from(applications)
        .where(eq(applications.orgId, org!.id))
        .groupBy(applications.lifecycle);

      const byLifecycle = lifecycleCounts.reduce<Record<string, number>>((acc, row) => {
        if (row.lifecycle) acc[row.lifecycle] = Number(row.cnt);
        return acc;
      }, {});

      /*
       * These three were read out of `byLifecycle` under the keys "retire",
       * "sunset" and "active". None of those is a value of the lifecycle enum
       * (evaluating | investing | sustaining | harvesting | retiring | obsolete),
       * so every lookup missed and all three returned 0 for every org, forever —
       * while the same map sitting beside them held the real counts. Two of them
       * were not lifecycle questions at all: tech debt lives on `tech_debt_score`
       * and cloud readiness on `cloud_readiness`. Each is now counted in SQL
       * against the column that actually answers it, org-scoped.
       */
      const [retireRow] = await db
        .select({ c: count() })
        .from(applications)
        .where(
          and(
            eq(applications.orgId, org!.id),
            inArray(applications.lifecycle, ["retiring", "harvesting", "obsolete"]),
          ),
        );
      const [debtRow] = await db
        .select({ c: count() })
        .from(applications)
        .where(
          and(
            eq(applications.orgId, org!.id),
            sql`${applications.techDebtScore} >= ${HIGH_TECH_DEBT_MIN_SCORE}`,
          ),
        );
      const [cloudRow] = await db
        .select({ c: count() })
        .from(applications)
        .where(and(eq(applications.orgId, org!.id), eq(applications.cloudReadiness, "cloud_native")));

      return {
        total: Number(total),
        avgHealthScore: avgHealth ? Math.round(Number(avgHealth)) : 0,
        totalAnnualCost: totalCost ? Number(totalCost) : 0,
        byLifecycle,
        retireCandidates: Number(retireRow?.c ?? 0),
        highTechDebt: Number(debtRow?.c ?? 0),
        highTechDebtMinScore: HIGH_TECH_DEBT_MIN_SCORE,
        cloudNative: Number(cloudRow?.c ?? 0),
      };
    }),
  }),
});
