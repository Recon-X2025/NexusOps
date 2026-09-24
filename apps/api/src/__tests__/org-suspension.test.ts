import { describe, it, expect, beforeAll } from "vitest";
import { getDb, organizations, users, sessions, eq } from "@coheronconnect/db";
import { revokeOrgSessions } from "../middleware/auth";
import { appRouter } from "../routers";
import bcrypt from "bcrypt";
import { nanoid } from "nanoid";

describe("Tenant suspension enforcement & session revocation", () => {
  const db = getDb();
  let testOrgId: string;
  let testUserId: string;
  const testEmail = `test-suspend-${Date.now()}@example.com`;
  const testPassword = "Password123!";

  beforeAll(async () => {
    // 1. Create a test organization
    const [org] = await db
      .insert(organizations)
      .values({
        name: "Test Suspension Org",
        slug: `test-suspend-${nanoid(6).toLowerCase()}`,
        plan: "starter",
        settings: { suspended: false },
      })
      .returning();
    testOrgId = org!.id;

    // 2. Create a test active user
    const passwordHash = await bcrypt.hash(testPassword, 10);
    const [user] = await db
      .insert(users)
      .values({
        orgId: testOrgId,
        email: testEmail,
        name: "Suspension Test User",
        passwordHash,
        role: "owner",
        status: "active",
      })
      .returning();
    testUserId = user!.id;
  });

  it("allows user to log in when org is active", async () => {
    const caller = appRouter.createCaller({
      db,
      user: null,
      org: null,
      orgId: null,
      sessionId: null,
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
      requestId: "test-req-1",
    } as any);

    const loginRes = await caller.auth.login({
      email: testEmail,
      password: testPassword,
    });

    expect(loginRes).toHaveProperty("sessionId");
    expect(loginRes.user.email).toBe(testEmail);

    // Verify session exists in db
    const activeSessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, testUserId));
    expect(activeSessions.length).toBeGreaterThan(0);
  });

  it("revokes all active sessions when org is suspended", async () => {
    // Suspend org
    await db
      .update(organizations)
      .set({ settings: { suspended: true }, updatedAt: new Date() })
      .where(eq(organizations.id, testOrgId));

    // Revoke sessions
    const revokedCount = await revokeOrgSessions(db, testOrgId);
    expect(revokedCount).toBeGreaterThan(0);

    // Verify zero sessions remain in db
    const remainingSessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, testUserId));
    expect(remainingSessions.length).toBe(0);
  });

  it("blocks login attempts with a clear forbidden message when org is suspended", async () => {
    const caller = appRouter.createCaller({
      db,
      user: null,
      org: null,
      orgId: null,
      sessionId: null,
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
      requestId: "test-req-2",
    } as any);

    await expect(
      caller.auth.login({
        email: testEmail,
        password: testPassword,
      }),
    ).rejects.toThrow(/organization has been suspended/i);
  });

  it("allows login again after org is unsuspended / resumed", async () => {
    // Unsuspend org
    await db
      .update(organizations)
      .set({ settings: { suspended: false }, updatedAt: new Date() })
      .where(eq(organizations.id, testOrgId));

    const caller = appRouter.createCaller({
      db,
      user: null,
      org: null,
      orgId: null,
      sessionId: null,
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
      requestId: "test-req-3",
    } as any);

    const loginRes = await caller.auth.login({
      email: testEmail,
      password: testPassword,
    });

    expect(loginRes).toHaveProperty("sessionId");
    expect(loginRes.user.email).toBe(testEmail);
  });
});
