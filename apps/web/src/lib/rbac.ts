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
  customPermissions?: { resource: string; action: string }[];
  department: string;
  phone?: string;
  jobTitle?: string;
  location?: string;
  bio?: string;
  manager?: string;
  active: boolean;
  lastLogin?: string;
  mfaEnabled: boolean;
  orgId: string;
  orgName?: string;
}

export { SYSTEM_ROLES_CATALOG } from "@coheronconnect/types";
