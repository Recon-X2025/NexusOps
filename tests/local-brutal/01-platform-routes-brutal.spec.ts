/**
 * Brutal route pass: every module URL loads, shell is sane, no uncaught errors.
 */
import { test, expect } from "@playwright/test";
import { BRUTAL_ROUTES } from "./routes";
import { isBenignConsoleMessage, pageHasCrash } from "./brutal-helpers";

test.describe.configure({ mode: "parallel" });

for (const route of BRUTAL_ROUTES) {
  test(`route loads: ${route}`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    const pageErrors: Error[] = [];
    page.on("pageerror", (err) => pageErrors.push(err));

    const resp = await page.goto(route, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    expect(resp?.status() ?? 0, `${route} HTTP`).toBeLessThan(500);
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const url = page.url();
    expect(url, `${route} should stay authenticated in /app`).toMatch(/\/app\//);

    const body = await page.locator("body").innerText({ timeout: 15_000 });
    const crash = pageHasCrash(body);
    expect(crash, `${route}: ${crash}`).toBeNull();

    const main = page.locator("main, [role='main']").first();
    const hasMain = await main.isVisible().catch(() => false);
    if (hasMain) {
      await expect(main).toBeVisible();
    } else {
      expect(body.length, `${route}: empty body`).toBeGreaterThan(80);
    }

    expect(
      pageErrors.map((e) => e.message),
      `${route} pageerror`,
    ).toEqual([]);

    const badConsole = consoleErrors.filter((t) => !isBenignConsoleMessage(t));
    expect(badConsole, `${route} console.error:\n${badConsole.join("\n")}`).toEqual([]);
  });
}
