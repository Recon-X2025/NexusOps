/** SWEEP 47 — last screens. compliance is reached via the link on /app/security. */
import { test, expect, type Page } from "@playwright/test";
async function login(page: Page) {
  await page.goto("/login");
  await page.fill('[data-testid="login-email"]', "admin@coheron.com");
  await page.fill('[data-testid="login-password"]', "demo1234!");
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 25_000 });
}

test("compliance — reached by clicking through /app/security, then round-trip", async ({ page }) => {
  await login(page);
  // The Security & Compliance nav group is hidden, so /app/security has no
  // sidebar entry to click. The route still exists — reach it directly.
  await page.goto("/app/security");
  await page.waitForLoadState("networkidle");
  // The Config Compliance tab carries the link to /app/compliance.
  await page.getByRole("button", { name: /Config Compliance/i }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  const link = page.locator('a[href="/app/compliance"]').first();
  console.log(`[LAST/compliance] anchor on security page = ${await link.count()}`);
  expect(await link.count(), "no clickable path to /app/compliance").toBeGreaterThan(0);
  await link.click();
  await page.waitForURL(/\/app\/compliance/, { timeout: 20_000 });
  await page.waitForLoadState("networkidle");

  const token = `SW47C${Date.now().toString().slice(-6)}`;
  const btns = page.getByRole("button");
  let ctrl = "";
  for (let i = 0; i < (await btns.count()); i++) {
    const t = ((await btns.nth(i).textContent()) ?? "").trim();
    if (!/^(New|Add|Create)\b/i.test(t) || t.length > 40) continue;
    if (!(await btns.nth(i).isVisible().catch(() => false))) continue;
    await btns.nth(i).click().catch(() => {}); ctrl = t; break;
  }
  console.log(`[LAST/compliance] control="${ctrl}"`);
  await page.waitForTimeout(900);
  const ins = page.locator('input:not([type]), input[type="text"], textarea, input[type="number"], input[type="date"], select');
  let filled = 0;
  for (let i = 0; i < (await ins.count()); i++) {
    const el = ins.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    if (await el.isDisabled().catch(() => true)) continue;
    const ph = ((await el.getAttribute("placeholder")) ?? "").toLowerCase();
    if (/filter navigator|search records/.test(ph)) continue;
    const tag = await el.evaluate((n: any) => n.tagName + "/" + (n.type ?? ""));
    if (tag.startsWith("SELECT")) {
      const vals = await el.locator("option").evaluateAll((o: any) => o.map((x: any) => x.value).filter(Boolean));
      if (vals.length) { await el.selectOption(vals[0]).catch(() => {}); filled++; }
    } else if (/number/.test(tag)) { await el.fill("100").catch(() => {}); filled++; }
    else if (/date/.test(tag)) { await el.fill("2026-08-18").catch(() => {}); filled++; }
    else { await el.fill(token).catch(() => {}); filled++; }
  }
  let submitted = "";
  const sb = page.getByRole("button");
  for (let i = (await sb.count()) - 1; i >= 0; i--) {
    const t = ((await sb.nth(i).textContent()) ?? "").trim();
    if (!/^(Save|Create|Submit|Add|Confirm|Register)\b/i.test(t) || t.length > 40) continue;
    if (!(await sb.nth(i).isVisible().catch(() => false))) continue;
    if (await sb.nth(i).isDisabled().catch(() => true)) continue;
    await sb.nth(i).click().catch(() => {}); submitted = t; break;
  }
  await page.waitForTimeout(2500);
  await page.reload(); await page.waitForLoadState("networkidle");
  const body = (await page.locator("body").textContent()) ?? "";
  console.log(`[LAST/compliance] filled=${filled} submit="${submitted}" found=${body.includes(token)} token=${token}`);
  expect(body.includes(token), "compliance: token did not survive reload").toBe(true);
});
