/**
 * crm/lead-scoring.ts — Lead-scoring config sub-router (G5)
 *
 * Manages the versioned `lead_scoring_rules` config for an org and exposes the
 * effective, resolved config + a manual rescore. Accessed via
 * `trpc.crm.leadScoring.*`.
 *
 * Versioning mirrors statutory-ceilings: publishing a new config closes the
 * current org-scoped row (sets its `effectiveTo`) and inserts a new one, so the
 * history is preserved and the resolver always picks the latest active row.
 */
import { router, permissionProcedure } from "../../lib/trpc";
import { z } from "zod";
import { leadScoringRules, eq, and, isNull, desc } from "@coheronconnect/db";
import { resolveLeadScoringConfig } from "../../lib/crm/lead-scoring-rules";
import { rescoreOrgLeads } from "../../lib/crm/lead-write";

const configSchema = z.object({
  sourceWeights: z.record(z.string(), z.number()).optional(),
  statusWeights: z.record(z.string(), z.number()).optional(),
  titleWeights: z.record(z.string(), z.number()).optional(),
  hasEmail: z.number().optional(),
  hasPhone: z.number().optional(),
  hasCompany: z.number().optional(),
  maxScore: z.number().positive().optional(),
});

export const crmLeadScoringRouter = router({
  /** The effective (merged) config an org scores against right now. */
  effective: permissionProcedure("accounts", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    return resolveLeadScoringConfig(db, org!.id);
  }),

  /** Raw org-scoped rule history (newest first). */
  history: permissionProcedure("accounts", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    return db
      .select()
      .from(leadScoringRules)
      .where(eq(leadScoringRules.orgId, org!.id))
      .orderBy(desc(leadScoringRules.effectiveFrom));
  }),

  /**
   * Publish a new org-scoped config. Closes the currently-open org row (if any)
   * at `effectiveFrom`, inserts the new row, then rescores all leads so the new
   * weights take effect immediately. All in one tx.
   */
  publish: permissionProcedure("accounts", "write")
    .input(
      z.object({
        config: configSchema,
        effectiveFrom: z.coerce.date().optional(),
        sourceRef: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const orgId = org!.id;
      const effectiveFrom = input.effectiveFrom ?? new Date();

      return db.transaction(async (tx) => {
        // Close any currently-open org-scoped row at the new effectiveFrom.
        await tx
          .update(leadScoringRules)
          .set({ effectiveTo: effectiveFrom })
          .where(
            and(
              eq(leadScoringRules.orgId, orgId),
              isNull(leadScoringRules.effectiveTo),
            ),
          );

        const [row] = await tx
          .insert(leadScoringRules)
          .values({
            orgId,
            config: input.config,
            effectiveFrom,
            sourceRef: input.sourceRef,
          })
          .returning();

        const rescored = await rescoreOrgLeads(tx, orgId);
        return { rule: row!, rescored };
      });
    }),

  /** Recompute every lead's score against the current config. */
  rescore: permissionProcedure("accounts", "write")
    .input(z.object({}))
    .mutation(async ({ ctx }) => {
      const { db, org } = ctx;
      const rescored = await rescoreOrgLeads(db, org!.id);
      return { rescored };
    }),
});
