"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { cancelNonAuthTrpcQueries, stripNonAuthTrpcCaches } from "@/lib/trpc-cache-auth-only";

const PUBLIC_AUTH_PATHS = new Set(["/login", "/signup", "/forgot-password"]);

/**
 * On public auth routes, if the browser still has session artifacts from a prior
 * visit but `auth.me` resolves to null, clear storage + cookies and drop cached
 * queries. Prevents middleware (cookie-present) vs API (invalid session) drift
 * and stops stray 401s from cached /app queries after sign-out or expiry.
 */
export function StaleSessionCleanup() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();
  const ranForPath = useRef<string | null>(null);

  // Before paint: drop any leftover tRPC cache from /app so inactive observers
  // do not refetch (401 spam) while the login shell is visible.
  useLayoutEffect(() => {
    if (!PUBLIC_AUTH_PATHS.has(pathname)) return;
    cancelNonAuthTrpcQueries(queryClient);
    stripNonAuthTrpcCaches(queryClient);
  }, [pathname, queryClient]);

  useEffect(() => {
    if (!PUBLIC_AUTH_PATHS.has(pathname)) {
      ranForPath.current = null;
      return;
    }
    if (ranForPath.current === pathname) return;
    ranForPath.current = pathname;

    const hasLocal = !!localStorage.getItem("coheronconnect_session");
    const hasCookie = document.cookie.split(";").some((c) => c.trim().startsWith("coheronconnect_session="));
    if (!hasLocal && !hasCookie) return;

    let cancelled = false;
    void utils.auth.me
      .fetch()
      .then((me) => {
        if (cancelled) return;
        if (!me) {
          localStorage.removeItem("coheronconnect_session");
          document.cookie = "coheronconnect_session=; path=/; max-age=0; SameSite=Lax";
          stripNonAuthTrpcCaches(queryClient);
        }
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem("coheronconnect_session");
        document.cookie = "coheronconnect_session=; path=/; max-age=0; SameSite=Lax";
        stripNonAuthTrpcCaches(queryClient);
      });

    return () => {
      cancelled = true;
    };
  }, [pathname, utils, queryClient]);

  return null;
}
