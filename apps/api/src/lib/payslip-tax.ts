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
import { computeTax, computeHRAExemption, isMetroCity, type EmployeeTaxProfile } from "./india-tax-engine";

export type PayslipTaxFigures = {
  regime: "OLD" | "NEW";
  taxableIncome: number;
  totalTaxLiability: number;
  monthlyTDS: number;
};

/**
 * F9: the employee context the display needs to project the SAME annual base the run used.
 * Without it the projection falls back to a full 12 months with no HRA exemption — the
 * legacy behaviour, kept only so pre-existing unit fixtures compile unchanged. Real callers
 * (payslip PDF, on-screen list) have the employee row and pass this, so the printed annual
 * liability and the deducted TDS are computed by ONE projection and cannot diverge.
 */
export type PayslipEmployeeContext = {
  startDate?: Date | string | null;
  city?: string | null;
  rentPaidAnnual?: number;
  previousEmployerIncome?: number;
  previousEmployerTds?: number;
};

/**
 * Recompute the annual tax view for a stored payslip row. Projects the employee's ACTUAL
 * fiscal-year earnings (join month → March, via `employee.startDate` + the row's own
 * month/year) and runs the same tax engine as the run — so the annual figure it shows and
 * the monthly TDS the run deducted share one projection. See F9.
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
  employee?: PayslipEmployeeContext,
): PayslipTaxFigures {
  const grossM = Number(p.grossEarnings || 0);
  const basicM = Number(p.basic || 0) || Math.round(grossM * 0.4);
  const hraM = Number(p.hra || 0) || Math.round(basicM * 0.5);
  const specM = Number(p.specialAllowance || 0) || Math.max(0, grossM - basicM - hraM);
  const regime: "OLD" | "NEW" = p.taxRegimeUsed === "old" ? "OLD" : "NEW";

  // F9: derive the FY joining month from the join date and the payslip's own month/year —
  // the SAME derivation the run uses (payroll-cycle.ts). A start on/before 1 April of the
  // row's FY, or no context, ⇒ joiningFyMonth 1 (full year), byte-identical to the legacy
  // ×12 projection. Only genuine mid-FY joiners (May–Dec) get a shorter span.
  let joiningFyMonth = 1;
  const startRaw = employee?.startDate;
  if (startRaw) {
    const join = startRaw instanceof Date ? startRaw : new Date(startRaw);
    const fyStartYear = p.month >= 4 ? p.year : p.year - 1;
    const fyStartDate = new Date(fyStartYear, 3, 1); // 1 April of the row's FY
    if (!Number.isNaN(join.getTime()) && join > fyStartDate) {
      const cm = join.getMonth() + 1;
      joiningFyMonth = Math.min(12, Math.max(1, cm >= 4 ? cm - 3 : cm + 9));
    }
  }
  const spanMonths = 13 - joiningFyMonth; // join → March inclusive; joiningFyMonth 1 ⇒ 12

  const prevEmpIncome = Number(employee?.previousEmployerIncome ?? 0);
  const annualBasic = basicM * spanMonths;
  const annualHra = hraM * spanMonths;
  // F9/F10: the real s.10(13A) HRA exemption on the join-aware annual basis (old regime
  // only). Previously hardcoded 0, which OVER-stated the printed taxable income and annual
  // liability. `computeHRAExemption` returns 0 when rent or HRA is 0, so no-rent is unaffected.
  const hraExemption =
    regime === "OLD" && employee
      ? computeHRAExemption(annualBasic, annualHra, Number(employee.rentPaidAnnual ?? 0), isMetroCity(employee.city))
      : 0;

  const profile: EmployeeTaxProfile = {
    regime,
    // F9: project actual FY earnings (span months), plus prior-employer income (Form 12B),
    // and pass joiningMonth 1 so computeTax uses this figure directly (no gross-only scaling).
    annualCTC: Math.max(grossM * spanMonths + prevEmpIncome, 1),
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
    hraExemption,
    otherExemptions: 0,
    employeePFMonthly: Number(p.pfEmployee || 0),
    employerPFMonthly: Number(p.pfEmployer || 0),
    professionalTax: Number(p.professionalTax || 0) * 12,
    joiningMonth: 1,
    monthsInFY: 12,
    previousEmployerIncome: prevEmpIncome,
    previousEmployerTDS: Number(employee?.previousEmployerTds ?? 0),
  };
  const t = computeTax(profile);
  return {
    regime,
    taxableIncome: t.taxableIncome,
    totalTaxLiability: t.totalTaxLiability,
    monthlyTDS: t.monthlyTDS,
  };
}
