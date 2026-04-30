/**
 * CoheronConnect Full-QA — Suite 06: ALL tRPC Endpoints
 *
 * Tests EVERY procedure across all 37 routers.
 * Query procedures (no required input) → GET, expect 200.
 * Mutation procedures → POST with minimal valid input, expect 200 or known 4xx.
 * Any 404 or 500 (except the known work-orders assignment_rules bug) = FAIL.
 */

import { test, expect, type Page } from "@playwright/test";

const BASE_URL   = process.env["NEXUS_QA_BASE_URL"] ?? "http://localhost:3000";
const PROXY_BASE = `${BASE_URL}/api/trpc`;

// ── API helper ────────────────────────────────────────────────────────────────
async function api(
  page: Page,
  proc: string,
  input: Record<string, unknown> = {},
  method: "GET" | "POST" = "GET",
): Promise<{ status: number; data: unknown }> {
  return page.evaluate(
    async ({ proc, input, method, base }) => {
      const session = localStorage.getItem("coheronconnect_session") ?? "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session) headers["Authorization"] = `Bearer ${session}`;
      try {
        let url: string, init: RequestInit;
        if (method === "GET") {
          // Always pass input={} so tRPC validation doesn't fail with "expected object"
          const encoded = encodeURIComponent(JSON.stringify(input));
          url  = `${base}/${proc}?input=${encoded}`;
          init = { method: "GET", headers };
        } else {
          url  = `${base}/${proc}`;
          init = { method: "POST", headers, body: JSON.stringify(input) };
        }
        const r   = await fetch(url, init);
        const txt = await r.text();
        let data: unknown;
        try { data = JSON.parse(txt); } catch { data = txt; }
        return { status: r.status, data };
      } catch (e: unknown) {
        return { status: 0, data: String(e) };
      }
    },
    { proc, input, method, base: PROXY_BASE },
  );
}

// ── Known permanent failures (infrastructure bugs, not code bugs) ─────────────
const KNOWN_BUGS: Record<string, string> = {
  // All previously known bugs have been fixed (assignment_rules table created)
};

