/**
 * The ten in/out flow metrics that make the Platform Command Center actually
 * platform-wide (`packages/metrics/src/contributions/flow.ts`).
 *
 * WHY EVERY CASE ASSERTS AN EXACT NUMBER, NOT "> 0":
 * each resolver wraps its query in try/catch and returns `no_data` on error. A
 * typo in a table or column name would therefore fail SILENTLY — the metric
 * would read "—" on the dashboard and nothing would break. So each case seeds a
 * known set of rows and asserts the exact count, and asserts the state is NOT
 * `no_data`, which is what a swallowed error looks like.
 *
 * Rows are also seeded OUTSIDE the range and, where the demo data has them,
 * dated in the FUTURE — the platform total was wrong by 9 during verification
 * precisely because an unbounded query swept in 10 employees whose `start_date`
 * had not happened yet.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getMetric } from "@coheronconnect/metrics";
import type { MetricResolveCtx } from "@coheronconnect/metrics";
import {
  securityIncidents,
  employees,
  invoices,
  legalMatters,
  approvalRequests,
  vendors,
} from "@coheronconnect/db";
import { nanoid } from "nanoid";
import { initTestEnvironment, testDb, seedTestOrg, seedUser } from "./helpers";

const RANGE: MetricResolveCtx["range"] = {
  start: new Date(Date.now() - 120 * 86400000),
  end: new Date(),
  granularity: "week",
};
const ctxFor = (tenantId: string): MetricResolveCtx => ({
  tenantId,
  userId: tenantId,
  range: RANGE,
  services: { db: testDb() },
});

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
const daysAhead = (n: number) => new Date(Date.now() + n * 86400000);

async function resolve(id: string, orgId: string) {
  const m = getMetric(id);
  expect(m, `metric ${id} is not registered`).toBeTruthy();
  return m!.resolve(ctxFor(orgId));
}

/** A swallowed SQL error looks exactly like an empty tenant. */
function expectComputed(v: { current: number; state: string }, expected: number, id: string) {
  expect(v.state, `${id} returned no_data — a swallowed query error looks like this`).not.toBe("no_data");
  expect(v.current, `${id} miscounted`).toBe(expected);
}

beforeAll(async () => {
  await initTestEnvironment();
});

describe("security incident flow", () => {
  it("counts opened and resolved inside the range only", async () => {
    const { orgId } = await seedTestOrg();
    const db = testDb();
    await db.insert(securityIncidents).values([
      { orgId, number: `SEC-${nanoid(4)}`, title: "in range", severity: "high", status: "new", createdAt: daysAgo(10) },
      { orgId, number: `SEC-${nanoid(4)}`, title: "in range 2", severity: "low", status: "new", createdAt: daysAgo(20) },
      { orgId, number: `SEC-${nanoid(4)}`, title: "too old", severity: "low", status: "new", createdAt: daysAgo(400) },
      { orgId, number: `SEC-${nanoid(4)}`, title: "resolved in range", severity: "low", status: "closed", createdAt: daysAgo(30), resolvedAt: daysAgo(5) },
    ]);

    expectComputed(await resolve("security.incidents_opened_period", orgId), 3, "incidents_opened");
    expectComputed(await resolve("security.incidents_resolved_period", orgId), 1, "incidents_resolved");
  });
});

describe("headcount movement flow", () => {
  it("counts joiners and leavers, and excludes future start dates", async () => {
    const { orgId } = await seedTestOrg();
    const db = testDb();
    const mk = async (start: Date, end?: Date) => {
      const { userId } = await seedUser(orgId);
      await db.insert(employees).values({
        orgId, userId, employeeId: `EMP-${nanoid(6)}`,
        status: end ? "terminated" : "active", startDate: start, endDate: end ?? null,
      });
    };
    await mk(daysAgo(10));
    await mk(daysAgo(50));
    await mk(daysAgo(400));            // joined before the range
    await mk(daysAhead(30));           // NOT YET JOINED — must not count
    await mk(daysAgo(300), daysAgo(20)); // left inside the range

    // 2 joined in range; the future-dated hire and the old hire are excluded.
    expectComputed(await resolve("hr.joiners_period", orgId), 2, "joiners");
    expectComputed(await resolve("hr.leavers_period", orgId), 1, "leavers");
  });
});

