import { registerMetric } from "../registry";
import { alignSeries, buildTimeBuckets, emptyMetricValue, truncSqlExpression } from "../resolve-helpers";
import { crmAccounts, surveys, surveyResponses, eq, and, count, avg, sql } from "@nexusops/db";
import { dbOf } from "./_db";

registerMetric({
  id: "csm.churn_rate_30d",
  label: "Churn rate (30d)",
  function: "customer",
  dimension: "risk",
  direction: "lower_is_better",
  unit: "percent",
  description: "// TODO: contribute from subscription / contract churn signal when available.",
  drillUrl: "/app/csm",
  resolve: async () => emptyMetricValue("no_data"),
  appearsIn: [
    { role: "ceo", surface: "heatmap", priority: 40 },
    { role: "ceo", surface: "trend", priority: 40 },
    { role: "ceo", surface: "attention", priority: 5 },
  ],
});

registerMetric({
  id: "csm.csat_avg",
  label: "Average CSAT",
  function: "customer",
  dimension: "sla",
  direction: "higher_is_better",
  unit: "score",
  target: 4,
  description: "Rolling average CSAT score when survey responses exist.",
  drillUrl: "/app/surveys",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    try {
      const [row] = await db
        .select({ a: avg(surveyResponses.score) })
        .from(surveyResponses)
        .innerJoin(surveys, eq(surveyResponses.surveyId, surveys.id))
        .where(and(eq(surveys.orgId, ctx.tenantId), eq(surveys.type, "csat")));
      const v = row?.a != null ? Number(row.a) : NaN;
      if (Number.isNaN(v) || v === 0) {
        return emptyMetricValue("no_data");
      }
      const state = v >= 4 ? "healthy" : v >= 3 ? "watch" : "stressed";

      // Per-bucket average CSAT over the metric range from real responses.
      const trunc = truncSqlExpression(ctx.range.granularity);
      const rows = (await db.execute(sql`
        SELECT DATE_TRUNC(${sql.raw(`'${trunc}'`)}, sr.submitted_at) AS period,
               AVG(sr.score)::float8 AS value
          FROM survey_responses sr
          JOIN surveys s ON s.id = sr.survey_id
         WHERE s.org_id = ${ctx.tenantId}
           AND s.type = 'csat'
           AND sr.submitted_at >= ${ctx.range.start.toISOString()}
           AND sr.submitted_at <= ${ctx.range.end.toISOString()}
         GROUP BY 1
         ORDER BY 1
      `)) as Array<{ period: unknown; value: number | null }>;
      const series = alignSeries(
        buildTimeBuckets(ctx.range),
        rows.map((r) => ({
          period: r.period,
          value: r.value != null ? Math.round(Number(r.value) * 10) / 10 : 0,
        })),
      );

      return {
        current: Math.round(v * 10) / 10,
        series,
        state,
        lastUpdated: new Date(),
      };
    } catch {
      return emptyMetricValue("no_data");
    }
  },
  appearsIn: [
    { role: "ceo", surface: "heatmap", priority: 41 },
    { role: "ceo", surface: "bullet", priority: 25 },
    { role: "ceo", surface: "attention", priority: 8 },
  ],
});

registerMetric({
  id: "csm.cases_open",
  label: "Open CSM cases",
  function: "customer",
  dimension: "risk",
  direction: "lower_is_better",
  unit: "count",
  drillUrl: "/app/csm",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    let open = 0;
    try {
      const rows = await db.execute(sql`
        SELECT COUNT(*)::text AS open_cnt
        FROM csm_cases
        WHERE org_id = ${ctx.tenantId}
          AND status NOT IN ('resolved', 'closed')
      `);
      const r = (rows as { open_cnt: string }[])[0];
      open = Number(r?.open_cnt ?? 0);
    } catch {
      open = 0;
    }
    if (open === 0) {
      return emptyMetricValue("no_data");
    }
    return {
      current: open,
      // Open count is a snapshot — historical backlog needs status snapshots.
      series: [],
      state: open > 25 ? "stressed" : open > 10 ? "watch" : "healthy",
      lastUpdated: new Date(),
    };
  },
  appearsIn: [
    { role: "ceo", surface: "flow", priority: 31 },
    { role: "coo", surface: "flow", priority: 31 },
  ],
});

