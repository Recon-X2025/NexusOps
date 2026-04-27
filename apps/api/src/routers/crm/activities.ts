/**
 * crm/activities.ts — Activities sub-router
 *
 * All CRM Activity procedures.
 * Accessed via `trpc.crm.activities.*` on the frontend.
 */
import { router, permissionProcedure } from "../../lib/trpc";
import { z } from "zod";
import { crmActivities, eq, and, desc } from "@nexusops/db";

export const crmActivitiesRouter = router({
  list: permissionProcedure("accounts", "read")
    .input(z.object({ dealId: z.string().uuid().optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(crmActivities.orgId, org!.id)];
      if (input.dealId) conditions.push(eq(crmActivities.dealId, input.dealId));
      return db.select().from(crmActivities).where(and(...conditions)).orderBy(desc(crmActivities.createdAt)).limit(input.limit);
    }),

  create: permissionProcedure("accounts", "write")
    .input(z.object({
      type: z.string(),
      subject: z.string(),
      description: z.string().optional(),
      dealId: z.string().uuid().optional(),
      outcome: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [activity] = await db.insert(crmActivities).values({ orgId: org!.id, ...input, ownerId: user!.id, type: input.type as any }).returning();
      return activity;
    }),
});
