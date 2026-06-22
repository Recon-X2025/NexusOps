import path from "node:path";
import type { NextConfig } from "next";

/**
 * Monorepo root (pnpm-lock.yaml). Turbopack otherwise picks an unrelated lockfile
 * (e.g. ~/package-lock.json) and app routes like /login 404. Turbo runs this package with cwd = apps/web.
 */
const monorepoRoot = path.resolve(process.cwd(), "../..");

// All browser→API traffic goes through the same-origin /api/trpc proxy route,
// so we no longer need to include the API port in the CSP connect-src.
// 'self' covers all /api/* calls; wss:/ws: cover websocket upgrades if added later.

/** Production / preview: full hardening. */
const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "connect-src 'self' wss: ws:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

/**
 * Development: allow embedding in IDE simple browsers (iframe / webview).
 * `X-Frame-Options: DENY` + `frame-ancestors 'none'` otherwise produce a blank tab in Cursor et al.
 */
const devSecurityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "connect-src 'self' wss: ws:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "frame-ancestors *",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: ["@coheronconnect/ui", "@coheronconnect/types"],
  turbopack: {
    root: monorepoRoot,
  },
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon.svg" }];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  async headers() {
    const headers = process.env.NODE_ENV === "development" ? devSecurityHeaders : securityHeaders;
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
