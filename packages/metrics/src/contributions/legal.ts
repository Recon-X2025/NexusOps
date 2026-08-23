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

      // Series = matters OPEN at the close of each bucket — the same quantity as
      // `current`, measured over time.
      //
      // It used to be matters OPENED per bucket, which is a different quantity
      // entirely: the card read "Open legal matters: 25" above a chart titled
      // "Open Legal Matters Trend" whose y-axis topped out at 3. One title, two
      // meanings. A matter is open at instant T when it existed by then and had
      // not yet been closed, so the final bucket now reconciles with the headline.
      const trunc = truncSqlExpression(ctx.range.granularity);
      const rows = (await db.execute(sql`
        WITH buckets AS (
          SELECT generate_series(
                   DATE_TRUNC(${sql.raw(`'${trunc}'`)}, ${ctx.range.start.toISOString()}::timestamptz),
                   DATE_TRUNC(${sql.raw(`'${trunc}'`)}, ${ctx.range.end.toISOString()}::timestamptz),
                   ${sql.raw(`'1 ${trunc}'`)}::interval
                 ) AS period
        )
        SELECT b.period AS period,
               COUNT(m.id)::int AS value
          FROM buckets b
          LEFT JOIN legal_matters m
            ON m.org_id = ${ctx.tenantId}
           AND m.created_at < b.period + ${sql.raw(`'1 ${trunc}'`)}::interval
           -- ONE definition of "open", shared with the headline above.
           --
           -- PRESENT: the record's own status column is authoritative, exactly
           -- as the headline reads it, so the final bucket always reconciles
           -- with the number printed above the chart.
           -- PAST: history is reconstructed from closed_at, the only thing that
           -- records WHEN a matter stopped being open.
           --
           -- A bucket is never measured beyond now(); a future state is not a
           -- measurement. That also stops rows with contradictory timestamps
           -- (one closed matter on the demo tenant carries a future closed_at)
           -- from dragging the last point away from the KPI.
           AND (
                 CASE
                   WHEN b.period + ${sql.raw(`'1 ${trunc}'`)}::interval >= now()
                     THEN m.status <> 'closed'
                   ELSE m.status <> 'closed'
                     OR m.closed_at >= b.period + ${sql.raw(`'1 ${trunc}'`)}::interval
                 END
               )
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
