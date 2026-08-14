/**
 * CoheronConnect Full-QA — Shared helpers & constants
 */
import { type Page, type BrowserContext, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/**
 * The admin session token persisted by global-setup in results/.auth-state.json.
 * Read once and cached. Used only as a last-resort fallback in apiCall when both the
 * context cookie jar and page localStorage have been wiped (the StaleSessionCleanup
 * race under load) — so admin-session specs stay authenticated. Negative-auth tests
 * (01-C) use raw fetch, not apiCall, so they are unaffected.
 */
let _cachedAdminToken: string | null = null;
function adminTokenFromAuthState(): string {
  if (_cachedAdminToken !== null) return _cachedAdminToken;
  _cachedAdminToken = "";
  try {
    const file = path.join(__dirname, "results", ".auth-state.json");
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as {
      origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>;
    };
    for (const o of data.origins ?? []) {
      for (const kv of o.localStorage ?? []) {
        if (kv.name === "coheronconnect_session") {
          _cachedAdminToken = kv.value;
          return _cachedAdminToken;
        }
      }
    }
  } catch {
    /* no auth-state file yet — fallback stays empty */
  }
  return _cachedAdminToken;
}

/** Web app origin (Playwright). Override with NEXUS_QA_BASE_URL for remote/staging. */
export const BASE_URL =
  typeof process !== "undefined" && process.env["NEXUS_QA_BASE_URL"]
    ? process.env["NEXUS_QA_BASE_URL"]
    : "http://localhost:3000";
/** API origin (direct Fastify). Override with NEXUS_QA_API_URL. */
export const API_URL =
  typeof process !== "undefined" && process.env["NEXUS_QA_API_URL"]
    ? process.env["NEXUS_QA_API_URL"]
    : "http://localhost:3001";

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
  "/app/strategy",
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
/**
 * Programmatic login for SETUP (not for testing the login UI itself).
 *
 * The login form fires a client-side tRPC mutation that only exists after React
 * hydration; a pre-hydration submit does a native POST to /login that never
 * authenticates, so driving the form here races and times out on waitForURL.
 * Instead we hit the same same-origin proxy the app uses and install the session
 * the way the app does: the cookie via the CONTEXT jar (reliable — a document.cookie
 * write is not always captured into storageState, and a missing cookie makes the Next
 * middleware bounce /app/* → /login, which triggers StaleSessionCleanup to wipe the
 * session under parallel load) plus localStorage for the tRPC Bearer header.
 *
 * Returns the sessionId. Use for "log in as X, then test something else"; tests that
 * assert login-UI behaviour (wrong password, rate limiting, …) must drive the form.
 */
export async function loginAs(
  page: Page,
  email = ADMIN_EMAIL,
  password = ADMIN_PASSWORD,
): Promise<string> {
  if (!page.url().startsWith(BASE_URL)) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  }

  const resp = await page.request.post(`${BASE_URL}/api/trpc/auth.login`, {
    headers: { "Content-Type": "application/json" },
    data: { email, password, rememberMe: true },
  });
  if (!resp.ok()) {
    throw new Error(`loginAs(${email}) failed: HTTP ${resp.status()} — ${await resp.text()}`);
  }
  const body = (await resp.json()) as { result?: { data?: { sessionId?: string } } };
  const sessionId = body.result?.data?.sessionId;
  if (!sessionId) {
    throw new Error(`loginAs(${email}): no sessionId — ${JSON.stringify(body).slice(0, 300)}`);
  }

  await page.context().addCookies([
    {
      name: "coheronconnect_session",
      value: sessionId,
      url: BASE_URL,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    },
  ]);
  await page.evaluate((sid) => {
    localStorage.setItem("coheronconnect_session", sid);
  }, sessionId);

  return sessionId;
}

/**
 * Re-mint an admin session when the shared storageState session has been deleted
 * mid-run (see apiCall). Updates the context cookie + the cached fallback token so
 * subsequent calls in this worker reuse the fresh session. Returns "" on failure.
 */
async function remintAdminSession(page: Page): Promise<string> {
  try {
    const resp = await page.request.post(`${BASE_URL}/api/trpc/auth.login`, {
      headers: { "Content-Type": "application/json" },
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, rememberMe: true },
    });
    if (!resp.ok()) return "";
    const body = (await resp.json()) as { result?: { data?: { sessionId?: string } } };
    const sid = body.result?.data?.sessionId ?? "";
    if (!sid) return "";
    await page.context().addCookies([
      {
        name: "coheronconnect_session",
        value: sid,
        url: BASE_URL,
        sameSite: "Lax",
        expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
      },
    ]);
    _cachedAdminToken = sid; // refresh the fallback for subsequent calls this worker
    return sid;
  } catch {
    return "";
  }
}

