/**
 * India Payroll & Tax Engine
 *
 * Implements:
 *  - Old Regime tax computation (slabs + deductions + rebate + surcharge + cess)
 *  - New Regime tax computation (slabs + rebate + cess)
 *  - HRA exemption (metro/non-metro)
 *  - Monthly TDS projection
 *  - PF deduction (EPF + EPS split)
 *  - Professional Tax (state-wise slabs)
 *  - ECR line generation
 *
 * All monetary values in INR (paise-accurate via number, returned as number).
 * Financial Year: April 1 → March 31.
 */

// ── Professional Tax Slabs ────────────────────────────────────────────────
// Monthly gross salary → PT amount in INR per month
const PT_SLABS: Record<string, Array<{ upTo: number; pt: number }>> = {
  "Maharashtra": [
    { upTo: 7500, pt: 0 },
    { upTo: 10000, pt: 175 },
    { upTo: Infinity, pt: 200 },
  ],
  "Karnataka": [
    { upTo: 15000, pt: 0 },
    { upTo: 25000, pt: 150 },
    { upTo: 35000, pt: 200 },
    { upTo: Infinity, pt: 200 },
  ],
  "West Bengal": [
    { upTo: 10000, pt: 0 },
    { upTo: 15000, pt: 110 },
    { upTo: 25000, pt: 130 },
    { upTo: 40000, pt: 150 },
    { upTo: Infinity, pt: 200 },
  ],
  "Tamil Nadu": [
    { upTo: 21000, pt: 0 },
    { upTo: Infinity, pt: 135 },
  ],
  "Andhra Pradesh": [
    { upTo: 15000, pt: 0 },
    { upTo: 20000, pt: 150 },
    { upTo: Infinity, pt: 200 },
  ],
  "Telangana": [
    { upTo: 15000, pt: 0 },
    { upTo: 20000, pt: 150 },
    { upTo: Infinity, pt: 200 },
  ],
  "Gujarat": [
    { upTo: 5999, pt: 0 },
    { upTo: 8999, pt: 80 },
    { upTo: 11999, pt: 150 },
    { upTo: Infinity, pt: 200 },
  ],
  "Madhya Pradesh": [
    { upTo: 18750, pt: 0 },
    { upTo: Infinity, pt: 208 },
  ],
};

export function getStatePT(state: string, monthlyGross: number): number {
  const slabs = PT_SLABS[state];
  if (!slabs) return 0;
  for (const slab of slabs) {
    if (monthlyGross <= slab.upTo) return slab.pt;
  }
  return 0;
}

// ── HRA Exemption ─────────────────────────────────────────────────────────
export function computeHRAExemption(params: {
  hraReceivedAnnual: number;
  rentPaidAnnual: number;
  basicAnnual: number;
  isMetroCity: boolean;
}): number {
  const { hraReceivedAnnual, rentPaidAnnual, basicAnnual, isMetroCity } = params;
  const excess = rentPaidAnnual - 0.1 * basicAnnual;
  const percentLimit = isMetroCity ? 0.5 * basicAnnual : 0.4 * basicAnnual;
  const exemption = Math.min(hraReceivedAnnual, Math.max(0, excess), percentLimit);
  return Math.max(0, exemption);
}

// ── PF Deduction ──────────────────────────────────────────────────────────
const PF_WAGE_CEILING = 15000;
const EPF_RATE = 0.12;
const EPS_RATE = 0.0833; // 8.33% of wage (capped ₹1,250/month)
const EPS_CAP_MONTHLY = 1250;

export function computePFDeduction(pfWagesMonthly: number): {
  employeeEpf: number;
  employerEpf: number;
  employerEps: number;
  totalEmployer: number;
} {
  const pfWages = Math.min(pfWagesMonthly, PF_WAGE_CEILING);
  const employeeEpf = Math.round(pfWages * EPF_RATE);
  const employerEps = Math.min(Math.round(pfWages * EPS_RATE), EPS_CAP_MONTHLY);
  const employerEpf = Math.round(pfWages * EPF_RATE) - employerEps;
  return {
    employeeEpf,
    employerEps,
    employerEpf,
    totalEmployer: employerEps + employerEpf,
  };
}

