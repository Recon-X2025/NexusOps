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

import {
  computeTax,
  computeHRAExemption,
  type EmployeeTaxProfile,
  type TaxComputation,
} from "./tax-engine";
import {
  computeMonthlyStatutory,
  calculateLabourCodeWageBase,
  computeStatutoryBonusEligibility,
  type MonthlyStatutoryDeductions,
  type StatutoryCeilingOverrides,
  type PTContext,
} from "./statutory-deductions";

/**
 * Age in completed years at a given as-of date, or null if DOB is absent. Used only for
 * the over-65 Professional-Tax exemption. Counts a birthday as reached on the day
 * (month/day compare), so "65 today" is 65.
 */
export function ageInYearsAt(dob: Date | null | undefined, asOf: Date): number | null {
  if (!dob) return null;
  let age = asOf.getFullYear() - dob.getFullYear();
  const m = asOf.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < dob.getDate())) age -= 1;
  return age;
}

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
  daEarned: number; // Dearness Allowance earned (own line); part of gross and the PF/ESI wage base
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
  /**
   * The amount by which deductions exceeded gross earnings this cycle — i.e. the
   * shortfall the `max(0, …)` net-pay floor would otherwise discard silently.
   * `0` whenever net pay is non-negative. Surfacing it (rather than swallowing it)
   * means money can never vanish at the floor; once a salary-advance / loan-recovery
   * feature exists this is the amount that must carry forward as still-owed.
   */
  unrecoveredShortfall: number;
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
  /**
   * Statutory gender for Professional-Tax bracket selection (Maharashtra is gender-split).
   * Unstated/`other` resolves to the male (lower-threshold) slab per the CA. Optional so
   * existing callers/fixtures compile unchanged; absence = male set.
   */
  gender?: "male" | "female" | "other" | null;
  /**
   * Date of birth — the only source for the over-65 PT exemption. Optional; when absent,
   * the age exemption cannot apply.
   */
  dateOfBirth?: Date | null;
  /**
   * Declared PT Tier-1 exemption flags (armed forces / own disability / dependent with
   * disability). ANY true — or age > 65 derived from `dateOfBirth` — bypasses PT entirely,
   * all states. Optional; default false.
   */
  ptExemptArmedForces?: boolean;
  ptExemptDisability?: boolean;
  ptExemptDependentDisability?: boolean;
  /**
   * Half-yearly PT support (Kerala, Tamil Nadu). Supplied by the run/write path, which has
   * payslip history: `ptPeriodPriorGross` is the summed gross of the current six-month
   * period's EARLIER months the system holds, and `ptPeriodMissingMonths` lists the required
   * earlier FY months (1=Apr … 12=Mar) with no payslip on record. Consulted only for a
   * half-yearly state in its collection month; a monthly state ignores them. Left undefined
   * by preview callers — the engine then flags the period incomplete rather than assessing
   * from one month.
   */
  ptPeriodPriorGross?: number;
  ptPeriodMissingMonths?: number[];
  // Salary structure
  basicMonthly: number;
  /** Dearness Allowance (monthly). Part of the Code-on-Wages core: it joins basic in the PF/ESI
   *  wage base and is a distinct earnings line. Optional; absent/0 = basic-alone composition
   *  (byte-identical to before DA existed). Does NOT enter the HRA-exemption salary base. */
  daMonthly?: number;
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
  /** Voluntary PF: EXTRA employee rate above the statutory 12% (fraction, e.g. 0.08 = +8%).
   *  Employee-only; the employer contribution is unchanged. Optional; absent/0 = no VPF. */
  voluntaryPfRate?: number;
  /** ESI membership held for the current contribution period (from the employee
   *  record); null/undefined = unknown. Drives the six-month membership rule so a
   *  member is not dropped mid-period and a non-member does not join mid-period. */
  esiMemberAtPeriodStart?: boolean | null;
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
  daEarned: number;
  hraEarned: number;
  specialAllowanceEarned: number;
  ltaEarned: number;
  grossEarnings: number;
} {
  const lopFactor =
    emp.lopDays > 0 ? (emp.daysWorked / emp.daysInMonth) : 1;

  const basicEarned = Math.round(emp.basicMonthly * lopFactor);
  // DA is carved out of the special-allowance residual by the caller, so adding it here as its
  // own line keeps gross total unchanged (basic-alone: daMonthly = 0 ⇒ daEarned = 0).
  const daEarned = Math.round((emp.daMonthly ?? 0) * lopFactor);
  const hraEarned = Math.round(emp.hraMonthly * lopFactor);
  const specialAllowanceEarned = Math.round(emp.specialAllowance * lopFactor);
  const ltaEarned = Math.round((emp.ltaAnnual / 12) * lopFactor);

  const grossEarnings =
    basicEarned +
    daEarned +
    hraEarned +
    specialAllowanceEarned +
    ltaEarned +
    emp.overtime +
    emp.arrears +
    emp.bonus +
    emp.otherEarnings;

  return { basicEarned, daEarned, hraEarned, specialAllowanceEarned, ltaEarned, grossEarnings };
}

