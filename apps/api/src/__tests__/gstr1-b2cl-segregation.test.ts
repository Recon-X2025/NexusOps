/**
 * GSTR-1 B2CL segregation (Table 5) — integration tests (C7-2).
 *
 * Before this work the builder had no B2CL bucket: every unregistered-buyer
 * invoice was stamped B2CS unconditionally, so large inter-state B2C supplies
 * were mis-consolidated into Table 7 instead of reported invoice-wise in Table 5.
 *
 * The B2CL invoice-wise threshold is ₹1,00,000 (the GST Council reduced it from
 * ₹2,50,000 effective 1 Aug 2024, Notif. 12/2024-CT). It is per-tenant
 * configurable (organizations.b2clThreshold, default ₹1,00,000). Rule: an
 * INTER-STATE supply to an unregistered person whose invoice value EXCEEDS the
 * threshold → Table 5; at/below, or intra-state → Table 7 (B2CS).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { accountingRouter } from "../routers/accounting";
import { gstinRegistry, invoices, vendors, organizations, eq } from "@coheronconnect/db";

describe("GSTR-1 B2CL segregation (Table 5)", () => {
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
    const [v] = await db.insert(vendors).values({ orgId, name: "B2CL Vendor" }).returning();
    vendorId = v!.id;
  });

  async function seedGstin() {
    const db = testDb();
    // Supplier registered in Maharashtra ("27").
    const [g] = await db
      .insert(gstinRegistry)
      .values({ orgId, gstin: "27AAAAA0000A1Z5", legalName: "Test Co", stateCode: "27", stateName: "Maharashtra", isPrimary: true })
      .returning();
    return g!;
  }

  /** Seed one unregistered-buyer (B2C) invoice: no buyerGstin. */
  async function seedB2C(gstinId: string, opts: { pos: string; amount: number; num: string }) {
    const db = testDb();
    const taxable = String(Math.round(opts.amount / 1.18));
    await db.insert(invoices).values({
      orgId,
      invoiceNumber: opts.num,
      vendorId,
      invoiceFlow: "receivable",
      buyerGstin: null,
      gstinId,
      placeOfSupply: opts.pos,
      taxableValue: taxable,
      igstAmount: String(opts.amount - Number(taxable)),
      cgstAmount: "0",
      sgstAmount: "0",
      totalTaxAmount: String(opts.amount - Number(taxable)),
      amount: String(opts.amount),
      invoiceDate: new Date(2026, 0, 15),
    });
  }

  async function setThreshold(value: string) {
    await testDb().update(organizations).set({ b2clThreshold: value }).where(eq(organizations.id, orgId));
  }

  it("inter-state B2C above ₹1L (₹1,50,000) → B2CL (Table 5), not B2CS", async () => {
    const g = await seedGstin();
    // Supplier "27", place of supply "29" (Karnataka) → inter-state; ₹1.5L > ₹1L.
    await seedB2C(g.id, { pos: "29", amount: 150000, num: "B2CL-INTER-150K" });

    const res = await caller.gstr.generateGSTR1({ gstinId: g.id, month: 1, year: 2026 });
    const grp = res.payload.b2cl.find((x: any) => x.pos === "29");
    expect(grp).toBeDefined();
    expect(grp.inv.some((i: any) => i.inum === "B2CL-INTER-150K")).toBe(true);
    // And it must NOT also appear in the B2CS consolidated summary.
    expect(res.payload.b2cs.some((e: any) => e.inum === "B2CL-INTER-150K")).toBe(false);
  });

  it("inter-state B2C at/below ₹1L stays in B2CS (₹80,000 and exactly ₹1,00,000)", async () => {
    const g = await seedGstin();
    await seedB2C(g.id, { pos: "29", amount: 80000, num: "B2C-INTER-80K" });
    await seedB2C(g.id, { pos: "29", amount: 100000, num: "B2C-INTER-100K" }); // == threshold, not "exceeds"

    const res = await caller.gstr.generateGSTR1({ gstinId: g.id, month: 1, year: 2026 });
    expect(res.payload.b2cs.some((e: any) => e.inum === "B2C-INTER-80K")).toBe(true);
    expect(res.payload.b2cs.some((e: any) => e.inum === "B2C-INTER-100K")).toBe(true);
    expect(res.payload.b2cl.length).toBe(0);
  });

  it("intra-state B2C above ₹1L stays in B2CS (B2CL is inter-state only)", async () => {
    const g = await seedGstin();
    // Same state "27" → intra-state, even at ₹2,00,000.
    await seedB2C(g.id, { pos: "27", amount: 200000, num: "B2C-INTRA-200K" });

    const res = await caller.gstr.generateGSTR1({ gstinId: g.id, month: 1, year: 2026 });
    expect(res.payload.b2cs.some((e: any) => e.inum === "B2C-INTRA-200K")).toBe(true);
    expect(res.payload.b2cl.length).toBe(0);
  });

  it("uses the default ₹1L threshold when the tenant has not overridden it", async () => {
    const g = await seedGstin();
    await seedB2C(g.id, { pos: "29", amount: 150000, num: "B2C-DEFAULT-150K" });

    const res = await caller.gstr.generateGSTR1({ gstinId: g.id, month: 1, year: 2026 });
    expect(res.payload.b2cl.some((x: any) => x.inv.some((i: any) => i.inum === "B2C-DEFAULT-150K"))).toBe(true);
  });

  it("honours a per-tenant threshold override (raise to ₹2.5L → ₹1.5L falls back to B2CS)", async () => {
    const g = await seedGstin();
    await setThreshold("250000");
    await seedB2C(g.id, { pos: "29", amount: 150000, num: "B2C-RAISED-150K" });

    const res = await caller.gstr.generateGSTR1({ gstinId: g.id, month: 1, year: 2026 });
    // Below the raised ₹2.5L threshold → consolidated B2CS, not B2CL.
    expect(res.payload.b2cs.some((e: any) => e.inum === "B2C-RAISED-150K")).toBe(true);
    expect(res.payload.b2cl.length).toBe(0);
  });

  it("groups multiple B2CL invoices by place of supply", async () => {
    const g = await seedGstin();
    await seedB2C(g.id, { pos: "29", amount: 150000, num: "B2CL-KA-1" });
    await seedB2C(g.id, { pos: "29", amount: 120000, num: "B2CL-KA-2" });
    await seedB2C(g.id, { pos: "33", amount: 300000, num: "B2CL-TN-1" }); // Tamil Nadu

    const res = await caller.gstr.generateGSTR1({ gstinId: g.id, month: 1, year: 2026 });
    const ka = res.payload.b2cl.find((x: any) => x.pos === "29");
    const tn = res.payload.b2cl.find((x: any) => x.pos === "33");
    expect(ka.inv).toHaveLength(2);
    expect(tn.inv).toHaveLength(1);
  });
});
