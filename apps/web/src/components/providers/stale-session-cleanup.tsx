"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";

const PUBLIC_AUTH_PATHS = new Set(["/login", "/signup", "/forgot-password"]);

/**
 * On public auth routes, if the browser still has session artifacts from a prior
 * visit but `auth.me` resolves to null, clear storage + cookies and drop cached
 * queries. Prevents middleware (cookie-present) vs API (invalid session) drift
 * and stops stray 401s from cached /app queries after sign-out or expiry.
 */
export function StaleSessionCleanup() {
  const pathname = usePathname();
  const utils = trpc.useUtils();
  const ranForPath = useRef<string | null>(null);

  useEffect(() => {
    if (!PUBLIC_AUTH_PATHS.has(pathname)) {
      ranForPath.current = null;
      return;
    }
    if (ranForPath.current === pathname) return;
    ranForPath.current = pathname;

    const hasLocal = !!localStorage.getItem("nexusops_session");
    const hasCookie = document.cookie.split(";").some((c) => c.trim().startsWith("nexusops_session="));
    if (!hasLocal && !hasCookie) return;

    let cancelled = false;
    void utils.auth.me
      .fetch()
      .then((me) => {
        if (cancelled) return;
        if (!me) {
          localStorage.removeItem("nexusops_session");
          document.cookie = "nexusops_session=; path=/; max-age=0; SameSite=Lax";
          void utils.invalidate();
        }
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem("nexusops_session");
        document.cookie = "nexusops_session=; path=/; max-age=0; SameSite=Lax";
        void utils.invalidate();
      });

    return () => {
      cancelled = true;
    };
  }, [pathname, utils]);

  return null;
}
