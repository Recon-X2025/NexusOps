/**
 * Full-and-final settlement composition (pure money-math).
 * ─────────────────────────────────────────────────────────────────────────────
 * Composes the settlement due to a leaver from its named parts:
 *
 *     last salary (pro-rated to endDate)     ← from the payroll engine (EXIT-DATE)
 *   + leave encashment (annual only)         ← computeLeaveEncashment
 *   + gratuity (if eligible ≥ 5y)            ← computeGratuity
 *   − recoveries (notice / advance / asset)  ← employer inputs
 *   = net settlement
 *
 * Each part is kept individually visible (an employee disputes a PART, not the total), and
 * the net FLOORS at zero — when recoveries exceed the payable parts the excess is surfaced as
 * `unrecoveredShortfall` (a debt the ex-employee owes) rather than vanishing, the same
 * invariant the payslip engine uses for salary. Statutory exemptions (gratuity ≤ ₹20,00,000
 * s.10(10); leave encashment ≤ ₹25,00,000 s.10(10AA)) are applied and any taxable excess is
 * surfaced — last salary's own TDS is withheld in the payroll run, so it is not re-taxed here.
 */

/** Statutory exemption ceilings (overridable for config-driven futures). */
export const GRATUITY_EXEMPTION_CEILING = 2_000_000; // s.10(10)
export const LEAVE_ENCASHMENT_EXEMPTION_CEILING = 2_500_000; // s.10(10AA), non-government

export interface SettlementParts {
  /** Pro-rated last salary for days worked (net paid via the run; carried here for the record). */
  lastSalary: number;
  /** Encashment of ANNUAL (encashable) leave only — the caller must not pass a sick/casual balance. */
  leaveEncashment: number;
  /** Gratuity payable (0 when not eligible); the caller enforces the 5-year gate via computeGratuity. */
  gratuity: number;
  /** Recoveries — each line kept for the record; the total is derived. */
  noticeShortfall?: number;
  advanceRecovery?: number;
  assetRecovery?: number;
  gratuityExemptionCeiling?: number;
  leaveEncashmentExemptionCeiling?: number;
}

export interface SettlementComputation {
  lastSalary: number;
  leaveEncashment: number;
  gratuity: number;
  noticeShortfall: number;
  advanceRecovery: number;
  assetRecovery: number;
  totalRecoveries: number;
  /** Sum of the payable parts BEFORE recoveries. */
  grossSettlement: number;
  /** max(0, gross − recoveries) — money paid out. */
  netSettlement: number;
  /** max(0, recoveries − gross) — a debt the ex-employee still owes; never silently dropped. */
  unrecoveredShortfall: number;
  /** Gratuity above the s.10(10) ceiling (taxable). */
  taxableGratuity: number;
  /** Leave encashment above the s.10(10AA) ceiling (taxable). */
  taxableEncashment: number;
}

const nn = (v: number | undefined) => Math.max(0, Math.round((v ?? 0) as number));

/**
 * Compose one settlement figure from its parts. Pure: no eligibility or encashability decisions
 * live here (the caller has already gated gratuity on service and encashment on leave type) —
 * this only sums, floors, and splits out the taxable excess.
 */
export function composeSettlement(parts: SettlementParts): SettlementComputation {
  const lastSalary = nn(parts.lastSalary);
  const leaveEncashment = nn(parts.leaveEncashment);
  const gratuity = nn(parts.gratuity);
  const noticeShortfall = nn(parts.noticeShortfall);
  const advanceRecovery = nn(parts.advanceRecovery);
  const assetRecovery = nn(parts.assetRecovery);

  const totalRecoveries = noticeShortfall + advanceRecovery + assetRecovery;
  const grossSettlement = lastSalary + leaveEncashment + gratuity;
  const netBeforeFloor = grossSettlement - totalRecoveries;
  const netSettlement = Math.max(0, netBeforeFloor);
  const unrecoveredShortfall = Math.max(0, -netBeforeFloor);

  const gratuityCeiling = parts.gratuityExemptionCeiling ?? GRATUITY_EXEMPTION_CEILING;
  const encashCeiling = parts.leaveEncashmentExemptionCeiling ?? LEAVE_ENCASHMENT_EXEMPTION_CEILING;
  const taxableGratuity = Math.max(0, gratuity - gratuityCeiling);
  const taxableEncashment = Math.max(0, leaveEncashment - encashCeiling);

  return {
    lastSalary,
    leaveEncashment,
    gratuity,
    noticeShortfall,
    advanceRecovery,
    assetRecovery,
    totalRecoveries,
    grossSettlement,
    netSettlement,
    unrecoveredShortfall,
    taxableGratuity,
    taxableEncashment,
  };
}
