import {
  hasPermission,
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
 */
const DB_ROLE_TO_SYSTEM: Record<string, SystemRole[]> = {
  owner:  ["requester", "admin"],
  admin:  ["requester", "admin"],
  member: ["requester"],
  viewer: ["requester", "report_viewer"],
};

export function systemRolesForDbUser(dbRole: string, matrixRole?: string | null): SystemRole[] {
  const baseRoles: SystemRole[] = DB_ROLE_TO_SYSTEM[dbRole] ?? ["requester"];
  if (matrixRole && matrixRole.length > 0) {
    // Additive: preserve base role AND apply fine-grained matrix role.
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
