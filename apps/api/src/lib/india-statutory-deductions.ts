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
}

export interface LWFComputation {
  state: string;
  employeeLWF: number; // Per half-year
  employerLWF: number; // Per half-year
}

export interface MonthlyStatutoryDeductions {
  pf: PFComputation;
  esi: ESIComputation;
  pt: PTComputation;
  lwf: LWFComputation;
  totalEmployeeDeductions: number;
  totalEmployerContributions: number;
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
  isVoluntaryHigherPF: boolean = false
): PFComputation {
  // Statutory: PF on min(basic+DA, 15000). Many employers contribute on actual basic.
  const pfWageBase = isVoluntaryHigherPF
    ? basicPlusDA
    : Math.min(basicPlusDA, PF_STATUTORY_WAGE_CEILING);

  const employeePF = Math.round(pfWageBase * PF_EMPLOYEE_RATE);

  // EPS is always capped at ₹15,000 base
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

// ─── ESI COMPUTATION ───────────────────────────────────────────────────────────

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

// ─── PROFESSIONAL TAX ──────────────────────────────────────────────────────────

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
      { from: 10_001, to: Infinity, monthly: 200 }, // Feb = 300 to hit 2500/yr
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
  DELHI: {
    annualCap: 0, // Delhi has no PT
    slabs: [],
  },
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
  monthInFY: number // 1=April, 12=March
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

  // Maharashtra special: February (month 11 in FY) deducts extra to hit ₹2500 cap
  if (stateKey === "MAHARASHTRA" && monthInFY === 11 && grossMonthly > 10_000) {
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

export function computeLWF(state: string): LWFComputation {
  const stateKey = state.toUpperCase().replace(/\s+/g, "_");
  const config = LWF_RATES[stateKey];

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
  isVoluntaryHigherPF: boolean = false
): MonthlyStatutoryDeductions {
  const pf = computePF(basicPlusDA, isVoluntaryHigherPF);
  const esi = computeESI(grossMonthly);
  const pt = computePT(grossMonthly, state, monthInFY);
  const lwf = computeLWF(state);

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
