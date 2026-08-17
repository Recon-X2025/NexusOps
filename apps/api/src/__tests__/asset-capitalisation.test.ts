/**
 * Buying an asset puts it on the books.
 *
 * `assets.create` inserted the asset row and a history row and posted NOTHING —
 * it is the only product path that creates an asset, so every asset was absent
 * from the general ledger and the balance sheet was short by the cost of
 * everything the company owned. Depreciation made that visible rather than
 * merely incomplete: 1290 Accumulated Depreciation carried a balance while the
 * gross asset account had never been touched.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { nanoid } from "nanoid";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { assetsRouter } from "../routers/assets";
import { accountingRouter } from "../routers/accounting";
import {
  assetTypes,
  assets,
  assetHistory,
  chartOfAccounts,
  journalEntries,
  journalEntryLines,
  eq,
  and,
} from "@coheronconnect/db";

async function balanceOf(orgId: string, code: string): Promise<number> {
  const [row] = await testDb()
    .select({ b: chartOfAccounts.currentBalance })
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.orgId, orgId), eq(chartOfAccounts.code, code)));
  return Number(row?.b ?? 0);
}

async function accountId(orgId: string, code: string): Promise<string> {
  const [row] = await testDb()
    .select({ id: chartOfAccounts.id })
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.orgId, orgId), eq(chartOfAccounts.code, code)));
  return row!.id;
}

describe("Asset capitalisation — an asset reaches the ledger", () => {
  let orgId: string;
  let adminId: string;
  let typeId: string;
  let caller: ReturnType<typeof assetsRouter.createCaller>;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId!;
    const acc = accountingRouter.createCaller(createMockContext(adminId, orgId));
    await acc.coa.seed(); // 1200 / 1290 / 2110 / 5500 all present
    const [t] = await testDb().insert(assetTypes).values({ orgId, name: `Laptops ${nanoid(4)}` }).returning();
    typeId = t!.id;
    caller = assetsRouter.createCaller(createMockContext(adminId, orgId));
  });

  it("posts Dr asset account / Cr accounts payable for the purchase cost", async () => {
    const assetBefore = await balanceOf(orgId, "1200");
    const apBefore = await balanceOf(orgId, "2110");

    const asset = await caller.create({ name: "Dell Latitude", typeId, purchaseCost: 120000 });

    // The asset account rose by the cost; AP is a liability, so it falls (credit).
    expect(await balanceOf(orgId, "1200")).toBeCloseTo(assetBefore + 120000, 2);
    expect(await balanceOf(orgId, "2110")).toBeCloseTo(apBefore - 120000, 2);

    // A real, balanced journal entry — not a stub.
    const [je] = await testDb()
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.reference, `ASSET-${asset!.assetTag}`)));
    expect(je).toBeTruthy();
    expect(Number(je!.totalDebit)).toBeCloseTo(Number(je!.totalCredit), 3);
    expect(je!.status).toBe("posted");

    const lines = await testDb()
      .select()
      .from(journalEntryLines)
      .where(eq(journalEntryLines.journalEntryId, je!.id));
    expect(lines).toHaveLength(2);
    const debit = lines.find((l) => Number(l.debitAmount) > 0)!;
    const credit = lines.find((l) => Number(l.creditAmount) > 0)!;
    expect(debit.accountId).toBe(await accountId(orgId, "1200"));
    expect(credit.accountId).toBe(await accountId(orgId, "2110"));
  });

  it("uses the account mapped on the asset TYPE in preference to the constant", async () => {
    // Computers capitalise into 1210, not the generic 1200 parent.
    const computerAccount = await accountId(orgId, "1210");
    await testDb()
      .update(assetTypes)
      .set({ assetAccountId: computerAccount })
      .where(eq(assetTypes.id, typeId));

    const before1210 = await balanceOf(orgId, "1210");
    const before1200 = await balanceOf(orgId, "1200");

    await caller.create({ name: "Mapped laptop", typeId, purchaseCost: 50000 });

    expect(await balanceOf(orgId, "1210")).toBeCloseTo(before1210 + 50000, 2);
    expect(await balanceOf(orgId, "1200")).toBeCloseTo(before1200, 2); // untouched
  });

  /**
   * An asset with no cost has nothing to capitalise. Posting a zero-value entry
   * would put a meaningless row in the ledger and imply the asset is worthless.
   * It must post nothing AND say so — a write that degrades to nothing silently
   * is the defect pattern this codebase keeps paying for.
   */
  it("posts nothing when there is no purchase cost, and records why", async () => {
    const before = await balanceOf(orgId, "1200");
    const asset = await caller.create({ name: "Donated monitor", typeId });

    expect(await balanceOf(orgId, "1200")).toBeCloseTo(before, 2);

    const [hist] = await testDb()
      .select()
      .from(assetHistory)
      .where(eq(assetHistory.assetId, asset!.id));
    const details = hist!.details as Record<string, unknown>;
    expect(details["capitalised"]).toBe(false);
    expect(details["reason"]).toBe("no_cost");
  });

  it("records the journal entry id on the history row when it does capitalise", async () => {
    const asset = await caller.create({ name: "Recorded laptop", typeId, purchaseCost: 1000 });
    const [hist] = await testDb().select().from(assetHistory).where(eq(assetHistory.assetId, asset!.id));
    const details = hist!.details as Record<string, unknown>;
    expect(details["capitalised"]).toBe(true);
    expect(details["journalEntryId"]).toBeTruthy();
  });

  it("REJECTS an asset whose accounts are not on the chart of accounts, naming them", async () => {
    // A fresh org WITHOUT coa.seed() — `packages/db/src/seed.ts` seeds 21
    // accounts and includes neither 1290 nor 5500, so this is reachable.
    const bare = await seedFullOrg();
    const [t] = await testDb().insert(assetTypes).values({ orgId: bare.orgId, name: "Bare" }).returning();
    const bareCaller = assetsRouter.createCaller(createMockContext(bare.adminId!, bare.orgId));

    await expect(
      bareCaller.create({ name: "Unpostable", typeId: t!.id, purchaseCost: 5000 }),
    ).rejects.toThrow(/not on the chart of accounts/i);

    // And nothing was written — the guard runs before the insert.
    const rows = await testDb().select().from(assets).where(eq(assets.orgId, bare.orgId));
    expect(rows).toHaveLength(0);
  });
});

