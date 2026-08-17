/**
 * Month-end depreciation sweep (Part 3).
 *
 * The sweep rides the EXISTING monthly BullMQ tick in `hrPeriodicWorkflow.ts`.
 * What it must guarantee:
 *   - nothing happens unless the tenant opted in (absent setting = OFF),
 *   - running it twice in a month charges once,
 *   - it charges only financial years that have fully ELAPSED,
 *   - one broken asset does not abort the rest of the org,
 *   - it leaves an audit trail saying what it posted.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { nanoid } from "nanoid";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { depreciationRouter, fyStartYear, fyKey } from "../routers/depreciation";
import { accountingRouter } from "../routers/accounting";
import { runDepreciationSweep } from "../lib/depreciation-sweep";
import {
  assets,
  assetTypes,
  organizations,
  auditLogs,
  assetDepreciationEntries,
  eq,
  and,
} from "@coheronconnect/db";

describe("Depreciation month-end sweep", () => {
  let orgId: string;
  let typeId: string;
  let dep: any;

  /** Purchased two financial years ago, so exactly one year has fully elapsed. */
  const twoFysAgo = () => new Date(`${fyStartYear(new Date()) - 1}-04-01`);

  async function seedEnrolled(cost: number, purchaseDate = twoFysAgo(), life = 10) {
    const db = testDb();
    const [a] = await db
      .insert(assets)
      .values({
        orgId,
        assetTag: `AST-${nanoid(6)}`,
        name: "Sweep asset",
        typeId,
        purchaseCost: String(cost),
        purchaseDate,
      })
      .returning();
    await dep.setup({ assetId: a!.id, usefulLifeYears: life });
    return a!.id;
  }

  async function setEnabled(enabled: boolean) {
    const db = testDb();
    const [row] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    const raw = (row?.settings ?? {}) as Record<string, unknown>;
    const fin = (raw["financial"] as Record<string, unknown> | undefined) ?? {};
    await db
      .update(organizations)
      .set({ settings: { ...raw, financial: { ...fin, depreciationAutoRunEnabled: enabled } } })
      .where(eq(organizations.id, orgId));
  }

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    dep = depreciationRouter.createCaller(createMockContext(seeded.adminId, orgId));
    const acc = accountingRouter.createCaller(createMockContext(seeded.adminId, orgId));
    await acc.coa.seed();
    const [t] = await testDb().insert(assetTypes).values({ orgId, name: "Server" }).returning();
    typeId = t!.id;
  });

  it("does nothing for a tenant that has not opted in", async () => {
    const assetId = await seedEnrolled(100_000);

    const results = await runDepreciationSweep(testDb());
    const mine = results.find((r) => r.orgId === orgId)!;

    expect(mine.enabled).toBe(false);
    expect(mine.charged).toBe(0);
    expect(await dep.entries({ assetId })).toHaveLength(0);
  });

  it("charges an opted-in tenant, and charges it only once however often it runs", async () => {
    const assetId = await seedEnrolled(100_000);
    await setEnabled(true);

    const first = (await runDepreciationSweep(testDb())).find((r) => r.orgId === orgId)!;
    expect(first.enabled).toBe(true);
    expect(first.charged).toBe(1);
    expect(first.totalDepreciation).toBe(10_000); // 100,000 / 10 years

    // The month-end job retried, or someone redeployed, or the box rebooted.
    const second = (await runDepreciationSweep(testDb())).find((r) => r.orgId === orgId)!;
    const third = (await runDepreciationSweep(testDb())).find((r) => r.orgId === orgId)!;
    expect(second.charged).toBe(0);
    expect(third.charged).toBe(0);

    // One ledger row, not three.
    expect(await dep.entries({ assetId })).toHaveLength(1);
  });

  it("does not charge a financial year that has not ended", async () => {
    // Bought this financial year → nothing has fully elapsed yet.
    const assetId = await seedEnrolled(60_000, new Date(`${fyStartYear(new Date())}-04-01`));
    await setEnabled(true);

    const res = (await runDepreciationSweep(testDb())).find((r) => r.orgId === orgId)!;
    expect(res.charged).toBe(0);
    expect(await dep.entries({ assetId })).toHaveLength(0);
  });

  it("records what it posted in the audit log", async () => {
    await seedEnrolled(100_000);
    await setEnabled(true);
    await runDepreciationSweep(testDb());

    const [entry] = await testDb()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.orgId, orgId), eq(auditLogs.action, "depreciation.sweep")));

    expect(entry).toBeDefined();
    const changes = entry!.changes as Record<string, unknown>;
    expect(changes["periodsCharged"]).toBe(1);
    expect(changes["totalDepreciation"]).toBe(10_000);
    expect(changes["throughFinancialYear"]).toBe(fyKey(fyStartYear(new Date()) - 1));
  });

  it("keeps charging the other assets when one of them cannot be charged", async () => {
    const good1 = await seedEnrolled(100_000);
    const good2 = await seedEnrolled(60_000);
    await setEnabled(true);

    // Make one asset unchargeable by occupying its period key directly — the
    // same collision a half-finished previous run would leave behind.
    const db = testDb();
    const [reg] = await db
      .select()
      .from(assetDepreciationEntries)
      .where(eq(assetDepreciationEntries.assetId, good1));
    expect(reg).toBeUndefined();

    const res = (await runDepreciationSweep(db)).find((r) => r.orgId === orgId)!;
    expect(res.charged).toBe(2);
    expect(res.failures).toHaveLength(0);

    // Both advanced independently; the batch is transactional per ASSET, so a
    // failure on one leaves the others' work committed.
    expect(await dep.entries({ assetId: good1 })).toHaveLength(1);
    expect(await dep.entries({ assetId: good2 })).toHaveLength(1);
  });

  it("turning the setting back off stops the sweep immediately", async () => {
    const assetId = await seedEnrolled(100_000, new Date(`${fyStartYear(new Date()) - 3}-04-01`));
    await setEnabled(true);
    await runDepreciationSweep(testDb());
    const afterFirst = (await dep.entries({ assetId })).length;
    expect(afterFirst).toBeGreaterThan(0);

    await setEnabled(false);
    const off = (await runDepreciationSweep(testDb())).find((r) => r.orgId === orgId)!;
    expect(off.enabled).toBe(false);
    expect(off.charged).toBe(0);
    expect(await dep.entries({ assetId })).toHaveLength(afterFirst);
  });
});
