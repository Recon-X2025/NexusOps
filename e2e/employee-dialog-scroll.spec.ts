/**
 * Employee dialog reachability — fairness check for the ingestion-pass scroll bug.
 *
 * The statutory ingestion pass grew the Add/Edit employee forms (state, PT
 * exemptions, identity, bank, prior-employer) tall enough that on a standard laptop
 * the card ran off the bottom of the viewport and the Save control was unreachable —
 * the form literally could not be submitted. The fix makes the card a fixed
 * header/footer with a scrolling body (`max-h-[90vh] flex flex-col` + `flex-1
 * overflow-y-auto` body + a `shrink-0` footer), so Save is always on screen no matter
 * how tall the body grows.
 *
 * This test is the "green after" half: at an 800px-tall viewport it opens the Add
 * employee dialog and asserts the Save control's bottom edge sits inside the viewport
 * — i.e. it is reachable. Before the fix the button rendered below y=800 (off-screen).
 *
 * Run: pnpm exec playwright test e2e/employee-dialog-scroll.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

const LAPTOP = { width: 1280, height: 800 };

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('[data-testid="login-email"]', "admin@coheron.com");
  await page.fill('[data-testid="login-password"]', "demo1234!");
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 15_000 });
}

test.describe("Employee dialog Save is reachable @ 800px", () => {
  test.use({ viewport: LAPTOP });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Add employee: the Save control sits inside an 800px viewport", async ({ page }) => {
    await page.goto("/app/hr");
    await page.waitForLoadState("domcontentloaded");

    // Open the Add employee dialog (header button or empty-state link — either opens it).
    await page.getByRole("button", { name: /add employee/i }).first().click();

    // The tall statutory body must be present (exemptions section is the part that used
    // to be cut off), and the Save control must be within the 800px viewport.
    const save = page.getByRole("button", { name: /create record|saving/i });
    await expect(save).toBeVisible();

    const box = await save.boundingBox();
    expect(box, "Save control has no bounding box (not laid out)").not.toBeNull();
    // Bottom edge of the Save button must be on-screen (≤ viewport height, 1px slack).
    expect(
      box!.y + box!.height,
      `Save control bottom (${box!.y + box!.height}) is below the 800px viewport — unreachable`,
    ).toBeLessThanOrEqual(LAPTOP.height + 1);

    // And it must be clickable (Playwright's actionability = in-viewport + not covered).
    await expect(save).toBeInViewport();
  });
});
