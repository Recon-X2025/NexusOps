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
    const res = await dep.run({ assetId, throughFinancialYear: "2024-2025" });
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
    await dep.run({ assetId, throughFinancialYear: "2024-2025" });

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

    const res = await dep.runAll({ throughFinancialYear: "2024-2025" });
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
    await dep.run({ assetId, throughFinancialYear: "2024-2025" });
    await dep.run({ assetId, throughFinancialYear: "2025-2026" });

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
    const res = await bareDep.run({ assetId: a!.id, throughFinancialYear: "2024-2025" });
    // The charge still applies to the register.
    expect(res.charged).toBe(true);
    expect(res.depreciation).toBe(20_000);
    // …and the result SAYS the ledger did not move. Without this the caller sees
    // an unqualified success while the balance sheet and P&L silently stay wrong
    // — book value drops, the register reads settled, no error anywhere.
    expect(res.unposted).toBe(1);

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

  /**
   * The depreciation JE number used to be minted with `count(*) + 1` while
   * `accounting.journal.create` drew from the atomic per-(org, year) counter in
   * `org_counters`. Both write the same `JE-YYYY-NNNNN` namespace and
   * `je_org_number_idx` is UNIQUE, so posting depreciation silently poisoned the
   * NEXT manual journal entry:
   *
   *   journal.create → JE-2026-00001, JE-2026-00002   (counter = 2)
   *   depreciation   → count(*)+1 = 3 → JE-2026-00003 (counter still 2)
   *   journal.create → counter 2→3 → JE-2026-00003 → duplicate key → 500
   *
   * Harmless only while depreciation was unreachable. This round gives it a
   * screen and a scheduled run, so both paths now share one counter.
   */
  it("does not collide with journal.create's numbering", async () => {
    const coa = await acc.coa.list({ limit: 200 });
    const acctId = (code: string) => coa.find((x: any) => x.code === code)!.id;
    const manual = async (desc: string) =>
      (
        await acc.journal.create({
          date: new Date(),
          description: desc,
          lines: [
            { accountId: acctId("1110"), debitAmount: 100, creditAmount: 0 },
            { accountId: acctId("4110"), debitAmount: 0, creditAmount: 100 },
          ],
        })
      ).number;

    const n1 = await manual("Manual A");
    const n2 = await manual("Manual B");

    const assetId = await seedAsset(120_000);
    await dep.setup({ assetId, usefulLifeYears: 10 });
    await dep.run({ assetId, throughFinancialYear: "2024-2025" });

    // The one that used to blow up.
    const n3 = await manual("Manual C");

    const all = await testDb()
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.orgId, orgId));
    const numbers = all.map((j: any) => j.number);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(new Set([n1, n2, n3]).size).toBe(3);
  });
});
