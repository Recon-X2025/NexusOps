/**
 * AP/AR control-account reconciliation invariants.
 *
 * These lock in the ledger↔subledger tie-out that the invoice lifecycle must
 * preserve. The invoice table is the AP/AR subledger; the chart-of-accounts
 * control accounts (2110 Accounts Payable, 1130 Accounts Receivable) are the
 * GL. Every economic mutation on an invoice must post a balanced journal entry
 * so the two never drift.
 *
 *   1. Creating invoices moves the control account by exactly the gross total,
 *      and Σ(open invoices) == control-account balance.
 *   2. Paying an invoice (markPaid) relieves the control account back toward
 *      zero and moves the same money into bank/cash — control returns to 0 when
 *      all invoices are settled.
 *   3. backfillInvoiceGst reverses the stale entry and re-posts at the new
 *      figures, so the control account tracks the rewritten amount (no drift).
 *
 * Mirrors money-invariants.test.ts: seed a fresh org, seed the India COA via
 * accounting.coa.seed(), drive everything through the real routers.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { nanoid } from "nanoid";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { accountingRouter } from "../routers/accounting";
import { financialRouter } from "../routers/financial";
import { vendors, chartOfAccounts, eq, and } from "@coheronconnect/db";

const TOL = 0.01;

async function coaBalance(orgId: string, code: string): Promise<number> {
  const db = testDb();
  const [row] = await db
    .select({ currentBalance: chartOfAccounts.currentBalance })
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.orgId, orgId), eq(chartOfAccounts.code, code)));
  return Number(row?.currentBalance ?? 0);
}

async function seedCounterparty(orgId: string): Promise<string> {
  const db = testDb();
  // State left null: with no gstinRegistry row the org state is unknown too, so
  // the supply defaults to intra-state. The split (CGST/SGST vs IGST) is
  // irrelevant to reconciliation — only the gross total and control balances are.
  const [v] = await db
    .insert(vendors)
    .values({ orgId, name: `CP ${nanoid(5)}` })
    .returning();
  return v!.id;
}

describe("AP/AR reconciliation — control account ties out to the invoice subledger", () => {
  let orgId: string;
  let adminId: string;
  let acc: any;
  let fin: any;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId!;
    acc = accountingRouter.createCaller(createMockContext(adminId, orgId));
    fin = financialRouter.createCaller(createMockContext(adminId, orgId));
    await acc.coa.seed();
  });

  it("payable invoice creation raises AP by the gross total", async () => {
    const before = await coaBalance(orgId, "2110");
    const vendorId = await seedCounterparty(orgId);
    const inv = await fin.createInvoice({
      vendorId,
      invoiceNumber: `AP-${nanoid(5)}`,
      amount: "10000",
      gstRate: 18,
    });
    const after = await coaBalance(orgId, "2110");
    // AP is a credit-normal liability; currentBalance moves by -(gross) under the
    // debit-positive convention used by postInvoiceJournalEntry.
    expect(Math.abs(after - before - -Number(inv.amount))).toBeLessThan(TOL);
    // Gross = taxable + 18% → 11,800.
    expect(Number(inv.amount)).toBeCloseTo(11800, 2);
  });

  it("Σ open payable invoices ties out to the AP control balance", async () => {
    const vendorId = await seedCounterparty(orgId);
    let subledger = 0;
    for (const amt of ["10000", "25000", "4200"]) {
      const inv = await fin.createInvoice({
        vendorId,
        invoiceNumber: `AP-${nanoid(6)}`,
        amount: amt,
        gstRate: 18,
      });
      subledger += Number(inv.amount);
    }
    // AP control balance magnitude == sum of open payable gross totals.
    const ap = await coaBalance(orgId, "2110");
    expect(Math.abs(Math.abs(ap) - subledger)).toBeLessThan(TOL);
  });

  it("Σ open receivable invoices ties out to the AR control balance", async () => {
    const customerId = await seedCounterparty(orgId);
    let subledger = 0;
    for (const amt of ["50000", "12500"]) {
      const inv = await fin.createReceivableInvoice({
        customerVendorId: customerId,
        invoiceNumber: `AR-${nanoid(6)}`,
        amount: amt,
        gstRate: 18,
      });
      subledger += Number(inv.amount);
    }
    // AR is a debit-normal asset → currentBalance is positive.
    const ar = await coaBalance(orgId, "1130");
    expect(Math.abs(ar - subledger)).toBeLessThan(TOL);
  });

  it("paying a payable invoice relieves AP and drains cash (control returns to 0)", async () => {
    const vendorId = await seedCounterparty(orgId);
    const inv = await fin.createInvoice({
      vendorId,
      invoiceNumber: `AP-${nanoid(6)}`,
      amount: "10000",
      gstRate: 18,
    });
    const apAfterCreate = await coaBalance(orgId, "2110");
    const bankBefore = await coaBalance(orgId, "1120");
    expect(Math.abs(apAfterCreate)).toBeCloseTo(Number(inv.amount), 2);

    await fin.markPaid({ id: inv.id });

    const apAfterPay = await coaBalance(orgId, "2110");
    const bankAfter = await coaBalance(orgId, "1120");
    // AP fully relieved.
    expect(Math.abs(apAfterPay)).toBeLessThan(TOL);
    // Cash/bank fell by the gross total.
    expect(Math.abs(bankBefore - bankAfter - Number(inv.amount))).toBeLessThan(TOL);
  });

  it("paying a receivable invoice relieves AR and raises cash (control returns to 0)", async () => {
    const customerId = await seedCounterparty(orgId);
    const inv = await fin.createReceivableInvoice({
      customerVendorId: customerId,
      invoiceNumber: `AR-${nanoid(6)}`,
      amount: "20000",
      gstRate: 18,
    });
    const arAfterCreate = await coaBalance(orgId, "1130");
    const bankBefore = await coaBalance(orgId, "1120");
    expect(arAfterCreate).toBeCloseTo(Number(inv.amount), 2);

    await fin.markPaid({ id: inv.id });

    const arAfterPay = await coaBalance(orgId, "1130");
    const bankAfter = await coaBalance(orgId, "1120");
    expect(Math.abs(arAfterPay)).toBeLessThan(TOL);
    expect(bankAfter - bankBefore).toBeCloseTo(Number(inv.amount), 2);
  });

  it("markPaid is idempotent — a second call posts no second settlement", async () => {
    const vendorId = await seedCounterparty(orgId);
    const inv = await fin.createInvoice({
      vendorId,
      invoiceNumber: `AP-${nanoid(6)}`,
      amount: "10000",
      gstRate: 18,
    });
    await fin.markPaid({ id: inv.id });
    const bankOnce = await coaBalance(orgId, "1120");
    await fin.markPaid({ id: inv.id });
    const bankTwice = await coaBalance(orgId, "1120");
    // The settlement guard prevents double-relieving cash.
    expect(Math.abs(bankOnce - bankTwice)).toBeLessThan(TOL);
    expect(Math.abs(await coaBalance(orgId, "2110"))).toBeLessThan(TOL);
  });

  it("backfillInvoiceGst reposts the ledger so AP tracks the rewritten amount (no drift)", async () => {
    // Create a zero-tax payable (0% GST) → gross == taxable, JE posted at that amount.
    const vendorId = await seedCounterparty(orgId);
    const inv = await fin.createInvoice({
      vendorId,
      invoiceNumber: `AP-${nanoid(6)}`,
      amount: "10000",
      gstRate: 0,
    });
    expect(Number(inv.totalTaxAmount)).toBe(0);
    const apBefore = await coaBalance(orgId, "2110");
    expect(Math.abs(apBefore)).toBeCloseTo(10000, 2);

    // Backfill 18% GST — this rewrites amount to 11,800 and must repost the JE.
    await fin.backfillInvoiceGst({ gstRate: 18, invoiceId: inv.id });

    const apAfter = await coaBalance(orgId, "2110");
    // AP now reflects the new gross (11,800), not a stale 10,000 or a doubled 21,800.
    expect(Math.abs(Math.abs(apAfter) - 11800)).toBeLessThan(TOL);
  });
});
