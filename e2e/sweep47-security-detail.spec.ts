/** SWEEP 47 — security/[id]. The ONLY link to it is on the Threat Intelligence
 *  tab (security/page.tsx:440, via ti.incidentId), so a threat-intel record
 *  tied to an incident must exist first. */
import { test, expect } from "@playwright/test";

test("security/[id] — create threat intel, then open the incident it links to", async ({ page }) => {
  const tok = `SW47TI${Date.now().toString().slice(-6)}`;
  await page.goto("/login");
  await page.fill('[data-testid="login-email"]', "admin@coheron.com");
  await page.fill('[data-testid="login-password"]', "demo1234!");
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 25_000 });

  // The Security & Compliance nav group is hidden, so /app/security has no
  // sidebar entry to click. The route still exists — reach it directly.
  await page.goto("/app/security");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: /Threat Intelligence/i }).first().click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /Add to Incident/i }).first().click();
  await page.waitForTimeout(800);

  // Incident select — first real option; description is required.
  const sels = page.locator("select");
  for (let i = 0; i < (await sels.count()); i++) {
    const v = await sels.nth(i).locator("option").evaluateAll((o: any) => o.map((x: any) => x.value).filter(Boolean));
    if (v.length) await sels.nth(i).selectOption(v[0]).catch(() => {});
  }
  await page.getByPlaceholder(/Suspected phishing domain/i).fill(`${tok} suspicious domain`);
  await page.getByRole("button", { name: /Save Threat Intel/i }).click();
  await page.waitForTimeout(2500);

  await page.reload(); await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Threat Intelligence/i }).first().click();
  await page.waitForTimeout(900);

  const link = page.locator('a[href^="/app/security/"]').first();
  console.log(`[SEC] incident links on Threat Intel tab: ${await link.count()}`);
  expect(await link.count(), "no link to a security incident rendered").toBeGreaterThan(0);
  await link.click();
  await page.waitForURL(/\/app\/security\/[0-9a-f-]{8,}/, { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  const body = (await page.locator("body").textContent()) ?? "";
  console.log(`[SEC] url=${page.url()} bodyLen=${body.length}`);
  expect(/\/app\/security\/[0-9a-f-]{8,}/.test(page.url())).toBe(true);
  expect(body.length).toBeGreaterThan(200);
});
