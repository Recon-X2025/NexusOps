/**
 * IN/OUT FLOW PAIRS — the business-level view the platform flow panel needs.
 *
 * The Platform Command Center's Volume Throughput panel is platform-wide by
 * design, but `HUB_FLOW_SEEDS` only had seeds for it_services, customer and
 * devops. Security, people, finance, legal and strategy had no seed and could
 * never contribute, so a "platform" total silently spoke for three of eight
 * functions.
 *
 * The gap was not the wiring — those five domains had only SNAPSHOT metrics
 * (open matters, headcount, open payables). A flow panel needs a pair: how much
 * arrived and how much cleared. This file supplies that pair for each of them,
 * built only where the underlying table can genuinely answer both halves:
 *
 *   security   incidents opened      / resolved      (created_at / resolved_at)
 *   people     joiners               / leavers       (start_date / end_date)
 *   finance    invoices raised       / paid          (created_at / paid_at)
 *   legal      matters opened        / closed        (created_at / closed_at)
 *   strategy   approvals raised      / decided       (created_at / decided_at)
 *
 * Nothing here is synthesised: every metric counts rows in a real column over
 * the requested range, and each is `dimension: "trend"` so it feeds flow rather
 * than competing for a heatmap cell with the existing snapshot metrics.
 *
 * People is the one worth reading twice. Joiners/leavers is the honest flow for
 * headcount — `hr.headcount_active` is a level, not a movement, and subtracting
 * two levels would report churn the tables do not claim.
 */
import {
  securityIncidents,
  employees,
  invoices,
  legalMatters,
  approvalRequests,
  eq,
  and,
  gte,
  lte,
  count,
  isNotNull,
  sql,
} from "@coheronconnect/db";
import { registerMetric } from "../registry";
import {
  alignSeries,
  buildTimeBuckets,
  emptyMetricValue,
  truncSqlExpression,
  stateFromFlowSeries,
} from "../resolve-helpers";
import { dbOf } from "./_db";

type Dir = "higher_is_better" | "lower_is_better";

/**
 * One counted-rows-over-a-date-column metric.
 *
 * `table`/`column` are interpolated with `sql.raw` because they are literals
 * chosen here, never caller input.
 */
function registerFlowMetric(opts: {
  id: string;
  label: string;
  fn: "security" | "people" | "finance" | "legal" | "strategy";
  table: string;
  dateColumn: string;
  direction: Dir;
  drillUrl: string;
  /** Extra SQL predicate, already safe (literals only). */
  extraWhere?: string;
  /** Some tables date-stamp without an org column of their own. */
  orgColumn?: string;
}) {
  registerMetric({
    id: opts.id,
    label: opts.label,
    function: opts.fn,
    dimension: "trend",
    direction: opts.direction,
    unit: "count",
    drillUrl: opts.drillUrl,
    resolve: async (ctx) => {
      const db = dbOf(ctx);
      const orgCol = opts.orgColumn ?? "org_id";
      const extra = opts.extraWhere ? ` AND ${opts.extraWhere}` : "";
      try {
        const totalRows = (await db.execute(sql`
          SELECT COUNT(*)::int AS value
            FROM ${sql.raw(`"${opts.table}"`)}
           WHERE ${sql.raw(`"${orgCol}"`)} = ${ctx.tenantId}
             AND ${sql.raw(`"${opts.dateColumn}"`)} >= ${ctx.range.start.toISOString()}
             AND ${sql.raw(`"${opts.dateColumn}"`)} <= ${ctx.range.end.toISOString()}
             ${sql.raw(extra)}
        `)) as Array<{ value: number }>;
        const list = Array.isArray(totalRows) ? totalRows : ((totalRows as { rows?: unknown[] }).rows ?? []);
        const n = Number((list[0] as { value?: number } | undefined)?.value ?? 0);

        const trunc = truncSqlExpression(ctx.range.granularity);
        const bucketRows = (await db.execute(sql`
          SELECT DATE_TRUNC(${sql.raw(`'${trunc}'`)}, ${sql.raw(`"${opts.dateColumn}"`)}) AS period,
                 COUNT(*)::int AS value
            FROM ${sql.raw(`"${opts.table}"`)}
           WHERE ${sql.raw(`"${orgCol}"`)} = ${ctx.tenantId}
             AND ${sql.raw(`"${opts.dateColumn}"`)} >= ${ctx.range.start.toISOString()}
             AND ${sql.raw(`"${opts.dateColumn}"`)} <= ${ctx.range.end.toISOString()}
             ${sql.raw(extra)}
           GROUP BY 1
           ORDER BY 1
        `)) as Array<{ period: unknown; value: number }>;
        const rows = Array.isArray(bucketRows) ? bucketRows : ((bucketRows as { rows?: unknown[] }).rows ?? []);
        const series = alignSeries(buildTimeBuckets(ctx.range), rows as Array<{ period: unknown; value: number }>);

        return {
          current: n,
          series,
          // `n` is the range total; judge posture from the latest bucket vs its
          // trailing buckets, not total-vs-per-bucket-average.
          state: stateFromFlowSeries(series, opts.direction),
          lastUpdated: new Date(),
        };
      } catch {
        return emptyMetricValue("no_data");
      }
    },
    appearsIn: [
      { role: "ceo", surface: "flow", priority: 20 },
      { role: "coo", surface: "flow", priority: 20 },
    ],
  });
}

