import { legalMatters, eq, and, count, ne, sql } from "@coheronconnect/db";
import { registerMetric } from "../registry";
import { alignSeries, buildTimeBuckets, emptyMetricValue, truncSqlExpression } from "../resolve-helpers";
import { dbOf } from "./_db";

registerMetric({
  id: "legal.open_matters",
  label: "Open legal matters",
  function: "legal",
  dimension: "volume",
  direction: "lower_is_better",
  unit: "count",
  drillUrl: "/app/legal",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    try {
      const [anyRow] = await db
        .select({ c: count() })
        .from(legalMatters)
        .where(eq(legalMatters.orgId, ctx.tenantId));
      if (Number(anyRow?.c ?? 0) === 0) {
        return emptyMetricValue("no_data");
      }
      const [row] = await db
        .select({ c: count() })
        .from(legalMatters)
        .where(and(eq(legalMatters.orgId, ctx.tenantId), ne(legalMatters.status, "closed")));
      const n = Number(row?.c ?? 0);

      // Series = matters opened per bucket in the metric range (real history).
      const trunc = truncSqlExpression(ctx.range.granularity);
      const rows = (await db.execute(sql`
        SELECT DATE_TRUNC(${sql.raw(`'${trunc}'`)}, created_at) AS period,
               COUNT(*)::int AS value
          FROM legal_matters
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
        state: n > 15 ? "stressed" : n > 5 ? "watch" : "healthy",
        lastUpdated: new Date(),
      };
    } catch {
      return emptyMetricValue("no_data");
    }
  },
  appearsIn: [
    { role: "ceo", surface: "heatmap", priority: 110 },
    { role: "gc", surface: "trend", priority: 5 },
    { role: "cs", surface: "risk", priority: 10 },
  ],
});
