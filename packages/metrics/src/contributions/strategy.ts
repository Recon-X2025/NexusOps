import { okrObjectives, okrKeyResults, eq, and, avg, sql } from "@coheronconnect/db";
import { registerMetric } from "../registry";
import { emptyMetricValue } from "../resolve-helpers";
import { dbOf } from "./_db";
import type { ScatterPoint } from "../types";

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

      // Portfolio matrix: one bubble per active objective.
      //   x = overall progress %, y = key-result count (scope),
      //   size = key-result count, state from progress band.
      const objectives = await db
        .select({
          title: okrObjectives.title,
          progress: okrObjectives.overallProgress,
          krCount: sql<number>`count(${okrKeyResults.id})`,
        })
        .from(okrObjectives)
        .leftJoin(okrKeyResults, eq(okrKeyResults.objectiveId, okrObjectives.id))
        .where(and(eq(okrObjectives.orgId, ctx.tenantId), eq(okrObjectives.status, "active")))
        .groupBy(okrObjectives.id, okrObjectives.title, okrObjectives.overallProgress);

      const scatter: ScatterPoint[] = objectives.map((o: { title: string; progress: number | null; krCount: number }) => {
        const progress = Number(o.progress) || 0;
        const krCount = Number(o.krCount) || 0;
        return {
          label: o.title,
          x: progress,
          y: krCount,
          size: krCount,
          state: progress >= 70 ? "healthy" : progress >= 45 ? "watch" : "stressed",
        };
      });

      return {
        current: Math.round(v * 10) / 10,
        // OKR snapshot — historical progress would need a checkpoint table.
        series: [],
        scatter,
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