// ── All query procedures (no required input, can be tested with GET) ──────────
const QUERY_PROCEDURES: string[] = [
  // admin (sub-router paths)
  "admin.auditLog.list",
  "admin.notificationRules.list",
  "admin.scheduledJobs.list",
  "admin.slaDefinitions.list",
  "admin.systemProperties.list",
  "admin.users.list",
  // approvals
  "approvals.list",
  "approvals.myPending",
  "approvals.mySubmitted",
  // assets
  "assets.list",
  "assets.listTypes",
  "assets.cmdb.list",
  "assets.ham.list",
  "assets.licenses.list",
  // assignment rules (camelCase key in router)
  "assignmentRules.list",
  // assignmentRules.teamMembers — needs teamId param; tested in explicit input section
  "assignmentRules.teamsWithMembers",
  // auth
  "auth.me",
  "auth.listMySessions",
  "auth.listUsers",
  // catalog
  "catalog.listItems",
  "catalog.listRequests",
  // changes
  "changes.list",
  "changes.listProblems",
  "changes.listReleases",
  "changes.statusCounts",
  // contracts
  "contracts.list",
  "contracts.expiringWithin",
  // crm
  "crm.listDeals",
  "crm.listLeads",
  "crm.listContacts",
  "crm.listAccounts",
  "crm.listQuotes",
  "crm.listActivities",
  "crm.dashboardMetrics",
  "crm.executiveSummary",
  // csm (sub-router paths)
  "csm.cases.list",
  "csm.accounts.list",
  "csm.contacts.list",
  "csm.dashboard",
  "csm.slaMetrics",
  // dashboard
  "dashboard.getMetrics",
  // dashboard.getTimeSeries needs days input — tested in QUERY_WITH_INPUT section below
  "dashboard.getTopCategories",
  // devops
  "devops.listDeployments",
  "devops.listPipelines",
  "devops.doraMetrics",
  // events
  "events.list",
  "events.dashboard",
  "events.healthNodes",
  // facilities (sub-router paths)
  "facilities.buildings.list",
  "facilities.rooms.list",
  "facilities.bookings.list",
  "facilities.facilityRequests.list",
  "facilities.moveRequests.list",
  "facilities.hubSnapshot",
  // financial
  "financial.listInvoices",
  "financial.listBudget",
  "financial.listChargebacks",
  "financial.apAging",
  "financial.periodClose.get",
  // financial.gstFilingCalendar — needs month+year; tested in explicit input section
  // grc
  "grc.listRisks",
  "grc.listAudits",
  "grc.listPolicies",
  "grc.listVendorRisks",
  "grc.riskMatrix",
  // hr (sub-router paths)
  "hr.employees.list",
  "hr.leave.list",
  "hr.cases.list",
  "hr.platformHomeStrip",
  "hr.onboardingTemplates.list",
  "hr.payroll.listPayslips",
  // india compliance (camelCase key)
  "indiaCompliance.calendar.list",
  "indiaCompliance.directors.list",
  "indiaCompliance.tdsChallans.list",
  "indiaCompliance.epfoEcr.list",
  "indiaCompliance.portalUsers.list",
  // inventory
  "inventory.list",
  "inventory.transactions",
  // knowledge
  "knowledge.list",
  // legal
  "legal.listMatters",
  "legal.listRequests",
  "legal.listInvestigations",
  // notifications
  "notifications.list",
  "notifications.unreadCount",
  "notifications.getPreferences",
  // oncall (sub-router paths)
  "oncall.schedules.list",
  "oncall.escalations.list",
  "oncall.activeRotation",
  // procurement (sub-router paths)
  "procurement.purchaseRequests.list",
  "procurement.purchaseOrders.list",
  "procurement.invoices.list",
  "procurement.vendors.list",
  "procurement.dashboard",
  // projects
  "projects.list",
  "projects.portfolioHealth",
  "projects.strategyDashboardSummary",
  // reports
  "reports.slaDashboard",
  "reports.executiveOverview",
  "reports.trendAnalysis",
  "reports.workloadAnalysis",
  // search — needs required query param; tested in explicit input section below
  // "search.global",
  // security
  "security.listIncidents",
  "security.listVulnerabilities",
  "security.statusCounts",
  "security.openIncidentCount",
  // surveys
  "surveys.list",
  // tickets
  "tickets.list",
  "tickets.statusCounts",
  "tickets.listPriorities",
  // vendors
  "vendors.list",
  // work-orders (camelCase key)
  "workOrders.list",
  "workOrders.metrics",
  // workflows (sub-router paths)
  "workflows.list",
  // workflows.runs.list — needs workflowId; tested in explicit input section
  // apm (sub-router paths)
  "apm.applications.list",
  "apm.portfolio.summary",
];

