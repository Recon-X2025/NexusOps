/**
 * A7 — invoice line items persistence + CA rounding contract.
 *
 * The CA ruled (2026-08-02): lines are authoritative, the header is DERIVED by
 * summing the per-line tax (each rounded half-up to 2dp). A ₹0.01 gap between the
 * summed lines and a supplied header is a HARD ERROR — the IRN / GSTR-1 tool would
 * reject the payload — not a tolerance.
 *
 * These tests prove:
 *  - lines supplied through the real create path persist to `invoice_line_items`
 *    and their rounded tax sums EXACTLY to the header the invoice stores;
 *  - the persisted lines are the same rows GSTR-1 rate-grouping reads;
 *  - omitting `lines[]` keeps the legacy single-line behaviour (back-compat);
 *  - the shared helper rejects a ₹0.01 header/line mismatch outright.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { financialRouter } from "../routers/financial";
import { accountingRouter } from "../routers/accounting";
import { invoiceLineItems, gstinRegistry, vendors, eq } from "@coheronconnect/db";
import { nanoid } from "nanoid";
import { computeInvoiceFromLines } from "../lib/invoice-lines";

describe("A7 invoice line items", () => {
  let caller: any;
  let acctCaller: any;
  let orgId: string;
  let adminId: string;

  async function seedOrgGstin(): Promise<string> {
    const [g] = await testDb()
      .insert(gstinRegistry)
      .values({
        orgId,
        gstin: `27${nanoid(6).toUpperCase()}0A1Z5`,
        legalName: "Test Org Pvt Ltd",
        stateCode: "27",
        stateName: null,
        isPrimary: true,
        isActive: true,
      })
      .returning();
    return g!.id;
  }

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
    acctCaller = accountingRouter.createCaller(createMockContext(adminId, orgId));
  });

  it("persists multi-rate lines and derives the header as their exact rounded sum", async () => {
    const gstinId = await seedOrgGstin();
    const customerId = await seedVendor("Maharashtra"); // intra-state → CGST+SGST

    // AR (outward) invoice so it appears in GSTR-1. Two rates: 2000 @18%, 1000 @5%.
    const inv = await caller.createReceivableInvoice({
      customerVendorId: customerId,
      invoiceNumber: `AR-${nanoid(6)}`,
      amount: "0", // ignored when lines[] present
      invoiceDate: new Date(2026, 0, 15).toISOString(),
      lines: [
        { description: "Item @18%", taxableValue: 2000, gstRate: 18 },
        { description: "Item @5%", taxableValue: 1000, gstRate: 5 },
      ],
    });

    // Header = sum of rounded lines. 18%: CGST/SGST 180 each. 5%: 25 each.
    expect(Number(inv.taxableValue)).toBe(3000);
    expect(Number(inv.cgstAmount)).toBe(205); // 180 + 25
    expect(Number(inv.sgstAmount)).toBe(205);
    expect(Number(inv.igstAmount)).toBe(0);
    expect(Number(inv.totalTaxAmount)).toBe(410);
    expect(Number(inv.amount)).toBe(3410); // 3000 + 410

    // Lines persisted.
    const lines = await testDb()
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, inv.id));
    expect(lines).toHaveLength(2);
    const byRate = new Map(lines.map((l) => [Number(l.gstRate), l]));
    expect(Number(byRate.get(18)!.cgstAmount)).toBe(180);
    expect(Number(byRate.get(5)!.cgstAmount)).toBe(25);

    // The persisted lines are exactly what GSTR-1 rate-grouping consumes: two
    // distinct rates → two itm_det entries with the real per-line tax.
    const res = await acctCaller.gstr.generateGSTR1({ gstinId, month: 1, year: 2026 });
    const b2bInv = res.payload.b2b.find((x: any) => x.inv?.[0]?.itms?.length === 2);
    expect(b2bInv).toBeDefined();
    const itms = b2bInv.inv[0].itms;
    expect(itms.map((i: any) => i.itm_det.rt)).toEqual([5, 18]);
    expect(itms.find((i: any) => i.itm_det.rt === 5).itm_det.camt).toBe(25);
    expect(itms.find((i: any) => i.itm_det.rt === 18).itm_det.camt).toBe(180);
  });

  it("rounds each line half-up to 2dp, then sums (sub-paisa components)", async () => {
    await seedOrgGstin();
    const vendorId = await seedVendor("Maharashtra");

    // 100.10 @18%: half-rate 9 → 100.10*9 = 900.9 → round 901 → 9.01 per side.
    // Two such lines → header CGST 18.02 (round-then-sum, not sum-then-round).
    const inv = await caller.createInvoice({
      vendorId,
      invoiceNumber: `AP-${nanoid(6)}`,
      amount: "0",
      lines: [
        { description: "L1", taxableValue: 100.1, gstRate: 18 },
        { description: "L2", taxableValue: 100.1, gstRate: 18 },
      ],
    });

    expect(Number(inv.taxableValue)).toBe(200.2);
    expect(Number(inv.cgstAmount)).toBe(18.02);
    expect(Number(inv.sgstAmount)).toBe(18.02);
    expect(Number(inv.amount)).toBe(236.24); // 200.20 + 36.04
  });

  it("keeps legacy single-line behaviour when lines[] is omitted (back-compat)", async () => {
    await seedOrgGstin();
    const vendorId = await seedVendor("Maharashtra");

    const inv = await caller.createInvoice({
      vendorId,
      invoiceNumber: `AP-${nanoid(6)}`,
      amount: "200000",
      gstRate: 18,
    });

    // Unchanged single-line result.
    expect(Number(inv.cgstAmount)).toBe(18_000);
    expect(Number(inv.sgstAmount)).toBe(18_000);
    expect(Number(inv.amount)).toBe(236_000);

    // No line rows written on the legacy path.
    const lines = await testDb()
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, inv.id));
    expect(lines).toHaveLength(0);
  });

  it("persists lines on the AR (receivable) path too", async () => {
    await seedOrgGstin();
    const customerId = await seedVendor("Karnataka"); // inter-state → IGST

    const inv = await caller.createReceivableInvoice({
      customerVendorId: customerId,
      invoiceNumber: `AR-${nanoid(6)}`,
      amount: "0",
      lines: [
        { description: "Svc @18%", taxableValue: 5000, gstRate: 18 },
        { description: "Svc @12%", taxableValue: 1000, gstRate: 12 },
      ],
    });

    expect(inv.isInterstate).toBe(true);
    expect(Number(inv.igstAmount)).toBe(1020); // 900 + 120
    expect(Number(inv.cgstAmount)).toBe(0);
    expect(Number(inv.amount)).toBe(7020); // 6000 + 1020

    const lines = await testDb()
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, inv.id));
    expect(lines).toHaveLength(2);
  });

  it("rejects a ₹0.01 header/line mismatch as a hard error (helper contract)", () => {
    // Two lines sum to a header total of 236.24 (see the sub-paisa case above).
    // Supplying a header off by one paisa must throw, not round-away the gap.
    expect(() =>
      computeInvoiceFromLines({
        lines: [
          { description: "L1", taxableValue: 100.1, gstRate: 18 },
          { description: "L2", taxableValue: 100.1, gstRate: 18 },
        ],
        orgState: "27",
        counterpartyState: "27",
        expectedHeader: 236.25, // real sum is 236.24 — ₹0.01 too high
      }),
    ).toThrow(/does not equal the sum of lines/);

    // The exact header is accepted.
    expect(() =>
      computeInvoiceFromLines({
        lines: [
          { description: "L1", taxableValue: 100.1, gstRate: 18 },
          { description: "L2", taxableValue: 100.1, gstRate: 18 },
        ],
        orgState: "27",
        counterpartyState: "27",
        expectedHeader: 236.24,
      }),
    ).not.toThrow();
  });
});
