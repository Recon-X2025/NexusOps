/**
 * CoheronConnect India Statutory Deductions Engine
 * ────────────────────────────────────────────
 * Computes EPF, ESI, Professional Tax, and LWF per Indian labour law.
 *
 * EPF: Employees' Provident Fund (EPF & MP Act, 1952)
 *  - Employee: 12% of basic + DA (capped at ₹15,000 for statutory; actual for voluntary)
 *  - Employer: 12% of basic + DA → split: 8.33% EPS (capped ₹15K base) + 3.67% EPF
 *  - Admin charges: 0.50% of basic + DA (employer)
 *  - EDLI: 0.50% of basic + DA capped at ₹15K base (employer)
 *
 * ESI: Employee State Insurance (ESI Act, 1948)
 *  - Applicable if gross ≤ ₹21,000/month
 *  - Employee: 0.75%, Employer: 3.25%
 *
 * PT: Professional Tax (state-specific)
 *  - Maharashtra: max ₹2,500/year; Karnataka: max ₹2,400/year
 *
 * LWF: Labour Welfare Fund (state-specific, typically ₹6-75/half-year)
 */

// ─── TYPES ─────────────────────────────────────────────────────────────────────

export interface PFComputation {
  basicPlusDA: number;
  pfWageBase: number; // Min(basic+DA, 15000) for statutory
  employeePF: number; // TOTAL employee contribution = statutory 12% + any VPF
  employeeVoluntaryPF: number; // the VPF portion of employeePF (0 when no VPF)
  employerEPF: number; // 3.67% of pfWageBase
  employerEPS: number; // 8.33% of min(pfWageBase, 15000)
  employerEDLI: number; // 0.50% of min(pfWageBase, 15000)
  adminCharges: number; // 0.50% of pfWageBase
  totalEmployer: number;
  totalEmployee: number;
}

export interface ESIComputation {
  isApplicable: boolean;
  grossMonthly: number;
  employeeESI: number; // 0.75%
  employerESI: number; // 3.25%
  /** ESI membership decided for the current contribution period (== isApplicable).
   *  The payroll run persists this at a period boundary so mid-period months carry it. */
  memberForPeriod: boolean;
  /** True when THIS month set/reset membership (a period-start month, 1 Apr / 1 Oct). */
  assessedAtPeriodStart: boolean;
  /** True when membership had to be approximated from the current gross because a
   *  mid-period month had no stored period-start membership (existing employee, no
   *  history). The run surfaces/backfills this rather than trusting it silently. */
  memberStateUnknown: boolean;
}

/** Contribution-period context for the ESI six-month membership rule. */
export interface ESIPeriodContext {
  /** 1 = April … 12 = March (financial-year month). */
  monthInFY: number;
  /** The employee's STORED membership carried into this month; null/undefined = unknown. */
  memberAtPeriodStart?: boolean | null;
  /** Full-month, overtime-excluded pay scale used for the ₹21,000 THRESHOLD test
   *  (a part-month joiner is grossed up to this before testing). Defaults to the
   *  actual `grossMonthly`. The contribution is always on the actual gross, not this. */
  eligibilityGross?: number;
}

/** How a state levies PT: every month, or once per six-month period on half-yearly
 *  income (Kerala, Tamil Nadu, Puducherry). Absent on a slab config ⇒ MONTHLY. */
export type PtLevyPeriod = "MONTHLY" | "HALF_YEARLY";

export interface PTComputation {
  state: string;
  grossMonthly: number;
  ptAmount: number; // PT deducted THIS month (0 in a half-yearly state's non-collection months)
  annualPT: number;
  /** True when PT was bypassed under a CA Tier-1 exemption (armed forces / disability /
   *  dependent-disability / age > 65). ptAmount and annualPT are 0 in that case. */
  exempt?: boolean;
  /** True when the state string did not match ANY known PT jurisdiction after
   *  normalisation — i.e. no slab config exists for it (a likely misspelling such as
   *  "Karnatak"). PT is 0 in that case, but this 0 is UNRESOLVED, not a levied-nil.
   *  It is deliberately NOT set for a KNOWN non-levying state (e.g. Delhi, whose config
   *  exists with empty slabs): that 0 is correct and stays silent. Callers use this to
   *  surface the row rather than file a plausible-wrong ₹0 nobody sees. */
  unknownState?: boolean;
  /** Levy period of the resolved state (MONTHLY unless the config marks it HALF_YEARLY). */
  levyPeriod?: PtLevyPeriod;
  /** Half-yearly states only: true in the collection month when the FULL six-month lump was
   *  assessed and deducted; false in the five non-collection months, and false when the
   *  period could not be fully assessed (see `incompletePeriod`). */
  deposited?: boolean;
  /** Half-yearly collection month reached, but the WHOLE six-month period could not be
   *  assessed — either its earlier months are missing from history, or its later months have
   *  not yet elapsed (a collection month before the period end). PT is left at 0 and flagged
   *  so the caller warns: the engine NEVER files an amount computed from a partial period,
   *  which would silently under-collect (a lower income lands in a lower bracket). */
  incompletePeriod?: boolean;
  /** DATA cause — earlier period months (1=Apr … 12=Mar) with no payslip on record (e.g. a
   *  migrated employer's first run). Set only when `incompletePeriod` is true. */
  incompleteMissingMonths?: number[];
  /** TIMING cause — later period months not yet elapsed at the collection month (the
   *  collection month falls before the period ends). Set only when `incompletePeriod` is
   *  true. Distinguished from the data cause because the operator response differs. */
  incompleteUnelapsedMonths?: number[];
}

