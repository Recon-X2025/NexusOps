/**
 * CoheronConnect Role-Based Access Control (UI)
 *
 * Matrix and helpers live in @coheronconnect/types (rbac-matrix) for parity with API checks.
 */
import type { SystemRole, Module, RbacAction } from "@coheronconnect/types";

export type { SystemRole, Module, RbacAction };
export {
  ROLE_PERMISSIONS,
  hasPermission,
  canAccessModule,
  getVisibleModules,
} from "@coheronconnect/types";

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
  orgName?: string;
}

/** Mock session user — empty in production to ensure total data fidelity */
export const MOCK_USERS: SystemUser[] = [];

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
  { role: "operator_field",    displayName: "Field Operator",             description: "Field technician — work orders and parts", category: "Field Service", isElevated: false },
  { role: "manager_ops",       displayName: "Operations Manager",         description: "Approvals and reporting without module writes", category: "Platform", isElevated: false },
  { role: "security_admin",    displayName: "Security Administrator",   description: "Full SecOps access — vulnerability, incidents, threat intel, GRC", category: "Security", isElevated: true },
  { role: "security_analyst",  displayName: "Security Analyst",         description: "Security incident response, vulnerability triage, threat intel", category: "Security", isElevated: false },
  { role: "grc_analyst",       displayName: "GRC Analyst",              description: "Risk register, audit management, policy compliance", category: "GRC", isElevated: false },
  { role: "legal_counsel",     displayName: "Legal Counsel",            description: "Legal matters, requests, investigations (not GRC/secretarial)", category: "Legal", isElevated: false },
  { role: "company_secretary", displayName: "Company Secretary",        description: "Corporate secretarial, MCA/board/registers (not legal matters router)", category: "Legal", isElevated: false },
  { role: "hr_manager",        displayName: "HR Manager",               description: "Full HR Service Delivery access", category: "HR", isElevated: false },
  { role: "hr_analyst",        displayName: "HR Analyst",               description: "Handle HR cases, onboarding/offboarding tasks", category: "HR", isElevated: false },
  { role: "procurement_admin", displayName: "Procurement Administrator",description: "Full procurement authority — POs, approval, inventory admin", category: "Procurement", isElevated: false },
  { role: "procurement_analyst",displayName: "Procurement Analyst",     description: "Create requisitions, receive goods, manage inventory", category: "Procurement", isElevated: false },
  { role: "finance_manager",   displayName: "Finance Manager",          description: "IT budget, chargebacks, financial reporting", category: "Finance", isElevated: false },
  { role: "project_manager",   displayName: "Project Manager",          description: "Strategy Center access — initiatives, milestones, portfolio health", category: "PMO", isElevated: false },
  { role: "approver",          displayName: "Approver",                 description: "Approval-only role for changes, catalog, procurement", category: "Platform", isElevated: false },
  { role: "requester",         displayName: "End User / Requester",     description: "Self-service catalog, submit incidents, view own records", category: "Platform", isElevated: false },
  { role: "report_viewer",     displayName: "Report Viewer",            description: "Read-only analytics and reporting access", category: "Analytics", isElevated: false },
  { role: "cmdb_admin",        displayName: "CMDB Administrator",       description: "Full CMDB write access — CIs, discovery config, HAM, SAM", category: "Asset", isElevated: false },
  { role: "vendor_manager",    displayName: "Vendor Manager",           description: "Vendor register, contracts, SLA, performance management", category: "Procurement", isElevated: false },
  { role: "catalog_admin",     displayName: "Catalog Administrator",    description: "Service catalog item management and fulfillment rules", category: "ITSM", isElevated: false },
];
