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

function getTRPCUrl(): string {
  // Server-side (SSR): call the API directly over the Docker internal network.
  // API_INTERNAL_URL is set to http://api:3001 in the Docker Compose file.
  if (typeof window === "undefined") {
    return `${process.env.API_INTERNAL_URL ?? "http://localhost:3001"}/trpc`;
  }
  // Browser: use the same-origin proxy route /api/trpc.
  // This avoids all CORS and CSP issues — the browser talks to the Next.js
  // server on the same port, which forwards to the API container internally.
  return "/api/trpc";
}

export function getTRPCClient() {
  return trpc.createClient({
    links: [
      loggerLink({
        enabled: (opts) =>
          process.env.NODE_ENV !== "production" &&
          (opts.direction === "down" && opts.result instanceof Error),
      }),
      httpBatchLink({
        url: getTRPCUrl(),
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
