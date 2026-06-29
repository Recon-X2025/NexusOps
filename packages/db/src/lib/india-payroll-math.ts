/**
 * India payroll math — PURE, dependency-free copy of the canonical engines.
 *
 * These functions mirror the production engines in
 *   apps/api/src/lib/india-statutory-deductions.ts
 *   apps/api/src/lib/india-tax-engine.ts
 *   apps/api/src/lib/payroll-cycle.ts (computeGross + computeEmployeePayslip)
 *   apps/api/src/lib/india/gst-engine.ts (computeGST)
 *
 * They are duplicated here (rather than imported) because `packages/db` is a
 * DEPENDENCY of `apps/api`, not the reverse — importing across that boundary
 * would invert the dependency graph and break tsup/tsc (rootDir).
 *
 * Only the seed generator (seed-demo.ts) consumes this module. The canonical
 * runtime path remains the apps/api engines; this copy exists solely so the
 * demo seed can produce money-path-invariant data (balanced journals, correct
 * netPay, GST split, TDS) without a server runtime.
 *
 * If the canonical engines change materially, update this file to match.
 */

// ════════════════════════════════════════════════════════════════════════════
// STATUTORY DEDUCTIONS (EPF / ESI / PT / LWF)
// ════════════════════════════════════════════════════════════════════════════

export interface PFComputation {
  basicPlusDA: number;
  pfWageBase: number;
  employeePF: number;
  employerEPF: number;
  employerEPS: number;
  employerEDLI: number;
  adminCharges: number;
  totalEmployer: number;
  totalEmployee: number;
}

export interface ESIComputation {
  isApplicable: boolean;
  grossMonthly: number;
  employeeESI: number;
  employerESI: number;
}

export interface PTComputation {
  state: string;
  grossMonthly: number;
  ptAmount: number;
  annualPT: number;
}

export interface LWFComputation {
  state: string;
  employeeLWF: number;
  employerLWF: number;
}

export interface MonthlyStatutoryDeductions {
  pf: PFComputation;
  esi: ESIComputation;
  pt: PTComputation;
  lwf: LWFComputation;
  totalEmployeeDeductions: number;
  totalEmployerContributions: number;
}

const PF_STATUTORY_WAGE_CEILING = 15_000;
const PF_EMPLOYEE_RATE = 0.12;
const PF_EMPLOYER_EPF_RATE = 0.0367;
const PF_EMPLOYER_EPS_RATE = 0.0833;
const PF_EDLI_RATE = 0.005;
const PF_ADMIN_RATE = 0.005;

