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
    lta: Number(p.lta || 0) || 30_000,
    // TODO(compliance): Wire up actual employee tax declarations intake table.
    // Currently hardcoded to 0. Old regime TDS will be over-deducted until this is built.
    section80C: 0,
    section80D: 0,
    section80CCD1B: 0,
    section80TTA: 0,
    section24b: 0,
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
