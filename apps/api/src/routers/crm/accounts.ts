/**
 * crm/accounts.ts — Accounts sub-router
 *
 * All Account-related procedures extracted from the monolithic crmRouter.
 * Accessed via `trpc.crm.accounts.*` on the frontend.
 */
import { router, permissionProcedure, adminProcedure } from "../../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { crmAccounts, crmDeals, organizations, accountTierEnum, eq, and, desc, inArray, sql } from "@coheronconnect/db";

export const crmAccountsRouter = router({
  list: permissionProcedure("accounts", "read")
    .input(z.object({ tier: z.enum(accountTierEnum.enumValues).optional(), limit: z.coerce.number().default(50), showArchived: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(crmAccounts.orgId, org!.id), eq(crmAccounts.archived, input.showArchived)];
      if (input.tier) conditions.push(eq(crmAccounts.tier, input.tier));
      const rows = await db.select().from(crmAccounts).where(and(...conditions))
        .orderBy(desc(crmAccounts.createdAt)).limit(input.limit);
      if (rows.length === 0) return rows;

      // Open Opps and Total Revenue were rendered from fields that do not exist —
      // the query was a plain select and nothing computed them. They ARE what a
      // salesperson expects on an account row, so they are computed here rather
      // than deleted: one grouped pass over crm_deals for the page's accounts, not
      // a query per row.
      const accountIds = rows.map((r) => r.id);
      const agg = await db
        .select({
          accountId: crmDeals.accountId,
          openOpps: sql<number>`count(*) filter (where ${crmDeals.stage} not in ('closed_won','closed_lost'))`,
          totalRevenue: sql<string>`coalesce(sum(${crmDeals.value}) filter (where ${crmDeals.stage} = 'closed_won'), 0)`,
        })
        .from(crmDeals)
        .where(and(eq(crmDeals.orgId, org!.id), inArray(crmDeals.accountId, accountIds)))
        .groupBy(crmDeals.accountId);
      const byAccount = new Map(agg.map((r) => [r.accountId, r]));
      return rows.map((r) => ({
        ...r,
        openOpps: Number(byAccount.get(r.id)?.openOpps ?? 0),
        totalRevenue: byAccount.get(r.id)?.totalRevenue ?? "0",
      }));
    }),

  get: permissionProcedure("accounts", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [account] = await db.select().from(crmAccounts).where(and(eq(crmAccounts.id, input.id), eq(crmAccounts.orgId, org!.id)));
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      return account;
    }),

  create: permissionProcedure("accounts", "write")
    .input(z.object({
      name: z.string().min(1),
      industry: z.string().optional(),
      tier: z.enum(["enterprise", "mid_market", "smb"]).default("smb"),
      website: z.string().url().optional(),
      annualRevenue: z.string().optional(),
      stateCode: z.string().optional(),
      gstin: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [account] = await db.insert(crmAccounts).values({ orgId: org!.id, ...input, ownerId: user!.id }).returning();
      return account;
    }),

  update: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid(), healthScore: z.coerce.number().optional(), notes: z.string().optional(), name: z.string().optional(), industry: z.string().optional(), tier: z.enum(["enterprise", "mid_market", "smb"]).optional(), website: z.string().url().optional(), annualRevenue: z.string().optional(), stateCode: z.string().optional(), gstin: z.string().optional(), archived: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [account] = await db.update(crmAccounts).set({ ...data, updatedAt: new Date() })
        .where(and(eq(crmAccounts.id, id), eq(crmAccounts.orgId, org!.id))).returning();
      return account;
    }),

  delete: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [account] = await db.delete(crmAccounts).where(and(eq(crmAccounts.id, input.id), eq(crmAccounts.orgId, org!.id))).returning();
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      return { success: true };
    }),
});
