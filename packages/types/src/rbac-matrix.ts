/**
 * Shared NexusOps RBAC matrix — used by web UI and API (tRPC permissionProcedure).
 *
 * v3.1 changes:
 *  - Added `operator_field` role (replaces over-broad use of `field_service` as a catch-all)
 *  - Added `manager_ops` role (ops manager with approval + reporting, no write access to modules)
 *  - Added `secretarial` module (Corporate Secretarial & CS)
 *  - `itil` role restricted to IT-only modules (removed GRC, finance, procurement, CRM, projects)
 *  - `requester` permissions tightened (read-only on approvals, no GRC/finance)
 *  - All roles explicitly declared — no hidden implicit access
 */

export type SystemRole =
  | "admin"
  | "security_admin"
  | "itil_admin"
  | "itil"
  | "itil_manager"
  | "change_manager"
  | "problem_manager"
  | "field_service"
  | "operator_field"        // NEW: Field technician (work orders + parts)
  | "manager_ops"           // NEW: Ops manager (approve + report, no module writes)
  | "security_analyst"
  | "grc_analyst"
  | "hr_manager"
  | "hr_analyst"
  | "procurement_admin"
  | "procurement_analyst"
  | "finance_manager"
  | "project_manager"
  | "approver"
  | "requester"
  | "report_viewer"
  | "cmdb_admin"
  | "vendor_manager"
  | "catalog_admin";

export type Module =
  | "incidents"
  | "requests"
  | "changes"
  | "problems"
  | "work_orders"
  | "escalations"
  | "knowledge"
  | "catalog"
  | "approvals"
  | "events"
  | "security"
  | "vulnerabilities"
  | "threat_intel"
  | "grc"
  | "risk"
  | "audit"
  | "policy"
  | "secretarial"           // NEW: Corporate Secretarial & Governance
  | "hr"
  | "onboarding"
  | "procurement"
  | "inventory"
  | "purchase_orders"
  | "financial"
  | "budget"
  | "chargebacks"
  | "projects"
  | "resources"
  | "demand"
  | "csm"
  | "accounts"
  | "sam"
  | "ham"
  | "cmdb"
  | "vendors"
  | "contracts"
  | "reports"
  | "analytics"
  | "flows"
  | "virtual_agent"
  | "surveys"
  | "admin"
  | "users"
  | "roles"
  | "system_properties"
  | "audit_log"
  | "facilities";

export type RbacAction = "read" | "write" | "delete" | "admin" | "approve" | "assign" | "close";

type PermissionMatrix = Partial<Record<Module, RbacAction[]>>;

