/**
 * Legal & Governance — Playwright hero smoke (LG C4).
 * @see docs/QA_LEGAL_GOVERNANCE_E2E_TEST_PACK.md
 */
import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, password = "demo1234!") {
  await page.goto("/login");
  await page.fill("input[type=email]", email);
  await page.fill("input[type=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL(/app\/dashboard/, { timeout: 15000 });
}

async function expectNoRuntimeCrash(page: Page, path: string) {
  const batch: string[] = [];
  const onErr = (e: Error) => batch.push(e.message);
  page.on("pageerror", onErr);
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const body = await page.textContent("body");
  page.off("pageerror", onErr);
  expect(body, path).not.toContain("Unhandled Runtime Error");
  expect(batch, `${path}: ${batch.join("; ")}`).toHaveLength(0);
}

test.describe("Legal & Governance (LG C4)", () => {
  test("P1 admin: /app/legal, /app/contracts, /app/secretarial load", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
    await expectNoRuntimeCrash(page, "/app/legal");
    await expectNoRuntimeCrash(page, "/app/contracts");
    await expectNoRuntimeCrash(page, "/app/secretarial");
  });
});
