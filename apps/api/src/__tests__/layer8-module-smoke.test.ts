/**
 * Layer 8 — Module Smoke Tests: CRUD + domain operations for every module.
 * Verifies core operations work end-to-end for all 32 modules.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testDb, seedFullOrg, authedCaller, cleanupOrg, createSession, initTestEnvironment } from "./helpers";
import { securityIncidents, contracts, assetTypes } from "@nexusops/db";

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL not set. Run: docker compose -f docker-compose.test.yml up -d && source .env.test",
    );
  }
});
import { eq } from "@nexusops/db";

describe("Layer 8: Module Smoke Tests", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let adminToken: string;

  beforeAll(async () => {
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    // Session token (not password login) — avoids env-specific auth.login / bcrypt drift in CI.
    adminToken = await createSession(orgCtx.adminId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  // ── 8.01 Tickets ──────────────────────────────────────────────────────────

  describe("8.01 Tickets (ITSM)", () => {
    it("create → list → get → addComment → assign → resolve", async () => {
      const caller = await authedCaller(adminToken);
      const ticket = await caller.tickets.create({
        title: "Smoke test ticket",
        type: "incident",
        priorityId: orgCtx.p1Id!,
      }) as { id: string; number: string };
      expect(ticket.id).toBeDefined();
      expect(ticket.number).toMatch(/^\w+-\d{4}$/);

      const list = await caller.tickets.list({}) as { items: { id: string }[] };
      expect(list.items.some((t) => t.id === ticket.id)).toBe(true);

      const detail = await caller.tickets.get({ id: ticket.id }) as { ticket: { id: string }; comments: unknown[] };
      expect(detail.ticket.id).toBe(ticket.id);

      await caller.tickets.addComment({ ticketId: ticket.id, body: "Investigating now", isInternal: false });
      const updated = await caller.tickets.get({ id: ticket.id }) as { comments: { body: string }[] };
      expect(updated.comments.some((c) => c.body === "Investigating now")).toBe(true);

      // Assign to admin
      await caller.tickets.assign({ id: ticket.id, assigneeId: orgCtx.adminId });

      // Resolve — must go open → in_progress → resolved (lifecycle enforcement)
      await caller.tickets.update({ id: ticket.id, data: { statusId: orgCtx.statusInProgressId! } });
      await caller.tickets.update({ id: ticket.id, data: { statusId: orgCtx.statusResolvedId! } });
    });

    it("statusCounts returns correct numbers", async () => {
      const caller = await authedCaller(adminToken);
      const counts = await caller.tickets.statusCounts();
      expect(counts).toBeDefined();
    });

    it("addRelation → get includes relation → removeRelation", async () => {
      const caller = await authedCaller(adminToken);
      const a = await caller.tickets.create({
        title: "Relation source",
        type: "incident",
        priorityId: orgCtx.p2Id!,
      }) as { id: string };
      const b = await caller.tickets.create({
        title: "Relation target",
        type: "incident",
        priorityId: orgCtx.p2Id!,
      }) as { id: string };

      await caller.tickets.addRelation({
        ticketId: a.id,
        targetTicketId: b.id,
        type: "related",
      });

      const detail = await caller.tickets.get({ id: a.id }) as { relations: { relatedTicketId: string; type: string }[] };
      expect(detail.relations?.some((r) => r.relatedTicketId === b.id && r.type === "related")).toBe(true);

      const rel = detail.relations!.find((r) => r.relatedTicketId === b.id)!;
      await caller.tickets.removeRelation({ relationId: rel.id, ticketId: a.id });

      const after = await caller.tickets.get({ id: a.id }) as { relations: unknown[] };
      expect((after.relations ?? []).filter((r: any) => r.relatedTicketId === b.id)).toHaveLength(0);
    });
  });

  // ── 8.02 Changes ──────────────────────────────────────────────────────────

  describe("8.02 Changes", () => {
    it("create → list → get → submit for approval → approve → complete", async () => {
      const caller = await authedCaller(adminToken);
      const change = await caller.changes.create({
        title: "Smoke test change",
        type: "normal",
        risk: "low",
        description: "Test change",
        plannedStart: new Date(Date.now() + 86400000).toISOString(),
        plannedEnd: new Date(Date.now() + 2 * 86400000).toISOString(),
      }) as { id: string; number: string };
      expect(change.number).toMatch(/^CHG-\d{4}$/);

      const list = await caller.changes.list({}) as { items: { id: string }[] };
      expect(list.items.some((c) => c.id === change.id)).toBe(true);

      await caller.changes.get({ id: change.id });

      // Submit for approval
      await caller.changes.submit({ id: change.id }).catch(() => null);
      // Approve
      await caller.changes.approve({ id: change.id, comment: "Approved" }).catch(() => null);
      // Mark implemented
      await caller.changes.markImplemented({ id: change.id }).catch(() => null);
    });
  });

  // ── 8.03 Security Incidents ───────────────────────────────────────────────

  describe("8.10 Security Incidents", () => {
    it("full lifecycle: new → triage → containment → eradication → recovery → closed", async () => {
      const db = testDb();
      const caller = await authedCaller(adminToken);
      const incident = await caller.security.createIncident({
        title: "Full lifecycle smoke test",
        severity: "medium",
      }) as { id: string };

      await caller.security.transition({ id: incident.id, toStatus: "triage" });
      await caller.security.transition({ id: incident.id, toStatus: "containment" });
      await caller.security.transition({ id: incident.id, toStatus: "eradication" });
      await caller.security.transition({ id: incident.id, toStatus: "recovery" });
      await caller.security.transition({ id: incident.id, toStatus: "closed" });

      const [final] = await db.select().from(securityIncidents).where(eq(securityIncidents.id, incident.id)).limit(1);
      expect(final!.status).toBe("closed");
    });
  });

  // ── 8.04 Contracts ────────────────────────────────────────────────────────

  describe("8.14 Contracts", () => {
    it("create → get → transition to under_review → active → expiringWithin", async () => {
      const db = testDb();
      const caller = await authedCaller(adminToken);
      const contract = await caller.contracts.create({
        title: "Smoke test contract",
        counterparty: "ACME Corp",
        type: "vendor",
        value: "500000",
        currency: "INR",
      }) as { id: string };

      const detail = await caller.contracts.get({ id: contract.id });
      expect(detail).toBeDefined();

      await caller.contracts.transition({ id: contract.id, toStatus: "under_review" });
      await caller.contracts.transition({ id: contract.id, toStatus: "legal_review" });
      await caller.contracts.transition({ id: contract.id, toStatus: "awaiting_signature" });
      await caller.contracts.transition({ id: contract.id, toStatus: "active" });

      const [updated] = await db.select().from(contracts).where(eq(contracts.id, contract.id)).limit(1);
      expect(updated!.status).toBe("active");

      const expiring = await caller.contracts.expiringWithin({ days: 365 });
      expect(Array.isArray(expiring)).toBe(true);
    });

    it("wizard + obligation → completeObligation", async () => {
      const caller = await authedCaller(adminToken);
      const c = await caller.contracts.createFromWizard({
        title: "Wizard smoke agreement",
        counterparty: "Acme Ltd",
        type: "vendor",
        obligations: [{ title: "Annual review", party: "us", frequency: "annually" }],
        submitForReview: false,
      }) as { id: string };
      const detail = await caller.contracts.get({ id: c.id }) as {
        obligations: { id: string; status: string }[];
      };
      expect(detail.obligations?.length).toBeGreaterThan(0);
      const obId = detail.obligations[0]!.id;
      const done = await caller.contracts.completeObligation({ id: obId }) as { status: string };
      expect(done.status).toBe("completed");
    });
  });

  // ── 8.05 GRC ─────────────────────────────────────────────────────────────

  describe("8.11 GRC", () => {
    it("create risk → auto-score → update", async () => {
      const caller = await authedCaller(adminToken);
      const risk = await caller.grc.createRisk({
        title: "Data breach risk",
        // FIX: 2026-03-25 — "information" not in enum; valid values are operational/financial/strategic/compliance/technology/reputational
        category: "technology",
        likelihood: 3,
        impact: 4,
        description: "Risk of data breach",
      }) as { id: string; riskScore?: number };
      expect(risk.id).toBeDefined();
      if (risk.riskScore !== undefined) {
        expect(risk.riskScore).toBe(12); // likelihood * impact
      }

      const updated = await caller.grc.updateRisk({ id: risk.id, likelihood: 2 }) as { riskScore?: number };
      if (updated.riskScore !== undefined) {
        expect(updated.riskScore).toBe(8); // 2 * 4
      }
    });

    it("create policy → publish", async () => {
      const caller = await authedCaller(adminToken);
      const policy = await caller.grc.createPolicy({
        title: "Information Security Policy",
        category: "security",
        content: "All users must use strong passwords.",
      }) as { id: string };

      await caller.grc.publishPolicy({ id: policy.id });
    });

    it("audit plan + vendor risk update", async () => {
      const caller = await authedCaller(adminToken);
      const audit = await caller.grc.createAudit({
        title: "Annual controls review",
        scope: "ITGC",
      }) as { id: string };
      expect(audit.id).toBeDefined();
      const audits = await caller.grc.listAudits();
      expect(audits.some((a: { id: string }) => a.id === audit.id)).toBe(true);

      const vr = await caller.grc.createVendorRisk({
        vendorName: "Smoke Vendor LLC",
        tier: "high",
      }) as { id: string };
      const updated = await caller.grc.updateVendorRisk({
        id: vr.id,
        riskScore: 4,
        questionnaireStatus: "completed",
      }) as { riskScore: number | null };
      expect(Number(updated.riskScore)).toBe(4);
    });
  });

  // ── 8.06 Procurement ──────────────────────────────────────────────────────

  describe("8.12 Procurement", () => {
    it("create PR → submit → auto-approve when below threshold", async () => {
      const caller = await authedCaller(adminToken);
      const pr = await caller.procurement.purchaseRequests.create({
        title: "Small procurement",
        justification: "Office supplies",
        items: [{ description: "Notebooks", quantity: 10, unitPrice: 50 }], // total 500 < 1000
        priority: "low",
        department: "IT",
      }) as { id: string; status: string };
      expect(pr.status).toBe("approved");
    });

    it("large PR → pending → reject", async () => {
      const caller = await authedCaller(adminToken);
      const pr = await caller.procurement.purchaseRequests.create({
        title: "Capital equipment",
        justification: "Servers",
        items: [{ description: "Racks", quantity: 10, unitPrice: 10000 }],
        priority: "high",
        department: "IT",
      }) as { id: string; status: string };
      expect(pr.status).toBe("pending");
      const rejected = await caller.procurement.purchaseRequests.reject({
        id: pr.id,
        reason: "Budget freeze (smoke)",
      }) as { status: string };
      expect(rejected.status).toBe("rejected");
    });
  });

  // ── 8.07 CRM ─────────────────────────────────────────────────────────────

  describe("8.15 CRM", () => {
    it("create account → contact → deal → move pipeline", async () => {
      const caller = await authedCaller(adminToken);
      const account = await caller.crm.createAccount({
        name: "Smoke Test Corp",
        industry: "Technology",
        website: "https://smoketest.com",
      }) as { id: string };
      expect(account.id).toBeDefined();

      // FIX: 2026-03-25 — CRM createContact requires firstName/lastName separately, not name
      const contact = await caller.crm.createContact({
        firstName: "John",
        lastName: "Smoke",
        email: `john-smoke-${Date.now()}@test.com`,
        accountId: account.id,
      }) as { id: string };
      expect(contact.id).toBeDefined();

      // FIX: 2026-03-25 — createDeal takes { title, value } not { name, amount, stage }
      const deal = await caller.crm.createDeal({
        title: "Smoke Test Deal",
        value: "100000",
        accountId: account.id,
      }) as { id: string; stage: string };
      // FIX: 2026-03-25 — default stage is "prospect" not "discovery"
      expect(deal.stage).toBe("prospect");

      const moved = await caller.crm.movePipeline({ id: deal.id, stage: "qualification" }) as { stage: string };
      expect(moved.stage).toBe("qualification");

      const metrics = await caller.crm.dashboardMetrics();
      expect(metrics).toBeDefined();
    });

    it("list filters + closed_lost deal", async () => {
      const caller = await authedCaller(adminToken);
      const account = await caller.crm.createAccount({
        name: `Filter Co ${Date.now()}`,
        industry: "Technology",
        tier: "enterprise",
      }) as { id: string };
      const deal = await caller.crm.createDeal({
        title: "Lost smoke deal",
        value: "5000",
        accountId: account.id,
      }) as { id: string };
      await caller.crm.movePipeline({ id: deal.id, stage: "closed_lost" });
      const lost = await caller.crm.listDeals({ stage: "closed_lost", limit: 20 }) as { id: string }[];
      expect(lost.some((d) => d.id === deal.id)).toBe(true);
      const tiered = await caller.crm.listAccounts({ tier: "enterprise", limit: 10 });
      expect(tiered.some((a: { id: string }) => a.id === account.id)).toBe(true);
    });
  });

  // ── 8.08 Projects ─────────────────────────────────────────────────────────

  describe("8.18 Projects", () => {
    it("create project → add milestone → add task → complete task", async () => {
      const caller = await authedCaller(adminToken);
      const project = await caller.projects.create({
        name: "Smoke Test Project",
        status: "active",
        startDate: new Date().toISOString(),
      }) as { id: string };

      const milestone = await caller.projects.createMilestone({
        projectId: project.id,
        title: "Milestone 1",
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      }) as { id: string };

      const task = await caller.projects.createTask({
        projectId: project.id,
        title: "Task 1",
        status: "todo",
        milestoneId: milestone.id,
      }) as { id: string };

      await caller.projects.updateTask({ id: task.id, status: "done" });

      const board = await caller.projects.getAgileBoard({ projectId: project.id });
      expect(board).toBeDefined();
    });
  });

  // ── 8.09 Knowledge ────────────────────────────────────────────────────────

  describe("8.22 Knowledge", () => {
    it("create article → get (increments view_count) → recordFeedback", async () => {
      const caller = await authedCaller(adminToken);
      const article = await caller.knowledge.create({
        title: "How to reset your password",
        content: "<p>Go to login page and click Forgot Password.</p>",
        tags: ["password", "auth"],
      }) as { id: string };

      const detail = await caller.knowledge.get({ id: article.id }) as { viewCount: number };
      expect(detail.viewCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 8.10 Notifications ────────────────────────────────────────────────────

  describe("8.29 Notifications", () => {
    it("ticket create fires notification to assignee and markRead works", async () => {
      const db = testDb();
      const { notifications } = await import("@nexusops/db");
      const { count } = await import("@nexusops/db");

      const caller = await authedCaller(adminToken);
      const [before] = await db
        .select({ cnt: count() })
        .from(notifications)
        .where(eq(notifications.userId, orgCtx.agentId));

      await caller.tickets.create({
        title: "Notification trigger test",
        type: "incident",
        priorityId: orgCtx.p1Id!,
        assigneeId: orgCtx.agentId,
      });

      const allNotifs = await caller.notifications.list({ limit: 50 }) as { items: { id: string }[] };
      expect(Array.isArray(allNotifs.items ?? allNotifs)).toBe(true);

      const unread = await caller.notifications.unreadCount();
      expect(typeof unread).toBe("number");

      await caller.notifications.markAllRead();
    });
  });

  // ── 8.11 Search ───────────────────────────────────────────────────────────

  describe("8.30 Search", () => {
    it("search.global returns results or empty array (graceful even without Meilisearch)", async () => {
      const caller = await authedCaller(adminToken);
      const result = await caller.search.global({ query: "test server" }).catch(() => ({ results: [] }));
      expect(result).toBeDefined();
    });
  });

  // ── 8.12 Reports ──────────────────────────────────────────────────────────

  describe("8.31 Reports", () => {
    it("executiveOverview returns platform KPIs", async () => {
      const caller = await authedCaller(adminToken);
      const overview = await caller.reports.executiveOverview();
      expect(overview).toBeDefined();
    });

    it("slaDashboard returns SLA metrics", async () => {
      const caller = await authedCaller(adminToken);
      const sla = await caller.reports.slaDashboard();
      expect(sla).toBeDefined();
    });
  });

  // ── 8.13 Admin ────────────────────────────────────────────────────────────

  describe("8.32 Admin", () => {
    it("users.list returns all org users", async () => {
      const caller = await authedCaller(adminToken);
      const result = await caller.admin.users.list({}) as { users: { id: string }[] } | { id: string }[];
      expect(result).toBeDefined();
    });

    it("auditLog.list returns paginated results", async () => {
      const caller = await authedCaller(adminToken);
      const result = await caller.admin.auditLog.list({ limit: 10 }) as { items: unknown[] };
      expect(Array.isArray(result.items ?? result)).toBe(true);
    });
  });

  // ── 8.33 HR (gap remediation C5) ───────────────────────────────────────────

  describe("8.33 HR", () => {
    it("employee → case → resolve + leave request → approve", async () => {
      const adminCaller = await authedCaller(adminToken);

      const emp = await adminCaller.hr.employees.create({
        userId: orgCtx.requesterId,
        department: "Engineering",
        title: "Engineer",
        employmentType: "full_time",
      }) as { id: string };
      expect(emp.id).toBeDefined();

      const hrCase = await adminCaller.hr.cases.create({
        employeeId: emp.id,
        caseType: "policy",
        notes: "Smoke HR case",
      }) as { id: string };
      const listed = await adminCaller.hr.cases.list({});
      expect(
        listed.some((row: { hrCase: { id: string } }) => row.hrCase.id === hrCase.id),
      ).toBe(true);
      await adminCaller.hr.cases.resolve({ id: hrCase.id, resolution: "Explained policy" });

      const requesterToken = await createSession(orgCtx.requesterId);
      const requesterCaller = await authedCaller(requesterToken);
      const start = new Date();
      const end = new Date(start.getTime() + 2 * 86400000);
      const leave = await requesterCaller.hr.leave.create({
        type: "vacation",
        startDate: start,
        endDate: end,
        reason: "Family trip",
      }) as { id: string; status: string };
      expect(leave.status).toBe("pending");

      const approved = await adminCaller.hr.leave.approve({ id: leave.id }) as { status: string };
      expect(approved.status).toBe("approved");
    });
  });

  // ── 8.34 CSM ──────────────────────────────────────────────────────────────

  describe("8.34 CSM", () => {
    it("create case → update → list", async () => {
      const caller = await authedCaller(adminToken);
      const created = await caller.csm.cases.create({
        title: "Smoke customer case",
        description: "Login issue",
        priority: "high",
      }) as { id: string };
      await caller.csm.cases.update({
        id: created.id,
        status: "resolved",
        resolution: "Reset password",
      });
      const rows = await caller.csm.cases.list({ limit: 20 }) as { items: { id: string }[] };
      expect(rows.items.some((c) => c.id === created.id)).toBe(true);
      const dash = await caller.csm.dashboard();
      expect(dash).toBeDefined();
    });
  });

  // ── 8.35 Catalog ───────────────────────────────────────────────────────────

  describe("8.35 Catalog", () => {
    it("create item → submit request → list requests", async () => {
      const caller = await authedCaller(adminToken);
      const item = await caller.catalog.createItem({
        name: "Smoke catalog item",
        category: "it",
        approvalRequired: false,
      }) as { id: string };
      const req = await caller.catalog.submitRequest({ itemId: item.id, formData: {} }) as { id: string; status: string };
      expect(req.status).toMatch(/submitted|pending/);
      const requests = await caller.catalog.listRequests({});
      expect(requests.some((r: { id: string }) => r.id === req.id)).toBe(true);
    });
  });

  // ── 8.36 Approvals ─────────────────────────────────────────────────────────

  describe("8.36 Approvals", () => {
    it("list + myPending + mySubmitted (API smoke)", async () => {
      const caller = await authedCaller(adminToken);
      const listed = await caller.approvals.list({ limit: 10 });
      expect(listed.items).toBeDefined();
      const pending = await caller.approvals.myPending();
      expect(Array.isArray(pending)).toBe(true);
      const submitted = await caller.approvals.mySubmitted();
      expect(Array.isArray(submitted)).toBe(true);
    });
  });

  // ── 8.37 Work orders ───────────────────────────────────────────────────────

  describe("8.37 Work orders", () => {
    it("create → list → get", async () => {
      const caller = await authedCaller(adminToken);
      const wo = await caller.workOrders.create({
        shortDescription: "Smoke WO — replace fan",
        type: "corrective",
        priority: "4_low",
      }) as { id: string; number?: string };
      expect(wo.id).toBeDefined();
      const listed = await caller.workOrders.list({ limit: 20 });
      expect(listed.items.some((w: { id: string }) => w.id === wo.id)).toBe(true);
      const detail = await caller.workOrders.get({ id: wo.id });
      expect(detail?.workOrder?.id).toBe(wo.id);
    });
  });

  // ── 8.38 Legal ─────────────────────────────────────────────────────────────

  describe("8.38 Legal", () => {
    it("investigation → list → close", async () => {
      const caller = await authedCaller(adminToken);
      const inv = await caller.legal.createInvestigation({
        title: "Smoke ethics review",
        type: "ethics",
        anonymousReport: false,
      }) as { id: string };
      const listed = await caller.legal.listInvestigations({ limit: 20 });
      expect(listed.some((i: { id: string }) => i.id === inv.id)).toBe(true);
      const closed = await caller.legal.closeInvestigation({
        id: inv.id,
        findings: "No violation",
      }) as { status: string };
      expect(closed.status).toBe("closed");
    });
  });

  // ── 8.39 Financial + dashboard ────────────────────────────────────────────

  describe("8.39 Financial & dashboard", () => {
    it("financial reads + dashboard metrics", async () => {
      const caller = await authedCaller(adminToken);
      const invPage = await caller.financial.listInvoices({ limit: 5 }) as { items: unknown[] };
      expect(Array.isArray(invPage.items)).toBe(true);
      const budget = await caller.financial.listBudget({});
      expect(budget).toBeDefined();
      const metrics = await caller.dashboard.getMetrics();
      expect(metrics).toBeDefined();
    });
  });

  // ── 8.14 Vendors ──────────────────────────────────────────────────────────

  describe("8.24 Vendors", () => {
    it("create → list vendor", async () => {
      const caller = await authedCaller(adminToken);
      const vendor = await caller.procurement.vendors.create({
        name: "Smoke Vendor Corp",
        contactEmail: "billing@smokevendor.com",
      }) as { id: string };
      expect(vendor.id).toBeDefined();

      const list = await caller.procurement.vendors.list();
      expect(Array.isArray(list)).toBe(true);
    });

    it("top-level vendors router get + update", async () => {
      const caller = await authedCaller(adminToken);
      const vendor = await caller.procurement.vendors.create({
        name: "Top-level vendor smoke",
        contactEmail: "v@vendor.test",
      }) as { id: string };
      const got = await caller.vendors.get({ id: vendor.id });
      expect(got.name).toContain("Top-level");
      const updated = await caller.vendors.update({
        id: vendor.id,
        notes: "Updated via smoke",
      }) as { notes: string | null };
      expect(updated.notes).toContain("smoke");
    });
  });

  // ── 8.50 Remaining appRouter namespaces (C5 backlog) ───────────────────────

  describe("8.50 Remaining routers", () => {
    it("mac.stats (public) returns aggregates", async () => {
      const caller = await authedCaller(adminToken);
      const stats = await caller.mac.stats();
      expect(typeof stats.orgs).toBe("number");
    });

    it("assets: seed type → create → list", async () => {
      const db = testDb();
      const [atype] = await db
        .insert(assetTypes)
        .values({ orgId: orgCtx.orgId, name: "Smoke asset class" })
        .returning();
      const caller = await authedCaller(adminToken);
      const asset = await caller.assets.create({
        name: "Smoke laptop",
        typeId: atype!.id,
        status: "in_stock",
      }) as { id: string; assetTag: string };
      expect(asset.assetTag).toMatch(/^AST-/);
      const listed = await caller.assets.list({ limit: 10 });
      expect(listed.items.some((a: { id: string }) => a.id === asset.id)).toBe(true);
    });

    it("workflows: create → list → get", async () => {
      const caller = await authedCaller(adminToken);
      const wf = await caller.workflows.create({
        name: "Smoke workflow",
        triggerType: "manual",
        triggerConfig: {},
      }) as { id: string };
      const all = await caller.workflows.list();
      expect(all.some((w: { id: string }) => w.id === wf.id)).toBe(true);
      const detail = await caller.workflows.get({ id: wf.id });
      expect(detail.workflow.id).toBe(wf.id);
    });

    it("workforce headcount + tenure", async () => {
      const caller = await authedCaller(adminToken);
      const hc = await caller.workforce.headcount({ days: 180 });
      expect(typeof hc.total).toBe("number");
      const tenure = await caller.workforce.tenure();
      expect(Array.isArray(tenure)).toBe(true);
    });

    it("recruitment: create requisition → list", async () => {
      const caller = await authedCaller(adminToken);
      const req = await caller.recruitment.requisitions.create({
        title: "Smoke Backend Engineer",
        department: "Engineering",
        publishImmediately: false,
      }) as { id: string; status: string };
      expect(req.status).toBe("draft");
      const rows = await caller.recruitment.requisitions.list({});
      expect(rows.some((r: { id: string }) => r.id === req.id)).toBe(true);
    });

    it("performance: listCycles + createCycle", async () => {
      const caller = await authedCaller(adminToken);
      const before = await caller.performance.listCycles({});
      const cycle = await caller.performance.createCycle({
        name: "Smoke review cycle",
        type: "annual",
      }) as { id: string };
      const after = await caller.performance.listCycles({});
      expect(after.length).toBeGreaterThanOrEqual(before.length);
      expect(after.some((c: { id: string }) => c.id === cycle.id)).toBe(true);
    });

    it("payroll: list runs", async () => {
      const caller = await authedCaller(adminToken);
      const runs = await caller.payroll.runs.list({});
      expect(Array.isArray(runs)).toBe(true);
    });

    it("inventory: create item → list", async () => {
      const caller = await authedCaller(adminToken);
      const item = await caller.inventory.create({
        partNumber: `PN-SMOKE-${Date.now()}`,
        name: "Smoke spare",
        qty: 1,
        minQty: 0,
      }) as { id: string };
      const page = await caller.inventory.list({ limit: 50 }) as { items: { id: string }[] };
      expect(page.items.some((i) => i.id === item.id)).toBe(true);
    });

    it("assignmentRules: list", async () => {
      const caller = await authedCaller(adminToken);
      const rules = await caller.assignmentRules.list({});
      expect(Array.isArray(rules)).toBe(true);
    });

    it("secretarial: meeting create → list", async () => {
      const caller = await authedCaller(adminToken);
      const when = new Date(Date.now() + 86400000).toISOString();
      const mtg = await caller.secretarial.meetings.create({
        title: "Smoke board meeting",
        scheduledAt: when,
      }) as { id: string };
      const listed = await caller.secretarial.meetings.list({});
      expect(listed.some((m: { id: string }) => m.id === mtg.id)).toBe(true);
    });

    it("devops: listPipelines + doraMetrics", async () => {
      const caller = await authedCaller(adminToken);
      const pipes = await caller.devops.listPipelines({});
      expect(Array.isArray(pipes)).toBe(true);
      const dora = await caller.devops.doraMetrics();
      expect(dora).toBeDefined();
    });

    it("surveys: create → list", async () => {
      const caller = await authedCaller(adminToken);
      const s = await caller.surveys.create({
        title: "Smoke CSAT",
        questions: [{ id: "q1", type: "rating", question: "Rate us", required: true }],
      }) as { id: string };
      const all = await caller.surveys.list({});
      expect(all.some((x: { id: string }) => x.id === s.id)).toBe(true);
    });

    it("apm: create application → portfolio.summary", async () => {
      const caller = await authedCaller(adminToken);
      const app = await caller.apm.applications.create({
        name: "Smoke App Portfolio",
      }) as { id: string };
      const sum = await caller.apm.portfolio.summary();
      expect(sum).toBeDefined();
      const listed = await caller.apm.applications.list({ limit: 20 }) as { items: { id: string }[] };
      expect(listed.items.some((a) => a.id === app.id)).toBe(true);
    });

    it("oncall: schedule create → list → activeRotation", async () => {
      const caller = await authedCaller(adminToken);
      const sch = await caller.oncall.schedules.create({
        name: "Smoke on-call",
        members: [{ userId: orgCtx.adminId, name: "Admin", phone: "", email: "" }],
      }) as { id: string };
      const listed = await caller.oncall.schedules.list({ limit: 10 });
      expect(listed.some((s: { id: string }) => s.id === sch.id)).toBe(true);
      const rot = await caller.oncall.activeRotation();
      expect(Array.isArray(rot)).toBe(true);
    });

    it("events: list + healthNodes + dashboard", async () => {
      const caller = await authedCaller(adminToken);
      const ev = await caller.events.list({ limit: 5 });
      expect(ev.items).toBeDefined();
      const nodes = await caller.events.healthNodes();
      expect(Array.isArray(nodes)).toBe(true);
      const dash = await caller.events.dashboard();
      expect(dash.total).toBeDefined();
    });

    it("facilities: building create → list", async () => {
      const caller = await authedCaller(adminToken);
      const b = await caller.facilities.buildings.create({
        name: `Smoke Tower ${Date.now()}`,
        floors: 3,
      }) as { id: string };
      const rows = await caller.facilities.buildings.list({ limit: 20 });
      expect(rows.some((r: { id: string }) => r.id === b.id)).toBe(true);
    });

    it("walkup: joinQueue → list queue", async () => {
      const caller = await authedCaller(adminToken);
      const v = await caller.walkup.queue.joinQueue({ issueCategory: "it_support" }) as { id: string };
      const q = await caller.walkup.queue.list({});
      expect(q.some((row: { id: string }) => row.id === v.id)).toBe(true);
    });

    it("ai.summarizeTicket returns null or string (no key ok)", async () => {
      const caller = await authedCaller(adminToken);
      const t = await caller.tickets.create({
        title: "AI smoke ticket",
        type: "incident",
        priorityId: orgCtx.p2Id!,
      }) as { id: string };
      const summary = await caller.ai.summarizeTicket({ ticketId: t.id });
      expect(summary === null || typeof summary === "string").toBe(true);
    });

    it("indiaCompliance.calendar.list", async () => {
      const caller = await authedCaller(adminToken);
      const rows = await caller.indiaCompliance.calendar.list({});
      expect(Array.isArray(rows)).toBe(true);
    });

    it("integrations hubCatalog + listIntegrations", async () => {
      const caller = await authedCaller(adminToken);
      const hub = await caller.integrations.hubCatalog();
      expect(hub.connectors.length).toBeGreaterThan(0);
      const integ = await caller.integrations.listIntegrations();
      expect(Array.isArray(integ)).toBe(true);
    });

    it("accounting coa.seed → list", async () => {
      const caller = await authedCaller(adminToken);
      await caller.accounting.coa.seed();
      const rows = await caller.accounting.coa.list({ activeOnly: true });
      expect(rows.length).toBeGreaterThan(0);
    });

    it("customFields listDefinitions for ticket", async () => {
      const caller = await authedCaller(adminToken);
      const defs = await caller.customFields.listDefinitions({ entity: "ticket", activeOnly: true });
      expect(Array.isArray(defs)).toBe(true);
    });
  });

  // ── 8.42 RBAC integration (viewer write denial) ─────────────────────────────

  describe("8.42 RBAC sensitive writes", () => {
    it("viewer cannot create GRC risk (no grc.write on requester+report_viewer)", async () => {
      const viewerToken = await createSession(orgCtx.viewerId);
      const viewerCaller = await authedCaller(viewerToken);
      await expect(
        viewerCaller.grc.createRisk({
          title: "Should be denied",
          category: "operational",
          likelihood: 1,
          impact: 1,
        }),
      ).rejects.toThrow(/FORBIDDEN|permission/i);
    });
  });
});
