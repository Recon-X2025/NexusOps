/** CRM (Seq 16 C4) — @see docs/QA_CRM_E2E_TEST_PACK.md */
import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, password = "demo1234!") {
  await page.goto("/login");
  await page.fill('[data-testid="login-email"]', email);
  await page.fill('[data-testid="login-password"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 15_000 });
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

test.describe("CRM (Seq 16 C4)", () => {
  test("P1 admin: /app/crm loads", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
    await expectNoRuntimeCrash(page, "/app/crm");
  });

  test("configurable pipeline stages — rename a stage and see it reflected", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
    await page.goto("/app/crm");
    await page.waitForLoadState("networkidle");

    // Open the Pipeline tab
    await page.getByRole("button", { name: /^Pipeline$/i }).first().click();

    // Admin Configure Stages button should be present
    const configureBtn = page.getByTestId("configure-stages-btn");
    await expect(configureBtn).toBeVisible();
    await configureBtn.click();

    const modal = page.getByTestId("stage-config-modal");
    await expect(modal).toBeVisible();

    // Rename the "prospect" stage to a unique label
    const uniqueLabel = `Prospecting ${Date.now() % 100000}`;
    const labelInput = page.getByTestId("stage-label-prospect");
    await labelInput.fill(uniqueLabel);
    await page.getByTestId("stage-config-save").click();

    // Modal closes; the new label appears as a kanban column header
    await expect(modal).toBeHidden();
    await expect(page.getByText(uniqueLabel).first()).toBeVisible({ timeout: 10_000 });
  });
});
