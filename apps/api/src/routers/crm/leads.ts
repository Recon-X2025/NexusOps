/**
 * crm/leads.ts — Leads sub-router
 *
 * All CRM Lead & lead conversion procedures.
 * Accessed via `trpc.crm.leads.*` on the frontend.
 */
import { router, permissionProcedure } from "../../lib/trpc";
import { z } from "zod";
import {
  crmLeads,
  leadStatusEnum,
  leadSourceEnum,
  eq,
  and,
  desc,
} from "@coheronconnect/db";
import { convertLeadToDeal } from "../../lib/crm/lead-convert";
import { createScoredLead, updateScoredLead } from "../../lib/crm/lead-write";

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
      // G5 — score persisted on write via the shared scoring config resolver.
      return createScoredLead(db, { orgId: org!.id, ownerId: user!.id, ...input });
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
      const { id, ...patch } = input;
      // G5 — re-score on write so a status/title/source change updates the score.
      return updateScoredLead(db, org!.id, id, patch);
    }),

  convert: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid(), dealTitle: z.string(), dealValue: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      // G6 — lossless conversion (see lib/crm/lead-convert). One tx so a
      // converted deal can never exist without its source lead flagged
      // "converted" and linked to the account/contact it came from.
      return await db.transaction((tx) =>
        convertLeadToDeal(tx, {
          leadId: input.id,
          orgId: org!.id,
          actorId: user!.id,
          dealTitle: input.dealTitle,
          dealValue: input.dealValue,
        }),
      );
    }),
});
