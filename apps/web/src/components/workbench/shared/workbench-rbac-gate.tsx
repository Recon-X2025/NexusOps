"use client";

import Link from "next/link";
import { useRBAC } from "@/lib/rbac-context";
import { canAccessWorkbench, defaultWorkbenchForRoles, type WorkbenchKey } from "@coheronconnect/types";
import type { ReactNode } from "react";

/**
 * Route-level gate: if the current user cannot access this workbench,
 * render a 403 surface that points them at a workbench they CAN access
 * (or the Command Center as a fallback) — per §6.2 of the spec.
 */
export function WorkbenchRBACGate({
  workbenchKey,
  children,
}: {
  workbenchKey: WorkbenchKey;
  children: ReactNode;
}) {
  const { isLoadingAuth, currentUser, canAccess } = useRBAC();
  const roles = currentUser.roles;

  if (isLoadingAuth) {
    return (
      <div className="-m-4 min-h-full bg-[#F0F4F8] dark:bg-slate-950 p-5 md:p-6" aria-busy="true">
        <div className="h-1 w-full rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="mt-3 h-7 w-64 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="mt-2 h-4 w-96 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
      </div>
    );
  }

  // Workbench module read perm + per-workbench role mapping. We treat
  // either signal failing as denial.
  const hasModule = canAccess("workbench");
  const allowed = hasModule && canAccessWorkbench(roles as never, workbenchKey);

  if (!allowed) {
    const fallback = defaultWorkbenchForRoles(roles as never);
    const fallbackHref = fallback ? `/app/workbench/${fallback}` : "/app/command";
    const fallbackLabel = fallback ? "your default workbench" : "the Command Center";
    return (
      <div className="-m-4 min-h-full bg-[#F0F4F8] dark:bg-slate-950 p-5 md:p-6">
        <div className="mx-auto max-w-lg rounded-xl border border-white/90 dark:border-slate-700/80 bg-white dark:bg-slate-900/80 p-6 shadow-sm">
          <h1 className="text-base font-semibold text-[#001B3D] dark:text-slate-100">
            You don’t have access to this workbench
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Your role doesn’t include access to <span className="font-medium">{workbenchKey}</span>.
            Continue to {fallbackLabel} instead.
          </p>
          <Link
            href={fallbackHref}
            className="mt-4 inline-flex items-center rounded-md bg-[#001B3D] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#001B3D]/90 dark:bg-slate-100 dark:text-slate-900"
          >
            Open {fallbackLabel}
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
