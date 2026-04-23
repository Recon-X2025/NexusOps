/**
 * NexusOps India Tax Computation Engine
 * ─────────────────────────────────────
 * Handles FY 2025-26 (AY 2026-27) tax computation for both Old and New regimes.
 * Surcharge, Section 87A rebate, Health & Education Cess all included.
 *
 * References:
 *  - Income Tax Act, 1961 (as amended by Finance Act 2025)
 *  - Section 115BAC (New Regime — default from FY 2023-24)
 *  - Section 87A rebate (Old: ≤5L taxable → ₹12,500; New: ≤7L → ₹25,000)
 *  - Section 80C, 80D, 80CCD(1B), 80TTA/80TTB, 24(b) (Old Regime only)
 *  - Standard deduction: ₹75,000 (New), ₹50,000 (Old)
 */

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

const NEW_REGIME_SLABS = [
  { from: 0, to: 300_000, rate: 0 },
  { from: 300_000, to: 700_000, rate: 0.05 },
  { from: 700_000, to: 1_000_000, rate: 0.10 },
  { from: 1_000_000, to: 1_200_000, rate: 0.15 },
  { from: 1_200_000, to: 1_500_000, rate: 0.20 },
  { from: 1_500_000, to: Infinity, rate: 0.30 },
];

// ─── SURCHARGE SLABS ───────────────────────────────────────────────────────────

function computeSurcharge(taxableIncome: number, basicTax: number): number {
  if (taxableIncome <= 5_000_000) return 0;
  if (taxableIncome <= 10_000_000) return basicTax * 0.10;
  if (taxableIncome <= 20_000_000) return basicTax * 0.15;
  if (taxableIncome <= 50_000_000) return basicTax * 0.25;
  return basicTax * 0.37; // >5 crore (marginal relief may apply)
}

// ─── SLAB COMPUTATION ──────────────────────────────────────────────────────────

function computeSlabTax(
  taxableIncome: number,
  slabs: typeof OLD_REGIME_SLABS
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

export function computeTax(profile: EmployeeTaxProfile): TaxComputation {
  const { regime, monthsInFY } = profile;

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
  let section24bDeduction = 0;

  if (regime === "NEW") {
    standardDeduction = Math.min(75_000, grossSalary);
  } else {
    // Old regime
    standardDeduction = Math.min(50_000, grossSalary);
    hraExemption = profile.hraExemption;
    chapter6ADeductions = Math.min(
      Math.min(profile.section80C, 150_000) +
        Math.min(profile.section80D, 75_000) + // 25K self + 25K parents + 25K senior parents
        Math.min(profile.section80CCD1B, 50_000) +
        Math.min(profile.section80TTA, 10_000),
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
  const slabs = regime === "NEW" ? NEW_REGIME_SLABS : OLD_REGIME_SLABS;
  const { totalTax: taxOnIncome, breakdown } = computeSlabTax(
    taxableIncome,
    slabs
  );

  // Step 5: Section 87A rebate
  let rebate87A = 0;
  if (regime === "OLD" && taxableIncome <= 500_000) {
    rebate87A = Math.min(taxOnIncome, 12_500);
  } else if (regime === "NEW" && taxableIncome <= 700_000) {
    rebate87A = Math.min(taxOnIncome, 25_000);
  }

  const taxAfterRebate = Math.max(0, taxOnIncome - rebate87A);

  // Step 6: Surcharge
  const surcharge = computeSurcharge(taxableIncome, taxAfterRebate);

  // Step 7: Health & Education Cess (4%)
  const cess = Math.round((taxAfterRebate + surcharge) * 0.04);

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
  tdsDeductedSoFar: number
): TaxComputation {
  // Recompute with revised salary projected for remaining months
  const revisedComputation = computeTax(newProfile);

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
