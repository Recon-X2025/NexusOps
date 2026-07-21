/**
 * RoPA (Record of Processing Activities) router tests (Sprint 1.4 / G16).
 *
 * `compliance.ropa` is the first-class §5 register over
 * dpdp_processing_activities: an auditable inventory of every processing
 * purpose, its lawful basis and data categories, with a DPO sign-off gate and a
 * soft-retire lifecycle (retired rows stay in the register for audit). Verifies:
 *   • create → list (active filter) → get round-trip;
 *   • lawfulBasis filter narrows the list;
 *   • update patches a live activity;
 *   • a retired activity is soft-kept (status="retired" + retiredAt) and can no
 *     longer be edited;
 *   • retired rows only surface under the "retired" filter;
 *   • DPO sign-off stamps dpoSignOffAt;
 *   • tenant isolation — another org's activity is never readable/mutable here.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg } from "./helpers";
import { complianceRouter } from "../routers/compliance";

describe("RoPA register (G16)", () => {
  let caller: any;
  let orgId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    caller = complianceRouter.createCaller(createMockContext(seeded.adminId, orgId));
  });

  const mkActivity = (over: Record<string, unknown> = {}) =>
    caller.ropa.create({
      activityName: "Payroll processing",
      purpose: "Salary disbursement",
      lawfulBasis: "contract",
      dataCategories: "financial,identity",
      ...over,
    });

  it("creates an activity that defaults to active and is retrievable", async () => {
    const a = await mkActivity();
    expect(a.status).toBe("active");
    expect(a.retiredAt).toBeNull();
    expect(a.activityName).toBe("Payroll processing");
    expect(a.orgId).toBe(orgId);

    const got = await caller.ropa.get({ id: a.id });
    expect(got.id).toBe(a.id);
    expect(got.lawfulBasis).toBe("contract");
  });

  it("lists active activities and narrows by lawfulBasis", async () => {
    await mkActivity({ activityName: "Payroll", lawfulBasis: "contract" });
    await mkActivity({ activityName: "Marketing emails", lawfulBasis: "consent" });

    const active = await caller.ropa.list({ status: "active" });
    expect(active.length).toBeGreaterThanOrEqual(2);
    expect(active.every((r: any) => r.orgId === orgId)).toBe(true);

    const byConsent = await caller.ropa.list({ lawfulBasis: "consent" });
    expect(byConsent.every((r: any) => r.lawfulBasis === "consent")).toBe(true);
    expect(byConsent.some((r: any) => r.activityName === "Marketing emails")).toBe(true);
  });

  it("updates a live activity", async () => {
    const a = await mkActivity();
    const updated = await caller.ropa.update({
      id: a.id,
      purpose: "Salary + statutory filings",
      dataCategories: "financial,identity,tax",
    });
    expect(updated.purpose).toBe("Salary + statutory filings");
    expect(updated.dataCategories).toBe("financial,identity,tax");
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(a.updatedAt).getTime(),
    );
  });

  it("stamps dpoSignOffAt on sign-off", async () => {
    const a = await mkActivity();
    expect(a.dpoSignOffAt).toBeNull();
    const signed = await caller.ropa.signOff({ id: a.id });
    expect(signed.dpoSignOffAt).not.toBeNull();
  });

  it("soft-retires an activity, keeps it for audit, and blocks further edits", async () => {
    const a = await mkActivity();
    const retired = await caller.ropa.retire({ id: a.id });
    expect(retired.status).toBe("retired");
    expect(retired.retiredAt).not.toBeNull();

    // Retired row is excluded from the active list but present under retired.
    const active = await caller.ropa.list({ status: "active" });
    expect(active.some((r: any) => r.id === a.id)).toBe(false);
    const retiredList = await caller.ropa.list({ status: "retired" });
    expect(retiredList.some((r: any) => r.id === a.id)).toBe(true);

    // Editing a retired activity is rejected.
    await expect(caller.ropa.update({ id: a.id, purpose: "nope" })).rejects.toThrow(/retired/i);
  });

  it("is tenant-scoped — another org's activity is not readable or mutable", async () => {
    const other = await seedFullOrg();
    const otherCaller = complianceRouter.createCaller(
      createMockContext(other.adminId, other.orgId),
    );
    const theirs = await otherCaller.ropa.create({ activityName: "Their processing" });

    await expect(caller.ropa.get({ id: theirs.id })).rejects.toThrow(/not found/i);
    await expect(caller.ropa.update({ id: theirs.id, purpose: "x" })).rejects.toThrow(/not found/i);
    await expect(caller.ropa.retire({ id: theirs.id })).rejects.toThrow(/not found/i);
    await expect(caller.ropa.signOff({ id: theirs.id })).rejects.toThrow(/not found/i);

    const mineList = await caller.ropa.list();
    expect(mineList.some((r: any) => r.id === theirs.id)).toBe(false);
  });
});
