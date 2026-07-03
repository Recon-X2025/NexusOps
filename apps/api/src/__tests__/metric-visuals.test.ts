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
import { invoices, vendors, okrObjectives, okrKeyResults, legalMatters } from "@coheronconnect/db";
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
