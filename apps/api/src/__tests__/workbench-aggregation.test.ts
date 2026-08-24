/**
 * Regression guard for the workbench aggregate-truncation BLOCKER.
 *
 * Three workbench panels used to fetch a capped page of rows and then count /
 * sum them in JavaScript:
 *   • finance-ops AP/AR ageing   — `.limit(2000)`, JS bucket + rupee total
 *   • recruiter funnel           — `.limit(2000)`, JS tally by stage
 *   • grc control matrix         — `.limit(500)`,  JS tally by category×rating
 *
 * So any org holding more rows than the cap got a headline total — including a
 * money figure ("total exposure") — computed over an arbitrary, unordered
 * subset, with nothing signalling that rows were dropped. Quality bar #7 makes
 * silent truncation on an aggregate path a BLOCKER.
 *
 * The fix moved each aggregation into SQL (GROUP BY / SUM), so every matching
 * row is counted. Each case below seeds ONE row past the old cap and asserts
 * the panel counts them all — a number the pre-fix code could not have
 * produced. If someone reintroduces a `.limit(...)` on any of these aggregate
 * queries, the matching assertion fails.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  invoices,
  vendors,
  candidates,
  candidateApplications,
  jobRequisitions,
  riskControls,
} from "@coheronconnect/db";
import { nanoid } from "nanoid";
import {
  buildFinanceOpsPayload,
  buildRecruiterPayload,
  buildGrcPayload,
} from "../services/workbench-payloads";
import { initTestEnvironment, testDb, seedTestOrg, cleanupOrg } from "./helpers";

const seededOrgs: string[] = [];
async function freshOrg(): Promise<string> {
  const { orgId } = await seedTestOrg();
  seededOrgs.push(orgId);
  return orgId;
}

beforeAll(async () => {
  await initTestEnvironment();
});

afterAll(async () => {
  for (const orgId of seededOrgs) await cleanupOrg(orgId);
});

describe("finance-ops ageing counts and totals every matching invoice, not the first 2000", () => {
  it("sums all rows past the old cap into the 90+ bucket", async () => {
    const orgId = await freshOrg();
    const db = testDb();
    const [vendor] = await db
      .insert(vendors)
      .values({ orgId, name: `Cust ${nanoid(4)}` })
      .returning();

    const N = 2001; // one past the old `.limit(2000)`
    const dueDate = new Date(Date.now() - 100 * 86400000); // 100 days overdue -> "90+"
    const rows = Array.from({ length: N }, (_, i) => ({
      orgId,
      vendorId: vendor!.id,
      invoiceNumber: `AP-${i}-${nanoid(4)}`,
      invoiceFlow: "payable" as const,
      status: "pending" as const, // inside the ageing WHERE filter
      amount: "10.00",
      dueDate,
    }));
    await db.insert(invoices).values(rows);

    const payload = await buildFinanceOpsPayload({ db, orgId });
    expect(payload.apAging.state).toBe("ok");
    const bucket90 = payload.apAging.data!.find((b) => b.bucket === "90+")!;

    // Pre-fix, the capped fetch could see at most 2000 of these rows.
    expect(bucket90.count).toBe(N);
    // The rupee exposure must cover every invoice: 2001 x 10.00.
    expect(bucket90.totalAmount).toBe("20010.00");
  });
});

describe("recruiter funnel counts every application, not the first 2000", () => {
  it("tallies all applications in a stage past the old cap", async () => {
    const orgId = await freshOrg();
    const db = testDb();
    const [cand] = await db
      .insert(candidates)
      .values({ orgId, firstName: "Reg", lastName: "Test", email: `cand-${nanoid(6)}@example.com` })
      .returning();
    const [job] = await db
      .insert(jobRequisitions)
      .values({ orgId, number: `REQ-${nanoid(5)}`, title: "Engineer", department: "Engineering" })
      .returning();

    const N = 2001; // one past the old `.limit(2000)`
    const apps = Array.from({ length: N }, () => ({
      orgId,
      candidateId: cand!.id,
      jobId: job!.id,
      stage: "applied" as const,
    }));
    await db.insert(candidateApplications).values(apps);

    const payload = await buildRecruiterPayload({ db, orgId });
    expect(payload.funnel.state).toBe("ok");
    const applied = payload.funnel.data!.find((s) => s.stage === "applied")!;
    expect(applied.count).toBe(N);
  });
});

describe("grc control matrix counts every control, not the first 500", () => {
  it("tallies all controls in a cell past the old cap", async () => {
    const orgId = await freshOrg();
    const db = testDb();

    const N = 501; // one past the old `.limit(500)`
    const controls = Array.from({ length: N }, (_, i) => ({
      orgId,
      controlNumber: `CTL-${i}-${nanoid(4)}`,
      title: `Control ${i}`,
      controlCategory: "access_control",
      effectivenessRating: "effective" as const,
    }));
    await db.insert(riskControls).values(controls);

    const payload = await buildGrcPayload({ db, orgId });
    expect(payload.matrix.state).toBe("ok");
    const cell = payload.matrix.data!.find(
      (c) => c.category === "access_control" && c.effectiveness === "effective",
    )!;
    expect(cell.count).toBe(N);
  });
});
