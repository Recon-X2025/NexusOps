/**
 * HIGH regression: the monthly HR sweep must actually persist accruals.
 *
 * The cron built a tRPC caller with `user.id = "system-cron"`. created_by_id on
 * the accrual write is a UUID FK to users, so every insert threw on the invalid
 * value and the sweep's try/catch swallowed it — leave balances silently never
 * accrued. Fix: resolve a REAL active org admin as the actor.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { initTestEnvironment, testDb, seedTestOrg, seedUser } from "./helpers";
import { resolveOrgActorId, processMonthlySweep } from "../workflows/hrPeriodicWorkflow";
import { employees, leavePolicies, leaveAccrualEvents, eq } from "@coheronconnect/db";
import { nanoid } from "nanoid";

beforeAll(async () => {
  await initTestEnvironment();
});

describe("hr periodic sweep uses a real actor, not a bogus 'system-cron' id (HIGH regression)", () => {
  it("resolveOrgActorId returns an active admin, or null when there is none", async () => {
    const withAdmin = await seedTestOrg();
    const { userId: admin } = await seedUser(withAdmin.orgId, { role: "admin" });
    expect(await resolveOrgActorId(testDb(), withAdmin.orgId)).toBe(admin);

    const empty = await seedTestOrg();
    expect(await resolveOrgActorId(testDb(), empty.orgId)).toBeNull();
  });

  it("the monthly sweep persists accrual events attributed to a real admin", async () => {
    const db = testDb();
    const org = await seedTestOrg();
    const { userId: admin } = await seedUser(org.orgId, { role: "admin" });
    const { userId: empUser } = await seedUser(org.orgId);
    await db.insert(employees).values({
      orgId: org.orgId,
      userId: empUser,
      employeeId: `EMP-${nanoid(6)}`,
      status: "active",
      startDate: new Date(),
    });
    await db.insert(leavePolicies).values({
      orgId: org.orgId,
      type: "annual",
      annualEntitlementDays: "12",
      maxCarryForwardDays: "0",
      yearEndTreatment: "forfeit",
    });

    // Run the ACTUAL workflow entrypoint, scoped to this org.
    await processMonthlySweep(db, [org.orgId]);

    const events = await db
      .select()
      .from(leaveAccrualEvents)
      .where(eq(leaveAccrualEvents.orgId, org.orgId));
    // Pre-fix this was zero — the insert threw on createdById "system-cron" and
    // the sweep swallowed it. Now the accrual persists, stamped with a real admin.
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.createdById === admin)).toBe(true);
  });
});
