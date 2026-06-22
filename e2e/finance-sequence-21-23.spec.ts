/**
 * Finance stack Seq 21–23 — Playwright hero smoke (C4).
 * Seq 21 financial hero paths: see FP wave `e2e/finance-procurement.spec.ts` + `/app/financial`.
 * @see docs/QA_FINANCE_SEQUENCE_21_23_E2E_TEST_PACK.md
 */
import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, password = "demo1234!") {
  await page.goto("/login");
  await page.fill("input[type=email]", email);
  await page.fill("input[type=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL(/app\/command/, { timeout: 15000 });
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

test.describe("Finance sequence 21–23 (C4)", () => {
  test("P1 admin: financial, work-orders parts (inventory), accounting load", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
    await expectNoRuntimeCrash(page, "/app/financial");
    await expectNoRuntimeCrash(page, "/app/work-orders/parts");
    await expectNoRuntimeCrash(page, "/app/accounting");
  });
});
