/**
 * HIGH regression: creating a receivable invoice must auto-enqueue e-invoice
 * (IRN) generation when the org's turnover makes it mandatory (> ₹5 Cr).
 *
 * The only enqueue site was dead code on the PAYABLE path with turnover hardcoded
 * to 0 (never fired), so IRNs were never requested for actual sales. Now
 * createReceivableInvoice gates on the org's real annualAggregateTurnover.
 *
 * We assert the invoice's persisted eInvoiceStatus: the fix sets it to "pending"
 * before enqueuing (the enqueue itself soft-fails in the test env with no
 * workflow service, which is fine — the status write is what proves the wiring).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { financialRouter } from "../routers/financial";
import { invoices, vendors, gstinRegistry, organizations, eq } from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("receivable invoice auto-enqueues e-invoice IRN by turnover (HIGH regression)", () => {
  let orgId: string;
  let caller: any;

  beforeEach(async () => {
    const s = await seedFullOrg();
    orgId = s.orgId;
    caller = financialRouter.createCaller(createMockContext(s.adminId, orgId));
    await testDb().insert(gstinRegistry).values({
      orgId,
      gstin: `27${nanoid(6).toUpperCase()}0A1Z5`,
      legalName: "Org Pvt Ltd",
      stateCode: "27",
      stateName: null,
      isPrimary: true,
      isActive: true,
    });
  });

  const customer = async () => {
    const [v] = await testDb()
      .insert(vendors)
      .values({ orgId, name: `Cust ${nanoid(4)}`, state: "Maharashtra", gstin: "27ZZZZZ0000Z1Z5" })
      .returning();
    return v!.id;
  };

  const raise = async () =>
    caller.createReceivableInvoice({ customerVendorId: await customer(), invoiceNumber: `AR-${nanoid(6)}`, amount: "100000", gstRate: 18 });

  it("marks eInvoiceStatus=pending when turnover > ₹5 Cr", async () => {
    await testDb().update(organizations).set({ annualAggregateTurnover: "60000000" }).where(eq(organizations.id, orgId));
    const inv = await raise();
    const [row] = await testDb().select({ st: invoices.eInvoiceStatus }).from(invoices).where(eq(invoices.id, inv.id));
    expect(row!.st).toBe("pending");
  });

  it("does NOT enqueue when turnover is below ₹5 Cr", async () => {
    await testDb().update(organizations).set({ annualAggregateTurnover: "1000000" }).where(eq(organizations.id, orgId));
    const inv = await raise();
    const [row] = await testDb().select({ st: invoices.eInvoiceStatus }).from(invoices).where(eq(invoices.id, inv.id));
    expect(row!.st).toBeNull();
  });
});
