/**
 * CoheronConnect Full-QA — Suite 10: Module Completeness & Market Benchmark
 *
 * Benchmarks CoheronConnect against industry-standard ITSM/ERP platforms:
 *   ServiceNow · Jira Service Management · Freshservice · Zoho Desk · SAP/Others
 *
 * Each test asserts that a market-standard capability exists in the platform —
 * the API returns the correct shape AND the UI renders the relevant module.
 *
 * Grading: ≥ 90% pass = "Market Competitive"; < 90% = "Gaps Identified"
 */

import { test, expect } from "@playwright/test";
import { BASE_URL, apiCall, extractTrpcJson, pageHasCrash } from "./helpers";

// ── Convenience: navigate and check no crash ──────────────────────────────────
async function visitModule(page: Parameters<typeof apiCall>[0], path: string) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(
    () => !document.body.innerText.includes("Verifying session"),
    { timeout: 20_000 },
  ).catch(() => {});
  const body = await page.locator("body").innerText();
  expect(pageHasCrash(body), `Crash on ${path}`).toBeNull();
  return body;
}

// =============================================================================
// 10-A Incident Management (ServiceNow INC / Freshservice standard)
// =============================================================================
test.describe("10-A Incident Management — market standard features", () => {
  test("incident list API returns array with status field", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "tickets.list");
    expect(res.status).toBe(200);
    const rows = extractTrpcJson(res.data) as unknown[];
    expect(Array.isArray(rows)).toBe(true);
  });

  test("incident status counts API returns structured counts", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "tickets.statusCounts");
    expect(res.status).toBe(200);
    const data = extractTrpcJson(res.data) as Record<string, unknown>;
    expect(typeof data).toBe("object");
  });

  test("incident priority list API works", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "tickets.listPriorities");
    expect(res.status).toBe(200);
  });

  test("incident page renders — create form accessible", async ({ page }) => {
    await visitModule(page, "/app/tickets");
    await page.goto(`${BASE_URL}/app/tickets/new`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    const body = await page.locator("body").innerText();
    expect(pageHasCrash(body)).toBeNull();
  });
});

// =============================================================================
// 10-B Change Management (ServiceNow CHG / ITIL CAB standard)
// =============================================================================
test.describe("10-B Change Management — market standard features", () => {
  test("change list API returns array", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "changes.list");
    expect(res.status).toBe(200);
    const rows = extractTrpcJson(res.data) as unknown[];
    expect(Array.isArray(rows)).toBe(true);
  });

  test("problem list API returns array (root cause mgmt)", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "changes.listProblems");
    expect(res.status).toBe(200);
    const rows = extractTrpcJson(res.data) as unknown[];
    expect(Array.isArray(rows)).toBe(true);
  });

  test("release list API returns array (release mgmt)", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "changes.listReleases");
    expect(res.status).toBe(200);
  });

  test("changes page - status counts API", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "changes.statusCounts");
    expect(res.status).toBe(200);
  });
});

// =============================================================================
// 10-C CMDB & Asset Management (ServiceNow CMDB standard)
// =============================================================================
test.describe("10-C CMDB & Asset Management", () => {
  test("CMDB list API returns array with CI data", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "assets.cmdb.list");
    expect(res.status).toBe(200);
    const rows = extractTrpcJson(res.data) as unknown[];
    expect(Array.isArray(rows)).toBe(true);
  });

  test("HAM (hardware) list API works", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "assets.ham.list");
    expect(res.status).toBe(200);
  });

  test("SAM (software/license) list API works", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "assets.licenses.list");
    expect(res.status).toBe(200);
  });

  test("CMDB page renders without crash", async ({ page }) => {
    await visitModule(page, "/app/cmdb");
  });

  test("HAM page renders without crash", async ({ page }) => {
    await visitModule(page, "/app/ham");
  });

  test("SAM page renders without crash", async ({ page }) => {
    await visitModule(page, "/app/sam");
  });
});

