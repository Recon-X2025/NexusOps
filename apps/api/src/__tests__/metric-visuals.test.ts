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
  tickets,
  ticketStatuses,
  securityIncidents,
  surveys,
  surveyResponses,
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
  it("returns the churn share once the account base clears the sample floor", async () => {
    const db = testDb();
    const { orgId } = await seedTestOrg();

    // 18 active + 2 recently churned = base 20 (the floor); one churned long ago
    // (out of the 30d window) must not count. rate = 2/20 = 10%.
    const rows = [];
    for (let i = 0; i < 18; i++) rows.push({ orgId, name: `Active ${i}`, archived: false });
    rows.push({ orgId, name: "Churned r1", archived: true, updatedAt: daysAgo(5) });
    rows.push({ orgId, name: "Churned r2", archived: true, updatedAt: daysAgo(10) });
    rows.push({ orgId, name: "Churned old", archived: true, updatedAt: daysAgo(120) });
    await db.insert(crmAccounts).values(rows);

    const v = await getMetric("csm.churn_rate_30d")!.resolve(ctxFor(orgId, orgId));

    expect(v.current).toBe(10);
    expect(v.state).toBe("stressed");
  });

  it("suppresses churn below the sample floor (H4: no confident stressed off one row)", async () => {
    const db = testDb();
    const { orgId } = await seedTestOrg();
    // 3 active + 1 churned = base 4 → 25% under the old logic (a CEO alert).
    // Below the 20-account floor this must report no_data, not stressed.
    await db.insert(crmAccounts).values([
      { orgId, name: "Active A", archived: false },
      { orgId, name: "Active B", archived: false },
      { orgId, name: "Active C", archived: false },
      { orgId, name: "Churned recent", archived: true, updatedAt: daysAgo(10) },
    ]);

    const v = await getMetric("csm.churn_rate_30d")!.resolve(ctxFor(orgId, orgId));
    expect(v.state).toBe("no_data");
  });

  it("reports no_data when there are no accounts", async () => {
    const { orgId } = await seedTestOrg();
    const v = await getMetric("csm.churn_rate_30d")!.resolve(ctxFor(orgId, orgId));
    expect(v.state).toBe("no_data");
  });
});

