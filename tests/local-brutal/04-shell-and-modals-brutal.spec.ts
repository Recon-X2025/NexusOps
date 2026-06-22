/**
 * Global chrome: search, create menu, devops tabs, safe modal open/close.
 */
import { test, expect } from "@playwright/test";
import { pageHasCrash } from "./brutal-helpers";

test("dashboard: header search + Create affordances", async ({ page }) => {
  await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});

  const search = page.locator('input[type="search"], input[placeholder*="Search" i]').first();
  await expect(search).toBeVisible({ timeout: 15_000 });
  await search.fill("incident");
  await page.waitForTimeout(400);
  let body = await page.locator("body").innerText();
  expect(pageHasCrash(body)).toBeNull();

  const createBtn = page.getByRole("button", { name: /create/i }).first();
  if (await createBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await createBtn.click();
    await page.waitForTimeout(400);
    body = await page.locator("body").innerText();
    expect(pageHasCrash(body)).toBeNull();
    await page.keyboard.press("Escape").catch(() => {});
  }
});

test("devops: every sub-tab renders", async ({ page }) => {
  await page.goto("/app/devops", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});

  const labels = [
    "Dashboard",
    "CI/CD Pipelines",
    "Deployments",
    "Environments",
    "Change Velocity",
    "Agile Board",
    "Tool Integrations",
  ];

  for (const label of labels) {
    const tab = page.getByRole("tab", { name: new RegExp(label, "i") }).first();
    if (await tab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await tab.click();
      await page.waitForTimeout(350);
      const body = await page.locator("body").innerText();
      expect(pageHasCrash(body), `devops tab ${label}`).toBeNull();
    }
  }
});

test("tickets/new: submit blocked on empty → still no crash", async ({ page }) => {
  await page.goto("/app/tickets/new", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});

  const submit = page.locator('button[type="submit"]').first();
  if (await submit.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await submit.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
  }
  const body = await page.locator("body").innerText();
  expect(pageHasCrash(body)).toBeNull();
});
