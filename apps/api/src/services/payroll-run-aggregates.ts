/**
 * Computes payroll run totals from active employees + salary structures
 * using `payroll-cycle` (India statutory + TDS). Used when locking a run.
 */

import { employees, salaryStructures, eq, and } from "@coheronconnect/db";
import { computeEmployeePayslip, type EmployeePayrollInput } from "../lib/payroll-cycle";

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
): EmployeePayrollInput {
  const ctc = Number(struct.ctcAnnual || 0);
  const basicPct = Number(struct.basicPercent ?? 40) / 100;
  const hraPctOfBasic = Number(struct.hraPercentOfBasic ?? 50) / 100;
  const basicMonthly = (ctc * basicPct) / 12;
  const hraMonthly = basicMonthly * hraPctOfBasic;
  const specialAllowance = Math.max(0, ctc / 12 - basicMonthly - hraMonthly - 2500);
  const ltaAnnual = Number(struct.ltaAnnual || 0);
  const daysInMonth = new Date(year, month, 0).getDate();
  const join = emp.startDate ? new Date(emp.startDate) : new Date(year, month - 1, 1);

  return {
    id: emp.id,
    name: emp.employeeId,
    employeeCode: emp.employeeId,
    pan: emp.pan ?? "",
    uan: emp.uan ?? "",
    designation: emp.title ?? "",
    department: emp.department ?? "",
    state: emp.state ?? "Maharashtra",
    isMetro: emp.isMetroCity ?? false,
    joiningDate: join,
    basicMonthly,
    hraMonthly,
    specialAllowance,
    ltaAnnual,
    regime: emp.taxRegime === "old" ? "OLD" : "NEW",
    section80C: 0,
    section80D: 0,
    section80CCD1B: 0,
    section80TTA: 0,
    section24b: 0,
    hraExemption: 0,
    otherExemptions: 0,
    rentPaid: 0,
    daysInMonth,
    daysWorked: daysInMonth,
    lopDays: 0,
    overtime: 0,
    arrears: 0,
    bonus: 0,
    otherEarnings: 0,
    otherDeductions: 0,
    isVoluntaryHigherPF: false,
    previousEmployerIncome: 0,
    previousEmployerTDS: 0,
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
  let totalPt = 0;
  let totalTds = 0;
  let employeeCount = 0;

  for (const { emp, st } of rows) {
    try {
      const input = buildEmployeePayrollInput(emp, st, month, year);
      const slip = computeEmployeePayslip(input, fyMonth);
      totalGross += slip.grossEarnings;
      totalDeductions += slip.totalDeductions;
      totalNet += slip.netPay;
      totalPfEmployee += slip.employeePF;
      totalPfEmployer += slip.employerPF;
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
    totalPt,
    totalTds,
    employeeCount,
    errors,
  };
}
