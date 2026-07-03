/**
 * Invariant: creating an invoice posts a balanced GL journal entry.
 *
 * Invoices and the general ledger (`chartOfAccounts.currentBalance`) were
 * historically decoupled — creating an invoice inserted a row into `invoices`
 * but never touched the GL, so balance-based dashboards (burn rate, cash
 * runway, AP/AR aging) read a store no write path populated. `createInvoice`
 * and `createReceivableInvoice` now post a balanced double-entry from the
 * invoice's own GST columns, atomically with the insert.
 *
 * These tests assert, per invoice flow and per intra/inter-state split, that:
 *   - a posted `type: "invoice"` journal entry exists for the invoice,
 *   - its lines are balanced (Σdebit = Σcredit = gross total),
 *   - the correct COA accounts moved by the correct signed amounts.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { financialRouter } from "../routers/financial";
import { accountingRouter } from "../routers/accounting";
import {
  invoices,
  vendors,
  gstinRegistry,
  chartOfAccounts,
  journalEntries,
  journalEntryLines,
  eq,
  and,
} from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("Invoice → GL journal posting invariant", () => {
  let financial: any;
  let accounting: any;
  let orgId: string;
  let adminId: string;

  async function seedOrgGstin(stateName: string): Promise<void> {
    await testDb().insert(gstinRegistry).values({
      orgId,
      gstin: `27${nanoid(6).toUpperCase()}0A1Z5`,
      legalName: "Test Org Pvt Ltd",
      stateCode: "27",
      stateName,
      isPrimary: true,
      isActive: true,
    });
  }

  async function seedVendor(state: string | null): Promise<string> {
    const [v] = await testDb()
      .insert(vendors)
      .values({ orgId, name: `Vendor ${nanoid(4)}`, state, gstin: "27ZZZZZ0000Z1Z5" })
      .returning();
    return v!.id;
  }

  async function balanceOf(code: string): Promise<number> {
    const [row] = await testDb()
      .select({ b: chartOfAccounts.currentBalance })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.orgId, orgId), eq(chartOfAccounts.code, code)));
    return Number(row?.b ?? 0);
  }

  /** The posted journal entry for an invoice number, with its lines keyed by COA code. */
  async function ledgerFor(invoiceNumber: string) {
    const [je] = await testDb()
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.reference, invoiceNumber)));
    const rawLines = await testDb()
      .select({
        debit: journalEntryLines.debitAmount,
        credit: journalEntryLines.creditAmount,
        code: chartOfAccounts.code,
      })
      .from(journalEntryLines)
      .innerJoin(chartOfAccounts, eq(journalEntryLines.accountId, chartOfAccounts.id))
      .where(eq(journalEntryLines.journalEntryId, je!.id));
    const byCode = new Map<string, { debit: number; credit: number }>();
    for (const l of rawLines) {
      byCode.set(l.code, { debit: Number(l.debit), credit: Number(l.credit) });
    }
    return { je, byCode };
  }

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
    const ctx = createMockContext(adminId, orgId);
    financial = financialRouter.createCaller(ctx);
    accounting = accountingRouter.createCaller(ctx);
    await accounting.coa.seed();
  });

  it("posts a balanced AP entry (intra-state: Dr expense + CGST/SGST ITC, Cr AP)", async () => {
    await seedOrgGstin("Maharashtra");
    const vendorId = await seedVendor("Maharashtra");

    const ap2110Before = await balanceOf("2110");
    const exp5000Before = await balanceOf("5000");

    const number = `AP-${nanoid(6)}`;
    await financial.createInvoice({ vendorId, invoiceNumber: number, amount: "200000", gstRate: 18 });

    const { je, byCode } = await ledgerFor(number);
    expect(je?.type).toBe("invoice");
    expect(je?.status).toBe("posted");
    // Gross = 2,36,000; taxable 2,00,000; CGST 18,000; SGST 18,000; IGST 0.
    expect(Number(je?.totalDebit)).toBeCloseTo(236_000, 3);
    expect(Number(je?.totalCredit)).toBeCloseTo(236_000, 3);
    expect(byCode.get("5000")).toEqual({ debit: 200_000, credit: 0 }); // expense (net)
    expect(byCode.get("1142")).toEqual({ debit: 18_000, credit: 0 }); // CGST ITC
    expect(byCode.get("1143")).toEqual({ debit: 18_000, credit: 0 }); // SGST ITC
    expect(byCode.get("2110")).toEqual({ debit: 0, credit: 236_000 }); // accounts payable
    expect(byCode.has("1141")).toBe(false); // no IGST line intra-state

    // Balances moved by net = debit − credit.
    expect(await balanceOf("2110")).toBeCloseTo(ap2110Before - 236_000, 3);
    expect(await balanceOf("5000")).toBeCloseTo(exp5000Before + 200_000, 3);
  });

  it("posts a balanced AP entry (inter-state: Dr expense + IGST ITC, Cr AP)", async () => {
    await seedOrgGstin("Maharashtra");
    const vendorId = await seedVendor("Karnataka");

    const number = `AP-${nanoid(6)}`;
    await financial.createInvoice({ vendorId, invoiceNumber: number, amount: "100000", gstRate: 18 });

    const { byCode } = await ledgerFor(number);
    // Gross 1,18,000; IGST 18,000.
    expect(byCode.get("5000")).toEqual({ debit: 100_000, credit: 0 });
    expect(byCode.get("1141")).toEqual({ debit: 18_000, credit: 0 }); // IGST ITC
    expect(byCode.get("2110")).toEqual({ debit: 0, credit: 118_000 });
    expect(byCode.has("1142")).toBe(false);
    expect(byCode.has("1143")).toBe(false);
  });

  it("posts a balanced AR entry (inter-state: Dr AR, Cr revenue + IGST payable)", async () => {
    await seedOrgGstin("Maharashtra");
    const customerId = await seedVendor("Karnataka");

    const ar1130Before = await balanceOf("1130");
    const rev4100Before = await balanceOf("4100");

    const number = `AR-${nanoid(6)}`;
    await financial.createReceivableInvoice({
      customerVendorId: customerId,
      invoiceNumber: number,
      amount: "50000",
      gstRate: 12,
    });

    const { je, byCode } = await ledgerFor(number);
    expect(je?.type).toBe("invoice");
    // Gross 56,000; taxable 50,000; IGST 6,000.
    expect(Number(je?.totalDebit)).toBeCloseTo(56_000, 3);
    expect(byCode.get("1130")).toEqual({ debit: 56_000, credit: 0 }); // accounts receivable
    expect(byCode.get("4100")).toEqual({ debit: 0, credit: 50_000 }); // revenue (net)
    expect(byCode.get("2121")).toEqual({ debit: 0, credit: 6_000 }); // IGST payable

    expect(await balanceOf("1130")).toBeCloseTo(ar1130Before + 56_000, 3);
    expect(await balanceOf("4100")).toBeCloseTo(rev4100Before - 50_000, 3);
  });

  it("posts a balanced AR entry (intra-state: Cr revenue + CGST/SGST payable)", async () => {
    await seedOrgGstin("Maharashtra");
    const customerId = await seedVendor("Maharashtra");

    const number = `AR-${nanoid(6)}`;
    await financial.createReceivableInvoice({
      customerVendorId: customerId,
      invoiceNumber: number,
      amount: "100000",
      gstRate: 18,
    });

    const { byCode } = await ledgerFor(number);
    // Gross 1,18,000; CGST 9,000; SGST 9,000.
    expect(byCode.get("1130")).toEqual({ debit: 118_000, credit: 0 });
    expect(byCode.get("4100")).toEqual({ debit: 0, credit: 100_000 });
    expect(byCode.get("2122")).toEqual({ debit: 0, credit: 9_000 }); // CGST payable
    expect(byCode.get("2123")).toEqual({ debit: 0, credit: 9_000 }); // SGST payable
    expect(byCode.has("2121")).toBe(false);
  });

  it("still creates the invoice and skips GL posting when COA is not seeded", async () => {
    // Fresh org WITHOUT coa.seed() — no standard accounts exist.
    const bare = await seedFullOrg();
    const bareCtx = createMockContext(bare.adminId, bare.orgId);
    const bareFinancial = financialRouter.createCaller(bareCtx);
    await testDb().insert(gstinRegistry).values({
      orgId: bare.orgId,
      gstin: `27${nanoid(6).toUpperCase()}0A1Z5`,
      legalName: "Bare Org",
      stateCode: "27",
      stateName: "Maharashtra",
      isPrimary: true,
      isActive: true,
    });
    const [v] = await testDb()
      .insert(vendors)
      .values({ orgId: bare.orgId, name: "Bare Vendor", state: "Maharashtra" })
      .returning();

    const number = `AP-${nanoid(6)}`;
    const inv = await bareFinancial.createInvoice({
      vendorId: v!.id,
      invoiceNumber: number,
      amount: "10000",
      gstRate: 18,
    });

    // Invoice persisted…
    const [row] = await testDb().select().from(invoices).where(eq(invoices.id, inv.id));
    expect(row).toBeTruthy();
    // …but no journal entry, because the required COA accounts weren't seeded.
    const jes = await testDb()
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.orgId, bare.orgId), eq(journalEntries.reference, number)));
    expect(jes.length).toBe(0);
  });
});
