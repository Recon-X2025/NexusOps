import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/invite",
  "/portal",
  "/_next",
  "/favicon",
  "/api/auth",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
