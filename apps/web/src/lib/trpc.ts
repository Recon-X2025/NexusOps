import { createTRPCReact } from "@trpc/react-query";
import { httpLink, loggerLink } from "@trpc/client";
import type { AppRouter } from "@coheronconnect/api";

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

function hasCoheronConnectSessionCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((c) => c.trim().startsWith("coheronconnect_session="));
}

/** Public routes where a stale Bearer in localStorage must not override the session cookie (API uses Bearer first). */
function isPublicAuthShellPath(): boolean {
  if (typeof window === "undefined") return false;
  const p = window.location.pathname;
  return p === "/login" || p === "/signup" || p === "/forgot-password";
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
        // Use console.warn instead of console.error so that Next.js 16
        // Turbopack's devtools overlay (which intercepts console.error) does
        // not treat expected tRPC failures (UNAUTHORIZED, NOT_FOUND, etc.) as
        // visible error overlays. The warnings still appear in the browser
        // console for debugging.
        console: {
          ...console,
          error: console.warn,
        },
      }),
      httpLink({
        url: getTRPCUrl(),
        fetch: fetchWithTimeout,
        headers() {
          if (typeof window !== "undefined") {
            // On the login shell, omit Bearer when a session cookie exists so the API
            // uses the cookie token (see apps/api createContext: bearer || cookie).
            // Otherwise a stale localStorage token wins and protected queries 401
            // while DevTools still shows the user on /login.
            if (isPublicAuthShellPath() && hasCoheronConnectSessionCookie()) {
              return {};
            }
            const session = localStorage.getItem("coheronconnect_session");
            return session ? { authorization: `Bearer ${session}` } : {};
          }
          return {};
        },
      }),
    ],
  });
}
