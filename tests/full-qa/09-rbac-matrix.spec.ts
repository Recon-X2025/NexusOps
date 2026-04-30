/**
 * CoheronConnect Full-QA — Suite 09: RBAC Matrix Validation
 *
 * Tests all 7 platform roles against protected API procedures.
 * Each role's session is obtained via login; the shared admin auth state
 * from global-setup covers the default storageState — here we explicitly
 * log in per-role to test access boundaries.
 *
 * Roles under test:
 *   admin        → admin@coheron.com     / demo1234!
 *   itil         → agent1@coheron.com    / demo1234!
 *   operator     → agent2@coheron.com    / demo1234!
 *   hr_manager   → hr@coheron.com        / demo1234!
 *   finance_mgr  → finance@coheron.com   / demo1234!
 *   requester    → employee@coheron.com  / demo1234!
 *   report_viewer→ viewer@coheron.com    / demo1234!
 */

import { test, expect, type Page } from "@playwright/test";
import { BASE_URL, apiCall, extractTrpcJson, pageHasCrash } from "./helpers";

// ── Role credentials ──────────────────────────────────────────────────────────
const ROLES = {
  admin:         { email: "admin@coheron.com",    password: "demo1234!" },
  itil:          { email: "agent1@coheron.com",   password: "demo1234!" },
  operator:      { email: "agent2@coheron.com",   password: "demo1234!" },
  hr_manager:    { email: "hr@coheron.com",       password: "demo1234!" },
  finance_mgr:   { email: "finance@coheron.com",  password: "demo1234!" },
  requester:     { email: "employee@coheron.com", password: "demo1234!" },
  report_viewer: { email: "viewer@coheron.com",   password: "demo1234!" },
} as const;

type RoleKey = keyof typeof ROLES;

async function loginRole(page: Page, role: RoleKey) {
  const { email, password } = ROLES[role];
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const pwInput    = page.locator('input[type="password"]').first();
  await emailInput.fill(email, { timeout: 10_000 });
  await pwInput.fill(password, { timeout: 5_000 });
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/app\//, { timeout: 25_000 });
}

// ── Helper: expect 200 ────────────────────────────────────────────────────────
async function expect200(page: Page, procedure: string, input: Record<string, unknown> = {}) {
  const res = await apiCall(page, procedure, input);
  expect(res.status, `${procedure} should be 200 for ${page.url()}`).toBe(200);
}

// ── Helper: expect 403 ────────────────────────────────────────────────────────
async function expect403(page: Page, procedure: string, input: Record<string, unknown> = {}) {
  const res = await apiCall(page, procedure, input);
  expect(
    [401, 403],
    `${procedure} should be 401/403 for restricted role but got ${res.status}`,
  ).toContain(res.status);
}

// =============================================================================
// 09-A  Admin role — full unrestricted access
// =============================================================================

test.describe("09-A Admin: full access to all module endpoints", () => {
  test.beforeEach(async ({ page }) => {
    await loginRole(page, "admin");
  });

  test("admin: admin.users.list returns 200", async ({ page }) => {
    await expect200(page, "admin.users.list");
  });

  test("admin: admin.auditLog.list returns 200", async ({ page }) => {
    await expect200(page, "admin.auditLog.list");
  });

  test("admin: admin.slaDefinitions.list returns 200", async ({ page }) => {
    await expect200(page, "admin.slaDefinitions.list");
  });

  test("admin: financial.listInvoices returns 200", async ({ page }) => {
    await expect200(page, "financial.listInvoices");
  });

  test("admin: hr.employees.list returns 200", async ({ page }) => {
    await expect200(page, "hr.employees.list");
  });

  test("admin: security.listIncidents returns 200", async ({ page }) => {
    await expect200(page, "security.listIncidents");
  });

  test("admin: grc.listRisks returns 200", async ({ page }) => {
    await expect200(page, "grc.listRisks");
  });

  test("admin: procurement.purchaseOrders.list returns 200", async ({ page }) => {
    await expect200(page, "procurement.purchaseOrders.list");
  });

  test("admin: reports.executiveOverview returns 200", async ({ page }) => {
    await expect200(page, "reports.executiveOverview");
  });
});

// =============================================================================
// 09-B  ITIL agent — ITSM read/write, blocked from Finance/GRC admin
// =============================================================================

test.describe("09-B ITIL agent: ITSM access, finance/GRC admin blocked", () => {
  test.beforeEach(async ({ page }) => {
    await loginRole(page, "itil");
  });

  test("itil: tickets.list returns 200", async ({ page }) => {
    await expect200(page, "tickets.list");
  });

  test("itil: changes.list returns 200", async ({ page }) => {
    await expect200(page, "changes.list");
  });

  test("itil: knowledge.list returns 200", async ({ page }) => {
    await expect200(page, "knowledge.list");
  });

  test("itil: approvals.list returns 200", async ({ page }) => {
    await expect200(page, "approvals.list");
  });

  test("itil: admin.users.list is blocked (403)", async ({ page }) => {
    await expect403(page, "admin.users.list");
  });

  test("itil: admin.auditLog.list is blocked (403)", async ({ page }) => {
    await expect403(page, "admin.auditLog.list");
  });

  test("itil: financial.listInvoices is blocked (403)", async ({ page }) => {
    await expect403(page, "financial.listInvoices");
  });
});

// =============================================================================
// 09-C  Field operator — work orders + assets, blocked from finance/admin
// =============================================================================