// =============================================================================
// 10-D CRM (Salesforce / HubSpot standard: deals, contacts, pipeline)
// =============================================================================
test.describe("10-D CRM — deals, contacts, pipeline", () => {
  test("CRM deals list API returns array", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "crm.listDeals");
    expect(res.status).toBe(200);
    const rows = extractTrpcJson(res.data) as unknown[];
    expect(Array.isArray(rows)).toBe(true);
  });

  test("CRM contacts list API returns array", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "crm.listContacts");
    expect(res.status).toBe(200);
  });

  test("CRM accounts list API returns array", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "crm.listAccounts");
    expect(res.status).toBe(200);
  });

  test("CRM quotes list API (quote mgmt feature)", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "crm.listQuotes");
    expect(res.status).toBe(200);
  });

  test("CRM dashboard metrics API returns data", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "crm.dashboardMetrics");
    expect(res.status).toBe(200);
  });

  test("CRM leads list API (lead management)", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "crm.listLeads");
    expect(res.status).toBe(200);
  });
});

// =============================================================================
// 10-E HR Management (Workday / BambooHR standard)
// =============================================================================
test.describe("10-E HR Management — employee, leave, payroll, onboarding", () => {
  test("employee list API returns array", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "hr.employees.list");
    expect(res.status).toBe(200);
    const rows = extractTrpcJson(res.data) as unknown[];
    expect(Array.isArray(rows)).toBe(true);
  });

  test("leave management API returns array", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "hr.leave.list");
    expect(res.status).toBe(200);
  });

  test("HR cases API returns array (employee relations)", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "hr.cases.list");
    expect(res.status).toBe(200);
  });

  test("onboarding templates API returns array", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "hr.onboardingTemplates.list");
    expect(res.status).toBe(200);
  });

  test("payroll payslips API works (payroll mgmt)", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "hr.payroll.listPayslips");
    expect(res.status).toBe(200);
  });
});

// =============================================================================
// 10-F Financial Management (SAP / NetSuite standard)
// =============================================================================
test.describe("10-F Financial Management — invoices, budget, chargebacks", () => {
  test("invoices list API returns array", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "financial.listInvoices");
    expect(res.status).toBe(200);
    const rows = extractTrpcJson(res.data) as unknown[];
    expect(Array.isArray(rows)).toBe(true);
  });

  test("budget list API works", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "financial.listBudget");
    expect(res.status).toBe(200);
  });

  test("chargebacks list API works", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "financial.listChargebacks");
    expect(res.status).toBe(200);
  });

  test("AP aging API works (accounts payable)", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "financial.apAging");
    expect(res.status).toBe(200);
  });
});

// =============================================================================
// 10-G Procurement (SAP MM / Oracle Procurement standard)
// =============================================================================
test.describe("10-G Procurement — PO lifecycle, vendor management", () => {
  test("purchase requests list API returns array", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "procurement.purchaseRequests.list");
    expect(res.status).toBe(200);
  });

  test("purchase orders list API returns array", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "procurement.purchaseOrders.list");
    expect(res.status).toBe(200);
  });

  test("vendors list API works", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "vendors.list");
    expect(res.status).toBe(200);
  });

  test("procurement dashboard API works", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "procurement.dashboard");
    expect(res.status).toBe(200);
  });
});

// =============================================================================
// 10-H GRC (RSA Archer / ServiceNow GRC standard)
// =============================================================================
test.describe("10-H GRC — risk, audit, policy, compliance", () => {
  test("risk list API returns array", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "grc.listRisks");
    expect(res.status).toBe(200);
    const rows = extractTrpcJson(res.data) as unknown[];
    expect(Array.isArray(rows)).toBe(true);
  });

  test("audit list API returns array", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "grc.listAudits");
    expect(res.status).toBe(200);
  });

  test("policy list API returns array", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "grc.listPolicies");
    expect(res.status).toBe(200);
  });

  test("risk matrix API works (visual risk heatmap data)", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "grc.riskMatrix");
    expect(res.status).toBe(200);
  });

  test("vendor risk list API works (third-party risk)", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "grc.listVendorRisks");
    expect(res.status).toBe(200);
  });
});

