/**
 * GSTR-1 HSN summary (Table 12) — integration tests (C7 item 1).
 *
 * Table 12 is mandatory on every GSTR-1; before this work the builder emitted no
 * `hsn` section at all. These prove: the return now carries an HSN summary keyed
 * on the org's real line-item HSN codes; the 4-vs-6-digit minimum tracks the
 * org's Annual Aggregate Turnover; and short/missing HSN codes and an unset AATO
 * are surfaced as warnings rather than silently passing.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { accountingRouter } from "../routers/accounting";
import { gstinRegistry, invoices, invoiceLineItems, vendors, organizations, eq } from "@coheronconnect/db";

describe("GSTR-1 HSN summary (Table 12)", () => {
  let ctx: any;
  let caller: any;
  let orgId: string;
  let vendorId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    ctx = createMockContext(seeded.adminId, orgId);
    caller = accountingRouter.createCaller(ctx);
    const db = testDb();
    const [v] = await db.insert(vendors).values({ orgId, name: "HSN Test Vendor" }).returning();
    vendorId = v!.id;
  });

  async function seedGstin() {
    const db = testDb();
    const [g] = await db
      .insert(gstinRegistry)
      .values({ orgId, gstin: "27AAAAA0000A1Z5", legalName: "Test Co", stateCode: "27", stateName: "Maharashtra", isPrimary: true })
      .returning();
    return g!;
  }

  async function setAato(value: string | null) {
    await testDb().update(organizations).set({ annualAggregateTurnover: value }).where(eq(organizations.id, orgId));
  }

  async function seedInvoiceWithLines(gstinId: string, lines: Array<Record<string, unknown>>) {
    const db = testDb();
    const [inv] = await db
      .insert(invoices)
      .values({
        orgId,
        invoiceNumber: `INV-HSN-${Math.floor(Number(lines.length) * 7 + 1)}-${gstinId.slice(0, 4)}`,
        vendorId,
        invoiceFlow: "receivable",
        buyerGstin: "27BBBBB1111B1Z3",
        gstinId,
        placeOfSupply: "27",
        taxableValue: "3000",
        cgstAmount: "295",
        sgstAmount: "295",
        igstAmount: "0",
        totalTaxAmount: "590",
        amount: "3590",
        invoiceDate: new Date(2026, 0, 15),
      })
      .returning();
    await db.insert(invoiceLineItems).values(
      lines.map((l, i) => ({ invoiceId: inv!.id, lineItemNumber: i + 1, ...l })),
    );
    return inv!;
  }

  it("emits an HSN section aggregating turnover + tax by HSN × rate", async () => {
    await setAato("12000000"); // ₹1.2 cr → 4-digit minimum
    const g = await seedGstin();
    await seedInvoiceWithLines(g.id, [
      { description: "A", hsnSacCode: "998314", taxableValue: "1000", gstRate: "18", cgstAmount: "90", sgstAmount: "90", igstAmount: "0", lineTotal: "1180" },
      { description: "B", hsnSacCode: "998314", taxableValue: "2000", gstRate: "18", cgstAmount: "180", sgstAmount: "180", igstAmount: "0", lineTotal: "2360" },
      { description: "C", hsnSacCode: "8471", taxableValue: "1000", gstRate: "18", cgstAmount: "90", sgstAmount: "90", igstAmount: "0", lineTotal: "1180" },
    ]);

    const res = await caller.gstr.generateGSTR1({ gstinId: g.id, month: 1, year: 2026 });
    expect(res.payload.hsn).toBeDefined();
    const data = res.payload.hsn.data;
    // 998314@18 (collapsed) + 8471@18 → 2 rows
    expect(data).toHaveLength(2);
    const consult = data.find((r: any) => r.hsn_sc === "998314");
    expect(consult.txval).toBe(3000);
    expect(consult.camt).toBe(270);
    expect(consult.samt).toBe(270);
    expect(res.hsnDigitMin).toBe(4);
    expect(res.annualAggregateTurnover).toBe(12000000);
  });

  it("at AATO > ₹5cr, requires 6 digits and flags a 4-digit HSN", async () => {
    await setAato("120000000"); // ₹12 cr → 6-digit minimum
    const g = await seedGstin();
    await seedInvoiceWithLines(g.id, [
      { description: "Laptop", hsnSacCode: "8471", taxableValue: "1000", gstRate: "18", cgstAmount: "90", sgstAmount: "90", igstAmount: "0", lineTotal: "1180" },
    ]);

    const res = await caller.gstr.generateGSTR1({ gstinId: g.id, month: 1, year: 2026 });
    expect(res.hsnDigitMin).toBe(6);
    expect(res.warnings.some((w: string) => w.includes("8471") && w.includes("6"))).toBe(true);
  });

  it("at AATO ≤ ₹5cr, a 4-digit HSN passes with no digit warning", async () => {
    await setAato("4000000"); // ₹40 lakh → 4-digit minimum
    const g = await seedGstin();
    await seedInvoiceWithLines(g.id, [
      { description: "Laptop", hsnSacCode: "8471", taxableValue: "1000", gstRate: "18", cgstAmount: "90", sgstAmount: "90", igstAmount: "0", lineTotal: "1180" },
    ]);

    const res = await caller.gstr.generateGSTR1({ gstinId: g.id, month: 1, year: 2026 });
    expect(res.hsnDigitMin).toBe(4);
    expect(res.warnings.some((w: string) => w.includes("8471"))).toBe(false);
  });

  it("warns when AATO is unset (defaults the digit minimum to 4)", async () => {
    await setAato(null);
    const g = await seedGstin();
    await seedInvoiceWithLines(g.id, [
      { description: "Laptop", hsnSacCode: "8471", taxableValue: "1000", gstRate: "18", cgstAmount: "90", sgstAmount: "90", igstAmount: "0", lineTotal: "1180" },
    ]);

    const res = await caller.gstr.generateGSTR1({ gstinId: g.id, month: 1, year: 2026 });
    expect(res.annualAggregateTurnover).toBeNull();
    expect(res.hsnDigitMin).toBe(4);
    expect(res.warnings.some((w: string) => w.toLowerCase().includes("annual aggregate turnover"))).toBe(true);
  });

  it("flags a line with a missing HSN code", async () => {
    await setAato("4000000");
    const g = await seedGstin();
    await seedInvoiceWithLines(g.id, [
      { description: "No HSN", hsnSacCode: null, taxableValue: "1000", gstRate: "18", cgstAmount: "90", sgstAmount: "90", igstAmount: "0", lineTotal: "1180" },
    ]);

    const res = await caller.gstr.generateGSTR1({ gstinId: g.id, month: 1, year: 2026 });
    expect(res.warnings.some((w: string) => w.toLowerCase().includes("no hsn"))).toBe(true);
  });
});
