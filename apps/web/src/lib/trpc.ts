import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink, loggerLink } from "@trpc/client";
import type { AppRouter } from "@nexusops/api";

export { type AppRouter };

export const trpc = createTRPCReact<AppRouter>();

/** Avoid hung UI when the API is down or unreachable (browser TCP can stall a long time). */
const TRPC_FETCH_TIMEOUT_MS = 12_000;

function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TRPC_FETCH_TIMEOUT_MS);
  const parent = init?.signal;
  if (parent) {
    if (parent.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    } else {
      parent.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        controller.abort();
      });
    }
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timeoutId),
  );
}

export function getTRPCClient() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  return trpc.createClient({
    links: [
      loggerLink({
        enabled: (opts) =>
          process.env.NODE_ENV === "development" ||
          (opts.direction === "down" && opts.result instanceof Error),
      }),
      httpBatchLink({
        url: `${apiBase}/trpc`,
        fetch: fetchWithTimeout,
        headers() {
          if (typeof window !== "undefined") {
            const session = localStorage.getItem("nexusops_session");
            console.debug("TRPC HEADERS TOKEN:", session);
            return session
              ? { authorization: `Bearer ${session}` }
              : {};
          }
          return {};
        },
      }),
    ],
  });
}
