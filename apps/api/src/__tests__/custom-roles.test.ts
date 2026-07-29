/**
 * Custom Roles E2E & Unit Test
 * Validates custom role creation, permission mapping, matrix role assignment, permission enforcement, and archival safety.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  createSession,
  cleanupOrg,
} from "./helpers";

describe("Custom Role Management & RBAC Enforcement", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let adminToken: string;
  let memberToken: string;
  let customRoleId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL not set for custom-roles tests");
    }
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    adminToken = await createSession(orgCtx.adminId);
    memberToken = await createSession(orgCtx.requesterId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  it("admin can create a custom role with specific module permissions", async () => {
    const adminCaller = await authedCaller(adminToken);

    const created = await adminCaller.admin.roles.create({
      name: "Regional IT Lead",
      description: "Custom role for regional IT operations",
      permissions: [
        { resource: "incidents", action: "read" },
        { resource: "incidents", action: "update" },
        { resource: "changes", action: "read" },
      ],
    });

    expect(created).toBeDefined();
    expect(created.id).toBeDefined();
    expect(created.name).toBe("Regional IT Lead");
    customRoleId = created.id;
  });

  it("admin can list custom roles and see created role with permissions", async () => {
    const adminCaller = await authedCaller(adminToken);
    const customRoles = await adminCaller.admin.roles.list();

    const found = customRoles.find((r: any) => r.id === customRoleId);
    expect(found).toBeDefined();
    expect(found.name).toBe("Regional IT Lead");
    expect(found.permissions).toHaveLength(3);
    expect(found.permissions).toEqual(
      expect.arrayContaining([
        { resource: "incidents", action: "read" },
        { resource: "incidents", action: "update" },
        { resource: "changes", action: "read" },
      ]),
    );
  });

  it("admin can update custom role permissions", async () => {
    const adminCaller = await authedCaller(adminToken);

    const updated = await adminCaller.admin.roles.update({
      id: customRoleId,
      name: "Regional IT Lead - Updated",
      description: "Updated description",
      permissions: [
        { resource: "incidents", action: "read" },
        { resource: "incidents", action: "update" },
        { resource: "problems", action: "read" },
      ],
    });

    expect(updated.name).toBe("Regional IT Lead - Updated");

    const customRoles = await adminCaller.admin.roles.list();
    const found = customRoles.find((r: any) => r.id === customRoleId);
    expect(found.permissions).toHaveLength(3);
    expect(found.permissions).toEqual(
      expect.arrayContaining([{ resource: "problems", action: "read" }]),
    );
  });

  it("admin can assign custom role to a user", async () => {
    const adminCaller = await authedCaller(adminToken);

    const updatedUser = await adminCaller.admin.users.update({
      userId: orgCtx.requesterId,
      matrixRole: customRoleId,
    });

    expect(updatedUser.matrixRole).toBe(customRoleId);
    memberToken = await createSession(orgCtx.requesterId);
  });

  it("user with custom role has custom permissions applied", async () => {
    const userCaller = await authedCaller(memberToken);

    // Should be able to query tickets (granted read permission via custom role)
    const tickets = await userCaller.tickets.list({});
    expect(tickets).toBeDefined();
  });

  it("admin cannot archive a custom role while assigned to users", async () => {
    const adminCaller = await authedCaller(adminToken);

    await expect(
      adminCaller.admin.roles.archive({ id: customRoleId, archive: true }),
    ).rejects.toThrow(/Cannot archive a role that is assigned to users/i);
  });

  it("admin can unassign user and archive the custom role", async () => {
    const adminCaller = await authedCaller(adminToken);

    // Unassign user
    await adminCaller.admin.users.update({
      userId: orgCtx.requesterId,
      matrixRole: null,
    });

    // Now archive custom role
    const archived = await adminCaller.admin.roles.archive({
      id: customRoleId,
      archive: true,
    });

    expect(archived.isArchived).toBe(true);
  });
});
