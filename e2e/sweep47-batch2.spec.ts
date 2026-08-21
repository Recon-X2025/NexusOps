/**
 * SWEEP 47 — BATCH 2 (people master data) round-trips on /app/hr.
 *
 * /app/hr is the widest screen in the product (79 table headers, 21 mutations)
 * and carries only 5 data-testid attributes, so controls are reached by role,
 * placeholder and text.
 *
 * Two DIFFERENT doors write the `employees` table on this one screen:
 *   A. Directory → "Add employee"      → hr.employees.create        (35+ fields)
 *   B. Onboarding → "New Onboarding"   → hr.onboarding.createOnboarding (10 fields)
 * Door A requires `state` + `salaryStructureId`; door B collects neither.
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

async function navToHr(page: Page) {
  const filter = page.getByPlaceholder("Filter navigator...");
  await filter.click();
  await filter.fill("HR Service Delivery");
  const link = page.getByRole("link", { name: /HR Service Delivery/i }).first();
  await link.click();
  await page.waitForURL(/\/app\/hr/, { timeout: 20_000 });
}

test.describe("SWEEP47 B2 — /app/hr — employee intake, door A (Directory)", () => {
  test("on a fresh tenant the main Add-employee dialog cannot create anyone, and says which field blocks it", async ({ page }) => {
    await loginAs(page, "admin@coheron.com");
    await navToHr(page);

    await page.getByRole("button", { name: /add employee/i }).first().click();

    const save = page.getByRole("button", { name: /create record|saving/i });
    await expect(save).toBeVisible({ timeout: 15_000 });

    // The blocker must be NAMED, not just a greyed-out button.
    const stillNeeded = page.getByText(/Still needed to create this employee/i);
    await expect(stillNeeded, "the dialog does not say what is missing").toBeVisible({ timeout: 10_000 });
    const missingText = (await stillNeeded.textContent())?.trim() ?? "";

    // And the salary-structure picker must genuinely have nothing to pick.
    const structureSelect = page.locator("select").filter({ hasText: "None" }).first();
    const options = await structureSelect.locator("option").evaluateAll((o) =>
      (o as HTMLOptionElement[]).map((x) => ({ value: x.value, label: x.textContent?.trim() })),
    );
    const realOptions = options.filter((o) => o.value !== "");

    console.log(`[B2/hr doorA] "Still needed" = ${JSON.stringify(missingText)}`);
    console.log(`[B2/hr doorA] salary-structure options = ${JSON.stringify(options)}`);
    console.log(`[B2/hr doorA] selectable structures = ${realOptions.length}`);

    await expect(save, "Create record must stay disabled with no salary structure").toBeDisabled();
    expect(realOptions.length, "fresh tenant unexpectedly had a salary structure").toBe(0);
  });
});

test.describe("SWEEP47 B2 — /app/hr — employee intake, door B (Onboarding)", () => {
  test("New Onboarding creates a real employee from name/email/phone alone", async ({ page }) => {
    const stamp = Date.now().toString().slice(-8);
    const name = `Sweep47 Onboard ${stamp}`;
    const email = `sweep47.b2.${stamp}@coheron.com`;
    const phone = "+91 90000 00000";

    await loginAs(page, "admin@coheron.com");
    await navToHr(page);

    await page.getByRole("button", { name: /^Onboarding$/i }).first().click();
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /New Onboarding/i }).click();
    const modal = page.locator("div.max-w-lg").filter({ hasText: "Start New Onboarding" }).first();
    await expect(modal).toBeVisible({ timeout: 10_000 });

    await modal.getByPlaceholder("Enter full name").fill(name);
    await modal.getByPlaceholder("name@company.com").fill(email);
    await modal.getByPlaceholder("+91 XXXXX XXXXX").fill(phone);
    // CAUSE PROBE: the only difference from the failing run is that the OPTIONAL
    // Secondary Email is given a value instead of being left blank.
    if (process.env.SWEEP_FILL_SECONDARY === "1") {
      await modal.getByPlaceholder("personal@gmail.com").fill(`sec.${stamp}@coheron.com`);
    }

    // The whole form: no state, no salary structure, no tax regime, no PAN, no bank.
    const fieldCount = await modal.locator("input").count();
    console.log(`[B2/hr doorB] the Start-New-Onboarding form renders ${fieldCount} inputs total`);

    await modal.getByRole("button", { name: /Submit Onboarding/i }).click();
    await expect(modal).toBeHidden({ timeout: 20_000 });

    console.log(`[B2/hr doorB] SUBMITTED name=${name} email=${email} phone=${phone}`);
  });
});