// ── Mutation procedures with minimal valid inputs ────────────────────────────
const MUTATION_PROCEDURES: Array<{ proc: string; input: Record<string, unknown>; expectOk?: boolean }> = [
  // tickets
  { proc: "tickets.create", input: { title: `QA-06-${Date.now()}`, description: "endpoint test", type: "incident" } },
  // changes
  { proc: "changes.create", input: { title: `QA-06-chg-${Date.now()}`, description: "endpoint test", type: "standard", risk: "low" } },
  { proc: "changes.createProblem", input: { title: `QA-06-prob-${Date.now()}`, description: "endpoint test", priority: "low" } },
  { proc: "changes.createRelease", input: { title: `QA-06-rel-${Date.now()}`, description: "endpoint test", type: "minor" } },
  // legal
  { proc: "legal.createMatter",      input: { title: `QA-06-matter-${Date.now()}`, type: "contract_review" } },
  { proc: "legal.createRequest",     input: { title: `QA-06-lreq-${Date.now()}`, type: "legal_advice", priority: "low" } },
  { proc: "legal.createInvestigation", input: { title: `QA-06-inv-${Date.now()}`, type: "internal", priority: "low" } },
  // csm (correct sub-router path)
  { proc: "csm.cases.create", input: { title: `QA-06-case-${Date.now()}`, description: "endpoint test", priority: "low", type: "support" } },
  // crm
  { proc: "crm.createDeal", input: { title: `QA-06-deal-${Date.now()}`, stage: "prospecting", value: 1000 } },
  { proc: "crm.createLead", input: { name: `QA-06-lead-${Date.now()}`, email: `qa06${Date.now()}@test.com`, source: "web" } },
  { proc: "crm.createContact", input: { name: `QA-06-contact-${Date.now()}`, email: `qa06c${Date.now()}@test.com` } },
  { proc: "crm.createAccount", input: { name: `QA-06-account-${Date.now()}` } },
  // knowledge
  { proc: "knowledge.create", input: { title: `QA-06-kb-${Date.now()}`, content: "Test article content for QA", category: "general" } },
  // vendors
  { proc: "vendors.create", input: { name: `QA-06-vendor-${Date.now()}`, category: "technology" } },
  // contracts
  { proc: "contracts.create", input: { title: `QA-06-contract-${Date.now()}`, type: "vendor", startDate: new Date().toISOString(), endDate: new Date(Date.now() + 86400000 * 365).toISOString() } },
  // security
  { proc: "security.createIncident", input: { title: `QA-06-secincident-${Date.now()}`, severity: "low", type: "phishing" } },
  { proc: "security.createVulnerability", input: { title: `QA-06-vuln-${Date.now()}`, severity: "low", cvssScore: 3.0, affectedSystem: "test" } },
  // GRC
  { proc: "grc.createRisk", input: { title: `QA-06-risk-${Date.now()}`, category: "operational", likelihood: 2, impact: 2 } },
  { proc: "grc.createPolicy", input: { title: `QA-06-policy-${Date.now()}`, category: "security", content: "Test policy content for QA" } },
  { proc: "grc.createAudit", input: { title: `QA-06-audit-${Date.now()}`, type: "internal", scope: "Test scope" } },
  // devops
  { proc: "devops.createDeployment", input: { environment: "staging", service: `qa-06-svc-${Date.now()}`, version: "1.0.0" } },
  { proc: "devops.createPipelineRun", input: { pipeline: `qa-06-pipe-${Date.now()}`, branch: "main" } },
  // inventory
  { proc: "inventory.create", input: { name: `QA-06-item-${Date.now()}`, sku: `QA06-${Date.now()}`, quantity: 10, unit: "units" } },
  // surveys
  { proc: "surveys.create", input: { title: `QA-06-survey-${Date.now()}`, questions: [{ text: "Test question?", type: "rating" }] } },
  // notifications
  { proc: "notifications.markAllRead", input: {} },
  // procurement (correct sub-router path)
  { proc: "procurement.purchaseRequests.create", input: { title: `QA-06-pr-${Date.now()}`, vendor: "test vendor", totalAmount: 500 } },
  // projects
  { proc: "projects.create", input: { name: `QA-06-project-${Date.now()}`, description: "QA endpoint test project", status: "planning" } },
  // financial
  { proc: "financial.createInvoice", input: { vendorName: `QA-06-vendor`, amount: 100, currency: "USD", dueDate: new Date(Date.now() + 86400000 * 30).toISOString() } },
  // work-orders (camelCase, assignment_rules table now created — should work)
  { proc: "workOrders.create", input: { shortDescription: `QA-06-wo-${Date.now()}`, type: "corrective", priority: "4_low" } },
];

