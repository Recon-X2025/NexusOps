/**
 * crm/dashboard.ts — CRM Dashboard & Analytics sub-router
 *
 * Aggregate / reporting procedures for the CRM module.
 * Accessed via `trpc.crm.dashboard.*` on the frontend.
 */
import { router, permissionProcedure } from "../../lib/trpc";
import { crmDeals, crmLeads, eq, and, desc, count, sum, inArray, notInArray, lt } from "@coheronconnect/db";

async function getExecutiveSummary(db: any, orgId: string) {
  const [openDeals] = await db.select({ cnt: count(), total: sum(crmDeals.value) })
    .from(crmDeals).where(and(eq(crmDeals.orgId, orgId), notInArray(crmDeals.stage, ["closed_won", "closed_lost"])));
  const [wonDeals] = await db.select({ cnt: count(), total: sum(crmDeals.value) })
    .from(crmDeals).where(and(eq(crmDeals.orgId, orgId), eq(crmDeals.stage, "closed_won")));
  const [newLeads] = await db.select({ cnt: count() }).from(crmLeads).where(and(eq(crmLeads.orgId, orgId), eq(crmLeads.status, "new")));

  const pipelineByStage = await db.select({ stage: crmDeals.stage, cnt: count(), total: sum(crmDeals.value) })
    .from(crmDeals).where(and(eq(crmDeals.orgId, orgId), notInArray(crmDeals.stage, ["closed_won", "closed_lost"])))
    .groupBy(crmDeals.stage);

  const recentDeals = await db.select().from(crmDeals).where(eq(crmDeals.orgId, orgId)).orderBy(desc(crmDeals.updatedAt)).limit(5);

  const openLeadStatuses = ["new", "contacted", "qualified"] as const;
  const [openLeadsRow] = await db.select({ cnt: count() }).from(crmLeads).where(and(eq(crmLeads.orgId, orgId), inArray(crmLeads.status, [...openLeadStatuses])));
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [staleLeadsRow] = await db.select({ cnt: count() }).from(crmLeads).where(and(eq(crmLeads.orgId, orgId), inArray(crmLeads.status, [...openLeadStatuses]), lt(crmLeads.createdAt, sevenDaysAgo)));

  return {
    openPipeline: { count: Number(openDeals?.cnt ?? 0), value: String(openDeals?.total ?? "0") },
    closedWon: { count: Number(wonDeals?.cnt ?? 0), value: String(wonDeals?.total ?? "0") },
    newLeads: Number(newLeads?.cnt ?? 0),
    pipelineByStage: pipelineByStage.map((r: { stage: string; cnt: unknown; total: unknown }) => ({
      stage: r.stage, count: Number(r.cnt ?? 0), value: String(r.total ?? "0"),
    })),
    recentDeals,
    leads: {
      open: Number(openLeadsRow?.cnt ?? 0),
      openStaleOver7Days: Number(staleLeadsRow?.cnt ?? 0),
    },
  };
}

export const crmDashboardRouter = router({
  metrics: permissionProcedure("accounts", "read").query(async ({ ctx }) => {
    const summary = await getExecutiveSummary(ctx.db, ctx.org!.id);
    return {
      openPipeline: summary.openPipeline,
      closedWon: summary.closedWon,
      newLeads: summary.newLeads,
    };
  }),

  executiveSummary: permissionProcedure("accounts", "read").query(async ({ ctx }) => {
    return getExecutiveSummary(ctx.db, ctx.org!.id);
  }),
});
