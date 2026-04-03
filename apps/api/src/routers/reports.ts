import { router, permissionProcedure } from "../lib/trpc";
import { z } from "zod";
import {
  tickets,
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

export const reportsRouter = router({
  executiveOverview: permissionProcedure("reports", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [{ openTickets }] = await db.select({ openTickets: count() }).from(tickets)
      .where(and(
        eq(tickets.orgId, org!.id),
        sql`${tickets.statusId} IN (SELECT id FROM ticket_statuses WHERE org_id = ${org!.id} AND category IN ('open', 'in_progress'))`,
      ));

    const [{ resolvedToday }] = await db.select({ resolvedToday: count() }).from(tickets)
      .where(and(
        eq(tickets.orgId, org!.id),
        gte(tickets.resolvedAt, today),
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

    // Real avg resolution time from tickets resolved in last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [{ avgMs }] = await db.select({
      avgMs: sql<number>`AVG(EXTRACT(EPOCH FROM (${tickets.resolvedAt} - ${tickets.createdAt})) * 1000)`,
    }).from(tickets)
      .where(and(
        eq(tickets.orgId, org!.id),
        isNotNull(tickets.resolvedAt),
        gte(tickets.resolvedAt, thirtyDaysAgo),
      ));
    const avgHours = avgMs ? (Number(avgMs) / 3600000).toFixed(1) : null;

    // Real CSAT score from survey responses in last 30 days
    const [{ avgCsat }] = await db.select({
      avgCsat: avg(surveyResponses.score),
    }).from(surveyResponses)
      .where(gte(surveyResponses.submittedAt, thirtyDaysAgo));
    const csatScore = avgCsat ? `${Number(avgCsat).toFixed(1)}/5` : null;

    return {
      openTickets: Number(openTickets),
      resolvedToday: Number(resolvedToday),
      slaBreached: Number(slaBreached),
      securityIncidentsOpen: Number(secIncidents),
      pendingChanges: Number(pendingChanges),
      budgetVariancePct: budgetVariance,
      openIncidents: Number(openTickets),
      resolvedMtd: Number(resolvedToday),
      slaCompliance: slaBreached ? `${Math.max(0, Math.round((1 - Number(slaBreached) / Math.max(Number(openTickets), 1)) * 100))}%` : "100%",
      avgResolutionTime: avgHours ? `${avgHours}h` : null,
      csatScore: csatScore,
      ticketDeflection: null,
      incidentTrend: [0, 0, 0, 0, 0, 0, 0] as number[],
      resolvedTrend: [0, 0, 0, 0, 0, 0, 0] as number[],
      byCategory: [] as Array<{ category: string; count: number }>,
    };
  }),

  slaDashboard: permissionProcedure("reports", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;

    const priorityCounts = await db.select({
      priorityId: tickets.priorityId,
      priorityName: ticketPriorities.name,
      priorityColor: ticketPriorities.color,
      total: count(),
      breached: sql<number>`SUM(CASE WHEN ${tickets.slaBreached} THEN 1 ELSE 0 END)`,
    }).from(tickets)
      .leftJoin(ticketPriorities, eq(tickets.priorityId, ticketPriorities.id))
      .where(eq(tickets.orgId, org!.id))
      .groupBy(tickets.priorityId, ticketPriorities.name, ticketPriorities.color)
      .orderBy(desc(count()));

    return priorityCounts.map((row: any) => ({
      priorityId: row.priorityId,
      priorityName: row.priorityName ?? "No Priority",
      priorityColor: row.priorityColor,
      total: Number(row.total),
      breached: Number(row.breached),
      breachRate: row.total > 0 ? Math.round((Number(row.breached) / Number(row.total)) * 100) : 0,
    }));
  }),

  workloadAnalysis: permissionProcedure("reports", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;

    const workload = await db.select({
      assigneeId: tickets.assigneeId,
      total: count(),
      open: sql<number>`SUM(CASE WHEN ${tickets.resolvedAt} IS NULL THEN 1 ELSE 0 END)`,
    }).from(tickets)
      .where(eq(tickets.orgId, org!.id))
      .groupBy(tickets.assigneeId)
      .orderBy(desc(count()));

    return workload.map((row: any) => ({
      assigneeId: row.assigneeId,
      total: Number(row.total),
      open: Number(row.open),
    }));
  }),

  trendAnalysis: permissionProcedure("reports", "read")
    .input(z.object({ days: z.coerce.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const rows = await db.select({
        date: sql<string>`DATE(${tickets.createdAt})`,
        cnt: count(),
      }).from(tickets)
        .where(and(eq(tickets.orgId, org!.id), gte(tickets.createdAt, since)))
        .groupBy(sql`DATE(${tickets.createdAt})`)
        .orderBy(sql`DATE(${tickets.createdAt})`);

      return rows.map((row: any) => ({
        date: row.date,
        count: Number(row.cnt),
      }));
    }),
});
