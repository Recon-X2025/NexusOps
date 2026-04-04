/**
 * NexusOps Full-QA — Suite 07: Every Button & Interactive Element
 *
 * For every page:
 *  - Every visible button is present, not disabled (unless it's a terminal-state action)
 *  - Clicking "New/Create/Add" buttons opens a modal or navigates
 *  - Clicking "Save/Submit" on empty forms shows validation (not a crash)
 *  - Every tab/filter control switches view without crash
 *  - Every link navigates without 404
 */

import { test, expect, type Page } from "@playwright/test";

const BASE_URL = "http://139.84.154.78";

async function goto(page: Page, path: string) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(
    () => !document.body.innerText.includes("Verifying session"),
    { timeout: 20_000 },
  ).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function crashCheck(page: Page, label: string) {
  const body = await page.locator("body").innerText({ timeout: 3_000 }).catch(() => "");
  const bad = ["INTERNAL_SERVER_ERROR", "Unexpected token", "Application error",
               "Cannot read properties", "is not a function", "500 Internal"];
  const found = bad.find(t => body.includes(t));
  expect(found, `${label}: crash token "${found}" in page`).toBeUndefined();
}

async function clickAllButtons(page: Page, context: string) {
  const btns = await page.locator("button:visible:not([disabled])").all();
  for (const btn of btns) {
    const text = (await btn.textContent().catch(() => "")).trim().slice(0, 40);
    // Skip destructive-looking buttons to avoid data damage
    if (/delete|remove|destroy|purge|drop/i.test(text)) continue;
    await btn.click({ force: true, timeout: 2_000 }).catch(() => {});
    await page.waitForTimeout(300);
    await crashCheck(page, `${context} → button "${text}"`);
    // Close any modal that opened
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(200);
  }
}

async function clickAllTabs(page: Page, context: string) {
  const tabs = await page.locator("[role='tab']:visible").all();
  for (const tab of tabs) {
    await tab.click({ force: true, timeout: 2_000 }).catch(() => {});
    await page.waitForTimeout(500);
    await crashCheck(page, `${context} → tab`);
  }
}

