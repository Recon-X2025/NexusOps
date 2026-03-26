import { router, permissionProcedure } from "../lib/trpc";
import { z } from "zod";
import {
  tickets,
  ticketStatuses,
  assets,
  employees,
  approvalRequests,
  eq,
  and,
  count,
  desc,
  sql,
  gte,
  lte,
} from "@nexusops/db";
import { getRedis } from "../lib/redis";

const CACHE_TTL = 300; // 5 minutes

async function getCached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  try {
    const redis = getRedis();
    const cached = await redis.get(key);
    if (cached) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        await redis.del(key).catch(() => {});
      }
    }

    const result = await fn();
    try {
      await redis.setex(key, CACHE_TTL, JSON.stringify(result));
    } catch {
      // Cache write is optional; still return fresh data
    }
    return result;
  } catch {
    return fn();
  }
}

export const dashboardRouter = router({
  getMetrics: permissionProcedure("reports", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const cacheKey = `dashboard:metrics:${org!.id}`;

    return getCached(cacheKey, async () => {
      const [openCount] = await db
        .select({ count: count() })
        .from(tickets)
        .innerJoin(ticketStatuses, eq(tickets.statusId, ticketStatuses.id))
        .where(and(eq(tickets.orgId, org!.id), eq(ticketStatuses.category, "open")));

      const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));

      const [createdTodayCount] = await db
        .select({ count: count() })
        .from(tickets)
        .where(and(eq(tickets.orgId, org!.id), gte(tickets.createdAt, startOfDay)));

      const [resolvedTodayCount] = await db
        .select({ count: count() })
        .from(tickets)
        .where(
          and(
            eq(tickets.orgId, org!.id),
            sql`${tickets.resolvedAt} IS NOT NULL`,
            gte(tickets.resolvedAt, startOfDay),
          ),
        );

      const [pendingApprovalsCount] = await db
        .select({ count: count() })
        .from(approvalRequests)
        .where(and(eq(approvalRequests.orgId, org!.id), eq(approvalRequests.status, "pending")));

      const [unassignedCount] = await db
        .select({ count: count() })
        .from(tickets)
        .innerJoin(ticketStatuses, eq(tickets.statusId, ticketStatuses.id))
        .where(
          and(
            eq(tickets.orgId, org!.id),
            sql`${tickets.assigneeId} IS NULL`,
            sql`${ticketStatuses.category} NOT IN ('resolved', 'closed')`,
          ),
        );

      const [slaBreachedCount] = await db
        .select({ count: count() })
        .from(tickets)
        .where(and(eq(tickets.orgId, org!.id), eq(tickets.slaBreached, true)));

      const [totalCount] = await db
        .select({ count: count() })
        .from(tickets)
        .where(eq(tickets.orgId, org!.id));

      const [resolvedCount] = await db
        .select({ count: count() })
        .from(tickets)
        .innerJoin(ticketStatuses, eq(tickets.statusId, ticketStatuses.id))
        .where(and(eq(tickets.orgId, org!.id), eq(ticketStatuses.category, "resolved")));

      const slaCompliance =
        totalCount && totalCount.count > 0
          ? Math.round(((totalCount.count - (slaBreachedCount?.count ?? 0)) / totalCount.count) * 100)
          : 100;

      return {
        openTickets: openCount?.count ?? 0,
        createdToday: createdTodayCount?.count ?? 0,
        resolvedToday: resolvedTodayCount?.count ?? 0,
        pendingApprovals: pendingApprovalsCount?.count ?? 0,
        unassigned: unassignedCount?.count ?? 0,
        slaBreached: slaBreachedCount?.count ?? 0,
        slaCompliancePct: slaCompliance,
        totalTickets: totalCount?.count ?? 0,
        resolvedTickets: resolvedCount?.count ?? 0,
      };
    });
  }),

  getTimeSeries: permissionProcedure("reports", "read")
    .input(
      z.object({
        days: z.coerce.number().min(7).max(365).default(30),
        teamId: z.string().uuid().optional(),
        categoryId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const cacheKey = `dashboard:timeseries:${org!.id}:${input.days}:${input.teamId ?? "all"}:${input.categoryId ?? "all"}`;

      return getCached(cacheKey, async () => {
        const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

        const created = await db.execute(sql`
          SELECT DATE_TRUNC('day', created_at) as day, COUNT(*) as count
          FROM tickets
          WHERE org_id = ${org!.id} AND created_at >= ${since}
          GROUP BY day
          ORDER BY day
        `);

        const resolved = await db.execute(sql`
          SELECT DATE_TRUNC('day', resolved_at) as day, COUNT(*) as count
          FROM tickets
          WHERE org_id = ${org!.id} AND resolved_at IS NOT NULL AND resolved_at >= ${since}
          GROUP BY day
          ORDER BY day
        `);

        return { created: Array.from(created), resolved: Array.from(resolved) };
      });
    }),

  getTopCategories: permissionProcedure("reports", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;

    const result = await db.execute(sql`
      SELECT tc.name, tc.color, COUNT(t.id) as count
      FROM tickets t
      LEFT JOIN ticket_categories tc ON t.category_id = tc.id
      WHERE t.org_id = ${org!.id}
      GROUP BY tc.id, tc.name, tc.color
      ORDER BY count DESC
      LIMIT 10
    `);

    return Array.from(result);
  }),
});