// ── Tax Slabs ─────────────────────────────────────────────────────────────
interface TaxSlab { from: number; to: number; rate: number }

const OLD_REGIME_SLABS: TaxSlab[] = [
  { from: 0, to: 250000, rate: 0 },
  { from: 250000, to: 500000, rate: 0.05 },
  { from: 500000, to: 1000000, rate: 0.2 },
  { from: 1000000, to: Infinity, rate: 0.3 },
];

const NEW_REGIME_SLABS: TaxSlab[] = [
  { from: 0, to: 300000, rate: 0 },
  { from: 300000, to: 600000, rate: 0.05 },
  { from: 600000, to: 900000, rate: 0.1 },
  { from: 900000, to: 1200000, rate: 0.15 },
  { from: 1200000, to: 1500000, rate: 0.2 },
  { from: 1500000, to: Infinity, rate: 0.3 },
];

function applySlabs(taxableIncome: number, slabs: TaxSlab[]): number {
  let tax = 0;
  for (const slab of slabs) {
    if (taxableIncome <= slab.from) break;
    const upper = Math.min(taxableIncome, slab.to);
    tax += (upper - slab.from) * slab.rate;
  }
  return Math.round(tax);
}

function applySurcharge(tax: number, totalIncome: number): number {
  if (totalIncome > 50000000) return Math.round(tax * 0.37);
  if (totalIncome > 20000000) return Math.round(tax * 0.25);
  if (totalIncome > 10000000) return Math.round(tax * 0.15);
  if (totalIncome > 5000000) return Math.round(tax * 0.1);
  return 0;
}

export interface OldRegimeDeductions {
  section80C: number;        // max 150000
  section80D: number;        // max 25000 (self+family) + 25000 (parents)
  section24b: number;        // max 200000 (home loan interest)
  section80CCD1B: number;    // max 50000 (NPS)
  hraExemption: number;
  ltaExemption: number;
  rentPaidAnnual?: number;
  basicAnnual?: number;
  isMetroCity?: boolean;
  hraReceivedAnnual?: number;
}

export interface TaxResult {
  taxableIncome: number;
  taxBeforeRebate: number;
  rebate87A: number;
  taxAfterRebate: number;
  surcharge: number;
  cess: number;
  totalTaxLiability: number;
  effectiveRate: number;
}

export function computeTaxOld(
  grossAnnualIncome: number,
  deductions: OldRegimeDeductions,
): TaxResult {
  const standardDeduction = 50000;
  const section80CMax = Math.min(deductions.section80C, 150000);
  const section80DMax = Math.min(deductions.section80D, 50000);
  const section24bMax = Math.min(deductions.section24b, 200000);
  const section80CCD1BMax = Math.min(deductions.section80CCD1B, 50000);

  const totalDeductions =
    standardDeduction +
    deductions.hraExemption +
    deductions.ltaExemption +
    section80CMax +
    section80DMax +
    section24bMax +
    section80CCD1BMax;

  const taxableIncome = Math.max(0, grossAnnualIncome - totalDeductions);
  const taxBeforeRebate = applySlabs(taxableIncome, OLD_REGIME_SLABS);

  // Section 87A rebate: if taxable income ≤ 5L, full rebate (max ₹12,500)
  const rebate87A = taxableIncome <= 500000 ? Math.min(taxBeforeRebate, 12500) : 0;
  const taxAfterRebate = Math.max(0, taxBeforeRebate - rebate87A);

  const surcharge = applySurcharge(taxAfterRebate, taxableIncome);
  const cess = Math.round((taxAfterRebate + surcharge) * 0.04);
  const totalTaxLiability = taxAfterRebate + surcharge + cess;

  return {
    taxableIncome,
    taxBeforeRebate,
    rebate87A,
    taxAfterRebate,
    surcharge,
    cess,
    totalTaxLiability,
    effectiveRate: grossAnnualIncome > 0 ? totalTaxLiability / grossAnnualIncome : 0,
  };
}

