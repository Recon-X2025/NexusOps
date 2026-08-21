/** SWEEP 47 — final screens. Ordered: employee first (hr/expenses depends on it). */
import { test, expect, type Page } from "@playwright/test";


async function login(page: Page) {
  await page.goto("/login");
  await page.fill('[data-testid="login-email"]', "admin@coheron.com");
  await page.fill('[data-testid="login-password"]', "demo1234!");
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 25_000 });
}
async function nav(page: Page, filterText: string, href: string) {
  const f = page.getByPlaceholder("Filter navigator...");
  await f.click(); await f.fill(filterText); await page.waitForTimeout(400);
  await page.locator(`a[href="${href}"]`).first().click();
  await page.waitForLoadState("networkidle"); await page.waitForTimeout(600);
}

test("0. seed an employee (hr/expenses needs one) — via the Onboarding door", async ({ page }) => {
  const st = Date.now().toString().slice(-7);
  await login(page);
  await nav(page, "HR Service Delivery", "/app/hr");
  await page.getByRole("button", { name: /^Onboarding$/i }).first().click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /New Onboarding/i }).click();
  const m = page.locator("div.max-w-lg").filter({ hasText: "Start New Onboarding" }).first();
  await m.getByPlaceholder("Enter full name").fill(`SW47EMP ${st}`);
  await m.getByPlaceholder("name@company.com").fill(`sw47emp.${st}@coheron.com`);
  await m.getByPlaceholder("+91 XXXXX XXXXX").fill("+91 90000 00000");
  // B2-F1 workaround: a blank optional Secondary Email 400s the whole mutation.
  await m.getByPlaceholder("personal@gmail.com").fill(`sw47sec.${st}@coheron.com`);
  await m.getByRole("button", { name: /Submit Onboarding/i }).click();
  await expect(m).toBeHidden({ timeout: 20_000 });
  console.log(`[B10/employee] created SW47EMP ${st}`);
});

test("1. hr/expenses — create claim round-trips", async ({ page }) => {
  const tok = `SW47EXP${Date.now().toString().slice(-6)}`;
  await login(page);
  await nav(page, "My Expense Claims", "/app/hr/expenses");
  await page.getByRole("button", { name: /New Claim/i }).first().click();
  await page.waitForTimeout(800);
  await page.getByPlaceholder("e.g. Client dinner at Taj").fill(tok);
  await page.getByPlaceholder("0.00").fill("2500");
  await page.getByPlaceholder("PROJ-001").fill("PROJ-SW47");
  await page.getByPlaceholder("Details…").fill(`${tok} description`);
  // Employee is the required select that was empty on a tenant with no employees.
  const sels = page.locator("select");
  for (let i = 0; i < (await sels.count()); i++) {
    const vals = await sels.nth(i).locator("option").evaluateAll((o: any) => o.map((x: any) => x.value).filter(Boolean));
    if (vals.length) await sels.nth(i).selectOption(vals[0]).catch(() => {});
  }
  const btn = page.getByRole("button", { name: /^Create Claim/i });
  console.log(`[B10/hr-expenses] Create Claim disabled=${await btn.isDisabled().catch(() => "n/a")}`);
  await btn.click();
  await page.waitForTimeout(2500);
  await page.reload(); await page.waitForLoadState("networkidle");
  const body = (await page.locator("body").textContent()) ?? "";
  console.log(`[B10/hr-expenses] token=${tok} found=${body.includes(tok)}`);
  expect(body.includes(tok)).toBe(true);
});

for (const [route, filterText, href, ctrl] of [
  ["apm", "App Inventory", "/app/apm", /^Add Application/i],
  ["flows", "Flow Designer", "/app/flows", /^New Flow/i],
] as const) {
  test(`2. ${route} — create with no form: assert the list GREW`, async ({ page }) => {
    await login(page);
    await nav(page, filterText, href);
    const rowsBefore = await page.locator("tbody tr, [data-row], li").count();
    await page.getByRole("button", { name: ctrl }).first().click();
    await page.waitForTimeout(2500);
    await nav(page, filterText, href);
    const rowsAfter = await page.locator("tbody tr, [data-row], li").count();
    console.log(`[B10/${route}] rowsBefore=${rowsBefore} rowsAfter=${rowsAfter}`);
    expect(rowsAfter, `${route}: list did not grow after create`).toBeGreaterThan(rowsBefore);
  });
}

test("3. procurement/requisitions/[id] — open a requisition by clicking its row", async ({ page }) => {
  await login(page);
  await nav(page, "Supply Chain & Finance", "/app/procurement");
  let opened = false;
  const tabs = ["Requisitions", "Purchase Requisitions", "Requests"];
  for (const t of tabs) {
    const tb = page.getByRole("button", { name: t, exact: true }).first();
    if (await tb.count()) { await tb.click().catch(() => {}); await page.waitForTimeout(800); }
    const rows = page.locator("tbody tr");
    for (let i = 0; i < Math.min(await rows.count(), 6); i++) {
      await rows.nth(i).click().catch(() => {});
      await page.waitForTimeout(900);
      if (/\/app\/procurement\/requisitions\/[0-9a-f-]{8,}/.test(page.url())) { opened = true; break; }
    }
    if (opened) break;
  }
  console.log(`[B10/proc-req-detail] url=${page.url()} opened=${opened}`);
  expect(opened, "no requisition row opened its detail route").toBe(true);
  const body = (await page.locator("body").textContent()) ?? "";
  expect(body.length).toBeGreaterThan(200);
});