/**
 * Per-employee inputs that steer PT bracket selection and exemption, resolved by the
 * caller from the employee record. Optional so existing callers are unaffected.
 *  - `gender`: selects the Maharashtra male/female bracket set. Unstated (or "other")
 *    resolves to the MALE (lower-threshold) set per the CA — never under-deduct.
 *  - `exempt`: when true, PT is bypassed entirely regardless of state/gross. The caller
 *    resolves this from the four Tier-1 paths (the age-over-65 one derives from DOB;
 *    the other three are declared flags) so computePT stays date-free and pure.
 */
export interface PTContext {
  gender?: "male" | "female" | "other" | null;
  exempt?: boolean;
  /** Half-yearly levy support (Kerala, Tamil Nadu). Supplied by the run/write path, which
   *  holds payslip history. `periodPriorGross` = the summed gross of the current period's
   *  EARLIER months that the system holds; `periodMissingMonths` = the required earlier FY
   *  months (1=Apr … 12=Mar) with NO payslip on record. Consulted ONLY for a half-yearly
   *  state in its collection month; ignored otherwise. If a half-yearly state reaches its
   *  collection month and `periodPriorGross` was not supplied at all, the engine treats the
   *  period as incomplete (flags it) rather than assessing from the current month alone —
   *  so a caller that forgets to wire this up fails loud, never silently small. */
  periodPriorGross?: number;
  periodMissingMonths?: number[];
}

export interface LWFComputation {
  state: string;
  employeeLWF: number; // Per half-year
  employerLWF: number; // Per half-year
}

interface PTSlab {
  from: number;
  to: number;
  monthly: number;
}

export interface MonthlyStatutoryDeductions {
  pf: PFComputation;
  esi: ESIComputation;
  pt: PTComputation;
  lwf: LWFComputation;
  totalEmployeeDeductions: number;
  totalEmployerContributions: number;
}

/** One income-tax slab band: tax `rate` applies to income in [from, to). */
export interface TaxSlab {
  from: number;
  to: number;
  rate: number;
}

/** One surcharge band: `rate` applied above `threshold` (on taxable income). */
export interface SurchargeBand {
  threshold: number;
  rate: number;
}

/**
 * Effective-dated income-tax rate set (C5), resolved from `statutory_ceilings`.
 * EVERY field is optional: `computeTax` reads each as `taxConfig?.X ?? <built-in
 * constant>`, so an absent config (or any absent field) leaves that value at the
 * in-code default and behaviour is byte-identical to today. Regime branching stays
 * the caller's job — this only supplies both regimes' data so it can be selected.
 */
export interface TaxConfigOverride {
  oldSlabs?: TaxSlab[];
  newSlabs?: TaxSlab[];
  stdDeductionOld?: number;
  stdDeductionNew?: number;
  /** Old regime: taxable-income threshold and max rebate under s.87A. */
  rebate87aOld?: { threshold: number; maxRebate: number };
  /** New regime: taxable-income threshold and max rebate under s.87A. */
  rebate87aNew?: { threshold: number; maxRebate: number };
  surchargeBands?: SurchargeBand[];
  cessRate?: number;
}

/**
 * Effective-dated statutory ceilings/tables resolved by the caller (from the
 * `statutory_ceilings` DB config). When omitted, the built-in defaults below
 * apply, so existing call sites keep their current behaviour.
 */
export interface StatutoryCeilingOverrides {
  pfWageCeiling?: number;
  /** Establishment PF contribution rate as a FRACTION (0.10 or 0.12). Applies to both the
   *  employee statutory contribution and the employer EPF share. Absent ⇒ computePF's 12% default. */
  pfContributionRate?: number;
  esiWageCeiling?: number;
  ptSlabs?: Record<string, { slabs: PTSlab[]; annualCap: number; levyPeriod?: PtLevyPeriod }>;
  lwfRates?: Record<
    string,
    { employee: number; employer: number; frequency: "HALF_YEARLY" | "ANNUAL" }
  >;
  /**
   * Payment of Bonus Act eligibility wage ceiling (Labour Codes 2025, eff.
   * 2025-11-21 = ₹21,000). When present, `computeStatutoryBonusEligibility`
   * gates statutory bonus on it. When absent, callers MUST NOT change behaviour
   * (see the payslip wire-in): no ceiling resolved ⇒ bonus passes through
   * unchanged, so orgs without the seeded row are unaffected.
   */
  bonusEligibilityCeiling?: number;
  /**
   * Income-tax rate set (C5). Threaded into `computeTax`; when absent the tax
   * engine falls back to its module constants (byte-identical to today).
   */
  taxConfig?: TaxConfigOverride;
}

// ─── PF COMPUTATION ────────────────────────────────────────────────────────────

const PF_STATUTORY_WAGE_CEILING = 15_000;
const PF_EMPLOYEE_RATE = 0.12;
const PF_EMPLOYER_EPF_RATE = 0.0367;
const PF_EMPLOYER_EPS_RATE = 0.0833;
const PF_EDLI_RATE = 0.005;
const PF_ADMIN_RATE = 0.005;

