/**
 * form16-aggregator.ts — assemble a Form 16 Part B from payroll data.
 *
 * Input: financial year (e.g. "2025-2026"), employee row, all payslips for
 *        that FY, employer org row, and any extra Chapter VI-A deductions
 *        the employee has declared (carried in `employee.declarations` once
 *        we build that surface; today we degrade gracefully to zero).
 *
 * Output: Form16PDFInput, ready for `generateForm16PDF`.
 *
 * What this file is NOT: it is not a tax engine. The slab math, rebate, and
 * cess come from `lib/india-tax-engine.ts`. This module's job is purely to
 * roll up 12 monthly payslips into the annual figures Form 16 expects.
 */
import type { employees, payslips, organizations } from "@coheronconnect/db";
import type { Form16PDFInput } from "../../services/form16-pdf";
import { computeTax, type EmployeeTaxProfile } from "../india-tax-engine";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function fyMonths(financialYear: string): { fromMonth: string; toMonth: string } {
  // FY "2025-2026" → April 2025 to March 2026
  const start = Number(financialYear.split("-")[0]);
  return {
    fromMonth: `April ${start}`,
    toMonth: `March ${start + 1}`,
  };
}

function assessmentYearOf(financialYear: string): string {
  const [from, to] = financialYear.split("-").map(Number);
  return `${to}-${(to ?? 0) + 1}`;
}

export interface AggregateInput {
  org: typeof organizations.$inferSelect & { settings?: unknown };
  employee: typeof employees.$inferSelect & { name?: string | null };
  /** All payslips for the FY (we aggregate; 12 rows when complete). */
  fySlips: Array<typeof payslips.$inferSelect>;
  financialYear: string;
  /** Optional Chapter VI-A breakup (defaults to zero per row). */
  chapterVIA?: Array<{ section: string; label: string; amount: number }>;
  /** Display-only — who signs the certificate. Defaults to "Authorized Signatory". */
  signedBy?: string;
  signedDesignation?: string;
}

export function buildForm16Input(args: AggregateInput): Form16PDFInput {
  const { org, employee, fySlips, financialYear, chapterVIA = [], signedBy, signedDesignation } = args;

  const grossSalary = fySlips.reduce((s, p) => s + Number(p.grossEarnings || 0), 0);
  const lessHraExempt = 0; // Future: derive from rent declarations.
  const lessLtaExempt = fySlips.reduce((s, p) => s + Number(p.lta || 0), 0);
  const lessOtherExempt = 0;
  const netSalary = Math.max(0, grossSalary - lessHraExempt - lessLtaExempt - lessOtherExempt);

  const standardDeduction = grossSalary > 0 ? 50_000 : 0;
  const professionalTax = fySlips.reduce((s, p) => s + Number(p.professionalTax || 0), 0);
  const entertainmentAllowance = 0;

  const chapterVIATotal = chapterVIA.reduce((s, d) => s + d.amount, 0);

  const taxableIncome = Math.max(
    0,
    Math.round(netSalary - standardDeduction - professionalTax - entertainmentAllowance - chapterVIATotal),
  );

  const taxRegime = (employee.taxRegime ?? "new") as "old" | "new";

  // Reduce monthly aggregates back to the per-month figures
  // `EmployeeTaxProfile` expects. Twelve-month FY assumed; partial years
  // degrade to lower projections automatically.
  const months = Math.max(1, fySlips.length);
  const basicAnnual = fySlips.reduce((s, p) => s + Number(p.basic || 0), 0);
  const hraAnnual = fySlips.reduce((s, p) => s + Number(p.hra || 0), 0);
  const specialAnnual = fySlips.reduce((s, p) => s + Number(p.specialAllowance || 0), 0);
  const ltaAnnualEarned = fySlips.reduce((s, p) => s + Number(p.lta || 0), 0);
  const pfMonthly = fySlips.length
    ? Math.round(fySlips.reduce((s, p) => s + Number(p.pfEmployee || 0), 0) / months)
    : 0;

  const profile: EmployeeTaxProfile = {
    regime: taxRegime === "old" ? "OLD" : "NEW",
    annualCTC: grossSalary,
    basicMonthly: basicAnnual / months,
    hraMonthly: hraAnnual / months,
    specialAllowance: specialAnnual / months,
    lta: ltaAnnualEarned,
    section80C: chapterVIA.find((d) => d.section === "80C")?.amount ?? 0,
    section80D: chapterVIA.find((d) => d.section === "80D")?.amount ?? 0,
    section80CCD1B: chapterVIA.find((d) => d.section === "80CCD(1B)")?.amount ?? 0,
    section80TTA: chapterVIA.find((d) => d.section === "80TTA")?.amount ?? 0,
    section24b: chapterVIA.find((d) => d.section === "24(b)")?.amount ?? 0,
    hraExemption: lessHraExempt,
    otherExemptions: lessOtherExempt,
    employeePFMonthly: pfMonthly,
    employerPFMonthly: pfMonthly,
    professionalTax,
    joiningMonth: 1,
    monthsInFY: 12,
    previousEmployerIncome: 0,
    previousEmployerTDS: 0,
  };

  const tax = computeTax(profile);

  const totalTdsDeducted = fySlips.reduce((s, p) => s + Number(p.tds || 0), 0);
  const totalTaxLiability = Math.round(tax.totalTaxLiability ?? 0);
  const refundDue = totalTdsDeducted - totalTaxLiability; // positive → refund, negative → payable

  const { fromMonth, toMonth } = fyMonths(financialYear);

  const orgName = (org as { name?: string }).name ?? "Organization";
  const orgAddress =
    (org.settings as { address?: string } | null | undefined)?.address ?? "—";
  const orgPan =
    (org.settings as { pan?: string } | null | undefined)?.pan ?? "—";
  const orgTan =
    (org.settings as { tan?: string } | null | undefined)?.tan ?? "—";

  return {
    employerName: orgName,
    employerAddress: orgAddress,
    employerPan: orgPan,
    employerTan: orgTan,
    employeeName: employee.name ?? "Employee",
    employeePan: employee.pan ?? "—",
    designation: employee.title ?? "—",
    financialYear,
    assessmentYear: assessmentYearOf(financialYear),
    fromMonth,
    toMonth,
    grossSalary,
    lessHraExempt,
    lessLtaExempt,
    lessOtherExempt,
    netSalary,
    standardDeduction,
    professionalTax,
    entertainmentAllowance,
    deductions: chapterVIA,
    taxableIncome,
    taxOnIncome: Math.round(tax.taxOnIncome ?? 0),
    rebate87a: Math.round(tax.rebate87A ?? 0),
    surcharge: Math.round(tax.surcharge ?? 0),
    cessHealthEducation: Math.round(tax.cess ?? 0),
    totalTaxLiability,
    totalTdsDeducted,
    refundDue,
    taxRegime,
    signedBy: signedBy ?? "Authorized Signatory",
    signedDesignation: signedDesignation ?? "Director",
    signedAt: `${MONTHS[new Date().getMonth()]} ${new Date().getDate()}, ${new Date().getFullYear()}`,
  };
}
