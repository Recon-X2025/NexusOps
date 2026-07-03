import { changeRequests, eq, and, count, notInArray, sql } from "@coheronconnect/db";
import { registerMetric } from "../registry";
import { emptyMetricValue } from "../resolve-helpers";
import { dbOf } from "./_db";

/** COO / CIO lens metrics resolved from procurement + change-management signals. */

registerMetric({
  id: "coo.vendor_sla_breaches",
  label: "Vendor SLA breaches",
  function: "strategy",
  dimension: "sla",
  direction: "lower_is_better",
  unit: "count",
  target: 0,
  description: "Goods receipts logged after the purchase order's expected delivery date.",
  drillUrl: "/app/vendors",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    try {
      // A delivery-SLA breach = goods received (GRN) after the PO's committed
      // expected-delivery date. Counted at the GRN grain so multiple late
      // receipts against one PO each register. Skips POs with no committed date.
      const rows = (await db.execute(sql`
        SELECT COUNT(*)::text AS breaches
          FROM goods_receipt_notes g
          JOIN purchase_orders po ON po.id = g.po_id
         WHERE po.org_id = ${ctx.tenantId}
           AND po.expected_delivery IS NOT NULL
           AND g.grn_date > po.expected_delivery
      `)) as Array<{ breaches: string }>;
      const n = Number(rows[0]?.breaches ?? 0);
      return {
        current: n,
        // Breach count is a running total; a trend needs per-period bucketing.
        series: [],
        state: n === 0 ? "healthy" : n > 5 ? "stressed" : "watch",
        lastUpdated: new Date(),
      };
    } catch {
      return emptyMetricValue("no_data");
    }
  },
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
