/**
 * Public signup is OPEN unless SIGNUP_ENABLED is exactly "false".
 *
 * The default was reversed in Round 5. Round 4 established that with signup off
 * NO route creates a usable tenant — `mac.createOrganization` makes an org with
 * no user and sends no invite, and both `packages/cli` commands insert a
 * non-existent `organization_id` column. Signup is the only working path, so it
 * must be open during trial and pilot.
 *
 * The switch is deliberately KEPT rather than deleted: a trial gate will use it.
 * These tests therefore assert the reversed polarity in both directions — that an
 * absent variable ENABLES, and that "false" still genuinely closes the door.
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

  it("succeeds when SIGNUP_ENABLED is unset (the default is ON)", async () => {
    const input = freshSignupInput();
    createdEmails.push(input.email);
    createdOrgNames.push(input.orgName);

    const res = await authRouter.createCaller(publicContext()).signup(input);
    expect(res.org).toBeTruthy();
    expect(res.user).toBeTruthy();
  });

  it("throws FORBIDDEN only when SIGNUP_ENABLED is exactly 'false'", async () => {
    process.env["SIGNUP_ENABLED"] = "false";
    await expect(
      authRouter.createCaller(publicContext()).signup(freshSignupInput()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(["true", "1", "yes", "TRUE", "FALSE", ""])(
    "stays ENABLED for SIGNUP_ENABLED=%j (only the exact lowercase 'false' closes it)",
    async (value) => {
      process.env["SIGNUP_ENABLED"] = value;
      const input = freshSignupInput();
      createdEmails.push(input.email);
      createdOrgNames.push(input.orgName);

      const res = await authRouter.createCaller(publicContext()).signup(input);
      expect(res.org).toBeTruthy();
    },
  );

  it("writes NOTHING when refused — no org and no user row is created", async () => {
    process.env["SIGNUP_ENABLED"] = "false";
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
