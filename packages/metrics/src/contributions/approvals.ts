import { approvalRequests, eq, and, count, sql } from "@coheronconnect/db";
import { registerMetric } from "../registry";
import { dbOf } from "./_db";

registerMetric({
  id: "approvals.stuck_over_5d",
  label: "Approval friction (5d+)",
  function: "strategy",
  dimension: "sla",
  direction: "lower_is_better",
  unit: "count",
  target: 0,
  description: "Approval requests still pending whose created date is older than five days.",
  drillUrl: "/app/approvals",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    const cutoff = new Date(Date.now() - 5 * 86400000);
    const [row] = await db
      .select({ c: count() })
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.orgId, ctx.tenantId),
          eq(approvalRequests.status, "pending"),
          sql`${approvalRequests.createdAt} < ${cutoff.toISOString()}`,
        ),
      );
    const n = Number(row?.c ?? 0);
    const state = n === 0 ? "healthy" : n > 10 ? "stressed" : "watch";
    return {
      current: n,
      // Point-in-time backlog count — no defensible history without snapshots.
      series: [],
      state,
      lastUpdated: new Date(),
    };
  },
  appearsIn: [
    { role: "ceo", surface: "heatmap", priority: 80 },
    { role: "ceo", surface: "risk", priority: 12 },
    { role: "ceo", surface: "attention", priority: 6 },
    { role: "coo", surface: "risk", priority: 10 },
    { role: "coo", surface: "attention", priority: 5 },
  ],
});
