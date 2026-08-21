/** SWEEP 47 — contracts: a multi-step wizard whose step 1 is a template CARD
 *  (a plain <div class="cursor-pointer">, no role/tabindex — which is why the
 *  generic harness saw "0 inputs" and a permanently disabled Next). */
import { test, expect, type Page } from "@playwright/test";

test("contracts — pick a template, walk the wizard, and round-trip the contract", async ({ page }) => {
  const tok = `SW47CT${Date.now().toString().slice(-6)}`;
  await page.goto("/login");
  await page.fill('[data-testid="login-email"]', "admin@coheron.com");
  await page.fill('[data-testid="login-password"]', "demo1234!");
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 25_000 });

  const f = page.getByPlaceholder("Filter navigator...");
  await f.click(); await f.fill("Contract Management"); await page.waitForTimeout(400);
  await page.locator('a[href="/app/contracts"]').first().click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^Create Contract/i }).first().click();
  await page.waitForTimeout(900);

  // Step 1 — the template card.
  await page.getByText("Mutual Non-Disclosure Agreement", { exact: false }).first().click();
  await page.waitForTimeout(500);
  const next = page.getByRole("button", { name: /Next: Define Parties/i });
  console.log(`[CT] after template click, Next disabled=${await next.isDisabled().catch(() => "n/a")}`);
  await next.click();
  await page.waitForTimeout(900);

  // Walk remaining steps, filling whatever each one shows.
  for (let step = 0; step < 5; step++) {
    const ins = page.locator('input:not([type="search"]), textarea, select');
    for (let i = 0; i < (await ins.count()); i++) {
      const el = ins.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      if (await el.isDisabled().catch(() => true)) continue;
      const ph = ((await el.getAttribute("placeholder")) ?? "").toLowerCase();
      if (/filter navigator|search records/.test(ph)) continue;
      const t = await el.evaluate((n: any) => n.tagName + "/" + (n.type ?? ""));
      if (t.startsWith("SELECT")) {
        const v = await el.locator("option").evaluateAll((o: any) => o.map((x: any) => x.value).filter(Boolean));
        if (v.length) await el.selectOption(v[0]).catch(() => {});
      } else if (/number/.test(t)) await el.fill("100").catch(() => {});
      else if (/date/.test(t)) await el.fill("2026-08-18").catch(() => {});
      else await el.fill(tok).catch(() => {});
    }
    const fwd = page.getByRole("button", { name: /^(Next|Continue|Review)/i }).first();
    if ((await fwd.count()) && await fwd.isVisible().catch(() => false) && !(await fwd.isDisabled().catch(() => true))) {
      const lbl = (await fwd.textContent())?.trim();
      await fwd.click(); console.log(`[CT] step -> ${lbl}`); await page.waitForTimeout(900); continue;
    }
    break;
  }
  const submit = page.getByRole("button", { name: /^(Create|Save|Finish|Submit|Generate)/i }).last();
  console.log(`[CT] submit="${(await submit.textContent().catch(() => ""))?.trim()}" disabled=${await submit.isDisabled().catch(() => "n/a")}`);
  await submit.click().catch(() => {});
  await page.waitForTimeout(3000);

  await page.reload(); await page.waitForLoadState("networkidle");
  const body = (await page.locator("body").textContent()) ?? "";
  console.log(`[CT] token=${tok} found=${body.includes(tok)}`);
  expect(body.includes(tok), "contract did not survive a reload").toBe(true);
});
