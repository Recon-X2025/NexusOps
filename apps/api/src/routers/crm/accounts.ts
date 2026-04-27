/**
 * crm/accounts.ts — Accounts sub-router
 *
 * All Account-related procedures extracted from the monolithic crmRouter.
 * Accessed via `trpc.crm.accounts.*` on the frontend.
 */
import { router, permissionProcedure, adminProcedure } from "../../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { crmAccounts, organizations, eq, and, desc } from "@nexusops/db";

export const crmAccountsRouter = router({
  list: permissionProcedure("accounts", "read")
    .input(z.object({ tier: z.string().optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(crmAccounts.orgId, org!.id)];
      if (input.tier) conditions.push(eq(crmAccounts.tier, input.tier as any));
      return db.select().from(crmAccounts).where(and(...conditions)).orderBy(desc(crmAccounts.createdAt)).limit(input.limit);
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
      name: z.string(),
      industry: z.string().optional(),
      tier: z.enum(["enterprise", "mid_market", "smb"]).default("smb"),
      website: z.string().optional(),
      annualRevenue: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [account] = await db.insert(crmAccounts).values({ orgId: org!.id, ...input, ownerId: user!.id }).returning();
      return account;
    }),

  update: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid(), healthScore: z.coerce.number().optional(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [account] = await db.update(crmAccounts).set({ ...data, updatedAt: new Date() } as any)
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