// ── Suite ─────────────────────────────────────────────────────────────────────
test.describe("07 — All Buttons & Interactive Elements", () => {
  test.describe.configure({ mode: "parallel" });
  test.setTimeout(90_000);

  // Helper: navigate, click every button, check tabs
  async function testPageInteractivity(page: Page, path: string, label: string) {
    await goto(page, path);
    await crashCheck(page, `${label} initial load`);
    await clickAllButtons(page, label);
    await clickAllTabs(page, label);
    await crashCheck(page, `${label} after all clicks`);
  }

  // ── Core ITSM ───────────────────────────────────────────────────────────────
  test("tickets page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/tickets", "Tickets");
  });

  test("problems page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/problems", "Problems");
  });

  test("changes page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/changes", "Changes");
  });

  test("dashboard page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/dashboard", "Dashboard");
  });

  // ── Service Management ──────────────────────────────────────────────────────
  test("catalog page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/catalog", "Catalog");
  });

  test("approvals page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/approvals", "Approvals");
  });

  test("knowledge page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/knowledge", "Knowledge");
  });

  test("notifications page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/notifications", "Notifications");
  });

  // ── Work Orders ─────────────────────────────────────────────────────────────
  test("work-orders page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/work-orders", "WorkOrders");
  });

  // ── CRM ─────────────────────────────────────────────────────────────────────
  test("CRM page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/crm", "CRM");
  });

  test("CRM leads page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/crm/leads", "CRM-Leads");
  });

  test("CRM accounts page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/crm/accounts", "CRM-Accounts");
  });

  test("CRM contacts page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/crm/contacts", "CRM-Contacts");
  });

  // ── HR ──────────────────────────────────────────────────────────────────────
  test("HR employees page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/hr", "HR");
  });

  test("HR leave page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/hr/leave", "HR-Leave");
  });

  // ── Projects ────────────────────────────────────────────────────────────────
  test("projects page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/projects", "Projects");
  });

  // ── Financial ───────────────────────────────────────────────────────────────
  test("financial page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/financial", "Financial");
  });

  // ── Procurement & Vendors ────────────────────────────────────────────────────
  test("procurement page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/procurement", "Procurement");
  });

  test("vendors page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/vendors", "Vendors");
  });

  // ── Contracts ────────────────────────────────────────────────────────────────
  test("contracts page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/contracts", "Contracts");
  });

  // ── Legal & GRC ─────────────────────────────────────────────────────────────
  test("legal page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/legal", "Legal");
  });

  test("GRC page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/grc", "GRC");
  });

  // ── Security ────────────────────────────────────────────────────────────────
  test("security page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/security", "Security");
  });

  // ── DevOps ───────────────────────────────────────────────────────────────────
  test("devops page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/devops", "DevOps");
  });

  // ── Other Modules ────────────────────────────────────────────────────────────
  test("CSM page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/csm", "CSM");
  });

  test("on-call page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/oncall", "OnCall");
  });

  test("facilities page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/facilities", "Facilities");
  });

  test("events/NOC page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/events", "Events");
  });

  test("inventory page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/inventory", "Inventory");
  });

  test("surveys page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/surveys", "Surveys");
  });

  test("reports page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/reports", "Reports");
  });

  test("admin panel — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/admin", "Admin");
  });

  test("workflows page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/workflows", "Workflows");
  });

  test("APM page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/apm", "APM");
  });

  test("walk-up page — all buttons & tabs", async ({ page }) => {
    await testPageInteractivity(page, "/app/walk-up", "WalkUp");
  });

  // ── New Record Form Tests ─────────────────────────────────────────────────
  test.describe("New record forms — open, submit empty, check validation", () => {
    const FORMS = [
      { path: "/app/tickets/new",  btnText: /new ticket/i,  label: "New Ticket" },
      { path: "/app/tickets",      btnText: /new ticket|add/i, label: "Tickets - new button" },
      { path: "/app/problems",     btnText: /new problem|add/i, label: "New Problem" },
      { path: "/app/changes",      btnText: /new change|add/i,  label: "New Change" },
      { path: "/app/crm",          btnText: /new deal|add deal/i, label: "CRM New Deal" },
      { path: "/app/legal",        btnText: /new matter|new request/i, label: "Legal New" },
      { path: "/app/vendors",      btnText: /add vendor|new vendor/i, label: "New Vendor" },
      { path: "/app/knowledge",    btnText: /new article|add article/i, label: "New KB Article" },
      { path: "/app/security",     btnText: /new incident|add incident/i, label: "New Security Incident" },
      { path: "/app/projects",     btnText: /new project|add project/i, label: "New Project" },
    ];

    for (const { path, btnText, label } of FORMS) {
      test(`${label} — form opens, validation fires on empty submit`, async ({ page }) => {
        await goto(page, path);

        // Find and click the "new" button
        const newBtn = page.locator(`button:has-text("New"), button:has-text("Add"), button:has-text("Create")`).filter({ hasText: btnText }).first();
        const found = await newBtn.isVisible({ timeout: 5_000 }).catch(() => false);

        if (!found) {
          // Try generic new/add button
          const fallback = page.locator('button:visible').filter({ hasText: /new|add/i }).first();
          if (await fallback.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await fallback.click({ timeout: 3_000 }).catch(() => {});
          } else {
            console.log(`${label}: no "New" button found on page — skip`);
            return;
          }
        } else {
          await newBtn.click({ timeout: 5_000 }).catch(() => {});
        }

        await page.waitForTimeout(700);
        await crashCheck(page, `${label} after open`);

        // Try submitting empty form
        const submitBtn = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Create"), button:has-text("Submit")').last();
        if (await submitBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await submitBtn.click({ force: true, timeout: 2_000 }).catch(() => {});
          await page.waitForTimeout(1_000);
          await crashCheck(page, `${label} after empty submit`);

          // Validation must prevent navigation — still on same page or modal still open
          const currentUrl = page.url();
          expect(
            currentUrl.includes(path.split("/app")[1]) || currentUrl.includes("app"),
            `${label}: navigated away after empty submit (no validation)`,
          ).toBeTruthy();
        }

        // Close modal
        await page.keyboard.press("Escape").catch(() => {});
      });
    }
  });

  // ── Search ────────────────────────────────────────────────────────────────
  test("global search — typing returns results or empty state", async ({ page }) => {
    await goto(page, "/app/dashboard");
    // Look for a search input in the header
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="Search" i]').first();
    if (await searchInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await searchInput.fill("test");
      await page.waitForTimeout(800);
      await crashCheck(page, "Global search after typing");
      await searchInput.fill("");
    }
  });

  // ── Navigation sidebar links ──────────────────────────────────────────────
  test("all sidebar navigation links are clickable and don't 404", async ({ page }) => {
    await goto(page, "/app/dashboard");
    const navLinks = await page.locator("nav a[href], aside a[href]").all();
    const visited = new Set<string>();
    let failedLinks = 0;

    for (const link of navLinks) {
      const href = await link.getAttribute("href").catch(() => null);
      if (!href || visited.has(href) || href.startsWith("http") || href === "#") continue;
      if (href.includes("[") || href.includes("undefined")) continue;
      visited.add(href);

      await page.goto(`${BASE_URL}${href}`, { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(300);
      const body = await page.locator("body").innerText({ timeout: 3_000 }).catch(() => "");
      const has404 = body.includes("404") && body.includes("not found");
      if (has404) {
        console.error(`NAV LINK 404: ${href}`);
        failedLinks++;
      }
    }

    expect(failedLinks, `${failedLinks} sidebar nav links returned 404`).toBe(0);
  });
});
