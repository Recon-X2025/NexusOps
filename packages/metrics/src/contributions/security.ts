import { securityIncidents, eq, and, count, sql } from "@nexusops/db";
import { registerMetric } from "../registry";
import { alignSeries, buildTimeBuckets, truncSqlExpression } from "../resolve-helpers";
import { dbOf } from "./_db";

registerMetric({
  id: "security.critical_open",
  label: "Critical security incidents (open)",
  function: "security",
  dimension: "risk",
  direction: "lower_is_better",
  unit: "count",
  target: 0,
  description: "Security incidents with critical severity not closed or dismissed.",
  drillUrl: "/app/security",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    const [row] = await db
      .select({ c: count() })
      .from(securityIncidents)
      .where(
        and(
          eq(securityIncidents.orgId, ctx.tenantId),
          eq(securityIncidents.severity, "critical"),
          sql`${securityIncidents.status} NOT IN ('closed', 'false_positive')`,
        ),
      );
    const n = Number(row?.c ?? 0);
    const state = n === 0 ? "healthy" : n > 2 ? "stressed" : "watch";
    return {
      current: n,
      // Snapshot of currently open incidents — no defensible per-bucket history.
      series: [],
      state,
      lastUpdated: new Date(),
    };
  },
  appearsIn: [
    { role: "ceo", surface: "heatmap", priority: 90 },
    { role: "ceo", surface: "risk", priority: 8 },
    { role: "cio", surface: "heatmap", priority: 8 },
    { role: "ciso", surface: "heatmap", priority: 5 },
  ],
});

registerMetric({
  id: "security.incidents_open_total",
  label: "Open security incidents",
  function: "security",
  dimension: "volume",
  direction: "lower_is_better",
  unit: "count",
  drillUrl: "/app/security",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    const [row] = await db
      .select({ c: count() })
      .from(securityIncidents)
      .where(
        and(
          eq(securityIncidents.orgId, ctx.tenantId),
          sql`${securityIncidents.status} NOT IN ('closed', 'false_positive')`,
        ),
      );
    const n = Number(row?.c ?? 0);

    // Series = incidents created per bucket in the metric range (real history).
    const trunc = truncSqlExpression(ctx.range.granularity);
    const rows = (await db.execute(sql`
      SELECT DATE_TRUNC(${sql.raw(`'${trunc}'`)}, created_at) AS period,
             COUNT(*)::int AS value
        FROM security_incidents
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
      state: n > 20 ? "stressed" : n > 8 ? "watch" : "healthy",
      lastUpdated: new Date(),
    };
  },
  appearsIn: [
    { role: "cio", surface: "flow", priority: 40 },
    { role: "ciso", surface: "trend", priority: 10 },
  ],
});
