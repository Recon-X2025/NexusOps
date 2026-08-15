/**
 * LOAD-BEARING: every tenant owner's access to the product depends on one line.
 *
 *   packages/types/src/rbac-matrix.ts  →  hasPermission()
 *   `if (roles.includes("admin")) return true;`
 *
 * A tenant owner is `users.role = "owner"` with `users.matrix_role = NULL` —
 * that is what auth.signup creates, and nothing creates a matrix role row for a
 * new org (verified: zero `roles` rows exist for a freshly signed-up org).
 * systemRolesForDbUser maps owner → ["requester", "admin"], and it is the
 * short-circuit above — NOT the ROLE_PERMISSIONS["admin"] table — that then
 * grants hr / financial / admin.
 *
 * ROLE_PERMISSIONS["admin"] lists only settings, command_center and workbench.
 * It reads like the definition of admin. It is not; it is never consulted for
 * admin. Delete the short-circuit "because the table covers it" and every tenant
 * owner instantly loses payroll, HR and finance. This suite is what fails.
 *
 * Asserted through the product's own path (systemRolesForDbUser →
 * checkDbUserPermission → hasPermission), never by re-implementing the rule.
 */
import { describe, it, expect } from "vitest";
import { hasPermission } from "@coheronconnect/types";
import { checkDbUserPermission, systemRolesForDbUser } from "../lib/rbac-db";

/** What auth.signup actually produces for a brand-new tenant. */
const OWNER_DB_ROLE = "owner";
const NO_MATRIX_ROLE = null;

const CRITICAL = [
  { module: "hr", action: "read" },
  { module: "hr", action: "write" },
  { module: "payroll", action: "read" },
  { module: "financial", action: "read" },
  { module: "financial", action: "write" },
  { module: "admin", action: "read" },
  { module: "users", action: "read" },
] as const;

describe("owner + no matrix role — the permission short-circuit", () => {
  it("maps DB role owner to the admin system role without any matrix role", () => {
    const roles = systemRolesForDbUser(OWNER_DB_ROLE, NO_MATRIX_ROLE);
    expect(roles).toContain("admin");
    expect(roles).toContain("requester");
  });

  it.each(CRITICAL)(
    "permits owner (matrixRole null) on $module.$action",
    ({ module, action }) => {
      expect(
        checkDbUserPermission(OWNER_DB_ROLE, module, action, NO_MATRIX_ROLE),
        `A tenant owner was DENIED ${module}.${action}. If this failed after editing ` +
          `rbac-matrix.ts, the "admin" short-circuit in hasPermission() was removed or ` +
          `weakened — restore it. ROLE_PERMISSIONS["admin"] is NOT the source of truth.`,
      ).toBe(true);
    },
  );

  it("is the short-circuit doing the work, not the admin permission table", () => {
    // Proves the dependency directly: the admin role grants these through the
    // roles.includes("admin") branch, while the table itself does not list them.
    expect(hasPermission(["admin"], "hr", "read")).toBe(true);
    expect(hasPermission(["admin"], "payroll", "read")).toBe(true);

    // requester alone (a plain member) must NOT reach payroll — otherwise this
    // suite would pass even with the short-circuit gone, and prove nothing.
    expect(hasPermission(["requester"], "payroll", "read")).toBe(false);
    expect(hasPermission(["requester"], "financial", "read")).toBe(false);
  });

  it("still denies a plain member, so the grant is owner-specific", () => {
    expect(checkDbUserPermission("member", "payroll", "read", null)).toBe(false);
    expect(checkDbUserPermission("member", "financial", "write", null)).toBe(false);
  });
});
