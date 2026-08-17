/**
 * Invoice state-machine guard — regression tests for `audit-finance-ar-ap.md`
 * ARAP-2 / ARAP-3 / ARAP-4.
 *
 * Before the guard existed the rule "approve before you pay" lived only in the
 * screens, drawn in three blocks with three different rule sets, two of which
 * offered Mark Paid on a `pending` invoice. `markPaid` never read the stored
 * status, so the server accepted it: the invoice flipped to `paid`, the
 * settlement journal entry posted, and `approvedById` stayed null — which also
 * made the segregation-of-duties check vacuous, since it compares
 * `approvedById` to the current user.
 *
 * These tests fail if the guard is removed from either mutation.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  createSession,
  cleanupOrg,
} from "./helpers";
import { assertInvoiceTransition } from "../lib/invoice-transitions";

// ── The rules themselves (pure, no database) ────────────────────────────────

describe("assertInvoiceTransition — the rules", () => {
  const openPeriod = {}; // no closedPeriods configured
  const base = { invoiceDate: new Date("2026-06-15") };

  it("allows approving an invoice that has not been approved yet", () => {
    expect(() =>
      assertInvoiceTransition("approve", { ...base, status: "pending", approvedById: null }, openPeriod),
    ).not.toThrow();
  });

  it("allows paying an invoice that HAS an approver", () => {
    expect(() =>
      assertInvoiceTransition("pay", { ...base, status: "approved", approvedById: "user-1" }, openPeriod),
    ).not.toThrow();
  });

  it("REFUSES to pay an invoice with no approver — the control this restores", () => {
    expect(() =>
      assertInvoiceTransition("pay", { ...base, status: "pending", approvedById: null }, openPeriod),
    ).toThrow(/must be approved before/i);
  });

  it("keys payment on the stored approver, not the status — an overdue-but-approved invoice is payable", () => {
    // `overdue` is reachable both before and after approval, so status alone
    // cannot answer "was this approved?". The approver can.
    expect(() =>
      assertInvoiceTransition("pay", { ...base, status: "overdue", approvedById: "user-1" }, openPeriod),
    ).not.toThrow();
    expect(() =>
      assertInvoiceTransition("pay", { ...base, status: "overdue", approvedById: null }, openPeriod),
    ).toThrow(/must be approved before/i);
  });

  it("REFUSES to re-approve a paid invoice — this is what returned settled money to AP aging", () => {
    expect(() =>
      assertInvoiceTransition("approve", { ...base, status: "paid", approvedById: "user-1" }, openPeriod),
    ).toThrow(/already paid/i);
  });

  it("refuses any action on a cancelled invoice", () => {
    for (const action of ["approve", "pay"] as const) {
      expect(() =>
        assertInvoiceTransition(action, { ...base, status: "cancelled", approvedById: "user-1" }, openPeriod),
      ).toThrow(/cancelled/i);
    }
  });

  it("refuses BOTH actions inside a closed period (approve had no such check before)", () => {
    // Shape matters: `isInvoicePeriodClosed` reads `financial.closedPeriods`,
    // not a top-level key, and the month is derived in UTC.
    const closed = { financial: { closedPeriods: ["2026-06"] } };
    for (const action of ["approve", "pay"] as const) {
      expect(() =>
        assertInvoiceTransition(action, { ...base, status: "approved", approvedById: "user-1" }, closed),
      ).toThrow(/period is closed/i);
    }
  });

  it("throws a typed FORBIDDEN, not a bare Error", () => {
    try {
      assertInvoiceTransition("pay", { ...base, status: "pending", approvedById: null }, openPeriod);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      expect((e as TRPCError).code).toBe("FORBIDDEN");
    }
  });
});

// ── The mutations actually call it ──────────────────────────────────────────

describe("financial.approveInvoice / markPaid enforce the state machine", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let adminToken: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL not set for invoice-transitions tests");
    }
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    adminToken = await createSession(orgCtx.adminId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  async function newInvoice(tag: string) {
    const adminCaller = await authedCaller(adminToken);
    const vendor = (await adminCaller.procurement.vendors.create({
      name: `Transition vendor ${tag}`,
      contactEmail: `transition-${tag}-${Date.now()}@vendor.test`,
    })) as { id: string };
    return (await adminCaller.financial.createInvoice({
      vendorId: vendor.id,
      invoiceNumber: `TRANS-${tag}-${Date.now()}`,
      amount: "5000",
    })) as { id: string; status: string };
  }

  it("markPaid REFUSES an invoice that was never approved", async () => {
    const adminCaller = await authedCaller(adminToken);
    const inv = await newInvoice("UNAPPROVED");
    expect(inv.status).toBe("pending");

    await expect(
      adminCaller.financial.markPaid({ id: inv.id, paymentMethod: "transfer" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("approveInvoice REFUSES to regress an invoice that is already paid", async () => {
    const adminCaller = await authedCaller(adminToken);
    const financeToken = await createSession(orgCtx.financeId);
    const financeCaller = await authedCaller(financeToken);

    const inv = await newInvoice("REGRESS");
    // Approve as finance, pay as admin — segregation of duties satisfied.
    await financeCaller.financial.approveInvoice({ id: inv.id });
    const paid = (await adminCaller.financial.markPaid({
      id: inv.id,
      paymentMethod: "transfer",
    })) as { status: string };
    expect(paid.status).toBe("paid");

    await expect(
      financeCaller.financial.approveInvoice({ id: inv.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
