/**
 * crm/leads.ts — Leads sub-router
 *
 * All CRM Lead & lead conversion procedures.
 * Accessed via `trpc.crm.leads.*` on the frontend.
 */
import { router, permissionProcedure } from "../../lib/trpc";
import { z } from "zod";
import { crmLeads, crmDeals, leadStatusEnum, leadSourceEnum, eq, and, desc, count } from "@coheronconnect/db";

export const crmLeadsRouter = router({
  list: permissionProcedure("accounts", "read")
    .input(z.object({ status: z.enum(leadStatusEnum.enumValues).optional(), limit: z.coerce.number().default(50), showArchived: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(crmLeads.orgId, org!.id), eq(crmLeads.archived, input.showArchived)];
      if (input.status) conditions.push(eq(crmLeads.status, input.status));
      return db.select().from(crmLeads).where(and(...conditions)).orderBy(desc(crmLeads.score)).limit(input.limit);
    }),

  create: permissionProcedure("accounts", "write")
    .input(z.object({
      firstName: z.string(),
      lastName: z.string(),
      email: z.string().email(),
      phone: z.string(),
      company: z.string().optional(),
      title: z.string().optional(),
      source: z.enum(leadSourceEnum.enumValues).default("website"),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [lead] = await db.insert(crmLeads).values({ orgId: org!.id, ...input, ownerId: user!.id, source: input.source }).returning();
      return lead;
    }),

  update: permissionProcedure("accounts", "write")
    .input(z.object({
      id: z.string().uuid(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      company: z.string().optional(),
      title: z.string().optional(),
      status: z.enum(["new", "contacted", "qualified", "disqualified", "converted"]).optional(),
      archived: z.boolean().optional(),
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
      // Atomicity: the deal insert and the lead status/link update must commit
      // together so a converted deal can never exist without its source lead
      // being flagged "converted" and pointed at that deal.
      return await db.transaction(async (tx) => {
        const [deal] = await tx.insert(crmDeals).values({
          orgId: org!.id, title: input.dealTitle, value: input.dealValue, ownerId: user!.id,
          weightedValue: input.dealValue ? String(Number(input.dealValue) * 0.1) : undefined,
        }).returning();
        await tx.update(crmLeads).set({ status: "converted", convertedDealId: deal!.id, updatedAt: new Date() })
          .where(and(eq(crmLeads.id, input.id), eq(crmLeads.orgId, org!.id)));
        return deal;
      });
    }),
});
