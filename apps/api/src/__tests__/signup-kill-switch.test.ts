/**
 * Part 1 — public signup is closed unless SIGNUP_ENABLED=true.
 *
 * `auth.signup` creates an org and an `owner` user, and `owner` short-circuits
 * the permission matrix (see owner-permission-short-circuit.test.ts). Open to the
 * internet, that is unlimited self-provisioning of fully-privileged tenants.
 * The switch defaults OFF: an absent variable means disabled.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { nanoid } from "nanoid";
import { testDb } from "./helpers";
import type { Context } from "../lib/trpc";
import { authRouter } from "../routers/auth";
import { users, organizations, eq } from "@coheronconnect/db";

function publicContext(): Context {
  return {
    db: testDb(), mongoDb: null, databaseProvider: "postgres",
    user: null, org: null, orgId: null, sessionId: null, requestId: null,
    ipAddress: "127.0.0.1", userAgent: "vitest", idempotencyKey: null, macToken: null,
  } as unknown as Context;
}

function freshSignupInput() {
  const tag = nanoid(8).toLowerCase().replace(/[^a-z0-9]/g, "x");
  return {
    name: "Switch Test Founder",
    email: `switch-${tag}@signup.test`,
    password: "TestPass123!",
    orgName: `Switch Org ${tag}`,
  };
}

describe("auth.signup — SIGNUP_ENABLED kill switch", () => {
  const original = process.env["SIGNUP_ENABLED"];
  const createdEmails: string[] = [];
  const createdOrgNames: string[] = [];

  beforeEach(() => { delete process.env["SIGNUP_ENABLED"]; });

  afterEach(async () => {
    if (original === undefined) delete process.env["SIGNUP_ENABLED"];
    else process.env["SIGNUP_ENABLED"] = original;

    const db = testDb();
    for (const email of createdEmails.splice(0)) {
      await db.delete(users).where(eq(users.email, email));
    }
    for (const orgName of createdOrgNames.splice(0)) {
      await db.delete(organizations).where(eq(organizations.name, orgName));
    }
  });

  it("succeeds when SIGNUP_ENABLED=true", async () => {
    process.env["SIGNUP_ENABLED"] = "true";
    const input = freshSignupInput();
    createdEmails.push(input.email);
    createdOrgNames.push(input.orgName);

    const res = await authRouter.createCaller(publicContext()).signup(input);
    expect(res.org).toBeTruthy();
    expect(res.user).toBeTruthy();
  });

  it("throws FORBIDDEN when SIGNUP_ENABLED is unset (the default is OFF)", async () => {
    const input = freshSignupInput();
    await expect(
      authRouter.createCaller(publicContext()).signup(input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(["false", "1", "yes", "TRUE", ""])(
    "throws FORBIDDEN when SIGNUP_ENABLED=%j (only the exact string 'true' enables it)",
    async (value) => {
      process.env["SIGNUP_ENABLED"] = value;
      await expect(
        authRouter.createCaller(publicContext()).signup(freshSignupInput()),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );

  it("writes NOTHING when refused — no org and no user row is created", async () => {
    const input = freshSignupInput();
    await expect(
      authRouter.createCaller(publicContext()).signup(input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const db = testDb();
    const userRows = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
    const orgRows = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.name, input.orgName));

    expect(userRows).toHaveLength(0);
    expect(orgRows).toHaveLength(0);
  });
});
