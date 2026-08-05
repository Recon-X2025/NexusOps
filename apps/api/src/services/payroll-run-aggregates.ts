/**
 * Computes payroll run totals from active employees + salary structures
 * using `payroll-cycle` (India statutory + TDS). Used when locking a run.
 */

import { employees, salaryStructures, eq, and } from "@coheronconnect/db";
import { computeEmployeePayslip, type EmployeePayrollInput } from "../lib/payroll-cycle";
import { resolveStatutoryCeilings } from "../lib/india/statutory-ceilings";
import { computeAttendanceLopForPeriod } from "../lib/india/attendance-lop";

/** India FY month: April = 1 … March = 12 */
export function calendarToFyMonth(calendarMonth: number): number {
  return calendarMonth >= 4 ? calendarMonth - 3 : calendarMonth + 9;
}

export type PayrollAggregateTotals = {
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  totalPfEmployee: number;
  totalPfEmployer: number;
  totalEsiEmployee: number;
  totalEsiEmployer: number;
  totalPt: number;
  totalTds: number;
  employeeCount: number;
  errors: Array<{ employeeId: string; message: string }>;
};

export function buildEmployeePayrollInput(
  emp: typeof employees.$inferSelect,
  struct: typeof salaryStructures.$inferSelect,
  month: number,
  year: number,
  attendance?: { daysInMonth: number; daysWorked: number; lopDays: number },
): EmployeePayrollInput {
  const ctc = Number(struct.ctcAnnual || 0);
  const basicPct = Number(struct.basicPercent ?? 40) / 100;
  const hraPctOfBasic = Number(struct.hraPercentOfBasic ?? 50) / 100;
  const basicMonthly = (ctc * basicPct) / 12;
  const hraMonthly = basicMonthly * hraPctOfBasic;
  // PT1: special allowance is the residual of monthly CTC after basic + HRA. The bare
  // `- 2500` previously subtracted here was the ANNUAL Maharashtra PT cap (₹2,500/year)
  // applied MONTHLY — 12× too large, in the wrong place, and never added back — so it
  // silently shaved ₹30,000/year off every employee's gross (and therefore off the TDS
  // base). PT is deducted separately as a statutory deduction; it does not belong in the
  // earnings residual. Removed so the run taxes the actual paid components in full.
  const specialAllowance = Math.max(0, ctc / 12 - basicMonthly - hraMonthly);
  const ltaAnnual = Number(struct.ltaAnnual || 0);
  const daysInMonth = new Date(year, month, 0).getDate();
  // G8: LOP derived from attendance. Absent a record, treat as a full paid month.
  const daysWorked = attendance ? attendance.daysWorked : daysInMonth;
  const lopDays = attendance ? attendance.lopDays : 0;
  const join = emp.startDate ? new Date(emp.startDate) : new Date(year, month - 1, 1);

  // Statutory state drives PT slab selection. There is no safe default — a silent
  // fallback (previously "Maharashtra") files the wrong PT with a state regulator, and
  // ~half of states levy no PT, so "unknown" must be distinguishable from "known non-
  // levying". Employees with no state are excluded from the run with a per-employee error
  // (owner-approved: "Error that employee row"). The API create boundary makes state
  // required going forward; this guard catches legacy rows.
  const state = emp.state?.trim();
  if (!state) {
    throw new Error(
      "Employee has no state on record; professional-tax state cannot be resolved. " +
        "Set the employee's state before locking payroll.",
    );
  }

  return {
    id: emp.id,
    name: emp.employeeId,
    employeeCode: emp.employeeId,
    pan: emp.pan ?? "",
    uan: emp.uan ?? "",
    designation: emp.title ?? "",
    department: emp.department ?? "",
    state,
    isMetro: emp.isMetroCity ?? false,
    joiningDate: join,
    gender: emp.gender ?? null,
    dateOfBirth: emp.dateOfBirth ?? null,
    ptExemptArmedForces: emp.ptExemptArmedForces ?? false,
    ptExemptDisability: emp.ptExemptDisability ?? false,
    ptExemptDependentDisability: emp.ptExemptDependentDisability ?? false,
    basicMonthly,
    hraMonthly,
    specialAllowance,
    ltaAnnual,
    regime: emp.taxRegime === "old" ? "OLD" : "NEW",
    // TODO(compliance): Wire up actual employee tax declarations intake table.
    // Currently hardcoded to 0. Old regime TDS will be over-deducted until this is built.
    section80C: 0,
    section80D: 0,
    section80CCD1B: 0,
    section80TTA: 0,
    section24b: 0,
    // hraExemption stays 0: the engine now COMPUTES it from rentPaid + isMetro + the
    // earned basic/HRA (s.10(13A) least-of-three), so this caller-supplied field is only
    // an explicit override. `rentPaid` is the declared annual rent (Form-12BB style); when
    // 0 (no declaration) the exemption is 0, unchanged for non-renters. Old-regime only.
    hraExemption: 0,
    otherExemptions: 0,
    rentPaid: Number(emp.rentPaidAnnual || 0),
    daysInMonth,
    daysWorked,
    lopDays,
    overtime: 0,
    arrears: 0,
    bonus: 0,
    otherEarnings: 0,
    otherDeductions: 0,
    isVoluntaryHigherPF: false,
    // PT4: feed the engine the Form 12B prior-employer figures declared on the employee
    // record. The rolling s.192 calc already nets `previousEmployerTDS` against the annual
    // liability; these were hardcoded to 0, so any prior-employer income/TDS was ignored.
    // A 0 default (no 12B on file) is correct and unchanged for existing employees.
    previousEmployerIncome: Number(emp.previousEmployerIncome || 0),
    previousEmployerTDS: Number(emp.previousEmployerTds || 0),
    ytdGross: 0,
    ytdPF: 0,
    ytdTDS: 0,
    ytdNetPay: 0,
    month,
    year,
  };
}

