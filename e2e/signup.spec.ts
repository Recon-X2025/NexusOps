/**
 * ACCEPTANCE — /signup is reachable and creates a working tenant (Round 5 Part 1).
 *
 * Round 3 closed signup behind SIGNUP_ENABLED (default OFF). Round 4 then
 * established that with signup off, NO route produces a usable tenant:
 * `mac.createOrganization` creates an org with no user and sends no invite
 * despite the console saying otherwise, and both `packages/cli` commands insert a
 * column (`organization_id`) that exists in no migration. Signup is the only path
 * that works, so the default is reversed and this spec is what proves it.
 *
 * `page.goto` is used for /login and /signup only, as permitted for this spec;
 * everything else — filling and submitting the form, and landing inside the new
 * tenant — is real clicking.
 */
import { test, expect } from "@playwright/test";

test.describe("Public signup", () => {
  test("the signup page is served (not redirected to login)", async ({ page }) => {
    const res = await page.goto("/signup");
    expect(res?.status()).toBeLessThan(400);
    // The Round-3 gate redirected /signup → /login. It must not now.
    await expect(page).toHaveURL(/\/signup/);
    await expect(page.getByRole("button", { name: /create workspace/i }).first()).toBeVisible();
  });

  test("a new organisation can be created through the form by clicking", async ({ page }) => {
    const stamp = Date.now();
    const email = `founder-${stamp}@signup.test`;
    const orgName = `Signup Co ${stamp}`;

    await page.goto("/signup");

    // Fill by visible label/placeholder — this is the real user path, so if the
    // form's fields change shape this spec should fail rather than silently pass.
    await page.locator('input[name="name"]').fill("Founder One");
    await page.locator('input[name="orgName"]').fill(orgName);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill("TestPass123!");

    await page.getByRole("button", { name: /create workspace/i }).first().click();

    // Success lands the new owner inside their brand-new tenant.
    await page.waitForURL(/\/app\//, { timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/signup/);
  });
});