// ── API helper (direct tRPC calls) ────────────────────────────────────────────
export async function apiCall(
  page: Page,
  procedure: string,
  input: Record<string, unknown> = {},
  method: "GET" | "POST" = "GET",
  opts: { auth?: boolean } = {},
): Promise<{ ok: boolean; data: unknown; status: number }> {
  // auth:false makes a genuinely UNAUTHENTICATED call — no token, no self-heal — for
  // negative tests that assert 401/403. (Default true attaches the session + self-heals.)
  const useAuth = opts.auth !== false;
  const PROXY_BASE = BASE_URL; // same origin as web (the /api/trpc proxy)
  // tRPC v11 here is single httpLink with NO transformer (no superjson — see
  // apps/api/src/lib/trpc.ts initTRPC.create and apps/web/src/lib/trpc.ts httpLink).
  // GET input is the BARE input JSON, not a { json: input } wrapper. Always send it
  // (as `{}` when empty) — required-object inputs (e.g. hr.employees.list) reject a
  // missing `?input=` with "Required".
  const encoded = encodeURIComponent(JSON.stringify(input));

  // Token: prefer the CONTEXT cookie jar (role-aware — storageState for admin specs,
  // loginAs for a role); fall back to the persisted admin token. Reading from the jar
  // in Node is more reliable than page localStorage, which StaleSessionCleanup wipes.
  let ctxToken = "";
  if (useAuth) {
    try {
      const cookies = await page.context().cookies();
      ctxToken = cookies.find((c) => c.name === "coheronconnect_session")?.value ?? "";
    } catch {
      /* ignore — fall through to the admin token */
    }
  }

  const fire = (token: string) =>
    page.evaluate(
      async ({ method, input, proxyBase, proc, encoded, token }) => {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const options: RequestInit = { method, headers, credentials: "include" };
        if (method === "POST") {
          // API uses raw body (no json wrapper) for mutations
          options.body = JSON.stringify(input);
        }
        const url = method === "POST"
          ? `${proxyBase}/api/trpc/${proc}`
          : `${proxyBase}/api/trpc/${proc}${encoded ? `?input=${encoded}` : ""}`;
        const r = await fetch(url, options);
        const text = await r.text();
        try {
          return { ok: r.ok, data: JSON.parse(text), status: r.status };
        } catch {
          return { ok: r.ok, data: text, status: r.status };
        }
      },
      { method, input, proxyBase: PROXY_BASE, proc: procedure, encoded, token },
    );

  const adminToken = useAuth ? adminTokenFromAuthState() : "";
  const token = useAuth ? (ctxToken || adminToken) : "";
  let res = await fire(token);

  // Self-heal: the ONE shared storageState session gets deleted mid-run by destructive
  // specs (07-all-buttons clicks "Sign out"; admin.updateUser role/status changes nuke
  // all of a user's sessions), 401-ing every spec that relies on it. Re-mint an admin
  // session and retry ONCE — but ONLY when the dead token was the shared admin token (or
  // none). A live role session (loginAs in 09) carries a DIFFERENT token, so its
  // legitimate 401/403 is never masked and 09's expect403 RBAC assertions stay honest.
  // Never self-heal an intentionally-unauthenticated call (auth:false).
  if (useAuth && res.status === 401 && (!token || token === adminToken)) {
    const fresh = await remintAdminSession(page);
    if (fresh) res = await fire(fresh);
  }
  return res;
}

/**
 * Unwrap a tRPC response from `/api/trpc`.
 * This deployment uses single httpLink with NO transformer, so a success response
 * is `{ result: { data: <payload> } }` (an object, not a batch array, and no `json`
 * wrapper). Kept tolerant of the legacy batch-array / `{ json }` shapes just in case.
 */
export function extractTrpcJson(data: unknown): unknown {
  if (data == null) return data;
  const envelope = Array.isArray(data) ? data[0] : data;
  if (!envelope || typeof envelope !== "object") return data;
  const e = envelope as Record<string, unknown>;
  if (e["error"]) {
    const err = e["error"] as Record<string, unknown>;
    const msg = typeof err["message"] === "string" ? err["message"] : JSON.stringify(e["error"]);
    throw new Error(`tRPC error: ${msg}`);
  }
  const result = e["result"] as Record<string, unknown> | undefined;
  if (result && "data" in result) {
    const inner = result["data"];
    if (inner && typeof inner === "object" && "json" in (inner as Record<string, unknown>)) {
      return (inner as Record<string, unknown>)["json"];
    }
    return inner;
  }
  return data;
}

/**
 * Normalize a tRPC list response to a plain array. List procedures here are
 * inconsistent: some return a bare array (e.g. hr.employees.list), others a
 * paginated `{ items, nextCursor }` (e.g. tickets.list, vendors.list). Callers
 * that only care about the rows should use this instead of a bare cast.
 */
export function extractRows(data: unknown): unknown[] {
  const v = extractTrpcJson(data);
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object" && Array.isArray((v as { items?: unknown }).items)) {
    return (v as { items: unknown[] }).items;
  }
  return [];
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
