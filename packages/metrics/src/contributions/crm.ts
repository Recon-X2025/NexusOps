import { crmDeals, crmLeads, crmAccounts, eq, and, count, sum, notInArray, sql } from "@coheronconnect/db";
import { registerMetric } from "../registry";
import {
  alignSeries,
  alignSeriesFromKeys,
  buildTimeBuckets,
  bucketsJsonForRecordset,
  emptyMetricValue,
  sqlJsonbLiteral,
  truncSqlExpression,
} from "../resolve-helpers";
import { dbOf } from "./_db";

registerMetric({
  id: "crm.arr_run_rate",
  label: "Pipeline Value (30d Trend)",
  function: "customer",
  dimension: "trend",
  direction: "higher_is_better",
  unit: "currency_inr",
  description: "Sum of open deal values (proxy for forward revenue; refine when ARR history exists).",
  drillUrl: "/app/crm",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    const [row] = await db
      .select({ total: sum(crmDeals.value) })
      .from(crmDeals)
      .where(
        and(eq(crmDeals.orgId, ctx.tenantId), notInArray(crmDeals.stage, ["closed_won", "closed_lost"])),
      );
    const v = Number(row?.total ?? 0);
    if (v === 0) {
      return emptyMetricValue("no_data");
    }

    const buckets = buildTimeBuckets(ctx.range);
    const j = sqlJsonbLiteral(bucketsJsonForRecordset(buckets));
    const snapRows = (await db.execute(sql`
      SELECT x.k AS period_key,
             COALESCE((
               SELECT SUM(CAST(d.value AS numeric))
                 FROM crm_deals d
                WHERE d.org_id = ${ctx.tenantId}
                  AND d.created_at < x.e
                  AND (d.closed_at IS NULL OR d.closed_at >= x.e)
             ), 0)::float8 AS value
        FROM jsonb_to_recordset(${sql.raw(j)}) AS x(s timestamptz, e timestamptz, k text)
       ORDER BY x.s
    `)) as Array<{ period_key: string; value: number }>;
    const series = alignSeriesFromKeys(buckets, snapRows);

    return {
      current: v,
      series,
      state: "healthy" as const,
      lastUpdated: new Date(),
    };
  },
  appearsIn: [
    { role: "ceo", surface: "heatmap", priority: 20 },
    { role: "ceo", surface: "trend", priority: 10 },
    { role: "cfo", surface: "trend", priority: 15 },
  ],
});

registerMetric({
  id: "crm.pipeline_coverage",
  label: "Pipeline coverage",
  function: "customer",
  dimension: "volume",
  direction: "higher_is_better",
  unit: "ratio",
  description: "Open deals per active account (coverage ratio).",
  drillUrl: "/app/crm",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    const [[dealsRow], [acctRow]] = await Promise.all([
      db
        .select({ c: count() })
        .from(crmDeals)
        .where(
          and(eq(crmDeals.orgId, ctx.tenantId), notInArray(crmDeals.stage, ["closed_won", "closed_lost"])),
        ),
      db.select({ c: count() }).from(crmAccounts).where(eq(crmAccounts.orgId, ctx.tenantId)),
    ]);
    const deals = Number(dealsRow?.c ?? 0);
    const accts = Number(acctRow?.c ?? 0);
    if (accts === 0) {
      return emptyMetricValue("no_data");
    }
    const ratio = Math.round((deals / accts) * 100) / 100;

    const buckets = buildTimeBuckets(ctx.range);
    const j = sqlJsonbLiteral(bucketsJsonForRecordset(buckets));
    const snapRows = (await db.execute(sql`
      SELECT x.k AS period_key,
             ROUND(
               COALESCE((
                 SELECT COUNT(*)::numeric
                   FROM crm_deals d
                  WHERE d.org_id = ${ctx.tenantId}
                    AND d.created_at < x.e
                    AND (d.closed_at IS NULL OR d.closed_at >= x.e)
               ), 0)
               / NULLIF((
                 SELECT COUNT(*)::numeric
                   FROM crm_accounts a
                  WHERE a.org_id = ${ctx.tenantId}
                    AND a.created_at < x.e
               ), 0),
               2
             )::float8 AS value
        FROM jsonb_to_recordset(${sql.raw(j)}) AS x(s timestamptz, e timestamptz, k text)
       ORDER BY x.s
    `)) as Array<{ period_key: string; value: number }>;
    const series = alignSeriesFromKeys(buckets, snapRows);

    return {
      current: ratio,
      series,
      state: ratio >= 1 ? "healthy" : "watch",
      lastUpdated: new Date(),
    };
  },
  appearsIn: [
    { role: "ceo", surface: "heatmap", priority: 21 },
    { role: "ceo", surface: "trend", priority: 12 },
    { role: "ceo", surface: "bullet", priority: 28 },
  ],
});

registerMetric({
  id: "crm.new_leads",
  label: "New leads",
  function: "customer",
  dimension: "volume",
  direction: "higher_is_better",
  unit: "count",
  drillUrl: "/app/crm",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    const [row] = await db
      .select({ c: count() })
      .from(crmLeads)
      .where(and(eq(crmLeads.orgId, ctx.tenantId), eq(crmLeads.status, "new")));
    const n = Number(row?.c ?? 0);

    // Real lead-creation series across the metric range.
    const trunc = truncSqlExpression(ctx.range.granularity);
    const rows = (await db.execute(sql`
      SELECT DATE_TRUNC(${sql.raw(`'${trunc}'`)}, created_at) AS period,
             COUNT(*)::int AS value
        FROM crm_leads
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
      state: n > 0 ? "healthy" : "no_data",
      lastUpdated: new Date(),
    };
  },
  appearsIn: [
    { role: "ceo", surface: "flow", priority: 30 },
    { role: "ceo", surface: "trend", priority: 25 },
    { role: "coo", surface: "flow", priority: 30 },
  ],
});
