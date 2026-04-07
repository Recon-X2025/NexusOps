import { describe, it, expect } from "vitest";
import {
  hasPermission,
  canAccessModule,
  getVisibleModules,
  ROLE_PERMISSIONS,
} from "../rbac-matrix";
import type { SystemRole, Module, RbacAction } from "../rbac-matrix";

// ── hasPermission ──────────────────────────────────────────────────────────

describe("hasPermission", () => {
  describe("admin role", () => {
    it("grants access to any module and action", () => {
      expect(hasPermission(["admin"], "incidents", "read")).toBe(true);
      expect(hasPermission(["admin"], "grc", "delete")).toBe(true);
      expect(hasPermission(["admin"], "financial", "admin")).toBe(true);
      expect(hasPermission(["admin"], "accounts", "write")).toBe(true);
    });
  });

  describe("itil role", () => {
    it("can read incidents", () => {
      expect(hasPermission(["itil"], "incidents", "read")).toBe(true);
    });

    it("can write incidents", () => {
      expect(hasPermission(["itil"], "incidents", "write")).toBe(true);
    });

    it("cannot delete incidents", () => {
      expect(hasPermission(["itil"], "incidents", "delete")).toBe(false);
    });

    it("cannot access grc module", () => {
      expect(hasPermission(["itil"], "grc", "read")).toBe(false);
    });

    it("cannot access financial module", () => {
      expect(hasPermission(["itil"], "financial", "read")).toBe(false);
    });

    it("cannot access accounts (CRM) module", () => {
      expect(hasPermission(["itil"], "accounts", "read")).toBe(false);
    });
  });

  describe("requester role", () => {
    it("can read and write catalog", () => {
      expect(hasPermission(["requester"], "catalog", "read")).toBe(true);
      expect(hasPermission(["requester"], "catalog", "write")).toBe(true);
    });

    it("can read and write incidents", () => {
      expect(hasPermission(["requester"], "incidents", "read")).toBe(true);
      expect(hasPermission(["requester"], "incidents", "write")).toBe(true);
    });

    it("can only read approvals (not write)", () => {
      expect(hasPermission(["requester"], "approvals", "read")).toBe(true);
      expect(hasPermission(["requester"], "approvals", "write")).toBe(false);
    });

    it("cannot access security module", () => {
      expect(hasPermission(["requester"], "security", "read")).toBe(false);
    });

    it("cannot access financial module", () => {
      expect(hasPermission(["requester"], "financial", "read")).toBe(false);
    });
  });

  describe("itil_admin role", () => {
    it("has full access to incidents", () => {
      const actions: RbacAction[] = ["read", "write", "delete", "admin", "assign", "close"];
      for (const action of actions) {
        expect(hasPermission(["itil_admin"], "incidents", action)).toBe(true);
      }
    });

    it("can approve changes", () => {
      expect(hasPermission(["itil_admin"], "changes", "approve")).toBe(true);
    });
  });

  describe("security_analyst role", () => {
    it("can read security module", () => {
      expect(hasPermission(["security_analyst"], "security", "read")).toBe(true);
    });

    it("cannot admin security module", () => {
      expect(hasPermission(["security_analyst"], "security", "admin")).toBe(false);
    });
  });

  describe("combined roles", () => {
    it("grants access when any role has the permission", () => {
      // requester alone cannot read reports; report_viewer can
      expect(hasPermission(["requester"], "reports", "read")).toBe(false);
      expect(hasPermission(["requester", "report_viewer"], "reports", "read")).toBe(true);
    });

    it("does not grant delete access from combined non-privileged roles", () => {
      expect(hasPermission(["requester", "report_viewer"], "incidents", "delete")).toBe(false);
    });
  });

  describe("empty roles array", () => {
    it("denies access for all modules", () => {
      expect(hasPermission([], "incidents", "read")).toBe(false);
      expect(hasPermission([], "catalog", "write")).toBe(false);
    });
  });

  describe("unknown role graceful handling", () => {
    it("denies access for an unrecognised role without throwing", () => {
      expect(hasPermission(["nonexistent_role" as SystemRole], "incidents", "read")).toBe(false);
    });
  });
});

