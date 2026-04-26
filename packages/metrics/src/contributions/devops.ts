import { deployments, eq, and, count, sql } from "@nexusops/db";
import { registerMetric } from "../registry";
import { alignSeries, buildTimeBuckets, emptyMetricValue, truncSqlExpression } from "../resolve-helpers";
import { dbOf } from "./_db";

registerMetric({
  id: "devops.deploy_success_rate",
  label: "Deploy success rate (30d)",
  function: "devops",
  dimension: "sla",
  direction: "higher_is_better",
  unit: "percent",
  target: 92,
  description: "Successful production deployments vs total attempts in the last 30 days.",
  drillUrl: "/app/developer-ops",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    const since = new Date(Date.now() - 30 * 86400000);
    const [totalRow] = await db
      .select({ c: count() })
      .from(deployments)
      .where(
        and(
          eq(deployments.orgId, ctx.tenantId),
          eq(deployments.environment, "production"),
          sql`started_at >= ${since.toISOString()}`,
        ),
      );
    const total = Number(totalRow?.c ?? 0);
    if (total === 0) {
      return emptyMetricValue("no_data");
    }
    const [failRow] = await db
      .select({ c: count() })
      .from(deployments)
      .where(
        and(
          eq(deployments.orgId, ctx.tenantId),
          eq(deployments.environment, "production"),
          eq(deployments.status, "failed"),
          sql`started_at >= ${since.toISOString()}`,
        ),
      );
    const failed = Number(failRow?.c ?? 0);
    const pct = Math.round(((total - failed) / total) * 1000) / 10;
    const state = pct >= 92 ? "healthy" : pct >= 85 ? "watch" : "stressed";

    // Per-bucket success rate over the metric range.
    const trunc = truncSqlExpression(ctx.range.granularity);
    const rows = (await db.execute(sql`
      SELECT DATE_TRUNC(${sql.raw(`'${trunc}'`)}, started_at) AS period,
             COUNT(*)::int AS total,
             SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::int AS failed
        FROM deployments
       WHERE org_id = ${ctx.tenantId}
         AND environment = 'production'
         AND started_at >= ${ctx.range.start.toISOString()}
         AND started_at <= ${ctx.range.end.toISOString()}
       GROUP BY 1
       ORDER BY 1
    `)) as Array<{ period: unknown; total: number; failed: number }>;
    const series = alignSeries(
      buildTimeBuckets(ctx.range),
      rows.map((r) => ({
        period: r.period,
        value: Number(r.total) > 0 ? Math.round(((Number(r.total) - Number(r.failed)) / Number(r.total)) * 1000) / 10 : 0,
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
    { role: "ceo", surface: "heatmap", priority: 100 },
    { role: "ceo", surface: "trend", priority: 35 },
    { role: "cio", surface: "heatmap", priority: 9 },
    { role: "cio", surface: "bullet", priority: 10 },
  ],
});

registerMetric({
  id: "devops.deploys_production_30d",
  label: "Production deploys (30d)",
  function: "devops",
  dimension: "volume",
  direction: "higher_is_better",
  unit: "count",
  drillUrl: "/app/developer-ops",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    const since = new Date(Date.now() - 30 * 86400000);
    const [row] = await db
      .select({ c: count() })
      .from(deployments)
      .where(
        and(eq(deployments.orgId, ctx.tenantId), eq(deployments.environment, "production"), sql`started_at >= ${since.toISOString()}`),
      );
    const n = Number(row?.c ?? 0);

    const trunc = truncSqlExpression(ctx.range.granularity);
    const rows = (await db.execute(sql`
      SELECT DATE_TRUNC(${sql.raw(`'${trunc}'`)}, started_at) AS period,
             COUNT(*)::int AS value
        FROM deployments
       WHERE org_id = ${ctx.tenantId}
         AND environment = 'production'
         AND started_at >= ${ctx.range.start.toISOString()}
         AND started_at <= ${ctx.range.end.toISOString()}
       GROUP BY 1
       ORDER BY 1
    `)) as Array<{ period: unknown; value: number }>;
    const series = alignSeries(buildTimeBuckets(ctx.range), rows);

    return {
      current: n,
      series,
      state: n > 0 ? "healthy" : "no_data",
      lastUpdated: new Date(),
    };
  },
  appearsIn: [
    { role: "cio", surface: "flow", priority: 41 },
    { role: "ceo", surface: "flow", priority: 50 },
  ],
});
