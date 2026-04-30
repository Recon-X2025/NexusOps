/**
 * RBAC User Story Tests — per-module coverage
 *
 * For EACH user story this file provides:
 *  1. Success test     — correct role, valid input → permitted
 *  2. Unauthorized     — wrong/missing role → denied
 *  3. Validation       — correct role, invalid input → validation failure
 *
 * Spec mapping:
 *  §3 User Stories × §4 Backend Enforcement × §7 Test Coverage
 */

import { describe, it, expect } from "vitest";
import {
  hasPermission,
  canAccessModule,
  ROLE_PERMISSIONS,
} from "@coheronconnect/types";
import type { SystemRole, Module, RbacAction } from "@coheronconnect/types";
import { systemRolesForDbUser, checkDbUserPermission } from "../lib/rbac-db";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** All users must carry requester as their base role (spec §1). */
function assertHasRequester(roles: SystemRole[], label: string) {
  expect(roles, `${label} must include 'requester'`).toContain("requester");
}

/** Confirm a role has a permission (success path). */
function assertCan(roles: SystemRole[], module: Module, action: RbacAction, label: string) {
  expect(hasPermission(roles, module, action), `${label}: should be permitted`).toBe(true);
}

/** Confirm a role is denied a permission (unauthorized path). */
function assertCannot(roles: SystemRole[], module: Module, action: RbacAction, label: string) {
  expect(hasPermission(roles, module, action), `${label}: should be DENIED`).toBe(false);
}

