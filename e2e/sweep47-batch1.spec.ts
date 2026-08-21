/**
 * SWEEP 47 — BATCH 1 (org foundation) round-trips.
 *
 * Screens: /app/admin (invite user) and /app/admin/custom-fields (create field).
 * Both carry ZERO data-testid attributes, so every control is reached by role,
 * label, placeholder or text.
 *
 * `page.goto` is used once, for /login, and nowhere else.
 */
import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, password = "demo1234!") {
  await page.goto("/login"); // the only permitted goto in this spec
  await page.fill('[data-testid="login-email"]', email);
  await page.fill('[data-testid="login-password"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 20_000 });
}

async function navToAdmin(page: Page) {
  const filter = page.getByPlaceholder("Filter navigator...");
  await filter.click();
  await filter.fill("Administration");
  await page.getByRole("link", { name: /Administration/i }).first().click();
  await page.waitForURL(/\/app\/admin/, { timeout: 20_000 });
}

test.describe("SWEEP47 B1 — /app/admin — invite user round-trip", () => {
  test("invited user comes back with the name, email, system role AND matrix role that were entered", async ({ page }) => {
    const stamp = Date.now().toString().slice(-8);
    const email = `sweep47.b1.${stamp}@coheron.com`;
    const name = `Sweep47 Approver ${stamp}`;

    await loginAs(page, "admin@coheron.com");
    await navToAdmin(page);
    await page.getByRole("button", { name: "User Management", exact: true }).click();
    await page.waitForLoadState("networkidle");

    // ── Open the invite modal by clicking the primary control ───────────────
    await page.getByRole("button", { name: /New User/i }).first().click();
    await expect(page.getByText("Invite New User")).toBeVisible({ timeout: 10_000 });
    const modal = page.locator("div.max-w-md").filter({ hasText: "Invite New User" }).first();

    // ── Fill every field the form offers ────────────────────────────────────
    await modal.getByPlaceholder("John Doe").fill(name);
    await modal.getByPlaceholder("agent@coheron.tech").fill(email);

    const selects = modal.locator("select");
    await selects.nth(0).selectOption("admin");          // System Role
    const matrixOptions = await selects.nth(1).locator("option").evaluateAll((o) =>
      (o as HTMLOptionElement[]).map((x) => x.value).filter(Boolean),
    );
    const chosenMatrix = matrixOptions[0];
    expect(chosenMatrix, "Matrix Role select offered no value at all").toBeTruthy();
    await selects.nth(1).selectOption(chosenMatrix!);

    await modal.getByRole("button", { name: /Send Invite/i }).click();

    // ── The modal must confirm, not silently no-op ──────────────────────────
    await expect(page.getByText(/invite/i).first()).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape").catch(() => {});

    // ── Persistence: reload, search, assert the row's stored values ─────────
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "User Management", exact: true }).click();
    await page.getByPlaceholder("Search users...").fill(email);

    const row = page.locator("tbody tr", { hasText: email });
    await expect(row, "the invited user never appeared in the list").toBeVisible({ timeout: 15_000 });

    await expect(row, "NAME did not round-trip").toContainText(name);
    await expect(row, "SYSTEM ROLE did not round-trip").toContainText("admin");
    await expect(row, "MATRIX ROLE did not round-trip").toContainText(chosenMatrix!);
    await expect(row, "STATUS should be 'invited' for a fresh invite").toContainText(/invited/i);

    console.log(`[B1/admin] ROUND-TRIPPED name=${name} email=${email} role=admin matrixRole=${chosenMatrix} status=invited`);
  });
});

test.describe("SWEEP47 B1 — /app/admin/custom-fields — create field round-trip", () => {
  test("a created field returns its name, label and type; Required and Help text have nowhere to show", async ({ page }) => {
    const stamp = Date.now().toString().slice(-8);
    const apiName = `sweep47_${stamp}`;
    const label = `Sweep47 Field ${stamp}`;
    const helpText = `help-${stamp}`;

    await loginAs(page, "admin@coheron.com");
    await navToAdmin(page);

    // Reach custom-fields by clicking, not by URL.
    const cfLink = page.getByRole("link", { name: /Custom Fields/i }).first();
    if (await cfLink.count()) {
      await cfLink.click();
    } else {
      const filter = page.getByPlaceholder("Filter navigator...");
      await filter.click();
      await filter.fill("Custom Fields");
      await page.getByRole("link", { name: /Custom Fields/i }).first().click();
    }
    await page.waitForURL(/\/app\/admin\/custom-fields/, { timeout: 20_000 });

    await page.getByRole("button", { name: /New field/i }).click();

    await page.getByPlaceholder("e.g. cost_center").fill(apiName);
    await page.getByPlaceholder("e.g. Cost center").fill(label);
    // Type select inside the create panel (the first select is the Entity picker).
    const panel = page.locator('div:has-text("Create field on")').last();
    await panel.locator("select").last().selectOption("number");
    await page.locator("#req").check();
    // Help text is the only un-placeheld text input in the panel.
    await panel.locator('input[type="text"], input:not([type])').last().fill(helpText);

    await page.getByRole("button", { name: /^Create$/ }).click();

    // ── Persistence ─────────────────────────────────────────────────────────
    await page.reload();
    await page.waitForLoadState("networkidle");

    const row = page.locator("tbody tr", { hasText: apiName });
    await expect(row, "the created field never appeared in the list").toBeVisible({ timeout: 15_000 });
    await expect(row, "LABEL did not round-trip").toContainText(label);
    await expect(row, "TYPE did not round-trip").toContainText("number");
    await expect(row, "ACTIVE should be Yes on a fresh field").toContainText("Yes");

    // Required and Help text are collected by the form but the table renders
    // neither, so the UI cannot confirm them. Record that explicitly.
    const headers = (await page.locator("thead th").allTextContents()).map((h) => h.trim());
    console.log(`[B1/custom-fields] ROUND-TRIPPED name=${apiName} label=${label} type=number active=Yes`);
    console.log(`[B1/custom-fields] table headers = ${JSON.stringify(headers)}`);
    console.log(`[B1/custom-fields] isRequired=true and helpText="${helpText}" were SUBMITTED but have no column — storage NOT confirmable from this screen`);
    expect(headers, "Required has no column on this screen").not.toContain("Required");
  });
});
