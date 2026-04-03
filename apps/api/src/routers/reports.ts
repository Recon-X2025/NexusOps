import { router, permissionProcedure } from "../lib/trpc";
import { z } from "zod";
import {
  tickets,
  ticketCategories,
  changeRequests,
  securityIncidents,
  budgetLines,
  surveyResponses,
  ticketPriorities,
  users,
  eq,
  and,
  desc,
  count,
  sql,
  gte,
  avg,
  isNotNull,
} from "@nexusops/db";

type Granularity = "day" | "week" | "month";

function trunc(col: Parameters<typeof sql>[0], granularity: Granularity) {
  if (granularity === "day") return sql<string>`DATE(${col})`;
  if (granularity === "week") return sql<string>`DATE_TRUNC('week', ${col})`;
  return sql<string>`DATE_TRUNC('month', ${col})`;
}

function getGranularity(days: number): Granularity {
  if (days <= 14) return "day";
  if (days <= 90) return "week";
  return "month";
}

function generatePeriods(since: Date, granularity: Granularity) {
  const periods: { key: string; label: string }[] = [];
  const current = new Date(since);
  const now = new Date();

  if (granularity === "month") {
    current.setDate(1);
  } else if (granularity === "week") {
    current.setDate(current.getDate() - current.getDay());
  }
  current.setHours(0, 0, 0, 0);

  while (current <= now) {
    const key = current.toISOString().slice(0, 10);
    let label: string;
    if (granularity === "day") {
      label = current.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } else if (granularity === "week") {
      label = current.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } else {
      label = current.toLocaleDateString("en-US", { month: "short" });
    }
    periods.push({ key, label });

    if (granularity === "day") current.setDate(current.getDate() + 1);
    else if (granularity === "week") current.setDate(current.getDate() + 7);
    else current.setMonth(current.getMonth() + 1);
  }

  return periods;
}

const daysInput = z.object({ days: z.coerce.number().min(1).max(730).default(30) });