export const ROLE_PERMISSIONS: Record<SystemRole, PermissionMatrix> = {
  // ── Platform Admin ────────────────────────────────────────────────────────
  // Empty = hasPermission() short-circuits to true for any module/action
  admin: {},

  // ── ITSM ─────────────────────────────────────────────────────────────────
  itil_admin: {
    incidents:    ["read", "write", "delete", "admin", "assign", "close"],
    requests:     ["read", "write", "delete", "admin", "assign", "close"],
    changes:      ["read", "write", "delete", "admin", "assign", "close", "approve"],
    problems:     ["read", "write", "delete", "admin", "assign", "close"],
    work_orders:  ["read", "write", "delete", "admin", "assign", "close"],
    escalations:  ["read", "write", "admin"],
    knowledge:    ["read", "write", "delete", "admin"],
    catalog:      ["read", "write", "delete", "admin"],
    approvals:    ["read", "write", "admin", "approve"],
    events:       ["read", "write", "admin"],
    cmdb:         ["read", "write", "admin"],
    sam:          ["read", "write"],
    ham:          ["read", "write"],
    flows:        ["read", "write", "admin"],
    surveys:      ["read", "write", "admin"],
    reports:      ["read", "write", "admin"],
    analytics:    ["read", "write"],
    virtual_agent:["read", "admin"],
    facilities:   ["read"],
    users:        ["read", "write", "delete", "admin"],
  },

  /**
   * itil — Standard service desk / ITSM analyst.
   * Restricted to IT modules ONLY.  Cross-domain modules (GRC, finance,
   * procurement, security, CRM, projects) require an explicit matrix_role.
   */
  itil: {
    incidents:   ["read", "write", "assign", "close"],
    requests:    ["read", "write", "assign", "close"],
    changes:     ["read", "write"],
    problems:    ["read", "write"],
    work_orders: ["read"],                    // can view, cannot create/close
    escalations: ["read"],
    knowledge:   ["read", "write"],
    catalog:     ["read"],
    approvals:   ["read", "approve"],
    events:      ["read"],
    cmdb:        ["read"],
    sam:         ["read"],
    ham:         ["read"],
    facilities:  ["read"],
    surveys:     ["read", "write"],
    reports:     ["read"],
  },

  itil_manager: {
    incidents:   ["read", "write", "assign", "close", "admin"],
    requests:    ["read", "write", "assign", "close", "admin"],
    changes:     ["read", "write", "assign", "close", "approve"],
    problems:    ["read", "write", "assign", "close"],
    work_orders: ["read", "write", "assign", "close"],
    escalations: ["read", "write", "admin"],
    knowledge:   ["read", "write", "admin"],
    catalog:     ["read", "write", "admin"],
    approvals:   ["read", "write", "approve", "admin"],
    events:      ["read", "write"],
    cmdb:        ["read", "write"],
    sam:         ["read", "write"],
    ham:         ["read", "write"],
    reports:     ["read", "write", "admin"],
    analytics:   ["read", "write"],
    facilities:  ["read"],
    users:       ["read"],
  },

  change_manager: {
    changes:   ["read", "write", "admin", "approve", "assign", "close"],
    problems:  ["read", "write"],
    incidents: ["read", "write"],
    approvals: ["read", "write", "approve", "admin"],
    cmdb:      ["read", "write"],
    reports:   ["read"],
    knowledge: ["read", "write"],
  },

  problem_manager: {
    problems:  ["read", "write", "admin", "assign", "close"],
    incidents: ["read", "write"],
    changes:   ["read"],
    knowledge: ["read", "write", "admin"],
    cmdb:      ["read", "write"],
    reports:   ["read"],
  },

  /**
   * field_service — legacy alias kept for backward compatibility.
   * Prefer `operator_field` for new assignments.
   */
  field_service: {
    work_orders: ["read", "write", "close"],
    incidents:   ["read", "write"],
    cmdb:        ["read", "write"],
    ham:         ["read", "write"],
    inventory:   ["read", "write"],
    knowledge:   ["read"],
  },

  /**
   * operator_field — Field service technician (v3.1 preferred role).
   * Work order execution, parts usage and dispatch.  No ITSM admin access.
   */
  operator_field: {
    work_orders: ["read", "write", "assign", "close"],
    incidents:   ["read", "write"],
    inventory:   ["read", "write"],
    ham:         ["read", "write"],
    cmdb:        ["read"],
    knowledge:   ["read"],
    facilities:  ["read"],
  },

  /**
   * manager_ops — Operational manager.
   * Can approve requests and view reports across ITSM modules.
   * No write access to any specific domain module.
   */
  manager_ops: {
    incidents:   ["read", "assign"],
    requests:    ["read", "assign"],
    changes:     ["read"],
    problems:    ["read"],
    work_orders: ["read"],
    approvals:   ["read", "approve"],
    reports:     ["read"],
    analytics:   ["read"],
    knowledge:   ["read"],
    cmdb:        ["read"],
  },

  // ── Security ──────────────────────────────────────────────────────────────
  security_admin: {
    security:       ["read", "write", "delete", "admin", "assign", "close"],
    vulnerabilities:["read", "write", "delete", "admin", "assign", "close"],
    threat_intel:   ["read", "write", "delete", "admin"],
    grc:            ["read", "write", "admin"],
    risk:           ["read", "write", "admin"],
    policy:         ["read", "write", "admin"],
    audit:          ["read", "write", "admin"],
    incidents:      ["read", "write", "assign", "close"],
    cmdb:           ["read", "write"],
    events:         ["read", "write", "admin"],
    reports:        ["read", "write"],
    analytics:      ["read"],
    flows:          ["read", "write"],
  },

  /**
   * security_analyst — Security incident response, vuln triage, threat intel.
   * Explicitly NO financial / procurement access.
   */
  security_analyst: {
    security:        ["read", "write", "assign", "close"],
    vulnerabilities: ["read", "write", "assign"],
    threat_intel:    ["read", "write"],
    grc:             ["read"],
    risk:            ["read"],
    incidents:       ["read", "write"],
    cmdb:            ["read"],
    events:          ["read", "write"],
    reports:         ["read"],
  },

  // ── GRC ───────────────────────────────────────────────────────────────────
  grc_analyst: {
    grc:             ["read", "write", "admin"],
    risk:            ["read", "write", "admin"],
    audit:           ["read", "write", "admin"],
    policy:          ["read", "write", "admin"],
    secretarial:     ["read"],
    security:        ["read"],
    vulnerabilities: ["read"],
    reports:         ["read", "write"],
    analytics:       ["read"],
    vendors:         ["read", "write"],
    contracts:       ["read", "write"],
  },

  // ── HR ────────────────────────────────────────────────────────────────────
  hr_manager: {
    hr:         ["read", "write", "delete", "admin", "assign", "close", "approve"],
    onboarding: ["read", "write", "admin"],
    approvals:  ["read", "write", "approve", "admin"],
    reports:    ["read", "write"],
    analytics:  ["read", "write"],
    surveys:    ["read", "write", "admin"],
    catalog:    ["read"],
    knowledge:  ["read"],
  },

  hr_analyst: {
    hr:         ["read", "write", "assign", "close", "approve"],
    onboarding: ["read", "write"],
    approvals:  ["read", "approve"],
    surveys:    ["read"],
    catalog:    ["read"],
    knowledge:  ["read"],
    reports:    ["read"],
  },

  // ── Procurement ───────────────────────────────────────────────────────────
  procurement_admin: {
    procurement:    ["read", "write", "delete", "admin", "approve", "assign", "close"],
    purchase_orders:["read", "write", "delete", "admin", "approve"],
    inventory:      ["read", "write", "delete", "admin"],
    vendors:        ["read", "write", "admin"],
    contracts:      ["read", "write", "admin"],
    financial:      ["read", "write"],
    budget:         ["read", "write"],
    approvals:      ["read", "write", "approve", "admin"],
    ham:            ["read", "write"],
    reports:        ["read", "write"],
  },

  procurement_analyst: {
    procurement:     ["read", "write", "assign"],
    purchase_orders: ["read", "write"],
    inventory:       ["read", "write"],
    vendors:         ["read"],
    contracts:       ["read"],
    approvals:       ["read", "approve"],
    ham:             ["read"],
    reports:         ["read"],
  },

  // ── Finance ───────────────────────────────────────────────────────────────
  /**
   * finance_manager — Full financial authority.
   * Can read and approve procurement but cannot create POs directly.
   */
  finance_manager: {
    financial:       ["read", "write", "delete", "admin"],
    budget:          ["read", "write", "admin"],
    chargebacks:     ["read", "write", "admin"],
    procurement:     ["read", "approve"],
    purchase_orders: ["read", "approve"],
    contracts:       ["read", "write"],
    vendors:         ["read", "write"],
    reports:         ["read", "write", "admin"],
    analytics:       ["read", "write"],
  },

  // ── PMO ───────────────────────────────────────────────────────────────────
  project_manager: {
    projects:  ["read", "write", "delete", "admin", "assign", "close"],
    resources: ["read", "write", "admin"],
    demand:    ["read", "write", "admin"],
    approvals: ["read", "write", "approve", "admin"],
    reports:   ["read", "write"],
    analytics: ["read"],
    financial: ["read"],
    budget:    ["read"],
  },

  // ── Platform / Cross-domain ───────────────────────────────────────────────
  approver: {
    approvals:       ["read", "write", "approve"],
    changes:         ["read", "approve"],
    procurement:     ["read", "approve"],
    purchase_orders: ["read", "approve"],
    catalog:         ["read"],
    incidents:       ["read"],
    requests:        ["read"],
  },

  /**
   * requester — Default role for all "member" DB users who have no matrix_role.
   * Self-service only: submit incidents/requests, browse catalog/knowledge,
   * raise HR cases, submit purchase requests, view own approvals.
   */
  requester: {
    catalog:     ["read", "write"],
    knowledge:   ["read"],
    incidents:   ["read", "write"],
    requests:    ["read", "write"],
    approvals:   ["read"],
    facilities:  ["read", "write"],
    hr:          ["read", "write"],
    procurement: ["read", "write"],
    surveys:     ["read", "write"],
  },

  report_viewer: {
    reports:   ["read"],
    analytics: ["read"],
    incidents: ["read"],
    requests:  ["read"],
    changes:   ["read"],
    problems:  ["read"],
    users:     ["read"],
  },

  // ── Asset ─────────────────────────────────────────────────────────────────
  cmdb_admin: {
    cmdb:   ["read", "write", "delete", "admin"],
    ham:    ["read", "write", "admin"],
    sam:    ["read", "write", "admin"],
    events: ["read", "write"],
    reports:["read"],
  },

  // ── Vendors / Contracts ───────────────────────────────────────────────────
  vendor_manager: {
    vendors:         ["read", "write", "delete", "admin"],
    contracts:       ["read", "write", "delete", "admin"],
    procurement:     ["read", "write"],
    purchase_orders: ["read", "write"],
    financial:       ["read"],
    grc:             ["read"],
    reports:         ["read", "write"],
  },

  // ── Catalog ───────────────────────────────────────────────────────────────
  catalog_admin: {
    catalog:   ["read", "write", "delete", "admin"],
    knowledge: ["read", "write", "admin"],
    requests:  ["read", "write"],
    approvals: ["read", "write", "approve"],
    flows:     ["read", "write"],
  },
};

