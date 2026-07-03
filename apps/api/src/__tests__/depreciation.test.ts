/**
 * Fixed-asset depreciation router tests (Sprint 2.1).
 *
 * The depreciation router (module: "cmdb") owns a per-asset register
 * (assetDepreciation) plus a period-by-period ledger (assetDepreciationEntries).
 * It wires the pure-math engine in @coheronconnect/payroll-math:
 *   - setup    : enrol/re-configure an asset (SLM/WDV, life, salvage, cost)
 *   - schedule : preview the full schedule (no writes)
 *   - run      : charge the next period (idempotent per (asset, period))
 *   - runAll   : batch the next due period for every enrolled asset
 *   - register : list current book values with totals
 *   - entries  : the ledger for one asset
 * Verifies the money-math wiring, idempotency, final-period true-up,
 * tenant isolation and RBAC.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, seedUser, testDb } from "./helpers";
import { depreciationRouter } from "../routers/depreciation";
import { assets, assetTypes, assetDepreciation, eq } from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("Depreciation router (Sprint 2.1)", () => {
  let caller: any;
  let orgId: string;
  let typeId: string;
  let seeded: Awaited<ReturnType<typeof seedFullOrg>>;

  /** Seeds an asset with a chosen purchase cost/date; returns its id. */
  async function seedAsset(
    purchaseCost?: number,
    purchaseDate: Date = new Date("2024-04-01"),
  ): Promise<string> {
    const db = testDb();
    const [a] = await db
      .insert(assets)
      .values({
        orgId,
        assetTag: `AST-${nanoid(6)}`,
        name: "Server",
        typeId,
        purchaseCost: purchaseCost != null ? String(purchaseCost) : null,
        purchaseDate,
      })
      .returning();
    return a!.id;
  }

  beforeEach(async () => {
    seeded = await seedFullOrg();
    orgId = seeded.orgId;
    caller = depreciationRouter.createCaller(createMockContext(seeded.adminId, orgId));
    const db = testDb();
    const [t] = await db.insert(assetTypes).values({ orgId, name: "Server" }).returning();
    typeId = t!.id;
  });

  // ── setup ────────────────────────────────────────────────────────────────────
  it("enrols an asset defaulting cost from the asset's purchase cost", async () => {
    const assetId = await seedAsset(100_000);
    const reg = await caller.setup({ assetId, usefulLifeYears: 5 });
    expect(Number(reg.cost)).toBe(100_000);
    expect(Number(reg.bookValue)).toBe(100_000);
    expect(Number(reg.accumulatedDepreciation)).toBe(0);
    expect(reg.method).toBe("SLM");
    expect(reg.periodsElapsed).toBe(0);
  });

  it("requires an explicit cost when the asset has no purchase cost", async () => {
    const assetId = await seedAsset(undefined);
    await expect(caller.setup({ assetId, usefulLifeYears: 5 })).rejects.toThrow(
      /purchase cost/i,
    );
    const reg = await caller.setup({ assetId, usefulLifeYears: 5, cost: 60_000 });
    expect(Number(reg.cost)).toBe(60_000);
  });

  it("rejects a salvage value at or above cost", async () => {
    const assetId = await seedAsset(100_000);
    await expect(
      caller.setup({ assetId, usefulLifeYears: 5, salvageValue: 100_000 }),
    ).rejects.toThrow(/salvage/i);
  });

  it("re-configures an unused enrolment but blocks once a period is charged", async () => {
    const assetId = await seedAsset(100_000);
    await caller.setup({ assetId, usefulLifeYears: 5 });
    // Re-setup before any charge is allowed (idempotent upsert).
    const re = await caller.setup({ assetId, usefulLifeYears: 10, method: "WDV" });
    expect(re.usefulLifeYears).toBe(10);
    expect(re.method).toBe("WDV");

    // Charge one period, then re-setup must be rejected.
    await caller.setup({ assetId, usefulLifeYears: 5, method: "SLM" });
    await caller.run({ assetId });
    await expect(
      caller.setup({ assetId, usefulLifeYears: 8 }),
    ).rejects.toThrow(/already has depreciation/i);
  });

  // ── schedule ───────────────────────────────────────────────────────────────
  it("previews an SLM schedule without writing any ledger entries", async () => {
    const assetId = await seedAsset(100_000);
    await caller.setup({ assetId, usefulLifeYears: 5, salvageValue: 10_000 });
    const sched = await caller.schedule({ assetId });
    expect(sched.method).toBe("SLM");
    expect(sched.periods).toHaveLength(5);
    // (100k − 10k)/5 = 18,000 each period.
    expect(Number(sched.periods[0].depreciation)).toBe(18_000);
    expect(Number(sched.periods[4].closingBookValue)).toBe(10_000);

    // No ledger written by preview.
    const ledger = await caller.entries({ assetId });
    expect(ledger).toHaveLength(0);
  });

  // ── run (SLM) ────────────────────────────────────────────────────────────────
  it("charges equal SLM periods, ties book value out, and trues up the final period", async () => {
    const assetId = await seedAsset(100_000);
    await caller.setup({ assetId, usefulLifeYears: 5, salvageValue: 10_000 });

    let last: any;
    for (let p = 1; p <= 5; p++) {
      last = await caller.run({ assetId });
      expect(last.charged).toBe(true);
      expect(last.period).toBe(p);
    }
    // Final period lands exactly on salvage.
    expect(last.bookValue).toBe(10_000);
    expect(last.fullyDepreciated).toBe(true);

    const [reg] = await testDb()
      .select()
      .from(assetDepreciation)
      .where(eq(assetDepreciation.assetId, assetId));
    expect(Number(reg!.bookValue)).toBe(10_000);
    expect(Number(reg!.accumulatedDepreciation)).toBe(90_000);
    expect(reg!.fullyDepreciated).toBe(true);
    expect(reg!.periodsElapsed).toBe(5);

    // Ledger has exactly five entries, first charge = 18,000.
    const ledger = await caller.entries({ assetId });
    expect(ledger).toHaveLength(5);
    expect(Number(ledger[0].depreciation)).toBe(18_000);
    expect(Number(ledger[4].closingBookValue)).toBe(10_000);
  });

  it("refuses to charge past a fully-depreciated asset", async () => {
    const assetId = await seedAsset(50_000);
    await caller.setup({ assetId, usefulLifeYears: 2 });
    await caller.run({ assetId });
    await caller.run({ assetId });
    await expect(caller.run({ assetId })).rejects.toThrow(/fully depreciated/i);
  });

  // ── run (WDV) ────────────────────────────────────────────────────────────────
  it("charges declining WDV amounts that never fall below salvage", async () => {
    const assetId = await seedAsset(100_000);
    await caller.setup({
      assetId,
      usefulLifeYears: 5,
      salvageValue: 10_000,
      method: "WDV",
    });

    const first = await caller.run({ assetId });
    const second = await caller.run({ assetId });
    // Declining-balance: the second charge is strictly smaller than the first.
    expect(second.depreciation).toBeLessThan(first.depreciation);
    expect(second.bookValue).toBeLessThan(first.bookValue);
    expect(second.bookValue).toBeGreaterThanOrEqual(10_000);
  });

  // ── runAll ─────────────────────────────────────────────────────────────────
  it("batches the next due period across all enrolled assets", async () => {
    const a1 = await seedAsset(100_000);
    const a2 = await seedAsset(60_000);
    await caller.setup({ assetId: a1, usefulLifeYears: 5 });
    await caller.setup({ assetId: a2, usefulLifeYears: 3 });

    const res = await caller.runAll();
    expect(res.charged).toBe(2);
    expect(res.totalDepreciation).toBeGreaterThan(0);

    // Each asset now has exactly one ledger entry (period 1).
    expect(await caller.entries({ assetId: a1 })).toHaveLength(1);
    expect(await caller.entries({ assetId: a2 })).toHaveLength(1);
  });

  // ── register ──────────────────────────────────────────────────────────────
  it("lists the register with book-value totals", async () => {
    const a1 = await seedAsset(100_000);
    const a2 = await seedAsset(60_000);
    await caller.setup({ assetId: a1, usefulLifeYears: 5 });
    await caller.setup({ assetId: a2, usefulLifeYears: 3 });
    await caller.run({ assetId: a1 });

    const reg = await caller.register();
    expect(reg.items).toHaveLength(2);
    expect(reg.totalCost).toBe(160_000);
    // a1 charged one 20,000 SLM period → book value 80,000; a2 untouched 60,000.
    expect(reg.totalBookValue).toBe(140_000);
    expect(reg.totalAccumulated).toBe(20_000);
  });

  // ── tenant isolation ─────────────────────────────────────────────────────
  it("does not enrol an asset that belongs to another org", async () => {
    const other = await seedFullOrg();
    const [ot] = await testDb()
      .insert(assetTypes)
      .values({ orgId: other.orgId, name: "Server" })
      .returning();
    const [foreign] = await testDb()
      .insert(assets)
      .values({
        orgId: other.orgId,
        assetTag: "AST-FOREIGN",
        name: "Foreign",
        typeId: ot!.id,
        purchaseCost: "100000",
      })
      .returning();

    await expect(
      caller.setup({ assetId: foreign!.id, usefulLifeYears: 5 }),
    ).rejects.toThrow(/not found/i);
  });

  // ── RBAC ─────────────────────────────────────────────────────────────────
  it("denies write to a member without cmdb:write", async () => {
    const { userId } = await seedUser(orgId, {
      email: `viewer-${nanoid(6)}@qa.coheronconnect.io`,
      role: "member",
      matrixRole: "viewer",
      password: "TestPass123!",
    });
    const assetId = await seedAsset(100_000);
    const memberCaller = depreciationRouter.createCaller(
      createMockContext(userId, orgId, {
        user: {
          id: userId,
          orgId,
          email: "viewer@qa.coheronconnect.io",
          name: "Viewer",
          role: "member",
          matrixRole: "viewer",
          status: "active",
        },
      }),
    );
    await expect(
      memberCaller.setup({ assetId, usefulLifeYears: 5 }),
    ).rejects.toThrow();
  });
});