export function computeTaxNew(
  grossAnnualIncome: number,
  npsEmployerContribution: number = 0,
): TaxResult {
  const standardDeduction = 75000; // FY 2024-25 new regime standard deduction
  // Section 80CCD(2): employer NPS up to 10% of Basic+DA (passed as pre-computed)
  const totalDeductions = standardDeduction + Math.max(0, npsEmployerContribution);

  const taxableIncome = Math.max(0, grossAnnualIncome - totalDeductions);
  const taxBeforeRebate = applySlabs(taxableIncome, NEW_REGIME_SLABS);

  // Section 87A rebate: if taxable income ≤ 7L, full rebate (max ₹25,000)
  const rebate87A = taxableIncome <= 700000 ? Math.min(taxBeforeRebate, 25000) : 0;
  const taxAfterRebate = Math.max(0, taxBeforeRebate - rebate87A);

  const surcharge = applySurcharge(taxAfterRebate, taxableIncome);
  const cess = Math.round((taxAfterRebate + surcharge) * 0.04);
  const totalTaxLiability = taxAfterRebate + surcharge + cess;

  return {
    taxableIncome,
    taxBeforeRebate,
    rebate87A,
    taxAfterRebate,
    surcharge,
    cess,
    totalTaxLiability,
    effectiveRate: grossAnnualIncome > 0 ? totalTaxLiability / grossAnnualIncome : 0,
  };
}

// ── Monthly TDS Projection ────────────────────────────────────────────────
export function computeMonthlyTDS(params: {
  currentFYMonth: number;       // 1 = April, 12 = March
  ytdGrossIncome: number;
  ytdTdsDeducted: number;
  projectedAnnualGross: number;
  regime: "old" | "new";
  deductions?: OldRegimeDeductions;
  npsEmployer?: number;
}): number {
  const { currentFYMonth, ytdTdsDeducted, projectedAnnualGross, regime, deductions, npsEmployer } = params;

  const taxResult = regime === "old"
    ? computeTaxOld(projectedAnnualGross, deductions ?? {
        section80C: 0, section80D: 0, section24b: 0, section80CCD1B: 0,
        hraExemption: 0, ltaExemption: 0,
      })
    : computeTaxNew(projectedAnnualGross, npsEmployer ?? 0);

  const remainingTax = Math.max(0, taxResult.totalTaxLiability - ytdTdsDeducted);
  // Remaining months in FY including current month
  const remainingMonths = 13 - currentFYMonth;
  return remainingMonths > 0 ? Math.round(remainingTax / remainingMonths) : 0;
}

// ── Monthly Salary Slip Computation ──────────────────────────────────────
export interface SalarySlipInput {
  ctcAnnual: number;
  basicPercent: number;           // % of CTC
  hraPercentOfBasic: number;      // 50 for metro, 40 for non-metro
  ltaAnnual: number;
  medicalAllowanceAnnual: number;
  conveyanceAllowanceAnnual: number;
  bonusAnnual: number;
  state: string;
  isMetroCity: boolean;
  regime: "old" | "new";
  rentPaidMonthly?: number;
  deductions?: OldRegimeDeductions;
  npsEmployer?: number;
  currentFYMonth: number;
  ytdGross: number;
  ytdTds: number;
}

export interface SalarySlipOutput {
  basic: number;
  hra: number;
  specialAllowance: number;
  lta: number;
  medicalAllowance: number;
  conveyanceAllowance: number;
  bonus: number;
  grossEarnings: number;
  pfEmployee: number;
  pfEmployer: number;
  professionalTax: number;
  lwf: number;
  tds: number;
  totalDeductions: number;
  netPay: number;
}

