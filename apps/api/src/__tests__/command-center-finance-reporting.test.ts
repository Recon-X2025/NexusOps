/**
 * Command Center — finance domain reports on recent (non-aged) invoices.
 *
 * Regression for a prod-only "empty Command Center" symptom: an org whose only
 * open invoices are recent (0–30 days) saw the whole board read "Awaiting module
 * data", while the AP/AR workbench (a direct invoice query) showed them fine.
 *
 * Two root causes, both fixed here:
 *   1. `domainsReporting` discarded any legitimately-computed *healthy zero*
 *      metric that lacked non-zero series history. `financial.ap_aged_60_plus`
 *      is ₹0 when the only open invoices are recent → finance wrongly counted as
 *      not reporting. The rule now counts any metric whose resolver returned a
 *      non-`no_data` state.
 *   2. There was no "total open AP/AR" metric — only the 60+ day aged variant —
 *      so the actual outstanding balance never surfaced as a value. Added
 *      `financial.ap_open` / `financial.ar_open`.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { nanoid } from "nanoid";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { accountingRouter } from "../routers/accounting";
import { financialRouter } from "../routers/financial";
import { buildCommandCenterPayload } from "../services/command-center-payload";
import { getMetricsForRole } from "@coheronconnect/metrics";

const RANGE = {
  start: new Date("2026-01-01"),
  end: new Date("2026-07-01"),
  granularity: "month" as const,
};

async function resolveMetric(id: string, tenantId: string): Promise<{ current: number; state: string }> {
  const def = getMetricsForRole("ceo").find((d) => d.id === id);
  if (!def) throw new Error(`metric ${id} not registered`);
  const v = await def.resolve({
    tenantId,
    userId: "00000000-0000-0000-0000-000000000088",
    range: RANGE,
    services: { db: testDb() },
  });
  return { current: v.current, state: v.state };
}

describe("Command Center finance reporting — recent invoices count as reporting", () => {
  let orgId: string;
  let adminId: string;
  let acc: any;
  let fin: any;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId!;
    acc = accountingRouter.createCaller(createMockContext(adminId, orgId));
    fin = financialRouter.createCaller(createMockContext(adminId, orgId));
    await acc.coa.seed();
  });

  it("financial.ap_open sums total open payables (healthy, not no_data)", async () => {
    const [vendor] = await testDb()
      .insert((await import("@coheronconnect/db")).vendors)
      .values({ orgId, name: `V ${nanoid(5)}` })
      .returning();
    const inv = await fin.createInvoice({
      vendorId: vendor!.id,
      invoiceNumber: `AP-${nanoid(6)}`,
      amount: "10000",
      gstRate: 18,
    });

    const ap = await resolveMetric("financial.ap_open", orgId);
    expect(ap.state).toBe("healthy");
    expect(ap.current).toBeCloseTo(Number(inv.amount), 2); // 11,800 gross
  });

  it("financial.ap_open is no_data when there are no open payables", async () => {
    const ap = await resolveMetric("financial.ap_open", orgId);
    expect(ap.state).toBe("no_data");
  });

  it("Command Center counts finance as reporting for a recent-invoice org", async () => {
    // A recent payable → aged-60+ AP is ₹0 (healthy zero), open AP is 11,800.
    const [vendor] = await testDb()
      .insert((await import("@coheronconnect/db")).vendors)
      .values({ orgId, name: `V ${nanoid(5)}` })
      .returning();
    await fin.createInvoice({
      vendorId: vendor!.id,
      invoiceNumber: `AP-${nanoid(6)}`,
      amount: "10000",
      gstRate: 18,
    });

    const payload = await buildCommandCenterPayload({
      role: "ceo",
      detectedRole: "ceo",
      canOverride: false,
      tenantId: orgId,
      userId: adminId,
      range: RANGE,
      db: testDb(),
    });

    // The board must not read "awaiting_data" when finance has live invoices.
    expect(payload.scoreState).not.toBe("awaiting_data");
    // The open-AP bullet surfaces the actual outstanding balance.
    const apBullet = payload.bullets.find((b) => b.metricId === "financial.ap_open");
    expect(apBullet).toBeTruthy();
    expect(apBullet!.state).toBe("healthy");
    expect(apBullet!.current).toBeGreaterThan(0);
  });
});
