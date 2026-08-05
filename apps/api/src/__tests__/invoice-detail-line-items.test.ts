/**
 * M-07 — invoice detail page line-item surface.
 *
 * The line-item ENTRY form now sends `lines[]` through the real create paths (A7),
 * but the detail page could not show them: `getInvoice` returned header columns only.
 * M-07 makes `getInvoice` return the persisted `lineItems` so the page can render the
 * per-line breakdown — while legacy single-amount invoices (no lines) return `[]` and
 * fall back to the header totals untouched.
 *
 * These tests prove:
 *  - a line-item invoice created through the form-shaped `lines[]` payload comes back
 *    from `getInvoice` with its rows, ordered by line number, carrying per-line GST;
 *  - a legacy single-amount invoice comes back with `lineItems: []` (back-compat);
 *  - the form-shaped payload round-trips with NO ₹0.01 header/line mismatch, i.e. the
 *    header `getInvoice` returns equals the sum of the rounded lines to the paise.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { financialRouter } from "../routers/financial";
import { gstinRegistry, vendors } from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("M-07 invoice detail line items", () => {
  let caller: any;
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
        stateName: "Maharashtra",
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
  });

  it("returns persisted line items from getInvoice, ordered by line number", async () => {
    await seedOrgGstin();
    const customerId = await seedVendor("Maharashtra"); // intra-state → CGST+SGST

    const created = await caller.createReceivableInvoice({
      customerVendorId: customerId,
      invoiceNumber: `AR-${nanoid(6)}`,
      amount: "0", // ignored when lines[] present
      lines: [
        { description: "Item @18%", taxableValue: 2000, gstRate: 18, hsnSacCode: "9983" },
        { description: "Item @5%", taxableValue: 1000, gstRate: 5, hsnSacCode: "1006" },
      ],
    });

    const fetched = await caller.getInvoice({ id: created.id });

    expect(Array.isArray(fetched.lineItems)).toBe(true);
    expect(fetched.lineItems).toHaveLength(2);
    // Ordered by lineItemNumber ascending.
    expect(fetched.lineItems.map((l: any) => l.lineItemNumber)).toEqual([1, 2]);
    // Per-line GST is carried on each row.
    const byRate = new Map(fetched.lineItems.map((l: any) => [Number(l.gstRate), l]));
    expect(Number(byRate.get(18)!.cgstAmount)).toBe(180);
    expect(Number(byRate.get(18)!.sgstAmount)).toBe(180);
    expect(Number(byRate.get(5)!.cgstAmount)).toBe(25);
    expect(byRate.get(18)!.hsnSacCode).toBe("9983");

    // The header getInvoice returns equals the sum of the rounded lines to the paise.
    expect(Number(fetched.taxableValue)).toBe(3000);
    const summedTax = fetched.lineItems.reduce(
      (s: number, l: any) => s + Number(l.cgstAmount) + Number(l.sgstAmount) + Number(l.igstAmount),
      0,
    );
    expect(Number(fetched.totalTaxAmount)).toBe(summedTax); // 205 + 205 = 410
    expect(Number(fetched.amount)).toBe(3410);
  });

  it("returns an empty lineItems array for a legacy single-amount invoice (back-compat)", async () => {
    await seedOrgGstin();
    const vendorId = await seedVendor("Maharashtra");

    const created = await caller.createInvoice({
      vendorId,
      invoiceNumber: `AP-${nanoid(6)}`,
      amount: "200000",
      gstRate: 18,
    });

    const fetched = await caller.getInvoice({ id: created.id });

    expect(Array.isArray(fetched.lineItems)).toBe(true);
    expect(fetched.lineItems).toHaveLength(0);
    // Header breakdown intact for the detail page to fall back on.
    expect(Number(fetched.cgstAmount)).toBe(18_000);
    expect(Number(fetched.sgstAmount)).toBe(18_000);
    expect(Number(fetched.amount)).toBe(236_000);
  });

  it("round-trips a form-shaped multi-rate payload with no header/line mismatch", async () => {
    await seedOrgGstin();
    const vendorId = await seedVendor("Karnataka"); // inter-state → IGST

    // A payload the line-items editor produces: taxableValue is authoritative per line.
    const created = await caller.createInvoice({
      vendorId,
      invoiceNumber: `AP-${nanoid(6)}`,
      amount: "0",
      lines: [
        { description: "Svc @18%", taxableValue: 100.1, gstRate: 18, quantity: 1, unitPrice: 100.1 },
        { description: "Svc @18%", taxableValue: 100.1, gstRate: 18, quantity: 1, unitPrice: 100.1 },
      ],
    });

    const fetched = await caller.getInvoice({ id: created.id });
    expect(fetched.lineItems).toHaveLength(2);
    expect(fetched.isInterstate).toBe(true);

    // Round-then-sum: 100.10 @18% IGST = 18.018 → 18.02 per line → header 36.04.
    const summedIgst = fetched.lineItems.reduce((s: number, l: any) => s + Number(l.igstAmount), 0);
    expect(Number(fetched.igstAmount)).toBe(summedIgst);
    expect(Number(fetched.igstAmount)).toBe(36.04);
    expect(Number(fetched.taxableValue)).toBe(200.2);
    expect(Number(fetched.amount)).toBe(236.24);
  });
});
