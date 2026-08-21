/** SWEEP 47 — detail routes + profile (no sidebar anchor). Click-through only. */
import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('[data-testid="login-email"]', "admin@coheron.com");
  await page.fill('[data-testid="login-password"]', "demo1234!");
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 25_000 });
}
async function nav(page: Page, label: string, href: string) {
  const f = page.getByPlaceholder("Filter navigator...");
  await f.click(); await f.fill(label); await page.waitForTimeout(400);
  await page.locator(`a[href="${href}"]`).first().click();
  await page.waitForLoadState("networkidle");
}

// Parent list → click the first record → assert we are on a detail route.
const DETAILS = [
  { name: "grc/[id]",        label: "Risk & Compliance",      href: "/app/grc",         re: /\/app\/grc\/[0-9a-f-]{8,}/ },
  { name: "security/[id]",   label: "Security Operations",    href: "/app/security",    re: /\/app\/security\/[0-9a-f-]{8,}/ },
  { name: "work-orders/[id]",label: "Field Service",          href: "/app/work-orders", re: /\/app\/work-orders\/[0-9a-f-]{8,}/ },
  { name: "procurement/requisitions/[id]", label: "Supply Chain & Finance", href: "/app/procurement", re: /\/app\/procurement\/requisitions\/[0-9a-f-]{8,}/ },
];

for (const d of DETAILS) {
  test(`${d.name} — reachable by clicking a record`, async ({ page }) => {
    await login(page);
    await nav(page, d.label, d.href);

    // Try every tab until a row link to a detail route exists.
    const tryClick = async () => {
      const link = page.locator(`a[href*="${d.href}/"]`).first();
      if (await link.count()) { await link.click(); return true; }
      const rows = page.locator("tbody tr");
      for (let i = 0; i < Math.min(await rows.count(), 5); i++) {
        await rows.nth(i).click().catch(() => {});
        await page.waitForTimeout(700);
        if (d.re.test(page.url())) return true;
      }
      return false;
    };
    let ok = await tryClick();
    if (!ok) {
      const tabs = page.getByRole("button");
      for (let i = 0; i < Math.min(await tabs.count(), 16); i++) {
        const t = ((await tabs.nth(i).textContent()) ?? "").trim();
        if (!t || t.length > 28) continue;
        await tabs.nth(i).click().catch(() => {});
        await page.waitForTimeout(600);
        ok = await tryClick();
        if (ok) break;
      }
    }
    await page.waitForTimeout(900);
    console.log(`[DET/${d.name}] url=${page.url()} matched=${d.re.test(page.url())}`);
    expect(d.re.test(page.url()), `${d.name}: no record could be opened`).toBe(true);
    const body = (await page.locator("body").textContent()) ?? "";
    expect(body.length, "detail page rendered empty").toBeGreaterThan(200);
  });
}

test("profile — reachable via the account menu, and a field round-trips", async ({ page }) => {
  await login(page);
  // The account button in the header (initial + name).
  await page.getByRole("button", { name: /Administrator/i }).first().click();
  await page.waitForTimeout(600);
  const link = page.locator('a[href="/app/profile"]').first();
  console.log(`[DET/profile] profile anchor after opening account menu: ${await link.count()}`);
  expect(await link.count(), "no Profile link even after opening the account menu").toBeGreaterThan(0);
  await link.click();
  await page.waitForURL(/\/app\/profile/, { timeout: 20_000 });
  await page.waitForLoadState("networkidle");

  const token = `SW47P${Date.now().toString().slice(-6)}`;
  // Profile fields carry no <label>, so fill positionally after name/email.
  // The first free-text field is PHONE and is regex-validated server-side
  // (auth.updateProfile returns 400 "Invalid phone format" on anything else).
  const inputs = page.locator('input:not([type]), input[type="text"], textarea');
  let filled = 0, freeIdx = 0;
  for (let i = 0; i < (await inputs.count()); i++) {
    const el = inputs.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    if (await el.isDisabled().catch(() => true)) continue;
    const ph = ((await el.getAttribute("placeholder")) ?? "").toLowerCase();
    if (/filter navigator|search records/.test(ph)) continue;
    const cur = await el.inputValue().catch(() => "");
    if (cur.includes("@")) continue;              // login email — leave alone
    if (cur === "Administrator") continue;        // name — leave alone
    freeIdx++;
    await el.fill(freeIdx === 1 ? "9000000000" : token).catch(() => {});
    filled++;
  }
  const save = page.getByRole("button", { name: /^(Save|Update)/i }).first();
  const hasSave = (await save.count()) > 0 && !(await save.isDisabled().catch(() => true));
  if (hasSave) await save.click();
  await page.waitForTimeout(2500);
  await page.reload();
  await page.waitForLoadState("networkidle");
  const body = (await page.locator("body").textContent()) ?? "";
  console.log(`[DET/profile] filled=${filled} save=${hasSave} token=${token} found=${body.includes(token)}`);
  expect(body.includes(token), "profile field did not survive a reload").toBe(true);
});
