/**
 * Offboarding must revoke platform access — on the DATE, not on the event.
 *
 * Product rule: access ends at END OF DAY ON THE DAY AFTER the recorded last
 * working day. The employee keeps access through their last working day and one
 * further day for handover; documents are emailed by HR afterwards.
 *
 * The date-not-event distinction is the whole point: an offboarding recorded today
 * with a last working day next month must not disable anyone today. That is why
 * this is a daily sweep over `employees.end_date`, and why the tests below drive it
 * with an explicit `now` rather than depending on wall-clock time.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { nanoid } from "nanoid";
import { seedTestOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { employees, users, auditLogs, eq, and, desc } from "@coheronconnect/db";
import { revokeElapsedOffboardedAccess, accessEndsAt } from "../lib/offboarding-revoke";
import { authRouter } from "../routers/auth";
import type { Context } from "../lib/trpc";

function publicContext(): Context {
  return {
    db: testDb(), mongoDb: null, databaseProvider: "postgres",
    user: null, org: null, orgId: null, sessionId: null, requestId: null,
    ipAddress: "127.0.0.1", userAgent: "vitest", idempotencyKey: null, macToken: null,
  } as unknown as Context;
}

const DAY = 86_400_000;

describe("offboarding — automatic access revocation", () => {
  let orgId: string;

  beforeEach(async () => { ({ orgId } = await seedTestOrg()); });
  afterEach(async () => { await cleanupOrg(orgId); });

  /** An employee with a linked login and an optional last working day. */
  async function seedEmployee(endDate: Date | null) {
    const { userId } = await seedUser(orgId, { role: "member", matrixRole: "requester" });
    const [emp] = await testDb().insert(employees).values({
      orgId,
      employeeId: `EMP-${nanoid(6).toUpperCase()}`,
      userId, endDate, status: "active",
    } as never).returning({ id: employees.id });
    return { employeeId: emp!.id, userId };
  }

  async function statusOf(userId: string) {
    const [u] = await testDb().select({ status: users.status }).from(users).where(eq(users.id, userId));
    return u!.status;
  }

  describe("the boundary — access ends at the end of the day AFTER the last working day", () => {
    it("computes the boundary as midnight starting the second day after", () => {
      // Last working day Mon 10 Aug → retained 10th and 11th → revoked from 12th 00:00.
      const boundary = accessEndsAt(new Date(2026, 7, 10, 17, 30));
      expect(boundary).toEqual(new Date(2026, 7, 12, 0, 0, 0, 0));
    });

    it("does NOT revoke on the last working day itself", async () => {
      const lastDay = new Date(2026, 7, 10);
      const { userId } = await seedEmployee(lastDay);
      await revokeElapsedOffboardedAccess(testDb(), new Date(2026, 7, 10, 23, 59));
      expect(await statusOf(userId!)).toBe("active");
    });

    it("does NOT revoke during the handover day", async () => {
      const lastDay = new Date(2026, 7, 10);
      const { userId } = await seedEmployee(lastDay);
      await revokeElapsedOffboardedAccess(testDb(), new Date(2026, 7, 11, 23, 59));
      expect(await statusOf(userId!)).toBe("active");
    });

    it("revokes once the handover day has fully elapsed", async () => {
      const lastDay = new Date(2026, 7, 10);
      const { userId } = await seedEmployee(lastDay);
      const res = await revokeElapsedOffboardedAccess(testDb(), new Date(2026, 7, 12, 0, 1));
      expect(await statusOf(userId!)).toBe("disabled");
      expect(res.revoked.map((r) => r.userId)).toContain(userId);
    });
  });

  it("an employee whose last working day is in the PAST is disabled", async () => {
    const { userId } = await seedEmployee(new Date(Date.now() - 10 * DAY));
    await revokeElapsedOffboardedAccess(testDb());
    expect(await statusOf(userId!)).toBe("disabled");
  });

  it("an employee whose last working day is in the FUTURE is NOT disabled", async () => {
    const { userId } = await seedEmployee(new Date(Date.now() + 30 * DAY));
    await revokeElapsedOffboardedAccess(testDb());
    expect(await statusOf(userId!)).toBe("active");
  });

  it("an employee with NO last working day is untouched", async () => {
    const { userId } = await seedEmployee(null);
    await revokeElapsedOffboardedAccess(testDb());
    expect(await statusOf(userId!)).toBe("active");
  });

  /**
   * The brief asked that an employee with no linked user be skipped silently. That
   * state CANNOT EXIST: `employees.user_id` is NOT NULL (packages/db/src/schema/hr.ts).
   * The sweep still carries the defensive branch — it costs nothing and a future
   * schema change could relax the column — but the guarantee is enforced one level
   * down, and this test pins that rather than pretending to exercise a branch the
   * database forbids.
   */
  it("cannot have an employee without a user — the schema forbids it (so nothing to skip)", async () => {
    await expect(
      testDb().insert(employees).values({
        orgId,
        employeeId: `EMP-${nanoid(6).toUpperCase()}`,
        userId: null, endDate: new Date(Date.now() - 10 * DAY), status: "active",
      } as never),
    ).rejects.toThrow();
  });

  it("writes an audit_logs entry naming the user, the employee and the last working day", async () => {
    const lastDay = new Date(Date.now() - 10 * DAY);
    const { employeeId, userId } = await seedEmployee(lastDay);
    await revokeElapsedOffboardedAccess(testDb());

    const [entry] = await testDb()
      .select({ action: auditLogs.action, resourceId: auditLogs.resourceId, changes: auditLogs.changes })
      .from(auditLogs)
      .where(and(eq(auditLogs.orgId, orgId), eq(auditLogs.action, "user_access_revoked_offboarding")))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);

    expect(entry, "an audit row must be written when access is revoked").toBeTruthy();
    expect(entry!.resourceId).toBe(userId);
    const changes = entry!.changes as Record<string, unknown>;
    expect(changes["employeeId"]).toBe(employeeId);
    expect(changes["status"]).toBe("disabled");
    expect(changes["reason"]).toBe("offboarding_elapsed");
  });

  it("is idempotent — a second sweep revokes nothing and writes no second audit row", async () => {
    await seedEmployee(new Date(Date.now() - 10 * DAY));
    await revokeElapsedOffboardedAccess(testDb());
    const second = await revokeElapsedOffboardedAccess(testDb());
    expect(second.revoked).toEqual([]);
  });

  it("a revoked user cannot authenticate", async () => {
    const password = "TestPass123!";
    // Explicit lowercase email: login normalises the address, and seedUser's default
    // uses nanoid, which can emit uppercase — the lookup would then miss and the test
    // would fail with "Invalid credentials" for the wrong reason.
    const email = `leaver-${nanoid(8).toLowerCase().replace(/[^a-z0-9]/g, "x")}@revoke.test`;
    const { userId } = await seedUser(orgId, { email, role: "member", matrixRole: "requester", password });
    const [u] = await testDb().select({ email: users.email }).from(users).where(eq(users.id, userId));

    await testDb().insert(employees).values({
      orgId, employeeId: `EMP-${nanoid(6).toUpperCase()}`,
      userId, endDate: new Date(Date.now() - 10 * DAY), status: "active",
    } as never);

    await revokeElapsedOffboardedAccess(testDb());
    expect(await statusOf(userId)).toBe("disabled");

    await expect(
      authRouter.createCaller(publicContext()).login({ email: u!.email, password }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
