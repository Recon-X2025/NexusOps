/**
 * Expiry-alert sweep tests (G9).
 *
 * `expiryAlertWorkflow` closes the loop the on-demand `assets.expiring` query
 * left open: a repeatable sweep that notifies owners when a contract enters its
 * renewal-notice window or an asset warranty is about to lapse. Verifies:
 *   • a contract inside its notice window alerts its internal owner (falling
 *     back to legal owner);
 *   • a contract outside the window is not alerted;
 *   • a warranty within the horizon alerts the asset owner, disposed/owner-less
 *     excluded;
 *   • the sweep is idempotent — a second tick produces no duplicate alert;
 *   • tenant isolation.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { seedFullOrg, seedUser, testDb } from "./helpers";
import {
  sweepContractExpiries,
  sweepWarrantyExpiries,
} from "../workflows/expiryAlertWorkflow";
import {
  contracts,
  assets,
  assetTypes,
  notifications,
  eq,
  and,
} from "@coheronconnect/db";

const DAY = 86400000;

describe("Expiry alert sweep (G9)", () => {
  let orgId: string;
  let ownerId: string;
  let typeId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    ownerId = seeded.adminId;
    const [t] = await testDb().insert(assetTypes).values({ orgId, name: "Laptop" }).returning();
    typeId = t!.id;
  });

  const alertsFor = async (sourceType: string, sourceId: string) => {
    const db = testDb();
    return db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.orgId, orgId),
          eq(notifications.sourceType, sourceType),
          eq(notifications.sourceId, sourceId),
        ),
      );
  };

  const mkContract = (num: string, endInDays: number, notice = 30, ownerCol: "internal" | "legal" | "none" = "internal") =>
    testDb()
      .insert(contracts)
      .values({
        orgId,
        contractNumber: num,
        title: `Contract ${num}`,
        counterparty: "Acme",
        status: "active",
        endDate: new Date(Date.now() + endInDays * DAY),
        noticePeriodDays: notice,
        internalOwnerId: ownerCol === "internal" ? ownerId : null,
        legalOwnerId: ownerCol === "legal" ? ownerId : null,
      })
      .returning();

  const mkAsset = (tag: string, warrantyInDays: number | null, owner: string | null, status = "in_stock") =>
    testDb()
      .insert(assets)
      .values({
        orgId,
        assetTag: tag,
        name: `Asset ${tag}`,
        typeId,
        status: status as any,
        ownerId: owner,
        warrantyExpiry: warrantyInDays === null ? null : new Date(Date.now() + warrantyInDays * DAY),
      })
      .returning();

  it("alerts the internal owner when a contract enters its renewal-notice window", async () => {
    const [c] = await mkContract("CTR-0001", 10, 30); // 10d out, 30d notice → in window
    const res = await sweepContractExpiries(testDb());
    expect(res.notified).toBe(1);

    const alerts = await alertsFor("contract_expiry", c!.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.userId).toBe(ownerId);
    expect(alerts[0]!.title).toMatch(/renewal due/i);
  });

  it("falls back to the legal owner when there is no internal owner", async () => {
    const [c] = await mkContract("CTR-0002", 5, 30, "legal");
    await sweepContractExpiries(testDb());
    const alerts = await alertsFor("contract_expiry", c!.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.userId).toBe(ownerId);
  });

  it("does not alert a contract still outside its notice window", async () => {
    const [c] = await mkContract("CTR-0003", 90, 30); // 90d out, 30d notice → outside
    const res = await sweepContractExpiries(testDb());
    expect(res.notified).toBe(0);
    expect(await alertsFor("contract_expiry", c!.id)).toHaveLength(0);
  });

  it("alerts the asset owner for a warranty within the horizon; excludes disposed / owner-less", async () => {
    const [inHorizon] = await mkAsset("AST-0001", 10, ownerId);
    const [disposed] = await mkAsset("AST-0002", 10, ownerId, "disposed");
    const [ownerless] = await mkAsset("AST-0003", 10, null);
    const [farOut] = await mkAsset("AST-0004", 200, ownerId);

    const res = await sweepWarrantyExpiries(testDb());
    expect(res.notified).toBe(1);
    expect(await alertsFor("asset_warranty_expiry", inHorizon!.id)).toHaveLength(1);
    expect(await alertsFor("asset_warranty_expiry", disposed!.id)).toHaveLength(0);
    expect(await alertsFor("asset_warranty_expiry", ownerless!.id)).toHaveLength(0);
    expect(await alertsFor("asset_warranty_expiry", farOut!.id)).toHaveLength(0);
  });

  it("is idempotent — a second tick does not duplicate the alert", async () => {
    const [c] = await mkContract("CTR-0004", 10, 30);
    const [a] = await mkAsset("AST-0005", 5, ownerId);

    await sweepContractExpiries(testDb());
    await sweepWarrantyExpiries(testDb());
    const second = await sweepContractExpiries(testDb());
    await sweepWarrantyExpiries(testDb());

    // The sweep is global (no orgId filter, like the vuln-SLA sweeper), so the
    // aggregate skipped count spans every org's contracts persisting in the
    // shared test DB. The real idempotency invariant is per-item: our contract
    // and asset each keep exactly one alert after a second tick, and the second
    // tick notifies nobody new.
    expect(second.notified).toBe(0);
    expect(second.skipped).toBeGreaterThanOrEqual(1);
    expect(await alertsFor("contract_expiry", c!.id)).toHaveLength(1);
    expect(await alertsFor("asset_warranty_expiry", a!.id)).toHaveLength(1);
  });

  it("is tenant-scoped — never alerts across orgs", async () => {
    const [mine] = await mkContract("CTR-0005", 10, 30);

    const other = await seedFullOrg();
    await testDb().insert(contracts).values({
      orgId: other.orgId,
      contractNumber: "CTR-0005",
      title: "Theirs",
      counterparty: "Acme",
      status: "active",
      endDate: new Date(Date.now() + 10 * DAY),
      noticePeriodDays: 30,
      internalOwnerId: other.adminId,
    });

    await sweepContractExpiries(testDb());
    // Our org's alert exists; the other org's owner got their own, but ours is
    // scoped to orgId so we only ever see one here.
    const mineAlerts = await alertsFor("contract_expiry", mine!.id);
    expect(mineAlerts).toHaveLength(1);
    expect(mineAlerts[0]!.orgId).toBe(orgId);
  });
});
