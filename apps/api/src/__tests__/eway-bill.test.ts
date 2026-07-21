/**
 * E-Way Bill NIC push tests (G3).
 *
 * Two layers:
 *   • Router (financial.ewayBill.generate) — the ₹50k goods threshold gate,
 *     the payload build from the invoice, and the persisted `eway_bills` row.
 *   • Worker (processEwayBillJob) — the NIC generate/cancel round-trips:
 *       - a connected org gets a real NIC POST and the EWB number + validUpto +
 *         `generated` status are persisted back;
 *       - an org with no NIC integration soft-fails once as `not_configured`;
 *       - a portal rejection flips the row to `failed` and rethrows (retry);
 *       - the generate job is idempotent once the row is `generated`;
 *       - cancel flips a generated row to `cancelled`;
 *       - tenant isolation — a row owned by another org is not processed.
 *
 * The NIC round-trip is exercised against a stubbed fetch (no live network).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// encryptIntegrationConfig reads APP_SECRET lazily; ensure it exists for tests.
process.env["APP_SECRET"] =
  process.env["APP_SECRET"] ?? "test-app-secret-for-ewaybill-do-not-use-in-prod";

import { seedFullOrg, testDb, createMockContext } from "./helpers";
import { processEwayBillJob } from "../workflows/ewayBillWorkflow";
import { financialRouter } from "../routers/financial";
import { encryptIntegrationConfig } from "../services/encryption";
import { ewayBills, invoices, vendors, integrations, eq, and } from "@coheronconnect/db";

function mockFetch(response: {
  ok?: boolean;
  status?: number;
  json?: unknown;
  text?: string;
}) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.json ?? {},
      text: async () => response.text ?? JSON.stringify(response.json ?? {}),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

describe("E-Way Bill NIC push (G3)", () => {
  let orgId: string;
  let adminId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const connectNic = (over: Record<string, string> = {}) =>
    testDb().insert(integrations).values({
      orgId,
      provider: "nic_ewaybill",
      status: "connected",
      configEncrypted: encryptIntegrationConfig({
        apiKey: "gsp-key",
        gstin: "27AABCU9603R1ZM",
        username: "nicuser",
        ...over,
      }),
    });

  const mkVendor = async () => {
    const [v] = await testDb()
      .insert(vendors)
      .values({ orgId, name: "Acme Traders" })
      .returning();
    return v!;
  };

  const mkInvoice = async (over: Record<string, unknown> = {}) => {
    const vendor = await mkVendor();
    const [inv] = await testDb()
      .insert(invoices)
      .values({
        orgId,
        invoiceNumber: `INV-${Date.now()}`,
        vendorId: vendor.id,
        supplierGstin: "27AABCU9603R1ZM",
        buyerGstin: "29AABCU9603R1ZP",
        taxableValue: "100000",
        cgstAmount: "0",
        sgstAmount: "0",
        igstAmount: "18000",
        totalTaxAmount: "18000",
        amount: "118000",
        isInterstate: true,
        ...over,
      })
      .returning();
    return inv!;
  };

  const mkEwayBill = async (over: Record<string, unknown> = {}) => {
    const inv = await mkInvoice();
    const payload = {
      op: "generate",
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: "01/04/2026",
      supplyType: "O",
      subSupplyType: "1",
      docType: "INV",
      fromGstin: "27AABCU9603R1ZM",
      toGstin: "29AABCU9603R1ZP",
      fromStateCode: 27,
      toStateCode: 29,
      transDistance: 120,
      totalValue: 118000,
      cgstValue: 0,
      sgstValue: 0,
      igstValue: 18000,
      itemList: [
        { productName: "Goods", hsnCode: "9999", quantity: 1, taxableAmount: 100000, cgstRate: 0, sgstRate: 0, igstRate: 0 },
      ],
    };
    const [row] = await testDb()
      .insert(ewayBills)
      .values({
        orgId,
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: "pending",
        consignmentValue: "100000",
        payloadJson: payload,
        ...over,
      })
      .returning();
    return row!;
  };

  const rowFor = async (id: string) => {
    const [row] = await testDb()
      .select()
      .from(ewayBills)
      .where(and(eq(ewayBills.id, id), eq(ewayBills.orgId, orgId)));
    return row!;
  };

  // ── Router: threshold gate + payload build ────────────────────────────────

  it("router rejects generation below the ₹50k goods threshold", async () => {
    const inv = await mkInvoice({ taxableValue: "40000", amount: "47200" });
    const caller = financialRouter.createCaller(createMockContext(adminId, orgId));
    await expect(
      caller.ewayBill.generate({ invoiceId: inv.id }),
    ).rejects.toThrow(/not required/i);
  });

  it("router builds the NIC payload + persists an eway_bills row above threshold", async () => {
    const inv = await mkInvoice();
    const caller = financialRouter.createCaller(createMockContext(adminId, orgId));
    const res = await caller.ewayBill.generate({ invoiceId: inv.id, transDistance: 120 });

    expect(res.ewayBillId).toBeTruthy();
    expect(res.status).toBe("pending");

    const persisted = await rowFor(res.ewayBillId);
    expect(persisted.invoiceId).toBe(inv.id);
    expect(Number(persisted.consignmentValue)).toBe(100000);
    const payload = persisted.payloadJson as Record<string, unknown>;
    expect(payload.op).toBe("generate");
    expect(payload.fromStateCode).toBe(27);
    expect(payload.toStateCode).toBe(29);
    expect(payload.transDistance).toBe(120);
    expect(payload.invoiceNumber).toBe(inv.invoiceNumber);
  });

  // ── Worker: generate ──────────────────────────────────────────────────────

  it("pushes to NIC and persists the EWB number + generated status", async () => {
    await connectNic();
    const ewb = await mkEwayBill();
    const calls = mockFetch({
      json: { ewayBillNo: 391000123456, validUpto: "05/04/2026 11:59:00 PM", status: "1" },
    });

    const res = await processEwayBillJob(testDb(), {
      ewayBillId: ewb.id,
      orgId,
      op: "generate",
    });

    expect(res.status).toBe("generated");
    expect(res.detail).toBe("391000123456");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/v1/ewaybill/generate");
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.docNo).toBe(ewb.invoiceNumber);
    expect(body.fromStateCode).toBe(27);

    const persisted = await rowFor(ewb.id);
    expect(persisted.status).toBe("generated");
    expect(persisted.ewbNo).toBe("391000123456");
    expect(persisted.validUpto).not.toBeNull();
    expect(persisted.portalError).toBeNull();
  });

  it("soft-fails as not_configured when no NIC integration is connected", async () => {
    const ewb = await mkEwayBill();
    const calls = mockFetch({ json: {} });

    const res = await processEwayBillJob(testDb(), {
      ewayBillId: ewb.id,
      orgId,
      op: "generate",
    });

    expect(res.status).toBe("not_configured");
    expect(calls).toHaveLength(0);
    const persisted = await rowFor(ewb.id);
    expect(persisted.status).toBe("not_configured");
    expect(persisted.ewbNo).toBeNull();
    expect(persisted.portalError).toMatch(/not connected/i);
  });

  it("marks failed and rethrows on a NIC rejection", async () => {
    await connectNic();
    const ewb = await mkEwayBill();
    mockFetch({ ok: false, status: 400, text: "invalid gstin" });

    await expect(
      processEwayBillJob(testDb(), { ewayBillId: ewb.id, orgId, op: "generate" }),
    ).rejects.toThrow(/NIC E-Way Bill generate failed/i);

    const persisted = await rowFor(ewb.id);
    expect(persisted.status).toBe("failed");
    expect(persisted.ewbNo).toBeNull();
    expect(persisted.portalError).toMatch(/invalid gstin/i);
  });

  it("is idempotent — skips a row already generated", async () => {
    await connectNic();
    const ewb = await mkEwayBill({ status: "generated", ewbNo: "391000999999" });
    const calls = mockFetch({ json: { ewayBillNo: 391000111111 } });

    const res = await processEwayBillJob(testDb(), {
      ewayBillId: ewb.id,
      orgId,
      op: "generate",
    });

    expect(res.status).toBe("skipped");
    expect(calls).toHaveLength(0);
    const persisted = await rowFor(ewb.id);
    expect(persisted.ewbNo).toBe("391000999999"); // untouched
  });

  // ── Worker: cancel ────────────────────────────────────────────────────────

  it("cancels a generated E-Way Bill on the NIC portal", async () => {
    await connectNic();
    const ewb = await mkEwayBill({ status: "generated", ewbNo: "391000777777" });
    const calls = mockFetch({ json: { ewayBillNo: 391000777777, cancelDate: "02/04/2026 10:00:00 AM" } });

    const res = await processEwayBillJob(testDb(), {
      ewayBillId: ewb.id,
      orgId,
      op: "cancel",
      cancelRsnCode: 2,
      cancelRemark: "Order cancelled",
    });

    expect(res.status).toBe("cancelled");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/v1/ewaybill/cancel");
    const persisted = await rowFor(ewb.id);
    expect(persisted.status).toBe("cancelled");
    expect(persisted.cancelledAt).not.toBeNull();
    expect(persisted.cancelReason).toBe("Order cancelled");
  });

  it("skips cancel when there is no EWB number on record", async () => {
    await connectNic();
    const ewb = await mkEwayBill(); // pending, no ewbNo
    const calls = mockFetch({ json: {} });

    const res = await processEwayBillJob(testDb(), {
      ewayBillId: ewb.id,
      orgId,
      op: "cancel",
    });

    expect(res.status).toBe("skipped");
    expect(calls).toHaveLength(0);
  });

  it("is tenant-scoped — a row owned by another org is not processed", async () => {
    await connectNic();
    const other = await seedFullOrg();
    const [theirVendor] = await testDb()
      .insert(vendors)
      .values({ orgId: other.orgId, name: "Other Co" })
      .returning();
    const [theirInv] = await testDb()
      .insert(invoices)
      .values({
        orgId: other.orgId,
        invoiceNumber: `OINV-${Date.now()}`,
        vendorId: theirVendor!.id,
        supplierGstin: "27AABCU9603R1ZM",
        taxableValue: "100000",
        amount: "118000",
      })
      .returning();
    const [theirs] = await testDb()
      .insert(ewayBills)
      .values({
        orgId: other.orgId,
        invoiceId: theirInv!.id,
        status: "pending",
        consignmentValue: "100000",
      })
      .returning();
    const calls = mockFetch({ json: { ewayBillNo: 1 } });

    const res = await processEwayBillJob(testDb(), {
      ewayBillId: theirs!.id,
      orgId, // our org
      op: "generate",
    });

    expect(res.status).toBe("skipped");
    expect(calls).toHaveLength(0);
  });
});
