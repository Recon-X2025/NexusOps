/**
 * Module routes — Playwright load smoke (long-tail C4 completion).
 * Covers every first-class /app/* surface tied to appRouter (see QA_LONGTAIL_ROUTERS_E2E_TEST_PACK.md §0).
 * Prerequisite: pnpm dev + seeded demo org (same as Layer 10).
 */
import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, password = "demo1234!") {
  await page.goto("/login");
  await page.fill("input[type=email]", email);
  await page.fill("input[type=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL(/app\/dashboard/, { timeout: 15000 });
}

/** Admin persona — broad module.read for route smoke */
const ADMIN_MODULE_ROUTES = [
  "/app/dashboard",
  "/app/admin",
  "/app/tickets",
  "/app/changes",
  "/app/problems",
  "/app/releases",
  "/app/work-orders",
  "/app/work-orders/parts",
  "/app/events",
  "/app/ham",
  "/app/sam",
  "/app/cmdb",
  "/app/on-call",
  "/app/grc",
  "/app/security",
  "/app/compliance",
  "/app/approvals",
  "/app/flows",
  "/app/hr",
  "/app/employee-portal",
  "/app/employee-center",
  "/app/attendance",
  "/app/holidays",
  "/app/okr",
  "/app/recruitment",
  "/app/people-analytics",
  "/app/performance",
  "/app/facilities",
  "/app/csm",
  "/app/crm",
  "/app/catalog",
  "/app/surveys",
  "/app/procurement",
  "/app/financial",
  "/app/accounting",
  "/app/vendors",
  "/app/contracts",
  "/app/legal",
  "/app/secretarial",
  "/app/projects",
  "/app/apm",
  "/app/reports",
  "/app/knowledge",
  "/app/notifications",
  "/app/workflows",
  "/app/payroll",
  "/app/virtual-agent",
  "/app/settings/integrations",
  "/app/settings/omnichannel",
  "/app/settings/webhooks",
  "/app/settings/api-keys",
  "/app/expenses",
  "/app/esg",
  "/app/strategy",
  "/app/strategy-projects",
  "/app/finance-procurement",
  "/app/legal-governance",
  "/app/security-compliance",
  "/app/customer-sales",
  "/app/people-workplace",
  "/app/it-services",
  "/app/it-services/major-incidents",
  "/app/it-services/analytics",
  "/app/onboarding-wizard",
] as const;

async function expectRouteHealthy(page: Page, path: string) {
  const batch: string[] = [];
  const onErr = (e: Error) => batch.push(e.message);
  page.on("pageerror", onErr);
  // `networkidle` hangs on TRPC/React polling — `load` is enough for crash smoke.
  await page.goto(path, { waitUntil: "load", timeout: 45_000 });
  await page.waitForLoadState("domcontentloaded");
  const body = await page.textContent("body");
  page.off("pageerror", onErr);
  expect(body, path).not.toContain("Unhandled Runtime Error");
  expect(batch, `${path}: ${batch.join("; ")}`).toHaveLength(0);
}

test.describe("Module routes (long-tail load smoke)", () => {
  test.describe.configure({ mode: "serial" });

  test("P1 admin: all listed module routes load without runtime error", async ({ page }) => {
    test.setTimeout(240_000);
    await loginAs(page, "admin@coheron.com");
    for (const path of ADMIN_MODULE_ROUTES) {
      await expectRouteHealthy(page, path);
    }
  });

  test("P2 agent: HR / CSM / catalog (fulfiller paths)", async ({ page }) => {
    await loginAs(page, "agent1@coheron.com");
    for (const path of ["/app/hr", "/app/csm", "/app/catalog"] as const) {
      await expectRouteHealthy(page, path);
    }
  });
});