/**
 * `assetTag` was `count(*) + 1` against the UNIQUE index `assets_org_tag_idx`.
 * The index was always there; the generator was wrong — which is why it produced
 * a duplicate-key 500 rather than a silent duplicate.
 */
describe("Asset tag allocation — delete-proof and race-proof", () => {
  let orgId: string;
  let adminId: string;
  let typeId: string;
  let caller: ReturnType<typeof assetsRouter.createCaller>;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId!;
    await accountingRouter.createCaller(createMockContext(adminId, orgId)).coa.seed();
    const [t] = await testDb().insert(assetTypes).values({ orgId, name: `T ${nanoid(4)}` }).returning();
    typeId = t!.id;
    caller = assetsRouter.createCaller(createMockContext(adminId, orgId));
  });

  it("does not reuse a tag after an asset is deleted", async () => {
    const a = await caller.create({ name: "First", typeId, purchaseCost: 100 });
    const b = await caller.create({ name: "Second", typeId, purchaseCost: 100 });
    expect(a!.assetTag).not.toBe(b!.assetTag);

    // Under count(*)+1 this is the collision: delete one, and the next create
    // computes a tag that already exists.
    await testDb().delete(assets).where(eq(assets.id, b!.id));
    const c = await caller.create({ name: "Third", typeId, purchaseCost: 100 });
    expect(c!.assetTag).not.toBe(a!.assetTag);
    expect(c!.assetTag).not.toBe(b!.assetTag);
  });

  it("allocates unique tags under concurrency", async () => {
    const created = await Promise.all(
      Array.from({ length: 8 }, (_, i) => caller.create({ name: `Race ${i}`, typeId, purchaseCost: 10 })),
    );
    const tags = created.map((a) => a!.assetTag);
    expect(new Set(tags).size).toBe(tags.length);
  });
});
