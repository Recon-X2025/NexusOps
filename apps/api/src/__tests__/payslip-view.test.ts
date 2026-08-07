/**
 * C6 — shared payslip view: reconciliation, identity, attendance, cross-renderer consistency.
 * ─────────────────────────────────────────────────────────────────────────────
 * The headline defect C6 fixes is a payslip that contradicts itself: ESI was computed and
 * stored, the printed TOTAL included it, but both renderers hardcoded the ESI line to 0 — so
 * an ESI employee's itemised deductions did not sum to their own total. These tests assert the
 * lines RECONCILE to the total, that tenant identity renders from stored values (not "—"), that
 * attendance renders from the stored columns, and that the two renderers agree field-for-field.
 */

import { describe, it, expect } from "vitest";
import type { payslips } from "@coheronconnect/db";
import {
  buildPayslipView,
  payslipViewToPdfInput,
  payslipViewToPortalRow,
  sumItemisedDeductions,
  type PayslipIdentityInput,
} from "../lib/payslip-view";

// A full payslips row as the run writes it. Deductions are internally consistent:
// total = pf + esi + pt + lwf + tds (+ other 0), exactly as computeEmployeePayslip stores them.
function makeSlip(overrides: Partial<typeof payslips.$inferSelect> = {}): typeof payslips.$inferSelect {
  const base = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    orgId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    employeeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    payrollRunId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    month: 4,
    year: 2026,
    paidDays: "30",
    lopDays: "0",
    basic: "26000",
    hra: "13000",
    specialAllowance: "26000",
    lta: "0",
    medicalAllowance: "0",
    conveyanceAllowance: "0",
    bonus: "0",
    grossEarnings: "65000",
    pfEmployee: "1800",
    pfEmployer: "1800",
    esiEmployee: "0",
    esiEmployer: "0",
    professionalTax: "200",
    lwf: "0",
    tds: "5000",
    totalDeductions: "7000",
    netPay: "58000",
    ytdGross: "65000",
    ytdTds: "5000",
    ytdNet: "58000",
    ytdPf: "1800",
    taxRegimeUsed: "new" as const,
    pdfUrl: null,
    retainUntilDate: null,
    createdAt: new Date("2026-04-30T00:00:00Z"),
  };
  return { ...base, ...overrides } as typeof payslips.$inferSelect;
}

const identity: PayslipIdentityInput = {
  org: {
    name: "Coheron Technologies Pvt Ltd",
    city: "Bengaluru",
    state: "Karnataka",
    tan: "BLRC12345A",
    epfCode: "KA/BNG/12345/000/0001",
    esiEstablishmentNumber: "12000123450000999",
  },
  legalEntity: { cin: "U74999KA2020PTC123456" },
  employee: {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    employeeId: "EMP-0001",
    title: "Engineer",
    department: "Engineering",
    pan: "ABCDE1234F",
    uan: "100200300400",
    esiIpNumber: "3100123456",
    bankAccountNumber: "1234567890123456",
  },
  userName: "Asha Rao",
  decryptedPan: "ABCDE1234F",
};

// An ESI-eligible employee (gross ≤ ₹21,000): ESI is deducted and included in the total.
// pf 900 + esi 157 + pt 175 + tds 0 = 1232.
function esiEligibleSlip() {
  return makeSlip({
    basic: "10000", hra: "5000", specialAllowance: "6000", grossEarnings: "21000",
    pfEmployee: "900", pfEmployer: "900",
    esiEmployee: "157", esiEmployer: "682",
    professionalTax: "175", tds: "0", lwf: "0",
    totalDeductions: "1232", netPay: "19768",
  });
}

describe("ESI reconciliation — the headline defect", () => {
  it("an ESI employee's itemised deduction lines SUM TO the printed total", () => {
    const view = buildPayslipView({ slip: esiEligibleSlip(), identity });
    // The view reconciles...
    expect(view.deductions.employeeESI).toBe(157);
    expect(sumItemisedDeductions(view)).toBeCloseTo(view.deductions.total, 2);
    expect(view.deductions.total).toBe(1232);

    // ...and so does the rendered PDF input: the six lines add up to totalDeductions.
    const pdf = payslipViewToPdfInput(view, { taxableIncome: 0, totalTaxLiability: 0 });
    const lineSum =
      pdf.employeePF + pdf.employeeESI + pdf.professionalTax + pdf.lwf + pdf.tds + pdf.otherDeductions;
    expect(lineSum).toBeCloseTo(pdf.totalDeductions, 2);
    expect(pdf.employeeESI).toBe(157); // not hardcoded 0
  });

  it("employer ESI appears in the employer-contribution figure", () => {
    const view = buildPayslipView({ slip: esiEligibleSlip(), identity });
    const pdf = payslipViewToPdfInput(view, { taxableIncome: 0, totalTaxLiability: 0 });
    expect(pdf.employerESI).toBe(682); // not hardcoded 0
    expect(view.employer.esi).toBe(682);
  });

  it("a non-ESI employee shows ₹0 ESI and still reconciles", () => {
    const view = buildPayslipView({ slip: makeSlip(), identity }); // esi 0, total 7000
    expect(view.deductions.employeeESI).toBe(0);
    expect(sumItemisedDeductions(view)).toBeCloseTo(view.deductions.total, 2);
    expect(view.deductions.total).toBe(7000);
  });
});

