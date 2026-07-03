/**
 * GSTR-2B ITC reconciliation tests (Sprint 2.3).
 *
 * `financial.gstr2b.ingest` persists a portal GSTR-2B statement for a period,
 * reconciles it against the book purchase invoices, and stores both the
 * per-invoice outcome (matched / mismatch / missing_in_2b / missing_in_books)
 * and the period totals. Eligible ITC (claimable in GSTR-3B) is the tax on
 * matched lines only. Re-ingesting a period replaces the prior run.
 *
 * Verifies the four reconciliation buckets, eligible-vs-portal ITC, persistence
 * + retrieval, idempotent re-ingest, tenant isolation and RBAC.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, seedUser, testDb } from "./helpers";
import { financialRouter } from "../routers/financial";
import { invoices, vendors, gstr2bImports, eq } from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("GSTR-2B ITC reconciliation (Sprint 2.3)", () => {
  let caller: any;
  let orgId: string;
  let adminId: string;
  let vendorId: string;

  /** Seed a payable (purchase) invoice with GST amounts for the period. */
  async function seedPurchase(opts: {
    supplierGstin: string;
    invoiceNumber: string;
    taxableValue: number;
    igst?: number;
    cgst?: number;
    sgst?: number;
    date?: Date;
  }) {
    const db = testDb();
    await db.insert(invoices).values({
      orgId,
      vendorId,
      invoiceNumber: opts.invoiceNumber,
      invoiceFlow: "payable",
      supplierGstin: opts.supplierGstin,
      taxableValue: String(opts.taxableValue),
      igstAmount: String(opts.igst ?? 0),
      cgstAmount: String(opts.cgst ?? 0),
      sgstAmount: String(opts.sgst ?? 0),
      totalTaxAmount: String((opts.igst ?? 0) + (opts.cgst ?? 0) + (opts.sgst ?? 0)),
      amount: String(opts.taxableValue + (opts.igst ?? 0) + (opts.cgst ?? 0) + (opts.sgst ?? 0)),
      invoiceDate: opts.date ?? new Date(2025, 3, 15), // April 2025
    });
  }

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
    caller = financialRouter.createCaller(createMockContext(adminId, orgId));
    const [v] = await testDb().insert(vendors).values({ orgId, name: "GSTR-2B Vendor" }).returning();
    vendorId = v!.id;
  });

  it("classifies matched, mismatch, missing_in_2b and missing_in_books lines", async () => {
    // Book invoices for April 2025.
    await seedPurchase({ supplierGstin: "27AAAAA0000A1Z5", invoiceNumber: "P-MATCH", taxableValue: 10_000, igst: 1_800 });
    await seedPurchase({ supplierGstin: "27BBBBB0000B1Z5", invoiceNumber: "P-MISMATCH", taxableValue: 5_000, igst: 900 });
    await seedPurchase({ supplierGstin: "27CCCCC0000C1Z5", invoiceNumber: "P-ONLY-BOOK", taxableValue: 2_000, igst: 360 });

    const res = await caller.gstr2b.ingest({
      month: 4,
      year: 2025,
      lines: [
        // Exact match → eligible ITC.
        { supplierGstin: "27AAAAA0000A1Z5", invoiceNumber: "P-MATCH", taxableValue: 10_000, igst: 1_800, cgst: 0, sgst: 0 },
        // Tax differs → mismatch, not eligible.
        { supplierGstin: "27BBBBB0000B1Z5", invoiceNumber: "P-MISMATCH", taxableValue: 5_000, igst: 950, cgst: 0, sgst: 0 },
        // In portal but not booked → missing_in_books.
        { supplierGstin: "27DDDDD0000D1Z5", invoiceNumber: "P-ONLY-2B", taxableValue: 3_000, igst: 540, cgst: 0, sgst: 0 },
      ],
    });

    expect(res.counts.matched).toBe(1);
    expect(res.counts.mismatch).toBe(1);
    expect(res.counts.missingIn2b).toBe(1); // P-ONLY-BOOK
    expect(res.counts.missingInBooks).toBe(1); // P-ONLY-2B

    // Eligible ITC = matched-line tax only (1,800); portal ITC = all 2B tax.
    expect(res.eligibleItc).toBe(1_800);
    expect(res.portalItc).toBe(1_800 + 950 + 540);
  });

  it("persists the import and its reconciled lines for retrieval", async () => {
    await seedPurchase({ supplierGstin: "27AAAAA0000A1Z5", invoiceNumber: "P-1", taxableValue: 10_000, cgst: 900, sgst: 900 });
    const res = await caller.gstr2b.ingest({
      month: 4,
      year: 2025,
      lines: [
        { supplierGstin: "27AAAAA0000A1Z5", invoiceNumber: "P-1", taxableValue: 10_000, igst: 0, cgst: 900, sgst: 900 },
      ],
    });

    const list = await caller.gstr2b.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(res.import.id);
    expect(Number(list[0].eligibleItc)).toBe(1_800);

    const detail = await caller.gstr2b.get({ importId: res.import.id });
    expect(detail.lines).toHaveLength(1);
    expect(detail.lines[0].status).toBe("matched");
    expect(Number(detail.lines[0].portalCgst)).toBe(900);
  });

  it("replaces the prior run when a period is re-ingested", async () => {
    await seedPurchase({ supplierGstin: "27AAAAA0000A1Z5", invoiceNumber: "P-1", taxableValue: 10_000, igst: 1_800 });

    await caller.gstr2b.ingest({
      month: 4,
      year: 2025,
      lines: [{ supplierGstin: "27AAAAA0000A1Z5", invoiceNumber: "P-1", taxableValue: 10_000, igst: 1_800, cgst: 0, sgst: 0 }],
    });
    // Re-ingest the same period with an extra portal line.
    const res2 = await caller.gstr2b.ingest({
      month: 4,
      year: 2025,
      lines: [
        { supplierGstin: "27AAAAA0000A1Z5", invoiceNumber: "P-1", taxableValue: 10_000, igst: 1_800, cgst: 0, sgst: 0 },
        { supplierGstin: "27ZZZZZ0000Z1Z5", invoiceNumber: "P-NEW", taxableValue: 1_000, igst: 180, cgst: 0, sgst: 0 },
      ],
    });

    // Only one import row survives for the period.
    const rows = await testDb().select().from(gstr2bImports).where(eq(gstr2bImports.orgId, orgId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(res2.import.id);
    expect(res2.counts.missingInBooks).toBe(1);
  });

  it("scopes reconciliation to the caller's org", async () => {
    // Book an invoice in ANOTHER org; ours has none.
    const other = await seedFullOrg();
    const otherCaller = financialRouter.createCaller(createMockContext(other.adminId, other.orgId));
    const [ov] = await testDb().insert(vendors).values({ orgId: other.orgId, name: "Other Vendor" }).returning();
    await testDb().insert(invoices).values({
      orgId: other.orgId,
      vendorId: ov!.id,
      invoiceNumber: "FOREIGN-1",
      invoiceFlow: "payable",
      supplierGstin: "27AAAAA0000A1Z5",
      taxableValue: "10000",
      igstAmount: "1800",
      totalTaxAmount: "1800",
      amount: "11800",
      invoiceDate: new Date(2025, 3, 15),
    });

    // Our org ingests the same portal line but has no matching book invoice.
    const res = await caller.gstr2b.ingest({
      month: 4,
      year: 2025,
      lines: [{ supplierGstin: "27AAAAA0000A1Z5", invoiceNumber: "FOREIGN-1", taxableValue: 10_000, igst: 1_800, cgst: 0, sgst: 0 }],
    });
    expect(res.counts.matched).toBe(0);
    expect(res.counts.missingInBooks).toBe(1);
    expect(res.eligibleItc).toBe(0);

    // The other org still reconciles it as matched.
    const otherRes = await otherCaller.gstr2b.ingest({
      month: 4,
      year: 2025,
      lines: [{ supplierGstin: "27AAAAA0000A1Z5", invoiceNumber: "FOREIGN-1", taxableValue: 10_000, igst: 1_800, cgst: 0, sgst: 0 }],
    });
    expect(otherRes.counts.matched).toBe(1);
    expect(otherRes.eligibleItc).toBe(1_800);
  });

  it("denies ingest to a member without financial:write", async () => {
    const { userId } = await seedUser(orgId, {
      email: `viewer-${nanoid(6)}@qa.coheronconnect.io`,
      role: "member",
      matrixRole: "viewer",
      password: "TestPass123!",
    });
    const memberCaller = financialRouter.createCaller(
      createMockContext(userId, orgId, {
        user: {
          id: userId,
          orgId,
          email: "viewer@qa.coheronconnect.io",
          name: "Viewer",
          role: "member",
          matrixRole: "viewer",
          status: "active",
        },
      }),
    );
    await expect(
      memberCaller.gstr2b.ingest({ month: 4, year: 2025, lines: [] }),
    ).rejects.toThrow();
  });
});
