import { type NextRequest, NextResponse } from "next/server";

/**
 * Self-serve signup is ENABLED unless SIGNUP_ENABLED is exactly "false", matching
 * the server guard on `auth.signup`. Signup is the only working route that
 * creates a usable tenant, so it is open during trial and pilot.
 *
 * Note that removing "/signup" from PUBLIC_PATHS below is NOT enough on its own
 * to hide the page — the `!pathname.startsWith("/app")` fall-through further down
 * serves every non-/app route anyway — which is why this explicit check exists.
 */
const SIGNUP_ENABLED = process.env.SIGNUP_ENABLED !== "false";

const PUBLIC_PATHS = [
  "/login",
  "/forgot-password",
  "/invite",
  "/portal",
  "/_next",
  "/favicon",
  "/api/auth",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Signup: served only when the same switch the API enforces is on.
  if (pathname === "/signup" || pathname.startsWith("/signup/")) {
    return SIGNUP_ENABLED
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/login", request.url));
  }

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Only protect /app/* routes
  if (!pathname.startsWith("/app")) {
    return NextResponse.next();
  }

  // Check session cookie or Authorization header
  const sessionCookie = request.cookies.get("coheronconnect_session")?.value;

  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/app/dashboard" || pathname === "/app/dashboard/") {
    return NextResponse.redirect(new URL("/app/command", request.url), 308);
  }

  if (pathname === "/app/settings" || pathname === "/app/settings/") {
    return NextResponse.redirect(new URL("/app/settings/integrations", request.url), 308);
  }

  // NOTE: Hub URLs (/app/it-services, /app/security-compliance, …) are
  // first-class **module-level dashboard** pages. The persona workbenches
  // sit alongside them, not in front of them — do NOT redirect hubs to
  // workbenches here, that would make the hub Overview rows in the sidebar
  // unreachable.

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
