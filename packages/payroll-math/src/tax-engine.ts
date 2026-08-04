/**
 * CoheronConnect India Tax Computation Engine
 * ─────────────────────────────────────
 * Handles FY 2025-26 (AY 2026-27) tax computation for both Old and New regimes.
 * Surcharge, Section 87A rebate, Health & Education Cess all included.
 *
 * References:
 *  - Income Tax Act, 1961 (as amended by Finance Act 2025)
 *  - Section 115BAC (New Regime — default from FY 2023-24). Finance Act 2025
 *    revised the New-Regime slabs (₹4L basic exemption, 7 bands) effective
 *    FY 2025-26.
 *  - Section 87A rebate (Old: ≤5L taxable → ₹12,500; New: ≤12L → ₹60,000)
 *  - Section 80C, 80D, 80CCD(1B), 80TTA/80TTB, 24(b) (Old Regime only)
 *  - Standard deduction: ₹75,000 (New), ₹50,000 (Old)
 */

import type { TaxConfigOverride, SurchargeBand } from "./statutory-deductions";

// ─── TYPES ─────────────────────────────────────────────────────────────────────

export type TaxRegime = "OLD" | "NEW";

export interface EmployeeTaxProfile {
  regime: TaxRegime;
  annualCTC: number;
  basicMonthly: number;
  hraMonthly: number;
  specialAllowance: number;
  lta: number;
  // Old regime deductions
  section80C: number; // PPF, ELSS, LIC, PF contribution etc. (max 1,50,000)
  section80D: number; // Medical insurance premium (max 25K self + 25K parents)
  section80CCD1B: number; // NPS additional (max 50,000)
  section80TTA: number; // Savings interest (max 10,000)
  section24b: number; // Home loan interest (max 2,00,000)
  hraExemption: number; // Computed HRA exemption (min of 3 conditions)
  otherExemptions: number;
  // PF
  employeePFMonthly: number;
  employerPFMonthly: number;
  // Other
  professionalTax: number; // Annual PT (state-specific, typically ₹2,400-₹2,500)
  // Mid-year
  joiningMonth: number; // 1-12 (April = 1 for FY); 1 if full year
  monthsInFY: number; // Computed: 13 - joiningMonth
  previousEmployerIncome: number;
  previousEmployerTDS: number;
}

export interface TaxComputation {
  regime: TaxRegime;
  grossSalary: number;
  standardDeduction: number;
  professionalTax: number;
  hraExemption: number;
  chapter6ADeductions: number;
  chapter6ABreakdown: {
    section80C: number;
    section80D: number;
    section80CCD1B: number;
    section80TTA: number;
  };
  section24bDeduction: number;
  totalDeductions: number;
  taxableIncome: number;
  taxOnIncome: number;
  rebate87A: number;
  taxAfterRebate: number;
  surcharge: number;
  cess: number;
  totalTaxLiability: number;
  previousEmployerTDS: number;
  remainingTax: number;
  monthlyTDS: number;
  slabBreakdown: SlabEntry[];
}

export interface SlabEntry {
  from: number;
  to: number;
  rate: number;
  taxOnSlab: number;
}

// ─── TAX SLABS ─────────────────────────────────────────────────────────────────

const OLD_REGIME_SLABS = [
  { from: 0, to: 250_000, rate: 0 },
  { from: 250_000, to: 500_000, rate: 0.05 },
  { from: 500_000, to: 1_000_000, rate: 0.20 },
  { from: 1_000_000, to: Infinity, rate: 0.30 },
];

// New Regime slabs revised by Finance Act 2025 (FY 2025-26 / AY 2026-27):
// ₹4L basic exemption, then 5/10/15/20/25/30% in ₹4L bands up to ₹24L.
const NEW_REGIME_SLABS = [
  { from: 0, to: 400_000, rate: 0 },
  { from: 400_000, to: 800_000, rate: 0.05 },
  { from: 800_000, to: 1_200_000, rate: 0.10 },
  { from: 1_200_000, to: 1_600_000, rate: 0.15 },
  { from: 1_600_000, to: 2_000_000, rate: 0.20 },
  { from: 2_000_000, to: 2_400_000, rate: 0.25 },
  { from: 2_400_000, to: Infinity, rate: 0.30 },
];

// ─── SURCHARGE SLABS ───────────────────────────────────────────────────────────

/**
 * Surcharge thresholds (on *taxable income*) and the rate applied to the base
 * tax above each threshold. Ordered ascending.
 *  - >₹50L  → 10%
 *  - >₹1cr  → 15%
 *  - >₹2cr  → 25%
 *  - >₹5cr  → 37%
 */
