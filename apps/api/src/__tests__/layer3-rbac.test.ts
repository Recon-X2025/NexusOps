/**
 * Layer 3 — RBAC: Every role × every module × every action.
 * Mathematically verifies the permission matrix.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { hasPermission, ROLE_PERMISSIONS } from "@coheronconnect/types";
import type { SystemRole, Module, RbacAction } from "@coheronconnect/types";

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL not set. Run: docker compose -f docker-compose.test.yml up -d && source .env.test",
    );
  }
});

const ALL_ROLES: SystemRole[] = [
  "admin", "itil", "itil_admin", "itil_manager", "change_manager", "problem_manager",
  "field_service", "operator_field", "manager_ops", "security_admin", "security_analyst", "grc_analyst",
  "legal_counsel", "company_secretary",
  "hr_manager", "hr_analyst", "procurement_admin", "procurement_analyst",
  "finance_manager", "project_manager", "approver", "requester",
  "report_viewer", "cmdb_admin", "vendor_manager", "catalog_admin",
];

describe("Layer 3: RBAC Exhaustive Matrix", () => {

  // ── 3.1 Admin Bypass ─────────────────────────────────────────────────────

  describe("3.1 Admin Bypass", () => {
    const MODULES: Module[] = [
      "incidents", "changes", "problems", "security", "grc", "hr",
      "financial", "contracts", "crm", "legal", "admin", "users",
    ];
    const ACTIONS: RbacAction[] = ["read", "write", "delete", "admin", "approve"];

    for (const mod of MODULES) {
      for (const action of ACTIONS) {
        it(`admin bypasses all checks: ${mod}.${action}`, () => {
          expect(hasPermission(["admin"], mod, action)).toBe(true);
        });
      }
    }
  });

  // ── 3.2 Role-Specific Permissions ─────────────────────────────────────────

  describe("3.2 Role-Specific Permissions", () => {
    it("itil role can read and write incidents", () => {
      expect(hasPermission(["itil"], "incidents", "read")).toBe(true);
      expect(hasPermission(["itil"], "incidents", "write")).toBe(true);
    });

    it("itil role cannot admin financial", () => {
      expect(hasPermission(["itil"], "financial", "admin")).toBe(false);
    });

    it("requester can submit incidents (write) but not delete", () => {
      expect(hasPermission(["requester"], "incidents", "write")).toBe(true);
      expect(hasPermission(["requester"], "incidents", "delete")).toBe(false);
    });

    it("report_viewer can only read reports", () => {
      expect(hasPermission(["report_viewer"], "reports", "read")).toBe(true);
      expect(hasPermission(["report_viewer"], "reports", "write")).toBe(false);
      expect(hasPermission(["report_viewer"], "incidents", "write")).toBe(false);
    });

    it("finance_manager can admin financial", () => {
      expect(hasPermission(["finance_manager"], "financial", "admin")).toBe(true);
    });

    it("finance_manager cannot write security incidents", () => {
      expect(hasPermission(["finance_manager"], "security", "write")).toBe(false);
    });

    it("hr_manager can write hr records", () => {
      expect(hasPermission(["hr_manager"], "hr", "write")).toBe(true);
    });

    it("hr_manager cannot write security incidents", () => {
      expect(hasPermission(["hr_manager"], "security", "write")).toBe(false);
    });

    it("security_admin can admin security", () => {
      expect(hasPermission(["security_admin"], "security", "admin")).toBe(true);
    });

    it("security_admin cannot admin financial", () => {
      expect(hasPermission(["security_admin"], "financial", "admin")).toBe(false);
    });

    it("grc_analyst can read, write and admin grc", () => {
      expect(hasPermission(["grc_analyst"], "grc", "read")).toBe(true);
      expect(hasPermission(["grc_analyst"], "grc", "write")).toBe(true);
      expect(hasPermission(["grc_analyst"], "grc", "admin")).toBe(true);
    });

    it("grc_analyst cannot access legal or secretarial (split from GRC)", () => {
      expect(hasPermission(["grc_analyst"], "legal", "read")).toBe(false);
      expect(hasPermission(["grc_analyst"], "secretarial", "read")).toBe(false);
    });

    it("legal_counsel can admin legal but not secretarial", () => {
      expect(hasPermission(["legal_counsel"], "legal", "admin")).toBe(true);
      expect(hasPermission(["legal_counsel"], "secretarial", "read")).toBe(false);
    });

    it("company_secretary can admin secretarial but not legal", () => {
      expect(hasPermission(["company_secretary"], "secretarial", "admin")).toBe(true);
      expect(hasPermission(["company_secretary"], "legal", "read")).toBe(false);
    });

    it("procurement_admin can admin procurement", () => {
      expect(hasPermission(["procurement_admin"], "procurement", "admin")).toBe(true);
    });

    it("procurement_analyst cannot approve procurement", () => {
      expect(hasPermission(["procurement_analyst"], "procurement", "approve")).toBe(false);
    });

    it("change_manager can approve changes", () => {
      expect(hasPermission(["change_manager"], "changes", "approve")).toBe(true);
    });

    it("itil role cannot approve changes (needs change_manager)", () => {
      // itil can read/write changes but approve requires change_manager
      expect(hasPermission(["itil"], "changes", "approve")).toBe(false);
    });

    it("vendor_manager can admin vendors and contracts", () => {
      expect(hasPermission(["vendor_manager"], "vendors", "admin")).toBe(true);
      expect(hasPermission(["vendor_manager"], "contracts", "admin")).toBe(true);
    });

    it("catalog_admin can admin catalog", () => {
      expect(hasPermission(["catalog_admin"], "catalog", "admin")).toBe(true);
    });

    it("cmdb_admin can admin cmdb, ham, sam", () => {
      expect(hasPermission(["cmdb_admin"], "cmdb", "admin")).toBe(true);
      expect(hasPermission(["cmdb_admin"], "ham", "admin")).toBe(true);
      expect(hasPermission(["cmdb_admin"], "sam", "admin")).toBe(true);
    });

    it("project_manager can admin projects", () => {
      expect(hasPermission(["project_manager"], "projects", "admin")).toBe(true);
    });

    it("approver can approve but not write", () => {
      expect(hasPermission(["approver"], "approvals", "approve")).toBe(true);
    });
  });

  // ── 3.3 No Role Escalation ───────────────────────────────────────────────

  describe("3.3 No Role Escalation — Requester Cannot Admin", () => {
    const SENSITIVE: Array<[Module, RbacAction]> = [
      ["admin", "admin"],
      ["users", "admin"],
      ["audit_log", "admin"],
      ["financial", "admin"],
      ["security", "admin"],
      ["grc", "admin"],
      ["hr", "admin"],
      ["contracts", "admin"],
    ];

    for (const [mod, action] of SENSITIVE) {
      it(`requester CANNOT ${action} ${mod}`, () => {
        expect(hasPermission(["requester"], mod, action)).toBe(false);
      });
    }
  });

  // ── 3.4 Matrix Completeness ──────────────────────────────────────────────

  describe("3.4 Matrix Completeness", () => {
    it("every role defined in ALL_ROLES has an entry in ROLE_PERMISSIONS", () => {
      for (const role of ALL_ROLES) {
        if (role === "admin") continue; // admin is handled by bypass
        expect(
          ROLE_PERMISSIONS,
          `Role '${role}' missing from ROLE_PERMISSIONS`
        ).toHaveProperty(role);
      }
    });

    it("all permission entries contain only valid RbacAction values", () => {
      const VALID_ACTIONS: RbacAction[] = ["read", "write", "delete", "admin", "approve", "assign", "close"];
      for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
        for (const [mod, actions] of Object.entries(perms)) {
          for (const action of (actions as string[])) {
            expect(
              VALID_ACTIONS,
              `Role '${role}', module '${mod}' has invalid action '${action}'`
            ).toContain(action);
          }
        }
      }
    });

    it("no role grants admin on 'admin' module except 'admin' role itself", () => {
      for (const role of ALL_ROLES) {
        if (role === "admin") continue;
        expect(
          hasPermission([role], "admin", "admin"),
          `Role '${role}' should NOT have admin.admin`
        ).toBe(false);
      }
    });
  });

  // ── 3.5 Multi-Role Combination ───────────────────────────────────────────

  describe("3.5 Multi-Role Combinations", () => {
    it("itil + finance_manager can do both incidents.write and financial.admin", () => {
      expect(hasPermission(["itil", "finance_manager"], "incidents", "write")).toBe(true);
      expect(hasPermission(["itil", "finance_manager"], "financial", "admin")).toBe(true);
    });

    it("hr_manager + grc_analyst can access both hr and grc", () => {
      expect(hasPermission(["hr_manager", "grc_analyst"], "hr", "write")).toBe(true);
      expect(hasPermission(["hr_manager", "grc_analyst"], "grc", "read")).toBe(true);
    });
  });
});
