import type { QueryClient } from "@tanstack/react-query";

/** tRPC React Query keys use `[string[], { type, input }]` — first tuple is the procedure path. */
function procedurePath(queryKey: readonly unknown[]): string[] | null {
  if (!Array.isArray(queryKey) || queryKey.length === 0) return null;
  const head = queryKey[0];
  if (!Array.isArray(head) || head.length === 0) return null;
  if (!head.every((x) => typeof x === "string")) return null;
  return head as string[];
}

/**
 * Remove cached tRPC queries except `auth.*` session helpers.
 * Used on /login etc. so stale dashboard queries do not refetch and spam 401 in DevTools.
 */
export function stripNonAuthTrpcCaches(queryClient: QueryClient): void {
  const cache = queryClient.getQueryCache();
  for (const query of cache.getAll()) {
    const path = procedurePath(query.queryKey);
    if (!path) continue;
    if (path[0] === "auth") continue;
    queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
  }
}

/** Abort in-flight fetches for non-auth procedures (pairs with strip on auth shell routes). */
export function cancelNonAuthTrpcQueries(queryClient: QueryClient): void {
  void queryClient.cancelQueries({
    predicate: (query) => {
      const path = procedurePath(query.queryKey);
      if (!path) return false;
      return path[0] !== "auth";
    },
  });
}
