/**
 * Workbench routing & access policy.
 *
 * Workbenches sit between the executive Command Center and the per-module
 * routes. Each is a daily work surface for a specific operator persona.
 * This file is the single source of truth for:
 *   1. The 12 workbench keys (used by router slugs, RBAC checks, RouteRouting).
 *   2. Which existing SystemRole(s) should default to which workbench
 *      (used by the post-login redirect when no `lastVisitedWorkbench` exists).
 *   3. A `canAccessWorkbench(roles, key)` predicate the API + UI both use.
 *
 * Note: persona job titles in the product spec (e.g. "service_desk_lead",
 * "ciso", "csm") are aspirational and don't all exist as concrete SystemRoles.
 * The mapping below uses the closest existing role(s); the workbench module
 * permission gate (`workbench.read`) controls whether a role can see ANY
 * workbench, and `canAccessWorkbench` narrows it down per-workbench.
 */

import type { SystemRole } from "./rbac-matrix";
import { hasPermission } from "./rbac-matrix";

export const WORKBENCH_KEYS = [
  "service-desk",
  "change-release",
  "field-service",
  "secops",
  "grc",
  "hr-ops",
  "recruiter",
  "csm",
  "finance-ops",
  "procurement",
  "company-secretary",
  "pmo",
] as const;

export type WorkbenchKey = (typeof WORKBENCH_KEYS)[number];

export type WorkbenchAccent =
  | "blue"
  | "violet"
  | "cyan"
  | "rose"
  | "indigo"
  | "emerald"
  | "teal"
  | "amber"
  | "slate"
  | "orange";

export interface WorkbenchDescriptor {
  key: WorkbenchKey;
  title: string;
  persona: string;
  subtitle: string;
  accent: WorkbenchAccent;
  /** Roles that should default to this workbench when first navigating. */
  defaultRoles: SystemRole[];
  /** All roles that may view this workbench (in addition to admin). */
  accessRoles: SystemRole[];
}