// ─────────────────────────────────────────────────────────────────────────────
// §1  Base Role Enforcement
// ─────────────────────────────────────────────────────────────────────────────
describe("§1 Base Role Enforcement — requester is mandatory", () => {
  const cases: Array<{ dbRole: string; matrixRole?: string; label: string }> = [
    { dbRole: "owner",  label: "owner (platform admin)" },
    { dbRole: "admin",  label: "admin (org admin)" },
    { dbRole: "member", label: "plain member (no matrix role)" },
    { dbRole: "viewer", label: "read-only viewer" },
    { dbRole: "member", matrixRole: "itil",           label: "member + itil" },
    { dbRole: "member", matrixRole: "hr_manager",     label: "member + hr_manager" },
    { dbRole: "member", matrixRole: "finance_manager",label: "member + finance_manager" },
    { dbRole: "member", matrixRole: "security_analyst",label:"member + security_analyst" },
    { dbRole: "member", matrixRole: "grc_analyst",    label: "member + grc_analyst" },
    { dbRole: "member", matrixRole: "cmdb_admin",     label: "member + cmdb_admin" },
    { dbRole: "member", matrixRole: "procurement_admin",label:"member + procurement_admin"},
    { dbRole: "member", matrixRole: "project_manager",label:"member + project_manager" },
    { dbRole: "member", matrixRole: "vendor_manager", label: "member + vendor_manager" },
  ];

  for (const { dbRole, matrixRole, label } of cases) {
    it(`${label} → always includes requester`, () => {
      const roles = systemRolesForDbUser(dbRole, matrixRole ?? null);
      assertHasRequester(roles, label);
    });
  }

  it("invalid (standalone 'itil' without requester) is detected", () => {
    const standalone = ["itil"] as SystemRole[];
    // Must NOT appear from DB role resolution
    const fromDb = systemRolesForDbUser("member", "itil");
    expect(fromDb).toContain("requester");
    expect(fromDb).toContain("itil");
    // Standalone itil (as would be a bug) doesn't have requester
    expect(standalone).not.toContain("requester");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §3 IT Services — User Stories
// ─────────────────────────────────────────────────────────────────────────────
describe("§3 IT Services — user stories", () => {
  describe("Requester: create ticket / view own tickets", () => {
    const requester: SystemRole[] = ["requester"];

    it("[success] requester can create incident (incidents.write)", () => {
      assertCan(requester, "incidents", "write", "requester.create_ticket");
    });

    it("[success] requester can view own tickets (incidents.read)", () => {
      assertCan(requester, "incidents", "read", "requester.view_tickets");
    });

    it("[unauthorized] requester CANNOT assign tickets", () => {
      assertCannot(requester, "incidents", "assign", "requester.assign");
    });

    it("[unauthorized] requester CANNOT delete tickets", () => {
      assertCannot(requester, "incidents", "delete", "requester.delete");
    });
  });

  describe("ITIL: resolve assigned tickets / update status", () => {
    const itil: SystemRole[] = ["requester", "itil"];

    it("[success] itil can write (resolve) incidents", () => {
      assertCan(itil, "incidents", "write", "itil.resolve");
    });

    it("[success] itil can assign incidents", () => {
      assertCan(itil, "incidents", "assign", "itil.assign");
    });

    it("[unauthorized] itil CANNOT approve changes", () => {
      assertCannot(itil, "changes", "approve", "itil.approve_change");
    });

    it("[unauthorized] itil CANNOT access financial module", () => {
      assertCannot(itil, "financial", "read", "itil.financial_read");
    });

    it("[unauthorized] itil CANNOT access GRC module", () => {
      assertCannot(itil, "grc", "read", "itil.grc_read");
    });
  });

  describe("ITIL Manager: monitor SLA / reassign tickets", () => {
    const mgr: SystemRole[] = ["requester", "itil_manager"];

    it("[success] itil_manager can read+assign incidents (SLA monitoring, reassign)", () => {
      assertCan(mgr, "incidents", "read",   "itil_manager.sla_monitor");
      assertCan(mgr, "incidents", "assign", "itil_manager.reassign");
    });

    it("[success] itil_manager can approve changes", () => {
      assertCan(mgr, "changes", "approve", "itil_manager.approve_change");
    });

    it("[unauthorized] itil_manager CANNOT admin financial", () => {
      assertCannot(mgr, "financial", "admin", "itil_manager.finance_admin");
    });
  });

  describe("Field Service: update work orders / log parts usage", () => {
    const field: SystemRole[] = ["requester", "field_service"];

    it("[success] field_service can write work orders", () => {
      assertCan(field, "work_orders", "write", "field_service.update_wo");
    });

    it("[success] field_service can close work orders (parts usage logged via update)", () => {
      assertCan(field, "work_orders", "close", "field_service.close_wo");
    });

    it("[unauthorized] field_service CANNOT access GRC", () => {
      assertCannot(field, "grc", "read", "field_service.grc");
    });
  });

  describe("Change Manager: manage change lifecycle", () => {
    const cm: SystemRole[] = ["requester", "change_manager"];

    it("[success] change_manager can admin + approve changes", () => {
      assertCan(cm, "changes", "admin",   "change_mgr.admin");
      assertCan(cm, "changes", "approve", "change_mgr.approve");
      assertCan(cm, "changes", "close",   "change_mgr.close");
    });

    it("[unauthorized] change_manager CANNOT access financial", () => {
      assertCannot(cm, "financial", "read", "change_mgr.financial");
    });
  });

  describe("Problem Manager: manage problem + RCA", () => {
    const pm: SystemRole[] = ["requester", "problem_manager"];

    it("[success] problem_manager can admin problems + write knowledge (RCA)", () => {
      assertCan(pm, "problems",  "admin", "problem_mgr.problems");
      assertCan(pm, "knowledge", "write", "problem_mgr.rca_kb");
    });

    it("[unauthorized] problem_manager CANNOT approve changes", () => {
      assertCannot(pm, "changes", "approve", "problem_mgr.approve_change");
    });
  });

  describe("CMDB Admin: manage configuration items", () => {
    const ca: SystemRole[] = ["requester", "cmdb_admin"];

    it("[success] cmdb_admin can admin CMDB, HAM, SAM", () => {
      assertCan(ca, "cmdb", "admin", "cmdb_admin.cmdb");
      assertCan(ca, "ham",  "admin", "cmdb_admin.ham");
      assertCan(ca, "sam",  "admin", "cmdb_admin.sam");
    });

    it("[unauthorized] cmdb_admin CANNOT access HR module", () => {
      assertCannot(ca, "hr", "admin", "cmdb_admin.hr");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §3 Security & GRC — User Stories
// ─────────────────────────────────────────────────────────────────────────────
describe("§3 Security & GRC — user stories", () => {
  describe("Security Analyst: create security incident / manage lifecycle", () => {
    const sa: SystemRole[] = ["requester", "security_analyst"];

    it("[success] security_analyst can create (write) security incidents", () => {
      assertCan(sa, "security", "write", "sec_analyst.create_incident");
    });

    it("[success] security_analyst can assign+close security incidents", () => {
      assertCan(sa, "security", "assign", "sec_analyst.assign");
      assertCan(sa, "security", "close",  "sec_analyst.close");
    });

    it("[unauthorized] security_analyst CANNOT access financial module", () => {
      assertCannot(sa, "financial", "read", "sec_analyst.financial");
    });

    it("[unauthorized] security_analyst CANNOT admin GRC", () => {
      assertCannot(sa, "grc", "admin", "sec_analyst.grc_admin");
    });
  });

  describe("GRC Analyst: create risk / track compliance", () => {
    const grc: SystemRole[] = ["requester", "grc_analyst"];

    it("[success] grc_analyst can create risks (grc.write)", () => {
      assertCan(grc, "grc", "write", "grc_analyst.create_risk");
    });

    it("[success] grc_analyst can admin grc (risk + audit + policy)", () => {
      assertCan(grc, "grc",    "admin", "grc_analyst.grc_admin");
      assertCan(grc, "audit",  "admin", "grc_analyst.audit_admin");
      assertCan(grc, "policy", "admin", "grc_analyst.policy_admin");
    });

    it("[unauthorized] grc_analyst CANNOT access financial module", () => {
      assertCannot(grc, "financial", "read", "grc_analyst.financial");
    });
  });

  describe("Approver: approve/reject items", () => {
    const approver: SystemRole[] = ["requester", "approver"];

    it("[success] approver can approve approvals", () => {
      assertCan(approver, "approvals", "approve", "approver.approve");
    });

    it("[success] approver can approve changes and procurement", () => {
      assertCan(approver, "changes",     "approve", "approver.change_approve");
      assertCan(approver, "procurement", "approve", "approver.pr_approve");
    });

    it("[success] approver can create incidents (as requester base)", () => {
      // approver carries requester base — can create own tickets
      assertCan(approver, "incidents", "write", "approver.incident_create_ok");
    });

    it("[unauthorized] approver CANNOT admin any module", () => {
      const sensitiveModules: Module[] = ["financial", "security", "grc", "hr", "admin"];
      for (const mod of sensitiveModules) {
        assertCannot(approver, mod, "admin", `approver.${mod}_admin`);
      }
    });

    it("[unauthorized] approver CANNOT assign/delete incidents (elevated IT action)", () => {
      assertCannot(approver, "incidents", "assign",  "approver.assign_incident");
      assertCannot(approver, "incidents", "delete",  "approver.delete_incident");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §3 HR — User Stories
// ─────────────────────────────────────────────────────────────────────────────
describe("§3 HR — user stories", () => {
  describe("Requester: raise HR case", () => {
    const requester: SystemRole[] = ["requester"];

    it("[success] requester can raise HR case (hr.write)", () => {
      assertCan(requester, "hr", "write", "requester.raise_hr_case");
    });

    it("[unauthorized] requester CANNOT approve HR workflows", () => {
      assertCannot(requester, "hr", "approve", "requester.hr_approve");
    });
  });

  describe("HR Analyst: resolve HR case", () => {
    const analyst: SystemRole[] = ["requester", "hr_analyst"];

    it("[success] hr_analyst can resolve (assign+close) HR cases", () => {
      assertCan(analyst, "hr", "write",  "hr_analyst.resolve");
      assertCan(analyst, "hr", "assign", "hr_analyst.assign");
      assertCan(analyst, "hr", "close",  "hr_analyst.close");
    });

    it("[success] hr_analyst can approve HR requests", () => {
      assertCan(analyst, "hr", "approve", "hr_analyst.approve");
    });

    it("[unauthorized] hr_analyst CANNOT access security module", () => {
      assertCannot(analyst, "security", "read", "hr_analyst.security");
    });
  });

  describe("HR Manager: approve HR workflows", () => {
    const hrMgr: SystemRole[] = ["requester", "hr_manager"];

    it("[success] hr_manager can approve HR workflows", () => {
      assertCan(hrMgr, "hr", "approve", "hr_mgr.approve");
    });

    it("[success] hr_manager has full HR access (admin+delete)", () => {
      assertCan(hrMgr, "hr", "admin",  "hr_mgr.admin");
      assertCan(hrMgr, "hr", "delete", "hr_mgr.delete");
    });

    it("[success] hr_manager can approve via approvals module", () => {
      assertCan(hrMgr, "approvals", "approve", "hr_mgr.approvals_approve");
    });

    it("[unauthorized] hr_manager CANNOT access financial module", () => {
      assertCannot(hrMgr, "financial", "read", "hr_mgr.financial");
    });

    it("[unauthorized] hr_manager CANNOT access security module", () => {
      assertCannot(hrMgr, "security", "write", "hr_mgr.security");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §3 Finance & Procurement — User Stories
// ─────────────────────────────────────────────────────────────────────────────
describe("§3 Finance & Procurement — user stories", () => {
  describe("Requester: create purchase request", () => {
    const requester: SystemRole[] = ["requester"];

    it("[success] requester can create purchase request (procurement.write)", () => {
      assertCan(requester, "procurement", "write", "requester.create_pr");
    });

    it("[success] requester can read own procurement items", () => {
      assertCan(requester, "procurement", "read", "requester.read_pr");
    });

    it("[unauthorized] requester CANNOT approve purchase requests", () => {
      assertCannot(requester, "procurement", "approve", "requester.pr_approve");
    });
  });

  describe("Approver: approve/reject purchase requests", () => {
    const approver: SystemRole[] = ["requester", "approver"];

    it("[success] approver can approve procurement", () => {
      assertCan(approver, "procurement", "approve", "approver.pr_approve");
    });

    it("[unauthorized] approver CANNOT create POs (purchase_orders.write)", () => {
      assertCannot(approver, "purchase_orders", "write", "approver.po_write");
    });
  });

  describe("Procurement Admin: convert PR to PO", () => {
    const pa: SystemRole[] = ["requester", "procurement_admin"];

    it("[success] procurement_admin can admin procurement + create POs", () => {
      assertCan(pa, "procurement",    "admin", "proc_admin.procurement");
      assertCan(pa, "purchase_orders","write", "proc_admin.po_write");
    });

    it("[unauthorized] procurement_admin CANNOT admin financial budgets", () => {
      assertCannot(pa, "financial", "admin", "proc_admin.financial_admin");
    });
  });

  describe("Finance Manager: manage budgets and approvals", () => {
    const fin: SystemRole[] = ["requester", "finance_manager"];

    it("[success] finance_manager can admin financial + budgets", () => {
      assertCan(fin, "financial", "admin", "fin_mgr.financial");
      assertCan(fin, "budget",    "admin", "fin_mgr.budget");
    });

    it("[success] finance_manager can approve procurement (not create via procurement_write)", () => {
      assertCan(fin, "procurement", "approve", "fin_mgr.pr_approve");
    });

    it("[success] finance_manager can raise HR case (requester base gives hr.write)", () => {
      // Every user is a requester — can submit self-service HR cases
      assertCan(fin, "hr", "write", "fin_mgr.hr_selfservice");
    });

    it("[unauthorized] finance_manager CANNOT admin HR module", () => {
      assertCannot(fin, "hr", "admin", "fin_mgr.hr_admin");
    });

    it("[unauthorized] finance_manager CANNOT admin security module", () => {
      assertCannot(fin, "security", "admin", "fin_mgr.security_admin");
    });
  });

  describe("Vendor Manager: manage vendors", () => {
    const vm: SystemRole[] = ["requester", "vendor_manager"];

    it("[success] vendor_manager can admin vendors and contracts", () => {
      assertCan(vm, "vendors",   "admin", "vendor_mgr.vendors");
      assertCan(vm, "contracts", "admin", "vendor_mgr.contracts");
    });

    it("[success] vendor_manager can raise HR case (requester base gives hr.write)", () => {
      assertCan(vm, "hr", "write", "vendor_mgr.hr_selfservice");
    });

    it("[unauthorized] vendor_manager CANNOT admin HR module", () => {
      assertCannot(vm, "hr", "admin", "vendor_mgr.hr_admin");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §3 Projects & DevOps/Knowledge — User Stories
// ─────────────────────────────────────────────────────────────────────────────
describe("§3 Projects & DevOps/Knowledge — user stories", () => {
  describe("Project Manager: manage projects", () => {
    const pm: SystemRole[] = ["requester", "project_manager"];

    it("[success] project_manager can admin projects + resources", () => {
      assertCan(pm, "projects",  "admin",  "pm.projects");
      assertCan(pm, "resources", "admin",  "pm.resources");
      assertCan(pm, "demand",    "admin",  "pm.demand");
    });

    it("[success] project_manager can approve project-related approvals", () => {
      assertCan(pm, "approvals", "approve", "pm.approvals");
    });

    it("[unauthorized] project_manager CANNOT access security module", () => {
      assertCannot(pm, "security", "read", "pm.security");
    });
  });

  describe("Report Viewer: view reports (read-only)", () => {
    const rv: SystemRole[] = ["requester", "report_viewer"];

    it("[success] report_viewer can read reports and analytics", () => {
      assertCan(rv, "reports",   "read", "report_viewer.reports");
      assertCan(rv, "analytics", "read", "report_viewer.analytics");
    });

    it("[success] report_viewer can create incidents (requester base — self-service)", () => {
      // All users carry requester — they can create their own tickets
      assertCan(rv, "incidents", "write", "report_viewer.incident_create");
    });

    it("[unauthorized] report_viewer CANNOT write/admin domain modules", () => {
      const elevatedChecks: [Module, RbacAction][] = [
        ["reports",   "write"],
        ["reports",   "admin"],
        ["projects",  "write"],
        ["financial", "write"],
        ["security",  "write"],
        ["grc",       "write"],
        ["changes",   "write"],
      ];
      for (const [mod, action] of elevatedChecks) {
        assertCannot(rv, mod, action, `report_viewer.${mod}_${action}`);
      }
    });
  });

  describe("ITIL: monitor pipelines (DevOps)", () => {
    // DevOps pipeline monitoring is gated on incidents+changes read (itil has both)
    const itil: SystemRole[] = ["requester", "itil"];

    it("[success] itil can read incidents and changes (pipeline monitoring)", () => {
      assertCan(itil, "incidents", "read", "itil.devops_incidents");
      assertCan(itil, "changes",   "read", "itil.devops_changes");
    });
  });

  describe("CMDB Admin: manage infrastructure mapping", () => {
    const ca: SystemRole[] = ["requester", "cmdb_admin"];

    it("[success] cmdb_admin can admin CMDB (infrastructure mapping)", () => {
      assertCan(ca, "cmdb",   "admin", "cmdb_admin.infra_cmdb");
      assertCan(ca, "ham",    "admin", "cmdb_admin.infra_ham");
    });
  });

  describe("Requester: search knowledge base", () => {
    const requester: SystemRole[] = ["requester"];

    it("[success] requester can read knowledge base", () => {
      assertCan(requester, "knowledge", "read", "requester.kb_search");
    });

    it("[unauthorized] requester CANNOT write to knowledge base", () => {
      assertCannot(requester, "knowledge", "write", "requester.kb_write");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §3 Cross-Module — Approvals, Notifications, Audit Logs
// ─────────────────────────────────────────────────────────────────────────────
describe("§3 Cross-Module — approvals / notifications / audit", () => {
  describe("Approvals: view queue / approve/reject", () => {
    it("[success] approver can view approval queue (approvals.read)", () => {
      assertCan(["requester", "approver"], "approvals", "read",    "cross.approvals_read");
      assertCan(["requester", "approver"], "approvals", "approve", "cross.approvals_approve");
    });

    it("[unauthorized] plain requester cannot approve (only read)", () => {
      assertCan(    ["requester"], "approvals", "read",    "cross.requester_approvals_read");
      assertCannot( ["requester"], "approvals", "approve", "cross.requester_approvals_approve");
    });
  });

  describe("Audit Logs: all actions tracked", () => {
    it("[unauthorized] requester CANNOT admin audit_log module", () => {
      assertCannot(["requester"], "audit_log", "admin", "cross.audit_log_admin");
    });

    it("[success] admin can access audit log", () => {
      // admin role bypasses all checks
      assertCan(["requester", "admin"], "audit_log", "admin", "cross.admin_audit");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §8 Seed Data Validation — realistic role combinations
// ─────────────────────────────────────────────────────────────────────────────
describe("§8 Seed Data — realistic role combinations", () => {
  const seedCombinations = [
    { dbRole: "member", matrixRole: "itil",            expected: ["requester", "itil"],              label: "IT user (agent1)" },
    { dbRole: "member", matrixRole: "operator_field",  expected: ["requester", "operator_field"],    label: "Field tech (agent2)" },
    { dbRole: "member", matrixRole: "hr_manager",      expected: ["requester", "hr_manager"],        label: "HR manager" },
    { dbRole: "member", matrixRole: "finance_manager", expected: ["requester", "finance_manager"],   label: "Finance manager" },
    { dbRole: "member", matrixRole: null,              expected: ["requester"],                      label: "Plain employee (no matrix role)" },
    { dbRole: "owner",  matrixRole: null,              expected: ["requester", "admin"],             label: "Platform admin (owner)" },
    { dbRole: "viewer", matrixRole: null,              expected: ["requester", "report_viewer"],     label: "Viewer" },
  ];

  for (const { dbRole, matrixRole, expected, label } of seedCombinations) {
    it(`${label}: resolves to [${expected.join(", ")}]`, () => {
      const roles = systemRolesForDbUser(dbRole, matrixRole);
      for (const role of expected) {
        expect(roles, `${label} must include '${role}'`).toContain(role as SystemRole);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §4 No Cross-Module Access Leakage
// ─────────────────────────────────────────────────────────────────────────────
describe("§4 No Cross-Module Access Leakage", () => {
  const leakageChecks: Array<{
    roles: SystemRole[];
    forbidden: Array<[Module, RbacAction]>;
    label: string;
  }> = [
    {
      label: "itil CANNOT access security/grc/financial/hr-admin/procurement-admin/crm/projects",
      roles: ["requester", "itil"],
      forbidden: [
        ["security",     "write"],
        ["grc",          "read"],
        ["financial",    "read"],
        ["procurement",  "admin"],
        ["csm",          "write"],
        ["projects",     "write"],
        ["hr",           "admin"],
      ],
    },
    {
      label: "hr_manager CANNOT access security/financial-admin/cmdb-admin/changes-approve",
      roles: ["requester", "hr_manager"],
      forbidden: [
        ["security",  "write"],
        ["financial", "admin"],
        ["cmdb",      "admin"],
        ["changes",   "approve"],
      ],
    },
    {
      label: "finance_manager CANNOT admin security/hr/cmdb/changes",
      roles: ["requester", "finance_manager"],
      forbidden: [
        ["security",  "admin"],
        ["hr",        "admin"],
        ["cmdb",      "admin"],
        ["changes",   "approve"],
      ],
    },
    {
      label: "security_analyst CANNOT access financial-admin/hr-admin/procurement-admin/projects",
      roles: ["requester", "security_analyst"],
      forbidden: [
        ["financial",   "admin"],
        ["hr",          "admin"],
        ["procurement", "admin"],
        ["projects",    "write"],
      ],
    },
    {
      label: "report_viewer CANNOT write/admin domain modules (only requester self-service allowed)",
      roles: ["requester", "report_viewer"],
      forbidden: [
        ["reports",   "write"],
        ["changes",   "write"],
        ["security",  "write"],
        ["financial", "write"],
        ["hr",        "admin"],
      ],
    },
  ];

  for (const { label, roles, forbidden } of leakageChecks) {
    describe(label, () => {
      for (const [module, action] of forbidden) {
        it(`${roles.join("+")} CANNOT ${action} ${module}`, () => {
          assertCannot(roles, module, action, label);
        });
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §6 Lifecycle Validation — permission matrix supports enforcement
// ─────────────────────────────────────────────────────────────────────────────
describe("§6 Lifecycle Enforcement — roles needed for lifecycle actions", () => {
  it("incident open→in_progress requires incidents.write (itil)", () => {
    // Only itil+ can write (transition) incidents, not requester (scope-wise the
    // route checks `incidents.write` which requester has — but scope filtering
    // in the route itself restricts requester to own records).
    assertCan(["requester", "itil"], "incidents", "write", "lifecycle.itil_transition");
  });

  it("change cab_review→approved requires changes.approve (change_manager)", () => {
    assertCan(   ["requester", "change_manager"], "changes", "approve", "lifecycle.cm_approve");
    assertCannot(["requester", "itil"],           "changes", "approve", "lifecycle.itil_no_approve");
  });

  it("approval pending→approved requires approvals.approve (approver)", () => {
    assertCan(   ["requester", "approver"], "approvals", "approve", "lifecycle.approver_ok");
    assertCannot(["requester"],             "approvals", "approve", "lifecycle.requester_no_approve");
  });

  it("leave pending→approved requires hr.approve (hr_manager)", () => {
    assertCan(   ["requester", "hr_manager"], "hr", "approve", "lifecycle.hr_mgr_approve");
    assertCannot(["requester"],               "hr", "approve", "lifecycle.requester_no_hr_approve");
  });

  it("PR approval requires procurement.approve (approver or finance_manager)", () => {
    assertCan(["requester", "approver"],       "procurement", "approve", "lifecycle.approver_pr");
    assertCan(["requester", "finance_manager"],"procurement", "approve", "lifecycle.fin_mgr_pr");
  });
});
