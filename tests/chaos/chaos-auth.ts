import type { Page, Route } from "@playwright/test";
import { AuthLoginOutputSchema, LoginSchema } from "@coheronconnect/types";

function tryParseLoginPayload(data: unknown): string | null {
  const direct = AuthLoginOutputSchema.safeParse(data);
  if (direct.success) return direct.data.sessionId;
  if (data && typeof data === "object" && data !== null && "json" in data) {
    const inner = (data as { json: unknown }).json;
    const wrapped = AuthLoginOutputSchema.safeParse(inner);
    if (wrapped.success) return wrapped.data.sessionId;
  }
  return null;
}

function extractSessionId(text: string): string {
  const data = JSON.parse(text) as unknown;
  if (data && typeof data === "object" && !Array.isArray(data) && "error" in data) {
    const e = (data as { error?: { message?: string } }).error;
    const msg = typeof e?.message === "string" ? e.message : JSON.stringify((data as { error: unknown }).error);
    throw new Error(msg);
  }
  if (Array.isArray(data) && data[0]) {
    const first = data[0] as Record<string, unknown>;
    if (first["error"]) {
      const er = first["error"] as Record<string, unknown>;
      throw new Error(typeof er["message"] === "string" ? er["message"] : JSON.stringify(er));
    }
    const result = first["result"] as Record<string, unknown> | undefined;
    const inner = result?.["data"] as Record<string, unknown> | undefined;
    if (inner) {
      const sid = tryParseLoginPayload(inner);
      if (sid) return sid;
      const json = inner["json"] as Record<string, unknown> | undefined;
      if (json) {
        const sid2 = tryParseLoginPayload(json);
        if (sid2) return sid2;
      }
    }
  }
  if (data && typeof data === "object" && "result" in data) {
    const d = (data as { result?: { data?: unknown } }).result?.data;
    if (d !== undefined) {
      const sid = tryParseLoginPayload(d);
      if (sid) return sid;
    }
  }
  throw new Error(`Unexpected login response: ${text.slice(0, 500)}`);
}

export async function trpcLogin(page: Page, baseUrl: string, email: string, password: string): Promise<void> {
  LoginSchema.parse({ email, password });

  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  const raw = await page.evaluate(
    async ({ base, email, password }) => {
      const r = await fetch(`${base}/api/trpc/auth.login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      return await r.text();
    },
    { base: baseUrl, email, password },
  );
  const sessionId = extractSessionId(raw);

  await page.evaluate(
    (sid) => {
      localStorage.setItem("coheronconnect_session", sid);
      document.cookie = `coheronconnect_session=${sid}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
    },
    sessionId,
  );
}

/** On rate-limited login, wait 60s once and retry. */
export async function trpcLoginWithBackoff(
  page: Page,
  baseUrl: string,
  email: string,
  password: string,
): Promise<void> {
  const maxAttempts = 2;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await trpcLogin(page, baseUrl, email, password);
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/too many login attempts|wait a minute|rate limit/i.test(msg) && attempt < maxAttempts - 1) {
        await page.waitForTimeout(60_000);
        continue;
      }
      throw e;
    }
  }
}

function isAuthLoginTrpcRequest(url: string): boolean {
  try {
    return new URL(url).pathname.includes("auth.login");
  } catch {
    return url.includes("auth.login");
  }
}

/**
 * Fails every 10th POST to `/api/trpc/**` with HTTP 500 (login excluded).
 * GETs pass through so pages hydrate; login must never be sampled.
 */
export async function installTenPercentApiFailureRoute(page: Page): Promise<() => Promise<void>> {
  let counter = 0;
  const handler = async (route: Route) => {
    const req = route.request();
    if (!req.url().includes("/api/trpc/")) return route.continue();
    if (req.method() === "OPTIONS") return route.continue();
    if (req.method() !== "POST") return route.continue();
    if (isAuthLoginTrpcRequest(req.url())) return route.continue();

    counter += 1;
    if (counter % 10 === 0) {
      return route.fulfill({
        status: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          error: { json: { message: "CHAOS: synthetic 500 (10% sample)", code: -32603 } },
        }),
      });
    }
    return route.continue();
  };
  await page.route("**/api/trpc/**", handler);
  return async () => {
    await page.unroute("**/api/trpc/**", handler);
  };
}
