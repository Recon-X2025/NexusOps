/**
 * Login is by EMAIL ADDRESS. A second user with an email already used in the same
 * tenant must be refused with a readable message, never a raw database exception.
 *
 * The constraint already exists — `users_org_email_idx`, UNIQUE on (org_id, email)
 * (packages/db/src/schema/auth.ts, migration 0000). This suite pins the two things
 * that could still go wrong: that the constraint is really enforced, and that the
 * user-creating paths surface a CONFLICT rather than letting a 23505 reach the UI.
 *
 * Scope note: the index is PER ORG, while `auth.login` looks up by email GLOBALLY.
 * That is deliberate — a person may belong to two tenants — and login handles the
 * collision explicitly ("Account belongs to multiple organizations"), which the
 * last test pins so nobody "fixes" it into an arbitrary pick.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { nanoid } from "nanoid";
import { seedTestOrg, seedUser, testDb, cleanupOrg, createMockContext } from "./helpers";
import { users, eq } from "@coheronconnect/db";
import { authRouter } from "../routers/auth";
import type { Context } from "../lib/trpc";

function publicContext(): Context {
  return {
    db: testDb(), mongoDb: null, databaseProvider: "postgres",
    user: null, org: null, orgId: null, sessionId: null, requestId: null,
    ipAddress: "127.0.0.1", userAgent: "vitest", idempotencyKey: null, macToken: null,
  } as unknown as Context;
}

const lower = (n = 8) => nanoid(n).toLowerCase().replace(/[^a-z0-9]/g, "x");

describe("login email uniqueness", () => {
  let orgId: string;
  let adminId: string;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    ({ userId: adminId } = await seedUser(orgId, { role: "admin", matrixRole: "admin" }));
  });
  afterEach(async () => { await cleanupOrg(orgId); });

  it("the database refuses a duplicate email within one tenant", async () => {
    const email = `dupe-${lower()}@unique.test`;
    await seedUser(orgId, { email });
    await expect(seedUser(orgId, { email })).rejects.toThrow();
  });

  /**
   * `inviteUser` is idempotent BY DESIGN (auth.ts): if the email already belongs to
   * a user in this org it skips the insert and just issues a fresh invite, so
   * re-inviting an existing member is a legitimate action rather than an error.
   *
   * The guarantee that matters for login-email uniqueness is therefore NOT "it
   * throws" — it is that no second user row appears and no raw 23505 reaches the
   * caller. That is what this asserts.
   */
  it("re-inviting an existing member creates no second user row and leaks no DB error", async () => {
    const email = `invited-${lower()}@unique.test`;
    await seedUser(orgId, { email });

    const caller = authRouter.createCaller(createMockContext(adminId, orgId));
    let caught: unknown;
    try {
      await caller.inviteUser({ email, name: "Second Person", role: "member" } as never);
    } catch (e) { caught = e; }

    if (caught) {
      const err = caught as { message?: string };
      // If it ever does throw, it must be readable — never a leaked constraint error.
      expect(err.message ?? "").not.toMatch(/duplicate key|23505|violates unique/i);
    }

    const rows = await testDb().select({ id: users.id }).from(users).where(eq(users.email, email));
    expect(rows.length, "no duplicate user row may be created in the tenant").toBe(1);
  });

  it("signup refuses an email that already exists anywhere, with a readable message", async () => {
    const email = `signup-${lower()}@unique.test`;
    await seedUser(orgId, { email });

    await expect(
      authRouter.createCaller(publicContext()).signup({
        name: "Someone", email, password: "TestPass123!", orgName: `Other Co ${lower(5)}`,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("the same email in a DIFFERENT tenant is allowed, but login then refuses it explicitly", async () => {
    // Per-org uniqueness permits this; it is how one person belongs to two tenants.
    const email = `shared-${lower()}@unique.test`;
    const password = "TestPass123!";
    const { orgId: otherOrgId } = await seedTestOrg();
    try {
      await seedUser(orgId, { email, password });
      await seedUser(otherOrgId, { email, password });

      const rows = await testDb().select({ id: users.id }).from(users).where(eq(users.email, email));
      expect(rows.length).toBe(2);

      // Login must NOT silently pick one of them.
      await expect(
        authRouter.createCaller(publicContext()).login({ email, password }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    } finally {
      await cleanupOrg(otherOrgId);
    }
  });
});