const SURCHARGE_BANDS = [
  { threshold: 5_000_000, rate: 0.10 },
  { threshold: 10_000_000, rate: 0.15 },
  { threshold: 20_000_000, rate: 0.25 },
  { threshold: 50_000_000, rate: 0.37 },
] as const;

/**
 * Under s.115BAC the NEW-regime surcharge is capped at 25% — it does NOT step up
 * to 37% above ₹5 crore (that 37% band is OLD-regime only). This is a GUARD, not a
 * band edit: it clamps whatever band list is in force (in-code default OR a seeded
 * config) so a future seed/config change can never reintroduce a >25% surcharge for
 * the new regime. It also fixes the surcharge marginal-relief threshold — by
 * dropping the ₹5cr@37% band for NEW, the highest band a new-regime taxpayer can
 * cross is ₹2cr@25%, so no ₹5cr marginal-relief calculation is ever applied to
 * new-regime income. The old regime keeps the full band set (37% above ₹5cr).
 */
const NEW_REGIME_MAX_SURCHARGE_RATE = 0.25;

function effectiveSurchargeBands(
  regime: TaxRegime,
  bands: readonly SurchargeBand[]
): SurchargeBand[] {
  if (regime !== "NEW") return [...bands];
  // Keep only bands at/under the new-regime cap; any band above it (e.g. 37%) is
  // dropped so it can neither raise the rate nor become a marginal-relief threshold.
  return bands.filter((b) => b.rate <= NEW_REGIME_MAX_SURCHARGE_RATE);
}

/** Surcharge rate that applies at exactly `income` (the band whose threshold it last crossed). */
function surchargeRateFor(
  income: number,
  bands: readonly SurchargeBand[]
): number {
  let rate = 0;
  for (const band of bands) {
    if (income > band.threshold) rate = band.rate;
  }
  return rate;
}

/**
 * Surcharge on `basicTax` for the given taxable income, WITH marginal relief.
 *
 * Marginal relief (Income Tax Act, proviso to the surcharge provisions) caps the
 * surcharge so that crossing a threshold never costs more in additional
 * (tax + surcharge) than the income earned above that threshold. Concretely, for
 * the threshold T the taxpayer has crossed:
 *
 *   allowed(tax + surcharge) ≤ (tax + surcharge) at income = T  +  (income − T)
 *
 * where the liability "at T" uses the surcharge rate of the *previous* band (the
 * rate in force at exactly T). When the naive surcharge would breach that cap, it
 * is reduced (never below the surcharge that would apply at the threshold itself,
 * and never below zero).
 *
 * `baseTaxAt(income)` must return the tax-after-rebate for an arbitrary taxable
 * income under the same regime — so we can value the liability at the threshold.
 */
function computeSurcharge(
  taxableIncome: number,
  basicTax: number,
  baseTaxAt: (income: number) => number,
  bands: readonly SurchargeBand[],
): number {
  const rate = surchargeRateFor(taxableIncome, bands);
  if (rate === 0) return 0;

  // The threshold this income last crossed, and the surcharge rate in force at it.
  const band = [...bands].reverse().find((b) => taxableIncome > b.threshold)!;
  const threshold = band.threshold;

  const naiveSurcharge = basicTax * rate;

  // Liability (tax + surcharge) at exactly the threshold uses the *previous*
  // band's rate (the rate in force at income = threshold).
  const taxAtThreshold = baseTaxAt(threshold);
  const rateAtThreshold = surchargeRateFor(threshold, bands); // previous band (strict >)
  const liabilityAtThreshold = taxAtThreshold + taxAtThreshold * rateAtThreshold;

  // Cap: total (tax + surcharge) may not exceed liability-at-threshold plus the
  // income earned above the threshold.
  const maxLiability = liabilityAtThreshold + (taxableIncome - threshold);
  const cappedSurcharge = maxLiability - basicTax;

  const surcharge = Math.min(naiveSurcharge, cappedSurcharge);
  return Math.max(0, surcharge);
}

// ─── SLAB COMPUTATION ──────────────────────────────────────────────────────────

function computeSlabTax(
  taxableIncome: number,
  slabs: readonly { from: number; to: number; rate: number }[]
): { totalTax: number; breakdown: SlabEntry[] } {
  let remaining = Math.max(0, taxableIncome);
  let totalTax = 0;
  const breakdown: SlabEntry[] = [];

  for (const slab of slabs) {
    const slabWidth = slab.to === Infinity ? remaining : slab.to - slab.from;
    const taxableInSlab = Math.min(remaining, slabWidth);
    const taxOnSlab = Math.round(taxableInSlab * slab.rate);

    breakdown.push({
      from: slab.from,
      to: slab.to === Infinity ? slab.from + remaining : slab.to,
      rate: slab.rate,
      taxOnSlab,
    });

    totalTax += taxOnSlab;
    remaining -= taxableInSlab;

    if (remaining <= 0) break;
  }

  return { totalTax: Math.round(totalTax), breakdown };
}

