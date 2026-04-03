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

function resolveApiBase(): string {
  // Build-time override (e.g. for custom domains / HTTPS setups)
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  // Client-side: derive from the browser's current hostname so the app
  // works on any host (localhost in dev, a real IP/domain in production)
  // without needing to bake the URL into the bundle at build time.
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  // SSR fallback — only used for server-side rendering, not visible to clients
  return "http://localhost:3001";
}

export function getTRPCClient() {
  const apiBase = resolveApiBase();

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
