/**
 * Open first list row (when present) and assert detail shell loads.
 */
import { test, expect } from "@playwright/test";
import { pageHasCrash } from "./brutal-helpers";

const DRILLS: { name: string; list: string; linkSelector: string }[] = [
  {
    name: "work-orders",
    list: "/app/work-orders",
    linkSelector:
      'a[href^="/app/work-orders/"]:not([href$="/new"]):not([href*="/parts"])',
  },
  { name: "tickets", list: "/app/tickets", linkSelector: 'a[href^="/app/tickets/"]:not([href$="/new"])' },
  { name: "changes", list: "/app/changes", linkSelector: 'a[href^="/app/changes/"]:not([href$="/new"])' },
  { name: "problems", list: "/app/problems", linkSelector: 'a[href^="/app/problems/"]' },
  { name: "releases", list: "/app/releases", linkSelector: 'a[href^="/app/releases/"]' },
  { name: "projects", list: "/app/projects", linkSelector: 'a[href^="/app/projects/"]' },
  { name: "contracts", list: "/app/contracts", linkSelector: 'a[href^="/app/contracts/"]' },
  { name: "csm", list: "/app/csm", linkSelector: 'a[href^="/app/csm/"]' },
  { name: "vendors", list: "/app/vendors", linkSelector: 'a[href^="/app/vendors/"]' },
  { name: "knowledge", list: "/app/knowledge", linkSelector: 'a[href^="/app/knowledge/"]' },
  { name: "security", list: "/app/security", linkSelector: 'a[href^="/app/security/"]' },
  { name: "hr", list: "/app/hr", linkSelector: 'a[href^="/app/hr/"]' },
  { name: "grc", list: "/app/grc", linkSelector: 'a[href^="/app/grc/"]' },
];

test.describe.configure({ mode: "parallel" });

for (const d of DRILLS) {
  test(`list → detail: ${d.name}`, async ({ page }, testInfo) => {
    await page.goto(d.list, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const link = page.locator(d.linkSelector).first();
    if (!(await link.isVisible({ timeout: 5_000 }).catch(() => false))) {
      testInfo.skip(true, `No rows in ${d.list}`);
      return;
    }

    await Promise.all([
      page.waitForURL(/\/app\//, { timeout: 25_000 }),
      link.click(),
    ]);

    expect(page.url()).not.toBe(d.list);
    const body = await page.locator("body").innerText({ timeout: 10_000 });
    expect(pageHasCrash(body), `${d.name} detail crash`).toBeNull();
    expect(body.length).toBeGreaterThan(50);
  });
}
