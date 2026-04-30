import { changeRequests, eq, and, count, notInArray } from "@coheronconnect/db";
import { registerMetric } from "../registry";
import { emptyMetricValue } from "../resolve-helpers";
import { dbOf } from "./_db";

/** COO / CIO lens placeholders — resolvers return no_data until domain routers expose the right signals. */

registerMetric({
  id: "coo.vendor_sla_breaches",
  label: "Vendor SLA breaches",
  function: "strategy",
  dimension: "sla",
  direction: "lower_is_better",
  unit: "count",
  description: "// TODO: contribute from vendors / procurement SLA feed.",
  drillUrl: "/app/vendors",
  resolve: async () => emptyMetricValue("no_data"),
  appearsIn: [
    { role: "coo", surface: "bullet", priority: 10 },
    { role: "coo", surface: "heatmap", priority: 200 },
  ],
});

registerMetric({
  id: "cio.change_backlog",
  label: "Change backlog",
  function: "it_services",
  dimension: "risk",
  direction: "lower_is_better",
  unit: "count",
  description: "Total pending change requests not yet completed or closed.",
  drillUrl: "/app/changes",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    try {
      const [row] = await db
        .select({ c: count() })
        .from(changeRequests)
        .where(
          and(
            eq(changeRequests.orgId, ctx.tenantId),
            notInArray(changeRequests.status, ["completed", "failed", "cancelled"])
          )
        );
      const n = Number(row?.c ?? 0);
      return {
        current: n,
        series: [],
        state: n > 10 ? "stressed" : n > 5 ? "watch" : "healthy",
        lastUpdated: new Date(),
      };
    } catch {
      return emptyMetricValue("no_data");
    }
  },
  appearsIn: [
    { role: "cio", surface: "bullet", priority: 8 },
    { role: "cio", surface: "heatmap", priority: 200 },
  ],
});