// ── SECURITY: incidents in / out ─────────────────────────────────────────────
registerFlowMetric({
  id: "security.incidents_opened_period",
  label: "Security incidents opened",
  fn: "security",
  table: "security_incidents",
  dateColumn: "created_at",
  direction: "lower_is_better",
  drillUrl: "/app/security",
});
registerFlowMetric({
  id: "security.incidents_resolved_period",
  label: "Security incidents resolved",
  fn: "security",
  table: "security_incidents",
  dateColumn: "resolved_at",
  direction: "higher_is_better",
  drillUrl: "/app/security",
});

// ── PEOPLE: joiners / leavers ────────────────────────────────────────────────
// A movement, not a level. `hr.headcount_active` is the level.
registerFlowMetric({
  id: "hr.joiners_period",
  label: "Joiners",
  fn: "people",
  table: "employees",
  dateColumn: "start_date",
  direction: "higher_is_better",
  drillUrl: "/app/hr",
});
registerFlowMetric({
  id: "hr.leavers_period",
  label: "Leavers",
  fn: "people",
  table: "employees",
  dateColumn: "end_date",
  direction: "lower_is_better",
  drillUrl: "/app/hr",
});

// ── FINANCE: invoices raised / paid ──────────────────────────────────────────
registerFlowMetric({
  id: "financial.invoices_raised_period",
  label: "Invoices raised",
  fn: "finance",
  table: "invoices",
  dateColumn: "created_at",
  direction: "higher_is_better",
  drillUrl: "/app/financial",
  extraWhere: "invoice_flow = 'receivable'",
});
registerFlowMetric({
  id: "financial.invoices_paid_period",
  label: "Invoices paid",
  fn: "finance",
  table: "invoices",
  dateColumn: "paid_at",
  direction: "higher_is_better",
  drillUrl: "/app/financial",
  extraWhere: "invoice_flow = 'receivable'",
});

// ── LEGAL: matters opened / closed ───────────────────────────────────────────
registerFlowMetric({
  id: "legal.matters_opened_period",
  label: "Legal matters opened",
  fn: "legal",
  table: "legal_matters",
  dateColumn: "created_at",
  direction: "lower_is_better",
  drillUrl: "/app/legal",
});
registerFlowMetric({
  id: "legal.matters_closed_period",
  label: "Legal matters closed",
  fn: "legal",
  table: "legal_matters",
  dateColumn: "closed_at",
  direction: "higher_is_better",
  drillUrl: "/app/legal",
});

// ── STRATEGY: approvals raised / decided ─────────────────────────────────────
registerFlowMetric({
  id: "approvals.raised_period",
  label: "Approvals raised",
  fn: "strategy",
  table: "approval_requests",
  dateColumn: "created_at",
  direction: "lower_is_better",
  drillUrl: "/app/approvals",
});
registerFlowMetric({
  id: "approvals.decided_period",
  label: "Approvals decided",
  fn: "strategy",
  table: "approval_requests",
  dateColumn: "decided_at",
  direction: "higher_is_better",
  drillUrl: "/app/approvals",
});

export {};
