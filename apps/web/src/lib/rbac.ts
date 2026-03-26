/**
 * NexusOps Role-Based Access Control (UI)
 *
 * Matrix and helpers live in @nexusops/types (rbac-matrix) for parity with API checks.
 */
import type { SystemRole, Module, RbacAction } from "@nexusops/types";

export type { SystemRole, Module, RbacAction };
export {
  ROLE_PERMISSIONS,
  hasPermission,
  canAccessModule,
  getVisibleModules,
} from "@nexusops/types";

/** User definition */
export interface SystemUser {
  id: string;
  name: string;
  email: string;
  username: string;
  roles: SystemRole[];
  department: string;
  manager?: string;
  active: boolean;
  lastLogin?: string;
  mfaEnabled: boolean;
  orgId: string;
}

/** Mock session user — in production this comes from the auth token / session */
export const MOCK_USERS: SystemUser[] = [
  {
    id: "usr-001",
    name: "Admin User",
    email: "admin@nexusops.corp",
    username: "admin",
    roles: ["requester", "admin"],
    department: "IT Operations",
    active: true,
    lastLogin: "2026-03-24 18:51",
    mfaEnabled: true,
    orgId: "org-001",
  },
  {
    id: "usr-002",
    name: "Jordan Chen",
    email: "j.chen@nexusops.corp",
    username: "j.chen",
    roles: ["requester", "itil", "field_service"],
    department: "Infrastructure",
    manager: "usr-008",
    active: true,
    lastLogin: "2026-03-24 08:00",
    mfaEnabled: true,
    orgId: "org-001",
  },
  {
    id: "usr-003",
    name: "Alex Rivera",
    email: "a.rivera@nexusops.corp",
    username: "a.rivera",
    roles: ["requester", "security_analyst", "itil"],
    department: "Security",
    manager: "usr-009",
    active: true,
    lastLogin: "2026-03-24 07:30",
    mfaEnabled: true,
    orgId: "org-001",
  },
  {
    id: "usr-004",
    name: "Sam Okafor",
    email: "s.okafor@nexusops.corp",
    username: "s.okafor",
    roles: ["requester", "itil", "cmdb_admin"],
    department: "ERP",
    manager: "usr-008",
    active: true,
    lastLogin: "2026-03-24 09:15",
    mfaEnabled: false,
    orgId: "org-001",
  },
  {
    id: "usr-005",
    name: "Taylor Patel",
    email: "t.patel@nexusops.corp",
    username: "t.patel",
    roles: ["requester", "itil", "project_manager"],
    department: "Platform Engineering",
    manager: "usr-008",
    active: true,
    lastLogin: "2026-03-23 17:00",
    mfaEnabled: true,
    orgId: "org-001",
  },
  {
    id: "usr-006",
    name: "Morgan Lee",
    email: "m.lee@nexusops.corp",
    username: "m.lee",
    roles: ["requester", "itil_manager", "change_manager"],
    department: "IT Service Desk",
    manager: "usr-010",
    active: true,
    lastLogin: "2026-03-24 07:00",
    mfaEnabled: true,
    orgId: "org-001",
  },
  {
    id: "usr-007",
    name: "Riley Brown",
    email: "r.brown@nexusops.corp",
    username: "r.brown",
    roles: ["requester", "itil", "cmdb_admin"],
    department: "Database Administration",
    manager: "usr-008",
    active: true,
    lastLogin: "2026-03-24 06:00",
    mfaEnabled: true,
    orgId: "org-001",
  },
  {
    id: "usr-008",
    name: "Chris Wallace",
    email: "c.wallace@nexusops.corp",
    username: "c.wallace",
    roles: ["requester", "itil_admin", "itil_manager"],
    department: "IT Operations",
    active: true,
    lastLogin: "2026-03-24 08:30",
    mfaEnabled: true,
    orgId: "org-001",
  },
  {
    id: "usr-009",
    name: "Dana Kim",
    email: "d.kim@nexusops.corp",
    username: "d.kim",
    roles: ["requester", "security_admin", "grc_analyst"],
    department: "Security",
    active: true,
    lastLogin: "2026-03-24 07:45",
    mfaEnabled: true,
    orgId: "org-001",
  },
  {
    id: "usr-010",
    name: "Pat Murphy",
    email: "p.murphy@nexusops.corp",
    username: "p.murphy",
    roles: ["requester", "itil_admin", "approver"],
    department: "IT Service Management",
    active: true,
    lastLogin: "2026-03-24 09:00",
    mfaEnabled: true,
    orgId: "org-001",
  },
  {
    id: "usr-011",
    name: "Finance Controller",
    email: "finance@nexusops.corp",
    username: "finance",
    roles: ["requester", "finance_manager", "approver"],
    department: "Finance",
    active: true,
    lastLogin: "2026-03-23 14:00",
    mfaEnabled: true,
    orgId: "org-001",
  },
  {
    id: "usr-012",
    name: "Priya HR",
    email: "p.hr@nexusops.corp",
    username: "p.hr",
    roles: ["requester", "hr_manager"],
    department: "Human Resources",
    active: true,
    lastLogin: "2026-03-24 09:30",
    mfaEnabled: false,
    orgId: "org-001",
  },
  {
    id: "usr-013",
    name: "Service Account — Tenable",
    email: "svc-tenable@nexusops.corp",
    username: "svc-tenable",
    roles: ["requester", "security_analyst"],
    department: "Automation",
    active: true,
    lastLogin: "2026-03-24 02:00",
    mfaEnabled: false,
    orgId: "org-001",
  },
  {
    id: "usr-014",
    name: "End User Sample",
    email: "user@nexusops.corp",
    username: "user",
    roles: ["requester"],
    department: "Marketing",
    manager: "usr-010",
    active: true,
    lastLogin: "2026-03-20 10:00",
    mfaEnabled: false,
    orgId: "org-001",
  },
];

