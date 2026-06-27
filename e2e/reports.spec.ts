/** Reports (Seq 8 C4) — @see docs/QA_REPORTS_ITSM_E2E_TEST_PACK.md */
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

test.describe("Reports (Seq 8 C4)", () => {
  test("P1 admin: /app/reports loads", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
    await expectNoRuntimeCrash(page, "/app/reports");
  });

  test("export — CSV and PDF buttons render and CSV downloads", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
    await page.goto("/app/reports");
    await page.waitForLoadState("networkidle");

    const csvBtn = page.getByTestId("report-export-csv");
    const pdfBtn = page.getByTestId("report-export-pdf");
    await expect(csvBtn).toBeVisible();
    await expect(pdfBtn).toBeVisible();

    const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
    await csvBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^report_overview_.*\.csv$/);
  });
});