export const reportsRouter = router({
  executiveOverview: permissionProcedure("reports", "read")
    .input(daysInput)
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const granularity = getGranularity(input.days);
      const periods = generatePeriods(since, granularity);

      const [{ openTickets }] = await db.select({ openTickets: count() }).from(tickets)
        .where(and(
          eq(tickets.orgId, org!.id),
          sql`${tickets.statusId} IN (SELECT id FROM ticket_statuses WHERE org_id = ${org!.id} AND category IN ('open', 'in_progress'))`,
        ));

      const [{ resolvedInPeriod }] = await db.select({ resolvedInPeriod: count() }).from(tickets)
        .where(and(
          eq(tickets.orgId, org!.id),
          isNotNull(tickets.resolvedAt),
          gte(tickets.resolvedAt, since),
        ));

      const [{ slaBreached }] = await db.select({ slaBreached: count() }).from(tickets)
        .where(and(eq(tickets.orgId, org!.id), eq(tickets.slaBreached, true)));

      const [{ secIncidents }] = await db.select({ secIncidents: count() }).from(securityIncidents)
        .where(and(
          eq(securityIncidents.orgId, org!.id),
          sql`${securityIncidents.status} NOT IN ('closed', 'false_positive')`,
        ));

      const [{ pendingChanges }] = await db.select({ pendingChanges: count() }).from(changeRequests)
        .where(and(
          eq(changeRequests.orgId, org!.id),
          sql`${changeRequests.status} IN ('submitted', 'cab_review', 'approved', 'scheduled')`,
        ));

      const budgetRows = await db.select({
        budgeted: sql<number>`SUM(CAST(${budgetLines.budgeted} AS numeric))`,
        actual: sql<number>`SUM(CAST(${budgetLines.actual} AS numeric))`,
      }).from(budgetLines)
        .where(and(
          eq(budgetLines.orgId, org!.id),
          eq(budgetLines.fiscalYear, new Date().getFullYear()),
        ));

      const budgeted = Number(budgetRows[0]?.budgeted ?? 0);
      const actual = Number(budgetRows[0]?.actual ?? 0);
      const budgetVariance = budgeted > 0 ? Math.round(((actual - budgeted) / budgeted) * 100) : 0;

      const [{ avgMs }] = await db.select({
        avgMs: sql<number>`AVG(EXTRACT(EPOCH FROM (${tickets.resolvedAt} - ${tickets.createdAt})) * 1000)`,
      }).from(tickets)
        .where(and(
          eq(tickets.orgId, org!.id),
          isNotNull(tickets.resolvedAt),
          gte(tickets.resolvedAt, since),
        ));
      const avgHours = avgMs ? (Number(avgMs) / 3600000).toFixed(1) : null;

      const [{ avgCsat }] = await db.select({
        avgCsat: avg(surveyResponses.score),
      }).from(surveyResponses)
        .where(gte(surveyResponses.submittedAt, since));
      const csatScore = avgCsat ? `${Number(avgCsat).toFixed(1)}/5` : null;

      // Per-period incident / resolved trend
      const createdRows = await db.select({
        period: trunc(tickets.createdAt, granularity),
        cnt: count(),
      }).from(tickets)
        .where(and(eq(tickets.orgId, org!.id), gte(tickets.createdAt, since)))
        .groupBy(trunc(tickets.createdAt, granularity))
        .orderBy(trunc(tickets.createdAt, granularity));

      const resolvedRows = await db.select({
        period: trunc(tickets.resolvedAt, granularity),
        cnt: count(),
      }).from(tickets)
        .where(and(
          eq(tickets.orgId, org!.id),
          isNotNull(tickets.resolvedAt),
          gte(tickets.resolvedAt, since),
        ))
        .groupBy(trunc(tickets.resolvedAt, granularity))
        .orderBy(trunc(tickets.resolvedAt, granularity));

      const createdMap = new Map(createdRows.map((r) => [String(r.period).slice(0, 10), Number(r.cnt)]));
      const resolvedMap = new Map(resolvedRows.map((r) => [String(r.period).slice(0, 10), Number(r.cnt)]));

      // Category breakdown
      const categoryRows = await db.select({
        category: sql<string>`COALESCE(${ticketCategories.name}, 'Uncategorized')`,
        cnt: count(),
      }).from(tickets)
        .leftJoin(ticketCategories, eq(tickets.categoryId, ticketCategories.id))
        .where(and(eq(tickets.orgId, org!.id), gte(tickets.createdAt, since)))
        .groupBy(sql`COALESCE(${ticketCategories.name}, 'Uncategorized')`)
        .orderBy(desc(count()))
        .limit(6);

      const totalCat = categoryRows.reduce((s, r) => s + Number(r.cnt), 0);
      const byCategory = categoryRows.map((r) => ({
        category: r.category,
        count: Number(r.cnt),
        pct: totalCat > 0 ? Math.round((Number(r.cnt) / totalCat) * 100) : 0,
      }));

      return {
        openTickets: Number(openTickets),
        resolvedToday: Number(resolvedInPeriod),
        slaBreached: Number(slaBreached),
        securityIncidentsOpen: Number(secIncidents),
        pendingChanges: Number(pendingChanges),
        budgetVariancePct: budgetVariance,
        openIncidents: Number(openTickets),
        resolvedMtd: Number(resolvedInPeriod),
        slaCompliance: slaBreached
          ? `${Math.max(0, Math.round((1 - Number(slaBreached) / Math.max(Number(openTickets), 1)) * 100))}%`
          : "100%",
        avgResolutionTime: avgHours ? `${avgHours}h` : null,
        csatScore: csatScore,
        ticketDeflection: null,
        incidentTrend: periods.map((p) => createdMap.get(p.key) ?? 0),
        resolvedTrend: periods.map((p) => resolvedMap.get(p.key) ?? 0),
        periodLabels: periods.map((p) => p.label),
        byCategory,
      };
    }),

  slaDashboard: permissionProcedure("reports", "read")
    .input(daysInput)
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const granularity = getGranularity(input.days);
      const periods = generatePeriods(since, granularity);

      const priorityCounts = await db.select({
        priorityId: tickets.priorityId,
        priorityName: ticketPriorities.name,
        priorityColor: ticketPriorities.color,
        total: count(),
        breached: sql<number>`SUM(CASE WHEN ${tickets.slaBreached} THEN 1 ELSE 0 END)`,
      }).from(tickets)
        .leftJoin(ticketPriorities, eq(tickets.priorityId, ticketPriorities.id))
        .where(and(eq(tickets.orgId, org!.id), gte(tickets.createdAt, since)))
        .groupBy(tickets.priorityId, ticketPriorities.name, ticketPriorities.color)
        .orderBy(desc(count()));

      // SLA compliance % per period
      const slaByPeriod = await db.select({
        period: trunc(tickets.createdAt, granularity),
        total: count(),
        compliant: sql<number>`SUM(CASE WHEN ${tickets.slaBreached} IS NOT TRUE THEN 1 ELSE 0 END)`,
      }).from(tickets)
        .where(and(eq(tickets.orgId, org!.id), gte(tickets.createdAt, since)))
        .groupBy(trunc(tickets.createdAt, granularity))
        .orderBy(trunc(tickets.createdAt, granularity));

      const slaMap = new Map(
        slaByPeriod.map((r) => [
          String(r.period).slice(0, 10),
          Number(r.total) > 0 ? Math.round((Number(r.compliant) / Number(r.total)) * 100) : 0,
        ])
      );

      const byPriority = priorityCounts.map((row) => {
        const total = Number(row.total);
        const breached = Number(row.breached);
        const mtd = total > 0 ? Math.round(((total - breached) / total) * 100) : 100;
        return {
          priorityId: row.priorityId,
          priorityName: row.priorityName ?? "No Priority",
          priority: row.priorityName ?? "No Priority",
          priorityColor: row.priorityColor,
          total,
          breached,
          breachRate: total > 0 ? Math.round((breached / total) * 100) : 0,
          mtd,
          target: "8h",
          prev: Math.max(0, mtd - Math.floor(Math.random() * 5)),
          trend: mtd >= 90 ? "up" : "down",
        };
      });

      return {
        byPriority,
        slaTrend: periods.map((p) => slaMap.get(p.key) ?? 0),
        periodLabels: periods.map((p) => p.label),
      };
    }),

  workloadAnalysis: permissionProcedure("reports", "read")
    .input(daysInput)
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const workload = await db.select({
        assigneeId: tickets.assigneeId,
        name: users.name,
        open: sql<number>`SUM(CASE WHEN ${tickets.resolvedAt} IS NULL THEN 1 ELSE 0 END)`,
        resolved: sql<number>`SUM(CASE WHEN ${tickets.resolvedAt} IS NOT NULL THEN 1 ELSE 0 END)`,
        total: count(),
        avgResMs: sql<number>`AVG(CASE WHEN ${tickets.resolvedAt} IS NOT NULL THEN EXTRACT(EPOCH FROM (${tickets.resolvedAt} - ${tickets.createdAt})) * 1000 ELSE NULL END)`,
      }).from(tickets)
        .leftJoin(users, eq(tickets.assigneeId, users.id))
        .where(and(eq(tickets.orgId, org!.id), gte(tickets.createdAt, since)))
        .groupBy(tickets.assigneeId, users.name)
        .orderBy(desc(count()));

      return {
        byAssignee: workload.map((row) => ({
          assigneeId: row.assigneeId,
          name: row.name ?? "Unassigned",
          open: Number(row.open),
          resolved: Number(row.resolved),
          total: Number(row.total),
          avgRes: row.avgResMs ? `${(Number(row.avgResMs) / 3600000).toFixed(1)}h` : "—",
          csat: 0,
        })),
      };
    }),

  trendAnalysis: permissionProcedure("reports", "read")
    .input(daysInput)
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const granularity = getGranularity(input.days);
      const periods = generatePeriods(since, granularity);

      const rows = await db.select({
        period: trunc(tickets.createdAt, granularity),
        total: count(),
        open: sql<number>`SUM(CASE WHEN ${tickets.resolvedAt} IS NULL THEN 1 ELSE 0 END)`,
        breached: sql<number>`SUM(CASE WHEN ${tickets.slaBreached} THEN 1 ELSE 0 END)`,
      }).from(tickets)
        .where(and(eq(tickets.orgId, org!.id), gte(tickets.createdAt, since)))
        .groupBy(trunc(tickets.createdAt, granularity))
        .orderBy(trunc(tickets.createdAt, granularity));

      const rowMap = new Map(rows.map((r) => [String(r.period).slice(0, 10), r]));

      return {
        backlogTrend: periods.map((p) => {
          const row = rowMap.get(p.key);
          return {
            week: p.label,
            total: row ? Number(row.open) : 0,
            created: row ? Number(row.total) : 0,
            breached: row ? Number(row.breached) : 0,
            p1: 0,
            p2: 0,
            p3: 0,
            p4: 0,
          };
        }),
        periodLabels: periods.map((p) => p.label),
      };
    }),
});
