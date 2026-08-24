/**
 * HIGH regression: updateUserRole must enforce a role hierarchy and block
 * self-targeting.
 *
 * The handler only checked org membership, so any users:write holder (e.g. an IT
 * admin) could promote themselves — or a colleague — to owner/admin. Now a caller
 * cannot edit their own role, cannot modify a user ranked above them, and cannot
 * grant a role higher than their own.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { initTestEnvironment, seedTestOrg, seedUser, makeContext } from "./helpers";
import { authRouter } from "../routers/auth";

beforeAll(async () => {
  await initTestEnvironment();
});

describe("updateUserRole role hierarchy (HIGH regression)", () => {
  it("an admin cannot self-promote or grant owner, but can set a lower role", async () => {
    const { orgId } = await seedTestOrg();
    const { userId: adminId } = await seedUser(orgId, { role: "admin", matrixRole: "admin" });
    const { userId: memberId } = await seedUser(orgId, { role: "member" });
    const caller = authRouter.createCaller(makeContext(adminId, orgId)); // ctx.user is an admin, id=adminId

    // Self-promotion is refused outright.
    await expect(caller.updateUserRole({ userId: adminId, role: "owner" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Granting a role above the caller's own is refused.
    await expect(caller.updateUserRole({ userId: memberId, role: "owner" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // A role at or below the caller's rank is allowed.
    const updated = await caller.updateUserRole({ userId: memberId, role: "viewer" });
    expect(updated.role).toBe("viewer");
  });

  it("an admin cannot modify a user ranked above them (an owner)", async () => {
    const { orgId } = await seedTestOrg();
    const { userId: adminId } = await seedUser(orgId, { role: "admin", matrixRole: "admin" });
    const { userId: ownerId } = await seedUser(orgId, { role: "owner" });
    const caller = authRouter.createCaller(makeContext(adminId, orgId));

    await expect(caller.updateUserRole({ userId: ownerId, role: "member" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
