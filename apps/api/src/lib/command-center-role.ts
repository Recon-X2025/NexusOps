import type { RoleViewKey } from "@coheronconnect/metrics";
import { systemRolesForDbUser } from "./rbac-db";
import type { SystemRole } from "@coheronconnect/types";

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Maps session user + matrix hints to a Command Center lens.
 * Priority: CEO > COO > CIO > CFO > CHRO > CISO > CS > GC > default CEO.
 */
export function detectRoleViewKey(user: {
  role: string;
  matrixRole?: string | null;
}): RoleViewKey {
  const matrixRaw = user.matrixRole ?? "";
  const matrix = norm(matrixRaw);
  const effective: SystemRole[] = systemRolesForDbUser(user.role, user.matrixRole);
  const has = (r: SystemRole) => effective.includes(r);

  if (
    has("admin") ||
    matrix.includes("cxo:ceo") ||
    matrix === "founder" ||
    norm(user.role) === "founder"
  ) {
    return "ceo";
  }
  if (matrix.includes("cxo:coo") || matrix === "ops_lead" || matrix === "it_manager" || has("manager_ops")) {
    return "coo";
  }
  if (
    matrix.includes("cxo:cio") ||
    matrix.includes("cxo:cto") ||
    matrix === "eng_lead" ||
    matrix === "it_admin" ||
    has("itil_admin") ||
    has("itil_manager")
  ) {
    return "cio";
  }
  if (has("finance_manager") || matrix === "cfo" || norm(user.role) === "cfo") return "cfo";
  if (has("hr_manager") || matrix === "chro" || norm(user.role) === "chro") return "chro";
  if (has("security_analyst") || matrix === "ciso" || norm(user.role) === "ciso") return "ciso";
  if (has("company_secretary")) return "cs";
  if (has("legal_counsel") || matrix === "general_counsel" || norm(user.role) === "general_counsel") return "gc";

  return "ceo";
}