describe("csm.csat_avg holds a sample-size floor", () => {
  async function seedCsat(orgId: string, scores: string[]) {
    const db = testDb();
    const [survey] = await db
      .insert(surveys)
      .values({ orgId, title: "CSAT", type: "csat" })
      .returning();
    if (scores.length > 0) {
      await db
        .insert(surveyResponses)
        .values(scores.map((s) => ({ surveyId: survey!.id, score: s })));
    }
  }

  it("computes the average once enough responses exist", async () => {
    const { orgId } = await seedTestOrg();
    await seedCsat(orgId, ["5", "5", "4", "5", "4"]); // 5 responses, avg 4.6
    const v = await getMetric("csm.csat_avg")!.resolve(ctxFor(orgId, orgId));
    expect(v.current).toBe(4.6);
    expect(v.state).toBe("healthy");
  });

  it("suppresses the score below the sample floor (H4)", async () => {
    const { orgId } = await seedTestOrg();
    // Two low responses would read as a confident "stressed" without a floor.
    await seedCsat(orgId, ["2", "2"]);
    const v = await getMetric("csm.csat_avg")!.resolve(ctxFor(orgId, orgId));
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

  it("excludes late receipts before the period so the light can recover", async () => {
    // H3: the count used to be every late GRN ever, so an org that once had late
    // deliveries stayed stressed forever. A breach received 200d ago is outside
    // the 120d range and must no longer count.
    const db = testDb();
    const { orgId } = await seedTestOrg();
    const [vendor] = await db.insert(vendors).values({ orgId, name: "Recovered vendor" }).returning();
    const [po] = await db
      .insert(purchaseOrders)
      .values({ orgId, poNumber: "PO-OLD", vendorId: vendor!.id, totalAmount: "1000", expectedDelivery: daysAgo(220) })
      .returning();
    await db.insert(goodsReceiptNotes).values({ orgId, grnNumber: "GRN-OLD", poId: po!.id, grnDate: daysAgo(200) });

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

describe("legal.open_matters plots the SAME quantity its headline reports", () => {
  /**
   * CONTRACT CHANGE. The series used to be matters OPENED per bucket while
   * `current` was matters still open — two different quantities under one title
   * ("Open legal matters: 25" above an "Open Legal Matters Trend" whose axis
   * topped out at 3). The series is now matters open AT each bucket, so the
   * final point reconciles with the headline.
   */
  it("ends on the headline figure, and grows as matters accumulate", async () => {
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
    expect(v.series.length).toBeGreaterThan(0);

    // The point of the fix: the last bucket agrees with the headline.
    expect(v.series[v.series.length - 1]!.v).toBe(v.current);

    // A closed matter never counts as open, and no bucket may exceed the total.
    for (const p of v.series) expect(p.v).toBeLessThanOrEqual(2);

    // Open-at-a-time is cumulative, so it never decreases while nothing closes.
    for (let i = 1; i < v.series.length; i++) {
      expect(v.series[i]!.v).toBeGreaterThanOrEqual(v.series[i - 1]!.v);
    }
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
    expect(v.series.length).toBeGreaterThan(0);

    // CONTRACT CHANGE: `state` used to be the literal "healthy" and could never
    // move. It is now derived from the metric's own trailing trend, so this
    // fixture — where a termination 30 days ago took headcount from 3 to 2 —
    // must FLAG the decline rather than call a shrinking team healthy.
    expect(v.state).toBe("watch");
  });

  it("reports no_data when there are no active employees", async () => {
    const { orgId } = await seedTestOrg();
    const v = await getMetric("hr.headcount_active")!.resolve(ctxFor(orgId, orgId));
    expect(v.state).toBe("no_data");
  });
});

describe("tickets.sla_compliance is scoped to the period, not lifetime", () => {
  /**
   * H3. The headline % used to count every ticket the org ever had, so a burst
   * of breaches long ago pinned the light red forever while the trend beside it
   * read 100%. The headline is now scoped to the SAME created-in-range window as
   * the trend, so a stale breach cannot drag it.
   */
  it("an out-of-window breach does not lower the current compliance", async () => {
    const db = testDb();
    const { orgId } = await seedTestOrg();
    const { userId } = await seedUser(orgId);
    const [status] = await db
      .insert(ticketStatuses)
      .values({ orgId, name: "Open", category: "open" })
      .returning();
    const mk = (num: string, created: Date, breached: boolean) =>
      db.insert(tickets).values({
        orgId,
        number: num,
        title: num,
        statusId: status!.id,
        requesterId: userId,
        createdAt: created,
        slaBreached: breached,
      });

    // In window (< 120d): four clean tickets → 100% compliant.
    await mk("T-1", daysAgo(10), false);
    await mk("T-2", daysAgo(20), false);
    await mk("T-3", daysAgo(30), false);
    await mk("T-4", daysAgo(40), false);
    // Out of window (200d ago): a breach that must NOT count. Under the old
    // lifetime logic this made it 4/5 = 80% (stressed).
    await mk("T-OLD", daysAgo(200), true);

    const v = await getMetric("tickets.sla_compliance")!.resolve(ctxFor(orgId, orgId));
    expect(v.current).toBe(100);
    expect(v.state).toBe("healthy");
  });
});

describe("financial.burn_rate sums posted expense within the period", () => {
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
      .values({ orgId, number: `JE-BR-${n}`, date, type: "manual", status: "posted" })
      .returning();
    await db.insert(journalEntryLines).values([
      { orgId, journalEntryId: je!.id, accountId: expenseAccountId, debitAmount: amount, creditAmount: "0" },
      { orgId, journalEntryId: je!.id, accountId: cashAccountId, debitAmount: "0", creditAmount: amount },
    ]);
  }

  it("counts posted expense lines in range and ignores out-of-window postings", async () => {
    // H3: this used to sum cumulative COA balances, which never period-close, so
    // it only grew and tripped the fixed watch line permanently. It now sums
    // dated postings within the range, exactly as cash_runway_months does.
    const db = testDb();
    const { orgId } = await seedTestOrg();
    const [cash] = await db
      .insert(chartOfAccounts)
      .values({ orgId, code: "1000", name: "Bank", type: "asset", subType: "bank", currentBalance: "0" })
      .returning();
    const [expense] = await db
      .insert(chartOfAccounts)
      .values({ orgId, code: "5000", name: "Opex", type: "expense", subType: "expense", currentBalance: "0" })
      .returning();

    // In window: 50,000 + 30,000 = 80,000.
    await seedExpensePosting(orgId, expense!.id, cash!.id, "50000", daysAgo(10), 1);
    await seedExpensePosting(orgId, expense!.id, cash!.id, "30000", daysAgo(60), 2);
    // Out of window (200d ago, before the 120d range start) — must be ignored.
    await seedExpensePosting(orgId, expense!.id, cash!.id, "900000", daysAgo(200), 3);

    const v = await getMetric("financial.burn_rate")!.resolve(ctxFor(orgId, orgId));
    expect(v.current).toBe(80000);
    expect(v.state).toBe("healthy"); // 80,000 < 1,000,000 watch line
  });

  it("reports no_data when no expense is posted in the period", async () => {
    const { orgId } = await seedTestOrg();
    // A cumulative balance with no dated postings must NOT read as a confident 0.
    const db = testDb();
    await db
      .insert(chartOfAccounts)
      .values({ orgId, code: "5000", name: "Opex", type: "expense", subType: "expense", currentBalance: "750000" });

    const v = await getMetric("financial.burn_rate")!.resolve(ctxFor(orgId, orgId));
    expect(v.state).toBe("no_data");
  });
});

describe("security.incidents_open_total series reconciles with the headline", () => {
  /**
   * H3 (same defect legal.open_matters fixed). The headline was "open now" while
   * the series was "created per bucket" — two quantities under one card. The
   * series is now incidents open AT each bucket, so the last point matches the
   * headline, and resolved/false-positive incidents are excluded from both.
   */
  it("headline = open now, and the last bucket equals it", async () => {
    const db = testDb();
    const { orgId } = await seedTestOrg();
    await db.insert(securityIncidents).values([
      { orgId, number: "INC-1", title: "Phishing", status: "new", createdAt: daysAgo(60) },
      { orgId, number: "INC-2", title: "Malware", status: "triage", createdAt: daysAgo(30) },
      { orgId, number: "INC-3", title: "Handled", status: "closed", createdAt: daysAgo(50), resolvedAt: daysAgo(20) },
      { orgId, number: "INC-4", title: "False alarm", status: "false_positive", createdAt: daysAgo(15), resolvedAt: daysAgo(14) },
    ]);

    const v = await getMetric("security.incidents_open_total")!.resolve(ctxFor(orgId, orgId));

    // open now = INC-1 + INC-2 (closed + false_positive excluded).
    expect(v.current).toBe(2);
    expect(v.series.length).toBeGreaterThan(0);
    // The point of the fix: the last bucket agrees with the headline.
    expect(v.series[v.series.length - 1]!.v).toBe(v.current);
    // No bucket exceeds the number of incidents ever created in-window.
    for (const p of v.series) expect(p.v).toBeLessThanOrEqual(4);
  });
});
