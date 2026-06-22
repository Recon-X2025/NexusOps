/**
 * RBAC unit tests — role mapping & permission checks.
 *
 * Verifies v3.1 behaviour:
 *  1. member → ["requester"]  (was "itil")
 *  2. matrix_role is ADDITIVE (base role preserved)
 *  3. itil no longer has grc/finance/procurement write
 *  4. operator_field & manager_ops have correct permissions
 */

import { describe, it, expect } from "vitest";
import { systemRolesForDbUser, checkDbUserPermission } from "../lib/rbac-db";
import { hasPermission, canAccessModule } from "@coheronconnect/types";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Basic role mapping
// ─────────────────────────────────────────────────────────────────────────────
describe("systemRolesForDbUser — base mapping", () => {
  it("member with no matrix_role → requester (not itil)", () => {
    const roles = systemRolesForDbUser("member", null);
    expect(roles).toEqual(["requester"]);
    expect(roles).not.toContain("itil");
  });

  it("owner → admin", () => {
    expect(systemRolesForDbUser("owner", null)).toEqual(["requester", "admin"]);
  });

  it("admin → admin", () => {
    expect(systemRolesForDbUser("admin", null)).toEqual(["requester", "admin"]);
  });

  it("viewer → report_viewer", () => {
    expect(systemRolesForDbUser("viewer", null)).toEqual(["requester", "report_viewer"]);
  });

  it("unknown role → requester (safe fallback)", () => {
    expect(systemRolesForDbUser("something_unknown", null)).toEqual(["requester"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. matrix_role is ADDITIVE
// ─────────────────────────────────────────────────────────────────────────────
describe("systemRolesForDbUser — matrix_role is additive", () => {
  it("member + itil → [requester, itil]", () => {
    const roles = systemRolesForDbUser("member", "itil");
    expect(roles).toContain("requester");
    expect(roles).toContain("itil");
  });

  it("member + operator_field → [requester, operator_field]", () => {
    const roles = systemRolesForDbUser("member", "operator_field");
    expect(roles).toContain("requester");
    expect(roles).toContain("operator_field");
  });

  it("owner + hr_manager → [requester, admin, hr_manager]", () => {
    const roles = systemRolesForDbUser("owner", "hr_manager");
    expect(roles).toContain("requester");
    expect(roles).toContain("admin");
    expect(roles).toContain("hr_manager");
  });

  it("member + finance_manager → [requester, finance_manager]", () => {
    const roles = systemRolesForDbUser("member", "finance_manager");
    expect(roles).toContain("requester");
    expect(roles).toContain("finance_manager");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. itil role — restricted to IT modules only
// ─────────────────────────────────────────────────────────────────────────────
describe("itil role — IT modules only", () => {
  const itilRoles = ["itil"] as const;

  it("itil can read incidents", () => {
    expect(hasPermission([...itilRoles], "incidents", "read")).toBe(true);
  });

  it("itil can write incidents", () => {
    expect(hasPermission([...itilRoles], "incidents", "write")).toBe(true);
  });

  it("itil CANNOT write grc", () => {
    expect(hasPermission([...itilRoles], "grc", "write")).toBe(false);
  });

  it("itil CANNOT read grc", () => {
    expect(hasPermission([...itilRoles], "grc", "read")).toBe(false);
  });

  it("itil CANNOT access financial", () => {
    expect(canAccessModule([...itilRoles], "financial")).toBe(false);
  });

  it("itil CANNOT write procurement", () => {
    expect(hasPermission([...itilRoles], "procurement", "write")).toBe(false);
  });

  it("itil CANNOT write security", () => {
    expect(hasPermission([...itilRoles], "security", "write")).toBe(false);
  });

  it("itil CANNOT access accounts (CRM)", () => {
    expect(canAccessModule([...itilRoles], "accounts")).toBe(false);
  });

  it("itil CANNOT access projects", () => {
    expect(canAccessModule([...itilRoles], "projects")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. requester — self-service only
// ─────────────────────────────────────────────────────────────────────────────
describe("requester role — self-service only", () => {
  const req = ["requester"] as const;

  it("requester can write incidents", () => {
    expect(hasPermission([...req], "incidents", "write")).toBe(true);
  });

  it("requester can read catalog", () => {
    expect(canAccessModule([...req], "catalog")).toBe(true);
  });

  it("requester CANNOT access grc", () => {
    expect(canAccessModule([...req], "grc")).toBe(false);
  });

  it("requester CANNOT access financial", () => {
    expect(canAccessModule([...req], "financial")).toBe(false);
  });

  it("requester CANNOT approve approvals", () => {
    expect(hasPermission([...req], "approvals", "approve")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. operator_field — work orders specialist
// ─────────────────────────────────────────────────────────────────────────────
describe("operator_field role", () => {
  const of_ = ["operator_field"] as const;

  it("can read+write work_orders", () => {
    expect(hasPermission([...of_], "work_orders", "read")).toBe(true);
    expect(hasPermission([...of_], "work_orders", "write")).toBe(true);
  });

  it("can close work_orders", () => {
    expect(hasPermission([...of_], "work_orders", "close")).toBe(true);
  });

  it("CANNOT access grc", () => {
    expect(canAccessModule([...of_], "grc")).toBe(false);
  });

  it("CANNOT access financial", () => {
    expect(canAccessModule([...of_], "financial")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. manager_ops — approve + report, no writes
// ─────────────────────────────────────────────────────────────────────────────
describe("manager_ops role", () => {
  const mgr = ["manager_ops"] as const;

  it("can approve approvals", () => {
    expect(hasPermission([...mgr], "approvals", "approve")).toBe(true);
  });

  it("can read reports", () => {
    expect(hasPermission([...mgr], "reports", "read")).toBe(true);
  });

  it("CANNOT write incidents (assign only)", () => {
    expect(hasPermission([...mgr], "incidents", "write")).toBe(false);
  });

  it("CANNOT access grc", () => {
    expect(canAccessModule([...mgr], "grc")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. finance_manager — finance + procurement approval
// ─────────────────────────────────────────────────────────────────────────────
describe("finance_manager role", () => {
  const fin = ["finance_manager"] as const;

  it("can read+write financial", () => {
    expect(hasPermission([...fin], "financial", "read")).toBe(true);
    expect(hasPermission([...fin], "financial", "write")).toBe(true);
  });

  it("can approve procurement", () => {
    expect(hasPermission([...fin], "procurement", "approve")).toBe(true);
  });

  it("CANNOT create procurement (write)", () => {
    expect(hasPermission([...fin], "procurement", "write")).toBe(false);
  });

  it("CANNOT access incidents", () => {
    expect(canAccessModule([...fin], "incidents")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. checkDbUserPermission — integration smoke test
// ─────────────────────────────────────────────────────────────────────────────
describe("checkDbUserPermission (API helper)", () => {
  it("member (no matrix) cannot read grc", () => {
    expect(checkDbUserPermission("member", "grc", "read")).toBe(false);
  });

  it("member + itil can read incidents", () => {
    expect(checkDbUserPermission("member", "incidents", "read", "itil")).toBe(true);
  });

  it("member + grc_analyst can read grc", () => {
    expect(checkDbUserPermission("member", "grc", "read", "grc_analyst")).toBe(true);
  });

  it("owner can do anything (admin shortcut)", () => {
    expect(checkDbUserPermission("owner", "financial", "delete")).toBe(true);
  });
});
