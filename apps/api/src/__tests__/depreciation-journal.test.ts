/**
 * Depreciation → GL journal-entry auto-posting (Sprint 2 carry-over).
 *
 * The depreciation register (Sprint 2.1) stored the right numbers but never
 * posted them to the ledger, so the balance-sheet rollup drifted. `run` and
 * `runAll` now post a balanced entry per charge:
 *
 *   Dr  Depreciation expense     (5500) = charge
 *   Cr  Accumulated Depreciation (1290) = charge   (contra-asset → negative balance)
 *
 * and back-populate `assetDepreciationEntries.journalEntryId`. This locks in
 * that wiring: balanced posting, balance movement, back-reference, idempotency,
 * and the graceful skip when the COA isn't seeded.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { nanoid } from "nanoid";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { depreciationRouter } from "../routers/depreciation";
import { accountingRouter } from "../routers/accounting";
import {
  assets,
  assetTypes,
  assetDepreciationEntries,
  chartOfAccounts,
  journalEntries,
  eq,
  and,
} from "@coheronconnect/db";

const TOL = 0.01;

async function coaBalance(orgId: string, code: string): Promise<number> {
  const db = testDb();
  const [row] = await db
    .select({ currentBalance: chartOfAccounts.currentBalance })
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.orgId, orgId), eq(chartOfAccounts.code, code)));
  return Number(row?.currentBalance ?? 0);
}

describe("Depreciation GL posting — charge auto-posts a balanced journal entry", () => {
  let orgId: string;
  let adminId: string;
  let typeId: string;
  let dep: any;
  let acc: any;

  async function seedAsset(purchaseCost: number): Promise<string> {
    const db = testDb();
    const [a] = await db
      .insert(assets)
      .values({
        orgId,
        assetTag: `AST-${nanoid(6)}`,
        name: "Server",
        typeId,
        purchaseCost: String(purchaseCost),
        purchaseDate: new Date("2024-04-01"),
      })
      .returning();
    return a!.id;
  }

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId!;
    dep = depreciationRouter.createCaller(createMockContext(adminId, orgId));
    acc = accountingRouter.createCaller(createMockContext(adminId, orgId));
    await acc.coa.seed();
    const [t] = await testDb().insert(assetTypes).values({ orgId, name: "Server" }).returning();
    typeId = t!.id;
  });

  it("run posts a balanced JE (5500 rises, 1290 falls) by the charge", async () => {
    const assetId = await seedAsset(100_000);
    await dep.setup({ assetId, usefulLifeYears: 5 }); // SLM → 20,000/period

    const expenseBefore = await coaBalance(orgId, "5500");
    const accumBefore = await coaBalance(orgId, "1290");
    const res = await dep.run({ assetId });
    expect(res.charged).toBe(true);
    expect(res.depreciation).toBe(20_000);

    const expenseAfter = await coaBalance(orgId, "5500");
    const accumAfter = await coaBalance(orgId, "1290");
    // 5500 expense (debit-normal) rises by the charge.
    expect(Math.abs(expenseAfter - expenseBefore - 20_000)).toBeLessThan(TOL);
    // 1290 accumulated depreciation (contra-asset, credited) falls by the charge.
    expect(Math.abs(accumAfter - accumBefore - -20_000)).toBeLessThan(TOL);

    // Exactly one depreciation JE, balanced.
    const jes = await testDb()
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.type, "depreciation")));
    expect(jes).toHaveLength(1);
    expect(Number(jes[0]!.totalDebit)).toBe(Number(jes[0]!.totalCredit));
    expect(Number(jes[0]!.totalDebit)).toBe(20_000);
  });

  it("back-populates assetDepreciationEntries.journalEntryId", async () => {
    const assetId = await seedAsset(100_000);
    await dep.setup({ assetId, usefulLifeYears: 5 });
    await dep.run({ assetId });

    const [entry] = await testDb()
      .select()
      .from(assetDepreciationEntries)
      .where(and(eq(assetDepreciationEntries.assetId, assetId), eq(assetDepreciationEntries.period, 1)));
    expect(entry!.journalEntryId).toBeTruthy();

    const [je] = await testDb()
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, entry!.journalEntryId!));
    expect(je).toBeTruthy();
    expect(je!.type).toBe("depreciation");
  });

  it("runAll posts one JE per enrolled asset", async () => {
    const a1 = await seedAsset(100_000);
    const a2 = await seedAsset(60_000);
    await dep.setup({ assetId: a1, usefulLifeYears: 5 });
    await dep.setup({ assetId: a2, usefulLifeYears: 3 });

    const res = await dep.runAll();
    expect(res.charged).toBe(2);

    const jes = await testDb()
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.type, "depreciation")));
    expect(jes).toHaveLength(2);
    for (const je of jes) {
      expect(Number(je.totalDebit)).toBe(Number(je.totalCredit));
    }
    // Both ledger entries carry a JE back-reference.
    for (const assetId of [a1, a2]) {
      const [entry] = await testDb()
        .select()
        .from(assetDepreciationEntries)
        .where(and(eq(assetDepreciationEntries.assetId, assetId), eq(assetDepreciationEntries.period, 1)));
      expect(entry!.journalEntryId).toBeTruthy();
    }
  });

  it("does not post a second JE when a fully-charged asset is re-run", async () => {
    // 2-year life → two charges then fully depreciated; the guard rejects a 3rd.
    const assetId = await seedAsset(50_000);
    await dep.setup({ assetId, usefulLifeYears: 2 });
    await dep.run({ assetId });
    await dep.run({ assetId });

    const before = await testDb()
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.type, "depreciation")));
    expect(before).toHaveLength(2);

    // A third run is rejected (fully depreciated) → no third JE.
    await expect(dep.run({ assetId })).rejects.toThrow(/fully depreciated/i);
    const after = await testDb()
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.type, "depreciation")));
    expect(after).toHaveLength(2);
  });

  it("still charges but posts no JE when the depreciation COA is not seeded", async () => {
    // Fresh org WITHOUT coa.seed().
    const bare = await seedFullOrg();
    const bareDep = depreciationRouter.createCaller(createMockContext(bare.adminId!, bare.orgId));
    const [t] = await testDb().insert(assetTypes).values({ orgId: bare.orgId, name: "Server" }).returning();
    const [a] = await testDb()
      .insert(assets)
      .values({
        orgId: bare.orgId,
        assetTag: `AST-${nanoid(6)}`,
        name: "Server",
        typeId: t!.id,
        purchaseCost: "100000",
        purchaseDate: new Date("2024-04-01"),
      })
      .returning();
    await bareDep.setup({ assetId: a!.id, usefulLifeYears: 5 });
    const res = await bareDep.run({ assetId: a!.id });
    // The charge still applies to the register.
    expect(res.charged).toBe(true);
    expect(res.depreciation).toBe(20_000);

    // No JE, and the ledger entry has no back-reference.
    const jes = await testDb()
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.orgId, bare.orgId), eq(journalEntries.type, "depreciation")));
    expect(jes).toHaveLength(0);
    const [entry] = await testDb()
      .select()
      .from(assetDepreciationEntries)
      .where(and(eq(assetDepreciationEntries.assetId, a!.id), eq(assetDepreciationEntries.period, 1)));
    expect(entry!.journalEntryId).toBeNull();
  });
});
