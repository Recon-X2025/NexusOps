import { securityIncidents, eq, and, count, sql } from "@coheronconnect/db";
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

    // Series = incidents OPEN at the close of each bucket — the same quantity as
    // `current`, measured over time. It used to be incidents CREATED per bucket,
    // a different quantity entirely: the headline read "open now" above a chart
    // of arrivals, so the two disagreed and the final point never matched the
    // number printed above it. Same reconstruction as legal.open_matters.
    //   PRESENT: the record's own status is authoritative, exactly as the
    //   headline reads it, so the final bucket reconciles with the KPI.
    //   PAST: resolved_at reconstructs when an incident stopped being open.
    //   A bucket is never measured beyond now() — a future state is not a
    //   measurement.
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
             COUNT(si.id)::int AS value
        FROM buckets b
        LEFT JOIN security_incidents si
          ON si.org_id = ${ctx.tenantId}
         AND si.created_at < b.period + ${sql.raw(`'1 ${trunc}'`)}::interval
         AND (
               CASE
                 WHEN b.period + ${sql.raw(`'1 ${trunc}'`)}::interval >= now()
                   THEN si.status NOT IN ('closed', 'false_positive')
                 ELSE si.status NOT IN ('closed', 'false_positive')
                   OR si.resolved_at >= b.period + ${sql.raw(`'1 ${trunc}'`)}::interval
               END
             )
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
