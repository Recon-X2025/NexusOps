import { okrObjectives, eq, and, avg } from "@coheronconnect/db";
import { registerMetric } from "../registry";
import { emptyMetricValue } from "../resolve-helpers";
import { dbOf } from "./_db";

registerMetric({
  id: "strategy.okr_progress_avg",
  label: "OKR progress (avg)",
  function: "strategy",
  dimension: "trend",
  direction: "higher_is_better",
  unit: "percent",
  target: 70,
  description: "Average overall progress on active OKRs.",
  drillUrl: "/app/performance",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    try {
      const [row] = await db
        .select({ a: avg(okrObjectives.overallProgress) })
        .from(okrObjectives)
        .where(and(eq(okrObjectives.orgId, ctx.tenantId), eq(okrObjectives.status, "active")));
      const v = row?.a != null ? Number(row.a) : NaN;
      if (Number.isNaN(v)) {
        return emptyMetricValue("no_data");
      }
      const state = v >= 70 ? "healthy" : v >= 45 ? "watch" : "stressed";
      return {
        current: Math.round(v * 10) / 10,
        // OKR snapshot — historical progress would need a checkpoint table.
        series: [],
        state,
        lastUpdated: new Date(),
      };
    } catch {
      return emptyMetricValue("no_data");
    }
  },
  appearsIn: [
    { role: "ceo", surface: "heatmap", priority: 120 },
    { role: "coo", surface: "bullet", priority: 25 },
    { role: "cio", surface: "trend", priority: 25 },
  ],
});