export function computePF(
  basicPlusDA: number,
  isVoluntaryHigherPF: boolean = false,
  wageCeiling: number = PF_STATUTORY_WAGE_CEILING,
  // VPF: an EXTRA employee rate above the statutory rate (fraction, e.g. 0.08 = +8%). Applied to
  // the same PF wage base; EMPLOYEE-ONLY — it never changes the employer contribution.
  voluntaryPfRate: number = 0,
  // Establishment PF contribution rate (fraction). 0.12 is the norm; 0.10 for a small/sick
  // establishment. Applies to BOTH sides: the employee's statutory contribution AND the employer's
  // EPF share (= rate − EPS 8.33%). EPS, EDLI and admin are unaffected. Default 0.12 = unchanged.
  pfRate: number = PF_EMPLOYEE_RATE,
): PFComputation {
  // Statutory: PF on min(basic+DA, ceiling). Many employers contribute on actual basic.
  const pfWageBase = isVoluntaryHigherPF
    ? basicPlusDA
    : Math.min(basicPlusDA, wageCeiling);

  const employeeStatutoryPF = Math.round(pfWageBase * pfRate);
  // VPF adds to the employee side only. The employer's split (EPS/EPF/EDLI/admin) below is
  // untouched by VPF, per the EPF scheme.
  const employeeVoluntaryPF = Math.round(pfWageBase * Math.max(0, voluntaryPfRate));
  const employeePF = employeeStatutoryPF + employeeVoluntaryPF;

  // EPS is always 8.33% of the CEILING-capped base — unchanged by the 10% reduced rate.
  const epsBase = Math.min(basicPlusDA, wageCeiling);
  const employerEPS = Math.round(epsBase * PF_EMPLOYER_EPS_RATE);
  // Employer EPF is the remainder of the employer's rate after EPS: (rate − 8.33%). At 12% that is
  // 3.67% (byte-identical); at 10% it is 1.67%.
  const employerEPF = Math.round(pfWageBase * (pfRate - PF_EMPLOYER_EPS_RATE));
  const employerEDLI = Math.round(epsBase * PF_EDLI_RATE);
  const adminCharges = Math.round(pfWageBase * PF_ADMIN_RATE);

  return {
    basicPlusDA,
    pfWageBase,
    employeePF,
    employeeVoluntaryPF,
    employerEPF,
    employerEPS,
    employerEDLI,
    adminCharges,
    totalEmployer: employerEPF + employerEPS + employerEDLI + adminCharges,
    totalEmployee: employeePF,
  };
}

// ─── ESI COMPUTATION ───────────────────────────────────────────────────────────

const ESI_WAGE_CEILING = 21_000;
const ESI_EMPLOYEE_RATE = 0.0075;
const ESI_EMPLOYER_RATE = 0.0325;

/**
 * ESI contribution for a month, applying the six-month contribution-period rule
 * (CA-ruled — and it is ASYMMETRIC; do not treat entry as the mirror of exit):
 *
 *   ENTRY  — assessed EVERY month. A non-member joins the moment their eligibility
 *            wages are at/under ₹21,000 (ESI Act 1948: coverage is mandatory below
 *            the ceiling, triggered immediately on a drop — NOT at a boundary).
 *   EXIT   — assessed ONLY at a period boundary (1 Apr / 1 Oct). A member stays a
 *            member for the rest of the period even if wages later cross the ceiling
 *            (contributions continue on ACTUAL uncapped gross), and drops off only
 *            if the boundary snapshot is above the ceiling.
 *
 * Two gross figures: the ELIGIBILITY gross (ctx.eligibilityGross — the full-month,
 * overtime-excluded pay scale; the caller grosses up a part-month joiner so they are
 * tested on their scale, not a prorated fragment) drives the threshold; the
 * CONTRIBUTION is always on the actual `grossMonthly` (0.75% / 3.25%, uncapped).
 * Without `eligibilityGross` the threshold falls back to `grossMonthly`.
 *
 * Without a `ctx`, falls back to the bare month-by-month ceiling test (legacy callers).
 */
export function computeESI(
  grossMonthly: number,
  wageCeiling: number = ESI_WAGE_CEILING,
  ctx?: ESIPeriodContext,
): ESIComputation {
  const eligibilityGross = ctx?.eligibilityGross ?? grossMonthly;
  const belowCeiling = eligibilityGross <= wageCeiling;
  const isPeriodStart = ctx ? ctx.monthInFY === 1 || ctx.monthInFY === 7 : true;

  let isMember: boolean;
  let memberStateUnknown = false;
  if (!ctx || isPeriodStart) {
    // Boundary (1 Apr / 1 Oct) or a bare call: full re-assessment (ENTRY + EXIT).
    isMember = belowCeiling;
  } else if (ctx.memberAtPeriodStart === true) {
    // RETENTION: a member stays a member mid-period regardless of gross; EXIT only
    // happens at a boundary. (This is the direction the rule locks to the period.)
    isMember = true;
  } else {
    // Non-member (or unknown) mid-period: ENTRY is assessed EVERY month — join the
    // month eligibility wages fall to/under the ceiling. NOT symmetric with exit.
    isMember = belowCeiling;
    // Above the ceiling with no membership history, we cannot tell a retained member
    // from a genuine non-member. Default to non-member (entry fails) and flag it so
    // the next boundary re-assessment can verify against the first full month.
    if (ctx.memberAtPeriodStart == null && !belowCeiling) memberStateUnknown = true;
  }

  return {
    isApplicable: isMember,
    grossMonthly,
    employeeESI: isMember ? Math.round(grossMonthly * ESI_EMPLOYEE_RATE) : 0,
    employerESI: isMember ? Math.round(grossMonthly * ESI_EMPLOYER_RATE) : 0,
    memberForPeriod: isMember,
    assessedAtPeriodStart: isPeriodStart,
    memberStateUnknown,
  };
}

// ─── PROFESSIONAL TAX ──────────────────────────────────────────────────────────

