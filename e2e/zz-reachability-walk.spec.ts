/**
 * Reachability walk — visits every static route as an admin and records what
 * actually happens at runtime: page crashes, console errors, failed tRPC calls,
 * and whether the page rendered any substantive content.
 *
 * This answers the question static analysis cannot: of the routes that are
 * *wired*, which ones *work*. Results are written to REPORT_PATH as JSON.
 *
 * Run alone:  pnpm exec playwright test e2e/zz-reachability-walk.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";

const REPORT_PATH =
  process.env.WALK_REPORT ||
  "/private/tmp/claude-501/-Users-kathikiyer-Documents-Project-Work-new-ERP/84191a5b-1af4-4053-9326-607775f8b308/scratchpad/walk-report.json";

// Seeded fixture account from packages/db/src/seed.ts (org slug coheron-demo).
const ADMIN = "admin@coheron.com";

async function loginAs(page: Page, email: string, password = "demo1234!") {
  await page.goto("/login");
  await page.fill('[data-testid="login-email"]', email);
  await page.fill('[data-testid="login-password"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 30_000 });
}

const ROUTES = [
  "/app", "/app/admin", "/app/admin/custom-fields", "/app/agent", "/app/apm",
  "/app/approvals", "/app/attendance", "/app/catalog", "/app/changes",
  "/app/changes/new", "/app/cmdb", "/app/command", "/app/compliance",
  "/app/contracts", "/app/crm", "/app/csm", "/app/customer-sales",
  "/app/dashboard", "/app/developer-ops", "/app/devops", "/app/dpdp",
  "/app/employee-center", "/app/employee-portal", "/app/escalations", "/app/esg",
  "/app/events", "/app/expenses", "/app/finance-procurement",
  "/app/finance/accounting/balance-sheet", "/app/finance/accounting/coa",
  "/app/finance/accounting/gstin", "/app/finance/accounting/gstr",
  "/app/finance/accounting/journal", "/app/finance/accounting/ledger",
  "/app/finance/accounting/pnl", "/app/finance/accounting/reconciliation",
  "/app/finance/accounting/trial-balance", "/app/finance/depreciation",
  "/app/finance/expenses", "/app/financial", "/app/flows", "/app/grc",
  "/app/ham", "/app/holidays", "/app/hr", "/app/hr/expenses", "/app/it-services",
  "/app/it-services/analytics", "/app/it-services/major-incidents",
  "/app/knowledge", "/app/legal", "/app/legal-governance", "/app/notifications",
  "/app/okr", "/app/on-call", "/app/onboarding-wizard", "/app/payroll",
  "/app/people-analytics", "/app/people-workplace", "/app/performance",
  "/app/problems", "/app/procurement", "/app/profile", "/app/projects",
  "/app/recruitment", "/app/releases", "/app/reports", "/app/sam",
  "/app/secretarial", "/app/security", "/app/security-compliance",
  "/app/settings/api-keys", "/app/settings/integrations",
  "/app/settings/omnichannel", "/app/settings/webhooks", "/app/strategy",
  "/app/strategy-projects", "/app/surveys", "/app/tickets", "/app/tickets/new",
  "/app/vendors", "/app/virtual-agent", "/app/walk-up", "/app/work-orders",
  "/app/work-orders/new", "/app/work-orders/parts",
  "/app/workbench/change-release", "/app/workbench/company-secretary",
  "/app/workbench/csm", "/app/workbench/field-service",
  "/app/workbench/finance-ops", "/app/workbench/grc", "/app/workbench/hr-ops",
  "/app/workbench/pmo", "/app/workbench/procurement", "/app/workbench/recruiter",
  "/app/workbench/secops", "/app/workbench/service-desk", "/app/workflows",
  "/app/workflows/new", "/portal", "/portal/assets", "/portal/knowledge",
  "/portal/request/new", "/portal/requests",
];

type Result = {
  route: string;
  finalUrl: string;
  pageErrors: string[];
  consoleErrors: string[];
  trpcFailures: { proc: string; status: number }[];
  bodyChars: number;
  mainChars: number;
  rows: number;
  emptyState: boolean;
  crashed: boolean;
  verdict: string;
};

test("reachability walk across all static routes", async ({ page }) => {
  test.setTimeout(30 * 60 * 1000);

  const results: Result[] = [];
  await loginAs(page, ADMIN);

  for (const route of ROUTES) {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const trpcFailures: { proc: string; status: number }[] = [];

    const onPageError = (e: Error) => pageErrors.push(e.message.slice(0, 200));
    const onConsole = (m: { type: () => string; text: () => string }) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
    };
    const onResponse = (r: { url: () => string; status: () => number }) => {
      const u = r.url();
      if (u.includes("/trpc/") && r.status() >= 400) {
        const proc = u.split("/trpc/")[1]?.split("?")[0] ?? "?";
        trpcFailures.push({ proc, status: r.status() });
      }
    };

    page.on("pageerror", onPageError);
    page.on("console", onConsole);
    page.on("response", onResponse);

    let bodyChars = 0;
    let mainChars = 0;
    let rows = 0;
    let emptyState = false;
    let crashed = false;
    let finalUrl = "";
    try {
      await page.goto(route, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      const body = (await page.textContent("body")) ?? "";
      bodyChars = body.trim().length;

      // Measure the CONTENT REGION only — the nav shell is ~15k chars on every
      // page and drowns out any real difference if you measure <body>.
      const main = page.locator("main").first();
      const mainText = (await main.count())
        ? ((await main.textContent()) ?? "")
        : "";
      mainChars = mainText.trim().length;

      rows = await page.locator("main table tbody tr").count().catch(() => 0);
      emptyState =
        /no\s+\w+\s+(found|yet)|nothing (here|to show)|no (data|records|results)|get started by/i.test(
          mainText,
        );

      crashed =
        body.includes("Unhandled Runtime Error") ||
        body.includes("Application error");
      finalUrl = page.url();
    } catch (err) {
      crashed = true;
      pageErrors.push(`NAV_FAIL: ${(err as Error).message.slice(0, 160)}`);
    }

    page.off("pageerror", onPageError);
    page.off("console", onConsole);
    page.off("response", onResponse);

    let verdict = "ok";
    if (crashed) verdict = "crash";
    else if (pageErrors.length) verdict = "page-error";
    else if (trpcFailures.length) verdict = "trpc-fail";
    else if (mainChars < 250) verdict = "shell";        // content region near-empty
    else if (emptyState && rows === 0) verdict = "empty";  // renders, but no data

    results.push({
      route, finalUrl, pageErrors, consoleErrors, trpcFailures,
      bodyChars, mainChars, rows, emptyState, crashed, verdict,
    });
    // eslint-disable-next-line no-console
    console.log(
      `${verdict.padEnd(10)} ${route.padEnd(42)} main=${String(mainChars).padStart(6)} rows=${String(rows).padStart(3)}` +
      `${trpcFailures.length ? `  ${trpcFailures.length} trpc-fail` : ""}`,
    );
  }

  writeFileSync(REPORT_PATH, JSON.stringify(results, null, 1));
  const crashes = results.filter((r) => r.verdict === "crash");
  // eslint-disable-next-line no-console
  console.log(`\nWalked ${results.length} routes — ${crashes.length} crashed`);
  expect(results.length).toBe(ROUTES.length);
});
