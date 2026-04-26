import { legalMatters, eq, and, count, ne } from "@nexusops/db";
import { registerMetric } from "../registry";
import { emptyMetricValue } from "../resolve-helpers";
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
      return {
        current: n,
        // Snapshot — not bucketed without a status-history feed.
        series: [],
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
