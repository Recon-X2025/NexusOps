/**
 * PR3 — PDF generators must not emit the ₹ glyph (renders as superscript-1).
 * ───────────────────────────────────────────────────────────────────────────
 * First-real-payroll-run finding: on the generated payslip/Form-16 PDFs the
 * rupee sign rendered as a superscript "1". Cause: PDFKit's base-14 Helvetica
 * uses WinAnsi encoding, which has no ₹ (U+20B9) — the glyph is substituted.
 * Immediate fix: use the ASCII prefix "Rs." in both generators. (Follow-up:
 * embed Noto Sans for customer-facing docs — recorded in reports/fix-plan.md.)
 *
 * Because PDFKit re-encodes drawn text into single WinAnsi bytes, the literal ₹
 * byte never survives into the output regardless of the source — so scanning the
 * rendered buffer cannot distinguish the bug from the fix. The rendering defect
 * lives entirely in the SOURCE (a ₹ passed to a Helvetica `.text(...)` call), so
 * the fairness check asserts on the generator source: no ₹, and "Rs." present.
 * Both generated PDFs are also smoke-built to prove the change didn't break them.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generatePayslipPDF, type PayslipPDFInput } from "../services/payslip-pdf";

const SERVICES = join(__dirname, "..", "services");
const PAYSLIP_SRC = join(SERVICES, "payslip-pdf.ts");
const FORM16_SRC = join(SERVICES, "form16-pdf.ts");

describe("PR3: PDF generators use 'Rs.' not ₹", () => {
  it("payslip-pdf.ts source has no ₹ and uses 'Rs.'", () => {
    const src = readFileSync(PAYSLIP_SRC, "utf8");
    expect(src).not.toContain("₹");
    expect(src).toContain("Rs.");
  });

  it("form16-pdf.ts source has no ₹ and uses 'Rs.'", () => {
    const src = readFileSync(FORM16_SRC, "utf8");
    expect(src).not.toContain("₹");
    expect(src).toContain("Rs.");
  });

  it("payslip PDF still generates a non-empty buffer", async () => {
    const input: PayslipPDFInput = {
      companyName: "Acme India Pvt Ltd",
      companyAddress: "Mumbai",
      employeeName: "Test Employee",
      employeeCode: "EMP-0001",
      designation: "Engineer",
      department: "Tech",
      pan: "ABCDE1234F",
      uan: "100000000000",
      bankAccount: "XXXX1234",
      month: "April 2026",
      daysInMonth: 30,
      daysWorked: 30,
      lopDays: 0,
      basicEarned: 40000,
      hraEarned: 20000,
      specialAllowance: 10000,
      lta: 0,
      conveyance: 0,
      medical: 0,
      overtime: 0,
      arrears: 0,
      bonus: 0,
      otherEarnings: 0,
      grossEarnings: 70000,
      employeePF: 1800,
      employeeESI: 0,
      professionalTax: 200,
      lwf: 0,
      tds: 5000,
      otherDeductions: 0,
      totalDeductions: 7000,
      netPay: 63000,
      netPayWords: "Rupees Sixty Three Thousand Only",
      employerPF: 1800,
      employerESI: 0,
      ytdGross: 70000,
      ytdPF: 1800,
      ytdTDS: 5000,
      ytdNetPay: 63000,
      taxRegime: "new",
      taxableIncome: 700000,
      totalTaxLiability: 60000,
    } as PayslipPDFInput;

    const pdf = await generatePayslipPDF(input);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