export const SYSTEM_ROLES_CATALOG: Array<{
  role: SystemRole;
  displayName: string;
  description: string;
  category: string;
  isElevated: boolean;
}> = [
  { role: "admin",             displayName: "System Administrator",     description: "Full unrestricted access to all modules and system configuration", category: "Platform", isElevated: true },
  { role: "itil_admin",        displayName: "ITSM Administrator",       description: "Manage ITSM configuration, SLAs, categories, business rules", category: "ITSM", isElevated: true },
  { role: "itil_manager",      displayName: "ITSM Manager",             description: "Team lead access — assign, approve, close any ITSM record", category: "ITSM", isElevated: false },
  { role: "itil",              displayName: "ITSM Analyst",             description: "Standard service desk analyst — handle incidents, requests, changes", category: "ITSM", isElevated: false },
  { role: "change_manager",    displayName: "Change Manager / CAB Chair",description: "Full change management authority including CAB approval", category: "ITSM", isElevated: false },
  { role: "problem_manager",   displayName: "Problem Manager",          description: "Problem management and known error database authority", category: "ITSM", isElevated: false },
  { role: "field_service",     displayName: "Field Service Technician", description: "Work order execution, parts usage, field dispatch", category: "Field Service", isElevated: false },
  { role: "security_admin",    displayName: "Security Administrator",   description: "Full SecOps access — vulnerability, incidents, threat intel, GRC", category: "Security", isElevated: true },
  { role: "security_analyst",  displayName: "Security Analyst",         description: "Security incident response, vulnerability triage, threat intel", category: "Security", isElevated: false },
  { role: "grc_analyst",       displayName: "GRC Analyst",              description: "Risk register, audit management, policy compliance", category: "GRC", isElevated: false },
  { role: "hr_manager",        displayName: "HR Manager",               description: "Full HR Service Delivery access", category: "HR", isElevated: false },
  { role: "hr_analyst",        displayName: "HR Analyst",               description: "Handle HR cases, onboarding/offboarding tasks", category: "HR", isElevated: false },
  { role: "procurement_admin", displayName: "Procurement Administrator",description: "Full procurement authority — POs, approval, inventory admin", category: "Procurement", isElevated: false },
  { role: "procurement_analyst",displayName: "Procurement Analyst",     description: "Create requisitions, receive goods, manage inventory", category: "Procurement", isElevated: false },
  { role: "finance_manager",   displayName: "Finance Manager",          description: "IT budget, chargebacks, financial reporting", category: "Finance", isElevated: false },
  { role: "project_manager",   displayName: "Project Manager",          description: "Full PPM access — projects, resources, demand", category: "PMO", isElevated: false },
  { role: "approver",          displayName: "Approver",                 description: "Approval-only role for changes, catalog, procurement", category: "Platform", isElevated: false },
  { role: "requester",         displayName: "End User / Requester",     description: "Self-service catalog, submit incidents, view own records", category: "Platform", isElevated: false },
  { role: "report_viewer",     displayName: "Report Viewer",            description: "Read-only analytics and reporting access", category: "Analytics", isElevated: false },
  { role: "cmdb_admin",        displayName: "CMDB Administrator",       description: "Full CMDB write access — CIs, discovery config, HAM, SAM", category: "Asset", isElevated: false },
  { role: "vendor_manager",    displayName: "Vendor Manager",           description: "Vendor register, contracts, SLA, performance management", category: "Procurement", isElevated: false },
  { role: "catalog_admin",     displayName: "Catalog Administrator",    description: "Service catalog item management and fulfillment rules", category: "ITSM", isElevated: false },
];
