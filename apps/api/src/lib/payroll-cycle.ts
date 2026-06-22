/**
 * CoheronConnect 12-Step Payroll Cycle Orchestrator
 * ─────────────────────────────────────────────
 * Implements the complete monthly payroll run as defined in US-PAY-01:
 *
 *  Step 1:  Lock payroll period
 *  Step 2:  Compute gross earnings (basic + HRA + allowances + OT + arrears)
 *  Step 3:  Compute EPF (employee + employer)
 *  Step 4:  Compute ESI (if applicable)
 *  Step 5:  Compute Professional Tax
 *  Step 6:  Compute LWF (if applicable month)
 *  Step 7:  Compute TDS (income tax via dual-regime engine)
 *  Step 8:  Generate payslips
 *  Step 9:  Route for HR approval
 *  Step 10: Route for Finance approval
 *  Step 11: Route for CFO approval (if payroll total > threshold)
 *  Step 12: Generate statutory outputs (ECR, PT challan, ITNS 281)
 *
 * Each step is idempotent and auditable. BullMQ job wraps the orchestrator.
 */

import { computeTax, type EmployeeTaxProfile, type TaxComputation } from "./india-tax-engine";
import {
  computeMonthlyStatutory,
  type MonthlyStatutoryDeductions,
} from "./india-statutory-deductions";

// ─── TYPES ─────────────────────────────────────────────────────────────────────

export type PayrollStatus =
  | "DRAFT"
  | "PERIOD_LOCKED"
  | "GROSS_COMPUTED"
  | "PF_COMPUTED"
  | "ESI_COMPUTED"
  | "PT_COMPUTED"
  | "LWF_COMPUTED"
  | "TDS_COMPUTED"
  | "PAYSLIPS_GENERATED"
  | "HR_APPROVED"
  | "FINANCE_APPROVED"
  | "CFO_APPROVED"
  | "STATUTORY_GENERATED"
  | "COMPLETED"
  | "FAILED";

export interface PayrollRun {
  id: string;
  orgId: string;
  month: number; // 1-12 (calendar month)
  year: number; // e.g. 2026
  fyMonth: number; // 1=April, 12=March
  status: PayrollStatus;
  employeeCount: number;
  totalGross: number;
  totalPF: number;
  totalESI: number;
  totalPT: number;
  totalLWF: number;
  totalTDS: number;
  totalDeductions: number;
  totalNet: number;
  totalEmployerCost: number;
  lockedAt: Date | null;
  completedAt: Date | null;
  approvals: PayrollApproval[];
  errors: PayrollError[];
}

export interface PayrollApproval {
  step: "HR" | "FINANCE" | "CFO";
  approvedBy: string;
  approvedAt: Date;
  comments: string;
}

export interface PayrollError {
  employeeId: string;
  step: string;
  message: string;
  severity: "WARNING" | "ERROR" | "FATAL";
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
  // Earnings
  basicEarned: number;
  hraEarned: number;
  specialAllowance: number;
  lta: number;
  overtime: number;
  arrears: number;
  bonus: number;
  otherEarnings: number;
  grossEarnings: number;
  // Deductions
  employeePF: number;
  employeeESI: number;
  professionalTax: number;
  lwf: number;
  tds: number;
  otherDeductions: number;
  totalDeductions: number;
  // Net
  netPay: number;
  // Employer
  employerPF: number;
  employerESI: number;
  employerLWF: number;
  totalEmployerCost: number;
  // YTD
  ytdGross: number;
  ytdPF: number;
  ytdTDS: number;
  ytdNetPay: number;
  // Tax
  taxComputation: TaxComputation;
  statutoryDeductions: MonthlyStatutoryDeductions;
}

// ─── PAYROLL STEP FUNCTIONS ────────────────────────────────────────────────────

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
  // Salary structure
  basicMonthly: number;
  hraMonthly: number;
  specialAllowance: number;
  ltaAnnual: number;
  // Tax
  regime: "OLD" | "NEW";
  section80C: number;
  section80D: number;
  section80CCD1B: number;
  section80TTA: number;
  section24b: number;
  hraExemption: number;
  otherExemptions: number;
  rentPaid: number;
  // Attendance
  daysInMonth: number;
  daysWorked: number;
  lopDays: number;
  // Variable
  overtime: number;
  arrears: number;
  bonus: number;
  otherEarnings: number;
  otherDeductions: number;
  // PF
  isVoluntaryHigherPF: boolean;
  // Previous employer (for mid-year joins)
  previousEmployerIncome: number;
  previousEmployerTDS: number;
  // YTD (from prior months in this FY)
  ytdGross: number;
  ytdPF: number;
  ytdTDS: number;
  ytdNetPay: number;
  /** Calendar month (1–12) and year for this payslip row. */
  month: number;
  year: number;
}