describe("tenant identity renders from stored values, not '—'", () => {
  it("TAN, EPF code, CIN and the ESI establishment number come through", () => {
    const pdf = payslipViewToPdfInput(
      buildPayslipView({ slip: makeSlip(), identity }),
      { taxableIncome: 0, totalTaxLiability: 0 },
    );
    expect(pdf.tanNumber).toBe("BLRC12345A");
    expect(pdf.pfEstablishmentCode).toBe("KA/BNG/12345/000/0001");
    expect(pdf.cin).toBe("U74999KA2020PTC123456");
    expect(pdf.esiEstablishmentNumber).toBe("12000123450000999");
    expect(pdf.companyName).toBe("Coheron Technologies Pvt Ltd");
    expect(pdf.companyAddress).toBe("Bengaluru, Karnataka"); // B17: city/state today
  });

  it("falls back to '—' when an identity field is absent", () => {
    const bare: PayslipIdentityInput = {
      ...identity,
      org: { name: "X", city: null, state: null, tan: null, epfCode: null, esiEstablishmentNumber: null },
      legalEntity: null,
    };
    const pdf = payslipViewToPdfInput(
      buildPayslipView({ slip: makeSlip(), identity: bare }),
      { taxableIncome: 0, totalTaxLiability: 0 },
    );
    expect(pdf.tanNumber).toBe("—");
    expect(pdf.cin).toBe("—");
    expect(pdf.esiEstablishmentNumber).toBe("—");
    expect(pdf.companyAddress).toBe("—");
  });
});

describe("employee ESI IP number renders alongside PAN/UAN", () => {
  it("is read from the employee record", () => {
    const pdf = payslipViewToPdfInput(
      buildPayslipView({ slip: makeSlip(), identity }),
      { taxableIncome: 0, totalTaxLiability: 0 },
    );
    expect(pdf.esiIpNumber).toBe("3100123456");
    expect(pdf.pan).toBe("ABCDE1234F");
    expect(pdf.uan).toBe("100200300400");
    expect(pdf.bankAccount).toBe("XXXX3456");
  });
});

describe("paid vs unpaid days render from the stored columns", () => {
  it("an employee with LOP shows real paid + LOP days in the PDF and portal, badge fires", () => {
    const slip = makeSlip({ paidDays: "27", lopDays: "3" });
    const view = buildPayslipView({ slip, identity });
    expect(view.period.daysWorked).toBe(27);
    expect(view.period.lopDays).toBe(3);

    const pdf = payslipViewToPdfInput(view, { taxableIncome: 0, totalTaxLiability: 0 });
    expect(pdf.daysWorked).toBe(27);
    expect(pdf.lopDays).toBe(3);

    const portal = payslipViewToPortalRow(view, { id: "x", taxComputation: null, pdfUrl: null });
    expect(portal.daysWorked).toBe(27);
    expect(portal.lopDays).toBe(3);
    expect(portal.lopDays > 0).toBe(true); // the portal LOP badge condition now fires
  });

  it("a full-attendance employee shows full paid days, zero LOP", () => {
    const view = buildPayslipView({ slip: makeSlip({ paidDays: "30", lopDays: "0" }), identity });
    expect(view.period.daysWorked).toBe(30);
    expect(view.period.lopDays).toBe(0);
  });
});

describe("the two renderers cannot drift — same view, same values", () => {
  it("PDF and portal agree on every shared amount + attendance field", () => {
    const view = buildPayslipView({ slip: esiEligibleSlip(), identity });
    const pdf = payslipViewToPdfInput(view, { taxableIncome: 0, totalTaxLiability: 0 });
    const portal = payslipViewToPortalRow(view, { id: "x", taxComputation: null, pdfUrl: null });

    expect(portal.employeeESI).toBe(pdf.employeeESI);
    expect(portal.employeePF).toBe(pdf.employeePF);
    expect(portal.professionalTax).toBe(pdf.professionalTax);
    expect(portal.lwf).toBe(pdf.lwf);
    expect(portal.tds).toBe(pdf.tds);
    expect(portal.grossEarnings).toBe(pdf.grossEarnings);
    expect(portal.totalDeductions).toBe(pdf.totalDeductions);
    expect(portal.netPay).toBe(pdf.netPay);
    expect(portal.lopDays).toBe(pdf.lopDays);
    expect(portal.daysWorked).toBe(pdf.daysWorked);
  });
});