export function hasPermission(roles: SystemRole[], module: Module, action: RbacAction): boolean {
  if (roles.includes("admin")) return true;
  for (const role of roles) {
    const perms = ROLE_PERMISSIONS[role];
    if (perms?.[module]?.includes(action)) return true;
  }
  return false;
}

export function canAccessModule(roles: SystemRole[], module: Module): boolean {
  return hasPermission(roles, module, "read");
}

export function getVisibleModules(roles: SystemRole[]): Set<Module> {
  if (roles.includes("admin")) {
    return new Set<Module>([
      "incidents", "requests", "changes", "problems", "work_orders", "escalations",
      "knowledge", "catalog", "approvals", "events",
      "security", "vulnerabilities", "threat_intel",
      "grc", "risk", "audit", "policy", "secretarial",
      "hr", "onboarding",
      "procurement", "inventory", "purchase_orders",
      "financial", "budget", "chargebacks",
      "projects", "resources", "demand",
      "csm", "accounts",
      "sam", "ham", "cmdb",
      "vendors", "contracts",
      "reports", "analytics",
      "flows", "virtual_agent",
      "admin", "users", "roles", "system_properties", "audit_log",
      "facilities",
    ]);
  }
  const visible = new Set<Module>();
  for (const role of roles) {
    const perms = ROLE_PERMISSIONS[role];
    for (const [mod, actions] of Object.entries(perms)) {
      if (actions && actions.includes("read")) {
        visible.add(mod as Module);
      }
    }
  }
  return visible;
}