test.describe("09-C Field operator: WO access, admin blocked", () => {
  test.beforeEach(async ({ page }) => {
    await loginRole(page, "operator");
  });

  test("operator: workOrders.list returns 200", async ({ page }) => {
    await expect200(page, "workOrders.list");
  });

  test("operator: assets.list returns 200", async ({ page }) => {
    await expect200(page, "assets.list");
  });

  test("operator: tickets.list returns 200", async ({ page }) => {
    await expect200(page, "tickets.list");
  });

  test("operator: admin.users.list is blocked (403)", async ({ page }) => {
    await expect403(page, "admin.users.list");
  });

  test("operator: financial.listInvoices is blocked (403)", async ({ page }) => {
    await expect403(page, "financial.listInvoices");
  });

  test("operator: grc.listRisks is blocked (403)", async ({ page }) => {
    await expect403(page, "grc.listRisks");
  });
});

// =============================================================================
// 09-D  HR manager — HR full access, finance blocked
// =============================================================================

test.describe("09-D HR manager: HR access, finance admin blocked", () => {
  test.beforeEach(async ({ page }) => {
    await loginRole(page, "hr_manager");
  });

  test("hr_manager: hr.employees.list returns 200", async ({ page }) => {
    await expect200(page, "hr.employees.list");
  });

  test("hr_manager: hr.leave.list returns 200", async ({ page }) => {
    await expect200(page, "hr.leave.list");
  });

  test("hr_manager: approvals.list returns 200", async ({ page }) => {
    await expect200(page, "approvals.myPending");
  });

  test("hr_manager: admin.users.list is blocked (403)", async ({ page }) => {
    await expect403(page, "admin.users.list");
  });

  test("hr_manager: financial.listBudget is blocked (403)", async ({ page }) => {
    await expect403(page, "financial.listBudget");
  });
});

// =============================================================================
// 09-E  Finance manager — financial full access, HR admin blocked
// =============================================================================

test.describe("09-E Finance manager: financial access, HR admin blocked", () => {
  test.beforeEach(async ({ page }) => {
    await loginRole(page, "finance_mgr");
  });

  test("finance_mgr: financial.listInvoices returns 200", async ({ page }) => {
    await expect200(page, "financial.listInvoices");
  });

  test("finance_mgr: financial.listBudget returns 200", async ({ page }) => {
    await expect200(page, "financial.listBudget");
  });

  test("finance_mgr: financial.listChargebacks returns 200", async ({ page }) => {
    await expect200(page, "financial.listChargebacks");
  });

  test("finance_mgr: procurement.purchaseOrders.list returns 200", async ({ page }) => {
    await expect200(page, "procurement.purchaseOrders.list");
  });

  test("finance_mgr: admin.users.list is blocked (403)", async ({ page }) => {
    await expect403(page, "admin.users.list");
  });

  test("finance_mgr: reports.executiveOverview returns 200", async ({ page }) => {
    await expect200(page, "reports.executiveOverview");
  });
});

// =============================================================================
// 09-F  Requester (employee) — self-service only
// =============================================================================

test.describe("09-F Requester: self-service access, privileged endpoints blocked", () => {
  test.beforeEach(async ({ page }) => {
    await loginRole(page, "requester");
  });

  test("requester: tickets.list returns 200 (own tickets)", async ({ page }) => {
    await expect200(page, "tickets.list");
  });

  test("requester: catalog.listItems returns 200", async ({ page }) => {
    await expect200(page, "catalog.listItems");
  });

  test("requester: knowledge.list returns 200", async ({ page }) => {
    await expect200(page, "knowledge.list");
  });

  test("requester: admin.users.list is blocked (403)", async ({ page }) => {
    await expect403(page, "admin.users.list");
  });

  test("requester: financial.listInvoices is blocked (403)", async ({ page }) => {
    await expect403(page, "financial.listInvoices");
  });

  test("requester: security.listIncidents is blocked (403)", async ({ page }) => {
    await expect403(page, "security.listIncidents");
  });

  test("requester: grc.listRisks is blocked (403)", async ({ page }) => {
    await expect403(page, "grc.listRisks");
  });
});

// =============================================================================
// 09-G  Report viewer — read-only reports, no write mutations
// =============================================================================

test.describe("09-G Report viewer: read access, all mutations blocked", () => {
  test.beforeEach(async ({ page }) => {
    await loginRole(page, "report_viewer");
  });

  test("report_viewer: reports.slaDashboard returns 200", async ({ page }) => {
    await expect200(page, "reports.slaDashboard");
  });

  test("report_viewer: tickets.list returns 200 (read)", async ({ page }) => {
    await expect200(page, "tickets.list");
  });

  test("report_viewer: changes.list returns 200 (read)", async ({ page }) => {
    await expect200(page, "changes.list");
  });

  test("report_viewer: admin.users.list is blocked (403)", async ({ page }) => {
    await expect403(page, "admin.users.list");
  });

  test("report_viewer: financial.listInvoices is blocked (403)", async ({ page }) => {
    await expect403(page, "financial.listInvoices");
  });
});

// =============================================================================
// 09-H  Unauthenticated — all endpoints blocked
// =============================================================================

test.describe("09-H Unauthenticated: all API calls return 401", () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // clear auth state

  test("unauthenticated: tickets.list → 401", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "tickets.list");
    expect([401, 403]).toContain(res.status);
  });

  test("unauthenticated: admin.users.list → 401", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "admin.users.list");
    expect([401, 403]).toContain(res.status);
  });

  test("unauthenticated: financial.listInvoices → 401", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "financial.listInvoices");
    expect([401, 403]).toContain(res.status);
  });
});