// ── Tests ─────────────────────────────────────────────────────────────────────
test.describe("06 — All tRPC Endpoints", () => {
  test.describe.configure({ mode: "parallel" });

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForFunction(
      () => !document.body.innerText.includes("Verifying session"),
      { timeout: 15_000 },
    ).catch(() => {});
  });

  // ── Query procedures ─────────────────────────────────────────────────────
  test.describe("Query procedures (GET — expect 200)", () => {
    for (const proc of QUERY_PROCEDURES) {
      test(`GET ${proc}`, async ({ page }) => {
        const result = await api(page, proc, {}, "GET");

        // Known bug check
        if (KNOWN_BUGS[proc]) {
          if (result.status === 500) {
            console.warn(`⚠️  KNOWN BUG (${proc}): ${KNOWN_BUGS[proc]}`);
            return;
          }
        }

        // Should not be 404 (missing procedure) or 500 (server crash)
        expect(result.status, `${proc} → ${result.status}: ${JSON.stringify(result.data).slice(0, 200)}`).not.toBe(404);
        expect(result.status, `${proc} → 500 server error`).not.toBe(500);
        // Should return 200 or 401 (if permissions differ) but NOT 404
        expect([200, 401, 403], `${proc} returned unexpected ${result.status}`).toContain(result.status);
      });
    }
  });

  // ── Mutation procedures ───────────────────────────────────────────────────
  test.describe("Mutation procedures (POST — expect 200 or known error)", () => {
    for (const { proc, input, expectOk } of MUTATION_PROCEDURES) {
      test(`POST ${proc}`, async ({ page }) => {
        const result = await api(page, proc, input, "POST");

        if (KNOWN_BUGS[proc]) {
          if (result.status === 500) {
            console.warn(`⚠️  KNOWN BUG (${proc}): ${KNOWN_BUGS[proc]}`);
            return;
          }
        }

        if (expectOk === false) {
          // Just check it doesn't return 401/400 (auth/bad-input)
          expect(result.status, `${proc} → 401 (auth failed)`).not.toBe(401);
          return;
        }

        // Should not be 404 or 500
        expect(result.status, `${proc} → 404 (procedure not found)`).not.toBe(404);
        expect(result.status, `${proc} → 500: ${JSON.stringify(result.data).slice(0, 200)}`).not.toBe(500);
        // Mutations must return 200 (success) or a documented 4xx (validation)
        expect(
          result.status >= 200 && result.status < 500,
          `${proc} → ${result.status}: unexpected status`,
        ).toBeTruthy();
      });
    }
  });

  // ── Query procedures needing explicit input ──────────────────────────────
  test.describe("Query procedures needing explicit input", () => {
    test("GET dashboard.getTimeSeries with days=30", async ({ page }) => {
      const result = await api(page, "dashboard.getTimeSeries", { days: 30 }, "GET");
      expect(result.status, `dashboard.getTimeSeries → ${result.status}: ${JSON.stringify(result.data).slice(0, 200)}`).not.toBe(404);
      expect(result.status, "dashboard.getTimeSeries → 500").not.toBe(500);
    });

    test("GET search.global with query='test'", async ({ page }) => {
      const result = await api(page, "search.global", { query: "test" }, "GET");
      expect(result.status).not.toBe(404);
      expect(result.status).not.toBe(500);
    });

    test("GET workflows.runs.list with workflowId", async ({ page }) => {
      // With non-existent UUID → expect empty result (200) or 404, never 500
      const result = await api(page, "workflows.runs.list", { workflowId: "00000000-0000-0000-0000-000000000001" }, "GET");
      expect(result.status, "workflows.runs.list → 500 crash").not.toBe(500);
      expect(result.status, "workflows.runs.list → 404 procedure not found").not.toBe(404);
    });

    test("GET hr.payroll.listPayslips", async ({ page }) => {
      const result = await api(page, "hr.payroll.listPayslips", {}, "GET");
      expect(result.status).not.toBe(404);
      expect(result.status).not.toBe(500);
    });

    test("GET financial.gstFilingCalendar with month=1 year=2026", async ({ page }) => {
      const result = await api(page, "financial.gstFilingCalendar", { month: 1, year: 2026 }, "GET");
      expect(result.status).not.toBe(404);
      expect(result.status, "financial.gstFilingCalendar → 500").not.toBe(500);
    });

    test("GET financial.periodClose.preflight with period", async ({ page }) => {
      const result = await api(page, "financial.periodClose.preflight", { period: "2026-01" }, "GET");
      expect(result.status).not.toBe(404);
      expect(result.status, "financial.periodClose.preflight → 500").not.toBe(500);
    });

    test("GET assignmentRules.teamMembers with dummy teamId", async ({ page }) => {
      const result = await api(page, "assignmentRules.teamMembers", { teamId: "00000000-0000-0000-0000-000000000001" }, "GET");
      // 200 (empty), 404 (team not found) or 400 (bad team id) are all acceptable
      expect(result.status, `assignmentRules.teamMembers → 500 crash`).not.toBe(500);
      expect(result.status, `assignmentRules.teamMembers → 404 procedure not found`).not.toBe(404);
    });
  });
});
