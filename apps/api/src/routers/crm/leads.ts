/**
 * crm/leads.ts — Leads sub-router
 *
 * All CRM Lead & lead conversion procedures.
 * Accessed via `trpc.crm.leads.*` on the frontend.
 */
import { router, permissionProcedure } from "../../lib/trpc";
import { z } from "zod";
import { crmLeads, crmDeals, eq, and, desc, count } from "@coheronconnect/db";

export const crmLeadsRouter = router({
  list: permissionProcedure("accounts", "read")
    .input(z.object({ status: z.string().optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(crmLeads.orgId, org!.id)];
      if (input.status) conditions.push(eq(crmLeads.status, input.status as any));
      return db.select().from(crmLeads).where(and(...conditions)).orderBy(desc(crmLeads.score)).limit(input.limit);
    }),

  create: permissionProcedure("accounts", "write")
    .input(z.object({
      firstName: z.string(),
      lastName: z.string(),
      email: z.string().optional(),
      company: z.string().optional(),
      source: z.string().default("website"),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [lead] = await db.insert(crmLeads).values({ orgId: org!.id, ...input, ownerId: user!.id, source: input.source as any }).returning();
      return lead;
    }),

  update: permissionProcedure("accounts", "write")
    .input(z.object({
      id: z.string().uuid(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().optional(),
      company: z.string().optional(),
      title: z.string().optional(),
      status: z.enum(["new", "contacted", "qualified", "disqualified", "converted"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [lead] = await db.update(crmLeads).set({ ...data, updatedAt: new Date() })
        .where(and(eq(crmLeads.id, id), eq(crmLeads.orgId, org!.id))).returning();
      return lead;
    }),

  convert: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid(), dealTitle: z.string(), dealValue: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [deal] = await db.insert(crmDeals).values({
        orgId: org!.id, title: input.dealTitle, value: input.dealValue, ownerId: user!.id,
        weightedValue: input.dealValue ? String(Number(input.dealValue) * 0.1) : undefined,
      }).returning();
      await db.update(crmLeads).set({ status: "converted", convertedDealId: deal!.id, updatedAt: new Date() })
        .where(and(eq(crmLeads.id, input.id), eq(crmLeads.orgId, org!.id)));
      return deal;
    }),
});