const PT_SLABS: Record<
  string,
  { slabs: PTSlab[]; annualCap: number; levyPeriod?: PtLevyPeriod }
> = {
  // Maharashtra is GENDER-SPLIT (CA matrix). MAHARASHTRA below is the MALE set and
  // remains the default. MAHARASHTRA_FEMALE is the female set — nil to ₹25,000, then
  // ₹200 (₹300 in Feb). Gender IS ingested now (employees.gender → PTContext.gender),
  // and computePT selects the female set below when `ctx.gender === "female"`. An unstated
  // gender falls to the MALE (lower-threshold) set per the CA — never under-deduct on an
  // absent gender. See reports/fix-plan.md → C2 and the selection at computePT.
  MAHARASHTRA: {
    annualCap: 2_500,
    slabs: [
      { from: 0, to: 7_500, monthly: 0 },
      { from: 7_501, to: 10_000, monthly: 175 },
      { from: 10_001, to: Infinity, monthly: 200 }, // Feb = 300 to hit 2500/yr
    ],
  },
  MAHARASHTRA_FEMALE: {
    annualCap: 2_500,
    slabs: [
      // Reached when PTContext.gender === "female" (gender ingestion is live).
      { from: 0, to: 25_000, monthly: 0 },
      { from: 25_001, to: Infinity, monthly: 200 }, // Feb = 300 to hit 2500/yr
    ],
  },
  KARNATAKA: {
    annualCap: 2_400,
    slabs: [
      // CA matrix: nil to ₹25,000, then ₹200 (₹300 in February to hit the cap).
      { from: 0, to: 25_000, monthly: 0 },
      { from: 25_001, to: Infinity, monthly: 200 },
    ],
  },
  TAMIL_NADU: {
    // HALF-YEARLY levy (CA matrix). The bands below are HALF-YEARLY INCOME, and each
    // `monthly` value is the PT for the whole half-year (a misnomer kept only so PTSlab
    // stays one shape — for a half-yearly state it is the per-period lump, deducted once).
    // Amounts were already correct; only the income base + timing were wrong before C2-STRUCT.
    annualCap: 2_500,
    levyPeriod: "HALF_YEARLY",
    slabs: [
      { from: 0, to: 21_000, monthly: 0 },
      { from: 21_001, to: 30_000, monthly: 135 },
      { from: 30_001, to: 45_000, monthly: 315 },
      { from: 45_001, to: 60_000, monthly: 690 },
      { from: 60_001, to: 75_000, monthly: 1_025 },
      { from: 75_001, to: Infinity, monthly: 1_250 },
    ],
  },
  KERALA: {
    // HALF-YEARLY levy (CA matrix). Bands are HALF-YEARLY INCOME; each `monthly` is the
    // per-period lump (see the TAMIL_NADU note on the field name).
    //
    // annualCap = 0 is a DELIBERATE "UNVERIFIED / NOT YET RULED" sentinel, NOT a statutory
    // figure and NOT "Kerala levies no PT" (the six slabs above DO levy). Statutory caps are
    // per-state values that must NOT be derived from the rate — cf. Punjab ₹2,400 vs Gujarat
    // ₹2,500 in reports/fix-plan.md — so an earlier derived ₹1,200 (= 2 × the ₹600 top slab)
    // was wrong to encode as if verified and has been removed. The cap is INERT today (no
    // per-employee YTD-PT ledger enforces it — out of C2-STRUCT scope); annualCap flows only
    // to the annual-PT estimate in the tax profile, where 0 slightly OVER-withholds TDS for an
    // old-regime Kerala employee (the conservative, recoverable direction). ⚠️ OPEN CA
    // QUESTION: Kerala's statutory annual PT ceiling — confirm before enforcing any cap.
    annualCap: 0,
    levyPeriod: "HALF_YEARLY",
    slabs: [
      { from: 0, to: 11_999, monthly: 0 },
      { from: 12_000, to: 17_999, monthly: 120 },
      { from: 18_000, to: 29_999, monthly: 180 },
      { from: 30_000, to: 44_999, monthly: 300 },
      { from: 45_000, to: 59_999, monthly: 450 },
      { from: 60_000, to: Infinity, monthly: 600 },
    ],
  },
  TELANGANA: {
    annualCap: 2_500,
    slabs: [
      { from: 0, to: 15_000, monthly: 0 },
      { from: 15_001, to: 20_000, monthly: 150 },
      { from: 20_001, to: Infinity, monthly: 200 },
    ],
  },
  WEST_BENGAL: {
    annualCap: 2_500,
    slabs: [
      { from: 0, to: 10_000, monthly: 0 },
      { from: 10_001, to: 15_000, monthly: 110 },
      { from: 15_001, to: 25_000, monthly: 130 },
      { from: 25_001, to: 40_000, monthly: 150 },
      { from: 40_001, to: Infinity, monthly: 200 },
    ],
  },
  DELHI: {
    annualCap: 0, // Delhi has no PT
    slabs: [],
  },
  GUJARAT: {
    // Statutory ceiling is the constitutional ₹2,500/yr cap — NOT derived from the
    // ₹200 monthly rate. (₹2,400 is Punjab's state-law ceiling, not Gujarat's.) Caps
    // are per-state statutory values; never compute them from the monthly amount.
    annualCap: 2_500,
    slabs: [
      // CA matrix: nil to ₹12,000, then ₹200 flat above.
      { from: 0, to: 12_000, monthly: 0 },
      { from: 12_001, to: Infinity, monthly: 200 },
    ],
  },
};

