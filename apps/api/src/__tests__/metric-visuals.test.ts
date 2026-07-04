/**
 * Command-Center metric visual contracts.
 *
 * These metrics feed the hub primary visuals (Finance AR-aging bar,
 * Strategy portfolio bubble matrix, Legal open-matters trend line). Each
 * resolver must emit the structured field the UI reads:
 *   - financial.ar_aged_60_plus → `categories` (aging buckets)
 *   - strategy.okr_progress_avg  → `scatter`   (one bubble per objective)
 *   - legal.open_matters         → `series`    (matters opened per bucket)
 *
 * Seeds a fresh org per case (self-isolating, per repo test policy) and
 * invokes the registered resolver directly against the real test DB.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getMetric } from "@coheronconnect/metrics";
import type { MetricResolveCtx } from "@coheronconnect/metrics";
import {
  invoices,
  vendors,
  okrObjectives,
  okrKeyResults,
  legalMatters,
  crmAccounts,
  purchaseOrders,
  goodsReceiptNotes,
  chartOfAccounts,
  journalEntries,
  journalEntryLines,
  employees,
} from "@coheronconnect/db";
import { nanoid } from "nanoid";
import { initTestEnvironment, testDb, seedTestOrg, seedUser } from "./helpers";

const RANGE: MetricResolveCtx["range"] = {
  start: new Date(Date.now() - 120 * 86400000),
  end: new Date(),
  granularity: "week",
};

function ctxFor(tenantId: string, userId: string): MetricResolveCtx {
  return { tenantId, userId, range: RANGE, services: { db: testDb() } };
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

beforeAll(async () => {
  await initTestEnvironment();
});

describe("financial.ar_aged_60_plus emits aging-bucket categories", () => {
  it("distributes receivable amounts across 0-30 / 31-60 / 61-90 / 90+", async () => {
    const db = testDb();
    const { orgId } = await seedTestOrg();
    const [vendor] = await db
      .insert(vendors)
      .values({ orgId, name: "AR bucket customer" })
      .returning();

    // One AR invoice per bucket, keyed by days-past-due.
    const rows = [
      { due: daysAgo(10), amt: "1000" }, // 0-30
      { due: daysAgo(45), amt: "2000" }, // 31-60
      { due: daysAgo(75), amt: "4000" }, // 61-90
      { due: daysAgo(120), amt: "8000" }, // 90+
    ];
    for (let i = 0; i < rows.length; i++) {
      await db.insert(invoices).values({
        orgId,
        vendorId: vendor!.id,
        invoiceNumber: `AR-AGE-${i}`,
        invoiceFlow: "receivable",
        amount: rows[i]!.amt,
        status: "approved",
        dueDate: rows[i]!.due,
      });
    }

    const v = await getMetric("financial.ar_aged_60_plus")!.resolve(ctxFor(orgId, orgId));

    // 60+ total drives the existing risk rules: 61-90 (4000) + 90+ (8000).
    expect(v.current).toBe(12000);

    const cats = v.categories ?? [];
    expect(cats).toHaveLength(4);
    const byLabel = Object.fromEntries(cats.map((c) => [c.label, c.value]));
    expect(byLabel["0–30d"]).toBe(1000);
    expect(byLabel["31–60d"]).toBe(2000);
    expect(byLabel["61–90d"]).toBe(4000);
    expect(byLabel["90d+"]).toBe(8000);
  });
});

describe("financial.ap_aged_60_plus emits aging-bucket categories", () => {
  it("distributes payable amounts across 0-30 / 31-60 / 61-90 / 90+", async () => {
    const db = testDb();
    const { orgId } = await seedTestOrg();
    const [vendor] = await db
      .insert(vendors)
      .values({ orgId, name: "AP bucket vendor" })
      .returning();

    // One AP invoice per bucket, keyed by days-past-due.
    const rows = [
      { due: daysAgo(10), amt: "1500" }, // 0-30
      { due: daysAgo(45), amt: "3000" }, // 31-60
      { due: daysAgo(75), amt: "5000" }, // 61-90
      { due: daysAgo(120), amt: "9000" }, // 90+
    ];
    for (let i = 0; i < rows.length; i++) {
      await db.insert(invoices).values({
        orgId,
        vendorId: vendor!.id,
        invoiceNumber: `AP-AGE-${i}`,
        invoiceFlow: "payable",
        amount: rows[i]!.amt,
        status: "approved",
        dueDate: rows[i]!.due,
      });
    }

    const v = await getMetric("financial.ap_aged_60_plus")!.resolve(ctxFor(orgId, orgId));

    // 60+ total: 61-90 (5000) + 90+ (9000).
    expect(v.current).toBe(14000);

    const cats = v.categories ?? [];
    expect(cats).toHaveLength(4);
    const byLabel = Object.fromEntries(cats.map((c) => [c.label, c.value]));
    expect(byLabel["0–30d"]).toBe(1500);
    expect(byLabel["31–60d"]).toBe(3000);
    expect(byLabel["61–90d"]).toBe(5000);
    expect(byLabel["90d+"]).toBe(9000);
  });
});

describe("csm.churn_rate_30d computes churn from account archival", () => {
  it("returns the share of accounts archived within the last 30 days", async () => {
    const db = testDb();
    const { orgId } = await seedTestOrg();

    // 3 active + 1 recently churned + 1 churned long ago (out of window).
    await db.insert(crmAccounts).values([
      { orgId, name: "Active A", archived: false },
      { orgId, name: "Active B", archived: false },
      { orgId, name: "Active C", archived: false },
      { orgId, name: "Churned recent", archived: true, updatedAt: daysAgo(10) },
      { orgId, name: "Churned old", archived: true, updatedAt: daysAgo(120) },
    ]);

    const v = await getMetric("csm.churn_rate_30d")!.resolve(ctxFor(orgId, orgId));

    // base = 3 active + 1 recent churn = 4; rate = 1/4 = 25%.
    expect(v.current).toBe(25);
    expect(v.state).toBe("stressed");
  });

  it("reports no_data when there are no accounts", async () => {
    const { orgId } = await seedTestOrg();
    const v = await getMetric("csm.churn_rate_30d")!.resolve(ctxFor(orgId, orgId));
    expect(v.state).toBe("no_data");
  });
});

describe("coo.vendor_sla_breaches counts late deliveries", () => {
  it("counts GRNs received after the PO expected-delivery date", async () => {
    const db = testDb();
    const { orgId } = await seedTestOrg();
    const [vendor] = await db.insert(vendors).values({ orgId, name: "SLA vendor" }).returning();

    // PO1: expected 20d ago, received 5d ago → late (breach).
    // PO2: expected 5d ago, received 10d ago → on time (no breach).
    const [po1] = await db
      .insert(purchaseOrders)
      .values({ orgId, poNumber: "PO-LATE", vendorId: vendor!.id, totalAmount: "1000", expectedDelivery: daysAgo(20) })
      .returning();
    const [po2] = await db
      .insert(purchaseOrders)
      .values({ orgId, poNumber: "PO-OK", vendorId: vendor!.id, totalAmount: "1000", expectedDelivery: daysAgo(5) })
      .returning();
    await db.insert(goodsReceiptNotes).values([
      { orgId, grnNumber: "GRN-1", poId: po1!.id, grnDate: daysAgo(5) }, // late
      { orgId, grnNumber: "GRN-2", poId: po2!.id, grnDate: daysAgo(10) }, // on time
    ]);

    const v = await getMetric("coo.vendor_sla_breaches")!.resolve(ctxFor(orgId, orgId));

    expect(v.current).toBe(1);
    expect(v.state).toBe("watch");
  });

  it("reports healthy when no deliveries are late", async () => {
    const db = testDb();
    const { orgId } = await seedTestOrg();
    const [vendor] = await db.insert(vendors).values({ orgId, name: "On-time vendor" }).returning();
    const [po] = await db
      .insert(purchaseOrders)
      .values({ orgId, poNumber: "PO-EARLY", vendorId: vendor!.id, totalAmount: "500", expectedDelivery: daysAgo(2) })
      .returning();
    await db.insert(goodsReceiptNotes).values({ orgId, grnNumber: "GRN-E", poId: po!.id, grnDate: daysAgo(5) });

    const v = await getMetric("coo.vendor_sla_breaches")!.resolve(ctxFor(orgId, orgId));
    expect(v.current).toBe(0);
    expect(v.state).toBe("healthy");
  });
});

describe("strategy.okr_progress_avg emits a portfolio scatter", () => {
  it("returns one bubble per active objective with progress + KR count", async () => {
    const db = testDb();
    const { orgId } = await seedTestOrg();
    const { userId } = await seedUser(orgId);

    const [obj] = await db
      .insert(okrObjectives)
      .values({
        orgId,
        ownerId: userId,
        title: "Scale platform reliability",
        year: 2026,
        status: "active",
        overallProgress: 80,
      })
      .returning();
    // Two key results → bubble y / size = 2.
    await db.insert(okrKeyResults).values([
      { orgId, objectiveId: obj!.id, title: "KR-1" },
      { orgId, objectiveId: obj!.id, title: "KR-2" },
    ]);

    const v = await getMetric("strategy.okr_progress_avg")!.resolve(ctxFor(orgId, userId));

    expect(v.current).toBe(80);
    const points = v.scatter ?? [];
    expect(points).toHaveLength(1);
    expect(points[0]!.x).toBe(80); // progress %
    expect(points[0]!.y).toBe(2); // key-result count
    expect(points[0]!.state).toBe("healthy"); // progress >= 70
  });
});

describe("legal.open_matters emits a real created-at series", () => {
  it("buckets matters opened within the range", async () => {
    const db = testDb();
    const { orgId } = await seedTestOrg();

    await db.insert(legalMatters).values([
      { orgId, matterNumber: "M-1", title: "Contract review", status: "intake", createdAt: daysAgo(60) },
      { orgId, matterNumber: "M-2", title: "IP filing", status: "active", createdAt: daysAgo(30) },
      { orgId, matterNumber: "M-3", title: "Closed dispute", status: "closed", createdAt: daysAgo(10) },
    ]);

    const v = await getMetric("legal.open_matters")!.resolve(ctxFor(orgId, orgId));

    // current = open matters (not closed): M-1 + M-2 = 2.
    expect(v.current).toBe(2);
    // series is bucketed from real created_at rows (3 matters total in range).
    expect(v.series.length).toBeGreaterThan(0);
    const total = v.series.reduce((s, p) => s + p.v, 0);
    expect(total).toBe(3);
  });
});

describe("financial.cash_runway_months divides liquid cash by trailing burn", () => {
  /** Seed a posted expense journal of `amount` dated `date`. */
  async function seedExpensePosting(
    orgId: string,
    expenseAccountId: string,
    cashAccountId: string,
    amount: string,
    date: Date,
    n: number,
  ) {
    const db = testDb();
    const [je] = await db
      .insert(journalEntries)
      .values({ orgId, number: `JE-BURN-${n}`, date, type: "manual", status: "posted" })
      .returning();
    await db.insert(journalEntryLines).values([
      { orgId, journalEntryId: je!.id, accountId: expenseAccountId, debitAmount: amount, creditAmount: "0" },
      { orgId, journalEntryId: je!.id, accountId: cashAccountId, debitAmount: "0", creditAmount: amount },
    ]);
  }

  it("computes cash ÷ average monthly burn over the trailing 3 months", async () => {
    const db = testDb();
    const { orgId } = await seedTestOrg();

    // Liquid cash = 600,000 across a bank + a cash account.
    const [bank] = await db
      .insert(chartOfAccounts)
      .values({ orgId, code: "1000", name: "Bank", type: "asset", subType: "bank", currentBalance: "500000" })
      .returning();
    await db
      .insert(chartOfAccounts)
      .values({ orgId, code: "1010", name: "Cash", type: "asset", subType: "cash", currentBalance: "100000" });
    // A non-liquid asset that must NOT count toward runway.
    await db
      .insert(chartOfAccounts)
      .values({ orgId, code: "1200", name: "AR", type: "asset", subType: "accounts_receivable", currentBalance: "9000000" });
    const [expense] = await db
      .insert(chartOfAccounts)
      .values({ orgId, code: "5000", name: "Opex", type: "expense", subType: "expense", currentBalance: "0" })
      .returning();

    // 300,000 of posted expense across the last 3 months → 100,000/mo burn.
    await seedExpensePosting(orgId, expense!.id, bank!.id, "100000", daysAgo(10), 1);
    await seedExpensePosting(orgId, expense!.id, bank!.id, "100000", daysAgo(40), 2);
    await seedExpensePosting(orgId, expense!.id, bank!.id, "100000", daysAgo(70), 3);
    // Out-of-window posting must be ignored.
    await seedExpensePosting(orgId, expense!.id, bank!.id, "500000", daysAgo(200), 4);

    const v = await getMetric("financial.cash_runway_months")!.resolve(ctxFor(orgId, orgId));

    // 600,000 cash ÷ 100,000/mo = 6.0 months.
    expect(v.current).toBe(6);
    // Thresholds: >12 healthy, >6 watch, else stressed — exactly 6 is stressed.
    expect(v.state).toBe("stressed");
  });

  it("reports no_data when there is no cash or no burn", async () => {
    const db = testDb();
    const { orgId } = await seedTestOrg();
    // Cash but zero expense postings → no burn signal.
    await db
      .insert(chartOfAccounts)
      .values({ orgId, code: "1000", name: "Bank", type: "asset", subType: "bank", currentBalance: "500000" });

    const v = await getMetric("financial.cash_runway_months")!.resolve(ctxFor(orgId, orgId));
    expect(v.state).toBe("no_data");
  });
});

describe("hr.headcount_active counts active employees with a trend", () => {
  async function seedEmployee(orgId: string, status: "active" | "terminated", startDate: Date, endDate?: Date) {
    const db = testDb();
    const { userId } = await seedUser(orgId);
    await db.insert(employees).values({
      orgId,
      userId,
      employeeId: `EMP-${nanoid(6)}`,
      status,
      startDate,
      endDate: endDate ?? null,
    });
  }

  it("returns the active headcount as current", async () => {
    const { orgId } = await seedTestOrg();
    await seedEmployee(orgId, "active", daysAgo(300));
    await seedEmployee(orgId, "active", daysAgo(200));
    await seedEmployee(orgId, "terminated", daysAgo(400), daysAgo(30));

    const v = await getMetric("hr.headcount_active")!.resolve(ctxFor(orgId, orgId));

    expect(v.current).toBe(2);
    expect(v.state).toBe("healthy");
    expect(v.series.length).toBeGreaterThan(0);
  });

  it("reports no_data when there are no active employees", async () => {
    const { orgId } = await seedTestOrg();
    const v = await getMetric("hr.headcount_active")!.resolve(ctxFor(orgId, orgId));
    expect(v.state).toBe("no_data");
  });
});
