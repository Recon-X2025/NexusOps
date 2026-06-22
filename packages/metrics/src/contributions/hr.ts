import { employees, eq, and, count, sql } from "@coheronconnect/db";
import { registerMetric } from "../registry";
import {
  alignSeriesFromKeys,
  buildTimeBuckets,
  bucketsJsonForRecordset,
  emptyMetricValue,
  sqlJsonbLiteral,
} from "../resolve-helpers";
import { dbOf } from "./_db";

registerMetric({
  id: "hr.headcount_actual_vs_plan",
  label: "Active headcount",
  function: "people",
  dimension: "trend",
  direction: "higher_is_better",
  unit: "count",
  description: "Active employees; plan target // TODO when workforce planning feed exists.",
  drillUrl: "/app/hr",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    const [activeRow] = await db
      .select({ c: count() })
      .from(employees)
      .where(and(eq(employees.orgId, ctx.tenantId), eq(employees.status, "active")));
    const active = Number(activeRow?.c ?? 0);
    const [prevRow] = await db
      .select({ c: count() })
      .from(employees)
      .where(
        and(
          eq(employees.orgId, ctx.tenantId),
          eq(employees.status, "active"),
          sql`${employees.startDate} < ${ctx.range.start.toISOString()}`,
        ),
      );
    const previous = Number(prevRow?.c ?? 0);
    if (active === 0) {
      return emptyMetricValue("no_data");
    }

    const buckets = buildTimeBuckets(ctx.range);
    const j = sqlJsonbLiteral(bucketsJsonForRecordset(buckets));
    const snapRows = (await db.execute(sql`
      SELECT x.k AS period_key,
             (SELECT COUNT(*)::int
                FROM employees e
               WHERE e.org_id = ${ctx.tenantId}
                 AND e.start_date IS NOT NULL
                 AND e.start_date < x.e
                 AND (e.end_date IS NULL OR e.end_date >= x.e)
             ) AS value
        FROM jsonb_to_recordset(${sql.raw(j)}) AS x(s timestamptz, e timestamptz, k text)
       ORDER BY x.s
    `)) as Array<{ period_key: string; value: number }>;
    const series = alignSeriesFromKeys(buckets, snapRows);

    return {
      current: active,
      previous: previous || undefined,
      series,
      state: "healthy",
      lastUpdated: new Date(),
    };
  },
  appearsIn: [
    { role: "ceo", surface: "heatmap", priority: 70 },
    { role: "ceo", surface: "trend", priority: 15 },
    { role: "chro", surface: "trend", priority: 5 },
    { role: "coo", surface: "trend", priority: 18 },
  ],
});