/** Normalise a free-text state to the PT_SLABS key ("Tamil Nadu" → "TAMIL_NADU"). */
/**
 * Derive the PT slab lookup key from a state string.
 *
 * "&" and "and" are treated as equivalent. Two lists of Indian states disagreed on
 * exactly that (the employee dropdown said "Jammu & Kashmir", the slab table
 * "Jammu and Kashmir"), and because this function only uppercased and underscored
 * whitespace, the two produced different keys — so a state PICKED FROM A DROPDOWN
 * resolved no slab and fell through to `unknownState` with ₹0 PT.
 *
 * Both lists were realigned, but that alone would leave the same trap for the next
 * divergence, so the normaliser absorbs this class of drift too: "&" becomes "AND"
 * before whitespace is collapsed, and any run of underscores is squeezed to one, so
 * "Jammu & Kashmir", "Jammu and Kashmir" and "JAMMU_AND_KASHMIR" all yield
 * JAMMU_AND_KASHMIR.
 *
 * Guarded by apps/api/src/__tests__/state-list-slab-parity.test.ts.
 */
export function normalizePtStateKey(state: string): string {
  return state
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

// ── Half-yearly PT collection timing ───────────────────────────────────────────
// Kerala, Tamil Nadu (and Puducherry, not yet slabbed / not a pilot state) levy PT once
// per six-month period on the period's income. FY months: Apr=1 … Mar=12.
//   H1 = Apr–Sep (FY months 1–6)   H2 = Oct–Mar (FY months 7–12)
//
// ⚠️ CA RULING PENDING — the CA said Apr–Sep is collected "in August or September" and
// Oct–Mar "in January or February" but has NOT chosen between them. Values below take the
// LATER month of each window (Sep = 6, Feb = 11).
//
// ⚠️⚠️ CORRECTNESS, NOT JUST TIMING — READ BEFORE EDITING A VALUE. PT is assessed on the
// WHOLE six-month income. A collection month EARLIER THAN THE PERIOD END means the period's
// later months have not elapsed yet, so the full income is unknown at collection time — the
// engine then FLAGS (deducts ₹0, warns), it does NOT assess a partial period (a lower income
// would fall into a lower bracket → silent under-collection, the employer's liability). So:
//   • H1 = Sep (period end, month 6) ⇒ fully assessable. Changing H1 to Aug (month 5) makes
//     it flag every time (Sep tail unelapsed) — safe, not silently wrong. Verified by test.
//   • H2 = Feb (month 11) is BEFORE the H2 period end (Mar, month 12), so H2 ALWAYS flags
//     under this default (March tail). Jan (month 10) would too. This is an OPEN CA QUESTION:
//     the CA's stated H2 window (Jan/Feb) precedes the period end, so H2 PT cannot be
//     auto-assessed until the CA reconciles "assess full period" with "collect before it
//     ends" (e.g. collect in March, or rule an explicit basis). Until then H2 flags for
//     manual handling — deliberately, never a guessed amount.
// When the CA answers, change the number HERE (this one table); no other edit is needed.
const PT_HALF_YEARLY_DEPOSIT_MONTH: Record<string, { h1: number; h2: number }> = {
  KERALA: { h1: 6 /* Sep — AWAITING CA; alt Aug=5 (would flag) */, h2: 11 /* Feb — AWAITING CA; H2 flags until reconciled */ },
  TAMIL_NADU: { h1: 6 /* Sep — AWAITING CA; alt Aug=5 (would flag) */, h2: 11 /* Feb — AWAITING CA; H2 flags until reconciled */ },
};

function ptHalfOf(monthInFY: number): "H1" | "H2" {
  return monthInFY <= 6 ? "H1" : "H2";
}
function ptPeriodStartMonth(half: "H1" | "H2"): number {
  return half === "H1" ? 1 : 7;
}
function ptPeriodEndMonth(half: "H1" | "H2"): number {
  return half === "H1" ? 6 : 12;
}
/** The collection (deposit) FY month for `state`'s half-yearly period containing
 *  `monthInFY`, or null when the state does not levy half-yearly. */
function ptDepositMonth(stateKey: string, monthInFY: number): number | null {
  const cfg = PT_HALF_YEARLY_DEPOSIT_MONTH[stateKey];
  if (!cfg) return null;
  return ptHalfOf(monthInFY) === "H1" ? cfg.h1 : cfg.h2;
}

/** Period months (1=Apr … 12=Mar) AFTER `collectionMonthInFY` within its half-yearly period —
 *  the "unelapsed tail". Non-empty ⇒ the collection month falls before the period end, so the
 *  full six-month income is not yet known and the assessment must flag (TIMING cause). Empty
 *  only when the collection month IS the period end (Sep for H1, Mar for H2). Exposed so the
 *  collection-month choice (a CA-pending constant) can be exercised directly in tests. */
export function ptUnelapsedTailMonths(collectionMonthInFY: number): number[] {
  const end = ptPeriodEndMonth(ptHalfOf(collectionMonthInFY));
  const tail: number[] = [];
  for (let m = collectionMonthInFY + 1; m <= end; m++) tail.push(m);
  return tail;
}

/** The pure half-yearly PT decision AT a collection month. Assumes `monthInFY` is the
 *  collection month. Assesses the whole six-month period: the earlier months' gross the caller
 *  supplies (`priorGross`), any earlier month it could not find (`missingHistory`, DATA cause),
 *  plus this month's `currentGross`. It refuses to assess unless the period is WHOLE — every
 *  earlier month on record AND no unelapsed tail — returning a flag with the two causes named
 *  separately. Exposed so the collection-month constant can be exercised directly (e.g. testing
 *  that an August H1 collection flags on the unelapsed September tail). */
export function assessHalfYearlyPtAtCollection(
  monthInFY: number,
  slabs: PTSlab[],
  currentGross: number,
  priorGross: number | null | undefined,
  missingHistory: number[] | undefined,
): {
  ptAmount: number;
  deposited: boolean;
  incompletePeriod: boolean;
  incompleteMissingMonths: number[];
  incompleteUnelapsedMonths: number[];
} {
  const start = ptPeriodStartMonth(ptHalfOf(monthInFY));
  // DATA cause: when the caller supplied NO prior income at all, treat every earlier period
  // month as absent (a preview / unwired caller must fail loud, never assess from one month).
  const missing =
    priorGross == null
      ? Array.from({ length: monthInFY - start }, (_, i) => start + i)
      : missingHistory ?? [];
  // TIMING cause: period months not yet elapsed at this collection month.
  const unelapsed = ptUnelapsedTailMonths(monthInFY);

  if (missing.length > 0 || unelapsed.length > 0) {
    return {
      ptAmount: 0,
      deposited: false,
      incompletePeriod: true,
      incompleteMissingMonths: missing,
      incompleteUnelapsedMonths: unelapsed,
    };
  }

  // Whole period assessable: earlier months (all on record) + this month = the six-month income.
  const halfYearlyIncome = Math.round((priorGross ?? 0) + currentGross);
  let lump = 0;
  for (const slab of slabs) {
    if (halfYearlyIncome >= slab.from && halfYearlyIncome <= slab.to) {
      lump = slab.monthly;
      break;
    }
  }
  return {
    ptAmount: lump,
    deposited: true,
    incompletePeriod: false,
    incompleteMissingMonths: [],
    incompleteUnelapsedMonths: [],
  };
}

/**
 * The FY months (1=Apr … 12=Mar) whose PAYSLIP gross a caller must gather to assess
 * half-yearly PT at `monthInFY` — the current period's months from the period start up to
 * (but NOT including) `monthInFY` itself; the engine adds the current month's live gross.
 *
 * Returns `[]` for a MONTHLY state, and for a half-yearly state in any month that is NOT its
 * collection month — so a caller can cheaply skip the payslip lookup except in the one month
 * it matters. The caller sums the gross for the returned months, reports any it cannot find
 * as `periodMissingMonths`, and passes both to `computePT` via `PTContext`.
 *
 * Levy period is read from the in-code PT_SLABS (a structural property of the state, not a
 * DB-overridable rate), so this is stable regardless of any effective-dated slab override.
 */
export function ptPriorPeriodMonths(state: string, monthInFY: number): number[] {
  const stateKey = normalizePtStateKey(state);
  const config = PT_SLABS[stateKey];
  if (!config || (config.levyPeriod ?? "MONTHLY") !== "HALF_YEARLY") return [];
  const deposit = ptDepositMonth(stateKey, monthInFY);
  if (deposit == null || monthInFY !== deposit) return [];
  const start = ptPeriodStartMonth(ptHalfOf(monthInFY));
  const months: number[] = [];
  for (let m = start; m < monthInFY; m++) months.push(m);
  return months;
}

export function computePT(
  grossMonthly: number,
  state: string,
  monthInFY: number, // 1=April, 12=March
  overrides?: Record<string, { slabs: PTSlab[]; annualCap: number; levyPeriod?: PtLevyPeriod }>,
  ctx?: PTContext
): PTComputation {
  // CA Tier-1 exemption: if the employee qualifies under ANY of the four paths
  // (armed forces / own disability / dependent-with-disability / age > 65), PT is
  // bypassed entirely across ALL states — before any slab lookup. The caller resolves
  // the composite `exempt` flag (age derives from DOB there; the rest are declared).
  if (ctx?.exempt) {
    return { state, grossMonthly, ptAmount: 0, annualPT: 0, exempt: true };
  }

  let stateKey = normalizePtStateKey(state);

  // Maharashtra is gender-split. Select the female bracket set only for a stated
  // `female`; unstated or `other` falls through to the male set (MAHARASHTRA), the
  // lower-threshold slabs — never under-deduct on an absent gender (CA rule).
  if (stateKey === "MAHARASHTRA" && ctx?.gender === "female") {
    stateKey = "MAHARASHTRA_FEMALE";
  }

  const config = overrides?.[stateKey] || PT_SLABS[stateKey];

  // No config at all → the state is UNKNOWN (likely a misspelling like "Karnatak").
  // PT is 0, but flag it so the caller can surface the row: an unresolved 0 must be
  // distinguishable from a levied 0. This is a plausible-wrong outcome nobody sees.
  if (!config) {
    return { state, grossMonthly, ptAmount: 0, annualPT: 0, unknownState: true };
  }

  // Config exists but levies nothing (e.g. Delhi, slabs: []). This 0 is CORRECT and
  // deliberately silent — do NOT flag it as unknown.
  if (config.slabs.length === 0) {
    return { state, grossMonthly, ptAmount: 0, annualPT: 0 };
  }

  // Levy period is a STRUCTURAL property of the state, so read it from the in-code base
  // config — never from an effective-dated slab override, which carries no levy period and
  // would otherwise silently turn a half-yearly state monthly. Slabs/cap still come from
  // the override (`config`) when one is present.
  const levyPeriod: PtLevyPeriod =
    (overrides?.[stateKey]?.levyPeriod ?? PT_SLABS[stateKey]?.levyPeriod) ?? "MONTHLY";

  // ── HALF-YEARLY levy (Kerala, Tamil Nadu) ─────────────────────────────────────
  // PT is assessed once per six-month period on the WHOLE period's income and collected in
  // ONE month; the other five deduct nothing. The bracket lookup uses half-yearly income, not
  // monthly gross. The assessment refuses to compute unless the whole period is available —
  // every earlier month on record AND no unelapsed tail — so it can never under-collect from a
  // partial period. See assessHalfYearlyPtAtCollection.
  if (levyPeriod === "HALF_YEARLY") {
    const deposit = ptDepositMonth(stateKey, monthInFY);
    if (deposit == null || monthInFY !== deposit) {
      // Not the collection month → nothing is deducted this month.
      return { state, grossMonthly, ptAmount: 0, annualPT: config.annualCap, levyPeriod, deposited: false };
    }
    const a = assessHalfYearlyPtAtCollection(
      monthInFY,
      config.slabs,
      grossMonthly,
      ctx?.periodPriorGross,
      ctx?.periodMissingMonths,
    );
    return {
      state,
      grossMonthly,
      ptAmount: a.ptAmount,
      annualPT: config.annualCap,
      levyPeriod,
      deposited: a.deposited,
      incompletePeriod: a.incompletePeriod || undefined,
      incompleteMissingMonths: a.incompleteMissingMonths.length > 0 ? a.incompleteMissingMonths : undefined,
      incompleteUnelapsedMonths: a.incompleteUnelapsedMonths.length > 0 ? a.incompleteUnelapsedMonths : undefined,
    };
  }

  // ── MONTHLY levy (the default) ────────────────────────────────────────────────
  let ptAmount = 0;
  const roundedGross = Math.round(grossMonthly);
  for (const slab of config.slabs) {
    if (roundedGross >= slab.from && roundedGross <= slab.to) {
      ptAmount = slab.monthly;
      break;
    }
  }

  // February (FY month 11) top-band true-up to hit the annual cap: Maharashtra and
  // Karnataka both levy ₹300 in Feb (CA matrix). Only applies when the employee is in
  // the top (₹200) band this month — i.e. current ptAmount is already 200 — so lower
  // bands are unaffected. Covers the Maharashtra male + female sets and Karnataka.
  const FEB_300_STATES = new Set(["MAHARASHTRA", "MAHARASHTRA_FEMALE", "KARNATAKA"]);
  if (FEB_300_STATES.has(stateKey) && monthInFY === 11 && ptAmount === 200) {
    ptAmount = 300;
  }

  return {
    state,
    grossMonthly,
    ptAmount,
    annualPT: config.annualCap,
    levyPeriod: "MONTHLY",
  };
}

// ─── LABOUR WELFARE FUND ───────────────────────────────────────────────────────

const LWF_RATES: Record<string, { employee: number; employer: number; frequency: "HALF_YEARLY" | "ANNUAL" }> = {
  MAHARASHTRA: { employee: 12, employer: 36, frequency: "HALF_YEARLY" },
  KARNATAKA: { employee: 20, employer: 40, frequency: "ANNUAL" },
  TAMIL_NADU: { employee: 10, employer: 20, frequency: "HALF_YEARLY" },
  TELANGANA: { employee: 2, employer: 5, frequency: "HALF_YEARLY" },
  DELHI: { employee: 1, employer: 1, frequency: "HALF_YEARLY" },
  KERALA: { employee: 12, employer: 36, frequency: "HALF_YEARLY" },
};

export function computeLWF(
  state: string,
  overrides?: Record<
    string,
    { employee: number; employer: number; frequency: "HALF_YEARLY" | "ANNUAL" }
  >
): LWFComputation {
  const stateKey = state.toUpperCase().replace(/\s+/g, "_");
  const config = overrides?.[stateKey] || LWF_RATES[stateKey];

  if (!config) {
    return { state, employeeLWF: 0, employerLWF: 0 };
  }

  return {
    state,
    employeeLWF: config.employee,
    employerLWF: config.employer,
  };
}

// ─── COMBINED MONTHLY COMPUTATION ──────────────────────────────────────────────

export function computeMonthlyStatutory(
  basicPlusDA: number,
  grossMonthly: number,
  state: string,
  monthInFY: number,
  isVoluntaryHigherPF: boolean = false,
  overrides: StatutoryCeilingOverrides = {},
  ptContext?: PTContext,
  esiMemberAtPeriodStart?: boolean | null,
  esiEligibilityGross?: number,
  voluntaryPfRate: number = 0,
): MonthlyStatutoryDeductions {
  const pf = computePF(
    basicPlusDA,
    isVoluntaryHigherPF,
    overrides.pfWageCeiling,
    voluntaryPfRate,
    // Establishment PF rate (10% for small/sick, else 12%). Resolved by the caller from the org.
    overrides.pfContributionRate,
  );
  const esi = computeESI(grossMonthly, overrides.esiWageCeiling, {
    monthInFY,
    memberAtPeriodStart: esiMemberAtPeriodStart,
    eligibilityGross: esiEligibilityGross,
  });
  const pt = computePT(grossMonthly, state, monthInFY, overrides.ptSlabs, ptContext);
  const lwf = computeLWF(state, overrides.lwfRates);

  // LWF is half-yearly (June/Dec = months 3 and 9 in FY)
  const isLWFMonth = monthInFY === 3 || monthInFY === 9;

  const totalEmployeeDeductions =
    pf.totalEmployee +
    esi.employeeESI +
    pt.ptAmount +
    (isLWFMonth ? lwf.employeeLWF : 0);

  const totalEmployerContributions =
    pf.totalEmployer +
    esi.employerESI +
    (isLWFMonth ? lwf.employerLWF : 0);

  return {
    pf,
    esi,
    pt,
    lwf,
    totalEmployeeDeductions,
    totalEmployerContributions,
  };
}

// ─── LABOUR CODES 2025 — WAGE-BASE PROVISO (Code on Wages, 2019 s.2(y)) ─────────
//
// From 2025-11-21 the four Labour Codes redefine "wages". The Code on Wages
// s.2(y) lists components EXCLUDED from wages (HRA, conveyance, overtime, bonus,
// commission, employer PF/pension contributions, etc.), then adds a proviso:
//
//   "…for calculating the wages under this clause, if payments made by the
//    employer to the employee under [the excluded heads] exceeds one-half … of
//    all remuneration …, the amount which exceeds such one-half … shall be
//    deemed as remuneration and shall be accordingly added in wages …"
//
// i.e. the EXCESS OF THE EXCLUSIONS OVER 50% of total remuneration is clawed
// BACK INTO wages. The statutory wage base is therefore EXACTLY 50% of total
// remuneration — a fixed figure, not a mere floor: an artificially low Basic+DA
// is lifted UP to the half, and a Basic-heavy core sitting ABOVE the half is
// clamped back DOWN to it. That base then feeds the PF (and, via the ceilings,
// bonus) computation.
//
// This function is PURE and returns the breakdown so callers/tests can assert
// each step. It does NOT apply any ceiling — the caller passes the resulting
// `statutoryWageBase` into `computePF` (which then clamps at the PF ceiling).

export interface LabourCodeWageBase {
  /** Basic + DA + retaining allowance — the components already INSIDE "wages". */
  coreWages: number;
  /** Total remuneration = coreWages + excluded allowances (the s.2(y) universe). */
  totalRemuneration: number;
  /** Sum of the s.2(y)-excluded components (everything not in coreWages). */
  exclusions: number;
  /** 50% of total remuneration — the proviso threshold. */
  halfOfTotal: number;
  /** Amount clawed back into wages = max(0, exclusions − halfOfTotal). */
  addBack: number;
  /**
   * Final statutory wage base = EXACTLY 50% of total remuneration whenever the
   * proviso applies — a fixed figure, not a floor. The add-back lifts a
   * below-half core UP to half; the clamp brings an above-half core DOWN to half.
   */
  statutoryWageBase: number;
}

/**
 * Apply the Code on Wages s.2(y) 50%-inclusion proviso to arrive at the
 * statutory wage base for PF/ESI/bonus BEFORE any ceiling clamp.
 *
 * @param coreWages          Basic + DA + retaining allowance (already "wages").
 * @param excludedAllowances Sum of the s.2(y)-excluded components (HRA,
 *                           conveyance, special allowance, etc.). Must NOT
 *                           include `coreWages`.
 *
 * Negative inputs are floored at 0. The statutory wage base is EXACTLY 50% of
 * total remuneration — a fixed figure, not a floor. When exclusions exceed 50%,
 * `addBack` lifts a below-half core UP to the half; when the core sits ABOVE the
 * half (a Basic-heavy structure), the clamp brings it back DOWN to the half.
 * Either way the base lands on exactly 50% of total remuneration.
 */
export function calculateLabourCodeWageBase(
  coreWages: number,
  excludedAllowances: number,
): LabourCodeWageBase {
  const core = Math.max(0, coreWages);
  const exclusions = Math.max(0, excludedAllowances);
  const totalRemuneration = core + exclusions;
  const halfOfTotal = totalRemuneration / 2;
  const addBack = Math.max(0, exclusions - halfOfTotal);
  // The base is EXACTLY half of total remuneration: the add-back lifts a
  // below-half core (core + addBack === halfOfTotal), and this clamp brings an
  // above-half core (addBack === 0, core > halfOfTotal) back down to the half.
  // Round to whole rupees to stay consistent with downstream Math.round math.
  const statutoryWageBase = Math.round(Math.min(core + addBack, halfOfTotal));

  return {
    coreWages: core,
    totalRemuneration,
    exclusions,
    halfOfTotal,
    addBack,
    statutoryWageBase,
  };
}

// ─── PAYMENT OF BONUS ACT — STATUTORY ELIGIBILITY GATE ─────────────────────────

const BONUS_ELIGIBILITY_WAGE_CEILING = 21_000;

export interface BonusEligibility {
  /** Monthly wage tested against the ceiling (Basic + DA). */
  wageForBonus: number;
  ceiling: number;
  isEligible: boolean;
}

/**
 * Payment of Bonus Act statutory-bonus eligibility gate: an employee is eligible
 * only if monthly Basic+DA ≤ the ceiling (₹21,000 under the Labour Codes).
 *
 * PURE. Callers decide what to do with `isEligible`; the payslip pipeline zeroes
 * statutory bonus for ineligible employees ONLY when a ceiling is actually
 * resolved (so behaviour is unchanged for orgs without the seeded ceiling row).
 */
export function computeStatutoryBonusEligibility(
  basicPlusDA: number,
  ceiling: number = BONUS_ELIGIBILITY_WAGE_CEILING,
): BonusEligibility {
  const wageForBonus = Math.max(0, basicPlusDA);
  return {
    wageForBonus,
    ceiling,
    isEligible: wageForBonus <= ceiling,
  };
}
