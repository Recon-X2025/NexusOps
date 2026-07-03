/**
 * Asset warranty / software-license expiry alerts (Sprint 0.7).
 *
 * `assets.expiring` merges asset warranties (assets.warrantyExpiry) and
 * software licenses (software_licenses.expiry_date) into one horizon-filtered,
 * day-sorted feed with urgency banding (expired / critical ≤7d / warning) and
 * per-band counts. Verifies horizon filtering, urgency classification, the
 * `kind` filter, disposed-asset/inactive-license exclusion, and tenant scoping.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { assetsRouter } from "../routers/assets";
import { assets, assetTypes, softwareLicenses } from "@coheronconnect/db";

const DAY = 86400000;

describe("Asset expiry alerts (Sprint 0.7)", () => {
  let ctx: any;
  let caller: any;
  let orgId: string;
  let typeId: string;

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
  });

  const addAsset = (name: string, tag: string, warrantyExpiry: Date | null, status = "in_stock") =>
    testDb()
      .insert(assets)
      .values({
        orgId,
        assetTag: tag,
        name,
        typeId,
        status: status as any,
        warrantyExpiry,
      })
      .returning();

  const addLicense = (name: string, expiryDate: Date | null, isActive = true) =>
    testDb()
      .insert(softwareLicenses)
      .values({ orgId, name, type: "per_seat", expiryDate, isActive })
      .returning();

  it("returns warranties and licenses expiring within the horizon, sorted by daysUntil", async () => {
    await addAsset("Laptop A", "AST-0001", new Date(Date.now() + 5 * DAY));
    await addAsset("Laptop B", "AST-0002", new Date(Date.now() + 200 * DAY)); // outside 30d
    await addLicense("Figma", new Date(Date.now() + 10 * DAY));

    const res = await caller.expiring({ days: 30 });
    expect(res.horizonDays).toBe(30);
    expect(res.items).toHaveLength(2);
    // day-sorted: warranty (5d) before license (10d)
    expect(res.items[0].kind).toBe("warranty");
    expect(res.items[0].reference).toBe("AST-0001");
    expect(res.items[1].kind).toBe("license");
    expect(res.items[0].daysUntil).toBeLessThan(res.items[1].daysUntil);
  });

  it("classifies urgency: expired / critical (≤7d) / warning", async () => {
    await addAsset("Expired", "AST-0001", new Date(Date.now() - 3 * DAY));
    await addAsset("Critical", "AST-0002", new Date(Date.now() + 3 * DAY));
    await addAsset("Warning", "AST-0003", new Date(Date.now() + 20 * DAY));

    const res = await caller.expiring({ days: 30 });
    const byName = Object.fromEntries(res.items.map((i: any) => [i.name, i.urgency]));
    expect(byName["Expired"]).toBe("expired");
    expect(byName["Critical"]).toBe("critical");
    expect(byName["Warning"]).toBe("warning");
    expect(res.counts).toEqual({ total: 3, expired: 1, critical: 1, warning: 1 });
  });

  it("kind filter narrows to warranties or licenses only", async () => {
    await addAsset("Laptop", "AST-0001", new Date(Date.now() + 5 * DAY));
    await addLicense("Slack", new Date(Date.now() + 5 * DAY));

    const warranties = await caller.expiring({ days: 30, kind: "warranty" });
    expect(warranties.items).toHaveLength(1);
    expect(warranties.items[0].kind).toBe("warranty");

    const licenses = await caller.expiring({ days: 30, kind: "license" });
    expect(licenses.items).toHaveLength(1);
    expect(licenses.items[0].kind).toBe("license");
  });

  it("excludes disposed assets and inactive licenses", async () => {
    await addAsset("Disposed", "AST-0001", new Date(Date.now() + 5 * DAY), "disposed");
    await addLicense("Cancelled", new Date(Date.now() + 5 * DAY), false);

    const res = await caller.expiring({ days: 30 });
    expect(res.items).toHaveLength(0);
  });

  it("is tenant-scoped — another org's expiring items are not returned", async () => {
    await addAsset("Mine", "AST-0001", new Date(Date.now() + 5 * DAY));

    const other = await seedFullOrg();
    const db = testDb();
    const [ot] = await db.insert(assetTypes).values({ orgId: other.orgId, name: "Laptop" }).returning();
    await db.insert(assets).values({
      orgId: other.orgId,
      assetTag: "AST-0001",
      name: "Theirs",
      typeId: ot!.id,
      warrantyExpiry: new Date(Date.now() + 5 * DAY),
    });

    const res = await caller.expiring({ days: 30 });
    expect(res.items).toHaveLength(1);
    expect(res.items[0].name).toBe("Mine");
  });
});