export const WORKBENCHES: Record<WorkbenchKey, WorkbenchDescriptor> = {
  "service-desk": {
    key: "service-desk",
    title: "Service Desk",
    persona: "IT Service Desk Manager",
    subtitle: "Run today's queue. Catch SLA risk. Keep VIPs unblocked.",
    accent: "blue",
    defaultRoles: ["itil_manager"],
    accessRoles: ["itil_manager", "itil_admin", "itil", "manager_ops"],
  },
  "change-release": {
    key: "change-release",
    title: "Change & Release",
    persona: "Change Manager",
    subtitle: "Schedule cleanly. Spot collisions. Move CABs forward.",
    accent: "violet",
    defaultRoles: ["change_manager"],
    accessRoles: ["change_manager", "itil_manager", "itil_admin"],
  },
  "field-service": {
    key: "field-service",
    title: "Field Service",
    persona: "Dispatcher",
    subtitle: "Match work to technicians. Spot idle capacity.",
    accent: "cyan",
    defaultRoles: ["operator_field"],
    accessRoles: ["operator_field", "field_service", "itil_manager"],
  },
  secops: {
    key: "secops",
    title: "SecOps",
    persona: "Security Analyst (lead)",
    subtitle: "Triage alerts. Track containment. Validate IOCs.",
    accent: "rose",
    defaultRoles: ["security_analyst"],
    accessRoles: ["security_analyst", "security_admin"],
  },
  grc: {
    key: "grc",
    title: "GRC",
    persona: "GRC Analyst",
    subtitle: "Track control coverage. Chase evidence. Close findings.",
    accent: "indigo",
    defaultRoles: ["grc_analyst"],
    accessRoles: ["grc_analyst", "security_admin"],
  },
  "hr-ops": {
    key: "hr-ops",
    title: "HR Ops",
    persona: "HR Operations Manager",
    subtitle: "Move the journey along — hire, onboard, leave, exit.",
    accent: "emerald",
    defaultRoles: ["hr_manager"],
    accessRoles: ["hr_manager", "hr_analyst"],
  },
  recruiter: {
    key: "recruiter",
    title: "Recruiter",
    persona: "Recruiter",
    subtitle: "Move candidates. Fill the schedule. Keep offers warm.",
    accent: "teal",
    defaultRoles: ["hr_analyst"],
    accessRoles: ["hr_manager", "hr_analyst"],
  },
  csm: {
    key: "csm",
    title: "CSM",
    persona: "Customer Success Manager",
    subtitle: "Watch portfolio health. Reach detractors. Save renewals.",
    accent: "amber",
    defaultRoles: [],
    accessRoles: ["manager_ops"],
  },
  "finance-ops": {
    key: "finance-ops",
    title: "AP / AR",
    persona: "AP/AR Manager",
    subtitle: "Pay what's due. Collect what's owed. Trigger payment runs.",
    accent: "slate",
    defaultRoles: ["finance_manager"],
    accessRoles: ["finance_manager", "procurement_admin"],
  },
  procurement: {
    key: "procurement",
    title: "Procurement",
    persona: "Buyer / Procurement Manager",
    subtitle: "Move POs. Catch SLA slips. Stay ahead of renewals.",
    accent: "orange",
    defaultRoles: ["procurement_admin", "procurement_analyst"],
    accessRoles: ["procurement_admin", "procurement_analyst", "vendor_manager"],
  },
  "company-secretary": {
    key: "company-secretary",
    title: "Company Secretary",
    persona: "Company Secretary",
    subtitle: "Don't miss filings. Move the board pack. Keep registers clean.",
    accent: "violet",
    defaultRoles: ["company_secretary"],
    accessRoles: ["company_secretary", "legal_counsel"],
  },
  pmo: {
    key: "pmo",
    title: "PMO",
    persona: "PMO Lead",
    subtitle: "Steer the portfolio. Unblock dependencies. Save milestones.",
    accent: "blue",
    defaultRoles: ["project_manager"],
    accessRoles: ["project_manager", "manager_ops"],
  },
};

/** Old hub slug → workbench key the user should land on by default. */
export const HUB_TO_DEFAULT_WORKBENCH: Record<string, WorkbenchKey> = {
  "it-services": "service-desk",
  "security-compliance": "secops",
  "people-workplace": "hr-ops",
  "customer-sales": "csm",
  "finance-procurement": "finance-ops",
  "legal-governance": "company-secretary",
  "strategy-projects": "pmo",
};

/**
 * Resolve the workbench a user should land on when they don't have a
 * `lastVisitedWorkbench`. Returns null when the user has no workbench access
 * at all (caller should redirect to Command Center or a 403 page).
 */
export function defaultWorkbenchForRoles(roles: SystemRole[]): WorkbenchKey | null {
  if (roles.includes("admin")) return "service-desk";
  for (const wb of Object.values(WORKBENCHES)) {
    if (wb.defaultRoles.some((r) => roles.includes(r))) return wb.key;
  }
  for (const wb of Object.values(WORKBENCHES)) {
    if (wb.accessRoles.some((r) => roles.includes(r))) return wb.key;
  }
  return null;
}

/**
 * Per-workbench access predicate.
 *
 * A user may view a specific workbench when:
 *   1. They have `workbench.read` (the module gate), AND
 *   2. They are admin, OR they hold one of the workbench's access roles.
 */
export function canAccessWorkbench(roles: SystemRole[], key: WorkbenchKey): boolean {
  if (!hasPermission(roles, "workbench", "read")) return false;
  if (roles.includes("admin")) return true;
  const wb = WORKBENCHES[key];
  return wb.accessRoles.some((r) => roles.includes(r));
}

/** Return all workbench keys the user can access (in display order). */
export function accessibleWorkbenches(roles: SystemRole[]): WorkbenchKey[] {
  return WORKBENCH_KEYS.filter((k) => canAccessWorkbench(roles, k));
}
