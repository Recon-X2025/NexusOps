/**
 * crm/activities.ts — Activities sub-router
 *
 * All CRM Activity procedures.
 * Accessed via `trpc.crm.activities.*` on the frontend.
 */
import { router, permissionProcedure } from "../../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { crmActivities, eq, and, desc } from "@coheronconnect/db";

const activityTypeSchema = z.enum(["call", "email", "meeting", "demo", "follow_up", "note"]);

/**
 * An activity must hang off SOMETHING.
 *
 * Every association was optional, so the API happily created rows attached to
 * nothing — and the Dashboard's "+ New" quick-log did exactly that, minting
 * "Logged Activity" rows that appear on no lead, deal, account or contact and
 * can only ever be found by listing the whole activity table.
 *
 * The rule is "at least ONE", deliberately not "an account and a contact": a
 * LEAD has no account until it converts, so demanding one makes logging a call
 * against a lead impossible — which is why `crm_activities.leadId` had a column,
 * an FK, an index and an aggregate feeding the Leads list, and no way to write it.
 */
export function assertActivityHasAssociation(input: {
  dealId?: string | null;
  leadId?: string | null;
  accountId?: string | null;
  contactId?: string | null;
}): void {
  if (!input.dealId && !input.leadId && !input.accountId && !input.contactId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "An activity must be linked to at least one of: lead, deal, account or contact.",
    });
  }
}

export const crmActivitiesRouter = router({
  list: permissionProcedure("accounts", "read")
    /*
     * All FOUR association columns are filterable, because all four are real:
     * `crm_activities` carries deal_id, lead_id, contact_id and account_id as
     * independent nullable FKs, and `create` populates any of them.
     *
     * accountId and contactId were absent here, so zod SILENTLY STRIPPED them and
     * the procedure returned the whole org. Measured live against an org holding
     * exactly 4 activities: list({dealId}) -> 1, list({leadId}) -> 1, but
     * list({accountId}) -> 4 and list({contactId}) -> 4. The account page
     * (accounts/[id]/page.tsx) rendered that org-wide set as "Recent Activity"
     * for whichever account you happened to be looking at.
     */
    .input(z.object({
      dealId: z.string().uuid().optional(),
      leadId: z.string().uuid().optional(),
      accountId: z.string().uuid().optional(),
      contactId: z.string().uuid().optional(),
      limit: z.coerce.number().default(50),
      showArchived: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(crmActivities.orgId, org!.id), eq(crmActivities.archived, input.showArchived)];
      if (input.dealId) conditions.push(eq(crmActivities.dealId, input.dealId));
      // A lead can now carry its own history — same filter shape as dealId.
      if (input.leadId) conditions.push(eq(crmActivities.leadId, input.leadId));
      // Same filter shape again — an omitted filter must never widen the result.
      if (input.accountId) conditions.push(eq(crmActivities.accountId, input.accountId));
      if (input.contactId) conditions.push(eq(crmActivities.contactId, input.contactId));
      return db.select().from(crmActivities).where(and(...conditions)).orderBy(desc(crmActivities.createdAt)).limit(input.limit);
    }),

  create: permissionProcedure("accounts", "write")
    .input(z.object({
      type: activityTypeSchema.optional(),
      subject: z.string().optional(),
      description: z.string().optional(),
      dealId: z.string().uuid().optional(),
      leadId: z.string().uuid().optional(),
      accountId: z.string().uuid().optional(),
      contactId: z.string().uuid().optional(),
      outcome: z.string().optional(),
      scheduledAt: z.union([z.string(), z.date()]).optional().transform(v => v ? new Date(v) : undefined),
      completedAt: z.union([z.string(), z.date()]).optional().transform(v => v ? new Date(v) : undefined),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      assertActivityHasAssociation(input);
      const [activity] = await db.insert(crmActivities).values({
        orgId: org!.id,
        ...input, 
        ownerId: user!.id, 
        type: input.type || "call",
        subject: input.subject || "Logged Activity",
      }).returning();
      return activity;
    }),

  update: permissionProcedure("accounts", "write")
    .input(z.object({
      id: z.string().uuid(),
      type: activityTypeSchema.optional(),
      subject: z.string().optional(),
      description: z.string().optional(),
      dealId: z.string().uuid().optional(),
      leadId: z.string().uuid().optional(),
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