describe("invoice flow", () => {
  it("counts receivables raised and paid, ignoring payables", async () => {
    const { orgId } = await seedTestOrg();
    const db = testDb();
    const [v] = await db.insert(vendors).values({ orgId, name: `Cust ${nanoid(4)}` }).returning();
    await db.insert(invoices).values([
      { orgId, vendorId: v!.id, invoiceNumber: `AR-${nanoid(5)}`, invoiceFlow: "receivable", amount: "100", createdAt: daysAgo(10) },
      { orgId, vendorId: v!.id, invoiceNumber: `AR-${nanoid(5)}`, invoiceFlow: "receivable", amount: "100", createdAt: daysAgo(20), paidAt: daysAgo(5) },
      { orgId, vendorId: v!.id, invoiceNumber: `AP-${nanoid(5)}`, invoiceFlow: "payable", amount: "100", createdAt: daysAgo(10) },
      { orgId, vendorId: v!.id, invoiceNumber: `AR-${nanoid(5)}`, invoiceFlow: "receivable", amount: "100", createdAt: daysAgo(400) },
    ]);

    // 2 receivables raised in range; the payable and the old one are excluded.
    expectComputed(await resolve("financial.invoices_raised_period", orgId), 2, "invoices_raised");
    expectComputed(await resolve("financial.invoices_paid_period", orgId), 1, "invoices_paid");
  });
});

describe("legal matter flow", () => {
  it("counts matters opened and closed in the range", async () => {
    const { orgId } = await seedTestOrg();
    const db = testDb();
    await db.insert(legalMatters).values([
      { orgId, matterNumber: `M-${nanoid(4)}`, title: "open A", status: "active", createdAt: daysAgo(10) },
      { orgId, matterNumber: `M-${nanoid(4)}`, title: "open B", status: "intake", createdAt: daysAgo(40) },
      { orgId, matterNumber: `M-${nanoid(4)}`, title: "old", status: "active", createdAt: daysAgo(400) },
      { orgId, matterNumber: `M-${nanoid(4)}`, title: "closed", status: "closed", createdAt: daysAgo(200), closedAt: daysAgo(15) },
    ]);

    expectComputed(await resolve("legal.matters_opened_period", orgId), 2, "matters_opened");
    expectComputed(await resolve("legal.matters_closed_period", orgId), 1, "matters_closed");
  });
});

describe("approval flow", () => {
  it("counts approvals raised and decided in the range", async () => {
    const { orgId } = await seedTestOrg();
    const db = testDb();
    // `approver_id` is NOT NULL — an approval always names who must decide.
    const { userId: approverId } = await seedUser(orgId);
    await db.insert(approvalRequests).values([
      { orgId, approverId, entityType: "contract", entityId: crypto.randomUUID(), status: "pending", createdAt: daysAgo(10) },
      { orgId, approverId, entityType: "contract", entityId: crypto.randomUUID(), status: "pending", createdAt: daysAgo(30) },
      { orgId, approverId, entityType: "contract", entityId: crypto.randomUUID(), status: "pending", createdAt: daysAgo(400) },
      { orgId, approverId, entityType: "contract", entityId: crypto.randomUUID(), status: "approved", createdAt: daysAgo(60), decidedAt: daysAgo(20) },
    ]);

    expectComputed(await resolve("approvals.raised_period", orgId), 3, "approvals_raised");
    expectComputed(await resolve("approvals.decided_period", orgId), 1, "approvals_decided");
  });
});

describe("every flow metric is reachable and tenant-scoped", () => {
  const IDS = [
    "security.incidents_opened_period",
    "security.incidents_resolved_period",
    "hr.joiners_period",
    "hr.leavers_period",
    "financial.invoices_raised_period",
    "financial.invoices_paid_period",
    "legal.matters_opened_period",
    "legal.matters_closed_period",
    "approvals.raised_period",
    "approvals.decided_period",
  ];

  it("registers all ten", () => {
    for (const id of IDS) expect(getMetric(id), `${id} missing`).toBeTruthy();
  });

  it("reports zero — not another tenant's rows — for an empty org", async () => {
    const { orgId } = await seedTestOrg();
    for (const id of IDS) {
      const v = await resolve(id, orgId);
      expect(v.current, `${id} leaked rows across tenants`).toBe(0);
    }
  });
});
