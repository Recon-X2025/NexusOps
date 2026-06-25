/**
 * crm/activities.ts — Activities sub-router
 *
 * All CRM Activity procedures.
 * Accessed via `trpc.crm.activities.*` on the frontend.
 */
import { router, permissionProcedure } from "../../lib/trpc";
import { z } from "zod";
import { crmActivities, eq, and, desc } from "@coheronconnect/db";

export const crmActivitiesRouter = router({
  list: permissionProcedure("accounts", "read")
    .input(z.object({ dealId: z.string().uuid().optional(), limit: z.coerce.number().default(50), showArchived: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(crmActivities.orgId, org!.id), eq(crmActivities.archived, input.showArchived)];
      if (input.dealId) conditions.push(eq(crmActivities.dealId, input.dealId));
      return db.select().from(crmActivities).where(and(...conditions)).orderBy(desc(crmActivities.createdAt)).limit(input.limit);
    }),

  create: permissionProcedure("accounts", "write")
    .input(z.object({
      type: z.string().optional(),
      subject: z.string().optional(),
      description: z.string().optional(),
      dealId: z.string().uuid().optional(),
      accountId: z.string().uuid().optional(),
      contactId: z.string().uuid().optional(),
      outcome: z.string().optional(),
      scheduledAt: z.union([z.string(), z.date()]).optional().transform(v => v ? new Date(v) : undefined),
      completedAt: z.union([z.string(), z.date()]).optional().transform(v => v ? new Date(v) : undefined),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [activity] = await db.insert(crmActivities).values({ 
        orgId: org!.id, 
        ...input, 
        ownerId: user!.id, 
        type: (input.type || "call") as any,
        subject: input.subject || "Logged Activity",
      }).returning();
      return activity;
    }),

  update: permissionProcedure("accounts", "write")
    .input(z.object({
      id: z.string().uuid(),
      type: z.string().optional(),
      subject: z.string().optional(),
      description: z.string().optional(),
      dealId: z.string().uuid().optional(),
      accountId: z.string().uuid().optional(),
      contactId: z.string().uuid().optional(),
      outcome: z.string().optional(),
      scheduledAt: z.union([z.string(), z.date()]).optional().transform(v => v ? new Date(v) : undefined),
      completedAt: z.union([z.string(), z.date()]).optional().transform(v => v ? new Date(v) : undefined),
      archived: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [activity] = await db.update(crmActivities)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(crmActivities.id, id), eq(crmActivities.orgId, org!.id)))
        .returning();
      return activity;
    }),
});
