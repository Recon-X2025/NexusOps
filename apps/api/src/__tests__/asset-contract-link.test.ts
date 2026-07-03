/**
 * Asset↔contract linking tests (Sprint 0.3).
 *
 * Adds a nullable assets.contract_id FK (onDelete: set null) and a
 * assets.linkContract mutation. Verifies an asset can be linked to a contract
 * in the same org, that cross-org contracts are rejected, that unlinking works,
 * and that deleting the contract nulls the link (SET NULL) rather than blocking.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { assetsRouter } from "../routers/assets";
import { assets, assetTypes, contracts, eq } from "@coheronconnect/db";

describe("Asset↔contract linking (Sprint 0.3)", () => {
  let ctx: any;
  let caller: any;
  let orgId: string;
  let typeId: string;
  let assetId: string;
  let contractId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    ctx = createMockContext(seeded.adminId, orgId);
    caller = assetsRouter.createCaller(ctx);
    const db = testDb();

    const [t] = await db
      .insert(assetTypes)
      .values({ orgId, name: "Laptop" })
      .returning();
    typeId = t!.id;

    const [a] = await db
      .insert(assets)
      .values({ orgId, assetTag: "AST-0001", name: "MacBook", typeId })
      .returning();
    assetId = a!.id;

    const [c] = await db
      .insert(contracts)
      .values({
        orgId,
        contractNumber: "CTR-0001",
        title: "Hardware Warranty",
        counterparty: "Acme Vendor",
        type: "vendor",
      })
      .returning();
    contractId = c!.id;
  });

  it("links an asset to a contract in the same org", async () => {
    const updated = await caller.linkContract({ id: assetId, contractId });
    expect(updated.contractId).toBe(contractId);

    const [row] = await testDb().select().from(assets).where(eq(assets.id, assetId));
    expect(row!.contractId).toBe(contractId);
  });

  it("rejects a contract from a different org", async () => {
    const other = await seedFullOrg();
    const [foreign] = await testDb()
      .insert(contracts)
      .values({
        orgId: other.orgId,
        contractNumber: "CTR-X",
        title: "Foreign",
        counterparty: "Other Co",
        type: "vendor",
      })
      .returning();

    await expect(
      caller.linkContract({ id: assetId, contractId: foreign!.id }),
    ).rejects.toThrow(/not found/i);
  });

  it("unlinks when contractId is null", async () => {
    await caller.linkContract({ id: assetId, contractId });
    const cleared = await caller.linkContract({ id: assetId, contractId: null });
    expect(cleared.contractId).toBeNull();
  });

  it("nulls the asset link when the contract is deleted (SET NULL)", async () => {
    const db = testDb();
    await caller.linkContract({ id: assetId, contractId });
    await db.delete(contracts).where(eq(contracts.id, contractId));

    const [row] = await db.select().from(assets).where(eq(assets.id, assetId));
    expect(row).toBeDefined();
    expect(row!.contractId).toBeNull();
  });
});