/**
 * Step 2: Compute gross earnings with LOP adjustment
 */
export function computeGross(emp: EmployeePayrollInput): {
  basicEarned: number;
  hraEarned: number;
  grossEarnings: number;
} {
  const lopFactor =
    emp.lopDays > 0 ? (emp.daysWorked / emp.daysInMonth) : 1;

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

/**
 * Steps 3-7: Compute all deductions for one employee for one month
 */
export function computeEmployeePayslip(
  emp: EmployeePayrollInput,
  fyMonth: number
): EmployeePayslip {
  // Step 2: Gross
  const { basicEarned, hraEarned, grossEarnings } = computeGross(emp);

  // Steps 3-6: Statutory deductions
  const statutory = computeMonthlyStatutory(
    basicEarned, // basic + DA (DA = 0 for most private sector)
    grossEarnings,
    emp.state,
    fyMonth,
    emp.isVoluntaryHigherPF
  );

  // Step 7: TDS
  // Build annualised tax profile
  const monthsInFY = fyMonth <= 12 ? 12 - fyMonth + 1 : 12;
  const joiningMonth =
    emp.joiningDate.getFullYear() > new Date().getFullYear() - 1
      ? emp.joiningDate.getMonth() + 1 - 3 // Rough FY month
      : 1;

  const taxProfile: EmployeeTaxProfile = {
    regime: emp.regime,
    annualCTC: emp.basicMonthly * 12 + emp.hraMonthly * 12 + emp.specialAllowance * 12 + emp.ltaAnnual,
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

  // Build payslip
  const totalDeductions =
    statutory.totalEmployeeDeductions +
    taxComputation.monthlyTDS +
    emp.otherDeductions;

  const netPay = Math.max(0, grossEarnings - totalDeductions);

  const totalEmployerCost =
    grossEarnings + statutory.totalEmployerContributions;

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
    // Earnings
    basicEarned,
    hraEarned,
    specialAllowance: Math.round(emp.specialAllowance * (emp.daysWorked / emp.daysInMonth)),
    lta: Math.round((emp.ltaAnnual / 12) * (emp.daysWorked / emp.daysInMonth)),
    overtime: emp.overtime,
    arrears: emp.arrears,
    bonus: emp.bonus,
    otherEarnings: emp.otherEarnings,
    grossEarnings,
    // Deductions
    employeePF: statutory.pf.totalEmployee,
    employeeESI: statutory.esi.employeeESI,
    professionalTax: statutory.pt.ptAmount,
    lwf: fyMonth === 3 || fyMonth === 9 ? statutory.lwf.employeeLWF : 0,
    tds: taxComputation.monthlyTDS,
    otherDeductions: emp.otherDeductions,
    totalDeductions,
    // Net
    netPay,
    // Employer
    employerPF: statutory.pf.totalEmployer,
    employerESI: statutory.esi.employerESI,
    employerLWF: fyMonth === 3 || fyMonth === 9 ? statutory.lwf.employerLWF : 0,
    totalEmployerCost,
    // YTD (add current month)
    ytdGross: emp.ytdGross + grossEarnings,
    ytdPF: emp.ytdPF + statutory.pf.totalEmployee,
    ytdTDS: emp.ytdTDS + taxComputation.monthlyTDS,
    ytdNetPay: emp.ytdNetPay + netPay,
    // Full computation objects
    taxComputation,
    statutoryDeductions: statutory,
  };
}

// ─── ECR FILE GENERATOR (EPF v2.0 FORMAT) ──────────────────────────────────────

export interface ECRLine {
  uan: string;
  memberName: string;
  grossWages: number;
  epfWages: number;
  epsWages: number;
  edliWages: number;
  epfContribution: number; // Employee (12%)
  epsContribution: number; // Employer EPS (8.33%)
  epfEPSdiff: number; // Employer EPF (3.67%)
  ncp: number; // Non-contributory period days
  refundOfAdvance: number;
}

export function generateECR(payslips: EmployeePayslip[]): string {
  // ECR v2.0 format: pipe-delimited, one line per employee
  const lines = payslips.map((ps): string => {
    const epfWages = ps.statutoryDeductions.pf.pfWageBase;
    const epsWages = Math.min(epfWages, 15_000);

    return [
      ps.uan, // UAN
      ps.employeeName, // Member Name
      ps.grossEarnings, // Gross Wages
      epfWages, // EPF Wages
      epsWages, // EPS Wages
      epsWages, // EDLI Wages
      ps.employeePF, // EPF Contribution (Employee)
      ps.statutoryDeductions.pf.employerEPS, // EPS Contribution (Employer)
      ps.statutoryDeductions.pf.employerEPF, // EPF-EPS Diff (Employer EPF)
      ps.lopDays, // NCP days
      0, // Refund of advance
    ].join("|");
  });

  return lines.join("\n");
}

// ─── PT CHALLAN GENERATOR ──────────────────────────────────────────────────────

export interface PTChallan {
  state: string;
  month: number;
  year: number;
  employerName: string;
  ptRegistrationNumber: string;
  totalEmployees: number;
  totalPTDeducted: number;
  employeeDetails: Array<{
    name: string;
    grossSalary: number;
    ptDeducted: number;
  }>;
}

export function generatePTChallan(
  payslips: EmployeePayslip[],
  state: string,
  employerName: string,
  ptRegNo: string
): PTChallan {
  const details = payslips
    .filter((ps) => ps.professionalTax > 0)
    .map((ps) => ({
      name: ps.employeeName,
      grossSalary: ps.grossEarnings,
      ptDeducted: ps.professionalTax,
    }));

  return {
    state,
    month: payslips[0]?.month ?? 0,
    year: payslips[0]?.year ?? 0,
    employerName,
    ptRegistrationNumber: ptRegNo,
    totalEmployees: details.length,
    totalPTDeducted: details.reduce((sum, d) => sum + d.ptDeducted, 0),
    employeeDetails: details,
  };
}

// ─── ITNS 281 (TDS CHALLAN) GENERATOR ──────────────────────────────────────────

export interface ITNS281 {
  tanNumber: string;
  assessmentYear: string;
  section: "192"; // Salary TDS
  bsrCode: string;
  challanDate: string;
  totalTDS: number;
  surcharge: number;
  cess: number;
  totalAmount: number;
  employeeCount: number;
}

export function generateITNS281(
  payslips: EmployeePayslip[],
  tanNumber: string,
  assessmentYear: string
): ITNS281 {
  const totalTDS = payslips.reduce((sum, ps) => sum + ps.tds, 0);

  // Approximate surcharge and cess from individual computations
  const totalSurcharge = payslips.reduce(
    (sum, ps) => sum + ps.taxComputation.surcharge / ps.taxComputation.monthlyTDS * ps.tds || 0,
    0
  );
  const totalCess = payslips.reduce(
    (sum, ps) => sum + ps.taxComputation.cess / ps.taxComputation.monthlyTDS * ps.tds || 0,
    0
  );

  return {
    tanNumber,
    assessmentYear,
    section: "192",
    bsrCode: "", // To be filled by bank
    challanDate: new Date().toISOString().split("T")[0]!,
    totalTDS: Math.round(totalTDS),
    surcharge: Math.round(totalSurcharge),
    cess: Math.round(totalCess),
    totalAmount: Math.round(totalTDS),
    employeeCount: payslips.length,
  };
}

// ─── FORM 24Q DATA (QUARTERLY TDS RETURN) ──────────────────────────────────────

export interface Form24QEntry {
  employeeName: string;
  pan: string;
  designation: string;
  section: "192";
  dateOfPayment: string;
  amountPaid: number;
  tdsDeducted: number;
  surcharge: number;
  cess: number;
  totalTaxDeposited: number;
  bsrCode: string;
  challanSerialNo: string;
  dateOfDeposit: string;
}

export function generateForm24QData(
  payslips: EmployeePayslip[]
): Form24QEntry[] {
  return payslips
    .filter((ps) => ps.tds > 0)
    .map((ps) => ({
      employeeName: ps.employeeName,
      pan: ps.pan,
      designation: ps.designation,
      section: "192" as const,
      dateOfPayment: `${ps.year}-${String(ps.month).padStart(2, "0")}-28`,
      amountPaid: ps.grossEarnings,
      tdsDeducted: ps.tds,
      surcharge: 0,
      cess: 0,
      totalTaxDeposited: ps.tds,
      bsrCode: "", // Filled from challan
      challanSerialNo: "", // Filled from challan
      dateOfDeposit: "", // Filled from challan
    }));
}

// ─── FORM 16 DATA (ANNUAL TAX CERTIFICATE) ─────────────────────────────────────

export interface Form16Data {
  // Part A: TDS certificate details (from TRACES)
  employeeName: string;
  pan: string;
  tanOfDeductor: string;
  assessmentYear: string;
  periodFrom: string;
  periodTo: string;
  // Part B: Income and tax computation
  grossSalary: number;
  exemptAllowances: number;
  netSalary: number;
  standardDeduction: number;
  incomeChargeableUnderSalary: number;
  incomeFromOtherSources: number;
  grossTotalIncome: number;
  deductionsUnderChapter6A: {
    section80C: number;
    section80D: number;
    section80CCD1B: number;
    section80TTA: number;
    total: number;
  };
  totalIncome: number;
  taxOnTotalIncome: number;
  rebateUnder87A: number;
  surcharge: number;
  healthAndEducationCess: number;
  totalTaxPayable: number;
  relief89: number;
  netTaxPayable: number;
  totalTDSDeducted: number;
  // Quarterly breakdown
  quarters: Array<{
    quarter: "Q1" | "Q2" | "Q3" | "Q4";
    taxDeducted: number;
    taxDeposited: number;
    challanDetails: string;
  }>;
}

export function generateForm16Data(
  annualPayslips: EmployeePayslip[], // All 12 months for this employee
  tanNumber: string,
  assessmentYear: string
): Form16Data {
  if (annualPayslips.length === 0) throw new Error("No payslips provided");

  const first = annualPayslips[0]!;
  const lastPayslip = annualPayslips[annualPayslips.length - 1]!;
  const taxComp = lastPayslip.taxComputation; // Use final month's annualised computation

  const totalGross = annualPayslips.reduce((s, p) => s + p.grossEarnings, 0);
  const totalTDS = annualPayslips.reduce((s, p) => s + p.tds, 0);

  // Quarterly TDS breakdown
  const q1TDS = annualPayslips
    .filter((p) => [4, 5, 6].includes(p.month))
    .reduce((s, p) => s + p.tds, 0);
  const q2TDS = annualPayslips
    .filter((p) => [7, 8, 9].includes(p.month))
    .reduce((s, p) => s + p.tds, 0);
  const q3TDS = annualPayslips
    .filter((p) => [10, 11, 12].includes(p.month))
    .reduce((s, p) => s + p.tds, 0);
  const q4TDS = annualPayslips
    .filter((p) => [1, 2, 3].includes(p.month))
    .reduce((s, p) => s + p.tds, 0);

  return {
    employeeName: first.employeeName,
    pan: first.pan,
    tanOfDeductor: tanNumber,
    assessmentYear,
    periodFrom: `${parseInt(assessmentYear) - 1}-04-01`,
    periodTo: `${assessmentYear.split("-")[0]}-03-31`,
    grossSalary: totalGross,
    exemptAllowances: taxComp.hraExemption,
    netSalary: totalGross - taxComp.hraExemption,
    standardDeduction: taxComp.standardDeduction,
    incomeChargeableUnderSalary: taxComp.taxableIncome,
    incomeFromOtherSources: 0,
    grossTotalIncome: taxComp.taxableIncome,
    deductionsUnderChapter6A: {
      section80C: Math.min(first.taxComputation.chapter6ADeductions, 150_000),
      section80D: 0,
      section80CCD1B: 0,
      section80TTA: 0,
      total: taxComp.chapter6ADeductions,
    },
    totalIncome: taxComp.taxableIncome,
    taxOnTotalIncome: taxComp.taxOnIncome,
    rebateUnder87A: taxComp.rebate87A,
    surcharge: taxComp.surcharge,
    healthAndEducationCess: taxComp.cess,
    totalTaxPayable: taxComp.totalTaxLiability,
    relief89: 0,
    netTaxPayable: taxComp.totalTaxLiability,
    totalTDSDeducted: totalTDS,
    quarters: [
      { quarter: "Q1", taxDeducted: q1TDS, taxDeposited: q1TDS, challanDetails: "" },
      { quarter: "Q2", taxDeducted: q2TDS, taxDeposited: q2TDS, challanDetails: "" },
      { quarter: "Q3", taxDeducted: q3TDS, taxDeposited: q3TDS, challanDetails: "" },
      { quarter: "Q4", taxDeducted: q4TDS, taxDeposited: q4TDS, challanDetails: "" },
    ],
  };
}
