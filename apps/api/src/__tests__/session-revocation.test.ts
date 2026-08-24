/**
 * BLOCKER regression: disabling or offboarding a user must end their live session.
 *
 * The auth path resolved a session to its user without ever checking
 * users.status, and the offboarding sweep flipped status to 'disabled' but never
 * deleted the session — so a terminated employee kept full access until the
 * session expired (weeks). Fix: fetchSession rejects a non-active user (the
 * authoritative DB read on every cache miss), and the disable paths call
 * revokeUserSessions to evict DB + L1 + L2 immediately.
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  initTestEnvironment,
  testDb,
  seedTestOrg,
  seedUser,
  createSession,
} from "./helpers";
import {
  createContext,
  clearSessionCache,
  invalidateSessionCache,
  hashSessionToken,
} from "../middleware/auth";
import { revokeElapsedOffboardedAccess } from "../lib/offboarding-revoke";
import { users, sessions, employees, eq } from "@coheronconnect/db";
import { nanoid } from "nanoid";

function reqWith(token: string) {
  return {
    headers: { authorization: `Bearer ${token}`, "user-agent": "vitest" },
    ip: "127.0.0.1",
    cookies: {},
    id: "test-req",
  } as never;
}

/** Force past all caches so the next resolve hits the authoritative DB read. */
async function dropCaches(token: string) {
  clearSessionCache();
  await invalidateSessionCache(hashSessionToken(token));
}

beforeAll(async () => {
  await initTestEnvironment();
});

describe("session revocation on disable/offboard (BLOCKER regression)", () => {
  it("offboarding sweep ends the user's live session, and it no longer resolves", async () => {
    const db = testDb();
    const { orgId } = await seedTestOrg();
    const { userId } = await seedUser(orgId, { status: "active" });
    // Offboarded, handover window fully elapsed (endDate + 2 days < now).
    await db.insert(employees).values({
      orgId,
      userId,
      employeeId: `EMP-${nanoid(6)}`,
      status: "active",
      startDate: new Date(Date.now() - 400 * 86400000),
      endDate: new Date(Date.now() - 5 * 86400000),
    });
    const token = await createSession(userId);

    // Session resolves while the user is active.
    await dropCaches(token);
    const before = await createContext(reqWith(token));
    expect(before.user?.id).toBe(userId);

    // Run the daily offboarding sweep.
    const res = await revokeElapsedOffboardedAccess(db, new Date());
    expect(res.revoked.some((r) => r.userId === userId)).toBe(true);

    // The login is disabled AND the session row is gone.
    const [u] = await db.select({ status: users.status }).from(users).where(eq(users.id, userId));
    expect(u!.status).toBe("disabled");
    const rows = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
    expect(rows.length).toBe(0);

    // And the token no longer resolves to a user.
    const after = await createContext(reqWith(token));
    expect(after.user).toBeNull();
  });

  it("a disabled user is rejected even if the session row survives (L3 status check)", async () => {
    const db = testDb();
    const { orgId } = await seedTestOrg();
    const { userId } = await seedUser(orgId, { status: "active" });
    const token = await createSession(userId);

    await dropCaches(token);
    expect((await createContext(reqWith(token))).user?.id).toBe(userId);

    // Disable the user WITHOUT deleting the session row.
    await db.update(users).set({ status: "disabled" }).where(eq(users.id, userId));

    // Force past the caches; the authoritative read must reject the disabled user.
    await dropCaches(token);
    const after = await createContext(reqWith(token));
    expect(after.user).toBeNull();
  });
});