// ── canAccessModule ────────────────────────────────────────────────────────

describe("canAccessModule", () => {
  it("returns true for admin on any module", () => {
    expect(canAccessModule(["admin"], "grc")).toBe(true);
  });

  it("returns true when the role has read access to the module", () => {
    expect(canAccessModule(["itil"], "incidents")).toBe(true);
  });

  it("returns false when the role has no access to the module", () => {
    expect(canAccessModule(["itil"], "grc")).toBe(false);
  });

  it("returns false for empty roles", () => {
    expect(canAccessModule([], "incidents")).toBe(false);
  });
});

// ── getVisibleModules ──────────────────────────────────────────────────────

describe("getVisibleModules", () => {
  it("returns a large set of modules for admin", () => {
    const modules = getVisibleModules(["admin"]);
    expect(modules.size).toBeGreaterThan(20);
    expect(modules.has("incidents")).toBe(true);
    expect(modules.has("grc")).toBe(true);
    expect(modules.has("financial")).toBe(true);
    expect(modules.has("accounts")).toBe(true);
  });

  it("includes only permitted modules for itil role", () => {
    const modules = getVisibleModules(["itil"]);
    expect(modules.has("incidents")).toBe(true);
    expect(modules.has("knowledge")).toBe(true);
    // itil cannot read grc or financial
    expect(modules.has("grc")).toBe(false);
    expect(modules.has("financial")).toBe(false);
  });

  it("includes only permitted modules for requester role", () => {
    const modules = getVisibleModules(["requester"]);
    expect(modules.has("catalog")).toBe(true);
    expect(modules.has("incidents")).toBe(true);
    // requester has no access to security or grc
    expect(modules.has("security")).toBe(false);
    expect(modules.has("grc")).toBe(false);
  });

  it("returns empty set for empty roles", () => {
    const modules = getVisibleModules([]);
    expect(modules.size).toBe(0);
  });

  it("merges visible modules from combined roles", () => {
    const modulesItil = getVisibleModules(["itil"]);
    const modulesGrc = getVisibleModules(["grc_analyst"]);
    const modulesBoth = getVisibleModules(["itil", "grc_analyst"]);
    // Combined set should be a superset
    for (const m of modulesItil) {
      expect(modulesBoth.has(m)).toBe(true);
    }
    for (const m of modulesGrc) {
      expect(modulesBoth.has(m)).toBe(true);
    }
  });
});

// ── ROLE_PERMISSIONS matrix integrity ─────────────────────────────────────

describe("ROLE_PERMISSIONS matrix integrity", () => {
  const allRoles = Object.keys(ROLE_PERMISSIONS) as SystemRole[];

  it("every role entry is an object (not null/undefined)", () => {
    for (const role of allRoles) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
      expect(typeof ROLE_PERMISSIONS[role]).toBe("object");
    }
  });

  it("every permission list is a non-empty array of valid RbacAction strings", () => {
    const validActions: RbacAction[] = ["read", "write", "delete", "admin", "approve", "assign", "close"];
    for (const role of allRoles) {
      const perms = ROLE_PERMISSIONS[role];
      for (const [, actions] of Object.entries(perms)) {
        expect(Array.isArray(actions)).toBe(true);
        expect((actions as string[]).length).toBeGreaterThan(0);
        for (const action of actions as string[]) {
          expect(validActions).toContain(action);
        }
      }
    }
  });

  it("admin role matrix does not accidentally define broad module permissions (relies on short-circuit)", () => {
    // admin should short-circuit in hasPermission; its matrix entry is minimal
    const adminPerms = ROLE_PERMISSIONS["admin"];
    // admin should not have sprawling explicit entries — just settings
    const adminModuleCount = Object.keys(adminPerms).length;
    expect(adminModuleCount).toBeLessThan(5);
  });
});
