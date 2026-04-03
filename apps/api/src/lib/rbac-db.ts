import {
  hasPermission,
  ROLE_PERMISSIONS,
  type Module,
  type RbacAction,
  type SystemRole,
} from "@nexusops/types";

/** Maps org user.role (DB coarse enum) to fine-grained system roles.
 *
 * CHANGE LOG (v3.2):
 *   - "requester" is now the MANDATORY base role for ALL users.
 *     Every role combination must include "requester" as the base.
 *     Per spec: ["requester"] is the minimum; all other roles are additive.
 *
 *   - "member" maps to ["requester"]  — least-privilege default.
 *   - "viewer" maps to ["requester", "report_viewer"]  — read-only + self-service.
 *   - "owner"/"admin" map to ["requester", "admin"]  — admin + self-service base.
 *
 *   - matrix_role is ADDITIVE: the base roles are always preserved.
 *     e.g. member + "itil"       → ["requester", "itil"]
 *          owner  + "hr_manager" → ["requester", "admin", "hr_manager"]
 *
 * CHANGE LOG (v3.3):
 *   - Fallback for users who have a SystemRole name stored directly in
 *     users.role (e.g. "hr_manager", "security_analyst", "itil").
 *     Previously these would fall through to ["requester"] only, losing all
 *     domain permissions.  Now detected via ROLE_PERMISSIONS lookup and
 *     treated as the named role with "requester" base.
 */
const DB_ROLE_TO_SYSTEM: Record<string, SystemRole[]> = {
  owner:  ["requester", "admin"],
  admin:  ["requester", "admin"],
  member: ["requester"],
  viewer: ["requester", "report_viewer"],
};

/** Coarse DB roles — anything not in this set may be a SystemRole stored directly. */
const DB_COARSE_ROLES = new Set(Object.keys(DB_ROLE_TO_SYSTEM));

export function systemRolesForDbUser(dbRole: string, matrixRole?: string | null): SystemRole[] {
  let baseRoles: SystemRole[];

  if (DB_COARSE_ROLES.has(dbRole)) {
    // Normal path: users.role is a coarse DB enum value (owner/admin/member/viewer).
    baseRoles = DB_ROLE_TO_SYSTEM[dbRole]!;
  } else if (dbRole in ROLE_PERMISSIONS) {
    // Fallback: users.role contains a SystemRole name directly (e.g. "hr_manager",
    // "security_analyst", "itil").  Treat it as a matrix role with "requester" base
    // so the user retains self-service access alongside their domain permissions.
    baseRoles = ["requester", dbRole as SystemRole];
  } else {
    // Unknown role — grant minimum self-service access only.
    baseRoles = ["requester"];
  }

  if (matrixRole && matrixRole.length > 0 && matrixRole in ROLE_PERMISSIONS) {
    // Additive: preserve base roles AND apply fine-grained matrix role.
    // Avoids having two separate "admin only" fast-paths diverge.
    const effective = [...baseRoles, matrixRole as SystemRole];
    if (process.env["NODE_ENV"] !== "production") {
      console.debug(`[rbac] db_role=${dbRole} matrix_role=${matrixRole} → effective=${JSON.stringify(effective)}`);
    }
    return effective;
  }
  if (process.env["NODE_ENV"] !== "production") {
    console.debug(`[rbac] db_role=${dbRole} matrix_role=none → effective=${JSON.stringify(baseRoles)}`);
  }
  return baseRoles;
}

export function checkDbUserPermission(
  dbRole: string,
  module: Module,
  action: RbacAction,
  matrixRole?: string | null,
): boolean {
  return hasPermission(systemRolesForDbUser(dbRole, matrixRole), module, action);
}
