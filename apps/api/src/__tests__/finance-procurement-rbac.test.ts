/**
 * FP wave — C6: viewer/report_viewer must not perform sensitive finance / vendor /
 * approval actions. Note: `requester` includes `procurement:write` — PR *create*
 * may remain allowed for this composite; see QA pack Part IV.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  createSession,
  cleanupOrg,
} from "./helpers";

describe("Finance & Procurement RBAC (FP C6)", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let adminToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL not set for finance-procurement-rbac tests");
    }
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    adminToken = await createSession(orgCtx.adminId);
    viewerToken = await createSession(orgCtx.viewerId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  it("viewer cannot list invoices (financial:read)", async () => {
    const viewerCaller = await authedCaller(viewerToken);
    await expect(viewerCaller.financial.listInvoices({ limit: 5 })).rejects.toThrow(
      /FORBIDDEN|permission denied/i,
    );
  });

  it("viewer cannot create budget line (budget:write)", async () => {
    const viewerCaller = await authedCaller(viewerToken);
    await expect(
      viewerCaller.financial.createBudgetLine({
        category: "Denied",
        fiscalYear: new Date().getFullYear(),
        budgeted: "100",
      }),
    ).rejects.toThrow(/FORBIDDEN|permission denied/i);
  });

  it("viewer cannot create vendor (vendors:write)", async () => {
    const viewerCaller = await authedCaller(viewerToken);
    await expect(
      viewerCaller.procurement.vendors.create({
        name: "Denied Vendor LLC",
        contactEmail: "denied@vendor.test",
      }),
    ).rejects.toThrow(/FORBIDDEN|permission denied/i);
  });

  it("viewer cannot create chargeback (chargebacks:write)", async () => {
    const viewerCaller = await authedCaller(viewerToken);
    await expect(
      viewerCaller.financial.createChargeback({
        department: "IT",
        service: "Cloud",
        amount: "100",
        periodMonth: 1,
        periodYear: new Date().getFullYear(),
      }),
    ).rejects.toThrow(/FORBIDDEN|permission denied/i);
  });

  it("viewer cannot approve purchase request (approvals:approve)", async () => {
    const adminCaller = await authedCaller(adminToken);
    const pr = (await adminCaller.procurement.purchaseRequests.create({
      title: "RBAC pending PR",
      justification: "Capital",
      items: [{ description: "Servers", quantity: 10, unitPrice: 10000 }],
      priority: "high",
      department: "IT",
    })) as { id: string; status: string };
    expect(pr.status).toBe("pending");

    const viewerCaller = await authedCaller(viewerToken);
    await expect(viewerCaller.procurement.purchaseRequests.approve({ id: pr.id })).rejects.toThrow(
      /FORBIDDEN|permission denied/i,
    );
  });

  it("admin can approve the pending PR after RBAC check", async () => {
    const adminCaller = await authedCaller(adminToken);
    const pr = (await adminCaller.procurement.purchaseRequests.create({
      title: "RBAC approve sanity",
      justification: "Capital",
      items: [{ description: "Racks", quantity: 2, unitPrice: 50000 }],
      priority: "high",
      department: "IT",
    })) as { id: string; status: string };
    expect(pr.status).toBe("pending");
    const approved = (await adminCaller.procurement.purchaseRequests.approve({ id: pr.id })) as {
      status: string;
    };
    expect(approved.status).toBe("approved");
  });
});
