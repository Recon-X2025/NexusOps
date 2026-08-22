/**
 * Cross-tenant isolation tests (Phase 6 — GA hardening, audit finding #1).
 *
 * Tenant isolation is enforced today by hand-written `eq(table.orgId, ctx.org.id)`
 * at every query site (~716 across the routers). It is consistent, but a single
 * omitted clause in a new endpoint would silently leak or mutate another tenant's
 * data. These tests lock that invariant in at the API boundary: they seed two
 * fully independent orgs (A and B) and assert that org-B's authenticated caller
 * can never READ, UPDATE, or otherwise act on a record owned by org-A.
 *
 * They run through the real tRPC procedures (not raw SQL) so they verify the
 * application-layer scoping that the routers actually rely on. A regression that
 * drops an `orgId` predicate will turn a NOT_FOUND into a cross-tenant hit and
 * fail here.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  createSession,
  cleanupOrg,
  testDb,
} from "./helpers";
import {
  chartOfAccounts,
  tickets,
  ticketWatchers,
  contractObligations,
  documents,
  vendors,
  surveyResponses,
  workOrderActivityLogs,
  documentAcls,
  eq,
  and,
} from "@coheronconnect/db";

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL not set. Run: pnpm docker:test:up && source apps/api/.env.test",
    );
  }
});

describe.sequential("cross-tenant isolation", () => {
  let orgA: Awaited<ReturnType<typeof seedFullOrg>>;
  let orgB: Awaited<ReturnType<typeof seedFullOrg>>;
  let callerA: Awaited<ReturnType<typeof authedCaller>>;
  let callerB: Awaited<ReturnType<typeof authedCaller>>;

  beforeAll(async () => {
    await initTestEnvironment();
    orgA = await seedFullOrg();
    orgB = await seedFullOrg();
    callerA = await authedCaller(await createSession(orgA.adminId));
    callerB = await authedCaller(await createSession(orgB.adminId));
  });

  afterAll(async () => {
    await cleanupOrg(orgA.orgId);
    await cleanupOrg(orgB.orgId);
  });

  // ── Tickets: read + update ────────────────────────────────────────────────

  it("a ticket created in org A is invisible to org B (get → NOT_FOUND)", async () => {
    const created = (await callerA.tickets.create({
      title: "Org A confidential incident",
      type: "incident",
      priorityId: orgA.p1Id!,
      statusId: orgA.statusOpenId!,
    })) as { id: string };

    // Org A owns it. (`tickets.get` returns a detail envelope: { ticket, ... }.)
    const ownView = (await callerA.tickets.get({ id: created.id })) as {
      ticket: { id: string; orgId: string };
    };
    expect(ownView.ticket.id).toBe(created.id);
    expect(ownView.ticket.orgId).toBe(orgA.orgId);

    // Org B must not be able to read it.
    await expect(callerB.tickets.get({ id: created.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("org B cannot update a ticket owned by org A (update → NOT_FOUND, row unchanged)", async () => {
    const created = (await callerA.tickets.create({
      title: "Org A original title",
      type: "incident",
      priorityId: orgA.p1Id!,
      statusId: orgA.statusOpenId!,
    })) as { id: string };

    await expect(
      callerB.tickets.update({ id: created.id, data: { title: "Hijacked by org B" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // The underlying row must be untouched.
    const db = testDb();
    const [row] = await db
      .select({ title: tickets.title, orgId: tickets.orgId })
      .from(tickets)
      .where(eq(tickets.id, created.id));
    expect(row?.title).toBe("Org A original title");
    expect(row?.orgId).toBe(orgA.orgId);
  });

  it("org B cannot reassign a ticket owned by org A (assign → NOT_FOUND)", async () => {
    const created = (await callerA.tickets.create({
      title: "Org A assignment target",
      type: "incident",
      priorityId: orgA.p1Id!,
      statusId: orgA.statusOpenId!,
    })) as { id: string };

    // Org B tries to assign org A's ticket to org B's own user.
    await expect(
      callerB.tickets.assign({ id: created.id, assigneeId: orgB.agentId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("tickets.list does not surface another org's ticket", async () => {
    const created = (await callerA.tickets.create({
      title: "Org A list-scope probe",
      type: "incident",
      priorityId: orgA.p1Id!,
      statusId: orgA.statusOpenId!,
    })) as { id: string };

    // Org A's own list includes it; org B's list never does.
    const listA = (await callerA.tickets.list({})) as { items: Array<{ id: string }> };
    expect(listA.items.some((t) => t.id === created.id)).toBe(true);

    const listB = (await callerB.tickets.list({})) as { items: Array<{ id: string }> };
    expect(listB.items.some((t) => t.id === created.id)).toBe(false);
  });

  it("org B cannot watch a ticket owned by org A (toggleWatch → NOT_FOUND, no watcher row)", async () => {
    const created = (await callerA.tickets.create({
      title: "Org A watch target",
      type: "incident",
      priorityId: orgA.p1Id!,
      statusId: orgA.statusOpenId!,
    })) as { id: string };

    // toggleWatch has no orgId column on ticket_watchers; the parent-ticket org
    // check is what stops a cross-tenant watcher insert.
    await expect(
      callerB.tickets.toggleWatch({ ticketId: created.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // No watcher row should have been created for org B's user.
    const db = testDb();
    const rows = await db
      .select({ ticketId: ticketWatchers.ticketId })
      .from(ticketWatchers)
      .where(
        and(eq(ticketWatchers.ticketId, created.id), eq(ticketWatchers.userId, orgB.adminId)),
      );
    expect(rows.length).toBe(0);
  });

  // ── Accounting: cross-tenant mutation must be a no-op ──────────────────────

  it("org B cannot mutate a chart-of-accounts row owned by org A (update is a no-op)", async () => {
    const acct = (await callerA.accounting.coa.create({
      code: `CT-${Date.now()}`,
      name: "Org A Cash",
      type: "asset",
    })) as { id: string };

    // Org B issues the same update; the orgId predicate must match zero rows,
    // so nothing is returned and the original name is preserved.
    const result = await callerB.accounting.coa.update({
      id: acct.id,
      name: "Org B overwrote this",
    });
    expect(result).toBeUndefined();

    const db = testDb();
    const [row] = await db
      .select({ name: chartOfAccounts.name, orgId: chartOfAccounts.orgId })
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.id, acct.id));
    expect(row?.name).toBe("Org A Cash");
    expect(row?.orgId).toBe(orgA.orgId);
  });

  it("each org's coa.list is disjoint (no leakage of the other org's accounts)", async () => {
    const codeA = `LA-${Date.now()}`;
    await callerA.accounting.coa.create({ code: codeA, name: "Org A only", type: "asset" });

    const listB = (await callerB.accounting.coa.list({})) as Array<{
      code: string;
      orgId?: string;
    }>;
    expect(listB.some((a) => a.code === codeA)).toBe(false);

    // Sanity: confirm org A's row really exists, scoped to org A.
    const db = testDb();
    const [row] = await db
      .select({ orgId: chartOfAccounts.orgId })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.code, codeA), eq(chartOfAccounts.orgId, orgA.orgId)));
    expect(row?.orgId).toBe(orgA.orgId);
  });
});

// ── Child-resource cross-tenant mutations (Phase 6 audit fixes) ─────────────
//
// These cover the routers whose UPDATE/DELETE mutations addressed rows by primary
// id without an org predicate, where org ownership is reached through a parent FK
// (or, for OKR/devops, an orgId column). Each asserts org B cannot mutate a child
// owned by org A — and, where applicable, cannot attach a child to org A's parent.
describe.sequential("cross-tenant isolation — child resources", () => {
  let orgA: Awaited<ReturnType<typeof seedFullOrg>>;
  let orgB: Awaited<ReturnType<typeof seedFullOrg>>;
  let callerA: Awaited<ReturnType<typeof authedCaller>>;
  let callerB: Awaited<ReturnType<typeof authedCaller>>;

  beforeAll(async () => {
    await initTestEnvironment();
    orgA = await seedFullOrg();
    orgB = await seedFullOrg();
    callerA = await authedCaller(await createSession(orgA.adminId));
    callerB = await authedCaller(await createSession(orgB.adminId));
  });

  afterAll(async () => {
    await cleanupOrg(orgA.orgId);
    await cleanupOrg(orgB.orgId);
  });

  // ── Contracts: completeObligation ─────────────────────────────────────────
  it("org B cannot complete an obligation owned by org A (NOT_FOUND, row unchanged)", async () => {
    const contract = (await callerA.contracts.createFromWizard({
      title: "Org A MSA",
      counterparty: "Acme",
      type: "vendor",
      obligations: [{ title: "Quarterly review", party: "Acme", frequency: "quarterly" }],
    })) as { id: string };

    // Read the obligation id directly from the DB (the createFromWizard return
    // is the contract, not the obligation; listObligations has an unrelated
    // single-id ANY() bug we don't want to depend on here).
    const db = testDb();
    const [ob] = await db
      .select({ id: contractObligations.id, status: contractObligations.status })
      .from(contractObligations)
      .where(eq(contractObligations.contractId, contract.id));
    expect(ob).toBeDefined();

    await expect(
      callerB.contracts.completeObligation({ id: ob!.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // The underlying row must be untouched.
    const [row] = await db
      .select({ status: contractObligations.status, completedAt: contractObligations.completedAt })
      .from(contractObligations)
      .where(eq(contractObligations.id, ob!.id));
    expect(row?.status).not.toBe("completed");
    expect(row?.completedAt).toBeNull();
  });

  // ── Projects: milestones + tasks (create + update) ────────────────────────
  it("org B cannot create or update a milestone under org A's project", async () => {
    const project = (await callerA.projects.create({ name: "Org A project" })) as { id: string };

    // create: org B cannot attach a milestone to org A's project
    await expect(
      callerB.projects.createMilestone({ projectId: project.id, title: "Injected" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // org A creates its own milestone
    const ms = (await callerA.projects.createMilestone({
      projectId: project.id,
      title: "Org A milestone",
    })) as { id: string };

    // update: org B cannot mutate org A's milestone
    await expect(
      callerB.projects.updateMilestone({ id: ms.id, status: "completed" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("org B cannot create or update a task under org A's project", async () => {
    const project = (await callerA.projects.create({ name: "Org A project (tasks)" })) as { id: string };

    await expect(
      callerB.projects.createTask({ projectId: project.id, title: "Injected task" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const task = (await callerA.projects.createTask({
      projectId: project.id,
      title: "Org A task",
    })) as { id: string };

    await expect(
      callerB.projects.updateTask({ id: task.id, status: "done" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // ── Assets: license assignment revoke ─────────────────────────────────────
  it("org B cannot revoke a license assignment owned by org A (NOT_FOUND)", async () => {
    const license = (await callerA.assets.licenses.create({
      productName: "Org A SaaS",
      totalSeats: 5,
    })) as { id: string };
    const assignment = (await callerA.assets.licenses.assign({
      licenseId: license.id,
      userId: orgA.agentId,
    })) as { id: string };

    await expect(
      callerB.assets.licenses.revoke({ assignmentId: assignment.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // ── DevOps: completePipeline + completeDeployment ─────────────────────────
  it("org B cannot complete a pipeline run owned by org A (no-op, row unchanged)", async () => {
    const run = (await callerA.devops.createPipelineRun({ pipelineName: "Org A CI" })) as { id: string };

    const result = await callerB.devops.completePipeline({ id: run.id, status: "success" });
    expect(result).toBeUndefined();

    // org A's run is still "running".
    const listA = (await callerA.devops.listPipelines({})) as Array<{ id: string; status: string }>;
    expect(listA.find((r) => r.id === run.id)?.status).toBe("running");
  });

  it("org B cannot complete a deployment owned by org A (no-op, row unchanged)", async () => {
    const dep = (await callerA.devops.createDeployment({
      appName: "Org A app",
      version: "1.0.0",
    })) as { id: string };

    const result = await callerB.devops.completeDeployment({ id: dep.id, status: "success" });
    expect(result).toBeUndefined();

    const listA = (await callerA.devops.listDeployments({})) as Array<{ id: string; status: string }>;
    expect(listA.find((d) => d.id === dep.id)?.status).not.toBe("success");
  });

  // ── HR / OKR: updateKeyResult ─────────────────────────────────────────────
  it("org B cannot update a key result owned by org A (no-op, row unchanged)", async () => {
    const objective = (await callerA.hr.okr.createObjective({
      title: "Org A objective",
      ownerId: orgA.adminId,
      year: new Date().getFullYear(),
    })) as { id: string };
    const kr = (await callerA.hr.okr.createKeyResult({
      objectiveId: objective.id,
      title: "Org A KR",
      targetValue: 100,
    })) as { id: string; currentValue: string };

    const result = await callerB.hr.okr.updateKeyResult({ id: kr.id, currentValue: 99 });
    expect(result).toBeUndefined();

    // org B also cannot attach a KR to org A's objective.
    await expect(
      callerB.hr.okr.createKeyResult({ objectiveId: objective.id, title: "Injected KR" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  // ── No-`org_id` child tables (isolation sweep, 2026-08-22) ────────────────
  //
  // 40 tables carry no `org_id` and so have no RLS behind them; the app-layer
  // filter is their only wall. These three handlers take a parent id straight
  // from input and never check whose org that parent is in. Each case writes as
  // org B onto an org-A parent and then asserts through ORG A's OWN read path —
  // the point is not that B sees A's data, it is that B can put a row into A's.

  it("org B cannot submit a survey response onto org A's survey", async () => {
    const survey = (await callerA.surveys.create({
      title: "Org A CSAT",
      type: "csat",
      questions: [{ id: "q1", type: "rating", question: "How did we do?", required: true }],
    })) as { id: string };

    // Org B posts onto org A's survey id.
    await expect(
      callerB.surveys.submit({ surveyId: survey.id, answers: { q1: "1" }, score: "1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Org A's own results screen must not have counted it.
    const results = (await callerA.surveys.getResults({ id: survey.id })) as {
      totalResponses: number;
      averageScore: string | null;
      responses: Array<{ respondentId: string | null }>;
    };
    expect(results.totalResponses).toBe(0);
    expect(results.averageScore).toBeNull();
    expect(results.responses).toHaveLength(0);

    // And no row exists at all, since survey_responses has no RLS to fall back on.
    const rows = await testDb()
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.surveyId, survey.id));
    expect(rows).toHaveLength(0);
  });

  it("org B cannot add a note to org A's work order", async () => {
    const wo = (await callerA.workOrders.create({
      shortDescription: "Org A work order",
      type: "corrective",
      priority: "4_low",
    })) as { id: string };

    await expect(
      callerB.workOrders.addNote({ workOrderId: wo.id, note: "Injected by org B" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Org A's detail view reads activity logs by workOrderId alone.
    const detail = (await callerA.workOrders.get({ id: wo.id })) as {
      activityLogs: Array<{ note: string | null }>;
    };
    expect(detail.activityLogs.some((l) => l.note === "Injected by org B")).toBe(false);

    const logs = await testDb()
      .select()
      .from(workOrderActivityLogs)
      .where(eq(workOrderActivityLogs.workOrderId, wo.id));
    expect(logs.some((l) => l.note === "Injected by org B")).toBe(false);
  });

  it("org B cannot grant an ACL on org A's document", async () => {
    // Seeded directly rather than through `documents.upload`, which calls S3 and
    // is not configured under vitest. This case is about the ACL write path only.
    const [doc] = await testDb()
      .insert(documents)
      .values({
        orgId: orgA.orgId,
        name: "org-a-confidential.txt",
        mimeType: "text/plain",
        sizeBytes: 10,
        storageKey: `test/${orgA.orgId}/org-a-confidential.txt`,
        sha256: "0".repeat(64),
        classification: "confidential",
      })
      .returning();

    await expect(
      callerB.documents.grantAcl({
        documentId: doc!.id,
        principalType: "everyone_in_org",
        permission: "read",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // document_acls has no org_id, so the row itself is the only observable.
    const acls = await testDb()
      .select()
      .from(documentAcls)
      .where(eq(documentAcls.documentId, doc!.id));
    expect(acls).toHaveLength(0);
  });
  // ── Secondary references (same sweep): parent guarded, reference was not ───

  it("org B's user cannot be assigned to org A's ticket", async () => {
    const created = (await callerA.tickets.create({
      title: "Org A ticket for assignment",
      type: "incident",
      priorityId: orgA.p1Id!,
      statusId: orgA.statusOpenId!,
    })) as { id: string };

    // The ticket is org A's and the caller is org A — only the ASSIGNEE is foreign.
    await expect(
      callerA.tickets.assign({ id: created.id, assigneeId: orgB.adminId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const [row] = await testDb().select().from(tickets).where(eq(tickets.id, created.id));
    expect(row!.assigneeId).not.toBe(orgB.adminId);
  });

  it("org A cannot grant a document ACL to a principal from org B", async () => {
    const [doc] = await testDb()
      .insert(documents)
      .values({
        orgId: orgA.orgId,
        name: "org-a-acl-principal.txt",
        mimeType: "text/plain",
        sizeBytes: 10,
        storageKey: `test/${orgA.orgId}/org-a-acl-principal.txt`,
        sha256: "1".repeat(64),
      })
      .returning();

    // Document is org A's; the PRINCIPAL is org B's user.
    await expect(
      callerA.documents.grantAcl({
        documentId: doc!.id,
        principalType: "user",
        principalId: orgB.adminId,
        permission: "read",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const acls = await testDb()
      .select()
      .from(documentAcls)
      .where(eq(documentAcls.documentId, doc!.id));
    expect(acls).toHaveLength(0);
  });
  // ── The invoice twins: canonical + deprecated, guarded separately ─────────
  //
  // Not an exposure — the read-back joins are RLS-filtered — but a foreign
  // vendor resolved `undefined`, leaving the buyer state unknown, which defaults
  // to an intra-state CGST/SGST split. Wrong tax on a dangling reference.
  // Both are asserted because a guard on one twin and not the other leaves the
  // defect fully reachable.

  it("neither invoice procedure accepts a vendor from another org", async () => {
    const [foreignVendor] = await testDb()
      .insert(vendors)
      .values({ orgId: orgB.orgId, name: "Org B Supplies Pvt Ltd" })
      .returning();

    // canonical
    await expect(
      callerA.financial.createInvoice({
        vendorId: foreignVendor!.id,
        invoiceNumber: `INV-XT-${Date.now()}`,
        amount: "1000",
        gstRate: 18,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // deprecated twin
    await expect(
      callerA.financial.createGSTInvoice({
        vendorId: foreignVendor!.id,
        invoiceNumber: `GST-XT-${Date.now()}`,
        invoiceDate: new Date(),
        supplierGstin: "29BBBBB1111B1Z3",
        placeOfSupply: "29",
        orgState: "29",
        vendorState: "29",
        lineItems: [
          { description: "Widget", quantity: 1, unitPrice: 1000, gstRate: 18 as const },
        ],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
