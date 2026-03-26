"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
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
            refetchOnMount: "stale",
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