export function computeMonthlySalarySlip(input: SalarySlipInput): SalarySlipOutput {
  const monthly = (annual: number) => Math.round(annual / 12);

  const basic = Math.round((input.ctcAnnual * input.basicPercent) / 100 / 12);
  const hra = Math.round((basic * input.hraPercentOfBasic) / 100);
  const lta = monthly(input.ltaAnnual);
  const medicalAllowance = monthly(input.medicalAllowanceAnnual);
  const conveyanceAllowance = monthly(input.conveyanceAllowanceAnnual);
  const bonus = monthly(input.bonusAnnual);

  // Special Allowance = CTC/12 - basic - hra - lta - medical - conveyance - bonus - employer PF
  const pf = computePFDeduction(basic);
  const employerPFMonthly = pf.totalEmployer;
  const specialAllowance = Math.max(
    0,
    monthly(input.ctcAnnual) - basic - hra - lta - medicalAllowance - conveyanceAllowance - bonus - employerPFMonthly,
  );

  const grossEarnings = basic + hra + specialAllowance + lta + medicalAllowance + conveyanceAllowance + bonus;

  const pfEmployee = pf.employeeEpf;
  const professionalTax = getStatePT(input.state, grossEarnings);
  const lwf = 0; // LWF varies widely; defaulting to 0, configurable per state

  // HRA exemption for TDS calculation
  const hraExemption = input.deductions?.hraExemption ??
    computeHRAExemption({
      hraReceivedAnnual: hra * 12,
      rentPaidAnnual: (input.rentPaidMonthly ?? 0) * 12,
      basicAnnual: basic * 12,
      isMetroCity: input.isMetroCity,
    });

  const projectedAnnualGross = grossEarnings * 12;
  const deductionsForTDS: OldRegimeDeductions = input.deductions ?? {
    section80C: pfEmployee * 12, // PF contribution counted under 80C
    section80D: 0,
    section24b: 0,
    section80CCD1B: 0,
    hraExemption,
    ltaExemption: 0,
  };

  const tds = computeMonthlyTDS({
    currentFYMonth: input.currentFYMonth,
    ytdGrossIncome: input.ytdGross,
    ytdTdsDeducted: input.ytdTds,
    projectedAnnualGross,
    regime: input.regime,
    deductions: deductionsForTDS,
    npsEmployer: input.npsEmployer,
  });

  const totalDeductions = pfEmployee + professionalTax + lwf + tds;
  const netPay = grossEarnings - totalDeductions;

  return {
    basic,
    hra,
    specialAllowance,
    lta,
    medicalAllowance,
    conveyanceAllowance,
    bonus,
    grossEarnings,
    pfEmployee,
    pfEmployer: pf.totalEmployer,
    professionalTax,
    lwf,
    tds,
    totalDeductions,
    netPay,
  };
}

// ── ECR Line Generation ───────────────────────────────────────────────────
export interface ECRLine {
  uan: string;
  memberName: string;
  grossWages: number;
  epfWages: number;
  epsWages: number;
  edliWages: number;
  employeeEpf: number;
  employerEps: number;
  employerEpf: number;
  ncp: number;  // Non-Contributing Period days
  refund: number;
}

export function formatECRFile(orgEpfoId: string, month: number, year: number, lines: ECRLine[]): string {
  const header = `#~#${orgEpfoId}#~#${String(month).padStart(2, "0")}/${year}#~#ECR`;
  const body = lines.map((l) =>
    [
      l.uan,
      l.memberName.toUpperCase(),
      l.grossWages,
      l.epfWages,
      l.epsWages,
      l.edliWages,
      l.employeeEpf,
      l.employerEps,
      l.employerEpf,
      l.ncp,
      l.refund,
    ].join("#~#"),
  );
  return [header, ...body].join("\n");
}