registerMetric({
  id: "csm.cases_created_period",
  label: "CSM cases opened (period)",
  function: "customer",
  dimension: "volume",
  direction: "lower_is_better",
  unit: "count",
  drillUrl: "/app/csm",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    let n = 0;
    let series: { t: string; v: number }[] = [];
    try {
      const rows = await db.execute(sql`
        SELECT COUNT(*)::text AS n
        FROM csm_cases
        WHERE org_id = ${ctx.tenantId}
          AND created_at >= ${ctx.range.start.toISOString()}
          AND created_at <= ${ctx.range.end.toISOString()}
      `);
      n = Number((rows as { n: string }[])[0]?.n ?? 0);

      const trunc = truncSqlExpression(ctx.range.granularity);
      const bucketRows = (await db.execute(sql`
        SELECT DATE_TRUNC(${sql.raw(`'${trunc}'`)}, created_at) AS period,
               COUNT(*)::int AS value
          FROM csm_cases
         WHERE org_id = ${ctx.tenantId}
           AND created_at >= ${ctx.range.start.toISOString()}
           AND created_at <= ${ctx.range.end.toISOString()}
         GROUP BY 1
         ORDER BY 1
      `)) as Array<{ period: unknown; value: number }>;
      series = alignSeries(buildTimeBuckets(ctx.range), bucketRows);
    } catch {
      n = 0;
      series = [];
    }
    return {
      current: n,
      series,
      state: "healthy",
      lastUpdated: new Date(),
    };
  },
  appearsIn: [
    { role: "ceo", surface: "flow", priority: 29 },
    { role: "coo", surface: "flow", priority: 29 },
  ],
});

registerMetric({
  id: "csm.cases_resolved_period",
  label: "CSM cases resolved (period)",
  function: "customer",
  dimension: "trend",
  direction: "higher_is_better",
  unit: "count",
  drillUrl: "/app/csm",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    let n = 0;
    let series: { t: string; v: number }[] = [];
    try {
      const rows = await db.execute(sql`
        SELECT COUNT(*)::text AS n
        FROM csm_cases
        WHERE org_id = ${ctx.tenantId}
          AND status = 'resolved'
          AND updated_at >= ${ctx.range.start.toISOString()}
          AND updated_at <= ${ctx.range.end.toISOString()}
      `);
      n = Number((rows as { n: string }[])[0]?.n ?? 0);

      const trunc = truncSqlExpression(ctx.range.granularity);
      const bucketRows = (await db.execute(sql`
        SELECT DATE_TRUNC(${sql.raw(`'${trunc}'`)}, updated_at) AS period,
               COUNT(*)::int AS value
          FROM csm_cases
         WHERE org_id = ${ctx.tenantId}
           AND status = 'resolved'
           AND updated_at >= ${ctx.range.start.toISOString()}
           AND updated_at <= ${ctx.range.end.toISOString()}
         GROUP BY 1
         ORDER BY 1
      `)) as Array<{ period: unknown; value: number }>;
      series = alignSeries(buildTimeBuckets(ctx.range), bucketRows);
    } catch {
      n = 0;
      series = [];
    }
    return {
      current: n,
      series,
      state: n >= 0 ? "healthy" : "no_data",
      lastUpdated: new Date(),
    };
  },
  appearsIn: [
    { role: "ceo", surface: "flow", priority: 32 },
    { role: "coo", surface: "flow", priority: 32 },
  ],
});

registerMetric({
  id: "csm.accounts_backing",
  label: "CSM accounts",
  function: "customer",
  dimension: "volume",
  direction: "higher_is_better",
  unit: "count",
  drillUrl: "/app/csm",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    const [row] = await db.select({ c: count() }).from(crmAccounts).where(eq(crmAccounts.orgId, ctx.tenantId));
    const n = Number(row?.c ?? 0);
    return {
      current: n,
      // Account roster is a snapshot.
      series: [],
      state: n > 0 ? "healthy" : "no_data",
      lastUpdated: new Date(),
    };
  },
  appearsIn: [{ role: "coo", surface: "heatmap", priority: 50 }],
});
