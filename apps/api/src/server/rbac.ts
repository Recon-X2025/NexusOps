import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../lib/trpc";

/**
 * NexusOps server-side RBAC.
 * Maps module → action → allowed roles.
 * Mirrors the client-side ROLE_PERMISSIONS matrix in apps/web/src/lib/rbac.ts.
 */
const PERMISSION_MATRIX: Record<string, Record<string, string[]>> = {
  incidents: {
    read: ["owner", "admin", "member", "viewer"],
    write: ["owner", "admin", "member"],
    assign: ["owner", "admin", "member"],
    delete: ["owner", "admin"],
    admin: ["owner", "admin"],
    approve: ["owner", "admin"],
    close: ["owner", "admin", "member"],
  },
  changes: {
    read: ["owner", "admin", "member", "viewer"],
    write: ["owner", "admin", "member"],
    approve: ["owner", "admin"],
    delete: ["owner", "admin"],
    admin: ["owner", "admin"],
  },
  problems: {
    read: ["owner", "admin", "member", "viewer"],
    write: ["owner", "admin", "member"],
    delete: ["owner", "admin"],
    admin: ["owner", "admin"],
  },
  assets: {
    read: ["owner", "admin", "member", "viewer"],
    write: ["owner", "admin", "member"],
    delete: ["owner", "admin"],
    admin: ["owner", "admin"],
  },
  security_incidents: {
    read: ["owner", "admin", "member"],
    write: ["owner", "admin", "member"],
    delete: ["owner", "admin"],
    admin: ["owner", "admin"],
  },
  vulnerabilities: {
    read: ["owner", "admin", "member", "viewer"],
    write: ["owner", "admin", "member"],
    delete: ["owner", "admin"],
    admin: ["owner", "admin"],
  },
  grc: {
    read: ["owner", "admin", "member", "viewer"],
    write: ["owner", "admin", "member"],
    approve: ["owner", "admin"],
    delete: ["owner", "admin"],
    admin: ["owner", "admin"],
  },
  financial: {
    read: ["owner", "admin", "member"],
    write: ["owner", "admin"],
    approve: ["owner", "admin"],
    delete: ["owner", "admin"],
    admin: ["owner", "admin"],
  },
  contracts: {
    read: ["owner", "admin", "member", "viewer"],
    write: ["owner", "admin", "member"],
    approve: ["owner", "admin"],
    delete: ["owner", "admin"],
    admin: ["owner", "admin"],
  },
  projects: {
    read: ["owner", "admin", "member", "viewer"],
    write: ["owner", "admin", "member"],
    delete: ["owner", "admin"],
    admin: ["owner", "admin"],
  },
  crm: {
    read: ["owner", "admin", "member", "viewer"],
    write: ["owner", "admin", "member"],
    delete: ["owner", "admin"],
    admin: ["owner", "admin"],
  },
  hr: {
    read: ["owner", "admin", "member"],
    write: ["owner", "admin", "member"],
    approve: ["owner", "admin"],
    delete: ["owner", "admin"],
    admin: ["owner", "admin"],
  },
  legal: {
    read: ["owner", "admin", "member"],
    write: ["owner", "admin", "member"],
    delete: ["owner", "admin"],
    admin: ["owner", "admin"],
  },
  procurement: {
    read: ["owner", "admin", "member", "viewer"],
    write: ["owner", "admin", "member"],
    approve: ["owner", "admin"],
    delete: ["owner", "admin"],
    admin: ["owner", "admin"],
  },
  knowledge: {
    read: ["owner", "admin", "member", "viewer"],
    write: ["owner", "admin", "member"],
    delete: ["owner", "admin"],
    admin: ["owner", "admin"],
  },
  catalog: {
    read: ["owner", "admin", "member", "viewer"],
    write: ["owner", "admin", "member"],
    approve: ["owner", "admin"],
    delete: ["owner", "admin"],
    admin: ["owner", "admin"],
  },
  admin_console: {
    read: ["owner", "admin"],
    write: ["owner", "admin"],
    delete: ["owner"],
    admin: ["owner"],
  },
};

/** Exported for unit tests — prefer `permissionProcedure` in routers. */
export function checkPermission(userRole: string, module: string, action: string): boolean {
  const allowed = PERMISSION_MATRIX[module]?.[action];
  if (!allowed) return true; // open by default if not defined
  return allowed.includes(userRole);
}

/**
 * Creates a tRPC procedure that enforces RBAC before executing.
 * Usage: permissionProcedure("financial", "approve").mutation(...)
 */
export function permissionProcedure(module: string, action: string) {
  return protectedProcedure.use(({ ctx, next }) => {
    const role = ctx.user?.role ?? "viewer";
    if (!checkPermission(role, module, action)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Permission denied: ${module}:${action} (role: ${role})`,
      });
    }
    return next({ ctx });
  });
}

export function requireAdmin() {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!["owner", "admin"].includes(ctx.user?.role ?? "")) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
    }
    return next({ ctx });
  });
}

export function requireOwner() {
  return protectedProcedure.use(({ ctx, next }) => {
    if (ctx.user?.role !== "owner") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Owner access required" });
    }
    return next({ ctx });
  });
}
