/**
 * Click every visible tab on each route (client-side tabs) and ensure no crash.
 */
import { test, expect } from "@playwright/test";
import { BRUTAL_ROUTES } from "./routes";
import { pageHasCrash } from "./brutal-helpers";

test.describe.configure({ mode: "parallel" });

const MAX_TABS = 28;

for (const route of BRUTAL_ROUTES) {
  test(`tab sweep: ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

    const tabs = page.locator('[role="tab"]:visible');
    const n = await tabs.count();
    const limit = Math.min(n, MAX_TABS);

    for (let i = 0; i < limit; i++) {
      await tabs.nth(i).click({ timeout: 8_000 }).catch(() => {});
      await page.waitForTimeout(250);
      const body = await page.locator("body").innerText();
      expect(pageHasCrash(body), `${route} tab[${i}] crash`).toBeNull();
    }
  });
}
