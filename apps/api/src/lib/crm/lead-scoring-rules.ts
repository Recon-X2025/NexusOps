/**
 * Lead-scoring rule resolver (G5).
 * ────────────────────────────────
 * Reads the versioned `lead_scoring_rules` config and returns the effective
 * `LeadScoringConfig` for an org at a point in time.
 *
 * Selection rule (mirrors statutory-ceilings):
 *   effectiveFrom <= at AND (effectiveTo IS NULL OR at < effectiveTo)
 * An org-scoped row (orgId = org) overrides the platform default (orgId NULL);
 * within a scope the latest `effectiveFrom` wins. The resolved row's partial
 * config is merged over the built-in defaults so a row may override just one
 * weight table and inherit the rest.
 */
import { leadScoringRules, eq, and, or, lte, gt, isNull, desc, type DbOrTx } from "@coheronconnect/db";
import { DEFAULT_LEAD_SCORING_CONFIG, type LeadScoringConfig } from "./lead-score";

export async function resolveLeadScoringConfig(
  db: DbOrTx,
  orgId: string,
  at: Date = new Date(),
): Promise<LeadScoringConfig> {
  const rows = await db
    .select()
    .from(leadScoringRules)
    .where(
      and(
        or(eq(leadScoringRules.orgId, orgId), isNull(leadScoringRules.orgId)),
        lte(leadScoringRules.effectiveFrom, at),
        or(isNull(leadScoringRules.effectiveTo), gt(leadScoringRules.effectiveTo, at)),
      ),
    )
    .orderBy(desc(leadScoringRules.effectiveFrom));

  // Prefer an org-scoped row; else fall back to a platform default. Rows are
  // already newest-first, so the first match in each scope is the winner.
  const orgRow = rows.find((r) => r.orgId === orgId);
  const platformRow = rows.find((r) => r.orgId === null);
  const winner = orgRow ?? platformRow;

  if (!winner) return DEFAULT_LEAD_SCORING_CONFIG;

  const c = winner.config;
  return {
    sourceWeights: { ...DEFAULT_LEAD_SCORING_CONFIG.sourceWeights, ...(c.sourceWeights ?? {}) },
    statusWeights: { ...DEFAULT_LEAD_SCORING_CONFIG.statusWeights, ...(c.statusWeights ?? {}) },
    titleWeights: { ...DEFAULT_LEAD_SCORING_CONFIG.titleWeights, ...(c.titleWeights ?? {}) },
    hasEmail: c.hasEmail ?? DEFAULT_LEAD_SCORING_CONFIG.hasEmail,
    hasPhone: c.hasPhone ?? DEFAULT_LEAD_SCORING_CONFIG.hasPhone,
    hasCompany: c.hasCompany ?? DEFAULT_LEAD_SCORING_CONFIG.hasCompany,
    maxScore: c.maxScore ?? DEFAULT_LEAD_SCORING_CONFIG.maxScore,
  };
}
