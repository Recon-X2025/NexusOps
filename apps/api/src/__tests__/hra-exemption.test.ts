/**
 * MED6 — HRA exemption (§10(13A)) flows into Form 16.
 *
 * Form 16 hardcoded the HRA exemption to 0 while the payslip engine already
 * applied it from employee.rentPaidAnnual + isMetroCity, so the certificate
 * overstated taxable income vs the TDS. buildForm16Input now uses the SAME
 * computeHRAExemption the payslip uses, sourced from the employee row.
 */
import { describe, it, expect } from "vitest";
import { buildForm16Input } from "../lib/india/form16-aggregator";

// One annual "slip" — the aggregator sums, so a single row of annual figures works.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const slips: any = [{ grossEarnings: "1200000", basic: "600000", da: "0", hra: "300000", lta: "0", specialAllowance: "300000", professionalTax: "0", pfEmployee: "0" }];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const org: any = { name: "Org", settings: {} };
const build = (rentPaidAnnual: string, isMetroCity: boolean, taxRegime = "old") =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildForm16Input({ org, employee: { taxRegime, rentPaidAnnual, isMetroCity } as any, fySlips: slips, financialYear: "2025-2026" });

describe("Form 16 HRA exemption (MED6)", () => {
  it("no rent declared on the employee → HRA exemption is 0", () => {
    expect(build("0", true).lessHraExempt).toBe(0);
  });

  it("rent + metro → §10(13A) min-of-three", () => {
    // basic 600000, HRA 300000, rent 300000, metro → min(300000, 300000−60000=240000, 300000)=240000.
    const out = build("300000", true);
    expect(out.lessHraExempt).toBe(240000);
    expect(out.netSalary).toBe(1200000 - 240000); // gross − exemptions (lta 0)
  });

  it("non-metro uses the 40% cap", () => {
    // non-metro cap = 40% × 600000 = 240000 → min(300000, 440000, 240000) = 240000.
    expect(build("500000", false).lessHraExempt).toBe(240000);
  });

  it("rent below 10% of basic → nothing exempt", () => {
    // rent 50000 − 10% × 600000 (60000) < 0 → 0.
    expect(build("50000", true).lessHraExempt).toBe(0);
  });

  it("new regime grants nothing even with declared rent", () => {
    expect(build("300000", true, "new").lessHraExempt).toBe(0);
  });
});
