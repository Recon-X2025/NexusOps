"use client";

import { usePathname } from "next/navigation";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { resolveRouteModule } from "@/lib/route-permissions";

/**
 * Layout-level page authorization guard.
 *
 * `AuthGuard` proves you are signed in; this proves you are allowed on *this*
 * page. It sits at the single `/app/*` choke point (the app layout), so every
 * current and future module page is gated from one place — rather than relying
 * on each of ~118 pages to remember its own check (the gap this fixes).
 *
 * It resolves the current pathname to the RBAC module that owns it
 * (`resolveRouteModule`, which mirrors the sidebar's module map) and renders
 * `<AccessDenied>` when the user cannot read that module. Public routes and any
 * unmapped route fall through to render normally — the API remains the
 * authoritative authorization boundary; this is UI defense-in-depth.
 */
export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { canAccess } = useRBAC();

  const module = resolveRouteModule(pathname ?? "");
  if (module && !canAccess(module)) {
    return <AccessDenied module={module} />;
  }

  return <>{children}</>;
}
