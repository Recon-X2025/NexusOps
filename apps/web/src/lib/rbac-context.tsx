"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import {
  type SystemRole, type Module, type RbacAction, type SystemUser,
  hasPermission, canAccessModule, MOCK_USERS, getVisibleModules,
} from "./rbac";
import { trpc } from "./trpc";

// Deny-all sentinel used while auth.me is in-flight.
// Every can() / canAccess() call returns false until the real user loads.
const LOADING_USER: SystemUser = {
  id: "__loading__",
  name: "Loading…",
  email: "",
  username: "",
  roles: [],
  department: "",
  active: false,
  mfaEnabled: false,
  orgId: "",
};

interface RBACContextValue {
  currentUser: SystemUser;
  switchUser: (userId: string) => void;
  can: (module: Module, action: RbacAction) => boolean;
  /** Alias for `can` — several app pages use this name for permission checks. */
  hasPermission: (module: Module, action: RbacAction) => boolean;
  canAccess: (module: Module) => boolean;
  isAdmin: () => boolean;
  hasRole: (role: SystemRole) => boolean;
  visibleModules: Set<Module>;
  allUsers: SystemUser[];
  isLoadingAuth: boolean;
  /** True once auth.me has resolved and confirmed a real session. */
  isAuthenticated: boolean;
  isDemoMode: boolean;
}

const RBACContext = createContext<RBACContextValue | null>(null);

/** Map a DB user + org object to the frontend SystemUser shape */
/**
 * Maps a DB user record to a frontend SystemUser, deriving SystemRole[].
 *
 * Role resolution (v3.2) — mirrors API rbac-db.ts exactly:
 *   DB role  | base SystemRole(s)
 *   ---------|-------------------------------
 *   owner    | ["requester", "admin"]   ← requester is MANDATORY for all users
 *   admin    | ["requester", "admin"]
 *   member   | ["requester"]
 *   viewer   | ["requester", "report_viewer"]
 *   (other)  | ["requester"]
 *
 *   matrix_role is ADDITIVE: base roles are always preserved.
 *   e.g. member + "itil"       → ["requester", "itil"]
 *        owner  + "hr_manager" → ["requester", "admin", "hr_manager"]
 */
function dbUserToSystemUser(
  user: { id: string; name: string; email: string; role: string; matrixRole?: string | null; orgId: string; status: string; lastLoginAt?: Date | string | null },
  _org?: { name?: string | null } | null,
): SystemUser {
  // Derive base roles — "requester" is MANDATORY for ALL users (spec v3.2)
  let baseRoles: SystemRole[];
  if (user.role === "owner" || user.role === "admin") {
    baseRoles = ["requester", "admin"];
  } else if (user.role === "viewer") {
    baseRoles = ["requester", "report_viewer"];
  } else {
    // "member" and anything unknown → least-privilege requester
    baseRoles = ["requester"];
  }

  // matrix_role is additive — never replaces the base roles
  const roles: SystemRole[] =
    user.matrixRole && user.matrixRole.length > 0
      ? [...baseRoles, user.matrixRole as SystemRole]
      : baseRoles;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.email.split("@")[0] ?? user.email,
    roles,
    department: _org?.name ?? "Unknown",
    active: user.status === "active",
    lastLogin: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : undefined,
    mfaEnabled: false,
    orgId: user.orgId,
    orgName: _org?.name ?? undefined,
  };
}

export function RBACProvider({ children }: { children: React.ReactNode }) {
  const [overrideUser, setOverrideUser] = useState<SystemUser | null>(null);

  const { data: meData, isLoading: isLoadingAuth, isError: isMeError } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  const realUser =
    !isMeError && meData?.user != null
      ? dbUserToSystemUser(
          meData.user as { id: string; name: string; email: string; role: string; matrixRole?: string | null; orgId: string; status: string; lastLoginAt?: Date | string | null },
          meData.org as { name?: string | null } | null,
        )
      : null;

  // SECURITY: Never fall back to a mock user for real sessions.
  // Use the deny-all LOADING_USER while auth.me resolves to prevent
  // momentary admin-level access before identity is confirmed.
  const isDemoMode = !realUser && !isLoadingAuth;
  const isAuthenticated = !!realUser;
  const effectiveRealUser = isLoadingAuth ? LOADING_USER : (realUser ?? LOADING_USER);
  const currentUser = overrideUser ?? effectiveRealUser;

  const switchUser = useCallback((userId: string) => {
    if (!isDemoMode && userId !== realUser?.id) return; // block role-switching in real sessions
    if (userId === realUser?.id) { setOverrideUser(null); return; }
    const mock = MOCK_USERS.find((u) => u.id === userId);
    if (mock) setOverrideUser(mock);
  }, [realUser, isDemoMode]);

  // When the real user loads, clear any stale override
  useEffect(() => {
    if (realUser) setOverrideUser(null);
  }, [realUser?.id]);

  const can = useCallback(
    (module: Module, action: RbacAction) => hasPermission(currentUser.roles, module, action),
    [currentUser],
  );

  const canAccess = useCallback(
    (module: Module) => canAccessModule(currentUser.roles, module),
    [currentUser],
  );

  const isAdmin = useCallback(
    () => currentUser.roles.includes("admin"),
    [currentUser],
  );

  const hasRole = useCallback(
    (role: SystemRole) => currentUser.roles.includes(role),
    [currentUser],
  );

  const visibleModules = getVisibleModules(currentUser.roles);

  const allUsers: SystemUser[] = realUser
    ? [realUser, ...MOCK_USERS.filter((u) => u.id !== realUser.id)]
    : MOCK_USERS;

  return (
    <RBACContext.Provider
      value={{
        currentUser,
        switchUser,
        can,
        hasPermission: can,
        canAccess,
        isAdmin,
        hasRole,
        visibleModules,
        allUsers,
        isLoadingAuth,
        isAuthenticated,
        isDemoMode,
      }}
    >
      {children}
    </RBACContext.Provider>
  );
}

export function useRBAC() {
  const ctx = useContext(RBACContext);
  if (!ctx) throw new Error("useRBAC must be used within RBACProvider");
  return ctx;
}

/** Gate a UI element by permission. Renders null if not permitted. */
export function PermissionGate({
  module,
  action = "read",
  fallback = null,
  children,
}: {
  module: Module;
  action?: RbacAction;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { can } = useRBAC();
  if (!can(module, action)) return <>{fallback}</>;
  return <>{children}</>;
}

/** Shows an inline "no access" message when permission denied */
export function AccessDenied({ module }: { module: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-[13px] font-semibold text-foreground/80">Access Restricted</p>
        <p className="text-[11px] text-muted-foreground mt-1">You don&apos;t have permission to access <strong>{module}</strong>.</p>
        <p className="text-[11px] text-muted-foreground">Contact your system administrator to request access.</p>
      </div>
    </div>
  );
}