export function computePF(
  basicPlusDA: number,
  isVoluntaryHigherPF = false,
): PFComputation {
  const pfWageBase = isVoluntaryHigherPF
    ? basicPlusDA
    : Math.min(basicPlusDA, PF_STATUTORY_WAGE_CEILING);

  const employeePF = Math.round(pfWageBase * PF_EMPLOYEE_RATE);

  const epsBase = Math.min(basicPlusDA, PF_STATUTORY_WAGE_CEILING);
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

const ESI_WAGE_CEILING = 21_000;
const ESI_EMPLOYEE_RATE = 0.0075;
const ESI_EMPLOYER_RATE = 0.0325;

export function computeESI(grossMonthly: number): ESIComputation {
  const isApplicable = grossMonthly <= ESI_WAGE_CEILING;
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

interface PTSlab {
  from: number;
  to: number;
  monthly: number;
}

const PT_SLABS: Record<string, { slabs: PTSlab[]; annualCap: number }> = {
  MAHARASHTRA: {
    annualCap: 2_500,
    slabs: [
      { from: 0, to: 7_500, monthly: 0 },
      { from: 7_501, to: 10_000, monthly: 175 },
      { from: 10_001, to: Infinity, monthly: 200 },
    ],
  },
  KARNATAKA: {
    annualCap: 2_400,
    slabs: [
      { from: 0, to: 15_000, monthly: 0 },
      { from: 15_001, to: 25_000, monthly: 200 },
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
  DELHI: { annualCap: 0, slabs: [] },
  GUJARAT: {
    annualCap: 2_500,
    slabs: [
      { from: 0, to: 5_999, monthly: 0 },
      { from: 6_000, to: 8_999, monthly: 80 },
      { from: 9_000, to: 11_999, monthly: 150 },
      { from: 12_000, to: Infinity, monthly: 200 },
    ],
  },
};

export function computePT(
  grossMonthly: number,
  state: string,
  monthInFY: number,
): PTComputation {
  const stateKey = state.toUpperCase().replace(/\s+/g, "_");
  const config = PT_SLABS[stateKey];

  if (!config || config.slabs.length === 0) {
    return { state, grossMonthly, ptAmount: 0, annualPT: 0 };
  }

  let ptAmount = 0;
  for (const slab of config.slabs) {
    if (grossMonthly >= slab.from && grossMonthly <= slab.to) {
      ptAmount = slab.monthly;
      break;
    }
  }

  if (stateKey === "MAHARASHTRA" && monthInFY === 11 && grossMonthly > 10_000) {
    ptAmount = 300;
  }

  return { state, grossMonthly, ptAmount, annualPT: config.annualCap };
}

const LWF_RATES: Record<
  string,
  { employee: number; employer: number; frequency: "HALF_YEARLY" | "ANNUAL" }
> = {
  MAHARASHTRA: { employee: 12, employer: 36, frequency: "HALF_YEARLY" },
  KARNATAKA: { employee: 20, employer: 40, frequency: "ANNUAL" },
  TAMIL_NADU: { employee: 10, employer: 20, frequency: "HALF_YEARLY" },
  TELANGANA: { employee: 2, employer: 5, frequency: "HALF_YEARLY" },
  DELHI: { employee: 1, employer: 1, frequency: "HALF_YEARLY" },
  KERALA: { employee: 12, employer: 36, frequency: "HALF_YEARLY" },
};

export function computeLWF(state: string): LWFComputation {
  const stateKey = state.toUpperCase().replace(/\s+/g, "_");
  const config = LWF_RATES[stateKey];
  if (!config) return { state, employeeLWF: 0, employerLWF: 0 };
  return { state, employeeLWF: config.employee, employerLWF: config.employer };
}

export function computeMonthlyStatutory(
  basicPlusDA: number,
  grossMonthly: number,
  state: string,
  monthInFY: number,
  isVoluntaryHigherPF = false,
): MonthlyStatutoryDeductions {
  const pf = computePF(basicPlusDA, isVoluntaryHigherPF);
  const esi = computeESI(grossMonthly);
  const pt = computePT(grossMonthly, state, monthInFY);
  const lwf = computeLWF(state);

  const isLWFMonth = monthInFY === 3 || monthInFY === 9;

  const totalEmployeeDeductions =
    pf.totalEmployee +
    esi.employeeESI +
    pt.ptAmount +
    (isLWFMonth ? lwf.employeeLWF : 0);

  const totalEmployerContributions =
    pf.totalEmployer + esi.employerESI + (isLWFMonth ? lwf.employerLWF : 0);

  return {
    pf,
    esi,
    pt,
    lwf,
    totalEmployeeDeductions,
    totalEmployerContributions,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// INCOME-TAX ENGINE (FY 2025-26, dual regime)
// ════════════════════════════════════════════════════════════════════════════

export type TaxRegime = "OLD" | "NEW";

export interface EmployeeTaxProfile {
  regime: TaxRegime;
  annualCTC: number;
  basicMonthly: number;
  hraMonthly: number;
  specialAllowance: number;
  lta: number;
  section80C: number;
  section80D: number;
  section80CCD1B: number;
  section80TTA: number;
  section24b: number;
  hraExemption: number;
  otherExemptions: number;
  employeePFMonthly: number;
  employerPFMonthly: number;
  professionalTax: number;
  joiningMonth: number;
  monthsInFY: number;
  previousEmployerIncome: number;
  previousEmployerTDS: number;
}

export interface SlabEntry {
  from: number;
  to: number;
  rate: number;
  taxOnSlab: number;
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

const OLD_REGIME_SLABS = [
  { from: 0, to: 250_000, rate: 0 },
  { from: 250_000, to: 500_000, rate: 0.05 },
  { from: 500_000, to: 1_000_000, rate: 0.2 },
  { from: 1_000_000, to: Infinity, rate: 0.3 },
];

const NEW_REGIME_SLABS = [
  { from: 0, to: 300_000, rate: 0 },
  { from: 300_000, to: 700_000, rate: 0.05 },
  { from: 700_000, to: 1_000_000, rate: 0.1 },
  { from: 1_000_000, to: 1_200_000, rate: 0.15 },
  { from: 1_200_000, to: 1_500_000, rate: 0.2 },
  { from: 1_500_000, to: Infinity, rate: 0.3 },
];

function computeSurcharge(taxableIncome: number, basicTax: number): number {
  if (taxableIncome <= 5_000_000) return 0;
  if (taxableIncome <= 10_000_000) return basicTax * 0.1;
  if (taxableIncome <= 20_000_000) return basicTax * 0.15;
  if (taxableIncome <= 50_000_000) return basicTax * 0.25;
  return basicTax * 0.37;
}

function computeSlabTax(
  taxableIncome: number,
  slabs: typeof OLD_REGIME_SLABS,
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

export function computeHRAExemption(
  basicAnnual: number,
  hraReceived: number,
  rentPaid: number,
  isMetro: boolean,
): number {
  if (rentPaid <= 0 || hraReceived <= 0) return 0;
  const a = hraReceived;
  const b = rentPaid - 0.1 * basicAnnual;
  const c = (isMetro ? 0.5 : 0.4) * basicAnnual;
  return Math.max(0, Math.round(Math.min(a, b, c)));
}

export function computeTax(profile: EmployeeTaxProfile): TaxComputation {
  const { regime, monthsInFY } = profile;

  const grossSalary =
    profile.joiningMonth === 1
      ? profile.annualCTC
      : Math.round(
          (profile.basicMonthly * 12 +
            profile.hraMonthly * 12 +
            profile.specialAllowance * 12 +
            profile.lta) *
            (monthsInFY / 12),
        ) + profile.previousEmployerIncome;

  let standardDeduction: number;
  let hraExemption = 0;
  let chapter6ADeductions = 0;
  let section24bDeduction = 0;

  if (regime === "NEW") {
    standardDeduction = Math.min(75_000, grossSalary);
  } else {
    standardDeduction = Math.min(50_000, grossSalary);
    hraExemption = profile.hraExemption;
    chapter6ADeductions = Math.min(
      Math.min(profile.section80C, 150_000) +
        Math.min(profile.section80D, 75_000) +
        Math.min(profile.section80CCD1B, 50_000) +
        Math.min(profile.section80TTA, 10_000),
      350_000,
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

  const taxableIncome = Math.max(0, Math.round(grossSalary - totalDeductions));

  const slabs = regime === "NEW" ? NEW_REGIME_SLABS : OLD_REGIME_SLABS;
  const { totalTax: taxOnIncome, breakdown } = computeSlabTax(
    taxableIncome,
    slabs,
  );

  let rebate87A = 0;
  if (regime === "OLD" && taxableIncome <= 500_000) {
    rebate87A = Math.min(taxOnIncome, 12_500);
  } else if (regime === "NEW" && taxableIncome <= 700_000) {
    rebate87A = Math.min(taxOnIncome, 25_000);
  }

  const taxAfterRebate = Math.max(0, taxOnIncome - rebate87A);
  const surcharge = computeSurcharge(taxableIncome, taxAfterRebate);
  const cess = Math.round((taxAfterRebate + surcharge) * 0.04);
  const totalTaxLiability = Math.round(taxAfterRebate + surcharge + cess);

  const remainingTax = Math.max(
    0,
    totalTaxLiability - profile.previousEmployerTDS,
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

// ════════════════════════════════════════════════════════════════════════════
// PAYSLIP COMPUTATION (gross + full monthly payslip)
// ════════════════════════════════════════════════════════════════════════════

export interface EmployeePayrollInput {
  id: string;
  name: string;
  employeeCode: string;
  pan: string;
  uan: string;
  designation: string;
  department: string;
  state: string;
  isMetro: boolean;
  joiningDate: Date;
  basicMonthly: number;
  hraMonthly: number;
  specialAllowance: number;
  ltaAnnual: number;
  regime: "OLD" | "NEW";
  section80C: number;
  section80D: number;
  section80CCD1B: number;
  section80TTA: number;
  section24b: number;
  hraExemption: number;
  otherExemptions: number;
  rentPaid: number;
  daysInMonth: number;
  daysWorked: number;
  lopDays: number;
  overtime: number;
  arrears: number;
  bonus: number;
  otherEarnings: number;
  otherDeductions: number;
  isVoluntaryHigherPF: boolean;
  previousEmployerIncome: number;
  previousEmployerTDS: number;
  ytdGross: number;
  ytdPF: number;
  ytdTDS: number;
  ytdNetPay: number;
  month: number;
  year: number;
}

export interface EmployeePayslip {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  pan: string;
  uan: string;
  designation: string;
  department: string;
  month: number;
  year: number;
  daysInMonth: number;
  daysWorked: number;
  lopDays: number;
  basicEarned: number;
  hraEarned: number;
  specialAllowance: number;
  lta: number;
  overtime: number;
  arrears: number;
  bonus: number;
  otherEarnings: number;
  grossEarnings: number;
  employeePF: number;
  employeeESI: number;
  professionalTax: number;
  lwf: number;
  tds: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
  employerPF: number;
  employerESI: number;
  employerLWF: number;
  totalEmployerCost: number;
  ytdGross: number;
  ytdPF: number;
  ytdTDS: number;
  ytdNetPay: number;
  taxComputation: TaxComputation;
  statutoryDeductions: MonthlyStatutoryDeductions;
}

export function computeGross(emp: EmployeePayrollInput): {
  basicEarned: number;
  hraEarned: number;
  grossEarnings: number;
} {
  const lopFactor = emp.lopDays > 0 ? emp.daysWorked / emp.daysInMonth : 1;

  const basicEarned = Math.round(emp.basicMonthly * lopFactor);
  const hraEarned = Math.round(emp.hraMonthly * lopFactor);
  const specialAllowance = Math.round(emp.specialAllowance * lopFactor);
  const lta = Math.round((emp.ltaAnnual / 12) * lopFactor);

  const grossEarnings =
    basicEarned +
    hraEarned +
    specialAllowance +
    lta +
    emp.overtime +
    emp.arrears +
    emp.bonus +
    emp.otherEarnings;

  return { basicEarned, hraEarned, grossEarnings };
}

export function computeEmployeePayslip(
  emp: EmployeePayrollInput,
  fyMonth: number,
): EmployeePayslip {
  const { basicEarned, hraEarned, grossEarnings } = computeGross(emp);

  const statutory = computeMonthlyStatutory(
    basicEarned,
    grossEarnings,
    emp.state,
    fyMonth,
    emp.isVoluntaryHigherPF,
  );

  const monthsInFY = fyMonth <= 12 ? 12 - fyMonth + 1 : 12;
  const joiningMonth =
    emp.joiningDate.getFullYear() > new Date().getFullYear() - 1
      ? emp.joiningDate.getMonth() + 1 - 3
      : 1;

  const taxProfile: EmployeeTaxProfile = {
    regime: emp.regime,
    annualCTC:
      emp.basicMonthly * 12 +
      emp.hraMonthly * 12 +
      emp.specialAllowance * 12 +
      emp.ltaAnnual,
    basicMonthly: emp.basicMonthly,
    hraMonthly: emp.hraMonthly,
    specialAllowance: emp.specialAllowance,
    lta: emp.ltaAnnual,
    section80C: emp.section80C,
    section80D: emp.section80D,
    section80CCD1B: emp.section80CCD1B,
    section80TTA: emp.section80TTA,
    section24b: emp.section24b,
    hraExemption: emp.hraExemption,
    otherExemptions: emp.otherExemptions,
    employeePFMonthly: statutory.pf.totalEmployee,
    employerPFMonthly: statutory.pf.totalEmployer,
    professionalTax: statutory.pt.annualPT,
    joiningMonth: Math.max(1, joiningMonth),
    monthsInFY: Math.max(1, monthsInFY),
    previousEmployerIncome: emp.previousEmployerIncome,
    previousEmployerTDS: emp.previousEmployerTDS,
  };

  const taxComputation = computeTax(taxProfile);

  const totalDeductions =
    statutory.totalEmployeeDeductions +
    taxComputation.monthlyTDS +
    emp.otherDeductions;

  const netPay = Math.max(0, grossEarnings - totalDeductions);
  const totalEmployerCost = grossEarnings + statutory.totalEmployerContributions;

  return {
    id: `PS-${emp.employeeCode}-${emp.year}-${String(emp.month).padStart(2, "0")}`,
    payrollRunId: "",
    employeeId: emp.id,
    employeeName: emp.name,
    employeeCode: emp.employeeCode,
    pan: emp.pan,
    uan: emp.uan,
    designation: emp.designation,
    department: emp.department,
    month: emp.month,
    year: emp.year,
    daysInMonth: emp.daysInMonth,
    daysWorked: emp.daysWorked,
    lopDays: emp.lopDays,
    basicEarned,
    hraEarned,
    specialAllowance: Math.round(
      emp.specialAllowance * (emp.daysWorked / emp.daysInMonth),
    ),
    lta: Math.round((emp.ltaAnnual / 12) * (emp.daysWorked / emp.daysInMonth)),
    overtime: emp.overtime,
    arrears: emp.arrears,
    bonus: emp.bonus,
    otherEarnings: emp.otherEarnings,
    grossEarnings,
    employeePF: statutory.pf.totalEmployee,
    employeeESI: statutory.esi.employeeESI,
    professionalTax: statutory.pt.ptAmount,
    lwf: fyMonth === 3 || fyMonth === 9 ? statutory.lwf.employeeLWF : 0,
    tds: taxComputation.monthlyTDS,
    otherDeductions: emp.otherDeductions,
    totalDeductions,
    netPay,
    employerPF: statutory.pf.totalEmployer,
    employerESI: statutory.esi.employerESI,
    employerLWF: fyMonth === 3 || fyMonth === 9 ? statutory.lwf.employerLWF : 0,
    totalEmployerCost,
    ytdGross: emp.ytdGross + grossEarnings,
    ytdPF: emp.ytdPF + statutory.pf.totalEmployee,
    ytdTDS: emp.ytdTDS + taxComputation.monthlyTDS,
    ytdNetPay: emp.ytdNetPay + netPay,
    taxComputation,
    statutoryDeductions: statutory,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// GST ENGINE (CGST+SGST intra-state / IGST inter-state)
// ════════════════════════════════════════════════════════════════════════════

export type GSTRate = 0 | 5 | 12 | 18 | 28;

export interface GSTResult {
  taxableValue: number;
  isInterstate: boolean;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTaxAmount: number;
  invoiceTotal: number;
}

export function computeGST(params: {
  taxableValue: number;
  gstRate: GSTRate;
  supplierState: string;
  buyerState: string;
}): GSTResult {
  const { taxableValue, gstRate, supplierState, buyerState } = params;

  const isInterstate =
    supplierState.trim().toLowerCase() !== buyerState.trim().toLowerCase();

  const halfRate = gstRate / 2;

  const cgstAmount = isInterstate
    ? 0
    : Math.round(taxableValue * halfRate) / 100;
  const sgstAmount = isInterstate
    ? 0
    : Math.round(taxableValue * halfRate) / 100;
  const igstAmount = isInterstate ? Math.round(taxableValue * gstRate) / 100 : 0;

  const totalTaxAmount = cgstAmount + sgstAmount + igstAmount;

  return {
    taxableValue,
    isInterstate,
    cgstRate: isInterstate ? 0 : halfRate,
    sgstRate: isInterstate ? 0 : halfRate,
    igstRate: isInterstate ? gstRate : 0,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalTaxAmount,
    invoiceTotal: taxableValue + totalTaxAmount,
  };
}