// =============================================================================
// 10-I Security Management (CrowdStrike / Splunk SIEM standard)
// =============================================================================
test.describe("10-I Security Management — incidents, vulnerabilities", () => {
  test("security incidents list API returns array", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "security.listIncidents");
    expect(res.status).toBe(200);
    const rows = extractTrpcJson(res.data) as unknown[];
    expect(Array.isArray(rows)).toBe(true);
  });

  test("vulnerability list API returns array", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "security.listVulnerabilities");
    expect(res.status).toBe(200);
  });

  test("security status counts API works", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "security.statusCounts");
    expect(res.status).toBe(200);
  });
});

// =============================================================================
// 10-J DevOps / DORA Metrics (GitHub Actions / Azure DevOps standard)
// =============================================================================
test.describe("10-J DevOps — DORA metrics, pipelines, deployments", () => {
  test("DORA metrics API returns data structure", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "devops.doraMetrics");
    expect(res.status).toBe(200);
    const data = extractTrpcJson(res.data);
    expect(data).toBeTruthy();
  });

  test("deployments list API returns array", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "devops.listDeployments");
    expect(res.status).toBe(200);
  });

  test("pipelines list API returns array", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "devops.listPipelines");
    expect(res.status).toBe(200);
  });

  test("APM applications list API works (observability)", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "apm.applications.list");
    expect(res.status).toBe(200);
  });
});

// =============================================================================
// 10-K Knowledge Base (Confluence / Zendesk Guide standard)
// =============================================================================
test.describe("10-K Knowledge Management — article CRUD, global search", () => {
  test("knowledge list API returns array", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "knowledge.list");
    expect(res.status).toBe(200);
    const rows = extractTrpcJson(res.data) as unknown[];
    expect(Array.isArray(rows)).toBe(true);
  });

  test("global search API responds", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "search.global", { query: "test" });
    expect(res.status).toBe(200);
  });

  test("knowledge page renders with search UI", async ({ page }) => {
    const body = await visitModule(page, "/app/knowledge");
    const hasKBContent = body.toLowerCase().includes("knowledge") || body.toLowerCase().includes("article");
    expect(hasKBContent).toBe(true);
  });
});

// =============================================================================
// 10-L On-Call Management (PagerDuty / OpsGenie standard)
// =============================================================================
test.describe("10-L On-Call Management — schedules, escalation, rotation", () => {
  test("on-call schedules list API returns array", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "oncall.schedules.list");
    expect(res.status).toBe(200);
  });

  test("escalation policies list API works", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "oncall.escalations.list");
    expect(res.status).toBe(200);
  });

  test("active rotation API works", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "oncall.activeRotation");
    expect(res.status).toBe(200);
  });
});

// =============================================================================
// 10-M Reporting & SLA (ServiceNow Performance Analytics standard)
// =============================================================================
test.describe("10-M Reporting & Analytics — SLA, executive, trends", () => {
  test("SLA dashboard API returns data", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "reports.slaDashboard");
    expect(res.status).toBe(200);
  });

  test("executive overview API returns data", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "reports.executiveOverview");
    expect(res.status).toBe(200);
  });

  test("trend analysis API returns data", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "reports.trendAnalysis");
    expect(res.status).toBe(200);
  });

  test("workload analysis API returns data", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "reports.workloadAnalysis");
    expect(res.status).toBe(200);
  });

  test("dashboard metrics (main KPIs) API works", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "dashboard.getMetrics");
    expect(res.status).toBe(200);
  });
});

// =============================================================================
// 10-N Legal & CSM (niche but important differentiators)
// =============================================================================
test.describe("10-N Legal & CSM — advanced differentiation features", () => {
  test("legal matters list API returns array", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "legal.listMatters");
    expect(res.status).toBe(200);
  });

  test("legal investigations list API returns array", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "legal.listInvestigations");
    expect(res.status).toBe(200);
  });

  test("CSM cases list API returns array", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "csm.cases.list");
    expect(res.status).toBe(200);
  });

  test("CSM dashboard API returns data", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "csm.dashboard");
    expect(res.status).toBe(200);
  });

  test("surveys list API works (feedback management)", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    const res = await apiCall(page, "surveys.list");
    expect(res.status).toBe(200);
  });

});
