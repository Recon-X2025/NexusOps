/**
 * Layer 8 — Module Smoke Tests: CRUD + domain operations for every module.
 * Verifies core operations work end-to-end for all 32 modules.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { nanoid } from "nanoid";
import { testDb, seedFullOrg, seedUser, authedCaller, cleanupOrg, createSession, initTestEnvironment } from "./helpers";
import { securityIncidents, contracts, assetTypes } from "@nexusops/db";
import { appRouter } from "../routers";
import type { Context } from "../lib/trpc";

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL not set. Run: docker compose -f docker-compose.test.yml up -d && source .env.test",
    );
  }
});
import { eq, and, invoices, invoiceLineItems } from "@nexusops/db";

function publicCaller() {
  const db = testDb();
  const ctx: Context = {
    db,
    mongoDb: null,
    databaseProvider: "postgres",
    user: null,
    org: null,
    orgId: null,
    sessionId: null,
    requestId: null,
    ipAddress: "127.0.0.1",
    userAgent: "vitest-layer8-auth",
    idempotencyKey: null,
  };
  return appRouter.createCaller(ctx);
}

describe("Layer 8: Module Smoke Tests", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let adminToken: string;
  let agentToken: string;

  beforeAll(async () => {
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    // Session token (not password login) — avoids env-specific auth.login / bcrypt drift in CI.
    adminToken = await createSession(orgCtx.adminId);
    agentToken = await createSession(orgCtx.agentId);
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

    it("major incident war-room comms (US-ITSM-004)", async () => {
      const caller = await authedCaller(adminToken);
      const ticket = await caller.tickets.create({
        title: "Major comms smoke",
        type: "incident",
        priorityId: orgCtx.p2Id!,
      }) as { id: string };
      await caller.tickets.update({
        id: ticket.id,
        data: { isMajorIncident: true },
      });
      const empty = (await caller.tickets.majorIncidentComms.list({ ticketId: ticket.id })) as unknown[];
      expect(Array.isArray(empty)).toBe(true);
      expect(empty.length).toBe(0);
      await caller.tickets.majorIncidentComms.append({
        ticketId: ticket.id,
        body: "Status: mitigating — failover complete",
      });
      const after = (await caller.tickets.majorIncidentComms.list({ ticketId: ticket.id })) as { body: string }[];
      expect(after.length).toBe(1);
      expect(after[0]!.body).toContain("mitigating");
    });

    it("incident parent/child hierarchy on tickets.get (US-ITSM-004)", async () => {
      const caller = await authedCaller(adminToken);
      const parent = await caller.tickets.create({
        title: "Parent incident hierarchy",
        type: "incident",
        priorityId: orgCtx.p2Id!,
      }) as { id: string };
      await caller.tickets.update({
        id: parent.id,
        data: { isMajorIncident: true },
      });
      const child = await caller.tickets.create({
        title: "Child under parent",
        type: "incident",
        priorityId: orgCtx.p2Id!,
        parentTicketId: parent.id,
      }) as { id: string };
      const pDetail = (await caller.tickets.get({ id: parent.id })) as {
        childTickets: { id: string }[];
      };
      expect(pDetail.childTickets.some((c) => c.id === child.id)).toBe(true);
      const cDetail = (await caller.tickets.get({ id: child.id })) as {
        parentTicket: { id: string } | null;
      };
      expect(cDetail.parentTicket?.id).toBe(parent.id);
    });

    it("concurrent response + resolve SLA targets on create (US-ITSM-002)", async () => {
      const caller = await authedCaller(adminToken);
      const ticket = (await caller.tickets.create({
        title: "Dual SLA clocks",
        type: "incident",
        priorityId: orgCtx.p1Id!,
      })) as { id: string };
      const detail = (await caller.tickets.get({ id: ticket.id })) as {
        ticket: {
          slaResponseDueAt: string | Date | null;
          slaResolveDueAt: string | Date | null;
        };
      };
      expect(detail.ticket.slaResponseDueAt).toBeTruthy();
      expect(detail.ticket.slaResolveDueAt).toBeTruthy();
      const r = new Date(detail.ticket.slaResponseDueAt as string).getTime();
      const x = new Date(detail.ticket.slaResolveDueAt as string).getTime();
      expect(x).toBeGreaterThan(r);
    });
  });

  // ── 8.02 Changes ──────────────────────────────────────────────────────────

  describe("8.02 Changes (ITSM-grade Seq 1)", () => {
    it("create → list → get → submitForApproval → approve → schedule → implement → complete", async () => {
      const caller = await authedCaller(adminToken);
      const t0 = Date.now();
      const change = (await caller.changes.create({
        title: `ITSM smoke change ${t0}`,
        type: "normal",
        risk: "low",
        description: "Lifecycle test",
        scheduledStart: new Date(t0 + 86400000).toISOString(),
        scheduledEnd: new Date(t0 + 2 * 86400000).toISOString(),
        rollbackPlan: "Revert config",
        implementationPlan: "Deploy patch",
        testPlan: "Smoke tests",
      })) as { id: string; number: string; status: string };
      expect(change.number).toMatch(/^CHG-/);

      const list = (await caller.changes.list({})) as { items: { id: string }[] };
      expect(list.items.some((c) => c.id === change.id)).toBe(true);

      const detail = (await caller.changes.get({ id: change.id })) as { id: string; status: string };
      expect(detail.status).toBe("draft");

      await caller.changes.submitForApproval({ id: change.id });
      const cab = (await caller.changes.get({ id: change.id })) as { status: string };
      expect(cab.status).toBe("cab_review");

      await caller.changes.approve({ changeId: change.id, comments: "CAB approved" });
      const appr = (await caller.changes.get({ id: change.id })) as { status: string };
      expect(appr.status).toBe("approved");

      await caller.changes.update({ id: change.id, status: "scheduled" });
      await caller.changes.update({ id: change.id, status: "implementing" });
      const done = (await caller.changes.update({ id: change.id, status: "completed" })) as { status: string };
      expect(done.status).toBe("completed");
    });

    it("reject path + statusCounts + comment + blackout overlap", async () => {
      const caller = await authedCaller(adminToken);
      const ch = (await caller.changes.create({
        title: "Change to reject",
        type: "normal",
        risk: "medium",
      })) as { id: string };
      await caller.changes.submitForApproval({ id: ch.id });
      await caller.changes.reject({ changeId: ch.id, comments: "Out of scope for window" });
      const cancelled = (await caller.changes.get({ id: ch.id })) as { status: string };
      expect(cancelled.status).toBe("cancelled");

      await caller.changes.addComment({ changeId: ch.id, body: "Post-close note for audit trail" });

      const counts = await caller.changes.statusCounts();
      expect(typeof counts).toBe("object");

      const start = new Date(Date.now() + 3 * 86400000).toISOString();
      const end = new Date(Date.now() + 4 * 86400000).toISOString();
      await caller.changes.createBlackout({ name: "Freeze window", startsAt: start, endsAt: end });
      const overlap = await caller.changes.checkBlackoutOverlap({
        scheduledStart: new Date(Date.now() + 3 * 86400000 + 3600000).toISOString(),
        scheduledEnd: new Date(Date.now() + 3 * 86400000 + 7200000).toISOString(),
      });
      expect(overlap).toHaveProperty("overlappingBlackouts");
    });

    it("CAB approve requires risk score + questionnaire for high/critical (US-ITSM-007)", async () => {
      const caller = await authedCaller(adminToken);
      const ch = (await caller.changes.create({
        title: `High risk CAB ${Date.now()}`,
        risk: "high",
        type: "normal",
      })) as { id: string };
      await caller.changes.submitForApproval({ id: ch.id });
      await expect(caller.changes.approve({ changeId: ch.id })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      await caller.changes.approve({
        changeId: ch.id,
        riskScore: 18,
        riskQuestionnaire: {
          impact: "Sev-2 customer-facing",
          likelihood: "Probable",
          rollbackValidated: "yes",
        },
      });
      const done = (await caller.changes.get({ id: ch.id })) as { status: string; riskScore: number | null };
      expect(done.status).toBe("approved");
      expect(done.riskScore).toBe(18);
    });
  });

  // ── 8.03 Security Incidents ───────────────────────────────────────────────

  describe("8.10 Security (ITSM-grade Seq 12 — incidents + vulns)", () => {
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

    it("list/get, addContainment, false_positive branch, vulnerabilities, statusCounts, openIncidentCount", async () => {
      const caller = await authedCaller(adminToken);
      const inc = (await caller.security.createIncident({
        title: "Containment journal",
        severity: "high",
        affectedSystems: ["edge-gateway"],
      })) as { id: string };
      await caller.security.transition({ id: inc.id, toStatus: "triage" });
      await caller.security.addContainment({
        id: inc.id,
        action: "Isolate affected VLAN",
        performedBy: orgCtx.adminId,
      });
      const got = (await caller.security.getIncident({ id: inc.id })) as {
        containmentActions?: { action: string }[];
      };
      expect((got.containmentActions ?? []).length).toBeGreaterThan(0);

      const fp = (await caller.security.createIncident({
        title: "Benign scanner noise",
        severity: "low",
      })) as { id: string };
      await caller.security.transition({ id: fp.id, toStatus: "triage" });
      await caller.security.transition({ id: fp.id, toStatus: "false_positive" });

      const vuln = (await caller.security.createVulnerability({
        title: "Dependency CVE smoke",
        cveId: "CVE-2024-TEST",
        severity: "high",
      })) as { id: string };
      const vulnRows = (await caller.security.listVulnerabilities({ limit: 20 })) as { id: string }[];
      expect(vulnRows.some((v) => v.id === vuln.id)).toBe(true);
      await caller.security.remediateVulnerability({ id: vuln.id, notes: "Package upgraded" });

      const counts = await caller.security.statusCounts();
      expect(typeof counts).toBe("object");
      const openN = await caller.security.openIncidentCount();
      expect(typeof openN).toBe("number");

      const listed = (await caller.security.listIncidents({ limit: 10, severity: "high" })) as {
        items: { id: string }[];
      };
      expect(Array.isArray(listed.items)).toBe(true);
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

    it("Seq 13 depth: listRisks + getRisk + listPolicies + riskMatrix", async () => {
      const caller = await authedCaller(adminToken);
      const r = (await caller.grc.createRisk({
        title: "L8 list coverage",
        category: "compliance",
        likelihood: 2,
        impact: 2,
      })) as { id: string };
      const listed = await caller.grc.listRisks({ limit: 50 });
      expect(Array.isArray(listed)).toBe(true);
      const one = (await caller.grc.getRisk({ id: r.id })) as { id: string };
      expect(one.id).toBe(r.id);
      const pols = await caller.grc.listPolicies({ limit: 20 });
      expect(Array.isArray(pols)).toBe(true);
      const matrix = await caller.grc.riskMatrix();
      expect(Array.isArray(matrix)).toBe(true);
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

    it("PR approval tiers follow org settings (US-FIN-003)", async () => {
      const caller = await authedCaller(adminToken);
      await caller.procurement.approvalRules.update({
        prAutoApproveBelow: 1000,
        prDeptHeadMax: 5000,
      });
      const small = await caller.procurement.purchaseRequests.create({
        title: "Tier test small",
        justification: "Under auto",
        items: [{ description: "Clip", quantity: 10, unitPrice: 50 }],
        priority: "low",
        department: "IT",
      }) as { status: string };
      expect(small.status).toBe("approved");
      const mid = await caller.procurement.purchaseRequests.create({
        title: "Tier test mid",
        justification: "Pending band",
        items: [{ description: "Kit", quantity: 3, unitPrice: 400 }],
        priority: "medium",
        department: "IT",
      }) as { status: string };
      expect(mid.status).toBe("pending");
      await caller.procurement.approvalRules.update({
        prAutoApproveBelow: 75_000,
        prDeptHeadMax: 750_000,
      });
    });

    it("PO from PR can carry legalEntityId; list exposes legalEntityCode (US-CRM-008 PO slice)", async () => {
      const caller = await authedCaller(adminToken);
      const suffix = nanoid(6);
      const le = (await caller.financial.createLegalEntity({
        code: `PO-LE-${suffix}`,
        name: `PO Legal ${suffix}`,
      })) as { id: string; code: string };
      const vendor = (await caller.procurement.vendors.create({
        name: `PO vendor ${suffix}`,
        contactEmail: `po-v-${suffix}@test.com`,
      })) as { id: string };
      const pr = (await caller.procurement.purchaseRequests.create({
        title: `LE PR ${suffix}`,
        justification: "smoke",
        items: [{ description: "Item", quantity: 1, unitPrice: 100 }],
        priority: "low",
        department: "IT",
      })) as { id: string; status: string };
      expect(pr.status).toBe("approved");
      const po = (await caller.procurement.purchaseOrders.createFromPR({
        prId: pr.id,
        vendorId: vendor.id,
        legalEntityId: le.id,
      })) as { id: string };
      const list = (await caller.procurement.purchaseOrders.list()) as Array<{ id: string; legalEntityCode: string | null }>;
      const row = list.find((p) => p.id === po.id);
      expect(row?.legalEntityCode).toBe(le.code);
      const opts = (await caller.procurement.legalEntityOptions()) as { id: string; code: string }[];
      expect(opts.some((o) => o.id === le.id)).toBe(true);
    });

    it("approval rules: PO match tolerance + duplicate payable policy persist (US-CRM-004 / US-FIN-004)", async () => {
      const caller = await authedCaller(adminToken);
      await caller.procurement.approvalRules.update({
        prAutoApproveBelow: 75_000,
        prDeptHeadMax: 750_000,
        poMatchToleranceAbs: 42,
        duplicatePayableInvoicePolicy: "block",
      });
      const got = (await caller.procurement.approvalRules.get()) as {
        poMatchToleranceAbs: number;
        duplicatePayableInvoicePolicy: string;
      };
      expect(got.poMatchToleranceAbs).toBe(42);
      expect(got.duplicatePayableInvoicePolicy).toBe("block");
      await caller.procurement.approvalRules.update({
        prAutoApproveBelow: 75_000,
        prDeptHeadMax: 750_000,
        poMatchToleranceAbs: 1,
        duplicatePayableInvoicePolicy: "warn",
      });
      const restored = (await caller.procurement.approvalRules.get()) as {
        poMatchToleranceAbs: number;
        duplicatePayableInvoicePolicy: string;
      };
      expect(restored.poMatchToleranceAbs).toBe(1);
      expect(restored.duplicatePayableInvoicePolicy).toBe("warn");
    });

    it("applyMatchToOrder persists matched status (US-CRM-005 / US-FIN-005 pay-ready)", async () => {
      const caller = await authedCaller(adminToken);
      const db = testDb();
      const suffix = nanoid(6);
      const vendor = (await caller.procurement.vendors.create({
        name: `Match vendor ${suffix}`,
        contactEmail: `match-${suffix}@vendor.test`,
      })) as { id: string };
      const pr = (await caller.procurement.purchaseRequests.create({
        title: `Match PR ${suffix}`,
        justification: "layer8",
        items: [{ description: "Widget", quantity: 1, unitPrice: 100 }],
        priority: "low",
        department: "IT",
      })) as { id: string };
      const po = (await caller.procurement.purchaseOrders.createFromPR({
        prId: pr.id,
        vendorId: vendor.id,
      })) as { id: string };
      const inv = (await caller.financial.createInvoice({
        vendorId: vendor.id,
        invoiceNumber: `MATCH-${suffix}`,
        amount: "100",
      })) as { id: string };

      await db.insert(invoiceLineItems).values({
        invoiceId: inv.id,
        lineItemNumber: 1,
        description: "Widget",
        quantity: "1",
        unitPrice: "100",
        lineTotal: "100",
        taxableValue: "100",
      });
      await db.update(invoices).set({ poId: po.id }).where(and(eq(invoices.id, inv.id), eq(invoices.orgId, orgCtx.orgId)));

      const preview = (await caller.procurement.invoices.matchToOrder({
        invoiceId: inv.id,
        poId: po.id,
      })) as { matched: boolean; lineKeyedMatched: boolean | null };
      expect(preview.matched).toBe(true);
      expect(preview.lineKeyedMatched).toBe(true);

      const applied = (await caller.procurement.invoices.applyMatchToOrder({
        invoiceId: inv.id,
        poId: po.id,
      })) as { invoice: { matchingStatus: string; poId: string | null } };
      expect(applied.invoice.matchingStatus).toBe("matched");
      expect(applied.invoice.poId).toBe(po.id);

      await expect(
        caller.procurement.invoices.applyMatchToOrder({
          invoiceId: inv.id,
          poId: po.id,
        }),
      ).resolves.toMatchObject({ ok: true });

      await db
        .update(invoiceLineItems)
        .set({ lineTotal: "50" })
        .where(and(eq(invoiceLineItems.invoiceId, inv.id), eq(invoiceLineItems.lineItemNumber, 1)));
      await db
        .update(invoices)
        .set({ matchingStatus: "pending", amount: "100", updatedAt: new Date() })
        .where(eq(invoices.id, inv.id));

      await expect(
        caller.procurement.invoices.applyMatchToOrder({
          invoiceId: inv.id,
          poId: po.id,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
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

      const exec = await caller.crm.executiveSummary() as {
        openPipeline: { count: number };
        pipelineByStage: { stage: string }[];
        recentDeals: unknown[];
        leads: { open: number };
      };
      expect(exec.openPipeline).toBeDefined();
      expect(Array.isArray(exec.pipelineByStage)).toBe(true);
      expect(Array.isArray(exec.recentDeals)).toBe(true);
      expect(exec.leads).toBeDefined();
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

    it("strategyDashboardSummary aggregates portfolio + APM (US-STR-002)", async () => {
      const caller = await authedCaller(adminToken);
      const s = (await caller.projects.strategyDashboardSummary()) as {
        portfolioHealth: Record<string, number>;
        activeProjectCount: number;
        atRiskByHealth: number;
        applications: { total: number; retiring: number };
      };
      expect(s.applications).toBeDefined();
      expect(typeof s.activeProjectCount).toBe("number");
      expect(typeof s.atRiskByHealth).toBe("number");
    });

    it("strategyDashboardSummary includes initiative / benefit / dependency / APM link stats (US-STR-004…008)", async () => {
      const caller = await authedCaller(adminToken);
      const s = (await caller.projects.strategyDashboardSummary()) as {
        initiativeCoverage: { aligned: number; inFlight: number };
        benefits: { tracked: number; withActual: number };
        portfolioDependencies: { edgeCount: number; riskSignalCount: number };
        apmProjectLinks: { inFlightWithLinkedApps: number; inFlightTotal: number };
      };
      expect(s.initiativeCoverage?.inFlight).toBeGreaterThanOrEqual(0);
      expect(s.portfolioDependencies?.edgeCount).toBeGreaterThanOrEqual(0);
      expect(s.apmProjectLinks?.inFlightTotal).toBeGreaterThanOrEqual(0);
    });

    it("portfolio dependency rejects cycles (US-STR-007)", async () => {
      const caller = await authedCaller(adminToken);
      const a = (await caller.projects.create({ name: `L8 dep A ${Date.now()}` })) as { id: string };
      const b = (await caller.projects.create({ name: `L8 dep B ${Date.now()}` })) as { id: string };
      await caller.projects.addProjectDependency({ fromProjectId: a.id, toProjectId: b.id });
      await expect(
        caller.projects.addProjectDependency({ fromProjectId: b.id, toProjectId: a.id }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  // ── 8.09 Knowledge ────────────────────────────────────────────────────────

  describe("8.22 Knowledge (ITSM-grade Seq 3)", () => {
    it("create → list → publish → get → recordFeedback", async () => {
      const caller = await authedCaller(adminToken);
      const article = (await caller.knowledge.create({
        title: "ITSM KB — password reset",
        content: "<p>Use Forgot Password on the login page.</p>",
        tags: ["password", "auth"],
      })) as { id: string; status?: string };

      const listed = await caller.knowledge.list({ limit: 20, search: "ITSM KB" });
      expect(Array.isArray(listed)).toBe(true);
      expect((listed as { id: string }[]).some((a) => a.id === article.id)).toBe(true);

      const published = (await caller.knowledge.publish({ id: article.id })) as { status: string };
      expect(published.status).toBe("published");

      const detail = (await caller.knowledge.get({ id: article.id })) as { viewCount: number; status: string };
      expect(detail.status).toBe("published");
      expect(detail.viewCount).toBeGreaterThanOrEqual(1);

      await caller.knowledge.recordFeedback({
        articleId: article.id,
        helpful: true,
        comment: "Layer 8 smoke",
      });
    });

    it("knowledge.update snapshots prior content to listArticleVersions (US-ITSM-008)", async () => {
      const caller = await authedCaller(adminToken);
      const article = (await caller.knowledge.create({
        title: `KB rev ${Date.now()}`,
        content: "version one",
        tags: ["layer8"],
      })) as { id: string };
      await caller.knowledge.update({ id: article.id, content: "version two" });
      const revs = (await caller.knowledge.listArticleVersions({ articleId: article.id })) as { version: number }[];
      expect(revs.some((r) => r.version === 1)).toBe(true);
    });
  });

  // ── 8.10 Notifications ────────────────────────────────────────────────────

  describe("8.29 Notifications (ITSM-grade Seq 6)", () => {
    it("admin send → agent list unread → markRead → getPreferences", async () => {
      const adminCaller = await authedCaller(adminToken);
      const agentCaller = await authedCaller(agentToken);

      const sent = (await adminCaller.notifications.send({
        userId: orgCtx.agentId,
        title: "ITSM Seq 6 in-app",
        body: "Layer 8 notification smoke",
        type: "info",
        sourceType: "layer8",
      })) as { id: string; userId: string; isRead: boolean };
      expect(sent.userId).toBe(orgCtx.agentId);
      expect(sent.isRead).toBe(false);

      const unreadList = (await agentCaller.notifications.list({
        unreadOnly: true,
        limit: 50,
      })) as { items: { id: string; title: string }[] };
      expect(unreadList.items.some((n) => n.id === sent.id)).toBe(true);

      const unreadBefore = await agentCaller.notifications.unreadCount();
      expect(typeof unreadBefore).toBe("number");
      expect(unreadBefore).toBeGreaterThanOrEqual(1);

      await agentCaller.notifications.markRead({ id: sent.id });

      const afterMark = (await agentCaller.notifications.list({
        unreadOnly: true,
        limit: 50,
      })) as { items: { id: string }[] };
      expect(afterMark.items.some((n) => n.id === sent.id)).toBe(false);

      const prefs = await agentCaller.notifications.getPreferences();
      expect(Array.isArray(prefs)).toBe(true);
      // updatePreference uses ON CONFLICT — requires DB unique on (user_id, channel, event_type); covered in staging when migration present.
    });

    it("ticket assignee still receives workflow path + markAllRead", async () => {
      const adminCaller = await authedCaller(adminToken);
      const agentCaller = await authedCaller(agentToken);

      await adminCaller.tickets.create({
        title: "Notification trigger test",
        type: "incident",
        priorityId: orgCtx.p1Id!,
        assigneeId: orgCtx.agentId,
      });

      const listed = (await agentCaller.notifications.list({ limit: 50 })) as { items: unknown[] };
      expect(Array.isArray(listed.items)).toBe(true);

      await agentCaller.notifications.markAllRead();
      const unread = await agentCaller.notifications.unreadCount();
      expect(unread).toBe(0);
    });
  });

  // ── 8.11 Search ───────────────────────────────────────────────────────────

  describe("8.30 Search (ITSM-grade Seq 7)", () => {
    it("search.global returns array (Meilisearch off → empty)", async () => {
      const caller = await authedCaller(adminToken);
      const hits = await caller.search.global({ query: "smoke", limit: 10 });
      expect(Array.isArray(hits)).toBe(true);
    });

    it("search.global with entityTypes filter (graceful)", async () => {
      const caller = await authedCaller(adminToken);
      const hits = await caller.search.global({
        query: "ticket",
        limit: 5,
        entityTypes: ["tickets"],
      });
      expect(Array.isArray(hits)).toBe(true);
    });
  });

  // ── 8.12 Reports ──────────────────────────────────────────────────────────

  describe("8.31 Reports (ITSM-grade Seq 8)", () => {
    it("executiveOverview + slaDashboard + workload + trend + ITSM pack + slaWhatIf", async () => {
      const caller = await authedCaller(adminToken);
      const overview = (await caller.reports.executiveOverview({ days: 30 })) as {
        openTickets: number;
        incidentTrend: number[];
        byCategory: { category: string; count: number }[];
      };
      expect(typeof overview.openTickets).toBe("number");
      expect(Array.isArray(overview.incidentTrend)).toBe(true);
      expect(Array.isArray(overview.byCategory)).toBe(true);

      const sla = (await caller.reports.slaDashboard({ days: 30 })) as {
        byPriority: unknown[];
        slaTrend: number[];
      };
      expect(Array.isArray(sla.byPriority)).toBe(true);
      expect(Array.isArray(sla.slaTrend)).toBe(true);

      const workload = (await caller.reports.workloadAnalysis({ days: 30 })) as {
        byAssignee: { name: string; total: number }[];
      };
      expect(Array.isArray(workload.byAssignee)).toBe(true);

      const trend = (await caller.reports.trendAnalysis({ days: 30 })) as {
        backlogTrend: { week: string; total: number }[];
      };
      expect(Array.isArray(trend.backlogTrend)).toBe(true);

      const pack = (await caller.reports.itsmServiceDeskPack({ days: 30 })) as {
        slaCompliancePct: number;
        ticketsCreated: number;
        backlogAgeing: Record<string, number>;
      };
      expect(typeof pack.slaCompliancePct).toBe("number");
      expect(pack.backlogAgeing).toHaveProperty("d0_1");

      const whatIf = (await caller.reports.slaWhatIf({
        responseMinutes: 60,
        resolveMinutes: 480,
      })) as { responseDueAt: string };
      expect(whatIf.responseDueAt).toMatch(/^\d{4}-/);
    });
  });

  // ── 8.40 Dashboard (Seq 9 — ITSM-grade, beyond §8.39 getMetrics touch) ─────

  describe("8.40 Dashboard (ITSM-grade Seq 9)", () => {
    it("getTimeSeries + getTopCategories", async () => {
      const caller = await authedCaller(adminToken);
      const ts = (await caller.dashboard.getTimeSeries({ days: 30 })) as {
        created: unknown[];
        resolved: unknown[];
      };
      expect(ts).toHaveProperty("created");
      expect(ts).toHaveProperty("resolved");
      const cats = await caller.dashboard.getTopCategories();
      expect(Array.isArray(cats)).toBe(true);
    });
  });

  // ── 8.13 Admin ────────────────────────────────────────────────────────────

  describe("8.32 Admin (ITSM-grade Seq 10)", () => {
    it("users, audit log, properties, SLA defs, notification rules, jobs, business rules lifecycle", async () => {
      const caller = await authedCaller(adminToken);

      const usersList = (await caller.admin.users.list({})) as { id: string }[];
      expect(Array.isArray(usersList)).toBe(true);
      expect(usersList.length).toBeGreaterThan(0);

      const log = (await caller.admin.auditLog.list({ page: 1, limit: 10 })) as {
        items: unknown[];
        total: number;
      };
      expect(Array.isArray(log.items)).toBe(true);
      expect(typeof log.total).toBe("number");

      const props = await caller.admin.systemProperties.list();
      expect(Array.isArray(props)).toBe(true);
      const propUpd = await caller.admin.systemProperties.update({
        key: "platform.name",
        value: "NexusOps",
      });
      expect(propUpd).toMatchObject({ key: "platform.name", value: "NexusOps" });

      const slas = await caller.admin.slaDefinitions.list();
      expect(Array.isArray(slas)).toBe(true);
      const slaUp = await caller.admin.slaDefinitions.upsert({
        name: "L8 smoke SLA",
        priority: "high",
        responseMinutes: 30,
        resolveMinutes: 240,
      });
      expect(slaUp).toMatchObject({ name: "L8 smoke SLA", responseMinutes: 30 });

      const nr = await caller.admin.notificationRules.create({
        name: "L8 NR",
        event: "ticket.created",
        channel: "in_app",
        recipients: "all-admins",
      });
      expect(nr).toHaveProperty("id");

      const jobs = await caller.admin.scheduledJobs.list();
      expect(Array.isArray(jobs)).toBe(true);
      expect(jobs.length).toBeGreaterThan(0);
      const trig = await caller.admin.scheduledJobs.trigger({ jobId: "sla-checker" });
      expect(trig).toMatchObject({ success: true, jobId: "sla-checker" });

      const brIn = {
        name: "L8 admin business rule",
        entityType: "ticket" as const,
        events: ["created" as const],
        conditions: [{ op: "status_category_is" as const, category: "open" as const }],
        actions: [{ type: "notify_assignee" as const, title: "Smoke", body: "Rule fired" }],
        priority: 42,
        enabled: true,
      };
      const br = await caller.admin.businessRules.create(brIn);
      expect(br.id).toBeDefined();
      const listed = (await caller.admin.businessRules.list()) as { id: string }[];
      expect(listed.some((r) => r.id === br.id)).toBe(true);
      await caller.admin.businessRules.update({ id: br.id, name: "L8 admin business rule v2" });
      await caller.admin.businessRules.toggle({ id: br.id, enabled: false });
      await caller.admin.businessRules.delete({ id: br.id });
    });
  });

  // ── 8.44 Auth (ITSM-grade Seq 11) ─────────────────────────────────────────

  describe("8.44 Auth (ITSM-grade Seq 11)", () => {
    it("public me, login deny, session profile + listMySessions + logout, invite accept + deleteUser", async () => {
      const pub = publicCaller();
      expect(await pub.auth.me()).toBeNull();

      await expect(
        pub.auth.login({
          email: "nope@qa.nexusops.io",
          password: "WrongPass1!",
        }),
      ).rejects.toThrow(/Invalid credentials|UNAUTHORIZED/i);

      const pwSession = await createSession(orgCtx.adminId);
      const sessionCaller = await authedCaller(pwSession);
      const me = (await sessionCaller.auth.me()) as { user: { id: string; name: string } };
      expect(me.user.id).toBe(orgCtx.adminId);

      await sessionCaller.auth.updateProfile({ name: "Layer8 Auth Display" });
      const sessionsList = await sessionCaller.auth.listMySessions();
      expect(Array.isArray(sessionsList)).toBe(true);
      expect(sessionsList.some((s: { isCurrent?: boolean }) => s.isCurrent)).toBe(true);

      await sessionCaller.auth.logout();
      const afterLogout = await authedCaller(pwSession);
      expect(await afterLogout.auth.me()).toBeNull();

      const adminCaller = await authedCaller(adminToken);
      const inviteEmail = `invitel8${nanoid(10).toLowerCase()}@qa.nexusops.io`;
      const inv = (await adminCaller.auth.inviteUser({
        email: inviteEmail,
        role: "member",
        matrixRole: "requester",
      })) as { inviteUrl: string };
      const tokenMatch = inv.inviteUrl.match(/\/invite\/([^/?#]+)/);
      expect(tokenMatch?.[1]).toBeDefined();
      const accept = (await pub.auth.acceptInvite({
        token: tokenMatch![1]!,
        name: "Invited QA User",
        password: "Welcome1A!",
      })) as { user: { id: string }; sessionId: string };
      expect(accept.user.id).toBeDefined();

      const listed = (await adminCaller.auth.listUsers()) as { id: string; email: string }[];
      expect(listed.some((u) => u.email === inviteEmail)).toBe(true);

      await adminCaller.auth.deleteUser({ userId: accept.user.id });
      const afterDel = (await adminCaller.auth.listUsers()) as { email: string }[];
      expect(afterDel.some((u) => u.email === inviteEmail)).toBe(false);
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

    it("Seq 15 depth: employees.get + employees.list", async () => {
      const adminCaller = await authedCaller(adminToken);
      const emp = (await adminCaller.hr.employees.create({
        userId: orgCtx.securityAnalystId,
        department: "QA",
        title: "List smoke",
        employmentType: "full_time",
      })) as { id: string };
      const got = (await adminCaller.hr.employees.get({ id: emp.id })) as { employee: { id: string } };
      expect(got.employee.id).toBe(emp.id);
      const list = await adminCaller.hr.employees.list({});
      expect(Array.isArray(list)).toBe(true);
    });

    it("platformHomeStrip + workplace integration flags", async () => {
      const caller = await authedCaller(adminToken);
      const strip = await caller.hr.platformHomeStrip() as { hrCases: number; totalEmployees: number; onboardingCases: number };
      expect(strip).toBeDefined();
      expect(typeof strip.hrCases).toBe("number");
      expect(typeof strip.onboardingCases).toBe("number");
      const off = await caller.hr.peopleWorkplace.updateIntegrationFlags({ facilitiesLive: false }) as { facilitiesLive: boolean };
      expect(off.facilitiesLive).toBe(false);
      await caller.hr.peopleWorkplace.updateIntegrationFlags({ facilitiesLive: true, walkupLive: true });
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

    it("Seq 14 depth: cases.get + accounts.list + slaMetrics", async () => {
      const caller = await authedCaller(adminToken);
      const created = (await caller.csm.cases.create({
        title: "Get-by-id smoke",
        priority: "medium",
      })) as { id: string };
      const row = await caller.csm.cases.get({ id: created.id });
      expect((row as { id: string }).id).toBe(created.id);
      const accts = (await caller.csm.accounts.list({ limit: 10 })) as { items: unknown[] };
      expect(Array.isArray(accts.items)).toBe(true);
      const sla = await caller.csm.slaMetrics();
      expect(sla).toHaveProperty("totalAccounts");
    });
  });

  // ── 8.35 Catalog ───────────────────────────────────────────────────────────

  describe("8.35 Catalog (ITSM-grade Seq 4)", () => {
    it("create item → listItems → getItem → submit request → listRequests → stats", async () => {
      const caller = await authedCaller(adminToken);
      const item = (await caller.catalog.createItem({
        name: "ITSM catalog smoke item",
        category: "it",
        approvalRequired: false,
      })) as { id: string };

      const items = await caller.catalog.listItems({});
      expect(Array.isArray(items)).toBe(true);
      expect((items as { id: string }[]).some((i) => i.id === item.id)).toBe(true);

      const got = await caller.catalog.getItem({ id: item.id });
      expect((got as { id: string }).id).toBe(item.id);

      const req = (await caller.catalog.submitRequest({ itemId: item.id, formData: {} })) as {
        id: string;
        status: string;
      };
      expect(req.status).toMatch(/submitted|pending/);
      const requests = await caller.catalog.listRequests({});
      expect(requests.some((r: { id: string }) => r.id === req.id)).toBe(true);

      const stats = await caller.catalog.stats();
      expect(stats).toBeDefined();
    });

    it("submitCart — multi-item transaction + shared batch id (US-ITSM-005)", async () => {
      const caller = await authedCaller(adminToken);
      const a = (await caller.catalog.createItem({
        name: "Cart item A",
        category: "it",
        approvalRequired: false,
      })) as { id: string };
      const b = (await caller.catalog.createItem({
        name: "Cart item B",
        category: "it",
        approvalRequired: false,
      })) as { id: string };
      const cart = (await caller.catalog.submitCart({
        items: [
          { itemId: a.id, formData: {} },
          { itemId: b.id, formData: {} },
        ],
      })) as { batchId: string; requests: { id: string; batchId: string | null }[] };
      expect(cart.requests.length).toBe(2);
      expect(cart.batchId).toBeDefined();
      expect(cart.requests.every((r) => r.batchId === cart.batchId)).toBe(true);
    });
  });

  // ── 8.36 Approvals ─────────────────────────────────────────────────────────

  describe("8.36 Approvals (ITSM-grade Seq 5)", () => {
    it("list + myPending + mySubmitted (API smoke)", async () => {
      const caller = await authedCaller(adminToken);
      const listed = await caller.approvals.list({ limit: 10 });
      expect(listed.items).toBeDefined();
      const pending = await caller.approvals.myPending();
      expect(Array.isArray(pending)).toBe(true);
      const submitted = await caller.approvals.mySubmitted();
      expect(Array.isArray(submitted)).toBe(true);
    });

    it("viewer cannot decide approval (approvals:approve)", async () => {
      const viewerCaller = await authedCaller(await createSession(orgCtx.viewerId));
      const fakeId = "00000000-0000-4000-8000-000000000001";
      await expect(
        viewerCaller.approvals.decide({
          requestId: fakeId,
          decision: "approved",
        }),
      ).rejects.toThrow(/FORBIDDEN|permission denied/i);
    });
  });

  // ── 8.37 Work orders ───────────────────────────────────────────────────────

  describe("8.37 Work orders (ITSM-grade Seq 2)", () => {
    it("create → list → get → state path → update → task → note → metrics", async () => {
      const caller = await authedCaller(adminToken);
      const t0 = Date.now();
      const wo = (await caller.workOrders.create({
        shortDescription: `ITSM WO fan replacement ${t0}`,
        type: "corrective",
        priority: "3_moderate",
        location: "DC-1",
      })) as { id: string; number: string; state?: string };
      expect(wo.number).toMatch(/^WO\d{7}$/);

      const listed = (await caller.workOrders.list({ limit: 20, state: "open" })) as {
        items: { id: string }[];
      };
      expect(listed.items.some((w) => w.id === wo.id)).toBe(true);

      let detail = (await caller.workOrders.get({ id: wo.id })) as {
        workOrder: { id: string; state: string };
        tasks: { id: string }[];
        activityLogs: { action: string }[];
      };
      expect(detail.workOrder.id).toBe(wo.id);
      expect(detail.activityLogs.some((a) => a.action === "created")).toBe(true);

      await caller.workOrders.updateState({
        id: wo.id,
        state: "work_in_progress",
        note: "Tech dispatched",
      });
      await caller.workOrders.update({
        id: wo.id,
        shortDescription: `ITSM WO fan replacement ${t0} (updated)`,
        location: "DC-1 / Rack A",
      });

      const task = (await caller.workOrders.addTask({
        workOrderId: wo.id,
        shortDescription: "Replace fan tray",
        estimatedHours: 1,
      })) as { id: string; number: string };
      expect(task.number).toMatch(/^T\d{4}$/);

      await caller.workOrders.updateTask({
        id: task.id,
        state: "work_in_progress",
        actualHours: 1,
      });

      await caller.workOrders.addNote({
        workOrderId: wo.id,
        note: "Spare on site",
        isInternal: true,
      });

      await caller.workOrders.updateState({ id: wo.id, state: "complete" });

      detail = (await caller.workOrders.get({ id: wo.id })) as {
        workOrder: { state: string };
        tasks: { state: string }[];
        activityLogs: { action: string }[];
      };
      expect(detail.workOrder.state).toBe("complete");
      expect(detail.tasks.some((x) => x.state === "work_in_progress")).toBe(true);

      const metrics = await caller.workOrders.metrics();
      expect(typeof metrics.total).toBe("number");
      expect(metrics).toHaveProperty("breached");
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

    it("matter create → list → get → close; request create → list → update", async () => {
      const caller = await authedCaller(adminToken);
      const matter = await caller.legal.createMatter({
        title: "Smoke matter",
        type: "commercial",
        confidential: false,
      }) as { id: string; matterNumber: string };
      expect(matter.matterNumber).toMatch(/^MAT-/);
      const matters = await caller.legal.listMatters({ limit: 20 });
      expect(matters.some((m: { id: string }) => m.id === matter.id)).toBe(true);
      const got = await caller.legal.getMatter({ id: matter.id });
      expect((got as { id: string }).id).toBe(matter.id);
      const closedM = await caller.legal.updateMatter({ id: matter.id, status: "closed" }) as { status: string };
      expect(closedM.status).toBe("closed");

      const req = await caller.legal.createRequest({
        title: "Smoke legal request",
        type: "policy",
        priority: "high",
      }) as { id: string };
      const reqs = await caller.legal.listRequests({ limit: 20 });
      expect(reqs.some((r: { id: string }) => r.id === req.id)).toBe(true);
      const updReq = await caller.legal.updateRequest({ id: req.id, status: "in_progress" }) as { status: string };
      expect(updReq.status).toBe("in_progress");
    });

    it("programme matrix + RPT CSV (US-LEG-007 / US-LEG-009+)", async () => {
      const caller = await authedCaller(adminToken);
      const matrix = await caller.legal.programmeMatrix();
      expect(Array.isArray(matrix)).toBe(true);
      expect(matrix.length).toBeGreaterThanOrEqual(24);
      await caller.legal.createRelatedPartyTransaction({
        counterpartyName: "Smoke RPT counterparty",
        amount: "1000",
        currency: "INR",
        status: "draft",
      });
      const csv = await caller.legal.exportRelatedPartyCsv();
      expect(csv).toContain("counterparty_name");
      expect(csv).toContain("Smoke RPT counterparty");
    });

    it("governanceSummary returns single composite round-trip with RBAC-scoped sections (US-LEG-001/002)", async () => {
      const caller = await authedCaller(adminToken);
      const summary = (await caller.legal.governanceSummary()) as {
        legal: {
          activeMatters: number;
          totalMatters: number;
          openRequests: number;
          openInvestigations: number;
        };
        secretarial: {
          upcomingMeetings: number;
          overdueFilings: number;
          upcomingFilings: number;
          totalDirectors: number;
          kycExpiring: number;
        } | null;
        contracts: {
          active: number;
          expiringSoon: number;
          indiaFormalitiesAttention: number;
          expiringWithin30: Array<{
            id: string;
            number: string | null;
            title: string;
            counterparty: string | null;
            endDate: string | null;
            status: string | null;
          }>;
        } | null;
        indiaCompliance: {
          overdue: number;
          dueWithin30: number;
          totalPenaltyInr: number;
          upcoming: Array<{
            id: string;
            eventName: string;
            mcaForm: string | null;
            complianceType: string;
            dueDate: string | null;
            status: string;
            daysOverdue: number;
            totalPenaltyInr: number;
          }>;
        } | null;
        generatedAt: string;
      };

      // US-LEG-002 AC: single round-trip with all sections present for the admin caller.
      expect(summary.legal).toBeDefined();
      expect(typeof summary.legal.activeMatters).toBe("number");
      expect(typeof summary.legal.totalMatters).toBe("number");
      // US-LEG-001 AC: secretarial truth (meetings/calendar/KYC) and contracts expiring surfaced.
      expect(summary.secretarial).not.toBeNull();
      expect(typeof summary.secretarial?.upcomingMeetings).toBe("number");
      expect(typeof summary.secretarial?.upcomingFilings).toBe("number");
      expect(typeof summary.secretarial?.kycExpiring).toBe("number");
      expect(summary.contracts).not.toBeNull();
      expect(Array.isArray(summary.contracts?.expiringWithin30)).toBe(true);
      expect(typeof summary.contracts?.expiringSoon).toBe("number");
      expect(typeof summary.contracts?.indiaFormalitiesAttention).toBe("number");
      // US-LEG-004 AC: india-compliance calendar surfaced under same secretarial gate.
      expect(summary.indiaCompliance).not.toBeNull();
      expect(typeof summary.indiaCompliance?.overdue).toBe("number");
      expect(typeof summary.indiaCompliance?.dueWithin30).toBe("number");
      expect(typeof summary.indiaCompliance?.totalPenaltyInr).toBe("number");
      expect(Array.isArray(summary.indiaCompliance?.upcoming)).toBe(true);
      expect(typeof summary.generatedAt).toBe("string");
    });

    it("governanceSummary surfaces india-compliance calendar items under secretarial gate (US-LEG-004)", async () => {
      // Seed an MCA filing item that's overdue + one that's due in next 30d, then
      // assert the hub composite returns counts, penalty rollup, and the upcoming preview.
      const caller = await authedCaller(adminToken);
      const overdueDue = new Date(Date.now() - 7 * 86400000).toISOString();
      const upcomingDue = new Date(Date.now() + 10 * 86400000).toISOString();

      await caller.indiaCompliance.calendar.create({
        complianceType: "annual",
        eventName: `MGT-7 annual return ${nanoid(4)}`,
        mcaForm: "MGT-7",
        dueDate: overdueDue,
        penaltyPerDayInr: 100,
      });
      await caller.indiaCompliance.calendar.create({
        complianceType: "event_based",
        eventName: `DIR-12 director change ${nanoid(4)}`,
        mcaForm: "DIR-12",
        dueDate: upcomingDue,
        penaltyPerDayInr: 100,
      });

      // Bust the 60s composite cache — `update*` mutations on calendar items don't
      // currently invalidate `legal.governanceSummary`, so we hit redis directly to
      // keep the test deterministic and not flaky behind the 60s TTL window.
      try {
        const { getRedis } = await import("../lib/redis.js");
        const redis = getRedis();
        const keys = await redis.keys(`legal:governanceSummary:v3:${orgCtx.orgId}:*`);
        if (keys.length) await redis.del(...keys);
      } catch {
        // Redis is best-effort in tests; if it's not available the helper falls back to live build.
      }

      const summary = (await caller.legal.governanceSummary()) as {
        indiaCompliance: {
          overdue: number;
          dueWithin30: number;
          upcoming: Array<{ eventName: string; status: string; mcaForm: string | null }>;
        } | null;
      };

      expect(summary.indiaCompliance).not.toBeNull();
      // The freshly-seeded items mean these counts must be at least 1 each.
      expect(summary.indiaCompliance!.dueWithin30).toBeGreaterThanOrEqual(1);
      // Overdue count depends on the periodic penalty job flipping status to 'overdue';
      // we don't run that here, so we just assert the upcoming preview surfaces our items.
      const forms = summary.indiaCompliance!.upcoming.map((u) => u.mcaForm);
      expect(forms).toEqual(expect.arrayContaining(["MGT-7", "DIR-12"]));
    });

    it("governanceSummary scopes secretarial/contracts sections by matrix role (US-LEG-002 RBAC)", async () => {
      // legal_counsel has legal:read + contracts:read but NO secretarial:read,
      // so secretarial section must come back as `null` even though contracts section is populated.
      const { userId: legalCounselId } = await seedUser(orgCtx.orgId, {
        email: `legal-counsel-${nanoid(4)}@qa.nexusops.io`,
        role: "member",
        matrixRole: "legal_counsel",
        password: orgCtx.password,
      });
      const lcToken = await createSession(legalCounselId);
      const lcCaller = await authedCaller(lcToken);

      const summary = (await lcCaller.legal.governanceSummary()) as {
        legal: { activeMatters: number };
        secretarial: unknown | null;
        contracts: { expiringSoon: number } | null;
      };

      expect(summary.legal).toBeDefined();
      expect(summary.secretarial).toBeNull();
      expect(summary.contracts).not.toBeNull();
      expect(typeof summary.contracts?.expiringSoon).toBe("number");
    });
  });

  // ── 8.51 Secretarial (ITSM-grade LG-3) ─────────────────────────────────────

  describe("8.51 Secretarial", () => {
    it("meeting create → list → get → updateStatus; filings + directors list", async () => {
      const caller = await authedCaller(adminToken);
      const when = new Date(Date.now() + 86400000).toISOString();
      const mtg = await caller.secretarial.meetings.create({
        title: "ITSM-grade board meeting",
        scheduledAt: when,
      }) as { id: string; number: string };
      expect(mtg.number).toMatch(/^BM-/);
      const listed = await caller.secretarial.meetings.list({});
      expect(listed.some((m: { id: string }) => m.id === mtg.id)).toBe(true);
      const detail = await caller.secretarial.meetings.get({ id: mtg.id }) as { meeting: { id: string } };
      expect(detail.meeting.id).toBe(mtg.id);
      const done = await caller.secretarial.meetings.updateStatus({
        id: mtg.id,
        status: "completed",
      }) as { status: string };
      expect(done.status).toBe("completed");

      const res = await caller.secretarial.resolutions.list({ meetingId: mtg.id });
      expect(Array.isArray(res)).toBe(true);
      const filings = await caller.secretarial.filings.list({});
      expect(Array.isArray(filings)).toBe(true);
      const dirs = await caller.secretarial.directors.list({});
      expect(Array.isArray(dirs)).toBe(true);
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

    it("period close: get + setClosedPeriods (US-FIN-007)", async () => {
      const caller = await authedCaller(adminToken);
      const before = (await caller.financial.periodClose.get()) as { closedPeriods: string[] };
      const prev = [...before.closedPeriods];
      await caller.financial.periodClose.setClosedPeriods({ periods: [...prev, "2099-06"].filter((v, i, a) => a.indexOf(v) === i).sort() });
      const mid = (await caller.financial.periodClose.get()) as { closedPeriods: string[] };
      expect(mid.closedPeriods).toContain("2099-06");
      await caller.financial.periodClose.setClosedPeriods({ periods: prev });
      const restored = (await caller.financial.periodClose.get()) as { closedPeriods: string[] };
      expect(restored.closedPeriods).toEqual(prev);
    });

    it("period close: preflight checklist (US-FIN-007 / US-CRM-007)", async () => {
      const caller = await authedCaller(adminToken);
      const r = (await caller.financial.periodClose.preflight({ period: "2099-01" })) as {
        period: string;
        checks: { key: string; ok: boolean }[];
        allClear: boolean;
      };
      expect(r.period).toBe("2099-01");
      expect(Array.isArray(r.checks)).toBe(true);
      expect(r.checks.some((c) => c.key === "open_ap")).toBe(true);
      expect(r.checks.some((c) => c.key === "period_not_closed")).toBe(true);
      expect(typeof r.allClear).toBe("boolean");
    });

    it("legal entity: create + AP/AR invoices list legalEntityCode (US-CRM-008 / US-FIN-008)", async () => {
      const caller = await authedCaller(adminToken);
      const suffix = nanoid(6);
      const le = (await caller.financial.createLegalEntity({
        code: `LE-${suffix}`,
        name: `Smoke Legal Entity ${suffix}`,
      })) as { id: string; code: string };

      const entities = (await caller.financial.listLegalEntities()) as { id: string; code: string }[];
      expect(entities.some((e) => e.id === le.id && e.code === le.code)).toBe(true);

      const vendor = (await caller.procurement.vendors.create({
        name: "LE smoke AP vendor",
        contactEmail: `le-ap-${suffix}@vendor.test`,
      })) as { id: string };
      const apInv = (await caller.financial.createInvoice({
        vendorId: vendor.id,
        invoiceNumber: `LE-AP-${suffix}`,
        amount: "100",
        legalEntityId: le.id,
      })) as { id: string };

      const apPage = (await caller.financial.listInvoices({
        direction: "payable",
        limit: 100,
      })) as { items: Array<{ id: string; legalEntityCode: string | null }> };
      const apRow = apPage.items.find((r) => r.id === apInv.id);
      expect(apRow?.legalEntityCode).toBe(le.code);

      const customer = (await caller.procurement.vendors.create({
        name: "LE smoke AR customer",
        contactEmail: `le-ar-${suffix}@cust.test`,
      })) as { id: string };
      const arInv = (await caller.financial.createReceivableInvoice({
        customerVendorId: customer.id,
        invoiceNumber: `LE-AR-${suffix}`,
        amount: "200",
        legalEntityId: le.id,
      })) as { id: string };

      const arPage = (await caller.financial.listInvoices({
        direction: "receivable",
        limit: 100,
      })) as { items: Array<{ id: string; legalEntityCode: string | null }> };
      const arRow = arPage.items.find((r) => r.id === arInv.id);
      expect(arRow?.legalEntityCode).toBe(le.code);
    });

    it("SoD: same user cannot approve and mark paid (US-FIN-006 / US-SEC-008)", async () => {
      const financeToken = await createSession(orgCtx.financeId);
      const financeCaller = await authedCaller(financeToken);
      const adminCaller = await authedCaller(adminToken);
      const vendor = (await adminCaller.procurement.vendors.create({
        name: "SoD Layer8 vendor",
        contactEmail: `sod-l8-${Date.now()}@vendor.test`,
      })) as { id: string };
      const inv = (await adminCaller.financial.createInvoice({
        vendorId: vendor.id,
        invoiceNumber: `SOD-L8-${Date.now()}`,
        amount: "2500",
      })) as { id: string };
      await financeCaller.financial.approveInvoice({ id: inv.id });
      await expect(
        financeCaller.financial.markPaid({ id: inv.id, paymentMethod: "transfer" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      const paid = (await adminCaller.financial.markPaid({
        id: inv.id,
        paymentMethod: "transfer",
      })) as { status: string };
      expect(paid.status).toBe("paid");
    });

    it("MFA matrix policy blocks approve until admin enrolls user (US-SEC-001)", async () => {
      const financeToken = await createSession(orgCtx.financeId);
      const financeCaller = await authedCaller(financeToken);
      const adminCaller = await authedCaller(adminToken);

      await adminCaller.admin.securityPolicy.update({
        requireMfaForMatrixRoles: ["finance_manager"],
      });

      const vendor = (await adminCaller.procurement.vendors.create({
        name: "MFA Layer8 vendor",
        contactEmail: `mfa-l8-${Date.now()}@vendor.test`,
      })) as { id: string };
      const inv = (await adminCaller.financial.createInvoice({
        vendorId: vendor.id,
        invoiceNumber: `MFA-L8-${Date.now()}`,
        amount: "100",
      })) as { id: string };

      await expect(financeCaller.financial.approveInvoice({ id: inv.id })).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "MFA_ENROLLMENT_REQUIRED",
      });

      await adminCaller.admin.users.update({
        userId: orgCtx.financeId,
        mfaEnrolled: true,
      });

      const approved = (await financeCaller.financial.approveInvoice({ id: inv.id })) as { status: string };
      expect(approved.status).toBe("approved");

      await adminCaller.admin.users.update({ userId: orgCtx.financeId, mfaEnrolled: false });
      await adminCaller.admin.securityPolicy.update({ requireMfaForMatrixRoles: [] });
    });

    it("FP depth: budget line → variance; vendor → invoice → approve; AP aging", async () => {
      const caller = await authedCaller(adminToken);
      const fy = new Date().getFullYear();
      const line = (await caller.financial.createBudgetLine({
        category: "IT Operations (smoke)",
        fiscalYear: fy,
        budgeted: "100000",
      })) as { id: string };
      const budgetRows = (await caller.financial.listBudget({ fiscalYear: fy })) as { id: string }[];
      expect(budgetRows.some((b) => b.id === line.id)).toBe(true);
      const variance = (await caller.financial.getBudgetVariance({ fiscalYear: fy })) as unknown[];
      expect(Array.isArray(variance)).toBe(true);

      const vendor = (await caller.procurement.vendors.create({
        name: "FP Layer8 vendor",
        contactEmail: `fp-l8-${Date.now()}@vendor.test`,
      })) as { id: string };
      const inv = (await caller.financial.createInvoice({
        vendorId: vendor.id,
        invoiceNumber: `INV-L8-${Date.now()}`,
        amount: "5000",
      })) as { id: string; status: string };
      expect(inv.status).toMatch(/pending/i);
      const approved = (await caller.financial.approveInvoice({ id: inv.id })) as { status: string };
      expect(approved.status).toBe("approved");
      const aging = await caller.financial.apAging();
      expect(aging && typeof aging === "object").toBe(true);
    });

    it("receivable invoice → listInvoices shape; expenseReports.create + listReports", async () => {
      const caller = await authedCaller(adminToken);
      const customer = (await caller.procurement.vendors.create({
        name: "Layer8 AR customer",
        contactEmail: `ar-l8-${Date.now()}@cust.test`,
      })) as { id: string };
      const rec = (await caller.financial.createReceivableInvoice({
        customerVendorId: customer.id,
        invoiceNumber: `AR-L8-${Date.now()}`,
        amount: "1200.50",
      })) as { id: string };

      const arPage = (await caller.financial.listInvoices({
        direction: "receivable",
        limit: 50,
      })) as {
        items: Array<{
          id: string;
          direction: string;
          totalAmount: string;
          vendorName: string | null;
        }>;
      };
      const row = arPage.items.find((r) => r.id === rec.id);
      expect(row).toBeDefined();
      expect(row!.direction).toBe("receivable");
      expect(String(row!.totalAmount)).toBe("1200.50");
      expect(row!.vendorName).toBeTruthy();

      await caller.expenseReports.createReport({
        title: "L8 expense report smoke",
        currency: "USD",
      });
      const reports = await caller.expenseReports.listReports({ limit: 30 });
      expect(Array.isArray(reports)).toBe(true);
      expect(
        (reports as { title: string }[]).some((r) => r.title === "L8 expense report smoke"),
      ).toBe(true);
    });
  });

  // ── 8.53 Inventory (Seq 22 — ITSM-grade depth) ─────────────────────────────

  describe("8.53 Inventory", () => {
    it("create → list → intake → issue → reorder → transactions", async () => {
      const caller = await authedCaller(adminToken);
      const item = (await caller.inventory.create({
        partNumber: `L8-INV-${Date.now()}`,
        name: "Layer8 spare",
        qty: 10,
        minQty: 2,
        category: "spare",
      })) as { id: string; qty: number };
      expect(item.qty).toBe(10);
      const page = (await caller.inventory.list({ limit: 100 })) as { items: { id: string }[] };
      expect(page.items.some((i) => i.id === item.id)).toBe(true);

      await caller.inventory.intake({ itemId: item.id, qty: 5, notes: "Receipt" });
      await caller.inventory.issueStock({ itemId: item.id, qty: 3, notes: "WO consumption" });
      await caller.inventory.reorder({ itemId: item.id, qty: 20 });

      const txs = (await caller.inventory.transactions({ itemId: item.id, limit: 20 })) as { type: string }[];
      expect(Array.isArray(txs)).toBe(true);
      expect(txs.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ── 8.54 Accounting (Seq 23 — ITSM-grade depth) ────────────────────────────

  describe("8.54 Accounting", () => {
    it("COA seed → journal create/post → trial balance; GSTIN; GSTR-3B", async () => {
      const caller = await authedCaller(adminToken);
      const seed = (await caller.accounting.coa.seed()) as { seeded: number };
      expect(seed.seeded).toBeGreaterThanOrEqual(0);

      const rows = (await caller.accounting.coa.list({ activeOnly: true })) as { id: string; code: string }[];
      expect(rows.length).toBeGreaterThan(0);
      const cash = rows.find((a) => a.code === "1110");
      const ap = rows.find((a) => a.code === "2110");
      expect(cash?.id && ap?.id).toBeTruthy();

      const je = (await caller.accounting.journal.create({
        date: new Date(),
        description: "Smoke balanced JE",
        lines: [
          { accountId: cash!.id, debitAmount: 500, creditAmount: 0 },
          { accountId: ap!.id, debitAmount: 0, creditAmount: 500 },
        ],
      })) as { id: string; status: string };
      expect(je.status).toBe("draft");
      const posted = (await caller.accounting.journal.post({ id: je.id })) as { status: string };
      expect(posted.status).toBe("posted");

      const tb = (await caller.accounting.trialBalance({})) as { isBalanced: boolean };
      expect(typeof tb.isBalanced).toBe("boolean");

      const gstinDigits = String(Math.floor(1000 + Math.random() * 9000));
      const gstinStr = `29ABCDE${gstinDigits}F1Z5`;
      const gstin = (await caller.accounting.gstin.create({
        gstin: gstinStr,
        legalName: "Smoke GSTIN Org",
        stateCode: "29",
        isPrimary: true,
      })) as { id: string };

      const g3 = (await caller.accounting.gstr.generateGSTR3B({
        gstinId: gstin.id,
        month: 3,
        year: 2025,
      })) as { gstin?: string };
      expect(g3.gstin).toBe(gstinStr);
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

    it("assets.cmdb.bulkImportCis upserts by external key (US-ITSM-006)", async () => {
      const caller = await authedCaller(adminToken);
      const key = `CI-BULK-${nanoid(8)}`;
      const first = (await caller.assets.cmdb.bulkImportCis({
        items: [
          {
            externalKey: key,
            name: "Bulk server v1",
            ciType: "server",
            status: "operational",
          },
        ],
      })) as { items: Array<{ id: string; name: string }> };
      expect(first.items[0]?.name).toBe("Bulk server v1");

      const second = (await caller.assets.cmdb.bulkImportCis({
        items: [
          {
            externalKey: key,
            name: "Bulk server v2",
            ciType: "server",
          },
        ],
      })) as { items: Array<{ id: string; name: string }> };
      expect(second.items[0]?.id).toBe(first.items[0]?.id);
      expect(second.items[0]?.name).toBe("Bulk server v2");
    });

    it("assets.cmdb.getServiceMap returns hop-bounded subgraph (US-ITSM-006)", async () => {
      const caller = await authedCaller(adminToken);
      const a = (await caller.assets.cmdb.createCi({
        name: "sm-map-a",
        ciType: "server",
      })) as { id: string };
      const b = (await caller.assets.cmdb.createCi({
        name: "sm-map-b",
        ciType: "application",
      })) as { id: string };
      const c = (await caller.assets.cmdb.createCi({
        name: "sm-map-c",
        ciType: "database",
      })) as { id: string };
      await caller.assets.cmdb.linkCi({ sourceId: b.id, targetId: a.id, relationType: "runs_on" });
      await caller.assets.cmdb.linkCi({ sourceId: c.id, targetId: b.id, relationType: "depends_on" });

      const shallow = (await caller.assets.cmdb.getServiceMap({
        rootCiId: b.id,
        maxDepth: 0,
        maxNodes: 50,
      })) as { nodes: { id: string }[]; edges: { id: string }[] };
      expect(shallow.nodes).toHaveLength(1);
      expect(shallow.edges).toHaveLength(0);

      const mid = (await caller.assets.cmdb.getServiceMap({
        rootCiId: b.id,
        maxDepth: 1,
        maxNodes: 50,
      })) as { nodes: { id: string }[]; edges: unknown[] };
      expect(mid.nodes.length).toBe(3);
      expect(mid.edges.length).toBeGreaterThanOrEqual(2);
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
      const hc = await caller.workforce.headcount({ days: 180, scope: "org" });
      expect(typeof hc.total).toBe("number");
      expect(hc.scope).toBe("org");
      const tenure = await caller.workforce.tenure();
      expect(Array.isArray(tenure)).toBe(true);
      const grades = await caller.workforce.gradeDistribution();
      expect(grades).toHaveProperty("byJobGrade");
      expect(grades).toHaveProperty("byDepartment");
    });

    it("ITSM executive scorecard + SNOW dry-run (US-ITSM-009)", async () => {
      const caller = await authedCaller(adminToken);
      const score = await caller.reports.itsmExecutiveScorecard();
      expect(score).toHaveProperty("openTickets");
      const dry = await caller.integrations.serviceNowImportDryRun({
        entity: "incident",
        rows: [{ sys_id: "abc", short_description: "x" }],
      });
      expect(dry.wouldCreate).toBeGreaterThanOrEqual(1);
    });

    it("security: vuln import idempotency + SIEM preview (US-SEC-003/005)", async () => {
      const caller = await authedCaller(adminToken);
      const fp = `layer8-fp-${Date.now()}`;
      const a = await caller.security.importVulnerabilities({
        source: "layer8",
        findings: [{ fingerprint: fp, title: "Smoke CVE", severity: "high", remediationSlaDays: 14 }],
      });
      expect(a.created.length).toBe(1);
      const b = await caller.security.importVulnerabilities({
        source: "layer8",
        findings: [{ fingerprint: fp, title: "Smoke CVE updated", severity: "medium" }],
      });
      expect(b.updated.length).toBe(1);
      const preview = await caller.security.siemExportPreview({ limit: 5 });
      expect(preview.schema).toContain("siem_preview");
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