export async function computePayrollRunTotals(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  month: number,
  year: number,
): Promise<PayrollAggregateTotals> {
  const errors: Array<{ employeeId: string; message: string }> = [];
  const fyMonth = calendarToFyMonth(month);

  const rows = await db
    .select({ emp: employees, st: salaryStructures })
    .from(employees)
    .innerJoin(salaryStructures, eq(employees.salaryStructureId, salaryStructures.id))
    .where(and(eq(employees.orgId, orgId), eq(employees.status, "active")));

  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;
  let totalPfEmployee = 0;
  let totalPfEmployer = 0;
  let totalEsiEmployee = 0;
  let totalEsiEmployer = 0;
  let totalPt = 0;
  let totalTds = 0;
  let employeeCount = 0;

  // G1: resolve effective-dated statutory ceilings so previews match the run.
  const ceilings = await resolveStatutoryCeilings(db, orgId, new Date(year, month - 1, 1));
  // G8: derive LOP from attendance for the period so previews match the run.
  const lopMap = await computeAttendanceLopForPeriod(db, orgId, month, year);

  for (const { emp, st } of rows) {
    try {
      const input = buildEmployeePayrollInput(emp, st, month, year, lopMap.get(emp.id));
      const slip = computeEmployeePayslip(input, fyMonth, ceilings);

      // An unknown/misspelled state (e.g. "Karnatak") resolves to ₹0 PT — the same
      // number a genuinely non-levying state (Delhi) returns. computePT flags the
      // unresolved case so we surface it here rather than file a plausible-wrong ₹0
      // nobody sees. This is a WARNING, not a hard error: the row still computes and is
      // counted in the totals; the flag rides the same errors[] channel a missing state
      // uses, so a payroll admin sees every state problem before locking.
      if (slip.statutoryDeductions.pt.unknownState) {
        errors.push({
          employeeId: emp.id,
          message:
            `Employee state "${emp.state ?? ""}" did not match any known professional-tax ` +
            `state, so PT was computed as ₹0. Verify the spelling before locking payroll.`,
        });
      }

      totalGross += slip.grossEarnings;
      totalDeductions += slip.totalDeductions;
      totalNet += slip.netPay;
      totalPfEmployee += slip.employeePF;
      totalPfEmployer += slip.employerPF;
      totalEsiEmployee += slip.employeeESI;
      totalEsiEmployer += slip.employerESI;
      totalPt += slip.professionalTax;
      totalTds += slip.tds;
      employeeCount += 1;
    } catch (e) {
      errors.push({
        employeeId: emp.id,
        message: e instanceof Error ? e.message : "Computation failed",
      });
    }
  }

  return {
    totalGross,
    totalDeductions,
    totalNet,
    totalPfEmployee,
    totalPfEmployer,
    totalEsiEmployee,
    totalEsiEmployer,
    totalPt,
    totalTds,
    employeeCount,
    errors,
  };
}
