/**
 * SAM installed-vs-entitled reconciliation tests (G11).
 *
 * software_licenses gained installed_count + reconciled_at. The
 * assets.licenses router now:
 *   • ingestInstalled — records a discovered install count + stamps reconciledAt,
 *   • reconcile — returns each license's posture (over-deployed / under-utilized
 *     / at-parity / unknown) with the installed−entitled delta.
 * Verifies the true-up math, the reconciledAt stamp, ordering (audit-risk first),
 * and tenant isolation.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { assetsRouter } from "../routers/assets";
import { softwareLicenses, licenseAssignments, eq } from "@coheronconnect/db";

describe("SAM reconciliation (G11)", () => {
  let caller: any;
  let orgId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    caller = assetsRouter.createCaller(createMockContext(seeded.adminId, orgId));
  });

  const mkLicense = async (name: string, totalSeats: number) => {
    const db = testDb();
    const [lic] = await db
      .insert(softwareLicenses)
      .values({ orgId, name, type: "per_seat", totalSeats: String(totalSeats) })
      .returning();
    return lic!;
  };

  it("ingestInstalled records install count, stamps reconciledAt, computes over-deployment", async () => {
    const lic = await mkLicense("Adobe CC", 10);
    const recon = await caller.licenses.ingestInstalled({ licenseId: lic.id, installedCount: 14 });

    expect(recon.entitled).toBe(10);
    expect(recon.installed).toBe(14);
    expect(recon.delta).toBe(4);
    expect(recon.status).toBe("over_deployed");
    expect(recon.shortfall).toBe(4);

    const db = testDb();
    const [row] = await db.select().from(softwareLicenses).where(eq(softwareLicenses.id, lic.id));
    expect(row!.installedCount).toBe(14);
    expect(row!.reconciledAt).not.toBeNull();
  });

  it("flags under-utilization when installed < entitled", async () => {
    const lic = await mkLicense("Slack", 50);
    const recon = await caller.licenses.ingestInstalled({ licenseId: lic.id, installedCount: 30 });
    expect(recon.delta).toBe(-20);
    expect(recon.status).toBe("under_utilized");
    expect(recon.shortfall).toBe(0);
  });

  it("reports at-parity when installed == entitled", async () => {
    const lic = await mkLicense("Zoom", 25);
    const recon = await caller.licenses.ingestInstalled({ licenseId: lic.id, installedCount: 25 });
    expect(recon.delta).toBe(0);
    expect(recon.status).toBe("at_parity");
  });

  it("reconcile surfaces assigned seats and unknown when not yet ingested", async () => {
    const lic = await mkLicense("Jira", 5);
    const db = testDb();
    // Two active assignments + one revoked (should not count).
    await db.insert(licenseAssignments).values({ licenseId: lic.id });
    await db.insert(licenseAssignments).values({ licenseId: lic.id });
    await db.insert(licenseAssignments).values({ licenseId: lic.id, revokedAt: new Date() });

    const rows = await caller.licenses.reconcile();
    const jira = rows.find((r: any) => r.licenseId === lic.id);
    expect(jira.assigned).toBe(2);
    expect(jira.installed).toBeNull();
    expect(jira.status).toBe("unknown");
  });

  it("reconcile orders over-deployed (audit risk) first, biggest shortfall on top", async () => {
    const under = await mkLicense("UnderUsed", 100);
    const over1 = await mkLicense("Over1", 10);
    const over2 = await mkLicense("Over2", 10);
    await caller.licenses.ingestInstalled({ licenseId: under.id, installedCount: 20 });
    await caller.licenses.ingestInstalled({ licenseId: over1.id, installedCount: 15 }); // shortfall 5
    await caller.licenses.ingestInstalled({ licenseId: over2.id, installedCount: 22 }); // shortfall 12

    const rows = await caller.licenses.reconcile();
    // Over2 (12) then Over1 (5) then the under-utilized one.
    const names = rows.map((r: any) => r.name);
    expect(names.indexOf("Over2")).toBeLessThan(names.indexOf("Over1"));
    expect(names.indexOf("Over1")).toBeLessThan(names.indexOf("UnderUsed"));
  });

  it("ingestInstalled rejects a license from another org", async () => {
    const other = await seedFullOrg();
    const otherCaller = assetsRouter.createCaller(createMockContext(other.adminId, other.orgId));
    const foreign = await mkLicense("Mine", 10); // belongs to `orgId`
    await expect(
      otherCaller.licenses.ingestInstalled({ licenseId: foreign.id, installedCount: 5 }),
    ).rejects.toThrow(/not_found/i);
  });
});
