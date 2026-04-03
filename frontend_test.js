import { browser } from "k6/browser";
import { check } from "k6";

export const options = {
  scenarios: {
    ui: {
      executor: "constant-vus",
      vus: 5,
      duration: "2m",
      options: {
        browser: {
          type: "chromium",
        },
      },
    },
  },
};

export default async function () {
  const page = await browser.newPage();

  try {
    // login page
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

    await page.locator('input[type="email"]').fill("admin@coheron.com");
    await page.locator('input[type="password"]').fill("demo1234!");

    // click submit and wait for navigation to settle
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.locator('button[type="submit"]').click(),
    ]);

    check(page, { "post-login url": (p) => !p.url().includes("/login") && !p.url().includes("/signin") });

    // navigate to tickets
    await page.goto("http://localhost:3000/app/tickets", { waitUntil: "networkidle" });

    check(page, { "tickets page loaded": (p) => p.url().includes("/tickets") });

    // open first ticket if table has rows
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    if (count > 0) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle" }),
        rows.nth(0).click(),
      ]);
      check(page, { "ticket detail loaded": (p) => !p.url().endsWith("/tickets") });
    }

  } finally {
    await page.close();
  }
}
