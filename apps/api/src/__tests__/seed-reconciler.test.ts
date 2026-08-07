/**
 * Per-org seed reconciler (2026-08-07).
 *
 * Guards the drift fix for COA accounts 4130/4140 (credit/debit-note ledger), which
 * were added to INDIA_COA_SEED after the live org was seeded. The reconciler brings
 * every org up to the current definition on each deploy — insert-only, idempotent,
 * balance-safe, and never fatal.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedFullOrg, testDb, cleanupOrg } from "./helpers";
import { seedChartOfAccountsForOrg } from "../routers/accounting";
import { reconcileOrgSeeds, reconcileSeedsForAllOrgs } from "../lib/seed-reconciler";
import { chartOfAccounts, eq, and } from "@coheronconnect/db";

describe("per-org seed reconciler (COA drift fix)", () => {
  let orgId: string;

  beforeEach(async () => {
    orgId = (await seedFullOrg()).orgId;
    // Start from a clean COA so we control exactly what is present.
    await testDb().delete(chartOfAccounts).where(eq(chartOfAccounts.orgId, orgId));
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  async function coa(code: string) {
    const [row] = await testDb()
      .select()
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.orgId, orgId), eq(chartOfAccounts.code, code)));
    return row;
  }

  it("seedChartOfAccountsForOrg inserts missing accounts (incl. 4130/4140) and returns their codes; idempotent", async () => {
    const db = testDb();
    const first = await seedChartOfAccountsForOrg(db, orgId);
    expect(first).toContain("4130");
    expect(first).toContain("4140");
    expect(first.length).toBeGreaterThan(20);
    // Second pass adds nothing.
    const second = await seedChartOfAccountsForOrg(db, orgId);
    expect(second).toEqual([]);
  });

  it("reconciler re-adds a dropped account, logs it with the code, and leaves balances untouched", async () => {
    const db = testDb();
    await seedChartOfAccountsForOrg(db, orgId);
    // Simulate drift: a real balance on a kept account + a missing seed account.
    await db
      .update(chartOfAccounts)
      .set({ currentBalance: "5000" })
      .where(and(eq(chartOfAccounts.orgId, orgId), eq(chartOfAccounts.code, "4100")));
    await db.delete(chartOfAccounts).where(and(eq(chartOfAccounts.orgId, orgId), eq(chartOfAccounts.code, "4130")));
    expect(await coa("4130")).toBeUndefined();

    const infos: string[] = [];
    const errors: string[] = [];
    await reconcileOrgSeeds(db, orgId, orgId, { info: (m) => infos.push(m), error: (m) => errors.push(m) });

    // 4130 re-inserted with a zero balance…
    const readded = await coa("4130");
    expect(readded).toBeDefined();
    expect(Number(readded!.currentBalance)).toBe(0);
    // …logged loudly with the code and the reconciler name…
    expect(infos.some((l) => l.includes("4130") && l.includes("chart_of_accounts"))).toBe(true);
    // …and the untouched account keeps its balance.
    expect(Number((await coa("4100"))!.currentBalance)).toBe(5000);
  });

  it("is silent for an already-aligned org (adds nothing, logs nothing)", async () => {
    const db = testDb();
    await seedChartOfAccountsForOrg(db, orgId); // fully aligned now
    const infos: string[] = [];
    await reconcileOrgSeeds(db, orgId, orgId, { info: (m) => infos.push(m), error: () => {} });
    expect(infos).toEqual([]);
  });

  it("never throws when it cannot even enumerate orgs — logs loudly and returns", async () => {
    const errors: string[] = [];
    const brokenDb: any = {
      select: () => {
        throw new Error("db down");
      },
    };
    await expect(
      reconcileSeedsForAllOrgs(brokenDb, { info: () => {}, error: (m) => errors.push(m) }),
    ).resolves.toBeUndefined();
    expect(errors.some((l) => l.toLowerCase().includes("could not enumerate"))).toBe(true);
  });
});
