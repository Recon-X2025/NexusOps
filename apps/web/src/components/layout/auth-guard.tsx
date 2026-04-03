"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useRBAC } from "@/lib/rbac-context";

/**
 * Client-side authentication guard.
 *
 * The Next.js middleware checks for cookie *existence* only, which lets through
 * requests that have an expired or invalid session token.  This component adds
 * the second layer: once `auth.me` resolves and confirms no valid session it
 * redirects to /login, preserving the current path as `?redirect=…` so the
 * user is returned here after signing in.
 *
 * Renders nothing while the auth check is in-flight (shows the loading spinner
 * from the page shell instead of a flash of protected content).
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoadingAuth } = useRBAC();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoadingAuth && !isAuthenticated) {
      const loginUrl = `/login?redirect=${encodeURIComponent(pathname)}`;
      router.replace(loginUrl);
    }
  }, [isAuthenticated, isLoadingAuth, pathname, router]);

  // Show nothing while auth resolves — avoids a flash of protected UI
  if (isLoadingAuth) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-xs">Verifying session…</span>
        </div>
      </div>
    );
  }

  // While redirecting (unauthenticated) show nothing
  if (!isAuthenticated) return null;

  return <>{children}</>;
}
