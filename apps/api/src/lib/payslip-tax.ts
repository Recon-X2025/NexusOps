/**
 * Single source of truth for the annual tax figures shown against a stored payslip.
 *
 * A payslip row persists only the MONTHLY numbers (this month's TDS, gross, PT, …); the
 * ANNUAL figures a payslip/PDF must display — taxable income and total annual tax
 * liability — are not stored per row, so they are recomputed from the row via the same
 * `computeTax` engine the run used. Both the on-screen payslip (`mapPayslipRow`) and the
 * downloadable PDF (`payroll-payslip-pdf`) call this so they cannot drift apart.
 *
 * PT2: the PDF previously re-derived these two numbers by hand — annual tax as
 * `monthlyTDS × 12` and taxable income as `gross × 12 − ₹75,000` (a hardcoded standard
 * deduction that also silently omitted professional tax). Both were wrong and neither
 * matched the screen. Reading them from the engine here fixes both and keeps PDF ≡ screen.
 */

import type { payslips } from "@coheronconnect/db";
import { computeTax, type EmployeeTaxProfile } from "./india-tax-engine";

export type PayslipTaxFigures = {
  regime: "OLD" | "NEW";
  taxableIncome: number;
  totalTaxLiability: number;
  monthlyTDS: number;
};

/**
 * Recompute the annual tax view for a stored payslip row. Annualises this month's paid
 * components (the CA-correct actual-paid basis) and runs the same tax engine as the run.
 */
export function computePayslipTaxFigures(
  p: typeof payslips.$inferSelect,
  // C1 Piece 1: old-regime declared deductions for this payslip's FY, so the on-screen/PDF annual
  // tax projection matches the actual TDS the run deducted (which now also reads them). Absent ⇒ 0.
  declarations?: {
    section80C: number;
    section80D: number;
    section80CCD1B: number;
    section80TTA: number;
    section24b: number;
  },
): PayslipTaxFigures {
  const grossM = Number(p.grossEarnings || 0);
  const basicM = Number(p.basic || 0) || Math.round(grossM * 0.4);
  const hraM = Number(p.hra || 0) || Math.round(basicM * 0.5);
  const specM = Number(p.specialAllowance || 0) || Math.max(0, grossM - basicM - hraM);
  const regime: "OLD" | "NEW" = p.taxRegimeUsed === "old" ? "OLD" : "NEW";
  const profile: EmployeeTaxProfile = {
    regime,
    annualCTC: Math.max(grossM * 12, 1),
    basicMonthly: basicM,
    hraMonthly: hraM,
    specialAllowance: specM,
    // LTA-FABRICATION fix: use the payslip's actual LTA (0 if 0). The old `|| 30_000` invented an
    // LTA on a payslip the employee holds, over-stating taxable income on the on-screen projection
    // (Form 16 was clean — form16-aggregator calls computeTax directly — so this was display-only).
    lta: Number(p.lta || 0),
    // C1 Piece 1: wired from `tax_declarations` (passed by the caller for this employee's FY).
    section80C: declarations?.section80C ?? 0,
    section80D: declarations?.section80D ?? 0,
    section80CCD1B: declarations?.section80CCD1B ?? 0,
    section80TTA: declarations?.section80TTA ?? 0,
    section24b: declarations?.section24b ?? 0,
    hraExemption: 0,
    otherExemptions: 0,
    employeePFMonthly: Number(p.pfEmployee || 0),
    employerPFMonthly: Number(p.pfEmployer || 0),
    professionalTax: Number(p.professionalTax || 0) * 12,
    joiningMonth: 1,
    monthsInFY: 12,
    previousEmployerIncome: 0,
    previousEmployerTDS: 0,
  };
  const t = computeTax(profile);
  return {
    regime,
    taxableIncome: t.taxableIncome,
    totalTaxLiability: t.totalTaxLiability,
    monthlyTDS: t.monthlyTDS,
  };
}
