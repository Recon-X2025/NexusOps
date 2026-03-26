"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc, getTRPCClient } from "@/lib/trpc";

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 30 seconds: data is considered fresh on mount and re-navigation,
            // preventing duplicate API calls when the user navigates between pages.
            staleTime: 30 * 1000,
            // Only refetch on mount if data has gone stale (respects staleTime).
            // Prevents a refetch on every route change when data is still fresh.
            refetchOnMount: "stale",
            refetchOnWindowFocus: false,
            retry: (failureCount, error: unknown) => {
              const err = error as { data?: { code?: string } };
              if (
                err?.data?.code === "UNAUTHORIZED" ||
                err?.data?.code === "FORBIDDEN" ||
                err?.data?.code === "NOT_FOUND"
              ) {
                return false;
              }
              // One retry max — avoids long blank / “loading” when API is flaky or down
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
