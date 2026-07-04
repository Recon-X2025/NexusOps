/**
 * Bulk invoice ingest (`ingest.importInvoices`) posts GST + GL, like createInvoice.
 *
 * The bulk path used to write invoices with zero tax and no journal entry, so
 * GL-balance dashboards (AP aging, burn rate) drifted from the AP/AR subledger.
 * It now derives GST from the imported `amount` (treated as the taxable value)
 * and posts a balanced payable journal entry inside the same transaction, so the
 * 2110 Accounts Payable control account ties out to the imported invoices.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { nanoid } from "nanoid";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { accountingRouter } from "../routers/accounting";
import { ingestRouter } from "../routers/ingest";
import { vendors, invoices, chartOfAccounts, eq, and } from "@coheronconnect/db";

const TOL = 0.01;

async function coaBalance(orgId: string, code: string): Promise<number> {
  const db = testDb();
  const [row] = await db
    .select({ currentBalance: chartOfAccounts.currentBalance })
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.orgId, orgId), eq(chartOfAccounts.code, code)));
  return Number(row?.currentBalance ?? 0);
}

async function seedVendor(orgId: string): Promise<string> {
  const db = testDb();
  const [v] = await db.insert(vendors).values({ orgId, name: `V ${nanoid(5)}` }).returning();
  return v!.id;
}

describe("ingest.importInvoices — GST + GL posting", () => {
  let orgId: string;
  let adminId: string;
  let acc: any;
  let ingest: any;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId!;
    acc = accountingRouter.createCaller(createMockContext(adminId, orgId));
    ingest = ingestRouter.createCaller(createMockContext(adminId, orgId));
    await acc.coa.seed();
  });

  it("raises AP (2110) by the gross total and stores GST on the invoice", async () => {
    const vendorId = await seedVendor(orgId);
    const before = await coaBalance(orgId, "2110");

    const res = await ingest.importInvoices([
      { invoiceNumber: `IMP-${nanoid(6)}`, vendorId, amount: "10000", gstRate: 18 },
    ]);
    expect(res.imported).toBe(1);

    // AP control moved by the gross total (10,000 taxable + 1,800 GST = 11,800).
    const after = await coaBalance(orgId, "2110");
    expect(Math.abs(after - before - -11800)).toBeLessThan(TOL);

    // The invoice row itself carries the derived GST (was zero-tax before).
    const [row] = await testDb()
      .select({
        amount: invoices.amount,
        taxableValue: invoices.taxableValue,
        totalTaxAmount: invoices.totalTaxAmount,
      })
      .from(invoices)
      .where(eq(invoices.id, res.ids[0]));
    expect(Number(row!.amount)).toBeCloseTo(11800, 2);
    expect(Number(row!.taxableValue)).toBeCloseTo(10000, 2);
    expect(Number(row!.totalTaxAmount)).toBeCloseTo(1800, 2);
  });

  it("defaults gstRate to 18% when omitted", async () => {
    const vendorId = await seedVendor(orgId);
    const before = await coaBalance(orgId, "2110");
    const res = await ingest.importInvoices([
      { invoiceNumber: `IMP-${nanoid(6)}`, vendorId, amount: "10000" },
    ]);
    expect(res.imported).toBe(1);
    const after = await coaBalance(orgId, "2110");
    expect(Math.abs(after - before - -11800)).toBeLessThan(TOL);
  });

  it("zero-rated import posts a balanced JE with no tax (AP = taxable value)", async () => {
    const vendorId = await seedVendor(orgId);
    const before = await coaBalance(orgId, "2110");
    const res = await ingest.importInvoices([
      { invoiceNumber: `IMP-${nanoid(6)}`, vendorId, amount: "5000", gstRate: 0 },
    ]);
    expect(res.imported).toBe(1);
    const after = await coaBalance(orgId, "2110");
    expect(Math.abs(after - before - -5000)).toBeLessThan(TOL);
  });

  it("skips duplicates and unknown vendors without posting a JE", async () => {
    const vendorId = await seedVendor(orgId);
    const invoiceNumber = `IMP-${nanoid(6)}`;
    await ingest.importInvoices([{ invoiceNumber, vendorId, amount: "10000", gstRate: 18 }]);
    const apAfterFirst = await coaBalance(orgId, "2110");

    const res = await ingest.importInvoices([
      { invoiceNumber, vendorId, amount: "10000", gstRate: 18 }, // duplicate
      { invoiceNumber: `IMP-${nanoid(6)}`, vendorId: "00000000-0000-0000-0000-000000000000", amount: "999", gstRate: 18 },
    ]);
    expect(res.imported).toBe(0);
    expect(res.skipped).toHaveLength(2);

    // Control account unchanged by the skipped rows.
    const apAfter = await coaBalance(orgId, "2110");
    expect(Math.abs(apAfter - apAfterFirst)).toBeLessThan(TOL);
  });

  it("total open payables == AP control after a multi-row import (tie-out)", async () => {
    const vendorId = await seedVendor(orgId);
    await ingest.importInvoices([
      { invoiceNumber: `IMP-${nanoid(6)}`, vendorId, amount: "10000", gstRate: 18 },
      { invoiceNumber: `IMP-${nanoid(6)}`, vendorId, amount: "20000", gstRate: 18 },
    ]);

    const rows = await testDb()
      .select({ amount: invoices.amount })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.invoiceFlow, "payable")));
    const subledger = rows.reduce((s: number, r: { amount: string | null }) => s + Number(r.amount ?? 0), 0);

    const ap = await coaBalance(orgId, "2110");
    // AP is credit-normal → stored negative in the debit-positive balance model.
    expect(Math.abs(-ap - subledger)).toBeLessThan(TOL);
  });
});
