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
  employeePF: number; // 12% of pfWageBase
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
}

export interface PTComputation {
  state: string;
  grossMonthly: number;
  ptAmount: number; // Monthly PT deduction
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
  esiWageCeiling?: number;
  ptSlabs?: Record<string, { slabs: PTSlab[]; annualCap: number }>;
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
  wageCeiling: number = PF_STATUTORY_WAGE_CEILING
): PFComputation {
  // Statutory: PF on min(basic+DA, ceiling). Many employers contribute on actual basic.
  const pfWageBase = isVoluntaryHigherPF
    ? basicPlusDA
    : Math.min(basicPlusDA, wageCeiling);

  const employeePF = Math.round(pfWageBase * PF_EMPLOYEE_RATE);

  // EPS is always capped at the statutory ceiling base
  const epsBase = Math.min(basicPlusDA, wageCeiling);
  const employerEPS = Math.round(epsBase * PF_EMPLOYER_EPS_RATE);
  const employerEPF = Math.round(pfWageBase * PF_EMPLOYER_EPF_RATE);
  const employerEDLI = Math.round(epsBase * PF_EDLI_RATE);
  const adminCharges = Math.round(pfWageBase * PF_ADMIN_RATE);

  return {
    basicPlusDA,
    pfWageBase,
    employeePF,
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

export function computeESI(
  grossMonthly: number,
  wageCeiling: number = ESI_WAGE_CEILING
): ESIComputation {
  const isApplicable = grossMonthly <= wageCeiling;

  if (!isApplicable) {
    return { isApplicable, grossMonthly, employeeESI: 0, employerESI: 0 };
  }

  return {
    isApplicable,
    grossMonthly,
    employeeESI: Math.round(grossMonthly * ESI_EMPLOYEE_RATE),
    employerESI: Math.round(grossMonthly * ESI_EMPLOYER_RATE),
  };
}

// ─── PROFESSIONAL TAX ──────────────────────────────────────────────────────────

const PT_SLABS: Record<string, { slabs: PTSlab[]; annualCap: number }> = {
  // Maharashtra is GENDER-SPLIT (CA matrix). MAHARASHTRA below is the MALE set and
  // remains the default. MAHARASHTRA_FEMALE is the female set — nil to ₹25,000, then
  // ₹200 (₹300 in Feb). KNOWN LIMITATION: gender is not yet a field on the employee
  // record, so computePT cannot select the female set today. The female config is
  // populated here so it lands atomically with gender ingestion (C2-STRUCT); until
  // then every Maharashtra employee resolves to the MALE brackets. We do NOT guess a
  // gender default — absent gender means the existing male set applies (documented,
  // not silent). See reports/fix-plan.md → C2.
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
      // UNREACHABLE until gender ingestion lands (see comment above / C2-STRUCT).
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
    annualCap: 2_500,
    slabs: [
      { from: 0, to: 21_000, monthly: 0 },
      { from: 21_001, to: 30_000, monthly: 135 },
      { from: 30_001, to: 45_000, monthly: 315 },
      { from: 45_001, to: 60_000, monthly: 690 },
      { from: 60_001, to: 75_000, monthly: 1_025 },
      { from: 75_001, to: Infinity, monthly: 1_250 },
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

export function computePT(
  grossMonthly: number,
  state: string,
  monthInFY: number, // 1=April, 12=March
  overrides?: Record<string, { slabs: PTSlab[]; annualCap: number }>,
  ctx?: PTContext
): PTComputation {
  // CA Tier-1 exemption: if the employee qualifies under ANY of the four paths
  // (armed forces / own disability / dependent-with-disability / age > 65), PT is
  // bypassed entirely across ALL states — before any slab lookup. The caller resolves
  // the composite `exempt` flag (age derives from DOB there; the rest are declared).
  if (ctx?.exempt) {
    return { state, grossMonthly, ptAmount: 0, annualPT: 0, exempt: true };
  }

  let stateKey = state.toUpperCase().replace(/\s+/g, "_");

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
  ptContext?: PTContext
): MonthlyStatutoryDeductions {
  const pf = computePF(basicPlusDA, isVoluntaryHigherPF, overrides.pfWageCeiling);
  const esi = computeESI(grossMonthly, overrides.esiWageCeiling);
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
// BACK INTO wages. This lifts an artificially low Basic+DA up toward a floor of
// 50% of total remuneration, which then feeds the PF/ESI/bonus ceilings.
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
  /** Final statutory wage base = coreWages + addBack (never below coreWages). */
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
 * Negative inputs are floored at 0. When exclusions are ≤ 50% of total
 * remuneration, `addBack` is 0 and the base equals `coreWages`, so a
 * conventionally-structured salary is unaffected.
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
  // Round to whole rupees to keep the base consistent with downstream
  // Math.round-based statutory computations.
  const statutoryWageBase = Math.round(core + addBack);

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
