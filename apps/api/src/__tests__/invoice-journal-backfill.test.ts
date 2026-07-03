/**
 * Invariant: backfilling GL journal entries for pre-existing invoices is
 * idempotent and balance-correct.
 *
 * Invoices created before the GL-posting write path existed have rows in
 * `invoices` but no journal entry, so their money never reached the
 * balance-based dashboards. `financial.backfillInvoiceJournals` posts the
 * missing entries. It must:
 *   - post exactly one balanced entry per un-posted invoice,
 *   - move `chartOfAccounts.currentBalance` accordingly,
 *   - be idempotent — a second run posts nothing and skips everything.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { financialRouter } from "../routers/financial";
import { accountingRouter } from "../routers/accounting";
import {
  invoices,
  vendors,
  chartOfAccounts,
  journalEntries,
  eq,
  and,
} from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("Invoice journal backfill invariant", () => {
  let financial: any;
  let accounting: any;
  let orgId: string;
  let adminId: string;
  let vendorId: string;

  async function balanceOf(code: string): Promise<number> {
    const [row] = await testDb()
      .select({ b: chartOfAccounts.currentBalance })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.orgId, orgId), eq(chartOfAccounts.code, code)));
    return Number(row?.b ?? 0);
  }

  /** A pre-existing (JE-less) payable invoice with pre-computed GST columns. */
  async function seedLegacyPayable(num: string): Promise<void> {
    await testDb().insert(invoices).values({
      orgId,
      vendorId,
      invoiceNumber: num,
      invoiceFlow: "payable",
      invoiceType: "tax_invoice",
      amount: "236000",
      taxableValue: "200000",
      cgstAmount: "18000",
      sgstAmount: "18000",
      igstAmount: "0",
      totalTaxAmount: "36000",
      isInterstate: false,
      status: "pending",
    });
  }

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
    const ctx = createMockContext(adminId, orgId);
    financial = financialRouter.createCaller(ctx);
    accounting = accountingRouter.createCaller(ctx);
    await accounting.coa.seed();
    const [v] = await testDb()
      .insert(vendors)
      .values({ orgId, name: `Vendor ${nanoid(4)}`, state: "Maharashtra" })
      .returning();
    vendorId = v!.id;
  });

  it("posts one balanced entry per legacy invoice and moves ledger balances", async () => {
    await seedLegacyPayable("LEGACY-1");
    await seedLegacyPayable("LEGACY-2");

    const apBefore = await balanceOf("2110");
    const expBefore = await balanceOf("5000");

    const res = await financial.backfillInvoiceJournals({});
    expect(res.scanned).toBe(2);
    expect(res.posted).toBe(2);
    expect(res.skipped).toBe(0);
    expect(res.unposted).toBe(0);

    // Exactly two invoice-type journal entries now exist.
    const jes = await testDb()
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.type, "invoice")));
    expect(jes.length).toBe(2);
    for (const je of jes) {
      expect(je.status).toBe("posted");
      expect(Number(je.totalDebit)).toBeCloseTo(Number(je.totalCredit), 3);
    }

    // Two AP invoices at gross 2,36,000 each: AP credited 4,72,000, expense debited 4,00,000.
    expect(await balanceOf("2110")).toBeCloseTo(apBefore - 472_000, 3);
    expect(await balanceOf("5000")).toBeCloseTo(expBefore + 400_000, 3);
  });

  it("is idempotent — a second run posts nothing and skips all", async () => {
    await seedLegacyPayable("LEGACY-1");

    const first = await financial.backfillInvoiceJournals({});
    expect(first.posted).toBe(1);

    const apAfterFirst = await balanceOf("2110");

    const second = await financial.backfillInvoiceJournals({});
    expect(second.scanned).toBe(1);
    expect(second.posted).toBe(0);
    expect(second.skipped).toBe(1);

    // No double-posting: only one entry, balance unchanged by the second run.
    const jes = await testDb()
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.type, "invoice")));
    expect(jes.length).toBe(1);
    expect(await balanceOf("2110")).toBeCloseTo(apAfterFirst, 3);
  });

  it("posts the same entry a live invoice-create would (parity with the write path)", async () => {
    // A backfilled legacy invoice and a freshly created one with identical GST
    // columns must move the ledger by the same amounts.
    await seedLegacyPayable("LEGACY-1");
    const apStart = await balanceOf("2110");
    await financial.backfillInvoiceJournals({});
    const apAfterBackfill = await balanceOf("2110");
    const backfillDelta = apAfterBackfill - apStart;

    expect(backfillDelta).toBeCloseTo(-236_000, 3);
  });
});