/**
 * Steps 3-7: Compute all deductions for one employee for one month
 */
export function computeEmployeePayslip(
  emp: EmployeePayrollInput,
  fyMonth: number,
  ceilings: StatutoryCeilingOverrides = {}
): EmployeePayslip {
  // Labour Codes 2025 (Code on Wages s.2(y)): when a bonus-eligibility ceiling is
  // resolved the Labour-Code "wages" definition is in force, so (a) lift the
  // PF/ESI wage base via the 50%-inclusion proviso BEFORE the ceiling clamp, and
  // (b) gate the statutory bonus on the Payment of Bonus Act eligibility ceiling.
  // The gate is `bonusEligibilityCeiling` (only ever set by the 2025-11-21 seed),
  // so orgs on the pre-Labour-Code config keep their exact prior behaviour.
  const labourCodesInForce = ceilings.bonusEligibilityCeiling !== undefined;

  // Statutory bonus eligibility gate: under the Payment of Bonus Act an employee
  // is eligible only if Basic+DA ≤ the ceiling. `basicMonthly` (not LOP-adjusted)
  // is the contractual wage tested for eligibility. Ineligible ⇒ statutory bonus
  // is not payable, so it is removed from gross.
  const bonusEligible = labourCodesInForce
    ? computeStatutoryBonusEligibility(
        // Payment of Bonus Act reads "salary or wage" as Basic + DA (not basic alone). For a
        // DA employee near the ₹21,000 ceiling, basic alone under-counts and wrongly keeps them
        // eligible. daMonthly = 0 for a basic-alone composition, so this is byte-identical there.
        emp.basicMonthly + (emp.daMonthly ?? 0),
        ceilings.bonusEligibilityCeiling,
      ).isEligible
    : true;
  const effectiveBonus = bonusEligible ? emp.bonus : 0;

  // Step 2: Gross (recomputed with the eligibility-gated bonus).
  const { basicEarned, daEarned, hraEarned, specialAllowanceEarned, ltaEarned, grossEarnings } = computeGross({
    ...emp,
    bonus: effectiveBonus,
  });

  // Core "wages" for the PF/ESI base = basic + DA (Code on Wages s.2(y)); DA is NOT an excluded
  // allowance. `excludedAllowances` is everything else. The 50% clamp then resolves to half of
  // total regardless of how the core is split between basic and DA — so a Basic+DA composition
  // and an all-Basic composition summing to the same core yield the same wage base.
  const coreWages = basicEarned + daEarned;
  const excludedAllowances =
    hraEarned +
    specialAllowanceEarned +
    ltaEarned +
    emp.overtime +
    emp.arrears +
    effectiveBonus +
    emp.otherEarnings;
  const wageBase = labourCodesInForce
    ? calculateLabourCodeWageBase(coreWages, excludedAllowances).statutoryWageBase
    : coreWages;

  // Resolve the PT context: gender (Maharashtra bracket selection) and the composite
  // Tier-1 exemption. Age > 65 is derived from DOB as of the pay period; the other three
  // exemptions are declared flags. ANY true ⇒ PT bypassed entirely (all states).
  const asOfPeriod = new Date(emp.year, emp.month - 1, 1);
  const age = ageInYearsAt(emp.dateOfBirth, asOfPeriod);
  const ptContext: PTContext = {
    gender: emp.gender ?? null,
    exempt:
      (age !== null && age > 65) ||
      emp.ptExemptArmedForces === true ||
      emp.ptExemptDisability === true ||
      emp.ptExemptDependentDisability === true,
    // Half-yearly PT (Kerala, Tamil Nadu): the caller's payslip-derived period income and any
    // missing months. Undefined for monthly states and for previews that don't supply them.
    periodPriorGross: emp.ptPeriodPriorGross,
    periodMissingMonths: emp.ptPeriodMissingMonths,
  };

  // Steps 3-6: Statutory deductions
  const statutory = computeMonthlyStatutory(
    wageBase, // basic + DA lifted by the s.2(y) 50% proviso (Labour Codes)
    grossEarnings,
    emp.state,
    fyMonth,
    emp.isVoluntaryHigherPF,
    ceilings,
    ptContext,
    emp.esiMemberAtPeriodStart,
    // ESI eligibility threshold uses the FULL-MONTH pay scale (basic + DA + HRA + special),
    // excluding overtime and NOT prorated — so a part-month joiner is tested on their
    // scale, not a fragment. The contribution itself is on actual earned gross.
    emp.basicMonthly + (emp.daMonthly ?? 0) + emp.hraMonthly + emp.specialAllowance,
    // VPF: extra employee PF rate above 12% (employee-only).
    emp.voluntaryPfRate ?? 0,
  );

  // Step 7: TDS
  // Build annualised tax profile
  const monthsInFY = fyMonth <= 12 ? 12 - fyMonth + 1 : 12;
  const joiningMonth =
    emp.joiningDate.getFullYear() > new Date().getFullYear() - 1
      ? emp.joiningDate.getMonth() + 1 - 3 // Rough FY month
      : 1;

  // ── A12-D: split-logic annual projection ──────────────────────────────────
  // The shipped A12 annualised THIS month's LOP-reduced earnings ×12
  // (`basicEarned*12 + …`), i.e. it assumed the pay cut REPEATS every month — so a
  // single unpaid month depressed the whole year's income estimate and under-collected
  // TDS. The CA-correct estimate is a BLEND: the current month on the actual earned
  // (LOP-reduced) pay, and EVERY OTHER month of the FY on the ORIGINAL CONTRACTED pay
  // (a one-off unpaid month must not be projected forward as a pay cut).
  //
  //   projected annual = contracted × (months before this one)   ← earnings to date
  //                    + this month's actual earned              ← current month
  //                    + contracted × (months remaining)         ← rest of the year
  //
  // FY-month arithmetic (fyMonth: 1 = April … 12 = March): April → 0 before / 11 after,
  // March → 11 before / 0 after; clamped so an out-of-range fyMonth can't go negative.
  //
  // ⚠️ PR5 constraint: earnings-to-date CANNOT be read from prior payslips — the run
  // passes ytd*=0 (`payroll-run-aggregates.ts`), so a real running FY total is not
  // available at this point. Rather than build on that untrusted zero, the PAST months
  // are ESTIMATED at contracted pay — the same assumption the CA applies to future
  // months. This is exact for a one-off CURRENT-month LOP (the case that matters), and
  // never reads the ytd figure. Its one blind spot: it cannot see a LOP in an EARLIER
  // month of the same FY (it assumes every past month was full pay); correcting that
  // needs the real prior-payslip YTD that PR5 is about. Still strictly better than the
  // shipped `earned*12`, which mis-projected the current month across ALL 12.
  //
  // Contracted monthly is the per-component figure at lopFactor = 1, so when
  // `lopDays == 0` the current month equals contracted and the blend collapses to
  // `contracted × 12` — BYTE-IDENTICAL to A12 for every non-LOP payslip.
  const fyMonthClamped = Math.min(12, Math.max(1, fyMonth));
  const monthsBeforeCurrent = fyMonthClamped - 1; // April → 0 … March → 11
  const monthsRemaining = 12 - fyMonthClamped; //    April → 11 … March → 0
  /** Blend one salary component: contracted for every month but this one, actual now. */
  const projectAnnualComponent = (contractedMonthly: number, earnedThisMonth: number): number =>
    contractedMonthly * monthsBeforeCurrent + earnedThisMonth + contractedMonthly * monthsRemaining;
  const annualBasic = projectAnnualComponent(Math.round(emp.basicMonthly), basicEarned);
  const annualHra = projectAnnualComponent(Math.round(emp.hraMonthly), hraEarned);
  const annualSpecial = projectAnnualComponent(Math.round(emp.specialAllowance), specialAllowanceEarned);
  const annualLta = projectAnnualComponent(Math.round(emp.ltaAnnual / 12), ltaEarned);
  const annualProjectedIncome = annualBasic + annualHra + annualSpecial + annualLta;

  // HRA exemption (s.10(13A)). Least of: HRA received, rent − 10% of basic, and
  // 50%/40% of basic (metro/non-metro). Computed on the SAME split-logic annual basis
  // as `annualCTC` below (A12 deliberately coupled the two), so the exemption tracks the
  // same projected income. `computeTax` applies this only under the OLD regime, so a
  // value here never reduces new-regime tax. `computeHRAExemption` returns 0 when rent or
  // HRA is 0, so an employee with no rent declared is unaffected. A caller-supplied
  // `emp.hraExemption` (legacy/explicit override) still wins when it is non-zero.
  const computedHraExemption =
    emp.regime === "OLD"
      ? computeHRAExemption(
          annualBasic,
          annualHra,
          emp.rentPaid,
          emp.isMetro,
        )
      : 0;
  const hraExemption = emp.hraExemption > 0 ? emp.hraExemption : computedHraExemption;

  const taxProfile: EmployeeTaxProfile = {
    regime: emp.regime,
    // A12-D: the split-logic annual projection computed above (current month on actual
    // earned pay, every other FY month on contracted pay). This replaces A12's
    // `earned*12`, which projected a single LOP month across the whole year and
    // under-collected TDS. When `lopDays == 0` the blend equals `contracted*12`, so the
    // non-LOP payslip is byte-identical to A12. See the split-logic block above.
    annualCTC: annualProjectedIncome,
    basicMonthly: emp.basicMonthly,
    hraMonthly: emp.hraMonthly,
    specialAllowance: emp.specialAllowance,
    lta: emp.ltaAnnual,
    section80C: emp.section80C,
    section80D: emp.section80D,
    section80CCD1B: emp.section80CCD1B,
    section80TTA: emp.section80TTA,
    section24b: emp.section24b,
    hraExemption,
    otherExemptions: emp.otherExemptions,
    employeePFMonthly: statutory.pf.totalEmployee,
    employerPFMonthly: statutory.pf.totalEmployer,
    professionalTax: statutory.pt.annualPT,
    joiningMonth: Math.max(1, joiningMonth),
    monthsInFY: Math.max(1, monthsInFY),
    previousEmployerIncome: emp.previousEmployerIncome,
    previousEmployerTDS: emp.previousEmployerTDS,
  };

  // C5: pass the effective-dated income-tax config resolved for this period (from
  // `statutory_ceilings`). When `ceilings.taxConfig` is absent — every org with no
  // seeded tax rows — `computeTax` falls back to its module constants, so TDS is
  // byte-identical to before.
  const taxComputation = computeTax(taxProfile, ceilings.taxConfig);

  // Build payslip
  const totalDeductions =
    statutory.totalEmployeeDeductions +
    taxComputation.monthlyTDS +
    emp.otherDeductions;

  // Net pay floors at 0, but the shortfall (deductions over earnings) is surfaced as
  // `unrecoveredShortfall` rather than silently discarded — money must not vanish at
  // the floor. It is 0 whenever earnings cover deductions.
  const netBeforeFloor = grossEarnings - totalDeductions;
  const netPay = Math.max(0, netBeforeFloor);
  const unrecoveredShortfall = Math.max(0, -netBeforeFloor);

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
    daEarned,
    hraEarned,
    specialAllowance: specialAllowanceEarned,
    lta: ltaEarned,
    overtime: emp.overtime,
    arrears: emp.arrears,
    bonus: effectiveBonus,
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
    unrecoveredShortfall,
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
    (sum, ps) => sum + (ps.taxComputation.monthlyTDS > 0 ? (ps.taxComputation.surcharge / ps.taxComputation.monthlyTDS) * ps.tds : 0),
    0
  );
  const totalCess = payslips.reduce(
    (sum, ps) => sum + (ps.taxComputation.monthlyTDS > 0 ? (ps.taxComputation.cess / ps.taxComputation.monthlyTDS) * ps.tds : 0),
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
      section80C: taxComp.chapter6ABreakdown?.section80C ?? 0,
      section80D: taxComp.chapter6ABreakdown?.section80D ?? 0,
      section80CCD1B: taxComp.chapter6ABreakdown?.section80CCD1B ?? 0,
      section80TTA: taxComp.chapter6ABreakdown?.section80TTA ?? 0,
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
