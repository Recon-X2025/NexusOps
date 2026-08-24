/**
 * BLOCKER regression: GSTR-1 is the OUTWARD-supplies return — only our own sales
 * (invoice_flow = 'receivable') belong in it.
 *
 * The generateGSTR1 query filtered org + gstin + date but not invoice_flow, so a
 * payable (purchase) invoice was filed as our own outward supply — over-reporting
 * output tax and inventing a self-supply. Existing GSTR-1 tests only ever created
 * receivables, so nothing caught it.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { accountingRouter } from "../routers/accounting";
import { gstinRegistry, invoices, vendors } from "@coheronconnect/db";

describe("GSTR-1 includes only receivables (BLOCKER regression)", () => {
  let caller: any;
  let orgId: string;
  let vendorId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    caller = accountingRouter.createCaller(createMockContext(seeded.adminId, orgId));
    const [v] = await testDb().insert(vendors).values({ orgId, name: "GSTR-1 Flow Vendor" }).returning();
    vendorId = v!.id;
  });

  it("excludes payable invoices from the outward-supply return", async () => {
    const db = testDb();
    const [g] = await db
      .insert(gstinRegistry)
      .values({ orgId, gstin: "27AAAAA0000A1Z5", legalName: "Test Co", stateCode: "27", stateName: "Maharashtra", isPrimary: true })
      .returning();

    const RECEIVABLE_CTIN = "27RRRRR1111R1Z5";
    const PAYABLE_CTIN = "27PPPPP2222P1Z3";

    await db.insert(invoices).values([
      {
        orgId, invoiceNumber: "AR-OUT-1", vendorId, invoiceFlow: "receivable",
        buyerGstin: RECEIVABLE_CTIN, gstinId: g!.id, placeOfSupply: "27",
        taxableValue: "1000", cgstAmount: "90", sgstAmount: "90", igstAmount: "0",
        totalTaxAmount: "180", amount: "1180", invoiceDate: new Date(2026, 0, 10),
      },
      {
        // A purchase bill — must NOT appear in OUR GSTR-1.
        orgId, invoiceNumber: "AP-IN-1", vendorId, invoiceFlow: "payable",
        buyerGstin: PAYABLE_CTIN, gstinId: g!.id, placeOfSupply: "27",
        taxableValue: "5000", cgstAmount: "450", sgstAmount: "450", igstAmount: "0",
        totalTaxAmount: "900", amount: "5900", invoiceDate: new Date(2026, 0, 12),
      },
    ]);

    const res = await caller.gstr.generateGSTR1({ gstinId: g!.id, month: 1, year: 2026 });
    const ctins = res.payload.b2b.map((x: any) => x.ctin);

    // The sale is reported; the purchase is not.
    expect(ctins).toContain(RECEIVABLE_CTIN);
    expect(ctins).not.toContain(PAYABLE_CTIN);
  });
});
