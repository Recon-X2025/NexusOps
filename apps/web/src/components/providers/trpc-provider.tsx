"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { trpc, getTRPCClient } from "@/lib/trpc";

/**
 * Per-query staleTime presets. Import and pass as { staleTime: STALE_TIME.LIVE }
 * where the global default is too aggressive or too lenient.
 *
 * LIVE      (5 s)  — live operational views: dashboard metrics, ticket counts,
 *                    approval queues. Data changes frequently; users act on it.
 * STANDARD  (10 s) — default for transactional lists: changes, work orders,
 *                    incidents, projects. Balances freshness and request volume.
 * REFERENCE (60 s) — slow-changing reference data: vendor lists, catalog items,
 *                    workflow definitions. Already set explicitly on reports/RBAC.
 */
export const STALE_TIME = {
  LIVE: 5 * 1000,
  STANDARD: 10 * 1000,
  REFERENCE: 60 * 1000,
} as const;

function handleAuthError(error: unknown) {
  if (typeof window === "undefined") return;
  const err = error as { message?: string; data?: { code?: string; message?: string } };
  const message = err?.message || err?.data?.message || "";
  const isSuspended = message.toLowerCase().includes("suspended");
  const isUnauthorized = err?.data?.code === "UNAUTHORIZED";

  if (isSuspended || (isUnauthorized && !window.location.pathname.startsWith("/login"))) {
    localStorage.removeItem("coheronconnect_session");
    document.cookie = "coheronconnect_session=; path=/; max-age=0; SameSite=Lax";
    if (isSuspended) {
      sessionStorage.setItem("auth_suspended_notice", message || "Your organization has been suspended. Please contact support.");
    }
    const current = window.location.pathname;
    if (!current.startsWith("/login")) {
      window.location.href = `/login?redirect=${encodeURIComponent(current)}`;
    }
  }
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => handleAuthError(error),
        }),
        mutationCache: new MutationCache({
          onError: (error) => handleAuthError(error),
        }),
        defaultOptions: {
          queries: {
            // 10 s standard window: fresh enough for transactional pages, low
            // enough that list views don't lag behind mutations by more than one
            // navigation cycle. Pages that need tighter freshness pass
            // { staleTime: STALE_TIME.LIVE }; reports/AI/RBAC keep their own
            // explicit 5-min overrides which always win over this default.
            staleTime: STALE_TIME.STANDARD,
            // Refetch when the user returns to the tab. Ensures an operator
            // who alt-tabs away and comes back sees current queue counts,
            // ticket states, and approval lists without a manual refresh.
            // Individual queries that are expensive or rate-limited (devops
            // pipeline runs, financial charts, GRC reports) still opt out via
            // their own { refetchOnWindowFocus: false }.
            refetchOnWindowFocus: true,
            // Only refetch on mount if data has gone stale (respects staleTime).
            // Prevents a duplicate API call on every client-side route change
            // when data was fetched less than staleTime ago.
            refetchOnMount: true,
            retry: (failureCount, error: unknown) => {
              const err = error as { data?: { code?: string } };
              if (
                err?.data?.code === "UNAUTHORIZED" ||
                err?.data?.code === "FORBIDDEN" ||
                err?.data?.code === "NOT_FOUND"
              ) {
                return false;
              }
              // One retry max — avoids long blank / "loading" when API is flaky or down
              return failureCount < 1;
            },
          },
        },
      }),
  );

  const [trpcClient] = useState(() => getTRPCClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
