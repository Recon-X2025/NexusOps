import { tickets, ticketStatuses, eq, and, count, sql, gte, lte } from "@coheronconnect/db";
import { registerMetric } from "../registry";
import {
  alignSeries,
  buildTimeBuckets,
  emptyMetricValue,
  truncSqlExpression,
} from "../resolve-helpers";
import { dbOf } from "./_db";

registerMetric({
  id: "tickets.open_total",
  label: "Active requests",
  function: "it_services",
  dimension: "volume",
  direction: "lower_is_better",
  unit: "count",
  target: 50,
  description: "All tickets in an open workflow state for the org.",
  drillUrl: "/app/tickets",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    const [row] = await db
      .select({ c: count() })
      .from(tickets)
      .innerJoin(ticketStatuses, eq(tickets.statusId, ticketStatuses.id))
      .where(and(eq(tickets.orgId, ctx.tenantId), eq(ticketStatuses.category, "open")));
    const n = Number(row?.c ?? 0);
    const state = n === 0 ? "healthy" : n > 80 ? "stressed" : n > 50 ? "watch" : "healthy";
    return {
      current: n,
      // "Currently open" is a point-in-time count; without a daily snapshot
      // table there is no honest history to backfill, so leave the series empty.
      series: [],
      state,
      lastUpdated: new Date(),
    };
  },
  appearsIn: [
    { role: "ceo", surface: "heatmap", priority: 10 },
    { role: "ceo", surface: "flow", priority: 20 },
    { role: "coo", surface: "heatmap", priority: 10 },
    { role: "coo", surface: "attention", priority: 15 },
    { role: "cio", surface: "heatmap", priority: 5 },
    { role: "cio", surface: "flow", priority: 10 },
  ],
});

registerMetric({
  id: "tickets.sla_compliance",
  label: "Request SLA compliance",
  function: "it_services",
  dimension: "sla",
  direction: "higher_is_better",
  unit: "percent",
  target: 95,
  description: "Share of tickets not flagged with SLA breach.",
  drillUrl: "/app/tickets",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    const [[totalRow], [breachRow]] = await Promise.all([
      db.select({ c: count() }).from(tickets).where(eq(tickets.orgId, ctx.tenantId)),
      db
        .select({ c: count() })
        .from(tickets)
        .where(and(eq(tickets.orgId, ctx.tenantId), eq(tickets.slaBreached, true))),
    ]);
    const total = Number(totalRow?.c ?? 0);
    if (total === 0) {
      return emptyMetricValue("no_data");
    }
    const breached = Number(breachRow?.c ?? 0);
    const pct = Math.round(((total - breached) / total) * 1000) / 10;
    const state = pct >= 95 ? "healthy" : pct >= 85 ? "watch" : "stressed";

    // Per-bucket compliance over the metric range.
    const trunc = truncSqlExpression(ctx.range.granularity);
    const rows = (await db.execute(sql`
      SELECT DATE_TRUNC(${sql.raw(`'${trunc}'`)}, created_at) AS period,
             COUNT(*)::int AS total,
             SUM(CASE WHEN sla_breached IS NOT TRUE THEN 1 ELSE 0 END)::int AS compliant
        FROM tickets
       WHERE org_id = ${ctx.tenantId}
         AND created_at >= ${ctx.range.start.toISOString()}
         AND created_at <= ${ctx.range.end.toISOString()}
       GROUP BY 1
       ORDER BY 1
    `)) as Array<{ period: unknown; total: number; compliant: number }>;

    const buckets = buildTimeBuckets(ctx.range);
    const series = alignSeries(
      buckets,
      rows.map((r) => ({
        period: r.period,
        value: Number(r.total) > 0 ? Math.round((Number(r.compliant) / Number(r.total)) * 1000) / 10 : 0,
      })),
    );

    return {
      current: pct,
      series,
      state,
      lastUpdated: new Date(),
    };
  },
  appearsIn: [
    { role: "ceo", surface: "heatmap", priority: 11 },
    { role: "ceo", surface: "trend", priority: 28 },
    { role: "cio", surface: "heatmap", priority: 6 },
    { role: "cio", surface: "bullet", priority: 12 },
    { role: "coo", surface: "bullet", priority: 20 },
  ],
});

registerMetric({
  id: "tickets.throughput_created",
  label: "Requests opened (period)",
  function: "it_services",
  dimension: "trend",
  direction: "lower_is_better",
  unit: "count",
  drillUrl: "/app/tickets",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    const [row] = await db
      .select({ c: count() })
      .from(tickets)
      .where(
        and(
          eq(tickets.orgId, ctx.tenantId),
          gte(tickets.createdAt, ctx.range.start),
          lte(tickets.createdAt, ctx.range.end),
        ),
      );
    const n = Number(row?.c ?? 0);

    const trunc = truncSqlExpression(ctx.range.granularity);
    const rows = (await db.execute(sql`
      SELECT DATE_TRUNC(${sql.raw(`'${trunc}'`)}, created_at) AS period,
             COUNT(*)::int AS value
        FROM tickets
       WHERE org_id = ${ctx.tenantId}
         AND created_at >= ${ctx.range.start.toISOString()}
         AND created_at <= ${ctx.range.end.toISOString()}
       GROUP BY 1
       ORDER BY 1
    `)) as Array<{ period: unknown; value: number }>;
    const series = alignSeries(buildTimeBuckets(ctx.range), rows);

    return {
      current: n,
      series,
      state: "healthy",
      lastUpdated: new Date(),
    };
  },
  appearsIn: [
    { role: "ceo", surface: "flow", priority: 10 },
    { role: "coo", surface: "flow", priority: 10 },
    { role: "cio", surface: "flow", priority: 5 },
  ],
});

registerMetric({
  id: "tickets.throughput_resolved",
  label: "Requests resolved (period)",
  function: "it_services",
  dimension: "trend",
  direction: "higher_is_better",
  unit: "count",
  drillUrl: "/app/tickets",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    const [row] = await db
      .select({ c: count() })
      .from(tickets)
      .where(
        and(
          eq(tickets.orgId, ctx.tenantId),
          sql`${tickets.resolvedAt} IS NOT NULL`,
          gte(tickets.resolvedAt, ctx.range.start),
          lte(tickets.resolvedAt, ctx.range.end),
        ),
      );
    const n = Number(row?.c ?? 0);

    const trunc = truncSqlExpression(ctx.range.granularity);
    const rows = (await db.execute(sql`
      SELECT DATE_TRUNC(${sql.raw(`'${trunc}'`)}, resolved_at) AS period,
             COUNT(*)::int AS value
        FROM tickets
       WHERE org_id = ${ctx.tenantId}
         AND resolved_at IS NOT NULL
         AND resolved_at >= ${ctx.range.start.toISOString()}
         AND resolved_at <= ${ctx.range.end.toISOString()}
       GROUP BY 1
       ORDER BY 1
    `)) as Array<{ period: unknown; value: number }>;
    const series = alignSeries(buildTimeBuckets(ctx.range), rows);

    return {
      current: n,
      series,
      state: "healthy",
      lastUpdated: new Date(),
    };
  },
  appearsIn: [
    { role: "ceo", surface: "flow", priority: 11 },
    { role: "coo", surface: "flow", priority: 11 },
    { role: "cio", surface: "flow", priority: 6 },
  ],
});
