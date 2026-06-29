/**
 * Money-path invariant tests — Phase 3, Stage C.
 *
 * These lock in the *financial correctness* invariants that must never silently
 * break. They complement (do not duplicate) the existing engine tests:
 *   - india-payroll-engine.test.ts  → tax slabs, rebate, PF/ESI/PT, full payslip
 *   - accounting_fix.test.ts         → journal happy-path create/post/ledger
 *
 * Added here:
 *   1. Journal — debits must equal credits (imbalanced entry is REJECTED).
 *   2. GST     — CGST+SGST (intra) vs IGST (inter) equivalence; parts sum to total.
 *   3. GST ITC — conservation: utilised + cash + remaining == original.
 *   4. Payroll — cross-level invariant: net = max(0, gross − totalDeductions),
 *                totalDeductions == sum of statutory + other components.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg } from "./helpers";
import { accountingRouter } from "../routers/accounting";
import { computeGST, computeITCUtilisation } from "../lib/india/gst-engine";
import { computeEmployeePayslip, type EmployeePayrollInput } from "../lib/payroll-cycle";

// ── 1. Journal balance invariant ─────────────────────────────────────────────

describe("Money invariant — Journal: debits must equal credits", () => {
  let caller: any;

  beforeEach(async () => {
    const { orgId, adminId } = await seedFullOrg();
    caller = accountingRouter.createCaller(createMockContext(adminId, orgId));
    await caller.coa.seed();
  });

  it("accepts a balanced entry (debit == credit)", async () => {
    const accounts = await caller.coa.list({});
    const cash = accounts.find((a: any) => a.code === "1110");
    const sales = accounts.find((a: any) => a.code === "4100");

    const je = await caller.journal.create({
      date: new Date(),
      description: "Balanced sale",
      lines: [
        { accountId: cash.id, debitAmount: 1000, creditAmount: 0 },
        { accountId: sales.id, debitAmount: 0, creditAmount: 1000 },
      ],
    });
    expect(Number(je.totalDebit)).toBe(Number(je.totalCredit));
  });

  it("rejects an unbalanced entry (debit != credit)", async () => {
    const accounts = await caller.coa.list({});
    const cash = accounts.find((a: any) => a.code === "1110");
    const sales = accounts.find((a: any) => a.code === "4100");

    await expect(
      caller.journal.create({
        date: new Date(),
        description: "Unbalanced sale",
        lines: [
          { accountId: cash.id, debitAmount: 1000, creditAmount: 0 },
          { accountId: sales.id, debitAmount: 0, creditAmount: 900 }, // 100 short
        ],
      }),
    ).rejects.toThrow(/not balanced/i);
  });
});

// ── 2. GST split invariant ───────────────────────────────────────────────────

describe("Money invariant — GST: intra-state CGST+SGST vs inter-state IGST", () => {
  const RATES = [0, 5, 12, 18, 28] as const;

  it("intra-state splits 50/50 into CGST + SGST, no IGST", () => {
    const r = computeGST({
      taxableValue: 10000,
      gstRate: 18,
      supplierState: "Karnataka",
      buyerState: "Karnataka",
    });
    expect(r.isInterstate).toBe(false);
    expect(r.igstAmount).toBe(0);
    expect(r.cgstAmount).toBe(r.sgstAmount);
    expect(r.cgstAmount + r.sgstAmount).toBe(r.totalTaxAmount);
  });

  it("inter-state charges IGST only, no CGST/SGST", () => {
    const r = computeGST({
      taxableValue: 10000,
      gstRate: 18,
      supplierState: "Karnataka",
      buyerState: "Maharashtra",
    });
    expect(r.isInterstate).toBe(true);
    expect(r.cgstAmount).toBe(0);
    expect(r.sgstAmount).toBe(0);
    expect(r.igstAmount).toBe(r.totalTaxAmount);
  });

  it("intra and inter total tax are equal for the same rate (CGST+SGST == IGST)", () => {
    for (const rate of RATES) {
      const intra = computeGST({ taxableValue: 10000, gstRate: rate, supplierState: "KA", buyerState: "KA" });
      const inter = computeGST({ taxableValue: 10000, gstRate: rate, supplierState: "KA", buyerState: "MH" });
      expect(intra.totalTaxAmount).toBe(inter.totalTaxAmount);
    }
  });

  it("invoiceTotal == taxableValue + totalTaxAmount for every rate", () => {
    for (const rate of RATES) {
      const r = computeGST({ taxableValue: 12345, gstRate: rate, supplierState: "KA", buyerState: "MH" });
      expect(r.invoiceTotal).toBe(r.taxableValue + r.totalTaxAmount);
    }
  });

  it("zero rate yields zero tax", () => {
    const r = computeGST({ taxableValue: 5000, gstRate: 0, supplierState: "KA", buyerState: "MH" });
    expect(r.totalTaxAmount).toBe(0);
    expect(r.invoiceTotal).toBe(5000);
  });
});

// ── 3. GST ITC utilisation conservation ──────────────────────────────────────

describe("Money invariant — GST ITC utilisation conserves credit", () => {
  it("utilised + cash deposited + remaining balance == original liability/balance", () => {
    const balance = { igst: 5000, cgst: 3000, sgst: 3000 };
    const liability = { igst: 4000, cgst: 4000, sgst: 4000 };

    const r = computeITCUtilisation(balance, liability);

    // Each liability bucket is fully covered: ITC paid into it + cash deposited == liability
    expect(r.igstPaid + r.cashToBeDepositedIgst).toBe(liability.igst);
    expect(r.cgstPaid + r.cashToBeDepositedCgst).toBe(liability.cgst);
    expect(r.sgstPaid + r.cashToBeDepositedSgst).toBe(liability.sgst);

    // Credit conservation: total ITC consumed + remaining == total original balance
    const totalOriginal = balance.igst + balance.cgst + balance.sgst;
    const totalRemaining = r.remainingBalance.igst + r.remainingBalance.cgst + r.remainingBalance.sgst;
    const totalPaid = r.igstPaid + r.cgstPaid + r.sgstPaid;
    expect(totalPaid + totalRemaining).toBe(totalOriginal);
  });

  it("CGST credit never offsets SGST liability (and vice versa)", () => {
    // Only CGST credit available, only SGST liability — cannot be offset, must be cash.
    const r = computeITCUtilisation(
      { igst: 0, cgst: 1000, sgst: 0 },
      { igst: 0, cgst: 0, sgst: 1000 },
    );
    expect(r.cashToBeDepositedSgst).toBe(1000); // SGST liability paid fully in cash
    expect(r.remainingBalance.cgst).toBe(1000); // CGST credit untouched
  });
});

// ── 4. Payroll net invariant across salary levels ────────────────────────────

describe("Money invariant — Payroll: net == max(0, gross − totalDeductions)", () => {
  function baseInput(overrides: Partial<EmployeePayrollInput> = {}): EmployeePayrollInput {
    return {
      id: "emp-x",
      name: "Invariant Employee",
      employeeCode: "NX-INV",
      pan: "ABCDE1234F",
      uan: "100123456789",
      designation: "Engineer",
      department: "Engineering",
      state: "Maharashtra",
      isMetro: true,
      joiningDate: new Date("2024-04-01"),
      basicMonthly: 50_000,
      hraMonthly: 20_000,
      specialAllowance: 20_000,
      ltaAnnual: 30_000,
      regime: "NEW",
      section80C: 0, section80D: 0, section80CCD1B: 0,
      section80TTA: 0, section24b: 0, hraExemption: 0,
      otherExemptions: 0, rentPaid: 0,
      daysInMonth: 30, daysWorked: 30, lopDays: 0,
      overtime: 0, arrears: 0, bonus: 0,
      otherEarnings: 0, otherDeductions: 0,
      isVoluntaryHigherPF: false,
      previousEmployerIncome: 0, previousEmployerTDS: 0,
      ytdGross: 0, ytdPF: 0, ytdTDS: 0, ytdNetPay: 0,
      month: 4, year: 2026,
      ...overrides,
    };
  }

  const levels = [
    { label: "low", basicMonthly: 12_000, hraMonthly: 5_000, specialAllowance: 3_000 },
    { label: "mid", basicMonthly: 50_000, hraMonthly: 20_000, specialAllowance: 20_000 },
    { label: "high", basicMonthly: 150_000, hraMonthly: 60_000, specialAllowance: 90_000 },
  ];

  for (const lvl of levels) {
    it(`holds at ${lvl.label} salary level`, () => {
      const p = computeEmployeePayslip(baseInput(lvl), 1);

      // Core invariant
      expect(p.netPay).toBe(Math.max(0, p.grossEarnings - p.totalDeductions));
      // Net never exceeds gross, never negative
      expect(p.netPay).toBeLessThanOrEqual(p.grossEarnings);
      expect(p.netPay).toBeGreaterThanOrEqual(0);
      // totalDeductions equals the sum of its individual deduction components.
      const summed =
        p.employeePF +
        p.employeeESI +
        p.professionalTax +
        p.lwf +
        p.tds +
        p.otherDeductions;
      expect(p.totalDeductions).toBe(summed);
    });
  }

  it("LOP reduces gross proportionally (fewer days worked → lower gross)", () => {
    const full = computeEmployeePayslip(baseInput({ daysWorked: 30, lopDays: 0 }), 1);
    const withLop = computeEmployeePayslip(baseInput({ daysWorked: 25, lopDays: 5 }), 1);
    expect(withLop.grossEarnings).toBeLessThan(full.grossEarnings);
  });
});
