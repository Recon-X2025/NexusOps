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
  maxScore: 100,
};

export interface ScorableLead {
  source: string;
  status: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
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

  // Clamp to [0, maxScore].
  if (score < 0) score = 0;
  if (score > config.maxScore) score = config.maxScore;
  return Math.round(score);
}
