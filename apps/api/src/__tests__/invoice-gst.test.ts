/**
 * GST-on-invoice-entry tests.
 *
 * The direct AP/AR invoice-create path (`financial.createInvoice` /
 * `createReceivableInvoice`) previously stored the entered amount as the
 * taxable value with zero tax. It now runs the India GST engine at entry:
 *   - the entered `amount` is treated as the taxable value,
 *   - `gstRate` (default 18%) drives CGST/SGST vs IGST,
 *   - intra- vs inter-state is derived from the org's primary GSTIN state
 *     against the counterparty (`vendors.state`),
 *   - `amount` is re-persisted as the gross total (taxable + tax).
 *
 * `financial.backfillInvoiceGst` recomputes tax for legacy zero-tax rows.
 *
 * Verifies intra-state split, inter-state IGST, the 18% default, the 0% path,
 * AR computation, and the backfill.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { financialRouter } from "../routers/financial";
import { invoices, vendors, gstinRegistry, eq } from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("GST on invoice entry", () => {
  let caller: any;
  let orgId: string;
  let adminId: string;

  /** Register the org's own GSTIN so its place-of-supply state is known. */
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

  /** A vendor/customer with an optional state. */
  async function seedVendor(state: string | null): Promise<string> {
    const [v] = await testDb()
      .insert(vendors)
      .values({ orgId, name: `Vendor ${nanoid(4)}`, state, gstin: "27ZZZZZ0000Z1Z5" })
      .returning();
    return v!.id;
  }

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
    caller = financialRouter.createCaller(createMockContext(adminId, orgId));
  });

  it("computes CGST+SGST for an intra-state AP invoice at 18%", async () => {
    await seedOrgGstin("Maharashtra");
    const vendorId = await seedVendor("Maharashtra");

    const inv = await caller.createInvoice({
      vendorId,
      invoiceNumber: `AP-${nanoid(6)}`,
      amount: "200000",
      gstRate: 18,
    });

    // 18% of 2,00,000 = 36,000 split 18,000 / 18,000.
    expect(Number(inv.taxableValue)).toBe(200_000);
    expect(Number(inv.cgstAmount)).toBe(18_000);
    expect(Number(inv.sgstAmount)).toBe(18_000);
    expect(Number(inv.igstAmount)).toBe(0);
    expect(Number(inv.totalTaxAmount)).toBe(36_000);
    expect(inv.isInterstate).toBe(false);
    expect(Number(inv.amount)).toBe(236_000);
  });

  it("computes IGST for an inter-state AP invoice", async () => {
    await seedOrgGstin("Maharashtra");
    const vendorId = await seedVendor("Karnataka");

    const inv = await caller.createInvoice({
      vendorId,
      invoiceNumber: `AP-${nanoid(6)}`,
      amount: "100000",
      gstRate: 18,
    });

    expect(Number(inv.igstAmount)).toBe(18_000);
    expect(Number(inv.cgstAmount)).toBe(0);
    expect(Number(inv.sgstAmount)).toBe(0);
    expect(Number(inv.totalTaxAmount)).toBe(18_000);
    expect(inv.isInterstate).toBe(true);
    expect(Number(inv.amount)).toBe(118_000);
  });

  it("defaults to 18% GST when no rate is supplied", async () => {
    await seedOrgGstin("Maharashtra");
    const vendorId = await seedVendor("Maharashtra");

    const inv = await caller.createInvoice({
      vendorId,
      invoiceNumber: `AP-${nanoid(6)}`,
      amount: "1000",
    });

    expect(Number(inv.totalTaxAmount)).toBe(180);
    expect(Number(inv.amount)).toBe(1_180);
  });

  it("adds no tax at a 0% rate", async () => {
    await seedOrgGstin("Maharashtra");
    const vendorId = await seedVendor("Maharashtra");

    const inv = await caller.createInvoice({
      vendorId,
      invoiceNumber: `AP-${nanoid(6)}`,
      amount: "5000",
      gstRate: 0,
    });

    expect(Number(inv.totalTaxAmount)).toBe(0);
    expect(Number(inv.amount)).toBe(5_000);
  });

  it("computes GST for an AR (receivable) invoice", async () => {
    await seedOrgGstin("Maharashtra");
    const customerId = await seedVendor("Karnataka");

    const inv = await caller.createReceivableInvoice({
      customerVendorId: customerId,
      invoiceNumber: `AR-${nanoid(6)}`,
      amount: "50000",
      gstRate: 12,
    });

    // Inter-state 12% → IGST 6,000.
    expect(Number(inv.igstAmount)).toBe(6_000);
    expect(Number(inv.totalTaxAmount)).toBe(6_000);
    expect(inv.isInterstate).toBe(true);
    expect(Number(inv.amount)).toBe(56_000);
  });

  it("backfills GST for a legacy zero-tax invoice", async () => {
    await seedOrgGstin("Maharashtra");
    const vendorId = await seedVendor("Maharashtra");

    // Simulate a pre-fix row: taxable = amount, no tax.
    const [legacy] = await testDb()
      .insert(invoices)
      .values({
        orgId,
        vendorId,
        invoiceNumber: `LEGACY-${nanoid(6)}`,
        invoiceFlow: "payable",
        invoiceType: "tax_invoice",
        amount: "200000",
        taxableValue: "200000",
        status: "pending",
      })
      .returning();

    const res = await caller.backfillInvoiceGst({ invoiceId: legacy!.id, gstRate: 18 });
    expect(res.updated).toBe(1);

    const [after] = await testDb()
      .select()
      .from(invoices)
      .where(eq(invoices.id, legacy!.id));
    expect(Number(after!.totalTaxAmount)).toBe(36_000);
    expect(Number(after!.cgstAmount)).toBe(18_000);
    expect(Number(after!.sgstAmount)).toBe(18_000);
    expect(Number(after!.amount)).toBe(236_000);
  });

  it("does not re-tax an invoice that already has GST", async () => {
    await seedOrgGstin("Maharashtra");
    const vendorId = await seedVendor("Maharashtra");

    const inv = await caller.createInvoice({
      vendorId,
      invoiceNumber: `AP-${nanoid(6)}`,
      amount: "10000",
      gstRate: 18,
    });
    const before = Number(inv.totalTaxAmount);

    // A blanket backfill must skip rows that already carry tax.
    const res = await caller.backfillInvoiceGst({ gstRate: 18 });
    const [after] = await testDb().select().from(invoices).where(eq(invoices.id, inv.id));
    expect(Number(after!.totalTaxAmount)).toBe(before);
    expect(res.invoices.find((r: any) => r.id === inv.id)).toBeUndefined();
  });
});
