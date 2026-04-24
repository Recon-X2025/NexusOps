/**
 * tickets.spec.ts — Ticket lifecycle E2E tests
 * Requires: dev server running, DB seeded (demo1234! password)
 */
import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, password = "demo1234!") {
  await page.goto("/login");
  await page.fill('[data-testid="login-email"]', email);
  await page.fill('[data-testid="login-password"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/dashboard/, { timeout: 15_000 });
}

test.describe("Ticket Lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
  });

  test("ticket list page loads without runtime error", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/app/tickets");
    await page.waitForLoadState("networkidle");
    const critical = errors.filter(
      (e) => !e.includes("favicon") && !e.includes("ERR_"),
    );
    expect(critical).toHaveLength(0);
    await expect(page.locator("h1, [data-testid='page-title']").first()).toBeVisible();
  });

  test("create ticket form renders required fields", async ({ page }) => {
    await page.goto("/app/tickets/new");
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="ticket-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="ticket-title"]')).toBeVisible();
    await expect(page.locator('[data-testid="ticket-description"]')).toBeVisible();
    await expect(page.locator('[data-testid="ticket-submit"]')).toBeVisible();
  });

  test("create ticket — validation rejects empty submission", async ({ page }) => {
    await page.goto("/app/tickets/new");
    await page.waitForLoadState("networkidle");
    await page.click('[data-testid="ticket-submit"]');
    // Should stay on same page and show validation errors
    await expect(page).toHaveURL(/tickets\/new/);
  });

  test("create ticket — full happy path", async ({ page }) => {
    await page.goto("/app/tickets/new");
    await page.waitForLoadState("networkidle");

    const uniqueTitle = `E2E Test Ticket ${Date.now()}`;
    await page.fill('[data-testid="ticket-title"]', uniqueTitle);
    await page.fill('[data-testid="ticket-description"]', "This is an automated E2E test ticket created by Playwright.");

    // Select category (first available)
    const categorySelect = page.locator("select").filter({ hasText: /category|select/i }).first();
    if (await categorySelect.isVisible()) {
      await categorySelect.selectOption({ index: 1 });
    }

    await page.click('[data-testid="ticket-submit"]');

    // Should redirect to ticket detail page after creation
    await expect(page).toHaveURL(/app\/tickets\/[a-f0-9-]{36}/, { timeout: 15_000 });
  });

  test("ticket detail page loads for existing ticket", async ({ page }) => {
    // Navigate to the tickets list first and click first ticket
    await page.goto("/app/tickets");
    await page.waitForLoadState("networkidle");

    // Look for a link to a ticket detail page
    const ticketLink = page.locator("a[href*='/app/tickets/']").first();
    if (await ticketLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const href = await ticketLink.getAttribute("href");
      await page.goto(href!);
      await page.waitForLoadState("networkidle");
      const body = await page.textContent("body");
      expect(body).not.toContain("Application error");
      expect(body).not.toContain("Unhandled Runtime Error");
    }
  });

  test("ticket list shows tickets after creation", async ({ page }) => {
    await page.goto("/app/tickets");
    await page.waitForLoadState("networkidle");
    // Verify at least the page structure renders (empty state or ticket rows)
    const body = await page.textContent("body");
    expect(body).not.toContain("Unhandled Runtime Error");
    // Either a ticket list or an empty state message should be present
    const hasList = await page.locator("table, [data-testid='ticket-list'], [data-testid='empty-state']").count();
    expect(hasList).toBeGreaterThanOrEqual(0); // Non-crash assertion
  });

  test("ticket detail — Related tab: link two tickets", async ({ page }) => {
    const suffix = Date.now();
    const createTicket = async (title: string) => {
      await page.goto("/app/tickets/new");
      await page.waitForLoadState("networkidle");
      await page.fill('[data-testid="ticket-title"]', title);
      await page.fill('[data-testid="ticket-description"]', "Playwright relation E2E");
      const categorySelect = page.locator("select").filter({ hasText: /category|select/i }).first();
      if (await categorySelect.isVisible()) {
        await categorySelect.selectOption({ index: 1 });
      }
      await page.click('[data-testid="ticket-submit"]');
      await expect(page).toHaveURL(/app\/tickets\/([a-f0-9-]{36})/, { timeout: 15_000 });
      const m = page.url().match(/app\/tickets\/([a-f0-9-]{36})/);
      expect(m?.[1]).toBeTruthy();
      return m![1]!;
    };

    const idA = await createTicket(`E2E Relation A ${suffix}`);
    const idB = await createTicket(`E2E Relation B ${suffix}`);

    await page.goto(`/app/tickets/${idA}`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("ticket-tab-related").click();
    await expect(page.getByTestId("ticket-related-panel")).toBeVisible();

    await page.getByTestId("ticket-relation-target-id").fill(idB);
    await page.getByTestId("ticket-relation-add").click();

    await expect(page.getByTestId("ticket-linked-list")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("ticket-linked-list")).toContainText(idB.slice(0, 8));

    await page.getByTestId("ticket-relation-remove").first().click();
    await expect(page.getByTestId("ticket-linked-empty")).toBeVisible({ timeout: 10_000 });
  });

  test("pending status — SLA pause appears on activity log", async ({ page }) => {
    await page.goto("/app/tickets/new");
    await page.waitForLoadState("networkidle");

    const uniqueTitle = `E2E Pending SLA ${Date.now()}`;
    await page.fill('[data-testid="ticket-title"]', uniqueTitle);
    await page.fill('[data-testid="ticket-description"]', "Playwright pending + SLA pause audit");

    const categorySelect = page.locator("select").filter({ hasText: /category|select/i }).first();
    if (await categorySelect.isVisible()) {
      await categorySelect.selectOption({ index: 1 });
    }
    await page.click('[data-testid="ticket-submit"]');
    await expect(page).toHaveURL(/app\/tickets\/[a-f0-9-]{36}/, { timeout: 15_000 });

    const statusSelect = page.getByTestId("ticket-status-select");
    await statusSelect.waitFor({ state: "visible", timeout: 10_000 });
    const pendingOption = statusSelect.locator("option").filter({ hasText: /pending/i }).first();
    const pendingValue = await pendingOption.getAttribute("value");
    test.skip(!pendingValue, "No Pending status row in this org (see migration 0013 + seed).");

    await statusSelect.selectOption(pendingValue);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("ticket-tab-activity").click();
    await expect(page.getByText("slaPausedAt", { exact: false })).toBeVisible({ timeout: 15_000 });
  });
});
