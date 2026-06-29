/**
 * Responsive web verification — manager-loop + swept pages at phone width.
 *
 * Loads each page at a 390px (iPhone-class) viewport, asserts the page does
 * not overflow horizontally (the core symptom responsiveness fixes), and
 * captures a screenshot for visual review. Presentation-only check; no data
 * mutations.
 *
 * Run: pnpm exec playwright test e2e/responsive-mobile.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

const PHONE = { width: 390, height: 844 };

const PAGES: Array<{ name: string; path: string }> = [
  { name: "approvals", path: "/app/approvals" },
  { name: "hr-expenses", path: "/app/hr/expenses" },
  { name: "finance-expenses", path: "/app/finance/expenses" },
  { name: "hr-leave", path: "/app/hr" },
  { name: "tickets", path: "/app/tickets" },
  { name: "tickets-new", path: "/app/tickets/new" },
  { name: "command", path: "/app/command" },
  { name: "vendors", path: "/app/vendors" },
  { name: "accounting", path: "/app/accounting" },
  { name: "secretarial", path: "/app/secretarial" },
  { name: "recruitment", path: "/app/recruitment" },
];

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('[data-testid="login-email"]', "admin@coheron.com");
  await page.fill('[data-testid="login-password"]', "demo1234!");
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 15000 });
}

test.describe("Responsive @ 390px phone", () => {
  test.use({ viewport: PHONE });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  for (const p of PAGES) {
    test(`${p.name} has no horizontal overflow`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto(p.path);
      // Deterministic settle: DOM ready + main content visible, instead of a
      // swallowed networkidle followed by a fixed sleep.
      await page.waitForLoadState("domcontentloaded");
      await page.locator("body").waitFor({ state: "visible" });
      await page.locator("main, [role='main'], #__next").first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});

      await page.screenshot({
        path: `playwright-report/mobile-${p.name}.png`,
        fullPage: true,
      });

      // No runtime crash on the page.
      expect(errors, `${p.path} runtime errors: ${errors.join("; ")}`).toEqual(
        [],
      );

      // The document should not be wider than the viewport (allow 1px rounding).
      const { scrollW, clientW } = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      }));
      expect(
        scrollW,
        `${p.path}: page overflows horizontally (scrollW=${scrollW} > clientW=${clientW})`,
      ).toBeLessThanOrEqual(clientW + 1);
    });
  }
});