// ─── HRA EXEMPTION ─────────────────────────────────────────────────────────────

export function computeHRAExemption(
  basicAnnual: number,
  hraReceived: number,
  rentPaid: number,
  isMetro: boolean // Delhi, Mumbai, Kolkata, Chennai
): number {
  if (rentPaid <= 0 || hraReceived <= 0) return 0;

  const a = hraReceived;
  const b = rentPaid - 0.1 * basicAnnual;
  const c = (isMetro ? 0.5 : 0.4) * basicAnnual;

  return Math.max(0, Math.round(Math.min(a, b, c)));
}

// ─── MAIN TAX COMPUTATION ──────────────────────────────────────────────────────

export function computeTax(
  profile: EmployeeTaxProfile,
  taxConfig?: TaxConfigOverride
): TaxComputation {
  const { regime, monthsInFY } = profile;

  // C5: resolve each rate from the effective-dated config when present, else fall
  // back to the in-code constant. An absent/empty `taxConfig` (every org today)
  // leaves every value at its default, so output is byte-identical to before.
  const oldSlabs = taxConfig?.oldSlabs ?? OLD_REGIME_SLABS;
  const newSlabs = taxConfig?.newSlabs ?? NEW_REGIME_SLABS;
  const stdDeductionNew = taxConfig?.stdDeductionNew ?? 75_000;
  const stdDeductionOld = taxConfig?.stdDeductionOld ?? 50_000;
  const rebate87aOld =
    taxConfig?.rebate87aOld ?? { threshold: 500_000, maxRebate: 12_500 };
  const rebate87aNew =
    taxConfig?.rebate87aNew ?? { threshold: 1_200_000, maxRebate: 60_000 };
  const surchargeBands = taxConfig?.surchargeBands ?? SURCHARGE_BANDS;
  const cessRate = taxConfig?.cessRate ?? 0.04;

  // Step 1: Gross salary (annualised — handle mid-year joins)
  const grossSalary =
    profile.joiningMonth === 1
      ? profile.annualCTC
      : Math.round(
          (profile.basicMonthly * 12 +
            profile.hraMonthly * 12 +
            profile.specialAllowance * 12 +
            profile.lta) *
            (monthsInFY / 12)
        ) + profile.previousEmployerIncome;

  // Step 2: Deductions based on regime
  let standardDeduction: number;
  let hraExemption = 0;
  let chapter6ADeductions = 0;
  let chapter6ABreakdown = {
    section80C: 0,
    section80D: 0,
    section80CCD1B: 0,
    section80TTA: 0,
  };
  let section24bDeduction = 0;

  if (regime === "NEW") {
    standardDeduction = Math.min(stdDeductionNew, grossSalary);
  } else {
    // Old regime
    standardDeduction = Math.min(stdDeductionOld, grossSalary);
    hraExemption = profile.hraExemption;
    chapter6ABreakdown = {
      section80C: Math.min(profile.section80C, 150_000),
      section80D: Math.min(profile.section80D, 75_000), // 25K self + 25K parents + 25K senior parents
      section80CCD1B: Math.min(profile.section80CCD1B, 50_000),
      section80TTA: Math.min(profile.section80TTA, 10_000),
    };
    chapter6ADeductions = Math.min(
      chapter6ABreakdown.section80C +
        chapter6ABreakdown.section80D +
        chapter6ABreakdown.section80CCD1B +
        chapter6ABreakdown.section80TTA,
      // Total 80C+80CCD(1)+80CCD(1B) capped at 2L effectively
      350_000
    );
    section24bDeduction = Math.min(profile.section24b, 200_000);
  }

  const professionalTax = profile.professionalTax;

  const totalDeductions =
    standardDeduction +
    professionalTax +
    hraExemption +
    chapter6ADeductions +
    section24bDeduction +
    (regime === "OLD" ? profile.otherExemptions : 0);

  // Step 3: Taxable income
  const taxableIncome = Math.max(0, Math.round(grossSalary - totalDeductions));

  // Step 4: Compute tax on slabs
  const slabs = regime === "NEW" ? newSlabs : oldSlabs;
  const { totalTax: taxOnIncome, breakdown } = computeSlabTax(
    taxableIncome,
    slabs
  );

  // Step 5: Section 87A rebate
  let rebate87A = 0;
  if (regime === "OLD" && taxableIncome <= rebate87aOld.threshold) {
    rebate87A = Math.min(taxOnIncome, rebate87aOld.maxRebate);
  } else if (regime === "NEW" && taxableIncome <= rebate87aNew.threshold) {
    // Finance Act 2025: rebate up to ₹60,000 for taxable income ≤ ₹12L,
    // making income up to ₹12L (₹12.75L incl. standard deduction) tax-free.
    rebate87A = Math.min(taxOnIncome, rebate87aNew.maxRebate);
  }

  let taxAfterRebate = Math.max(0, taxOnIncome - rebate87A);

  // Step 5b: s.87A rebate MARGINAL RELIEF (PT5).
  // Just above the rebate threshold the full rebate is lost on a sliver of extra
  // income, producing a cliff (e.g. NEW regime: ₹12,00,000 taxable → nil tax, but
  // ₹12,00,001 → the whole ₹60,000 slab tax). Relief caps the tax so it can never
  // exceed the income earned ABOVE the threshold. At ₹12,00,001 the excess is ₹1,
  // so tax is capped at ₹1; the relief tapers to nothing where the slab tax first
  // falls to (or below) the excess. Applied AFTER the rebate test and BEFORE
  // surcharge and cess. Only bites in the narrow band just past the threshold; for
  // incomes at/below the threshold the rebate already zeroed the tax, and far above
  // it the cap exceeds the actual tax so it is inert.
  const rebateThreshold =
    regime === "NEW" ? rebate87aNew.threshold : rebate87aOld.threshold;
  if (rebate87A === 0 && taxableIncome > rebateThreshold) {
    const excessOverThreshold = taxableIncome - rebateThreshold;
    if (taxAfterRebate > excessOverThreshold) {
      taxAfterRebate = excessOverThreshold;
    }
  }

  // Step 6: Surcharge (with marginal relief).
  // `baseTaxAt` values the tax-after-rebate for an arbitrary taxable income under
  // this regime, so marginal relief can compare liability at the threshold. It must
  // close over the SAME config-resolved `slabs`, or relief is computed against the
  // wrong curve. The 87A rebate never applies at surcharge-relevant incomes (>₹50L),
  // so it is 0 here.
  const baseTaxAt = (income: number): number =>
    computeSlabTax(Math.max(0, income), slabs).totalTax;
  // PT3: clamp the bands to the regime before both the rate lookup and the
  // marginal-relief threshold. NEW is capped at 25% (₹5cr@37% band dropped); OLD
  // keeps the full set. This guards the cap AND stops any ₹5cr relief for NEW.
  const regimeSurchargeBands = effectiveSurchargeBands(regime, surchargeBands);
  const surcharge = Math.round(
    computeSurcharge(taxableIncome, taxAfterRebate, baseTaxAt, regimeSurchargeBands)
  );

  // Step 7: Health & Education Cess (4%)
  const cess = Math.round((taxAfterRebate + surcharge) * cessRate);

  // Step 8: Total tax liability
  const totalTaxLiability = Math.round(taxAfterRebate + surcharge + cess);

  // Step 9: Compute monthly TDS
  const remainingTax = Math.max(
    0,
    totalTaxLiability - profile.previousEmployerTDS
  );
  const remainingMonths = Math.max(1, monthsInFY);
  const monthlyTDS = Math.round(remainingTax / remainingMonths);

  return {
    regime,
    grossSalary,
    standardDeduction,
    professionalTax,
    hraExemption,
    chapter6ADeductions,
    chapter6ABreakdown,
    section24bDeduction,
    totalDeductions,
    taxableIncome,
    taxOnIncome,
    rebate87A,
    taxAfterRebate,
    surcharge,
    cess,
    totalTaxLiability,
    previousEmployerTDS: profile.previousEmployerTDS,
    remainingTax,
    monthlyTDS,
    slabBreakdown: breakdown,
  };
}

// ─── MID-YEAR SALARY REVISION ──────────────────────────────────────────────────

export function recomputeTDSOnRevision(
  originalComputation: TaxComputation,
  newProfile: EmployeeTaxProfile,
  monthsElapsed: number,
  tdsDeductedSoFar: number,
  taxConfig?: TaxConfigOverride
): TaxComputation {
  // Recompute with revised salary projected for remaining months
  const revisedComputation = computeTax(newProfile, taxConfig);

  // Adjust: TDS already deducted in previous months stays, redistribute remaining
  const remainingTax = Math.max(
    0,
    revisedComputation.totalTaxLiability - tdsDeductedSoFar
  );
  const remainingMonths = Math.max(1, newProfile.monthsInFY - monthsElapsed);

  return {
    ...revisedComputation,
    remainingTax,
    monthlyTDS: Math.round(remainingTax / remainingMonths),
  };
}
