/**
 * HIGH regression: a custom role's CRUD+manage permissions must actually
 * authorise the write/admin runtime gates.
 *
 * Custom permissions are stored as create/read/update/delete/manage, but the
 * runtime gates check RbacAction (read/write/delete/admin/approve/...). Without a
 * mapping, a granted 'create'/'update'/'manage' matched nothing and the custom
 * role silently authorised nothing on those procedures.
 */
import { describe, it, expect } from "vitest";
import { checkDbUserPermission } from "../lib/rbac-db";

// 'viewer' has no inherent financial:write/admin, so any true below comes only
// from the custom permission.
const BASE = "viewer";
const perm = (action: string) => [{ resource: "financial", action }];

describe("custom-role action vocabulary maps to runtime RbacActions (HIGH regression)", () => {
  it("'create' and 'update' grant write (not admin)", () => {
    expect(checkDbUserPermission(BASE, "financial", "write", null, perm("create"))).toBe(true);
    expect(checkDbUserPermission(BASE, "financial", "write", null, perm("update"))).toBe(true);
    expect(checkDbUserPermission(BASE, "financial", "admin", null, perm("create"))).toBe(false);
  });

  it("'manage' grants full control (write, admin, approve)", () => {
    expect(checkDbUserPermission(BASE, "financial", "write", null, perm("manage"))).toBe(true);
    expect(checkDbUserPermission(BASE, "financial", "admin", null, perm("manage"))).toBe(true);
    expect(checkDbUserPermission(BASE, "financial", "approve", null, perm("manage"))).toBe(true);
  });

  it("'read'/'delete' map through, and a grant does not leak to write", () => {
    expect(checkDbUserPermission(BASE, "financial", "read", null, perm("read"))).toBe(true);
    expect(checkDbUserPermission(BASE, "financial", "write", null, perm("read"))).toBe(false);
    expect(checkDbUserPermission(BASE, "financial", "delete", null, perm("delete"))).toBe(true);
  });

  it("a custom permission for a DIFFERENT resource does not grant", () => {
    expect(checkDbUserPermission(BASE, "financial", "write", null, [{ resource: "tickets", action: "manage" }])).toBe(false);
  });
});
