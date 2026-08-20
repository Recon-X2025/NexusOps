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
  crmActivities,
  leadStatusEnum,
  leadSourceEnum,
  eq,
  and,
  max,
  inArray,
  isNotNull,
  desc,
} from "@coheronconnect/db";
import { convertLeadToDeal } from "../../lib/crm/lead-convert";
import { createScoredLead, updateScoredLead } from "../../lib/crm/lead-write";
import { TRPCError } from "@trpc/server";

export const crmLeadsRouter = router({
  list: permissionProcedure("accounts", "read")
    .input(z.object({ status: z.enum(leadStatusEnum.enumValues).optional(), limit: z.coerce.number().default(50), showArchived: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(crmLeads.orgId, org!.id), eq(crmLeads.archived, input.showArchived)];
      if (input.status) conditions.push(eq(crmLeads.status, input.status));
      const rows = await db.select().from(crmLeads).where(and(...conditions)).orderBy(desc(crmLeads.score)).limit(input.limit);
      if (rows.length === 0) return rows;

      // "Last Activity" on the list was empty by construction — crm_activities had
      // no leadId, so no activity could ever belong to a lead. It now reads the most
      // recent COMPLETED activity per lead. One grouped query, not one per row.
      const leadIds = rows.map((r) => r.id);
      const lastRows = await db
        .select({ leadId: crmActivities.leadId, lastActivityAt: max(crmActivities.completedAt) })
        .from(crmActivities)
        .where(and(
          eq(crmActivities.orgId, org!.id),
          eq(crmActivities.archived, false),
          isNotNull(crmActivities.completedAt),
          inArray(crmActivities.leadId, leadIds),
        ))
        .groupBy(crmActivities.leadId);
      const lastByLead = new Map(lastRows.map((r) => [r.leadId, r.lastActivityAt]));
      return rows.map((r) => ({ ...r, lastActivityAt: lastByLead.get(r.id) ?? null }));
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
      // ── Qualification (BANT) + opportunity shape ────────────────────────
      budgetBand: z.enum(["under_1l", "1l_5l", "5l_25l", "over_25l", "unknown"]).optional(),
      budgetNote: z.string().optional(),
      authority: z.enum(["decision_maker", "influencer", "evaluator", "unknown"]).optional(),
      need: z.string().optional(),
      timeline: z.enum(["immediate", "this_quarter", "next_quarter", "later", "unknown"]).optional(),
      estimatedValue: z.string().optional(),
      expectedClose: z.union([z.string(), z.date()]).optional().transform(v => v ? new Date(v) : undefined),
      nextAction: z.string().optional(),
      nextActionDate: z.union([z.string(), z.date()]).optional().transform(v => v ? new Date(v) : undefined),
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
      // ── Qualification (BANT) + opportunity shape ────────────────────────
      budgetBand: z.enum(["under_1l", "1l_5l", "5l_25l", "over_25l", "unknown"]).optional(),
      budgetNote: z.string().optional(),
      authority: z.enum(["decision_maker", "influencer", "evaluator", "unknown"]).optional(),
      need: z.string().optional(),
      timeline: z.enum(["immediate", "this_quarter", "next_quarter", "later", "unknown"]).optional(),
      estimatedValue: z.string().optional(),
      expectedClose: z.union([z.string(), z.date()]).optional().transform(v => v ? new Date(v) : undefined),
      nextAction: z.string().optional(),
      nextActionDate: z.union([z.string(), z.date()]).optional().transform(v => v ? new Date(v) : undefined),
      archived: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Conversion is a STRUCTURED action, not a status change. `leads.convert`
      // requires an estimated value and an expected close date and creates the
      // account, contact and deal together; setting the status here would leave a
      // lead marked converted with no deal behind it. The stored enum keeps
      // "converted" — it is a legitimate value; only reaching it this way is blocked.
      if (input.status === "converted") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "A lead cannot be set to Converted from this form. Use Convert on the lead, " +
            "which needs an estimated value and an expected close date, and creates the " +
            "account, contact and deal together.",
        });
      }
      const { db, org } = ctx;
      const { id, ...patch } = input;

      /*
       * A CONVERTED LEAD'S STATUS IS NOT EDITABLE.
       *
       * The guard above blocked only the move INTO "converted". Moving OUT was
       * unguarded, so an edit could downgrade a converted lead — and because
       * conversion idempotency used to require status === "converted", that
       * downgrade re-armed the convert path and a second deal could be raised
       * against the same lead.
       *
       * The idempotency check now keys on `convertedDealId` alone, so the
       * duplicate is already impossible. This closes the other half: the record
       * should not be able to contradict itself in the first place. Everything
       * else on a converted lead stays editable — only `status` is refused, and
       * only when it would actually change.
       */
      if (patch.status !== undefined) {
        const [existing] = await db
          .select({ status: crmLeads.status, convertedDealId: crmLeads.convertedDealId })
          .from(crmLeads)
          .where(and(eq(crmLeads.id, id), eq(crmLeads.orgId, org!.id)));
        if (existing?.convertedDealId && patch.status !== existing.status) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This lead has already been converted, so its status cannot be changed. " +
              "The deal it created carries the work from here.",
          });
        }
      }
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
