/**
 * NexusOps Full-QA — Shared helpers & constants
 */
import { type Page, type BrowserContext, expect } from "@playwright/test";

export const BASE_URL =
  typeof process !== "undefined" && process.env["NEXUS_QA_BASE_URL"]
    ? process.env["NEXUS_QA_BASE_URL"]
    : "http://139.84.154.78";
export const API_URL =
  typeof process !== "undefined" && process.env["NEXUS_QA_API_URL"]
    ? process.env["NEXUS_QA_API_URL"]
    : "http://139.84.154.78:3001";

export const ADMIN_EMAIL    = "admin@coheron.com";
export const ADMIN_PASSWORD = "demo1234!";
export const ORG_SLUG       = "coheron-demo";

// ── All 35+ module routes ─────────────────────────────────────────────────────
export const ALL_ROUTES = [
  "/app/dashboard",
  "/app/tickets",
  "/app/tickets/new",
  "/app/problems",
  "/app/changes",
  "/app/changes/new",
  "/app/releases",
  "/app/approvals",
  "/app/escalations",
  "/app/work-orders",
  "/app/work-orders/new",
  "/app/catalog",
  "/app/hr",
  "/app/employee-portal",
  "/app/employee-center",
  "/app/crm",
  "/app/financial",
  "/app/contracts",
  "/app/vendors",
  "/app/csm",
  "/app/legal",
  "/app/grc",
  "/app/compliance",
  "/app/security",
  "/app/knowledge",
  "/app/flows",
  "/app/workflows",
  "/app/facilities",
  "/app/projects",
  "/app/devops",
  "/app/on-call",
  "/app/cmdb",
  "/app/ham",
  "/app/sam",
  "/app/apm",
  "/app/virtual-agent",
  "/app/walk-up",
  "/app/events",
  "/app/surveys",
  "/app/reports",
  "/app/admin",
  "/app/profile",
  "/app/procurement",
  "/app/notifications",
  "/app/secretarial",
  "/app/recruitment",
  "/app/people-analytics",
  "/app/people-workplace",
  "/app/strategy-projects",
  "/app/developer-ops",
  "/app/it-services",
  "/app/customer-sales",
  "/app/legal-governance",
  "/app/finance-procurement",
  "/app/security-compliance",
];

export const CRASH_INDICATORS = [
  "Application error",
  "This page crashed",
  "Something went wrong",
  "ChunkLoadError",
  "Unhandled Runtime Error",
  "TypeError:",
  "Cannot read propert",
  "is not a function",
  "is not defined",
  "NEXT_REDIRECT",
];

// ── Login helper ──────────────────────────────────────────────────────────────
export async function loginAs(
  page: Page,
  email = ADMIN_EMAIL,
  password = ADMIN_PASSWORD,
): Promise<string> {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });

  const emailInput = page
    .locator('input[type="email"], input[name="email"], input[placeholder*="email" i]')
    .first();
  const pwInput = page.locator('input[type="password"]').first();
  await emailInput.fill(email, { timeout: 10_000 });
  await pwInput.fill(password, { timeout: 5_000 });

  const submitBtn = page
    .locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")')
    .first();
  await submitBtn.click({ timeout: 5_000 });

  await page.waitForURL(/\/app\//, { timeout: 25_000 });

  // Extract session cookie
  const cookies = await page.context().cookies();
  const session = cookies.find((c) =>
    c.name.toLowerCase().includes("session") || c.name.toLowerCase().includes("token"),
  );
  return session?.value ?? "";
}

// ── API helper (direct tRPC calls) ────────────────────────────────────────────
export async function apiCall(
  page: Page,
  procedure: string,
  input: Record<string, unknown> = {},
  method: "GET" | "POST" = "GET",
): Promise<{ ok: boolean; data: unknown; status: number }> {
  // Route through the Next.js /api/trpc proxy (same origin as cookies)
  const PROXY_BASE = BASE_URL;  // http://139.84.154.78
  const encoded = encodeURIComponent(JSON.stringify({ json: input }));

  const result = await page.evaluate(
    async ({ method, input, proxyBase, proc, encoded }) => {
      // Read session from localStorage (same as tRPC client does)
      const session = localStorage.getItem("nexusops_session") ?? "";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (session) headers["Authorization"] = `Bearer ${session}`;

      const options: RequestInit = { method, headers, credentials: "include" };
      if (method === "POST") {
        // API uses raw body (no json wrapper) for mutations
        options.body = JSON.stringify(input);
      }
      const url = method === "POST"
        ? `${proxyBase}/api/trpc/${proc}`
        : `${proxyBase}/api/trpc/${proc}?input=${encoded}`;
      const r = await fetch(url, options);
      const text = await r.text();
      try {
        return { ok: r.ok, data: JSON.parse(text), status: r.status };
      } catch {
        return { ok: r.ok, data: text, status: r.status };
      }
    },
    { method, input, proxyBase: PROXY_BASE, proc: procedure, encoded },
  );
  return result;
}

/** Unwrap tRPC batch JSON `{ result: { data: { json } } }[]` from `/api/trpc` responses. */
export function extractTrpcJson(data: unknown): unknown {
  if (data == null) return data;
  if (!Array.isArray(data) || data.length === 0) return data;
  const first = data[0] as Record<string, unknown>;
  if (first["error"]) {
    const err = first["error"] as Record<string, unknown>;
    const msg = typeof err["message"] === "string" ? err["message"] : JSON.stringify(first["error"]);
    throw new Error(`tRPC error: ${msg}`);
  }
  const result = first["result"] as Record<string, unknown> | undefined;
  const inner = result?.["data"] as Record<string, unknown> | undefined;
  if (inner && "json" in inner) return inner["json"];
  return result?.["data"];
}

// ── Check page for crash ──────────────────────────────────────────────────────
export function pageHasCrash(bodyText: string): string | null {
  for (const indicator of CRASH_INDICATORS) {
    if (bodyText.includes(indicator)) return indicator;
  }
  return null;
}

// ── Random helpers ────────────────────────────────────────────────────────────
export function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
