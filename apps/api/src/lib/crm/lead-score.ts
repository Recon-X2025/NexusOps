/**
 * Lead scoring (G5).
 * ──────────────────
 * Before G5, `crm_leads.score` was read for `desc(score)` sorting but never
 * computed — it was always 0, so the sort was meaningless. This module makes
 * the score real: a deterministic, versioned-rule-driven 0..maxScore value
 * computed from the firmographic/qualification signals actually present on a
 * lead (source, status, seniority implied by title, and contactability).
 *
 * The scorer is a pure function — it takes the lead fields + a resolved weight
 * table and returns a number. The DB read of the versioned `lead_scoring_rules`
 * config lives in `resolveLeadScoringConfig` so this stays testable and cheap.
 */

export interface LeadScoringConfig {
  /** Points per lead source (see leadSourceEnum). */
  sourceWeights: Record<string, number>;
  /** Points per lead status (pipeline progression). */
  statusWeights: Record<string, number>;
  /** Points by seniority keyword found in the lead's title. */
  titleWeights: Record<string, number>;
  /** Contactability / firmographic completeness bonuses. */
  hasEmail: number;
  hasPhone: number;
  hasCompany: number;
  /**
   * BANT qualification weights. Added as KEYED MAPS, matching how every other
   * dimension here is consumed — no threshold concept is introduced, so the
   * versioned per-org JSONB shape is unchanged and an org row written before
   * these existed still parses.
   */
  budgetWeights: Record<string, number>;
  authorityWeights: Record<string, number>;
  timelineWeights: Record<string, number>;
  /** Presence bonus for a stated need. Qualitative — scored like hasEmail. */
  hasNeed: number;
  /** Hard ceiling — score is clamped to [0, maxScore]. */
  maxScore: number;
}

/**
 * Built-in default weights. A fresh org with no `lead_scoring_rules` row scores
 * against these, so the feature is fully functional out of the box.
 */
export const DEFAULT_LEAD_SCORING_CONFIG: LeadScoringConfig = {
  sourceWeights: {
    referral: 25,
    partner: 20,
    event: 15,
    website: 10,
    advertising: 8,
    cold_outreach: 5,
    other: 3,
  },
  statusWeights: {
    new: 0,
    contacted: 10,
    qualified: 25,
    converted: 40,
    disqualified: -50,
  },
  // Matched case-insensitively as substrings of the lead's title.
  titleWeights: {
    "chief": 20,
    "founder": 20,
    "president": 18,
    "vp": 15,
    "vice president": 15,
    "head": 12,
    "director": 12,
    "manager": 8,
    "lead": 5,
  },
  hasEmail: 5,
  hasPhone: 5,
  hasCompany: 5,
  /**
   * BANT outweighs biography, deliberately.
   *
   * Before this, the maximum a lead could score WITHOUT any qualification was
   * 25 (referral) + 25 (qualified) + 20 (chief) + 15 (email/phone/company) = 85 —
   * and a plain "has a name, a company and a source" web lead scored 60. That was
   * a COMPLETENESS score presented as a qualification score.
   *
   * BANT now contributes up to 30 + 25 + 20 + 5 = 80 on its own, so a decision
   * maker with an immediate timeline and a real budget outranks a well-filled-in
   * business card. Unknown scores 0 rather than negative: absent qualification is
   * not evidence against a lead, it is just absent.
   */
  budgetWeights: {
    over_25l: 30,
    "5l_25l": 22,
    "1l_5l": 12,
    under_1l: 5,
    unknown: 0,
  },
  authorityWeights: {
    decision_maker: 25,
    influencer: 12,
    evaluator: 6,
    unknown: 0,
  },
  timelineWeights: {
    immediate: 20,
    this_quarter: 15,
    next_quarter: 8,
    later: 3,
    unknown: 0,
  },
  hasNeed: 5,
  maxScore: 100,
};

export interface ScorableLead {
  source: string;
  status: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  budgetBand?: string | null;
  authority?: string | null;
  timeline?: string | null;
  need?: string | null;
}

/**
 * Compute a lead's score against a weight table. Deterministic and pure.
 *
 * Title scoring takes the single highest-matching seniority keyword (a "VP of
 * Engineering" scores the VP weight once, not VP + Engineering), so a longer
 * title can't inflate the score by stacking keywords.
 */
export function computeLeadScore(
  lead: ScorableLead,
  config: LeadScoringConfig = DEFAULT_LEAD_SCORING_CONFIG,
): number {
  let score = 0;

  score += config.sourceWeights[lead.source] ?? 0;
  score += config.statusWeights[lead.status] ?? 0;

  if (lead.title) {
    const title = lead.title.toLowerCase();
    let bestTitleWeight = 0;
    for (const [keyword, weight] of Object.entries(config.titleWeights)) {
      if (title.includes(keyword) && weight > bestTitleWeight) {
        bestTitleWeight = weight;
      }
    }
    score += bestTitleWeight;
  }

  if (lead.email) score += config.hasEmail;
  if (lead.phone) score += config.hasPhone;
  if (lead.company) score += config.hasCompany;

  // BANT. `?? 0` on both the map and the lookup so a per-org config row stored
  // BEFORE these keys existed still scores deterministically on the dimensions it
  // does define, rather than throwing or collapsing to zero.
  if (lead.budgetBand) score += config.budgetWeights?.[lead.budgetBand] ?? 0;
  if (lead.authority) score += config.authorityWeights?.[lead.authority] ?? 0;
  if (lead.timeline) score += config.timelineWeights?.[lead.timeline] ?? 0;
  if (lead.need && lead.need.trim() !== "") score += config.hasNeed ?? 0;

  // Clamp to [0, maxScore].
  if (score < 0) score = 0;
  if (score > config.maxScore) score = config.maxScore;
  return Math.round(score);
}
